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

module.exports = { matchesAccess, loadAccess, saveAccess };
