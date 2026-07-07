const { app, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const config = require('../../launcher.config.json');
const { loadSettings, saveSettings } = require('./settings');
const { offlineAuth, offlineUuid } = require('./offline-auth');
const { loginMicrosoft, refreshMicrosoft } = require('./msauth');
const { getServerStatus, fetchNews } = require('./status');
const { fetchManifest } = require('./manifest');
const { play } = require('./game');
const { loadFriends, addFriend, removeFriend, addWatched, removeWatched } = require('./friends');
const { pollPresence } = require('./presence');
const { HostServer, prepareServerFiles } = require('./host-server');
const { ensurePlayit, PlayitTunnel } = require('./tunnel');
const { pickPort, hostProfileDir } = require('./host-config');
const net = require('net');

function registerIpc(win) {
  const userData = app.getPath('userData');
  const settingsFile = path.join(userData, 'settings.json');
  const sessionFile = path.join(userData, 'session.json');
  const manifestCache = path.join(userData, 'manifest.cache.json');
  const friendsFile = path.join(userData, 'friends.json');
  let busy = false;
  let paidServer = null; // адрес платного сервера из манифеста (для presence)

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

  ipcMain.handle('choose-dir', async () => {
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return res.canceled ? null : res.filePaths[0];
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

  ipcMain.handle('news', () => fetchNews(config.newsUrl));

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

  // --- Друзья и presence ---
  ipcMain.handle('friends:list', () => loadFriends(friendsFile));
  ipcMain.handle('friends:add', async (_e, { nick, note }) => {
    const s = await addFriend(friendsFile, nick, note);
    presenceTick().catch(() => {}); // сразу обновить статус нового друга
    return s;
  });
  ipcMain.handle('friends:remove', (_e, nick) => removeFriend(friendsFile, nick));
  ipcMain.handle('friends:watch-add', async (_e, server) => {
    const s = await addWatched(friendsFile, server);
    presenceTick().catch(() => {});
    return s;
  });
  ipcMain.handle('friends:watch-remove', (_e, server) => removeWatched(friendsFile, server));

  // --- Хостинг сервера с ПК (playit.gg) ---
  const hostDir = path.join(userData, 'host-server');
  const playitBin = path.join(userData, 'playit', 'playit.exe');
  let hostServer = null;
  let tunnel = null;

  const isPortFree = port => new Promise(resolve => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '0.0.0.0');
  });

  const stopTunnel = () => { if (tunnel) { tunnel.stop(); tunnel = null; } };

  // Туннель поднимаем только когда сервер готов принимать игроков.
  async function startTunnel() {
    if (tunnel) return;
    try {
      emit('host:log', 'Запуск туннеля playit…');
      await ensurePlayit(playitBin);
      tunnel = new PlayitTunnel();
      tunnel.on('claim', u => emit('host:claim', u));
      tunnel.on('address', a => emit('host:address', a));
      tunnel.on('log', l => emit('host:log', '[playit] ' + l));
      tunnel.start(playitBin);
    } catch (e) {
      tunnel = null;
      emit('host:log', 'Туннель не поднялся: ' + e.message + ' — сервер доступен по локальной сети');
    }
  }

  ipcMain.handle('host:state', () => ({
    status: hostServer ? hostServer.status : 'idle',
    address: tunnel ? tunnel.address : null
  }));

  ipcMain.handle('host:stop', async () => {
    stopTunnel();
    if (hostServer) { await hostServer.stop(); hostServer = null; }
    emit('host:status', 'idle');
    return true;
  });

  ipcMain.handle('host:start', async (_e, opts = {}) => {
    if (hostServer) return; // уже запущен
    try {
      emit('host:status', 'preparing');
      const settings = await loadSettings(settingsFile);
      // Версия на выбор: без opts.version — наша сборка, с ней — ванильный сервер этой версии.
      let manifest;
      if (opts.version) {
        manifest = { minecraft: opts.version, loader: { type: 'vanilla' }, files: [] };
      } else {
        ({ manifest } = await fetchManifest(config.manifestUrl, manifestCache));
      }
      const session = await readSession();
      const state = await loadFriends(friendsFile);
      const nicks = [session && session.name, ...state.friends.map(f => f.nick)].filter(Boolean);
      const port = await pickPort(25565, isPortFree);

      const prep = await prepareServerFiles({
        manifest, userData, dir: hostProfileDir(hostDir, opts.version || null), nicks,
        motd: config.name, port, eulaAccepted: !!opts.eulaAccepted,
        onProgress: label => emit('host:log', label)
      });

      hostServer = new HostServer();
      hostServer.on('status', async s => {
        emit('host:status', s);
        if (s === 'ready') startTunnel();
      });
      hostServer.on('log', l => emit('host:log', l));
      hostServer.on('exit', () => { stopTunnel(); hostServer = null; emit('host:status', 'idle'); });
      hostServer.start({ ...prep, memoryMb: settings.serverMemoryMb || 2048 });
    } catch (e) {
      emit('host:status', 'idle');
      emit('host:error', e.message);
      if (hostServer) { try { await hostServer.stop(); } catch { /* */ } hostServer = null; }
      stopTunnel();
    }
  });

  win.on('closed', () => { stopTunnel(); if (hostServer) hostServer.stop().catch(() => {}); });

  // Разрешаем адрес платного сервера один раз — он редко меняется
  async function resolvePaidServer() {
    try {
      const { manifest } = await fetchManifest(config.manifestUrl, manifestCache);
      if (manifest.server && manifest.server.host) {
        paidServer = { label: 'Наш сервер', host: manifest.server.host, port: manifest.server.port || 25565 };
      }
    } catch {
      // нет сети/сервера — presence поработает только по локальным watchedServers
    }
  }

  let ticking = false;
  async function presenceTick() {
    if (ticking) return;
    ticking = true;
    try {
      const state = await loadFriends(friendsFile);
      if (!state.friends.length) {
        emit('presence:update', { friends: [], servers: [] });
        return;
      }
      const watched = [];
      if (paidServer) watched.push(paidServer);
      for (const w of state.watchedServers) {
        if (!watched.some(x => x.host === w.host && (x.port || 25565) === (w.port || 25565))) {
          watched.push(w);
        }
      }
      emit('presence:update', await pollPresence(state.friends, watched, getServerStatus));
    } catch {
      // presence не критичен — молча пропускаем тик
    } finally {
      ticking = false;
    }
  }

  resolvePaidServer().then(() => presenceTick());
  const presenceTimer = setInterval(() => presenceTick().catch(() => {}), 15000);
  win.on('closed', () => clearInterval(presenceTimer));
}

module.exports = { registerIpc };
