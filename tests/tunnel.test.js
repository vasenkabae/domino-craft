import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { pickPlayitAsset, parsePlayitClaim, PlayitTunnel } from '../src/main/tunnel';

describe('pickPlayitAsset', () => {
  it('выбирает Windows x64 exe', () => {
    const assets = [
      { name: 'playit-linux-x86_64', browser_download_url: 'u1' },
      { name: 'playit-windows-x86_64-signed.exe', browser_download_url: 'u2' },
      { name: 'playit-darwin-arm64', browser_download_url: 'u3' }
    ];
    expect(pickPlayitAsset(assets).browser_download_url).toBe('u2');
  });

  it('падает на любой Windows exe, если точного нет', () => {
    const assets = [{ name: 'playit-win.exe', browser_download_url: 'u1' }];
    expect(pickPlayitAsset(assets).browser_download_url).toBe('u1');
  });

  it('нет подходящего — null', () => {
    expect(pickPlayitAsset([{ name: 'playit-linux', browser_download_url: 'u' }])).toBe(null);
    expect(pickPlayitAsset([])).toBe(null);
  });
});

describe('parsePlayitClaim', () => {
  it('находит claim-ссылку', () => {
    expect(parsePlayitClaim('visit https://playit.gg/claim/abc123 to set up'))
      .toBe('https://playit.gg/claim/abc123');
  });
  it('нет ссылки — null', () => {
    expect(parsePlayitClaim('agent started')).toBe(null);
  });
});

describe('PlayitTunnel', () => {
  function fakeProc() {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = vi.fn();
    return proc;
  }

  it('эмитит claim и address из вывода', async () => {
    const proc = fakeProc();
    const tunnel = new PlayitTunnel({ spawn: () => proc });
    const claims = [];
    const addresses = [];
    tunnel.on('claim', u => claims.push(u));
    tunnel.on('address', a => addresses.push(a));

    tunnel.start('playit.exe');
    proc.stdout.emit('data', Buffer.from('open https://playit.gg/claim/xyz\n'));
    proc.stdout.emit('data', Buffer.from('tunnel ready: my-domino.playit.gg\n'));

    expect(claims).toEqual(['https://playit.gg/claim/xyz']);
    expect(addresses).toEqual(['my-domino.playit.gg']);
  });

  it('stop убивает процесс', () => {
    const proc = fakeProc();
    const tunnel = new PlayitTunnel({ spawn: () => proc });
    tunnel.start('playit.exe');
    tunnel.stop();
    expect(proc.kill).toHaveBeenCalled();
  });
});
