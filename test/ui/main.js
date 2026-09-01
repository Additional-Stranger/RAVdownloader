// ─────────────────────────────────────────────────────────────────────────────
// Interface smoke test.
//
//   npm run test:ui
//
// This exists because of a real bug that shipped: the licence lock was hidden
// with the `hidden` attribute, but its own CSS class set `display:flex`, which
// outranks the browser's built-in `[hidden] { display:none }`. The panel could
// therefore never hide, and sat over the app permanently — while every one of
// the 73 API tests passed, because the API was perfectly correct.
//
// The lesson: testing what the server says is not testing what the user sees.
// These tests load the real renderer with the real preload and read the
// COMPUTED STYLE, which is the only thing that can catch that class of bug.
// ─────────────────────────────────────────────────────────────────────────────

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const RENDERER = path.join(ROOT, 'src', 'renderer');
const PRELOAD = path.join(ROOT, 'src', 'preload.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};

// What the stubbed main process will answer with. Each scenario swaps this.
let licenseState = null;
let signupCalls = 0;
let lastSignup = null;

ipcMain.handle('license-get', async () => licenseState);
ipcMain.handle('license-refresh', async () => licenseState);
ipcMain.handle('license-open-purchase', async () => ({ ok: true }));
ipcMain.handle('license-open-account', async () => ({ ok: true }));
ipcMain.handle('auth-get-user', async () => ({ email: 'tester@example.com' }));
ipcMain.handle('auth-signout-from-app', async () => ({ ok: true }));

ipcMain.handle('auth-initial-state', async () => null);
ipcMain.handle('auth-signup', async (_e, opts) => {
  signupCalls++; lastSignup = opts;
  return { ok: true, token: 't', nextStep: 'verify_phone', phoneMasked: '•••1234' };
});
ipcMain.handle('auth-login', async () => ({ ok: false, error: 'stub' }));
ipcMain.handle('auth-recheck', async () => ({ ok: false }));
ipcMain.handle('auth-send-phone-code', async () => ({ ok: true }));
ipcMain.handle('auth-verify-phone', async () => ({ ok: true }));
ipcMain.handle('auth-forgot-password', async () => ({ ok: true }));
ipcMain.handle('auth-change-password', async () => ({ ok: true }));
ipcMain.handle('auth-logout', async () => ({ ok: true }));

// The main window calls a great many other things on load. None of them matter
// here, and a missing handler only produces a rejected promise in the renderer,
// so they are left unstubbed on purpose rather than mirrored and left to rot.

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function makeWindow(file) {
  const win = new BrowserWindow({
    show: false, width: 1280, height: 860,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
  });
  // The renderer's own noise is not what is under test.
  win.webContents.on('console-message', () => {});
  return win.loadFile(path.join(RENDERER, file)).then(() => win);
}

/** Pushes a licence state the way the real main process does, then settles. */
async function setState(win, state) {
  licenseState = state;
  win.webContents.send('license-state', state);
  await wait(120);
}

const probe = (win, js) => win.webContents.executeJavaScript(js);

const VISIBILITY = `(() => {
  const g = (id) => {
    const el = document.getElementById(id);
    if (!el) return { missing: true };
    const cs = getComputedStyle(el);
    return { display: cs.display, visible: cs.display !== 'none' && cs.visibility !== 'hidden' };
  };
  return {
    lock: g('licenseLock'),
    banner: g('licenseBanner'),
    title: (document.getElementById('licTitle') || {}).textContent || '',
    body: (document.getElementById('licBody') || {}).textContent || '',
    bannerText: (document.getElementById('licBannerText') || {}).textContent || '',
  };
})()`;

async function testMainWindow() {
  console.log('\nMain window — the licence lock');
  const win = await makeWindow('index.html');
  await wait(600);

  // ── the exact bug ────────────────────────────────────────────────────────
  await setState(win, { active: true, ok: true, online: true, reason: 'active', plan: 'studio-monthly' });
  let v = await probe(win, VISIBILITY);
  ok('the lock element exists', !v.lock.missing);
  ok('AN ENTITLED USER SEES NO LOCK', !v.lock.visible, `display: ${v.lock.display}`);
  ok('and no banner', !v.banner.visible, `display: ${v.banner.display}`);

  // ── locked states say the right thing ────────────────────────────────────
  await setState(win, { active: false, ok: true, online: true, reason: 'no_subscription' });
  v = await probe(win, VISIBILITY);
  ok('an unentitled user does see the lock', v.lock.visible, `display: ${v.lock.display}`);
  ok('and it invites them to start a trial', /start your free trial/i.test(v.title), `title: "${v.title}"`);

  await setState(win, { active: false, ok: true, online: true, reason: 'period_ended' });
  v = await probe(win, VISIBILITY);
  ok('an ended plan is named as such', /ended/i.test(v.title), `title: "${v.title}"`);

  await setState(win, { active: false, ok: false, offline: true, reason: 'offline_no_cache' });
  v = await probe(win, VISIBILITY);
  ok('being unable to reach us is not reported as a billing problem',
     /cannot reach|could not/i.test(v.title) && !/plan has ended/i.test(v.title), `title: "${v.title}"`);

  // A reason nobody anticipated must still produce a usable panel rather than
  // an empty one — this is what the user actually saw when the CSS bug hit.
  await setState(win, { active: false, ok: false, reason: 'something_new_and_unmapped' });
  v = await probe(win, VISIBILITY);
  ok('an unrecognised reason still shows a sensible message',
     v.lock.visible && v.title.length > 0 && v.body.length > 0);

  // ── the lock must be able to come back down ──────────────────────────────
  await setState(win, { active: true, ok: true, online: true, reason: 'active' });
  v = await probe(win, VISIBILITY);
  ok('paying again clears the lock', !v.lock.visible, `display: ${v.lock.display}`);

  // ── the warning strip ────────────────────────────────────────────────────
  const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();

  await setState(win, { active: true, ok: true, online: true, reason: 'trialing', trialEnd: inDays(2) });
  v = await probe(win, VISIBILITY);
  ok('a trial ending soon warns', v.banner.visible, `display: ${v.banner.display}`);
  ok('and counts the days correctly', /2 days/.test(v.bannerText), `"${v.bannerText}"`);
  ok('without locking anything', !v.lock.visible);

  await setState(win, { active: true, ok: true, online: true, reason: 'trialing', trialEnd: inDays(12) });
  v = await probe(win, VISIBILITY);
  ok('a trial with plenty of time left says nothing', !v.banner.visible, `"${v.bannerText}"`);

  await setState(win, { active: true, ok: true, online: false, offline: true, graceDaysLeft: 3 });
  v = await probe(win, VISIBILITY);
  ok('working offline is explained', v.banner.visible && /offline/i.test(v.bannerText), `"${v.bannerText}"`);
  ok('and the tools stay unlocked offline', !v.lock.visible);

  await setState(win, { active: true, ok: true, online: true, reason: 'past_due' });
  v = await probe(win, VISIBILITY);
  ok('a failed payment warns before it locks', v.banner.visible && !v.lock.visible, `"${v.bannerText}"`);

  // ── nothing known yet ────────────────────────────────────────────────────
  // At launch the answer has not arrived. Drawing a lock on a guess is how the
  // stale-cache flash happened.
  const fresh = await makeWindow('index.html');
  licenseState = null;
  await wait(600);
  v = await probe(fresh, VISIBILITY);
  ok('before any answer arrives, nothing is locked', !v.lock.visible, `display: ${v.lock.display}`);
  fresh.destroy();

  win.destroy();
}

async function testSignInWindow() {
  console.log('\nSign-in window — creating an account');
  const win = await makeWindow('login.html');
  await wait(400);

  const fields = await probe(win, `(() => ({
    pw:    !!document.getElementById('suPw'),
    pw2:   !!document.getElementById('suPw2'),
    type:  (document.getElementById('suPw2') || {}).type,
    terms: !!document.getElementById('suTerms'),
  }))()`);
  ok('there is a password field', fields.pw);
  ok('AND A CONFIRM PASSWORD FIELD', fields.pw2);
  ok('which is masked', fields.type === 'password');

  // Type two different passwords and submit.
  signupCalls = 0;
  const mismatch = await probe(win, `(async () => {
    document.getElementById('toSignUp').click();
    const set = (id, v) => {
      const el = document.getElementById(id);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('suFirst', 'Test'); set('suEmail', 'x@example.com'); set('suPhone', '+15550000000');
    set('suPw', 'correct-horse-battery'); set('suPw2', 'correct-horse-battrey');
    document.getElementById('suTerms').checked = true;
    const hint = document.getElementById('suMatch').textContent;
    document.getElementById('formSignUp').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise(r => setTimeout(r, 150));
    return { hint, msg: document.getElementById('msgSlot').textContent.trim() };
  })()`);
  ok('a mismatch is flagged while typing', /do not match/i.test(mismatch.hint), `"${mismatch.hint}"`);
  ok('submitting with a mismatch is refused', /do not match/i.test(mismatch.msg), `"${mismatch.msg}"`);
  ok('AND NO ACCOUNT IS CREATED', signupCalls === 0, `signup called ${signupCalls}×`);

  // Now make them agree.
  const matched = await probe(win, `(async () => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('suPw2', 'correct-horse-battery');
    const hint = document.getElementById('suMatch').textContent;
    document.getElementById('formSignUp').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise(r => setTimeout(r, 250));
    return { hint };
  })()`);
  ok('matching passwords are confirmed while typing', /match/i.test(matched.hint), `"${matched.hint}"`);
  ok('and the account is then created', signupCalls === 1, `signup called ${signupCalls}×`);
  ok('the confirmation is not sent to the server', lastSignup && !('confirmPassword' in lastSignup));

  // Too short is still caught.
  signupCalls = 0;
  const short = await probe(win, `(async () => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('suPw', 'short'); set('suPw2', 'short');
    document.getElementById('formSignUp').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise(r => setTimeout(r, 150));
    return document.getElementById('msgSlot').textContent.trim();
  })()`);
  ok('a short password is refused', /10 characters/i.test(short), `"${short}"`);
  ok('and no account is created', signupCalls === 0);

  win.destroy();
}

app.disableHardwareAcceleration();

// Without this, destroying the last window between scenarios makes Electron
// start quitting, and the next loadFile dies with ERR_FAILED.
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  console.log('\nInterface smoke test — what the user actually sees');
  try {
    await testMainWindow();
    await testSignInWindow();
  } catch (err) {
    fail++;
    console.log('\n  FAIL harness threw —', err && (err.stack || err.message));
  }
  console.log(`\n${pass} passed, ${fail} failed\n`);
  app.exit(fail ? 1 : 0);
});
