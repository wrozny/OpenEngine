import { writeFile } from 'node:fs/promises';
import { SceneNode, serializeNode } from '../src/engine/scene.js';
import { Vector2 } from '../src/engine/math.js';
const workspace = new SceneNode('Folder', 'Workspace', 'workspace');
const scripts = new SceneNode('Folder', 'ScriptService', 'scripts');
function object(name, x, y, w, h, color, extra = {}) {
  const node = new SceneNode('PhysicsObject', name, name.toLowerCase().replaceAll(' ', '-'));
  Object.assign(node, { Position: new Vector2(x, y), Size: { X: w, Y: h }, Color: color }, extra);
  node.Parent = workspace;
  return node;
}
const player = object('Player', 0, 0, 38, 38, '#9bdccd', {
  Shape: 'Circle',
  Anchored: false,
  CollisionGroup: 'player',
  Layer: 3,
});
player.Texture = 'asset:player';
object('North wall', 0, -640, 1880, 40, '#3b5050');
object('South wall', 0, 640, 1880, 40, '#3b5050');
object('West wall', -920, 0, 40, 1240, '#3b5050');
object('East wall', 920, 0, 40, 1240, '#3b5050');
// Low cover adds a little navigation while retaining a broad, readable arena.
object('Supply crate', -260, -170, 85, 60, '#7c7253', { Rotation: 0.12 });
object('Abandoned vehicle', 300, 200, 135, 65, '#486260', { Rotation: -0.3 });
object('Concrete block', -380, 280, 110, 45, '#5c6c68');
for (const name of ['Zombies', 'Projectiles'])
  new SceneNode('Folder', name, name.toLowerCase()).Parent = workspace;
for (const [name, className] of [
  ['Config', 'ModuleScript'],
  ['Weapons', 'ModuleScript'],
  ['Survival', 'Script'],
]) {
  const node = new SceneNode(className, name, name.toLowerCase());
  node.Parent = scripts;
}
const demo = new SceneNode('Script', 'CollisionDemo', 'collision-demo');
demo.Enabled = false;
demo.Parent = workspace.FindFirstChild('Supply crate');
const project = {
  format: 'openengine',
  version: 1,
  name: 'Dead Signal',
  description: 'A Lua-driven survival game built with OpenEngine.',
  controls: 'WASD  move   /   MOUSE  aim   /   HOLD CLICK  fire',
  assets: {
    player: { SourceFile: 'assets/player.svg', mimeType: 'image/svg+xml' },
    zombie: { SourceFile: 'assets/zombie.svg', mimeType: 'image/svg+xml' },
  },
  services: [workspace, scripts].map(serializeNode),
};
function references(node) {
  if (node.className.endsWith('Script')) node.SourceFile = `scripts/${node.name}.lua`;
  node.children.forEach(references);
}
project.services.forEach(references);
await writeFile('examples/zombie/project.openengine', JSON.stringify(project, null, 2) + '\n');
