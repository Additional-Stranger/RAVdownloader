// ─── RAVdownloader Cloudflare Worker ────────────────────────────────────────
// Handles:
//   GET  /                → App update check (returns latest version + download URL)
//   POST /report          → Issue reports from end users (stored in KV)
//   GET  /reports?key=... → View all reports (secret key required)
//
// ── UPDATE CONFIG ──────────────────────────────────────────────────────────
// Edit these values when you release a new version:
const LATEST_VERSION = '2.2.0';
const DOWNLOAD_URL   = 'https://dl.colinchristy.cc/RAVdownloader%20Setup%202.2.0.exe';
// ───────────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── CORS preflight ──
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // ── GET / — App update check (your existing endpoint) ──
    if (url.pathname === '/' && request.method === 'GET') {
      return jsonResponse({
        version: LATEST_VERSION,
        downloadUrl: DOWNLOAD_URL,
      });
    }

    // ── POST /report — Receive issue report from app ──
    if (url.pathname === '/report' && request.method === 'POST') {
      return handleReport(request, env);
    }

    // ── GET /reports — View stored reports (protected by secret key) ──
    if (url.pathname === '/reports' && request.method === 'GET') {
      return viewReports(url, env);
    }

    // ── DELETE /reports — Delete a single report ──
    if (url.pathname === '/reports' && request.method === 'DELETE') {
      return deleteReport(url, env);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },
};

// ─── Report handler (stores in KV) ──────────────────────────────────────────
async function handleReport(request, env) {
  if (!env.REPORTS) {
    console.error('REPORTS KV namespace not bound');
    return jsonResponse({ success: false, error: 'Reports storage not configured' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const { appVersion, failedUrl, description, logs, timestamp } = body;

  if (!description && !failedUrl) {
    return jsonResponse({ error: 'Please provide a URL or description' }, 400);
  }

  const report = {
    appVersion: appVersion || 'unknown',
    failedUrl: failedUrl || '',
    description: description || '',
    logs: logs || '',
    timestamp: timestamp || new Date().toISOString(),
    receivedAt: new Date().toISOString(),
  };

  // Store in KV — key is timestamp-based so reports sort chronologically
  const key = `report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await env.REPORTS.put(key, JSON.stringify(report), {
    expirationTtl: 60 * 60 * 24 * 90,  // auto-delete after 90 days
  });

  return jsonResponse({ success: true });
}

// ─── View reports (secret key protects access) ──────────────────────────────
async function viewReports(url, env) {
  if (!env.REPORTS) {
    return jsonResponse({ error: 'Reports storage not configured' }, 500);
  }

  // Require secret key — set via: wrangler secret put REPORTS_KEY
  const key = url.searchParams.get('key');
  if (!key || key !== (env.REPORTS_KEY || '')) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  // List all report keys
  const list = await env.REPORTS.list({ prefix: 'report_' });
  const reports = [];

  for (const item of list.keys) {
    const data = await env.REPORTS.get(item.name);
    if (data) {
      try {
        const parsed = JSON.parse(data);
        reports.push({ id: item.name, ...parsed });
      } catch {
        reports.push({ id: item.name, raw: data });
      }
    }
  }

  // Sort newest first
  reports.sort((a, b) => (b.receivedAt || '').localeCompare(a.receivedAt || ''));

  // Return a simple HTML dashboard if ?format=html, otherwise JSON
  if (url.searchParams.get('format') === 'html') {
    return new Response(renderReportsHTML(reports, key), {
      headers: { 'Content-Type': 'text/html', ...corsHeaders() },
    });
  }

  return jsonResponse({ count: reports.length, reports });
}

// ─── Delete a single report ─────────────────────────────────────────────────
async function deleteReport(url, env) {
  if (!env.REPORTS) {
    return jsonResponse({ error: 'Reports storage not configured' }, 500);
  }

  const key = url.searchParams.get('key');
  if (!key || key !== (env.REPORTS_KEY || '')) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const id = url.searchParams.get('id');
  if (!id) return jsonResponse({ error: 'Missing id param' }, 400);

  await env.REPORTS.delete(id);
  return jsonResponse({ success: true });
}

// ─── HTML dashboard for viewing reports in a browser ────────────────────────
function renderReportsHTML(reports, secretKey) {
  const rows = reports.map(r => `
    <div style="background:#1c1c22;border:1px solid #333;border-radius:10px;padding:18px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="color:#e8ff47;font-size:12px;font-family:monospace">${esc(r.receivedAt || r.timestamp || '')}</span>
        <span style="color:#666;font-size:11px">v${esc(r.appVersion || '?')}</span>
      </div>
      ${r.failedUrl ? `<div style="margin-bottom:8px"><strong style="color:#ff4a4a">URL:</strong> <code style="color:#4ab3ff;word-break:break-all">${esc(r.failedUrl)}</code></div>` : ''}
      ${r.description ? `<div style="margin-bottom:8px"><strong style="color:#ccc">Description:</strong><br><span style="color:#aaa;white-space:pre-wrap">${esc(r.description)}</span></div>` : ''}
      ${r.logs ? `<details style="margin-top:8px"><summary style="color:#666;cursor:pointer;font-size:12px">Logs (click to expand)</summary><pre style="color:#777;font-size:11px;max-height:300px;overflow:auto;background:#111;padding:10px;border-radius:6px;margin-top:6px">${esc(r.logs)}</pre></details>` : ''}
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>RAVdownloader Reports</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{background:#0c0c0e;color:#f0f0f0;font-family:-apple-system,sans-serif;max-width:700px;margin:0 auto;padding:24px}
code{background:#111;padding:2px 6px;border-radius:4px}pre{margin:0}</style></head>
<body>
<h1 style="color:#e8ff47;font-size:22px;margin-bottom:4px">RAVdownloader Reports</h1>
<p style="color:#666;font-size:13px;margin-bottom:24px">${reports.length} report${reports.length !== 1 ? 's' : ''}</p>
${reports.length === 0 ? '<p style="color:#555;text-align:center;padding:40px">No reports yet</p>' : rows}
</body></html>`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-cache',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
