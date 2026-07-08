import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { matchesAccess, verifyRemote, loadAccess, saveAccess } from '../src/main/access';

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

describe('verifyRemote', () => {
  const okFetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
  const wrongFetch = async () => ({ ok: true, json: async () => ({ ok: false }) });
  const downFetch = async () => { throw new Error('нет сети'); };

  it('верный код — unlocked', async () => {
    const r = await verifyRemote('http://x/verify', ' abc123 ', okFetch);
    expect(r).toEqual({ ok: true, network: true });
  });

  it('неверный код — отказ, но сервер ответил', async () => {
    const r = await verifyRemote('http://x/verify', 'bad', wrongFetch);
    expect(r).toEqual({ ok: false, network: true });
  });

  it('сервер недоступен — network: false', async () => {
    const r = await verifyRemote('http://x/verify', 'abc', downFetch);
    expect(r).toEqual({ ok: false, network: false });
  });

  it('пустой ввод — отказ без похода в сеть', async () => {
    let called = false;
    const spy = async () => { called = true; return { ok: true, json: async () => ({ ok: true }) }; };
    const r = await verifyRemote('http://x/verify', '   ', spy);
    expect(r.ok).toBe(false);
    expect(called).toBe(false);
  });

  it('отправляет код в JSON-теле POST', async () => {
    let sent = null;
    const spy = async (_url, opts) => { sent = JSON.parse(opts.body); return { ok: true, json: async () => ({ ok: true }) }; };
    await verifyRemote('http://x/verify', 'AbC12345', spy);
    expect(sent).toEqual({ code: 'AbC12345' });
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
