import { chromium, expect } from '@playwright/test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { unzipSync, strFromU8 } from 'fflate';
import assert from 'node:assert/strict';
const directory = await mkdtemp(join(tmpdir(), 'tether-export-'));
let processHandle, browser;
try {
  const files = unzipSync(new Uint8Array(await readFile('release/TetherRun-web.zip')));
  for (const [name, data] of Object.entries(files)) await writeFile(join(directory, name), data);
  const html = strFromU8(files['index.html']);
  assert.ok(!html.includes('__OPENENGINE_PROJECT_BASE64__'));
  processHandle = spawn(process.execPath, ['server.cjs'], {
    cwd: directory,
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  processHandle.stdout.on('data', (chunk) => (output += chunk));
  processHandle.stderr.on('data', (chunk) => (output += chunk));
  await expect
    .poll(() => output.match(/http:\/\/localhost:(\d+)/)?.[1], { timeout: 20000 })
    .toBeTruthy();
  const port = output.match(/http:\/\/localhost:(\d+)/)[1];
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } }),
    errors = [],
    pages = [];
  for (const name of ['Rope tester', 'Second runner']) {
    const page = await context.newPage();
    pages.push(page);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + port);
    await page.getByLabel('Player name').fill(name);
    await page.getByRole('button', { name: 'Join server', exact: true }).click();
    await expect(page.getByText('TETHER / RUN', { exact: true })).toBeVisible({ timeout: 15000 });
  }
  const page = pages[0];
  await page.bringToFront();
  await expect(page.getByText('RACING', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.locator('canvas').click();
  await page.keyboard.press('Shift');
  await expect(page.getByText('DASH RECHARGING', { exact: true })).toBeVisible();
  await page.keyboard.press('r');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'artifacts/tether-export.png' });
  assert.deepEqual(errors, []);
  console.log(
    'Self-contained Tether Run server and web export: two joins, authored HUD, round start, owned dash and recovery passed.',
  );
} finally {
  await browser?.close();
  processHandle?.kill();
  await rm(directory, { recursive: true, force: true });
}
