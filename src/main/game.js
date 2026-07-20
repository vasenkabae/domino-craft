const path = require('path');
const fs = require('fs/promises');
const { Client } = require('minecraft-launcher-core');
const { fetchManifest } = require('./manifest');
const { planSync, buildLocalIndex } = require('./sync');
const { downloadFile } = require('./downloader');
const { resolveJavaMajor, ensureJava } = require('./java');
const { ensureFabric, ensureForge } = require('./loaders');
const { buildLaunchOptions } = require('./launch-options');
const { getVanillaVersions } = require('./vanilla');

// Полный цикл запуска. Режим из настроек: 'pack' — наш сервер со сборкой,
// 'vanilla' — обычный Minecraft выбранной версии (отдельная папка, без модов).
// emit(channel, payload) шлёт события 'progress' и 'state' в окно.
async function play({ config, settings, auth, paths, emit, deviceToken }) {
  if (settings.mode === 'vanilla') return playVanilla({ settings, auth, paths, emit });
  return playPack({ config, settings, auth, paths, emit, deviceToken });
}

async function playVanilla({ settings, auth, paths, emit }) {
  const { userData } = paths;
  emit('state', { value: 'syncing' });
  const { latest } = await getVanillaVersions(path.join(userData, 'versions.cache.json'));
  const version = settings.vanillaVersion || latest;
  if (!version) throw new Error('Не удалось получить список версий Minecraft');

  const javaPath = await ensureJava(
    await resolveJavaMajor(version, userData),
    userData,
    label => emit('progress', { phase: 'java', current: 0, total: 0, label })
  );

  const opts = buildLaunchOptions({
    manifest: { minecraft: version, files: [] },
    auth,
    memoryMb: settings.memoryMb,
    root: path.join(userData, 'vanilla'),
    javaPath,
    fullscreen: settings.fullscreen,
    resolution: { width: settings.resWidth, height: settings.resHeight }
  });
  await launchClient(opts, emit);
}

async function playPack({ config, settings, auth, paths, emit, deviceToken }) {
  const { userData } = paths;
  const root = settings.gameDir || path.join(userData, 'game');

  if (deviceToken) {
    // Кнопка «Переподключиться» в моде (DominoCitiesUI) сама предъявляет этот токен
    // серверу при реконнекте после дисконнекта/кика/краша — чтобы не лезть в лаунчер.
    await fs.mkdir(path.join(root, 'config'), { recursive: true });
    await fs.writeFile(path.join(root, 'config', 'dominocraft-session.txt'), `${auth.name}\n${deviceToken}`);
  }

  emit('state', { value: 'syncing' });
  const { manifest, offline } = await fetchManifest(
    config.manifestUrl,
    path.join(userData, 'manifest.cache.json')
  );
  if (offline) {
    emit('state', { value: 'syncing', message: 'Нет связи с GitHub — играем на текущей версии сборки' });
  }

  const dirs = [...new Set([...manifest.files.map(f => f.path.split('/')[0]), 'mods'])];
  const localIndex = await buildLocalIndex(root, dirs);
  const { downloads, deletions } = planSync(manifest, localIndex);
  for (const p of deletions) await fs.rm(path.join(root, p), { force: true });
  let done = 0;
  for (const f of downloads) {
    emit('progress', { phase: 'sync', current: ++done, total: downloads.length, label: f.path });
    await downloadFile(f.url, path.join(root, f.path), f.sha1);
  }

  const javaPath = await ensureJava(
    await resolveJavaMajor(manifest.minecraft, userData),
    userData,
    label => emit('progress', { phase: 'java', current: 0, total: 0, label })
  );

  let customVersion = null;
  let forgeInstaller = null;
  const loader = manifest.loader || { type: 'vanilla' };
  if (loader.type === 'fabric') {
    customVersion = await ensureFabric(root, manifest.minecraft, loader.version);
  } else if (loader.type === 'forge') {
    forgeInstaller = await ensureForge(userData, loader.installerUrl);
  }

  const opts = buildLaunchOptions({
    manifest,
    auth,
    memoryMb: settings.memoryMb,
    root,
    javaPath,
    customVersion,
    forgeInstaller,
    fullscreen: settings.fullscreen,
    resolution: { width: settings.resWidth, height: settings.resHeight }
  });
  await launchClient(opts, emit);
}

async function launchClient(opts, emit) {
  emit('state', { value: 'launching' });
  const launcher = new Client();
  const logTail = [];
  launcher.on('progress', e =>
    emit('progress', { phase: 'game', current: e.task, total: e.total, label: String(e.type) })
  );
  launcher.on('data', line => {
    logTail.push(String(line));
    if (logTail.length > 80) logTail.shift();
  });

  const proc = await launcher.launch(opts);
  if (!proc) throw new Error('Игра не запустилась. Лог:\n' + logTail.join(''));
  emit('state', { value: 'running' });

  proc.on('close', code => {
    if (code === 0 || code === null) emit('state', { value: 'idle' });
    else emit('state', {
      value: 'error',
      message: `Игра завершилась с ошибкой (код ${code}).\n\n` + logTail.join('')
    });
  });
}

module.exports = { play };
