import { mkdir, writeFile } from 'node:fs/promises';
import { SceneNode, serializeNode } from '../src/engine/scene.js';
import { Vector2 } from '../src/engine/math.js';
import { UDim2 } from '../src/engine/ui-types.js';
let id = 0;
const make = (type, name, parent, props = {}) => {
  const n = new SceneNode(type, name, 'tether-' + id++);
  Object.assign(n, props);
  if (parent) n.Parent = parent;
  return n;
};
const world = make('Folder', 'Workspace'),
  scripts = make('Folder', 'ScriptService'),
  ui = make('UIService', 'UIService');
make('Folder', 'Course', world);
make('Folder', 'Match', world);
make('RemoteEvent', 'Action', world);
make('Object2D', 'Night sky', world, {
  Position: new Vector2(3400, -100),
  Size: new Vector2(10500, 2300),
  Layer: -1000,
  Color: '#14252f',
  Sensor: true,
  CollisionGroup: 'decoration',
});
const templates = make('Folder', 'Templates', scripts);
const actor = make('Object2D', 'Runner', templates, {
  Size: new Vector2(28, 38),
  Anchored: false,
  Friction: 0.1,
  CollisionGroup: 'player',
  Color: '#e8c56b',
});
actor.Texture = 'asset:runner';
const screen = make('ScreenGui', 'RaceHUD', ui);
const header = make('Frame', 'Header', screen, {
  Position: new UDim2(0, 20, 0, 20),
  Size: new UDim2(1, -40, 0, 110),
  BackgroundColor: '#eee7d6',
  CornerRadius: 0,
  Padding: 0,
});
const text = (name, parent, value, pos, size, extra = {}) =>
  make('TextLabel', name, parent, {
    Text: value,
    Position: pos,
    Size: size,
    FontFamily: 'Monospace',
    TextColor: '#20343b',
    TextSize: 14,
    ...extra,
  });
text('Brand', header, 'TETHER / RUN', new UDim2(0, 18, 0, 8), new UDim2(0.6, 0, 0, 22), {
  TextSize: 18,
  FontWeight: 700,
});
text('Phase', header, 'ASSEMBLING THE GRID', new UDim2(0, 18, 0, 33), new UDim2(1, -105, 0, 30), {
  TextSize: 22,
  FontFamily: 'Serif',
  FontWeight: 700,
});
text('Course', header, 'PROCEDURAL ROOFTOPS', new UDim2(0, 18, 0, 78), new UDim2(1, -30, 0, 20), {
  TextSize: 11,
});
text('Clock', header, '06', new UDim2(1, -118, 0, 15), new UDim2(0, 100, 0, 56), {
  TextSize: 32,
  TextWrapped: false,
  TextAlign: 'Right',
  FontWeight: 700,
});
const footer = make('Frame', 'Footer', screen, {
  Position: new UDim2(0, 20, 1, -20),
  AnchorPoint: new Vector2(0, 1),
  Size: new UDim2(1, -40, 0, 74),
  BackgroundColor: '#0c1b24',
  CornerRadius: 0,
  BorderWidth: 1,
  BorderColor: '#3d535c',
  Padding: 0,
});
text('Progress', footer, 'DECK 01 / 14', new UDim2(0, 14, 0, 8), new UDim2(0.6, 0, 0, 23), {
  TextColor: '#e8c56b',
  TextSize: 12,
});
text('Dash', footer, 'SHIFT / DASH READY', new UDim2(1, -180, 0, 8), new UDim2(0, 165, 0, 23), {
  TextAlign: 'Right',
  TextColor: '#69d4c0',
  TextSize: 11,
});
text(
  'Controls',
  footer,
  'A/D move · Space jump · Hold mouse: tether · W/S reel · Shift dash · R recover',
  new UDim2(0, 14, 0, 38),
  new UDim2(1, -28, 0, 28),
  { TextColor: '#c4d0cf', TextSize: 11 },
);
for (const [type, name, file] of [
  ['ModuleScript', 'Course', 'Course.lua'],
  ['ServerScript', 'Race director', 'Server.lua'],
  ['LocalScript', 'Runner controls', 'Client.lua'],
]) {
  const n = make(type, name, scripts);
  n.SourceFile = 'scripts/' + file;
}
const project = {
  format: 'openengine',
  version: 1,
  dimension: '2D',
  multiplayer: true,
  name: 'Tether Run',
  hideControlHint: true,
  description: 'Race shuffled rooftop districts: stair climbs, skyline gaps, upper routes and pulse gates.',
  controls: 'A/D run · Space jump · Mouse grapple · W/S reel · Shift dash · R recover',
  services: [world, scripts, ui].map(serializeNode),
  assets: { runner: { mimeType: 'image/svg+xml', SourceFile: 'assets/runner.svg' } },
};
const refs = new Map(
  scripts
    .GetDescendants()
    .filter((n) => n.SourceFile)
    .map((n) => [n.Id, n.SourceFile]),
);
const visit = (n) => {
  if (refs.has(n.id)) {
    n.SourceFile = refs.get(n.id);
    delete n.Source;
  }
  n.children.forEach(visit);
};
project.services.forEach(visit);
await mkdir('examples/tether-run/assets', { recursive: true });
await writeFile(
  'examples/tether-run/assets/runner.svg',
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38"><path fill="#eee7d6" stroke="#14252f" stroke-width="2" d="M7 2h14l4 7v12h-4l2 14h-8l-2-10-2 10H3l3-17H3V9z"/><path fill="#203f50" d="M8 6h14v9H8z"/><path stroke="#e8c56b" stroke-width="3" d="M5 21h16"/></svg>',
);
await writeFile('examples/tether-run/project.openengine', JSON.stringify(project, null, 2) + '\n');
