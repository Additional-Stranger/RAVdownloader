const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Window controls
  minimize: ()  => ipcRenderer.send('win-minimize'),
  maximize: ()  => ipcRenderer.send('win-maximize'),
  close:    ()  => ipcRenderer.send('win-close'),

  // Settings
  getSettings:  ()    => ipcRenderer.invoke('get-settings'),
  setSettings:  (s)   => ipcRenderer.invoke('set-settings', s),
  chooseFolder: ()    => ipcRenderer.invoke('choose-folder'),
  openFolder:   (p)   => ipcRenderer.invoke('open-folder', p),
  openLogFolder:()    => ipcRenderer.invoke('open-log-folder'),

  // Downloads
  getFormats:     (url)  => ipcRenderer.invoke('get-formats', url),
  startDownload:  (opts) => ipcRenderer.invoke('start-download', opts),
  pauseDownload:  (id)   => ipcRenderer.invoke('pause-download', id),

  // Listeners
  onProgress: (cb) => {
    ipcRenderer.removeAllListeners('dl-progress');
    ipcRenderer.on('dl-progress', (_e, d) => cb(d));
  },
  onUpdateProgress: (cb) => {
    ipcRenderer.removeAllListeners('update-progress');
    ipcRenderer.on('update-progress', (_e, msg) => cb(msg));
  },

  // yt-dlp
  getVersion:       ()    => ipcRenderer.invoke('get-ytdlp-version'),
  updateYtdlp:      (nightly) => ipcRenderer.invoke('update-ytdlp', nightly !== false),
  getSupportedSites:()    => ipcRenderer.invoke('get-supported-sites'),

  // Files & convert
  chooseFiles:  (opts)  => ipcRenderer.invoke('choose-files', opts),
  convertFile:  (opts)  => ipcRenderer.invoke('convert-file', opts),

  // Logs & diagnostics
  getLogs:        () => ipcRenderer.invoke('get-logs'),
  getDiagnostics: () => ipcRenderer.invoke('get-diagnostics'),
});
