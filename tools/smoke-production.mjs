import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = resolve('dist');
const server = http.createServer(async (request, response) => {
  try {
    const path = resolve(
      root,
      '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname),
    );
    if (path !== root && !path.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    const file = (await stat(path)).isDirectory() ? resolve(path, 'index.html') : path;
    const types = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
    };
    response.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'",
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.goto(base);
  await page.locator('#play').click();
  await page.locator('.hud-health').waitFor();
  assert.match(await page.locator('.hud-health').textContent(), /100 \/ 100/);
  await page.getByRole('button', { name: 'Stop play' }).click();
  await page.goto(base + '/runtime.html');
  await page.locator('.hud-health').waitFor();
  assert.match(await page.locator('.game-hud').textContent(), /Wave 1/);
  await page.waitForTimeout(1200);
  assert.match(await page.locator('.hud-stats').textContent(), /7 infected/);
  assert.deepEqual(errors, []);
  console.log('Production Studio Play and standalone runtime passed with desktop CSP.');
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
