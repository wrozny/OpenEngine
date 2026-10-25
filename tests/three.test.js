import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { SceneNode, serializeNode, deserializeNode } from '../src/engine/scene.js';
import { Vector3 } from '../src/engine/math.js';
function project(...objects) {
  const workspace = new SceneNode('Folder', 'Workspace', 'workspace'),
    scripts = new SceneNode('Folder', 'ScriptService', 'scripts');
  for (const object of objects) object.Parent = workspace;
  return {
    format: 'openengine',
    version: 1,
    dimension: '3D',
    name: '3D Test',
    services: [workspace, scripts].map(serializeNode),
  };
}
function object(name, position, size, anchored = true, shape = 'Box') {
  const n = new SceneNode('Object3D', name);
  Object.assign(n, { Position: position, Size: size, Anchored: anchored, Shape: shape });
  return n;
}
const advance = (engine, seconds) => {
  for (let i = 0; i < seconds * 60; i++) engine.update(1 / 60);
};

test('3D physics resolves gravity, sphere contacts and closest raycasts', () => {
  const ground = object('Ground', new Vector3(0, -0.5, 0), new Vector3(30, 1, 30));
  const ball = object('Ball', new Vector3(0, 5, 0), new Vector3(1, 1, 1), false, 'Sphere');
  const engine = new Engine(project(ground, ball));
  engine.start();
  const instance = engine.workspace.FindFirstChild('Ball');
  let collisions = 0;
  instance.OnCollision.Connect(() => collisions++);
  advance(engine, 3);
  assert.ok(Math.abs(instance.Position.Y - 0.5) < 0.05);
  assert.ok(collisions > 0);
  const hit = engine.raycast(new Vector3(0, 10, 0), new Vector3(0, -20, 0));
  assert.equal(hit.Instance.Name, 'Ball');
  assert.ok(hit.Normal.Y > 0.9);
  assert.ok(hit.Distance > 8);
  instance.Position = new Vector3(4, 4, 0);
  instance.Velocity = new Vector3(0, 2, 0);
  engine.update(1 / 60);
  assert.ok(instance.Position.Y > 4);
  assert.deepEqual(
    engine.logs.filter((l) => l.level === 'error'),
    [],
  );
  engine.dispose();
});
test('3D controller walks, jumps from ground, and serializes its settings', () => {
  const ground = object('Ground', new Vector3(0, -0.5, 0), new Vector3(100, 1, 100));
  const actor = object('Player', new Vector3(0, 1, 0), new Vector3(1, 2, 1), false);
  const controller = new SceneNode('PlayerController3D');
  controller.Speed = 8;
  controller.Parent = actor;
  const engine = new Engine(project(ground, actor));
  engine.start();
  advance(engine, 0.5);
  engine.input.keys.add('d');
  advance(engine, 0.5);
  engine.input.keys.clear();
  const player = engine.workspace.FindFirstChild('Player');
  assert.ok(player.Position.X > 3.8 && player.Position.X < 4.1);
  engine.input.keys.add(' ');
  engine.update(1 / 60);
  assert.ok(player.Velocity.Y > 8);
  engine.input.keys.clear();
  advance(engine, 2);
  assert.ok(Math.abs(player.Position.Y - 1) < 0.1);
  assert.equal(deserializeNode(serializeNode(controller)).Speed, 8);
  assert.deepEqual(
    engine.logs.filter((l) => l.level === 'error'),
    [],
  );
  engine.dispose();
});
test('3D free camera flies through geometry and fallen objects are destroyed with descendants', () => {
  const actor = object('Ghost', new Vector3(0, 2, 0), new Vector3(1, 2, 1));
  const controller = new SceneNode('PlayerController3D');
  controller.Mode = 'FreeCamera';
  controller.Parent = actor;
  const fallen = object('Fallen', new Vector3(0, -60, 0), new Vector3(1, 1, 1));
  const child = new SceneNode('Folder', 'Child');
  child.Parent = fallen;
  const wall = object('Wall', new Vector3(0, 2, -2), new Vector3(8, 8, 1));
  const engine = new Engine(project(actor, fallen, wall));
  engine.start();
  const ghost = engine.workspace.FindFirstChild('Ghost');
  const lost = engine.workspace.FindFirstChild('Fallen');
  engine.input.keys.add('w');
  engine.input.keys.add(' ');
  advance(engine, 1);
  assert.ok(ghost.Position.Z < -7);
  assert.ok(ghost.Position.Y > 9);
  assert.equal(lost.Destroyed, true);
  assert.equal(lost.GetChildren().length, 0);
  assert.deepEqual(
    engine.logs.filter((l) => l.level === 'error'),
    [],
  );
  engine.dispose();
});

test('Parcel Panic tasks, football recovery, player respawn, goal and restart run in Lua', async () => {
  const { loadProject } = await import('../tools/project.mjs');
  const engine = new Engine(await loadProject('examples/parcel-panic/project.openengine'));
  engine.start();
  const player = engine.workspace.FindFirstChild('Player');
  for (const parcel of engine.workspace.FindFirstChild('Parcels').GetChildren()) {
    player.Position = parcel.Position;
    engine.update(1 / 60);
  }
  assert.match(engine.ui.widgets.task.text, /2 \/ 4/);
  player.Position = engine.workspace.FindFirstChild('PostBox').Position.Add(new Vector3(0, 1, 2));
  engine.input.keys.add('e');
  engine.update(1 / 60);
  engine.input.keys.clear();
  engine.update(1 / 60);
  assert.match(engine.ui.widgets.task.text, /3 \/ 4/);
  let ball = engine.workspace.FindFirstChild('Football');
  ball.Position = new Vector3(0, -20, 0);
  engine.update(1 / 60);
  assert.equal(ball.Destroyed, true);
  ball = engine.workspace.FindFirstChild('Football');
  assert.ok(ball.Position.Y > 0);
  player.Position = new Vector3(0, -20, 0);
  engine.update(1 / 60);
  assert.ok(player.Position.Y > 0);
  ball.Position = new Vector3(0, 1, -16);
  engine.update(1 / 60);
  assert.equal(engine.workspace.GetAttribute('GoalScored'), true);
  assert.match(engine.ui.widgets.task.text, /4 \/ 4/);
  player.Position = engine.workspace.FindFirstChild('Bell').Position.Add(new Vector3(0, 1, 2));
  engine.input.keys.add('e');
  engine.update(1 / 60);
  assert.equal(engine.ui.State, 'complete');
  engine.ui.OnAction.Fire('restart');
  assert.equal(engine.ui.State, 'playing');
  assert.match(engine.ui.widgets.task.text, /1 \/ 4/);
  assert.equal(engine.workspace.FindFirstChild('Parcels').GetChildren().length, 3);
  assert.deepEqual(
    engine.logs.filter((l) => l.level === 'error'),
    [],
  );
  engine.dispose();
});

test('box textures repeat by each face’s world dimensions', async () => {
  const { BoxGeometry } = await import('three');
  const { tileGeometry } = await import('../src/engine/texture-uv.js');
  const geometry = tileGeometry(new BoxGeometry(1, 1, 1), {
    Shape: 'Box',
    Size: new Vector3(2, 4, 6),
    TextureScale: 2,
  });
  const uv = geometry.attributes.uv,
    n = geometry.attributes.normal;
  const maximum = (axis, component) =>
    Math.max(
      ...Array.from({ length: uv.count }, (_, i) =>
        Math.abs(n.getComponent(i, axis)) > 0.9 ? uv.getComponent(i, component) : 0,
      ),
    );
  assert.equal(maximum(0, 0), 3);
  assert.equal(maximum(0, 1), 2);
  assert.equal(maximum(1, 0), 1);
  assert.equal(maximum(1, 1), 3);
  geometry.dispose();
});
