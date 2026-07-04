const fs = require('fs/promises');
const path = require('path');

// Тянет манифест сборки; при недоступности сети отдаёт последний кэш
// (offline: true), чтобы можно было играть без интернета.
async function fetchManifest(url, cachePath) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const manifest = await res.json();
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(manifest));
    return { manifest, offline: false };
  } catch (err) {
    try {
      const manifest = JSON.parse(await fs.readFile(cachePath, 'utf8'));
      return { manifest, offline: true };
    } catch {
      throw new Error('Не удалось получить манифест сборки: ' + err.message);
    }
  }
}

module.exports = { fetchManifest };
