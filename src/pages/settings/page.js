const theme = document.getElementById('theme');
const engine = document.getElementById('engine');
const homepage = document.getElementById('homepage');
const bmBar = document.getElementById('bmBar');
const restore = document.getElementById('restore');
const clearHistory = document.getElementById('clearHistory');
const clearDownloads = document.getElementById('clearDownloads');

async function load() {
  const s = (await window.poly.getSettings()) || {};
  theme.value = s.theme || 'system';
  engine.value = s.searchEngine || 'duckduckgo';
  homepage.value = s.homepage || '';
  bmBar.checked = !!s.bookmarksBar;
  restore.checked = s.restoreSession !== false;
}

function save() {
  window.poly.setSettings({
    theme: theme.value,
    searchEngine: engine.value,
    homepage: homepage.value.trim(),
    bookmarksBar: bmBar.checked,
    restoreSession: restore.checked,
  });
}

[theme, engine, homepage, bmBar, restore].forEach((el) => el.addEventListener('change', save));

clearHistory.addEventListener('click', async () => {
  if (confirm('Очистить всю историю просмотров?')) {
    await window.poly.clearHistory();
    alert('История очищена');
  }
});

clearDownloads.addEventListener('click', async () => {
  if (confirm('Очистить список загрузок?')) {
    await window.poly.clearDownloads();
    alert('Список загрузок очищен');
  }
});

window.poly.onSettings(load);
load();
