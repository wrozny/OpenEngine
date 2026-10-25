const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld(
  'desktop',
  Object.freeze({
    openProject: () => ipcRenderer.invoke('project:open'),
    saveProject: (text, name) => ipcRenderer.invoke('project:save', text, name),
    getBundledProject: () => ipcRenderer.invoke('project:bundled'),
    buildGame: (text) => ipcRenderer.invoke('project:build', text),
  }),
);
