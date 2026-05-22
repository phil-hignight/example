#!/usr/bin/env node
/**
 * code_boss endpoint diagnostic. Probes api.genai.mil to determine whether it
 * honors CLIENT-SIDE tool calling (standard OpenAI semantics) or runs its own
 * managed agents. Writes diagnose-report.html and opens it in Chrome.
 *
 * Usage:
 *   1. Edit API_KEY / BASE_URL / MODEL below.
 *   2. node diagnose.mjs
 *   3. Screenshot the report that opens.
 *
 * Zero npm deps. Node 20+.
 */

// ====== CONFIG (edit these) ======
const API_KEY  = '';                            // bearer token
const BASE_URL = 'https://api.genai.mil/v1';    // endpoint base
const MODEL    = 'gemini-3.1-pro-preview';      // model under test
// ==================================

import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const base = BASE_URL.replace(/\/+$/, '');
const authHeaders = API_KEY ? { authorization: `Bearer ${API_KEY}` } : {};

// A trivial, unambiguous tool. If the endpoint honors client tools, a prompt
// that clearly needs it should produce a tool_call we can see.
const WEATHER_TOOL_OPENAI = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Get the current weather for a city. Call this for any weather question.',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string', description: 'City name' } },
      required: ['city'],
      additionalProperties: false,
    },
  },
};
const WEATHER_TOOL_ANTHROPIC = {
  name: 'get_weather',
  description: 'Get the current weather for a city. Call this for any weather question.',
  input_schema: {
    type: 'object',
    properties: { city: { type: 'string', description: 'City name' } },
    required: ['city'],
  },
};

async function doFetch(pathPart, body, extraHeaders = {}) {
  const url = `${base}${pathPart}`;
  const init = {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...authHeaders, ...extraHeaders },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const t0 = Date.now();
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, statusText: res.statusText, json, text, ms: Date.now() - t0, url };
  } catch (e) {
    return { ok: false, status: 0, statusText: 'fetch error', error: e.message, ms: Date.now() - t0, url };
  }
}

function toolCallsFromOpenAI(json) {
  return json?.choices?.[0]?.message?.tool_calls ?? null;
}
function contentFromOpenAI(json) {
  return json?.choices?.[0]?.message?.content ?? null;
}
function toolUseFromAnthropic(json) {
  const blocks = json?.content;
  if (!Array.isArray(blocks)) return null;
  const uses = blocks.filter((b) => b.type === 'tool_use');
  return uses.length ? uses : null;
}

const tests = [];
function addTest(t) { tests.push(t); }

async function run() {
  // 1) Models list
  {
    const r = await doFetch('/models', null);
    const ids = Array.isArray(r.json?.data) ? r.json.data.map((m) => m.id ?? m.name ?? String(m)) : [];
    addTest({
      name: '1. GET /models',
      goal: 'See which models exist (look for a non-agent / raw variant).',
      verdict: r.ok ? (ids.length ? `${ids.length} models` : 'ok, but no list') : `HTTP ${r.status}`,
      verdictKind: r.ok ? 'info' : 'bad',
      highlight: ids.length ? ids.join('\n') : null,
      request: { method: 'GET', url: r.url },
      response: r.json ?? r.text ?? r.error,
      status: r.status,
    });
  }

  // 2) chat + tools, tool_choice: auto
  {
    const body = {
      model: MODEL,
      messages: [{ role: 'user', content: 'What is the weather in Paris right now? Use the get_weather tool.' }],
      tools: [WEATHER_TOOL_OPENAI],
      tool_choice: 'auto',
    };
    const r = await doFetch('/chat/completions', body);
    const tc = toolCallsFromOpenAI(r.json);
    addTest({
      name: '2. chat/completions + tools (tool_choice: auto)',
      goal: 'Does the endpoint return CLIENT tool_calls for us to execute?',
      verdict: !r.ok ? `HTTP ${r.status}` : tc ? '✓ CLIENT TOOLS WORK — got tool_calls' : '✗ ignored — got text, no tool_calls',
      verdictKind: !r.ok ? 'bad' : tc ? 'good' : 'bad',
      highlight: tc ? JSON.stringify(tc, null, 2) : (contentFromOpenAI(r.json) ?? '').slice(0, 600),
      request: body,
      response: r.json ?? r.text ?? r.error,
      status: r.status,
    });
  }

  // 3) chat + tools, tool_choice: required
  {
    const body = {
      model: MODEL,
      messages: [{ role: 'user', content: 'Hello.' }],
      tools: [WEATHER_TOOL_OPENAI],
      tool_choice: 'required',
    };
    const r = await doFetch('/chat/completions', body);
    const tc = toolCallsFromOpenAI(r.json);
    addTest({
      name: '3. chat/completions + tools (tool_choice: required)',
      goal: 'Forcing a tool call — if this still returns text, client tools are truly not wired.',
      verdict: !r.ok ? `HTTP ${r.status}` : tc ? '✓ forced tool_call returned' : '✗ no tool_calls even when required',
      verdictKind: !r.ok ? 'warn' : tc ? 'good' : 'bad',
      highlight: tc ? JSON.stringify(tc, null, 2) : (contentFromOpenAI(r.json) ?? '').slice(0, 600),
      request: body,
      response: r.json ?? r.text ?? r.error,
      status: r.status,
    });
  }

  // 4) chat + tools, forced specific function
  {
    const body = {
      model: MODEL,
      messages: [{ role: 'user', content: 'Hello.' }],
      tools: [WEATHER_TOOL_OPENAI],
      tool_choice: { type: 'function', function: { name: 'get_weather' } },
    };
    const r = await doFetch('/chat/completions', body);
    const tc = toolCallsFromOpenAI(r.json);
    addTest({
      name: '4. chat/completions + tools (forced get_weather)',
      goal: 'Explicitly name the function. Last resort for OpenAI-style client tools.',
      verdict: !r.ok ? `HTTP ${r.status}` : tc ? '✓ named function returned' : '✗ still no tool_calls',
      verdictKind: !r.ok ? 'warn' : tc ? 'good' : 'bad',
      highlight: tc ? JSON.stringify(tc, null, 2) : (contentFromOpenAI(r.json) ?? '').slice(0, 600),
      request: body,
      response: r.json ?? r.text ?? r.error,
      status: r.status,
    });
  }

  // 5) Anthropic-compatible /messages with a tool
  {
    const body = {
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'What is the weather in Paris? Use the get_weather tool.' }],
      tools: [WEATHER_TOOL_ANTHROPIC],
    };
    const r = await doFetch('/messages', body, { 'anthropic-version': '2023-06-01' });
    const tu = toolUseFromAnthropic(r.json);
    addTest({
      name: '5. Anthropic /messages + tools',
      goal: 'The spec said this endpoint also offers Anthropic-compatible APIs. Does THAT honor client tools?',
      verdict: !r.ok ? `HTTP ${r.status} (may not exist)` : tu ? '✓ ANTHROPIC TOOLS WORK — got tool_use' : '✗ no tool_use blocks',
      verdictKind: !r.ok ? 'warn' : tu ? 'good' : 'bad',
      highlight: tu ? JSON.stringify(tu, null, 2) : JSON.stringify(r.json?.content ?? r.text ?? '', null, 2).slice(0, 600),
      request: body,
      response: r.json ?? r.text ?? r.error,
      status: r.status,
    });
  }

  // 6) Baseline: no tools, ask what it can call
  {
    const body = {
      model: MODEL,
      messages: [{ role: 'user', content: 'List every tool or function you can call, by exact name. Be brief.' }],
    };
    const r = await doFetch('/chat/completions', body);
    addTest({
      name: '6. No tools — "what can you call?"',
      goal: 'Shows the platform-native tools the model thinks it has (baseline).',
      verdict: r.ok ? 'see response' : `HTTP ${r.status}`,
      verdictKind: 'info',
      highlight: (contentFromOpenAI(r.json) ?? '').slice(0, 1500),
      request: body,
      response: r.json ?? r.text ?? r.error,
      status: r.status,
    });
  }

  writeReport();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function pretty(v) {
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

function writeReport() {
  const anyUnlock = tests.some((t) => t.status === 401);
  const cards = tests.map((t) => {
    const badgeClass = { good: 'b-good', bad: 'b-bad', warn: 'b-warn', info: 'b-info' }[t.verdictKind] ?? 'b-info';
    return `
      <div class="card">
        <div class="card-h">
          <span class="badge ${badgeClass}">${esc(t.verdict)}</span>
          <h2>${esc(t.name)}</h2>
        </div>
        <p class="goal">${esc(t.goal)}</p>
        ${t.highlight ? `<h3>Key</h3><pre class="hl">${esc(pretty(t.highlight))}</pre>` : ''}
        <details><summary>Request</summary><pre>${esc(pretty(t.request)).slice(0, 6000)}</pre></details>
        <details><summary>Response (HTTP ${t.status})</summary><pre>${esc(pretty(t.response)).slice(0, 12000)}</pre></details>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>code_boss endpoint diagnostic</title>
<style>
  body{font:14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#1f2328;max-width:960px;margin:24px auto;padding:0 20px;}
  h1{border-bottom:3px solid #333;padding-bottom:8px;}
  .meta{color:#6b7280;font-size:13px;margin-bottom:20px;}
  .card{border:1px solid #e3e6eb;border-radius:10px;padding:14px 18px;margin:14px 0;}
  .card-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
  .card-h h2{font-size:15px;margin:0;}
  .goal{color:#6b7280;font-size:13px;margin:6px 0 10px;}
  .badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;white-space:nowrap;}
  .b-good{background:#d1fae5;color:#065f46;}
  .b-bad{background:#fee2e2;color:#991b1b;}
  .b-warn{background:#fef3c7;color:#92400e;}
  .b-info{background:#e5e7eb;color:#374151;}
  h3{font-size:12px;text-transform:uppercase;color:#6b7280;letter-spacing:.5px;margin:12px 0 4px;}
  pre{background:#f6f8fa;border:1px solid #eee;border-radius:6px;padding:10px;overflow:auto;font:11px/1.45 ui-monospace,Consolas,monospace;max-height:360px;}
  pre.hl{background:#f0f7ff;border-color:#bfdbfe;}
  details{margin:6px 0;}
  summary{cursor:pointer;font-size:12px;color:#2563eb;}
  .unlock{background:#fff5f5;border-left:4px solid #b91c1c;padding:12px;border-radius:0 6px 6px 0;margin:12px 0;}
</style></head><body>
  <h1>code_boss endpoint diagnostic</h1>
  <div class="meta">
    Base URL: <b>${esc(base)}</b> &middot; Model: <b>${esc(MODEL)}</b> &middot; Key: <b>${esc((API_KEY || '(empty)').slice(0, 8))}…</b> &middot; ${esc(new Date().toISOString())}
  </div>
  ${anyUnlock ? `<div class="unlock"><b>Note:</b> one or more calls returned HTTP 401 — your API key may be locked. Unlock it and re-run for accurate results.</div>` : ''}
  <p><b>What to look for:</b> if test 2/3/4 show a green "CLIENT TOOLS WORK", we can use native OpenAI tools. If they're all red but test 5 (Anthropic) is green, we switch to the Anthropic endpoint. If everything is red, we use prompted-format tool calling.</p>
  ${cards}
</body></html>`;

  const file = path.resolve(process.cwd(), 'diagnose-report.html');
  writeFileSync(file, html, 'utf8');
  console.error('[diagnose] wrote ' + file);
  if (process.env.OPEN_BROWSER === '0') return;

  // Open in Chrome (fall back to default).
  const url = 'file:///' + file.replace(/\\/g, '/');
  if (process.platform === 'win32') {
    const candidates = [
      (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    const chrome = candidates.find((p) => { try { return p && existsSync(p); } catch { return false; } });
    if (chrome) spawn(chrome, [url], { stdio: 'ignore', detached: true }).unref();
    else spawn('cmd', ['/c', 'start', '""', url], { stdio: 'ignore', detached: true, windowsHide: true }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', ['-a', 'Google Chrome', url], { stdio: 'ignore', detached: true }).unref();
  } else {
    spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
  }
}

run().catch((e) => { console.error('diagnose failed:', e); process.exit(1); });
