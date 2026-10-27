import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { SceneNode, serializeNode, deserializeNode } from '../src/engine/scene.js';
import { createProject } from '../src/studio/projects.js';
import { Vector2, Vector3 } from '../src/engine/math.js';
import { ReplicaPresentation } from '../src/network/presentation.js';
import { computeUILayout } from '../src/ui/layout.js';
const tick = (engine, n) => {
  for (let i = 0; i < n; i++) engine.update(1 / 60);
};
test('Car3D raycast suspension supports a chassis, drives, steers, brakes and cleans solver callbacks', () => {
  const engine = new Engine(createProject('Cars', '3D'));
  const floor = new SceneNode('Object3D', 'Ground');
  floor.Size = new Vector3(300, 1, 300);
  floor.Position = new Vector3(0, -0.5, 0);
  floor.Parent = engine.workspace;
  const bump = new SceneNode('Object3D', 'Bump');
  bump.Size = new Vector3(12, 0.3, 6);
  bump.Position = new Vector3(0, 0.15, -10);
  bump.Rotation = new Vector3(0.06, 0, 0);
  bump.Parent = engine.workspace;
  const actor = new SceneNode('Object3D', 'Car');
  Object.assign(actor, {
    Size: new Vector3(1.8, 0.65, 3.6),
    Position: new Vector3(0, 2, 0),
    Anchored: false,
    Mass: 700,
  });
  actor.Parent = engine.workspace;
  const car = new SceneNode('Car3D', 'Drive');
  car.Parent = actor;
  engine.start();
  try {
    tick(engine, 120);
    assert.ok(actor.Position.Y > 0.5 && actor.Position.Y < 1.5);
    car.SetInput(0.7, 0, 0);
    tick(engine, 180);
    assert.ok(car.Speed > 3);
    assert.ok(actor.Position.Z < -3);
    assert.ok(car.GetWheelPosition(1));
    assert.ok(Number.isFinite(actor.Position.Y));
    const z = actor.Rotation.Y;
    car.SetInput(0.5, 0.6, 0);
    tick(engine, 90);
    assert.ok(Math.abs(actor.Rotation.Y - z) > 0.1);
    car.SetInput(0, 0, 1);
    tick(engine, 180);
    assert.ok(car.Speed < 2);
    const clone = deserializeNode(serializeNode(car));
    assert.equal(clone.EngineForce, 3200);
    assert.throws(() => car.SetInput(NaN, 0), /finite/);
    car.Destroy();
    tick(engine, 2);
    assert.equal(engine.vehicles.entries.size, 0);
    assert.ok(engine.world.bodies.includes(actor._body));
  } finally {
    engine.dispose();
  }
});
test('Car2D suspension supports and drives a side-view vehicle', () => {
  const engine = new Engine(createProject());
  engine.physics.SetGravity(new Vector2(0, 980));
  const floor = new SceneNode('Object2D');
  floor.Size = new Vector2(5000, 40);
  floor.Position = new Vector2(0, 80);
  floor.Parent = engine.workspace;
  const actor = new SceneNode('Object2D');
  Object.assign(actor, {
    Size: new Vector2(100, 30),
    Position: new Vector2(0, -30),
    Anchored: false,
  });
  actor.Parent = engine.workspace;
  const car = new SceneNode('Car2D');
  car.Parent = actor;
  engine.start();
  try {
    tick(engine, 120);
    assert.ok(actor.Position.Y < 45);
    car.SetInput(0.5, 0, 0);
    tick(engine, 90);
    assert.ok(actor.Position.X > 30);
    assert.ok(car.GetWheelPosition(1));
  } finally {
    engine.dispose();
  }
});
test('remote presentation buffers jitter, predicts briefly and freezes rather than extrapolating forever', () => {
  const node = new SceneNode('Object3D');
  node.Velocity = new Vector3(10, 0, 0);
  const p = new ReplicaPresentation();
  p.capture(node, new Vector3(0, 0, 0), new Vector3(), true, 0);
  p.capture(node, new Vector3(1, 0, 0), new Vector3(), false, 100);
  assert.equal(p.get(node, 150).Position.X, 0.5);
  assert.equal(p.get(node, 250).Position.X, 1.5);
  assert.equal(p.get(node, 1000).Position.X, 2.5);
  node.Position = new Vector3(2, 0, 0);
  p.correct(node, new Vector3(1, 0, 0), 0);
  node.Position = new Vector3(1, 0, 0);
  assert.equal(p.owned(node, 0).Position.X, 2);
  assert.ok(p.owned(node, 100).Position.X < 1.5);
});
test('grid/list/padding modifiers are serialized and produce responsive layout', () => {
  const service = new SceneNode('UIService', 'UIService'),
    screen = new SceneNode('ScreenGui');
  screen.Parent = service;
  const frame = new SceneNode('Frame');
  frame.Size = { XScale: 1, XOffset: 0, YScale: 1, YOffset: 0 };
  frame.Position = { XScale: 0, XOffset: 0, YScale: 0, YOffset: 0 };
  frame.Parent = screen;
  const grid = new SceneNode('UIGridLayout');
  grid.Columns = 2;
  grid.Parent = frame;
  const buttons = Array.from({ length: 3 }, () => {
    const n = new SceneNode('TextButton');
    n.Parent = frame;
    return n;
  });
  const r = computeUILayout(service, 400, 400);
  assert.equal(r.get(buttons[0].Id).y, r.get(buttons[1].Id).y);
  assert.ok(r.get(buttons[2].Id).y > r.get(buttons[0].Id).y);
  assert.equal(deserializeNode(serializeNode(grid)).Columns, 2);
});
