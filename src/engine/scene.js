import { Signal } from './signal.js';
import { encodeAttribute, decodeAttribute } from './attributes.js';
import { Vector2 } from './math.js';

let nextId = 1;
export const canonicalClass = (name) => (name === 'PhysicsObject' ? 'Object2D' : name);
export const CLASSES = ['Folder', 'Object2D', 'Script', 'ModuleScript'];
export const OBJECT_DEFAULTS = {
  Texture: '',
  ShowHealthBar: false,
  Shape: 'Box',
  Color: '#748f94',
  Size: { X: 64, Y: 64 },
  Rotation: 0,
  Anchored: true,
  Sensor: false,
  Visible: true,
  Layer: 0,
  CollisionGroup: 'world',
  Restitution: 0,
  Friction: 0.2,
};

/** A scene instance owns its children; parenting never permits cycles. */
export class SceneNode {
  constructor(className = 'Folder', name = className, id) {
    className = canonicalClass(className);
    if (!CLASSES.includes(className)) throw new Error(`Unknown class: ${className}`);
    this.Id = id || `node-${nextId++}-${Math.random().toString(36).slice(2, 7)}`;
    this.ClassName = className;
    this.Name = name;
    this._parent = null;
    this._children = [];
    this._position = new Vector2();
    this._velocity = new Vector2();
    this._attributes = Object.create(null);
    this._engine = null;
    this._body = null;
    this.Destroyed = false;
    this.OnCollision = new Signal();
    this.OnCollisionEnd = new Signal();
    if (className === 'Object2D') Object.assign(this, structuredClone(OBJECT_DEFAULTS));
    if (className.endsWith('Script')) {
      this.Source = '';
      this.Enabled = true;
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
    const engine = this._engine;
    const targetEngine = parent?._engine ?? null;
    if (this._parent) this._parent._children.splice(this._parent._children.indexOf(this), 1);
    this._parent = parent ?? null;
    if (parent) parent._children.push(this);
    if (engine && engine !== targetEngine) engine.detach(this);
    if (targetEngine) targetEngine.attach(this);
  }
  get Position() {
    return this._position;
  }
  set Position(value) {
    const p = new Vector2(value.X, value.Y);
    if (!Number.isFinite(p.X) || !Number.isFinite(p.Y)) throw new Error('Position must be finite');
    this._position = p;
    this._body?.setPosition(this._engine.toPhysics(p));
  }
  get Velocity() {
    return this._velocity;
  }
  set Velocity(value) {
    this._velocity = new Vector2(value.X, value.Y);
    this._body?.setLinearVelocity(this._engine.toPhysics(this._velocity));
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
    return this._children.find((child) => child.ClassName === className);
  }
  IsA(className) {
    return this.ClassName === canonicalClass(className) || className === 'Instance';
  }
  GetAttribute(name) {
    return this._attributes[name];
  }
  SetAttribute(name, value) {
    if (value === undefined) {
      delete this._attributes[name];
      return;
    }
    this._attributes[name] = value;
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
  if (node.ClassName === 'Object2D') {
    for (const key of Object.keys(OBJECT_DEFAULTS)) data[key] = node[key];
    data.Position = { X: node.Position.X, Y: node.Position.Y };
  }
  if (node.ClassName.endsWith('Script')) {
    data.Source = node.Source;
    data.Enabled = node.Enabled;
  }
  return data;
}
export function deserializeNode(data, preserveIds = true) {
  const node = new SceneNode(data.className, data.name, preserveIds ? data.id : undefined);
  if (data.attributes) node._attributes = decodeAttribute(data.attributes);
  if (node.ClassName === 'Object2D') {
    for (const key of Object.keys(OBJECT_DEFAULTS))
      if (data[key] !== undefined) node[key] = structuredClone(data[key]);
    node.Position = data.Position || new Vector2();
  }
  if (node.ClassName.endsWith('Script')) {
    node.Source = data.Source || '';
    node.Enabled = data.Enabled !== false;
  }
  for (const child of data.children || []) deserializeNode(child, preserveIds).Parent = node;
  return node;
}

/** Projects are data only. Scripts execute only when Play is explicitly requested. */
export function validateProject(project) {
  if (project?.format !== 'openengine' || project.version !== 1 || !Array.isArray(project.services))
    throw new Error('Expected an OpenEngine version 1 project');
  if (!project.name || typeof project.name !== 'string') throw new Error('Project needs a name');
  if (project.assets !== undefined) {
    if (!project.assets || Array.isArray(project.assets) || typeof project.assets !== 'object')
      throw new Error('Invalid asset collection');
    for (const [name, asset] of Object.entries(project.assets)) {
      if (!asset || typeof asset.data !== 'string')
        throw new Error('Asset must contain embedded data: ' + name);
    }
  }
  const ids = new Set();
  let count = 0;
  const visit = (node, depth = 0) => {
    if (++count > 20000 || depth > 100) throw new Error('Scene exceeds supported size/depth');
    if (!CLASSES.includes(canonicalClass(node.className)) || typeof node.name !== 'string')
      throw new Error('Invalid scene node');
    if (typeof node.id !== 'string' || ids.has(node.id))
      throw new Error('Missing or duplicate instance id');
    ids.add(node.id);
    if (node.attributes) encodeAttribute(node.attributes);
    if (canonicalClass(node.className) === 'Object2D') {
      for (const n of [
        node.Position?.X,
        node.Position?.Y,
        node.Size?.X,
        node.Size?.Y,
        node.Rotation ?? 0,
      ])
        if (!Number.isFinite(n)) throw new Error(`Invalid transform: ${node.name}`);
      if (node.Size.X <= 0 || node.Size.Y <= 0) throw new Error('Object size must be positive');
      for (const key of ['Layer', 'Friction', 'Restitution'])
        if (node[key] !== undefined && !Number.isFinite(node[key]))
          throw new Error('Invalid numeric property: ' + key);
      if (node.Texture !== undefined && typeof node.Texture !== 'string')
        throw new Error('Texture must be a string');
      if (!['Circle', 'Box'].includes(node.Shape)) throw new Error('Unknown shape');
    }
    if (node.className.endsWith('Script') && typeof node.Source !== 'string')
      throw new Error('Script source must be text');
    if (!Array.isArray(node.children)) throw new Error('Children must be an array');
    for (const child of node.children) visit(child, depth + 1);
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
