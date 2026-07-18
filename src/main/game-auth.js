// Проверка ника и пароля на игровом сервере (плагин DominoAuth, эндпоинт /auth/*).
// Сервер в offline-mode, поэтому личность = ник; пароль — единственное, что отличает
// владельца ника от чужого. Лаунчер спрашивает его до запуска игры, чтобы человек
// не узнавал о занятом нике уже внутри игры.

const TIMEOUT_MS = 8000;

async function call(url, options = {}, fetchFn = fetch) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { ...options, signal: ctrl.signal });
    return { res, data: await res.json() };
  } finally {
    clearTimeout(timer);
  }
}

// Зарегистрирован ли ник. network:false — сервер не ответил, решение принимает вызывающий.
async function nickExists(apiBase, nick, fetchFn = fetch) {
  try {
    const { res, data } = await call(
      `${apiBase}/auth/exists?name=${encodeURIComponent(nick)}`, {}, fetchFn);
    if (!res.ok) return { network: false };
    return { exists: !!data.exists, network: true };
  } catch {
    return { network: false };
  }
}

async function submit(apiBase, path, nick, password, fetchFn) {
  try {
    const body = new URLSearchParams({ name: nick, password }).toString();
    const { data } = await call(`${apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    }, fetchFn);
    return { ok: !!data.ok, message: data.message || '', network: true };
  } catch {
    return { ok: false, message: 'Сервер авторизации недоступен', network: false };
  }
}

const checkPassword = (apiBase, nick, password, fetchFn = fetch) =>
  submit(apiBase, '/auth/login', nick, password, fetchFn);

const registerNick = (apiBase, nick, password, fetchFn = fetch) =>
  submit(apiBase, '/auth/register', nick, password, fetchFn);

module.exports = { nickExists, checkPassword, registerNick };
