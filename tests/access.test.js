import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { matchesAccess, loadAccess, saveAccess } from '../src/main/access';

describe('matchesAccess', () => {
  it('принимает точный код без учёта регистра и пробелов', () => {
    expect(matchesAccess('linkdtcraft', 'linkdtcraft')).toBe(true);
    expect(matchesAccess('  LinkDtCraft ', 'linkdtcraft')).toBe(true);
  });

  it('принимает полную ссылку Discord с кодом', () => {
    expect(matchesAccess('https://discord.gg/linkdtcraft', 'linkdtcraft')).toBe(true);
    expect(matchesAccess('discord.gg/linkdtcraft', 'linkdtcraft')).toBe(true);
  });

  it('отклоняет неверный код', () => {
    expect(matchesAccess('random', 'linkdtcraft')).toBe(false);
    expect(matchesAccess('', 'linkdtcraft')).toBe(false);
  });

  it('без заданного ключа доступ открыт', () => {
    expect(matchesAccess('что угодно', '')).toBe(true);
    expect(matchesAccess('', null)).toBe(true);
  });
});

describe('loadAccess/saveAccess', () => {
  it('по умолчанию не разблокирован', async () => {
    const r = await loadAccess(path.join(os.tmpdir(), 'no-such-access.json'));
    expect(r.unlocked).toBe(false);
  });

  it('сохраняет и читает разблокировку', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-acc-'));
    const file = path.join(dir, 'access.json');
    await saveAccess(file, true);
    expect((await loadAccess(file)).unlocked).toBe(true);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
