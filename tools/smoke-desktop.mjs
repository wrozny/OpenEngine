import { _electron, expect } from '@playwright/test';
import { mkdtemp, readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { executable: { type: 'string' } } });
if (!values.executable) throw new Error('Pass --executable with a packaged Linux Studio path');
if (process.platform !== 'linux')
  throw new Error('This headless smoke runner uses Linux ozone headless mode');
const temp = await mkdtemp(join(tmpdir(), 'openengine-native-smoke-'));
const savePath = join(temp, 'Native Smoke.openengine'),
  exportRoot = join(temp, 'exports');
await mkdir(exportRoot);
let studio, game;
try {
  studio = await _electron.launch({
    executablePath: resolve(values.executable),
    args: ['--no-sandbox', '--ozone-platform=headless'],
    timeout: 20000,
  });
  const page = await studio.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.locator('#project-name')).toHaveText('Dead Signal');
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
  await page.locator('#play').click();
  await expect(page.locator('.hud-health')).toContainText('100 / 100');
  await page.getByRole('button', { name: 'Stop play' }).click();
  await page.locator('#build-project').click();
  await page.getByRole('button', { name: 'Desktop game', exact: false }).click();
  await expect(page.locator('#console')).toContainText('Game built:', { timeout: 30000 });
  expect(errors).toEqual([]);
  await expect(page.locator('#console .error')).toHaveCount(0);
  await studio.close();
  studio = null;
  const [folder] = await readdir(exportRoot);
  game = await _electron.launch({
    executablePath: join(exportRoot, folder, 'NativeSmoke'),
    args: ['--no-sandbox', '--ozone-platform=headless'],
    timeout: 20000,
  });
  const gamePage = await game.firstWindow();
  gamePage.on('pageerror', (error) => errors.push(error.message));
  await expect(gamePage).toHaveTitle('Native Smoke');
  await expect(gamePage.locator('.hud-health')).toContainText('100 / 100');
  await expect(gamePage.locator('.hud-identity')).toContainText('NATIVE SMOKE');
  expect(errors).toEqual([]);
  console.log(
    'Packaged Linux Studio: save, open, Lua Play, in-app native export and exported game startup passed.',
  );
} finally {
  if (studio) await studio.close();
  if (game) await game.close();
  await rm(temp, { recursive: true, force: true });
}
