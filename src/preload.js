const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('browser', {
  ready: () => ipcRenderer.invoke('ui:ready'),
  createTab: (url) => ipcRenderer.invoke('tabs:create', url),
  closeTab: (id) => ipcRenderer.invoke('tabs:close', id),
  activateTab: (id) => ipcRenderer.invoke('tabs:activate', id),
  go: (id, url) => ipcRenderer.invoke('nav:go', id, url),
  nav: (id, action) => ipcRenderer.invoke('nav:action', id, action),
  setChromeHeight: (h) => ipcRenderer.send('chrome-height', h),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onFocusUrl: (cb) => ipcRenderer.on('focus-url', () => cb()),
});
