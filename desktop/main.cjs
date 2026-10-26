const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { ProjectRegistry, MAX_PROJECT_BYTES } = require('./projects.cjs');
const { buildNativeGame } = require('./export.cjs');
let window, testServer;
const isServer = require('../package.json').openengineMode === 'server';
const mode = require('../package.json').openengineMode || 'studio';
const appRoot = path.resolve(__dirname, '..');

function trusted(event) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame
  )
    throw new Error('Unauthorized window');
}
function projectText(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_PROJECT_BYTES)
    throw new Error('Project is too large (64 MB maximum)');
  const project = JSON.parse(text);
  if (
    project.format !== 'openengine' ||
    project.version !== 1 ||
    typeof project.name !== 'string' ||
    !Array.isArray(project.services)
  )
    throw new Error('Invalid project');
  return project;
}
app.whenReady().then(async () => {
  if (isServer) {
    try {
      const { runServer } = require('../dist/network/cli.cjs');
      testServer = await runServer(appRoot);
      window = new BrowserWindow({
        width: 760,
        height: 550,
        minWidth: 640,
        minHeight: 480,
        title: 'OpenEngine Dedicated Server',
        autoHideMenuBar: true,
        backgroundColor: '#171b22',
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event) => event.preventDefault());
      window.on('closed', () => app.quit());
      ipcMain.handle('network:status', (event) => {
        trusted(event);
        return { ...testServer.status(), port: testServer.port };
      });
      ipcMain.handle('network:stop', async (event) => {
        trusted(event);
        await testServer.close();
        testServer = null;
        app.quit();
      });
      window.loadFile(path.join(__dirname, 'server.html'));
    } catch (error) {
      console.error(error);
      app.quit();
    }
    return;
  }
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  session.defaultSession.webRequest.onHeadersReceived((details, callback) =>
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' ws: wss:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'",
        ],
      },
    }),
  );
  window = new BrowserWindow({
    title: mode === 'game' ? 'OpenEngine Game' : 'OpenEngine Studio',
    width: 1440,
    height: 930,
    minWidth: mode === 'game' ? 720 : 900,
    minHeight: 600,
    backgroundColor: '#14211d',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.loadFile(path.join(appRoot, 'dist', mode === 'game' ? 'runtime.html' : 'index.html'));
  ipcMain.handle('project:bundled', async (event) => {
    trusted(event);
    if (mode !== 'game') return null;
    return JSON.parse(await fs.readFile(path.join(appRoot, 'project.json'), 'utf8'));
  });
  if (mode !== 'studio') return;
  ipcMain.handle('network:start', async (event, text) => {
    trusted(event);
    const project = projectText(text);
    await testServer?.close();
    const { hostGame } = require('../dist/network/host.cjs');
    testServer = await hostGame(project);
    return { url: 'ws://127.0.0.1:' + testServer.port + '/socket' };
  });
  ipcMain.handle('network:stop', async (event) => {
    trusted(event);
    await testServer?.close();
    testServer = null;
  });
  ipcMain.handle('network:status', (event) => {
    trusted(event);
    return testServer?.status() || {};
  });
  const registry = new ProjectRegistry(path.join(app.getPath('userData'), 'recent-projects.json'));
  ipcMain.handle('project:recents', async (event) => {
    trusted(event);
    return registry.list();
  });
  ipcMain.handle('project:forget', async (event, file) => {
    trusted(event);
    await registry.forget(file);
  });
  ipcMain.handle('project:reopen', async (event, file) => {
    trusted(event);
    return registry.read(file);
  });
  ipcMain.handle('project:open-record', async (event) => {
    trusted(event);
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: 'OpenEngine project', extensions: ['openengine', 'json'] }],
    });
    if (result.canceled) return null;
    return registry.read(result.filePaths[0], true);
  });
  ipcMain.handle('project:save-record', async (event, text, name, currentPath) => {
    trusted(event);
    projectText(text);
    if (currentPath) return registry.save(currentPath, text);
    const result = await dialog.showSaveDialog(window, {
      defaultPath: path.basename(String(name)),
      filters: [{ name: 'OpenEngine project', extensions: ['openengine'] }],
    });
    if (result.canceled) return null;
    return registry.save(result.filePath, text, true);
  });

  ipcMain.handle('project:open', async (event) => {
    trusted(event);
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: 'OpenEngine project', extensions: ['openengine', 'json'] }],
    });
    if (result.canceled) return null;
    const stat = await fs.stat(result.filePaths[0]);
    if (stat.size > 16 * 1024 * 1024) throw new Error('Project is too large');
    return fs.readFile(result.filePaths[0], 'utf8');
  });
  ipcMain.handle('project:save', async (event, text, name) => {
    trusted(event);
    projectText(text);
    const result = await dialog.showSaveDialog(window, {
      defaultPath: path.basename(String(name)),
      filters: [{ name: 'OpenEngine project', extensions: ['openengine'] }],
    });
    if (result.canceled) return false;
    // A temporary sibling avoids leaving a half-written save if writing is interrupted.
    const temporary = result.filePath + '.tmp';
    await fs.writeFile(temporary, text, 'utf8');
    await fs.rename(temporary, result.filePath);
    return true;
  });
  ipcMain.handle('project:build', async (event, text) => {
    trusted(event);
    const project = projectText(text);
    if (!app.isPackaged)
      throw new Error(
        'Native export runs from packaged Studio. In a source checkout use npm run package:game.',
      );
    const result = await dialog.showOpenDialog(window, {
      title: 'Choose an export folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled) return null;
    const output = await buildNativeGame({
      appRoot,
      executable: process.execPath,
      destination: result.filePaths[0],
      project,
      platform: process.platform,
    });
    await shell.openPath(output);
    return output;
  });
});
app.on('window-all-closed', () => {
  if (!isServer) app.quit();
});
app.on('before-quit', () => {
  testServer?.close();
  testServer = null;
});
