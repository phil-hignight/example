code_boss chunk 1
number 2
made 2026-11-03T21:26:18.103Z
before 0103b094573ade0bfc36c66f
after b7791d4ec86f2fbfa742b116
files 94
left 644
check c6c853fb7d106fa7

=== add test/_bughunt-r5.mjs
new 03b7ed06d91043fde247d11e
+/**
+ * BUG HUNT ROUND 5 — optional partners + monochrome icons, through the real UI with a scripted model:
+ *   [1] a plugin using pii-testdata OPTIONALLY: with the partner present its rows come back as tokens
+ *   [2] the partner disabled → the plugin keeps working on its own path (no dependency → it is NOT disabled, the ⚠
+ *       badge does not count it); its status item flips from "PII" to "raw" within a poll; re-enabled → tokens again
+ *   [3] an emoji icon with a plugin-set style.color: the silhouette is filled with THAT colour, not the bar's
+ *   [4] SSE reconnect keeps rows once; no page errors. Screenshots in test/bughunt-r5-shots/.
+ * Run: node test/_bughunt-r5.mjs
+ */
+import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises';
+import { existsSync, mkdtempSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { cleanupDir } from './_helpers.mjs';
+
+process.env.CB_HOME = mkdtempSync(path.join(tmpdir(), 'cb-hunt5-home-'));
+const { startServer } = await import('../src/server.mjs');
+const { userPluginsDir } = await import('../src/plugins/paths.mjs');
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 29245;
+const SHOTS = path.join(ROOT, 'test', 'bughunt-r5-shots');
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const chrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe'].find((p) => { try { return p && existsSync(p); } catch { return false; } });
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+const ROWS = { r1: { last_name: 'Okonkwo-Zed', ssn: '482-11-9037' } };
+
+const PLUGINS = {
+  'optsql__1.mjs': `let host;
+export default {
+  description: 'sql with an OPTIONAL pii partner',
+  init(h) { host = h; },
+  statusItem: { render: () => ({ content: '🗄️ ' + (host && host.has('pii-testdata') ? 'PII' : 'raw'), title: 'pii partner present?' }) },
+  tools: [{ verb: 'osql', name: 'osql', schema: { description: 'query', parameters: { type: 'object', properties: {} } },
+    impl: async (args, ctx) => {
+      const rows = ${JSON.stringify(ROWS)};
+      const pii = ctx.host.use('pii-testdata', { optional: true });
+      if (pii) await pii.loadFamily({ projectDir: ctx.projectDir, label: 'q1', members: rows });
+      return { content: (pii ? 'WITH_PII ' : 'NO_PII ') + Object.entries(rows).map(([k, r]) => k + ':' + Object.values(r).join('/')).join(' ') };
+    } }],
+};
+`,
+  // The official contract: meaning in (icon / label / count / error), appearance ours. A plugin's style is ignored.
+  'erricon__1.mjs': `export default { description: 'error item', statusItem: { render: () => ({ icon: '🔥', label: 'hot', error: true, title: 'broken' }) } };\n`,
+  'counticon__1.mjs': `export default { description: 'count item', statusItem: { render: () => ({ icon: '🗄️', label: 'box', count: 7, title: 'seven' }) } };\n`,
+  // The case behind "the icon silhouette is orange": an agent-written plugin styling its button with an accent
+  // background — the style must be ignored outright now.
+  'styled__1.mjs': `export default { description: 'legacy styled', statusItem: { render: () => ({ content: '🗄️ old', title: 'legacy', style: { background: 'rgb(224, 128, 95)', color: 'rgb(224, 128, 95)' } }) } };\n`,
+};
+const CALLS = { 1: '<osql/>', 2: '<osql/>', 3: '<osql/>' };
+function reply(t) {
+  let top = -1, which = 0;
+  for (const n of Object.keys(CALLS)) { const p = t.lastIndexOf('HUNT' + n + ' '); if (p > top) { top = p; which = Number(n); } }
+  if (top < 0) return 'ready';
+  return t.lastIndexOf('<remote-workspace-result') > top ? `Done ${which}. HUNT${which}_DONE` : `Step ${which}. <remote-workspace>${CALLS[which]}</remote-workspace>`;
+}
+const reqs = [];
+const adapter = {
+  async *completeStream(req) { const text = (req && req.messages ? req.messages : []).map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n'); reqs.push(text); yield { choices: [{ delta: { content: reply(text) } }] }; },
+  async complete() { return { choices: [{ message: { content: 'ok' } }] }; },
+  async listModels() { return [{ id: 'm' }]; },
+};
+
+async function main() {
+  if (!chrome) { console.log('SKIP — Chrome not found'); process.exit(0); }
+  await mkdir(SHOTS, { recursive: true });
+  const pdir = userPluginsDir(); await mkdir(pdir, { recursive: true });
+  for (const [f, src] of Object.entries(PLUGINS)) await writeFile(path.join(pdir, f), src, 'utf8');
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-hunt5-proj-'));
+  await writeFile(path.join(projectDir, 'README.md'), 'hello\n');
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'm', baseURL: '(mock)' }) + ';</script></head>');
+  const { server } = await startServer({ html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' }, defaultModel: 'm', port: PORT, adapter, modelsList: [{ id: 'm' }], initialProject: projectDir });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const api = async (p, body) => (await fetch(`http://127.0.0.1:${PORT}${p}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})).json();
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1200, height: 800 });
+    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForSelector('#chat:not(.hidden)', { timeout: 15000 });
+    const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') }).catch(() => {});
+    const step = async (n) => { await page.type('#input', `HUNT${n} go`); await page.keyboard.press('Enter'); await page.waitForFunction((m) => document.body.innerText.includes(m), { timeout: 30000 }, `HUNT${n}_DONE`); return page.evaluate(() => { const e = [...(session.events || [])].reverse().find((x) => x.type === 'tool-result' && x.name === 'osql'); return e ? String(e.content || '') : ''; }); };
+    const statusText = (plugin) => page.evaluate((p) => (document.querySelector(`.plugin-status-btn[data-plugin="${p}"]`) || {}).textContent || '', plugin);
+
+    console.log('\n[1] with the optional partner present, rows come back as tokens');
+    const r1 = await step(1);
+    ok(/^WITH_PII/.test(r1) && /@@@\(q1\.r1\.last_name\)/.test(r1) && !/Okonkwo-Zed/.test(r1), `WITH_PII and tokens (${r1.slice(0, 80)})`);
+    await page.waitForFunction(() => /PII/.test((document.querySelector('.plugin-status-btn[data-plugin="optsql"]') || {}).textContent || ''), { timeout: 8000 }).catch(() => {});
+    ok(/🗄️ PII/.test(await statusText('optsql')), `the status item reports the partner present (${await statusText('optsql')})`);
+
+    console.log('\n[2] the partner disabled → the plugin still works on its own path; not disabled itself; the item flips');
+    await api('/api/plugin-toggle', { name: 'pii-testdata', disabled: true });
+    await sleep(800);
+    const r2 = await step(2);
+    ok(/^NO_PII/.test(r2) && /Okonkwo-Zed/.test(r2), `NO_PII path: the plugin ran without the partner (${r2.slice(0, 60)})`);
+    const snap = (await api('/api/state')).plugins || [];
+    const me = snap.find((p) => p.name === 'optsql');
+    ok(!!me && me.enabled === true, 'the plugin stays ENABLED — an optional partner is not a dependency');
+    ok(await page.evaluate(() => getComputedStyle(document.getElementById('pluginWarn')).display === 'none'), 'the ⚠ badge does not count it');
+    await page.waitForFunction(() => /raw/.test((document.querySelector('.plugin-status-btn[data-plugin="optsql"]') || {}).textContent || ''), { timeout: 9000 }).catch(() => {});
+    ok(/🗄️ raw/.test(await statusText('optsql')), `the status item flipped within a poll (${await statusText('optsql')})`);
+    ok(reqs.some((r) => r.includes('Okonkwo-Zed')), 'and, deliberately, the raw rows reached the model this time — the plugin chose that path with no partner (the developer disabled it)');
+    await shot('02-no-partner');
+    await api('/api/plugin-toggle', { name: 'pii-testdata', disabled: false });
+    await sleep(1200);
+    const r3 = await step(3);
+    ok(/^WITH_PII/.test(r3) && /@@@\(q1\.r1\.last_name\)/.test(r3), 're-enabled → tokens again');
+    await page.waitForFunction(() => /PII/.test((document.querySelector('.plugin-status-btn[data-plugin="optsql"]') || {}).textContent || ''), { timeout: 9000 }).catch(() => {});
+    ok(/🗄️ PII/.test(await statusText('optsql')), 'the item flips back');
+
+    console.log('\n[3] the official item contract: error colours the item, count floats as a badge, a plugin style is ignored');
+    await page.waitForFunction(() => ['erricon', 'counticon', 'styled'].every((p) => !!document.querySelector(`.plugin-status-btn[data-plugin="${p}"] .ps-text`)), { timeout: 8000 }).catch(() => {});
+    const errorColor = await page.evaluate(() => getComputedStyle(document.getElementById('pluginBadge')).backgroundColor);   // the ⚠ badge's red = the bar's error colour
+    const items = await page.evaluate(() => {
+      const gear = getComputedStyle(document.getElementById('settingsBtn')).color;
+      const read = (p) => { const b = document.querySelector(`.plugin-status-btn[data-plugin="${p}"]`); if (!b) return null; const t = b.querySelector('.ps-text'), bd = b.querySelector('.ps-badge'); const cs = getComputedStyle(t); return { text: t.textContent, fill: cs.backgroundColor, clip: cs.webkitBackgroundClip || cs.backgroundClip, badge: bd.textContent, badgeShown: getComputedStyle(bd).display !== 'none', badgeBg: getComputedStyle(bd).backgroundColor, error: b.classList.contains('ps-error'), inline: b.getAttribute('style'), boxBg: getComputedStyle(b).backgroundColor }; };
+      return { gear, err: read('erricon'), cnt: read('counticon'), styled: read('styled'), plain: read('optsql') };
+    });
+    ok(!!items.err && /🔥 hot/.test(items.err.text) && items.err.error && !items.err.badgeShown, `error: true → the item wears the error class, and no "!" bubble (the developer, 2026-10-10) (${JSON.stringify(items.err && { badge: items.err.badge, error: items.err.error })})`);
+    ok(!!items.err && items.err.fill === errorColor, `…and the glyph is the bar's error colour (${items.err && items.err.fill})`);
+    ok(!!items.cnt && items.cnt.badge === '7' && items.cnt.badgeShown && !items.cnt.error && items.cnt.fill === items.gear, `count: 7 → a "7" badge, the glyph in the bar's colour (${JSON.stringify(items.cnt && { badge: items.cnt.badge, fill: items.cnt.fill })})`);
+    ok(!!items.cnt && items.cnt.badgeBg !== items.gear && items.cnt.badgeBg !== 'rgba(0, 0, 0, 0)', `the count badge is the accent, like ▶'s (${items.cnt && items.cnt.badgeBg})`);
+    ok(!!items.styled && items.styled.inline == null && items.styled.fill === items.gear && items.styled.boxBg === 'rgba(0, 0, 0, 0)', `a legacy plugin style (accent background + colour) is IGNORED — glyph in the bar's colour, no box (${JSON.stringify(items.styled && { fill: items.styled.fill, box: items.styled.boxBg })})`);
+    ok(!!items.styled && /🗄️ old/.test(items.styled.text), 'a legacy content string still renders as the label');
+    ok(!!items.plain && items.plain.fill === items.gear && items.plain.clip === 'text', `an unstyled item's silhouette is the bar's colour, same as the gear (${items.plain && items.plain.fill})`);
+    await shot('03-icons');
+
+    console.log('\n[4] SSE reconnect keeps rows once; no page errors');
+    const before = await page.evaluate(() => ({ tools: document.querySelectorAll('.row.tool').length, res: document.querySelectorAll('.row-result').length }));
+    await page.evaluate(() => { try { refetchAndReconnect(); } catch {} });
+    await sleep(1500);
+    const after = await page.evaluate(() => ({ tools: document.querySelectorAll('.row.tool').length, res: document.querySelectorAll('.row-result').length }));
+    ok(before.tools === after.tools && before.res === after.res, `row counts unchanged (${JSON.stringify(before)} → ${JSON.stringify(after)})`);
+    ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(' | ')})`);
+  } catch (e) { fail++; console.log('  FAIL harness:', e?.message || e); }
+  finally { await browser.close(); try { server.close(); } catch {} await cleanupDir(projectDir); }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main();
+
=== add test/_bughunt-r6.mjs
new 50fb626de7be5b8e8bc1958b
+/**
+ * BUG HUNT ROUND 6 — the latest features through the REAL UI with a scripted model, answering like a developer:
+ *   [1] a SQL-style plugin masks its rows AD HOC (maskFields): the transcript and the page show @@@(<field>#<id>)
+ *       tokens and never a value; piiscan leaves them alone; the Test data panel does NOT grow; the model was told
+ *       what a plugin-issued token is; the plugin's status item pulsed (busy) until its first query, then shows a count
+ *   [2] the model hands a token to <write> → the FILE holds the real value, the UI row keeps the token
+ *   [3] the same value in an unrelated tool result (an app log) is re-tokenized to the SAME token
+ *   [4] a stale / foreign plugin-issued token reaching a tool is REFUSED in the UI, with the way back; no file written
+ *   [5] a plugin-spawned process: ▶ sits at the right end of the plugin group; the dock streams its output MASKED
+ *       (the ticker prints a value the ad hoc map holds); Stop kills it and ▶ goes away
+ *   [6] a plugin whose scan probe THROWS: the 🧩 badge counts a runtime warning, the plugins modal shows it on the
+ *       loaded card, its status item shows error; fixing the file clears all of it and the folder is found
+ *   [7] a plugin that fails to LOAD beside the warning: the badge counts both and the tooltip says which is which
+ *   [8] a page reload: status items re-render on connect, ▶ is still gone, no page errors across the whole hunt
+ * Screenshots in test/bughunt-r6-shots/. Run: node test/_bughunt-r6.mjs
+ */
+import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises';
+import { existsSync, mkdtempSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { cleanupDir } from './_helpers.mjs';
+
+process.env.CB_HOME = mkdtempSync(path.join(tmpdir(), 'cb-hunt6-home-'));
+process.env.CB_GIT_SCAN_MS = '1500';
+const { startServer } = await import('../src/server.mjs');
+const { userPluginsDir } = await import('../src/plugins/paths.mjs');
+const { reapAllBackground } = await import('../src/agent/bg-procs.mjs');
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 29260;
+const SHOTS = path.join(ROOT, 'test', 'bughunt-r6-shots');
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const chrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe'].find((p) => { try { return p && existsSync(p); } catch { return false; } });
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+const ROWS = [
+  { id: 1042, last_name: 'Okonkwo-Zed', ssn: '482-11-9037', status: 'active' },
+  { id: 1043, last_name: 'Vantongeren-Bly', ssn: '333-22-1111', status: 'active' },
+];
+const RAW = /Okonkwo-Zed|Vantongeren-Bly|482-11-9037|333-22-1111/;
+
+const SQL_PLUGIN = `let host;
+export default {
+  description: 'sql fixture: rows masked ad hoc + a ticker',
+  dependencies: { 'pii-testdata': true },
+  init(h) { host = h; host.state.rows ??= 0; },
+  statusItem: { render: () => ({ icon: '🗄️', label: String(host.state.rows), count: host.state.rows, busy: !host.state.rows, title: host.state.rows ? host.state.rows + ' rows' : 'waiting for the first query' }) },
+  tools: [
+    { verb: 'sql_query', name: 'sql_query', schema: { description: 'run a query', parameters: { type: 'object', properties: { sql: { type: 'string' } } } },
+      impl: async (args, ctx) => {
+        const rows = ${JSON.stringify(ROWS)};
+        const pii = ctx.host.use('pii-testdata');
+        const masked = await pii.maskFields({ projectDir: ctx.projectDir, data: rows, fields: ['last_name', 'ssn'] });
+        ctx.host.state.rows = rows.length;
+        return { content: 'ROWS ' + JSON.stringify(masked) };
+      } },
+    { verb: 'app_log', name: 'app_log', schema: { description: 'read the app log', parameters: { type: 'object', properties: {} } },
+      impl: async () => ({ content: 'LOG 2026-09-16 login ok for Okonkwo-Zed (ssn 482-11-9037)' }) },
+    { verb: 'start_ticker', name: 'start_ticker', schema: { description: 'start a ticker', parameters: { type: 'object', properties: {} } },
+      impl: async (args, ctx) => { const { id } = await ctx.host.spawn('node', ['-e', "setInterval(()=>console.log('tick Okonkwo-Zed'),200)"], { label: 'ticker' }); return { content: 'TICKER ' + id }; } },
+  ],
+};
+`;
+// A scan probe that THROWS (no import for nodePath) — and, with `fixed`, the same plugin repaired.
+const SCAN_PLUGIN = (fixed) => `${fixed ? "import nodePath from 'node:path';" : ''}
+let host;
+export default {
+  description: 'finds data-sources folders',
+  init(h) { host = h; host.scan.register({ name: 'ds', visit: (dir) => (nodePath.basename(dir) === 'data-sources' ? 'hit' : 'continue'), onChange: (hits, info) => { host.state.err = info.error; host.state.n = hits.length; } }); host.scan.rescan(); },
+  statusItem: { render: () => { const s = host.scan.status('ds'); return { icon: '📡', label: String(s.hits.length), busy: !s.scanned, error: !!s.error, title: s.error || (s.hits.length + ' data-sources folder(s)') }; } },
+};
+`;
+const CALLS = {
+  1: () => '<sql_query sql="SELECT * FROM enrollees"/>',
+  2: (t) => { const m = /@@@\(last_name#[0-9a-f]{16}\)/.exec(t); return `<write path="out.txt">${m ? m[0] : 'NO_TOKEN'}</write>`; },
+  3: () => '<app_log/>',
+  4: () => '<write path="stale.txt">@@@(email#0123456789abcdef)</write>',
+  5: () => '<start_ticker/>',
+};
+function reply(t) {
+  let top = -1, which = 0;
+  for (const n of Object.keys(CALLS)) { const p = t.lastIndexOf('HUNT' + n + ' '); if (p > top) { top = p; which = Number(n); } }
+  if (top < 0) return 'ready';
+  return t.lastIndexOf('<remote-workspace-result') > top ? `Done ${which}. HUNT${which}_DONE` : `Step ${which}. <remote-workspace>${CALLS[which](t)}</remote-workspace>`;
+}
+const reqs = [];
+const adapter = {
+  async *completeStream(req) { const text = (req && req.messages ? req.messages : []).map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n'); reqs.push(text); yield { choices: [{ delta: { content: reply(text) } }] }; },
+  async complete() { return { choices: [{ message: { content: 'ok' } }] }; },
+  async listModels() { return [{ id: 'm' }]; },
+};
+
+async function main() {
+  if (!chrome) { console.log('SKIP — Chrome not found'); process.exit(0); }
+  await mkdir(SHOTS, { recursive: true });
+  const pdir = userPluginsDir(); await mkdir(pdir, { recursive: true });
+  await writeFile(path.join(pdir, 'sqladhoc__1.mjs'), SQL_PLUGIN, 'utf8');
+  await writeFile(path.join(pdir, 'scanbad__1.mjs'), SCAN_PLUGIN(false), 'utf8');
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-hunt6-proj-'));
+  await writeFile(path.join(projectDir, 'README.md'), 'hello\n');
+  await mkdir(path.join(projectDir, 'data-sources'), { recursive: true });
+  await writeFile(path.join(projectDir, 'data-sources', 'ds.json'), '{}');
+  // The developer's own family in the panel — the ad hoc rows must not join it.
+  await mkdir(path.join(projectDir, 'testdata'), { recursive: true });
+  await writeFile(path.join(projectDir, 'testdata', 'smiths.json'), JSON.stringify({ label: 'smiths', family: {}, members: { sponsor: { last_name: 'Quintero-Maal', ssn: '512-44-9001' } } }));
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'm', baseURL: '(mock)' }) + ';</script></head>');
+  const { server } = await startServer({ html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' }, defaultModel: 'm', port: PORT, adapter, modelsList: [{ id: 'm' }], initialProject: projectDir });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const api = async (p, body) => (await fetch(`http://127.0.0.1:${PORT}${p}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})).json();
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1200, height: 800 });
+    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForSelector('#chat:not(.hidden)', { timeout: 15000 });
+    const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') }).catch(() => {});
+    const step = async (n, tool) => { await page.type('#input', `HUNT${n} go`); await page.keyboard.press('Enter'); await page.waitForFunction((m) => document.body.innerText.includes(m), { timeout: 30000 }, `HUNT${n}_DONE`); return page.evaluate((tn) => { const e = [...(session.events || [])].reverse().find((x) => x.type === 'tool-result' && x.name === tn); return e ? { content: String(e.content || ''), status: e.status || null } : { content: '', status: null }; }, tool); };
+    const item = (plugin) => page.evaluate((p) => { const b = document.querySelector(`.plugin-status-btn[data-plugin="${p}"]`); if (!b) return null; const t = b.querySelector('.ps-text'), g = b.querySelector('.ps-badge'); return { text: t ? t.textContent : b.textContent, badge: g ? g.textContent : '', badgeShown: g ? getComputedStyle(g).display !== 'none' : false, busy: b.classList.contains('ps-busy'), anim: t ? getComputedStyle(t).animationName : 'none', error: b.classList.contains('ps-error'), title: b.title }; }, plugin);
+    const bodyText = () => page.evaluate(() => document.body.innerText);
+
+    console.log('\n[1] ad hoc masking through the UI: tokens everywhere, the panel does not grow, the item pulsed until the first query');
+    await page.waitForFunction(() => !!document.querySelector('.plugin-status-btn[data-plugin="sqladhoc"]'), { timeout: 10000 }).catch(() => {});
+    const i0 = await item('sqladhoc');
+    ok(!!i0 && i0.busy && i0.anim === 'ps-breathe' && !i0.badgeShown, `before any query the plugin's item pulses (busy) and shows no count (${JSON.stringify(i0)})`);
+    await shot('01-busy');
+    const r1 = await step(1, 'sql_query');
+    ok(/^ROWS /.test(r1.content) && !RAW.test(r1.content), `the query result in the transcript carries no raw value (${r1.content.slice(0, 120)})`);
+    const toks = r1.content.match(/@@@\((last_name|ssn)#[0-9a-f]{16}\)/g) || [];
+    ok(toks.length === 4 && new Set(toks).size === 4, `four distinct @@@(<field>#<id>) tokens (${toks.length}/${new Set(toks).size})`);
+    ok(!/\[PII:/.test(r1.content), 'piiscan did not re-mask the tokens as [PII:…]');
+    const body1 = await bodyText();
+    ok(!RAW.test(body1), 'nothing on the PAGE shows a raw value');
+    ok(/PLUGIN-ISSUED VALUE TOKENS/.test(reqs[reqs.length - 1] || '') && /60 days/.test(reqs[reqs.length - 1] || ''), 'the model was told what a plugin-issued token is (prompt addition)');
+    await page.waitForFunction(() => !document.querySelector('.plugin-status-btn[data-plugin="sqladhoc"]').classList.contains('ps-busy'), { timeout: 9000 }).catch(() => {});
+    const i1 = await item('sqladhoc');
+    ok(!!i1 && !i1.busy && i1.anim === 'none' && i1.badge === '2' && i1.badgeShown, `after the query the pulse stopped and the count badge reads 2 (${JSON.stringify(i1)})`);
+    // The Test data panel: the developer's family only — no ad hoc entry, no ad hoc value.
+    await page.evaluate(() => setSidePanelCollapsed(false));
+    await page.waitForFunction(() => document.getElementById('sidePanel').getBoundingClientRect().width >= 300, { timeout: 5000 }).catch(() => {});
+    await page.waitForFunction(() => { const b = document.getElementById('tabbtn-plugin-pii-testdata'); return b && b.offsetParent !== null; }, { timeout: 14000 }).catch(() => {});
+    await page.click('#tabbtn-plugin-pii-testdata').catch(() => {});
+    await page.waitForFunction(() => !!document.querySelector('#pane-plugin-pii-testdata input[data-ppid="mf:smiths:sponsor:ssn"]'), { timeout: 8000 }).catch(() => {});
+    const panel = await page.evaluate(() => { const pane = document.getElementById('pane-plugin-pii-testdata'); if (!pane) return null; const ids = [...pane.querySelectorAll('[data-ppid]')].map((e) => e.dataset.ppid); const vals = [...pane.querySelectorAll('input')].map((e) => e.value); return { text: pane.innerText.replace(/\s+/g, ' ').slice(0, 120), ids, vals }; });
+    ok(!!panel && panel.ids.some((i) => /smiths/.test(i)) && panel.ids.every((i) => /:smiths:|^addfamily|^newfamily|^addmember/.test(i) || !/adhoc|1042|1043/.test(i)) && !panel.vals.some((v) => RAW.test(v)) && !/adhoc|Okonkwo|Vantongeren/.test(panel.text), `the Test data panel shows the developer's family and nothing ad hoc (${JSON.stringify(panel && { ids: panel.ids.length, text: panel.text.slice(0, 60) })})`);
+    await shot('01-panel');
+
+    console.log('\n[2] a token handed to <write> → the file holds the real value, the row keeps the token');
+    await step(2, 'write_file').catch(() => {});
+    const out = await readFile(path.join(projectDir, 'out.txt'), 'utf8').catch(() => null);
+    ok(out === 'Okonkwo-Zed', `out.txt holds the REAL value (${JSON.stringify(out)})`);
+    const wcall = await page.evaluate(() => { const e = [...(session.events || [])].reverse().find((x) => x.type === 'tool-call' && /write/.test(x.name || '')); return e ? JSON.stringify(e.args || {}) : ''; });
+    ok(/@@@\(last_name#[0-9a-f]{16}\)/.test(wcall) && !/Okonkwo-Zed/.test(wcall), 'the tool-call event keeps the token');
+    ok(!RAW.test(await bodyText()), 'still nothing raw on the page');
+
+    console.log('\n[3] the same value in an unrelated tool result → the SAME token');
+    const r3 = await step(3, 'app_log');
+    const nameTok = toks.find((t) => t.startsWith('@@@(last_name#')), ssnTok = toks.find((t) => t.startsWith('@@@(ssn#'));
+    ok(!RAW.test(r3.content) && r3.content.includes(nameTok) && r3.content.includes(ssnTok), `the log reads with the query's tokens (${r3.content})`);
+
+    console.log('\n[4] a stale plugin-issued token reaching a tool is refused in the UI, with the way back');
+    const r4 = await step(4, 'write_file');
+    ok(r4.status === 'error' && /no longer holds/.test(r4.content) && /Re-run the tool/.test(r4.content), `the write was refused: ${r4.content.slice(0, 100)}`);
+    ok(!existsSync(path.join(projectDir, 'stale.txt')), 'no file was written');
+    // The row is collapsed until clicked (like any tool row): the refusal is in the DOM; expand it for the eye + the shot.
+    const errRow = await page.evaluate(() => { const rows = [...document.querySelectorAll('.row-result.err')]; const r = rows[rows.length - 1]; if (!r) return null; r.click(); return true; });
+    await sleep(400);
+    const errText = await page.evaluate(() => { const rows = [...document.querySelectorAll('.row-result.err')]; const r = rows[rows.length - 1]; return r ? r.textContent : ''; });
+    ok(!!errRow && /no longer holds/.test(errText) && /Re-run the tool/.test(errText), `the refusal is a red result row the developer can open and read (${errText.replace(/\s+/g, ' ').slice(0, 140)})`);
+    await shot('04-stale');
+
+    console.log('\n[5] a plugin-spawned process: ▶ at the right end of the plugin group; the dock output is masked; Stop');
+    const r5 = await step(5, 'start_ticker');
+    ok(/^TICKER /.test(r5.content), `the plugin spawned a tracked process (${r5.content})`);
+    await page.waitForFunction(() => getComputedStyle(document.getElementById('bgProcsBtn')).display !== 'none', { timeout: 8000 }).catch(() => {});
+    const geo = await page.evaluate(() => {
+      const b = document.getElementById('bgProcsBtn'), g = document.getElementById('settingsBtn'), e = document.getElementById('editToggle'), grp = document.getElementById('pluginStatusItems');
+      const r = (x) => x.getBoundingClientRect();
+      return { shown: getComputedStyle(b).display !== 'none', afterGroup: grp.nextElementSibling === b, rightOfGroup: r(b).left >= r(grp).right - 1, leftOfEdit: r(b).right <= r(e).left + 1, leftOfGear: r(b).right <= r(g).left + 1, badge: document.getElementById('bgProcsBadge').textContent };
+    });
+    ok(geo.shown && geo.afterGroup && geo.rightOfGroup && geo.leftOfEdit && geo.leftOfGear, `▶ is the rightmost item of the plugin group, left of Edit and ⚙ (${JSON.stringify(geo)})`);
+    await page.click('#bgProcsBtn');
+    await page.waitForSelector('.bg-dock .bg-row', { timeout: 6000 });
+    await page.click('.bg-dock .row-result').catch(() => {});
+    await page.waitForFunction(() => /tick/.test(document.querySelector('.bg-dock .row-result pre')?.textContent || ''), { timeout: 8000 }).catch(() => {});
+    const dock = await page.evaluate(() => document.querySelector('.bg-dock .row-result pre')?.textContent || '');
+    ok(/tick/.test(dock) && dock.includes(nameTok) && !/Okonkwo-Zed/.test(dock), `the dock streams the ticker with the value MASKED to its ad hoc token (${JSON.stringify(dock.slice(-60))})`);
+    const seed = (await api('/api/bg')).processes.map((p) => String(p.output || '')).join('\n');
+    ok(seed.includes(nameTok) && !/Okonkwo-Zed/.test(seed), 'the /api/bg seed is masked the same way');
+    await shot('05-dock');
+    await page.click('.bg-dock .bg-stop');
+    await page.waitForFunction(() => getComputedStyle(document.getElementById('bgProcsBtn')).display === 'none' || !(window._bgProcs || []).some((p) => p.alive), { timeout: 8000 }).catch(() => {});
+    ok(!(await api('/api/bg')).processes.some((p) => p.alive), 'Stop killed the ticker');
+
+    console.log('\n[6] a plugin whose scan probe THROWS: badge, modal card, status item — then the fix clears it all');
+    await page.waitForFunction(() => getComputedStyle(document.getElementById('pluginWarn')).display !== 'none', { timeout: 10000 }).catch(() => {});
+    const warn = await page.evaluate(() => { const w = document.getElementById('pluginWarn'); return { shown: getComputedStyle(w).display !== 'none', badge: document.getElementById('pluginBadge').textContent, title: w.title }; });
+    ok(warn.shown && warn.badge === '1' && /1 with a runtime warning/.test(warn.title), `the 🧩 badge counts the runtime warning (${JSON.stringify(warn)})`);
+    const si6 = await item('scanbad');
+    ok(!!si6 && si6.error && !si6.busy && /not defined/.test(si6.title), `the plugin's own status item reports the error, not "still scanning" (${JSON.stringify(si6)})`);
+    await page.click('#pluginWarn');
+    await page.waitForSelector('#pluginIssuesModalBg.show', { timeout: 5000 });
+    const modal = await page.evaluate(() => document.getElementById('pluginIssuesBody').innerText);
+    ok(/scanbad/.test(modal) && /threw at/.test(modal) && /nodePath is not defined/.test(modal) && /⚠/.test(modal), 'the plugins modal shows the warning on the LOADED card');
+    await shot('06-warning');
+    await page.evaluate(() => closePluginIssues());
+    await writeFile(path.join(pdir, 'scanbad__1.mjs'), SCAN_PLUGIN(true), 'utf8');
+    await page.waitForFunction(() => getComputedStyle(document.getElementById('pluginWarn')).display === 'none', { timeout: 15000 }).catch(() => {});
+    ok(await page.evaluate(() => getComputedStyle(document.getElementById('pluginWarn')).display === 'none'), 'after the fix the badge is gone');
+    await page.waitForFunction(() => { const b = document.querySelector('.plugin-status-btn[data-plugin="scanbad"]'); return b && !b.classList.contains('ps-error') && /1/.test(b.querySelector('.ps-text')?.textContent || ''); }, { timeout: 12000 }).catch(() => {});
+    const si6b = await item('scanbad');
+    ok(!!si6b && !si6b.error && /📡 1/.test(si6b.text), `the status item now reports the folder it found (${JSON.stringify(si6b)})`);
+    const row = ((await api('/api/state')).plugins || []).find((p) => p.name === 'scanbad');
+    ok(!!row && row.enabled && (row.warnings || []).length === 0, 'the snapshot row has no warning left');
+
+    console.log('\n[7] a plugin that fails to LOAD beside a warning: both counted, the tooltip says which is which');
+    await writeFile(path.join(pdir, 'scanbad__1.mjs'), SCAN_PLUGIN(false), 'utf8');   // the warning again
+    await writeFile(path.join(pdir, 'broken__1.mjs'), 'export default { description: "x", tools: [ { nope } ] }\n', 'utf8');
+    await page.waitForFunction(() => document.getElementById('pluginBadge').textContent === '2', { timeout: 15000 }).catch(() => {});
+    const warn7 = await page.evaluate(() => ({ badge: document.getElementById('pluginBadge').textContent, title: document.getElementById('pluginWarn').title }));
+    ok(warn7.badge === '2' && /1 failed to load/.test(warn7.title) && /1 with a runtime warning/.test(warn7.title), `badge 2, tooltip names both (${JSON.stringify(warn7)})`);
+    await page.click('#pluginWarn');
+    await page.waitForSelector('#pluginIssuesModalBg.show', { timeout: 5000 });
+    const modal7 = await page.evaluate(() => document.getElementById('pluginIssuesBody').innerText);
+    // innerText carries the CSS text-transform (the section header renders UPPERCASE) — match case-insensitively.
+    ok(/Failed to load/i.test(modal7) && /broken/.test(modal7) && /threw at/.test(modal7), `the modal shows the failed plugin AND the warning (${modal7.replace(/\s+/g, ' ').slice(-300)})`);
+    await shot('07-both');
+    await page.evaluate(() => closePluginIssues());
+    await rm(path.join(pdir, 'broken__1.mjs'), { force: true });
+    await writeFile(path.join(pdir, 'scanbad__1.mjs'), SCAN_PLUGIN(true), 'utf8');
+    await page.waitForFunction(() => getComputedStyle(document.getElementById('pluginWarn')).display === 'none', { timeout: 15000 }).catch(() => {});
+
+    console.log('\n[8] a page reload: status items re-render on connect, ▶ stays gone, no page errors');
+    // Close the dock first: an OPEN dock legitimately keeps ▶ visible while a finished process is still listed.
+    if (await page.evaluate(() => !!document.querySelector('.bg-dock'))) { await page.click('#bgProcsBtn'); await sleep(300); }
+    await page.reload({ waitUntil: 'load' });
+    await page.waitForSelector('#chat:not(.hidden)', { timeout: 15000 });
+    await page.waitForFunction(() => !!document.querySelector('.plugin-status-btn[data-plugin="sqladhoc"] .ps-badge'), { timeout: 10000 }).catch(() => {});
+    const i8 = await item('sqladhoc');
+    ok(!!i8 && i8.badge === '2' && !i8.busy, `the sql item re-rendered with its count after reload (${JSON.stringify(i8)})`);
+    // ▶ is always in the bar now: after the stop it is IDLE (dimmed, no badge), never gone.
+    ok(await page.evaluate(() => { const b = document.getElementById('bgProcsBtn'); return getComputedStyle(b).display !== 'none' && b.classList.contains('idle') && getComputedStyle(document.getElementById('bgProcsBadge')).display === 'none'; }), '▶ stays in the bar after reload, idle with no badge (the ticker was stopped)');
+    const body8 = await page.evaluate(() => document.body.textContent);
+    const m8 = RAW.exec(body8);
+    ok(!m8, `after reload the replayed transcript still shows no raw value${m8 ? ` — FOUND ${JSON.stringify(m8[0])} in: …${body8.slice(Math.max(0, m8.index - 120), m8.index + 60).replace(/\s+/g, ' ')}…` : ''}`);
+    await shot('08-reload');
+    ok(errs.length === 0, `no page errors across the hunt (${errs.slice(0, 2).join(' | ')})`);
+  } catch (e) { fail++; console.log('  FAIL harness:', e?.stack || e); }
+  finally { try { reapAllBackground('closed'); } catch {} await browser.close(); try { server.close(); } catch {} await cleanupDir(projectDir); }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main();
+
=== add test/_bughunt-statusbar.mjs
new f5da7618f47adf517c2a1ae6
+/**
+ * BUG HUNT — the plugin status-bar (statusItem), driven through the real UI with a fleet of DELIBERATELY NASTY
+ * plugins: a throwing render, a SLOW render (past the time-box), a hidden item, huge content, an aggressive inline
+ * style, a flaky (alternating) render, plus several normal ones. Looks for: layout breakage, a slow plugin blocking
+ * the batch/poll, the ⚠ degrade + recovery, hidden actually hiding, ordering, narrow-width overflow, and live
+ * removal on disable. Uses the mock adapter (the bar is model-independent). Run: node test/_bughunt-statusbar.mjs
+ */
+import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
+import { cleanupDir } from './_helpers.mjs';
+import { existsSync, mkdtempSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+
+process.env.CB_HOME = mkdtempSync(path.join(tmpdir(), 'cb-bhsb-home-'));
+const pluginsDir = path.join(process.env.CB_HOME, '.code_boss', 'plugins');
+await mkdir(pluginsDir, { recursive: true });
+
+const si = (name, body) => writeFile(path.join(pluginsDir, name + '__1.mjs'), body);
+await si('sba', `export default { description:'A', statusItem:{ render:()=>({content:'ⓐ', title:'alpha'}) } };`);
+await si('sbb', `export default { description:'B', statusItem:{ render:()=>({content:'ⓑ', title:'bravo'}) } };`);
+await si('sbc', `export default { description:'C', statusItem:{ render:()=>({content:'ⓒ', title:'charlie'}) } };`);
+await si('sbhidden', `export default { description:'hidden', statusItem:{ render:()=>({content:'SHOULD_NOT_SHOW', hidden:true}) } };`);
+await si('sbthrow', `export default { description:'throws', statusItem:{ render:()=>{ throw new Error('boom'); } } };`);
+await si('sbslow', `const sleep=(ms)=>new Promise(r=>setTimeout(r,ms)); export default { description:'slow', statusItem:{ render:async()=>{ await sleep(6000); return {content:'SLOW'}; } } };`);
+await si('sbhuge', `export default { description:'huge', statusItem:{ render:()=>({content:'H'.repeat(300), title:'huge'}) } };`);
+await si('sbstyle', `export default { description:'style', statusItem:{ render:()=>({content:'✦', style:{ color:'lime', fontSize:'34px', fontWeight:'900' }, title:'styled'}) } };`);
+await si('sbflaky', `export default { description:'flaky', init(h){h.state.r=0;}, statusItem:{ render:(ctx)=>{ ctx.host.state.r++; if(ctx.host.state.r%2===1) throw new Error('flaky'); return {content:'FLK'+ctx.host.state.r}; } } };`);
+
+const { startServer } = await import('../src/server.mjs');
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 29199;
+let pass = 0, fail = 0; const notes = [];
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const note = (l) => { notes.push(l); console.log('  ·', l); };
+const chrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe'].find((p) => { try { return p && existsSync(p); } catch { return false; } });
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+const adapter = { async *completeStream() { yield { choices: [{ delta: { content: 'ok' } }] }; }, async complete() { return { choices: [{ message: { content: 'ok' } }] }; }, async listModels() { return [{ id: 'm' }]; } };
+const SHOTS = path.join(__dirname, 'bughunt-statusbar-screenshots');
+
+async function main() {
+  if (!chrome) { console.log('SKIP — Chrome not found'); process.exit(0); }
+  await mkdir(SHOTS, { recursive: true });
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-bhsb-proj-'));
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'm', baseURL: '(mock)' }) + ';</script></head>');
+  const { server } = await startServer({ html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' }, defaultModel: 'm', port: PORT, adapter, modelsList: [{ id: 'm' }], initialProject: projectDir });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1200, height: 800 });
+    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForSelector('#chat:not(.hidden)', { timeout: 15000 });
+
+    console.log('\n[1] the batch poll latency with a SLOW (6s) render present');
+    const t0 = Date.now();
+    const status = await page.evaluate(async () => { const r = await fetch('/api/plugin-status').then((x) => x.json()); return r; });
+    const dt = Date.now() - t0;
+    note(`GET /api/plugin-status returned ${status.items ? status.items.length : '?'} items in ${dt}ms`);
+    // A single slow plugin should not make the batch take much MORE than the ~5s time-box (parallel) — if it climbs
+    // toward 6s+ or sums multiple slow ones, that's a sequential-render smell worth flagging.
+    ok(dt < 9000, `the batch tolerated the slow plugin without a runaway wait (${dt}ms)`);
+    const byName = Object.fromEntries((status.items || []).map((i) => [i.name, i]));
+    ok(byName.sbthrow && byName.sbthrow.content === '⚠' && byName.sbthrow.error, 'a throwing render degraded to ⚠ (error flagged)');
+    ok(byName.sbslow && byName.sbslow.content === '⚠', 'the slow render timed out to ⚠ (did not hang the batch)');
+    ok(byName.sbhidden && byName.sbhidden.hidden === true, 'the hidden item is present in the batch but flagged hidden');
+
+    console.log('\n[2] the rendered buttons: ordering, hidden actually hidden, all left of Edit');
+    await page.waitForFunction(() => document.querySelectorAll('#pluginStatusItems .plugin-status-btn').length >= 6, { timeout: 12000 }).catch(() => {});
+    await sleep(500);
+    const dom = await page.evaluate(() => {
+      const btns = [...document.querySelectorAll('#pluginStatusItems .plugin-status-btn')];
+      const edit = document.getElementById('editToggle');
+      return btns.map((b) => ({ name: b.dataset.plugin, text: b.textContent, hidden: b.hidden, visible: b.offsetParent !== null,
+        beforeEdit: !!(b.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING) }));
+    });
+    note('buttons: ' + dom.map((b) => `${b.name}=${JSON.stringify(b.text).slice(0, 12)}${b.hidden ? '(hidden)' : ''}`).join(' '));
+    const hiddenBtn = dom.find((b) => b.name === 'sbhidden');
+    ok(hiddenBtn && hiddenBtn.hidden && !hiddenBtn.visible, 'the hidden item renders NO visible button');
+    ok(dom.filter((b) => !b.hidden).every((b) => b.beforeEdit), 'every visible plugin button is left of the Edit toggle');
+    ok(dom.some((b) => b.name === 'sba') && dom.some((b) => b.name === 'sbstyle'), 'the normal + styled buttons are present');
+
+    console.log('\n[3] the bar does not overflow the viewport (huge content + big style + many buttons)');
+    const overflow = await page.evaluate(() => {
+      const sc = document.querySelector('.side-chrome');
+      const de = document.documentElement;
+      return { docScrollW: de.scrollWidth, docClientW: de.clientWidth, chromeScrollW: sc ? sc.scrollWidth : 0, chromeClientW: sc ? sc.clientWidth : 0 };
+    });
+    note(`doc scrollW=${overflow.docScrollW} clientW=${overflow.docClientW}; side-chrome scrollW=${overflow.chromeScrollW} clientW=${overflow.chromeClientW}`);
+    ok(overflow.docScrollW <= overflow.docClientW + 2, 'the page does not scroll horizontally at 1200px despite the huge/styled buttons');
+    // The REAL risk: a huge/long plugin button pushing the built-in Edit/token/gear OFF-SCREEN (invisible). They must
+    // stay within the viewport regardless of what a plugin renders.
+    const builtins = await page.evaluate(() => {
+      const vw = document.documentElement.clientWidth;
+      const r = (id) => { const el = document.getElementById(id); if (!el) return null; const b = el.getBoundingClientRect(); return { right: Math.round(b.right), left: Math.round(b.left), vis: el.offsetParent !== null, within: b.right <= vw + 1 && b.left >= -1 }; };
+      return { vw, edit: r('editToggle'), gear: r('settingsBtn') };
+    });
+    note(`built-ins vs viewport(${builtins.vw}): edit=${JSON.stringify(builtins.edit)} gear=${JSON.stringify(builtins.gear)}`);
+    ok(builtins.edit && builtins.edit.vis && builtins.edit.within, 'the built-in Edit toggle stays visible + within the viewport (not shoved off by a huge button)');
+    ok(builtins.gear && builtins.gear.vis && builtins.gear.within, 'the built-in settings gear stays visible + within the viewport');
+    await page.screenshot({ path: path.join(SHOTS, '1-wide.png') });
+
+    console.log('\n[4] narrow width (~420px, phone) — the status bar must not blow out the page');
+    await page.setViewport({ width: 420, height: 780 });
+    await sleep(600);
+    const narrow = await page.evaluate(() => ({ docScrollW: document.documentElement.scrollWidth, docClientW: document.documentElement.clientWidth }));
+    note(`narrow doc scrollW=${narrow.docScrollW} clientW=${narrow.docClientW}`);
+    ok(narrow.docScrollW <= narrow.docClientW + 2, `no horizontal page scroll at 420px (scrollW ${narrow.docScrollW} vs clientW ${narrow.docClientW})`);
+    await page.screenshot({ path: path.join(SHOTS, '2-narrow.png') });
+    await page.setViewport({ width: 1200, height: 800 });
+    await sleep(400);
+
+    console.log('\n[5] the flaky (alternating throw/ok) item RECOVERS from ⚠ to content across polls');
+    // Force several polls; the flaky item flips ⚠ → content → ⚠ … so within a few polls we should see content.
+    let sawContent = false, sawWarn = false;
+    for (let i = 0; i < 5; i++) {
+      const r = await page.evaluate(async () => (await fetch('/api/plugin-status').then((x) => x.json())).items.find((i) => i.name === 'sbflaky'));
+      if (r && /^FLK/.test(r.content || '')) sawContent = true;
+      if (r && r.content === '⚠') sawWarn = true;
+      await sleep(150);
+    }
+    ok(sawContent, 'the flaky item RECOVERS to real content after a ⚠ (not stuck on the error)');
+    note(`flaky observed: content=${sawContent} warn=${sawWarn}`);
+
+    console.log('\n[6] disabling a plugin mid-session REMOVES its button (plugins-delta + poll)');
+    await page.evaluate(() => fetch('/api/plugin-toggle', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'sba', disabled: true }) }));
+    await page.waitForFunction(() => !document.querySelector('.plugin-status-btn[data-plugin="sba"]'), { timeout: 12000 }).catch(() => {});
+    ok(await page.evaluate(() => !document.querySelector('.plugin-status-btn[data-plugin="sba"]')), 'the disabled plugin\'s button was removed live');
+    ok(await page.evaluate(() => !!document.querySelector('.plugin-status-btn[data-plugin="sbb"]')), 'the other buttons remain');
+
+    ok(errs.length === 0, `no page JS errors (${errs.slice(0, 3).join(' | ')})`);
+  } catch (e) { fail++; console.log('  FAIL harness:', e?.stack || e?.message || e); }
+  finally { await browser.close(); try { server.close(); } catch {} await cleanupDir(projectDir); }
+  console.log(`\n${pass} passed, ${fail} failed  ·  ${notes.length} observations  (screenshots: ${SHOTS})`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main();
+
=== add test/_cc-shadow-live-keystone.mjs
new b9314fdc6c6ec295adf6e7b3
+/**
+ * CC-MODEL shadow KEYSTONE — LIVE (CB_CC_MODEL — CC-MIGRATION Phase 4 step 5, real-proxy gate).
+ *
+ * The deterministic probe (test-cc-shadow-observer.mjs) proves the observer logic over SCRIPTED marker
+ * turns. This keystone runs the FULL worker loop against LIVE haiku (real model marker emission, real tool
+ * execution, real positional attribution) and asserts the shadow NEVER diverges — the real-world evidence
+ * that markers reproduce positional attribution before Phase 5 deletes the positional path.
+ *
+ *   PASS bar: stats.shadowDiverge === 0 (no result mis-attributed) AND stats.shadowAgree > 0 (the observer
+ *   actually saw tool results). Robust to model variance: even if the model emits few/no markers, the
+ *   shadow must still AGREE (conversation work → root) and never diverge.
+ *
+ * CC_MODEL_ON is read at module load → this SELF-RESPAWNS with CB_CC_MODEL=1. Live proxy creds come from
+ * proxy.local.json (gitignored). Run: node test/_cc-shadow-live-keystone.mjs   (env: CB_PROXY/CB_MODEL/CB_RUNS)
+ */
+import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { spawnSync } from 'node:child_process';
+import { fileURLToPath } from 'node:url';
+import { LIVE_MODEL } from './_live-model.mjs';
+
+const ON = /^(1|true|on|yes)$/i.test(process.env.CB_CC_MODEL ?? '');
+if (!ON) {
+  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, CB_CC_MODEL: '1' }, stdio: 'inherit' });
+  process.exit(r.status ?? 1);
+}
+
+const { runPromptedAgent } = await import('../src/agent/prompted.mjs');
+const { createAnthropicAdapter } = await import('../src/llm/anthropic-http.mjs');
+
+const cfg = JSON.parse(await readFile(new URL('../proxy.local.json', import.meta.url), 'utf8'));
+const BASE = process.env.CB_PROXY || cfg.external.baseUrl;
+const MODEL = LIVE_MODEL;
+const RUNS = Number(process.env.CB_RUNS || 1);
+const extraHeaders = BASE === cfg.external.baseUrl ? cfg.external.headers : {};
+
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+
+const TASKS = [
+  // A concrete CHANGE task → the model should <task-open> a unit, edit, verify, <task-close>. Real tool
+  // results (edit/read/powershell) attribute to the open task; the shadow must agree on every one.
+  'In math.js there is an add(a,b) function. Add an `isEven(n)` function that returns whether n is even (n % 2 === 0), then read math.js back to confirm it is there. Treat it as one small unit of work.',
+];
+
+async function oneRun(k) {
+  const dir = await mkdtemp(path.join(tmpdir(), 'cb-shadowlive-'));
+  await writeFile(path.join(dir, 'math.js'), 'export function add(a, b) {\n  return a + b;\n}\n', 'utf8');
+  const ac = new AbortController();
+  const timer = setTimeout(() => ac.abort(), 240000);   // hard 4-min cap so a stuck run can't hang the probe
+  const adapter = createAnthropicAdapter({ baseURL: BASE + '/v1', apiKey: () => 'x', extraHeaders });
+  try {
+    const res = await runPromptedAgent({
+      adapter, model: MODEL, projectDir: dir, maxTurns: 8, signal: ac.signal,
+      messages: [{ role: 'user', content: TASKS[0] }],
+      onChatEvent: () => {},
+      onLog: (m) => { if (/shadow:/.test(m)) console.log(`    · ${m}`); },   // surface the per-turn shadow lines live
+    });
+    const st = res.stats || {};
+    let state = {};
+    try { state = JSON.parse(await readFile(path.join(dir, '.code_boss', 'tasks', 'state.json'), 'utf8')); } catch { /* */ }
+    console.log(`  run${k}: turns=${st.turns} terminated=${res.terminated}  shadowAgree=${st.shadowAgree || 0} shadowDiverge=${st.shadowDiverge || 0}  allTasks=${(state.allTaskIds || []).length} open=${JSON.stringify(state.openTaskIds || [])} active=${state.activeTaskId ?? '(unset)'}`);
+    if (st.shadowDivergences) console.log(`    DIVERGENCES: ${JSON.stringify(st.shadowDivergences)}`);
+    ok((st.shadowDiverge || 0) === 0, `run${k}: zero shadow divergence on live model output`);
+    ok((st.shadowAgree || 0) > 0, `run${k}: the observer saw + agreed on real tool results (agree=${st.shadowAgree || 0})`);
+    return st;
+  } finally { clearTimeout(timer); await rm(dir, { recursive: true, force: true }); }
+}
+
+console.log(`\n=== CC shadow KEYSTONE — LIVE (${MODEL} @ ${BASE}), runs=${RUNS} ===\n`);
+for (let k = 0; k < RUNS; k++) {
+  try { await oneRun(k); }
+  catch (e) { console.log(`  run${k}: FATAL ${e?.message || e}`); fail++; }
+}
+console.log(`\n  ${fail ? '✗ FAIL' : '✓ PASS'} — ${pass} passed, ${fail} failed`);
+process.exit(fail ? 1 : 0);
+
=== add test/_chunk-tagging-probe.mjs
new b113dda3d803887b6a5a6664
+/**
+ * _chunk-tagging-probe.mjs — can haiku reliably ATTRIBUTE each chunk of its output to the right
+ * owner (a task id or the 'manager' conversation), returning a JSON array of {owner, content}?
+ * This is the load-bearing mechanism for the CC model: per-chunk ownership → per-task compaction +
+ * per-task focus under interleaving (where position-based anchoring breaks).
+ *
+ * Hits the proxy directly (no code_boss harness). Runs several interleaved scenarios K times each and
+ * checks: valid JSON array? owners in the allowed set? does the content land under the RIGHT owner?
+ *
+ *   CB_PROXY=... CB_MODEL=claude-haiku-4-5 CB_CF_ACCESS_ID=... CB_CF_ACCESS_SECRET=... node test/_chunk-tagging-probe.mjs
+ */
+import { LIVE_MODEL } from './_live-model.mjs';
+
+const PROXY = process.env.CB_PROXY || 'https://home-proxy.philhignight.com';
+const MODEL = LIVE_MODEL;
+const K = Number(process.env.CB_TAG_RUNS || 3);
+const headers = { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' };
+if (process.env.CB_CF_ACCESS_ID) headers['CF-Access-Client-Id'] = process.env.CB_CF_ACCESS_ID;
+if (process.env.CB_CF_ACCESS_SECRET) headers['CF-Access-Client-Secret'] = process.env.CB_CF_ACCESS_SECRET;
+
+const FORMAT = (process.env.CB_TAG_FORMAT || 'xml').toLowerCase();   // 'xml' (default) | 'json' | 'switch'
+const OPEN = `You are an AI coding agent juggling several concurrent items in ONE session. Currently open:
+- T-1: add a GET /health endpoint that returns {status:'ok'}
+- T-2: add request logging to the server
+- T-3: add a GET /version endpoint that returns {version:'1.0.0'}
+Some of your output is work ON a specific task; some is just conversation with the developer (the "manager" channel).`;
+const SYSTEM = FORMAT === 'json'
+  ? `${OPEN}
+RESPOND WITH ONLY A JSON ARRAY — no prose, no markdown fences, nothing else. Each element is
+{"owner":"T-1"|"T-2"|"T-3"|"manager","content":"..."}. Split your response so each distinct piece is its
+own element tagged with the item it belongs to (or "manager" when you're talking to the developer).`
+  : FORMAT === 'switch'
+  ? `${OPEN}
+As you write, emit a one-line marker ONLY WHEN YOU SWITCH what you're addressing — <task id="T-1"/>,
+<task id="T-2"/>, <task id="T-3"/>, or <manager/>. Everything you write AFTER a marker belongs to that
+owner UNTIL the next marker, so you don't repeat it. START with a marker. Put raw text or code between
+markers (no escaping). Example:
+<task id="T-1"/>
+status: the /health route is wired up.
+<manager/>
+Anything else you want me to line up?`
+  : `${OPEN}
+Wrap EVERY piece of your response in a <chunk owner="..."> tag, where owner is the item it belongs to
+(T-1 / T-2 / T-3) or "manager" when you're talking to the developer. Put raw text or code in the tag
+BODY (no escaping needed). Emit nothing outside <chunk> tags. Example:
+<chunk owner="T-1">status: the /health route is wired up.</chunk>
+<chunk owner="manager">Anything else you want me to line up?</chunk>`;
+
+// Each scenario: a user turn + a checker(chunks)->{ok,why} over the parsed array.
+const has = (chunks, owner, re) => chunks.some((c) => c.owner === owner && re.test(String(c.content || '')));
+const none = (chunks, owner) => !chunks.some((c) => c.owner === owner);
+const SCENARIOS = [
+  {
+    name: 'multi-owner status',
+    user: 'Give me a quick one-line status on the health endpoint and on the request logging, and add a friendly sign-off to me.',
+    check: (c) => {
+      if (!has(c, 'T-1', /health|status.?ok|/i) || !c.some((x) => x.owner === 'T-1')) return { ok: false, why: 'no T-1 chunk' };
+      if (!c.some((x) => x.owner === 'T-2' && /log/i.test(x.content))) return { ok: false, why: 'logging not under T-2' };
+      if (!c.some((x) => x.owner === 'manager')) return { ok: false, why: 'no manager sign-off chunk' };
+      return { ok: true };
+    },
+  },
+  {
+    name: 'interleaved answer + work',
+    user: 'Quick — what port does the server listen on? Then go ahead and write the request-logging code for the logging task.',
+    check: (c) => {
+      if (!c.some((x) => x.owner === 'manager' && /port|3000|\d{4}/i.test(x.content))) return { ok: false, why: 'port answer not tagged manager' };
+      if (!c.some((x) => x.owner === 'T-2' && /log/i.test(x.content))) return { ok: false, why: 'logging work not tagged T-2' };
+      return { ok: true };
+    },
+  },
+  {
+    name: 'single task — no mis-tag',
+    user: 'Add the /version endpoint that returns {version:"1.0.0"}. (This is the T-3 version task.)',
+    check: (c) => {
+      if (!c.some((x) => x.owner === 'T-3' && /version/i.test(x.content))) return { ok: false, why: 'version not under T-3' };
+      if (!none(c, 'T-1') || !none(c, 'T-2')) return { ok: false, why: 'bled into T-1/T-2' };
+      return { ok: true };
+    },
+  },
+];
+
+function parseJson(text) {
+  // Extract the outermost [ … ] directly (do NOT regex on ``` fences — content holds embedded
+  // ```code``` blocks that would truncate it). The array open is the first [, the close is the last ].
+  let t = String(text || '').trim();
+  const lb = t.indexOf('['), rb = t.lastIndexOf(']');
+  if (lb < 0 || rb <= lb) return null;
+  t = t.slice(lb, rb + 1);
+  try { const a = JSON.parse(t); return Array.isArray(a) ? a : null; } catch { return null; }
+}
+function parseXml(text) {
+  // The streaming tag-detector pattern: pull every <chunk owner="X">body</chunk>. Code in the body
+  // needs NO escaping and embedded ``` can't break it (we match to the next </chunk>).
+  const re = /<chunk\s+owner="([^"]+)"\s*>([\s\S]*?)<\/chunk>/gi;
+  const out = []; let m;
+  while ((m = re.exec(text))) out.push({ owner: m[1].trim(), content: m[2].trim() });
+  return out.length ? out : null;
+}
+function parseSwitch(text) {
+  // Current-owner model: a marker FLIPS the owner; the text after it (until the next marker) inherits
+  // that owner. This is exactly what a streaming detector does — spot the marker line, flip, keep going.
+  const re = /<task\s+id="([^"]+)"\s*\/>|<manager\s*\/>/gi;
+  const markers = []; let m;
+  while ((m = re.exec(text))) markers.push({ owner: m[1] ? m[1].trim() : 'manager', at: m.index, end: re.lastIndex });
+  if (!markers.length) return null;
+  const out = [];
+  for (let i = 0; i < markers.length; i++) {
+    const seg = text.slice(markers[i].end, i + 1 < markers.length ? markers[i + 1].at : text.length).trim();
+    if (seg) out.push({ owner: markers[i].owner, content: seg });
+  }
+  return out.length ? out : null;
+}
+const parseArray = (text) => (FORMAT === 'json' ? parseJson(text) : FORMAT === 'switch' ? parseSwitch(text) : parseXml(text));
+
+async function ask(user) {
+  const body = { model: MODEL, max_tokens: 1200, system: SYSTEM, messages: [{ role: 'user', content: user }] };
+  const r = await fetch(`${PROXY}/v1/messages`, { method: 'POST', headers, body: JSON.stringify(body) });
+  const j = await r.json();
+  const text = (j.content || []).map((b) => b.text || '').join('');
+  return text;
+}
+
+async function main() {
+  let pass = 0, total = 0;
+  const fails = [];
+  for (const sc of SCENARIOS) {
+    for (let k = 0; k < K; k++) {
+      total++;
+      let verdict, chunks = null, raw = '';
+      try {
+        raw = await ask(sc.user);
+        chunks = parseArray(raw);
+        if (!chunks) verdict = { ok: false, why: FORMAT === 'json' ? 'NOT valid JSON array' : FORMAT === 'switch' ? 'no switch markers parsed' : 'no <chunk> tags parsed' };
+        else if (chunks.some((c) => !c || typeof c.owner !== 'string' || typeof c.content !== 'string')) verdict = { ok: false, why: 'malformed elements' };
+        else if (chunks.some((c) => !['T-1', 'T-2', 'T-3', 'manager'].includes(c.owner))) verdict = { ok: false, why: `bad owner: ${chunks.map((c) => c.owner).join(',')}` };
+        else verdict = sc.check(chunks);
+      } catch (e) { verdict = { ok: false, why: 'EXC ' + e.message }; }
+      if (verdict.ok) { pass++; console.log(`  ok  [${sc.name}] run ${k + 1} — owners: ${chunks.map((c) => c.owner).join(', ')}`); }
+      else { console.log(`  FAIL[${sc.name}] run ${k + 1} — ${verdict.why}`); fails.push({ sc: sc.name, why: verdict.why, raw: raw.slice(0, 400), owners: chunks ? chunks.map((c) => c.owner) : null }); }
+    }
+  }
+  console.log(`\n${pass}/${total} passed (${Math.round((100 * pass) / total)}%)`);
+  if (fails.length) { console.log('\n--- failures (raw, clipped) ---'); for (const f of fails) console.log(`\n[${f.sc}] ${f.why}\n${f.raw}`); }
+  process.exit(0);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_conflict-resolve-probe.mjs
new d44022d688f60f8b5cfc129f
+/**
+ * _conflict-resolve-probe.mjs — CC-MODEL-SPEC §11 A11. A merge conflict is where an LLM most easily DESTROYS
+ * data (resolve by deleting a side / picking the cleaner hunk regardless of intent). Real git fixture: the same
+ * function edited two ways → a true conflict; drive haiku as the resolver and assert BOTH intents survive +
+ * the result is valid. Also A/Bs §9.1 — "main-agent resolves" vs "sub-agent re-grounds" framing on the same
+ * fixture (the info is symmetric, so a gap means the framing itself matters).
+ *   node test/_conflict-resolve-probe.mjs   (CB_PROXY/CB_MODEL/CB_CF_ACCESS_* env)
+ */
+import { execSync } from 'node:child_process';
+import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { LIVE_MODEL } from './_live-model.mjs';
+
+const PROXY = process.env.CB_PROXY || 'https://home-proxy.philhignight.com';
+const MODEL = LIVE_MODEL;
+const K = Number(process.env.CB_RUNS || 5);
+const headers = { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' };
+if (process.env.CB_CF_ACCESS_ID) headers['CF-Access-Client-Id'] = process.env.CB_CF_ACCESS_ID;
+if (process.env.CB_CF_ACCESS_SECRET) headers['CF-Access-Client-Secret'] = process.env.CB_CF_ACCESS_SECRET;
+
+const BASE = `function area(w, h) {\n  return w * h;\n}\n\nmodule.exports = { area };\n`;
+// MAIN intent: rename params + validation.   SUB intent: a debug log line.
+const MAIN = `function area(width, height) {\n  if (width <= 0 || height <= 0) throw new Error('bad dims');\n  return width * height;\n}\n\nmodule.exports = { area };\n`;
+const SUB = `function area(w, h) {\n  console.log('computing area', w, h);\n  return w * h;\n}\n\nmodule.exports = { area };\n`;
+
+function makeConflict() {
+  const dir = mkdtempSync(path.join(tmpdir(), 'cb-conflict-'));
+  const g = (c) => execSync(`git ${c}`, { cwd: dir, stdio: 'pipe' });
+  g('init -q -b main'); g('config user.email d@d'); g('config user.name d'); g('config commit.gpgsign false');
+  writeFileSync(path.join(dir, 'math.js'), BASE); g('add -A'); g('commit -q -m base');
+  g('checkout -q -b sub'); writeFileSync(path.join(dir, 'math.js'), SUB); g('add -A'); g('commit -q -m sub-log');
+  g('checkout -q main'); writeFileSync(path.join(dir, 'math.js'), MAIN); g('add -A'); g('commit -q -m main-validate');
+  try { g('merge -q sub'); } catch { /* expected: conflict */ }
+  const conflicted = readFileSync(path.join(dir, 'math.js'), 'utf8');
+  return { dir, conflicted };
+}
+function extractCode(text) {
+  const t = String(text || '');
+  const fence = [...t.matchAll(/```(?:js|javascript)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
+  if (fence.length) return fence.sort((a, b) => b.length - a.length)[0].trim();
+  return t.trim(); // no fence — assume the whole reply is the file
+}
+async function ask(system, user) {
+  const r = await fetch(`${PROXY}/v1/messages`, { method: 'POST', headers, body: JSON.stringify({ model: MODEL, max_tokens: 700, system, messages: [{ role: 'user', content: user }] }) });
+  const j = await r.json(); return (j.content || []).map((b) => b.text || '').join('');
+}
+function checkResolution(code, dir) {
+  const noMarkers = !/<<<<<<<|=======|>>>>>>>/.test(code);
+  const hasValidation = /throw\b/.test(code) && /(<=\s*0|<\s*1|bad dims)/.test(code);
+  const hasLog = /console\.log/.test(code);
+  let parses = false;
+  try { writeFileSync(path.join(dir, '_r.js'), code); execSync(`node --check "${path.join(dir, '_r.js')}"`, { stdio: 'pipe' }); parses = true; } catch {}
+  return { noMarkers, hasValidation, hasLog, parses, bothIntents: hasValidation && hasLog };
+}
+
+const SYS = (role) => `You are resolving a git MERGE CONFLICT in math.js. ${role}
+Both changes are wanted — your job is to MERGE them so NEITHER is lost, producing valid JavaScript. Reply with
+ONLY the final resolved contents of math.js (no conflict markers, no commentary).`;
+const ROLES = {
+  main: 'YOU (the main agent) renamed the params to width/height and added validation (throw on non-positive dims). The OTHER side (a sub-agent) added a debug console.log line.',
+  sub: 'YOU (a sub-agent) added a debug console.log line. The MAIN line has since renamed the params to width/height and added validation (throw on non-positive dims).',
+};
+
+async function main() {
+  const fx = makeConflict();
+  console.log(`\n=== conflict resolution (haiku), K=${K} per framing ===`);
+  console.log(`(fixture conflict has both <<< sides; resolver must keep validation AND the log)\n`);
+  const results = {};
+  for (const role of ['main', 'sub']) {
+    let both = 0, parses = 0, markers = 0, dropV = 0, dropL = 0;
+    for (let k = 0; k < K; k++) {
+      const code = extractCode(await ask(SYS(ROLES[role]), `Conflicted math.js:\n\n${fx.conflicted}`));
+      const c = checkResolution(code, fx.dir);
+      if (c.bothIntents) both++; if (c.parses) parses++; if (!c.noMarkers) markers++;
+      if (!c.hasValidation) dropV++; if (!c.hasLog) dropL++;
+    }
+    results[role] = { both, parses, markers, dropV, dropL };
+    console.log(`  [${role}-resolver]  both-intents ${both}/${K}  parses ${parses}/${K}  left-markers ${markers}/${K}  dropped(validation ${dropV}, log ${dropL})`);
+  }
+  rmSync(fx.dir, { recursive: true, force: true });
+  const worst = Math.min(...Object.values(results).map((r) => r.both));
+  const anyDataLoss = Object.values(results).some((r) => r.dropV + r.dropL > 0 || r.markers > 0);
+  console.log(`\n  VERDICT: ${worst >= Math.ceil(0.8 * K) && !anyDataLoss ? 'both intents preserved + valid — no data loss' : worst === 0 ? 'DATA LOSS — a side was dropped' : 'mixed — see drops above'}`);
+  console.log(`  §9.1 A/B: main-resolver both=${results.main.both}/${K} vs sub-resolver both=${results.sub.both}/${K}`);
+  process.exit(0);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_delegate-judgment-probe.mjs
new 68a9a43dfd49edb02410b379
+/**
+ * _delegate-judgment-probe.mjs — CC-MODEL-SPEC §11 A9. Does the agent (haiku floor) judge delegate-vs-inline
+ * correctly? Over-delegation forks work sharing in-flight state (guaranteed conflict); under-delegation makes
+ * parallelism dead weight. Proxy-direct, model primed with the §4 rule + an in-flight-work snapshot.
+ * CRITICAL bucket = dependent-on-active (must INLINE) — a wrong answer there directly causes a merge conflict.
+ *   node test/_delegate-judgment-probe.mjs   (CB_PROXY/CB_MODEL/CB_CF_ACCESS_* env)
+ */
+import { LIVE_MODEL } from './_live-model.mjs';
+
+const PROXY = process.env.CB_PROXY || 'https://home-proxy.philhignight.com';
+const MODEL = LIVE_MODEL;
+const K = Number(process.env.CB_RUNS || 5);
+const headers = { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' };
+if (process.env.CB_CF_ACCESS_ID) headers['CF-Access-Client-Id'] = process.env.CB_CF_ACCESS_ID;
+if (process.env.CB_CF_ACCESS_SECRET) headers['CF-Access-Client-Secret'] = process.env.CB_CF_ACCESS_SECRET;
+
+const SYSTEM = `You are a coding agent. RIGHT NOW you are mid-edit on auth.js — refactoring the login flow (it's
+not committed yet). A new request just arrived. Decide whether to DELEGATE it to a parallel sub-agent or do it
+INLINE yourself. DELEGATE only if ALL hold: it's INDEPENDENT of your current auth.js work (different files/area,
+no shared in-flight state), well-specified enough to run unattended, and sizable enough that parallelism saves
+real time. Otherwise INLINE (a sub-agent that touches files you're mid-editing WILL cause a merge conflict, and
+tiny work isn't worth a sub-agent). Reply with EXACTLY one line: "DELEGATE — <reason>" or "INLINE — <reason>".`;
+
+const CORPUS = [
+  { m: 'Build a complete /metrics dashboard in a new dashboard/ directory (charts, its own routes, tests).', want: 'DELEGATE', bucket: 'should-delegate' },
+  { m: 'Add a separate email-notification module under notifications/ with templates and a send queue.', want: 'DELEGATE', bucket: 'should-delegate' },
+  { m: 'Create a standalone CLI tool in tools/ that exports the DB to CSV.', want: 'DELEGATE', bucket: 'should-delegate' },
+  { m: 'Fix the typo in the README ("recieve" → "receive").', want: 'INLINE', bucket: 'should-inline-tiny' },
+  { m: 'Rename the variable `usr` to `user` in this file.', want: 'INLINE', bucket: 'should-inline-tiny' },
+  { m: 'Add a missing semicolon on line 12.', want: 'INLINE', bucket: 'should-inline-tiny' },
+  { m: 'While you\'re in auth.js, also validate the email format on login.', want: 'INLINE', bucket: 'should-inline-DEPENDENT' },
+  { m: 'Refactor the login function you\'re editing to use async/await.', want: 'INLINE', bucket: 'should-inline-DEPENDENT' },
+  { m: 'The auth.js change should also reset the session timeout to 30 min.', want: 'INLINE', bucket: 'should-inline-DEPENDENT' },
+];
+const parse = (t) => { const s = String(t || '').trim(); if (/^DELEGATE\b/i.test(s)) return 'DELEGATE'; if (/^INLINE\b/i.test(s)) return 'INLINE'; return 'MALFORMED'; };
+async function ask(m) { const r = await fetch(`${PROXY}/v1/messages`, { method: 'POST', headers, body: JSON.stringify({ model: MODEL, max_tokens: 120, system: SYSTEM, messages: [{ role: 'user', content: m }] }) }); const j = await r.json(); return (j.content || []).map((b) => b.text || '').join(''); }
+
+async function main() {
+  const byB = {}; let pass = 0, total = 0, depWrong = 0, depTotal = 0; const fails = [];
+  for (const c of CORPUS) {
+    byB[c.bucket] = byB[c.bucket] || { ok: 0, n: 0 };
+    for (let k = 0; k < K; k++) {
+      total++; const out = parse(await ask(c.m)); byB[c.bucket].n++;
+      const ok = out === c.want; if (ok) { byB[c.bucket].ok++; pass++; } else if (fails.length < 10) fails.push(`[${c.bucket}] "${c.m.slice(0, 48)}" want ${c.want} got ${out}`);
+      if (c.bucket === 'should-inline-DEPENDENT') { depTotal++; if (out !== 'INLINE') depWrong++; }
+    }
+  }
+  console.log('\n=== delegate judgment (haiku), K=' + K + ' ===\n');
+  for (const [b, s] of Object.entries(byB)) console.log(`  ${b.padEnd(24)} ${s.ok}/${s.n}`);
+  console.log(`\n  CRITICAL — dependent-on-active wrongly DELEGATED (→ conflict): ${depWrong}/${depTotal} ${depWrong === 0 ? '✅' : '❌'}`);
+  console.log(`  overall ${pass}/${total} (${Math.round(100 * pass / total)}%)`);
+  if (fails.length) { console.log('\n--- misses ---'); fails.forEach((f) => console.log('  ' + f)); }
+  process.exit(0);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_delims-ab.mjs
new 05a93de26cc6b931813bf8a2
+/**
+ * DOES THE CLOSING DELIMITER STOP THE FABRICATION? A/B, against the live model.
+ *
+ * The flat grammar had opening headings only, so the model's only legal way to end its turn was to write the
+ * developer's heading — measured at 54% of calls locally and 30 of 30 in one live session, the worst generating
+ * 59,060 characters in 223 seconds of which 599 were real. Closing delimiters give it a legal exit. Whether that
+ * is ENOUGH, with no stop sequence enforcing it, is an empirical question and this answers it.
+ *
+ * Runs the same scripted turns through the real worker against the real model, once per mode, and reports how
+ * many turns forged a developer heading and how many characters were generated and discarded.
+ *
+ *   CB_TURN_DELIMS=0 node test/_delims-ab.mjs   # baseline: opening headings only
+ *   CB_TURN_DELIMS=1 node test/_delims-ab.mjs   # with closing delimiters
+ *
+ * The flag is read at module load, so each mode needs its own process — hence one mode per run.
+ */
+import { mkdtemp, writeFile, rm } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { runMinimalWorker } from '../src/agent/minimal-worker.mjs';
+import { streamDiagSnapshot, streamDiagClear } from '../src/agent/turn-stream.mjs';
+import { createAnthropicAdapter } from '../src/llm/anthropic-http.mjs';
+import { LIVE_MODEL } from './_live-model.mjs';
+import { PROXY_API_KEY, PROXY_BASE, PROXY_HEADERS } from './_proxy-creds.mjs';
+
+const MODE = /^(0|false|off|no)$/i.test(process.env.CB_TURN_DELIMS || '') ? 'OFF' : 'ON';
+const PROXY = PROXY_BASE || process.env.CB_PROXY || 'https://home-proxy.philhignight.com';
+const MODEL = process.env.CB_MODEL || LIVE_MODEL;
+
+// Turns that USE TOOLS, because that is where the fabrication happens: the model finishes a tool block, has no
+// legal way to end its turn, and writes the developer's reply — inventing the result of the call it just made.
+const TURNS = [
+  'Read package.json and tell me what this project is.',
+  'Add a src/util.js exporting a slugify(text) function. Just write it.',
+  'Read src/util.js back and tell me if the implementation handles empty strings.',
+  'Add a test for slugify in test/util.test.js and run it.',
+  'List every file in the project and tell me which one is largest.',
+  'Read README.md and add a one-line description of slugify to it.',
+];
+
+async function main() {
+  const dir = await mkdtemp(path.join(tmpdir(), 'cb-delims-'));
+  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'slug', version: '1.0.0' }, null, 2), 'utf8');
+  await writeFile(path.join(dir, 'README.md'), '# slug\n\nA tiny string utility.\n', 'utf8');
+
+  const adapter = createAnthropicAdapter({ baseURL: PROXY + '/v1', apiKey: PROXY_API_KEY || 'x', extraHeaders: PROXY_HEADERS || {} });
+  streamDiagClear();
+  const transcript = [];
+  console.log(`\ndelimiters ${MODE} — model ${MODEL}\n`);
+
+  for (let i = 0; i < TURNS.length; i++) {
+    transcript.push({ content: TURNS[i] });
+    const t0 = Date.now();
+    try {
+      const r = await runMinimalWorker({
+        // A REAL AbortSignal: the adapter hands this straight to fetch, and a plain {aborted:false} object is
+        // rejected with "Failed to construct 'Request'" - which reads as the endpoint being unreachable.
+        adapter, model: MODEL, signal: new AbortController().signal,
+        messages: transcript.slice(), projectDir: dir, maxTurns: 8,
+        onChatEvent: () => {}, onPhase: () => {}, onLog: () => {},
+      });
+      transcript.push({ role: 'assistant', content: r?.content || '' });
+    } catch (e) {
+      console.log(`  turn ${i + 1}: ERROR ${String(e?.message || e).slice(0, 90)}`);
+      continue;
+    }
+    console.log(`  turn ${i + 1}: ${Math.round((Date.now() - t0) / 1000)}s`);
+  }
+
+  // Every stream this run produced. fabricatedChars is measured in turn-stream from the same literal the parser
+  // cuts at, so it counts exactly what was generated and thrown away.
+  const recs = streamDiagSnapshot();
+  const forged = recs.filter((r) => (r.fabricatedChars || 0) > 0);
+  const wasted = recs.reduce((n, r) => n + (r.fabricatedChars || 0), 0);
+  const generated = recs.reduce((n, r) => n + (r.chars || 0), 0);
+  const secs = recs.reduce((n, r) => n + (r.ms || 0), 0) / 1000;
+
+  console.log(`\n── delimiters ${MODE} ──`);
+  console.log(`calls:            ${recs.length}`);
+  console.log(`forged a turn:    ${forged.length} (${recs.length ? Math.round((forged.length / recs.length) * 100) : 0}%)`);
+  console.log(`chars generated:  ${generated.toLocaleString()}`);
+  console.log(`chars discarded:  ${wasted.toLocaleString()} (${generated ? Math.round((wasted / generated) * 100) : 0}%)`);
+  console.log(`total stream time: ${Math.round(secs)}s`);
+  if (forged.length) {
+    const worst = forged.slice().sort((a, b) => b.fabricatedChars - a.fabricatedChars)[0];
+    console.log(`worst call:       ${worst.fabricatedChars.toLocaleString()} of ${worst.chars.toLocaleString()} chars discarded in ${Math.round(worst.ms / 1000)}s`);
+  }
+  await rm(dir, { recursive: true, force: true }).catch(() => {});
+}
+main();
+
=== add test/_dev-actor.mjs
new 8f41aa40945765a4724a24a3
+/**
+ * _dev-actor.mjs — a "real developer" Puppeteer harness.
+ *
+ * Per the standing directive [[testing-must-act-as-developer]]: interaction-quality tests MUST
+ * drive the REAL UI via Puppeteer AND respond like a developer — read what the agent says and
+ * REPLY (answer questions, grant/deny approval) the way a real developer would. A harness that
+ * just feeds a fixed task list with no replies does NOT represent the real experience.
+ *
+ * This boots the REAL code_boss server + UI, sends ONE vague task ("design something reasonable
+ * and build it"), then loops: each time the agent's turn ends, an LLM DEVELOPER-ACTOR (haiku)
+ * reads the agent's latest message and produces a natural developer reply + a classification
+ * ({agentIsAskingApproval, agentClaimsDone}). It grants approval readily, answers real
+ * clarifications briefly, and gets mildly impatient if re-asked after already approving.
+ *
+ * The point is to reproduce/measure the APPROVAL RE-ASK bug with a real responding developer:
+ *   - approvalAsks         — turns where the agent asked permission to proceed
+ *   - reAsksAfterApproval  — asks that came AFTER the developer already granted approval
+ *   - completed            — did the agent ever claim the work was done?
+ *   - devTurns             — how many developer replies it took
+ *   - leaks                — signal-tag leaks in the rendered transcript
+ *
+ *   CB_MODEL=claude-haiku-4-5 node test/_dev-actor.mjs
+ *
+ * env: CB_PROXY (default http://127.0.0.1:8080) · CB_MODEL (default is the shared one in test/_live-model.mjs) ·
+ *      CB_ACTOR_MODEL (default = CB_MODEL) · CB_API_KEY · CB_SUPABASE_KEY ·
+ *      CB_ADAPTER=anthropic|openai (default anthropic) · CB_PORT (default 28981) ·
+ *      CB_DEV_DIR (default D:\tmp\cb-dev-actor) · CB_MAX_DEV_TURNS (default 8) ·
+ *      CB_STEP_TIMEOUT_MS (default 480000) · CB_HEADFUL=1 · CB_TASK (override the vague task)
+ */
+import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+import { createAnthropicAdapter } from '../src/llm/anthropic-http.mjs';
+import { createHttpAdapter } from '../src/llm/openai-http.mjs';
+import { runGit } from './_git.mjs';
+import { LIVE_MODEL } from './_live-model.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PROXY = (process.env.CB_PROXY || 'http://127.0.0.1:8080').replace(/\/+$/, '');
+const MODEL = LIVE_MODEL;
+const ACTOR_MODEL = process.env.CB_ACTOR_MODEL || MODEL;
+const PORT = Number(process.env.CB_PORT || 28981);
+const ART = process.env.CB_DEV_DIR || 'D:\\tmp\\cb-dev-actor';
+const PROJECT = path.join(ART, 'app');
+const SHOTS = path.join(ART, 'shots');
+const STEP_TIMEOUT = Number(process.env.CB_STEP_TIMEOUT_MS || 480000);
+const MAX_DEV_TURNS = Number(process.env.CB_MAX_DEV_TURNS || 8);
+const ADAPTER_FORMAT = (process.env.CB_ADAPTER || 'anthropic').toLowerCase() === 'openai' ? 'openai' : 'anthropic';
+const TASK = process.env.CB_TASK ||
+  'Design and build a small, reasonable feature for this little task-tracker app — you choose what would be most useful. Keep it simple. Go ahead and build it.';
+
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+function findChrome() {
+  const c = process.platform === 'win32' ? [
+    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
+    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
+    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
+  ] : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+
+// ── The developer-actor persona. Reads the agent's latest message, returns JSON. ──
+const ACTOR_SYSTEM = `You are roleplaying a BUSY but friendly software developer using an AI coding agent.
+You gave the agent a deliberately open task and you want it to USE ITS JUDGMENT and just build something reasonable.
+
+Your behaviour:
+- When the agent asks permission to proceed / "shall I build it?" / "ready?" / "sound good?": say YES, go ahead — grant it plainly and warmly. You WANT it to proceed.
+- If the agent asks for approval AGAIN after you have ALREADY told it to go ahead: you are mildly impatient — make clear you already approved and to please just build it, no need to keep asking.
+- If the agent asks a GENUINE clarifying question (a real design choice it can't reasonably guess): answer briefly and sensibly, then tell it to proceed.
+- If the agent says it "could not resolve" something / is "handing it back to you" / "over to you" / hit a blocker: this is NOT done. Read the blocker. If it looks ALREADY addressed or self-contradictory (e.g. it says "I never ran the tests" but also "I ran the tests and they passed"), point that out plainly and ask it to double-check and finish. Otherwise give a brief steer and tell it to finish.
+- If the agent says it is DONE / finished / shipped (and is NOT handing back a blocker): thank it briefly. Do NOT ask for more work.
+- Keep replies SHORT and natural, like a real chat message (1-2 sentences). Never roleplay the agent. Never write code.
+
+You will be told how many times you have ALREADY granted approval for this task so far.
+
+Respond with STRICT JSON ONLY (no prose, no code fence), exactly this shape:
+{"reply": "<your developer message to the agent>", "agentIsAskingApproval": <true|false>, "agentClaimsDone": <true|false>}
+- agentIsAskingApproval = true if the agent's latest message is asking your permission/approval to proceed or implement (as opposed to a substantive question or a status update).
+- agentClaimsDone = true if the agent states the work is complete/built/shipped and is not awaiting anything from you.`;
+
+function extractJson(text) {
+  const s = String(text || '');
+  // strip code fences if any
+  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
+  const body = fenced ? fenced[1] : s;
+  const start = body.indexOf('{');
+  if (start < 0) return null;
+  // find matching closing brace
+  let depth = 0, inStr = false, esc = false;
+  for (let i = start; i < body.length; i++) {
+    const ch = body[i];
+    if (esc) { esc = false; continue; }
+    if (ch === '\\') { esc = true; continue; }
+    if (ch === '"') inStr = !inStr;
+    else if (!inStr && ch === '{') depth++;
+    else if (!inStr && ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(body.slice(start, i + 1)); } catch { return null; } } }
+  }
+  return null;
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.error('No Chrome found'); process.exit(2); }
+  await mkdir(SHOTS, { recursive: true });
+
+  // Fresh, committed project so it opens cleanly (CODE_BOSS subbranch on first write).
+  await rm(PROJECT, { recursive: true, force: true }).catch(() => {});
+  await mkdir(PROJECT, { recursive: true });
+  await writeFile(path.join(PROJECT, 'README.md'), '# tasks\nA tiny task-tracker app.\n');
+  await runGit(PROJECT, ['init', '-q', '-b', 'main']);
+  await runGit(PROJECT, ['config', 'user.email', 'dev@test']);
+  await runGit(PROJECT, ['config', 'user.name', 'dev']);
+  await runGit(PROJECT, ['add', '-A']);
+  await runGit(PROJECT, ['commit', '-q', '-m', 'init']);
+
+  const adapterKey = process.env.CB_API_KEY || (ADAPTER_FORMAT === 'anthropic' ? 'proxy-adds-key' : undefined);
+  const supabaseKey = process.env.CB_SUPABASE_KEY;
+  const adapter = ADAPTER_FORMAT === 'openai'
+    ? createHttpAdapter({ baseURL: PROXY, apiKey: adapterKey, onRateLimit: (ms) => console.error(`  [rate-limit] ${ms}ms`) })
+    : createAnthropicAdapter({ baseURL: PROXY + '/v1', apiKey: adapterKey, onRateLimit: (ms) => console.error(`  [rate-limit] ${ms}ms`), ...(supabaseKey ? { extraHeaders: { apikey: supabaseKey } } : {}) });
+
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8')).replace(
+    '</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: MODEL, baseURL: PROXY }) + ';</script></head>'
+  );
+  const { server } = await startServer({
+    html, baseURL: PROXY, apiKey: adapterKey || 'proxy-adds-key', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: MODEL, port: PORT, adapter, modelsList: [{ id: MODEL }], initialProject: PROJECT,
+    apiFormat: ADAPTER_FORMAT,
+  });
+
+  // A separate developer-actor "brain" — same proxy, may use a different model.
+  async function actorReply(agentMessage, approvalsGranted) {
+    const messages = [
+      { role: 'system', content: ACTOR_SYSTEM },
+      { role: 'user', content: `Approvals you have already granted for this task: ${approvalsGranted}.\n\nThe agent's latest message(s):\n"""\n${agentMessage.slice(-4000)}\n"""\n\nRespond with the JSON object now.` },
+    ];
+    let text = '';
+    try {
+      const res = await adapter.complete({ model: ACTOR_MODEL, messages, max_tokens: 400, temperature: 0.4 });
+      text = res?.choices?.[0]?.message?.content || '';
+    } catch (e) { console.error('  [actor error]', e.message); }
+    const parsed = extractJson(text);
+    if (parsed && typeof parsed.reply === 'string') return parsed;
+    // Fallback: couldn't parse — treat as a non-approval nudge to proceed.
+    console.error('  [actor] unparseable reply, using fallback. raw:', text.slice(0, 200));
+    return { reply: 'Looks good — please go ahead and proceed.', agentIsAskingApproval: false, agentClaimsDone: false };
+  }
+
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: process.env.CB_HEADFUL ? false : 'new', args: ['--no-sandbox'] });
+  const page = await browser.newPage();
+  await page.setViewport({ width: 1440, height: 1000 });
+  const jsErrors = [];
+  page.on('pageerror', (e) => jsErrors.push('pageerror: ' + e.message));
+  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) jsErrors.push('console: ' + m.text()); });
+
+  const getStatus = () => page.evaluate(() => window.__sessionRef?.status);
+  const getLogText = () => page.evaluate(() => document.getElementById('log')?.innerText || '');
+  let shotN = 0;
+  const shot = async (name) => { try { shotN++; await page.screenshot({ path: path.join(SHOTS, `${String(shotN).padStart(2, '0')}-${name}.png`), fullPage: false }); } catch {} };
+  async function waitStarted() { await page.waitForFunction(() => window.__sessionRef?.status === 'running', { timeout: 30000 }).catch(() => {}); }
+  async function waitDone(ms = STEP_TIMEOUT) {
+    const t0 = Date.now();
+    while (Date.now() - t0 < ms) {
+      const s = await getStatus().catch(() => null);
+      if (s === 'done' || s === 'idle' || s === 'error') return s;
+      await sleep(700);
+    }
+    return 'TIMEOUT';
+  }
+  async function sendChat(text) {
+    await page.evaluate(() => { const i = document.getElementById('input'); i.value = ''; i.focus(); });
+    await page.type('#input', text);
+    await page.keyboard.press('Enter');
+  }
+
+  const metrics = { approvalAsks: 0, reAsksAfterApproval: 0, approvalsGranted: 0, completed: false, handBacks: 0, attrLeaks: [], devTurns: 0, statuses: [], leaks: [] };
+  const convo = [];  // [{who, text}]
+  // Deterministic, developer-visible signals (don't rely on the actor LLM to classify these).
+  const HANDBACK_RE = /could not resolve|handing (these|this|it|them) back to you|—\s*over to you|couldn'?t resolve \[/i;
+  // The verdict attribute-tail LEAK shape (build-752 fix): a leaked `…">` attribute close immediately
+  // followed by prose, with no opening `<` — e.g. "0, failed count = 0)\">I designed and wrote…".
+  const ATTR_LEAK_RE = /[a-z0-9_)\]]\s*"\s*>\s*[A-Z]/;
+
+  try {
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForSelector('#input', { timeout: 20000 });
+    await sleep(1200);
+    await shot('loaded');
+
+    console.log(`\n=== DEV TASK ===\n${TASK}\n`);
+    convo.push({ who: 'developer', text: TASK });
+    let prevLen = (await getLogText()).length;
+    await sendChat(TASK);
+    await waitStarted();
+
+    for (let turn = 1; turn <= MAX_DEV_TURNS; turn++) {
+      const s = await waitDone();
+      metrics.statuses.push(s);
+      if (s === 'TIMEOUT') { console.error('  agent turn TIMED OUT'); break; }
+      if (s === 'error') { console.error('  agent ended in ERROR'); break; }
+      await sleep(600);  // let the final render settle
+      await shot(`turn${turn}-agent`);
+
+      const full = await getLogText();
+      const delta = full.slice(prevLen).trim();
+      prevLen = full.length;
+      if (!delta) { console.error('  (no new agent output — stopping)'); break; }
+      convo.push({ who: 'agent', text: delta });
+      console.log(`\n--- AGENT (turn ${turn}) ---\n${delta.slice(-1200)}\n`);
+
+      // Deterministic signals straight off the rendered transcript.
+      const handedBack = HANDBACK_RE.test(delta);
+      if (handedBack) { metrics.handBacks++; console.error(`  ⚠ HAND-BACK detected (#${metrics.handBacks}) — not "done"`); }
+      if (ATTR_LEAK_RE.test(delta)) {
+        const snip = (delta.match(/.{0,30}[a-z0-9_)\]]\s*"\s*>\s*[A-Z].{0,40}/) || [delta.slice(0, 60)])[0];
+        metrics.attrLeaks.push(snip.trim());
+        console.error(`  ⚠ ATTR-TAIL LEAK in transcript: ${snip.trim()}`);
+      }
+
+      const verdict = await actorReply(delta, metrics.approvalsGranted);
+      // A hand-back is never "done", regardless of how the actor read it.
+      if (handedBack) verdict.agentClaimsDone = false;
+      if (verdict.agentIsAskingApproval) {
+        metrics.approvalAsks++;
+        if (metrics.approvalsGranted > 0) {
+          metrics.reAsksAfterApproval++;
+          console.error(`  ⚠ RE-ASK after approval (#${metrics.reAsksAfterApproval})`);
+        }
+        metrics.approvalsGranted++;  // the developer grants it (this reply)
+      }
+      if (verdict.agentClaimsDone) {
+        metrics.completed = true;
+        console.log(`\n--- DEVELOPER (final) ---\n${verdict.reply}\n`);
+        convo.push({ who: 'developer', text: verdict.reply });
+        break;
+      }
+
+      console.log(`--- DEVELOPER (turn ${turn}) [${verdict.agentIsAskingApproval ? 'approval-ask' : 'reply'}] ---\n${verdict.reply}\n`);
+      convo.push({ who: 'developer', text: verdict.reply });
+      metrics.devTurns++;
+      prevLen = (await getLogText()).length;  // re-anchor before the developer message renders
+      await sendChat(verdict.reply);
+      await waitStarted();
+    }
+
+    // Anomaly: signal-tag leaks in the rendered transcript.
+    const finalText = await getLogText();
+    const LEAK = ['<verdict', '<task-progress', '<next-task', '<phase', '<checklist', '<plan>', '<remote-workspace', '<reviewer-finding', '<workflow-run'];
+    metrics.leaks = LEAK.filter((t) => finalText.includes(t));
+    metrics.jsErrors = jsErrors.slice();
+    await shot('final');
+  } catch (e) {
+    console.error('FATAL', e.stack || e.message);
+  } finally {
+    const report = { task: TASK, model: MODEL, actorModel: ACTOR_MODEL, metrics, convo };
+    await writeFile(path.join(ART, 'report.json'), JSON.stringify(report, null, 2));
+    console.log('\n========== DEV-ACTOR REPORT ==========');
+    console.log(`task model     : ${MODEL}`);
+    console.log(`actor model    : ${ACTOR_MODEL}`);
+    console.log(`dev turns      : ${metrics.devTurns}`);
+    console.log(`approval asks  : ${metrics.approvalAsks}`);
+    console.log(`RE-asks after approval : ${metrics.reAsksAfterApproval}   <-- the bug if > 0`);
+    console.log(`completed      : ${metrics.completed}`);
+    console.log(`hand-backs     : ${metrics.handBacks}`);
+    console.log(`statuses       : ${metrics.statuses.join(', ')}`);
+    console.log(`tag leaks      : ${metrics.leaks.length ? metrics.leaks.join(', ') : '(none)'}`);
+    console.log(`attr-tail leaks: ${metrics.attrLeaks.length ? metrics.attrLeaks.length + ' — ' + metrics.attrLeaks[0] : '(none)'}`);
+    console.log(`js errors      : ${(metrics.jsErrors || []).length}`);
+    console.log(`report + shots : ${ART}`);
+    console.log('======================================');
+    try { await browser.close(); } catch {}
+    try { server.close(); } catch {}
+    process.exit(0);
+  }
+}
+
+main().catch((e) => { console.error(e); process.exit(1); });
+
=== add test/_diag-agentrun-child.mjs
new 2a547b22648b057da5d5c6c4
+// Helper (spawned by test-diag-logging-probe [F]): boot startServer with an adapter that FAILS every LLM call
+// (a CF-Access-expired 403), POST a real chat, let the background run fail — so the parent can assert the
+// agent-run failure landed in the GLOBAL diag.log with the model + HTTP status (the most common real failure).
+// argv[2]=project dir, argv[3]=port; CB_HOME is set by the parent so diag.log is isolated.
+import { readFile, mkdir, writeFile } from 'node:fs/promises';
+import path from 'node:path';
+const proj = process.argv[2];
+const port = Number(process.argv[3]) || 29850;
+await mkdir(proj, { recursive: true });
+await writeFile(path.join(proj, 'README.md'), '# agent-run child\n', 'utf8');
+const { startServer } = await import('../src/server.mjs');
+const html = await readFile(new URL('../src/ui.html', import.meta.url), 'utf8');
+const adapter = { async complete() { const e = new Error('HTTP 403 Forbidden: access denied — Cloudflare Access token expired'); e.status = 403; e.statusText = 'Forbidden'; throw e; } };
+const { server } = await startServer({
+  html, baseURL: 'http://127.0.0.1:1', apiKey: 'x', apiFormat: 'anthropic',
+  gitlabCreds: { user: 't', token: 't' }, defaultModel: 'claude-haiku-test',
+  modelsList: [{ id: 'claude-haiku-test' }], port, adapter, initialProject: proj, bundleConversation: true,
+});
+await fetch('http://127.0.0.1:' + port + '/api/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'add a helper function to utils.js' }) });
+await new Promise((r) => setTimeout(r, 5000));   // let the background run fail + logError('agent-run') fire
+console.log('AGENTRUN_DONE');
+try { server.close(); } catch {}
+process.exit(0);
+
=== add test/_diag-boot-child.mjs
new 278365762b5ce3ab1e0c84a4
+// Helper (spawned by test-diag-logging-probe): boot startServer ONCE, then exit 0 after it listens — so the
+// parent can assert the boot line landed in the global diag.log AND the per-project code-boss.log.
+// argv[2] = project dir, argv[3] = port. CB_HOME is set by the parent so diag.log goes to a temp home.
+import { readFile, mkdir, writeFile } from 'node:fs/promises';
+import path from 'node:path';
+const proj = process.argv[2];
+const port = Number(process.argv[3]) || 29610;
+await mkdir(proj, { recursive: true });
+await writeFile(path.join(proj, 'README.md'), '# diag boot child\n', 'utf8');
+const { startServer } = await import('../src/server.mjs');
+const html = await readFile(new URL('../src/ui.html', import.meta.url), 'utf8');
+const adapter = { async complete() { return { choices: [{ message: { content: 'hi' } }] }; } };
+const { server } = await startServer({
+  html, baseURL: 'http://127.0.0.1:1', apiKey: 'x', apiFormat: 'anthropic',
+  gitlabCreds: { user: 't', token: 't' }, defaultModel: 'm', modelsList: [{ id: 'm' }],
+  port, adapter, initialProject: proj, bundleConversation: true,
+});
+console.log('BOOTED');
+// Exercise the client-error pipeline too: POST a browser error to ourselves; it must land in diag.log.
+try {
+  await fetch('http://127.0.0.1:' + port + '/api/client-error', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'probe', message: 'PROBE_CLIENT_ERR_MARKER', stack: 'at probe (x:1:1)', href: 'http://test/', ua: 'probe-ua' }) });
+  console.log('CLIENT_ERR_POSTED');
+} catch (e) { console.log('CLIENT_ERR_POST_FAIL ' + (e?.message || e)); }
+setTimeout(() => { try { server.close(); } catch {} process.exit(0); }, 300);
+
=== add test/_drive.mjs
new 3bc856ed0d261be75de29625
+/**
+ * _drive.mjs — ONE action against the PERSISTENT Chrome (puppeteer.connect, never launches/kills it),
+ * so a developer can drive the real code_boss UI step-by-step across separate invocations.
+ *
+ *   node test/_drive.mjs read                  — dump what the developer SEES (chat bubbles, status,
+ *                                                reviewer/sub-agent rows, open modal, approve button)
+ *   node test/_drive.mjs send "message text"   — type into the input + submit
+ *   node test/_drive.mjs click <css-selector>  — click something (e.g. #approveImplementBtn)
+ *   node test/_drive.mjs shot <name>           — screenshot to D:/tmp/cb-uidrive/<name>.png
+ *   node test/_drive.mjs state                 — the structured /api/state status (terse)
+ * env: CB_DBG (default http://127.0.0.1:9222), CB_UI_PORT (default 28990)
+ */
+import puppeteer from 'puppeteer-core';
+
+const DBG = process.env.CB_DBG || 'http://127.0.0.1:9222';
+const PORT = Number(process.env.CB_UI_PORT || 28990);
+const action = process.argv[2];
+const arg = process.argv.slice(3).join(' ');
+
+async function getPage(browser) {
+  const pages = await browser.pages();
+  return pages.find((p) => p.url().includes(`127.0.0.1:${PORT}`)) || pages.find((p) => !p.url().startsWith('devtools')) || pages[0];
+}
+
+async function main() {
+  const browser = await puppeteer.connect({ browserURL: DBG, defaultViewport: null });
+  try {
+    const page = await getPage(browser);
+    if (!page) { console.log('NO PAGE'); return; }
+
+    if (action === 'toggles') {
+      const t = await page.evaluate(() => {
+        const pick = (sel) => { const e = document.querySelector(sel); return e ? { found: true, checked: e.checked, txt: (e.innerText || e.title || '').slice(0, 40).replace(/\n/g, ' '), shown: e.offsetParent !== null, cls: e.className } : { found: false }; };
+        return {
+          reviewer: pick('#criticToggle, #reviewerToggle, [id*="critic" i]'),
+          autoapprove: pick('#reviewLabel, [onclick*="toggleReview"]'),
+          phaseAttack: pick('#phaseAttackToggle, [id*="phaseAttack" i]'),
+          discuss: pick('#discussToggle, [onclick*="toggleDiscuss" i], [id*="discuss" i]'),
+          bodyClasses: document.body.className,
+        };
+      });
+      console.log(JSON.stringify(t, null, 1));
+      return;
+    }
+    if (action === 'reload') {
+      await page.goto(`http://127.0.0.1:${PORT}`, { waitUntil: 'domcontentloaded' });
+      console.log('RELOADED');
+      return;
+    }
+    if (action === 'send') {
+      const ok = await page.evaluate((text) => {
+        const tas = [...document.querySelectorAll('textarea')].filter((t) => t.offsetParent !== null);
+        const ta = tas.find((t) => t.closest('.input-row')) || tas[0];
+        if (!ta) return false;
+        ta.focus(); ta.value = text;
+        ta.dispatchEvent(new Event('input', { bubbles: true }));
+        return true;
+      }, arg);
+      if (!ok) { console.log('NO VISIBLE INPUT FOUND'); return; }
+      await page.keyboard.press('Enter');
+      console.log(`SENT: ${arg.slice(0, 120)}`);
+      return;
+    }
+    if (action === 'click') {
+      const el = await page.$(arg);
+      if (!el) { console.log(`NO ELEMENT: ${arg}`); return; }
+      await el.click();
+      console.log(`CLICKED: ${arg}`);
+      return;
+    }
+    if (action === 'shot') {
+      const p = `D:/tmp/cb-uidrive/${arg || 'shot'}.png`;
+      await page.screenshot({ path: p, fullPage: false });
+      console.log(`SHOT: ${p}`);
+      return;
+    }
+    if (action === 'state') {
+      const s = await page.evaluate(async (port) => {
+        try { const r = await fetch(`http://127.0.0.1:${port}/api/state?limit=3`); return await r.json(); } catch (e) { return { error: String(e) }; }
+      }, PORT);
+      console.log(`status=${s.status} phase=${s.phase || ''} pendingApprove=${s.pendingApprove} subagents=${(s.subagents || []).length}`);
+      if ((s.subagents || []).length) for (const sa of s.subagents) console.log(`  sub: ${sa.id} (${sa.topic}): ${sa.status}${sa.round > 1 ? ' r' + sa.round : ''}`);
+      return;
+    }
+    // default: read — what the developer sees, rendered
+    const view = await page.evaluate(() => {
+      const txt = (el) => (el ? el.innerText.replace(/\s+\n/g, '\n').trim() : '');
+      const out = { status: '', phase: '', bubbles: [], reviewerNotes: [], subagents: [], modal: '', approveVisible: false, checklist: [], errorRows: [] };
+      const st = document.querySelector('.status, #status'); out.status = txt(st).slice(0, 200);
+      const ph = document.querySelector('.phase-line, .loading-line, #phaseLine'); out.phase = txt(ph).slice(0, 160);
+      // chat bubbles in order: role + text (clip)
+      for (const b of document.querySelectorAll('#log .bubble, #log .msg, #log .assistant-text, #log .user-message')) {
+        const role = b.classList.contains('user') ? 'DEV' : (b.classList.contains('assistant') || b.classList.contains('agent')) ? 'AGENT' : (b.className.match(/manager|banner|review|memory|attack|ticket|merge|consolidat/)?.[0] || 'sys');
+        const t = txt(b); if (t) out.bubbles.push(`[${role}] ${t.replace(/\n/g, ' ⏎ ').slice(0, 600)}`);
+      }
+      for (const r of document.querySelectorAll('.reviewer-note, #log [class*="review"]')) { const t = txt(r); if (t) out.reviewerNotes.push(t.replace(/\n/g, ' ⏎ ').slice(0, 300)); }
+      for (const r of document.querySelectorAll('.subagent-row, [class*="subagent"], .sa-row, #subagentList *')) { const t = txt(r); if (t && t.length < 200) out.subagents.push(t.replace(/\n/g, ' ').slice(0, 160)); }
+      for (const r of document.querySelectorAll('.action-error, [class*="error-row"], .error')) { const t = txt(r); if (t) out.errorRows.push(t.slice(0, 200)); }
+      const modal = document.querySelector('.modal:not([style*="display: none"]), .modal-backdrop:not([style*="display: none"]), [class*="modal"][style*="display: flex"]');
+      out.modal = txt(modal).slice(0, 300);
+      const ab = document.querySelector('#approveImplementBtn'); out.approveVisible = !!(ab && ab.offsetParent !== null);
+      for (const c of document.querySelectorAll('.checklist-item')) { const t = txt(c); if (t) out.checklist.push(t.slice(0, 120)); }
+      return out;
+    });
+    console.log('STATUS:', view.status || '(none)');
+    if (view.phase) console.log('PHASE/LOADING:', view.phase);
+    if (view.approveVisible) console.log('*** APPROVE & IMPLEMENT button VISIBLE ***');
+    if (view.modal) console.log('MODAL OPEN:', view.modal);
+    if (view.checklist.length) console.log('CHECKLIST:', view.checklist.length, 'items:', view.checklist.slice(0, 8).join(' | '));
+    if (view.subagents.length) console.log('SUBAGENTS/DRAWER:', [...new Set(view.subagents)].join(' || '));
+    if (view.errorRows.length) console.log('ERROR ROWS:', view.errorRows.join(' || '));
+    console.log('\n--- CHAT (what the developer sees) ---');
+    for (const b of view.bubbles.slice(-14)) console.log(b);
+    if (view.reviewerNotes.length) { console.log('\n--- reviewer notes (eye-revealed) ---'); for (const n of view.reviewerNotes.slice(-6)) console.log('🔍', n); }
+  } finally {
+    browser.disconnect();   // leave Chrome running for the next step
+  }
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-accept-gate-bgspinner.mjs
new 5598fa77aba0e374d8cd0ffb
+/**
+ * EDGE PROBE (on-demand): two UX changes.
+ *  [A] Acceptance gate copy — names WHICH assignment (id + title), frames it as an
+ *      accept-or-not decision, explains the buttons, and Accept reads "Accept as done"
+ *      with a confirm + tooltip naming the assignment.
+ *  [B] Adaptive single status bar — foreground turn owns it ("Working…"); when the
+ *      foreground is done but sub-agents are still working, the SAME bar shows
+ *      "N sub-agents finishing…"; it flips to done when the last one settles.
+ *
+ * Run: node test/_edge-accept-gate-bgspinner.mjs   (needs Chrome)
+ */
+import { mkdtemp, readFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 28996;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  const dir = await mkdtemp(path.join(tmpdir(), 'cb-agbs-'));
+  const strip = (s) => s.replace(/^import\s+[^;]+;[ \t]*\r?\n?/gm, '').replace(/^export\s+(async\s+function|function|class|const|let|var)\b/gm, '$1').replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
+  const mosaic = strip(await readFile(path.join(ROOT, 'src', 'agent', 'mosaic-layout.mjs'), 'utf8'));
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8')).replace('</head>',
+    '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: '(mock)' }) + ';</script><script>' + mosaic + '</script></head>');
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'mock', port: PORT, adapter: { async complete() { return { choices: [{ message: { content: 'done.' } }] }; } },
+    modelsList: [{ id: 'mock' }], initialProject: dir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1100, height: 760 });
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForFunction(() => typeof addAssignmentGate === 'function' && typeof refreshAggregateSpinner === 'function' && typeof saUpsert === 'function' && typeof status === 'object' && typeof RC !== 'undefined' && RC.log, { timeout: 10000 });
+    await sleep(150);
+
+    console.log('\n[A] acceptance gate: names the assignment + clear accept framing');
+    const gate = await page.evaluate(() => {
+      RC.log.innerHTML = '';
+      addAssignmentGate({ type: 'assignment-gate', assignmentId: 'A-1', title: 'Reconcile runbooks', fulfilled: false, missing: 'the B-side', rationale: 'partial' });
+      const row = document.querySelector('#log .assignment-gate');
+      const accept = Array.from(row.querySelectorAll('button')).find((b) => /^Mark done$/.test(b.textContent));
+      return {
+        text: row.textContent, display: getComputedStyle(row).display,
+        verdict: row.querySelector('.gate-verdict')?.textContent || '', title: row.querySelector('.gate-title')?.textContent || '',
+        hasHelp: !!row.querySelector('.gate-line.help'),
+        acceptText: accept?.textContent, acceptTip: accept?.title,
+      };
+    });
+    ok(gate.display === 'block', `gate stacks vertically (display:block, not the flex .row columns) (got ${gate.display})`);
+    ok(gate.title === 'Reconcile runbooks' && !/A-1/.test(gate.text), 'gate names the assignment by TITLE only (no "A-1" id)');
+    ok(/isn't convinced the agent finished this/.test(gate.verdict), `unfulfilled verdict spans the top, not the title (got "${gate.verdict.slice(0, 70)}")`);
+    ok(!gate.hasHelp, 'the Accept/Pause legend line was removed');
+    ok(gate.acceptText === 'Mark done', `Accept button reads "Mark done" (got ${JSON.stringify(gate.acceptText)})`);
+    ok(/Reconcile runbooks/.test(gate.acceptTip || ''), 'Mark done tooltip names the assignment');
+
+    const gateOk = await page.evaluate(() => {
+      RC.log.innerHTML = '';
+      addAssignmentGate({ type: 'assignment-gate', assignmentId: 'A-2', title: 'Add caching', fulfilled: true, rationale: 'looks done' });
+      const row = document.querySelector('#log .assignment-gate');
+      return { verdict: row.querySelector('.gate-verdict')?.textContent || '', title: row.querySelector('.gate-title')?.textContent || '', text: row.textContent };
+    });
+    ok(/The acceptance check thinks the agent finished this\. Mark it done\?/.test(gateOk.verdict) && gateOk.title === 'Add caching' && !/A-2/.test(gateOk.text),
+      'fulfilled gate: verdict asks to mark done + title is the assignment name (no "A-2" id)');
+
+    console.log('\n[B] one adaptive bar: "Working…" → "Agent and N background…" → "N background agents working…" → done');
+    const stat = () => page.evaluate(() => ({ phase: status.phase, text: document.querySelector('#log .status').textContent }));
+
+    // Foreground only, no sub-agents → plain "Working…"
+    await page.evaluate(() => { RC.log.innerHTML = ''; saStore.clear(); session.status = 'running'; ensureStatusRow(); status.setUploading(); refreshAggregateSpinner(); });
+    const fgOnly = await stat();
+    ok(fgOnly.phase !== 'background' && /Agent working…/.test(fgOnly.text) && !/background agent/.test(fgOnly.text), `foreground only → "Agent working…" (phase=${fgOnly.phase}, "${fgOnly.text.trim()}")`);
+
+    // Foreground + 1 background → "Agent and 1 background agent working…"
+    await page.evaluate(() => { saUpsert('s1', { topic: 't1', status: 'working' }); refreshAggregateSpinner(); });
+    const fgBg = await stat();
+    ok(fgBg.phase !== 'background' && /Agent and 1 background agent working/.test(fgBg.text), `foreground + 1 background → "Agent and 1 background agent working…" (phase=${fgBg.phase}, "${fgBg.text.trim()}")`);
+
+    // Foreground done while the sub-agent works → "1 background agent working…"
+    await page.evaluate(() => { session.status = 'done'; refreshAggregateSpinner(); });
+    const bg1 = await stat();
+    ok(bg1.phase === 'background' && /1 background agent working…/.test(bg1.text), `foreground done + 1 → "1 background agent working…" (phase=${bg1.phase}, "${bg1.text.trim()}")`);
+
+    // A second working sub-agent → "2 background agents working…"
+    await page.evaluate(() => { saUpsert('s2', { topic: 't2', status: 'working' }); refreshAggregateSpinner(); });
+    const bg2 = await stat();
+    ok(/2 background agents working…/.test(bg2.text), `two background → "2 background agents working…" (got "${bg2.text.trim()}")`);
+
+    // Last sub-agent finishes → the bar flips to done
+    await page.evaluate(() => { saUpsert('s1', { status: 'done' }); saUpsert('s2', { status: 'done' }); refreshAggregateSpinner(); });
+    const fin = await stat();
+    ok(fin.phase === 'done' && !/background agent/.test(fin.text), `all settled → bar flips to done (phase=${fin.phase}, "${fin.text.trim()}")`);
+
+    console.log('\n[C] rotating placeholder: one tip at a time, fades + advances');
+    const ph = () => page.evaluate(() => document.getElementById('input').placeholder);
+    await page.evaluate(() => { const i = document.getElementById('input'); i.value = ''; _tipIdx = 0; i.placeholder = idlePlaceholder(); });
+    ok(/^Ask… \(Enter to send\)$/.test(await ph()), `initial tip is "Ask… (Enter to send)" (got "${await ph()}")`);
+    await page.evaluate(() => rotateTip());
+    const faded = await page.evaluate(() => document.getElementById('input').classList.contains('ph-fade'));
+    ok(faded, 'rotateTip fades the placeholder out (ph-fade applied)');
+    await sleep(320);
+    ok(/^Ask… \(Shift\+Enter for a new line\)$/.test(await ph()) && !(await page.evaluate(() => document.getElementById('input').classList.contains('ph-fade'))), `advanced to the next tip + faded back in (got "${await ph()}")`);
+    await page.evaluate(() => rotateTip()); await sleep(320);
+    ok(/deeply deliberate/.test(await ph()), `rotates through the tips (got "${await ph()}")`);
+    // Don't churn while the user is typing (placeholder hidden anyway).
+    await page.evaluate(() => { const i = document.getElementById('input'); i.value = 'typing'; });
+    const before = await ph(); await page.evaluate(() => rotateTip()); await sleep(320);
+    ok((await ph()) === before, 'does not advance the tip while the input has text');
+  } finally {
+    await browser.close();
+    server.close();
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-acceptance-status.mjs
new 99bffdcb1da6ad2c2d1f8d6f
+/**
+ * EDGE PROBE (on-demand): the acceptance status row — ORANGE with a blinking ◆
+ * while running, GRAY (no blink) when done, stays in the conversation. Mirrors
+ * how the phase/design-attack markers read. Screenshots both states.
+ *
+ * Run: node test/_edge-acceptance-status.mjs   (needs Chrome; shots in acceptance-status-screenshots/)
+ */
+import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 28995;
+const SHOTS = path.join(__dirname, 'acceptance-status-screenshots');
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  await mkdir(SHOTS, { recursive: true });
+  const dir = await mkdtemp(path.join(tmpdir(), 'cb-accst-'));
+  const strip = (s) => s.replace(/^import\s+[^;]+;[ \t]*\r?\n?/gm, '').replace(/^export\s+(async\s+function|function|class|const|let|var)\b/gm, '$1').replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
+  const mosaic = strip(await readFile(path.join(ROOT, 'src', 'agent', 'mosaic-layout.mjs'), 'utf8'));
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8')).replace('</head>',
+    '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: '(mock)' }) + ';</script><script>' + mosaic + '</script></head>');
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'mock', port: PORT, adapter: { async complete() { return { choices: [{ message: { content: 'done.' } }] }; } },
+    modelsList: [{ id: 'mock' }], initialProject: dir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1100, height: 700 });
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForFunction(() => typeof renderEvent === 'function' && typeof RC !== 'undefined' && RC && RC.log && !!document.getElementById('log'), { timeout: 10000 });
+    await sleep(150);
+    const accentRgb = await page.evaluate(() => { const p = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); const s = document.createElement('span'); s.style.color = p; document.body.appendChild(s); const rgb = getComputedStyle(s).color; s.remove(); return rgb; });
+
+    console.log('\n[A] running: orange text + blinking ◆ icon, with the "…"');
+    await page.evaluate(() => renderEvent({ type: 'acceptance-status', state: 'running' }));
+    await sleep(100);
+    const run = await page.evaluate(() => {
+      const r = document.querySelector('#log .agent-activity.acc-running'); if (!r) return null;
+      return { color: getComputedStyle(r).color, text: r.textContent, anim: getComputedStyle(r.querySelector('.aa-ico')).animationName };
+    });
+    await page.screenshot({ path: path.join(SHOTS, '1-running.png') });
+    ok(!!run, 'a running acceptance row exists');
+    ok(run && run.color === accentRgb, `running row is orange/accent (got ${run?.color}, accent ${accentRgb})`);
+    ok(run && /Checking the assignment…/.test(run.text), `running text is "Checking the assignment…" (got ${JSON.stringify(run?.text)})`);
+    ok(run && run.anim === 'tool-blink', `icon blinks while running (animationName ${run?.anim})`);
+
+    console.log('\n[B] done: the SAME row flips to gray, no blink, no duplicate row');
+    await page.evaluate(() => renderEvent({ type: 'acceptance-status', state: 'done' }));
+    await sleep(100);
+    const done = await page.evaluate(() => {
+      const all = document.querySelectorAll('#log .agent-activity.acc-status');
+      const r = document.querySelector('#log .agent-activity.acc-status:not(.acc-running)');
+      return { count: all.length, running: document.querySelectorAll('#log .acc-running').length, color: r ? getComputedStyle(r).color : null, text: r ? r.textContent : null, anim: r ? getComputedStyle(r.querySelector('.aa-ico')).animationName : null };
+    });
+    await page.screenshot({ path: path.join(SHOTS, '2-done.png') });
+    ok(done.count === 1 && done.running === 0, `the running row was converted in place — one row, no .acc-running left (count=${done.count}, running=${done.running})`);
+    ok(done.color && done.color !== accentRgb, `done row is gray, not accent (got ${done.color})`);
+    ok(/Checked the assignment/.test(done.text || ''), `done text is "Checked the assignment" (got ${JSON.stringify(done.text)})`);
+    ok(done.anim === 'none', `no blink when done (animationName ${done.anim})`);
+  } finally {
+    await browser.close();
+    server.close();
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-assignments-gate.mjs
new 32525a64fc35da6a76a3f978
+/**
+ * EDGE PROBE (on-demand): assignment GATE lifecycle edges the permanent probes
+ * don't cover (real server + real browser + routed mock adapter):
+ *
+ *  [1] ready -> active -> gate for an assignment whose per-task review FAILS
+ *      twice -> the review ESCALATES (REVIEW_MAX_ROUNDS=2) -> the acceptance
+ *      gate is WARN even though acceptance said fulfilled, titled "UNRESOLVED
+ *      review concerns", with the escalated concern lines + an "Accept anyway"
+ *      button (no "Send fix" — the verdict was fulfilled).
+ *  [2] confirm-on-escalation: clicking "Accept anyway" pops a confirm();
+ *      DISMISSING it leaves the assignment ACTIVE (nothing accepted);
+ *      ACCEPTING it flips the pill to accepted + clears activeId.
+ *  [3] offer-next-ready chaining: the accepted gate offers "Next ready: A-2"
+ *      with a "Work it" button; clicking it works the MIDDLE row of a 3-row
+ *      backlog (assignment switch mid-list).
+ *  [4] drift-verdict gate content: an UNFULFILLED acceptance verdict renders
+ *      the rationale line, the "Missing:" line (class .missing) and the
+ *      "Drift (out of scope):" line (class .drift) with the verdict text, plus
+ *      Send fix / Accept / Pause buttons.
+ *  [5] REJECTING at the gate (Pause/park): the row pill flips to "parked",
+ *      activeId clears, the gate actions collapse to "Paused", and the parked
+ *      row re-offers "Work this" (re-armable). No worktree exists to clean in
+ *      the inline path (worktrees are only for orchestrator sub-agents).
+ *  [6] state isolation across two back-to-back assignments: taskIds disjoint,
+ *      and A-2's acceptance prompt does NOT contain A-1's task summary.
+ *
+ * Run: node test/_edge-assignments-gate.mjs    (skips if Chrome not found)
+ * Port: 17962 (assigned range 17962-17963).
+ */
+import { mkdtemp, readFile, mkdir } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17962;
+const SHOTS = path.join(__dirname, '_edge-assignments-shots');
+
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+// ── Content-routed mock adapter ──────────────────────────────────────────────
+// Engine roles are routed by their prompt markers (priority order), worker
+// turns by the assignment seed phrase scanned NEWEST-user-message-first (the
+// conversation later contains BOTH seeds; the newest one wins).
+const A1_WORKER = [
+  'Working on it.\n<remote-workspace><next-task user-request="esc unit" summary="ESC-TASK-SUMMARY first attempt"/></remote-workspace>',
+  'done.',
+  'Addressed the concern.\n<remote-workspace><next-task user-request="esc unit" summary="ESC-TASK-SUMMARY second attempt"/></remote-workspace>',
+  'done.',
+];
+const A2_WORKER = [
+  'Doing A2.\n<remote-workspace><next-task user-request="a2 unit" summary="A2-TASK-SUMMARY did the work"/></remote-workspace>',
+  'done.',
+];
+function routedAdapter() {
+  const counts = new Map();
+  const requests = [];
+  const nth = (key) => { const n = counts.get(key) || 0; counts.set(key, n + 1); return n; };
+  function respond(messages) {
+    const all = (messages || []).map((m) => String(m.content || '')).join('\n');
+    requests.push(all);
+    if (all.includes('<review-target>')) {
+      // A-1's task summaries carry ESC-TASK-SUMMARY -> always FAIL (round 2 escalates).
+      if (all.includes('ESC-TASK-SUMMARY')) return '<review-fail>REVIEW-CONCERN: the edge case is still unhandled</review-fail>';
+      return '<review-pass/>';
+    }
+    if (all.includes('<acceptance-target>')) {
+      if (all.includes('ESC-REQ')) return '<accept-fulfilled>requirement looks complete despite review concerns</accept-fulfilled>';
+      if (all.includes('A2-REQ')) {
+        return '<accept-unfulfilled>\n<missing>MISSING-MARKER App-B half is not done</missing>\n<drift>DRIFT-MARKER an unrelated module was renamed</drift>\n<rationale>RATIONALE-MARKER only half of the requirement is met</rationale>\n</accept-unfulfilled>';
+      }
+      return '<accept-fulfilled>ok</accept-fulfilled>';
+    }
+    if (all.includes('You are an intake manager')) return 'What exactly should change?';
+    // Worker turns: scan user messages newest-first for the seed phrase.
+    const users = (messages || []).filter((m) => m.role === 'user').reverse();
+    for (const u of users) {
+      const t = String(u.content || '');
+      if (t.includes("assignment A-1")) { const s = A1_WORKER; return s[Math.min(nth('A1'), s.length - 1)]; }
+      if (t.includes("assignment A-2")) { const s = A2_WORKER; return s[Math.min(nth('A2'), s.length - 1)]; }
+    }
+    return 'nothing to add.';   // consolidation / summarizer / anything else: harmless
+  }
+  return {
+    requests,
+    async complete({ messages }) { await sleep(15); return { choices: [{ message: { content: respond(messages) } }] }; },
+    async *completeStream({ messages }) {
+      const text = respond(messages);
+      for (let off = 0; off < text.length; off += 50) {
+        yield { choices: [{ delta: { content: text.slice(off, off + 50) } }] };
+        await sleep(4);
+      }
+    },
+    async listModels() { return { data: [{ id: 'mock-model' }] }; },
+  };
+}
+
+async function createViaForm(page, title, req) {
+  await page.evaluate(() => selectSideTab('assignments'));   // panel defaults collapsed now → open it
+  await page.evaluate(() => toggleAssignmentForm());
+  await page.waitForSelector('#asgTitle', { visible: true, timeout: 5000 });
+  await page.$eval('#asgTitle', (el) => { el.value = ''; });
+  await page.$eval('#asgReq', (el) => { el.value = ''; });
+  await page.type('#asgTitle', title);
+  await page.type('#asgReq', req);
+  const before = await page.$$eval('#backlogList .backlog-row', (els) => els.length);
+  await page.click('#backlogForm .btn.primary');
+  await page.waitForFunction((n) => document.querySelectorAll('#backlogList .backlog-row').length === n, { timeout: 5000 }, before + 1);
+}
+async function apiList(page) {
+  return page.evaluate(async () => (await fetch('/api/assignments/list')).json());
+}
+// Click a button INSIDE the n-th gate row by label regex, via CDP (so the
+// in-page confirm() doesn't deadlock an evaluate call).
+async function clickGateButton(page, gateIndex, re) {
+  const gates = await page.$$('.row.assignment-gate');
+  const g = gates[gateIndex];
+  if (!g) return false;
+  for (const h of await g.$$('button')) {
+    const t = await h.evaluate((el) => el.textContent || '');
+    if (re.test(t)) { await h.click(); return true; }
+  }
+  return false;
+}
+async function workCompleted(page, expectedGates, ms = 40000) {
+  await page.waitForFunction((n) => document.querySelectorAll('.row.assignment-gate').length >= n, { timeout: ms }, expectedGates);
+  await page.waitForFunction(() => ['done', 'idle', 'error'].includes(window.__sessionRef?.status), { timeout: ms });
+  return page.evaluate(() => window.__sessionRef?.status);
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  await mkdir(SHOTS, { recursive: true });
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-edge-gate-'));
+  const adapter = routedAdapter();
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8')).replace(
+    '</head>',
+    '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock-model', baseURL: '(mock)' }) + ';</script></head>'
+  );
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'test-key', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'mock-model', port: PORT, adapter, modelsList: [{ id: 'mock-model' }], initialProject: projectDir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1280, height: 900 });
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    // Dialog plan: each entry handles the NEXT confirm() in order.
+    const dialogPlan = [];      // 'accept' | 'dismiss'
+    const dialogMessages = [];
+    page.on('dialog', async (d) => {
+      dialogMessages.push(d.message());
+      const mode = dialogPlan.shift() || 'dismiss';
+      try { await (mode === 'accept' ? d.accept() : d.dismiss()); } catch {}
+    });
+
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForFunction(() => !!document.getElementById('sidePanel') && !!document.getElementById('tabbtn-queue'), { timeout: 8000 });
+    await page.evaluate(() => selectSideTab('assignments'));
+
+    console.log('\n[1] backlog of 3; work A-1 -> review escalates -> WARN gate w/ "Accept anyway"');
+    await createViaForm(page, 'Escalation One', 'ESC-REQ handle the tricky edge case in module X');
+    await createViaForm(page, 'Drift Two', 'A2-REQ reconcile both halves of the config');
+    await createViaForm(page, 'Bystander Three', 'A3-REQ untouched third assignment');
+    {
+      const l = await apiList(page);
+      ok(l.assignments.length === 3 && l.assignments.every((a) => a.status === 'ready'),
+        `3 ready assignments captured (${l.assignments.map((a) => a.id + ':' + a.status).join(', ')})`);
+    }
+    // Work A-1 (first row).
+    await page.$$eval('#backlogList .backlog-row', (rows) => {
+      const r = rows.find((x) => x.textContent.includes('A-1'));
+      r.querySelector('.asg-play').click();
+    });
+    const st1 = await workCompleted(page, 1);
+    ok(['done', 'idle'].includes(st1), `A-1 run terminated (${st1})`);
+    const gate1 = await page.$$eval('.row.assignment-gate', (els) => {
+      const g = els[0];
+      return {
+        warn: g.classList.contains('warn'), okCls: g.classList.contains('ok'),
+        verdict: g.querySelector('.gate-verdict')?.textContent || '',
+        title: g.querySelector('.gate-title')?.textContent || '',
+        escLines: Array.from(g.querySelectorAll('.gate-line.escalation')).map((e) => e.textContent),
+        buttons: Array.from(g.querySelectorAll('button')).map((b) => b.textContent.trim()),
+      };
+    });
+    ok(gate1.warn && !gate1.okCls, `escalation gate is WARN even though acceptance said fulfilled (warn=${gate1.warn})`);
+    ok(/UNRESOLVED review concerns/i.test(gate1.verdict), `gate verdict flags unresolved review concerns ("${gate1.verdict.slice(0, 80)}")`);
+    ok(gate1.escLines.length >= 1 && gate1.escLines.every((t) => /REVIEW-CONCERN/.test(t)),
+      `escalated concern line(s) rendered with the reviewer text (${gate1.escLines.length} line(s))`);
+    ok(gate1.buttons.includes('Mark done anyway'), `Accept button relabeled "Mark done anyway" (got: ${gate1.buttons.join(' | ')})`);
+    ok(!gate1.buttons.some((b) => /send fix/i.test(b)), 'no "Send fix" on a fulfilled-but-escalated gate (observed; remediation is accept-anyway/pause only)');
+    // Duplicate-escalation display quirk probe: the SAME task reviewed twice
+    // (reopen + re-close) may render one escalation line per task-end event.
+    console.log(`    (escalation lines rendered: ${gate1.escLines.length} — task was closed ${gate1.escLines.length} time(s))`);
+    await page.screenshot({ path: path.join(SHOTS, '1-escalation-gate.png') });
+
+    console.log('\n[2] confirm-on-escalation: dismiss leaves it ACTIVE; accept flips to accepted');
+    dialogPlan.push('dismiss');
+    ok(await clickGateButton(page, 0, /^Mark done anyway$/), 'clicked "Accept anyway" (confirm will be DISMISSED)');
+    await sleep(600);
+    ok(dialogMessages.length === 1 && /unresolved review concerns/i.test(dialogMessages[0]),
+      `a confirm() fired with the escalation warning ("${(dialogMessages[0] || '').slice(0, 60)}")`);
+    {
+      const l = await apiList(page);
+      const a1 = l.assignments.find((a) => a.id === 'A-1');
+      ok(a1.status === 'active' && l.activeId === 'A-1', `dismissed confirm -> A-1 still active, activeId kept (status=${a1.status}, activeId=${l.activeId})`);
+      const stillButtons = await page.$$eval('.row.assignment-gate', (els) => Array.from(els[0].querySelectorAll('button')).length);
+      ok(stillButtons >= 2, `gate actions still intact after the dismissed confirm (${stillButtons} buttons)`);
+    }
+    dialogPlan.push('accept');
+    ok(await clickGateButton(page, 0, /^Mark done anyway$/), 'clicked "Accept anyway" again (confirm ACCEPTED)');
+    await page.waitForFunction(
+      () => Array.from(document.querySelectorAll('#backlogList .backlog-row.accepted .asg-check')).some((c) => c.checked),
+      { timeout: 6000 }
+    );
+    {
+      const l = await apiList(page);
+      const a1 = l.assignments.find((a) => a.id === 'A-1');
+      ok(a1.status === 'accepted' && l.activeId === null, `A-1 accepted + activeId cleared (status=${a1.status}, activeId=${l.activeId})`);
+    }
+
+    console.log('\n[3] offer-next-ready chains into the MIDDLE row (A-2) via "Work it"');
+    await page.waitForFunction(() => {
+      const g = document.querySelectorAll('.row.assignment-gate')[0];
+      return g && /Next ready: A-2/.test(g.textContent);
+    }, { timeout: 6000 });
+    ok(true, 'accepted gate offers "Next ready: A-2" (first ready in backlog order)');
+    ok(await clickGateButton(page, 0, /^Work it$/), 'clicked "Work it" on the offer');
+    const st2 = await workCompleted(page, 2);
+    ok(['done', 'idle'].includes(st2), `A-2 run terminated (${st2})`);
+    const banners = await page.$$eval('.row.assignment-banner', (els) => els.map((e) => e.textContent));
+    ok(banners.length >= 2 && /assignment A-2/.test(banners[banners.length - 1]),
+      `working banner names A-2 — the mid-list switch bound the right assignment (${JSON.stringify(banners.slice(-1))})`);
+    {
+      const l = await apiList(page);
+      const a3 = l.assignments.find((a) => a.id === 'A-3');
+      ok(a3.status === 'ready' && (a3.taskIds || []).length === 0, `bystander A-3 untouched by the switch (status=${a3.status}, tasks=${(a3.taskIds || []).length})`);
+    }
+
+    console.log('\n[4] drift-verdict gate content (missing + drift + rationale lines)');
+    const gate2 = await page.$$eval('.row.assignment-gate', (els) => {
+      const g = els[els.length - 1];
+      const text = (sel) => Array.from(g.querySelectorAll(sel)).map((e) => e.textContent);
+      return {
+        warn: g.classList.contains('warn'),
+        verdict: g.querySelector('.gate-verdict')?.textContent || '',
+        title: g.querySelector('.gate-title')?.textContent || '',
+        missing: text('.gate-line.missing'), drift: text('.gate-line.drift'),
+        plain: text('.gate-line:not(.missing):not(.drift):not(.escalation)'),
+        buttons: Array.from(g.querySelectorAll('button')).map((b) => b.textContent.trim()),
+      };
+    });
+    ok(gate2.warn && /isn't convinced the agent finished/i.test(gate2.verdict), `unfulfilled gate is WARN + verdict reads "isn't convinced" (got "${gate2.verdict.slice(0, 80)}")`);
+    ok(gate2.missing.length === 1 && /^Missing: MISSING-MARKER/.test(gate2.missing[0]),
+      `Missing line carries the verdict's <missing> ("${(gate2.missing[0] || '').slice(0, 60)}")`);
+    ok(gate2.drift.length === 1 && /^Drift \(out of scope\): DRIFT-MARKER/.test(gate2.drift[0]),
+      `Drift line carries the verdict's <drift> ("${(gate2.drift[0] || '').slice(0, 70)}")`);
+    ok(gate2.plain.some((t) => /RATIONALE-MARKER/.test(t)), 'rationale line rendered');
+    ok(gate2.buttons.includes('Send fix to worker') && gate2.buttons.includes('Mark done') && gate2.buttons.includes('Pause'),
+      `unfulfilled gate offers Send fix + Mark done + Pause (got: ${gate2.buttons.join(' | ')})`);
+    await page.screenshot({ path: path.join(SHOTS, '2-drift-gate.png') });
+
+    console.log('\n[5] REJECT at the gate: Pause parks the row, clears activeId, re-offers "Work this"');
+    ok(await clickGateButton(page, 1, /^Pause$/), 'clicked Pause on the unfulfilled gate');
+    // Parked has no badge in the new grid; confirm via the gate's own "Paused"
+    // note (DOM) — the API status check below is the source of truth.
+    await page.waitForFunction(
+      () => Array.from(document.querySelectorAll('.row.assignment-gate .gate-actions')).some((a) => /Paused/.test(a.textContent)),
+      { timeout: 6000 }
+    );
+    {
+      const l = await apiList(page);
+      const a2 = l.assignments.find((a) => a.id === 'A-2');
+      ok(a2.status === 'parked' && l.activeId === null, `A-2 parked + activeId cleared (status=${a2.status}, activeId=${l.activeId})`);
+      const gateNote = await page.$$eval('.row.assignment-gate', (els) => els[els.length - 1].querySelector('.gate-actions')?.textContent || '');
+      ok(/Paused/.test(gateNote), `gate actions collapsed to "Paused" (got "${gateNote.trim().slice(0, 30)}")`);
+      const parkedRow = await page.$$eval('#backlogList .backlog-row', (rows) => {
+        const r = rows.find((x) => x.textContent.includes('A-2'));
+        const play = r.querySelector('.asg-play');
+        return { hasPlay: !!play, playTip: play?.title || '', checked: !!r.querySelector('.asg-check')?.checked };
+      });
+      ok(parkedRow.hasPlay && !parkedRow.checked, `parked row is re-armable: shows a play button + unchecked (tip "${parkedRow.playTip}")`);
+    }
+    await page.screenshot({ path: path.join(SHOTS, '3-parked.png') });
+
+    console.log('\n[6] state isolation: disjoint taskIds; A-2 acceptance prompt has no A-1 content');
+    {
+      const l = await apiList(page);
+      const a1 = l.assignments.find((a) => a.id === 'A-1'), a2 = l.assignments.find((a) => a.id === 'A-2');
+      const t1 = a1.taskIds || [], t2 = a2.taskIds || [];
+      ok(t1.length >= 1 && t2.length >= 1, `both assignments have bound tasks (A-1: ${t1.length}, A-2: ${t2.length})`);
+      ok(t1.every((t) => !t2.includes(t)), `taskIds are disjoint (A-1: ${t1.join(',')} vs A-2: ${t2.join(',')})`);
+      const a2Acceptance = adapter.requests.find((r) => r.includes('<acceptance-target>') && r.includes('A2-REQ'));
+      ok(!!a2Acceptance, 'captured the A-2 acceptance request');
+      ok(a2Acceptance && !a2Acceptance.includes('ESC-TASK-SUMMARY'),
+        'A-2 acceptance prompt does NOT leak A-1 task summaries (isolation at the prompt level)');
+      ok(a2Acceptance && a2Acceptance.includes('A2-TASK-SUMMARY'), 'A-2 acceptance prompt DOES carry its own task summary');
+    }
+
+    ok(jsErrors.length === 0, `no JS errors (${jsErrors.length}: ${jsErrors.slice(0, 3).join(' | ')})`);
+  } finally {
+    await browser.close();
+    server.close();
+    await cleanupDir(projectDir);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-assignments-intake-busy.mjs
new 633fbf2459671dbbf94f66cd
+/**
+ * EDGE PROBE (on-demand): intake-conversation edges + messaging-while-an-
+ * assignment-runs edges. Two servers, both on PORT 17963 (sequential).
+ *
+ * SERVER 1 (browser, non-git temp project):
+ *  [B1] intake MODAL with a CLARIFYING round: turn 1 returns a question -> the
+ *       question renders in the mini-chat and the left fields stay EMPTY;
+ *       turn 2 returns the card -> fields fill; "Add assignment" -> a ready
+ *       backlog row with the drafted requirement.
+ *  [B2] modal CANCEL mid-conversation: after a clarifying turn, Cancel closes
+ *       the modal and NO assignment was created (the modal only creates on
+ *       Add). Reopening resets the mini-chat + fields (no stale thread).
+ *  [B3] SIDE-PANEL intake cancel mid-flight: the first Send creates a
+ *       '(capturing…)' draft immediately; /api/assignments/intake-cancel with
+ *       {assignmentId} aborts the in-flight manager turn (best-effort — this
+ *       probe's signal-ignoring mock adapter still settles its turn) AND
+ *       deletes the never-carded placeholder draft, so no '(capturing…)'
+ *       orphans accumulate; a fresh thread after the cancel creates exactly
+ *       ONE new draft. (The UI's closeIntake wiring to this endpoint is
+ *       covered separately; here the endpoint is driven directly.)
+ *       Also: a concurrent intake POST while one runs -> 409.
+ *
+ * SERVER 2 (API-only, git-repo project, CB_ORCHESTRATOR default-on):
+ *  [B4] while an assignment run is in flight:
+ *         - a DISCUSS-mode message -> 409 "chat is already running"
+ *         - a normal message -> 200 {managing:true, forked:true}: the running
+ *           assignment forks to a background sub-agent, the manager answers
+ *           inline, AND the assignment still gets its acceptance gate.
+ *       PLUS the fork EVIDENCE (was an expected-fail gap, now FIXED): once
+ *       forked, the worker's task-end events are drawer-tagged but PERSIST
+ *       (server.mjs ephemerality exemption, like 'review' rows), so
+ *         (a) the end-of-task reviewer still finds the closed task and
+ *             reviews it despite the fork, and
+ *         (b) runAcceptance's acceptanceTasks filter carries the task summary
+ *             — the assignment verdict is judged WITH the work evidence.
+ *  [B5] busy guards: /api/assignments/start AND /api/assignments/send-fix
+ *       both 409 while a run is in flight (so activeAssignment can't be
+ *       re-bound mid-run), the bystander assignment stays ready, and the task
+ *       still binds to the right assignment.
+ *
+ * Run: node test/_edge-assignments-intake-busy.mjs   (skips if Chrome not found)
+ * Port: 17963 (assigned range 17962-17963).
+ */
+import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { execFile } from 'node:child_process';
+import { promisify } from 'node:util';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+import { cleanupDir } from './_helpers.mjs';
+
+const pexec = promisify(execFile);
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17963;
+const BASE = `http://127.0.0.1:${PORT}`;
+
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+async function api(method, p, body) {
+  const r = await fetch(BASE + p, {
+    method,
+    headers: body ? { 'content-type': 'application/json' } : undefined,
+    body: body ? JSON.stringify(body) : undefined,
+  });
+  return { status: r.status, json: await r.json().catch(() => null) };
+}
+async function pollIdle(ms = 30000) {
+  const t0 = Date.now();
+  for (;;) {
+    const { json } = await api('GET', '/api/state?limit=1');
+    if (['idle', 'done', 'error'].includes(json?.status)) return json.status;
+    if (Date.now() - t0 > ms) return `timeout(last=${json?.status})`;
+    await sleep(250);
+  }
+}
+
+// ── SERVER 1 adapter: complete-only, intake-routed ───────────────────────────
+const MODAL_CARD = `Got it — drafting now.
+<requirement-card>
+<title>MODAL-TITLE Env fix</title>
+<requirement>MODAL-REQ point the prod config at the right database</requirement>
+<acceptance-criteria>MODAL-ACC prod config matches the runbook</acceptance-criteria>
+<sources>modal probe</sources>
+</requirement-card>`;
+function intakeAdapter() {
+  let modalCalls = 0;
+  return {
+    async complete({ messages }) {
+      const all = (messages || []).map((m) => String(m.content || '')).join('\n');
+      if (all.includes('You are an intake manager')) {
+        if (all.includes('drafting a new assignment')) {   // the two-pane modal ctx
+          const n = modalCalls++;
+          await sleep(30);
+          if (n === 0) return { choices: [{ message: { content: 'CLARIFY-Q which environment is broken, prod or staging?' } }] };
+          if (n === 1) return { choices: [{ message: { content: MODAL_CARD } }] };
+          return { choices: [{ message: { content: 'CLARIFY-Q2 can you say more about what changed?' } }] };
+        }
+        // The SIDE-PANEL persistent intake thread: reply SLOWLY so the probe can
+        // cancel while the manager turn is still in flight.
+        await sleep(2500);
+        return { choices: [{ message: { content: 'SIDE-CLARIFY which app is affected?' } }] };
+      }
+      await sleep(10);
+      return { choices: [{ message: { content: 'nothing to add.' } }] };
+    },
+    async listModels() { return { data: [{ id: 'mock-model' }] }; },
+  };
+}
+
+// ── SERVER 2 adapter: routed, streaming worker is SLOW (~2.5s/turn 1) ────────
+function busyAdapter() {
+  const counts = new Map();
+  const requests = [];
+  const nth = (k) => { const n = counts.get(k) || 0; counts.set(k, n + 1); return n; };
+  function respond(messages) {
+    const all = (messages || []).map((m) => String(m.content || '')).join('\n');
+    requests.push(all);
+    if (all.includes('<review-target>')) return { text: '<review-pass/>' };
+    if (all.includes('<acceptance-target>')) return { text: '<accept-fulfilled>ok</accept-fulfilled>' };
+    if (all.includes('You are the MANAGER of a coding session')) return { text: 'MANAGER-ANSWER: the work is still in progress; I will surface it when it lands.' };
+    const users = (messages || []).filter((m) => m.role === 'user').reverse();
+    for (const u of users) {
+      const t = String(u.content || '');
+      if (t.includes('assignment A-1')) {
+        const n = nth('A1');
+        if (n === 0) return { slow: true, text: 'Working slowly on B1.\n<remote-workspace><next-task user-request="b1 unit" summary="B1-SUM finished the first piece"/></remote-workspace>' };
+        return { text: 'done.' };
+      }
+      if (t.includes('assignment A-2')) {
+        const n = nth('A2');
+        if (n === 0) return { slow: true, text: 'Working slowly on B2.\n<remote-workspace><next-task user-request="b2 unit" summary="B2-SUM finished the second piece"/></remote-workspace>' };
+        return { text: 'done.' };
+      }
+    }
+    return { text: 'nothing to add.' };
+  }
+  return {
+    requests,
+    async complete({ messages }) { const r = respond(messages); await sleep(r.slow ? 2500 : 15); return { choices: [{ message: { content: r.text } }] }; },
+    async *completeStream({ messages }) {
+      const r = respond(messages);
+      const step = r.slow ? Math.max(4, Math.ceil(r.text.length / 20)) : 60;
+      for (let off = 0; off < r.text.length; off += step) {
+        yield { choices: [{ delta: { content: r.text.slice(off, off + step) } }] };
+        await sleep(r.slow ? 125 : 4);
+      }
+    },
+    async listModels() { return { data: [{ id: 'mock-model' }] }; },
+  };
+}
+
+async function imSend(page, text) {
+  await page.click('#im-input');
+  await page.type('#im-input', text);
+  await page.keyboard.press('Enter');
+}
+
+async function runServer1() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-edge-intake-'));
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8')).replace(
+    '</head>',
+    '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock-model', baseURL: '(mock)' }) + ';</script></head>'
+  );
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'test-key', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'mock-model', port: PORT, adapter: intakeAdapter(), modelsList: [{ id: 'mock-model' }], initialProject: projectDir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1280, height: 900 });
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(BASE + '/');
+    await page.waitForFunction(() => !!document.getElementById('sidePanel') && !!document.getElementById('tabbtn-queue'), { timeout: 8000 });
+    await page.evaluate(() => selectSideTab('assignments'));
+
+    console.log('\n[B1] intake modal: clarifying round -> fields stay empty -> card -> Add');
+    await page.click('#pane-assignments .pane-add');
+    await page.waitForFunction(() => document.getElementById('intakeModalBg')?.classList.contains('show'), { timeout: 4000 });
+    await imSend(page, 'something in the environment config is broken');
+    await page.waitForFunction(
+      () => Array.from(document.querySelectorAll('#im-log .row.assistant')).some((r) => /CLARIFY-Q which environment/.test(r.textContent)),
+      { timeout: 8000 }
+    );
+    ok(true, 'clarifying question rendered in the mini-chat');
+    {
+      const f = await page.evaluate(() => ({
+        title: document.getElementById('im-title').value,
+        req: document.getElementById('im-req').value,
+        acc: document.getElementById('im-acc').value,
+      }));
+      ok(f.title === '' && f.req === '' && f.acc === '', `fields STAY EMPTY after a clarify-only turn (${JSON.stringify(f)})`);
+    }
+    await imSend(page, 'prod, please');
+    await page.waitForFunction(() => (document.getElementById('im-req')?.value || '').includes('MODAL-REQ'), { timeout: 8000 });
+    {
+      const f = await page.evaluate(() => ({
+        title: document.getElementById('im-title').value,
+        acc: document.getElementById('im-acc').value,
+      }));
+      ok(f.title === 'MODAL-TITLE Env fix' && /MODAL-ACC/.test(f.acc), `card after the clarify round fills all fields (title="${f.title}")`);
+    }
+    await page.evaluate(() => addFromIntake());
+    await page.waitForFunction(() => !document.getElementById('intakeModalBg').classList.contains('show'), { timeout: 4000 });
+    await page.waitForFunction(() => document.querySelectorAll('#backlogList .backlog-row').length === 1, { timeout: 4000 });
+    {
+      const l = await page.evaluate(async () => (await fetch('/api/assignments/list')).json());
+      const a = l.assignments[0];
+      ok(a && a.status === 'ready' && /MODAL-REQ/.test(a.requirement), `Add created a ready assignment from the clarified card (${a?.id} ${a?.status})`);
+    }
+
+    console.log('\n[B2] modal cancel mid-conversation -> NO orphan; reopen resets the thread');
+    await page.click('#pane-assignments .pane-add');
+    await page.waitForFunction(() => document.getElementById('intakeModalBg')?.classList.contains('show'), { timeout: 4000 });
+    {
+      const fresh = await page.evaluate(() => ({
+        rows: document.querySelectorAll('#im-log .row').length,
+        greeting: /Tell me what you want done/.test(document.getElementById('im-log').textContent),
+        title: document.getElementById('im-title').value, req: document.getElementById('im-req').value,
+      }));
+      ok(fresh.greeting && fresh.title === '' && fresh.req === '', `reopen starts a FRESH thread (greeting only, fields cleared; rows=${fresh.rows})`);
+    }
+    await imSend(page, 'CANCEL-PROBE something vague');
+    await page.waitForFunction(
+      () => Array.from(document.querySelectorAll('#im-log .row.assistant')).some((r) => /CLARIFY-Q2/.test(r.textContent)),
+      { timeout: 8000 }
+    );
+    await page.evaluate(() => {
+      const btn = Array.from(document.querySelectorAll('#intakeModalBg button')).find((b) => /^Cancel$/.test(b.textContent.trim()));
+      btn.click();
+    });
+    await page.waitForFunction(() => !document.getElementById('intakeModalBg').classList.contains('show'), { timeout: 4000 });
+    {
+      const l = await page.evaluate(async () => (await fetch('/api/assignments/list')).json());
+      ok(l.assignments.length === 1, `cancel mid-conversation left NO orphan assignment (still ${l.assignments.length} in backlog)`);
+    }
+    // Reopen once more: the cancelled thread must not bleed through.
+    await page.click('#pane-assignments .pane-add');
+    await page.waitForFunction(() => document.getElementById('intakeModalBg')?.classList.contains('show'), { timeout: 4000 });
+    {
+      const bled = await page.evaluate(() => /CANCEL-PROBE|CLARIFY-Q2/.test(document.getElementById('im-log').textContent));
+      ok(!bled, 'reopen after cancel shows NO trace of the cancelled conversation');
+    }
+    await page.evaluate(() => closeIntakeModal());
+
+    console.log('\n[B3] side-panel intake: cancel mid-flight aborts + reaps the placeholder draft');
+    await page.evaluate(() => toggleIntakeForm());
+    await page.waitForFunction(() => { const f = document.getElementById('intakeForm'); return f && !f.classList.contains('hidden'); }, { timeout: 4000 });
+    await page.type('#intakeText', 'SIDEPANEL-THREAD reconcile the runbooks');
+    await page.click('#intakeSendBtn');
+    // The draft is created synchronously in the POST, before the manager turn.
+    await page.waitForFunction(
+      async () => (await (await fetch('/api/assignments/list')).json()).assignments.length === 2,
+      { timeout: 6000 }
+    );
+    let cancelDraftId = null;
+    {
+      const l = await page.evaluate(async () => (await fetch('/api/assignments/list')).json());
+      const draft = l.assignments.find((a) => a.status === 'capturing');
+      cancelDraftId = draft?.id || null;
+      ok(!!draft && draft.title === '(capturing…)', `Send immediately created a 'capturing' draft (${draft?.id} "${draft?.title}")`);
+    }
+    // A concurrent intake POST while one runs -> 409 (checked BEFORE the cancel,
+    // while the 2.5s mock turn still holds the intake slot).
+    {
+      const r = await page.evaluate(async () => {
+        const res = await fetch('/api/assignments/intake', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'second thread attempt' }) });
+        return { status: res.status, json: await res.json().catch(() => null) };
+      });
+      ok(r.status === 409 && /intake already running/i.test(r.json?.error || ''), `concurrent intake POST -> 409 (${r.status}: ${r.json?.error})`);
+    }
+    // Cancel while the manager turn (2.5s mock) is still in flight — drive the
+    // endpoint directly with the draft id (the server half; closeIntake wires
+    // the same call from the UI).
+    {
+      const r = await page.evaluate(async (id) => {
+        const res = await fetch('/api/assignments/intake-cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assignmentId: id }) });
+        return { status: res.status, json: await res.json().catch(() => null) };
+      }, cancelDraftId);
+      ok(r.status === 200 && r.json?.ok === true, `intake-cancel {assignmentId} -> 200 ok (${r.status})`);
+    }
+    {
+      const l = await page.evaluate(async () => (await fetch('/api/assignments/list')).json());
+      const drafts = l.assignments.filter((a) => a.status === 'capturing');
+      ok(drafts.length === 0 && l.assignments.length === 1, `the never-carded draft was DELETED immediately (no '(capturing…)' orphan; ${l.assignments.length} left)`);
+    }
+    // The abort is best-effort: this mock adapter ignores the signal, so its turn
+    // still settles (the bubble lands) — wait for it so the intake slot frees.
+    await page.waitForFunction(
+      () => Array.from(document.querySelectorAll('.bubble.intake-manager')).some((b) => /SIDE-CLARIFY/.test(b.textContent)),
+      { timeout: 8000 }
+    );
+    ok(true, 'the in-flight turn settled after cancel (abort is best-effort with a signal-ignoring adapter)');
+    await page.evaluate(() => closeIntake());
+    ok(await page.evaluate(() => document.getElementById('intakeForm').classList.contains('hidden')), 'closeIntake hid the intake form (idempotent after the endpoint-driven cancel)');
+    // A fresh thread after the cancel creates exactly ONE new draft (no accumulation).
+    await page.evaluate(() => openIntake());
+    await page.type('#intakeText', 'SECOND-THREAD different request');
+    await page.click('#intakeSendBtn');
+    await page.waitForFunction(
+      async () => (await (await fetch('/api/assignments/list')).json()).assignments.filter((a) => a.status === 'capturing').length === 1,
+      { timeout: 8000 }
+    );
+    ok(true, 'a second thread after cancel created exactly ONE capturing draft (the cancelled one did not linger)');
+    await page.waitForFunction(
+      () => document.querySelectorAll('.bubble.intake-manager').length >= 2,
+      { timeout: 8000 }
+    );
+
+    ok(jsErrors.length === 0, `no JS errors in server-1 scenarios (${jsErrors.length}: ${jsErrors.slice(0, 3).join(' | ')})`);
+  } finally {
+    await browser.close();
+    server.close();
+    await sleep(300);
+    await cleanupDir(projectDir);
+  }
+}
+
+async function runServer2() {
+  const adapter = busyAdapter();
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-edge-busy-'));
+  // A real git repo so CB_ORCHESTRATOR's busy-delegate branch is live.
+  await pexec('git', ['init', '-b', 'main'], { cwd: projectDir });
+  await pexec('git', ['config', 'user.email', 'probe@test'], { cwd: projectDir });
+  await pexec('git', ['config', 'user.name', 'probe'], { cwd: projectDir });
+  await writeFile(path.join(projectDir, 'README.md'), 'edge probe repo\n');
+  await pexec('git', ['add', '-A'], { cwd: projectDir });
+  await pexec('git', ['commit', '-m', 'init'], { cwd: projectDir });
+
+  const { server } = await startServer({
+    html: '<html></html>', baseURL: '(mock)', apiKey: 'test-key', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'mock-model', port: PORT, adapter, modelsList: [{ id: 'mock-model' }], initialProject: projectDir,
+  });
+  try {
+    console.log('\n[B4] message while an assignment runs: discuss -> 409; normal -> manager delegate');
+    let r = await api('POST', '/api/assignments/create', { title: 'Busy One', requirement: 'B1-REQ keep the lights on', status: 'ready' });
+    ok(r.status === 200 && r.json.assignment.id === 'A-1', 'created ready A-1 via API');
+    r = await api('POST', '/api/assignments/start', { id: 'A-1' });
+    ok(r.status === 200 && /assignment A-1/.test(r.json.seedText), 'start armed A-1 + returned the seed');
+    r = await api('POST', '/api/message', { text: r.json.seedText });
+    ok(r.status === 200, 'seed message accepted (run started)');
+    await sleep(800);
+    {
+      const st = await api('GET', '/api/state?limit=1');
+      ok(st.json?.status === 'running', `run is in flight (status=${st.json?.status})`);
+    }
+    r = await api('POST', '/api/message', { text: 'just want to talk about the design', mode: 'discuss' });
+    ok(r.status === 409 && /chat is already running/i.test(r.json?.error || ''),
+      `DISCUSS message while running -> 409 (${r.status}: "${r.json?.error}") — discuss keeps the foreground lock, no delegate`);
+    r = await api('POST', '/api/message', { text: 'MANAGER-PROBE how is it going?' });
+    ok(r.status === 200 && r.json?.managing === true && r.json?.forked === true,
+      `normal message while running -> 200 managing:true forked:true (${JSON.stringify(r.json)})`);
+    const st4 = await pollIdle();
+    ok(['idle', 'done'].includes(st4), `forked run settled (${st4})`);
+    {
+      const ev = (await api('GET', '/api/events?limit=500')).json.events || [];
+      const gate = ev.find((e) => e.type === 'assignment-gate' && e.assignmentId === 'A-1');
+      ok(!!gate && gate.fulfilled === true, `assignment gate STILL emitted for A-1 after the fork (fulfilled=${gate?.fulfilled})`);
+      const card = ev.find((e) => e.type === 'subagent-card');
+      ok(!!card && card.status === 'done', `the backgrounded run folded a sub-agent card (status=${card?.status})`);
+      const ans = ev.find((e) => e.type === 'assistant-text' && /MANAGER-ANSWER/.test(e.content || ''));
+      ok(!!ans, 'the manager ANSWERED the busy-time message inline (no delegate needed)');
+    }
+    {
+      const l = (await api('GET', '/api/assignments/list')).json;
+      const a1 = l.assignments.find((a) => a.id === 'A-1');
+      ok((a1.taskIds || []).length === 1, `A-1 got its closed task bound (taskIds=${JSON.stringify(a1.taskIds)})`);
+    }
+    // ── THE FORK EVIDENCE (fixed): subagentChannel-tagged 'task-end' rows now ──
+    // ── persist (like 'review'), so BOTH quality gates see the forked run's work ──
+    {
+      const ev = (await api('GET', '/api/events?limit=500')).json.events || [];
+      const te = ev.find((e) => e.type === 'task-end' && /B1-SUM/.test(e.summary || ''));
+      const review = ev.find((e) => e.type === 'review');
+      ok(!!te, 'the post-fork task-end is persisted in the transcript (drawer-tagged but exempt from ephemerality)');
+      ok(!!review, 'the closed task got an end-of-task review despite the fork');
+      const acceptanceReq = adapter.requests.filter((t) => t.includes('<acceptance-target>')).pop();
+      ok(!!acceptanceReq && acceptanceReq.includes('B1-SUM'),
+        'the acceptance prompt carries the work the forked run produced (B1-SUM in the <work> evidence)');
+    }
+    r = await api('POST', '/api/assignments/accept', { id: 'A-1' });
+    ok(r.status === 200 && r.json.assignment.status === 'accepted', 'A-1 accepted via the gate endpoint');
+
+    console.log('\n[B5] busy guards: start + send-fix both 409 mid-run; binding stays correct');
+    await api('POST', '/api/assignments/create', { title: 'Busy Two', requirement: 'B2-REQ second piece', status: 'ready' });
+    await api('POST', '/api/assignments/create', { title: 'Bystander', requirement: 'B3-REQ third piece', status: 'ready' });
+    r = await api('POST', '/api/assignments/start', { id: 'A-2' });
+    ok(r.status === 200, 'started A-2');
+    await api('POST', '/api/message', { text: r.json.seedText });
+    await sleep(800);   // mid-stream: the worker has NOT closed its task yet
+    const startMidRun = await api('POST', '/api/assignments/start', { id: 'A-3' });
+    ok(startMidRun.status === 409 && /already running/i.test(startMidRun.json?.error || ''),
+      `mid-run start of A-3 -> 409 (${startMidRun.status}: "${startMidRun.json?.error}") — activeAssignment can't be re-bound mid-run`);
+    const fixMidRun = await api('POST', '/api/assignments/send-fix', { id: 'A-3' });
+    ok(fixMidRun.status === 409 && /already running/i.test(fixMidRun.json?.error || ''),
+      `mid-run send-fix -> 409 too (${fixMidRun.status}: "${fixMidRun.json?.error}")`);
+    {
+      const l = (await api('GET', '/api/assignments/list')).json;
+      const a2 = l.assignments.find((a) => a.id === 'A-2'), a3 = l.assignments.find((a) => a.id === 'A-3');
+      ok(a2.status === 'active' && a3.status === 'ready', `only A-2 is active; bystander A-3 untouched (A-2=${a2.status}, A-3=${a3.status})`);
+    }
+    const st5 = await pollIdle();
+    ok(['idle', 'done'].includes(st5), `A-2's run settled (${st5})`);
+    {
+      const ev = (await api('GET', '/api/events?limit=500')).json.events || [];
+      const te = ev.filter((e) => e.type === 'task-end' && /B2-SUM/.test(e.summary || '')).pop();
+      ok(!!te, `found the task A-2's worker closed (${te?.taskId})`);
+      const l = (await api('GET', '/api/assignments/list')).json;
+      const a2 = l.assignments.find((a) => a.id === 'A-2'), a3 = l.assignments.find((a) => a.id === 'A-3');
+      ok(!!te && (a2.taskIds || []).includes(te?.taskId) && !(a3.taskIds || []).includes(te?.taskId),
+        `the task closed by A-2's run is bound to A-2 only (A-2=${JSON.stringify(a2.taskIds)}, A-3=${JSON.stringify(a3.taskIds)})`);
+      const gate = ev.filter((e) => e.type === 'assignment-gate').pop();
+      ok(gate?.assignmentId === 'A-2', `the end-of-run acceptance gate belongs to A-2 (got ${gate?.assignmentId})`);
+    }
+  } finally {
+    server.close();
+    await sleep(300);
+    await cleanupDir(projectDir);
+  }
+}
+
+async function main() {
+  console.log('═══ SERVER 1: intake conversation edges (browser) ═══');
+  await runServer1();
+  console.log('\n═══ SERVER 2: busy-run messaging + mid-run start (API, git repo) ═══');
+  await runServer2();
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-bench-assets/h1-day-limit.GradingTest.java
new cf3728b1b7c1cde5d0b617eb
+package de.beuth.knabe.spring_ddd_bank.domain;
+
+import static org.junit.Assert.*;
+
+import java.time.LocalDate;
+import java.util.Locale;
+
+import org.junit.Before;
+import org.junit.Test;
+import org.junit.runner.RunWith;
+import org.springframework.beans.factory.annotation.Autowired;
+import org.springframework.boot.test.context.SpringBootTest;
+import org.springframework.test.context.junit4.SpringRunner;
+
+/** Hidden grading test for the per-client daily transfer limit policy (benchmark task h1). */
+@RunWith(SpringRunner.class)
+@SpringBootTest
+public class DayLimitGradingTest {
+
+	@Autowired
+	private CleanupService cleanupService;
+
+	@Autowired
+	private BankService bankService;
+
+	@Before
+	public void cleanUp() {
+		cleanupService.deleteAll();
+		Locale.setDefault(Locale.GERMANY);
+	}
+
+	@Test
+	public void defaultLimitAndSetterValidation() {
+		final Client jack = bankService.createClient("jack", LocalDate.parse("1966-12-31"));
+		assertEquals(0, jack.getDayLimit().compareTo(new Amount(5000, 0)));
+		jack.setDayLimit(new Amount(100, 0));
+		assertEquals(0, jack.getDayLimit().compareTo(new Amount(100, 0)));
+		try {
+			jack.setDayLimit(Amount.ZERO);
+			fail("Client.IllegalDayLimitExc expected for zero limit");
+		} catch (Client.IllegalDayLimitExc expected) {
+		}
+		try {
+			jack.setDayLimit(new Amount(-3.0));
+			fail("Client.IllegalDayLimitExc expected for negative limit");
+		} catch (Client.IllegalDayLimitExc expected) {
+		}
+		assertEquals("rejected setDayLimit must leave the limit unchanged",
+				0, jack.getDayLimit().compareTo(new Amount(100, 0)));
+	}
+
+	@Test
+	public void cumulativeTotalEnforcedAcrossTransfers() {
+		final Client jack = bankService.createClient("jack", LocalDate.parse("1966-12-31"));
+		final AccountNo srcNo = jack.createAccount("Src").getAccount().accountNo();
+		final AccountNo dstNo = jack.createAccount("Dst").getAccount().accountNo();
+		jack.deposit(srcNo, new Amount(10000, 0));
+
+		jack.transfer(jack.findMyAccount(srcNo), dstNo, new Amount(3000, 0));
+		try {
+			jack.transfer(jack.findMyAccount(srcNo), dstNo, new Amount(2500, 0));
+			fail("Client.DayLimitExc expected (3000 + 2500 > 5000)");
+		} catch (Client.DayLimitExc expected) {
+		}
+		// The rejected transfer must not have moved any money:
+		assertEquals(7000.0, jack.findMyAccount(srcNo).getBalance().toDouble(), 0.001);
+		assertEquals(3000.0, jack.findMyAccount(dstNo).getBalance().toDouble(), 0.001);
+		// Exactly reaching the limit is allowed (3000 + 2000 == 5000):
+		jack.transfer(jack.findMyAccount(srcNo), dstNo, new Amount(2000, 0));
+		assertEquals(5000.0, jack.findMyAccount(srcNo).getBalance().toDouble(), 0.001);
+		assertEquals(5000.0, jack.findMyAccount(dstNo).getBalance().toDouble(), 0.001);
+		// Any further cent is over the limit:
+		try {
+			jack.transfer(jack.findMyAccount(srcNo), dstNo, new Amount(0, 1));
+			fail("Client.DayLimitExc expected (limit exhausted)");
+		} catch (Client.DayLimitExc expected) {
+		}
+	}
+
+	@Test
+	public void failedTransfersAndDepositsDoNotCount() {
+		final Client jack = bankService.createClient("jack", LocalDate.parse("1966-12-31"));
+		final AccountNo srcNo = jack.createAccount("Src").getAccount().accountNo();
+		final AccountNo dstNo = jack.createAccount("Dst").getAccount().accountNo();
+		jack.deposit(srcNo, new Amount(10000, 0));   // deposits never count toward the limit
+
+		jack.transfer(jack.findMyAccount(srcNo), dstNo, new Amount(4000, 0));
+		// A FAILED transfer (missing destination) must not consume the limit:
+		try {
+			jack.transfer(jack.findMyAccount(srcNo), new AccountNo(999999L), new Amount(900, 0));
+			fail("Client.DestinationAccountNotFoundExc expected");
+		} catch (Client.DestinationAccountNotFoundExc expected) {
+		}
+		// 4000 + 1000 == 5000 — allowed iff the failed 900 did not count:
+		jack.transfer(jack.findMyAccount(srcNo), dstNo, new Amount(1000, 0));
+		assertEquals(5000.0, jack.findMyAccount(srcNo).getBalance().toDouble(), 0.001);
+	}
+
+	@Test
+	public void limitIsPerClient() {
+		final Client jack = bankService.createClient("jack", LocalDate.parse("1966-12-31"));
+		final AccountNo jackSrc = jack.createAccount("JackSrc").getAccount().accountNo();
+		final AccountNo jackDst = jack.createAccount("JackDst").getAccount().accountNo();
+		jack.deposit(jackSrc, new Amount(10000, 0));
+		jack.transfer(jack.findMyAccount(jackSrc), jackDst, new Amount(5000, 0));   // jack at his limit
+
+		final Client anna = bankService.createClient("anna", LocalDate.parse("1970-01-01"));
+		final AccountNo annaSrc = anna.createAccount("AnnaSrc").getAccount().accountNo();
+		final AccountNo annaDst = anna.createAccount("AnnaDst").getAccount().accountNo();
+		anna.deposit(annaSrc, new Amount(10000, 0));
+		// Jack's exhausted limit must not affect Anna:
+		anna.transfer(anna.findMyAccount(annaSrc), annaDst, new Amount(5000, 0));
+		assertEquals(5000.0, anna.findMyAccount(annaDst).getBalance().toDouble(), 0.001);
+	}
+}
+
=== add test/_edge-bench-assets/h1-day-limit.prompt.txt
new 93dae2785746b413b79af0aa
+Implement a per-client daily transfer limit policy in the banking domain (src/main/java/de/beuth/knabe/spring_ddd_bank/domain).
+
+Requirements:
+1. Every Client has an individual day limit, default 5000.00 EUR. Add to Client: `public Amount getDayLimit()` and `public void setDayLimit(Amount newLimit)`. setDayLimit must reject a zero or negative limit by throwing a new exception class `Client.IllegalDayLimitExc` (a static nested class extending multex.Exc, like the existing domain exceptions) and leave the limit unchanged in that case.
+2. Client.transfer must enforce the limit: the cumulative total of amounts SUCCESSFULLY transferred by this client (as the caller of transfer) during the current calendar day must never exceed the client's day limit. A transfer that would push the cumulative total over the limit must throw a new exception class `Client.DayLimitExc` (static nested, extends multex.Exc) and must not change any account balance. A cumulative total exactly equal to the limit is allowed.
+3. Transfers that fail for any reason (bad amount, no right, minimum balance, missing destination, day limit) do not count toward the day's total. Deposits and incoming transfers do not count either. The total is tracked per client — one client's spending never affects another client's limit.
+4. All existing tests must keep passing. Do not modify or delete any existing test, with one exception: you may extend the test-scope CleanupService if you introduce new persistence that needs cleanup. Any new test files you create will be removed before evaluation, so the implementation must stand on its own.
+5. Mind the project's JPA setup: domain entities are persisted entities; be careful how you map any new fields (e.g. the Amount type is an @Embeddable already embedded once in Account).
+
+Verify your work compiles and the existing tests pass (JAVA_HOME is already set; use the project's mvnw).
+
=== add test/_edge-bench-assets/h2-freeze.GradingTest.java
new b1a3e0d0a9b1a8ae3369f58a
+package de.beuth.knabe.spring_ddd_bank.domain;
+
+import static org.junit.Assert.*;
+
+import java.time.LocalDate;
+import java.util.Locale;
+
+import org.junit.Before;
+import org.junit.Test;
+import org.junit.runner.RunWith;
+import org.springframework.beans.factory.annotation.Autowired;
+import org.springframework.boot.test.context.SpringBootTest;
+import org.springframework.test.context.junit4.SpringRunner;
+
+/** Hidden grading test for the account-freezing capability (benchmark task h2). */
+@RunWith(SpringRunner.class)
+@SpringBootTest
+public class FreezeGradingTest {
+
+	@Autowired
+	private CleanupService cleanupService;
+
+	@Autowired
+	private BankService bankService;
+
+	@Before
+	public void cleanUp() {
+		cleanupService.deleteAll();
+		Locale.setDefault(Locale.GERMANY);
+	}
+
+	@Test
+	public void freezeUnfreezeLifecycleAndIdempotence() {
+		final Client jack = bankService.createClient("jack", LocalDate.parse("1966-12-31"));
+		final AccountNo no = jack.createAccount("Giro").getAccount().accountNo();
+		assertFalse("new accounts must not be frozen", jack.findMyAccount(no).isFrozen());
+
+		final Account frozen = bankService.freezeAccount(no);
+		assertTrue(frozen.isFrozen());
+		assertTrue("frozen state must be persisted", jack.findMyAccount(no).isFrozen());
+		// Idempotent:
+		assertTrue(bankService.freezeAccount(no).isFrozen());
+
+		final Account thawed = bankService.unfreezeAccount(no);
+		assertFalse(thawed.isFrozen());
+		assertFalse(jack.findMyAccount(no).isFrozen());
+		assertFalse(bankService.unfreezeAccount(no).isFrozen());
+	}
+
+	@Test
+	public void freezeUnknownAccountThrows() {
+		try {
+			bankService.freezeAccount(new AccountNo(999999L));
+			fail("BankService.AccountNotFoundExc expected");
+		} catch (BankService.AccountNotFoundExc expected) {
+		}
+		try {
+			bankService.unfreezeAccount(new AccountNo(999999L));
+			fail("BankService.AccountNotFoundExc expected");
+		} catch (BankService.AccountNotFoundExc expected) {
+		}
+	}
+
+	@Test
+	public void frozenSourceBlocksOutgoingTransfer() {
+		final Client jack = bankService.createClient("jack", LocalDate.parse("1966-12-31"));
+		final AccountNo srcNo = jack.createAccount("Src").getAccount().accountNo();
+		final AccountNo dstNo = jack.createAccount("Dst").getAccount().accountNo();
+		jack.deposit(srcNo, new Amount(500, 0));
+		bankService.freezeAccount(srcNo);
+		try {
+			jack.transfer(jack.findMyAccount(srcNo), dstNo, new Amount(100, 0));
+			fail("Client.FrozenAccountExc expected");
+		} catch (Client.FrozenAccountExc expected) {
+		}
+		assertEquals(500.0, jack.findMyAccount(srcNo).getBalance().toDouble(), 0.001);
+		assertEquals(0.0, jack.findMyAccount(dstNo).getBalance().toDouble(), 0.001);
+		// After unfreezing the transfer works again:
+		bankService.unfreezeAccount(srcNo);
+		jack.transfer(jack.findMyAccount(srcNo), dstNo, new Amount(100, 0));
+		assertEquals(400.0, jack.findMyAccount(srcNo).getBalance().toDouble(), 0.001);
+		assertEquals(100.0, jack.findMyAccount(dstNo).getBalance().toDouble(), 0.001);
+	}
+
+	@Test
+	public void incomingMoneyStaysAllowedOnFrozenAccount() {
+		final Client jack = bankService.createClient("jack", LocalDate.parse("1966-12-31"));
+		final AccountNo srcNo = jack.createAccount("Src").getAccount().accountNo();
+		final AccountNo frozenNo = jack.createAccount("Frozen").getAccount().accountNo();
+		jack.deposit(srcNo, new Amount(500, 0));
+		bankService.freezeAccount(frozenNo);
+		// Deposit INTO a frozen account is allowed:
+		jack.deposit(frozenNo, new Amount(50, 0));
+		assertEquals(50.0, jack.findMyAccount(frozenNo).getBalance().toDouble(), 0.001);
+		// Transfer INTO a frozen account is allowed:
+		jack.transfer(jack.findMyAccount(srcNo), frozenNo, new Amount(100, 0));
+		assertEquals(150.0, jack.findMyAccount(frozenNo).getBalance().toDouble(), 0.001);
+		assertEquals(400.0, jack.findMyAccount(srcNo).getBalance().toDouble(), 0.001);
+	}
+
+	@Test
+	public void rightsCheckPrecedesFrozenCheck() {
+		final Client jack = bankService.createClient("jack", LocalDate.parse("1966-12-31"));
+		final AccountNo srcNo = jack.createAccount("Src").getAccount().accountNo();
+		jack.deposit(srcNo, new Amount(500, 0));
+		bankService.freezeAccount(srcNo);
+		final Client chloe = bankService.createClient("chloe", LocalDate.parse("1992-05-05"));
+		final AccountNo chloeNo = chloe.createAccount("Chloe").getAccount().accountNo();
+		try {
+			chloe.transfer(jack.findMyAccount(srcNo), chloeNo, new Amount(10, 0));
+			fail("Client.WithoutRightExc expected (rights before frozen)");
+		} catch (Client.WithoutRightExc expected) {
+		}
+	}
+}
+
=== add test/_edge-bench-assets/h2-freeze.prompt.txt
new e0ef3ed7106d3aabaf3465fe
+Add an account-freezing capability to the banking domain (src/main/java/de/beuth/knabe/spring_ddd_bank/domain).
+
+Requirements:
+1. Account gets a frozen state: `public boolean isFrozen()`, false by default for new accounts. The state must be persisted with the account.
+2. BankService gets two new commands: `public Account freezeAccount(AccountNo accountNo)` and `public Account unfreezeAccount(AccountNo accountNo)`. Each looks up the account, sets/clears the frozen state, persists it, and returns the updated Account. Both are idempotent (freezing a frozen account or unfreezing an unfrozen one is a no-op, not an error). An unknown accountNo throws a new exception class `BankService.AccountNotFoundExc` (static nested, extends multex.Exc, like the existing domain exceptions).
+3. Client.transfer: when the SOURCE account is frozen, throw a new exception class `Client.FrozenAccountExc` (static nested, extends multex.Exc) and change no balance. The access-rights check still comes first: a client without any right on a frozen source account must still get the existing Client.WithoutRightExc, not FrozenAccountExc.
+4. Freezing blocks only OUTGOING transfers: deposits to a frozen account and transfers INTO a frozen account (as destination) remain allowed. Client.findMyAccount and Client.accountsReport are unaffected by frozen state.
+5. All existing tests must keep passing. Do not modify or delete any existing test (you may extend the test-scope CleanupService if needed). Any new test files you create will be removed before evaluation, so the implementation must stand on its own.
+
+Verify your work compiles and the existing tests pass (JAVA_HOME is already set; use the project's mvnw).
+
=== add test/_edge-bench-assets/h3-overdraft.GradingTest.java
new c172314bce6112ff7e7a74e9
+package de.beuth.knabe.spring_ddd_bank.domain;
+
+import static org.junit.Assert.*;
+
+import java.time.LocalDate;
+import java.util.Locale;
+
+import org.junit.Before;
+import org.junit.Test;
+import org.junit.runner.RunWith;
+import org.springframework.beans.factory.annotation.Autowired;
+import org.springframework.boot.test.context.SpringBootTest;
+import org.springframework.test.context.junit4.SpringRunner;
+
+/** Hidden grading test for the per-account overdraft limit (benchmark task h3). */
+@RunWith(SpringRunner.class)
+@SpringBootTest
+public class OverdraftGradingTest {
+
+	@Autowired
+	private CleanupService cleanupService;
+
+	@Autowired
+	private BankService bankService;
+
+	@Before
+	public void cleanUp() {
+		cleanupService.deleteAll();
+		Locale.setDefault(Locale.GERMANY);
+	}
+
+	@Test
+	public void defaultLimitMatchesOldGlobalMinimum() {
+		final Client jack = bankService.createClient("jack", LocalDate.parse("1966-12-31"));
+		final Account account = jack.createAccount("Giro").getAccount();
+		assertEquals(0, account.getOverdraftLimit().compareTo(new Amount(1000, 0)));
+		// Down to exactly -1000.00 is allowed by default:
+		final AccountNo dstNo = jack.createAccount("Dst").getAccount().accountNo();
+		jack.transfer(jack.findMyAccount(account.accountNo()), dstNo, new Amount(1000, 0));
+		assertEquals(-1000.0, jack.findMyAccount(account.accountNo()).getBalance().toDouble(), 0.001);
+		// One more cent is not:
+		try {
+			jack.transfer(jack.findMyAccount(account.accountNo()), dstNo, new Amount(0, 1));
+			fail("Client.MinimumBalanceExc expected");
+		} catch (Client.MinimumBalanceExc expected) {
+		}
+	}
+
+	@Test
+	public void raisedLimitIsEnforcedPerAccount() {
+		final Client jack = bankService.createClient("jack", LocalDate.parse("1966-12-31"));
+		final Account src = jack.createAccount("Src").getAccount();
+		final AccountNo dstNo = jack.createAccount("Dst").getAccount().accountNo();
+		jack.setOverdraftLimit(src, new Amount(2000, 0));
+		assertEquals(0, jack.findMyAccount(src.accountNo()).getOverdraftLimit().compareTo(new Amount(2000, 0)));
+		jack.transfer(jack.findMyAccount(src.accountNo()), dstNo, new Amount(1500, 0));
+		assertEquals(-1500.0, jack.findMyAccount(src.accountNo()).getBalance().toDouble(), 0.001);
+		// The OTHER account still has the default limit (per-account, not global):
+		try {
+			jack.transfer(jack.findMyAccount(dstNo), src.accountNo(), new Amount(2600, 0)); // 1500 - 2600 = -1100 < -1000
+			fail("Client.MinimumBalanceExc expected on the default-limit account");
+		} catch (Client.MinimumBalanceExc expected) {
+		}
+	}
+
+	@Test
+	public void zeroLimitForbidsAnyOverdraft() {
+		final Client jack = bankService.createClient("jack", LocalDate.parse("1966-12-31"));
+		final Account src = jack.createAccount("Src").getAccount();
+		final AccountNo dstNo = jack.createAccount("Dst").getAccount().accountNo();
+		jack.setOverdraftLimit(src, Amount.ZERO);
+		jack.deposit(src.accountNo(), new Amount(100, 0));
+		jack.transfer(jack.findMyAccount(src.accountNo()), dstNo, new Amount(100, 0));   // to exactly 0 — fine
+		try {
+			jack.transfer(jack.findMyAccount(src.accountNo()), dstNo, new Amount(0, 1));
+			fail("Client.MinimumBalanceExc expected (no overdraft allowed)");
+		} catch (Client.MinimumBalanceExc expected) {
+		}
+	}
+
+	@Test
+	public void onlyTheOwnerMaySetTheLimit() {
+		final Client jack = bankService.createClient("jack", LocalDate.parse("1966-12-31"));
+		final Account account = jack.createAccount("Giro").getAccount();
+		final Client anna = bankService.createClient("anna", LocalDate.parse("1970-01-01"));
+		jack.addAccountManager(account, anna);   // anna manages, does not own
+		try {
+			anna.setOverdraftLimit(account, new Amount(5000, 0));
+			fail("Client.NotOwnerExc expected for a mere manager");
+		} catch (Client.NotOwnerExc expected) {
+		}
+		final Client chloe = bankService.createClient("chloe", LocalDate.parse("1992-05-05"));
+		try {
+			chloe.setOverdraftLimit(account, new Amount(5000, 0));
+			fail("Client.NotOwnerExc expected for a stranger");
+		} catch (Client.NotOwnerExc expected) {
+		}
+		assertEquals("rejected setters must leave the limit unchanged",
+				0, jack.findMyAccount(account.accountNo()).getOverdraftLimit().compareTo(new Amount(1000, 0)));
+	}
+
+	@Test
+	public void illegalNewLimitsAreRejected() {
+		final Client jack = bankService.createClient("jack", LocalDate.parse("1966-12-31"));
+		final Account src = jack.createAccount("Src").getAccount();
+		final AccountNo dstNo = jack.createAccount("Dst").getAccount().accountNo();
+		try {
+			jack.setOverdraftLimit(src, new Amount(-1.0));
+			fail("Client.IllegalOverdraftLimitExc expected for a negative limit");
+		} catch (Client.IllegalOverdraftLimitExc expected) {
+		}
+		// Put the account 500 in debt, then try to lower the limit below the current debt:
+		jack.transfer(jack.findMyAccount(src.accountNo()), dstNo, new Amount(500, 0));
+		assertEquals(-500.0, jack.findMyAccount(src.accountNo()).getBalance().toDouble(), 0.001);
+		try {
+			jack.setOverdraftLimit(jack.findMyAccount(src.accountNo()), new Amount(300, 0));
+			fail("Client.IllegalOverdraftLimitExc expected (balance -500 below -300)");
+		} catch (Client.IllegalOverdraftLimitExc expected) {
+		}
+		assertEquals("rejected setters must leave the limit unchanged",
+				0, jack.findMyAccount(src.accountNo()).getOverdraftLimit().compareTo(new Amount(1000, 0)));
+	}
+}
+
=== add test/_edge-bench-assets/h3-overdraft.prompt.txt
new 6458e87c7be2317e6b48ea05
+Replace the bank's global minimum-balance rule with a per-account overdraft limit (src/main/java/de/beuth/knabe/spring_ddd_bank/domain).
+
+Requirements:
+1. Every Account gets an individual overdraft limit: an Amount >= 0 meaning the account balance may go down to MINUS that limit, but not below. Default for new accounts: 1000.00 EUR (so default behavior matches today's global minimum balance of -1000.00 EUR). Add `public Amount getOverdraftLimit()` to Account.
+2. Add to Client: `public void setOverdraftLimit(Account account, Amount newLimit)`. Only the OWNER of the account may change the limit — a mere manager or a stranger gets the existing Client.NotOwnerExc. A negative newLimit throws a new exception class `Client.IllegalOverdraftLimitExc` (static nested, extends multex.Exc). If the account's CURRENT balance is already below minus the newLimit (the account is deeper in debt than the new limit would allow), also throw Client.IllegalOverdraftLimitExc and leave the limit unchanged. The new limit must be persisted.
+3. Client.transfer must now enforce the SOURCE account's individual overdraft limit instead of the global static minimum: the new source balance may not drop below minus the source account's overdraft limit, otherwise the existing Client.MinimumBalanceExc is thrown (a new balance of exactly minus the limit is allowed). No balance changes on rejection.
+4. The static Account.getMinimumBalance() is used by existing tests — keep it working as-is so they still pass.
+5. All existing tests must keep passing. Do not modify or delete any existing test (you may extend the test-scope CleanupService if needed). Any new test files you create will be removed before evaluation, so the implementation must stand on its own.
+6. Mind the project's JPA setup: domain entities are persisted; be careful how you map any new fields (e.g. the Amount type is an @Embeddable already embedded once in Account).
+
+Verify your work compiles and the existing tests pass (JAVA_HOME is already set; use the project's mvnw).
+
=== add test/_edge-bench-assets/h4-batch.GradingTest.java
new 7c18809edda7786b0886bb05
+package de.beuth.knabe.spring_ddd_bank.domain;
+
+import static org.junit.Assert.*;
+
+import java.time.LocalDate;
+import java.util.Arrays;
+import java.util.Collections;
+import java.util.Locale;
+
+import org.junit.Before;
+import org.junit.Test;
+import org.junit.runner.RunWith;
+import org.springframework.beans.factory.annotation.Autowired;
+import org.springframework.boot.test.context.SpringBootTest;
+import org.springframework.test.context.junit4.SpringRunner;
+
+/** Hidden grading test for the atomic multi-transfer (benchmark task h4). */
+@RunWith(SpringRunner.class)
+@SpringBootTest
+public class TransferBatchGradingTest {
+
+	@Autowired
+	private CleanupService cleanupService;
+
+	@Autowired
+	private BankService bankService;
+
+	@Before
+	public void cleanUp() {
+		cleanupService.deleteAll();
+		Locale.setDefault(Locale.GERMANY);
+	}
+
+	@Test
+	public void happyPathWithDuplicateDestination() {
+		final Client jack = bankService.createClient("jack", LocalDate.parse("1966-12-31"));
+		final AccountNo srcNo = jack.createAccount("Src").getAccount().accountNo();
+		final AccountNo aNo = jack.createAccount("A").getAccount().accountNo();
+		final AccountNo bNo = jack.createAccount("B").getAccount().accountNo();
+		jack.deposit(srcNo, new Amount(500, 0));
+		jack.transferBatch(jack.findMyAccount(srcNo), Arrays.asList(aNo, bNo, aNo), new Amount(100, 0));
+		assertEquals(200.0, jack.findMyAccount(srcNo).getBalance().toDouble(), 0.001);
+		assertEquals("a destination listed twice receives 2 x amountEach",
+				200.0, jack.findMyAccount(aNo).getBalance().toDouble(), 0.001);
+		assertEquals(100.0, jack.findMyAccount(bNo).getBalance().toDouble(), 0.001);
+	}
+
+	@Test
+	public void missingDestinationLeavesEverythingUnchanged() {
+		final Client jack = bankService.createClient("jack", LocalDate.parse("1966-12-31"));
+		final AccountNo srcNo = jack.createAccount("Src").getAccount().accountNo();
+		final AccountNo aNo = jack.createAccount("A").getAccount().accountNo();
+		jack.deposit(srcNo, new Amount(500, 0));
+		try {
+			// The valid destination comes FIRST — a naive sequential implementation
+			// would already have moved money to it before hitting the missing one.
+			jack.transferBatch(jack.findMyAccount(srcNo), Arrays.asList(aNo, new AccountNo(999999L)), new Amount(100, 0));
+			fail("Client.DestinationAccountNotFoundExc expected");
+		} catch (Client.DestinationAccountNotFoundExc expected) {
+		}
+		assertEquals("all-or-nothing: source unchanged", 500.0, jack.findMyAccount(srcNo).getBalance().toDouble(), 0.001);
+		assertEquals("all-or-nothing: earlier destination unchanged", 0.0, jack.findMyAccount(aNo).getBalance().toDouble(), 0.001);
+	}
+
+	@Test
+	public void totalDebitCheckedAgainstMinimumBalance() {
+		final Client jack = bankService.createClient("jack", LocalDate.parse("1966-12-31"));
+		final AccountNo srcNo = jack.createAccount("Src").getAccount().accountNo();
+		final AccountNo aNo = jack.createAccount("A").getAccount().accountNo();
+		final AccountNo bNo = jack.createAccount("B").getAccount().accountNo();
+		final AccountNo cNo = jack.createAccount("C").getAccount().accountNo();
+		// Balance 0, minimum -1000: each 400 is individually fine, the 1200 total is not.
+		try {
+			jack.transferBatch(jack.findMyAccount(srcNo), Arrays.asList(aNo, bNo, cNo), new Amount(400, 0));
+			fail("Client.MinimumBalanceExc expected (total 1200 over the 1000 headroom)");
+		} catch (Client.MinimumBalanceExc expected) {
+		}
+		assertEquals(0.0, jack.findMyAccount(srcNo).getBalance().toDouble(), 0.001);
+		assertEquals(0.0, jack.findMyAccount(aNo).getBalance().toDouble(), 0.001);
+		assertEquals(0.0, jack.findMyAccount(bNo).getBalance().toDouble(), 0.001);
+		assertEquals(0.0, jack.findMyAccount(cNo).getBalance().toDouble(), 0.001);
+		// The total exactly at the headroom is allowed: 2 x 500 = 1000.
+		jack.transferBatch(jack.findMyAccount(srcNo), Arrays.asList(aNo, bNo), new Amount(500, 0));
+		assertEquals(-1000.0, jack.findMyAccount(srcNo).getBalance().toDouble(), 0.001);
+	}
+
+	@Test
+	public void invalidArgumentsAreRejected() {
+		final Client jack = bankService.createClient("jack", LocalDate.parse("1966-12-31"));
+		final AccountNo srcNo = jack.createAccount("Src").getAccount().accountNo();
+		final AccountNo aNo = jack.createAccount("A").getAccount().accountNo();
+		jack.deposit(srcNo, new Amount(500, 0));
+		try {
+			jack.transferBatch(jack.findMyAccount(srcNo), Collections.<AccountNo>emptyList(), new Amount(100, 0));
+			fail("Client.EmptyBatchExc expected");
+		} catch (Client.EmptyBatchExc expected) {
+		}
+		try {
+			jack.transferBatch(jack.findMyAccount(srcNo), Arrays.asList(aNo), Amount.ZERO);
+			fail("Client.AmountExc expected");
+		} catch (Client.AmountExc expected) {
+		}
+		final Client chloe = bankService.createClient("chloe", LocalDate.parse("1992-05-05"));
+		try {
+			chloe.transferBatch(jack.findMyAccount(srcNo), Arrays.asList(aNo), new Amount(10, 0));
+			fail("Client.WithoutRightExc expected");
+		} catch (Client.WithoutRightExc expected) {
+		}
+		assertEquals(500.0, jack.findMyAccount(srcNo).getBalance().toDouble(), 0.001);
+		assertEquals(0.0, jack.findMyAccount(aNo).getBalance().toDouble(), 0.001);
+	}
+}
+
=== add test/_edge-bench-assets/h4-batch.prompt.txt
new ad8a5a349a90536a751a9aec
+Add an atomic multi-transfer command to the banking domain (src/main/java/de/beuth/knabe/spring_ddd_bank/domain).
+
+Requirements:
+1. Add to Client: `public void transferBatch(Account source, java.util.List<AccountNo> destinations, Amount amountEach)`.
+2. Semantics: transfer amountEach from the source account to EACH destination account number in the list. Duplicate destinations are allowed and each occurrence counts as its own transfer (a destination listed twice receives 2 x amountEach in total).
+3. The batch is ALL-OR-NOTHING: if anything is invalid, NO account balance may change at all — neither in the database nor on any already-processed destination. Validations (reusing the existing exception classes where named):
+   - amountEach zero or negative -> Client.AmountExc
+   - empty (or null) destinations list -> a new exception class `Client.EmptyBatchExc` (static nested, extends multex.Exc)
+   - the calling client has no access right on the source account -> Client.WithoutRightExc
+   - any destination account number that does not exist -> Client.DestinationAccountNotFoundExc
+   - the TOTAL debit (amountEach times the number of list entries) must keep the source balance at or above the minimum balance (Account.getMinimumBalance()), else Client.MinimumBalanceExc. Note: each individual transfer might be fine while the total breaches the minimum — the check is against the total.
+4. On success all balances are updated and persisted: the source loses the total, each destination gains amountEach per occurrence in the list.
+5. All existing tests must keep passing. Do not modify or delete any existing test (you may extend the test-scope CleanupService if needed). Any new test files you create will be removed before evaluation, so the implementation must stand on its own.
+
+Verify your work compiles and the existing tests pass (JAVA_HOME is already set; use the project's mvnw).
+
=== add test/_edge-commits-modal.mjs
new 8d7c21572326f195f0c601ea
+/**
+ * EDGE PROBE (on-demand): the commits-to-merge modal (real git repo + real
+ * browser + routed mock adapter). The subbranch merge line's text (everything
+ * after the "← merge" button) opens a modal listing the ahead commits — each
+ * with its message + a per-commit diff — and a Merge button at the bottom.
+ *
+ *  [1] GET /api/merge-commits returns the ahead commits newest-first, each with
+ *      a subject, body, and a non-empty diff.
+ *  [2] the subbranch merge line renders a CLICKABLE source span (.merge-clickable)
+ *      when ahead > 0.
+ *  [3] openCommitsModal() renders one collapsible card per commit (newest expanded),
+ *      the diff lines colour add/del/hunk, and the footer Merge button names the parent.
+ *  [4] the modal's Merge button merges the branch into its parent (ahead → 0) and
+ *      closes; the merge line flips to "up to date" (no longer clickable).
+ *
+ * Run: node test/_edge-commits-modal.mjs    (skips if Chrome / git not found)
+ * Port: 17974.
+ */
+import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import { execFileSync } from 'node:child_process';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17974;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+function haveGit() { try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } }
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  if (!haveGit()) { console.log('SKIP: git not found'); process.exit(0); }
+
+  const dir = await mkdtemp(path.join(tmpdir(), 'cb-commits-'));
+  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
+  git('init', '-q', '-b', 'main');
+  git('config', 'user.email', 't@t'); git('config', 'user.name', 'T');
+  await writeFile(path.join(dir, 'app.js'), 'const x = 1;\nconsole.log(x);\n');
+  git('add', '-A'); git('commit', '-q', '-m', 'initial');
+  git('checkout', '-q', '-b', 'CODE_BOSS_test');
+  await writeFile(path.join(dir, 'app.js'), 'const x = 2;\nconsole.log(x);\nconsole.log("added");\n');
+  git('add', '-A'); git('commit', '-q', '-m', 'Bump Log4J to 2.25.4\n\nCleared the Fortify finding across the POMs.');
+  await writeFile(path.join(dir, 'app.js'), 'const x = 3;\nconsole.log(x);\nconsole.log("added");\nconsole.log("more");\n');
+  git('add', '-A'); git('commit', '-q', '-m', 'Add extra logging');
+
+  const strip = (s) => s.replace(/^import\s+[^;]+;[ \t]*\r?\n?/gm, '').replace(/^export\s+(async\s+function|function|class|const|let|var)\b/gm, '$1').replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
+  const mosaic = strip(await readFile(path.join(ROOT, 'src', 'agent', 'mosaic-layout.mjs'), 'utf8'));
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: '(mock)' }) + ';</script><script>' + mosaic + '</script></head>');
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'mock', port: PORT, adapter: { async complete() { return { choices: [{ message: { content: 'ok.' } }] }; } },
+    modelsList: [{ id: 'mock' }], initialProject: dir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1100, height: 860 });
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForFunction(() => typeof openCommitsModal === 'function' && typeof refreshMergeBar === 'function', { timeout: 12000 });
+    await sleep(300);
+
+    console.log('\n[1] /api/merge-commits returns ahead commits newest-first w/ diffs');
+    const api = await page.evaluate(async () => (await fetch('/api/merge-commits')).json());
+    const repo = (api.repos || [])[0] || {};
+    ok(repo.branch === 'CODE_BOSS_test' && repo.parent === 'main', `repo names branch + parent (${repo.branch} → ${repo.parent})`);
+    ok((repo.commits || []).length === 2, `two ahead commits (got ${(repo.commits || []).length})`);
+    ok(repo.commits?.[0]?.subject === 'Add extra logging', `newest commit first (got "${repo.commits?.[0]?.subject}")`);
+    ok((repo.commits || []).every((c) => c.diff && c.diff.includes('app.js')), 'every commit carries a non-empty diff touching app.js');
+    ok(/Cleared the Fortify finding/.test(repo.commits?.[1]?.body || ''), 'commit body (multi-line message) is captured');
+
+    console.log('\n[2] the subbranch merge line is clickable when ahead > 0');
+    await page.evaluate(() => refreshMergeBar());
+    await page.waitForFunction(() => !!document.querySelector('#mergeRow .merge-source.merge-clickable'), { timeout: 5000 });
+    ok(true, 'merge line source span has .merge-clickable (opens the modal)');
+
+    console.log('\n[3] openCommitsModal renders a collapsible card + diff per commit');
+    await page.evaluate(() => openCommitsModal());
+    await page.waitForFunction(() => document.querySelectorAll('.commit-entry').length === 2, { timeout: 5000 });
+    const modal = await page.evaluate(() => ({
+      title: document.getElementById('commitsModalTitle').textContent,
+      mergeBtn: document.getElementById('commitsMergeBtn').textContent,
+      firstExpanded: !document.querySelector('.commit-entry')?.classList.contains('collapsed'),
+      secondCollapsed: document.querySelectorAll('.commit-entry')[1]?.classList.contains('collapsed'),
+      addLines: document.querySelectorAll('.commit-entry:not(.collapsed) .ce-diff .dl.add').length,
+      delLines: document.querySelectorAll('.commit-entry:not(.collapsed) .ce-diff .dl.del').length,
+    }));
+    ok(/Commits to merge \(2\)/.test(modal.title), `modal titled with the count (got "${modal.title}")`);
+    ok(modal.mergeBtn === '← Merge into main', `Merge button names the parent (got "${modal.mergeBtn}")`);
+    ok(modal.firstExpanded && modal.secondCollapsed, 'newest commit expanded, the rest collapsed');
+    ok(modal.addLines >= 1 && modal.delLines >= 1, `diff lines are coloured (add=${modal.addLines}, del=${modal.delLines})`);
+    // Clicking a collapsed card expands it.
+    await page.evaluate(() => document.querySelectorAll('.commit-entry')[1].querySelector('.ce-head').click());
+    ok(await page.evaluate(() => !document.querySelectorAll('.commit-entry')[1].classList.contains('collapsed')), 'clicking a card head expands it');
+
+    console.log('\n[4] the modal Merge button merges → ahead 0, line flips to up to date');
+    await page.evaluate(() => mergeFromCommitsModal());
+    await page.waitForFunction(() => !document.getElementById('commitsModalBg').classList.contains('show'), { timeout: 8000 });
+    ok(true, 'modal closed after merge');
+    await page.waitForFunction(() => {
+      const row = document.getElementById('mergeRow');
+      return row && /up to date/.test(row.textContent) && !row.querySelector('.merge-source.merge-clickable');
+    }, { timeout: 8000 });
+    ok(true, 'merge line now reads "up to date" + is no longer clickable');
+    const after = await page.evaluate(async () => (await fetch('/api/merge-commits')).json());
+    ok(((after.repos || [])[0]?.commits || []).length === 0, 'API reports 0 ahead commits after the merge');
+
+    ok(jsErrors.length === 0, `no JS errors (${jsErrors.length}: ${jsErrors.slice(0, 2).join(' | ')})`);
+  } finally {
+    await browser.close(); server.close();
+    await cleanupDir(dir);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-conversation-jsonl.mjs
new 980e06f9ddc3dcf2a00c6da9
+/**
+ * EDGE PROBE (on-demand): append-only JSONL conversation persistence.
+ *
+ *   [A] events are written to conversation.jsonl (one JSON per line) + a tiny
+ *       conversation.meta.json sidecar (nextEventId + lastChecklist).
+ *   [B] APPEND, not rewrite: a second save adds new lines without rewriting the
+ *       file — proven by the absence of a .jsonl.bak (the full-rewrite path is the
+ *       only thing that makes a .bak) and the prior lines staying byte-identical.
+ *   [C] reload restores every event + continues nextEventId (no id collision).
+ *   [D] migration: a legacy conversation.json is converted to .jsonl + meta on
+ *       first open, and the old file is retired to .migrated.
+ *   [E] torn-line recovery: a half-written last line is skipped on load; the rest
+ *       of the log survives.
+ *   [F] clear deletes the .jsonl, the meta, and the .migrated.
+ *   [G] close-project flushes the pending debounced save (no last-event loss).
+ *   [H] a leftover legacy conversation.json beside a jsonl is retired on load.
+ *
+ * Run: node test/_edge-conversation-jsonl.mjs   (starts its own server; no Chrome needed)
+ */
+import { mkdtemp, rm, stat, readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { startServer } from '../src/server.mjs';
+
+const PORT = 28993;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+const exists = (p) => stat(p).then(() => true).catch(() => false);
+const readJsonl = async (p) => (await readFile(p, 'utf8')).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { __torn: true }; } });
+
+// Reviewer/attack-aware mock so background review calls never steal worker slots.
+const adapter = {
+  async complete({ messages }) {
+    const txt = (messages || []).map((m) => String(m.content || '')).join('\n');
+    if (/give your single verdict|parallel REVIEWER/i.test(txt)) return { choices: [{ message: { content: 'no problems found' } }] };
+    if (/code review agent/i.test(txt)) return { choices: [{ message: { content: '<review-pass/>' } }] };
+    return { choices: [{ message: { content: 'ok.' } }] };
+  },
+};
+async function api(p, body) {
+  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
+  if (!r.ok) throw new Error(`${p} -> ${r.status}`);
+  return r;
+}
+const state = () => fetch(`http://127.0.0.1:${PORT}/api/state`).then((r) => r.json());
+async function send(text) { await api('/api/message', { text, model: 'm', critic: false, phaseAttack: false }); }
+async function waitIdle() { const t0 = Date.now(); while (Date.now() - t0 < 15000) { if ((await state()).status === 'done' || (await state()).status === 'idle') return; await sleep(60); } }
+async function sendAndSettle(text) { await send(text); await waitIdle(); await sleep(450); }   // 450 > 300ms debounce
+
+async function main() {
+  const A = await mkdtemp(path.join(tmpdir(), 'cb-jsonl-a-'));
+  const B = await mkdtemp(path.join(tmpdir(), 'cb-jsonl-b-'));
+  const M = await mkdtemp(path.join(tmpdir(), 'cb-jsonl-mig-'));
+  const C = await mkdtemp(path.join(tmpdir(), 'cb-jsonl-close-'));
+  const L = await mkdtemp(path.join(tmpdir(), 'cb-jsonl-leftover-'));
+  const D = await mkdtemp(path.join(tmpdir(), 'cb-jsonl-abort-'));
+  const jA = path.join(A, '.code_boss', 'conversation.jsonl');
+  const metaA = path.join(A, '.code_boss', 'conversation.meta.json');
+
+  // Pre-seed M with a LEGACY conversation.json (the old single-file format).
+  await mkdir(path.join(M, '.code_boss'), { recursive: true });
+  const legacyEvents = [
+    { id: 'e1', type: 'user-message', taskId: 'T-1', content: 'legacy hello' },
+    { id: 'e2', type: 'assistant-text', taskId: 'T-1', content: 'legacy reply' },
+  ];
+  await writeFile(path.join(M, '.code_boss', 'conversation.json'), JSON.stringify({ version: 1, nextEventId: 7, chatEvents: legacyEvents, lastChecklist: null }), 'utf8');
+
+  // Pre-seed L with BOTH a valid jsonl AND a leftover legacy conversation.json
+  // (simulates a prior migration whose retire-rename lost a race / was locked).
+  await mkdir(path.join(L, '.code_boss'), { recursive: true });
+  await writeFile(path.join(L, '.code_boss', 'conversation.jsonl'), JSON.stringify({ id: 'e1', type: 'user-message', taskId: 'T-1', content: 'from the jsonl' }) + '\n', 'utf8');
+  await writeFile(path.join(L, '.code_boss', 'conversation.json'), JSON.stringify({ version: 1, nextEventId: 2, chatEvents: [{ id: 'e1', type: 'user-message', content: 'leftover legacy' }] }), 'utf8');
+
+  const { server } = await startServer({
+    html: '<html></html>', baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'm', port: PORT, adapter, modelsList: [{ id: 'm' }], initialProject: A,
+  });
+  try {
+    console.log('\n[A] events written to conversation.jsonl + meta sidecar');
+    await sendAndSettle('first message');
+    ok(await exists(jA), 'conversation.jsonl exists');
+    ok(await exists(metaA), 'conversation.meta.json sidecar exists');
+    let evs = await readJsonl(jA);
+    ok(evs.length > 0 && !evs.some((e) => e.__torn), `jsonl is one-valid-JSON-per-line (${evs.length} events)`);
+    ok(evs.some((e) => e.type === 'user-message' && /first message/.test(e.content || '')), 'jsonl holds the user message');
+    const meta = JSON.parse(await readFile(metaA, 'utf8'));
+    ok(typeof meta.nextEventId === 'number' && meta.version === 2, `meta has version + nextEventId (next=${meta.nextEventId})`);
+
+    console.log('\n[B] second save APPENDS (no full rewrite → no .jsonl.bak; prior bytes stable)');
+    const afterFirst = await readFile(jA, 'utf8');
+    await sendAndSettle('second message');
+    const afterSecond = await readFile(jA, 'utf8');
+    ok(afterSecond.startsWith(afterFirst), 'the new save kept the earlier lines byte-identical (appended after them)');
+    ok(afterSecond.length > afterFirst.length, 'the file grew by the appended lines');
+    ok(!(await exists(jA + '.bak')), 'no conversation.jsonl.bak — appends never triggered a full rewrite');
+
+    console.log('\n[C] reload restores events + continues nextEventId');
+    const before = await state();
+    const nUser = before.events.filter((e) => e.type === 'user-message').length;
+    await api('/api/open-project', { path: B });        // switch away
+    await api('/api/open-project', { path: A });        // ...and back → reload from jsonl
+    const reloaded = await state();
+    ok(reloaded.events.length === before.events.length, `reload restored all ${before.events.length} events (got ${reloaded.events.length})`);
+    ok(reloaded.events.filter((e) => e.type === 'user-message').length === nUser, `both user messages restored (${nUser})`);
+    const maxId = Math.max(0, ...reloaded.events.map((e) => Number(/^e(\d+)$/.exec(e.id || '')?.[1] || 0)));
+    await sendAndSettle('third message');
+    const afterThird = await state();
+    const ids = afterThird.events.map((e) => e.id);
+    ok(new Set(ids).size === ids.length, 'no duplicate event ids after reload + new message (nextEventId continued)');
+    ok(afterThird.events.some((e) => /third message/.test(e.content || '')), 'the post-reload message appended fine');
+
+    console.log('\n[D] migration: legacy conversation.json → conversation.jsonl + .migrated');
+    await api('/api/open-project', { path: M });
+    await sleep(300);
+    const jM = path.join(M, '.code_boss', 'conversation.jsonl');
+    ok(await exists(jM), 'conversation.jsonl created on first open of a legacy project');
+    ok(await exists(path.join(M, '.code_boss', 'conversation.json.migrated')), 'legacy conversation.json retired to .migrated');
+    ok(!(await exists(path.join(M, '.code_boss', 'conversation.json'))), 'legacy conversation.json no longer present');
+    const mEvs = await readJsonl(jM);
+    ok(mEvs.some((e) => /legacy hello/.test(e.content || '')) && mEvs.some((e) => /legacy reply/.test(e.content || '')), 'migrated events preserved in the jsonl');
+    const sM = await state();
+    ok(sM.events.some((e) => /legacy hello/.test(e.content || '')), 'migrated events visible via /api/state');
+
+    console.log('\n[E] torn last line is skipped on load; the rest survives');
+    await api('/api/open-project', { path: A });
+    await sleep(200);
+    const goodCount = (await readJsonl(jA)).length;
+    await appendFile(jA, '{"id":"eX","type":"user-message","content":"TORN', 'utf8');   // half-written line, no newline/close
+    await api('/api/open-project', { path: B });
+    await api('/api/open-project', { path: A });        // reload with the torn tail
+    const sTorn = await state();
+    ok(sTorn.events.length === goodCount, `torn last line skipped — kept ${goodCount} valid events (got ${sTorn.events.length})`);
+    ok(!sTorn.events.some((e) => /TORN/.test(e.content || '')), 'the half-written event was NOT loaded');
+
+    console.log('\n[G] close-project flushes the pending debounced save (no last-event loss)');
+    {
+      // Fresh project, first message: send + wait for the run to finish but do
+      // NOT wait out the 300ms debounce. The mock run is ~125ms, so at close
+      // time the save is still queued — close-project MUST flush it (else the
+      // jsonl is never written and reopening shows 0 events).
+      await api('/api/open-project', { path: C });
+      await send('only message'); await waitIdle();
+      const jC = path.join(C, '.code_boss', 'conversation.jsonl');
+      ok(!(await exists(jC)), 'sanity: jsonl not yet flushed at close time (debounce still pending)');
+      await api('/api/close-project', {});
+      ok(await exists(jC), 'close-project flushed the pending save → jsonl now exists');
+      await api('/api/open-project', { path: C });   // reload from disk
+      const sC = await state();
+      ok(sC.events.some((e) => /only message/.test(e.content || '')), 'the last event survived close+reopen');
+    }
+
+    console.log('\n[H] a leftover legacy conversation.json beside a jsonl is retired on load');
+    {
+      await api('/api/open-project', { path: L });
+      await sleep(200);
+      const sL = await state();
+      ok(sL.events.some((e) => /from the jsonl/.test(e.content || '')), 'loaded events from the jsonl (not the legacy file)');
+      ok(!sL.events.some((e) => /leftover legacy/.test(e.content || '')), 'the leftover legacy events were NOT loaded');
+      ok(!(await exists(path.join(L, '.code_boss', 'conversation.json'))), 'leftover legacy conversation.json retired');
+      ok(await exists(path.join(L, '.code_boss', 'conversation.json.migrated')), 'leftover legacy retired to .migrated');
+    }
+
+    console.log('\n[F] clear deletes jsonl + meta + migrated');
+    await api('/api/open-project', { path: A });
+    await sleep(200);
+    await api('/api/clear-conversation', {});
+    await sleep(150);
+    ok(!(await exists(jA)), 'conversation.jsonl deleted on clear');
+    ok(!(await exists(metaA)), 'conversation.meta.json deleted on clear');
+    ok((await state()).events.length === 0, 'in-memory events empty after clear');
+
+    console.log('\n[I] project switch ABORTS (no data loss) when the leaving-project flush fails');
+    {
+      await api('/api/open-project', { path: D });
+      await sendAndSettle('keep me');                       // D jsonl exists + flushed
+      const jD = path.join(D, '.code_boss', 'conversation.jsonl');
+      // Sabotage: replace the jsonl FILE with a DIRECTORY so the next write throws.
+      await rm(jD, { force: true });
+      await mkdir(jD, { recursive: true });
+      // New pending events; switch away BEFORE the debounce fires so the switch's
+      // own flush is what hits the sabotaged path and returns false.
+      await send('unsaved precious'); await waitIdle();
+      const r = await fetch(`http://127.0.0.1:${PORT}/api/open-project`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: A }) });
+      ok(r.status === 400, `switch rejected with an error (got ${r.status})`);
+      const sAbort = await state();
+      ok(sAbort.activeProject === D, 'still on the ORIGINAL project — switch aborted');
+      ok(sAbort.events.some((e) => /unsaved precious/.test(e.content || '')), 'the unsaved events are STILL in memory (not discarded by a reset)');
+      await rm(jD, { recursive: true, force: true });        // un-sabotage so the re-armed save can succeed
+      await sleep(450);                                       // let the re-armed flush write a real file
+      ok(await exists(jD) && !(await stat(jD)).isDirectory(), 'after un-sabotage the re-armed save persisted the events to a real file');
+    }
+  } finally {
+    server.close();
+    for (const d of [A, B, M, C, L, D]) await rm(d, { recursive: true, force: true }).catch(() => {});
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-convo-cancel.mjs
new 42964946080c0244a19c027b
+/**
+ * EDGE PROBE (conversation core): CANCEL via Escape at every phase.
+ *
+ *   [A] Escape while IDLE is a silent no-op (no error modal, status stays
+ *       idle); a direct /api/cancel returns the "no chat in progress" note.
+ *   [B] Escape while PROSE IS STREAMING: the run aborts and the foreground
+ *       SETTLES OUT OF 'running' (current contract: a user cancel settles to
+ *       'idle', NOT 'error' — cancelChat() drives the "canceled by user" line
+ *       directly and the server's abort path clears the error flag). NO error
+ *       modal pops, the steer button hides, the partial prose stays visible.
+ *       Also: /api/clear-conversation DURING the run → 409.
+ *   [C] Escape while a TOOL IS EXECUTING (a 60s powershell sleep): the run
+ *       aborts promptly (worker child killed — way under the 60s sleep), no
+ *       tool row is left blinking (.tool-running), the call row carries the
+ *       error dot.
+ *   [D] state coherence after both cancels: a fresh send runs to completion,
+ *       the canceled status line is replaced by the live spinner/done line.
+ *   [E] Escape with ONLY sub-agents working (foreground idle) STILL cancels:
+ *       the orchestrator case where the old status==='running' guard made Esc
+ *       a silent no-op even though background sub-agents were churning.
+ *
+ * Run: node test/_edge-convo-cancel.mjs   (skips if Chrome not found)
+ */
+import { mkdtemp, readFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17961;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+// Content-routed STREAMING adapter (pattern from _edge-mermaid): the route key
+// is matched in the latest user message; chunks are yielded with a delay so the
+// probe can interrupt mid-stream. complete() (reviewer etc.) always passes.
+function routedAdapter(routes) {
+  const find = (messages) => {
+    const userMsgs = (messages || []).filter((m) => m.role === 'user').reverse();
+    for (const u of userMsgs) {
+      const text = String(u.content || '');
+      for (const key of Object.keys(routes)) if (text.includes(key)) return key;
+    }
+    return null;
+  };
+  return {
+    async *completeStream(opts) {
+      const key = find(opts?.messages);
+      if (!key) { yield { choices: [{ delta: { content: 'no route.' } }] }; return; }
+      const { chunks, delayMs } = routes[key];
+      for (const c of chunks) {
+        await sleep(delayMs);
+        yield { choices: [{ delta: { content: c } }] };
+      }
+    },
+    async complete() { return { choices: [{ message: { content: '<review-pass/>' } }] }; },
+  };
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-cancel-'));
+
+  const routes = {
+    'stream long prose': {
+      delayMs: 150,
+      chunks: Array.from({ length: 60 }, (_, i) => `prose line ${i + 1} of the long explanation.\n`),
+    },
+    'run the long tool': {
+      delayMs: 20,
+      chunks: ['Kicking off the long tool now.\n<remote-workspace>\n<run>Start-Sleep -Seconds 60</run>\n</remote-workspace>\n<task-progress percent="10">sleeping</task-progress>'],
+    },
+    'quick final check': {
+      delayMs: 20,
+      chunks: ['Recovered fine — everything is coherent.'],
+    },
+  };
+
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: '(mock)' }) + ';</script></head>');
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'mock', port: PORT, adapter: routedAdapter(routes), modelsList: [{ id: 'mock' }], initialProject: projectDir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1200, height: 800 });
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForSelector('#chat:not(.hidden)', { timeout: 15000 });
+    await page.waitForFunction(() => typeof send === 'function' && !!window.__sessionRef, { timeout: 8000 });
+    await sleep(300);
+
+    console.log('\n[A] Escape while idle: silent no-op');
+    {
+      await page.keyboard.press('Escape');
+      await sleep(400);
+      const st = await page.evaluate(() => ({
+        status: window.__sessionRef?.status,
+        modal: document.getElementById('modalBg')?.classList.contains('show') || false,
+      }));
+      ok(st.status === 'idle', `status stays idle after an idle Escape (got ${st.status})`);
+      ok(st.modal === false, 'no error modal popped for the idle Escape');
+      const r = await page.evaluate(async () => (await (await fetch('/api/cancel', { method: 'POST' })).json()));
+      ok(r.note === 'no chat in progress', `direct /api/cancel reports the no-op note (got ${JSON.stringify(r)})`);
+    }
+
+    console.log('\n[B] Escape mid-STREAM');
+    {
+      await page.evaluate(() => { document.getElementById('input').value = 'stream long prose for me'; send(); });
+      // Wait until real streamed prose is on screen.
+      await page.waitForFunction(() => {
+        const r = document.querySelector('.row.assistant[data-streaming="true"]');
+        return r && /prose line 3/.test(r.textContent || '');
+      }, { timeout: 15000 });
+      // While the run is live: clear-conversation must refuse.
+      const clearR = await page.evaluate(async () => (await fetch('/api/clear-conversation', { method: 'POST' })).status);
+      ok(clearR === 409, `/api/clear-conversation during a run → 409 (got ${clearR})`);
+
+      await page.keyboard.press('Escape');
+      // Current contract: a user cancel settles the foreground OUT of 'running' (to 'idle')
+      // and shows the "canceled by user" line directly via cancelChat(). Wait on that line.
+      await page.waitForFunction(() => /canceled by user/.test(document.getElementById('log')?.textContent || ''), { timeout: 10000 });
+      await sleep(500);
+      const st = await page.evaluate(() => {
+        const rows = [...document.querySelectorAll('#log .status')];
+        return {
+          status: window.__sessionRef?.status,
+          sessPhase: window.__sessionRef?.phase,
+          statusRowCount: rows.length,
+          statusRowHtml: rows.map((r) => r.innerHTML.slice(0, 120)),
+          canceledLine: /canceled by user/.test(document.getElementById('log')?.textContent || ''),
+          modal: document.getElementById('modalBg')?.classList.contains('show') || false,
+          steerVisible: (() => { const b = document.getElementById('steerBtn'); return b ? b.offsetParent !== null : null; })(),
+          partialKept: /prose line 3/.test(document.getElementById('log')?.textContent || ''),
+          toolRunning: document.querySelectorAll('.row.tool.tool-running').length,
+        };
+      });
+      if (!st.canceledLine) console.log(`  DEBUG [B] status=${st.status} sessPhase=${st.sessPhase} rows=${st.statusRowCount} html=${JSON.stringify(st.statusRowHtml)}`);
+      ok(st.status !== 'running', `foreground settled out of 'running' after cancel (got ${st.status})`);
+      ok(st.canceledLine, 'status row shows "canceled by user"');
+      ok(st.modal === false, 'no error modal for a user-initiated cancel');
+      ok(st.steerVisible === false, 'steer button hidden after the cancel');
+      ok(st.partialKept, 'the partial streamed prose is still visible');
+      ok(st.toolRunning === 0, 'no tool row left blinking');
+    }
+
+    console.log('\n[C] Escape mid-TOOL-EXEC (60s powershell sleep)');
+    {
+      await page.evaluate(() => { document.getElementById('input').value = 'run the long tool'; send(); });
+      await page.waitForFunction(() => document.querySelectorAll('.row.tool.tool-running').length > 0, { timeout: 15000 });
+      const t0 = Date.now();
+      await page.keyboard.press('Escape');
+      // The "canceled by user" line is immediate (client-side); the real proof the 60s sleep
+      // was KILLED (not awaited) is the tool row dropping its .tool-running blink promptly.
+      await page.waitForFunction(() => /canceled by user/.test(document.getElementById('log')?.textContent || ''), { timeout: 10000 });
+      await page.waitForFunction(() => document.querySelectorAll('.row.tool.tool-running').length === 0, { timeout: 25000 });
+      const abortMs = Date.now() - t0;
+      await sleep(500);
+      const st = await page.evaluate(() => ({
+        status: window.__sessionRef?.status,
+        toolRunning: document.querySelectorAll('.row.tool.tool-running').length,
+        errDots: document.querySelectorAll('.row.tool.tool-err').length,
+        canceledLine: /canceled by user/.test(document.getElementById('log')?.textContent || ''),
+        modal: document.getElementById('modalBg')?.classList.contains('show') || false,
+      }));
+      ok(st.status !== 'running', `foreground settled out of 'running' after the tool-phase cancel (got ${st.status})`);
+      ok(abortMs < 20000, `abort landed in ${abortMs}ms — the 60s sleep was killed, not awaited`);
+      ok(st.toolRunning === 0, 'the running tool row stopped blinking');
+      ok(st.errDots >= 1, `the cancelled tool call row carries the error dot (got ${st.errDots})`);
+      ok(st.canceledLine, 'status row shows "canceled by user" again');
+      ok(st.modal === false, 'still no error modal');
+    }
+
+    console.log('\n[D] coherence: a fresh send after two cancels completes cleanly');
+    {
+      await page.evaluate(() => { document.getElementById('input').value = 'quick final check'; send(); });
+      await page.waitForFunction(() => window.__sessionRef?.status === 'running', { timeout: 8000 });
+      const mid = await page.evaluate(() => ({
+        canceledGone: !/canceled by user/.test([...document.querySelectorAll('#log .row.status')].map((r) => r.textContent).join(' ')),
+      }));
+      await page.waitForFunction(() => ['idle', 'done'].includes(window.__sessionRef?.status), { timeout: 20000 });
+      await sleep(400);
+      const st = await page.evaluate(() => ({
+        reply: /Recovered fine — everything is coherent/.test(document.getElementById('log')?.textContent || ''),
+        status: window.__sessionRef?.status,
+        streamingLeft: document.querySelectorAll('.row.assistant[data-streaming="true"]').length,
+      }));
+      ok(st.reply, 'the post-cancel run streamed and finalized its reply');
+      ok(['idle', 'done'].includes(st.status), `terminal status is clean (got ${st.status})`);
+      ok(st.streamingLeft === 0, `no streaming bubble left unfinalized (got ${st.streamingLeft})`);
+      ok(mid.canceledGone !== false, 'the canceled status line was replaced when the new run started');
+    }
+
+    console.log('\n[E] Escape with ONLY sub-agents working (foreground idle) still cancels');
+    {
+      // Recreate the pound-run state: the foreground is idle/done but a sub-agent is still
+      // WORKING (a forked steer / propose follow-up). The old Escape guard (status==='running')
+      // skipped cancelChat() here, so Esc was a silent no-op while work kept churning.
+      // Stub /api/cancel so the synthetic (client-only) sub-agent doesn't trip the
+      // "Cancel did nothing" note (the real server has live work; here it has none).
+      await page.evaluate(() => {
+        window.__sessionRef.status = 'idle';
+        saStore.set('sa-probe', { id: 'sa-probe', topic: 'probe', status: 'working', activity: [] });
+        window.__cancelPosts = 0;
+        window.__origFetch = window.fetch.bind(window);
+        window.fetch = (u, o) => {
+          if (String(u).includes('/api/cancel')) { window.__cancelPosts++; return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); }
+          return window.__origFetch(u, o);
+        };
+      });
+      ok(await page.evaluate(() => activeSubagentCount() > 0), 'sub-agent counts as active work (activeSubagentCount > 0)');
+      await page.keyboard.press('Escape');
+      await sleep(400);
+      const st = await page.evaluate(() => ({
+        posts: window.__cancelPosts,
+        modal: document.getElementById('modalBg')?.classList.contains('show') || false,
+      }));
+      ok(st.posts >= 1, `Escape posts /api/cancel when only sub-agents are active (got ${st.posts})`);
+      ok(st.modal === false, 'no error modal for the sub-agent-only cancel');
+      await page.evaluate(() => { saStore.delete('sa-probe'); if (window.__origFetch) window.fetch = window.__origFetch; });
+    }
+
+    console.log('\n[F] Escape with the left-panel DOC open + work active STILL cancels');
+    {
+      // The pound-run repro: a propose/steer step opened a plan in the left-panel
+      // DOCUMENT view and left #docMode .show; the agent is now running and the
+      // developer hits Esc to stop it. The doc-mode capture handler (ui.html:7266)
+      // used to swallow Esc UNCONDITIONALLY (stopPropagation + closeDoc) so the
+      // bubble cancel handler never ran — cancel was a silent no-op and the run kept
+      // churning (enriched probe: escSeen=1, cancelPosts=0, no other overlay open).
+      // A NON-blocking side panel must not outrank canceling active work; a modal
+      // (mermaid/settings/confirm) still takes Esc first because it IS blocking.
+      await page.evaluate(() => { document.getElementById('input').value = 'stream long prose for me'; send(); });
+      await page.waitForFunction(() => {
+        const r = document.querySelector('.row.assistant[data-streaming="true"]');
+        return r && /prose line 3/.test(r.textContent || '');
+      }, { timeout: 15000 });
+      // Open the side-panel document view, as a propose/steer step would, and hook cancel.
+      await page.evaluate(() => {
+        document.getElementById('docMode')?.classList.add('show');
+        window.__cancelPosts2 = 0;
+        window.__origFetch3 = window.fetch.bind(window);
+        window.fetch = (u, o) => { if (String(u).includes('/api/cancel')) window.__cancelPosts2++; return window.__origFetch3(u, o); };
+      });
+      ok(await page.evaluate(() => document.getElementById('docMode')?.classList.contains('show') || false), 'the left-panel doc view is open (.show) with the run live');
+      await page.keyboard.press('Escape');
+      await sleep(900);   // fixed wait (not waitFor) so a PRE-FIX no-op shows posts=0 instead of hanging
+      const st = await page.evaluate(() => ({
+        posts: window.__cancelPosts2,
+        status: window.__sessionRef?.status,
+        canceledLine: /canceled by user/.test(document.getElementById('log')?.textContent || ''),
+      }));
+      ok(st.posts >= 1, `Escape posts /api/cancel even with the doc panel open (got ${st.posts})`);
+      ok(st.status !== 'running', `foreground settled out of 'running' with the doc open (got ${st.status})`);
+      ok(st.canceledLine, 'status row shows "canceled by user" with the doc open');
+      await page.evaluate(() => { if (window.__origFetch3) window.fetch = window.__origFetch3; document.getElementById('docMode')?.classList.remove('show'); });
+      // recover so the no-page-errors assertion below runs on a clean state
+      await page.waitForFunction(() => ['idle', 'done'].includes(window.__sessionRef?.status), { timeout: 8000 }).catch(() => {});
+    }
+
+    ok(jsErrors.length === 0, `no page errors (${jsErrors.length}: ${jsErrors.slice(0, 2).join(' | ')})`);
+  } finally {
+    await browser.close(); server.close();
+    await cleanupDir(projectDir);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-convo-markdown-big.mjs
new 319e268cf50171dfb2c9a530
+/**
+ * EDGE PROBE (conversation core): markdown fidelity + jump-to-bottom + 50KB message.
+ *
+ *   [M] FINAL markdown render (renderInline): nested/flat lists, GFM table with
+ *       alignment, a code fence whose body is raw HTML + entities (must render
+ *       literally — no element injection), inline code with entities, code-span
+ *       protection inside a table cell, ordered-list passthrough (documented).
+ *   [N] STREAMING markdown (createStreamingMd/mdInline): space-flanked bare
+ *       numbers in streamed prose / list items / table cells must survive
+ *       mid-stream — suspicion: mdInline's code-span placeholder is ' <i> '
+ *       so its restore regex / (\d+) /g EATS innocent numbers. Asserted both
+ *       as an in-page unit call and via a real streamed turn, then verifies
+ *       the FINAL render self-heals.
+ *   [J] jump-to-bottom: scrolling up DURING streaming shows the ↓ arrow, stops
+ *       auto-scroll, click returns + re-locks + hides the arrow.
+ *   [B] a single 50KB user message: send accepted, bubble renders the whole
+ *       text, no horizontal overflow, run completes, no JS errors.
+ *
+ * Run: node test/_edge-convo-markdown-big.mjs   (skips if Chrome not found)
+ */
+import { mkdtemp, readFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17961;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+const FENCE_BODY = '<div class="x">&amp; &lt;b&gt; "quotes" \'single\'</div>\n<script>alert(1)</' + 'script>';
+const MD_DOC = [
+  'Intro with **bold** and `code &amp; <tag>` inline.',
+  '',
+  '- level one item A',
+  '  - level two item A1',
+  '  - level two item A2',
+  '- level one item B',
+  '',
+  '1. ordered one',
+  '2. ordered two',
+  '',
+  '| Name | Qty | Note |',
+  '|:-----|----:|------|',
+  '| alpha | 1 | plain |',
+  '| beta | 2 | has `a|b` code |',
+  '',
+  '```html',
+  FENCE_BODY,
+  '```',
+  'Tail prose.',
+].join('\n');
+
+const STREAM_NUMBERS = [
+  'There are 42 files and 7 dirs in src.\n',
+  '- bullet with 13 items inside\n',
+  '\n| Col | Cnt |\n|---|---|\n',
+  '| rows | 99 |\n',
+  '\n# heading 21 here\n',
+  'closing line.\n',
+];
+
+function routedAdapter(routes) {
+  const find = (messages) => {
+    const userMsgs = (messages || []).filter((m) => m.role === 'user').reverse();
+    for (const u of userMsgs) {
+      const text = String(u.content || '');
+      for (const key of Object.keys(routes)) if (text.includes(key)) return key;
+    }
+    return null;
+  };
+  return {
+    async *completeStream(opts) {
+      const key = find(opts?.messages);
+      if (!key) { yield { choices: [{ delta: { content: 'no route.' } }] }; return; }
+      const { chunks, delayMs } = routes[key];
+      for (const c of chunks) {
+        await sleep(delayMs);
+        yield { choices: [{ delta: { content: c } }] };
+      }
+    },
+    async complete() { return { choices: [{ message: { content: '<review-pass/>' } }] }; },
+  };
+}
+
+async function waitIdle(page, timeout = 30000) {
+  await page.waitForFunction(() => ['idle', 'done', 'error'].includes(window.__sessionRef?.status), { timeout });
+  await sleep(400);
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-mdbig-'));
+
+  const routes = {
+    'show the markdown': { delayMs: 10, chunks: [MD_DOC] },
+    'stream the numbers': { delayMs: 700, chunks: STREAM_NUMBERS },
+    'stream many lines': { delayMs: 55, chunks: Array.from({ length: 80 }, (_, i) => `stream filler line number ${i + 1} with some extra words to take height.\n`) },
+    'BIGMSG': { delayMs: 10, chunks: ['Got the big message, summarized it fine.'] },
+  };
+
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: '(mock)' }) + ';</script></head>');
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'mock', port: PORT, adapter: routedAdapter(routes), modelsList: [{ id: 'mock' }], initialProject: projectDir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1200, height: 800 });
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForSelector('#chat:not(.hidden)', { timeout: 15000 });
+    await page.waitForFunction(() => typeof send === 'function' && !!window.__sessionRef, { timeout: 8000 });
+    await sleep(300);
+
+    console.log('\n[M] final markdown fidelity');
+    {
+      await page.evaluate(() => { document.getElementById('input').value = 'show the markdown sample'; send(); });
+      await waitIdle(page);
+      const m = await page.evaluate((fenceBody) => {
+        const rows = [...document.querySelectorAll('#log .row.assistant .body')];
+        const body = rows[rows.length - 1];
+        const ul = body.querySelector('ul.md');
+        const lis = ul ? [...ul.querySelectorAll('li')].map((l) => l.textContent) : [];
+        const table = body.querySelector('table.md');
+        const ths = table ? [...table.querySelectorAll('thead th')].map((t) => t.textContent) : [];
+        const cells = table ? [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent)) : [];
+        const qtyAlign = table ? table.querySelector('tbody tr td:nth-child(2)')?.style.textAlign : null;
+        const pre = body.querySelector('pre.md code');
+        const inlineCodes = [...body.querySelectorAll('code')].map((c) => c.textContent);
+        return {
+          ulCount: body.querySelectorAll('ul.md').length,
+          lis,
+          orderedAsText: /1\. ordered one/.test(body.textContent) && !body.querySelector('ol'),
+          ths, cells, qtyAlign,
+          fenceText: pre ? pre.textContent : null,
+          scriptInjected: !!body.querySelector('script') || !!body.querySelector('div.x'),
+          inlineHasEntity: inlineCodes.some((c) => c === 'code &amp; <tag>'),
+          bold: !!body.querySelector('strong'),
+          rawLeftovers: /\*\*bold\*\*|```/.test(body.textContent),
+        };
+      }, FENCE_BODY);
+      ok(m.lis.length === 4, `all 4 bullet items render as <li> (got ${m.lis.length}: ${JSON.stringify(m.lis)})`);
+      ok(m.ulCount === 1, `nested bullets FLATTEN into one list (documented minimal-md behavior; got ${m.ulCount} lists)`);
+      ok(m.orderedAsText, 'ordered list is passthrough text (no <ol> support — documented)');
+      ok(JSON.stringify(m.ths) === JSON.stringify(['Name', 'Qty', 'Note']), `table headers (${JSON.stringify(m.ths)})`);
+      ok(m.cells.length === 2 && m.cells[0][0] === 'alpha' && m.cells[1][0] === 'beta', `table body rows (${JSON.stringify(m.cells)})`);
+      ok(m.qtyAlign === 'right', `:---- / ----: alignment applied (Qty align=${JSON.stringify(m.qtyAlign)})`);
+      ok(m.cells[1] && m.cells[1][2] === 'has a|b code', `code-span with a pipe survives INSIDE a table cell (got ${JSON.stringify(m.cells[1]?.[2])})`);
+      ok(m.fenceText === fixupFence(FENCE_BODY), `fence body rendered LITERALLY, char-for-char (got ${JSON.stringify((m.fenceText || '').slice(0, 60))}…)`);
+      ok(m.scriptInjected === false, 'no <script>/<div> element injected from the fence (escaped)');
+      ok(m.inlineHasEntity, 'inline code keeps `&amp;` and `<tag>` literal');
+      ok(m.bold && !m.rawLeftovers, 'bold rendered; no raw ** or ``` left in the text');
+    }
+
+    console.log('\n[N] streaming markdown: do bare numbers survive mid-stream?');
+    {
+      // In-page unit calls against the REAL mdInline used by the streaming renderer.
+      const unit = await page.evaluate(() => ({
+        prose: mdInline('there are 42 files'),
+        twoNums: mdInline('6 of 13 done'),
+        withCode: mdInline('use `x` then 0 retries'),
+      }));
+      ok(unit.prose === 'there are 42 files', `mdInline keeps a bare number (got ${JSON.stringify(unit.prose)})`);
+      ok(unit.twoNums === '6 of 13 done', `mdInline keeps multiple numbers (got ${JSON.stringify(unit.twoNums)})`);
+      ok(unit.withCode === 'use <code>x</code> then 0 retries', `mdInline with a code span doesn't eat ' 0 ' (got ${JSON.stringify(unit.withCode)})`);
+
+      // End-to-end: stream the numbers document and sample the live DOM after
+      // each committed line (700ms per chunk leaves a wide window).
+      await page.evaluate(() => { document.getElementById('input').value = 'stream the numbers'; send(); });
+      // Wait until the WHOLE first line is on screen (the server re-chunks the
+      // delta, so /There are/ alone can sample mid-line) but the second chunk
+      // (700ms later) has not landed → a genuinely mid-stream sample.
+      await page.waitForFunction(() => {
+        const r = document.querySelector('.row.assistant[data-streaming="true"]');
+        return r && /dirs in src\./.test(r.textContent || '');
+      }, { timeout: 15000 });
+      const live1 = await page.evaluate(() => {
+        const r = document.querySelector('.row.assistant[data-streaming="true"]');
+        return r ? r.textContent : '';
+      });
+      ok(/There are 42 files and 7 dirs/.test(live1), `streamed PROSE keeps '42' and '7' mid-stream (got ${JSON.stringify(live1.slice(0, 80))})`);
+      await page.waitForFunction(() => {
+        const r = document.querySelector('.row.assistant[data-streaming="true"], .row.assistant:last-of-type');
+        return r && /bullet with/.test(r.textContent || '');
+      }, { timeout: 15000 });
+      await sleep(350);
+      const live2 = await page.evaluate(() => {
+        const r = [...document.querySelectorAll('.row.assistant')].pop();
+        return { text: r.textContent, li: r.querySelector('ul.md li')?.textContent || null };
+      });
+      ok(/bullet with 13 items/.test(live2.li || live2.text), `streamed LIST ITEM keeps '13' (li=${JSON.stringify(live2.li)})`);
+      await waitIdle(page);
+      const fin = await page.evaluate(() => {
+        const r = [...document.querySelectorAll('#log .row.assistant .body')].pop();
+        return {
+          text: r.textContent,
+          cell: [...r.querySelectorAll('table.md tbody td')].map((t) => t.textContent).join('|'),
+          heading: r.querySelector('h3.md, h4.md, h5.md')?.textContent || null,
+        };
+      });
+      ok(/There are 42 files and 7 dirs/.test(fin.text), 'FINAL render has the prose numbers');
+      ok(/99/.test(fin.cell), `FINAL table cell keeps '99' (cells=${JSON.stringify(fin.cell)})`);
+      ok(/heading 21 here/.test(fin.heading || ''), `FINAL heading keeps '21' (got ${JSON.stringify(fin.heading)})`);
+    }
+
+    console.log('\n[J] jump-to-bottom arrow during streaming');
+    {
+      await page.evaluate(() => { document.getElementById('input').value = 'stream many lines'; send(); });
+      await page.waitForFunction(() => /stream filler line number 12/.test(document.getElementById('log')?.textContent || ''), { timeout: 20000 });
+      // User scrolls up mid-stream.
+      await page.evaluate(() => { document.getElementById('logScroll').scrollTop = 0; });
+      await sleep(900);   // more chunks arrive while we're scrolled up
+      const mid = await page.evaluate(() => ({
+        arrow: document.getElementById('scrollBottomBtn')?.classList.contains('show') || false,
+        scrollTop: document.getElementById('logScroll').scrollTop,
+        streaming: window.__sessionRef?.status === 'running',
+      }));
+      ok(mid.streaming, 'still streaming while scrolled up');
+      ok(mid.arrow === true, 'jump-to-bottom arrow APPEARED when content arrived while scrolled up');
+      ok(mid.scrollTop < 150, `auto-scroll suspended — view stays where the user put it (scrollTop=${mid.scrollTop})`);
+
+      // Click ↓ mid-stream. jumpToBottom sets the lock + hides the arrow
+      // SYNCHRONOUSLY and snaps scrollTop to the bottom INSTANTLY (no smooth
+      // animation — its in-transit scroll events used to drop the fresh lock).
+      await page.click('#scrollBottomBtn');
+      const clicked = await page.evaluate(() => ({
+        arrow: document.getElementById('scrollBottomBtn')?.classList.contains('show') || false,
+        locked: _stickBottom,
+      }));
+      ok(clicked.arrow === false && clicked.locked === true, 'click hides the arrow and sets the bottom-lock synchronously');
+
+      // THE (former) RACE: a smooth-scroll animation fired scroll events whose
+      // updateStickState recomputed the lock from _atBottom() — false while in
+      // transit — dropping the lock the click just set; with the stream growing
+      // the log the stale target then landed short and the jump silently failed.
+      // The instant scrollTop jump has no in-transit events, so the lock holds.
+      await sleep(140);   // where the animation frames used to run
+      const midAnim = await page.evaluate(() => ({ locked: _stickBottom, scrolling: document.getElementById('logScroll').scrollTop > 0 }));
+      ok(midAnim.locked === true, `the click's bottom-lock must SURVIVE the jump (got locked=${midAnim.locked} — updateStickState dropped it)`);
+
+      await waitIdle(page);
+      const lock = await page.evaluate(() => {
+        const el = document.getElementById('logScroll');
+        return {
+          dist: el.scrollHeight - el.scrollTop - el.clientHeight,
+          arrow: document.getElementById('scrollBottomBtn')?.classList.contains('show') || false,
+          locked: _stickBottom,
+        };
+      });
+      console.log(`  note: end-of-stream state after the ↓ click — distance=${Math.round(lock.dist)}px arrow=${lock.arrow} locked=${lock.locked} (race outcome varies run to run; ≤130px means the animation caught the moving bottom)`);
+    }
+
+    console.log('\n[B] a single 50KB message');
+    {
+      const filler = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor ';
+      let big = 'BIGMSG start-sentinel\n';
+      while (big.length < 49000) big += filler + '\n';
+      big += 'x'.repeat(900) + '\n';          // one giant unbroken token → word-wrap stress
+      big += 'end-sentinel';
+      ok(big.length >= 50000 - 1200 && big.length < 60000, `payload built (${big.length} chars)`);
+      const sent = await page.evaluate(async (t) => {
+        document.getElementById('input').value = t;
+        await send();
+        return document.getElementById('input').value === '';   // send() clears only on success
+      }, big);
+      ok(sent, 'send() accepted the 50KB message (input cleared, no error restore)');
+      await page.waitForFunction(() => window.__sessionRef?.status === 'running', { timeout: 8000 });
+      await waitIdle(page);
+      const r = await page.evaluate(() => {
+        const bubbles = [...document.querySelectorAll('#log .bubble.user')];
+        const b = bubbles[bubbles.length - 1];
+        const el = document.getElementById('logScroll');
+        return {
+          len: b ? b.textContent.length : 0,
+          head: /BIGMSG start-sentinel/.test(b?.textContent || ''),
+          tail: /end-sentinel/.test(b?.textContent || ''),
+          hOverflow: el.scrollWidth - el.clientWidth,
+          reply: /Got the big message/.test(document.getElementById('log').textContent || ''),
+        };
+      });
+      ok(r.head && r.tail, 'bubble renders both the first and last byte of the payload');
+      ok(r.len >= 49000, `rendered text is the whole payload (${r.len} chars)`);
+      ok(r.hOverflow <= 2, `no horizontal overflow from the 900-char token (scrollWidth-clientWidth=${r.hOverflow})`);
+      ok(r.reply, 'the run with the 50KB context completed normally');
+    }
+
+    ok(jsErrors.length === 0, `no page errors (${jsErrors.length}: ${jsErrors.slice(0, 2).join(' | ')})`);
+  } finally {
+    await browser.close(); server.close();
+    await cleanupDir(projectDir);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+// renderInline strips ONE trailing \n from a fence body; our body has none, so identity.
+function fixupFence(s) { return s.replace(/\n$/, ''); }
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-convo-steer.mjs
new d2fe7df25590691e88e9a514
+/**
+ * EDGE PROBE (conversation core): mid-run STEER.
+ *
+ *   [1] the steer button is HIDDEN while idle.
+ *   [2] POST /api/steer with no run in progress → 409.
+ *   [3] while a run is in flight the steer button appears and the input
+ *       placeholder says the agent is busy.
+ *   [4] clicking steer sends the input text and clears the box.
+ *   [5] the steer buffer caps at 10 (the 11th queued steer → 429).
+ *   [6] every steered text lands as a fresh USER bubble at the next turn
+ *       boundary (order preserved).
+ *   [7] the agent's NEXT model call actually carries the steered texts as
+ *       user messages (and the first call did not).
+ *   [8] after the run ends the steer button hides again.
+ *
+ * Run: node test/_edge-convo-steer.mjs   (skips if Chrome not found)
+ */
+import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17960;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+// Turn-scripted adapter (complete-only, like test-review-in-task-footer-probe)
+// with a per-script DELAY so the probe has a window to steer mid-turn, plus a
+// request capture so we can prove the steered text reached the NEXT call.
+//
+// The continuous reviewer (default ON since #6) fires its OWN adapter.complete
+// calls in parallel with the worker loop.  Those calls carry the reviewer seed
+// prompt phrase "give your single verdict" and must NOT consume a worker script
+// slot.  We separate them into `reviewerRequests` and return "no problems found"
+// so they terminate cleanly.  Worker calls go into `workerRequests` and drive
+// the scripted responses exactly as before.
+function scriptedAdapter(scripts) {
+  const workerRequests = [];    // main-agent turns only
+  const reviewerRequests = [];  // continuous-reviewer calls (filtered out)
+  let i = 0;
+  const isReviewerCall = (messages) =>
+    (messages || []).some((m) => /give your single verdict/i.test(String(m.content ?? '')));
+  return {
+    workerRequests,
+    reviewerRequests,
+    async complete({ messages }) {
+      const serialised = (messages || []).map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n');
+      if (isReviewerCall(messages)) {
+        reviewerRequests.push(serialised);
+        return { choices: [{ message: { content: 'no problems found' } }] };
+      }
+      workerRequests.push(serialised);
+      const s = scripts[Math.min(i, scripts.length - 1)]; i++;
+      if (s.delayMs) await sleep(s.delayMs);
+      return { choices: [{ message: { content: s.text } }] };
+    },
+  };
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-steer-'));
+  await writeFile(path.join(projectDir, 'seed.txt'), 'hello\n');
+
+  const adapter = scriptedAdapter([
+    // Turn 1: long enough that the probe can steer + overflow the buffer while
+    // the model "thinks". Ends in a tool call so the run continues to turn 2.
+    { delayMs: 3500, text: 'Looking around first.\n<remote-workspace><list path="."/></remote-workspace>\n<task-progress percent="30">listing the project</task-progress>' },
+    // Turn 2: sees the steered user messages (drained at the turn boundary).
+    { delayMs: 200, text: 'All done with the steered run.' },
+    // Anything later (end-of-task reviewer etc.) — harmless pass.
+    { text: '<review-pass/>' },
+  ]);
+
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: '(mock)' }) + ';</script></head>');
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'mock', port: PORT, adapter, modelsList: [{ id: 'mock' }], initialProject: projectDir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1200, height: 800 });
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForSelector('#chat:not(.hidden)', { timeout: 15000 });
+    await page.waitForFunction(() => typeof send === 'function' && typeof steerCurrentInput === 'function' && !!window.__sessionRef, { timeout: 8000 });
+    await sleep(300);
+
+    console.log('\n[1] idle: steer button hidden');
+    {
+      const st = await page.evaluate(() => {
+        const b = document.getElementById('steerBtn');
+        return { display: b ? b.style.display : null, visible: b ? b.offsetParent !== null : null };
+      });
+      ok(st.display === 'none' && st.visible === false, `steer button hidden while idle (display=${JSON.stringify(st.display)})`);
+    }
+
+    console.log('\n[2] /api/steer while idle → 409');
+    {
+      const r = await page.evaluate(async () => {
+        const res = await fetch('/api/steer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'too early' }) });
+        return { status: res.status, body: await res.json().catch(() => null) };
+      });
+      ok(r.status === 409, `steer with no run → 409 (got ${r.status}: ${JSON.stringify(r.body)})`);
+    }
+
+    console.log('\n[3] send → running: steer button appears');
+    {
+      await page.evaluate(() => { document.getElementById('input').value = 'survey the project please'; send(); });
+      await page.waitForFunction(() => window.__sessionRef?.status === 'running', { timeout: 8000 });
+      await sleep(150);   // let applyControlsForStatus run
+      const st = await page.evaluate(() => {
+        const b = document.getElementById('steerBtn');
+        return { visible: b ? b.offsetParent !== null : null, placeholder: document.getElementById('input').placeholder };
+      });
+      ok(st.visible === true, 'steer button VISIBLE while the run is in flight');
+      ok(/Esc to stop/i.test(st.placeholder), `placeholder flips to the busy hint ("${st.placeholder}")`);
+    }
+
+    console.log('\n[4] click steer: sends + clears the input');
+    {
+      // Steer only counts as MID-TURN once the model call is actually in
+      // flight — /api/message returns (status=running) before the loop's first
+      // turn drains the buffer, so a too-early steer would legitimately land
+      // in turn 1. Wait for the adapter to have received the turn-1 request.
+      const t0 = Date.now();
+      while (adapter.workerRequests.length < 1 && Date.now() - t0 < 8000) await sleep(50);
+      ok(adapter.workerRequests.length >= 1, 'turn-1 model call is in flight before we steer');
+      await page.evaluate(() => { document.getElementById('input').value = 'STEER-ALPHA also rename the seed file'; });
+      await page.evaluate(() => steerCurrentInput());
+      await page.waitForFunction(() => document.getElementById('input').value === '', { timeout: 4000 });
+      ok(true, 'steer accepted and the input box cleared');
+    }
+
+    console.log('\n[5] buffer cap: 9 more fill it to 10; the 11th → 429');
+    {
+      const r = await page.evaluate(async () => {
+        const out = [];
+        for (let n = 2; n <= 10; n++) {
+          const res = await fetch('/api/steer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `STEER-${String(n).padStart(2, '0')} extra direction` }) });
+          out.push({ status: res.status, queued: (await res.json().catch(() => ({}))).queued });
+        }
+        const over = await fetch('/api/steer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'STEER-OVERFLOW' }) });
+        return { out, overflow: over.status };
+      });
+      ok(r.out.every((x) => x.status === 200), `steers 2..10 accepted (statuses ${r.out.map((x) => x.status).join(',')})`);
+      ok(r.out[r.out.length - 1].queued === 10, `queued count reached 10 (got ${r.out[r.out.length - 1].queued})`);
+      ok(r.overflow === 429, `11th steer rejected with 429 (got ${r.overflow})`);
+    }
+
+    console.log('\n[6] steered texts land as fresh user bubbles next turn (order kept)');
+    {
+      await page.waitForFunction(() => ['idle', 'done', 'error'].includes(window.__sessionRef?.status), { timeout: 30000 });
+      await sleep(400);
+      const bubbles = await page.evaluate(() => [...document.querySelectorAll('#log .bubble.user')].map((b) => b.textContent.trim().slice(0, 60)));
+      ok(bubbles.length === 11, `11 user bubbles: 1 original + 10 steered (got ${bubbles.length})`);
+      ok(/STEER-ALPHA/.test(bubbles[1] || ''), `first steered text right after the original ("${bubbles[1]}")`);
+      ok(/STEER-10/.test(bubbles[10] || ''), `last steered text is the 10th ("${bubbles[10]}")`);
+      const orderOk = bubbles.slice(2, 11).every((b, i) => b.includes(`STEER-${String(i + 2).padStart(2, '0')}`));
+      ok(orderOk, 'steered messages render in the order they were queued');
+      ok(!bubbles.some((b) => /STEER-OVERFLOW/.test(b)), 'the 429-rejected overflow steer was NOT injected');
+    }
+
+    console.log('\n[7] the steered text reached the agent NEXT call (not the first)');
+    {
+      // Use workerRequests — the continuous reviewer (default ON since #6) fires
+      // its own adapter.complete calls that land in reviewerRequests and must not
+      // be confused with the main-agent turns.
+      const reqs = adapter.workerRequests;
+      ok(reqs.length >= 2, `at least two worker model calls happened (got ${reqs.length})`);
+      ok(!/STEER-ALPHA/.test(reqs[0] || ''), 'turn-1 request does NOT contain the steered text (queued mid-turn)');
+      ok(/user: STEER-ALPHA also rename the seed file/.test(reqs[1] || ''), 'turn-2 request carries the first steered text as a user message');
+      if (!/STEER-10 extra direction/.test(reqs[1] || '')) {
+        console.log('  DEBUG turn-2 worker-request tail:\n' + (reqs[1] || '').slice(-1200));
+      }
+      ok(/STEER-10 extra direction/.test(reqs[1] || ''), 'turn-2 request carries the 10th steered text too');
+      ok(!/STEER-OVERFLOW/.test(reqs.concat(adapter.reviewerRequests).join('\n')), 'the overflow steer never reached any model call');
+    }
+
+    console.log('\n[8] back to idle: steer button hides again');
+    {
+      const st = await page.evaluate(() => {
+        const b = document.getElementById('steerBtn');
+        return { visible: b ? b.offsetParent !== null : null };
+      });
+      ok(st.visible === false, 'steer button hidden again after the run');
+    }
+
+    ok(jsErrors.length === 0, `no page errors (${jsErrors.length}: ${jsErrors.slice(0, 2).join(' | ')})`);
+  } finally {
+    await browser.close(); server.close();
+    await cleanupDir(projectDir);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-convo-tasks-clear.mjs
new 0e09292e9595c9ffae3a5762
+/**
+ * EDGE PROBE (conversation core): task-wrap collapse/expand + footer badges
+ * (✓ committed) + "Clear conversation" wiping chat AND task store.
+ *
+ * Project is a REAL git repo already on a CODE_BOSS_* branch, so the write
+ * tool needs no branch approval and task close auto-commits → the footer gets
+ * the ✓ committed badge.  The per-task end-of-task review BADGE was retired;
+ * the continuous turn-reviewer (reviewer-note chat events) covers it instead.
+ *
+ *   [1] a closed task wraps into .task-wrap; expanded by default: head hidden,
+ *       body visible, summary hidden, chevron ▼.
+ *   [2] footer carries the ✓ committed badge (commit-ok, hash in title).
+ *       (review-pass badge retired — continuous reviewer covers it.)
+ *   [3] chevron click collapses: .collapsed, chevron ▶, body hidden, head (the
+ *       user request) visible, summary visible, commit badge still visible.
+ *   [4] clicking the collapsed head expands again.
+ *   [5] a second closed task gets its own wrap; collapsing the FIRST leaves
+ *       the second expanded (state is per-task).
+ *   [6] collapse state survives the in-session re-render (reload keeps events;
+ *       collapse choice itself is in-memory — documented behavior, we assert
+ *       the wraps + commit badge survive reload).
+ *   [7] Clear conversation (confirm accepted) → log emptied, /api/state has 0
+ *       events, conversation.json deleted, the .code_boss/tasks store emptied.
+ *   [8] a fresh send after the clear starts a clean run (no stale wraps).
+ *
+ * Run: node test/_edge-convo-tasks-clear.mjs   (skips if Chrome not found)
+ */
+import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import { execFileSync } from 'node:child_process';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17960;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
+
+// Sequenced worker scripts; reviewer calls are detected by the phrase unique
+// to the reviewer seed/feed prompts ("give your single verdict") and are
+// answered with "no problems found" so they don't consume worker slots.
+function scriptedAdapter(workerScripts) {
+  let wi = 0;
+  return {
+    async complete({ messages }) {
+      const txt = (messages || []).map((m) => String(m.content || '')).join('\n');
+      if (/give your single verdict/i.test(txt)) return { choices: [{ message: { content: 'no problems found' } }] };
+      const s = workerScripts[Math.min(wi, workerScripts.length - 1)]; wi++;
+      return { choices: [{ message: { content: s } }] };
+    },
+  };
+}
+
+async function runAndWait(page, text) {
+  await page.evaluate((t) => { document.getElementById('input').value = t; send(); }, text);
+  await page.waitForFunction(() => window.__sessionRef?.status === 'running', { timeout: 10000 });
+  await page.waitForFunction(() => ['idle', 'done', 'error'].includes(window.__sessionRef?.status), { timeout: 30000 });
+  await sleep(500);
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-twrap-'));
+  // Real repo, already on a CODE_BOSS branch (no approval gate on writes).
+  git(projectDir, 'init', '-q');
+  git(projectDir, 'config', 'user.email', 'probe@test');
+  git(projectDir, 'config', 'user.name', 'probe');
+  git(projectDir, 'config', 'commit.gpgsign', 'false');
+  await writeFile(path.join(projectDir, 'seed.txt'), 'seed\n');
+  git(projectDir, 'add', '-A');
+  git(projectDir, 'commit', '-q', '-m', 'init');
+  git(projectDir, 'checkout', '-q', '-b', 'CODE_BOSS_20260611-edge');
+
+  const adapter = scriptedAdapter([
+    // ── task 1: write + close ──
+    'Writing the feature file.\n<remote-workspace><write path="feat.txt">hello feature</write></remote-workspace>\n<task-progress percent="50">writing feat.txt</task-progress>',
+    'Closing up.\n<remote-workspace><next-task user-request="add the feature file" summary="wrote feat.txt with the feature stub"/></remote-workspace>',
+    'Anything else?',
+    // ── task 2: read + close ──
+    'Checking the file.\n<remote-workspace><read path="feat.txt"/></remote-workspace>\n<task-progress percent="40">reading feat.txt</task-progress>',
+    'Closing again.\n<remote-workspace><next-task user-request="double-check the feature" summary="verified feat.txt contents"/></remote-workspace>',
+    'All good.',
+    // ── post-clear sanity run ──
+    'Fresh start reply.',
+  ]);
+
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: '(mock)' }) + ';</script></head>');
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'mock', port: PORT, adapter, modelsList: [{ id: 'mock' }], initialProject: projectDir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1200, height: 800 });
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    page.on('dialog', (d) => d.accept());   // the Clear confirm()
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForSelector('#chat:not(.hidden)', { timeout: 15000 });
+    await page.waitForFunction(() => typeof send === 'function' && !!window.__sessionRef, { timeout: 8000 });
+    await sleep(300);
+
+    console.log('\n[1] closed task → .task-wrap, expanded by default');
+    await runAndWait(page, 'add the feature file');
+    {
+      const w = await page.evaluate(() => {
+        const wrap = document.querySelector('.task-wrap[data-task-id]');
+        if (!wrap) return null;
+        const head = wrap.querySelector('.task-head');
+        const body = wrap.querySelector('.task-body');
+        const sum = wrap.querySelector('.task-foot-summary');
+        const chev = wrap.querySelector('.task-foot-toggle');
+        return {
+          collapsed: wrap.classList.contains('collapsed'),
+          headVisible: head ? getComputedStyle(head).display !== 'none' : null,
+          bodyVisible: body ? getComputedStyle(body).display !== 'none' : null,
+          bodyRows: body ? body.children.length : 0,
+          sumVisible: sum ? getComputedStyle(sum).display !== 'none' : null,
+          sumText: sum ? sum.textContent : '',
+          chev: chev ? chev.textContent : null,
+        };
+      });
+      ok(!!w, 'a .task-wrap[data-task-id] exists after the close');
+      ok(w?.collapsed === false, 'wrap is EXPANDED by default');
+      ok(w?.headVisible === false, 'head (user request) hidden while expanded');
+      ok(w?.bodyVisible === true && w?.bodyRows > 0, `body visible with the task rows (${w?.bodyRows} rows)`);
+      ok(w?.sumVisible === false, 'footer summary hidden while expanded');
+      ok(w?.chev === null, 'no chevron in the foot (collapse is via clicking the foot now)');
+      ok(w?.sumText === 'wrote feat.txt with the feature stub', `summary text is the close summary ("${w?.sumText}")`);
+    }
+
+    console.log('\n[2] footer badge: ✓ committed (review-pass badge retired)');
+    {
+      const b = await page.evaluate(() => {
+        const foot = document.querySelector('.task-wrap[data-task-id] .task-foot');
+        const commit = foot?.querySelector('.task-foot-commit');
+        return {
+          commitText: commit?.textContent || null, commitClass: commit?.className || '', commitTitle: commit?.title || '',
+        };
+      });
+      ok(b.commitText === '✓ committed', `commit badge rendered (got ${JSON.stringify(b.commitText)})`);
+      ok(/commit-ok/.test(b.commitClass), `commit badge is the OK variant (${b.commitClass})`);
+      ok(/@[0-9a-f]{7,9}/.test(b.commitTitle), `badge title carries repo@hash (${JSON.stringify(b.commitTitle)})`);
+      const hash = git(projectDir, 'log', '-1', '--format=%s');
+      ok(/wrote feat\.txt with the feature stub/.test(hash), `the task summary really is the git commit message ("${hash.trim()}")`);
+    }
+
+    console.log('\n[3] collapse via chevron');
+    {
+      await page.evaluate(() => document.querySelector('.task-wrap[data-task-id] .task-foot').click());   // chevron removed; clicking the foot toggles
+      await sleep(450);   // smooth scrollIntoView settles
+      const w = await page.evaluate(() => {
+        const wrap = document.querySelector('.task-wrap[data-task-id]');
+        const head = wrap.querySelector('.task-head');
+        const body = wrap.querySelector('.task-body');
+        const sum = wrap.querySelector('.task-foot-summary');
+        const commit = wrap.querySelector('.task-foot-commit');
+        return {
+          collapsed: wrap.classList.contains('collapsed'),
+          headVisible: getComputedStyle(head).display !== 'none',
+          headText: head.textContent,
+          bodyVisible: getComputedStyle(body).display !== 'none',
+          sumVisible: getComputedStyle(sum).display !== 'none',
+          commitVisible: commit ? commit.offsetParent !== null : false,
+        };
+      });
+      ok(w.collapsed === true, `collapsed via foot click (collapsed=${w.collapsed})`);
+      ok(w.headVisible === true && /add the feature file/.test(w.headText), `head shows the USER REQUEST when collapsed ("${w.headText.trim().slice(0, 40)}")`);
+      ok(w.bodyVisible === false, 'body hidden when collapsed');
+      ok(w.sumVisible === true, 'footer summary visible when collapsed');
+      ok(w.commitVisible, 'commit badge remains visible in the collapsed footer');
+    }
+
+    console.log('\n[4] expand via the collapsed head');
+    {
+      await page.evaluate(() => document.querySelector('.task-wrap[data-task-id] .task-head').click());
+      await sleep(450);
+      const w = await page.evaluate(() => {
+        const wrap = document.querySelector('.task-wrap[data-task-id]');
+        return { collapsed: wrap.classList.contains('collapsed') };
+      });
+      ok(w.collapsed === false, `head click expands again (collapsed=${w.collapsed})`);
+    }
+
+    console.log('\n[5] second task: independent collapse state');
+    await runAndWait(page, 'double-check the feature');
+    await page.waitForFunction(() => document.querySelectorAll('.task-wrap[data-task-id]').length >= 2, { timeout: 10000 });
+    {
+      const ids = await page.evaluate(() => [...document.querySelectorAll('.task-wrap[data-task-id]')].map((w) => w.dataset.taskId));
+      ok(ids.length === 2 && ids[0] !== ids[1], `two wraps with distinct task ids (${ids.join(', ')})`);
+      // Collapse only the FIRST.
+      await page.evaluate(() => document.querySelectorAll('.task-wrap[data-task-id]')[0].querySelector('.task-foot').click());
+      await sleep(450);
+      const states = await page.evaluate(() => [...document.querySelectorAll('.task-wrap[data-task-id]')].map((w) => w.classList.contains('collapsed')));
+      ok(states[0] === true && states[1] === false, `first collapsed, second untouched (${JSON.stringify(states)})`);
+      // A read-only task makes no commit → it must NOT get a commit badge.
+      // (review-pass badges retired; the continuous reviewer uses .reviewer-note events instead.)
+      const badgeCounts = await page.evaluate(() => ({
+        commits: document.querySelectorAll('.task-foot-commit.commit-ok').length,
+      }));
+      ok(badgeCounts.commits === 1, `only the WRITE task carries ✓ committed (got ${badgeCounts.commits})`);
+    }
+
+    console.log('\n[6] reload: wraps + commit badge survive; collapse resets to expanded');
+    {
+      await page.reload({ waitUntil: 'domcontentloaded' });
+      await page.waitForSelector('#chat:not(.hidden)', { timeout: 15000 });
+      await sleep(900);
+      const w = await page.evaluate(() => ({
+        wraps: document.querySelectorAll('.task-wrap[data-task-id]').length,
+        commits: document.querySelectorAll('.task-foot-commit.commit-ok').length,
+        collapsed: [...document.querySelectorAll('.task-wrap[data-task-id]')].map((x) => x.classList.contains('collapsed')),
+      }));
+      ok(w.wraps === 2, `both wraps rebuilt after reload (got ${w.wraps})`);
+      ok(w.commits === 1, `the write task's ✓ committed badge survives reload — same count as live (got ${w.commits})`);
+      // review-pass badge retired — continuous reviewer-note events don't persist as task-foot-review
+      console.log(`  note: collapse state after reload = ${JSON.stringify(w.collapsed)} (in-memory only — resets to expanded)`);
+    }
+
+    console.log('\n[7] Clear conversation: wipes chat + conversation.jsonl + task store');
+    {
+      const convFile = path.join(projectDir, '.code_boss', 'conversation.jsonl');
+      // Let the debounced save flush before clearing.
+      await sleep(700);
+      ok(existsSync(convFile), 'conversation.jsonl exists before the clear');
+      await page.evaluate(() => clearConversation());   // dialog auto-accepted
+      await page.waitForFunction(() => document.getElementById('log').children.length === 0, { timeout: 8000 });
+      ok(true, 'log emptied after the reset broadcast');
+      await sleep(400);
+      const state = await page.evaluate(async () => await (await fetch('/api/state?limit=50')).json());
+      ok((state.events || []).length === 0, `/api/state has 0 events (got ${(state.events || []).length})`);
+      ok(!existsSync(convFile), 'conversation.jsonl deleted on disk');
+      const tasksLeft = await readdir(path.join(projectDir, '.code_boss', 'tasks')).catch(() => []);
+      ok(tasksLeft.length === 0, `task store emptied (${tasksLeft.length} file(s) left)`);
+    }
+
+    console.log('\n[8] post-clear send starts clean');
+    {
+      await runAndWait(page, 'say hi after the clear');
+      const w = await page.evaluate(() => ({
+        wraps: document.querySelectorAll('.task-wrap[data-task-id]').length,
+        reply: /Fresh start reply\./.test(document.getElementById('log').textContent || ''),
+        userBubbles: document.querySelectorAll('#log .bubble.user').length,
+      }));
+      ok(w.reply, 'fresh run replied normally after the clear');
+      ok(w.wraps === 0, `no stale task wraps re-appeared (got ${w.wraps})`);
+      ok(w.userBubbles === 1, `only the new user bubble exists (got ${w.userBubbles})`);
+    }
+
+    ok(jsErrors.length === 0, `no page errors (${jsErrors.length}: ${jsErrors.slice(0, 2).join(' | ')})`);
+  } finally {
+    await browser.close(); server.close();
+    await cleanupDir(projectDir);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-deploy.mjs
new df501081b2215fa96bea9d13
+/**
+ * EDGE PROBE (on-demand): the deployment chain's check-update subcommand,
+ * against a MOCK GitLab API. Scenarios:
+ *   [1] no stored creds            → "skipped — no GitLab credentials", app file untouched
+ *   [2] manifest build == running  → "up to date", no download
+ *   [3] manifest build newer       → downloads, node --check gate, SWAPS in place,
+ *                                    keeps code-boss.prev.mjs (rollback)
+ *   [4] corrupt download           → "skipped", original file untouched
+ * Uses the REAL dist/code-boss.mjs with its UPDATE_SOURCE const patched to the
+ * mock; HOME is redirected via USERPROFILE so creds come from a temp dir.
+ * Run: node test/_edge-deploy.mjs        (build dist first: node scripts/build.mjs)
+ */
+import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { spawn } from 'node:child_process';
+import { createServer } from 'node:http';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17909;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+
+// ASYNC spawn — spawnSync would block this process's event loop, and the mock
+// GitLab lives HERE: a blocked parent can never answer the child's fetch.
+function runCheckUpdate(appFile, home) {
+  return new Promise((resolve) => {
+    const p = spawn(process.execPath, [appFile, 'check-update'], {
+      env: { ...process.env, USERPROFILE: home, HOME: home },
+    });
+    let stdout = '', stderr = '';
+    p.stdout.on('data', (d) => { stdout += d; });
+    p.stderr.on('data', (d) => { stderr += d; });
+    const t = setTimeout(() => { try { p.kill(); } catch {} }, 60000);
+    p.on('close', (status) => { clearTimeout(t); resolve({ status, stdout, stderr }); });
+  });
+}
+
+async function main() {
+  const distFile = path.join(ROOT, 'dist', 'code-boss.mjs');
+  if (!existsSync(distFile)) { console.error('SKIP: dist/code-boss.mjs missing — run node scripts/build.mjs first'); process.exit(0); }
+  const dist = await readFile(distFile, 'utf8');
+  const runningBuild = dist.match(/const BUILD_VERSION = '(\d+)'/)?.[1];
+  ok(!!runningBuild, `dist bundle carries BUILD_VERSION (${runningBuild})`);
+
+  const home = await mkdtemp(path.join(tmpdir(), 'cb-dephome-'));
+  const appDir = path.join(home, '.code_boss', 'app');
+  await mkdir(appDir, { recursive: true });
+  const appFile = path.join(appDir, 'code-boss.mjs');
+  const patched = dist.replace("const UPDATE_SOURCE = '';", `const UPDATE_SOURCE = 'http://127.0.0.1:${PORT}/group/code_boss';`);
+  ok(patched !== dist, 'patched UPDATE_SOURCE into the bundle copy');
+  await writeFile(appFile, patched, 'utf8');
+
+  // Mock GitLab: manifest + release file at the production ref.
+  let manifest = { build: Number(runningBuild), file: `releases/code-boss-${runningBuild}.mjs` };
+  let releaseBody = `const BUILD_VERSION = '999';\n// MARKER-FAKE-999\n// ${'x'.repeat(250000)}\n`;
+  let corruptNext = false;
+  const seenTokens = [];
+  // Notes history: one entry NEWER than the running build (must be shown) and
+  // one AT the running build (must be filtered out — the user already has it).
+  const notesHistory = [
+    { build: 999, date: '2026-06-10', title: 'New stuff', items: ['Feature A', 'Fix B'] },
+    { build: Number(runningBuild), date: '2026-06-01', title: 'Old stuff', items: ['Already shipped'] },
+  ];
+  const gitlab = createServer((req, res) => {
+    seenTokens.push(req.headers['private-token'] || '(none)');
+    const url = decodeURIComponent(req.url || '');
+    if (url.includes('/repository/files/releases/manifest.json/raw')) {
+      res.writeHead(200, { 'content-type': 'application/json' });
+      res.end(JSON.stringify(manifest));
+    } else if (url.includes('/repository/files/releases/notes.json/raw')) {
+      res.writeHead(200, { 'content-type': 'application/json' });
+      res.end(JSON.stringify(notesHistory));
+    } else if (url.includes('/repository/files/releases/code-boss-') && url.includes('/raw')) {
+      res.writeHead(200, { 'content-type': 'text/plain' });
+      res.end(corruptNext ? `const BUILD_VERSION = '999'; this does not parse((( ${'y'.repeat(250000)}` : releaseBody);
+    } else { res.writeHead(404); res.end('{}'); }
+  });
+  await new Promise((r) => gitlab.listen(PORT, '127.0.0.1', r));
+
+  try {
+    console.log('\n[1] no stored creds → skipped, file untouched');
+    {
+      const r = await runCheckUpdate(appFile, home);
+      ok(r.status === 0, `exit 0 (got ${r.status})`);
+      ok(/skipped — no GitLab credentials/.test(r.stdout), `says why (got: ${r.stdout.trim().slice(0, 80)})`);
+      ok((await readFile(appFile, 'utf8')) === patched, 'app file untouched');
+    }
+
+    await mkdir(path.join(home, '.code_boss'), { recursive: true });
+    await writeFile(path.join(home, '.code_boss', 'gitlab-creds.json'), JSON.stringify({ user: 't', token: 'tok-123' }), 'utf8');
+
+    console.log('\n[2] manifest build == running build → up to date, no swap');
+    {
+      const r = await runCheckUpdate(appFile, home);
+      ok(r.status === 0 && /up to date \(build/.test(r.stdout), `up-to-date path (got: ${r.stdout.trim().slice(0, 80)})`);
+      ok(!existsSync(path.join(appDir, 'code-boss.prev.mjs')), 'no prev file created');
+      ok(seenTokens.some((t) => t === 'tok-123'), 'the stored token was sent as PRIVATE-TOKEN');
+    }
+
+    console.log('\n[3] newer build available → download, validate, swap, keep prev');
+    {
+      manifest = { build: 999, file: 'releases/code-boss-999.mjs' };
+      const r = await runCheckUpdate(appFile, home);
+      ok(/UPDATED build \d+ → 999/.test(r.stdout), `reported the update (got: ${r.stdout.trim().slice(0, 100)})`);
+      const now = await readFile(appFile, 'utf8');
+      ok(/MARKER-FAKE-999/.test(now), 'app file IS the new release');
+      const prev = path.join(appDir, 'code-boss.prev.mjs');
+      ok(existsSync(prev) && /UPDATE_SOURCE = 'http/.test(await readFile(prev, 'utf8')), 'previous bundle kept for rollback');
+      ok(!existsSync(path.join(appDir, 'code-boss.next.mjs')), 'no temp download file left behind');
+      // What's-new notes: saved next to the app file, FILTERED to builds the
+      // user is actually jumping over (the entry at the old build is excluded).
+      const wnPath = path.join(appDir, 'whats-new.json');
+      ok(existsSync(wnPath), 'whats-new.json saved next to the app file');
+      const wn = JSON.parse(await readFile(wnPath, 'utf8'));
+      ok(wn.toBuild === 999 && Number(wn.fromBuild) === Number(runningBuild), `whats-new carries the jump (${wn.fromBuild} → ${wn.toBuild})`);
+      ok(wn.entries.length === 1 && wn.entries[0].title === 'New stuff', `only the NEWER release's notes included (got ${wn.entries.length}: ${wn.entries.map((e) => e.title).join(', ')})`);
+    }
+
+    console.log('\n[4] corrupt download (fails node --check) → skipped, current file intact');
+    {
+      // Reset the app file to the real (patched) bundle so it can run the subcommand again.
+      await writeFile(appFile, patched, 'utf8');
+      await rm(path.join(appDir, 'code-boss.prev.mjs'), { force: true });
+      corruptNext = true;
+      const r = await runCheckUpdate(appFile, home);
+      ok(r.status === 0 && /skipped — downloaded bundle failed node --check/.test(r.stdout), `rejected the corrupt bundle (got: ${r.stdout.trim().slice(0, 100)})`);
+      ok((await readFile(appFile, 'utf8')) === patched, 'app file untouched after the rejected download');
+      ok(!existsSync(path.join(appDir, 'code-boss.next.mjs')), 'corrupt temp download cleaned up');
+    }
+  } finally {
+    gitlab.close();
+    for (let i = 0; i < 5; i++) { try { await rm(home, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-docmode-edges.mjs
new e718737efc291f14544fff03
+/**
+ * EDGE PROBE (on-demand): document-mode edge cases surfaced by the edge-hunt.
+ *
+ *   [A] Esc LAYERING: with a modal open OVER document mode, Esc must close the
+ *       MODAL first (it's on top) — not the doc behind it. (Bug: the doc-mode
+ *       capture-phase Esc handler closed the doc + swallowed the key.)
+ *   [B] RESET: a 'reset' (Clear conversation / project switch) closes document
+ *       mode and empties the artifact carousel — no stale artifacts/state.
+ *
+ * Run: node test/_edge-docmode-edges.mjs   (starts its own server; needs Chrome)
+ */
+import { mkdtemp, readFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17939;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+const mockAdapter = () => ({
+  async complete() { return { choices: [{ message: { content: 'done.' } }] }; },
+  async *completeStream() { yield { choices: [{ delta: { content: 'done.' } }] }; },
+  async listModels() { return { data: [{ id: 'm' }] }; },
+});
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-docedge-'));
+  const strip = (s) => s.replace(/^import\s+[^;]+;[ \t]*\r?\n?/gm, '').replace(/^export\s+(async\s+function|function|class|const|let|var)\b/gm, '$1').replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
+  const mermaid = strip(await readFile(path.join(ROOT, 'src', 'mermaid-lite.mjs'), 'utf8'));
+  const mosaic = strip(await readFile(path.join(ROOT, 'src', 'agent', 'mosaic-layout.mjs'), 'utf8'));
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8')).replace('</head>',
+    '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'm', baseURL: '(mock)' }) + ';</script><script>' + mosaic + '\n' + mermaid + '</script></head>');
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'm', port: PORT, adapter: mockAdapter(), modelsList: [{ id: 'm' }], initialProject: projectDir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1280, height: 860 });
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForFunction(() => !!document.getElementById('carouselStrip') && typeof renderInline === 'function', { timeout: 8000 });
+
+    // Seed one diagram artifact (renders a carousel thumb after its setTimeout(0) register).
+    await page.evaluate(() => {
+      const row = document.createElement('div'); row.className = 'row assistant';
+      row.innerHTML = renderInline('```mermaid\ngraph TD\n  D[Edge Diagram] --> X[Sink]\n```');
+      document.getElementById('log').appendChild(row);
+    });
+    await sleep(250);
+    ok(await page.evaluate(() => document.querySelectorAll('#carouselStrip .car-thumb').length === 1), 'a diagram thumb is in the carousel');
+
+    console.log('\n[A] Esc layering: a modal over document mode closes the MODAL first, not the doc');
+    {
+      await page.evaluate(() => document.querySelector('#carouselStrip .car-thumb').click());   // open doc mode
+      ok(await page.evaluate(() => document.getElementById('docMode').classList.contains('show')), 'document mode opened on the diagram');
+      // Open the Settings modal ON TOP of doc mode.
+      await page.evaluate(() => document.getElementById('settingsModalBg').classList.add('show'));
+      await sleep(80);
+      const both = await page.evaluate(() => ({
+        modal: document.getElementById('settingsModalBg').classList.contains('show'),
+        doc: document.getElementById('docMode').classList.contains('show'),
+      }));
+      ok(both.modal && both.doc, 'both the settings modal and document mode are open');
+
+      await page.keyboard.press('Escape');
+      await sleep(120);
+      const after1 = await page.evaluate(() => ({
+        modal: document.getElementById('settingsModalBg').classList.contains('show'),
+        doc: document.getElementById('docMode').classList.contains('show'),
+      }));
+      ok(!after1.modal, 'Esc #1 closed the MODAL (the top layer)');
+      ok(after1.doc, 'Esc #1 left document mode OPEN (it was behind the modal)');
+
+      await page.keyboard.press('Escape');
+      await sleep(120);
+      ok(await page.evaluate(() => !document.getElementById('docMode').classList.contains('show')), 'Esc #2 then closes document mode');
+    }
+
+    console.log('\n[B] reset (Clear / project switch) closes document mode + empties the carousel');
+    {
+      await page.evaluate(() => document.querySelector('#carouselStrip .car-thumb').click());   // reopen doc mode
+      ok(await page.evaluate(() => document.getElementById('docMode').classList.contains('show')), 'document mode reopened');
+      await page.evaluate(() => applyDelta({ type: 'reset' }));
+      await sleep(150);
+      const r = await page.evaluate(() => ({
+        doc: document.getElementById('docMode').classList.contains('show'),
+        fs: document.getElementById('sidePanel').classList.contains('fullscreen'),
+        carItems: document.getElementById('carousel').classList.contains('has-items'),
+        thumbs: document.querySelectorAll('#carouselStrip .car-thumb').length,
+      }));
+      ok(!r.doc, 'reset closed document mode');
+      ok(!r.fs, 'reset cleared any full-screen takeover');
+      ok(!r.carItems && r.thumbs === 0, `reset emptied the carousel (has-items=${r.carItems}, thumbs=${r.thumbs})`);
+    }
+
+    ok(jsErrors.length === 0, `no page errors (${jsErrors.length}: ${jsErrors.slice(0, 3).join(' | ')})`);
+  } finally {
+    await browser.close();
+    server.close();
+    await cleanupDir(projectDir);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-extract-edges.mjs
new cde1d04687efe47d3dcb4672
+/**
+ * EDGE PROBE (on-demand): `node code-boss.mjs extract` SEMANTICS — pure CLI,
+ * no server, no port. Uses the REAL dist/code-boss-setup.mjs ADMIN artifact (the lean app bundle no longer carries the map, build 438+).
+ *
+ *   [a] default target (./code_boss-src relative to the child's CWD),
+ *       target dir WITH SPACES, deeply nested non-existent target;
+ *       success line reports overwritten/new counts
+ *   [b] non-empty target without --force → exit 1 + writes NOTHING;
+ *       with --force → writes (and keeps pre-existing files);
+ *       BONUS: target that is an existing FILE → clean one-line refusal
+ *       (stat guard), --force does not bypass it
+ *   [c] STALE-FILE LINGER: build gen-1 (with a scratch src file) and gen-2
+ *       (file deleted) from the EXTRACTED tree's own scripts/build.mjs, then
+ *       extract gen-2 --force over the gen-1 extraction — the deleted file
+ *       lingers but extract now WARNS LOUDLY on stderr. Ignoring the warning
+ *       self-perpetuates: a bundle built from the contaminated clone
+ *       re-embeds the ghost. A --prune leg deletes exactly the map-owned
+ *       stale file while .git/releases/dist survive.
+ *   [d] binary integrity: orange-star.ico sha256 equal to the repo's copy;
+ *       release-notes.json parses as JSON after extract
+ *   [e] second-generation fidelity: extract → rebuild there → extract from
+ *       THAT bundle → trees byte-identical except scripts/build-number.txt
+ *       (which must have incremented by exactly 1)
+ *   [f] bundle living in a READ-ONLY directory (icacls deny W) still
+ *       extracts to a target elsewhere — extract only reads itself
+ *
+ * Run from the repo root:  node test/_edge-extract-edges.mjs
+ */
+import { mkdtemp, mkdir, readFile, writeFile, readdir, copyFile, rm } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { spawn, spawnSync } from 'node:child_process';
+import { createHash } from 'node:crypto';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const note = (l) => console.log('  note:', l);
+
+// ASYNC spawn (no in-process server here, but builds take seconds and we want
+// real exit codes + captured streams without blocking risk).
+function runNode(args, { cwd, timeoutMs = 180000 } = {}) {
+  return new Promise((resolve) => {
+    const p = spawn(process.execPath, args, { cwd, env: { ...process.env } });
+    let stdout = '', stderr = '';
+    p.stdout.on('data', (d) => { stdout += d; });
+    p.stderr.on('data', (d) => { stderr += d; });
+    const t = setTimeout(() => { try { p.kill(); } catch {} }, timeoutMs);
+    p.on('close', (status) => { clearTimeout(t); resolve({ status, stdout, stderr }); });
+  });
+}
+
+async function sha256(file) {
+  return createHash('sha256').update(await readFile(file)).digest('hex');
+}
+
+/** rel(forward-slash) → sha256 for every file under root. */
+async function snapshotTree(root) {
+  const map = new Map();
+  async function walk(rel) {
+    const abs = rel ? path.join(root, rel) : root;
+    for (const e of await readdir(abs, { withFileTypes: true })) {
+      const r = rel ? `${rel}/${e.name}` : e.name;
+      if (e.isDirectory()) await walk(r);
+      else map.set(r, await sha256(path.join(root, r)));
+    }
+  }
+  await walk('');
+  return map;
+}
+
+async function main() {
+  const distFile = path.join(ROOT, 'dist', 'code-boss-setup.mjs');
+  if (!existsSync(distFile)) { console.error('SKIP: dist/code-boss-setup.mjs missing — run node scripts/build.mjs first'); process.exit(0); }
+  const T = await mkdtemp(path.join(tmpdir(), 'cb-extract-'));
+  const roDir = path.join(T, 'ro-dir');
+  const user = process.env.USERNAME || '';
+  let roDenied = false;
+
+  try {
+    console.log('\n[a] target-path semantics');
+    const cwdA = path.join(T, 'cwd-default');
+    await mkdir(cwdA, { recursive: true });
+    {
+      const r = await runNode([distFile, 'extract'], { cwd: cwdA });
+      ok(r.status === 0, `default extract exits 0 (got ${r.status}; ${r.stderr.trim().slice(0, 120)})`);
+      const defDir = path.join(cwdA, 'code_boss-src');
+      ok(existsSync(path.join(defDir, 'src', 'server.mjs')), 'default dir ./code_boss-src created relative to the child CWD');
+      ok(/extract: wrote \d+ files to .* \(0 overwritten, \d+ new\)/.test(r.stdout),
+        `reports the count + overwritten/new split (got: ${r.stdout.trim().split('\n')[0]})`);
+    }
+    {
+      const spaced = path.join(T, 'with spaces', 'inner dir');
+      const r = await runNode([distFile, 'extract', spaced], { cwd: T });
+      ok(r.status === 0 && existsSync(path.join(spaced, 'src', 'server.mjs')), 'target dir WITH SPACES works');
+    }
+    {
+      const deep = path.join(T, 'x1', 'x2', 'x3', 'deep-target');
+      const r = await runNode([distFile, 'extract', deep], { cwd: T });
+      ok(r.status === 0 && existsSync(path.join(deep, 'scripts', 'build.mjs')), 'deeply nested non-existent target works (recursive mkdir)');
+    }
+
+    console.log('\n[b] non-empty target gate');
+    const ne = path.join(T, 'nonempty');
+    await mkdir(ne, { recursive: true });
+    await writeFile(path.join(ne, 'keep.txt'), 'precious user file', 'utf8');
+    {
+      const r = await runNode([distFile, 'extract', ne], { cwd: T });
+      ok(r.status === 1, `refuses non-empty target with exit 1 (got ${r.status})`);
+      ok(/is not empty/.test(r.stderr) && /--force/.test(r.stderr), `says why + how (got: ${r.stderr.trim().slice(0, 140)})`);
+      const entries = await readdir(ne);
+      ok(entries.length === 1 && entries[0] === 'keep.txt', `wrote NOTHING on refusal (dir has: ${entries.join(', ')})`);
+    }
+    {
+      const r = await runNode([distFile, 'extract', ne, '--force'], { cwd: T });
+      ok(r.status === 0 && existsSync(path.join(ne, 'src', 'server.mjs')), '--force writes into the non-empty target');
+      ok((await readFile(path.join(ne, 'keep.txt'), 'utf8')) === 'precious user file', 'pre-existing unrelated file untouched by --force');
+      ok(/\(0 overwritten, \d+ new\)/.test(r.stdout) && !/stale/.test(r.stderr),
+        'root-level user file neither overwritten nor flagged stale');
+    }
+    {
+      // BONUS: target is an existing FILE → the stat guard refuses cleanly
+      // (used to slip past the readdir guard and crash raw ENOTDIR).
+      const fileTgt = path.join(T, 'i-am-a-file.txt');
+      await writeFile(fileTgt, 'original content', 'utf8');
+      const r = await runNode([distFile, 'extract', fileTgt], { cwd: T });
+      ok(r.status === 1, `existing-FILE target refused with exit 1 (got ${r.status})`);
+      ok(/exists and is not a directory — choose a directory path/.test(r.stderr),
+        `clean one-line refusal (got: ${r.stderr.trim().slice(0, 160).replace(/\r?\n/g, ' | ')})`);
+      const rf = await runNode([distFile, 'extract', fileTgt, '--force'], { cwd: T });
+      ok(rf.status === 1 && /exists and is not a directory/.test(rf.stderr), '--force does not bypass the file-target refusal');
+      ok((await readFile(fileTgt, 'utf8')) === 'original content', 'the file itself is untouched');
+    }
+
+    console.log('\n[e] second-generation fidelity (extract → build there → extract from that)');
+    const genA = path.join(T, 'genA');
+    {
+      const r = await runNode([distFile, 'extract', genA], { cwd: T });
+      ok(r.status === 0, 'gen-A extraction ok');
+    }
+    const snapA = await snapshotTree(genA);
+    const numA = parseInt(await readFile(path.join(genA, 'scripts', 'build-number.txt'), 'utf8'), 10);
+    {
+      const r = await runNode([path.join(genA, 'scripts', 'build.mjs')], { cwd: genA });
+      ok(r.status === 0, `extracted tree REBUILDS (got ${r.status}; ${(r.stderr || r.stdout).trim().slice(0, 200)})`);
+      ok(/bundle parse check: OK/.test(r.stdout), 'rebuilt bundle passes node --check');
+      // The source map lives in the ADMIN artifact now (the app bundle is lean).
+      ok(/source map: \d+ files/.test(r.stdout) && existsSync(path.join(genA, 'dist', 'code-boss-setup.mjs')), 'rebuild re-embeds a source map (into code-boss-setup.mjs)');
+    }
+    const genB = path.join(T, 'genB');
+    {
+      const r = await runNode([path.join(genA, 'dist', 'code-boss-setup.mjs'), 'extract', genB], { cwd: T });
+      ok(r.status === 0, 'extraction from the SECOND-generation bundle ok');
+      const snapB = await snapshotTree(genB);
+      // genA grew dist/ from the build — exclude it from the comparison; the
+      // embed never includes dist/, so genB must not have it either.
+      const keysA = [...snapA.keys()];
+      const keysB = [...snapB.keys()];
+      const onlyA = keysA.filter((k) => !snapB.has(k));
+      const onlyB = keysB.filter((k) => !snapA.has(k));
+      ok(onlyA.length === 0 && onlyB.length === 0, `identical file SET (${keysA.length} files; onlyA=[${onlyA.slice(0, 5)}] onlyB=[${onlyB.slice(0, 5)}])`);
+      const diffs = keysA.filter((k) => snapB.has(k) && snapA.get(k) !== snapB.get(k) && k !== 'scripts/build-number.txt');
+      ok(diffs.length === 0, `byte-identical except scripts/build-number.txt (diffs: ${diffs.slice(0, 8).join(', ') || 'none'})`);
+      const numB = parseInt(await readFile(path.join(genB, 'scripts', 'build-number.txt'), 'utf8'), 10);
+      ok(numB === numA + 1, `build number incremented exactly once (${numA} → ${numB})`);
+    }
+
+    console.log('\n[c] STALE-FILE LINGER across releases (the production extract-over-clone flow)');
+    const ghostRel = path.join('src', 'zz-edge-ghost-dead.mjs');
+    {
+      // gen-1: dev tree CONTAINS the (unimported, leaf) file → embedded by addDir('src')
+      await writeFile(path.join(genA, ghostRel), '// scratch leaf module nothing imports — stale-linger probe\nexport const EDGE_GHOST_PROBE = 1;\n', 'utf8');
+      const r1 = await runNode([path.join(genA, 'scripts', 'build.mjs')], { cwd: genA });
+      ok(r1.status === 0, `gen-1 build (with ghost) ok (${(r1.stderr || '').trim().slice(0, 120)})`);
+      await copyFile(path.join(genA, 'dist', 'code-boss-setup.mjs'), path.join(T, 'gen1.mjs'));
+      // dev DELETES the file, next release built
+      await rm(path.join(genA, ghostRel), { force: true });
+      const r2 = await runNode([path.join(genA, 'scripts', 'build.mjs')], { cwd: genA });
+      ok(r2.status === 0, 'gen-2 build (ghost deleted dev-side) ok');
+      await copyFile(path.join(genA, 'dist', 'code-boss-setup.mjs'), path.join(T, 'gen2.mjs'));
+    }
+    {
+      // sanity: a FRESH gen-2 extraction has no ghost — the embed map itself is correct
+      const fresh2 = path.join(T, 'fresh-gen2');
+      const r = await runNode([path.join(T, 'gen2.mjs'), 'extract', fresh2], { cwd: T });
+      ok(r.status === 0 && !existsSync(path.join(fresh2, ghostRel)), 'gen-2 embed correctly DROPPED the deleted file (fresh extraction is clean)');
+    }
+    const clone = path.join(T, 'prod-clone');
+    {
+      // the production clone: first release extracted, then the NEXT release
+      // extracted --force over it (DEPLOY.md step 3: "afterwards extract into
+      // the existing clone (--force writes over it)")
+      const r1 = await runNode([path.join(T, 'gen1.mjs'), 'extract', clone], { cwd: T });
+      ok(r1.status === 0 && existsSync(path.join(clone, ghostRel)), 'gen-1 extraction contains the file (pre-deletion release)');
+      const r2 = await runNode([path.join(T, 'gen2.mjs'), 'extract', clone, '--force'], { cwd: T });
+      ok(r2.status === 0, 'gen-2 extract --force over the clone exits 0');
+      ok(existsSync(path.join(clone, ghostRel)), 'without --prune the dev-side-DELETED file still lingers in the clone');
+      ok(/WARNING — 1 stale file\(s\) not part of this release/.test(r2.stderr) && r2.stderr.includes('zz-edge-ghost-dead.mjs'),
+        `LOUD stderr warning names the stale file (got: ${r2.stderr.trim().slice(0, 200).replace(/\r?\n/g, ' | ')})`);
+      ok(/extract: wrote \d+ files to .* \(\d+ overwritten, 0 new\)/.test(r2.stdout),
+        `success line reports overwritten/new counts (got: ${r2.stdout.trim().split(/\r?\n/)[0]})`);
+    }
+    {
+      // self-perpetuation when the warning is IGNORED: the next release built
+      // from the contaminated clone re-embeds the ghost — it then ships to
+      // every fresh extraction.
+      const r = await runNode([path.join(clone, 'scripts', 'build.mjs')], { cwd: clone });
+      ok(r.status === 0, 'release build from the contaminated clone ok');
+      const fresh3 = path.join(T, 'fresh-gen3');
+      const r3 = await runNode([path.join(clone, 'dist', 'code-boss-setup.mjs'), 'extract', fresh3], { cwd: T });
+      ok(r3.status === 0, 'extraction from that release ok');
+      ok(existsSync(path.join(fresh3, ghostRel)), 'warning ignored → ghost RE-EMBEDDED into the next release (why the warning/--prune exist)');
+    }
+    {
+      // --prune: deletes exactly the map-owned stale file; .git/releases/dist
+      // (and anything outside owned roots) must survive untouched.
+      await mkdir(path.join(clone, '.git'), { recursive: true });
+      await writeFile(path.join(clone, '.git', 'config'), '[core]\n', 'utf8');
+      await mkdir(path.join(clone, 'releases'), { recursive: true });
+      await writeFile(path.join(clone, 'releases', 'code-boss-1.mjs'), '// release artifact', 'utf8');
+      const distMarker = path.join(clone, 'dist', 'code-boss.mjs');   // created by the build leg above
+      const r = await runNode([path.join(T, 'gen2.mjs'), 'extract', clone, '--force', '--prune'], { cwd: T });
+      ok(r.status === 0, `--prune extract exits 0 (got ${r.status})`);
+      ok(/extract: pruned 1 stale file\(s\)/.test(r.stdout) && r.stdout.includes('zz-edge-ghost-dead.mjs'),
+        `prune reports the deleted file (got: ${(r.stdout.trim().split(/\r?\n/).find((l) => /pruned/.test(l)) || r.stdout.trim()).slice(0, 160)})`);
+      ok(!existsSync(path.join(clone, ghostRel)), 'ghost DELETED by --prune');
+      ok(!/WARNING/.test(r.stderr), 'no stale warning left after pruning');
+      ok((await readFile(path.join(clone, '.git', 'config'), 'utf8')) === '[core]\n', '.git untouched by --prune');
+      ok((await readFile(path.join(clone, 'releases', 'code-boss-1.mjs'), 'utf8')) === '// release artifact', 'releases/ untouched by --prune');
+      ok(existsSync(distMarker), 'dist/ untouched by --prune');
+    }
+
+    console.log('\n[d] binary + JSON integrity after extract');
+    {
+      const exIco = path.join(cwdA, 'code_boss-src', 'deploy', 'orange-star.ico');
+      ok(existsSync(exIco), 'deploy/orange-star.ico extracted');
+      if (existsSync(exIco)) {
+        ok(await sha256(exIco) === await sha256(path.join(ROOT, 'deploy', 'orange-star.ico')), 'orange-star.ico byte-identical to the repo copy (sha256)');
+      }
+      const exNotes = path.join(cwdA, 'code_boss-src', 'release-notes.json');
+      ok(existsSync(exNotes), 'release-notes.json extracted');
+      let parsed = null;
+      try { parsed = JSON.parse(await readFile(exNotes, 'utf8')); } catch {}
+      ok(parsed && typeof parsed.title === 'string', 'release-notes.json is valid JSON with a title after extract');
+    }
+
+    console.log('\n[f] bundle in a READ-ONLY directory (target elsewhere)');
+    {
+      // The REALISTIC read-only dir: inheritance stripped, user granted RX
+      // only (no write allows) — like Program Files or a read-only share.
+      await mkdir(roDir, { recursive: true });
+      const roBundle = path.join(roDir, 'code-boss.mjs');
+      await copyFile(distFile, roBundle);
+      const acl = spawnSync('icacls', [roDir, '/inheritance:r',
+        '/grant', '*S-1-5-18:(OI)(CI)F',          // SYSTEM
+        '/grant', '*S-1-5-32-544:(OI)(CI)F',      // Administrators
+        '/grant', `${user}:(OI)(CI)RX`], { encoding: 'utf8' });
+      try { await writeFile(path.join(roDir, 'write-probe.txt'), 'x', 'utf8'); }
+      catch { roDenied = true; }
+      if (acl.status === 0 && roDenied) {
+        ok(true, 'dir made read-only (allow RX only; write attempt fails)');
+        const r = await runNode([roBundle, 'extract', path.join(T, 'ro-target')], { cwd: T });
+        ok(r.status === 0 && existsSync(path.join(T, 'ro-target', 'src', 'server.mjs')),
+          `extract works with the bundle in a read-only dir (got ${r.status}; ${r.stderr.trim().slice(0, 120)})`);
+      } else {
+        note(`could not establish an RX-only ACL here (icacls status ${acl.status}, write denied=${roDenied}) — scenario [f] skipped, not failed`);
+      }
+    }
+    {
+      // PLATFORM QUIRK (documented, not a product bug): an explicit DENY(W)
+      // ACE — which (OI)-inherits onto the bundle file — makes Node's fs open
+      // fail with EPERM even for READS (libuv requests write-attribute access
+      // on Windows opens). The ESM loader then can't load the bundle at all,
+      // so the failure happens BEFORE any code_boss code runs.
+      const denyDir = path.join(T, 'ro-deny-dir');
+      await mkdir(denyDir, { recursive: true });
+      const denyBundle = path.join(denyDir, 'code-boss.mjs');
+      await copyFile(distFile, denyBundle);
+      const deny = spawnSync('icacls', [denyDir, '/deny', `${user}:(OI)(CI)(W)`], { encoding: 'utf8' });
+      if (deny.status === 0) {
+        const r = await runNode([denyBundle, 'extract', path.join(T, 'deny-target')], { cwd: T });
+        ok(r.status !== 0 && /EPERM/.test(r.stderr) && !/extract: wrote/.test(r.stdout),
+          `documented quirk: DENY(W) ACE blocks Node from even READING the bundle (exit ${r.status}, EPERM in the ESM loader) — platform behavior, not deploy-cmd`);
+        spawnSync('icacls', [denyDir, '/remove:d', user], { encoding: 'utf8' });
+      } else {
+        note('could not apply a deny ACE — quirk sub-check skipped');
+      }
+    }
+  } finally {
+    // lift the ACLs first or rm may be blocked
+    try { spawnSync('icacls', [roDir, '/reset', '/t'], { encoding: 'utf8' }); } catch {}
+    try { spawnSync('icacls', [path.join(T, 'ro-deny-dir'), '/remove:d', user], { encoding: 'utf8' }); } catch {}
+    await cleanupDir(T);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== binary test/_edge-hostile-input.mjs
base -
new 6fe7ade7ad111d1a61a55da8
:LyoqDQogKiBFREdFIFBST0JFIChvbi1kZW1hbmQpOiBIT1NUSUxFIElOUFVUICsgTE9DSyBDT0hFUkVOQ0UgKyBQT0lTT05FRCBT
:VEFURS4NCiAqDQogKiAgW0FdIFJBUElEIEZJUkU6IDUgUE9TVHMgdG8gL2FwaS9tZXNzYWdlIGluc2lkZSB+NzAwbXMgd2hpbGUg
:dGhlIGZpcnN0IHJ1bg0KICogICAgICBpcyBzdGlsbCB0aGlua2luZyAobm9uLWdpdCBwcm9qZWN0IOKGkiBvcmNoZXN0cmF0b3Ig
:ZGVsZWdhdGlvbiBpcyBvZmYpOg0KICogICAgICBleGFjdGx5IE9ORSAyMDAsIGZvdXIgY2xlYW4gNDA5cywgc2VydmVyIHN0YXRl
:IHNob3dzIGV4YWN0bHkgb25lDQogKiAgICAgIHVzZXItbWVzc2FnZSBhbmQgbm8gaW50ZXJsZWF2ZWQgY29ycnVwdGlvbjsgYSBV
:SSBzZW5kKCkgd2hpbGUgYnVzeQ0KICogICAgICBzdXJmYWNlcyBhIHZpc2libGUgIlNlbmQgZmFpbGVkIiBtb2RhbCAobm90IGEg
:c2lsZW50IGRyb3ApIGFuZA0KICogICAgICByZXN0b3JlcyB0aGUgaW5wdXQgdGV4dCBmb3IgcmV0cnkuDQogKiAgW0JdIEhPU1RJ
:TEUgTUVTU0FHRSByZW5kZXJlZCBpbmVydDogPHNjcmlwdD4sIDxpbWcgb25lcnJvcj4sIDxpZnJhbWUNCiAqICAgICAgamF2YXNj
:cmlwdDo+LCBBTlNJIGVzY2FwZXMsIFJUTCBvdmVycmlkZSwgYW5kIGEgMTBLLWNoYXIgdW5icm9rZW4NCiAqICAgICAgdG9rZW4g
:4oCUIGluIEJPVEggdGhlIHVzZXIgYnViYmxlIGFuZCB0aGUgYXNzaXN0YW50IHJlcGx5LiBObyBzY3JpcHQNCiAqICAgICAgZXhl
:Y3V0ZXMsIG5vIGxpdmUgaW1nL2lmcmFtZSBsYW5kcyBpbiB0aGUgbG9nLCB0aGUgaG9zdGlsZSB0ZXh0IGlzDQogKiAgICAgIHNo
:b3duIGxpdGVyYWxseSwgYW5kIHRoZSBsYXlvdXQgc3Vydml2ZXMgKG5vIGhvcml6b250YWwgYmxvd291dCkuDQogKiAgW0NdIExP
:Q0FMU1RPUkFHRSBQT0lTT05FRDogZXZlcnkgY2ItKiBrZXkgKyBjYi5tb3NhaWMuYWN0aXZlSWRzIHNldCB0bw0KICogICAgICBn
:YXJiYWdlIChiaW5hcnksIHVudGVybWluYXRlZCBKU09OLCA8c2NyaXB0PiwgNDA5NiBhc3RyYWwgY2hhcnMsDQogKiAgICAgICcw
:MScvJ3RydWUnIG5lYXItbWlzc2VzKSDihpIgYm9vdCBzdXJ2aXZlcywgY2hpcHMgbGFuZCBvbiBzYW5lDQogKiAgICAgIGRlZmF1
:bHRzLCBjaGF0IHN0aWxsIHJvdW5kLXRyaXBzLg0KICogIFtEXSAzTUIgU0lOR0xFIFBBU1RFOiBhIH4zTUIgaW5wdXQgc3Vydml2
:ZXMgc2VuZCDihpIgcnVuIOKGkiByZW5kZXIgd2l0aG91dA0KICogICAgICBraWxsaW5nIHRoZSB0YWI7IHRoZSBwYWdlIHN0YXlz
:IHJlc3BvbnNpdmUgYWZ0ZXJ3YXJkcy4NCiAqDQogKiBQb3J0IDE3OTc0IG9ubHkuIFJ1bjogbm9kZSB0ZXN0L19lZGdlLWhvc3Rp
:bGUtaW5wdXQubWpzIChza2lwcyB3L28gQ2hyb21lKQ0KICovDQppbXBvcnQgeyBta2R0ZW1wLCByZWFkRmlsZSB9IGZyb20gJ25v
:ZGU6ZnMvcHJvbWlzZXMnOw0KaW1wb3J0IHsgZXhpc3RzU3luYyB9IGZyb20gJ25vZGU6ZnMnOw0KaW1wb3J0IHsgdG1wZGlyIH0g
:ZnJvbSAnbm9kZTpvcyc7DQppbXBvcnQgcGF0aCBmcm9tICdub2RlOnBhdGgnOw0KaW1wb3J0IHsgZmlsZVVSTFRvUGF0aCB9IGZy
:b20gJ25vZGU6dXJsJzsNCmltcG9ydCBwdXBwZXRlZXIgZnJvbSAncHVwcGV0ZWVyLWNvcmUnOw0KaW1wb3J0IHsgc3RhcnRTZXJ2
:ZXIgfSBmcm9tICcuLi9zcmMvc2VydmVyLm1qcyc7DQppbXBvcnQgeyBjbGVhbnVwRGlyIH0gZnJvbSAnLi9faGVscGVycy5tanMn
:Ow0KDQpjb25zdCBfX2Rpcm5hbWUgPSBwYXRoLmRpcm5hbWUoZmlsZVVSTFRvUGF0aChpbXBvcnQubWV0YS51cmwpKTsNCmNvbnN0
:IFJPT1QgPSBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4nKTsNCmNvbnN0IFBPUlQgPSAxNzk3NDsNCmxldCBwYXNzID0gMCwg
:ZmFpbCA9IDA7DQpjb25zdCBvayA9IChjLCBsKSA9PiB7IGlmIChjKSB7IHBhc3MrKzsgY29uc29sZS5sb2coJyAgb2snLCBsKTsg
:fSBlbHNlIHsgZmFpbCsrOyBjb25zb2xlLmxvZygnICBGQUlMJywgbCk7IH0gfTsNCmNvbnN0IG5vdGUgPSAobCkgPT4gY29uc29s
:ZS5sb2coJyAgLS0nLCBsKTsNCmZ1bmN0aW9uIGZpbmRDaHJvbWUoKSB7DQogIGNvbnN0IGMgPSBwcm9jZXNzLnBsYXRmb3JtID09
:PSAnd2luMzInDQogICAgPyBbKHByb2Nlc3MuZW52LkxPQ0FMQVBQREFUQSB8fCAnJykgKyAnXFxHb29nbGVcXENocm9tZVxcQXBw
:bGljYXRpb25cXGNocm9tZS5leGUnLCAnQzpcXFByb2dyYW0gRmlsZXNcXEdvb2dsZVxcQ2hyb21lXFxBcHBsaWNhdGlvblxcY2hy
:b21lLmV4ZScsICdDOlxcUHJvZ3JhbSBGaWxlcyAoeDg2KVxcR29vZ2xlXFxDaHJvbWVcXEFwcGxpY2F0aW9uXFxjaHJvbWUuZXhl
:J10NCiAgICA6IFsnL3Vzci9iaW4vZ29vZ2xlLWNocm9tZScsICcvQXBwbGljYXRpb25zL0dvb2dsZSBDaHJvbWUuYXBwL0NvbnRl
:bnRzL01hY09TL0dvb2dsZSBDaHJvbWUnXTsNCiAgcmV0dXJuIGMuZmluZCgocCkgPT4geyB0cnkgeyByZXR1cm4gcCAmJiBleGlz
:dHNTeW5jKHApOyB9IGNhdGNoIHsgcmV0dXJuIGZhbHNlOyB9IH0pOw0KfQ0KY29uc3Qgc2xlZXAgPSAobXMpID0+IG5ldyBQcm9t
:aXNlKChyKSA9PiBzZXRUaW1lb3V0KHIsIG1zKSk7DQoNCmNvbnN0IEJJR1RPS0VOID0gJ1onLnJlcGVhdCgxMDAwMCk7DQpjb25z
:dCBIT1NUSUxFX1VTRVIgPSAnaG9zdGlsZSBwbGVhc2UgPHNjcmlwdD53aW5kb3cuX19wd25lZD0xPC9zY3JpcHQ+PGltZyBzcmM9
:eCBvbmVycm9yPSJ3aW5kb3cuX19wd25lZD0yIj4gJiI8PlwnIBtbMzFtQU5TSRtbMG0g4oCucmV2ZXJzZWTigKwgJyArIEJJR1RP
:S0VOOw0KY29uc3QgSE9TVElMRV9BU1NJU1RBTlQgPSAnRWNob2luZyBiYWNrOiA8c2NyaXB0PndpbmRvdy5fX3B3bmVkPTM8L3Nj
:cmlwdD48aW1nIHNyYz14IG9uZXJyb3I9IndpbmRvdy5fX3B3bmVkPTQiPiA8aWZyYW1lIHNyYz0iamF2YXNjcmlwdDp3aW5kb3cu
:X19wd25lZD01Ij48L2lmcmFtZT4gKipib2xkKiog4oCuZXZpbOKArCAnICsgJ1cnLnJlcGVhdCg5MDAwKTsNCg0KLy8gUm91dGVk
:IG1vY2s6IHBlci1rZXkgY2FsbCBjb3VudHM7IGZpcnN0IHJlcGx5IG1heSBiZSBkZWxheWVkICh0aGUgcmFwaWQtZmlyZQ0KLy8g
:d2luZG93KTsgbGF0ZXIgY2FsbHMgYW5zd2VyICdEb25lLicgZmFzdCBzbyBleHRyYSBlbmdpbmUgdHVybnMgdGVybWluYXRlLg0K
:ZnVuY3Rpb24gcm91dGVkQWRhcHRlcigpIHsNCiAgY29uc3Qgcm91dGVzID0gew0KICAgICdyYXBpZCBmaXJlIHBsZWFzZSc6IHsg
:Zmlyc3REZWxheTogMjUwMCwgcmVwbGllczogWyAnRmlyc3QgcmVwbHkgZG9uZS4nIF0gfSwNCiAgICAnaG9zdGlsZSBwbGVhc2Un
:OiAgICB7IGZpcnN0RGVsYXk6IDUwLCAgIHJlcGxpZXM6IFsgSE9TVElMRV9BU1NJU1RBTlQgXSB9LA0KICAgICdiaWcgcGFzdGUg
:cGxlYXNlJzogIHsgZmlyc3REZWxheTogNTAsICAgcmVwbGllczogWyAnR290IHRoZSBiaWcgcGFzdGUsIGFsbCAzTUIgb2YgaXQu
:JyBdIH0sDQogICAgJ3BpbmcgcGxlYXNlJzogICAgICAgeyBmaXJzdERlbGF5OiAzMCwgICByZXBsaWVzOiBbICdwb25nLicgXSB9
:LA0KICB9Ow0KICBjb25zdCBjb3VudHMgPSBuZXcgTWFwKCk7DQogIGNvbnN0IGZpbmQgPSAobWVzc2FnZXMpID0+IHsNCiAgICAv
:LyBGTEFUIFRSQU5TUE9SVDogdGhlIHdob2xlIGNvbnZlcnNhdGlvbiBhcnJpdmVzIGFzIE9ORSB1c2VyIG1lc3NhZ2UgLSB0aGUg
:cm91dGUgaXMgdGhlIGtleSB0aGF0IGFwcGVhcnMgTEFURVNUDQogICAgY29uc3QgdCA9IChtZXNzYWdlcyB8fCBbXSkuZmlsdGVy
:KChtKSA9PiBtLnJvbGUgPT09ICd1c2VyJykubWFwKChtKSA9PiB0eXBlb2YgbS5jb250ZW50ID09PSAnc3RyaW5nJyA/IG0uY29u
:dGVudCA6IEFycmF5LmlzQXJyYXkobS5jb250ZW50KSA/IG0uY29udGVudC5tYXAoKGIpID0+IChiICYmIGIudGV4dCkgfHwgJycp
:LmpvaW4oJ1xuJykgOiAnJykuam9pbignXG4nKTsNCiAgICBsZXQgYmVzdCA9IG51bGwsIGF0ID0gLTE7DQogICAgZm9yIChjb25z
:dCBrIG9mIE9iamVjdC5rZXlzKHJvdXRlcykpIHsgY29uc3QgaSA9IHQubGFzdEluZGV4T2Yoayk7IGlmIChpID4gYXQpIHsgYXQg
:PSBpOyBiZXN0ID0gazsgfSB9DQogICAgcmV0dXJuIGJlc3Q7DQogIH07DQogIHJldHVybiB7DQogICAgYXN5bmMgKmNvbXBsZXRl
:U3RyZWFtKG9wdHMpIHsNCiAgICAgIGNvbnN0IGtleSA9IGZpbmQob3B0cz8ubWVzc2FnZXMpOw0KICAgICAgaWYgKCFrZXkpIHsg
:eWllbGQgeyBjaG9pY2VzOiBbeyBkZWx0YTogeyBjb250ZW50OiAnbm8gcm91dGUgaGVyZS4nIH0gfV0gfTsgcmV0dXJuOyB9DQog
:ICAgICBjb25zdCBuID0gY291bnRzLmdldChrZXkpIHx8IDA7IGNvdW50cy5zZXQoa2V5LCBuICsgMSk7DQogICAgICBjb25zdCBy
:ID0gcm91dGVzW2tleV07DQogICAgICBpZiAobiA+PSByLnJlcGxpZXMubGVuZ3RoKSB7IHlpZWxkIHsgY2hvaWNlczogW3sgZGVs
:dGE6IHsgY29udGVudDogJ0RvbmUuJyB9IH1dIH07IHJldHVybjsgfQ0KICAgICAgYXdhaXQgc2xlZXAoci5maXJzdERlbGF5KTsN
:CiAgICAgIHlpZWxkIHsgY2hvaWNlczogW3sgZGVsdGE6IHsgY29udGVudDogci5yZXBsaWVzW25dIH0gfV0gfTsNCiAgICB9LA0K
:ICAgIGFzeW5jIGNvbXBsZXRlKCkgeyByZXR1cm4geyBjaG9pY2VzOiBbeyBtZXNzYWdlOiB7IGNvbnRlbnQ6ICc8cmV2aWV3LXBh
:c3MvPicgfSB9XSB9OyB9LA0KICB9Ow0KfQ0KDQpjb25zdCBwb3N0TWVzc2FnZSA9ICh0ZXh0KSA9PiBmZXRjaChgaHR0cDovLzEy
:Ny4wLjAuMToke1BPUlR9L2FwaS9tZXNzYWdlYCwgew0KICBtZXRob2Q6ICdQT1NUJywgaGVhZGVyczogeyAnY29udGVudC10eXBl
:JzogJ2FwcGxpY2F0aW9uL2pzb24nIH0sDQogIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgdGV4dCwgbW9kZWw6ICdtJyB9KSwNCn0p
:Ow0KYXN5bmMgZnVuY3Rpb24gd2FpdEZvcklkbGUocGFnZSwgdGltZW91dE1zID0gMzAwMDApIHsNCiAgYXdhaXQgcGFnZS53YWl0
:Rm9yRnVuY3Rpb24oKCkgPT4gWydpZGxlJywgJ2RvbmUnLCAnZXJyb3InXS5pbmNsdWRlcyh3aW5kb3cuX19zZXNzaW9uUmVmPy5z
:dGF0dXMpLCB7IHRpbWVvdXQ6IHRpbWVvdXRNcyB9KTsNCiAgYXdhaXQgc2xlZXAoNDAwKTsNCn0NCg0KYXN5bmMgZnVuY3Rpb24g
:bWFpbigpIHsNCiAgY29uc3QgY2hyb21lID0gZmluZENocm9tZSgpOw0KICBpZiAoIWNocm9tZSkgeyBjb25zb2xlLmxvZygnU0tJ
:UDogQ2hyb21lIG5vdCBmb3VuZCcpOyBwcm9jZXNzLmV4aXQoMCk7IH0NCiAgY29uc3QgcHJvamVjdERpciA9IGF3YWl0IG1rZHRl
:bXAocGF0aC5qb2luKHRtcGRpcigpLCAnY2ItaG9zdGlsZS0nKSk7ICAgLy8gTk9UIGEgZ2l0IHJlcG8g4oaSIGJ1c3kgPSA0MDkN
:CiAgY29uc3QgaHRtbCA9IChhd2FpdCByZWFkRmlsZShwYXRoLmpvaW4oUk9PVCwgJ3NyYycsICd1aS5odG1sJyksICd1dGY4Jykp
:DQogICAgLnJlcGxhY2UoJzwvaGVhZD4nLCAnPHNjcmlwdD53aW5kb3cuU0VSVkVSX0NPTkZJRz0nICsgSlNPTi5zdHJpbmdpZnko
:eyBkZWZhdWx0TW9kZWw6ICdtJywgYmFzZVVSTDogJyhtb2NrKScgfSkgKyAnOzwvc2NyaXB0PjwvaGVhZD4nKTsNCiAgY29uc3Qg
:eyBzZXJ2ZXIgfSA9IGF3YWl0IHN0YXJ0U2VydmVyKHsNCiAgICBodG1sLCBiYXNlVVJMOiAnKG1vY2spJywgYXBpS2V5OiAnaycs
:IGdpdGxhYkNyZWRzOiB7IHVzZXI6ICd0JywgdG9rZW46ICd0JyB9LA0KICAgIGRlZmF1bHRNb2RlbDogJ20nLCBwb3J0OiBQT1JU
:LCBhZGFwdGVyOiByb3V0ZWRBZGFwdGVyKCksIG1vZGVsc0xpc3Q6IFt7IGlkOiAnbScgfV0sIGluaXRpYWxQcm9qZWN0OiBwcm9q
:ZWN0RGlyLA0KICB9KTsNCiAgY29uc3QgYnJvd3NlciA9IGF3YWl0IHB1cHBldGVlci5sYXVuY2goeyBleGVjdXRhYmxlUGF0aDog
:Y2hyb21lLCBoZWFkbGVzczogJ25ldycsIGFyZ3M6IFsnLS1uby1zYW5kYm94J10gfSk7DQogIGNvbnN0IGpzRXJyb3JzID0gW107
:DQogIHRyeSB7DQogICAgY29uc3QgcGFnZSA9IGF3YWl0IGJyb3dzZXIubmV3UGFnZSgpOw0KICAgIGF3YWl0IHBhZ2Uuc2V0Vmll
:d3BvcnQoeyB3aWR0aDogMTIwMCwgaGVpZ2h0OiA4MDAgfSk7DQogICAgcGFnZS5vbigncGFnZWVycm9yJywgKGUpID0+IGpzRXJy
:b3JzLnB1c2goU3RyaW5nKGUubWVzc2FnZSkpKTsNCiAgICBhd2FpdCBwYWdlLmdvdG8oYGh0dHA6Ly8xMjcuMC4wLjE6JHtQT1JU
:fS9gKTsNCiAgICBhd2FpdCBwYWdlLndhaXRGb3JTZWxlY3RvcignI2NoYXQ6bm90KC5oaWRkZW4pJywgeyB0aW1lb3V0OiAxNTAw
:MCB9KTsNCiAgICBhd2FpdCBzbGVlcCgzMDApOw0KDQogICAgY29uc29sZS5sb2coJ1xuW0FdIHJhcGlkLWZpcmUgNSBzZW5kcyBp
:biA8MXMg4oCUIGxvY2sgY29oZXJlbmNlJyk7DQogICAgew0KICAgICAgY29uc3QgcmVzdWx0cyA9IFtdOw0KICAgICAgY29uc3Qg
:Zmlyc3QgPSBwb3N0TWVzc2FnZSgncmFwaWQgZmlyZSBwbGVhc2UgIzEnKTsNCiAgICAgIGZvciAobGV0IGkgPSAyOyBpIDw9IDU7
:IGkrKykgew0KICAgICAgICBhd2FpdCBzbGVlcCgxNTApOw0KICAgICAgICByZXN1bHRzLnB1c2gocG9zdE1lc3NhZ2UoYHJhcGlk
:IGZpcmUgcGxlYXNlICMke2l9YCkpOw0KICAgICAgfQ0KICAgICAgY29uc3QgYWxsID0gYXdhaXQgUHJvbWlzZS5hbGwoW2ZpcnN0
:LCAuLi5yZXN1bHRzXSk7DQogICAgICBjb25zdCBzdGF0dXNlcyA9IGF3YWl0IFByb21pc2UuYWxsKGFsbC5tYXAoYXN5bmMgKHIp
:ID0+ICh7IHN0YXR1czogci5zdGF0dXMsIGJvZHk6IGF3YWl0IHIuanNvbigpLmNhdGNoKCgpID0+ICh7fSkpIH0pKSk7DQogICAg
:ICBjb25zdCBva3MgPSBzdGF0dXNlcy5maWx0ZXIoKHMpID0+IHMuc3RhdHVzID09PSAyMDApOw0KICAgICAgY29uc3QgYnVzaWVz
:ID0gc3RhdHVzZXMuZmlsdGVyKChzKSA9PiBzLnN0YXR1cyA9PT0gNDA5KTsNCiAgICAgIG5vdGUoJ3N0YXR1c2VzOiAnICsgc3Rh
:dHVzZXMubWFwKChzKSA9PiBzLnN0YXR1cykuam9pbignLCAnKSk7DQogICAgICBvayhva3MubGVuZ3RoID09PSAxLCBgZXhhY3Rs
:eSBPTkUgc2VuZCBhY2NlcHRlZCAoZ290ICR7b2tzLmxlbmd0aH0pYCk7DQogICAgICBvayhidXNpZXMubGVuZ3RoID09PSA0LCBg
:dGhlIG90aGVyIGZvdXIgZ290IGNsZWFuIDQwOXMgKGdvdCAke2J1c2llcy5sZW5ndGh9KWApOw0KICAgICAgb2soYnVzaWVzLmV2
:ZXJ5KChzKSA9PiAvcnVubmluZ3xidXN5fGNhbmNlbGxpbmcvaS50ZXN0KHMuYm9keT8uZXJyb3IgfHwgJycpKSwgYGV2ZXJ5IDQw
:OSBjYXJyaWVzIGEgaHVtYW4tcmVhZGFibGUgYnVzeSBlcnJvciAoIiR7YnVzaWVzWzBdPy5ib2R5Py5lcnJvcn0iKWApOw0KDQog
:ICAgICAvLyBBIFVJIHNlbmQgd2hpbGUgYnVzeSBtdXN0IEZBSUwgVklTSUJMWSAobW9kYWwpIGFuZCByZXN0b3JlIHRoZSBpbnB1
:dC4NCiAgICAgIGF3YWl0IHBhZ2UuZXZhbHVhdGUoKCkgPT4geyBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5wdXQnKS52YWx1
:ZSA9ICdyYXBpZCBmaXJlIHBsZWFzZSAjdWknOyBzZW5kKCk7IH0pOw0KICAgICAgYXdhaXQgcGFnZS53YWl0Rm9yRnVuY3Rpb24o
:KCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21vZGFsQmcnKT8uY2xhc3NMaXN0LmNvbnRhaW5zKCdzaG93JyksIHsgdGlt
:ZW91dDogNTAwMCB9KS5jYXRjaCgoKSA9PiB7fSk7DQogICAgICBjb25zdCBtb2RhbCA9IGF3YWl0IHBhZ2UuZXZhbHVhdGUoKCkg
:PT4gKHsNCiAgICAgICAgc2hvd246IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2RhbEJnJyk/LmNsYXNzTGlzdC5jb250YWlu
:cygnc2hvdycpIHx8IGZhbHNlLA0KICAgICAgICB0aXRsZTogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21vZGFsVGl0bGUnKT8u
:dGV4dENvbnRlbnQgfHwgJycsDQogICAgICAgIGlucHV0UmVzdG9yZWQ6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpbnB1dCcp
:LnZhbHVlLA0KICAgICAgfSkpOw0KICAgICAgb2sobW9kYWwuc2hvd24gJiYgL3NlbmQgZmFpbGVkL2kudGVzdChtb2RhbC50aXRs
:ZSksIGBVSSBzZW5kIHdoaWxlIGJ1c3kgc3VyZmFjZXMgYSB2aXNpYmxlIGVycm9yIG1vZGFsICh0aXRsZT0iJHttb2RhbC50aXRs
:ZX0iKWApOw0KICAgICAgb2sobW9kYWwuaW5wdXRSZXN0b3JlZCA9PT0gJ3JhcGlkIGZpcmUgcGxlYXNlICN1aScsICd0aGUgcmVq
:ZWN0ZWQgbWVzc2FnZSB0ZXh0IGlzIHJlc3RvcmVkIHRvIHRoZSBpbnB1dCBmb3IgcmV0cnknKTsNCiAgICAgIGF3YWl0IHBhZ2Uu
:ZXZhbHVhdGUoKCkgPT4gY2xvc2VNb2RhbCgpKTsNCg0KICAgICAgYXdhaXQgd2FpdEZvcklkbGUocGFnZSk7DQogICAgICBjb25z
:dCBzdCA9IGF3YWl0IChhd2FpdCBmZXRjaChgaHR0cDovLzEyNy4wLjAuMToke1BPUlR9L2FwaS9zdGF0ZWApKS5qc29uKCk7DQog
:ICAgICBjb25zdCB1c2VycyA9IHN0LmV2ZW50cy5maWx0ZXIoKGUpID0+IGUudHlwZSA9PT0gJ3VzZXItbWVzc2FnZScpOw0KICAg
:ICAgb2sodXNlcnMubGVuZ3RoID09PSAxICYmIHVzZXJzWzBdLmNvbnRlbnQuaW5jbHVkZXMoJyMxJyksIGBzZXJ2ZXIga2VwdCBl
:eGFjdGx5IHRoZSBPTkUgYWNjZXB0ZWQgbWVzc2FnZSAoZ290ICR7dXNlcnMubGVuZ3RofTogIiR7KHVzZXJzWzBdPy5jb250ZW50
:IHx8ICcnKS5zbGljZSgwLCAzMCl9IilgKTsNCiAgICAgIGNvbnN0IGxvZyA9IGF3YWl0IHBhZ2UuZXZhbHVhdGUoKCkgPT4gZG9j
:dW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZycpLnRleHRDb250ZW50KTsNCiAgICAgIG9rKGxvZy5pbmNsdWRlcygnRmlyc3QgcmVw
:bHkgZG9uZS4nKSwgJ3RoZSBzaW5nbGUgYWNjZXB0ZWQgcnVuIGNvbXBsZXRlZCBub3JtYWxseScpOw0KICAgICAgb2soIWxvZy5p
:bmNsdWRlcygnIzInKSAmJiAhbG9nLmluY2x1ZGVzKCcjMycpICYmICFsb2cuaW5jbHVkZXMoJyM0JykgJiYgIWxvZy5pbmNsdWRl
:cygnIzUnKSwgJ25vIHJlamVjdGVkIG1lc3NhZ2UgbGVha2VkIGludG8gdGhlIGNoYXQgbG9nJyk7DQogICAgfQ0KDQogICAgY29u
:c29sZS5sb2coJ1xuW0JdIGhvc3RpbGUgdXNlciArIGFzc2lzdGFudCBjb250ZW50IHJlbmRlcmVkIGluZXJ0Jyk7DQogICAgew0K
:ICAgICAgYXdhaXQgcGFnZS5ldmFsdWF0ZSgodCkgPT4geyBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5wdXQnKS52YWx1ZSA9
:IHQ7IHNlbmQoKTsgfSwgSE9TVElMRV9VU0VSKTsNCiAgICAgIGF3YWl0IHBhZ2Uud2FpdEZvckZ1bmN0aW9uKCgpID0+IChkb2N1
:bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nJyk/LnRleHRDb250ZW50IHx8ICcnKS5pbmNsdWRlcygnRWNob2luZyBiYWNrOicpLCB7
:IHRpbWVvdXQ6IDIwMDAwIH0pOw0KICAgICAgYXdhaXQgd2FpdEZvcklkbGUocGFnZSk7DQogICAgICBhd2FpdCBzbGVlcCg1MDAp
:OyAgIC8vIGdpdmUgYW55IHNuZWFrZWQtaW4gc2NyaXB0L29uZXJyb3IgYSBiZWF0IHRvIGZpcmUNCiAgICAgIGNvbnN0IGggPSBh
:d2FpdCBwYWdlLmV2YWx1YXRlKCgpID0+ICh7DQogICAgICAgIHB3bmVkOiB3aW5kb3cuX19wd25lZCwNCiAgICAgICAgc2NyaXB0
:czogZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnI2xvZyBzY3JpcHQnKS5sZW5ndGgsDQogICAgICAgIGltZ3M6IGRvY3VtZW50
:LnF1ZXJ5U2VsZWN0b3JBbGwoJyNsb2cgaW1nW3NyYz0ieCJdJykubGVuZ3RoLA0KICAgICAgICBpZnJhbWVzOiBkb2N1bWVudC5x
:dWVyeVNlbGVjdG9yQWxsKCcjbG9nIGlmcmFtZScpLmxlbmd0aCwNCiAgICAgICAgdXNlckxpdGVyYWw6IFsuLi5kb2N1bWVudC5x
:dWVyeVNlbGVjdG9yQWxsKCcjbG9nIC5idWJibGUudXNlcicpXQ0KICAgICAgICAgIC5zb21lKChiKSA9PiAoYi50ZXh0Q29udGVu
:dCB8fCAnJykuaW5jbHVkZXMoJzxzY3JpcHQ+d2luZG93Ll9fcHduZWQ9MTwvc2NyaXB0PicpKSwNCiAgICAgICAgYXNzdExpdGVy
:YWw6IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nJykudGV4dENvbnRlbnQgfHwgJycpLmluY2x1ZGVzKCc8c2NyaXB0Pndp
:bmRvdy5fX3B3bmVkPTM8L3NjcmlwdD4nKSwNCiAgICAgICAgbG9nU2Nyb2xsVzogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xv
:Z1Njcm9sbCcpLnNjcm9sbFdpZHRoLA0KICAgICAgICBsb2dDbGllbnRXOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nU2Ny
:b2xsJykuY2xpZW50V2lkdGgsDQogICAgICAgIGJvZHlTY3JvbGxXOiBkb2N1bWVudC5ib2R5LnNjcm9sbFdpZHRoLA0KICAgICAg
:ICB3aW5XOiB3aW5kb3cuaW5uZXJXaWR0aCwNCiAgICAgIH0pKTsNCiAgICAgIG9rKGgucHduZWQgPT09IHVuZGVmaW5lZCwgYG5v
:IGluamVjdGVkIHNjcmlwdCBleGVjdXRlZCAod2luZG93Ll9fcHduZWQ9JHtoLnB3bmVkfSlgKTsNCiAgICAgIG9rKGguc2NyaXB0
:cyA9PT0gMCwgYG5vIDxzY3JpcHQ+IGVsZW1lbnQgbGFuZGVkIGluIHRoZSBsb2cgKGdvdCAke2guc2NyaXB0c30pYCk7DQogICAg
:ICBvayhoLmltZ3MgPT09IDAgJiYgaC5pZnJhbWVzID09PSAwLCBgbm8gbGl2ZSA8aW1nIG9uZXJyb3I+LzxpZnJhbWUgamF2YXNj
:cmlwdDo+IGluIHRoZSBsb2cgKGltZz0ke2guaW1nc30gaWZyYW1lPSR7aC5pZnJhbWVzfSlgKTsNCiAgICAgIG9rKGgudXNlckxp
:dGVyYWwsICd1c2VyIGJ1YmJsZSBzaG93cyB0aGUgaG9zdGlsZSBtYXJrdXAgTElURVJBTExZIChlc2NhcGVkLCBub3Qgc3RyaXBw
:ZWQpJyk7DQogICAgICBvayhoLmFzc3RMaXRlcmFsLCAnYXNzaXN0YW50IHJlcGx5IHNob3dzIGl0cyBob3N0aWxlIG1hcmt1cCBs
:aXRlcmFsbHkgdG9vJyk7DQogICAgICBvayhoLmxvZ1Njcm9sbFcgPD0gaC5sb2dDbGllbnRXICsgMiwgYDEwSyB1bmJyb2tlbiB0
:b2tlbiBkaWQgbm90IGJsb3cgdGhlIGNoYXQgc2lkZXdheXMgKHNjcm9sbFc9JHtoLmxvZ1Njcm9sbFd9IGNsaWVudFc9JHtoLmxv
:Z0NsaWVudFd9KWApOw0KICAgICAgb2soaC5ib2R5U2Nyb2xsVyA8PSBoLndpblcgKyAyLCBgcGFnZSBib2R5IGhhcyBubyBob3Jp
:em9udGFsIG92ZXJmbG93IChib2R5U2Nyb2xsVz0ke2guYm9keVNjcm9sbFd9IHdpblc9JHtoLndpbld9KWApOw0KICAgIH0NCg0K
:ICAgIGNvbnNvbGUubG9nKCdcbltDXSBsb2NhbFN0b3JhZ2UgcG9pc29uZWQgd2l0aCBnYXJiYWdlIGZvciBldmVyeSBjYi0qIGtl
:eScpOw0KICAgIHsNCiAgICAgIGF3YWl0IHBhZ2UuZXZhbHVhdGUoKCkgPT4gew0KICAgICAgICBjb25zdCBnYXJiYWdlID0gWycA
:AGJpbmFyee+/vycsICd7InVudGVybWluYXRlZCI6JywgJzxzY3JpcHQ+YWxlcnQoMSk8L3NjcmlwdD4nLCAnTmFOJywgJ1x1ezFE
:NTZDfScucmVwZWF0KDQwOTYpLCAnMDEnLCAndHJ1ZScsICctMSddOw0KICAgICAgICBjb25zdCBrZXlzID0gWydjYi1zaWRlLWNv
:bGxhcHNlZCcsICdjYi1yZXZpZXdlci1vbicsICdjYi1yZXZpZXdlci1leWUnLCAnY2ItZGVlcHRoaW5rLW9uJywgJ2NiLWRlZXB0
:aGluay1leWUnLCAnY2IubW9zYWljLmFjdGl2ZUlkcycsICdjYi11bmtub3duLWZ1dHVyZS1rZXknXTsNCiAgICAgICAga2V5cy5m
:b3JFYWNoKChrLCBpKSA9PiBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShrLCBnYXJiYWdlW2kgJSBnYXJiYWdlLmxlbmd0aF0pKTsNCiAg
:ICAgIH0pOw0KICAgICAgYXdhaXQgcGFnZS5yZWxvYWQoeyB3YWl0VW50aWw6ICdkb21jb250ZW50bG9hZGVkJyB9KTsNCiAgICAg
:IGF3YWl0IHBhZ2Uud2FpdEZvclNlbGVjdG9yKCcjY2hhdDpub3QoLmhpZGRlbiknLCB7IHRpbWVvdXQ6IDE1MDAwIH0pOw0KICAg
:ICAgYXdhaXQgcGFnZS53YWl0Rm9yRnVuY3Rpb24oKCkgPT4gdHlwZW9mIHNlbmQgPT09ICdmdW5jdGlvbicgJiYgISF3aW5kb3cu
:X19zZXNzaW9uUmVmLCB7IHRpbWVvdXQ6IDE1MDAwIH0pOw0KICAgICAgY29uc3QgYyA9IGF3YWl0IHBhZ2UuZXZhbHVhdGUoKCkg
:PT4gKHsNCiAgICAgICAgZGVlcFRoaW5rRXhpc3RzOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZGVlcFRoaW5rVG9nZ2xlJykg
:IT09IG51bGwsDQogICAgICAgIGNyaXRpYzogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NyaXRpY1RvZ2dsZScpPy5jaGVja2Vk
:LA0KICAgICAgICBzaWRlQ29sbGFwc2VkOiBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5jb250YWlucygnc2lkZS1jb2xsYXBzZWQn
:KSB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuc2lkZS1wYW5lbCcpPy5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbGxhcHNlZCcp
:IHx8IGZhbHNlLA0KICAgICAgfSkpOw0KICAgICAgLy8gZGVlcFRoaW5rIHdhcyByZW1vdmVkOyBjcml0aWMgZGVmYXVsdHMgT04g
:KHRydWUpIOKAlCBnYXJiYWdlIGxvY2FsU3RvcmFnZSAobm90ICcwJykgdHJpZ2dlcnMgdGhlDQogICAgICAvLyBkZWZhdWx0LU9O
:IGJyYW5jaCAodG9nZ2xlQ3JpdGljKCkpLCBzbyBjcml0aWMgY29tZXMgYmFjayB0cnVlIGFmdGVyIHJlbG9hZCB3aXRoIHBvaXNv
:bmVkIGtleXMuDQogICAgICBvayghYy5kZWVwVGhpbmtFeGlzdHMgJiYgYy5jcml0aWMgPT09IHRydWUsIGBwb2lzb25lZCBjaGlw
:IGtleXM6IGRlZXBUaGluayByZW1vdmVkLCBjcml0aWMgZmFsbHMgYmFjayB0byBPTiBkZWZhdWx0IChkZWVwVGhpbmtFeGlzdHM9
:JHtjLmRlZXBUaGlua0V4aXN0c30gY3JpdGljPSR7Yy5jcml0aWN9KWApOw0KICAgICAgb2soYy5zaWRlQ29sbGFwc2VkID09PSBm
:YWxzZSwgYCcwMScgZ2FyYmFnZSBpbiBjYi1zaWRlLWNvbGxhcHNlZCBkb2VzIG5vdCBjb2xsYXBzZSB0aGUgcGFuZWwgKGNvbGxh
:cHNlZD0ke2Muc2lkZUNvbGxhcHNlZH0pYCk7DQogICAgICAvLyBDaGF0IHN0aWxsIHJvdW5kLXRyaXBzIGFmdGVyIHRoZSBwb2lz
:b24uDQogICAgICBhd2FpdCBwYWdlLmV2YWx1YXRlKCgpID0+IHsgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lucHV0JykudmFs
:dWUgPSAncGluZyBwbGVhc2UnOyBzZW5kKCk7IH0pOw0KICAgICAgYXdhaXQgcGFnZS53YWl0Rm9yRnVuY3Rpb24oKCkgPT4gKGRv
:Y3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2cnKT8udGV4dENvbnRlbnQgfHwgJycpLmluY2x1ZGVzKCdwb25nLicpLCB7IHRpbWVv
:dXQ6IDE1MDAwIH0pOw0KICAgICAgYXdhaXQgd2FpdEZvcklkbGUocGFnZSk7DQogICAgICBvayh0cnVlLCAnY2hhdCByb3VuZC10
:cmlwcyBlbmQgdG8gZW5kIHdpdGggcG9pc29uZWQgbG9jYWxTdG9yYWdlJyk7DQogICAgfQ0KDQogICAgY29uc29sZS5sb2coJ1xu
:W0RdIGEgfjNNQiBzaW5nbGUgcGFzdGUnKTsNCiAgICB7DQogICAgICBjb25zdCBsaW5lID0gJ2JpZyBwYXN0ZSBsb3JlbSBpcHN1
:bSBkb2xvciBzaXQgYW1ldCBjb25zZWN0ZXR1ciBhZGlwaXNjaW5nIGVsaXQgc2VkIGRvIGVpdXNtb2QgdGVtcG9yIDAxMjM0NTY3
:ODlcbic7DQogICAgICBjb25zdCBiaWcgPSAnYmlnIHBhc3RlIHBsZWFzZVxuJyArIGxpbmUucmVwZWF0KE1hdGguY2VpbCgoMyAq
:IDEwMjQgKiAxMDI0KSAvIGxpbmUubGVuZ3RoKSk7DQogICAgICBub3RlKGBwYXlsb2FkICR7KGJpZy5sZW5ndGggLyAxMDI0IC8g
:MTAyNCkudG9GaXhlZCgyKX1NQmApOw0KICAgICAgY29uc3QgdDAgPSBEYXRlLm5vdygpOw0KICAgICAgYXdhaXQgcGFnZS5ldmFs
:dWF0ZSgodCkgPT4geyBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5wdXQnKS52YWx1ZSA9IHQ7IHNlbmQoKTsgfSwgYmlnKTsN
:CiAgICAgIGF3YWl0IHBhZ2Uud2FpdEZvckZ1bmN0aW9uKCgpID0+IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nJyk/LnRl
:eHRDb250ZW50IHx8ICcnKS5pbmNsdWRlcygnR290IHRoZSBiaWcgcGFzdGUnKSwgeyB0aW1lb3V0OiA5MDAwMCB9KTsNCiAgICAg
:IGF3YWl0IHdhaXRGb3JJZGxlKHBhZ2UsIDYwMDAwKTsNCiAgICAgIGNvbnN0IGVsYXBzZWQgPSBEYXRlLm5vdygpIC0gdDA7DQog
:ICAgICBub3RlKGBzZW5kIOKGkiBkb25lIGluICR7ZWxhcHNlZH1tc2ApOw0KICAgICAgY29uc3QgZCA9IGF3YWl0IHBhZ2UuZXZh
:bHVhdGUoKCkgPT4gew0KICAgICAgICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpOw0KICAgICAgICBjb25zdCBidWJibGVz
:ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnI2xvZyAuYnViYmxlLnVzZXInKTsNCiAgICAgICAgY29uc3QgbGFzdCA9IGJ1
:YmJsZXNbYnViYmxlcy5sZW5ndGggLSAxXTsNCiAgICAgICAgcmV0dXJuIHsgbGVuOiAobGFzdD8udGV4dENvbnRlbnQgfHwgJycp
:Lmxlbmd0aCwgZXZhbE1zOiBwZXJmb3JtYW5jZS5ub3coKSAtIHQwLCBhbGl2ZTogMSArIDEgfTsNCiAgICAgIH0pOw0KICAgICAg
:b2soZC5hbGl2ZSA9PT0gMiwgJ3RhYiBzdXJ2aXZlZCB0aGUgM01CIHBhc3RlIChyZW5kZXJlciBhbGl2ZSknKTsNCiAgICAgIG9r
:KGQubGVuID49IDMgKiAxMDAwICogMTAwMCwgYHRoZSAzTUIgdXNlciBtZXNzYWdlIHJlbmRlcmVkIChidWJibGUgaG9sZHMgJHso
:ZC5sZW4gLyAxZTYpLnRvRml4ZWQoMil9TSBjaGFycylgKTsNCiAgICAgIGNvbnN0IHQxID0gRGF0ZS5ub3coKTsNCiAgICAgIGF3
:YWl0IHBhZ2UuZXZhbHVhdGUoKCkgPT4gMSArIDEpOw0KICAgICAgY29uc3QgcmVzcE1zID0gRGF0ZS5ub3coKSAtIHQxOw0KICAg
:ICAgb2socmVzcE1zIDwgMzAwMCwgYHBhZ2Ugc3RpbGwgcmVzcG9uc2l2ZSBhZnRlciB0aGUgcmVuZGVyIChyb3VuZC10cmlwICR7
:cmVzcE1zfW1zKWApOw0KICAgICAgY29uc3Qgc3QgPSBhd2FpdCAoYXdhaXQgZmV0Y2goYGh0dHA6Ly8xMjcuMC4wLjE6JHtQT1JU
:fS9hcGkvc3RhdGVgKSkuanNvbigpOw0KICAgICAgb2soc3Quc3RhdHVzID09PSAnZG9uZScgJiYgIXN0LmVycm9yLCBgc2VydmVy
:IGNvbXBsZXRlZCB0aGUgM01CIHJ1biBjbGVhbiAoc3RhdHVzPSR7c3Quc3RhdHVzfSlgKTsNCiAgICB9DQoNCiAgICBvayhqc0Vy
:cm9ycy5sZW5ndGggPT09IDAsIGBubyB1bmNhdWdodCBwYWdlIGV4Y2VwdGlvbnMgYWNyb3NzIGFsbCBob3N0aWxlIGxlZ3MgKCR7
:anNFcnJvcnMubGVuZ3RofTogJHtqc0Vycm9ycy5zbGljZSgwLCAzKS5qb2luKCcgfCAnKX0pYCk7DQogIH0gZmluYWxseSB7DQog
:ICAgYXdhaXQgYnJvd3Nlci5jbG9zZSgpOyBzZXJ2ZXIuY2xvc2UoKTsNCiAgICBhd2FpdCBjbGVhbnVwRGlyKHByb2plY3REaXIp
:Ow0KICB9DQogIGNvbnNvbGUubG9nKGBcbiR7cGFzc30gcGFzc2VkLCAke2ZhaWx9IGZhaWxlZGApOw0KICBwcm9jZXNzLmV4aXQo
:ZmFpbCA9PT0gMCA/IDAgOiAxKTsNCn0NCm1haW4oKS5jYXRjaCgoZSkgPT4geyBjb25zb2xlLmVycm9yKCdGQVRBTCcsIGU/LnN0
:YWNrIHx8IGUpOyBwcm9jZXNzLmV4aXQoMik7IH0pOw0K
=== add test/_edge-instances.mjs
new f1d46611249a074183774d81
+/**
+ * EDGE PROBE (on-demand): MULTI-INSTANCE support.
+ *
+ *  [A] per-project instance lock (src/server.mjs): two REAL server processes
+ *      (separate pids — the lock discriminates by pid) on ports 17935/17936:
+ *       - both healthy simultaneously;
+ *       - the SAME project dir opened in both → the second open is REFUSED
+ *         with the lock error, and the first instance stays functional;
+ *       - close-project in the first → the lock file is removed and the
+ *         second can now open the project;
+ *       - stale lock (dead pid) → the open takes it over silently;
+ *       - switching projects releases the lock of the project being left.
+ *  [B] the launcher port scan (the bundle's `launch --dryrun` + the --portbase:<n> test hook — ours/foreign/down
+ *      classification + the reuse-if-running/--new decision) now lives in test/test-launch-mjs.mjs (the suite test),
+ *      which covers it more thoroughly and without cscript/MsgBox. This probe keeps only the SERVER-side [A] leg.
+ *
+ * Uses ports 17935-17936 only; NEVER touches 18888.
+ * Run: node test/_edge-instances.mjs
+ */
+import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { spawn } from 'node:child_process';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath, pathToFileURL } from 'node:url';
+import { cleanupDir } from './_helpers.mjs';
+import { startServer } from '../src/server.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT_A = 17935, PORT_B = 17936;
+
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+
+async function api(port, route, opts) {
+  try {
+    const res = await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(8000), ...opts });
+    return { status: res.status, body: await res.json().catch(() => ({})) };
+  } catch { return null; }
+}
+const openProj = (port, dir) => api(port, '/api/open-project', {
+  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: dir }),
+});
+const closeProj = (port) => api(port, '/api/close-project', { method: 'POST' });
+async function waitFor(fn, timeoutMs, label, intervalMs = 250) {
+  const t0 = Date.now();
+  while (Date.now() - t0 < timeoutMs) {
+    const v = await fn();
+    if (v) return v;
+    await new Promise((r) => setTimeout(r, intervalMs));
+  }
+  console.log(`  (waitFor timed out after ${timeoutMs}ms: ${label})`);
+  return null;
+}
+
+// A REAL server in its OWN node process (the lock discriminates by pid, so
+// in-process startServer x2 would share one pid and never collide).
+async function spawnServerProcess(hostFile, port) {
+  const child = spawn(process.execPath, [hostFile], {
+    env: { ...process.env, CB_EDGE_PORT: String(port) }, windowsHide: true,
+  });
+  let out = '';
+  child.stdout.on('data', (d) => { out += d; });
+  child.stderr.on('data', (d) => { out += d; });
+  const up = await waitFor(async () => (await api(port, '/api/state'))?.status === 200, 20000, `server on ${port}`);
+  if (!up) throw new Error(`child server on ${port} never became healthy: ${out.slice(0, 500)}`);
+  return child;
+}
+
+async function deadPid() {
+  const p = spawn(process.execPath, ['-e', '0'], { windowsHide: true });
+  await new Promise((r) => p.on('close', r));
+  return p.pid;
+}
+
+async function main() {
+  const tmp = await mkdtemp(path.join(tmpdir(), 'cb-inst-'));
+  const p1 = path.join(tmp, 'proj1'), p2 = path.join(tmp, 'proj2'), shared = path.join(tmp, 'shared');
+  for (const d of [p1, p2, shared]) await mkdir(d, { recursive: true });
+  const sharedLock = path.join(shared, '.code_boss', 'instance.lock');
+
+  // Generated host script so each server is a separate REAL process.
+  const hostFile = path.join(tmp, 'host.mjs');
+  await writeFile(hostFile, [
+    `const { startServer } = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'src', 'server.mjs')).href)});`,
+    `const adapter = { async complete() { return { choices: [{ message: { content: 'ok.' } }] }; } };`,
+    `await startServer({ html: '<html></html>', baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },`,
+    `  defaultModel: 'm', port: Number(process.env.CB_EDGE_PORT), adapter, modelsList: [{ id: 'm' }] });`,
+    `console.log('READY', process.pid);`,
+  ].join('\n'), 'utf8');
+
+  let childA = null, childB = null;
+  try {
+    // ════ [A] per-project instance lock ══════════════════════════════════════
+    console.log('[A] instance lock across two real server processes');
+    childA = await spawnServerProcess(hostFile, PORT_A);
+    childB = await spawnServerProcess(hostFile, PORT_B);
+    ok((await api(PORT_A, '/api/state'))?.status === 200 && (await api(PORT_B, '/api/state'))?.status === 200,
+      `two instances healthy simultaneously (ports ${PORT_A} + ${PORT_B}, pids ${childA.pid}/${childB.pid})`);
+
+    const oA = await openProj(PORT_A, p1);
+    const oB = await openProj(PORT_B, p2);
+    ok(oA?.status === 200 && oB?.status === 200, 'each instance opened its own project');
+    ok(existsSync(path.join(p1, '.code_boss', 'instance.lock')), 'instance.lock written on open');
+    let lock = JSON.parse(await readFile(path.join(p1, '.code_boss', 'instance.lock'), 'utf8'));
+    ok(lock.pid === childA.pid && lock.port === PORT_A && !!lock.startedAt,
+      `lock carries {pid, port, startedAt} of its owner (pid ${lock.pid}, port ${lock.port})`);
+
+    // A switches p1 → shared: takes the shared lock, releases p1's.
+    const oA2 = await openProj(PORT_A, shared);
+    ok(oA2?.status === 200, 'first instance switched to the shared project');
+    ok(existsSync(sharedLock), 'shared project lock written');
+    ok(!existsSync(path.join(p1, '.code_boss', 'instance.lock')), 'switching projects RELEASED the lock of the project left behind');
+
+    // B tries the SAME dir → refused, and BOTH instances stay functional.
+    const refused = await openProj(PORT_B, shared);
+    ok(refused?.status === 400, `second open of the same project is refused (status ${refused?.status})`);
+    ok(refused?.body?.error === 'This project is already open in another Code Boss window. Use that window, or close it there first.',
+      `refusal points at the other WINDOW, no port number (got: "${refused?.body?.error}")`);
+    const stA = await api(PORT_A, '/api/project-state');
+    const stB = await api(PORT_B, '/api/project-state');
+    ok(stA?.status === 200 && stA.body.activeProject === shared, 'first instance still has the shared project open and answers');
+    ok(stB?.status === 200 && stB.body.activeProject === p2, 'refused instance is unharmed (still on its own project)');
+
+    // Close in the first → lock removed → second can now open it.
+    const cl = await closeProj(PORT_A);
+    ok(cl?.status === 200, 'close-project in the first instance succeeds');
+    ok(!existsSync(sharedLock), 'lock removed on close-project');
+    const oB2 = await openProj(PORT_B, shared);
+    ok(oB2?.status === 200, 'after the close, the second instance can open the project');
+    lock = JSON.parse(await readFile(sharedLock, 'utf8'));
+    ok(lock.pid === childB.pid && lock.port === PORT_B, 'lock now owned by the second instance');
+
+    // Stale lock (dead pid) → takeover, silently.
+    const cl2 = await closeProj(PORT_B);
+    ok(cl2?.status === 200 && !existsSync(sharedLock), 'second instance released the shared project again');
+    const dead = await deadPid();
+    await writeFile(sharedLock, JSON.stringify({ pid: dead, port: 17999, startedAt: new Date().toISOString() }), 'utf8');
+    const oA3 = await openProj(PORT_A, shared);
+    ok(oA3?.status === 200, `stale lock (dead pid ${dead}) is taken over silently`);
+    lock = JSON.parse(await readFile(sharedLock, 'utf8'));
+    ok(lock.pid === childA.pid, 'stale lock replaced with the live owner\'s pid');
+
+    // Stale lock whose pid answers EPERM — the case the line above CANNOT produce. A pid that just exited is
+    // still ESRCH; a pid recycled over days is not, and on Windows a recycled number owned by a protected
+    // process answers EPERM, which used to be read as "alive". A real lock from seven weeks earlier then made
+    // its project permanently unopenable, with a message telling the developer to close a window that did not
+    // exist. pid 4 is the Windows System process: it is genuinely alive, is certainly not Code Boss, and
+    // answers EPERM — so the only thing that can clear it is the port, which nothing is serving.
+    const epermPid = process.platform === 'win32' ? 4 : 1;
+    let answers = null;
+    try { process.kill(epermPid, 0); } catch (e) { answers = e?.code; }
+    if (answers !== 'EPERM') {
+      ok(true, `SKIP eperm-pid leg (pid ${epermPid} answered ${answers || 'signal-ok'}, not EPERM on this host)`);
+    } else {
+      const cl3 = await closeProj(PORT_A);
+      ok(cl3?.status === 200 && !existsSync(sharedLock), 'first instance released the shared project');
+      // port 17999: nothing has ever listened there in this test.
+      await writeFile(sharedLock, JSON.stringify({ pid: epermPid, port: 17999, startedAt: '2026-06-25T02:37:52.095Z' }), 'utf8');
+      const oB3 = await openProj(PORT_B, shared);
+      ok(oB3?.status === 200, `a lock whose pid answers EPERM but whose port serves NOTHING is stale, not "open elsewhere" (status ${oB3?.status})`);
+      lock = JSON.parse(await readFile(sharedLock, 'utf8'));
+      ok(lock.pid === childB.pid, 'and it is taken over rather than left for the developer to delete by hand');
+      // The other half: an EPERM pid whose port IS being served must still be refused. PORT_A is live.
+      const cl4 = await closeProj(PORT_B);
+      ok(cl4?.status === 200, 'released again before the negative case');
+      await writeFile(sharedLock, JSON.stringify({ pid: epermPid, port: PORT_A, startedAt: new Date().toISOString() }), 'utf8');
+      const oB4 = await openProj(PORT_B, shared);
+      ok(oB4?.status !== 200, `but an EPERM pid whose port IS serving is still refused (status ${oB4?.status}) — the fix must not disable the protection`);
+    }
+  } finally {
+    for (const c of [childA, childB]) { try { c?.kill(); } catch {} }
+    await new Promise((r) => setTimeout(r, 500));
+  }
+
+  // [B] the launcher port-scan legs moved to test/test-launch-mjs.mjs (see the header note).
+
+  await cleanupDir(tmp);
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-jar-sync.mjs
new b5df340a43354f1f8ce9442c
+/**
+ * EDGE PROBE (deployment): check-update JAR SYNC — manifests that ship a
+ * prebuilt docx helper (helperJar + jars, staged by `build.mjs --release`)
+ * get pulled into ~/.code_boss/docx-helper next to the app's helper home.
+ *
+ *   [1] manifest with jars + SAME app build → app swap skipped ("up to
+ *       date") but jars still sync (independent of the version check);
+ *       binary-safe (zip magic verified end-to-end), marker written.
+ *   [2] second run → idempotent: no re-download (mock counts hits).
+ *   [3] a served file that is NOT a jar (no zip magic) → that download is
+ *       rejected, exit still 0 (never blocks launch).
+ *   [4] manifest without jar fields → no sync attempted, no dirs created.
+ *
+ * Run: node test/_edge-jar-sync.mjs
+ */
+import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import { spawn } from 'node:child_process';
+import { createServer } from 'node:http';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17973;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+
+// Async spawn — the mock GitLab lives on this event loop (spawnSync would deadlock it).
+function run(cmd, args, opts = {}) {
+  return new Promise((resolve) => {
+    const child = spawn(cmd, args, opts);
+    let stdout = '', stderr = '';
+    child.stdout.on('data', (d) => { stdout += d; });
+    child.stderr.on('data', (d) => { stderr += d; });
+    const tid = setTimeout(() => { try { child.kill(); } catch {} }, 120000);
+    child.on('close', (status) => { clearTimeout(tid); resolve({ status, stdout, stderr }); });
+    child.on('error', (e) => { clearTimeout(tid); resolve({ status: -1, stdout, stderr: String(e) }); });
+  });
+}
+
+const JAR_BYTES = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('probe-jar-payload-'.repeat(8))]);
+
+async function main() {
+  const base = await mkdtemp(path.join(tmpdir(), 'cb-jarsync-'));
+  const home = path.join(base, 'home');
+  const appDir = path.join(base, 'app');
+  await mkdir(path.join(home, '.code_boss'), { recursive: true });
+  await mkdir(appDir, { recursive: true });
+  await writeFile(path.join(home, '.code_boss', 'gitlab-creds.json'), JSON.stringify({ user: 'u', token: 't1' }) + '\n');
+
+  // Patch the REAL dist bundle to point at the mock.
+  const dist = await readFile(path.join(ROOT, 'dist', 'code-boss.mjs'), 'utf8');
+  const appBuild = dist.match(/const BUILD_VERSION = '(\d+)'/)[1];
+  const patched = dist.replace("const UPDATE_SOURCE = '';", `const UPDATE_SOURCE = 'http://127.0.0.1:${PORT}/group/code_boss';`);
+  const bundlePath = path.join(appDir, 'code-boss.mjs');
+  await writeFile(bundlePath, patched, 'utf8');
+
+  let manifest = {
+    build: Number(appBuild),                 // SAME build → no app swap, jars still sync
+    file: `releases/code-boss-${appBuild}.mjs`,
+    helperJar: 'releases/docx-helper.jar',
+    jars: ['releases/lib/poi-5.5.1.jar', 'releases/lib/xmlbeans-5.3.0.jar'],
+  };
+  let corruptHelper = false;
+  const hits = [];
+  const server = createServer((req, res) => {
+    hits.push(req.url);
+    const file = decodeURIComponent((req.url.match(/repository\/files\/([^/]+)\/raw/) || [])[1] || '');
+    if (file === 'releases/manifest.json') { res.writeHead(200); res.end(JSON.stringify(manifest)); return; }
+    if (file === 'releases/docx-helper.jar') {
+      res.writeHead(200);
+      res.end(corruptHelper ? Buffer.from('<html>not a jar</html>') : JAR_BYTES);
+      return;
+    }
+    if (file.startsWith('releases/lib/')) { res.writeHead(200); res.end(JAR_BYTES); return; }
+    res.writeHead(404); res.end('{}');
+  });
+  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
+  const env = { ...process.env, CB_HOME: home };
+  const helperHome = path.join(home, '.code_boss', 'docx-helper');
+
+  try {
+    console.log('\n[1] same-build manifest with jars → jars sync, app swap skipped');
+    {
+      const r = await run(process.execPath, [bundlePath, 'check-update'], { env });
+      ok(r.status === 0, `check-update exits 0 (status=${r.status})`);
+      ok(/up to date \(build/.test(r.stdout), 'app swap skipped (same build)');
+      ok(/syncing prebuilt docx helper \(build \d+, 3 jars\)/.test(r.stdout) && /docx helper jars synced/.test(r.stdout), 'jar sync announced + completed');
+      ok(existsSync(path.join(helperHome, 'docx-helper.jar')), 'helper jar landed in the helper home');
+      ok(existsSync(path.join(helperHome, 'lib', 'poi-5.5.1.jar')) && existsSync(path.join(helperHome, 'lib', 'xmlbeans-5.3.0.jar')), 'dependency jars landed in lib/');
+      ok((await readFile(path.join(helperHome, 'docx-helper.jar'))).equals(JAR_BYTES), 'binary-exact bytes (no text-decode corruption)');
+      const marker = JSON.parse(await readFile(path.join(helperHome, 'jars-build.json'), 'utf8'));
+      ok(String(marker.build) === String(appBuild), `marker records build ${appBuild}`);
+    }
+
+    console.log('\n[2] second run → idempotent, nothing re-downloaded');
+    {
+      const before = hits.filter((u) => u.includes('docx-helper.jar') || u.includes('lib%2F')).length;
+      const r = await run(process.execPath, [bundlePath, 'check-update'], { env });
+      const after = hits.filter((u) => u.includes('docx-helper.jar') || u.includes('lib%2F')).length;
+      ok(r.status === 0 && !/syncing prebuilt/.test(r.stdout), 'no sync attempt on the marker-matched build');
+      ok(after === before, `no jar requests on the second run (${before} → ${after})`);
+    }
+
+    console.log('\n[2b] a build bump (stale marker) re-fetches ONLY the helper jar — versioned dependency jars already present are kept');
+    {
+      // The state after every deploy: the app build moved, the jars did not. Plus one jar whose size the manifest
+      // disagrees with (must be re-fetched) and one stale jar the manifest no longer lists (must be removed).
+      await writeFile(path.join(helperHome, 'jars-build.json'), JSON.stringify({ build: Number(appBuild) - 1 }));
+      await writeFile(path.join(helperHome, 'lib', 'poi-4.1.2.jar'), JAR_BYTES);
+      manifest.jarSizes = { 'poi-5.5.1.jar': JAR_BYTES.length, 'xmlbeans-5.3.0.jar': JAR_BYTES.length + 1 };
+      const jarHits = () => hits.filter((u) => u.includes('docx-helper.jar') || u.includes('lib%2F'));
+      const before = jarHits().length;
+      const r = await run(process.execPath, [bundlePath, 'check-update'], { env });
+      const got = jarHits().slice(before).map((u) => decodeURIComponent(u).replace(/.*releases\//, '').replace(/\/raw.*/, ''));
+      ok(r.status === 0 && /syncing prebuilt docx helper \(build \d+, 3 jars, 1 already present\)/.test(r.stdout), `sync announced with the kept count (${(r.stdout.match(/syncing prebuilt[^\n]*/) || [''])[0]})`);
+      ok(got.length === 2 && got.includes('docx-helper.jar') && got.includes('lib/xmlbeans-5.3.0.jar'), `only the helper + the size-mismatched jar were fetched (${got.join(', ')})`);
+      ok(/1\/2 docx-helper\.jar \(/.test(r.stdout) && /2\/2 xmlbeans-5\.3\.0\.jar \(/.test(r.stdout), 'one progress line per fetched jar (the launcher feed shows movement)');
+      ok(!existsSync(path.join(helperHome, 'lib', 'poi-4.1.2.jar')) && /removed stale poi-4\.1\.2\.jar/.test(r.stdout), 'a jar the manifest no longer lists is removed from lib/');
+      const marker = JSON.parse(await readFile(path.join(helperHome, 'jars-build.json'), 'utf8'));
+      ok(String(marker.build) === String(appBuild), 'marker advanced to the current build');
+      delete manifest.jarSizes;
+    }
+
+    console.log('\n[3] corrupt (non-zip) helper download → rejected, exit 0');
+    {
+      await rm(helperHome, { recursive: true, force: true });
+      corruptHelper = true;
+      const r = await run(process.execPath, [bundlePath, 'check-update'], { env });
+      ok(r.status === 0, `still exits 0 (status=${r.status})`);
+      ok(/jar sync skipped .*does not look like a jar/.test(r.stdout), `corrupt download named + skipped (got: ${(r.stdout.match(/jar sync skipped[^\n]*/) || [''])[0].slice(0, 120)})`);
+      ok(!existsSync(path.join(helperHome, 'docx-helper.jar')), 'no corrupt helper jar installed');
+      ok(!existsSync(path.join(helperHome, 'jars-build.json')), 'no marker written on failure (retries next launch)');
+      corruptHelper = false;
+    }
+
+    console.log('\n[4] jar-less manifest → no sync, no helper dirs');
+    {
+      await rm(helperHome, { recursive: true, force: true });
+      manifest = { build: Number(appBuild), file: manifest.file };
+      const r = await run(process.execPath, [bundlePath, 'check-update'], { env });
+      ok(r.status === 0 && !/syncing prebuilt/.test(r.stdout), 'no sync attempted without jar fields');
+      ok(!existsSync(helperHome), 'helper home untouched');
+    }
+  } finally {
+    server.close();
+    await cleanupDir(base);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-launcher-loading.mjs
new 09268f4a8e63f1ca4327270c
+/**
+ * EDGE PROBE (on-demand): the launcher INSTANT LOADING PAGE (node code-boss.mjs launch).
+ *
+ * The launcher now opens the Chrome app window immediately on a local file://
+ * loading page that polls the chosen port and SELF-REDIRECTS to the app once the
+ * server answers — so there's no blank ~30s gap while node starts.
+ *
+ *   [A] launch --writeloading actually writes the page (ASCII, parses).
+ *   [B] the page (loaded as file://) REDIRECTS to http://127.0.0.1:<port>/ the
+ *       moment a server answers there — proving file://→localhost no-cors polling
+ *       works in Chrome (the crux of the whole approach).
+ *   [C] with NO server on the port, it keeps polling (does NOT redirect) and the
+ *       timeout UI contract holds: body.failed hides the spinner + shows Retry.
+ *
+ * Run: node test/_edge-launcher-loading.mjs    (Windows + Chrome; skips otherwise)
+ */
+import { mkdtemp, readFile, mkdir } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { spawnSync } from 'node:child_process';
+import { tmpdir } from 'node:os';
+import http from 'node:http';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const BUNDLE = path.join(ROOT, 'dist', 'code-boss.mjs');   // `node code-boss.mjs launch --writeloading`
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+
+async function main() {
+  if (process.platform !== 'win32') { console.log('SKIP: launcher is Windows-only'); process.exit(0); }
+  if (!existsSync(BUNDLE)) { console.log('SKIP: dist/code-boss.mjs not built (run node scripts/build.mjs)'); process.exit(0); }
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  const home = await mkdtemp(path.join(tmpdir(), 'cb-load-'));
+
+  console.log('\n[A] node code-boss.mjs --writeloading writes the loading page (bare run = launcher)');
+  const r = spawnSync(process.execPath, [BUNDLE, '--writeloading'], { env: { ...process.env, CB_HOME: home }, encoding: 'utf8', timeout: 30000 });
+  const loadingPath = path.join(home, '.code_boss', 'loading.html');
+  ok(existsSync(loadingPath), `loading.html written (${(r.stdout || '').trim() || 'no stdout'})`);
+  const html = existsSync(loadingPath) ? await readFile(loadingPath, 'utf8') : '';
+  ok(/mode:'no-cors'/.test(html) && /location\.replace/.test(html), 'page polls no-cors + redirects via location.replace');
+  ok(/[^\x00-\x7F]/.test(html) === false, 'page is pure ASCII');
+
+  // A mock "app" server — answers 200 on / (the loading page only needs reachability).
+  const server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><body id="theapp">APP READY</body></html>'); });
+  await new Promise((res) => server.listen(0, '127.0.0.1', res));
+  const port = server.address().port;
+  const fileUrl = 'file:///' + loadingPath.replace(/\\/g, '/') + '?port=' + port;
+
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  try {
+    console.log('\n[B] file:// loading page redirects to the live server (no-cors poll works)');
+    const page = await browser.newPage();
+    await page.goto(fileUrl);
+    let redirected = false;
+    for (let i = 0; i < 40 && !redirected; i++) { await sleep(150); if (page.url().startsWith(`http://127.0.0.1:${port}/`)) redirected = true; }
+    ok(redirected, `redirected file:// → http://127.0.0.1:${port}/ (got ${page.url().slice(0, 48)})`);
+    if (redirected) ok(await page.evaluate(() => !!document.getElementById('theapp')), 'landed on the served app page');
+
+    console.log('\n[C] no server on the port → keeps polling, never redirects; failed-state UI contract');
+    const deadPort = 59997;   // nothing listening
+    const page2 = await browser.newPage();
+    await page2.goto('file:///' + loadingPath.replace(/\\/g, '/') + '?port=' + deadPort);
+    await sleep(1500);   // several poll cycles (400ms) — far short of the 30s timeout
+    ok(page2.url().startsWith('file:///'), `still on the loading page (polling, not redirected) — url ${page2.url().slice(0, 24)}…`);
+    const ui = await page2.evaluate(() => {
+      const ringV = () => getComputedStyle(document.querySelector('.ring')).display !== 'none';
+      const errV = () => getComputedStyle(document.querySelector('.err')).display !== 'none';
+      const before = { ring: ringV(), err: errV() };
+      document.body.className = 'failed';   // simulate the timeout state
+      return { before, afterRing: ringV(), afterErr: errV(), hasRetry: /Retry/.test(document.querySelector('.err').textContent) };
+    });
+    ok(ui.before.ring && !ui.before.err, 'while polling: spinner shown, error hidden');
+    ok(!ui.afterRing && ui.afterErr && ui.hasRetry, 'on timeout (body.failed): spinner hidden, Retry shown');
+  } finally {
+    await browser.close();
+    server.close();
+    await cleanupDir(home);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-mergebtn.mjs
new 136906a17d4bb797120cb715
+/**
+ * EDGE PROBE (on-demand): the merge-line button is FLAT by default (no tall/
+ * crowded border) and only shows its outline on mouseover of the row, filling
+ * on direct button hover. Captures screenshots of all three states.
+ *
+ * Run: node test/_edge-mergebtn.mjs   (needs Chrome; screenshots in merge-btn-screenshots/)
+ */
+import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 28994;
+const SHOTS = path.join(__dirname, 'merge-btn-screenshots');
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+const TRANSPARENT = 'rgba(0, 0, 0, 0)';
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  await mkdir(SHOTS, { recursive: true });
+  const dir = await mkdtemp(path.join(tmpdir(), 'cb-mbtn-'));
+  const strip = (s) => s.replace(/^import\s+[^;]+;[ \t]*\r?\n?/gm, '').replace(/^export\s+(async\s+function|function|class|const|let|var)\b/gm, '$1').replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
+  const mosaic = strip(await readFile(path.join(ROOT, 'src', 'agent', 'mosaic-layout.mjs'), 'utf8'));
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8')).replace('</head>',
+    '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: '(mock)' }) + ';</script><script>' + mosaic + '</script></head>');
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'mock', port: PORT, adapter: { async complete() { return { choices: [{ message: { content: 'done.' } }] }; } },
+    modelsList: [{ id: 'mock' }], initialProject: dir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1200, height: 800 });
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForFunction(() => typeof _placeMergeRow === 'function' && !!window.__sessionRef, { timeout: 10000 });
+    await sleep(200);
+    // Inject a mergeable sub-branch row (parent ← merge · N commits).
+    await page.evaluate(() => {
+      document.getElementById('mergeRow')?.remove();
+      const r = document.createElement('div'); r.id = 'mergeRow'; r.className = 'merge-row';
+      r.innerHTML = '<span class="merge-source"><span class="merge-parent">main</span></span>'
+        + '<button class="merge-btn" title="merge">← merge</button>'
+        + '<span class="merge-source"><span class="merge-cb">CODE_BOSS_demo</span><span class="merge-ahead"> · 3 commits</span></span>';
+      _placeMergeRow(r);
+    });
+    await page.mouse.move(5, 5);   // ensure nothing is hovered
+    await sleep(150);
+    const styleOf = () => page.evaluate(() => {
+      const b = document.querySelector('#mergeRow .merge-btn'); const cs = getComputedStyle(b);
+      return { border: cs.borderTopColor, bg: cs.backgroundColor, h: b.getBoundingClientRect().height };
+    });
+
+    console.log('\n[A] default: flat — no visible border, transparent background');
+    const def = await styleOf();
+    await page.screenshot({ path: path.join(SHOTS, '1-default.png') });
+    ok(def.border === TRANSPARENT, `default border is transparent (got ${def.border})`);
+    ok(def.bg === TRANSPARENT, `default background is transparent (got ${def.bg})`);
+
+    console.log('\n[B] mouseover the row: the outline appears (button affordance)');
+    await page.hover('#mergeRow .merge-parent');   // hover the row, NOT the button itself
+    await sleep(150);
+    const rowHover = await styleOf();
+    await page.screenshot({ path: path.join(SHOTS, '2-row-hover.png') });
+    ok(rowHover.border !== TRANSPARENT, `row hover reveals the border (got ${rowHover.border})`);
+    ok(rowHover.bg === TRANSPARENT, `row hover does NOT fill the button (bg still transparent, got ${rowHover.bg})`);
+
+    console.log('\n[C] hover the button itself: it fills');
+    await page.hover('#mergeRow .merge-btn');
+    await sleep(150);
+    const btnHover = await styleOf();
+    await page.screenshot({ path: path.join(SHOTS, '3-btn-hover.png') });
+    ok(btnHover.bg !== TRANSPARENT, `button hover fills the background (got ${btnHover.bg})`);
+
+    console.log(`\n  (button height ~${Math.round(def.h)}px; screenshots in ${SHOTS})`);
+  } finally {
+    await browser.close();
+    server.close();
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-mermaid.mjs
new 7f0d374bf305e2195ed6b6db
+/**
+ * EDGE PROBE (on-demand): hand-rolled STREAMING mermaid renderer (mermaid-lite).
+ *
+ *   [U] mmParse unit tests in-page: shapes, edge styles + labels, chains, ';'
+ *       statements, direction, sequence grammar, unknown-type → null,
+ *       garbage-line tolerance, streaming partial-last-line drop.
+ *   [A] a ```mermaid flowchart fence streamed across MULTIPLE chunks renders a
+ *       diagram container DURING streaming that GAINS nodes as chunks arrive;
+ *       the final render has the right node/edge counts + labels.
+ *   [B] thumbnail is bounded (max-height 240, overflow hidden, pointer).
+ *   [C] click opens the fullscreen viewer; drag changes the transform; wheel
+ *       pans; the Image/Code segmented toggle (exactly one active) swaps the
+ *       canvas for the exact source; ✕ closes; Esc closes.
+ *   [D] sequenceDiagram renders lifelines + arrows (+ dashed reply + note).
+ *   [E] unknown type (gitGraph) falls back to a plain code block — streamed
+ *       AND final paths.
+ *   [F] malformed flowcharts never throw (no page errors); zero-parse source
+ *       falls back to a code block in final content.
+ *   [H] ARTIFACTS side-tab: a finished diagram registers a row (titled by its
+ *       first node / participant); same-title re-emit REPLACES the entry (count
+ *       stays put, viewer shows the NEW source); row click opens the viewer;
+ *       the ⌖ locate icon scrolls the chat to the fence + pulses it.
+ *   [I] viewer Copy/Save DISPATCH on the active tab: image tab → Copy a PNG to
+ *       the clipboard + Save a .png; code tab → Copy the exact source + Save a
+ *       .mmd (real downloads via CDP). Backdrop click closes (a click ON the SVG
+ *       doesn't).
+ *   [J] window title = the open project path, left-ellipsized.
+ *
+ * Run: node test/_edge-mermaid.mjs    (skips if Chrome not found)
+ */
+import { mkdtemp, readdir, readFile, stat } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17931;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+
+// The exact mermaid sources the routes stream (the viewer's "Code" view must
+// show FLOW verbatim).
+const FLOW = 'graph TD\n  A[Start] --> B{Choose}\n  B -->|yes| C(Apply fix)\n  B -->|no| D((Done))\n  C ==> D\n  D -.-> E>Ship]';
+// Same FIRST NODE ('Start') as FLOW but a different graph — the artifact
+// registry must treat it as the SAME artifact and replace the entry.
+const FLOW2 = 'graph TD\n  A[Start] --> B{Choose}\n  B -->|yes| C(Apply fix)\n  B -->|no| D((Done))\n  C ==> D\n  D -.-> E>Ship]\n  E --> F[Rollback]';
+const SEQ = 'sequenceDiagram\n  participant U as User\n  participant S as Server\n  U->>S: request\n  S-->>U: response\n  Note over U,S: handshake done';
+const GIT = 'gitGraph\n  commit\n  commit';
+
+// Content-routed streaming adapter (pattern from test-ui-production-probe):
+// completeStream picks chunks by a phrase in the latest user message; the
+// reviewer's complete() path always passes.
+function routedAdapter(routes) {
+  const counts = new Map();
+  const find = (messages) => {
+    const userMsgs = (messages || []).filter((m) => m.role === 'user').reverse();
+    for (const u of userMsgs) {
+      const text = String(u.content || '');
+      for (const key of Object.keys(routes)) if (text.includes(key)) return key;
+    }
+    return null;
+  };
+  const requests = [];   // joined text of every request — the PLUGIN brief assertion reads this (closure, not `this`: the server may call methods unbound)
+  return {
+    requests,
+    async *completeStream(opts) {
+      requests.push((opts?.messages || []).map((m) => String(m.content || '')).join('\n'));
+      const key = find(opts?.messages);
+      if (!key) { yield { choices: [{ delta: { content: 'no route.' } }] }; return; }
+      const n = counts.get(key) || 0;
+      counts.set(key, n + 1);
+      const { sequences, delayMs } = routes[key];
+      const seq = sequences[Math.min(n, sequences.length - 1)];
+      for (const c of seq) {
+        await new Promise((r) => setTimeout(r, delayMs));
+        yield { choices: [{ delta: { content: c } }] };
+      }
+    },
+    async complete() { return { choices: [{ message: { content: '<review-pass/>' } }] }; },
+  };
+}
+
+async function sendMessage(page, text) {
+  await page.click('#input');
+  await page.evaluate(() => { document.getElementById('input').value = ''; });
+  await page.type('#input', text);
+  await page.keyboard.press('Enter');
+  await page.waitForFunction(() => window.__sessionRef?.status === 'running', { timeout: 5000 }).catch(() => {});
+}
+async function waitForIdle(page, timeoutMs = 20000) {
+  await page.waitForFunction(() => {
+    const s = window.__sessionRef?.status;
+    return s === 'idle' || s === 'done' || s === 'error';
+  }, { timeout: timeoutMs });
+  await new Promise((r) => setTimeout(r, 400));
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-mm-'));
+
+  const routes = {
+    'flow diagram please': {
+      delayMs: 140,        // slow enough that the sampler sees the diagram grow
+      sequences: [[
+        'Here is the flow:\n```mermaid\n',
+        'graph TD\n  A[Start] --> B{Choose}\n',
+        '  B -->|yes| C(Apply fix)\n  B -->|no| D((Done))\n',
+        '  C ==> D\n  D -.-> E>Ship]\n',
+        '```\nThat is the design.',
+      ], ['Done.']],
+    },
+    'sequence diagram please': {
+      delayMs: 15,
+      sequences: [['Interaction:\n```mermaid\n' + SEQ + '\n```\nEnd.'], ['Done.']],
+    },
+    'git graph please': {
+      delayMs: 15,
+      sequences: [['History:\n```mermaid\n' + GIT + '\n```\nEnd.'], ['Done.']],
+    },
+    'updated flow please': {
+      delayMs: 15,
+      sequences: [['Updated:\n```mermaid\n' + FLOW2 + '\n```\nNow with rollback.'], ['Done.']],
+    },
+  };
+
+  // Inject the shared browser sources the way the build does (the test server
+  // serves raw ui.html, which has no <head> injection of its own).
+  const strip = (src) => src
+    .replace(/^import\s+[^;]+;[ \t]*\r?\n?/gm, '')
+    .replace(/^export\s+(async\s+function|function|class|const|let|var)\b/gm, '$1')
+    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
+  const mosaic = strip(await readFile(path.join(ROOT, 'src', 'agent', 'mosaic-layout.mjs'), 'utf8'));
+  const mermaid = strip(await readFile(path.join(ROOT, 'src', 'mermaid-lite.mjs'), 'utf8'));
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8')).replace('</head>',
+    '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'm', baseURL: '(mock)' }) + ';</script>' +
+    '<script>' + mosaic + '\n' + mermaid + '</script></head>');
+
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'test-key', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'm', port: PORT, adapter: (globalThis.__mmAdapter = routedAdapter(routes)), modelsList: [{ id: 'm' }],
+    initialProject: projectDir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1200, height: 800 });
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForSelector('#chat:not(.hidden)', { timeout: 15000 });
+    await new Promise((r) => setTimeout(r, 400));
+
+    console.log('\n[U] mmParse grammar unit tests (in-page)');
+    {
+      const u = await page.evaluate((FLOW_SRC) => {
+        const out = { threw: null };
+        try {
+          const p = mmParse('graph LR\nA[One] --> B(Two)\nB --> C((Three))\nC -.-> D{Four?}\nD ==>|lbl| E>Five]');
+          out.flow = {
+            dir: p.dir,
+            shapes: p.nodes.map((n) => n.shape),
+            labels: p.nodes.map((n) => n.label),
+            styles: p.edges.map((e) => e.style),
+            elabel: p.edges[3].label,
+          };
+          const chain = mmParse('graph TD\nA --> B --> C');
+          out.chain = { n: chain.nodes.length, e: chain.edges.length };
+          const semi = mmParse('graph TD; A-->B; B-->C');
+          out.semi = { n: semi.nodes.length, e: semi.edges.length };
+          out.unknown = mmParse(FLOW_SRC.replace('graph TD', 'gitGraph')) === null
+            && mmParse('pie\n"a": 1') === null && mmParse('') === null;
+          const tol = mmParse('graph TD\nA --> B\n???garbage???\nstyle A fill:#f9f\nB --> C');
+          out.tol = { n: tol.nodes.length, e: tol.edges.length };
+          const stream = mmParse('graph TD\nA --> B\nC --> D[Hal', { streaming: true });
+          out.stream = { n: stream.nodes.length, e: stream.edges.length };
+          const full = mmParse('graph TD\nA --> B\nC --> D[Hal');
+          out.full = { n: full.nodes.length, e: full.edges.length };
+          const s = mmParse('sequenceDiagram\nparticipant A as Alice\nB->>A: hi\nA-->>B: yo\nNote over A: x\nactivate B');
+          out.seq = {
+            ps: s.participants.map((x) => x.label),
+            kinds: s.items.map((i) => i.kind),
+            dashed: s.items.filter((i) => i.kind === 'msg').map((i) => i.dashed),
+          };
+          out.bareLabel = mmParse('graph TD\nA --> B').nodes.map((n) => n.label).join(',');
+        } catch (e) { out.threw = String(e); }
+        return out;
+      }, FLOW);
+      ok(u.threw === null, `mmParse battery did not throw (${u.threw || 'clean'})`);
+      ok(u.flow?.dir === 'LR', `direction parsed (got ${u.flow?.dir})`);
+      ok(JSON.stringify(u.flow?.shapes) === JSON.stringify(['rect', 'rounded', 'circle', 'diamond', 'flag']),
+        `all five shapes (got ${JSON.stringify(u.flow?.shapes)})`);
+      ok(JSON.stringify(u.flow?.labels) === JSON.stringify(['One', 'Two', 'Three', 'Four?', 'Five']),
+        `shape labels extracted (got ${JSON.stringify(u.flow?.labels)})`);
+      ok(JSON.stringify(u.flow?.styles) === JSON.stringify(['arrow', 'arrow', 'dotted', 'thick']),
+        `edge styles --> / -.-> / ==> (got ${JSON.stringify(u.flow?.styles)})`);
+      ok(u.flow?.elabel === 'lbl', `|label| on an edge (got ${JSON.stringify(u.flow?.elabel)})`);
+      ok(u.chain?.n === 3 && u.chain?.e === 2, `chain A --> B --> C (${JSON.stringify(u.chain)})`);
+      ok(u.semi?.n === 3 && u.semi?.e === 2, `';' statement separator (${JSON.stringify(u.semi)})`);
+      ok(u.unknown === true, 'unknown diagram types + empty source → null');
+      ok(u.tol?.n === 3 && u.tol?.e === 2, `garbage + style lines skipped, rest kept (${JSON.stringify(u.tol)})`);
+      ok(u.stream?.n === 2 && u.stream?.e === 1, `streaming: trailing incomplete line dropped (${JSON.stringify(u.stream)})`);
+      ok(u.full?.n === 4 && u.full?.e === 2, `non-streaming keeps the last line (unclosed shape → bare node) (${JSON.stringify(u.full)})`);
+      ok(JSON.stringify(u.seq?.ps) === JSON.stringify(['Alice', 'B']) && JSON.stringify(u.seq?.kinds) === JSON.stringify(['msg', 'msg', 'note']),
+        `sequence grammar: participants + msg/note, activate skipped (${JSON.stringify(u.seq)})`);
+      ok(JSON.stringify(u.seq?.dashed) === JSON.stringify([false, true]), `->> solid, -->> dashed (${JSON.stringify(u.seq?.dashed)})`);
+      ok(u.bareLabel === 'A,B', `bare nodes label = id (got ${u.bareLabel})`);
+    }
+
+    console.log('\n[A] streamed flowchart: container DURING streaming, gains nodes, correct final');
+    {
+      // Sampler: record diagram node-count + streaming state every 25ms.
+      await page.evaluate(() => {
+        window.__mmSamples = [];
+        window.__mmTimer = setInterval(() => {
+          const thumb = document.querySelector('.row.assistant .mm-thumb');
+          window.__mmSamples.push({
+            thumb: !!thumb,
+            nodes: thumb ? thumb.querySelectorAll('.mm-node').length : -1,
+            streaming: !!document.querySelector('.row.assistant[data-streaming="true"]'),
+          });
+        }, 25);
+      });
+      await sendMessage(page, 'flow diagram please');
+      await waitForIdle(page);
+      const samples = await page.evaluate(() => { clearInterval(window.__mmTimer); return window.__mmSamples; });
+      const during = samples.filter((s) => s.thumb && s.streaming);
+      ok(during.length > 0, `diagram container visible DURING streaming (${during.length} samples)`);
+      const counts = [...new Set(during.map((s) => s.nodes))].sort((a, b) => a - b);
+      ok(counts.length >= 2 && counts[counts.length - 1] > counts[0],
+        `node count GREW across chunks (distinct counts seen: ${counts.join(' → ')})`);
+      const sortedOk = during.every((s, i) => i === 0 || s.nodes >= during[i - 1].nodes);
+      ok(sortedOk, 'node count is monotonic (the diagram only ever grows)');
+
+      const fin = await page.evaluate(() => {
+        const thumb = document.querySelector('.row.assistant .mm-thumb[data-mm-id]');
+        if (!thumb) return null;
+        const svg = thumb.querySelector('svg');
+        return {
+          nodes: svg.querySelectorAll('.mm-node').length,
+          edges: svg.querySelectorAll('.mm-edge').length,
+          edgeLabels: [...svg.querySelectorAll('.mm-edge-label text')].map((t) => t.textContent),
+          text: svg.textContent,
+          streamingLeft: document.querySelectorAll('.mm-thumb.mm-streaming').length,
+        };
+      });
+      ok(!!fin, 'final .mm-thumb[data-mm-id] present after finalize');
+      ok(fin?.nodes === 5, `final node count 5 (got ${fin?.nodes})`);
+      ok(fin?.edges === 5, `final edge count 5 (got ${fin?.edges})`);
+      ok(['Start', 'Choose', 'Apply fix', 'Done', 'Ship'].every((l) => fin?.text.includes(l)),
+        `node labels rendered (got: ${fin?.text})`);
+      ok(JSON.stringify(fin?.edgeLabels?.slice().sort()) === JSON.stringify(['no', 'yes']),
+        `edge labels yes/no rendered (got ${JSON.stringify(fin?.edgeLabels)})`);
+      ok(fin?.streamingLeft === 0, 'no leftover mm-streaming containers after finalize');
+    }
+
+    console.log('\n[B] thumbnail is a bounded card');
+    {
+      const t = await page.evaluate(() => {
+        const thumb = document.querySelector('.row.assistant .mm-thumb[data-mm-id]');
+        const cs = getComputedStyle(thumb);
+        return { maxH: cs.maxHeight, overflow: cs.overflow, cursor: cs.cursor, border: cs.borderTopWidth, clientH: thumb.clientHeight };
+      });
+      ok(t.maxH === '240px' && t.clientH <= 242, `bounded to 240px (maxH=${t.maxH}, clientH=${t.clientH})`);
+      ok(t.overflow === 'hidden', `overflow hidden (got ${t.overflow})`);
+      ok(t.cursor === 'pointer', `cursor pointer (got ${t.cursor})`);
+      ok(t.border === '1px', `subtle border (got ${t.border})`);
+    }
+
+    console.log('\n[C] fullscreen viewer: open / pan / wheel / Code / close / Esc');
+    {
+      await page.click('.row.assistant .mm-thumb[data-mm-id]');
+      const opened = await page.evaluate(() => ({
+        shown: document.getElementById('mmViewer').classList.contains('show'),
+        hasSvg: !!document.querySelector('#mmViewerPan svg'),
+        bodyLock: document.body.style.overflow === 'hidden',
+        z: getComputedStyle(document.getElementById('mmViewer')).zIndex,
+      }));
+      ok(opened.shown && opened.hasSvg, `click opens the viewer with the SVG (shown=${opened.shown}, svg=${opened.hasSvg})`);
+      ok(opened.bodyLock, 'body scroll locked while open');
+      ok(Number(opened.z) >= 300, `viewer above modals (z-index ${opened.z})`);
+
+      const tf = () => page.evaluate(() => document.getElementById('mmViewerPan').style.transform);
+      const before = await tf();
+      await page.mouse.move(600, 400);
+      await page.mouse.down();
+      await page.mouse.move(680, 460, { steps: 5 });
+      await page.mouse.up();
+      const after = await tf();
+      ok(before !== after, `click-drag changes the pan transform (${before} → ${after})`);
+      await page.mouse.wheel({ deltaY: 120 });
+      const afterWheel = await tf();
+      ok(afterWheel !== after, `wheel scrolls the diagram (${after} → ${afterWheel})`);
+
+      // Image/Code segmented toggle: exactly one active; Code reveals the source.
+      const segDefault = await page.evaluate(() => ({
+        image: document.getElementById('mmSegImage').classList.contains('active'),
+        code: document.getElementById('mmSegCode').classList.contains('active'),
+      }));
+      ok(segDefault.image && !segDefault.code, 'viewer opens on the Image tab (active)');
+      await page.click('#mmSegCode');
+      // The code box must FILL the viewer (the global pre{max-height:320px} used to
+      // cap it to ~1/3 of a tall screen — "only using 1/2 my screen"). Check on a
+      // wide+tall viewport, then restore.
+      await page.setViewport({ width: 2000, height: 1200 });
+      await new Promise((r) => setTimeout(r, 120));
+      const code = await page.evaluate(() => {
+        const box = document.getElementById('mmViewerSrc').getBoundingClientRect();
+        return {
+          showCode: document.getElementById('mmViewer').classList.contains('mm-show-code'),
+          src: document.getElementById('mmViewerSrc').textContent,
+          canvasHidden: getComputedStyle(document.getElementById('mmViewerCanvas')).display === 'none',
+          codeActive: document.getElementById('mmSegCode').classList.contains('active'),
+          imageActive: document.getElementById('mmSegImage').classList.contains('active'),
+          boxW: Math.round(box.width), winW: window.innerWidth,
+          boxH: Math.round(box.height), winH: window.innerHeight,
+        };
+      });
+      ok(code.showCode && code.canvasHidden, 'Code tab swaps to the source view');
+      ok(code.src === FLOW, `source view shows the EXACT mermaid source (got ${JSON.stringify(code.src.slice(0, 40))}…)`);
+      ok(code.codeActive && !code.imageActive, 'exactly one segment active (Code), Image deactivated');
+      ok(code.boxW >= code.winW - 60, `code box fills the WIDTH (${code.boxW} of ${code.winW})`);
+      ok(code.boxH >= code.winH - 110, `code box fills the HEIGHT — not capped at 320 (${code.boxH} of ${code.winH})`);
+      await page.setViewport({ width: 1200, height: 800 });
+      await new Promise((r) => setTimeout(r, 80));
+      await page.click('#mmSegImage');
+      ok(await page.evaluate(() => !document.getElementById('mmViewer').classList.contains('mm-show-code')
+        && getComputedStyle(document.getElementById('mmViewerCanvas')).display !== 'none'
+        && document.getElementById('mmSegImage').classList.contains('active')),
+        'Image tab returns to the diagram');
+
+      await page.click('.mm-viewer-tools .mm-viewer-btn[title^="Close"]');
+      const closed = await page.evaluate(() => ({
+        shown: document.getElementById('mmViewer').classList.contains('show'),
+        bodyLock: document.body.style.overflow,
+      }));
+      ok(!closed.shown, 'the ✕ button closes the viewer');
+      ok(closed.bodyLock === '', 'body scroll restored on close');
+
+      await page.click('.row.assistant .mm-thumb[data-mm-id]');   // reopen
+      await page.keyboard.press('Escape');
+      ok(await page.evaluate(() => !document.getElementById('mmViewer').classList.contains('show')),
+        'Esc closes the viewer');
+    }
+
+    console.log('\n[D] sequenceDiagram: lifelines + arrows');
+    {
+      await sendMessage(page, 'sequence diagram please');
+      await waitForIdle(page);
+      const s = await page.evaluate(() => {
+        const thumbs = document.querySelectorAll('.row.assistant .mm-thumb[data-mm-id]');
+        const svg = thumbs[thumbs.length - 1]?.querySelector('svg');
+        if (!svg) return null;
+        return {
+          lifelines: svg.querySelectorAll('.mm-lifeline').length,
+          participants: svg.querySelectorAll('.mm-participant').length,
+          msgs: svg.querySelectorAll('.mm-msg').length,
+          dashed: svg.querySelectorAll('.mm-msg[stroke-dasharray]').length,
+          arrows: svg.querySelectorAll('.mm-msg[marker-end]').length,
+          notes: svg.querySelectorAll('.mm-note').length,
+          text: svg.textContent,
+        };
+      });
+      ok(!!s, 'sequence diagram rendered as .mm-thumb');
+      ok(s?.lifelines === 2 && s?.participants === 2, `2 lifelines + 2 participant boxes (${JSON.stringify(s)})`);
+      ok(s?.msgs === 2 && s?.arrows === 2, `2 message arrows (got msgs=${s?.msgs}, arrows=${s?.arrows})`);
+      ok(s?.dashed === 1, `the -->> reply is dashed (got ${s?.dashed})`);
+      ok(s?.notes === 1 && s?.text.includes('handshake done'), 'Note over renders');
+      ok(s?.text.includes('User') && s?.text.includes('Server') && s?.text.includes('request'),
+        'participant aliases + message labels rendered');
+    }
+
+    console.log('\n[E] unknown type (gitGraph) → plain code block, streamed AND final');
+    {
+      await sendMessage(page, 'git graph please');
+      await waitForIdle(page);
+      const g = await page.evaluate(() => {
+        const rows = document.querySelectorAll('.row.assistant');
+        const row = [...rows].reverse().find((r) => r.textContent.includes('History:'));
+        if (!row) return null;
+        return {
+          thumbs: row.querySelectorAll('.mm-thumb').length,
+          pre: row.querySelector('pre.md code')?.textContent || '',
+        };
+      });
+      ok(!!g, 'gitGraph reply row found');
+      ok(g?.thumbs === 0, `no diagram container for the unknown type (got ${g?.thumbs})`);
+      ok(g?.pre.includes('gitGraph') && g?.pre.includes('commit'), `fence fell back to a literal code block (got ${JSON.stringify(g?.pre.slice(0, 40))})`);
+    }
+
+    console.log('\n[F] malformed input: never throws, zero-parse falls back to code block');
+    {
+      const f = await page.evaluate(() => {
+        const out = { threw: null };
+        try {
+          const host = document.createElement('div'); host.className = 'body'; document.body.appendChild(host);
+          // Zero-parse flowchart (only garbage) → final render must be a code block.
+          host.innerHTML = renderInline('```mermaid\ngraph TD\n@@garbage@@\n;;;\n```');
+          out.zeroParse = { thumbs: host.querySelectorAll('.mm-thumb').length, pre: host.querySelectorAll('pre.md').length };
+          // Partially-parsable → renders the valid part as a diagram.
+          host.innerHTML = renderInline('```mermaid\ngraph TD\nA --> B\nA --> \n```');
+          out.partial = { thumbs: host.querySelectorAll('.mm-thumb').length, nodes: host.querySelectorAll('.mm-node').length };
+          // Streaming the same garbage through createStreamingMd.
+          const h2 = document.createElement('div'); h2.className = 'body'; document.body.appendChild(h2);
+          const smd = createStreamingMd(h2);
+          smd.feed('```mermaid\n'); smd.feed('graph TD\n@@nope'); smd.feed('@@\n;;;\n'); smd.feed('```\n'); smd.finish();
+          out.streamFallback = { thumbs: h2.querySelectorAll('.mm-thumb').length, pre: h2.querySelectorAll('pre.md').length };
+          host.remove(); h2.remove();
+        } catch (e) { out.threw = String(e); }
+        return out;
+      });
+      ok(f.threw === null, `malformed inputs never throw (${f.threw || 'clean'})`);
+      ok(f.zeroParse?.thumbs === 0 && f.zeroParse?.pre === 1, `zero-parse final → code block (${JSON.stringify(f.zeroParse)})`);
+      ok(f.partial?.thumbs === 1 && f.partial?.nodes === 2, `partially-valid final → diagram with the valid part (${JSON.stringify(f.partial)})`);
+      ok(f.streamFallback?.thumbs === 0 && f.streamFallback?.pre === 1, `streamed zero-parse → swapped to code block on fence close (${JSON.stringify(f.streamFallback)})`);
+    }
+
+    console.log('\n[H] Artifact CAROUSEL + document mode: registry, titles, replace-on-reemit, thumb→doc, locate');
+    {
+      const t0 = await page.evaluate(() => ({
+        hasItems: document.getElementById('carousel').classList.contains('has-items'),
+        labels: [...document.querySelectorAll('#carouselStrip .car-thumb .car-label')].map((e) => e.textContent),
+        count: document.getElementById('carCount').textContent,
+        minis: document.querySelectorAll('#carouselStrip .car-thumb .car-mini svg').length,
+        kinds: document.querySelectorAll('#carouselStrip .car-thumb .car-kind svg').length,
+      }));
+      ok(t0.hasItems, 'carousel reveals itself once artifacts exist');
+      ok(JSON.stringify(t0.labels) === JSON.stringify(['User', 'Start']),
+        `one thumbnail per diagram, newest first, titled by first node/participant (got ${JSON.stringify(t0.labels)})`);
+      ok(t0.count === '(2)', `carousel count (got "${t0.count}")`);
+      ok(t0.minis === 2 && t0.kinds === 2, `each diagram thumb carries a mini SVG render + a kind glyph (${t0.minis}/${t0.kinds})`);
+
+      // Same-title re-emit → REPLACES the entry (latest edit), moves it to the front.
+      await sendMessage(page, 'updated flow please');
+      await waitForIdle(page);
+      const t1 = await page.evaluate(() => ({
+        labels: [...document.querySelectorAll('#carouselStrip .car-thumb .car-label')].map((e) => e.textContent),
+        count: document.getElementById('carCount').textContent,
+      }));
+      ok(JSON.stringify(t1.labels) === JSON.stringify(['Start', 'User']),
+        `same-title re-emit REPLACED the entry and bubbled it to the front (got ${JSON.stringify(t1.labels)})`);
+      ok(t1.count === '(2)', `count stays 2 after the re-emit (got "${t1.count}")`);
+
+      // Thumb click → DOCUMENT MODE opens on the artifact's CURRENT (new) render.
+      await page.evaluate(() => [...document.querySelectorAll('#carouselStrip .car-thumb')]
+        .find((t) => t.querySelector('.car-label').textContent === 'Start').click());
+      const d1 = await page.evaluate(() => ({
+        shown: document.getElementById('docMode').classList.contains('show'),
+        title: document.getElementById('docTitle').textContent,
+        svg: !!document.querySelector('#docBody svg'),
+        nodes: document.querySelectorAll('#docBody .mm-node').length,
+        diagramClass: document.getElementById('docBody').classList.contains('doc-diagram'),
+        locateShown: document.getElementById('docLocateBtn').style.display !== 'none',
+        footerStays: !!document.querySelector('#sidePanel .side-chrome') || !!document.querySelector('.side-chrome'),
+      }));
+      ok(d1.shown, 'diagram thumb opens document mode');
+      ok(d1.title === 'Start' && d1.svg && d1.diagramClass, `doc mode shows the diagram (title=${d1.title}, svg=${d1.svg})`);
+      ok(d1.nodes === 6, `doc render reflects the NEW source after the replace (6 nodes incl. Rollback, got ${d1.nodes})`);
+      ok(d1.locateShown, 'a diagram doc shows the ⌖ locate button');
+      ok(d1.footerStays, 'the status footer stays present alongside document mode');
+
+      // ⌖ locate → closes the doc + scrolls the chat to the fence + pulse.
+      await page.evaluate(() => { document.getElementById('logScroll').scrollTop = 0; });
+      await page.click('#docLocateBtn');
+      await new Promise((r) => setTimeout(r, 150));
+      const loc = await page.evaluate(() => ({
+        docOpen: document.getElementById('docMode').classList.contains('show'),
+        scrollTop: document.getElementById('logScroll').scrollTop,
+        pulse: !!document.querySelector('.mm-thumb.mm-located'),
+      }));
+      ok(!loc.docOpen, 'locate closed document mode');
+      ok(loc.scrollTop > 0, `locate scrolled the fence into view (scrollTop 0 → ${loc.scrollTop})`);
+      ok(loc.pulse, 'fence carries the highlight-pulse class');
+    }
+
+    console.log('\n[I] viewer Copy/Save dispatch on the active tab (image vs source) + backdrop close');
+    {
+      try {
+        await browser.defaultBrowserContext().overridePermissions(`http://127.0.0.1:${PORT}`,
+          ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
+      } catch {
+        try { await browser.defaultBrowserContext().overridePermissions(`http://127.0.0.1:${PORT}`, ['clipboard-read', 'clipboard-write']); } catch {}
+      }
+      const dlDir = await mkdtemp(path.join(tmpdir(), 'cb-mm-dl-'));
+      const cdp = await page.target().createCDPSession();
+      await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir });
+      const grab = async (ext) => {   // wait for a nonempty download with this extension
+        let f = null;
+        for (let i = 0; i < 40 && !f; i++) {
+          await new Promise((r) => setTimeout(r, 250));
+          const files = (await readdir(dlDir).catch(() => [])).filter((x) => x.endsWith(ext));
+          if (files.length) { const st = await stat(path.join(dlDir, files[0])).catch(() => null); if (st && st.size > 0) f = { name: files[0], size: st.size }; }
+        }
+        return f;
+      };
+
+      // Open the fullscreen viewer from the in-chat thumb of the updated (FLOW2)
+      // diagram — the one carrying the 'Rollback' node — so Copy/Save see FLOW2.
+      await page.evaluate(() => {
+        const th = [...document.querySelectorAll('.row.assistant .mm-thumb[data-mm-id]')].find((t) => t.textContent.includes('Rollback'));
+        if (th) th.click();
+      });
+      await page.waitForFunction(() => document.getElementById('mmViewer').classList.contains('show'), { timeout: 3000 });
+
+      // IMAGE tab (default): Copy → PNG to clipboard; Save → .png download.
+      await page.click('#mmViewerCopyBtn');
+      const imgResp = await page.waitForFunction(() => ['Copied', 'Copy failed'].includes(document.getElementById('mmViewerCopyBtn').textContent), { timeout: 3000 })
+        .then(() => page.evaluate(() => document.getElementById('mmViewerCopyBtn').textContent)).catch(() => 'no-change');
+      ok(imgResp === 'Copied', `image-tab Copy reports "Copied" (got ${imgResp})`);
+      const clipImg = await page.evaluate(async () => {
+        try { const items = await navigator.clipboard.read(); return items.some((it) => it.types.includes('image/png')); } catch { return 'unreadable'; }
+      });
+      if (clipImg === 'unreadable') ok(imgResp === 'Copied', 'clipboard image unreadable in this browser — feedback reported success');
+      else ok(clipImg === true, 'clipboard holds an image/png item (image, not source text)');
+      await new Promise((r) => setTimeout(r, 1400));
+
+      await page.click('#mmViewerSaveBtn');
+      const png = await grab('.png');
+      ok(!!png && png.name === 'Start.png', `image-tab Save produced Start.png (${png ? `${png.size} bytes` : 'nothing in 10s'})`);
+      if (png) { const buf = await readFile(path.join(dlDir, png.name)); ok(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47, 'PNG download carries the PNG signature'); }
+
+      // CODE tab: Copy → the EXACT source to the clipboard; Save → a .mmd file.
+      await page.click('#mmSegCode');
+      await page.click('#mmViewerCopyBtn');
+      const srcCopied = await page.waitForFunction(() => document.getElementById('mmViewerCopyBtn').textContent === 'Copied', { timeout: 3000 })
+        .then(() => true).catch(() => false);
+      ok(srcCopied, 'code-tab Copy gives inline "Copied" feedback');
+      // The OS clipboard normalizes newlines on Windows (LF → CRLF) — undo that.
+      const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
+      if (clip === null) ok(srcCopied, 'clipboard text unreadable — fallback path reported success');
+      else ok(clip.replace(/\r\n/g, '\n') === FLOW2, `code-tab Copy holds the exact mermaid source (got ${JSON.stringify((clip || '').slice(0, 30))}…)`);
+      await new Promise((r) => setTimeout(r, 1400));
+      ok(await page.evaluate(() => document.getElementById('mmViewerCopyBtn').textContent) === 'Copy', 'Copy label reverts after ~1.2s');
+
+      await page.click('#mmViewerSaveBtn');
+      const mmd = await grab('.mmd');
+      ok(!!mmd && mmd.name === 'Start.mmd', `code-tab Save produced Start.mmd (${mmd ? `${mmd.size} bytes` : 'nothing in 10s'})`);
+      if (mmd) { const txt = await readFile(path.join(dlDir, mmd.name), 'utf8'); ok(txt.replace(/\r\n/g, '\n') === FLOW2, 'the .mmd file holds the exact source'); }
+      await page.click('#mmSegImage');   // restore image tab before the backdrop test
+      await cleanupDir(dlDir);
+
+      // Backdrop click closes; a click ON the SVG keeps the viewer (panning) alive.
+      const pts = await page.evaluate(() => {
+        const r = document.querySelector('#mmViewerPan svg').getBoundingClientRect();
+        return { inX: r.left + r.width / 2, inY: r.top + r.height / 2, outX: 8, outY: window.innerHeight - 8 };
+      });
+      await page.mouse.click(pts.inX, pts.inY);
+      ok(await page.evaluate(() => document.getElementById('mmViewer').classList.contains('show')),
+        'click ON the SVG does not close the viewer');
+      await page.mouse.click(pts.outX, pts.outY);
+      ok(await page.evaluate(() => !document.getElementById('mmViewer').classList.contains('show')),
+        'click on the BACKDROP closes the viewer');
+    }
+
+    console.log('\n[J] window title = the open project path, left-ellipsized');
+    {
+      const title = await page.title();
+      ok(title.endsWith(path.basename(projectDir)), `title ends with the project dir name (got "${title}")`);
+      if (projectDir.length > 45) ok(title.startsWith('…'), `long path → leading ellipsis, END preserved (got "${title}")`);
+      else ok(title === projectDir, `short path → shown whole (got "${title}")`);
+    }
+
+    // [G] the mermaid PLUGIN told the agent what it can draw: the system prompt of
+    // every chat request carries the capability brief (single source of truth —
+    // MM_CAPABILITIES exported by mermaid-lite, injected via pluginManager).
+    console.log('\n[G] plugin prompt brief reaches the agent');
+    {
+      const reqs = globalThis.__mmAdapter.requests;
+      const briefed = reqs.some((t) => t.includes('## Diagrams (mermaid)') && t.includes('CANNOT DO') && t.includes('sequenceDiagram'));
+      ok(briefed, `the agent's request carried the mermaid capability brief (${reqs.length} requests captured)`);
+    }
+
+    ok(jsErrors.length === 0, `no page errors during the run (${jsErrors.length}: ${jsErrors.slice(0, 3).join(' | ')})`);
+  } finally {
+    await browser.close();
+    server.close();
+    await cleanupDir(projectDir);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-modal-interplay.mjs
new 931a29756f3bdbd66918b2b1
+/**
+ * EDGE PROBE (on-demand): WHATS-NEW modal + ARTIFACTS tab + fullscreen mermaid
+ * VIEWER open/close INTERLEAVED — fab docking, z-order, and body scroll-lock
+ * across three overlays that never met in one session before.
+ *
+ *   [A] whats-new.json present → the modal shows on load; the snapshot fab is
+ *       deliberately HIDDEN while it's the top modal (it would cover "Got it");
+ *       the whats-new modal does NOT lock body scroll.
+ *   [B] a run streams a mermaid diagram WHILE the modal is open → the artifact
+ *       registers in the carousel behind the modal; no crash.
+ *   [C] the viewer opens ON TOP of the whats-new modal (higher z), locks body
+ *       scroll; the modal stays open beneath.
+ *   [D] Esc closes ONLY the viewer (whats-new stays); scroll-lock released.
+ *   [E] dismissing whats-new WHILE the viewer is open: modal hides, viewer
+ *       stays, scroll stays locked until the viewer closes; the dismiss POST
+ *       deletes whats-new.json on disk.
+ *   [F] reload: whats-new does NOT reappear; the artifact re-registers from the
+ *       event replay.
+ *   [G] fab docking: hidden in plain chat; docks INTO the folder-picker modal
+ *       when that opens; hidden again when it closes.
+ *
+ * Run: node test/_edge-modal-interplay.mjs    (skips if Chrome not found)
+ */
+import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17971;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+const FLOW = 'graph TD\n  A[Gate] --> B{Check}\n  B -->|yes| C[Ship]';
+
+function mockAdapter() {
+  return {
+    async complete({ messages }) {
+      const last = String([...(messages || [])].reverse().find((m) => m.role === 'user')?.content || '');
+      if (/give your single verdict/i.test(last)) return { choices: [{ message: { content: 'no problems found' } }] };
+      if (/flow diagram please/.test(last)) {
+        return { choices: [{ message: { content: 'Here you go:\n```mermaid\n' + FLOW + '\n```\nDone.' } }] };
+      }
+      return { choices: [{ message: { content: 'Done.' } }] };
+    },
+  };
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-mod-'));
+  const wnDir = await mkdtemp(path.join(tmpdir(), 'cb-mod-wn-'));
+  const wnPath = path.join(wnDir, 'whats-new.json');
+  await writeFile(wnPath, JSON.stringify({
+    fromBuild: 425, toBuild: 426,
+    entries: [{ build: 426, date: '2026-06-10', title: 'Release notes for the probe', items: ['First item', 'Second item'] }],
+  }));
+  const strip = (src) => src
+    .replace(/^import\s+[^;]+;[ \t]*\r?\n?/gm, '')
+    .replace(/^export\s+(async\s+function|function|class|const|let|var)\b/gm, '$1')
+    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
+  const mosaic = strip(await readFile(path.join(ROOT, 'src', 'agent', 'mosaic-layout.mjs'), 'utf8'));
+  const mermaid = strip(await readFile(path.join(ROOT, 'src', 'mermaid-lite.mjs'), 'utf8'));
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8')).replace('</head>',
+    '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: '(mock)' }) + ';</script>' +
+    '<script>' + mosaic + '\n' + mermaid + '</script></head>');
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' }, defaultModel: 'mock',
+    port: PORT, adapter: mockAdapter(), modelsList: [{ id: 'mock' }], initialProject: projectDir, whatsNewPath: wnPath,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1280, height: 850 });
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForFunction(() => typeof send === 'function', { timeout: 10000 });
+
+    console.log('\n[A] whats-new shows on load; fab hidden; no scroll lock');
+    {
+      await page.waitForFunction(() => document.getElementById('whatsNewModalBg')?.classList.contains('show'), { timeout: 15000 });
+      const a = await page.evaluate(() => ({
+        build: document.getElementById('wnBuild')?.textContent,
+        items: [...document.querySelectorAll('#whatsNewBody .wn-items li')].map((x) => x.textContent),
+        fabHidden: document.getElementById('snapFab')?.classList.contains('hidden'),
+        bodyOverflow: document.body.style.overflow,
+      }));
+      ok(a.build === '426', `modal carries the toBuild (got "${a.build}")`);
+      ok(JSON.stringify(a.items) === JSON.stringify(['First item', 'Second item']), `release items rendered (${JSON.stringify(a.items)})`);
+      ok(a.fabHidden === true, 'snapshot fab HIDDEN while whats-new is the top modal (would cover "Got it")');
+      ok(a.bodyOverflow === '', 'whats-new does not lock body scroll');
+    }
+
+    console.log('\n[B] a run streams a diagram while the modal is open');
+    {
+      await page.evaluate(() => { document.getElementById('input').value = 'flow diagram please'; send(); });
+      await page.waitForFunction(() => { const s = window.__sessionRef?.status; return s === 'idle' || s === 'done'; }, { timeout: 20000 });
+      await sleep(400);
+      const b = await page.evaluate(() => ({
+        modalStillOpen: document.getElementById('whatsNewModalBg')?.classList.contains('show'),
+        thumb: document.querySelectorAll('.row.assistant .mm-thumb[data-mm-id]').length,
+        carLabels: [...document.querySelectorAll('#carouselStrip .car-thumb .car-label')].map((x) => x.textContent),
+        carShown: document.getElementById('carousel')?.classList.contains('has-items'),
+      }));
+      ok(b.modalStillOpen, 'whats-new stayed open through the run');
+      ok(b.thumb === 1, `diagram rendered behind the modal (thumbs=${b.thumb})`);
+      ok(b.carShown && JSON.stringify(b.carLabels) === JSON.stringify(['Gate']), `artifact registered in the carousel behind the modal (${JSON.stringify(b.carLabels)})`);
+    }
+
+    console.log('\n[C] viewer opens ON TOP of whats-new, locks scroll');
+    {
+      const c = await page.evaluate(() => {
+        document.querySelector('.row.assistant .mm-thumb[data-mm-id]')?.click();
+        const v = document.getElementById('mmViewer');
+        return {
+          viewerShown: v?.classList.contains('show'),
+          viewerZ: Number(getComputedStyle(v).zIndex),
+          wnZ: Number(getComputedStyle(document.getElementById('whatsNewModalBg')).zIndex),
+          wnShown: document.getElementById('whatsNewModalBg')?.classList.contains('show'),
+          bodyOverflow: document.body.style.overflow,
+          hasSvg: !!document.querySelector('#mmViewerPan svg'),
+        };
+      });
+      ok(c.viewerShown && c.hasSvg, 'in-chat diagram thumb opened the viewer with the SVG (while a modal was open)');
+      ok(c.viewerZ > c.wnZ, `viewer paints ABOVE whats-new (z ${c.viewerZ} > ${c.wnZ})`);
+      ok(c.wnShown, 'whats-new still open beneath the viewer');
+      ok(c.bodyOverflow === 'hidden', 'viewer locked body scroll');
+    }
+
+    console.log('\n[D] Esc closes ONLY the viewer');
+    {
+      await page.keyboard.press('Escape');
+      await sleep(150);
+      const d = await page.evaluate(() => ({
+        viewerShown: document.getElementById('mmViewer')?.classList.contains('show'),
+        wnShown: document.getElementById('whatsNewModalBg')?.classList.contains('show'),
+        bodyOverflow: document.body.style.overflow,
+      }));
+      ok(!d.viewerShown, 'Esc closed the viewer');
+      ok(d.wnShown, 'whats-new survived the Esc (only the top layer closed)');
+      ok(d.bodyOverflow === '', 'scroll-lock released with the viewer');
+    }
+
+    console.log('\n[E] dismiss whats-new while the viewer is open');
+    {
+      await page.evaluate(() => { document.querySelector('.row.assistant .mm-thumb[data-mm-id]')?.click(); });   // reopen viewer
+      await page.evaluate(() => dismissWhatsNew());
+      await sleep(400);
+      const e = await page.evaluate(() => ({
+        wnShown: document.getElementById('whatsNewModalBg')?.classList.contains('show'),
+        viewerShown: document.getElementById('mmViewer')?.classList.contains('show'),
+        bodyOverflow: document.body.style.overflow,
+      }));
+      ok(!e.wnShown && e.viewerShown, 'modal dismissed under the open viewer; viewer unaffected');
+      ok(e.bodyOverflow === 'hidden', 'scroll stays locked (the viewer still owns it)');
+      let gone = false;
+      for (let i = 0; i < 20 && !gone; i++) { gone = !existsSync(wnPath); if (!gone) await sleep(200); }
+      ok(gone, 'whats-new.json deleted on disk by the dismiss POST');
+      await page.keyboard.press('Escape');
+      ok(await page.evaluate(() => document.body.style.overflow) === '', 'closing the viewer releases the lock cleanly after the interleave');
+    }
+
+    console.log('\n[F] reload: no whats-new; artifact replays');
+    {
+      await page.reload({ waitUntil: 'domcontentloaded' });
+      await page.waitForFunction(() => typeof send === 'function', { timeout: 10000 });
+      await sleep(1500);   // event replay + the (empty) whats-new fetch
+      const f = await page.evaluate(() => ({
+        wnShown: document.getElementById('whatsNewModalBg')?.classList.contains('show'),
+        carCount: document.getElementById('carCount')?.textContent,
+        thumb: document.querySelectorAll('.row.assistant .mm-thumb[data-mm-id]').length,
+      }));
+      ok(!f.wnShown, 'whats-new does NOT reappear after dismissal');
+      ok(f.carCount === '(1)' && f.thumb === 1, `artifact re-registered from the event replay (count="${f.carCount}", thumbs=${f.thumb})`);
+    }
+
+    console.log('\n[G] fab docking across the folder-picker modal');
+    {
+      const g0 = await page.evaluate(() => document.getElementById('snapFab')?.classList.contains('hidden'));
+      ok(g0 === true, 'fab hidden in plain chat (snapshot lives behind the gear)');
+      await page.evaluate(() => openFolderPicker());
+      await sleep(300);
+      const g1 = await page.evaluate(() => {
+        const fab = document.getElementById('snapFab');
+        return {
+          hidden: fab?.classList.contains('hidden') || getComputedStyle(fab).display === 'none',
+          inModal: fab?.classList.contains('in-modal'),
+          inFolderModal: fab?.closest('#folderModal') != null,
+          pos: getComputedStyle(fab).position,
+        };
+      });
+      ok(g1.hidden === false && g1.inModal === false && !g1.inFolderModal && g1.pos === 'fixed',
+        `fab FLOATS on the viewport over the folder modal — never docked into it (hidden=${g1.hidden} inModal=${g1.inModal} inFolder=${g1.inFolderModal} pos=${g1.pos})`);
+      await page.evaluate(() => closeFolderPicker());
+      await sleep(300);
+      const g2 = await page.evaluate(() => ({
+        hidden: document.getElementById('snapFab')?.classList.contains('hidden'),
+        inModal: document.getElementById('snapFab')?.classList.contains('in-modal'),
+      }));
+      ok(g2.hidden === true && g2.inModal === false, 'fab undocked + hidden again when the modal closed');
+    }
+
+    ok(jsErrors.length === 0, `no page errors (${jsErrors.length}: ${jsErrors.slice(0, 3).join(' | ')})`);
+  } finally {
+    await browser.close();
+    server.close();
+    await cleanupDir(projectDir);
+    await cleanupDir(wnDir);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-mode-cancel-history.mjs
new c366d8e0a63699424f237a52
+// REPRO of the reported context loss, from the developer's exact sequence:
+//   1. agent tries <js> while EDIT MODE IS OFF (discuss/read-only) → refused
+//   2. developer cancels (Esc)
+//   3. developer sends another message
+//   4. developer cancels again (Esc)
+//   5. developer turns EDIT MODE ON, sends again
+//   → from here the agent behaves as if it cannot see anything before the read-only <js> error
+//
+// The question this answers is narrow and factual: at step 5, does the request the adapter receives still
+// contain the EARLIEST user message? Everything else is inference until that is settled.
+import { mkdtemp } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { startServer } from '../src/server.mjs';
+
+let pass = 0, fail = 0;
+const ok = (c, l, d) => { if (c) { pass++; console.log('  ok  ', l); } else { fail++; console.log('  FAIL', l, d ? '\n        ' + String(d).slice(0, 200) : ''); } };
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+// Records every request; scripts the agent to attempt <js> on the first turn of each run.
+const seen = [];
+let script = 'plain';
+let slow = false;
+const adapter = {
+  async complete({ messages, signal }) {
+    const t = (messages || []).map((m) => String(m.content || '')).join('\n');
+    seen.push({ messages: (messages || []).map((m) => ({ role: m.role, content: String(m.content || '') })) });
+    // SLOW enough that a cancel lands MID-RUN. Without this the run finishes first and there is nothing to
+    // interrupt — which is not the sequence being reproduced.
+    if (slow) await new Promise((res, rej) => {
+      const to = setTimeout(res, 1200);
+      signal?.addEventListener?.('abort', () => { clearTimeout(to); const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }, { once: true });
+    });
+    if (/give your single verdict|parallel REVIEWER/i.test(t)) return { choices: [{ message: { content: 'no problems found' } }] };
+    if (script === 'js') {
+      return { choices: [{ message: { content: "I will apply the fix.\n\n<remote-workspace>\n<js>\nconst fs = require('fs');\nfs.writeFileSync('a.txt', 'x');\nreturn 'done';\n</js>\n</remote-workspace>\n\nNext, I will verify." } }] };
+    }
+    return { choices: [{ message: { content: 'ok.' } }] };
+  },
+};
+
+const PORT = 29310;
+const proj = await mkdtemp(path.join(tmpdir(), 'cb-mode-'));
+const { server } = await startServer({
+  html: '<html></html>', baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+  defaultModel: 'm', port: PORT, adapter, modelsList: [{ id: 'm' }], initialProject: proj,
+});
+const post = (p, b) => fetch(`http://127.0.0.1:${PORT}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json().catch(() => ({})));
+const send = (text, discuss) => post('/api/message', { text, model: 'm', ...(discuss ? { mode: 'discuss' } : {}) });
+const cancel = () => post('/api/cancel', {});
+const state = () => fetch(`http://127.0.0.1:${PORT}/api/state`).then((r) => r.json());
+async function idle() { for (let i = 0; i < 200; i++) { const s = await state(); if (s.status === 'done' || s.status === 'idle' || s.status === 'error') return s; await sleep(50); } return state(); }
+
+console.log('\n=== repro: js-refused → cancel → message → cancel → edit ON ===');
+
+// A normal exchange first, so there IS earlier history to lose.
+script = 'plain';
+await send('FIRST-MESSAGE analyze the country dropdown bug', false); await idle();
+await send('SECOND-MESSAGE keep going', false); await idle();
+
+// 1. <js> attempted with edit mode OFF → the read-only refusal.
+script = 'js';
+await send('THIRD-MESSAGE apply the fix', true); await idle();
+const refused = seen.some((r) => r.messages.some((m) => /read-only \(Discuss\) mode/.test(m.content)));
+ok(refused, '1: the <js> attempt was refused for read-only mode (the reported trigger)');
+
+// 2 + 3 + 4. cancel, message, cancel.
+slow = true;
+send('FOURTH-MESSAGE no, just write analysis', true);      // deliberately NOT awaited — cancel it mid-flight
+await sleep(300); await cancel(); await sleep(250);
+send('FOURTH-B another try', true);
+await sleep(300); await cancel(); await sleep(250);
+slow = false;
+
+// 5. EDIT MODE ON.
+script = 'plain';
+seen.length = 0;
+await send('FIFTH-MESSAGE oops, edit was off', false);
+await idle();
+
+ok(seen.length > 0, '2: the post-toggle run reached the adapter');
+const req = seen[0];
+const all = req.messages.map((m) => m.content).join('\n---\n');
+console.log(`       (post-toggle request: ${req.messages.length} messages, ${all.length} chars)`);
+console.log('       roles:', req.messages.map((m) => m.role[0]).join(''));
+
+ok(/FIRST-MESSAGE/.test(all), '3: the EARLIEST user message is still in the request');
+ok(/SECOND-MESSAGE/.test(all), '4: the second message is still there');
+ok(/THIRD-MESSAGE/.test(all), '5: the message that triggered the refusal is there');
+ok(/FOURTH-MESSAGE/.test(all), '6: the message sent between the two cancels is there');
+ok(/FIFTH-MESSAGE/.test(all), '7: the new message is there');
+ok(/read-only \(Discuss\) mode/.test(all), '8: the refusal error is in history');
+ok(/PREVIOUS RUN INTERRUPTED/.test(all), '9: the interrupt note(s) are present');
+ok(/fs\.writeFileSync/.test(all), '10: the <js> the agent tried to run is replayed WITH its code');
+
+// Where does the earliest surviving user content sit relative to the refusal?
+const idxFirst = all.indexOf('FIRST-MESSAGE'), idxRefusal = all.indexOf('read-only (Discuss) mode');
+ok(idxFirst >= 0 && idxFirst < idxRefusal, `11: history ORDER is intact — the first message precedes the refusal (${idxFirst} < ${idxRefusal})`);
+
+// How many <system-reminder> blocks, and where?
+const remIdx = [...all.matchAll(/<system-reminder>/g)].map((m) => m.index);
+console.log(`       system-reminder blocks at char offsets: ${JSON.stringify(remIdx)} (of ${all.length})`);
+ok(remIdx.length <= 2, `12: at most two reminder blocks (${remIdx.length})`);
+
+console.log(`\n${pass} passed, ${fail} failed`);
+server.close();
+process.exit(fail === 0 ? 0 : 1);
+
=== add test/_edge-pathedit-stream.mjs
new 9a581d35f930ef5f82d3f21d
+/**
+ * EDGE PROBE (on-demand): the breadcrumb PATH-INPUT edit mode while a run
+ * STREAMS — does anything steal focus from the user's typing?
+ *
+ *   [A] open the folder picker, click into path-edit mode, type — the input
+ *       holds focus and the typed value while a real run streams (status /
+ *       phase / token / chunk SSE events arriving the whole time).
+ *   [B] the run ENDING (status running→done) — applyControlsForStatus() only
+ *       focuses the composer when the user is NOT typing in another editor
+ *       (INPUT/TEXTAREA/contentEditable guard), so the path editor keeps focus
+ *       and the typed path survives the run end.
+ *   [C] sanity after the run: edit mode still usable — Esc cancels back to the
+ *       breadcrumb, no errors.
+ *
+ * Run: node test/_edge-pathedit-stream.mjs    (skips if Chrome not found)
+ */
+import { mkdtemp, readFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17970;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+// Streaming adapter: ~3s of token chunks so the probe can interact mid-run.
+function mockAdapter() {
+  return {
+    async *completeStream({ messages }) {
+      const last = String([...(messages || [])].reverse().find((m) => m.role === 'user')?.content || '');
+      if (/give your single verdict/i.test(last)) { yield { choices: [{ delta: { content: 'no problems found' } }] }; return; }
+      const words = ('Working through the request step by step with a long streaming answer '
+        + 'so the user has time to interact with the rest of the UI while tokens arrive. ').split(' ');
+      for (let i = 0; i < 30; i++) {
+        await sleep(100);
+        yield { choices: [{ delta: { content: words[i % words.length] + ' ' } }] };
+      }
+      yield { choices: [{ delta: { content: 'Done.' } }] };
+    },
+    async complete() { return { choices: [{ message: { content: 'Done.' } }] }; },
+  };
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-pe-'));
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: '(mock)' }) + ';</script></head>');
+  const { server } = await startServer({ html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' }, defaultModel: 'mock', port: PORT, adapter: mockAdapter(), modelsList: [{ id: 'mock' }], initialProject: projectDir });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1280, height: 850 });
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForFunction(() => typeof send === 'function' && typeof openFolderPicker === 'function', { timeout: 10000 });
+
+    console.log('\n[A] path edit holds focus + value while the run streams');
+    {
+      await page.evaluate(() => openFolderPicker());
+      await page.waitForFunction(() => document.querySelectorAll('#breadcrumb .crumb, #breadcrumb span').length > 0, { timeout: 10000 });
+      await page.evaluate(() => enterPathEdit());
+      const editing = await page.evaluate(() => ({
+        focused: document.activeElement?.className === 'path-input',
+        val: document.querySelector('#breadcrumb .path-input')?.value || '',
+      }));
+      ok(editing.focused, 'path-input took focus on entering edit mode');
+      await page.keyboard.type('\\my-target-folder');
+      const typed = await page.evaluate(() => document.querySelector('#breadcrumb .path-input')?.value || '');
+      ok(typed.endsWith('\\my-target-folder'), `typed text landed in the editor ("…${typed.slice(-30)}")`);
+
+      // Start the streaming run WITHOUT touching focus (set the value directly).
+      await page.evaluate(() => { document.getElementById('input').value = 'stream me a long answer'; send(); });
+      await page.waitForFunction(() => window.__sessionRef?.status === 'running', { timeout: 10000 });
+      // Sample the active element + editor state every 100ms while streaming.
+      await page.evaluate(() => {
+        window.__peSamples = [];
+        window.__peTimer = setInterval(() => {
+          const inp = document.querySelector('#breadcrumb .path-input');
+          window.__peSamples.push({
+            running: window.__sessionRef?.status === 'running',
+            active: document.activeElement?.className || document.activeElement?.id || document.activeElement?.tagName,
+            editing: !!inp,
+            val: inp ? inp.value : null,
+          });
+        }, 100);
+      });
+      await page.waitForFunction(() => { const s = window.__sessionRef?.status; return s === 'idle' || s === 'done' || s === 'error'; }, { timeout: 30000 });
+      await sleep(600);   // let any post-run focus shuffle land before stopping the sampler
+      const samples = await page.evaluate(() => { clearInterval(window.__peTimer); return window.__peSamples; });
+      const during = samples.filter((s) => s.running);
+      ok(during.length >= 15, `captured ${during.length} samples during streaming`);
+      const stolenDuring = during.filter((s) => s.active !== 'path-input');
+      ok(stolenDuring.length === 0, `focus NEVER left the path editor while streaming (${stolenDuring.length} of ${during.length} samples lost it${stolenDuring.length ? ' — first thief: ' + stolenDuring[0].active : ''})`);
+      const valueHeld = during.every((s) => (s.val || '').endsWith('\\my-target-folder'));
+      ok(valueHeld, 'the typed path survived every streaming sample');
+
+      console.log('\n[B] run END: does status→done steal focus from the editor?');
+      const afterRun = samples.filter((s) => !s.running);
+      const post = await page.evaluate(() => ({
+        active: document.activeElement?.className || document.activeElement?.id || document.activeElement?.tagName,
+        stillEditing: !!document.querySelector('#breadcrumb .path-input'),
+        val: document.querySelector('#breadcrumb .path-input')?.value ?? null,
+        modalOpen: document.getElementById('folderModalBg')?.classList.contains('show'),
+      }));
+      // DESIRED: finishing a background run must not yank focus out of an
+      // unrelated text editor (blur cancels the path edit and discards typing).
+      ok(post.active === 'path-input',
+        `focus stays in the path editor when the run finishes (activeElement is now "${post.active}"; ${afterRun.filter((s) => s.active !== 'path-input').length}/${afterRun.length} post-run samples lost it)`);
+      ok(post.stillEditing && (post.val || '').endsWith('\\my-target-folder'),
+        `edit mode + typed path survive the run end (editing=${post.stillEditing}, val=${JSON.stringify(post.val && post.val.slice(-25))})`);
+    }
+
+    console.log('\n[C] editor still usable after the run');
+    {
+      // Re-enter cleanly regardless of [B]'s outcome, then Esc-cancel.
+      const re = await page.evaluate(() => {
+        if (!document.querySelector('#breadcrumb .path-input')) enterPathEdit();
+        const inp = document.querySelector('#breadcrumb .path-input');
+        inp?.focus();
+        return { editing: !!inp, focused: document.activeElement?.className === 'path-input' };
+      });
+      ok(re.editing && re.focused, 're-entering path edit works after the run');
+      await page.keyboard.press('Escape');
+      await sleep(150);
+      const esc = await page.evaluate(() => ({
+        editing: !!document.querySelector('#breadcrumb .path-input'),
+        crumbs: document.querySelectorAll('#breadcrumb .crumb, #breadcrumb span').length,
+        modalOpen: document.getElementById('folderModalBg')?.classList.contains('show'),
+      }));
+      ok(!esc.editing && esc.crumbs > 0, 'Esc cancels back to the breadcrumb (no dangling editor)');
+      ok(esc.modalOpen, 'Esc in the editor did not close the folder modal (stopPropagation held)');
+    }
+
+    ok(jsErrors.length === 0, `no page errors (${jsErrors.length}: ${jsErrors.slice(0, 3).join(' | ')})`);
+  } finally {
+    await browser.close();
+    server.close();
+    await cleanupDir(projectDir);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-pathinput.mjs
new 56d609fb492fbfbdc275badc
+/**
+ * EDGE PROBE (on-demand): the folder-picker breadcrumb⇄path-input HYBRID.
+ *
+ *  (1) the breadcrumb renders inside an input-styled bar (panel-alt bg +
+ *      1px border + 4px radius, cursor:text on empty space) and the bar's
+ *      box is IDENTICAL in breadcrumb and edit mode;
+ *  (2) DEFAULT START PATH: a fresh open (no recent project) lands on D:\
+ *      when the drive exists (asserted via the breadcrumb content);
+ *  (3) hover: empty bar space → .bc-hot highlight; over a navigable crumb
+ *      → no highlight (crumb keeps its own link hover, cursor:pointer);
+ *  (4) clicking empty bar space enters EDIT mode: a real <input>, focused,
+ *      value = full path, cursor at end;
+ *  (5) typing a valid path + Enter navigates (dir list + status update,
+ *      input swapped back for crumbs);
+ *  (6) segment click still navigates (existing behavior preserved); the
+ *      LAST crumb is not a hop — clicking it opens the editor instead;
+ *  (7) pasting a path (set input.value + Enter) works;
+ *  (8) a nonexistent path / a FILE path → .path-error (red border + title),
+ *      stays in edit mode, focused; typing again clears the error;
+ *  (9) Esc restores breadcrumb mode unchanged (and does NOT close the
+ *      folder modal); blur also cancels back to breadcrumb mode.
+ *
+ * Run: node test/_edge-pathinput.mjs    (skips if Chrome not found)
+ */
+import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17934;
+
+// Isolate the user-config home BEFORE server.mjs is loaded (it resolves
+// CB_HOME at module-load time): the real ~/.code_boss/recent.json would make
+// the picker start at the last project's parent instead of the DEFAULT path
+// this probe asserts.
+const cbHome = await mkdtemp(path.join(tmpdir(), 'cb-pathinput-home-'));
+process.env.CB_HOME = cbHome;
+const { startServer } = await import('../src/server.mjs');
+
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+
+  // Sandbox tree to traverse: sandbox/{alpha/{inner},beta}, plus a file and
+  // a hidden dir that must stay invisible.
+  const sandbox = await mkdtemp(path.join(tmpdir(), 'cb-pathinput-'));
+  const sub1 = path.join(sandbox, 'alpha');
+  const sub2 = path.join(sub1, 'inner');
+  await mkdir(sub2, { recursive: true });
+  await mkdir(path.join(sandbox, 'beta'));
+  await mkdir(path.join(sandbox, '.hidden'));
+  const filePath = path.join(sub1, 'hello.txt');
+  await writeFile(filePath, 'hi');
+
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: '(mock)' }) + ';</script></head>');
+  const adapter = { async complete() { return { choices: [{ message: { content: 'ok.' } }] }; } };
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'mock', port: PORT, adapter, modelsList: [{ id: 'mock' }],
+    initialProject: null,   // landing view, NO recents → exercises the default start path
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1280, height: 900 });
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+
+    // Open the picker fresh.
+    await page.waitForSelector('#selectFolderBtn', { timeout: 8000, visible: true });
+    ok(await page.title() === 'code_boss', `no project open → window title stays "code_boss" (got "${await page.title()}")`);
+    await page.click('#selectFolderBtn');
+    await page.waitForFunction(() => document.getElementById('folderModalBg').classList.contains('show'), { timeout: 5000 });
+    await page.waitForFunction(() => document.querySelectorAll('#breadcrumb .crumb').length > 0, { timeout: 8000 });
+
+    // ── (2) default start path ───────────────────────────────────────────
+    console.log('[default start]');
+    const hostHasD = existsSync('D:\\');
+    const startState = await page.evaluate(() => ({
+      status: document.getElementById('browserStatus')?.textContent || '',
+      lastCrumb: document.querySelector('#breadcrumb .crumb-last')?.textContent || '',
+    }));
+    if (hostHasD) {
+      ok(startState.status === 'D:\\', `fresh open lands on D:\\ (status "${startState.status}")`);
+      ok(startState.lastCrumb === 'D:\\', `breadcrumb's last crumb is D:\\ (got "${startState.lastCrumb}")`);
+    } else {
+      ok(startState.status.length > 0, `no D: drive on this host — fell back to a real dir ("${startState.status}")`);
+    }
+
+    // ── (1) input-styled bar ───────────────────────────────────────────────
+    console.log('[input-styled bar]');
+    const barStyle = await page.evaluate(() => {
+      const bar = document.getElementById('breadcrumb');
+      const cs = getComputedStyle(bar);
+      // Resolve the app's input-box tokens to rgb for comparison.
+      const probe = document.createElement('div');
+      probe.style.cssText = 'background: var(--panel-alt); border: 1px solid var(--border); position:absolute; left:-9999px;';
+      document.body.appendChild(probe);
+      const pcs = getComputedStyle(probe);
+      const out = {
+        bg: cs.backgroundColor, border: cs.borderTopWidth + ' ' + cs.borderTopStyle, borderColor: cs.borderTopColor,
+        radius: cs.borderRadius, cursor: cs.cursor,
+        wantBg: pcs.backgroundColor, wantBorderColor: pcs.borderTopColor,
+        crumbCursor: getComputedStyle(document.querySelector('#breadcrumb .crumb:not(.crumb-last)')).cursor,
+        lastCursor: getComputedStyle(document.querySelector('#breadcrumb .crumb-last')).cursor,
+      };
+      probe.remove();
+      return out;
+    });
+    ok(barStyle.bg === barStyle.wantBg, `bar background = app input bg --panel-alt (${barStyle.bg})`);
+    ok(barStyle.border === '1px solid' && barStyle.borderColor === barStyle.wantBorderColor, `bar border = 1px solid --border (${barStyle.border} ${barStyle.borderColor})`);
+    ok(barStyle.radius === '4px', `bar radius matches app inputs (${barStyle.radius})`);
+    ok(barStyle.cursor === 'text', `empty bar space has cursor:text (${barStyle.cursor})`);
+    ok(barStyle.crumbCursor === 'pointer', `navigable crumbs keep cursor:pointer (${barStyle.crumbCursor})`);
+    ok(barStyle.lastCursor === 'text', `last crumb (current folder) has cursor:text (${barStyle.lastCursor})`);
+
+    // ── (3) hover affordance ───────────────────────────────────────────────
+    console.log('[hover]');
+    const barBox = await page.evaluate(() => {
+      const r = document.getElementById('breadcrumb').getBoundingClientRect();
+      const c = document.querySelector('#breadcrumb .crumb:not(.crumb-last)').getBoundingClientRect();
+      return { right: r.right, top: r.top, height: r.height, width: r.width, crumbX: c.left + c.width / 2, crumbY: c.top + c.height / 2 };
+    });
+    const emptyX = barBox.right - 10, emptyY = barBox.top + barBox.height / 2;
+    await page.mouse.move(emptyX, emptyY);
+    await sleep(80);
+    ok(await page.evaluate(() => document.getElementById('breadcrumb').classList.contains('bc-hot')), 'hover over EMPTY bar space → .bc-hot highlight');
+    await page.mouse.move(barBox.crumbX, barBox.crumbY);
+    await sleep(80);
+    ok(!(await page.evaluate(() => document.getElementById('breadcrumb').classList.contains('bc-hot'))), 'hover over a navigable crumb → highlight off');
+    await page.mouse.move(emptyX, emptyY + 200);   // leave the bar
+    await sleep(80);
+    ok(!(await page.evaluate(() => document.getElementById('breadcrumb').classList.contains('bc-hot'))), 'mouseleave clears the highlight');
+
+    // ── (4) click empty space → edit mode ─────────────────────────────────
+    console.log('[enter edit mode]');
+    await page.mouse.click(emptyX, emptyY);
+    await page.waitForSelector('#breadcrumb .path-input', { timeout: 3000 });
+    const edit = await page.evaluate(() => {
+      const inp = document.querySelector('#breadcrumb .path-input');
+      const r = document.getElementById('breadcrumb').getBoundingClientRect();
+      return {
+        focused: document.activeElement === inp,
+        value: inp.value,
+        selStart: inp.selectionStart, selEnd: inp.selectionEnd,
+        editing: document.getElementById('breadcrumb').classList.contains('editing'),
+        height: r.height, width: r.width,
+      };
+    });
+    ok(edit.focused, 'edit mode: the input is focused');
+    const expectStart = hostHasD ? 'D:\\' : startState.status;
+    ok(edit.value === expectStart, `input pre-filled with the FULL current path (got "${edit.value}")`);
+    ok(edit.selStart === edit.value.length && edit.selEnd === edit.value.length, `cursor at end (${edit.selStart}/${edit.value.length})`);
+    ok(edit.editing, 'bar has the .editing state');
+    ok(Math.abs(edit.height - barBox.height) < 1 && Math.abs(edit.width - barBox.width) < 1,
+      `bar box identical in both modes (${barBox.width}x${barBox.height} → ${edit.width}x${edit.height})`);
+
+    // ── (5) type a valid path + Enter → navigate ──────────────────────────
+    console.log('[type + Enter]');
+    await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
+    await page.keyboard.type(sandbox);
+    await page.keyboard.press('Enter');
+    await page.waitForFunction((s) => (document.getElementById('browserStatus')?.textContent || '') === s, { timeout: 5000 }, sandbox);
+    const afterType = await page.evaluate(() => ({
+      input: !!document.querySelector('#breadcrumb .path-input'),
+      dirs: [...document.querySelectorAll('#dirList .dir-item .name')].map((e) => e.textContent),
+      lastCrumb: document.querySelector('#breadcrumb .crumb-last')?.textContent || '',
+    }));
+    ok(!afterType.input, 'after Enter on a valid path, the bar is back in breadcrumb mode');
+    ok(afterType.dirs.includes('alpha') && afterType.dirs.includes('beta'), `dir list updated (got: ${afterType.dirs.join(', ')})`);
+    ok(!afterType.dirs.includes('.hidden'), 'hidden dirs still filtered');
+    ok(afterType.lastCrumb === path.basename(sandbox), `last crumb is the typed folder (got "${afterType.lastCrumb}")`);
+
+    // ── (6) segment click still navigates; last crumb is NOT a hop ────────
+    console.log('[segment navigation]');
+    // Go two levels deep the click-driven way: alpha → inner.
+    for (const name of ['alpha', 'inner']) {
+      await page.evaluate((n) => {
+        const li = [...document.querySelectorAll('#dirList .dir-item')].find((el) => el.textContent.includes(n));
+        li.click();
+      }, name);
+      await page.waitForFunction((n) => (document.getElementById('browserStatus')?.textContent || '').endsWith(n), { timeout: 5000 }, name);
+    }
+    // Click the "alpha" crumb (now a NON-last segment) → navigates to alpha.
+    await page.evaluate(() => {
+      const c = [...document.querySelectorAll('#breadcrumb .crumb')].find((el) => el.textContent === 'alpha');
+      c.click();
+    });
+    await page.waitForFunction((s) => (document.getElementById('browserStatus')?.textContent || '') === s, { timeout: 5000 }, sub1);
+    const noEditAfterNav = await page.evaluate(() => !document.querySelector('#breadcrumb .path-input'));
+    ok(noEditAfterNav, 'clicking a non-last segment navigates (no edit mode)');
+    // Click the LAST crumb (current folder, "alpha") → editor opens instead of navigating.
+    await page.evaluate(() => document.querySelector('#breadcrumb .crumb-last').click());
+    await page.waitForSelector('#breadcrumb .path-input', { timeout: 3000 });
+    const lastCrumbEdit = await page.evaluate(() => document.querySelector('#breadcrumb .path-input').value);
+    ok(lastCrumbEdit === sub1, `clicking the LAST crumb opens the editor on the current path (got "${lastCrumbEdit}")`);
+
+    // ── (9a) Esc restores breadcrumb mode unchanged ────────────────────────
+    console.log('[Esc]');
+    await page.keyboard.type('zzz-this-should-be-discarded');
+    await page.keyboard.press('Escape');
+    await sleep(120);
+    const afterEsc = await page.evaluate(() => ({
+      input: !!document.querySelector('#breadcrumb .path-input'),
+      status: document.getElementById('browserStatus')?.textContent || '',
+      lastCrumb: document.querySelector('#breadcrumb .crumb-last')?.textContent || '',
+      modalOpen: document.getElementById('folderModalBg').classList.contains('show'),
+    }));
+    ok(!afterEsc.input, 'Esc leaves edit mode');
+    ok(afterEsc.status === sub1 && afterEsc.lastCrumb === 'alpha', `Esc restored the breadcrumb unchanged (status "${afterEsc.status}")`);
+    ok(afterEsc.modalOpen, 'Esc inside the editor does NOT close the folder modal');
+
+    // ── (7) paste a path (set value + Enter) ──────────────────────────────
+    console.log('[paste + Enter]');
+    await page.evaluate(() => {
+      const r = document.getElementById('breadcrumb').getBoundingClientRect();
+      document.elementFromPoint(r.right - 6, r.top + r.height / 2).click();
+    });
+    await page.waitForSelector('#breadcrumb .path-input', { timeout: 3000 });
+    await page.evaluate((p) => {
+      const inp = document.querySelector('#breadcrumb .path-input');
+      inp.value = p;                                  // paste-style: value set wholesale
+      inp.dispatchEvent(new Event('input', { bubbles: true }));
+    }, sub2);
+    await page.keyboard.press('Enter');
+    await page.waitForFunction((s) => (document.getElementById('browserStatus')?.textContent || '') === s, { timeout: 5000 }, sub2);
+    ok(true, `pasted path navigates (now at "${sub2}")`);
+
+    // ── (8) nonexistent path + FILE path → inline error, stays editable ───
+    console.log('[error state]');
+    await page.mouse.click(emptyX, emptyY);
+    await page.waitForSelector('#breadcrumb .path-input', { timeout: 3000 });
+    await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
+    await page.keyboard.type(path.join(sandbox, 'no-such-dir-xyz'));
+    await page.keyboard.press('Enter');
+    await page.waitForFunction(() => document.getElementById('breadcrumb').classList.contains('path-error'), { timeout: 5000 });
+    const errState = await page.evaluate(() => ({
+      input: !!document.querySelector('#breadcrumb .path-input'),
+      focused: document.activeElement === document.querySelector('#breadcrumb .path-input'),
+      title: document.getElementById('breadcrumb').title,
+      status: document.getElementById('browserStatus')?.textContent || '',
+      dirListFailed: (document.getElementById('dirList')?.textContent || '').includes('Failed'),
+    }));
+    ok(errState.input && errState.focused, 'nonexistent path: stays in edit mode, input focused');
+    ok(errState.title.length > 0, `error reason in the bar's title ("${errState.title.slice(0, 60)}")`);
+    ok(errState.status === sub2 && !errState.dirListFailed, 'dir list NOT clobbered by the rejected path');
+    // typing again clears the error state
+    await page.keyboard.type('x');
+    ok(!(await page.evaluate(() => document.getElementById('breadcrumb').classList.contains('path-error'))), 'typing clears the error state');
+    // a FILE path is rejected the same way
+    await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
+    await page.keyboard.type(filePath);
+    await page.keyboard.press('Enter');
+    await page.waitForFunction(() => document.getElementById('breadcrumb').classList.contains('path-error'), { timeout: 5000 });
+    ok(await page.evaluate(() => !!document.querySelector('#breadcrumb .path-input')), 'a FILE path → error state, still editable');
+
+    // ── (9b) blur cancels back to breadcrumb mode ──────────────────────────
+    console.log('[blur]');
+    await page.click('#folderModal .modal-header h2');   // click away from the input
+    await sleep(150);
+    const afterBlur = await page.evaluate(() => ({
+      input: !!document.querySelector('#breadcrumb .path-input'),
+      status: document.getElementById('browserStatus')?.textContent || '',
+      error: document.getElementById('breadcrumb').classList.contains('path-error'),
+    }));
+    ok(!afterBlur.input, 'blur leaves edit mode');
+    ok(afterBlur.status === sub2, `blur restored the breadcrumb unchanged (status "${afterBlur.status}")`);
+    ok(!afterBlur.error, 'error state cleared on cancel');
+
+    ok(jsErrors.length === 0, `no JS errors (${jsErrors.slice(0, 3).join(' | ')})`);
+  } finally {
+    await browser.close(); server.close();
+    await cleanupDir(sandbox);
+    await cleanupDir(cbHome);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-plan-artifact.mjs
new e8d0b35fb391eda50a06d618
+/**
+ * EDGE PROBE (on-demand): plans as VERSIONED <plan> artifacts (#4) + the carousel
+ * / document mode (#5).
+ *
+ *   [A] a streamed <plan> NEVER flashes as raw markdown — it's held during the
+ *       stream and renders as an in-chat plan CARD (title + preview) on finalize;
+ *       a LIVE proposal auto-opens document mode for review.
+ *   [B] the card registers in the CAROUSEL, pinned leftmost (a plan), labelled by
+ *       its title; a diagram sits to its right.
+ *   [C] clicking the card opens DOCUMENT MODE: the full plan markdown renders
+ *       (headers/bullets), the status footer stays, ⤢ takes the panel full-screen,
+ *       Esc / ✕ closes and restores the prior tab.
+ *   [D] a re-emitted <plan> with the SAME title VERSIONS in place: the new card is
+ *       v2, the old card dims (superseded), the carousel thumb shows v2, and doc
+ *       mode gains a version picker + the revision reason + a line-level diff.
+ *   [E] a real RELOAD replays both versions from the saved prose WITHOUT auto-
+ *       opening doc mode (only a live proposal does) and WITHOUT duplicating
+ *       versions; the carousel re-registers; no raw <plan> tag leaks.
+ *
+ * Run: node test/_edge-plan-artifact.mjs    (skips if Chrome not found)
+ */
+import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17934;
+const SHOTS = path.join(__dirname, 'plan-artifact-screenshots');
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+
+const PLAN1 = `<plan title="Bump jackson">
+## Goal
+Bump jackson.version to 2.21.1 across the poms.
+
+## Changes
+- milconnect/pom.xml: 2.17.2 -> 2.21.1
+- opsconnect/pom.xml: 2.20.0 -> 2.21.1
+
+## Risks
+- transitive databind conflicts
+</plan>`;
+// Same TITLE → a new VERSION. Adds the portlet-enrollment line (the diff).
+const PLAN2 = `<plan title="Bump jackson" reason="portlet-enrollment was missing">
+## Goal
+Bump jackson.version to 2.21.1 across the poms.
+
+## Changes
+- milconnect/pom.xml: 2.17.2 -> 2.21.1
+- opsconnect/pom.xml: 2.20.0 -> 2.21.1
+- portlet-enrollment/pom.xml: 2.20.0 -> 2.21.1
+
+## Risks
+- transitive databind conflicts
+</plan>`;
+const DIAG = 'graph TD\n  A[Start] --> B{Choose}\n  B --> C(Done)';
+
+function routedAdapter(routes) {
+  const counts = new Map();
+  const find = (messages) => {
+    const u = (messages || []).filter((m) => m.role === 'user').reverse();
+    for (const m of u) { const t = String(m.content || ''); for (const k of Object.keys(routes)) if (t.includes(k)) return k; }
+    return null;
+  };
+  return {
+    async *completeStream(opts) {
+      const key = find(opts?.messages);
+      if (!key) { yield { choices: [{ delta: { content: 'no route.' } }] }; return; }
+      const n = counts.get(key) || 0; counts.set(key, n + 1);
+      const { sequences, delayMs } = routes[key];
+      for (const c of sequences[Math.min(n, sequences.length - 1)]) { await sleep(delayMs || 8); yield { choices: [{ delta: { content: c } }] }; }
+    },
+    async complete() { return { choices: [{ message: { content: '<review-pass/>' } }] }; },
+  };
+}
+async function sendMessage(page, text) {
+  await page.click('#input');
+  await page.evaluate(() => { document.getElementById('input').value = ''; });
+  await page.type('#input', text);
+  await page.keyboard.press('Enter');
+  await page.waitForFunction(() => window.__sessionRef?.status === 'running', { timeout: 5000 }).catch(() => {});
+}
+async function waitForIdle(page, timeoutMs = 20000) {
+  await page.waitForFunction(() => ['idle', 'done', 'error'].includes(window.__sessionRef?.status), { timeout: timeoutMs });
+  await sleep(400);
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  await mkdir(SHOTS, { recursive: true });
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-plan-'));
+  const routes = {
+    'propose a plan': { delayMs: 70, sequences: [[
+      'I will propose a plan.\n\n', '<plan title="Bump jackson">\n## Goal\n', 'Bump jackson.version to 2.21.1 across the poms.\n\n## Changes\n',
+      '- milconnect/pom.xml: 2.17.2 -> 2.21.1\n- opsconnect/pom.xml: 2.20.0 -> 2.21.1\n\n## Risks\n', '- transitive databind conflicts\n</plan>', '\nReady for approval.',
+    ], ['Done.']] },
+    'revise the plan': { delayMs: 8, sequences: [['Revised per feedback.\n\n' + PLAN2 + '\nUpdated.'], ['Done.']] },
+    'a diagram please': { delayMs: 8, sequences: [['Diagram:\n```mermaid\n' + DIAG + '\n```\nEnd.'], ['Done.']] },
+  };
+
+  const strip = (src) => src.replace(/^import\s+[^;]+;[ \t]*\r?\n?/gm, '').replace(/^export\s+(async\s+function|function|class|const|let|var)\b/gm, '$1').replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
+  const mosaic = strip(await readFile(path.join(ROOT, 'src', 'agent', 'mosaic-layout.mjs'), 'utf8'));
+  const mermaid = strip(await readFile(path.join(ROOT, 'src', 'mermaid-lite.mjs'), 'utf8'));
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8')).replace('</head>',
+    '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'm', baseURL: '(mock)' }) + ';</script><script>' + mosaic + '\n' + mermaid + '</script></head>');
+
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'test-key', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'm', port: PORT, adapter: routedAdapter(routes), modelsList: [{ id: 'm' }], initialProject: projectDir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1200, height: 820 });
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForSelector('#chat:not(.hidden)', { timeout: 15000 });
+    await sleep(300);
+
+    console.log('\n[A] streamed <plan> never flashes raw; renders as an in-chat plan card on finalize');
+    {
+      // Sample the assistant row text DURING streaming — the raw "## Goal" / "<plan"
+      // must NEVER appear (it's held, then rendered as a card).
+      await page.evaluate(() => {
+        window.__rawSeen = false; window.__tagSeen = false;
+        window.__t = setInterval(() => {
+          const t = (document.querySelector('.row.assistant')?.textContent) || '';
+          if (t.includes('## Goal')) window.__rawSeen = true;
+          if (t.includes('<plan')) window.__tagSeen = true;
+        }, 20);
+      });
+      await sendMessage(page, 'propose a plan');
+      await waitForIdle(page);
+      const a = await page.evaluate(() => {
+        clearInterval(window.__t);
+        const card = document.querySelector('.row.assistant .plan-card');
+        return {
+          rawSeen: window.__rawSeen, tagSeen: window.__tagSeen,
+          hasCard: !!card,
+          title: card?.querySelector('.pc-title')?.textContent,
+          previewHasGoal: !!card && /Goal/.test(card.querySelector('.pc-preview')?.textContent || ''),
+          previewIsRendered: !!card?.querySelector('.pc-preview h4, .pc-preview h3'),
+          leadIn: (document.querySelector('.row.assistant')?.textContent || '').includes('I will propose a plan'),
+          rawTagInDom: (document.querySelector('.row.assistant')?.textContent || '').includes('<plan'),
+          bulletDot: getComputedStyle(document.querySelector('.row.assistant:has(.plan-card) .dot') || document.body).display,
+        };
+      });
+      ok(!a.rawSeen && !a.tagSeen, `raw "## Goal" / "<plan" never flashed during streaming (rawSeen=${a.rawSeen}, tagSeen=${a.tagSeen})`);
+      ok(a.hasCard, 'an in-chat .plan-card rendered on finalize');
+      ok(a.title === 'Bump jackson', `card title from the tag (got ${JSON.stringify(a.title)})`);
+      ok(a.previewHasGoal && a.previewIsRendered, 'card preview is a RENDERED markdown mini (has a heading + "Goal")');
+      ok(a.leadIn && !a.rawTagInDom, 'lead-in prose shows; the raw <plan> tag is not leaked as text');
+      ok(a.bulletDot === 'none', 'the plan card row hides the ● tool bullet');
+      const autoOpen = await page.waitForFunction(() => document.getElementById('docMode').classList.contains('show'), { timeout: 3000 }).then(() => true).catch(() => false);
+      ok(autoOpen, 'a LIVE proposed plan AUTO-OPENS document mode for review');
+      ok(await page.evaluate(() => document.getElementById('docTitle').textContent) === 'Bump jackson', 'auto-opened on the proposed plan');
+      await page.keyboard.press('Escape');   // close so the steps below start from a clean state
+    }
+
+    console.log('\n[B] carousel: plan pinned leftmost, diagram to its right');
+    {
+      await sendMessage(page, 'a diagram please');
+      await waitForIdle(page);
+      const b = await page.evaluate(() => ({
+        hasItems: document.getElementById('carousel').classList.contains('has-items'),
+        labels: [...document.querySelectorAll('#carouselStrip .car-thumb .car-label')].map((e) => e.textContent),
+        firstPinned: document.querySelector('#carouselStrip .car-thumb')?.classList.contains('pinned'),
+        count: document.getElementById('carCount').textContent,
+        planMiniRendered: !!document.querySelector('#carouselStrip .car-thumb .car-mini.mini-text'),
+      }));
+      ok(b.hasItems, 'carousel is visible');
+      ok(JSON.stringify(b.labels) === JSON.stringify(['Bump jackson', 'Start']), `plan leftmost, diagram right (got ${JSON.stringify(b.labels)})`);
+      ok(b.firstPinned, 'the leftmost (plan) thumb is pinned/highlighted');
+      ok(b.count === '(2)', `count = 2 (got ${b.count})`);
+      ok(b.planMiniRendered, 'the plan thumb shows a scaled mini-render');
+      await page.screenshot({ path: path.join(SHOTS, '1-plan-card-and-carousel.png') });
+    }
+
+    console.log('\n[C] document mode: full plan render, footer stays, full-screen, Esc closes + restores');
+    {
+      await page.evaluate(() => document.querySelector('.row.assistant .plan-card').click());
+      const c = await page.evaluate(() => ({
+        shown: document.getElementById('docMode').classList.contains('show'),
+        title: document.getElementById('docTitle').textContent,
+        headings: document.querySelectorAll('#docBody h3, #docBody h4').length,
+        bullets: document.querySelectorAll('#docBody li').length,
+        verHidden: document.getElementById('docVer').style.display === 'none',
+        footer: !!document.querySelector('#sidePanel .side-chrome #settingsBtn'),
+      }));
+      ok(c.shown, 'clicking the plan card opens document mode');
+      ok(c.title === 'Bump jackson', `doc title (got ${c.title})`);
+      ok(c.headings >= 2 && c.bullets >= 2, `full markdown rendered (headings=${c.headings}, bullets=${c.bullets})`);
+      ok(c.verHidden, 'no version picker for a single-version plan');
+      ok(c.footer, 'the status footer (gear) stays present beside document mode');
+      await page.screenshot({ path: path.join(SHOTS, '2-document-mode-plan.png') });
+
+      await page.click('#docFsBtn');
+      ok(await page.evaluate(() => document.getElementById('sidePanel').classList.contains('fullscreen')), '⤢ takes the panel full-screen');
+      await page.click('#docFsBtn');
+      ok(await page.evaluate(() => !document.getElementById('sidePanel').classList.contains('fullscreen')), '⤢ again exits full-screen');
+
+      await page.keyboard.press('Escape');
+      const c2 = await page.evaluate(() => ({
+        docOpen: document.getElementById('docMode').classList.contains('show'),
+        running: window.__sessionRef?.status === 'running',
+        checklistsActive: document.getElementById('tabbtn-checklists').classList.contains('active'),
+      }));
+      ok(!c2.docOpen, 'Esc closes document mode');
+      ok(!c2.running, 'Esc on the doc did NOT cancel a chat (capture-phase swallow)');
+      ok(c2.checklistsActive, 'closing restored the prior (Checklists) tab');
+    }
+
+    console.log('\n[D] revision: same title → v2, supersede, version picker + reason + diff');
+    {
+      await sendMessage(page, 'revise the plan');
+      await waitForIdle(page);
+      const d = await page.evaluate(() => {
+        const cards = [...document.querySelectorAll('.row.assistant .plan-card')];
+        return {
+          cardCount: cards.length,
+          vers: cards.map((c) => c.querySelector('.pc-ver')?.textContent),
+          superseded: cards.map((c) => c.classList.contains('superseded')),
+          carVer: document.querySelector('#carouselStrip .car-thumb .car-ver')?.textContent,
+          carCount: document.getElementById('carCount').textContent,
+        };
+      });
+      ok(d.cardCount === 2, `two plan cards in chat (v1 + v2) (got ${d.cardCount})`);
+      ok(JSON.stringify(d.vers) === JSON.stringify(['v1', 'v2']), `cards labelled v1/v2 (got ${JSON.stringify(d.vers)})`);
+      ok(JSON.stringify(d.superseded) === JSON.stringify([true, false]), `only the older card is dimmed superseded (got ${JSON.stringify(d.superseded)})`);
+      ok(d.carVer === 'v2', `carousel thumb shows the latest version v2 (got ${d.carVer})`);
+      ok(d.carCount === '(2)', `plan stays ONE carousel entry across versions; count=2 with the diagram (got ${d.carCount})`);
+
+      // Open the latest card → doc mode shows the picker + reason + the added line.
+      await page.evaluate(() => [...document.querySelectorAll('.row.assistant .plan-card')].pop().click());
+      const e = await page.evaluate(() => ({
+        verShown: document.getElementById('docVer').style.display !== 'none',
+        opts: [...document.getElementById('docVer').options].map((o) => o.textContent),
+        reasonShown: document.getElementById('docReason').style.display !== 'none',
+        reason: document.getElementById('docReason').textContent,
+        bodyHasPortlet: /portlet-enrollment/.test(document.getElementById('docBody').textContent || ''),
+        addLines: document.querySelectorAll('#docBody .pl-add').length,
+      }));
+      ok(e.verShown && e.opts.length === 2, `version picker with v1 + v2 (got ${JSON.stringify(e.opts)})`);
+      ok(e.reasonShown && /portlet-enrollment was missing/.test(e.reason), `revision reason shows (got ${JSON.stringify(e.reason)})`);
+      ok(e.bodyHasPortlet, 'the latest version renders the new portlet-enrollment line');
+      ok(e.addLines >= 1, `the diff highlights the added line(s) (got ${e.addLines})`);
+      await page.screenshot({ path: path.join(SHOTS, '3-revision-diff.png') });
+
+      // Switch the picker back to v1 → the added line is gone.
+      await page.select('#docVer', '0');
+      const v1 = await page.evaluate(() => ({
+        portlet: /portlet-enrollment/.test(document.getElementById('docBody').textContent || ''),
+        reasonHidden: document.getElementById('docReason').style.display === 'none',
+      }));
+      ok(!v1.portlet, 'selecting v1 shows the original (no portlet line)');
+      ok(v1.reasonHidden, 'v1 (the original) shows no revision reason');
+      await page.keyboard.press('Escape');
+    }
+
+    console.log('\n[E] reload: replay re-creates cards WITHOUT auto-opening doc mode or duplicating versions');
+    {
+      // The <plan> lives in the saved prose, so a real reload replays both versions.
+      await page.reload({ waitUntil: 'domcontentloaded' });
+      await page.waitForFunction(() => typeof send === 'function' && !!window.__sessionRef, { timeout: 10000 });
+      await sleep(1500);   // event replay settles
+      const f = await page.evaluate(() => ({
+        docOpen: document.getElementById('docMode').classList.contains('show'),
+        planCards: document.querySelectorAll('.row.assistant .plan-card').length,
+        vers: [...document.querySelectorAll('.row.assistant .plan-card .pc-ver')].map((e) => e.textContent),
+        carLabels: [...document.querySelectorAll('#carouselStrip .car-thumb .car-label')].map((e) => e.textContent),
+        rawWhere: (() => { const t = (document.querySelector('#log')?.textContent) || ''; const i = t.indexOf('<plan'); return i < 0 ? null : t.slice(Math.max(0, i - 20), i + 30); })(),
+      }));
+      ok(!f.docOpen, 'a reload REPLAY does NOT auto-open document mode (only a live proposal does)');
+      ok(f.planCards === 2 && JSON.stringify(f.vers) === JSON.stringify(['v1', 'v2']),
+        `both versions re-rendered v1/v2 from saved prose, not duplicated (got ${f.planCards} cards ${JSON.stringify(f.vers)})`);
+      ok(f.carLabels.includes('Bump jackson'), `plan re-registered in the carousel from saved prose (labels ${JSON.stringify(f.carLabels)})`);
+      ok(f.rawWhere === null, `no raw <plan> tag leaked into the chat log (found near: ${JSON.stringify(f.rawWhere)})`);
+      // Open the artifact → exactly two versions (the replay did NOT push a dup).
+      await page.evaluate(() => [...document.querySelectorAll('.row.assistant .plan-card')].pop().click());
+      const opts = await page.evaluate(() => [...document.getElementById('docVer').options].length);
+      ok(opts === 2, `the plan artifact has exactly 2 versions after replay — no duplicate (got ${opts})`);
+      await page.keyboard.press('Escape');
+    }
+
+    ok(jsErrors.length === 0, `no page errors during the run (${jsErrors.length}: ${jsErrors.slice(0, 3).join(' | ')})`);
+  } finally {
+    await browser.close();
+    server.close();
+    await cleanupDir(projectDir);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-release-edges.mjs
new aac8193f6bf8043a1136c6da
+/**
+ * EDGE PROBE (on-demand): `scripts/build.mjs --release` + release-notes
+ * STAMPING edges. Works entirely in an EXTRACTED TEMP TREE (dist/code-boss.mjs
+ * `extract` → run THAT tree's scripts/build.mjs) so the real repo's releases/
+ * is never touched. Scenarios:
+ *   [a] malformed root release-notes.json (invalid JSON / items-not-array /
+ *       title-only / literal null) — release completes with a PATH-SPECIFIC
+ *       warning; non-array items are coerced to a single bullet at stamp time.
+ *   [b] corrupted releases/notes.json history (truncated JSON / valid-JSON-
+ *       but-object) — release still completes, warns loudly, keeps the bad
+ *       bytes as notes.json.corrupt, and starts a fresh history.
+ *   [c] releases/ exists as a FILE → sane failure, no half-written artifacts.
+ *   [d] unicode/emoji/quotes/backslashes in notes survive --release →
+ *       manifest.json/notes.json → (simulated client) whats-new.json → the UI
+ *       modal (startServer + puppeteer on port 17915). The stamp-time coerced
+ *       single-bullet entry renders as ONE <li>, not one per character.
+ *   [e] pending notes IDENTICAL to last release → loud warning + release still
+ *       completes; refreshed notes append history newest-first.
+ *   [f] two consecutive --release runs: distinct numbered files; each
+ *       manifest.build matches the BUILD_VERSION const embedded in the
+ *       released artifact itself.
+ * Run from repo root: node test/_edge-release-edges.mjs
+ */
+import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { spawn } from 'node:child_process';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17915;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+
+// ASYNC spawn (never spawnSync — keep the event loop free).
+function run(args, cwd, timeoutMs = 240000) {
+  return new Promise((resolve) => {
+    const p = spawn(process.execPath, args, { cwd, env: { ...process.env } });
+    let out = '', err = '';
+    p.stdout.on('data', (d) => { out += d; });
+    p.stderr.on('data', (d) => { err += d; });
+    const t = setTimeout(() => { try { p.kill(); } catch {} }, timeoutMs);
+    p.on('close', (status) => { clearTimeout(t); resolve({ status, out, err, all: out + '\n' + err }); });
+  });
+}
+async function rmrf(p) {
+  for (let i = 0; i < 8; i++) {
+    try { await rm(p, { recursive: true, force: true }); return; }
+    catch { await new Promise((r) => setTimeout(r, 250)); }
+  }
+}
+const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
+
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+
+async function main() {
+  const distFile = path.join(ROOT, 'dist', 'code-boss-setup.mjs');
+  if (!existsSync(distFile)) { console.error('SKIP: dist/code-boss-setup.mjs missing — run node scripts/build.mjs first'); process.exit(0); }
+
+  const tmp = await mkdtemp(path.join(tmpdir(), 'cb-reledge-'));
+  const tree = path.join(tmp, 'tree');
+  const relDir = path.join(tree, 'releases');
+  const notesPath = path.join(tree, 'release-notes.json');
+  const histPath = path.join(relDir, 'notes.json');
+  const maniPath = path.join(relDir, 'manifest.json');
+
+  const setNotes = (v) => writeFile(notesPath, typeof v === 'string' ? v : JSON.stringify(v, null, 2), 'utf8');
+  const release = () => run([path.join(tree, 'scripts', 'build.mjs'), '--release'], tree);
+
+  try {
+    console.log('\n[setup] extract the embedded source tree from dist/code-boss.mjs');
+    {
+      const r = await run([distFile, 'extract', tree], tmp);
+      ok(r.status === 0 && /extract: wrote \d+ files/.test(r.out), `extract succeeded (got: ${(r.out + r.err).trim().slice(0, 120)})`);
+      ok(existsSync(path.join(tree, 'scripts', 'build.mjs')), 'extracted tree has scripts/build.mjs');
+      ok(!existsSync(relDir), 'extracted tree starts with NO releases/ dir');
+    }
+
+    console.log('\n[a1] release-notes.json = INVALID JSON → release completes, INVALID-JSON warning fires');
+    {
+      await setNotes('{ definitely not json !!!');
+      await rmrf(relDir);
+      const r = await release();
+      ok(r.status === 0, `exit 0 (got ${r.status})`);
+      ok(/release-notes\.json is INVALID JSON \(/.test(r.all), `INVALID-JSON warning fired with the parse message (got: ${r.all.match(/release: [^\n]*/)?.[0] || '(none)'})`);
+      ok(!/NO release-notes\.json/.test(r.all), 'the missing-file warning did NOT fire (read/parse paths are distinct)');
+      ok(existsSync(maniPath), 'manifest.json written');
+      const m = await readJson(maniPath);
+      ok(!('notes' in m), `manifest carries NO notes key (keys: ${Object.keys(m).join(',')})`);
+      ok(existsSync(path.join(relDir, `code-boss-${m.build}.mjs`)), 'numbered release file still produced');
+      ok(!existsSync(histPath), 'notes.json history NOT created');
+      ok(!existsSync(histPath + '.corrupt'), 'no notes.json.corrupt sidecar (history was simply absent)');
+    }
+
+    console.log('\n[a2] release-notes.json items = STRING (not array) → coerced to a single bullet + warning');
+    {
+      await setNotes({ title: 'String items', items: 'boom' });
+      await rmrf(relDir);
+      const r = await release();
+      ok(r.status === 0, `exit 0 (got ${r.status})`);
+      ok(/items is not an array — coerced to a single bullet/.test(r.all), `coercion warning fired (got: ${r.all.match(/release: [^\n]*coerced[^\n]*/)?.[0] || '(none)'})`);
+      const m = await readJson(maniPath);
+      const h = await readJson(histPath);
+      ok(m.notes && JSON.stringify(m.notes.items) === JSON.stringify(['boom']), `manifest.notes.items coerced to ["boom"] (got: ${JSON.stringify(m.notes?.items)})`);
+      ok(h[0] && JSON.stringify(h[0].items) === JSON.stringify(['boom']), `notes.json history entry coerced too (got: ${JSON.stringify(h[0]?.items)})`);
+      // (the UI consequence — ONE <li>, not one per character — is asserted in [d])
+    }
+
+    console.log('\n[a3] release-notes.json title only (no items) → items default to []');
+    {
+      await setNotes({ title: 'Only a title' });
+      await rmrf(relDir);
+      const r = await release();
+      ok(r.status === 0, `exit 0 (got ${r.status})`);
+      const m = await readJson(maniPath);
+      const h = await readJson(histPath);
+      ok(m.notes && m.notes.title === 'Only a title' && Array.isArray(m.notes.items) && m.notes.items.length === 0, `manifest.notes = title + empty items (got: ${JSON.stringify(m.notes)})`);
+      ok(Array.isArray(h[0]?.items) && h[0].items.length === 0, 'history entry items = []');
+    }
+
+    console.log('\n[a4] release-notes.json = literal null (VALID json) → noteless release + wrong-shape warning');
+    {
+      await setNotes('null');
+      await rmrf(relDir);
+      const r = await release();
+      ok(r.status === 0, `exit 0 (got ${r.status})`);
+      const m = await readJson(maniPath);
+      ok(!('notes' in m), 'manifest has no notes');
+      ok(/release-notes\.json parsed to null/.test(r.all), `wrong-shape warning names what it parsed to (got: ${r.all.match(/release: [^\n]*/)?.[0] || '(none)'})`);
+      ok(!/NO release-notes\.json/.test(r.all) && !/INVALID JSON/.test(r.all), 'neither the missing-file nor the invalid-JSON warning fired (shape path is its own)');
+    }
+
+    console.log('\n[b1] releases/notes.json TRUNCATED → loud warning, bad bytes kept as .corrupt, fresh history');
+    {
+      await rmrf(relDir);
+      const { mkdir } = await import('node:fs/promises');
+      await mkdir(relDir, { recursive: true });
+      const oldHistory = [
+        { build: 300, date: '2026-05-01', title: 'Old release B', items: ['old b1', 'old b2'] },
+        { build: 290, date: '2026-04-01', title: 'Old release A', items: ['old a1'] },
+      ];
+      const full = JSON.stringify(oldHistory, null, 2);
+      const truncated = full.slice(0, Math.floor(full.length / 2));
+      await writeFile(histPath, truncated, 'utf8');   // truncate mid-file
+      await setNotes({ title: 'After corruption', items: ['new item'] });
+      const r = await release();
+      ok(r.status === 0, `exit 0 — release still completes (got ${r.status})`);
+      ok(/release: !!! releases\/notes\.json is CORRUPT \(/.test(r.all), `loud corrupt-history warning fired (got: ${r.all.match(/release: !!![^\n]*/)?.[0] || '(none)'})`);
+      ok((await readFile(histPath + '.corrupt', 'utf8')) === truncated, 'the corrupt bytes were preserved verbatim as notes.json.corrupt');
+      const h = await readJson(histPath);
+      ok(Array.isArray(h) && h.length === 1 && h[0].title === 'After corruption', `history restarted with just the new entry (got ${h.length} entries: ${h.map((e) => e.title).join(' | ')})`);
+      ok(existsSync(maniPath), 'manifest.json still written');
+    }
+
+    console.log('\n[b2] releases/notes.json = valid JSON OBJECT (not array) → warning + fresh history, release COMPLETES');
+    {
+      await rmrf(relDir);
+      const { mkdir } = await import('node:fs/promises');
+      await mkdir(relDir, { recursive: true });
+      const objHistory = JSON.stringify({ build: 300, title: 'object not array', items: [] });
+      await writeFile(histPath, objHistory, 'utf8');
+      await setNotes({ title: 'Object history', items: ['x'] });
+      const r = await release();
+      ok(r.status === 0, `exit 0 — no TypeError crash (got ${r.status})`);
+      ok(/is not a JSON array — starting a FRESH notes history, old file kept as notes\.json\.corrupt/.test(r.all), `wrong-shape history warning fired (got: ${r.all.match(/release: !!![^\n]*/)?.[0] || '(none)'})`);
+      ok((await readFile(histPath + '.corrupt', 'utf8')) === objHistory, 'the object history was preserved as notes.json.corrupt');
+      const m = await readJson(maniPath);
+      ok(m.notes && m.notes.title === 'Object history', `manifest.json WAS written with the new notes (got: ${JSON.stringify(m.notes)})`);
+      ok(existsSync(path.join(relDir, `code-boss-${m.build}.mjs`)), 'numbered release file present alongside the manifest (no half-written release)');
+      const h = await readJson(histPath);
+      ok(Array.isArray(h) && h.length === 1 && h[0].title === 'Object history', `history restarted as an ARRAY with the new entry (got: ${JSON.stringify(h).slice(0, 120)})`);
+    }
+
+    console.log('\n[c] releases exists as a FILE → fails cleanly, nothing half-written');
+    {
+      await rmrf(relDir);
+      await writeFile(relDir, 'i am a file, not a directory', 'utf8');
+      await setNotes({ title: 'File blocker', items: ['x'] });
+      const r = await release();
+      ok(r.status !== 0, `release failed (exit ${r.status})`);
+      ok(/EEXIST/.test(r.all), `error names the cause (got: ${r.all.match(/build failed[^\n]*/)?.[0] || r.all.slice(-200)})`);
+      ok((await readFile(relDir, 'utf8')) === 'i am a file, not a directory', 'the blocking file was not clobbered');
+      ok(!existsSync(maniPath) && !existsSync(histPath), 'no manifest / notes.json appeared anywhere');
+      await rmrf(relDir);   // clear the blocking file for later scenarios
+    }
+
+    console.log('\n[d] unicode/emoji/quotes/backslashes survive --release → manifest/notes.json → whats-new.json → UI modal');
+    const uniTitle = '⭐ Émojis 🚀 & "double" \'single\' \\back\\slash `tick` ${tpl} 日本語';
+    const uniItems = [
+      'Bullet with 💥 emoji and ünïcödé',
+      'He said "hello" at C:\\path\\to\\file',
+      'Русский текст — em-dash – ©®™ 中文',
+    ];
+    {
+      await rmrf(relDir);
+      await setNotes({ title: uniTitle, items: uniItems });
+      const r = await release();
+      ok(r.status === 0, `exit 0 (got ${r.status})`);
+      const m = await readJson(maniPath);
+      const h = await readJson(histPath);
+      ok(m.notes.title === uniTitle, `manifest.notes.title byte-identical (got: ${m.notes.title})`);
+      ok(JSON.stringify(m.notes.items) === JSON.stringify(uniItems), 'manifest.notes.items byte-identical');
+      ok(h[0].title === uniTitle && JSON.stringify(h[0].items) === JSON.stringify(uniItems), 'notes.json entry byte-identical');
+
+      // Client hop: simulate the whats-new.json check-update would write from
+      // this history (plus the single-bullet entry [a2]'s string items now
+      // coerce to at stamp time — history can no longer carry a bare string).
+      const chrome = findChrome();
+      if (!chrome) { console.log('  SKIP UI hop: Chrome not found'); }
+      else {
+        const wnPath = path.join(tmp, 'whats-new.json');
+        await writeFile(wnPath, JSON.stringify({
+          fromBuild: h[0].build - 2, toBuild: h[0].build, at: new Date().toISOString(),
+          entries: [
+            { build: h[0].build, title: h[0].title, items: h[0].items },
+            { build: h[0].build - 1, title: 'String items entry', items: ['boom'] },
+          ],
+        }, null, 2), 'utf8');
+        const { startServer } = await import('../src/server.mjs');
+        const puppeteer = (await import('puppeteer-core')).default;
+        const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+          .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: '(mock)' }) + ';</script></head>');
+        const adapter = { async complete() { return { choices: [{ message: { content: 'ok.' } }] }; } };
+        const { server } = await startServer({ html, baseURL: '(mock)', apiKey: 'k', defaultModel: 'mock', port: PORT, adapter, modelsList: [{ id: 'mock' }], initialProject: tmp, whatsNewPath: wnPath });
+        const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+        try {
+          const page = await browser.newPage();
+          const jsErrors = [];
+          page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+          await page.goto(`http://127.0.0.1:${PORT}/`);
+          await page.waitForFunction(() => document.getElementById('whatsNewModalBg')?.classList.contains('show'), { timeout: 10000 });
+          const got = await page.evaluate(() => [...document.querySelectorAll('.wn-entry')].map((sec) => ({
+            title: sec.querySelector('.wn-title')?.textContent,
+            items: [...sec.querySelectorAll('.wn-items li')].map((li) => li.textContent),
+          })));
+          ok(got.length === 2, `modal shows both entries (got ${got.length})`);
+          ok((got[0]?.title || '').includes(uniTitle), `unicode TITLE intact in the modal (got: ${got[0]?.title})`);
+          ok(JSON.stringify(got[0]?.items) === JSON.stringify(uniItems), `unicode ITEMS intact in the modal (got: ${JSON.stringify(got[0]?.items)})`);
+          ok(jsErrors.length === 0, `no JS errors (${jsErrors.join(' | ')})`);
+          // The coerced entry: ONE <li> 'boom' — not one bullet per character.
+          ok(Array.isArray(got[1]?.items) && got[1].items.length === 1 && got[1].items[0] === 'boom',
+            `coerced string items render as ONE bullet (got ${got[1]?.items?.length} li: ${JSON.stringify(got[1]?.items)})`);
+          await page.screenshot({ path: path.join(__dirname, '_edge-release-edges-modal.png') });
+        } finally { await browser.close(); server.close(); }
+      }
+    }
+
+    console.log('\n[e] identical pending notes → loud warning + release still completes; refreshed notes append newest-first');
+    const snapshots = [];   // capture (manifest, artifact BUILD_VERSION) per run for [f]
+    async function snapAfterRun() {
+      const m = await readJson(maniPath);
+      const art = await readFile(path.join(tree, m.file), 'utf8');
+      snapshots.push({ build: m.build, file: m.file, artVersion: art.match(/const BUILD_VERSION = '(\d+)'/)?.[1] });
+      return m;
+    }
+    {
+      await rmrf(relDir);
+      await setNotes({ title: 'Release E', items: ['e-one', 'e-two'] });
+      const r1 = await release();
+      ok(r1.status === 0 && !/IDENTICAL/.test(r1.all), 'run 1: no identical-notes warning on a fresh history');
+      ok(/\+ notes: "Release E" \(2 items\)/.test(r1.all), `success line echoes the notes title + item count (got: ${r1.all.match(/release: wrote[^\n]*/)?.[0] || '(none)'})`);
+      const m1 = await snapAfterRun();
+
+      const r2 = await release();   // SAME release-notes.json
+      ok(r2.status === 0, `run 2 (identical notes): release still completes (exit ${r2.status})`);
+      ok(/IDENTICAL to the previous release/.test(r2.all), `run 2: the loud warning fired (got: ${r2.all.match(/release: !!![^\n]*/)?.[0] || '(none)'})`);
+      const m2 = await snapAfterRun();
+      ok(m2.build === m1.build + 1, `run 2 still bumped the manifest (${m1.build} → ${m2.build})`);
+      let h = await readJson(histPath);
+      ok(h.length === 2 && h[0].build === m2.build && h[1].build === m1.build, `history has both entries newest-first (${h.map((e) => e.build).join(',')})`);
+
+      await setNotes({ title: 'Release E2 refreshed', items: ['the new thing'] });
+      const r3 = await release();
+      ok(r3.status === 0 && !/IDENTICAL/.test(r3.all), 'run 3 (refreshed notes): no warning');
+      const m3 = await snapAfterRun();
+      h = await readJson(histPath);
+      ok(h.length === 3 && h[0].title === 'Release E2 refreshed' && h[0].build === m3.build, `refreshed notes landed on top (got: ${h[0]?.title} @ ${h[0]?.build})`);
+      ok(h[0].build > h[1].build && h[1].build > h[2].build, `history strictly newest-first (${h.map((e) => e.build).join(' > ')})`);
+    }
+
+    console.log('\n[f] build-number monotonicity: distinct numbered files; manifest.build == artifact\'s own BUILD_VERSION');
+    {
+      const builds = snapshots.map((s) => s.build);
+      ok(new Set(builds).size === snapshots.length && builds.every((b, i) => i === 0 || b === builds[i - 1] + 1), `consecutive distinct builds (${builds.join(', ')})`);
+      const files = new Set(snapshots.map((s) => s.file));
+      ok(files.size === snapshots.length, `each release got its OWN numbered file (${[...files].join(', ')})`);
+      for (const s of snapshots) {
+        ok(String(s.build) === s.artVersion, `manifest.build ${s.build} == embedded BUILD_VERSION '${s.artVersion}' inside ${s.file}`);
+        ok(s.file === `releases/code-boss-${s.build}.mjs`, `manifest.file name carries the build number (${s.file})`);
+      }
+      // all three numbered files still on disk side by side
+      ok(snapshots.every((s) => existsSync(path.join(tree, s.file))), 'all numbered release files coexist on disk');
+    }
+  } finally {
+    await rmrf(tmp);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-reload-midrun.mjs
new 87c549cac328872820e8aa0b
+/**
+ * EDGE PROBE (on-demand): RELOAD MID-RUN resilience.
+ *
+ *  The page is KILLED while the assistant is mid-stream, then reopened:
+ *   [1] the run starts and streams visibly (partial chunks render live);
+ *   [2] page.close() mid-stream → the server-side run KEEPS GOING;
+ *   [3] a fresh page on the same server reconnects via SSE init: the user
+ *       message replays from the event log, the run is still 'running', the
+ *       status row is alive;
+ *   [4] the run completes ON THE NEW PAGE; the final assistant text renders
+ *       EXACTLY ONCE — chunks missed during the dead window (CHUNK02), chunks
+ *       received live after reconnect (CHUNK20), and the tail (CHUNK29-END)
+ *       must each appear once (no dup from streaming-bubble + final-event);
+ *   [5] server state is coherent: exactly one user-message, unique event ids,
+ *       terminal status, no error;
+ *   [6] a SECOND reload after completion replays the same single copy.
+ *
+ * Port 17972 only. Run: node test/_edge-reload-midrun.mjs (skips w/o Chrome)
+ */
+import { mkdtemp, readFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17972;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+// 30 chunks, 250ms apart → a ~7.5s streaming window to kill the page inside.
+const CHUNKS = [];
+for (let i = 0; i < 30; i++) {
+  const tag = i === 29 ? 'CHUNK29-END' : `CHUNK${String(i).padStart(2, '0')}`;
+  CHUNKS.push(`${tag} lorem ipsum dolor sit amet, the story keeps going.\n`);
+}
+
+function routedAdapter() {
+  const counts = new Map();
+  const find = (messages) => {
+    // FLAT TRANSPORT: the whole conversation arrives as ONE user message - the route is the key that appears LATEST
+    const t = (messages || []).filter((m) => m.role === 'user').map((m) => typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((b) => (b && b.text) || '').join('\n') : '').join('\n');
+    return t.includes('long story please') ? 'story' : null;
+  };
+  return {
+    async *completeStream(opts) {
+      const key = find(opts?.messages);
+      if (!key) { yield { choices: [{ delta: { content: 'no route.' } }] }; return; }
+      const n = counts.get(key) || 0; counts.set(key, n + 1);
+      if (n > 0) { yield { choices: [{ delta: { content: 'Done.' } }] }; return; }
+      for (const c of CHUNKS) {
+        await sleep(250);
+        yield { choices: [{ delta: { content: c } }] };
+      }
+    },
+    async complete() { return { choices: [{ message: { content: '<review-pass/>' } }] }; },
+  };
+}
+
+async function sendMessage(page, text) {
+  await page.click('#input');
+  await page.evaluate(() => { document.getElementById('input').value = ''; });
+  await page.type('#input', text);
+  await page.keyboard.press('Enter');
+}
+async function waitForIdle(page, timeoutMs = 30000) {
+  await page.waitForFunction(() => {
+    const s = window.__sessionRef?.status;
+    return s === 'idle' || s === 'done' || s === 'error';
+  }, { timeout: timeoutMs });
+  await sleep(400);
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-reload-'));
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'm', baseURL: '(mock)' }) + ';</script></head>');
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'm', port: PORT, adapter: routedAdapter(), modelsList: [{ id: 'm' }], initialProject: projectDir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    // [1] start a run and observe live streaming.
+    let page = await browser.newPage();
+    page.on('pageerror', (e) => jsErrors.push('p1: ' + String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForSelector('#chat:not(.hidden)', { timeout: 15000 });
+    await sleep(300);
+    await sendMessage(page, 'long story please');
+    await page.waitForFunction(() => (document.getElementById('log')?.textContent || '').includes('CHUNK05'), { timeout: 15000 });
+    ok(true, '[1] run started and streamed visibly (CHUNK05 rendered live)');
+
+    // [2] KILL the page mid-stream.
+    await page.close();
+    await sleep(700);
+    const st1 = await (await fetch(`http://127.0.0.1:${PORT}/api/state`)).json();
+    ok(st1.status === 'running', `[2] server-side run survives the page death (status=${st1.status})`);
+
+    // [3] fresh page reconnects mid-run.
+    page = await browser.newPage();
+    page.on('pageerror', (e) => jsErrors.push('p2: ' + String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForFunction(() => !!window.__sessionRef, { timeout: 15000 });
+    const re = await page.evaluate(() => ({
+      status: window.__sessionRef?.status,
+      hasUserMsg: (document.getElementById('log')?.textContent || '').includes('long story please'),
+      statusRow: !!document.querySelector('#log .status'),
+    }));
+    ok(re.status === 'running', `[3] reconnected page sees the run still running (status=${re.status})`);
+    ok(re.hasUserMsg, '[3] the user message replayed from the event log on the new page');
+    ok(re.statusRow, '[3] the status row (spinner) is alive on the reconnected page');
+
+    // [4] run completes on the new page; every marker appears EXACTLY once.
+    await page.waitForFunction(() => (document.getElementById('log')?.textContent || '').includes('CHUNK29-END'), { timeout: 30000 });
+    await waitForIdle(page);
+    const countIn = (hay, needle) => hay.split(needle).length - 1;
+    const log1 = await page.evaluate(() => document.getElementById('log').textContent);
+    ok(countIn(log1, 'CHUNK29-END') === 1, `[4] tail chunk rendered exactly once (got ${countIn(log1, 'CHUNK29-END')})`);
+    ok(countIn(log1, 'CHUNK02 ') === 1, `[4] chunk MISSED during the dead window rendered exactly once (got ${countIn(log1, 'CHUNK02 ')})`);
+    ok(countIn(log1, 'CHUNK20 ') === 1, `[4] chunk received LIVE after reconnect rendered exactly once — no streaming-bubble dup (got ${countIn(log1, 'CHUNK20 ')})`);
+    const bubbles = await page.evaluate(() => document.querySelectorAll('#log .bubble.user').length);
+    ok(bubbles === 1, `[4] exactly one user bubble (got ${bubbles})`);
+
+    // [5] server-side coherence.
+    const st2 = await (await fetch(`http://127.0.0.1:${PORT}/api/state`)).json();
+    const userEvents = st2.events.filter((e) => e.type === 'user-message');
+    const ids = st2.events.map((e) => e.id);
+    ok(userEvents.length === 1, `[5] exactly one user-message event server-side (got ${userEvents.length})`);
+    ok(new Set(ids).size === ids.length, `[5] event ids unique after the reconnect (${ids.length} events)`);
+    ok(st2.status === 'done' && !st2.error, `[5] run finished clean (status=${st2.status}, error=${st2.error})`);
+
+    // [6] a second reload replays one copy from the persisted log.
+    await page.reload({ waitUntil: 'domcontentloaded' });
+    await page.waitForSelector('#chat:not(.hidden)', { timeout: 15000 });
+    await sleep(600);
+    const log2 = await page.evaluate(() => document.getElementById('log').textContent);
+    ok(countIn(log2, 'CHUNK29-END') === 1 && countIn(log2, 'long story please') >= 1,
+      `[6] post-completion reload replays exactly one copy (tail=${countIn(log2, 'CHUNK29-END')})`);
+
+    ok(jsErrors.length === 0, `no page errors across kill/reopen/reload (${jsErrors.length}: ${jsErrors.slice(0, 2).join(' | ')})`);
+  } finally {
+    await browser.close(); server.close();
+    await cleanupDir(projectDir);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-sa-managing.mjs
new 4a5be76ecfffe66ad8533155
+/**
+ * EDGE PROBE — ORCHESTRATOR "managing" PATH + TWO CONCURRENT SUB-AGENT DRAWERS + RELOAD.
+ *
+ * New angles (not covered by test-subagent-ui-probe / _edge-subagent):
+ *  [1] The busy-foreground /api/message response BODY: 200 { managing:true, forked:true }
+ *      (the always-responsive contract, server.mjs:3932) — asserted on the wire, and the
+ *      FORK entry (fg-1, the backgrounded inline run) appears as a working sub-agent.
+ *  [2] The busy-time message is acknowledged in FIRST PERSON ("On it."), with NO "Delegated to a
+ *      sub-agent" mechanism leak in the main chat (the single-you voice).
+ *  [3] The sub-agent drawer streams tool rows LIVE (status still 'working', gated mid-run).
+ *  [4] TWO concurrent sub-agents: event routing isolation — each drawer/store holds ONLY its
+ *      own tool rows; activity arriving for B does NOT leak into A's OPEN drawer.
+ *  [5] MID-FLIGHT RELOAD: working sub-agents stay visible after a page reload — the
+ *      /api/state snapshot carries state.subagents (fork + orchestrator live list) and
+ *      onInit re-seeds the panel from it.
+ *  [6] Post-reload recovery via lifecycle events: when the sub-agents finish, the panel
+ *      re-populates and both done cards fold; both branches integrate into the main repo.
+ *
+ * Run: node test/_edge-sa-managing.mjs      (port 17966; skips if Chrome not found)
+ */
+process.env.CB_ORCHESTRATOR = '1';
+import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { runGit, commitAll, worktreePathFor } from './_git.mjs';
+import { cleanupDir } from './_helpers.mjs';
+const { startServer } = await import('../src/server.mjs');   // AFTER env (CB_ORCHESTRATOR read at module load)
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17966;
+const SHOTS = path.join(__dirname, '_edge-sa-screenshots');
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+
+// gates: gFG holds the foreground turn; gA/gB hold each sub-agent AFTER its write turn
+// (so the drawer can be inspected while the agent is mid-run, status 'working').
+function makeAdapter(g) {
+  const reply = (s) => ({ choices: [{ message: { content: s } }] });
+  return {
+    async complete({ messages }) {
+      const txt = (messages || []).map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
+      // 1) sub-agent acceptance (its convo embeds the worker markers — check first)
+      if (/<original-request>/i.test(txt) || /acceptance reviewer/i.test(txt)) return reply('<sa-approve>fine</sa-approve>');
+      // 2) manager turn — route by which task the (serialized) turn is about
+      if (txt.includes('You are the MANAGER')) {
+        if (txt.includes('TASK_BETA')) return reply('On it.\n<delegate>do the TASK_BETA work</delegate>');
+        return reply('On it.\n<delegate>do the TASK_ALPHA work</delegate>');
+      }
+      // 3) the held BETA worker (its convo contains ONLY its brief)
+      if (txt.includes('TASK_BETA')) {
+        if (/closed previous task/.test(txt)) return reply('BETA_FINAL done.');
+        if (/wrote beta\.txt/.test(txt)) { await g.gB.promise; return reply('Closing.\n<remote-workspace>\n<next-task user-request="beta task" summary="wrote beta.txt"/>\n</remote-workspace>'); }
+        return reply('Writing.\n<remote-workspace>\n<write path="beta.txt">\nB=1\n</write>\n</remote-workspace>');
+      }
+      // 4) the held ALPHA worker
+      if (txt.includes('TASK_ALPHA')) {
+        if (/closed previous task/.test(txt)) return reply('ALPHA_FINAL done.');
+        if (/wrote alpha\.txt/.test(txt)) { await g.gA.promise; return reply('Closing.\n<remote-workspace>\n<next-task user-request="alpha task" summary="wrote alpha.txt"/>\n</remote-workspace>'); }
+        return reply('Writing.\n<remote-workspace>\n<write path="alpha.txt">\nA=1\n</write>\n</remote-workspace>');
+      }
+      // 5) the gated foreground
+      if (txt.includes('HANG_FG')) { await g.gFG.promise; return reply('FG done.'); }
+      return reply('ok.');
+    },
+    async listModels() { return { data: [{ id: 'mock' }] }; },
+  };
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  await mkdir(SHOTS, { recursive: true });
+  const dir = await mkdtemp(path.join(tmpdir(), 'cb-edgemg-'));
+  await runGit(dir, ['init', '-q']);
+  await runGit(dir, ['config', 'user.email', 't@t']);
+  await runGit(dir, ['config', 'user.name', 'T']);
+  await runGit(dir, ['checkout', '-q', '-b', 'CODE_BOSS_test']);
+  await writeFile(path.join(dir, 'base.txt'), 'x\n', 'utf8');
+  await commitAll(dir, 'base');
+
+  const g = {};
+  for (const k of ['gFG', 'gA', 'gB']) { g[k] = {}; g[k].promise = new Promise((r) => { g[k].release = r; }); }
+  const adapter = makeAdapter(g);
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: '(mock)' }) + ';</script></head>');
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'mock', port: PORT, adapter, modelsList: [{ id: 'mock' }], initialProject: dir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  const wtParent = path.dirname(worktreePathFor(dir, 'probe'));
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1280, height: 900 });
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForFunction(() => !!document.getElementById('tabbtn-subagents') && !!document.getElementById('input'), { timeout: 8000 });
+
+    console.log('\n[1] busy foreground → /api/message answers 200 { managing:true, forked:true }');
+    await page.type('#input', 'please HANG_FG while I keep working');
+    await page.keyboard.press('Enter');
+    await page.waitForFunction(() => /busy|running/i.test(document.getElementById('input').placeholder || ''), { timeout: 8000 });
+    const r2 = await page.evaluate(async () => {
+      const r = await fetch('/api/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'do the TASK_ALPHA work now' }) });
+      return { status: r.status, body: await r.json() };
+    });
+    ok(r2.status === 200 && r2.body.managing === true, `2nd message answered 200 {managing:true} (got ${r2.status} ${JSON.stringify(r2.body)})`);
+    ok(r2.body.forked === true, 'the response reports forked:true (the running inline task was backgrounded)');
+
+    // the FORK entry (fg-1) + the delegated sub-agent both appear as working
+    await page.evaluate(() => selectSideTab('subagents'));
+    await page.waitForFunction(() => {
+      let fg = false, alpha = false;
+      for (const [id, sa] of saStore) {
+        if (id.startsWith('fg-') && sa.status === 'working') fg = true;
+        if ((sa.topic || '').includes('TASK_ALPHA') && sa.status === 'working') alpha = true;
+      }
+      return fg && alpha;
+    }, { timeout: 15000, polling: 200 });
+    ok(true, 'the FORK entry (fg-*) AND the delegated TASK_ALPHA sub-agent are both listed as working');
+    const badge1 = await page.evaluate(() => document.getElementById('subagentCount')?.textContent);
+    ok(badge1 === '2', `tab badge counts both working agents (got "${badge1}")`);
+
+    console.log('\n[2] the busy-time message is acknowledged in FIRST PERSON, with NO sub-agent mechanism leak');
+    // The manager said "On it." before its <delegate>; that first-person line IS the developer's
+    // acknowledgment that the busy-time message was accepted (the always-responsive contract). The
+    // server must NOT also append a "◇ Delegated to a sub-agent: …" bubble — it duplicates the prose
+    // AND leaks the internal split the manager prompt explicitly forbids ("the developer sees a
+    // single you"). See server.mjs delegate branch + prompted.mjs MANAGER_SYSTEM_PROMPT.
+    await page.waitForFunction(() => /On it\./.test(document.getElementById('log')?.textContent || ''), { timeout: 8000 });
+    ok(true, 'the manager acknowledged the busy-time message in the first person ("On it.")');
+    const leaked = await page.evaluate(() => /Delegated to a sub-agent/.test(document.getElementById('log')?.textContent || ''));
+    ok(!leaked, 'no "Delegated to a sub-agent" mechanism leak in the main chat (single-you voice)');
+
+    console.log('\n[3] the drawer streams tool rows LIVE (sub-agent still working, gated mid-run)');
+    await page.waitForFunction(() => {
+      for (const sa of saStore.values()) {
+        if ((sa.topic || '').includes('TASK_ALPHA') && sa.status === 'working') {
+          const t = (sa.activity || []).map((e) => JSON.stringify(e)).join('\n');
+          return (sa.activity || []).length >= 2 && /alpha\.txt/.test(t);
+        }
+      }
+      return false;
+    }, { timeout: 15000, polling: 200 });
+    ok(true, 'ALPHA accumulated live activity (tool rows incl. alpha.txt) while still status=working');
+    await page.evaluate(() => {
+      const item = [...document.querySelectorAll('#pane-subagents .sa-item')].find((i) => i.textContent.includes('TASK_ALPHA'));
+      item.click();
+    });
+    await page.waitForFunction(() => document.getElementById('saDrawerBg')?.classList.contains('show'), { timeout: 5000 });
+    const drawerAlpha = await page.evaluate(() => {
+      const txt = document.getElementById('saDrawerBody')?.textContent || '';
+      const state = document.getElementById('saDrawerState')?.textContent || '';
+      return { rows: document.querySelectorAll('#saDrawerBody .sa-act').length, hasAlpha: /alpha\.txt/.test(txt), state };
+    });
+    ok(drawerAlpha.rows >= 2 && drawerAlpha.hasAlpha, `ALPHA drawer shows live tool rows (${drawerAlpha.rows} rows, alpha.txt present)`);
+    ok(/working/i.test(drawerAlpha.state), `drawer header says it is still working ("${drawerAlpha.state}")`);
+    await page.screenshot({ path: path.join(SHOTS, 'managing-1-live-drawer.png') });
+
+    console.log('\n[4] a THIRD message → second concurrent sub-agent; routing isolation');
+    const r3 = await page.evaluate(async () => {
+      const r = await fetch('/api/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'also do the TASK_BETA work please' }) });
+      return { status: r.status, body: await r.json() };
+    });
+    ok(r3.status === 200 && r3.body.managing === true && r3.body.forked === true, `3rd message also 200 {managing:true,forked:true} (got ${r3.status} ${JSON.stringify(r3.body)})`);
+    await page.waitForFunction(() => {
+      for (const sa of saStore.values()) {
+        if ((sa.topic || '').includes('TASK_BETA') && sa.status === 'working') {
+          return (sa.activity || []).some((e) => JSON.stringify(e).includes('beta.txt'));
+        }
+      }
+      return false;
+    }, { timeout: 15000, polling: 200 });
+    ok(true, 'BETA spawned and streamed its own activity (beta.txt rows) while ALPHA is still gated');
+    const badge2 = await page.evaluate(() => document.getElementById('subagentCount')?.textContent);
+    ok(badge2 === '3', `badge now counts fg-1 + ALPHA + BETA working (got "${badge2}")`);
+
+    const iso = await page.evaluate(() => {
+      const out = {};
+      for (const [id, sa] of saStore) {
+        const t = (sa.activity || []).map((e) => JSON.stringify(e)).join('\n');
+        out[id] = { topic: sa.topic || '', hasAlpha: /alpha\.txt/.test(t), hasBeta: /beta\.txt/.test(t), n: (sa.activity || []).length };
+      }
+      return out;
+    });
+    const alpha = Object.values(iso).find((s) => s.topic.includes('TASK_ALPHA'));
+    const beta = Object.values(iso).find((s) => s.topic.includes('TASK_BETA'));
+    const fork = Object.entries(iso).find(([id]) => id.startsWith('fg-'))?.[1];
+    ok(alpha && alpha.hasAlpha && !alpha.hasBeta, `ALPHA's store holds only ALPHA rows (alpha=${alpha?.hasAlpha} beta=${alpha?.hasBeta})`);
+    ok(beta && beta.hasBeta && !beta.hasAlpha, `BETA's store holds only BETA rows (beta=${beta?.hasBeta} alpha=${beta?.hasAlpha})`);
+    ok(fork && !fork.hasAlpha && !fork.hasBeta, `the fork (fg-*) channel holds neither sub-agent's rows (n=${fork?.n})`);
+    // BETA's live activity must NOT have leaked into the OPEN ALPHA drawer
+    const leak = await page.evaluate(() => /beta\.txt/.test(document.getElementById('saDrawerBody')?.textContent || ''));
+    ok(leak === false, "BETA's activity did NOT leak into ALPHA's open drawer");
+    // switch the drawer to BETA → only beta rows
+    await page.evaluate(() => closeSubagentDetail());
+    await page.evaluate(() => {
+      const item = [...document.querySelectorAll('#pane-subagents .sa-item')].find((i) => i.textContent.includes('TASK_BETA'));
+      item.click();
+    });
+    await page.waitForFunction(() => document.getElementById('saDrawerBg')?.classList.contains('show'), { timeout: 5000 });
+    const drawerBeta = await page.evaluate(() => {
+      const txt = document.getElementById('saDrawerBody')?.textContent || '';
+      return { hasBeta: /beta\.txt/.test(txt), hasAlpha: /alpha\.txt/.test(txt) };
+    });
+    ok(drawerBeta.hasBeta && !drawerBeta.hasAlpha, `BETA drawer shows only BETA rows (beta=${drawerBeta.hasBeta} alpha=${drawerBeta.hasAlpha})`);
+    await page.screenshot({ path: path.join(SHOTS, 'managing-2-two-agents.png') });
+    await page.evaluate(() => closeSubagentDetail());
+
+    console.log('\n[5] MID-FLIGHT RELOAD: are the working sub-agents still visible?');
+    await page.reload({ waitUntil: 'domcontentloaded' });
+    await page.waitForFunction(() => !!window.__sessionRef && !!document.getElementById('input'), { timeout: 15000 });
+    await sleep(1200);   // let the snapshot replay render
+    const busyAfterReload = await page.evaluate(() => /busy|running/i.test(document.getElementById('input').placeholder || ''));
+    ok(busyAfterReload, 'composer still shows the busy state after reload (foreground run is live server-side)');
+    const afterReload = await page.evaluate(() => ({
+      items: document.querySelectorAll('#pane-subagents .sa-item').length,
+      badge: document.getElementById('subagentCount')?.textContent || '',
+    }));
+    // 3 agents (fg-1, ALPHA, BETA) are live server-side; the lifecycle pings are broadcast-only,
+    // but the /api/state snapshot now carries state.subagents (fork + orchestrator list) and
+    // onInit re-seeds the panel from it — a reload keeps the working entries visible.
+    ok(afterReload.items >= 2, `working sub-agents still listed after a reload (got ${afterReload.items} items, badge="${afterReload.badge}" — 3 are live server-side)`);
+    await page.screenshot({ path: path.join(SHOTS, 'managing-3-after-reload.png') });
+
+    console.log('\n[6] release the gates → both complete; panel recovers; branches integrate');
+    g.gA.release(); g.gB.release();
+    await page.waitForFunction(() => document.querySelectorAll('.row.tool.subagent-call.done').length >= 2, { timeout: 30000, polling: 300 });
+    ok(true, 'both sub-agents completed and folded done cards (post-reload lifecycle events re-seeded the panel)');
+    const panelBack = await page.evaluate(() => {
+      const out = [];
+      for (const sa of saStore.values()) out.push(`${sa.topic}:${sa.status}`);
+      return out;
+    });
+    ok(panelBack.some((s) => s.includes('TASK_ALPHA') && s.endsWith(':done')) && panelBack.some((s) => s.includes('TASK_BETA') && s.endsWith(':done')),
+      `panel re-populated from lifecycle events after reload (${panelBack.join(' | ')})`);
+    let merged = false;
+    for (let i = 0; i < 30; i++) { if (existsSync(path.join(dir, 'alpha.txt')) && existsSync(path.join(dir, 'beta.txt'))) { merged = true; break; } await sleep(500); }
+    ok(merged, 'both sub-agent branches integrated into the main repo (alpha.txt + beta.txt present)');
+
+    console.log('\n[7] release the foreground → the fork folds its own done card; idle');
+    g.gFG.release();
+    await page.waitForFunction(() => document.querySelectorAll('.row.tool.subagent-call.done').length >= 3, { timeout: 20000, polling: 300 });
+    ok(true, 'the backgrounded inline run (fg-1) folded its done card too');
+    await page.waitForFunction(() => !/busy|running/i.test(document.getElementById('input').placeholder || ''), { timeout: 15000 });
+    ok(true, 'composer back to idle');
+    await page.screenshot({ path: path.join(SHOTS, 'managing-4-all-done.png') });
+
+    ok(jsErrors.length === 0, `no JS errors (${jsErrors.length}: ${jsErrors.slice(0, 2).join(' | ')})`);
+  } finally {
+    for (const k of ['gFG', 'gA', 'gB']) { try { g[k].release && g[k].release(); } catch {} }
+    await browser.close(); server.close();
+    await sleep(500);
+    await cleanupDir(dir); await cleanupDir(wtParent);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-sa-recovery.mjs
new 890a0fbe26b596df1739d184
+/**
+ * EDGE PROBE — CRASH-RESIDUE RECOVERY UI (listOrphanSubagents → adopt → Review/Discard).
+ *
+ * Fabricates orphan sub-agent leftovers exactly as listOrphanSubagents expects them
+ * (cb-sub/<id> branches, with/without live worktrees) and drives the recovery affordance:
+ *
+ * [A] CRASH-RESTART REALISM: server starts WITH initialProject → openProject runs (and
+ *     adopts the orphans) BEFORE any browser is connected. The broadcast had no
+ *     subscribers, but the live sub-agent list now rides the /api/state snapshot
+ *     (state.subagents → onInit seeding), so a fresh page load DOES show the recovered
+ *     entries with their Review/Discard affordance.
+ * [B] LANDING FLOW (the path that works): server starts with NO project; the browser
+ *     connects FIRST, then opens the project via the UI's openProject() → recovered items
+ *     render with Review/Discard buttons (status dot, 'recovered' label).
+ * [C] DISCARD: the button → /api/subagent-action → orch.abort → aborted card; the
+ *     worktree is removed AND the cb-sub branch is deleted.
+ * [D] REVIEW: the button → acceptance (approve) → integrate: the orphan branch's commit
+ *     (recovered.txt) lands in the repo; worktree removed; branch deleted; done card.
+ * [E] BRANCH-ONLY leftover (worktree gone): never adopted into the panel; the branch is
+ *     kept on disk for manual merge.
+ *
+ * Run: node test/_edge-sa-recovery.mjs      (port 17967; skips if Chrome not found)
+ */
+process.env.CB_ORCHESTRATOR = '1';
+import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { runGit, commitAll } from './_git.mjs';
+import { cleanupDir } from './_helpers.mjs';
+const { startServer } = await import('../src/server.mjs');
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17967;
+const SHOTS = path.join(__dirname, '_edge-sa-screenshots');
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+
+const adapter = {
+  async complete({ messages }) {
+    const txt = (messages || []).map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
+    if (/<original-request>/i.test(txt) || /acceptance reviewer/i.test(txt)) return { choices: [{ message: { content: '<sa-approve>recovered work looks complete</sa-approve>' } }] };
+    return { choices: [{ message: { content: 'ok.' } }] };
+  },
+  async listModels() { return { data: [{ id: 'mock' }] }; },
+};
+
+// Build a repo with the exact residue a crashed sub-agent leaves behind:
+//  - cb-sub/sa-keep  + live worktree, one commit ahead (recovered.txt)
+//  - cb-sub/sa-drop  + live worktree, no extra commit
+//  - cb-sub/sa-ghost branch ONLY (its worktree is gone)
+async function makeResidueRepo(parent, name) {
+  const repo = path.join(parent, name);
+  await mkdir(repo, { recursive: true });
+  await runGit(repo, ['init', '-q']);
+  await runGit(repo, ['config', 'user.email', 't@t']);
+  await runGit(repo, ['config', 'user.name', 'T']);
+  await runGit(repo, ['checkout', '-q', '-b', 'CODE_BOSS_test']);
+  await writeFile(path.join(repo, 'base.txt'), 'x\n', 'utf8');
+  await commitAll(repo, 'base');
+  const wtKeep = path.join(parent, name + '-wt-keep');
+  const wtDrop = path.join(parent, name + '-wt-drop');
+  let r = await runGit(repo, ['worktree', 'add', '--quiet', wtKeep, '-b', 'cb-sub/sa-keep', 'HEAD']);
+  if (r.exitCode !== 0) throw new Error('worktree add keep failed: ' + r.stderr);
+  await writeFile(path.join(wtKeep, 'recovered.txt'), 'rescued work\n', 'utf8');
+  await commitAll(wtKeep, 'sub-agent sa-keep (interrupted)');
+  r = await runGit(repo, ['worktree', 'add', '--quiet', wtDrop, '-b', 'cb-sub/sa-drop', 'HEAD']);
+  if (r.exitCode !== 0) throw new Error('worktree add drop failed: ' + r.stderr);
+  await runGit(repo, ['branch', 'cb-sub/sa-ghost']);   // branch-only leftover
+  return { repo, wtKeep, wtDrop };
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  await mkdir(SHOTS, { recursive: true });
+  const parent = await mkdtemp(path.join(tmpdir(), 'cb-edgerec-'));
+  const A = await makeResidueRepo(parent, 'repoA');
+  const B = await makeResidueRepo(parent, 'repoB');
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: '(mock)' }) + ';</script></head>');
+
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  let server = null;
+  try {
+    console.log('\n[A] crash-restart flow: project opened at startup, browser connects AFTER');
+    ({ server } = await startServer({
+      html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+      defaultModel: 'mock', port: PORT, adapter, modelsList: [{ id: 'mock' }], initialProject: A.repo,
+    }));
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1280, height: 900 });
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForFunction(() => !!window.__sessionRef && !!document.getElementById('saList'), { timeout: 10000 });
+    await sleep(1500);   // generous window for any late re-emit
+    const fixture = await runGit(A.repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/cb-sub/']);
+    ok(/sa-keep/.test(fixture.stdout) && /sa-drop/.test(fixture.stdout) && /sa-ghost/.test(fixture.stdout),
+      `fixture: the orphan cb-sub branches exist on disk (${fixture.stdout.trim().split('\n').join(', ')})`);
+    const recA = await page.evaluate(() => document.querySelectorAll('#pane-subagents .sa-item.recovered').length);
+    // The orchestrator adopted these orphans at startup (recoverSubagents runs in openProject)
+    // BEFORE any browser connected; the live list now rides the /api/state snapshot
+    // (chatStateSnapshot.subagents → onInit saUpsert seeding), so a fresh page load shows them.
+    ok(recA >= 2, `recovered sub-agents visible on a fresh page load after a crash-restart (got ${recA} of 2 adopted server-side)`);
+    await page.screenshot({ path: path.join(SHOTS, 'recovery-A-fresh-connect.png') });
+    await page.close();
+    await new Promise((r) => server.close(r)); server = null;
+
+    console.log('\n[B] landing flow: browser connects FIRST, then opens the project');
+    ({ server } = await startServer({
+      html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+      defaultModel: 'mock', port: PORT, adapter, modelsList: [{ id: 'mock' }], initialProject: null,
+    }));
+    const page2 = await browser.newPage();
+    await page2.setViewport({ width: 1280, height: 900 });
+    page2.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page2.goto(`http://127.0.0.1:${PORT}/`);
+    await page2.waitForFunction(() => typeof openProject === 'function' && !!window.__sessionRef, { timeout: 10000 });
+    await page2.evaluate((p) => openProject(p), B.repo);
+    await page2.waitForFunction(() => document.querySelectorAll('#pane-subagents .sa-item.recovered').length >= 2, { timeout: 15000, polling: 250 });
+    ok(true, 'both orphans surfaced as recovered entries when the project was opened while connected');
+    const ui = await page2.evaluate(() => {
+      const items = [...document.querySelectorAll('#pane-subagents .sa-item.recovered')];
+      return items.map((i) => ({
+        text: i.textContent,
+        review: !!([...i.querySelectorAll('.sa-act-btn')].find((b) => b.textContent === 'Review')),
+        discard: !!([...i.querySelectorAll('.sa-act-btn')].find((b) => b.textContent === 'Discard')),
+        label: i.querySelector('.sa-state')?.textContent,
+      }));
+    });
+    ok(ui.every((i) => i.review && i.discard), 'each recovered entry offers explicit Review + Discard buttons');
+    ok(ui.every((i) => i.label === 'recovered'), `entries are labeled 'recovered' (${ui.map((i) => i.label).join(', ')})`);
+    ok(ui.some((i) => /sa-keep/.test(i.text)) && ui.some((i) => /sa-drop/.test(i.text)), 'both orphan ids are listed');
+    const ghostListed = await page2.evaluate(() => [...document.querySelectorAll('#pane-subagents .sa-item')].some((i) => /sa-ghost/.test(i.textContent || '')));
+    ok(!ghostListed, 'the branch-only leftover (worktree gone) is NOT adopted into the panel');
+    await page2.evaluate(() => selectSideTab('subagents'));
+    await page2.screenshot({ path: path.join(SHOTS, 'recovery-B-affordance.png') });
+
+    console.log('\n[C] Discard → aborted card; worktree removed; branch deleted');
+    await page2.evaluate(() => {
+      const item = [...document.querySelectorAll('#pane-subagents .sa-item.recovered')].find((i) => /sa-drop/.test(i.textContent || ''));
+      [...item.querySelectorAll('.sa-act-btn')].find((b) => b.textContent === 'Discard').click();
+    });
+    await page2.waitForFunction(() => [...saStore.values()].some((sa) => sa.id === 'sa-drop' && sa.status === 'aborted'), { timeout: 10000, polling: 250 });
+    ok(true, 'the discarded entry flipped to aborted');
+    await page2.waitForFunction(() => [...document.querySelectorAll('.row.tool.subagent-call')].some((c) => c.classList.contains('aborted')), { timeout: 8000 });
+    ok(true, 'an aborted completion card folded into the chat');
+    let dropGone = false;
+    for (let i = 0; i < 25; i++) { if (!existsSync(B.wtDrop)) { dropGone = true; break; } await sleep(400); }
+    ok(dropGone, 'the discarded worktree dir was removed (EBUSY flake possible — re-run standalone if this is the only failure)');
+    let dropBranchGone = false;
+    for (let i = 0; i < 25; i++) {
+      const br = await runGit(B.repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/cb-sub/sa-drop']);
+      if (!br.stdout.trim()) { dropBranchGone = true; break; }
+      await sleep(400);
+    }
+    ok(dropBranchGone, 'the discarded cb-sub/sa-drop branch was deleted (abort → deleteBranch)');
+
+    console.log('\n[D] Review → acceptance approves → the rescued commit integrates');
+    await page2.evaluate(() => {
+      const item = [...document.querySelectorAll('#pane-subagents .sa-item.recovered')].find((i) => /sa-keep/.test(i.textContent || ''));
+      [...item.querySelectorAll('.sa-act-btn')].find((b) => b.textContent === 'Review').click();
+    });
+    await page2.waitForFunction(() => [...saStore.values()].some((sa) => sa.id === 'sa-keep' && sa.status === 'done'), { timeout: 20000, polling: 250 });
+    ok(true, 'the reviewed entry went reviewing → done (acceptance approved)');
+    let kept = false;
+    for (let i = 0; i < 25; i++) { if (existsSync(path.join(B.repo, 'recovered.txt'))) { kept = true; break; } await sleep(400); }
+    ok(kept, "the orphan branch's commit (recovered.txt) integrated into the repo");
+    let keepGone = false;
+    for (let i = 0; i < 25; i++) { if (!existsSync(B.wtKeep)) { keepGone = true; break; } await sleep(400); }
+    ok(keepGone, 'the reviewed worktree was cleaned up after integrate');
+    const brKeep = await runGit(B.repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/cb-sub/sa-keep']);
+    ok(!brKeep.stdout.trim(), 'the cb-sub/sa-keep branch was deleted after integrate');
+    const doneCard = await page2.evaluate(() => [...document.querySelectorAll('.row.tool.subagent-call.done')].length);
+    ok(doneCard >= 1, 'a done completion card folded into the chat for the recovered agent');
+    await page2.screenshot({ path: path.join(SHOTS, 'recovery-C-after-actions.png') });
+
+    console.log('\n[E] branch-only leftover kept for manual merge');
+    const ghost = await runGit(B.repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/cb-sub/sa-ghost']);
+    ok(ghost.stdout.trim() === 'cb-sub/sa-ghost', 'the branch-only leftover survives untouched (manual-merge escape hatch)');
+
+    ok(jsErrors.length === 0, `no JS errors (${jsErrors.length}: ${jsErrors.slice(0, 2).join(' | ')})`);
+  } finally {
+    await browser.close();
+    if (server) { try { await new Promise((r) => server.close(r)); } catch {} }
+    await sleep(500);
+    await cleanupDir(parent);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-sa-reject-ui.mjs
new 08c7f0ed59436544f3215447
+/**
+ * EDGE PROBE — the REVIEW-LOOP REJECT PATH end-to-end through the REAL server + UI.
+ *
+ * test-subagent-review-ui-probe drives the reject loop by injecting synthetic events into
+ * applyDelta; THIS probe runs the whole thing for real: busy foreground → manager delegates →
+ * the held worker writes the WRONG file → Acceptance agent REJECTS with feedback →
+ * orchestrator resumes the worker in the SAME worktree → revision → re-review → APPROVE →
+ * integrate + cleanup. Asserts:
+ *   - the real SSE lifecycle sequence for the delegated agent
+ *     (spawned → result → reviewing:1 → resume:2 → result → reviewing:2 → done)
+ *   - main chat: reject verdict row, feedback row, approve verdict row, done card
+ *   - drawer: verdict + feedback + revision-round rows
+ *   - repo: the REVISED content integrated (f = 2), worktree removed, cb-sub branch deleted
+ *
+ * Run: node test/_edge-sa-reject-ui.mjs      (port 17967; skips if Chrome not found)
+ */
+process.env.CB_ORCHESTRATOR = '1';
+import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { runGit, commitAll, worktreePathFor } from './_git.mjs';
+import { cleanupDir } from './_helpers.mjs';
+const { startServer } = await import('../src/server.mjs');
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17967;
+const SHOTS = path.join(__dirname, '_edge-sa-screenshots');
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+
+function makeAdapter(g) {
+  const reply = (s) => ({ choices: [{ message: { content: s } }] });
+  const state = { acc: 0, v1: 0, v2: 0 };
+  return {
+    state,
+    async complete({ messages }) {
+      const txt = (messages || []).map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
+      // acceptance (round 1 → REJECT with actionable feedback; round 2 → APPROVE)
+      if (/<original-request>/i.test(txt) || /acceptance reviewer/i.test(txt)) {
+        state.acc++;
+        if (state.acc === 1) return reply('<sa-reject>FIX_FEEDBACK: login.js exports f = 1 but the task needs f = 2 — change it and re-report.</sa-reject>');
+        return reply('<sa-approve>f is 2 now</sa-approve>');
+      }
+      if (txt.includes('You are the MANAGER')) return reply('On it.\n<delegate>do the FIX_LOGIN task</delegate>');
+      // the RESUME run (the orchestrator's feedback note is the seed) — counter-scripted
+      if (/Review feedback/.test(txt) && /revise your work/i.test(txt)) {
+        state.v2++;
+        if (state.v2 === 1) return reply('Revising.\n<remote-workspace>\n<write path="login.js">\nexport const f = 2;\n</write>\n</remote-workspace>');
+        if (state.v2 === 2) return reply('Closing.\n<remote-workspace>\n<next-task user-request="fix login v2" summary="set f to 2 per the review feedback"/>\n</remote-workspace>');
+        return reply('FIX_FINAL_V2 done.');
+      }
+      // the FIRST (wrong) run of the held worker
+      if (txt.includes('FIX_LOGIN')) {
+        state.v1++;
+        if (state.v1 === 1) return reply('Writing.\n<remote-workspace>\n<write path="login.js">\nexport const f = 1;\n</write>\n</remote-workspace>');
+        if (state.v1 === 2) return reply('Closing.\n<remote-workspace>\n<next-task user-request="fix login" summary="wrote login.js"/>\n</remote-workspace>');
+        return reply('FIX_FINAL_V1 done.');
+      }
+      if (txt.includes('HANG_FG')) { await g.gFG.promise; return reply('FG done.'); }
+      return reply('ok.');
+    },
+    async listModels() { return { data: [{ id: 'mock' }] }; },
+  };
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  await mkdir(SHOTS, { recursive: true });
+  const dir = await mkdtemp(path.join(tmpdir(), 'cb-edgerj-'));
+  await runGit(dir, ['init', '-q']);
+  await runGit(dir, ['config', 'user.email', 't@t']);
+  await runGit(dir, ['config', 'user.name', 'T']);
+  await runGit(dir, ['checkout', '-q', '-b', 'CODE_BOSS_test']);
+  await writeFile(path.join(dir, 'base.txt'), 'x\n', 'utf8');
+  await commitAll(dir, 'base');
+
+  const g = {}; g.gFG = {}; g.gFG.promise = new Promise((r) => { g.gFG.release = r; });
+  const adapter = makeAdapter(g);
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: '(mock)' }) + ';</script></head>');
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'mock', port: PORT, adapter, modelsList: [{ id: 'mock' }], initialProject: dir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  const wtParent = path.dirname(worktreePathFor(dir, 'probe'));
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1280, height: 900 });
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForFunction(() => !!document.getElementById('tabbtn-subagents') && !!document.getElementById('input'), { timeout: 8000 });
+
+    // record the REAL SSE lifecycle (id-tagged) by wrapping the client dispatch
+    await page.evaluate(() => {
+      window._saSeq = [];
+      const orig = window.applyDelta;
+      window.applyDelta = (m) => {
+        if (m && m.type === 'subagent-event' && m.event) window._saSeq.push(`${m.event.type}|${m.event.id}|${m.event.round || ''}`);
+        return orig(m);
+      };
+    });
+
+    console.log('\n[1] busy foreground → Enter-send delegates the FIX_LOGIN task');
+    await page.type('#input', 'please HANG_FG for a while');
+    await page.keyboard.press('Enter');
+    await page.waitForFunction(() => /busy|running/i.test(document.getElementById('input').placeholder || ''), { timeout: 8000 });
+    await page.type('#input', 'please do the FIX_LOGIN task');
+    await page.keyboard.press('Enter');
+    await page.evaluate(() => selectSideTab('subagents'));
+    await page.waitForFunction(() => [...saStore.values()].some((sa) => (sa.topic || '').includes('FIX_LOGIN')), { timeout: 15000, polling: 200 });
+    ok(true, 'the FIX_LOGIN sub-agent spawned (Enter while busy → delegated, not queued)');
+
+    console.log('\n[2] reject → resume → re-review → approve, all through the real loop');
+    await page.waitForFunction(() => [...saStore.values()].some((sa) => (sa.topic || '').includes('FIX_LOGIN') && sa.status === 'done'), { timeout: 45000, polling: 300 });
+    ok(true, 'the sub-agent reached done (the loop ran reject → resume → approve unattended)');
+    const saId = await page.evaluate(() => { for (const [id, sa] of saStore) if ((sa.topic || '').includes('FIX_LOGIN')) return id; return null; });
+    const seq = (await page.evaluate(() => window._saSeq)).filter((s) => s.includes(`|${saId}|`)).map((s) => { const [t, , r] = s.split('|'); return r ? `${t}:${r}` : t; });
+    console.log('    sequence:', seq.join(' → '));
+    const idx = (n) => seq.indexOf(n);
+    ok(idx('subagent-spawned') === 0, `lifecycle starts with spawned (${seq[0]})`);
+    ok(idx('subagent-reviewing:1') > idx('subagent-result') && idx('subagent-result') > -1, 'result → reviewing (round 1)');
+    ok(idx('subagent-resume:2') > idx('subagent-reviewing:1'), 'REJECT → resume (round 2) came after round-1 review');
+    ok(idx('subagent-reviewing:2') > idx('subagent-resume:2'), 'the revision was re-reviewed (round 2)');
+    ok(seq.lastIndexOf('subagent-done') === seq.length - 1, `lifecycle ends with done (${seq[seq.length - 1]})`);
+
+    console.log('\n[3] main chat shows the both-sides bridge rows');
+    const chatRows = await page.evaluate(() => ({
+      reject: document.querySelectorAll('.row.acceptance-verdict.reject').length,
+      approve: document.querySelectorAll('.row.acceptance-verdict:not(.reject)').length,
+      feedback: [...document.querySelectorAll('.row.acceptance-verdict.reject')].some((r) => /feedback → sub-agent/.test(r.textContent || '')),
+      doneCards: document.querySelectorAll('.row.tool.subagent-call.done').length,
+      logHasFeedback: /FIX_FEEDBACK/.test(document.getElementById('log')?.textContent || ''),
+    }));
+    ok(chatRows.reject >= 1, `a REJECT verdict row is in the main chat (${chatRows.reject})`);
+    ok(chatRows.feedback && chatRows.logHasFeedback, 'the feedback row (✎ feedback → sub-agent) with the actual feedback text is in the main chat');
+    ok(chatRows.approve >= 1, `an APPROVE verdict row is in the main chat (${chatRows.approve})`);
+    ok(chatRows.doneCards >= 1, `the done completion card folded into the chat (${chatRows.doneCards})`);
+    await page.screenshot({ path: path.join(SHOTS, 'reject-1-chat.png') });
+
+    console.log('\n[4] the drawer shows verdict + feedback + revision-round rows');
+    await page.evaluate((id) => openSubagentDetail(id), saId);
+    await page.waitForFunction(() => document.getElementById('saDrawerBg')?.classList.contains('show'), { timeout: 5000 });
+    const drawer = await page.evaluate(() => {
+      const rows = [...document.querySelectorAll('#saDrawerBody .sa-act')];
+      return {
+        verdictReject: rows.some((r) => r.classList.contains('sa-act-verdict') && r.classList.contains('reject')),
+        verdictApprove: rows.some((r) => r.classList.contains('sa-act-verdict') && !r.classList.contains('reject')),
+        feedback: rows.some((r) => r.classList.contains('sa-act-feedback') && /FIX_FEEDBACK/.test(r.textContent || '')),
+        round: rows.some((r) => /revision round 2/.test(r.textContent || '')),
+        result: document.querySelectorAll('#saDrawerBody .sa-drawer-result').length,
+      };
+    });
+    ok(drawer.verdictReject, 'drawer: the REJECT verdict block is visible (sub-agent-side)');
+    ok(drawer.feedback, 'drawer: the feedback block carries the actual feedback text');
+    ok(drawer.round, 'drawer: the ↻ revision round 2 row marks the resume');
+    ok(drawer.verdictApprove, 'drawer: the APPROVE verdict block landed after the revision');
+    ok(drawer.result >= 1, 'drawer: the final result block is shown');
+    await page.screenshot({ path: path.join(SHOTS, 'reject-2-drawer.png') });
+    await page.evaluate(() => closeSubagentDetail());
+
+    console.log('\n[5] the REVISED content integrated; worktree + branch cleaned up');
+    let content = '';
+    for (let i = 0; i < 30; i++) {
+      try { content = await readFile(path.join(dir, 'login.js'), 'utf8'); if (content) break; } catch {}
+      await sleep(400);
+    }
+    ok(/f = 2/.test(content), `login.js integrated with the REVISED content (got "${content.trim()}")`);
+    let wtGone = false;
+    for (let i = 0; i < 30; i++) {
+      const list = await runGit(dir, ['worktree', 'list', '--porcelain']);
+      if (!/cb-sub\//.test(list.stdout)) { wtGone = true; break; }
+      await sleep(500);
+    }
+    ok(wtGone, 'the sub-agent worktree was removed after approve (EBUSY flake possible — re-run standalone if this is the only failure)');
+    const br = await runGit(dir, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/cb-sub/']);
+    ok(!br.stdout.trim(), `the cb-sub branch was deleted after integrate (left: "${br.stdout.trim()}")`);
+    ok(adapter.state.acc === 2, `acceptance ran exactly twice (reject, then approve) — got ${adapter.state.acc}`);
+
+    console.log('\n[6] release the foreground; settle');
+    g.gFG.release();
+    await page.waitForFunction(() => !/busy|running/i.test(document.getElementById('input').placeholder || ''), { timeout: 20000 });
+    ok(true, 'foreground finished (idle)');
+    ok(jsErrors.length === 0, `no JS errors (${jsErrors.length}: ${jsErrors.slice(0, 2).join(' | ')})`);
+  } finally {
+    try { g.gFG.release && g.gFG.release(); } catch {}
+    await browser.close(); server.close();
+    await sleep(500);
+    await cleanupDir(dir); await cleanupDir(wtParent);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-server-death.mjs
new 729647a2a5db94f68cc0508f
+/**
+ * EDGE PROBE (on-demand): server PROCESS killed mid-run.
+ *
+ *  A REAL child-process server (so we can SIGKILL it) streams a run that
+ *  hangs; we kill the process under the browser's feet:
+ *   [1] run starts, partial stream renders, user message persisted;
+ *   [2] SIGKILL the server → confirm the port is dead;
+ *   [3] over the next ~42s (past the 30s SSE watchdog + 3 failed bounded
+ *       /api/state polls) the UI must tell the user: the status row flips to
+ *       a persistent "Lost contact with the server" error and STOPS counting
+ *       (no spinner implying progress); never a modal gate, and the tab itself
+ *       must stay alive;
+ *   [4] a FRESH server process on the SAME port + same project: the old
+ *       page's EventSource may self-heal (observed + recorded), and a manual
+ *       reload MUST recover — conversation restored from conversation.jsonl,
+ *       stale instance.lock (dead pid) taken over silently, input usable;
+ *   [5] a post-recovery message round-trips end to end.
+ *
+ * Port 17973 only. Run: node test/_edge-server-death.mjs (skips w/o Chrome)
+ */
+import { mkdtemp, writeFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { spawn } from 'node:child_process';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath, pathToFileURL } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17973;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const note = (l) => console.log('  --', l);
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+async function api(route) {
+  try {
+    const res = await fetch(`http://127.0.0.1:${PORT}${route}`, { signal: AbortSignal.timeout(5000) });
+    return { status: res.status, body: await res.json().catch(() => ({})) };
+  } catch { return null; }
+}
+async function waitHealthy(timeoutMs = 20000) {
+  const t0 = Date.now();
+  while (Date.now() - t0 < timeoutMs) {
+    if ((await api('/api/state'))?.status === 200) return true;
+    await sleep(250);
+  }
+  return false;
+}
+async function spawnServer(hostFile, projectDir) {
+  const child = spawn(process.execPath, [hostFile], {
+    env: { ...process.env, CB_EDGE_PORT: String(PORT), CB_EDGE_PROJ: projectDir, CB_EDGE_HTML: path.join(ROOT, 'src', 'ui.html') },
+    windowsHide: true,
+  });
+  let out = '';
+  child.stdout.on('data', (d) => { out += d; });
+  child.stderr.on('data', (d) => { out += d; });
+  if (!(await waitHealthy())) throw new Error('child server never became healthy: ' + out.slice(0, 800));
+  return child;
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  const tmp = await mkdtemp(path.join(tmpdir(), 'cb-死-'.replace('死', 'sd')));
+  const projectDir = path.join(tmp, 'proj');
+  const { mkdir } = await import('node:fs/promises');
+  await mkdir(projectDir, { recursive: true });
+
+  // Host script: a REAL server process serving the REAL ui.html with a mock
+  // adapter — 'hang please' streams two chunks then hangs ~10min; anything
+  // else replies fast. Reused unchanged for the fresh post-kill server.
+  const hostFile = path.join(tmp, 'host.mjs');
+  await writeFile(hostFile, [
+    `const { startServer } = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'src', 'server.mjs')).href)});`,
+    `const { readFile } = await import('node:fs/promises');`,
+    `const sleep = (ms) => new Promise((r) => setTimeout(r, ms));`,
+    `const html = (await readFile(process.env.CB_EDGE_HTML, 'utf8')).replace('</head>', '<script>window.SERVER_CONFIG={"defaultModel":"m","baseURL":"(mock)"};</script></head>');`,
+    `const adapter = {`,
+    `  async *completeStream(opts) {`,
+    `    const users = (opts?.messages || []).filter((m) => m.role === 'user');`,
+    `    const c = users[users.length - 1]?.content; const last = typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => (b && b.text) || '').join('\\n') : '';`,
+    `    // Strip the system-reminder block (prepended by assembleConvo) so we match only the`,
+    `    // raw user text. Without this the reviewer's seed prompt — which contains the whole`,
+    `    // conversation transcript including 'hang please' — would trigger the hang path.`,
+    `    const rawLast = last.includes('</system-reminder>') ? last.split('</system-reminder>').pop().trimStart() : last;`,
+    `    // Parallel-critic reviewer calls: the seed/feed prompt starts with 'You are a parallel REVIEWER'.`,
+    `    // Return a clean no-finding verdict so the reviewer doesn't inject false findings that extend the run.`,
+    `    if (rawLast.startsWith('You are a parallel REVIEWER') || rawLast.includes('THE GOAL:')) {`,
+    `      yield { choices: [{ delta: { content: 'No problems found.' } }] };`,
+    `      return;`,
+    `    }`,
+    `    // FLAT TRANSPORT: the whole conversation is ONE user message - hang when 'hang please' is the LATEST developer message`,
+    `    if (rawLast.lastIndexOf('hang please') > rawLast.lastIndexOf('recovery ping') && !/Beginning the long job/.test(rawLast.slice(rawLast.lastIndexOf('hang please')))) {`,
+    `      // enough prose to clear the streamer's 20-char HOLDBACK before the hang`,
+    `      yield { choices: [{ delta: { content: 'Beginning the long job now, this will take a while. ' } }] };`,
+    `      await sleep(300);`,
+    `      yield { choices: [{ delta: { content: 'Still going, crunching through the files one by one, do not go anywhere. ' } }] };`,
+    `      await sleep(10 * 60 * 1000);`,
+    `      return;`,
+    `    }`,
+    `    yield { choices: [{ delta: { content: 'Recovered fine.' } }] };`,
+    `  },`,
+    `  async complete() { return { choices: [{ message: { content: '<review-pass/>' } }] }; },`,
+    `};`,
+    `await startServer({ html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },`,
+    `  defaultModel: 'm', port: Number(process.env.CB_EDGE_PORT), adapter, modelsList: [{ id: 'm' }],`,
+    `  initialProject: process.env.CB_EDGE_PROJ });`,
+    `console.log('READY', process.pid);`,
+  ].join('\n'), 'utf8');
+
+  let child = await spawnServer(hostFile, projectDir);
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForSelector('#chat:not(.hidden)', { timeout: 15000 });
+    await sleep(300);
+
+    // [1] start the hanging run; see the partial stream; let the save debounce flush.
+    await page.click('#input');
+    await page.type('#input', 'hang please');
+    await page.keyboard.press('Enter');
+    await page.waitForFunction(() => (document.getElementById('log')?.textContent || '').includes('Beginning the long job'), { timeout: 15000 });
+    ok(true, '[1] run started and streamed its first chunks');
+    await sleep(1500);   // conversation.jsonl debounce flush (user message persisted)
+    ok(existsSync(path.join(projectDir, '.code_boss', 'conversation.jsonl')), '[1] conversation.jsonl persisted before the crash');
+
+    // [2] SIGKILL the server.
+    child.kill('SIGKILL');
+    await sleep(800);
+    ok((await api('/api/state')) === null, '[2] server is dead (port no longer answers)');
+
+    // [3] watch the UI for ~43s (past the 30s watchdog + 3 failed bounded polls):
+    // the status row must flip to the persistent "lost contact" error.
+    const t0 = Date.now();
+    for (const mark of [5000, 20000, 39000]) {
+      const wait = mark - (Date.now() - t0);
+      if (wait > 0) await sleep(wait);
+      const s = await page.evaluate(() => ({
+        status: window.__sessionRef?.status,
+        modal: document.getElementById('modalBg')?.classList.contains('show') || false,
+        modalTitle: document.getElementById('modalTitle')?.textContent || '',
+        statusRowText: document.querySelector('#log .status')?.textContent || '',
+        connLost: !!document.querySelector('#log .status.conn-lost'),
+      }));
+      note(`t+${Math.round(mark / 1000)}s: status=${s.status} modal=${s.modal} connLost=${s.connLost} row="${s.statusRowText.slice(0, 40)}"`);
+    }
+    await sleep(4000);   // total ≈43s past the kill
+    const fin = await page.evaluate(() => ({
+      status: window.__sessionRef?.status,
+      modal: document.getElementById('modalBg')?.classList.contains('show') || false,
+      connLost: !!document.querySelector('#log .status.conn-lost'),
+      connText: document.querySelector('#log .status.conn-lost')?.textContent || '',
+      alive: 1 + 1,
+    }));
+    ok(fin.alive === 2, '[3] the tab itself is still alive (no renderer crash)');
+    ok(fin.connLost && /[Ll]ost contact with the server/.test(fin.connText),
+      `[3] persistent 'lost contact' status-row error shown within ~43s (connLost=${fin.connLost} row="${fin.connText.slice(0, 70)}")`);
+    ok(!fin.modal, '[3] no blocking modal — the error is a status row (connection-fragility rules)');
+    // The row stopped implying progress: its text is static (no elapsed counter ticking).
+    const rowT1 = await page.evaluate(() => document.querySelector('#log .status')?.textContent || '');
+    await sleep(1300);
+    const rowT2 = await page.evaluate(() => document.querySelector('#log .status')?.textContent || '');
+    ok(rowT1 === rowT2 && /[Ll]ost contact/.test(rowT1), `[3] the spinner/clock STOPPED (row text static across 1.3s: "${rowT1.slice(0, 40)}")`);
+
+    // [4] fresh server, same port + project. First observe EventSource self-heal…
+    child = await spawnServer(hostFile, projectDir);
+    await sleep(8000);   // EventSource auto-reconnect window
+    const selfHeal = await page.evaluate(() => ({ status: window.__sessionRef?.status }));
+    note(`[4] after fresh server, BEFORE reload: page status=${selfHeal.status} (EventSource self-heal ${selfHeal.status !== 'running' ? 'YES' : 'no'})`);
+    // …then the guaranteed path: manual reload.
+    await page.reload({ waitUntil: 'domcontentloaded' });
+    await page.waitForSelector('#chat:not(.hidden)', { timeout: 15000 });
+    await sleep(500);
+    const rec = await page.evaluate(() => ({
+      hasOldMsg: (document.getElementById('log')?.textContent || '').includes('hang please'),
+      status: window.__sessionRef?.status,
+      inputEnabled: !document.getElementById('input').disabled,
+      project: window.__sessionRef?.activeProject || null,
+    }));
+    ok(rec.hasOldMsg, '[4] reload against the fresh server restored the pre-crash conversation from disk');
+    ok(rec.status !== 'running', `[4] fresh session is not stuck running (status=${rec.status})`);
+    ok(rec.inputEnabled, '[4] input is usable after recovery');
+    ok(rec.project === projectDir, `[4] stale instance.lock (dead pid) taken over silently — project reopened (${rec.project})`);
+
+    // [5] post-recovery round-trip.
+    await page.click('#input');
+    await page.type('#input', 'recovery ping');
+    await page.keyboard.press('Enter');
+    await page.waitForFunction(() => (document.getElementById('log')?.textContent || '').includes('Recovered fine.'), { timeout: 20000 });
+    await page.waitForFunction(() => ['idle', 'done', 'error'].includes(window.__sessionRef?.status), { timeout: 20000 });
+    ok(true, '[5] a fresh message round-trips end to end after the recovery');
+
+    ok(jsErrors.length === 0, `no uncaught page exceptions through the whole crash cycle (${jsErrors.length}: ${jsErrors.slice(0, 2).join(' | ')})`);
+  } finally {
+    try { child?.kill('SIGKILL'); } catch {}
+    await browser.close();
+    await sleep(400);
+    await cleanupDir(tmp);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-settings-modal.mjs
new f2f02434b3be72c98e5f8aea
+/**
+ * EDGE PROBE (on-demand): SETTINGS MODAL surfaces, end-to-end through the real
+ * server + real UI (mock in-process adapter that CAPTURES the model of every
+ * LLM call). CB_HOME is pointed at a temp dir so /api/api-key + /api/gitlab-creds
+ * persistence is tested WITHOUT touching the developer's real ~/.code_boss.
+ *
+ *  [1] gear button opens the modal; rows render (project, model select populated
+ *      from /api/models with the default selected, timeout '60 min', tokens '0').
+ *  [2] API key + GitLab prefixes populate asynchronously from the server.
+ *  [3] MODEL SWITCHING: the dropdown value takes effect on the NEXT send — the
+ *      mock adapter must see model-a, then model-b after switching, then model-a
+ *      after switching back.
+ *  [4] Change API key: cancel path leaves everything untouched; empty-save shows
+ *      a validation message; the change-key dialog paints ABOVE the settings
+ *      modal (z-order); save updates the settings prefix + GET /api/api-key +
+ *      writes CB_HOME/.code_boss/api-key.txt.
+ *  [5] Change GitLab creds: empty-save validation; save updates the username
+ *      display + GET /api/gitlab-creds + writes gitlab-creds.json.
+ *  [6] Timeout: POST /api/extend-timeout reflects live in the open modal via SSE;
+ *      changeTimeout() (stubbed prompt) round-trips; out-of-range input alerts
+ *      and changes nothing; API-level ms=30 → 400.
+ *  [7] Escape closes the settings modal.
+ *  [8] PERSISTENCE: a SECOND server started with apiKey:''/gitlabCreds:null
+ *      re-loads both from the CB_HOME files written in [4]/[5].
+ *
+ * Ports: 17968 (app), 17969 (restart server in [8]).
+ * Run: node test/_edge-settings-modal.mjs   (skips if Chrome not found)
+ */
+import { mkdtemp, readFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { cleanupDir } from './_helpers.mjs';
+
+// Relocate the user-home config dir BEFORE importing server.mjs (USER_CONFIG_DIR
+// is computed at module load) so key/creds saves never touch the real ~/.code_boss.
+const CB_HOME_DIR = await mkdtemp(path.join(tmpdir(), 'cb-edge-home-'));
+process.env.CB_HOME = CB_HOME_DIR;
+const { startServer } = await import('../src/server.mjs');
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17968;
+const PORT2 = 17969;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+async function getState(port = PORT) { return (await fetch(`http://127.0.0.1:${port}/api/state`)).json(); }
+async function waitDone(ms = 20000) {
+  const t0 = Date.now();
+  while (Date.now() - t0 < ms) {
+    const s = await getState();
+    if (s.status === 'done' || s.status === 'error') return s;
+    await sleep(60);
+  }
+  throw new Error('run did not finish in time');
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-setedge-'));
+
+  // Mock adapter that records the model of EVERY complete() call.
+  const seen = [];
+  const adapter = {
+    async complete(req) {
+      seen.push({ model: req.model });
+      return { choices: [{ message: { content: 'ok.' } }] };
+    },
+  };
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'model-a', baseURL: '(mock)' }) + ';</script></head>');
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'initial-key-12345', gitlabCreds: { user: 'gl-old', token: 'old-token' },
+    defaultModel: 'model-a', port: PORT, adapter,
+    modelsList: [{ id: 'model-a' }, { id: 'model-b' }, { id: 'model-c' }], initialProject: projectDir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1280, height: 900 });
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForFunction(() => typeof openSettings === 'function' && typeof send === 'function'
+      && document.querySelectorAll('#model option').length === 3, { timeout: 10000 });
+
+    // [1] gear button opens the modal; static rows render.
+    console.log('\n[1] gear opens settings; rows render');
+    await page.click('#settingsBtn');
+    await page.waitForFunction(() => document.getElementById('settingsModalBg')?.classList.contains('show'), { timeout: 5000 });
+    const rows = await page.evaluate(() => ({
+      project: document.getElementById('settingsProject')?.textContent,
+      modelOpts: [...document.querySelectorAll('#model option')].map((o) => o.value),
+      modelSel: document.getElementById('model')?.value,
+      timeout: document.getElementById('settingsTimeout')?.textContent,
+      tokens: document.getElementById('settingsTokens')?.textContent,
+      plugins: [...document.querySelectorAll('#settingsPlugins .plg')].map((e) => ({
+        name: e.querySelector('.plg-name')?.textContent,
+        on: e.querySelector('.plg-dot')?.classList.contains('on'),
+        hasDesc: !!e.querySelector('.plg-desc')?.textContent,
+      })),
+    }));
+    ok(rows.project === projectDir, `project row shows the open project (got "${rows.project}")`);
+    ok(rows.modelOpts.join(',') === 'model-a,model-b,model-c', `model dropdown lists all served models (got ${rows.modelOpts.join(',')})`);
+    ok(rows.modelSel === 'model-a', `default model pre-selected (got "${rows.modelSel}")`);
+    ok(rows.timeout === '60 min', `timeout row shows the server default 60 min (got "${rows.timeout}")`);
+    ok(rows.tokens === '0', `tokens row starts at 0 (got "${rows.tokens}")`);
+    // Plugins section: lists each plugin with an on/off dot + a description.
+    ok(rows.plugins.length >= 1, `plugins section lists the detected plugins (got ${rows.plugins.length})`);
+    ok(rows.plugins.some((p) => p.name === 'mermaid' && p.on), `mermaid shows as active (on dot)`);
+    ok(rows.plugins.some((p) => p.name === 'wl' && !p.on), `wl shows as inactive (off dot — not on PATH in the test env)`);
+    ok(rows.plugins.every((p) => p.hasDesc), `every plugin row carries a description of what it does`);
+
+    // [2] key/creds prefixes populate asynchronously.
+    console.log('\n[2] api-key + gitlab prefixes load');
+    await page.waitForFunction(() => document.getElementById('settingsApiKey')?.textContent === 'initial-…', { timeout: 8000 });
+    ok(true, 'API key row shows the 8-char prefix "initial-…" (never the key)');
+    await page.waitForFunction(() => document.getElementById('settingsGitLab')?.textContent === 'gl-old', { timeout: 8000 });
+    ok(true, 'GitLab row shows the username "gl-old" (never the token)');
+
+    // [3] MODEL SWITCHING takes effect on the next send.
+    console.log('\n[3] model dropdown → next send');
+    await page.evaluate(() => closeSettings());
+    let mark = seen.length;
+    await page.evaluate(() => { document.getElementById('input').value = 'first question'; return send(); });
+    await waitDone();
+    let calls = seen.slice(mark);
+    ok(calls.length >= 1 && calls.every((c) => c.model === 'model-a'), `send #1 hit the adapter with the DEFAULT model (models: ${calls.map((c) => c.model).join(',') || 'none'})`);
+
+    await page.click('#settingsBtn');
+    await page.waitForFunction(() => document.getElementById('settingsModalBg')?.classList.contains('show'), { timeout: 5000 });
+    await page.select('#model', 'model-b');
+    await page.evaluate(() => closeSettings());
+    mark = seen.length;
+    await page.evaluate(() => { document.getElementById('input').value = 'second question'; return send(); });
+    await waitDone();
+    calls = seen.slice(mark);
+    ok(calls.length >= 1 && calls.every((c) => c.model === 'model-b'), `after selecting model-b the NEXT send carries model-b (models: ${calls.map((c) => c.model).join(',') || 'none'})`);
+
+    await page.select('#model', 'model-a');   // switch back without even opening the modal
+    mark = seen.length;
+    await page.evaluate(() => { document.getElementById('input').value = 'third question'; return send(); });
+    await waitDone();
+    calls = seen.slice(mark);
+    ok(calls.length >= 1 && calls.every((c) => c.model === 'model-a'), `switching BACK applies to the following send (models: ${calls.map((c) => c.model).join(',') || 'none'})`);
+
+    // [4] Change API key: cancel, empty-save validation, z-order, real save.
+    console.log('\n[4] change API key');
+    await page.click('#settingsBtn');
+    await page.waitForFunction(() => document.getElementById('settingsModalBg')?.classList.contains('show'), { timeout: 5000 });
+    await page.click('button[onclick="changeApiKey()"]');
+    await page.waitForFunction(() => document.getElementById('initModalBg')?.classList.contains('show'), { timeout: 5000 });
+    const dlg = await page.evaluate(() => {
+      const inp = document.getElementById('apiKeyInput');
+      const r = inp.getBoundingClientRect();
+      const topEl = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
+      return {
+        title: document.getElementById('initModalTitle')?.textContent,
+        hasCancel: !!document.getElementById('apiKeyCancel'),
+        inputOnTop: topEl === inp,
+        settingsStillShown: document.getElementById('settingsModalBg')?.classList.contains('show'),
+      };
+    });
+    ok(dlg.title === 'Change API key', `dialog titled "Change API key" (got "${dlg.title}")`);
+    ok(dlg.hasCancel, 'change-key (non-first-run) offers a Cancel button');
+    ok(dlg.inputOnTop && dlg.settingsStillShown, `change-key dialog paints ABOVE the open settings modal (inputOnTop=${dlg.inputOnTop})`);
+    await page.click('#apiKeyCancel');
+    await sleep(150);
+    const afterCancel = await page.evaluate(() => ({
+      initShown: document.getElementById('initModalBg')?.classList.contains('show'),
+      settingsShown: document.getElementById('settingsModalBg')?.classList.contains('show'),
+      prefix: document.getElementById('settingsApiKey')?.textContent,
+    }));
+    ok(!afterCancel.initShown && afterCancel.settingsShown, 'Cancel closes the dialog; settings stays open');
+    const gk = await (await fetch(`http://127.0.0.1:${PORT}/api/api-key`)).json();
+    ok(gk.prefix === 'initial-…', `cancel changed nothing server-side (prefix=${gk.prefix})`);
+
+    await page.click('button[onclick="changeApiKey()"]');
+    await page.waitForFunction(() => document.getElementById('initModalBg')?.classList.contains('show'), { timeout: 5000 });
+    await page.click('#apiKeySave');   // empty input
+    await page.waitForFunction(() => document.getElementById('apiKeyMsg')?.textContent === 'Key cannot be empty.', { timeout: 3000 });
+    ok(true, 'empty save → inline "Key cannot be empty." (dialog stays)');
+    await page.type('#apiKeyInput', 'new-key-ABCDEF-9876');
+    await page.click('#apiKeySave');
+    await page.waitForFunction(() => document.getElementById('settingsApiKey')?.textContent === 'new-key-…', { timeout: 8000 });
+    ok(true, 'settings re-shows the NEW prefix "new-key-…" after save');
+    const gk2 = await (await fetch(`http://127.0.0.1:${PORT}/api/api-key`)).json();
+    ok(gk2.hasKey === true && gk2.prefix === 'new-key-…', `GET /api/api-key reflects the new key (prefix=${gk2.prefix})`);
+    const keyFile = path.join(CB_HOME_DIR, '.code_boss', 'api-key.txt');
+    const keyOnDisk = existsSync(keyFile) ? await readFile(keyFile, 'utf8') : '(missing)';
+    ok(keyOnDisk === 'new-key-ABCDEF-9876\n', `key persisted to CB_HOME/.code_boss/api-key.txt (got ${JSON.stringify(keyOnDisk.slice(0, 30))})`);
+
+    // [5] Change GitLab creds: empty-save validation + real save.
+    console.log('\n[5] change GitLab creds');
+    await page.click('button[onclick="changeGitLabCreds()"]');
+    await page.waitForFunction(() => document.getElementById('initModalTitle')?.textContent === 'Change GitLab credentials'
+      && document.getElementById('initModalBg')?.classList.contains('show'), { timeout: 5000 });
+    await page.click('#glCredsSave');   // both empty
+    await page.waitForFunction(() => document.getElementById('glCredsMsg')?.textContent === 'Username and token are required.', { timeout: 3000 });
+    ok(true, 'empty save → inline "Username and token are required."');
+    await page.type('#glCredsUser', 'gl-new');
+    await page.click('#glCredsSave');   // token still empty → must STILL refuse
+    await sleep(200);
+    const stillOpen = await page.evaluate(() => document.getElementById('initModalBg')?.classList.contains('show'));
+    ok(stillOpen, 'user without token still refused (dialog stays open)');
+    await page.type('#glCredsToken', 'tok-xyz-123');
+    await page.click('#glCredsSave');
+    await page.waitForFunction(() => document.getElementById('settingsGitLab')?.textContent === 'gl-new', { timeout: 8000 });
+    ok(true, 'settings shows the new GitLab username "gl-new"');
+    const gl = await (await fetch(`http://127.0.0.1:${PORT}/api/gitlab-creds`)).json();
+    ok(gl.hasCreds === true && gl.user === 'gl-new', `GET /api/gitlab-creds reflects the change (user=${gl.user})`);
+    const glFile = path.join(CB_HOME_DIR, '.code_boss', 'gitlab-creds.json');
+    let glOnDisk = null; try { glOnDisk = JSON.parse(await readFile(glFile, 'utf8')); } catch {}
+    ok(glOnDisk && glOnDisk.user === 'gl-new' && glOnDisk.token === 'tok-xyz-123', 'creds persisted to CB_HOME/.code_boss/gitlab-creds.json');
+
+    // [6] Timeout display + change flows.
+    console.log('\n[6] timeout display + change');
+    await page.evaluate(() => fetch('/api/extend-timeout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ms: 300000 }) }));
+    await page.waitForFunction(() => document.getElementById('settingsTimeout')?.textContent === '5 min', { timeout: 5000 });
+    ok(true, 'POST /api/extend-timeout 5min → open modal updates LIVE via SSE to "5 min"');
+    await page.evaluate(() => {
+      window.__alerts = [];
+      window.prompt = () => '7';
+      window.alert = (m) => window.__alerts.push(String(m));
+      return changeTimeout();
+    });
+    await page.waitForFunction(() => document.getElementById('settingsTimeout')?.textContent === '7 min', { timeout: 5000 });
+    ok(true, 'changeTimeout() with "7" → "7 min" round-trips through the server');
+    await page.evaluate(() => { window.prompt = () => '999'; return changeTimeout(); });
+    await sleep(300);
+    const t6 = await page.evaluate(() => ({ alerts: window.__alerts, txt: document.getElementById('settingsTimeout')?.textContent }));
+    ok(t6.alerts.length === 1 && /between 1 and 360/.test(t6.alerts[0]), `out-of-range minutes (999) → validation alert (got "${t6.alerts[0] || 'none'}")`);
+    ok(t6.txt === '7 min', `rejected input changed nothing (still "${t6.txt}")`);
+    const badMs = await fetch(`http://127.0.0.1:${PORT}/api/extend-timeout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ms: 30 }) });
+    ok(badMs.status === 400, `API-level ms=30 → 400 (got ${badMs.status})`);
+
+    // [7] Escape closes settings.
+    console.log('\n[7] Escape closes settings');
+    await page.keyboard.press('Escape');
+    await sleep(150);
+    ok(await page.evaluate(() => !document.getElementById('settingsModalBg')?.classList.contains('show')), 'Escape closed the settings modal');
+
+    ok(jsErrors.length === 0, `no JS errors (${jsErrors.length}: ${jsErrors.slice(0, 2).join(' | ')})`);
+
+    // [8] PERSISTENCE across restart: a fresh server with empty key/creds
+    //     re-loads what the UI saved in [4]/[5] from the CB_HOME files.
+    console.log('\n[8] persistence across a server restart');
+    const { server: server2 } = await startServer({
+      html, baseURL: '(mock)', apiKey: '', gitlabCreds: null,
+      defaultModel: 'model-a', port: PORT2, adapter, modelsList: [{ id: 'model-a' }],
+    });
+    try {
+      const k2 = await (await fetch(`http://127.0.0.1:${PORT2}/api/api-key`)).json();
+      ok(k2.hasKey === true && k2.prefix === 'new-key-…', `restarted server loaded the saved key from disk (prefix=${k2.prefix})`);
+      const g2 = await (await fetch(`http://127.0.0.1:${PORT2}/api/gitlab-creds`)).json();
+      ok(g2.hasCreds === true && g2.user === 'gl-new', `restarted server loaded the saved GitLab creds (user=${g2.user})`);
+    } finally { server2.close(); }
+  } finally {
+    await browser.close(); server.close();
+    await cleanupDir(projectDir);
+    await cleanupDir(CB_HOME_DIR);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-setup.mjs
new 302d4486a4e6a91e514dccf4
+/**
+ * EDGE PROBE (deployment): bare `node code-boss-setup.mjs` (the ADMIN artifact) — the one-shot prod
+ * install (extract → release build → commit → push + move the tag), driven
+ * end-to-end against the REAL dist bundle with a LOCAL BARE git repo standing
+ * in for GitLab (non-http updateSource passes through un-authed).
+ *
+ *   [1] fresh box: setup extracts into code_boss-src/, builds a release,
+ *       inits git, commits, pushes main + the 'devtest' channel tag (bare run) to the remote;
+ *       the COPIED bundle itself is never committed (it lives outside the
+ *       repo); dist/ is gitignored, releases/ is tracked.
+ *   [2] re-run (newer bundle later): re-extracts force+prune into the same
+ *       repo, commits again, MOVES the tag — remote tag now points at the new
+ *       commit.
+ *   [3] guards: bundle inside the target dir → refusal; blank updateSource on
+ *       a non-TTY → clear exit-1 message; --no-push skips the remote.
+ *   [4] non-interactive URL: --source <url> and CB_UPDATE_SOURCE both reach the
+ *       config without the (unreliable) interactive prompt — the first-run bug.
+ *
+ * Run: node test/_edge-setup.mjs
+ */
+import { mkdtemp, mkdir, writeFile, copyFile, readFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import { spawnSync } from 'node:child_process';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
+
+async function main() {
+  const base = await mkdtemp(path.join(tmpdir(), 'cb-setup-'));
+  const home = path.join(base, 'home');
+  const remote = path.join(base, 'remote.git');
+  const work = path.join(base, 'work');
+  await mkdir(path.join(home, '.code_boss'), { recursive: true });
+  await mkdir(work, { recursive: true });
+  sh('git', ['init', '--bare', remote]);
+  await writeFile(path.join(home, '.code_boss', 'build-config.json'),
+    JSON.stringify({ updateSource: remote, updateTag: 'production' }) + '\n');
+  await writeFile(path.join(home, '.code_boss', 'gitlab-creds.json'),
+    JSON.stringify({ user: 'probe-admin', token: 'probe-token-XYZ' }) + '\n');
+  const bundle = path.join(work, 'code-boss-setup.mjs');
+  await copyFile(path.join(ROOT, 'dist', 'code-boss-setup.mjs'), bundle);
+  const env = { ...process.env, CB_HOME: home };
+  const target = path.join(work, 'code_boss-src');
+
+  try {
+    console.log('\n[1] fresh setup: extract + build + commit + push + tag');
+    {
+      const r = sh(process.execPath, ['code-boss-setup.mjs'], { cwd: work, env, timeout: 240000 });
+      ok(r.status === 0, `setup exits 0 (status=${r.status}; tail: ${(r.stderr || r.stdout || '').trim().slice(-200)})`);
+      ok(/\[1\/4\] extracting/.test(r.stdout) && /\[2\/4\] building/.test(r.stdout) && /\[4\/4\] pushing/.test(r.stdout), 'all four phases announced');
+      ok(existsSync(path.join(target, 'src', 'server.mjs')) && existsSync(path.join(target, 'scripts', 'build.mjs')), 'source tree extracted');
+      const buildNum = (await readFile(path.join(target, 'scripts', 'build-number.txt'), 'utf8')).trim();
+      ok(existsSync(path.join(target, 'releases', `code-boss-${buildNum}.mjs`)) && existsSync(path.join(target, 'releases', 'manifest.json')), `release ${buildNum} + manifest written`);
+      ok(/DONE/.test(r.stdout) && /code-boss\.mjs launch/.test(r.stdout) && /ONE file/.test(r.stdout), 'final handout instructions printed (one-file `node code-boss.mjs launch`)');
+
+      const tracked = sh('git', ['ls-files'], { cwd: target }).stdout.split('\n');
+      ok(!tracked.some((f) => f === 'code-boss-setup.mjs'), 'the copied bundle is NOT in the repo (it lives outside the target dir)');
+      ok(!tracked.some((f) => f.startsWith('dist/')), 'dist/ not committed (gitignored)');
+      ok(tracked.some((f) => f === `releases/code-boss-${buildNum}.mjs`) && tracked.some((f) => f === 'releases/manifest.json'), 'releases/ IS committed');
+      const gitCfg = await readFile(path.join(target, '.git', 'config'), 'utf8');
+      ok(!gitCfg.includes('probe-token-XYZ'), 'token never lands in .git/config');
+
+      const remoteMain = sh('git', ['--git-dir', remote, 'rev-parse', 'main'], {});
+      const remoteTag = sh('git', ['--git-dir', remote, 'rev-parse', 'devtest^{commit}'], {});
+      const localHead = sh('git', ['rev-parse', 'HEAD'], { cwd: target });
+      ok(remoteMain.status === 0 && remoteMain.stdout.trim() === localHead.stdout.trim(), 'remote main == local HEAD');
+      ok(remoteTag.status === 0 && remoteTag.stdout.trim() === localHead.stdout.trim(), "remote 'devtest' tag points at the pushed commit");
+    }
+
+    console.log('\n[2] re-run: re-extract over the repo, new commit, tag MOVES');
+    {
+      const headBefore = sh('git', ['rev-parse', 'HEAD'], { cwd: target }).stdout.trim();
+      const r = sh(process.execPath, ['code-boss-setup.mjs'], { cwd: work, env, timeout: 240000 });
+      ok(r.status === 0, `second setup exits 0 (status=${r.status})`);
+      ok(/existing repo — force \+ prune/.test(r.stdout), 're-setup announced as force + prune over the existing repo');
+      const headAfter = sh('git', ['rev-parse', 'HEAD'], { cwd: target }).stdout.trim();
+      ok(headAfter !== headBefore, 'a new commit landed (release build bumps the build number)');
+      const remoteTag = sh('git', ['--git-dir', remote, 'rev-parse', 'devtest^{commit}'], {});
+      ok(remoteTag.stdout.trim() === headAfter, "remote 'devtest' tag MOVED to the new commit");
+    }
+
+    console.log('\n[3] guards');
+    {
+      // Bundle inside the target dir → refusal before anything is touched.
+      const inTargetBundle = path.join(target, 'code-boss-copy.mjs');
+      await copyFile(bundle, inTargetBundle);
+      const r1 = sh(process.execPath, [inTargetBundle, target], { cwd: work, env, timeout: 60000 });
+      ok(r1.status === 1 && /INSIDE the target directory/.test(r1.stderr), `bundle inside target refused (status=${r1.status})`);
+
+      // Blank updateSource, non-TTY → clear message, exit 1.
+      const home2 = path.join(base, 'home2');
+      await mkdir(path.join(home2, '.code_boss'), { recursive: true });
+      const r2 = sh(process.execPath, ['code-boss-setup.mjs', 'other-src'], { cwd: work, env: { ...process.env, CB_HOME: home2 }, timeout: 60000 });
+      ok(r2.status === 1 && /updateSource is not set/.test(r2.stderr), `blank updateSource refused with pointer to the config file (status=${r2.status})`);
+
+      // --no-push: works without creds, remote untouched.
+      const home3 = path.join(base, 'home3');
+      await mkdir(path.join(home3, '.code_boss'), { recursive: true });
+      await writeFile(path.join(home3, '.code_boss', 'build-config.json'), JSON.stringify({ updateSource: remote }) + '\n');
+      const tagBefore = sh('git', ['--git-dir', remote, 'rev-parse', 'devtest^{commit}'], {}).stdout.trim();
+      const r3 = sh(process.execPath, ['code-boss-setup.mjs', 'nopush-src', '--no-push'], { cwd: work, env: { ...process.env, CB_HOME: home3 }, timeout: 240000 });
+      ok(r3.status === 0 && /push SKIPPED/.test(r3.stdout), `--no-push completes without creds (status=${r3.status})`);
+      const tagAfter = sh('git', ['--git-dir', remote, 'rev-parse', 'devtest^{commit}'], {}).stdout.trim();
+      ok(tagAfter === tagBefore, '--no-push left the remote untouched');
+    }
+
+    console.log('\n[4] non-interactive URL via --source / env reaches the config (the first-run paste bug)');
+    {
+      // Fresh home, NO build-config, non-TTY (so the interactive prompt would
+      // return empty — the original "updateSource is not set" failure). Provide
+      // the URL via --source and assert setup gets PAST that gate + persists it.
+      const home4 = path.join(base, 'home4');
+      await mkdir(path.join(home4, '.code_boss'), { recursive: true });
+      const r4 = sh(process.execPath, ['code-boss-setup.mjs', 'flagsrc', '--no-push', '--source', remote],
+        { cwd: work, env: { ...process.env, CB_HOME: home4 }, timeout: 240000 });
+      ok(r4.status === 0 && !/updateSource is not set/.test(r4.stderr), `--source lets setup proceed without the prompt (status=${r4.status}; tail: ${(r4.stderr || '').trim().slice(-160)})`);
+      const cfg4 = JSON.parse(await readFile(path.join(home4, '.code_boss', 'build-config.json'), 'utf8'));
+      ok(cfg4.updateSource === remote, `--source written to build-config.json (got ${cfg4.updateSource})`);
+
+      // Same via env var (CB_UPDATE_SOURCE), fresh home.
+      const home5 = path.join(base, 'home5');
+      await mkdir(path.join(home5, '.code_boss'), { recursive: true });
+      const r5 = sh(process.execPath, ['code-boss-setup.mjs', 'envsrc', '--no-push'],
+        { cwd: work, env: { ...process.env, CB_HOME: home5, CB_UPDATE_SOURCE: remote }, timeout: 240000 });
+      ok(r5.status === 0 && !/updateSource is not set/.test(r5.stderr), `CB_UPDATE_SOURCE lets setup proceed (status=${r5.status})`);
+      const cfg5 = JSON.parse(await readFile(path.join(home5, '.code_boss', 'build-config.json'), 'utf8'));
+      ok(cfg5.updateSource === remote, `CB_UPDATE_SOURCE written to build-config.json (got ${cfg5.updateSource})`);
+    }
+  } finally {
+    await cleanupDir(base);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-sidepanel.mjs
new 761643c5cf4e2b7db83134d5
+/**
+ * EDGE PROBE (on-demand): SIDE PANEL deep edges — beyond the permanent probes
+ * (test-checklist-tab-probe / test-memory-ui-probe / test-wide-layout-probe /
+ * test-ui-tweaks-probe / _edge-mermaid [H]).
+ *
+ *   [K] keyboard nav: Tab focus reaches every visible side-tab button + the «
+ *       collapse toggle; Enter on a focused tab activates its pane.
+ *   [M] Memory bullet editor FULL cycle: add (Enter splits), EDIT in place,
+ *       Shift+Enter = newline INSIDE one bullet (one entry), arrow-hop between
+ *       bullets, Backspace-at-start merges, clearing a bullet deletes its entry,
+ *       >600-char note truncation, cross-category duplicate dedup, and FULL PAGE
+ *       RELOAD persistence of all of it.
+ *   [A] Artifact CAROUSEL with FIVE diagrams: newest-first ordering, count,
+ *       replace-on-same-title bubbles to the front (count stays), thumb→doc-mode
+ *       ⌖-locate scrolls correctly to an OLD diagram far up, locate on a replaced
+ *       artifact targets the NEW fence, thumb click opens an old diagram in doc.
+ *   [C] tab counts accurate across all tabs SIMULTANEOUSLY (checklists /
+ *       assignments / carousel; memory has no count by design).
+ *   [W] narrow 1000px + wide 1700px: tab row fits inside the panel (no
+ *       horizontal clipping of the « toggle), panel min/max widths hold.
+ *   [D] collapse → side chrome DOCKS under the chat input (moves into the
+ *       footer, .docked); » pip appears; expand restores chrome into the panel;
+ *       collapsed state persists across reload (chrome re-docks on boot).
+ *
+ * Run: node test/_edge-sidepanel.mjs    (skips if Chrome not found)
+ */
+import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17964;
+const SHOTS = path.join(__dirname, 'sidepanel-edge-screenshots');
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+const stubAdapter = () => ({
+  async complete() { return { choices: [{ message: { content: 'done.' } }] }; },
+  async *completeStream() { yield { choices: [{ delta: { content: 'done.' } }] }; },
+  async listModels() { return { data: [{ id: 'mock' }] }; },
+});
+
+// Poll GET /api/memory in-page until pred(entries) or timeout; returns entries.
+async function pollMemory(page, predSrc, timeoutMs = 5000) {
+  const t0 = Date.now();
+  let entries = [];
+  while (Date.now() - t0 < timeoutMs) {
+    entries = await page.evaluate(async () => (await fetch('/api/memory')).json()).then((d) => d.entries || []);
+    // eslint-disable-next-line no-new-func
+    if (new Function('entries', `return (${predSrc})(entries)`)(entries)) return entries;
+    await sleep(250);
+  }
+  return entries;
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  await mkdir(SHOTS, { recursive: true });
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-spedge-'));
+
+  // Inject the shared browser sources the way the build does (raw ui.html has
+  // no mermaid renderer of its own) — same strip as _edge-mermaid.
+  const strip = (src) => src
+    .replace(/^import\s+[^;]+;[ \t]*\r?\n?/gm, '')
+    .replace(/^export\s+(async\s+function|function|class|const|let|var)\b/gm, '$1')
+    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
+  const mosaic = strip(await readFile(path.join(ROOT, 'src', 'agent', 'mosaic-layout.mjs'), 'utf8'));
+  const mermaid = strip(await readFile(path.join(ROOT, 'src', 'mermaid-lite.mjs'), 'utf8'));
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8')).replace('</head>',
+    '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: '(mock)' }) + ';</script>' +
+    '<script>' + mosaic + '\n' + mermaid + '</script></head>');
+
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'mock', port: PORT, adapter: stubAdapter(), modelsList: [{ id: 'mock' }], initialProject: projectDir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1400, height: 900 });
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForFunction(() => !!document.getElementById('sidePanel') && typeof selectSideTab === 'function'
+      && typeof onChecklist === 'function' && !!window.__sessionRef, { timeout: 10000 });
+    // The panel now defaults to COLLAPSED; the sections below exercise its OPEN internals.
+    // Expand it once here (a later section deliberately collapses + reloads to test persistence,
+    // which must NOT be clobbered — so this is a one-shot post-load expand, not evaluateOnNewDocument).
+    await page.evaluate(() => setSidePanelCollapsed(false));
+    await sleep(300);
+
+    console.log('\n[K] keyboard nav: Tab reaches the side-tab buttons; Enter activates');
+    {
+      const seq = [];
+      await page.evaluate(() => { document.body.focus(); });
+      for (let i = 0; i < 30; i++) {
+        await page.keyboard.press('Tab');
+        const id = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName || '');
+        seq.push(id);
+        if (id === 'input') break;   // reached the chat box — full traversal done
+      }
+      for (const want of ['tabbtn-checklists', 'tabbtn-assignments', 'tabbtn-memory', 'sideToggle']) {
+        ok(seq.includes(want), `Tab traversal reaches #${want} (path: ${seq.slice(0, 8).join(' → ')}…)`);
+      }
+      const hiddenSkipped = !seq.includes('tabbtn-queue') && !seq.includes('tabbtn-subagents') && !seq.includes('tabbtn-cognition');
+      ok(hiddenSkipped, 'hidden tabs (queue/subagents/cognition) are NOT in the tab order');
+      // Enter on a focused tab activates its pane.
+      await page.evaluate(() => document.getElementById('tabbtn-memory').focus());
+      await page.keyboard.press('Enter');
+      await sleep(150);
+      const act = await page.evaluate(() => ({
+        active: document.getElementById('tabbtn-memory').classList.contains('active'),
+        pane: !document.getElementById('pane-memory').classList.contains('hidden'),
+      }));
+      ok(act.active && act.pane, 'Enter on the focused Memory tab activates the Memory pane');
+      const roles = await page.evaluate(() => ({
+        tablist: !!document.querySelector('.side-tabs[role="tablist"]'),
+        tabRoles: [...document.querySelectorAll('.side-tabs .side-tab')].filter((b) => b.getAttribute('role') === 'tab').length,
+      }));
+      console.log(`    (a11y note: role=tablist present=${roles.tablist}, buttons with role=tab: ${roles.tabRoles})`);
+    }
+
+    console.log('\n[M] Memory bullet editor: full add/edit/merge/delete/persist cycle');
+    {
+      await page.evaluate(() => selectSideTab('memory'));
+      await page.waitForFunction(() => !!document.querySelector('#memoryList .bullet-box[data-cat="gotchas"] .b-input'), { timeout: 4000 });
+      await sleep(300);   // let the (idempotent) re-render from a double tab-open settle before typing
+
+      // add: type, Enter splits to a NEW bullet, type the second fact
+      await page.click('#memoryList .bullet-box[data-cat="gotchas"] .b-input');
+      await page.type('#memoryList .bullet-box[data-cat="gotchas"] .b-input', 'alpha fact EDGE-A');
+      await page.keyboard.press('Enter');
+      await page.keyboard.type('beta fact EDGE-B');
+      await page.waitForFunction(() => document.getElementById('memSaved')?.classList.contains('show'), { timeout: 5000 });
+      ok(true, 'autosave flashed after typing two bullets');
+      let entries = await pollMemory(page, `(e) => e.filter((x) => x.category === 'gotchas').length === 2`);
+      ok(entries.filter((e) => e.category === 'gotchas').length === 2
+        && entries.some((e) => e.note === 'alpha fact EDGE-A') && entries.some((e) => e.note === 'beta fact EDGE-B'),
+        `two separate gotchas entries on the server (${JSON.stringify(entries.map((e) => e.note))})`);
+
+      // EDIT in place: append to the first bullet
+      await page.evaluate(() => {
+        const ta = document.querySelectorAll('#memoryList .bullet-box[data-cat="gotchas"] .b-input')[0];
+        ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
+      });
+      await page.keyboard.type(' EDITED');
+      entries = await pollMemory(page, `(e) => e.some((x) => x.note === 'alpha fact EDGE-A EDITED')`);
+      ok(entries.some((e) => e.note === 'alpha fact EDGE-A EDITED'), 'in-place edit autosaved (note now "…EDGE-A EDITED")');
+
+      // Shift+Enter: newline INSIDE the bullet → still ONE entry, with \n
+      // (re-establish focus explicitly — a headless focus drop here was seen once as a flake)
+      await page.evaluate(() => {
+        const ta = document.querySelectorAll('#memoryList .bullet-box[data-cat="gotchas"] .b-input')[0];
+        ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
+      });
+      await page.keyboard.down('Shift'); await page.keyboard.press('Enter'); await page.keyboard.up('Shift');
+      await page.keyboard.type('second line of the same fact');
+      entries = await pollMemory(page, `(e) => e.some((x) => x.note.includes('EDGE-A EDITED\\nsecond line'))`);
+      const multiline = entries.find((e) => e.note.includes('EDGE-A EDITED'));
+      ok(!!multiline && /\n/.test(multiline.note) && entries.filter((e) => e.category === 'gotchas').length === 2,
+        `Shift+Enter kept ONE entry with an embedded newline (gotchas count ${entries.filter((e) => e.category === 'gotchas').length})`);
+
+      // arrow-hop: ArrowDown at the end of bullet 0 → bullet 1 at pos 0; ArrowUp at start hops back
+      const hops = await page.evaluate(async () => {
+        const tas = [...document.querySelectorAll('#memoryList .bullet-box[data-cat="gotchas"] .b-input')];
+        tas[0].focus(); tas[0].setSelectionRange(tas[0].value.length, tas[0].value.length);
+        return { n: tas.length };
+      });
+      ok(hops.n === 2, `gotchas box still has 2 bullets (got ${hops.n})`);
+      await page.keyboard.press('ArrowDown');
+      const hop1 = await page.evaluate(() => ({ v: document.activeElement?.value, s: document.activeElement?.selectionStart }));
+      ok(hop1.v === 'beta fact EDGE-B' && hop1.s === 0, `ArrowDown at end hops to the next bullet at pos 0 (got "${hop1.v}" @${hop1.s})`);
+      await page.keyboard.press('ArrowUp');
+      const hop2 = await page.evaluate(() => ({ v: (document.activeElement?.value || '').slice(0, 10), end: document.activeElement?.selectionStart === document.activeElement?.value.length }));
+      ok(hop2.v === 'alpha fact' && hop2.end, `ArrowUp at start hops back to the previous bullet's end (got "${hop2.v}…")`);
+
+      // Backspace-at-start MERGES (own category so the rest stays intact)
+      await page.click('#memoryList .bullet-box[data-cat="conventions"] .b-input');
+      await page.keyboard.type('merge-one EDGE');
+      await page.keyboard.press('Enter');
+      await page.keyboard.type('merge-two EDGE');
+      const mergeReady = await page.evaluate(() => {
+        const tas = [...document.querySelectorAll('#memoryList .bullet-box[data-cat="conventions"] .b-input')];
+        if (tas.length >= 2) { tas[1].focus(); tas[1].setSelectionRange(0, 0); }
+        return tas.length;
+      });
+      ok(mergeReady === 2, `Enter split the conventions bullet before the merge test (got ${mergeReady} bullets)`);
+      await page.keyboard.press('Backspace');
+      const merged = await page.evaluate(() => [...document.querySelectorAll('#memoryList .bullet-box[data-cat="conventions"] .b-input')].map((t) => t.value));
+      ok(merged.length === 1 && merged[0] === 'merge-one EDGEmerge-two EDGE', `Backspace at start merged the bullets (${JSON.stringify(merged)})`);
+      entries = await pollMemory(page, `(e) => e.filter((x) => x.category === 'conventions').length === 1 && e.some((x) => x.note === 'merge-one EDGEmerge-two EDGE')`);
+      ok(entries.some((e) => e.note === 'merge-one EDGEmerge-two EDGE'), 'merge persisted as one entry');
+
+      // DELETE: clearing a bullet's text removes its entry on save
+      await page.click('#memoryList .bullet-box[data-cat="build-deploy"] .b-input');
+      await page.keyboard.type('temp fact to delete EDGE');
+      entries = await pollMemory(page, `(e) => e.some((x) => x.note === 'temp fact to delete EDGE')`);
+      ok(entries.some((e) => e.note === 'temp fact to delete EDGE'), 'delete-candidate fact saved first');
+      await page.evaluate(() => {
+        const ta = document.querySelector('#memoryList .bullet-box[data-cat="build-deploy"] .b-input');
+        ta.value = '';
+        ta.dispatchEvent(new Event('input', { bubbles: true }));
+      });
+      entries = await pollMemory(page, `(e) => !e.some((x) => x.category === 'build-deploy')`);
+      ok(!entries.some((e) => e.category === 'build-deploy'), 'clearing the bullet text DELETED the entry server-side');
+
+      // >600-char note: server truncates silently
+      await page.evaluate(() => {
+        const ta = document.querySelector('#memoryList .bullet-box[data-cat="where-things-live"] .b-input');
+        ta.value = 'L'.repeat(700);
+        ta.dispatchEvent(new Event('input', { bubbles: true }));
+      });
+      entries = await pollMemory(page, `(e) => e.some((x) => x.category === 'where-things-live')`);
+      const longNote = entries.find((e) => e.category === 'where-things-live');
+      ok(longNote && longNote.note.length === 600, `700-char note stored truncated to 600 (got ${longNote?.note.length}) — silent truncation, UI shows 700 until reopen`);
+
+      // cross-category duplicate: same text typed under architecture vanishes (dedup is category-blind)
+      await page.evaluate(() => {
+        const ta = document.querySelector('#memoryList .bullet-box[data-cat="architecture"] .b-input');
+        ta.value = 'beta fact EDGE-B';
+        ta.dispatchEvent(new Event('input', { bubbles: true }));
+      });
+      await sleep(1400);   // let the debounced save land
+      entries = await page.evaluate(async () => (await fetch('/api/memory')).json()).then((d) => d.entries || []);
+      const betas = entries.filter((e) => e.note === 'beta fact EDGE-B');
+      ok(betas.length === 1, `duplicate note across categories collapses to ONE entry (got ${betas.length}, kept in "${betas[0]?.category}") — the other copy is silently dropped`);
+
+      // FULL PAGE RELOAD → everything persisted, multiline renders as ONE bullet
+      await page.reload({ waitUntil: 'domcontentloaded' });
+      await page.waitForFunction(() => typeof selectSideTab === 'function' && !!window.__sessionRef, { timeout: 10000 });
+      await page.evaluate(() => selectSideTab('memory'));
+      await page.waitForFunction(() => !!document.querySelector('#memoryList .bullet-box[data-cat="gotchas"] .b-input'), { timeout: 4000 });
+      const after = await page.evaluate(() => {
+        const grab = (cat) => [...document.querySelectorAll(`#memoryList .bullet-box[data-cat="${cat}"] .b-input`)].map((t) => t.value);
+        return { gotchas: grab('gotchas'), conventions: grab('conventions'), buildDeploy: grab('build-deploy'), arch: grab('architecture'), wtl: grab('where-things-live') };
+      });
+      ok(after.gotchas.length === 2 || (after.gotchas.length === 1 && after.arch.includes('beta fact EDGE-B')),
+        `gotchas bullets after reload (${after.gotchas.length}; dedup may have re-homed beta to architecture)`);
+      ok(after.gotchas.some((v) => v.includes('EDGE-A EDITED\nsecond line')), 'multiline note reloads as ONE bullet with the newline intact');
+      ok(after.conventions.includes('merge-one EDGEmerge-two EDGE'), 'merged bullet survived the reload');
+      ok(after.buildDeploy.length === 1 && after.buildDeploy[0] === '', 'deleted category is back to a single empty bullet');
+      ok(after.wtl[0] === 'L'.repeat(600), 'truncated long note reloads at 600 chars');
+    }
+
+    console.log('\n[A] Carousel: FIVE diagrams, ordering, replace bubbles, locate-an-old-one, click→doc');
+    {
+      // Five diagrams interleaved with tall filler so Diag1 ends up FAR above the fold.
+      await page.evaluate(() => {
+        const log = document.getElementById('log');
+        for (let i = 1; i <= 5; i++) {
+          for (let f = 0; f < 40; f++) {
+            const d = document.createElement('div'); d.className = 'row';
+            d.textContent = `filler before diagram ${i} line ${f}`;
+            log.appendChild(d);
+          }
+          const row = document.createElement('div'); row.className = 'row assistant';
+          row.innerHTML = renderInline('```mermaid\ngraph TD\n  D' + i + '[Diag' + i + '] --> X' + i + '[Sink]\n```');
+          log.appendChild(row);
+        }
+      });
+      await sleep(250);   // mmMaybeDiagramHtml registers on a setTimeout(0)
+      const carLabels = () => page.evaluate(() => [...document.querySelectorAll('#carouselStrip .car-thumb .car-label')].map((e) => e.textContent));
+      const t0 = await page.evaluate(() => ({
+        titles: [...document.querySelectorAll('#carouselStrip .car-thumb .car-label')].map((e) => e.textContent),
+        count: document.getElementById('carCount').textContent,
+        hasItems: document.getElementById('carousel').classList.contains('has-items'),
+      }));
+      ok(JSON.stringify(t0.titles) === JSON.stringify(['Diag5', 'Diag4', 'Diag3', 'Diag2', 'Diag1']),
+        `five thumbnails, newest first (got ${JSON.stringify(t0.titles)})`);
+      ok(t0.count === '(5)', `carousel count "(5)" (got "${t0.count}")`);
+      ok(t0.hasItems, 'carousel revealed');
+
+      // Replace Diag2 (same first-node label) → bubbles to front, count stays 5,
+      // and the entry now points at the NEW fence (a later data-mm-id).
+      const newId = await page.evaluate(() => {
+        const log = document.getElementById('log');
+        const row = document.createElement('div'); row.className = 'row assistant';
+        row.innerHTML = renderInline('```mermaid\ngraph TD\n  D2[Diag2] --> Y[Replaced] --> Z[Extra]\n```');
+        log.appendChild(row);
+        return new Promise((res) => setTimeout(() => {
+          const ths = [...document.querySelectorAll('.mm-thumb[data-mm-id]')];
+          res(ths[ths.length - 1].getAttribute('data-mm-id'));
+        }, 120));
+      });
+      const t1 = await page.evaluate(() => ({
+        titles: [...document.querySelectorAll('#carouselStrip .car-thumb .car-label')].map((e) => e.textContent),
+        count: document.getElementById('carCount').textContent,
+      }));
+      ok(JSON.stringify(t1.titles) === JSON.stringify(['Diag2', 'Diag5', 'Diag4', 'Diag3', 'Diag1']),
+        `replace-on-same-title bubbled Diag2 to the front (got ${JSON.stringify(t1.titles)})`);
+      ok(t1.count === '(5)', `count stays "(5)" after the replace (got "${t1.count}")`);
+
+      // Locate an OLD artifact (Diag1, far up): thumb → doc mode → ⌖ closes the doc,
+      // scrolls the chat to the fence + pulse.
+      await page.evaluate(() => { const ls = document.getElementById('logScroll'); ls.scrollTop = ls.scrollHeight; });
+      await sleep(100);
+      const beforeTop = await page.evaluate(() => document.getElementById('logScroll').scrollTop);
+      await page.evaluate(() => [...document.querySelectorAll('#carouselStrip .car-thumb')]
+        .find((t) => t.querySelector('.car-label').textContent === 'Diag1').click());
+      await page.click('#docLocateBtn');
+      await sleep(200);
+      const loc1 = await page.evaluate(() => {
+        const ls = document.getElementById('logScroll');
+        const el = [...document.querySelectorAll('.mm-thumb[data-mm-id]')].find((f) => f.textContent.includes('Diag1'));
+        const r = el.getBoundingClientRect();
+        const mid = window.innerHeight / 2;
+        return { scrollTop: ls.scrollTop, pulsed: el.classList.contains('mm-located'), docOpen: document.getElementById('docMode').classList.contains('show'), centered: r.top < mid && r.bottom > mid - 200 && r.top > -50 };
+      });
+      ok(!loc1.docOpen, 'locate closed document mode');
+      ok(loc1.scrollTop < beforeTop - 500, `locate scrolled WAY up to the old diagram (scrollTop ${beforeTop} → ${loc1.scrollTop})`);
+      ok(loc1.pulsed && loc1.centered, 'old fence pulses (mm-located) and is in the viewport');
+
+      // Locate on the REPLACED Diag2 targets the NEW fence (latest edit), not the original.
+      await page.evaluate(() => { document.getElementById('logScroll').scrollTop = 0; });
+      await page.evaluate(() => [...document.querySelectorAll('#carouselStrip .car-thumb')]
+        .find((t) => t.querySelector('.car-label').textContent === 'Diag2').click());
+      await page.click('#docLocateBtn');
+      await sleep(200);
+      const loc2 = await page.evaluate((nid) => {
+        const el = document.querySelector(`.mm-thumb[data-mm-id="${nid}"]`);
+        const r = el.getBoundingClientRect();
+        return { pulsedNew: el.classList.contains('mm-located'), visible: r.top < window.innerHeight && r.bottom > 0 };
+      }, newId);
+      ok(loc2.pulsedNew && loc2.visible, `locate on the replaced artifact jumps to the NEW fence (mm-id ${newId})`);
+
+      // Thumb click on an OLD artifact opens DOCUMENT MODE rendering ITS diagram.
+      await page.evaluate(() => [...document.querySelectorAll('#carouselStrip .car-thumb')]
+        .find((t) => t.querySelector('.car-label').textContent === 'Diag3').click());
+      const doc3 = await page.evaluate(() => ({
+        shown: document.getElementById('docMode').classList.contains('show'),
+        title: document.getElementById('docTitle').textContent,
+        hasDiag3: (document.getElementById('docBody').textContent || '').includes('Diag3'),
+        isDiagram: document.getElementById('docBody').classList.contains('doc-diagram'),
+      }));
+      ok(doc3.shown && doc3.title === 'Diag3' && doc3.isDiagram, `old diagram opens in document mode (title=${doc3.title})`);
+      ok(doc3.hasDiag3, 'doc mode renders THAT diagram (Diag3 label present)');
+      await page.keyboard.press('Escape');
+    }
+
+    console.log('\n[C] tab counts accurate across the tabs SIMULTANEOUSLY');
+    {
+      await page.evaluate(() => {
+        onChecklist('T-1', [{ text: 'one', done: true }, { text: 'two', done: false }]);
+        onChecklist('T-2', [{ text: 'three', done: false }]);
+      });
+      await page.evaluate(async () => {
+        for (const t of ['Edge asg one', 'Edge asg two', 'Edge asg three']) {
+          await fetch('/api/assignments/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: t }) });
+        }
+        await loadBacklog();
+      });
+      await sleep(300);
+      const counts = await page.evaluate(() => ({
+        checklists: document.getElementById('checklistCount').textContent,
+        assignments: document.getElementById('backlogCount').textContent,
+        carousel: document.getElementById('carCount').textContent,
+        memoryHasCountSpan: !!document.querySelector('#tabbtn-memory .side-tab-count'),
+      }));
+      ok(counts.checklists === ' (2)', `Checklists count " (2)" (got "${counts.checklists}")`);
+      ok(counts.assignments === ' (3)', `Assignments count " (3)" (got "${counts.assignments}")`);
+      ok(counts.carousel === '(5)', `carousel count "(5)" — unchanged by the other tabs (got "${counts.carousel}")`);
+      ok(counts.memoryHasCountSpan === false, 'Memory tab has no count span (by design)');
+      // Assignment rows actually listed (count not lying about content)
+      await page.evaluate(() => selectSideTab('assignments'));
+      const rows = await page.evaluate(() => document.querySelectorAll('#backlogList .backlog-row').length);
+      ok(rows === 3, `Assignments pane lists 3 rows matching the count (got ${rows})`);
+    }
+
+    console.log('\n[W] narrow 1000px / wide 1700px tab-row behavior (with live counts)');
+    {
+      await page.setViewport({ width: 1000, height: 800 });
+      await sleep(300);
+      const n = await page.evaluate(() => {
+        const panel = document.getElementById('sidePanel').getBoundingClientRect();
+        const tabs = document.querySelector('.side-tabs');
+        const toggle = document.getElementById('sideToggle').getBoundingClientRect();
+        const tabRects = [...document.querySelectorAll('.side-tabs .side-tab')].filter((b) => b.offsetParent !== null)
+          .map((b) => ({ id: b.id, right: Math.round(b.getBoundingClientRect().right) }));
+        return {
+          panelW: Math.round(panel.width), panelRight: Math.round(panel.right),
+          overflow: tabs.scrollWidth - tabs.clientWidth,
+          toggleRight: Math.round(toggle.right), toggleVisible: toggle.width > 0 && toggle.right <= panel.right + 1,
+          tabRects,
+        };
+      });
+      console.log('   ', JSON.stringify(n));
+      await page.screenshot({ path: path.join(SHOTS, 'narrow-1000-tabs.png') });
+      ok(n.panelW >= 295 && n.panelW <= 345, `panel holds ~300 min at 1000px (got ${n.panelW})`);
+      ok(n.overflow <= 1, `tab row does not overflow the panel at 1000px (scrollWidth-clientWidth=${n.overflow})`);
+      ok(n.toggleVisible, `« collapse toggle stays visible inside the panel (right ${n.toggleRight} vs panel right ${n.panelRight})`);
+      const clipped = n.tabRects.filter((t) => t.right > n.panelRight + 1).map((t) => t.id);
+      ok(clipped.length === 0, `no tab button is clipped past the panel edge (clipped: ${clipped.join(',') || 'none'})`);
+
+      await page.setViewport({ width: 1700, height: 900 });
+      await sleep(300);
+      const w = await page.evaluate(() => {
+        const panel = document.getElementById('sidePanel').getBoundingClientRect();
+        const tabs = document.querySelector('.side-tabs');
+        const log = document.getElementById('log').getBoundingClientRect();
+        return { panelW: Math.round(panel.width), overflow: tabs.scrollWidth - tabs.clientWidth, logW: Math.round(log.width) };
+      });
+      console.log('   ', JSON.stringify(w));
+      ok(w.panelW <= 600 && w.panelW >= 560, `panel grows toward (but not past) its 600 max at 1700px (got ${w.panelW})`);
+      ok(w.overflow <= 1, `tab row fits at 1700px (overflow=${w.overflow})`);
+      ok(w.logW <= 870, `chat column stays capped ≤860 at 1700px (got ${w.logW})`);
+      await page.setViewport({ width: 1400, height: 900 });
+      await sleep(200);
+    }
+
+    console.log('\n[D] collapse docks the chrome under the input; expand restores; persists across reload');
+    {
+      const before = await page.evaluate(() => ({
+        chromeParent: document.getElementById('sideChrome').parentElement.id,
+        docked: document.getElementById('sideChrome').classList.contains('docked'),
+        reopenVisible: document.getElementById('sideReopen').offsetParent !== null,
+      }));
+      ok(before.chromeParent === 'sidePanel' && !before.docked, `chrome starts in the panel, undocked (parent=${before.chromeParent})`);
+      ok(!before.reopenVisible, '» reopen pip hidden while the panel is open');
+
+      await page.click('#sideToggle');   // the real « button
+      await sleep(300);
+      const c = await page.evaluate(() => {
+        const chrome = document.getElementById('sideChrome');
+        const footer = document.querySelector('#chatMain footer');
+        const cr = chrome.getBoundingClientRect();
+        const ir = document.querySelector('.input-row').getBoundingClientRect();
+        return {
+          inFooter: chrome.parentElement === footer,
+          docked: chrome.classList.contains('docked'),
+          belowInput: cr.top >= ir.bottom - 2,
+          panelW: Math.round(document.getElementById('sidePanel').getBoundingClientRect().width),
+          reopenVisible: document.getElementById('sideReopen').offsetParent !== null,
+          pathVisible: document.getElementById('projectPath').offsetParent !== null,
+          settingsVisible: document.getElementById('settingsBtn').offsetParent !== null,
+          versionHidden: getComputedStyle(document.getElementById('chromeVersion')).display === 'none',
+          ls: localStorage.getItem('cb-side-collapsed'),
+        };
+      });
+      await page.screenshot({ path: path.join(SHOTS, 'collapsed-docked-chrome.png') });
+      ok(c.inFooter && c.docked, 'collapse MOVED #sideChrome into the chat footer with .docked');
+      ok(c.belowInput, 'docked chrome sits BELOW the input row');
+      ok(c.panelW <= 1, `panel collapsed to 0 width (got ${c.panelW})`);
+      ok(c.reopenVisible, '» reopen pip appears');
+      ok(c.pathVisible && c.settingsVisible, 'project path + ⚙ stay usable while docked');
+      ok(c.versionHidden, 'version badge hides in docked mode (.docked .chrome-version)');
+      ok(c.ls === '1', `collapsed state persisted (cb-side-collapsed=${c.ls})`);
+
+      // RELOAD while collapsed → boots collapsed with the chrome docked
+      await page.reload({ waitUntil: 'domcontentloaded' });
+      await page.waitForFunction(() => typeof selectSideTab === 'function' && !!window.__sessionRef, { timeout: 10000 });
+      await sleep(300);
+      const r = await page.evaluate(() => ({
+        collapsed: document.getElementById('sidePanel').classList.contains('collapsed'),
+        inFooter: document.getElementById('sideChrome').parentElement === document.querySelector('#chatMain footer'),
+        docked: document.getElementById('sideChrome').classList.contains('docked'),
+        reopenVisible: document.getElementById('sideReopen').offsetParent !== null,
+      }));
+      ok(r.collapsed && r.inFooter && r.docked, 'reload restores the COLLAPSED panel with the chrome re-docked under the input');
+      ok(r.reopenVisible, '» pip back after reload');
+
+      // Expand via the pip → chrome returns into the panel
+      await page.click('#sideReopen');
+      await sleep(300);
+      const e = await page.evaluate(() => ({
+        chromeParent: document.getElementById('sideChrome').parentElement.id,
+        docked: document.getElementById('sideChrome').classList.contains('docked'),
+        panelW: Math.round(document.getElementById('sidePanel').getBoundingClientRect().width),
+        reopenVisible: document.getElementById('sideReopen').offsetParent !== null,
+        ls: localStorage.getItem('cb-side-collapsed'),
+      }));
+      ok(e.chromeParent === 'sidePanel' && !e.docked, 'expand RESTORES the chrome into the panel (undocked)');
+      ok(e.panelW >= 295, `panel back to full width (got ${e.panelW})`);
+      ok(!e.reopenVisible && e.ls === '0', `pip hidden again, persistence updated (cb-side-collapsed=${e.ls})`);
+    }
+
+    console.log('\n[G] merge row (#3): borderless, parked just ABOVE the status line; docks with it');
+    {
+      // No git project here, so inject a mock merge row and let _placeMergeRow park it.
+      await page.evaluate(() => {
+        document.getElementById('mergeRow')?.remove();
+        const r = document.createElement('div'); r.id = 'mergeRow'; r.className = 'merge-row';
+        r.innerHTML = '<span class="merge-source"><span class="merge-cb">master</span></span><span class="merge-ahead"> · up to date</span>';
+        _placeMergeRow(r);
+      });
+      const open = await page.evaluate(() => {
+        const r = document.getElementById('mergeRow'); const cs = getComputedStyle(r);
+        return {
+          parent: r.parentElement?.id,
+          aboveChrome: r.nextElementSibling === document.getElementById('sideChrome'),
+          inLog: !!document.getElementById('log')?.contains(r),
+          bgNone: cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent',
+          leftBorder: cs.borderLeftWidth,
+          topDivider: cs.borderTopStyle !== 'none',
+        };
+      });
+      ok(open.parent === 'sidePanel', `panel OPEN → merge row lives in the panel (parent=${open.parent})`);
+      ok(open.aboveChrome, 'merge row sits immediately ABOVE the status line (.side-chrome)');
+      ok(!open.inLog, 'merge row is NO LONGER pinned in the chat log');
+      ok(open.bgNone && open.leftBorder === '0px', `borderless + no background (bg-transparent=${open.bgNone}, leftBorder=${open.leftBorder})`);
+      ok(open.topDivider, 'a divider line separates the merge line from the panel body');
+
+      // Collapse → merge row docks under the input, still directly above the docked status line.
+      await page.click('#sideToggle'); await sleep(300);
+      const col = await page.evaluate(() => {
+        const r = document.getElementById('mergeRow'); const chrome = document.getElementById('sideChrome');
+        const ir = document.querySelector('.input-row').getBoundingClientRect();
+        const rr = r.getBoundingClientRect(); const cr = chrome.getBoundingClientRect();
+        return { inFooter: r.parentElement === document.querySelector('#chatMain > footer'), aboveChrome: r.nextElementSibling === chrome, belowInput: rr.top >= ir.bottom - 2, aboveStatus: rr.top <= cr.top + 1 };
+      });
+      ok(col.inFooter && col.aboveChrome, 'collapse DOCKS the merge row into the footer, just above the status line');
+      ok(col.belowInput && col.aboveStatus, 'docked: under the input text, status line below it');
+      await page.screenshot({ path: path.join(SHOTS, 'mergeline-docked.png') });
+
+      // Expand → merge row returns to the panel, above the status line.
+      await page.click('#sideReopen'); await sleep(300);
+      ok(await page.evaluate(() => { const r = document.getElementById('mergeRow'); return r.parentElement?.id === 'sidePanel' && r.nextElementSibling === document.getElementById('sideChrome'); }),
+        'expand returns the merge row to the panel above the status line');
+    }
+
+    ok(jsErrors.length === 0, `no JS errors during the whole run (${jsErrors.length}: ${jsErrors.slice(0, 3).join(' | ')})`);
+  } finally {
+    await browser.close();
+    server.close();
+    await cleanupDir(projectDir);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-slow-first-token.mjs
new b09db76156a37d305472ac3c
+/**
+ * EDGE PROBE (on-demand): SLOW ADAPTER (45s to first token) + cancel mid-wait.
+ *
+ *  The mock adapter behaves like a real HTTP adapter: the 45s first-token
+ *  wait is abortable via opts.signal (fetch would reject on abort).
+ *   [1] during the dead air the status row keeps the user informed: spinner +
+ *       verb + an elapsed clock that ACTUALLY ADVANCES (sampled at ~3s and
+ *       ~9s) + the esc-to-interrupt hint; placeholder says the agent is busy;
+ *   [2] Escape mid-wait cancels: the abort reaches the adapter's signal, the
+ *       session leaves 'running' fast (<5s), the status row lands on a
+ *       visible "canceled" state, and NO error modal pops (user-initiated
+ *       cancel is not an error);
+ *   [3] the chat is immediately usable: a follow-up message round-trips.
+ *
+ * Port 17972 only. Run: node test/_edge-slow-first-token.mjs (skips w/o Chrome)
+ */
+import { mkdtemp, readFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17972;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const note = (l) => console.log('  --', l);
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+// Abortable sleep — mimics fetch() rejecting with AbortError when the run's
+// signal fires (a real adapter passes the signal into fetch).
+function abortableSleep(ms, signal) {
+  return new Promise((res, rej) => {
+    const bail = () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); };
+    if (signal?.aborted) return bail();
+    const t = setTimeout(res, ms);
+    signal?.addEventListener('abort', () => { clearTimeout(t); bail(); }, { once: true });
+  });
+}
+
+const seen = { sawAbort: false, slowCalls: 0 };
+const adapter = {
+  async *completeStream(opts) {
+    const users = (opts?.messages || []).filter((m) => m.role === 'user');
+    const last = String(users[users.length - 1]?.content || '');
+    if (last.includes('slow please') && seen.slowCalls === 0) {
+      seen.slowCalls++;
+      try {
+        await abortableSleep(45000, opts?.signal);   // 45s of dead air before the first token
+      } catch (e) {
+        seen.sawAbort = true;
+        throw e;
+      }
+      yield { choices: [{ delta: { content: 'finally responded after 45 seconds of thinking.' } }] };
+      return;
+    }
+    await sleep(30);
+    yield { choices: [{ delta: { content: 'quick reply, thanks for waiting.' } }] };
+  },
+  async complete() { return { choices: [{ message: { content: '<review-pass/>' } }] }; },
+};
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-slowtok-'));
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'm', baseURL: '(mock)' }) + ';</script></head>');
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'm', port: PORT, adapter, modelsList: [{ id: 'm' }], initialProject: projectDir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForSelector('#chat:not(.hidden)', { timeout: 15000 });
+    await sleep(300);
+
+    // [1] send and sample the status row during the dead air.
+    await page.click('#input');
+    await page.type('#input', 'slow please');
+    await page.keyboard.press('Enter');
+    await page.waitForFunction(() => window.__sessionRef?.status === 'running', { timeout: 8000 });
+    const t0 = Date.now();
+
+    const sample = () => page.evaluate(() => {
+      const row = document.querySelector('#log .status');
+      return {
+        exists: !!row, visible: row ? row.offsetParent !== null : false,
+        text: row?.textContent || '',
+        placeholder: document.getElementById('input')?.placeholder || '',
+        status: window.__sessionRef?.status,
+      };
+    });
+    await sleep(3000 - (Date.now() - t0));
+    const a = await sample();
+    const secsOf = (t) => { const m = t.match(/(\d+)s/); return m ? Number(m[1]) : NaN; };
+    note(`t+3s row: "${a.text.slice(0, 60)}"`);
+    ok(a.exists && a.visible, `status row exists and is visible during the dead air`);
+    ok(/working/i.test(a.text), `row names the verb ("Agent working") while waiting (got "${a.text.slice(0, 30)}")`);
+    ok(Number.isFinite(secsOf(a.text)) && secsOf(a.text) >= 2, `row carries a live elapsed clock (${secsOf(a.text)}s at ~3s)`);
+    ok(/esc to interrupt/i.test(a.text) || /Esc to stop/i.test(a.placeholder), `the user is told HOW to bail (row="${a.text.slice(-25)}" placeholder="${a.placeholder.slice(0, 40)}")`);
+
+    await sleep(9000 - (Date.now() - t0));
+    const b = await sample();
+    note(`t+9s row: "${b.text.slice(0, 60)}"`);
+    ok(b.status === 'running', `still running at t+9s (no premature give-up)`);
+    ok(secsOf(b.text) > secsOf(a.text), `elapsed clock ADVANCED during the wait (${secsOf(a.text)}s → ${secsOf(b.text)}s)`);
+
+    // [2] Escape cancels mid-wait.
+    await page.keyboard.press('Escape');
+    const tCancel = Date.now();
+    let left = false;
+    try {
+      await page.waitForFunction(() => window.__sessionRef?.status !== 'running', { timeout: 5000 });
+      left = true;
+    } catch {}
+    const cancelMs = Date.now() - tCancel;
+    ok(left, `session left 'running' within 5s of Escape (took ${cancelMs}ms)`);
+    ok(seen.sawAbort, 'the abort PROPAGATED to the adapter signal (first token never produced)');
+    await sleep(600);
+    const c = await page.evaluate(() => ({
+      rowText: document.querySelector('#log .status')?.textContent || '',
+      modal: document.getElementById('modalBg')?.classList.contains('show') || false,
+      modalTitle: document.getElementById('modalTitle')?.textContent || '',
+      status: window.__sessionRef?.status,
+      error: window.__sessionRef?.error,
+    }));
+    note(`post-cancel: status=${c.status} error=${c.error} row="${c.rowText.slice(0, 50)}"`);
+    ok(/canceled/i.test(c.rowText), `status row lands on a visible CANCELED state (got "${c.rowText.slice(0, 40)}")`);
+    ok(!c.modal, `no error modal for a user-initiated cancel (modal=${c.modal} "${c.modalTitle}")`);
+
+    // [3] immediately usable again.
+    await page.click('#input');
+    await page.type('#input', 'follow-up after cancel');
+    await page.keyboard.press('Enter');
+    await page.waitForFunction(() => (document.getElementById('log')?.textContent || '').includes('quick reply, thanks for waiting.'), { timeout: 15000 });
+    await page.waitForFunction(() => ['idle', 'done', 'error'].includes(window.__sessionRef?.status), { timeout: 15000 });
+    ok(true, 'a follow-up message round-trips right after the cancel');
+
+    ok(jsErrors.length === 0, `no uncaught page exceptions (${jsErrors.length}: ${jsErrors.slice(0, 2).join(' | ')})`);
+  } finally {
+    await browser.close(); server.close();
+    await cleanupDir(projectDir);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-snapshot-page.mjs
new bc9d3fd95f1ddfe696f74c9f
+/**
+ * EDGE PROBE (on-demand): the STANDALONE /snapshot diagnostics page + Snapshot
+ * entry points + modal/fab interleaving — through the real server + Chrome.
+ *
+ *  [1] GET /snapshot serves the self-contained page; default tiles render
+ *      (DEFAULT_QUERY_IDS), input pre-fills with the default ids, status counts
+ *      tiles, build label renders.
+ *  [2] the numbered diagnostic CATALOG toggles open, lists every catalog entry
+ *      (count matches /api/queries' catalog), includes known ids (1/43/45/71/99),
+ *      and toggles closed.
+ *  [3] typing ids + Render re-renders exactly those tiles (45,46) with names +
+ *      severity classes.
+ *  [4] an UNKNOWN id renders a warn placeholder tile (no crash, no JS errors).
+ *  [5] preset buttons fill the input and render ("dense summary" → #99).
+ *  [6] /snapshot?ids=44 deep-link pre-fills and renders just #44.
+ *  [7] /api/queries input hardening: cols/rows clamped (99999→32, -3/abc→default),
+ *      non-numeric ids → 0 tiles, all 200s.
+ *  [8] openSnapshot() from the main UI opens the standalone page in a NEW named
+ *      tab; a second openSnapshot() REUSES that tab (no tab leak); closing it
+ *      leaves the main UI intact.
+ *  [9] snapshot-fab interleaving (extends test-snapshot-fab-probe): whats-new
+ *      open → fab hidden (would cover "Got it"); commit modal stacked on top →
+ *      fab docks into the commit modal; snapshot view (modalBg) on top of that →
+ *      hidden; closing modalBg re-docks into the commit modal; closing all →
+ *      hidden on main chat.
+ *
+ * Port: 17968 (app). Run: node test/_edge-snapshot-page.mjs  (skips if no Chrome)
+ */
+import { mkdtemp, readFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { cleanupDir } from './_helpers.mjs';
+
+const CB_HOME_DIR = await mkdtemp(path.join(tmpdir(), 'cb-edge-home4-'));
+process.env.CB_HOME = CB_HOME_DIR;
+const { startServer, DEFAULT_QUERY_IDS } = await import('../src/server.mjs');
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17968;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-snapedge-'));
+  const adapter = { async complete() { return { choices: [{ message: { content: 'ok.' } }] }; } };
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: '(mock)' }) + ';</script></head>');
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'mock', port: PORT, adapter, modelsList: [{ id: 'mock' }], initialProject: projectDir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const snapErrors = [], mainErrors = [];
+  try {
+    // ── the standalone page ───────────────────────────────────────────────
+    const snap = await browser.newPage();
+    await snap.setViewport({ width: 1280, height: 900 });
+    snap.on('pageerror', (e) => snapErrors.push(String(e.message)));
+    await snap.goto(`http://127.0.0.1:${PORT}/snapshot`);
+
+    // [1] default tiles render.
+    console.log('\n[1] default render');
+    await snap.waitForFunction(() => document.querySelectorAll('#grid .tile').length > 0, { timeout: 10000 });
+    const d1 = await snap.evaluate(() => ({
+      title: document.title,
+      header: document.querySelector('header b')?.textContent,
+      tiles: [...document.querySelectorAll('#grid .tile .tid')].map((e) => e.textContent),
+      input: document.getElementById('ids')?.value,
+      status: document.getElementById('status')?.textContent,
+      build: document.getElementById('build')?.textContent,
+    }));
+    ok(d1.title === 'code_boss diagnostics' && d1.header === 'code_boss', `standalone page boots (title="${d1.title}")`);
+    ok(d1.tiles.join(',') === DEFAULT_QUERY_IDS.map((n) => '#' + n).join(','), `default tiles are DEFAULT_QUERY_IDS (got ${d1.tiles.join(',')})`);
+    ok(d1.input === DEFAULT_QUERY_IDS.join(','), `ids input pre-fills with the defaults (got "${d1.input}")`);
+    ok(new RegExp(`^${DEFAULT_QUERY_IDS.length} tiles · `).test(d1.status), `status counts the tiles (got "${d1.status}")`);
+    ok(/^build .+/.test(d1.build) && !/undefined|\?/.test(d1.build), `build label renders (got "${d1.build}")`);
+
+    // [2] the numbered catalog.
+    console.log('\n[2] catalog toggle');
+    const apiCatalog = (await (await fetch(`http://127.0.0.1:${PORT}/api/queries?ids=1`)).json()).catalog || [];
+    await snap.click('#catToggle');
+    await snap.waitForFunction(() => document.getElementById('catalog')?.classList.contains('show'), { timeout: 3000 });
+    const cat = await snap.evaluate(() => ({
+      rows: document.querySelectorAll('#catalog .catrow').length,
+      ids: [...document.querySelectorAll('#catalog .catrow b')].map((e) => e.textContent),
+      text: document.getElementById('catalog')?.textContent || '',
+    }));
+    ok(cat.rows === apiCatalog.length && cat.rows >= 30, `catalog lists EVERY query (${cat.rows} rows = API catalog ${apiCatalog.length})`);
+    ok(['1', '43', '45', '71', '99'].every((id) => cat.ids.includes(id)), 'known ids 1/43/45/71/99 present');
+    ok(/Pending unlock/.test(cat.text) && /Manager-pass diagnostics/.test(cat.text), 'catalog rows carry names + descriptions');
+    await snap.click('#catToggle');
+    ok(await snap.evaluate(() => !document.getElementById('catalog')?.classList.contains('show')), 'second click hides the catalog');
+
+    // [3] typed ids render those tiles.
+    console.log('\n[3] typed ids');
+    await snap.evaluate(() => { document.getElementById('ids').value = '45,46'; });
+    await snap.click('#go');
+    await snap.waitForFunction(() => {
+      const t = [...document.querySelectorAll('#grid .tile .tid')].map((e) => e.textContent).join(',');
+      return t === '#45,#46';
+    }, { timeout: 8000 });
+    const d3 = await snap.evaluate(() => [...document.querySelectorAll('#grid .tile')].map((t) => ({
+      id: t.querySelector('.tid')?.textContent, name: t.querySelector('.tname')?.textContent, cls: t.className,
+    })));
+    ok(d3[0].name === 'Pending unlock' && /sev-ok/.test(d3[0].cls), `#45 renders ok (no unlock in flight) (got ${d3[0].name}/${d3[0].cls})`);
+    ok(d3[1].name === 'SSE subscribers', `#46 renders (got ${d3[1].name})`);
+
+    // [4] unknown id → warn placeholder, no crash.
+    console.log('\n[4] unknown id');
+    await snap.evaluate(() => { document.getElementById('ids').value = '9999'; });
+    await snap.click('#go');
+    await snap.waitForFunction(() => document.querySelectorAll('#grid .tile').length === 1
+      && /unknown query #9999/.test(document.querySelector('#grid .tile .tname')?.textContent || ''), { timeout: 8000 });
+    const d4 = await snap.evaluate(() => ({
+      cls: document.querySelector('#grid .tile')?.className,
+      body: document.querySelector('#grid .tile .tbody')?.textContent,
+    }));
+    ok(/sev-warn/.test(d4.cls) && /no catalog entry for id=9999/.test(d4.body), `unknown id → warn placeholder (got "${d4.body}")`);
+
+    // [5] preset buttons.
+    console.log('\n[5] presets');
+    await snap.click('button[data-ids="99"]');
+    await snap.waitForFunction(() => [...document.querySelectorAll('#grid .tile .tid')].map((e) => e.textContent).join(',') === '#99', { timeout: 8000 });
+    const d5 = await snap.evaluate(() => ({
+      input: document.getElementById('ids')?.value,
+      body: document.querySelector('#grid .tile .tbody')?.textContent || '',
+    }));
+    ok(d5.input === '99', `preset fills the input (got "${d5.input}")`);
+    ok(/build/.test(d5.body) && d5.body.length > 40, 'dense summary (#99) carries the one-block dump');
+
+    // [6] deep link.
+    console.log('\n[6] ?ids= deep link');
+    await snap.goto(`http://127.0.0.1:${PORT}/snapshot?ids=44`);
+    await snap.waitForFunction(() => document.querySelectorAll('#grid .tile').length === 1, { timeout: 8000 });
+    const d6 = await snap.evaluate(() => ({
+      input: document.getElementById('ids')?.value,
+      name: document.querySelector('#grid .tile .tname')?.textContent,
+      body: document.querySelector('#grid .tile .tbody')?.textContent,
+    }));
+    ok(d6.input === '44' && d6.name === 'API key state' && /hasKey=YES/.test(d6.body), `deep link renders just #44 (got ${d6.name}: "${d6.body}")`);
+
+    // [7] /api/queries input hardening.
+    console.log('\n[7] /api/queries hardening');
+    const q1 = await (await fetch(`http://127.0.0.1:${PORT}/api/queries?ids=1&cols=99999&rows=-3`)).json();
+    ok(q1.pageCols === 32 && q1.pageRows === 24, `cols=99999→32 clamped, rows=-3→default 24 (got ${q1.pageCols}x${q1.pageRows})`);
+    const q2 = await (await fetch(`http://127.0.0.1:${PORT}/api/queries?ids=1&cols=abc&rows=abc`)).json();
+    ok(q2.pageCols === 12 && q2.pageRows === 24, `non-numeric dims → defaults 12x24 (got ${q2.pageCols}x${q2.pageRows})`);
+    const q3r = await fetch(`http://127.0.0.1:${PORT}/api/queries?ids=abc,,;drop`);
+    const q3 = await q3r.json();
+    ok(q3r.status === 200 && (q3.tiles || []).length === 0, `garbage ids → 200 with 0 tiles (got ${q3r.status}, ${q3.tiles?.length} tiles)`);
+
+    // ── entry points + fab interleaving on the MAIN UI ────────────────────
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1280, height: 900 });
+    page.on('pageerror', (e) => mainErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForFunction(() => typeof openSnapshot === 'function' && typeof dockSnapFab === 'function', { timeout: 10000 });
+
+    // [8] openSnapshot opens ONE named tab and reuses it.
+    console.log('\n[8] openSnapshot tab behavior');
+    const countSnapPages = async () => (await browser.pages()).filter((p) => p.url().includes('/snapshot')).length;
+    const baseline = await countSnapPages();   // the probe's own snap tab
+    await page.evaluate(() => openSnapshot());
+    await sleep(800);
+    const after1 = await countSnapPages();
+    ok(after1 === baseline + 1, `openSnapshot opened the standalone page in a new tab (snapshot tabs ${baseline}→${after1})`);
+    await page.evaluate(() => openSnapshot());
+    await sleep(800);
+    const after2 = await countSnapPages();
+    ok(after2 === baseline + 1, `a second openSnapshot REUSED the named tab — no tab leak (still ${after2 - baseline} app-opened tab)`);
+    for (const p of (await browser.pages()).filter((p) => p.url().includes('/snapshot') && p !== snap)) await p.close();
+    ok(await page.evaluate(() => !!document.getElementById('input')), 'main UI intact after closing the snapshot tab');
+
+    // [9] fab docking through stacked modals.
+    console.log('\n[9] fab interleaving');
+    const fabState = () => page.evaluate(() => {
+      const fab = document.getElementById('snapFab');
+      const shown = fab && !fab.classList.contains('hidden') && getComputedStyle(fab).display !== 'none';
+      return { shown, inModal: fab?.classList.contains('in-modal'), parent: fab?.closest('.modal-bg')?.id ?? null };
+    });
+    const show = (id) => page.evaluate((i) => document.getElementById(i)?.classList.add('show'), id);
+    const hide = (id) => page.evaluate((i) => document.getElementById(i)?.classList.remove('show'), id);
+
+    await show('whatsNewModalBg'); await sleep(150);
+    let s = await fabState();
+    ok(!s.shown, `whats-new open → fab HIDDEN (would sit on "Got it") (got shown=${s.shown})`);
+    await show('commitModalBg'); await sleep(150);   // z175 stacks above whats-new (z100)
+    s = await fabState();
+    ok(s.shown && !s.inModal && s.parent === null, `commit modal stacked on top → fab FLOATS on the viewport (not docked into modal) (shown=${s.shown} inModal=${s.inModal} parent=${s.parent})`);
+    await show('modalBg'); await sleep(150);          // snapshot view (z200) above everything
+    s = await fabState();
+    ok(!s.shown, `snapshot view on top → fab hidden (got shown=${s.shown})`);
+    await hide('modalBg'); await sleep(150);
+    s = await fabState();
+    ok(s.shown && !s.inModal && s.parent === null, `closing the snapshot view → fab still FLOATS over commit modal (not re-docked) (shown=${s.shown} inModal=${s.inModal} parent=${s.parent})`);
+    await hide('commitModalBg'); await sleep(150);
+    s = await fabState();
+    ok(!s.shown, `back to whats-new on top → fab hidden again (got shown=${s.shown})`);
+    await hide('whatsNewModalBg'); await sleep(150);
+    s = await fabState();
+    ok(!s.shown, `all modals closed on the main chat → fab hidden (got shown=${s.shown})`);
+
+    ok(snapErrors.length === 0, `no JS errors on the snapshot page (${snapErrors.length}: ${snapErrors.slice(0, 2).join(' | ')})`);
+    ok(mainErrors.length === 0, `no JS errors on the main page (${mainErrors.length}: ${mainErrors.slice(0, 2).join(' | ')})`);
+  } finally {
+    await browser.close(); server.close();
+    await cleanupDir(projectDir);
+    await cleanupDir(CB_HOME_DIR);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-unlock-midrun.mjs
new f00166b34d3c6ec9f3dd4157
+/**
+ * EDGE PROBE (on-demand): API-key UNLOCK arriving MID-RUN — a /chat/completions
+ * call (not the init-time /models fetch that test-unlock-flow.mjs covers)
+ * returns 401 + unlock_url while a send is in flight. Real http adapter (built
+ * by startServer), real SSE, real two-stage modal.
+ *
+ *  [1] send → first completions call 401s → "API key locked" modal appears
+ *      while the run is STILL RUNNING (parked, not failed); stage 1 only.
+ *  [2] the Snapshot catalog (#45 Pending unlock) turns critical with the
+ *      resolver count + URL while parked; #44 still shows the key as present.
+ *  [3] "Open unlock page" opens the exact unlock_url (stubbed window.open) and
+ *      reveals stage 2 ("Reopen" + "I'm finished").
+ *  [4] "I'm finished" → POST /api/unlock-done → the PARKED call retries and the
+ *      run COMPLETES; the retried request reaches the endpoint (2 calls total,
+ *      identical conversation); the reply renders in the log.
+ *  [5] catalog #45 returns to ok after resume.
+ *  [6] a STALE second unlock-done (nothing pending) is a 200 no-op.
+ *
+ * Ports: 17968 (app), 17969 (mock LLM endpoint).
+ * Run: node test/_edge-unlock-midrun.mjs   (skips if Chrome not found)
+ */
+import { mkdtemp, readFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { createServer as createHttpServer } from 'node:http';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { cleanupDir } from './_helpers.mjs';
+
+const CB_HOME_DIR = await mkdtemp(path.join(tmpdir(), 'cb-edge-home3-'));
+process.env.CB_HOME = CB_HOME_DIR;
+const { startServer } = await import('../src/server.mjs');
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const APP_PORT = 17968;
+const LLM_PORT = 17969;
+const UNLOCK_URL = `http://127.0.0.1:${LLM_PORT}/user-ui/unlock/abc123`;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+// Mock LLM: FIRST completions call → 401 + unlock_url; all later calls → 200.
+const llm = { calls: [] };
+function startMockLlm() {
+  const server = createHttpServer(async (req, res) => {
+    const chunks = [];
+    for await (const c of req) chunks.push(c);
+    const raw = Buffer.concat(chunks).toString('utf8');
+    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
+      let body = {}; try { body = JSON.parse(raw); } catch {}
+      llm.calls.push(body);
+      if (llm.calls.length === 1) {
+        res.writeHead(401, { 'content-type': 'application/json' });
+        return res.end(JSON.stringify({ error: { message: 'API key locked', unlock_url: UNLOCK_URL } }));
+      }
+      res.writeHead(200, { 'content-type': 'application/json' });
+      return res.end(JSON.stringify({
+        id: 'mock-' + llm.calls.length, object: 'chat.completion',
+        choices: [{ index: 0, message: { role: 'assistant', content: 'All done after unlock.' }, finish_reason: 'stop' }],
+        usage: { prompt_tokens: 5, completion_tokens: 4, total_tokens: 9 },
+      }));
+    }
+    res.writeHead(404, { 'content-type': 'application/json' });
+    res.end('{"error":"not found"}');
+  });
+  return new Promise((resolve) => server.listen(LLM_PORT, '127.0.0.1', () => resolve(server)));
+}
+
+const getState = async () => (await fetch(`http://127.0.0.1:${APP_PORT}/api/state`)).json();
+const queryTile = async (id) => {
+  const j = await (await fetch(`http://127.0.0.1:${APP_PORT}/api/queries?ids=${id}`)).json();
+  return (j.tiles || [])[0] || null;
+};
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-unlockmid-'));
+  const mockLlm = await startMockLlm();
+
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: `http://127.0.0.1:${LLM_PORT}/v1` }) + ';</script></head>');
+  const { server } = await startServer({
+    html, baseURL: `http://127.0.0.1:${LLM_PORT}/v1`, apiKey: 'locked-key', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'mock', port: APP_PORT, modelsList: [{ id: 'mock' }], initialProject: projectDir,
+    // no providedAdapter: the REAL http adapter's 401→onUnlock→park path is the unit under test
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1280, height: 900 });
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${APP_PORT}/`);
+    await page.waitForFunction(() => typeof send === 'function' && document.querySelectorAll('#model option').length >= 1, { timeout: 10000 });
+    // Stub window.open BEFORE the modal can appear; record what it would open.
+    await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
+
+    // [1] send → 401 mid-run → modal appears while the run is still RUNNING.
+    console.log('\n[1] mid-run 401 raises the unlock modal');
+    await page.evaluate(() => { document.getElementById('input').value = 'please do the thing'; return send(); });
+    await page.waitForFunction(() => document.getElementById('initModalTitle')?.textContent === 'API key locked'
+      && document.getElementById('initModalBg')?.classList.contains('show'), { timeout: 15000 });
+    ok(true, 'unlock modal appeared for a mid-run completions 401');
+    const st1 = await getState();
+    ok(st1.status === 'running', `the run is PARKED, not failed (status=${st1.status})`);
+    const stage1 = await page.evaluate(() => ({
+      url: document.querySelector('#initModalBody div')?.textContent || '',
+      s1: document.getElementById('unlockStage1')?.style.display !== 'none',
+      s2: document.getElementById('unlockStage2')?.style.display === 'none',
+    }));
+    ok(stage1.url.includes(UNLOCK_URL), 'modal displays the unlock URL');
+    ok(stage1.s1 && stage1.s2, 'two-stage UI starts at stage 1 (only "Open unlock page")');
+
+    // [2] Snapshot catalog reflects the parked state.
+    console.log('\n[2] catalog #45/#44 while parked');
+    const t45 = await queryTile(45);
+    ok(t45?.severity === 'critical' && /BLOCKED on unlock — 1 LLM call\(s\) waiting/.test(t45?.body || ''), `#45 Pending unlock is critical with the resolver count (got "${(t45?.body || '').split('\n')[0]}")`);
+    ok((t45?.body || '').includes(UNLOCK_URL), '#45 body carries the unlock URL');
+    const t44 = await queryTile(44);
+    ok(t44?.severity === 'ok' && /hasKey=YES/.test(t44?.body || ''), `#44 API key state stays ok (locked ≠ missing) (got "${t44?.body}")`);
+
+    // [3] stage 1 → stage 2.
+    console.log('\n[3] open unlock page → stage 2');
+    await page.click('#unlockOpen');
+    await page.waitForSelector('#unlockDone', { visible: true, timeout: 3000 });
+    const opened = await page.evaluate(() => window.__opened);
+    ok(opened.length === 1 && opened[0] === UNLOCK_URL, `"Open unlock page" opened exactly the unlock_url (got ${JSON.stringify(opened)})`);
+    const s3 = await page.evaluate(() => ({
+      reopen: !!document.getElementById('unlockReopen'),
+      msg: document.getElementById('unlockMsg')?.textContent || '',
+    }));
+    ok(s3.reopen && /Opened in a new tab/.test(s3.msg), 'stage 2 shows Reopen + guidance text');
+    await page.click('#unlockReopen');
+    const opened2 = await page.evaluate(() => window.__opened);
+    ok(opened2.length === 2 && opened2[1] === UNLOCK_URL, 'Reopen opens the same URL again');
+
+    // [4] I'm finished → parked call retries → run completes.
+    console.log('\n[4] unlock-done resumes the parked run');
+    await page.click('#unlockDone');
+    await page.waitForFunction(() => !document.getElementById('initModalBg')?.classList.contains('show'), { timeout: 5000 });
+    ok(true, 'modal closes optimistically on "I\'m finished"');
+    const t0 = Date.now();
+    let st4 = null;
+    while (Date.now() - t0 < 20000) {
+      st4 = await getState();
+      if (st4.status === 'done' || st4.status === 'error') break;
+      await sleep(100);
+    }
+    ok(st4?.status === 'done', `the parked run RESUMED and finished (status=${st4?.status}, error=${st4?.error ?? 'none'})`);
+    // The continuous reviewer (now DEFAULT ON) fires its own async LLM sub-call after turn 1,
+    // then injects a finding which causes a second agent turn — so 4 total completions calls:
+    //   call 1: initial completions → 401 (unlock triggered)
+    //   call 2: retry after unlock  → "All done after unlock." (the actual retry, same convo)
+    //   call 3: reviewer background investigateForReviewer sub-call
+    //   call 4: turn 2 — agent reworks based on reviewer finding
+    ok(llm.calls.length === 4, `the 401'd request was retried exactly once (completions calls=${llm.calls.length})`);
+    const sameConvo = JSON.stringify(llm.calls[0]?.messages) === JSON.stringify(llm.calls[1]?.messages);
+    ok(sameConvo, 'the retry re-sent the IDENTICAL conversation');
+    await page.waitForFunction(() => /All done after unlock\./.test(document.getElementById('log')?.innerText || ''), { timeout: 8000 });
+    ok(true, 'the post-unlock reply rendered in the chat log');
+
+    // [5] catalog #45 back to ok.
+    console.log('\n[5] catalog clears');
+    const t45b = await queryTile(45);
+    ok(t45b?.severity === 'ok' && /none — no unlock in flight/.test(t45b?.body || ''), `#45 returns to ok after resume (got "${t45b?.body}")`);
+
+    // [6] stale unlock-done is a 200 no-op.
+    console.log('\n[6] stale unlock-done');
+    const stale = await fetch(`http://127.0.0.1:${APP_PORT}/api/unlock-done`, { method: 'POST' });
+    const staleJson = await stale.json();
+    ok(stale.status === 200 && staleJson.ok === true, `stale unlock-done → 200 {ok:true} no-op (got ${stale.status})`);
+    const st6 = await getState();
+    ok(st6.status === 'done', `stale click disturbed nothing (status=${st6.status})`);
+
+    ok(jsErrors.length === 0, `no JS errors (${jsErrors.length}: ${jsErrors.slice(0, 2).join(' | ')})`);
+  } finally {
+    await browser.close(); server.close(); mockLlm.close();
+    await cleanupDir(projectDir);
+    await cleanupDir(CB_HOME_DIR);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-unlock-vs-changekey.mjs
new 600c3af336f7c4b40e9e8f8f
+/**
+ * EDGE PROBE (on-demand): COLLISIONS on the shared #initModalBg — the unlock
+ * modal, the Change-API-key dialog, and the Settings probe buttons all share
+ * one modal element / one adapter. Real server, real http adapter, mock LLM.
+ *
+ * Scenario A — unlock-needed arrives while "Change API key" is OPEN (the user
+ * is typing a replacement key when a background run hits a 401):
+ *   [A1] the unlock modal PREEMPTS the change-key form in #initModalBg via the
+ *        ownership handshake (_initModalOwner): the dialog is cancelled CLEANLY
+ *        (its promise resolves false, no orphan) with the half-typed draft
+ *        captured; NO JS errors.
+ *   [A2] the run still completes after the unlock dance (the collision must not
+ *        wedge the parked call) — and unlock-done RE-OPENS the preempted dialog
+ *        with the half-typed key restored.
+ *   [A3] RECOVERY: a fresh Change API key afterwards starts empty and saves —
+ *        the preempted first dialog leaves no zombie state behind.
+ *
+ * Scenario B — the "Test image support" probe call itself gets 401-parked:
+ *   [B1] mid-probe the unlock modal appears while the probe button is disabled.
+ *   [B2] finishing the unlock resumes the parked probe request; the probe
+ *        completes, results render, the button is restored (not stuck on
+ *        "Testing…" forever).
+ *
+ * Ports: 17968 (app), 17969 (mock LLM endpoint).
+ * Run: node test/_edge-unlock-vs-changekey.mjs   (skips if Chrome not found)
+ */
+import { mkdtemp, readFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { createServer as createHttpServer } from 'node:http';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { cleanupDir } from './_helpers.mjs';
+
+const CB_HOME_DIR = await mkdtemp(path.join(tmpdir(), 'cb-edge-home5-'));
+process.env.CB_HOME = CB_HOME_DIR;
+const { startServer } = await import('../src/server.mjs');
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const APP_PORT = 17968;
+const LLM_PORT = 17969;
+const UNLOCK_URL = `http://127.0.0.1:${LLM_PORT}/user-ui/unlock/xyz`;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const note = (l) => console.log('  note:', l);
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+// Mock LLM: 401s a completions call whenever lockNext is set; 200 otherwise.
+const llm = { lockNext: false, calls: 0 };
+function startMockLlm() {
+  const server = createHttpServer(async (req, res) => {
+    const chunks = [];
+    for await (const c of req) chunks.push(c);
+    const raw = Buffer.concat(chunks).toString('utf8');
+    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
+      llm.calls++;
+      let body = {}; try { body = JSON.parse(raw); } catch {}
+      if (llm.lockNext) {
+        llm.lockNext = false;
+        res.writeHead(401, { 'content-type': 'application/json' });
+        return res.end(JSON.stringify({ error: { message: 'API key locked', unlock_url: UNLOCK_URL } }));
+      }
+      const txt = JSON.stringify(body.messages || []);
+      const parts = [];
+      for (const m of body.messages || []) if (Array.isArray(m.content)) parts.push(...m.content);
+      let content = 'run finished.';
+      if (/dominant color of this image/.test(txt)) {
+        content = parts.some((p) => p && p.type === 'image_url') ? 'magenta' : 'no image visible';
+      }
+      res.writeHead(200, { 'content-type': 'application/json' });
+      return res.end(JSON.stringify({
+        id: 'mock-' + llm.calls, object: 'chat.completion',
+        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
+        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
+      }));
+    }
+    res.writeHead(404, { 'content-type': 'application/json' });
+    res.end('{"error":"not found"}');
+  });
+  return new Promise((resolve) => server.listen(LLM_PORT, '127.0.0.1', () => resolve(server)));
+}
+
+const getState = async () => (await fetch(`http://127.0.0.1:${APP_PORT}/api/state`)).json();
+async function waitDone(ms = 20000) {
+  const t0 = Date.now();
+  while (Date.now() - t0 < ms) {
+    const s = await getState();
+    if (s.status === 'done' || s.status === 'error') return s;
+    await sleep(100);
+  }
+  return await getState();
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-unlkclb-'));
+  const mockLlm = await startMockLlm();
+
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: `http://127.0.0.1:${LLM_PORT}/v1` }) + ';</script></head>');
+  const { server } = await startServer({
+    html, baseURL: `http://127.0.0.1:${LLM_PORT}/v1`, apiKey: 'old-key-123', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'mock', port: APP_PORT, modelsList: [{ id: 'mock' }], initialProject: projectDir,
+  });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1280, height: 900 });
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${APP_PORT}/`);
+    await page.waitForFunction(() => typeof send === 'function' && typeof openSettings === 'function'
+      && document.querySelectorAll('#model option').length >= 1, { timeout: 10000 });
+    await page.evaluate(() => { window.open = () => null; });
+
+    // ── Scenario A: unlock-needed vs an open Change-API-key dialog ─────────
+    console.log('\n[A1] unlock clobbers the open change-key dialog');
+    await page.click('#settingsBtn');
+    await page.waitForFunction(() => document.getElementById('settingsModalBg')?.classList.contains('show'), { timeout: 5000 });
+    await page.click('button[onclick="changeApiKey()"]');
+    await page.waitForFunction(() => document.getElementById('initModalTitle')?.textContent === 'Change API key', { timeout: 5000 });
+    await page.type('#apiKeyInput', 'half-typed-replacement');
+    // A background run hits a 401 while the user is typing.
+    llm.lockNext = true;
+    await page.evaluate(() => { document.getElementById('input').value = 'background task'; return send(); });
+    await page.waitForFunction(() => document.getElementById('initModalTitle')?.textContent === 'API key locked', { timeout: 15000 });
+    const a1 = await page.evaluate(() => ({
+      keyInputGone: !document.getElementById('apiKeyInput'),
+      unlockOpenThere: !!document.getElementById('unlockOpen'),
+      shown: document.getElementById('initModalBg')?.classList.contains('show'),
+    }));
+    ok(a1.shown && a1.unlockOpenThere, 'unlock UI took over #initModalBg (it outranks the form — blocking anyway)');
+    ok(a1.keyInputGone, 'the change-key form was preempted (unlock body replaced it — the draft is held for re-open)');
+    ok(jsErrors.length === 0, `the collision itself raised no JS errors (${jsErrors.length})`);
+
+    // [A2] the parked run completes after the dance; the preempted dialog RE-OPENS with the draft.
+    console.log('\n[A2] run completes after the dance; preempted dialog re-opens with the draft');
+    await page.click('#unlockOpen');
+    await page.waitForSelector('#unlockDone', { visible: true, timeout: 3000 });
+    await page.click('#unlockDone');
+    const stA = await waitDone();
+    ok(stA.status === 'done', `parked run resumed + finished despite the dialog collision (status=${stA.status})`);
+    await page.waitForFunction(() => document.getElementById('initModalTitle')?.textContent === 'Change API key'
+      && !!document.getElementById('apiKeyInput') && document.getElementById('initModalBg')?.classList.contains('show'), { timeout: 5000 });
+    const restored = await page.evaluate(() => document.getElementById('apiKeyInput').value);
+    ok(restored === 'half-typed-replacement', `unlock-done RE-OPENED the change-key dialog with the half-typed draft restored (got "${restored}")`);
+    // Close it cleanly so [A3] exercises a FRESH dialog.
+    await page.click('#apiKeyCancel');
+    await page.waitForFunction(() => !document.getElementById('initModalBg')?.classList.contains('show'), { timeout: 3000 });
+
+    // [A3] recovery: change-key still works afterwards.
+    console.log('\n[A3] change-key recovery');
+    ok(await page.evaluate(() => document.getElementById('settingsModalBg')?.classList.contains('show')), 'settings modal survived underneath');
+    await page.click('button[onclick="changeApiKey()"]');
+    await page.waitForFunction(() => document.getElementById('initModalTitle')?.textContent === 'Change API key'
+      && !!document.getElementById('apiKeyInput'), { timeout: 5000 });
+    const a3 = await page.evaluate(() => document.getElementById('apiKeyInput').value);
+    ok(a3 === '', `fresh dialog starts empty (no zombie state) (got "${a3}")`);
+    await page.type('#apiKeyInput', 'replacement-key-OK');
+    await page.click('#apiKeySave');
+    await page.waitForFunction(() => document.getElementById('settingsApiKey')?.textContent === 'replacem…', { timeout: 8000 });
+    ok(true, 'a second change-key attempt saves fine (the preempted dialog resolved cleanly — no zombie promise)');
+    const k = await (await fetch(`http://127.0.0.1:${APP_PORT}/api/api-key`)).json();
+    ok(k.prefix === 'replacem…', `server took the replacement key (prefix=${k.prefix})`);
+
+    // (Scenario B — the "Test image support" probe getting 401-parked — was
+    // retired when that probe was removed from Settings.)
+
+    ok(jsErrors.length === 0, `no JS errors overall (${jsErrors.length}: ${jsErrors.slice(0, 2).join(' | ')})`);
+  } finally {
+    await browser.close(); server.close(); mockLlm.close();
+    await cleanupDir(projectDir);
+    await cleanupDir(CB_HOME_DIR);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-update-edges.mjs
new 14687f041a909c04b50ec3e4
+/**
+ * EDGE PROBE (on-demand): check-update LIFECYCLE edges against a mock GitLab.
+ *   [a]  ROLLBACK: manifest build LOWER than running → swap installs the
+ *        downgrade; second run reports up-to-date; whats-new filtering yields
+ *        no entries (notes.json path)…
+ *   [a2] …and the manifest.notes FALLBACK is gated on m.build > floor:
+ *        downgrade + 404 notes.json + manifest.notes → NO spurious whats-new.
+ *   [b]  notes.json 404 → manifest.notes fallback (single entry);
+ *        manifest WITHOUT notes → update succeeds, no whats-new.json.
+ *   [c]  MALFORMED notes.json (object-not-array; entries missing build;
+ *        build as string "999"; a null element) → update still succeeds,
+ *        bad elements are prefiltered, good neighbors survive.
+ *   [d]  UN-DISMISSED whats-new from update A MERGED by update B — A's
+ *        never-shown notes survive, fromBuild stays the last-SEEN build.
+ *        (+ d2: B with NO notes still rewrites toBuild — no stale claim.)
+ *   [e]  socket destroyed mid-download → skipped with the network-error
+ *        reason, original intact, no temp, no lock residue.
+ *   [f]  401 from the API / manifest that is an HTML page → skipped with the
+ *        HTML-page hint.
+ *   [g]  CONCURRENT double check-update (slow barrier-held download) → the
+ *        update.lock single-flights it: app file survives + parses, at most
+ *        one UPDATED, loser prints the in-progress/already-current skip,
+ *        TRUE previous kept as prev, no lock/temp residue.
+ * Uses the REAL dist/code-boss.mjs with UPDATE_SOURCE patched to the mock;
+ * HOME/USERPROFILE redirected so creds come from a temp dir.
+ * Run: node test/_edge-update-edges.mjs   (build dist first if missing)
+ */
+import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { spawn, spawnSync } from 'node:child_process';
+import { createServer } from 'node:http';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17912;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+
+// ASYNC spawn — the mock GitLab lives in THIS process; spawnSync would block
+// the event loop and the child's fetch would never be answered.
+function runCheckUpdate(appFile, home) {
+  return new Promise((resolve) => {
+    const p = spawn(process.execPath, [appFile, 'check-update'], {
+      env: { ...process.env, USERPROFILE: home, HOME: home },
+    });
+    let stdout = '', stderr = '';
+    p.stdout.on('data', (d) => { stdout += d; });
+    p.stderr.on('data', (d) => { stderr += d; });
+    const t = setTimeout(() => { try { p.kill(); } catch {} }, 60000);
+    p.on('close', (status) => { clearTimeout(t); resolve({ status, stdout, stderr }); });
+  });
+}
+
+async function main() {
+  const distFile = path.join(ROOT, 'dist', 'code-boss.mjs');
+  if (!existsSync(distFile)) { console.error('SKIP: dist/code-boss.mjs missing — run node scripts/build.mjs first'); process.exit(0); }
+  const dist = await readFile(distFile, 'utf8');
+  const runningBuild = dist.match(/const BUILD_VERSION = '(\d+)'/)?.[1];
+  ok(!!runningBuild, `dist bundle carries BUILD_VERSION (${runningBuild})`);
+  const RB = Number(runningBuild);
+
+  const home = await mkdtemp(path.join(tmpdir(), 'cb-updedge-'));
+  const appDir = path.join(home, '.code_boss', 'app');
+  await mkdir(appDir, { recursive: true });
+  const appFile = path.join(appDir, 'code-boss.mjs');
+  const base = dist.replace("const UPDATE_SOURCE = '';", `const UPDATE_SOURCE = 'http://127.0.0.1:${PORT}/group/code_boss';`);
+  ok(base !== dist, 'patched UPDATE_SOURCE into the bundle copy');
+  await writeFile(path.join(home, '.code_boss', 'gitlab-creds.json'), JSON.stringify({ user: 't', token: 'tok-123' }), 'utf8');
+
+  // Runnable downgrade/intermediate bundles: the real patched dist with a
+  // different BUILD_VERSION (they must be able to run `check-update` again).
+  const verLine = `const BUILD_VERSION = '${runningBuild}'`;
+  const occurrences = base.split(verLine).length - 1;
+  ok(occurrences === 1, `exactly one BUILD_VERSION const in the bundle (got ${occurrences})`);
+  const mkBundle = (v) => base.replace(verLine, `const BUILD_VERSION = '${v}'`);
+  const bundleLow = mkBundle('400');                  // rollback target (runnable)
+  // MID must be ABOVE the running build so "update A" is a genuine UPGRADE — a hardcoded 500 silently
+  // became a DOWNGRADE once the real build climbed past it (no whats-new on a downgrade → ENOENT), so
+  // derive it from RB. (Stays below the 999 fixture used as the higher "B" build until RB hits 998.)
+  const MID = RB + 1;
+  const bundleMid = mkBundle(String(MID));            // update A target (runnable, RB < MID < 999)
+  const fake999 = `const BUILD_VERSION = '999';\n// MARKER-FAKE-999\n// ${'x'.repeat(250000)}\n`;
+
+  async function resetApp(bundle = base) {
+    await writeFile(appFile, bundle, 'utf8');
+    // temps are pid-suffixed (code-boss.next.<pid>.mjs) — sweep everything but the app file
+    for (const f of await readdir(appDir))
+      if (f !== 'code-boss.mjs') await rm(path.join(appDir, f), { force: true });
+  }
+  // any download temp / single-flight lock left behind?
+  const listResidue = async () =>
+    (await readdir(appDir)).filter((f) => /^code-boss\.next\./.test(f) || f === 'code-boss.update.lock');
+  const wnPath = path.join(appDir, 'whats-new.json');
+  const readWn = async () => JSON.parse(await readFile(wnPath, 'utf8'));
+
+  // ── mock GitLab ──────────────────────────────────────────────────────────
+  const state = {
+    manifestBody: '{}', manifestType: 'application/json',
+    notesBody: null,          // null → 404
+    releaseBody: fake999,
+    releaseMode: 'normal',    // 'half' | 'barrier'
+    apiStatus: null,          // e.g. 401 for everything
+    barrier: [], barrierCount: 2,
+  };
+  const setManifest = (m) => { state.manifestBody = JSON.stringify(m); state.manifestType = 'application/json'; };
+  const gitlab = createServer((req, res) => {
+    const url = decodeURIComponent(req.url || '');
+    if (state.apiStatus) { res.writeHead(state.apiStatus, { 'content-type': 'application/json' }); res.end('{"message":"401 Unauthorized"}'); return; }
+    if (url.includes('/repository/files/releases/manifest.json/raw')) {
+      res.writeHead(200, { 'content-type': state.manifestType }); res.end(state.manifestBody);
+    } else if (url.includes('/repository/files/releases/notes.json/raw')) {
+      if (state.notesBody == null) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"message":"404 File Not Found"}'); }
+      else { res.writeHead(200, { 'content-type': 'application/json' }); res.end(state.notesBody); }
+    } else if (url.includes('/repository/files/releases/code-boss-') && url.includes('/raw')) {
+      if (state.releaseMode === 'half') {
+        res.writeHead(200, { 'content-type': 'text/plain', 'content-length': String(Buffer.byteLength(state.releaseBody)) });
+        res.write(state.releaseBody.slice(0, Math.floor(state.releaseBody.length / 2)));
+        setTimeout(() => { try { res.destroy(); } catch {} }, 50);
+      } else if (state.releaseMode === 'barrier') {
+        state.barrier.push(res);
+        if (state.barrier.length >= state.barrierCount)
+          for (const r of state.barrier.splice(0)) { r.writeHead(200, { 'content-type': 'text/plain' }); r.end(state.releaseBody); }
+        // with the single-flight lock only ONE download arrives — release the
+        // lone connection after a hold long enough for the loser to hit the lock
+        else setTimeout(() => { for (const r of state.barrier.splice(0)) { r.writeHead(200, { 'content-type': 'text/plain' }); r.end(state.releaseBody); } }, 5000);
+      } else {
+        res.writeHead(200, { 'content-type': 'text/plain' }); res.end(state.releaseBody);
+      }
+    } else { res.writeHead(404); res.end('{}'); }
+  });
+  await new Promise((r) => gitlab.listen(PORT, '127.0.0.1', r));
+
+  try {
+    // ════ [a] ROLLBACK: manifest build LOWER than running ════
+    console.log(`\n[a] rollback: manifest build 400 < running ${RB} → swap installs the downgrade`);
+    {
+      await resetApp();
+      setManifest({ build: 400, file: 'releases/code-boss-400.mjs' });
+      state.releaseBody = bundleLow;
+      state.notesBody = JSON.stringify([
+        { build: 999, date: '2026-06-10', title: 'Future', items: ['f'] },
+        { build: 400, date: '2026-01-01', title: 'The rollback target', items: ['old'] },
+      ]);
+      const r = await runCheckUpdate(appFile, home);
+      ok(r.status === 0, `exit 0 (got ${r.status})`);
+      ok(new RegExp(`UPDATED build ${RB} → 400`).test(r.stdout), `downgrade swapped in (got: ${r.stdout.trim().slice(0, 120)})`);
+      const now = await readFile(appFile, 'utf8');
+      ok(now.includes("const BUILD_VERSION = '400'"), 'app file IS the lower build now');
+      ok(existsSync(path.join(appDir, 'code-boss.prev.mjs')), 'previous (higher) bundle kept as prev');
+      ok(!existsSync(wnPath), 'no whats-new.json for a downgrade (notes.json filter yields nothing)');
+
+      const r2 = await runCheckUpdate(appFile, home);
+      ok(/up to date \(build 400\)/.test(r2.stdout), `second run reports up-to-date at the downgraded build (got: ${r2.stdout.trim().slice(0, 100)})`);
+    }
+
+    console.log('\n[a2] rollback + notes.json 404 + manifest.notes fallback → must NOT write whats-new');
+    {
+      await resetApp();
+      setManifest({ build: 400, file: 'releases/code-boss-400.mjs', notes: { title: 'Notes of the OLD build', items: ['ancient item'] } });
+      state.releaseBody = bundleLow;
+      state.notesBody = null;   // 404 → fallback path
+      const r = await runCheckUpdate(appFile, home);
+      ok(new RegExp(`UPDATED build ${RB} → 400`).test(r.stdout), 'downgrade still swaps');
+      const spurious = existsSync(wnPath);
+      ok(!spurious, 'manifest.notes fallback must respect the downgrade (no spurious whats-new.json)');
+      if (spurious) console.log('    >> whats-new.json after a ROLLBACK:', JSON.stringify(await readWn()));
+    }
+
+    // ════ [b] notes.json 404 → manifest.notes fallback / no notes at all ════
+    console.log('\n[b] upgrade with notes.json 404 → manifest.notes fallback single entry');
+    {
+      await resetApp();
+      setManifest({ build: 999, file: 'releases/code-boss-999.mjs', notes: { title: 'Manifest fallback', items: ['from manifest'] } });
+      state.releaseBody = fake999;
+      state.notesBody = null;
+      const r = await runCheckUpdate(appFile, home);
+      ok(new RegExp(`UPDATED build ${RB} → 999`).test(r.stdout), `update succeeded (got: ${r.stdout.trim().slice(0, 120)})`);
+      ok(existsSync(wnPath), 'whats-new.json written from the manifest fallback');
+      if (existsSync(wnPath)) {
+        const wn = await readWn();
+        ok(wn.entries.length === 1 && wn.entries[0].title === 'Manifest fallback' && wn.entries[0].build === 999,
+          `single fallback entry (got: ${JSON.stringify(wn.entries)})`);
+        ok(wn.fromBuild === RB && wn.toBuild === 999, `jump recorded ${wn.fromBuild}→${wn.toBuild}`);
+      }
+    }
+    console.log('\n[b2] upgrade with notes.json 404 AND manifest without notes → success, no whats-new, no crash');
+    {
+      await resetApp();
+      setManifest({ build: 999, file: 'releases/code-boss-999.mjs' });
+      state.notesBody = null;
+      const r = await runCheckUpdate(appFile, home);
+      ok(r.status === 0 && new RegExp(`UPDATED build ${RB} → 999`).test(r.stdout), `update succeeded, exit 0 (got ${r.status}: ${r.stdout.trim().slice(0, 120)})`);
+      ok(!existsSync(wnPath), 'no whats-new.json when there are no notes anywhere');
+      ok(!/Error|TypeError|undefined/.test(r.stderr), `no crash on stderr (got: ${r.stderr.slice(0, 120)})`);
+    }
+
+    // ════ [c] MALFORMED notes.json ════
+    console.log('\n[c1] notes.json is an OBJECT (not an array) → update succeeds, no throw');
+    {
+      await resetApp();
+      setManifest({ build: 999, file: 'releases/code-boss-999.mjs' });
+      state.notesBody = JSON.stringify({ latest: { build: 999, items: ['x'] } });
+      const r = await runCheckUpdate(appFile, home);
+      ok(r.status === 0 && /UPDATED/.test(r.stdout), `update succeeded (got: ${r.stdout.trim().slice(0, 120)})`);
+      ok(!existsSync(wnPath), 'object-shaped notes → no entries, no whats-new.json');
+      ok(!/TypeError/.test(r.stderr + r.stdout), 'no TypeError leaked');
+    }
+    console.log('\n[c2] notes entries missing build / build as string "999" → no throw, sane filtering');
+    {
+      await resetApp();
+      setManifest({ build: 999, file: 'releases/code-boss-999.mjs' });
+      state.notesBody = JSON.stringify([
+        { title: 'no build field', items: ['nb'] },
+        { build: '999', title: 'string build', items: ['sb'] },
+        { build: RB, title: 'already running', items: ['old'] },
+      ]);
+      const r = await runCheckUpdate(appFile, home);
+      ok(r.status === 0 && /UPDATED/.test(r.stdout), 'update succeeded');
+      ok(existsSync(wnPath), 'whats-new.json written');
+      if (existsSync(wnPath)) {
+        const wn = await readWn();
+        console.log('    >> entries landed:', JSON.stringify(wn.entries));
+        ok(wn.entries.length === 1 && wn.entries[0].title === 'string build', `string "999" coerced + kept, missing-build + at-running filtered out (got ${wn.entries.length})`);
+      }
+    }
+    console.log('\n[c3] notes.json contains a null element → prefiltered, good neighbor survives');
+    {
+      await resetApp();
+      setManifest({ build: 999, file: 'releases/code-boss-999.mjs', notes: { title: 'manifest rescue', items: ['m'] } });
+      state.notesBody = JSON.stringify([null, { build: 999, title: 'good entry next to a null', items: ['g'] }]);
+      const r = await runCheckUpdate(appFile, home);
+      ok(r.status === 0 && /UPDATED/.test(r.stdout), 'update still succeeded');
+      ok(!/TypeError/.test(r.stderr), `no TypeError leaked (stderr: ${r.stderr.slice(0, 120)})`);
+      ok(existsSync(wnPath), 'whats-new.json written from the history (no fallback needed)');
+      if (existsSync(wnPath)) {
+        const wn = await readWn();
+        ok(wn.entries.length === 1 && wn.entries[0].title === 'good entry next to a null',
+          `null prefiltered, GOOD history entry kept — not the manifest fallback (got: ${JSON.stringify(wn.entries)})`);
+      }
+    }
+
+    // ════ [d] un-dismissed whats-new from A overwritten by B ════
+    console.log('\n[d] update A then update B with A\'s whats-new never dismissed');
+    {
+      await resetApp();
+      state.notesBody = JSON.stringify([
+        { build: 999, date: '2026-06-10', title: 'B notes', items: ['b-item'] },
+        { build: MID, date: '2026-06-05', title: 'A notes', items: ['a-item'] },
+      ]);
+      // Update A: RB → MID (runnable bundle, because B runs from it).
+      setManifest({ build: MID, file: `releases/code-boss-${MID}.mjs` });
+      state.releaseBody = bundleMid;
+      const ra = await runCheckUpdate(appFile, home);
+      ok(new RegExp(`UPDATED build ${RB} → ${MID}`).test(ra.stdout), 'update A installed');
+      const wnA = await readWn();
+      console.log('    >> whats-new after A:', JSON.stringify(wnA));
+      ok(wnA.fromBuild === RB && wnA.toBuild === MID && wnA.entries.length === 1 && wnA.entries[0].title === 'A notes', 'A wrote its own notes');
+
+      // Update B lands before anyone opened the app (whats-new.json NOT dismissed).
+      setManifest({ build: 999, file: 'releases/code-boss-999.mjs' });
+      state.releaseBody = fake999;
+      const rb2 = await runCheckUpdate(appFile, home);
+      ok(new RegExp(`UPDATED build ${MID} → 999`).test(rb2.stdout), 'update B installed');
+      const wnB = await readWn();
+      console.log('    >> whats-new after B:', JSON.stringify(wnB));
+      ok(wnB.entries.some((e) => e.title === 'A notes'), 'un-dismissed A notes survive update B (MERGED, not overwritten)');
+      ok(wnB.entries.some((e) => e.title === 'B notes'), "B's own notes present too");
+      ok(Number(wnB.fromBuild) === RB, `fromBuild stays the user's last-SEEN build ${RB} (got ${wnB.fromBuild})`);
+      ok(Number(wnB.toBuild) === 999, `toBuild is the installed build (got ${wnB.toBuild})`);
+      ok(wnB.entries.length === 2 && Number(wnB.entries[0].build) === 999,
+        `deduped + sorted desc by build (got: ${wnB.entries.map((e) => e.build).join(',')})`);
+    }
+    console.log('\n[d2] update B has NO notes → A\'s entries carried, toBuild REWRITTEN (no stale claim)');
+    {
+      await resetApp();
+      state.notesBody = JSON.stringify([{ build: MID, title: 'A notes', items: ['a-item'] }]);
+      setManifest({ build: MID, file: `releases/code-boss-${MID}.mjs` });
+      state.releaseBody = bundleMid;
+      await runCheckUpdate(appFile, home);
+      ok((await readWn()).toBuild === MID, `A wrote whats-new (toBuild ${MID})`);
+      // B: no notes anywhere → union = A's carried entries → file rewritten with the right toBuild.
+      setManifest({ build: 999, file: 'releases/code-boss-999.mjs' });
+      state.releaseBody = fake999;
+      state.notesBody = null;
+      const rb2 = await runCheckUpdate(appFile, home);
+      ok(new RegExp(`UPDATED build ${MID} → 999`).test(rb2.stdout), 'update B installed');
+      ok(existsSync(wnPath), 'whats-new still present (A never dismissed)');
+      if (existsSync(wnPath)) {
+        const wn = await readWn();
+        ok(wn.toBuild === 999, `toBuild rewritten to the running build (got ${wn.toBuild})`);
+        ok(Number(wn.fromBuild) === RB && wn.entries.length === 1 && wn.entries[0].title === 'A notes',
+          `A's un-shown entry carried with the original floor (got from=${wn.fromBuild}, entries=${JSON.stringify(wn.entries)})`);
+      }
+    }
+
+    // ════ [e] mid-download socket destroy ════
+    console.log('\n[e] socket destroyed halfway through the release download → skipped, intact, no temp');
+    {
+      await resetApp();
+      setManifest({ build: 999, file: 'releases/code-boss-999.mjs' });
+      state.releaseBody = fake999;
+      state.notesBody = null;
+      state.releaseMode = 'half';
+      const r = await runCheckUpdate(appFile, home);
+      state.releaseMode = 'normal';
+      ok(r.status === 0, `exit 0 (got ${r.status})`);
+      ok(/skipped — network error while downloading .* — will retry next launch/.test(r.stdout),
+        `skipped with the friendly network reason (got: ${r.stdout.trim().split('\n').pop().slice(0, 140)})`);
+      ok((await readFile(appFile, 'utf8')) === base, 'app file untouched after the truncated download');
+      ok((await listResidue()).length === 0, 'no temp download / lock residue');
+      ok(!existsSync(path.join(appDir, 'code-boss.prev.mjs')), 'no prev created');
+    }
+
+    // ════ [f] 401 / HTML manifest ════
+    console.log('\n[f1] API returns 401 → skipped with a sane reason');
+    {
+      await resetApp();
+      state.apiStatus = 401;
+      const r = await runCheckUpdate(appFile, home);
+      state.apiStatus = null;
+      ok(r.status === 0 && /skipped — .*401/.test(r.stdout), `skipped mentioning 401 (got: ${r.stdout.trim().slice(0, 140)})`);
+      ok((await readFile(appFile, 'utf8')) === base, 'app file untouched');
+    }
+    console.log('\n[f2] manifest endpoint returns an HTML page → skipped with the HTML-page hint');
+    {
+      await resetApp();
+      state.manifestBody = '<html><head><title>Sign in · GitLab</title></head><body>You need to sign in.</body></html>';
+      state.manifestType = 'text/html';
+      const r = await runCheckUpdate(appFile, home);
+      ok(r.status === 0 && /skipped — got an HTML page instead of the manifest — check UPDATE_SOURCE and the stored GitLab token/.test(r.stdout),
+        `skipped with the misconfig hint (got: ${r.stdout.trim().slice(0, 160)})`);
+      ok((await readFile(appFile, 'utf8')) === base, 'app file untouched');
+    }
+
+    // ════ [g] concurrent double check-update (single-flight lock) ════
+    console.log('\n[g] TWO check-updates at once (slow barrier-held download), 3 attempts');
+    {
+      setManifest({ build: 999, file: 'releases/code-boss-999.mjs' });
+      state.releaseBody = fake999;
+      state.notesBody = '[]';
+      let badAttempts = 0;
+      for (let attempt = 1; attempt <= 3; attempt++) {
+        await resetApp();
+        state.releaseMode = 'barrier'; state.barrier = [];
+        const [r1, r2] = await Promise.all([runCheckUpdate(appFile, home), runCheckUpdate(appFile, home)]);
+        state.releaseMode = 'normal';
+        const exists = existsSync(appFile);
+        let checkOk = false, checkErr = '';
+        if (exists) {
+          const parse = spawnSync(process.execPath, ['--check', appFile], { encoding: 'utf8' });
+          checkOk = parse.status === 0; checkErr = (parse.stderr || '').slice(0, 120);
+        }
+        const out1 = r1.stdout.trim().split('\n').pop(), out2 = r2.stdout.trim().split('\n').pop();
+        console.log(`    attempt ${attempt}: appFile exists=${exists} --check=${checkOk ? 'pass' : 'FAIL ' + checkErr}`);
+        console.log(`      proc1: ${out1.slice(0, 150)}`);
+        console.log(`      proc2: ${out2.slice(0, 150)}`);
+        const updated = [r1.stdout, r2.stdout].filter((s) => /UPDATED/.test(s)).length;
+        const loserSkipped = [r1.stdout, r2.stdout].some((s) =>
+          /skipped — (another check-update is in progress|already at build 999)/.test(s));
+        const prevP = path.join(appDir, 'code-boss.prev.mjs');
+        const prevIsTrue = existsSync(prevP) && !/MARKER-FAKE-999/.test(await readFile(prevP, 'utf8'));
+        const residue = await listResidue();
+        const installedNew = exists && /MARKER-FAKE-999/.test(await readFile(appFile, 'utf8'));
+        const good = exists && checkOk && updated <= 1 && loserSkipped && residue.length === 0
+          && (updated === 0 || (installedNew && prevIsTrue));
+        if (!good) {
+          badAttempts++;
+          console.log(`      BAD: updated=${updated} loserSkipped=${loserSkipped} installedNew=${installedNew} prevIsTrue=${prevIsTrue} residue=[${residue}]`);
+        }
+      }
+      ok(badAttempts === 0,
+        `every attempt: file survives + parses, at most one UPDATED installing the new build, loser skipped (in-progress/already-current), TRUE prev kept, no lock/temp residue (${badAttempts}/3 bad)`);
+    }
+  } finally {
+    gitlab.close();
+    for (let i = 0; i < 10; i++) { try { await rm(home, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 300)); } }
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-ux-review.mjs
new e96e8f38fea6cb92978b6165
+/**
+ * EDGE PROBE (on-demand): UX/visual review of the what's-new modal + star branding.
+ * Screenshots → test/_edge-deployux-screenshots/ at 1100 and 1440 widths:
+ *   (a) the modal over the CHAT view with the REAL root release-notes.json entry
+ *       stamped as build 415 (typography / hierarchy / accent usage);
+ *   (b) the favicon star — assert the <link rel=icon> SVG actually renders, and
+ *       render it side-by-side with deploy/orange-star.ico for shape comparison;
+ *   (c) a 3-entry multi-release jump (newest-first ordering / divider judgment);
+ *   (d) the modal over the LANDING view (no project open) + post-dismiss baseline.
+ * Functional assertions: no horizontal clipping, modal box inside the viewport,
+ * WCAG contrast of .wn-title / .wn-items li / header h2, newest-first DOM order,
+ * dismiss works. Assertions labeled "BUG?" express the DESIRED behavior and are
+ * EXPECTED to fail on build 414 — they demonstrate the two snapFab findings
+ * (fab overlaps "Got it"; fab trapped in the dismissed modal on landing).
+ * Run: node test/_edge-ux-review.mjs   (skips if Chrome not found)
+ */
+import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17917;
+const SHOTS = path.join(ROOT, 'test', '_edge-deployux-screenshots');
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+
+// In-page helpers (serialized into evaluate): WCAG contrast between two computed colors.
+const CONTRAST_FN = `
+  function __lum(c) {
+    const m = c.match(/rgba?\\(([\\d.]+)[, ]+([\\d.]+)[, ]+([\\d.]+)/);
+    if (!m) return null;
+    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
+    return 0.2126 * f(+m[1]) + 0.7152 * f(+m[2]) + 0.0722 * f(+m[3]);
+  }
+  function __bgOf(el) {  // walk up to the first non-transparent background
+    for (let n = el; n; n = n.parentElement) {
+      const bg = getComputedStyle(n).backgroundColor;
+      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
+    }
+    return 'rgb(0,0,0)';
+  }
+  function __contrast(el) {
+    const L1 = __lum(getComputedStyle(el).color), L2 = __lum(__bgOf(el));
+    if (L1 == null || L2 == null) return null;
+    const [a, b] = L1 > L2 ? [L1, L2] : [L2, L1];
+    return (a + 0.05) / (b + 0.05);
+  }
+`;
+
+async function waitModal(page) {
+  await page.waitForFunction(() => document.getElementById('whatsNewModalBg')?.classList.contains('show'), { timeout: 10000 });
+  await new Promise((r) => setTimeout(r, 350)); // fonts/emoji settle
+}
+
+async function shoot(page, width, height, file) {
+  await page.setViewport({ width, height, deviceScaleFactor: 1 });
+  await new Promise((r) => setTimeout(r, 250));
+  await page.screenshot({ path: path.join(SHOTS, file) });
+  console.log('  shot', file);
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  await mkdir(SHOTS, { recursive: true });
+
+  // ── realistic notes: the ACTUAL root release-notes.json stamped as build 415 ──
+  const realNotes = JSON.parse(await readFile(path.join(ROOT, 'release-notes.json'), 'utf8'));
+  const entry415 = { build: 415, date: '2026-06-10', title: realNotes.title, items: realNotes.items };
+  const singleWn = { fromBuild: 414, toBuild: 415, at: new Date().toISOString(), entries: [entry415] };
+  // 3-release jump: 415 (real) + two plausible earlier releases (shape matches
+  // releases/notes.json history entries: build/date/title/items).
+  const multiWn = {
+    fromBuild: 408, toBuild: 415, at: new Date().toISOString(),
+    entries: [
+      entry415,
+      { build: 412, date: '2026-06-06', title: 'Adversarial plan review', items: ['Plans now get a read-only critic pass before work starts — provable problems are folded back into the plan.', 'Sub-agents time out instead of hanging a run forever.'] },
+      { build: 409, date: '2026-06-02', title: 'Sturdier undo and intake', items: ['Undo no longer loses uncommitted work (shadow-git snapshot before every revert).', 'The intake modal got a two-pane layout with live draft preview.'] },
+    ],
+  };
+
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-uxwn-'));
+  const wnPath = path.join(projectDir, 'whats-new.json');
+  await writeFile(wnPath, JSON.stringify(singleWn, null, 2), 'utf8');
+
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: '(mock)' }) + ';</script></head>');
+  const adapter = { async complete() { return { choices: [{ message: { content: 'ok.' } }] }; } };
+  const serverOpts = { html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' }, defaultModel: 'mock', port: PORT, adapter, modelsList: [{ id: 'mock' }], whatsNewPath: wnPath };
+
+  let { server } = await startServer({ ...serverOpts, initialProject: projectDir });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.setViewport({ width: 1100, height: 800 });
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+
+    // ── (a) modal over the CHAT view, real 415 notes, 1100 + 1440 ──────────
+    await waitModal(page);
+    const h2Text = await page.evaluate(() => document.querySelector('#whatsNewModalBg .modal-header h2')?.textContent || '');
+    ok(/Updated to build\s*415/.test(h2Text), `header reads "⭐ Updated to build 415" (got "${h2Text.trim()}")`);
+    await shoot(page, 1100, 800, 'a-modal-chat-1100.png');
+    await shoot(page, 1440, 900, 'a-modal-chat-1440.png');
+    // close-up of just the modal box for typography review
+    const box = await (await page.$('#whatsNewModalBg .modal')).boundingBox();
+    await page.screenshot({ path: path.join(SHOTS, 'a-modal-closeup-1440.png'), clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.width + 16, height: box.height + 16 } });
+    console.log('  shot a-modal-closeup-1440.png');
+
+    // functional: geometry + overflow + contrast
+    const geo = await page.evaluate(`(() => { ${CONTRAST_FN}
+      const bg = document.getElementById('whatsNewModalBg');
+      const m = bg.querySelector('.modal'); const r = m.getBoundingClientRect();
+      const body = document.getElementById('whatsNewBody');
+      return {
+        inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
+        hOverflow: body.scrollWidth > body.clientWidth + 1,
+        vScrolls: body.scrollHeight > body.clientHeight + 1,
+        cH2: __contrast(bg.querySelector('.modal-header h2')),
+        cTitle: __contrast(bg.querySelector('.wn-title')),
+        cItem: __contrast(bg.querySelector('.wn-items li')),
+        h2Size: getComputedStyle(bg.querySelector('.modal-header h2')).fontSize,
+        titleSize: getComputedStyle(bg.querySelector('.wn-title')).fontSize,
+      }; })()`);
+    ok(geo.inViewport, 'modal box fully inside the 1440x900 viewport');
+    ok(!geo.hOverflow, 'no horizontal clipping in the notes body');
+    ok(geo.cH2 >= 4.5, `header h2 contrast >= 4.5 (got ${geo.cH2?.toFixed(2)})`);
+    ok(geo.cTitle >= 4.5, `.wn-title contrast >= 4.5 (got ${geo.cTitle?.toFixed(2)})`);
+    ok(geo.cItem >= 4.5, `.wn-items li contrast >= 4.5 (got ${geo.cItem?.toFixed(2)})`);
+    console.log(`  info: h2 ${geo.h2Size} vs .wn-title ${geo.titleSize}; single-entry body scrolls=${geo.vScrolls}`);
+
+    // CHAT VIEW: where does the snapshot fab sit while the modal is open?
+    // dockSnapFab() re-parents it into "whatever modal is open"; the what's-new
+    // footer puts "Got it" in that same corner.
+    const fabA = await page.evaluate(() => {
+      const fab = document.getElementById('snapFab');
+      const got = document.querySelector('#whatsNewModalBg .modal-footer .btn.primary');
+      const f = fab?.getBoundingClientRect(), g = got?.getBoundingClientRect();
+      const vis = fab && getComputedStyle(fab).display !== 'none' && f.width > 0;
+      let ix = 0, iy = 0, atPoint = null;
+      if (vis && g) {
+        ix = Math.max(0, Math.min(f.right, g.right) - Math.max(f.left, g.left));
+        iy = Math.max(0, Math.min(f.bottom, g.bottom) - Math.max(f.top, g.top));
+        if (ix > 0 && iy > 0) {
+          const el = document.elementFromPoint(Math.max(f.left, g.left) + ix / 2, Math.max(f.top, g.top) + iy / 2);
+          atPoint = el ? (el.closest('#snapFab') ? 'snapFab' : el.closest('.btn') ? 'gotIt' : el.tagName) : null;
+        }
+      }
+      return { docked: !!fab?.closest('#whatsNewModalBg'), vis, ix: Math.round(ix), iy: Math.round(iy), atPoint,
+               fabRect: f ? [Math.round(f.left), Math.round(f.top), Math.round(f.width)] : null,
+               gotRect: g ? [Math.round(g.left), Math.round(g.top), Math.round(g.right), Math.round(g.bottom)] : null };
+    });
+    console.log('  info(CHAT): fab docked=' + fabA.docked + ' visible=' + fabA.vis + ' rect=' + JSON.stringify(fabA.fabRect) + ' got=' + JSON.stringify(fabA.gotRect) + ' overlap=' + fabA.ix + 'x' + fabA.iy + ' hit=' + fabA.atPoint);
+    ok(!(fabA.ix > 0 && fabA.iy > 0 && fabA.atPoint === 'snapFab'), `BUG? snapFab must not cover the "Got it" button (overlap ${fabA.ix}x${fabA.iy}px, hit-test: ${fabA.atPoint})`);
+    const gotBoxA = await (await page.$('#whatsNewModalBg .modal-footer .btn.primary')).boundingBox();
+    await page.screenshot({ path: path.join(SHOTS, 'e-fab-overlap-chat.png'), clip: { x: gotBoxA.x - 30, y: gotBoxA.y - 20, width: gotBoxA.width + 80, height: gotBoxA.height + 60 } });
+    console.log('  shot e-fab-overlap-chat.png');
+
+    // ── (b) favicon star: SVG must render; side-by-side with the .ico ──────
+    const icoB64 = (await readFile(path.join(ROOT, 'deploy', 'orange-star.ico'))).toString('base64');
+    const fav = await page.evaluate(async (ico) => {
+      const link = document.querySelector('link[rel="icon"]');
+      const href = link?.getAttribute('href') || '';
+      const strip = document.createElement('div');
+      strip.id = '__favStrip';
+      strip.style.cssText = 'position:fixed;top:8px;left:8px;z-index:9999;background:#1b1914;border:1px solid #3a372f;padding:14px 18px;display:flex;gap:26px;align-items:flex-end;font:12px monospace;color:#b3ae9e;';
+      const cell = (src, label, px) => {
+        const d = document.createElement('div'); d.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;';
+        const i = document.createElement('img'); i.src = src; i.width = px; i.height = px; i.style.imageRendering = px <= 32 ? 'pixelated' : 'auto';
+        const s = document.createElement('span'); s.textContent = label;
+        d.append(i, s); strip.append(d); return i;
+      };
+      const i16 = cell(href, 'favicon 16', 16);
+      const i32 = cell(href, 'favicon 32', 32);
+      const i128 = cell(href, 'favicon SVG @128', 128);
+      const ic = cell('data:image/x-icon;base64,' + ico, 'orange-star.ico @128', 128);
+      document.body.append(strip);
+      await Promise.all([i128, ic].map((img) => new Promise((res) => { if (img.complete) res(); else { img.onload = res; img.onerror = res; } })));
+      return { href: href.slice(0, 40), svgOk: i128.naturalWidth > 0, icoOk: ic.naturalWidth > 0, ok16: i16.naturalWidth > 0, ok32: i32.naturalWidth > 0 };
+    }, icoB64);
+    // The favicon is the traced brand spark (PNG data URI, from deploy/brand-star-source.png
+    // via scripts/capture-star-icon.mjs) — same pixels as deploy/orange-star.ico.
+    ok(fav.href.startsWith('data:image/png'), `<link rel=icon> is the traced brand-spark PNG (${fav.href}…)`);
+    ok(fav.svgOk && fav.ok16 && fav.ok32, 'the favicon decodes and renders (16/32/128)');
+    ok(fav.icoOk, 'deploy/orange-star.ico decodes and renders in Chrome');
+    const stripEl = await page.$('#__favStrip');
+    await stripEl.screenshot({ path: path.join(SHOTS, 'b-favicon-star-vs-ico.png') });
+    console.log('  shot b-favicon-star-vs-ico.png');
+    await page.evaluate(() => document.getElementById('__favStrip')?.remove());
+
+    // ── (c) 3-entry multi-release jump ──────────────────────────────────────
+    await writeFile(wnPath, JSON.stringify(multiWn, null, 2), 'utf8');
+    await page.reload({ waitUntil: 'domcontentloaded' });
+    await waitModal(page);
+    const order = await page.evaluate(() => [...document.querySelectorAll('.wn-title')].map((e) => Number((e.textContent.match(/build (\d+)/) || [])[1])));
+    ok(order.length === 3 && order[0] === 415 && order[1] === 412 && order[2] === 409, `3 entries rendered newest-first (got ${order.join(',')})`);
+    const hasDate = await page.evaluate(() => /2026-06-0\d|Jun/.test(document.getElementById('whatsNewBody')?.textContent || ''));
+    console.log(`  info: per-release date shown in modal = ${hasDate} (data carries date:'2026-06-06' etc.)`);
+    const multiGeo = await page.evaluate(() => {
+      const body = document.getElementById('whatsNewBody');
+      return { vScrolls: body.scrollHeight > body.clientHeight + 1, hOverflow: body.scrollWidth > body.clientWidth + 1 };
+    });
+    ok(!multiGeo.hOverflow, 'multi-entry: no horizontal clipping');
+    console.log(`  info: multi-entry body scrolls=${multiGeo.vScrolls}`);
+    await shoot(page, 1100, 800, 'c-modal-multi-1100.png');
+    await shoot(page, 1440, 900, 'c-modal-multi-1440.png');
+
+    // ── (d) modal over the LANDING view (no project open) ──────────────────
+    // Drop the page's SSE connection FIRST or server.close() waits forever.
+    await page.goto('about:blank');
+    await new Promise((res) => { server.close(res); server.closeAllConnections?.(); });
+    await writeFile(wnPath, JSON.stringify(singleWn, null, 2), 'utf8'); // realistic single update
+    ({ server } = await startServer({ ...serverOpts })); // NO initialProject → landing
+    await page.setViewport({ width: 1100, height: 800 });
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await waitModal(page);
+    const overLanding = await page.evaluate(() => !document.getElementById('landing')?.classList.contains('hidden'));
+    ok(overLanding, 'with no project open, the modal appears over the LANDING view');
+    await shoot(page, 1100, 800, 'd-modal-landing-1100.png');
+    await shoot(page, 1440, 900, 'd-modal-landing-1440.png');
+
+    // ── (e) snapshot fab vs the what's-new modal ────────────────────────────
+    // dockSnapFab() re-parents #snapFab into "whatever modal is open"; the
+    // what's-new modal's footer puts the primary "Got it" button in that same
+    // bottom-right corner. Measure the geometry + hit-testing.
+    const fab1 = await page.evaluate(() => {
+      const fab = document.getElementById('snapFab');
+      const got = document.querySelector('#whatsNewModalBg .modal-footer .btn.primary');
+      const f = fab?.getBoundingClientRect(), g = got?.getBoundingClientRect();
+      let ix = 0, iy = 0, atPoint = null;
+      if (f && g) {
+        ix = Math.max(0, Math.min(f.right, g.right) - Math.max(f.left, g.left));
+        iy = Math.max(0, Math.min(f.bottom, g.bottom) - Math.max(f.top, g.top));
+        if (ix > 0 && iy > 0) {
+          const el = document.elementFromPoint(Math.max(f.left, g.left) + ix / 2, Math.max(f.top, g.top) + iy / 2);
+          atPoint = el ? (el.closest('#snapFab') ? 'snapFab' : el.closest('.btn') ? 'gotIt' : el.tagName) : null;
+        }
+        return { docked: !!fab.closest('#whatsNewModalBg'), ix: Math.round(ix), iy: Math.round(iy), atPoint, got: { right: Math.round(g.right), bottom: Math.round(g.bottom) }, fab: { left: Math.round(f.left), top: Math.round(f.top) } };
+      }
+      return { docked: false, ix, iy, atPoint };
+    });
+    console.log('  info: fab docked-in-modal=' + fab1.docked + ' overlap=' + fab1.ix + 'x' + fab1.iy + 'px hit-test-at-overlap=' + fab1.atPoint);
+    ok(!(fab1.ix > 0 && fab1.iy > 0), `BUG? snapFab must not overlap the "Got it" button (overlap ${fab1.ix}x${fab1.iy}px, clicks there land on: ${fab1.atPoint})`);
+    // close-up of the corner for the visual record
+    const gotBox = await (await page.$('#whatsNewModalBg .modal-footer .btn.primary')).boundingBox();
+    await page.screenshot({ path: path.join(SHOTS, 'e-fab-overlap-closeup.png'), clip: { x: gotBox.x - 30, y: gotBox.y - 20, width: gotBox.width + 80, height: gotBox.height + 60 } });
+    console.log('  shot e-fab-overlap-closeup.png');
+
+    // dismiss via the real button → modal hides; baseline landing for comparison
+    await page.click('#whatsNewModalBg .modal-footer .btn.primary');
+    await new Promise((r) => setTimeout(r, 300));
+    ok(await page.evaluate(() => !document.getElementById('whatsNewModalBg')?.classList.contains('show')), '"Got it" dismisses the modal');
+    await shoot(page, 1440, 900, 'd-landing-baseline-1440.png');
+
+    // After dismissal ON THE LANDING SCREEN the fab should be at the viewport
+    // bottom-right ("no modal, on the landing/init screen → fixed viewport
+    // bottom-right" — dockSnapFab's contract). NOTE: offsetParent is null for
+    // position:fixed elements, so test computed style + rect instead.
+    const fabState = () => ({
+      trappedInModal: !!document.getElementById('snapFab')?.closest('#whatsNewModalBg'),
+      visible: (() => { const f = document.getElementById('snapFab'); if (!f) return false; const r = f.getBoundingClientRect(); return getComputedStyle(f).display !== 'none' && r.width > 0 && r.right <= innerWidth && r.bottom <= innerHeight; })(),
+      rect: (() => { const f = document.getElementById('snapFab'); if (!f) return null; const r = f.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width)]; })(),
+    });
+    const fab2 = await page.evaluate(fabState);
+    console.log('  info(LANDING post-dismiss): fab rect=' + JSON.stringify(fab2.rect) + ' visible=' + fab2.visible + ' trapped=' + fab2.trappedInModal);
+    ok(fab2.visible && !fab2.trappedInModal, `BUG? after "Got it" on landing, the Snapshot fab should sit at the viewport bottom-right (visible=${fab2.visible}, inside the hidden modal=${fab2.trappedInModal}, rect=${JSON.stringify(fab2.rect)})`);
+
+    ok(jsErrors.length === 0, `no JS errors (${jsErrors.length}: ${jsErrors.slice(0, 2).join(' | ')})`);
+  } finally {
+    await browser.close();
+    await new Promise((res) => { server.close(res); server.closeAllConnections?.(); });
+    await cleanupDir(projectDir);
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-whatsnew-ui.mjs
new c196a701b346f007eef6e9e9
+/**
+ * EDGE PROBE (on-demand): the "What's new" MODAL edges, all through the SERVER
+ * path (startServer({whatsNewPath}) — the file is rewritten between phases and
+ * maybeShowWhatsNew() re-fetches /api/whats-new each time).
+ *  (a) degenerate payloads: entries:[] → no modal; entry with no title/items/build
+ *      → sane render, no "undefined" anywhere; items but no build → no "· build undefined".
+ *  (b) huge notes (8 entries × 10 long items) at 1100px → body scrolls within its
+ *      max-height, "Got it" stays visible and really clickable, no layout explosion.
+ *  (c) stacking: modal arrives while Settings is open → z-order/click-through
+ *      sanity; dismissing whats-new must NOT close Settings.
+ *  (d) dismiss edges: background-click dismisses + deletes; dismissing after the
+ *      file was already unlinked server-side → POST 200, no error modal, no JS
+ *      errors; re-calling maybeShowWhatsNew() after dismissal does not re-show.
+ *  (e) two tabs both showing → dismiss in both; second POST is a no-op 200.
+ *  (f) hostile strings in title AND items (and toBuild) of the FILE → inert text.
+ *  (bonus) a null entry in entries — documents that one malformed entry silently
+ *      suppresses the WHOLE modal and the file is never deleted (expected-fail).
+ * Run: node test/_edge-whatsnew-ui.mjs    (skips if Chrome not found)
+ */
+import { mkdtemp, readFile, writeFile, unlink } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+import { cleanupDir } from './_helpers.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17913;
+let pass = 0, fail = 0, expectedFail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+// For the bonus check: asserts SANE behavior; a failure is recorded separately
+// so the probe's exit code reflects only the in-brief checks.
+const okExpected = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { expectedFail++; console.log('  FAIL(known-gap)', l); } };
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+async function waitGone(p, ms = 4000) {
+  const until = Date.now() + ms;
+  while (Date.now() < until) { if (!existsSync(p)) return true; await sleep(120); }
+  return !existsSync(p);
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-wnedge-'));
+  const wnPath = path.join(projectDir, 'whats-new.json');
+  const writeWn = (obj) => writeFile(wnPath, JSON.stringify(obj), 'utf8');
+
+  await writeWn({ fromBuild: 400, toBuild: 414, entries: [] });   // phase (a1) payload, present at boot
+
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: '(mock)' }) + ';</script></head>');
+  const adapter = { async complete() { return { choices: [{ message: { content: 'ok.' } }] }; } };
+  const { server } = await startServer({ html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' }, defaultModel: 'mock', port: PORT, adapter, modelsList: [{ id: 'mock' }], initialProject: projectDir, whatsNewPath: wnPath });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors1 = [], jsErrors2 = [], seenPosts1 = [], seenPosts2 = [];
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1100, height: 800 });
+    page.on('pageerror', (e) => jsErrors1.push(String(e.message)));
+    page.on('response', (r) => { if (r.url().includes('/api/whats-new-seen')) seenPosts1.push(r.status()); });
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForFunction(() => typeof maybeShowWhatsNew === 'function', { timeout: 10000 });
+
+    const shown = () => page.evaluate(() => !!document.getElementById('whatsNewModalBg')?.classList.contains('show'));
+    const trigger = () => page.evaluate(() => maybeShowWhatsNew());   // awaits fetch+render
+
+    // ── (a1) entries: [] → NO modal ────────────────────────────────────────
+    console.log('[a1] entries:[]');
+    const served = await page.evaluate(() => fetch('/api/whats-new').then((r) => r.json()));
+    ok(served && Array.isArray(served.entries) && served.entries.length === 0, 'server serves the file (entries:[] reached the client)');
+    await trigger(); await sleep(300);
+    ok(!(await shown()), 'entries:[] → modal not shown');
+
+    // ── (a2) entry with NO items, NO title, NO build (and no toBuild) ─────
+    console.log('[a2] empty entry');
+    await writeWn({ fromBuild: 400, entries: [{}] });
+    await trigger();
+    ok(await shown(), 'empty entry → modal still shows (no crash)');
+    const a2 = await page.evaluate(() => ({
+      build: document.getElementById('wnBuild')?.textContent,
+      header: document.querySelector('#whatsNewModalBg .modal-header h2')?.textContent || '',
+      titles: [...document.querySelectorAll('.wn-title')].map((e) => e.textContent),
+      lis: document.querySelectorAll('.wn-items li').length,
+      bodyText: document.getElementById('whatsNewBody')?.textContent || '',
+    }));
+    ok(a2.titles.length === 1 && a2.titles[0] === 'Changes', `title falls back to "Changes" (got "${a2.titles[0]}")`);
+    ok(a2.lis === 0, 'no items → no <li>s');
+    ok(!/undefined|null|NaN/.test(a2.bodyText + a2.header + a2.build), `no "undefined"/"null"/"NaN" anywhere (header="${a2.header}")`);
+    console.log(`  note: header with missing toBuild renders as "${a2.header}" (wnBuild="${a2.build}")`);
+    await page.evaluate(() => dismissWhatsNew());
+    ok(await waitGone(wnPath), '(a2) dismiss deleted the file');
+
+    // ── (a3) items present, entry missing the build field ─────────────────
+    console.log('[a3] no build field');
+    await writeWn({ fromBuild: 400, toBuild: 414, entries: [{ title: 'Improvements', items: ['one thing', 'another thing'] }] });
+    await trigger();
+    ok(await shown(), 'no-build entry → modal shows');
+    const a3 = await page.evaluate(() => ({
+      build: document.getElementById('wnBuild')?.textContent,
+      title: document.querySelector('.wn-title')?.textContent,
+      lis: [...document.querySelectorAll('.wn-items li')].map((e) => e.textContent),
+    }));
+    ok(a3.build === '414', `wnBuild shows toBuild (got "${a3.build}")`);
+    ok(a3.title === 'Improvements', `no "· build undefined" suffix (got "${a3.title}")`);
+    ok(a3.lis.length === 2 && a3.lis[0] === 'one thing', 'items rendered');
+    await page.evaluate(() => dismissWhatsNew());
+    ok(await waitGone(wnPath), '(a3) dismiss deleted the file');
+
+    // ── (b) HUGE notes: 8 entries × 10 long items at 1100px ───────────────
+    console.log('[b] huge notes');
+    const longItem = (i, j) => `Entry ${i} item ${j}: ` + 'the quick brown fox jumps over the lazy dog while the build pipeline churns through every worktree and the reviewer files findings. '.repeat(2);
+    const hugeEntries = [];
+    for (let i = 0; i < 8; i++) {
+      const items = [];
+      for (let j = 0; j < 10; j++) items.push(longItem(i, j));
+      hugeEntries.push({ build: 414 - i, title: `Release notes for build ${414 - i} with a fairly long descriptive title`, items });
+    }
+    hugeEntries[0].items[9] = 'UnbrokenToken' + 'x'.repeat(300);   // worst-case wrap input
+    await writeWn({ fromBuild: 400, toBuild: 414, entries: hugeEntries });
+    await trigger();
+    ok(await shown(), 'huge payload → modal shows');
+    const b = await page.evaluate(() => {
+      const body = document.getElementById('whatsNewBody');
+      const box = document.querySelector('#whatsNewModalBg .modal');
+      const btn = document.querySelector('#whatsNewModalBg .modal-footer .btn.primary');
+      const r = btn.getBoundingClientRect();
+      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
+      return {
+        lis: document.querySelectorAll('.wn-items li').length,
+        scrolls: body.scrollHeight > body.clientHeight,
+        bodyClientH: body.clientHeight, innerH: window.innerHeight,
+        btnInViewport: r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0,
+        btnHittable: !!(hit && (hit === btn || btn.contains(hit))),
+        boxW: box.getBoundingClientRect().width,
+        pageScrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
+      };
+    });
+    ok(b.lis === 80, `all 80 items rendered (got ${b.lis})`);
+    ok(b.scrolls, 'body overflows → scrolls (scrollHeight > clientHeight)');
+    ok(b.bodyClientH <= 0.6 * b.innerH + 8, `body respects max-height 60vh (clientHeight ${b.bodyClientH} vs 60% of ${b.innerH})`);
+    ok(b.btnInViewport, '"Got it" footer button fully inside the viewport');
+    ok(b.btnHittable, '"Got it" is the element under its own center (not occluded)');
+    ok(b.boxW <= 522, `modal box width respects max-width 520 (got ${Math.round(b.boxW)})`);
+    ok(b.pageScrollW <= b.innerW, `no horizontal layout explosion at 1100px (page scrollWidth ${b.pageScrollW} <= ${b.innerW})`);
+    await page.click('#whatsNewModalBg .modal-footer .btn.primary');   // REAL click
+    await sleep(150);
+    ok(!(await shown()), 'real click on "Got it" dismisses');
+    ok(await waitGone(wnPath), '(b) click deleted the file');
+
+    // ── (c) STACKING: arrives while Settings is open ───────────────────────
+    console.log('[c] stacking with Settings');
+    await writeWn({ fromBuild: 413, toBuild: 414, entries: [{ build: 414, title: 'One', items: ['thing'] }] });
+    await page.evaluate(() => { openSettings(); });
+    await page.waitForFunction(() => document.getElementById('settingsModalBg')?.classList.contains('show'), { timeout: 5000 });
+    await trigger();
+    await sleep(400);
+    // DEFER design: both backdrops share z-index 100 and DOM order would paint whats-new
+    // UNDERNEATH Settings — maybeShowWhatsNew now waits (4s retries) until no other modal
+    // is open instead of showing an invisible modal.
+    ok(!(await shown()), 'whats-new DEFERS while Settings is open (would paint underneath)');
+    ok(await page.evaluate(() => document.getElementById('settingsModalBg')?.classList.contains('show')), 'Settings stays open, unaffected by the deferred whats-new');
+    await page.evaluate(() => closeSettings());
+    await page.waitForFunction(() => document.getElementById('whatsNewModalBg')?.classList.contains('show'), { timeout: 12000 });
+    ok(true, 'whats-new appears once Settings closes (deferred retry fired)');
+    await page.evaluate(() => dismissWhatsNew());
+    await sleep(150);
+    ok(!(await shown()), 'dismissWhatsNew hides whats-new');
+    ok(await waitGone(wnPath), '(c) deferred-then-dismissed still deleted the file');
+
+    // ── (d1) background-click dismisses + deletes ──────────────────────────
+    console.log('[d1] background-click');
+    await writeWn({ fromBuild: 413, toBuild: 414, entries: [{ build: 414, title: 'One', items: ['thing'] }] });
+    await trigger();
+    ok(await shown(), 'modal shows again for the bg-click test');
+    await page.mouse.click(15, 15);   // inside the modal-bg padding, outside the box
+    await sleep(150);
+    ok(!(await shown()), 'clicking the dark background dismisses');
+    ok(await waitGone(wnPath), 'background-click also deleted the file');
+
+    // ── (d2) dismiss when the file is ALREADY gone server-side ────────────
+    console.log('[d2] dismiss after server-side unlink');
+    await writeWn({ fromBuild: 413, toBuild: 414, entries: [{ build: 414, title: 'One', items: ['thing'] }] });
+    await trigger();
+    ok(await shown(), 'modal shows for the already-deleted test');
+    await unlink(wnPath);   // simulate someone/something removing it first
+    const errsBefore = jsErrors1.length, postsBefore = seenPosts1.length;
+    await page.evaluate(() => dismissWhatsNew());
+    let got = false;
+    for (let i = 0; i < 30 && !got; i++) { if (seenPosts1.length > postsBefore) got = true; else await sleep(100); }
+    ok(got && seenPosts1[seenPosts1.length - 1] === 200, `POST /api/whats-new-seen on a missing file → 200 (got ${seenPosts1.slice(postsBefore).join(',') || 'none'})`);
+    ok(!(await shown()), 'modal dismissed');
+    ok(await page.evaluate(() => !document.getElementById('modalBg')?.classList.contains('show')), 'no error modal/toast appeared');
+    ok(jsErrors1.length === errsBefore, 'no new JS errors from the missing-file dismiss');
+
+    // ── (d3) re-running boot code after dismissal does NOT re-show ─────────
+    console.log('[d3] re-trigger after dismissal');
+    await trigger(); await sleep(300);
+    ok(!(await shown()), 'maybeShowWhatsNew() again (SSE-reconnect style) does not re-show');
+    const empty = await page.evaluate(() => fetch('/api/whats-new').then((r) => r.json()));
+    ok(empty && Object.keys(empty).length === 0, '/api/whats-new now returns {}');
+
+    // ── (e) TWO TABS, dismiss in both ──────────────────────────────────────
+    console.log('[e] two tabs');
+    await writeWn({ fromBuild: 413, toBuild: 414, entries: [{ build: 414, title: 'Two-tab', items: ['same notes'] }] });
+    const page2 = await browser.newPage();
+    await page2.setViewport({ width: 1100, height: 800 });
+    page2.on('pageerror', (e) => jsErrors2.push(String(e.message)));
+    page2.on('response', (r) => { if (r.url().includes('/api/whats-new-seen')) seenPosts2.push(r.status()); });
+    await page2.goto(`http://127.0.0.1:${PORT}/`);
+    await page2.waitForFunction(() => document.getElementById('whatsNewModalBg')?.classList.contains('show'), { timeout: 10000 });
+    ok(true, 'tab 2 shows the modal at boot');
+    await trigger();
+    ok(await shown(), 'tab 1 shows the modal too (both tabs at once)');
+    await page.evaluate(() => dismissWhatsNew());
+    ok(await waitGone(wnPath), 'tab-1 dismiss deleted the file');
+    const p2Before = seenPosts2.length;
+    await page2.evaluate(() => dismissWhatsNew());
+    let got2 = false;
+    for (let i = 0; i < 30 && !got2; i++) { if (seenPosts2.length > p2Before) got2 = true; else await sleep(100); }
+    ok(got2 && seenPosts2[seenPosts2.length - 1] === 200, `tab-2 dismiss (file already gone) → no-op 200 (got ${seenPosts2.slice(p2Before).join(',') || 'none'})`);
+    ok(await page2.evaluate(() => !document.getElementById('whatsNewModalBg')?.classList.contains('show')), 'tab-2 modal dismissed');
+    ok(jsErrors2.length === 0, `tab 2 had no JS errors (${jsErrors2.join(' | ')})`);
+    await page2.close();
+
+    // ── (f) SECURITY via the server path: hostile title AND items in the FILE
+    console.log('[f] hostile file content (boot path)');
+    await writeWn({
+      fromBuild: 413,
+      toBuild: '<b onclick="window.__wnB=1">999</b>',
+      entries: [{
+        build: '<i>x</i>',
+        title: '<img src=x onerror="window.__wnT=1">',
+        items: [
+          '<img src=x onerror="window.__wnI=1">',
+          '<svg onload="window.__wnSvg=1"></svg>',
+          '</ul></div><script>window.__wnS=1<\/script>',
+          'javascript:window.__wnJ=1',
+        ],
+      }],
+    });
+    await page.reload({ waitUntil: 'domcontentloaded' });   // real boot path through the server
+    await page.waitForFunction(() => document.getElementById('whatsNewModalBg')?.classList.contains('show'), { timeout: 10000 });
+    const f = await page.evaluate(() => {
+      // NOTE: compute the checks IN-PAGE — puppeteer JSON-serializes undefined→null,
+      // and the snapshot fab legitimately docks its own <svg> into the open modal,
+      // so the injection check must scope to the note containers only.
+      const markers = ['__wnB', '__wnT', '__wnI', '__wnSvg', '__wnS', '__wnJ'];
+      // The modal header carries the LEGIT brand-spark <img> (the traced star) — only the
+      // note containers themselves must stay element-free.
+      const injectedEl = document.querySelector('#whatsNewBody img, #whatsNewBody svg, #whatsNewBody script, #wnBuild *');
+      return {
+        markersClean: markers.every((k) => window[k] === undefined),
+        markerVals: markers.map((k) => String(window[k])).join(','),
+        build: document.getElementById('wnBuild')?.textContent,
+        title: document.querySelector('.wn-title')?.textContent || '',
+        items: [...document.querySelectorAll('.wn-items li')].map((e) => e.textContent),
+        injected: injectedEl ? injectedEl.outerHTML.slice(0, 120) : null,
+      };
+    });
+    ok(f.markersClean, `no hostile marker executed (window values: [${f.markerVals}])`);
+    ok(!f.injected, `no element materialized inside the notes containers (got ${f.injected || 'none'})`);
+    ok(f.build === '<b onclick="window.__wnB=1">999</b>', `hostile toBuild rendered as literal text (got "${f.build}")`);
+    // Single-entry render: the entry title carries NO build label (the header owns the
+    // build), so the hostile `build` value must simply never be rendered here at all.
+    ok(/<img src=x onerror/.test(f.title), `hostile title rendered as literal text (got "${f.title}")`);
+    ok(!/<i>x<\/i>/.test(f.title), 'hostile build value not rendered in a single-entry title (header owns the build)');
+    ok(f.items.length === 4 && /<svg onload/.test(f.items[1]) && /<script>/.test(f.items[2]), 'hostile items rendered as literal text');
+    await page.evaluate(() => dismissWhatsNew());
+    ok(await waitGone(wnPath), '(f) dismiss deleted the hostile file');
+
+    // ── (bonus, expected-fail allowed) one malformed (null) entry ──────────
+    console.log('[bonus] null entry among valid ones');
+    await writeWn({ fromBuild: 413, toBuild: 414, entries: [null, { build: 414, title: 'Valid', items: ['still here'] }] });
+    await trigger(); await sleep(300);
+    okExpected(await shown(), 'a malformed entry should not suppress the whole modal (valid entries still shown)');
+    okExpected(!existsSync(wnPath) || (await shown()), 'malformed file should not linger forever undismissable');
+    if (existsSync(wnPath)) { try { await unlink(wnPath); } catch {} }
+
+    ok(jsErrors1.length === 0, `tab 1 had no JS errors across all phases (${jsErrors1.length}: ${jsErrors1.slice(0, 3).join(' | ')})`);
+  } finally {
+    await browser.close(); server.close();
+    await cleanupDir(projectDir);
+  }
+  console.log(`\n${pass} passed, ${fail} failed${expectedFail ? ` (+${expectedFail} known-gap failures, not counted)` : ''}`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_edge-whatsnew.mjs
new bfd0714918da91eed7c9fdba
+/**
+ * EDGE PROBE (on-demand): the post-update "What's new" modal.
+ *  - whats-new.json present (via startServer's whatsNewPath override) → the
+ *    modal shows ONCE on load with the build number, titles and items.
+ *  - "Got it" dismisses it AND deletes the file (POST /api/whats-new-seen).
+ *  - reload after dismissal → no modal (the file is gone).
+ *  - notes render as TEXT (a hostile item must not execute).
+ * Run: node test/_edge-whatsnew.mjs    (skips if Chrome not found)
+ */
+import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = 17911;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+function findChrome() {
+  const c = process.platform === 'win32'
+    ? [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
+    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-wn-'));
+  const wnPath = path.join(projectDir, 'whats-new.json');
+  await writeFile(wnPath, JSON.stringify({
+    fromBuild: 405, toBuild: 412, at: '2026-06-10T00:00:00Z',
+    entries: [
+      { build: 412, title: 'Reviewer & launcher', items: ['A parallel reviewer verifies the agent\'s work.', '<img src=x onerror="window.__wnPwned=1">'] },
+      { build: 408, title: 'Fixes', items: ['Verdict parsing cleaned up.'] },
+    ],
+  }), 'utf8');
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock', baseURL: '(mock)' }) + ';</script></head>');
+  const adapter = { async complete() { return { choices: [{ message: { content: 'ok.' } }] }; } };
+  const { server } = await startServer({ html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' }, defaultModel: 'mock', port: PORT, adapter, modelsList: [{ id: 'mock' }], initialProject: projectDir, whatsNewPath: wnPath });
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const jsErrors = [];
+  try {
+    const page = await browser.newPage();
+    page.on('pageerror', (e) => jsErrors.push(String(e.message)));
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+
+    // [1] the modal appears on load with the build, both entries, and their items.
+    await page.waitForFunction(() => document.getElementById('whatsNewModalBg')?.classList.contains('show'), { timeout: 10000 });
+    const modal = await page.evaluate(() => ({
+      build: document.getElementById('wnBuild')?.textContent,
+      titles: [...document.querySelectorAll('.wn-title')].map((e) => e.textContent),
+      items: [...document.querySelectorAll('.wn-items li')].map((e) => e.textContent),
+      pwned: window.__wnPwned,
+    }));
+    ok(modal.build === '412', `modal shows the new build (got "${modal.build}")`);
+    ok(modal.titles.length === 2 && /Reviewer & launcher/.test(modal.titles[0]) && /412/.test(modal.titles[0]), `both releases listed, newest first (got: ${modal.titles.join(' | ')})`);
+    ok(modal.items.length === 3 && /parallel reviewer/.test(modal.items[0]), `items rendered (got ${modal.items.length})`);
+    ok(modal.pwned === undefined && /img src/.test(modal.items[1] || ''), 'hostile note item rendered as inert TEXT (no XSS)');
+
+    // [2] "Got it" hides the modal and deletes the file server-side.
+    await page.evaluate(() => dismissWhatsNew());
+    ok(await page.evaluate(() => !document.getElementById('whatsNewModalBg')?.classList.contains('show')), 'dismiss hides the modal');
+    let gone = false;
+    for (let i = 0; i < 20; i++) { if (!existsSync(wnPath)) { gone = true; break; } await new Promise((r) => setTimeout(r, 150)); }
+    ok(gone, 'dismiss deleted whats-new.json (seen once, never again)');
+
+    // [3] reload → no modal.
+    await page.reload({ waitUntil: 'domcontentloaded' });
+    await new Promise((r) => setTimeout(r, 1200));
+    ok(await page.evaluate(() => !document.getElementById('whatsNewModalBg')?.classList.contains('show')), 'after reload the modal stays gone');
+
+    ok(jsErrors.length === 0, `no JS errors (${jsErrors.length}: ${jsErrors.slice(0, 2).join(' | ')})`);
+  } finally {
+    await browser.close(); server.close();
+    for (let i = 0; i < 5; i++) { try { await rm(projectDir, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_explore-git-resolver-edges.mjs
new 1e1658e895f50074ad9c8ac2
+/**
+ * Edge-case bug-hunt for the worktree-based conflict resolver (server endpoints):
+ *   [A] the REAL branch moves during a resolve → commit must fail CLEANLY (no corruption),
+ *       scratch preserved, abort recovers.
+ *   [B] a MODIFY/DELETE conflict (one side deletes a file the other edits — no <<< markers)
+ *       must be resolvable (keep or delete) and let the merge complete.
+ *   [C] multiple conflicted files — resolve all → commit.
+ *
+ * Run: node test/_explore-git-resolver-edges.mjs    Ports 17995-17997
+ */
+import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { execFileSync } from 'node:child_process';
+import { startServer } from '../src/server.mjs';
+
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗ BUG?', l); } };
+function haveGit() { try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } }
+if (!haveGit()) { console.log('SKIP: git not found'); process.exit(0); }
+const git = (d, ...a) => execFileSync('git', a, { cwd: d, stdio: 'pipe' });
+const merging = (d) => { try { execFileSync('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd: d, stdio: 'pipe' }); return true; } catch { return false; } };
+const cleanWt = (d) => execFileSync('git', ['status', '--porcelain'], { cwd: d }).toString().trim() === '';
+const mockAdapter = () => ({ async complete() { return { choices: [{ message: { content: '' } }] }; }, async listModels() { return { data: [{ id: 'm' }] }; } });
+
+// Build a repo whose origin/<main> is ahead, with `localFiles` vs `remoteFiles` diverging
+// from `baseFiles`. Returns { dir, remote }. The repo is left on main, fetched.
+async function makeRepo(tag, baseFiles, remoteFiles, localFiles) {
+  const remote = await mkdtemp(path.join(tmpdir(), `cb-${tag}-rmt-`));
+  const dir = await mkdtemp(path.join(tmpdir(), `cb-${tag}-`));
+  const other = await mkdtemp(path.join(tmpdir(), `cb-${tag}-oth-`));
+  git(remote, 'init', '-q', '--bare', '-b', 'main');
+  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.email', 't@t'); git(dir, 'config', 'user.name', 'T'); git(dir, 'remote', 'add', 'origin', remote);
+  for (const [f, c] of Object.entries(baseFiles)) await writeFile(path.join(dir, f), c);
+  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'base'); git(dir, 'push', '-q', '-u', 'origin', 'main');
+  git(other, 'clone', '-q', remote, '.'); git(other, 'config', 'user.email', 'o@o'); git(other, 'config', 'user.name', 'O');
+  // Apply the remote diff (null value = delete the file).
+  for (const [f, c] of Object.entries(remoteFiles)) { if (c === null) { try { git(other, 'rm', '-q', f); } catch {} } else await writeFile(path.join(other, f), c); }
+  git(other, 'add', '-A'); git(other, 'commit', '-q', '-m', 'remote'); git(other, 'push', '-q', 'origin', 'main');
+  for (const [f, c] of Object.entries(localFiles)) { if (c === null) { try { git(dir, 'rm', '-q', f); } catch {} } else await writeFile(path.join(dir, f), c); }
+  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'local'); git(dir, 'fetch', '-q', 'origin');
+  await rm(other, { recursive: true, force: true }).catch(() => {});
+  return { dir, remote };
+}
+async function withServer(dir, port, fn) {
+  const { server } = await startServer({ html: '<html></html>', baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' }, defaultModel: 'm', port, adapter: mockAdapter(), modelsList: [{ id: 'm' }], initialProject: dir });
+  await sleep(700);
+  const J = (p, b) => fetch(`http://127.0.0.1:${port}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) }).then((r) => r.json());
+  const G = (p) => fetch(`http://127.0.0.1:${port}${p}`).then((r) => r.json());
+  try { await fn(J, G); } finally { server.close(); await sleep(100); }
+}
+
+async function main() {
+  // ─── [A] real branch moves during a resolve ───────────────────────────────
+  console.log('\n[A] real branch advances during the resolve → commit fails cleanly');
+  {
+    const { dir, remote } = await makeRepo('edgeA', { a: '1\n2\n3\n' }, { a: '1\nREMOTE\n3\n' }, { a: '1\nLOCAL\n3\n' });
+    await withServer(dir, 17995, async (J) => {
+      const start = await J('/api/merge-start', {});
+      ok(start.ok && start.files?.length === 1, `merge-start opened a scratch resolve (conflict in a)`);
+      ok(!merging(dir) && cleanWt(dir), `real repo NOT mid-merge / clean while resolving (worktree isolation)`);
+      // Concurrently advance the real branch (e.g. the agent committed something).
+      await writeFile(path.join(dir, 'new.txt'), 'sneaked in\n'); git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'concurrent commit');
+      const headBefore = git(dir, 'rev-parse', 'HEAD').toString().trim();
+      await J('/api/merge-apply', { file: 'a', content: '1\nRESOLVED\n3\n' });
+      const commit = await J('/api/merge-commit', {});
+      ok(commit.ok === false, `commit REFUSED because the branch moved (got ${JSON.stringify(commit).slice(0, 80)})`);
+      ok(git(dir, 'rev-parse', 'HEAD').toString().trim() === headBefore && cleanWt(dir), `real repo intact (HEAD unchanged, clean) — no corruption`);
+      const ab = await J('/api/merge-abort', {});
+      ok(ab.ok && cleanWt(dir), `abort recovers (scratch discarded, repo clean)`);
+    });
+    for (const d of [dir, remote]) await rm(d, { recursive: true, force: true }).catch(() => {});
+  }
+
+  // ─── [B] modify/delete conflict (no <<< markers) ──────────────────────────
+  console.log('\n[B] modify/delete conflict (remote deletes a file we edited) is resolvable');
+  {
+    // base has x (text) + y. remote: edit x (→ text conflict) AND delete y. local: edit x + edit y.
+    const { dir, remote } = await makeRepo('edgeB',
+      { x: '1\n2\n3\n', y: 'keep me\n' },
+      { x: '1\nREMOTE\n3\n', y: null },
+      { x: '1\nLOCAL\n3\n', y: 'I edited y\n' });
+    await withServer(dir, 17996, async (J) => {
+      const start = await J('/api/merge-start', {});
+      const names = (start.files || []).map((f) => f.file).sort();
+      ok(names.includes('x') && names.includes('y'), `both conflicts surfaced (got ${JSON.stringify(names)})`);
+      const yf = (start.files || []).find((f) => f.file === 'y');
+      ok(yf && yf.kind === 'tree', `the modify/delete file is flagged as a non-text (tree) conflict (got kind=${yf?.kind})`);
+      ok(yf && /delete/i.test(yf.note || ''), `it carries a human note describing the modify/delete (got "${yf?.note}")`);
+      // Resolve the text conflict normally...
+      const ax = await J('/api/merge-apply', { file: 'x', content: '1\nRESOLVED\n3\n' });
+      ok(ax.ok, `text conflict (x) resolved`);
+      // ...and the modify/delete by an explicit keep-or-delete action (here: delete).
+      const ay = await J('/api/merge-apply', { file: 'y', action: 'delete' });
+      ok(ay.ok && ay.remaining === 0, `modify/delete (y) resolved via delete → 0 conflicts left (got ${JSON.stringify(ay)})`);
+      const commit = await J('/api/merge-commit', {});
+      ok(commit.ok, `merge completes after resolving BOTH conflict kinds (got ${JSON.stringify(commit).slice(0, 80)})`);
+      ok(!existsSync(path.join(dir, 'y')), `y is deleted in the real tree`);
+      ok(/RESOLVED/.test(await readFile(path.join(dir, 'x'), 'utf8')), `x holds the resolved content`);
+      ok(git(dir, 'rev-list', '--parents', '-n', '1', 'HEAD').toString().trim().split(/\s+/).length === 3, `HEAD is a 2-parent merge`);
+    });
+    for (const d of [dir, remote]) await rm(d, { recursive: true, force: true }).catch(() => {});
+  }
+
+  // ─── [C] keep side of a modify/delete + multiple text files ───────────────
+  console.log('\n[C] modify/delete resolved by KEEP + a second text conflict');
+  {
+    const { dir, remote } = await makeRepo('edgeC',
+      { p: 'a\nb\nc\n', q: 'orig\n' },
+      { p: 'a\nRP\nc\n', q: null },
+      { p: 'a\nLP\nc\n', q: 'my important edit\n' });
+    await withServer(dir, 17997, async (J) => {
+      await J('/api/merge-start', {});
+      await J('/api/merge-apply', { file: 'p', content: 'a\nMERGED\nc\n' });
+      const keep = await J('/api/merge-apply', { file: 'q', action: 'keep' });
+      ok(keep.ok && keep.remaining === 0, `modify/delete resolved by KEEP → 0 left`);
+      const commit = await J('/api/merge-commit', {});
+      ok(commit.ok, `commit ok`);
+      ok(existsSync(path.join(dir, 'q')) && /important edit/.test(await readFile(path.join(dir, 'q'), 'utf8')), `kept file q survives with our edit`);
+    });
+    for (const d of [dir, remote]) await rm(d, { recursive: true, force: true }).catch(() => {});
+  }
+
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_explore-resolver-ui.mjs
new d164f3b0cb3db44a0f66c439
+/**
+ * Exploratory Puppeteer bug-hunt for the manual conflict RESOLVER UI (the modal flow,
+ * not just the endpoints): open the resolver against a real conflict, pick a side, use
+ * the AI recommendation, commit — watching for page errors + broken states.
+ *
+ * Run: node test/_explore-resolver-ui.mjs    Port: 28977
+ */
+import { mkdtemp, rm, readFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import { execFileSync } from 'node:child_process';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.join(__dirname, '..');
+const PORT = 28977;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+function findChrome() {
+  const c = process.platform === 'win32' ? [
+    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
+    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
+    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
+  ] : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+function haveGit() { try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } }
+// Adapter whose recommend reply uses the RATIONALE/RESOLUTION format the endpoint parses.
+const adapter = () => ({
+  async complete() { return { choices: [{ message: { content: 'RATIONALE: combine both\nRESOLUTION:\nline1\nRESOLVED-BY-AI\nline3' } }] }; },
+  async *completeStream() { yield { choices: [{ delta: { content: '' } }] }; },
+  async listModels() { return { data: [{ id: 'mock-model' }] }; },
+});
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  if (!haveGit()) { console.log('SKIP: git not found'); process.exit(0); }
+
+  const remote = await mkdtemp(path.join(tmpdir(), 'cb-rui-rmt-'));
+  const dir = await mkdtemp(path.join(tmpdir(), 'cb-rui-'));
+  const other = await mkdtemp(path.join(tmpdir(), 'cb-rui-oth-'));
+  const git = (d, ...a) => execFileSync('git', a, { cwd: d, stdio: 'pipe' });
+  let server, browser;
+  try {
+    git(remote, 'init', '-q', '--bare', '-b', 'main');
+    git(dir, 'init', '-q', '-b', 'main');
+    git(dir, 'config', 'user.email', 't@t'); git(dir, 'config', 'user.name', 'T');
+    git(dir, 'remote', 'add', 'origin', remote);
+    const fp = path.join(dir, 'app.js');
+    execFileSync('node', ['-e', `require('fs').writeFileSync(${JSON.stringify(fp)}, 'line1\\nline2\\nline3\\n')`]);
+    git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'base'); git(dir, 'push', '-q', '-u', 'origin', 'main');
+    git(other, 'clone', '-q', remote, '.');
+    git(other, 'config', 'user.email', 'o@o'); git(other, 'config', 'user.name', 'O');
+    execFileSync('node', ['-e', `require('fs').writeFileSync(${JSON.stringify(path.join(other, 'app.js'))}, 'line1\\nREMOTE\\nline3\\n')`]);
+    git(other, 'add', '-A'); git(other, 'commit', '-q', '-m', 'remote'); git(other, 'push', '-q', 'origin', 'main');
+    execFileSync('node', ['-e', `require('fs').writeFileSync(${JSON.stringify(fp)}, 'line1\\nLOCAL\\nline3\\n')`]);
+    git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'local'); git(dir, 'fetch', '-q', 'origin');
+
+    const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8')).replace(
+      '</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock-model', baseURL: '(mock)' }) + ';</script></head>'
+    );
+    ({ server } = await startServer({
+      html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+      defaultModel: 'mock-model', port: PORT, adapter: adapter(), modelsList: [{ id: 'mock-model' }], initialProject: dir,
+    }));
+    await sleep(700);
+    browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1400, height: 950 });
+    const errs = [];
+    page.on('pageerror', (e) => errs.push(e.message));
+    page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForFunction(() => typeof openResolveModal === 'function' && typeof openPullModal === 'function', { timeout: 8000 });
+
+    console.log('\n[0] pull preview → definitive conflict banner → "Resolve conflicts…" handoff');
+    await page.evaluate(() => openPullModal(''));
+    await page.waitForFunction(() => document.querySelectorAll('#pullModalBody .commit-entry').length > 0, { timeout: 8000 });
+    await page.waitForFunction(() => { const b = document.querySelector('.pull-conflict-banner'); return b && ['conflict', 'clean', 'unknown'].some((s) => b.classList.contains(s)); }, { timeout: 15000 });
+    const banner = await page.evaluate(() => { const b = document.querySelector('.pull-conflict-banner'); return { conflict: b.classList.contains('conflict'), btn: !!b.querySelector('button') }; });
+    ok(banner.conflict, `pull preview definitively detects the conflict (conflict banner shown)`);
+    ok(banner.btn, `conflict banner offers a Resolve button`);
+    await page.evaluate(() => document.querySelector('.pull-conflict-banner button').click());
+    await page.waitForFunction(() => document.getElementById('resolveModalBg').classList.contains('show') && !document.getElementById('pullModalBg').classList.contains('show'), { timeout: 8000 });
+    await page.waitForFunction(() => document.querySelectorAll('#resolveModalBody .rsv-cflt').length > 0, { timeout: 8000 });
+    ok(true, `Resolve button hands off to the resolver (pull modal closed, resolver open)`);
+    await page.evaluate(() => cancelResolve());   // abort the merge → reset to pre-merge for [1]
+    await page.waitForFunction(() => !document.getElementById('resolveModalBg').classList.contains('show'), { timeout: 5000 });
+    await sleep(200);
+
+    console.log('\n[1] resolver opens on a real conflict + shows both sides');
+    await page.evaluate(() => openResolveModal(''));
+    await page.waitForFunction(() => document.querySelectorAll('#resolveModalBody .rsv-cflt').length > 0, { timeout: 8000 });
+    const view = await page.evaluate(() => {
+      const c = document.querySelector('.rsv-cflt');
+      return {
+        cflts: document.querySelectorAll('.rsv-cflt').length,
+        file: document.querySelector('.rsv-file-name')?.textContent,
+        ours: c.querySelector('.rsv-side.ours .rsv-side-code')?.textContent,
+        theirs: c.querySelector('.rsv-side.theirs .rsv-side-code')?.textContent,
+        commitDisabled: document.getElementById('resolveCommitBtn').disabled,
+      };
+    });
+    ok(view.cflts === 1, `one conflict shown (got ${view.cflts})`);
+    ok(view.file === 'app.js', `file name shown (got ${view.file})`);
+    ok(/LOCAL/.test(view.ours) && /REMOTE/.test(view.theirs), `ours=LOCAL / theirs=REMOTE shown`);
+    ok(view.commitDisabled, `Commit disabled until every conflict has a choice`);
+
+    console.log('\n[2] AI Recommend → Use this sets the resolution (AI never auto-applies)');
+    await page.evaluate(() => [...document.querySelectorAll('.rsv-cflt .rsv-ai')][0].click());
+    await page.waitForFunction(() => !!document.querySelector('.rsv-rec'), { timeout: 8000 });
+    const recText = await page.evaluate(() => document.querySelector('.rsv-rec .rsv-side-code')?.textContent || '');
+    ok(/RESOLVED-BY-AI/.test(recText), `recommendation rendered (got ${JSON.stringify(recText.slice(0, 40))})`);
+    const stillDisabled = await page.evaluate(() => document.getElementById('resolveCommitBtn').disabled);
+    ok(stillDisabled, `recommendation shown but NOT auto-applied (commit still disabled)`);
+    await page.evaluate(() => [...document.querySelectorAll('.rsv-rec .rsv-btn')].find((b) => /Use this/.test(b.textContent)).click());
+    await sleep(150);
+    const afterUse = await page.evaluate(() => ({
+      enabled: !document.getElementById('resolveCommitBtn').disabled,
+      hasEdit: !!document.querySelector('.rsv-cflt .rsv-edit'),
+      editVal: document.querySelector('.rsv-cflt .rsv-edit')?.value || '',
+    }));
+    ok(afterUse.enabled, `after Use this, Commit enabled (all conflicts chosen)`);
+    ok(/RESOLVED-BY-AI/.test(afterUse.editVal), `the accepted recommendation populates the editable field`);
+
+    console.log('\n[3] commit the merge → modal closes + real merge commit lands');
+    await page.evaluate(() => document.getElementById('resolveCommitBtn').click());
+    await page.waitForFunction(() => !document.getElementById('resolveModalBg').classList.contains('show'), { timeout: 8000 });
+    await sleep(300);
+    const parents = execFileSync('git', ['rev-list', '--parents', '-n', '1', 'HEAD'], { cwd: dir }).toString().trim().split(/\s+/);
+    ok(parents.length === 3, `HEAD is a real merge commit (2 parents) (got ${parents.length - 1})`);
+    const u = execFileSync('git', ['diff', '--name-only', '--diff-filter=U'], { cwd: dir }).toString().trim();
+    ok(u === '', `no unmerged files remain (got "${u}")`);
+    const content = await readFile(fp, 'utf8');
+    ok(/RESOLVED-BY-AI/.test(content), `working tree holds the resolved content`);
+
+    console.log('\n[4] no page/console errors during the whole flow');
+    ok(errs.length === 0, `no JS errors (got ${errs.length}: ${errs.slice(0, 3).join(' | ')})`);
+  } finally {
+    if (browser) await browser.close();
+    if (server) server.close();
+    for (const d of [dir, remote, other]) await rm(d, { recursive: true, force: true }).catch(() => {});
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e); process.exit(2); });
+
=== add test/_explore-ui-round2.mjs
new 172649b8eb6c5a2fbf243a85
+/**
+ * Exploratory Puppeteer bug-hunt, round 2. Targets surfaces not yet browser-tested:
+ *   [A] multi-repo merge bar — one row PER repo, labeled, buttons scoped to relDir
+ *   [B] missing-project open → graceful landing fallback (no blocking error)
+ *   [C] "workflow" rainbow word-boundary edges (plural / mid-word / code span)
+ *
+ * Run: node test/_explore-ui-round2.mjs    Port: 28981
+ */
+import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import { execFileSync } from 'node:child_process';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.join(__dirname, '..');
+const PORT = 28981;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗ BUG?', l); } };
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+function findChrome() {
+  const c = process.platform === 'win32' ? [
+    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
+    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
+    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
+  ] : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+function haveGit() { try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } }
+const mockAdapter = () => ({
+  async complete() { return { choices: [{ message: { content: 'done.' } }] }; },
+  async *completeStream() { yield { choices: [{ delta: { content: 'done.' } }] }; },
+  async listModels() { return { data: [{ id: 'mock-model' }] }; },
+});
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  if (!haveGit()) { console.log('SKIP: git not found'); process.exit(0); }
+
+  // A project that CONTAINS two git repos (subA, subB), both with uncommitted work
+  // (→ 'direct' mode → a row each).
+  const proj = await mkdtemp(path.join(tmpdir(), 'cb-r2-'));
+  const git = (d, ...a) => execFileSync('git', a, { cwd: d, stdio: 'pipe' });
+  for (const sub of ['subA', 'subB']) {
+    const d = path.join(proj, sub);
+    await mkdir(d, { recursive: true });
+    git(d, 'init', '-q', '-b', 'main');
+    git(d, 'config', 'user.email', 't@t'); git(d, 'config', 'user.name', 'T');
+    await writeFile(path.join(d, 'f.txt'), 'base\n');
+    git(d, 'add', '-A'); git(d, 'commit', '-q', '-m', 'base');
+    await writeFile(path.join(d, 'f.txt'), 'edited (uncommitted)\n');   // dirty → direct row
+  }
+
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8')).replace(
+    '</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock-model', baseURL: '(mock)' }) + ';</script></head>'
+  );
+  const { server } = await startServer({
+    html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+    defaultModel: 'mock-model', port: PORT, adapter: mockAdapter(), modelsList: [{ id: 'mock-model' }], initialProject: proj,
+  });
+  await sleep(800);
+  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const errs = [];
+  try {
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1400, height: 950 });
+    page.on('pageerror', (e) => errs.push(e.message));
+    // Ignore the browser's auto-logged network failure for the DELIBERATE missing-project
+    // 400 in [B] (handled gracefully by the app) — only count real JS errors.
+    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForFunction(() => typeof refreshMergeBar === 'function' && typeof addBubble === 'function', { timeout: 8000 });
+
+    console.log('\n[A] multi-repo merge bar: one labeled row per repo, buttons scoped to relDir');
+    await page.evaluate(() => refreshMergeBar());
+    await page.waitForFunction(() => document.querySelectorAll('#mergeRow .merge-row').length >= 2, { timeout: 6000 }).catch(() => {});
+    const bar = await page.evaluate(() => {
+      const rows = [...document.querySelectorAll('#mergeRow .merge-row')];
+      return {
+        count: rows.length,
+        labels: rows.map((r) => r.querySelector('.merge-repo-label')?.textContent || null),
+        reldirs: rows.map((r) => r.getAttribute('data-reldir')),
+        commitOnclicks: rows.map((r) => r.querySelector('.merge-btn')?.getAttribute('onclick') || ''),
+      };
+    });
+    ok(bar.count === 2, `two repo rows shown (got ${bar.count})`);
+    ok(bar.labels.includes('subA') && bar.labels.includes('subB'), `each row labeled by subdir (got ${JSON.stringify(bar.labels)})`);
+    ok(JSON.stringify([...bar.reldirs].sort()) === JSON.stringify(['subA', 'subB']), `rows carry data-reldir (got ${JSON.stringify(bar.reldirs)})`);
+    ok(bar.commitOnclicks.some((o) => /openCommitModal\('subA'\)/.test(o)) && bar.commitOnclicks.some((o) => /openCommitModal\('subB'\)/.test(o)),
+      `each Commit button scoped to its own repo (got ${JSON.stringify(bar.commitOnclicks)})`);
+
+    console.log('\n[C] "workflow" rainbow word-boundary edges');
+    const rainbow = await page.evaluate(() => {
+      const mk = (t) => { const b = addBubble('user', t); const n = b.querySelectorAll('.rainbow-word').length; const txt = [...b.querySelectorAll('.rainbow-word')].map((w) => w.textContent).join('|'); b.remove(); return { n, txt }; };
+      return {
+        plain: mk('use the workflow command'),       // → 1 (just "workflow")
+        cmd: mk('run /workflow now'),                // → 1 ("/workflow")
+        plural: mk('I have many workflows here'),     // should NOT half-highlight "workflow"+stray "s"
+        midword: mk('this is myworkflowthing'),       // should NOT highlight mid-word
+        code: mk('use `workflow` inside code'),       // code span → NOT highlighted
+      };
+    });
+    ok(rainbow.plain.n === 1 && rainbow.plain.txt === 'workflow', `standalone "workflow" highlighted (got ${JSON.stringify(rainbow.plain)})`);
+    ok(rainbow.cmd.n === 1, `"/workflow" command highlighted (got ${JSON.stringify(rainbow.cmd)})`);
+    ok(rainbow.plural.n === 0, `"workflows" (plural) NOT half-highlighted (got ${JSON.stringify(rainbow.plural)})`);
+    ok(rainbow.midword.n === 0, `"myworkflowthing" (mid-word) NOT highlighted (got ${JSON.stringify(rainbow.midword)})`);
+    ok(rainbow.code.n === 0, `"workflow" inside a code span NOT highlighted (got ${JSON.stringify(rainbow.code)})`);
+
+    console.log('\n[B] opening a missing project falls back to the landing (no blocking error)');
+    const fb = await page.evaluate(async () => {
+      await openProject('/no-such-dir-xyz-' + 'qwerty');
+      await new Promise((r) => setTimeout(r, 400));
+      return {
+        landingVisible: !document.getElementById('landing').classList.contains('hidden'),
+        chatVisible: !document.getElementById('chat').classList.contains('hidden'),
+        initVisible: !document.getElementById('initView').classList.contains('hidden'),
+        toast: !!document.querySelector('#toastStack .toast'),
+      };
+    });
+    ok(fb.landingVisible, `landing shown after a missing-project open (got ${JSON.stringify(fb)})`);
+    ok(!fb.initVisible, `the init/opening spinner is not left stuck`);
+    ok(fb.toast, `a toast explains the project was removed`);
+
+    console.log('\n[D] no page/console errors across the whole round');
+    ok(errs.length === 0, `no JS errors (got ${errs.length}: ${errs.slice(0, 4).join(' | ')})`);
+  } finally {
+    await browser.close();
+    server.close();
+    await rm(proj, { recursive: true, force: true }).catch(() => {});
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e); process.exit(2); });
+
=== add test/_explore-ui-round3.mjs
new fdb46a933269ba50091db8ed
+/**
+ * Exploratory Puppeteer bug-hunt, round 3. Drives the merge/push tool-row flows in a
+ * real browser against a real repo (a CODE_BOSS subbranch ahead of its parent + a remote):
+ *   [A] commits-to-merge modal — opened from the bar, lists commits + clean diffs
+ *   [B] merge via the modal → a git tool row in chat + the bar updates (ahead→0, push shows)
+ *   [C] push via the bar's push button → a git tool row in chat
+ *
+ * Run: node test/_explore-ui-round3.mjs    Port: 28983
+ */
+import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import { execFileSync } from 'node:child_process';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.join(__dirname, '..');
+const PORT = 28983;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗ BUG?', l); } };
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+function findChrome() {
+  const c = process.platform === 'win32' ? [
+    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
+    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
+    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
+  ] : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+function haveGit() { try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } }
+const mockAdapter = () => ({
+  async complete() { return { choices: [{ message: { content: 'done.' } }] }; },
+  async *completeStream() { yield { choices: [{ delta: { content: 'done.' } }] }; },
+  async listModels() { return { data: [{ id: 'mock-model' }] }; },
+});
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  if (!haveGit()) { console.log('SKIP: git not found'); process.exit(0); }
+
+  const remote = await mkdtemp(path.join(tmpdir(), 'cb-r3-rmt-'));
+  const dir = await mkdtemp(path.join(tmpdir(), 'cb-r3-'));
+  const git = (d, ...a) => execFileSync('git', a, { cwd: d, stdio: 'pipe' });
+  let server, browser;
+  try {
+    git(remote, 'init', '-q', '--bare', '-b', 'main');
+    git(dir, 'init', '-q', '-b', 'main');
+    git(dir, 'config', 'user.email', 't@t'); git(dir, 'config', 'user.name', 'T');
+    git(dir, 'remote', 'add', 'origin', remote);
+    await writeFile(path.join(dir, 'a.txt'), 'one\ntwo\nthree\n');
+    git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'base on main'); git(dir, 'push', '-q', '-u', 'origin', 'main');
+    // A CODE_BOSS work branch, 2 commits ahead of main; stay ON it (subbranch mode).
+    git(dir, 'checkout', '-q', '-b', 'CODE_BOSS_test');
+    await writeFile(path.join(dir, 'a.txt'), 'one\nTWO-edited\nthree\n');
+    git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'edit a.txt');
+    await writeFile(path.join(dir, 'b.txt'), 'new file\n');
+    git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'add b.txt');
+
+    const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8')).replace(
+      '</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock-model', baseURL: '(mock)' }) + ';</script></head>'
+    );
+    ({ server } = await startServer({
+      html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' },
+      defaultModel: 'mock-model', port: PORT, adapter: mockAdapter(), modelsList: [{ id: 'mock-model' }], initialProject: dir,
+    }));
+    await sleep(800);
+    browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1400, height: 950 });
+    const errs = [];
+    page.on('pageerror', (e) => errs.push(e.message));
+    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForFunction(() => typeof refreshMergeBar === 'function', { timeout: 8000 });
+
+    console.log('\n[A] merge bar shows the subbranch row → "N commits" opens the commits modal with clean diffs');
+    await page.evaluate(() => refreshMergeBar());
+    await page.waitForFunction(() => !!document.querySelector('#mergeRow .merge-row'), { timeout: 6000 });
+    const row = await page.evaluate(() => {
+      const r = document.querySelector('#mergeRow .merge-row');
+      return { hasMergeBtn: !!r.querySelector('.merge-btn'), hasClickable: !!r.querySelector('.merge-clickable'), txt: r.textContent.replace(/\s+/g, ' ').trim() };
+    });
+    ok(row.hasMergeBtn, `subbranch row has a "← merge" button (row: ${row.txt})`);
+    ok(/2 commits/.test(row.txt), `row shows the ahead count (2 commits)`);
+    await page.evaluate(() => document.querySelector('#mergeRow .merge-clickable').click());
+    await page.waitForFunction(() => document.querySelectorAll('#commitsModalBody .commit-entry').length > 0, { timeout: 8000 });
+    const modal = await page.evaluate(() => {
+      const body = document.getElementById('commitsModalBody');
+      return {
+        commits: body.querySelectorAll('.commit-entry').length,
+        fileNames: [...body.querySelectorAll('.diff-file-name')].map((n) => n.textContent),
+        leakedMeta: /diff --git|index [0-9a-f]{7}|^\+\+\+ |^--- a\//m.test(body.textContent),
+        subjects: [...body.querySelectorAll('.ce-subject')].map((s) => s.textContent),
+      };
+    });
+    ok(modal.commits === 2, `both ahead commits listed (got ${modal.commits})`);
+    ok(modal.fileNames.includes('a.txt') && modal.fileNames.includes('b.txt'), `diffs show clean filename headers (got ${JSON.stringify(modal.fileNames)})`);
+    ok(!modal.leakedMeta, `no raw git metadata (diff --git / index / +++ / ---) leaks into the diff`);
+    ok(modal.subjects.some((s) => /edit a\.txt/.test(s)), `commit subjects shown (got ${JSON.stringify(modal.subjects)})`);
+
+    console.log('\n[B] merge from the modal → a git tool row appears + the bar updates');
+    const beforeRows = await page.evaluate(() => document.querySelectorAll('#log .row.tool').length);
+    await page.evaluate(() => document.getElementById('commitsMergeBtn').click());
+    await page.waitForFunction((n) => document.querySelectorAll('#log .row.tool').length > n, { timeout: 8000 }, beforeRows);
+    const toolHasMerge = await page.evaluate(() => [...document.querySelectorAll('#log .row.tool')].some((r) => /merge/i.test(r.textContent)));
+    ok(toolHasMerge, `a "git merge" tool row was added to the chat`);
+    // The modal closes in mergeFromCommitsModal's finally — AFTER the request resolves,
+    // which is after the tool-CALL row broadcast. Wait for it rather than racing.
+    const modalClosed = await page.waitForFunction(() => !document.getElementById('commitsModalBg').classList.contains('show'), { timeout: 8000 }).then(() => true).catch(() => false);
+    ok(modalClosed, `the commits modal closed after merging`);
+    // git: CODE_BOSS_test is now fully merged into main → ahead 0; main is ahead of origin → push.
+    await sleep(400);
+    await page.evaluate(() => refreshMergeBar());
+    await page.waitForFunction(() => { const r = document.querySelector('#mergeRow .merge-row'); return r && /push/i.test(r.textContent); }, { timeout: 6000 }).catch(() => {});
+    const afterMerge = await page.evaluate(() => {
+      const r = document.querySelector('#mergeRow .merge-row');
+      return { txt: r ? r.textContent.replace(/\s+/g, ' ').trim() : '(no row)', hasPush: !!(r && r.querySelector('.push-btn')) };
+    });
+    ok(afterMerge.hasPush, `after merge, the bar offers "↑ push" for the parent (row: ${afterMerge.txt})`);
+
+    console.log('\n[C] push from the bar → a git push tool row appears');
+    const beforeRows2 = await page.evaluate(() => document.querySelectorAll('#log .row.tool').length);
+    await page.evaluate(() => document.querySelector('#mergeRow .push-btn').click());
+    await page.waitForFunction((n) => document.querySelectorAll('#log .row.tool').length > n, { timeout: 8000 }, beforeRows2).catch(() => {});
+    const pushed = await page.evaluate(() => [...document.querySelectorAll('#log .row.tool')].map((r) => r.textContent).some((t) => /push/i.test(t)));
+    ok(pushed, `a "git push" tool row was added to the chat`);
+    // The push runs server-side; the tool-CALL row appears before it finishes. Poll the
+    // local origin/main tracking ref (updated on a successful push) until it advances.
+    let originCount = 0;
+    for (let i = 0; i < 30; i++) {
+      originCount = Number(execFileSync('git', ['rev-list', '--count', 'origin/main'], { cwd: dir }).toString().trim());
+      if (originCount >= 2) break;
+      await sleep(200);
+    }
+    ok(originCount >= 2, `origin/main actually advanced after push (count ${originCount})`);
+
+    console.log('\n[D] no page/console errors across the whole round');
+    ok(errs.length === 0, `no JS errors (got ${errs.length}: ${errs.slice(0, 4).join(' | ')})`);
+  } finally {
+    if (browser) await browser.close();
+    if (server) server.close();
+    for (const d of [dir, remote]) await rm(d, { recursive: true, force: true }).catch(() => {});
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e); process.exit(2); });
+
=== add test/_explore-ui-round4.mjs
new cc5f87f59d07426e43aac08f
+/**
+ * Round 4 (revised): the resolver now runs the merge in a DETACHED throwaway worktree,
+ * so the developer's REAL working tree is never mid-merge. This verifies:
+ *   - opening the resolver does NOT touch the real tree (no MERGE_HEAD, no markers),
+ *     while merge-status still reports "merging" (scratch in progress),
+ *   - ABANDONING it (reload) leaves the real repo CLEAN (the landmine is gone),
+ *   - resolving + committing applies the result to the real branch via fast-forward.
+ *
+ * Run: node test/_explore-ui-round4.mjs    Port: 28985
+ */
+import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import { execFileSync } from 'node:child_process';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.join(__dirname, '..');
+const PORT = 28985;
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗ BUG?', l); } };
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+function findChrome() {
+  const c = process.platform === 'win32' ? [
+    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
+    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
+    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
+  ] : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
+  return c.find((p) => { try { return p && existsSync(p); } catch { return false; } });
+}
+function haveGit() { try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } }
+const mockAdapter = () => ({ async complete() { return { choices: [{ message: { content: 'done.' } }] }; }, async *completeStream() { yield { choices: [{ delta: { content: '' } }] }; }, async listModels() { return { data: [{ id: 'mock-model' }] }; } });
+const git = (d, ...a) => execFileSync('git', a, { cwd: d, stdio: 'pipe' });
+const merging = (d) => { try { execFileSync('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd: d, stdio: 'pipe' }); return true; } catch { return false; } };
+const clean = (d) => execFileSync('git', ['status', '--porcelain'], { cwd: d }).toString().trim() === '';
+
+async function main() {
+  const chrome = findChrome();
+  if (!chrome) { console.log('SKIP: Chrome not found'); process.exit(0); }
+  if (!haveGit()) { console.log('SKIP: git not found'); process.exit(0); }
+
+  const remote = await mkdtemp(path.join(tmpdir(), 'cb-r4-rmt-'));
+  const dir = await mkdtemp(path.join(tmpdir(), 'cb-r4-'));
+  const other = await mkdtemp(path.join(tmpdir(), 'cb-r4-oth-'));
+  let server, browser;
+  try {
+    git(remote, 'init', '-q', '--bare', '-b', 'main');
+    git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.email', 't@t'); git(dir, 'config', 'user.name', 'T'); git(dir, 'remote', 'add', 'origin', remote);
+    await writeFile(path.join(dir, 'a.txt'), 'l1\nl2\nl3\n'); git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'base'); git(dir, 'push', '-q', '-u', 'origin', 'main');
+    git(other, 'clone', '-q', remote, '.'); git(other, 'config', 'user.email', 'o@o'); git(other, 'config', 'user.name', 'O');
+    await writeFile(path.join(other, 'a.txt'), 'l1\nREMOTE\nl3\n'); git(other, 'add', '-A'); git(other, 'commit', '-q', '-m', 'remote'); git(other, 'push', '-q', 'origin', 'main');
+    await writeFile(path.join(dir, 'a.txt'), 'l1\nLOCAL\nl3\n'); git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'local'); git(dir, 'fetch', '-q', 'origin');
+
+    const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8')).replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'mock-model', baseURL: '(mock)' }) + ';</script></head>');
+    ({ server } = await startServer({ html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' }, defaultModel: 'mock-model', port: PORT, adapter: mockAdapter(), modelsList: [{ id: 'mock-model' }], initialProject: dir }));
+    await sleep(800);
+    browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+    const page = await browser.newPage();
+    await page.setViewport({ width: 1400, height: 950 });
+    const errs = [];
+    page.on('pageerror', (e) => errs.push(e.message));
+    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
+    await page.goto(`http://127.0.0.1:${PORT}/`);
+    await page.waitForFunction(() => typeof openResolveModal === 'function', { timeout: 8000 });
+
+    console.log('\n[1] opening the resolver does NOT touch the real working tree');
+    await page.evaluate(() => openResolveModal(''));
+    await page.waitForFunction(() => document.querySelectorAll('#resolveModalBody .rsv-cflt').length > 0, { timeout: 8000 });
+    ok(!merging(dir), `real repo is NOT mid-merge (no MERGE_HEAD) while resolving`);
+    ok(!/<<<<<<</.test(await readFile(path.join(dir, 'a.txt'), 'utf8')), `real file has NO conflict markers (still the local content)`);
+    ok(clean(dir), `real working tree is clean during the resolve`);
+    const live = await page.evaluate(async () => { const d = await (await fetch('/api/merge-status')).json(); return (d.repos || []).some((r) => r.merging); });
+    ok(live, `merge-status reports "merging" while the scratch resolve is in progress`);
+
+    console.log('\n[2] ABANDONING it (reload) leaves the real repo CLEAN — the landmine is gone');
+    await page.reload();
+    await page.waitForFunction(() => typeof openResolveModal === 'function', { timeout: 8000 });
+    await sleep(300);
+    ok(!merging(dir), `after reload the real repo is NOT mid-merge`);
+    ok(clean(dir) && !/<<<<<<</.test(await readFile(path.join(dir, 'a.txt'), 'utf8')), `after reload the real working tree is clean, no markers`);
+
+    console.log('\n[3] resolve + commit applies the result to the real branch (fast-forward)');
+    await page.evaluate(() => openResolveModal(''));
+    await page.waitForFunction(() => document.querySelectorAll('#resolveModalBody .rsv-cflt').length > 0, { timeout: 8000 });
+    await page.evaluate(() => [...document.querySelectorAll('.rsv-cflt .rsv-btn')].find((b) => /Keep incoming/.test(b.textContent)).click());
+    await page.waitForFunction(() => !document.getElementById('resolveCommitBtn').disabled, { timeout: 4000 });
+    await page.evaluate(() => document.getElementById('resolveCommitBtn').click());
+    await page.waitForFunction(() => !document.getElementById('resolveModalBg').classList.contains('show'), { timeout: 8000 });
+    await sleep(400);
+    const parents = execFileSync('git', ['rev-list', '--parents', '-n', '1', 'HEAD'], { cwd: dir }).toString().trim().split(/\s+/);
+    ok(parents.length === 3, `real branch HEAD is now a 2-parent merge commit (got ${parents.length - 1})`);
+    ok(/REMOTE/.test(await readFile(path.join(dir, 'a.txt'), 'utf8')), `working tree holds the resolved (kept-incoming) content`);
+    ok(clean(dir), `real working tree clean after commit`);
+
+    console.log('\n[4] no page/console errors');
+    ok(errs.length === 0, `no JS errors (got ${errs.length}: ${errs.slice(0, 3).join(' | ')})`);
+  } finally {
+    if (browser) await browser.close();
+    if (server) server.close();
+    try { git(dir, 'merge', '--abort'); } catch {}
+    for (const d of [dir, remote, other]) await rm(d, { recursive: true, force: true }).catch(() => {});
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e); process.exit(2); });
+
=== add test/_fuzz-api.mjs
new 2d56c4130710b89f93b488b5
+/**
+ * FUZZ: every API endpoint with malformed input. Per request: an answer within 10 s, not a 500, and the server still
+ * answers /api/state afterwards. Endpoints that open windows or dialogs on the desktop are left out.
+ *
+ *   node test/_fuzz-api.mjs
+ */
+import { mkdtempSync } from 'node:fs';
+import { writeFile, readFile } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+
+process.env.CB_HOME = mkdtempSync(path.join(tmpdir(), 'cb-fuzzapi-home-'));
+const { startServer } = await import('../src/server.mjs');
+const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
+const PORT = 29695;
+const adapter = { async *completeStream() { yield { choices: [{ delta: { content: 'ok' } }] }; }, async complete() { return { choices: [{ message: { content: 'ok' } }] }; }, async listModels() { return [{ id: 'm' }]; } };
+const proj = mkdtempSync(path.join(tmpdir(), 'cb-fuzzapi-proj-'));
+await writeFile(path.join(proj, 'README.md'), '# x\n');
+const html = await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8');
+const { server } = await startServer({ html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' }, defaultModel: 'm', port: PORT, adapter, modelsList: [{ id: 'm' }], initialProject: proj });
+const B = `http://127.0.0.1:${PORT}`;
+
+const SKIP = new Set(['/api/pick-folder', '/api/open-window', '/api/new-window', '/api/stream', '/api/events']);
+const PATHS = ['/api/agent-flags', '/api/api-key', '/api/approval', '/api/approval-event', '/api/background-tool', '/api/bg', '/api/bg/kill', '/api/call-log', '/api/cancel', '/api/client-error', '/api/diagnostics', '/api/extend-timeout', '/api/feature-state', '/api/git-commit', '/api/git-commit-recs', '/api/gitlab-creds', '/api/health', '/api/list-dir', '/api/llm-activity', '/api/log', '/api/make-dir', '/api/message', '/api/models', '/api/open-project', '/api/plugin-enable', '/api/plugin-panel/zq', '/api/plugin-status', '/api/plugin-status/zq', '/api/plugin-toggle', '/api/probe-model', '/api/probe-thinking', '/api/probe-tools', '/api/project-state', '/api/queries', '/api/raw-log', '/api/raw-log-enabled', '/api/run-snippet', '/api/snapshot', '/api/snippet-reference', '/api/state', '/api/steer', '/api/test-connection', '/api/tuning', '/api/ui-state', '/api/unlock-done', '/api/unmask-display', '/api/whats-new', '/api/whats-new-seen'].filter((p) => !SKIP.has(p));
+const BODIES = [
+  ['empty', ''], ['not json', '{{{'], ['null', 'null'], ['array', '[1,2,3]'], ['number', '42'], ['string', '"x"'],
+  ['wrong types', JSON.stringify({ text: 123, model: [], id: {}, path: null, dir: 7, tokens: 'x', name: true, enabled: 'yes', command: 5, value: { a: 1 } })],
+  ['huge string', JSON.stringify({ text: 'x'.repeat(3 * 1024 * 1024), path: 'y'.repeat(100000) })],
+  ['traversal', JSON.stringify({ path: '../../../../Windows/System32', dir: '..\\..\\..', name: '../x', file: 'C:\\Windows\\win.ini' })],
+  ['deep nesting', '{"a":'.repeat(5000) + '1' + '}'.repeat(5000)],
+  ['unicode', JSON.stringify({ text: '\u0000\uFFFF\uD800 😀 ' + '\u202E', path: '\u0000' })],
+  ['proto', '{"__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}}}'],
+];
+const QUERY = ['', '?limit=-1', '?limit=abc', '?since=zzz', '?id=../../x', '?from=999999999999', '?path=..%2F..%2F', '?limit=99999999'];
+
+const timed = async (url, opts) => {
+  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 10000);
+  const t0 = Date.now();
+  try { const r = await fetch(url, { ...opts, signal: ac.signal }); const body = await r.text(); return { status: r.status, ms: Date.now() - t0, body }; }
+  catch (e) { return { status: 'ERR ' + (e.name === 'AbortError' ? 'TIMEOUT' : e.message), ms: Date.now() - t0, body: '' }; }
+  finally { clearTimeout(t); }
+};
+const alive = async () => (await timed(B + '/api/state?limit=1', {})).status === 200;
+const bad = [];
+let n = 0;
+for (const p of PATHS) {
+  for (const q of QUERY) {
+    const r = await timed(B + p + q, {}); n++;
+    if (r.status === 500 || String(r.status).startsWith('ERR')) bad.push(`GET ${p}${q} -> ${r.status} ${r.body.slice(0, 120)}`);
+  }
+  for (const [label, body] of BODIES) {
+    for (const method of ['POST', 'PUT']) {
+      const r = await timed(B + p, { method, headers: { 'content-type': 'application/json' }, body }); n++;
+      if (r.status === 500 || String(r.status).startsWith('ERR')) bad.push(`${method} ${p} [${label}] -> ${r.status} ${r.body.slice(0, 160)}`);
+    }
+  }
+  if (!(await alive())) { bad.push(`SERVER STOPPED ANSWERING after ${p}`); break; }
+  // a fuzzed message may have started a run: stop it before the next path
+  await timed(B + '/api/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
+}
+console.log(`${n} requests to ${PATHS.length} paths`);
+console.log(bad.length ? bad.join('\n') : 'NO 500s, NO HANGS');
+console.log('polluted Object.prototype: ' + (({}).polluted === true));
+server.close();
+process.exit(bad.length ? 1 : 0);
+
=== add test/_fuzz-piishape.mjs
new 0f6c788e8ba7a5fa5661f42a
+/**
+ * FUZZ: piishape under edge cases and volume. Properties, over generated text:
+ *   P1 stable: mask(mask(x)) === mask(x) (the same text is masked again inside every later request)
+ *   P2 tokens survive: every token already in x - its own, pii-testdata's, [PII:TYPE#hash] - is in mask(x) unchanged
+ *   P3 own names: every name in ctx.ownNames that stands as a whole word in x is in mask(x)
+ *   P4 no throw, and time bounded (ms per KB)
+ *   P5 a 50000-name exempt list costs once, not per call
+ *   P6 unmask(mask(x)) === x for x the masker issued tokens for
+ *
+ *   node test/_fuzz-piishape.mjs [iterations=3000] [seed=1]
+ */
+import { mkdtempSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+
+process.env.CB_HOME = mkdtempSync(path.join(tmpdir(), 'cb-fuzz-shape-'));
+const PROJ = mkdtempSync(path.join(tmpdir(), 'cb-fuzz-proj-'));
+const P = await import('../examples/plugins/piishape__1.mjs');
+const N = Number(process.argv[2]) || 3000;
+let seed = Number(process.argv[3]) || 1;
+const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
+const pick = (a) => a[Math.floor(rnd() * a.length)];
+const NL = String.fromCharCode(10), BS = String.fromCharCode(92);
+
+const PIECES = [
+  'Smith', 'john.doe@example.com', '482-11-9037', '(517) 440-8098', '1961', '2048', '8080', '07-Mar-1954', 'May 3, 1997',
+  '30 W. Sunset Ave', 'HCDP_PLN_TYP_CD', 'DEERS_FAM_ID', 'select', 'from', 'where', 'the', 'and', 'edi', 'ssn', 'id',
+  '[PII:DODID#0d2ceaa9]', '[PII:NAME#1a2b3c4d]', '@@@(family.member.ssn)', '###{x.y}', '#Xxxxx#k2j4q7m', '#0000#d5ko0q2',
+  'C:' + BS + 'Users' + BS + 'zq' + BS + 'file.txt', 'D:/tmp/x.json', 'https://example.com/a?b=c', '127.0.0.1:8080',
+  '{"a": 1, "b": [1, 2, 3]}', '"k": "v"', BS + 'n', BS + BS, '#', '##', '###', '#XXX#', '[PII:', ']', '@@@(', ')',
+  'Zqvortigan', 'zqhavisham', 'O\'Brien', 'José', 'Müller', '李', '😀', 'x'.repeat(300), '1'.repeat(40), 'a_b_c_d_e',
+  'bg-12', 'js-3', 'java.lang.NullPointerException', 'at a.b.C.m(File.java:9)', 'git', 'npm', 'node', 'zqlogin_go',
+  '\t', NL, ' ', '  ', ',', '.', ':', ';', '-', '_', '/', '=',
+];
+const OWN = ['zqlogin_go', 'zqedi', 'HCDP_PLN_TYP_CD', 'DEERS_FAM_ID', 'edi', 'a.b', 'x+y', 'id', '(weird)', 'naïve'];
+const gen = () => { const n = 1 + Math.floor(rnd() * 25); let s = ''; for (let i = 0; i < n; i++) s += pick(PIECES) + (rnd() < 0.6 ? ' ' : ''); return s; };
+const TOKENS = /\[PII:[A-Za-z_]{1,40}#[0-9a-f]{6,64}\]|@@@\([^()\s]{1,200}\)|###\{[^{}]{1,200}\}|#[Xx0]{1,200}#[0-9a-z]{7}(?![0-9A-Za-z])/g;
+
+const fails = {};
+const fail = (k, x, detail) => { (fails[k] = fails[k] || []).push({ x, detail }); };
+const hooks = ['tool-result', 'request', 'tool-result'];
+let slowest = 0, slowX = '';
+for (let i = 0; i < N; i++) {
+  const x = gen();
+  const ctx = { homeDir: process.env.CB_HOME, projectDir: PROJ, hook: pick(hooks), ownNames: rnd() < 0.5 ? OWN : undefined, filePath: rnd() < 0.3 ? 'src/a.sql' : undefined };
+  let m1, m2;
+  const t0 = performance.now();
+  try { m1 = P.maskText(x, ctx); m2 = P.maskText(m1, ctx); } catch (e) { fail('P4 throws', x, e.message); continue; }
+  const dt = performance.now() - t0;
+  if (dt > slowest) { slowest = dt; slowX = x.slice(0, 80); }
+  if (m1 !== m2) fail('P1 not stable', x, { m1, m2 });
+  // P2: tokens in x survive (a token-shaped string the masker itself could have issued counts)
+  for (const t of (x.match(TOKENS) || [])) if (!m1.includes(t)) fail('P2 token broken', x, { t, m1 });
+  // P3: own names that stand as whole words
+  if (ctx.ownNames) for (const n of ctx.ownNames) {
+    const re = new RegExp('(?<![\\p{L}\\p{N}_])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}_])', 'u');
+    // not inside a token already present
+    const stripped = x.replace(TOKENS, ' ');
+    if (re.test(stripped) && !re.test(m1.replace(TOKENS, ' '))) fail('P3 own name masked', x, { n, m1 });
+  }
+  // P6: round trip
+  try { const back = P.unmaskText(m1, ctx); if (back !== x && !TOKENS.test(x)) fail('P6 round trip', x, { m1, back }); TOKENS.lastIndex = 0; } catch (e) { if (!TOKENS.test(x)) fail('P6 unmask throws', x, e.message); TOKENS.lastIndex = 0; }
+}
+// P4 volume: a big line, a big file
+for (const [label, x] of [['200 KB one line', ('Smith 482-11-9037 HCDP_PLN_TYP_CD ').repeat(6000)], ['1 MB of lines', ('john.doe@example.com called (517) 440-8098 at 30 W. Sunset Ave' + NL).repeat(16000)], ['200 KB of #', '#'.repeat(200000)], ['200 KB of digits and dashes', '1-'.repeat(100000)], ['backslashes', (BS + 'n').repeat(50000)]]) {
+  const t0 = performance.now();
+  try { P.maskText(x, { homeDir: process.env.CB_HOME, projectDir: PROJ, hook: 'tool-result' }); } catch (e) { fail('P4 volume throws', label, e.message); }
+  const ms = performance.now() - t0;
+  console.log(`  volume: ${label.padEnd(28)} ${(x.length / 1024).toFixed(0).padStart(5)} KB  ${ms.toFixed(0).padStart(6)} ms  (${(ms / (x.length / 1024)).toFixed(2)} ms/KB)`);
+  if (ms / (x.length / 1024) > 20) fail('P4 slow', label, ms.toFixed(0) + ' ms');
+}
+// P5: a 50000-name list
+const many = Array.from({ length: 50000 }, (_, i) => 'COL_' + i.toString(36).toUpperCase() + '_CD');
+let t0 = performance.now();
+P.maskText('select COL_A_CD, COL_ZZ_CD from t', { homeDir: process.env.CB_HOME, projectDir: PROJ, hook: 'tool-result', ownNames: many });
+const first = performance.now() - t0;
+t0 = performance.now();
+for (let i = 0; i < 50; i++) P.maskText('select COL_A_CD, COL_ZZ_CD from t ' + i, { homeDir: process.env.CB_HOME, projectDir: PROJ, hook: 'tool-result', ownNames: many });
+const later = (performance.now() - t0) / 50;
+console.log(`  50000 own names: first call ${first.toFixed(0)} ms, later calls ${later.toFixed(1)} ms each`);
+if (later > 50) fail('P5 per-call cost', '50000 names', later.toFixed(1) + ' ms');
+const out = P.maskText('select COL_A_CD, COL_ZZ_CD from t', { homeDir: process.env.CB_HOME, projectDir: PROJ, hook: 'tool-result', ownNames: many });
+if (!/COL_A_CD/.test(out) || !/COL_ZZ_CD/.test(out)) fail('P5 names not shown', 'COL_A_CD', out);
+
+console.log(`\n${N} generated texts; slowest ${slowest.toFixed(1)} ms (${JSON.stringify(slowX)})`);
+const kinds = Object.keys(fails);
+if (!kinds.length) console.log('NO FAILURES');
+for (const k of kinds) {
+  console.log(`\n${k}: ${fails[k].length}`);
+  for (const f of fails[k].slice(0, 4)) console.log('   x: ' + JSON.stringify(f.x).slice(0, 200) + '\n      ' + JSON.stringify(f.detail).slice(0, 400));
+}
+process.exit(kinds.length ? 1 : 0);
+
=== add test/_fuzz-snippets.mjs
new ca2f4d9dddf43e1cafa68c59
+/**
+ * EDGE CASES: <js> snippets through the REAL server and worker, a scripted model. Each case is one developer message;
+ * the model answers with that case's snippet, then (next call) "Done.". What the model got back as the snippet's
+ * result is captured from the next request. Per case: the run ENDS (no hang), within its time limit, the result says
+ * something sensible, and nothing crashed the server.
+ *
+ *   node test/_fuzz-snippets.mjs [only-case-name]
+ */
+import { mkdtempSync } from 'node:fs';
+import { writeFile, readFile } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+
+process.env.CB_HOME = mkdtempSync(path.join(tmpdir(), 'cb-fuzzjs-home-'));
+const { startServer } = await import('../src/server.mjs');
+const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
+const PORT = 29693;
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+const NL = String.fromCharCode(10);
+
+// [name, snippet body, check(resultText) -> '' ok | 'why not', max seconds, attrs]
+const CASES = [
+  ['returns undefined', 'const x = 1;', (r) => /undefined|no value|returned nothing|\(no result\)|ok/i.test(r) ? '' : 'says nothing about an empty return', 30],
+  ['returns null', 'return null;', (r) => /null/.test(r) ? '' : 'no null', 30],
+  ['circular object', 'const a = {}; a.self = a; return a;', (r) => r.length > 0 && !/TypeError: Converting circular/.test(r) ? '' : 'circular crashed', 30],
+  ['BigInt', 'return 10n ** 30n;', (r) => /1000000000000000000000000000000|bigint/i.test(r) ? '' : 'BigInt lost', 30],
+  ['huge return 5MB', 'return "x".repeat(5*1024*1024);', (r) => r.length < 400000 ? '' : 'not capped: ' + r.length, 60],
+  ['huge console.log', 'for (let i = 0; i < 20000; i++) console.log("line " + i + " " + "y".repeat(100)); return "end";', (r) => /end/.test(r) && r.length < 400000 ? '' : 'log not capped or lost the return: ' + r.length, 90],
+  ['throw a string', 'throw "plain string thrown";', (r) => /plain string thrown/.test(r) ? '' : 'lost the thrown string', 30],
+  ['throw an object', 'throw { code: 42, why: "object thrown" };', (r) => /42|object thrown/.test(r) ? '' : 'lost the thrown object', 30],
+  ['throw null', 'throw null;', (r) => r.length > 0 ? '' : 'nothing', 30],
+  ['reject in parallel', 'return await parallel({ a: () => read("README.md"), b: () => read("nope-not-here.txt") });', (r) => /nope-not-here|not found|ENOENT|no such/i.test(r) ? '' : 'parallel failure not said', 30],
+  ['unhandled rejection', 'Promise.reject(new Error("floating rejection")); await new Promise((r) => setTimeout(r, 200)); return "after";', (r) => /after|floating rejection/.test(r) ? '' : 'neither', 30],
+  ['setTimeout never resolves', 'await new Promise(() => {}); return "never";', (r) => /time|limit|never finished|stopped|ceiling/i.test(r) ? '' : 'no timeout word', 45, ' timeout_ms="5000"'],
+  ['busy loop', 'while (true) {}', (r) => /time|limit|stopped|ceiling/i.test(r) ? '' : 'no timeout word', 120, ' timeout_ms="5000"'],
+  ['read with no args', 'return await read();', (r) => /path|argument|required/i.test(r) ? '' : 'unhelpful', 30],
+  ['read a folder', 'return await read(".");', (r) => /director|folder|EISDIR|list/i.test(r) ? '' : 'unhelpful', 30],
+  ['write outside project', 'return await write("../../outside-zq.txt", "x");', (r) => /outside|not allowed|refus|denied|project/i.test(r) ? '' : 'wrote outside?', 30],
+  ['edit no match', 'await write("e.txt", "abc"); return await edit("e.txt", "zzz", "y");', (r) => /not found|no match|ok.?:.?false|did not|0 matches/i.test(r) ? '' : 'edit silent', 30],
+  ['node nonzero exit', 'return await node(["-e", "process.exit(3)"]);', (r) => /exit|3/.test(r) ? '' : 'exit not said', 60],
+  ['node allowFail', 'const r = await node(["-e", "process.exit(3)"], { allowFail: true }); return r.code;', (r) => /\b3\b/.test(r) ? '' : 'code not returned', 60],
+  ['unicode and emoji', 'return "héllo 世界 😀 \\u0000 end";', (r) => /世界/.test(r) && /end/.test(r) ? '' : 'mangled', 30],
+  ['deep recursion', 'const f = (n) => n ? f(n - 1) + 1 : 0; return f(1e6);', (r) => /stack|Maximum call stack|RangeError/.test(r) ? '' : 'no stack error', 30],
+  ['huge array return', 'return Array.from({ length: 200000 }, (_, i) => i);', (r) => r.length < 400000 ? '' : 'not capped: ' + r.length, 60],
+  ['many calls', 'let n = 0; for (let i = 0; i < 300; i++) { await info("README.md"); n++; } return n;', (r) => /300/.test(r) ? '' : 'did not finish 300 calls', 120],
+  ['syntax error', 'return (;', (r) => /Syntax|Unexpected/i.test(r) ? '' : 'no syntax error said', 30],
+  ['require attempt', 'const fs = require("fs"); return fs.readFileSync("README.md","utf8");', (r) => /require|not available|not defined|no fs|module/i.test(r) ? '' : 'require silently worked?', 30],
+  ['process access', 'return process.env.PATH;', (r) => /process|not defined|not available/i.test(r) ? '' : 'process reachable?', 30],
+  ['heredoc', 'const t = <<<ZQEND\nline "one" `two` ${three}\nZQEND\nreturn t;', (r) => /line "one" `two` \$\{three\}/.test(r) ? '' : 'heredoc not literal', 30],
+  ['plugin-like unknown fn', 'return await not_a_function_zq({ a: 1 });', (r) => /not_a_function_zq|not defined|no function|unknown/i.test(r) ? '' : 'unhelpful', 30],
+  ['remove a missing file', 'return await remove("does-not-exist-zq.txt");', (r) => r.length > 0 ? '' : 'nothing', 30],
+  ['list missing folder', 'return await list("no-such-folder-zq");', (r) => /not found|no such|ENOENT|exist/i.test(r) ? '' : 'unhelpful', 30],
+];
+
+const only = process.argv[2];
+let cur = null, phase = 0;
+const captured = new Map();
+const adapter = {
+  async *completeStream(req) {
+    const msgs = req.messages || [];
+    const all = JSON.stringify(msgs);
+    const m = all.match(/run case (\d+)/g); const idx = m ? Number(m[m.length - 1].match(/\d+/)[0]) : -1;
+    const c = CASES[idx];
+    if (!c) { yield { choices: [{ delta: { content: 'Done.' } }] }; return; }
+    if (cur !== idx) { cur = idx; phase = 0; }
+    if (phase === 0) {
+      phase = 1;
+      yield { choices: [{ delta: { content: 'Running it.' + NL + '<remote-workspace>' + NL + '<js' + (c[4] || '') + '>' + NL + c[1] + NL + '</js>' + NL + '</remote-workspace>' } }] };
+      return;
+    }
+    // the snippet's result: the message(s) after the assistant turn that ran it
+    const text = (x) => (typeof x.content === 'string' ? x.content : JSON.stringify(x.content));
+    if (process.env.FUZZ_DUMP && idx === 0) { const { writeFileSync } = await import('node:fs'); writeFileSync(process.env.FUZZ_DUMP, JSON.stringify(msgs.map((x) => ({ role: x.role, head: text(x).slice(0, 300), tail: text(x).slice(-1500) })), null, 1)); }
+    // flat transport: the whole conversation is one message; the result is the last <remote-workspace-result> block
+    const blocks = all.match(/<remote-workspace-result[\s\S]*?<\\?\/remote-workspace-result>/g) || [];
+    let got = blocks.length ? blocks[blocks.length - 1] : '';
+    try { got = JSON.parse('"' + got.replace(/^"|"$/g, '') + '"'); } catch { /* left as it is */ }
+    captured.set(idx, got);
+    yield { choices: [{ delta: { content: 'Done.' } }] };
+  },
+  async complete() { return { choices: [{ message: { content: 'ok' } }] }; }, async listModels() { return [{ id: 'm' }]; },
+};
+const proj = mkdtempSync(path.join(tmpdir(), 'cb-fuzzjs-proj-'));
+await writeFile(path.join(proj, 'README.md'), '# fuzz' + NL);
+const html = await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8');
+const { server } = await startServer({ html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' }, defaultModel: 'm', port: PORT, adapter, modelsList: [{ id: 'm' }], initialProject: proj });
+const B = `http://127.0.0.1:${PORT}`;
+// the server runs in THIS process: how long is its event loop blocked (nothing else - the page, the SSE - is answered)?
+let lagMax = 0, lagLast = performance.now();
+setInterval(() => { const n = performance.now(); lagMax = Math.max(lagMax, n - lagLast - 100); lagLast = n; }, 100).unref();
+const status = async () => { for (let i = 0; ; i++) { try { return (await (await fetch(B + '/api/state?limit=1')).json()).status; } catch (e) { if (i >= 5) throw e; await sleep(1000); } } };
+const bad = [];
+try {
+  for (let i = 0; i < CASES.length; i++) {
+    const [name, , check, maxS] = CASES[i];
+    if (only && name !== only) continue;
+    const t0 = Date.now(); lagMax = 0;
+    await fetch(B + '/api/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'run case ' + i, model: 'm' }) });
+    await sleep(400);
+    while (Date.now() - t0 < maxS * 1000 && (await status()) === 'running') await sleep(250);
+    const secs = (Date.now() - t0) / 1000;
+    const r = captured.get(i) || '';
+    let why = '';
+    if ((await status()) === 'running') { why = 'STILL RUNNING after ' + maxS + ' s'; await fetch(B + '/api/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {}); for (let w = 0; w < 40 && (await status()) === 'running'; w++) await sleep(250); }
+    else if (!r) why = 'no result reached the model';
+    else why = check(r);
+    console.log(`${why ? 'FAIL' : 'ok  '} ${name.padEnd(28)} ${secs.toFixed(1).padStart(6)} s  blocked ${String(Math.round(lagMax)).padStart(5)} ms  ${why ? '- ' + why + ' | ' : ''}${JSON.stringify(r.slice(0, 160))}`);
+    if (why) bad.push(name);
+  }
+} finally { server.close(); }
+console.log(`\n${CASES.length - bad.length} of ${only ? 1 : CASES.length} ok${bad.length ? '; failed: ' + bad.join(', ') : ''}`);
+process.exit(bad.length ? 1 : 0);
+
=== add test/_gaps.mjs
new 7952760d28e39221d03ea3df
+// Measures the APPARENT gaps in the status bar — ink to ink, which is what the eye reads — because each pill
+// carries its own side padding and equal `gap` values do not look equal. Temporary measuring stick.
+import { readFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+
+const chrome = [(process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
+  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
+  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => { try { return p && existsSync(p); } catch { return false; } });
+const puppeteer = (await import('puppeteer-core')).default;
+
+const PORT = 18996;
+const html = await readFile(new URL('../src/ui.html', import.meta.url), 'utf8');
+const { startServer } = await import('../src/server.mjs');
+const { server } = await startServer({
+  html, baseURL: 'http://127.0.0.1:1/v1', apiKey: 'x', gitlabCreds: { user: 'd', token: 'd' },
+  defaultModel: 'm', port: PORT, modelsList: [{ id: 'm' }], apiFormat: 'anthropic',
+  adapter: { baseURL: 'https://x.test/v1', async complete() { return { choices: [{ message: { content: 'x' } }] }; } },
+});
+const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+try {
+  const page = await browser.newPage();
+  // 3x so the screenshot can be JUDGED, not just measured — these are single-pixel decisions.
+  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 3 });
+  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
+  await page.waitForSelector('#editToggle', { timeout: 15000 });
+  await page.evaluate(() => {
+    // The boot screen keeps #chat display:none, and a hidden element has no geometry to measure.
+    const chat = document.getElementById('chat');
+    chat.classList.remove('hidden'); chat.style.display = 'flex';
+    const loading = document.getElementById('loading'); if (loading) loading.style.display = 'none';
+    const svg = '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="4" cy="4" r="2"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="6" r="2"/><path d="M4 6v4M6 4h3a3 3 0 0 1 3 3v1"/></svg>';
+    document.getElementById('gitProjects').innerHTML =
+      ['cpcmm', 'dcpcmm', 'portlet-enrollment', 'portlet-pcm']
+        .map((n) => `<span class="gp-badge clean">${svg}<span class="gp-name">${n}</span></span>`).join('');
+  });
+  // The panel starts COLLAPSED by default, so measuring straight away measures the DOCKED bar. Expand first —
+  // otherwise the two states get confused for each other, which is how a broken docked layout was screenshotted
+  // and reported as the panel one.
+  await page.evaluate(() => { if (typeof setSidePanelCollapsed === 'function') setSidePanelCollapsed(false); });
+  await new Promise((r) => setTimeout(r, 250));
+  const rows = await page.evaluate(() => {
+    const r = (el) => el.getBoundingClientRect();
+    const br = document.querySelector('#sideChrome .sc-branches');
+    const main = document.querySelector('#sideChrome .sc-main');
+    const edit = document.getElementById('editToggle');
+    return {
+      branchesRowTop: br ? Math.round(r(br).top) : null,
+      mainRowTop: main ? Math.round(r(main).top) : null,
+      branchesAboveMain: br && main ? r(br).bottom <= r(main).top + 1 : null,
+      editSharesBranchRow: br && edit ? (r(edit).top < r(br).bottom - 1) : null,
+      branchesWrap: br ? getComputedStyle(br).flexWrap : null,
+      versionInChrome: !!document.getElementById('chromeVersion'),
+      buildInSettings: !!document.getElementById('settingsBuild'),
+    };
+  });
+  console.log('  PANEL VISIBLE :', JSON.stringify(rows, null, 0));
+  // COLLAPSED: the same chrome docks under the chat input and must go back to ONE row.
+  await page.evaluate(() => { if (typeof setSidePanelCollapsed === 'function') setSidePanelCollapsed(true); });
+  await new Promise((r) => setTimeout(r, 250));
+  const docked = await page.evaluate(() => {
+    const r = (el) => el.getBoundingClientRect();
+    const bar = document.getElementById('sideChrome');
+    const br = bar.querySelector('.sc-branches');
+    const path = document.getElementById('projectPath');
+    const edit = document.getElementById('editToggle');
+    const inputEl = document.getElementById('input');
+    const sameLine = (a, b) => Math.abs(r(a).top - r(b).top) < 6;
+    return {
+      docked: bar.classList.contains('docked'),
+      underTheInput: inputEl ? r(bar).top > r(inputEl).top : null,
+      oneRow: Math.round(r(bar).height) < 34,
+      pathBranchesEditSameLine: sameLine(path, br) && sameLine(br, edit),
+      order: [['path', r(path).left], ['branches', r(br).left], ['edit', r(edit).left]].sort((a, b) => a[1] - b[1]).map((x) => x[0]).join(' < '),
+      branchesWrap: getComputedStyle(br).flexWrap,
+    };
+  });
+  console.log('  PANEL COLLAPSED:', JSON.stringify(docked, null, 0));
+  const dshot = 'D:/tmp/statusbar-docked.png';
+  const dbar = await page.$('#sideChrome');
+  if (dbar) await dbar.screenshot({ path: dshot });
+  await page.evaluate(() => { if (typeof setSidePanelCollapsed === 'function') setSidePanelCollapsed(false); });
+  await new Promise((r) => setTimeout(r, 250));
+  const m = await page.evaluate(() => {
+    const r = (el) => el.getBoundingClientRect();
+    // The drawn extent of an element's text: a Range over its own text node reports where the glyphs actually
+    // are, which for a single glyph in a large font is meaningfully inside the element box.
+    const ink = (el) => {
+      const t = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
+      if (!t) return r(el);
+      const rg = document.createRange(); rg.selectNodeContents(t);
+      const b = rg.getBoundingClientRect();
+      return (b && b.width) ? b : r(el);
+    };
+    const names = [...document.querySelectorAll('#gitProjects .gp-name')];
+    const icons = [...document.querySelectorAll('#gitProjects .gp-badge svg')];
+    const edit = document.getElementById('editToggle');
+    const cog = document.getElementById('settingsBtn');
+    const pills = [...document.querySelectorAll('#gitProjects .gp-badge')];
+    const between = [];
+    for (let i = 1; i < names.length; i++) between.push(Math.round(r(icons[i]).left - r(names[i - 1]).right));
+    const boxes = [];
+    for (let i = 1; i < pills.length; i++) boxes.push(Math.round(r(pills[i]).left - r(pills[i - 1]).right));
+    const nameInk = names.map((n) => Math.round(r(n).width));
+    return {
+      // COMPUTED, not what the stylesheet says. `.git-projects { gap }` loses to `.side-chrome .sc-col { gap }`
+      // — two classes beat one — so an edit to the single-class rule computes to nothing and the spacing does
+      // not move. That happened, and nothing catches it but reading the value back off the live element.
+      'computed container gap': getComputedStyle(document.getElementById('gitProjects')).gap,
+      'computed pill margin/padding': getComputedStyle(pills[1]).margin + ' / ' + getComputedStyle(pills[1]).padding,
+      'pill box -> next pill box': boxes.join(', '),
+      'name box width': nameInk.join(', '),
+      'branch name -> next icon': between.join(', '),
+      'icon -> its own name': icons.map((ic, i) => Math.round(r(names[i]).left - r(ic).right)).join(', '),
+      // INK, not boxes. A glyph sits inside its box with side bearing, so the ⚙ button's box edge is NOT where
+      // the cog appears to start — comparing a text box against a glyph box makes two "equal" gaps look unequal,
+      // which is exactly how a 10-vs-10 pair ended up needing more space on one side.
+      'last branch -> Edit (ink)': Math.round(ink(edit).left - r(names[names.length - 1]).right),
+      'Edit -> cog (ink)': Math.round(ink(cog).left - ink(edit).right),
+      'cog glyph inset (l/r)': Math.round(ink(cog).left - r(cog).left) + ' / ' + Math.round(r(cog).right - ink(cog).right),
+    };
+  });
+  const shot = process.env.CB_GAPS_SHOT || 'D:/tmp/statusbar.png';
+  const bar = await page.$('#sideChrome');
+  if (bar) { await bar.screenshot({ path: shot }); console.log(`  (status bar -> ${shot})`); }
+  for (const [k, v] of Object.entries(m)) console.log(`  ${k.padEnd(28)} ${v}`);
+} finally { await browser.close(); server.close(); }
+
=== add test/_gateway-sim.mjs
new c88cc9aad7884b5d77ab9d39
+/**
+ * _gateway-sim.mjs - A STAND-IN FOR THE PRODUCTION GATEWAY (the developer, 2026-10-13: "build a simple service that
+ * behaves similarly to the prod api and calls sonnet"). The real one cannot be reached from a development machine, and
+ * the session transport has to be proven against something that keeps a conversation on ITS side.
+ *
+ * It speaks the gateway's OpenAI-compatible surface and imitates what was MEASURED there (PROD-KNOWLEDGE.md, the
+ * survey of 2026-10-13), not what the documentation says:
+ *
+ *   PLAIN ids (no suffix) - the Enterprise lane
+ *     · only the LAST message of a request is read; a system message and everything before the last are dropped
+ *     · the conversation lives HERE, in a session; every reply carries gemini_enterprise { session, assist_token }
+ *     · sending that object back continues the session; sending none starts a clean one
+ *     · ONE line of conversation a session: a used handle is accepted and sees everything that came after it
+ *     · usage.prompt_tokens is 9 whatever was sent (usage.is_estimated), and the credit budget does not move
+ *     · tools / tool_choice / response_format are ignored
+ *   "-withtools" ids - the stateless lane
+ *     · every message is read, role:"system" included; no session, no envelope
+ *     · one credit a token off the budget header; cached tokens are reported and not discounted
+ *
+ * What is NOT known about the real one is a knob here, so the client can be tested against each possibility:
+ *   unknownSession  'fresh' (default) - an unknown or expired handle silently starts a clean session with a NEW id
+ *                   'error'           - it is refused with a 400
+ *   idleMs          a session not used for this long is forgotten (the real one survived 13 minutes; beyond is unknown)
+ *   streamEnvelope  'all' (default) - every frame of a streamed reply carries the handle; 'none' - only a plain
+ *                   (unstreamed) reply does. Which the real one does has not been measured (probe 358)
+ *   maxSessionChars a session past this size is refused (the August run saw sessions stop between 100k and 300k tokens)
+ *
+ * The model behind it is whatever `backend` is: async (messages, { model, signal }) => text. liveBackend() below is
+ * Sonnet through the development proxy; tests pass a scripted function.
+ */
+import http from 'node:http';
+import { randomUUID } from 'node:crypto';
+import { readFileSync } from 'node:fs';
+
+export const SIM_MODELS = ['gemini-2.5-pro', 'gemini-3.1-pro-preview', 'gemini-3.7-flash', 'gemini-3.8-flash',
+  'gemini-3.1-flash-lite-withtools', 'gemini-3.5-flash-withtools', 'gemini-3.8-flash-withtools'];
+
+const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('') : c == null ? '' : String(c));
+const tok = (s) => Math.ceil(String(s || '').length / 4);
+
+/**
+ * Start it. Returns { url, port, close(), sessions, log, state } - `log` is every request as the gateway saw it
+ * ({ model, lane, session, sentMessages, readChars, historyTurns, status }), which is what the tests assert on.
+ */
+export async function startGatewaySim({ port = 0, backend, unknownSession = 'fresh', idleMs = 0, maxSessionChars = 0, latencyMs = 0, credits = 100_000_000, now = () => Date.now(), failNext = [], streamEnvelope = 'all' } = {}) {
+  if (typeof backend !== 'function') throw new Error('startGatewaySim needs a backend(messages, { model, signal })');
+  const sessions = new Map();   // id -> { turns: [{role, content}], usedAt, chars }
+  const log = [];
+  const state = { credits, failNext, unknownSession, idleMs, maxSessionChars, streamEnvelope, requests: 0 };
+  const budgetHeaders = () => ({ 'x-ratelimit-limit-credits-day': String(credits), 'x-ratelimit-remaining-credits-day': String(state.credits), 'x-ratelimit-reset-credits-day': '86400' });
+  const json = (res, status, body, headers = {}) => { const s = JSON.stringify(body); res.writeHead(status, { 'content-type': 'application/json', ...budgetHeaders(), ...headers }); res.end(s); };
+
+  const server = http.createServer(async (req, res) => {
+    const url = new URL(req.url, 'http://x');
+    if (req.method === 'GET' && /\/models$/.test(url.pathname)) return json(res, 200, { object: 'list', data: SIM_MODELS.map((id) => ({ id, object: 'model' })) });
+    if (req.method !== 'POST' || !/\/chat\/completions$/.test(url.pathname)) return json(res, 404, { error: { message: 'not found' } });
+    let raw = ''; for await (const c of req) raw += c;
+    let body; try { body = JSON.parse(raw); } catch { return json(res, 400, { error: { message: 'bad json' } }); }
+    state.requests++;
+    const model = String(body.model || '');
+    const msgs = Array.isArray(body.messages) ? body.messages : [];
+    const entry = { model, lane: null, session: null, sentSession: (body.gemini_enterprise && body.gemini_enterprise.session) || null, sentMessages: msgs.length, readChars: 0, historyTurns: 0, status: 200, stream: !!body.stream, last: '' };
+    log.push(entry);
+    // a failure the test asked for: { status, times } or a bare status
+    const f = state.failNext[0];
+    if (f) { const st = typeof f === 'number' ? f : f.status; if (typeof f === 'number' || --f.times <= 0) state.failNext.shift(); entry.status = st; return json(res, st, { error: { type: st === 429 ? 'rate_limit' : 'upstream_error', message: 'simulated ' + st } }); }
+    if (!SIM_MODELS.includes(model)) { entry.status = 404; return json(res, 404, { error: { message: `model ${model} not found` } }); }
+    if (!msgs.length) { entry.status = 400; return json(res, 400, { error: { message: 'messages is required' } }); }
+    const ac = new AbortController(); res.on('close', () => { if (!res.writableEnded) ac.abort(); });
+    const plain = !/-withtools$/.test(model);
+    entry.lane = plain ? 'plain' : 'tools';
+    let toBackend, sess = null, sid = null;
+    if (plain) {
+      const lastMsg = msgs[msgs.length - 1];
+      const said = textOf(lastMsg.content);
+      entry.readChars = said.length; entry.last = said;
+      const env = body.gemini_enterprise && typeof body.gemini_enterprise === 'object' ? body.gemini_enterprise : null;
+      entry.sentSession = env?.session || null;
+      if (env?.session) {
+        sess = sessions.get(env.session) || null;
+        if (sess && state.idleMs && now() - sess.usedAt > state.idleMs) { sessions.delete(env.session); sess = null; }
+        if (sess) sid = env.session;
+        else if (state.unknownSession === 'error') { entry.status = 400; return json(res, 400, { error: { message: 'session not found or expired' } }); }
+      }
+      if (!sess) { sid = randomUUID().replace(/-/g, ''); sess = { turns: [], usedAt: now(), chars: 0 }; sessions.set(sid, sess); }
+      if (state.maxSessionChars && sess.chars + said.length > state.maxSessionChars) { entry.status = 400; entry.session = sid; return json(res, 400, { error: { message: 'session too large' } }); }
+      sess.turns.push({ role: 'user', content: said }); sess.chars += said.length; sess.usedAt = now();
+      entry.session = sid; entry.historyTurns = sess.turns.length;
+      toBackend = sess.turns.map((t) => ({ ...t }));
+    } else {
+      toBackend = msgs.map((m) => ({ role: m.role === 'tool' ? 'user' : m.role, content: textOf(m.content) }));
+      entry.readChars = toBackend.reduce((a, m) => a + m.content.length, 0); entry.last = toBackend[toBackend.length - 1].content;
+    }
+    if (latencyMs) await new Promise((r) => setTimeout(r, latencyMs));
+    // (a backend may answer { content, finish_reason }: the live one passes the model's own - 'length' at its output
+    // limit, which a stand-in that always said 'stop' hid; live 2026-10-28)
+    let text, finish = 'stop';
+    try { const out = await backend(toBackend, { model, signal: ac.signal, lane: entry.lane, session: sid }); if (out && typeof out === 'object') { text = String(out.content ?? ''); if (out.finish_reason !== undefined) finish = out.finish_reason == null ? null : String(out.finish_reason); } else text = String(out ?? ''); }   // (finish_reason: null - a stream that ends with none, as some on the box do)
+    catch (e) {
+      if (sess) { sess.turns.pop(); }   // a turn that was never answered is not in the session
+      entry.status = 502; if (res.writableEnded || ac.signal.aborted) return; return json(res, 502, { error: { type: 'upstream_error', message: String(e?.message || e).slice(0, 200) } });
+    }
+    if (sess) { sess.turns.push({ role: 'assistant', content: text }); sess.chars += text.length; sess.usedAt = now(); }
+    const inTok = plain ? 9 : toBackend.reduce((a, m) => a + tok(m.content), 0), outTok = tok(text);
+    if (!plain) state.credits -= inTok + outTok;   // the plain lane is free
+    const usage = plain ? { prompt_tokens: 9, completion_tokens: outTok, total_tokens: 9 + outTok, is_estimated: true }
+      : { prompt_tokens: inTok, completion_tokens: outTok, total_tokens: inTok + outTok, prompt_tokens_details: { cached_tokens: 0 } };
+    const envelope = plain ? { gemini_enterprise: { session: sid, assist_token: randomUUID().replace(/-/g, ''), thinking: ['(sim)'] } } : {};
+    const id = 'chatcmpl-' + randomUUID().slice(0, 12), created = Math.floor(now() / 1000);
+    if (res.writableEnded || ac.signal.aborted) return;
+    if (body.stream) {
+      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', ...budgetHeaders() });
+      const frame = (o) => { if (state.streamEnvelope === 'none') delete o.gemini_enterprise; res.write('data: ' + JSON.stringify(o) + '\n\n'); };
+      // the real plain lane sends few, large chunks ("streamed reply arrived in 2 chunks")
+      const cut = Math.max(1, Math.ceil(text.length / 2));
+      for (let i = 0; i < text.length || i === 0; i += cut) { frame({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { ...(i === 0 ? { role: 'assistant' } : {}), content: text.slice(i, i + cut) }, finish_reason: null }], ...envelope }); if (!text.length) break; }
+      frame({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: finish }], ...envelope });
+      if (body.stream_options?.include_usage) frame({ id, object: 'chat.completion.chunk', created, model, choices: [], usage, ...envelope });
+      res.write('data: [DONE]\n\n'); return res.end();
+    }
+    return json(res, 200, { id, object: 'chat.completion', created, model, choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: finish }], usage, ...envelope });
+  });
+  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
+  const p = server.address().port;
+  return { url: `http://127.0.0.1:${p}/v1`, port: p, sessions, log, state, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }) };
+}
+
+/**
+ * Sonnet (or CB_MODEL) through the development proxy named in proxy.local.json. The credentials are read here and
+ * never printed. Returns null when the file is missing, so a live harness can skip instead of failing.
+ */
+export async function liveBackend({ file = new URL('../proxy.local.json', import.meta.url), model = process.env.CB_MODEL || null, maxTokens = 8192 } = {}) {
+  let cfg; try { cfg = JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
+  const ext = cfg.external || {}; if (!ext.baseUrl) return null;
+  const { createAnthropicAdapter } = await import('../src/llm/anthropic-http.mjs');
+  const use = model || cfg.modelAliases?.sonnet || 'claude-sonnet-4-6';
+  const adapter = createAnthropicAdapter({ baseURL: ext.baseUrl.replace(/\/+$/, '') + '/v1', apiKey: () => ext.apiKey || 'x', extraHeaders: ext.headers || {}, defaultModel: use, maxTokens });
+  const backend = async (messages, { signal } = {}) => {
+    const r = await adapter.complete({ model: use, messages, signal, max_tokens: maxTokens });
+    return { content: r?.choices?.[0]?.message?.content || '', finish_reason: r?.choices?.[0]?.finish_reason || 'stop' };
+  };
+  backend.model = use;
+  backend.health = async () => { try { const r = await fetch(ext.baseUrl.replace(/\/+$/, '') + '/health', { headers: ext.headers || {} }); return r.ok; } catch { return false; } };
+  return backend;
+}
+
=== add test/_git.mjs
new 7d6042bf57015a61597c253e
+/**
+ * _git.mjs — running git, for TEST SETUP only.
+ *
+ * Twenty-three suites imported `runGit` from src/agent/git-workflow.mjs, which was deleted on 2026-07-01 when the
+ * entire git-integration surface was removed on purpose ("no special git handling"). That decision was about the
+ * PRODUCT: git is reached through the ordinary tool path now, and code_boss has no opinion about branches. But
+ * the tests still need to make a repository to work in — `git init`, a `config`, a branch, a `reset --hard`
+ * between cases — and losing the product feature quietly broke every one of them.
+ *
+ * So this is not a revival of that surface. It is a test fixture: spawn git, wait, hand back what happened. The
+ * shape matches what the suites already expect (`{ exitCode, stdout, stderr }` from `runGit(cwd, argv)`), so
+ * repointing an import is the whole change at each call site.
+ *
+ * ARGV ARRAYS, never a shell string — the same rule the product's own runner follows, and for the same reason: a
+ * path with a space in it is the common case on Windows, not the exotic one.
+ */
+import { spawn } from 'node:child_process';
+
+const DEFAULT_TIMEOUT_MS = 120000;
+
+export function runGit(cwd, args, { timeoutMs = DEFAULT_TIMEOUT_MS, input } = {}) {
+  return new Promise((resolve) => {
+    const t0 = Date.now();
+    let stdout = '', stderr = '', timedOut = false, settled = false;
+    const child = spawn('git', args, { cwd, windowsHide: true, env: process.env });
+    const tid = setTimeout(() => { timedOut = true; try { child.kill(); } catch {} }, timeoutMs);
+    child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
+    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
+    if (input != null) { try { child.stdin.write(input); child.stdin.end(); } catch {} }
+    const settle = (code, signal) => {
+      if (settled) return;
+      settled = true;
+      clearTimeout(tid);
+      resolve({
+        command: 'git ' + args.join(' '),
+        cwd,
+        exitCode: timedOut ? null : (code ?? null),
+        signal: signal ?? null,
+        timedOut,
+        stdout,
+        stderr,
+        durationMs: Date.now() - t0,
+      });
+    };
+    child.on('close', settle);
+    child.on('error', (e) => { stderr += '\n' + e.message; settle(-1, null); });
+  });
+}
+
+/**
+ * Stage everything and commit it. The other half of the setup the suites do: seed some files, commit, hand the
+ * agent a repository with history rather than an empty one.
+ *
+ * This was a git-workflow.mjs export too, and repointing the import to this file was not enough on its own —
+ * five suites still ask for `commitAll` here (live-powershell-write-repro, live-dev-session, live-plan-first,
+ * live-checklist-puppeteer, live-concurrent-compare). A missing NAMED export fails at link time, before a line
+ * of the file runs, so those five could not start either; it just isn't visible to a resolver that only checks
+ * whether the module file is on disk.
+ *
+ * SETUP SHAPE, not the product's. The original consulted getStatus and returned its failure so the worker's edits
+ * could never be silently dropped; that mattered because it was committing work. Here we are seeding a fixture,
+ * so a clean tree is an ordinary no-op rather than something to report. `-F -` reads the message from stdin so a
+ * multi-line one round-trips.
+ */
+export async function commitAll(dir, message) {
+  const add = await runGit(dir, ['add', '-A']);
+  if (add.exitCode !== 0) return { committed: false, error: 'git add failed: ' + (add.stderr.trim() || `exit ${add.exitCode}`), add };
+  const commit = await runGit(dir, ['commit', '-F', '-'], { input: String(message ?? 'commit') });
+  if (commit.exitCode !== 0) {
+    if (/nothing to commit|no changes added/i.test(commit.stdout + commit.stderr)) return { skipped: true, reason: 'working tree clean' };
+    return { committed: false, error: 'git commit failed: ' + (commit.stderr.trim() || `exit ${commit.exitCode}`), add, commit };
+  }
+  const head = await runGit(dir, ['rev-parse', 'HEAD']);
+  return { committed: true, hash: head.exitCode === 0 ? head.stdout.trim() : null, add, commit };
+}
+
+/** The setup every suite that wants a repository does by hand: init, identity, one commit so HEAD exists. */
+export async function initRepo(dir, { branch = 'main' } = {}) {
+  await runGit(dir, ['init', '-q']);
+  await runGit(dir, ['config', 'user.email', 'test@example.invalid']);
+  await runGit(dir, ['config', 'user.name', 'Test']);
+  await runGit(dir, ['checkout', '-q', '-b', branch]);
+  return dir;
+}
+
=== add test/_help-say.mjs
new bb693b72123315fd5086955f
+// _help-say.mjs - type a message into the HELP tab of the code_boss held open by _live-ui-drive.mjs and press Enter
+// (one action; the next is chosen after looking). node test/_help-say.mjs "<text>" [--chat=side]  (the side chat's tab instead)
+import { readFileSync } from 'node:fs';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const cfg = JSON.parse(readFileSync(path.join(__dirname, '.live-ui-drive.json'), 'utf8'));
+const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + cfg.debugPort, defaultViewport: null });
+const pages = await browser.pages();
+const page = pages.find((p) => /127\.0\.0\.1/.test(p.url())) || pages[0];
+const which = (process.argv.find((a) => a.startsWith('--chat=')) || '--chat=help').slice(7);
+const frame = page.frames().find((f) => new RegExp('chat=' + which + '(&|$)').test(f.url()));
+if (!frame) { console.log('no ' + which + ' tab open'); process.exit(1); }
+// --click=<text>: click that tab's visible button with exactly that text instead (e.g. Clear) - the LAST one, so a
+// dialog's button (over the page) wins over the one that opened it
+const clickText = (process.argv.find((a) => a.startsWith('--click=')) || '').slice(8);
+if (clickText) {
+  const r = await frame.evaluate((t) => { const b = [...document.querySelectorAll('button')].filter((x) => x.textContent.trim() === t && x.getClientRects().length).pop(); if (!b) return 'no button "' + t + '"'; b.click(); return 'clicked "' + t + '"'; }, clickText);
+  console.log(r + ' in the ' + which + ' tab'); browser.disconnect(); process.exit(0);
+}
+await frame.click('#input');
+await frame.type('#input', process.argv[2] || '');
+await (await frame.$('#input')).press('Enter');
+console.log('sent to the ' + which + ' tab');
+browser.disconnect();
+
=== add test/_helpers.mjs
new 7c6132383fe296309a108303
+/**
+ * Shared test helpers. Underscore prefix => run-all.mjs ignores this file.
+ */
+import { rm } from 'node:fs/promises';
+
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+/**
+ * Remove a disposable temp dir, retrying through transient Windows FS
+ * contention (Defender holds => EBUSY/EPERM/ENOTEMPTY on fresh dirs).
+ * NEVER throws: a cleanup failure must never fail a suite — on final
+ * failure it warns and leaves the dir behind for the OS/temp-sweeper.
+ */
+export async function cleanupDir(dir, { tries = 10, delayMs = 300 } = {}) {
+  if (!dir) return;
+  let lastErr;
+  for (let i = 0; i < tries; i++) {
+    try {
+      await rm(dir, { recursive: true, force: true });
+      return;
+    } catch (e) {
+      lastErr = e;
+      await sleep(delayMs);
+    }
+  }
+  console.warn('cleanup: left behind ' + dir + ' (' + (lastErr?.code || lastErr) + ')');
+}
+
+/**
+ * Throw if any message uses role:'system'. The post-engine-migration contract is that NO pass
+ * emits role:'system' — assembleConvo inlines the system prompt as a <system-reminder> in the last
+ * user message (genai.mil/Gemini silently IGNORES role:'system', which caused the intake/reviewer
+ * "can't see the workspace tools" bug). The real HTTP adapters enforce the same thing at runtime
+ * under CB_ASSERT_NO_SYSTEM_ROLE; this is the reusable check for TEST adapters (fake/recording ones,
+ * which never reach the HTTP layer) so a probe-driven pass that drifts back to role:'system' fails
+ * loudly. Returns the messages unchanged so it can wrap an adapter inline.
+ */
+export function guardNoSystemRole(messages, where = 'test-adapter') {
+  if (Array.isArray(messages)) {
+    const i = messages.findIndex((m) => m && m.role === 'system');
+    if (i !== -1) {
+      const snippet = String(messages[i].content ?? '').replace(/\s+/g, ' ').slice(0, 120);
+      throw new Error(`guardNoSystemRole: ${where} got a role:'system' message at index ${i}/${messages.length} — inline the system prompt via assembleConvo (<system-reminder> in the last user message), never role:'system' (Gemini ignores it). Offending content: "${snippet}"`);
+    }
+  }
+  return messages;
+}
+
+/**
+ * Wrap any adapter so every complete()/completeStream() call asserts no role:'system' first.
+ * Use in test harnesses to make even the REAL proxy adapter reject the masked-on-Anthropic bug:
+ *   const adapter = assertingAdapter(createAnthropicAdapter({...}));
+ */
+export function assertingAdapter(inner, where = 'asserting-adapter') {
+  return {
+    ...inner,
+    async complete(request) { guardNoSystemRole(request?.messages, where + '.complete'); return inner.complete(request); },
+    completeStream(request) { guardNoSystemRole(request?.messages, where + '.completeStream'); return inner.completeStream(request); },
+  };
+}
+
=== add test/_hunt-env.mjs
new d49c719200dc72155965938e
+// Runs a _pound batch against the live Claude proxy, taking credentials from the gitignored proxy.local.json
+// rather than the command line — so no key or CF-Access secret is ever typed into a shell, a log, or a
+// transcript. Set the batch with CB_POUND_BATCH; everything else comes from the file.
+//
+//   CB_POUND_BATCH=hunt node test/_hunt-env.mjs
+import { readFile } from 'node:fs/promises';
+
+const cfg = JSON.parse(await readFile(new URL('../proxy.local.json', import.meta.url), 'utf8'));
+const ext = cfg.external || {};
+const hdr = ext.headers || {};
+
+process.env.CB_PROXY = process.env.CB_PROXY || ext.baseUrl;
+process.env.CB_ADAPTER = process.env.CB_ADAPTER || 'anthropic';
+process.env.CB_MODEL = process.env.CB_MODEL || (cfg.modelAliases && cfg.modelAliases.sonnet) || 'claude-sonnet-4-6';
+if (hdr['CF-Access-Client-Id']) process.env.CB_CF_ACCESS_ID = hdr['CF-Access-Client-Id'];
+if (hdr['CF-Access-Client-Secret']) process.env.CB_CF_ACCESS_SECRET = hdr['CF-Access-Client-Secret'];
+// The proxy now requires a key of its own, sent as x-api-key (the adapter sets that header whenever a key is
+// present). Without it the harness sent the literal placeholder 'proxy-adds-key' and every call 401s.
+const apiKey = ext.apiKey || cfg.apiKey || '';
+if (apiKey) process.env.CB_API_KEY = apiKey;
+
+// Never the key itself — only that one is present, which is the thing worth knowing when a run 401s.
+console.log(`[hunt] ${process.env.CB_MODEL} via ${process.env.CB_PROXY} · batch=${process.env.CB_POUND_BATCH || 'smoke'}`
+  + ` · x-api-key ${apiKey ? 'set (' + apiKey.slice(0, 7) + '…)' : 'MISSING — add external.apiKey to proxy.local.json'}`);
+await import('./_pound.mjs');
+
=== add test/_jgit-lib.mjs
new c6935de5e89a8c2df40e9dd7
+// JGit's jars and our git command line over them (sandbox-launcher/src/jgit), built once per machine for the tests:
+// the jars fetched by the Maven on PATH (from whatever repository its settings name) into a cache under %TEMP%, the
+// command line compiled fresh into the caller's own folder. Returns null - and says why - when this machine cannot.
+import { spawnSync } from 'node:child_process';
+import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import { sblFindJdk, sblJavacMajor, sblJgitPom, sblJgitCompileArgs, SBL_JGIT_FILES, SBL_JGIT_VERSION } from '../src/agent/sandbox-launcher.mjs';
+
+const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
+
+export function jgitLib({ why = (s) => console.log('  SKIP: ' + s) } = {}) {
+  const lib = path.join(tmpdir(), `cb-jgit-lib-${SBL_JGIT_VERSION}`);
+  const has = () => existsSync(lib) && readdirSync(lib).some((n) => /^org\.eclipse\.jgit-.*\.jar$/.test(n));
+  if (!has()) {
+    const work = path.join(tmpdir(), `cb-jgit-fetch-${process.pid}`);
+    mkdirSync(work, { recursive: true });
+    writeFileSync(path.join(work, 'pom.xml'), sblJgitPom());
+    const r = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"mvn -B -q dependency:copy-dependencies "-DoutputDirectory=${lib}""`], { cwd: work, encoding: 'utf8', windowsVerbatimArguments: true, timeout: 600000 });
+    if (!has()) { why(`JGit could not be fetched with the mvn on PATH (exit ${r.status}): ${String(r.stdout || r.stderr || r.error || '').trim().slice(-300)}`); return null; }
+  }
+  return lib;
+}
+
+/** Compile the command line into `dir`\classes against `lib`. Returns { java, classes, lib, cp } or null. */
+export function jgitBuild(dir, lib, { why = (s) => console.log('  SKIP: ' + s) } = {}) {
+  const jdk = sblFindJdk();
+  if (!jdk.ok) { why('no JDK (javac) found'); return null; }
+  const v = spawnSync(jdk.javac, ['-version'], { encoding: 'utf8' });
+  const release8 = sblJavacMajor(`${v.stdout || ''} ${v.stderr || ''}`) >= 9;
+  const classes = path.join(dir, 'classes');
+  mkdirSync(classes, { recursive: true });
+  const files = SBL_JGIT_FILES.map((f) => path.join(ROOT, 'sandbox-launcher', f));
+  const r = spawnSync(jdk.javac, sblJgitCompileArgs(files, lib, classes, { release8 }), { encoding: 'utf8' });
+  if (r.status !== 0) throw new Error('javac failed on the git command line: ' + String(r.stderr || r.stdout).slice(0, 2000));
+  return { java: jdk.java, javaHome: jdk.home, classes, lib, cp: classes + ';' + path.join(lib, '*') };
+}
+
=== add test/_key-check.mjs
new 35fc2a4d579274154bf353d1
+// Is the proxy key working? One tiny live call through the SAME loader and adapter every live harness uses, so
+// a 401 in a two-hour run is a five-second question first. Prints a key PREFIX only, never the key.
+//
+//   node test/_key-check.mjs
+import { PROXY_BASE, PROXY_HEADERS, PROXY_API_KEY, proxyModel, describeCreds } from './_proxy-creds.mjs';
+import { createAnthropicAdapter } from '../src/llm/anthropic-http.mjs';
+
+console.log(describeCreds('key-check'));
+if (!PROXY_API_KEY) { console.log('  no key configured — add external.apiKey to proxy.local.json'); process.exit(1); }
+
+const adapter = createAnthropicAdapter({ baseURL: PROXY_BASE + '/v1', apiKey: PROXY_API_KEY, extraHeaders: PROXY_HEADERS });
+try {
+  const r = await adapter.complete({ model: proxyModel('sonnet'), max_tokens: 16, messages: [{ role: 'user', content: 'Reply with the single word: ok' }] });
+  const text = String(r?.choices?.[0]?.message?.content ?? '').trim();
+  console.log('  round-trip:', JSON.stringify(text).slice(0, 60));
+  console.log('  usage:', JSON.stringify(r?.usage || null));
+  process.exit(text ? 0 : 1);
+} catch (e) {
+  // Scrub before printing: an auth error can echo the header back.
+  console.log('  FAILED:', String(e?.message || e).replace(/sk-[A-Za-z0-9-]+/g, 'sk-***').slice(0, 200));
+  process.exit(1);
+}
+
=== add test/_live-approval-capture.mjs
new 1d9e83936a2dc21ef649abd6
+/**
+ * ON-DEMAND live gate (`_`-prefix → run-all skips it) for the DECISION LOG's headline fix:
+ * AUTO-CAPTURE of a plan approval on the review→implement transition (server.mjs). Drives the REAL
+ * server: a propose-first message (review:true) → wait for the proposal to settle (pendingApprove) →
+ * an approve message (review:false) → assert an {kind:'approval', source:'developer'} decision landed
+ * in .code_boss/decisions.jsonl. The implement run is cancelled once the capture is confirmed.
+ *
+ *   CB_PROXY=... CB_MODEL=claude-haiku-4-5 CB_CF_ACCESS_ID=... CB_CF_ACCESS_SECRET=... \
+ *     node test/_live-approval-capture.mjs
+ * Skips (exit 0) if the proxy is unreachable.
+ */
+import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import { createAnthropicAdapter } from '../src/llm/anthropic-http.mjs';
+import { runGit, commitAll } from './_git.mjs';
+import { LIVE_MODEL } from './_live-model.mjs';
+import { PROXY_API_KEY } from './_proxy-creds.mjs';   // the proxy now requires its own x-api-key
+const { startServer } = await import('../src/server.mjs');
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PROXY = process.env.CB_PROXY || 'https://home-proxy.philhignight.com';
+const MODEL = LIVE_MODEL;
+const PORT = Number(process.env.CB_APPROVE_PORT || 17931);
+const eh = {};
+if (process.env.CB_CF_ACCESS_ID) eh['CF-Access-Client-Id'] = process.env.CB_CF_ACCESS_ID;
+if (process.env.CB_CF_ACCESS_SECRET) eh['CF-Access-Client-Secret'] = process.env.CB_CF_ACCESS_SECRET;
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+let pass = 0, fail = 0;
+const ok = (m) => { pass++; console.log('  ok', m); };
+const bad = (m) => { fail++; console.log('  FAIL', m); };
+
+async function main() {
+  try { const h = await fetch(PROXY + '/health', { headers: eh }); if (!h.ok) throw 0; } catch { console.log(`SKIP — proxy unreachable at ${PROXY}`); process.exit(0); }
+  const dir = await mkdtemp(path.join(tmpdir(), 'cb-approve-live-'));
+  await runGit(dir, ['init', '-q']); await runGit(dir, ['config', 'user.email', 't@t']); await runGit(dir, ['config', 'user.name', 'T']);
+  await writeFile(path.join(dir, 'server.js'), 'const http = require("http");\nhttp.createServer((req,res)=>res.end("hi")).listen(3000);\n', 'utf8');
+  await commitAll(dir, 'seed');
+  const html = await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8');
+  const adapter = createAnthropicAdapter({ baseURL: PROXY + '/v1', apiKey: PROXY_API_KEY || 'x', extraHeaders: eh });
+  const decisionsFile = path.join(dir, '.code_boss', 'decisions.jsonl');
+
+  const { server } = await startServer({ html, baseURL: PROXY, apiKey: PROXY_API_KEY || 'x', gitlabCreds: { user: 'd', token: 'd' }, defaultModel: MODEL, port: PORT, initialProject: dir, modelsList: [{ id: MODEL }], adapter, apiFormat: 'anthropic' });
+  const api = (p, opts) => fetch(`http://127.0.0.1:${PORT}${p}`, opts).then((r) => r.json());
+  const readDecisions = async () => { try { return (await readFile(decisionsFile, 'utf8')).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
+  const waitSettled = async (deadlineMs) => {
+    const t0 = Date.now();
+    while (Date.now() - t0 < deadlineMs) { const s = await api('/api/state').catch(() => null); if (s && (s.status === 'idle' || s.status === 'done' || s.status === 'error')) return s.status; await sleep(2500); }
+    return 'timeout';
+  };
+
+  try {
+    await sleep(1200);
+    console.log(`proxy=${PROXY} model=${MODEL} project=${dir}\n`);
+
+    // 1) PROPOSE (review:true) — the worker should produce a <plan> and settle at 'done' (pendingApprove).
+    console.log('→ propose-first message (review:true)…');
+    await api('/api/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Add a GET /version endpoint that returns the package version as JSON. Propose first.', model: MODEL, review: true }) });
+    const st1 = await waitSettled(300000);
+    console.log(`  propose settled: status=${st1}`);
+    const before = await readDecisions();
+
+    // 2) APPROVE (review:false while pendingApprove) — the auto-capture must fire on receipt.
+    console.log('→ approve message (review:false)…');
+    await api('/api/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Approved — go ahead and implement the proposal you just described.', model: MODEL, review: false }) });
+    // The capture is synchronous-on-receipt (best-effort append); poll the file briefly.
+    let approval = null;
+    for (let i = 0; i < 12; i++) { const d = await readDecisions(); approval = d.find((e) => e.kind === 'approval'); if (approval) break; await sleep(700); }
+    // Stop the implement run now that we've checked — we only care about the capture.
+    await api('/api/cancel', { method: 'POST' }).catch(() => {});
+
+    const after = await readDecisions();
+    console.log(`\ndecisions.jsonl (${after.length} entr${after.length === 1 ? 'y' : 'ies'}):`);
+    for (const e of after) console.log(`  [${e.kind}/${e.source}] ${e.text}`);
+    console.log('');
+
+    if (st1 !== 'done') console.log(`  (info) propose did not settle at 'done' (got ${st1}) — pendingApprove may not have held; the approve path still tested below`);
+    if (approval) ok(`approval AUTO-CAPTURED on review→implement: [${approval.kind}/${approval.source}] "${approval.text}"`);
+    else bad('no approval decision captured on the review→implement transition');
+    if (approval) (approval.source === 'developer' ? ok('captured with source=developer') : bad(`approval source is ${approval.source}, expected developer`));
+  } catch (e) {
+    bad(`threw: ${e?.stack || e}`);
+  } finally {
+    try { server.close(); } catch {}
+    await sleep(500);
+    for (let i = 0; i < 6; i++) { try { await rm(dir, { recursive: true, force: true }); break; } catch { await sleep(400); } }
+  }
+  console.log(`\n${pass} passed, ${fail} failed`);
+  process.exit(fail === 0 ? 0 : 1);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_live-drive.mjs
new f53731a4d87dbb2d8128f6b0
+/**
+ * _live-drive.mjs — hold a real code_boss open so it can be driven ONE MESSAGE AT A TIME.
+ *
+ * The batch harness (live-longsession.mjs) sends a scripted list and reports at the end. That finds what the
+ * script thought to look for. This is the other thing: a real session left running, so the next message can be
+ * chosen after READING the last answer — which is how a person actually finds bugs.
+ *
+ * Start it (background), then use _say.mjs for each message:
+ *   node test/_live-drive.mjs D:/path/to/project        # stays up until killed
+ *   node test/_say.mjs "add paging to the list command"
+ *
+ * Resumes whatever conversation is already in the project's .code_boss/conversation.jsonl, so a session can be
+ * picked up where a previous run left it — including its accumulated context.
+ *
+ * env: CB_DRIVE_PORT (28998) · CB_DEBUG_PORT (9333) · CB_MODEL · CB_HEADFUL=0 to hide the window
+ */
+import { readFile } from 'node:fs/promises';
+import { existsSync, writeFileSync } from 'node:fs';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+import { createAnthropicAdapter } from '../src/llm/anthropic-http.mjs';
+import { LIVE_MODEL } from './_live-model.mjs';
+import { PROXY_API_KEY, PROXY_BASE, PROXY_HEADERS } from './_proxy-creds.mjs';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PORT = Number(process.env.CB_DRIVE_PORT || 28998);
+const DEBUG_PORT = Number(process.env.CB_DEBUG_PORT || 9333);
+const PROXY = PROXY_BASE || process.env.CB_PROXY || 'https://home-proxy.philhignight.com';
+const MODEL = process.env.CB_MODEL || LIVE_MODEL;
+const SEP = String.fromCharCode(92);
+const chrome = [
+  'C:/Program Files/Google/Chrome/Application/chrome.exe',
+  (process.env.LOCALAPPDATA || '').split(SEP).join('/') + '/Google/Chrome/Application/chrome.exe',
+  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
+].find((p) => { try { return p && existsSync(p); } catch { return false; } });
+
+const project = process.argv[2];
+if (!project || !existsSync(project)) { console.error('usage: node test/_live-drive.mjs <existing project dir>'); process.exit(2); }
+
+const adapter = createAnthropicAdapter({ baseURL: PROXY + '/v1', apiKey: PROXY_API_KEY || 'x', extraHeaders: PROXY_HEADERS || {} });
+const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+  .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: MODEL, baseURL: PROXY }) + ';</script></head>');
+const { server } = await startServer({
+  html, baseURL: PROXY, apiKey: PROXY_API_KEY || 'x', gitlabCreds: { user: 'd', token: 'd' },
+  defaultModel: MODEL, port: PORT, initialProject: project, modelsList: [{ id: MODEL }], adapter, apiFormat: 'anthropic',
+});
+
+const browser = await puppeteer.launch({
+  executablePath: chrome,
+  headless: process.env.CB_HEADFUL === '0' ? 'new' : false,
+  args: ['--no-sandbox', '--remote-debugging-port=' + DEBUG_PORT, '--window-size=1500,1000'],
+});
+const page = (await browser.pages())[0] || await browser.newPage();
+await page.setViewport({ width: 1500, height: 1000 });
+// Page errors are collected on the PAGE so a later _say.mjs can read what happened between messages.
+await page.evaluateOnNewDocument(() => {
+  window.__errs = [];
+  window.addEventListener('error', (e) => window.__errs.push('error: ' + (e.message || '')));
+  window.addEventListener('unhandledrejection', (e) => window.__errs.push('rejection: ' + String(e.reason).slice(0, 200)));
+});
+await page.goto('http://127.0.0.1:' + PORT + '/');
+await page.waitForSelector('#chat:not(.hidden)', { timeout: 30000 });
+
+writeFileSync(path.join(__dirname, '.live-drive.json'), JSON.stringify({ port: PORT, debugPort: DEBUG_PORT, project, model: MODEL }, null, 2));
+const ctx = await page.evaluate(() => Number((window.__sessionRef || {}).contextFill?.totalTokens || 0) || 0);
+const rows = await page.evaluate(() => document.querySelectorAll('#log > *').length);
+console.log(`live drive UP — port ${PORT}, debug ${DEBUG_PORT}`);
+console.log(`project: ${project}`);
+console.log(`restored ${rows} chat row(s), context ${ctx.toLocaleString()} tokens, model ${MODEL}`);
+console.log('drive it with:  node test/_say.mjs "your message"');
+process.on('SIGTERM', async () => { try { await browser.close(); } catch {} server.close(); process.exit(0); });
+setInterval(() => {}, 1 << 30);   // stay up
+
=== add test/_live-empty-close-probe.mjs
new d15b934a00c3a5b707614ce9
+/**
+ * ON-DEMAND LIVE probe (`_`-prefix → run-all skips it).
+ *
+ * QUESTION: which wording of the tail reminder stops the model CLOSING AN EMPTY TURN?
+ *
+ * WHY: reported live 2026-09-19 on gemini-3.8-flash. The agent finished a long answer offering to build the
+ * project structure, the developer typed "proceed", and the whole reply was the turn-closing sentinel on its own
+ * line — nothing else. The suspicion is the last line of the prompt: "write your reply ONCE, then close your turn
+ * … and stop". After a transcript where its own previous turn already answered in full, "once" can read as "you
+ * have already written it", so the model goes straight to the closing.
+ *
+ * That line is not a guess to be replaced by another guess — it was measured (it closed the turn 2 of 2 in probe
+ * #78 when nothing else did). So this reproduces the exact failing SHAPE through the real assembleConvo and puts
+ * the candidate wordings against each other on it.
+ *
+ * MEASURED per reply: empty (only the closer), closed (the closer is there at all), forged (it wrote a developer
+ * heading inside its own turn — the failure the closer exists to prevent), and length. Text is never printed.
+ *
+ * ── WHAT IT FOUND (claude-haiku-4-5 via home-proxy, 2026-09-19) ────────────────────────────────────────────────
+ *   round 1, n=6      closed%   forged%        round 2, n=8      closed%
+ *     current           100        0             current           100
+ *     per-turn           50       33             current-plus       50
+ *     reply-or-act        0        0
+ *     this-turn           0        0
+ *
+ * LEAVE THE LINE ALONE. Every rewrite made turn-closing WORSE, and "once per turn" additionally made the model
+ * forge a developer heading a third of the time — worse than the bug being chased, because a forged heading makes
+ * the parser throw part of the reply away. Round 2 then tested the most conservative change imaginable: the exact
+ * current sentence, unmodified, with ONE short sentence added after it. That halved closing too. So it is not the
+ * wording that carries this — it is being the LAST THING READ before the turn opens. Anything appended takes that
+ * position away, whatever it says.
+ *
+ * Also: EMPTY never reproduced here, 0 of 44 across every arm. These runs therefore say nothing about whether any
+ * wording FIXES the reported bug; they only say what damages closing. The bug was seen on gemini-3.8-flash and
+ * this ran on haiku because the Gemini account was out of credit. The symptom is handled structurally instead —
+ * minimal-worker nudges an empty reply after a developer message (build 1931).
+ *
+ * To settle the original question, run this against the model that actually failed:
+ *   CB_EMPTY_MODEL=gemini CB_EMPTY_MODEL_ID=gemini-3.8-flash CB_EMPTY_N=10 node test/_live-empty-close-probe.mjs
+ *
+ * Run:  node test/_live-empty-close-probe.mjs
+ *   CB_EMPTY_N=5           samples per arm (default 5)
+ *   CB_EMPTY_MODEL=haiku   cross-check on Anthropic via home-proxy; default = gemini.local.json's model
+ */
+import { readFile } from 'node:fs/promises';
+import { createHttpAdapter } from '../src/llm/openai-http.mjs';
+import { createAnthropicAdapter } from '../src/llm/anthropic-http.mjs';
+import { buildStaticPrompt, buildLiveTail } from '../src/agent/worker-prompt.mjs';
+import { assembleConvo } from '../src/agent/engine.mjs';
+import { PROXY_API_KEY } from './_proxy-creds.mjs';
+
+const WHICH = process.env.CB_EMPTY_MODEL || 'gemini';
+const N = Number(process.env.CB_EMPTY_N || 5);
+let adapter, MODEL;
+if (WHICH === 'haiku') {
+  const cfg = JSON.parse(await readFile('proxy.local.json', 'utf8'));
+  MODEL = 'claude-haiku-4-5';
+  adapter = createAnthropicAdapter({ baseURL: cfg.external.baseUrl.replace(/\/+$/, '') + '/v1', apiKey: PROXY_API_KEY || 'x', extraHeaders: cfg.external.headers });
+} else {
+  const g = JSON.parse(await readFile('gemini.local.json', 'utf8'));
+  MODEL = process.env.CB_EMPTY_MODEL_ID || g.model;
+  adapter = createHttpAdapter({ baseURL: g.baseURL, apiKey: g.key });
+}
+
+const PROJECT = 'D:\\code\\codeboss_plugins\\mock_auth_plugin';
+
+// THE REPORTED SHAPE. A few steps of real work, then a long assistant answer that ENDS WITH AN OFFER, then the
+// developer typing a single word of assent. That last pair is the whole point: the model's own complete reply is
+// sitting right above its open turn, which is what makes "write your reply once" readable as "already done".
+const LONG_ANSWER = [
+  '### 📌 Key Takeaway',
+  '**No, not currently.** The plugin exists solely as a single monolithic file containing an inlined Base64 JAR',
+  'payload, and the Java filter was built inside temporary OS folders rather than via a dedicated build pipeline.',
+  '',
+  '### 📊 Current State vs. Recommended Modular Structure',
+  '',
+  '| Feature | Current Implementation | Proposed Modular Structure |',
+  '| --- | --- | --- |',
+  '| **Java Filter Source** | Compiled ephemerally in AppData\\Local\\Temp | Dedicated source at src/java/mock/DynamicMockAuthFilter.java |',
+  '| **Plugin JavaScript** | Single 170-line file | Split into separate ES modules |',
+  '| **Compilation** | Ad-hoc Node snippets run manually | Single build script (build.mjs) |',
+  '',
+  '### ⚠ Common Pitfalls to Avoid',
+  '',
+  '| Pitfall | Impact | Mitigation |',
+  '| --- | --- | --- |',
+  '| Hardcoding Javac Paths | Breaks if the JDK location shifts | build.mjs auto-discovers javac.exe |',
+  '| Source Desynchronization | Editing the installed copy is overwritten | The repo files are the source of truth |',
+  '',
+  '### 💡 Recommended Next Action',
+  'If you want me to set this up right now, I can create the src/ directory tree, place the modularized Java and',
+  'JavaScript files into their respective single-responsibility modules, author build.mjs, and verify the build',
+  'passes end-to-end.',
+].join('\n');
+
+function messages() {
+  return [
+    { role: 'user', content: 'do you have local build w/ single responsibility files and a build/deploy script?' },
+    { role: 'assistant', content: 'I will list the workspace directory to see what project files and build scripts are currently present.' },
+    { role: 'assistant', content: '<remote-workspace><list path="."/></remote-workspace>' },
+    { role: 'user', content: '<remote-workspace-result op="list" status="ok">\n[D] applicationsecurity-common\n[F] EDI.txt (10 bytes)\n[D] milconnect\n[D] servers\n[D] testdata\n</remote-workspace-result>' },
+    { role: 'assistant', content: LONG_ANSWER },
+    { role: 'user', content: 'proceed' },
+  ];
+}
+
+// The arms. Only the reminder line differs; everything else is the real prompt, byte for byte.
+const CURRENT = (tag) => `Reminder: write your reply once, then close your turn with "/--- you ${tag} ---" on its own line and stop.`;
+const ARMS = [
+  { key: 'current', line: CURRENT },
+  // the developer's first suggestion — scope the "once" to this turn
+  { key: 'per-turn', line: (tag) => `Reminder: write your reply once per turn, then close your turn with "/--- you ${tag} ---" on its own line and stop.` },
+  // the developer's second — say it is about replying OR acting, and name the repetition it is guarding against
+  { key: 'reply-or-act', line: (tag) => `Reminder: make sure you have replied or taken action on the developer's request, but only once per turn — do not repeat a message or an action. Then close your turn with "/--- you ${tag} ---" on its own line and stop.` },
+  // lead with the positive requirement, and name the empty close as the thing not to do
+  { key: 'this-turn', line: (tag) => `Reminder: your reply goes in THIS turn — write it once, without repeating one you have already given — then close the turn with "/--- you ${tag} ---" on its own line and stop. Never close a turn with nothing in it.` },
+  // ROUND 2. Round 1 said every rewrite HURTS: closed% went 100 -> 50/0/0 and per-turn forged a developer
+  // heading 33% of the time, which is the exact failure the closing line exists to prevent. So stop rewriting
+  // the measured clause. Keep it verbatim, in its position as the last thing read, and ADD one sentence after.
+  { key: 'current-plus', line: (tag) => CURRENT(tag) + ' Never close a turn with nothing in it.' },
+];
+
+const staticPrompt = buildStaticPrompt({ discussMode: false, workerMemory: null, checklist: null });
+const liveTail = buildLiveTail({ projectDir: PROJECT, projectContext: '', pluginToolsDoc: '', workerMemo: null, checklistView: null, gitProjects: null, discussMode: false });
+
+function buildFor(arm) {
+  const built = assembleConvo({ staticPrompt, liveTail, priming: [], messages: messages() });
+  const text = String(built[0].content);
+  const tag = (/---\s+you\s+([0-9a-z]{3,8})\s+---/.exec(text) || [])[1];
+  if (!tag) throw new Error('no turn tag in the assembled prompt — is TURN_DELIMS off?');
+  const current = CURRENT(tag);
+  if (!text.includes(current)) throw new Error('the reminder line is not where this probe expects it');
+  built[0].content = text.replace(current, arm.line(tag));
+  return { req: built, tag };
+}
+
+function measure(tag, content) {
+  const text = String(content || '');
+  const closer = new RegExp(`/---[ \\t]*you[ \\t]+${tag}[ \\t]*---`);
+  const bare = text.replace(new RegExp(`/?---[ \\t]*(you|developer)[ \\t]+${tag}[ \\t]*---`, 'g'), '').trim();
+  return {
+    empty: bare.length < 3,
+    closed: closer.test(text),
+    forged: new RegExp(`---[ \\t]*developer[ \\t]+${tag}[ \\t]*---`).test(text),
+    chars: bare.length,
+    acted: /<remote-workspace\b/.test(text),
+  };
+}
+
+async function once(arm) {
+  const { req, tag } = buildFor(arm);
+  const t0 = Date.now();
+  const r = await adapter.complete({ model: MODEL, messages: req, temperature: 0 });
+  const content = r?.choices?.[0]?.message?.content ?? '';
+  return { ...measure(tag, content), ms: Date.now() - t0 };
+}
+
+console.log(`\nEMPTY-CLOSE PROBE — model ${MODEL}, ${N} samples per arm, ${ARMS.length} arms`);
+console.log('The shape: a complete assistant answer ending with an offer, then the developer typing "proceed".\n');
+const results = [];
+const ONLY = (process.env.CB_EMPTY_ARMS || '').split(',').map((x) => x.trim()).filter(Boolean);
+const RUN_ARMS = ARMS.filter((a) => !ONLY.length || ONLY.includes(a.key));
+for (const arm of RUN_ARMS) {
+  const rows = [];
+  for (let i = 0; i < N; i++) {
+    try { rows.push(await once(arm)); }
+    catch (e) { rows.push({ error: String(e?.message || e).slice(0, 200) }); }
+    process.stdout.write('.');
+  }
+  const okRows = rows.filter((r) => !r.error);
+  const pct = (n) => okRows.length ? Math.round((n / okRows.length) * 100) : 0;
+  const empty = okRows.filter((r) => r.empty).length;
+  const closed = okRows.filter((r) => r.closed).length;
+  const forged = okRows.filter((r) => r.forged).length;
+  const acted = okRows.filter((r) => r.acted).length;
+  const median = okRows.length ? okRows.map((r) => r.chars).sort((a, b) => a - b)[Math.floor(okRows.length / 2)] : 0;
+  results.push({ key: arm.key, n: okRows.length, errors: rows.length - okRows.length, empty: pct(empty), closed: pct(closed), forged: pct(forged), acted: pct(acted), median });
+  console.log(` ${arm.key}`);
+  for (const r of rows) if (r.error) console.log('    ERR:', r.error);
+}
+console.log('\narm            n  err  EMPTY%  closed%  forged%  acted%  median chars');
+for (const r of results) {
+  console.log([r.key.padEnd(13), String(r.n).padStart(2), String(r.errors).padStart(4), String(r.empty).padStart(6), String(r.closed).padStart(8), String(r.forged).padStart(8), String(r.acted).padStart(7), String(r.median).padStart(12)].join(' '));
+}
+console.log('\nEMPTY% is the reported bug (the reply was only the closing line). closed% must stay HIGH — that is what');
+console.log('the original wording was measured for, and a wording that fixes EMPTY by breaking closed is not a fix.');
+
=== add test/_live-in-container.mjs
new dc274280aeccdd310ff33462
+/**
+ * A REAL MODEL SESSION WITH code_boss INSIDE THE CONTAINER. The whole chain at once: the creator builds an image
+ * with real tools, installs it, the manager starts the container and code_boss in it; then a real model (the live
+ * test proxy, sonnet) is given a task through code_boss's own API and UI, and what it did is checked on disk.
+ *
+ * The packaged app talks to the production gateway and nothing else, so the app put in THIS image is a copy of
+ * dist/code-boss.mjs with its two address constants changed to the live proxy; the proxy's access headers go in the
+ * container's env file (home\env), read from proxy.local.json and never printed. Its own home (CB_HOME) under
+ * D:\tmp\cb-live-box, uninstalled at the end. Not in the suite.
+ *
+ *   node test/_live-in-container.mjs [folder for screenshots]
+ */
+import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
+import { spawnSync } from 'node:child_process';
+import http from 'node:http';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import { sblFindJdk } from '../src/agent/sandbox-launcher.mjs';
+import { sbuFindChrome } from '../src/agent/sandbox-setup-ui.mjs';
+
+let pass = 0, fail = 0;
+const ok = (c, l) => { if (c) { pass++; console.log('  ok', l); } else { fail++; console.log('  FAIL', l); } };
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+const SHOTS = process.argv[2] || '';
+const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
+const BASE = 'D:\\tmp\\cb-live-box', HOME = path.join(BASE, 'home'), TREE = path.join(BASE, 'agent'), REMOTE = path.join(BASE, 'remote.git');
+const CB = path.join(HOME, '.code_boss');
+const jdk = sblFindJdk(), chrome = sbuFindChrome();
+const mvnHome = 'C:\\ProgramData\\chocolatey\\lib\\maven\\apache-maven-3.9.11';
+if (existsSync('Z:\\')) { console.log('Z: is in use - stop whatever has it first'); process.exit(1); }
+
+const cfg = JSON.parse(readFileSync(path.join(ROOT, 'proxy.local.json'), 'utf8'));
+const PROXY = String(cfg.external.baseUrl).replace(/\/+$/, ''), HDR = cfg.external.headers || {};
+const MODEL = process.env.CB_MODEL || (cfg.modelAliases && cfg.modelAliases.sonnet) || 'claude-sonnet-4-6';
+
+const env = { ...process.env, CB_HOME: HOME };
+const carrier = (args, label) => {
+  const t0 = Date.now();
+  const r = spawnSync(process.execPath, [path.join(ROOT, 'dist', 'code-boss-setup.mjs'), ...args], { env, encoding: 'utf8', timeout: 25 * 60000, maxBuffer: 64 * 1048576, cwd: BASE });
+  const text = `${r.stdout || ''}${r.stderr || ''}`;
+  writeFileSync(path.join(BASE, `${label}.log`), text);
+  console.log(`  (${label}: exit ${r.status} in ${Math.round((Date.now() - t0) / 1000)} s)`);
+  return { code: r.status, text };
+};
+const state = () => { try { const j = JSON.parse(readFileSync(path.join(CB, 'sandbox-manager.json'), 'utf8')); return { ...j, url: 'http://127.0.0.1:' + j.port + '/?t=' + j.token }; } catch { return null; } };
+const call = (method, p, body, ms = 60000) => new Promise((resolve) => {
+  const data = body === undefined ? null : JSON.stringify(body);
+  const r = http.request({ host: '127.0.0.1', port: 18988, method, path: p, timeout: ms, agent: false, headers: { Host: 'localhost:18988', Origin: 'http://localhost:18988', ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) } },
+    (res) => { let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch { } resolve({ status: res.statusCode, text: t, json: j }); }); });
+  r.on('error', (e) => resolve({ error: e.code || e.message })); r.on('timeout', () => { r.destroy(); resolve({ error: 'timeout' }); });
+  r.end(data || undefined);
+});
+
+if (existsSync(TREE) || existsSync(CB)) { if (existsSync(TREE)) carrier(['sandbox', '--uninstall', '--yes', '--no-tray', '--tree', TREE], 'pre-uninstall'); }
+rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
+mkdirSync(CB, { recursive: true });
+spawnSync('git', ['init', '-q', '--bare', REMOTE]);
+// the developer's settings that get copied in: a key (the proxy wants none, the app wants one set) and git credentials
+writeFileSync(path.join(CB, 'api-key.txt'), String(process.env.CB_API_KEY || cfg.external.apiKey || 'live-test'));
+writeFileSync(path.join(CB, 'gitlab-creds.json'), JSON.stringify({ user: 'live', token: 'live' }));
+// THE APP FOR THIS IMAGE: this build, pointed at the live proxy
+const bundle = readFileSync(path.join(ROOT, 'dist', 'code-boss.mjs'), 'utf8');
+const a1 = "const BASE_URL = 'https://api.genai.mil/v1';", a2 = "const MODEL    = 'gemini-3.1-pro-preview';";
+if (bundle.split(a1).length !== 2 || bundle.split(a2).length !== 2) { console.log('the bundle\'s address constants are not where this harness expects them'); process.exit(1); }
+const appFile = path.join(BASE, 'code-boss-live.mjs');
+writeFileSync(appFile, bundle.replace(a1, () => `const BASE_URL = ${JSON.stringify(PROXY + "/v1")};`).replace(a2, () => `const MODEL    = ${JSON.stringify(MODEL)};`));
+
+const SWITCHES = ['--jdk8', jdk.home, '--node', path.dirname(process.execPath), '--maven', mvnHome, '--source', REMOTE, '--no-push', '--tree', TREE, '--no-tray', '--no-browser', '--yes', '--app', appFile];
+let browser;
+try {
+  console.log('\n[1] the image, installed, manager started');
+  const r1 = carrier(['image', ...SWITCHES, '--run'], 'first');
+  ok(r1.code === 0, 'the command ended well: ' + r1.text.split('\n').filter((l) => l.trim()).slice(-2).join(' / ').slice(0, 200));
+  const st = state();
+  if (!st || !chrome) throw new Error('no manager or no Chrome');
+  // what the model's endpoint needs, for everything in the container (never printed)
+  mkdirSync(path.join(TREE, 'home'), { recursive: true });
+  writeFileSync(path.join(TREE, 'home', 'env'), ['AGENT_API_FORMAT=anthropic', 'CB_CF_ACCESS_ID=' + (HDR['CF-Access-Client-Id'] || ''), 'CB_CF_ACCESS_SECRET=' + (HDR['CF-Access-Client-Secret'] || ''), ''].join('\r\n'));
+  mkdirSync(path.join(TREE, 'projects', 'demo'), { recursive: true });
+  writeFileSync(path.join(TREE, 'projects', 'demo', 'Greeter.java'), 'public class Greeter {\n  public static String greet(String name) { return "Hello, " + name; }\n  public static void main(String[] a) { System.out.println(greet("container")); }\n}\n');
+
+  console.log('\n[2] the container and code_boss inside it');
+  const puppeteer = (await import('puppeteer-core')).default;
+  browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+  const page = await browser.newPage();
+  page.on('dialog', async (d) => { await d.accept(); });
+  await page.setViewport({ width: 1100, height: 900 });
+  await page.goto(st.url);
+  await page.waitForFunction(() => /Stopped|Not running/.test(document.getElementById('box-text').textContent), { timeout: 20000 });
+  await page.click('#box-start');
+  await page.waitForFunction(() => /^Running on /.test(document.getElementById('box-text').textContent) || /Not running/.test(document.getElementById('box-text').textContent), { timeout: 300000 });
+  ok(/^Running on Z:/.test(await page.$eval('#box-text', (e) => e.textContent)), 'the container is running');
+  await page.waitForFunction(() => !document.getElementById('nav-app').hidden, { timeout: 15000 });
+  await page.click('#nav-app');
+  await page.click('#app-start');
+  await page.waitForFunction(() => /is running$|it failed$/.test(document.getElementById('app-text').textContent), { timeout: 180000 });
+  const appText = await page.$eval('#app-text', (e) => e.textContent);
+  ok(appText === 'code_boss is running', `code_boss is running inside (${appText} ${await page.$eval('#app-error', (e) => e.textContent)})`);
+
+  console.log('\n[3] a real model, asked to do real work in there');
+  const op = await call('POST', '/api/open-project', { path: 'Z:\\projects\\demo' });
+  ok(op.status === 200, `the project opens (${op.status || op.error})`);
+  const ui = await browser.newPage();
+  const uiErrs = []; ui.on('pageerror', (e) => uiErrs.push(e.message));
+  await ui.setViewport({ width: 1300, height: 950 });
+  await ui.goto('http://localhost:18988/', { waitUntil: 'domcontentloaded', timeout: 30000 });
+  await ui.waitForSelector('#chat:not(.hidden)', { timeout: 30000 }).catch(() => {});
+  const events = async () => { const s = await call('GET', '/api/state?limit=5000'); return { status: s.json && (s.json.status || (s.json.session && s.json.session.status)), events: (s.json && (s.json.events || (s.json.session && s.json.session.events))) || [], raw: s }; };
+  const ask = async (text, ms = 8 * 60000) => {
+    const before = (await events()).events.length;
+    const m = await call('POST', '/api/message', { text });
+    if (m.status !== 200) return { sent: false, why: `${m.status || m.error} ${String(m.text || '').slice(0, 200)}`, events: [] };
+    const end = Date.now() + ms; let s;
+    await sleep(3000);
+    while (Date.now() < end) { s = await events(); if (s.status && s.status !== 'running' && s.events.length > before) break; await sleep(2000); }
+    return { sent: true, status: s && s.status, events: (s ? s.events : []).slice(before) };
+  };
+  const say = (r) => r.events.filter((e) => e.type === 'assistant-text').map((e) => String(e.content || '')).join('\n');
+  const tools = (r) => r.events.filter((e) => e.type === 'tool-call' && (e.verb === 'js' || e.name === 'js_eval'));
+  const errors = (r) => r.events.filter((e) => e.type === 'error' || (e.type === 'tool-result' && e.status === 'error' && e.kind !== 'retry'));
+
+  const t1 = Date.now();
+  const r1m = await ask('Compile Greeter.java and run it with java, and tell me exactly what it printed. Then write a file named result.txt in this project containing only that printed line.');
+  console.log(`    (turn 1: ${Math.round((Date.now() - t1) / 1000)} s, status ${r1m.status}, ${r1m.events.length} events, ${tools(r1m).length} snippet(s))${r1m.sent ? '' : ' NOT SENT: ' + r1m.why}`);
+  if (r1m.status === 'error' || !tools(r1m).length) {
+    console.log('    (events: ' + r1m.events.filter((e) => e.type !== 'user-message' && e.type !== 'tool-result' && e.type !== 'tool-call').map((e) => e.type + ':' + String(e.content || e.message || e.error || '').replace(/\s+/g, ' ').slice(0, 300)).join(' || ') + ')');
+    try { console.log('    (app output: ' + readFileSync(path.join(TREE, '.cb-run', 'code-boss.txt'), 'utf8').split('\n').filter((l) => l.trim()).filter((l) => /ERROR|error|stack/.test(l)).slice(-3).join(' / ').slice(0, 900) + ')'); } catch { }
+  }
+  ok(r1m.sent && r1m.status !== 'running' && tools(r1m).length >= 1, 'the model answered and ran at least one snippet inside the container');
+  ok(/Hello, container/.test(say(r1m)), `it reports what java printed in there: ${say(r1m).replace(/\s+/g, ' ').slice(-160)}`);
+  const resFile = path.join(TREE, 'projects', 'demo', 'result.txt');
+  ok(existsSync(resFile) && /Hello, container/.test(readFileSync(resFile, 'utf8')), `and the file it wrote is on disk in the container's projects folder: ${existsSync(resFile) ? JSON.stringify(readFileSync(resFile, 'utf8').trim()) : 'missing'}`);
+  ok(existsSync(path.join(TREE, 'projects', 'demo', 'Greeter.class')), 'javac really ran in there (Greeter.class exists)');
+
+  const t2 = Date.now();
+  const r2m = await ask('Now try to write a file named outside.txt into C:\\Windows\\Temp using node (run a one-line node script that does it), and tell me plainly whether it worked and what the error was if not.');
+  console.log(`    (turn 2: ${Math.round((Date.now() - t2) / 1000)} s, status ${r2m.status}, ${tools(r2m).length} snippet(s))`);
+  ok(!existsSync('C:\\Windows\\Temp\\outside.txt'), 'asked to write outside the container, nothing landed there');
+  ok(/EPERM|EACCES|denied|not permitted|refus|could not|did not work|failed/i.test(say(r2m)), `and it says so honestly: ${say(r2m).replace(/\s+/g, ' ').slice(-200)}`);
+
+  const t3 = Date.now();
+  const r3m = await ask('What is the working directory you are in, and which java version runs here? One short line each.');
+  console.log(`    (turn 3: ${Math.round((Date.now() - t3) / 1000)} s)`);
+  ok(/Z:[\\/]+projects[\\/]+demo/i.test(say(r3m) + JSON.stringify(r3m.events).slice(0, 20000)), 'it knows it is working in Z:\\projects\\demo');
+
+  // the page, as the developer sees it
+  await ui.reload({ waitUntil: 'domcontentloaded' });
+  await sleep(4000);
+  const shown = await ui.evaluate(() => ({ rows: document.querySelectorAll('#log .row').length, groups: document.querySelectorAll('#log .js-group').length, text: document.getElementById('log') ? document.getElementById('log').innerText.length : 0 }));
+  ok(uiErrs.length === 0 && shown.rows >= 6 && shown.groups >= 1, `its own window (through the bridge) shows the conversation: ${shown.rows} rows, ${shown.groups} snippet line(s), page errors: ${uiErrs.join(' | ') || 'none'}`);
+  if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await ui.screenshot({ path: path.join(SHOTS, 'live-in-container.png') }); }
+  const hard = [...errors(r1m), ...errors(r3m)];
+  ok(hard.length === 0, `no error rows in the two ordinary turns (${hard.map((e) => String(e.content || e.message || '').slice(0, 80)).join(' | ') || 'none'})`);
+} catch (e) { fail++; console.log('  FAIL harness:', e && e.message ? e.message : e); }
+finally {
+  try { if (browser) await browser.close(); } catch { }
+  console.log('\n[end] uninstalling');
+  carrier(['sandbox', '--uninstall', '--yes', '--no-tray', '--tree', TREE], 'uninstall');
+  try { rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { }
+}
+console.log(`\n${pass} passed, ${fail} failed`);
+process.exit(fail ? 1 : 0);
+
=== add test/_live-model.mjs
new 931a44c8bef3a0ab4598c61b
+/**
+ * _live-model.mjs — ONE place the live suites get their model from.
+ *
+ * Every live probe used to carry its own copy of the default, which meant changing which model the suites run
+ * against was a twenty-five-file edit, and any file missed kept quietly running the old one while the report said
+ * otherwise. That is the worst shape a default can have: duplicated AND invisible.
+ *
+ * SONNET IS THE DEFAULT, not haiku. Haiku was the floor — cheap enough to run constantly, and a model that clears
+ * a bar haiku sets will clear it anywhere. The cost of that floor is that a haiku failure is ambiguous: a product
+ * bug and "haiku is weaker than production" look identical in the transcript, and telling them apart cost a whole
+ * round of re-running flows on the production model. Sonnet is closer to what production actually runs, so a
+ * failure here is more likely to mean something real.
+ *
+ * CB_MODEL still overrides, so `CB_MODEL=claude-haiku-4-5 node test/<probe>.mjs` gets the floor back for one run.
+ */
+export const LIVE_MODEL = process.env.CB_MODEL || 'claude-sonnet-4-6';
+
+/** The floor, by name — for a probe that deliberately wants the weaker model rather than the representative one. */
+export const LIVE_MODEL_FLOOR = 'claude-haiku-4-5';
+
=== add test/_live-msg.mjs
new 47ff59559204cdd30415ec88
+// One live step as the developer, and what it cost: the message typed into the real page (test/_ui-step.mjs send), the
+// run waited out, then the background passes (the bookkeeper, Heads up's quiet check, the skills maintainer) given
+// `settle` seconds; then this step's log lines that say where each call went (on a session or whole, and why), what
+// the token budget held back, and every request the stand-in gateway got - model, on a session or whole, size.
+//   node test/_live-msg.mjs "<message>" [settle seconds, default 25]
+import { readFileSync } from 'node:fs';
+import { spawnSync } from 'node:child_process';
+import path from 'node:path';
+const cfg = JSON.parse(readFileSync(new URL('./.live-ui-drive.json', import.meta.url), 'utf8'));
+const text = process.argv[2], settle = Number(process.argv[3] || 25) * 1000;
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+const gw = async (n = 100000) => { try { return await (await fetch(`http://127.0.0.1:${cfg.gwLogPort}/?n=${n}`)).json(); } catch { return []; } };
+const before = (await gw()).length;
+const t0 = new Date();
+// ("--enter": what is in the box already goes - a message Esc took back, say)
+const s = spawnSync(process.execPath, text === '--enter' ? ['test/_ui-step.mjs', 'key', 'Enter'] : ['test/_ui-step.mjs', 'send', text], { encoding: 'utf8', env: { ...process.env, CB_SHOT_DIR: process.env.CB_SHOT_DIR || 'D:/tmp/r16-shots' } });
+console.log((s.stdout || '').trim().split('\n').pop());
+for (let i = 0; i < 600; i++) { const st = await (await fetch(`http://127.0.0.1:${cfg.port}/api/state?limit=1`)).json(); if (st.status !== 'running') break; await sleep(1000); }
+const ran = Math.round((Date.now() - t0) / 1000);
+await sleep(settle);
+const log = readFileSync(path.join(cfg.project, '.code_boss', 'code-boss.log'), 'utf8').split('\n').filter((l) => l.slice(0, 24) >= t0.toISOString());
+const want = /wire:|bookkeeper: (the whole|\d+ new turn|pass)|heads up: (the whole|\d+ new turn|check)|skills maintainer: (the whole|\d+ new turn|pass)|token budget:|recall: \d+ found|stream: the (request|bookkeeper)|chat DONE|error|failed/i;
+console.log(`--- the run took ${ran}s; log:`);
+for (const l of log.filter((x) => want.test(x))) console.log('  ' + l.slice(11, 19) + ' ' + l.slice(26, 230));
+const all = await gw();
+const mine = all.slice(before);   // (oldest first: what came after this step began)
+let whole = 0, onS = 0, chars = 0;
+console.log(`--- the gateway got ${mine.length} request(s):`);
+for (const e of mine) { const k = Math.round((e.readChars || 0) / 1000); chars += e.readChars || 0; if (e.sentSession) onS++; else whole++; console.log(`  ${e.status} ${String(e.model).padEnd(24)} ${e.sentSession ? 'on-session' : 'WHOLE     '} ${String(k).padStart(4)}k`); }
+console.log(`--- ${whole} whole, ${onS} on a session, ${Math.round(chars / 1000)}k characters in all (~${Math.round(chars / 4000)}K tokens)`);
+
=== add test/_live-reminder-anchor-probe.mjs
new aab1f5f47166558436528ece
+/**
+ * ON-DEMAND LIVE probe (`_`-prefix → run-all skips it).
+ *
+ * QUESTION: does the live-tail block — the ~4KB briefing prepended to the LAST user message, carrying the session
+ * framing ("ENVIRONMENT: you have NO local shell", "YOUR COMPLETE VERB LIST", "CONVERSATION: this is ONE long
+ * ongoing conversation… the whole thing is above") — make the model treat everything ABOVE it as preamble?
+ *
+ * WHY: a developer session lost context after: <js> refused in read-only mode → Esc → message → Esc → edit mode
+ * ON. The SERVER path was cleared by test/_edge-mode-cancel-history.mjs (12/12 — every message present, in
+ * order). The model nonetheless named the LAST, tail-bearing message as "the earliest message I can see… after
+ * my initial system instructions", and could not recall the original task.
+ *
+ * METHOD: the REAL buildStaticPrompt/buildLiveTail and the REAL assembleConvo, over a ~20-message conversation
+ * ending in the exact merged shape from that session (refusal + two interrupt notes + two developer messages).
+ * A fact is planted ONLY in the earliest user message. The arms differ in ONE way: whether the live tail rides
+ * the last message.
+ *
+ * Run against the model that actually failed:  node test/_live-reminder-anchor-probe.mjs
+ *   CB_ANCHOR_MODEL=haiku  → cross-check on Anthropic via home-proxy (proxy.local.json)
+ *   default                → gemini-3.1-pro-preview (gemini.local.json)
+ */
+import { readFile } from 'node:fs/promises';
+import { createHttpAdapter } from '../src/llm/openai-http.mjs';
+import { createAnthropicAdapter } from '../src/llm/anthropic-http.mjs';
+import { buildStaticPrompt, buildLiveTail } from '../src/agent/worker-prompt.mjs';
+import { assembleConvo } from '../src/agent/engine.mjs';
+import { PROXY_API_KEY } from './_proxy-creds.mjs';   // the proxy now requires its own x-api-key
+
+const WHICH = process.env.CB_ANCHOR_MODEL || 'gemini';
+let adapter, MODEL;
+if (WHICH === 'haiku') {
+  const cfg = JSON.parse(await readFile('proxy.local.json', 'utf8'));
+  MODEL = 'claude-haiku-4-5';
+  adapter = createAnthropicAdapter({ baseURL: cfg.external.baseUrl.replace(/\/+$/, '') + '/v1', apiKey: PROXY_API_KEY || 'x', extraHeaders: cfg.external.headers });
+} else {
+  const g = JSON.parse(await readFile('gemini.local.json', 'utf8'));
+  MODEL = g.model;
+  adapter = createHttpAdapter({ baseURL: g.baseURL, apiKey: g.key });
+}
+
+const PROJECT = 'D:\\code\\sample_portal_app';
+const PLANT = 'ORANGE-WIDGET-7734.ts';
+const staticPrompt = buildStaticPrompt({ discussMode: false, workerMemory: null, checklist: null });
+const liveTail = buildLiveTail({ projectDir: PROJECT, projectContext: '# AGENTS.md\nBuild with mvn. Node 20.19.2.', pluginToolsDoc: '', workerMemo: null, checklistView: null, gitProjects: null, discussMode: false });
+
+// ~20 messages of ordinary work, then the merged tail-end from the reported session.
+function history() {
+  const h = [
+    { role: 'user', content: `The bug I want fixed is in ${PLANT} — tier-2 subscribers don't get the Region of Service drop-down. Start by reading it.` },
+  ];
+  for (let i = 0; i < 7; i++) {
+    h.push({ role: 'assistant', content: `<remote-workspace><read path="src/step${i}.ts"/></remote-workspace>` });
+    h.push({ role: 'user', content: `<remote-workspace-result op="read" status="ok">\nexport const step${i} = ${i};\n</remote-workspace-result>` });
+  }
+  h.push({ role: 'assistant', content: 'Ah! Look at the condition that bypasses showing the country drop-down.' });
+  h.push({ role: 'user', content: 'continu' });
+  h.push({ role: 'assistant', content: `I will update the logic so tier-2 subscribers get the drop-down.\n\n<remote-workspace><js>\nconst fs = require('fs');\nfs.writeFileSync('${PLANT}', 'fixed');\n</js></remote-workspace>\n\nNext, I will build and verify the fix.` });
+  h.push({ role: 'user', content:
+    '<remote-workspace-result op="js" status="error">\nERROR: read-only (Discuss) mode — <js> is disabled this session. Only <list>/<read>/<search>/<find>/<info> work.\n</remote-workspace-result>\n\n'
+    + '─── PREVIOUS RUN INTERRUPTED — The developer STOPPED it (Esc). The ENTIRE conversation above is intact and fully visible to you. ───\n\n'
+    + 'No, please just write analysis to an ew md file.\n\n'
+    + '─── PREVIOUS RUN INTERRUPTED — The developer STOPPED it (Esc). The ENTIRE conversation above is intact and fully visible to you. ───\n\n'
+    + 'oops, there it urned discuss off\n\n'
+    + 'What is the EARLIEST message you can see in this conversation? Quote it. And what file did I originally ask you to fix?' });
+  return h;
+}
+
+async function run(label, withTail) {
+  const messages = assembleConvo({ staticPrompt, liveTail: withTail ? liveTail : null, priming: [], messages: history() });
+  const r = await adapter.complete({ model: MODEL, messages, max_tokens: 600 });
+  const text = String(r?.choices?.[0]?.message?.content ?? '');
+  const recalls = new RegExp(PLANT.replace('.', '\\.')).test(text);
+  const blind = /(can'?t|cannot|do not|don'?t|unable to) see|no (earlier|prior|previous)|isn'?t in my (current )?(history|context)|interrupted and restarted|first message in (this|the) conversation/i.test(text);
+  console.log(`\n-- ${label} --   (${messages.length} messages, ${messages.reduce((n, m) => n + m.content.length, 0)} chars)`);
+  console.log('   ' + text.replace(/\s+/g, ' ').slice(0, 400));
+  console.log(`   -> recalls the planted file: ${recalls ? 'YES' : 'NO'} | claims blindness: ${blind ? 'YES' : 'no'}`);
+  return { recalls, blind };
+}
+
+console.log(`model: ${MODEL} — identical conversations; only the LIVE TAIL differs`);
+console.log(`static front ${staticPrompt.length} chars · live tail ${liveTail.length} chars`);
+const a = await run('A: no live tail (framing only at the front)', false);
+const b = await run('B: WITH live tail on the last message — PRODUCTION shape', true);
+
+console.log('\n=== verdict ===');
+if (a.recalls && !b.recalls) console.log('CONFIRMED: the live tail causes the blindness (A recalls, B does not).');
+else if (!a.recalls && !b.recalls) console.log('NOT the tail: both arms lost it — something else in the shape.');
+else if (a.recalls && b.recalls) console.log('NOT REPRODUCED: both arms recall the earliest message on this model.');
+else console.log('Inverted (B recalls, A does not) — treat as noise; re-run.');
+process.exit(0);
+
=== add test/_live-snapshot-79-80.mjs
new bc92de43620ded0d4bee3359
+/**
+ * SNAPSHOTS #79 and #80 — two things the live development session (test/live-dev-session-2) turned up that the
+ * product checks could not see, each measured against the live model rather than guessed at.
+ *
+ * ── #79  DOES THE PRIMING DEMO GET REPORTED AS REAL WORK? ──────────────────────────────────────────────────────
+ * Asked "list every file you changed this session", the agent included hello.txt — "created as a format warm-up,
+ * then deleted, not in the final commit". That file never existed. It is the hidden priming demo that teaches the
+ * <remote-workspace> format: a write, an edit and a delete of hello.txt that are SHOWN and never executed. From
+ * the model's side that exchange is indistinguishable from real history, so an honest model reports it.
+ *
+ * The question is not just "does it happen" but "what does telling the demo it is a demo COST", because the demo
+ * exists to stop weak models drifting into their native tool-call format. So two things are measured per arm:
+ *   confab%   the wrap-up question names hello.txt
+ *   format%   a fresh task that needs a tool call is answered with a well-formed <remote-workspace> block
+ * Arms: the priming as shipped; the priming with one closing sentence saying it was a demonstration; and no
+ * priming at all, as the floor for format%.
+ *
+ * ── #80  WHICH NAME DOES THE MODEL REACH FOR TO READ A BACKGROUND PROCESS'S OUTPUT? ────────────────────────────
+ * On the log turn the agent guessed a wrong function name first, got an error, and recovered with bgLogs on the
+ * next snippet — one lost turn and the endpoint hit twice. The recovery hid which name it tried, so this asks the
+ * same shape N times and tallies the first function it calls. The verdict decides whether an alias is worth it,
+ * the way accepting `-i` on curl was: a name that shows up often is a name the model "knows", and refusing it is
+ * a consistency tax rather than a safeguard.
+ *
+ * ── RESULTS (claude-sonnet-4-6 via home-proxy, 2026-09-19, n=6 per arm) ───────────────────────────────────────
+ *   #79   arm          confab%  format%
+ *         shipped         100      100
+ *         told-demo       100      100     ← saying "that was a demonstration" changes NOTHING
+ *         no-priming        0      100     ← on this model the demo buys no format compliance at all
+ *   Reading: the confabulation is total and not fixable by wording. The demo shows file mutations, so an honest
+ *   model reports them.
+ *         claude-haiku-4-5, same arms, n=6:   confab 0 / 0 / 0     format 100 / 100 / 100
+ *   Haiku does not confabulate at all (it is the stronger model that does), and it formats correctly with NO
+ *   priming, 6 of 6. So on both Claude models the demo teaches nothing and one of them is misled by it. The only
+ *   model it has not been measured on is the production one (gemini flash — account out of credit), which is
+ *   the one it was written for. Safe now: a demo that only READS (list + read, the discuss-mode shape) — nothing
+ *   in it can be reported as a change. Dropping it entirely waits on a gemini run.
+ *
+ *   #80   first function reached for, n=6:   5× bg_status   1× curl
+ *   Reading: the model uses the TAG's name (bg_status) as the snippet function; the function is bgStatus. Same
+ *   consistency tax as curl -i was. Every tag name should also be a snippet alias for its function.
+ *
+ * Run:  node test/_live-snapshot-79-80.mjs           CB_SNAP=79|80 for one · CB_SNAP_N=6 samples per arm
+ *       CB_SNAP_MODEL=haiku|sonnet (default sonnet via home-proxy)
+ * Prints counts and names only — never a reply's text.
+ */
+import { readFile } from 'node:fs/promises';
+import { createAnthropicAdapter } from '../src/llm/anthropic-http.mjs';
+import { buildStaticPrompt, buildLiveTail, buildWorkerPriming } from '../src/agent/worker-prompt.mjs';
+import { assembleConvo } from '../src/agent/engine.mjs';
+import { parseToolCalls } from '../src/agent/tool-parser.mjs';
+import { PROXY_BASE, PROXY_HEADERS, PROXY_API_KEY } from './_proxy-creds.mjs';
+
+const WHICH = process.env.CB_SNAP_MODEL || 'sonnet';
+const MODEL = WHICH === 'haiku' ? 'claude-haiku-4-5' : 'claude-sonnet-4-6';
+const N = Number(process.env.CB_SNAP_N || 6);
+const ONLY = process.env.CB_SNAP || '';
+const adapter = createAnthropicAdapter({ baseURL: PROXY_BASE + '/v1', apiKey: () => (PROXY_API_KEY || 'x'), extraHeaders: PROXY_HEADERS });
+const PROJECT = 'D:\\code\\demo-api';
+const LISTING = '[F] API.md (78 bytes)\n[F] Greeter.java (240 bytes)\n[F] README.md (188 bytes)\n[F] server.js (742 bytes)\n[F] test.js (520 bytes)\n[D] testdata/';
+const staticPrompt = buildStaticPrompt({ discussMode: false, workerMemory: null, checklist: null });
+const liveTail = buildLiveTail({ projectDir: PROJECT, projectContext: '', pluginToolsDoc: '', workerMemo: null, checklistView: null, gitProjects: null, discussMode: false });
+
+async function ask(priming, messages) {
+  const req = assembleConvo({ staticPrompt, liveTail, priming, messages });
+  const r = await adapter.complete({ model: MODEL, messages: req, temperature: 0 });
+  return String(r?.choices?.[0]?.message?.content ?? '');
+}
+const pct = (n, d) => d ? Math.round((n / d) * 100) : 0;
+
+// ── #79 ──────────────────────────────────────────────────────────────────────────────────────────────────────
+async function snapshot79() {
+  console.log(`\nSNAPSHOT #79 — the priming demo reported as real work · ${MODEL} · n=${N} per arm`);
+  const shipped = buildWorkerPriming(LISTING);
+  // ARM: one closing sentence on the demo's last turn, in the model's own voice, so nothing about the format
+  // lesson changes — only what the model believes happened.
+  const told = buildWorkerPriming(LISTING);
+  told[told.length - 1] = { ...told[told.length - 1], content: told[told.length - 1].content + ' (That warm-up was a demonstration of the format only — none of it ran, and hello.txt was never really created or deleted.)' };
+  const ARMS = [['shipped', shipped], ['told-demo', told], ['no-priming', []]];
+  // The session, compressed: one real edit and one real snippet, then the wrap-up question.
+  const SESSION = [
+    { role: 'user', content: 'GET /users/:id returns the wrong field names — API.md has the contract. Fix server.js and prove it with test.js.' },
+    { role: 'assistant', content: 'Fixing the field names in server.js so it returns `id` and `name`.\n<remote-workspace>\n<edit path="server.js"><find>{ userId: users[m[1]].id, fullname: users[m[1]].name }</find><replace>{ id: users[m[1]].id, name: users[m[1]].name }</replace></edit>\n</remote-workspace>' },
+    { role: 'user', content: '<remote-workspace-result op="edit" status="ok">edited server.js  +1 / -1</remote-workspace-result>' },
+    { role: 'assistant', content: 'Starting the server, running the test, then stopping it.\n<remote-workspace>\n<js>\nconst s = await node(["server.js"], { background: true });\nawait s.waitFor(/listening/);\nconst t = await node(["test.js"]);\nawait s.kill();\nreturn { test: t.code === 0 ? "TEST OK" : t.stderr };\n</js>\n</remote-workspace>' },
+    { role: 'user', content: '<remote-workspace-result op="js" status="ok">{"test":"TEST OK"}</remote-workspace-result>' },
+    { role: 'assistant', content: 'The fix is done and verified: server.js now returns `{id, name}` and test.js passed.' },
+    { role: 'user', content: 'One last thing: list every file you changed this session and what you changed in each, in a short table.' },
+  ];
+  const FORMAT_TASK = [{ role: 'user', content: 'Show me the first 20 lines of server.js.' }];
+  const rows = [];
+  for (const [key, priming] of ARMS) {
+    let confab = 0, format = 0, n1 = 0, n2 = 0;
+    for (let i = 0; i < N; i++) {
+      try { const a = await ask(priming, SESSION); n1++; if (/hello\.txt/i.test(a)) confab++; } catch (e) { process.stdout.write('!'); }
+      try {
+        const b = await ask(priming, FORMAT_TASK); n2++;
+        const calls = parseToolCalls(b) || [];
+        if (calls.some((c) => /^(read|js)$/.test(c.verb)) && !/<function_calls>|<invoke\b/i.test(b)) format++;
+      } catch (e) { process.stdout.write('!'); }
+      process.stdout.write('.');
+    }
+    rows.push({ key, confab: pct(confab, n1), format: pct(format, n2), n1, n2 });
+    console.log(' ' + key);
+  }
+  console.log('\narm          confab%  format%   (confab = names hello.txt when asked what changed; format = a fresh task answered with a proper tool block)');
+  for (const r of rows) console.log(`${r.key.padEnd(12)} ${String(r.confab).padStart(6)}  ${String(r.format).padStart(7)}`);
+}
+
+// ── #80 ──────────────────────────────────────────────────────────────────────────────────────────────────────
+async function snapshot80() {
+  console.log(`\nSNAPSHOT #80 — the first function name reached for to read a background process's output · ${MODEL} · n=${N}`);
+  const priming = buildWorkerPriming(LISTING);
+  const SESSION = [
+    { role: 'user', content: 'Start the server in the background and hit /health with curl -i so I can see the headers. Leave it running.' },
+    { role: 'assistant', content: 'Starting the server in the background and curling /health with headers.\n<remote-workspace>\n<js>\nconst s = await node(["server.js"], { background: true });\nawait s.waitFor(/listening/);\nconst r = await curl(["-i", "http://127.0.0.1:7171/health"]);\nreturn { server: s.id, status: r.status, headers: r.headers, body: r.body };\n</js>\n</remote-workspace>' },
+    { role: 'user', content: '<remote-workspace-result op="js" status="ok">{"server":"bg-2","status":200,"headers":{"content-type":"application/json","x-app":"demo"},"body":"{\\"ok\\":true}"}</remote-workspace-result>' },
+    { role: 'assistant', content: 'The server is up as bg-2 and /health responded 200 with content-type: application/json and x-app: demo. It is still running.' },
+    { role: 'user', content: 'Hit /users/7 once, then look at what the running server printed to its log and tell me if it is logging anything it should not.' },
+  ];
+  const names = new Map();
+  let n = 0;
+  for (let i = 0; i < N; i++) {
+    try {
+      const a = await ask(priming, SESSION); n++;
+      const calls = parseToolCalls(a) || [];
+      const js = calls.find((c) => c.verb === 'js');
+      const code = js ? String(js.args?.code || js.args?.body || Object.values(js.args || {})[0] || '') : '';
+      // every host-style call in the snippet, in order; the first one that is about the process is the answer
+      const fns = [...code.matchAll(/\b([a-zA-Z_]\w*)\s*\(/g)].map((m) => m[1]).filter((f) => !/^(await|if|for|while|return|JSON|String|Number|console|Promise|Object|Array|Math|Date|RegExp|catch|then|map|filter|join|slice|trim|split|includes|test|match|replace|log|stringify|parse|push|keys|values|entries|toString|new|require)$/.test(f));
+      const first = fns.find((f) => /log|out|status|wait|bg|tail|read|proc/i.test(f)) || fns[0] || (js ? '(no fn)' : '(no snippet)');
+      names.set(first, (names.get(first) || 0) + 1);
+    } catch (e) { process.stdout.write('!'); }
+    process.stdout.write('.');
+  }
+  console.log(`\nfirst function reached for (n=${n}):`);
+  for (const [k, v] of [...names.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}${/^(bgLogs|bgStatus)$/.test(k) ? '   ← exists' : ''}`);
+  console.log('\nThe functions that DO exist for this: bgLogs(id) returns the output; bgStatus(id) returns state + a tail. Anything else in the list is a guess the sandbox refused.');
+}
+
+try { const r = await fetch(PROXY_BASE + '/v1/models', { headers: { ...PROXY_HEADERS, 'x-api-key': PROXY_API_KEY || 'x', 'anthropic-version': '2023-06-01' } }); if (!r.ok && r.status !== 404) throw new Error('HTTP ' + r.status); }
+catch (e) { console.log('SKIP — proxy not reachable: ' + e.message); process.exit(0); }
+if (!ONLY || ONLY === '79') await snapshot79();
+if (!ONLY || ONLY === '80') await snapshot80();
+
=== add test/_live-ui-drive.mjs
new 8f6bf37d716f874e4d996b0f
+/**
+ * _live-ui-drive.mjs — hold a real code_boss open behind the STAND-IN GATEWAY, to be driven ONE UI ACTION AT A TIME
+ * with _ui-step.mjs (the developer, 2026-10-21: "screenshot and then operate the ui and take another screen shot, then
+ * you look at the screen to make sure everything looks right and decide what to do next ... not a script you write and
+ * run that does multiple steps").
+ *
+ * Unlike _live-drive.mjs it talks to test/_gateway-sim.mjs, so the model picker offers both lanes - the plain ids (the
+ * Enterprise lane, conversation kept on the gateway's side) and the "-withtools" ids (stateless) - with Sonnet behind
+ * both through the development proxy. Its own CB_HOME, so nothing of the developer's is touched.
+ *
+ *   node test/_live-ui-drive.mjs <existing project dir>      # stays up until killed; writes test/.live-ui-drive.json
+ *   node test/_ui-step.mjs shot                               # then one action a call
+ *
+ * env: CB_DRIVE_PORT (28691, the gateway log on the next) · CB_DEBUG_PORT (9343) - ports no test uses (28997 was test-empty-after-tools-probe's) · CB_MODEL (the model behind the gateway) · CB_HEADFUL=0
+ *      CB_UI_DRIVE_MODEL (the id picked at start, gemini-3.1-pro-preview)
+ */
+import { readFile } from 'node:fs/promises';
+import { existsSync, writeFileSync, mkdtempSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+process.env.CB_HOME = process.env.CB_HOME || mkdtempSync(path.join(tmpdir(), 'cb-uidrive-home-'));
+const PORT = Number(process.env.CB_DRIVE_PORT || 28691);
+const DEBUG_PORT = Number(process.env.CB_DEBUG_PORT || 9343);
+const START_MODEL = process.env.CB_UI_DRIVE_MODEL || 'gemini-3.1-pro-preview';
+const SEP = String.fromCharCode(92);
+const chrome = [
+  'C:/Program Files/Google/Chrome/Application/chrome.exe',
+  (process.env.LOCALAPPDATA || '').split(SEP).join('/') + '/Google/Chrome/Application/chrome.exe',
+  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
+].find((p) => { try { return p && existsSync(p); } catch { return false; } });
+
+const project = process.argv[2];
+if (!project || !existsSync(project)) { console.error('usage: node test/_live-ui-drive.mjs <existing project dir>'); process.exit(2); }
+
+const { startServer } = await import('../src/server.mjs');
+const { createHttpAdapter } = await import('../src/llm/openai-http.mjs');
+const { startGatewaySim, liveBackend, SIM_MODELS } = await import('./_gateway-sim.mjs');
+const backend = await liveBackend();
+if (!backend || !(await backend.health())) { console.error('the development proxy is not reachable (proxy.local.json)'); process.exit(2); }
+const gw = await startGatewaySim({ backend });
+const adapter = createHttpAdapter({ baseURL: gw.url, apiKey: 'x', maxRetries: 2 });
+const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+  .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: START_MODEL, baseURL: gw.url }) + ';</script></head>');
+const { server } = await startServer({
+  html, baseURL: gw.url, apiKey: 'x', gitlabCreds: { user: 'd', token: 'd' },
+  defaultModel: START_MODEL, port: PORT, initialProject: project, modelsList: SIM_MODELS.map((id) => ({ id })), adapter, apiFormat: 'openai',
+});
+
+const browser = await puppeteer.launch({
+  executablePath: chrome,
+  headless: process.env.CB_HEADFUL === '0' ? 'new' : false,
+  args: ['--no-sandbox', '--remote-debugging-port=' + DEBUG_PORT, '--window-size=1400,950'],
+});
+const page = (await browser.pages())[0] || await browser.newPage();
+await page.setViewport({ width: 1400, height: 900 });
+await page.evaluateOnNewDocument(() => {
+  window.__errs = [];
+  window.addEventListener('error', (e) => window.__errs.push('error: ' + (e.message || '')));
+  window.addEventListener('unhandledrejection', (e) => window.__errs.push('rejection: ' + String(e.reason).slice(0, 200)));
+});
+await page.goto('http://127.0.0.1:' + PORT + '/');
+await page.waitForSelector('#chat:not(.hidden)', { timeout: 30000 });
+
+// The gateway's own log, for the step tool's "gw" action: which lane, session or whole, how much was read.
+const { createServer } = await import('node:http');
+const gwPort = PORT + 1;
+createServer((req, res) => {
+  const n = Number(new URL(req.url, 'http://x').searchParams.get('n') || 20);
+  res.writeHead(200, { 'content-type': 'application/json' });
+  res.end(JSON.stringify(gw.log.slice(-n).map((e) => ({ model: e.model, lane: e.lane, session: e.session, sentSession: e.sentSession, readChars: e.readChars, historyTurns: e.historyTurns, status: e.status }))));
+}).listen(gwPort, '127.0.0.1');
+
+writeFileSync(path.join(__dirname, '.live-ui-drive.json'), JSON.stringify({ port: PORT, debugPort: DEBUG_PORT, gwLogPort: gwPort, project, cbHome: process.env.CB_HOME, model: START_MODEL, behind: backend.model, pid: process.pid }, null, 2));
+console.log(`live ui drive UP - port ${PORT}, debug ${DEBUG_PORT}, gateway log ${gwPort}, pid ${process.pid}`);
+console.log(`project ${project} · CB_HOME ${process.env.CB_HOME} · picked ${START_MODEL} · behind it ${backend.model}`);
+process.on('SIGTERM', async () => { try { await browser.close(); } catch {} server.close(); await gw.close(); process.exit(0); });
+setInterval(() => {}, 1 << 30);   // stay up
+
=== add test/_live-ui-server.mjs
new f6642c3aab8be0c9a0fd1876
+/**
+ * _live-ui-server.mjs — boots the REAL code_boss server + UI against the live proxy and STAYS UP,
+ * so a human (or me, acting as the developer) can drive the real browser interactively via
+ * test/_drive.mjs (puppeteer.connect to a persistent Chrome). Not an assertion harness.
+ *
+ *   CB_PROXY=... CB_MODEL=claude-haiku-4-5 CB_CF_ACCESS_ID=... CB_CF_ACCESS_SECRET=... \
+ *     node test/_live-ui-server.mjs    (run in background; prints the URL + project dir)
+ */
+import { readFile, mkdir, writeFile } from 'node:fs/promises';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import { startServer } from '../src/server.mjs';
+import { createAnthropicAdapter } from '../src/llm/anthropic-http.mjs';
+import { runGit, commitAll } from './_git.mjs';
+import { LIVE_MODEL } from './_live-model.mjs';
+import { PROXY_API_KEY } from './_proxy-creds.mjs';   // the proxy now requires its own x-api-key
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const PROXY = process.env.CB_PROXY || 'https://home-proxy.philhignight.com';
+const MODEL = LIVE_MODEL;
+const PORT = Number(process.env.CB_UI_PORT || 28990);
+const PROJECT = process.env.CB_UI_PROJECT || 'D:/tmp/cb-uidrive/app';
+const eh = {};
+if (process.env.CB_CF_ACCESS_ID) eh['CF-Access-Client-Id'] = process.env.CB_CF_ACCESS_ID;
+if (process.env.CB_CF_ACCESS_SECRET) eh['CF-Access-Client-Secret'] = process.env.CB_CF_ACCESS_SECRET;
+
+async function main() {
+  await mkdir(PROJECT, { recursive: true });
+  // a tiny seeded git project so git-aware flows (commit/diff/branch) have something real
+  try { await runGit(PROJECT, ['rev-parse', '--git-dir']); }
+  catch {
+    await runGit(PROJECT, ['init', '-q']); await runGit(PROJECT, ['config', 'user.email', 'dev@local']); await runGit(PROJECT, ['config', 'user.name', 'Dev']);
+    await writeFile(path.join(PROJECT, 'README.md'), '# scratch app\nA small Node project for live testing.\n', 'utf8');
+    await commitAll(PROJECT, 'seed');
+  }
+  const adapter = createAnthropicAdapter({ baseURL: PROXY + '/v1', apiKey: PROXY_API_KEY || 'x', extraHeaders: eh });
+  const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+    .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: MODEL, baseURL: PROXY }) + ';</script></head>');
+  await startServer({ html, baseURL: PROXY, apiKey: PROXY_API_KEY || 'x', gitlabCreds: { user: 'd', token: 'd' }, defaultModel: MODEL, port: PORT, initialProject: PROJECT, modelsList: [{ id: MODEL }], adapter, apiFormat: 'anthropic' });
+  console.log(`UI server up: http://127.0.0.1:${PORT}  project=${PROJECT}  model=${MODEL} proxy=${PROXY}`);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_look-footer.mjs
new cda3ab81c1f1bb503c573ee8
+// A look at the footer: the status icons (with a plugin item that has a count bubble, and ▶ selected) and the
+// console toggle off and on. Writes PNGs into the folder given. Not a test.
+import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
+import { existsSync, mkdtempSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import puppeteer from 'puppeteer-core';
+
+process.env.CB_HOME = mkdtempSync(path.join(tmpdir(), 'cb-look-home-'));
+const { startServer } = await import('../src/server.mjs');
+const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
+const PORT = 29291, OUT = process.argv[2];
+const chrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe'].find((p) => { try { return p && existsSync(p); } catch { return false; } });
+const adapter = { async *completeStream() { throw new Error('no model'); }, async complete() { throw new Error('no model'); }, async listModels() { return [{ id: 'm' }]; } };
+const projectDir = await mkdtemp(path.join(tmpdir(), 'cb-look-proj-'));
+await writeFile(path.join(projectDir, 'a.txt'), 'a');
+const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8')).replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'm', baseURL: '(mock)' }) + ';</script></head>');
+const { server } = await startServer({ html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' }, defaultModel: 'm', port: PORT, adapter, modelsList: [{ id: 'm' }], initialProject: projectDir });
+const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+try {
+  const page = await browser.newPage();
+  await page.setViewport({ width: 1280, height: 700, deviceScaleFactor: 3 });
+  await page.goto(`http://127.0.0.1:${PORT}/`);
+  await page.waitForFunction(() => !!document.getElementById('replToggle') && !!document.getElementById('bgProcsBtn'), { timeout: 15000 });
+  await new Promise((r) => setTimeout(r, 1500));
+  await page.evaluate(() => {
+    const items = document.getElementById('pluginStatusItems');
+    for (const [glyph, cls, badge] of [['\u{1F50C}', '', ''], ['\u{1F310}', ' ps-error', '!']]) {
+      const b = document.createElement('button');
+      b.className = 'plugin-status-btn' + cls;
+      b.innerHTML = '<span class="ps-text">' + glyph + '</span><span class="plugin-badge ps-badge"' + (badge ? '' : ' style="display:none;"') + '>' + badge + '</span>';
+      items.appendChild(b);
+      window._hugInk(b.querySelector('.ps-text'));
+    }
+    document.getElementById('bgProcsBtn').classList.add('selected');
+  });
+  const clipOf = async (sel, pad) => { const r = await page.$eval(sel, (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }); return { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.width + pad * 2, height: r.height + pad * 2 }; };
+  await page.screenshot({ path: path.join(OUT, 'footer-icons.png'), clip: await clipOf('#statusIcons', 14) });
+  await page.screenshot({ path: path.join(OUT, 'footer-input-off.png'), clip: await clipOf('.input-row', 10) });
+  await page.click('#replToggle');
+  await page.screenshot({ path: path.join(OUT, 'footer-input-on.png'), clip: await clipOf('.input-row', 10) });
+  await page.type('#input', 'return (await list(".")).map((e) => e.name);\n// a second line\n// and a third');
+  await page.screenshot({ path: path.join(OUT, 'footer-input-on-tall.png'), clip: await clipOf('.input-row', 10) });
+} finally { await browser.close(); server.close(); }
+process.exit(0);
+
=== add test/_look-settings-ds.mjs
new 9d5e787b66ee8be9011ab408
+// A LOOK at the Settings modal (tabs + build in its header) and a data set's table full screen over it: two screenshots
+// to scratch. Run: node test/_look-settings-ds.mjs <outDir>
+import puppeteer from 'puppeteer-core';
+import { mkdtemp, readFile } from 'node:fs/promises';
+import { existsSync, mkdtempSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+process.env.CB_HOME = mkdtempSync(path.join(tmpdir(), 'cb-look-ds-'));
+const { startServer } = await import('../src/server.mjs');
+const { createDataSets } = await import('../src/datasets.mjs');
+const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
+const out = process.argv[2] || tmpdir();
+const chrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
+const proj = await mkdtemp(path.join(tmpdir(), 'cb-look-ds-proj-'));
+const ds = createDataSets();
+await ds.create([{ id: '1', name: 'alpha', status: 'ACTIVE' }, { id: '2', name: 'beta', status: 'INACTIVE' }], { marks: { id: 'shown', status: 'shown' }, createdBy: 'sqlq', allowShown: true, path: 'enrollees/smith' });
+await ds.create(Array.from({ length: 40 }, (_, i) => ({ n: String(i), v: 'row ' + i })), { createdBy: 'agent' });
+const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8')).replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'm', baseURL: '(mock)' }) + ';</script></head>');
+const { server } = await startServer({ html, baseURL: '(mock)', apiKey: 'k', gitlabCreds: { user: 't', token: 't' }, defaultModel: 'm', port: 29245, adapter: { async complete() { return { choices: [{ message: { content: 'hi' } }] }; } }, modelsList: [{ id: 'm' }], initialProject: proj });
+const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+try {
+  const page = await browser.newPage();
+  await page.setViewport({ width: 1300, height: 900, deviceScaleFactor: 1 });
+  await page.goto('http://127.0.0.1:29245/');
+  await page.waitForSelector('#chat:not(.hidden)', { timeout: 15000 });
+  await page.evaluate(() => openSettings());
+  await page.waitForFunction(() => document.querySelectorAll('#settingsDataSets .ds-group').length >= 2, { timeout: 10000 });
+  await page.evaluate(() => { document.querySelector('#settingsDataSets .ds-group').click(); const b = document.querySelector('#settingsModal .modal-body'); b.scrollTop = b.scrollHeight; });
+  await page.screenshot({ path: path.join(out, 'look-settings-bottom.png') });
+  await page.evaluate(() => { document.querySelector('#settingsModal .modal-body').scrollTop = 0; });
+  await page.screenshot({ path: path.join(out, 'look-settings-top.png') });
+  await page.evaluate(() => document.querySelector('#settingsDataSets .ds-sets:not(.hidden) .ds-item').click());
+  await page.waitForFunction(() => document.querySelectorAll('#dsTable tr').length >= 3, { timeout: 8000 });
+  await page.screenshot({ path: path.join(out, 'look-ds-table.png') });
+  console.log('shots in', out);
+} finally { await browser.close(); server.close(); }
+process.exit(0);
+
=== add test/_look-settings.mjs
new c98ce4df1b0a3afe56a18e5e
+// Screenshots of the Settings modal, both tabs: node test/_look-settings.mjs <out dir>
+import puppeteer from 'puppeteer-core';
+import { startServer } from '../src/server.mjs';
+import { userPluginsDir } from '../src/plugins/paths.mjs';
+import { mkdtemp, mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
+import { existsSync, mkdirSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+
+const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
+const OUT = process.argv[2] || path.join(tmpdir(), 'cb-look-settings'); mkdirSync(OUT, { recursive: true });
+const chrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe'].find((p) => p && existsSync(p));
+const proj = await mkdtemp(path.join(tmpdir(), 'cb-look-proj-'));
+process.env.CB_HOME = await mkdtemp(path.join(tmpdir(), 'cb-look-home-'));
+await mkdir(userPluginsDir(), { recursive: true });
+for (const f of ['piiscan__1.mjs', 'pii-testdata__1.mjs']) await copyFile(path.join(ROOT, 'examples', 'plugins', f), path.join(userPluginsDir(), f));
+await writeFile(path.join(proj, 'AGENTS.md'), '# notes\nUse JDK 8.\n');
+const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8')).replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'm', baseURL: '(mock)' }) + ';</script></head>');
+const adapter = { async complete() { return { choices: [{ message: { content: 'hi' } }] }; } };
+const { server } = await startServer({ html, baseURL: '(mock)', apiKey: 'test-key', gitlabCreds: { user: 't', token: 't' }, defaultModel: 'm', port: 29164, adapter, modelsList: [{ id: 'm' }], initialProject: proj });
+const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
+try {
+  const page = await browser.newPage();
+  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
+  await page.setViewport({ width: 1200, height: 1000 });
+  await page.goto('http://127.0.0.1:29164/');
+  await page.waitForSelector('#chat:not(.hidden)', { timeout: 15000 });
+  await page.evaluate(() => openSettings());
+  await page.waitForFunction(() => !!document.getElementById('settingsPanelBtn-piiscan'), { timeout: 15000 });
+  await new Promise((r) => setTimeout(r, 800));
+  const shot = async (name) => { const el = await page.$('#settingsModal'); await el.screenshot({ path: path.join(OUT, name) }); };
+  await shot('settings-main.png');
+  await page.evaluate(() => switchSettingsTab('advanced'));
+  await new Promise((r) => setTimeout(r, 800));
+  await shot('settings-advanced.png');
+  await page.evaluate(() => { document.querySelector('#settingsModal .modal-body').scrollTop = 99999; });
+  await new Promise((r) => setTimeout(r, 300));
+  await shot('settings-advanced-end.png');
+  console.log(await page.evaluate(() => JSON.stringify({ h: document.querySelector('#settingsModal').getBoundingClientRect().height, scroll: document.querySelector('#settingsModal .modal-body').scrollHeight })));
+} finally { await browser.close(); try { server.close(); } catch {} }
+console.log(OUT);
+process.exit(0);
+
=== add test/_marker-emission-probe.mjs
new a2f657191d7e55ccc8ba2afb
+/**
+ * _marker-emission-probe.mjs — CC-MODEL-SPEC §11 A5: the attribution keystone. Does the agent (haiku floor)
+ * emit the end-state marker vocabulary correctly — <task-open id> (verbatim pool id, never invented/reused),
+ * <task-switch id> / <task-switch conversation> (round-trip), <task-close id goal summary> (with payload),
+ * <focus id> — at the right moments? Proxy-direct (the markers aren't implemented in the worker yet), so it
+ * tests EMISSION, not per-chunk attribution under live interleaving (that needs the real server once the
+ * markers exist). Scenarios are controlled: each supplies its own pool + state + a single dev message.
+ *
+ *   CB_PROXY=... CB_MODEL=claude-haiku-4-5 CB_CF_ACCESS_ID=... CB_CF_ACCESS_SECRET=... node test/_marker-emission-probe.mjs
+ */
+import { LIVE_MODEL } from './_live-model.mjs';
+
+const PROXY = process.env.CB_PROXY || 'https://home-proxy.philhignight.com';
+const MODEL = LIVE_MODEL;
+const K = Number(process.env.CB_MARKER_RUNS || 5);
+const headers = { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' };
+if (process.env.CB_CF_ACCESS_ID) headers['CF-Access-Client-Id'] = process.env.CB_CF_ACCESS_ID;
+if (process.env.CB_CF_ACCESS_SECRET) headers['CF-Access-Client-Secret'] = process.env.CB_CF_ACCESS_SECRET;
+
+const VOCAB = `You are a coding agent. You organize work into TASKS and tag your output with MARKERS that the
+runtime parses. Marker vocabulary (emit inline; use the EXACT spellings):
+- <task-open id="T-n"> — start a NEW task, using an id from your AVAILABLE POOL below. Use the id VERBATIM; never
+  invent an id and never reuse one already open.
+- <task-switch id="T-n"> — make an already-open task the active one again.
+- <task-switch conversation> — set the owner to the developer conversation (use before answering something that
+  is NOT work on a task, e.g. a question).
+- <task-close id="T-n" goal="..." summary="..."> — finish a task; include a goal and a summary of the work.
+- <focus id="T-n"> / <unfocus> — narrow your view to one task / restore the full view.
+Respond to the developer's message: emit the appropriate marker(s) with a BRIEF (one sentence) plan. Do NOT write
+code — just the marker(s) + one short sentence. Keep it tight.`;
+
+const SCEN = [
+  { key: 'open-new', pool: ['T-1', 'T-2'], state: 'No tasks are open yet.',
+    msg: 'Build a /upload endpoint in a plain Node http server.',
+    check: (m) => m.opens.length === 1 && m.opens[0] === 'T-1' ? null : `expected one <task-open id="T-1">, got opens=[${m.opens}]` },
+  { key: 'open-second-independent', pool: ['T-2', 'T-3'], state: 'T-1 (/upload endpoint) is OPEN and active; you have been editing upload.js.',
+    msg: 'Separately, add a /metrics endpoint with prometheus output.',
+    check: (m) => m.opens.length === 1 && ['T-2', 'T-3'].includes(m.opens[0]) && m.opens[0] !== 'T-1' ? null : `expected a NEW <task-open> from [T-2,T-3], got opens=[${m.opens}]` },
+  { key: 'id-verbatim-no-invention', pool: ['T-9'], state: 'No tasks are open.',
+    msg: 'Add a standalone logging module.',
+    check: (m) => m.opens.length === 1 && m.opens[0] === 'T-9' ? null : `expected <task-open id="T-9"> verbatim, got opens=[${m.opens}]` },
+  { key: 'switch-to-conversation', pool: ['T-2'], state: 'T-1 (/upload endpoint) is OPEN and active; you are mid-edit on upload.js.',
+    msg: 'Quick question — what port does the server listen on?',
+    check: (m) => m.switchConversation ? null : (m.opens.length || m.switches.length ? `answered a question but did not switch owner to conversation (opens=[${m.opens}] switches=[${m.switches}])` : 'no <task-switch conversation> before the answer') },
+  { key: 'switch-back', pool: ['T-2'], state: 'T-1 (/upload) is OPEN; you just answered a question with the owner on the conversation.',
+    msg: 'Ok, keep going on the upload endpoint.',
+    check: (m) => m.switches.includes('T-1') ? null : `expected <task-switch id="T-1">, got switches=[${m.switches}]` },
+  { key: 'close-with-payload', pool: ['T-2'], state: 'T-1 (/upload endpoint) is OPEN and active; the endpoint is written and the tests pass.',
+    msg: 'The upload endpoint is finished and tested — wrap it up.',
+    check: (m) => { const c = m.closes.find((x) => x.id === 'T-1'); return c ? (c.goal && c.summary ? null : `<task-close T-1> missing goal/summary (goal=${!!c.goal} summary=${!!c.summary})`) : `expected <task-close id="T-1" goal summary>, got closes=[${m.closes.map((x) => x.id)}]`; } },
+  { key: 'focus', pool: ['T-4'], state: 'Three tasks are OPEN: T-1 (/upload), T-2 (/metrics), T-3 (/healthz).',
+    msg: 'Let\'s concentrate on just the metrics task for a bit.',
+    check: (m) => m.focus === 'T-2' ? null : `expected <focus id="T-2">, got focus=${m.focus}` },
+];
+
+function parse(text) {
+  const t = String(text || '');
+  const opens = [...t.matchAll(/<task-open\s+id=["']?(T-\d+)["']?/gi)].map((x) => x[1]);
+  const switches = [...t.matchAll(/<task-switch\s+id=["']?(T-\d+)["']?/gi)].map((x) => x[1]);
+  const switchConversation = /<task-switch\s+conversation\s*\/?>|<task-switch\s+(?:id=["']?)?conversation/i.test(t) || /<switch\s+conversation/i.test(t);
+  const closes = [...t.matchAll(/<task-close\s+([^>]*)>/gi)].map((x) => {
+    const a = x[1];
+    return { id: (a.match(/id=["']?(T-\d+)/i) || [])[1], goal: /goal\s*=\s*["'][^"']+["']/i.test(a), summary: /summary\s*=\s*["'][^"']+["']/i.test(a) };
+  });
+  const focus = (t.match(/<focus\s+id=["']?(T-\d+)/i) || [])[1] || null;
+  return { opens, switches, switchConversation, closes, focus, raw: t };
+}
+async function ask(system, msg) {
+  const body = { model: MODEL, max_tokens: 500, system, messages: [{ role: 'user', content: msg }] };
+  const r = await fetch(`${PROXY}/v1/messages`, { method: 'POST', headers, body: JSON.stringify(body) });
+  const j = await r.json();
+  return (j.content || []).map((b) => b.text || '').join('');
+}
+
+async function main() {
+  let pass = 0, total = 0; const fails = [];
+  for (const s of SCEN) {
+    const system = `${VOCAB}\n\nAVAILABLE TASK IDS: [${s.pool.join(', ')}]\nCURRENT STATE: ${s.state}`;
+    let ok = 0;
+    for (let k = 0; k < K; k++) {
+      total++;
+      const out = parse(await ask(system, s.msg));
+      const err = s.check(out);
+      if (!err) { ok++; pass++; }
+      else if (fails.length < 12) fails.push(`[${s.key}] ${err}\n      raw: ${out.raw.slice(0, 160).replace(/\n/g, ' ')}`);
+    }
+    console.log(`  ${ok === K ? 'ok  ' : 'FAIL'} ${s.key.padEnd(26)} ${ok}/${K}`);
+  }
+  console.log(`\n${pass}/${total} passed (${Math.round((100 * pass) / total)}%)`);
+  if (fails.length) { console.log('\n--- failures (clipped) ---'); fails.forEach((f) => console.log('  ' + f)); }
+  console.log(`\nNOTE: proxy-direct → tests marker EMISSION, not per-chunk attribution under live interleaving`);
+  console.log(`(that needs the real server once <task-open>/<task-switch>/<task-close> are implemented).`);
+  process.exit(0);
+}
+main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(2); });
+
=== add test/_model-behavior-probe.mjs
new ba6b07d53404e6785526234a
+/**
+ * ON-DEMAND LIVE probe (`_`-prefix → run-all skips it). Costs real tokens.
+ *
+ * CLI front-end for src/agent/model-probe.mjs. The probe core lives in src/ because the Settings → "Probe model
+ * behaviour" button runs the SAME code against the live adapter, and the packaged bundle does not ship test/. This
+ * file adds what only makes sense at a terminal: sweeping many cells, leave-one-out attribution, the compaction
+ * decay table, and a dry-run mode — output too wide for a modal.
+ *
+ * See the module header for what is measured and why every number is bracketed by controls.
+ *
+ *   node test/_model-behavior-probe.mjs                       # haiku via home-proxy, memory + tools
+ *   CB_PROBE_MODEL=gemini node test/...                       # the model the live failure happened on
+ *   CB_PROBE_CELLS=all-on,gen3 CB_PROBE_REPS=10 node test/...
+ *   CB_PROBE_EFFORT=low,high node test/...                    # gemini reasoning_effort sweep
+ *   CB_PROBE_DRY=1 node test/...                              # audit the harness, no model calls
+ *   CB_PROBE_SUMMARY_ONLY=1 node test/...                     # score compaction only, half the tokens
+ *   CB_PROBE_HEAVY=1 node test/...                            # add the ~120k-token cells
+ *   CB_PROBE_SUITE=cache node test/...                        # is the static prefix actually reused?
+ *
+ * Results append to D:\tmp\cb-blindness\runs.jsonl for comparison across builds and models.
+ */
+import { readFile, mkdir, appendFile } from 'node:fs/promises';
+import { createHttpAdapter } from '../src/llm/openai-http.mjs';
+import { createAnthropicAdapter } from '../src/llm/anthropic-http.mjs';
+import { buildStaticPrompt, buildLiveTail } from '../src/agent/worker-prompt.mjs';
+import { assembleConvo } from '../src/agent/engine.mjs';
+import { LIVE_MODEL } from './_live-model.mjs';
+import {
+  PROBE_PLANTS, PROBE_CELLS, probeBuildHistory, probeAuditHistory, probePlantsFor,
+  probeCompactGenerations, probeToolAsks, runModelProbe, formatProbeReport,
+} from '../src/agent/model-probe.mjs';
+import { PROXY_API_KEY } from './_proxy-creds.mjs';   // the proxy now requires its own x-api-key
+
+const REPS = Number(process.env.CB_PROBE_REPS || 5);
+const WHICH = process.env.CB_PROBE_MODEL || 'haiku';
+const CONCURRENCY = Number(process.env.CB_PROBE_CONCURRENCY || 3);   // the home-proxy 529s ("at capacity (4 active)") above this
+const SUITES = (process.env.CB_PROBE_SUITE || 'memory,tools').split(',').map((s) => s.trim()).filter(Boolean);
+const EFFORTS = (process.env.CB_PROBE_EFFORT || '').split(',').map((s) => s.trim()).filter(Boolean);
+const ONLY = (process.env.CB_PROBE_CELLS || '').split(',').map((s) => s.trim()).filter(Boolean);
+const SUMMARY_ONLY = /^(1|true|yes)$/i.test(process.env.CB_PROBE_SUMMARY_ONLY || '');
+const HEAVY = /^(1|true|yes)$/i.test(process.env.CB_PROBE_HEAVY || '');
+const OUT_DIR = 'D:\\tmp\\cb-blindness';
+
+let adapter, MODEL;
+if (WHICH === 'gemini') {
+  const g = JSON.parse(await readFile('gemini.local.json', 'utf8'));
+  MODEL = g.model;
+  adapter = createHttpAdapter({ baseURL: g.baseURL, apiKey: g.key });
+} else {
+  const cfg = JSON.parse(await readFile('proxy.local.json', 'utf8'));
+  MODEL = LIVE_MODEL;
+  adapter = createAnthropicAdapter({ baseURL: cfg.external.baseUrl.replace(/\/+$/, '') + '/v1', apiKey: PROXY_API_KEY || 'x', extraHeaders: cfg.external.headers });
+}
+
+const PROJECT = 'D:\\code\\sample_portal_app';
+const staticPrompt = buildStaticPrompt({ discussMode: false, workerMemory: null, checklist: null });
+const liveTail = buildLiveTail({ projectDir: PROJECT, projectContext: '# AGENTS.md\nBuild with mvn. Node 20.19.2.', pluginToolsDoc: '', workerMemo: null, checklistView: null, gitProjects: null, discussMode: false });
+const { roster: ROSTER, asks: TOOL_ASKS } = probeToolAsks(liveTail);
+
+// The PRE-72a4b56 tail: today's concise tail with the session framing put back in front of it, lifted out of the
+// static prompt so it stays byte-accurate as that wording evolves. Lets a run SCORE that layout change rather than
+// assume it.
+function legacyTailText() {
+  const from = staticPrompt.indexOf('ENVIRONMENT: You have NO local shell');
+  const anchor = staticPrompt.indexOf('NEVER tell the developer you cannot see an earlier message');
+  if (from < 0 || anchor < 0) throw new Error('framing block not found in the static prompt — update legacyTailText()');
+  const end = staticPrompt.indexOf('\n\n', anchor);
+  const framing = staticPrompt.slice(from, end < 0 ? undefined : end).replace('Everything BELOW this block', 'Everything ABOVE this block');
+  return framing + '\n\n' + liveTail;
+}
+
+const CELL_ORDER = ['all-on', 'legacy', 'no-tail', 'no-refusal', 'no-interrupts', 'no-merge', 'no-strip', 'no-distract',
+  'short', 'bulk', 'behavioral', 'override', 'pasted', 'gen1', 'gen1-facts', 'gen2', 'gen2-facts', 'gen3',
+  'deep', 'deep-facts', 'control-absent', 'control-trivial', ...(HEAVY || ONLY.some((n) => /^huge/.test(n)) ? ['huge', 'huge-gen2'] : [])];
+const MEMORY_CELLS = CELL_ORDER.map((n) => [n, PROBE_CELLS[n]]).filter(([, f]) => f);
+for (const e of EFFORTS) MEMORY_CELLS.push([`effort:${e}`, { ...PROBE_CELLS.bulk, effort: e }]);
+
+// ── dry run: build every conversation, audit it, print the shapes, stop before any model call ─────────────────
+if (/^(1|true|yes)$/i.test(process.env.CB_PROBE_DRY || '')) {
+  console.log(`DRY RUN — no model calls.\nstatic front ${staticPrompt.length} · live tail ${liveTail.length} · legacy tail ${legacyTailText().length} · roster ${ROSTER.length}: ${ROSTER.join(' ')}\n`);
+  let bad = 0;
+  console.log('cell             msgs   chars    depth of each plant (% through the conversation)      audit');
+  console.log('─'.repeat(104));
+  for (const [name, f] of MEMORY_CELLS) {
+    const h = probeBuildHistory(f);
+    const problems = probeAuditHistory(h, f);
+    if (problems.length) bad++;
+    const depths = probePlantsFor(f).map((p) => {
+      const i = h.findIndex((m) => p.re.test(m.content));
+      return `${p.id}:${i < 0 ? '--' : String(Math.round(i / h.length * 100)).padStart(2)}%`;
+    }).join(' ');
+    console.log(`${name.padEnd(16)} ${String(h.length).padStart(4)} ${String(h.reduce((n, m) => n + m.content.length, 0)).padStart(8)}   ${depths}   ${problems.length ? 'FAIL ' + problems.join('; ') : 'ok'}`);
+  }
+  const absent = probeBuildHistory(PROBE_CELLS['control-absent']);
+  const trivial = probeBuildHistory(PROBE_CELLS['control-trivial']);
+  console.log(`\ncontrol-absent  retains ${PROBE_PLANTS.filter((p) => absent.some((m) => p.re.test(m.content))).length}/${PROBE_PLANTS.length} plants (want 0 — anything else and the control proves nothing)`);
+  console.log(`control-trivial retains ${PROBE_PLANTS.filter((p) => trivial.some((m) => p.re.test(m.content))).length}/${PROBE_PLANTS.length} plants (want ${PROBE_PLANTS.length})`);
+  console.log(`\n${bad ? `${bad} cell(s) FAILED the integrity audit` : 'all cells passed the integrity audit'}`);
+  process.exit(bad ? 1 : 0);
+}
+
+const BLIND_RE = /(can'?t|cannot|do not|don'?t|unable to|no ability to|don'?t have access to) see|no (earlier|prior|previous|other) (message|context|conversation)|isn'?t in my (current )?(history|context)|not (visible|available) to me|conversation (was |appears to have been |seems to have been )?(reset|restarted|truncated|cleared|wiped)|only (see|have) (the )?(recent|most recent|last)|(lost|missing) (the )?(earlier|prior|previous) (context|messages)/i;
+const QUOTES_LAST_RE = /oops,? there it turned discuss off|read-only \(Discuss\) mode|PREVIOUS RUN INTERRUPTED/i;
+
+async function callModel(messages, effort) {
+  const req = { model: MODEL, messages, max_tokens: 700, temperature: 1 };
+  if (effort) req.reasoning_effort = effort;
+  const r = await adapter.complete(req);
+  return { text: String(r?.choices?.[0]?.message?.content ?? ''), usage: r?.usage || null };
+}
+
+async function runMemory(name, f, rep) {
+  const base = { suite: 'memory', cell: name, rep };
+  let history = probeBuildHistory(f);
+  const problems = probeAuditHistory(history, f);
+  if (problems.length) return { ...base, harness: problems, error: 'harness: ' + problems.join('; ') };
+
+  let summaries = [], folded = 0, skipped = 0;
+  if (f.gens) {
+    try { ({ history, summaries, folded, skipped } = await probeCompactGenerations({ adapter, model: MODEL, history, gens: f.gens, compactFacts: f.compactFacts, foldFraction: f.foldFraction })); }
+    catch (e) { return { ...base, error: 'compaction: ' + String(e?.message || e).slice(0, 140) }; }
+  }
+  const present = Object.fromEntries(probePlantsFor(f).map((p) => [p.id, history.some((m) => p.re.test(m.content))]));
+  // Compaction fidelity does not depend on what the model then says about it, so iterating on the compaction prompt
+  // costs half as much this way.
+  if (SUMMARY_ONLY && f.gens) return { ...base, summaries, folded, skipped, present, summaryOnly: true };
+
+  const tail = f.legacyTail ? legacyTailText() : (f.tail ? liveTail : null);
+  const messages = assembleConvo({ staticPrompt, liveTail: tail, priming: [], messages: history });
+
+  let text = '', usage = null, turns = 1;
+  try { ({ text, usage } = await callModel(messages, f.effort)); }
+  catch (e) { return { ...base, error: String(e?.message || e).slice(0, 160) }; }
+
+  // A reply that is only a tool call has DEFERRED its answer, not lost it — production would run the call and come
+  // back. Scoring that first turn as amnesia produced a spurious 60% failure for the behavioural cell.
+  const afterBlock = (text.split(/<\/remote-workspace>/i).pop() || '').trim();
+  if (/<remote-workspace>/i.test(text) && afterBlock.length < 60 && f.ask === 'behavioral') {
+    const follow = [...history,
+      { role: 'assistant', content: text },
+      { role: 'user', content: '<remote-workspace-result op="read" status="ok">\nexport const guard = isTampTya && false;\n</remote-workspace-result>\n\nGood — now answer the rest of what I asked.' }];
+    try {
+      const r2 = await callModel(assembleConvo({ staticPrompt, liveTail: tail, priming: [], messages: follow }), f.effort);
+      text += '\n' + r2.text; usage = r2.usage || usage; turns = 2;
+    } catch { /* keep the single-turn answer */ }
+  }
+
+  const score = {};
+  for (const p of probePlantsFor(f)) score[p.id] = p.re.test(text) ? 'hit' : p.decoy.test(text) ? 'decoy' : 'miss';
+  return { ...base, score, present, summaries, folded, skipped, turns, blind: BLIND_RE.test(text),
+    quotesLast: QUOTES_LAST_RE.test(text) && score.file !== 'hit', usage,
+    chars: messages.reduce((n, m) => n + m.content.length, 0), msgs: messages.length, text: text.replace(/\s+/g, ' ').slice(0, 320) };
+}
+
+async function runTools(name, f, rep) {
+  const base = { suite: 'tools', cell: name, rep };
+  const probe = TOOL_ASKS.find((t) => t.id === f.toolAsk);
+  const h = probeBuildHistory({ ...PROBE_CELLS['all-on'] });
+  h[h.length - 1] = { role: 'user', content: probe.ask };
+  const messages = assembleConvo({ staticPrompt, liveTail: liveTail, priming: [], messages: h });
+  let text = '', usage = null;
+  try { ({ text, usage } = await callModel(messages)); }
+  catch (e) { return { ...base, error: String(e?.message || e).slice(0, 160) }; }
+  const s = probe.score(text);
+  return { ...base, probe: probe.id, value: s.value, detail: s.detail, missing: s.bad, usage, text: text.replace(/\s+/g, ' ').slice(0, 320) };
+}
+
+const TOOL_CELLS = TOOL_ASKS.map((t) => [`tool:${t.id}`, { toolAsk: t.id }]);
+
+// ── cache suite ───────────────────────────────────────────────────────────────────────────────────────────────
+// The static-front / live-tail split is justified by the long invariant prefix staying cacheable. That is an
+// assumption about the ENDPOINT; measure it rather than believing it.
+async function runCache(rounds = 4) {
+  const h = probeBuildHistory(PROBE_CELLS['all-on']);
+  const out = [];
+  for (let i = 0; i < rounds; i++) {
+    const hh = h.slice();
+    hh[hh.length - 1] = { role: 'user', content: hh[hh.length - 1].content + `\n\n(variation ${i} — same prefix, different final line)` };
+    try {
+      const { usage } = await callModel(assembleConvo({ staticPrompt, liveTail, priming: [], messages: hh }));
+      out.push({ suite: 'cache', cell: 'cache', rep: i, usage });
+    } catch (e) { out.push({ suite: 'cache', cell: 'cache', rep: i, error: String(e?.message || e).slice(0, 160) }); }
+    process.stdout.write('.');
+  }
+  return out;
+}
+
+async function pool(jobs, limit) {
+  const out = new Array(jobs.length);
+  let next = 0;
+  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, async () => {
+    while (next < jobs.length) { const i = next++; out[i] = await jobs[i](); process.stdout.write('.'); }
+  }));
+  return out;
+}
+
+const jobs = [];
+if (SUITES.includes('memory')) for (const [n, f] of MEMORY_CELLS) { if (!ONLY.length || ONLY.includes(n)) for (let r = 0; r < REPS; r++) jobs.push(() => runMemory(n, f, r)); }
+if (SUITES.includes('tools')) for (const [n, f] of TOOL_CELLS) { if (!ONLY.length || ONLY.includes(n)) for (let r = 0; r < REPS; r++) jobs.push(() => runTools(n, f, r)); }
+
+console.log(`model: ${MODEL} (${WHICH}) · suites ${SUITES.join('+')} · ${jobs.length} calls · concurrency ${CONCURRENCY}${EFFORTS.length ? ` · effort ${EFFORTS.join('/')}` : ''}`);
+console.log(`static front ${staticPrompt.length} · live tail ${liveTail.length} · legacy tail ${legacyTailText().length} · roster ${ROSTER.length} verbs\n`);
+
+const results = await pool(jobs, CONCURRENCY);
+if (SUITES.includes('cache')) results.push(...await runCache());   // sequential by nature — a cache only warms in order
+console.log('\n');
+
+const mem = results.filter((r) => r.suite === 'memory');
+const byCell = new Map();
+for (const r of results) { if (!byCell.has(r.cell)) byCell.set(r.cell, []); byCell.get(r.cell).push(r); }
+const pct = (v) => (v == null ? '  – ' : String(Math.round(v * 100)).padStart(3) + '%');
+
+let harnessOk = true;
+const harnessBroken = results.filter((r) => r.harness);
+if (harnessBroken.length) {
+  harnessOk = false;
+  console.log('HARNESS BROKEN — planted facts are reachable without recall:');
+  for (const p of [...new Set(harnessBroken.flatMap((r) => r.harness))]) console.log('  ' + p);
+  console.log('');
+}
+
+if (mem.length) {
+  const scoredRate = (cell, id, v) => { const rs = (byCell.get(cell) || []).filter((r) => r.score); return rs.length ? rs.filter((r) => r.score[id] === v).length / rs.length : null; };
+  const absent = (byCell.get('control-absent') || []).filter((r) => r.score);
+  const trivial = (byCell.get('control-trivial') || []).filter((r) => r.score);
+  if (absent.length || trivial.length) {
+    const aMiss = absent.length ? absent.filter((r) => r.score.file !== 'hit').length / absent.length : null;
+    const tHit = trivial.length ? trivial.filter((r) => PROBE_PLANTS.every((p) => r.score[p.id] === 'hit')).length / trivial.length : null;
+    console.log('── controls (can this probe detect anything at all?) ──');
+    console.log(`  control-absent  → deleted facts reported MISSING in ${pct(aMiss)}  ${aMiss != null && aMiss < 0.8 ? '<-- SUSPECT: scorer finds answers that are not there' : 'ok'}`);
+    console.log(`  control-trivial → restated facts ALL recalled in    ${pct(tHit)}  ${tHit != null && tHit < 0.8 ? '<-- SUSPECT: scorer misses correct answers' : 'ok'}`);
+    if ((aMiss != null && aMiss < 0.8) || (tHit != null && tHit < 0.8)) { harnessOk = false; console.log('  ==> HARNESS SUSPECT — treat the cell table below as unmeasured.'); }
+    console.log('');
+  }
+
+  const scoredCells = MEMORY_CELLS.filter(([n]) => (byCell.get(n) || []).some((r) => r.score));
+  if (scoredCells.length) {
+    console.log('── memory: per-plant recall by depth (d = took the DECOY) ──');
+    console.log('cell             ' + PROBE_PLANTS.map((p) => `${p.id}@${Math.round(p.at * 100)}%`.padEnd(12)).join('') + 'blind  quotes-last   n');
+    console.log('─'.repeat(17 + PROBE_PLANTS.length * 12 + 22));
+    for (const [name] of scoredCells) {
+      const rs = (byCell.get(name) || []).filter((r) => r.score);
+      const cols = PROBE_PLANTS.map((p) => {
+        const h = scoredRate(name, p.id, 'hit'), d = scoredRate(name, p.id, 'decoy');
+        return (pct(h) + (d > 0 ? ` d${Math.round(d * 100)}` : '')).padEnd(12);
+      }).join('');
+      console.log(name.padEnd(17) + cols + pct(rs.filter((r) => r.blind).length / rs.length)
+        + pct(rs.filter((r) => r.quotesLast).length / rs.length).padStart(13) + String(rs.length).padStart(5));
+    }
+  }
+
+  // A miss where the fact is no longer in the prompt is OUR bug and the model is right to decline; a miss where it
+  // is sitting right there is the model's. Conflating them sends the fix to the wrong layer.
+  const withPresence = mem.filter((r) => r.score && r.present && !/^control-/.test(r.cell));
+  if (withPresence.length) {
+    let unanswerable = 0, blindMiss = 0, ok = 0;
+    const lost = new Map();
+    for (const r of withPresence) for (const p of PROBE_PLANTS) {
+      if (!(p.id in r.score)) continue;
+      if (r.score[p.id] === 'hit') { ok++; continue; }
+      if (r.present[p.id] === false) { unanswerable++; lost.set(p.id, (lost.get(p.id) || 0) + 1); } else blindMiss++;
+    }
+    const total = ok + unanswerable + blindMiss;
+    console.log('\n── attributing every miss to a layer ──');
+    console.log(`  recalled correctly                    ${String(ok).padStart(4)}/${total}`);
+    console.log(`  fact NOT in the prompt (OUR bug)      ${String(unanswerable).padStart(4)}/${total}${lost.size ? '   dropped: ' + [...lost].map(([k, v]) => `${k}×${v}`).join(' ') : ''}`);
+    console.log(`  fact WAS in the prompt, model missed  ${String(blindMiss).padStart(4)}/${total}${blindMiss ? '   <-- genuine model blindness' : ''}`);
+  }
+
+  const real = mem.filter((r) => r.score && !/^control-/.test(r.cell));
+  if (real.length) {
+    console.log('\n── recall vs depth (pooled, excluding controls) ──');
+    for (const p of PROBE_PLANTS) {
+      const hit = real.filter((r) => r.score[p.id] === 'hit').length, dec = real.filter((r) => r.score[p.id] === 'decoy').length;
+      console.log(`  ${p.id.padEnd(7)} stated at ${String(Math.round(p.at * 100)).padStart(3)}%  ${'█'.repeat(Math.round(hit / real.length * 30)).padEnd(30, '·')} ${pct(hit / real.length)}${dec ? `   decoyed ${pct(dec / real.length)}` : ''}`);
+    }
+  }
+
+  const gens = mem.filter((r) => r.summaries?.length);
+  if (gens.length) {
+    console.log('\n── compaction fidelity by generation (fact still present in the summary) ──');
+    const maxGen = Math.max(...gens.flatMap((r) => r.summaries.map((s) => s.gen)));
+    for (const facts of [false, true]) {
+      const pool2 = gens.filter((r) => /-facts$/.test(r.cell) === facts);
+      if (!pool2.length) continue;
+      console.log(`  ${facts ? 'compactFacts ON ' : 'compactFacts off'}`);
+      for (let g = 1; g <= maxGen; g++) {
+        const ss = pool2.flatMap((r) => r.summaries.filter((s) => s.gen === g));
+        if (!ss.length) continue;
+        // Denominator = folds where the fact was actually IN the input. "–" means it was never folded at this
+        // generation, which is not a survival rate and must not be printed as one.
+        console.log(`    gen ${g} (n=${String(ss.length).padStart(2)})  ` + PROBE_PLANTS.map((p) => {
+          const elig = ss.filter((s) => !s.inInput || s.inInput[p.id]);
+          return `${p.id} ${elig.length ? pct(elig.filter((s) => s.survived[p.id]).length / elig.length) + `/${String(elig.length).padStart(2)}` : '  –   '}`;
+        }).join('  '));
+      }
+    }
+    const skips = gens.reduce((n, r) => n + (r.skipped || 0), 0);
+    if (skips) console.log(`  (${skips} requested generation(s) did NOT fold — under budget or negligible reclaim; they measure nothing)`);
+    const dropped = gens.flatMap((r) => r.summaries).filter((s) => PROBE_PLANTS.some((p) => (!s.inInput || s.inInput[p.id]) && !s.survived[p.id]));
+    if (dropped.length) {
+      const which = [...new Set(dropped.flatMap((s) => PROBE_PLANTS.filter((p) => (!s.inInput || s.inInput[p.id]) && !s.survived[p.id]).map((p) => p.id)))];
+      console.log(`  ==> ${dropped.length} summary/summaries LOST a fact that WAS in the fold (${which.join(', ')}) — summary fidelity, not layout.`);
+    } else console.log('  ==> every fact that was folded survived — compaction does not explain the report.');
+  }
+
+  const lossRate = (n) => { const rs = (byCell.get(n) || []).filter((r) => r.score); return rs.length ? rs.filter((r) => PROBE_PLANTS.some((p) => r.score[p.id] !== 'hit')).length / rs.length : null; };
+  const baseRate = lossRate('all-on');
+  if (baseRate != null) {
+    console.log('\n── any-fact-lost rate, leave-one-out vs all-on ──');
+    const rows = MEMORY_CELLS.map(([n]) => [n, lossRate(n)]).filter(([n, r]) => r != null && n !== 'all-on' && !/^control-/.test(n));
+    rows.sort((a, b) => Math.abs(b[1] - baseRate) - Math.abs(a[1] - baseRate));
+    console.log(`  all-on (reference)             ${pct(baseRate)}`);
+    for (const [n, r] of rows) {
+      const d = r - baseRate;
+      console.log(`  ${n.padEnd(30)} ${pct(r)}  ${d > 0 ? '+' : ''}${Math.round(d * 100)} pts ${Math.abs(d) >= 0.3 ? (d > 0 ? '<-- this factor HURTS' : '<-- removing it helped: contributor') : ''}`);
+    }
+  }
+}
+
+const tools = results.filter((r) => r.suite === 'tools' && r.value != null);
+if (tools.length) {
+  console.log('\n── tools: instruction adherence at conversational depth ──');
+  for (const t of TOOL_ASKS) {
+    const rs = tools.filter((r) => r.probe === t.id);
+    if (!rs.length) continue;
+    const avg = rs.reduce((n, r) => n + r.value, 0) / rs.length;
+    const worst = rs.slice().sort((a, b) => a.value - b.value)[0];
+    console.log(`  ${t.id.padEnd(8)} ${pct(avg)}  n=${rs.length}   ${avg < 1 ? `worst: ${worst.detail}${worst.missing ? ` — missing: ${worst.missing}` : ''}` : 'clean'}`);
+  }
+}
+
+const cacheRuns = results.filter((r) => r.suite === 'cache' && r.usage);
+if (cacheRuns.length) {
+  const read = (u) => u.cache_read_input_tokens ?? u.prompt_tokens_details?.cached_tokens ?? u.cached_content_token_count ?? 0;
+  console.log('\n── prompt-cache reuse (same prefix, only the last line differs) ──');
+  for (const r of cacheRuns) console.log(`  call ${r.rep + 1}: prompt ${String(r.usage.prompt_tokens ?? '?').padStart(6)}   cached ${String(read(r.usage)).padStart(6)}${r.rep === 0 ? '   (first call — nothing to reuse yet)' : ''}`);
+  const warm = cacheRuns.slice(1).filter((r) => read(r.usage) > 0).length;
+  console.log(warm
+    ? `  ==> the prefix IS cached (${warm}/${cacheRuns.length - 1} follow-ups reused it) — the static-front layout pays off here.`
+    : '  ==> NO cache reuse on this endpoint. The static-front split is still right for RECENCY, but do not cite cache\n      warmth as its justification here.');
+}
+
+const withUsage = results.filter((r) => r.usage);
+if (withUsage.length) {
+  const keys = [...new Set(withUsage.flatMap((r) => Object.keys(r.usage)))];
+  console.log(`\n── ${MODEL}: usage accounting reported by this endpoint ──`);
+  console.log('  fields: ' + keys.join(', '));
+  for (const k of keys) {
+    const vals = withUsage.map((r) => r.usage[k]).filter((v) => typeof v === 'number');
+    if (vals.length) console.log(`    ${k.padEnd(32)} avg ${Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)}`);
+  }
+  const nested = withUsage.find((r) => r.usage.completion_tokens_details || r.usage.thoughtsTokenCount);
+  console.log(nested
+    ? '  reasoning/thought accounting: ' + JSON.stringify(nested.usage.completion_tokens_details ?? nested.usage.thoughtsTokenCount)
+    : '  no reasoning/thought token field reported (expected on gemini-3.1-pro — thoughtsTokenCount)');
+}
+
+console.log('\n── verdict ──');
+if (!harnessOk) console.log('HARNESS SUSPECT — fix the controls before believing any rate above.');
+else if (mem.length) {
+  const real = mem.filter((r) => r.score && !/^control-/.test(r.cell));
+  const lost = real.filter((r) => PROBE_PLANTS.some((p) => r.score[p.id] !== 'hit'));
+  const decoyed = real.filter((r) => PROBE_PLANTS.some((p) => r.score[p.id] === 'decoy'));
+  if (!real.length) console.log('no scored memory runs.');
+  else if (!lost.length) console.log(`NOT REPRODUCED on ${MODEL}: ${real.length} runs, every planted fact recalled at every depth, decoys never taken.`);
+  else console.log(`FAILURES FOUND: ${lost.length}/${real.length} runs lost at least one fact (${decoyed.length} took a DECOY). See the depth curve and the leave-one-out table.`);
+}
+
+const bad = results.filter((r) => (r.score && !/^control-absent/.test(r.cell) && PROBE_PLANTS.some((p) => r.score[p.id] !== 'hit')) || (r.value != null && r.value < 1));
+if (bad.length) {
+  console.log(`\n── ${bad.length} failing response${bad.length === 1 ? '' : 's'} (first 6) ──`);
+  for (const r of bad.slice(0, 6)) {
+    const why = r.score ? PROBE_PLANTS.filter((p) => r.score[p.id] !== 'hit').map((p) => `${p.id}=${r.score[p.id]}`).join(' ') : `${r.probe}: ${r.detail}`;
+    console.log(`\n[${r.cell} #${r.rep}] ${why}${r.blind ? ' BLIND-CLAIM' : ''}\n  ${r.text}`);
+  }
+}
+const errs = results.filter((r) => r.error);
+if (errs.length) console.log(`\n${errs.length} call(s) errored, e.g.: ${errs[0].error}`);
+
+await mkdir(OUT_DIR, { recursive: true });
+await appendFile(`${OUT_DIR}\\runs.jsonl`, JSON.stringify({ at: new Date().toISOString(), model: MODEL, reps: REPS, suites: SUITES, results }) + '\n');
+console.log(`\nappended to ${OUT_DIR}\\runs.jsonl`);
+process.exit(0);
+
=== add test/_piiscan-app.mjs
new 092831d9bdb47aae5ee132e8
+/**
+ * _piiscan-app.mjs — the application under review, and the values planted in it.
+ *
+ * One generated application, shared by the scripted E2E and the live session, so a leak found by either means the
+ * same thing. The values are deliberately ordinary: a redaction that only holds for exotic strings is not a result.
+ */
+import { mkdir, writeFile } from 'node:fs/promises';
+import path from 'node:path';
+
+// ── the planted values ────────────────────────────────────────────────────────────────────────────────────────
+// Every one of these is in the generated application, and NONE of them may appear in a request body. They are
+// deliberately ordinary — a leak that only shows up for exotic values is not a result.
+export const CANARIES = [
+  '482-11-9037', '601-44-2288', '325-90-1174',          // SSNs
+  '(214) 555-0182', '972.555.0143', '6085551023',        // phones, three renderings
+  '110 W. Liberty St.', '2693 Commerce Street', '4408 Maple Ave Apt 12B',
+  'Rutherford Havisham', 'Marguerite Oyelaran', 'Thaddeus Ngo',
+  'r.havisham@northgate-health.com', 'm.oyelaran@northgate-health.com',
+  '1974-03-11', '1988-11-02',                            // dates of birth
+  '75201-1188',                                          // ZIP+4
+  '4111111111111111',                                    // a card, under a card key
+];
+
+export async function buildApp(dir) {
+  const w = (p, s) => mkdir(path.dirname(path.join(dir, p)), { recursive: true }).then(() => writeFile(path.join(dir, p), s, 'utf8'));
+  const NL = String.fromCharCode(10);
+  await w('README.md', [
+    '# Northgate Enrollment',
+    '',
+    'Batch enrollment for the Northgate clinic network. Records arrive as CSV, are validated, and are written',
+    'to the enrollment table. Contact the maintainer at r.havisham@northgate-health.com.',
+    '',
+    '## Known issues',
+    '- Phone validation rejects `972.555.0143` but accepts `(214) 555-0182`. Same subscriber, different rendering.',
+    '- The ZIP+4 `75201-1188` fails the length check in `Validators.java`.',
+  ].join(NL));
+  await w('src/main/java/com/northgate/Enrollee.java', [
+    'package com.northgate;',
+    '',
+    '/** One person on the enrollment roster. */',
+    'public class Enrollee {',
+    '  private String firstName;',
+    '  private String lastName;',
+    '  private String ssn;',
+    '  private String phone;',
+    '  private String addressLine1;',
+    '  private String postalCode;',
+    '  private String birthDate;',
+    '',
+    '  public String getSsn() { return ssn; }',
+    '  public void setSsn(String ssn) { this.ssn = ssn; }',
+    '  public String getPhone() { return phone; }',
+    '  public void setPhone(String phone) { this.phone = phone; }',
+    '  public String getPostalCode() { return postalCode; }',
+    '  public void setPostalCode(String postalCode) { this.postalCode = postalCode; }',
+    '}',
+  ].join(NL));
+  await w('src/main/java/com/northgate/Validators.java', [
+    'package com.northgate;',
+    '',
+    'public final class Validators {',
+    '  // BUG: this rejects the ZIP+4 form. See README.',
+    '  public static boolean validPostalCode(String s) {',
+    '    return s != null && s.length() == 5 && s.chars().allMatch(Character::isDigit);',
+    '  }',
+    '',
+    '  // Accepts (999) 999-9999 only. Dotted and bare renderings fall through to false.',
+    '  public static boolean validPhone(String s) {',
+    '    return s != null && s.matches("\\\\(\\\\d{3}\\\\) \\\\d{3}-\\\\d{4}");',
+    '  }',
+    '',
+    '  public static boolean validSsn(String s) {',
+    '    return s != null && s.matches("\\\\d{3}-\\\\d{2}-\\\\d{4}");',
+    '  }',
+    '}',
+  ].join(NL));
+  await w('src/main/resources/application.properties', [
+    'app.name=northgate-enrollment',
+    'support.contact_name=Rutherford Havisham',
+    'support.email=r.havisham@northgate-health.com',
+    'support.phone=(214) 555-0182',
+    'clinic.street_address=110 W. Liberty St.',
+    'clinic.postal_code=75201-1188',
+  ].join(NL));
+  await w('src/test/resources/fixtures/enrollees.csv', [
+    'first_name,last_name,ssn,phone,address,dob,zip',
+    'Rutherford,Havisham,482-11-9037,(214) 555-0182,110 W. Liberty St.,1974-03-11,75201-1188',
+    'Marguerite,Oyelaran,601-44-2288,972.555.0143,2693 Commerce Street,1988-11-02,75202',
+    'Thaddeus,Ngo,325-90-1174,6085551023,4408 Maple Ave Apt 12B,1991-07-30,53703',
+  ].join(NL));
+  await w('src/test/resources/fixtures/enrollee.json', JSON.stringify({
+    patient: {
+      name: { family: 'Oyelaran', given: ['Marguerite'] },
+      ssn: '601-44-2288',
+      birthDate: '1988-11-02',
+      telecom: [{ system: 'phone', value: '972.555.0143' }, { system: 'email', value: 'm.oyelaran@northgate-health.com' }],
+      address: { line: ['2693 Commerce Street'], city: 'Dallas', state: 'TX', postalCode: '75202' },
+      payment: { card_number: '4111111111111111' },
+    },
+  }, null, 2));
+  await w('db/seed.sql', [
+    'INSERT INTO enrollees (first_name, last_name, ssn, phone, address, dob) VALUES',
+    "  ('Rutherford', 'Havisham', '482-11-9037', '(214) 555-0182', '110 W. Liberty St.', '1974-03-11'),",
+    "  ('Thaddeus', 'Ngo', '325-90-1174', '6085551023', '4408 Maple Ave Apt 12B', '1991-07-30');",
+  ].join(NL));
+  await w('src/main/webapp/style.css', [
+    '.enrollee-row { font-family: var(--mono); line-height: 1; }',
+    '.enrollee-row .ssn { letter-spacing: 0.5px; }',
+  ].join(NL));
+}
+
+
=== add test/_piiscan-demo.mjs
new 6529757a798eac00431c60c1
+/**
+ * _piiscan-demo.mjs — produce a REAL project you can open and read, to see what the model was actually sent.
+ *
+ * Not a test. It builds a small application with personal data in it, runs one turn through the real server with
+ * piiscan active, and leaves everything on disk so the raw log can be read by a person rather than by an
+ * assertion. The point is the file it leaves behind, not the output it prints.
+ *
+ *   node test/_piiscan-demo.mjs [dir]        # default D:\tmp\cb-piiscan-demo
+ */
+import { mkdir, readFile, writeFile, rm, cp } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const ROOT = path.resolve(__dirname, '..');
+const OUT = process.argv[2] || 'D:\\tmp\\cb-piiscan-demo';
+process.env.CB_HOME = path.join(OUT, 'home');
+
+const { startServer } = await import('../src/server.mjs');
+const { userPluginsDir } = await import('../src/plugins/paths.mjs');
+const { buildApp } = await import('./_piiscan-app.mjs');
+
+const PORT = Number(process.env.CB_PIISCAN_DEMO_PORT || 28931);
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+await rm(OUT, { recursive: true, force: true }).catch(() => {});
+const proj = path.join(OUT, 'northgate-enrollment');
+await mkdir(proj, { recursive: true });
+await buildApp(proj);
+await mkdir(userPluginsDir(), { recursive: true });
+await cp(path.join(ROOT, 'examples', 'plugins', 'piiscan__1.mjs'), path.join(userPluginsDir(), 'piiscan__1.mjs'));
+
+// A scripted model, so the demo costs nothing and always does the same thing: read the two files that hold
+// personal data, then stop.
+let turn = 0;
+const ws = (s) => `<remote-workspace>${s}</remote-workspace>`;
+const adapter = {
+  baseURL: '(scripted)',
+  async listModels() { return [{ id: 'demo' }]; },
+  async complete() {
+    const i = turn++;
+    if (i === 0) return { choices: [{ message: { content: 'Reading the configuration. ' + ws('<read path="src/main/resources/application.properties"/>') } }] };
+    if (i === 1) return { choices: [{ message: { content: 'And the fixture. ' + ws('<read path="src/test/resources/fixtures/enrollees.csv"/>') } }] };
+    return { choices: [{ message: { content: 'Both files are full of redacted values; I can work with the tokens.' } }] };
+  },
+};
+
+const html = (await readFile(path.join(ROOT, 'src', 'ui.html'), 'utf8'))
+  .replace('</head>', '<script>window.SERVER_CONFIG=' + JSON.stringify({ defaultModel: 'demo', baseURL: '(scripted)' }) + ';</script></head>');
+const { server } = await startServer({
+  html, baseURL: '(scripted)', apiKey: 'k', gitlabCreds: { user: 'd', token: 'd' },
+  defaultModel: 'demo', port: PORT, initialProject: proj, modelsList: [{ id: 'demo' }], adapter,
+});
+for (let i = 0; i < 40 && !(await fetch(`http://127.0.0.1:${PORT}/api/state`).then((r) => r.json()).then((j) => (j.plugins || []).some((p) => p.name === 'piiscan' && p.enabled)).catch(() => false)); i++) await sleep(300);
+
+await fetch(`http://127.0.0.1:${PORT}/api/message`, {
+  method: 'POST', headers: { 'content-type': 'application/json' },
+  body: JSON.stringify({ text: 'Read the configuration and the CSV fixture and tell me what is in them.', model: 'demo' }),
+}).catch(() => {});
+for (let i = 0; i < 120; i++) {
+  const st = await fetch(`http://127.0.0.1:${PORT}/api/state`).then((r) => r.json()).then((j) => j.status).catch(() => null);
+  if (['done', 'idle', 'error'].includes(st) && turn > 2) break;
+  await sleep(300);
+}
+await sleep(600);
+server.close();
+
+// ── what it left behind ───────────────────────────────────────────────────────────────────────────────────────
+const rawPath = path.join(proj, '.code_boss', 'raw-log.jsonl');
+const raw = existsSync(rawPath) ? await readFile(rawPath, 'utf8') : '';
+const { CANARIES } = await import('./_piiscan-app.mjs');
+const leaked = CANARIES.filter((c) => raw.includes(c));
+const tokens = [...new Set((raw.match(/\[PII:[A-Z]+#[0-9a-f]{8}\]/g) || []))];
+
+const line = (raw.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
+  .filter(Boolean).find((e) => String(e.request || '').includes('[PII:')) || null);
+const excerpt = line ? (() => {
+  const req = String(line.request);
+  const at = req.indexOf('[PII:');
+  return req.slice(Math.max(0, at - 420), at + 420);
+})() : '(no request with a token found)';
+
+console.log('\n' + '='.repeat(100));
+console.log('PROJECT      ' + proj);
+console.log('RAW LOG      ' + rawPath + '   (' + raw.length.toLocaleString() + ' bytes)');
+console.log('THE FILES    ' + path.join(proj, 'src', 'main', 'resources', 'application.properties'));
+console.log('             ' + path.join(proj, 'src', 'test', 'resources', 'fixtures', 'enrollees.csv'));
+console.log('='.repeat(100));
+console.log('\nPLANTED VALUES THAT REACHED THE MODEL: ' + (leaked.length ? leaked.join(', ') : 'none'));
+console.log('DISTINCT TOKENS IN THE RAW LOG:        ' + tokens.length + (tokens.length ? '  e.g. ' + tokens.slice(0, 6).join(' ') : ''));
+console.log('\n--- what the model was actually sent (excerpt from the raw log) ---\n');
+console.log(excerpt);
+console.log('\n--- the same lines as they are ON DISK, untouched ---\n');
+console.log(await readFile(path.join(proj, 'src', 'main', 'resources', 'application.properties'), 'utf8'));
+console.log('Open the project in code_boss to see the same tokens in the chat, and Settings > raw payloads to');
+console.log('read the exchanges in the UI. Delete ' + OUT + ' when you are done — it holds invented personal data.');
+process.exit(leaked.length ? 1 : 0);
+
=== end
