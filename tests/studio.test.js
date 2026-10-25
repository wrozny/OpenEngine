import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioStore } from '../src/studio/store.js';
import { createProject } from '../src/studio/projects.js';

test('multi-selection delete and duplicate are single undoable document edits', () => {
  const store = new StudioStore(createProject('Test'));
  const a = store.add('Object2D');
  store.select(store.workspace);
  const b = store.add('Object2D');
  store.selectMany([a, b]);
  store.duplicate();
  assert.equal(store.workspace.GetChildren().length, 4);
  assert.equal(store.selection.length, 2);
  store.remove();
  assert.equal(store.workspace.GetChildren().length, 2);
  store.undo();
  assert.equal(store.workspace.GetChildren().length, 4);
  store.undo();
  assert.equal(store.workspace.GetChildren().length, 2);
});
test('controller insertion creates an appropriate owner and 3D project data is isolated', () => {
  const store = new StudioStore(createProject('Three', '3D'));
  const controller = store.add('PlayerController3D');
  assert.equal(controller.Parent.ClassName, 'Object3D');
  store.transact(() => (controller.Speed = 20));
  store.undo();
  assert.equal(store.selected.Speed, 7);
  assert.throws(() => store.add('Object2D'), /dimension/);
});
