import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  loadFriends,
  addFriend,
  removeFriend,
  addWatched,
  removeWatched,
  DEFAULTS
} from '../src/main/friends';

async function tmpFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-fr-'));
  return path.join(dir, 'friends.json');
}

describe('friends', () => {
  it('дефолты, если файла нет', async () => {
    const s = await loadFriends(path.join(os.tmpdir(), 'no-such-friends.json'));
    expect(s).toEqual(DEFAULTS);
  });

  it('добавляет друга и сохраняет', async () => {
    const file = await tmpFile();
    await addFriend(file, 'Petya', 'сосед');
    const s = await loadFriends(file);
    expect(s.friends).toHaveLength(1);
    expect(s.friends[0].nick).toBe('Petya');
    expect(s.friends[0].note).toBe('сосед');
    expect(typeof s.friends[0].addedAt).toBe('number');
  });

  it('не дублирует друга без учёта регистра и пробелов', async () => {
    const file = await tmpFile();
    await addFriend(file, 'Petya');
    const s = await addFriend(file, '  petya  ');
    expect(s.friends).toHaveLength(1);
  });

  it('игнорирует пустой ник', async () => {
    const file = await tmpFile();
    const s = await addFriend(file, '   ');
    expect(s.friends).toHaveLength(0);
  });

  it('удаляет друга без учёта регистра', async () => {
    const file = await tmpFile();
    await addFriend(file, 'Petya');
    const s = await removeFriend(file, 'PETYA');
    expect(s.friends).toHaveLength(0);
  });

  it('добавляет наблюдаемый сервер и не дублирует по host:port', async () => {
    const file = await tmpFile();
    await addWatched(file, { label: 'Наш', host: 'play.example.com', port: 25565 });
    const s = await addWatched(file, { label: 'Другой ярлык', host: 'play.example.com', port: 25565 });
    expect(s.watchedServers).toHaveLength(1);
    expect(s.watchedServers[0].label).toBe('Наш');
  });

  it('удаляет наблюдаемый сервер по host:port', async () => {
    const file = await tmpFile();
    await addWatched(file, { label: 'Наш', host: 'play.example.com', port: 25565 });
    const s = await removeWatched(file, { host: 'play.example.com', port: 25565 });
    expect(s.watchedServers).toHaveLength(0);
  });

  it('старый файл без watchedServers дополняется дефолтом', async () => {
    const file = await tmpFile();
    await fs.writeFile(file, JSON.stringify({ friends: [{ nick: 'Old', addedAt: 1 }] }));
    const s = await loadFriends(file);
    expect(s.friends).toHaveLength(1);
    expect(s.watchedServers).toEqual([]);
  });
});
