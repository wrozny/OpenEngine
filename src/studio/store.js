import { isUINode, isUIElement } from '../engine/ui-schema.js';
import { UDim2 } from '../engine/ui-types.js';
import {
  SceneNode,
  deserializeNode,
  serializeNode,
  validateProject,
  normalizeProject,
  isObject,
  isScriptNode,
} from '../engine/scene.js';
import { Vector2, Vector3 } from '../engine/math.js';
import { Signal } from '../engine/signal.js';

/** The authoring document owns history and selection; Play receives only serialized copies. */
export class StudioStore {
  constructor(project) {
    this.Changed = new Signal();
    this.undoStack = [];
    this.redoStack = [];
    this.selectedId = undefined;
    this.selectedIds = new Set();
    this.expanded = new Set(['workspace', 'scripts']);
    this.restore(project);
  }
  get project() {
    return { ...this.metadata, services: this.root.GetChildren().map(serializeNode) };
  }
  get nodes() {
    return this.root.GetDescendants();
  }
  get selected() {
    return this.nodes.find((node) => node.Id === this.selectedId);
  }
  get selection() {
    return this.nodes.filter((node) => this.selectedIds.has(node.Id));
  }
  get workspace() {
    return this.root.FindFirstChild('Workspace');
  }
  get uiService() {
    return this.root.FindFirstChild('UIService');
  }
  addUI(className) {
    let parent = this.selected;
    if (className === 'ScreenGui') parent = this.uiService;
    else {
      while (parent && !['Frame', 'ScreenGui'].includes(parent.ClassName)) parent = parent.Parent;
      if (!parent) parent = this.uiService.GetChildren().find((n) => n.ClassName === 'ScreenGui');
    }
    const node = new SceneNode(className);
    this.transact(() => {
      if (!parent) {
        parent = new SceneNode('ScreenGui', 'ScreenGui');
        parent.Parent = this.uiService;
      }
      node.Parent = parent;
    });
    this.expanded.add(this.uiService.Id);
    this.expanded.add(parent.Id);
    this.select(node);
    return node;
  }
  get dimension() {
    return this.metadata.dimension || '2D';
  }
  restore(project) {
    project = normalizeProject(project);
    this.metadata = structuredClone(project);
    delete this.metadata.services;
    this.root = new SceneNode('Folder', 'game');
    for (const data of project.services) deserializeNode(data).Parent = this.root;
  }
  select(node, additive = false) {
    if (!additive) this.selectedIds.clear();
    if (node) {
      if (additive && this.selectedIds.has(node.Id)) this.selectedIds.delete(node.Id);
      else this.selectedIds.add(node.Id);
    }
    this.selectedId =
      node && this.selectedIds.has(node.Id) ? node.Id : [...this.selectedIds].at(-1);
    this.Changed.Fire('selection');
  }
  selectMany(nodes, additive = false) {
    if (!additive) this.selectedIds.clear();
    for (const node of nodes) this.selectedIds.add(node.Id);
    this.selectedId = nodes.at(-1)?.Id;
    this.Changed.Fire('selection');
  }
  transact(action, group) {
    const before = this.project;
    try {
      action();
    } catch (error) {
      this.restore(before);
      this.Changed.Fire('document');
      throw error;
    }
    if (JSON.stringify(before) !== JSON.stringify(this.project)) this.record(before, group);
  }
  record(before, group) {
    if (!group || this.lastGroup !== group || performance.now() - this.lastEdit > 1000) {
      this.undoStack.push(before);
      if (this.undoStack.length > 80) this.undoStack.shift();
    }
    this.lastGroup = group;
    this.lastEdit = performance.now();
    this.redoStack = [];
    this.Changed.Fire('document');
  }
  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.project);
    this.restore(this.undoStack.pop());
    this.lastGroup = null;
    this.Changed.Fire('document');
  }
  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.project);
    this.restore(this.redoStack.pop());
    this.lastGroup = null;
    this.Changed.Fire('document');
  }
  load(project) {
    this.transact(() => this.restore(project));
    this.selectedIds.clear();
    this.selectedId = undefined;
    this.expanded.add(this.workspace.Id);
    this.expanded.add(this.root.FindFirstChild('ScriptService').Id);
    this.Changed.Fire('selection');
  }
  canRemove(node) {
    return node && node.Parent !== this.root;
  }
  topSelection() {
    return this.selection.filter(
      (node) =>
        this.canRemove(node) &&
        !this.selection.some((other) => other !== node && other.GetDescendants().includes(node)),
    );
  }
  add(className, { position } = {}) {
    if (isUINode({ ClassName: className })) return this.addUI(className);
    if (className === 'PhysicsObject') className = 'Object2D';
    if (
      (className === 'Object2D' && this.dimension === '3D') ||
      (className === 'Object3D' && this.dimension !== '3D')
    )
      throw new Error('Insert an object matching this project’s dimension');
    let parent = this.selected || this.workspace;
    if (className.startsWith('Object'))
      for (let p = parent; p; p = p.Parent)
        if (p === this.uiService) {
          parent = this.workspace;
          break;
        }
    if (isScriptNode(parent) || (parent.Name === 'ScriptService' && className.startsWith('Object')))
      parent = this.workspace;
    if (className.startsWith('PlayerController')) {
      const required = className.endsWith('3D') ? 'Object3D' : 'Object2D';
      if (required !== (this.dimension === '3D' ? 'Object3D' : 'Object2D'))
        throw new Error('Controller must match the project dimension');
      if (parent.ClassName !== required) {
        const actor = new SceneNode(required, 'Player');
        actor.Anchored = false;
        actor.Position = position || actor.Position;
        parent = actor;
      }
    }
    const node = new SceneNode(className);
    if (['Script', 'ServerScript', 'LocalScript'].includes(className))
      node.Source = 'local object = script.Parent\n\nprint("Hello from", object.Name)\n';
    if (className === 'ModuleScript')
      node.Source =
        'local Module = {}\n\nfunction Module.Hello()\n    return "Hello"\nend\n\nreturn Module\n';
    if (position && isObject(node)) node.Position = position;
    this.transact(() => {
      if (!parent.Parent && parent !== this.root && parent !== this.workspace)
        parent.Parent = this.workspace;
      node.Parent = parent;
    });
    this.expanded.add(parent.Id);
    this.select(node);
    return node;
  }
  remove() {
    const targets = this.topSelection();
    if (!targets.length) return;
    this.transact(() => {
      for (const target of targets) target.Destroy();
    });
    this.select(undefined);
  }
  duplicate() {
    const targets = this.topSelection();
    if (!targets.length) return;
    const clones = targets.map((target) => {
      const clone = target.Clone();
      clone.Name += ' Copy';
      if (isUIElement(clone))
        clone.Position = new UDim2(
          clone.Position.XScale,
          clone.Position.XOffset + 16,
          clone.Position.YScale,
          clone.Position.YOffset + 16,
        );
      if (isObject(clone))
        clone.Position = clone.Position.Add(
          this.dimension === '3D' ? new Vector3(1, 0, 1) : new Vector2(30, 30),
        );
      return { clone, parent: target.Parent };
    });
    this.transact(() => {
      for (const { clone, parent } of clones) clone.Parent = parent;
    });
    this.selectMany(clones.map((item) => item.clone));
  }
  reparent(node, parent) {
    if (!this.canRemove(node) || isScriptNode(parent)) return;
    this.transact(() => {
      node.Parent = parent;
    });
    this.expanded.add(parent.Id);
    this.Changed.Fire('selection');
  }
}
