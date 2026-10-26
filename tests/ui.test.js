import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import {
  SceneNode,
  serializeNode,
  deserializeNode,
  normalizeProject,
  validateProject,
} from '../src/engine/scene.js';
import { UDim2 } from '../src/engine/ui-types.js';
import { Vector2 } from '../src/engine/math.js';
import { createProject } from '../src/studio/projects.js';
import { StudioStore } from '../src/studio/store.js';
import { computeUILayout } from '../src/ui/layout.js';
import { createDialog } from '../src/ui/templates.js';
const child = (node, path) => path.split('.').reduce((n, name) => n.FindFirstChild(name), node);
const advance = (engine, n = 60) => {
  for (let i = 0; i < n; i++) engine.update(1 / 60);
};

test('UI service migration is deterministic, serializes UI values, and rejects malformed hierarchy', () => {
  const old = createProject();
  old.services.pop();
  const a = normalizeProject(old),
    b = normalizeProject(old);
  assert.deepEqual(a, b);
  assert.equal(old.services.length, 2);
  const store = new StudioStore(old);
  const screen = createDialog();
  screen.Parent = store.uiService;
  const copy = deserializeNode(serializeNode(screen));
  assert.ok(child(copy, 'Panel').Position instanceof UDim2);
  assert.equal(child(copy, 'Panel.Actions.Close').Text, 'Close');
  assert.throws(() => (child(copy, 'Panel').Parent = store.workspace), /UI elements/);
  const malformed = store.project;
  malformed.services[0].children.push(malformed.services[2].children.pop());
  assert.throws(() => validateProject(malformed), /ScreenGui/);
});

test('responsive dialog fits phone and desktop and its flow controls share available width', () => {
  const service = new SceneNode('UIService', 'UIService'),
    screen = createDialog();
  screen.Parent = service;
  for (const width of [390, 768, 1280]) {
    const layout = computeUILayout(service, width, 844),
      panel = layout.get(child(screen, 'Panel').Id),
      close = layout.get(child(screen, 'Panel.Actions.Close').Id),
      confirm = layout.get(child(screen, 'Panel.Actions.Confirm').Id);
    assert.equal(panel.width, Math.min(width - 48, 520));
    assert.equal(panel.x, (width - panel.width) / 2);
    assert.equal(close.width, confirm.width);
    assert.equal(close.x - confirm.x, confirm.width + 12);
    assert.ok(close.x + close.width <= width - 24);
  }
  screen.ScaleMode = 'Fit';
  const fit = computeUILayout(service, 640, 360);
  assert.equal(fit.get(screen.Id).scale, 0.5);
  screen.ScaleMode = 'Responsive';
  const safe = computeUILayout(service, 390, 844, {
    insets: { left: 8, right: 8, top: 30, bottom: 20 },
  });
  assert.equal(safe.get(screen.Id).height, 794);
});

test('row wrapping, anchors, size constraints and visibility use deterministic layout', () => {
  const service = new SceneNode('UIService', 'UIService'),
    screen = new SceneNode('ScreenGui');
  screen.Parent = service;
  const frame = new SceneNode('Frame');
  Object.assign(frame, {
    Position: new UDim2(),
    Size: new UDim2(1, 0, 1, 0),
    Layout: 'Row',
    Wrap: true,
    Padding: 10,
    Gap: 10,
  });
  frame.Parent = screen;
  const items = Array.from({ length: 3 }, () => {
    const n = new SceneNode('TextButton');
    n.Size = new UDim2(0, 100, 0, 40);
    n.Parent = frame;
    return n;
  });
  let layout = computeUILayout(service, 250, 200);
  assert.equal(layout.get(items[1].Id).y, 10);
  assert.equal(layout.get(items[2].Id).y, 60);
  items[1].Visible = false;
  layout = computeUILayout(service, 250, 200);
  assert.equal(layout.has(items[1].Id), false);
  assert.equal(layout.get(items[2].Id).y, 10);
  frame.Layout = 'Absolute';
  items[0].Size = new UDim2(1, 0, 1, 0);
  items[0].MaxSize = { X: 80, Y: 60 };
  items[0].AnchorPoint = new Vector2(0.5, 0.5);
  items[0].Position = new UDim2(0.5, 0, 0.5, 0);
  layout = computeUILayout(service, 250, 200);
  assert.equal(layout.get(items[0].Id).x, 85);
  assert.equal(layout.get(items[0].Id).width, 80);
});

test('Lua authored UI signals, tweens and script destruction clean their subscriptions', () => {
  const project = createProject();
  const service = deserializeNode(project.services[2]);
  const screen = createDialog();
  screen.Parent = service;
  const script = new SceneNode('Script', 'Handler');
  script.Parent = child(screen, 'Panel.Actions.Confirm');
  script.Source = `local element = script.Parent\nelement.OnClick:Connect(function()\n local tween = element:Tween({Opacity=0.2, Position=UDim2.new(0.5,10,0,20)},0.1,"Linear")\n tween.Completed:Connect(function(done) element:SetAttribute("Finished",done) end)\nend)\nelement.OnHoverStart:Connect(function() element.Text="Hovered" end)\nelement.OnHoverEnd:Connect(function() element.Text="Left" end)`;
  project.services[2] = serializeNode(service);
  const engine = new Engine(project);
  engine.start();
  const button = child(engine.ui, 'Dialog.Panel.Actions.Confirm');
  button.OnHoverStart.Fire();
  assert.equal(button.Text, 'Hovered');
  button.OnHoverEnd.Fire();
  assert.equal(button.Text, 'Left');
  button.OnClick.Fire();
  advance(engine, 10);
  assert.equal(button.Opacity, 0.2);
  assert.equal(button.Position.XScale, 0.5);
  assert.equal(button.GetAttribute('Finished'), true);
  button.OnClick.Fire();
  button.FindFirstChild('Handler').Destroy();
  assert.equal(engine.uiTweens.active.size, 0);
  assert.equal(button.OnClick.listeners.size, 0);
  assert.deepEqual(
    engine.logs.filter((e) => e.level === 'error'),
    [],
  );
  engine.dispose();
});

test('collision enter/leave fires once per overlap and teardown emits a leave in both physics dimensions', () => {
  for (const dimension of ['2D', '3D']) {
    const engine = new Engine(createProject('Contacts', dimension));
    engine.physicsWorld.setGravity(dimension === '3D' ? { X: 0, Y: 0, Z: 0 } : { X: 0, Y: 0 });
    const trigger = new SceneNode(dimension === '3D' ? 'Object3D' : 'Object2D', 'Trigger'),
      actor = new SceneNode(trigger.ClassName, 'Actor');
    trigger.Sensor = true;
    trigger.Size = dimension === '3D' ? { X: 4, Y: 4, Z: 4 } : { X: 100, Y: 100 };
    actor.Anchored = false;
    actor.Parent = engine.workspace;
    trigger.Parent = engine.workspace;
    let starts = 0,
      ends = 0;
    trigger.OnCollisionStart.Connect(() => starts++);
    trigger.OnCollisionEnd.Connect(() => ends++);
    engine.start();
    advance(engine, 5);
    assert.equal(starts, 1);
    assert.equal(trigger.OnCollision, trigger.OnCollisionStart);
    assert.deepEqual(trigger.GetTouchingObjects(), [actor]);
    advance(engine, 5);
    assert.equal(starts, 1);
    actor.Position = dimension === '3D' ? { X: 30, Y: 0, Z: 0 } : { X: 300, Y: 0 };
    advance(engine, 5);
    assert.equal(ends, 1);
    actor.Position = dimension === '3D' ? { X: 0, Y: 0, Z: 0 } : { X: 0, Y: 0 };
    advance(engine, 5);
    assert.equal(starts, 2);
    actor.Destroy();
    assert.equal(ends, 2);
    assert.deepEqual(trigger.GetTouchingObjects(), []);
    engine.dispose();
  }
});

test('visual UI edits, duplicate, history and service protection round trip', () => {
  const store = new StudioStore(createProject());
  const button = store.addUI('TextButton');
  assert.equal(button.Parent.ClassName, 'ScreenGui');
  store.duplicate();
  assert.equal(store.selected.Position.XOffset, button.Position.XOffset + 16);
  store.undo();
  assert.equal(store.uiService.GetChildren()[0].GetChildren().length, 1);
  assert.equal(store.canRemove(store.uiService), false);
  store.redo();
  assert.equal(store.uiService.GetChildren()[0].GetChildren().length, 2);
});

test('flex growth redistributes free space after a child reaches its maximum', () => {
  const service = new SceneNode('UIService', 'UIService'),
    screen = new SceneNode('ScreenGui');
  screen.Parent = service;
  const frame = new SceneNode('Frame');
  frame.Parent = screen;
  Object.assign(frame, {
    Position: new UDim2(),
    Size: new UDim2(1, 0, 1, 0),
    Layout: 'Row',
    Padding: 0,
    Gap: 0,
  });
  const a = new SceneNode('TextButton'),
    b = new SceneNode('TextButton');
  for (const node of [a, b]) {
    node.Parent = frame;
    node.Size = new UDim2(0, 50, 0, 40);
    node.FlexGrow = 1;
  }
  a.MaxSize = { X: 80, Y: 0 };
  const layout = computeUILayout(service, 300, 200);
  assert.equal(layout.get(a.Id).width, 80);
  assert.equal(layout.get(b.Id).width, 220);
});
