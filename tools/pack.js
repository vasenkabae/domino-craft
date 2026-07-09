#!/usr/bin/env node
// Упаковщик сборки: node tools/pack.js <папка сборки>
// Папка сборки — git-репозиторий с pack.config.json:
// { owner, repo, branch, minecraft, loader: {type, version, installerUrl?}, server: {host, port} }
// Скрипт генерирует manifest.json с sha1 и raw-URL и пушит всё на GitHub.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const dir = process.argv[2];
if (!dir || !fs.existsSync(path.join(dir, 'pack.config.json'))) {
  console.error('Использование: node tools/pack.js <папка сборки с pack.config.json>');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'pack.config.json'), 'utf8'));
const SKIP = new Set(['pack.config.json', 'manifest.json', 'news.json', '.git', '.gitignore', 'README.md']);

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (d === dir && SKIP.has(e.name)) continue;
    if (e.name === '.git') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    const rel = path.relative(dir, p).split(path.sep).join('/');
    const buf = fs.readFileSync(p);
    const encoded = rel.split('/').map(encodeURIComponent).join('/');
    // baseUrl (напр. VPS) в приоритете — raw.githubusercontent.com режут провайдеры РФ.
    const url = cfg.baseUrl
      ? `${cfg.baseUrl.replace(/\/$/, '')}/${encoded}`
      : `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${encoded}`;
    files.push({
      path: rel,
      sha1: crypto.createHash('sha1').update(buf).digest('hex'),
      size: buf.length,
      url
    });
  }
})(dir);

const manifest = {
  packVersion: new Date().toISOString().slice(0, 16).replace('T', ' '),
  minecraft: cfg.minecraft,
  loader: cfg.loader,
  server: cfg.server,
  files
};
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`manifest.json готов: ${files.length} файлов, MC ${cfg.minecraft} (${cfg.loader.type})`);

if (process.argv.includes('--no-push')) {
  console.log('--no-push: git-публикация пропущена');
} else {
  execSync('git add -A', { cwd: dir, stdio: 'inherit' });
  execSync(`git commit -m "pack ${manifest.packVersion}"`, { cwd: dir, stdio: 'inherit' });
  execSync('git push', { cwd: dir, stdio: 'inherit' });
  console.log('Сборка опубликована на GitHub');
}
