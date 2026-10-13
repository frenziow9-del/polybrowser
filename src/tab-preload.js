const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('poly', {
  getSettings: () => ipcRenderer.invoke('poly:getSettings'),
  setSettings: (patch) => ipcRenderer.invoke('poly:setSettings', patch),
  getBookmarks: () => ipcRenderer.invoke('poly:getBookmarks'),
  addBookmark: (b) => ipcRenderer.invoke('poly:addBookmark', b),
  removeBookmark: (id) => ipcRenderer.invoke('poly:removeBookmark', id),
  getHistory: () => ipcRenderer.invoke('poly:getHistory'),
  removeHistory: (id) => ipcRenderer.invoke('poly:removeHistory', id),
  clearHistory: () => ipcRenderer.invoke('poly:clearHistory'),
  getTopSites: () => ipcRenderer.invoke('poly:getTopSites'),
  getDownloads: () => ipcRenderer.invoke('poly:getDownloads'),
  openDownload: (id) => ipcRenderer.invoke('poly:openDownload', id),
  revealDownload: (id) => ipcRenderer.invoke('poly:revealDownload', id),
  removeDownload: (id) => ipcRenderer.invoke('poly:removeDownload', id),
  clearDownloads: () => ipcRenderer.invoke('poly:clearDownloads'),
  navigate: (input) => ipcRenderer.invoke('poly:navigate', input),
  openUrl: (url, where) => ipcRenderer.invoke('poly:openUrl', url, where),
  newTab: () => ipcRenderer.invoke('poly:newTab'),
  onSettings: (cb) => ipcRenderer.on('poly:settingsChanged', (_e, s) => cb(s)),
  onBookmarks: (cb) => ipcRenderer.on('poly:bookmarksChanged', (_e, b) => cb(b)),
  onDownloads: (cb) => ipcRenderer.on('poly:downloadsChanged', (_e, d) => cb(d)),
});
