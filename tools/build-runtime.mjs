import { build } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const result = await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    write: false,
    lib: { entry: 'src/runtime/export.js', name: 'OpenEngineGame', formats: ['iife'] },
    minify: true,
  },
  define: { 'process.env.FENGARICONF': 'undefined', process: 'undefined' },
});
const bundle = (Array.isArray(result) ? result[0] : result).output.find(
  (file) => file.type === 'chunk',
).code;
if (!bundle.includes('__OPENENGINE_PROJECT_BASE64__'))
  throw new Error('Project marker lost from runtime bundle');
const notices = await readFile('THIRD_PARTY_NOTICES.md', 'utf8');
await mkdir('public', { recursive: true });
await writeFile(
  'public/runtime-template.html',
  `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenEngine Game</title></head><body><script type="text/plain" id="openengine-licenses">${notices.replaceAll('</script', '<\\/script')}</script><script>${bundle.replaceAll('</script', '<\\/script')}</script></body></html>`,
);
console.log('Built offline runtime template.');
