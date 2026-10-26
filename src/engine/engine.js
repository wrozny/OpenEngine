import { getCharacterGround, moveCharacter } from './character-motor.js';
import { PlanckWorld } from './physics/planck-world.js';
import { CannonWorld } from './physics/cannon-world.js';
import { Signal } from './signal.js';
import { SceneNode, deserializeNode, validateProject, isRunnableScript } from './scene.js';
import { Vector2, Vector3, math } from './math.js';
import { LuaRuntime } from './lua.js';
import { InputService } from './input.js';
import { AudioService } from './audio.js';
import { PlayersService } from '../network/players.js';

export class UIService {
  constructor() {
    this.State = 'playing';
    this.Title = '';
    this.Subtitle = '';
    this.hud = Object.create(null);
    this.upgrades = Object.create(null);
    this.widgets = Object.create(null);
    this.OnAction = new Signal();
    this.Changed = new Signal();
  }
  CreateLabel(id, text, x = 20, y = 100) {
    this.widgets[id] = {
      type: 'label',
      text: String(text),
      x,
      y,
      anchor: 'TopLeft',
      color: '#d5e9df',
    };
    this.Changed.Fire();
  }
  CreateWorldLabel(id, text, target, offset = new Vector3(0, 2, 0)) {
    if (!(target instanceof SceneNode) || target.ClassName !== 'Object3D')
      throw new Error('World labels need an Object3D target');
    this.widgets[id] = {
      type: 'world-label',
      text: String(text),
      target,
      offset: new Vector3(offset.X, offset.Y, offset.Z),
      color: '#f3e8bd',
    };
    this.Changed.Fire();
  }
  CreateButton(id, text, x = 20, y = 150, width = 140, height = 36) {
    this.widgets[id] = {
      type: 'button',
      text: String(text),
      x,
      y,
      width,
      height,
      anchor: 'TopLeft',
    };
    this.Changed.Fire();
  }
  CreateBar(id, value, maximum, x = 20, y = 200, width = 200) {
    this.widgets[id] = {
      type: 'bar',
      value,
      maximum,
      x,
      y,
      width,
      height: 8,
      anchor: 'TopLeft',
      color: '#a0dfce',
    };
    this.Changed.Fire();
  }
  SetText(id, text) {
    if (this.widget(id).text === String(text)) return;
    this.widget(id).text = String(text);
    this.Changed.Fire();
  }
  SetValue(id, value, maximum) {
    Object.assign(this.widget(id), { value, maximum });
    this.Changed.Fire();
  }
  SetPosition(id, x, y, anchor = 'TopLeft') {
    if (!['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight', 'Center'].includes(anchor))
      throw new Error('Unknown UI anchor');
    Object.assign(this.widget(id), { x, y, anchor });
    this.Changed.Fire();
  }
  SetColor(id, color) {
    if (this.widget(id).color === color) return;
    this.widget(id).color = color;
    this.Changed.Fire();
  }
  Remove(id) {
    delete this.widgets[id];
    this.Changed.Fire();
  }
  widget(id) {
    if (!this.widgets[id]) throw new Error('Unknown UI widget: ' + id);
    return this.widgets[id];
  }
  Set(key, value) {
    if (this.hud[key] === String(value)) return;
    this.hud[key] = String(value);
    this.Changed.Fire();
  }
  SetState(state, title = '', subtitle = '') {
    this.State = state;
    this.Title = title;
    this.Subtitle = subtitle;
    this.Changed.Fire();
  }
  SetUpgrade(id, title, description, cost, affordable = true) {
    this.upgrades[id] = { title, description, cost, affordable };
    this.Changed.Fire();
  }
}

/** Fixed-step simulation shared unchanged by Studio, browser builds and desktop builds. */
export class Engine {
  constructor(project, options = {}) {
    validateProject(project);
    this.project = structuredClone(project);
    this.role = options.role || 'standalone';
    this.network = options.network || null;
    this.players = new PlayersService((error) => this.log('error', error.message));
    this.logs = [];
    this.onLog = options.onLog || (() => {});
    this.dimension = project.dimension || '2D';
    this.contacts = [];
    this.physicsWorld = new (this.dimension === '3D' ? CannonWorld : PlanckWorld)((contact) =>
      this.contacts.push(contact),
    );
    this.world = this.physicsWorld.world;
    this.nodes = new Set();
    this.running = false;
    this.accumulator = 0;
    this.stepSize = 1 / 60;
    this.root = new SceneNode('Folder', 'game');
    for (const data of project.services) deserializeNode(data).Parent = this.root;
    this.workspace = this.root.FindFirstChild('Workspace');
    this.scriptService = this.root.FindFirstChild('ScriptService');
    this.input = new InputService();
    this.audio = new AudioService();
    this.ui = new UIService();
    this.camera = {
      Position: this.dimension === '3D' ? new Vector3(0, 4, 10) : new Vector2(),
      Zoom: 1,
      Offset: this.dimension === '3D' ? new Vector3(0, 1, 0) : new Vector2(),
      Follow: null,
      Yaw: 0,
      Pitch: -0.2,
      Distance: 7,
      FirstPerson: false,
    };
    this.physics = {
      GetGround: (actor, slopeAngle, distance) =>
        getCharacterGround(this, actor, slopeAngle, distance),
      MoveCharacter: (actor, velocity, deltaTime, stepHeight, slopeAngle) =>
        moveCharacter(this, actor, velocity, deltaTime, stepHeight, slopeAngle),
      SetGravity: (vector) => this.physicsWorld.setGravity(vector),
      GetGravity: () => this.physicsWorld.getGravity(),
    };
    this.runService = {
      Heartbeat: new Signal((error) => this.log('error', error.message)),
      PostSimulation: new Signal((error) => this.log('error', error.message)),
      Time: 0,
      DeltaTime: this.stepSize,
      IsServer: () => this.role !== 'client',
      IsClient: () => this.role !== 'server',
    };
    this.assets = {
      Has: (name) => typeof project.assets?.[name]?.data === 'string',
      Get: (name) => {
        if (typeof project.assets?.[name]?.data !== 'string')
          throw new Error('Unknown asset: ' + name);
        return project.assets[name].data;
      },
    };
    this.services = {
      Players: this.players,
      AssetService: this.assets,
      Workspace: this.workspace,
      ScriptService: this.scriptService,
      RunService: this.runService,
      InputService: this.input,
      AudioService: this.audio,
      UIService: this.ui,
      Camera: this.camera,
      Math: math,
      PhysicsService: this.physics,
    };
    this.game = {
      GetService: (name) => {
        if (!Object.hasOwn(this.services, name)) throw new Error(`Unknown service: ${name}`);
        return this.services[name];
      },
    };
    this.workspace.Raycast = (origin, direction, ignore) => this.raycast(origin, direction, ignore);
    this.workspace.GetObjectsInRadius = (center, radius) =>
      [...this.nodes].filter(
        (node) => this.isPhysical(node) && node._body && node.Position.Distance(center) <= radius,
      );
    this.attach(this.root);
  }

  log(level, message) {
    const entry = { level, message: String(message), time: this.runService?.Time || 0 };
    this.logs.push(entry);
    if (this.logs.length > 250) this.logs.shift();
    this.onLog(entry);
  }
  isPhysical(node) {
    return node.ClassName === (this.dimension === '3D' ? 'Object3D' : 'Object2D');
  }
  isInWorkspace(node) {
    for (let parent = node; parent; parent = parent.Parent)
      if (parent === this.workspace) return true;
    return false;
  }
  attach(node) {
    if (node._engine !== this) {
      node._engine = this;
      this.nodes.add(node);
      node.OnCollision.onError =
        node.OnCollisionEnd.onError =
        node.OnFallen.onError =
          (error) => this.log('error', error.message);

      if (node.ClassName === 'RemoteEvent') {
        node.OnServerEvent.onError = node.OnClientEvent.onError = (error) =>
          this.log('error', error.message);
      }
      if (this.running && this.shouldRun(node) && node.Enabled) {
        this.lua.run(node);
        this.network?.runningScripts?.add(node.Id);
      }
    }
    if (this.isPhysical(node)) {
      if (this.isInWorkspace(node) && !node._body) this.createBody(node);
      else if (!this.isInWorkspace(node) && node._body) {
        this.physicsWorld.remove(node);
        node._body = null;
      }
    }
    for (const child of node.GetChildren()) this.attach(child);
  }
  detach(node) {
    if (isRunnableScript(node)) {
      this.lua?.stopScript(node);
      this.network?.runningScripts?.delete(node.Id);
    }
    for (const child of node.GetChildren()) this.detach(child);
    if (node._body) this.physicsWorld.remove(node);
    node._body = null;
    node._engine = null;
    this.nodes.delete(node);
  }
  shouldRun(node) {
    if (!isRunnableScript(node)) return false;
    if (this.role === 'standalone') return node.ClassName !== 'LocalScript';
    if (this.role === 'server')
      return node.ClassName !== 'LocalScript' && !node.ClassName.startsWith('PlayerController');
    if (node.ClassName === 'LocalScript') {
      for (let parent = node.Parent; parent; parent = parent.Parent)
        if (this.isPhysical(parent) && parent._networkOwnerSet)
          return parent._networkOwner === this.players.LocalPlayer?.UserId;
      return true;
    }
    if (node.ClassName.startsWith('PlayerController'))
      return node.Parent?._networkOwner === this.players.LocalPlayer?.UserId;
    return false;
  }
  createBody(node) {
    const anchored = node.Anchored;
    if (this.role === 'client' && node._networkOwner !== this.players.LocalPlayer?.UserId)
      node.Anchored = true;
    this.physicsWorld.create(node);
    node.Anchored = anchored;
  }
  rebuildBody(node) {
    this.physicsWorld.remove(node);
    this.createBody(node);
  }
  raycast(origin, direction, ignore) {
    return this.physicsWorld.raycast(origin, direction, ignore);
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.lua = new LuaRuntime(this);
    // Snapshot: scripts spawned during startup are started by attach, not twice here.
    const scripts = [...this.nodes].filter((node) => this.shouldRun(node) && node.Enabled);
    for (const script of scripts) if (!script.Destroyed) this.lua.run(script);
  }
  update(elapsed) {
    if (!this.running) return;
    this.accumulator += Math.min(Math.max(0, elapsed), 0.1);
    while (this.accumulator >= this.stepSize) {
      this.runService.Time += this.stepSize;
      this.runService.Heartbeat.Fire(this.stepSize);
      this.physicsWorld.step(this.stepSize);
      for (const node of this.nodes) if (node._body) this.physicsWorld.sync(node);
      if (this.dimension === '3D')
        for (const node of [...this.nodes]) {
          if (node.ClassName === 'Object3D' && node.Position.Y < this.workspace.FallenHeight) {
            node.OnFallen.Fire();
            if (!node.Destroyed && node.Position.Y < this.workspace.FallenHeight) node.Destroy();
          }
        }
      const contacts = this.contacts;
      this.contacts = [];
      for (const { a, b, event } of contacts) {
        if (a.Destroyed || b.Destroyed) continue;
        const signal = event === 'begin-contact' ? 'OnCollision' : 'OnCollisionEnd';
        a[signal].Fire(b);
        if (!a.Destroyed && !b.Destroyed) b[signal].Fire(a);
      }
      this.runService.PostSimulation.Fire(this.stepSize);
      this.accumulator -= this.stepSize;
    }
    if (this.camera.Follow && !this.camera.Follow.Destroyed)
      this.camera.Position =
        this.dimension === '3D'
          ? this.camera.Follow.Position.Add(this.camera.Offset)
          : this.camera.Follow.Position;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    this.lua?.dispose();
    this.runService.Heartbeat.Clear();
    this.runService.PostSimulation.Clear();
    this.input.dispose();
    this.audio.dispose();
    this.players.dispose();
    this.ui.OnAction.Clear();
    this.ui.Changed.Clear();
    for (const child of this.root.GetChildren()) child.Destroy();
  }
}
