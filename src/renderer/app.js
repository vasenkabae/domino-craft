const $ = id => document.getElementById(id);

let settings = { memoryMb: 4096 };
let running = false;

init();

async function init() {
  const state = await launcher.getState();
  settings = state.settings;
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

  $('btn-settings').onclick = () => {
    $('mem').value = settings.memoryMb;
    $('mem-label').textContent = fmtMem(settings.memoryMb);
    $('settings-modal').classList.remove('hidden');
  };
  $('mem').oninput = e => { $('mem-label').textContent = fmtMem(+e.target.value); };
  $('btn-close-settings').onclick = async () => {
    settings = await launcher.saveSettings({ memoryMb: +$('mem').value });
    $('settings-modal').classList.add('hidden');
  };
  $('btn-logout').onclick = async () => {
    await launcher.logout();
    location.reload();
  };

  $('btn-close-error').onclick = () => $('error-modal').classList.add('hidden');
  $('btn-copy-error').onclick = () => navigator.clipboard.writeText($('error-text').textContent);

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

function cleanError(e) {
  return String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
