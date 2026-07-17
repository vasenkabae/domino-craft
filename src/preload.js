const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  getState: () => ipcRenderer.invoke('get-state'),
  accessSubmit: link => ipcRenderer.invoke('access:submit', link),
  loginOffline: nick => ipcRenderer.invoke('login-offline', nick),
  loginMs: () => ipcRenderer.invoke('login-ms'),
  logout: () => ipcRenderer.invoke('logout'),
  play: () => ipcRenderer.invoke('play'),
  saveSettings: patch => ipcRenderer.invoke('save-settings', patch),
  serverStatus: () => ipcRenderer.invoke('server-status'),
  vanillaVersions: () => ipcRenderer.invoke('vanilla-versions'),
  chooseDir: () => ipcRenderer.invoke('choose-dir'),
  openGameDir: () => ipcRenderer.invoke('open-game-dir'),
  chooseSkin: () => ipcRenderer.invoke('skin:choose'),
  applySkin: filePath => ipcRenderer.invoke('skin:apply', filePath),
  onProgress: cb => ipcRenderer.on('progress', (_e, p) => cb(p)),
  onState: cb => ipcRenderer.on('state', (_e, s) => cb(s))
});
