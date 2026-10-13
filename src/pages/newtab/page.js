const form = document.getElementById('search');
const q = document.getElementById('q');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = q.value.trim();
  if (v) window.poly.navigate(v);
});

const DEFAULTS = [
  { title: 'Google', url: 'https://www.google.com/' },
  { title: 'YouTube', url: 'https://www.youtube.com/' },
  { title: 'Википедия', url: 'https://ru.wikipedia.org/' },
  { title: 'GitHub', url: 'https://github.com/' },
];

function render(list) {
  const el = document.getElementById('sites');
  el.textContent = '';
  list.forEach((s) => {
    const a = document.createElement('div');
    a.className = 'site';
    a.title = s.url;

    const key = s.host || s.title || s.url;
    const ic = document.createElement('div');
    ic.className = 'site-ico';
    ic.style.background = letterColor(key);
    ic.textContent = firstLetter(s.title || s.host || s.url);

    const t = document.createElement('div');
    t.className = 'site-title';
    t.textContent = s.title || s.host || s.url;

    a.append(ic, t);
    a.addEventListener('click', () => window.poly.openUrl(s.url, 'self'));
    a.addEventListener('auxclick', (e) => {
      if (e.button === 1) window.poly.openUrl(s.url, 'tab');
    });
    el.appendChild(a);
  });
}

window.poly.getTopSites().then((list) => render(list && list.length ? list : DEFAULTS));
