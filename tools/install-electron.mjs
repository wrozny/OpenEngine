import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const proxy =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy;
execFileSync(process.execPath, ['node_modules/electron/install.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    electron_config_cache: resolve('.cache/electron'),
    ...(proxy ? { ELECTRON_GET_USE_PROXY: '1' } : {}),
  },
});
