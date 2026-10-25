import { writeFile } from 'node:fs/promises';
import { SceneNode, serializeNode } from '../src/engine/scene.js';
import { Vector3 } from '../src/engine/math.js';
const world = new SceneNode('Folder', 'Workspace', 'workspace'),
  scripts = new SceneNode('Folder', 'ScriptService', 'scripts');
world.FallenHeight = -40;
function object(name, position, size, extra = {}, parent = world) {
  const n = new SceneNode('Object3D', name, name.toLowerCase().replaceAll(' ', '-'));
  Object.assign(n, { Position: new Vector3(...position), Size: new Vector3(...size) }, extra);
  n.Parent = parent;
  return n;
}
object('Island', [0, -1, 0], [48, 2, 42], { Material: 'Grass', Color: '#e3e7d4', TextureScale: 3 });
object('Stone path', [0, 0.015, 0], [3, 0.03, 32], {
  Material: 'Rock',
  Color: '#c3c8c9',
  TextureScale: 2,
});
const player = object('Player', [0, 1.5, 14], [0.9, 2, 0.9], {
  Anchored: false,
  FixedRotation: true,
  Color: '#6695d4',
  CollisionGroup: 'player',
});
const controller = new SceneNode('PlayerController3D', 'Player Controller', 'player-controller');
controller.Parent = player;
object('PostBox', [-14, 1, 8], [1.5, 2, 1.4], {
  Material: 'Metal',
  Color: '#6a97ce',
  TextureScale: 1,
});
object('PostBox roof', [-14, 2.1, 8], [1.9, 0.3, 1.7], { Color: '#cfdfed' });
object('Bell', [15, 1, -9], [1.2, 1.5, 1.2], {
  Shape: 'Cylinder',
  Material: 'Metal',
  Color: '#edc057',
});
object('Bell plinth', [15, 0.3, -9], [3, 0.6, 3], { Material: 'Rock' });
object('Football', [0, 1, 5], [1.3, 1.3, 1.3], {
  Shape: 'Sphere',
  Anchored: false,
  Mass: 0.8,
  Restitution: 0.45,
  Friction: 0.25,
  Color: '#ffffff',
  Texture: 'asset:football',
  TextureScale: 1.3,
});
const goal = new SceneNode('Folder', 'Goal', 'goal');
goal.Parent = world;
for (const x of [-3, 3])
  object('Goal post ' + x, [x, 1.5, -16], [0.3, 3, 0.3], { Color: '#f4eee0', Material: 'Metal' });
object('Goal crossbar', [0, 3, -16], [6.3, 0.3, 0.3], { Color: '#f4eee0' });
object('Goal backstop', [0, 1.5, -18], [6, 3, 0.2], { Color: '#536a76', Visible: false });
for (let i = 0; i <= 10; i++)
  object(
    'Net strand ' + (i + 1),
    [Number((-3 + i * 0.6).toFixed(1)), 1.5, -18],
    [0.035, 3, 0.035],
    { Color: '#e0e5d5' },
  );
for (const child of world.GetChildren())
  if (child.Name.startsWith('Goal ') || child.Name.startsWith('Net strand')) child.Parent = goal;
for (let i = 0; i < 3; i++)
  object('Garden step ' + i, [5 + i * 2, 0.3 + i * 0.3, -7], [2, 0.6 + i * 0.6, 3], {
    Material: 'Brick',
    Color: '#e5c4a9',
  });
const parcels = new SceneNode('Folder', 'Parcels', 'parcels');
parcels.Parent = world;
[
  [-12, 1, -4],
  [12, 1, 3],
  [4, 2, -9],
].forEach((position, i) =>
  object(
    'Parcel ' + (i + 1),
    position,
    [1.2, 1.2, 1.2],
    { Material: 'Wood', Color: '#e9b766' },
    parcels,
  ),
);
for (const [i, position] of [
  [0, [-18, 2, -12]],
  [1, [18, 2, 12]],
  [2, [-17, 2, 15]],
]) {
  object('Tree trunk ' + i, position, [0.8, 4, 0.8], { Material: 'Wood', Color: '#aa9070' });
  object('Tree crown ' + i, [position[0], 5, position[2]], [4, 4, 4], {
    Shape: 'Sphere',
    Color: '#7b9b70',
  });
}
for (const [name, type] of [
  ['Mission', 'ModuleScript'],
  ['Story', 'Script'],
]) {
  const n = new SceneNode(type, name, name.toLowerCase());
  n.Parent = scripts;
}
const project = {
  format: 'openengine',
  version: 1,
  dimension: '3D',
  name: 'Parcel Panic',
  description: 'A tiny workplace comedy on a floating island.',
  controls: 'WASD move · Space jump · Right drag look · E interact / kick · R respawn',
  assets: { football: { SourceFile: 'assets/football.svg', mimeType: 'image/svg+xml' } },
  services: [world, scripts].map(serializeNode),
};
for (const node of project.services[1].children) node.SourceFile = 'scripts/' + node.name + '.lua';
await writeFile(
  'examples/parcel-panic/project.openengine',
  JSON.stringify(project, null, 2) + '\n',
);
