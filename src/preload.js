const { contextBridge, ipcRenderer } = require('electron');

// Auth API — exposed only to login.html (which imports window.authApi).
// Kept separate from the main-app `api` so the login window has a narrow surface.
contextBridge.exposeInMainWorld('authApi', {
  platform: process.platform,
  winMin:   () => ipcRenderer.send('win-minimize'),
  winClose: () => ipcRenderer.send('win-close'),

  signup:         (opts) => ipcRenderer.invoke('auth-signup', opts),
  login:          (opts) => ipcRenderer.invoke('auth-login', opts),
  logout:         ()     => ipcRenderer.invoke('auth-logout'),
  recheck:        ()     => ipcRenderer.invoke('auth-recheck'),
  initialState:   ()     => ipcRenderer.invoke('auth-initial-state'),
  changePassword: (opts) => ipcRenderer.invoke('auth-change-password', opts),
  sendEmailCode:  ()     => ipcRenderer.invoke('auth-send-email-code'),
  verifyEmail:    (opts) => ipcRenderer.invoke('auth-verify-email', opts),
  forgotPassword: (opts) => ipcRenderer.invoke('auth-forgot-password', opts),
  openPurchase:   ()     => ipcRenderer.invoke('license-open-purchase'),
  enterApp:       ()     => ipcRenderer.send('auth-enter-app'),
  openLegal:      (which) => ipcRenderer.send('auth-open-legal', which),
});

// Licensing — the main window asks what the account is entitled to, and is told
// again whenever that changes.
contextBridge.exposeInMainWorld('license', {
  get:          ()  => ipcRenderer.invoke('license-get'),
  refresh:      ()  => ipcRenderer.invoke('license-refresh'),
  openPurchase: ()  => ipcRenderer.invoke('license-open-purchase'),
  openAccount:  ()  => ipcRenderer.invoke('license-open-account'),
  signOut:      ()  => ipcRenderer.invoke('auth-signout-from-app'),
  getUser:      ()  => ipcRenderer.invoke('auth-get-user'),
  onChange:     (fn) => {
    const h = (_e, state) => fn(state);
    ipcRenderer.on('license-state', h);
    return () => ipcRenderer.removeListener('license-state', h);
  },
});

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

  // Merge Videos
  probeMergeDurations: (paths) => ipcRenderer.invoke('probe-merge-durations', paths),
  mergeVideos:  (opts) => ipcRenderer.invoke('merge-videos', opts),
  onMergeProgress: (cb) => {
    ipcRenderer.removeAllListeners('merge-progress');
    ipcRenderer.on('merge-progress', (_e, msg) => cb(msg));
  },

  // VO Maker
  makeVo: (opts) => ipcRenderer.invoke('make-vo', opts),
  onVoProgress: (cb) => {
    ipcRenderer.removeAllListeners('vo-progress');
    ipcRenderer.on('vo-progress', (_e, msg) => cb(msg));
  },
  openVoDebugLog: () => ipcRenderer.invoke('open-vo-debug-log'),
  downloadImageUrl: (url) => ipcRenderer.invoke('download-image-url', url),

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

  // Account (from auth session)
  getAuthUser:         () => ipcRenderer.invoke('auth-get-user'),
  authSignOut:         () => ipcRenderer.invoke('auth-signout-from-app'),
  authChangePassword:  (opts) => ipcRenderer.invoke('auth-change-password', opts),

  // Social Media
  socialDownload:     (opts) => ipcRenderer.invoke('social-download', opts),
  socialExtractFrame: (opts) => ipcRenderer.invoke('social-extract-frame', opts),
  socialRender:       (opts) => ipcRenderer.invoke('social-render', opts),
  socialCancel:       ()     => ipcRenderer.send('social-cancel'),
  onSocialProgress: (cb) => {
    ipcRenderer.removeAllListeners('social-progress');
    ipcRenderer.on('social-progress', (_e, p) => cb(p));
  },
});
