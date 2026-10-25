import { Signal } from './signal.js';
import { Vector2, Vector3 } from './math.js';
import { encodeAttribute, decodeAttribute } from './attributes.js';
import {
  CONTROLLER_2D,
  CONTROLLER_3D,
  CONTROLLER_DEFAULTS_2D,
  CONTROLLER_DEFAULTS_3D,
} from './controllers.js';

let nextId = 1;
export const canonicalClass = (name) => (name === 'PhysicsObject' ? 'Object2D' : name);
export const CLASSES = [
  'Folder',
  'Object2D',
  'Object3D',
  'Script',
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
    this.OnCollisionEnd = new Signal();
    this.OnFallen = new Signal();
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
    this._position = this.vector(value);
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
    node.Source = data.Source ?? node.Source;
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
  if (project.assets !== undefined) {
    if (!project.assets || Array.isArray(project.assets) || typeof project.assets !== 'object')
      throw new Error('Invalid asset collection');
    for (const [name, asset] of Object.entries(project.assets))
      if (!asset || typeof asset.data !== 'string')
        throw new Error('Asset must contain embedded data: ' + name);
  }
  const ids = new Set();
  let count = 0;
  const visit = (node, depth = 0) => {
    const className = canonicalClass(node.className);
    if (++count > 20000 || depth > 100) throw new Error('Scene exceeds supported size/depth');
    if (!CLASSES.includes(className) || typeof node.name !== 'string')
      throw new Error('Invalid scene node');
    if (typeof node.id !== 'string' || ids.has(node.id))
      throw new Error('Missing or duplicate instance id');
    ids.add(node.id);
    if (node.attributes) encodeAttribute(node.attributes);
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
      if (!(three ? ['Box', 'Sphere', 'Cylinder'] : ['Box', 'Circle']).includes(node.Shape))
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
    node.children.forEach((child) => visit(child, depth + 1));
  };
  project.services.forEach((node) => visit(node));
  if (
    project.services.length !== 2 ||
    !['Workspace', 'ScriptService'].every((name) =>
      project.services.some((n) => n.name === name && n.className === 'Folder'),
    )
  )
    throw new Error('Project needs Workspace and ScriptService folders');
  return project;
}
