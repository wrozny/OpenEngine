import scene from '../examples/zombie/project.openengine?raw';
const sources = import.meta.glob('../examples/zombie/scripts/*.lua', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const assets = import.meta.glob('../examples/zombie/assets/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});
export function exampleProject() {
  const project = JSON.parse(scene);
  function hydrate(node) {
    if (node.SourceFile) {
      node.Source = sources[`../examples/zombie/${node.SourceFile}`];
      delete node.SourceFile;
    }
    node.children.forEach(hydrate);
  }
  project.services.forEach(hydrate);
  for (const asset of Object.values(project.assets || {})) {
    const source = assets['../examples/zombie/' + asset.SourceFile];
    const bytes = new TextEncoder().encode(source);
    asset.data =
      'data:' +
      asset.mimeType +
      ';base64,' +
      btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
    delete asset.SourceFile;
  }
  return project;
}
