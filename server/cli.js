import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hostGame } from './host.js';

export async function runServer(directory = process.cwd()) {
  const project = JSON.parse(await readFile(resolve(directory, 'project.json'), 'utf8'));
  let html = '';
  try {
    html = await readFile(resolve(directory, 'index.html'), 'utf8');
  } catch {
    /* Native server has no web shell. */
  }
  const server = await hostGame(project, {
    host: process.env.HOST || '0.0.0.0',
    port: Number(process.env.PORT || 7777),
    html,
    onLog: (entry) => console.log(`[${entry.level}] ${entry.message}`),
  });
  console.log(`${project.name}: http://localhost:${server.port} (WebSocket /socket)`);
  const stop = async () => {
    await server.close();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return server;
}
