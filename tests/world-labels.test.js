import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Engine } from '../src/engine/engine.js';
import { SceneNode, serializeNode } from '../src/engine/scene.js';
import { Vector3 } from '../src/engine/math.js';
import { Renderer3D } from '../src/engine/renderer3d.js';
import { WorldLabels } from '../src/world-labels.js';
import { createProject } from '../src/studio/projects.js';

test('world labels follow projected targets and hide behind real walls, outside range, or after destruction', () => {
  const doc = createProject('Labels', '3D'),
    target = new SceneNode('Object3D', 'Player'),
    wall = new SceneNode('Object3D', 'Wall');
  target.Position = new Vector3(0, 1, -5);
  wall.Position = new Vector3(0, 3, 0);
  wall.Size = new Vector3(10, 6, 1);
  doc.services[0].children = [target, wall].map(serializeNode);
  const engine = new Engine(doc),
    actor = engine.workspace.FindFirstChild('Player'),
    obstacle = engine.workspace.FindFirstChild('Wall');
  const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 2000);
  camera.position.set(0, 3, 5);
  camera.lookAt(0, 3, -5);
  camera.updateMatrixWorld();
  const renderer = {
    viewCamera: camera,
    width: 800,
    height: 600,
    projectWorld: Renderer3D.prototype.projectWorld,
  };
  engine.ui.CreateWorldLabel('swag', 'Player\n10 SWAG', actor, new Vector3(0, 2, 0));
  const node = { hidden: false, style: {} };
  const labels = new WorldLabels(engine, renderer);
  labels.add(node, engine.ui.widgets.swag);
  labels.update();
  assert.equal(node.hidden, true);
  obstacle.Position = new Vector3(20, 3, 0);
  labels.update();
  assert.equal(node.hidden, false);
  assert.ok(Math.abs(parseFloat(node.style.left) - 400) < 0.01);
  actor.Position = new Vector3(2, 1, -5);
  labels.update();
  assert.ok(parseFloat(node.style.left) > 400);
  actor.Position = new Vector3(0, 1, -100);
  labels.update();
  assert.equal(node.hidden, true);
  actor.Position = new Vector3(0, 1, -5);
  actor.Visible = false;
  labels.update();
  assert.equal(node.hidden, true);
  actor.Destroy();
  labels.update();
  assert.equal(node.hidden, true);
  engine.dispose();
});

test('unchanged label text and colors do not rebuild UI every simulation frame', () => {
  const engine = new Engine(createProject('UI', '3D'));
  let changes = 0;
  engine.ui.Changed.Connect(() => changes++);
  engine.ui.CreateLabel('stats', 'SWAG 10');
  engine.ui.SetText('stats', 'SWAG 10');
  assert.equal(changes, 1);
  engine.ui.SetText('stats', 'SWAG 20');
  assert.equal(changes, 2);
  engine.ui.SetColor('stats', '#ffe4a1');
  engine.ui.SetColor('stats', '#ffe4a1');
  assert.equal(changes, 3);
  engine.dispose();
});
