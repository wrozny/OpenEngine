import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public/network', { recursive: true });
await build({
  entryPoints: ['server/entry.js'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  outfile: 'public/network/server.cjs',
  external: ['bufferutil', 'utf-8-validate'],
});
await build({
  entryPoints: ['server/host.js', 'server/cli.js'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  outdir: 'public/network',
  outExtension: { '.js': '.cjs' },
  external: ['bufferutil', 'utf-8-validate'],
});
await copyFile('THIRD_PARTY_NOTICES.md', 'public/network/THIRD_PARTY_NOTICES.md');
console.log('Built self-contained Node server and desktop server host.');
