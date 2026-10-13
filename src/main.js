const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  session,
  Menu,
  dialog,
  shell,
  protocol,
  nativeTheme,
  clipboard,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const store = require('./lib/store');
const { toUrl, searchUrl, ENGINES } = require('./lib/search');

const APP_NAME = 'PolyBrowser';
const HOME = 'poly://newtab/';
const PAGES_DIR = path.join(__dirname, 'pages');

const wins = [];

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'poly',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

const polySessions = new WeakSet();

function registerPolyProtocol(ses) {
  if (!ses || polySessions.has(ses)) return;
  polySessions.add(ses);
  ses.protocol.handle('poly', async (req) => {
    try {
      const url = new URL(req.url);
      const host = url.hostname;
      let rel = decodeURIComponent(url.pathname || '/');
      if (rel === '/' || rel === '') rel = '/index.html';
      const baseDir = host === 'shared' ? path.join(PAGES_DIR, 'shared') : path.join(PAGES_DIR, host);
      const filePath = path.normalize(path.join(baseDir, rel));
      if (!filePath.startsWith(baseDir)) return new Response('Forbidden', { status: 403 });
      const buf = await fs.promises.readFile(filePath);
      return new Response(buf, { headers: { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream' } });
    } catch (_) {
      return new Response('Not found', { status: 404 });
    }
  });
}

function homeUrl() {
  const s = store.getSettings();
  return s.homepage ? toUrl(s.homepage, s.searchEngine) || HOME : HOME;
}

function refreshNav(tab) {
  const wc = tab.view.webContents;
  const nh = wc.navigationHistory;
  tab.canGoBack = nh ? nh.canGoBack() : wc.canGoBack();
  tab.canGoForward = nh ? nh.canGoForward() : wc.canGoForward();
}

function findWinByWC(wc) {
  for (const w of wins) {
    if (w.bw.webContents.id === wc.id) return w;
    if (w.tabByWC.has(wc.id)) return w;
  }
  return null;
}

function broadcastDownloads() {
  const list = store.getDownloads();
  for (const w of wins) {
    if (w.bw && !w.bw.isDestroyed()) w.bw.webContents.send('downloads-changed', list);
    for (const t of w.tabs.values()) {
      try {
        t.view.webContents.send('poly:downloadsChanged', list);
      } catch (_) {}
    }
  }
}

function broadcastBookmarks() {
  const list = store.getBookmarks();
  for (const w of wins) {
    if (w.bw && !w.bw.isDestroyed()) w.bw.webContents.send('bookmarks-changed', list);
    for (const t of w.tabs.values()) {
      try {
        t.view.webContents.send('poly:bookmarksChanged', list);
      } catch (_) {}
    }
  }
}

function applyTheme() {
  nativeTheme.themeSource = store.getSettings().theme || 'system';
}

class Win {
  constructor(incognito = false) {
    this.incognito = incognito;
    this.tabs = new Map();
    this.tabByWC = new Map();
    this.order = [];
    this.activeId = null;
    this.nextId = 1;
    this.chromeHeight = 104;
    this.closedTabs = [];
    this.initialized = false;
    this.partition = incognito ? 'incog-' + Date.now() + '-' + Math.floor(Math.random() * 1e6) : 'persist:polybrowser';
    this.session = session.fromPartition(this.partition);
    registerPolyProtocol(this.session);

    this.bw = new BrowserWindow({
      width: 1240,
      height: 820,
      minWidth: 560,
      minHeight: 420,
      title: APP_NAME,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#202124' : '#f3f3f3',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.bw.loadFile(path.join(__dirname, 'ui', 'index.html'));
    this.bw.on('resize', () => this.layout());
    this.bw.on('maximize', () => this.layout());
    this.bw.on('unmaximize', () => this.layout());
    this.bw.on('enter-full-screen', () => this.layout());
    this.bw.on('leave-full-screen', () => this.layout());
    this.bw.on('closed', () => this.destroy());

    wireDownloadEvents(this.session);
    wins.push(this);
  }

  destroy() {
    const i = wins.indexOf(this);
    if (i >= 0) wins.splice(i, 1);
    for (const t of this.tabs.values()) {
      try {
        t.view.webContents.close();
      } catch (_) {}
    }
    this.tabs.clear();
    this.tabByWC.clear();
    saveSession();
    if (wins.length === 0 && process.platform !== 'darwin') app.quit();
  }

  serialize() {
    const activeTab = this.tabs.get(this.activeId);
    return {
      activeId: this.activeId,
      incognito: this.incognito,
      bookmarked: activeTab ? store.isBookmarked(activeTab.url) : false,
      tabs: this.order
        .map((id) => this.tabs.get(id))
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

  broadcast() {
    if (this.bw && !this.bw.isDestroyed()) this.bw.webContents.send('state', this.serialize());
  }

  sendSettings() {
    if (this.bw && !this.bw.isDestroyed()) this.bw.webContents.send('settings', store.getSettings());
  }

  sendBookmarks() {
    if (this.bw && !this.bw.isDestroyed()) this.bw.webContents.send('bookmarks-changed', store.getBookmarks());
  }

  sendDownloads() {
    if (this.bw && !this.bw.isDestroyed()) this.bw.webContents.send('downloads-changed', store.getDownloads());
  }

  ready() {
    if (this.initialized) return;
    this.initialized = true;
    let urls = null;
    if (!this.incognito && store.getSettings().restoreSession) {
      const s = store.getSession();
      if (s.urls && s.urls.length) urls = s.urls;
    }
    if (urls && urls.length) {
      urls.forEach((u, i) => this.createTab(u, i === 0));
    } else {
      this.createTab(homeUrl(), true);
    }
    this.sendSettings();
    this.sendBookmarks();
    this.sendDownloads();
  }

  createTab(url = HOME, activate = true, index = null) {
    const id = this.nextId++;
    const startUrl = url && url !== HOME ? toUrl(url, store.getSettings().searchEngine) || HOME : HOME;
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'tab-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: this.partition,
      },
    });
    const wc = view.webContents;
    const tab = {
      id,
      view,
      title: 'Новая вкладка',
      url: startUrl,
      favicon: null,
      loading: false,
      canGoBack: false,
      canGoForward: false,
    };
    this.tabs.set(id, tab);
    this.tabByWC.set(wc.id, tab);
    if (index === null || index >= this.order.length) this.order.push(id);
    else this.order.splice(index, 0, id);
    this.wireTab(tab);
    wc.loadURL(startUrl).catch(() => {});
    if (activate) this.setActive(id);
    this.broadcast();
    saveSession();
    return id;
  }

  wireTab(tab) {
    const wc = tab.view.webContents;
    const sync = () => this.broadcast();

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
      if (!this.incognito) store.addHistory({ url: u, title: tab.title });
      this.broadcast();
      saveSession();
    });
    wc.on('did-navigate-in-page', (_e, u, isMain) => {
      if (!isMain) return;
      tab.url = u;
      refreshNav(tab);
      sync();
    });
    wc.on('found-in-page', (_e, result) => {
      if (this.activeId !== tab.id) return;
      this.bw.webContents.send('find-result', {
        matches: result.matches || 0,
        active: result.activeMatchOrdinal || 0,
      });
    });

    wc.setWindowOpenHandler(({ url: target, disposition }) => {
      this.createTab(target, disposition !== 'background-tab');
      return { action: 'deny' };
    });

    wc.on('context-menu', (_e, params) => this.showContextMenu(tab, params));
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      if (this.handleShortcut(tab, input)) event.preventDefault();
    });
  }

  setActive(id) {
    if (!this.tabs.has(id)) return;
    if (this.activeId === id) return;
    if (this.activeId && this.tabs.has(this.activeId)) {
      this.bw.contentView.removeChildView(this.tabs.get(this.activeId).view);
    }
    this.activeId = id;
    this.bw.contentView.addChildView(this.tabs.get(id).view);
    this.layout();
    this.tabs.get(id).view.webContents.focus();
    this.broadcast();
  }

  closeTab(id, pushToClosed = true) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const idx = this.order.indexOf(id);
    const wasActive = this.activeId === id;
    if (wasActive) this.bw.contentView.removeChildView(tab.view);
    if (pushToClosed && tab.url && !/^poly:\/\/newtab/i.test(tab.url)) {
      this.closedTabs.push({ url: tab.url, index: idx });
      if (this.closedTabs.length > 20) this.closedTabs.shift();
    }
    try {
      tab.view.webContents.close();
    } catch (_) {}
    this.tabByWC.delete(tab.view.webContents.id);
    this.tabs.delete(id);
    if (idx >= 0) this.order.splice(idx, 1);

    if (wasActive) {
      this.activeId = null;
      const next = this.order[idx] || this.order[idx - 1] || null;
      if (next) this.setActive(next);
    }
    if (this.order.length === 0) this.createTab(homeUrl(), true);
    else this.broadcast();
    saveSession();
  }

  reopenClosedTab() {
    const last = this.closedTabs.pop();
    if (!last) return;
    this.createTab(last.url, true, last.index);
  }

  navigateActive(input) {
    const tab = this.tabs.get(this.activeId);
    if (!tab) return;
    const s = store.getSettings();
    const url = toUrl(input, s.searchEngine);
    if (url) tab.view.webContents.loadURL(url).catch(() => {});
  }

  navAction(action) {
    const tab = this.tabs.get(this.activeId);
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
      case 'hardReload':
        wc.reloadIgnoringCache();
        break;
      case 'stop':
        wc.stop();
        break;
      case 'home':
        wc.loadURL(homeUrl()).catch(() => {});
        break;
      case 'zoomIn':
        wc.setZoomLevel(Math.min(8, wc.getZoomLevel() + 0.5));
        break;
      case 'zoomOut':
        wc.setZoomLevel(Math.max(-8, wc.getZoomLevel() - 0.5));
        break;
      case 'zoomReset':
        wc.setZoomLevel(0);
        break;
      case 'print':
        wc.print();
        break;
      case 'devtools':
        if (wc.isDevToolsOpened()) wc.closeDevTools();
        else wc.openDevTools({ mode: 'detach' });
        break;
      case 'viewSource':
        this.createTab('view-source:' + wc.getURL(), true);
        break;
    }
  }

  openInternal(page) {
    const url = 'poly://' + page + '/';
    const existing = [...this.tabs.values()].find((t) => t.url === url);
    if (existing) this.setActive(existing.id);
    else this.createTab(url, true);
  }

  cycleTab(delta) {
    if (this.order.length < 2) return;
    const idx = this.order.indexOf(this.activeId) + delta;
    const next = this.order[(idx + this.order.length) % this.order.length];
    this.setActive(next);
  }

  activateIndex(n) {
    if (n === -1) this.setActive(this.order[this.order.length - 1]);
    else if (this.order[n]) this.setActive(this.order[n]);
  }

  toggleBookmarkActive() {
    const tab = this.tabs.get(this.activeId);
    if (!tab) return;
    if (/^poly:\/\//i.test(tab.url)) return;
    store.toggleBookmark({ url: tab.url, title: tab.title });
    broadcastBookmarks();
    this.broadcast();
  }

  find(text, options) {
    const tab = this.tabs.get(this.activeId);
    if (!tab) return;
    if (!text) {
      tab.view.webContents.stopFindInPage('clearSelection');
      return;
    }
    tab.view.webContents.findInPage(text, options || {});
  }

  findStop() {
    const tab = this.tabs.get(this.activeId);
    if (tab) tab.view.webContents.stopFindInPage('clearSelection');
  }

  layout() {
    if (!this.bw || this.bw.isDestroyed() || !this.activeId) return;
    const tab = this.tabs.get(this.activeId);
    if (!tab) return;
    const { width, height } = this.bw.getContentBounds();
    tab.view.setBounds({
      x: 0,
      y: this.chromeHeight,
      width,
      height: Math.max(0, height - this.chromeHeight),
    });
  }

  handleShortcut(tab, input) {
    const key = (input.key || '').toLowerCase();
    const mod = input.control || input.meta;
    const shift = input.shift;
    if (!mod) {
      if (input.key === 'F5') {
        this.navAction('reload');
        return true;
      }
      if (input.key === 'F11') {
        this.bw.setFullScreen(!this.bw.isFullScreen());
        return true;
      }
      if (input.key === 'Escape' && tab === this.tabs.get(this.activeId)) {
        this.findStop();
        this.bw.webContents.send('find-close');
      }
      return false;
    }
    switch (key) {
      case 't':
        if (shift) this.reopenClosedTab();
        else this.createTab(homeUrl(), true);
        return true;
      case 'w':
        if (shift) this.bw.close();
        else this.closeTab(this.activeId);
        return true;
      case 'n':
        new Win(shift);
        return true;
      case 'l':
        this.bw.webContents.send('focus-url');
        return true;
      case 'r':
        this.navAction(input.shift ? 'hardReload' : 'reload');
        return true;
      case 'f':
        this.bw.webContents.send('find-open');
        return true;
      case 'd':
        this.toggleBookmarkActive();
        return true;
      case 'h':
        this.openInternal('history');
        return true;
      case 'j':
        this.openInternal('downloads');
        return true;
      case 'b':
        if (shift) this.bw.webContents.send('toggle-bookmarks-bar');
        return true;
      case 'a':
        if (shift) this.bw.webContents.send('tab-search-open');
        return true;
      case 'p':
        this.navAction('print');
        return true;
      case 'tab':
        this.cycleTab(shift ? -1 : 1);
        return true;
      case '+':
      case '=':
        this.navAction('zoomIn');
        return true;
      case '-':
        this.navAction('zoomOut');
        return true;
      case '0':
        this.navAction('zoomReset');
        return true;
      default:
        if (/^[1-9]$/.test(key)) {
          const n = key === '9' ? -1 : parseInt(key, 10) - 1;
          this.activateIndex(n);
          return true;
        }
    }
    return false;
  }

  showContextMenu(tab, p) {
    const wc = tab.view.webContents;
    const items = [];
    if (p.linkURL) {
      items.push({ label: 'Открыть ссылку в новой вкладке', click: () => this.createTab(p.linkURL, true) });
      items.push({
        label: 'Открыть ссылку в окне InPrivate',
        click: () => {
          const w = new Win(true);
          w.bw.webContents.once('did-finish-load', () => w.createTab(p.linkURL, true));
        },
      });
      items.push({ label: 'Копировать ссылку', click: () => clipboard.writeText(p.linkURL) });
      items.push({ type: 'separator' });
    }
    if (p.mediaType === 'image' || p.hasImageContents) {
      items.push({ label: 'Открыть изображение в новой вкладке', click: () => this.createTab(p.srcURL, true) });
      items.push({ label: 'Копировать изображение', click: () => wc.copyImageAt(p.x, p.y) });
      items.push({ label: 'Сохранить изображение как…', click: () => wc.downloadURL(p.srcURL) });
      items.push({ type: 'separator' });
    }
    if (p.isEditable) {
      items.push({ role: 'cut', label: 'Вырезать' });
      items.push({ role: 'copy', label: 'Копировать' });
      items.push({ role: 'paste', label: 'Вставить' });
      items.push({ role: 'selectAll', label: 'Выделить всё' });
      items.push({ type: 'separator' });
    } else if (p.selectionText) {
      items.push({ role: 'copy', label: 'Копировать' });
      const q = p.selectionText.trim();
      items.push({
        label: 'Искать «' + (q.length > 24 ? q.slice(0, 24) + '…' : q) + '»',
        click: () => this.createTab(searchUrl(store.getSettings().searchEngine, q), true),
      });
      items.push({ type: 'separator' });
    }
    items.push({ label: 'Назад', enabled: tab.canGoBack, click: () => (wc.navigationHistory.canGoBack() ? wc.navigationHistory.goBack() : null) });
    items.push({ label: 'Вперёд', enabled: tab.canGoForward, click: () => (wc.navigationHistory.canGoForward() ? wc.navigationHistory.goForward() : null) });
    items.push({ label: 'Обновить', click: () => wc.reload() });
    items.push({ type: 'separator' });
    items.push({ label: 'Копировать адрес страницы', click: () => clipboard.writeText(wc.getURL()) });
    items.push({ label: 'Просмотреть исходный код', click: () => this.createTab('view-source:' + wc.getURL(), true) });
    items.push({ type: 'separator' });
    items.push({
      label: 'Проверить элемент',
      click: () => {
        wc.inspectElement(p.x, p.y);
        if (!wc.isDevToolsOpened()) wc.openDevTools({ mode: 'detach' });
      },
    });
    Menu.buildFromTemplate(items).popup({ window: this.bw, x: p.x, y: p.y + this.chromeHeight });
  }

  showAppMenu(x, y) {
    const template = [
      { label: 'Новая вкладка', accelerator: 'Ctrl+T', click: () => this.createTab(homeUrl(), true) },
      { label: 'Новое окно', accelerator: 'Ctrl+N', click: () => new Win(false) },
      { label: 'Новое окно InPrivate', accelerator: 'Ctrl+Shift+N', click: () => new Win(true) },
      { type: 'separator' },
      { label: 'Избранное', click: () => this.openInternal('bookmarks') },
      { label: 'История', accelerator: 'Ctrl+H', click: () => this.openInternal('history') },
      { label: 'Загрузки', accelerator: 'Ctrl+J', click: () => this.openInternal('downloads') },
      { type: 'separator' },
      { label: 'Найти на странице', accelerator: 'Ctrl+F', click: () => this.bw.webContents.send('find-open') },
      { label: 'Печать', accelerator: 'Ctrl+P', click: () => this.navAction('print') },
      {
        label: 'Масштаб',
        submenu: [
          { label: 'Увеличить', accelerator: 'Ctrl+Plus', click: () => this.navAction('zoomIn') },
          { label: 'Уменьшить', accelerator: 'Ctrl+-', click: () => this.navAction('zoomOut') },
          { label: 'Сбросить', accelerator: 'Ctrl+0', click: () => this.navAction('zoomReset') },
        ],
      },
      { type: 'separator' },
      { label: 'Настройки', click: () => this.openInternal('settings') },
      {
        label: 'О ' + APP_NAME,
        click: () => {
          const engines = Object.values(ENGINES).map((e) => e.name).join(', ');
          dialog.showMessageBox(this.bw, {
            type: 'info',
            title: 'О ' + APP_NAME,
            message: APP_NAME + ' ' + app.getVersion(),
            detail: 'Браузер на базе Electron (Chromium).\nДвижки поиска: ' + engines,
            buttons: ['ОК'],
          });
        },
      },
      { type: 'separator' },
      { label: 'Выход', click: () => app.quit() },
    ];
    Menu.buildFromTemplate(template).popup({ window: this.bw, x, y });
  }
}

function saveSession() {
  const urls = [];
  for (const w of wins) {
    if (w.incognito) continue;
    for (const id of w.order) {
      const t = w.tabs.get(id);
      if (t && t.url && !/^poly:\/\/newtab/i.test(t.url)) urls.push(t.url);
    }
  }
  if (urls.length) store.setSession(urls);
}

const wiredSessions = new Set();
function wireDownloadEvents(sess) {
  if (wiredSessions.has(sess)) return;
  wiredSessions.add(sess);
  sess.on('will-download', (_e, item) => {
    const id = store.nextId();
    store.addDownload({
      id,
      filename: item.getFilename(),
      url: item.getURL(),
      path: '',
      state: 'progressing',
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      startTime: Date.now(),
    });
    broadcastDownloads();
    item.on('updated', () => {
      store.updateDownload(id, {
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        state: item.isPaused() ? 'paused' : 'progressing',
      });
      broadcastDownloads();
    });
    item.on('done', (_e2, state) => {
      store.updateDownload(id, {
        state,
        path: item.getSavePath(),
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
      });
      broadcastDownloads();
    });
  });
}

function isInternal(event) {
  const f = event.senderFrame;
  return !!(f && typeof f.url === 'string' && f.url.startsWith('poly://'));
}

function senderWin(event) {
  return findWinByWC(event.sender);
}

function registerIpc() {
  const handle = (channel, fn) => ipcMain.handle(channel, fn);

  handle('browser:ready', (event) => {
    const w = senderWin(event);
    if (!w) return null;
    w.ready();
    w.broadcast();
    w.sendSettings();
    w.sendBookmarks();
    w.sendDownloads();
    return w.serialize();
  });
  handle('tabs:create', (event, url) => senderWin(event)?.createTab(url || homeUrl(), true));
  handle('tabs:close', (event, id) => senderWin(event)?.closeTab(id));
  handle('tabs:activate', (event, id) => senderWin(event)?.setActive(id));
  handle('tabs:reopen', (event) => senderWin(event)?.reopenClosedTab());
  handle('nav:action', (event, action) => senderWin(event)?.navAction(action));
  handle('nav:go', (event, input) => senderWin(event)?.navigateActive(input));
  handle('page:find', (event, text, options) => senderWin(event)?.find(text, options));
  handle('page:findStop', (event) => senderWin(event)?.findStop());
  handle('bookmark:toggle', (event) => senderWin(event)?.toggleBookmarkActive());
  handle('menu:open', (event, x, y) => senderWin(event)?.showAppMenu(x, y));
  handle('window:new', (event, incognito) => {
    new Win(!!incognito);
  });
  handle('settings:get', () => store.getSettings());
  handle('settings:set', (event, patch) => {
    const s = store.setSettings(patch);
    applyTheme();
    for (const w of wins) {
      w.sendSettings();
      for (const t of w.tabs.values()) {
        try {
          t.view.webContents.send('poly:settingsChanged', s);
        } catch (_) {}
      }
    }
    return s;
  });
  handle('bookmarks:get', () => store.getBookmarks());
  handle('bookmarks:remove', (event, id) => {
    store.removeBookmark(id);
    broadcastBookmarks();
    for (const w of wins) w.broadcast();
  });

  handle('poly:getSettings', (event) => (isInternal(event) ? store.getSettings() : null));
  handle('poly:setSettings', (event, patch) => {
    if (!isInternal(event)) return null;
    const s = store.setSettings(patch);
    applyTheme();
    for (const w of wins) {
      w.sendSettings();
      for (const t of w.tabs.values()) {
        try {
          t.view.webContents.send('poly:settingsChanged', s);
        } catch (_) {}
      }
    }
    return s;
  });
  handle('poly:getBookmarks', (event) => (isInternal(event) ? store.getBookmarks() : []));
  handle('poly:addBookmark', (event, b) => {
    if (!isInternal(event)) return null;
    const r = store.addBookmark(b || {});
    broadcastBookmarks();
    return r;
  });
  handle('poly:removeBookmark', (event, id) => {
    if (!isInternal(event)) return;
    store.removeBookmark(id);
    broadcastBookmarks();
  });
  handle('poly:getHistory', (event) => (isInternal(event) ? store.getHistory() : []));
  handle('poly:removeHistory', (event, id) => {
    if (!isInternal(event)) return;
    store.removeHistory(id);
  });
  handle('poly:clearHistory', (event) => {
    if (!isInternal(event)) return;
    store.clearHistory();
  });
  handle('poly:getTopSites', (event) => (isInternal(event) ? store.topSites(8) : []));
  handle('poly:getDownloads', (event) => (isInternal(event) ? store.getDownloads() : []));
  handle('poly:openDownload', (event, id) => {
    if (!isInternal(event)) return;
    const d = store.getDownloads().find((x) => x.id === id);
    if (d && d.path) shell.openPath(d.path);
  });
  handle('poly:revealDownload', (event, id) => {
    if (!isInternal(event)) return;
    const d = store.getDownloads().find((x) => x.id === id);
    if (d && d.path) shell.showItemInFolder(d.path);
  });
  handle('poly:removeDownload', (event, id) => {
    if (!isInternal(event)) return;
    store.removeDownload(id);
    broadcastDownloads();
  });
  handle('poly:clearDownloads', (event) => {
    if (!isInternal(event)) return;
    store.clearDownloads();
    broadcastDownloads();
  });
  handle('poly:navigate', (event, input) => {
    if (!isInternal(event)) return;
    const url = toUrl(input, store.getSettings().searchEngine);
    if (url) event.sender.loadURL(url).catch(() => {});
  });
  handle('poly:openUrl', (event, url, where) => {
    if (!isInternal(event)) return;
    const target = toUrl(url, store.getSettings().searchEngine);
    if (!target) return;
    if (where === 'tab') {
      const w = senderWin(event);
      if (w) w.createTab(target, true);
      else event.sender.loadURL(target).catch(() => {});
    } else {
      event.sender.loadURL(target).catch(() => {});
    }
  });
  handle('poly:newTab', (event) => {
    const w = senderWin(event);
    if (w) w.createTab(homeUrl(), true);
  });

  ipcMain.on('ui:chrome-height', (event, h) => {
    const w = senderWin(event);
    if (w && typeof h === 'number' && h > 0 && h !== w.chromeHeight) {
      w.chromeHeight = h;
      w.layout();
    }
  });
}

app.whenReady().then(() => {
  store.init(app.getPath('userData'));
  applyTheme();
  registerPolyProtocol(session.defaultSession);
  registerIpc();
  const first = new Win(false);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) new Win(false);
    else if (first.bw) first.bw.focus();
  });
});

app.on('before-quit', () => {
  saveSession();
  store.saveNow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.setName(APP_NAME);
