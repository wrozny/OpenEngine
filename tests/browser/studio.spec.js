import { loadProject } from '../../tools/project.mjs';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';

const tree = (page, name) =>
  page
    .locator('.tree-row')
    .filter({ has: page.locator('.tree-name', { hasText: new RegExp('^' + name + '$') }) });
async function insert(page, name) {
  await page.locator('#insert-object').click();
  await page.getByRole('menuitem', { name: 'Insert ' + name, exact: true }).click();
}
async function replaceCode(page, source) {
  await page.locator('.monaco-editor').click({ position: { x: 200, y: 60 } });
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText(source);
}
async function example(page, name = 'Dead Signal') {
  await page.locator('.example-card').filter({ hasText: name }).click();
  await expect(page.locator('#launch-host')).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Create project', exact: true })).toBeVisible();
});

test('launcher creates an explicit dimension and keeps removable, missing browser recents', async ({
  page,
}) => {
  await expect(page.locator('#project-name')).toHaveText('No project');
  await page.getByLabel('New project name').fill('Fresh scene');
  await page.getByLabel('Project template').selectOption('empty');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.locator('#project-name')).toHaveText('Fresh scene');
  await expect(page.locator('#tree .tree-row')).toHaveCount(2);
  await page.locator('#home').click();
  await expect(page.locator('.recent-open')).toContainText('Fresh scene');
  await page.addInitScript(() => {
    const list = JSON.parse(localStorage.getItem('openengine.recents.v2'));
    localStorage.removeItem('openengine.project.' + list[0].id);
  });
  await page.reload();
  await expect(page.locator('.recent-project.missing')).toContainText('Fresh scene');
  await expect(page.locator('.recent-open')).toBeDisabled();
  await page.getByRole('button', { name: 'Remove recent Fresh scene' }).click();
  await expect(page.locator('.recent-project')).toHaveCount(0);
});

test('scene dragging, attributes and undo survive a portable save', async ({ page }) => {
  await example(page);
  await tree(page, 'Player').click();
  const rect = await page.locator('#scene-canvas').boundingBox(),
    x = rect.x + rect.width / 2,
    y = rect.y + rect.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 70, y + 35, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('100');
  await expect(page.getByLabel('Position Y', { exact: true })).toHaveValue('50');
  await page.locator('#undo').click();
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('0');
  await page.locator('#redo').click();
  await page.getByLabel('Attribute name', { exact: true }).fill('Inventory');
  await page.getByLabel('Attribute type', { exact: true }).selectOption('JSON');
  await page.getByLabel('Attribute value', { exact: true }).fill('{"coins":12,"items":["key"]}');
  await page.getByRole('button', { name: 'Add attribute', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#save-project').click();
  const download = await downloadPromise;
  const project = JSON.parse(await readFile(await download.path(), 'utf8'));
  const player = project.services[0].children.find((node) => node.name === 'Player');
  expect(player.className).toBe('Object2D');
  expect(player.Position.X).toBe(100);
  expect(player.attributes.Inventory).toEqual({ coins: 12, items: ['key'] });
});

test('right-click insert and multi-selection delete operate on the whole selection', async ({
  page,
}) => {
  await page.getByLabel('Project template').selectOption('empty');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.locator('#scene-canvas').click({ button: 'right', position: { x: 200, y: 150 } });
  await page.getByRole('menuitem', { name: 'Insert Object2D', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('First');
  await page.getByLabel('Name', { exact: true }).press('Tab');
  await tree(page, 'Workspace').click();
  await insert(page, 'Object2D');
  await page.getByLabel('Name', { exact: true }).fill('Second');
  await page.getByLabel('Name', { exact: true }).press('Tab');
  await tree(page, 'First').click();
  await tree(page, 'Second').click({ modifiers: ['Control'] });
  await expect(page.locator('#selection-info')).toHaveText('2 selected');
  await tree(page, 'Second').click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Delete selection/ }).click();
  await expect(tree(page, 'First')).toHaveCount(0);
  await expect(tree(page, 'Second')).toHaveCount(0);
  await page.locator('#undo').click();
  await expect(tree(page, 'First')).toBeVisible();
  await expect(tree(page, 'Second')).toBeVisible();
});

test('Monaco highlights Lua, completes engine APIs, reports syntax errors and saves source', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await example(page);
  await tree(page, 'Survival').click();
  await expect(page.locator('.monaco-editor')).toBeVisible();
  expect(await page.locator('.view-lines span[class^=mtk]').count()).toBeGreaterThan(10);
  await replaceCode(page, 'local object = script.Parent\nworkspace:');
  await page.keyboard.press('Control+Space');
  await expect(page.locator('.suggest-widget')).toBeVisible();
  await page.keyboard.insertText('Ray');
  await expect(page.locator('.suggest-widget')).toContainText('Raycast');
  await page.keyboard.press('Escape');
  await replaceCode(page, 'local =');
  await expect(page.locator('.squiggly-error').first()).toBeVisible();
  await replaceCode(page, 'print("Monaco integration passed", script.Parent.Name)');
  await page.locator('#play').click();
  await expect(page.locator('#console')).toContainText('Monaco integration passed  ScriptService');
  await page.getByRole('button', { name: /Stop play/ }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#save-project').click();
  const download = await downloadPromise;
  const p = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(p.services[1].children.find((node) => node.name === 'Survival').Source).toContain(
    'Monaco integration passed',
  );
  expect(errors).toEqual([]);
});

test('dock dividers resize panels and the saved layout can be reset', async ({ page }) => {
  await example(page);
  const before = await page.locator('.explorer-panel').boundingBox();
  const splitters = page.locator('.lm_splitter');
  let splitter;
  for (let i = 0; i < (await splitters.count()); i++) {
    const box = await splitters.nth(i).boundingBox();
    if (box?.width < 10 && box.height > 100 && Math.abs(box.x - before.x - before.width) < 10) {
      splitter = box;
      break;
    }
  }
  expect(splitter).toBeTruthy();
  await page.mouse.move(splitter.x + splitter.width / 2, splitter.y + 100);
  await page.mouse.down();
  await page.mouse.move(splitter.x + 65, splitter.y + 100, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => (await page.locator('.explorer-panel').boundingBox()).width)
    .toBeGreaterThan(before.width + 40);
  const resized = await page.locator('.explorer-panel').boundingBox();
  await page.reload();
  await example(page);
  const restored = await page.locator('.explorer-panel').boundingBox();
  expect(Math.abs(restored.width - resized.width)).toBeLessThan(5);
  await page.locator('#reset-layout').click();
  const reset = await page.locator('.explorer-panel').boundingBox();
  expect(Math.abs(reset.width - before.width)).toBeLessThan(8);
});

test('3D project renders, edits materials and world settings, and executes the story', async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await example(page, 'Parcel Panic');
  await expect(page.locator('#project-dimension')).toHaveText('3D');
  await tree(page, 'Island').click();
  await page.getByLabel('Material', { exact: true }).selectOption('Brick');
  await expect(page.getByRole('button', { name: 'Move tool' })).toBeVisible();
  await page.getByLabel('TextureScale', { exact: true }).fill('4');
  await page.getByLabel('TextureScale', { exact: true }).press('Tab');
  await tree(page, 'Workspace').click();
  await expect(page.getByLabel('FallenHeight', { exact: true })).toHaveValue('-40');
  await page.getByLabel('Upload sky image', { exact: true }).setInputFiles({
    name: 'sky.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="8"><rect width="16" height="8" fill="#abc"/></svg>',
    ),
  });
  await expect(page.getByLabel('Skybox', { exact: true })).toHaveValue('custom');
  await page.getByLabel('Skybox', { exact: true }).selectOption('');
  await page.getByLabel('Skybox', { exact: true }).selectOption('builtin:sky');
  await page.locator('#play').click();
  await expect(page.locator('[data-widget=task]')).toContainText('1 / 4');
  await page.locator('.game-canvas').click();
  await page.keyboard.down('d');
  await page.waitForTimeout(350);
  await page.keyboard.up('d');
  await expect(page.locator('#console .error')).toHaveCount(0);

  await page.getByRole('button', { name: /Stop play/ }).click();

  expect(errors).toEqual([]);
});

test('offline web exports execute both 2D and 3D projects without external files', async ({
  page,
  context,
}) => {
  for (const name of ['Dead Signal', 'Parcel Panic']) {
    if (name !== 'Dead Signal') await page.locator('#home').click();
    await example(page, name);
    await page.locator('#build-project').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Web game ZIP/ }).click();
    const download = await downloadPromise;
    const zip = unzipSync(new Uint8Array(await readFile(await download.path())));
    const html = strFromU8(zip['index.html']);
    expect(html).not.toContain('__OPENENGINE_PROJECT_BASE64__');
    const game = await context.newPage(),
      errors = [];
    game.on('pageerror', (error) => errors.push(error.message));
    await game.setContent(html);
    if (name === 'Dead Signal') await expect(game.locator('.game-hud')).toContainText('Wave 1');
    else await expect(game.locator('[data-widget=task]')).toContainText('1 / 4');
    await game.waitForTimeout(500);
    expect(errors).toEqual([]);
    await game.close();
    await page.getByRole('button', { name: 'Close dialog' }).click();
  }
});

test('panel tabs dock into a new split and restore after reload', async ({ page }) => {
  await example(page);
  await expect(page.locator('.lm_stack')).toHaveCount(4);
  const tab = await page
    .locator('.lm_tab')
    .filter({ hasText: /^Script$/ })
    .boundingBox();
  const scene = await page.locator('.scene-panel').boundingBox();
  await page.mouse.move(tab.x + 20, tab.y + 15);
  await page.mouse.down();
  await page.mouse.move(tab.x + 30, tab.y + 60, { steps: 5 });
  await page.mouse.move(scene.x + scene.width - 40, scene.y + scene.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('.lm_stack')).toHaveCount(5);
  await page.reload();
  await example(page);
  await expect(page.locator('.lm_stack')).toHaveCount(5);
  await page.locator('#reset-layout').click();
  await expect(page.locator('.lm_stack')).toHaveCount(4);
});

test('multiplayer Studio starts a real server, adds clients, drives owned characters and removes players', async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await example(page, 'Neon Borough');
  await page.locator('#play').click();
  const clients = page.locator('.network-client');
  await expect(clients).toHaveCount(1);
  await expect(clients.nth(0).locator('[data-widget="identity"]')).toContainText('1 online');
  await page.getByRole('button', { name: 'Add client', exact: true }).click();
  await expect(clients).toHaveCount(2);
  await expect(clients.nth(0).locator('[data-widget="identity"]')).toContainText('2 online');
  await expect(clients.nth(1).locator('[data-widget="identity"]')).toContainText('2 online');
  await expect(page.getByLabel('Server instance')).toContainText('2 players');
  await expect(clients.nth(0).locator('.world-label')).toHaveCount(2);
  await expect(clients.nth(0).locator('.world-label').first()).toContainText('0 SWAG');
  const canvas = clients.nth(0).locator('canvas');
  await canvas.focus();
  await page.keyboard.down('w');
  await page.waitForTimeout(350);
  await page.keyboard.up('w');
  await canvas.click();
  await clients.nth(1).getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(clients).toHaveCount(1);
  await expect(clients.nth(0).locator('[data-widget="identity"]')).toContainText('1 online');
  await expect(page.getByLabel('Server instance')).toContainText('1 players');
  await page.screenshot({ path: 'artifacts/multiplayer-studio.png', fullPage: true });
  await page.getByRole('button', { name: 'Stop server', exact: true }).click();
  await expect(page.locator('#play-host')).toBeHidden();
  expect(errors).toEqual([]);
});

test('multiplayer selection persists through project settings and web builds include a runnable host', async ({
  page,
}) => {
  await page.getByLabel('New project name').fill('Online starter');
  await page.getByLabel('Enable multiplayer').check();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.locator('#project-settings').click();
  await expect(page.getByRole('dialog').getByLabel('Enable multiplayer')).toBeChecked();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await page.locator('#build-project').click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: /Web game ZIP/ }).click();
  const download = await downloading;
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  expect(Object.keys(files)).toEqual(
    expect.arrayContaining(['index.html', 'server.cjs', 'project.json']),
  );
  const project = JSON.parse(strFromU8(files['project.json']));
  expect(project.multiplayer).toBe(true);
  expect(strFromU8(files['server.cjs'])).toContain('WebSocketServer');
  expect(project.services[1].children.some((n) => n.className === 'ServerScript')).toBe(true);
});

test('default controller traversal settings and wedge shapes are editable and saved', async ({
  page,
}) => {
  await page.locator('input[name="dimension"][value="3D"]').check();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByRole('button', { name: 'Expand Player', exact: true }).click();
  await tree(page, 'PlayerController3D').click();
  await expect(page.getByLabel('StepHeight', { exact: true })).toHaveValue('0.45');
  await page.getByLabel('MaxSlopeAngle', { exact: true }).fill('40');
  await page.getByLabel('MaxSlopeAngle', { exact: true }).press('Tab');
  await insert(page, 'Object3D');
  await page.getByLabel('Shape', { exact: true }).selectOption('Wedge');
  const downloading = page.waitForEvent('download');
  await page.locator('#save-project').click();
  const download = await downloading;
  const project = JSON.parse(await readFile(await download.path(), 'utf8'));
  const nodes = [];
  const visit = (node) => {
    nodes.push(node);
    node.children.forEach(visit);
  };
  project.services.forEach(visit);
  expect(nodes.some((node) => node.Shape === 'Wedge')).toBe(true);
  expect(nodes.find((node) => node.className === 'PlayerController3D').MaxSlopeAngle).toBe(40);
});

test('a real server-confirmed resident takedown updates HUD and overhead swag', async ({
  page,
}) => {
  test.setTimeout(60000);
  const project = await loadProject('examples/neon-borough/project.openengine');
  const residents = project.services[0].children.find((node) => node.name === 'Pedestrians');
  residents.children[0].Position = { X: -1, Y: 1.4, Z: 15 };
  await page.locator('#open-file').setInputFiles({
    name: 'Swag test.openengine',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.locator('#launch-host')).toBeHidden();
  await page.locator('#play').click();
  const client = page.locator('.network-client').first();
  await expect(client.locator('.world-label')).toContainText('0 SWAG', { timeout: 15000 });
  const canvas = client.locator('canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await expect(client.locator('[data-widget="stats"]')).toContainText('SWAG 10', {
      timeout: 20000,
    });
  } finally {
    await page.mouse.up();
  }
  await expect(client.locator('.world-label')).toContainText('10 SWAG');
  await expect(client.locator('.world-label')).toBeVisible();
  await page.screenshot({ path: 'artifacts/swag-award.png', fullPage: true });
  await page.getByRole('button', { name: 'Stop server', exact: true }).click();
});
