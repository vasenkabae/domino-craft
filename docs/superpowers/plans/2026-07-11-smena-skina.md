# Смена скина в лаунчере — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Игрок загружает PNG-скин в лаунчере, скин виден всем на сервере (включая vanilla-клиентов) при следующем входе.

**Architecture:** Роут `/launcher/skin` в уже работающем aiohttp-сервисе Discord-бота (VDS) сохраняет PNG; новый плагин `DominoSkins` на входе игрока назначает его через нативный Paper `PlayerProfile` API — без сторонних плагинов и внешних сервисов подписи. Лаунчер — отдельный экран поверх существующего Electron-приложения.

**Tech Stack:** Python 3 + aiohttp + Pillow (бэкенд, уже установлены на VDS), Java 25 + Paper API (плагин, компилируется `javac` на VDS), Node.js/Electron + vitest (лаунчер).

## Global Constraints

- Валидация ника — `^[A-Za-z0-9_]{3,16}$` (тот же regex, что уже используется в `ipc.js` для офлайн-логина).
- Скин: ровно PNG 64×64, лимит веса 512 КБ (двойная проверка — в лаунчере и на бэкенде).
- Backend порт `8765` на VDS `138.16.181.96`, раздача `MODPACK_DIR=/root/domino/modpack`, скины в `MODPACK_DIR/skins/<ник>.png`, доступны по `http://138.16.181.96:8765/dc/skins/<ник>.png`.
- Секреты (`vpsPassword`, FTP-креды) — только через `tools/secrets/domino-secrets.json`, никогда не вводить их напрямую в команды.
- Игровой FTP-сервер: `45.93.200.45:21`, пользователь `mc71971`, плагины в `/plugins/`.
- Таймаут сетевых проверок в плагине — 2 секунды: вход игрока никогда не блокируется из-за недоступности VDS.

Спека: `MinecraftLauncher/docs/superpowers/specs/2026-07-11-smena-skina-design.md`.

---

## Фаза 1 — бэкенд + плагин (проверка гипотезы)

### Task 1: Роут `/launcher/skin` в launcher_link.py

**Files:**
- Modify: `C:\Users\lloh0\Desktop\discord\discord bot\cogs\launcher_link.py`

**Interfaces:**
- Produces: `POST http://138.16.181.96:8765/launcher/skin` — `multipart/form-data` с полями `name` (ник) и `file` (PNG-байты). Ответ `200 {"ok": true}` либо `400 {"ok": false, "error": "<текст>"}`. Файл сохраняется в `MODPACK_DIR/skins/<name>.png`, раздаётся статикой через уже существующий `/dc/` роут как `http://138.16.181.96:8765/dc/skins/<name>.png`.

Этот файл не под git (папка `discord bot` не является репозиторием) — коммитить нечего, только редактировать и деплоить.

- [ ] **Step 1: Добавить импорты и константы**

В начало файла, после существующих импортов (`import logging`), добавить:

```python
import io
import re
```

После строки `MODPACK_DIR = os.getenv(...)` добавить:

```python
SKINS_DIR = os.path.join(MODPACK_DIR, "skins")
NICK_RE = re.compile(r'^[A-Za-z0-9_]{3,16}$')
MAX_SKIN_BYTES = 512 * 1024
```

В самый верх файла, к строке `from aiohttp import web`, добавить:

```python
from PIL import Image
```

- [ ] **Step 2: Зарегистрировать роут**

В `cog_load`, сразу после строки `app.router.add_static("/dc/", MODPACK_DIR, show_index=False)`, добавить:

```python
        app.router.add_post("/launcher/skin", self.handle_skin_upload)
```

- [ ] **Step 3: Написать обработчик**

После метода `handle_verify`, перед декоратором `@app_commands.command`, добавить:

```python
    async def handle_skin_upload(self, request: web.Request) -> web.Response:
        reader = await request.multipart()
        name_field = None
        file_bytes = None
        while True:
            part = await reader.next()
            if part is None:
                break
            if part.name == "name":
                name_field = (await part.text()).strip()
            elif part.name == "file":
                file_bytes = await part.read(decode=False)
                if len(file_bytes) > MAX_SKIN_BYTES:
                    return web.json_response({"ok": False, "error": "Файл больше 512 КБ"}, status=400)

        if not name_field or not NICK_RE.match(name_field):
            return web.json_response({"ok": False, "error": "Некорректный ник"}, status=400)
        if not file_bytes:
            return web.json_response({"ok": False, "error": "Файл не получен"}, status=400)

        try:
            Image.open(io.BytesIO(file_bytes)).verify()
            img = Image.open(io.BytesIO(file_bytes))  # verify() съедает парсер — переоткрываем для чтения размера
        except Exception:
            return web.json_response({"ok": False, "error": "Файл повреждён или не PNG"}, status=400)

        if img.format != "PNG":
            return web.json_response({"ok": False, "error": "Нужен PNG"}, status=400)
        if img.size != (64, 64):
            return web.json_response({"ok": False, "error": "Нужен файл 64×64"}, status=400)

        os.makedirs(SKINS_DIR, exist_ok=True)
        dest = os.path.join(SKINS_DIR, f"{name_field}.png")
        with open(dest, "wb") as f:
            f.write(file_bytes)

        logger.info("Skin upload: %s -> %s", name_field, dest)
        return web.json_response({"ok": True})
```

- [ ] **Step 4: Задеплоить на VDS и перезапустить бота**

```powershell
$Root = "C:\Users\lloh0\Desktop\minecraft project"
$s = Get-Content (Join-Path $Root "tools\secrets\domino-secrets.json") | ConvertFrom-Json
$Plink = Join-Path $Root "tools\plink.exe"
$Pscp = Join-Path $Root "tools\pscp.exe"
$vpsTarget = "$($s.vpsUser)@$($s.vpsHost)"

& $Pscp -batch -pw $s.vpsPassword "C:\Users\lloh0\Desktop\discord\discord bot\cogs\launcher_link.py" "${vpsTarget}:/root/domino/discord bot/cogs/launcher_link.py"
& $Plink -batch -ssh -pw $s.vpsPassword $vpsTarget "pm2 restart discord-bot && sleep 2 && pm2 status discord-bot"
```

Expected: `pm2 status` показывает `discord-bot` в статусе `online`, без немедленного рестарта из-за краша (если синтаксическая ошибка — pm2 покажет `errored`/частые рестарты, тогда смотреть `pm2 logs discord-bot --lines 30 --nostream` по SSH).

- [ ] **Step 5: Создать тестовый PNG 64×64**

```powershell
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path "$env:TEMP\claude" | Out-Null
$bmp = New-Object System.Drawing.Bitmap 64,64
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Red)
$bmp.Save("$env:TEMP\claude\test-skin-64.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp2 = New-Object System.Drawing.Bitmap 32,32
$g2 = [System.Drawing.Graphics]::FromImage($bmp2)
$g2.Clear([System.Drawing.Color]::Blue)
$bmp2.Save("$env:TEMP\claude\test-skin-32.png", [System.Drawing.Imaging.ImageFormat]::Png)
```

- [ ] **Step 6: Проверить happy path curl'ом**

```bash
curl -s -F "name=testnick123" -F "file=@$TEMP/claude/test-skin-64.png;type=image/png" http://138.16.181.96:8765/launcher/skin
```

Expected: `{"ok": true}`

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://138.16.181.96:8765/dc/skins/testnick123.png
```

Expected: `200`

- [ ] **Step 7: Проверить отклонение неверного размера**

```bash
curl -s -F "name=testnick123" -F "file=@$TEMP/claude/test-skin-32.png;type=image/png" http://138.16.181.96:8765/launcher/skin
```

Expected: `{"ok": false, "error": "Нужен файл 64×64"}`

- [ ] **Step 8: Проверить отклонение некорректного ника**

```bash
curl -s -F "name=../../etc/passwd" -F "file=@$TEMP/claude/test-skin-64.png;type=image/png" http://138.16.181.96:8765/launcher/skin
```

Expected: `{"ok": false, "error": "Некорректный ник"}`

---

### Task 2: Плагин DominoSkins

**Files:**
- Create: `C:\Users\lloh0\Desktop\minecraft project\DominoSkins\src\main\resources\plugin.yml`
- Create: `C:\Users\lloh0\Desktop\minecraft project\DominoSkins\src\main\java\ru\vasenka\dominoskins\DominoSkinsPlugin.java`

**Interfaces:**
- Consumes: `http://138.16.181.96:8765/dc/skins/<ник>.png` (из Task 1) — HEAD-запрос, 200 = скин есть.
- Produces: применённый `PlayerProfile` с текстурой скина на `AsyncPlayerPreLoginEvent`.

Плагин без build-системы, компилируется `javac` на VDS — как `DominoCities`/`DominoSit`. Без git (как `DominoSit`).

- [ ] **Step 1: plugin.yml**

```yaml
name: DominoSkins
version: 1.0.0
main: ru.vasenka.dominoskins.DominoSkinsPlugin
api-version: '1.21'
author: vasenka
description: Применяет кастомный скин игрока при входе (см. смену скина в лаунчере)
```

- [ ] **Step 2: Основной класс**

```java
package ru.vasenka.dominoskins;

import com.destroystokyo.paper.profile.PlayerProfile;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.AsyncPlayerPreLoginEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.net.URI;
import java.net.URL;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public final class DominoSkinsPlugin extends JavaPlugin implements Listener {

    private static final String SKIN_BASE_URL = "http://138.16.181.96:8765/dc/skins/";
    private static final Duration TIMEOUT = Duration.ofSeconds(2);

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(TIMEOUT)
            .build();

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
    }

    @EventHandler
    public void onPreLogin(AsyncPlayerPreLoginEvent event) {
        String url = SKIN_BASE_URL + event.getName() + ".png";
        boolean hasSkin;
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(TIMEOUT)
                    .method("HEAD", HttpRequest.BodyPublishers.noBody())
                    .build();
            HttpResponse<Void> response = http.send(request, HttpResponse.BodyHandlers.discarding());
            hasSkin = response.statusCode() == 200;
        } catch (Exception e) {
            getLogger().warning("Skin check failed for " + event.getName() + ": " + e.getMessage());
            return;
        }
        if (!hasSkin) {
            return;
        }
        try {
            PlayerProfile profile = event.getPlayerProfile();
            profile.getTextures().setSkin(new URL(url));
            event.setPlayerProfile(profile);
        } catch (Exception e) {
            getLogger().warning("Failed to apply skin for " + event.getName() + ": " + e.getMessage());
        }
    }
}
```

**Известный риск:** пакет `com.destroystokyo.paper.profile.PlayerProfile` — многолетний стандартный путь Paper API для `AsyncPlayerPreLoginEvent#getPlayerProfile()`, но не проверен на конкретной версии `paper-api.jar`, что стоит на VDS (MC 26.1.2). Если `javac` в Task 3 упадёт с `package does not exist` или `cannot find symbol` — на VDS выполнить:

```bash
/root/build/jdk-25.0.3+9/bin/javap -classpath /root/build/paper-api.jar com.destroystokyo.paper.profile.PlayerProfile
```

Если пакета нет — найти актуальный командой:

```bash
cd /tmp && mkdir -p jarpeek && cd jarpeek && /root/build/jdk-25.0.3+9/bin/jar tf /root/build/paper-api.jar | grep -i "profile/PlayerProfile.class"
```

и поправить `import` в коде на найденный путь (вероятный кандидат — `io.papermc.paper.profile.PlayerProfile`, тогда метод получения текстур тот же `getTextures().setSkin(URL)`).

---

### Task 3: Компиляция и деплой DominoSkins

**Files:** нет новых, только деплой артефактов из Task 2.

- [ ] **Step 1: Залить исходники на VDS**

```powershell
$Root = "C:\Users\lloh0\Desktop\minecraft project"
$s = Get-Content (Join-Path $Root "tools\secrets\domino-secrets.json") | ConvertFrom-Json
$Plink = Join-Path $Root "tools\plink.exe"
$Pscp = Join-Path $Root "tools\pscp.exe"
$vpsTarget = "$($s.vpsUser)@$($s.vpsHost)"

& $Plink -batch -ssh -pw $s.vpsPassword $vpsTarget "mkdir -p /root/build/skins/src"
& $Pscp -batch -pw $s.vpsPassword -r (Join-Path $Root "DominoSkins\src\main\java") "${vpsTarget}:/root/build/skins/src/"
& $Pscp -batch -pw $s.vpsPassword (Join-Path $Root "DominoSkins\src\main\resources\plugin.yml") "${vpsTarget}:/root/build/skins/"
```

- [ ] **Step 2: Скомпилировать и упаковать**

```powershell
$cmd = @'
set -e
cd /root/build/skins
CP="/root/build/paper-api.jar:$(ls /root/build/libs/*.jar | tr '\n' ':')$(ls /root/build/real-libs/*.jar | tr '\n' ':')"
mkdir -p out
find src/java -name '*.java' > sources.txt
/root/build/jdk-25.0.3+9/bin/javac -cp "$CP" -d out @sources.txt
cp plugin.yml out/
cd out
/root/build/jdk-25.0.3+9/bin/jar cf ../DominoSkins.jar .
cd ..
ls -la DominoSkins.jar
'@
& $Plink -batch -ssh -pw $s.vpsPassword $vpsTarget $cmd
```

Expected: строка вида `-rw-r--r-- 1 root root <размер> DominoSkins.jar`, без ошибок компиляции. Если ошибка про `PlayerProfile` — см. фоллбэк-инструкцию в конце Task 2, поправить исходник, повторить Step 1–2.

- [ ] **Step 3: Скачать jar и залить по FTP на игровой сервер**

```powershell
$dest = "$env:TEMP\claude\domino-skins-build"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
& $Pscp -batch -pw $s.vpsPassword "${vpsTarget}:/root/build/skins/DominoSkins.jar" $dest
```

```bash
cd "C:/Users/lloh0/Desktop/minecraft project"
node -e "
const s = require('./tools/secrets/domino-secrets.json');
process.stdout.write(s.gameFtpUser + ':' + s.gameFtpPassword);
" > /c/Users/lloh0/AppData/Local/Temp/claude/ftpcred.txt
CRED=$(cat /c/Users/lloh0/AppData/Local/Temp/claude/ftpcred.txt)
curl -s --user "$CRED" -T "/c/Users/lloh0/AppData/Local/Temp/claude/domino-skins-build/DominoSkins.jar" "ftp://45.93.200.45/plugins/DominoSkins.jar" -w "upload: %{http_code}\n"
curl -s --user "$CRED" "ftp://45.93.200.45/plugins/DominoSkins.jar" -o /c/Users/lloh0/AppData/Local/Temp/claude/DominoSkins_verify.jar
sha1sum /c/Users/lloh0/AppData/Local/Temp/claude/DominoSkins_verify.jar "/c/Users/lloh0/AppData/Local/Temp/claude/domino-skins-build/DominoSkins.jar"
rm /c/Users/lloh0/AppData/Local/Temp/claude/ftpcred.txt /c/Users/lloh0/AppData/Local/Temp/claude/DominoSkins_verify.jar
```

Expected: `upload: 226`, оба sha1 совпадают.

- [ ] **Step 4: Загрузить тестовый скин под реальный игровой ник и попросить рестарт + ручную проверку**

```bash
CRED=$(node -e "const s=require('C:/Users/lloh0/Desktop/minecraft project/tools/secrets/domino-secrets.json'); process.stdout.write(s.gameFtpUser+':'+s.gameFtpPassword)")
curl -s -F "name=<игровой ник vasenka>" -F "file=@$TEMP/claude/test-skin-64.png;type=image/png" http://138.16.181.96:8765/launcher/skin
```

Дальше — ручная проверка, автоматизировать нечем:
1. Попросить vasenka перезапустить игровой сервер из панели (плагин грузится только на старте, как и `DominoSit`).
2. vasenka заходит на сервер под тестовым ником, второй игрок смотрит на него **на чистом клиенте без Fabric-мода**.

Expected: второй игрок видит применённый (красный) тестовый скин. Если нет — гипотеза варианта A не подтвердилась, см. фоллбэк на SkinsRestorer в спеке — Фаза 2 не начинается, пока это не решено отдельно.

- [ ] **Step 5: Проверить, что недоступность VDS не блокирует вход**

```powershell
& $Plink -batch -ssh -pw $s.vpsPassword $vpsTarget "pm2 stop discord-bot"
```

Зайти на игровой сервер любым игроком. Expected: вход проходит как обычно (максимум +2 сек на таймаут), сервер не виснет и не кикает.

```powershell
& $Plink -batch -ssh -pw $s.vpsPassword $vpsTarget "pm2 start discord-bot"
```

---

## Фаза 2 — экран в лаунчере

*Начинать только после подтверждения Task 3 (скин виден на vanilla-клиенте).*

### Task 4: Модуль `skin.js` — валидация и загрузка

**Files:**
- Create: `MinecraftLauncher\src\main\skin.js`
- Test: `MinecraftLauncher\tests\skin.test.js`

**Interfaces:**
- Produces: `validateSkinPng(buffer)` — кидает `Error` с понятным текстом, либо ничего не возвращает при успехе. `uploadSkin(apiBaseUrl, nick, buffer)` — `async`, возвращает `{ok: true}` либо кидает `Error`.

- [ ] **Step 1: Написать падающие тесты**

Создать `MinecraftLauncher\tests\skin.test.js`:

```javascript
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
```

- [ ] **Step 2: Запустить тесты, убедиться что падают**

Run: `npm test -- skin.test.js`
Expected: FAIL — `Cannot find module '../src/main/skin'`

- [ ] **Step 3: Реализовать skin.js**

Создать `MinecraftLauncher\src\main\skin.js`:

```javascript
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
```

- [ ] **Step 4: Запустить тесты, убедиться что проходят**

Run: `npm test -- skin.test.js`
Expected: PASS, 6 тестов зелёные

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\lloh0\Desktop\minecraft project\MinecraftLauncher"
git add src/main/skin.js tests/skin.test.js
git commit -m "feat: валидация и загрузка PNG-скина"
```

---

### Task 5: IPC-мост

**Files:**
- Modify: `MinecraftLauncher\src\main\ipc.js`
- Modify: `MinecraftLauncher\src\preload.js`

**Interfaces:**
- Consumes: `validateSkinPng`, `uploadSkin` из Task 4.
- Produces: `launcher.chooseSkin()` → `Promise<{filePath, dataUrl} | {error} | null>`; `launcher.applySkin(filePath)` → `Promise<{ok:true}>` (кидает `Error` при неудаче).

- [ ] **Step 1: Добавить require в ipc.js**

В `MinecraftLauncher\src\main\ipc.js`, после строки `const { matchesAccess, verifyRemote, loadAccess, saveAccess } = require('./access');`, добавить:

```javascript
const { validateSkinPng, uploadSkin } = require('./skin');
```

- [ ] **Step 2: Добавить обработчики**

В `ipc.js`, после блока `ipcMain.handle('choose-dir', ...)`, добавить:

```javascript
  ipcMain.handle('skin:choose', async () => {
    const res = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'PNG-скин', extensions: ['png'] }]
    });
    if (res.canceled) return null;
    const buffer = await fs.readFile(res.filePaths[0]);
    try {
      validateSkinPng(buffer);
    } catch (e) {
      return { error: e.message };
    }
    return { filePath: res.filePaths[0], dataUrl: 'data:image/png;base64,' + buffer.toString('base64') };
  });

  ipcMain.handle('skin:apply', async (_e, filePath) => {
    const session = await readSession();
    if (!session) throw new Error('Сначала войди в аккаунт');
    const buffer = await fs.readFile(filePath);
    validateSkinPng(buffer);
    const apiBase = config.manifestUrl.replace(/\/dc\/manifest\.json$/, '');
    return uploadSkin(apiBase, session.name, buffer);
  });
```

- [ ] **Step 3: Пробросить в preload.js**

В `MinecraftLauncher\src\preload.js`, после строки `chooseDir: () => ipcRenderer.invoke('choose-dir'),`, добавить:

```javascript
  chooseSkin: () => ipcRenderer.invoke('skin:choose'),
  applySkin: filePath => ipcRenderer.invoke('skin:apply', filePath),
```

- [ ] **Step 4: Проверить, что лаунчер стартует без ошибок**

Run: `npm run smoke`
Expected: `[smoke] capture: ...` без исключений в консоли (падение при require — самая частая ошибка на этом шаге).

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\lloh0\Desktop\minecraft project\MinecraftLauncher"
git add src/main/ipc.js src/preload.js
git commit -m "feat: IPC-мост для смены скина"
```

---

### Task 6: Экран в лаунчере

**Files:**
- Modify: `MinecraftLauncher\src\renderer\index.html`
- Modify: `MinecraftLauncher\src\renderer\styles.css`
- Modify: `MinecraftLauncher\src\renderer\app.js`

**Interfaces:**
- Consumes: `launcher.chooseSkin()`, `launcher.applySkin(filePath)` из Task 5.

Превью — крупный план **головы** (перёд/зад), не полная модель тела: полный composite всех частей скина по UV-развёртке — отдельная, более рискованная задача (много координат, легко ошибиться без визуальной проверки), не нужна для проверки, что файл выбран правильный.

- [ ] **Step 1: Кнопка и модалка в index.html**

В `index.html`, после строки `<button id="btn-friends" class="icon" title="Друзья">👥</button>`, добавить:

```html
      <button id="btn-skin" class="icon" title="Скин">🧑</button>
```

После закрывающего `</div>` блока `friends-modal` (перед `<div id="settings-modal" ...>`), добавить:

```html
<div id="skin-modal" class="modal hidden">
  <div class="modal-card">
    <h2>Скин</h2>
    <div class="row">
      <button id="btn-choose-skin" class="small">Выбрать PNG (64×64)</button>
    </div>
    <div id="skin-error" class="error-text"></div>
    <div class="skin-preview-row">
      <canvas id="skin-preview-front" width="128" height="128" class="skin-preview"></canvas>
      <canvas id="skin-preview-back" width="128" height="128" class="skin-preview"></canvas>
    </div>
    <div class="modal-buttons">
      <button id="btn-apply-skin" class="primary" disabled>Применить</button>
      <button id="btn-close-skin">Закрыть</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: CSS для превью**

В `styles.css`, в конец файла добавить:

```css
.skin-preview-row { display: flex; gap: 12px; justify-content: center; margin: 12px 0; }
.skin-preview { image-rendering: pixelated; background: rgba(255, 255, 255, 0.05); border-radius: 6px; }
```

- [ ] **Step 3: Логика в app.js**

В `app.js`, после строки `let serversByLabel = {};`, добавить:

```javascript
let chosenSkinPath = null;
```

В блоке обработчиков внутри `init()`, после строки `$('btn-add-friend').onclick = addFriendFromInput;`, добавить:

```javascript
  $('btn-skin').onclick = openSkin;
  $('btn-close-skin').onclick = () => $('skin-modal').classList.add('hidden');
  $('btn-choose-skin').onclick = chooseSkinFile;
  $('btn-apply-skin').onclick = applyChosenSkin;
```

В конец файла добавить функции:

```javascript
function openSkin() {
  chosenSkinPath = null;
  $('skin-error').textContent = '';
  $('btn-apply-skin').disabled = true;
  clearSkinPreview();
  $('skin-modal').classList.remove('hidden');
}

async function chooseSkinFile() {
  const res = await launcher.chooseSkin();
  if (!res) return;
  if (res.error) {
    $('skin-error').textContent = res.error;
    $('btn-apply-skin').disabled = true;
    clearSkinPreview();
    return;
  }
  $('skin-error').textContent = '';
  chosenSkinPath = res.filePath;
  $('btn-apply-skin').disabled = false;
  drawSkinPreview(res.dataUrl);
}

function clearSkinPreview() {
  for (const id of ['skin-preview-front', 'skin-preview-back']) {
    const ctx = $(id).getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
  }
}

function drawSkinPreview(dataUrl) {
  const img = new Image();
  img.onload = () => {
    drawSkinCrop('skin-preview-front', img, 8, 8, 8, 8);
    drawSkinCrop('skin-preview-back', img, 24, 8, 8, 8);
  };
  img.src = dataUrl;
}

function drawSkinCrop(canvasId, img, sx, sy, sw, sh) {
  const canvas = $(canvasId);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
}

async function applyChosenSkin() {
  if (!chosenSkinPath) return;
  $('btn-apply-skin').disabled = true;
  try {
    await launcher.applySkin(chosenSkinPath);
    $('skin-modal').classList.add('hidden');
  } catch (e) {
    $('skin-error').textContent = e.message;
  } finally {
    $('btn-apply-skin').disabled = false;
  }
}
```

- [ ] **Step 4: Ручная проверка**

```bash
cd "C:\Users\lloh0\Desktop\minecraft project\MinecraftLauncher"
npm start
```

1. Войти офлайн-ником.
2. Нажать 🧑 — открывается модалка «Скин».
3. Выбрать `test-skin-64.png` (создан в Task 1, Step 5) — превью головы (перёд/зад) заливается красным, кнопка «Применить» становится активной.
4. Выбрать `test-skin-32.png` — под кнопкой текст ошибки «Нужен файл 64×64, сейчас 32×32», «Применить» неактивна.
5. Снова выбрать корректный файл, нажать «Применить» — модалка закрывается без ошибки (сеть должна дойти до VDS, роут из Task 1 уже задеплоен).

Expected: все 5 пунктов проходят как описано.

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\lloh0\Desktop\minecraft project\MinecraftLauncher"
git add src/renderer/index.html src/renderer/styles.css src/renderer/app.js
git commit -m "feat: экран смены скина в лаунчере"
```
