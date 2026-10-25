const fs = require('node:fs/promises');
const path = require('node:path');
function safeName(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || 'MyGame';
}
function isInside(candidate, directory) {
  const relative = path.relative(directory, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** Copy the installed Electron runtime into a new folder, then replace Studio with game data. */
async function buildNativeGame({ appRoot, executable, destination, project, platform }) {
  if (platform === 'darwin')
    throw new Error('In-app macOS export is not supported yet. Use the CLI packager on macOS.');
  const name = safeName(project.name);
  const runtimeRoot = path.dirname(executable);
  const realDestination = await fs.realpath(destination);
  if (isInside(realDestination, runtimeRoot))
    throw new Error('Choose an export folder outside the installed Studio directory');
  const output = path.join(realDestination, `${name}-${Date.now()}`);
  await fs.mkdir(output, { recursive: false });
  try {
    await fs.cp(runtimeRoot, output, {
      recursive: true,
      filter: (file) => !isInside(file, appRoot),
    });
    const gameRoot = path.join(output, 'resources', 'app');
    await fs.mkdir(gameRoot, { recursive: true });
    await fs.cp(path.join(appRoot, 'dist'), path.join(gameRoot, 'dist'), { recursive: true });
    await fs.cp(path.join(appRoot, 'desktop'), path.join(gameRoot, 'desktop'), { recursive: true });
    for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
      try {
        await fs.cp(path.join(appRoot, file), path.join(gameRoot, file));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    await fs.writeFile(
      path.join(gameRoot, 'package.json'),
      JSON.stringify({
        name: 'openengine-game',
        version: '1.0.0',
        main: 'desktop/main.cjs',
        openengineMode: 'game',
      }),
    );
    await fs.writeFile(path.join(gameRoot, 'project.json'), JSON.stringify(project));
    const suffix = platform === 'win32' ? '.exe' : '';
    await fs.rename(path.join(output, path.basename(executable)), path.join(output, name + suffix));
    await fs.writeFile(
      path.join(output, 'START-HERE.txt'),
      `Run ${name}${suffix}. Keep all files in this folder together.\nPowered by OpenEngine.\n`,
    );
    return output;
  } catch (error) {
    await fs.rm(output, { recursive: true, force: true });
    throw error;
  }
}
module.exports = { buildNativeGame, safeName, isInside };
