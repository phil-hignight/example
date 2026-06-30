# Browser Testing Plugin — Implementation Spec

> A Puppeteer-style headless-Chrome controller, built from scratch on Chrome
> DevTools Protocol (CDP), designed to be driven by a coding agent in a
> restricted, offline environment.

---

## 0. Read this first (context for the implementing agent)

You are going to build this in **small, individually testable iterations**. Do
**not** skip ahead. After each iteration there is a **VERIFY** block with a
literal command to run, the **exact expected output**, and a
**TROUBLESHOOT** block explaining what a failure means. Do not start the next
iteration until the current VERIFY passes.

You have **no internet access**. Everything you need is described here. Do not
try to `npm install` anything except what Section 1 lists (which is already
present). Do not look anything up.

If something does not behave as this spec says, **trust the VERIFY output over
your assumptions** and use the TROUBLESHOOT notes. The most common cause of
trouble is a timing issue (acting before Chrome is ready) — the spec handles
this explicitly, so follow it exactly.

### What we are building, in one paragraph

A long-lived JavaScript module (`BrowserPlugin`) that the agent imports. It
launches and manages multiple headless Chrome instances by talking to each one
over a WebSocket using the Chrome DevTools Protocol. The agent calls plain
async functions on it: spawn a browser, navigate it, run JS in it, query the
DOM, destroy it, and read what happened (console logs, JS errors, network
traffic, DOM snapshots). Everything observable is also **appended to a
per-session JSONL event log** so the agent's background/regex/interval tooling
can watch for things.

### Key environment facts (locked decisions)

- **Runtime:** Node.js 20. WebSocket comes from the **`ws` package** (already
  installed). Import it: `import { WebSocket } from 'ws';`
- **Chrome:** launchable as a bare shell command (no path needed). We try
  `google-chrome`, then `google-chrome-stable`, then `chromium`,
  then `chromium-browser`, in that order.
- **No screenshots.** The driving LLM cannot read images. We never capture
  images. DOM is captured as HTML text.
- **The plugin is a module, not a server.** No HTTP, no separate process, no
  CLI. The agent imports it and calls functions in the same Node process.
- **Sensing model:** The plugin appends event lines to an in-memory ring buffer
  (with a monotonic cursor) AND to a `timeline.jsonl` file on disk. Two
  consumption paths:
  - **Regex/live:** the agent registers `onOutput(handler)`. Every appended
    line is passed to the handler synchronously. The agent's own tool layer
    runs the regex and decides whether to wake.
  - **Interval/poll:** the agent calls `readSince(sessionId, cursor)` and gets
    `{ lines, nextCursor }` — only what's new since that cursor.
- **Network bodies** are always written to disk (one metadata file + one body
  file per request). Function returns never inline a body; they return paths.
- **DOM mutations** are captured by default, debounced into **settle-point
  snapshots**: when the DOM stops changing and the network goes quiet for
  ~500ms, we write a labeled HTML snapshot plus a short diff summary vs the
  previous snapshot.

---

## 1. Project layout & dependencies

```
browser-plugin/
  package.json          # type: module, node >=20
  src/
    index.js            # exports BrowserPlugin  (public surface)
    cdp.js              # CDPConnection: one WebSocket per browser
    session.js          # Session: state + event log + handlers for one Chrome
    launcher.js         # finds & spawns Chrome, returns ws endpoint
    eventlog.js         # ring buffer + cursor + JSONL file writer
    diff.js             # tiny DOM-snapshot diff summarizer
  sessions/             # created at runtime; one subdir per session
    <sessionId>/
      timeline.jsonl
      network/
        <reqId>.meta.json
        <reqId>.body.<ext>
      dom/
        <n>-<label>.html
  test/
    fixture.html        # static page we serve for self-tests (Iteration 2)
    run.js              # the manual test harness used by VERIFY blocks
```

**Dependencies:** only `ws` (already installed). Nothing else.

`package.json`:

```json
{
  "name": "browser-plugin",
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=20" },
  "dependencies": { "ws": "*" }
}
```

> **Why `type: module`:** we use `import`/`export` throughout. If you see
> `Cannot use import statement outside a module`, this field is missing.

---

## 2. The CDP mental model (read once, refer back)

Chrome, launched with `--remote-debugging-port=0`, prints a line to **stderr**
like:

```
DevTools listening on ws://127.0.0.1:PORT/devtools/browser/<guid>
```

That `ws://` URL is the **browser-level** WebSocket. Over it you send JSON
messages and get JSON replies. Two message shapes:

- **Command** (you → Chrome): `{ "id": 1, "method": "Target.createTarget", "params": {...} }`
  Chrome replies with `{ "id": 1, "result": {...} }` or `{ "id": 1, "error": {...} }`.
  Match replies to commands by the `id` you chose.
- **Event** (Chrome → you, unsolicited): `{ "method": "Network.requestWillBeSent", "params": {...} }`
  No `id`. These are how we learn about console logs, network, navigation, etc.

A **target** is roughly a tab/page. To control a page you create a target, then
**attach** to it, which gives you a `sessionId`. After that, page-level commands
must carry that CDP `sessionId` field so Chrome routes them to the right tab.

> ⚠️ **Two different "session" words.** Chrome has a *CDP sessionId* (per
> attached target). Our plugin has its *own* sessionId (per Chrome instance we
> manage). They are NOT the same. In code, name them `cdpSessionId` and
> `sessionId` respectively. Do not mix them up — this is the single most likely
> source of confusion in this whole project.

We use the **flat protocol**: attach with `flatten: true`, and put the
`cdpSessionId` as a top-level field on each command (not nested). This avoids
the older nested `Target.sendMessageToTarget` wrapping.

Domains we use (enable each once per attached page before its events flow):
`Page`, `Runtime`, `Network`, `DOM`, `Log`.

---

## ITERATION 1 — CDP connection primitive

**Goal:** a `CDPConnection` class wrapping one WebSocket: send a command and
await its reply; dispatch events to listeners. No Chrome yet — we test it
against a fake in-process WebSocket server so the primitive is proven in
isolation.

### Build

`src/cdp.js`:

- `class CDPConnection`
  - `constructor(wsUrl)` — stores url; does not connect yet.
  - `async connect()` — opens the `WebSocket`, resolves on `open`, rejects on
    `error` before open. Attaches a `message` handler.
  - `send(method, params = {}, cdpSessionId = undefined)` — returns a Promise.
    - Increment `this._nextId` (start at 1). Build `msg = { id, method, params }`.
    - If `cdpSessionId`, set `msg.sessionId = cdpSessionId` (flat protocol).
    - Store `{ resolve, reject }` in `this._pending.set(id, ...)`.
    - `this._ws.send(JSON.stringify(msg))`.
  - `message` handler: parse JSON.
    - If it has an `id` and we have a pending entry: if `error`, reject with an
      `Error(error.message)`; else resolve with `result`. Delete the pending
      entry.
    - If it has no `id` (event): call every listener registered for
      `msg.method`, and every "any-event" listener, with `(msg.params, msg.sessionId)`.
  - `on(method, fn)` — register an event listener. `onAny(fn)` — every event.
  - `async close()` — close the socket; reject all still-pending with an
    `Error('connection closed')`.
  - Add a **timeout**: if a command gets no reply in 30s, reject with
    `Error('CDP timeout: ' + method)`. (Use a per-command `setTimeout`, cleared
    on reply.)

### VERIFY 1

Create `test/cdp.verify.js`:

```js
import { WebSocketServer } from 'ws';
import { CDPConnection } from '../src/cdp.js';

const wss = new WebSocketServer({ port: 0 });
const port = await new Promise(r => wss.on('listening', () => r(wss.address().port)));

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    // Echo a result for any command, then emit one fake event.
    ws.send(JSON.stringify({ id: m.id, result: { echoed: m.method } }));
    ws.send(JSON.stringify({ method: 'Fake.event', params: { hi: true } }));
  });
});

const conn = new CDPConnection(`ws://127.0.0.1:${port}`);
await conn.connect();

let gotEvent = false;
conn.on('Fake.event', (p) => { gotEvent = p.hi === true; });

const res = await conn.send('Test.method', { a: 1 });
await new Promise(r => setTimeout(r, 50)); // let event arrive

console.log('RESULT', JSON.stringify(res));
console.log('EVENT', gotEvent);
await conn.close();
wss.close();
process.exit(0);
```

Run:

```
node test/cdp.verify.js
```

**Expected output (exactly):**

```
RESULT {"echoed":"Test.method"}
EVENT true
```

**TROUBLESHOOT 1**
- `RESULT undefined` → your `send` isn't resolving with `result`. Check that the
  message handler matches `m.id` against `this._pending` and resolves with
  `parsed.result`.
- `EVENT false` → events (no `id`) aren't being dispatched. Make sure the
  handler branches on "has `id`" vs "no `id`", and that `on()` stores listeners
  keyed by method.
- Hangs forever → the `open` event isn't resolving `connect()`, or you sent
  before the socket opened. Ensure `connect()` awaits `open`.
- `Cannot use import statement` → add `"type": "module"` to `package.json`.

---

## ITERATION 2 — Launch Chrome and connect to it

**Goal:** find Chrome, launch it headless with a debugging port, parse the
`ws://` endpoint from stderr, and connect a `CDPConnection` to it. Prove it by
asking the real browser for its version.

### Build

`src/launcher.js`:

- `const CANDIDATES = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];`
- `async function launchChrome({ userDataDir }) {`
  - Flags (array):
    ```
    --headless=new
    --remote-debugging-port=0
    --user-data-dir=<userDataDir>
    --no-first-run
    --no-default-browser-check
    --disable-gpu
    --disable-dev-shm-usage
    --no-sandbox
    ```
    > `--remote-debugging-port=0` = pick a free port. `--disable-dev-shm-usage`
    > and `--no-sandbox` matter in restricted/containerized environments;
    > without them Chrome may crash on start.
  - Try each candidate in order with `child_process.spawn(cmd, flags)`. If spawn
    emits `error` with `ENOENT`, try the next candidate. If all fail, throw
    `Error('No Chrome binary found. Tried: ' + CANDIDATES.join(', '))`.
  - **Parse the ws endpoint from stderr.** Accumulate `child.stderr` data; when
    a line matches `/^DevTools listening on (ws:\/\/.*)$/m`, resolve with
    `{ child, wsUrl }`. Apply a 15s timeout → reject
    `Error('Chrome did not report a DevTools endpoint in time')`.
  - Keep a stderr buffer (last ~50 lines) and attach it to any rejection so the
    agent can see Chrome's complaint.

`test/fixture.html` — a tiny self-contained page we control (no network needed):

```html
<!doctype html>
<html>
<head><title>Fixture</title></head>
<body>
  <h1 id="title">Hello Fixture</h1>
  <button id="go" onclick="onGo()">Go</button>
  <div id="out"></div>
  <script>
    console.log('fixture-loaded');
    function onGo() {
      console.log('go-clicked');
      const d = document.getElementById('out');
      d.textContent = 'clicked';
      fetch('/api/ping').then(r => r.json()).then(j => {
        console.log('ping-result', JSON.stringify(j));
      }).catch(e => console.error('ping-failed', String(e)));
    }
  </script>
</body>
</html>
```

> We serve this from a tiny Node `http` server inside the test harness (next
> iteration). For now we only need Chrome to start.

### VERIFY 2

`test/launch.verify.js`:

```js
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChrome } from '../src/launcher.js';
import { CDPConnection } from '../src/cdp.js';

const dir = mkdtempSync(join(tmpdir(), 'bp-'));
const { child, wsUrl } = await launchChrome({ userDataDir: dir });
console.log('WS_OK', wsUrl.startsWith('ws://'));

const conn = new CDPConnection(wsUrl);
await conn.connect();
const v = await conn.send('Browser.getVersion');
console.log('HAS_PRODUCT', typeof v.product === 'string' && v.product.length > 0);

await conn.close();
child.kill();
process.exit(0);
```

Run:

```
node test/launch.verify.js
```

**Expected output:**

```
WS_OK true
HAS_PRODUCT true
```

**TROUBLESHOOT 2**
- `No Chrome binary found` → none of the candidate commands exist on PATH. Run
  `which google-chrome chromium chromium-browser` to see what's actually
  available, and add that name to `CANDIDATES`.
- Rejects with a stderr buffer mentioning `Running as root` or sandbox → confirm
  `--no-sandbox` is present.
- Rejects mentioning `/dev/shm` or `Out of memory` → confirm
  `--disable-dev-shm-usage` is present.
- `Chrome did not report a DevTools endpoint` but Chrome seems to run → the
  regex is matching the wrong stream. The endpoint is on **stderr**, not stdout.
- `WS_OK true` then a hang on `Browser.getVersion` → you connected to the URL
  but the socket isn't actually open before `send`; ensure `connect()` resolves
  on `open`.

---

## ITERATION 3 — Event log (ring buffer + cursor + JSONL file)

**Goal:** the sensing backbone. Append events; read since a cursor; persist to
`timeline.jsonl`; notify live handlers.

### Build

`src/eventlog.js`:

- `class EventLog`
  - `constructor({ dir, maxBuffer = 5000 })` — ensure `dir` exists; open (create)
    `dir/timeline.jsonl` for appending. `this._buf = []`, `this._cursor = 0`,
    `this._handlers = []`.
  - `append(type, data)`:
    - `const line = { seq: ++this._cursor, t: Date.now(), type, ...data };`
    - push to `_buf`; if over `maxBuffer`, drop oldest (but keep `seq` monotonic).
    - append `JSON.stringify(line) + '\n'` to the file (use an append stream).
    - call every handler with `line` inside a `try/catch` (a throwing handler
      must not break logging).
    - return `line`.
  - `readSince(cursor = 0)` → `{ lines: _buf.filter(l => l.seq > cursor),
    nextCursor: this._cursor }`.
  - `onOutput(fn)` → push to `_handlers`; return an unsubscribe function.
  - `close()` → end the file stream.

> **Event line shape** (stable contract the agent relies on). Every line has
> `seq`, `t` (epoch ms), `type`. Then type-specific fields. Types we emit:
> `console`, `exception`, `lifecycle`, `network.request`, `network.response`,
> `network.failed`, `dom.settle`, `plugin` (plugin-level notices like
> "session destroyed").

### VERIFY 3

`test/eventlog.verify.js`:

```js
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventLog } from '../src/eventlog.js';

const dir = mkdtempSync(join(tmpdir(), 'el-'));
const log = new EventLog({ dir });

const seen = [];
const off = log.onOutput(l => seen.push(l.type));

log.append('console', { text: 'a' });
log.append('console', { text: 'b' });
const mid = log.readSince(0).nextCursor;
log.append('exception', { text: 'boom' });

const delta = log.readSince(mid);
console.log('DELTA_TYPES', delta.lines.map(l => l.type).join(','));
console.log('DELTA_CURSOR', delta.nextCursor);
console.log('HANDLER_SAW', seen.join(','));

off();
log.append('console', { text: 'c' });
console.log('AFTER_OFF', seen.join(',')); // unchanged

const fileLines = readFileSync(join(dir, 'timeline.jsonl'), 'utf8').trim().split('\n');
console.log('FILE_COUNT', fileLines.length);
log.close();
process.exit(0);
```

Run:

```
node test/eventlog.verify.js
```

**Expected output:**

```
DELTA_TYPES exception
DELTA_CURSOR 3
HANDLER_SAW console,console,exception
AFTER_OFF console,console,exception
FILE_COUNT 4
```

**TROUBLESHOOT 3**
- `DELTA_TYPES` shows console lines too → `readSince` is using `>=` not `>`, or
  cursor isn't captured correctly. Use strictly `l.seq > cursor`.
- `DELTA_CURSOR` wrong → `_cursor` isn't a monotonic counter; it must only ever
  increase by 1 per append.
- `AFTER_OFF` changed → `onOutput` isn't returning a working unsubscribe.
- `FILE_COUNT` not 4 → the append stream is buffering and not flushed, or you
  wrote arrays not lines. Each append = exactly one `\n`-terminated JSON line.
  (4 because all four appends hit the file; the `off()` only stops the handler,
  not the file.)

---

## ITERATION 4 — Session: attach to a page, wire core events

**Goal:** wrap one Chrome instance as a `Session`: create+attach a page target,
enable domains, and route console/exception/lifecycle CDP events into the
`EventLog`. This is where `navigate`, `eval`, `query`, console, and errors come
to life. (Network and DOM-settle come in 5 and 6.)

### Build

`src/session.js`:

- `class Session`
  - `constructor({ id, conn, child, dir })` — `conn` is the browser-level
    `CDPConnection`; `dir` is `sessions/<id>`. Create `new EventLog({ dir })`.
    `this.state = 'starting'`. `this.currentUrl = null`.
  - `async init()`:
    1. `const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank' });`
       store it.
    2. `const { sessionId: cdpSessionId } = await conn.send('Target.attachToTarget',
       { targetId, flatten: true });` — store as `this.cdpSessionId`.
    3. Enable domains (each carries `this.cdpSessionId`):
       `Page.enable`, `Runtime.enable`, `Log.enable`, `DOM.enable`.
       (Network in Iteration 5.)
    4. Register event listeners on `conn` — but **filter by `cdpSessionId`** (the
       second arg to the listener). Events from other sessions must be ignored.
       - `Runtime.consoleAPICalled` → append `console`:
         `{ level: p.type, text: p.args.map(argToString).join(' ') }`.
       - `Runtime.exceptionThrown` → append `exception`:
         `{ text: p.exceptionDetails.exception?.description
                 || p.exceptionDetails.text }`.
       - `Log.entryAdded` → append `console` with `{ level: p.entry.level,
         text: p.entry.text, source: p.entry.source }` (covers network/security
         warnings console-API misses).
       - `Page.frameNavigated` (main frame only: `!p.frame.parentId`) → set
         `currentUrl = p.frame.url`; append `lifecycle` `{ event: 'navigated',
         url: p.frame.url }`.
       - `Page.loadEventFired` → set `state='idle'`; append `lifecycle`
         `{ event: 'load' }`.
       - `Page.frameStartedLoading` → set `state='loading'`; append `lifecycle`
         `{ event: 'loading' }`.
    5. set `this.state = 'idle'`.
  - `argToString(remoteObject)` helper: prefer `.value` (stringify if object);
    fall back to `.description`; fall back to `.type`. This is how console args
    become text. Keep it small and defensive.
  - `async navigate(url)`:
    - `this.state = 'loading'`.
    - `await conn.send('Page.navigate', { url }, this.cdpSessionId)`.
    - Returns immediately; the load event flips state back to idle. (We add a
      proper `waitForIdle` in Iteration 6.)
  - `async evaluate(expression)`:
    - `const r = await conn.send('Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise: true }, this.cdpSessionId);`
    - If `r.exceptionDetails`, return
      `{ ok: false, error: r.exceptionDetails.exception?.description
         || r.exceptionDetails.text }`.
    - Else return `{ ok: true, value: r.result.value }`.
  - `async query(selector)`:
    - Evaluate, in-page, a small function that finds all matches and returns
      `{ count, html }` where `html` is the `outerHTML` of the first match
      (or `null`). Implementation: build an expression string:
      ```js
      const expr = `(() => {
        const els = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
        return { count: els.length, html: els[0] ? els[0].outerHTML : null };
      })()`;
      ```
      then `return (await this.evaluate(expr)).value`.
  - `async destroy()`:
    - `await conn.send('Target.closeTarget', { targetId: this.targetId })`
      (ignore errors). `this.eventLog.append('plugin', { event: 'destroyed' })`.
    - `this.eventLog.close()`. `this.state = 'destroyed'`.
  - Expose `status()` → `{ id, state, currentUrl }`.
  - Expose `readSince`, `onOutput` by delegating to `this.eventLog`.

### VERIFY 4

We need the fixture served. `test/server.js`:

```js
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));

export function startFixtureServer() {
  const html = readFileSync(join(__dirname, 'fixture.html'), 'utf8');
  const server = createServer((req, res) => {
    if (req.url === '/' || req.url.startsWith('/index')) {
      res.setHeader('content-type', 'text/html'); res.end(html);
    } else if (req.url === '/api/ping') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ pong: true, ts: 1 }));
    } else { res.statusCode = 404; res.end('nope'); }
  });
  return new Promise(r => server.listen(0, () => r({ server, port: server.address().port })));
}
```

`test/session.verify.js`:

```js
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChrome } from '../src/launcher.js';
import { CDPConnection } from '../src/cdp.js';
import { Session } from '../src/session.js';
import { startFixtureServer } from './server.js';

const { server, port } = await startFixtureServer();
const dir = mkdtempSync(join(tmpdir(), 'bp-'));
const { child, wsUrl } = await launchChrome({ userDataDir: dir });
const conn = new CDPConnection(wsUrl); await conn.connect();

const s = new Session({ id: 's1', conn, child, dir: join(dir, 's1') });
await s.init();
await s.navigate(`http://127.0.0.1:${port}/`);
await new Promise(r => setTimeout(r, 800)); // allow load + console

console.log('URL_OK', s.status().currentUrl.includes(`:${port}`));

const title = await s.evaluate('document.getElementById("title").textContent');
console.log('TITLE', JSON.stringify(title.value));

const q = await s.query('#go');
console.log('QUERY_COUNT', q.count, 'HAS_HTML', q.html.includes('Go'));

const bad = await s.evaluate('document.nope.nope()');
console.log('EVAL_ERR', bad.ok === false);

const lines = s.readSince(0).lines.map(l => l.type + (l.text ? ':' + l.text : ''));
console.log('SAW_FIXTURE_LOG', lines.some(x => x.includes('fixture-loaded')));

await s.destroy(); await conn.close(); child.kill(); server.close();
process.exit(0);
```

Run:

```
node test/session.verify.js
```

**Expected output:**

```
URL_OK true
TITLE "Hello Fixture"
QUERY_COUNT 1 HAS_HTML true
EVAL_ERR true
SAW_FIXTURE_LOG true
```

**TROUBLESHOOT 4**
- `TITLE ""` or null → you evaluated before load finished; increase the wait, or
  confirm `awaitPromise`/`returnByValue` are set on `Runtime.evaluate`.
- Events from the page never appear (`SAW_FIXTURE_LOG false`) → most likely the
  **cdpSessionId filter is wrong**: either you didn't pass `flatten: true`, or
  your listener isn't receiving/comparing the event's `sessionId`. Log the raw
  second arg in one listener to confirm it equals `this.cdpSessionId`.
- Nothing works and `Target.attachToTarget` returned no `sessionId` → you're not
  reading `result.sessionId`; remember this is the **CDP** sessionId.
- `EVAL_ERR false` → you're not checking `r.exceptionDetails`; a thrown in-page
  error still returns HTTP-OK from CDP, the error is in that field.
- Console text is `[object Object]` → improve `argToString` to `JSON.stringify`
  object `.value`s.

---

## ITERATION 5 — Network capture to disk

**Goal:** record every request: metadata file always; body file for text/JSON
content types; emit `network.request` / `network.response` / `network.failed`
events (with file paths, never inline bodies).

### Build

In `Session.init()` add `Network.enable` (with `cdpSessionId`) and listeners
(all filtered by `cdpSessionId`). Maintain `this._net = new Map()` keyed by CDP
`requestId`.

- `Network.requestWillBeSent` (p): record
  `{ requestId: p.requestId, url: p.request.url, method: p.request.method,
     reqHeaders: p.request.headers, startedAt: Date.now() }` in `_net`.
  Append `network.request` `{ requestId, url, method }`.
- `Network.responseReceived` (p): merge into `_net` entry
  `{ status: p.response.status, respHeaders: p.response.headers,
     mimeType: p.response.mimeType }`.
- `Network.loadingFinished` (p): the body is now fetchable.
  1. Read entry from `_net`. Write
     `sessions/<id>/network/<safeReqId>.meta.json` =
     `{ url, method, status, mimeType, reqHeaders, respHeaders }` (pretty).
  2. If `mimeType` matches `/(json|text|html|javascript|xml|csv)/i`:
     `const { body, base64Encoded } = await conn.send('Network.getResponseBody',
        { requestId }, this.cdpSessionId);`
     decode if `base64Encoded`, choose extension from mimeType
     (`json→json, html→html, else txt`), write
     `network/<safeReqId>.body.<ext>`. Set `bodyPath`.
     Wrap in try/catch — some requests have no retrievable body; on failure
     leave `bodyPath: null`.
  3. Append `network.response`
     `{ requestId, url, status, mimeType, metaPath, bodyPath }`.
- `Network.loadingFailed` (p): append `network.failed`
  `{ requestId, url: _net.get(requestId)?.url, error: p.errorText }`.
- `safeReqId` = `requestId.replace(/[^\w.-]/g, '_')`.

> **Why fetch the body at `loadingFinished` not `responseReceived`:** the body
> isn't guaranteed available until loading finishes. Fetching too early returns
> "No resource with given identifier".

### VERIFY 5

`test/network.verify.js` (reuses server + a session; clicks the button which
does `fetch('/api/ping')`):

```js
import { mkdtempSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChrome } from '../src/launcher.js';
import { CDPConnection } from '../src/cdp.js';
import { Session } from '../src/session.js';
import { startFixtureServer } from './server.js';

const { server, port } = await startFixtureServer();
const dir = mkdtempSync(join(tmpdir(), 'bp-'));
const { child, wsUrl } = await launchChrome({ userDataDir: dir });
const conn = new CDPConnection(wsUrl); await conn.connect();
const s = new Session({ id: 's1', conn, child, dir: join(dir, 's1') });
await s.init();
await s.navigate(`http://127.0.0.1:${port}/`);
await new Promise(r => setTimeout(r, 600));
await s.evaluate('onGo()');                 // triggers fetch('/api/ping')
await new Promise(r => setTimeout(r, 800)); // allow fetch + body write

const netDir = join(dir, 's1', 'network');
const files = readdirSync(netDir);
console.log('HAS_META', files.some(f => f.endsWith('.meta.json')));
const pingBody = files.find(f => f.endsWith('.json') && f.includes('body'));
console.log('HAS_BODY', !!pingBody);
if (pingBody) {
  const j = JSON.parse(readFileSync(join(netDir, pingBody), 'utf8'));
  console.log('BODY_PONG', j.pong === true);
}
const evs = s.readSince(0).lines.filter(l => l.type === 'network.response');
console.log('HAS_PING_EVENT', evs.some(e => e.url.includes('/api/ping')));

await s.destroy(); await conn.close(); child.kill(); server.close();
process.exit(0);
```

Run:

```
node test/network.verify.js
```

**Expected output:**

```
HAS_META true
HAS_BODY true
BODY_PONG true
HAS_PING_EVENT true
```

**TROUBLESHOOT 5**
- `HAS_BODY false` but `HAS_META true` → either the mime regex didn't match
  `application/json`, or you fetched the body too early. Confirm the body fetch
  is in the `loadingFinished` handler.
- `getResponseBody` throws "No resource with given identifier" → same: move it to
  `loadingFinished`, and make sure you pass `cdpSessionId`.
- No network events at all → `Network.enable` wasn't sent, or wasn't sent with
  `cdpSessionId`.
- Body file is gibberish → it was base64 and you didn't decode. Honor
  `base64Encoded` with `Buffer.from(body, 'base64')`.

---

## ITERATION 6 — DOM settle snapshots + diff summary + waitForIdle

**Goal:** detect when activity quiesces, snapshot the DOM to a labeled HTML
file, summarize what changed vs the previous snapshot, and give the agent a
`waitForIdle()` it can await.

### Build

**Idle definition:** no `network.request` without a matching
response/failure (track an in-flight counter) AND no DOM mutation, for a
continuous `quietMs = 500`.

In `Session`:
- Maintain `this._inflight = 0` (increment on `network.request`, decrement on
  `network.response`/`network.failed`).
- Inject a `MutationObserver` after each navigation (on `Page.loadEventFired`,
  and once in `init`). The injected script posts a signal we can observe.
  Simplest robust approach without bindings: have the observer set a
  monotonically increasing `window.__bpMutationCount`. We **poll** it from Node
  inside the idle loop rather than wiring CDP bindings (simpler, fewer moving
  parts, and our volume is low).

  Inject via `Runtime.evaluate`:
  ```js
  const INJECT = `(() => {
    if (window.__bpInstalled) return;
    window.__bpInstalled = true;
    window.__bpMutationCount = 0;
    const mo = new MutationObserver(() => { window.__bpMutationCount++; });
    mo.observe(document.documentElement, { subtree:true, childList:true, attributes:true, characterData:true });
  })()`;
  ```

- `async waitForIdle({ quietMs = 500, timeoutMs = 10000 } = {})`:
  - Loop polling every 100ms. Read current mutation count via
    `evaluate('window.__bpMutationCount')`. Track `lastChange = now` whenever the
    count changes OR `_inflight > 0`. When `now - lastChange >= quietMs`, resolve.
    If total elapsed > `timeoutMs`, resolve anyway (don't throw — agent prefers a
    best-effort settle) and append a `lifecycle` `{ event: 'idle-timeout' }`.
  - On resolve, call `this._snapshot()`.
- `async _snapshot(label = 'settle')`:
  - `const html = (await this.evaluate('document.documentElement.outerHTML')).value;`
  - `this._snapN = (this._snapN || 0) + 1;`
  - write `sessions/<id>/dom/<n>-<label>.html`.
  - compute summary vs previous snapshot using `diff.js`; append `dom.settle`
    `{ n, label, path, summary }`.
  - store `this._lastHtml = html`.

`src/diff.js` — `summarize(prevHtml, nextHtml)`:
- Keep it cheap and text-based (no DOM parse needed):
  - If `prevHtml == null` → `'initial snapshot'`.
  - Compare lengths and a few coarse signals: number of `<` tag-opens
    (`(html.match(/</g)||[]).length`) as a proxy for node count; report delta:
    `'~+N tags'` / `'~-N tags'` / `'no tag-count change'`.
  - Also detect added/removed `id="..."` values (regex all ids in each, set
    difference) and list up to 5 added and 5 removed ids.
  - Return a short string like:
    `'~+4 tags; +ids: out; -ids: (none)'`.
- This is intentionally a *summary*, not a real tree diff. The agent reads the
  actual HTML files when it needs detail.

Call `waitForIdle()` inside `navigate` automatically? **No** — keep `navigate`
non-blocking as specced, but make `waitForIdle` available so the agent composes
`navigate` + `waitForIdle`. (Document this in the public API.)

### VERIFY 6

`test/dom.verify.js`:

```js
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChrome } from '../src/launcher.js';
import { CDPConnection } from '../src/cdp.js';
import { Session } from '../src/session.js';
import { startFixtureServer } from './server.js';

const { server, port } = await startFixtureServer();
const dir = mkdtempSync(join(tmpdir(), 'bp-'));
const { child, wsUrl } = await launchChrome({ userDataDir: dir });
const conn = new CDPConnection(wsUrl); await conn.connect();
const s = new Session({ id: 's1', conn, child, dir: join(dir, 's1') });
await s.init();
await s.navigate(`http://127.0.0.1:${port}/`);
await s.waitForIdle();                 // settle #1 (page loaded)
await s.evaluate('onGo()');            // mutates #out, fires fetch
await s.waitForIdle();                 // settle #2 (after click)

const domDir = join(dir, 's1', 'dom');
const snaps = readdirSync(domDir).sort();
console.log('SNAP_COUNT_GTE_2', snaps.length >= 2);
const last = readFileSync(join(domDir, snaps[snaps.length - 1]), 'utf8');
console.log('LAST_HAS_CLICKED', last.includes('clicked'));
const settleEvents = s.readSince(0).lines.filter(l => l.type === 'dom.settle');
console.log('SETTLE_EVENTS_GTE_2', settleEvents.length >= 2);
console.log('SUMMARY_SAMPLE', JSON.stringify(settleEvents[settleEvents.length-1].summary).length > 2);

await s.destroy(); await conn.close(); child.kill(); server.close();
process.exit(0);
```

Run:

```
node test/dom.verify.js
```

**Expected output:**

```
SNAP_COUNT_GTE_2 true
LAST_HAS_CLICKED true
SETTLE_EVENTS_GTE_2 true
SUMMARY_SAMPLE true
```

**TROUBLESHOOT 6**
- `waitForIdle` returns instantly every time → the mutation poll always sees the
  same count and `_inflight` is 0 immediately; that's fine for the load case but
  if snapshots are missing, confirm `_snapshot` runs on resolve.
- `LAST_HAS_CLICKED false` → the second `waitForIdle` resolved before the click's
  DOM update; ensure `onGo()` actually ran (await the evaluate) and that the
  observer increments on `characterData`/`childList`.
- Only one snapshot → you guard `_snapshot` against "no change" and skip it.
  Don't skip; settle should always snapshot so the agent has a per-step record.
- `waitForIdle` hangs near timeout every time → `_inflight` never returns to 0
  (you decrement on the wrong events). Decrement on **both**
  `network.response` and `network.failed`.

---

## ITERATION 7 — BrowserPlugin public surface + registry

**Goal:** the single object the agent imports. Owns the shared browser
connection model, the session registry, and the friendly API. **One Chrome per
session** (simplest, fully isolated) — each `spawn` launches its own Chrome and
its own `CDPConnection`.

### Build

`src/index.js`:

- `class BrowserPlugin`
  - `constructor({ rootDir = './sessions' } = {})` — `this._sessions = new Map()`.
  - `async spawn({ label } = {})`:
    - `const id = label ? label + '-' + short() : 'sess-' + short();`
      (`short()` = 6 random base36 chars; if `label` collides, the suffix keeps
      it unique.)
    - make `userDataDir` under tmp; `launchChrome`; `new CDPConnection`;
      `connect`; `new Session`; `init`. Store in `_sessions`. Return `id`.
  - `get(id)` → session or throw `Error('No such session: ' + id)`.
  - `async navigate(id, url)` → `get(id).navigate(url)`.
  - `async waitForIdle(id, opts)` → `get(id).waitForIdle(opts)`.
  - `async eval(id, expr)` → `get(id).evaluate(expr)`.
  - `async query(id, sel)` → `get(id).query(sel)`.
  - `status(id)` → `get(id).status()`.
  - `list()` → `[...] ` of `status()` for all sessions.
  - `readSince(id, cursor)` → `get(id).readSince(cursor)`.
  - `onOutput(id, fn)` → `get(id).onOutput(fn)`.
  - `async destroy(id)` → destroy session, close its conn, kill its child,
    remove from map.
  - `async destroyAll()` → destroy everything (call in agent shutdown).

Add `short()` and `argToString` where needed.

> **Registry note:** because each session owns its own Chrome + connection, the
> `cdpSessionId` cross-talk risk from Iteration 4 disappears at the plugin level
> (one page per connection). Keep the filter anyway — it's correct and cheap,
> and protects you if you later put multiple tabs on one Chrome.

### VERIFY 7 (end-to-end, mirrors a real agent run)

`test/e2e.verify.js`:

```js
import { BrowserPlugin } from '../src/index.js';
import { startFixtureServer } from './server.js';

const { server, port } = await startFixtureServer();
const bp = new BrowserPlugin();

const id = await bp.spawn({ label: 'checkout' });
console.log('SPAWNED', id.startsWith('checkout-'));

await bp.navigate(id, `http://127.0.0.1:${port}/`);
await bp.waitForIdle(id);
console.log('STATUS_IDLE', bp.status(id).state === 'idle');

await bp.eval(id, 'onGo()');
await bp.waitForIdle(id);

const out = await bp.query(id, '#out');
console.log('OUT_CLICKED', out.html.includes('clicked'));

const lines = bp.readSince(id, 0).lines;
console.log('HAS_CONSOLE', lines.some(l => l.type === 'console' && /go-clicked/.test(l.text)));
console.log('HAS_NETWORK', lines.some(l => l.type === 'network.response' && /api\/ping/.test(l.url)));
console.log('HAS_SETTLE', lines.some(l => l.type === 'dom.settle'));
console.log('LIST_LEN', bp.list().length);

await bp.destroyAll();
console.log('AFTER_DESTROY', bp.list().length);
server.close();
process.exit(0);
```

Run:

```
node test/e2e.verify.js
```

**Expected output:**

```
SPAWNED true
STATUS_IDLE true
OUT_CLICKED true
HAS_CONSOLE true
HAS_NETWORK true
HAS_SETTLE true
LIST_LEN 1
AFTER_DESTROY 0
```

**TROUBLESHOOT 7**
- `STATUS_IDLE false` → state machine never reached idle; confirm
  `Page.loadEventFired` sets `state='idle'`.
- `AFTER_DESTROY` not 0 → `destroy` isn't removing from the map, or `destroyAll`
  isn't iterating a copy of the keys (mutating while iterating). Iterate
  `[...this._sessions.keys()]`.
- Everything passes except `HAS_NETWORK` → re-check Iteration 5 against this
  fixture; the click path must call `fetch('/api/ping')`.

---

## 3. Public API reference (hand this to the agent)

All methods are `async` unless noted. `id` is the plugin session id from `spawn`.

| Method | Returns | Notes |
|---|---|---|
| `spawn({ label? })` | `id` | Launches one headless Chrome. |
| `navigate(id, url)` | — | Non-blocking; pair with `waitForIdle`. |
| `waitForIdle(id, { quietMs?, timeoutMs? })` | — | Resolves when quiet; writes a DOM settle snapshot. |
| `eval(id, expr)` | `{ ok, value }` or `{ ok:false, error }` | Runs JS in page; awaits promises. |
| `query(id, selector)` | `{ count, html }` | `html` = first match's outerHTML or null. |
| `status(id)` | `{ id, state, currentUrl }` | `state`: starting/loading/idle/destroyed. |
| `list()` (sync) | `[status,...]` | All live sessions. |
| `readSince(id, cursor)` | `{ lines, nextCursor }` | Event delta for interval polling. |
| `onOutput(id, fn)` | unsubscribe fn | Live per-line callback for regex matching. |
| `destroy(id)` | — | Closes that Chrome. |
| `destroyAll()` | — | Shutdown hook. |

**On-disk artifacts per session** (`sessions/<id>/`): `timeline.jsonl`,
`network/*.meta.json`, `network/*.body.*`, `dom/<n>-<label>.html`.

**Event line types** in `timeline.jsonl` / `readSince`: `console`, `exception`,
`lifecycle`, `network.request`, `network.response`, `network.failed`,
`dom.settle`, `plugin`. Every line has `seq`, `t`, `type`.

### How the agent's background modes map here

- **Regex wake:** `const off = bp.onOutput(id, line => yourToolLayer.feed(line))`.
  Your layer stringifies the line and tests the regex; on match, wake.
- **Interval poll:** keep a `cursor`; every N seconds call
  `readSince(id, cursor)`, process `lines`, set `cursor = nextCursor`.
- **Idle notification:** if no new line for the agent's configured idle window,
  that's the agent's existing generic mechanism — it just observes that
  `readSince` returns empty / `onOutput` hasn't fired.

---

## 4. Suggested build order recap

1. CDP connection primitive (fake ws server).
2. Launch Chrome, get version.
3. Event log (buffer + cursor + file).
4. Session: attach, console/error/lifecycle, navigate/eval/query.
5. Network capture to disk.
6. DOM settle snapshots + diff + waitForIdle.
7. BrowserPlugin surface + registry + e2e.

Each iteration's VERIFY must pass before moving on. If you finish all seven and
`e2e.verify.js` prints the expected block, the plugin is done and working.

---

## 5. Known limitations / deliberate non-goals (so the agent doesn't "fix" them)

- **No screenshots / no image capture** — by design (LLM can't read images).
- **DOM diff is a coarse text summary**, not a real tree diff — by design. The
  HTML files are the source of truth.
- **One Chrome per session** — simpler and fully isolated; not the most
  memory-efficient. Fine at our scale (a handful of sessions, ~5 calls each).
- **`waitForIdle` is best-effort**, resolves on timeout rather than throwing —
  by design, so an agent step never hard-fails on a slow page.
- **Mutation detection is poll-based** (`window.__bpMutationCount`), not pushed
  via CDP bindings — chosen for simplicity and low moving-part count at our
  volume.
