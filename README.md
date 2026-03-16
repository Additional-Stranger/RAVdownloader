# RAVdownloader

A premium video and audio downloader for Windows, built with Electron. Download from YouTube and 1000+ sites with quality selection, playlist support, and file conversion.

## Download

**[Get the latest installer at ColinChristy.cc](https://ColinChristy.cc)** — no prerequisites needed, just install and go.

## Features

- **Video & Audio Downloads** — MP4 video or MP3 audio from YouTube and 1000+ supported sites
- **Quality Picker** — Choose your resolution (144p–1080p+) or let it auto-select the best
- **Playlist Support** — Download full playlists or a specific range
- **YouTube Account Login** — Sign in to access age-restricted, private, and member-only content
- **File Converter** — Convert between formats (MOV to MP4, AVIF/HEIC to PNG, PDF to PNG, etc.)
- **Bandwidth Limiter** — Throttle download speed when needed
- **Built-in Updater** — Update both the app and yt-dlp directly from Settings
- **Diagnostics & Logs** — Built-in logging and system info for troubleshooting

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org) (LTS)
- The following binaries placed in the `bin/` folder:

| Binary | Source |
|--------|--------|
| `yt-dlp.exe` | [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases/latest) |
| `ffmpeg.exe` | [gyan.dev ffmpeg builds](https://www.gyan.dev/ffmpeg/builds/) (extract from `bin/` inside the zip) |
| `ffprobe.exe` | Included in the ffmpeg zip above |
| `deno.exe` | [Deno releases](https://github.com/denoland/deno/releases/latest) (x86_64 Windows) — required by yt-dlp for YouTube |
| `icon.ico` | Place in `assets/` — create one at [icoconvert.com](https://icoconvert.com) if needed |

### Install, Run, Build

```bash
npm install          # install dependencies
npm start            # run in dev mode
npm run build        # build the Windows installer → dist/
```

The installer will be in `dist/RAVdownloader Setup X.X.X.exe`.

## Project Structure

```
RAVdownloader/
├── src/
│   ├── main.js              # Electron main process
│   ├── preload.js           # Secure IPC bridge
│   └── renderer/
│       └── index.html       # UI (HTML, CSS, JS)
├── bin/                     # Runtime binaries (not in git)
│   ├── yt-dlp.exe
│   ├── ffmpeg.exe
│   ├── ffprobe.exe
│   └── deno.exe
├── assets/
│   └── icon.ico
├── build/
│   └── afterPack.js         # Post-build icon embedding
├── installer.nsh            # NSIS installer customization
└── package.json
```

## Troubleshooting

| Error | Fix |
|-------|-----|
| "yt-dlp not found" | Place `yt-dlp.exe` in the `bin/` folder |
| "ffmpeg not found" | Place `ffmpeg.exe` in the `bin/` folder |
| "Requested format is not available" | Place `deno.exe` in `bin/` — yt-dlp needs it for YouTube |
| App won't start | Run `npm install` again, then `npm start` |
| Build fails | Make sure `icon.ico` exists in `assets/` |
