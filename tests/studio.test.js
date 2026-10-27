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

test('Lua diagnostics compile without executing and completion context includes engine methods', async () => {
  const { luaSyntaxError } = await import('../src/engine/lua-syntax.js');
  const { completionContext } = await import('../src/studio/lua-api.js');
  assert.equal(luaSyntaxError('while true do end'), null);
  assert.equal(luaSyntaxError('local x = 1\nlocal =').line, 2);
  const store = new StudioStore(createProject('Test'));
  const script = store.add('Script');
  const context = completionContext(
    'Input',
    'local Input = game:GetService("InputService")',
    script,
    store.workspace,
  );
  assert.ok(context.methods.IsKeyDown);
  assert.ok(completionContext('workspace', '', script, store.workspace).methods.Raycast);
});

test('project-local reusable templates create isolated copies and survive document history', () => {
  const store = new StudioStore(createProject('Templates'));
  const original = store.add('Object2D');
  original.Name = 'Crate';
  original.SetAttribute('Health', 50);
  store.saveTemplate();
  store.select(store.workspace);
  const copy = store.insertTemplate('Crate');
  assert.notEqual(copy.Id, original.Id);
  assert.equal(copy.GetAttribute('Health'), 50);
  copy.SetAttribute('Health', 1);
  assert.equal(original.GetAttribute('Health'), 50);
  const saved = store.project;
  const reopened = new StudioStore(saved);
  assert.equal(reopened.metadata.editorTemplates.length, 1);
  reopened.select(reopened.workspace);
  assert.equal(reopened.insertTemplate('Crate').Name, 'Crate');
});
