// ─────────────────────────────────────────────────────────────────────────────
// Accounts and licensing, main-process side.
//
// Talks to api.editbaytools.com, keeps the session token in the OS keychain, and
// caches the signed licence so the app keeps working when the network does not.
//
// The licence is an Ed25519-signed token. We hold only the PUBLIC key, so this
// file can check that a licence came from us but can never manufacture one —
// patching the binary to skip the check is possible, forging a licence is not.
// ─────────────────────────────────────────────────────────────────────────────

const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const API_URL = process.env.EBS_API_URL || 'https://api.editbaytools.com';
const PRODUCT = 'edit-bay-studio';

// Public half of the licence signing key. Safe to ship; the private half never
// leaves the Cloudflare Worker.
const LICENSE_PUBLIC_KEY_HEX =
  'b770a068d90ee27cad9ced1dd23bea4dc240dc4537c4c6c3fc31620a5fcc1c1e';

const TOKEN_FILE   = () => path.join(app.getPath('userData'), 'session.dat');
const LICENSE_FILE = () => path.join(app.getPath('userData'), 'license.dat');
const DEVICE_FILE  = () => path.join(app.getPath('userData'), 'device.json');

// ─── HTTP ────────────────────────────────────────────────────────────────────
function req(method, urlStr, { body, token, headers: extra } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const data = body ? JSON.stringify(body) : null;
    const headers = { accept: 'application/json', ...(extra || {}) };
    if (data) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(data);
    }
    if (token) headers['authorization'] = `Bearer ${token}`;

    const r = https.request({
      method, hostname: u.hostname, port: u.port || 443,
      path: u.pathname + u.search, headers,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        let json = {};
        try { json = buf ? JSON.parse(buf) : {}; } catch { json = { error: 'Unexpected response from the server.' }; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    r.on('error', reject);
    r.setTimeout(15000, () => r.destroy(new Error('The server did not respond in time.')));
    if (data) r.write(data);
    r.end();
  });
}

// ─── Encrypted local storage ─────────────────────────────────────────────────
//
// safeStorage puts the key in the OS keychain (DPAPI on Windows, Keychain on
// macOS), so these files are useless if copied to another machine.
function writeSecret(file, value) {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(file, safeStorage.encryptString(value), { mode: 0o600 });
    } else {
      fs.writeFileSync(file, 'PLAIN:' + value, { mode: 0o600 });
    }
  } catch (e) { console.error('[auth] could not save', path.basename(file), e.message); }
}

function readSecret(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file);
    if (raw.slice(0, 6).toString() === 'PLAIN:') return raw.toString().slice(6);
    if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(raw);
    return null;
  } catch { return null; }
}

function removeFile(file) { try { fs.existsSync(file) && fs.unlinkSync(file); } catch {} }

const saveToken  = (t) => writeSecret(TOKEN_FILE(), t);
const loadToken  = () => readSecret(TOKEN_FILE());
const clearToken = () => removeFile(TOKEN_FILE());

// ─── Device identity ─────────────────────────────────────────────────────────
//
// A random per-install id. Deliberately NOT derived from hardware: we want to
// count active sessions, not fingerprint anyone's machine.
function deviceId() {
  try {
    const f = DEVICE_FILE();
    if (fs.existsSync(f)) {
      const v = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (v && v.id) return v.id;
    }
    const id = 'dev_' + crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(f, JSON.stringify({ id, created: new Date().toISOString() }, null, 2));
    return id;
  } catch { return null; }
}

function deviceLabel() {
  try { return require('os').hostname().slice(0, 60); } catch { return null; }
}

// ─── Licence verification ────────────────────────────────────────────────────
//
// Ed25519 public keys are 32 raw bytes; Node wants SPKI DER, which for Ed25519
// is a fixed 12-byte prefix followed by those bytes.
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

let publicKey = null;
function getPublicKey() {
  if (!publicKey) {
    publicKey = crypto.createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, Buffer.from(LICENSE_PUBLIC_KEY_HEX, 'hex')]),
      format: 'der', type: 'spki',
    });
  }
  return publicKey;
}

const b64urlToBuf = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/**
 * Checks a licence token's signature and expiry.
 * Returns the payload, or null if it is forged, corrupt or expired.
 */
function verifyLicense(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const [h, b, s] = parts;

    const good = crypto.verify(null, Buffer.from(`${h}.${b}`), getPublicKey(), b64urlToBuf(s));
    if (!good) { console.warn('[license] signature did not verify'); return null; }

    const payload = JSON.parse(b64urlToBuf(b).toString('utf8'));
    if (payload.exp && new Date(payload.exp).getTime() < Date.now()) return null;
    if (payload.prod && payload.prod !== PRODUCT) return null;
    return payload;
  } catch (e) {
    console.warn('[license] could not read token:', e.message);
    return null;
  }
}

function saveLicense(token) { if (token) writeSecret(LICENSE_FILE(), token); }
function loadLicense() {
  const t = readSecret(LICENSE_FILE());
  if (!t) return null;
  const payload = verifyLicense(t);
  if (!payload) { removeFile(LICENSE_FILE()); return null; }   // expired or tampered with
  return { token: t, payload };
}
const clearLicense = () => removeFile(LICENSE_FILE());

// ─── Accounts ────────────────────────────────────────────────────────────────
function fail(r, fallback) {
  return { ok: false, error: (r.body && r.body.error) || fallback, code: r.body && r.body.code, status: r.status };
}

async function signup({ firstName, lastName, email, phone, password, acceptedTerms }) {
  const r = await req('POST', `${API_URL}/v1/auth/signup`, {
    body: { firstName, lastName, email, phone, password, acceptedTerms, deviceId: deviceId() },
    headers: { 'x-client': 'app' },
  });
  if (r.status === 200 && r.body.token) {
    saveToken(r.body.token);
    return { ok: true, ...r.body };
  }
  return fail(r, 'We could not create that account.');
}

async function login({ email, password, appVersion, platform }) {
  const r = await req('POST', `${API_URL}/v1/auth/login`, {
    body: { email, password, deviceId: deviceId(), deviceLabel: deviceLabel(), appVersion, platform },
    headers: { 'x-client': 'app', 'x-app-version': appVersion || '', 'x-platform': platform || '' },
  });
  if (r.status === 200 && r.body.token) {
    saveToken(r.body.token);
    return { ok: true, ...r.body };
  }
  return fail(r, 'Those details did not work.');
}

/** Who is signed in, according to the server. */
async function verifySession() {
  const token = loadToken();
  if (!token) return { ok: false, noToken: true };
  try {
    const r = await req('GET', `${API_URL}/v1/auth/me`, { token });
    if (r.status === 200 && r.body.user) return { ok: true, ...r.body };
    if (r.status === 401) { clearToken(); clearLicense(); }
    return fail(r, 'We could not confirm your session.');
  } catch (e) {
    // Offline is not signed out.
    return { ok: false, offline: true, error: e.message };
  }
}

async function logout() {
  const token = loadToken();
  if (token) { try { await req('POST', `${API_URL}/v1/auth/logout`, { token }); } catch {} }
  clearToken();
  clearLicense();
  return { ok: true };
}

async function sendEmailCode() {
  const token = loadToken();
  if (!token) return { ok: false, error: 'Sign in first.' };
  const r = await req('POST', `${API_URL}/v1/auth/email/send`, { token, body: {} });
  return r.status === 200 ? { ok: true, ...r.body } : fail(r, 'We could not send the code.');
}

async function verifyEmail({ code }) {
  const token = loadToken();
  if (!token) return { ok: false, error: 'Sign in first.' };
  const r = await req('POST', `${API_URL}/v1/auth/email/verify`, { token, body: { code } });
  return r.status === 200 ? { ok: true, ...r.body } : fail(r, 'That code did not work.');
}

async function forgotPassword({ email }) {
  const r = await req('POST', `${API_URL}/v1/auth/password/forgot`, { body: { email } });
  // Always the same answer, so this cannot be used to discover who has an account.
  return { ok: true, ...(r.body || {}) };
}

async function changePassword({ currentPassword, newPassword }) {
  const token = loadToken();
  if (!token) return { ok: false, error: 'Sign in first.' };
  const r = await req('POST', `${API_URL}/v1/auth/password/change`, {
    token, body: { currentPassword, newPassword },
  });
  return r.status === 200 ? { ok: true } : fail(r, 'We could not change your password.');
}

// ─── Licensing ───────────────────────────────────────────────────────────────
/**
 * Asks the server whether this account may use the tools, and caches the signed
 * answer.
 *
 * Falls back to the cached licence when the network is unavailable — that cache
 * is what makes the app usable on a plane. It cannot outlive the token's own
 * expiry, which the server sets to the offline grace window.
 */
async function checkLicense({ appVersion, platform } = {}) {
  const token = loadToken();
  if (!token) return { ok: false, active: false, reason: 'signed_out' };

  try {
    const r = await req('POST', `${API_URL}/v1/license`, {
      token,
      body: { product: PRODUCT },
      headers: { 'x-app-version': appVersion || '', 'x-platform': platform || '' },
    });

    if (r.status === 401) {
      // Signed out elsewhere, or the seat was taken by another machine.
      clearToken(); clearLicense();
      return { ok: false, active: false, reason: 'signed_out', online: true };
    }
    if (r.status !== 200 || !r.body.license) {
      return { ok: false, active: false, reason: 'server_error', online: true,
               error: (r.body && r.body.error) || `Licence check failed (${r.status})` };
    }

    // Never trust a licence we cannot verify, even from our own server — a
    // hijacked DNS record should not be able to hand out access.
    const payload = verifyLicense(r.body.license);
    if (!payload) return { ok: false, active: false, reason: 'bad_signature', online: true };

    saveLicense(r.body.license);
    return {
      ok: true, online: true, offline: false,
      active: !!payload.active,
      reason: payload.status || payload.reason,
      plan: payload.plan,
      seats: payload.seats,
      trialEnd: payload.trialEnd,
      periodEnd: payload.periodEnd,
      checkAfter: payload.checkAfter,
      expiresAt: payload.exp,
      entitlement: r.body.entitlement,
      activeSessions: r.body.activeSessions,
      purchaseUrl: r.body.purchaseUrl,
    };
  } catch (e) {
    // Offline. Fall back to what we were last told.
    const cached = loadLicense();
    if (cached) {
      const daysLeft = Math.max(0,
        Math.ceil((new Date(cached.payload.exp).getTime() - Date.now()) / 86400_000));
      return {
        ok: true, online: false, offline: true,
        active: !!cached.payload.active,
        reason: cached.payload.status,
        plan: cached.payload.plan,
        seats: cached.payload.seats,
        trialEnd: cached.payload.trialEnd,
        periodEnd: cached.payload.periodEnd,
        expiresAt: cached.payload.exp,
        graceDaysLeft: daysLeft,
      };
    }
    return { ok: false, active: false, offline: true, reason: 'offline_no_cache', error: e.message };
  }
}

/** The cached answer, with no network call. Used to paint the UI instantly at launch. */
function cachedLicense() {
  const cached = loadLicense();
  if (!cached) return null;
  return {
    active: !!cached.payload.active,
    reason: cached.payload.status,
    plan: cached.payload.plan,
    seats: cached.payload.seats,
    trialEnd: cached.payload.trialEnd,
    periodEnd: cached.payload.periodEnd,
    checkAfter: cached.payload.checkAfter,
    expiresAt: cached.payload.exp,
    offline: true,
  };
}

module.exports = {
  API_URL, PRODUCT,
  signup, login, logout, verifySession,
  sendEmailCode, verifyEmail, forgotPassword, changePassword,
  checkLicense, cachedLicense, verifyLicense,
  loadToken, clearToken, clearLicense, deviceId,
};
