const api = window.browser;

const chromeEl = document.getElementById('chrome');
const tabsEl = document.getElementById('tabs');
const addr = document.getElementById('address');
const addrForm = document.getElementById('addr-form');
const btnBack = document.getElementById('back');
const btnForward = document.getElementById('forward');
const btnReload = document.getElementById('reload');
const btnHome = document.getElementById('home');
const btnStar = document.getElementById('star');
const btnMenu = document.getElementById('menu-btn');
const bookmarksBar = document.getElementById('bookmarks-bar');
const findBar = document.getElementById('find-bar');
const findInput = document.getElementById('find-input');
const findCount = document.getElementById('find-count');
const tabSearch = document.getElementById('tab-search');
const tabSearchInput = document.getElementById('tab-search-input');
const tabSearchList = document.getElementById('tab-search-list');

let state = { tabs: [], activeId: null, bookmarked: false, incognito: false };
let settings = { bookmarksBar: true };
let bookmarks = [];
let editing = false;
let findActive = false;
let tabSearchActive = false;
let tabSearchSel = 0;

const CLOSE_SVG = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function activeTab() {
  return state.tabs.find((t) => t.id === state.activeId) || null;
}

function prettyUrl(url) {
  return url || '';
}

function renderTabs() {
  tabsEl.textContent = '';
  for (const t of state.tabs) {
    const tab = document.createElement('div');
    tab.className = 'tab';
    if (t.id === state.activeId) tab.classList.add('active');
    if (t.loading) tab.classList.add('loading');
    tab.title = t.title || t.url || '';

    const ico = document.createElement('span');
    ico.className = 'tab-ico';
    if (t.favicon) {
      const img = document.createElement('img');
      img.src = t.favicon;
      img.addEventListener('error', () => img.remove());
      ico.appendChild(img);
    }

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = t.title || t.url || 'Новая вкладка';

    const close = document.createElement('button');
    close.className = 'tab-close';
    close.innerHTML = CLOSE_SVG;
    close.title = 'Закрыть вкладку';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      api.closeTab(t.id);
    });

    tab.append(ico, title, close);
    tab.addEventListener('click', () => api.activateTab(t.id));
    tab.addEventListener('auxclick', (e) => {
      if (e.button === 1) api.closeTab(t.id);
    });
    tabsEl.appendChild(tab);
  }
}

function renderNav() {
  const t = activeTab();
  btnBack.disabled = !(t && t.canGoBack);
  btnForward.disabled = !(t && t.canGoForward);
  btnReload.title = t && t.loading ? 'Остановить' : 'Обновить (Ctrl+R)';
  btnStar.classList.toggle('bookmarked', !!state.bookmarked);
  if (!editing) addr.value = t ? prettyUrl(t.url) : '';
}

function renderBookmarksBar() {
  bookmarksBar.hidden = !settings.bookmarksBar;
  bookmarksBar.textContent = '';
  if (!settings.bookmarksBar) return;
  if (!bookmarks.length) {
    const hint = document.createElement('span');
    hint.className = 'bm-item';
    hint.style.color = 'var(--muted)';
    hint.textContent = 'Добавляйте страницы в избранное звёздочкой';
    bookmarksBar.appendChild(hint);
    return;
  }
  for (const bm of bookmarks) {
    const el = document.createElement('div');
    el.className = 'bm-item';
    el.title = bm.url;
    const ico = document.createElement('span');
    ico.className = 'bm-ico';
    ico.textContent = (bm.title || bm.url || '?').trim().charAt(0).toUpperCase();
    const label = document.createElement('span');
    label.textContent = bm.title || bm.url;
    el.append(ico, label);
    el.addEventListener('click', () => api.go(bm.url));
    el.addEventListener('auxclick', (e) => {
      if (e.button === 1) api.createTab(bm.url);
    });
    bookmarksBar.appendChild(el);
  }
}

function render() {
  renderTabs();
  renderNav();
  if (tabSearchActive) renderTabSearch();
}

function reportChromeHeight() {
  api.setChromeHeight(chromeEl.offsetHeight);
}

function openFind() {
  findActive = true;
  findBar.hidden = false;
  findCount.textContent = '';
  findInput.focus();
  findInput.select();
  if (findInput.value) api.find(findInput.value, { forward: true });
}

function closeFind() {
  if (!findActive) return;
  findActive = false;
  findBar.hidden = true;
  findCount.textContent = '';
  api.findStop();
}

function openTabSearch() {
  tabSearchActive = true;
  tabSearch.hidden = false;
  tabSearchSel = 0;
  tabSearchInput.value = '';
  renderTabSearch();
  tabSearchInput.focus();
}

function closeTabSearch() {
  tabSearchActive = false;
  tabSearch.hidden = true;
}

function renderTabSearch() {
  const q = tabSearchInput.value.trim().toLowerCase();
  const list = state.tabs.filter(
    (t) => !q || (t.title || '').toLowerCase().includes(q) || (t.url || '').toLowerCase().includes(q)
  );
  if (tabSearchSel >= list.length) tabSearchSel = Math.max(0, list.length - 1);
  tabSearchList.textContent = '';
  list.forEach((t, i) => {
    const item = document.createElement('div');
    item.className = 'ts-item' + (i === tabSearchSel ? ' sel' : '');
    if (t.favicon) {
      const img = document.createElement('img');
      img.src = t.favicon;
      img.addEventListener('error', () => img.remove());
      item.appendChild(img);
    }
    const title = document.createElement('span');
    title.className = 'ts-title';
    title.textContent = t.title || 'Новая вкладка';
    const url = document.createElement('span');
    url.className = 'ts-url';
    url.textContent = t.url || '';
    item.append(title, url);
    item.addEventListener('click', () => {
      api.activateTab(t.id);
      closeTabSearch();
    });
    tabSearchList.appendChild(item);
  });
}

api.onState((s) => {
  state = s;
  render();
});

api.onSettings((s) => {
  settings = s;
  renderBookmarksBar();
});

api.onBookmarks((list) => {
  bookmarks = list || [];
  renderBookmarksBar();
});

api.onFocusUrl(() => {
  addr.focus();
  addr.select();
});

api.onFindOpen(() => openFind());
api.onFindClose(() => closeFind());
api.onFindResult((r) => {
  findCount.textContent = r.matches ? r.active + '/' + r.matches : (findInput.value ? '0/0' : '');
});

api.onTabSearch(() => openTabSearch());
api.onToggleBookmarksBar(() => {
  api.setSettings({ bookmarksBar: !settings.bookmarksBar });
});

document.getElementById('new-tab').addEventListener('click', () => api.createTab());
btnBack.addEventListener('click', () => api.navAction('back'));
btnForward.addEventListener('click', () => api.navAction('forward'));
btnHome.addEventListener('click', () => api.navAction('home'));
btnReload.addEventListener('click', () => {
  const t = activeTab();
  api.navAction(t && t.loading ? 'stop' : 'reload');
});
btnStar.addEventListener('click', () => api.toggleBookmark());
btnMenu.addEventListener('click', () => {
  const r = btnMenu.getBoundingClientRect();
  api.openMenu(Math.round(r.left), Math.round(r.bottom));
});

addrForm.addEventListener('submit', (e) => {
  e.preventDefault();
  editing = false;
  api.go(addr.value);
  addr.blur();
});

addr.addEventListener('focus', () => {
  editing = true;
  addr.select();
});
addr.addEventListener('blur', () => {
  editing = false;
  renderNav();
});

findInput.addEventListener('input', () => {
  findCount.textContent = '';
  api.find(findInput.value, { forward: true });
});
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    api.find(findInput.value, { forward: !e.shiftKey, findNext: true });
  } else if (e.key === 'Escape') {
    closeFind();
  }
});
document.getElementById('find-next').addEventListener('click', () =>
  api.find(findInput.value, { forward: true, findNext: true })
);
document.getElementById('find-prev').addEventListener('click', () =>
  api.find(findInput.value, { forward: false, findNext: true })
);
document.getElementById('find-close').addEventListener('click', () => closeFind());

tabSearchInput.addEventListener('input', () => {
  tabSearchSel = 0;
  renderTabSearch();
});
tabSearchInput.addEventListener('keydown', (e) => {
  const list = state.tabs.filter((t) => {
    const q = tabSearchInput.value.trim().toLowerCase();
    return !q || (t.title || '').toLowerCase().includes(q) || (t.url || '').toLowerCase().includes(q);
  });
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    tabSearchSel = Math.min(tabSearchSel + 1, list.length - 1);
    renderTabSearch();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    tabSearchSel = Math.max(tabSearchSel - 1, 0);
    renderTabSearch();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (list[tabSearchSel]) {
      api.activateTab(list[tabSearchSel].id);
      closeTabSearch();
    }
  } else if (e.key === 'Escape') {
    closeTabSearch();
  }
});

window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'l') {
    e.preventDefault();
    addr.focus();
    addr.select();
  } else if (e.key === 'Escape') {
    if (tabSearchActive) closeTabSearch();
    else if (findActive) closeFind();
  }
});

new ResizeObserver(reportChromeHeight).observe(chromeEl);
window.addEventListener('resize', reportChromeHeight);

api.getSettings().then((s) => {
  settings = s || settings;
  renderBookmarksBar();
});

api.ready().then((s) => {
  if (s) {
    state = s;
    render();
  }
  reportChromeHeight();
});
