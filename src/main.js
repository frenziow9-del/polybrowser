const { app, BrowserWindow, WebContentsView, ipcMain, Menu } = require('electron');
const path = require('node:path');

const HOME_URL = 'https://duckduckgo.com/';
const SEARCH_URL = 'https://duckduckgo.com/?q=';

let mainWindow = null;
let chromeHeight = 82;

const tabs = new Map();
const order = [];
let activeId = null;
let nextId = 1;

app.setName('PolyBrowser');

function toUrl(input) {
  const s = String(input || '').trim();
  if (!s) return HOME_URL;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[a-z0-9]+$/i.test(s.split(':')[0])) return s;
  if (/^(about|data|chrome):/i.test(s)) return s;
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#].*)?$/i.test(s)) return 'http://' + s;
  if (/^[^\s]+\.[^\s]{2,}([/?#].*)?$/.test(s)) return 'https://' + s;
  return SEARCH_URL + encodeURIComponent(s);
}

function serializeState() {
  return {
    activeId,
    tabs: order
      .map((id) => tabs.get(id))
      .filter(Boolean)
      .map((t) => ({
        id: t.id,
        title: t.title,
        url: t.url,
        favicon: t.favicon,
        loading: t.loading,
        canGoBack: t.canGoBack,
        canGoForward: t.canGoForward,
      })),
  };
}

function sendState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state', serializeState());
  }
}

function refreshNav(tab) {
  const wc = tab.view.webContents;
  const nh = wc.navigationHistory;
  tab.canGoBack = nh ? nh.canGoBack() : wc.canGoBack();
  tab.canGoForward = nh ? nh.canGoForward() : wc.canGoForward();
}

function layout() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!activeId) return;
  const tab = tabs.get(activeId);
  if (!tab) return;
  const { width, height } = mainWindow.getContentBounds();
  tab.view.setBounds({
    x: 0,
    y: chromeHeight,
    width,
    height: Math.max(0, height - chromeHeight),
  });
}

function setActive(id) {
  if (!tabs.has(id)) return;
  if (activeId === id) return;
  if (activeId && tabs.has(activeId)) {
    mainWindow.contentView.removeChildView(tabs.get(activeId).view);
  }
  activeId = id;
  mainWindow.contentView.addChildView(tabs.get(id).view);
  layout();
  tabs.get(id).view.webContents.focus();
  sendState();
}

function handleShortcut(wc, id, input) {
  const key = (input.key || '').toLowerCase();
  const mod = input.control || input.meta;
  if (mod && key === 't') return 'new-tab';
  if (mod && key === 'w') return 'close-tab';
  if (mod && key === 'l') return 'focus-url';
  if (mod && key === 'r') return 'reload';
  if (mod && (input.key === '+' || input.key === '=')) return 'zoom-in';
  if (mod && input.key === '-') return 'zoom-out';
  if (mod && input.key === '0') return 'zoom-reset';
  if (input.key === 'F5') return 'reload';
  return null;
}

function createTab(url = HOME_URL, activate = true) {
  const id = nextId++;
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:polybrowser',
    },
  });
  const wc = view.webContents;
  const tab = {
    id,
    view,
    title: 'Новая вкладка',
    url: toUrl(url),
    favicon: null,
    loading: false,
    canGoBack: false,
    canGoForward: false,
  };
  tabs.set(id, tab);
  order.push(id);

  const sync = () => sendState();

  wc.on('page-title-updated', (_e, title) => {
    tab.title = title;
    sync();
  });
  wc.on('page-favicon-updated', (_e, favicons) => {
    tab.favicon = (favicons && favicons[0]) || null;
    sync();
  });
  wc.on('did-start-loading', () => {
    tab.loading = true;
    sync();
  });
  wc.on('did-stop-loading', () => {
    tab.loading = false;
    refreshNav(tab);
    sync();
  });
  wc.on('did-navigate', (_e, u) => {
    tab.url = u;
    refreshNav(tab);
    sync();
  });
  wc.on('did-navigate-in-page', (_e, u, isMainFrame) => {
    if (!isMainFrame) return;
    tab.url = u;
    refreshNav(tab);
    sync();
  });

  wc.setWindowOpenHandler(({ url: target }) => {
    createTab(target, true);
    return { action: 'deny' };
  });

  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const action = handleShortcut(wc, id, input);
    if (!action) return;
    event.preventDefault();
    switch (action) {
      case 'new-tab':
        createTab(HOME_URL, true);
        break;
      case 'close-tab':
        closeTab(id);
        break;
      case 'focus-url':
        if (mainWindow) mainWindow.webContents.send('focus-url');
        break;
      case 'reload':
        wc.reload();
        break;
      case 'zoom-in':
        wc.setZoomLevel(Math.min(8, wc.getZoomLevel() + 0.5));
        break;
      case 'zoom-out':
        wc.setZoomLevel(Math.max(-8, wc.getZoomLevel() - 0.5));
        break;
      case 'zoom-reset':
        wc.setZoomLevel(0);
        break;
    }
  });

  wc.loadURL(tab.url).catch(() => {});

  if (activate) setActive(id);
  sendState();
  return id;
}

function closeTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  const idx = order.indexOf(id);
  const wasActive = activeId === id;

  if (wasActive && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.contentView.removeChildView(tab.view);
  }
  try {
    tab.view.webContents.close();
  } catch (_) {}
  tabs.delete(id);
  if (idx >= 0) order.splice(idx, 1);

  if (wasActive) {
    activeId = null;
    const next = order[idx] || order[idx - 1] || null;
    if (next) setActive(next);
  }

  if (order.length === 0) {
    createTab(HOME_URL, true);
  } else {
    sendState();
  }
}

function navigate(id, input) {
  const tab = tabs.get(id);
  if (!tab) return;
  const url = toUrl(input);
  tab.view.webContents.loadURL(url).catch(() => {});
}

function navAction(id, action) {
  const tab = tabs.get(id);
  if (!tab) return;
  const wc = tab.view.webContents;
  const nh = wc.navigationHistory;
  switch (action) {
    case 'back':
      nh ? nh.goBack() : wc.goBack();
      break;
    case 'forward':
      nh ? nh.goForward() : wc.goForward();
      break;
    case 'reload':
      wc.reload();
      break;
    case 'stop':
      wc.stop();
      break;
    case 'home':
      wc.loadURL(HOME_URL).catch(() => {});
      break;
  }
}

function registerIpc() {
  ipcMain.handle('ui:ready', () => {
    if (order.length === 0) createTab(HOME_URL, true);
    else sendState();
    return serializeState();
  });
  ipcMain.handle('tabs:create', (_e, url) => createTab(url || HOME_URL, true));
  ipcMain.handle('tabs:close', (_e, id) => closeTab(id));
  ipcMain.handle('tabs:activate', (_e, id) => setActive(id));
  ipcMain.handle('nav:go', (_e, id, url) => navigate(id, url));
  ipcMain.handle('nav:action', (_e, id, action) => navAction(id, action));
  ipcMain.on('chrome-height', (_e, h) => {
    if (typeof h === 'number' && h > 0 && h !== chromeHeight) {
      chromeHeight = h;
      layout();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 480,
    minHeight: 360,
    title: 'PolyBrowser',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
  mainWindow.on('resize', layout);
  mainWindow.on('maximize', layout);
  mainWindow.on('unmaximize', layout);
  mainWindow.on('enter-full-screen', layout);
  mainWindow.on('leave-full-screen', layout);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
