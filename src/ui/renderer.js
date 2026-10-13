const api = window.browser;

const chromeEl = document.getElementById('chrome');
const tabsEl = document.getElementById('tabs');
const addr = document.getElementById('address');
const btnBack = document.getElementById('back');
const btnForward = document.getElementById('forward');
const btnReload = document.getElementById('reload');
const btnHome = document.getElementById('home');

let state = { tabs: [], activeId: null };
let editing = false;

function activeTab() {
  return state.tabs.find((t) => t.id === state.activeId) || null;
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
    close.textContent = '\u00d7';
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
  btnReload.textContent = t && t.loading ? '\u00d7' : '\u21bb';
  btnReload.title = t && t.loading ? 'Остановить' : 'Обновить (Ctrl+R)';
  if (!editing) addr.value = t ? t.url : '';
}

function render() {
  renderTabs();
  renderNav();
}

api.onState((s) => {
  state = s;
  render();
});

api.onFocusUrl(() => {
  addr.focus();
  addr.select();
});

document.getElementById('new-tab').addEventListener('click', () => api.createTab());
btnBack.addEventListener('click', () => api.nav(state.activeId, 'back'));
btnForward.addEventListener('click', () => api.nav(state.activeId, 'forward'));
btnHome.addEventListener('click', () => api.nav(state.activeId, 'home'));
btnReload.addEventListener('click', () => {
  const t = activeTab();
  api.nav(state.activeId, t && t.loading ? 'stop' : 'reload');
});

document.getElementById('addr-form').addEventListener('submit', (e) => {
  e.preventDefault();
  editing = false;
  api.go(state.activeId, addr.value);
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

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
    e.preventDefault();
    addr.focus();
    addr.select();
  }
});

function reportChromeHeight() {
  api.setChromeHeight(chromeEl.offsetHeight);
}

new ResizeObserver(reportChromeHeight).observe(chromeEl);
window.addEventListener('resize', reportChromeHeight);

api.ready().then((s) => {
  state = s;
  render();
  reportChromeHeight();
});
