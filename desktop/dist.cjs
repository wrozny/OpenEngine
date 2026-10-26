const fs = require('node:fs/promises');
const path = require('node:path');

/** Export only the native runtime dependency graph, never Studio or its embedded example sources. */
async function copyGameDist(source, destination, server = false) {
  await fs.mkdir(destination, { recursive: true });
  if (server) {
    await fs.cp(path.join(source, 'network'), path.join(destination, 'network'), {
      recursive: true,
    });
    return;
  }
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(source, '.vite', 'manifest.json'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // Older Studio installations and simple test fixtures predate the build manifest.
    await fs.cp(source, destination, { recursive: true });
    return;
  }
  const files = new Set(['runtime.html']),
    visited = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const entry = manifest[key];
    if (!entry) throw new Error('Runtime dependency missing from build manifest: ' + key);
    for (const file of [entry.file, ...(entry.css || []), ...(entry.assets || [])]) files.add(file);
    for (const dependency of [...(entry.imports || []), ...(entry.dynamicImports || [])])
      visit(dependency);
  }
  visit('runtime.html');
  for (const file of files) {
    await fs.mkdir(path.dirname(path.join(destination, file)), { recursive: true });
    await fs.copyFile(path.join(source, file), path.join(destination, file));
  }
}
module.exports = { copyGameDist };
