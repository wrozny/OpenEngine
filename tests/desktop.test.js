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
