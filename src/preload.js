const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  getState: () => ipcRenderer.invoke('get-state'),
  loginOffline: nick => ipcRenderer.invoke('login-offline', nick),
  loginMs: () => ipcRenderer.invoke('login-ms'),
  logout: () => ipcRenderer.invoke('logout'),
  play: () => ipcRenderer.invoke('play'),
  saveSettings: patch => ipcRenderer.invoke('save-settings', patch),
  serverStatus: () => ipcRenderer.invoke('server-status'),
  news: () => ipcRenderer.invoke('news'),
  vanillaVersions: () => ipcRenderer.invoke('vanilla-versions'),
  onProgress: cb => ipcRenderer.on('progress', (_e, p) => cb(p)),
  onState: cb => ipcRenderer.on('state', (_e, s) => cb(s))
});
