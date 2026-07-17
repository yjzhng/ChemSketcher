// Preload for the first-run setup window. contextIsolation stays on, so the
// page gets a tiny explicit surface instead of node access.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('setup', {
  onProgress: (cb) => ipcRenderer.on('setup:progress', (_e, data) => cb(data)),
  onError: (cb) => ipcRenderer.on('setup:error', (_e, data) => cb(data)),
  retry: () => ipcRenderer.send('setup:retry'),
  quit: () => ipcRenderer.send('setup:quit'),
});
