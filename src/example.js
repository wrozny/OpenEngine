const documents = import.meta.glob('../examples/**/project.openengine', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const sources = import.meta.glob('../examples/**/*.lua', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const assets = import.meta.glob('../examples/**/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export function loadExample(folder) {
  const base = '../examples/' + folder + '/';
  const source = documents[base + 'project.openengine'];
  if (!source) throw new Error('Example not found: ' + folder);
  const project = JSON.parse(source);
  function hydrate(node) {
    if (node.SourceFile) {
      node.Source = sources[base + node.SourceFile];
      delete node.SourceFile;
    }
    node.children.forEach(hydrate);
  }
  project.services.forEach(hydrate);
  for (const asset of Object.values(project.assets || {})) {
    if (!asset.SourceFile) continue;
    const bytes = new TextEncoder().encode(assets[base + asset.SourceFile]);
    asset.data =
      'data:' +
      asset.mimeType +
      ';base64,' +
      btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
    delete asset.SourceFile;
  }
  return project;
}
export const exampleProject = () => loadExample('zombie');
export const exampleProjects = [
  {
    name: 'Tether Run',
    description: '2D · Seeded multiplayer grapple races, dashes and rooftop courses',
    load: () => loadExample('tether-run'),
  },
  {
    name: 'Apex Circuit',
    description: '3D · Multiplayer checkpoint racing with raycast cars',
    load: () => loadExample('apex-circuit'),
  },
  {
    name: 'Neon Borough',
    description: '3D · Online city, shooting, pedestrians and drivable cars',
    load: () => loadExample('neon-borough'),
  },
  {
    name: 'Dead Signal',
    description: '2D · Lua zombie survival, waves and upgrades',
    load: () => loadExample('zombie'),
  },
  {
    name: 'Parcel Panic',
    description: '3D · A parcel delivery story with physics football',
    load: () => loadExample('parcel-panic'),
  },
];
