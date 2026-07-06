const { status } = require('minecraft-server-util');

async function getServerStatus(host, port = 25565) {
  try {
    const res = await status(host, port, { timeout: 3000 });
    // sample — выборка ников онлайн (может быть урезана или отключена сервером)
    const sample = (res.players.sample || []).map(p => p.name);
    return { online: true, players: res.players.online, max: res.players.max, sample };
  } catch {
    return { online: false };
  }
}

// news.json в репозитории сборки: [{ date, title, text }]
async function fetchNews(url) {
  if (!url) return [];
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const items = await res.json();
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

module.exports = { getServerStatus, fetchNews };
