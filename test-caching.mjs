#!/usr/bin/env node
/**
 * Probe whether api.genai.mil honors prompt caching, and in what style.
 *
 * Each test sends a large stable prefix (~3k tokens) with a tiny varying
 * user question. We capture every usage field we can find and flag any
 * indicator that caching is in effect (cached_tokens, cache_read_input_tokens,
 * cache_creation_input_tokens, cached_content_token_count, etc.).
 *
 * Usage:
 *   1. Edit API_KEY / BASE_URL / MODEL.
 *   2. node test-caching.mjs
 *   3. Screenshot the dense block at the top of the report.
 *
 * Zero npm deps. Node 20+. Each request capped by REQUEST_TIMEOUT_MS.
 */

// ====== CONFIG (edit these) ======
const API_KEY     = '';                            // bearer token
const BASE_URL    = 'https://api.genai.mil/v1';    // OpenAI-compat root
const MODEL       = 'gemini-3.1-pro-preview';
const TIMEOUT_MS  = Number(process.env.REQUEST_TIMEOUT_MS ?? 90000);
// ==================================

import { writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const base = BASE_URL.replace(/\/+$/, '');
const authHeaders = API_KEY ? { authorization: `Bearer ${API_KEY}` } : {};

// ── Stable prefix that exceeds the Gemini Pro 4096-token caching minimum. ──
// (Gemini Enterprise context caching needs >= 4096 tokens of stable prefix
//  for Pro models; Flash needs 1024. Make it ~5500 tokens to clear the bar.)
function makeLargePrefix() {
  const para = (n) =>
    `Section ${n}: This is a deliberately long, stable, generic block of reference text whose only purpose is to fill prompt space so we can test whether the model provider caches stable prefixes across requests. It contains no sensitive data and no instructions; it is filler. The block is byte-for-byte identical across every test in this script so any caching mechanism the provider exposes can recognize and reuse it. Repeated phrasing, repeated structure, and a deterministic counter (${n}) make the content stable. Adding more characters here so the section is comfortably above the per-section threshold and the total prefix exceeds the Gemini Pro caching minimum of 4096 tokens. `.repeat(2);
  const sections = [];
  for (let i = 1; i <= 16; i++) sections.push(para(i));
  return [
    'You are a helpful assistant. The block of reference material below is fixed across many requests in this test. Treat it as background context only.',
    '',
    '--- BEGIN REFERENCE BLOCK ---',
    sections.join('\n'),
    '--- END REFERENCE BLOCK ---',
    '',
    'When the user asks something, answer briefly (one short sentence).',
  ].join('\n');
}
const PREFIX = makeLargePrefix();
const APPROX_PREFIX_TOKENS = Math.ceil(PREFIX.length / 4);

function fetchWithTimeout(url, init) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  return fetch(url, { ...init, signal: ac.signal })
    .finally(() => clearTimeout(timer));
}

async function doFetch(pathPart, body, extraHeaders = {}) {
  const url = `${base}${pathPart}`;
  const init = {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...authHeaders, ...extraHeaders },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const t0 = Date.now();
  try {
    const res = await fetchWithTimeout(url, init);
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    const headers = {};
    for (const [k, v] of res.headers.entries()) headers[k] = v;
    return { ok: res.ok, status: res.status, statusText: res.statusText, json, text, headers, ms: Date.now() - t0, url };
  } catch (e) {
    const to = e.name === 'AbortError';
    return { ok: false, status: 0, statusText: to ? 'TIMEOUT' : 'fetch error', error: e.message, ms: Date.now() - t0, url };
  }
}

// Look at every plausible "cached" field across vendors.
const CACHE_FIELDS = [
  'cached_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens',
  'cached_input_tokens', 'cached_content_token_count', 'cache_read', 'cache_creation',
];

function extractUsage(json) {
  const u = json?.usage ?? {};
  const out = {
    prompt: u.prompt_tokens ?? u.input_tokens ?? null,
    completion: u.completion_tokens ?? u.output_tokens ?? null,
    total: u.total_tokens ?? null,
    cacheHits: {},
  };
  // Flat fields
  for (const f of CACHE_FIELDS) {
    if (u[f] != null) out.cacheHits[f] = u[f];
  }
  // Nested: OpenAI 4o style under usage.prompt_tokens_details.cached_tokens
  if (u.prompt_tokens_details?.cached_tokens != null) {
    out.cacheHits['prompt_tokens_details.cached_tokens'] = u.prompt_tokens_details.cached_tokens;
  }
  // Any other field whose name contains 'cache' or 'cached'
  function walk(obj, prefix) {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? prefix + '.' + k : k;
      if (/cache/i.test(k) && (typeof v === 'number' || typeof v === 'string')) {
        if (out.cacheHits[p] == null) out.cacheHits[p] = v;
      }
      if (v && typeof v === 'object') walk(v, p);
    }
  }
  walk(json, '');
  return out;
}

function hasCache(u) {
  if (!u || !u.cacheHits) return false;
  for (const v of Object.values(u.cacheHits)) {
    if (typeof v === 'number' && v > 0) return true;
    if (typeof v === 'string' && v.length > 0 && v !== '0') return true;
  }
  return false;
}

const tests = [];
const TOTAL = 8;

async function step(label, fn) {
  const n = tests.length + 1;
  process.stderr.write(`[${n}/${TOTAL}] ${label} … `);
  let t;
  try { t = await fn(); }
  catch (e) {
    t = { name: label, verdict: 'ERROR: ' + e.message, verdictKind: 'bad', highlight: e.stack, request: null, response: e.message, status: 0, ms: 0, usage: null, headers: {} };
  }
  tests.push(t);
  console.error(`${t.verdict}  (${t.status ? 'HTTP ' + t.status + ', ' : ''}${t.ms ?? '?'}ms)`);
  renderReportFile();
}

function buildOpenAIBody({ question, withCacheControl, contentAsParts }) {
  const systemContent = withCacheControl && contentAsParts
    ? [{ type: 'text', text: PREFIX, cache_control: { type: 'ephemeral' } }]
    : (contentAsParts ? [{ type: 'text', text: PREFIX }] : PREFIX);
  return {
    model: MODEL,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: question },
    ],
    stream: false,
    max_tokens: 64,
  };
}

function buildAnthropicBody({ question, withCacheControl }) {
  const sys = withCacheControl
    ? [{ type: 'text', text: PREFIX, cache_control: { type: 'ephemeral' } }]
    : [{ type: 'text', text: PREFIX }];
  return {
    model: MODEL,
    max_tokens: 64,
    system: sys,
    messages: [{ role: 'user', content: question }],
  };
}

async function run() {
  console.error(`[caching] base=${base}  model=${MODEL}`);
  console.error(`[caching] prefix size: ${PREFIX.length} bytes, ~${APPROX_PREFIX_TOKENS} tokens`);
  console.error(`[caching] timeout: ${TIMEOUT_MS}ms`);
  console.error(`[caching] running ${TOTAL} tests; report updates after each…\n`);

  // T1 baseline (string content, no cache_control)
  await step('T1 baseline (string)', async () => {
    const body = buildOpenAIBody({ question: 'Say "ok" once.', withCacheControl: false, contentAsParts: false });
    const r = await doFetch('/chat/completions', body);
    const u = extractUsage(r.json);
    return {
      name: 'T1 baseline (string system, no cache_control)',
      goal: 'Establish a baseline: how the endpoint reports usage with no caching hints.',
      verdict: !r.ok ? `HTTP ${r.status}` : hasCache(u) ? `auto-cache? ${Object.keys(u.cacheHits).join(',')}` : 'no cache fields',
      verdictKind: !r.ok ? 'bad' : hasCache(u) ? 'good' : 'info',
      usage: u, request: body, response: r.json ?? r.text ?? r.error, status: r.status, ms: r.ms, headers: r.headers,
    };
  });

  // T2 repeat: same body. If endpoint auto-caches stable prefixes, T2 should show cached tokens.
  await step('T2 repeat (auto-cache check)', async () => {
    const body = buildOpenAIBody({ question: 'Say "ok" once.', withCacheControl: false, contentAsParts: false });
    const r = await doFetch('/chat/completions', body);
    const u = extractUsage(r.json);
    return {
      name: 'T2 same request repeated',
      goal: 'If the endpoint auto-caches stable prefixes, this call should report cached tokens.',
      verdict: !r.ok ? `HTTP ${r.status}` : hasCache(u) ? `✓ CACHE HIT: ${JSON.stringify(u.cacheHits)}` : 'no cache hit',
      verdictKind: !r.ok ? 'bad' : hasCache(u) ? 'good' : 'bad',
      usage: u, request: body, response: r.json ?? r.text ?? r.error, status: r.status, ms: r.ms, headers: r.headers,
    };
  });

  // T3 OpenAI-style cache_control marker on system message (parts form)
  await step('T3 OpenAI cache_control (parts)', async () => {
    const body = buildOpenAIBody({ question: 'Say "ok" twice.', withCacheControl: true, contentAsParts: true });
    const r = await doFetch('/chat/completions', body);
    const u = extractUsage(r.json);
    return {
      name: 'T3 OpenAI cache_control: {type:"ephemeral"} on system parts',
      goal: 'Mark prefix as cacheable in OpenAI style. Look for cache_creation_input_tokens > 0.',
      verdict: !r.ok ? `HTTP ${r.status}` : hasCache(u) ? `✓ cache fields: ${JSON.stringify(u.cacheHits)}` : 'no cache fields (marker may have been stripped)',
      verdictKind: !r.ok ? 'bad' : hasCache(u) ? 'good' : 'warn',
      usage: u, request: body, response: r.json ?? r.text ?? r.error, status: r.status, ms: r.ms, headers: r.headers,
    };
  });

  // T4 OpenAI-style repeat (should be cache_read on second call)
  await step('T4 OpenAI cache_control repeat', async () => {
    const body = buildOpenAIBody({ question: 'Say "ok" three times.', withCacheControl: true, contentAsParts: true });
    const r = await doFetch('/chat/completions', body);
    const u = extractUsage(r.json);
    return {
      name: 'T4 OpenAI cache_control: same prefix, second call',
      goal: 'If T3 created a cache, this call should read it (cache_read_input_tokens > 0).',
      verdict: !r.ok ? `HTTP ${r.status}` : hasCache(u) ? `✓ CACHE READ: ${JSON.stringify(u.cacheHits)}` : 'no cache read',
      verdictKind: !r.ok ? 'bad' : hasCache(u) ? 'good' : 'bad',
      usage: u, request: body, response: r.json ?? r.text ?? r.error, status: r.status, ms: r.ms, headers: r.headers,
    };
  });

  // T5 Anthropic /messages with cache_control (system as parts)
  await step('T5 Anthropic /messages + cache_control', async () => {
    const body = buildAnthropicBody({ question: 'Say "ok" once.', withCacheControl: true });
    const r = await doFetch('/messages', body, { 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31' });
    const u = extractUsage(r.json);
    return {
      name: 'T5 Anthropic /messages + cache_control',
      goal: 'The endpoint may also offer an Anthropic-compatible API that supports caching natively.',
      verdict: !r.ok ? `HTTP ${r.status} (may not exist)` : hasCache(u) ? `✓ Anthropic cache: ${JSON.stringify(u.cacheHits)}` : 'no cache fields',
      verdictKind: !r.ok ? 'warn' : hasCache(u) ? 'good' : 'warn',
      usage: u, request: body, response: r.json ?? r.text ?? r.error, status: r.status, ms: r.ms, headers: r.headers,
    };
  });

  // T6 Anthropic /messages repeat
  await step('T6 Anthropic /messages repeat', async () => {
    const body = buildAnthropicBody({ question: 'Say "ok" twice.', withCacheControl: true });
    const r = await doFetch('/messages', body, { 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31' });
    const u = extractUsage(r.json);
    return {
      name: 'T6 Anthropic /messages cache_control repeat',
      goal: 'Second call to /messages should hit cache if T5 worked.',
      verdict: !r.ok ? `HTTP ${r.status}` : hasCache(u) ? `✓ Anthropic CACHE READ: ${JSON.stringify(u.cacheHits)}` : 'no cache read',
      verdictKind: !r.ok ? 'warn' : hasCache(u) ? 'good' : 'bad',
      usage: u, request: body, response: r.json ?? r.text ?? r.error, status: r.status, ms: r.ms, headers: r.headers,
    };
  });

  // T7 Gemini-native cachedContents create (probe — likely 404 on this endpoint)
  await step('T7 Gemini cachedContents create', async () => {
    const body = {
      model: 'models/' + MODEL,
      contents: [{ role: 'user', parts: [{ text: PREFIX }] }],
      ttl: '600s',
    };
    const r = await doFetch('/cachedContents', body);
    const cacheName = r.json?.name ?? null;
    return {
      name: 'T7 POST /cachedContents (Gemini native)',
      goal: 'Gemini natively caches contexts via a separate endpoint. Probe if it exists here.',
      verdict: !r.ok ? `HTTP ${r.status} (likely not exposed)` : cacheName ? `✓ created: ${cacheName}` : 'returned, no name',
      verdictKind: !r.ok ? 'warn' : cacheName ? 'good' : 'warn',
      usage: null, request: body, response: r.json ?? r.text ?? r.error, status: r.status, ms: r.ms, headers: r.headers,
      _cacheName: cacheName,
    };
  });

  // T8 Reference the cache by name (only meaningful if T7 succeeded)
  await step('T8 use Gemini cached context', async () => {
    const cacheName = tests.find((t) => t.name?.startsWith('T7'))?._cacheName;
    if (!cacheName) {
      return {
        name: 'T8 use cached context (skipped)',
        goal: 'Would use the cache name returned by T7 — skipped because T7 produced no name.',
        verdict: 'skipped',
        verdictKind: 'info',
        usage: null, request: null, response: null, status: 0, ms: 0, headers: {},
      };
    }
    const body = {
      model: 'models/' + MODEL,
      contents: [{ role: 'user', parts: [{ text: 'Say "ok" once.' }] }],
      cachedContent: cacheName,
    };
    const r = await doFetch('/models/' + MODEL + ':generateContent', body);
    const u = extractUsage(r.json);
    return {
      name: 'T8 generateContent referencing cached_content',
      goal: 'Use the cache T7 created. Look for cached_content_token_count.',
      verdict: !r.ok ? `HTTP ${r.status}` : hasCache(u) ? `✓ CACHE READ: ${JSON.stringify(u.cacheHits)}` : 'no cache fields',
      verdictKind: !r.ok ? 'warn' : hasCache(u) ? 'good' : 'bad',
      usage: u, request: body, response: r.json ?? r.text ?? r.error, status: r.status, ms: r.ms, headers: r.headers,
    };
  });

  console.error('\n[caching] all tests done.');
  openReport();
}

function overallVerdict() {
  const find = (n) => tests.find((t) => t.name?.startsWith(n));
  const t2 = find('T2'), t3 = find('T3'), t4 = find('T4'), t5 = find('T5'), t6 = find('T6'), t8 = find('T8');
  const autoCache = hasCache(t2?.usage);
  const openaiCache = hasCache(t3?.usage) || hasCache(t4?.usage);
  const anthCache = hasCache(t5?.usage) || hasCache(t6?.usage);
  const geminiCache = hasCache(t8?.usage);
  if (openaiCache) return 'OPENAI-STYLE cache_control WORKS — wire it into our http adapter';
  if (anthCache) return 'ANTHROPIC /messages caching WORKS — switch our adapter to /messages';
  if (geminiCache) return 'GEMINI cachedContents WORKS — adopt the native cache API';
  if (autoCache) return 'AUTO-CACHE detected on repeat — endpoint caches stable prefixes silently';
  return 'NO CACHING DETECTED on any path tested';
}

function denseSummary() {
  const L = [];
  L.push('== caching test ' + new Date().toISOString().slice(0, 19) + 'Z ==');
  L.push('base  ' + base);
  L.push('model ' + MODEL + '   prefix ~' + APPROX_PREFIX_TOKENS + ' tokens');
  L.push(''.padEnd(50, '-'));
  for (const t of tests) {
    const tag = (t.name || '').slice(0, 28).padEnd(28);
    const ms = t.ms ? t.ms + 'ms' : '';
    const ptok = t.usage?.prompt ?? '?';
    const ctok = t.usage?.completion ?? '?';
    const cache = t.usage?.cacheHits && Object.keys(t.usage.cacheHits).length
      ? Object.entries(t.usage.cacheHits).map(([k, v]) => k.replace(/.*\./, '') + '=' + v).join(' ')
      : '—';
    L.push(tag + ' ' + ms.padStart(7) + '  p=' + String(ptok).padStart(5) + ' c=' + String(ctok).padStart(4) + '  ' + cache);
  }
  L.push(''.padEnd(50, '-'));
  L.push('VERDICT: ' + overallVerdict());
  return L.join('\n');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function pretty(v) {
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

const REPORT_FILE = path.resolve(process.cwd(), 'caching-report.html');

function renderReportFile() {
  const cards = tests.map((t) => {
    const badge = { good: 'b-good', bad: 'b-bad', warn: 'b-warn', info: 'b-info' }[t.verdictKind] ?? 'b-info';
    return `
      <div class="card">
        <div class="card-h"><span class="badge ${badge}">${esc(t.verdict)}</span><h2>${esc(t.name)}</h2></div>
        ${t.goal ? `<p class="goal">${esc(t.goal)}</p>` : ''}
        ${t.usage ? `<h3>Usage</h3><pre class="hl">${esc(pretty(t.usage))}</pre>` : ''}
        <details><summary>Request (${t.ms ?? '?'}ms)</summary><pre>${esc(pretty(t.request)).slice(0, 8000)}</pre></details>
        <details><summary>Response (HTTP ${t.status})</summary><pre>${esc(pretty(t.response)).slice(0, 12000)}</pre></details>
        <details><summary>Response headers</summary><pre>${esc(pretty(t.headers ?? {}))}</pre></details>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>caching test</title>
<style>
  body{font:14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#1f2328;max-width:960px;margin:24px auto;padding:0 20px;}
  h1{border-bottom:3px solid #333;padding-bottom:8px;}
  .card{border:1px solid #e3e6eb;border-radius:10px;padding:14px 18px;margin:14px 0;}
  .card-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
  .card-h h2{font-size:15px;margin:0;}
  .goal{color:#6b7280;font-size:13px;margin:6px 0 10px;}
  .badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;white-space:nowrap;}
  .b-good{background:#d1fae5;color:#065f46;}.b-bad{background:#fee2e2;color:#991b1b;}
  .b-warn{background:#fef3c7;color:#92400e;}.b-info{background:#e5e7eb;color:#374151;}
  h3{font-size:12px;text-transform:uppercase;color:#6b7280;letter-spacing:.5px;margin:12px 0 4px;}
  pre{background:#f6f8fa;border:1px solid #eee;border-radius:6px;padding:10px;overflow:auto;font:11px/1.45 ui-monospace,Consolas,monospace;max-height:360px;}
  pre.hl{background:#f0f7ff;border-color:#bfdbfe;}
  pre.dense{background:#fff;color:#000;border:2px solid #000;font:bold 16px/1.4 ui-monospace,Consolas,monospace;padding:14px;white-space:pre;overflow-x:auto;}
  details{margin:6px 0;}summary{cursor:pointer;font-size:12px;color:#2563eb;}
</style></head><body>
  <h1>prompt-caching test</h1>
  <pre class="dense">${esc(denseSummary())}</pre>
  <p style="color:#6b7280;font-size:12px;">Screenshot the black-bordered block above — it has the verdict + every test's usage one-liner. Detail cards below if needed.</p>
  ${cards}
</body></html>`;
  writeFileSync(REPORT_FILE, html, 'utf8');
}

function openReport() {
  console.error('[caching] report: ' + REPORT_FILE);
  if (process.env.OPEN_BROWSER === '0') return;
  const url = 'file:///' + REPORT_FILE.replace(/\\/g, '/');
  if (process.platform === 'win32') {
    const cands = [
      (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    const chrome = cands.find((p) => { try { return p && existsSync(p); } catch { return false; } });
    if (chrome) spawn(chrome, [url], { stdio: 'ignore', detached: true }).unref();
    else spawn('cmd', ['/c', 'start', '""', url], { stdio: 'ignore', detached: true, windowsHide: true }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', ['-a', 'Google Chrome', url], { stdio: 'ignore', detached: true }).unref();
  } else {
    spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
  }
}

run().catch((e) => { console.error('caching test failed:', e); renderReportFile(); openReport(); process.exit(1); });
