const $ = id => document.getElementById(id);

let settings = { memoryMb: 4096 };
let running = false;
let chosenSkinPath = null;

init();

async function init() {
  const state = await launcher.getState();
  settings = state.settings;
  applyFx();
  $('title-login').textContent = state.config.name;
  $('title-main').textContent = state.config.name;
  document.title = state.config.name;
  if (state.version) $('app-version').textContent = 'v' + state.version;

  // Замок доступа: пока не введена ссылка из Discord — дальше не пускаем
  if (state.access && state.access.required && !state.access.unlocked) {
    showGate(state.session);
  } else if (state.session) {
    showMain(state.session);
  } else {
    $('login').classList.remove('hidden');
  }

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
  $('btn-open-dir').onclick = () => launcher.openGameDir();

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

  $('btn-skin').onclick = openSkin;
  $('btn-close-skin').onclick = () => $('skin-modal').classList.add('hidden');
  $('btn-choose-skin').onclick = chooseSkinFile;
  $('btn-apply-skin').onclick = applyChosenSkin;

  launcher.onProgress(p => {
    const label = p.phase === 'sync' ? `Сборка: ${p.label} (${p.current}/${p.total})`
      : p.phase === 'java' ? p.label
      : `Файлы игры: ${p.label} (${Math.min(p.current, p.total)}/${p.total})`;
    $('progress-label').textContent = label;
    $('bar-fill').style.width = p.total ? Math.round(p.current / p.total * 100) + '%' : '30%';
  });

  // Модалки закрываются по Esc и клику по затемнению (настройки при этом сохраняются)
  const closeTopModal = () => {
    const open = document.querySelector('.modal:not(.hidden)');
    if (!open) return false;
    if (open.id === 'settings-modal') $('btn-close-settings').click();
    else open.classList.add('hidden');
    return true;
  };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTopModal(); });
  for (const m of document.querySelectorAll('.modal')) {
    m.addEventListener('mousedown', e => { if (e.target === m) closeTopModal(); });
  }

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

function showGate(session) {
  $('login').classList.add('hidden');
  $('main').classList.add('hidden');
  $('gate').classList.remove('hidden');
  const submit = async () => {
    $('btn-gate').disabled = true;
    $('gate-error').textContent = '';
    const r = await launcher.accessSubmit($('gate-link').value);
    $('btn-gate').disabled = false;
    if (r.unlocked) {
      $('gate').classList.add('hidden');
      if (session) showMain(session);
      else $('login').classList.remove('hidden');
    } else if (r.offline) {
      $('gate-error').textContent = 'Нет связи с сервером — попробуй чуть позже.';
    } else {
      $('gate-error').textContent = 'Неверный или истёкший код. Возьми новый: /linkcraft в Discord.';
    }
  };
  $('btn-gate').onclick = submit;
  $('gate-link').onkeydown = e => { if (e.key === 'Enter') submit(); };
}

function showMain(session) {
  $('login').classList.add('hidden');
  $('main').classList.remove('hidden');
  $('user-name').textContent = session.name;
  refreshStatus();
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

function openSkin() {
  chosenSkinPath = null;
  $('skin-error').textContent = '';
  $('btn-apply-skin').disabled = true;
  clearSkinPreview();
  $('skin-modal').classList.remove('hidden');
}

async function chooseSkinFile() {
  const res = await launcher.chooseSkin();
  if (!res) return;
  if (res.error) {
    $('skin-error').textContent = res.error;
    $('btn-apply-skin').disabled = true;
    clearSkinPreview();
    return;
  }
  $('skin-error').textContent = '';
  chosenSkinPath = res.filePath;
  $('btn-apply-skin').disabled = false;
  drawSkinPreview(res.dataUrl);
}

function clearSkinPreview() {
  for (const id of ['skin-preview-front', 'skin-preview-back']) {
    const ctx = $(id).getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
  }
}

function drawSkinPreview(dataUrl) {
  const img = new Image();
  img.onload = () => {
    drawSkinCrop('skin-preview-front', img, 8, 8, 8, 8);
    drawSkinCrop('skin-preview-back', img, 24, 8, 8, 8);
  };
  img.src = dataUrl;
}

function drawSkinCrop(canvasId, img, sx, sy, sw, sh) {
  const canvas = $(canvasId);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
}

async function applyChosenSkin() {
  if (!chosenSkinPath) return;
  $('btn-apply-skin').disabled = true;
  try {
    await launcher.applySkin(chosenSkinPath);
    $('skin-modal').classList.add('hidden');
  } catch (e) {
    $('skin-error').textContent = e.message;
  } finally {
    $('btn-apply-skin').disabled = false;
  }
}
