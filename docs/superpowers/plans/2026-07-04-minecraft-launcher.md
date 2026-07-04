# План реализации Minecraft-лаунчера

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, крупными кусками — предпочтение пользователя: экономить лимиты).

**Goal:** Windows-лаунчер (Electron): вход по нику или Microsoft, автосинхронизация сборки модов с GitHub, автоскачивание Minecraft/Forge/Fabric/Java, запуск с автоподключением к серверу.

**Architecture:** Electron; main-процесс — вся работа с сетью/диском/запуском, renderer — UI через IPC (contextBridge). Чистая логика (sync, auth-uuid, выбор Java, опции запуска) — в отдельных модулях без зависимости от Electron, покрыта vitest.

**Tech Stack:** Electron, minecraft-launcher-core, msmc, minecraft-server-util, extract-zip, electron-updater, electron-builder (NSIS), vitest.

## Global Constraints

- Только Windows x64; CommonJS; Node из Electron (есть global fetch).
- UI на русском, тёмная тема.
- Чистые модули не требуют `electron` (тестируемость).
- Сборка модов: GitHub-репозиторий, файлы по raw.githubusercontent.com, манифест `manifest.json` в корне репо.
- Удаление «лишних» файлов — только внутри `mods/`; конфиги/сейвы не трогаем.

## Структура файлов

```
launcher.config.json        имя лаунчера, manifestUrl, azureClientId?, updateRepo
src/main/index.js           входная точка: окно, autoUpdater, регистрация IPC
src/main/ipc.js             все ipcMain.handle + события progress/state
src/main/game.js            оркестратор play(): манифест→sync→java→loader→MCLC
src/main/offline-auth.js    offlineUuid(name), offlineAuth(name)  [чистый]
src/main/sync.js            planSync(manifest, localIndex), buildLocalIndex(root) [чистый planSync]
src/main/downloader.js      downloadFile(url,dest,sha1,retries=3), sha1File
src/main/manifest.js        fetchManifest(url,cachePath) → {manifest, offline}
src/main/settings.js        loadSettings/saveSettings (JSON в userData) [чистый]
src/main/java.js            requiredJavaMajor(mc) [чистый], ensureJava(major,dir,onProgress)→javaw.exe (Adoptium)
src/main/launch-options.js  buildLaunchOptions({...}) [чистый: quickPlay для 1.20+, иначе --server args]
src/main/loaders.js         ensureFabric(root,mc,loader)→versionId; ensureForge(cacheDir,url)→installerPath
src/main/msauth.js          loginMicrosoft() через msmc('electron') → {mclc, profile}
src/main/status.js          getServerStatus(host,port); fetchNews(url)
src/preload.js              contextBridge API `launcher`
src/renderer/index.html     экраны: login, main; модалка настроек
src/renderer/styles.css     тёмная тема
src/renderer/app.js         логика UI, подписка на progress/state
tools/pack.js               упаковщик сборки: sha1-манифест + git commit/push
tests/*.test.js             vitest: offline-auth, sync, downloader, manifest, settings, java-major, launch-options
```

## Задачи (коммит после каждой)

- [ ] **1. Скелет.** package.json (start/test/dist), .gitignore, launcher.config.json, index.js с окном 1000×640 и флагом `--smoke` (автовыход через 3 c для проверки), пустые preload/renderer. Проверка: `npx electron . --smoke` выходит с кодом 0; `npm test` зелёный (0 тестов).
- [ ] **2. Чистая логика + тесты.** offline-auth (UUID v3 от `OfflinePlayer:<ник>`), sync.planSync (докачка по несовпадению sha1, удаление только из mods/), settings (defaults: memoryMb 4096), java.requiredJavaMajor (≥1.20.5→21, ≥1.17→17, иначе 8), launch-options (quickPlay для ≥1.20, иначе customLaunchArgs `--server/--port`; forge/fabric ветки). Проверка: vitest зелёный.
- [ ] **3. Сеть/диск + тесты.** downloader (fetch→файл, sha1-проверка, 3 ретрая), sync.buildLocalIndex (обход root, forward-slash пути), manifest.fetchManifest (кэш-фолбэк офлайн). Тесты на локальном node:http. Проверка: vitest зелёный.
- [ ] **4. Java + загрузчики.** java.ensureJava (Adoptium API latest/{major}/hotspot, zip→extract-zip, кэш в userData/runtime), loaders.ensureFabric (fabric-meta profile json → versions/), ensureForge (скачать installer jar в кэш). Проверка: ручной прогон ensureJava(21) скриптом.
- [ ] **5. Аккаунты.** msauth (msmc v4, Auth('select_account').launch('electron'), опциональный azureClientId), сессия в userData/session.json (offline: ник+uuid; ms: токены msmc refresh). Проверка: офлайн-путь тестом, MS — вручную позже.
- [ ] **6. Оркестратор game.play().** Последовательность: fetchManifest → buildLocalIndex → planSync → скачивания с прогрессом → ensureJava → ensureFabric/Forge → buildLaunchOptions → MCLC Client.launch; события progress {phase,current,total,file} и state (idle/syncing/launching/running/error+msg, хвост лога при краше). Проверка: unit на пробросе ошибок; полный прогон — вручную в конце.
- [ ] **7. IPC + preload.** handle: get-state, login-offline, login-ms, logout, play, save-settings, server-status, news; события: progress, state. Проверка: `--smoke` проходит.
- [ ] **8. UI.** Экран входа (ник/MS), главный (Играть, прогресс-бар, статус сервера, новости, шестерёнка), модалка настроек (память слайдером, папка, выход из аккаунта). Тёмная тема. Проверка: `npm start`, ручной клик-тур с фейковым манифестом.
- [ ] **9. Статус и новости.** status.getServerStatus (minecraft-server-util, таймаут 3с, офлайн — не ошибка), fetchNews (news.json из репо сборки: [{date,title,text}]). Проверка: вручную против публичного сервера.
- [ ] **10. Упаковщик tools/pack.js.** Вход: папка сборки с pack.config.json {owner,repo,branch,minecraft,loader{type,version[,installerUrl]},server{host,port}}. Обходит файлы, sha1, пишет manifest.json c raw-URL, git add/commit/push. Проверка: прогон на тестовой папке, валидный manifest.json.
- [ ] **11. Сборка и автообновление.** electron-builder (NSIS, appId, publish github), autoUpdater.checkForUpdatesAndNotify в packaged-режиме. Проверка: `npm run dist` даёт установщик, установка и запуск на этой машине.
- [ ] **12. Финальный e2e (вручную, с пользователем).** Чистая установка → офлайн-вход → скачивание тестовой сборки → запуск игры. MS-вход и автоподключение к серверу — когда появятся Azure-регистрация и сервер.

## Interfaces (сквозные)

- `manifest.json`: `{packVersion, minecraft, loader:{type:'fabric'|'forge'|'vanilla', version, installerUrl?}, server:{host,port}, files:[{path, sha1, size, url}]}`
- `session.json`: `{type:'offline'|'ms', name, uuid, msmc?}`
- `settings.json`: `{memoryMb:number, gameDir?:string}`
- IPC-события: `progress {phase:'sync'|'java'|'game', current, total, label}`, `state {value, message?}`
