import * as planck from 'planck';
import { Signal } from './signal.js';
import { SceneNode, deserializeNode, validateProject, isRunnableScript } from './scene.js';
import { Vector2, math } from './math.js';
import { LuaRuntime } from './lua.js';
import { InputService } from './input.js';
import { AudioService } from './audio.js';

const SCALE = 50;
const GROUPS = { world: 1, player: 2, zombie: 4, projectile: 8, decoration: 16 };
const MASKS = { world: 15, player: 5, zombie: 15, projectile: 5, decoration: 0 };

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
    this.logs = [];
    this.onLog = options.onLog || (() => {});
    this.world = new planck.World(planck.Vec2(0, 0));
    this.nodes = new Set();
    this.contacts = [];
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
    this.camera = { Position: new Vector2(), Zoom: 1, Follow: null };
    this.physics = {
      SetGravity: (vector) => this.world.setGravity(this.toPhysics(vector)),
      GetGravity: () => {
        const g = this.world.getGravity();
        return new Vector2(g.x * SCALE, g.y * SCALE);
      },
    };
    this.runService = {
      Heartbeat: new Signal((error) => this.log('error', error.message)),
      Time: 0,
      DeltaTime: this.stepSize,
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
        (node) =>
          node.ClassName === 'Object2D' && node._body && node.Position.Distance(center) <= radius,
      );
    this.attach(this.root);
    for (const event of ['begin-contact', 'end-contact'])
      this.world.on(event, (contact) => {
        const a = contact.getFixtureA().getBody().getUserData();
        const b = contact.getFixtureB().getBody().getUserData();
        this.contacts.push({ a, b, event });
      });
  }
  log(level, message) {
    const entry = { level, message: String(message), time: this.runService?.Time || 0 };
    this.logs.push(entry);
    if (this.logs.length > 250) this.logs.shift();
    this.onLog(entry);
  }
  toPhysics(v) {
    return planck.Vec2(v.X / SCALE, v.Y / SCALE);
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
      node.OnCollision.onError = node.OnCollisionEnd.onError = (error) =>
        this.log('error', error.message);

      if (this.running && isRunnableScript(node) && node.Enabled) this.lua.run(node);
    }
    if (node.ClassName === 'Object2D') {
      if (this.isInWorkspace(node) && !node._body) this.createBody(node);
      else if (!this.isInWorkspace(node) && node._body) {
        this.world.destroyBody(node._body);
        node._body = null;
      }
    }
    for (const child of node.GetChildren()) this.attach(child);
  }
  detach(node) {
    if (isRunnableScript(node)) this.lua?.stopScript(node);
    for (const child of node.GetChildren()) this.detach(child);
    if (node._body) this.world.destroyBody(node._body);
    node._body = null;
    node._engine = null;
    this.nodes.delete(node);
  }
  createBody(node) {
    if (!(node.Size.X > 0 && node.Size.Y > 0)) throw new Error(`Invalid body size: ${node.Name}`);
    const body = this.world.createBody({
      type: node.Anchored ? 'static' : 'dynamic',
      position: this.toPhysics(node.Position),
      angle: node.Rotation || 0,
      fixedRotation: true,
      bullet: node.CollisionGroup === 'projectile',
      userData: node,
    });
    const shape =
      node.Shape === 'Circle'
        ? planck.Circle(node.Size.X / (2 * SCALE))
        : planck.Box(node.Size.X / (2 * SCALE), node.Size.Y / (2 * SCALE));
    body.createFixture(shape, {
      density: 1,
      friction: node.Friction,
      restitution: node.Restitution,
      isSensor: node.Sensor,
      filterCategoryBits: GROUPS[node.CollisionGroup] || 1,
      filterMaskBits: MASKS[node.CollisionGroup] ?? 0xffff,
    });
    body.setLinearVelocity(this.toPhysics(node.Velocity));
    node._body = body;
  }
  rebuildBody(node) {
    if (this.world.isLocked()) throw new Error('Cannot rebuild physics during a physics step');
    if (node._body) this.world.destroyBody(node._body);
    this.createBody(node);
  }
  raycast(origin, direction, ignore) {
    let result;
    if (direction.Magnitude === 0) return undefined;
    this.world.rayCast(
      this.toPhysics(origin),
      this.toPhysics(origin.Add(direction)),
      (fixture, point, normal, fraction) => {
        const node = fixture.getBody().getUserData();
        if (node === ignore || node.Sensor || node.Destroyed) return -1;
        result = {
          Instance: node,
          Position: new Vector2(point.x * SCALE, point.y * SCALE),
          Normal: new Vector2(normal.x, normal.y),
          Distance: direction.Magnitude * fraction,
        };
        return fraction;
      },
    );
    return result;
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.lua = new LuaRuntime(this);
    // Snapshot: scripts spawned during startup are started by attach, not twice here.
    const scripts = [...this.nodes].filter((node) => isRunnableScript(node) && node.Enabled);
    for (const script of scripts) if (!script.Destroyed) this.lua.run(script);
  }
  update(elapsed) {
    if (!this.running) return;
    this.accumulator += Math.min(Math.max(0, elapsed), 0.1);
    while (this.accumulator >= this.stepSize) {
      this.runService.Time += this.stepSize;
      this.runService.Heartbeat.Fire(this.stepSize);
      this.world.step(this.stepSize, 8, 3);
      for (const node of this.nodes)
        if (node._body) {
          const p = node._body.getPosition(),
            v = node._body.getLinearVelocity();
          node._position = new Vector2(p.x * SCALE, p.y * SCALE);
          node._velocity = new Vector2(v.x * SCALE, v.y * SCALE);
          node.Rotation = node._body.getAngle();
        }
      const contacts = this.contacts;
      this.contacts = [];
      for (const { a, b, event } of contacts) {
        if (a.Destroyed || b.Destroyed) continue;
        const signal = event === 'begin-contact' ? 'OnCollision' : 'OnCollisionEnd';
        a[signal].Fire(b);
        if (!a.Destroyed && !b.Destroyed) b[signal].Fire(a);
      }
      this.accumulator -= this.stepSize;
    }
    if (this.camera.Follow && !this.camera.Follow.Destroyed)
      this.camera.Position = this.camera.Follow.Position;
  }
  dispose() {
    this.running = false;
    this.lua?.dispose();
    this.runService.Heartbeat.Clear();
    this.input.dispose();
    this.audio.dispose();
    this.ui.OnAction.Clear();
    this.ui.Changed.Clear();
    for (const child of this.root.GetChildren()) child.Destroy();
  }
}
