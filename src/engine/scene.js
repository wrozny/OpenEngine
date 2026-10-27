import { CAR_DEFAULTS } from './vehicles.js';
import { UI_DEFAULTS, isUIElement, isUINode, validateUIData } from './ui-schema.js';
import { UDim2 } from './ui-types.js';
import { Signal } from './signal.js';
import { Vector2, Vector3 } from './math.js';
import { encodeAttribute, decodeAttribute } from './attributes.js';
import {
  upgradeControllerSource,
  CONTROLLER_2D,
  CONTROLLER_3D,
  CONTROLLER_DEFAULTS_2D,
  CONTROLLER_DEFAULTS_3D,
} from './controllers.js';

let nextId = 1;
export const canonicalClass = (name) => (name === 'PhysicsObject' ? 'Object2D' : name);
export const CLASSES = [
  'Folder',
  'Car2D',
  'Car3D',
  'UIService',
  ...Object.keys(UI_DEFAULTS),
  'Object2D',
  'Object3D',
  'Script',
  'ServerScript',
  'LocalScript',
  'RemoteEvent',
  'ModuleScript',
  'PlayerController2D',
  'PlayerController3D',
];
export const isController = (node) => node.ClassName.startsWith('PlayerController');
export const isScriptNode = (node) => node.ClassName.endsWith('Script') || isController(node);
export const isRunnableScript = (node) => isScriptNode(node) && node.ClassName !== 'ModuleScript';
export const isObject = (node) => ['Object2D', 'Object3D'].includes(node.ClassName);
export const OBJECT_DEFAULTS = {
  Texture: '',
  ShowHealthBar: false,
  Shape: 'Box',
  Color: '#748f94',
  Size: { X: 64, Y: 64 },
  Anchored: true,
  Sensor: false,
  Visible: true,
  Layer: 0,
  CollisionGroup: 'world',
  Restitution: 0,
  Friction: 0.2,
};
export const OBJECT_DEFAULTS_3D = {
  Texture: '',
  Shape: 'Box',
  Color: '#c4c9d2',
  Size: { X: 2, Y: 2, Z: 2 },
  Anchored: true,
  Sensor: false,
  Visible: true,
  CollisionGroup: 'world',
  Restitution: 0.1,
  Friction: 0.5,
  Mass: 1,
  FixedRotation: false,
  Material: 'Default',
  TextureScale: 1,
};
export const WORKSPACE_DEFAULTS = {
  Skybox: 'builtin:sky',
  BackgroundColor: '#000000',
  FallenHeight: -50,
};
const controllerDefaults = (node) =>
  node.ClassName === 'PlayerController3D' ? CONTROLLER_DEFAULTS_3D : CONTROLLER_DEFAULTS_2D;
const objectDefaults = (node) =>
  node.ClassName === 'Object3D' ? OBJECT_DEFAULTS_3D : OBJECT_DEFAULTS;

/** Scene instances own hierarchy and data; physical transforms delegate to the active world. */
export class SceneNode {
  constructor(className = 'Folder', name = className, id) {
    className = canonicalClass(className);
    if (!CLASSES.includes(className)) throw new Error(`Unknown class: ${className}`);
    this.Id = id || `node-${nextId++}-${Math.random().toString(36).slice(2, 7)}`;
    this.ClassName = className;
    this.Name = name === 'PhysicsObject' ? 'Object2D' : name;
    this._parent = null;
    this._children = [];
    this._engine = null;
    this._body = null;
    const Vector = className === 'Object3D' ? Vector3 : Vector2;
    this._position = new Vector();
    this._velocity = new Vector();
    this._rotation = className === 'Object3D' ? new Vector3() : 0;
    this._attributes = Object.create(null);
    this.Destroyed = false;
    this.OnCollision = new Signal();
    this.OnCollisionStart = this.OnCollision;
    this.OnCollisionEnd = new Signal();
    this.OnFallen = new Signal();
    this._networkOwner = null;
    this._networkOwnerSet = false;
    this._networkEpoch = 0;
    if (className === 'RemoteEvent') {
      this.OnServerEvent = new Signal();
      this.OnClientEvent = new Signal();
    }
    if (isUIElement(this)) {
      this.OnClick = new Signal();
      this.OnHoverStart = new Signal();
      this.OnHoverEnd = new Signal();
      this.OnValueChanged = new Signal();
    }
    if (isUINode(this)) {
      Object.assign(this, structuredClone(UI_DEFAULTS[className]));
      if (isUIElement(this)) {
        this.Size = UDim2.from(this.Size);
        this.AnchorPoint = new Vector2(this.AnchorPoint.X, this.AnchorPoint.Y);
      }
    }
    if (CAR_DEFAULTS[className]) {
      Object.assign(this, CAR_DEFAULTS[className]);
      this.Enabled = true;
      this.Speed = 0;
    }
    if (isObject(this)) Object.assign(this, structuredClone(objectDefaults(this)));
    if (className === 'Folder' && name === 'Workspace') Object.assign(this, WORKSPACE_DEFAULTS);
    if (isScriptNode(this)) {
      this.Source = '';
      this.Enabled = true;
    }
    if (isController(this)) {
      Object.assign(this, controllerDefaults(this));
      this.Source = className === 'PlayerController3D' ? CONTROLLER_3D : CONTROLLER_2D;
    }
  }
  get Parent() {
    return this._parent;
  }
  set Parent(parent) {
    if (parent === this._parent) return;
    if (this.Destroyed) throw new Error('Cannot parent a destroyed object');
    if (parent != null && !(parent instanceof SceneNode))
      throw new Error('Parent must be an Instance or nil');
    if (parent && this.ClassName === 'ScreenGui' && parent.ClassName !== 'UIService')
      throw new Error('ScreenGui belongs under UIService');
    if (
      parent &&
      ['UIListLayout', 'UIGridLayout', 'UICorner', 'UIPadding'].includes(this.ClassName) &&
      !['Frame', 'ScreenGui'].includes(parent.ClassName)
    )
      throw new Error('UI modifiers belong under Frame or ScreenGui');
    if (parent && isUIElement(this) && !['Frame', 'ScreenGui'].includes(parent.ClassName))
      throw new Error('UI elements belong under a ScreenGui or Frame');
    if (parent && this.ClassName === 'UIService' && parent.Name !== 'game')
      throw new Error('UIService is a root service');
    for (let p = parent; p; p = p.Parent) if (p === this) throw new Error('Parenting cycle');
    const engine = this._engine,
      targetEngine = parent?._engine ?? null;
    if (this._parent) this._parent._children.splice(this._parent._children.indexOf(this), 1);
    this._parent = parent ?? null;
    if (parent) parent._children.push(this);
    if (engine && engine !== targetEngine) engine.detach(this);
    if (targetEngine) targetEngine.attach(this);
  }
  vector(value) {
    const v =
      this.ClassName === 'Object3D'
        ? new Vector3(value.X, value.Y, value.Z ?? 0)
        : new Vector2(value.X, value.Y);
    if (![v.X, v.Y, ...(v instanceof Vector3 ? [v.Z] : [])].every(Number.isFinite))
      throw new Error('Transform values must be finite');
    return v;
  }
  get Position() {
    return this._position;
  }
  set Position(value) {
    if (isUIElement(this)) {
      this._position = UDim2.from(value);
      return;
    }
    this._position = this.vector(value);
    if (this._engine?.role === 'server' && !this._engine._applyingPhysics) this._networkEpoch++;
    this._engine?.physicsWorld.setPosition(this, this._position);
  }
  get Velocity() {
    return this._velocity;
  }
  set Velocity(value) {
    this._velocity = this.vector(value);
    this._engine?.physicsWorld.setVelocity(this, this._velocity);
  }
  get Rotation() {
    return this._rotation;
  }
  set Rotation(value) {
    if (this.ClassName === 'Object3D') this._rotation = this.vector(value);
    else {
      if (!Number.isFinite(value)) throw new Error('Rotation must be finite');
      this._rotation = value;
    }
    this._engine?.physicsWorld.setRotation(this);
  }
  SetInput(throttle, steering = 0, brake = 0) {
    if (!CAR_DEFAULTS[this.ClassName]) throw new Error('SetInput requires a car component');
    if (![throttle, steering, brake].every(Number.isFinite))
      throw new Error('Car input must be finite');
    this._driveInput = {
      throttle: Math.max(-1, Math.min(1, throttle)),
      steering: Math.max(-1, Math.min(1, steering)),
      brake: Math.max(0, Math.min(1, brake)),
    };
  }
  GetWheelPosition(index) {
    return this._engine?.vehicles.wheel(this, index);
  }
  ApplyImpulse(impulse) {
    if (!isObject(this) || !this._body)
      throw new Error('ApplyImpulse needs a live physical object');
    const v = this.vector(impulse);
    this._engine.physicsWorld.applyImpulse(this, v);
  }
  Tween(goals, duration = 0.25, easing = 'OutCubic') {
    if (!isUIElement(this) || !this._engine)
      throw new Error('Tween needs a UI element in a running game');
    return this._engine.uiTweens.create(this, goals, duration, easing);
  }
  SetSiblingIndex(index) {
    if (!this.Parent) return;
    if (!Number.isInteger(index)) throw new Error('Sibling index must be an integer');
    const children = this.Parent._children;
    children.splice(children.indexOf(this), 1);
    children.splice(Math.max(0, Math.min(children.length, index - 1)), 0, this);
  }
  GetSiblingIndex() {
    return this.Parent ? this.Parent._children.indexOf(this) + 1 : 0;
  }
  GetTouchingObjects() {
    return this._engine?.collisions.touching(this) || [];
  }
  SetNetworkOwner(player) {
    if (!this._engine?.network || this._engine.role !== 'server')
      throw new Error('SetNetworkOwner is a multiplayer server operation');
    if (!isObject(this) || this.Anchored) throw new Error('Only unanchored objects can be owned');
    if (player && !this._engine.players.GetPlayers().includes(player))
      throw new Error('Unknown player');
    this._networkOwnerSet = true;
    this._networkOwner = player?.UserId || null;
    this._engine.network.sendSnapshot();
  }
  GetNetworkOwner() {
    return this._engine?.players.GetPlayerByUserId(this._networkOwner) || null;
  }
  FireServer(...args) {
    this.remote('server', null, args);
  }
  FireClient(player, ...args) {
    this.remote('client', player, args);
  }
  FireAllClients(...args) {
    this.remote('all', null, args);
  }
  remote(direction, player, args) {
    if (this.ClassName !== 'RemoteEvent' || !this._engine?.network)
      throw new Error('RemoteEvent requires a multiplayer session');
    this._engine.network.remote(this, direction, player, args);
  }
  GetChildren() {
    return [...this._children];
  }
  GetDescendants() {
    return this._children.flatMap((child) => [child, ...child.GetDescendants()]);
  }
  FindFirstChild(name, recursive = false) {
    return (recursive ? this.GetDescendants() : this._children).find(
      (child) => child.Name === name,
    );
  }
  FindFirstChildOfClass(className) {
    return this._children.find((child) => child.ClassName === canonicalClass(className));
  }
  IsA(className) {
    return (
      this.ClassName === canonicalClass(className) ||
      className === 'Instance' ||
      (className === 'Script' && isRunnableScript(this))
    );
  }
  GetAttribute(name) {
    return this._attributes[name];
  }
  SetAttribute(name, value) {
    if (typeof name !== 'string' || !name)
      throw new Error('Attribute name must be a nonempty string');
    if (value !== undefined && this._engine?.role === 'server' && this._engine.network)
      encodeAttribute(value);
    if (value === undefined) delete this._attributes[name];
    else this._attributes[name] = value;
  }
  GetAttributes() {
    return { ...this._attributes };
  }
  GetFullName() {
    return this.Parent ? `${this.Parent.GetFullName()}.${this.Name}` : this.Name;
  }
  Clone() {
    return deserializeNode(serializeNode(this), false);
  }
  Destroy() {
    if (this.Destroyed) return;
    for (const child of [...this._children]) child.Destroy();
    this.Parent = null;
    this.Destroyed = true;
    this.OnCollision.Clear();
    this.OnCollisionEnd.Clear();
    this.OnFallen.Clear();
    for (const key of ['OnClick', 'OnHoverStart', 'OnHoverEnd', 'OnValueChanged'])
      this[key]?.Clear();
    this.OnServerEvent?.Clear();
    this.OnClientEvent?.Clear();
  }
}
export function serializeNode(node) {
  const data = {
    id: node.Id,
    className: node.ClassName,
    name: node.Name,
    attributes: encodeAttribute(node._attributes),
    children: node.GetChildren().map(serializeNode),
  };
  if (CAR_DEFAULTS[node.ClassName]) {
    for (const key of Object.keys(CAR_DEFAULTS[node.ClassName])) data[key] = node[key];
    data.Enabled = node.Enabled;
  }
  if (isUINode(node))
    for (const key of Object.keys(UI_DEFAULTS[node.ClassName]))
      data[key] = structuredClone(node[key]);
  if (isObject(node)) {
    for (const key of Object.keys(objectDefaults(node))) data[key] = structuredClone(node[key]);
    data.Position = { ...node.Position };
    data.Rotation = typeof node.Rotation === 'number' ? node.Rotation : { ...node.Rotation };
  }
  if (node.Name === 'Workspace' && node.ClassName === 'Folder')
    data.settings = Object.fromEntries(
      Object.keys(WORKSPACE_DEFAULTS).map((key) => [key, node[key]]),
    );
  if (isScriptNode(node)) {
    data.Source = node.Source;
    data.Enabled = node.Enabled;
  }
  if (isController(node))
    for (const key of Object.keys(controllerDefaults(node))) data[key] = node[key];
  return data;
}
export function deserializeNode(data, preserveIds = true) {
  const node = new SceneNode(data.className, data.name, preserveIds ? data.id : undefined);
  if (isUINode(node)) {
    for (const key of Object.keys(UI_DEFAULTS[node.ClassName]))
      if (data[key] !== undefined) node[key] = structuredClone(data[key]);
    if (isUIElement(node)) {
      node.Size = UDim2.from(node.Size);
      node.AnchorPoint = new Vector2(node.AnchorPoint.X, node.AnchorPoint.Y);
    }
  }
  if (CAR_DEFAULTS[node.ClassName]) {
    for (const key of Object.keys(CAR_DEFAULTS[node.ClassName]))
      if (data[key] !== undefined) node[key] = data[key];
    node.Enabled = data.Enabled !== false;
  }
  if (data.attributes) node._attributes = decodeAttribute(data.attributes);
  if (isObject(node)) {
    for (const key of Object.keys(objectDefaults(node)))
      if (data[key] !== undefined) node[key] = structuredClone(data[key]);
    node.Position = data.Position || node.Position;
    node.Rotation = data.Rotation ?? node.Rotation;
  }
  if (data.settings && node.Name === 'Workspace')
    for (const key of Object.keys(WORKSPACE_DEFAULTS))
      if (data.settings[key] !== undefined) node[key] = data.settings[key];
  if (isScriptNode(node)) {
    node.Source = isController(node)
      ? upgradeControllerSource(data.Source, node.ClassName)
      : (data.Source ?? node.Source);
    node.Enabled = data.Enabled !== false;
  }
  if (isController(node))
    for (const key of Object.keys(controllerDefaults(node)))
      if (data[key] !== undefined) node[key] = data[key];
  for (const child of data.children || []) deserializeNode(child, preserveIds).Parent = node;
  return node;
}

/** Validate before importing/executing; version 1 documents remain backwards compatible. */
export function validateProject(project) {
  if (project?.format !== 'openengine' || project.version !== 1 || !Array.isArray(project.services))
    throw new Error('Expected an OpenEngine version 1 project');
  if (!project.name || typeof project.name !== 'string') throw new Error('Project needs a name');
  if (!['2D', '3D'].includes(project.dimension || '2D'))
    throw new Error('Project dimension must be 2D or 3D');
  if (project.multiplayer !== undefined && typeof project.multiplayer !== 'boolean')
    throw new Error('Multiplayer must be enabled or disabled');
  if (project.assets !== undefined) {
    if (!project.assets || Array.isArray(project.assets) || typeof project.assets !== 'object')
      throw new Error('Invalid asset collection');
    for (const [name, asset] of Object.entries(project.assets))
      if (!asset || typeof asset.data !== 'string')
        throw new Error('Asset must contain embedded data: ' + name);
  }
  const ids = new Set();
  let count = 0;
  const visit = (node, depth = 0, parentClass = null) => {
    if (node.className === 'ScreenGui' && parentClass !== 'UIService')
      throw new Error('ScreenGui belongs under UIService');
    if (isUIElement({ ClassName: node.className }) && !['ScreenGui', 'Frame'].includes(parentClass))
      throw new Error('UI elements belong under a ScreenGui or Frame');
    if (node.className === 'UIService' && depth !== 0)
      throw new Error('UIService is a root service');
    const className = canonicalClass(node.className);
    if (++count > 20000 || depth > 100) throw new Error('Scene exceeds supported size/depth');
    if (!CLASSES.includes(className) || typeof node.name !== 'string')
      throw new Error('Invalid scene node');
    if (typeof node.id !== 'string' || ids.has(node.id))
      throw new Error('Missing or duplicate instance id');
    ids.add(node.id);
    if (node.attributes) encodeAttribute(node.attributes);
    if (
      ['UIListLayout', 'UIGridLayout', 'UICorner', 'UIPadding'].includes(className) &&
      !['Frame', 'ScreenGui'].includes(parentClass)
    )
      throw new Error('UI modifiers require a UI parent');
    validateUIData(node);
    if (CAR_DEFAULTS[className])
      for (const key of Object.keys(CAR_DEFAULTS[className]))
        if (node[key] !== undefined && (!Number.isFinite(node[key]) || node[key] < 0))
          throw new Error('Invalid car property: ' + key);
    if (isObject({ ClassName: className })) {
      const three = className === 'Object3D';
      if (three !== (project.dimension === '3D'))
        throw new Error(`${className} does not match the project's dimension`);
      for (const axis of three ? ['X', 'Y', 'Z'] : ['X', 'Y'])
        if (
          !Number.isFinite(node.Position?.[axis]) ||
          !Number.isFinite(node.Size?.[axis]) ||
          node.Size[axis] <= 0
        )
          throw new Error('Invalid transform: ' + node.name);
      if (
        !(three ? ['Box', 'Sphere', 'Cylinder', 'Wedge'] : ['Box', 'Circle']).includes(node.Shape)
      )
        throw new Error('Unknown shape');
      if (three) {
        for (const axis of ['X', 'Y', 'Z'])
          if (!Number.isFinite(node.Rotation?.[axis] ?? 0)) throw new Error('Invalid rotation');
      } else if (!Number.isFinite(node.Rotation ?? 0)) throw new Error('Invalid rotation');
      for (const key of ['Layer', 'Friction', 'Restitution', 'Mass', 'TextureScale'])
        if (node[key] !== undefined && !Number.isFinite(node[key]))
          throw new Error('Invalid numeric property: ' + key);
      if (three && (node.Mass <= 0 || node.TextureScale <= 0))
        throw new Error('Mass and texture scale must be positive');
      if (node.Texture !== undefined && typeof node.Texture !== 'string')
        throw new Error('Texture must be a string');
    }
    if (isScriptNode({ ClassName: className }) && typeof node.Source !== 'string')
      throw new Error('Script source must be text');
    if (isController({ ClassName: className })) {
      for (const key of Object.keys(controllerDefaults({ ClassName: className }))) {
        const value = node[key];
        if (
          value !== undefined &&
          typeof value !== typeof controllerDefaults({ ClassName: className })[key]
        )
          throw new Error('Invalid controller property: ' + key);
      }
    }
    if (node.settings?.FallenHeight !== undefined && !Number.isFinite(node.settings.FallenHeight))
      throw new Error('Fallen height must be finite');
    if (!Array.isArray(node.children)) throw new Error('Children must be an array');
    node.children.forEach((child) => visit(child, depth + 1, className));
  };
  project.services.forEach((node) => visit(node));
  if (
    ![2, 3].includes(project.services.length) ||
    (project.services.length === 3 &&
      !project.services.some((n) => n.name === 'UIService' && n.className === 'UIService')) ||
    !['Workspace', 'ScriptService'].every((name) =>
      project.services.some((n) => n.name === name && n.className === 'Folder'),
    )
  )
    throw new Error('Project needs Workspace and ScriptService folders');
  return project;
}

export function normalizeProject(project) {
  validateProject(project);
  const copy = structuredClone(project);
  if (!copy.services.some((n) => n.name === 'UIService')) {
    const ids = new Set();
    const visit = (n) => {
      ids.add(n.id);
      n.children.forEach(visit);
    };
    copy.services.forEach(visit);
    let id = 'ui-service',
      suffix = 1;
    while (ids.has(id)) id = 'ui-service-' + suffix++;
    copy.services.push(serializeNode(new SceneNode('UIService', 'UIService', id)));
  }
  return copy;
}
