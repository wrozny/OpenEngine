import { mkdir, writeFile } from 'node:fs/promises';
import { SceneNode, serializeNode } from '../src/engine/scene.js';
import { Vector3 } from '../src/engine/math.js';
const workspace = new SceneNode('Folder', 'Workspace', 'workspace'),
  scripts = new SceneNode('Folder', 'ScriptService', 'scripts'),
  ui = new SceneNode('UIService', 'UIService', 'ui-service');
let id = 0;
const add = (type, name, parent, props = {}) => {
  const node = new SceneNode(type, name, 'race-' + id++);
  Object.assign(node, props);
  node.Parent = parent;
  return node;
};
const box = (name, p, s, props = {}) =>
  add('Object3D', name, workspace, {
    Position: new Vector3(...p),
    Size: new Vector3(...s),
    ...props,
  });
box('Ground', [45, -1, -45], [210, 2, 210], { Color: '#5c8065', Material: 'Grass' });
for (const [p, s] of [
  [
    [0, 0.02, -45],
    [15, 0.04, 108],
  ],
  [
    [90, 0.02, -45],
    [15, 0.04, 108],
  ],
  [
    [45, 0.02, -90],
    [105, 0.04, 15],
  ],
  [
    [45, 0.02, 0],
    [105, 0.04, 15],
  ],
])
  box('Asphalt', p, s, { Color: '#303947', Material: 'Rock' });
box('Infield', [45, 1, -45], [62, 2, 62], { Color: '#58745c', Material: 'Grass' });
for (let i = 0; i < 4; i++)
  box('Rolling ramp', [0, 0.25, -30 - i * 5], [12, 0.5, 5], {
    Rotation: new Vector3(i % 2 ? 0.06 : -0.06, 0, 0),
    Color: '#3c485a',
  });
for (const x of [-9, 99]) box('Outer barrier', [x, 0.6, -45], [1, 1.2, 110], { Color: '#c9d4d9' });
for (const z of [9, -99]) box('Outer barrier', [45, 0.6, z], [110, 1.2, 1], { Color: '#c9d4d9' });
for (let z = -80; z < 0; z += 10)
  box('Road stripe', [0, 0.06, z], [0.2, 0.03, 4], { Color: '#f1cf80', Sensor: true });
const gates = add('Folder', 'Checkpoints', workspace);
for (const [i, p] of [
  [1, [0, 2, -86]],
  [2, [86, 2, -90]],
  [3, [90, 2, -4]],
  [4, [0, 2, 0]],
]) {
  add('Object3D', String(i), gates, {
    Position: new Vector3(...p),
    Size: new Vector3(1, 1, 1),
    Visible: false,
    Sensor: true,
  });
  for (const side of [-1, 1])
    box(
      'Gate ' + i,
      [p[0] + (i % 2 ? side * 6 : 0), 2, p[2] + (i % 2 ? 0 : side * 6)],
      [0.3, 4, 0.3],
      { Color: i === 4 ? '#f8cb68' : '#86dacf', CollisionGroup: 'decoration' },
    );
}
add('Folder', 'RaceState', workspace);
add('RemoteEvent', 'Recover', workspace);
const templates = add('Folder', 'Templates', scripts),
  car = add('Object3D', 'Racer', templates, {
    Size: new Vector3(1.8, 0.65, 3.6),
    Mass: 700,
    Anchored: false,
    Color: '#f2a65e',
    Friction: 0.2,
    Position: new Vector3(0, 2, 0),
  });
add('Car3D', 'Drive', car);
for (const [type, name, file] of [
  ['ServerScript', 'Round manager', 'Server.lua'],
  ['LocalScript', 'Driver', 'Client.lua'],
]) {
  const node = add(type, name, scripts);
  node.SourceFile = 'scripts/' + file;
}
const recovery = add('ServerScript', 'Recovery', scripts);
recovery.Source = `local run = game:GetService("RunService")\nlocal nextAllowed = {}\nworkspace.Recover.OnServerEvent:Connect(function(player)\n if run.Time < (nextAllowed[player.UserId] or 0) then return end\n local car = player.Character\n if not car or car.Destroyed then return end\n nextAllowed[player.UserId] = run.Time + 5\n local index = math.max(1, (car:GetAttribute("Checkpoint") or 1)-1)\n local gate = workspace.Checkpoints:FindFirstChild(tostring(index))\n car.Position = (car:GetAttribute("Checkpoint") or 1) > 1 and gate.Position:Add(Vector3.new(0,2,0)) or Vector3.new(0,2,4)\n car.Rotation = Vector3.new()\n car.Velocity = Vector3.new()\nend)\ngame:GetService("Players").PlayerRemoving:Connect(function(player) nextAllowed[player.UserId] = nil end)`;
const project = {
  format: 'openengine',
  version: 1,
  name: 'Apex Circuit',
  dimension: '3D',
  multiplayer: true,
  description: 'Round-based raycast car racing with ordered checkpoints and rolling terrain.',
  controls: 'WASD drive · Space brake · R recover',
  services: [workspace, scripts, ui].map(serializeNode),
};
const sources = new Map(
  scripts
    .GetDescendants()
    .filter((n) => n.SourceFile)
    .map((n) => [n.Id, n.SourceFile]),
);
const hydrate = (n) => {
  if (sources.has(n.id)) {
    n.SourceFile = sources.get(n.id);
    delete n.Source;
  }
  n.children.forEach(hydrate);
};
project.services.forEach(hydrate);
await mkdir('examples/apex-circuit', { recursive: true });
await writeFile(
  'examples/apex-circuit/project.openengine',
  JSON.stringify(project, null, 2) + '\n',
);
