# Changelog

## v2.1.1 (2026-03-16)

### Bug Fixes
- **Auto re-encode for Premiere compatibility** — Downloads from Instagram, Twitter/X, and other sites that serve VP9 or AV1 video are now automatically re-encoded to H.264 after download. Video and audio both work correctly in Adobe Premiere.
- **Improved format fallback chains** — Download format selectors now include broader catch-all fallbacks so downloads never fail due to missing codec-specific formats.
- **Bundled Deno JS runtime** — Fixes "Requested format is not available" errors on YouTube caused by recent yt-dlp versions requiring a JavaScript runtime for full format extraction.
- **yt-dlp spawns with BIN_DIR on PATH** — Ensures yt-dlp can find bundled deno.exe regardless of system PATH.
- **Removed `youtube:skip=dash`** from format listing — Format picker now shows all available resolutions accurately.
- **Fixed renderer fallback format** — When format fetching fails, the automatic fallback now uses the same robust format chain as normal downloads.

---

## v2.1.0 (2026-03-15)

### New Features
- **YouTube Account Login** — Sign in with your Google account for access to age-restricted, private, and member-only content. Cookies are stored locally in Netscape format and passed to yt-dlp automatically.
- **Quality Picker** — Choose video resolution before downloading (144p through 1080p+, or Best Auto). Fetches available formats from yt-dlp and displays them in a modal.
- **App Self-Update** — Check for and install RAVdownloader updates directly from the Settings page.
- **yt-dlp Update Checker** — See your current yt-dlp version, check for new nightly builds, and update with a progress bar — all from Settings.
- **File Converter** — Convert between video/audio formats (MP4, MP3, etc.) and PDF-to-PNG using ffmpeg and pdfjs-dist.
- **Diagnostics Panel** — View binary paths, versions, and system info for troubleshooting.
- **Playlist Support** — Download playlist ranges with start/end index options for video downloads.
- **Bandwidth Limiter** — Optionally throttle download speed (KB/s).
- **Welcome Screen** — First-launch welcome modal with version info (reset on reinstall via installer marker).
- **Right-Click Context Menu** — Native cut/copy/paste/select-all on editable fields.

### Bug Fixes
- **Bundled Deno JS runtime** — Fixes "Requested format is not available" errors on YouTube caused by recent yt-dlp versions requiring a JavaScript runtime for full format extraction.
- **Improved format fallback chains** — Download format selectors now include `best*` catch-all fallbacks so downloads never fail due to missing codec-specific formats.
- **Removed `youtube:skip=dash`** from format listing — Format picker now shows all available resolutions accurately, including DASH streams.
- **Fixed renderer fallback format** — When format fetching fails, the automatic fallback now uses the same robust format chain as normal downloads.
- **yt-dlp spawns with BIN_DIR on PATH** — Ensures yt-dlp can find bundled deno.exe (and other tools) regardless of system PATH.

### Other Changes
- Custom NSIS installer with setup graphics and welcome marker support.
- `afterPack.js` build script for embedding the app icon via rcedit.
- Added `pdfjs-dist` dependency for PDF-to-PNG conversion.
- Removed unused `ffplay.exe` and placeholder files from bin/.
