const fs = require('fs/promises');
const path = require('path');

const norm = s => String(s || '').trim().toLowerCase();

// Проверяет введённую ссылку/код против эталона. Пустой ключ = замок выключен.
// Принимает и сам код, и полную ссылку Discord, содержащую код.
function matchesAccess(input, key) {
  const k = norm(key);
  if (!k) return true;
  return norm(input).includes(k);
}

// Проверка одноразового кода на сервере Discord-бота (эндпоинт /launcher/verify).
// Возвращает { ok, network }: network=false — сервер недоступен (код не тратится).
async function verifyRemote(apiUrl, input, fetchFn = fetch) {
  const code = String(input || '').trim();
  if (!code) return { ok: false, network: true };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetchFn(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, network: true };
    const data = await res.json();
    return { ok: !!data.ok, network: true };
  } catch {
    return { ok: false, network: false };
  }
}

async function loadAccess(file) {
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    return { unlocked: !!data.unlocked };
  } catch {
    return { unlocked: false };
  }
}

async function saveAccess(file, unlocked) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ unlocked: !!unlocked }));
  return { unlocked: !!unlocked };
}

module.exports = { matchesAccess, verifyRemote, loadAccess, saveAccess };
