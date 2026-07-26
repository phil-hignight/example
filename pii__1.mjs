/**
 * pii__1.mjs — PII-safe test data plugin for code_boss.  (spec: PII-PLUGIN-SPEC.md)
 *
 * Lets the agent drive a real workflow with real PII it is NEVER shown. Test data lives as JSON files in a BLOCKED
 * directory the agent cannot read; the plugin exposes the labels + field NAMES into the prompt and hands the agent
 * TOKENS. The token IS the lookup key — there is no separate id or stored map:
 *
 *   mask   (real value -> token)   applied to the outbound request AND to tool results  (H1 + H3)
 *   unmask (token -> real value)   applied to tool arguments, so the tool acts on the real value  (H2)
 *
 * So the model reasons over tokens; the real value only exists for the duration of a tool call, and never enters the
 * transcript. FAIL-CLOSED by the platform: a throw here refuses the call rather than leaking.
 *
 * ── Model: a case is a FAMILY of DEERS beneficiaries ──
 *   A family has ONE family-level field (the DEERS Family ID) shared by everyone, and a list of MEMBERS
 *   (sponsor / spouse / child…), each with their own person fields (name, ssn, edi, DEERS Beneficiary ID, …).
 *   File shape: { label?, description?, family:{deers_family_id}, members:{<label>:{fields}} }.
 *
 * ── Tokens are TIERED by how SHARED a value is (so a value in 50 families never lists 50 paths) ──
 *   USABLE placeholders (you can emit these to inject a value):
 *     a member's field    @@@(<family>.<member>.<field>)   e.g. @@@(smiths.sponsor.ssn), @@@(smiths.spouse.address.zip)
 *     the family id        @@@(<family>.deers_family_id)
 *   FUZZY, READ-ONLY descriptors (a value shared by several beneficiaries — you CANNOT inject these):
 *     shared within ONE family    ###{sponsor.first_name, spouse.first_name in smiths}   ← the slots are listed; pick one → @@@()
 *     shared across MANY families  ###{address.city across 4 families incl. smiths #<16hex>}  ← paths elided; #id is a handle
 *   To turn a cross-family ###{… #id} into a usable token, call <testdata_expand id="<16hex>"/> — it lists ALL the paths
 *   (family → member → field) holding that value (NO value shown) so you can pick one and build @@@(family.member.field).
 *   The TRIPLE sigil (@@@ / ###) makes tokens unmistakable — real code never writes them — so there is no collision.
 *
 * Anchoring: when masking a page, unique + within-family matches are resolved FIRST; the families they touch become
 * "anchors", and a cross-family descriptor then names the anchor families it also belongs to ("incl. smiths") — so a
 * shared value on a one-family page reads as belonging to that family.
 *
 * Matching is NORMALIZE-BOTH-SIDES and deliberately errs toward masking TOO MUCH: the document and the stored
 * dictionary are folded to the SAME canonical form (case fold, unicode composition + COMPATIBILITY so ligatures /
 * fullwidth match, punctuation-variant canonicalization, dropped invisibles, collapsed whitespace), each stored value
 * is found in the folded stream, and the match is mapped back to its ORIGINAL byte span — so non-PII text is copied
 * through verbatim and only the matched span is replaced. A numeric id matches its digit sequence in any separator
 * layout (space/dot/comma/slash/dash/nbsp/fullwidth/…); text matches whole-value, case- and composition-insensitive.
 * TEXT and NUMERIC candidates are merged by leftmost-longest overlap resolution (so a street "12345 Kili…" wins over a
 * 5-digit ZIP hiding inside it). Unresolved / ambiguous tokens THROW (fail-closed) rather than reaching a tool as text.
 *
 * Ambiguity is prevented where values ENTER the store, not guessed at match time: valueProblem() refuses a 1-char
 * value, a <5 digit number (it would collide with every date/version/status/list number), and a common English word
 * (masking "an" or "Green" would tokenize ordinary prose). That keeps the matching path uniform — mask exactly what is
 * in the store — with no length/case special cases.
 */

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHmac, randomBytes } from 'node:crypto';

const STORE_DIRNAME = 'testdata';
const SECRET_FILE = '.pii-secret';   // per-project HMAC key for the fuzzy #id — agent-blocked (inside testdata), not .json
const LABEL_RE = /^[a-z0-9_-]+$/i;

// ── Hardcoded schemas ─────────────────────────────────────────────────────────────────────────────────────────
// FAMILY_SCHEMA = family-level fields (shared). MEMBER_SCHEMA = per-person fields. The editor fills ONLY these; the
// agent is shown both lists + calls <testdata_fields>. Edit to change fields. `format` is the input placeholder hint.
const FAMILY_SCHEMA = [
  { name: 'deers_family_id', label: 'DEERS Family ID' },
];
const MEMBER_SCHEMA = [
  { name: 'first_name' },
  { name: 'last_name' },
  { name: 'middle_name' },
  { name: 'dob', label: 'Date of birth', format: 'YYYY-MM-DD' },
  { name: 'ssn', format: '123-45-6789' },
  { name: 'phone', format: '555-012-3456' },
  { name: 'email' },
  { name: 'edi', label: 'EDI', format: '10 digits' },
  { name: 'deers_beneficiary_id', label: 'DEERS Beneficiary ID' },
  { name: 'address.street', label: 'Street' },
  { name: 'address.city', label: 'City' },
  { name: 'address.zip', label: 'ZIP' },
];
// A USABLE token is @@@( path ) — a single path `family.rest` where rest is a family field (deers_family_id) or
// member.field(.sub). A FUZZY descriptor is ###{ … } (read-only). The TRIPLE sigil (three @ / three #) is what makes
// our tokens unmistakable: ordinary code never writes "@@@(" or "###{" (Razor is @(, Sass is #{, Markdown "### " has
// a trailing space), so there is no collision surface with real tool content. The closing paren/brace can't appear
// inside a path/descriptor.
const ONE_PATH = '[a-z0-9_-]+\\.[a-z0-9_.-]+';
const TOKEN_RE = new RegExp(`@@@\\((${ONE_PATH})\\)`, 'gi');
// ANY ###{…} reaching a tool is a mistake (fail-closed) — it is a read-only descriptor, never a settable value.
// Because the triple-# opener is unambiguously ours we can catch BOTH tiers, not just the cross-family one; the id
// sub-form (16 hex — a 64-bit HMAC, so collisions are negligible) is captured for the expand hint.
// The interior must read like a descriptor (" in " / " across " / a #id) — "###" immediately followed by "{" also
// occurs in ordinary payload text (a "####" markdown rule against a CSS/Sass brace), and refusing THAT tool call is a
// false alarm. A mangled descriptor without any of those words carries no value, so letting it through is not a leak.
const FUZZY_RE = /###\{[^{}]*(?: in | across |#[0-9a-f]{16})[^{}]*\}/g;
const FUZZY_ID_RE = /###\{[^{}]*#([0-9a-f]{16})\}/g;

// ── store loading (per-project, no cache, FAIL-CLOSED read) ───────────────────────────────────────────────────
function storeDirFor(projectDir) { return projectDir ? resolve(projectDir, STORE_DIRNAME) : null; }
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
    if (!f.toLowerCase().endsWith('.json')) continue;   // skips .pii-secret + any dotfile/non-json
    const stem = f.replace(/\.json$/i, '');
    if (!LABEL_RE.test(stem)) continue;                 // a label must be a clean token
    let raw;
    try { raw = readFileSync(join(dir, f), 'utf8'); }
    catch (e) {
      if (e && e.code === 'ENOENT') continue;
      throw new Error(`test-data file "${f}" could not be read (${e?.code || e?.message}) — refusing to pass content through unmasked (fail-closed)`);
    }
    let obj;
    try { obj = JSON.parse(raw); } catch { throw new Error(`test-data file "${f}" is not valid JSON — refusing to pass content through unmasked (a malformed store must not silently leak). Fix or remove it.`); }
    if (!obj || typeof obj !== 'object') continue;
    const family = (obj.family && typeof obj.family === 'object' && !Array.isArray(obj.family)) ? obj.family : {};
    const members = (obj.members && typeof obj.members === 'object' && !Array.isArray(obj.members)) ? obj.members : {};
    cases.set(stem.toLowerCase(), { label: stem.toLowerCase(), description: typeof obj.description === 'string' ? obj.description : '', family, members });
  }
  return cases;
}
function loadFamily(projectDir, family) {
  return loadStore(projectDir).get(String(family).toLowerCase()) || { label: String(family).toLowerCase(), description: '', family: {}, members: {} };
}

// The fuzzy #id is HMAC(value, per-project secret): stable per value (so the same value always shows the same id,
// even across restarts — the id lives in the persisted transcript), leak-proof (a keyed hash reveals nothing about
// the value without the secret, unlike a plain hash which a low-entropy value could be dictionary-attacked from).
// Only the small SECRET is persisted; there is no id→value map to grow. Generated once, agent-blocked (inside testdata).
const secretCache = new Map();   // resolved storeDir -> secret: stable within a process even if the disk write fails
function getSecret(projectDir) {
  const dir = storeDirFor(projectDir);
  if (!dir) return null;
  if (secretCache.has(dir)) return secretCache.get(dir);   // one read per project per process (stable + cheap)
  const p = join(dir, SECRET_FILE);
  try { const s = readFileSync(p, 'utf8').trim(); if (s) { secretCache.set(dir, s); return s; } } catch {}
  const s = randomBytes(32).toString('hex');
  let final = s;
  // Exclusive create: if two code_boss INSTANCES race to mint the first-ever secret, the loser gets EEXIST and
  // re-reads the winner's value, so ids never diverge from what testdata_expand will later read off disk.
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(p, s, { encoding: 'utf8', flag: 'wx' });
  } catch (e) {
    if (e && e.code === 'EEXIST') { try { const s2 = readFileSync(p, 'utf8').trim(); if (s2) final = s2; } catch {} }
    // else UNPERSISTABLE (read-only dir / .pii-secret is a directory): fall back to the in-memory secret so ids stay
    // STABLE for the life of this process (across restarts they'd differ, but a wholly-unwritable testdata is a
    // degraded env). We do NOT throw — masking must still tokenize the value (no leak), just with a session-stable id.
  }
  secretCache.set(dir, final);
  return final;
}
// 16 hex = 64-bit HMAC prefix — collisions are negligible even for a very large store (birthday bound ~5e9 values).
function idFor(key, secret) { return createHmac('sha256', String(secret)).update(key).digest('hex').slice(0, 16); }

// ── store WRITING (the panel editor; the agent never writes here) ─────────────────────────────────────────────
const UNSAFE_KEY = new Set(['__proto__', 'prototype', 'constructor']);
// A family/member label is BOTH a filename stem AND an object key (c.members[label]). LABEL_RE alone admits "__proto__"
// / "constructor", and a crafted panel event id ("mf:smiths:__proto__:x") would then write onto Object.prototype
// (process-wide pollution) through c.members[member]. Screen every label used as a key against UNSAFE_KEY too.
function safeLabel(l) { return LABEL_RE.test(l) && !UNSAFE_KEY.has(String(l).toLowerCase()); }
function setField(fields, dotted, value) {
  const parts = String(dotted).split('.');
  if (parts.some((p) => UNSAFE_KEY.has(p))) throw new Error(`illegal field path "${dotted}" (a segment would touch the object prototype)`);
  let o = fields;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!Object.prototype.hasOwnProperty.call(o, parts[i]) || !o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
    o = o[parts[i]];
  }
  const leaf = parts[parts.length - 1];
  // Store the TRIMMED value: valueProblem() validates the trimmed form, and a padded store value ("  Okonkwo  ")
  // would never match the same name written normally in a document — a silent leak. Trim strips only the ends, so a
  // multi-word value ("Kilimanjaro Terrace") is preserved.
  const s = value == null ? '' : String(value).trim();
  if (s === '') delete o[leaf];
  else o[leaf] = s;
}
// A family label is a FILE NAME under the agent-blocked store dir. LABEL_RE (no dots, slashes or ..) is the guard that
// keeps a panel event id like "ff:../../pwned:deers_family_id" from writing real PII OUTSIDE the blocked dir — validate
// here too, not only at the panel edge, so no caller can bypass it.
function writeFamily(projectDir, label, c) {
  const dir = storeDirFor(projectDir);
  if (!dir) throw new Error('no project open');
  if (!LABEL_RE.test(label)) throw new Error(`illegal family label "${label}"`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, label + '.json'), JSON.stringify({ label, description: c.description || '', family: c.family || {}, members: c.members || {} }, null, 2), 'utf8');
}
function deleteFamily(projectDir, label) {
  const dir = storeDirFor(projectDir);
  if (!dir || !LABEL_RE.test(label)) return;
  try { rmSync(join(dir, label + '.json'), { force: true }); } catch {}
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
// [dottedPath, value] for every leaf. The VALUE is carried out rather than looked back up with getField(): a key that
// itself contains a dot ("weird.key") produces a path getField cannot re-read, and the value would then never be
// indexed and so never masked — a silent leak. Masking uses the value; only UNMASKING needs the path to be readable,
// and resolveRest fails closed there.
function leafEntries(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj || {})) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') out.push(...leafEntries(v, p));
    else if (typeof v === 'string' || typeof v === 'number') out.push([p, v]);   // numbers too — a JSON-number store must mask
    // a boolean / null leaf is INTENTIONALLY skipped: its text form ("true"/"false"/"null") is a common word, and
    // masking it would tokenize that word across ordinary prose (the reason COMMON_WORDS exists). Such a leaf is not PII.
  }
  return out;
}
function leafPaths(obj, prefix = '') { return leafEntries(obj, prefix).map(([p]) => p); }
// A store value as text. A JSON number beyond MAX_SAFE_INTEGER was ALREADY rounded by JSON.parse, so its digits no
// longer match the document and it could neither be masked nor unmasked correctly — refuse rather than leak.
function asStr(v) {
  if (typeof v === 'string') return v;
  if (typeof v !== 'number') return undefined;
  if (!Number.isFinite(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER) {
    throw new Error(`test-data value ${v} is too large to be an exact JSON number — JSON.parse has already rounded its digits, so it cannot be masked reliably. Quote it as a string in the testdata file (fail-closed).`);
  }
  return String(v);
}
function familyOfPath(p) { return p.slice(0, p.indexOf('.')); }
function restOfPath(p) { return p.slice(p.indexOf('.') + 1); }   // "sponsor.ssn" | "deers_family_id"

// ── value NORMALIZATION (mask-side only; unmask always restores the real STORED spelling) ─────────────────────────
// The value index is keyed by a NORMALIZED form so a value is recognized however it is spelled in a document:
//   • a NUMERIC IDENTIFIER (only digits + the usual separators, >= 3 digits) is keyed by its DIGIT SEQUENCE, so any
//     separator layout — "482-11-9037", "482 11 9037", "482.11.9037", "(555) 012-3456" — is the same value;
//   • everything else is TEXT, keyed case-INSENSITIVELY (lowercased), so "OKONKWO"/"okonkwo" is the same value.
// The n:/t: prefix keeps the two namespaces from ever colliding. The >=3 floor on the KEY body is a deliberate
// low-entropy cutoff (a 1-2 char value is not masked — a documented non-guarantee).
// Separators a numeric identifier may be written with. Deliberately WIDE (we would rather over-match than let a real
// id through in an unusual rendering): whitespace incl. nbsp + the zero-width/soft-hyphen invisibles, the ASCII and
// fullwidth punctuation a form or a table can put between digit groups, and the unicode dashes/minus. Only characters
// that are NOT letters or digits — so a run can never eat a word. NUM_GAP bounds how many of them may sit between two
// digits (column padding, " | ", a soft hyphen + newline). Markup containing LETTERS ("482<b>11</b>9037",
// "482&nbsp;11") is a documented non-guarantee: a separator class with letters in it would swallow prose.
const NUM_SEP = '[\\s\\u00a0\\u00ad\\u200b-\\u200d\\u2060\\ufeff.,;:/\\\\_|()\\[\\]\\{\\}<>*~=+#&\'"\\u00b7\\u2010-\\u2015\\u2212\\uff0d\\uff0e\\uff0f\\uff1a\\-]';
const NUM_GAP = 6;
// NUM_FLOOR (5) is the low-entropy cutoff for a NUMERIC identifier. A 1-4 digit number collides with the years,
// versions, HTTP status codes and list numbers that fill ordinary content, so masking it would corrupt that content
// and its token would unmask to the wrong value. Real DEERS identifiers — SSN(9), EDI(10), DEERS ids, ZIP(5) — are all
// >= 5 digits, so this keeps every real value maskable while refusing the ambiguous short ones at authoring time.
const NUM_FLOOR = 5;
const NUMERIC_ONLY_RE = new RegExp(`^(?:${NUM_SEP}|\\d)+$`, 'u');
// Whole-word guards. TEXT uses a UNICODE letter/digit guard (an ASCII-only guard splits "Okonkwoe-acute" mid-word).
// NUMERIC uses a DIGIT-ONLY guard: a stored id must not be masked when it is a substring of a LONGER digit run (a
// different number), but it SHOULD mask when glued to a letter or "_" ("SSN111223333", "edi_1002003004") — same id, and
// leaving those raw was a confirmed leak. So only an adjacent DIGIT blocks a numeric match.
const WORD_RE = /[\p{L}\p{N}_]/u;
function isWordChar(ch) { return !!ch && WORD_RE.test(ch); }
const STARTS_WORD = /^[\p{L}\p{N}_]/u, ENDS_WORD = /[\p{L}\p{N}_]$/u;
// Text-normalization character classes. INVISIBLE marks are DROPPED (a soft hyphen / zero-width char injected inside a
// name or id must not hide it); real WHITESPACE collapses to a single space (so a value written across a line break or
// with doubled spaces still matches); a MARK (combining accent) rides with its base cluster for composition folding.
const INVISIBLE_RE = /[\u00ad\u200b\u200c\u200d\u2060\ufeff]/;
const WS_RE = /[\s\u00a0]/;
const MARK_RE = /\p{M}/u;
function digitsOf(v) { return String(v).replace(/\D/g, ''); }
function isNumericId(v) { return NUMERIC_ONLY_RE.test(v) && digitsOf(v).length >= NUM_FLOOR; }
// Text is NFC-normalized before lowercasing so a composed and a decomposed spelling of the same name are ONE value.
function foldText(v) { return String(v).normalize('NFC').toLowerCase(); }
function normKey(v) { const s = String(v); return isNumericId(s) ? 'n:' + digitsOf(s) : 't:' + foldText(s); }
// Punctuation-variant equivalence: an apostrophe (O'Brien) may be written straight ' / curly / modifier; a hyphen
// (Smith-Jones) may be an ASCII - / non-breaking / en / em dash. NORMALIZATION canonicalizes each to its class's first
// member so a match written any way resolves to the same stored value (matching is on the normalized form, so there is
// no variant enumeration and no combinatorial blow-up).
const PUNCT_CLASSES = ['\u0027\u2018\u2019\u02bc\u2032', '\u002d\u2010\u2011\u2012\u2013\u2014\u2015\u2212'];
const PUNCT_CANON = new Map();   // any variant char -> the canonical (first) char of its class
for (const cls of PUNCT_CLASSES) for (const ch of cls) PUNCT_CANON.set(ch, cls[0]);
function canonPunct(s) { let out = ''; for (const ch of String(s)) out += PUNCT_CANON.get(ch) || ch; return out; }

// ── NORMALIZE-BOTH-SIDES matching primitives ──────────────────────────────────────────────────────────────────────
// The document and the stored dictionary are folded to the SAME canonical form, matched on that form, and each match is
// mapped back to the ORIGINAL byte span (so non-PII text is copied through verbatim and only the matched span is
// replaced). This folds case, unicode composition/COMPATIBILITY (NFKC — so a PDF ligature or fullwidth char matches),
// punctuation variants, dropped invisibles, and collapsed whitespace into ONE fold instead of enumerating every
// rendering as a separate regex alternative.
//
// normalizeText(text) -> { norm, map } where norm is the folded string and map[i] = [origStart, origEnd) is the
// ORIGINAL code-unit span that produced folded char i (so a folded run maps back to real offsets even when a fold
// expands one char to several, e.g. the ligature fi -> "fi" or eszett -> "ss").
function normalizeText(text) {
  const s = String(text);
  const norm = [];
  const map = [];
  let i = 0;
  while (i < s.length) {
    const cp = s.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    const cuLen = ch.length;                                   // 1 or 2 (surrogate pair)
    if (INVISIBLE_RE.test(ch)) { i += cuLen; continue; }       // drop a soft-hyphen / zero-width char entirely
    if (WS_RE.test(ch)) {                                       // collapse a whitespace run to one space
      let j = i + cuLen;
      while (j < s.length) { const c2 = String.fromCodePoint(s.codePointAt(j)); if (WS_RE.test(c2) || INVISIBLE_RE.test(c2)) j += c2.length; else break; }
      norm.push(' '); map.push([i, j]); i = j; continue;
    }
    // gather a base char + its trailing combining marks into one cluster so NFKC can compose an accent
    let j = i + cuLen;
    let cluster = ch;
    while (j < s.length) { const c2 = String.fromCodePoint(s.codePointAt(j)); if (MARK_RE.test(c2)) { cluster += c2; j += c2.length; } else break; }
    // Full CASE FOLD: toUpperCase().toLowerCase() (not just toLowerCase) so an already-lowercase char whose UPPER form
    // expands folds correctly — the German sharp-s "ß" upper-cases to "SS", so a document "STRASSE" folds to the same
    // "strasse" as the stored "Straße". (An idempotent, both-sides fold.)
    const folded = canonPunct(cluster).normalize('NFKC').toUpperCase().toLowerCase();
    for (const fc of folded) { norm.push(fc); map.push([i, j]); }
    i = j;
  }
  return { norm: norm.join(''), map };
}
function normalizeTextKey(v) { return normalizeText(v).norm; }

// A digit, NFKC-folded to its ASCII value — so a FULLWIDTH digit ("４"), which stored ids never use, still matches the
// stored ASCII digit (an id written in fullwidth digits was otherwise an evasion). Returns the ASCII digit char or null.
function digitFold(ch) {
  if (!ch) return null;
  if (ch >= '0' && ch <= '9') return ch;
  const f = ch.normalize('NFKC');
  return (f.length === 1 && f >= '0' && f <= '9') ? f : null;
}
// numberSegments(text) -> [{ digits, pos }] — each a maximal run of digits joined by <= NUM_GAP separator chars (a
// letter or a wider gap BREAKS the run, so "call 482 on gate 11" is three numbers, not one). digits is the bare digit
// string (folded to ASCII); pos[k] is the ORIGINAL code-unit index of digit k. A stored key is searched in each segment.
const NUM_SEP_CH = new RegExp('^' + NUM_SEP + '$', 'u');
function numberSegments(text) {
  const s = String(text);
  const segs = [];
  let i = 0;
  while (i < s.length) {
    if (digitFold(s[i]) == null) { i++; continue; }
    let digits = '', pos = [], j = i;
    while (j < s.length) {
      const d = digitFold(s[j]);
      if (d != null) { digits += d; pos.push(j); j++; continue; }
      let k = j, sep = 0;
      while (k < s.length && NUM_SEP_CH.test(s[k])) { k++; sep++; }
      if (k < s.length && digitFold(s[k]) != null && sep <= NUM_GAP) { j = k; continue; }   // bridge a bounded separator gap
      break;
    }
    segs.push({ digits, pos });
    i = j;
  }
  return segs;
}

// ── AUTHORING-TIME validation: keep ambiguous values OUT of the store ─────────────────────────────────────────
// Because masking is exact-value and whole-word, a value that is an ordinary English word would tokenize ordinary
// prose everywhere it appears ("Green", "Reading", "an"). Rather than a runtime heuristic that guesses which
// occurrences are "really" the value — surprising, and it silently leaks the ones it skips — we REFUSE the value at
// the point the developer enters it. This is TEST data: a distinctive value is always available. The result is that
// the matching path stays uniform ("mask exactly what is in the store") with no special cases.
const COMMON_WORDS = new Set(('a an and are as at be been but by call can come could day did do does down each even find first for from get give go had has have he her here him his how i if in into is it its just know like look make man many may me more most my new no not now of on one only or other our out over people take than that the their them then there these they thing think this those time to too two up us use very want was way we well were what when where which who why will with word work would year you your about after again against all also always another any around back because before below between both came come does down each end even every few found give great group hand help high home house just keep kind large last late left less life little long look made make most move much must name need never next night number off often old open own part place point put right room said same saw say school see seem set she should show side small some sound still such sure tell thought three through today together took turn under until upon used want water week went while white why without world write yes yet young green brown black blue red gray grey good bad big top low hard easy free full real true false near far half whole main cold hot warm rich poor safe wild deep wide fine nice front north south east west start stop short round square light dark heavy quick slow strong weak clean happy best better king church cross bell hall park price rose stone field wood hill').split(' '));
// Returns a human-readable reason a value must not be stored, or null if it is fine to store + mask.
function valueProblem(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;                                     // blank clears the field — always allowed
  // Use the SAME numeric test the runtime uses (NUMERIC_ONLY_RE), or a value like "1/2" slips past this guard as
  // "text" and is then masked as a literal across ordinary prose.
  if (NUMERIC_ONLY_RE.test(s)) {
    if (digitsOf(s).length < NUM_FLOOR) return `"${s}" has only ${digitsOf(s).length} digit(s) — too short to mask safely (a 1-${NUM_FLOOR - 1} digit number collides with years, versions, status codes and list numbers, so masking it would corrupt ordinary content). Use an identifier with at least ${NUM_FLOOR} digits.`;
    return null;
  }
  // Count LETTERS/DIGITS, not characters: "J." is one letter dressed as two, and masking it tokenizes every "J." in prose.
  const body = s.replace(/[^\p{L}\p{N}]/gu, '');
  if (body.length < 2) return `"${s}" carries only ${body.length} letter/digit — too ambiguous to mask (it would tokenize that letter everywhere). Use at least 2 letters.`;
  if (COMMON_WORDS.has(foldText(s))) return `"${s}" is a common English word — masking it would tokenize ordinary prose everywhere it appears. Pick a distinctive test value.`;
  return null;
}

// ── the value index: normKey -> the sorted set of every PATH that holds it ────────────────────────────────────
function buildIndex(cases) {
  const byKey = new Map();     // normKey -> Set(path)
  const spell = new Map();     // normKey -> Set(raw spelling as stored)
  const add = (path, raw) => {
    let s = asStr(raw); if (s == null) return;
    s = s.trim(); if (!s) return;   // a hand-authored padded value would otherwise never match the same word in prose
    // The only runtime floor is what can NEVER be matched safely whatever the developer intended: a 1-char value, and
    // a short NUMERIC value (< NUM_FLOOR digits — an enumerator/date/version like "01"/"2024" collides with ordinary
    // numbers). Everything else in the store IS masked, uniformly — ambiguous values are rejected at AUTHORING time.
    if (NUMERIC_ONLY_RE.test(s) && digitsOf(s).length < NUM_FLOOR) return;
    const key = normKey(s);
    if (key.length - 2 < 2) return;
    if (!byKey.has(key)) { byKey.set(key, new Set()); spell.set(key, new Set()); }
    byKey.get(key).add(path);
    spell.get(key).add(s);
  };
  for (const [flabel, c] of cases) {
    for (const [fp, v] of leafEntries(c.family)) add(`${flabel}.${fp}`, v);
    for (const [mlabel, mfields] of Object.entries(c.members)) {
      for (const [fp, v] of leafEntries(mfields)) add(`${flabel}.${mlabel}.${fp}`, v);
    }
  }
  const paths = new Map(), raw = new Map();
  for (const [key, set] of byKey) { paths.set(key, [...set].sort()); raw.set(key, [...spell.get(key)]); }
  return { paths, raw };   // normKey -> sorted paths | normKey -> the spellings actually on disk
}
function familiesOf(paths) { return [...new Set(paths.map(familyOfPath))].sort(); }
function tierOf(paths) { if (paths.length <= 1) return 1; return familiesOf(paths).length === 1 ? 2 : 3; }

// The fields component of a cross-family descriptor — the same string tier3Token() emits.
function tier3FieldsOf(paths) {
  return [...new Set(paths.map(restOfPath).map((r) => { const i = r.indexOf('.'); return i < 0 ? r : r.slice(i + 1); }))].sort().join('/');
}
// Does this @@@(…)/###{…} match a token the plugin could ACTUALLY have emitted from the CURRENT store? Validating the
// SHAPE is not enough and was a confirmed leak: "###{482.11.9037 across 2 families #0123456789abcdef}" and
// "@@@(smiths.20240001)" both satisfy a shape grammar, and sheltering them from the mask pass hands the raw value to
// the model verbatim. So every part is checked against the live store — the path must be a REAL path, the within-family
// descriptor must be one we would emit, and a cross-family descriptor's field list + family count + named anchors must
// all match a value that really is shared that way. Anything else is NOT a token: it gets re-scanned and its interior
// masks normally.
function buildTokenValidator(idx, cases) {
  const realPaths = new Set();
  for (const [flabel, c] of cases) {
    for (const p of leafPaths(c.family)) realPaths.add(foldText(`${flabel}.${p}`));
    for (const [ml, mf] of Object.entries(c.members)) for (const p of leafPaths(mf)) realPaths.add(foldText(`${flabel}.${ml}.${p}`));
  }
  const tier2 = new Set();
  const tier3 = [];
  for (const [, ps] of idx.paths) {
    const t = tierOf(ps);
    if (t === 2) tier2.add(foldText(tier2Token(ps)));
    else if (t === 3) tier3.push({ fields: foldText(tier3FieldsOf(ps)), fams: new Set(familiesOf(ps)) });
  }
  const T3 = /^###\{(.+?) across (\d+) families(?: incl\. ([^#{}]+?))? #[0-9a-f]{16}\}$/;
  return (tok) => {
    if (tok.startsWith('@@@(')) return tok.endsWith(')') && realPaths.has(foldText(tok.slice(4, -1)));
    if (tier2.has(foldText(tok))) return true;
    const m3 = T3.exec(foldText(tok));
    if (!m3) return false;
    const named = m3[3] ? m3[3].split(', ') : [];
    return tier3.some((e) => e.fields === m3[1] && e.fams.size === Number(m3[2]) && named.every((n) => e.fams.has(n)));
  };
}

// ── the MATCHER (normalize-both-sides) ──────────────────────────────────────────────────────────────────────────
// Fold the document and the stored dictionary to the SAME canonical form, find each stored value in the folded stream,
// then map the match back to its ORIGINAL byte span. This replaces the old "enumerate every spelling into one giant
// regex alternation" scan — which required anticipating every rendering and was the source of the recurring leak/
// over-mask class. Now case, unicode composition + COMPATIBILITY (ligatures, fullwidth), punctuation variants, dropped
// invisibles and collapsed whitespace all fall out of ONE fold. TEXT and NUMERIC use different folds (text keeps its
// letters and matches whole-value; a number ignores its internal separators and matches by digit run), so they are two
// candidate sources that are merged by leftmost-longest overlap resolution — which is what makes a street "12345 Kili…"
// win over the 5-digit ZIP alt hiding inside it, structurally rather than by hand-ordered alternatives.
function charAt(text, i) { if (i < 0 || i >= text.length) return ''; return String.fromCodePoint(text.codePointAt(i)); }
function prevChar(text, i) {
  if (i <= 0) return '';
  const c = text.charCodeAt(i - 1);
  if (c >= 0xdc00 && c <= 0xdfff && i >= 2) return text.slice(i - 2, i);   // trailing surrogate -> return the full pair
  return text[i - 1];
}
function buildMatcher(idx, cases) {
  const textKeys = new Map();   // normalized text key -> Map(normKey -> Set(path))
  const numKeys = new Map();    // digit string -> { key, paths[] }
  for (const [key, ps] of idx.paths) {
    if (key.startsWith('n:')) { numKeys.set(key.slice(2), { key, paths: ps }); continue; }
    for (const raw of idx.raw.get(key) || []) {
      const nk = normalizeTextKey(raw);
      if (!nk) continue;
      let m = textKeys.get(nk); if (!m) { m = new Map(); textKeys.set(nk, m); }
      let set = m.get(key); if (!set) { set = new Set(); m.set(key, set); }
      for (const path of ps) set.add(path);
    }
  }
  if (!textKeys.size && !numKeys.size) return null;
  const textList = [...textKeys.keys()];
  const numList = [...numKeys.keys()];
  const isRealToken = buildTokenValidator(idx, cases);
  // Resolve one text key to a SINGLE value's { key, paths }. A folded key can map to >1 distinct stored value only when
  // a lossy case-fold collides ("Große".toUpperCase() === "GROSSE" -> "grosse", same as "Grosse"); prefer the value
  // whose own spelling folds to the matched text, else pick deterministically — always a single value, never a false
  // cross-family descriptor.
  function textResolve(nk, matchedOrig) {
    const m = textKeys.get(nk); if (!m) return null;
    if (m.size === 1) { const [k, set] = [...m][0]; return { key: k, paths: [...set].sort() }; }
    const direct = normKey(canonPunct(matchedOrig));
    const pick = m.has(direct) ? direct : [...m.keys()].sort()[0];
    return { key: pick, paths: [...m.get(pick)].sort() };
  }
  return {
    // GENUINE emitted-token spans (leave verbatim + do not mask their interior). A FORGED wrapper is NOT reserved, so
    // its interior falls through to normal masking. Same store-keyed validation as before (buildTokenValidator).
    reserved(text) {
      const out = [];
      const shape = /@@@\([^()\s]{0,200}\)|###\{[^{}]{0,400}\}/gu;
      let m; while ((m = shape.exec(text)) !== null) { if (isRealToken(m[0])) out.push([m.index, m.index + m[0].length]); }
      return out;
    },
    // every value occurrence as { start, end, key, paths } in ORIGINAL offsets, skipping any overlapping a reserved span.
    candidates(text, reserved) {
      const inReserved = (s, e) => reserved.some(([rs, re]) => s < re && e > rs);
      const cands = [];
      if (textList.length) {
        const { norm, map } = normalizeText(text);
        for (const nk of textList) {
          let from = 0, pos;
          while ((pos = norm.indexOf(nk, from)) !== -1) {
            from = pos + 1;
            const start = map[pos][0], end = map[pos + nk.length - 1][1];
            // whole-value boundary: only where the key EDGE is a word char, the ORIGINAL neighbor must not be one
            if (STARTS_WORD.test(nk[0]) && isWordChar(prevChar(text, start))) continue;
            if (ENDS_WORD.test(nk[nk.length - 1]) && isWordChar(charAt(text, end))) continue;
            if (inReserved(start, end)) continue;
            const hit = textResolve(nk, text.slice(start, end));
            if (hit) cands.push({ start, end, key: hit.key, paths: hit.paths });
          }
        }
      }
      if (numList.length) {
        for (const seg of numberSegments(text)) {
          for (const dk of numList) {
            if (dk.length > seg.digits.length) continue;
            let from = 0, pos;
            while ((pos = seg.digits.indexOf(dk, from)) !== -1) {
              from = pos + 1;
              const start = seg.pos[pos], end = seg.pos[pos + dk.length - 1] + 1;
              // digit boundary: an adjacent DIGIT in the original means this is a slice of a LONGER number -> reject
              if (digitFold(prevChar(text, start)) != null || digitFold(charAt(text, end)) != null) continue;
              if (inReserved(start, end)) continue;
              const nk = numKeys.get(dk);
              cands.push({ start, end, key: nk.key, paths: [...nk.paths] });
            }
          }
        }
      }
      return cands;
    },
  };
}
// leftmost-longest resolution: at each position take the longest match, jump past it — same semantics a regex scan gives,
// and what makes the longer (text street) win over a shorter (numeric ZIP) candidate covering the same span.
function resolveOverlaps(cands) {
  cands.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const chosen = [];
  let cursor = 0;
  for (const c of cands) if (c.start >= cursor) { chosen.push(c); cursor = c.end; }
  return chosen;
}

// The tokens for a value, given its paths + the anchor families for THIS text.
function tier1Token(paths) { return `@@@(${paths[0]})`; }
function tier2Token(paths) { return `###{${paths.map(restOfPath).sort().join(', ')} in ${familyOfPath(paths[0])}}`; }
function tier3Token(paths, anchors, id) {
  const fams = familiesOf(paths);
  const named = fams.filter((f) => anchors.has(f)).slice(0, 3);
  const incl = named.length ? ` incl. ${named.join(', ')}` : '';
  return `###{${tier3FieldsOf(paths)} across ${fams.length} families${incl} #${id}}`;
}

// ── resolve a single-path token's rest against a family case ──────────────────────────────────────────────────
// A path can, for an off-schema hand-authored store, be produced by BOTH a family-level nested key and a member
// field. If both exist and DIFFER, refuse to guess (fail-closed) rather than silently returning the wrong person's
// value; if they're equal (a genuinely shared value) either is correct.
function resolveRest(c, rest) {
  const found = [];
  const push = (v) => { if (v !== undefined && !found.includes(v)) found.push(v); };
  push(asStr(getField(c.family, rest)));
  // EVERY member/field split, not just the first dot: a store with members "sponsor" and "sponsor.address" makes
  // "sponsor.address.zip" mean two different people's zips. Silently taking the first was a fail-OPEN wrong value.
  for (let dot = rest.indexOf('.'); dot >= 0; dot = rest.indexOf('.', dot + 1)) {
    const m = c.members[rest.slice(0, dot)];
    if (m) push(asStr(getField(m, rest.slice(dot + 1))));
  }
  if (found.length > 1) {
    throw new Error(`ambiguous test-data token @@@(${c.label}.${rest}) — it maps to ${found.length} DIFFERENT stored values (a family-level key or a member label shadows another member's path); refusing to guess which (fail-closed). Fix the store so no label contains a dot and no family-level key shadows a member label.`);
  }
  return found[0];
}

// ── the panel editor's component tree (PLUGIN-UI-PANEL-SPEC.md §4) ─────────────────────────────────────────────
function textRow(idPrefix, fieldPath, lbl, value, placeholder) {
  return { type: 'text', id: `${idPrefix}:${fieldPath}`, label: lbl, value: typeof value === 'string' ? value : '', placeholder: placeholder || '' };
}
function memberSection(family, mlabel, mfields) {
  const schemaNames = new Set(MEMBER_SCHEMA.map((s) => s.name));
  const rows = MEMBER_SCHEMA.map((s) => textRow(`mf:${family}:${mlabel}`, s.name, s.label || s.name, getField(mfields, s.name), s.format));
  for (const fp of leafPaths(mfields)) if (!schemaNames.has(fp)) rows.push(textRow(`mf:${family}:${mlabel}`, fp, fp + ' (extra)', getField(mfields, fp), ''));
  rows.push({ type: 'button', id: `delm:${family}:${mlabel}`, label: 'Delete member', variant: 'danger' });
  return { type: 'section', id: `member:${family}:${mlabel}`, title: '👤 ' + mlabel, children: rows };
}
function familySection(flabel, c) {
  const famRows = FAMILY_SCHEMA.map((s) => textRow(`ff:${flabel}`, s.name, s.label || s.name, getField(c.family, s.name), s.format));
  const members = Object.entries(c.members).map(([m, mf]) => memberSection(flabel, m, mf));
  return { type: 'section', id: `family:${flabel}`, title: '👪 ' + flabel, children: [
    ...famRows,
    { type: 'note', text: members.length ? 'Members:' : 'No members yet — add one below.' },
    ...members,
    { type: 'section', id: `addmember:${flabel}`, title: '+ Add a member', collapsed: true, children: [
      { type: 'text', id: `newmember:${flabel}`, label: 'Member label', placeholder: 'e.g. sponsor, spouse, child1' },
      { type: 'button', id: `addm:${flabel}`, label: 'Add member', variant: 'primary' },
    ] },
    { type: 'button', id: `delf:${flabel}`, label: 'Delete family', variant: 'danger' },
  ] };
}
function buildPanelTree(projectDir) {
  const cases = loadStore(projectDir);
  const sections = [...cases.entries()].map(([flabel, c]) => familySection(flabel, c));
  return { type: 'stack', children: [
    { type: 'note', text: cases.size
      ? `${cases.size} famil${cases.size === 1 ? 'y' : 'ies'}. Real values live in testdata (hidden from the agent — it only ever sees tokens). Edits save as you type.`
      : 'No families yet — add one below. Real values stay in testdata, hidden from the agent.' },
    ...sections,
    { type: 'section', id: 'addfamily', title: '+ Add a family', collapsed: true, children: [
      { type: 'text', id: 'newfamily', label: 'Family label', placeholder: 'e.g. smiths (lowercase, no spaces)' },
      { type: 'button', id: 'addfamily-go', label: 'Create family', variant: 'primary' },
    ] },
  ] };
}
function fieldStatusLines(schema, obj) {
  const isFilled = (v) => (typeof v === 'string' && v.length > 0) || typeof v === 'number';
  const names = new Set(schema.map((s) => s.name));
  const lines = schema.map((s) => { const v = getField(obj, s.name); return `  ${isFilled(v) ? '✓' : '·'} ${s.name}`; });
  for (const fp of leafPaths(obj).filter((fp) => !names.has(fp))) lines.push(`  ✓ ${fp} (not in schema)`);
  return lines;
}

// ── the plugin ────────────────────────────────────────────────────────────────────────────────────────────────
export default {
  description: 'PII-safe test data: DEERS families whose real values stay tokenized to the model, real only inside tool calls',
  author: 'code_boss',
  blockedPaths: [STORE_DIRNAME],

  promptAddition: (projectDir) => {
    const cases = loadStore(projectDir);
    if (!cases.size) return '';
    const lines = ['TEST DATA — families of DEERS beneficiaries (values are hidden — you only ever get a TOKEN):'];
    for (const [flabel, c] of cases) {
      lines.push(`  ${flabel}${c.description ? ` (${c.description})` : ''} — members: ${Object.keys(c.members).join(', ') || '(none)'}`);
    }
    lines.push(`  family-level field: ${FAMILY_SCHEMA.map((s) => s.name).join(', ')}`);
    lines.push(`  per-member fields: ${MEMBER_SCHEMA.map((s) => s.name).join(', ')}`);
    lines.push('To SET a value, build a SINGLE-path token — you CAN emit these:');
    lines.push("  a member's field   →  @@@(<family>.<member>.<field>)   e.g. @@@(smiths.sponsor.ssn), @@@(smiths.spouse.address.zip)");
    lines.push('  the family id       →  @@@(<family>.deers_family_id)');
    lines.push('The platform substitutes the real value when the tool runs, and re-tokenizes any real values a tool pulls BACK.');
    lines.push('When you READ data back, a value shared by SEVERAL beneficiaries comes back as a FUZZY, READ-ONLY ###{…} descriptor');
    lines.push('(NOT a usable placeholder — never pass a ###{…} to a tool):');
    lines.push('  shared within one family   →  ###{first_name: sponsor, spouse in smiths}   (the slots are listed — pick one → @@@(smiths.sponsor.first_name))');
    lines.push('  shared across families      →  ###{address.city across 4 families incl. smiths #<id>}   (paths elided; call <testdata_expand id="<id>"/>');
    lines.push('                                 to list every path holding it, then pick one → @@@(family.member.field))');
    lines.push('Never invent, edit, or reformat a token, and never ask for a raw value.');
    return lines.join('\n');
  },

  panel: {
    title: 'Test data', icon: '🔒',
    render: (ctx) => buildPanelTree(ctx && ctx.projectDir),
    onEvent: (ev, ctx) => {
      const projectDir = ctx && ctx.projectDir;
      if (!projectDir) return { error: 'Open a project first — test data is stored per project (testdata).' };
      const id = typeof ev.id === 'string' ? ev.id : '';
      const parts = id.split(':');
      if (ev.event === 'change' && parts[0] === 'ff') {
        const family = parts[1], field = parts.slice(2).join(':');
        if (!family || !field) return {};
        if (!safeLabel(family)) return { error: `illegal family label "${family}".` };
        const bad = valueProblem(ev.value);
        if (bad) return { error: bad };
        const c = loadFamily(projectDir, family);
        try { setField(c.family, field, ev.value); } catch (e) { return { error: e.message }; }
        writeFamily(projectDir, family, c);
        return { toast: { text: `saved ${family}.${field}`, tone: 'ok' } };
      }
      if (ev.event === 'change' && parts[0] === 'mf') {
        const family = parts[1], member = parts[2], field = parts.slice(3).join(':');
        if (!family || !member || !field) return {};
        if (!safeLabel(family)) return { error: `illegal family label "${family}".` };
        if (!safeLabel(member)) return { error: `illegal member label "${member}".` };
        const bad = valueProblem(ev.value);
        if (bad) return { error: bad };
        const c = loadFamily(projectDir, family);
        if (!c.members[member]) c.members[member] = {};
        try { setField(c.members[member], field, ev.value); } catch (e) { return { error: e.message }; }
        writeFamily(projectDir, family, c);
        return { toast: { text: `saved ${family}.${member}.${field}`, tone: 'ok' } };
      }
      if (ev.event === 'click' && id === 'addfamily-go') {
        const family = String((ev.values && ev.values.newfamily) || '').toLowerCase().trim();
        if (!safeLabel(family)) return { error: 'Family label must be letters/digits/_/- only (e.g. smiths), and not a reserved word.' };
        if (loadStore(projectDir).has(family)) return { error: `A family "${family}" already exists.` };
        writeFamily(projectDir, family, { description: '', family: {}, members: {} });
        return { toast: { text: `created family "${family}"`, tone: 'ok' }, render: buildPanelTree(projectDir) };
      }
      if (ev.event === 'click' && parts[0] === 'addm') {
        const family = parts[1];
        if (!safeLabel(family)) return { error: `illegal family label "${family}".` };
        const member = String((ev.values && ev.values[`newmember:${family}`]) || '').toLowerCase().trim();
        if (!safeLabel(member)) return { error: 'Member label must be letters/digits/_/- only (e.g. sponsor), and not a reserved word.' };
        const c = loadFamily(projectDir, family);
        if (c.members[member]) return { error: `Member "${member}" already exists in "${family}".` };
        c.members[member] = {};
        writeFamily(projectDir, family, c);
        return { toast: { text: `added member "${member}" to "${family}"`, tone: 'ok' }, render: buildPanelTree(projectDir) };
      }
      if (ev.event === 'click' && parts[0] === 'delm') {
        const family = parts[1], member = parts[2];
        if (!safeLabel(family) || !safeLabel(member)) return { error: 'illegal label.' };
        const c = loadFamily(projectDir, family);
        delete c.members[member];
        writeFamily(projectDir, family, c);
        return { toast: { text: `deleted member "${member}"`, tone: 'ok' }, render: buildPanelTree(projectDir) };
      }
      if (ev.event === 'click' && parts[0] === 'delf') {
        deleteFamily(projectDir, parts[1]);
        return { toast: { text: `deleted family "${parts[1]}"`, tone: 'ok' }, render: buildPanelTree(projectDir) };
      }
      return {};
    },
  },

  filters: [{
    name: 'pii',
    // real value -> token (H1 request + H3 result). Normalize-both-sides match, then rebuild: genuine emitted tokens are
    // RESERVED (left verbatim, no re-masking inside — idempotent), value occurrences are found in ORIGINAL offsets,
    // overlaps resolve leftmost-longest, and cross-family (tier-3) descriptors name the families anchored by the
    // unique/within-family winners on the same page.
    mask: async (text, ctx) => {
      if (typeof text !== 'string' || !text) return text;
      const cases = loadStore(ctx?.projectDir);   // throws (fail-closed) on a store READ error
      const idx = buildIndex(cases);
      const matcher = buildMatcher(idx, cases);
      if (!matcher) return text;
      const reserved = matcher.reserved(text);
      const chosen = resolveOverlaps(matcher.candidates(text, reserved));
      if (!chosen.length) return text;
      // anchors: families touched by a unique (tier 1) or within-family (tier 2) winner in this text.
      const anchors = new Set();
      for (const c of chosen) if (tierOf(c.paths) <= 2) for (const f of familiesOf(c.paths)) anchors.add(f);
      // rebuild, replacing each chosen span by its tier token. Secret loaded lazily, only if a cross-family id is needed.
      let secret;
      const secretOnce = () => (secret !== undefined ? secret : (secret = getSecret(ctx?.projectDir)));
      let out = '', last = 0;
      for (const c of chosen) {
        const t = tierOf(c.paths);
        out += text.slice(last, c.start) + (t === 1 ? tier1Token(c.paths)
          : t === 2 ? tier2Token(c.paths)
          : tier3Token(c.paths, anchors, idFor(c.key, secretOnce())));
        last = c.end;
      }
      return out + text.slice(last);
    },
    // token -> real value (H2 tool arguments). A single-path @@@(…) resolves; an unknown family passes through; a
    // known family with a bad path THROWS (fail-closed). Any ###{…} reaching a tool is a mistake — THROW with
    // guidance (it is a read-only descriptor, not an injectable value).
    unmask: async (text, ctx) => {
      if (typeof text !== 'string') return text;
      const fuzz = [...text.matchAll(FUZZY_RE)];
      if (fuzz.length) {
        const names = [...new Set(fuzz.map((f) => f[0]))].join(', ');
        const withId = [...text.matchAll(FUZZY_ID_RE)][0];
        const hint = withId
          ? ` For a cross-family value, call <testdata_expand id="${withId[1]}"/> to list its paths, then pass a specific @@@(family.member.field).`
          : ' Pick one of the slots it lists and pass @@@(family.member.field).';
        throw new Error(`a FUZZY read-only descriptor reached a tool: ${names}. Never inject a ###{…} (its value is shared, so it is not a settable placeholder).${hint}`);
      }
      if (text.indexOf('@@@(') === -1) return text;
      const cases = loadStore(ctx?.projectDir);
      const missing = [];
      const out = text.replace(TOKEN_RE, (whole, path) => {
        const c = cases.get(familyOfPath(path).toLowerCase());
        if (!c) return whole;                       // not our family → pass through
        const v = resolveRest(c, restOfPath(path));   // may THROW (fail-closed) on an ambiguous path
        if (typeof v !== 'string') { missing.push(whole); return whole; }
        return v;
      });
      if (missing.length) throw new Error(`unresolved test-data token(s): ${[...new Set(missing)].join(', ')} — the family exists but has no such member/field. Use <testdata_fields> to see what is filled; do not invent tokens.`);
      return out;
    },
  }],

  tools: [
    {
      verb: 'testdata_get', name: 'testdata_get',
      schema: {
        description: 'Get a usable TOKEN for a test-data value (you never receive the real value). Member field → @@@(family.member.field); family-level field (omit member) → @@@(family.deers_family_id). field may be dotted (address.zip).',
        parameters: { type: 'object', properties: {
          family: { type: 'string', description: 'the family label' },
          member: { type: 'string', description: 'the member label (omit for the family-level field)' },
          field: { type: 'string', description: 'the field name (dotted for nested, e.g. address.zip)' },
        }, required: ['family', 'field'] },
      },
      impl: async ({ family, member, field }, ctx) => {
        const c = loadStore(ctx?.cwd).get(String(family || '').toLowerCase());
        if (!c) return { content: `ERROR: no family "${family}". Use <testdata_list/> to see what exists.` };
        if (member) {
          const ml = String(member).toLowerCase();
          const m = c.members[ml];
          if (!m) return { content: `ERROR: family "${family}" has no member "${member}". Members: ${Object.keys(c.members).join(', ') || '(none)'}.` };
          if (asStr(getField(m, field)) === undefined) return { content: `ERROR: ${family}.${ml} has no filled field "${field}". Available: ${leafPaths(m).join(', ') || '(none)'}.` };
          return { content: `@@@(${family.toLowerCase()}.${ml}.${field})` };
        }
        if (asStr(getField(c.family, field)) === undefined) return { content: `ERROR: family "${family}" has no family-level field "${field}". Available: ${leafPaths(c.family).join(', ') || '(none)'}.` };
        return { content: `@@@(${family.toLowerCase()}.${field})` };
      },
    },
    {
      verb: 'testdata_list', name: 'testdata_list',
      schema: { description: 'List the test-data families, their members, and the field names available (values are never shown).', parameters: { type: 'object', properties: {} } },
      impl: async (_args, ctx) => {
        const cases = loadStore(ctx?.cwd);
        if (!cases.size) return { content: `No test data. Add families in the "Test data" side panel (stored under <project>/${STORE_DIRNAME}/).` };
        const lines = [];
        for (const [flabel, c] of cases) lines.push(`${flabel}${c.description ? ` — ${c.description}` : ''}: family fields [${leafPaths(c.family).join(', ') || 'none'}], members: ${Object.keys(c.members).join(', ') || '(none)'}`);
        return { content: lines.join('\n') };
      },
    },
    {
      verb: 'testdata_fields', name: 'testdata_fields',
      schema: {
        description: "Show which fields are FILLED vs BLANK (no values). Pass family + member for a member's fields, or family alone for the family-level field + the member list. Use this before building a token — a token for a blank field is refused.",
        parameters: { type: 'object', properties: {
          family: { type: 'string', description: 'the family label' },
          member: { type: 'string', description: 'the member label (omit for the family-level view)' },
        }, required: ['family'] },
      },
      impl: async ({ family, member }, ctx) => {
        const c = loadStore(ctx?.cwd).get(String(family || '').toLowerCase());
        if (!c) return { content: `ERROR: no family "${family}". Use <testdata_list/> to see what exists.` };
        if (member) {
          const m = c.members[String(member).toLowerCase()];
          if (!m) return { content: `ERROR: family "${family}" has no member "${member}". Members: ${Object.keys(c.members).join(', ') || '(none)'}.` };
          return { content: `${family}.${String(member).toLowerCase()} — ✓ filled · blank:\n${fieldStatusLines(MEMBER_SCHEMA, m).join('\n')}` };
        }
        const lines = fieldStatusLines(FAMILY_SCHEMA, c.family);
        lines.push(`  members: ${Object.keys(c.members).join(', ') || '(none)'}`);
        return { content: `${family} (family level) — ✓ filled · blank:\n${lines.join('\n')}\n(call again with member="<label>" for a member's fields)` };
      },
    },
    {
      verb: 'testdata_expand', name: 'testdata_expand',
      schema: {
        description: 'Expand a fuzzy cross-family token — pass the #id shown in a ###{… #id} descriptor and get the FULL list of paths (family → member → field) whose value is the shared one, so you can pick a specific one and build @@@(family.member.field). Values are NEVER shown.',
        parameters: { type: 'object', properties: { id: { type: 'string', description: 'the 16-hex #id from a ###{…} fuzzy token (with or without the leading #)' } }, required: ['id'] },
      },
      impl: async ({ id }, ctx) => {
        const wanted = String(id || '').toLowerCase().replace(/[^0-9a-f]/g, '');
        if (wanted.length !== 16) return { content: `ERROR: "${id}" is not a valid fuzzy id (expected the 16-hex #id from a ###{…} token).` };
        const secret = getSecret(ctx?.cwd);
        if (!secret) return { content: 'ERROR: no test data in this project.' };
        const idx = buildIndex(loadStore(ctx?.cwd));
        const hits = [...idx.paths.entries()].filter(([key]) => idFor(key, secret) === wanted);   // group by VALUE (normKey)
        if (!hits.length) return { content: `ERROR: id "${wanted}" does not match any current test-data value (it may have been edited or removed).` };
        if (hits.length > 1) return { content: `ERROR: id "${wanted}" is ambiguous — it matches ${hits.length} DISTINCT values (an id collision). Refusing to merge their paths (fail-closed). Use <testdata_fields> to locate the value you need.` };
        const matches = hits[0][1];
        // group into a family → member → fields graph (no values)
        const byFam = new Map();
        for (const p of matches.slice().sort()) { const f = familyOfPath(p); if (!byFam.has(f)) byFam.set(f, []); byFam.get(f).push(restOfPath(p)); }
        const lines = [];
        for (const [f, rests] of byFam) lines.push(`  ${f}: ${rests.sort().join(', ')}`);
        return { content: `${matches.length} path(s) share this value:\n${lines.join('\n')}\nPick one and build @@@(family.member.field) to use it.` };
      },
    },
  ],
};
