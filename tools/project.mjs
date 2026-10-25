import { readFile } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { validateProject } from '../src/engine/scene.js';
/** Resolve checked-in Lua files into a self-contained, portable project document. */
export async function loadProject(path) {
  const absolute = resolve(path);
  const base = dirname(absolute);
  const project = JSON.parse(await readFile(absolute, 'utf8'));
  async function hydrate(node) {
    if (node.SourceFile) {
      const source = resolve(base, node.SourceFile);
      if (!source.startsWith(base + sep))
        throw new Error('SourceFile must stay inside the project directory');
      node.Source = await readFile(source, 'utf8');
      delete node.SourceFile;
    }
    await Promise.all((node.children || []).map(hydrate));
  }
  await Promise.all((project.services || []).map(hydrate));
  for (const asset of Object.values(project.assets || {})) {
    if (!asset.SourceFile) continue;
    const source = resolve(base, asset.SourceFile);
    if (!source.startsWith(base + sep))
      throw new Error('Asset SourceFile must stay inside the project directory');
    asset.data =
      'data:' + asset.mimeType + ';base64,' + (await readFile(source)).toString('base64');
    delete asset.SourceFile;
  }
  return validateProject(project);
}
