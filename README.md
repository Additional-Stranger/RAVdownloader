# RAVdownloader by Colin
Windows 64x Only Currently

# EXE Install file:
Go To My Website
ColinChristy.cc
(No pre-requisites needed, easy install)

## Complete Setup & Build Guide 

---

## STEP 1 — Install Prerequisites (one-time only)

1. Install **Node.js** from https://nodejs.org (LTS version)
2. Verify: open Command Prompt and run:
   ```
   node --version
   npm --version
   ```

---

## STEP 2 — Set Up Project

1. Create a folder called `RAVdownloader` anywhere on your PC
2. Copy all the files from this package into it — the structure should be:

```
RAVdownloader/
├── package.json
├── README.md
├── assets/
│   └── icon.ico          ← PUT YOUR ICON HERE
├── binaries/
│   ├── yt-dlp.exe        ← DOWNLOAD THIS (see Step 3)
│   └── ffmpeg.exe        ← DOWNLOAD THIS (see Step 3)
└── src/
    ├── main.js
    ├── preload.js
    └── renderer/
        └── index.html
```

---

## STEP 3 — Download Binaries

### yt-dlp.exe
1. Go to: https://github.com/yt-dlp/yt-dlp/releases/latest
2. Download `yt-dlp.exe`
3. Place it in the `binaries/` folder

### ffmpeg.exe
1. Go to: https://www.gyan.dev/ffmpeg/builds/
2. Download `ffmpeg-release-essentials.zip`
3. Extract it, find `ffmpeg.exe` inside the `bin/` subfolder
4. Place it in the `binaries/` folder

### icon.ico
- Place your custom `icon.ico` in the `assets/` folder
- If you don't have one, create a simple one at https://icoconvert.com

---

## STEP 4 — Install Dependencies

Open Command Prompt **in the RAVdownloader folder** (Shift+Right-click → Open PowerShell here):

```
npm install
```

This downloads Electron and electron-builder (~200MB). Wait for it to finish.

---

## STEP 5 — Run the App (Test Mode)

```
npm start
```

The app should open. Test it works correctly before building the installer.

---

## STEP 6 — Build the Windows Installer

```
npm run build
```

This creates a `dist/` folder with:
- `RAVdownloader by Colin Setup 1.0.0.exe` — The installer

The installer is ~100MB and bundles everything including yt-dlp and ffmpeg.

---

## Test Checklist

After installing or running in dev mode, verify:

- [ ] Right-click paste works in URL input
- [ ] MP4 download has audio (test with any YouTube video)
- [ ] MP4 opens in Adobe Premiere without issues
- [ ] MP3 download works and plays in Windows Media Player
- [ ] Quality picker shows valid resolutions
- [ ] Download All button works
- [ ] Pause/Resume works
- [ ] Retry Failed works
- [ ] Update yt-dlp shows correct new version
- [ ] Logs are written and viewable
- [ ] Supported Sites list opens and is searchable
- [ ] AVIF → PNG conversion works
- [ ] HEIC → PNG conversion works
- [ ] MOV → MP4 conversion works
- [ ] Download folder chooser saves preference between restarts
- [ ] Bandwidth limit applies to downloads

---

## Troubleshooting

**"yt-dlp not found" error**
→ Make sure `yt-dlp.exe` is in the `binaries/` folder

**"ffmpeg not found" error**
→ Make sure `ffmpeg.exe` is in the `binaries/` folder

**App won't start**
→ Run `npm install` again, then `npm start`

**Build fails**
→ Make sure `icon.ico` exists in the `assets/` folder

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/main.js` | Electron main process — handles all system calls, yt-dlp, ffmpeg |
| `src/preload.js` | Secure bridge between main and renderer |
| `src/renderer/index.html` | The entire UI — HTML, CSS, and JavaScript |
| `package.json` | Project config and build settings |
| `binaries/yt-dlp.exe` | Video downloader engine |
| `binaries/ffmpeg.exe` | Audio/video conversion engine |
| `assets/icon.ico` | App icon |

