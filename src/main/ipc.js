const { app, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const config = require('../../launcher.config.json');
const { loadSettings, saveSettings } = require('./settings');
const { offlineAuth, offlineUuid } = require('./offline-auth');
const { loginMicrosoft, refreshMicrosoft } = require('./msauth');
const { getServerStatus } = require('./status');
const { fetchManifest } = require('./manifest');
const { play } = require('./game');
const { matchesAccess, verifyRemote, loadAccess, saveAccess } = require('./access');
const { validateSkinPng, uploadSkin } = require('./skin');
const { nickExists, checkPassword, registerNick } = require('./game-auth');

function registerIpc(win) {
  const userData = app.getPath('userData');
  const settingsFile = path.join(userData, 'settings.json');
  const sessionFile = path.join(userData, 'session.json');
  const manifestCache = path.join(userData, 'manifest.cache.json');
  const accessFile = path.join(userData, 'access.json');
  let busy = false;

  const emit = (channel, payload) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  };

  const readSession = async () => {
    try { return JSON.parse(await fs.readFile(sessionFile, 'utf8')); } catch { return null; }
  };
  const writeSession = async s => {
    if (s === null) await fs.rm(sessionFile, { force: true });
    else await fs.writeFile(sessionFile, JSON.stringify(s));
    return s;
  };

  ipcMain.handle('get-state', async () => ({
    config: { name: config.name, authRequired: !!config.authApi },
    version: app.getVersion(),
    settings: await loadSettings(settingsFile),
    session: await readSession(),
    access: {
      required: !!(config.accessApi || config.accessKey),
      unlocked: (await loadAccess(accessFile)).unlocked
    }
  }));

  // Экран-замок: одноразовый код из Discord-бота (/linkcraft) проверяется на VPS;
  // без accessApi — фолбэк на статичный accessKey; без обоих — замка нет.
  ipcMain.handle('access:submit', async (_e, input) => {
    if (config.accessApi) {
      const r = await verifyRemote(config.accessApi, input);
      if (r.ok) {
        await saveAccess(accessFile, true);
        return { unlocked: true };
      }
      return { unlocked: false, offline: !r.network };
    }
    if (matchesAccess(input, config.accessKey)) {
      await saveAccess(accessFile, true);
      return { unlocked: true };
    }
    return { unlocked: false };
  });

  const cleanNick = nick => {
    nick = String(nick || '').trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) {
      throw new Error('Ник: 3–16 символов, только латиница, цифры и _');
    }
    return nick;
  };

  ipcMain.handle('login-offline', async (_e, nick) => {
    nick = cleanNick(nick);
    return writeSession({ type: 'offline', name: nick, uuid: offlineUuid(nick) });
  });

  // Первый шаг входа: знает ли сервер этот ник. От ответа зависит, что показать —
  // поле пароля или форму регистрации.
  ipcMain.handle('auth:check-nick', async (_e, nick) => {
    nick = cleanNick(nick);
    if (!config.authApi) return { exists: true, network: false, disabled: true };
    return nickExists(config.authApi, nick);
  });

  // Второй шаг: пароль от DominoAuth. Лаунчер только проверяет его —
  // вход в игру всё равно подтверждает сам сервер.
  ipcMain.handle('auth:submit', async (_e, { nick, password, register }) => {
    nick = cleanNick(nick);
    if (!config.authApi) throw new Error('Проверка пароля не настроена');
    const r = register
      ? await registerNick(config.authApi, nick, password)
      : await checkPassword(config.authApi, nick, password);
    if (!r.ok) return { ok: false, message: r.message, network: r.network };
    const session = await writeSession({ type: 'offline', name: nick, uuid: offlineUuid(nick) });
    return { ok: true, session };
  });

  ipcMain.handle('login-ms', async () => {
    const r = await loginMicrosoft(config.azureClientId);
    return writeSession({ type: 'ms', name: r.profile.name, uuid: r.profile.uuid, refresh: r.refresh });
  });

  ipcMain.handle('logout', () => writeSession(null));

  ipcMain.handle('save-settings', (_e, patch) => saveSettings(settingsFile, patch));

  ipcMain.handle('choose-dir', async () => {
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return res.canceled ? null : res.filePaths[0];
  });

  // Открыть папку с файлами игры в проводнике (для текущего режима)
  ipcMain.handle('open-game-dir', async () => {
    const settings = await loadSettings(settingsFile);
    const dir = settings.mode === 'vanilla'
      ? path.join(userData, 'vanilla')
      : (settings.gameDir || path.join(userData, 'game'));
    await fs.mkdir(dir, { recursive: true }); // до первого запуска папки может ещё не быть
    await shell.openPath(dir);
  });

  ipcMain.handle('skin:choose', async () => {
    const res = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'PNG-скин', extensions: ['png'] }]
    });
    if (res.canceled) return null;
    const buffer = await fs.readFile(res.filePaths[0]);
    try {
      validateSkinPng(buffer);
    } catch (e) {
      return { error: e.message };
    }
    return { filePath: res.filePaths[0], dataUrl: 'data:image/png;base64,' + buffer.toString('base64') };
  });

  ipcMain.handle('skin:apply', async (_e, filePath) => {
    const session = await readSession();
    if (!session) throw new Error('Сначала войди в аккаунт');
    const buffer = await fs.readFile(filePath);
    validateSkinPng(buffer);
    const apiBase = config.manifestUrl.replace(/\/dc\/manifest\.json$/, '');
    return uploadSkin(apiBase, session.name, buffer);
  });

  ipcMain.handle('server-status', async () => {
    try {
      const { manifest } = await fetchManifest(config.manifestUrl, manifestCache);
      if (!manifest.server || !manifest.server.host) return { online: false };
      return getServerStatus(manifest.server.host, manifest.server.port);
    } catch {
      return { online: false };
    }
  });


  ipcMain.handle('vanilla-versions', async () => {
    try {
      const { getVanillaVersions } = require('./vanilla');
      return await getVanillaVersions(path.join(userData, 'versions.cache.json'));
    } catch {
      return { latest: null, releases: [] };
    }
  });

  ipcMain.handle('play', async () => {
    if (busy) return;
    busy = true;
    try {
      const session = await readSession();
      if (!session) throw new Error('Сначала войди в аккаунт');
      let auth;
      if (session.type === 'offline') {
        auth = offlineAuth(session.name);
      } else {
        const r = await refreshMicrosoft(session.refresh, config.azureClientId);
        await writeSession({ type: 'ms', name: r.profile.name, uuid: r.profile.uuid, refresh: r.refresh });
        auth = r.mclc;
      }
      const settings = await loadSettings(settingsFile);
      await play({ config, settings, auth, paths: { userData }, emit });
      // Что делать с лаунчером после старта игры
      if (settings.afterLaunch === 'close') app.quit();
      else if (settings.afterLaunch === 'minimize' && !win.isDestroyed()) win.minimize();
    } catch (e) {
      emit('state', { value: 'error', message: e.message });
    } finally {
      busy = false;
    }
  });

}

module.exports = { registerIpc };
