# Changelog

## v2.4.0 (2026-04-02)

### New Features
- **Lower Third Generator Tab** — New sidebar tab to create broadcast-ready lower third graphics. Type headline and subtext, see a live preview on the GENERIC LOWER template, and export as ProRes 4444 MOV with alpha channel at 1920×1080.
- **TriCaster-Matched Defaults** — Font sizes (70/40) and text positions match TriCaster output out of the box using ITC Avant Garde Gothic LT Bold.
- **Adjustable Position Controls** — Per-line font size sliders plus X/Y offset controls for fine-tuning text placement, with a one-click Reset to Default button.
- **Loop-to-Duration Export** — Set any duration; the 8-second lower third animation loops to fill it, always rounding up to complete loops. Progress bar shown during export.
- **Force Uppercase Toggle** — Auto-capitalizes Line 1 (headline) text, enabled by default.

---

## v2.3.1 (2026-03-19)

### New Features
- **Audio Extractor Tab** — New sidebar tab to extract audio from any video file (MP4, MOV, MKV, AVI, WEBM) as high-quality VBR MP3. Includes optional -12dB hard limiter, trim with start/end timestamps, and custom filename.

---

## v2.3.0 (2026-03-19)

### New Features
- **Video Only (VO) Mode** — Download video without any audio track. New toggle in the Advanced panel strips audio from the format selection.
- **Adjustable Blur Intensity** — Pillarbox blur now has a slider (1–50%) so you can control how much the background is blurred. Defaults to 12%.
- **Report Issue** — In-app bug reporting from Settings or directly from failed downloads. Automatically attaches recent logs and sends to the developer's Cloudflare Worker endpoint.

### Bug Fixes
- **YouTube downloads without auth** — Public (non-age-restricted) YouTube videos no longer fail when not logged in. Falls back to `web,default` player client automatically.
- **Force overwrites** — Downloads no longer fail if a file with the same name already exists; yt-dlp now overwrites automatically.
- **Stale download timeout** — Downloads and re-encodes that produce no output for 5 minutes are automatically killed instead of hanging forever.
- **Update installer messaging** — Post-update status now clearly tells the user to wait and re-open the app, instead of the ambiguous "Installing... app will restart".
- **Welcome screen auth status** — The welcome modal now checks and displays your actual YouTube login status on launch.

---

## v2.2.0 (2026-03-17)

### New Features
- **Advanced Post-Processing Panel** — New expandable panel in the main UI with individual toggles for each feature. Enabling Advanced mode auto-activates instant download.
- **16:9 Blur Pillarbox** — Adds a blurred, scaled background behind non-widescreen content to fill 1280x720 without letterboxing or cropping. Now user-controlled via toggle.
- **Source Bug Overlay** — Broadcast-style "SOURCE: [NAME]" badge in the top-left corner using ITC Avant Garde Gothic LT Bold. Dynamically sized blue box with white accent bar. Supports apostrophes and special characters.
- **Trim (In/Out Points)** — Cut downloaded videos with start and end timestamps using FFmpeg input-side seeking. Accepts HH:MM:SS, SS, or SS.ms formats.
- **-12dB Hard Limiter** — True brick-wall audio limiter (FFmpeg `alimiter`) that hard-caps audio at -12dB, matching Premiere Pro behavior. Works on both MP4 and MP3 downloads.
- **Custom Filename** — Name your downloads anything you want. Extension is added automatically.
- **Changelog / What's New** — Version upgrade popup now includes a "What's New" section showing recent changes.

### Bug Fixes
- **App update restart** — Fixed the self-update flow so the installer launches reliably after the app quits, instead of racing with the running process.
- **Download file detection** — Improved detection of the output file path after download. Falls back to finding the newest MP4 in the download folder when yt-dlp's output path doesn't match the actual file on disk.
- **Font bundling** — Font file is now resolved dynamically at runtime with fallback paths for both dev and packaged builds. Source bug overlay is automatically disabled with a warning if the font is missing.

### Other Changes
- All advanced FFmpeg features combine into a single pass — no intermediate files.
- Fonts directory added to `extraResources` for production builds.
- Advanced panel removed from quality picker modal for cleaner UX.

---

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
