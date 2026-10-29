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
const output = (Array.isArray(result) ? result[0] : result).output;
const bundle = output.find((file) => file.type === 'chunk').code;
// Library builds extract side-effect CSS. Single-file exports must embed it too.
const css = output
  .filter((file) => file.type === 'asset' && file.fileName.endsWith('.css'))
  .map((file) => String(file.source))
  .join('\n');
if (!css.includes('.authored-ui')) throw new Error('Authored UI styles missing from runtime');
if (!bundle.includes('__OPENENGINE_PROJECT_BASE64__'))
  throw new Error('Project marker lost from runtime bundle');
const notices = await readFile('THIRD_PARTY_NOTICES.md', 'utf8');
await mkdir('public', { recursive: true });
await writeFile(
  'public/runtime-template.html',
  `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenEngine Game</title><style>${css.replaceAll('</style', '<\\/style')}</style></head><body><script type="text/plain" id="openengine-licenses">${notices.replaceAll('</script', '<\\/script')}</script><script>${bundle.replaceAll('</script', '<\\/script')}</script></body></html>`,
);
console.log('Built offline runtime template.');
