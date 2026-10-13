const listEl = document.getElementById('list');
const clearBtn = document.getElementById('clear');

function stateLabel(state) {
  switch (state) {
    case 'progressing':
      return 'Загрузка…';
    case 'paused':
      return 'Пауза';
    case 'completed':
      return 'Завершено';
    case 'cancelled':
      return 'Отменено';
    case 'interrupted':
      return 'Прервано';
    default:
      return state || '';
  }
}

function render(list) {
  listEl.textContent = '';
  if (!list || !list.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = 'Нет загрузок';
    listEl.appendChild(e);
    return;
  }
  for (const d of list) {
    const row = document.createElement('div');
    row.className = 'row';

    const ico = document.createElement('div');
    ico.className = 'ico';
    ico.style.background = letterColor(d.filename || 'file');
    ico.textContent = firstLetter(d.filename || 'F');

    const main = document.createElement('div');
    main.className = 'main';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = d.filename || d.url;
    const sub = document.createElement('div');
    sub.className = 'sub';
    const parts = [stateLabel(d.state), hostOf(d.url)];
    if (d.totalBytes) parts.push(fmtSize(d.receivedBytes || 0) + ' / ' + fmtSize(d.totalBytes));
    sub.textContent = parts.filter(Boolean).join(' · ');
    main.append(title, sub);

    if (d.state === 'progressing' || d.state === 'paused') {
      const prog = document.createElement('div');
      prog.className = 'progress';
      const bar = document.createElement('i');
      const pct = d.totalBytes ? Math.min(100, Math.round((d.receivedBytes / d.totalBytes) * 100)) : 0;
      bar.style.width = pct + '%';
      prog.appendChild(bar);
      main.appendChild(prog);
    }

    const actions = document.createElement('div');
    actions.className = 'actions';

    if (d.state === 'completed' && d.path) {
      const open = document.createElement('button');
      open.className = 'icon-btn';
      open.title = 'Открыть';
      open.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5H5V6h5"/></svg>';
      open.addEventListener('click', () => window.poly.openDownload(d.id));
      actions.appendChild(open);

      const reveal = document.createElement('button');
      reveal.className = 'icon-btn';
      reveal.title = 'Показать в папке';
      reveal.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 7h6l2 2h10v9H3z"/></svg>';
      reveal.addEventListener('click', () => window.poly.revealDownload(d.id));
      actions.appendChild(reveal);
    }

    const del = document.createElement('button');
    del.className = 'icon-btn';
    del.title = 'Убрать из списка';
    del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    del.addEventListener('click', async () => {
      await window.poly.removeDownload(d.id);
    });
    actions.appendChild(del);

    row.append(ico, main, actions);
    listEl.appendChild(row);
  }
}

clearBtn.addEventListener('click', async () => {
  if (confirm('Очистить список загрузок?')) await window.poly.clearDownloads();
});

window.poly.onDownloads(render);
window.poly.getDownloads().then(render);
