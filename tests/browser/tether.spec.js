import { test, expect } from '@playwright/test';
test('Tether Run template runs two clients, a custom HUD, jump/dash movement and an aimed grapple', async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('.example-card').filter({ hasText: 'Tether Run' }).click();
  await page.locator('#play').click();
  const clients = page.locator('.network-client');
  await expect(clients).toHaveCount(1);
  await page.getByRole('button', { name: 'Add client', exact: true }).click();
  await expect(clients).toHaveCount(2);
  await expect(clients.first().getByText('TETHER / RUN', { exact: true })).toBeVisible();
  await expect(clients.first().getByText('RACING', { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(clients.first().locator('[data-ui-id="tether-14"] .ui-content')).toHaveCSS(
    'white-space',
    'pre',
  );
  const canvas = clients.first().locator('canvas');
  await canvas.click();
  await page.keyboard.down('d');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await page.keyboard.up('d');
  await page.keyboard.press('Shift');
  await expect(clients.first().getByText('DASH RECHARGING', { exact: true })).toBeVisible();
  await page.keyboard.press('r');
  await page.waitForTimeout(400);
  const target = await canvas.evaluate((c) => {
    const ctx = c.getContext('2d'),
      p = ctx.getImageData(0, 0, c.width, c.height).data,
      scale = c.width / c.getBoundingClientRect().width;
    for (let y = 20; y < c.height * 0.42; y++)
      for (let x = Math.floor(c.width * 0.5); x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (
          Math.abs(p[i] - 232) < 5 &&
          Math.abs(p[i + 1] - 197) < 5 &&
          Math.abs(p[i + 2] - 107) < 5
        )
          return { x: x / scale, y: y / scale };
      }
    return null;
  });
  expect(target).not.toBeNull();
  const bounds = await canvas.boundingBox();
  await page.mouse.move(bounds.x + target.x, bounds.y + target.y);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/tether-run.png' });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Stop server', exact: false }).click();
  expect(errors).toEqual([]);
});

test('new project form creates a named multiplayer grapple game template', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project template').selectOption('tether-run');
  await expect(page.getByLabel('Enable multiplayer')).toBeChecked();
  await expect(page.getByLabel('Enable multiplayer')).toBeDisabled();
  await page.getByLabel('New project name').fill('Rope Club');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.locator('#project-name')).toHaveText('Rope Club');
  await expect(page.locator('.tree-name').filter({ hasText: /^Match$/ })).toBeVisible();
});
