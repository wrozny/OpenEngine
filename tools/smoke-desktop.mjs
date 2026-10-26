import { _electron, expect } from '@playwright/test';
import { mkdtemp, readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { executable: { type: 'string' } } });
if (!values.executable) throw new Error('Pass --executable with a packaged Linux Studio path');
if (process.platform !== 'linux') throw new Error('This runner uses Linux ozone headless mode');
const args = [
  '--no-sandbox',
  '--ozone-platform=headless',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
];
const temp = await mkdtemp(join(tmpdir(), 'openengine-native-smoke-'));
const savePath = join(temp, 'Native Smoke.openengine'),
  exportRoot = join(temp, 'exports');
await mkdir(exportRoot);
const environment = {
  ...process.env,
  XDG_CONFIG_HOME: join(temp, 'config'),
  XDG_CACHE_HOME: join(temp, 'cache'),
};
await mkdir(environment.XDG_CONFIG_HOME);
await mkdir(environment.XDG_CACHE_HOME);
let studio, game;
const errors = [];
try {
  studio = await _electron.launch({
    executablePath: resolve(values.executable),
    args,
    env: environment,
    timeout: 20000,
  });
  const page = await studio.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.locator('#launch-host')).toBeVisible();
  await page.locator('.example-card').filter({ hasText: 'Dead Signal' }).click();
  await expect(page.locator('#project-name')).toHaveText('Dead Signal');
  await page
    .locator('.tree-name')
    .filter({ hasText: /^UIService$/ })
    .click();
  await page
    .locator('.ui-palette')
    .getByRole('button', { name: 'TextButton', exact: true })
    .click();
  await page.getByLabel('Text', { exact: true }).fill('Native UI');
  await page.getByLabel('Text', { exact: true }).press('Tab');
  await page
    .locator('.tree-row')
    .filter({ has: page.locator('.tree-name', { hasText: /^Survival$/ }) })
    .click();
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await studio.evaluate(
    ({ dialog }, { savePath, exportRoot }) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: savePath });
      dialog.showOpenDialog = async (_window, options) => ({
        canceled: false,
        filePaths: [options.title ? exportRoot : savePath],
      });
    },
    { savePath, exportRoot },
  );
  await page.locator('#save-project').click();
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await readFile(savePath, 'utf8')).name;
      } catch {
        return null;
      }
    })
    .toBe('Dead Signal');
  const project = JSON.parse(await readFile(savePath, 'utf8'));
  project.name = 'Native Smoke';
  await writeFile(savePath, JSON.stringify(project));
  await page.locator('#open-project').click();
  await expect(page.locator('#project-name')).toHaveText('Native Smoke');
  const recent = await page.evaluate(() => window.desktop.getRecentProjects());
  expect(recent.some((item) => item.path === savePath && item.exists)).toBe(true);
  await page.locator('#play').click();
  await expect(page.locator('.hud-health')).toContainText('100 / 100');
  await expect(page.locator('.game-view [data-ui-class=TextButton]')).toHaveText('Native UI');
  await page.getByRole('button', { name: /Stop play/ }).click();
  await exportGame(page);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.locator('#home').click();
  await page.locator('.example-card').filter({ hasText: 'Parcel Panic' }).click();
  await page.locator('#play').click();
  await expect(page.locator('[data-widget=task]')).toContainText('1 / 4');
  await page.getByRole('button', { name: /Stop play/ }).click();
  await exportGame(page);
  await expect(page.locator('#console .error')).toHaveCount(0);
  expect(errors).toEqual([]);
  await studio.close();
  studio = null;
  const folders = await readdir(exportRoot);
  for (const [prefix, title, selector, text] of [
    ['NativeSmoke-', 'Native Smoke', '.hud-health', '100 / 100'],
    ['ParcelPanic-', 'Parcel Panic', '[data-widget=task]', '1 / 4'],
  ]) {
    const folder = folders.find((name) => name.startsWith(prefix));
    expect(folder).toBeTruthy();
    const executable = prefix === 'NativeSmoke-' ? 'NativeSmoke' : 'ParcelPanic';
    game = await _electron.launch({
      executablePath: join(exportRoot, folder, executable),
      args,
      env: environment,
      timeout: 20000,
    });
    const gamePage = await game.firstWindow();
    gamePage.on('pageerror', (error) => errors.push(error.message));
    await expect(gamePage).toHaveTitle(title);
    await expect(gamePage.locator(selector)).toContainText(text);
    if (prefix === 'NativeSmoke-')
      await expect(gamePage.locator('[data-ui-class=TextButton]')).toHaveText('Native UI');
    expect(errors).toEqual([]);
    await game.close();
    game = null;
  }
  console.log(
    'Packaged Studio launcher, Monaco, file save/open/recents, 2D and 3D Play, native exports and exported games passed.',
  );
} finally {
  if (studio) await studio.close();
  if (game) await game.close();
  await rm(temp, { recursive: true, force: true });
}
async function exportGame(page) {
  const previous = await page.locator('#console').innerText();
  await page.locator('#build-project').click();
  await page.getByRole('button', { name: /Desktop game/ }).click();
  await expect
    .poll(
      async () => {
        const text = await page.locator('#console').innerText();
        return text !== previous && text.includes('Game built:');
      },
      { timeout: 30000 },
    )
    .toBe(true);
}
