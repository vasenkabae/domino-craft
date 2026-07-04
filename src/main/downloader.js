const fs = require('fs/promises');
const fssync = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha1File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1');
    fssync.createReadStream(file)
      .on('data', d => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  });
}

async function downloadFile(url, dest, expectedSha1 = null, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (expectedSha1) {
        const actual = crypto.createHash('sha1').update(buf).digest('hex');
        if (actual !== expectedSha1) throw new Error(`Хэш не совпал: ${url}`);
      }
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, buf);
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

module.exports = { downloadFile, sha1File };
