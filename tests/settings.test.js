import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { loadSettings, saveSettings, DEFAULTS } from '../src/main/settings';

describe('settings', () => {
  it('дефолты, если файла нет', async () => {
    const s = await loadSettings(path.join(os.tmpdir(), 'no-such-settings.json'));
    expect(s).toEqual(DEFAULTS);
  });
  it('сохраняет патч и мёржит с дефолтами', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-set-'));
    const file = path.join(dir, 'settings.json');
    await saveSettings(file, { memoryMb: 8192 });
    const s = await loadSettings(file);
    expect(s.memoryMb).toBe(8192);
    await fs.rm(dir, { recursive: true, force: true });
  });
  it('старый файл настроек дополняется новыми дефолтами', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-set-'));
    const file = path.join(dir, 'settings.json');
    await fs.writeFile(file, JSON.stringify({ memoryMb: 6144 })); // без новых полей
    const s = await loadSettings(file);
    expect(s.memoryMb).toBe(6144);
    expect(s.resWidth).toBe(DEFAULTS.resWidth);
    expect(s.afterLaunch).toBe('minimize');
    expect(s.dominoes).toBe(true);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
