import { _electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { executable: { type: 'string' } } });
if (!values.executable || process.platform !== 'linux')
  throw new Error('Pass a packaged Linux Studio --executable');
const directory = await mkdtemp(join(tmpdir(), 'openengine-native-network-'));
const exportRoot = join(directory, 'exports');
await mkdir(exportRoot);
const environment = {
  ...process.env,
  XDG_CONFIG_HOME: join(directory, 'config'),
  XDG_CACHE_HOME: join(directory, 'cache'),
  PORT: '0',
  HOST: '127.0.0.1',
};
await mkdir(environment.XDG_CONFIG_HOME);
await mkdir(environment.XDG_CACHE_HOME);
const args = [
  '--no-sandbox',
  '--ozone-platform=headless',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
];
let studio, server;
const clients = [];
const errors = [];
try {
  studio = await _electron.launch({
    executablePath: resolve(values.executable),
    args,
    env: environment,
    timeout: 30000,
  });
  const page = await studio.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.locator('.example-card').filter({ hasText: 'Neon Borough' }).click();
  await page.locator('#play').click();
  await expect(page.locator('[data-widget="identity"]')).toContainText('1 online', {
    timeout: 20000,
  });
  await page.getByRole('button', { name: 'Add client', exact: true }).click();
  await expect(
    page.locator('.network-client').nth(1).locator('[data-widget="identity"]'),
  ).toContainText('2 online', { timeout: 20000 });
  await page.getByRole('button', { name: 'Stop server', exact: true }).click();
  await studio.evaluate(({ dialog }, destination) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [destination] });
  }, exportRoot);
  await page.locator('#build-project').click();
  await page.getByRole('button', { name: /Desktop game/ }).click();
  await expect(page.locator('#console')).toContainText('Game built:', { timeout: 60000 });
  const root = join(exportRoot, (await readdir(exportRoot))[0]),
    entries = await readdir(root);
  const serverDir = entries.find((entry) => entry.startsWith('NeonBoroughServer-')),
    clientDir = entries.find((entry) => entry.startsWith('NeonBorough-'));
  expect(serverDir).toBeTruthy();
  expect(clientDir).toBeTruthy();
  const clientText = await readFile(
    join(root, clientDir, 'resources', 'app', 'project.json'),
    'utf8',
  );
  expect(clientText).not.toContain('ServerScript');
  expect(clientText).not.toContain('lastAction');
  await studio.close();
  studio = null;
  server = await _electron.launch({
    executablePath: join(root, serverDir, 'NeonBoroughServer'),
    args,
    env: environment,
    timeout: 30000,
  });
  const monitor = await server.firstWindow();
  monitor.on('pageerror', (error) => errors.push(error.message));
  await expect(monitor.locator('#status')).toContainText('0 players', { timeout: 15000 });
  const port = (await monitor.locator('#address').textContent()).match(/SERVER-IP:(\d+)/)[1];
  for (const name of ['Native Alice', 'Native Bob']) {
    const client = await _electron.launch({
      executablePath: join(root, clientDir, 'NeonBorough'),
      args,
      env: environment,
      timeout: 30000,
    });
    clients.push(client);
    const view = await client.firstWindow();
    view.on('pageerror', (error) => errors.push(error.message));
    await view.getByLabel('Server address').fill(`ws://127.0.0.1:${port}/socket`);
    await view.getByLabel('Player name').fill(name);
    await view.getByRole('button', { name: 'Join server', exact: true }).click();
    await expect(view.locator('[data-widget="identity"]')).toContainText(name, { timeout: 20000 });
  }
  await expect(monitor.locator('#status')).toContainText('2 players', { timeout: 15000 });
  await clients.pop().close();
  await expect(monitor.locator('#status')).toContainText('1 players', { timeout: 15000 });
  await expect(monitor.locator('#logs')).not.toContainText('[error]');
  expect(errors).toEqual([]);
  await clients.pop().close();
  await Promise.all([
    server.waitForEvent('close'),
    monitor.getByRole('button', { name: 'Stop server and exit' }).click(),
  ]);
  server = null;
  console.log(
    'Packaged Studio real server + two clients, paired native export, redacted client, dedicated Server window, two exported native clients and clean shutdown passed.',
  );
} finally {
  for (const client of clients) await client.close();
  await studio?.close();
  await server?.close();
  await rm(directory, { recursive: true, force: true });
}
