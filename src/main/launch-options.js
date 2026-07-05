// Собирает опции для minecraft-launcher-core.
// Автоподключение к серверу: quickPlay работает с 1.20+,
// для более старых версий — классические аргументы --server/--port.
function buildLaunchOptions({ manifest, auth, memoryMb, root, javaPath, customVersion, forgeInstaller, fullscreen, resolution }) {
  const opts = {
    authorization: auth,
    root,
    javaPath,
    version: { number: manifest.minecraft, type: 'release' },
    memory: { max: `${memoryMb}M`, min: '1024M' },
    overrides: { detached: false }
  };
  if (customVersion) opts.version.custom = customVersion;
  if (forgeInstaller) opts.forge = forgeInstaller;

  // Размер окна / полноэкранный режим игры
  if (fullscreen) {
    opts.window = { fullscreen: true };
  } else if (resolution && resolution.width && resolution.height) {
    opts.window = { width: resolution.width, height: resolution.height };
  }

  const srv = manifest.server;
  if (srv && srv.host) {
    const minor = parseInt(manifest.minecraft.split('.')[1], 10) || 0;
    const port = srv.port || 25565;
    if (minor >= 20) {
      opts.quickPlay = { type: 'multiplayer', identifier: `${srv.host}:${port}` };
    } else {
      opts.customLaunchArgs = ['--server', srv.host, '--port', String(port)];
    }
  }
  return opts;
}

module.exports = { buildLaunchOptions };
