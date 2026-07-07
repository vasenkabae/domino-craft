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
  chooseDir: () => ipcRenderer.invoke('choose-dir'),
  friendsList: () => ipcRenderer.invoke('friends:list'),
  friendsAdd: (nick, note) => ipcRenderer.invoke('friends:add', { nick, note }),
  friendsRemove: nick => ipcRenderer.invoke('friends:remove', nick),
  friendsWatchAdd: server => ipcRenderer.invoke('friends:watch-add', server),
  friendsWatchRemove: server => ipcRenderer.invoke('friends:watch-remove', server),
  onProgress: cb => ipcRenderer.on('progress', (_e, p) => cb(p)),
  onState: cb => ipcRenderer.on('state', (_e, s) => cb(s)),
  onPresence: cb => ipcRenderer.on('presence:update', (_e, p) => cb(p))
});
