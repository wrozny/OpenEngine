import { mkdir, writeFile } from 'node:fs/promises';
import { SceneNode, serializeNode } from '../src/engine/scene.js';
import { Vector3 } from '../src/engine/math.js';
const workspace = new SceneNode('Folder', 'Workspace', 'workspace');
workspace.FallenHeight = -60;
const scripts = new SceneNode('Folder', 'ScriptService', 'scripts');
let index = 0;
function folder(name, parent = workspace) {
  const node = new SceneNode('Folder', name, 'city-folder-' + name);
  node.Parent = parent;
  return node;
}
function object(name, position, size, options = {}, parent = workspace) {
  const node = new SceneNode('Object3D', name, 'city-' + index++);
  Object.assign(node, { Position: new Vector3(...position), Size: new Vector3(...size) }, options);
  node.Parent = parent;
  return node;
}
const streets = folder('Streets'),
  buildings = folder('Buildings');
object(
  'City foundation',
  [0, -1, 0],
  [144, 2, 144],
  { Color: '#6a7969', Material: 'Grass', TextureScale: 8 },
  streets,
);
for (const axis of [0, 1])
  for (const road of [-36, 0, 36]) {
    const position = axis === 0 ? [road, 0.02, 0] : [0, 0.025, road];
    const size = axis === 0 ? [11, 0.04, 140] : [140, 0.04, 11];
    object('Avenue', position, size, { Color: '#282f3a' }, streets);
    for (const offset of [-6.5, 6.5])
      object(
        'Sidewalk',
        axis === 0 ? [road + offset, 0.06, 0] : [0, 0.06, road + offset],
        axis === 0 ? [2, 0.12, 140] : [140, 0.12, 2],
        { Color: '#a0a49e' },
        streets,
      );
    for (let along = -63; along <= 63; along += 9) {
      if ([-36, 0, 36].some((cross) => Math.abs(along - cross) < 8)) continue;
      object(
        'Lane marking',
        axis === 0 ? [road, 0.055, along] : [along, 0.06, road],
        axis === 0 ? [0.18, 0.03, 3] : [3, 0.03, 0.18],
        { Color: '#e3d195', Sensor: true },
        streets,
      );
    }
  }
const colors = ['#7890a4', '#a38d8a', '#717d91', '#929a8d', '#b6a47f', '#7d858b'];
for (const x of [-54, -18, 18, 54])
  for (const z of [-54, -18, 18, 54]) {
    // Leave the southeast plaza open, with a fountain and gathering space.
    if (x === 18 && z === 18) continue;
    const height = 8 + ((Math.abs(x + z) * 7) % 17);
    object(
      'Tower',
      [x, height / 2, z],
      [22, height, 21],
      { Color: colors[index % colors.length], Material: 'Brick', TextureScale: 4 },
      buildings,
    );
    object('Roof', [x, height + 0.2, z], [23, 0.4, 22], { Color: '#394452' }, buildings);
    for (const side of [-1, 1]) {
      object(
        'Glass facade',
        [x + side * 11.04, height * 0.56, z],
        [0.04, height * 0.58, 15],
        { Color: '#8ac6d0', Sensor: true },
        buildings,
      );
      object(
        'Glass facade',
        [x, height * 0.56, z + side * 10.54],
        [15, height * 0.58, 0.04],
        { Color: '#91b1bf', Sensor: true },
        buildings,
      );
    }
  }
object('Plaza', [18, 0.12, 18], [22, 0.24, 22], {
  Color: '#c5b7a5',
  Material: 'Rock',
  TextureScale: 3,
});
object('Fountain basin', [19, 0.6, 18], [6, 1.2, 6], { Shape: 'Cylinder', Color: '#869ba0' });
object('Fountain water', [19, 1.24, 18], [5.4, 0.08, 5.4], {
  Shape: 'Cylinder',
  Color: '#50b9c6',
  Sensor: true,
});
for (const x of [-7.2, 7.2])
  for (const z of [-58, -22, 14, 50]) {
    object('Lamp', [x, 2.6, z], [0.16, 5.2, 0.16], { Color: '#3e4b58', Material: 'Metal' });
    object('Lamp globe', [x, 5.3, z], [0.7, 0.5, 0.7], { Color: '#f8d799' });
  }
const cars = folder('Cars'),
  details = folder('CarDetails');
for (let i = 0; i < 3; i++) {
  const p = [3, 0.9, 12 - i * 13],
    name = 'Coupe ' + (i + 1);
  const body = object(
    name,
    p,
    [1.9, 0.8, 3.8],
    {
      Anchored: false,
      Mass: 900,
      FixedRotation: true,
      Friction: 0,
      Color: ['#d16c5e', '#5ca6ae', '#d6bd68'][i],
    },
    cars,
  );
  body.SetAttribute('Vehicle', true);
  body.SetAttribute('Driver', '');
  const roof = object(
    name + ' cabin',
    [p[0], p[1] + 0.65, p[2] + 0.1],
    [1.6, 0.7, 1.9],
    { Sensor: true, Color: '#315564' },
    details,
  );
  roof.SetAttribute('Car', name);
  for (const x of [-1, 1])
    for (const z of [-1.2, 1.2]) {
      const wheel = object(
        name + ' wheel',
        [p[0] + x, p[1] - 0.05, p[2] + z],
        [0.35, 0.7, 0.7],
        { Sensor: true, Color: '#232831' },
        details,
      );
      wheel.SetAttribute('Car', name);
    }
}
const npcs = folder('Pedestrians');
for (let i = 0; i < 8; i++) {
  const actor = object(
    'Resident ' + (i + 1),
    [i % 2 === 0 ? -7.5 : 7.5, 1.4, -50 + Math.floor(i / 2) * 32],
    [0.75, 1.9, 0.75],
    { Anchored: false, FixedRotation: true, Friction: 0, Color: colors[i % colors.length] },
    npcs,
  );
  actor.SetAttribute('Health', 100);
}
const templates = folder('Templates', scripts);
const avatar = object(
  'Avatar',
  [0, 2, 0],
  [0.85, 1.9, 0.85],
  { Anchored: false, FixedRotation: true, Friction: 0, CollisionGroup: 'player', Color: '#62b6f2' },
  templates,
);
new SceneNode('PlayerController3D', 'Movement', 'city-controller').Parent = avatar;
new SceneNode('RemoteEvent', 'CityAction', 'city-action').Parent = workspace;
for (const [className, name, file] of [
  ['ModuleScript', 'Appearance', 'Appearance.lua'],
  ['ModuleScript', 'Config', 'Config.lua'],
  ['ServerScript', 'City Server', 'Server.lua'],
  ['LocalScript', 'City Client', 'Client.lua'],
]) {
  const node = new SceneNode(className, name, 'city-script-' + name);
  node.Parent = scripts;
  node.Source = '';
  node.SourceFile = 'scripts/' + file;
}
for (const name of ['Vehicles', 'Residents']) {
  const module = new SceneNode('ModuleScript', name, 'city-private-' + name);
  module.SourceFile = 'scripts/' + name + '.lua';
  module.Parent = scripts.FindFirstChild('City Server');
}
const project = {
  format: 'openengine',
  version: 1,
  dimension: '3D',
  multiplayer: true,
  name: 'Neon Borough',
  description:
    'An original online city sandbox. Meet at the plaza, explore streets, drive coupes, and try server-validated arcade combat.',
  controls: 'WASD move · Space jump · Right drag look · Left click shoot · E enter / exit car',
  services: [workspace, scripts].map(serializeNode),
};
const sourceFiles = new Map(
  scripts
    .GetDescendants()
    .filter((node) => node.SourceFile)
    .map((node) => [node.Id, node.SourceFile]),
);
function sources(data) {
  if (sourceFiles.has(data.id)) {
    data.SourceFile = sourceFiles.get(data.id);
    delete data.Source;
  }
  data.children.forEach(sources);
}
project.services.forEach(sources);
await mkdir('examples/neon-borough', { recursive: true });
await writeFile(
  'examples/neon-borough/project.openengine',
  JSON.stringify(project, null, 2) + '\n',
);
console.log('Created Neon Borough scene with ' + index + ' objects.');
