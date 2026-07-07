import { describe, it, expect } from 'vitest';
import {
  serverProperties,
  whitelistJson,
  isReadyLine,
  parsePlayitAddress,
  pickPort,
  hostProfileDir
} from '../src/main/host-config';
import { offlineUuid } from '../src/main/offline-auth';

describe('serverProperties', () => {
  it('офлайн-режим и вайтлист включены', () => {
    const p = serverProperties({ port: 25565 });
    expect(p).toMatch(/online-mode=false/);
    expect(p).toMatch(/white-list=true/);
    expect(p).toMatch(/enforce-whitelist=true/);
    expect(p).toMatch(/server-port=25565/);
  });

  it('вайтлист можно выключить', () => {
    const p = serverProperties({ port: 25565, whitelist: false });
    expect(p).toMatch(/white-list=false/);
    expect(p).toMatch(/enforce-whitelist=false/);
  });

  it('прокидывает motd, порт и лимит игроков', () => {
    const p = serverProperties({ port: 25570, motd: 'Привет', maxPlayers: 8 });
    expect(p).toMatch(/server-port=25570/);
    expect(p).toMatch(/motd=Привет/);
    expect(p).toMatch(/max-players=8/);
  });
});

describe('whitelistJson', () => {
  it('строит записи с офлайн-UUID и ником', () => {
    const json = JSON.parse(whitelistJson(['Petya', 'Vasya']));
    expect(json).toHaveLength(2);
    expect(json[0]).toEqual({ uuid: offlineUuid('Petya'), name: 'Petya' });
  });

  it('дедуплицирует ники без учёта регистра', () => {
    const json = JSON.parse(whitelistJson(['Petya', 'petya', '  PETYA ']));
    expect(json).toHaveLength(1);
  });

  it('пустой список — пустой массив', () => {
    expect(JSON.parse(whitelistJson([]))).toEqual([]);
  });
});

describe('isReadyLine', () => {
  it('ловит строку готовности сервера', () => {
    expect(isReadyLine('[12:00:00] [Server thread/INFO]: Done (12.345s)! For help, type "help"')).toBe(true);
  });
  it('обычные строки не проходят', () => {
    expect(isReadyLine('[12:00:00] [Server thread/INFO]: Preparing spawn area: 42%')).toBe(false);
  });
});

describe('parsePlayitAddress', () => {
  it('вытаскивает адрес .playit.gg', () => {
    expect(parsePlayitAddress('tunnel active at happy-domino.playit.gg')).toBe('happy-domino.playit.gg');
  });
  it('вытаскивает адрес с портом', () => {
    expect(parsePlayitAddress('=> friendly-name.ply.gg:53812')).toBe('friendly-name.ply.gg:53812');
  });
  it('нет адреса — null', () => {
    expect(parsePlayitAddress('starting agent...')).toBe(null);
  });
});

describe('hostProfileDir', () => {
  it('сборка — в базовой папке', () => {
    expect(hostProfileDir('C:/data/host-server', null)).toBe('C:/data/host-server');
  });
  it('ванильная версия — в своей папке', () => {
    expect(hostProfileDir('C:/data/host-server', '25.1')).toBe('C:/data/host-server-vanilla-25.1');
  });
});

describe('pickPort', () => {
  it('возвращает предпочтительный, если свободен', async () => {
    const port = await pickPort(25565, async () => true);
    expect(port).toBe(25565);
  });
  it('ищет следующий свободный', async () => {
    const busy = new Set([25565, 25566]);
    const port = await pickPort(25565, async p => !busy.has(p));
    expect(port).toBe(25567);
  });
  it('бросает, если рядом всё занято', async () => {
    await expect(pickPort(25565, async () => false)).rejects.toThrow(/порт/);
  });
});
