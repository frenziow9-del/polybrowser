const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  theme: 'system',
  searchEngine: 'duckduckgo',
  homepage: '',
  restoreSession: true,
  bookmarksBar: true,
};

const MAX_HISTORY = 5000;
const MAX_DOWNLOADS = 500;

let file = null;
let data = { settings: { ...DEFAULTS }, bookmarks: [], history: [], downloads: [], session: { urls: [] } };
let uid = 0;
let saveTimer = null;

function nextId() {
  return Date.now().toString(36) + '-' + (uid++).toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

function init(dir) {
  file = path.join(dir, 'polybrowser-data.json');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.settings = Object.assign({}, DEFAULTS, raw.settings || {});
    data.bookmarks = Array.isArray(raw.bookmarks) ? raw.bookmarks : [];
    data.history = Array.isArray(raw.history) ? raw.history : [];
    data.downloads = Array.isArray(raw.downloads) ? raw.downloads : [];
    data.session = raw.session && Array.isArray(raw.session.urls) ? raw.session : { urls: [] };
  } catch (_) {
    saveNow();
  }
}

function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveNow();
  }, 250);
}

function saveNow() {
  if (!file) return;
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (_) {}
}

function getSettings() {
  return { ...data.settings };
}

function setSettings(patch) {
  data.settings = Object.assign({}, data.settings, patch || {});
  save();
  return getSettings();
}

function getBookmarks() {
  return data.bookmarks.map((b) => ({ ...b }));
}

function addBookmark({ url, title }) {
  if (!url || /^poly:\/\//i.test(url)) return null;
  const existing = data.bookmarks.find((b) => b.url === url);
  if (existing) {
    if (title) existing.title = title;
    save();
    return existing;
  }
  const bm = { id: nextId(), url, title: title || url, time: Date.now() };
  data.bookmarks.unshift(bm);
  save();
  return bm;
}

function removeBookmark(id) {
  data.bookmarks = data.bookmarks.filter((b) => b.id !== id);
  save();
}

function isBookmarked(url) {
  return !!url && data.bookmarks.some((b) => b.url === url);
}

function toggleBookmark({ url, title }) {
  if (isBookmarked(url)) {
    const b = data.bookmarks.find((x) => x.url === url);
    removeBookmark(b.id);
    return false;
  }
  addBookmark({ url, title });
  return true;
}

function addHistory({ url, title }) {
  if (!url || !/^https?:/i.test(url)) return;
  data.history = data.history.filter((h) => h.url !== url);
  data.history.unshift({ id: nextId(), url, title: title || url, time: Date.now() });
  if (data.history.length > MAX_HISTORY) data.history.length = MAX_HISTORY;
  save();
}

function removeHistory(id) {
  data.history = data.history.filter((h) => h.id !== id);
  save();
}

function clearHistory() {
  data.history = [];
  save();
}

function getHistory() {
  return data.history.map((h) => ({ ...h }));
}

function topSites(limit = 8) {
  const byHost = new Map();
  for (const h of data.history) {
    let host;
    try {
      host = new URL(h.url).hostname;
    } catch (_) {
      continue;
    }
    const e = byHost.get(host);
    if (e) e.count += 1;
    else byHost.set(host, { count: 1, url: h.url, title: h.title });
  }
  return [...byHost.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([host, v]) => ({ host, url: v.url, title: v.title }));
}

function getDownloads() {
  return data.downloads.map((d) => ({ ...d }));
}

function addDownload(item) {
  data.downloads.unshift(item);
  if (data.downloads.length > MAX_DOWNLOADS) data.downloads.length = MAX_DOWNLOADS;
  save();
  return item;
}

function updateDownload(id, patch) {
  const d = data.downloads.find((x) => x.id === id);
  if (d) {
    Object.assign(d, patch);
    save();
  }
}

function removeDownload(id) {
  data.downloads = data.downloads.filter((d) => d.id !== id);
  save();
}

function clearDownloads() {
  data.downloads = data.downloads.filter((d) => d.state === 'progressing' || d.state === 'paused');
  save();
}

function getSession() {
  return { urls: (data.session.urls || []).slice() };
}

function setSession(urls) {
  data.session = { urls: Array.isArray(urls) ? urls.slice(0, 50) : [] };
  save();
}

module.exports = {
  DEFAULTS,
  init,
  saveNow,
  nextId,
  getSettings,
  setSettings,
  getBookmarks,
  addBookmark,
  removeBookmark,
  isBookmarked,
  toggleBookmark,
  addHistory,
  removeHistory,
  clearHistory,
  getHistory,
  topSites,
  getDownloads,
  addDownload,
  updateDownload,
  removeDownload,
  clearDownloads,
  getSession,
  setSession,
};
