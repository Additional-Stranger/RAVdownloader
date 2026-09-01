# UI kit — EditBay Studio (desktop app)

EditBay Studio is the company's product: an all-in-one media toolkit for editors, production
engineers and media professionals, on **macOS and Windows desktop**, **dark theme only**
(the `.ebt-dark` scope).

**Still inferred, not recreated.** No screenshots, builds or source were supplied. Screens are built
from the product description the client gave — download from the web, convert any format, create
social-ready content, add source attribution and graphics, merge video and audio, calculate
timecodes, Premiere Pro integration. Layout, wording and controls are this system's best reading of
those features, not a copy of the shipping app.

## Screens
| File | Screen |
| --- | --- |
| `app-shell.jsx` | 38px desktop title bar, 216px tool rail, activity bar; exports `PageHead`, `Panel`, `Th`, `Td`, `Thumb` |
| `download-screen.jsx` | URL fetch: format/quality pickers, options, download queue with progress |
| `convert-screen.jsx` | Batch convert: file table, drop zone, output settings sidebar |
| `social-screen.jsx` | Social clips: aspect-ratio switcher, live preview with safe areas, caption + attribution |
| `merge-screen.jsx` | Merge A/V: video and audio slots, sync method, waveform-match confidence |
| `timecode-screen.jsx` | Working timecode calculator — add, subtract, duration between, at any fps |
| `misc-screens.jsx` | Attribution templates, Recent files library, Premiere Pro integration |
| `data.js` | Fake fixtures on `window.EBTData` |

## Interactions
Rail switches tools · aspect-ratio tabs resize the social preview live · the timecode calculator
actually computes · convert filters the file table · primary actions fire success Toasts · the
activity bar reports the running job across every screen.

## Component coverage
Icon, Button, IconButton, Card, Badge, Tag, StatusDot, ProgressBar, Timecode, Input, Select,
Checkbox, Radio, Switch, Tabs, Dialog, Toast, Tooltip.
