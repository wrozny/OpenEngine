import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';

test('UI authoring moves, resizes, undoes, changes responsive units and exports a working offline interface', async ({
  page,
  context,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByLabel('Project template').selectOption('empty');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page
    .locator('.tree-name')
    .filter({ hasText: /^UIService$/ })
    .click();
  await expect(page.locator('.ui-editor')).toBeVisible();
  await page
    .locator('.ui-palette')
    .getByRole('button', { name: 'TextButton', exact: true })
    .click();
  await page.getByLabel('Text', { exact: true }).fill('Launch');
  await page.getByLabel('Text', { exact: true }).press('Tab');
  const button = page.locator('.ui-artboard [data-ui-class=TextButton]');
  await expect(button).toHaveText('Launch');
  const box = await button.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  const moved = Number(await page.getByLabel('Position XOffset', { exact: true }).inputValue());
  expect(moved).toBeGreaterThan(24);
  await page.locator('#undo').click();
  await expect(page.getByLabel('Position XOffset', { exact: true })).toHaveValue('24');
  await page.locator('#redo').click();
  const handle = await page.locator('.ui-handle.se').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 20, handle.y + handle.height / 2 + 10, {
    steps: 5,
  });
  await page.mouse.up();
  expect(
    Number(await page.getByLabel('Size XOffset', { exact: true }).inputValue()),
  ).toBeGreaterThan(160);
  await page.getByLabel('Position XScale', { exact: true }).fill('0.5');
  await page.getByLabel('Position XScale', { exact: true }).press('Tab');
  await page.getByLabel('AnchorPoint X', { exact: true }).fill('0.5');
  await page.getByLabel('AnchorPoint X', { exact: true }).press('Tab');
  await page.getByLabel('UI preview device').selectOption('390,844');
  await expect(page.locator('.ui-artboard')).toHaveCSS('width', '390px');
  await expect(button).toBeVisible();
  await page.getByRole('button', { name: 'Add OnClick handler', exact: true }).click();
  await expect(page.locator('.script-panel')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#save-project').click();
  const download = await downloadPromise;
  const project = JSON.parse(await readFile(await download.path(), 'utf8'));
  const service = project.services.find((s) => s.name === 'UIService'),
    saved = service.children[0].children[0];
  expect(saved.Position.XScale).toBe(0.5);
  expect(saved.children[0].Source).toContain('OnClick:Connect');
  await page.locator('#build-project').click();
  const zipPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Web game ZIP/ }).click();
  const zip = await zipPromise;
  const files = unzipSync(new Uint8Array(await readFile(await zip.path())));
  const game = await context.newPage();
  const gameErrors = [];
  game.on('pageerror', (e) => gameErrors.push(e.message));
  await game.setContent(strFromU8(files['index.html']));
  await expect(game.getByRole('button', { name: 'TextButton', exact: true })).toHaveText('Launch');
  await game.getByRole('button', { name: 'TextButton', exact: true }).click();
  expect(gameErrors).toEqual([]);
  await game.close();
  expect(errors).toEqual([]);
});

test('runtime click, hover, input focus, animation and responsive layout use the authored scene', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const [{ createProject }, { createDialog }, { serializeNode, SceneNode }, { GameView }] =
      await Promise.all([
        import('/src/studio/projects.js'),
        import('/src/ui/templates.js'),
        import('/src/engine/scene.js'),
        import('/src/game-view.js'),
      ]);
    const project = createProject();
    const screen = createDialog();
    const panel = screen.FindFirstChild('Panel'),
      confirm = panel.FindFirstChild('Actions').FindFirstChild('Confirm');
    const script = new SceneNode('Script', 'Events');
    script.Source =
      'local b = script.Parent\nb.OnClick:Connect(function() b.Text="Clicked"; b:Tween({Opacity=0.5},0.1) end)\nb.OnHoverStart:Connect(function() b.Text="Hovered" end)\nb.OnHoverEnd:Connect(function() if b.Text ~= "Clicked" then b.Text="Left" end end)';
    script.Parent = confirm;
    const input = new SceneNode('TextInput', 'NameInput');
    input.Position = { XScale: 0, XOffset: 10, YScale: 0, YOffset: 10 };
    input.Parent = screen;
    project.services[2].children.push(serializeNode(screen));
    const host = document.createElement('div');
    host.id = 'ui-runtime-test';
    host.style.cssText = 'position:fixed;inset:0;z-index:99999';
    document.body.append(host);
    window.uiTestView = new GameView(host, project);
  });
  const button = page.locator('#ui-runtime-test [data-ui-class=TextButton]').first();
  await button.hover();
  await expect(button).toHaveText('Hovered');
  await button.click();
  await expect(button).toHaveText('Clicked');
  await expect(button).toHaveCSS('opacity', '0.5');
  const input = page.locator('#ui-runtime-test input');
  await input.fill('Ada');
  await page.waitForTimeout(150);
  await expect(input).toHaveValue('Ada');
  await expect(input).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = page.locator('#ui-runtime-test [data-ui-class=Frame]').first();
  await expect(panel).toHaveCSS('width', '342px');
  const r = await panel.boundingBox();
  expect(r.x).toBe(24);
  await page.evaluate(() => window.uiTestView.dispose());
});

test('dialog preset supports palette drops into frames, flow reordering, and cancelling a canvas gesture', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Project template').selectOption('empty');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page
    .locator('.tree-name')
    .filter({ hasText: /^UIService$/ })
    .click();
  await page.getByRole('button', { name: 'Responsive dialog', exact: true }).click();
  await page.getByLabel('UI preview device').selectOption('390,844');
  const panel = page.locator('.ui-artboard [data-ui-class=Frame]').first();
  await expect(panel).toBeVisible();
  const confirm = page
      .locator('.ui-artboard [data-ui-class=TextButton]')
      .filter({ hasText: 'Confirm' }),
    close = page.locator('.ui-artboard [data-ui-class=TextButton]').filter({ hasText: 'Close' });
  const a = await confirm.boundingBox(),
    b = await close.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 5, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
  expect((await confirm.boundingBox()).x).toBeGreaterThan((await close.boundingBox()).x);
  await page.locator('#undo').click();
  expect((await confirm.boundingBox()).x).toBeLessThan((await close.boundingBox()).x);
  await page
    .locator('.ui-palette')
    .getByRole('button', { name: 'TextInput', exact: true })
    .dragTo(panel, { targetPosition: { x: 20, y: 20 } });
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('TextInput');
  await expect(page.locator('.ui-artboard input')).toHaveCount(1);
  await panel.click({ position: { x: 5, y: 5 } });
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Panel');
  const before = await page.getByLabel('Position XOffset', { exact: true }).inputValue();
  const r = await panel.boundingBox();
  await page.mouse.move(r.x + 5, r.y + 5);
  await page.mouse.down();
  await page.mouse.move(r.x + 45, r.y + 30, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByLabel('Position XOffset', { exact: true })).toHaveValue(before);
  await page.screenshot({ path: 'artifacts/ui-editor.png' });
});
