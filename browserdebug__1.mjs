/**
 * browserdebug__1.mjs — agent-driven Chrome debugging for code_boss.  (spec: BROWSER-PLUGIN-SPEC.md)
 *
 * Lets a TEXT-ONLY coding agent debug a web app like an engineer with DevTools open: start a labeled Chrome,
 * drive it, and READ what actually broke at runtime (console, exceptions, network, live state, a DOM-diff
 * timeline) — which curl + reading source cannot show.
 *
 * ZERO dependencies: this speaks the raw Chrome DevTools Protocol over the DevTools WebSocket directly — no
 * puppeteer, no npm. It uses the global WebSocket when the runtime has one (Node 21+) and falls back to a minimal
 * built-in RFC-6455 client over node:net when it does not (Node 18/20). Chrome is launched through host.spawn (the tracked
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
import crypto from 'node:crypto';
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

// ── the socket: global WebSocket where it exists, else a built-in fallback ──────────────────────────────────────
// Node ships a global WebSocket only from v21; on Node 18/20 `new WebSocket(...)` throws "WebSocket is not defined"
// and the plugin cannot connect at all. Rather than make the plugin demand a Node upgrade on the developer's
// machine, fall back to a minimal RFC-6455 client (below) that covers exactly what the DevTools endpoint needs.
// CB_BROWSERDEBUG_WS=shim forces the fallback on a modern Node so the tests can exercise it.
function openSocket(url) {
  const forced = String(process.env.CB_BROWSERDEBUG_WS || '').toLowerCase() === 'shim';
  if (!forced && typeof globalThis.WebSocket === 'function') return new globalThis.WebSocket(url);
  return new NodeWS(url);
}

// A minimal RFC-6455 CLIENT over node:net, scoped to the DevTools endpoint: plain ws:// only (the debugging port is
// never TLS), no extensions offered (so no permessage-deflate to inflate), text frames. It exposes the slice of the
// WebSocket surface CDP uses below — addEventListener(open|message|error|close), send(string), close() — so the two
// implementations are interchangeable. Handles fragmentation, both extended length forms, and server pings.
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
class NodeWS {
  constructor(url) {
    this._ls = { open: [], message: [], error: [], close: [] };
    this._sendQ = [];            // frames queued until the handshake completes
    this._rx = Buffer.alloc(0);  // unparsed bytes
    this._frag = null;           // { opcode, chunks } across a fragmented message
    this._open = false; this._done = false; this._sock = null;
    let u;
    try { u = new URL(url); } catch { u = null; }
    if (!u || u.protocol !== 'ws:') {
      // Defer so the caller can attach its error listener first.
      setTimeout(() => this._fail(`the built-in WebSocket fallback speaks plain ws:// only (got "${url}") — upgrade to Node 21+ for anything else`), 0);
      return;
    }
    const key = crypto.randomBytes(16).toString('base64');
    this._accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    const sock = this._sock = net.connect({ host: u.hostname, port: Number(u.port) || 80 });
    sock.setNoDelay(true);
    sock.on('error', (e) => this._fail(e?.message || 'socket error'));
    sock.on('close', () => this._emitClose());
    sock.on('connect', () => {
      sock.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\n` +
        `Host: ${u.host}\r\n` +
        'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    sock.on('data', (d) => {
      this._rx = Buffer.concat([this._rx, d]);
      if (!this._open) { if (!this._handshake()) return; }
      try { this._frames(); } catch (e) { this._fail(e?.message || 'frame error'); }
    });
  }
  // Consume the 101 response; returns true once the connection is live.
  _handshake() {
    const end = this._rx.indexOf('\r\n\r\n');
    if (end < 0) return false;
    const head = this._rx.subarray(0, end).toString('latin1');
    this._rx = this._rx.subarray(end + 4);
    if (!/^HTTP\/1\.1 101/i.test(head)) { this._fail('DevTools refused the WebSocket upgrade: ' + head.split('\r\n')[0]); return false; }
    const got = (/^sec-websocket-accept:\s*(\S+)/im.exec(head) || [])[1];
    if (got !== this._accept) { this._fail('WebSocket handshake failed (bad Sec-WebSocket-Accept)'); return false; }
    this._open = true;
    this._emit('open', { type: 'open' });
    for (const f of this._sendQ.splice(0)) { try { this._sock.write(f); } catch {} }
    return true;
  }
  // Parse whole frames out of _rx; leaves a partial frame buffered for the next chunk.
  _frames() {
    for (;;) {
      const b = this._rx;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0, opcode = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (b.length < 10) return;
        const big = b.readBigUInt64BE(2);
        if (big > 0x7fffffffn) throw new Error('WebSocket frame larger than this client supports');
        len = Number(big); off = 10;
      }
      let mask = null;
      if (masked) { if (b.length < off + 4) return; mask = b.subarray(off, off + 4); off += 4; }   // servers must not mask; tolerate it
      if (b.length < off + len) return;
      const payload = Buffer.from(b.subarray(off, off + len));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this._rx = b.subarray(off + len);

      if (opcode === 0x8) { try { this._sock.write(this._frame(0x8, Buffer.alloc(0))); } catch {} this._destroy(); return; }
      if (opcode === 0x9) { try { this._sock.write(this._frame(0xa, payload)); } catch {} continue; }   // ping → pong
      if (opcode === 0xa) continue;                                                                     // pong
      if (opcode === 0x0) {                                                                             // continuation
        if (!this._frag) continue;
        this._frag.chunks.push(payload);
        if (fin) { const f = this._frag; this._frag = null; this._deliver(f.opcode, Buffer.concat(f.chunks)); }
        continue;
      }
      if (!fin) { this._frag = { opcode, chunks: [payload] }; continue; }
      this._deliver(opcode, payload);
    }
  }
  _deliver(opcode, payload) { this._emit('message', { type: 'message', data: opcode === 0x1 ? payload.toString('utf8') : payload }); }
  // Client→server frames MUST be masked (RFC 6455 §5.3).
  _frame(opcode, payload) {
    const len = payload.length;
    const head = Buffer.alloc(len < 126 ? 2 : len < 65536 ? 4 : 10);
    head[0] = 0x80 | opcode;
    if (len < 126) head[1] = 0x80 | len;
    else if (len < 65536) { head[1] = 0x80 | 126; head.writeUInt16BE(len, 2); }
    else { head[1] = 0x80 | 127; head.writeBigUInt64BE(BigInt(len), 2); }
    const mask = crypto.randomBytes(4);
    const body = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) body[i] = payload[i] ^ mask[i & 3];
    return Buffer.concat([head, mask, body]);
  }
  addEventListener(type, fn, opts) { const l = this._ls[type]; if (l) l.push({ fn, once: !!(opts && opts.once) }); }
  removeEventListener(type, fn) { const l = this._ls[type]; if (!l) return; const i = l.findIndex((x) => x.fn === fn); if (i >= 0) l.splice(i, 1); }
  _emit(type, ev) { for (const e of this._ls[type].slice()) { if (e.once) this.removeEventListener(type, e.fn); try { e.fn(ev); } catch {} } }
  _fail(message) { if (this._done) return; this._emit('error', { type: 'error', message }); this._destroy(); }
  _emitClose() { if (this._done) return; this._done = true; this._open = false; this._emit('close', { type: 'close' }); }
  _destroy() { try { this._sock?.destroy(); } catch {} this._emitClose(); }
  send(data) {
    if (this._done) throw new Error('WebSocket is closed');
    const f = this._frame(0x1, Buffer.from(String(data), 'utf8'));
    if (this._open) this._sock.write(f); else this._sendQ.push(f);
  }
  close() { if (this._done) return; try { this._sock.write(this._frame(0x8, Buffer.alloc(0))); } catch {} this._destroy(); }
}

// ── a minimal CDP client over one browser WebSocket (flatten mode multiplexes page sessions) ────────────────────
class CDP {
  constructor(wsUrl) {
    this.ws = openSocket(wsUrl);
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

// ── THE WALL: shapes of UNKNOWN PII (spec: PII-PLUGIN-SPEC.md §9; sited here per BROWSER-PLUGIN-SPEC §5a-wall) ───────────────────────────────────────────────────────────
// The pii plugin's masker is STORE-KEYED — it masks values you registered. The wall is SHAPE-KEYED: it catches values
// nobody registered because they merely LOOK like an identifier, pauses, and asks. Add an id class by adding a row.
//
// This lives in the BROWSER plugin, not the pii one, and never runs on files. Two reasons, both load-bearing:
// (1) the surface must be page TEXT, not markup — only the plugin that owns the injected page runtime can walk text
//     nodes and tell a street address from a CSS class name; and (2) the noisy rules below are affordable ONLY on page
//     text (PII-PLUGIN-SPEC §9.4a measured ~30 false positives per source FILE from ZIP + Address alone).
// It carries NO dependency on the pii plugin: browser debugging must keep working when pii is not installed.
//
// `digits` is the DIGIT COUNT, and a contiguous run of exactly that many digits always matches. `groupings` lists the
// SEPARATED layouts that also count ("3-2-4" → 123-45-6789). Separated forms are matched only against DECLARED
// layouts, never by joining digit groups freely across any separator — that distinction is what makes this usable:
// free joining turns every log timestamp ("2026-07-25 19" → 4+2+2+2 = 10) and every IPv4 ("192.168.1.100" → 10) into
// an EDI, and the wall's main ingress is browser network/console output, which is made of exactly those.
const WALL_ID_SHAPES = [
  { name: 'ssn', label: 'SSN', digits: 9, groupings: ['3-2-4'] },
  { name: 'edi', label: 'EDI', digits: 10, groupings: [] },
  // ZIP is deliberately BROAD — 5 digits matches any 5-digit number (ports, build numbers, quantities). That is the
  // "err on the side of blocking too much" call, and it is affordable only because the wall's surface is page TEXT
  // content, where bare 5-digit numbers are rare, rather than source code, where they are everywhere. If the wall is
  // ever widened past browser text, revisit this row FIRST — it is the one that will generate the noise.
  { name: 'zip', label: 'ZIP', digits: 5, groupings: [] },
];
// Separators allowed INSIDE a declared grouping: hyphen family + space. Not '.' or '/' — those are what make version
// strings, IPs and dates look like identifiers.
const WALL_GROUP_SEP = '[-\\u2010-\\u2015 ]';

// Shapes that are a PATTERN rather than a digit count. Same "add a row" contract as WALL_ID_SHAPES.
const WALL_PATTERN_SHAPES = [
  { name: 'email', label: 'Email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu },
  // STREET ADDRESS — a house number (<=5 digits) then a word: "123 Main", "1600 Pennsylvania".
  // This is the NOISIEST rule by a wide margin: the same shape is every numeric UI label ("3 Comments",
  // "12 Results", "404 Error"). It is here because over-blocking is the explicit instruction and the surface is
  // page text a human reviews once per source. WALL_ADDRESS_REQUIRE_CAPITAL is the cheap precision lever — with
  // it on, "3 items" and "5 files" fall away while "123 Main" survives; capitalized UI labels still fire.
  { name: 'address', label: 'Address', re: null },
];
// Flip to false to take EVERY "<=5 digits> <word>" regardless of case (noisier still).
const WALL_ADDRESS_REQUIRE_CAPITAL = true;
{
  const word = WALL_ADDRESS_REQUIRE_CAPITAL ? '\\p{Lu}[\\p{L}\'’.-]*' : '\\p{L}[\\p{L}\'’.-]*';
  // (?<!\d) keeps the house number digit-bounded, so "123456 Main" is NOT an address with house number 12345.
  WALL_PATTERN_SHAPES.find((s) => s.name === 'address').re = new RegExp(`(?<!\\d)\\d{1,5}[ \\t]+${word}`, 'gu');
}

// Compiled once: for each id shape, the contiguous form plus every declared grouping. Each alternative asserts a
// NON-DIGIT (or string edge) on both sides — the developer's rule: a digit run only counts when it is bounded by
// non-numbers, so a 9-digit id inside a 15-digit number is NOT an SSN.
const WALL_ID_PATTERNS = WALL_ID_SHAPES.flatMap((s) => {
  const alts = [`\\d{${s.digits}}`];
  for (const g of s.groupings || []) {
    const parts = String(g).split('-').map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);
    if (parts.reduce((a, b) => a + b, 0) !== s.digits) continue;   // a grouping that does not add up is a typo, not a rule
    alts.push(parts.map((n) => `\\d{${n}}`).join(WALL_GROUP_SEP));
  }
  return alts.map((a) => ({ shape: s.name, label: s.label, re: new RegExp(`(?<!\\d)(?:${a})(?!\\d)`, 'gu') }));
});

/**
 * Find UNKNOWN values that merely LOOK like PII. Pure + exported for unit tests.
 * @param {string} text
 * @param {Array<[number,number]>} reserved  spans of already-emitted tokens (never re-flag a masked value)
 * @returns {Array<{shape,label,value,start,end}>} non-overlapping, in document order
 */
export function detectWallShapes(text, reserved = []) {
  const src = typeof text === 'string' ? text : '';
  if (!src) return [];
  const inReserved = (s, e) => reserved.some(([rs, re]) => s < re && e > rs);
  const hits = [];
  const push = (shape, label, m) => {
    const start = m.index, end = m.index + m[0].length;
    if (!inReserved(start, end)) hits.push({ shape, label, value: m[0], start, end });
  };
  for (const p of WALL_ID_PATTERNS) { p.re.lastIndex = 0; let m; while ((m = p.re.exec(src)) !== null) push(p.shape, p.label, m); }
  for (const s of WALL_PATTERN_SHAPES) { s.re.lastIndex = 0; let m; while ((m = s.re.exec(src)) !== null) push(s.name, s.label, m); }
  // Longest-wins on overlap (a grouped SSN beats a bare run inside it), then document order.
  hits.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const out = [];
  for (const h of hits) if (!out.some((k) => h.start < k.end && h.end > k.start)) out.push(h);
  return out;
}

// ── the WALL: scan surface, session decisions, ephemeral tokens ─────────────────────────────────────────────────
// SCAN SURFACE. The wall must scan everything the tool RETURNS — a surface narrower than the payload leaks by
// construction (measured: text-nodes-only missed an SSN in value=, an EDI in data-edi= and an SSN in a ?ssn= query,
// all of which ship to the model inside the serialized markup anyway). So the cut is DATA-CARRYING vs STRUCTURAL:
// blank out class / style / placeholder, keep everything else. `id` is deliberately KEPT — a badly built app can put
// a real member number in one, and the developer chose recall over quiet.
// Blanking pads with SPACES of the same length so every match offset still points at the ORIGINAL text.
const WALL_TOKEN_RE = /⟦wall:[0-9a-f]{16}⟧/g;
const WALL_SKIP_ATTRS = /\s(?:class|style|placeholder)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
// A URL PORT is structurally never PII, and it is 5 digits often enough to matter: every browser_open result
// carries one, and it is RANDOM per run, so without this the developer is asked about a fresh "ZIP" every single
// session and the wall trains them to click allow. Blanked, not exempted from the payload — the rest of the URL
// (including a ?ssn= query) is still scanned.
const WALL_URL_PORT = /(https?:\/\/[^\s/:?#]+):(\d{1,5})/gi;
export function wallScanSurface(text) {
  return String(text == null ? '' : text)
    .replace(WALL_SKIP_ATTRS, (m) => ' '.repeat(m.length))
    .replace(WALL_URL_PORT, (m, host, port) => host + ':' + ' '.repeat(port.length))
    // Our OWN emitted tokens are not page content. Without this the wall re-flags what it just masked: an id
    // containing five digits reads as a ZIP, so every masked value would prompt again on the next scan.
    .replace(WALL_TOKEN_RE, (m) => ' '.repeat(m.length));
}
/** Scan a tool result. Offsets index the ORIGINAL text. */
export function wallScan(text, reserved = []) { return detectWallShapes(wallScanSurface(text), reserved); }

// DECISIONS live for the PROCESS lifetime, keyed by (source, normalized value). A different page asks again — a
// value approved on a test fixture must not silently pass out of a real record.
const WALL_DECISIONS = new Map();   // `${source} ${norm}` -> 'allow' | 'mask'   (source '*' = every source)
const WALL_TOKENS = new Map();      // token -> real value  (ephemeral: this process only, never persisted)
const WALL_BY_VALUE = new Map();    // real value -> token  (so one value gets one stable token)
let _wallSeq = 0;

// Fold separators + case so "555-012-3456" and "555 012 3456" are ONE decision, not two prompts.
export function wallNormalize(v) { return String(v == null ? '' : v).toLowerCase().replace(/[\s.‐-―-]/g, ''); }
/** The decision key for a browser source. The QUERY is dropped — it can itself carry PII (?ssn=...), so it is
 *  scanned as content but never used as a key or a label. */
export function wallSourceKey(label, url) {
  let u = String(url || '');
  try { const p = new URL(u); u = p.origin + p.pathname; } catch {}
  return `browser:${label || '?'}@${u}`;
}
export function wallDecision(source, value) {
  const n = wallNormalize(value);
  return WALL_DECISIONS.get(`* ${n}`) || WALL_DECISIONS.get(`${source} ${n}`) || null;
}
export function wallRemember(source, value, decision, allSources = false) {
  if (decision !== 'allow' && decision !== 'mask') throw new Error(`wall decision must be "allow" or "mask" (got ${JSON.stringify(decision)})`);
  WALL_DECISIONS.set(`${allSources ? '*' : source} ${wallNormalize(value)}`, decision);
}
// The token is deliberately UNLIKE the pii plugin's @@@()/###{} — a wall token must never be mistaken for a
// store-keyed one, or pii's unmask would try to resolve it and fail CLOSED on a value it has never heard of.
export function wallToken(value) {
  const v = String(value);
  let t = WALL_BY_VALUE.get(v);
  // UNGUESSABLE id, not a counter. With sequential ids, seeing one token (wall:2) hands you every other one
  // (wall:1) — and wallResolve would substitute the real value on the way back INTO the page. That is an
  // exfiltration primitive twice over: the agent can reach a value it was never shown, and a hostile PAGE can
  // print a token verbatim and have this plugin resolve it into real PII when that text is typed back.
  if (!t) { t = `⟦wall:${crypto.randomBytes(8).toString('hex')}⟧`; WALL_BY_VALUE.set(v, t); WALL_TOKENS.set(t, v); }
  return t;
}
/** Resolve wall tokens back to real values — used by this plugin's OWN type/fill, so a masked value can still be
 *  typed back into the page. No H2 filter participation: the wall owns both ends of the browser round-trip. */
export function wallResolve(text) {
  return String(text == null ? '' : text).replace(WALL_TOKEN_RE, (t) => (WALL_TOKENS.has(t) ? WALL_TOKENS.get(t) : t));
}
export function _wallReset() { WALL_DECISIONS.clear(); WALL_TOKENS.clear(); WALL_BY_VALUE.clear(); _wallSeq = 0; }

/**
 * Apply known decisions to a scanned result.
 * @returns {{text, pending:Array, masked:number, allowed:number}} `pending` = matches with NO recorded decision;
 *          the caller must ask about those and must NOT release `text` until it has (fail-closed).
 */
export function wallApply(text, matches, source) {
  const src = String(text == null ? '' : text);
  const pending = [];
  let masked = 0, allowed = 0;
  // Right-to-left so each splice leaves earlier offsets valid.
  const ordered = [...matches].sort((a, b) => b.start - a.start);
  let out = src;
  for (const m of ordered) {
    const d = wallDecision(source, m.value);
    if (!d) { pending.push(m); continue; }
    if (d === 'allow') { allowed++; continue; }
    out = out.slice(0, m.start) + wallToken(m.value) + out.slice(m.end);
    masked++;
  }
  pending.reverse();   // back to document order for display
  return { text: out, pending, masked, allowed };
}

// Widest excerpt shown per match. Minified content (a JSON body, a bundled script) is ONE enormous line, so an
// unbounded excerpt would put ~100KB per match into a payload that is broadcast over SSE and rendered in a modal.
const WALL_CTX_WIDTH = 160;   // chars kept either side of the match on the hit line
const clampLine = (l) => (l.length <= WALL_CTX_WIDTH * 2 ? l : l.slice(0, WALL_CTX_WIDTH * 2) + ' …');
/** A couple of lines above and below a match, for the review screen. Bounded on every axis. */
export function wallContext(text, match, lines = 2) {
  const src = String(text == null ? '' : text);
  const all = src.split('\n');
  let idx = 0, line = 0;
  for (; line < all.length; line++) { const end = idx + all[line].length + 1; if (match.start < end) break; idx = end; }
  const raw = all[line] ?? '';
  // WINDOW the hit line around the match, so a value at column 90000 is still readable rather than buried.
  const col = Math.max(0, match.start - idx);
  const from = Math.max(0, col - WALL_CTX_WIDTH);
  const to = Math.min(raw.length, col + (match.end - match.start) + WALL_CTX_WIDTH);
  const hit = (from > 0 ? '… ' : '') + raw.slice(from, to) + (to < raw.length ? ' …' : '');
  const lf = Math.max(0, line - lines), lt = Math.min(all.length - 1, line + lines);
  return { line: line + 1, before: all.slice(lf, line).map(clampLine), hit, after: all.slice(line + 1, lt + 1).map(clampLine) };
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
    } else if (method === 'Page.navigatedWithinDocument' && !params.frameId?.parentId) {
      // An SPA route change (History pushState) fires THIS, not frameNavigated, and does NOT reload the document.
      // Tracking it matters beyond the timeline: the PII wall keys its decision memory on the session + page URL,
      // so leaving s.url frozen at the first route makes per-source memory degrade to per-SESSION in exactly the
      // apps most likely to show real records — a value cleared on one route would then pass silently on every
      // other. The page runtime survives an in-document navigation, so it is NOT re-installed here.
      s.url = params.url || s.url;
      push(b.timeline, { t: now, kind: 'navigate', text: params.url + ' (in-document)' });
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
  const R = JSON.stringify(String(ref));
  const js = `(() => { const cb=window.__cb; const el=cb&&cb.refs.get(${R}); if(!el) return {error:'stale or unknown ref ' + ${R} + ' — take a fresh <browser_snapshot/> and use a current ref'}; if(!el.isConnected) return {error:'ref ' + ${R} + ' (' + cb.desc(el) + ') is no longer in the page — it was re-rendered or removed since the snapshot, so acting on it would hit a detached element nobody can see. Take a fresh <browser_snapshot/>'}; try { ${action} return {ok:true, el: cb.desc(el)}; } catch(e){ return {error: String(e && e.message || e)}; } })();`;
  const r = await evalIn(s, js);
  if (r && r.error) throw new Error(r.error);
  return r;
}

// ── real input (trusted events), not synthetic dispatch ─────────────────────────────────────────────────────────
// `el.click()` fires ONE untrusted `click` and nothing else: no pointerdown/mousedown/mouseup, no focus change,
// `isTrusted === false`. Real UIs miss it — anything driven by mousedown/pointerdown (menus, custom widgets, drag
// handles) or gated on isTrusted just sits there while the plugin cheerfully reports "clicked". So interaction goes
// through CDP Input instead, where Chrome synthesizes the SAME trusted event sequence a human's mouse produces.
const DESC_FN = `((el) => { const t = el.tagName.toLowerCase(); const id = el.id ? '#' + el.id : ''; const cls = (el.className && typeof el.className === 'string' && el.className.trim()) ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : ''; return t + id + cls; })`;

// Render ANY JS value as text the agent can read: undefined/null/functions/DOM nodes/Errors/cycles all get a
// legible form instead of vanishing (JSON.stringify) or collapsing to '{}'.
const DESCRIBE_FN = `((v) => {
  const seen = new WeakSet();
  const el = (x) => '<' + x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') + (x.className && typeof x.className === 'string' && x.className.trim() ? '.' + x.className.trim().split(/\\s+/).join('.') : '') + '>';
  const special = (x) => {
    if (typeof x === 'function') return '[Function ' + (x.name || 'anonymous') + ']';
    if (typeof x === 'symbol' || typeof x === 'bigint') return String(x);
    if (typeof Element !== 'undefined' && x instanceof Element) return el(x);
    if (typeof Node !== 'undefined' && x instanceof Node) return '[' + x.nodeName + ']';
    if (x instanceof Error) return x.stack || (x.name + ': ' + x.message);
    return null;
  };
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  const s0 = special(v);
  if (s0 !== null) return s0;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v, (k, val) => {
      if (val === undefined) return '[undefined]';
      const s1 = special(val);
      if (s1 !== null) return s1;
      if (val && typeof val === 'object') { if (seen.has(val)) return '[Circular]'; seen.add(val); }
      return val;
    }, 2);
  } catch (e) { return String(v); }
})`;

// Resolve a ref (or CSS selector) to the viewport point a real click would land on, and report what is actually
// painted there — an overlay swallowing the click is the classic "I clicked it and nothing happened".
async function pointFor(s, { ref, selector }) {
  const byRef = ref != null && ref !== '';
  const key = JSON.stringify(String(byRef ? ref : selector));
  const lookup = byRef
    ? `const cb = window.__cb; const el = cb && cb.refs.get(${key});`
    : `const el = document.querySelector(${key});`;
  const missing = byRef
    ? `stale or unknown ref ' + ${key} + ' — take a fresh <browser_snapshot/> and use a current ref`
    : `no element matches selector ' + ${key} + '`;
  const js = `(() => {
    const desc = ${DESC_FN};
    ${lookup}
    if (!el) return { error: '${missing}' };
    if (!el.isConnected) return { error: 'ref ' + ${key} + ' (' + desc(el) + ') is no longer in the page — it was re-rendered or removed since the snapshot. Take a fresh <browser_snapshot/>' };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return { error: ${key} + ' (' + desc(el) + ') has zero size on screen, so there is nothing to click — it is hidden, collapsed, or not laid out yet' };
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, desc: desc(el), disabled: !!el.disabled,
             blocked: (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) ? desc(hit) : null };
  })();`;
  const r = await evalIn(s, js);
  if (!r || r.error) throw new Error(r ? r.error : `could not resolve ${byRef ? 'ref' : 'selector'} ${key}`);
  return r;
}
async function dispatchClick(s, x, y) {
  await s.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 }, s.sessionId);
  await s.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }, s.sessionId);
  await s.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }, s.sessionId);
}
// Click to focus, select whatever is there, then insert the text as a REAL edit (trusted `input`, which is what
// controlled inputs in React/Vue/Angular actually listen for — assigning el.value does not reach them). The
// trailing `change` mirrors the blur a human would do next; the result reports the value that actually landed.
async function typeInto(s, ref, text) {
  const pt = await pointFor(s, { ref });
  await dispatchClick(s, pt.x, pt.y);
  await evalIn(s, `(() => { const el = document.activeElement; if (el && typeof el.select === 'function') el.select(); return true; })()`);
  // Resolve our OWN wall tokens here: a value the developer chose to MASK is still typeable back into the page,
  // because this plugin owns both ends of the round-trip (no H2 filter participation needed).
  await s.cdp.send('Input.insertText', { text: String(wallResolve(text)) }, s.sessionId);
  const value = await actByRef(s, ref, `el.dispatchEvent(new Event('change',{bubbles:true})); return {ok:true, el: cb.desc(el), value: (el.value != null ? String(el.value) : el.textContent || '')};`);
  return { desc: pt.desc, value: value?.value };
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
// ── the WALL gate: EVERY tool result passes through it ──────────────────────────────────────────────────────────
// Wrapped at the tool FACTORY, not per-verb, so a verb added later cannot forget the wall — the failure mode of a
// per-verb list is that the one new verb is the one that leaks.
// FAIL-CLOSED: a match with no recorded decision must be decided before the text is released. If no UI is reachable
// (no host, plugin unloading, the developer dismissed it) the tool call FAILS rather than returning unscanned text.
let WALL_ON = true;                       // always on for now (developer); flip here if a toggle is ever added.
export function _wallEnabled(v) { if (v !== undefined) WALL_ON = !!v; return WALL_ON; }

// An ERROR is a result too. A thrown message routes straight to the agent, and browser errors quote page content
// verbatim — a page exception ("lookup failed for 482-11-9037"), a select's real option values, an element
// descriptor built from an id. Those bypassed the gate entirely, because it only wrapped the RETURN path.
//
// Errors AUTO-MASK rather than prompt: a failure path is the wrong moment to open a modal, and a token keeps the
// message's diagnostic shape ("lookup failed for ⟦wall:…⟧"). Existing decisions still apply first, so a value the
// developer already allowed stays readable.
async function wallGateError(verb, args, message) {
  if (!WALL_ON) return message;
  const text = String(message == null ? '' : message);
  if (!text) return text;
  const label = args && args.label != null ? String(args.label) : '';
  const s = label ? SESSIONS.get(label) : null;
  const source = wallSourceKey(label, s ? s.url : '');
  const matches = wallScan(text);
  if (!matches.length) return text;
  const applied = wallApply(text, matches, source);
  let out = applied.text;
  for (const m of [...applied.pending].sort((a, b) => b.start - a.start)) out = out.slice(0, m.start) + wallToken(m.value) + out.slice(m.end);
  return out;
}

async function wallGate(verb, args, result) {
  if (!WALL_ON) return result;
  const raw = result && typeof result.content === 'string' ? result.content : null;
  if (!raw) return result;
  const label = args && args.label != null ? String(args.label) : '';
  const s = label ? SESSIONS.get(label) : null;
  const source = wallSourceKey(label, s ? s.url : '');

  // PRE-MASK FIRST. Another plugin may already protect some of this text (the pii test-data store knows real
  // values by heart). Letting the platform's content filters run BEFORE the wall means a known value leaves as
  // that plugin's STABLE token — the one the agent can reason about and round-trip through its tools — instead
  // of being re-discovered here as if it were unknown, prompting the developer about a value the system already
  // knew was protected. This asks the PLATFORM to run the filters it owns; it is not knowledge of any plugin.
  let content = raw;
  if (typeof HOST?.request === 'function') {
    try {
      const pre = await HOST.request('mask-content', { text: raw, hook: 'tool-result' });
      if (pre && typeof pre.text === 'string') content = pre.text;
    } catch (e) {
      // An older platform without this request type is fine — carry on with the raw text. A filter that FAILED
      // is not: the pipeline is fail-closed, so refuse rather than release text it could not mask.
      if (!/unknown host request type/i.test(String(e && e.message))) throw e;
    }
  }

  // Only prompt for values that are genuinely IN THE PAGE. Masking inserts tokens, and a token can carry digit
  // runs of its own (pii's fuzzy descriptor embeds a 16-hex id); a match that exists only in the masked copy is
  // an artefact of masking, not page content. No token syntax is hardcoded here — the test is "was it in the
  // original?", which stays true whatever another plugin's tokens look like.
  let matches = wallScan(content).filter((m) => raw.includes(m.value));
  if (!matches.length) return result.content === content ? result : { ...result, content };

  let applied = wallApply(content, matches, source);
  if (applied.pending.length) {
    // ONE card per DISTINCT value. A value repeated in a result is one question, not N — and asking N times
    // invited contradictory answers, of which only the LAST took effect, silently, for every occurrence.
    const seen = new Set();
    const distinct = applied.pending.filter((m) => { const k = wallNormalize(m.value); if (seen.has(k)) return false; seen.add(k); return true; });
    const decisions = await wallAsk(distinct, content, source, verb);
    // A missing/!== decision for ANY pending value is a refusal, not a pass.
    for (const m of distinct) {
      const d = decisions && decisions[wallNormalize(m.value)];
      if (d !== 'allow' && d !== 'mask') {
        throw new Error(`PII wall: ${distinct.length} value(s) in this ${verb} result were not cleared, so the result was WITHHELD rather than sent unscanned. Decide each match (allow or mask) and re-run.`);
      }
      wallRemember(source, m.value, d, !!(decisions.__all));
    }
    applied = wallApply(content, wallScan(content).filter((m) => raw.includes(m.value)), source);   // same artefact filter as above
    if (applied.pending.length) throw new Error('PII wall: matches remained undecided after review — result WITHHELD (fail-closed).');
  }
  return { ...result, content: applied.text };
}

/**
 * Ask the developer about pending matches. Returns { <normalizedValue>: 'allow'|'mask' } or null.
 *
 * The PLUGIN owns every word of this screen. The platform is handed a component tree and a generic
 * "blocking panel" request; it knows nothing about PII, what a match is, or what allow/mask mean — it renders,
 * collects the answers and hands them back. (A plugin cannot ship DOM into a CSP-locked page, so the core has to
 * do the rendering; PLUGIN-UI-PANEL-SPEC.md §1. Keeping the VOCABULARY here is what stops that being a leak of
 * this feature into the platform.)
 */
async function wallAsk(pending, text, source, verb) {
  if (typeof HOST?.request !== 'function') return null;
  const children = [
    { type: 'note', tone: 'muted',
      text: `${pending.length} value${pending.length === 1 ? '' : 's'} in a ${verb} result look like PII. `
        + 'Allow sends the real value to the model. Mask replaces it with a token — tools still receive the real value.' },
    { type: 'note', tone: 'muted', text: source },
  ];
  pending.forEach((m, i) => {
    const c = wallContext(text, m);
    const excerpt = [...(c.before || []), c.hit || '', ...(c.after || [])].join('\n');
    children.push({
      type: 'section', id: 'sec' + i, title: `${m.label}  —  ${m.value}`,
      children: [
        { type: 'note', mono: true, text: excerpt },
        { type: 'choice', id: 'm' + i, label: 'This value:', options: [{ value: 'mask', label: 'Mask' }, { value: 'allow', label: 'Allow' }] },
      ],
    });
  });
  try {
    const r = await HOST.request('ask-panel', {
      title: 'Possible PII — review before sending',
      tree: { type: 'stack', gap: 12, children },
      requireAll: true,            // every match must be decided; undecided is NOT allow
      submitLabel: 'Send',
      cancelLabel: 'Cancel (withhold)',
    });
    if (!r || !r.submitted || !r.values) return null;
    const out = {};
    pending.forEach((m, i) => { const v = r.values['m' + i]; if (v === 'allow' || v === 'mask') out[wallNormalize(m.value)] = v; });
    return out;
  } catch { return null; }   // dismissed / unloaded / unknown type -> the caller fails closed
}

const T = (verb, description, properties, required, impl) => ({ verb, name: verb,
  schema: { description, parameters: { type: 'object', properties: properties || {}, required: required || [] } },
  impl: async (a, ctx) => {
    let r;
    try { r = await impl(a, ctx); }
    catch (e) { const msg = await wallGateError(verb, a, e && e.message); const err = new Error(msg); err.cause = e; throw err; }
    return wallGate(verb, a, r);
  } });
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
        // Describe the value IN THE PAGE and hand back a string. JSON.stringify(undefined) is the VALUE undefined,
        // which used to clip to '' — so every eval of a void expression (a setter, a method call, a missing
        // property) came back as a blank result the agent could not read as anything at all. Functions and DOM
        // nodes stringified to a bare '{}', which is no better. Now every JS value has a legible rendering.
        const bind = a.ref ? `const $0 = window.__cb && window.__cb.refs.get(${JSON.stringify(String(a.ref))});` : '';
        const expr = `(async () => { ${bind} const __v = await (${a.js}); return ${DESCRIBE_FN}(__v); })()`;
        const out = await evalIn(s, expr);
        return ok(out === '' ? '(empty string)' : out);
      }),

    // ── interact (by ref) ──
    T('browser_click', 'Click an element by its [ref] (from the latest snapshot) or a CSS selector.', { label: { type: 'string' }, ref: { type: 'string' }, selector: { type: 'string' } }, ['label'],
      async (a) => {
        const s = getSession(a.label);
        if (!a.ref && !a.selector) throw new Error('browser_click needs a ref (from the latest <browser_snapshot/>) or a CSS selector — got neither.');
        s.lastAction = `click ${a.ref || a.selector}`;
        const pt = await pointFor(s, { ref: a.ref, selector: a.selector });
        await dispatchClick(s, pt.x, pt.y);
        await sleep(100); await drainDom(s);
        if (pt.disabled) return ok(`clicked ${pt.desc}, but it is DISABLED — the page will ignore the click. Nothing happened.`);
        if (pt.blocked) return ok(`clicked at the centre of ${pt.desc}, but ${pt.blocked} is painted on top there and received the click instead. Dismiss/scroll past it, or target ${pt.blocked}.`);
        return ok(`clicked ${pt.desc}.`);
      }),
    T('browser_hover', 'Hover an element (triggers hover-only UI: tooltips, dropdowns).', { label: { type: 'string' }, ref: { type: 'string' } }, ['label', 'ref'],
      async (a) => { const s = getSession(a.label); s.lastAction = `hover ${a.ref}`; const pt = await pointFor(s, { ref: a.ref }); await s.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y, buttons: 0 }, s.sessionId); await sleep(100); await drainDom(s); return ok(`hovered ${pt.desc}.`); }),
    T('browser_type', 'Type text into an input by ref, as REAL keystrokes (trusted input events, so controlled React/Vue fields update). Returns the value that actually landed.', { label: { type: 'string' }, ref: { type: 'string' }, text: { type: 'string' } }, ['label', 'ref', 'text'],
      async (a) => { const s = getSession(a.label); s.lastAction = `type ${a.ref}`; const r = await typeInto(s, a.ref, a.text); await drainDom(s); return ok(`typed into ${r.desc} — its value is now ${JSON.stringify(r.value ?? '')}.`); }),
    T('browser_fill', 'Fill many inputs in one call: a map of ref → value. Same real keystrokes as browser_type.', { label: { type: 'string' }, fields: { type: 'object', description: '{ "e5": "value", ... }' } }, ['label', 'fields'],
      async (a) => {
        const s = getSession(a.label); s.lastAction = 'fill form';
        const done = [];
        for (const [ref, val] of Object.entries(a.fields || {})) { const r = await typeInto(s, ref, String(val)); done.push(`${r.desc}=${JSON.stringify(r.value ?? '')}`); }
        await drainDom(s);
        return ok(done.length ? `filled ${done.length} field(s): ${done.join(', ')}` : 'no fields given.');
      }),
    T('browser_select', 'Choose an option in a <select> by ref.', { label: { type: 'string' }, ref: { type: 'string' }, value: { type: 'string' } }, ['label', 'ref', 'value'],
      async (a) => { const s = getSession(a.label); s.lastAction = `select ${a.ref}`; a = { ...a, value: wallResolve(a.value) };   // a MASKED option value is still selectable
        const r = await actByRef(s, a.ref, `el.value=${JSON.stringify(a.value)}; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); if (el.value !== ${JSON.stringify(a.value)}) return {error: 'no option with value ' + ${JSON.stringify(JSON.stringify(a.value))} + ' in ' + cb.desc(el) + ' — options are: ' + [...el.options].map((o) => JSON.stringify(o.value)).join(', ')};`); await drainDom(s); return ok(`selected ${JSON.stringify(a.value)} in ${r.el}.`); }),
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
