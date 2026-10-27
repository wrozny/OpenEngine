import { CAR_DEFAULTS } from '../engine/vehicles.js';
import { isUINode, UI_DEFAULTS } from '../engine/ui-schema.js';
import { UDim2 } from '../engine/ui-types.js';
import { Vector2 } from '../engine/math.js';
import { ReplicaPresentation } from './presentation.js';
import { Engine } from '../engine/engine.js';
import { deserializeNode, isObject, isScriptNode } from '../engine/scene.js';
import { decodeAttribute } from '../engine/attributes.js';
import { Player } from './players.js';
import { encode, decode, packet } from './codec.js';

/** Reconciles server instances by stable ID, preserving Lua references, subscriptions and local scripts. */
export class NetworkClient {
  constructor(send, { onReady, onLog, onDisconnect } = {}) {
    Object.assign(this, { send, onReady, onLog, onDisconnect });
    this.runningScripts = new Set();
    this.uiValues = new WeakMap();
    this.presentation = new ReplicaPresentation();
    this.elapsed = 0;
  }
  receive(message) {
    if (this.disposed) return;
    if (message.type === 'welcome') {
      this.userId = message.userId;
      this.engine = new Engine(message.project, {
        role: 'client',
        network: this,
        onLog: this.onLog,
      });
    } else if (['snapshot', 'patch'].includes(message.type) && this.engine) {
      if (message.type === 'snapshot') {
        this.cache = new Map();
        this.roots = message.services.map((node) => node.id);
        const visit = (node) => {
          this.cache.set(node.id, { ...node, children: node.children.map((n) => n.id) });
          node.children.forEach(visit);
        };
        message.services.forEach(visit);
      } else {
        for (const id of message.removed) this.cache.delete(id);
        for (const node of message.nodes) this.cache.set(node.id, node);
      }
      const tree = (id) => {
        const data = this.cache.get(id);
        return { ...data, children: data.children.map(tree) };
      };
      this.reconcile(
        { services: this.roots.map(tree), players: message.players, gravity: message.gravity },
        message.type === 'patch' ? new Set(message.nodes.map((node) => node.id)) : null,
      );
      if (!this.ready) {
        this.ready = true;
        this.onReady?.(this.engine);
      }
    } else if (message.type === 'remote' && this.ready) {
      const nodes = new Map([...this.engine.nodes].map((n) => [n.Id, n]));
      const event = nodes.get(message.id);
      if (event?.ClassName === 'RemoteEvent')
        event.OnClientEvent.Fire(...decode(message.args, nodes));
    }
  }
  reconcile(message, changed) {
    const engine = this.engine,
      wasRunning = engine.running;
    engine.running = false;
    if (message.gravity) engine.physicsWorld.setGravity(message.gravity);
    const nodes = new Map([...engine.nodes].map((n) => [n.Id, n]));
    const previouslyReplicated = this.replicatedIds || new Set(nodes.keys());
    const seen = new Set(),
      rebuildOwners = [];
    const visit = (data, parent) => {
      let node = nodes.get(data.id);
      if (!node) {
        node = deserializeNode({ ...data, children: [] });
        nodes.set(node.Id, node);
      }
      seen.add(node.Id);
      if (changed && !changed.has(node.Id)) {
        data.children.forEach((child) => visit(child, node));
        return;
      }
      const ownerChanged = node._networkOwner !== data.owner;
      const corrected = data.owner === this.userId && node._networkEpoch !== data.epoch;
      node._networkEpoch = data.epoch || 0;
      if (ownerChanged || !wasRunning) rebuildOwners.push(node);
      const locallyOwned = data.owner === this.userId;
      node._networkOwner = data.owner;
      node._networkOwnerSet = !!data.leased;
      node.Name = data.name;
      node._attributes = decodeAttribute(data.attributes || {});
      if (isObject(node)) {
        const fresh = deserializeNode({ ...data, children: [] });
        let rebuild = ownerChanged;
        for (const key of Object.keys(data)) {
          if (
            [
              'id',
              'className',
              'name',
              'attributes',
              'children',
              'Position',
              'Rotation',
              'Velocity',
              'owner',
              'epoch',
              'leased',
              'parent',
            ].includes(key)
          )
            continue;
          if (JSON.stringify(node[key]) !== JSON.stringify(fresh[key])) {
            node[key] = fresh[key];
            rebuild = true;
          }
        }
        if (!locallyOwned || ownerChanged || corrected || !wasRunning) {
          if (locallyOwned && corrected && !ownerChanged && wasRunning)
            this.presentation.correct(node, fresh.Position);
          this.presentation.capture(
            node,
            fresh.Position,
            fresh.Rotation,
            ownerChanged || corrected || !wasRunning,
            performance.now(),
            data.Velocity ? fresh.vector(data.Velocity) : fresh.Velocity,
          );
          node.Position = fresh.Position;
          node.Rotation = fresh.Rotation;
          if (data.Velocity) node.Velocity = data.Velocity;
        }
        if (rebuild && node._body) engine.rebuildBody(node);
      } else if (CAR_DEFAULTS[node.ClassName]) {
        for (const key of Object.keys(CAR_DEFAULTS[node.ClassName]))
          if (data[key] !== undefined) node[key] = data[key];
        node.Enabled = data.Enabled !== false;
      } else if (isUINode(node)) {
        const previous = this.uiValues.get(node) || {};
        for (const key of Object.keys(UI_DEFAULTS[node.ClassName])) {
          const value = JSON.stringify(data[key]);
          if (value !== previous[key] && data[key] !== undefined)
            node[key] = structuredClone(data[key]);
          previous[key] = value;
        }
        this.uiValues.set(node, previous);
        if (node.ClassName !== 'ScreenGui') {
          node.Size = UDim2.from(node.Size);
          node.AnchorPoint = new Vector2(node.AnchorPoint.X, node.AnchorPoint.Y);
        }
      } else if (isScriptNode(node)) {
        node.Source = data.Source;
        node.Enabled = data.Enabled;
      }
      if (data.settings) Object.assign(node, data.settings);
      node.Parent = parent;
      data.children.forEach((child) => visit(child, node));
    };
    message.services.forEach((data) => visit(data, engine.root));
    for (const node of [...engine.nodes])
      if (node !== engine.root && previouslyReplicated.has(node.Id) && !seen.has(node.Id)) {
        node.Destroy();
        this.presentation.samples.delete(node.Id);
        this.presentation.corrections.delete(node.Id);
        this.runningScripts.delete(node.Id);
      }
    this.replicatedIds = seen;
    const added = [],
      characters = [];
    for (const data of message.players) {
      let player = engine.players.GetPlayerByUserId(data.id);
      if (!player) {
        player = new Player(data.id, data.name, (e) => engine.log('error', e.message));
        engine.players._players.set(data.id, player);
        added.push(player);
      }
      if (data.id === this.userId) engine.players.LocalPlayer = player;
      const character = nodes.get(data.character) || null;
      if (player.Character !== character) {
        player.Character = character;
        characters.push(player);
      }
    }
    for (const player of engine.players.GetPlayers())
      if (!message.players.some((p) => p.id === player.UserId)) engine.players.remove(player);
    for (const node of rebuildOwners) if (node._body) engine.rebuildBody(node);
    if (!wasRunning) engine.start();
    else engine.running = true;
    for (const node of engine.nodes) {
      const shouldRun = engine.shouldRun(node) && node.Enabled;
      if (this.runningScripts.has(node.Id) && !shouldRun) {
        engine.lua.stopScript(node);
        this.runningScripts.delete(node.Id);
      }
      if (shouldRun && !this.runningScripts.has(node.Id)) {
        if (wasRunning) engine.lua.run(node);
        this.runningScripts.add(node.Id);
      }
    }
    for (const player of added) engine.players.PlayerAdded.Fire(player);
    for (const player of characters)
      if (player.Character) player.CharacterAdded.Fire(player.Character);
  }
  transform(node) {
    return node._networkOwner === this.userId
      ? this.presentation.owned(node)
      : this.presentation.get(node);
  }
  remote(event, direction, _player, args) {
    if (direction !== 'server') throw new Error('FireClient/FireAllClients are server-only');
    const message = { type: 'remote', id: event.Id, args: encode(args) };
    packet(message);
    this.send(message);
  }
  update(delta) {
    if (!this.ready || this.disposed) return;
    this.engine.update(delta);
    this.elapsed += delta;
    if (this.elapsed >= 1 / 20) {
      this.elapsed = 0;
      const objects = [...this.engine.nodes]
        .filter((n) => n._body && n._networkOwner === this.userId)
        .map((n) => ({
          id: n.Id,
          position: n.Position,
          velocity: n.Velocity,
          rotation: n.Rotation,
          epoch: n._networkEpoch,
        }));
      if (objects.length) this.send({ type: 'physics', objects });
    }
  }
  disconnected(reason = 'Disconnected from server') {
    if (this.engine) this.engine.running = false;
    this.onDisconnect?.(reason);
  }
  dispose() {
    this.disposed = true;
    this.engine?.dispose();
    this.presentation.samples.clear();
    this.presentation.corrections.clear();
  }
}

export function connectWebSocket(url, options = {}) {
  const socket = new WebSocket(url);
  const client = new NetworkClient(
    (message) => socket.readyState === WebSocket.OPEN && socket.send(packet(message)),
    options,
  );
  socket.onmessage = (event) => {
    try {
      client.receive(JSON.parse(event.data));
    } catch (error) {
      options.onLog?.({ level: 'error', message: error.message });
      socket.close();
    }
  };
  socket.onclose = () => client.disconnected('Connection closed. Reopen the game to reconnect.');
  socket.onerror = () =>
    options.onDisconnect?.('Cannot connect to server. Check its address and that it is running.');
  const dispose = client.dispose.bind(client);
  client.dispose = () => {
    socket.onclose = socket.onmessage = socket.onerror = null;
    socket.close();
    dispose();
  };
  return client;
}
