import { clientDocument } from './document.js';
import { Engine } from '../engine/engine.js';
import { serializeNode } from '../engine/scene.js';
import { Player } from './players.js';
import { encode, decode, packet } from './codec.js';

/** Transport-independent authority: the exact same simulation backs Studio and WebSocket hosts. */
export class GameServer {
  constructor(project, options = {}) {
    if (!project.multiplayer) throw new Error('Enable multiplayer in project settings first');
    this.peers = new Map();
    this.engine = new Engine(project, { role: 'server', network: this, onLog: options.onLog });
    this.engine.start();
    this.elapsed = 0;
  }
  connect(send, name = 'Player') {
    if (this.peers.size >= 32) throw new Error('Server full (32 players)');
    const player = new Player(
      crypto.randomUUID(),
      String(name)
        .replace(/[^\w -]/g, '')
        .slice(0, 24) || 'Player',
      (error) => this.engine.log('error', error.message),
    );
    const peer = {
      player,
      send,
      ready: false,
      tokens: 120,
      movementAt: new Map(),
      previous: new Map(),
    };
    this.peers.set(player.UserId, peer);
    this.engine.players.add(player);
    peer.ready = true;
    send({ type: 'welcome', userId: player.UserId, project: this.clientProject() });
    this.sendSnapshot();
    return {
      userId: player.UserId,
      receive: (message) => this.receive(peer, message),
      close: () => this.disconnect(peer),
    };
  }
  disconnect(peer) {
    if (!this.peers.delete(peer.player.UserId)) return;
    this.engine.players.remove(peer.player);
    for (const node of this.engine.nodes)
      if (node._networkOwner === peer.player.UserId) node._networkOwner = null;
    this.sendSnapshot();
  }
  clientProject() {
    return clientDocument({
      ...this.engine.project,
      services: this.engine.root.GetChildren().map(serializeNode),
    });
  }

  snapshot() {
    const project = this.clientProject();
    const nodes = new Map([...this.engine.nodes].map((n) => [n.Id, n]));
    const enrich = (node) => {
      const live = nodes.get(node.id);
      node.owner = live._networkOwner;
      node.leased = live._networkOwnerSet;
      node.epoch = live._networkEpoch;
      if (live._body) node.Velocity = { ...live.Velocity };
      node.children.forEach(enrich);
    };
    project.services.forEach(enrich);
    return {
      type: 'snapshot',
      gravity: { ...this.engine.physicsWorld.getGravity() },
      services: project.services,
      players: this.engine.players
        .GetPlayers()
        .map((p) => ({ id: p.UserId, name: p.Name, character: p.Character?.Id || null })),
    };
  }
  sendSnapshot() {
    const message = this.snapshot();
    const flat = new Map();
    const visit = (node, parent = null) => {
      const data = { ...node, parent, children: node.children.map((child) => child.id) };
      flat.set(node.id, { data, text: JSON.stringify(data) });
      node.children.forEach((child) => visit(child, node.id));
    };
    message.services.forEach((node) => visit(node));
    for (const peer of this.peers.values())
      if (peer.ready) {
        if (!peer.previous.size) peer.send(message);
        else
          peer.send({
            type: 'patch',
            nodes: [...flat]
              .filter(([id, value]) => peer.previous.get(id) !== value.text)
              .map(([, value]) => value.data),
            removed: [...peer.previous.keys()].filter((id) => !flat.has(id)),
            players: message.players,
            gravity: message.gravity,
          });
        peer.previous = new Map([...flat].map(([id, value]) => [id, value.text]));
      }
  }
  receive(peer, message) {
    if (!this.peers.has(peer.player.UserId)) return;
    try {
      packet(message);
      if (--peer.tokens < 0) return;
      const nodes = new Map([...this.engine.nodes].map((node) => [node.Id, node]));
      if (message.type === 'remote') {
        const event = nodes.get(message.id);
        if (event?.ClassName !== 'RemoteEvent' || !Array.isArray(message.args)) return;
        for (let parent = event.Parent; parent; parent = parent.Parent)
          if (['Script', 'ServerScript'].includes(parent.ClassName)) return;
        const visible = new Map([...nodes].filter(([id]) => peer.previous.has(id)));
        event.OnServerEvent.Fire(peer.player, ...decode(message.args, visible));
      } else if (
        message.type === 'physics' &&
        Array.isArray(message.objects) &&
        message.objects.length <= 64
      ) {
        for (const state of message.objects) {
          const node = nodes.get(state.id);
          if (
            !node?._body ||
            node.Anchored ||
            node._networkOwner !== peer.player.UserId ||
            (state.epoch ?? 0) !== node._networkEpoch
          )
            continue;
          const position = node.vector(state.position),
            velocity = node.vector(state.velocity);
          const time = this.engine.runService.Time;
          const delta = Math.min(
            0.25,
            Math.max(1 / 20, time - (peer.movementAt.get(node.Id) ?? time)),
          );
          // Ownership is a physics lease, not authority over scene data or arbitrary teleports.
          const speedLimit = this.engine.dimension === '3D' ? 80 : 4000;
          if (
            position.Magnitude > 100000 ||
            velocity.Magnitude > speedLimit ||
            node.Position.Distance(position) >
              speedLimit * delta + (this.engine.dimension === '3D' ? 2 : 20)
          )
            continue;
          const rotation =
            this.engine.dimension === '3D' ? node.vector(state.rotation) : state.rotation;
          if (typeof rotation === 'number' && !Number.isFinite(rotation)) continue;
          this.engine._applyingPhysics = true;
          try {
            node.Position = position;
            node.Velocity = velocity;
            node.Rotation = rotation;
          } finally {
            this.engine._applyingPhysics = false;
          }
          peer.movementAt.set(node.Id, time);
        }
      }
    } catch {
      /* Malformed client input is dropped without interrupting the host. */
    }
  }
  remote(event, direction, player, args) {
    if (!['client', 'all'].includes(direction)) throw new Error('FireServer is client-only');
    const message = { type: 'remote', id: event.Id, args: encode(args) };
    packet(message);
    // Ensure a newly created RemoteEvent/instance is known before delivering references to it.
    this.sendSnapshot();
    for (const peer of this.peers.values())
      if (peer.ready && (direction === 'all' || peer.player === player)) peer.send(message);
  }
  update(delta) {
    this.engine.update(delta);
    for (const peer of this.peers.values())
      peer.tokens = Math.min(120, peer.tokens + Math.min(delta, 0.1) * 120);
    this.elapsed += delta;
    if (this.elapsed >= 1 / 20) {
      this.elapsed = 0;
      this.sendSnapshot();
    }
  }
  dispose() {
    for (const peer of [...this.peers.values()]) this.disconnect(peer);
    this.engine.dispose();
  }
}
