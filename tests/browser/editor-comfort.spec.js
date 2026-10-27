import { test, expect } from '@playwright/test';
test('context rename, property search and insert library provide undoable authoring', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Project template').selectOption('empty');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.locator('#insert-object').click();
  await page.getByRole('menuitem', { name: 'Insert Object2D', exact: true }).click();
  const row = page
    .locator('.tree-row')
    .filter({ has: page.locator('.tree-name', { hasText: /^Object2D$/ }) });
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename', exact: false }).click();
  const rename = page.getByLabel('Rename Object2D');
  await rename.fill('Roadster');
  await rename.press('Enter');
  await expect(page.locator('.tree-name').filter({ hasText: /^Roadster$/ })).toBeVisible();
  await page.getByLabel('Search properties').fill('friction');
  await expect(page.getByLabel('Friction', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Position X', { exact: true })).toBeHidden();
  await page.getByLabel('Search properties').press('Escape');
  await expect(page.getByLabel('Position X', { exact: true })).toBeVisible();
  await page.locator('#insert-library').click();
  await page.getByLabel('Search insert library').fill('Car2D');
  await page
    .locator('.library-item')
    .filter({ hasText: /^Car2D$/ })
    .click();
  await expect(page.getByLabel('EngineForce', { exact: true })).toBeVisible();
  await page.locator('#undo').click();
  await expect(page.locator('.tree-name').filter({ hasText: /^Car2D$/ })).toHaveCount(0);
});

test('library items drag into Explorer and Apex Circuit runs two independent drivers', async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.locator('#insert-library').click();
  await page.getByLabel('Search insert library').fill('Car2D');
  await page
    .locator('.library-item')
    .filter({ hasText: /^Car2D$/ })
    .dragTo(
      page
        .locator('.tree-row')
        .filter({ has: page.locator('.tree-name', { hasText: /^Workspace$/ }) }),
    );
  await expect(page.getByLabel('EngineForce', { exact: true })).toBeVisible();
  await page.locator('#home').click();
  await page.locator('.example-card').filter({ hasText: 'Apex Circuit' }).click();
  await page.locator('#play').click();
  await expect(page.locator('[data-widget="title"]').first()).toContainText('APEX CIRCUIT');
  await page.getByRole('button', { name: 'Add client', exact: true }).click();
  await expect(page.locator('[data-widget="title"]')).toHaveCount(2);
  await expect(page.locator('[data-widget="status"]').first()).toContainText('Racing', {
    timeout: 20000,
  });
  const canvas = page.locator('.network-client canvas').first();
  await canvas.click();
  await page.keyboard.down('w');
  await page.waitForTimeout(2000);
  await page.keyboard.up('w');
  await expect(page.locator('[data-widget="progress"]').first()).toContainText(/\b[1-9]\d* km\/h/);
  await page.screenshot({ path: 'artifacts/apex-circuit.png' });
  await page.getByRole('button', { name: 'Stop server', exact: false }).click();
  expect(errors).toEqual([]);
});
