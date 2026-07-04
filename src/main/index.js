const { app, BrowserWindow } = require('electron');
const path = require('path');
const { registerIpc } = require('./ipc');

const smoke = process.argv.includes('--smoke');

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 640,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1115',
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js') }
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  return win;
}

app.whenReady().then(() => {
  const win = createWindow();
  registerIpc(win);

  if (app.isPackaged) {
    try {
      require('electron-updater').autoUpdater.checkForUpdatesAndNotify();
    } catch {
      // нет доступа к GitHub — просто работаем без автообновления
    }
  }

  if (smoke) {
    // --smoke [файл.png]: автопроверка — окно живёт 3 секунды, опционально скриншот
    const shotIdx = process.argv.indexOf('--smoke') + 1;
    const shotPath = process.argv[shotIdx] && process.argv[shotIdx].endsWith('.png')
      ? process.argv[shotIdx] : null;
    setTimeout(async () => {
      if (shotPath) {
        const img = await win.webContents.capturePage();
        require('fs').writeFileSync(shotPath, img.toPNG());
      }
      app.exit(0);
    }, 3000);
  }
});

app.on('window-all-closed', () => app.quit());
