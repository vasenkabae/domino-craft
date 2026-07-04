const crypto = require('crypto');

// Стандартная схема офлайн-серверов: UUID v3 от "OfflinePlayer:<ник>",
// чтобы UUID был стабильным и инвентарь игрока не слетал.
function offlineUuid(name) {
  const hash = crypto.createHash('md5').update('OfflinePlayer:' + name, 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

// Объект авторизации в формате minecraft-launcher-core.
function offlineAuth(name) {
  const uuid = offlineUuid(name);
  return {
    access_token: uuid,
    client_token: uuid,
    uuid,
    name,
    user_properties: '{}',
    meta: { type: 'mojang', demo: false }
  };
}

module.exports = { offlineUuid, offlineAuth };
