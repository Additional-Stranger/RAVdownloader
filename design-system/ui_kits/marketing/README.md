# UI kit — editbaytools.com (marketing)

The site the client described: one product (EditBay Studio), an account system with sign-up, log-in
and a free trial, plus download, pricing, about and contact. Light theme (the app is dark-only; the
site is not).

**Inferred, not recreated.** `editbaytools.com` is not reachable from this environment, so copy and
structure are written from the client's product description using this system's content
fundamentals. Prices, version numbers, dates and email addresses are placeholders.

## Screens
| File | Screen |
| --- | --- |
| `site-chrome.jsx` | Sticky header with Log in / Start free trial, dark footer, `Section` helper |
| `home-page.jsx` | Dark hero with an app preview, the seven tools, value row, closing CTA |
| `download-page.jsx` | macOS / Windows build picker, release channel, changelog, system requirements |
| `pricing-page.jsx` | Trial / Studio / Studio Team plans with a feature matrix and trial terms |
| `about-page.jsx` | Positioning, how the company works, the four audiences |
| `contact-page.jsx` | Support form with submitted state, direct addresses, response times |
| `auth-page.jsx` | `LoginPage`, `SignupPage`, `TrialPage` (2-step) on a shared split `AuthShell` |

`index.html` is the whole site click-through; `auth.html` shows the three account screens on their own.

## Interactions
Header, footer and in-page links all route · download page switches OS builds · pricing CTAs route to
trial, sign-up and contact · the contact form submits to a confirmed state · the trial flow advances
from account details to an active-trial + install step.
