import distribution from '../desktop/dist.cjs';
import { clientDocument } from '../src/network/document.js';
import { initializeProxy } from '@electron/get';
import { packager } from '@electron/packager';
import { cp, mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { zipSync, strToU8 } from 'fflate';
import { loadProject } from './project.mjs';
import exporter from '../desktop/export.cjs';

if (
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy
)
  initializeProxy();

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    project: { type: 'string', default: 'examples/zombie/project.openengine' },
    platform: { type: 'string', default: 'win32' },
    arch: { type: 'string', default: 'x64' },
  },
});
const packageInfo = JSON.parse(await readFile('package.json', 'utf8'));
const kind = positionals[0];
if (!['game', 'studio'].includes(kind)) throw new Error('Choose game or studio');
if (!['win32', 'linux', 'darwin', 'web'].includes(values.platform))
  throw new Error('Supported platforms: win32, linux, darwin, web');
if (!['x64', 'arm64'].includes(values.arch)) throw new Error('Supported architectures: x64, arm64');
const project = kind === 'game' ? await loadProject(values.project) : null;
const name = project ? exporter.safeName(project.name) : 'OpenEngineStudio';
for (const args of [
  ['tools/build-server.mjs'],
  ['tools/build-runtime.mjs'],
  ['node_modules/vite/bin/vite.js', 'build'],
])
  execFileSync(process.execPath, args, { stdio: 'inherit' });
await mkdir('release', { recursive: true });
if (values.platform === 'web') {
  if (!project) throw new Error('Web export supports games; deploy dist/ for web Studio');
  const template = await readFile('public/runtime-template.html', 'utf8');
  const html = template.replace(
    '__OPENENGINE_PROJECT_BASE64__',
    Buffer.from(JSON.stringify(project.multiplayer ? clientDocument(project) : project)).toString(
      'base64',
    ),
  );
  await writeFile(
    `release/${name}-web.zip`,
    zipSync({
      'index.html': strToU8(html),
      'README.txt': strToU8(
        project.multiplayer
          ? 'Install Node.js 24 LTS. Run node server.cjs and open http://localhost:7777 (or server LAN IP). PORT/HOST environment variables configure the host. Use a TLS reverse proxy for public deployments. Distribute only index.html to clients.\n'
          : 'Open index.html in a modern browser. No server required.\n',
      ),
      ...(project.multiplayer
        ? {
            'server.cjs': new Uint8Array(await readFile('public/network/server.cjs')),
            'project.json': strToU8(JSON.stringify(project)),
            'THIRD_PARTY_NOTICES.md': new Uint8Array(await readFile('THIRD_PARTY_NOTICES.md')),
          }
        : {}),
    }),
  );
  console.log(`Game exported to release/${name}-web.zip`);
} else {
  const stage = await mkdtemp(join(tmpdir(), 'openengine-package-'));
  try {
    if (project) await distribution.copyGameDist('dist', join(stage, 'dist'));
    else await cp('dist', join(stage, 'dist'), { recursive: true });
    await cp('desktop', join(stage, 'desktop'), { recursive: true });
    await cp('LICENSE', join(stage, 'LICENSE'));
    await cp('THIRD_PARTY_NOTICES.md', join(stage, 'THIRD_PARTY_NOTICES.md'));
    await writeFile(
      join(stage, 'package.json'),
      JSON.stringify({
        name: name.toLowerCase(),
        productName: name,
        version: packageInfo.version,
        description: project?.description || 'OpenEngine Studio',
        author: 'OpenEngine contributors',
        main: 'desktop/main.cjs',
        openengineMode: kind,
      }),
    );
    if (project)
      await writeFile(
        join(stage, 'project.json'),
        JSON.stringify(project.multiplayer ? clientDocument(project) : project),
      );
    const electron = JSON.parse(await readFile('node_modules/electron/package.json', 'utf8'));
    const outputs = await packager({
      dir: stage,
      name,
      platform: values.platform,
      arch: values.arch,
      electronVersion: electron.version,
      out: resolve('release'),
      overwrite: true,
      asar: false,
      download: { cacheRoot: resolve(process.env.OPENENGINE_CACHE || '.cache/electron') },
      executableName: name,
    });
    if (project?.multiplayer) {
      await distribution.copyGameDist('dist', join(stage, 'dist'), true);
      await writeFile(join(stage, 'project.json'), JSON.stringify(project));
      const info = JSON.parse(await readFile(join(stage, 'package.json'), 'utf8'));
      info.openengineMode = 'server';
      info.productName = name + 'Server';
      await writeFile(join(stage, 'package.json'), JSON.stringify(info));
      const serverOutputs = await packager({
        dir: stage,
        name: name + 'Server',
        platform: values.platform,
        arch: values.arch,
        electronVersion: electron.version,
        out: resolve('release'),
        overwrite: true,
        asar: false,
        executableName: name + 'Server',
        download: { cacheRoot: resolve(process.env.OPENENGINE_CACHE || '.cache/electron') },
      });
      for (const output of serverOutputs) {
        await writeFile(
          join(output, 'START-HERE.txt'),
          'Run the Server executable, then open the client executable and connect to ws://SERVER-IP:7777/socket. Allow TCP port 7777 through the firewall. PORT and HOST environment variables configure hosting. This folder contains private server scripts; distribute the separate client folder to players.\n',
        );
        console.log('Packaged dedicated server: ' + output);
      }
    }
    for (const output of outputs) {
      await writeFile(
        join(output, 'START-HERE.txt'),
        `Run ${name}${values.platform === 'win32' ? '.exe' : ''}.\nKeep this entire folder together. No Node.js or Lua installation required.\n\nOpenEngine is a 2D and 3D Lua game engine. See https://github.com/wrozny/OpenEngine for documentation.\n`,
      );
      console.log(`Packaged ${kind}: ${output}`);
    }
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
