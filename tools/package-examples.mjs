import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { zipSync } from 'fflate';
import { loadProject } from './project.mjs';

/** Produce editable source folders plus portable Studio documents in one release ZIP. */
const output = 'release/Example Projects';
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const [source, name] of [
  ['zombie', 'Dead Signal'],
  ['neon-borough', 'Neon Borough'],
  ['parcel-panic', 'Parcel Panic'],
]) {
  const directory = join(output, name);
  await cp(join('examples', source), directory, { recursive: true });
  const project = await loadProject(join('examples', source, 'project.openengine'));
  await writeFile(join(directory, name + '.openengine'), JSON.stringify(project, null, 2) + '\n');
}
await cp('LICENSE', join(output, 'LICENSE'));
await writeFile(
  join(output, 'START HERE.txt'),
  'OpenEngine example projects\n\nExtract this ZIP. In Studio click Open and select:\n\nDead Signal/Dead Signal.openengine - 2D zombie survival\nParcel Panic/Parcel Panic.openengine - 3D story and football\nNeon Borough/Neon Borough.openengine - online 3D city, cars, shooting and pedestrians\n\nThe named documents embed their Lua and artwork. The project.openengine documents reference the editable scripts/assets alongside them; use the repository CLI to build from those source files.\n',
);
const files = {};
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else files[relative(output, path).split(sep).join('/')] = new Uint8Array(await readFile(path));
  }
}
await collect(output);
const examplesZip = zipSync(files);
await writeFile('release/Example Projects.zip', examplesZip);
await writeFile('release/Example.Projects.zip', examplesZip);
const citySource = Object.fromEntries(
  Object.entries(files)
    .filter(([name]) => name.startsWith('Neon Borough/'))
    .map(([name, data]) => [name.slice('Neon Borough/'.length), data]),
);
citySource['LICENSE'] = new Uint8Array(await readFile('LICENSE'));
citySource['MULTIPLAYER.md'] = new Uint8Array(await readFile('docs/MULTIPLAYER.md'));
citySource['LUA_REFERENCE.md'] = new Uint8Array(await readFile('docs/LUA_REFERENCE.md'));
citySource['UI_EDITOR.md'] = new Uint8Array(await readFile('docs/UI_EDITOR.md'));
citySource['API.md'] = new Uint8Array(await readFile('docs/API.md'));
await writeFile('release/NeonBorough-source.zip', zipSync(citySource));
console.log(
  'Packaged release/Example Projects.zip, release/Example.Projects.zip and release/NeonBorough-source.zip',
);
