const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const https = require('https');
const http  = require('http');

// ─── App info ────────────────────────────────────────────────────────────────
const APP_VERSION = '2.4.0';
const APP_VERSION_DATE = '4-2-26';
// URL to a JSON file you host: { "version": "2.1.0", "downloadUrl": "https://..." }
const APP_UPDATE_URL = 'https://ravdownloader-update.djcolinchristy.workers.dev/';

// ─── Binary paths ─────────────────────────────────────────────────────────────
const isDev = !app.isPackaged;

// Try multiple candidate locations in order, use the first one that contains yt-dlp.exe
function findBinDir() {
  const candidates = isDev ? [
    path.join(__dirname, '..', 'bin'),           // normal: src/../bin
    path.join(__dirname, 'bin'),                  // if main.js is at root
    path.join(process.cwd(), 'bin'),              // cwd/bin
    path.join(app.getAppPath(), 'bin'),           // appPath/bin
  ] : [
    path.join(process.resourcesPath, 'bin'),
    path.join(path.dirname(app.getPath('exe')), 'resources', 'bin'),
  ];

  for (const c of candidates) {
    const ytdlp = path.join(c, 'yt-dlp.exe');
    if (fs.existsSync(ytdlp)) {
      return c;
    }
  }
  // Return the default even if not found — error will be shown to user
  return candidates[0];
}

const BIN_DIR = findBinDir();
const YTDLP   = path.join(BIN_DIR, 'yt-dlp.exe');
const FFMPEG  = path.join(BIN_DIR, 'ffmpeg.exe');
const FFPROBE = path.join(BIN_DIR, 'ffprobe.exe');

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
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${JSON.stringify(entry)}\n`);
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
        env: { ...process.env, PATH: BIN_DIR + ';' + (process.env.PATH || '') },
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

// ─── PDF to PNG (using pdfjs-dist in a hidden renderer) ──────────────────────
async function convertPdfToPng(inputPath, outputDir, baseName) {
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

              const dataUrl = canvas.toDataURL('image/png');
              const b64 = dataUrl.replace(/^data:image\\/png;base64,/, '');
              const outFile = pathMod.join(
                ${JSON.stringify(outputDir)},
                ${JSON.stringify(baseName)} + '_page_' + String(i).padStart(3, '0') + '.png'
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 820,
    minWidth: 960, minHeight: 660,
    frame: false,
    transparent: false,
    backgroundColor: '#0c0c0e',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

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

  Menu.setApplicationMenu(null);
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
    return { error: `yt-dlp.exe not found.\n\nExpected location:\n${YTDLP}\n\nPlease place yt-dlp.exe in the bin/ folder.` };
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
    return { success: false, error: `yt-dlp.exe not found in bin/ folder.\n\nExpected: ${YTDLP}` };
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
      return { success: false, error: `ffmpeg.exe not found in bin/ folder.\n\nExpected: ${FFMPEG}` };
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
        env: { ...process.env, PATH: BIN_DIR + ';' + (process.env.PATH || '') },
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
            path.join(BIN_DIR, 'ffprobe.exe'),
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
  if (!binaryOk(YTDLP)) return 'yt-dlp.exe not found in bin/';
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
          const asset = (release.assets || []).find(a => a.name === 'yt-dlp.exe');
          if (!asset) { resolve({ success: false, error: 'yt-dlp.exe asset not found in latest release' }); return; }
          downloadUrl = asset.browser_download_url;
          send(`Found ${tagName}. Downloading yt-dlp.exe...`);
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
            res2.on('data', chunk => {
              downloaded += chunk.length;
              const mb = (downloaded / 1048576).toFixed(1);
              const pct = totalBytes > 0 ? Math.round((downloaded / totalBytes) * 100) : 0;
              send(`Downloading... ${mb} MB`);
              mainWindow?.webContents.send('ytdlp-download-progress', { downloaded, totalBytes, pct });
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
    return { error: `yt-dlp.exe not found.\n\nExpected location:\n${YTDLP}` };
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
      resolve({ success: false, error: `ffmpeg.exe not found in bin/ folder.\n\nExpected: ${FFMPEG}` });
      return;
    }
    const base = path.basename(inputPath, path.extname(inputPath));
    const outPath = path.join(outputDir, `${base}_converted.${outputFormat}`);
    ensureDir(outputDir);

    let args;
    if (outputFormat === 'png') {
      args = ['-i', inputPath, '-y', outPath];
    } else if (outputFormat === 'pdf-png') {
      convertPdfToPng(inputPath, outputDir, base)
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
  if (!binaryOk(FFMPEG)) return { success: false, error: 'ffmpeg.exe not found in bin/ folder' };

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
          const updateAvailable = latest !== APP_VERSION && latest.length > 0;
          resolve({ currentVersion: APP_VERSION, latestVersion: latest, downloadUrl: info.downloadUrl || '', updateAvailable });
        } catch {
          resolve({ currentVersion: APP_VERSION, latestVersion: '', downloadUrl: '', updateAvailable: false });
        }
      });
    });
    req.on('error', () => resolve({ currentVersion: APP_VERSION, latestVersion: '', downloadUrl: '', updateAvailable: false }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ currentVersion: APP_VERSION, latestVersion: '', downloadUrl: '', updateAvailable: false }); });
  });
});

ipcMain.handle('download-app-update', (_e, downloadUrl) => {
  return new Promise((resolve) => {
    if (!downloadUrl) { resolve({ success: false, error: 'No download URL provided' }); return; }

    const tmpPath = path.join(app.getPath('temp'), 'RAVdownloader-update.exe');
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
          fileStream.close(() => {
            send(100);
            logEntry({ event: 'app-update-downloaded', tmpPath });
            app.once('quit', () => {
              try {
                spawn(tmpPath, ['/S'], { detached: true, stdio: 'ignore', shell: true }).unref();
              } catch {
                try { require('child_process').exec(`start "" "${tmpPath}"`); } catch {}
              }
            });
            resolve({ success: true, installing: true });
            setTimeout(() => app.quit(), 1500);
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

    const payload = JSON.stringify({
      appVersion: APP_VERSION,
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
    path.join(__dirname, '..', 'bin'),
    path.join(__dirname, 'bin'),
    path.join(process.cwd(), 'bin'),
    path.join(app.getAppPath(), 'bin'),
  ] : [
    path.join(process.resourcesPath, 'bin'),
  ];

  const candidateInfo = candidates.map(c => ({
    path: c,
    hasYtdlp: fs.existsSync(path.join(c, 'yt-dlp.exe')),
    hasFfmpeg: fs.existsSync(path.join(c, 'ffmpeg.exe')),
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
