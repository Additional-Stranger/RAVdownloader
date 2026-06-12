const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Platform info (used by renderer to swap Windows chrome for native Mac chrome)
  platform: process.platform,
  isMac:    process.platform === 'darwin',
  isWin:    process.platform === 'win32',

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

  // Audio extractor
  extractAudio: (opts)  => ipcRenderer.invoke('extract-audio', opts),
  onExtractProgress: (cb) => {
    ipcRenderer.removeAllListeners('extract-progress');
    ipcRenderer.on('extract-progress', (_e, msg) => cb(msg));
  },

  // YouTube account
  youtubeLogin:        ()  => ipcRenderer.invoke('youtube-login'),
  youtubeLogout:       ()  => ipcRenderer.invoke('youtube-logout'),
  youtubeAuthStatus:   ()  => ipcRenderer.invoke('youtube-auth-status'),
  youtubeRefreshEmail: ()  => ipcRenderer.invoke('youtube-refresh-email'),

  // Advanced features
  checkFont:      ()   => ipcRenderer.invoke('check-font'),

  // Lower Third Generator
  getLtFiles:          ()     => ipcRenderer.invoke('get-lt-files'),
  generateLowerThird:  (opts) => ipcRenderer.invoke('generate-lower-third', opts),
  onLtProgress: (cb) => {
    ipcRenderer.removeAllListeners('lt-progress');
    ipcRenderer.on('lt-progress', (_e, msg) => cb(msg));
  },

  // Merge Videos
  probeMergeDurations: (paths) => ipcRenderer.invoke('probe-merge-durations', paths),
  mergeVideos:  (opts) => ipcRenderer.invoke('merge-videos', opts),
  onMergeProgress: (cb) => {
    ipcRenderer.removeAllListeners('merge-progress');
    ipcRenderer.on('merge-progress', (_e, msg) => cb(msg));
  },

  // Podcast
  mergePodcast: (opts) => ipcRenderer.invoke('merge-podcast', opts),
  openTimecodesWindow: (payload) => ipcRenderer.invoke('open-timecodes-window', payload),
  clipboardWrite: (text) => ipcRenderer.invoke('clipboard-write', text),
  onPodcastProgress: (cb) => {
    ipcRenderer.removeAllListeners('podcast-progress');
    ipcRenderer.on('podcast-progress', (_e, msg) => cb(msg));
  },

  // Report issue
  submitReport: (opts) => ipcRenderer.invoke('submit-report', opts || {}),

  // Logs & diagnostics
  getLogs:        () => ipcRenderer.invoke('get-logs'),
  getDiagnostics: () => ipcRenderer.invoke('get-diagnostics'),
});
