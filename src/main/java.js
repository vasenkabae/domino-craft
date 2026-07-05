const fs = require('fs/promises');
const fssync = require('fs');
const path = require('path');
const extract = require('extract-zip');
const { downloadFile } = require('./downloader');

// Эвристика на случай, когда JSON Mojang недоступен (точное значение
// берётся из javaVersion в getVersionJavaMajor). Для схемы 1.x.y:
// 1.20.5+ → 21, 1.17+ → 17, старее → 8. Новая схема (25.x+) → 21.
function requiredJavaMajor(mcVersion) {
  const parts = mcVersion.split('.').map(n => parseInt(n, 10) || 0);
  if (parts[0] !== 1) return 21;
  const minor = parts[1] || 0;
  const patch = parts[2] || 0;
  if (minor > 20 || (minor === 20 && patch >= 5)) return 21;
  if (minor >= 17) return 17;
  return 8;
}

// Скачивает JRE Adoptium (Temurin) в userData/runtime и возвращает путь к javaw.exe.
async function ensureJava(major, baseDir, onProgress = () => {}) {
  const dir = path.join(baseDir, 'runtime', 'java-' + major);
  const cached = findJavaw(dir);
  if (cached) return cached;

  onProgress('Скачивание Java ' + major);
  const api = `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?os=windows&architecture=x64&image_type=jre`;
  const res = await fetch(api);
  if (!res.ok) throw new Error('Adoptium API: HTTP ' + res.status);
  const assets = await res.json();
  const link = assets[0] && assets[0].binary && assets[0].binary.package && assets[0].binary.package.link;
  if (!link) throw new Error('Adoptium: не найден пакет JRE ' + major);

  const zipPath = dir + '.zip';
  await downloadFile(link, zipPath);
  onProgress('Распаковка Java ' + major);
  await extract(zipPath, { dir });
  await fs.rm(zipPath, { force: true });

  const javaw = findJavaw(dir);
  if (!javaw) throw new Error('javaw.exe не найден после распаковки JRE');
  return javaw;
}

// Adoptium-архив содержит вложенную папку jdk-XX.Y.Z-jre — ищем bin/javaw.exe на обоих уровнях.
function findJavaw(dir) {
  if (!fssync.existsSync(dir)) return null;
  const direct = path.join(dir, 'bin', 'javaw.exe');
  if (fssync.existsSync(direct)) return direct;
  for (const entry of fssync.readdirSync(dir)) {
    const nested = path.join(dir, entry, 'bin', 'javaw.exe');
    if (fssync.existsSync(nested)) return nested;
  }
  return null;
}

module.exports = { requiredJavaMajor, ensureJava };
