const { offlineUuid } = require('./offline-auth');

// server.properties для ad-hoc сервера: вход по нику → online-mode=false,
// поэтому обязательно включаем вайтлист (белый список из друзей).
function serverProperties({ port = 25565, motd = 'Domino Craft', maxPlayers = 10, whitelist = true }) {
  const props = {
    'online-mode': 'false',
    'white-list': whitelist ? 'true' : 'false',
    'enforce-whitelist': whitelist ? 'true' : 'false',
    'server-port': String(port),
    'motd': motd,
    'max-players': String(maxPlayers),
    'spawn-protection': '0'
  };
  return Object.entries(props).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
}

// whitelist.json: [{ uuid, name }] с офлайн-UUID (иначе на online-mode=false не совпадёт).
function whitelistJson(nicks) {
  const seen = new Set();
  const list = [];
  for (const raw of nicks) {
    const nick = String(raw || '').trim();
    if (!nick) continue;
    const key = nick.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ uuid: offlineUuid(nick), name: nick });
  }
  return JSON.stringify(list, null, 2);
}

// Строка готовности ванильного/модового сервера: 'Done (12.345s)! For help...'
const READY_RE = /\bDone \([\d.]+s\)!/;
function isReadyLine(line) {
  return READY_RE.test(String(line));
}

// Публичный адрес из вывода playit: хост вида *.playit.gg / *.ply.gg, опционально с портом.
// Формат вывода playit может меняться — при необходимости расширить шаблон.
const PLAYIT_RE = /([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:playit\.gg|ply\.gg))(?::(\d+))?/i;
function parsePlayitAddress(line) {
  const m = String(line).match(PLAYIT_RE);
  if (!m) return null;
  return m[2] ? `${m[1]}:${m[2]}` : m[1];
}

// Ищет свободный порт начиная с preferred (isFree(port) -> Promise<bool>).
async function pickPort(preferred, isFree) {
  for (let p = preferred; p < preferred + 20; p++) {
    if (await isFree(p)) return p;
  }
  throw new Error('Не найден свободный порт рядом с ' + preferred);
}

module.exports = { serverProperties, whitelistJson, isReadyLine, parsePlayitAddress, pickPort };
