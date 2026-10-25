import { SceneNode, deserializeNode, serializeNode, validateProject } from '../engine/scene.js';
import { Signal } from '../engine/signal.js';

/** Editor documents never share instance state with a running game. */
export class StudioStore {
  constructor(project) {
    this.Changed = new Signal();
    this.undoStack = [];
    this.redoStack = [];
    this.selectedId = 'player';
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
  get workspace() {
    return this.root.FindFirstChild('Workspace');
  }
  restore(project) {
    validateProject(project);
    this.metadata = structuredClone(project);
    delete this.metadata.services;
    this.root = new SceneNode('Folder', 'game');
    for (const data of project.services) deserializeNode(data).Parent = this.root;
  }
  select(node) {
    this.selectedId = node?.Id;
    this.Changed.Fire('selection');
  }
  transact(action, group) {
    const before = this.project;
    try {
      action();
    } catch (error) {
      this.restore(before);
      throw error;
    }
    if (JSON.stringify(before) === JSON.stringify(this.project)) return;
    this.record(before, group);
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
    this.selectedId = undefined;
    this.Changed.Fire('selection');
  }
  canRemove(node) {
    return node && node.Parent !== this.root;
  }
  add(className) {
    const selected = this.selected;
    let parent = selected || this.workspace;
    if (
      className === 'Object2D' &&
      (!selected || (selected.Parent === this.root && selected.Name === 'ScriptService'))
    )
      parent = this.workspace;
    if (parent.ClassName.endsWith('Script')) parent = parent.Parent;
    const node = new SceneNode(className);
    if (className === 'Script')
      node.Source = 'local object = script.Parent\n\nprint("Hello from", object.Name)\n';
    if (className === 'ModuleScript')
      node.Source =
        'local Module = {}\n\nfunction Module.Hello()\n    return "Hello"\nend\n\nreturn Module\n';
    this.transact(() => {
      node.Parent = parent;
    });
    this.expanded.add(parent.Id);
    this.select(node);
    return node;
  }
  remove() {
    if (this.canRemove(this.selected)) this.transact(() => this.selected.Destroy());
  }
  duplicate() {
    if (!this.canRemove(this.selected)) return;
    const node = this.selected.Clone();
    node.Name += ' Copy';
    if (node.ClassName === 'Object2D') node.Position = node.Position.Add({ X: 30, Y: 30 });
    this.transact(() => {
      node.Parent = this.selected.Parent;
    });
    this.select(node);
  }
  reparent(node, parent) {
    if (!this.canRemove(node) || parent.ClassName.endsWith('Script')) return;
    this.transact(() => {
      node.Parent = parent;
    });
    this.expanded.add(parent.Id);
    this.Changed.Fire('selection');
  }
}
