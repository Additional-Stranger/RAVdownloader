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
  getVersion:         ()    => ipcRenderer.invoke('get-ytdlp-version'),
  checkYtdlpUpdate:   ()    => ipcRenderer.invoke('check-ytdlp-update'),
  updateYtdlp:        (nightly) => ipcRenderer.invoke('update-ytdlp', nightly !== false),
  getSupportedSites:  ()    => ipcRenderer.invoke('get-supported-sites'),
  onYtdlpDownloadProgress: (cb) => {
    ipcRenderer.removeAllListeners('ytdlp-download-progress');
    ipcRenderer.on('ytdlp-download-progress', (_e, d) => cb(d));
  },

  // App version & self-update
  getAppVersion:     ()    => ipcRenderer.invoke('get-app-version'),
  checkAppUpdate:    ()    => ipcRenderer.invoke('check-app-update'),
  downloadAppUpdate: (url) => ipcRenderer.invoke('download-app-update', url),
  onAppUpdateProgress: (cb) => {
    ipcRenderer.removeAllListeners('app-update-progress');
    ipcRenderer.on('app-update-progress', (_e, pct) => cb(pct));
  },

  // Files & convert
  chooseFiles:  (opts)  => ipcRenderer.invoke('choose-files', opts),
  convertFile:  (opts)  => ipcRenderer.invoke('convert-file', opts),

  // YouTube account
  youtubeLogin:        ()  => ipcRenderer.invoke('youtube-login'),
  youtubeLogout:       ()  => ipcRenderer.invoke('youtube-logout'),
  youtubeAuthStatus:   ()  => ipcRenderer.invoke('youtube-auth-status'),
  youtubeRefreshEmail: ()  => ipcRenderer.invoke('youtube-refresh-email'),

  // Advanced features
  checkFont:      ()   => ipcRenderer.invoke('check-font'),

  // Logs & diagnostics
  getLogs:        () => ipcRenderer.invoke('get-logs'),
  getDiagnostics: () => ipcRenderer.invoke('get-diagnostics'),
});
