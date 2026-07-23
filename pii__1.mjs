/**
 * pii__1.mjs — PII-safe test data plugin for code_boss.  (spec: PII-PLUGIN-SPEC.md)
 *
 * Lets the agent drive a real workflow with real PII it is NEVER shown. Test cases live as labelled JSON files
 * in a BLOCKED directory the agent cannot read; the plugin exposes the field NAMES into the prompt and hands the
 * agent TOKENS of the form @(label.field). The token IS the lookup key — there is no separate id or stored map:
 *
 *   mask   (real value -> @(label.field))   applied to the outbound request AND to tool results  (H1 + H3)
 *   unmask (@(label.field) -> real value)   applied to tool arguments, so the tool acts on the real value  (H2)
 *
 * So the model reasons over tokens; the real SSN only exists for the duration of a tool call, and never enters
 * the transcript. FAIL-CLOSED by the platform: a throw here refuses the call rather than leaking.
 *
 * ── Install ──
 *   Copy this file to  ~/.code_boss/plugins/pii__1.mjs  (e.g. via the <copy> verb).
 *   Create  <your-project>/.testdata/  and drop labelled JSON files in it (see the shape below). That directory
 *   is hidden from the agent automatically (blockedPaths).
 *
 * ── Test-case file shape:  .testdata/alice.json ──
 *   {
 *     "label": "alice",                       // optional; the FILENAME stem wins if they disagree
 *     "description": "standard enrollee",     // optional; shown in the field list
 *     "fields": {
 *       "ssn": "111-22-3333",
 *       "phone": "555-0142",
 *       "address": { "street": "1 Main St", "city": "Lynchburg", "zip": "24501" }
 *     }
 *   }
 *   The agent then does  <testdata_get label="alice" field="address.zip"/>  → @(alice.address.zip), passes that
 *   token wherever the real value is needed, and the platform substitutes "24501" when the tool runs.
 *
 * v1 scope (PII-PLUGIN-SPEC.md §7): EXACT-VALUE tokenization only — the plugin can only tokenize values it holds
 * in the store (that is the safe, reliable core). It does NOT regex-guess unknown SSNs/addresses. Unresolved
 * tokens THROW (fail-closed) rather than reaching a tool as literal "@(x)".
 */

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

const STORE_DIRNAME = '.testdata';
const LABEL_RE = /^[a-z0-9_-]+$/i;

// ── Hardcoded schema (PLUGIN-UI-PANEL-SPEC.md §8) ──────────────────────────────────────────────────────────────
// The fixed set of fields a test case may hold. The editor lets you fill ONLY these; the agent is shown this whole
// list (so it can build @(case.field) tokens) and calls <testdata_fields> to see which are filled per case. Edit
// this array to change the fields. `format` is a hint (shown as the input placeholder); masking still works on any
// value regardless. Dotted names (address.zip) nest. Values themselves live in .testdata/<label>.json.
const SCHEMA = [
  { name: 'first_name' },
  { name: 'last_name' },
  { name: 'middle_name' },
  { name: 'dob', label: 'Date of birth', format: 'YYYY-MM-DD' },
  { name: 'ssn', format: '123-45-6789' },
  { name: 'phone', format: '555-012-3456' },
  { name: 'email' },
  { name: 'edi', label: 'EDI', format: '10 digits' },
  { name: 'deers_beneficiary_id', label: 'DEERS Beneficiary ID' },
  { name: 'deers_family_id', label: 'DEERS Family ID' },
  { name: 'address.street', label: 'Street' },
  { name: 'address.city', label: 'City' },
  { name: 'address.zip', label: 'ZIP' },
];
// A token is @( label . field.path ) — label has no dot; the field path may be dotted (address.zip). The closing
// paren cannot appear in either, so the boundary is unambiguous and mask never has to guess one out of prose.
const TOKEN_RE = /@\(([a-z0-9_-]+)\.([a-z0-9_.-]+)\)/gi;

// ── store loading ────────────────────────────────────────────────────────────────────────────────────────────
// Per-PROJECT: the store dir is resolved from the project directory the platform passes to every hook (filter
// ctx.projectDir, tool ctx.cwd, promptAddition(projectDir)). Read + parse on EVERY call (no cache) — the store is
// small (test cases), and correctness beats micro-perf here: a stale cache could miss a value the developer just
// added (a leak) or a same-millisecond edit an mtime cache cannot see. A file the developer drops in is picked up
// with no reload.
//
// FAIL-CLOSED READ (audit 2026-07-22, sev3). A MISSING store (ENOENT) is legitimate → empty (nothing to mask). But
// a real READ FAILURE (EACCES/EBUSY/EPERM/EIO, or a per-file read/parse error) is NOT swallowed — it THROWS, so
// the platform refuses the call rather than passing content through unmasked. A store that exists but cannot be
// fully read is the exact situation where fail-open would leak: never treat it as "no store".
function storeDirFor(projectDir) {
  if (!projectDir) return null;
  return resolve(projectDir, STORE_DIRNAME);
}
function loadStore(projectDir) {
  const dir = storeDirFor(projectDir);
  if (!dir) return new Map();
  let names;
  try { names = readdirSync(dir); }
  catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return new Map();   // no store — legitimate
    throw new Error(`test-data store "${dir}" could not be read (${e?.code || e?.message}) — refusing to pass content through unmasked (fail-closed)`);
  }
  const cases = new Map();
  for (const f of names) {
    if (!f.toLowerCase().endsWith('.json')) continue;
    const stem = f.replace(/\.json$/i, '');
    if (!LABEL_RE.test(stem)) continue;               // a label must be a clean token — skip odd filenames
    let raw;
    try { raw = readFileSync(join(dir, f), 'utf8'); }
    catch (e) {
      if (e && e.code === 'ENOENT') continue;         // file vanished between readdir and read (a race) — skip it
      throw new Error(`test-data file "${f}" could not be read (${e?.code || e?.message}) — refusing to pass content through unmasked (fail-closed)`);
    }
    let obj;
    try { obj = JSON.parse(raw); } catch { throw new Error(`test-data file "${f}" is not valid JSON — refusing to pass content through unmasked (a malformed store must not silently leak). Fix or remove it.`); }
    if (!obj || typeof obj !== 'object') continue;
    const fields = (obj.fields && typeof obj.fields === 'object') ? obj.fields : {};
    cases.set(stem.toLowerCase(), { label: stem.toLowerCase(), description: typeof obj.description === 'string' ? obj.description : '', fields });
  }
  return cases;
}

// ── store WRITING (the panel editor; the agent never writes here) ─────────────────────────────────────────────
// Set a dotted field on a fields object, building the nesting; a blank value REMOVES the leaf (blank ⇔ absent, so
// "which fields are filled" stays honest and a cleared field never lingers as "").
function setField(fields, dotted, value) {
  const parts = String(dotted).split('.');
  let o = fields;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
    o = o[parts[i]];
  }
  const leaf = parts[parts.length - 1];
  if (value == null || value === '') delete o[leaf];
  else o[leaf] = String(value);
}
function writeCase(projectDir, label, obj) {
  const dir = storeDirFor(projectDir);
  if (!dir) throw new Error('no project open');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, label + '.json'), JSON.stringify(obj, null, 2), 'utf8');
}
function deleteCase(projectDir, label) {
  const dir = storeDirFor(projectDir);
  if (!dir) return;
  try { rmSync(join(dir, label + '.json'), { force: true }); } catch {}
}

// ── the panel editor's component tree (PLUGIN-UI-PANEL-SPEC.md §4) ─────────────────────────────────────────────
function textRow(label, fieldPath, lbl, value, placeholder) {
  return { type: 'text', id: `field:${label}:${fieldPath}`, label: lbl, value: typeof value === 'string' ? value : '', placeholder: placeholder || '' };
}
// Per case: a row for every SCHEMA field (fill only these), PLUS any leaf already on the object that isn't in the
// schema (so nothing on disk is hidden — "object fields + schema fields") + a delete button.
function caseSection(label, c) {
  const schemaNames = new Set(SCHEMA.map((s) => s.name));
  const rows = SCHEMA.map((s) => textRow(label, s.name, s.label || s.name, getField(c.fields, s.name), s.format));
  for (const fp of leafPaths(c.fields)) if (!schemaNames.has(fp)) rows.push(textRow(label, fp, fp + ' (extra)', getField(c.fields, fp), ''));
  rows.push({ type: 'button', id: `del:${label}`, label: 'Delete case', variant: 'danger' });
  return { type: 'section', id: `case:${label}`, title: label, children: rows };
}
function buildPanelTree(projectDir) {
  const cases = loadStore(projectDir);
  const sections = [...cases.entries()].map(([label, c]) => caseSection(label, c));
  return { type: 'stack', children: [
    { type: 'note', text: cases.size
      ? `${cases.size} test case(s). Real values live in .testdata (hidden from the agent — it only ever sees tokens). Edits save as you type.`
      : 'No test cases yet — add one below. Real values stay in .testdata, hidden from the agent.' },
    ...sections,
    { type: 'section', id: 'addcase', title: '+ Add a case', collapsed: true, children: [
      { type: 'text', id: 'newlabel', label: 'Label', placeholder: 'e.g. alice (lowercase, no spaces)' },
      { type: 'button', id: 'addcase-go', label: 'Create case', variant: 'primary' },
    ] },
  ] };
}

// ── field access (dotted paths) ──────────────────────────────────────────────────────────────────────────────
function getField(fields, dottedPath) {
  let v = fields;
  for (const part of String(dottedPath).split('.')) {
    if (v == null || typeof v !== 'object') return undefined;
    v = v[part];
  }
  return v;
}
// Flatten to leaf STRING paths (address -> address.street, address.zip). Only string leaves are real values.
// Arrays recurse too (phones -> phones.0), with numeric path parts — SYMMETRIC with getField, which walks any
// object including arrays. The asymmetry was a silent leak: an array-stored value contributed nothing to the
// mask (so it reached the model raw in tool results) while its @(label.phones.0) token still resolved on unmask.
function leafPaths(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj || {})) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') out.push(...leafPaths(v, p));
    else if (typeof v === 'string') out.push(p);
  }
  return out;
}

function escapeReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// A numeric-identifier value (SSN, phone, account #) is often written in more than one punctuation form — the
// store may hold "111-22-3333" while a form field or a tool result uses "111223333", or vice versa. So for a
// value that is essentially digits + separators, generate its FORMAT VARIANTS and map them ALL to the same token,
// so the value is masked whichever way it appears. This is still EXACT-VALUE tokenization of a KNOWN value — just
// its equivalent spellings — NOT pattern-guessing of unknown PII. (A real SSN is 9 digits: XXX-XX-XXXX; a US
// phone is 10: XXX-XXX-XXXX. We de-hyphenate ANY numeric value unambiguously, and re-hyphenate a bare 9- or
// 10-digit run into its standard grouping.)
function numericVariants(v) {
  const out = [v];
  if (!/^[()\d\s.\-]+$/.test(v)) return out;    // not a numeric-with-separators value → only the literal
  const digits = v.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return out;   // too short/long to be a phone/SSN/account id
  if (digits !== v) out.push(digits);            // strip separators (always unambiguous)
  if (digits.length === 9) out.push(`${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`);   // SSN 3-2-4
  if (digits.length === 10) out.push(`${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`);  // phone 3-3-4
  return [...new Set(out)];
}

// ── the value → token mask, as ONE single-pass regex ──────────────────────────────────────────────────────────
// value -> token, longest values first so "1 Main St, Lynchburg" wins over "Lynchburg". Only values ≥ 3 chars
// are tokenized — a 1-2 char value (a middle initial, "0") would match all over ordinary text and shred context.
// ONE alternation regex, replaced in a SINGLE pass: a per-value split/join loop re-scans its own output, so a
// value could be double-masked; a single pass never re-examines replaced text. WHOLE-TOKEN matching, not
// substring: every value is boundary-guarded on its alphanumeric edges, so an SSN is never masked inside a longer
// number and a city name never inside a longer word (see buildMask body).
function buildMask(cases) {
  const map = new Map();   // spelling (an exact value OR a generated numeric variant) -> token
  // Collect every string leaf once, then index in TWO passes so a value's exact stored spelling always wins its
  // own token. PASS 1 indexes the LITERALS; PASS 2 adds generated numeric VARIANTS, but only for spellings not
  // already claimed. Without the split, two DIFFERENT values that share a digit sequence (e.g. an SSN
  // "123-45-6789" and an account "123456789" — whose variant sets are identical) would let whichever loaded first
  // claim BOTH spellings, so the second value's real spelling masked to the FIRST value's token (mis-attribution)
  // and never surfaced as its own. Literals-first guarantees each real value masks correctly; only the genuinely
  // ambiguous cross-variant spellings fall to first-writer-wins (they cannot belong to both, by construction).
  const leaves = [];
  for (const [label, c] of cases) {
    for (const fp of leafPaths(c.fields)) {
      const val = getField(c.fields, fp);
      if (typeof val !== 'string' || val.length < 3) continue;
      leaves.push({ tok: `@(${label}.${fp})`, val });
    }
  }
  for (const { tok, val } of leaves) if (!map.has(val)) map.set(val, tok);          // pass 1: exact literals
  for (const { tok, val } of leaves) {                                              // pass 2: numeric variants
    for (const variant of numericVariants(val)) {
      if (variant === val) continue;                                               // the literal is already indexed
      if (variant.length >= 3 && !map.has(variant)) map.set(variant, tok);
    }
  }
  if (!map.size) return null;
  const vals = [...map.keys()].sort((a, b) => b.length - a.length);   // longest-first ⇒ regex prefers longer
  // BOUNDARY-GUARD every value on its ALPHANUMERIC edges, so a value is matched as a whole token and NEVER as a
  // substring of a longer number or word. Guard the START only if the value starts alphanumeric, the END only if
  // it ends alphanumeric (so "$100" or "(555)" still match on their punctuation side). Uses [0-9A-Za-z] — a
  // digit/letter touching the match means it is part of a LONGER run and must not be tokenized:
  //   111-22-3333  will NOT match inside 5111-22-33339 / 111-22-33334   (a longer number that contains the SSN)
  //   24501        will NOT match inside 245019999                       (a longer number)
  //   Lynchburg    will NOT match inside Lynchburgh                      (a longer word)
  //   111-22-3333  WILL match in "ssn 111-22-3333." (a period is not alphanumeric → a real boundary)
  const alt = vals.map((v) => {
    const left = /^[0-9A-Za-z]/.test(v) ? '(?<![0-9A-Za-z])' : '';
    const right = /[0-9A-Za-z]$/.test(v) ? '(?![0-9A-Za-z])' : '';
    return left + escapeReg(v) + right;
  }).join('|');
  return { re: new RegExp(alt, 'g'), map };
}

// ── the plugin ────────────────────────────────────────────────────────────────────────────────────────────────
export default {
  description: 'PII-safe test data: real values stay tokenized to the model and are only real inside tool calls',
  author: 'code_boss',
  blockedPaths: [STORE_DIRNAME],   // the platform hides .testdata from the agent

  // Field list for the prompt — the case labels + the FULL schema (same for every case), rebuilt each turn.
  // Values never appear. The agent sees the whole schema so it can build @(case.field) tokens; which fields are
  // actually filled per case comes from <testdata_fields>, not the prompt (keeps it lean).
  promptAddition: (projectDir) => {
    const cases = loadStore(projectDir);
    if (!cases.size) return '';   // no store in this project → say nothing
    const lines = [
      'TEST DATA AVAILABLE (values are hidden — you only ever get a TOKEN, never the real value):',
      `  cases: ${[...cases.keys()].join(', ')}`,
      `  schema fields (available on every case): ${SCHEMA.map((s) => s.name).join(', ')}`,
      'Build a token as @(<case>.<field>) — e.g. @(alice.ssn) or @(alice.address.zip) — and pass it wherever the real',
      'value is needed (a browser field, a request body, a form). The platform substitutes the real value when the',
      'tool runs, and re-tokenizes any real values a tool pulls BACK (a scraped page) before you see them.',
      'Not every case has every field filled — call <testdata_fields label="alice"/> to see which are filled vs blank',
      'BEFORE you use one (a token for a blank field is refused). Never invent, edit, reformat a token, or ask for a raw value.',
    ];
    return lines.join('\n');
  },

  // Side-panel editor (PLUGIN-UI-PANEL-SPEC.md). The developer fills the schema fields per case; the agent never
  // touches this — it edits .testdata directly through the plugin (which is agent-blocked). Save-as-you-type.
  panel: {
    title: 'Test data', icon: '🔒',
    render: (ctx) => buildPanelTree(ctx && ctx.projectDir),
    onEvent: (ev, ctx) => {
      const projectDir = ctx && ctx.projectDir;
      if (!projectDir) return { error: 'Open a project first — test data is stored per project (.testdata).' };
      // Save a field as it changes. blank ⇔ absent. No re-render (would clobber the box being typed in).
      if (ev.event === 'change' && typeof ev.id === 'string' && ev.id.startsWith('field:')) {
        const rest = ev.id.slice('field:'.length);
        const ci = rest.indexOf(':');
        if (ci < 0) return {};
        const label = rest.slice(0, ci), fieldPath = rest.slice(ci + 1);
        const cases = loadStore(projectDir);
        const c = cases.get(label) || { label, description: '', fields: {} };
        setField(c.fields, fieldPath, ev.value);
        writeCase(projectDir, label, { label, description: c.description || '', fields: c.fields });
        return { toast: { text: `saved ${label}.${fieldPath || ''}`.replace(/\.$/, ''), tone: 'ok' } };
      }
      // Add a case (values come with the click). A structural change → re-render.
      if (ev.event === 'click' && ev.id === 'addcase-go') {
        const label = String((ev.values && ev.values.newlabel) || '').toLowerCase().trim();
        if (!LABEL_RE.test(label)) return { error: 'Label must be letters/digits/_/- only (e.g. alice).' };
        if (loadStore(projectDir).has(label)) return { error: `A case "${label}" already exists.` };
        writeCase(projectDir, label, { label, description: '', fields: {} });
        return { toast: { text: `created case "${label}"`, tone: 'ok' }, render: buildPanelTree(projectDir) };
      }
      // Delete a case → re-render.
      if (ev.event === 'click' && typeof ev.id === 'string' && ev.id.startsWith('del:')) {
        const label = ev.id.slice('del:'.length);
        deleteCase(projectDir, label);
        return { toast: { text: `deleted case "${label}"`, tone: 'ok' }, render: buildPanelTree(projectDir) };
      }
      return {};
    },
  },

  filters: [{
    name: 'pii',
    // real value -> token. ONE single-pass regex over the store's values, longest-first. (H1 request + H3 result.)
    mask: async (text, ctx) => {
      if (typeof text !== 'string' || !text) return text;
      const cases = loadStore(ctx?.projectDir);   // throws (fail-closed) on a store READ error
      const m = buildMask(cases);
      if (!m) return text;                          // no store / no maskable values
      return text.replace(m.re, (v) => m.map.get(v) || v);
    },
    // token -> real value. (H2 tool arguments.) Only a token whose LABEL is a real test case is treated as ours:
    // an unknown label is left VERBATIM (so ordinary content like a template's @(Model.Name) is not our token and
    // is not touched — audit 2026-07-22, sev3). A token for a KNOWN case but a missing/typo'd FIELD is a genuine
    // mistake and still THROWS (fail-closed) — a real token that would reach a tool unresolved.
    unmask: async (text, ctx) => {
      if (typeof text !== 'string' || text.indexOf('@(') === -1) return text;
      const cases = loadStore(ctx?.projectDir);
      const missing = [];
      const out = text.replace(TOKEN_RE, (whole, label, field) => {
        const c = cases.get(String(label).toLowerCase());
        if (!c) return whole;                       // label is not a test case → not our token, pass through
        const v = getField(c.fields, field);
        if (typeof v !== 'string') { missing.push(whole); return whole; }   // our case, bad field → fail-closed
        return v;
      });
      if (missing.length) throw new Error(`unresolved test-data token(s): ${[...new Set(missing)].join(', ')} — the test case exists but has no such string field. Use <testdata_list/> to see the fields; do not invent tokens.`);
      return out;
    },
  }],

  tools: [
    {
      verb: 'testdata_get', name: 'testdata_get',
      schema: {
        description: 'Get a TOKEN for a test-data field (you never receive the real value). e.g. label="alice" field="ssn" → the token @(alice.ssn). Pass the token wherever the real value is needed; the system substitutes it inside the tool call. field may be dotted for nested data (address.zip).',
        parameters: { type: 'object', properties: { label: { type: 'string', description: 'the test-case label' }, field: { type: 'string', description: 'the field name (dotted for nested, e.g. address.zip)' } }, required: ['label', 'field'] },
      },
      impl: async ({ label, field }, ctx) => {
        const cases = loadStore(ctx?.cwd);
        const c = cases.get(String(label || '').toLowerCase());
        if (!c) return { content: `ERROR: no test case "${label}". Use <testdata_list/> to see what exists.` };
        const v = getField(c.fields, field);
        if (typeof v !== 'string') return { content: `ERROR: test case "${label}" has no string field "${field}". Available: ${leafPaths(c.fields).join(', ') || '(none)'}.` };
        return { content: `@(${c.label}.${field})` };   // the TOKEN, never the value
      },
    },
    {
      verb: 'testdata_list', name: 'testdata_list',
      schema: { description: 'List the available test cases and their field names (values are never shown).', parameters: { type: 'object', properties: {} } },
      impl: async (_args, ctx) => {
        const cases = loadStore(ctx?.cwd);
        if (!cases.size) return { content: `No test data. Add labelled JSON files to <project>/${STORE_DIRNAME}/ (each: { "fields": { … } }).` };
        const lines = [];
        for (const [label, c] of cases) lines.push(`${label}${c.description ? ` — ${c.description}` : ''}: ${leafPaths(c.fields).join(', ') || '(no fields)'}`);
        return { content: lines.join('\n') };
      },
    },
    {
      verb: 'testdata_fields', name: 'testdata_fields',
      schema: {
        description: 'For ONE test case, show every SCHEMA field and whether it is FILLED or BLANK (no values). Use this before building a token — e.g. to check whether "alice" has a middle_name — because a token for a blank field is refused.',
        parameters: { type: 'object', properties: { label: { type: 'string', description: 'the test-case label' } }, required: ['label'] },
      },
      impl: async ({ label }, ctx) => {
        const cases = loadStore(ctx?.cwd);
        const c = cases.get(String(label || '').toLowerCase());
        if (!c) return { content: `ERROR: no test case "${label}". Use <testdata_list/> to see what exists.` };
        const schemaNames = new Set(SCHEMA.map((s) => s.name));
        const lines = SCHEMA.map((s) => { const v = getField(c.fields, s.name); return `  ${(typeof v === 'string' && v.length) ? '✓' : '·'} ${s.name}`; });
        // any non-schema fields present on disk, so the picture is complete
        const extra = leafPaths(c.fields).filter((fp) => !schemaNames.has(fp));
        for (const fp of extra) lines.push(`  ✓ ${fp} (not in schema)`);
        return { content: `${c.label} — ✓ filled · blank:\n${lines.join('\n')}` };
      },
    },
  ],
};
