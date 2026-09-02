# Edit Bay Studio

The desktop app behind [editbaytools.com](https://editbaytools.com) — an all-in-one
media toolkit for editors, production engineers and broadcast teams. Eight tools in
one window: Downloader, Social Media, Convert, Extractor, Merge, Podcast, VO Maker
and Lower Third.

Built with Electron. Windows (x64) and macOS (Apple silicon).

## Download

Installers are published at <https://editbaytools.com/download/>. A plan is required
to use the tools; every plan starts with a free trial. See <https://editbaytools.com/pricing/>.

## Building from source

Prerequisites:

- [Node.js](https://nodejs.org) LTS
- Windows: `yt-dlp.exe` and `ffmpeg.exe` (plus `ffprobe.exe`) placed in `bin/`
- macOS: arm64 builds of the same tools placed in `bin-mac/` (the CI workflow fetches them)

```
npm install
npm start              # run unpackaged
npm run build          # Windows NSIS installer  -> dist/
npm run dist:mac       # macOS DMG (run on a Mac, or use the GitHub Actions workflow)
```

The macOS build runs on GitHub Actions (`.github/workflows/build-mac.yml`) on every
push to `main`.

## Layout

| Path | What it is |
|------|------------|
| `src/main.js` | Electron main process: tools, licence gate, updater, bug reports |
| `src/auth-client.js` | Sign-in and licence-token client for `api.editbaytools.com` |
| `src/preload.js` | The bridge the renderer talks through |
| `src/renderer/` | The UI (`index.html`) and sign-in window (`login.html`) |
| `build/` | Packaging hooks and the macOS install helper |
| `installer.nsh` | NSIS additions for the Windows installer |
| `design-system/` | Component reference used when the UI was built |

## Legal

Terms, privacy, refunds and the EULA live at <https://editbaytools.com/legal/terms/>.

© Edit Bay Tools LLC. All rights reserved.
