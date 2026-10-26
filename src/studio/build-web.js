import { zipSync, strToU8 } from 'fflate';
import { clientDocument } from '../network/document.js';

export async function buildWebZip(project, fetchFile = (path) => fetch(path)) {
  const response = await fetchFile('./runtime-template.html');
  if (!response.ok)
    throw new Error('Runtime template is missing. Restart Studio or run npm run build.');
  const template = await response.text();
  if (!template.includes('__OPENENGINE_PROJECT_BASE64__'))
    throw new Error('Invalid runtime template');
  const client = project.multiplayer ? clientDocument(project) : project;
  const bytes = new TextEncoder().encode(JSON.stringify(client));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const html = template.replace('__OPENENGINE_PROJECT_BASE64__', btoa(binary));
  const files = { 'index.html': strToU8(html) };
  if (project.multiplayer) {
    const server = await fetchFile('./network/server.cjs');
    if (!server.ok) throw new Error('Server runtime is missing. Rebuild Studio.');
    files['server.cjs'] = strToU8(await server.text());
    files['project.json'] = strToU8(JSON.stringify(project));
    files['README.txt'] = strToU8(
      'Install Node.js 24 LTS, then run: node server.cjs\nOpen http://localhost:7777 on this computer, or http://SERVER-IP:7777 on other computers.\nPORT (default 7777) and HOST (default 0.0.0.0) configure the listener. Allow TCP through your firewall.\nFor public HTTPS deploy behind a reverse proxy with WebSocket upgrades and TLS; use wss://.\nKeep project.json on the server; distribute only index.html as a separate client.\n',
    );
    const notices = await fetchFile('./network/THIRD_PARTY_NOTICES.md');
    if (notices.ok) files['THIRD_PARTY_NOTICES.md'] = strToU8(await notices.text());
  } else files['README.txt'] = strToU8(project.name + '\nOpen index.html in a modern browser.\n');
  return zipSync(files);
}
