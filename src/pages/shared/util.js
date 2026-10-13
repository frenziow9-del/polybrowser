function hashHue(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) >>> 0;
  return h % 360;
}

function letterColor(str) {
  return 'hsl(' + hashHue(str || '?') + ' 42% 46%)';
}

function firstLetter(s) {
  const m = String(s || '?').replace(/^https?:\/\/(www\.)?/i, '').trim();
  return (m.charAt(0) || '?').toUpperCase();
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch (_) {
    return String(url || '');
  }
}

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return '';
  }
}

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return (i === 0 ? n : n.toFixed(1)) + ' ' + units[i];
}
