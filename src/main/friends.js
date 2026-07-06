const fs = require('fs/promises');
const path = require('path');

const DEFAULTS = {
  friends: [], // [{ nick, note, addedAt }]
  watchedServers: [] // [{ label, host, port }]
};

// Свежие массивы на каждый вызов — иначе shallow-копия делила бы ссылки с DEFAULTS.
async function loadFriends(file) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    return {
      friends: Array.isArray(parsed.friends) ? parsed.friends : [],
      watchedServers: Array.isArray(parsed.watchedServers) ? parsed.watchedServers : []
    };
  } catch {
    return { friends: [], watchedServers: [] };
  }
}

async function save(file, state) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(state, null, 2));
  return state;
}

const sameNick = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const sameServer = (a, b) => a.host === b.host && (a.port || 25565) === (b.port || 25565);

async function addFriend(file, nick, note) {
  const state = await loadFriends(file);
  const clean = (nick || '').trim();
  if (!clean) return state; // пустой ник игнорируем
  if (state.friends.some(f => sameNick(f.nick, clean))) return state; // дубль
  state.friends.push({ nick: clean, note: (note || '').trim(), addedAt: Date.now() });
  return save(file, state);
}

async function removeFriend(file, nick) {
  const state = await loadFriends(file);
  state.friends = state.friends.filter(f => !sameNick(f.nick, nick));
  return save(file, state);
}

async function addWatched(file, server) {
  const state = await loadFriends(file);
  const entry = { label: (server.label || '').trim(), host: server.host, port: server.port || 25565 };
  if (!entry.host) return state;
  if (state.watchedServers.some(s => sameServer(s, entry))) return state; // дубль host:port
  state.watchedServers.push(entry);
  return save(file, state);
}

async function removeWatched(file, server) {
  const state = await loadFriends(file);
  state.watchedServers = state.watchedServers.filter(s => !sameServer(s, server));
  return save(file, state);
}

module.exports = {
  loadFriends,
  addFriend,
  removeFriend,
  addWatched,
  removeWatched,
  DEFAULTS
};
