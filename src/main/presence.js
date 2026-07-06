const norm = s => (s || '').trim().toLowerCase();

// Чистая функция: по списку друзей и статусам серверов считает, кто онлайн и где.
// friends: [{ nick, ... }]
// servers: [{ label, online, players, max, sample: [ник] }]
function computePresence(friends, servers) {
  const serverInfo = servers.map(s => ({
    label: s.label,
    host: s.host || null,
    port: s.port || null,
    online: !!s.online,
    players: s.players || 0,
    max: s.max || 0,
    // выборка ников считается полной, если покрывает всех онлайн-игроков
    sampleComplete: !s.online ? false : (s.sample || []).length >= (s.players || 0)
  }));

  const friendPresence = friends.map(f => {
    for (const s of servers) {
      if (!s.online) continue;
      if ((s.sample || []).some(name => norm(name) === norm(f.nick))) {
        return { nick: f.nick, online: true, server: s.label };
      }
    }
    return { nick: f.nick, online: false, server: null };
  });

  return { friends: friendPresence, servers: serverInfo };
}

// Опрашивает все наблюдаемые серверы через getStatus и возвращает presence.
// getStatus(host, port) -> { online, players, max, sample } (может бросить — трактуем как оффлайн).
async function pollPresence(friends, watchedServers, getStatus) {
  const statuses = await Promise.all(
    watchedServers.map(async w => {
      try {
        const st = await getStatus(w.host, w.port || 25565);
        return { label: w.label, host: w.host, port: w.port || 25565, ...st };
      } catch {
        return { label: w.label, host: w.host, port: w.port || 25565, online: false };
      }
    })
  );
  return computePresence(friends, statuses);
}

module.exports = { computePresence, pollPresence };
