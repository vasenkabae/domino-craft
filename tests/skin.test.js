import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { validateSkinPng, readPngDimensions, uploadSkin } from '../src/main/skin';

function fakePng(width, height, extraBytes = 0) {
  const buf = Buffer.alloc(24 + extraBytes);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

describe('readPngDimensions', () => {
  it('читает ширину и высоту из IHDR', () => {
    expect(readPngDimensions(fakePng(64, 64))).toEqual({ width: 64, height: 64 });
  });
  it('падает на не-PNG', () => {
    expect(() => readPngDimensions(Buffer.from('not a png'))).toThrow(/PNG/);
  });
});

describe('validateSkinPng', () => {
  it('принимает корректный 64x64', () => {
    expect(() => validateSkinPng(fakePng(64, 64))).not.toThrow();
  });
  it('отклоняет неверный размер', () => {
    expect(() => validateSkinPng(fakePng(32, 32))).toThrow(/64×64/);
  });
  it('отклоняет файл больше 512 КБ', () => {
    expect(() => validateSkinPng(fakePng(64, 64, 600 * 1024))).toThrow(/512/);
  });
});

let server, baseUrl;
beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    if (req.url === '/launcher/skin' && req.method === 'POST') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise(r => server.close(r)));

describe('uploadSkin', () => {
  it('шлёт multipart и возвращает ok', async () => {
    const result = await uploadSkin(baseUrl, 'testnick', fakePng(64, 64));
    expect(result.ok).toBe(true);
  });
});
