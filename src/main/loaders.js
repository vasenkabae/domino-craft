const fs = require('fs/promises');
const fssync = require('fs');
const path = require('path');
const { downloadFile } = require('./downloader');

// Кладёт профиль Fabric в versions/ и возвращает id версии для MCLC.
async function ensureFabric(root, mcVersion, loaderVersion) {
  const id = `fabric-loader-${loaderVersion}-${mcVersion}`;
  const jsonPath = path.join(root, 'versions', id, id + '.json');
  if (!fssync.existsSync(jsonPath)) {
    const url = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/profile/json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Fabric meta: HTTP ' + res.status);
    const profile = await res.text();
    await fs.mkdir(path.dirname(jsonPath), { recursive: true });
    await fs.writeFile(jsonPath, profile);
  }
  return id;
}

// Скачивает установщик Forge в кэш и возвращает путь (MCLC ставит Forge сам).
async function ensureForge(cacheDir, installerUrl) {
  const file = path.join(cacheDir, 'forge', path.basename(new URL(installerUrl).pathname));
  if (!fssync.existsSync(file)) await downloadFile(installerUrl, file);
  return file;
}

module.exports = { ensureFabric, ensureForge };
