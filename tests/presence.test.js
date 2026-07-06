import { describe, it, expect } from 'vitest';
import { computePresence, pollPresence } from '../src/main/presence';

const FRIENDS = [{ nick: 'Petya' }, { nick: 'Vasya' }, { nick: 'Kolya' }];

describe('computePresence', () => {
  it('помечает друга онлайн по совпадению ника без учёта регистра', () => {
    const servers = [
      { label: 'Наш', online: true, players: 2, max: 20, sample: ['petya', 'Stranger'] }
    ];
    const r = computePresence(FRIENDS, servers);
    expect(r.friends.find(f => f.nick === 'Petya')).toMatchObject({ online: true, server: 'Наш' });
    expect(r.friends.find(f => f.nick === 'Vasya')).toMatchObject({ online: false, server: null });
  });

  it('оффлайн-сервер не даёт онлайна', () => {
    const servers = [{ label: 'Наш', online: false }];
    const r = computePresence(FRIENDS, servers);
    expect(r.friends.every(f => !f.online)).toBe(true);
  });

  it('урезанный sample помечается как неполный', () => {
    const servers = [
      { label: 'Наш', online: true, players: 15, max: 20, sample: ['Petya'] }
    ];
    const r = computePresence(FRIENDS, servers);
    expect(r.servers[0].sampleComplete).toBe(false); // 1 ник < 15 игроков
    // Petya всё равно виден, раз попал в выборку
    expect(r.friends.find(f => f.nick === 'Petya').online).toBe(true);
  });

  it('полный sample помечается как полный', () => {
    const servers = [
      { label: 'Наш', online: true, players: 1, max: 20, sample: ['Petya'] }
    ];
    const r = computePresence(FRIENDS, servers);
    expect(r.servers[0].sampleComplete).toBe(true);
  });

  it('пустой сервер (0 игроков) — sample полный', () => {
    const servers = [{ label: 'Наш', online: true, players: 0, max: 20, sample: [] }];
    const r = computePresence(FRIENDS, servers);
    expect(r.servers[0].sampleComplete).toBe(true);
  });
});

describe('pollPresence', () => {
  it('опрашивает все серверы и собирает presence', async () => {
    const watched = [
      { label: 'Наш', host: 'a', port: 25565 },
      { label: 'Второй', host: 'b', port: 25565 }
    ];
    const getStatus = async host => {
      if (host === 'a') return { online: true, players: 1, max: 20, sample: ['Vasya'] };
      return { online: false };
    };
    const r = await pollPresence(FRIENDS, watched, getStatus);
    expect(r.friends.find(f => f.nick === 'Vasya')).toMatchObject({ online: true, server: 'Наш' });
    expect(r.servers).toHaveLength(2);
  });

  it('падение пинга одного сервера не роняет остальные', async () => {
    const watched = [
      { label: 'Живой', host: 'a', port: 25565 },
      { label: 'Мёртвый', host: 'b', port: 25565 }
    ];
    const getStatus = async host => {
      if (host === 'b') throw new Error('нет сети');
      return { online: true, players: 1, max: 20, sample: ['Petya'] };
    };
    const r = await pollPresence(FRIENDS, watched, getStatus);
    expect(r.friends.find(f => f.nick === 'Petya').online).toBe(true);
    expect(r.servers.find(s => s.label === 'Мёртвый')).toMatchObject({ online: false });
  });
});
