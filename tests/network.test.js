import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { downloadFile, sha1File } from '../src/main/downloader';
import { fetchManifest } from '../src/main/manifest';

let server;
let baseUrl;
let attempts = 0;
const BODY = Buffer.from('mod content');
const BODY_SHA1 = crypto.createHash('sha1').update(BODY).digest('hex');
const MANIFEST = { packVersion: '1', minecraft: '1.20.1', files: [] };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/ok') return res.end(BODY);
    if (req.url === '/manifest.json') return res.end(JSON.stringify(MANIFEST));
    if (req.url === '/flaky') {
      attempts++;
      if (attempts < 2) { res.statusCode = 500; return res.end('boom'); }
      return res.end(BODY);
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise(r => server.close(r)));

describe('downloadFile', () => {
  it('качает файл и проверяет sha1', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-dl-'));
    const dest = path.join(dir, 'sub', 'a.jar');
    await downloadFile(baseUrl + '/ok', dest, BODY_SHA1);
    expect(await sha1File(dest)).toBe(BODY_SHA1);
    await fs.rm(dir, { recursive: true, force: true });
  });
  it('падает при неверном sha1 после всех ретраев', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-dl-'));
    await expect(
      downloadFile(baseUrl + '/ok', path.join(dir, 'a.jar'), 'deadbeef'.repeat(5))
    ).rejects.toThrow(/Хэш/);
    await fs.rm(dir, { recursive: true, force: true });
  });
  it('ретраит и добивается успеха', async () => {
    attempts = 0;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-dl-'));
    await downloadFile(baseUrl + '/flaky', path.join(dir, 'a.jar'), BODY_SHA1);
    expect(attempts).toBe(2);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe('fetchManifest', () => {
  it('успешно тянет и кэширует', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-mf-'));
    const cache = path.join(dir, 'cache.json');
    const r = await fetchManifest(baseUrl + '/manifest.json', cache);
    expect(r.offline).toBe(false);
    expect(r.manifest.minecraft).toBe('1.20.1');
    expect(JSON.parse(await fs.readFile(cache, 'utf8')).minecraft).toBe('1.20.1');
    await fs.rm(dir, { recursive: true, force: true });
  });
  it('офлайн-фолбэк на кэш', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-mf-'));
    const cache = path.join(dir, 'cache.json');
    await fs.writeFile(cache, JSON.stringify(MANIFEST));
    const r = await fetchManifest('http://127.0.0.1:1/nope', cache);
    expect(r.offline).toBe(true);
    expect(r.manifest.minecraft).toBe('1.20.1');
    await fs.rm(dir, { recursive: true, force: true });
  });
  it('без сети и без кэша — понятная ошибка', async () => {
    await expect(
      fetchManifest('http://127.0.0.1:1/nope', path.join(os.tmpdir(), 'no-cache-xyz.json'))
    ).rejects.toThrow(/манифест/);
  });
});
