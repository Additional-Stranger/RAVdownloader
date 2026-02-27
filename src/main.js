const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const https = require('https');
const http  = require('http');

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

// ─── Data paths ───────────────────────────────────────────────────────────────
const USER_DATA  = app.getPath('userData');
const STORE_PATH = path.join(USER_DATA, 'settings.json');
const LOG_DIR    = path.join(USER_DATA, 'logs');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
ensureDir(LOG_DIR);

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
      proc = spawn(exePath, args, { windowsHide: true });
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

  const { stdout, stderr, code } = await runExe(YTDLP, [
    '--dump-single-json',
    '--no-playlist',
    '--no-warnings',
    '--extractor-args', 'youtube:skip=dash,translated_subs',
    url,
  ], 60000);

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
      formatId: 'bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]+bestaudio/bestvideo+bestaudio/best',
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
            formatId: `bestvideo[height<=${f.height}][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=${f.height}]+bestaudio/best[height<=${f.height}]`,
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
ipcMain.handle('start-download', async (_e, { id, url, type, formatId, bandwidth, playlistStart, playlistEnd }) => {
  if (!binaryOk(YTDLP)) {
    return { success: false, error: `yt-dlp.exe not found in bin/ folder.\n\nExpected: ${YTDLP}` };
  }

  const settings = readStore();
  const dlPath = settings.downloadPath || path.join(app.getPath('downloads'), 'RAVdownloader');
  ensureDir(dlPath);

  const args = [];

  if (type === 'mp3') {
    args.push(
      '-x', '--audio-format', 'mp3', '--audio-quality', '0',
      '--ffmpeg-location', BIN_DIR,
      '-o', path.join(dlPath, '%(title)s.%(ext)s'),
      '--no-playlist', '--newline',
    );
  } else {
    if (!binaryOk(FFMPEG)) {
      return { success: false, error: `ffmpeg.exe not found in bin/ folder.\n\nExpected: ${FFMPEG}` };
    }
    const fmt = formatId || 'bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]+bestaudio/bestvideo+bestaudio/best';
    args.push(
      '-f', fmt,
      '--merge-output-format', 'mp4',
      '--ffmpeg-location', BIN_DIR,
      '-o', path.join(dlPath, '%(title)s - %(height)sp.%(ext)s'),
      '--newline',
    );
    if (playlistStart || playlistEnd) {
      if (playlistStart) args.push('--playlist-start', String(playlistStart));
      if (playlistEnd)   args.push('--playlist-end',   String(playlistEnd));
    } else {
      args.push('--no-playlist');
    }
  }

  if (bandwidth && bandwidth > 0) args.push('-r', `${bandwidth}K`);
  args.push(url);

  logEntry({ event: 'download-start', id, url, type, formatId, cmd: [YTDLP, ...args].join(' ') });

  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(YTDLP, args, { windowsHide: true });
    } catch (spawnErr) {
      resolve({ success: false, error: 'Failed to start yt-dlp: ' + spawnErr.message });
      return;
    }

    activeProcs.set(id, proc);
    let stderrBuf = '';

    proc.stdout.on('data', d => {
      d.toString().split('\n').forEach(line => {
        const l = line.trim();
        if (l) mainWindow?.webContents.send('dl-progress', { id, line: l });
      });
    });

    proc.stderr.on('data', d => {
      const s = d.toString();
      stderrBuf += s;
      s.split('\n').forEach(line => {
        const l = line.trim();
        if (l) mainWindow?.webContents.send('dl-progress', { id, line: l });
      });
    });

    proc.on('error', err => {
      activeProcs.delete(id);
      logEntry({ event: 'download-spawn-error', id, error: err.message });
      resolve({ success: false, error: 'Spawn error: ' + err.message });
    });

    proc.on('close', code => {
      activeProcs.delete(id);
      logEntry({ event: 'download-end', id, code, stderr: stderrBuf.slice(0, 500) });
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: stderrBuf.slice(-800) || `Process exited with code ${code}` });
      }
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
            let downloaded = 0;
            res2.on('data', chunk => {
              downloaded += chunk.length;
              send(`Downloading... ${(downloaded / 1048576).toFixed(1)} MB`);
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

    const args = outputFormat === 'png'
      ? ['-i', inputPath, '-y', outPath]
      : ['-i', inputPath,
         '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
         '-c:a', 'aac', '-b:a', '192k',
         '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', outPath];

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
