const $ = id => document.getElementById(id);

let settings = { memoryMb: 4096 };
let running = false;
let friendsData = { friends: [], watchedServers: [] };
let presenceByNick = {}; // ник(в нижнем регистре) -> { online, server }
let serversByLabel = {}; // ярлык сервера -> { host, port, ... }
let hostStatus = 'idle';

init();

async function init() {
  const state = await launcher.getState();
  settings = state.settings;
  applyFx();
  $('title-login').textContent = state.config.name;
  $('title-main').textContent = state.config.name;
  document.title = state.config.name;

  if (state.session) showMain(state.session);

  $('btn-offline').onclick = async () => {
    try {
      const session = await launcher.loginOffline($('nick').value);
      $('login-error').textContent = '';
      showMain(session);
    } catch (e) {
      $('login-error').textContent = cleanError(e);
    }
  };
  $('nick').onkeydown = e => { if (e.key === 'Enter') $('btn-offline').click(); };

  $('btn-ms').onclick = async () => {
    try {
      $('btn-ms').disabled = true;
      const session = await launcher.loginMs();
      $('login-error').textContent = '';
      showMain(session);
    } catch (e) {
      $('login-error').textContent = cleanError(e);
    } finally {
      $('btn-ms').disabled = false;
    }
  };

  $('btn-play').onclick = () => {
    if (running) return;
    setPlayState('busy', 'Подготовка…');
    launcher.play();
  };

  $('mode-pack').onclick = () => setMode('pack');
  $('mode-vanilla').onclick = () => setMode('vanilla');
  $('vanilla-version').onchange = async e => {
    settings = await launcher.saveSettings({ vanillaVersion: e.target.value || null });
  };
  setMode(settings.mode || 'pack', true);

  $('btn-settings').onclick = () => {
    $('mem').value = settings.memoryMb;
    $('mem-label').textContent = fmtMem(settings.memoryMb);
    $('res-w').value = settings.resWidth;
    $('res-h').value = settings.resHeight;
    $('fullscreen').checked = !!settings.fullscreen;
    $('after-launch').value = settings.afterLaunch || 'minimize';
    $('game-dir').value = settings.gameDir || '';
    $('opt-dominoes').checked = settings.dominoes !== false;
    $('opt-sounds').checked = settings.sounds !== false;
    $('settings-modal').classList.remove('hidden');
  };
  $('mem').oninput = e => { $('mem-label').textContent = fmtMem(+e.target.value); };

  // Оформление применяем сразу, чтобы эффект был виден в реальном времени
  $('opt-dominoes').onchange = e => window.fxControl && window.fxControl.setDominoes(e.target.checked);
  $('opt-sounds').onchange = e => window.fxControl && window.fxControl.setSounds(e.target.checked);

  $('btn-choose-dir').onclick = async () => {
    const dir = await launcher.chooseDir();
    if (dir) $('game-dir').value = dir;
  };
  $('btn-reset-dir').onclick = () => { $('game-dir').value = ''; };

  $('btn-close-settings').onclick = async () => {
    settings = await launcher.saveSettings({
      memoryMb: +$('mem').value,
      resWidth: clampInt($('res-w').value, 640, 7680, 854),
      resHeight: clampInt($('res-h').value, 480, 4320, 480),
      fullscreen: $('fullscreen').checked,
      afterLaunch: $('after-launch').value,
      gameDir: $('game-dir').value || null,
      dominoes: $('opt-dominoes').checked,
      sounds: $('opt-sounds').checked
    });
    applyFx();
    $('settings-modal').classList.add('hidden');
  };
  $('btn-logout').onclick = async () => {
    await launcher.logout();
    location.reload();
  };

  $('btn-close-error').onclick = () => $('error-modal').classList.add('hidden');
  $('btn-copy-error').onclick = () => navigator.clipboard.writeText($('error-text').textContent);

  $('btn-friends').onclick = openFriends;
  $('btn-close-friends').onclick = () => $('friends-modal').classList.add('hidden');
  $('btn-add-friend').onclick = addFriendFromInput;
  $('friend-nick').onkeydown = e => { if (e.key === 'Enter') addFriendFromInput(); };
  launcher.onPresence(applyPresence);

  $('btn-host').onclick = openHost;
  $('btn-close-host').onclick = () => $('host-modal').classList.add('hidden');
  $('srvmem').oninput = e => { $('srvmem-label').textContent = fmtMem(+e.target.value); };
  $('btn-host-toggle').onclick = onHostToggle;
  $('btn-copy-address').onclick = () => {
    navigator.clipboard.writeText($('host-address').value);
    $('btn-copy-address').textContent = 'Скопировано';
    setTimeout(() => { $('btn-copy-address').textContent = 'Копировать'; }, 1200);
  };
  launcher.onHostStatus(applyHostStatus);
  launcher.onHostAddress(a => {
    $('host-address').value = a;
    $('host-address-row').classList.remove('hidden');
  });
  launcher.onHostClaim(u => {
    const el = $('host-claim');
    el.textContent = 'Один раз привяжи playit к своему аккаунту: открой ' + u;
    el.classList.remove('hidden');
  });
  launcher.onHostLog(appendHostLog);
  launcher.onHostError(m => appendHostLog('Ошибка: ' + m));

  launcher.onProgress(p => {
    const label = p.phase === 'sync' ? `Сборка: ${p.label} (${p.current}/${p.total})`
      : p.phase === 'java' ? p.label
      : `Файлы игры: ${p.label} (${Math.min(p.current, p.total)}/${p.total})`;
    $('progress-label').textContent = label;
    $('bar-fill').style.width = p.total ? Math.round(p.current / p.total * 100) + '%' : '30%';
  });

  launcher.onState(s => {
    if (s.value === 'syncing') setPlayState('busy', s.message || 'Проверка сборки…');
    else if (s.value === 'launching') setPlayState('busy', 'Запуск игры…');
    else if (s.value === 'running') setPlayState('running', 'Игра запущена. Приятной игры!');
    else if (s.value === 'idle') setPlayState('idle', '');
    else if (s.value === 'error') {
      setPlayState('idle', '');
      $('error-text').textContent = s.message || 'Неизвестная ошибка';
      $('error-modal').classList.remove('hidden');
    }
  });
}

let versionsLoaded = false;

async function setMode(mode, initial = false) {
  $('mode-pack').classList.toggle('active', mode === 'pack');
  $('mode-vanilla').classList.toggle('active', mode === 'vanilla');
  $('vanilla-version').classList.toggle('hidden', mode !== 'vanilla');
  if (!initial || settings.mode !== mode) {
    settings = await launcher.saveSettings({ mode });
  }
  if (mode === 'vanilla' && !versionsLoaded) {
    versionsLoaded = true;
    const { latest, releases } = await launcher.vanillaVersions();
    const sel = $('vanilla-version');
    sel.innerHTML = '';
    for (const id of releases) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id === latest ? id + ' (последняя)' : id;
      sel.append(opt);
    }
    if (!releases.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'нет связи с Mojang';
      sel.append(opt);
    }
    sel.value = settings.vanillaVersion || latest || '';
  }
}

function showMain(session) {
  $('login').classList.add('hidden');
  $('main').classList.remove('hidden');
  $('user-name').textContent = session.name;
  refreshStatus();
  refreshNews();
  setInterval(refreshStatus, 30000);
}

async function refreshStatus() {
  const s = await launcher.serverStatus();
  const chip = $('server-chip');
  if (s.online) {
    chip.textContent = `Сервер онлайн · ${s.players}/${s.max}`;
    chip.className = 'server-chip online';
  } else {
    chip.textContent = 'Сервер офлайн';
    chip.className = 'server-chip offline';
  }
}

async function refreshNews() {
  const items = await launcher.news();
  if (!items.length) return;
  const box = $('news');
  box.innerHTML = '';
  for (const n of items) {
    const el = document.createElement('div');
    el.className = 'news-item';
    const date = document.createElement('div');
    date.className = 'date';
    date.textContent = n.date || '';
    const h = document.createElement('h3');
    h.textContent = n.title || '';
    const p = document.createElement('p');
    p.textContent = n.text || '';
    el.append(date, h, p);
    box.append(el);
  }
}

async function openFriends() {
  friendsData = await launcher.friendsList();
  renderFriends();
  $('friends-modal').classList.remove('hidden');
}

async function addFriendFromInput() {
  const nick = $('friend-nick').value.trim();
  if (!nick) return;
  friendsData = await launcher.friendsAdd(nick);
  $('friend-nick').value = '';
  renderFriends();
}

// Раскладываем событие presence в удобные карты и, если модалка открыта, перерисовываем
function applyPresence(p) {
  presenceByNick = {};
  for (const f of p.friends) presenceByNick[f.nick.toLowerCase()] = f;
  serversByLabel = {};
  for (const s of p.servers) serversByLabel[s.label] = s;
  if (!$('friends-modal').classList.contains('hidden')) renderFriends();
}

function renderFriends() {
  const box = $('friends-list');
  box.innerHTML = '';
  if (!friendsData.friends.length) {
    const empty = document.createElement('div');
    empty.className = 'friends-empty';
    empty.textContent = 'Пока никого. Добавь друга по нику выше.';
    box.append(empty);
    return;
  }
  for (const f of friendsData.friends) {
    const pres = presenceByNick[f.nick.toLowerCase()];
    const online = !!(pres && pres.online);
    const row = document.createElement('div');
    row.className = 'friend-row' + (online ? ' online' : '');

    const dot = document.createElement('span');
    dot.className = 'friend-dot';

    const name = document.createElement('span');
    name.className = 'friend-name';
    name.textContent = f.nick; // только textContent — ник не рендерим как HTML

    const meta = document.createElement('span');
    meta.className = 'friend-meta';
    meta.textContent = online ? `на «${pres.server}»` : 'оффлайн';

    const spacer = document.createElement('span');
    spacer.className = 'spacer';

    row.append(dot, name, meta, spacer);

    if (online) {
      const srv = serversByLabel[pres.server];
      if (srv && srv.host) {
        const copy = document.createElement('button');
        copy.className = 'friend-copy';
        copy.textContent = 'Копировать адрес';
        copy.onclick = () => {
          const addr = (srv.port && srv.port !== 25565) ? `${srv.host}:${srv.port}` : srv.host;
          navigator.clipboard.writeText(addr);
          copy.textContent = 'Скопировано';
          setTimeout(() => { copy.textContent = 'Копировать адрес'; }, 1200);
        };
        row.append(copy);
      }
    }

    const rm = document.createElement('button');
    rm.className = 'friend-remove';
    rm.textContent = '✕';
    rm.title = 'Удалить';
    rm.onclick = async () => {
      friendsData = await launcher.friendsRemove(f.nick);
      renderFriends();
    };
    row.append(rm);

    box.append(row);
  }
}

async function openHost() {
  const mem = settings.serverMemoryMb || 2048;
  $('srvmem').value = mem;
  $('srvmem-label').textContent = fmtMem(mem);
  const st = await launcher.hostState();
  applyHostStatus(st.status);
  if (st.address) {
    $('host-address').value = st.address;
    $('host-address-row').classList.remove('hidden');
  }
  $('host-modal').classList.remove('hidden');
}

async function onHostToggle() {
  if (hostStatus === 'idle') {
    if (!$('host-eula').checked) {
      appendHostLog('Отметь согласие с EULA Minecraft, чтобы запустить сервер.');
      return;
    }
    settings = await launcher.saveSettings({ serverMemoryMb: +$('srvmem').value });
    $('host-log').textContent = '';
    $('host-claim').classList.add('hidden');
    $('host-address-row').classList.add('hidden');
    launcher.hostStart({ eulaAccepted: true });
  } else {
    launcher.hostStop();
  }
}

const HOST_STATUS_TEXT = {
  idle: 'Остановлен',
  preparing: 'Готовлю файлы сервера…',
  starting: 'Запуск сервера…',
  ready: 'Сервер готов — можно заходить',
  stopping: 'Останавливаю…'
};

function applyHostStatus(status) {
  hostStatus = status || 'idle';
  $('host-status-text').textContent = HOST_STATUS_TEXT[hostStatus] || hostStatus;
  const wrap = document.querySelector('.host-status');
  wrap.classList.toggle('ready', hostStatus === 'ready');
  wrap.classList.toggle('busy', ['preparing', 'starting', 'stopping'].includes(hostStatus));
  const btn = $('btn-host-toggle');
  btn.textContent = hostStatus === 'idle' ? 'Запустить' : 'Остановить';
  btn.disabled = hostStatus === 'preparing' || hostStatus === 'stopping';
  if (hostStatus === 'idle') $('host-address-row').classList.add('hidden');
}

function appendHostLog(line) {
  const el = $('host-log');
  el.textContent += (el.textContent ? '\n' : '') + line;
  const lines = el.textContent.split('\n');
  if (lines.length > 200) el.textContent = lines.slice(-200).join('\n');
  el.scrollTop = el.scrollHeight;
}

function setPlayState(mode, label) {
  running = mode !== 'idle';
  const btn = $('btn-play');
  btn.disabled = running;
  btn.textContent = mode === 'running' ? 'В ИГРЕ' : mode === 'busy' ? 'ЗАГРУЗКА…' : 'ИГРАТЬ';
  $('progress-label').textContent = label;
  if (mode === 'idle') $('bar-fill').style.width = '0%';
  if (mode === 'running') $('bar-fill').style.width = '100%';
}

function fmtMem(mb) { return (mb / 1024) + ' ГБ'; }

function applyFx() {
  if (!window.fxControl) return;
  window.fxControl.setDominoes(settings.dominoes !== false);
  window.fxControl.setSounds(settings.sounds !== false);
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function cleanError(e) {
  return String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
