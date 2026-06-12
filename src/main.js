const { app, BrowserWindow, ipcMain, dialog, shell, Menu, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const https = require('https');
const http  = require('http');

// ─── App info ────────────────────────────────────────────────────────────────
const APP_VERSION = '3.0.2';
const APP_VERSION_DATE = '6-8-26';
// URL to a JSON file you host: { "version": "2.1.0", "downloadUrl": "https://..." }
const APP_UPDATE_URL = 'https://ravdownloader-update.djcolinchristy.workers.dev/';

// ─── Platform ────────────────────────────────────────────────────────────────
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const EXE_SUFFIX = IS_WIN ? '.exe' : '';
const YTDLP_NAME   = IS_WIN ? 'yt-dlp.exe'   : 'yt-dlp';
const FFMPEG_NAME  = IS_WIN ? 'ffmpeg.exe'   : 'ffmpeg';
const FFPROBE_NAME = IS_WIN ? 'ffprobe.exe'  : 'ffprobe';

// ─── Binary paths ─────────────────────────────────────────────────────────────
const isDev = !app.isPackaged;

// In dev the local source-tree binary folder differs per platform (bin/ vs bin-mac/).
// In production both platforms unpack into process.resourcesPath/bin.
const DEV_BIN_FOLDER = IS_MAC ? 'bin-mac' : 'bin';

// Try multiple candidate locations in order, use the first one that contains yt-dlp
function findBinDir() {
  const candidates = isDev ? [
    path.join(__dirname, '..', DEV_BIN_FOLDER),
    path.join(__dirname, DEV_BIN_FOLDER),
    path.join(process.cwd(), DEV_BIN_FOLDER),
    path.join(app.getAppPath(), DEV_BIN_FOLDER),
  ] : [
    path.join(process.resourcesPath, 'bin'),
    path.join(path.dirname(app.getPath('exe')), 'resources', 'bin'),
  ];

  for (const c of candidates) {
    const ytdlp = path.join(c, YTDLP_NAME);
    if (fs.existsSync(ytdlp)) {
      return c;
    }
  }
  // Return the default even if not found — error will be shown to user
  return candidates[0];
}

const BIN_DIR = findBinDir();
const YTDLP   = path.join(BIN_DIR, YTDLP_NAME);
const FFMPEG  = path.join(BIN_DIR, FFMPEG_NAME);
const FFPROBE = path.join(BIN_DIR, FFPROBE_NAME);

// ─── Data paths ───────────────────────────────────────────────────────────────
const USER_DATA  = app.getPath('userData');
const STORE_PATH = path.join(USER_DATA, 'settings.json');
const LOG_DIR    = path.join(USER_DATA, 'logs');
const COOKIES_DIR  = path.join(USER_DATA, 'cookies');
const COOKIES_FILE = path.join(COOKIES_DIR, 'youtube-cookies.txt');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
ensureDir(LOG_DIR);
ensureDir(COOKIES_DIR);

// Check if installer left a welcome marker — if so, reset lastSeenVersion
const WELCOME_MARKER = path.join(USER_DATA, 'show-welcome');
if (fs.existsSync(WELCOME_MARKER)) {
  try {
    const s = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    delete s.lastSeenVersion;
    fs.writeFileSync(STORE_PATH, JSON.stringify(s, null, 2));
  } catch {}
  try { fs.unlinkSync(WELCOME_MARKER); } catch {}
}

function readStore() {
  try { return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')); }
  catch { return {}; }
}

function writeStore(data) {
  ensureDir(path.dirname(STORE_PATH));
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function logEntry(entry) {
  try {
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(LOG_DIR, `${date}.log`);
    let user = '';
    try { user = readStore().userName || ''; } catch {}
    const enriched = { user, ...entry };
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${JSON.stringify(enriched)}\n`);
  } catch {}
}

// Returns true if the file exists and is larger than 50KB (real binary, not placeholder text file)
function binaryOk(p) {
  try {
    if (!fs.existsSync(p)) return false;
    return fs.statSync(p).size > 50000;
  } catch { return false; }
}

// ─── Font path resolver ────────────────────────────────────────────────────
function resolveFontPath() {
  const candidates = isDev ? [
    path.join(__dirname, '..', 'fonts', 'ITC Avant Garde Gothic LT Bold.otf'),
    path.join(process.cwd(), 'fonts', 'ITC Avant Garde Gothic LT Bold.otf'),
  ] : [
    path.join(process.resourcesPath, 'fonts', 'ITC Avant Garde Gothic LT Bold.otf'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// ─── FFprobe aspect ratio detection ────────────────────────────────────────
async function probeVideoSize(filePath) {
  const { stdout, code } = await runExe(FFPROBE, [
    '-v', 'quiet',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0',
    filePath,
  ], 15000);
  if (code !== 0 || !stdout.trim()) return null;
  const parts = stdout.trim().split('\n')[0].split(',');
  const width = parseInt(parts[0], 10);
  const height = parseInt(parts[1], 10);
  if (!width || !height) return null;
  return { width, height };
}

// ─── FFmpeg filter escape ──────────────────────────────────────────────────
function escapeFFmpegText(text) {
  // Escape for FFmpeg drawtext text value wrapped in single quotes.
  // Inside '...': \\ → \, and ' always ends the quote (no way to escape it).
  // Replace apostrophes with Unicode right single quote (visually identical).
  // Colons need \: for drawtext's own text parser.
  return text
    .replace(/\\/g, '\\\\')     // \ → \\
    .replace(/'/g, '\u2019')     // ' → ' (right single quote, visually identical)
    .replace(/:/g, '\\:')        // : → \: (drawtext text escape)
    .replace(/%/g, '%%');         // % → %% (drawtext expression escape)
}

// ─── FFmpeg command builder (Advanced features) ────────────────────────────
function buildAdvancedFFmpegArgs({ inputPath, outputPath, trim, sourceName, fontPath, videoWidth, videoHeight, blurPillarbox, blurAmount, hardLimiter }) {
  const args = [];

  // Trim: input-side seek flags (before -i for fast seeking)
  if (trim) {
    if (trim.start) args.push('-ss', trim.start);
    if (trim.end) args.push('-to', trim.end);
  }

  args.push('-i', inputPath);

  // Determine what processing is needed
  const is16by9 = videoWidth && videoHeight && Math.abs((videoWidth / videoHeight) - (16 / 9)) < 0.02;
  const needsBlur = blurPillarbox && videoWidth && videoHeight && !is16by9;
  const needsBug = sourceName && sourceName.trim() && fontPath;

  if (needsBlur || needsBug) {
    // Build filter_complex chain
    const filterParts = [];
    let lastLabel;

    if (needsBlur) {
      const sigma = Math.round((blurAmount || 12) * 20 / 12);
      filterParts.push(`[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,gblur=sigma=${sigma}[bg]`);
      filterParts.push(`[0:v]scale=1280:720:force_original_aspect_ratio=decrease[fg]`);
      filterParts.push(`[bg][fg]overlay=(W-w)/2:(H-h)/2[composed]`);
      lastLabel = 'composed';
    } else {
      filterParts.push(`[0:v]scale=1280:720[composed]`);
      lastLabel = 'composed';
    }

    if (needsBug) {
      const text = escapeFFmpegText('SOURCE: ' + sourceName.trim().toUpperCase());
      const ffFontPath = fontPath.replace(/\\/g, '/').replace(/:/g, '\\:');

      // Blue box + text first (drawtext box=1 creates the blue background)
      // text at x=94, boxborderw=15 → box left edge at x=79 (adjacent to white bar)
      // text at fixed y=51 → box top at 51-15=36, box bottom ≈ 51+text_h+15
      filterParts.push(
        `[${lastLabel}]drawtext=fontfile='${ffFontPath}':text='${text}':fontcolor=white:fontsize=23:x=67:y=34:box=1:boxcolor=0x2166FF:boxborderw=10[withtext]`
      );
      filterParts.push(
        `[withtext]drawbox=x=50:y=24:w=7:h=37:color=white:t=fill[out]`
      );
      lastLabel = 'out';
    }

    // Strip the output label from the last filter (FFmpeg uses it as final output)
    const lastIdx = filterParts.length - 1;
    filterParts[lastIdx] = filterParts[lastIdx].replace(/\[[^\]]+\]$/, '');

    args.push('-filter_complex', filterParts.join(';'));
  } else {
    // Simple 16:9 scale — no filter_complex needed
    args.push('-vf', 'scale=1280:720');
  }

  if (hardLimiter) {
    args.push('-af', 'alimiter=limit=0.251189:level=0');
  }

  args.push(
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-y', outputPath
  );

  return args;
}

// Runs an EXE safely, returns { stdout, stderr, code }
function runExe(exePath, args, timeoutMs = 30000) {
  return new Promise((resolve) => {
    if (!binaryOk(exePath)) {
      resolve({ stdout: '', stderr: `Binary not found or invalid: ${exePath}`, code: -1 });
      return;
    }
    let stdout = '', stderr = '';
    let proc;
    try {
      proc = spawn(exePath, args, {
        windowsHide: true,
        env: { ...process.env, PATH: BIN_DIR + path.delimiter + (process.env.PATH || '') },
      });
    } catch (spawnErr) {
      resolve({ stdout: '', stderr: spawnErr.message, code: -1 });
      return;
    }
    const timer = setTimeout(() => {
      try { proc.kill(); } catch {}
      resolve({ stdout, stderr: 'Timed out', code: -2 });
    }, timeoutMs);
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => { clearTimeout(timer); resolve({ stdout, stderr, code }); });
    proc.on('error', err => { clearTimeout(timer); resolve({ stdout, stderr: err.message, code: -1 }); });
  });
}

// ─── Cookie helpers ──────────────────────────────────────────────────────────
// Returns the path to the active cookies file based on settings, or null if none
function getActiveCookiesPath() {
  const s = readStore();
  if (s.youtubeAuth === 'enabled' && fs.existsSync(COOKIES_FILE)) return COOKIES_FILE;
  return null;
}

// Convert Electron cookies to Netscape cookies.txt format
function cookiesToNetscape(cookies) {
  const lines = ['# Netscape HTTP Cookie File', '# This file was generated by RAVdownloader', ''];
  for (const c of cookies) {
    const domain     = c.domain.startsWith('.') ? c.domain : '.' + c.domain;
    const flag       = 'TRUE';
    const cookiePath = c.path || '/';
    const secure     = c.secure ? 'TRUE' : 'FALSE';
    const expiry     = c.expirationDate ? Math.round(c.expirationDate) : 0;
    lines.push(`${domain}\t${flag}\t${cookiePath}\t${secure}\t${expiry}\t${c.name}\t${c.value}`);
  }
  return lines.join('\n') + '\n';
}

// ─── PDF to PNG/JPG (using pdfjs-dist in a hidden renderer) ──────────────────
async function convertPdfToImage(inputPath, outputDir, baseName, imgFormat = 'png') {
  return new Promise(async (resolveOuter) => {
    let pdfWin;
    try {
      pdfWin = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });

      await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
        '<html><body><canvas id="c"></canvas></body></html>'
      ));

      // Resolve the worker path from the main process where require.resolve works
      let workerSrcPath = '';
      try { workerSrcPath = require.resolve('pdfjs-dist/build/pdf.worker.js'); } catch {}

      const result = await pdfWin.webContents.executeJavaScript(`
        (async () => {
          const fs = require('fs');
          const pathMod = require('path');
          let pdfjsLib;
          try { pdfjsLib = require('pdfjs-dist/build/pdf'); }
          catch { try { pdfjsLib = require('pdfjs-dist/legacy/build/pdf'); }
          catch(e) { return { success: false, error: 'pdfjs-dist not available: ' + e.message }; } }

          // Pre-load the worker module into globalThis so pdfjs finds it
          // without trying to load a script (which fails from data: URLs)
          try {
            const workerModule = require(${JSON.stringify(workerSrcPath)});
            globalThis.pdfjsWorker = workerModule;
          } catch(e) {}
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'unused';

          try {
            const data = new Uint8Array(fs.readFileSync(${JSON.stringify(inputPath)}));
            const pdf = await pdfjsLib.getDocument({ data, disableWorker: true }).promise;
            const canvas = document.getElementById('c');
            const ctx = canvas.getContext('2d');

            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const viewport = page.getViewport({ scale: 2.0 });
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              await page.render({ canvasContext: ctx, viewport }).promise;

              const imgFormat = ${JSON.stringify(imgFormat)};
              const mime = imgFormat === 'jpg' ? 'image/jpeg' : 'image/png';
              const dataUrl = imgFormat === 'jpg'
                ? canvas.toDataURL('image/jpeg', 0.92)
                : canvas.toDataURL('image/png');
              const b64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
              const outFile = pathMod.join(
                ${JSON.stringify(outputDir)},
                ${JSON.stringify(baseName)} + '_page_' + String(i).padStart(3, '0') + '.' + imgFormat
              );
              fs.writeFileSync(outFile, Buffer.from(b64, 'base64'));
            }
            return { success: true, pageCount: pdf.numPages };
          } catch(err) {
            return { success: false, error: err.message || String(err) };
          }
        })()
      `);

      pdfWin.close();
      pdfWin = null;

      if (result.success) {
        resolveOuter({ success: true, outputPath: outputDir });
      } else {
        resolveOuter({ success: false, error: result.error });
      }
    } catch (err) {
      if (pdfWin) try { pdfWin.close(); } catch {}
      resolveOuter({ success: false, error: err.message });
    }
  });
}

// ─── Window ───────────────────────────────────────────────────────────────────
const activeProcs = new Map();
let mainWindow;

function buildMacMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const windowOpts = {
    width: 1200, height: 820,
    minWidth: 960, minHeight: 660,
    transparent: false,
    backgroundColor: '#0a0820',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  };
  if (IS_MAC) {
    // Show native traffic lights but keep the custom dark title bar area for branding/drag.
    windowOpts.titleBarStyle = 'hiddenInset';
    windowOpts.trafficLightPosition = { x: 18, y: 18 };
  } else {
    // Windows: frameless, custom min/max/close buttons in the renderer.
    windowOpts.frame = false;
    windowOpts.icon = path.join(__dirname, '..', 'assets', 'icon.ico');
  }

  mainWindow = new BrowserWindow(windowOpts);

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Native right-click context menu for editable fields
  mainWindow.webContents.on('context-menu', (_e, params) => {
    if (params.isEditable) {
      Menu.buildFromTemplate([
        { label: 'Cut',        role: 'cut',       enabled: params.selectionText.length > 0 },
        { label: 'Copy',       role: 'copy',      enabled: params.selectionText.length > 0 },
        { label: 'Paste',      role: 'paste' },
        { type: 'separator' },
        { label: 'Select All', role: 'selectAll' },
      ]).popup({ window: mainWindow });
    }
  });

  if (IS_MAC) {
    buildMacMenu();
  } else {
    Menu.setApplicationMenu(null);
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ─── Window controls ──────────────────────────────────────────────────────────
ipcMain.on('win-minimize', () => mainWindow?.minimize());
ipcMain.on('win-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('win-close',    () => mainWindow?.close());

// ─── Settings ─────────────────────────────────────────────────────────────────
ipcMain.handle('get-settings', () => {
  const s = readStore();
  if (!s.downloadPath) s.downloadPath = path.join(app.getPath('downloads'), 'RAVdownloader');
  return s;
});

ipcMain.handle('set-settings', (_e, data) => {
  const s = readStore();
  Object.assign(s, data);
  writeStore(s);
  return s;
});

// ─── Choose download folder ───────────────────────────────────────────────────
ipcMain.handle('choose-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Choose Download Folder',
  });
  if (!result.canceled && result.filePaths[0]) {
    const p = result.filePaths[0];
    const s = readStore();
    s.downloadPath = p;
    writeStore(s);
    return p;
  }
  return null;
});

ipcMain.handle('open-folder', (_e, p) => {
  const target = p || readStore().downloadPath || app.getPath('downloads');
  ensureDir(target);
  return shell.openPath(target);
});

ipcMain.handle('open-log-folder', () => {
  ensureDir(LOG_DIR);
  return shell.openPath(LOG_DIR);
});

// ─── Get formats (quality picker) ─────────────────────────────────────────────
ipcMain.handle('get-formats', async (_e, url) => {
  if (!binaryOk(YTDLP)) {
    return { error: `${YTDLP_NAME} not found.\n\nExpected location:\n${YTDLP}\n\nPlease place ${YTDLP_NAME} in the bin/ folder.` };
  }

  const fmtArgs = [
    '--dump-single-json',
    '--no-playlist',
    '--no-warnings',
    '--skip-download',
    '--extractor-args', 'youtube:skip=translated_subs',
  ];
  const cookiesPath = getActiveCookiesPath();
  if (cookiesPath) {
    fmtArgs.push('--cookies', cookiesPath);
  } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
    fmtArgs.push('--extractor-args', 'youtube:player_client=web,default');
  }
  fmtArgs.push(url);

  const { stdout, stderr, code } = await runExe(YTDLP, fmtArgs, 60000);

  if (code !== 0 || !stdout.trim()) {
    return { error: (stderr || 'yt-dlp returned no data.') + '\n\nCheck the URL and try again.' };
  }

  try {
    const info = JSON.parse(stdout);
    const allFormats = info.formats || [];
    const seen = new Set();
    const qualities = [];

    // Always offer BEST first
    qualities.push({
      label: '⭐  BEST Quality (Auto)',
      formatId: 'bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]+bestaudio/bestvideo+bestaudio/best*[ext=mp4]/best*',
      resolution: 'best',
      isBest: true,
    });

    // Specific resolutions
    allFormats
      .filter(f => f.height && f.height >= 144)
      .sort((a, b) => (b.height || 0) - (a.height || 0))
      .forEach(f => {
        if (!seen.has(f.height)) {
          seen.add(f.height);
          const fps = (f.fps && f.fps > 30) ? ` ${Math.round(f.fps)}fps` : '';
          qualities.push({
            label: `${f.height}p${fps}`,
            formatId: `bestvideo[height<=${f.height}][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=${f.height}][vcodec^=avc1]+bestaudio/bestvideo[height<=${f.height}]+bestaudio/best[height<=${f.height}]/best*[ext=mp4]/best*`,
            resolution: f.height,
          });
        }
      });

    return { qualities, title: info.title || url, thumbnail: info.thumbnail };
  } catch (err) {
    return { error: 'Could not parse video info: ' + err.message };
  }
});

// ─── Start download ───────────────────────────────────────────────────────────
ipcMain.handle('start-download', async (_e, { id, url, type, formatId, bandwidth, playlistStart, playlistEnd, advanced }) => {
  if (!binaryOk(YTDLP)) {
    return { success: false, error: `${YTDLP_NAME} not found in bin/ folder.\n\nExpected: ${YTDLP}` };
  }

  const settings = readStore();
  const dlPath = settings.downloadPath || path.join(app.getPath('downloads'), 'RAVdownloader');
  ensureDir(dlPath);

  const args = [];

  if (type === 'mp3') {
    const filenameTemplate = (advanced && advanced.customFilename)
      ? advanced.customFilename + '.%(ext)s'
      : '%(title)s.%(ext)s';
    args.push(
      '-x', '--audio-format', 'mp3', '--audio-quality', '0',
      '--ffmpeg-location', BIN_DIR,
      '-o', path.join(dlPath, filenameTemplate),
      '--no-playlist', '--newline',
      '--force-overwrites',
    );
  } else {
    if (!binaryOk(FFMPEG)) {
      return { success: false, error: `${FFMPEG_NAME} not found in bin/ folder.\n\nExpected: ${FFMPEG}` };
    }
    const filenameTemplate = (advanced && advanced.customFilename)
      ? advanced.customFilename + '.%(ext)s'
      : '%(title)s - %(height)sp.%(ext)s';
    let fmt;
    if (advanced && advanced.videoOnly) {
      // Video only — strip audio portion from format string
      fmt = formatId
        ? formatId.replace(/\+bestaudio[^\s/]*/g, '').replace(/\/+/g, '/')
        : 'bestvideo[vcodec^=avc1]/bestvideo/best*[ext=mp4]/best*';
    } else {
      fmt = formatId || 'bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]+bestaudio/bestvideo+bestaudio/best*[ext=mp4]/best*';
    }
    args.push(
      '-f', fmt,
      '--merge-output-format', 'mp4',
      '--ffmpeg-location', BIN_DIR,
      '-o', path.join(dlPath, filenameTemplate),
      '--newline',
      '--force-overwrites',
    );
    if (playlistStart || playlistEnd) {
      if (playlistStart) args.push('--playlist-start', String(playlistStart));
      if (playlistEnd)   args.push('--playlist-end',   String(playlistEnd));
    } else {
      args.push('--no-playlist');
    }
  }

  if (bandwidth && bandwidth > 0) args.push('-r', `${bandwidth}K`);
  const cookiesPath = getActiveCookiesPath();
  if (cookiesPath) {
    args.push('--cookies', cookiesPath);
  } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
    // Fix for public non-age-restricted videos failing without auth
    args.push('--extractor-args', 'youtube:player_client=web,default');
  }
  args.push(url);

  logEntry({ event: 'download-start', id, url, type, formatId, cmd: [YTDLP, ...args].join(' ') });

  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(YTDLP, args, {
        windowsHide: true,
        env: { ...process.env, PATH: BIN_DIR + path.delimiter + (process.env.PATH || '') },
      });
    } catch (spawnErr) {
      resolve({ success: false, error: 'Failed to start yt-dlp: ' + spawnErr.message });
      return;
    }

    activeProcs.set(id, proc);
    let stderrBuf = '';
    let mergedFile = '';
    let lastOutputTime = Date.now();
    const staleCheckTimer = setInterval(() => {
      if (Date.now() - lastOutputTime > 300000) { // 5 min no output
        clearInterval(staleCheckTimer);
        try { proc.kill(); } catch {}
        mainWindow?.webContents.send('dl-progress', { id, line: 'Download/merge timed out (no progress for 5 min)' });
        logEntry({ event: 'download-stale-timeout', id });
      }
    }, 15000);

    proc.stdout.on('data', d => {
      lastOutputTime = Date.now();
      d.toString().split('\n').forEach(line => {
        const l = line.trim();
        if (l) {
          // Capture the final output filename from yt-dlp (multiple patterns)
          const mergeMatch   = l.match(/^\[Merger\] Merging formats into "(.+)"$/);
          const destMatch    = l.match(/^\[download\] Destination: (.+)$/);
          const alreadyMatch = l.match(/^\[download\] (.+\.mp4) has already been downloaded$/);
          const moveMatch    = l.match(/^\[MoveFiles\] Moving file ".*" to "(.+)"$/);
          const ffmpegMatch  = l.match(/^\[ffmpeg\] Merging formats into "(.+)"$/);
          const extractMatch = l.match(/^\[ExtractAudio\] Destination: (.+)$/);
          if (mergeMatch)   mergedFile = mergeMatch[1];
          else if (ffmpegMatch) mergedFile = ffmpegMatch[1];
          else if (moveMatch)   mergedFile = moveMatch[1];
          else if (extractMatch) mergedFile = extractMatch[1];
          else if (!mergedFile && destMatch && destMatch[1].endsWith('.mp4')) mergedFile = destMatch[1];
          else if (alreadyMatch) mergedFile = alreadyMatch[1];
          mainWindow?.webContents.send('dl-progress', { id, line: l });
        }
      });
    });

    proc.stderr.on('data', d => {
      lastOutputTime = Date.now();
      const s = d.toString();
      stderrBuf += s;
      s.split('\n').forEach(line => {
        const l = line.trim();
        if (l) mainWindow?.webContents.send('dl-progress', { id, line: l });
      });
    });

    proc.on('error', err => {
      clearInterval(staleCheckTimer);
      activeProcs.delete(id);
      logEntry({ event: 'download-spawn-error', id, error: err.message });
      resolve({ success: false, error: 'Spawn error: ' + err.message });
    });

    proc.on('close', async (code) => {
      clearInterval(staleCheckTimer);
      activeProcs.delete(id);
      logEntry({ event: 'download-end', id, code, mergedFile, hasAdvanced: !!advanced, stderr: stderrBuf.slice(0, 500) });
      if (code !== 0) {
        resolve({ success: false, error: stderrBuf.slice(-800) || `Process exited with code ${code}` });
        return;
      }

      // Fallback: if mergedFile wasn't captured or doesn't exist, find newest .mp4 in download dir
      if (type !== 'mp3' && (!mergedFile || !fs.existsSync(mergedFile))) {
        try {
          const files = fs.readdirSync(dlPath)
            .filter(f => f.endsWith('.mp4'))
            .map(f => ({ name: f, time: fs.statSync(path.join(dlPath, f)).mtimeMs }))
            .sort((a, b) => b.time - a.time);
          if (files.length && (Date.now() - files[0].time) < 60000) {
            mergedFile = path.join(dlPath, files[0].name);
            logEntry({ event: 'mergedFile-fallback', id, file: mergedFile });
          }
        } catch {}
      }

      // Check if the downloaded video needs re-encoding for Premiere compatibility
      if (type !== 'mp3' && mergedFile && binaryOk(FFMPEG) && fs.existsSync(mergedFile)) {
        try {
          const probe = await runExe(
            FFPROBE,
            ['-v', 'quiet', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', mergedFile],
            10000
          );
          const codec = probe.stdout.trim().split('\n')[0];
          if (codec && codec !== 'h264' && codec !== 'mpeg4') {
            mainWindow?.webContents.send('dl-progress', { id, line: `Re-encoding ${codec} → H.264 for Premiere compatibility...` });
            logEntry({ event: 'reencode-start', id, codec, file: mergedFile });
            const tmpOut = mergedFile.replace(/\.mp4$/i, '_h264.mp4');
            const enc = await new Promise((res) => {
              let encProc;
              try {
                encProc = spawn(FFMPEG, [
                  '-i', mergedFile,
                  '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
                  '-c:a', 'aac', '-b:a', '192k',
                  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                  '-y', tmpOut,
                ], { windowsHide: true });
              } catch (e) { res({ success: false }); return; }
              let lastActivity = Date.now();
              const staleTimer = setInterval(() => {
                if (Date.now() - lastActivity > 300000) { // 5 min no activity
                  clearInterval(staleTimer);
                  try { encProc.kill(); } catch {}
                  mainWindow?.webContents.send('dl-progress', { id, line: 'Re-encode timed out (no progress for 5 min) — keeping original' });
                  logEntry({ event: 'reencode-timeout', id });
                  res({ success: false });
                }
              }, 10000);
              encProc.stderr.on('data', d => {
                lastActivity = Date.now();
                const progressLine = d.toString().trim();
                if (progressLine.includes('frame=') || progressLine.includes('time=')) {
                  mainWindow?.webContents.send('dl-progress', { id, line: `Re-encoding: ${progressLine.slice(-80)}` });
                }
              });
              encProc.on('error', () => { clearInterval(staleTimer); res({ success: false }); });
              encProc.on('close', c => { clearInterval(staleTimer); res({ success: c === 0 }); });
            });
            if (enc.success && fs.existsSync(tmpOut)) {
              fs.unlinkSync(mergedFile);
              fs.renameSync(tmpOut, mergedFile);
              mainWindow?.webContents.send('dl-progress', { id, line: 'Re-encode complete — Premiere compatible' });
              logEntry({ event: 'reencode-done', id, file: mergedFile });
            } else {
              // Clean up failed re-encode, keep original
              try { fs.unlinkSync(tmpOut); } catch {}
              logEntry({ event: 'reencode-failed', id, file: mergedFile });
            }
          }
        } catch (probeErr) {
          logEntry({ event: 'probe-error', id, error: probeErr.message });
        }
      }

      // ── Advanced post-processing (blur pillarbox, trim, source bug) ──
      const _ffmpegOk = binaryOk(FFMPEG);
      const _fileExists = mergedFile ? fs.existsSync(mergedFile) : false;
      logEntry({
        event: 'advanced-check', id,
        mergedFile: mergedFile || '(empty)',
        hasAdvanced: !!advanced,
        advanced: advanced || null,
        ffmpegPath: FFMPEG,
        ffmpegOk: _ffmpegOk,
        fileExists: _fileExists,
        type,
      });
      if (type !== 'mp3' && mergedFile && advanced && _ffmpegOk && _fileExists) {
        try {
          const hasTrim = advanced.trim && (advanced.trim.start || advanced.trim.end);
          const hasSourceBug = advanced.sourceName && advanced.sourceName.trim();
          const fontPath = hasSourceBug ? resolveFontPath() : null;
          logEntry({ event: 'advanced-flags', id, hasTrim, hasSourceBug, fontPath: fontPath || '(none)' });

          // Probe video dimensions for blur pillarbox detection
          let videoSize = null;
          try {
            videoSize = await probeVideoSize(mergedFile);
          } catch (e) {
            logEntry({ event: 'advanced-probe-error', id, error: e.message });
          }
          logEntry({ event: 'advanced-probe-result', id, videoSize });

          const hasBlur = advanced.blurPillarbox;
          const hasLimiter = advanced.hardLimiter;
          const needsAdvanced = hasTrim || (hasSourceBug && fontPath) || (hasBlur && videoSize) || hasLimiter;
          if (needsAdvanced) {
            mainWindow?.webContents.send('dl-progress', { id, line: 'Applying advanced processing (blur pillarbox / trim / source bug)...' });

            const tmpOut = mergedFile.replace(/\.mp4$/i, '_advanced.mp4');
            const ffmpegArgs = buildAdvancedFFmpegArgs({
              inputPath: mergedFile,
              outputPath: tmpOut,
              trim: hasTrim ? advanced.trim : null,
              sourceName: hasSourceBug ? advanced.sourceName : null,
              fontPath: fontPath,
              videoWidth: videoSize ? videoSize.width : 1280,
              videoHeight: videoSize ? videoSize.height : 720,
              blurPillarbox: advanced.blurPillarbox || false,
              blurAmount: advanced.blurAmount || 12,
              hardLimiter: advanced.hardLimiter || false,
            });
            logEntry({ event: 'advanced-start', id, file: mergedFile, ffmpegArgs: [FFMPEG, ...ffmpegArgs].join(' ') });

            let ffmpegStderr = '';
            const advResult = await new Promise((res) => {
              let advProc;
              try {
                advProc = spawn(FFMPEG, ffmpegArgs, { windowsHide: true });
              } catch (e) {
                logEntry({ event: 'advanced-spawn-error', id, error: e.message });
                res({ success: false });
                return;
              }
              let lastActivity = Date.now();
              const staleTimer = setInterval(() => {
                if (Date.now() - lastActivity > 300000) { // 5 min no activity
                  clearInterval(staleTimer);
                  try { advProc.kill(); } catch {}
                  mainWindow?.webContents.send('dl-progress', { id, line: 'Advanced processing timed out (no progress for 5 min) — keeping original' });
                  logEntry({ event: 'advanced-timeout', id });
                  res({ success: false });
                }
              }, 10000);
              advProc.stderr.on('data', d => {
                lastActivity = Date.now();
                const chunk = d.toString();
                ffmpegStderr += chunk;
                const progressLine = chunk.trim();
                if (progressLine.includes('frame=') || progressLine.includes('time=')) {
                  mainWindow?.webContents.send('dl-progress', { id, line: `Processing: ${progressLine.slice(-80)}` });
                }
              });
              advProc.on('error', (err) => {
                clearInterval(staleTimer);
                logEntry({ event: 'advanced-proc-error', id, error: err.message });
                res({ success: false });
              });
              advProc.on('close', c => {
                clearInterval(staleTimer);
                logEntry({ event: 'advanced-proc-close', id, code: c, stderr: ffmpegStderr.slice(-500) });
                res({ success: c === 0 });
              });
            });

            if (advResult.success && fs.existsSync(tmpOut)) {
              fs.unlinkSync(mergedFile);
              fs.renameSync(tmpOut, mergedFile);
              mainWindow?.webContents.send('dl-progress', { id, line: 'Advanced processing complete' });
              logEntry({ event: 'advanced-done', id, file: mergedFile });
            } else {
              try { fs.unlinkSync(tmpOut); } catch {}
              mainWindow?.webContents.send('dl-progress', { id, line: 'Advanced processing failed — keeping original file' });
              logEntry({ event: 'advanced-failed', id, file: mergedFile });
            }
          } else {
            logEntry({ event: 'advanced-skip', id, reason: 'needsAdvanced is false' });
          }
        } catch (advErr) {
          logEntry({ event: 'advanced-exception', id, error: advErr.message, stack: advErr.stack });
        }
      }

      if (type === 'mp3' && advanced && advanced.hardLimiter && mergedFile && binaryOk(FFMPEG) && fs.existsSync(mergedFile)) {
        mainWindow?.webContents.send('dl-progress', { id, line: 'Applying -12dB hard limiter...' });
        const tmpMp3 = mergedFile.replace(/\.mp3$/i, '_limited.mp3');
        const limResult = await new Promise((res) => {
          let limProc;
          try {
            limProc = spawn(FFMPEG, [
              '-i', mergedFile,
              '-af', 'alimiter=limit=0.251189:level=0',
              '-c:v', 'copy', '-y', tmpMp3
            ], { windowsHide: true });
          } catch (e) { res({ success: false }); return; }
          limProc.on('error', () => res({ success: false }));
          limProc.on('close', c => res({ success: c === 0 }));
        });
        if (limResult.success && fs.existsSync(tmpMp3)) {
          fs.unlinkSync(mergedFile);
          fs.renameSync(tmpMp3, mergedFile);
          logEntry({ event: 'mp3-limiter-done', id });
        } else {
          try { fs.unlinkSync(tmpMp3); } catch {}
        }
      }

      resolve({ success: true });
    });
  });
});

// ─── Pause (kill) download ────────────────────────────────────────────────────
ipcMain.handle('pause-download', (_e, id) => {
  const proc = activeProcs.get(id);
  if (proc) {
    try { proc.kill('SIGTERM'); } catch {}
    setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 500);
    activeProcs.delete(id);
  }
  return true;
});

// ─── yt-dlp version ───────────────────────────────────────────────────────────
ipcMain.handle('get-ytdlp-version', async () => {
  if (!binaryOk(YTDLP)) return `${YTDLP_NAME} not found in bin/`;
  const { stdout, code } = await runExe(YTDLP, ['--version'], 10000);
  return (code === 0 && stdout.trim()) ? stdout.trim() : 'Error reading version';
});

// ─── Check for yt-dlp update (no download) ───────────────────────────────────
ipcMain.handle('check-ytdlp-update', async () => {
  // Get current version
  let currentVersion = '';
  if (binaryOk(YTDLP)) {
    const { stdout, code } = await runExe(YTDLP, ['--version'], 10000);
    if (code === 0) currentVersion = stdout.trim();
  }

  // Fetch latest nightly tag from GitHub
  return new Promise((resolve) => {
    const apiUrl = 'https://api.github.com/repos/yt-dlp/yt-dlp-nightly-builds/releases/latest';
    const req = https.get(apiUrl, { headers: { 'User-Agent': 'RAVdownloader/2.0' } }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const release = JSON.parse(body);
          const latestVersion = release.tag_name || '';
          const updateAvailable = currentVersion !== latestVersion && latestVersion.length > 0;
          resolve({ currentVersion, latestVersion, updateAvailable });
        } catch {
          resolve({ currentVersion, latestVersion: '', updateAvailable: false });
        }
      });
    });
    req.on('error', () => resolve({ currentVersion, latestVersion: '', updateAvailable: false }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ currentVersion, latestVersion: '', updateAvailable: false }); });
  });
});

// ─── Update yt-dlp ────────────────────────────────────────────────────────────
ipcMain.handle('update-ytdlp', (_e, useNightly = true) => {
  return new Promise((resolve) => {
    const tmpPath    = YTDLP + '.tmp';
    const backupPath = YTDLP + '.bak';
    const send = msg => mainWindow?.webContents.send('update-progress', msg);

    // Use nightly builds repo for latest features
    const repo = useNightly
      ? 'yt-dlp/yt-dlp-nightly-builds'
      : 'yt-dlp/yt-dlp';
    send(`Fetching latest ${useNightly ? 'nightly' : 'stable'} release from GitHub...`);

    const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
    const req = https.get(apiUrl, { headers: { 'User-Agent': 'RAVdownloader/2.0' } }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        let downloadUrl = '';
        let tagName = '';
        try {
          const release = JSON.parse(body);
          tagName = release.tag_name || '';
          // Windows: yt-dlp.exe asset. Mac: yt-dlp_macos (universal binary).
          const ytdlpAssetName = IS_WIN ? 'yt-dlp.exe' : 'yt-dlp_macos';
          const asset = (release.assets || []).find(a => a.name === ytdlpAssetName);
          if (!asset) { resolve({ success: false, error: `${ytdlpAssetName} asset not found in latest release` }); return; }
          downloadUrl = asset.browser_download_url;
          send(`Found ${tagName}. Downloading ${ytdlpAssetName}...`);
        } catch (err) {
          resolve({ success: false, error: 'GitHub parse error: ' + err.message });
          return;
        }

        // Download the file
        let fileStream;
        try {
          ensureDir(BIN_DIR);
          fileStream = fs.createWriteStream(tmpPath);
        } catch (err) {
          resolve({ success: false, error: 'Cannot write to bin folder: ' + err.message });
          return;
        }

        const followRedirect = (url, hops) => {
          if (hops > 10) { resolve({ success: false, error: 'Too many redirects' }); return; }
          const mod = url.startsWith('https') ? https : http;
          mod.get(url, { headers: { 'User-Agent': 'RAVdownloader/2.0' } }, (res2) => {
            if ([301, 302, 307, 308].includes(res2.statusCode) && res2.headers.location) {
              followRedirect(res2.headers.location, hops + 1);
              return;
            }
            const totalBytes = parseInt(res2.headers['content-length'], 10) || 0;
            let downloaded = 0;
            let lastPctSent = -1;
            res2.on('data', chunk => {
              downloaded += chunk.length;
              const pct = totalBytes > 0 ? Math.round((downloaded / totalBytes) * 100) : 0;
              if (pct !== lastPctSent) {
                lastPctSent = pct;
                mainWindow?.webContents.send('ytdlp-download-progress', { downloaded, totalBytes, pct });
              }
            });
            res2.pipe(fileStream);
            fileStream.on('finish', () => {
              fileStream.close(() => {
                send('Installing update...');
                // Back up then replace — use a timeout to let file handles close on Windows
                setTimeout(() => {
                  try {
                    if (binaryOk(YTDLP)) fs.copyFileSync(YTDLP, backupPath);
                    fs.copyFileSync(tmpPath, YTDLP);
                    try { fs.unlinkSync(tmpPath); } catch {}
                    // Mac/Linux: downloaded binary must be marked executable
                    if (!IS_WIN) {
                      try { fs.chmodSync(YTDLP, 0o755); } catch {}
                    }

                    // Verify after short delay
                    setTimeout(() => {
                      runExe(YTDLP, ['--version'], 10000).then(({ stdout, code }) => {
                        const v = (code === 0 && stdout.trim()) ? stdout.trim() : tagName;
                        send(`✓ Updated to ${v}`);
                        resolve({ success: true, version: v });
                      });
                    }, 600);
                  } catch (replaceErr) {
                    if (fs.existsSync(backupPath)) { try { fs.copyFileSync(backupPath, YTDLP); } catch {} }
                    try { fs.unlinkSync(tmpPath); } catch {}
                    resolve({ success: false, error: 'Replace failed: ' + replaceErr.message });
                  }
                }, 800);
              });
            });
          }).on('error', err => {
            try { fs.unlinkSync(tmpPath); } catch {}
            resolve({ success: false, error: 'Download error: ' + err.message });
          });
        };
        followRedirect(downloadUrl, 0);
      });
    });
    req.on('error', err => resolve({ success: false, error: 'Network error: ' + err.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ success: false, error: 'GitHub request timed out' }); });
  });
});

// ─── Supported sites ──────────────────────────────────────────────────────────
ipcMain.handle('get-supported-sites', async () => {
  if (!binaryOk(YTDLP)) {
    return { error: `${YTDLP_NAME} not found.\n\nExpected location:\n${YTDLP}` };
  }
  const { stdout, stderr, code } = await runExe(YTDLP, ['--list-extractors'], 30000);
  if (code !== 0) return { error: stderr || 'Failed to list extractors' };
  const sites = stdout.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith(':'));
  return { sites };
});

// ─── File chooser ─────────────────────────────────────────────────────────────
ipcMain.handle('choose-files', async (_e, { title, filters }) => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: title || 'Select Files',
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
  });
  return r.canceled ? [] : r.filePaths;
});

// ─── Convert ─────────────────────────────────────────────────────────────────
ipcMain.handle('convert-file', (_e, { inputPath, outputFormat, outputDir }) => {
  return new Promise((resolve) => {
    if (!binaryOk(FFMPEG)) {
      resolve({ success: false, error: `${FFMPEG_NAME} not found in bin/ folder.\n\nExpected: ${FFMPEG}` });
      return;
    }
    const base = path.basename(inputPath, path.extname(inputPath));
    const outPath = path.join(outputDir, `${base}_converted.${outputFormat}`);
    ensureDir(outputDir);

    let args;
    if (outputFormat === 'png') {
      args = ['-i', inputPath, '-y', outPath];
    } else if (outputFormat === 'jpg' || outputFormat === 'jpeg') {
      // High-quality JPEG (q:v 2 ≈ quality 90). yuvj420p ensures broad compatibility.
      args = ['-i', inputPath, '-q:v', '2', '-pix_fmt', 'yuvj420p', '-y', outPath];
    } else if (outputFormat === 'pdf-png' || outputFormat === 'pdf-jpg') {
      const imgFmt = outputFormat === 'pdf-jpg' ? 'jpg' : 'png';
      convertPdfToImage(inputPath, outputDir, base, imgFmt)
        .then(result => {
          logEntry({ event: 'convert', inputPath, outputFormat, code: result.success ? 0 : 1 });
          resolve(result);
        })
        .catch(err => {
          logEntry({ event: 'convert', inputPath, outputFormat, error: err.message, code: 1 });
          resolve({ success: false, error: err.message });
        });
      return;
    } else {
      args = ['-i', inputPath,
         '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
         '-c:a', 'aac', '-b:a', '192k',
         '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', outPath];
    }

    let proc;
    try {
      proc = spawn(FFMPEG, args, { windowsHide: true });
    } catch (err) {
      resolve({ success: false, error: err.message });
      return;
    }
    let stderr = '';
    proc.stderr.on('data', d => stderr += d);
    proc.on('error', err => resolve({ success: false, error: err.message }));
    proc.on('close', code => {
      logEntry({ event: 'convert', inputPath, outPath, code });
      resolve(code === 0 ? { success: true, outputPath: outPath } : { success: false, error: stderr.slice(-400) });
    });
  });
});

// ─── Extract audio from video file ───────────────────────────────────────────
ipcMain.handle('extract-audio', (_e, { inputPath, hardLimiter, trim, customFilename, outputDir }) => {
  return new Promise((resolve) => {
    if (!binaryOk(FFMPEG)) return resolve({ success: false, error: 'ffmpeg not found' });
    if (!inputPath || !fs.existsSync(inputPath)) return resolve({ success: false, error: 'Input file not found' });

    const baseName = customFilename || path.basename(inputPath, path.extname(inputPath)) + '_audio';
    const outDir = outputDir || path.dirname(inputPath);
    ensureDir(outDir);
    const outPath = path.join(outDir, baseName + '.mp3');

    const args = [];

    // Trim: input-side seek (before -i for fast seeking)
    if (trim) {
      if (trim.start) args.push('-ss', trim.start);
      if (trim.end) args.push('-to', trim.end);
    }

    args.push('-i', inputPath);
    args.push('-vn'); // no video

    // Audio codec — high quality VBR MP3
    args.push('-codec:a', 'libmp3lame', '-q:a', '0');

    // Hard limiter
    if (hardLimiter) {
      args.push('-af', 'alimiter=limit=0.251189:level=0');
    }

    args.push('-y', outPath);

    logEntry({ event: 'extract-audio-start', inputPath, outPath, hardLimiter, trim });
    mainWindow?.webContents.send('extract-progress', 'Extracting audio...');

    let proc;
    try {
      proc = spawn(FFMPEG, args, { windowsHide: true });
    } catch (err) {
      return resolve({ success: false, error: err.message });
    }

    let stderr = '';
    proc.stderr.on('data', d => {
      const chunk = d.toString();
      stderr += chunk;
      const line = chunk.trim();
      if (line.includes('time=') || line.includes('size=')) {
        const timeMatch = line.match(/time=(\S+)/);
        mainWindow?.webContents.send('extract-progress', 'Extracting: ' + (timeMatch ? timeMatch[1] : line.slice(-60)));
      }
    });

    proc.on('error', err => {
      logEntry({ event: 'extract-audio-error', error: err.message });
      resolve({ success: false, error: err.message });
    });

    proc.on('close', code => {
      logEntry({ event: 'extract-audio-done', code, outPath });
      if (code === 0 && fs.existsSync(outPath)) {
        mainWindow?.webContents.send('extract-progress', 'Done!');
        resolve({ success: true, outputPath: outPath });
      } else {
        mainWindow?.webContents.send('extract-progress', 'Failed');
        resolve({ success: false, error: stderr.slice(-400) });
      }
    });
  });
});

// ─── Lower Third Generator ──────────────────────────────────────────────────
function resolveLtDir() {
  const folderName = 'LowerThird Files';
  const candidates = isDev ? [
    path.join(__dirname, '..', folderName),
    path.join(process.cwd(), folderName),
    path.join(app.getAppPath(), folderName),
  ] : [
    path.join(process.resourcesPath, folderName),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

ipcMain.handle('get-lt-files', () => {
  const ltDir = resolveLtDir();
  if (!ltDir) return { error: 'LowerThird Files folder not found' };

  const movPath = path.join(ltDir, 'GENERIC LOWER.mov');
  const pngPath = path.join(ltDir, 'GENERIC LOWER.png');
  const fontPath = path.join(ltDir, 'ITC Avant Garde Gothic LT Bold.otf');

  const missing = [];
  if (!fs.existsSync(movPath)) missing.push('GENERIC LOWER.mov');
  if (!fs.existsSync(pngPath)) missing.push('GENERIC LOWER.png');
  if (!fs.existsSync(fontPath)) missing.push('ITC Avant Garde Gothic LT Bold.otf');

  if (missing.length) return { error: 'Missing files in LowerThird Files: ' + missing.join(', ') };

  // Return base64 data for renderer (PNG preview + font for canvas)
  const pngData = fs.readFileSync(pngPath).toString('base64');
  const fontData = fs.readFileSync(fontPath).toString('base64');

  return {
    success: true,
    movPath,
    pngPath,
    fontPath,
    pngBase64: 'data:image/png;base64,' + pngData,
    fontBase64: 'data:font/opentype;base64,' + fontData,
  };
});

ipcMain.handle('generate-lower-third', async (_e, { line1, line2, fontSize1, fontSize2, x1, y1, x2, y2, duration, forceUppercase }) => {
  if (!binaryOk(FFMPEG)) return { success: false, error: `${FFMPEG_NAME} not found in bin/ folder` };

  const ltDir = resolveLtDir();
  if (!ltDir) return { success: false, error: 'LowerThird Files folder not found' };

  const movPath = path.join(ltDir, 'GENERIC LOWER.mov');
  const fontPath = path.join(ltDir, 'ITC Avant Garde Gothic LT Bold.otf');

  if (!fs.existsSync(movPath)) return { success: false, error: 'GENERIC LOWER.mov not found' };
  if (!fs.existsSync(fontPath)) return { success: false, error: 'Font file not found' };

  // Build default filename from text
  const safeName = (str) => str.replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_').slice(0, 40);
  const defaultName = 'LT_' + safeName(line1 || 'untitled') + (line2 ? '_' + safeName(line2) : '') + '.mov';

  // Show save dialog
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Lower Third',
    defaultPath: path.join(readStore().downloadPath || app.getPath('downloads'), defaultName),
    filters: [{ name: 'QuickTime Movie', extensions: ['mov'] }],
  });

  if (result.canceled || !result.filePath) return { success: false, error: 'Export cancelled' };
  const outputPath = result.filePath;

  // Calculate loop count: ceil(duration / 8) full loops
  const loopCount = Math.ceil((duration || 60) / 8);
  const totalDuration = loopCount * 8;
  const streamLoops = loopCount - 1;

  // Prepare text
  const text1 = escapeFFmpegText(forceUppercase ? (line1 || '').toUpperCase() : (line1 || ''));
  const text2 = escapeFFmpegText(line2 || '');
  const ffFontPath = fontPath.replace(/\\/g, '/').replace(/:/g, '\\:');

  // Build drawtext filters — positions calibrated from pixel analysis of GENERIC LOWER.png
  // Dark blue bar: y=813–841, Light bar: y=842–929, text starts at x=262
  const filters = [];
  if (text1) {
    filters.push(`drawtext=fontfile='${ffFontPath}':text='${text1}':fontcolor=black:fontsize=${fontSize1 || 68}:x=${x1 || 363}:y=${y1 || 857}`);
  }
  if (text2) {
    filters.push(`drawtext=fontfile='${ffFontPath}':text='${text2}':fontcolor=black:fontsize=${fontSize2 || 38}:x=${x2 || 363}:y=${y2 || 943}`);
  }

  const args = [];
  if (streamLoops > 0) args.push('-stream_loop', String(streamLoops));
  args.push('-i', movPath);

  if (filters.length) {
    args.push('-vf', filters.join(','));
  }

  args.push('-t', String(totalDuration));
  args.push('-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le');
  args.push('-an');
  args.push('-y', outputPath);

  logEntry({ event: 'lt-generate-start', line1, line2, duration: totalDuration, outputPath });
  mainWindow?.webContents.send('lt-progress', JSON.stringify({ status: 'running', pct: 0, msg: 'Starting export...' }));

  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(FFMPEG, args, { windowsHide: true });
    } catch (err) {
      return resolve({ success: false, error: err.message });
    }

    let stderr = '';
    proc.stderr.on('data', d => {
      const chunk = d.toString();
      stderr += chunk;
      // Parse progress from FFmpeg output
      const timeMatch = chunk.match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
      if (timeMatch) {
        const secs = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
        const pct = Math.min(99, Math.round((secs / totalDuration) * 100));
        mainWindow?.webContents.send('lt-progress', JSON.stringify({ status: 'running', pct, msg: `Encoding: ${pct}%` }));
      }
    });

    proc.on('error', err => {
      logEntry({ event: 'lt-generate-error', error: err.message });
      resolve({ success: false, error: err.message });
    });

    proc.on('close', code => {
      logEntry({ event: 'lt-generate-done', code, outputPath });
      if (code === 0 && fs.existsSync(outputPath)) {
        mainWindow?.webContents.send('lt-progress', JSON.stringify({ status: 'done', pct: 100, msg: 'Export complete!' }));
        resolve({ success: true, outputPath, actualDuration: totalDuration });
      } else {
        mainWindow?.webContents.send('lt-progress', JSON.stringify({ status: 'error', pct: 0, msg: 'Export failed' }));
        resolve({ success: false, error: stderr.slice(-400) });
      }
    });
  });
});

// ─── Merge Videos ─────────────────────────────────────────────��──────────────

// Probe durations for multiple files
ipcMain.handle('probe-merge-durations', async (_e, paths) => {
  if (!binaryOk(FFPROBE)) return { durations: paths.map(() => 0), resolutions: paths.map(() => null) };
  const durations = [];
  const resolutions = [];
  for (const filePath of paths) {
    try {
      const { stdout, code } = await runExe(FFPROBE, [
        '-v', 'quiet',
        '-show_entries', 'format=duration:stream=width,height',
        '-select_streams', 'v:0',
        '-of', 'json', filePath,
      ], 10000);
      if (code === 0) {
        const data = JSON.parse(stdout);
        durations.push(parseFloat(data.format?.duration) || 0);
        const s = data.streams?.[0];
        resolutions.push(s ? { w: s.width, h: s.height } : null);
      } else {
        durations.push(0);
        resolutions.push(null);
      }
    } catch {
      durations.push(0);
      resolutions.push(null);
    }
  }
  return { durations, resolutions };
});

ipcMain.handle('merge-videos', async (_e, { files, hardLimiter, crossDissolve, dipToWhite, removeAudio, customFilename, outputDir, forceResolution }) => {
  if (!binaryOk(FFMPEG)) return { success: false, error: `${FFMPEG_NAME} not found in bin/ folder` };
  if (!files || files.length < 2) return { success: false, error: 'At least 2 files are required' };

  for (const f of files) {
    if (!fs.existsSync(f)) return { success: false, error: 'File not found: ' + f };
  }

  const defaultName = customFilename || 'merged_' + Date.now();
  const outDir = outputDir || path.dirname(files[0]);
  ensureDir(outDir);

  // Show save dialog
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Merged Video',
    defaultPath: path.join(readStore().downloadPath || app.getPath('downloads'), defaultName + '.mp4'),
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });

  if (result.canceled || !result.filePath) return { success: false, error: 'Merge cancelled' };
  const outputPath = result.filePath;

  // Probe durations for transition math
  const durations = [];
  for (const f of files) {
    try {
      const { stdout, code } = await runExe(FFPROBE, [
        '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', f,
      ], 10000);
      durations.push(code === 0 ? parseFloat(stdout.trim()) || 0 : 0);
    } catch { durations.push(0); }
  }
  const totalDuration = durations.reduce((a, b) => a + b, 0);

  const useTransition = crossDissolve || dipToWhite;
  const transitionDuration = 0.5; // seconds

  // Determine target resolution
  const scaleW = forceResolution === '720p' ? 1280 : forceResolution === '1080p' ? 1920 : 0;
  const scaleH = forceResolution === '720p' ? 720 : forceResolution === '1080p' ? 1080 : 0;
  // Scale + pad to target frame (letterbox/pillarbox to preserve aspect ratio)
  const scaleFilter = scaleW ? `scale=${scaleW}:${scaleH}:force_original_aspect_ratio=decrease,pad=${scaleW}:${scaleH}:(ow-iw)/2:(oh-ih)/2:black,setsar=1` : '';
  // Normalize filter ensures all streams have matching format/fps for xfade compatibility
  const normVideo = (i) => {
    const parts = [];
    if (scaleFilter) parts.push(scaleFilter);
    parts.push('format=yuv420p', 'fps=30');
    return `[${i}:v]${parts.join(',')}[nv${i}]`;
  };
  const normAudio = (i) => `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo[na${i}]`;

  logEntry({ event: 'merge-start', fileCount: files.length, crossDissolve, dipToWhite, hardLimiter, removeAudio, forceResolution, outputPath });
  mainWindow?.webContents.send('merge-progress', JSON.stringify({ status: 'running', pct: 0, msg: 'Starting merge...' }));

  return new Promise((resolve) => {
    let args = [];
    const n = files.length;

    // Add all inputs
    for (const f of files) args.push('-i', f);

    if (useTransition && n >= 2) {
      // xfade requires normalized inputs (same resolution, fps, pixel format)
      const filterParts = [];

      // Normalize all video and audio streams
      for (let i = 0; i < n; i++) {
        filterParts.push(normVideo(i));
        if (!removeAudio) filterParts.push(normAudio(i));
      }

      // Build xfade chain for video
      let offset = durations[0] - transitionDuration;
      let lastVLabel = '[nv0]';

      for (let i = 1; i < n; i++) {
        const outLabel = i < n - 1 ? `[xv${i}]` : '[outv]';
        const transition = dipToWhite ? 'fadewhite' : 'fade';
        filterParts.push(`${lastVLabel}[nv${i}]xfade=transition=${transition}:duration=${transitionDuration}:offset=${Math.max(0, offset).toFixed(3)}${outLabel}`);
        lastVLabel = outLabel;
        offset += durations[i] - transitionDuration;
      }

      // Build acrossfade chain for audio
      if (!removeAudio) {
        let lastALabel = '[na0]';
        for (let i = 1; i < n; i++) {
          const outLabel = i < n - 1 ? `[xa${i}]` : '[outa]';
          filterParts.push(`${lastALabel}[na${i}]acrossfade=d=${transitionDuration}:c1=tri:c2=tri${outLabel}`);
          lastALabel = outLabel;
        }
      }

      args.push('-filter_complex', filterParts.join(';'));
      args.push('-map', '[outv]');
      if (!removeAudio) args.push('-map', '[outa]');

    } else if (scaleFilter) {
      // No transitions but need scaling — use filter_complex concat
      const filterParts = [];
      for (let i = 0; i < n; i++) {
        filterParts.push(`[${i}:v]${scaleFilter},format=yuv420p[sv${i}]`);
      }
      if (removeAudio) {
        const vInputs = Array.from({ length: n }, (_, i) => `[sv${i}]`).join('');
        filterParts.push(`${vInputs}concat=n=${n}:v=1:a=0[outv]`);
        args.push('-filter_complex', filterParts.join(';'));
        args.push('-map', '[outv]');
      } else {
        const inputs = Array.from({ length: n }, (_, i) => `[sv${i}][${i}:a]`).join('');
        filterParts.push(`${inputs}concat=n=${n}:v=1:a=1[outv][outa]`);
        args.push('-filter_complex', filterParts.join(';'));
        args.push('-map', '[outv]');
        args.push('-map', '[outa]');
      }

    } else {
      // Simple concat demuxer (no transitions, no scaling)
      const concatListPath = path.join(app.getPath('temp'), 'merge_list_' + Date.now() + '.txt');
      const concatContent = files.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
      fs.writeFileSync(concatListPath, concatContent);
      args.push('-f', 'concat', '-safe', '0', '-i', concatListPath);
    }

    // Video codec
    args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');

    const hasFilterComplex = args.includes('-filter_complex');

    if (removeAudio) {
      args.push('-an');
    } else {
      args.push('-c:a', 'aac', '-b:a', '192k');
      if (hardLimiter && !hasFilterComplex) {
        // Simple concat mode — use -af
        args.push('-af', 'alimiter=limit=0.251189:level=0');
      }
    }

    // For filter_complex modes with hard limiter, append alimiter to the audio chain
    if (hasFilterComplex && hardLimiter && !removeAudio) {
      const fcIdx = args.indexOf('-filter_complex');
      if (fcIdx !== -1) {
        args[fcIdx + 1] = args[fcIdx + 1].replace(/\[outa\]$/, '[outa_pre]') + ';[outa_pre]alimiter=limit=0.251189:level=0[outa]';
      }
    }

    args.push('-y', outputPath);

    let proc;
    try {
      proc = spawn(FFMPEG, args, { windowsHide: true });
    } catch (err) {
      return resolve({ success: false, error: err.message });
    }

    let stderr = '';
    proc.stderr.on('data', d => {
      const chunk = d.toString();
      stderr += chunk;
      const timeMatch = chunk.match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
      if (timeMatch) {
        const secs = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
        const pct = totalDuration > 0 ? Math.min(99, Math.round((secs / totalDuration) * 100)) : 0;
        mainWindow?.webContents.send('merge-progress', JSON.stringify({ status: 'running', pct, msg: `Encoding: ${pct}%` }));
      }
    });

    proc.on('error', err => {
      logEntry({ event: 'merge-error', error: err.message });
      resolve({ success: false, error: err.message });
    });

    proc.on('close', code => {
      logEntry({ event: 'merge-done', code, outputPath });
      if (code === 0 && fs.existsSync(outputPath)) {
        mainWindow?.webContents.send('merge-progress', JSON.stringify({ status: 'done', pct: 100, msg: 'Merge complete!' }));
        resolve({ success: true, outputPath });
      } else {
        mainWindow?.webContents.send('merge-progress', JSON.stringify({ status: 'error', pct: 0, msg: 'Merge failed' }));
        resolve({ success: false, error: stderr.slice(-400) });
      }
    });
  });
});

// ─── Podcast: merge clips into MP4 + MP3, return ad-roll timecodes ──────────
function formatTimecode(seconds) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const h  = Math.floor(totalMs / 3600000);
  const m  = Math.floor((totalMs % 3600000) / 60000);
  const s  = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  const pad = (n, w) => String(n).padStart(w, '0');
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`;
}

function blockLetter(n) {
  // 0 → A, 1 → B, ..., 25 → Z, 26 → AA, 27 → AB ...
  let s = '';
  n = n + 1;
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

ipcMain.handle('merge-podcast', async (_e, { files, hardLimiter, filename, outputDir, exportMp4, exportMp3 }) => {
  if (!binaryOk(FFMPEG))  return { success: false, error: `${FFMPEG_NAME} not found in bin/ folder` };
  if (!binaryOk(FFPROBE)) return { success: false, error: `${FFPROBE_NAME} not found in bin/ folder` };
  if (!files || files.length < 2) return { success: false, error: 'At least 2 files are required' };
  for (const f of files) {
    if (!fs.existsSync(f)) return { success: false, error: 'File not found: ' + f };
  }

  const wantMp4 = exportMp4 !== false;
  const wantMp3 = exportMp3 !== false;
  if (!wantMp4 && !wantMp3) return { success: false, error: 'Select at least one output format (MP4 or MP3)' };

  // Sanitize filename
  const cleanName = (filename || '').trim().replace(/[\\/:*?"<>|]/g, '').replace(/\.[^.]+$/, '');
  const baseName  = cleanName || ('podcast_' + Date.now());
  const outDir    = outputDir || readStore().downloadPath || app.getPath('downloads');
  ensureDir(outDir);
  const mp4Path = path.join(outDir, baseName + '.mp4');
  const mp3Path = path.join(outDir, baseName + '.mp3');

  // Probe each clip: duration, video codec/dims, audio codec/params (one ffprobe per file)
  const probes = [];
  for (const f of files) {
    try {
      const { stdout, code } = await runExe(FFPROBE, [
        '-v', 'quiet',
        '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,sample_rate,channels',
        '-of', 'json', f,
      ], 10000);
      if (code === 0) {
        const data = JSON.parse(stdout);
        const dur = parseFloat(data.format && data.format.duration) || 0;
        const streams = Array.isArray(data.streams) ? data.streams : [];
        const v = streams.find(s => s.codec_type === 'video');
        const a = streams.find(s => s.codec_type === 'audio');
        probes.push({
          duration: dur,
          v: v ? { codec: v.codec_name, w: parseInt(v.width) || 0, h: parseInt(v.height) || 0 } : null,
          a: a ? { codec: a.codec_name, sample_rate: parseInt(a.sample_rate) || 0, channels: parseInt(a.channels) || 0 } : null,
        });
      } else {
        probes.push({ duration: 0, v: null, a: null });
      }
    } catch {
      probes.push({ duration: 0, v: null, a: null });
    }
  }
  const durations = probes.map(p => p.duration);
  const totalDuration = durations.reduce((a, b) => a + b, 0);

  // Break timecodes (cumulative durations — N-1 breaks for N clips)
  const breaks = [];
  let cum = 0;
  for (let i = 0; i < files.length - 1; i++) {
    cum += durations[i];
    breaks.push({
      number:   i + 1,
      timecode: formatTimecode(cum),
      label:    `BREAK ${i + 1} (${blockLetter(i)} Block into ${blockLetter(i + 1)} Block)`,
    });
  }

  // Target resolution = Block A's resolution (fallback 1920×1080 if probe failed)
  const blockA  = probes[0];
  const targetW = (blockA && blockA.v && blockA.v.w) || 1920;
  const targetH = (blockA && blockA.v && blockA.v.h) || 1080;

  // Always re-encode through the concat filter. Stream-copy via the concat demuxer is
  // unsafe for arbitrary MP4s — even when codec/resolution match, mismatched timebases or
  // unaligned audio/video sample boundaries cause A/V drift and truncated last clips.
  const n = files.length;
  const W = targetW, H = targetH;
  const filterParts = [];
  if (wantMp4) {
    for (let i = 0; i < n; i++) {
      filterParts.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p,fps=30[v${i}]`);
    }
  }
  for (let i = 0; i < n; i++) {
    filterParts.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo[a${i}]`);
  }
  if (wantMp4) {
    const cinp = Array.from({ length: n }, (_, i) => `[v${i}][a${i}]`).join('');
    filterParts.push(`${cinp}concat=n=${n}:v=1:a=1[outv][a_concat]`);
  } else {
    const cinp = Array.from({ length: n }, (_, i) => `[a${i}]`).join('');
    filterParts.push(`${cinp}concat=n=${n}:v=0:a=1[a_concat]`);
  }
  if (hardLimiter) {
    filterParts.push(`[a_concat]alimiter=limit=0.251189:level=0[a_processed]`);
  } else {
    filterParts.push(`[a_concat]anull[a_processed]`);
  }
  if (wantMp4 && wantMp3) {
    filterParts.push(`[a_processed]asplit=2[outa_mp4][outa_mp3]`);
  } else if (wantMp4) {
    filterParts.push(`[a_processed]anull[outa_mp4]`);
  } else {
    filterParts.push(`[a_processed]anull[outa_mp3]`);
  }

  const args = [];
  for (const f of files) args.push('-i', f);
  args.push('-filter_complex', filterParts.join(';'));
  if (wantMp4) {
    args.push('-map', '[outv]', '-map', '[outa_mp4]');
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p');
    args.push('-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
    args.push('-y', mp4Path);
  }
  if (wantMp3) {
    args.push('-map', '[outa_mp3]', '-c:a', 'libmp3lame', '-b:a', '192k');
    args.push('-y', mp3Path);
  }

  logEntry({ event: 'podcast-start', fileCount: n, hardLimiter, wantMp4, wantMp3, targetW, targetH });
  mainWindow?.webContents.send('podcast-progress', JSON.stringify({
    status: 'running', pct: 0, etaSec: null, speed: null, msg: 'Encoding…',
  }));

  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(FFMPEG, args, { windowsHide: true });
    } catch (err) {
      return resolve({ success: false, error: err.message });
    }

    let stderr = '';
    let lastSpeed = 0;
    proc.stderr.on('data', d => {
      const chunk = d.toString();
      stderr += chunk;
      // Use the LAST time= and speed= in this chunk (ffmpeg overwrites the status line).
      let m, lastT = null, lastS = null;
      const tRe = /time=(\d+):(\d+):(\d+)\.(\d+)/g;
      while ((m = tRe.exec(chunk)) !== null) lastT = m;
      const sRe = /speed=\s*([\d.]+)x/g;
      while ((m = sRe.exec(chunk)) !== null) lastS = m;
      if (lastS) {
        const s = parseFloat(lastS[1]);
        if (s > 0) lastSpeed = s;
      }
      if (lastT && totalDuration > 0) {
        const secs = parseInt(lastT[1]) * 3600 + parseInt(lastT[2]) * 60 + parseInt(lastT[3]);
        const pct  = Math.min(99, Math.round((secs / totalDuration) * 100));
        const etaSec = lastSpeed > 0 ? Math.max(0, Math.round((totalDuration - secs) / lastSpeed)) : null;
        mainWindow?.webContents.send('podcast-progress', JSON.stringify({
          status: 'running', pct, etaSec, speed: lastSpeed || null, msg: '',
        }));
      }
    });

    proc.on('error', err => {
      logEntry({ event: 'podcast-error', error: err.message });
      resolve({ success: false, error: err.message });
    });

    proc.on('close', code => {
      const okMp4 = !wantMp4 || fs.existsSync(mp4Path);
      const okMp3 = !wantMp3 || fs.existsSync(mp3Path);
      if (code === 0 && okMp4 && okMp3) {
        logEntry({ event: 'podcast-done', code, wantMp4, wantMp3 });
        mainWindow?.webContents.send('podcast-progress', JSON.stringify({ status: 'done', pct: 100, etaSec: 0, speed: null, msg: 'Done!' }));
        resolve({
          success:  true,
          mp4Path:  wantMp4 ? mp4Path : null,
          mp3Path:  wantMp3 ? mp3Path : null,
          breaks,
        });
      } else {
        logEntry({ event: 'podcast-failed', code, wantMp4, wantMp3, okMp4, okMp3, stderrTail: stderr.slice(-1200) });
        mainWindow?.webContents.send('podcast-progress', JSON.stringify({ status: 'error', pct: 0, etaSec: null, speed: null, msg: 'Merge failed' }));
        resolve({ success: false, error: stderr.slice(-500) });
      }
    });
  });
});

// ─── Podcast: open separate Time Codes window ─────────────────────────────
ipcMain.handle('open-timecodes-window', async (_e, payload) => {
  const breaks = (payload && payload.breaks) || [];
  const title  = (payload && payload.title)  || 'Time Codes';
  const tcWin = new BrowserWindow({
    width: 460, height: 620,
    minWidth: 380, minHeight: 320,
    parent: mainWindow,
    title,
    backgroundColor: '#0a0820',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  tcWin.removeMenu();
  const hash = encodeURIComponent(JSON.stringify({ breaks, title }));
  await tcWin.loadFile(path.join(__dirname, 'renderer', 'timecodes.html'), { hash });
  return { success: true };
});

ipcMain.handle('clipboard-write', (_e, text) => {
  try { clipboard.writeText(String(text || '')); return true; } catch { return false; }
});

// ─── Get recent logs ─────────────────────────────────────────────────────────
ipcMain.handle('get-logs', () => {
  try {
    ensureDir(LOG_DIR);
    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.endsWith('.log'))
      .sort()
      .reverse();
    if (!files.length) return '(No log files found yet. Logs appear after your first download.)\n\nLog folder: ' + LOG_DIR;
    // Read last 3 days of logs
    const lines = [];
    for (const file of files.slice(0, 3)) {
      const text = fs.readFileSync(path.join(LOG_DIR, file), 'utf8');
      lines.unshift(`\n=== ${file} ===\n` + text);
    }
    return lines.join('\n').split('\n').slice(-500).join('\n');
  } catch (err) {
    return 'Could not read logs: ' + err.message + '\nLog folder: ' + LOG_DIR;
  }
});

// ─── YouTube Account Login ───────────────────────────────────────────────────
ipcMain.handle('youtube-login', async () => {
  // Use a fresh non-persistent partition every login — completely isolated from
  // the user's real browsers. No cookies from Chrome/Edge/Firefox can leak in.
  const partitionName = `yt-login-${Date.now()}`;
  const ses = require('electron').session.fromPartition(partitionName);

  // Clear everything in this session just to be safe
  await ses.clearStorageData();
  await ses.clearCache();

  return new Promise((resolve) => {
    const loginWin = new BrowserWindow({
      width: 520, height: 700,
      parent: mainWindow,
      modal: true,
      icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
      webPreferences: {
        partition: partitionName,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    loginWin.setMenuBarVisibility(false);
    loginWin.loadURL('https://accounts.google.com/ServiceLogin?continue=https://www.youtube.com/');

    let resolved = false;

    // Watch for navigation to YouTube (means login succeeded)
    const checkLogin = async () => {
      const url = loginWin.webContents.getURL();
      if (url.includes('youtube.com') && !url.includes('accounts.google.com')) {
        if (resolved) return;
        resolved = true;
        try {
          const loginSes = loginWin.webContents.session;
          const cookies = await loginSes.cookies.get({});
          const ytCookies = cookies.filter(c =>
            c.domain.includes('youtube.com') ||
            c.domain.includes('google.com') ||
            c.domain.includes('.google.') ||
            c.domain.includes('googleapis.com')
          );
          const netscape = cookiesToNetscape(ytCookies);
          ensureDir(COOKIES_DIR);
          fs.writeFileSync(COOKIES_FILE, netscape, 'utf8');

          // Extract logged-in email by navigating to Google account page
          let email = '';
          try {
            await loginWin.loadURL('https://myaccount.google.com/personal-info');
            await new Promise(r => setTimeout(r, 4000));
            email = await loginWin.webContents.executeJavaScript(`
              (function() {
                var text = document.body.innerText || '';
                var m = text.match(/[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}/i);
                return m ? m[0] : '';
              })()`
            );
          } catch {}

          // Save email to settings
          if (email) {
            const s = readStore();
            s.youtubeEmail = email;
            writeStore(s);
          }

          logEntry({ event: 'youtube-login', cookieCount: ytCookies.length, email });

          // Clean up the session after extracting cookies
          loginSes.clearStorageData();

          loginWin.close();
          resolve({ success: true, cookieCount: ytCookies.length, email });
        } catch (err) {
          loginWin.close();
          resolve({ success: false, error: err.message });
        }
      }
    };

    loginWin.webContents.on('did-navigate', checkLogin);
    loginWin.webContents.on('did-navigate-in-page', checkLogin);
    loginWin.webContents.on('did-finish-load', () => setTimeout(checkLogin, 1500));

    loginWin.on('closed', () => {
      if (!resolved) { resolved = true; resolve({ success: false, error: 'Login window closed' }); }
    });
  });
});

ipcMain.handle('youtube-logout', () => {
  try {
    if (fs.existsSync(COOKIES_FILE)) fs.unlinkSync(COOKIES_FILE);
    // Remove email from settings
    const s = readStore();
    delete s.youtubeEmail;
    writeStore(s);
    logEntry({ event: 'youtube-logout' });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('youtube-auth-status', () => {
  const s = readStore();
  return { loggedIn: fs.existsSync(COOKIES_FILE), email: s.youtubeEmail || '' };
});

// Fetch email for an existing session using stored cookies
ipcMain.handle('youtube-refresh-email', async () => {
  if (!fs.existsSync(COOKIES_FILE)) return { email: '' };
  const s = readStore();
  if (s.youtubeEmail) return { email: s.youtubeEmail };

  try {
    const cookieLines = fs.readFileSync(COOKIES_FILE, 'utf8').split('\n');
    const partitionName = `email-fetch-${Date.now()}`;
    const ses = require('electron').session.fromPartition(partitionName);

    for (const line of cookieLines) {
      if (line.startsWith('#') || !line.trim()) continue;
      const parts = line.split('\t');
      if (parts.length < 7) continue;
      const [domain, , cookiePath, secure, expiry, name, value] = parts;
      try {
        await ses.cookies.set({
          url: (secure === 'TRUE' ? 'https' : 'http') + '://' + domain.replace(/^\./, ''),
          name, value, domain, path: cookiePath,
          secure: secure === 'TRUE',
          expirationDate: parseInt(expiry) || undefined,
        });
      } catch {}
    }

    const emailWin = new BrowserWindow({
      show: false, width: 800, height: 600,
      webPreferences: { partition: partitionName, contextIsolation: true },
    });

    await emailWin.loadURL('https://myaccount.google.com/personal-info');
    await new Promise(r => setTimeout(r, 5000));
    const email = await emailWin.webContents.executeJavaScript(`
      (function() {
        var text = document.body.innerText || '';
        var m = text.match(/[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}/i);
        return m ? m[0] : '';
      })()`
    );

    emailWin.close();
    ses.clearStorageData();

    if (email) {
      s.youtubeEmail = email;
      writeStore(s);
    }
    return { email: email || '' };
  } catch (err) {
    return { email: '', error: err.message };
  }
});

// ─── App version & self-update ────────────────────────────────────────────────
ipcMain.handle('get-app-version', () => {
  return { version: APP_VERSION, date: APP_VERSION_DATE };
});

ipcMain.handle('check-app-update', () => {
  return new Promise((resolve) => {
    const req = https.get(APP_UPDATE_URL, { headers: { 'User-Agent': 'RAVdownloader/' + APP_VERSION } }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const info = JSON.parse(body);
          const latest = info.version || '';
          // Prefer platform-specific URL; fall back to legacy single `downloadUrl` (Windows-only feed).
          const platformUrl = IS_MAC ? info.downloadUrl_mac : info.downloadUrl_win;
          const downloadUrl = platformUrl || info.downloadUrl || '';
          const updateAvailable = latest !== APP_VERSION && latest.length > 0 && downloadUrl.length > 0;
          resolve({ currentVersion: APP_VERSION, latestVersion: latest, downloadUrl, updateAvailable });
        } catch {
          resolve({ currentVersion: APP_VERSION, latestVersion: '', downloadUrl: '', updateAvailable: false });
        }
      });
    });
    req.on('error', () => resolve({ currentVersion: APP_VERSION, latestVersion: '', downloadUrl: '', updateAvailable: false }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ currentVersion: APP_VERSION, latestVersion: '', downloadUrl: '', updateAvailable: false }); });
  });
});

// Mac update flow: mount DMG, copy new .app over /Applications/RAVdownloader.app,
// strip quarantine, detach DMG, and relaunch. The running app already has the user's
// full permissions so xattr/cp/open succeed without Gatekeeper prompts.
function installMacUpdate(dmgPath) {
  return new Promise((resolve) => {
    const mountPoint = path.join(app.getPath('temp'), 'RAVdownloader-update-mount-' + Date.now());
    const execFile = require('child_process').execFile;

    const cleanupAndQuit = () => {
      try { execFile('hdiutil', ['detach', mountPoint, '-force'], () => {}); } catch {}
      try { fs.unlinkSync(dmgPath); } catch {}
      setTimeout(() => app.quit(), 1200);
    };

    execFile('hdiutil', ['attach', dmgPath, '-mountpoint', mountPoint, '-nobrowse', '-quiet'], (mountErr) => {
      if (mountErr) {
        logEntry({ event: 'mac-update-mount-failed', error: mountErr.message });
        resolve({ success: false, error: 'Could not mount update DMG: ' + mountErr.message });
        return;
      }

      // Find the .app inside the mounted DMG
      let srcApp = '';
      try {
        const entries = fs.readdirSync(mountPoint);
        const appName = entries.find(n => n.endsWith('.app'));
        if (appName) srcApp = path.join(mountPoint, appName);
      } catch {}

      if (!srcApp || !fs.existsSync(srcApp)) {
        try { execFile('hdiutil', ['detach', mountPoint, '-force'], () => {}); } catch {}
        try { fs.unlinkSync(dmgPath); } catch {}
        resolve({ success: false, error: 'No .app found inside update DMG' });
        return;
      }

      // Target: replace the currently-running app bundle in /Applications
      // app.getPath('exe') → .../RAVdownloader.app/Contents/MacOS/RAVdownloader
      const exePath = app.getPath('exe');
      const appBundle = exePath.split('/Contents/MacOS/')[0];

      // Use a shell script so cp + xattr + open run sequentially after the parent quits.
      // Running the script via `nohup ... &` detaches it so quitting the app doesn't kill it.
      const script = [
        '#!/bin/bash',
        'sleep 2',
        `rm -rf "${appBundle}.old" 2>/dev/null`,
        `mv "${appBundle}" "${appBundle}.old" 2>/dev/null`,
        `cp -R "${srcApp}" "${appBundle}"`,
        `xattr -cr "${appBundle}"`,
        `hdiutil detach "${mountPoint}" -force 2>/dev/null`,
        `rm -rf "${appBundle}.old" 2>/dev/null`,
        `rm -f "${dmgPath}" 2>/dev/null`,
        `open "${appBundle}"`,
      ].join('\n');

      const scriptPath = path.join(app.getPath('temp'), 'RAVdownloader-install-' + Date.now() + '.sh');
      try {
        fs.writeFileSync(scriptPath, script);
        fs.chmodSync(scriptPath, 0o755);
      } catch (err) {
        cleanupAndQuit();
        resolve({ success: false, error: 'Could not write installer script: ' + err.message });
        return;
      }

      logEntry({ event: 'mac-update-installing', appBundle, srcApp });

      // Detach the installer script so it survives our quit
      app.once('quit', () => {
        try {
          spawn('/bin/bash', [scriptPath], { detached: true, stdio: 'ignore' }).unref();
        } catch (err) {
          logEntry({ event: 'mac-update-spawn-failed', error: err.message });
        }
      });

      resolve({ success: true, installing: true });
      setTimeout(() => app.quit(), 1500);
    });
  });
}

// Windows update flow: download .exe, run NSIS silent install, quit so the installer can replace files.
function installWinUpdate(exePath) {
  app.once('quit', () => {
    try {
      spawn(exePath, ['/S'], { detached: true, stdio: 'ignore', shell: true }).unref();
    } catch {
      try { require('child_process').exec(`start "" "${exePath}"`); } catch {}
    }
  });
  setTimeout(() => app.quit(), 1500);
}

ipcMain.handle('download-app-update', (_e, downloadUrl) => {
  return new Promise((resolve) => {
    if (!downloadUrl) { resolve({ success: false, error: 'No download URL provided' }); return; }

    const tmpName = IS_MAC ? 'RAVdownloader-update.dmg' : 'RAVdownloader-update.exe';
    const tmpPath = path.join(app.getPath('temp'), tmpName);
    const send = pct => mainWindow?.webContents.send('app-update-progress', pct);

    let fileStream;
    try { fileStream = fs.createWriteStream(tmpPath); }
    catch (err) { resolve({ success: false, error: 'Cannot write temp file: ' + err.message }); return; }

    const followRedirect = (url, hops) => {
      if (hops > 10) { resolve({ success: false, error: 'Too many redirects' }); return; }
      const mod = url.startsWith('https') ? https : http;
      mod.get(url, { headers: { 'User-Agent': 'RAVdownloader/' + APP_VERSION } }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          followRedirect(res.headers.location, hops + 1);
          return;
        }
        const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
        let downloaded = 0;
        res.on('data', chunk => {
          downloaded += chunk.length;
          send(totalBytes > 0 ? Math.round((downloaded / totalBytes) * 100) : 0);
        });
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(async () => {
            send(100);
            logEntry({ event: 'app-update-downloaded', tmpPath });
            if (IS_MAC) {
              const macResult = await installMacUpdate(tmpPath);
              resolve(macResult);
            } else {
              installWinUpdate(tmpPath);
              resolve({ success: true, installing: true });
            }
          });
        });
      }).on('error', err => {
        try { fs.unlinkSync(tmpPath); } catch {}
        resolve({ success: false, error: 'Download error: ' + err.message });
      });
    };
    followRedirect(downloadUrl, 0);
  });
});

// ─── Report Issue (sends to worker endpoint) ────────────────────────────────
const REPORT_URL = 'https://ravdownloader-update.djcolinchristy.workers.dev/report';

ipcMain.handle('submit-report', (_e, { failedUrl, description }) => {
  return new Promise((resolve) => {
    // Gather recent log lines
    let recentLogs = '';
    try {
      const date = new Date().toISOString().split('T')[0];
      const logFile = path.join(LOG_DIR, `${date}.log`);
      if (fs.existsSync(logFile)) {
        const lines = fs.readFileSync(logFile, 'utf8').split('\n');
        recentLogs = lines.slice(-50).join('\n');
      }
    } catch {}

    let userName = '';
    try { userName = readStore().userName || ''; } catch {}

    const payload = JSON.stringify({
      appVersion: APP_VERSION,
      userName,
      failedUrl: failedUrl || '',
      description: description || '',
      logs: recentLogs,
      timestamp: new Date().toISOString(),
    });

    const url = new URL(REPORT_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'RAVdownloader/' + APP_VERSION,
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          logEntry({ event: 'report-submitted', failedUrl });
          resolve({ success: true });
        } else {
          resolve({ success: false, error: `Server responded with ${res.statusCode}` });
        }
      });
    });
    req.on('error', err => resolve({ success: false, error: err.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ success: false, error: 'Request timed out' }); });
    req.write(payload);
    req.end();
  });
});

// ─── Advanced features: font check ──────────────────────────────────────────
ipcMain.handle('check-font', () => {
  const fontPath = resolveFontPath();
  return { available: !!fontPath, fontPath: fontPath || '' };
});

// ─── Diagnostics ─────────────────────────────────────────────────────────────
ipcMain.handle('get-diagnostics', async () => {
  const ytdlpExists = fs.existsSync(YTDLP);
  const ffmpegExists = fs.existsSync(FFMPEG);
  const ytdlpOk  = binaryOk(YTDLP);
  const ffmpegOk = binaryOk(FFMPEG);
  let version = 'N/A';
  if (ytdlpOk) {
    const { stdout } = await runExe(YTDLP, ['--version'], 5000);
    version = stdout.trim() || 'N/A';
  }

  // Also list all candidate paths tried
  const candidates = isDev ? [
    path.join(__dirname, '..', DEV_BIN_FOLDER),
    path.join(__dirname, DEV_BIN_FOLDER),
    path.join(process.cwd(), DEV_BIN_FOLDER),
    path.join(app.getAppPath(), DEV_BIN_FOLDER),
  ] : [
    path.join(process.resourcesPath, 'bin'),
  ];

  const candidateInfo = candidates.map(c => ({
    path: c,
    hasYtdlp: fs.existsSync(path.join(c, YTDLP_NAME)),
    hasFfmpeg: fs.existsSync(path.join(c, FFMPEG_NAME)),
  }));

  const ytdlpSize = ytdlpExists ? fs.statSync(YTDLP).size : 0;
  const ffmpegSize = ffmpegExists ? fs.statSync(FFMPEG).size : 0;

  return {
    binDir: BIN_DIR,
    ytdlpPath: YTDLP,
    ffmpegPath: FFMPEG,
    ytdlpExists,
    ytdlpOk,
    ytdlpSize,
    ffmpegExists,
    ffmpegOk,
    ffmpegSize,
    version,
    userData: USER_DATA,
    cwd: process.cwd(),
    appPath: app.getAppPath(),
    isDev,
    candidates: candidateInfo,
  };
});
