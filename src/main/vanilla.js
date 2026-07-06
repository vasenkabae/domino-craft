const { fetchManifest } = require('./manifest');

const VERSIONS_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

function parseReleases(data) {
  return {
    latest: (data.latest && data.latest.release) || null,
    releases: (data.versions || []).filter(v => v.type === 'release').map(v => v.id)
  };
}

// Список релизов Minecraft с кэшем (fetchManifest даёт офлайн-фолбэк).
async function getVanillaVersions(cachePath) {
  const { manifest } = await fetchManifest(VERSIONS_URL, cachePath);
  return parseReleases(manifest);
}

// Точная версия Java из JSON конкретной версии Minecraft (javaVersion.majorVersion).
// null — если версия не найдена или нет сети; вызывающий падает на эвристику.
async function getVersionJavaMajor(versionId, cachePath) {
  const { manifest } = await fetchManifest(VERSIONS_URL, cachePath);
  const entry = (manifest.versions || []).find(v => v.id === versionId);
  if (!entry || !entry.url) return null;
  const res = await fetch(entry.url);
  if (!res.ok) return null;
  const json = await res.json();
  return (json.javaVersion && json.javaVersion.majorVersion) || null;
}

// Ссылка и sha1 серверного jar конкретной версии (downloads.server из JSON Mojang).
// null — если версия не найдена, нет сети или у версии нет серверного jar.
async function getServerDownload(versionId, cachePath) {
  const { manifest } = await fetchManifest(VERSIONS_URL, cachePath);
  const entry = (manifest.versions || []).find(v => v.id === versionId);
  if (!entry || !entry.url) return null;
  const res = await fetch(entry.url);
  if (!res.ok) return null;
  const json = await res.json();
  const server = json.downloads && json.downloads.server;
  return server ? { url: server.url, sha1: server.sha1 } : null;
}

module.exports = {
  parseReleases,
  getVanillaVersions,
  getVersionJavaMajor,
  getServerDownload,
  VERSIONS_URL
};
