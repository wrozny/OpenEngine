import { readFile, readdir, writeFile } from 'node:fs/promises';
const packages = [
  'fengari',
  'fengari-interop',
  'planck',
  'fflate',
  'sprintf-js',
  'readline-sync',
  'tmp',
  'stage-js',
  'three',
  'cannon-es',
  'monaco-editor',
  'golden-layout',
  'lucide',
  'dompurify',
  'marked',
  '@types/trusted-types',
];
let text =
  '# Third-party notices\n\nExact dependency licenses for OpenEngine runtime and Studio. Electron distributions also include LICENSE and LICENSES.chromium.html; keep those files beside the native executable.\n';
for (const name of packages) {
  const root = 'node_modules/' + name,
    info = JSON.parse(await readFile(root + '/package.json', 'utf8'));
  const license = (await readdir(root)).find((file) => /^licen[sc]e(\.(txt|md))?$/i.test(file));
  if (!license) throw new Error('Missing license for ' + name);
  text +=
    '\n## ' +
    name +
    ' ' +
    info.version +
    '\n\n' +
    (await readFile(root + '/' + license, 'utf8')) +
    '\n';
}
text +=
  '\n## Monaco third-party notices\n\n' +
  (await readFile('node_modules/monaco-editor/ThirdPartyNotices.txt', 'utf8')) +
  '\n';
await writeFile('THIRD_PARTY_NOTICES.md', text);
console.log('Updated exact runtime and Studio dependency notices.');
