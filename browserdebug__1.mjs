/**
 * browserdebug__1.mjs — agent-driven Chrome debugging for code_boss.  (spec: BROWSER-PLUGIN-SPEC.md)
 *
 * Lets a TEXT-ONLY coding agent debug a web app like an engineer with DevTools open: start a labeled Chrome,
 * drive it, and READ what actually broke at runtime (console, exceptions, network, live state, a DOM-diff
 * timeline) — which curl + reading source cannot show.
 *
 * ZERO dependencies. Node 22 ships WebSocket + fetch as globals, so this speaks the raw Chrome DevTools Protocol
 * over the DevTools WebSocket directly — no puppeteer, no npm. Chrome is launched through host.spawn (the tracked
 * platform spawn), so code_boss owns the process: it is visible in <bg-status>, stoppable via <kill-background>,
 * and auto-reaped on project close + shutdown. This plugin NEVER spawns Chrome itself.
 *
 * THE MODEL: the caller-supplied LABEL is the session id. The agent is stateless between tool calls, so every
 * tool takes the label; the plugin keeps the live CDP connection + buffers in a module-level registry. The
 * agent's "eyes" are TEXT (no screenshots — the production LLM has no image input): browser_snapshot for a
 * point-in-time accessibility/DOM tree with element REFS, and browser_timeline for the over-time event + DOM-diff
 * log. Interaction tools target a ref from the latest snapshot.
 *
 * Install: copy to ~/.code_boss/plugins/browserdebug__1.mjs (e.g. via the <copy> verb). Requires Chrome on the machine.
 */

import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';

// ── config ────────────────────────────────────────────────────────────────────────────────────────────────────
const BUFFER_MAX = 500;          // ring cap per buffer (console/errors/network/timeline) per session
const RESULT_CAP = 20000;        // char cap on a single tool's text result
const CONNECT_TIMEOUT_MS = 15000;
const DEFAULT_WAIT_MS = 15000;

let HOST = null;                 // set in init(host); host.spawn/killSpawned/log
const SESSIONS = new Map();      // label -> Session

function chromePath() {
  const cands = [
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  return cands.find((p) => { try { return p && existsSync(p); } catch { return false; } }) || null;
}
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clip = (s) => { s = String(s == null ? '' : s); return s.length > RESULT_CAP ? s.slice(0, RESULT_CAP) + `\n…[+${s.length - RESULT_CAP} chars]` : s; };
function push(buf, item) { buf.push(item); while (buf.length > BUFFER_MAX) buf.shift(); }

// ── a minimal CDP client over one browser WebSocket (flatten mode multiplexes page sessions) ────────────────────
class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this._id = 0; this._pending = new Map(); this._on = [];
    this._ready = new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('CDP websocket open timed out')), CONNECT_TIMEOUT_MS);
      this.ws.addEventListener('open', () => { clearTimeout(t); res(); }, { once: true });
      this.ws.addEventListener('error', (e) => { clearTimeout(t); rej(new Error('CDP websocket error: ' + (e?.message || 'connection failed'))); }, { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch { return; }
      if (m.id != null && this._pending.has(m.id)) {
        const { resolve, reject } = this._pending.get(m.id); this._pending.delete(m.id);
        if (m.error) reject(new Error(`CDP ${m.error.message || 'error'}${m.error.data ? ' — ' + m.error.data : ''}`));
        else resolve(m.result);
      } else if (m.method) {
        for (const fn of this._on) { try { fn(m.method, m.params || {}, m.sessionId); } catch {} }
      }
    });
    this.ws.addEventListener('close', () => { for (const { reject } of this._pending.values()) reject(new Error('CDP connection closed')); this._pending.clear(); });
  }
  ready() { return this._ready; }
  on(fn) { this._on.push(fn); }
  off(fn) { const i = this._on.indexOf(fn); if (i >= 0) this._on.splice(i, 1); }
  send(method, params = {}, sessionId) {
    const id = ++this._id;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      try { this.ws.send(JSON.stringify(msg)); } catch (e) { this._pending.delete(id); reject(e); }
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

// ── session lifecycle ───────────────────────────────────────────────────────────────────────────────────────────
function getSession(label) {
  const s = SESSIONS.get(String(label));
  if (!s) throw new Error(`no browser session "${label}". Open one with <browser_open label="${label}" url="..."/> (or <browser_list/> to see open sessions).`);
  return s;
}
async function evalIn(s, expression, { awaitPromise = true, returnByValue = true } = {}) {
  const r = await s.cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue, allowUnsafeEvalBlockedByCSP: true }, s.sessionId);
  if (r.exceptionDetails) {
    const ex = r.exceptionDetails;
    throw new Error('page error: ' + (ex.exception?.description || ex.text || 'exception') );
  }
  return r.result?.value;
}

// The in-page runtime the plugin installs once per navigation: a ref map (uid → element) for snapshot/interaction,
// and a MutationObserver ring buffer for the timeline. Kept tiny + defensive; re-installed on each navigation.
const PAGE_RUNTIME = `(() => {
  if (window.__cb && window.__cb.v === 1) return;
  const cb = window.__cb = { v: 1, refs: new Map(), seq: 0, tl: [] };
  cb.tag = (el) => { const id = 'e' + (++cb.seq); cb.refs.set(id, el); try { el.setAttribute('data-cb-ref', id); } catch {} return id; };
  cb.desc = (el) => {
    const t = el.tagName.toLowerCase();
    const id = el.id ? '#' + el.id : '';
    const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '';
    return t + id + cls;
  };
  // timeline: a MutationObserver summarising DOM changes into a bounded ring
  try {
    const mo = new MutationObserver((muts) => {
      const rec = { t: Date.now(), added: [], removed: [], attr: [], text: 0 };
      for (const m of muts) {
        if (m.type === 'childList') {
          for (const n of m.addedNodes) if (n.nodeType === 1) rec.added.push(cb.desc(n));
          for (const n of m.removedNodes) if (n.nodeType === 1) rec.removed.push(cb.desc(n));
        } else if (m.type === 'attributes') {
          rec.attr.push(cb.desc(m.target) + ' [' + m.attributeName + ']');
        } else if (m.type === 'characterData') rec.text++;
      }
      if (rec.added.length || rec.removed.length || rec.attr.length || rec.text) {
        rec.added = rec.added.slice(0, 12); rec.removed = rec.removed.slice(0, 12); rec.attr = rec.attr.slice(0, 12);
        cb.tl.push(rec); while (cb.tl.length > 200) cb.tl.shift();
      }
    });
    mo.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
  } catch (e) {}
})();`;

async function installRuntime(s) { try { await evalIn(s, PAGE_RUNTIME, { returnByValue: true }); } catch {} }

async function openSession(label, { headless = false, url, viewport, attach } = {}) {
  label = String(label);
  if (SESSIONS.has(label)) throw new Error(`a session "${label}" is already open. Close it first (<browser_close label="${label}"/>) or use a different label.`);
  let port, bgId = null, host = '127.0.0.1';
  if (attach) {
    // attach = "host:port", "http://host:port", or just ":9222"/"9222" — honor the HOST too (a devcontainer or
    // remote box); previously it was parsed out and discarded, silently polling 127.0.0.1.
    const str = String(attach);
    const hm = /^(?:https?:\/\/)?\[?([a-z0-9_.-]+)\]?:(\d+)/i.exec(str);
    if (hm) { host = hm[1]; port = Number(hm[2]); }
    else { const m = /(\d+)/.exec(str); port = m ? Number(m[1]) : 9222; }
  } else {
    const chrome = chromePath();
    if (!chrome) throw new Error('Chrome was not found on this machine — install Google Chrome (looked in %LOCALAPPDATA%/Program Files and the standard Linux/macOS paths).');
    if (typeof HOST?.spawn !== 'function') throw new Error('host.spawn is unavailable — the browser plugin needs the tracked-spawn host API (code_boss build 1416+).');
    port = await freePort();
    const dataDir = path.join(os.tmpdir(), 'cb-browserdebug-' + label.replace(/[^a-z0-9_-]/gi, '_') + '-' + port);
    const args = [
      `--remote-debugging-port=${port}`, '--remote-allow-origins=*', `--user-data-dir=${dataDir}`,
      '--no-first-run', '--no-default-browser-check', '--disable-features=Translate,MediaRouter',
      ...(headless ? ['--headless=new', '--disable-gpu'] : []), 'about:blank',
    ];
    const r = await HOST.spawn(chrome, args, {});
    bgId = r?.id || null;
  }
  // Poll for the DevTools endpoint.
  let wsUrl = null;
  const deadline = Date.now() + CONNECT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://${host}:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) { const j = await res.json(); wsUrl = j.webSocketDebuggerUrl; if (wsUrl) break; }
    } catch {}
    await sleep(150);
  }
  if (!wsUrl) { if (bgId) try { await HOST.killSpawned(bgId); } catch {} throw new Error(`Chrome did not expose a DevTools endpoint at ${host}:${port} within ${CONNECT_TIMEOUT_MS / 1000}s.`); }
  // Chrome reports its ws URL as 127.0.0.1 even when reached remotely — rewrite to the host we actually used.
  if (host !== '127.0.0.1') wsUrl = wsUrl.replace(/\/\/127\.0\.0\.1:/, `//${host}:`).replace(/\/\/localhost:/, `//${host}:`);

  // Any failure after the spawn (socket open, target attach) must not leak the Chrome we launched or the
  // socket — mirror the poll-timeout cleanup, then rethrow.
  const cdp = new CDP(wsUrl);
  let sessionId, targetId;
  try {
    await cdp.ready();
    // Attach to a page target (create one when we launched; reuse the first page when attaching).
    const { targetInfos } = await cdp.send('Target.getTargets');
    const page = (targetInfos || []).find((t) => t.type === 'page');
    if (attach && page) targetId = page.targetId;
    else { const c = await cdp.send('Target.createTarget', { url: 'about:blank' }); targetId = c.targetId; }
    ({ sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
  } catch (e) {
    try { cdp.close(); } catch {}
    if (bgId) try { await HOST.killSpawned(bgId); } catch {}
    throw e;
  }

  const s = {
    label, bgId, port, cdp, targetId, sessionId, url: 'about:blank', headless: !!headless, attached: !!attach,
    buffers: { console: [], errors: [], network: new Map(), netOrder: [], timeline: [] },
    dialogs: [], mocks: [], lastAction: null, closed: false,
  };
  SESSIONS.set(label, s);
  wireEvents(s);
  await enableSessionDomains(s);
  if (viewport && viewport.width && viewport.height) await cdp.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false }, sessionId).catch(() => {});
  if (url) await navigate(s, url, {});
  return s;
}

// Enable the CDP domains we buffer from, register the page runtime for future navigations, and inject it into
// the CURRENT document — for THIS session. In flatten mode every attachToTarget yields a FRESH session with all
// domains DISABLED, so this must run for each new/selected tab, not just once at open (else the selected tab goes
// silent: no console/errors/network/timeline).
async function enableSessionDomains(s) {
  for (const [m, p] of [['Page.enable'], ['Runtime.enable'], ['Log.enable'], ['Network.enable', { maxTotalBufferSize: 10_000_000, maxResourceBufferSize: 5_000_000 }], ['DOM.enable']]) {
    try { await s.cdp.send(m, p || {}, s.sessionId); } catch {}
  }
  await s.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_RUNTIME }, s.sessionId).catch(() => {});
  await installRuntime(s);
}

function wireEvents(s) {
  const b = s.buffers;
  s.cdp.on((method, params, sid) => {
    if (sid && sid !== s.sessionId) return;
    const now = Date.now();
    if (method === 'Runtime.consoleAPICalled') {
      const text = (params.args || []).map((a) => a.value !== undefined ? a.value : (a.description || a.type)).join(' ');
      push(b.console, { t: now, level: params.type, text, url: params.stackTrace?.callFrames?.[0]?.url, line: params.stackTrace?.callFrames?.[0]?.lineNumber });
      push(b.timeline, { t: now, kind: 'console', level: params.type, text: text.slice(0, 300) });
    } else if (method === 'Runtime.exceptionThrown') {
      const d = params.exceptionDetails || {};
      const msg = d.exception?.description || d.text || 'exception';
      push(b.errors, { t: now, text: msg, url: d.url, line: d.lineNumber });
      push(b.timeline, { t: now, kind: 'error', text: msg.slice(0, 400) });
    } else if (method === 'Log.entryAdded') {
      const e = params.entry || {};
      if (e.level === 'error' || e.level === 'warning') { push(b.console, { t: now, level: e.level, text: e.text, url: e.url }); push(b.timeline, { t: now, kind: 'console', level: e.level, text: String(e.text).slice(0, 300) }); }
    } else if (method === 'Network.requestWillBeSent') {
      // Fires once per REDIRECT hop for the SAME requestId (the prior hop carried in redirectResponse). Only
      // record the order + reset the record for a genuinely NEW id — else netOrder accumulates duplicates (the
      // request lists N times) and the dup entries evict live records early. A redirect firing just refreshes url.
      const existing = b.network.get(params.requestId);
      if (existing) { existing.url = params.request.url; existing.method = params.request.method; existing.redirects = (existing.redirects || 0) + 1; }
      else {
        b.network.set(params.requestId, { id: params.requestId, method: params.request.method, url: params.request.url, reqHeaders: params.request.headers, t0: now, status: null, type: params.type });
        b.netOrder.push(params.requestId); while (b.netOrder.length > BUFFER_MAX) { const old = b.netOrder.shift(); b.network.delete(old); }
      }
    } else if (method === 'Network.responseReceived') {
      const e = b.network.get(params.requestId); if (e) { e.status = params.response.status; e.respHeaders = params.response.headers; e.mime = params.response.mimeType; }
    } else if (method === 'Network.loadingFinished') {
      const e = b.network.get(params.requestId); if (e) { e.done = now; e.size = params.encodedDataLength; push(b.timeline, { t: now, kind: 'network', text: `${e.method} ${e.status ?? ''} ${e.url}`.slice(0, 300) }); }
    } else if (method === 'Network.loadingFailed') {
      const e = b.network.get(params.requestId); if (e) { e.failed = params.errorText; e.done = now; push(b.timeline, { t: now, kind: 'network', text: `${e.method} FAILED(${params.errorText}) ${e.url}`.slice(0, 300) }); }
    } else if (method === 'Page.frameNavigated' && !params.frame?.parentId) {
      s.url = params.frame.url; push(b.timeline, { t: now, kind: 'navigate', text: params.frame.url });
      installRuntime(s).catch(() => {});
    } else if (method === 'Page.javascriptDialogOpening') {
      s.dialogs.push({ t: now, type: params.type, message: params.message });
      // default: accept, unless a handler config says otherwise (browser_dialog sets s.dialogHandler)
      const h = s.dialogHandler || { accept: true };
      s.cdp.send('Page.handleJavaScriptDialog', { accept: !!h.accept, promptText: h.promptText || '' }, s.sessionId).catch(() => {});
    } else if (method === 'Fetch.requestPaused') {
      handleFetchPaused(s, params).catch(() => {});
    }
  });
}

async function closeSession(label) {
  const s = SESSIONS.get(String(label));
  if (!s) return false;
  s.closed = true;
  try { s.cdp.close(); } catch {}
  if (s.bgId && typeof HOST?.killSpawned === 'function') { try { await HOST.killSpawned(s.bgId); } catch {} }
  SESSIONS.delete(String(label));
  return true;
}

async function navigate(s, url, { waitUntil = 'load', timeoutMs = DEFAULT_WAIT_MS } = {}) {
  const done = new Promise((resolve) => {
    const want = waitUntil === 'domcontentloaded' ? 'DOMContentLoaded' : 'load';
    let settled = false;
    const listener = (m, p, sid) => { if (sid === s.sessionId && m === 'Page.lifecycleEvent' && p.name === (want === 'load' ? 'load' : 'DOMContentLoaded')) finish(); };
    // finish REMOVES the listener — without off() every navigate left one permanent handler on the shared
    // connection, running on every subsequent CDP event for the session's lifetime.
    const finish = () => { if (settled) return; settled = true; s.cdp.off(listener); resolve(); };
    s.cdp.on(listener);
    setTimeout(finish, timeoutMs);
  });
  await s.cdp.send('Page.setLifecycleEventsEnabled', { enabled: true }, s.sessionId).catch(() => {});
  const r = await s.cdp.send('Page.navigate', { url }, s.sessionId);
  if (r.errorText) throw new Error(`navigation to ${url} failed: ${r.errorText}`);
  await done;
  await installRuntime(s);
  s.lastAction = `navigate ${url}`;
  return r;
}

// ── snapshot + interaction (via the in-page ref map) ────────────────────────────────────────────────────────────
const SNAPSHOT_FN = `(() => {
  const cb = window.__cb; if (!cb) return 'ERROR: page runtime not installed'; cb.refs.clear(); cb.seq = 0;
  // Strip attributes stamped by PREVIOUS snapshots: ref ids restart at e1 each pass, so a stale data-cb-ref="e5"
  // on an element not re-tagged this pass would collide with the new e5 — and browser_upload resolves refs via
  // querySelector('[data-cb-ref=...]') (first match in document order), i.e. possibly the stale element.
  document.querySelectorAll('[data-cb-ref]').forEach((el) => el.removeAttribute('data-cb-ref'));
  const INTERACTIVE = new Set(['A','BUTTON','INPUT','SELECT','TEXTAREA','OPTION','LABEL','SUMMARY']);
  const roleOf = (el) => el.getAttribute('role') || ({A:'link',BUTTON:'button',INPUT:(el.type||'textbox'),SELECT:'combobox',TEXTAREA:'textbox',IMG:'img',NAV:'navigation',MAIN:'main',HEADER:'banner',H1:'heading',H2:'heading',H3:'heading',H4:'heading'}[el.tagName]) || el.tagName.toLowerCase();
  const nameOf = (el) => (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || (el.tagName==='INPUT'?el.value:'') || (el.innerText||'').trim().replace(/\\s+/g,' ').slice(0,80) || '').trim();
  const lines = []; let count = 0;
  const visible = (el) => { const s = getComputedStyle(el); if (s.display==='none'||s.visibility==='hidden'||s.opacity==='0') return false; const r = el.getBoundingClientRect(); return r.width>0 && r.height>0; };
  const walk = (el, depth) => {
    if (count > 800) return;
    if (el.nodeType !== 1) return;
    const tag = el.tagName;
    if (['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','META','LINK','HEAD'].includes(tag)) return;
    const interactive = INTERACTIVE.has(tag) || el.hasAttribute('role') || el.onclick || el.getAttribute('tabindex')!=null;
    let shown = false;
    if (interactive && visible(el)) {
      const ref = cb.tag(el);
      const state = [];
      if (el.disabled) state.push('disabled'); if (el.checked) state.push('checked'); if (el.getAttribute('aria-expanded')) state.push('expanded='+el.getAttribute('aria-expanded'));
      lines.push('  '.repeat(Math.min(depth,8)) + '[' + ref + '] ' + roleOf(el) + ' "' + nameOf(el) + '"' + (state.length?' ('+state.join(',')+')':''));
      count++; shown = true;
    } else if ((tag==='H1'||tag==='H2'||tag==='H3'||tag==='P'||tag==='LI'||tag==='SPAN'||tag==='DIV') && visible(el)) {
      const txt = (el.childNodes.length===1 && el.firstChild.nodeType===3) ? el.textContent.trim().replace(/\\s+/g,' ').slice(0,100) : '';
      if (txt) { lines.push('  '.repeat(Math.min(depth,8)) + (tag[0]==='H'?tag+' ':'') + '"' + txt + '"'); count++; shown = true; }
    }
    for (const c of el.children) walk(c, shown ? depth+1 : depth);
  };
  walk(document.body || document.documentElement, 0);
  return 'URL: ' + location.href + '\\nTITLE: ' + document.title + '\\n' + lines.join('\\n');
})();`;

async function actByRef(s, ref, action) {
  // action runs in-page with `el` bound to the ref'd element. Returns {ok} or {error}.
  const js = `(() => { const cb=window.__cb; const el=cb&&cb.refs.get(${JSON.stringify(String(ref))}); if(!el) return {error:'stale or unknown ref "${ref}" — take a fresh <browser_snapshot/> and use a current ref'}; try { ${action} return {ok:true, el: cb.desc(el)}; } catch(e){ return {error: String(e && e.message || e)}; } })();`;
  const r = await evalIn(s, js);
  if (r && r.error) throw new Error(r.error);
  return r;
}
function dispatchInput(valueJson) {
  return `el.focus(); el.value=${valueJson}; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));`;
}

// ── mock / fetch interception (Tier 2) ──────────────────────────────────────────────────────────────────────────
async function handleFetchPaused(s, params) {
  const url = params.request.url;
  const rule = s.mocks.find((m) => url.includes(m.urlPattern) || (m.regex && new RegExp(m.urlPattern).test(url)));
  if (!rule) { await s.cdp.send('Fetch.continueRequest', { requestId: params.requestId }, s.sessionId).catch(() => {}); return; }
  if (rule.block) { await s.cdp.send('Fetch.failRequest', { requestId: params.requestId, errorReason: 'BlockedByClient' }, s.sessionId).catch(() => {}); return; }
  const body = rule.body != null ? Buffer.from(String(rule.body)).toString('base64') : undefined;
  await s.cdp.send('Fetch.fulfillRequest', {
    requestId: params.requestId, responseCode: rule.status || 200,
    responseHeaders: Object.entries(rule.headers || { 'content-type': 'application/json' }).map(([name, value]) => ({ name, value: String(value) })),
    body,
  }, s.sessionId).catch(() => {});
}

// ── formatting helpers ──────────────────────────────────────────────────────────────────────────────────────────
function fmtNet(s, { filter, failedOnly } = {}) {
  const rows = s.buffers.netOrder.map((id) => s.buffers.network.get(id)).filter(Boolean)
    .filter((e) => !failedOnly || e.failed || (e.status && e.status >= 400))
    .filter((e) => !filter || e.url.includes(filter));
  if (!rows.length) return '(no matching requests)';
  return rows.map((e) => `${e.id}  ${e.method} ${e.failed ? 'FAILED('+e.failed+')' : (e.status ?? '...')} ${e.type || ''}  ${e.size ? e.size + 'B' : ''}  ${e.url}`).join('\n');
}
function fmtTimeline(s, { since, filter } = {}) {
  let tl = s.buffers.timeline.slice();
  if (filter) tl = tl.filter((e) => e.kind === filter);
  if (since != null) tl = tl.filter((e) => e.t > Number(since));
  return { text: tl.map((e) => `${new Date(e.t).toISOString().slice(11, 23)} ${e.kind.toUpperCase()}${e.level ? '/' + e.level : ''}: ${e.text || fmtDiff(e)}`).join('\n') || '(nothing recorded)', cursor: tl.length ? tl[tl.length - 1].t : since };
}
function fmtDiff(e) {
  if (e.kind !== 'dom') return e.text || '';
  const parts = [];
  if (e.added?.length) parts.push('+' + e.added.join(', +'));
  if (e.removed?.length) parts.push('-' + e.removed.join(', -'));
  if (e.attr?.length) parts.push('~' + e.attr.join(', ~'));
  // Surface the causing action — the headline cause→effect pairing (spec §4a: "click #submit → +div.error-banner")
  // was computed + stored in `after` but never rendered.
  const body = parts.join('  ') || '(dom change)';
  return e.after ? `${e.after} → ${body}` : body;
}
async function drainDom(s) {
  // Pull the in-page MutationObserver ring into the plugin timeline, tagged with the last agent action.
  try {
    const recs = await evalIn(s, `(() => { const cb=window.__cb; if(!cb) return []; const r=cb.tl.splice(0); return r; })();`);
    for (const r of (recs || [])) push(s.buffers.timeline, { t: r.t, kind: 'dom', added: r.added, removed: r.removed, attr: r.attr, after: s.lastAction });
  } catch {}
}

// ── the plugin ──────────────────────────────────────────────────────────────────────────────────────────────────
const T = (verb, description, properties, required, impl) => ({ verb, name: verb, schema: { description, parameters: { type: 'object', properties: properties || {}, required: required || [] } }, impl });
const ok = (content) => ({ content: clip(content) });

export default {
  description: 'Agent-driven Chrome debugging (Puppeteer-style, zero-dep raw CDP): start a labeled browser, drive it, and read console/errors/network/DOM + a change timeline',
  author: 'code_boss',
  init(host) { HOST = host; },
  async dispose() { for (const label of [...SESSIONS.keys()]) { try { await closeSession(label); } catch {} } },

  tools: [
    // ── lifecycle ──
    T('browser_open', 'Start a labeled Chrome (the label is the session id) OR attach to a running one. Headed by default so you can watch; headless for CI. Returns the session + initial URL.',
      { label: { type: 'string' }, url: { type: 'string', description: 'optional URL to load immediately' }, headless: { type: 'boolean', description: 'default false (headed)' }, attach: { type: 'string', description: 'optional: attach to an already-running Chrome at http://host:port (its --remote-debugging-port) instead of launching' } },
      ['label'],
      async (a) => { const s = await openSession(a.label, { headless: !!a.headless, url: a.url, attach: a.attach }); return ok(`session "${a.label}" ${s.attached ? 'attached' : 'started'} (${s.headless ? 'headless' : 'headed'}). URL: ${s.url}. Next: <browser_navigate/> or <browser_snapshot/>.`); }),
    T('browser_close', 'Close a browser session and kill its tracked Chrome.', { label: { type: 'string' } }, ['label'],
      async (a) => ok((await closeSession(a.label)) ? `closed "${a.label}".` : `no session "${a.label}".`)),
    T('browser_list', 'List open browser sessions.', {}, [],
      async () => ok(SESSIONS.size ? [...SESSIONS.values()].map((s) => `${s.label}: ${s.headless ? 'headless' : 'headed'}${s.attached ? ' (attached)' : ''}  ${s.url}`).join('\n') : '(no open sessions)')),

    // ── drive ──
    T('browser_navigate', 'Load a URL in the session (waits for load). Returns the final URL + whether it loaded.',
      { label: { type: 'string' }, url: { type: 'string' }, waitUntil: { type: 'string', description: '"load" (default) or "domcontentloaded"' } }, ['label', 'url'],
      async (a) => { const s = getSession(a.label); await navigate(s, a.url, { waitUntil: a.waitUntil }); await drainDom(s); return ok(`navigated to ${s.url}. Use <browser_snapshot/> to see the page, <browser_console/>/<browser_errors/> for runtime output.`); }),
    T('browser_wait', 'Wait (bounded by a timeout) until text appears, a CSS selector matches, or a JS predicate is true. A TIMEOUT is a diagnostic, not an error.',
      { label: { type: 'string' }, text: { type: 'string' }, selector: { type: 'string' }, jsPredicate: { type: 'string', description: 'a JS expression that should become truthy' }, timeoutMs: { type: 'integer', description: 'default 15000' } }, ['label'],
      async (a) => {
        const s = getSession(a.label); const timeout = Number(a.timeoutMs) || DEFAULT_WAIT_MS; const t0 = Date.now();
        const cond = a.jsPredicate ? a.jsPredicate
          : a.selector ? `!!document.querySelector(${JSON.stringify(a.selector)})`
          : a.text ? `document.body && document.body.innerText.includes(${JSON.stringify(a.text)})`
          : 'true';
        while (Date.now() - t0 < timeout) { try { if (await evalIn(s, `!!(${cond})`)) { await drainDom(s); return ok(`condition met in ${Date.now() - t0}ms.`); } } catch {} await sleep(200); }
        await drainDom(s);
        return ok(`TIMED OUT after ${timeout}ms waiting for ${a.jsPredicate ? 'predicate' : a.selector ? 'selector ' + a.selector : 'text ' + JSON.stringify(a.text)} — this is itself a signal (the thing never happened). Check <browser_console/>/<browser_errors/>.`);
      }),

    // ── see (text; no screenshots) ──
    T('browser_snapshot', 'The page as a TEXT accessibility/DOM tree with a [ref] on each interactable element. Use the refs with click/type/etc. THIS is how you see the page.',
      { label: { type: 'string' } }, ['label'],
      async (a) => { const s = getSession(a.label); await installRuntime(s); return ok(await evalIn(s, SNAPSHOT_FN)); }),
    T('browser_find', 'Search the CURRENT page for text/regex; returns matching elements + their [ref]s, without re-emitting the whole snapshot.',
      { label: { type: 'string' }, query: { type: 'string' } }, ['label', 'query'],
      async (a) => { const s = getSession(a.label); await installRuntime(s); const full = await evalIn(s, SNAPSHOT_FN); let re; try { re = new RegExp(a.query, 'i'); } catch { re = new RegExp(String(a.query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); } const hits = String(full).split('\n').filter((l) => re.test(l)); return ok(hits.length ? hits.join('\n') : `no match for ${JSON.stringify(a.query)} in the current page.`); }),
    T('browser_eval', 'Run JS in the page GLOBAL context and return the result. Reaches anything on window (globals, framework stores, the DOM, getComputedStyle) — NOT a local var inside a running function. Pass a ref to bind it as $0.',
      { label: { type: 'string' }, js: { type: 'string' }, ref: { type: 'string' } }, ['label', 'js'],
      async (a) => {
        const s = getSession(a.label);
        const expr = a.ref ? `(() => { const $0 = window.__cb && window.__cb.refs.get(${JSON.stringify(String(a.ref))}); return (${a.js}); })()` : `(${a.js})`;
        const v = await evalIn(s, expr);
        return ok(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
      }),

    // ── interact (by ref) ──
    T('browser_click', 'Click an element by its [ref] (from the latest snapshot) or a CSS selector.', { label: { type: 'string' }, ref: { type: 'string' }, selector: { type: 'string' } }, ['label'],
      async (a) => { const s = getSession(a.label); s.lastAction = `click ${a.ref || a.selector}`; if (a.ref) { const r = await actByRef(s, a.ref, 'el.scrollIntoView({block:"center"}); el.click();'); await sleep(100); await drainDom(s); return ok(`clicked ${r.el}.`); } await evalIn(s, `document.querySelector(${JSON.stringify(a.selector)}).click()`); await sleep(100); await drainDom(s); return ok(`clicked ${a.selector}.`); }),
    T('browser_hover', 'Hover an element (triggers hover-only UI: tooltips, dropdowns).', { label: { type: 'string' }, ref: { type: 'string' } }, ['label', 'ref'],
      async (a) => { const s = getSession(a.label); s.lastAction = `hover ${a.ref}`; await actByRef(s, a.ref, 'el.dispatchEvent(new MouseEvent("mouseover",{bubbles:true})); el.dispatchEvent(new MouseEvent("mouseenter",{bubbles:true}));'); await sleep(100); await drainDom(s); return ok(`hovered ${a.ref}.`); }),
    T('browser_type', 'Type text into an input by ref (dispatches input+change so frameworks react).', { label: { type: 'string' }, ref: { type: 'string' }, text: { type: 'string' } }, ['label', 'ref', 'text'],
      async (a) => { const s = getSession(a.label); s.lastAction = `type ${a.ref}`; await actByRef(s, a.ref, dispatchInput(JSON.stringify(a.text))); await drainDom(s); return ok(`typed into ${a.ref}.`); }),
    T('browser_fill', 'Fill many inputs in one call: a map of ref → value.', { label: { type: 'string' }, fields: { type: 'object', description: '{ "e5": "value", ... }' } }, ['label', 'fields'],
      async (a) => { const s = getSession(a.label); s.lastAction = 'fill form'; for (const [ref, val] of Object.entries(a.fields || {})) await actByRef(s, ref, dispatchInput(JSON.stringify(String(val)))); await drainDom(s); return ok(`filled ${Object.keys(a.fields || {}).length} field(s).`); }),
    T('browser_select', 'Choose an option in a <select> by ref.', { label: { type: 'string' }, ref: { type: 'string' }, value: { type: 'string' } }, ['label', 'ref', 'value'],
      async (a) => { const s = getSession(a.label); s.lastAction = `select ${a.ref}`; await actByRef(s, a.ref, `el.value=${JSON.stringify(a.value)}; el.dispatchEvent(new Event('change',{bubbles:true}));`); await drainDom(s); return ok(`selected ${JSON.stringify(a.value)}.`); }),
    T('browser_press', 'Press a key / combo on the page (Enter, Tab, Escape, ArrowDown, Ctrl+A).', { label: { type: 'string' }, keys: { type: 'string' } }, ['label', 'keys'],
      async (a) => {
        const s = getSession(a.label); s.lastAction = `press ${a.keys}`;
        const parts = String(a.keys).split('+'); const key = parts.pop();
        const mods = (parts.includes('Ctrl') ? 2 : 0) | (parts.includes('Shift') ? 8 : 0) | (parts.includes('Alt') ? 1 : 0) | (parts.includes('Meta') ? 4 : 0);
        const keyMap = { Enter: { code: 'Enter', key: 'Enter', vk: 13 }, Tab: { code: 'Tab', key: 'Tab', vk: 9 }, Escape: { code: 'Escape', key: 'Escape', vk: 27 }, ArrowDown: { code: 'ArrowDown', key: 'ArrowDown', vk: 40 }, ArrowUp: { code: 'ArrowUp', key: 'ArrowUp', vk: 38 } };
        const k = keyMap[key] || { code: 'Key' + key.toUpperCase(), key, vk: key.toUpperCase().charCodeAt(0) };
        await s.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: mods, code: k.code, key: k.key, windowsVirtualKeyCode: k.vk }, s.sessionId).catch(() => {});
        await s.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: mods, code: k.code, key: k.key, windowsVirtualKeyCode: k.vk }, s.sessionId).catch(() => {});
        await sleep(80); await drainDom(s); return ok(`pressed ${a.keys}.`);
      }),

    // ── read runtime signal ──
    T('browser_console', 'The console output since navigation (log/info/warn/error) with source location.',
      { label: { type: 'string' }, level: { type: 'string', description: 'filter: error|warning|log|info' }, since: { type: 'integer' } }, ['label'],
      async (a) => { const s = getSession(a.label); let c = s.buffers.console; if (a.level) c = c.filter((e) => e.level === a.level || (a.level === 'warning' && e.level === 'warn')); if (a.since != null) c = c.filter((e) => e.t > Number(a.since)); return ok(c.length ? c.map((e) => `${e.level.toUpperCase()}: ${e.text}${e.url ? `  (${e.url}:${e.line ?? ''})` : ''}`).join('\n') : '(no console output)'); }),
    T('browser_errors', 'Uncaught exceptions + unhandled promise rejections since navigation, with stack traces.',
      { label: { type: 'string' } }, ['label'],
      async (a) => { const s = getSession(a.label); const e = s.buffers.errors; return ok(e.length ? e.map((x) => `${x.text}${x.url ? `  (${x.url}:${x.line ?? ''})` : ''}`).join('\n\n') : '(no uncaught errors)'); }),
    T('browser_network', 'The network requests since navigation (method, status, type, size, URL). Filter or show only failures.',
      { label: { type: 'string' }, filter: { type: 'string', description: 'substring of the URL' }, failedOnly: { type: 'boolean' } }, ['label'],
      async (a) => ok(fmtNet(getSession(a.label), { filter: a.filter, failedOnly: a.failedOnly }))),
    T('browser_request', 'Full detail on one request by its id (from browser_network): headers + response body + timing.',
      { label: { type: 'string' }, requestId: { type: 'string' } }, ['label', 'requestId'],
      async (a) => {
        const s = getSession(a.label); const e = s.buffers.network.get(String(a.requestId));
        if (!e) return ok(`no request "${a.requestId}" (see <browser_network/> for ids).`);
        let body = ''; try { const r = await s.cdp.send('Network.getResponseBody', { requestId: e.id }, s.sessionId); body = r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body; } catch (err) { body = '(body unavailable: ' + (err?.message || err) + ')'; }
        return ok([`${e.method} ${e.url}`, `status: ${e.failed ? 'FAILED ' + e.failed : e.status}`, `type: ${e.type} ${e.mime || ''}  size: ${e.size ?? '?'}B  time: ${e.done && e.t0 ? (e.done - e.t0) + 'ms' : '?'}`, '', 'REQUEST HEADERS:', JSON.stringify(e.reqHeaders || {}, null, 1), '', 'RESPONSE HEADERS:', JSON.stringify(e.respHeaders || {}, null, 1), '', 'RESPONSE BODY:', body].join('\n'));
      }),
    T('browser_timeline', 'The "what happened" log: page events (your actions, navigations, console, errors, network) each with the DOM DIFF it caused — the text way to watch a dynamic page over time. Pass a cursor from a prior call to see only new events.',
      { label: { type: 'string' }, since: { type: 'integer', description: 'cursor from a prior timeline call' }, filter: { type: 'string', description: 'dom|console|error|network|navigate' } }, ['label'],
      async (a) => { const s = getSession(a.label); await drainDom(s); s.buffers.timeline.sort((x, y) => x.t - y.t); const r = fmtTimeline(s, { since: a.since, filter: a.filter }); return ok(r.text + `\n\n[cursor: ${r.cursor}]`); }),

    // ── TIER 2 ──
    T('browser_dom', 'For an element (by ref): its outerHTML, computed styles, and box model — the layout-bug tool.',
      { label: { type: 'string' }, ref: { type: 'string' } }, ['label', 'ref'],
      async (a) => { const s = getSession(a.label); const r = await actByRef(s, a.ref, `const cs=getComputedStyle(el); const box=el.getBoundingClientRect(); const styles={}; for(const p of ['display','position','width','height','margin','padding','border','color','background-color','font-size','z-index','overflow','flex','grid-template-columns','visibility','opacity']) styles[p]=cs.getPropertyValue(p); return {ok:true, html: el.outerHTML.slice(0,2000), box:{x:box.x,y:box.y,w:box.width,h:box.height}, styles};`); return ok(['HTML:', r.html, '', 'BOX: ' + JSON.stringify(r.box), '', 'COMPUTED:', JSON.stringify(r.styles, null, 1)].join('\n')); }),
    T('browser_watch', 'Poll a JS expression until it changes / equals a value / becomes truthy (bounded). Catch a transition.',
      { label: { type: 'string' }, js: { type: 'string' }, until: { type: 'string', description: '"changed" (default), "truthy", or "=<value>"' }, timeoutMs: { type: 'integer' } }, ['label', 'js'],
      async (a) => {
        const s = getSession(a.label); const timeout = Number(a.timeoutMs) || DEFAULT_WAIT_MS; const t0 = Date.now();
        const first = await evalIn(s, `(${a.js})`); const mode = a.until || 'changed';
        while (Date.now() - t0 < timeout) {
          const v = await evalIn(s, `(${a.js})`);
          if (mode === 'changed' && JSON.stringify(v) !== JSON.stringify(first)) return ok(`changed after ${Date.now() - t0}ms: ${JSON.stringify(first)} → ${JSON.stringify(v)}`);
          if (mode === 'truthy' && v) return ok(`truthy after ${Date.now() - t0}ms: ${JSON.stringify(v)}`);
          if (mode.startsWith('=') && String(v) === mode.slice(1)) return ok(`equalled ${mode.slice(1)} after ${Date.now() - t0}ms`);
          await sleep(200);
        }
        return ok(`TIMED OUT after ${timeout}ms — value stayed ${JSON.stringify(first)}.`);
      }),
    T('browser_storage', 'Read (or set/clear) cookies + localStorage + sessionStorage.',
      { label: { type: 'string' }, setLocal: { type: 'object' }, clear: { type: 'boolean' } }, ['label'],
      async (a) => {
        const s = getSession(a.label);
        if (a.clear) { await evalIn(s, 'localStorage.clear(); sessionStorage.clear();'); return ok('cleared local + session storage.'); }
        if (a.setLocal) { for (const [k, v] of Object.entries(a.setLocal)) await evalIn(s, `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(String(v))})`); return ok(`set ${Object.keys(a.setLocal).length} localStorage key(s).`); }
        const data = await evalIn(s, `({ local: {...localStorage}, session: {...sessionStorage} })`);
        let cookies = []; try { cookies = (await s.cdp.send('Network.getCookies', {}, s.sessionId)).cookies || []; } catch {}
        return ok(['LOCALSTORAGE:', JSON.stringify(data.local, null, 1), '', 'SESSIONSTORAGE:', JSON.stringify(data.session, null, 1), '', 'COOKIES:', cookies.map((c) => `${c.name}=${c.value}${c.httpOnly ? ' (httpOnly)' : ''}`).join('\n')].join('\n'));
      }),
    T('browser_storage_state', 'Save the full cookies+storage to a file, or restore from one — reproduce a logged-in state without re-login.',
      { label: { type: 'string' }, save: { type: 'boolean' }, restore: { type: 'string', description: 'path to a state file' } }, ['label'],
      async (a) => {
        const s = getSession(a.label);
        if (a.restore) { let st; try { st = JSON.parse(readFileSync(a.restore, 'utf8')); } catch (e) { return ok('could not read ' + a.restore + ': ' + e.message); } if (st.cookies) await s.cdp.send('Network.setCookies', { cookies: st.cookies }, s.sessionId).catch(() => {}); if (st.local) for (const [k, v] of Object.entries(st.local)) await evalIn(s, `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)})`); return ok('restored storage state; reload to apply.'); }
        const data = await evalIn(s, `({ local: {...localStorage}, session: {...sessionStorage} })`);
        let cookies = []; try { cookies = (await s.cdp.send('Network.getCookies', {}, s.sessionId)).cookies || []; } catch {}
        const p = path.join(os.tmpdir(), `cb-storage-${a.label}-${Date.now()}.json`);
        writeFileSync(p, JSON.stringify({ cookies, local: data.local, session: data.session }, null, 2));
        return ok('saved storage state to ' + p);
      }),
    T('browser_emulate', 'Set emulation to reproduce environment/perf bugs: CPU slowdown, network profile (or offline), device/viewport, geolocation, timezone, color scheme.',
      { label: { type: 'string' }, cpuThrottle: { type: 'number', description: 'slowdown multiplier, e.g. 4' }, offline: { type: 'boolean' }, network: { type: 'string', description: '"slow3g"|"fast3g"' }, width: { type: 'integer' }, height: { type: 'integer' }, colorScheme: { type: 'string' }, timezone: { type: 'string' }, geo: { type: 'object' } }, ['label'],
      async (a) => {
        const s = getSession(a.label); const done = [];
        if (a.cpuThrottle) { await s.cdp.send('Emulation.setCPUThrottlingRate', { rate: a.cpuThrottle }, s.sessionId); done.push(`cpu ${a.cpuThrottle}x`); }
        if (a.offline || a.network) { const prof = a.offline ? { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 } : a.network === 'slow3g' ? { offline: false, latency: 400, downloadThroughput: 50000, uploadThroughput: 25000 } : { offline: false, latency: 150, downloadThroughput: 180000, uploadThroughput: 84000 }; await s.cdp.send('Network.emulateNetworkConditions', prof, s.sessionId); done.push(a.offline ? 'offline' : a.network); }
        if (a.width && a.height) { await s.cdp.send('Emulation.setDeviceMetricsOverride', { width: a.width, height: a.height, deviceScaleFactor: 1, mobile: false }, s.sessionId); done.push(`${a.width}x${a.height}`); }
        if (a.colorScheme) { await s.cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: a.colorScheme }] }, s.sessionId); done.push(a.colorScheme); }
        if (a.timezone) { await s.cdp.send('Emulation.setTimezoneOverride', { timezoneId: a.timezone }, s.sessionId).catch(() => {}); done.push(a.timezone); }
        if (a.geo && a.geo.latitude != null) { await s.cdp.send('Emulation.setGeolocationOverride', { latitude: a.geo.latitude, longitude: a.geo.longitude, accuracy: 1 }, s.sessionId); done.push('geo'); }
        return ok('emulating: ' + (done.join(', ') || '(nothing set)') + '. Reload to apply where needed.');
      }),
    T('browser_mock', 'Intercept requests matching a URL substring: block them, or return a canned status/body (force a 500, an empty payload, a fixed JSON). Isolate frontend vs backend.',
      { label: { type: 'string' }, urlPattern: { type: 'string' }, block: { type: 'boolean' }, status: { type: 'integer' }, body: { type: 'string' }, headers: { type: 'object' }, clear: { type: 'boolean' } }, ['label', 'urlPattern'],
      async (a) => {
        const s = getSession(a.label);
        if (a.clear) { s.mocks = s.mocks.filter((m) => m.urlPattern !== a.urlPattern); if (!s.mocks.length) await s.cdp.send('Fetch.disable', {}, s.sessionId).catch(() => {}); return ok(`cleared mock for ${a.urlPattern}.`); }
        s.mocks.push({ urlPattern: a.urlPattern, block: !!a.block, status: a.status, body: a.body, headers: a.headers });
        await s.cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, s.sessionId);
        return ok(`mocking ${a.urlPattern}: ${a.block ? 'BLOCK' : `${a.status || 200} ${a.body ? '+body' : ''}`}. Reload to apply.`);
      }),
    T('browser_tabs', 'List / open / select / close tabs in the session.', { label: { type: 'string' }, action: { type: 'string', description: 'list|open|select|close' }, url: { type: 'string' }, targetId: { type: 'string' } }, ['label', 'action'],
      async (a) => {
        const s = getSession(a.label);
        if (a.action === 'list') { const { targetInfos } = await s.cdp.send('Target.getTargets'); return ok(targetInfos.filter((t) => t.type === 'page').map((t) => `${t.targetId === s.targetId ? '* ' : '  '}${t.targetId}  ${t.title}  ${t.url}`).join('\n')); }
        // NOTE: no wireEvents(s) here — the session-lifetime handler installed by openSession reads the LIVE
        // s.sessionId, so it follows the tab switch on its own. Re-wiring stacked a duplicate handler per
        // open/select (events buffered N×, dialogs answered N×).
        // Both open AND select land on a fresh flatten session with domains disabled — enableSessionDomains
        // re-enables Page/Runtime/Network/Log/DOM + re-injects the page runtime so the new tab isn't silent.
        if (a.action === 'open') { const c = await s.cdp.send('Target.createTarget', { url: a.url || 'about:blank' }); const at = await s.cdp.send('Target.attachToTarget', { targetId: c.targetId, flatten: true }); s.targetId = c.targetId; s.sessionId = at.sessionId; await enableSessionDomains(s); return ok(`opened + switched to ${c.targetId}.`); }
        if (a.action === 'select') { const at = await s.cdp.send('Target.attachToTarget', { targetId: a.targetId, flatten: true }); s.targetId = a.targetId; s.sessionId = at.sessionId; await enableSessionDomains(s); return ok(`switched to ${a.targetId}.`); }
        if (a.action === 'close') { await s.cdp.send('Target.closeTarget', { targetId: a.targetId }); return ok(`closed ${a.targetId}.`); }
        return ok('action must be list|open|select|close.');
      }),
    T('browser_dialog', 'Set how native dialogs (alert/confirm/prompt) are answered for this session, and list ones seen.', { label: { type: 'string' }, accept: { type: 'boolean' }, promptText: { type: 'string' } }, ['label'],
      async (a) => { const s = getSession(a.label); s.dialogHandler = { accept: a.accept !== false, promptText: a.promptText || '' }; return ok(`dialogs will be ${a.accept !== false ? 'ACCEPTED' : 'DISMISSED'}${a.promptText ? ' with "' + a.promptText + '"' : ''}. Seen so far: ${s.dialogs.map((d) => d.type + ':' + d.message).join('; ') || 'none'}.`); }),
    T('browser_upload', 'Upload a local file into a file input (by ref).', { label: { type: 'string' }, ref: { type: 'string' }, filePath: { type: 'string' } }, ['label', 'ref', 'filePath'],
      async (a) => { const s = getSession(a.label); const r = await evalIn(s, `(() => { const el=window.__cb.refs.get(${JSON.stringify(String(a.ref))}); if(!el) return null; return true; })()`); if (!r) throw new Error('stale ref'); const doc = await s.cdp.send('DOM.getDocument', {}, s.sessionId); const node = await s.cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: `[data-cb-ref="${a.ref}"]` }, s.sessionId); await s.cdp.send('DOM.setFileInputFiles', { files: [a.filePath], nodeId: node.nodeId }, s.sessionId); return ok(`uploaded ${a.filePath} into ${a.ref}.`); }),
    T('browser_har', 'Export the network log since navigation as a HAR file; returns the path + a summary.', { label: { type: 'string' } }, ['label'],
      async (a) => {
        const s = getSession(a.label); const rows = s.buffers.netOrder.map((id) => s.buffers.network.get(id)).filter(Boolean);
        const har = { log: { version: '1.2', creator: { name: 'code_boss browserdebug', version: '1' }, entries: rows.map((e) => ({ startedDateTime: new Date(e.t0).toISOString(), time: (e.done && e.t0) ? e.done - e.t0 : 0, request: { method: e.method, url: e.url, headers: Object.entries(e.reqHeaders || {}).map(([name, value]) => ({ name, value: String(value) })) }, response: { status: e.status || 0, headers: Object.entries(e.respHeaders || {}).map(([name, value]) => ({ name, value: String(value) })), content: { size: e.size || 0, mimeType: e.mime || '' } } })) } };
        const p = path.join(os.tmpdir(), `cb-har-${a.label}-${Date.now()}.har`);
        writeFileSync(p, JSON.stringify(har, null, 2));
        return ok(`wrote ${rows.length} requests to ${p}`);
      }),
  ],
};
