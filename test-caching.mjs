#!/usr/bin/env node
/**
 * Probe latency behavior of api.genai.mil. Four things:
 *
 *   A. Multi-turn conversation simulator.  Builds up a real conversation
 *      one turn at a time, adding ~1500 input tokens per turn (simulating a
 *      tool result + small question each turn). Measures latency per turn
 *      so we can see where the curve goes from "fine" to "unusable" in
 *      practice — not just a single fat request.
 *
 *   B. Cold-vs-warm caching detection by TIMING.  Sends the SAME 5k-token
 *      prefix three times in a row. If implicit caching is silently active,
 *      calls 2 and 3 should be noticeably faster than call 1, even if the
 *      OpenAI-compat shim strips the cached-tokens fields from usage.
 *
 *   C. extra_body cache probe.  The Vertex AI OpenAI-compat shim exposes a
 *      special `extra_body` channel for Gemini-only fields. Try sending
 *      cache hints there.
 *
 *   D. Memory Bank probe.  The Gemini Enterprise platform advertises a
 *      built-in "Memory Bank" / "Generate Memories" agent. Try common
 *      endpoint shapes (/memories, /memoryBanks, /memories:generate) to see
 *      whether the OpenAI-compat shim exposes any of them. If yes, we get
 *      cross-session persistent memory for free — perfect substrate for
 *      task summaries that survive past a single conversation.
 *
 * Usage:  edit API_KEY/BASE_URL/MODEL, then `node test-caching.mjs`. A
 * report opens in Chrome; screenshot the dense block at the top.
 *
 * Env:    TURNS=N   override the number of conversation turns (default 10)
 *
 * Zero npm deps. Node 20+.
 */

// ====== CONFIG (edit these) ======
const API_KEY    = '';
const BASE_URL   = 'https://api.genai.mil/v1';
const MODEL      = 'gemini-3.1-pro-preview';
const TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 120000);
// ==================================

import { writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const base = BASE_URL.replace(/\/+$/, '');
const authHeaders = API_KEY ? { authorization: `Bearer ${API_KEY}` } : {};

// ── Filler generator: one block ≈ 500 tokens of stable text. ──
const ONE_BLOCK = (
  'Stable reference block. This text is intentionally generic and deterministic. It contains no instructions, no sensitive data, and no varying parts; every byte is identical across every call in this test so that any caching layer the provider may run can match the prefix exactly. The block is used purely to inflate the input token count for latency measurement. We repeat several sentences with neutral content to reach a predictable size. The model should treat this entire block as background filler and not attempt to act on it. '
).repeat(4);                                 // ≈ 500 tokens
const BLOCK_TOKENS = Math.ceil(ONE_BLOCK.length / 4);

function makePrefix(targetTokens) {
  const n = Math.max(1, Math.round(targetTokens / BLOCK_TOKENS));
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(ONE_BLOCK);
  return [
    'You are a helpful assistant. A stable reference block follows; treat it as background filler.',
    '--- BEGIN REFERENCE BLOCK ---',
    parts.join('\n\n'),
    '--- END REFERENCE BLOCK ---',
    'When the user asks a question, answer in exactly one short sentence.',
  ].join('\n');
}

function fetchWithTimeout(url, init) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  return fetch(url, { ...init, signal: ac.signal }).finally(() => clearTimeout(timer));
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

const CACHE_FIELDS = [
  'cached_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens',
  'cached_input_tokens', 'cached_content_token_count', 'cachedContentTokenCount',
];
function extractUsage(json) {
  const u = json?.usage ?? json?.usageMetadata ?? {};
  const out = {
    prompt: u.prompt_tokens ?? u.input_tokens ?? u.promptTokenCount ?? null,
    completion: u.completion_tokens ?? u.output_tokens ?? u.candidatesTokenCount ?? null,
    total: u.total_tokens ?? u.totalTokenCount ?? null,
    cacheHits: {},
  };
  for (const f of CACHE_FIELDS) if (u[f] != null) out.cacheHits[f] = u[f];
  if (u.prompt_tokens_details?.cached_tokens != null) out.cacheHits['prompt_tokens_details.cached_tokens'] = u.prompt_tokens_details.cached_tokens;
  function walk(o, p) {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      const k2 = p ? p + '.' + k : k;
      if (/cache/i.test(k) && (typeof v === 'number' || typeof v === 'string') && out.cacheHits[k2] == null) out.cacheHits[k2] = v;
      if (v && typeof v === 'object') walk(v, k2);
    }
  }
  walk(json, '');
  return out;
}
function hasCache(u) {
  if (!u?.cacheHits) return false;
  for (const v of Object.values(u.cacheHits)) {
    if (typeof v === 'number' && v > 0) return true;
    if (typeof v === 'string' && v && v !== '0') return true;
  }
  return false;
}

const tests = [];

async function step(label, fn) {
  const n = tests.length + 1;
  process.stderr.write(`[${n}] ${label} … `);
  let t;
  try { t = await fn(); }
  catch (e) {
    t = { label, verdict: 'ERROR: ' + e.message, status: 0, ms: 0, usage: null, headers: {}, request: null, response: e.message, group: 'err' };
  }
  tests.push(t);
  console.error(`${t.verdict}  (${t.status ? 'HTTP ' + t.status + ', ' : ''}${t.ms ?? '?'}ms)`);
  renderReportFile();
}

function chatBody(prefix, question, extras) {
  return {
    model: MODEL,
    messages: [
      { role: 'system', content: prefix },
      { role: 'user', content: question },
    ],
    stream: false,
    max_tokens: 32,
    ...(extras || {}),
  };
}

const TURNS = Number(process.env.TURNS ?? 10);

// Each turn appends a fake "tool result + question" user message of ~1500
// tokens, plus whatever the model responds with. After N turns the running
// conversation is ~1500*N input tokens.
function makeTurnUserMessage(turnNumber) {
  return [
    `Turn ${turnNumber} — simulated tool result:`,
    ONE_BLOCK.repeat(3),   // ≈ 1500 tokens of filler
    '',
    `Based on the result above, what is one short next step? (Answer in one sentence.)`,
  ].join('\n');
}

async function run() {
  console.error(`[latency] base=${base}  model=${MODEL}  timeout=${TIMEOUT_MS}ms`);
  console.error(`[latency] one block ≈ ${BLOCK_TOKENS} tokens (${ONE_BLOCK.length} chars)`);
  console.error(`[latency] phase A: ${TURNS}-turn conversation, +~1500 input tokens per turn\n`);

  // ── Phase A: simulated growing conversation ──
  const convo = [
    { role: 'system', content: 'You are a helpful coding assistant. Answer briefly.' },
  ];
  for (let turn = 1; turn <= TURNS; turn++) {
    convo.push({ role: 'user', content: makeTurnUserMessage(turn) });
    await step(`A${turn}. conversation turn ${turn} of ${TURNS}`, async () => {
      const body = {
        model: MODEL,
        messages: convo.slice(),  // copy so we send a stable snapshot
        max_tokens: 48,
        stream: false,
      };
      const r = await doFetch('/chat/completions', body);
      const u = extractUsage(r.json);
      // Append the model's response so the next turn sees real history.
      const reply = r.json?.choices?.[0]?.message?.content ?? '(empty)';
      convo.push({ role: 'assistant', content: reply });
      return {
        label: `A${turn}. turn ${turn}`,
        group: 'conv',
        turn,
        verdict: !r.ok ? `HTTP ${r.status}` : `${(r.ms / 1000).toFixed(1)}s  · prompt=${u.prompt ?? '?'}  · completion=${u.completion ?? '?'}`,
        status: r.status, ms: r.ms, usage: u, headers: r.headers,
        request: { model: body.model, messages: `[${convo.length - 1} messages, growing]`, max_tokens: body.max_tokens, stream: false },
        response: r.json ?? r.text ?? r.error,
      };
    });
  }

  // ── Phase B: cold/warm — same 5k prefix sent 3× in a row ──
  const WARM_PREFIX = makePrefix(5000);
  for (let i = 1; i <= 3; i++) {
    await step(`B${i}. cold/warm call ${i} of 3 (same 5k prefix)`, async () => {
      // Different small question each time so the model can't reuse a response.
      const q = `Trial ${i}: please respond with "done ${i}".`;
      const body = chatBody(WARM_PREFIX, q);
      const r = await doFetch('/chat/completions', body);
      const u = extractUsage(r.json);
      return {
        label: `B${i}. warm-up call ${i}/3`,
        group: 'warmup',
        verdict: !r.ok ? `HTTP ${r.status}` : `${(r.ms / 1000).toFixed(1)}s` + (hasCache(u) ? `  · cache: ${JSON.stringify(u.cacheHits)}` : ''),
        status: r.status, ms: r.ms, usage: u, headers: r.headers,
        request: { ...body, messages: '[5k-token system prefix + Q' + i + ']' },
        response: r.json ?? r.text ?? r.error,
      };
    });
  }

  // ── Phase C: extra_body cache probe (Vertex shim convention) ──
  await step('C1. extra_body cache_control', async () => {
    const prefix = makePrefix(5000);
    const body = chatBody(prefix, 'C1 probe: say "ok".', {
      extra_body: {
        cache_control: { type: 'ephemeral' },
        google: { cached_content: 'test-prefix-1' },
      },
    });
    const r = await doFetch('/chat/completions', body);
    const u = extractUsage(r.json);
    return {
      label: 'C1. extra_body { cache_control, google.cached_content }',
      group: 'extra',
      verdict: !r.ok ? `HTTP ${r.status}` : `${(r.ms / 1000).toFixed(1)}s` + (hasCache(u) ? `  · cache: ${JSON.stringify(u.cacheHits)}` : '  · no cache fields'),
      status: r.status, ms: r.ms, usage: u, headers: r.headers,
      request: { ...body, messages: '[5k-token system prefix + question]' },
      response: r.json ?? r.text ?? r.error,
    };
  });
  await step('C2. extra_body repeat (warm probe)', async () => {
    const prefix = makePrefix(5000);
    const body = chatBody(prefix, 'C2 probe: say "ok" twice.', {
      extra_body: {
        cache_control: { type: 'ephemeral' },
        google: { cached_content: 'test-prefix-1' },
      },
    });
    const r = await doFetch('/chat/completions', body);
    const u = extractUsage(r.json);
    return {
      label: 'C2. extra_body repeated immediately after C1',
      group: 'extra',
      verdict: !r.ok ? `HTTP ${r.status}` : `${(r.ms / 1000).toFixed(1)}s` + (hasCache(u) ? `  · cache: ${JSON.stringify(u.cacheHits)}` : '  · no cache fields'),
      status: r.status, ms: r.ms, usage: u, headers: r.headers,
      request: { ...body, messages: '[same 5k prefix as C1]' },
      response: r.json ?? r.text ?? r.error,
    };
  });

  // ── Phase D: Gemini Memory Bank probe ──
  // Memory Bank is the platform's built-in long-term memory feature (we
  // saw "Generate Memories" listed as a built-in agent). Try common
  // endpoints to see if the OpenAI shim exposes any of them.
  const memProbes = [
    { method: 'POST', path: '/memories',     body: { user_id: 'code_boss_test', content: 'Test memory: prefer 4-space indents.' } },
    { method: 'POST', path: '/memoryBanks',  body: { displayName: 'code_boss_test_bank' } },
    { method: 'GET',  path: '/memories',     body: null },
    { method: 'POST', path: '/memories:generate', body: { user_id: 'code_boss_test', events: [{ role: 'user', content: 'I prefer tabs.' }] } },
  ];
  for (let i = 0; i < memProbes.length; i++) {
    const p = memProbes[i];
    await step(`D${i + 1}. memory bank ${p.method} ${p.path}`, async () => {
      const r = await doFetch(p.path, p.body);
      const exposed = r.status >= 200 && r.status < 400;
      return {
        label: `D${i + 1}. ${p.method} ${p.path}`,
        group: 'memory',
        verdict: !r.ok ? `HTTP ${r.status} (not exposed)` : `✓ exposed (${r.ms}ms)`,
        status: r.status, ms: r.ms, usage: null, headers: r.headers,
        request: p.body ? { method: p.method, path: p.path, body: p.body } : { method: p.method, path: p.path },
        response: r.json ?? r.text ?? r.error,
      };
    });
  }

  console.error('\n[latency] all tests done.');
  openReport();
}

function buildVerdict() {
  const lines = [];

  // Conversation growth pattern
  const conv = tests.filter((t) => t.group === 'conv' && t.ms > 0 && t.usage?.prompt);
  if (conv.length >= 2) {
    const first = conv[0], last = conv[conv.length - 1];
    const ratio = last.ms / first.ms;
    const tokRatio = last.usage.prompt / first.usage.prompt;
    const shape = ratio < tokRatio * 1.3 ? 'roughly LINEAR'
      : ratio < tokRatio * 2 ? 'WORSE than linear'
      : 'BAD (super-linear / possible cliff)';
    // Find first "uncomfortable" turn (>5s) and "unusable" turn (>15s)
    const fiveSec = conv.find((t) => t.ms > 5000);
    const fifteenSec = conv.find((t) => t.ms > 15000);
    lines.push(`Conversation scaling: ${shape}  (turn 1: ${(first.ms / 1000).toFixed(1)}s @ ${first.usage.prompt}tok → turn ${last.turn}: ${(last.ms / 1000).toFixed(1)}s @ ${last.usage.prompt}tok)`);
    if (fiveSec) lines.push(`First turn over 5s:   T${fiveSec.turn} @ ${fiveSec.usage.prompt} input tokens`);
    if (fifteenSec) lines.push(`First turn over 15s:  T${fifteenSec.turn} @ ${fifteenSec.usage.prompt} input tokens`);
    else lines.push('No turn exceeded 15s within this run — conversation stayed usable.');
  }

  // Cold/warm
  const warm = tests.filter((t) => t.group === 'warmup');
  if (warm.length === 3 && warm.every((t) => t.ms > 0)) {
    const a = warm[0].ms, b = warm[1].ms, c = warm[2].ms;
    const avg23 = (b + c) / 2;
    const delta = ((avg23 - a) / a) * 100;
    const cacheField = warm.find((t) => hasCache(t.usage));
    if (cacheField) {
      lines.push(`Caching: VISIBLE in usage fields (${JSON.stringify(cacheField.usage.cacheHits)})`);
    } else if (delta < -15) {
      lines.push(`Caching: SILENTLY ACTIVE — warm calls ${Math.abs(delta).toFixed(0)}% faster than cold (${a}ms → avg ${Math.round(avg23)}ms)`);
    } else if (delta < -5) {
      lines.push(`Caching: MAYBE — modest speedup (${Math.abs(delta).toFixed(0)}%) on warm calls`);
    } else {
      lines.push(`Caching: NOT DETECTED — no significant cold→warm speedup (${a}ms → avg ${Math.round(avg23)}ms, ${delta >= 0 ? '+' : ''}${delta.toFixed(0)}%)`);
    }
  }

  // extra_body
  const ex = tests.filter((t) => t.group === 'extra');
  if (ex.length === 2 && ex.every((t) => t.ms > 0)) {
    const cacheField = ex.find((t) => hasCache(t.usage));
    const delta = ((ex[1].ms - ex[0].ms) / ex[0].ms) * 100;
    if (cacheField) lines.push(`extra_body: ACCEPTED — cache fields appeared (${JSON.stringify(cacheField.usage.cacheHits)})`);
    else if (delta < -15) lines.push(`extra_body: maybe — second call ${Math.abs(delta).toFixed(0)}% faster`);
    else lines.push(`extra_body: no effect (${ex[0].ms}ms vs ${ex[1].ms}ms)`);
  }

  // memory bank
  const mem = tests.filter((t) => t.group === 'memory');
  if (mem.length) {
    const exposed = mem.filter((t) => t.status >= 200 && t.status < 400);
    if (exposed.length) {
      lines.push(`Memory Bank: EXPOSED on ${exposed.map((t) => t.label.replace(/^D\d+\. /, '')).join(', ')}`);
    } else {
      const statuses = mem.map((t) => `${t.label.replace(/^D\d+\. /, '').split(' ')[0]}=${t.status}`).join(' ');
      lines.push(`Memory Bank: not exposed through shim (${statuses})`);
    }
  }

  return lines.length ? lines.join('\n') : 'inconclusive';
}

function denseSummary() {
  const L = [];
  L.push('== latency + caching test ' + new Date().toISOString().slice(0, 19) + 'Z ==');
  L.push('base  ' + base);
  L.push('model ' + MODEL);
  L.push(''.padEnd(54, '-'));
  L.push('A. CONVERSATION GROWTH (one turn = +~1.5k tokens of "tool result")');
  for (const t of tests.filter((t) => t.group === 'conv')) {
    const trn = String('T' + t.turn).padStart(4);
    const ms = String(t.ms).padStart(6);
    const ptok = String(t.usage?.prompt ?? '?').padStart(6);
    L.push('  ' + trn + '   ' + ms + ' ms   prompt=' + ptok);
  }
  L.push('');
  L.push('B. COLD vs WARM (same 5k prefix x3)');
  for (const t of tests.filter((t) => t.group === 'warmup')) {
    const lab = t.label.padEnd(20);
    const ms = String(t.ms).padStart(6);
    const cache = hasCache(t.usage) ? '  CACHE!' : '';
    L.push('  ' + lab + ' ' + ms + ' ms' + cache);
  }
  L.push('');
  L.push('C. EXTRA_BODY PROBE');
  for (const t of tests.filter((t) => t.group === 'extra')) {
    const lab = t.label.slice(0, 38).padEnd(38);
    const ms = String(t.ms).padStart(6);
    const cache = hasCache(t.usage) ? '  CACHE!' : '';
    L.push('  ' + lab + ' ' + ms + ' ms' + cache);
  }
  L.push('');
  L.push('D. MEMORY BANK PROBE (Gemini Enterprise built-in)');
  for (const t of tests.filter((t) => t.group === 'memory')) {
    const lab = t.label.slice(0, 40).padEnd(40);
    const ms = String(t.ms).padStart(6);
    const status = '  [' + t.status + ']';
    L.push('  ' + lab + ' ' + ms + ' ms' + status);
  }
  L.push(''.padEnd(54, '-'));
  L.push('VERDICT:');
  for (const ln of buildVerdict().split('\n')) L.push('  ' + ln);
  return L.join('\n');
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function pretty(v) { if (typeof v === 'string') return v; try { return JSON.stringify(v, null, 2); } catch { return String(v); } }

const REPORT_FILE = path.resolve(process.cwd(), 'caching-report.html');

function renderReportFile() {
  const cards = tests.map((t) => `
    <div class="card">
      <div class="card-h"><h2>${esc(t.label)}</h2><span class="ms">${t.ms ?? '?'} ms</span></div>
      <div class="kv">${t.verdict ? `<b>verdict:</b> ${esc(t.verdict)}` : ''}</div>
      ${t.usage ? `<h3>usage</h3><pre class="hl">${esc(pretty(t.usage))}</pre>` : ''}
      <details><summary>request</summary><pre>${esc(pretty(t.request)).slice(0, 6000)}</pre></details>
      <details><summary>response (HTTP ${t.status})</summary><pre>${esc(pretty(t.response)).slice(0, 12000)}</pre></details>
      <details><summary>response headers</summary><pre>${esc(pretty(t.headers ?? {}))}</pre></details>
    </div>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>latency + caching test</title>
<style>
  body{font:14px/1.55 -apple-system,Segoe UI,sans-serif;color:#1f2328;max-width:960px;margin:24px auto;padding:0 20px;}
  h1{border-bottom:3px solid #333;padding-bottom:8px;}
  .card{border:1px solid #e3e6eb;border-radius:10px;padding:14px 18px;margin:14px 0;}
  .card-h{display:flex;align-items:center;justify-content:space-between;gap:10px;}
  .card-h h2{font-size:14px;margin:0;}
  .ms{font:bold 13px ui-monospace,Consolas,monospace;color:#2563eb;}
  .kv{font-size:13px;margin:6px 0;}
  h3{font-size:12px;text-transform:uppercase;color:#6b7280;letter-spacing:.5px;margin:12px 0 4px;}
  pre{background:#f6f8fa;border:1px solid #eee;border-radius:6px;padding:10px;overflow:auto;font:11px/1.45 ui-monospace,Consolas,monospace;max-height:360px;}
  pre.hl{background:#f0f7ff;border-color:#bfdbfe;}
  pre.dense{background:#fff;color:#000;border:2px solid #000;font:bold 14px/1.4 ui-monospace,Consolas,monospace;padding:14px;white-space:pre;overflow-x:auto;}
  details{margin:6px 0;}summary{cursor:pointer;font-size:12px;color:#2563eb;}
</style></head><body>
  <h1>latency + caching test</h1>
  <pre class="dense">${esc(denseSummary())}</pre>
  <p style="color:#6b7280;font-size:12px;">Screenshot the black-bordered block above — it has the size→latency table, cold/warm comparison, and verdict.</p>
  ${cards}
</body></html>`;
  writeFileSync(REPORT_FILE, html, 'utf8');
}

function openReport() {
  console.error('[latency] report: ' + REPORT_FILE);
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

run().catch((e) => { console.error('latency test failed:', e); renderReportFile(); openReport(); process.exit(1); });
