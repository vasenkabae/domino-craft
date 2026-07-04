import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { planSync, buildLocalIndex } from '../src/main/sync';

const mf = files => ({ files });

describe('planSync', () => {
  it('качает новые файлы', () => {
    const { downloads } = planSync(mf([{ path: 'mods/a.jar', sha1: 'x' }]), {});
    expect(downloads.map(f => f.path)).toEqual(['mods/a.jar']);
  });
  it('качает изменённые (sha1 не совпал)', () => {
    const { downloads } = planSync(
      mf([{ path: 'mods/a.jar', sha1: 'new' }]),
      { 'mods/a.jar': 'old' }
    );
    expect(downloads).toHaveLength(1);
  });
  it('пропускает совпадающие', () => {
    const { downloads } = planSync(
      mf([{ path: 'mods/a.jar', sha1: 'same' }]),
      { 'mods/a.jar': 'same' }
    );
    expect(downloads).toHaveLength(0);
  });
  it('удаляет лишнее только из mods/', () => {
    const { deletions } = planSync(mf([{ path: 'mods/a.jar', sha1: 'x' }]), {
      'mods/a.jar': 'x',
      'mods/old.jar': 'y',
      'config/user.cfg': 'z',
      'saves/world.dat': 'w'
    });
    expect(deletions).toEqual(['mods/old.jar']);
  });
});

describe('buildLocalIndex', () => {
  it('индексирует файлы с forward-slash путями и sha1', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-test-'));
    await fs.mkdir(path.join(root, 'mods', 'sub'), { recursive: true });
    await fs.writeFile(path.join(root, 'mods', 'sub', 'a.jar'), 'hello');
    const index = await buildLocalIndex(root, ['mods', 'config']);
    // sha1("hello")
    expect(index['mods/sub/a.jar']).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
    await fs.rm(root, { recursive: true, force: true });
  });
  it('не падает, если папки нет', async () => {
    const index = await buildLocalIndex(path.join(os.tmpdir(), 'no-such-dir-12345'), ['mods']);
    expect(index).toEqual({});
  });
});
