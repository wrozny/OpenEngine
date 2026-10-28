import { _electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
const { values } = parseArgs({ options: { executable: { type: 'string' } } });
if (!values.executable || process.platform !== 'linux')
  throw new Error('Pass a packaged Linux Studio --executable');
const directory = await mkdtemp(join(tmpdir(), 'tether-native-')),
  env = {
    ...process.env,
    XDG_CONFIG_HOME: join(directory, 'config'),
    XDG_CACHE_HOME: join(directory, 'cache'),
  };
await mkdir(env.XDG_CONFIG_HOME);
await mkdir(env.XDG_CACHE_HOME);
let app;
try {
  app = await _electron.launch({
    executablePath: resolve(values.executable),
    env,
    args: [
      '--no-sandbox',
      '--ozone-platform=headless',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
    timeout: 30000,
  });
  const page = await app.firstWindow(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByLabel('Project template').selectOption('tether-run');
  await page.getByLabel('New project name').fill('Native Ropes');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.locator('#project-name')).toHaveText('Native Ropes');
  await page.locator('#play').click();
  await page.getByRole('button', { name: 'Add client', exact: true }).click();
  await expect(page.locator('.network-client')).toHaveCount(2);
  const first = page.locator('.network-client').first();
  await expect(first.getByText('RACING', { exact: true })).toBeVisible({ timeout: 20000 });
  await first.locator('canvas').click();
  await page.keyboard.press('Shift');
  await expect(first.getByText('DASH RECHARGING', { exact: true })).toBeVisible();
  await page.keyboard.press('r');
  await page.getByRole('button', { name: 'Stop server', exact: false }).click();
  expect(errors).toEqual([]);
  console.log(
    'Packaged native Tether Run: named template, real host, two clients, round start, dash and clean stop passed.',
  );
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
