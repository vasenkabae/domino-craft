const fs = require('fs/promises');
const path = require('path');

const DEFAULTS = {
  memoryMb: 4096,
  mode: 'pack',
  vanillaVersion: null,
  gameDir: null,
  fullscreen: false,
  resWidth: 854,
  resHeight: 480,
  afterLaunch: 'minimize', // 'keep' | 'minimize' | 'close'
  dominoes: true,
  sounds: true
};

async function loadSettings(file) {
  try {
    return { ...DEFAULTS, ...JSON.parse(await fs.readFile(file, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

async function saveSettings(file, patch) {
  const next = { ...(await loadSettings(file)), ...patch };
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(next, null, 2));
  return next;
}

module.exports = { loadSettings, saveSettings, DEFAULTS };
