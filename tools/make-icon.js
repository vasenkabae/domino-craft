// Генератор иконки лаунчера: рисует костяшку домино (тот же логотип, что на экране
// входа) и собирает build/icon.ico со всеми нужными размерами.
// Без зависимостей: PNG через zlib, ICO — обычный контейнер с PNG внутри (Vista+).
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SS = 4; // суперсэмплинг для сглаживания краёв

// --- геометрия (все координаты в долях стороны) ---
const rrect = (x, y, cx, cy, hw, hh, r) => {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
};
const circle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;

const BG = [23, 26, 33];
const BONE = [236, 234, 223];
const EDGE = [26, 29, 36];
const DARK = [35, 38, 46];
const GOLD = [242, 185, 78];

// Точки: три тёмные сверху, четыре золотые снизу — как в SVG на экране входа.
const PIPS = [
  [0.36, 0.21, DARK], [0.64, 0.305, DARK], [0.36, 0.40, DARK],
  [0.36, 0.61, GOLD], [0.64, 0.61, GOLD], [0.36, 0.80, GOLD], [0.64, 0.80, GOLD]
];

// Цвет одной подпиксельной пробы в единичных координатах.
function sample(x, y) {
  if (rrect(x, y, 0.5, 0.5, 0.5, 0.5, 0.22) > 0) return null; // за скруглением иконки — прозрачно
  let c = BG;
  const bone = rrect(x, y, 0.5, 0.5, 0.30, 0.46, 0.06);
  if (bone <= 0) c = bone > -0.022 ? EDGE : BONE; // обводка костяшки
  if (bone < -0.022) {
    if (Math.abs(y - 0.5) < 0.011 && Math.abs(x - 0.5) < 0.22) c = DARK; // разделительная линия
    for (const [px, py, col] of PIPS) if (circle(x, y, px, py, 0.048) <= 0) c = col;
  }
  return c;
}

function renderRGBA(size) {
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
          if (c) { r += c[0]; g += c[1]; b += c[2]; hits++; }
        }
      }
      const i = (py * size + px) * 4;
      if (hits) {
        buf[i] = r / hits; buf[i + 1] = g / hits; buf[i + 2] = b / hits;
        buf[i + 3] = Math.round(255 * hits / (SS * SS));
      }
    }
  }
  return buf;
}

// --- PNG ---
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
};

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // бит на канал
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // фильтр None
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const dir = [];
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4);   // плоскости
    e.writeUInt16LE(32, 6);  // бит на пиксель
    e.writeUInt32BE(0, 8);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    dir.push(e);
  }
  return Buffer.concat([header, ...dir, ...images.map(i => i.data)]);
}

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });

const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = sizes.map(size => ({ size, data: png(size, renderRGBA(size)) }));
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico(images));
fs.writeFileSync(path.join(outDir, 'icon.png'), images[images.length - 1].data);
console.log('готово:', path.join(outDir, 'icon.ico'), '+ icon.png');
