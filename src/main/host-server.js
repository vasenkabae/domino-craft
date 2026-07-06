const { EventEmitter } = require('events');
const fs = require('fs/promises');
const path = require('path');
const { spawn: realSpawn } = require('child_process');
const { downloadFile } = require('./downloader');
const { planSync, buildLocalIndex } = require('./sync');
const { requiredJavaMajor, ensureJava } = require('./java');
const { getServerDownload } = require('./vanilla');
const { serverProperties, whitelistJson, isReadyLine } = require('./host-config');

// Аргументы java для запуска сервера. Xms не больше Xmx и не выше 1 ГБ.
function buildServerArgs(memoryMb, jarName) {
  const xms = Math.min(memoryMb, 1024);
  return [`-Xmx${memoryMb}M`, `-Xms${xms}M`, '-jar', jarName, 'nogui'];
}

// Fabric-сервер: единый лаунчер-jar из meta (сам подтянет vanilla-ядро рядом).
async function installFabricServer(dir, mc, loaderVersion, onProgress) {
  const jarName = 'fabric-server-launch.jar';
  onProgress('Установка Fabric-сервера');
  const url = `https://meta.fabricmc.net/v2/versions/loader/${mc}/${loaderVersion}/server/jar`;
  await downloadFile(url, path.join(dir, jarName));
  return jarName;
}

// Подготовка всех файлов сервера. Возвращает { dir, jarName, javaExe } для start().
// eulaAccepted обязателен — молча ставить eula=true нельзя (согласие пользователя).
async function prepareServerFiles({ manifest, userData, dir, nicks, motd, port, eulaAccepted, onProgress = () => {} }) {
  if (!eulaAccepted) throw new Error('Нужно принять EULA Mojang, чтобы запустить сервер');

  await fs.mkdir(path.join(dir, 'mods'), { recursive: true });
  await fs.writeFile(path.join(dir, 'eula.txt'), 'eula=true\n');
  await fs.writeFile(path.join(dir, 'server.properties'), serverProperties({ port, motd }));
  await fs.writeFile(path.join(dir, 'whitelist.json'), whitelistJson(nicks));

  // Ванильное серверное ядро нужно в любом случае (Fabric стартует поверх него).
  const serverDl = await getServerDownload(manifest.minecraft, path.join(userData, 'versions.cache.json'));
  if (!serverDl) throw new Error('Не удалось получить серверный jar для ' + manifest.minecraft);
  onProgress('Скачивание серверного ядра');
  await downloadFile(serverDl.url, path.join(dir, 'server.jar'), serverDl.sha1);

  // Синхронизация модов (только mods/ — клиентские ресурсы серверу не нужны).
  const localIndex = await buildLocalIndex(dir, ['mods']);
  const { downloads, deletions } = planSync(manifest, localIndex);
  for (const p of deletions) await fs.rm(path.join(dir, p), { force: true });
  const mods = downloads.filter(f => f.path.startsWith('mods/'));
  let done = 0;
  for (const f of mods) {
    onProgress(`Моды: ${f.path} (${++done}/${mods.length})`);
    await downloadFile(f.url, path.join(dir, f.path), f.sha1);
  }

  // Серверная сторона загрузчика.
  const loader = manifest.loader || { type: 'vanilla' };
  let jarName = 'server.jar';
  if (loader.type === 'fabric') {
    jarName = await installFabricServer(dir, manifest.minecraft, loader.version, onProgress);
  } else if (loader.type === 'forge') {
    // Forge-сервер ставится через installer --installServer и версионно-зависимый запуск.
    // Пока не поддержан в один клик — требуется живой прогон под конкретную версию модпака.
    throw new Error('Хостинг Forge-сервера с ПК пока не поддержан. Для сервера с ПК выбери Fabric.');
  }

  const javaw = await ensureJava(requiredJavaMajor(manifest.minecraft), userData, onProgress);
  const javaExe = path.join(path.dirname(javaw), 'java.exe');
  return { dir, jarName, javaExe };
}

// Управляет процессом сервера: статусы idle→starting→ready→stopping, лог, счётчик игроков.
class HostServer extends EventEmitter {
  constructor({ spawn = realSpawn } = {}) {
    super();
    this._spawn = spawn;
    this.proc = null;
    this.status = 'idle';
    this.logTail = [];
  }

  _setStatus(s) {
    this.status = s;
    this.emit('status', s);
  }

  _log(line) {
    this.logTail.push(line);
    if (this.logTail.length > 120) this.logTail.shift();
    this.emit('log', line);
  }

  start({ javaExe, dir, jarName = 'server.jar', memoryMb = 2048 }) {
    this._setStatus('starting');
    this.proc = this._spawn(javaExe, buildServerArgs(memoryMb, jarName), { cwd: dir });

    const onLine = buf => {
      for (const line of String(buf).split(/\r?\n/)) {
        if (!line.trim()) continue;
        this._log(line);
        if (this.status === 'starting' && isReadyLine(line)) this._setStatus('ready');
      }
    };
    this.proc.stdout && this.proc.stdout.on('data', onLine);
    this.proc.stderr && this.proc.stderr.on('data', onLine);
    this.proc.on('exit', code => {
      this._setStatus('idle');
      this.emit('exit', code);
    });
    return this.proc;
  }

  // Мягкая остановка командой stop; по таймауту — принудительно, чтобы не потерять мир.
  async stop({ timeoutMs = 10000 } = {}) {
    if (!this.proc) return;
    this._setStatus('stopping');
    try { this.proc.stdin && this.proc.stdin.write('stop\n'); } catch { /* уже закрыт */ }
    await new Promise(resolve => {
      const timer = setTimeout(() => {
        try { this.proc && this.proc.kill(); } catch { /* уже мёртв */ }
        resolve();
      }, timeoutMs);
      this.proc.on('exit', () => { clearTimeout(timer); resolve(); });
    });
    this.proc = null;
  }
}

module.exports = { HostServer, buildServerArgs, prepareServerFiles, installFabricServer };
