const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_SKIN_BYTES = 512 * 1024;

function readPngDimensions(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Не PNG-файл');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function validateSkinPng(buffer) {
  if (buffer.length > MAX_SKIN_BYTES) {
    throw new Error('Файл больше 512 КБ');
  }
  const { width, height } = readPngDimensions(buffer);
  if (width !== 64 || height !== 64) {
    throw new Error(`Нужен файл 64×64, сейчас ${width}×${height}`);
  }
}

async function uploadSkin(apiBaseUrl, nick, buffer) {
  const form = new FormData();
  form.append('name', nick);
  form.append('file', new Blob([buffer], { type: 'image/png' }), 'skin.png');
  const res = await fetch(apiBaseUrl + '/launcher/skin', { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Не удалось сохранить скин');
  }
  return data;
}

module.exports = { readPngDimensions, validateSkinPng, uploadSkin };
