import { VehicleSystem } from './vehicles.js';
import { initializeUIService } from './ui-service.js';
export { UIService } from './ui-service.js';
import { UITweens } from './ui-tweens.js';
import { CollisionEvents } from './collision-events.js';
import { getCharacterGround, moveCharacter } from './character-motor.js';
import { PlanckWorld } from './physics/planck-world.js';
import { CannonWorld } from './physics/cannon-world.js';
import { Signal } from './signal.js';
import {
  SceneNode,
  deserializeNode,
  validateProject,
  normalizeProject,
  isRunnableScript,
} from './scene.js';
import { Vector2, Vector3, math } from './math.js';
import { LuaRuntime } from './lua.js';
import { InputService } from './input.js';
import { AudioService } from './audio.js';
import { PlayersService } from '../network/players.js';

/** Fixed-step simulation shared unchanged by Studio, browser builds and desktop builds. */
export class Engine {
  constructor(project, options = {}) {
    project = normalizeProject(project);
    this.project = structuredClone(project);
    this.role = options.role || 'standalone';
    this.network = options.network || null;
    this.players = new PlayersService((error) => this.log('error', error.message));
    this.logs = [];
    this.onLog = options.onLog || (() => {});
    this.dimension = project.dimension || '2D';
    this.contacts = [];
    this.collisions = new CollisionEvents();
    this.physicsWorld = new (this.dimension === '3D' ? CannonWorld : PlanckWorld)((contact) =>
      this.contacts.push(contact),
    );
    this.world = this.physicsWorld.world;
    this.nodes = new Set();
    this.vehicles = new VehicleSystem(this);
    this.running = false;
    this.accumulator = 0;
    this.stepSize = 1 / 60;
    this.root = new SceneNode('Folder', 'game');
    for (const data of project.services) deserializeNode(data).Parent = this.root;
    this.workspace = this.root.FindFirstChild('Workspace');
    this.scriptService = this.root.FindFirstChild('ScriptService');
    this.input = new InputService();
    this.audio = new AudioService();
    this.ui = initializeUIService(this.root.FindFirstChild('UIService'));
    this.uiTweens = new UITweens(this);
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

      for (const key of ['OnClick', 'OnHoverStart', 'OnHoverEnd', 'OnValueChanged'])
        if (node[key]) node[key].onError = (error) => this.log('error', error.message);
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
        this.collisions.remove(node);
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
    this.vehicles.remove(node);
    for (const child of node.GetChildren()) this.vehicles.remove(child);
    this.collisions.remove(node);
    this.uiTweens.cancelTarget(node);
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
    this.collisions.remove(node);
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
      this.vehicles.update(this.stepSize);
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
      for (const { a, b, bodyA, bodyB, event } of contacts)
        if (a?._body === bodyA && b?._body === bodyB) this.collisions.dispatch(a, b, event);
      this.uiTweens.update(this.stepSize);
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
    this.vehicles.dispose();
    this.uiTweens.dispose();
    this.collisions.clear();
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
