const fs = require('fs/promises');
const path = require('path');
const { sha1File } = require('./downloader');

// Сравнивает манифест с локальным состоянием.
// localIndex: { 'mods/foo.jar': '<sha1>', ... }
// Удаляем только из mods/ — конфиги и сейвы игрока не трогаем.
function planSync(manifest, localIndex) {
  const wanted = new Map(manifest.files.map(f => [f.path, f]));
  const downloads = [];
  for (const f of wanted.values()) {
    if (localIndex[f.path] !== f.sha1) downloads.push(f);
  }
  const deletions = Object.keys(localIndex)
    .filter(p => p.startsWith('mods/') && !wanted.has(p));
  return { downloads, deletions };
}

// Индекс локальных файлов внутри указанных подпапок root.
async function buildLocalIndex(root, dirs) {
  const index = {};
  for (const dir of dirs) {
    await walk(path.join(root, dir), root, index);
  }
  return index;
}

async function walk(dir, root, index) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return; // папки ещё нет — это нормально при первом запуске
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, root, index);
    else index[path.relative(root, p).split(path.sep).join('/')] = await sha1File(p);
  }
}

module.exports = { planSync, buildLocalIndex };
