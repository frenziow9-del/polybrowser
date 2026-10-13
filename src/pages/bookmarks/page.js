const listEl = document.getElementById('list');
const filter = document.getElementById('filter');

let all = [];

function render() {
  const q = filter.value.trim().toLowerCase();
  const items = all.filter(
    (b) => !q || (b.title || '').toLowerCase().includes(q) || (b.url || '').toLowerCase().includes(q)
  );
  listEl.textContent = '';
  if (!items.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = all.length ? 'Ничего не найдено' : 'Пока нет избранных страниц';
    listEl.appendChild(e);
    return;
  }
  for (const b of items) {
    const row = document.createElement('div');
    row.className = 'row';

    const ico = document.createElement('div');
    ico.className = 'ico';
    ico.style.background = letterColor(hostOf(b.url));
    ico.textContent = firstLetter(b.title || hostOf(b.url));

    const main = document.createElement('div');
    main.className = 'main';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = b.title || b.url;
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = b.url;
    main.append(title, sub);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const del = document.createElement('button');
    del.className = 'icon-btn';
    del.title = 'Удалить из избранного';
    del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.poly.removeBookmark(b.id);
      all = all.filter((x) => x.id !== b.id);
      render();
    });
    actions.appendChild(del);

    row.append(ico, main, actions);
    row.addEventListener('click', () => window.poly.openUrl(b.url, 'self'));
    row.addEventListener('auxclick', (e) => {
      if (e.button === 1) window.poly.openUrl(b.url, 'tab');
    });
    listEl.appendChild(row);
  }
}

filter.addEventListener('input', render);

function load() {
  window.poly.getBookmarks().then((list) => {
    all = list || [];
    render();
  });
}
window.poly.onBookmarks((list) => {
  all = list || [];
  render();
});
load();
