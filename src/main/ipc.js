const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const config = require('../../launcher.config.json');
const { loadSettings, saveSettings } = require('./settings');
const { offlineAuth, offlineUuid } = require('./offline-auth');
const { loginMicrosoft, refreshMicrosoft } = require('./msauth');
const { getServerStatus, fetchNews } = require('./status');
const { fetchManifest } = require('./manifest');
const { play } = require('./game');

function registerIpc(win) {
  const userData = app.getPath('userData');
  const settingsFile = path.join(userData, 'settings.json');
  const sessionFile = path.join(userData, 'session.json');
  const manifestCache = path.join(userData, 'manifest.cache.json');
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
    config: { name: config.name },
    settings: await loadSettings(settingsFile),
    session: await readSession()
  }));

  ipcMain.handle('login-offline', async (_e, nick) => {
    nick = String(nick || '').trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) {
      throw new Error('Ник: 3–16 символов, только латиница, цифры и _');
    }
    return writeSession({ type: 'offline', name: nick, uuid: offlineUuid(nick) });
  });

  ipcMain.handle('login-ms', async () => {
    const r = await loginMicrosoft(config.azureClientId);
    return writeSession({ type: 'ms', name: r.profile.name, uuid: r.profile.uuid, refresh: r.refresh });
  });

  ipcMain.handle('logout', () => writeSession(null));

  ipcMain.handle('save-settings', (_e, patch) => saveSettings(settingsFile, patch));

  ipcMain.handle('server-status', async () => {
    try {
      const { manifest } = await fetchManifest(config.manifestUrl, manifestCache);
      if (!manifest.server || !manifest.server.host) return { online: false };
      return getServerStatus(manifest.server.host, manifest.server.port);
    } catch {
      return { online: false };
    }
  });

  ipcMain.handle('news', () => fetchNews(config.newsUrl));

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
    } catch (e) {
      emit('state', { value: 'error', message: e.message });
    } finally {
      busy = false;
    }
  });
}

module.exports = { registerIpc };
