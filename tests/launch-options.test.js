import { describe, it, expect } from 'vitest';
import { buildLaunchOptions } from '../src/main/launch-options';

const base = {
  auth: { name: 'v' },
  memoryMb: 4096,
  root: 'C:/game',
  javaPath: 'C:/java/javaw.exe'
};

describe('buildLaunchOptions', () => {
  it('quickPlay для 1.20+', () => {
    const opts = buildLaunchOptions({
      ...base,
      manifest: { minecraft: '1.20.1', server: { host: 'play.example.com', port: 25565 }, files: [] }
    });
    expect(opts.quickPlay).toEqual({ type: 'multiplayer', identifier: 'play.example.com:25565' });
    expect(opts.customLaunchArgs).toBeUndefined();
  });
  it('--server/--port для старых версий', () => {
    const opts = buildLaunchOptions({
      ...base,
      manifest: { minecraft: '1.16.5', server: { host: 'play.example.com' }, files: [] }
    });
    expect(opts.customLaunchArgs).toEqual(['--server', 'play.example.com', '--port', '25565']);
    expect(opts.quickPlay).toBeUndefined();
  });
  it('без сервера — без автоподключения', () => {
    const opts = buildLaunchOptions({ ...base, manifest: { minecraft: '1.20.1', files: [] } });
    expect(opts.quickPlay).toBeUndefined();
    expect(opts.customLaunchArgs).toBeUndefined();
  });
  it('fabric: custom-версия', () => {
    const opts = buildLaunchOptions({
      ...base,
      manifest: { minecraft: '1.20.1', files: [] },
      customVersion: 'fabric-loader-0.16.0-1.20.1'
    });
    expect(opts.version.custom).toBe('fabric-loader-0.16.0-1.20.1');
  });
  it('forge: путь к установщику', () => {
    const opts = buildLaunchOptions({
      ...base,
      manifest: { minecraft: '1.20.1', files: [] },
      forgeInstaller: 'C:/cache/forge-installer.jar'
    });
    expect(opts.forge).toBe('C:/cache/forge-installer.jar');
  });
  it('память из настроек', () => {
    const opts = buildLaunchOptions({ ...base, manifest: { minecraft: '1.20.1', files: [] } });
    expect(opts.memory.max).toBe('4096M');
  });
});
