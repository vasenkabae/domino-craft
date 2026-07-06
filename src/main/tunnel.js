const { EventEmitter } = require('events');
const fssync = require('fs');
const { spawn: realSpawn } = require('child_process');
const { downloadFile } = require('./downloader');
const { parsePlayitAddress } = require('./host-config');

const RELEASES_API = 'https://api.github.com/repos/playit-cloud/playit-agent/releases/latest';

// Выбирает Windows x64 .exe из ассетов релиза playit.
function pickPlayitAsset(assets) {
  const exes = (assets || []).filter(a => /\.exe$/i.test(a.name));
  return exes.find(a => /(windows|win).*(x86_64|x64|amd64)/i.test(a.name))
    || exes.find(a => /windows|win/i.test(a.name))
    || null;
}

// Ссылка первичной привязки агента к аккаунту playit.
const CLAIM_RE = /(https:\/\/playit\.gg\/[^\s]+)/i;
function parsePlayitClaim(line) {
  const m = String(line).match(CLAIM_RE);
  return m ? m[1] : null;
}

async function defaultFetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'domino-craft-launcher' } });
  if (!res.ok) throw new Error('GitHub API playit: HTTP ' + res.status);
  return res.json();
}

// Скачивает агент playit по требованию (как Java/Forge), если его ещё нет.
async function ensurePlayit(binPath, fetchJson = defaultFetchJson) {
  if (fssync.existsSync(binPath)) return binPath;
  const release = await fetchJson(RELEASES_API);
  const asset = pickPlayitAsset(release.assets);
  if (!asset) throw new Error('playit: не найден Windows-бинарник в последнем релизе');
  await downloadFile(asset.browser_download_url, binPath);
  return binPath;
}

// Управляет процессом агента playit: события 'claim', 'address', 'log', 'exit'.
class PlayitTunnel extends EventEmitter {
  constructor({ spawn = realSpawn } = {}) {
    super();
    this._spawn = spawn;
    this.proc = null;
    this.address = null;
  }

  start(binPath, args = []) {
    this.proc = this._spawn(binPath, args);
    const onLine = buf => {
      for (const line of String(buf).split(/\r?\n/)) {
        if (!line.trim()) continue;
        this.emit('log', line);
        const claim = parsePlayitClaim(line);
        if (claim) this.emit('claim', claim);
        const addr = parsePlayitAddress(line);
        if (addr && addr !== this.address) {
          this.address = addr;
          this.emit('address', addr);
        }
      }
    };
    this.proc.stdout && this.proc.stdout.on('data', onLine);
    this.proc.stderr && this.proc.stderr.on('data', onLine);
    this.proc.on && this.proc.on('exit', code => this.emit('exit', code));
    return this.proc;
  }

  stop() {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }
}

module.exports = { pickPlayitAsset, parsePlayitClaim, ensurePlayit, PlayitTunnel };
