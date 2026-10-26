const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld(
  'desktop',
  Object.freeze({
    startServer: (text) => ipcRenderer.invoke('network:start', text),
    stopServer: () => ipcRenderer.invoke('network:stop'),
    serverStatus: () => ipcRenderer.invoke('network:status'),
    getRecentProjects: () => ipcRenderer.invoke('project:recents'),
    forgetProject: (file) => ipcRenderer.invoke('project:forget', file),
    reopenProject: (file) => ipcRenderer.invoke('project:reopen', file),
    openProjectRecord: () => ipcRenderer.invoke('project:open-record'),
    saveProjectRecord: (text, name, currentPath) =>
      ipcRenderer.invoke('project:save-record', text, name, currentPath),
    openProject: () => ipcRenderer.invoke('project:open'),
    saveProject: (text, name) => ipcRenderer.invoke('project:save', text, name),
    getBundledProject: () => ipcRenderer.invoke('project:bundled'),
    buildGame: (text) => ipcRenderer.invoke('project:build', text),
  }),
);
