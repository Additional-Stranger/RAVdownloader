# Changelog

## v4.0.3 (2026-07-29)
- **Fixed:** Social Media render failing on the RAV bug PNG (asset was trapped inside app.asar, unreadable by FFmpeg).
- **Fixed:** Bug report prompts on Social Media failures now use the app's styled modal instead of the native browser popup.
- **Source Bug overlay is now fully editable:** input pre-fills with `SOURCE: ` but you can delete it and type a date or any label instead.
- **Fixed:** update check no longer prompts when the reported version is older than the running version; runtime version is now sourced from `package.json` so it can never drift from the installer.

## v4.0.1 (2026-07-29)
- Change Password in Settings; admin-side password reset (emails a temporary password).
- Signup asks for the password twice.
- Fixed unresponsive sign-in inputs after signup.
- `@ravespanol.com` auto-approved.

## v4.0.0 (2026-07-28)
- **Login required:** sign up with name/email/password; developer approves access from a new admin dashboard at `admin.colinchristy.cc`. `@americasvoice.news`, `@weathernationtv.com`, and `@p1.media` auto-approved.
- Account panel in Settings (name, email, Sign Out).
- App reports its version on login + every 6 hours.
- Passwords hashed (PBKDF2), PII encrypted at rest, sessions via `safeStorage`, failed logins rate-limited + lock after 3 tries.

## v3.4.0 (2026-07-27)
- VO Maker: drag images straight from Google Images / any browser page onto the drop zone.
- VO Maker: AVIF support.
- Fixed Convert → JPG opening the videos-only picker.

## v3.3.8 (2026-07-24)
- Fixed VO Maker rotating portrait phone photos sideways on export.

## v3.3.7 (2026-07-22)
- Added "Add a Tail" toggle (1s freeze-frame at the end for live transitions).
- Added "Clear all" button in the Advanced panel.
- Fixed Advanced trim crashing FFmpeg on loose time formats (`:29`, `29`, etc.).
- Fixed VO frame editor freezing the app on close.

## v3.3.5 (2026-07-21)
- VO Maker: per-image start/end frames with drag/resize editor.
- Native file drag-and-drop in VO Maker and Merge.
- Downloader remembers your options across restarts; new "Clear options on close" toggle.
- Reuse last link / reuse last advanced settings buttons.

## v3.1.0 (2026-06-15)
- Highest Quality toggle (skips the quality picker).
- VO Maker tab: 1280×720 slideshows with Ken Burns zoom and blurred pillarbox.

## v2.4.0 (2026-04-02)
- Lower Third Generator tab: live preview, ProRes 4444 export with alpha at 1920×1080, loop-to-duration, adjustable positions.

## v2.3.1 (2026-03-19)
- Audio Extractor tab: pull MP3 from video with optional -12dB limiter and trim.

## v2.3.0 (2026-03-19)
- Video-Only (VO) mode; adjustable blur intensity; in-app Report Issue.
- Public YouTube videos no longer require login; force-overwrite existing files; stale-download timeout.

## v2.2.0 (2026-03-17)
- Advanced Post-Processing panel: 16:9 blur pillarbox, Source Bug overlay, trim, -12dB limiter, custom filename.
- "What's New" popup on version upgrade.

## v2.1.1 (2026-03-16)
- Auto re-encode VP9/AV1 downloads to H.264 for Premiere compatibility.
- Bundled Deno runtime + broader format fallbacks fix "Requested format is not available" on YouTube.

## v2.1.0 (2026-03-15)
- YouTube Account Login, Quality Picker, App Self-Update, yt-dlp Update Checker, File Converter, Diagnostics, Playlist support, Bandwidth Limiter, Welcome Screen.
