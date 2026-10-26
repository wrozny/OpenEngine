import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { unzipSync } from 'fflate';
import { buildWebZip } from '../src/studio/build-web.js';
import { loadProject } from './project.mjs';

const directory = await mkdtemp(join(tmpdir(), 'openengine-network-export-'));
let child, browser;
try {
  const project = await loadProject('examples/neon-borough/project.openengine');
  const archive = await buildWebZip(
    project,
    async (path) => new Response(await readFile('public/' + path.replace(/^\.\//, ''))),
  );
  for (const [name, data] of Object.entries(unzipSync(archive)))
    await writeFile(join(directory, name), data);
  const html = await readFile(join(directory, 'index.html'), 'utf8');
  const embedded = html.match(/atob\([`"']([A-Za-z0-9+/=]+)[`"']\)/);
  assert.ok(embedded, 'portable client embeds its redacted document');
  const clientProject = JSON.parse(Buffer.from(embedded[1], 'base64').toString());
  assert.ok(!JSON.stringify(clientProject).includes('ServerScript'));
  assert.ok(!JSON.stringify(clientProject).includes('lastAction'));
  child = spawn(process.execPath, ['server.cjs'], {
    cwd: directory,
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    output += data;
  });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server did not start: ' + output)), 15000);
    const poll = setInterval(() => {
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) {
        clearInterval(poll);
        clearTimeout(timeout);
        resolve(Number(match[1]));
      } else if (child.exitCode !== null) {
        clearInterval(poll);
        clearTimeout(timeout);
        reject(new Error(output));
      }
    }, 50);
  });
  browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const errors = [];
  const pages = [];
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  for (const name of ['Alice', 'Bob']) {
    const page = await context.newPage();
    await page.bringToFront();
    pages.push(page);
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
        errors.push(message.text());
        console.error(message.text());
      }
    });
    await page.goto(`http://127.0.0.1:${port}`);
    await page.getByLabel('Player name').fill(name);
    await page.getByRole('button', { name: 'Join server', exact: true }).click();
    try {
      await expect(page.locator('[data-widget="identity"]')).toContainText(name, {
        timeout: 20000,
      });
    } catch (error) {
      console.error(
        'Host output:',
        output,
        'Browser errors:',
        errors,
        'Page state:',
        await page.evaluate(() => ({
          hidden: document.hidden,
          visibility: document.visibilityState,
          widgets: document.querySelector('.game-widgets')?.innerHTML,
        })),
      );
      throw error;
    }
  }
  await pages[0].bringToFront();
  await expect(pages[0].locator('[data-widget="identity"]')).toContainText('2 online', {
    timeout: 20000,
  });
  assert.equal((await (await fetch(`http://127.0.0.1:${port}/health`)).json()).players, 2);
  await pages[0].locator('canvas').focus();
  await pages[0].keyboard.down('w');
  await pages[0].waitForTimeout(400);
  await pages[0].keyboard.up('w');
  await pages[0].screenshot({ path: 'artifacts/neon-borough-online.png' });
  await pages[1].close();
  await expect(pages[0].locator('[data-widget="identity"]')).toContainText('1 online');
  assert.deepEqual(errors, []);
  assert.ok(!output.includes('[error]'), output);
  console.log(
    'Exported web ZIP: bundled Node server, redacted client, two online players, input, disconnect and clean logs passed.',
  );
} finally {
  await browser?.close();
  child?.kill('SIGTERM');
  if (child && child.exitCode === null)
    await new Promise((resolve) => {
      child.once('exit', resolve);
      setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 3000).unref();
    });
  await rm(directory, { recursive: true, force: true });
}
