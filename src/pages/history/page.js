const listEl = document.getElementById('list');
const filter = document.getElementById('filter');
const clearBtn = document.getElementById('clear');

let all = [];

function dayKey(ts) {
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function render() {
  const q = filter.value.trim().toLowerCase();
  const items = all.filter(
    (h) => !q || (h.title || '').toLowerCase().includes(q) || (h.url || '').toLowerCase().includes(q)
  );
  listEl.textContent = '';
  if (!items.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = all.length ? 'Ничего не найдено' : 'История пуста';
    listEl.appendChild(e);
    return;
  }
  let group = '';
  for (const h of items) {
    const day = dayKey(h.time);
    if (day !== group) {
      group = day;
      const t = document.createElement('div');
      t.className = 'list-title';
      t.textContent = day;
      listEl.appendChild(t);
    }

    const row = document.createElement('div');
    row.className = 'row';

    const ico = document.createElement('div');
    ico.className = 'ico';
    ico.style.background = letterColor(hostOf(h.url));
    ico.textContent = firstLetter(h.title || hostOf(h.url));

    const main = document.createElement('div');
    main.className = 'main';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = h.title || h.url;
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = hostOf(h.url) + ' · ' + fmtTime(h.time);
    main.append(title, sub);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const del = document.createElement('button');
    del.className = 'icon-btn';
    del.title = 'Удалить из истории';
    del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.poly.removeHistory(h.id);
      all = all.filter((x) => x.id !== h.id);
      render();
    });
    actions.appendChild(del);

    row.append(ico, main, actions);
    row.addEventListener('click', () => window.poly.openUrl(h.url, 'self'));
    row.addEventListener('auxclick', (e) => {
      if (e.button === 1) window.poly.openUrl(h.url, 'tab');
    });
    listEl.appendChild(row);
  }
}

filter.addEventListener('input', render);
clearBtn.addEventListener('click', async () => {
  if (confirm('Очистить всю историю просмотров?')) {
    await window.poly.clearHistory();
    all = [];
    render();
  }
});

window.poly.getHistory().then((list) => {
  all = list || [];
  render();
});
