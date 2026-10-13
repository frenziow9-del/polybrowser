const ENGINES = {
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  yandex: { name: 'Яндекс', url: 'https://yandex.ru/search/?text=%s' },
};

function searchUrl(engine, query) {
  const e = ENGINES[engine] || ENGINES.duckduckgo;
  return e.url.replace('%s', encodeURIComponent(query));
}

function toUrl(input, engine) {
  const s = String(input == null ? '' : input).trim();
  if (!s) return null;
  if (/^(poly|about|data|blob|file|chrome|https?|ftp):/i.test(s)) return s;
  if (/^localhost(:\d+)?([/?#].*)?$/i.test(s)) return 'http://' + s;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#].*)?$/.test(s)) return 'http://' + s;
  if (/^[^\s/]+\.[^\s/]{2,}([/?#].*)?$/.test(s)) return 'https://' + s;
  return searchUrl(engine, s);
}

function isSearchQuery(input) {
  const s = String(input == null ? '' : input).trim();
  if (!s) return false;
  if (/^(poly|about|data|blob|file|chrome|https?|ftp):/i.test(s)) return false;
  if (/^localhost(:\d+)?([/?#].*)?$/i.test(s)) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#].*)?$/.test(s)) return false;
  if (/^[^\s/]+\.[^\s/]{2,}([/?#].*)?$/.test(s)) return false;
  return true;
}

module.exports = { ENGINES, searchUrl, toUrl, isSearchQuery };
