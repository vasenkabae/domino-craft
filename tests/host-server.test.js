import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { HostServer, buildServerArgs, fabricServerJarUrl } from '../src/main/host-server';

describe('buildServerArgs', () => {
  it('строит аргументы java с памятью и nogui', () => {
    const args = buildServerArgs(2048, 'server.jar');
    expect(args).toContain('-Xmx2048M');
    expect(args).toContain('-jar');
    expect(args).toContain('server.jar');
    expect(args).toContain('nogui');
  });
});

describe('fabricServerJarUrl', () => {
  it('включает игру, загрузчик и установщик в путь', () => {
    expect(fabricServerJarUrl('26.2', '0.19.3', '1.1.1'))
      .toBe('https://meta.fabricmc.net/v2/versions/loader/26.2/0.19.3/1.1.1/server/jar');
  });
});

function fakeProc() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { write: vi.fn() };
  proc.kill = vi.fn();
  return proc;
}

describe('HostServer жизненный цикл', () => {
  it('статусы starting → ready по строке готовности', () => {
    const proc = fakeProc();
    const srv = new HostServer({ spawn: () => proc });
    const statuses = [];
    srv.on('status', s => statuses.push(s));

    srv.start({ javaExe: 'java.exe', dir: '.', jarName: 'server.jar', memoryMb: 2048 });
    expect(statuses).toContain('starting');

    proc.stdout.emit('data', Buffer.from('[Server thread/INFO]: Done (5.1s)! For help, type "help"\n'));
    expect(srv.status).toBe('ready');
    expect(statuses).toContain('ready');
  });

  it('stop шлёт команду stop и завершается по exit', async () => {
    const proc = fakeProc();
    const srv = new HostServer({ spawn: () => proc });
    srv.start({ javaExe: 'java.exe', dir: '.', jarName: 'server.jar' });

    const p = srv.stop({ timeoutMs: 1000 });
    expect(proc.stdin.write).toHaveBeenCalledWith('stop\n');
    proc.emit('exit', 0); // сервер корректно завершился
    await p;
    expect(proc.kill).not.toHaveBeenCalled();
  });

  it('stop убивает процесс по таймауту', async () => {
    const proc = fakeProc();
    const srv = new HostServer({ spawn: () => proc });
    srv.start({ javaExe: 'java.exe', dir: '.', jarName: 'server.jar' });

    await srv.stop({ timeoutMs: 20 }); // exit не эмитим — должен сработать kill
    expect(proc.kill).toHaveBeenCalled();
  });
});
