import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { SceneNode, serializeNode, deserializeNode } from '../src/engine/scene.js';
import { Vector2, Vector3 } from '../src/engine/math.js';
import { createProject } from '../src/studio/projects.js';
import { LEGACY_CONTROLLERS } from '../src/engine/legacy-controllers.js';
import { CONTROLLER_2D, CONTROLLER_3D } from '../src/engine/controllers.js';
import { wedgeGeometry } from '../src/engine/wedge-geometry.js';

function object(name, position, size, extra = {}) {
  const node = new SceneNode(size instanceof Vector3 ? 'Object3D' : 'Object2D', name);
  Object.assign(node, { Position: position, Size: size }, extra);
  return node;
}
function scene(dimension, obstacles = [], position) {
  const three = dimension === '3D',
    doc = createProject('Movement', dimension);
  const floor = object(
    'Floor',
    three ? new Vector3(0, -0.5, 0) : new Vector2(0, 20),
    three ? new Vector3(100, 1, 100) : new Vector2(2000, 40),
  );
  const actor = object(
    'Actor',
    position || (three ? new Vector3(0, 1, 0) : new Vector2(0, -24)),
    three ? new Vector3(1, 2, 1) : new Vector2(30, 48),
    { Anchored: false },
  );
  const controller = new SceneNode(three ? 'PlayerController3D' : 'PlayerController2D');
  controller.Mode = 'Platformer';
  controller.Speed = three ? 4 : 120;
  controller.Parent = actor;
  doc.services[0].children = [floor, ...obstacles, actor].map(serializeNode);
  const engine = new Engine(doc);
  engine.start();
  for (let i = 0; i < 30; i++) engine.update(1 / 60);
  return { engine, actor: engine.workspace.FindFirstChild('Actor') };
}
function walk(engine, seconds, key = 'd') {
  engine.input.keys.add(key);
  const heights = [];
  for (let i = 0; i < seconds * 60; i++) {
    engine.update(1 / 60);
    heights.push(engine.workspace.FindFirstChild('Actor').Position.Y);
  }
  engine.input.keys.clear();
  assert.deepEqual(
    engine.logs.filter((e) => e.level === 'error'),
    [],
  );
  return heights;
}

test('default 3D controller crosses curbs without jumping and respects wall/ceiling clearance', () => {
  const curb = () => object('Curb', new Vector3(3, 0.15, 0), new Vector3(2, 0.3, 8));
  let session = scene('3D', [curb()]);
  const heights = walk(session.engine, 1.6);
  assert.ok(session.actor.Position.X > 5.5);
  assert.ok(Math.max(...heights) > 1.25);
  assert.ok(Math.max(...heights) < 1.5);
  session.engine.dispose();
  session = scene('3D', [object('Tall wall', new Vector3(3, 1, 0), new Vector3(2, 2, 8))]);
  walk(session.engine, 1.6);
  assert.ok(session.actor.Position.X < 1.6);
  assert.ok(session.actor.Position.Y < 1.1);
  session.engine.dispose();
  session = scene('3D', [
    curb(),
    object('Low ceiling', new Vector3(3, 2.3, 0), new Vector3(5, 0.3, 8)),
  ]);
  walk(session.engine, 1.6);
  assert.ok(session.actor.Position.X < 1.6);
  assert.ok(session.actor.Position.Y < 1.2);
  session.engine.dispose();
});

test('default controller climbs a real wedge, lands on its platform, and cannot climb a steep wedge', () => {
  const ramp = object('Ramp', new Vector3(0, 1, 0), new Vector3(5, 2, 4), { Shape: 'Wedge' });
  const deck = object('Deck', new Vector3(0, 1, 4), new Vector3(5, 2, 4));
  let session = scene('3D', [ramp, deck], new Vector3(0, 1, -4));
  walk(session.engine, 2.5, 's');
  assert.ok(session.actor.Position.Z > 3, JSON.stringify(session.actor.Position));
  assert.ok(Math.abs(session.actor.Position.Y - 3) < 0.15, JSON.stringify(session.actor.Position));
  session.engine.dispose();
  session = scene(
    '3D',
    [object('Too steep', new Vector3(0, 2, 0), new Vector3(5, 4, 2), { Shape: 'Wedge' })],
    new Vector3(0, 1, -3),
  );
  walk(session.engine, 1.5, 's');
  assert.ok(session.actor.Position.Z < -1.35, JSON.stringify(session.actor.Position));
  assert.ok(session.actor.Position.Y < 1.15);
  session.engine.dispose();
});

test('2D platformer crosses a low step while an airborne character cannot step up a ledge', () => {
  let session = scene('2D', [object('Step', new Vector2(100, -6), new Vector2(80, 12))]);
  const heights = walk(session.engine, 1.4);
  assert.ok(session.actor.Position.X > 150, JSON.stringify(session.actor.Position));
  assert.ok(Math.min(...heights) < -33);
  session.engine.dispose();
  session = scene(
    '3D',
    [object('Floating ledge', new Vector3(3, 1, 0), new Vector3(2, 0.3, 8))],
    new Vector3(0, 5, 0),
  );
  session.actor.Position = new Vector3(1.4, 2, 0);
  session.actor.Velocity = new Vector3(4, 2, 0);
  session.engine.physics.MoveCharacter(session.actor, new Vector3(4, 2, 0), 1 / 60, 0.45, 50);
  assert.equal(session.actor.Position.Y, 2);
  assert.equal(session.actor.Velocity.Y, 2);
  session.engine.dispose();
});

test('untouched old controller sources upgrade while edited scripts and settings stay intact', () => {
  for (const [className, source] of [
    ['PlayerController2D', CONTROLLER_2D],
    ['PlayerController3D', CONTROLLER_3D],
  ]) {
    const node = new SceneNode(className);
    const data = serializeNode(node);
    data.Source = LEGACY_CONTROLLERS[className][0];
    delete data.StepHeight;
    delete data.MaxSlopeAngle;
    const migrated = deserializeNode(data);
    assert.equal(migrated.Source, source);
    assert.equal(migrated.MaxSlopeAngle, 50);
    assert.ok(migrated.StepHeight > 0);
    data.Source = 'print("Custom controller")';
    data.StepHeight = 0.12;
    assert.equal(deserializeNode(data).Source, data.Source);
    assert.equal(deserializeNode(data).StepHeight, 0.12);
  }
});

test('wedge geometry and collision agree on slope normals and dimensions', () => {
  const doc = createProject('Wedge', '3D');
  doc.services[0].children.push(
    serializeNode(object('Ramp', new Vector3(0, 1, 0), new Vector3(4, 2, 4), { Shape: 'Wedge' })),
  );
  const engine = new Engine(doc);
  const hit = engine.raycast(new Vector3(0, 5, 0), new Vector3(0, -10, 0));
  assert.ok(Math.abs(hit.Position.Y - 1) < 1e-5);
  assert.ok(hit.Normal.Y > 0.8 && hit.Normal.Z < -0.4);
  engine.dispose();
  const geometry = wedgeGeometry();
  geometry.computeBoundingBox();
  assert.equal(geometry.attributes.position.count, 24);
  assert.equal(geometry.boundingBox.min.y, -0.5);
  assert.equal(geometry.boundingBox.max.y, 0.5);
  geometry.dispose();
});

test('diagonal movement climbs a curb at a leading corner rather than sliding along it', () => {
  const session = scene('3D', [
    object('Long curb', new Vector3(0, 0.15, 3), new Vector3(50, 0.3, 2)),
  ]);
  session.engine.camera.Yaw = 0.35;
  session.engine.input.keys.add('s');
  walk(session.engine, 2, 'd');
  assert.ok(session.actor.Position.Z > 2.7, JSON.stringify(session.actor.Position));
  session.engine.dispose();
});

test('2D platformer follows an inclined surface onto a raised landing without jumping', () => {
  const ramp = object('Incline', new Vector2(140, -20), new Vector2(180, 10), { Rotation: -0.25 });
  const deck = object('Landing', new Vector2(300, -27), new Vector2(150, 40));
  const session = scene('2D', [ramp, deck]);
  walk(session.engine, 2);
  assert.ok(session.actor.Position.X > 220, JSON.stringify(session.actor.Position));
  assert.ok(session.actor.Position.Y < -65, JSON.stringify(session.actor.Position));
  session.engine.dispose();
});

test('uphill jumping near the maximum slope angle keeps the jump launch instead of projecting it away', () => {
  const depth = 8 / Math.tan((49.9 * Math.PI) / 180),
    doc = createProject('Slope jump', '3D');
  const ramp = object('Ramp', new Vector3(0, 4, 0), new Vector3(8, 8, depth), { Shape: 'Wedge' });
  const actor = object(
    'Actor',
    new Vector3(0, 1 + (8 * (-2 + 0.5 + depth / 2)) / depth, -2),
    new Vector3(1, 2, 1),
    { Anchored: false },
  );
  new SceneNode('PlayerController3D').Parent = actor;
  doc.services[0].children = [ramp, actor].map(serializeNode);
  const engine = new Engine(doc);
  engine.start();
  engine.input.keys.add('s');
  engine.input.keys.add(' ');
  engine.update(1 / 60);
  assert.ok(
    engine.workspace.FindFirstChild('Actor').Velocity.Y > 8,
    'ground projection must not cancel a valid jump',
  );
  engine.dispose();
});
