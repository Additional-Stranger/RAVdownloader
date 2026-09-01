# RAVdownloader Auth — Deploy Walkthrough

This walks you through everything you need to do to go from "just cloned this" to a fully working auth system with admin dashboard, in order. **Do the steps top to bottom.** Don't skip.

Estimated time: 30–45 minutes if nothing goes weird.

---

## Prerequisites checklist

- [ ] Node.js 20+ installed (`node -v`)
- [ ] `wrangler` CLI installed globally: `npm i -g wrangler` — then `wrangler login` (should already be done since your existing `worker/` is deployed)
- [ ] Resend account created, domain `colinchristy.cc` **verified** (green in Resend dashboard)
- [ ] Resend API key created and saved somewhere safe (you'll paste it in Step 4)
- [ ] Admin password chosen (12+ characters, mix of letters and numbers, unique)
- [ ] DNS is on Cloudflare (confirmed — you did the Resend auto-configure)

Everything below runs from `C:\Users\User\Downloads\RAVdownloader-main\`.

---

## Step 1 — Create the D1 database

```bash
cd auth-worker
wrangler d1 create ravdownloader-auth-db
```

Copy the `database_id` UUID it prints. Open `auth-worker/wrangler.toml` and paste it in place of `REPLACE_WITH_D1_ID`.

## Step 2 — Create the rate-limit KV namespace

```bash
wrangler kv namespace create RATELIMIT
```

Copy the `id` it prints. In `auth-worker/wrangler.toml`, paste it in place of `REPLACE_WITH_KV_ID`.

## Step 3 — Run the initial migration

```bash
wrangler d1 migrations apply ravdownloader-auth-db --remote
```

It should apply `0001_init.sql` and print something like `✔ 1 migration applied`.

## Step 4 — Generate secrets and load them into Wrangler

Generate 3 random 32-byte hex strings. Anything that gives you 64 hex chars works — here are three ways:

**Windows PowerShell:**
```powershell
1..3 | ForEach-Object { -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) }) }
```

**Or Node (any OS):**
```bash
node -e "for (let i=0;i<3;i++) console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Save the 3 outputs — you'll paste them below.

Also generate a 4th secret — the one-time setup token (used only for Step 8):
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

Now load them into Wrangler (each command will prompt for the value — paste and hit Enter):

```bash
wrangler secret put PII_KEY           # paste secret #1
wrangler secret put EMAIL_PEPPER      # paste secret #2
wrangler secret put ADMIN_JWT_SECRET  # paste secret #3
wrangler secret put SETUP_TOKEN       # paste the 4th (short) one
wrangler secret put RESEND_API_KEY    # paste your Resend API key from resend.com
wrangler secret put NOTIFY_EMAIL      # colin@colinchristy.cc
wrangler secret put ADMIN_EMAIL       # colin@colinchristy.cc
```

> ⚠️ **Save PII_KEY and EMAIL_PEPPER in a password manager NOW.** If you lose them, every user's name and email in the DB becomes unreadable, and no one will be able to log in (because their email hash won't match). These are the two most important secrets in the whole system.

## Step 5 — Deploy the worker

```bash
wrangler deploy
```

It'll print a URL like `https://ravdownloader-auth.<your-subdomain>.workers.dev`. **Test it:**

```bash
curl https://ravdownloader-auth.<your-subdomain>.workers.dev/health
# → {"ok":true,"service":"ravdownloader-auth"}
```

If that works, you're 60% done.

## Step 6 — Point `auth.colinchristy.cc` at the worker

In Cloudflare Dashboard → **Workers & Pages** → `ravdownloader-auth` → **Settings** → **Triggers** → **Custom Domains** → **Add Custom Domain** → enter `auth.colinchristy.cc` → Add.

Cloudflare automatically creates the DNS record. Wait ~30 sec, then test:

```bash
curl https://auth.colinchristy.cc/health
```

Same response as before? Great.

## Step 7 — Deploy the admin dashboard to Cloudflare Pages

From the repo root:

```bash
cd ../admin-site
wrangler pages deploy . --project-name=ravdownloader-admin
```

First time, it'll ask if you want to create the project — say yes. It'll print a URL like `https://ravdownloader-admin.pages.dev`. **Test it in your browser** — you should see the sign-in page.

Then in Cloudflare Dashboard → **Workers & Pages** → `ravdownloader-admin` → **Custom domains** → **Set up a custom domain** → `admin.colinchristy.cc` → save.

Wait 30 sec, then hit `https://admin.colinchristy.cc` in your browser. You should see the sign-in page.

## Step 8 — Seed the admin account (one-time)

Now create your admin user by hitting the `/admin/setup` endpoint with the `SETUP_TOKEN` you set in Step 4.

**Windows PowerShell** (replace `YOUR_SETUP_TOKEN` and `YourStrongPassword123!`):

```powershell
$body = @{
  email = "colin@colinchristy.cc"
  firstName = "Colin"
  lastName = "Christy"
  password = "YourStrongPassword123!"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://auth.colinchristy.cc/admin/setup" `
  -Method POST -ContentType "application/json" `
  -Headers @{ "X-Setup-Token" = "YOUR_SETUP_TOKEN" } `
  -Body $body
```

**Or via curl on any OS:**
```bash
curl -X POST https://auth.colinchristy.cc/admin/setup \
  -H "Content-Type: application/json" \
  -H "X-Setup-Token: YOUR_SETUP_TOKEN" \
  -d '{"email":"colin@colinchristy.cc","firstName":"Colin","lastName":"Christy","password":"YourStrongPassword123!"}'
```

You should see `{"ok":true,"id":"...","message":"Admin created..."}`.

**Immediately delete the setup token so no one else can create an admin:**
```bash
cd ../auth-worker
wrangler secret delete SETUP_TOKEN
```

## Step 9 — Test the admin dashboard

1. Go to `https://admin.colinchristy.cc`
2. Sign in with `colin@colinchristy.cc` + the password from Step 8
3. You should land on an empty dashboard
4. Check your inbox — you should have gotten an **"Admin dashboard login"** email

If that all worked, the backend is live and functional. 🎉

## Step 10 — Test signup flow end-to-end (in browser first)

Open a browser DevTools console on `https://admin.colinchristy.cc` and paste:

```js
fetch('https://auth.colinchristy.cc/signup', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    firstName: 'Test',
    lastName: 'User',
    email: 'you+test@somedomain.com',   // use a real inbox you control
    password: 'testpass123',
  }),
}).then(r => r.json()).then(console.log);
```

You should get `{ok:true, status:'pending', message:'A request has been sent...'}`.

Check your inbox — you should get:
- The **admin new-signup** email to `colin@colinchristy.cc`
- The **pending** email to the address you signed up with

Refresh the admin dashboard — the new user should appear in the **Pending** tab. Click **Approve** — you should get an approval email at the test address.

## Step 11 — Wire up the Electron app

The Electron code is already modified. Just run and test:

```bash
cd ..
npm start
```

The **login window** should open. Try:
1. Sign up with a fresh email → should show pending screen and pop up "request sent" alert
2. In admin dashboard, approve that user
3. Back in the Electron app, click **"Check again"** → main app should open

Once you've confirmed it works, build a release:

```bash
npm run build        # Windows installer
# or
npm run dist:mac     # Mac dmg
```

## Step 12 — Bump the app version and ship

Because you told users the "next release requires sign up", bump the version and release:

```json
// package.json
"version": "4.0.0"
```

Also update `src/main.js` line ~9:
```js
const APP_VERSION = '4.0.0';
```

Rebuild, upload to your R2 bucket, update the existing `worker/worker.js` update-check to point at the new version + download URL.

---

## Ongoing operations

### Rotating a secret

If you ever need to rotate `RESEND_API_KEY`, `ADMIN_JWT_SECRET`, `NOTIFY_EMAIL`:
```bash
cd auth-worker
wrangler secret put <NAME>
```

**Never rotate `PII_KEY` or `EMAIL_PEPPER`** unless you have a migration plan — doing so will make all existing users un-decryptable / un-loginable.

### Backing up D1

```bash
cd auth-worker
wrangler d1 export ravdownloader-auth-db --remote --output=backup-$(date +%Y%m%d).sql
```

Do this weekly. Store the backups somewhere off Cloudflare (e.g., your local machine or another cloud).

### Adding another admin

Right now there's no self-service admin promotion — safest to do it manually via the D1 shell:

```bash
wrangler d1 execute ravdownloader-auth-db --remote --command="UPDATE users SET is_admin = 1 WHERE email_hash = 'HASH_OF_TARGET_EMAIL'"
```

To get the target's email hash, you'll need to hash it with your `EMAIL_PEPPER` — easier: just have the user sign up normally, then promote them via the SQL above (pulling their user ID from the dashboard's Approved list).

### Deleting a user permanently

Delete button on the user row in the dashboard (or via the `/admin/delete` API).

### If you're compromised

If you suspect the worker or your Cloudflare account is compromised:
1. Immediately rotate `RESEND_API_KEY` in Resend and Wrangler
2. `wrangler d1 execute ravdownloader-auth-db --remote --command="UPDATE sessions SET revoked_at = datetime('now') WHERE revoked_at IS NULL"` — kills every live session
3. Force every user to reset their password (add a `require_password_reset` column and enforce on next login — you'll need to code this up)
4. Notify affected users per your Privacy Policy and applicable breach-notification laws

---

## What lives where — quick reference

| Thing | Location |
|---|---|
| Auth API worker code | `auth-worker/src/` |
| D1 schema | `auth-worker/migrations/0001_init.sql` |
| Wrangler config | `auth-worker/wrangler.toml` |
| Admin dashboard | `admin-site/` (dashboard.html, index.html, js/, css/) |
| Legal HTML | `admin-site/privacy.html`, `admin-site/terms.html` |
| Legal source | `PRIVACY.md`, `TERMS.md` |
| Electron auth screen | `src/renderer/login.html` |
| Electron auth main-process client | `src/auth-client.js` |
| Auth gate + IPC | `src/main.js` (bootstrap function around line 605) |
| Auth preload API | `src/preload.js` (window.authApi) |

## Environment overrides (for testing)

The Electron client hits `https://auth.colinchristy.cc` by default. To point at a different worker during dev, launch with:

```bash
RAV_AUTH_URL=http://127.0.0.1:8787 npm start
```

And run the worker locally with `wrangler dev` from `auth-worker/`.
