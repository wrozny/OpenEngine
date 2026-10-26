import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import exporter from '../desktop/export.cjs';
import { loadProject } from '../tools/project.mjs';

test('native Studio export assembles a standalone runtime without editing Studio', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'openengine-export-test-'));
  try {
    const runtime = join(temp, 'studio'),
      appRoot = join(runtime, 'resources', 'app'),
      destination = join(temp, 'games');
    await mkdir(join(appRoot, 'dist'), { recursive: true });
    await mkdir(join(appRoot, 'desktop'), { recursive: true });
    await mkdir(destination);
    await writeFile(join(runtime, 'Studio.exe'), 'test-runtime');
    await writeFile(join(runtime, 'LICENSE'), 'runtime-license');
    await writeFile(join(appRoot, 'dist', 'runtime.html'), 'test-game-entry');
    await writeFile(join(appRoot, 'desktop', 'main.cjs'), 'test-main');
    const project = await loadProject('examples/zombie/project.openengine');
    const output = await exporter.buildNativeGame({
      appRoot,
      executable: join(runtime, 'Studio.exe'),
      destination,
      project,
      platform: 'win32',
    });
    assert.equal(await readFile(join(output, 'DeadSignal.exe'), 'utf8'), 'test-runtime');
    const gameRoot = join(output, 'resources', 'app');
    assert.equal(JSON.parse(await readFile(join(gameRoot, 'package.json'))).openengineMode, 'game');
    assert.equal(JSON.parse(await readFile(join(gameRoot, 'project.json'))).name, 'Dead Signal');
    await access(join(runtime, 'Studio.exe'));
    await access(join(output, 'LICENSE'));
    await assert.rejects(
      exporter.buildNativeGame({
        appRoot,
        executable: join(runtime, 'Studio.exe'),
        destination: runtime,
        project,
        platform: 'win32',
      }),
      /outside/,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('recent projects track real files, missing paths and explicit removal', async () => {
  const { ProjectRegistry } = await import('../desktop/projects.cjs');
  const temp = await mkdtemp(join(tmpdir(), 'openengine-recents-'));
  try {
    const registry = new ProjectRegistry(join(temp, 'state', 'recent.json')),
      file = join(temp, 'Game.openengine');
    const project = await loadProject('examples/zombie/project.openengine');
    await registry.save(file, JSON.stringify(project), true);
    assert.equal((await registry.list())[0].exists, true);
    assert.equal((await registry.read(file)).name, 'Dead Signal');
    await assert.rejects(registry.read(join(temp, 'not-authorized')), /Choose this project/);
    await rm(file);
    assert.equal((await registry.list())[0].exists, false);
    await registry.forget(file);
    assert.deepEqual(await registry.list(), []);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('removing an active project from recents does not revoke the ability to save it', async () => {
  const { ProjectRegistry } = await import('../desktop/projects.cjs');
  const directory = await mkdtemp(join(tmpdir(), 'openengine-active-'));
  try {
    const registry = new ProjectRegistry(join(directory, 'recents.json')),
      file = join(directory, 'Active.openengine'),
      project = await loadProject('examples/zombie/project.openengine');
    await registry.save(file, JSON.stringify(project), true);
    await registry.forget(file);
    assert.deepEqual(await registry.list(), []);
    project.name = 'Still editable';
    await registry.save(file, JSON.stringify(project));
    assert.equal(JSON.parse(await readFile(file, 'utf8')).name, 'Still editable');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('native multiplayer export produces separate client/server applications and redacts private client source', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'openengine-online-export-'));
  try {
    const runtime = join(temp, 'studio'),
      appRoot = join(runtime, 'resources', 'app'),
      destination = join(temp, 'exports');
    await mkdir(join(appRoot, 'dist', 'network'), { recursive: true });
    await mkdir(join(appRoot, 'desktop'), { recursive: true });
    await mkdir(destination);
    await writeFile(join(runtime, 'Studio.exe'), 'runtime');
    await writeFile(join(appRoot, 'dist', 'runtime.html'), 'entry');
    await writeFile(join(appRoot, 'desktop', 'main.cjs'), 'main');
    const project = await loadProject('examples/neon-borough/project.openengine');
    const output = await exporter.buildNativeGame({
      appRoot,
      executable: join(runtime, 'Studio.exe'),
      destination,
      project,
      platform: 'win32',
    });
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(output);
    assert.equal(entries.length, 2);
    for (const entry of entries) {
      const root = join(output, entry, 'resources', 'app');
      const info = JSON.parse(await readFile(join(root, 'package.json')));
      const game = await readFile(join(root, 'project.json'), 'utf8');
      if (info.openengineMode === 'server') {
        assert.match(game, /ServerScript/);
        await access(join(output, entry, 'NeonBoroughServer.exe'));
      } else {
        assert.equal(info.openengineMode, 'game');
        assert.ok(!game.includes('ServerScript'));
        assert.ok(!game.includes('lastAction'));
        await access(join(output, entry, 'NeonBorough.exe'));
      }
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('native client distribution copies only the runtime dependency graph and excludes Studio example sources', async () => {
  const { copyGameDist } = await import('../desktop/dist.cjs');
  const directory = await mkdtemp(join(tmpdir(), 'openengine-dist-'));
  try {
    const source = join(directory, 'source'),
      output = join(directory, 'client');
    await mkdir(join(source, '.vite'), { recursive: true });
    await mkdir(join(source, 'assets'));
    await writeFile(join(source, 'runtime.html'), 'runtime');
    await writeFile(join(source, 'assets', 'runtime.js'), 'client');
    await writeFile(join(source, 'assets', 'shared.js'), 'engine');
    await writeFile(join(source, 'assets', 'studio.js'), 'private examples');
    await writeFile(
      join(source, '.vite', 'manifest.json'),
      JSON.stringify({
        'runtime.html': { file: 'assets/runtime.js', imports: ['_shared.js'] },
        '_shared.js': { file: 'assets/shared.js' },
        'index.html': { file: 'assets/studio.js' },
      }),
    );
    await copyGameDist(source, output);
    await access(join(output, 'runtime.html'));
    await access(join(output, 'assets', 'shared.js'));
    await assert.rejects(access(join(output, 'assets', 'studio.js')));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
