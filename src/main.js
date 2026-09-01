const { app, BrowserWindow, ipcMain, dialog, shell, Menu, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const https = require('https');
const http  = require('http');
const authClient = require('./auth-client');

// ─── App info ────────────────────────────────────────────────────────────────
// APP_VERSION is read from package.json so the running version can never drift
// from the installer/build metadata — one source of truth, one bump per release.
const APP_VERSION = app.getVersion();
const APP_VERSION_DATE = '8-26-26';
// Update manifest served by our own API (worker editbaytools-api, D1 + R2).
// Shape: { version, downloadUrl_win, downloadUrl_mac, notes, sha256 }.
const APP_UPDATE_URL = 'https://api.editbaytools.com/v1/app/latest';

// ─── Platform ────────────────────────────────────────────────────────────────
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const EXE_SUFFIX = IS_WIN ? '.exe' : '';
const YTDLP_NAME   = IS_WIN ? 'yt-dlp.exe'   : 'yt-dlp';
// User-facing name for the download backend — never surface the vendor name.
const ENGINE_LABEL = 'Media engine';
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

// ─── Launching ffmpeg ─────────────────────────────────────────────────────────
//
// Every ffmpeg call goes through spawnFF so three things are always true:
//
//   -hide_banner   ffmpeg's startup banner is several kilobytes of build flags
//                  written to stderr on every single run. We never read it, and
//                  it is pure pressure on a pipe buffer that must not fill.
//   -nostdin       ffmpeg reads stdin looking for keyboard commands. Our stdin
//                  is a pipe nobody writes to, and on some inputs ffmpeg will
//                  block waiting on it. It has no console here, so this is
//                  never wanted.
//   -threads N     on macOS only. See below.
//
// The thread cap exists because of a real bug report: a Mac user said the
// machine "sounded like it was about to explode" and then hung. Software H.264
// encoding will use every core it is given, and on a thin Mac laptop that means
// the fans hit maximum within seconds and the whole machine becomes sluggish.
// Leaving two cores free costs a little encode time and makes the app feel like
// a tool rather than a stress test. Windows machines are typically desktops
// with the thermal headroom to spare, so they are left to ffmpeg's own default.
const CPU_COUNT = (() => {
  try { return require('os').cpus().length || 4; } catch { return 4; }
})();
const FF_THREADS = IS_MAC ? Math.max(2, Math.min(8, CPU_COUNT - 2)) : 0;

function ffGlobalArgs() {
  const a = ['-hide_banner', '-nostdin'];
  if (FF_THREADS) a.push('-threads', String(FF_THREADS));
  return a;
}

/**
 * Spawns ffmpeg with the global arguments above.
 *
 * Also drains stdout unconditionally. ffmpeg normally writes nothing there
 * because output goes to a file, but an unread pipe that unexpectedly receives
 * data deadlocks the child once the OS buffer fills, and the failure looks like
 * the app freezing rather than anything to do with ffmpeg. Draining is free.
 */
function spawnFF(args, opts = {}) {
  const proc = spawn(FFMPEG, [...ffGlobalArgs(), ...args], { windowsHide: true, ...opts });
  proc.stdout?.resume();
  return proc;
}

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

// ─── Taskbar progress ────────────────────────────────────────────────────────
// Windows: shows a colored progress fill inside the app's taskbar icon (like
// Adobe Media Encoder) so users can see progress while the window is minimized.
// mode: 'normal' | 'indeterminate' | 'error' | 'paused' | 'none'
function setTaskbarProgress(pct, mode = 'normal') {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    if (mode === 'none') { mainWindow.setProgressBar(-1); return; }
    if (mode === 'indeterminate') { mainWindow.setProgressBar(2, { mode: 'indeterminate' }); return; }
    const v = Math.max(0, Math.min(1, (pct || 0) / 100));
    if (mode === 'error' || mode === 'paused') {
      mainWindow.setProgressBar(Math.max(v, 0.01), { mode });
    } else {
      mainWindow.setProgressBar(v);
    }
  } catch {}
}

// Returns true if the file exists and is larger than 50KB (real binary, not placeholder text file)
function binaryOk(p) {
  try {
    if (!fs.existsSync(p)) return false;
    if (fs.statSync(p).size <= 50000) return false;

    // On macOS and Linux a file can be present, the right size, and still not
    // runnable. The execute bit does not survive every way a file can travel —
    // a zip round trip, a copy through some sync tools, a restore from backup —
    // and when it is missing the failure is an unhelpful EACCES at spawn time
    // rather than anything that points at permissions. Try to put it back once;
    // if that is not allowed, report the binary as unusable so the caller shows
    // a real error instead of appearing to hang.
    if (!IS_WIN) {
      try {
        fs.accessSync(p, fs.constants.X_OK);
      } catch {
        try {
          fs.chmodSync(p, 0o755);
          fs.accessSync(p, fs.constants.X_OK);
          logEntry({ event: 'binary-exec-bit-restored', path: p });
        } catch {
          return false;
        }
      }
    }
    return true;
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

async function probeHasAudio(filePath) {
  const { stdout, code } = await runExe(FFPROBE, [
    '-v', 'quiet',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name',
    '-of', 'csv=p=0',
    filePath,
  ], 15000);
  return code === 0 && stdout.trim().length > 0;
}

// Read the EXIF/displaymatrix rotation (degrees) baked into a still image.
// The multi-branch VO filter chain (split=3) drops ffmpeg's implicit
// autorotation, so we probe here and re-apply it explicitly with `transpose`.
// Returns { raw: <number|NaN>, normalized: <0|±90|180> }.
//   raw        — exactly what ffprobe reported (or NaN if no rotation tag)
//   normalized — snapped to 90° multiples, but ONLY if raw is within 5° of one.
//                Malformed displaymatrix fields (seen in some PNGs) report
//                garbage angles like 135°; ffmpeg itself warns "Odd rotation
//                angle" and refuses to apply them, and if we snap-and-rotate
//                those the output ends up flipped even though the source is
//                fine. When raw is odd we return 0 → no filter prepended.
async function probeImageRotation(filePath) {
  const { stdout, code } = await runExe(FFPROBE, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'frame_side_data=rotation',
    '-read_intervals', '%+#1',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ], 15000);
  const raw = code === 0 ? parseFloat(String(stdout).trim()) : NaN;
  if (!Number.isFinite(raw)) return { raw: NaN, normalized: 0 };
  const rounded = Math.round(raw / 90) * 90;
  if (Math.abs(raw - rounded) > 5) return { raw, normalized: 0 };
  const normalized = ((rounded % 360) + 540) % 360 - 180;
  return { raw, normalized };
}

// Full diagnostic probe for the VO debug log — captures dimensions, sar, dar,
// codec, pix_fmt, and *every* frame side-data block (displaymatrix, EXIF, ICC).
// Nothing here is used to drive the filter chain; it's purely for the log file
// so we can see why a specific image renders sideways.
async function probeImageDiagnostics(filePath) {
  const streamProbe = await runExe(FFPROBE, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,codec_name,pix_fmt,sample_aspect_ratio,display_aspect_ratio',
    '-of', 'default=noprint_wrappers=1',
    filePath,
  ], 15000);
  const frameProbe = await runExe(FFPROBE, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_frames',
    '-read_intervals', '%+#1',
    filePath,
  ], 15000);
  return {
    stream: (streamProbe.stdout || '').trim(),
    frame:  (frameProbe.stdout  || '').trim(),
    streamErr: (streamProbe.stderr || '').trim(),
    frameErr:  (frameProbe.stderr  || '').trim(),
  };
}

// Write a human-readable dump of one VO build to logs/vo-debug.log. Meant to be
// copy-pasted into a bug report. Overwrites (not appends) so the file always
// reflects the *most recent* build the user actually clicked.
function writeVoDebugLog(sections) {
  try {
    ensureDir(LOG_DIR);
    const debugPath = path.join(LOG_DIR, 'vo-debug.log');
    fs.writeFileSync(debugPath, sections.join('\n'));
    return debugPath;
  } catch (e) {
    return null;
  }
}

// Filter prefix (empty or ends with ",") that bakes EXIF rotation into pixels
// before it hits split/scale/overlay — those don't propagate displaymatrix.
function rotationFilterPrefix(rotationDeg) {
  const r = ((Math.round(rotationDeg) % 360) + 360) % 360;
  if (r === 90)  return 'transpose=2,';        // rotation=+90  (Orientation 8)
  if (r === 180) return 'transpose=1,transpose=1,';
  if (r === 270) return 'transpose=1,';        // rotation=-90  (Orientation 6)
  return '';
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

// Normalize a user-entered time string ("29", "0:29", ":29", "1:02:03", "45.5")
// into a plain seconds string that ffmpeg's -ss / -to always accept.
// Returns null when the value is missing/unparseable so we skip the flag.
function normalizeFFmpegTime(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const parts = s.split(':');
  let sec;
  if (parts.length === 3) {
    sec = (parseFloat(parts[0]) || 0) * 3600 + (parseFloat(parts[1]) || 0) * 60 + (parseFloat(parts[2]) || 0);
  } else if (parts.length === 2) {
    sec = (parseFloat(parts[0]) || 0) * 60 + (parseFloat(parts[1]) || 0);
  } else {
    sec = parseFloat(s);
  }
  if (!Number.isFinite(sec) || sec < 0) return null;
  return String(sec);
}

// ─── FFmpeg command builder (Advanced features) ────────────────────────────
function buildAdvancedFFmpegArgs({ inputPath, outputPath, trim, sourceName, fontPath, videoWidth, videoHeight, blurPillarbox, blurAmount, hardLimiter, addTail, hasAudio }) {
  const args = [];

  // Trim: input-side seek flags (before -i for fast seeking).
  // Values are normalized because raw strings like ":29" are rejected by ffmpeg.
  if (trim) {
    const startSec = normalizeFFmpegTime(trim.start);
    const endSec   = normalizeFFmpegTime(trim.end);
    if (startSec !== null) args.push('-ss', startSec);
    if (endSec   !== null) args.push('-to', endSec);
  }

  args.push('-i', inputPath);

  // Determine what processing is needed
  const is16by9 = videoWidth && videoHeight && Math.abs((videoWidth / videoHeight) - (16 / 9)) < 0.02;
  const needsBlur = blurPillarbox && videoWidth && videoHeight && !is16by9;
  const needsBug = sourceName && sourceName.trim() && fontPath;

  if (needsBlur || needsBug || addTail) {
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
      // Renderer pre-fills the input with "SOURCE: " so the user can edit or
      // replace it (e.g. type a date instead). Render the raw text as-is.
      const text = escapeFFmpegText(sourceName.trim().toUpperCase());
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

    if (addTail) {
      // Freeze the last frame for 1s (audio silence added separately via -af apad).
      filterParts.push(`[${lastLabel}]tpad=stop_mode=clone:stop_duration=1[withtail]`);
      lastLabel = 'withtail';
    }

    // Strip the output label from the last filter (FFmpeg uses it as final output)
    const lastIdx = filterParts.length - 1;
    filterParts[lastIdx] = filterParts[lastIdx].replace(/\[[^\]]+\]$/, '');

    args.push('-filter_complex', filterParts.join(';'));
  } else {
    // Simple 16:9 scale — no filter_complex needed
    args.push('-vf', 'scale=1280:720');
  }

  const audioFilters = [];
  if (hardLimiter) audioFilters.push('alimiter=limit=0.251189:level=0');
  // Only pad audio when the source actually has an audio stream.
  if (addTail && hasAudio) audioFilters.push('apad=pad_dur=1');
  if (audioFilters.length) {
    args.push('-af', audioFilters.join(','));
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
  const lines = ['# Netscape HTTP Cookie File', '# This file was generated by Edit Bay Studio', ''];
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
    width: 1400, height: 980,
    minWidth: 1020, minHeight: 720,
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

  // Surface renderer problems in the terminal. A thrown error during startup
  // leaves the window painted in its background colour with no UI, which is
  // otherwise invisible from the main process.
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const tag = ['LOG', 'WARN', 'ERROR', 'DEBUG'][level] || 'LOG';
    if (level >= 2) console.error(`[renderer ${tag}] ${message}  (${sourceId}:${line})`);
  });
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[renderer] did-fail-load', code, desc, url);
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[renderer] process gone:', JSON.stringify(details));
  });
  mainWindow.webContents.on('preload-error', (_e, preloadPath, error) => {
    console.error('[renderer] preload error in', preloadPath, error);
  });


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

// ─── Accounts and licensing ───────────────────────────────────────────────
//
// Nobody reaches the tools without an account and an active plan. The flow:
//
//   launch → is there a saved session?
//              no  → login window
//              yes → ask the API for a licence → main window
//                    (the window opens either way; if the plan is not active
//                     the renderer paints a lock over the tools)
//
// The licence is re-checked after every sign-in and once a day just after
// midnight Eastern, which is what the customer was told would happen. If we
// cannot reach the server we fall back to the last signed licence until it
// expires — the server sets that expiry to the offline grace window.
let loginWindow;
let cachedUser = null;      // populated after a successful verify or sign-in
let licenseState = null;    // the last answer, shared with the renderer
let licenseTimer = null;    // the next scheduled check

const platformString = () => (IS_MAC ? 'mac-arm64' : 'win-x64');
const SITE_URL = 'https://editbaytools.com';

function createLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) { loginWindow.focus(); return; }
  const opts = {
    width: 460, height: 680, resizable: false, minimizable: true, maximizable: false,
    backgroundColor: '#0A1220',
    show: true,             // show immediately, don't wait for ready-to-show
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
  if (IS_MAC) {
    opts.titleBarStyle = 'hiddenInset';
    opts.trafficLightPosition = { x: 12, y: 12 };
  } else {
    opts.frame = false;
    opts.icon = path.join(__dirname, '..', 'assets', 'icon.ico');
  }
  loginWindow = new BrowserWindow(opts);
  loginWindow.loadFile(path.join(__dirname, 'renderer', 'login.html'));
  loginWindow.once('ready-to-show', () => { loginWindow.show(); loginWindow.focus(); });
  // Fallback: if ready-to-show never fires for some reason, force-show after 2s
  setTimeout(() => {
    if (loginWindow && !loginWindow.isDestroyed() && !loginWindow.isVisible()) {
      loginWindow.show();
      loginWindow.focus();
    }
  }, 2000);
  loginWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('Login window failed to load:', code, desc, url);
  });
  if (IS_MAC) buildMacMenu(); else Menu.setApplicationMenu(null);
}

// Development escape hatch: EBS_OPEN_ACCESS=1 skips the gate entirely. It is off
// by default, so a shipped build always requires a plan.
const OPEN_ACCESS = process.env.EBS_OPEN_ACCESS === '1';

/** Tells the renderer where it stands, and remembers it for anything that asks later. */
function publishLicenseState(state) {
  licenseState = state;
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('license-state', state);
    }
  } catch {}
}

/**
 * Runs a licence check and schedules the next one.
 *
 * The server tells us when to come back — just after midnight Eastern — so the
 * schedule stays correct across daylight saving without this side working any
 * of that out.
 */
async function runLicenseCheck({ reason = 'scheduled' } = {}) {
  if (OPEN_ACCESS) {
    publishLicenseState({ active: true, openAccess: true, reason: 'open_access' });
    return licenseState;
  }

  const r = await authClient.checkLicense({
    appVersion: APP_VERSION, platform: platformString(),
  }).catch((e) => ({ ok: false, active: false, reason: 'error', error: e.message }));

  publishLicenseState({ ...r, checkedAt: new Date().toISOString(), checkReason: reason });

  // Signed out on the server, or the seat was taken by another machine. Send
  // them back to the sign-in window rather than leaving a dead app open.
  if (r.reason === 'signed_out') {
    cachedUser = null;
    try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close(); } catch {}
    createLoginWindow();
    return r;
  }

  scheduleNextLicenseCheck(r);
  return r;
}

function scheduleNextLicenseCheck(r) {
  if (licenseTimer) { clearTimeout(licenseTimer); licenseTimer = null; }

  let delay;
  if (r && r.checkAfter) {
    delay = new Date(r.checkAfter).getTime() - Date.now();
  }
  // Offline, or the server did not say: try again in an hour rather than
  // waiting a whole day to notice the network came back.
  if (!Number.isFinite(delay) || delay <= 0) delay = 60 * 60 * 1000;

  // setTimeout overflows past ~24.8 days; nothing here goes that far, but clamp
  // anyway so a bad date can never turn into an immediate loop.
  delay = Math.min(delay + 30_000, 25 * 60 * 60 * 1000);

  licenseTimer = setTimeout(() => { runLicenseCheck({ reason: 'daily' }); }, delay);
}

async function bootstrap() {
  try {
    if (OPEN_ACCESS) {
      console.warn('[license] EBS_OPEN_ACCESS is set — the plan check is switched off');
      authClient.verifySession()
        .then(v => { if (v && v.ok && v.user) cachedUser = v.user; })
        .catch(() => {});
      publishLicenseState({ active: true, openAccess: true, reason: 'open_access' });
      createWindow();
      return;
    }

    const v = await authClient.verifySession();

    if (v.ok && v.user) {
      cachedUser = v.user;
      createWindow();
      runLicenseCheck({ reason: 'launch' });
      return;
    }

    // Offline with a licence still inside its grace window: let them work.
    if (v.offline) {
      const cached = authClient.cachedLicense();
      if (cached && cached.active) {
        console.warn('[license] offline — running on the cached licence');
        createWindow();
        publishLicenseState({ ...cached, ok: true, online: false, checkReason: 'launch_offline' });
        scheduleNextLicenseCheck(null);
        return;
      }
    }

    createLoginWindow();
  } catch (err) {
    console.error('bootstrap failed:', err);
    dialog.showErrorBox('Edit Bay Studio failed to start',
      `An error occurred during startup:\n\n${err.message || err}\n\nCheck the terminal for details.`);
    app.quit();
  }
}

process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

app.whenReady().then(bootstrap);
app.on('window-all-closed', () => app.quit());

// ─── Account IPC ──────────────────────────────────────────────────────────
ipcMain.handle('auth-signup', async (_e, opts) => {
  return authClient.signup(opts || {});
});

ipcMain.handle('auth-login', async (_e, opts) => {
  const r = await authClient.login({
    email: opts?.email,
    password: opts?.password,
    appVersion: APP_VERSION,
    platform: platformString(),
  });
  if (r.ok && r.user) cachedUser = r.user;
  return r;
});

ipcMain.handle('auth-logout', async () => {
  cachedUser = null;
  return authClient.logout();
});

ipcMain.handle('auth-recheck', async () => {
  const v = await authClient.verifySession();
  if (v.ok && v.user) cachedUser = v.user;
  return v;
});

ipcMain.handle('auth-initial-state', async () => {
  const v = await authClient.verifySession();
  if (!v.ok || !v.user) return null;
  cachedUser = v.user;
  return { user: v.user, entitlement: v.entitlement || null };
});

ipcMain.handle('auth-send-email-code', async () => authClient.sendEmailCode());
ipcMain.handle('auth-verify-email',    async (_e, opts) => authClient.verifyEmail(opts || {}));
ipcMain.handle('auth-forgot-password', async (_e, opts) => authClient.forgotPassword(opts || {}));

ipcMain.on('auth-enter-app', () => {
  if (loginWindow && !loginWindow.isDestroyed()) {
    try { loginWindow.close(); } catch {}
    loginWindow = null;
  }
  createWindow();
  runLicenseCheck({ reason: 'signed_in' });
});

ipcMain.on('auth-open-legal', (_e, which) => {
  const map = {
    terms: '/legal/terms/', privacy: '/legal/privacy/',
    refunds: '/legal/refunds/', eula: '/legal/eula/',
  };
  shell.openExternal(SITE_URL + (map[which] || '/legal/terms/'));
});

// ─── Licence IPC ──────────────────────────────────────────────────────────
// Deliberately does NOT fall back to the cached licence. At launch a check is
// already in flight, and answering from a stale cache made the lock flash up
// before the real answer arrived. Null means "not known yet", and the renderer
// draws nothing until it is told. The offline path publishes the cache itself.
ipcMain.handle('license-get', async () => licenseState || null);
ipcMain.handle('license-refresh', async () => runLicenseCheck({ reason: 'manual' }));
ipcMain.handle('license-open-purchase', async () => {
  shell.openExternal(`${SITE_URL}/pricing/`);
  return { ok: true };
});
ipcMain.handle('license-open-account', async () => {
  shell.openExternal(`${SITE_URL}/account/`);
  return { ok: true };
});

// Exposed to the main app renderer (window.api) — read current user + sign out
ipcMain.handle('auth-get-user', async () => {
  if (cachedUser) return cachedUser;
  const v = await authClient.verifySession().catch(() => null);
  if (v && v.ok && v.user) { cachedUser = v.user; return v.user; }
  return null;
});

ipcMain.handle('auth-signout-from-app', async () => {
  cachedUser = null;
  if (licenseTimer) { clearTimeout(licenseTimer); licenseTimer = null; }
  licenseState = null;
  try { await authClient.logout(); } catch {}
  try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close(); } catch {}
  createLoginWindow();
  return { ok: true };
});

ipcMain.handle('auth-change-password', async (_e, opts) => {
  return authClient.changePassword(opts || {});
});


// If the user has opted in, wipe the persisted UI state (skip queue / advanced
// toggles / etc.) so the next launch starts with defaults.
app.on('before-quit', () => {
  try {
    const s = readStore();
    if (s.clearUiOnClose) {
      delete s.uiState;
      writeStore(s);
    }
  } catch {}
});

// ─── Window controls ──────────────────────────────────────────────────────────
ipcMain.on('win-minimize', () => mainWindow?.minimize());
ipcMain.on('win-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('win-close',    () => mainWindow?.close());

// ─── Settings ─────────────────────────────────────────────────────────────────
ipcMain.handle('get-settings', () => {
  const s = readStore();
  if (!s.downloadPath) s.downloadPath = path.join(app.getPath('downloads'), 'Edit Bay Studio');
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
    return { error: `${ENGINE_LABEL} not found.\n\nExpected location:\n${YTDLP}\n\nTry a Soft Update, or reinstall Edit Bay Studio. If it keeps happening, contact Support@editbaytools.com.` };
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
    return { error: (stderr || 'The media engine returned no data.') + '\n\nCheck the URL and try again.' };
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
    return { success: false, error: `${ENGINE_LABEL} not found.\n\nExpected: ${YTDLP}\n\nTry a Soft Update, or reinstall Edit Bay Studio.` };
  }

  const settings = readStore();
  const dlPath = settings.downloadPath || path.join(app.getPath('downloads'), 'Edit Bay Studio');
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
      return { success: false, error: `Media components not found.\n\nExpected: ${FFMPEG}\n\nReinstall Edit Bay Studio, or contact Support@editbaytools.com.` };
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
      resolve({ success: false, error: 'Could not start the media engine: ' + spawnErr.message });
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

    setTaskbarProgress(0, 'indeterminate');

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

          // Drive taskbar bar from yt-dlp's own "[download] xx.x%" output.
          const pctMatch = l.match(/^\[download\]\s+(\d+(?:\.\d+)?)%/);
          if (pctMatch) {
            setTaskbarProgress(parseFloat(pctMatch[1]), 'normal');
          } else if (l.includes('[Merger]') || l.includes('Merging formats')) {
            setTaskbarProgress(99, 'normal');
          }

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
      setTaskbarProgress(0, 'none');
      resolve({ success: false, error: 'Spawn error: ' + err.message });
    });

    proc.on('close', async (code) => {
      clearInterval(staleCheckTimer);
      activeProcs.delete(id);
      logEntry({ event: 'download-end', id, code, mergedFile, hasAdvanced: !!advanced, stderr: stderrBuf.slice(0, 500) });
      if (code !== 0) {
        setTaskbarProgress(0, 'error');
        setTimeout(() => setTaskbarProgress(0, 'none'), 2000);
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
                encProc = spawnFF([
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
          const hasTail = !!advanced.addTail;
          const needsAdvanced = hasTrim || (hasSourceBug && fontPath) || (hasBlur && videoSize) || hasLimiter || hasTail;
          if (needsAdvanced) {
            mainWindow?.webContents.send('dl-progress', { id, line: 'Applying advanced processing (blur pillarbox / trim / source bug)...' });

            // Only probe for audio if tail is requested — apad must be skipped for VO
            // (no audio stream) or ffmpeg errors out.
            let hasAudio = false;
            if (hasTail) {
              try { hasAudio = await probeHasAudio(mergedFile); } catch {}
            }

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
              addTail: hasTail,
              hasAudio,
            });
            logEntry({ event: 'advanced-start', id, file: mergedFile, ffmpegArgs: [FFMPEG, ...ffmpegArgs].join(' ') });

            let ffmpegStderr = '';
            const advResult = await new Promise((res) => {
              let advProc;
              try {
                advProc = spawnFF(ffmpegArgs, { windowsHide: true });
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
          let settled = false;
          const done = (v) => { if (!settled) { settled = true; clearTimeout(killTimer); res(v); } };
          let killTimer;
          try {
            limProc = spawnFF([
              '-i', mergedFile,
              '-af', 'alimiter=limit=0.251189:level=0',
              '-c:v', 'copy', '-y', tmpMp3
            ], { windowsHide: true });
          } catch (e) { done({ success: false }); return; }

          // This pipe MUST be read. ffmpeg reports progress on stderr the whole
          // time it runs; if nobody consumes it the OS buffer fills at roughly
          // 64 KB, the write blocks, and ffmpeg stops dead. 'close' then never
          // fires and this promise never settles — the app hangs with no error,
          // which is exactly what a Mac user reported. Reading and discarding
          // costs nothing and makes the deadlock impossible.
          limProc.stderr?.resume();

          // Belt and braces: even with the pipe drained, a wedged encode should
          // not freeze the download forever. Ten minutes is far beyond what a
          // limiter pass on an audio file can legitimately need.
          killTimer = setTimeout(() => {
            try { limProc.kill('SIGKILL'); } catch {}
            logEntry({ event: 'mp3-limiter-timeout', id });
            done({ success: false });
          }, 10 * 60 * 1000);

          limProc.on('error', () => done({ success: false }));
          limProc.on('close', c => done({ success: c === 0 }));
        });
        if (limResult.success && fs.existsSync(tmpMp3)) {
          fs.unlinkSync(mergedFile);
          fs.renameSync(tmpMp3, mergedFile);
          logEntry({ event: 'mp3-limiter-done', id });
        } else {
          try { fs.unlinkSync(tmpMp3); } catch {}
        }
      }

      setTaskbarProgress(100, 'normal');
      setTimeout(() => setTaskbarProgress(0, 'none'), 1500);
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
  setTaskbarProgress(0, 'none');
  return true;
});

// ─── yt-dlp version ───────────────────────────────────────────────────────────
ipcMain.handle('get-ytdlp-version', async () => {
  if (!binaryOk(YTDLP)) return `${ENGINE_LABEL} not found`;
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
    const req = https.get(apiUrl, { headers: { 'User-Agent': 'EditBayStudio/1.0' } }, (res) => {
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
    send('Checking for a new media engine build...');

    const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
    const req = https.get(apiUrl, { headers: { 'User-Agent': 'EditBayStudio/1.0' } }, (res) => {
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
          if (!asset) { resolve({ success: false, error: 'No engine build available for this platform right now. Try again later.' }); return; }
          downloadUrl = asset.browser_download_url;
          send(`Found build ${tagName}. Downloading...`);
        } catch (err) {
          resolve({ success: false, error: 'Could not read the update response: ' + err.message });
          return;
        }

        // Download the file
        let fileStream;
        try {
          ensureDir(BIN_DIR);
          fileStream = fs.createWriteStream(tmpPath);
        } catch (err) {
          resolve({ success: false, error: 'Could not write the update to disk: ' + err.message });
          return;
        }

        const followRedirect = (url, hops) => {
          if (hops > 10) { resolve({ success: false, error: 'Too many redirects' }); return; }
          const mod = url.startsWith('https') ? https : http;
          mod.get(url, { headers: { 'User-Agent': 'EditBayStudio/1.0' } }, (res2) => {
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
                send('Installing soft update...');
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
                        send(`\u2713 Soft update complete \u2014 engine ${v}. Edit Bay Studio stayed open.`);
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
    req.setTimeout(15000, () => { req.destroy(); resolve({ success: false, error: 'The update server did not respond. Check your connection and try again.' }); });
  });
});

// ─── Supported sites ──────────────────────────────────────────────────────────
ipcMain.handle('get-supported-sites', async () => {
  if (!binaryOk(YTDLP)) {
    return { error: `${ENGINE_LABEL} not found.\n\nExpected location:\n${YTDLP}` };
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
ipcMain.handle('convert-file', async (_e, { inputPath, outputFormat, outputDir }) => {
  if (!binaryOk(FFMPEG)) {
    return { success: false, error: `Media components not found.\n\nExpected: ${FFMPEG}\n\nReinstall Edit Bay Studio, or contact Support@editbaytools.com.` };
  }
  const base = path.basename(inputPath, path.extname(inputPath));
  const outPath = path.join(outputDir, `${base}_converted.${outputFormat}`);
  ensureDir(outputDir);

  const isVideoOut = outputFormat === 'mp4';

  // For video conversions, probe duration so the taskbar shows a real %.
  let sourceDuration = 0;
  if (isVideoOut && binaryOk(FFPROBE)) {
    try {
      const { stdout, code } = await runExe(FFPROBE, [
        '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', inputPath,
      ], 10000);
      if (code === 0) sourceDuration = parseFloat(stdout.trim()) || 0;
    } catch {}
  }

  return new Promise((resolve) => {
    let args;
    if (outputFormat === 'png') {
      args = ['-i', inputPath, '-y', outPath];
    } else if (outputFormat === 'jpg' || outputFormat === 'jpeg') {
      // High-quality JPEG (q:v 2 ≈ quality 90). yuvj420p ensures broad compatibility.
      args = ['-i', inputPath, '-q:v', '2', '-pix_fmt', 'yuvj420p', '-y', outPath];
    } else if (outputFormat === 'pdf-png' || outputFormat === 'pdf-jpg') {
      const imgFmt = outputFormat === 'pdf-jpg' ? 'jpg' : 'png';
      setTaskbarProgress(0, 'indeterminate');
      convertPdfToImage(inputPath, outputDir, base, imgFmt)
        .then(result => {
          logEntry({ event: 'convert', inputPath, outputFormat, code: result.success ? 0 : 1 });
          setTaskbarProgress(result.success ? 100 : 0, result.success ? 'normal' : 'error');
          setTimeout(() => setTaskbarProgress(0, 'none'), result.success ? 1200 : 2000);
          resolve(result);
        })
        .catch(err => {
          logEntry({ event: 'convert', inputPath, outputFormat, error: err.message, code: 1 });
          setTaskbarProgress(0, 'error');
          setTimeout(() => setTaskbarProgress(0, 'none'), 2000);
          resolve({ success: false, error: err.message });
        });
      return;
    } else {
      args = ['-i', inputPath,
         '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
         '-c:a', 'aac', '-b:a', '192k',
         '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', outPath];
    }

    setTaskbarProgress(0, isVideoOut && sourceDuration > 0 ? 'normal' : 'indeterminate');

    let proc;
    try {
      proc = spawnFF(args, { windowsHide: true });
    } catch (err) {
      setTaskbarProgress(0, 'none');
      resolve({ success: false, error: err.message });
      return;
    }
    let stderr = '';
    proc.stderr.on('data', d => {
      const chunk = d.toString();
      stderr += chunk;
      if (isVideoOut && sourceDuration > 0) {
        const timeMatch = chunk.match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
        if (timeMatch) {
          const secs = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
          const pct = Math.min(99, Math.round((secs / sourceDuration) * 100));
          setTaskbarProgress(pct, 'normal');
        }
      }
    });
    proc.on('error', err => {
      setTaskbarProgress(0, 'none');
      resolve({ success: false, error: err.message });
    });
    proc.on('close', code => {
      logEntry({ event: 'convert', inputPath, outPath, code });
      const ok = code === 0;
      setTaskbarProgress(ok ? 100 : 0, ok ? 'normal' : 'error');
      setTimeout(() => setTaskbarProgress(0, 'none'), ok ? 1200 : 2000);
      resolve(ok ? { success: true, outputPath: outPath } : { success: false, error: stderr.slice(-400) });
    });
  });
});

// ─── Extract audio from video file ───────────────────────────────────────────
ipcMain.handle('extract-audio', async (_e, { inputPath, hardLimiter, trim, customFilename, outputDir }) => {
  if (!binaryOk(FFMPEG)) return { success: false, error: 'ffmpeg not found' };
  if (!inputPath || !fs.existsSync(inputPath)) return { success: false, error: 'Input file not found' };

  const baseName = customFilename || path.basename(inputPath, path.extname(inputPath)) + '_audio';
  const outDir = outputDir || path.dirname(inputPath);
  ensureDir(outDir);
  const outPath = path.join(outDir, baseName + '.mp3');

  // Probe duration once so we can drive the taskbar progress bar with a real %.
  let sourceDuration = 0;
  if (binaryOk(FFPROBE)) {
    try {
      const { stdout, code } = await runExe(FFPROBE, [
        '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', inputPath,
      ], 10000);
      if (code === 0) sourceDuration = parseFloat(stdout.trim()) || 0;
    } catch {}
  }
  // If the user is trimming, remaining duration = (end || sourceDuration) - (start || 0)
  const trimStartSec = (trim && trim.start) ? parseTimeStrToSec(trim.start) : 0;
  const trimEndSec   = (trim && trim.end)   ? parseTimeStrToSec(trim.end)   : sourceDuration;
  const totalDuration = Math.max(0.01, (trimEndSec || sourceDuration) - trimStartSec);

  return new Promise((resolve) => {
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
    setTaskbarProgress(0, 'indeterminate');

    let proc;
    try {
      proc = spawnFF(args, { windowsHide: true });
    } catch (err) {
      setTaskbarProgress(0, 'none');
      return resolve({ success: false, error: err.message });
    }

    let stderr = '';
    proc.stderr.on('data', d => {
      const chunk = d.toString();
      stderr += chunk;
      const line = chunk.trim();
      const timeMatch = line.match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
      if (timeMatch) {
        const secs = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
        const pct = Math.min(99, Math.round((secs / totalDuration) * 100));
        mainWindow?.webContents.send('extract-progress', `Extracting: ${pct}%`);
        setTaskbarProgress(pct, 'normal');
      } else if (line.includes('time=') || line.includes('size=')) {
        mainWindow?.webContents.send('extract-progress', 'Extracting: ' + line.slice(-60));
      }
    });

    proc.on('error', err => {
      logEntry({ event: 'extract-audio-error', error: err.message });
      setTaskbarProgress(0, 'none');
      resolve({ success: false, error: err.message });
    });

    proc.on('close', code => {
      logEntry({ event: 'extract-audio-done', code, outPath });
      if (code === 0 && fs.existsSync(outPath)) {
        mainWindow?.webContents.send('extract-progress', 'Done!');
        setTaskbarProgress(100, 'normal');
        setTimeout(() => setTaskbarProgress(0, 'none'), 1500);
        resolve({ success: true, outputPath: outPath });
      } else {
        mainWindow?.webContents.send('extract-progress', 'Failed');
        setTaskbarProgress(0, 'error');
        setTimeout(() => setTaskbarProgress(0, 'none'), 2000);
        resolve({ success: false, error: stderr.slice(-400) });
      }
    });
  });
});

// Parse "HH:MM:SS", "MM:SS", or plain seconds string into a Number.
function parseTimeStrToSec(str) {
  if (!str) return 0;
  const s = String(str).trim();
  const parts = s.split(':');
  if (parts.length === 3) return (parseFloat(parts[0]) || 0) * 3600 + (parseFloat(parts[1]) || 0) * 60 + (parseFloat(parts[2]) || 0);
  if (parts.length === 2) return (parseFloat(parts[0]) || 0) * 60 + (parseFloat(parts[1]) || 0);
  return parseFloat(s) || 0;
}

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
  setTaskbarProgress(0, 'indeterminate');

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
      proc = spawnFF(args, { windowsHide: true });
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
        setTaskbarProgress(pct, 'normal');
      }
    });

    proc.on('error', err => {
      logEntry({ event: 'merge-error', error: err.message });
      setTaskbarProgress(0, 'none');
      resolve({ success: false, error: err.message });
    });

    proc.on('close', code => {
      logEntry({ event: 'merge-done', code, outputPath });
      if (code === 0 && fs.existsSync(outputPath)) {
        mainWindow?.webContents.send('merge-progress', JSON.stringify({ status: 'done', pct: 100, msg: 'Merge complete!' }));
        setTaskbarProgress(100, 'normal');
        setTimeout(() => setTaskbarProgress(0, 'none'), 1500);
        resolve({ success: true, outputPath });
      } else {
        mainWindow?.webContents.send('merge-progress', JSON.stringify({ status: 'error', pct: 0, msg: 'Merge failed' }));
        setTaskbarProgress(0, 'error');
        setTimeout(() => setTaskbarProgress(0, 'none'), 2000);
        resolve({ success: false, error: stderr.slice(-400) });
      }
    });
  });
});

// ─── VO Maker: pictures → 720p slideshow with Ken Burns + crossfade ─────────
ipcMain.handle('make-vo', async (_e, { files, voName, outputDir, keyframes }) => {
  if (!binaryOk(FFMPEG)) return { success: false, error: `${FFMPEG_NAME} not found in bin/ folder` };
  if (!files || files.length < 1) return { success: false, error: 'Add at least 1 picture' };

  for (const f of files) {
    if (!fs.existsSync(f)) return { success: false, error: 'File not found: ' + f };
  }

  const cleanName = String(voName || '').replace(/[\\/:*?"<>|]/g, '').trim() || ('VO_' + Date.now());

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save VO Video',
    defaultPath: path.join(outputDir || readStore().downloadPath || app.getPath('downloads'), cleanName + '.mp4'),
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });
  if (result.canceled || !result.filePath) return { success: false, error: 'VO cancelled' };
  const outputPath = result.filePath;

  // AVIF / HEIC / HEIF are AV1-or-HEVC-in-ISO-BMFF, so ffmpeg picks the `mov`
  // demuxer for them and rejects our still-image `-loop 1` flag ("Option loop
  // not found"). Pre-decode those to PNG in a temp folder so every input flows
  // through the same image2-based still-image loop below.
  const PRETRANSCODE_EXTS = new Set(['avif', 'heic', 'heif']);
  const preDir = path.join(app.getPath('temp'), 'EditBayStudio-vo-pretranscode');
  try { ensureDir(preDir); }
  catch (e) { return { success: false, error: 'Could not create pre-decode temp folder: ' + e.message }; }

  const encodedFiles = [];
  const preSubstitutions = []; // { from, to } for debug log
  for (const f of files) {
    const ext = path.extname(f).toLowerCase().slice(1);
    if (!PRETRANSCODE_EXTS.has(ext)) { encodedFiles.push(f); continue; }
    const stem = path.basename(f, path.extname(f)).replace(/[^\w.\-]/g, '_').slice(0, 60);
    const tmpPng = path.join(preDir, `${stem}-${Date.now()}-${Math.floor(Math.random() * 100000)}.png`);
    const preErr = await new Promise((resolve) => {
      const proc = spawnFF(['-y', '-i', f, '-frames:v', '1', tmpPng], { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('error', err => resolve(err.message));
      proc.on('close', code => resolve(code === 0 ? '' : (stderr.slice(-400) || `ffmpeg exit ${code}`)));
    });
    if (preErr || !fs.existsSync(tmpPng)) {
      return { success: false, error: `Could not pre-decode ${path.basename(f)}: ${preErr || 'no output produced'}` };
    }
    encodedFiles.push(tmpPng);
    preSubstitutions.push({ from: f, to: tmpPng });
  }

  const PER_DURATION = 7.5;
  const TRANS_DURATION = 0.5;
  const FPS = 30;
  const W = 1280, H = 720;
  const TOTAL_FRAMES = Math.round(PER_DURATION * FPS); // 225
  const ZOOM_AMOUNT = 0.22;
  const n = encodedFiles.length;
  const totalDuration = n * PER_DURATION - Math.max(0, n - 1) * TRANS_DURATION;

  const args = [];
  for (const f of encodedFiles) {
    // -noautorotate: don't let ffmpeg silently apply the source's displaymatrix
    // on decode. Some PNGs (seen in the wild) carry a malformed EXIF
    // displaymatrix that ffprobe interprets as an "odd" angle (135°); with
    // autorotate on, ffmpeg still tries to honor it and warps the output. We
    // handle rotation ourselves via the transpose prefix built above, using
    // only clean 90° multiples.
    args.push('-noautorotate', '-loop', '1', '-t', String(PER_DURATION), '-framerate', String(FPS), '-i', f);
  }

  // For zoompan: 4x oversample so the zoom stays smooth (pixel jitter of the
  // integer-only sampling positions is invisible after downsampling to 720p).
  const OVERSAMPLE = 4;
  const UPW = W * OVERSAMPLE;
  const UPH = H * OVERSAMPLE;

  // Build zoompan expressions for one clip.
  //   scale s (1..4), centre x/y normalized 0..1 in output 1280×720 space.
  //   Interpolation is linear over the clip duration when both start+end given;
  //   otherwise it's a hold on the start frame.
  //   Coordinates map to the oversampled input (iw × ih):
  //     x_topleft = iw * cx - (iw / zoom) / 2
  //     y_topleft = ih * cy - (ih / zoom) / 2
  const buildZoomExprs = (kf) => {
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
    const s0 = clamp(kf.start.scale, 1, 4);
    const x0 = clamp(kf.start.x, 0, 1);
    const y0 = clamp(kf.start.y, 0, 1);
    const hasEnd = !!kf.end;
    const s1 = hasEnd ? clamp(kf.end.scale, 1, 4) : s0;
    const x1 = hasEnd ? clamp(kf.end.x, 0, 1) : x0;
    const y1 = hasEnd ? clamp(kf.end.y, 0, 1) : y0;
    const denom = TOTAL_FRAMES - 1;
    const zExpr  = `${s0.toFixed(4)}+(${(s1 - s0).toFixed(4)})*on/${denom}`;
    const cxExpr = `${x0.toFixed(4)}+(${(x1 - x0).toFixed(4)})*on/${denom}`;
    const cyExpr = `${y0.toFixed(4)}+(${(y1 - y0).toFixed(4)})*on/${denom}`;
    return {
      z: zExpr,
      x: `iw*(${cxExpr})-(iw/zoom/2)`,
      y: `ih*(${cyExpr})-(ih/zoom/2)`,
    };
  };

  // Probe EXIF/displaymatrix rotation for each still. The split=3 fan-out below
  // erases ffmpeg's implicit autorotation, so we have to bake it in explicitly
  // before the chain forks — otherwise phone photos (typically Orientation 6/8)
  // land sideways in the output while the modal preview looks correct.
  const rotationInfo = await Promise.all(encodedFiles.map(f => probeImageRotation(f)));
  const rotations    = rotationInfo.map(r => r.normalized);
  const diagnostics  = await Promise.all(encodedFiles.map(f => probeImageDiagnostics(f)));

  const filterParts = [];
  for (let i = 0; i < n; i++) {
    const kf = (Array.isArray(keyframes) && keyframes[i] && keyframes[i].start) ? keyframes[i] : null;

    let zExpr, xExpr, yExpr;
    if (kf) {
      const e = buildZoomExprs(kf);
      zExpr = e.z; xExpr = e.x; yExpr = e.y;
    } else {
      const isZoomIn = (i % 2 === 0); // alternate: even=in, odd=out
      zExpr = isZoomIn
        ? `1+${ZOOM_AMOUNT}*on/${TOTAL_FRAMES - 1}`
        : `${(1 + ZOOM_AMOUNT).toFixed(4)}-${ZOOM_AMOUNT}*on/${TOTAL_FRAMES - 1}`;
      xExpr = `iw/2-(iw/zoom/2)`;
      yExpr = `ih/2-(ih/zoom/2)`;
    }

    const rotPrefix = rotationFilterPrefix(rotations[i]);

    // Background is a cover-fit, gaussian-blurred copy of the same photo (like
    // Instagram / QuickTime pillarbox). "20% camera blur" ≈ gblur sigma 20.
    //
    // For transparent PNGs the fallback color comes from the image's OWN average
    // color (1×1 downscale then upscale), so nothing looks like a generic gray
    // or black rectangle — it always feels tied to the picture.
    filterParts.push(
      `[${i}:v]${rotPrefix}fps=${FPS},format=rgba,split=3[for_avg${i}][src_bg${i}][src_fg${i}]`
      // Average color of the source → filled canvas (used ONLY behind transparent alpha regions)
      + `;[for_avg${i}]scale=1:1:flags=area,scale=${W}:${H}:flags=neighbor,setsar=1,format=yuv420p[avg${i}]`
      // BG: cover-fit the source (crops overflow), composite onto the avg canvas to flatten any alpha
      + `;[src_bg${i}]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1[bg_cover${i}]`
      + `;[avg${i}][bg_cover${i}]overlay=0:0:shortest=1:format=auto[bg_flat${i}]`
      + `;[bg_flat${i}]gblur=sigma=20,format=yuv420p[bgb${i}]`
      // FG: aspect-preserving fit inside the frame (unchanged behavior)
      + `;[src_fg${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,setsar=1[fgs${i}]`
      // Composite, then oversample with lanczos so zoompan's integer sampling stays smooth
      + `;[bgb${i}][fgs${i}]overlay=(W-w)/2:(H-h)/2:format=auto,format=yuv420p,scale=${UPW}:${UPH}:flags=lanczos`
      + `,zoompan=z='${zExpr}':d=1:s=${W}x${H}:fps=${FPS}:x='${xExpr}':y='${yExpr}'[v${i}]`
    );
  }

  if (n >= 2) {
    let lastLabel = '[v0]';
    let offset = PER_DURATION - TRANS_DURATION;
    for (let i = 1; i < n; i++) {
      const outLabel = (i === n - 1) ? '[outv]' : `[xf${i}]`;
      filterParts.push(`${lastLabel}[v${i}]xfade=transition=fade:duration=${TRANS_DURATION}:offset=${offset.toFixed(3)}${outLabel}`);
      lastLabel = outLabel;
      offset += PER_DURATION - TRANS_DURATION;
    }
  } else {
    filterParts.push(`[v0]null[outv]`);
  }

  args.push('-filter_complex', filterParts.join(';'));
  args.push('-map', '[outv]');
  // Strip *all* container/stream metadata from the output. If we don't, ffmpeg
  // copies the source EXIF (including any bogus displaymatrix / rotation tag)
  // straight into the MP4 and players re-rotate the video on playback — even
  // though our filter chain produced correctly-oriented pixels.
  args.push('-map_metadata', '-1');
  args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
  args.push('-r', String(FPS));
  args.push('-an');
  args.push('-y', outputPath);

  // Build the human-readable debug dump BEFORE spawn so it exists even if
  // ffmpeg crashes hard. stderr gets appended in the close handler.
  const debugSections = [];
  debugSections.push('='.repeat(70));
  debugSections.push(`VO BUILD  ${new Date().toISOString()}`);
  debugSections.push(`App: ${APP_VERSION}   ffmpeg: ${FFMPEG}`);
  debugSections.push(`Output: ${outputPath}`);
  debugSections.push(`Files: ${n}    Per-clip: ${PER_DURATION}s @ ${FPS}fps    Canvas: ${W}x${H}`);
  if (preSubstitutions.length) {
    debugSections.push(`Pre-decoded ${preSubstitutions.length} file(s) (AVIF/HEIC/HEIF → PNG so -loop works):`);
    for (const s of preSubstitutions) debugSections.push(`  ${s.from}  →  ${s.to}`);
  }
  debugSections.push('='.repeat(70));
  for (let i = 0; i < n; i++) {
    const kf = (Array.isArray(keyframes) && keyframes[i] && keyframes[i].start) ? keyframes[i] : null;
    const rawRot = rotationInfo[i].raw;
    const rot    = rotationInfo[i].normalized;
    const prefix = rotationFilterPrefix(rot);
    let rotLine;
    if (!Number.isFinite(rawRot)) {
      rotLine = 'none (no rotation side-data)';
    } else if (rot === 0 && Math.round(rawRot) !== 0) {
      rotLine = `${rawRot} deg — IGNORED (odd angle, not a 90° multiple; source displaymatrix is likely malformed)`;
    } else {
      rotLine = `${rawRot} deg → normalized to ${rot} deg`;
    }
    const origPath = files[i];
    const encPath  = encodedFiles[i];
    debugSections.push(`\n--- File ${i + 1}/${n} ---`);
    debugSections.push(`Path: ${encPath}${encPath !== origPath ? '   (pre-decoded from: ' + origPath + ')' : ''}`);
    debugSections.push(`Detected rotation (ffprobe): ${rotLine}`);
    debugSections.push(`Applied filter prefix: ${prefix || '(none)'}`);
    debugSections.push(`Keyframes: ${kf ? JSON.stringify(kf) : '(none — default alternating zoom)'}`);
    debugSections.push(`--- ffprobe stream ---`);
    debugSections.push(diagnostics[i].stream || '(empty)');
    if (diagnostics[i].streamErr) debugSections.push(`(stderr) ${diagnostics[i].streamErr}`);
    debugSections.push(`--- ffprobe first frame (side data / EXIF / displaymatrix) ---`);
    debugSections.push(diagnostics[i].frame || '(empty)');
    if (diagnostics[i].frameErr) debugSections.push(`(stderr) ${diagnostics[i].frameErr}`);
  }
  debugSections.push('\n' + '='.repeat(70));
  debugSections.push('FULL FFMPEG COMMAND');
  debugSections.push('='.repeat(70));
  // Quote each arg so users can paste it into a shell for repro.
  const quotedArgs = args.map(a => /[\s"\\;&|<>()]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  debugSections.push([FFMPEG, ...quotedArgs].join(' '));
  const debugPath = writeVoDebugLog(debugSections);

  logEntry({ event: 'vo-start', n, outputPath, rotationInfo, debugPath });
  mainWindow?.webContents.send('vo-progress', JSON.stringify({ status: 'running', pct: 0, msg: 'Starting VO build…' }));
  setTaskbarProgress(0, 'indeterminate');

  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawnFF(args, { windowsHide: true });
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
        mainWindow?.webContents.send('vo-progress', JSON.stringify({ status: 'running', pct, msg: `Encoding: ${pct}%` }));
        setTaskbarProgress(pct, 'normal');
      }
    });

    proc.on('error', err => {
      logEntry({ event: 'vo-error', error: err.message });
      setTaskbarProgress(0, 'none');
      resolve({ success: false, error: err.message });
    });

    proc.on('close', code => {
      logEntry({ event: 'vo-done', code, outputPath });
      // Append ffmpeg stderr to the debug log — this is where actual rotation
      // errors / filter warnings / autorotate hints will show up.
      try {
        if (debugPath) {
          const tail = [
            '',
            '='.repeat(70),
            `FFMPEG EXIT CODE: ${code}`,
            '='.repeat(70),
            'FFMPEG STDERR (full):',
            stderr,
            '',
          ].join('\n');
          fs.appendFileSync(debugPath, tail);
        }
      } catch {}
      if (code === 0 && fs.existsSync(outputPath)) {
        mainWindow?.webContents.send('vo-progress', JSON.stringify({ status: 'done', pct: 100, msg: 'VO complete!', debugPath }));
        setTaskbarProgress(100, 'normal');
        setTimeout(() => setTaskbarProgress(0, 'none'), 1500);
        resolve({ success: true, outputPath, debugPath });
      } else {
        mainWindow?.webContents.send('vo-progress', JSON.stringify({ status: 'error', pct: 0, msg: 'VO build failed', debugPath }));
        setTaskbarProgress(0, 'error');
        setTimeout(() => setTaskbarProgress(0, 'none'), 2000);
        resolve({ success: false, error: stderr.slice(-500), debugPath });
      }
    });
  });
});

// Reveal the last VO debug log (or, if it doesn't exist, the logs folder).
ipcMain.handle('open-vo-debug-log', async () => {
  try {
    const debugPath = path.join(LOG_DIR, 'vo-debug.log');
    if (fs.existsSync(debugPath)) {
      shell.showItemInFolder(debugPath);
      return { success: true, path: debugPath };
    }
    ensureDir(LOG_DIR);
    shell.openPath(LOG_DIR);
    return { success: true, path: LOG_DIR, message: 'No VO build yet — opened logs folder' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Download an image URL to a temp file so the renderer can hand it to VO Maker
// as if it were a normal local file. Used by the VO drag-and-drop handler when
// the user drops an image straight from a browser (e.g. Google Images), which
// gives us a URL instead of a real file path.
ipcMain.handle('download-image-url', async (_e, url) => {
  const MAX_BYTES = 25 * 1024 * 1024;
  const MAX_REDIRECTS = 5;
  const TIMEOUT_MS = 15000;
  const ACCEPTED_EXTS = new Set(['jpg','jpeg','png','webp','avif','bmp','tif','tiff']);

  const extFromContentType = (ct) => {
    if (!ct) return '';
    const c = ct.toLowerCase().split(';')[0].trim();
    if (c === 'image/jpeg' || c === 'image/jpg') return 'jpg';
    if (c === 'image/png')                       return 'png';
    if (c === 'image/webp')                      return 'webp';
    if (c === 'image/avif')                      return 'avif';
    if (c === 'image/bmp' || c === 'image/x-ms-bmp') return 'bmp';
    if (c === 'image/tiff')                      return 'tiff';
    return '';
  };
  const extFromUrl = (u) => {
    try {
      const m = new URL(u).pathname.toLowerCase().match(/\.([a-z0-9]+)$/);
      if (!m) return '';
      const ext = m[1] === 'jpe' ? 'jpg' : m[1];
      return ACCEPTED_EXTS.has(ext) ? ext : '';
    } catch { return ''; }
  };

  const dropDir = path.join(app.getPath('temp'), 'EditBayStudio-vo-drops');
  try { ensureDir(dropDir); }
  catch (e) { return { success: false, error: 'Could not create temp folder: ' + e.message }; }

  return new Promise((resolve) => {
    let redirects = 0;

    const doRequest = (currentUrl) => {
      let parsed;
      try { parsed = new URL(currentUrl); }
      catch { return resolve({ success: false, error: 'Invalid URL' }); }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return resolve({ success: false, error: 'Only http(s) URLs are supported' });
      }
      const lib = parsed.protocol === 'https:' ? https : http;
      const req = lib.get(currentUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
          'Accept': 'image/*,*/*;q=0.8',
        },
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (++redirects > MAX_REDIRECTS) return resolve({ success: false, error: 'Too many redirects' });
          try { return doRequest(new URL(res.headers.location, currentUrl).toString()); }
          catch { return resolve({ success: false, error: 'Bad redirect location' }); }
        }
        if (res.statusCode !== 200) {
          res.resume();
          return resolve({ success: false, error: 'HTTP ' + res.statusCode });
        }

        const ext = extFromContentType(res.headers['content-type']) || extFromUrl(currentUrl);
        if (!ext) {
          res.resume();
          return resolve({ success: false, error: 'Unsupported image type (' + (res.headers['content-type'] || 'unknown') + ')' });
        }

        const contentLength = parseInt(res.headers['content-length'] || '0', 10);
        if (contentLength && contentLength > MAX_BYTES) {
          res.resume();
          return resolve({ success: false, error: 'Image too large (' + Math.round(contentLength / 1024 / 1024) + ' MB, limit 25 MB)' });
        }

        const filename = 'vo-drop-' + Date.now() + '-' + Math.floor(Math.random() * 100000) + '.' + ext;
        const outPath = path.join(dropDir, filename);
        const ws = fs.createWriteStream(outPath);
        let written = 0;
        let aborted = false;
        const abort = (err) => {
          if (aborted) return;
          aborted = true;
          try { res.destroy(); } catch {}
          try { ws.destroy(); } catch {}
          try { fs.unlinkSync(outPath); } catch {}
          resolve({ success: false, error: err });
        };

        res.on('data', (chunk) => {
          written += chunk.length;
          if (written > MAX_BYTES) abort('Image exceeded 25 MB during download');
        });
        res.on('error', (err) => abort(err.message));
        ws.on('error', (err) => abort('Write failed: ' + err.message));
        ws.on('finish', () => {
          if (!aborted) resolve({ success: true, path: outPath, name: filename });
        });
        res.pipe(ws);
      });

      req.on('error', (err) => resolve({ success: false, error: err.message }));
      req.setTimeout(TIMEOUT_MS, () => {
        req.destroy();
        resolve({ success: false, error: 'Request timed out' });
      });
    };

    doRequest(url);
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
  setTaskbarProgress(0, 'indeterminate');

  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawnFF(args, { windowsHide: true });
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
        setTaskbarProgress(pct, 'normal');
      }
    });

    proc.on('error', err => {
      logEntry({ event: 'podcast-error', error: err.message });
      setTaskbarProgress(0, 'none');
      resolve({ success: false, error: err.message });
    });

    proc.on('close', code => {
      const okMp4 = !wantMp4 || fs.existsSync(mp4Path);
      const okMp3 = !wantMp3 || fs.existsSync(mp3Path);
      if (code === 0 && okMp4 && okMp3) {
        logEntry({ event: 'podcast-done', code, wantMp4, wantMp3 });
        mainWindow?.webContents.send('podcast-progress', JSON.stringify({ status: 'done', pct: 100, etaSec: 0, speed: null, msg: 'Done!' }));
        setTaskbarProgress(100, 'normal');
        setTimeout(() => setTaskbarProgress(0, 'none'), 1500);
        resolve({
          success:  true,
          mp4Path:  wantMp4 ? mp4Path : null,
          mp3Path:  wantMp3 ? mp3Path : null,
          breaks,
        });
      } else {
        logEntry({ event: 'podcast-failed', code, wantMp4, wantMp3, okMp4, okMp3, stderrTail: stderr.slice(-1200) });
        mainWindow?.webContents.send('podcast-progress', JSON.stringify({ status: 'error', pct: 0, etaSec: null, speed: null, msg: 'Merge failed' }));
        setTaskbarProgress(0, 'error');
        setTimeout(() => setTaskbarProgress(0, 'none'), 2000);
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

// Numeric semver compare: returns 1 if a > b, -1 if a < b, 0 if equal.
// Guards the update popup from firing when the remote worker is behind the
// running client (which would otherwise prompt a phantom "downgrade").
function compareSemver(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

ipcMain.handle('check-app-update', () => {
  return new Promise((resolve) => {
    const req = https.get(APP_UPDATE_URL, { headers: { 'User-Agent': 'EditBayStudio/' + APP_VERSION } }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const info = JSON.parse(body);
          const latest = info.version || '';
          // Prefer platform-specific URL; fall back to legacy single `downloadUrl` (Windows-only feed).
          const platformUrl = IS_MAC ? info.downloadUrl_mac : info.downloadUrl_win;
          const downloadUrl = platformUrl || info.downloadUrl || '';
          const updateAvailable = latest.length > 0 && downloadUrl.length > 0 && compareSemver(latest, APP_VERSION) > 0;
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

// Mac update flow: mount DMG, copy new .app over /Applications/Edit Bay Studio.app,
// strip quarantine, detach DMG, and relaunch. The running app already has the user's
// full permissions so xattr/cp/open succeed without Gatekeeper prompts.
function installMacUpdate(dmgPath) {
  return new Promise((resolve) => {
    const mountPoint = path.join(app.getPath('temp'), 'EditBayStudio-update-mount-' + Date.now());
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
      // app.getPath('exe') → .../Edit Bay Studio.app/Contents/MacOS/Edit Bay Studio
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

      const scriptPath = path.join(app.getPath('temp'), 'EditBayStudio-install-' + Date.now() + '.sh');
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

    const tmpName = IS_MAC ? 'EditBayStudio-update.dmg' : 'EditBayStudio-update.exe';
    const tmpPath = path.join(app.getPath('temp'), tmpName);
    const send = pct => mainWindow?.webContents.send('app-update-progress', pct);

    let fileStream;
    try { fileStream = fs.createWriteStream(tmpPath); }
    catch (err) { resolve({ success: false, error: 'Cannot write temp file: ' + err.message }); return; }

    const followRedirect = (url, hops) => {
      if (hops > 10) { resolve({ success: false, error: 'Too many redirects' }); return; }
      const mod = url.startsWith('https') ? https : http;
      mod.get(url, { headers: { 'User-Agent': 'EditBayStudio/' + APP_VERSION } }, (res) => {
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

// ─── Report Issue ───────────────────────────────────────────────────────────
//
// Goes to our own API. This previously posted to a RAVdownloader worker on a
// personal domain, which meant Edit Bay Studio customers' names and logs were
// sent to infrastructure belonging to a different product — and to a third
// party the Privacy Policy never named. Reports now land somewhere that policy
// actually covers.
const REPORT_URL = `${authClient.API_URL}/v1/report`;

ipcMain.handle('submit-report', (_e, { failedUrl, description, attachVoDebugLog }) => {
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

    // When a VO build fails we want the ENTIRE vo-debug.log — the daily log's
    // last 50 lines don't include the full ffmpeg command or the stderr tail.
    let voDebugLog = '';
    if (attachVoDebugLog) {
      try {
        const debugPath = path.join(LOG_DIR, 'vo-debug.log');
        if (fs.existsSync(debugPath)) voDebugLog = fs.readFileSync(debugPath, 'utf8');
      } catch {}
    }

    // No name is sent. When the app has a session, the server links the report
    // to that account from the token below; when it does not, the report stays
    // anonymous — which is what makes "I cannot sign in" reportable at all.
    const payload = JSON.stringify({
      product: 'edit-bay-studio',
      appVersion: APP_VERSION,
      platform: process.platform,
      failedUrl: failedUrl || '',
      description: description || '',
      logs: recentLogs,
      voDebugLog,
      timestamp: new Date().toISOString(),
    });

    let token = null;
    try { token = authClient.loadToken(); } catch {}

    const url = new URL(REPORT_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'EditBayStudio/' + APP_VERSION,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
          // The API explains itself — "you have sent several reports already",
          // and so on. Show that rather than a bare status code.
          let msg = `Server responded with ${res.statusCode}`;
          try { const j = JSON.parse(body); if (j && j.error) msg = j.error; } catch {}
          resolve({ success: false, error: msg });
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

// ─── Social Media tab ───────────────────────────────────────────────────────
// Pipeline: download once (cap 1440p) → extract preview frame → user reframes
// in a canvas → render final MP4 with reframe + optional trim/limiter/bugs.
const SOCIAL_TMP_DIR = () => path.join(app.getPath('temp'), 'EditBayStudio-social');
let socialActiveProc = null;

function sendSocialProgress(kind, payload) {
  try {
    mainWindow?.webContents.send('social-progress', { kind, ...payload });
  } catch {}
}

function socialSanitizeFilename(s) {
  return String(s || 'video').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 100) || 'video';
}

ipcMain.handle('social-download', async (_e, { url }) => {
  if (!url || typeof url !== 'string') return { ok: false, error: 'URL required' };
  try { ensureDir(SOCIAL_TMP_DIR()); } catch (e) { return { ok: false, error: 'Could not create temp dir: ' + e.message }; }
  const stem = `sm-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const outputTemplate = path.join(SOCIAL_TMP_DIR(), `${stem}.%(ext)s`);
  const format = 'bestvideo[height<=1440][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=1440]+bestaudio/best[height<=1440]/best';

  const args = [
    '--no-playlist',
    '--merge-output-format', 'mp4',
    '-f', format,
    '-o', outputTemplate,
    '--newline',
    '--print', 'after_move:%(filepath)s',
    '--print', 'before_dl:%(title)s',
    url,
  ];
  const cookiesFile = getActiveCookiesPath();
  if (cookiesFile) { args.push('--cookies', cookiesFile); }

  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(YTDLP, args, {
        windowsHide: true,
        env: { ...process.env, PATH: BIN_DIR + path.delimiter + (process.env.PATH || '') },
      });
    } catch (err) { return resolve({ ok: false, error: 'Could not start the media engine: ' + err.message }); }
    socialActiveProc = proc;

    let stdout = '', stderr = '', title = '', outFile = '';
    proc.stdout.on('data', d => {
      const chunk = d.toString();
      stdout += chunk;
      for (const line of chunk.split(/\r?\n/)) {
        if (!line) continue;
        // Distinguish yt-dlp progress lines from the print sentinels
        if (line.startsWith('[download]') || line.startsWith('[Merger]') || line.startsWith('[ffmpeg]') || line.startsWith('[ExtractAudio]')) {
          sendSocialProgress('download', { line });
          continue;
        }
        // Titles / filepaths from --print
        if (!title && !line.match(/^[\/A-Za-z]:.*\.(mp4|mkv|webm|m4a)$/i)) { title = line.trim(); continue; }
        if (line.match(/\.(mp4|mkv|webm)$/i) && fs.existsSync(line.trim())) { outFile = line.trim(); }
      }
    });
    proc.stderr.on('data', d => { stderr += d.toString(); sendSocialProgress('download', { line: d.toString().split('\n')[0] }); });

    proc.on('close', async (code) => {
      socialActiveProc = null;
      if (code !== 0 || !outFile || !fs.existsSync(outFile)) {
        // Fallback: scan temp dir for the newest file matching stem
        try {
          const found = fs.readdirSync(SOCIAL_TMP_DIR()).find(f => f.startsWith(stem));
          if (found) outFile = path.join(SOCIAL_TMP_DIR(), found);
        } catch {}
      }
      if (!outFile || !fs.existsSync(outFile)) {
        return resolve({ ok: false, error: 'Download failed. ' + (stderr.split('\n').slice(-3).join(' ').slice(0, 400) || `Media engine exited with code ${code}`) });
      }
      const meta = await socialProbe(outFile);
      resolve({ ok: true, path: outFile, title: title || path.basename(outFile, path.extname(outFile)), ...meta });
    });
    proc.on('error', err => { socialActiveProc = null; resolve({ ok: false, error: err.message }); });
  });
});

async function socialProbe(filePath) {
  const size = await probeVideoSize(filePath);
  const has = await probeHasAudio(filePath);
  // Duration + fps
  const p = await runExe(FFPROBE, [
    '-v', 'quiet',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=r_frame_rate,duration:format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ], 15000);
  const lines = (p.stdout || '').trim().split('\n').filter(Boolean);
  let fps = 30, duration = 0;
  for (const l of lines) {
    if (l.includes('/')) {
      const [num, den] = l.split('/').map(Number);
      if (num && den) fps = num / den;
    } else {
      const d = parseFloat(l);
      if (!isNaN(d)) duration = Math.max(duration, d);
    }
  }
  return {
    width: size?.width || 0,
    height: size?.height || 0,
    duration,
    fps: Math.min(60, fps || 30),
    hasAudio: has,
  };
}

ipcMain.handle('social-extract-frame', async (_e, { sourcePath, timeSec }) => {
  if (!sourcePath || !fs.existsSync(sourcePath)) return { ok: false, error: 'Source not found' };
  try { ensureDir(SOCIAL_TMP_DIR()); } catch {}
  const t = Math.max(0, Number(timeSec) || 0);
  const outJpg = path.join(SOCIAL_TMP_DIR(), `frame-${Date.now()}.jpg`);
  // Use output-side seek for accuracy (input-side is fast but sometimes wrong on B-frames)
  const args = ['-y', '-ss', String(t), '-i', sourcePath, '-frames:v', '1', '-q:v', '3', outJpg];
  const r = await runExe(FFMPEG, args, 20000);
  if (r.code !== 0 || !fs.existsSync(outJpg)) return { ok: false, error: 'Frame extraction failed: ' + (r.stderr.slice(-300) || `exit ${r.code}`) };
  try {
    const buf = fs.readFileSync(outJpg);
    const dataUrl = 'data:image/jpeg;base64,' + buf.toString('base64');
    try { fs.unlinkSync(outJpg); } catch {}
    return { ok: true, dataUrl };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.on('social-cancel', () => {
  if (socialActiveProc) {
    try { socialActiveProc.kill(); } catch {}
    socialActiveProc = null;
  }
});

// Resolve the user-supplied logo-bug image. The user picks it from their own
// filesystem, so it always lives outside app.asar and ffmpeg can read it directly.
// We only verify it still exists — a logo can be moved or deleted between runs.
function socialResolveLogoBugPath(p) {
  if (!p) return null;
  try { return fs.existsSync(p) ? p : null; } catch { return null; }
}

// Build the ffmpeg filter_complex for the social render.
// Coordinate system: everything below is in OUTPUT pixels (1080x1080 or 1080x1920).
//   videoTransform: { scale, offsetX, offsetY }
//     - scale     — user's zoom factor RELATIVE to "fit" (1.0 = fit, 2.0 = 2× fit)
//     - offsetX/Y — top-left corner of the placed video, in output pixels
//   sourceBug: { on, text, caps, invert, fontSize, outline, x, y }  (x,y = top-left in output px)
//   logoBug:   { on, path, widthPx, x, y }                          (x,y = top-left in output px)
function buildSocialFilterGraph({
  outW, outH, srcW, srcH, videoTransform,
  logoBugPath, logoBug, sourceBug, fontPath,
}) {
  const parts = [];
  const inputs = [];   // extra -i files (logo bug PNG)

  // 1. Blurred pillarbox background — always use the "cover" scale so the
  //    background fills the frame regardless of aspect ratio.
  const sigma = 20;
  parts.push(
    `[0:v]scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},gblur=sigma=${sigma}[bg]`
  );

  // 2. Foreground video, sized to (fitScale × userZoom) of source.
  const fitScale = Math.min(outW / srcW, outH / srcH);
  const finalScale = Math.max(0.01, fitScale * (videoTransform.scale || 1));
  const fgW = Math.max(2, Math.round(srcW * finalScale));
  const fgH = Math.max(2, Math.round(srcH * finalScale));
  parts.push(`[0:v]scale=${fgW}:${fgH}[fg]`);

  // 3. Overlay fg onto bg. The user's offset was chosen relative to the
  //    default "fit" placement, so we translate it into absolute overlay coords.
  //    ffmpeg's overlay expects top-left; we let overlay clip beyond bounds.
  const fitOffsetX = Math.round((outW - srcW * fitScale) / 2);
  const fitOffsetY = Math.round((outH - srcH * fitScale) / 2);
  // Rescale the offset delta from user's "fit-relative" to "final-scale-relative"
  // so zooming in behaves as a scale-around-center feel.
  const overlayX = Math.round((videoTransform.offsetX ?? fitOffsetX));
  const overlayY = Math.round((videoTransform.offsetY ?? fitOffsetY));
  parts.push(`[bg][fg]overlay=${overlayX}:${overlayY}[composed]`);
  let lastLabel = 'composed';

  // 4. Source Bug — drawtext.
  if (sourceBug && sourceBug.on && sourceBug.text && String(sourceBug.text).trim() && fontPath) {
    const raw = sourceBug.caps ? String(sourceBug.text).trim().toUpperCase() : String(sourceBug.text).trim();
    const text = escapeFFmpegText(raw);
    const ffFontPath = fontPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const fontColor  = sourceBug.invert ? 'black' : 'white';
    const borderColor = sourceBug.invert ? 'white' : 'black';
    const outline = Math.max(0, Math.min(24, Number(sourceBug.outline) || 0));
    const fontSize = Math.max(8, Math.min(400, Number(sourceBug.fontSize) || 48));
    const bx = Math.round(sourceBug.x || 0);
    const by = Math.round(sourceBug.y || 0);
    const border = outline > 0 ? `:bordercolor=${borderColor}:borderw=${outline}` : '';
    parts.push(
      `[${lastLabel}]drawtext=fontfile='${ffFontPath}':text='${text}':fontcolor=${fontColor}:fontsize=${fontSize}:x=${bx}:y=${by}${border}[withtext]`
    );
    lastLabel = 'withtext';
  }

  // 5. Logo Bug — user-supplied image overlay with user-selected opacity (default 0.7).
  if (logoBug && logoBug.on && logoBugPath && logoBug.widthPx > 0) {
    inputs.push(logoBugPath);
    const idx = inputs.length; // becomes [1:v] since [0:v] is source
    const rw = Math.max(4, Math.round(logoBug.widthPx));
    const alpha = Math.max(0.05, Math.min(1, Number(logoBug.opacity) || 0.7));
    parts.push(`[${idx}:v]scale=${rw}:-1,format=rgba,colorchannelmixer=aa=${alpha.toFixed(3)}[logobug]`);
    const rx = Math.round(logoBug.x || 0);
    const ry = Math.round(logoBug.y || 0);
    parts.push(`[${lastLabel}][logobug]overlay=${rx}:${ry}[withlogo]`);
    lastLabel = 'withlogo';
  }

  // Keep the trailing [label] — the caller does `-map [lastLabel]` so ffmpeg
  // needs the named output to exist in the graph.
  return { filter: parts.join(';'), extraInputs: inputs, lastLabel };
}

ipcMain.handle('social-render', async (_e, opts) => {
  const {
    sourcePath, format, videoTransform, trim, noAudio, hardLimiter,
    sourceBug, logoBug, customFilename, title,
  } = opts || {};

  if (!sourcePath || !fs.existsSync(sourcePath)) return { ok: false, error: 'Source video no longer exists' };
  if (format !== 'square' && format !== 'vertical') return { ok: false, error: 'Bad format' };

  const outW = 1080;
  const outH = (format === 'square') ? 1080 : 1920;

  const meta = await socialProbe(sourcePath);
  const srcW = meta.width || 1920;
  const srcH = meta.height || 1080;
  const hasAudio = meta.hasAudio;

  // Output path
  const settings = readStore();
  const dlDir = settings.downloadPath || path.join(app.getPath('downloads'), 'Edit Bay Studio');
  try { ensureDir(dlDir); } catch (e) { return { ok: false, error: 'Could not create download folder: ' + e.message }; }

  const baseName = customFilename && String(customFilename).trim()
    ? socialSanitizeFilename(customFilename)
    : socialSanitizeFilename(title || path.basename(sourcePath, path.extname(sourcePath))) + '-' + format;
  let outputPath = path.join(dlDir, `${baseName}.mp4`);
  // Avoid clobbering existing files
  let n = 1;
  while (fs.existsSync(outputPath)) {
    outputPath = path.join(dlDir, `${baseName} (${n++}).mp4`);
    if (n > 500) break;
  }

  // Build ffmpeg args
  const args = [];
  const startSec = trim ? normalizeFFmpegTime(trim.in) : null;
  const endSec   = trim ? normalizeFFmpegTime(trim.out) : null;
  if (startSec !== null) args.push('-ss', startSec);
  if (endSec   !== null) args.push('-to', endSec);
  args.push('-i', sourcePath);

  const logoBugPath = logoBug?.on ? socialResolveLogoBugPath(logoBug.path) : null;
  const fontPath = resolveFontPath();

  const graph = buildSocialFilterGraph({
    outW, outH, srcW, srcH,
    videoTransform: videoTransform || { scale: 1, offsetX: 0, offsetY: 0 },
    logoBugPath, logoBug, sourceBug, fontPath,
  });

  // Extra inputs come AFTER the source -i to keep [0:v] as the source.
  for (const extra of graph.extraInputs) args.push('-i', extra);

  args.push('-filter_complex', graph.filter);
  args.push('-map', `[${graph.lastLabel}]`);

  if (noAudio || !hasAudio) {
    args.push('-an');
  } else {
    args.push('-map', '0:a?');
    if (hardLimiter) args.push('-af', 'alimiter=limit=0.251189:level=0');
    args.push('-c:a', 'aac', '-b:a', '192k');
  }

  args.push(
    '-r', String(Math.min(60, Math.round(meta.fps || 30))),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-y', outputPath
  );

  logEntry({ event: 'social-render-start', srcW, srcH, outW, outH, format, hasAudio, noAudio });

  const durationForPct = (() => {
    let d = meta.duration || 0;
    if (startSec !== null && endSec !== null) d = Math.max(0.1, Number(endSec) - Number(startSec));
    else if (startSec !== null) d = Math.max(0.1, d - Number(startSec));
    else if (endSec !== null)   d = Math.min(d, Number(endSec));
    return d || 0;
  })();

  sendSocialProgress('render', { pct: 0, line: 'Starting render…' });

  return new Promise((resolve) => {
    let proc;
    try { proc = spawnFF(args, { windowsHide: true }); }
    catch (err) { return resolve({ ok: false, error: 'ffmpeg spawn failed: ' + err.message }); }
    socialActiveProc = proc;
    setTaskbarProgress(0, 'normal');

    let stderr = '';
    proc.stderr.on('data', d => {
      const chunk = d.toString();
      stderr += chunk;
      // Parse time= from ffmpeg progress lines
      const m = chunk.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (m) {
        const cur = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
        const pct = durationForPct ? Math.max(0, Math.min(99, (cur / durationForPct) * 100)) : 0;
        setTaskbarProgress(pct / 100, 'normal');
        sendSocialProgress('render', { pct, line: `Encoding: ${pct.toFixed(1)}%` });
      }
    });
    proc.on('close', code => {
      socialActiveProc = null;
      setTaskbarProgress(-1);
      if (code !== 0 || !fs.existsSync(outputPath)) {
        const errorTail = stderr.slice(-2000);
        logEntry({
          event: 'social-render-error',
          exitCode: code,
          format, srcW, srcH, outW, outH,
          hasAudio, noAudio, hardLimiter,
          hasSourceBug: !!(sourceBug && sourceBug.on && sourceBug.text),
          hasRavBug: !!(logoBug && logoBug.on),
          filterGraph: graph.filter,
          ffmpegArgs: args.join(' '),
          stderrTail: errorTail,
        });
        return resolve({ ok: false, error: 'Render failed. ' + (errorTail.slice(-500) || `ffmpeg exit ${code}`), stderrTail: errorTail });
      }
      logEntry({ event: 'social-render-done', outputPath, exitCode: 0 });
      sendSocialProgress('render', { pct: 100, line: 'Done!' });
      resolve({ ok: true, outputPath });
    });
    proc.on('error', err => {
      socialActiveProc = null;
      setTaskbarProgress(-1);
      logEntry({ event: 'social-render-error', spawn: 'error', message: err.message });
      resolve({ ok: false, error: err.message });
    });
  });
});
