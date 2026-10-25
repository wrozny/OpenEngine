import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Studio ready.', { exact: false })).toBeVisible();
});

test('scene transforms, undo/redo, hierarchy and Lua editing survive save and reload', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByLabel('Position X', { exact: true }).fill('150');
  await page.getByLabel('Position X', { exact: true }).press('Tab');
  await page.locator('#undo').click();
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('0');
  await page.locator('#redo').click();
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('150');
  await page.locator('#add-class').selectOption('Script');
  await expect(page.getByLabel('Lua script source')).toBeVisible();
  await page
    .getByLabel('Lua script source')
    .fill('print("Browser integration passed", script.Parent.Name)');
  await page.locator('#play').click();
  await expect(page.locator('#console')).toContainText('Browser integration passed  Player');
  await expect(page.locator('.game-hud')).toContainText('Wave 1');
  await page.getByRole('button', { name: 'Stop play' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#save-project').click();
  const download = await downloadPromise;
  const project = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(project.services[0].children.find((n) => n.name === 'Player').Position.X).toBe(150);
  expect(
    project.services[0].children.find((n) => n.name === 'Player').children[0].Source,
  ).toContain('Browser integration passed');
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.locator('#tree')).toContainText('Player');
  expect(errors).toEqual([]);
});

test('viewport drag edits position and play displays working Lua HUD', async ({ page }) => {
  await page.locator('#scene-tab').click();
  const rect = await page.locator('#scene-canvas').boundingBox();
  const x = rect.x + rect.width / 2,
    y = rect.y + rect.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 70, y + 35, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('100');
  await expect(page.getByLabel('Position Y', { exact: true })).toHaveValue('50');
  await page.locator('#play').click();
  await expect(page.locator('.hud-health')).toContainText('100 / 100');
  await page.locator('.game-canvas').click();
  await page.keyboard.down('d');
  await page.waitForTimeout(300);
  await page.keyboard.up('d');
  await expect(page.locator('#console .error')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/game.png' });
  await page.getByRole('button', { name: 'Stop play' }).click();
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('100');
  await page.screenshot({ path: 'artifacts/studio.png' });
});

test('web export contains an offline executable runtime that actually runs', async ({
  page,
  context,
}) => {
  await page.locator('#build-project').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Web game', exact: false }).click();
  const download = await downloadPromise;
  const zip = unzipSync(new Uint8Array(await readFile(await download.path())));
  const html = strFromU8(zip['index.html']);
  expect(html).not.toContain('__OPENENGINE_PROJECT_BASE64__');
  const game = await context.newPage();
  const errors = [];
  game.on('pageerror', (e) => errors.push(e.message));
  await game.setContent(html);
  await expect(game.locator('.game-hud')).toContainText('Wave 1');
  await expect(game.locator('.hud-health')).toContainText('100 / 100');
  await game.waitForTimeout(1200);
  await expect(game.locator('.hud-stats')).toContainText('7 infected');
  expect(errors).toEqual([]);
});

test('new projects, modules and invalid file handling', async ({ page }) => {
  await page.locator('#new-project').click();
  await expect(page.locator('#project-name')).toHaveText('Untitled game');
  await page.locator('#add-class').selectOption('ModuleScript');
  await expect(page.locator('#source')).toHaveValue(/return Module/);
  await page.locator('#open-file').setInputFiles({
    name: 'bad.openengine',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"bad"}'),
  });
  await expect(page.locator('#console .error')).toContainText('Expected an OpenEngine');
  await expect(page.locator('#tree')).toContainText('ModuleScript');
});
