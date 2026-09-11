# Web Application Security Review (AI reviewer)

Checklist `web-idor-review` version 0.5.0. Generated from `definitions/checklist.json`; do not edit outside the answer blocks.

## Your task

You are performing a static security review of the web application whose source code is open in this project. This document is the whole review. It is organised by topic, and each topic has the same shape: a few items that establish the facts about one area of the application from code evidence, then checks of that area that follow from those facts, then a table for anything else you noticed there. Work through the topics in order, top to bottom, and complete each one before moving on. Later topics depend on earlier answers, and the linter evaluates those dependencies against this document.

Fill the document in completely, in place, by editing the answer blocks. Do not restructure, renumber, or delete anything outside the answer blocks. Inside a block use only the field labels the block already shows, plus `Status:` and `Reason:` where this document says to; do not invent labels of your own.

The review targets one class of flaw above all others: a caller who is logged in and allowed to use the application changes an identifier in a URL, query string, body, or header and receives, changes, or deletes a record that belongs to someone else. Secondary targets: responses that carry fields the UI never shows, request bodies that can set fields the UI never exposes, anonymous endpoints, session and token handling, caching, directory listing, and code written to silence Fortify.

## Why this review exists

A web application in this fleet (DWP) had a download endpoint that took a numeric file id from the URL. The endpoint did not validate the id or check that the caller was allowed to see that particular file; it passed the id straight to a backend web service (UDSWS). Unauthenticated callers could change the number and download other people's files. The backend service was a contributing factor: it checked that the calling application was authorised to use the endpoint, but not that the requested document was one that application was allowed to share. Both layers checked *who* was calling; neither checked *what* was being asked for. Static and dynamic scanners and a code review had all passed the code.

That is the shape to look for everywhere in this document, and it has a name at each layer: Insecure Direct Object Reference (IDOR) in the web application, where an object reference (a user id, file name, record number, database key) is exposed and the application never checks that the caller may access that object, so changing `id=1001` to `id=1002` shows someone else's data; and Broken Object Level Authorization (BOLA) in the backend, where the service authorises the caller or the calling application but not the specific object. The checks in this document trace an identifier from the request to the data and ask, at each hop, where the comparison between the caller and the object happens. A check passes only when you can cite that comparison. A layer that verifies only that the caller is logged in, or only that the application may call the service, is the incident, not a pass.

Two consequences for how you work. First, the harmless-looking endpoint is the one to trace most carefully: the incident was a download link, not a login page. Second, backend services in this fleet do not enforce object-level scope, so the web tier you are reading is the only place the check can be; if you cannot find it there, it does not exist.

Item ids: C items are facts, R items are checks, F items are the issues tables. "Refs" on an item and "STIG area" point at the handoff document and the Application Security and Development STIG, neither of which is in this project; you do not need them to answer.

## Constraints

- You have read and search access to the source. You cannot build, run, or send requests. Every answer comes from reading code, descriptors, and configuration.
- Cite evidence as `path/to/File.java:123`. An answer without a citation is incomplete.
- Never write a citation you have not opened. The linter checks that every cited file exists in the project and that the cited line is inside it, so a placeholder or a guessed path is reported as a problem; a real file cited for a claim it does not support is worse, because nothing can catch it. If you cannot cite, leave the field empty and use `unable`. A document that reaches "no problems" through invented content is a failed review, not a clean one.
- When you cannot settle an item from what you can read (source not in the project, a configuration that could go either way, a question only the running system answers), ask the developer in the conversation before moving on: say which item, what you need, and why. Ask once, with everything you need for that topic, rather than one question at a time. Nothing may be marked `unable` without asking first. Every `unable` block carries an `Asked:` line (add it if the block does not show one) that records what you asked and what was answered, or that no one was there to answer; the linter rejects an `unable` without it. If the answer settles the item, record the answer as the value or status with the developer's words as evidence, and say so. Asking is always allowed; guessing never is.
- Do not copy secrets or personal data into this document; cite their location instead.
- Never put a triple-backtick code fence inside an answer block. Quote code inline with single backticks, or cite the line. A fence inside a block is reported as a problem and its contents are ignored.

## Source that is not in this project

Some of what this review must read lives in another repository: an enterprise shared library holding the authentication filter or the scope helper, a service client that builds the outbound request, the backend service whose authorization behaviour an item asks about, the portal that mints the token. A name and a version tell you nothing about what that code checks. Whenever you reach an item whose answer lives in code you do not have:

1. **Look locally first.** A checkout beside this project, a `-sources.jar` under `~/.m2/repository/<group path>/<artifact>/<version>/`, another module of this repository, a path in `.gitmodules`.
2. **Ask.** If it is not there, stop and ask the developer for the GitLab URL of that project and the tag, branch, or commit matching the version this application uses. Say which item you are on and why you need it. Ask for everything you need in one message rather than one repository at a time. Do not guess a URL, do not substitute a different version, and do not carry on and leave the item behind.
3. **Clone it into `review-deps/` inside this project**, and check out the ref you were given:

```sh
git clone <gitlab url> review-deps/<name>
git -C review-deps/<name> checkout <tag, branch, or commit>
git -C review-deps/<name> log -1 --format=%H%d
```

   Everything you create for this review, including this folder, stays inside the project directory. Do not write to a parent directory or anywhere above the project root: your environment may refuse it, and that refusal is not a reason to stop and hand the work back. If the clone itself fails, for want of network or credentials, say exactly what failed and ask again. Do not work around it by guessing what the code does.

   `review-deps/` is scratch space for this review, not part of the application. Never commit it, never edit anything in it, and never let it into an answer about this application: every search you make to answer an item is scoped to the application's own source (for example `src/`, `pom.xml`, `web.xml`), so a match inside `review-deps/` is never an endpoint, filter, or dependency of the application being reviewed. It exists only so you can read a dependency's code and cite it. Say in the Self-check block that it can be deleted when the review is done.

4. **Check out the version this application actually uses, and prove you did.** A clone lands on the default branch, which is whatever is current, not what is deployed. Check out the ref for the version this project depends on (the `<version>` in the POM for a library, the release the developer names for a service), then confirm the working tree is on it: the last command above prints the commit and any tag pointing at it, and for a Maven project the `<version>` in the clone's own `pom.xml` must equal the version this project depends on. If they differ, or the tag does not exist, stop and ask which ref matches the deployed version; do not read the default branch and call it the answer. Record the ref you verified. Reading a newer or older version of a security filter is how a check that does not exist in production gets recorded as a pass.

5. **Record and continue.** Put the URL, the ref, and the clone path in the topic 0 item for source outside this project, then go back to the item you stopped at and answer it from the code you now have. Cite files in the clone by that path, for example `review-deps/web-security/src/main/java/.../SsoFilter.java:88`; the linter checks those paths exist, so leave the clone in place until the review is finished. Add a row for every repository you had to fetch, as you fetch it.
6. **If it cannot be obtained**, because nobody has the URL or the clone is impossible, record it as not-available in that item and mark every item that depends on it `unable`, with the reason and the `Asked:` line. Never infer what the missing code does from its name, its version, or how such libraries usually behave. A `pass` resting on code you have not read is the failure this review exists to prevent.

## Equal work for every answer

A finding is not the only answer that costs effort. A negative fact, a passing check, and a not-applicable item each require the same two things: what you examined, and why there is nothing more. Concretely:

- A negative fact (`no`, `none`, `none-found`, `unknown`, `not-established`, `not-set-default`, `no-weblogic-xml`, `none-api-only`, or an empty table) is valid only when `Searched:` lists every signal from the item's signal list that you searched for, and the directories you searched in. If you did not search for a listed signal, you may not answer negatively. A negative fact switches later checks off, which makes it the most consequential answer in this document.
- A passing check is valid only when `Evidence:` cites the line that does the check, as `path:line`, and `Why no more findings:` names every path you followed from the entry point to a data source and says, for each, where it is checked or why it cannot expose another caller's data.
- A finding is valid only when `Location:` and `Evidence:` cite the code and `Findings:` says what is wrong and what a caller could do.
- A not-applicable answer is valid only when `Reason:` names the rule it rests on, and the answer that rule depends on carries its own evidence. Per-row checks accept `na` for a row only when the row is not a data endpoint at all; a row whose identifier comes from the session is a pass citing the line that reads it, and a read-only row under a write-side check is already excluded by the row filter. A free-text `na` on a check whose rule is met is reported as a warning so it stays visible.

The linter rejects each of these when the supporting field is empty. A block that says only "no other issues" will be rejected. Warnings do not block finishing; clear them anyway.

## Step 0: set up the linter before anything else

Appendix A at the end of this document contains a small Node script that checks this document: every answer block present, values within each item's option list, table cells within their column's options, negative answers backed by a `Searched:` record, `Status: na` used only where the rules allow it, one check block per table row, and a negative justification on every pass. It reads its rules from the hidden `lint-schema` comment near the top of this document and evaluates the branching rules against your own answers, so it needs nothing else.

1. If a file named `checklist-lint.js` already sits next to this document, use it. Otherwise extract it from Appendix A instead of retyping it. From the folder that holds this document, write these two lines to `extract-lint.mjs`:

```js
import { readFileSync, writeFileSync } from 'fs';
writeFileSync('checklist-lint.js', readFileSync(process.argv[2], 'utf8').match(/`{4}javascript\r?\n([\s\S]*?)\r?\n`{4}/)[1] + '\n');
```

   then run `node extract-lint.mjs <this document's file name>`. It copies the fenced block of Appendix A into `checklist-lint.js` byte for byte, which hand-copying does not reliably do. Confirm it worked by running `node checklist-lint.js` with no arguments: it prints its usage line. If the extraction fails, copy the fence contents from Appendix A yourself, exactly as written and in a single write, abbreviating nothing. Delete `extract-lint.mjs` when the linter is in place.
2. Create your task list before answering anything. Run `node checklist-lint.js <this document's file name> --tasks review-tasks.md`: it writes `review-tasks.md` next to this document with one unticked entry per answer block, in order (META, every item, the Self-check), then two finishing entries: RESULT for the result file and REPORT for the PDF. That file is the record the linter reads. Then create the same list as a workspace checklist, so the person running you can watch the review's progress. Run `node checklist-lint.js <this document's file name> --checklist`: it prints the exact block to put in your reply, one entry per line, already in order. Send that output as written, in a single tag. Its shape, with the middle elided, is:

```text
<remote-workspace><checklist>META Application and reviewer
C-01 Deployable modules, artifact ids, and context roots
C-02 Backend frameworks present
...one line per answer block, ending with...
SELFCHECK Self-check block</checklist></remote-workspace>
```

   Entries are numbered by position, so the first line is id 1, and those ids match the numbers in `review-tasks.md`. As you finish each block, tick it in both places: `- [x]` in the file, and in your reply

```text
<remote-workspace><check id="7"/></remote-workspace>
```

   one id at a time, as you go. `<check id="7,8"/>` ticks several at once; use it only to catch up after forgetting, and treat needing it as a sign you have stopped working one item at a time. Do this every run, without being asked; it is part of the review, not an option. Do not open a topic, and do not write a single block, until both the file and the checklist exist.
3. Fill the META block under "Application" (the artifactId from the pom, one token), then run the linter against this document: `node checklist-lint.js <this document's file name>`. Before you have answered anything else it reports every unconditional item in every topic as not answered, and everything conditional as not applicable until the items they depend on are answered. Each problem line starts with the topic id. If it reports a syntax error, your copy differs from Appendix A: recopy it. If the script cannot be run in your environment at all, write that in the self-check block at the end and continue without it.
4. Run it again after finishing each topic. It also reads `review-tasks.md` and reports entries ticked without a written block and blocks written without a tick; both mean the one-item-at-a-time rule slipped. Fix every problem it reports against the topics you have completed; problems in later topics are listed until you reach them. Fix a problem by reading more code, by correcting the answer, or by asking the developer; never by filling a field with something you did not find. A negative answer with a complete `Searched:` record is a legitimate, complete answer and needs no citation.
5. **Write the result file.** When the document lints with zero problems, run `node checklist-lint.js <this document's file name> --json ai-result.json`, then `node checklist-lint.js ai-result.json` to confirm the result file is well formed. Tick RESULT.
6. **Write the report and its PDF. This step is required, not optional: the review is not finished without `review-report.pdf`.** Run `node checklist-lint.js ai-result.json --report review-report.html --pdf review-report.pdf`. The linter writes the report page (the review topic by topic, then all issues, what could not be settled, and the endpoints), finds Edge or Chrome on the machine, prints the page to `review-report.pdf` itself, and checks the file it produced. Do not print it some other way and do not describe it to the developer as something they could do. If the linter says it cannot find a browser or the print failed, ask the developer for the path to Edge or Chrome and rerun with `--browser <path>`. Tick REPORT only when the linter says it wrote the PDF.
7. **Finish only when that last command reports no problems.** In the project folder, the check of `ai-result.json` counts a missing `review-report.pdf` as a problem, so the run cannot end clean without it. Every task entry, RESULT and REPORT included, must be ticked. Leave the document, the result file, the report, its PDF, the task file, and the linter in place, and tell the developer where the PDF is.

The linter checks form, not truth. A wrong answer that passes the linter is still wrong.

## One item at a time

This document is long, and the flaw it exists to catch hides in the item you rush. Work it as a task list, not as a form to fill in:

1. Your task list exists twice, and both are required: `review-tasks.md`, written next to this document in Step 0 by `--tasks` (one numbered, unticked `- [ ]` entry per answer block in document order: META, every item by id and title, the Self-check, then RESULT and REPORT for the result file and the PDF), which is what the linter reads; and the same entries as a workspace checklist, printed ready to paste by `--checklist`, which is what the person running you watches. Create both yourself, every run, without waiting to be told.
2. Take the first open entry. Read that item's How, Signals, and Trace. Search and read the code for that item alone. Write that item's block. Then tick that entry in both places: `- [x]` in `review-tasks.md`, and `<remote-workspace><check id="N"/></remote-workspace>` in your reply, where N is that entry's number. Only then take the next.
3. An entry is never marked done before its block is written, and a block is never written for an item you have not researched. If you catch yourself planning to "fill in the remaining items", "quickly complete" a topic, or write a script that fills several blocks at once, stop: that is the moment items stop getting the attention they need. Take the next single item.
4. Per-row blocks are separate entries, one per row, each researched on its own.
5. There is no deadline. If your context or session is running out, run the linter, write the result file (it is stamped as a snapshot), and say which entry comes next so a fresh session can continue from there. Run it from the project root (where this document sits) so it can also check every cited file and line against the code; it says on its second line whether it did. Warnings are information about what to re-read; never add content to silence one, and never fill a field to make a problem go away. If a problem cannot be fixed honestly, the right answer is `unable` with what you read and where the trail ended.

## How to fill a fact item

Fact items (ids starting with C) end with a block like this:

```
<!-- answer EXAMPLE -->
Status:
Reason:
Value:
Detail (Naming convention observed):
Evidence:
Searched:
<!-- /answer -->
```

- `Value:` For yes/no items write `yes` or `no`. For single-choice items write exactly one option code from the item's option list, for example `portlet`. For multiple-choice items write the option codes separated by commas, for example `spring-mvc, jsf`. For free-text items write the answer; it may span several lines.
- `Detail (...)`: Only present on some items. Answer the question in the parentheses.
- `Evidence:` File and line citations that support the value, with a few words on what each one shows.
- `Searched:` The patterns you searched for and the directories you searched in. Required for negative answers; recommended everywhere.
- Table items have a Markdown table instead of `Value:`. Add one row per entry, keeping the header row, the separator line, and the column order unchanged. Leave the placeholder empty row out once you have real rows. A cell in a column with listed options must be exactly one of those codes, lowercase, without backticks. Escape a `|` inside a cell as `\|`. If a table is legitimately empty, leave it with no data rows and justify that in `Searched:`. The row order you choose is the row order the checks that follow refer to.
- `Status:` and `Reason:` are printed only on items that have an `Applies when` rule. If the rule is not met by your earlier answers, write `Status: na` and `Reason: rule: <the rule as written>`, and leave the other fields empty. Otherwise leave both empty.
- `Status: unable` is allowed on any fact item (add the `Status:` and `Reason:` lines if the block does not show them). Use it when the fact cannot be settled from what you can read: the answer lives in a library whose source you do not have, or only the running system can show it. `Reason:` says what you read and where the trail ended; `Searched:` says what you looked for; `Asked:` says what you asked the developer and what was answered. It is neither a guess nor a placeholder. It counts as undetermined rather than complete, items that depend on it stay off unless their rule allows `unknown`, and the developer form shows it as "Could not determine". You must ask the developer before using it (for a library, ask for its source); use it only when no answer comes or the answer does not settle the fact. Never write a value you did not establish, and never cite a file to make an undetermined answer look settled.
- A value may continue on following lines until the next field label.

## How to fill a check item

Check items (ids starting with R) are statements to verify. Each states a **Trace**: the sequence of hops to follow. Follow it literally and cite each hop. The block has these fields:

- `Status:` one of `pass`, `finding`, `unable`, `na`.
  - `pass`: you traced the path and found the check. `Location:` cites the line that does the check (file:line or class#method); `Evidence:` cites that comparison line and the hops that reach it. `Why no more findings:` states every path you examined and why each is covered.
  - `finding`: the check is absent or bypassable. `Location:` cites where. `Findings:` says what is wrong and what a caller could do. `Why no more findings:` states the other paths examined so the finding is complete, not just the first one you saw. Severity in prose is not exported; the item's default severity is, so say in `Findings:` when you would rate it differently and why.
  - `unable`: static reading cannot settle it, for example because the check lives in a shared library whose source is not in this project. Ask the developer first (for a library, ask for its source). `Evidence:` says what you read and where the trail ended; `Asked:` says what you asked and what was answered, or that no one was there to answer. Use this honestly and rarely; it turns the item into a runtime test for QA.
  - `na`: this row is not a data endpoint at all, or the item's rule is not met. `Reason:` says why.
- `Location:` the file:line, class#method, or URL the status is about. Required for `pass`, `finding`, and `unable`; the linter rejects a `pass` without it, and the developer form treats a check without a location as unfinished.
- `Evidence:` citations with a few words each on what they show. Required for `pass` and `finding`.
- `Findings:` what is wrong, for `finding` only.
- `Why no more findings:` the negative justification described above.
- `Asked:` only with `unable`: what you asked the developer and what was answered. Add the line; the templates do not print it.

**Checks instantiated per row.** Items marked "one answer block per row of C-35" and similar are repeated once for every row of that table as you filled it in earlier. Where the item names a filter such as "where mutates = yes", only the matching rows count, in their original order. Edit the `row=1` block for the first such row and add copies numbered `row=2`, `row=3`, and so on. Put the row's path, handler, URL, or service name on the first line of `Location:` so a reader can match rows without the table. The linter checks that the number of blocks matches the number of rows. If the table has no matching rows, write `Status: na` with the reason in the `row=1` block and add no others.

## Issues found in this area

Every topic ends with a table for issues noticed while working through it that no item above recorded. Record them there with a file:line citation, the related item if any, and a severity from the column's list, then carry on. The last topic has a table for anything no topic covered.

## When you finish

**First, the outside code.** Open the topic 0 item for source that is not in this project and read it against the whole review. Every row marked "source needed: yes" must show a clone path and "obtained: yes", and you must have actually read that code where an item depended on it. Then look for what never reached the table: any item you answered with a belief about a library, a service, or another application rather than a line you read, and any `unable` whose reason is that code was elsewhere. If anything is outstanding, list those repositories to the developer now, ask for the GitLab URL and the matching tag, branch, or commit for each, clone them into `review-deps/`, and answer or re-answer the items that depended on them. The linter warns for each needed source that was not obtained; do not finish with one of those warnings standing unless the developer has said the source cannot be had, in which case every item that rests on it is `unable` with the `Asked:` line, never `pass`.

**Then re-read every block once.** For fact items confirm the value is present, the evidence cites file and line, and every negative answer has a complete `Searched:` record. For checks confirm each `pass` cites the comparison line, each `finding` cites a location and describes the exposure, and every `Why no more findings:` lists paths rather than asserting absence. Then write anything you could not complete, and any runtime-only caveats, in the Self-check block near the end (it is copied into the result file). Then do steps 5 to 7 of Step 0: the result file, then the report and its PDF, which is required.

---

## Application

Fill this block first. Application is the artifactId from the pom (one token, the string a developer would type into the form, for example `portlet-benefits`). Leave Reviewer as `ai`.

<!-- answer META -->
Application:
Reviewer: ai
<!-- /answer -->

<!-- lint-schema
{"id":"web-idor-review","version":"0.5.0","title":"Web Application Security Review","lintPhase":"all","negativeValues":["no","none","none-found","unknown","not-established","not-set-default","no-weblogic-xml","none-api-only"],"sections":[{"id":"T0","title":"What this application is"},{"id":"T1","title":"Who uses it and how they log in"},{"id":"T2","title":"The token from the portal","when":{"q":"C-09","in":["portal","portlet","unknown"]}},{"id":"T3","title":"What can be reached without logging in"},{"id":"T4","title":"Who is allowed to see what"},{"id":"T5","title":"Reading records by identifier"},{"id":"T6","title":"Changing records"},{"id":"T7","title":"Files and documents"},{"id":"T8","title":"Where the data comes from"},{"id":"T9","title":"Caching and static content"},{"id":"T10","title":"JSF pages","when":{"q":"C-02","includes":"jsf"}},{"id":"T11","title":"Fortify workarounds"},{"id":"T12","title":"Anything else"}],"items":[{"id":"C-01","phase":"profile","section":"T0","type":"list","title":"Deployable modules, artifact ids, and context roots","columns":[{"key":"module","label":"Module (pom path)"},{"key":"artifactId","label":"artifactId"},{"key":"packaging","label":"Packaging","type":"select","options":["war","spring-boot-jar","other"]},{"key":"contextRoot","label":"Context root"}],"detail":false,"emptyRequires":false,"devText":true},{"id":"C-02","phase":"profile","section":"T0","type":"multiselect","title":"Backend frameworks present","options":["spring-mvc","spring-boot","spring-security","jaxrs","jsf","jsp","servlets","websocket","struts","other"],"detail":true,"emptyRequires":false},{"id":"C-03","phase":"profile","section":"T0","type":"select","title":"Frontend technology","options":["angular","angularjs","mixed","server-rendered","none-api-only"],"detail":true,"emptyRequires":false},{"id":"C-04","phase":"profile","section":"T0","type":"select","title":"Frontend delivery and origin","options":["same-war","separate-origin-cors","separate-proxied","unknown"],"detail":true,"emptyRequires":false},{"id":"C-05","phase":"profile","section":"T0","type":"list","title":"Enterprise shared libraries in the POM","columns":[{"key":"artifact","label":"groupId:artifactId"},{"key":"version","label":"Version"},{"key":"scope","label":"Scope"},{"key":"provides","label":"What it provides here"}],"detail":false,"emptyRequires":false},{"id":"C-06","phase":"profile","section":"T0","type":"list","title":"Source this review needs that is not in this project","columns":[{"key":"artifact","label":"Library, service, or repository"},{"key":"needed","label":"Source needed","type":"select","options":["yes","no"]},{"key":"reason","label":"Why: what it provides that a check must read, or why not needed"},{"key":"repoUrl","label":"GitLab URL (from the developer)"},{"key":"ref","label":"Ref checked out, verified against the version used"},{"key":"sourcePath","label":"Where the source is now (review-deps/<name>), or not-available"},{"key":"obtained","label":"Source obtained","type":"select","options":["yes","no","not-needed"]}],"detail":false,"emptyRequires":true,"warnRows":{"col":"obtained","eq":"no","text":"a needed source was never obtained; ask the developer for its GitLab URL, clone it, and answer the items that depend on it, or mark each of them unable with that reason"}},{"id":"C-07","phase":"profile","section":"T0","type":"yesno","title":"Deployed to WebLogic","default":"yes","detail":true,"emptyRequires":false},{"id":"C-08","phase":"profile","section":"T1","type":"select","title":"Audience: beneficiary self-service or operator","options":["beneficiary","operator","both","unknown"],"detail":true,"emptyRequires":false},{"id":"C-09","phase":"profile","section":"T1","type":"select","title":"Application type","options":["portal","portlet","standalone","unknown"],"detail":true,"emptyRequires":false},{"id":"C-10","phase":"profile","section":"T1","type":"multiselect","title":"Authentication mechanisms","options":["beneficiary-sso","operator-filter","portal-jwt","spring-security","container-managed","custom","none"],"detail":true,"emptyRequires":false},{"id":"C-11","phase":"profile","section":"T1","type":"list","title":"Authentication and authorization filters","columns":[{"key":"filterClass","label":"Filter class"},{"key":"registeredIn","label":"Registered in","type":"select","options":["web.xml","@WebFilter","FilterRegistrationBean","Spring Security chain","other"]},{"key":"urlPatterns","label":"URL patterns"},{"key":"order","label":"Order"},{"key":"purpose","label":"Purpose","type":"select","options":["authentication","authorization","headers","other"]}],"detail":false,"emptyRequires":false},{"id":"C-12","phase":"profile","section":"T1","type":"select","title":"Where identity is held after authentication","options":["http-session","custom-principal","thread-local","spring-security-context","jwt-each-request","other","unknown"],"detail":true,"emptyRequires":false},{"id":"C-13","phase":"profile","section":"T1","type":"select","title":"Per-request credential","options":["session-cookie","bearer-jwt","both","none"],"detail":false,"emptyRequires":false},{"id":"C-14","phase":"profile","section":"T1","type":"multiselect","title":"Session cookie flags","options":["http-only","secure","samesite","none-found"],"when":{"q":"C-13","in":["session-cookie","both"]},"detail":true,"emptyRequires":false},{"id":"C-15","phase":"profile","section":"T1","type":"yesno","title":"Frontend JavaScript reads authentication cookies","detail":true,"emptyRequires":false},{"id":"R-01","phase":"profile","section":"T1","type":"check","title":"The caller's identity used for scope decisions comes only from the server-side session or the validated token","detail":false,"emptyRequires":false,"severity":"high"},{"id":"R-02","phase":"profile","section":"T1","type":"check","title":"The session cookie is HttpOnly and Secure, and the session id never appears in a URL","when":{"q":"C-13","in":["session-cookie","both"]},"detail":false,"emptyRequires":false,"severity":"medium"},{"id":"R-03","phase":"profile","section":"T1","type":"check","title":"The SSO cookie that JavaScript reads is exposed to script injection: confirm the read is live and record it","when":{"q":"C-15","eq":"yes"},"detail":false,"emptyRequires":false,"severity":"medium"},{"id":"F-01","phase":"profile","section":"T1","type":"list","title":"Issues found in this area","columns":[{"key":"location","label":"Location (file:line or URL)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item"},{"key":"severity","label":"Severity","type":"select","options":["high","medium","low","not sure"]}],"detail":false,"emptyRequires":false,"optional":true,"findings":true},{"id":"C-16","phase":"profile","section":"T2","type":"select","title":"Token delivery into the portlet iframe","options":["query-param","url-fragment","postmessage","shared-domain-cookie","proxy-header","other","unknown"],"detail":true,"emptyRequires":false},{"id":"C-17","phase":"profile","section":"T2","type":"select","title":"Token construct and library","options":["jws-hmac","jws-asymmetric","jwe","jws-and-jwe","custom-crypto","unknown"],"detail":true,"emptyRequires":false},{"id":"C-18","phase":"profile","section":"T2","type":"list","title":"Token claims","columns":[{"key":"claim","label":"Claim"},{"key":"meaning","label":"Meaning"},{"key":"setBy","label":"Set by (class)"},{"key":"usedFor","label":"Portlet uses it for","type":"select","options":["identity","authorization","scope","expiry or metadata","unused"]}],"detail":false,"emptyRequires":false,"devText":true},{"id":"C-19","phase":"profile","section":"T2","type":"multiselect","title":"Validation performed on the received token","options":["signature","exp","nbf","iss","aud-or-app-id","alg-pinned","jti-replay","none-found"],"when":{"q":"C-09","eq":"portlet"},"detail":true,"emptyRequires":false},{"id":"C-20","phase":"profile","section":"T2","type":"select","title":"Secret or key storage","options":["properties-in-war","credential-store-jndi","env-var","hardcoded","other","unknown"],"detail":true,"emptyRequires":false},{"id":"C-21","phase":"profile","section":"T2","type":"select","title":"Secret scope","options":["fleet-shared","per-portlet","unknown"],"detail":true,"emptyRequires":false},{"id":"C-22","phase":"profile","section":"T2","type":"select","title":"Session model after token validation","options":["creates-http-session","stateless","both","unknown"],"when":{"q":"C-09","eq":"portlet"},"detail":true,"emptyRequires":false},{"id":"C-23","phase":"profile","section":"T2","type":"list","title":"Portlet entry guard","columns":[{"key":"guardClass","label":"Guard class"},{"key":"urlPatterns","label":"URL patterns"},{"key":"exclusions","label":"Exclusions"},{"key":"rejectsWhen","label":"Rejects when"}],"when":{"q":"C-09","eq":"portlet"},"detail":false,"emptyRequires":true,"devText":true},{"id":"C-24","phase":"profile","section":"T2","type":"select","title":"Framing protection","options":["x-frame-options","csp-frame-ancestors","both","none-found"],"detail":true,"emptyRequires":false},{"id":"C-25","phase":"profile","section":"T2","type":"text","title":"Where the portal mints the token","when":{"q":"C-09","eq":"portal"},"detail":false,"emptyRequires":false},{"id":"R-04","phase":"profile","section":"T2","type":"check","title":"The token signature is verified with a pinned algorithm before any claim is trusted","when":{"q":"C-09","eq":"portlet"},"detail":false,"emptyRequires":false,"severity":"high"},{"id":"R-05","phase":"profile","section":"T2","type":"check","title":"Expiry, issuer, and audience or application id are enforced, so a token minted for another portlet or long ago is rejected","when":{"q":"C-09","eq":"portlet"},"detail":false,"emptyRequires":false,"severity":"high"},{"id":"R-06","phase":"profile","section":"T2","type":"check","title":"The token travels in the iframe URL: record the exposure and any mitigation","when":{"q":"C-16","eq":"query-param"},"detail":false,"emptyRequires":false,"severity":"medium"},{"id":"R-07","phase":"profile","section":"T2","type":"check","title":"Every scope decision in the portlet uses claims from the validated token; no request parameter can override family id, sponsor id, or access levels","when":{"q":"C-09","eq":"portlet"},"detail":false,"emptyRequires":false,"severity":"high"},{"id":"R-08","phase":"profile","section":"T2","type":"check","title":"The session created after token validation is bound to that identity, and the session id is regenerated at token login","when":{"all":[{"q":"C-09","eq":"portlet"},{"q":"C-22","in":["creates-http-session","both","unknown"]}]},"detail":false,"emptyRequires":false,"severity":"medium"},{"id":"R-09","phase":"profile","section":"T2","type":"check","title":"Token minting copies identity only from the authenticated session; no request parameter influences the claims; expiry is short","when":{"q":"C-09","eq":"portal"},"detail":false,"emptyRequires":false,"severity":"high"},{"id":"R-10","phase":"profile","section":"T2","type":"check","title":"The token secret is hardcoded in source: record it","when":{"q":"C-20","eq":"hardcoded"},"detail":false,"emptyRequires":false,"severity":"high"},{"id":"R-11","phase":"profile","section":"T2","type":"check","title":"No framing restriction: any origin can frame this application","when":{"q":"C-24","eq":"none-found"},"detail":false,"emptyRequires":false,"severity":"low"},{"id":"R-12","phase":"profile","section":"T2","type":"check","title":"The portlet URL the token is attached to comes from fixed configuration, and any postMessage names the portlet origin explicitly","when":{"q":"C-09","eq":"portal"},"detail":false,"emptyRequires":false,"severity":"high"},{"id":"F-02","phase":"profile","section":"T2","type":"list","title":"Issues found in this area","columns":[{"key":"location","label":"Location (file:line or URL)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item"},{"key":"severity","label":"Severity","type":"select","options":["high","medium","low","not sure"]}],"detail":false,"emptyRequires":false,"optional":true,"findings":true},{"id":"C-26","phase":"profile","section":"T3","type":"list","title":"Filter exclusions and public paths","columns":[{"key":"pattern","label":"Pattern"},{"key":"matching","label":"Matching","type":"select","options":["exact","prefix","suffix","regex","servlet-mapping gap","other"]},{"key":"definedAt","label":"Defined at (file:line)"},{"key":"appliesTo","label":"Which filters skip it"}],"detail":false,"emptyRequires":true,"devText":true},{"id":"C-27","phase":"profile","section":"T3","type":"list","title":"Everything reachable under the exclusions","columns":[{"key":"url","label":"URL"},{"key":"handler","label":"Handler class#method or path"},{"key":"returnsData","label":"Returns data","type":"select","options":["yes","no"]},{"key":"dataDescription","label":"What it returns"}],"detail":false,"emptyRequires":true,"devText":true},{"id":"R-13","phase":"profile","section":"T3","type":"check","title":"Every servlet and controller mapping is covered by an authentication filter mapping","detail":false,"emptyRequires":false,"severity":"high"},{"id":"R-14","phase":"profile","section":"T3","type":"check","title":"This exclusion pattern cannot be bent to reach a protected path","detail":false,"emptyRequires":false,"forEach":"C-26","severity":"high"},{"id":"R-15","phase":"profile","section":"T3","type":"check","title":"This public endpoint returns no protected data and accepts no record identifier","detail":false,"emptyRequires":false,"forEach":"C-27","severity":"high"},{"id":"F-03","phase":"profile","section":"T3","type":"list","title":"Issues found in this area","columns":[{"key":"location","label":"Location (file:line or URL)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item"},{"key":"severity","label":"Severity","type":"select","options":["high","medium","low","not sure"]}],"detail":false,"emptyRequires":false,"optional":true,"findings":true},{"id":"C-28","phase":"profile","section":"T4","type":"select","title":"Ownership model","options":["beneficiary-family","operator-access-level","operator-site","mixed","none-found","unknown"],"detail":true,"emptyRequires":false},{"id":"C-29","phase":"profile","section":"T4","type":"text","title":"Beneficiary scope: which people the logged-in beneficiary may see or change","when":{"q":"C-08","in":["beneficiary","both","unknown"]},"detail":false,"emptyRequires":false},{"id":"C-30","phase":"profile","section":"T4","type":"text","title":"Operator access levels and site selection","when":{"q":"C-08","in":["operator","both","unknown"]},"detail":false,"emptyRequires":false},{"id":"C-31","phase":"profile","section":"T4","type":"yesno","title":"Application-level authorization check present","detail":true,"emptyRequires":false},{"id":"C-32","phase":"profile","section":"T4","type":"select","title":"How the caller's scope is established","options":["roster-in-session","per-request-lookup","jwt-claims","not-established","unknown"],"detail":true,"emptyRequires":false},{"id":"C-33","phase":"profile","section":"T4","type":"select","title":"Object-level scope check pattern","options":["canonical-helper","per-endpoint","annotation","none-found","unknown"],"detail":true,"emptyRequires":false},{"id":"R-16","phase":"profile","section":"T4","type":"check","title":"The operator's selected site and access level constrain every data request on the server, not only at selection time","when":{"q":"C-08","in":["operator","both","unknown"]},"detail":false,"emptyRequires":false,"severity":"high"},{"id":"F-04","phase":"profile","section":"T4","type":"list","title":"Issues found in this area","columns":[{"key":"location","label":"Location (file:line or URL)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item"},{"key":"severity","label":"Severity","type":"select","options":["high","medium","low","not sure"]}],"detail":false,"emptyRequires":false,"optional":true,"findings":true},{"id":"C-34","phase":"profile","section":"T5","type":"multiselect","title":"HTTP entry point types","options":["spring-mvc","jaxrs","jsf-actions","servlets","websocket","actuator","other"],"detail":true,"emptyRequires":false},{"id":"C-35","phase":"profile","section":"T5","type":"list","title":"Endpoint inventory","columns":[{"key":"methods","label":"HTTP method(s)"},{"key":"path","label":"Full URL (context root + servlet mapping + class + method)"},{"key":"handler","label":"Handler class#method"},{"key":"isPublic","label":"Public (under a C-26 exclusion)","type":"select","options":["yes","no"]},{"key":"idParams","label":"Identifier parameters (name = what it identifies)"},{"key":"idSource","label":"Identifier source","type":"select","options":["request","session or token","both","none"]},{"key":"returnsData","label":"Returns data","type":"select","options":["yes","no"]},{"key":"mutates","label":"Writes or deletes","type":"select","options":["yes","no"]}],"detail":false,"emptyRequires":true,"inventory":"endpoints"},{"id":"C-36","phase":"profile","section":"T5","type":"multiselect","title":"Identifier kinds appearing in requests","options":["person-id","sponsor-id","family-id","document-id","db-primary-key","uuid","opaque-token","composite","other","none"],"detail":true,"emptyRequires":false},{"id":"R-17","phase":"profile","section":"T5","type":"check","title":"The request-supplied identifier is checked against the caller's scope before any data for it is returned","detail":false,"emptyRequires":false,"forEach":"C-35","severity":"high"},{"id":"R-18","phase":"profile","section":"T5","type":"check","title":"Every endpoint in C-35 goes through the canonical scope helper or a record-level annotation; any that bypass it are listed","when":{"q":"C-33","in":["canonical-helper","annotation"]},"detail":false,"emptyRequires":false,"severity":"high"},{"id":"R-19","phase":"profile","section":"T5","type":"check","title":"No object-level check exists anywhere in this application: record it as a finding in its own right","when":{"q":"C-33","eq":"none-found"},"detail":false,"emptyRequires":false,"severity":"high"},{"id":"R-20","phase":"profile","section":"T5","type":"check","title":"Collection and search endpoints constrain results to the caller's scope in the query or service, not in the frontend","detail":false,"emptyRequires":false,"severity":"high"},{"id":"C-37","phase":"profile","section":"T5","type":"select","title":"Response serialization style","options":["entities-wholesale","dto-mapped","mixed","unknown"],"detail":true,"emptyRequires":false},{"id":"R-21","phase":"profile","section":"T5","type":"check","title":"Responses carry no fields the UI never shows","detail":false,"emptyRequires":false,"severity":"medium"},{"id":"F-05","phase":"profile","section":"T5","type":"list","title":"Issues found in this area","columns":[{"key":"location","label":"Location (file:line or URL)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item"},{"key":"severity","label":"Severity","type":"select","options":["high","medium","low","not sure"]}],"detail":false,"emptyRequires":false,"optional":true,"findings":true},{"id":"C-38","phase":"profile","section":"T6","type":"multiselect","title":"Request binding styles present","options":["requestbody-domain","requestbody-dto","modelattribute","beanparam","jaxrs-entity","jsf-properties","getparameter","none-found"],"detail":true,"emptyRequires":false},{"id":"C-39","phase":"profile","section":"T6","type":"multiselect","title":"Binding allow-list mechanisms","options":["initbinder-allowed","initbinder-disallowed","jsonignore-setters","dto-only","none-found"],"detail":true,"emptyRequires":false},{"id":"C-40","phase":"profile","section":"T6","type":"list","title":"Constraints the frontend enforces on submitted data","columns":[{"key":"field","label":"Field or action"},{"key":"kind","label":"Kind of constraint","type":"select","options":["allowed-values","required","length","pattern","range","disabled-or-readonly","hidden-action","other"]},{"key":"clientAt","label":"Enforced in the client at (file:line)"},{"key":"serverAt","label":"Enforced on the server at (file:line), or none"}],"detail":false,"emptyRequires":true,"warnRows":{"col":"serverAt","eq":"none","text":"a constraint the client enforces has no server-side equivalent; each of those rows must be answered in the check below, not left as an observation"}},{"id":"R-22","phase":"profile","section":"T6","type":"check","title":"Update or delete by identifier verifies the record belongs to the caller before writing","detail":false,"emptyRequires":false,"forEach":"C-35","forEachWhere":{"col":"mutates","eq":"yes"},"severity":"high"},{"id":"R-23","phase":"profile","section":"T6","type":"check","title":"Bound request objects cannot set fields the UI never sends: identifiers, ownership, status, access flags","when":{"q":"C-38","includesAny":["requestbody-domain","requestbody-dto","modelattribute","beanparam","jaxrs-entity","jsf-properties","getparameter"]},"detail":false,"emptyRequires":false,"severity":"high"},{"id":"R-24","phase":"profile","section":"T6","type":"check","title":"This constraint is enforced again on the server before the value is used or stored","detail":false,"emptyRequires":false,"forEach":"C-40","severity":"medium"},{"id":"C-41","phase":"profile","section":"T6","type":"yesno","title":"Accepts file uploads","detail":false,"emptyRequires":false},{"id":"C-42","phase":"profile","section":"T6","type":"list","title":"Upload handlers","columns":[{"key":"handler","label":"Handler class#method"},{"key":"url","label":"URL"},{"key":"target","label":"Record the upload attaches to"},{"key":"idSource","label":"Identifier source","type":"select","options":["request","session or token","both","none"]},{"key":"storedAt","label":"Where bytes are stored"}],"when":{"q":"C-41","eq":"yes"},"detail":false,"emptyRequires":true,"devText":true},{"id":"R-25","phase":"profile","section":"T6","type":"check","title":"This upload attaches only to a record the caller owns, and the target record identifier is validated against scope","detail":false,"emptyRequires":false,"forEach":"C-42","severity":"high"},{"id":"F-06","phase":"profile","section":"T6","type":"list","title":"Issues found in this area","columns":[{"key":"location","label":"Location (file:line or URL)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item"},{"key":"severity","label":"Severity","type":"select","options":["high","medium","low","not sure"]}],"detail":false,"emptyRequires":false,"optional":true,"findings":true},{"id":"C-43","phase":"profile","section":"T7","type":"yesno","title":"Serves files or documents by identifier","detail":false,"emptyRequires":false},{"id":"C-44","phase":"profile","section":"T7","type":"list","title":"File-serving handlers","columns":[{"key":"handler","label":"Handler class#method"},{"key":"url","label":"URL"},{"key":"idParam","label":"Identifier parameter"},{"key":"byteSource","label":"Byte source","type":"select","options":["file system","service call","database blob","generated","other"]},{"key":"isPublic","label":"Public","type":"select","options":["yes","no"]},{"key":"scopeCheck","label":"Scope check location, or none"}],"when":{"q":"C-43","eq":"yes"},"detail":false,"emptyRequires":true},{"id":"R-26","phase":"profile","section":"T7","type":"check","title":"The identifier is checked against the caller's scope before the bytes are read or streamed","detail":false,"emptyRequires":false,"forEach":"C-44","severity":"high"},{"id":"R-27","phase":"profile","section":"T7","type":"check","title":"File identifiers are not exposed to callers who are not authorised for the file","when":{"q":"C-43","eq":"yes"},"detail":false,"emptyRequires":false,"severity":"medium"},{"id":"F-07","phase":"profile","section":"T7","type":"list","title":"Issues found in this area","columns":[{"key":"location","label":"Location (file:line or URL)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item"},{"key":"severity","label":"Severity","type":"select","options":["high","medium","low","not sure"]}],"detail":false,"emptyRequires":false,"optional":true,"findings":true},{"id":"C-45","phase":"profile","section":"T8","type":"multiselect","title":"Data access mechanisms","options":["cuf","rest-client","soap-client","jpa-hibernate","jdbctemplate","stored-procedures","mybatis","file-system","ldap","other"],"detail":true,"emptyRequires":false},{"id":"C-46","phase":"profile","section":"T8","type":"list","title":"Outbound service calls","columns":[{"key":"service","label":"Service"},{"key":"endpoint","label":"Base URL or property key"},{"key":"client","label":"Client class"},{"key":"operations","label":"Operations used"},{"key":"identifier","label":"Identifier passed"},{"key":"scopePassed","label":"Caller scope passed","type":"select","options":["yes","no","unknown"]}],"detail":false,"emptyRequires":true,"devText":true},{"id":"C-47","phase":"profile","section":"T8","type":"yesno","title":"CUF is the main data path","default":"yes","detail":false,"emptyRequires":false},{"id":"C-48","phase":"profile","section":"T8","type":"yesno","title":"Backend services are called without authentication","default":"yes","detail":false,"emptyRequires":false},{"id":"C-49","phase":"profile","section":"T8","type":"text","title":"CUF request identity and scope","when":{"q":"C-45","includes":"cuf"},"detail":false,"emptyRequires":false},{"id":"C-50","phase":"profile","section":"T8","type":"list","title":"Direct database access points","columns":[{"key":"location","label":"Class#method (file:line)"},{"key":"query","label":"Query or procedure"},{"key":"identifier","label":"Identifier in WHERE"},{"key":"scoped","label":"Scope constraint in WHERE","type":"select","options":["yes","no","unknown"]}],"when":{"q":"C-45","includesAny":["jpa-hibernate","jdbctemplate","stored-procedures","mybatis"]},"detail":false,"emptyRequires":false,"devText":true},{"id":"R-28","phase":"profile","section":"T8","type":"check","title":"Scope has been enforced in this application before this service is called","detail":false,"emptyRequires":false,"forEach":"C-46","severity":"high"},{"id":"R-29","phase":"profile","section":"T8","type":"check","title":"This query constrains results to the caller's scope, or the result is checked against scope before it is returned","detail":false,"emptyRequires":false,"forEach":"C-50","severity":"high"},{"id":"F-08","phase":"profile","section":"T8","type":"list","title":"Issues found in this area","columns":[{"key":"location","label":"Location (file:line or URL)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item"},{"key":"severity","label":"Severity","type":"select","options":["high","medium","low","not sure"]}],"detail":false,"emptyRequires":false,"optional":true,"findings":true},{"id":"C-51","phase":"profile","section":"T9","type":"select","title":"Cache-Control on authenticated responses","options":["global-filter","per-endpoint","none-found","unknown"],"detail":true,"emptyRequires":false},{"id":"R-30","phase":"profile","section":"T9","type":"check","title":"Authenticated responses are sent with Cache-Control: no-store","when":{"q":"C-51","in":["per-endpoint","none-found","unknown"]},"detail":false,"emptyRequires":false,"severity":"low"},{"id":"C-52","phase":"profile","section":"T9","type":"select","title":"Directory listing setting","options":["disabled-explicit","enabled-explicit","not-set-default","no-weblogic-xml"],"when":{"q":"C-07","eq":"yes"},"detail":false,"emptyRequires":false},{"id":"C-53","phase":"profile","section":"T9","type":"list","title":"Static resource handlers and roots","columns":[{"key":"config","label":"Configured at (file:line)"},{"key":"pattern","label":"URL pattern"},{"key":"root","label":"Filesystem or classpath root"},{"key":"sensitive","label":"Anything beyond frontend assets","type":"select","options":["yes","no","unknown"]}],"detail":false,"emptyRequires":false,"devText":true},{"id":"R-31","phase":"profile","section":"T9","type":"check","title":"Directory listing is disabled and static roots contain nothing but frontend assets","when":{"any":[{"q":"C-52","in":["enabled-explicit","not-set-default","no-weblogic-xml"]},{"q":"C-53","notEmpty":true}]},"detail":false,"emptyRequires":false,"severity":"low"},{"id":"F-09","phase":"profile","section":"T9","type":"list","title":"Issues found in this area","columns":[{"key":"location","label":"Location (file:line or URL)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item"},{"key":"severity","label":"Severity","type":"select","options":["high","medium","low","not sure"]}],"detail":false,"emptyRequires":false,"optional":true,"findings":true},{"id":"C-54","phase":"profile","section":"T10","type":"list","title":"JSF pages and backing beans","columns":[{"key":"page","label":"Page"},{"key":"bean","label":"Bean class"},{"key":"scope","label":"Bean scope","type":"select","options":["request","view","session","application","other"]},{"key":"idsHeld","label":"Record identifiers held"},{"key":"loadedFrom","label":"Identifiers loaded from","type":"select","options":["view param","f:param","request parameter (managed-property or code)","session","other"]}],"detail":false,"emptyRequires":false,"devText":true},{"id":"C-55","phase":"profile","section":"T10","type":"select","title":"ViewState protection","options":["server-side","client-encrypted","client-unencrypted","unknown"],"detail":false,"emptyRequires":false},{"id":"R-32","phase":"profile","section":"T10","type":"check","title":"Record identifiers arriving through view parameters are validated against scope on page load and on every postback action","detail":false,"emptyRequires":false,"forEach":"C-54","severity":"high"},{"id":"R-33","phase":"profile","section":"T10","type":"check","title":"Client-side JSF view state is encrypted","when":{"q":"C-55","in":["client-unencrypted","unknown"]},"detail":false,"emptyRequires":false,"severity":"medium"},{"id":"F-10","phase":"profile","section":"T10","type":"list","title":"Issues found in this area","columns":[{"key":"location","label":"Location (file:line or URL)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item"},{"key":"severity","label":"Severity","type":"select","options":["high","medium","low","not sure"]}],"detail":false,"emptyRequires":false,"optional":true,"findings":true},{"id":"C-56","phase":"profile","section":"T11","type":"yesno","title":"Fortify artifacts checked into the repository","detail":false,"emptyRequires":false},{"id":"C-57","phase":"profile","section":"T11","type":"list","title":"Fortify artifacts","columns":[{"key":"path","label":"Path"},{"key":"kind","label":"Kind","type":"select","options":["fpr","filter file","suppression annotation","comment","properties","other"]},{"key":"suppresses","label":"What it suppresses or excludes"}],"when":{"q":"C-56","eq":"yes"},"detail":false,"emptyRequires":true},{"id":"C-58","phase":"profile","section":"T11","type":"yesno","title":"Candidate taint-breaking wrappers","detail":false,"emptyRequires":false},{"id":"C-59","phase":"profile","section":"T11","type":"list","title":"Taint-breaking wrapper candidates","columns":[{"key":"method","label":"Class#method (file:line)"},{"key":"pattern","label":"Pattern","type":"select","options":["returns input","string copy","permissive regex","no-op encoder","other"]},{"key":"callers","label":"Called from"}],"when":{"q":"C-58","eq":"yes"},"detail":false,"emptyRequires":true},{"id":"R-34","phase":"profile","section":"T11","type":"check","title":"This wrapper performs real validation or encoding; if it passes input through, the finding it silences is re-evaluated as live","detail":false,"emptyRequires":false,"forEach":"C-59","severity":"medium"},{"id":"R-35","phase":"profile","section":"T11","type":"check","title":"This suppression or filter is justified in writing and the justification holds","detail":false,"emptyRequires":false,"forEach":"C-57","severity":"medium"},{"id":"F-11","phase":"profile","section":"T11","type":"list","title":"Issues found in this area","columns":[{"key":"location","label":"Location (file:line or URL)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item"},{"key":"severity","label":"Severity","type":"select","options":["high","medium","low","not sure"]}],"detail":false,"emptyRequires":false,"optional":true,"findings":true},{"id":"F-12","phase":"profile","section":"T12","type":"list","title":"Issues found that no topic above covered","columns":[{"key":"location","label":"Location (file:line or URL)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item"},{"key":"severity","label":"Severity","type":"select","options":["high","medium","low","not sure"]}],"detail":false,"emptyRequires":false,"optional":true,"findings":true}]}
-->

Work through the topics in order. Each topic first establishes the facts about one area of the application, then checks that area, then records anything found there. Status values for checks: pass (checked, and the check is present), finding (the check is absent or bypassable), unable (cannot be determined statically; say what was tried), na (does not apply; say why). The named shape to look for everywhere: authentication present, authorization to use the application present, authorization to the specific record absent.

## 0. What this application is

_Reminder for this topic: one item at a time. Research it, write its block, check it off in your task list, then take the next; never fill several blocks in one step. Answer from the code only. Never fill a field with a placeholder, a guessed citation, or an invented Searched record to satisfy the linter. If an item cannot be answered from what you can read, ask the developer before moving on; nothing is marked `unable` without asking first, and the block records what was asked and answered in an `Asked:` line._

Deployment facts: what is built, which frameworks handle requests, and how the frontend is served. They switch some later topics on and off and are what the fleet roll-up groups on.

### C-01: Deployable modules, artifact ids, and context roots

**Type:** table  
**Applies when:** always  
**Refs:** 6.10, 6.11 (sections and question numbers of the handoff document, not files in this project)

**How:** Open the root pom.xml and every module pom.xml. Record one row for each module that produces a WAR or a Spring Boot executable. Take the context root from src/main/webapp/WEB-INF/weblogic.xml, or from server.servlet.context-path in application.properties or application.yml.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `<packaging>war</packaging>`, `spring-boot-maven-plugin`, `<artifactId>`, `<finalName>`, `<context-root>`, `server.servlet.context-path`

**Columns:**

- Module (pom path)
- artifactId
- Packaging (exactly one of: `war`, `spring-boot-jar`, `other`, lowercase, no backticks)
- Context root

<!-- answer C-01 -->
| Module (pom path) | artifactId | Packaging | Context root |
|---|---|---|---|
|   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-02: Backend frameworks present

**Type:** multiple choice  
**Applies when:** always  
**Refs:** 1, Q12, Q31 (sections and question numbers of the handoff document, not files in this project)

**How:** Check the POM dependencies, web.xml, and annotations in src/main/java. Select every framework that handles an HTTP request in this application, even if only for one page.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `@Controller`, `@RestController`, `DispatcherServlet`, `@SpringBootApplication`, `SpringBootServletInitializer`, `spring-boot-starter`, `spring-security`, `@EnableWebSecurity`, `javax.ws.rs`, `@Path(`, `javax.faces`, `FacesServlet`, `faces-config.xml`, `.xhtml`, `.jspx`, `.jsp`, `<servlet-class>`, `@WebServlet`, `@ServerEndpoint`, `struts`

**Options:**

- `spring-mvc`: Spring MVC (@Controller, DispatcherServlet)
- `spring-boot`: Spring Boot
- `spring-security`: Spring Security
- `jaxrs`: JAX-RS (@Path; Jersey, RESTEasy, or CXF)
- `jsf`: JSF (FacesServlet, .xhtml or .jspx pages)
- `jsp`: JSP pages
- `servlets`: Raw servlets (web.xml <servlet> or @WebServlet)
- `websocket`: WebSocket endpoints
- `struts`: Struts
- `other`: Other (describe in Detail)

<!-- answer C-02 -->
Value:
Detail (Versions and anything selected as Other):
Evidence:
Searched:
<!-- /answer -->

### C-03: Frontend technology

**Type:** single choice  
**Applies when:** always  
**Refs:** Q19 (sections and question numbers of the handoff document, not files in this project)

**How:** Look for package.json and angular.json under src/main/angular or similar. AngularJS 1.x shows as angular.module( and ng-app in templates. If the only pages are JSF or JSP, choose server-rendered. Answering "none: API only" is a negative answer and needs a Searched record.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `angular.json`, `@angular/core`, `package.json`, `angular.module(`, `ng-app`, `ng-controller`, `src/main/angular`

**Options:**

- `angular`: Angular 2 or later
- `angularjs`: AngularJS 1.x
- `mixed`: Mixed (describe in Detail)
- `server-rendered`: Server-rendered pages only (JSF or JSP)
- `none-api-only`: None: API only

<!-- answer C-03 -->
Value:
Detail (Version from package.json and where the frontend source lives):
Evidence:
Searched:
<!-- /answer -->

### C-04: Frontend delivery and origin

**Type:** single choice  
**Applies when:** always  
**Refs:** 6.10, Q19 (sections and question numbers of the handoff document, not files in this project)

**How:** Same WAR: a frontend build plugin copies the compiled app into src/main/webapp or the WAR, so API calls are same-origin and the session cookie rides along. Separate origin: the frontend is deployed elsewhere and the backend has CORS configuration. Record allowed origins and whether credentials are allowed.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `frontend-maven-plugin`, `outputPath`, `src/main/webapp`, `@CrossOrigin`, `CorsFilter`, `CorsRegistry`, `addCorsMappings`, `Access-Control-Allow-Origin`, `allowCredentials`, `withCredentials`

**Options:**

- `same-war`: Served from the same WAR (same origin)
- `separate-origin-cors`: Separate origin with CORS
- `separate-proxied`: Separate deployment behind the same origin (proxy)
- `unknown`: Unknown

<!-- answer C-04 -->
Value:
Detail (CORS allowed origins and credentials setting, if any):
Evidence:
Searched:
<!-- /answer -->

### C-05: Enterprise shared libraries in the POM

**Type:** table  
**Applies when:** always  
**Refs:** 6.1, 6.3, Q26 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per enterprise or shared-library dependency. These are where authentication filters, token handling, and header filters usually live, so they determine which checks apply. Record the version and scope.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `mil.osd.dmdc`, `web-security`, `authagent`, `enterprise`, `<scope>provided</scope>`

**Columns:**

- groupId:artifactId
- Version
- Scope
- What it provides here

<!-- answer C-05 -->
| groupId:artifactId | Version | Scope | What it provides here |
|---|---|---|---|
|   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-06: Source this review needs that is not in this project

**Type:** table  
**Applies when:** always  
**Refs:** 6.1, 6.3, Q26 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per shared library listed in C-05, plus one row for any other codebase you find yourself needing while working through this document: a backend service whose authorization behaviour an item asks about, the portal that mints the token, another application this one calls into. Add those rows as you hit them; this table is the record of what the review had to read from outside. "Source needed" is yes when the code provides something a check must read: authentication, token validation, session handling, authorization or scope helpers, the service client that builds outbound requests, file serving, security headers, or input wrappers. It is no when the code is a pure utility, when nothing in this project references it, or when no item depends on reading it. For every row marked yes, look locally first: a checkout beside this project, a -sources.jar under ~/.m2/repository/<group path>/<artifact>/<version>/, or another module of this repository. If it is not there, stop and ask the developer for the GitLab URL and the tag, branch, or commit matching the version this application uses, then clone it into review-deps/ inside this project (git clone <url> review-deps/<name>), check out that ref, and confirm the working tree really is on it before reading anything: a fresh clone sits on the default branch, which is not what is deployed. For a Maven project the <version> in the clone's own pom.xml must equal the version this project depends on; if it does not, or the tag does not exist, ask which ref matches the deployed version. Record the URL, the ref, and the path where you put it, and cite files in it by that path. If nobody can provide it, record not-available; every item that depends on that code is then unable with the reason "source of <name> not available", never pass.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `-sources.jar`, `~/.m2/repository`, `../`, `git clone`, `git submodule`, `.gitmodules`, `gitlab`

**Columns:**

- Library, service, or repository
- Source needed (exactly one of: `yes`, `no`, lowercase, no backticks)
- Why: what it provides that a check must read, or why not needed
- GitLab URL (from the developer)
- Ref checked out, verified against the version used
- Where the source is now (review-deps/<name>), or not-available
- Source obtained (exactly one of: `yes`, `no`, `not-needed`, lowercase, no backticks)

**If empty:** This review read nothing outside the project: every library in C-05 was unnecessary and no item needed another codebase. Searched must say where you looked and name each C-05 library.

<!-- answer C-06 -->
| Library, service, or repository | Source needed | Why: what it provides that a check must read, or why not needed | GitLab URL (from the developer) | Ref checked out, verified against the version used | Where the source is now (review-deps/<name>), or not-available | Source obtained |
|---|---|---|---|---|---|---|
|   |   |   |   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-07: Deployed to WebLogic

**Type:** yes/no  
**Applies when:** always  
**Refs:** 6.10 (sections and question numbers of the handoff document, not files in this project)

**Fleet default:** `yes`. Confirm or override with evidence.

**How:** Fleet default: yes. Confirm from weblogic.xml or weblogic-application.xml and record the version namespace.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `weblogic.xml`, `weblogic-application.xml`, `weblogic-version`, `wls:`

<!-- answer C-07 -->
Value:
Detail (WebLogic version from the descriptor namespace):
Evidence:
Searched:
<!-- /answer -->

## 1. Who uses it and how they log in

_Reminder for this topic: one item at a time. Research it, write its block, check it off in your task list, then take the next; never fill several blocks in one step. Answer from the code only. Never fill a field with a placeholder, a guessed citation, or an invented Searched record to satisfy the linter. If an item cannot be answered from what you can read, ask the developer before moving on; nothing is marked `unable` without asking first, and the block records what was asked and answered in an `Asked:` line._

The identity every later check depends on: who the caller is, how that was established, and where it is kept.

### C-08: Audience: beneficiary self-service or operator

**Type:** single choice  
**Applies when:** always  
**Refs:** 1, 6.1, 6.7 (sections and question numbers of the handoff document, not files in this project)

**How:** Decide from the login mechanism and the identifiers the code carries. Beneficiary self-service: the beneficiary SSO filter (AuthFilter, BeneficiaryAgentSSO, the iPlanetDirectoryPro cookie), logon methods FAM, CAC, DFAS, and identity expressed as a person, sponsor, or family id. Operator: the operator filters (OperatorAuthenticationFilter, OperatorAuthorizationFilter), logon methods CAC and SNT, site selection, and identity expressed as an operator id with access levels. Both: an application that serves both audiences through separate filters or paths. Cite the filter declarations and the identity fields. Choosing unknown asks both the beneficiary and the operator scope questions.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `AuthFilter`, `BeneficiaryAgentSSO`, `iPlanetDirectoryPro`, `OperatorAuthenticationFilter`, `OperatorAuthorizationFilter`, `/selectsite`, `accessLevel`, `operatorId`, `familyId`, `sponsorId`, `beneficiary`, `operator`, `milconnect`, `opsconnect`

**Options:**

- `beneficiary`: Beneficiary self-service
- `operator`: Operator (call centre or office staff)
- `both`: Both audiences
- `unknown`: Unknown

<!-- answer C-08 -->
Value:
Detail (Who exactly: sponsors, dependents, call-centre operators, site staff):
Evidence:
Searched:
<!-- /answer -->

### C-09: Application type

**Type:** single choice  
**Applies when:** always  
**Refs:** 1, 6.1, Q26 (sections and question numbers of the handoff document, not files in this project)

**How:** Decide from evidence, not from the name. Portal: hosts other applications in iframes and mints the token they receive (iframe elements whose src is another application, a JWT builder or sign call, portlet URL configuration, plus its own SSO filter). Portlet: receives a token from a parent and validates it, has no SSO filter of its own, and often has an artifactId prefixed portlet-. Standalone: has its own SSO filter, hosts no iframes, validates no token from a parent. If signals conflict, choose the dominant role and describe the conflict in Evidence. Choosing unknown keeps the token topic open with both portal and portlet items marked not applicable; prefer the closest classification with the conflict described.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `<iframe`, `bypassSecurityTrustResourceUrl`, `Jwts.builder`, `signWith(`, `Jwts.parser`, `JWTVerifier`, `portlet`, `AuthFilter`, `BeneficiaryAgentSSO`, `OperatorAuthenticationFilter`, `web-security`, `frame-ancestors`, `X-Frame-Options`

**Options:**

- `portal`: Portal: hosts portlets and mints their token
- `portlet`: Portlet: loaded in a portal iframe, receives a token
- `standalone`: Standalone: own SSO, no iframe hosting, no parent token
- `unknown`: Unknown

<!-- answer C-09 -->
Value:
Detail (Naming convention observed: artifactId prefix, package name):
Evidence:
Searched:
<!-- /answer -->

### C-10: Authentication mechanisms

**Type:** multiple choice  
**Applies when:** always  
**Refs:** 6.1, 6.2, 6.3, Q26 (sections and question numbers of the handoff document, not files in this project)

**How:** Identify every mechanism that decides whether a request is authenticated. Enterprise filters usually come from a shared library and are declared in web.xml or registered by a Spring configuration class even though the class lives outside the repo. A portal token validated by code written in this application selects both portal-jwt and custom; custom alone means no enterprise or portal mechanism is involved.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `AuthFilter`, `BeneficiaryAgentSSO`, `authagent`, `OperatorAuthenticationFilter`, `OperatorAuthorizationFilter`, `iPlanetDirectoryPro`, `<login-config>`, `<security-constraint>`, `spring-security`, `SecurityFilterChain`, `WebSecurityConfigurerAdapter`, `Jwts.parser`, `JWTVerifier`

**Options:**

- `beneficiary-sso`: Enterprise beneficiary SSO filter (AuthFilter / BeneficiaryAgentSSO)
- `operator-filter`: Enterprise operator filters (OperatorAuthenticationFilter / OperatorAuthorizationFilter)
- `portal-jwt`: Token received from a parent portal
- `spring-security`: Spring Security
- `container-managed`: Container-managed (<login-config> in web.xml)
- `custom`: Custom or home-grown
- `none`: None found

<!-- answer C-10 -->
Value:
Detail (Logon methods supported: CAC, FAM, DFAS, SNT and anything custom):
Evidence:
Searched:
<!-- /answer -->

### C-11: Authentication and authorization filters

**Type:** table  
**Applies when:** always  
**Refs:** 6.2, 6.3, Q6 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per servlet filter or security-chain element that authenticates, authorizes, or writes security headers. Read web.xml <filter> and <filter-mapping>, @WebFilter annotations, FilterRegistrationBean beans, and Spring Security configuration. Record the url-patterns exactly as declared and the order they run in.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `<filter>`, `<filter-mapping>`, `<url-pattern>`, `@WebFilter`, `FilterRegistrationBean`, `addFilterBefore`, `SecurityFilterChain`, `OncePerRequestFilter`, `doFilter(`

**Columns:**

- Filter class
- Registered in (exactly one of: `web.xml`, `@WebFilter`, `FilterRegistrationBean`, `Spring Security chain`, `other`, lowercase, no backticks)
- URL patterns
- Order
- Purpose (exactly one of: `authentication`, `authorization`, `headers`, `other`, lowercase, no backticks)

<!-- answer C-11 -->
| Filter class | Registered in | URL patterns | Order | Purpose |
|---|---|---|---|---|
|   |   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-12: Where identity is held after authentication

**Type:** single choice  
**Applies when:** always  
**Refs:** 6.7, Q7 (sections and question numbers of the handoff document, not files in this project)

**How:** Follow the authentication filter to the point where it stores who the caller is. Then find the class that later code reads to get the caller's identifiers. Record that class and every identifier it carries.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `getSession(`, `setAttribute(`, `getUserPrincipal`, `Principal`, `ThreadLocal`, `RequestContextHolder`, `SecurityContextHolder`, `UserContext`, `UserInfo`, `Identity`, `Beneficiary`, `Operator`, `Subject`

**Options:**

- `http-session`: HttpSession attribute
- `custom-principal`: Custom Principal via request.getUserPrincipal()
- `thread-local`: ThreadLocal or request-scoped holder
- `spring-security-context`: Spring SecurityContextHolder
- `jwt-each-request`: Re-derived from the token on every request
- `other`: Other (describe in Detail)
- `unknown`: Unknown

<!-- answer C-12 -->
Value:
Detail (Class holding the identity and the identifiers it carries: person id, sponsor id, family id, operator id, access levels, site):
Evidence:
Searched:
<!-- /answer -->

### C-13: Per-request credential

**Type:** single choice  
**Applies when:** always  
**Refs:** 6.1, Q5 (sections and question numbers of the handoff document, not files in this project)

**How:** What must accompany each backend request after login. Session cookie: server code calls getSession and the frontend sends cookies. Bearer token: an Angular interceptor adds an Authorization header and the server parses it on every request.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `JSESSIONID`, `getSession(`, `Authorization`, `Bearer`, `HttpInterceptor`, `withCredentials`, `cookie-name`

**Options:**

- `session-cookie`: Session cookie
- `bearer-jwt`: Bearer token on every request
- `both`: Both
- `none`: None found

<!-- answer C-13 -->
Value:
Evidence:
Searched:
<!-- /answer -->

### C-14: Session cookie flags

**Type:** multiple choice  
**Applies when:** C-13 (Per-request credential) is one of `session-cookie`, `both`  
**Refs:** Q5 (sections and question numbers of the handoff document, not files in this project)

**How:** Decide each flag from the effective configuration, not only from explicit settings. HttpOnly is on when web.xml has <http-only>true</http-only>, or weblogic.xml cookie-http-only is absent or true (WebLogic 12c defaults it to true), or a Spring Boot application leaves server.servlet.session.cookie.http-only at its default (true); it is off only on an explicit false. Secure requires an explicit true (<secure>true</secure>, cookie-secure true, or server.servlet.session.cookie.secure=true); WebLogic defaults it to false. SameSite requires an explicit setting (a filter rewriting Set-Cookie, or server.servlet.session.cookie.same-site). Record where each effective value comes from, defaults included.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `<cookie-config>`, `<http-only>`, `<secure>`, `<session-descriptor>`, `cookie-http-only`, `cookie-secure`, `cookie-name`, `SameSite`, `Set-Cookie`, `server.servlet.session.cookie.http-only`, `server.servlet.session.cookie.secure`, `server.servlet.session.cookie.same-site`

**Options:**

- `http-only`: HttpOnly
- `secure`: Secure
- `samesite`: SameSite
- `none-found`: None found

<!-- answer C-14 -->
Status:
Reason:
Value:
Detail (Where each flag is set: file:line):
Evidence:
Searched:
<!-- /answer -->

### C-15: Frontend JavaScript reads authentication cookies

**Type:** yes/no  
**Applies when:** always  
**Refs:** 6.4, Q11 (sections and question numbers of the handoff document, not files in this project)

**How:** Search the frontend source for cookie reads. If JavaScript can read the SSO or session cookie by name, the cookie is not HttpOnly and the token is exposed to any script injection. Record the cookie names and files.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `document.cookie`, `CookieService`, `ngx-cookie`, `iPlanetDirectoryPro`, `JSESSIONID`, `getCookie(`

<!-- answer C-15 -->
Value:
Detail (Cookie names and the files that read them):
Evidence:
Searched:
<!-- /answer -->

### R-01: The caller's identity used for scope decisions comes only from the server-side session or the validated token

**Type:** check  
**Applies when:** always  
**Severity if finding:** high  
**STIG area:** Access control: identity assertion from client input  
**Refs:** 6.7, Q7 (sections and question numbers of the handoff document, not files in this project)

**How:** Find every place the code decides who the caller is: the identity holder from C-12. Then search for code that reads a person, sponsor, family, or operator id from a request parameter, header, or cookie and treats it as the current user, for example by passing it to the same methods the identity holder feeds. Any such path lets a caller pick their own identity.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Identity holder, every reader of it, every request-sourced id that reaches the same methods.

**Why no more findings must state:** Every request-sourced identifier found and why each is never used as the caller's identity.

**Signals to search:** `getParameter("personId`, `getParameter("sponsorId`, `getHeader(`, `setCurrentUser`, `getUser(`, `UserContext`, `getAttribute(`

<!-- answer R-01 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-02: The session cookie is HttpOnly and Secure, and the session id never appears in a URL

**Type:** check  
**Applies when:** C-13 (Per-request credential) is one of `session-cookie`, `both`  
**Severity if finding:** medium  
**STIG area:** Session management: cookie protection  
**Refs:** Q5 (sections and question numbers of the handoff document, not files in this project)

**How:** Confirm the effective values from C-14, defaults included: HttpOnly is a finding only on an explicit false; Secure is a finding unless explicitly true. URL rewriting is off only with url-rewriting-enabled false in weblogic.xml, <tracking-mode>COOKIE</tracking-mode> in web.xml, or server.servlet.session.tracking-modes=cookie in Spring Boot; WebLogic defaults it to on. Confirm no code calls encodeURL or encodeRedirectURL in a way that appends jsessionid. Note SameSite if present.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** cookie-config, session-descriptor, encodeURL call sites.

**Why no more findings must state:** The descriptor values cited and the encodeURL search result.

**Signals to search:** `<http-only>`, `<secure>`, `cookie-http-only`, `cookie-secure`, `url-rewriting-enabled`, `<tracking-mode>`, `tracking-modes`, `encodeURL(`, `encodeRedirectURL(`, `server.servlet.session.cookie`

<!-- answer R-02 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-03: The SSO cookie that JavaScript reads is exposed to script injection: confirm the read is live and record it

**Type:** check  
**Applies when:** C-15 (Frontend JavaScript reads authentication cookies) = `yes`  
**Severity if finding:** medium  
**STIG area:** Session management: cookie protection  
**Refs:** 6.4, Q11 (sections and question numbers of the handoff document, not files in this project)

**How:** Confirm the cookie read in C-15 executes in production code paths rather than dead code. If it does, the cookie is not HttpOnly and any script injection in this application, or in any application on the same cookie domain, can steal the SSO session. The fix is on the identity management side; record the finding here so it is tracked.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** The cookie read, its callers, and whether the value is used.

**Why no more findings must state:** Why the read is or is not reachable.

**Signals to search:** `document.cookie`, `iPlanetDirectoryPro`, `CookieService`

<!-- answer R-03 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### F-01: Issues found in this area

**Type:** table  
**Applies when:** always  
**Refs:** 3, 4 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per issue noticed while working through this topic that no item above recorded. Cite the location as file:line or as a URL. Name the item that led you to it where there is one. Severity: high when a caller can reach another user's data with no check in the way; medium when exposure needs a second condition; low for hardening; not sure otherwise. Leave the table empty if nothing was noticed.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Columns:**

- Location (file:line or URL)
- What is wrong
- Related item
- Severity (exactly one of: `high`, `medium`, `low`, `not sure`, lowercase, no backticks)

**Optional:** an empty table is acceptable here.

<!-- answer F-01 -->
| Location (file:line or URL) | What is wrong | Related item | Severity |
|---|---|---|---|
|   |   |   |   |

Notes:
<!-- /answer -->

## 2. The token from the portal

_Reminder for this topic: one item at a time. Research it, write its block, check it off in your task list, then take the next; never fill several blocks in one step. Answer from the code only. Never fill a field with a placeholder, a guessed citation, or an invented Searched record to satisfy the linter. If an item cannot be answered from what you can read, ask the developer before moving on; nothing is marked `unable` without asking first, and the block records what was asked and answered in an `Asked:` line._

Only for portals and portlets. The token is the only thing that carries identity across the iframe boundary; if it can be forged, replayed, or read, every check that trusts it is void.

**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`. If not met, mark every item in this topic `Status: na` with the rule as the reason.

### C-16: Token delivery into the portlet iframe

**Type:** single choice  
**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`  
**Refs:** 6.6, Q1 (sections and question numbers of the handoff document, not files in this project)

**How:** On the portal side, find where the iframe src is built or where a message is posted to the frame. On the portlet side, find where the token is first read: query string, fragment, message event, cookie, or header. Cite both sides. A query parameter lands in WebLogic access logs, browser history, and Referer headers.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `<iframe`, `[src]`, `bypassSecurityTrustResourceUrl`, `token=`, `jwt=`, `postMessage(`, `addEventListener('message'`, `location.hash`, `queryParams`, `HttpParams`, `getParameter("token`, `getHeader(`

**Options:**

- `query-param`: iframe src query parameter
- `url-fragment`: URL fragment
- `postmessage`: window.postMessage
- `shared-domain-cookie`: Cookie on a shared domain
- `proxy-header`: Header injected by a proxy
- `other`: Other (describe in Detail)
- `unknown`: Unknown

<!-- answer C-16 -->
Status:
Reason:
Value:
Detail (Portal side: file:line and portlet side: file:line):
Evidence:
Searched:
<!-- /answer -->

### C-17: Token construct and library

**Type:** single choice  
**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`  
**Refs:** 6.6, Q3 (sections and question numbers of the handoff document, not files in this project)

**How:** Find the code that creates or parses the token and identify the library and algorithm. Signed means JWS with HMAC or an asymmetric key. Encrypted means JWE. Custom means Cipher or Mac calls outside a JOSE library.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `io.jsonwebtoken`, `Jwts.`, `com.auth0.jwt`, `com.nimbusds.jose`, `JWSObject`, `JWEObject`, `signWith(`, `SignatureAlgorithm`, `Cipher.getInstance(`, `SecretKeySpec`, `Mac.getInstance(`, `Base64`

**Options:**

- `jws-hmac`: JWS signed with HMAC (shared secret)
- `jws-asymmetric`: JWS signed with an asymmetric key
- `jwe`: JWE encrypted
- `jws-and-jwe`: Signed and encrypted
- `custom-crypto`: Custom encrypt/decrypt outside a JOSE library
- `unknown`: Unknown

<!-- answer C-17 -->
Status:
Reason:
Value:
Detail (Library, class, and algorithm constant):
Evidence:
Searched:
<!-- /answer -->

### C-18: Token claims

**Type:** table  
**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`  
**Refs:** 6.6, Q2 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per claim placed in the token. Take the list from the code that builds it on the portal side, or from the code that reads it on the portlet side if the portal is not in this repo.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `claim(`, `setClaims`, `withClaim`, `getClaim`, `get("`, `sub`, `exp`, `iss`, `aud`, `familyId`, `sponsorId`, `personId`, `accessLevel`, `appId`, `site`

**Columns:**

- Claim
- Meaning
- Set by (class)
- Portlet uses it for (exactly one of: `identity`, `authorization`, `scope`, `expiry or metadata`, `unused`, lowercase, no backticks)

<!-- answer C-18 -->
Status:
Reason:
| Claim | Meaning | Set by (class) | Portlet uses it for |
|---|---|---|---|
|   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-19: Validation performed on the received token

**Type:** multiple choice  
**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`; and C-09 (Application type) = `portlet`  
**Refs:** Q3 (sections and question numbers of the handoff document, not files in this project)

**How:** Read the parse or verify call and everything around it, and select only what the code demonstrably enforces. Library behaviour differs: jjwt (parseClaimsJws with a signing key) and auth0 (JWTVerifier.verify) reject an expired or not-yet-valid token automatically when exp or nbf is present, but neither requires those claims to exist, so a token minted without exp is accepted forever unless the code calls require("exp", ...) or checks getExpiration() != null. Select exp only when presence is required and the parse exception is fatal. Issuer and audience are enforced only through requireIssuer/requireAudience (jjwt) or withIssuer/withAudience (auth0), or explicit claim comparisons. nimbus JWSObject.verify checks the signature only; claims need DefaultJWTClaimsVerifier or explicit code. Custom decryption enforces nothing by itself.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `parseClaimsJws`, `parseClaimsJwt`, `parse(`, `require(`, `requireIssuer`, `requireAudience`, `getExpiration`, `withIssuer`, `withAudience`, `acceptLeeway`, `DefaultJWTClaimsVerifier`, `JWTClaimsSet`, `ExpiredJwtException`, `getAlgorithm`

**Options:**

- `signature`: Signature verified
- `exp`: Expiry (exp) enforced
- `nbf`: Not-before (nbf) enforced
- `iss`: Issuer (iss) checked
- `aud-or-app-id`: Audience or application id checked
- `alg-pinned`: Algorithm pinned (rejects none and algorithm switching)
- `jti-replay`: Replay protection (jti or one-time use)
- `none-found`: None found

<!-- answer C-19 -->
Status:
Reason:
Value:
Detail (Class and lines performing each check):
Evidence:
Searched:
<!-- /answer -->

### C-20: Secret or key storage

**Type:** single choice  
**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`  
**Refs:** 6.6, Q4 (sections and question numbers of the handoff document, not files in this project)

**How:** Find where the signing or encryption key is loaded from. Follow the property key to its source: a properties file inside the WAR, a JNDI lookup, an environment variable, or a literal in source.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `secret`, `jwt.key`, `jwtSecret`, `SECRET`, `@Value(`, `getProperty(`, `InitialContext`, `lookup(`, `System.getenv`, `.properties`

**Options:**

- `properties-in-war`: Properties file inside the WAR
- `credential-store-jndi`: WebLogic credential store or JNDI
- `env-var`: Environment variable
- `hardcoded`: Hardcoded in source
- `other`: Other (describe in Detail)
- `unknown`: Unknown

<!-- answer C-20 -->
Status:
Reason:
Value:
Detail (Property key and file):
Evidence:
Searched:
<!-- /answer -->

### C-21: Secret scope

**Type:** single choice  
**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`  
**Refs:** Q4 (sections and question numbers of the handoff document, not files in this project)

**How:** Is the same key used by every portlet, or does each portlet have its own? A shared library default, or the same property name in multiple applications, indicates fleet-shared.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `web-security`, `authagent`, `jwt`, `secret`

**Options:**

- `fleet-shared`: One key shared across the fleet
- `per-portlet`: Per portlet
- `unknown`: Unknown

<!-- answer C-21 -->
Status:
Reason:
Value:
Detail (How this was determined):
Evidence:
Searched:
<!-- /answer -->

### C-22: Session model after token validation

**Type:** single choice  
**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`; and C-09 (Application type) = `portlet`  
**Refs:** Q5 (sections and question numbers of the handoff document, not files in this project)

**How:** After the token is accepted, does the portlet create an HttpSession and store identity in it, or does every request carry the token again? If a session is created, record what is stored and how the session is tied to the token identity.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `getSession(true)`, `setAttribute(`, `invalidate(`, `Bearer`, `HttpInterceptor`

**Options:**

- `creates-http-session`: Creates an HttpSession holding identity
- `stateless`: Stateless: token on every request
- `both`: Both
- `unknown`: Unknown

<!-- answer C-22 -->
Status:
Reason:
Value:
Detail (What is stored and how it is bound to the token identity):
Evidence:
Searched:
<!-- /answer -->

### C-23: Portlet entry guard

**Type:** table  
**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`; and C-09 (Application type) = `portlet`  
**Refs:** Q6 (sections and question numbers of the handoff document, not files in this project)

**How:** Which filter or guard rejects a request that has no valid token or session? Record its url-patterns and its exclusions. If the portlet can be opened directly in a browser tab without the portal, note what happens.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `doFilter(`, `shouldNotFilter`, `sendError(401`, `sendError(403`, `sendRedirect(`, `<filter-mapping>`

**Columns:**

- Guard class
- URL patterns
- Exclusions
- Rejects when

**If empty:** An empty table means no guard was found. Searched must list every filter and configuration file read.

<!-- answer C-23 -->
Status:
Reason:
| Guard class | URL patterns | Exclusions | Rejects when |
|---|---|---|---|
|   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-24: Framing protection

**Type:** single choice  
**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`  
**Refs:** Q6 (sections and question numbers of the handoff document, not files in this project)

**How:** Find where X-Frame-Options or a Content-Security-Policy frame-ancestors directive is set, in a filter, in Spring Security headers configuration, or in the shared web-security library. Record the value.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `X-Frame-Options`, `frame-ancestors`, `Content-Security-Policy`, `addHeader(`, `setHeader(`, `frameOptions`

**Options:**

- `x-frame-options`: X-Frame-Options set
- `csp-frame-ancestors`: CSP frame-ancestors set
- `both`: Both
- `none-found`: None found

<!-- answer C-24 -->
Status:
Reason:
Value:
Detail (Values and where they are set):
Evidence:
Searched:
<!-- /answer -->

### C-25: Where the portal mints the token

**Type:** free text  
**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`; and C-09 (Application type) = `portal`  
**Refs:** Q1, Q2 (sections and question numbers of the handoff document, not files in this project)

**How:** Record the class and method that builds the token, which fields it copies from the authenticated identity, the expiry it sets, and whether it sets an audience or application id per portlet.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `Jwts.builder`, `signWith(`, `setExpiration`, `setAudience`, `setIssuer`, `claim(`

<!-- answer C-25 -->
Status:
Reason:
Value:
Evidence:
Searched:
<!-- /answer -->

### R-04: The token signature is verified with a pinned algorithm before any claim is trusted

**Type:** check  
**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`; and C-09 (Application type) = `portlet`  
**Severity if finding:** high  
**STIG area:** Identification and authentication: token validation  
**Refs:** Q3 (sections and question numbers of the handoff document, not files in this project)

**How:** Find the parse call from C-17 and C-19. jjwt: parseClaimsJws with a signing key passes; parse or parseClaimsJwt accept unsigned tokens and fail. auth0: the verifier must be built with a fixed algorithm. nimbus: a JWSVerifier must be applied and the header alg compared to the expected value. Custom decryption: the code must authenticate the token, not only decrypt it. Then confirm no claim is read before verification succeeds. In jjwt 0.9, a byte[] or SecretKey signing key confines verification to HMAC, which satisfies the algorithm pinning on its own; with a Key of another type or with nimbus, confirm the accepted algorithm is compared. JWT.decode( in auth0, and any hand-rolled split on "." followed by Base64 decoding, yield claims without verification; a claim read from either before verification is a finding.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Token string, parse or verify call, key source, exception handling, first claim read.

**Why no more findings must state:** Every code path that reads a claim, and why each runs only after verification.

**Signals to search:** `parseClaimsJws`, `parseClaimsJwt`, `parse(`, `setSigningKey`, `verifyWith`, `JWSVerifier`, `getAlgorithm`, `require(`, `Cipher.getInstance`, `JWT.decode(`, `split("\\.")`, `Base64.getDecoder`, `getUrlDecoder`

<!-- answer R-04 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-05: Expiry, issuer, and audience or application id are enforced, so a token minted for another portlet or long ago is rejected

**Type:** check  
**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`; and C-09 (Application type) = `portlet`  
**Severity if finding:** high  
**STIG area:** Identification and authentication: token validation  
**Refs:** Q3, Q4 (sections and question numbers of the handoff document, not files in this project)

**How:** For expiry: with jjwt or auth0 an expired token is rejected automatically when exp is present, so the line to find is the one that requires exp to be present (require("exp", ...), a getExpiration() null check, or withAudience-style required claims); without it a token minted without exp never expires. With nimbus or custom code, find the explicit exp comparison. For issuer and audience or app id: find requireIssuer/requireAudience, withIssuer/withAudience, a DefaultJWTClaimsVerifier, or explicit comparisons, and what happens on failure. A shared secret across the fleet (C-21) makes the audience check the only thing stopping a token for portlet X from opening portlet Y. Record the expiry length.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Each check, its failure branch, the configured expected values.

**Why no more findings must state:** For each claim, the check line or the reason it is not needed.

**Signals to search:** `require(`, `requireIssuer`, `requireAudience`, `withIssuer`, `withAudience`, `getExpiration`, `getAudience`, `getIssuer`, `DefaultJWTClaimsVerifier`, `appId`, `ExpiredJwtException`

<!-- answer R-05 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-06: The token travels in the iframe URL: record the exposure and any mitigation

**Type:** check  
**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`; and C-16 (Token delivery into the portlet iframe) = `query-param`  
**Severity if finding:** medium  
**STIG area:** Session management: credential exposure in URLs  
**Refs:** Q1 (sections and question numbers of the handoff document, not files in this project)

**How:** A query-string token lands in WebLogic access logs, browser history, proxy logs, and the Referer header of any outbound link from the portlet. Record the expiry length and whether the token is single-use or exchanged for a session immediately. Short expiry and immediate exchange reduce the window; they do not remove the log exposure.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Portal side URL construction, portlet side read, what happens to the URL afterward.

**Why no more findings must state:** Not applicable: this item is a recorded finding with mitigation notes.

**Signals to search:** `token=`, `jwt=`, `[src]`, `bypassSecurityTrustResourceUrl`, `history.replaceState`

<!-- answer R-06 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-07: Every scope decision in the portlet uses claims from the validated token; no request parameter can override family id, sponsor id, or access levels

**Type:** check  
**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`; and C-09 (Application type) = `portlet`  
**Severity if finding:** high  
**STIG area:** Access control: identity assertion from client input  
**Refs:** Q13 (sections and question numbers of the handoff document, not files in this project)

**How:** Find where validated claims are stored (C-22). Search for the same identifiers being read from request parameters, headers, or the body anywhere in the portlet and traced into scope decisions or data calls. An endpoint that takes a family id from the request and uses it instead of the token's family id is a finding even if the token was validated.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Claim storage, readers of it, request-sourced identifiers with the same names.

**Why no more findings must state:** Every request-sourced identifier with a scope meaning and why it cannot displace the token claim.

**Signals to search:** `getClaim`, `familyId`, `sponsorId`, `accessLevel`, `getParameter(`, `@RequestParam`, `@PathVariable`

<!-- answer R-07 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-08: The session created after token validation is bound to that identity, and the session id is regenerated at token login

**Type:** check  
**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`; and C-09 (Application type) = `portlet` and C-22 (Session model after token validation) is one of `creates-http-session`, `both`, `unknown`  
**Severity if finding:** medium  
**STIG area:** Session management: session fixation and binding  
**Refs:** Q5 (sections and question numbers of the handoff document, not files in this project)

**How:** Find where the session is created after validation. Confirm the session id is changed at that moment (invalidate and recreate, or changeSessionId). Confirm that presenting a different token on a later request either is ignored or replaces the whole session; it must not update some attributes and leave others. Record what the session stores.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Validation success branch, session creation, attribute writes, later token handling.

**Why no more findings must state:** Why a second token cannot mix identities within one session.

**Signals to search:** `getSession(true)`, `invalidate(`, `changeSessionId`, `setAttribute(`

<!-- answer R-08 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-09: Token minting copies identity only from the authenticated session; no request parameter influences the claims; expiry is short

**Type:** check  
**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`; and C-09 (Application type) = `portal`  
**Severity if finding:** high  
**STIG area:** Identification and authentication: token issuance  
**Refs:** Q1, Q2 (sections and question numbers of the handoff document, not files in this project)

**How:** Open the minting code from C-25. Every claim value must come from the server-side identity holder. Any claim populated from a request parameter, including the target portlet id if it is used as audience, is a way to shape the token. Record the expiry.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Each claim's source, the expiry, the signing key source.

**Why no more findings must state:** For each claim, why its value cannot be influenced by the caller.

**Signals to search:** `claim(`, `setClaims`, `setExpiration`, `setAudience`, `getParameter(`

<!-- answer R-09 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-10: The token secret is hardcoded in source: record it

**Type:** check  
**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`; and C-20 (Secret or key storage) = `hardcoded`  
**Severity if finding:** high  
**STIG area:** Cryptographic key management  
**Refs:** Q4 (sections and question numbers of the handoff document, not files in this project)

**How:** Anyone with read access to the repository can mint tokens for every portlet that shares the secret. Record the location. The value itself must not be copied into this document.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** The constant and everything that reads it.

**Why no more findings must state:** Not applicable: this item is a recorded finding.

**Signals to search:** `SECRET`, `secret =`, `SecretKeySpec(`

<!-- answer R-10 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-11: No framing restriction: any origin can frame this application

**Type:** check  
**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`; and C-24 (Framing protection) = `none-found`  
**Severity if finding:** low  
**STIG area:** Session management: clickjacking protection  
**Refs:** Q6 (sections and question numbers of the handoff document, not files in this project)

**How:** Confirm no X-Frame-Options or frame-ancestors header is set by a filter, by Spring Security, or by the shared library. For a portlet, the correct value allows the portal origin only. Record it.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Header-setting filters and configuration.

**Why no more findings must state:** Every header-writing location searched.

**Signals to search:** `X-Frame-Options`, `frame-ancestors`, `addHeader(`, `setHeader(`

<!-- answer R-11 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-12: The portlet URL the token is attached to comes from fixed configuration, and any postMessage names the portlet origin explicitly

**Type:** check  
**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`; and C-09 (Application type) = `portal`  
**Severity if finding:** high  
**STIG area:** Session management: credential exposure to untrusted origins  
**Refs:** Q1, 6.6 (sections and question numbers of the handoff document, not files in this project)

**How:** Find where the portal builds the iframe src, the redirect, or the postMessage target that carries the token. The destination must come from a fixed configuration list of portlet URLs, never from a request parameter, route parameter, or anything the browser sent (for example ?portlet=, ?returnUrl=, ?redirect=). A postMessage must name the portlet origin, never "*". With a fleet-shared secret, a portal that attaches the token to an attacker-chosen destination hands out a token valid for every portlet.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Where the destination is chosen, its source, where the token is attached, the postMessage call and its targetOrigin.

**Why no more findings must state:** Every code path that attaches the token to a destination and why the destination cannot be influenced by the caller.

**Signals to search:** `bypassSecurityTrustResourceUrl`, `[src]`, `postMessage(`, `'*'`, `queryParams`, `returnUrl`, `redirect`, `portletUrl`, `ActivatedRoute`

<!-- answer R-12 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### F-02: Issues found in this area

**Type:** table  
**Applies when:** C-09 (Application type) is one of `portal`, `portlet`, `unknown`  
**Refs:** 3, 4 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per issue noticed while working through this topic that no item above recorded. Cite the location as file:line or as a URL. Name the item that led you to it where there is one. Severity: high when a caller can reach another user's data with no check in the way; medium when exposure needs a second condition; low for hardening; not sure otherwise. Leave the table empty if nothing was noticed.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Columns:**

- Location (file:line or URL)
- What is wrong
- Related item
- Severity (exactly one of: `high`, `medium`, `low`, `not sure`, lowercase, no backticks)

**Optional:** an empty table is acceptable here.

<!-- answer F-02 -->
Status:
Reason:
| Location (file:line or URL) | What is wrong | Related item | Severity |
|---|---|---|---|
|   |   |   |   |

Notes:
<!-- /answer -->

## 3. What can be reached without logging in

_Reminder for this topic: one item at a time. Research it, write its block, check it off in your task list, then take the next; never fill several blocks in one step. Answer from the code only. Never fill a field with a placeholder, a guessed citation, or an invented Searched record to satisfy the linter. If an item cannot be answered from what you can read, ask the developer before moving on; nothing is marked `unable` without asking first, and the block records what was asked and answered in an `Asked:` line._

Paths that skip authentication, what is behind them, and whether the exclusions themselves can be bent.

### C-26: Filter exclusions and public paths

**Type:** table  
**Applies when:** always  
**Refs:** 6.3, Q17, Q18 (sections and question numbers of the handoff document, not files in this project)

**How:** For each filter in C-11, read its doFilter, shouldNotFilter, or init-params for path tests that skip authentication. Include Spring Security permitAll and web.ignoring rules. Also include any url-pattern gap: a servlet mapping that no authentication filter mapping covers is an exclusion even though nobody wrote it as one. Record how the match is performed, because prefix and regex matches are the ones that can be bypassed with path tricks.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `shouldNotFilter`, `excludeUrlPatterns`, `exclude`, `permitAll`, `web.ignoring`, `antMatchers`, `requestMatchers`, `startsWith(`, `matches(`, `endsWith(`, `contains(`, `/ws/public`, `appmonitor.status`, `/public`, `/static`, `/vendor`, `/assets`, `<url-pattern>`

**Columns:**

- Pattern
- Matching (exactly one of: `exact`, `prefix`, `suffix`, `regex`, `servlet-mapping gap`, `other`, lowercase, no backticks)
- Defined at (file:line)
- Which filters skip it

**If empty:** An empty table must be justified in Searched: name each filter from C-11 and state that its path tests were read.

<!-- answer C-26 -->
| Pattern | Matching | Defined at (file:line) | Which filters skip it |
|---|---|---|---|
|   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-27: Everything reachable under the exclusions

**Type:** table  
**Applies when:** always  
**Refs:** 6.3, Q17 (sections and question numbers of the handoff document, not files in this project)

**How:** For each pattern in C-26, find every handler, servlet, JSF page, or static directory whose mapping falls under it. One row per handler. Static directories count: list anything under them that is not plain frontend assets, such as configuration, source maps, backups, or documents. Say whether the handler returns data and what data.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `@RequestMapping`, `@GetMapping`, `@Path(`, `<servlet-mapping>`, `src/main/webapp`, `src/main/resources/static`, `src/main/resources/public`

**Columns:**

- URL
- Handler class#method or path
- Returns data (exactly one of: `yes`, `no`, lowercase, no backticks)
- What it returns

**If empty:** An empty table must be justified in Searched: name each C-26 pattern and what was found under it.

<!-- answer C-27 -->
| URL | Handler class#method or path | Returns data | What it returns |
|---|---|---|---|
|   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### R-13: Every servlet and controller mapping is covered by an authentication filter mapping

**Type:** check  
**Applies when:** always  
**Severity if finding:** high  
**STIG area:** Access control: authentication bypass  
**Refs:** 6.3, Q18 (sections and question numbers of the handoff document, not files in this project)

**How:** List every url-pattern from web.xml servlets, every controller path prefix, the JSF FacesServlet mapping, and any error-page or welcome-file target. Compare against the url-patterns of the authentication filter mappings in C-11. A mapping the filter does not cover is a public endpoint that nobody declared. Watch for /* against /ws/* differences and for dispatcher types: a filter mapped without FORWARD or ERROR does not run on forwarded requests. For container-managed security, a <security-constraint> that lists <http-method> elements protects only those verbs and leaves every other verb unauthenticated on those patterns; require either no http-method list or <http-method-omission>.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** web.xml servlet and filter mappings, dispatcher elements, controller base paths.

**Why no more findings must state:** The full list of mappings compared, and why each is covered.

**Signals to search:** `<servlet-mapping>`, `<filter-mapping>`, `<dispatcher>`, `<error-page>`, `<welcome-file>`, `@RequestMapping`, `<security-constraint>`, `<http-method>`, `<http-method-omission>`, `<auth-constraint>`

<!-- answer R-13 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-14: This exclusion pattern cannot be bent to reach a protected path

**Type:** check, one answer block per row of C-26 (Filter exclusions and public paths)  
**Applies when:** C-26 has at least one row  
**Severity if finding:** high  
**STIG area:** Access control: authentication bypass  
**Refs:** Q18 (sections and question numbers of the handoff document, not files in this project)

**How:** Read the code that performs the match. A prefix, regex, or contains match on the raw request URI is the risky case. Consider: a dot-dot segment after the public prefix, a double slash, an encoded slash or dot, a trailing dot or semicolon matrix parameter such as ;jsessionid=x, case differences, and a suffix such as .json. Check whether the match uses getRequestURI (raw) or getServletPath (normalised), and whether the container normalises before the filter runs. An exact match on the normalised path passes. For a row whose matching is a servlet-mapping gap there is nothing to bend: the gap itself is the finding, so record it here with the uncovered mapping and refer to R-13. For a Spring Security row, the match is the framework's: check antMatchers versus mvcMatchers versus MVC's own matching (suffix patterns and trailing slashes were matched by default on Spring 5.2 and earlier, so /ws/private.json or /ws/private/ can reach a handler an antMatcher on /ws/private did not cover), whether web.ignoring() drops the whole chain for the pattern, and whether the Spring Security version predates StrictHttpFirewall (4.2.4). Cite the Spring and Spring Security versions from the POM.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Filter doFilter, the path value used, the comparison, and what happens on a match.

**Why no more findings must state:** For each of the bypass shapes above, why it cannot reach a protected handler with this matching code.

**Signals to search:** `startsWith(`, `matches(`, `contains(`, `getRequestURI`, `getServletPath`, `getPathInfo`, `shouldNotFilter`, `antMatchers`, `mvcMatchers`, `regexMatchers`, `requestMatchers`, `web.ignoring`, `HttpFirewall`, `StrictHttpFirewall`, `useSuffixPatternMatch`, `useTrailingSlashMatch`

Repeat the block below once per row of C-26, in the same order as your C-26 table above: edit the `row=1` block for the first such row and add copies numbered `row=2`, `row=3`, and so on. Put the row's path, handler, or name on the first line of Location. If that table has no matching rows, write `Status: na` with the reason in the `row=1` block.

<!-- answer R-14 row=1 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-15: This public endpoint returns no protected data and accepts no record identifier

**Type:** check, one answer block per row of C-27 (Everything reachable under the exclusions)  
**Applies when:** C-27 has at least one row  
**Severity if finding:** high  
**STIG area:** Access control: unauthenticated access to protected data  
**Refs:** 6.3, Q17 (sections and question numbers of the handoff document, not files in this project)

**How:** Open the handler behind this URL and follow every code path to what it writes to the response. List every parameter, path segment, header, or cookie it reads. A health check that returns a status string passes. Anything that returns a record, a document, or a list, or that looks a record up by an identifier, is a finding regardless of how obscure the URL is. For a static-directory row, pass when the directory holds only frontend assets (cite the listing) and finding when it holds anything else.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** URL, servlet or controller method, every service call, every data source, response body.

**Why no more findings must state:** Every code path in the handler and in what it calls that writes to the response, and for each why it cannot return record data.

**Signals to search:** `getParameter(`, `@PathVariable`, `@RequestParam`, `@QueryParam`, `getHeader(`, `getOutputStream(`, `@ResponseBody`

Repeat the block below once per row of C-27, in the same order as your C-27 table above: edit the `row=1` block for the first such row and add copies numbered `row=2`, `row=3`, and so on. Put the row's path, handler, or name on the first line of Location. If that table has no matching rows, write `Status: na` with the reason in the `row=1` block.

<!-- answer R-15 row=1 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### F-03: Issues found in this area

**Type:** table  
**Applies when:** always  
**Refs:** 3, 4 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per issue noticed while working through this topic that no item above recorded. Cite the location as file:line or as a URL. Name the item that led you to it where there is one. Severity: high when a caller can reach another user's data with no check in the way; medium when exposure needs a second condition; low for hardening; not sure otherwise. Leave the table empty if nothing was noticed.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Columns:**

- Location (file:line or URL)
- What is wrong
- Related item
- Severity (exactly one of: `high`, `medium`, `low`, `not sure`, lowercase, no backticks)

**Optional:** an empty table is acceptable here.

<!-- answer F-03 -->
| Location (file:line or URL) | What is wrong | Related item | Severity |
|---|---|---|---|
|   |   |   |   |

Notes:
<!-- /answer -->

## 4. Who is allowed to see what

_Reminder for this topic: one item at a time. Research it, write its block, check it off in your task list, then take the next; never fill several blocks in one step. Answer from the code only. Never fill a field with a placeholder, a guessed citation, or an invented Searched record to satisfy the linter. If an item cannot be answered from what you can read, ask the developer before moving on; nothing is marked `unable` without asking first, and the block records what was asked and answered in an `Asked:` line._

State in one place what "allowed to see this record" means here, and where that rule is enforced.

### C-28: Ownership model

**Type:** single choice  
**Applies when:** always  
**Refs:** 6.7, 8.2 (sections and question numbers of the handoff document, not files in this project)

**How:** State what 'allowed to see this record' means for this application. Beneficiary applications: the caller's family. Operator applications: access levels, a selected site, or both. Derive it from the identifiers carried in C-12 and the claims in C-18, then write the rule as one sentence in Detail.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `familyId`, `sponsorId`, `personId`, `accessLevel`, `siteId`, `role`, `permission`, `isInFamily`, `canAccess`

**Options:**

- `beneficiary-family`: Beneficiary: own family only
- `operator-access-level`: Operator: by access level
- `operator-site`: Operator: by selected site
- `mixed`: Mixed (describe in Detail)
- `none-found`: No ownership rule found in code
- `unknown`: Unknown

<!-- answer C-28 -->
Value:
Detail (In one sentence: what does 'allowed to see this record' mean in this application?):
Evidence:
Searched:
<!-- /answer -->

### C-29: Beneficiary scope: which people the logged-in beneficiary may see or change

**Type:** free text  
**Applies when:** C-08 (Audience: beneficiary self-service or operator) is one of `beneficiary`, `both`, `unknown`  
**Refs:** 6.7, Q8 (sections and question numbers of the handoff document, not files in this project)

**How:** State which people a logged-in beneficiary can reach: only themselves, their dependents, their sponsor, the whole family, or something else depending on role (sponsor versus dependent). Cite where that set is built (login, session attribute, per-request lookup, token claim) and where it is consulted.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `familyId`, `sponsorId`, `personId`, `dependents`, `familyMembers`, `getFamily`, `isSponsor`

<!-- answer C-29 -->
Status:
Reason:
Value:
Evidence:
Searched:
<!-- /answer -->

### C-30: Operator access levels and site selection

**Type:** free text  
**Applies when:** C-08 (Audience: beneficiary self-service or operator) is one of `operator`, `both`, `unknown`  
**Refs:** 6.3, Q9, Q10 (sections and question numbers of the handoff document, not files in this project)

**How:** List the access levels or roles that appear in code and what each permits. Describe how a site is selected (for example /selectsite), where the selection is stored, and how later requests are constrained to that site on the server side.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `/selectsite`, `selectedSite`, `siteId`, `accessLevel`, `AccessLevel`, `Role`, `hasRole`

<!-- answer C-30 -->
Status:
Reason:
Value:
Evidence:
Searched:
<!-- /answer -->

### C-31: Application-level authorization check present

**Type:** yes/no  
**Applies when:** always  
**Refs:** 6.3, Q9, 2 (sections and question numbers of the handoff document, not files in this project)

**How:** An application-level check verifies that the caller may use this application at all, for example OperatorAuthorizationFilter checking an App ID. It is not an object-level check. Record the class, the application id, and where it is configured.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `OperatorAuthorizationFilter`, `appId`, `APP_ID`, `applicationId`, `740`, `hasAccessToApp`

<!-- answer C-31 -->
Value:
Detail (Class, application id, and configuration location):
Evidence:
Searched:
<!-- /answer -->

### C-32: How the caller's scope is established

**Type:** single choice  
**Applies when:** always  
**Refs:** Q8 (sections and question numbers of the handoff document, not files in this project)

**How:** Where does the set of records the caller may see come from? A roster fetched at login and kept in the session, a lookup on every request, claims in the token, or nowhere.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `getFamily`, `familyMembers`, `roster`, `setAttribute(`, `getClaim`, `loadScope`

**Options:**

- `roster-in-session`: Roster fetched at login and stored in the session
- `per-request-lookup`: Looked up on every request
- `jwt-claims`: Carried in token claims
- `not-established`: Not established anywhere
- `unknown`: Unknown

<!-- answer C-32 -->
Value:
Detail (Class and method that establishes it):
Evidence:
Searched:
<!-- /answer -->

### C-33: Object-level scope check pattern

**Type:** single choice  
**Applies when:** always  
**Refs:** 6.7, Q8, 8.5 (sections and question numbers of the handoff document, not files in this project)

**How:** Search for the code that compares a requested record to the caller's scope. A single canonical helper is the best case. Ad hoc means each endpoint does its own comparison. Annotation-based means @PreAuthorize or a custom aspect whose expression names the record or a permission evaluator (for example @PreAuthorize("@scope.canSee(#personId)")). Role annotations do not qualify: hasRole, @Secured, and @RolesAllowed express who may use the application, which C-31 already records, not whether this caller may see this record. None found means no comparison exists anywhere, which is itself the incident shape: application-level check present, object-level check absent. Do not answer unknown here; the search record decides between per-endpoint and none-found.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `isInFamily`, `inFamily`, `isFamilyMember`, `canAccess`, `hasAccess`, `checkAccess`, `authorize`, `assertOwner`, `belongsTo`, `verifyAccess`, `@PreAuthorize`, `@PostAuthorize`, `PermissionEvaluator`, `@Aspect`

**Options:**

- `canonical-helper`: Single canonical helper, for example isInMyFamily(personId)
- `per-endpoint`: Ad hoc per endpoint
- `annotation`: Annotation or aspect based
- `none-found`: None found
- `unknown`: Unknown

<!-- answer C-33 -->
Value:
Detail (Helper name and location, or examples of the ad hoc pattern):
Evidence:
Searched:
<!-- /answer -->

### R-16: The operator's selected site and access level constrain every data request on the server, not only at selection time

**Type:** check  
**Applies when:** C-08 (Audience: beneficiary self-service or operator) is one of `operator`, `both`, `unknown`  
**Severity if finding:** high  
**STIG area:** Access control: authorization to specific data objects  
**Refs:** 6.3, Q9, Q10 (sections and question numbers of the handoff document, not files in this project)

**How:** Find where the selection made through /selectsite (or its equivalent) is stored: session attribute or token claim. Then find every data path (query, CUF request, service call) and where it reads that stored selection into the request. A data path that takes a site id from the client instead, or that never consults the selection, lets an operator with access to site A read site B's records. Do the same for access level where it gates record categories rather than sites.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Site selection handler, where the selection is stored, each data path and the line that applies the selection.

**Why no more findings must state:** Every data path and where it applies the selected site or access level.

**Signals to search:** `/selectsite`, `selectedSite`, `siteId`, `accessLevel`, `getAttribute(`, `getParameter("siteId`

<!-- answer R-16 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### F-04: Issues found in this area

**Type:** table  
**Applies when:** always  
**Refs:** 3, 4 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per issue noticed while working through this topic that no item above recorded. Cite the location as file:line or as a URL. Name the item that led you to it where there is one. Severity: high when a caller can reach another user's data with no check in the way; medium when exposure needs a second condition; low for hardening; not sure otherwise. Leave the table empty if nothing was noticed.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Columns:**

- Location (file:line or URL)
- What is wrong
- Related item
- Severity (exactly one of: `high`, `medium`, `low`, `not sure`, lowercase, no backticks)

**Optional:** an empty table is acceptable here.

<!-- answer F-04 -->
| Location (file:line or URL) | What is wrong | Related item | Severity |
|---|---|---|---|
|   |   |   |   |

Notes:
<!-- /answer -->

## 5. Reading records by identifier

_Reminder for this topic: one item at a time. Research it, write its block, check it off in your task list, then take the next; never fill several blocks in one step. Answer from the code only. Never fill a field with a placeholder, a guessed citation, or an invented Searched record to satisfy the linter. If an item cannot be answered from what you can read, ask the developer before moving on; nothing is marked `unable` without asking first, and the block records what was asked and answered in an `Asked:` line._

The incident class. For every identifier a caller can supply, find the line that compares it with the caller's scope before data comes back.

### C-34: HTTP entry point types

**Type:** multiple choice  
**Applies when:** always  
**Refs:** Q12 (sections and question numbers of the handoff document, not files in this project)

**How:** Select every mechanism through which an HTTP request reaches application code. JSF action methods count as entry points. Spring Boot actuator is out of scope for this review but should be noted.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `@RequestMapping`, `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`, `@PatchMapping`, `@Path(`, `@GET`, `@POST`, `<servlet>`, `@WebServlet`, `action="#{`, `actionListener`, `@ServerEndpoint`, `management.endpoints`

**Options:**

- `spring-mvc`: Spring MVC controllers
- `jaxrs`: JAX-RS resources
- `jsf-actions`: JSF managed-bean actions
- `servlets`: Raw servlets
- `websocket`: WebSocket endpoints
- `actuator`: Spring Boot actuator (note only)
- `other`: Other (describe in Detail)

<!-- answer C-34 -->
Value:
Detail (Anything selected as Other):
Evidence:
Searched:
<!-- /answer -->

### C-35: Endpoint inventory

**Type:** table  
**Applies when:** always  
**Refs:** Q12, Q13, 8.3 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per handler method reachable over HTTP, from every type selected in C-34, and one row per method where a handler serves several. Include JSF views and their action methods (the .xhtml URL plus page#method), plain servlets and their url-patterns, WebSocket endpoints, health and status endpoints, error pages, the frontend entry page, and each static root as a single row; an endpoint you consider harmless still gets a row. The Full URL column holds the URL as a browser would send it: context root, then the servlet mapping, then the class-level mapping, then the method mapping, with path variables in braces, for example /benefits/ws/person/{personId}; add the query parameters that carry identifiers, for example /benefits/ws/public/lookup?personId=. List every identifier the caller can supply in the path, query string, body, or headers, and say what each identifies. Record whether the identifier comes from the request or from the session or token: an id that comes only from the session cannot be tampered with, an id from the request must be checked. This table is the application's endpoint list and drives the per-endpoint trace items in the review: an endpoint missing here is an endpoint never reviewed, and the result file carries these rows as its endpoints list.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `@RequestMapping`, `@GetMapping`, `@PostMapping`, `@PathVariable`, `@RequestParam`, `@RequestBody`, `@Path(`, `@PathParam`, `@QueryParam`, `<url-pattern>`, `getParameter(`, `action="#{`, `f:viewParam`, `@RequestHeader`, `@CookieValue`, `@MatrixVariable`, `@HeaderParam`, `@CookieParam`, `@FormParam`, `getHeader(`, `getCookies(`

**Columns:**

- HTTP method(s)
- Full URL (context root + servlet mapping + class + method)
- Handler class#method
- Public (under a C-26 exclusion) (exactly one of: `yes`, `no`, lowercase, no backticks)
- Identifier parameters (name = what it identifies)
- Identifier source (exactly one of: `request`, `session or token`, `both`, `none`, lowercase, no backticks)
- Returns data (exactly one of: `yes`, `no`, lowercase, no backticks)
- Writes or deletes (exactly one of: `yes`, `no`, lowercase, no backticks)

**If empty:** An empty table is only valid for an application with no HTTP handlers. Searched must list every annotation and descriptor searched.

<!-- answer C-35 -->
| HTTP method(s) | Full URL (context root + servlet mapping + class + method) | Handler class#method | Public (under a C-26 exclusion) | Identifier parameters (name = what it identifies) | Identifier source | Returns data | Writes or deletes |
|---|---|---|---|---|---|---|---|
|   |   |   |   |   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-36: Identifier kinds appearing in requests

**Type:** multiple choice  
**Applies when:** always  
**Refs:** 2, Q13 (sections and question numbers of the handoff document, not files in this project)

**How:** From the C-35 identifier column, classify the identifiers. Sequential numeric database keys are the easiest to enumerate; note the format in Detail.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `personId`, `sponsorId`, `familyId`, `documentId`, `Long id`, `int id`, `UUID`, `Base64`

**Options:**

- `person-id`: Person id
- `sponsor-id`: Sponsor id
- `family-id`: Family id
- `document-id`: Document or file id
- `db-primary-key`: Database primary key
- `uuid`: UUID or GUID
- `opaque-token`: Opaque or encoded token
- `composite`: Composite key
- `other`: Other (describe in Detail)
- `none`: No request-supplied identifiers (every record is chosen from the session or token)

<!-- answer C-36 -->
Value:
Detail (Format notes: sequential numeric, guessable, base64 of an id, and so on):
Evidence:
Searched:
<!-- /answer -->

### R-17: The request-supplied identifier is checked against the caller's scope before any data for it is returned

**Type:** check, one answer block per row of C-35 (Endpoint inventory)  
**Applies when:** C-35 has at least one row  
**Severity if finding:** high  
**STIG area:** Access control: authorization to specific data objects  
**Refs:** 2, 8.3, 8.5, Q13 (sections and question numbers of the handoff document, not files in this project)

**How:** Start at the parameter. Follow it into the handler, through every service method, to every data access (CUF call, query, procedure, file read), and back to the response. Name the exact line where the identifier, or the record it resolved to, is compared with the caller's family, site, or access level. If the only checks on the way are that the caller is logged in and may use this application, there is no object-level check: that is the incident shape and a finding. A check that happens only in the Angular code does not count. A check that runs after the data has been written to the response does not count. A row whose identifier comes from the session or token rather than the request is a pass citing the line that reads it from the session, never na; na on this item is only for a row that is not a data endpoint at all.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Parameter, handler method, each service call, each data access, the comparison line, the response.

**Why no more findings must state:** Every path from this handler to a data source, and for each either the comparison line or why that path cannot return another caller's data.

**Signals to search:** `@PathVariable`, `@RequestParam`, `@RequestBody`, `@PathParam`, `getParameter(`, `isInFamily`, `canAccess`, `hasAccess`, `findById`, `Cuf`

Repeat the block below once per row of C-35, in the same order as your C-35 table above: edit the `row=1` block for the first such row and add copies numbered `row=2`, `row=3`, and so on. Put the row's path, handler, or name on the first line of Location. If that table has no matching rows, write `Status: na` with the reason in the `row=1` block.

<!-- answer R-17 row=1 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-18: Every endpoint in C-35 goes through the canonical scope helper or a record-level annotation; any that bypass it are listed

**Type:** check  
**Applies when:** C-33 (Object-level scope check pattern) is one of `canonical-helper`, `annotation`  
**Severity if finding:** high  
**STIG area:** Access control: authorization to specific data objects  
**Refs:** Q8 (sections and question numbers of the handoff document, not files in this project)

**How:** Helper case: find every call site of the helper named in C-33 and compare against the handlers in C-35. An endpoint that reaches a data source without passing through the helper, or that calls it with an identifier other than the one it uses for data access, bypasses it. Annotation case: first cite the enablement without which the annotations are ignored (@EnableGlobalMethodSecurity(prePostEnabled = true), @EnableMethodSecurity, or <global-method-security>); then list each C-35 handler with its annotation line; then confirm the expression names the record or calls a permission evaluator rather than a role. A handler with no annotation, or an expression that only checks a role, bypasses the check.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Helper or annotation enablement, C-35 handlers, the call or annotation at each, the identifier or expression used.

**Why no more findings must state:** The list of C-35 handlers with the helper call line or annotation line for each.

**Signals to search:** `@EnableGlobalMethodSecurity`, `prePostEnabled`, `@EnableMethodSecurity`, `global-method-security`, `@PreAuthorize`, `hasPermission`, `PermissionEvaluator`

<!-- answer R-18 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-19: No object-level check exists anywhere in this application: record it as a finding in its own right

**Type:** check  
**Applies when:** C-33 (Object-level scope check pattern) = `none-found`  
**Severity if finding:** high  
**STIG area:** Access control: authorization to specific data objects  
**Refs:** 2, 8.5 (sections and question numbers of the handoff document, not files in this project)

**How:** C-33 found no code that compares a requested record with the caller's scope, and R-17 above has enumerated the exposure per endpoint. Record the absence itself as a finding covering the whole application, citing the C-33 search record and the R-17 rows that confirm it.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** The C-33 search record and the R-17 rows.

**Why no more findings must state:** Not applicable: this item is a recorded finding.

<!-- answer R-19 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-20: Collection and search endpoints constrain results to the caller's scope in the query or service, not in the frontend

**Type:** check  
**Applies when:** always  
**Severity if finding:** high  
**STIG area:** Access control: authorization to specific data objects  
**Refs:** 7 (sections and question numbers of the handoff document, not files in this project)

**How:** For every endpoint that returns a list or search result, find where the family, site, or access-level constraint is applied. It must be part of the query, the CUF request, or a server-side filter on the result before serialization. A list that is fetched whole and filtered in Angular is a finding: the full list is in the response.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** List endpoint, query or service call, the constraint, the serialized result.

**Why no more findings must state:** Every list-returning endpoint and the constraint line for each.

**Signals to search:** `findAll`, `List<`, `search`, `filter(`, `stream()`, `@ResponseBody`

<!-- answer R-20 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### C-37: Response serialization style

**Type:** single choice  
**Applies when:** always  
**Refs:** 7, Q20 (sections and question numbers of the handoff document, not files in this project)

**How:** Look at what @ResponseBody and JAX-RS methods return. Entities or CUF response objects serialised wholesale expose every field they carry. A class named Dto proves nothing by itself: MapStruct, ModelMapper, and BeanUtils.copyProperties copy every same-named field, so a DTO mapped one to one from the CUF record carries the same exposure. Record the style, and in Detail name the mapping mechanism and any @JsonIgnore, @JsonView, or access-restricted properties in use. The check that follows examines the fields regardless of the answer here.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `@ResponseBody`, `ResponseEntity<`, `@JsonIgnore`, `@JsonView`, `@JsonProperty`, `@JsonIgnoreProperties`, `MapStruct`, `ModelMapper`, `BeanUtils.copyProperties`, `Dto`, `DTO`

**Options:**

- `entities-wholesale`: Entities or CUF objects serialized wholesale
- `dto-mapped`: DTOs mapped from domain objects
- `mixed`: Mixed (describe in Detail)
- `unknown`: Unknown

<!-- answer C-37 -->
Value:
Detail (Examples, and any @JsonIgnore or @JsonView usage):
Evidence:
Searched:
<!-- /answer -->

### R-21: Responses carry no fields the UI never shows

**Type:** check  
**Applies when:** always  
**Severity if finding:** medium  
**STIG area:** Access control: information disclosure  
**Refs:** 7, Q20 (sections and question numbers of the handoff document, not files in this project)

**How:** For each data-returning endpoint, list the fields of the serialised class as Jackson sees them, including nested objects and collections such as other family members, whatever the class is named. Compare with what the Angular component reads. Fields present in the response but never shown, especially other people's data, SSNs, internal flags, and audit fields, are a finding. A DTO passes only when its serialised fields are all shown or needed by the screen; a DTO filled by MapStruct, ModelMapper, or BeanUtils.copyProperties from the full record usually is not. Check @JsonIgnore, @JsonView, and explicit mapping where they exist.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Endpoint, returned class, its serialized fields, the consuming component.

**Why no more findings must state:** Every data-returning endpoint and either its DTO or the field comparison.

**Signals to search:** `@ResponseBody`, `ResponseEntity<`, `@JsonIgnore`, `@JsonView`, `Dto`

<!-- answer R-21 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### F-05: Issues found in this area

**Type:** table  
**Applies when:** always  
**Refs:** 3, 4 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per issue noticed while working through this topic that no item above recorded. Cite the location as file:line or as a URL. Name the item that led you to it where there is one. Severity: high when a caller can reach another user's data with no check in the way; medium when exposure needs a second condition; low for hardening; not sure otherwise. Leave the table empty if nothing was noticed.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Columns:**

- Location (file:line or URL)
- What is wrong
- Related item
- Severity (exactly one of: `high`, `medium`, `low`, `not sure`, lowercase, no backticks)

**Optional:** an empty table is acceptable here.

<!-- answer F-05 -->
| Location (file:line or URL) | What is wrong | Related item | Severity |
|---|---|---|---|
|   |   |   |   |

Notes:
<!-- /answer -->

## 6. Changing records

_Reminder for this topic: one item at a time. Research it, write its block, check it off in your task list, then take the next; never fill several blocks in one step. Answer from the code only. Never fill a field with a placeholder, a guessed citation, or an invented Searched record to satisfy the linter. If an item cannot be answered from what you can read, ask the developer before moving on; nothing is marked `unable` without asking first, and the block records what was asked and answered in an `Asked:` line._

The write-side twin: updating or deleting by id, setting fields the UI never exposes, and uploads.

### C-38: Request binding styles present

**Type:** multiple choice  
**Applies when:** always  
**Refs:** 7, Q21, 8.7 (sections and question numbers of the handoff document, not files in this project)

**How:** How request bodies and form fields become Java objects. Binding straight onto a domain, entity, or CUF object lets the client set any field the object has, including ones the UI never shows. A class named Dto is not evidence of anything: what matters is which fields are settable on the class the request lands on. Record the style per handler in Detail.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `@RequestBody`, `@ModelAttribute`, `@BeanParam`, `@FormParam`, `getParameter(`, `<h:inputText`, `value="#{`, `@Consumes(`, `MediaType.APPLICATION_JSON`, `@PUT`, `@POST`

**Options:**

- `requestbody-domain`: @RequestBody onto a domain, entity, or CUF object
- `requestbody-dto`: @RequestBody onto a DTO or command object
- `modelattribute`: @ModelAttribute form binding
- `beanparam`: JAX-RS @BeanParam or @FormParam
- `jaxrs-entity`: JAX-RS entity parameter onto a domain or CUF object (@Consumes JSON, @PUT/@POST)
- `jsf-properties`: JSF managed-bean properties bound from forms
- `getparameter`: Manual request.getParameter
- `none-found`: None found (no writes)

<!-- answer C-38 -->
Value:
Detail (Examples with file:line):
Evidence:
Searched:
<!-- /answer -->

### C-39: Binding allow-list mechanisms

**Type:** multiple choice  
**Applies when:** always  
**Refs:** Q21 (sections and question numbers of the handoff document, not files in this project)

**How:** Anything that limits which fields a request can set. Each mechanism covers one binding style only: @InitBinder allowed or disallowed fields apply to @ModelAttribute, form, and query binding and never to @RequestBody, which Jackson deserialises without consulting the binder. For @RequestBody and JAX-RS entity parameters only Jackson controls apply: @JsonProperty(access = READ_ONLY), @JsonIgnore, @JsonIgnoreProperties, or a DTO that lacks the field. @JsonIgnoreProperties(allowSetters = true) re-enables deserialisation of the ignored field, so it is not a control. Record where each is applied, whether it is global or per controller, and which binding style it covers.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `@InitBinder`, `setAllowedFields`, `setDisallowedFields`, `READ_ONLY`, `allowGetters`, `allowSetters`, `@JsonIgnoreProperties`, `@JsonIgnore`

**Options:**

- `initbinder-allowed`: @InitBinder setAllowedFields (covers @ModelAttribute, form, and query binding only)
- `initbinder-disallowed`: @InitBinder setDisallowedFields (same coverage)
- `jsonignore-setters`: @JsonIgnoreProperties or @JsonProperty(access = READ_ONLY) without allowSetters (covers @RequestBody and JAX-RS entities)
- `dto-only`: DTOs carrying only the intended fields
- `none-found`: None found

<!-- answer C-39 -->
Value:
Detail (Where applied, global or per controller, and which binding style each mechanism covers):
Evidence:
Searched:
<!-- /answer -->

### C-40: Constraints the frontend enforces on submitted data

**Type:** table  
**Applies when:** always  
**STIG area:** Input validation: server-side enforcement  
**Refs:** 7, Q21 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per constraint the client applies to a value a user can submit: the allowed values of a dropdown, radio group, or checkbox set; a required field; a maximum or minimum length; a format or pattern; a numeric or date range; a field rendered disabled or read-only that is still part of the submitted object; and an action or field shown only to some users. Read the templates and the form definitions, not only the validators: an attribute on an input and a hard-coded list of options are constraints too. For each, record where the client enforces it and where the server enforces the same thing, or none. Server-side enforcement means the request is rejected or the value is discarded before it is used or stored: bean validation with a rejection path, an explicit comparison, enum parsing that throws, or a switch whose default rejects. Bean validation that cannot reject does not count, so check it: an annotated parameter with a BindingResult or Errors parameter beside it suppresses the exception, and the handler must then inspect it. If the frontend is not in this project, say so in Searched and list the constraints the API contract states instead.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `Validators.required`, `Validators.maxLength`, `Validators.minLength`, `Validators.pattern`, `Validators.min`, `Validators.max`, `FormBuilder`, `formControl`, `formControlName`, `ngModel`, `required`, `maxlength`, `minlength`, `pattern=`, `min=`, `max=`, `[disabled]`, `readonly`, `*ngIf`, `ng-required`, `<select`, `<option`, `h:selectOneMenu`, `f:validate`

**Columns:**

- Field or action
- Kind of constraint (exactly one of: `allowed-values`, `required`, `length`, `pattern`, `range`, `disabled-or-readonly`, `hidden-action`, `other`, lowercase, no backticks)
- Enforced in the client at (file:line)
- Enforced on the server at (file:line), or none

**If empty:** An empty table means the client places no constraint at all on what it submits, which is rare outside an API-only application. Searched must name the template and form files you read and the validator names and input attributes you searched for.

<!-- answer C-40 -->
| Field or action | Kind of constraint | Enforced in the client at (file:line) | Enforced on the server at (file:line), or none |
|---|---|---|---|
|   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### R-22: Update or delete by identifier verifies the record belongs to the caller before writing

**Type:** check, one answer block per row of C-35 (Endpoint inventory) where mutates = `yes`  
**Applies when:** C-35 has at least one row where mutates = `yes`  
**Severity if finding:** high  
**STIG area:** Access control: authorization to specific data objects  
**Refs:** 7, 8.7 (sections and question numbers of the handoff document, not files in this project)

**How:** Same trace as R-17 for the write path: the identifier that selects the record to change must be compared with the caller's scope before the write. Check both the identifier in the URL and any identifiers inside the request body, since the body can name a different record than the URL.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Identifier in URL and body, handler, service, the comparison line, the write.

**Why no more findings must state:** Every write path from this handler and the comparison line for each.

**Signals to search:** `@PutMapping`, `@DeleteMapping`, `@PostMapping`, `@PATCH`, `save(`, `update(`, `delete(`, `Cuf`, `@PatchMapping`, `@PUT`, `@DELETE`

Repeat the block below once per row of C-35 where mutates = `yes` (count only those rows), in the same order as your C-35 table above: edit the `row=1` block for the first such row and add copies numbered `row=2`, `row=3`, and so on. Put the row's path, handler, or name on the first line of Location. If that table has no matching rows, write `Status: na` with the reason in the `row=1` block.

<!-- answer R-22 row=1 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-23: Bound request objects cannot set fields the UI never sends: identifiers, ownership, status, access flags

**Type:** check  
**Applies when:** C-38 (Request binding styles present) includes any of `requestbody-domain`, `requestbody-dto`, `modelattribute`, `beanparam`, `jaxrs-entity`, `jsf-properties`, `getparameter`  
**Severity if finding:** high  
**STIG area:** Input validation: mass assignment  
**Refs:** 7, Q21 (sections and question numbers of the handoff document, not files in this project)

**How:** For each handler that binds a request body, entity parameter, or form onto a Java object, list the settable fields of that class as Jackson or the binder sees them (public setters, public fields, constructor properties, nested objects). Compare against what the Angular form actually sends. Fields such as sponsorId, familyId, personId, accessLevel, role, status, approved, createdBy, or any id are the ones to look for. A class named Dto passes only when that list contains no identifier, ownership, status, or access field. Then check the control that matches the binding style: @InitBinder allow-lists cover @ModelAttribute, form, and query binding only and are irrelevant to @RequestBody; for @RequestBody and JAX-RS entities only @JsonIgnore, @JsonProperty(access = READ_ONLY), or @JsonIgnoreProperties without allowSetters count, or a class that lacks the field. A settable ownership or access field with no matching control is a finding: the client can include the field and the binder will set it.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Handler, bound class, its setters, the frontend payload, the allow-list.

**Why no more findings must state:** Every binding handler and, for each, the settable-field list and either the matching control or why the class has no sensitive settable field.

**Signals to search:** `@RequestBody`, `@ModelAttribute`, `@Consumes(`, `@InitBinder`, `setAllowedFields`, `@JsonIgnoreProperties`, `allowSetters`, `READ_ONLY`, `BeanUtils.copyProperties`, `MapStruct`, `ModelMapper`

<!-- answer R-23 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-24: This constraint is enforced again on the server before the value is used or stored

**Type:** check, one answer block per row of C-40 (Constraints the frontend enforces on submitted data)  
**Applies when:** C-40 has at least one row  
**Severity if finding:** medium  
**STIG area:** Input validation: server-side enforcement  
**Refs:** 7, Q21 (sections and question numbers of the handoff document, not files in this project)

**How:** Follow the field from the request into the handler and on to the line that uses or stores it, and find the server-side enforcement recorded in the row. A constraint that exists only in the browser is not a constraint: anyone can send the request with a tool. Judge only enforcement, not intent, and beware three shapes that look like enforcement and are not: bean validation whose exception is swallowed by a BindingResult or Errors parameter the handler never inspects; a check that runs after the value has been used or stored; and a check in a service the handler does not call on this path. If the field is an identifier, an ownership field, a status, or an access flag, the mass-assignment check above already owns it, so record it there and mark this row as covered by that item rather than raising the same finding twice. A length or format gap with no security consequence is still a finding here, but say in Findings what it can and cannot do, so the tech lead can rank it.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Client constraint, the request, the handler parameter, the validation or comparison, the use or the store.

**Why no more findings must state:** The line that enforces the constraint on the server, and for bean validation the path that turns a violation into a rejected request.

**Signals to search:** `@Valid`, `@Validated`, `BindingResult`, `Errors`, `hasErrors`, `@NotNull`, `@NotBlank`, `@NotEmpty`, `@Size`, `@Pattern`, `@Min`, `@Max`, `@DecimalMin`, `@Email`, `ConstraintViolation`, `MethodArgumentNotValidException`, `valueOf(`, `EnumUtils`, `switch (`, `IllegalArgumentException`

Repeat the block below once per row of C-40, in the same order as your C-40 table above: edit the `row=1` block for the first such row and add copies numbered `row=2`, `row=3`, and so on. Put the row's path, handler, or name on the first line of Location. If that table has no matching rows, write `Status: na` with the reason in the `row=1` block.

<!-- answer R-24 row=1 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### C-41: Accepts file uploads

**Type:** yes/no  
**Applies when:** always  
**Refs:** 7, 8.7 (sections and question numbers of the handoff document, not files in this project)

**How:** Search for multipart handling. An upload that attaches a file to a record identified by a request parameter is the write-side twin of file serving.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `MultipartFile`, `@FormDataParam`, `javax.servlet.http.Part`, `getPart(`, `<multipart-config>`, `CommonsMultipartResolver`, `MultipartResolver`, `FormData`

<!-- answer C-41 -->
Value:
Evidence:
Searched:
<!-- /answer -->

### C-42: Upload handlers

**Type:** table  
**Applies when:** C-41 (Accepts file uploads) = `yes`  
**Refs:** 8.7 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per upload handler. Record which record the upload attaches to, where that record's identifier comes from, and where the bytes are stored.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `MultipartFile`, `@FormDataParam`, `getPart(`

**Columns:**

- Handler class#method
- URL
- Record the upload attaches to
- Identifier source (exactly one of: `request`, `session or token`, `both`, `none`, lowercase, no backticks)
- Where bytes are stored

**If empty:** C-41 said uploads are accepted, so this table cannot be empty; either list the handlers or change C-41.

<!-- answer C-42 -->
Status:
Reason:
| Handler class#method | URL | Record the upload attaches to | Identifier source | Where bytes are stored |
|---|---|---|---|---|
|   |   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### R-25: This upload attaches only to a record the caller owns, and the target record identifier is validated against scope

**Type:** check, one answer block per row of C-42 (Upload handlers)  
**Applies when:** C-42 has at least one row  
**Severity if finding:** high  
**STIG area:** Access control: authorization to specific data objects  
**Refs:** 8.7 (sections and question numbers of the handoff document, not files in this project)

**How:** The identifier that says which record the upload belongs to must be compared with the caller's scope before the bytes are stored or linked. Also record where the stored path or name comes from; a client-supplied filename used in a path is a separate hardening issue to note in Findings.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Target identifier, handler, the comparison line, the store or link call.

**Why no more findings must state:** Every path from this handler to storage and the comparison line for each.

**Signals to search:** `MultipartFile`, `getOriginalFilename`, `Paths.get`, `transferTo(`, `@FormDataParam`

Repeat the block below once per row of C-42, in the same order as your C-42 table above: edit the `row=1` block for the first such row and add copies numbered `row=2`, `row=3`, and so on. Put the row's path, handler, or name on the first line of Location. If that table has no matching rows, write `Status: na` with the reason in the `row=1` block.

<!-- answer R-25 row=1 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### F-06: Issues found in this area

**Type:** table  
**Applies when:** always  
**Refs:** 3, 4 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per issue noticed while working through this topic that no item above recorded. Cite the location as file:line or as a URL. Name the item that led you to it where there is one. Severity: high when a caller can reach another user's data with no check in the way; medium when exposure needs a second condition; low for hardening; not sure otherwise. Leave the table empty if nothing was noticed.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Columns:**

- Location (file:line or URL)
- What is wrong
- Related item
- Severity (exactly one of: `high`, `medium`, `low`, `not sure`, lowercase, no backticks)

**Optional:** an empty table is acceptable here.

<!-- answer F-06 -->
| Location (file:line or URL) | What is wrong | Related item | Severity |
|---|---|---|---|
|   |   |   |   |

Notes:
<!-- /answer -->

## 7. Files and documents

_Reminder for this topic: one item at a time. Research it, write its block, check it off in your task list, then take the next; never fill several blocks in one step. Answer from the code only. Never fill a field with a placeholder, a guessed citation, or an invented Searched record to satisfy the linter. If an item cannot be answered from what you can read, ask the developer before moving on; nothing is marked `unable` without asking first, and the block records what was asked and answered in an `Asked:` line._

The exact shape of the incident: an identifier that becomes bytes.

### C-43: Serves files or documents by identifier

**Type:** yes/no  
**Applies when:** always  
**Refs:** 2, Q16 (sections and question numbers of the handoff document, not files in this project)

**How:** Search Java and descriptors for anything that streams bytes to the response: content-disposition headers, binary media types, stream or byte-array return types, raw output streams, and servlet mappings for document paths. Also search the frontend for download links, since they point at the backend URL. This is the DWP incident shape. A 'no' answer switches off the file-serving review section, so the Searched field must list every signal and directory.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `Content-Disposition`, `application/octet-stream`, `application/pdf`, `InputStreamResource`, `StreamingResponseBody`, `StreamingOutput`, `getOutputStream(`, `ServletOutputStream`, `ResponseEntity<byte[]>`, `ResponseEntity<Resource>`, `byte[]`, `@Produces`, `*.pdf`, `/download`, `/export`, `/attachment`, `/document`, `/report`, `window.open(`, `download=`, `JasperReports`, `JasperExportManager`, `iText`, `PDFBox`, `XSSFWorkbook`, `HSSFWorkbook`, `ByteArrayResource`, `FileSystemResource`, `text/csv`, `getWriter()`

<!-- answer C-43 -->
Value:
Evidence:
Searched:
<!-- /answer -->

### C-44: File-serving handlers

**Type:** table  
**Applies when:** C-43 (Serves files or documents by identifier) = `yes`  
**Refs:** 2, Q16 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per handler that returns bytes. Record the identifier parameter, where the bytes come from, whether the handler is under a C-26 exclusion, and where (if anywhere) the identifier is checked against the caller's scope before the bytes are read.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `Content-Disposition`, `getOutputStream(`, `InputStreamResource`, `byte[]`

**Columns:**

- Handler class#method
- URL
- Identifier parameter
- Byte source (exactly one of: `file system`, `service call`, `database blob`, `generated`, `other`, lowercase, no backticks)
- Public (exactly one of: `yes`, `no`, lowercase, no backticks)
- Scope check location, or none

**If empty:** C-43 said files are served by identifier, so this table cannot be empty; either list the handlers or change C-43.

<!-- answer C-44 -->
Status:
Reason:
| Handler class#method | URL | Identifier parameter | Byte source | Public | Scope check location, or none |
|---|---|---|---|---|---|
|   |   |   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### R-26: The identifier is checked against the caller's scope before the bytes are read or streamed

**Type:** check, one answer block per row of C-44 (File-serving handlers)  
**Applies when:** C-44 has at least one row  
**Severity if finding:** high  
**STIG area:** Access control: authorization to specific data objects  
**Refs:** 2, Q16 (sections and question numbers of the handoff document, not files in this project)

**How:** This is the DWP incident exactly. Follow the identifier from the request to the point where it becomes a file path, a document service call, or a blob read. Name the line that compares the file's owner or the resolved record with the caller's scope, and confirm it runs before the first byte is read. If the handler is under a public exclusion (C-44 public = yes), it is a finding regardless of any check. If the identifier is, or is concatenated into, a file name or path, also cite the canonicalisation and base-directory check or the id-to-path lookup table; a path built from the id with no such check reaches files outside the document store.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Identifier, handler, metadata or ownership lookup, the comparison line, the read, the stream to the response.

**Why no more findings must state:** Every path from this handler to bytes and the comparison line for each.

**Signals to search:** `Content-Disposition`, `getOutputStream(`, `InputStreamResource`, `StreamingResponseBody`, `FileInputStream`, `Paths.get`, `new File(`, `getCanonicalPath`, `getCanonicalFile`, `resolve(`, `normalize(`

Repeat the block below once per row of C-44, in the same order as your C-44 table above: edit the `row=1` block for the first such row and add copies numbered `row=2`, `row=3`, and so on. Put the row's path, handler, or name on the first line of Location. If that table has no matching rows, write `Status: na` with the reason in the `row=1` block.

<!-- answer R-26 row=1 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-27: File identifiers are not exposed to callers who are not authorised for the file

**Type:** check  
**Applies when:** C-43 (Serves files or documents by identifier) = `yes`  
**Severity if finding:** medium  
**STIG area:** Access control: information disclosure  
**Refs:** 2 (sections and question numbers of the handoff document, not files in this project)

**How:** Find every place a file identifier is written into a response: listings, links, JSON fields, generated HTML. Each must be scoped to the caller (R-20 applies). Also note whether identifiers are sequential; sequential identifiers plus any missing check in R-26 make every file in the store reachable.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Every response that contains a file identifier, and the scope constraint on it.

**Why no more findings must state:** Every identifier-emitting location and its constraint.

**Signals to search:** `documentId`, `fileId`, `attachmentId`, `href`, `download`

<!-- answer R-27 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### F-07: Issues found in this area

**Type:** table  
**Applies when:** always  
**Refs:** 3, 4 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per issue noticed while working through this topic that no item above recorded. Cite the location as file:line or as a URL. Name the item that led you to it where there is one. Severity: high when a caller can reach another user's data with no check in the way; medium when exposure needs a second condition; low for hardening; not sure otherwise. Leave the table empty if nothing was noticed.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Columns:**

- Location (file:line or URL)
- What is wrong
- Related item
- Severity (exactly one of: `high`, `medium`, `low`, `not sure`, lowercase, no backticks)

**Optional:** an empty table is acceptable here.

<!-- answer F-07 -->
| Location (file:line or URL) | What is wrong | Related item | Severity |
|---|---|---|---|
|   |   |   |   |

Notes:
<!-- /answer -->

## 8. Where the data comes from

_Reminder for this topic: one item at a time. Research it, write its block, check it off in your task list, then take the next; never fill several blocks in one step. Answer from the code only. Never fill a field with a placeholder, a guessed citation, or an invented Searched record to satisfy the linter. If an item cannot be answered from what you can read, ask the developer before moving on; nothing is marked `unable` without asking first, and the block records what was asked and answered in an `Asked:` line._

Backend services and queries return whatever they are asked for, so the check must have happened before the call.

### C-45: Data access mechanisms

**Type:** multiple choice  
**Applies when:** always  
**Refs:** 6.8 (sections and question numbers of the handoff document, not files in this project)

**How:** Select every mechanism through which this application reads or writes data. Check the POM as well as the code: a dependency with no usage is not a mechanism, and a usage without a dependency is a shared library.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `Cuf`, `CUF`, `RestTemplate`, `WebClient`, `HttpClient`, `@WebServiceClient`, `@FeignClient`, `EntityManager`, `@Repository`, `JpaRepository`, `createQuery`, `JdbcTemplate`, `NamedParameterJdbcTemplate`, `CallableStatement`, `{call `, `SqlSession`, `@Mapper`, `FileInputStream`, `Files.`, `Paths.get`, `LdapTemplate`

**Options:**

- `cuf`: CUF (Common Update Framework) client
- `rest-client`: Other REST service clients
- `soap-client`: SOAP or JAX-WS clients
- `jpa-hibernate`: JPA or Hibernate
- `jdbctemplate`: JdbcTemplate or raw JDBC
- `stored-procedures`: Stored procedures
- `mybatis`: MyBatis
- `file-system`: File system
- `ldap`: LDAP
- `other`: Other (describe in Detail)

<!-- answer C-45 -->
Value:
Detail (Anything selected as Other):
Evidence:
Searched:
<!-- /answer -->

### C-46: Outbound service calls

**Type:** table  
**Applies when:** always  
**Refs:** 6.8, 6.9, Q14 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per backend service this application calls, and CUF counts: when the application reaches CUF through a broker or client library, add a row for CUF naming that client, even though the HTTP happens inside the library. Record which identifier is sent and whether any caller-scope information (family, site, operator) travels with the request. Backend services do not enforce scope, so each row is a place where scope must have been enforced before the call.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `RestTemplate`, `WebClient`, `HttpClient`, `@WebServiceClient`, `@FeignClient`, `baseUrl`, `.url`, `endpoint`, `getForObject`, `postForObject`, `exchange(`

**Columns:**

- Service
- Base URL or property key
- Client class
- Operations used
- Identifier passed
- Caller scope passed (exactly one of: `yes`, `no`, `unknown`, lowercase, no backticks)

**If empty:** An empty table must be justified in Searched: list the client classes and property files searched.

<!-- answer C-46 -->
| Service | Base URL or property key | Client class | Operations used | Identifier passed | Caller scope passed |
|---|---|---|---|---|---|
|   |   |   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-47: CUF is the main data path

**Type:** yes/no  
**Applies when:** always  
**Refs:** 6.8 (sections and question numbers of the handoff document, not files in this project)

**Fleet default:** `yes`. Confirm or override with evidence.

**How:** Fleet default: yes. Confirm against C-45 and C-46 above. Override if this application reaches its main data some other way.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `Cuf`, `CUF`

<!-- answer C-47 -->
Value:
Evidence:
Searched:
<!-- /answer -->

### C-48: Backend services are called without authentication

**Type:** yes/no  
**Applies when:** always  
**Refs:** 6.9 (sections and question numbers of the handoff document, not files in this project)

**Fleet default:** `yes`. Confirm or override with evidence.

**How:** Fleet default: yes. Look at the outbound client code in C-46 for any credential, token, or certificate. If none, confirm. When the client is a shared library whose source you do not have, this is exactly what the library's source is needed for (topic 0): with it, cite the line that builds the request; without it, write Status: unable rather than confirming a default you cannot see. Consequence: this web tier is the only place object-level authorization can be enforced.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `Authorization`, `setBasicAuth`, `KeyStore`, `SSLContext`, `Bearer`, `apiKey`

<!-- answer C-48 -->
Value:
Evidence:
Searched:
<!-- /answer -->

### C-49: CUF request identity and scope

**Type:** free text  
**Applies when:** C-45 (Data access mechanisms) includes `cuf`  
**Refs:** 6.8, Q14 (sections and question numbers of the handoff document, not files in this project)

**How:** What identifies a record in a CUF request (person id, sponsor id, family id, something else)? Does any CUF request carry the caller's scope, or does CUF return whatever id it is asked for? Cite the request builder.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `Cuf`, `CufRequest`, `appId`, `personId`, `sponsorId`

<!-- answer C-49 -->
Status:
Reason:
Value:
Evidence:
Searched:
<!-- /answer -->

### C-50: Direct database access points

**Type:** table  
**Applies when:** C-45 (Data access mechanisms) includes any of `jpa-hibernate`, `jdbctemplate`, `stored-procedures`, `mybatis`  
**Refs:** Q15 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per query, repository method, or stored procedure call that takes an identifier. Record which identifier is in the WHERE clause and whether the WHERE clause also constrains the result to the caller's scope (for example AND family_id = ?).

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `@Query`, `createQuery`, `createNativeQuery`, `findById`, `JdbcTemplate.query`, `queryForObject`, `CallableStatement`, `{call `, `<select`, `SqlSession`

**Columns:**

- Class#method (file:line)
- Query or procedure
- Identifier in WHERE
- Scope constraint in WHERE (exactly one of: `yes`, `no`, `unknown`, lowercase, no backticks)

<!-- answer C-50 -->
Status:
Reason:
| Class#method (file:line) | Query or procedure | Identifier in WHERE | Scope constraint in WHERE |
|---|---|---|---|
|   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### R-28: Scope has been enforced in this application before this service is called

**Type:** check, one answer block per row of C-46 (Outbound service calls)  
**Applies when:** C-46 has at least one row  
**Severity if finding:** high  
**STIG area:** Access control: authorization to specific data objects  
**Refs:** 6.9, Q14 (sections and question numbers of the handoff document, not files in this project)

**How:** Find every call site of the client for this service. For each, walk back to the handler and find the comparison line between the identifier being sent and the caller's scope. The service will return whatever it is asked for, so a call site with no check upstream is a finding even if the handler is authenticated.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Each call site, the identifier it sends, the handler above it, the comparison line.

**Why no more findings must state:** Every call site of this client and the comparison line for each.

**Signals to search:** `RestTemplate`, `WebClient`, `@FeignClient`, `getForObject`, `postForObject`, `exchange(`, `Cuf`

Repeat the block below once per row of C-46, in the same order as your C-46 table above: edit the `row=1` block for the first such row and add copies numbered `row=2`, `row=3`, and so on. Put the row's path, handler, or name on the first line of Location. If that table has no matching rows, write `Status: na` with the reason in the `row=1` block.

<!-- answer R-28 row=1 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-29: This query constrains results to the caller's scope, or the result is checked against scope before it is returned

**Type:** check, one answer block per row of C-50 (Direct database access points)  
**Applies when:** C-50 has at least one row  
**Severity if finding:** high  
**STIG area:** Access control: authorization to specific data objects  
**Refs:** Q15 (sections and question numbers of the handoff document, not files in this project)

**How:** Read the query or procedure. A WHERE clause that includes the caller's family, site, or equivalent passes. A query by identifier alone passes only if the caller of the query compares the result's owner with the caller's scope before returning it. Cite whichever line does it.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Query text, its parameters, the caller, the comparison line.

**Why no more findings must state:** Every caller of this query and the constraint or comparison for each.

**Signals to search:** `@Query`, `createQuery`, `createNativeQuery`, `queryForObject`, `{call `, `<select`

Repeat the block below once per row of C-50, in the same order as your C-50 table above: edit the `row=1` block for the first such row and add copies numbered `row=2`, `row=3`, and so on. Put the row's path, handler, or name on the first line of Location. If that table has no matching rows, write `Status: na` with the reason in the `row=1` block.

<!-- answer R-29 row=1 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### F-08: Issues found in this area

**Type:** table  
**Applies when:** always  
**Refs:** 3, 4 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per issue noticed while working through this topic that no item above recorded. Cite the location as file:line or as a URL. Name the item that led you to it where there is one. Severity: high when a caller can reach another user's data with no check in the way; medium when exposure needs a second condition; low for hardening; not sure otherwise. Leave the table empty if nothing was noticed.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Columns:**

- Location (file:line or URL)
- What is wrong
- Related item
- Severity (exactly one of: `high`, `medium`, `low`, `not sure`, lowercase, no backticks)

**Optional:** an empty table is acceptable here.

<!-- answer F-08 -->
| Location (file:line or URL) | What is wrong | Related item | Severity |
|---|---|---|---|
|   |   |   |   |

Notes:
<!-- /answer -->

## 9. Caching and static content

_Reminder for this topic: one item at a time. Research it, write its block, check it off in your task list, then take the next; never fill several blocks in one step. Answer from the code only. Never fill a field with a placeholder, a guessed citation, or an invented Searched record to satisfy the linter. If an item cannot be answered from what you can read, ask the developer before moving on; nothing is marked `unable` without asking first, and the block records what was asked and answered in an `Asked:` line._

Data that lingers where it should not, and what the container exposes on its own.

### C-51: Cache-Control on authenticated responses

**Type:** single choice  
**Applies when:** always  
**Refs:** 7, Q22 (sections and question numbers of the handoff document, not files in this project)

**How:** Find where Cache-Control, Pragma, or Expires headers are set for dynamic responses: a filter, Spring Security headers configuration, the shared web-security library, or individual handlers. If Spring Security is present, it writes Cache-Control: no-store on every response by default; answer global-filter citing the security configuration unless headers().disable(), cacheControl().disable(), or defaultsDisabled() appears.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `Cache-Control`, `no-store`, `no-cache`, `Pragma`, `Expires`, `CacheControl.noStore`, `HeaderWriter`, `cacheControl()`, `setHeader(`, `headers()`, `defaultsDisabled`, `headers().disable()`

**Options:**

- `global-filter`: Global filter or header writer sets no-store
- `per-endpoint`: Set per endpoint only
- `none-found`: None found
- `unknown`: Unknown

<!-- answer C-51 -->
Value:
Detail (Where set and the header value):
Evidence:
Searched:
<!-- /answer -->

### R-30: Authenticated responses are sent with Cache-Control: no-store

**Type:** check  
**Applies when:** C-51 (Cache-Control on authenticated responses) is one of `per-endpoint`, `none-found`, `unknown`  
**Severity if finding:** low  
**STIG area:** Information disclosure: caching of sensitive data  
**Refs:** 7, Q22 (sections and question numbers of the handoff document, not files in this project)

**How:** Without a global no-store, responses containing personal data can be kept by browser and proxy caches, including on shared call-centre workstations. Spring Security writes no-store by default unless its header writers are disabled; otherwise find every place the header is set and every data endpoint that is not covered.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Header-setting code, coverage of data endpoints.

**Why no more findings must state:** Every data endpoint and how each gets the header.

**Signals to search:** `Cache-Control`, `no-store`, `setHeader(`, `CacheControl.noStore`

<!-- answer R-30 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### C-52: Directory listing setting

**Type:** single choice  
**Applies when:** C-07 (Deployed to WebLogic) = `yes`  
**Refs:** 7, Q23 (sections and question numbers of the handoff document, not files in this project)

**How:** Read weblogic.xml for index-directory-enabled inside container-descriptor. If the element is absent, the WebLogic default applies (disabled on current versions, but record that it is not set). Answers other than explicitly disabled need a Searched record.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `index-directory-enabled`, `<container-descriptor>`, `weblogic.xml`, `<welcome-file-list>`

**Options:**

- `disabled-explicit`: Explicitly disabled
- `enabled-explicit`: Explicitly enabled
- `not-set-default`: Not set (container default)
- `no-weblogic-xml`: No weblogic.xml present

<!-- answer C-52 -->
Status:
Reason:
Value:
Evidence:
Searched:
<!-- /answer -->

### C-53: Static resource handlers and roots

**Type:** table  
**Applies when:** always  
**Refs:** Q23 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per static resource mapping: Spring resource handlers, the container default servlet, and any explicit servlet mapping onto a directory. Record the root each one exposes and whether anything beyond frontend assets lives under it.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `addResourceHandlers`, `<mvc:resources`, `ResourceHttpRequestHandler`, `spring.resources`, `spring.web.resources`, `static-locations`, `<servlet-mapping>`, `default`

**Columns:**

- Configured at (file:line)
- URL pattern
- Filesystem or classpath root
- Anything beyond frontend assets (exactly one of: `yes`, `no`, `unknown`, lowercase, no backticks)

<!-- answer C-53 -->
| Configured at (file:line) | URL pattern | Filesystem or classpath root | Anything beyond frontend assets |
|---|---|---|---|
|   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### R-31: Directory listing is disabled and static roots contain nothing but frontend assets

**Type:** check  
**Applies when:** C-52 (Directory listing setting) is one of `enabled-explicit`, `not-set-default`, `no-weblogic-xml` or C-53 (Static resource handlers and roots) has at least one entry  
**Severity if finding:** low  
**STIG area:** Information disclosure: directory listing and static content  
**Refs:** 7, Q23 (sections and question numbers of the handoff document, not files in this project)

**How:** Confirm index-directory-enabled is false or absent with a known-safe default for the WebLogic version. Then walk each static root from C-53 and list anything that is not a frontend asset: configuration, source maps with embedded source, backups, documents, exports.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** weblogic.xml, each static root's contents.

**Why no more findings must state:** Each root walked and what was found.

**Signals to search:** `index-directory-enabled`, `.map`, `.bak`, `.properties`, `.xml`, `.pdf`, `.xls`

<!-- answer R-31 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### F-09: Issues found in this area

**Type:** table  
**Applies when:** always  
**Refs:** 3, 4 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per issue noticed while working through this topic that no item above recorded. Cite the location as file:line or as a URL. Name the item that led you to it where there is one. Severity: high when a caller can reach another user's data with no check in the way; medium when exposure needs a second condition; low for hardening; not sure otherwise. Leave the table empty if nothing was noticed.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Columns:**

- Location (file:line or URL)
- What is wrong
- Related item
- Severity (exactly one of: `high`, `medium`, `low`, `not sure`, lowercase, no backticks)

**Optional:** an empty table is acceptable here.

<!-- answer F-09 -->
| Location (file:line or URL) | What is wrong | Related item | Severity |
|---|---|---|---|
|   |   |   |   |

Notes:
<!-- /answer -->

## 10. JSF pages

_Reminder for this topic: one item at a time. Research it, write its block, check it off in your task list, then take the next; never fill several blocks in one step. Answer from the code only. Never fill a field with a placeholder, a guessed citation, or an invented Searched record to satisfy the linter. If an item cannot be answered from what you can read, ask the developer before moving on; nothing is marked `unable` without asking first, and the block records what was asked and answered in an `Asked:` line._

Record identifiers held in managed beans and view state.

**Applies when:** C-02 (Backend frameworks present) includes `jsf`. If not met, mark every item in this topic `Status: na` with the rule as the reason.

### C-54: JSF pages and backing beans

**Type:** table  
**Applies when:** C-02 (Backend frameworks present) includes `jsf`  
**Refs:** 6.2, Q31 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per page and backing bean pair. Record the bean scope, which record identifiers the bean holds, and how those identifiers are loaded. In JSF 2 Facelets pages that is usually f:viewParam or f:param; in JSP-based views and JSF 1.2 (.jspx pages) identifiers arrive through <managed-property> with #{param.x}, getRequestParameterMap(), f:setPropertyActionListener, or f:attribute on a command link. Anything that comes from the request can be tampered with; a session attribute cannot.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `@ManagedBean`, `@Named`, `@SessionScoped`, `@ViewScoped`, `@RequestScoped`, `f:viewParam`, `f:param`, `f:metadata`, `faces-config.xml`, `managed-bean`, `.xhtml`, `.jspx`, `#{param.`, `getRequestParameterMap`, `<managed-property>`, `f:setPropertyActionListener`, `f:attribute`, `h:commandLink`

**Columns:**

- Page
- Bean class
- Bean scope (exactly one of: `request`, `view`, `session`, `application`, `other`, lowercase, no backticks)
- Record identifiers held
- Identifiers loaded from (exactly one of: `view param`, `f:param`, `request parameter (managed-property or code)`, `session`, `other`, lowercase, no backticks)

<!-- answer C-54 -->
Status:
Reason:
| Page | Bean class | Bean scope | Record identifiers held | Identifiers loaded from |
|---|---|---|---|---|
|   |   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-55: ViewState protection

**Type:** single choice  
**Applies when:** C-02 (Backend frameworks present) includes `jsf`  
**Refs:** Q31 (sections and question numbers of the handoff document, not files in this project)

**How:** Read web.xml for javax.faces.STATE_SAVING_METHOD; if it is absent the default is server-side. If it is client, encryption depends on the implementation and version from the POM: MyFaces encrypts unless org.apache.myfaces.USE_ENCRYPTION is false; Mojarra 2.2 and later encrypt unless com.sun.faces.disableClientStateEncryption is true; Mojarra 2.1 and earlier and the JSF 1.2 reference implementation encrypt only when com.sun.faces.ClientStateSavingPassword is set.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `javax.faces.STATE_SAVING_METHOD`, `org.apache.myfaces.USE_ENCRYPTION`, `com.sun.faces.disableClientStateEncryption`, `com.sun.faces.ClientStateSavingPassword`, `jsf-impl`, `myfaces-impl`, `jsf-api`

**Options:**

- `server-side`: Server-side state saving
- `client-encrypted`: Client-side, encrypted
- `client-unencrypted`: Client-side, not encrypted
- `unknown`: Unknown

<!-- answer C-55 -->
Status:
Reason:
Value:
Evidence:
Searched:
<!-- /answer -->

### R-32: Record identifiers arriving through view parameters are validated against scope on page load and on every postback action

**Type:** check, one answer block per row of C-54 (JSF pages and backing beans)  
**Applies when:** C-02 (Backend frameworks present) includes `jsf`; and C-54 has at least one row  
**Severity if finding:** high  
**STIG area:** Access control: authorization to specific data objects  
**Refs:** Q31 (sections and question numbers of the handoff document, not files in this project)

**How:** For this page, find where the identifier enters the bean: f:viewParam, f:param, a <managed-property> bound to #{param.x}, getRequestParameterMap(), f:setPropertyActionListener, or f:attribute on a command link. Find the comparison with the caller's scope. Then check the action methods: a view-scoped or session-scoped bean keeps the identifier between requests, and an action that uses it must not trust that it was validated on an earlier request if a postback parameter can change it. A managed-property bound to #{param.x} is re-read on every request, so every action that uses it needs the check.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Identifier entry, the comparison, each action method that uses the identifier.

**Why no more findings must state:** Every entry point for the identifier and every action that uses it, with the comparison line for each.

**Signals to search:** `f:viewParam`, `f:param`, `@ViewScoped`, `@SessionScoped`, `preRenderView`, `actionListener`, `#{param.`, `<managed-property>`, `getRequestParameterMap`, `f:setPropertyActionListener`, `f:attribute`

Repeat the block below once per row of C-54, in the same order as your C-54 table above: edit the `row=1` block for the first such row and add copies numbered `row=2`, `row=3`, and so on. Put the row's path, handler, or name on the first line of Location. If that table has no matching rows, write `Status: na` with the reason in the `row=1` block.

<!-- answer R-32 row=1 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-33: Client-side JSF view state is encrypted

**Type:** check  
**Applies when:** C-02 (Backend frameworks present) includes `jsf`; and C-55 (ViewState protection) is one of `client-unencrypted`, `unknown`  
**Severity if finding:** medium  
**STIG area:** Input validation: tampering with server state held on the client  
**Refs:** Q31 (sections and question numbers of the handoff document, not files in this project)

**How:** If state saving is client-side, the serialised component tree including bean-held identifiers travels to the browser. Confirm encryption from the implementation and version: MyFaces on unless USE_ENCRYPTION is false; Mojarra 2.2 and later on unless disableClientStateEncryption is true; Mojarra 2.1 and earlier and the JSF 1.2 reference implementation off unless ClientStateSavingPassword is set. Unencrypted client state lets a caller edit held identifiers.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** web.xml context parameters, implementation defaults for the version in use.

**Why no more findings must state:** The parameter values cited.

**Signals to search:** `javax.faces.STATE_SAVING_METHOD`, `USE_ENCRYPTION`, `disableClientStateEncryption`, `ClientStateSavingPassword`

<!-- answer R-33 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### F-10: Issues found in this area

**Type:** table  
**Applies when:** C-02 (Backend frameworks present) includes `jsf`  
**Refs:** 3, 4 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per issue noticed while working through this topic that no item above recorded. Cite the location as file:line or as a URL. Name the item that led you to it where there is one. Severity: high when a caller can reach another user's data with no check in the way; medium when exposure needs a second condition; low for hardening; not sure otherwise. Leave the table empty if nothing was noticed.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Columns:**

- Location (file:line or URL)
- What is wrong
- Related item
- Severity (exactly one of: `high`, `medium`, `low`, `not sure`, lowercase, no backticks)

**Optional:** an empty table is acceptable here.

<!-- answer F-10 -->
Status:
Reason:
| Location (file:line or URL) | What is wrong | Related item | Severity |
|---|---|---|---|
|   |   |   |   |

Notes:
<!-- /answer -->

## 11. Fortify workarounds

_Reminder for this topic: one item at a time. Research it, write its block, check it off in your task list, then take the next; never fill several blocks in one step. Answer from the code only. Never fill a field with a placeholder, a guessed citation, or an invented Searched record to satisfy the linter. If an item cannot be answered from what you can read, ask the developer before moving on; nothing is marked `unable` without asking first, and the block records what was asked and answered in an `Asked:` line._

Code that makes the scanner pass without fixing anything hides live findings.

### C-56: Fortify artifacts checked into the repository

**Type:** yes/no  
**Applies when:** always  
**Refs:** 7, Q24 (sections and question numbers of the handoff document, not files in this project)

**How:** Search for Fortify result files, filter files, scan properties, suppression annotations, and comments that mention Fortify next to code.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `.fpr`, `.filter`, `filtertemplate`, `fortify-sca.properties`, `fortify`, `Fortify`, `FORTIFY`, `@SuppressWarnings`, `NotAnIssue`, `audit`

<!-- answer C-56 -->
Value:
Evidence:
Searched:
<!-- /answer -->

### C-57: Fortify artifacts

**Type:** table  
**Applies when:** C-56 (Fortify artifacts checked into the repository) = `yes`  
**Refs:** Q24 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per artifact. Say what each one suppresses or excludes.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `.fpr`, `.filter`, `Fortify`

**Columns:**

- Path
- Kind (exactly one of: `fpr`, `filter file`, `suppression annotation`, `comment`, `properties`, `other`, lowercase, no backticks)
- What it suppresses or excludes

**If empty:** C-56 said Fortify artifacts are checked in, so this table cannot be empty; either list them or change C-56.

<!-- answer C-57 -->
Status:
Reason:
| Path | Kind | What it suppresses or excludes |
|---|---|---|
|   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-58: Candidate taint-breaking wrappers

**Type:** yes/no  
**Applies when:** always  
**Refs:** 7, Q25 (sections and question numbers of the handoff document, not files in this project)

**How:** Find methods whose names suggest validation, sanitization, or encoding, and read their bodies. Candidates: the method returns its argument unchanged; it copies the value through String.valueOf, new String, toString, substring(0), String.format with %s, or a StringBuilder; it checks a regex that matches everything; or it is an encoder that does not encode. A Fortify comment nearby is a strong signal.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `sanitize`, `sanitise`, `validate`, `clean`, `escape`, `encode`, `safe`, `String.valueOf(`, `new String(`, `.toString()`, `.substring(0`, `String.format("%s"`, `StringBuilder`, `ESAPI`, `Fortify`

<!-- answer C-58 -->
Value:
Evidence:
Searched:
<!-- /answer -->

### C-59: Taint-breaking wrapper candidates

**Type:** table  
**Applies when:** C-58 (Candidate taint-breaking wrappers) = `yes`  
**Refs:** Q25 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per candidate method. The check that follows judges each one; here only enumerate.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Signals to search:** `sanitize`, `validate`, `String.valueOf(`

**Columns:**

- Class#method (file:line)
- Pattern (exactly one of: `returns input`, `string copy`, `permissive regex`, `no-op encoder`, `other`, lowercase, no backticks)
- Called from

**If empty:** C-58 said wrapper candidates exist, so this table cannot be empty; either list them or change C-58.

<!-- answer C-59 -->
Status:
Reason:
| Class#method (file:line) | Pattern | Called from |
|---|---|---|
|   |   |   |

Evidence:
Searched:
<!-- /answer -->

### R-34: This wrapper performs real validation or encoding; if it passes input through, the finding it silences is re-evaluated as live

**Type:** check, one answer block per row of C-59 (Taint-breaking wrapper candidates)  
**Applies when:** C-59 has at least one row  
**Severity if finding:** medium  
**STIG area:** Vulnerability management: scanner suppression  
**Refs:** 7, Q25 (sections and question numbers of the handoff document, not files in this project)

**How:** Read the method body. Real validation rejects or transforms unsafe input. A method that returns its argument, copies it through String.valueOf or toString, or applies a regex that matches everything, only breaks the scanner's taint tracking. For a pass-through wrapper, find what Fortify would have reported downstream and evaluate it as a live finding.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** Method body, its callers, the sink downstream of each caller.

**Why no more findings must state:** Why the wrapper's transformation makes each downstream sink safe.

**Signals to search:** `String.valueOf(`, `new String(`, `.toString()`, `.matches(`, `return input`

Repeat the block below once per row of C-59, in the same order as your C-59 table above: edit the `row=1` block for the first such row and add copies numbered `row=2`, `row=3`, and so on. Put the row's path, handler, or name on the first line of Location. If that table has no matching rows, write `Status: na` with the reason in the `row=1` block.

<!-- answer R-34 row=1 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### R-35: This suppression or filter is justified in writing and the justification holds

**Type:** check, one answer block per row of C-57 (Fortify artifacts)  
**Applies when:** C-57 has at least one row  
**Severity if finding:** medium  
**STIG area:** Vulnerability management: scanner suppression  
**Refs:** 7, Q24 (sections and question numbers of the handoff document, not files in this project)

**How:** Read the suppression and its comment or filter entry. A justification must say why the reported issue is not exploitable here; a code comment counts as a written justification. Re-check the code it covers against that reasoning and judge only whether the reasoning holds for the current code. An unjustified suppression, or one whose reasoning no longer matches the code, is a finding; one whose reasoning holds is a pass even when the surrounding wrapper is weak, which belongs to R-34.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Trace:** The suppression, the code it covers, the justification.

**Why no more findings must state:** Why the justification holds for the current code.

**Signals to search:** `Fortify`, `@SuppressWarnings`, `.filter`, `NotAnIssue`

Repeat the block below once per row of C-57, in the same order as your C-57 table above: edit the `row=1` block for the first such row and add copies numbered `row=2`, `row=3`, and so on. Put the row's path, handler, or name on the first line of Location. If that table has no matching rows, write `Status: na` with the reason in the `row=1` block.

<!-- answer R-35 row=1 -->
Status:
Reason:
Location:
Evidence:
Findings:
Why no more findings:
<!-- /answer -->

### F-11: Issues found in this area

**Type:** table  
**Applies when:** always  
**Refs:** 3, 4 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per issue noticed while working through this topic that no item above recorded. Cite the location as file:line or as a URL. Name the item that led you to it where there is one. Severity: high when a caller can reach another user's data with no check in the way; medium when exposure needs a second condition; low for hardening; not sure otherwise. Leave the table empty if nothing was noticed.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Columns:**

- Location (file:line or URL)
- What is wrong
- Related item
- Severity (exactly one of: `high`, `medium`, `low`, `not sure`, lowercase, no backticks)

**Optional:** an empty table is acceptable here.

<!-- answer F-11 -->
| Location (file:line or URL) | What is wrong | Related item | Severity |
|---|---|---|---|
|   |   |   |   |

Notes:
<!-- /answer -->

## 12. Anything else

_Reminder for this topic: one item at a time. Research it, write its block, check it off in your task list, then take the next; never fill several blocks in one step. Answer from the code only. Never fill a field with a placeholder, a guessed citation, or an invented Searched record to satisfy the linter. If an item cannot be answered from what you can read, ask the developer before moving on; nothing is marked `unable` without asking first, and the block records what was asked and answered in an `Asked:` line._

Anything found that no topic above covered.

### F-12: Issues found that no topic above covered

**Type:** table  
**Applies when:** always  
**Refs:** 3, 4 (sections and question numbers of the handoff document, not files in this project)

**How:** One row per issue that no item in this document asked about. Cite the location as file:line or as a URL. Name the item that led you to it where there is one. Severity: high when a caller can reach another user's data with no check in the way; medium when exposure needs a second condition; low for hardening; not sure otherwise. Leave the table empty if nothing was noticed.

_Needs code that is not in this project? Ask the developer for its GitLab URL, clone it into `review-deps/<name>`, check out the version this application uses, then answer from what you read. Never guess what a library or service does._

**Columns:**

- Location (file:line or URL)
- What is wrong
- Related item
- Severity (exactly one of: `high`, `medium`, `low`, `not sure`, lowercase, no backticks)

**Optional:** an empty table is acceptable here.

<!-- answer F-12 -->
| Location (file:line or URL) | What is wrong | Related item | Severity |
|---|---|---|---|
|   |   |   |   |

Notes:
<!-- /answer -->

## Self-check

List any item you could not complete and why, and any runtime-only caveats. This block is copied into the result file.

<!-- answer SELFCHECK -->
<!-- /answer -->

## Appendix A: the linter

This fence holds the linter. Do not copy it by hand: Step 0 at the top gives a two-line `extract-lint.mjs` that writes it to `checklist-lint.js` byte for byte, and says how to use it. Copy the fence contents yourself only if that extraction fails, exactly as written and in a single write, into `checklist-lint.js` in the same folder as this document, unless that file is already there. It reads the rules from the hidden `lint-schema` comment near the top of this document, so do not remove that comment.

````javascript
#!/usr/bin/env node
'use strict';
// checklist-lint.js: checks a filled checklist Markdown document or a result JSON file.
// Generated by build.js; the same engine as md2json.js. No dependencies.
//   node checklist-lint.js <filled.md>                     report problems (exit 1 if any)
//   node checklist-lint.js <filled.md> --json out.json     also write the result JSON
//   node checklist-lint.js <result.json>                   check a result file (schema from the .md next to it, or --doc)

var TICK3 = new RegExp('`{3}', 'g');
var FENCE_LINE = /^\s*`{3,}/;
var LABEL_RE = /^([A-Z][A-Za-z ]{0,30}?(?:\s*\([^)]*\))?)\s*:\s*(.*)$/;
var FACT_LABELS = ['Status', 'Reason', 'Value', 'Detail', 'Evidence', 'Searched', 'Asked', 'Notes'];
var CHECK_LABELS = ['Status', 'Reason', 'Location', 'Evidence', 'Findings', 'Why no more findings', 'Asked', 'Notes'];
var META_LABELS = ['Application', 'Reviewer'];
var CITATION_RE = /[\w\/.\\-]+\.(java|json|jspx?|js|ts|xml|xhtml|properties|ya?ml|html?|sql|txt|gradle|md)(?![\w])(:\d+)?/i;
var STATUSES = ['pass', 'finding', 'unable', 'na'];
var NONE_TEXT = /^none( to list| found)?\.?$/i;
function has(s) { return !!(s && String(s).trim()); }
function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function clean(s) { return String(s === undefined || s === null ? '' : s).trim().replace(/^`+|`+$/g, '').replace(/\.$/, '').trim(); }
function code(s) { return clean(s).toLowerCase(); }
function naText(s) { return code(s).replace(/[^a-z]/g, '') === 'na'; }
function compactItem(it, phase, devText) {
  return {
    id: it.id, phase: phase, section: it.section, type: it.type, title: it.title,
    options: it.options ? it.options.map(function (o) { return o.value; }) : undefined,
    columns: it.columns ? it.columns.map(function (c) { return { key: c.key, label: c.label, type: c.type, options: c.options }; }) : undefined,
    when: it.when, default: it.default,
    detail: !!it.detail, emptyRequires: !!it.emptyRequires, warnRows: it.warnRows || undefined, inventory: it.inventory || undefined,
    optional: it.optional ? true : undefined, findings: it.findings ? true : undefined,
    forEach: it.forEach, forEachWhere: it.forEachWhere, severity: it.severity,
    negativeValues: it.negativeValues,
    devText: devText && devText.indexOf(it.id) >= 0 ? true : undefined
  };
}
function schemaFromDefinition(def, context, opts) {
  opts = opts || {};
  var phase = def.phase || ((def.phases && def.phases.length) ? 'profile' : 'all');
  var sectionPhase = {};
  def.sections.forEach(function (s) { sectionPhase[s.id] = s.phase; });
  var items = def.items.map(function (it) { return compactItem(it, phase === 'all' ? (sectionPhase[it.section] || 'profile') : phase, opts.devText); });
  var sections = def.sections.map(function (s) { return { id: s.id, title: s.title, when: s.when }; });
  if (context) {
    var cphase = context.phase || 'profile';
    items = items.concat(context.items.map(function (it) { return compactItem(it, cphase); }));
    sections = sections.concat(context.sections.map(function (s) { return { id: s.id, title: s.title, when: s.when }; }));
  }
  return {
    id: def.id, version: def.version, title: def.title, lintPhase: phase,
    negativeValues: def.negativeValues || [], sections: sections, items: items
  };
}
function extractSchema(md) {
  var m = md.match(/<!--\s*lint-schema\s*\r?\n([\s\S]*?)\r?\n-->/);
  if (!m) return null;
  return JSON.parse(m[1]);
}
function labelsFor(id, itemsById) {
  if (id === 'META') return META_LABELS;
  if (id === 'SELFCHECK') return [];
  var it = itemsById[id];
  if (!it) return FACT_LABELS.concat(CHECK_LABELS);
  return it.type === 'check' ? CHECK_LABELS : FACT_LABELS;
}
function labelKey(label) { return label.replace(/\s*\(.*\)$/, '').trim(); }
function fieldName(label) { return labelKey(label).toLowerCase().replace(/ /g, '_'); }
function splitCells(line) {
  var s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  var cells = [], cur = '';
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    if (ch === '\\' && s.charAt(i + 1) === '|') { cur += '|'; i++; continue; }
    if (ch === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}
function hasUnescapedPipe(line) { return /(^|[^\\])\|/.test(line); }
function isSeparator(line) { return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line); }
function parseBody(body, allowed, isFree) {
  var lines = body.split(/\r?\n/);
  var fields = {};
  var table = null;
  var current = null;
  var warnings = [];
  var fenceLines = 0;
  var inTable = false;
  var allowedKeys = {};
  allowed.forEach(function (l) { allowedKeys[l] = true; });
  if (isFree) return { fields: { text: body.trim() }, table: null, warnings: warnings, fenceLines: 0 };
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/\s+$/, '');
    if (FENCE_LINE.test(line)) { fenceLines++; continue; }
    if (!inTable && /^\s*\|/.test(line)) { inTable = true; table = table || []; table.push(line); current = null; continue; }
    if (inTable) {
      var lm0 = line.match(LABEL_RE);
      if (line.trim() !== '' && hasUnescapedPipe(line) && !(lm0 && allowedKeys[labelKey(lm0[1])])) { table.push(line); continue; }
      inTable = false;
    }
    var lm = line.match(LABEL_RE);
    if (lm && allowedKeys[labelKey(lm[1])]) {
      current = fieldName(lm[1]);
      fields[current] = lm[2];
      continue;
    }
    if (lm && current && FACT_LABELS.concat(CHECK_LABELS, META_LABELS).some(function (l) { return labelKey(lm[1]) === l; })) {
      warnings.push('line "' + line.trim().slice(0, 40) + '" looks like a field label that this block does not use; it was kept as text');
    }
    if (current && line.trim() !== '') fields[current] += (fields[current] ? '\n' : '') + line;
  }
  Object.keys(fields).forEach(function (k) { fields[k] = fields[k].trim(); });
  return { fields: fields, table: table, warnings: warnings, fenceLines: fenceLines };
}
function parseTable(lines, problems, label) {
  if (!lines || !lines.length) return [];
  if (lines.length < 2 || !isSeparator(lines[1])) {
    problems.push(label + ': table has no separator line (|---|---|) under the header');
    return [];
  }
  var rows = [];
  for (var i = 2; i < lines.length; i++) {
    var cells = splitCells(lines[i]);
    if (cells.every(function (x) { return x === ''; })) continue;
    rows.push(cells);
  }
  return rows;
}
function answerRegion(md) {
  var start = md.search(/<!--\s*answer\s+META\s*-->/);
  var head = start >= 0 ? md.slice(0, start) : '';
  var rest = start >= 0 ? md.slice(start) : md;
  var appendix = rest.search(/^## Appendix A/m);
  if (appendix >= 0) rest = rest.slice(0, appendix);
  head = head.replace(new RegExp('`{3}[\\s\\S]*?`{3}', 'g'), '');
  return head + rest;
}
function parseAnswers(md, itemsById) {
  var scan = answerRegion(md);
  var re = /<!--\s*answer\s+([A-Za-z0-9-]+)(?:\s+row=(\d+))?\s*-->([\s\S]*?)<!--\s*\/answer\s*-->/g;
  var blocks = {}, duplicates = [], notes = [];
  var m;
  while ((m = re.exec(scan)) !== null) {
    var id = m[1];
    var row = m[2] !== undefined ? Number(m[2]) : null;
    var allowed = labelsFor(id, itemsById || {});
    var parsed = parseBody(m[3], allowed, id === 'SELFCHECK');
    var where = id + (row !== null ? ' row=' + row : '');
    if (parsed.fenceLines) notes.push({ problem: true, text: where + ': a code fence inside the answer block; quote code inline with single backticks or cite the line' });
    parsed.warnings.forEach(function (w) { notes.push({ problem: false, text: where + ': ' + w }); });
    if (row === null) {
      if (blocks[id] && blocks[id].fields !== undefined) duplicates.push(id);
      blocks[id] = blocks[id] || {};
      blocks[id].fields = parsed.fields;
      blocks[id].table = parsed.table;
    } else {
      blocks[id] = blocks[id] || {};
      blocks[id].perRow = blocks[id].perRow || {};
      if (blocks[id].perRow[row]) duplicates.push(id + ' row=' + row);
      blocks[id].perRow[row] = parsed;
    }
  }
  var opens = (scan.match(/<!--\s*answer\s+/g) || []).length;
  var closes = (scan.match(/<!--\s*\/answer\s*-->/g) || []).length;
  return { blocks: blocks, duplicates: duplicates, unbalanced: opens !== closes, notes: notes };
}
function readCheck(f) {
  var st = code(f.status || '');
  if (naText(st)) st = 'na';
  return {
    status: st || null,
    location: f.location || '',
    evidence: f.evidence || '',
    asked: f.asked || '',
    findings: f.findings || '',
    whyNoMore: f.why_no_more_findings || '',
    reason: f.reason || '',
    notes: f.notes || ''
  };
}
function itemsOf(schema) {
  var lintPhase = schema.lintPhase || 'profile';
  var all = lintPhase === 'all';
  return { all: all, lintPhase: lintPhase, mine: all ? schema.items : schema.items.filter(function (it) { return (it.phase || 'profile') === lintPhase; }) };
}
function filterColumns(schema) {
  var out = {};
  schema.items.forEach(function (it) {
    if (it.forEach && it.forEachWhere) { out[it.forEach] = out[it.forEach] || {}; out[it.forEach][it.forEachWhere.col] = true; }
  });
  return out;
}
function normaliseRow(it, row, idx, tag, problems, warnings, filterCols) {
  it.columns.forEach(function (c) {
    if (c.options) {
      var v = code(row[c.key]);
      if (v !== '' && c.options.indexOf(v) < 0) problems.push(tag + ': row ' + (idx + 1) + ' column "' + c.label + '" is "' + row[c.key] + '", not one of ' + c.options.join(', '));
      row[c.key] = v;
    }
    if (filterCols && filterCols[c.key] && !has(row[c.key])) problems.push(tag + ': row ' + (idx + 1) + ' has no value in "' + c.label + '", which later checks filter on');
  });
  return row;
}
function recordsFromBlocks(schema, blocks, problems, warnings) {
  var answers = {};
  var fc = filterColumns(schema);
  itemsOf(schema).mine.forEach(function (it) {
    var b = blocks[it.id];
    var tag = it.section + ' ' + it.id;
    if (!b) { answers[it.id] = { status: 'missing' }; return; }
    if (it.type === 'check') {
      if (it.forEach) {
        var rec = { perRow: [] };
        if (b.perRow) {
          Object.keys(b.perRow).map(Number).sort(function (a, c) { return a - c; }).forEach(function (n) {
            var r = readCheck(b.perRow[n].fields); r.row = n; rec.perRow.push(r);
          });
        }
        if (b.fields && Object.keys(b.fields).some(function (k) { return has(b.fields[k]); })) rec.template = readCheck(b.fields);
        else if (b.fields && rec.perRow.length) warnings.push(tag + ': an empty template block is left beside the per-row blocks; remove it');
        answers[it.id] = rec;
      } else {
        answers[it.id] = readCheck(b.fields || {});
      }
      return;
    }
    var f = b.fields || {};
    if (naText(f.status || '')) { answers[it.id] = { status: 'na', reason: f.reason || '' }; return; }
    if (code(f.status || '') === 'unable') { answers[it.id] = { status: 'unable', reason: f.reason || '', searched: f.searched || '', evidence: f.evidence || '', asked: f.asked || '' }; return; }
    var rec2 = {};
    if (it.type === 'list') {
      var raw = parseTable(b.table, problems, tag);
      rec2.rows = raw.map(function (cells, idx) {
        if (cells.length > it.columns.length) problems.push(tag + ': table row ' + (idx + 1) + ' has ' + cells.length + ' cells but the table has ' + it.columns.length + ' columns (escape a | inside a cell as \\|)');
        else if (cells.length < it.columns.length) warnings.push(tag + ': table row ' + (idx + 1) + ' has only ' + cells.length + ' of ' + it.columns.length + ' cells');
        var row = {};
        it.columns.forEach(function (c, i) { row[c.key] = cells[i] || ''; });
        return normaliseRow(it, row, idx, tag, problems, warnings, fc[it.id]);
      });
    } else if (it.type === 'multiselect') {
      rec2.value = (f.value || '').split(/[,\n]/).map(function (s) { return code(s); }).filter(Boolean);
    } else if (it.type === 'text') {
      rec2.value = f.value || '';
    } else {
      rec2.value = code(f.value || '') || null;
    }
    if (it.detail) rec2.detail = f.detail || '';
    rec2.evidence = f.evidence || '';
    rec2.searched = f.searched || '';
    if (has(f.notes)) rec2.notes = f.notes;
    answers[it.id] = rec2;
  });
  return answers;
}
function recordsFromJson(schema, obj, mode, problems, warnings) {
  var answers = {};
  var src = isObj(obj.answers) ? obj.answers : {};
  var known = {};
  var fc = filterColumns(schema);
  var byId = {};
  schema.items.forEach(function (it) { known[it.id] = true; byId[it.id] = it; });
  Object.keys(src).forEach(function (id) { if (!own(known, id)) warnings.push(id + ': answer for an id that is not in this checklist'); });
  itemsOf(schema).mine.forEach(function (it) {
    var tag = it.section + ' ' + it.id;
    var r = own(src, it.id) ? src[it.id] : undefined;
    if (r === undefined) { answers[it.id] = { status: 'missing' }; return; }
    if (!isObj(r)) { problems.push(tag + ': answer is not an object'); answers[it.id] = { status: 'missing' }; return; }
    if (r.status === 'na' || r.status === 'missing') { answers[it.id] = { status: r.status, reason: r.reason || '', inferred: !!r.inferred }; return; }
    if (r.status === 'unable' && it.type !== 'check') { answers[it.id] = { status: 'unable', reason: r.reason || '', searched: r.searched || '', evidence: r.evidence || '', asked: r.asked || '' }; return; }
    var rec = {};
    if (it.type === 'check') {
      var single = it.forEach && !Array.isArray(r.perRow) && r.status && STATUSES.indexOf(code(r.status)) >= 0;
      if (it.forEach && Array.isArray(r.perRow)) {
        rec.perRow = r.perRow.map(function (x, i) {
          if (!isObj(x)) { problems.push(tag + ': perRow[' + i + '] is not an object'); return { row: i + 1, status: null }; }
          var row = Number(x.row);
          if (!(row >= 1)) { problems.push(tag + ': perRow[' + i + '] has no row number'); row = i + 1; }
          return { row: row, label: x.label || '', status: x.status ? code(x.status) : null, location: x.location || '', evidence: x.evidence || '', findings: x.findings || '', whyNoMore: x.whyNoMore || '', reason: x.reason || '', notes: x.notes || '', asked: x.asked || '' };
        });
      } else if (single && (mode === 'dev' || (byId[it.forEach] && byId[it.forEach].devText))) {
        rec.perRow = [{ row: 1, status: code(r.status), location: r.location || '', evidence: r.evidence || '', findings: r.findings || '', whyNoMore: r.whyNoMore || '', reason: r.reason || '', notes: r.notes || '', asked: r.asked || '' }];
        rec.single = true;
      } else if (it.forEach) {
        problems.push(tag + ': per-row item without a perRow array');
        rec.perRow = [];
      } else {
        rec.status = r.status ? code(r.status) : null;
        rec.location = r.location || ''; rec.evidence = r.evidence || ''; rec.findings = r.findings || ''; rec.whyNoMore = r.whyNoMore || ''; rec.reason = r.reason || ''; rec.notes = r.notes || ''; rec.asked = r.asked || '';
      }
      if (r.complete !== undefined) rec.claimedComplete = !!r.complete;
      answers[it.id] = rec;
      return;
    }
    if (it.type === 'list') {
      if (own(r, 'rows')) {
        if (!Array.isArray(r.rows)) { problems.push(tag + ': rows is not an array'); rec.rows = []; }
        else rec.rows = r.rows.map(function (x, i) { if (!isObj(x)) { problems.push(tag + ': rows[' + i + '] is not an object'); return {}; } return normaliseRow(it, Object.assign({}, x), i, tag, problems, warnings, fc[it.id]); });
      } else if ((mode === 'dev' || it.devText) && typeof r.value === 'string') {
        rec.rows = NONE_TEXT.test(r.value.trim()) ? [] : r.value.split(/\r?\n/).filter(has).map(function (line) { var o = {}; o[it.columns[0].key] = line; return o; });
        rec.fromText = true;
        if (NONE_TEXT.test(r.value.trim())) rec.none = true;
      } else { problems.push(tag + ': table answer without rows'); rec.rows = []; }
      if (r.none) rec.none = true;
    } else if (it.type === 'multiselect') {
      if (r.value === null || r.value === undefined) rec.value = [];
      else if (!Array.isArray(r.value)) { problems.push(tag + ': multiple-choice value is not an array'); rec.value = []; }
      else rec.value = r.value.map(function (v) { return code(v); });
    } else if (it.type === 'text') {
      if (Array.isArray(r.rows)) rec.value = r.rows.map(function (x) { return Object.keys(x).filter(function (k) { return k !== '_id'; }).map(function (k) { return x[k]; }).filter(has).join(' | '); }).join('\n');
      else rec.value = r.value === null || r.value === undefined ? '' : String(r.value);
    } else {
      rec.value = r.value === null || r.value === undefined ? null : code(r.value);
    }
    if (it.detail) rec.detail = r.detail || '';
    rec.evidence = r.evidence || '';
    rec.searched = r.searched || '';
    rec.notes = r.notes || '';
    if (r.complete !== undefined) rec.claimedComplete = !!r.complete;
    answers[it.id] = rec;
  });
  return answers;
}
function validate(schema, result, opts, problems, warnings) {
  var mode = opts.mode || 'ai';
  var dev = mode === 'dev';
  var profile = opts.profile || null;
  var NEG = schema.negativeValues || [];
  var io = itemsOf(schema);
  var all = io.all, lintPhase = io.lintPhase, mine = io.mine;
  var itemsById = {}, sectionsById = {};
  schema.items.forEach(function (it) { itemsById[it.id] = it; });
  schema.sections.forEach(function (s) { sectionsById[s.id] = s; });
  var tag = function (it) { return it.section + ' ' + it.id; };
  var files = opts.files || null;
  var citeSeen = {};
  function verifyCites(text, label) {
    if (!files || !has(text)) return true;
    var re = new RegExp(CITATION_RE.source, 'gi');
    var m, ok = true;
    while ((m = re.exec(String(text))) !== null) {
      var cite = m[0];
      var p = cite, line = null;
      var colon = cite.lastIndexOf(':');
      if (colon > 0 && /^\d+$/.test(cite.slice(colon + 1))) { line = parseInt(cite.slice(colon + 1), 10); p = cite.slice(0, colon); }
      if (line === null && p.indexOf('/') < 0 && p.indexOf('\\') < 0) continue;
      if (/[<>*{}]/.test(p) || p.indexOf('...') >= 0) continue;
      var key = label + '|' + p + ':' + (line === null ? '' : line);
      if (citeSeen[key]) continue;
      citeSeen[key] = true;
      var f = files.resolve(p);
      if (!f || !f.found) {
        if (line === null) warnings.push(label + ': mentions ' + cite + ', which is not in the project; fine if it describes something absent or generated, wrong if it was meant as a citation');
        else { problems.push(label + ': cites ' + cite + ', but no such file exists in the project. A citation must name a file you opened; never a placeholder or a guess'); ok = false; }
      }
      else if (line !== null && f.lines !== null && f.lines !== undefined && line > f.lines) { problems.push(label + ': cites ' + cite + ', but ' + f.path + ' has only ' + f.lines + ' lines'); ok = false; }
    }
    return ok;
  }
  function answerOf(id) {
    var it = itemsById[id];
    if (!it) return null;
    if (all || (it.phase || 'profile') === lintPhase) return result.answers[id] || null;
    if (!profile || !profile.answers) return undefined;
    return profile.answers[id] || null;
  }
  function liveValue(id) {
    var r = answerOf(id);
    if (!r) return undefined;
    if (r.status === 'unable') {
      var it = itemsById[id];
      if (it && it.options && it.options.indexOf('unknown') >= 0) return it.type === 'multiselect' ? ['unknown'] : 'unknown';
      return undefined;
    }
    return !r.status ? r.value : undefined;
  }
  function liveRows(id) { var r = answerOf(id); return r && r.rows ? r.rows : []; }
  function unsure(v) { return dev && (v === 'unsure' || (Array.isArray(v) && v.indexOf('unsure') >= 0)); }
  var applCache = {};
  function evalCond(c) {
    if (!c) return true;
    if (c.all) return c.all.every(evalCond);
    if (c.any) return c.any.some(evalCond);
    if (c.not) return !evalCond(c.not);
    var item = itemsById[c.q];
    if (!item) return false;
    if (!all && (item.phase || 'profile') !== lintPhase && !profile) return true;
    if (!applicable(item)) return false;
    var v = liveValue(c.q);
    if (unsure(v)) return true;
    if (own(c, 'eq')) return v === c.eq;
    if (c.in) return c.in.indexOf(v) >= 0;
    if (c.includes) return Array.isArray(v) && v.indexOf(c.includes) >= 0;
    if (c.includesAny) return Array.isArray(v) && c.includesAny.some(function (x) { return v.indexOf(x) >= 0; });
    if (c.notEmpty) return item.type === 'list' ? liveRows(c.q).length > 0 : (has(v) && !NONE_TEXT.test(String(v).trim()));
    return false;
  }
  function applicable(it) {
    if (own(applCache, it.id)) return applCache[it.id];
    applCache[it.id] = false;
    var sec = sectionsById[it.section];
    applCache[it.id] = evalCond(sec && sec.when) && evalCond(it.when);
    return applCache[it.id];
  }
  function condText(c) {
    if (!c) return '';
    if (c.all) return c.all.map(condText).join(' and ');
    if (c.any) return c.any.map(condText).join(' or ');
    if (c.not) return 'not (' + condText(c.not) + ')';
    var item = itemsById[c.q];
    var name = c.q + (item ? ' (' + item.title + ')' : '');
    if (own(c, 'eq')) return name + ' = ' + c.eq;
    if (c.in) return name + ' is one of ' + c.in.join(', ');
    if (c.includes) return name + ' includes ' + c.includes;
    if (c.includesAny) return name + ' includes any of ' + c.includesAny.join(', ');
    if (c.notEmpty) return name + ' has at least one row';
    return JSON.stringify(c);
  }
  function rowsText(it) {
    if (!it.forEach) return '';
    return it.forEach + ' has at least one row' + (it.forEachWhere ? ' where ' + it.forEachWhere.col + ' = ' + it.forEachWhere.eq : '');
  }
  function ruleText(it) {
    var parts = [];
    var sec = sectionsById[it.section];
    if (sec && sec.when) parts.push(condText(sec.when));
    if (it.when) parts.push(condText(it.when));
    if (it.forEach) parts.push(rowsText(it));
    return parts.join('; and ');
  }
  function noRowsText(it) { return it.forEach + ' has no ' + (it.forEachWhere ? 'rows where ' + it.forEachWhere.col + ' = ' + it.forEachWhere.eq : 'rows'); }
  function expectedRows(it) {
    var src = itemsById[it.forEach];
    if (!src) return null;
    if ((all || (src.phase || 'profile') === lintPhase) && !applicable(src)) return [];
    var a = answerOf(it.forEach);
    if (a === undefined) return null;
    var rows = a && a.rows ? a.rows : [];
    var w = it.forEachWhere;
    if (w) rows = rows.filter(function (r) { return !own(r, w.col) || code(r[w.col]) === code(w.eq); });
    return rows;
  }
  var summary = { items: mine.length, complete: 0, incomplete: 0, na: 0, inferredNa: 0, freeTextNa: 0, missing: 0, undetermined: 0 };
  var neg = function (it) { return NEG.concat(it.negativeValues || []); };
  function answered(it, rec) {
    if (it.type === 'list') return rec.rows.length > 0 || (dev && !!rec.none);
    if (it.type === 'multiselect') return rec.value.length > 0;
    return has(rec.value);
  }
  function checkBlock(it, r, label) {
    var ok = true;
    if (!r.status) { problems.push(label + ': Status is empty'); return false; }
    if (STATUSES.indexOf(r.status) < 0) { problems.push(label + ': Status "' + r.status + '" is not one of ' + STATUSES.join(', ')); return false; }
    if (dev) {
      if (r.status === 'finding' && !has(r.findings)) { problems.push(label + ': Problem found without a description'); ok = false; }
      return ok;
    }
    if (r.status === 'pass') {
      if (!has(r.location)) { problems.push(label + ': pass without Location (the line that does the check)'); ok = false; }
      if (!has(r.evidence)) { problems.push(label + ': pass without Evidence citing the check'); ok = false; }
      else if (!CITATION_RE.test(r.evidence)) { problems.push(label + ': pass whose Evidence cites no file (expected path:line)'); ok = false; }
      if (!has(r.whyNoMore)) { problems.push(label + ': pass without "Why no more findings"'); ok = false; }
    } else if (r.status === 'finding') {
      if (!has(r.location)) { problems.push(label + ': finding without Location'); ok = false; }
      if (!has(r.findings)) { problems.push(label + ': finding without Findings text'); ok = false; }
      if (!has(r.evidence)) { problems.push(label + ': finding without Evidence'); ok = false; }
      if (!has(r.whyNoMore)) warnings.push(label + ': finding without "Why no more findings"; other paths may be unexamined');
    } else if (r.status === 'unable') {
      if (!has(r.evidence) && !has(r.findings)) { problems.push(label + ': unable without Evidence saying what was read and where the trail ended'); ok = false; }
      if (!has(r.asked)) { problems.push(label + ': unable without an Asked record. Ask the developer before concluding this cannot be determined, then add an Asked: line saying what you asked and what was answered, or that no one was there to answer'); ok = false; }
      if (!has(r.location)) warnings.push(label + ': unable without Location; say where the trail ended so QA can start there');
    } else if (r.status === 'na') {
      if (!has(r.reason)) { problems.push(label + ': na without Reason'); ok = false; }
    }
    return ok;
  }
  function isComplete(it, rec, isAnswered) {
    var ok = true;
    if (it.type !== 'list' && it.type !== 'text' && isAnswered) {
      var allowed = (it.type === 'yesno' ? ['yes', 'no'] : it.options).concat(dev ? ['unsure'] : []);
      var bad = (Array.isArray(rec.value) ? rec.value : [rec.value]).filter(function (v) { return allowed.indexOf(v) < 0; });
      if (bad.length) { problems.push(tag(it) + ': value "' + bad.join('", "') + '" is not one of ' + allowed.join(', ')); ok = false; }
    }
    if (!isAnswered && !(it.type === 'list' && !dev && has(rec.searched))) { problems.push(tag(it) + ': not answered'); return false; }
    if (it.optional) {
      if (it.findings && rec.rows) {
        var sevCol = it.columns.filter(function (c) { return c.key === 'severity'; })[0];
        rec.rows.forEach(function (row, i) {
          if (!has(row.location)) { problems.push(tag(it) + ': issue row ' + (i + 1) + ' has no location'); ok = false; }
          else if (!verifyCites(row.location, tag(it) + ' issue row ' + (i + 1))) ok = false;
          if (!has(row.description)) { problems.push(tag(it) + ': issue row ' + (i + 1) + ' has no description'); ok = false; }
          if (sevCol && sevCol.options && sevCol.options.indexOf(code(row.severity)) < 0) { problems.push(tag(it) + ': issue row ' + (i + 1) + ' severity "' + row.severity + '" is not one of ' + sevCol.options.join(', ')); ok = false; }
        });
      }
      return ok;
    }
    if (dev) return ok;
    if (it.type === 'list' && it.warnRows && rec.rows) {
      var w = it.warnRows;
      var hit = rec.rows.filter(function (row) { return code(row[w.col]) === code(w.eq); }).length;
      if (hit) warnings.push(tag(it) + ': ' + hit + ' row' + (hit === 1 ? '' : 's') + ' with ' + w.col + ' = ' + w.eq + '; ' + w.text);
    }
    var n = neg(it);
    var isNeg = it.type === 'list' ? rec.rows.length === 0
      : (Array.isArray(rec.value) ? rec.value.some(function (v) { return n.indexOf(v) >= 0; })
        : (n.indexOf(rec.value) >= 0 || (it.type === 'text' && NONE_TEXT.test(String(rec.value).trim()))));
    if (isNeg && !has(rec.searched)) { problems.push(tag(it) + ': negative answer without a Searched record listing the signals and directories searched'); ok = false; }
    if (it.default !== undefined && !has(rec.evidence)) { problems.push(tag(it) + ': fleet default not confirmed with evidence'); ok = false; }
    else if (!has(rec.evidence) && !(isNeg && has(rec.searched))) { problems.push(tag(it) + ': no evidence cited'); ok = false; }
    else if (has(rec.evidence) && !isNeg && !CITATION_RE.test(rec.evidence)) warnings.push(tag(it) + ': Evidence does not cite a file (expected path:line); if there is no file to cite, the answer is a negative and belongs in Searched');
    return ok;
  }
  function noteClaim(it, rec, computed) {
    if (rec.claimedComplete !== undefined && rec.claimedComplete !== computed) warnings.push(tag(it) + ': file says complete=' + rec.claimedComplete + ' but the rules say ' + computed);
  }
  function directGate(it) {
    return it.type === 'list' && it.when && own(it.when, 'eq') && it.when.eq === 'yes' && !it.optional;
  }
  mine.forEach(function (it) {
    var rec = result.answers[it.id];
    var on = applicable(it);
    var exp = it.forEach ? expectedRows(it) : null;
    var noRows = on && it.forEach && exp && exp.length === 0;
    if (noRows) on = false;
    if (rec.status === 'missing') {
      if (on) {
        if (dev) { warnings.push(tag(it) + ': not present in this result (skipped in the developer form?)'); result.answers[it.id] = { status: 'na', reason: 'not in this result', inferred: true }; summary.na++; }
        else { problems.push(tag(it) + ': no answer found'); summary.missing++; }
      } else { result.answers[it.id] = { status: 'na', reason: 'rule: ' + (noRows ? noRowsText(it) : ruleText(it)), inferred: true }; summary.na++; summary.inferredNa++; }
      return;
    }
    if (it.type === 'check' && rec.status === 'na' && !rec.perRow) {
      if (it.forEach && exp && exp.length > 0) { problems.push(tag(it) + ': marked na as a whole, but ' + it.forEach + ' has ' + exp.length + ' matching row' + (exp.length === 1 ? '' : 's') + ' that each need a block'); summary.incomplete++; return; }
      if (rec.inferred && on) { problems.push(tag(it) + ': marked na by rule, but the rule (' + ruleText(it) + ') is met by the answers'); summary.incomplete++; }
      else if (!rec.inferred && !has(rec.reason)) { problems.push(tag(it) + ': na without Reason'); summary.incomplete++; }
      else if (!rec.inferred && on && !/^rule:/.test(rec.reason)) { warnings.push(tag(it) + ': marked na with a free-text reason ("' + rec.reason.slice(0, 60) + '") although its rule is met; make sure this is not avoidance'); summary.freeTextNa++; summary.na++; }
      else summary.na++;
      return;
    }
    if (it.type === 'check') {
      if (it.forEach) {
        var rows = rec.perRow;
        var allNa = rows.length > 0 && rows.every(function (r) { return r.status === 'na'; });
        if (allNa && (!on || (exp && exp.length === 0))) {
          result.answers[it.id] = { status: 'na', reason: rows[0].reason || ('rule: ' + noRowsText(it)) };
          summary.na++;
          return;
        }
        if (!on) {
          if (rows.length && rows.some(function (r) { return r.status; })) {
            if (noRows) { problems.push(tag(it) + ': has per-row blocks, but ' + noRowsText(it) + '; either add the rows to ' + it.forEach + ' or mark this item na'); summary.incomplete++; return; }
            warnings.push(tag(it) + ': answered although its rule (' + ruleText(it) + ') is not met; kept');
          } else { result.answers[it.id] = { status: 'na', reason: 'rule: ' + (noRows ? noRowsText(it) : ruleText(it)), inferred: true }; summary.na++; summary.inferredNa++; return; }
        }
        var allOk = true;
        if (exp && !rec.single) {
          rec.expectedRows = exp.length;
          for (var n = 1; n <= exp.length; n++) {
            if (!rows.some(function (r) { return r.row === n; })) { problems.push(tag(it) + ': no answer block for row=' + n + ' of ' + it.forEach); allOk = false; }
          }
          rows.forEach(function (r) { if (r.row > exp.length) warnings.push(tag(it) + ' row=' + r.row + ': ' + it.forEach + ' has only ' + exp.length + ' matching rows'); });
        } else if (!rows.length) { problems.push(tag(it) + ': no per-row answers (row=1, row=2, ...)'); allOk = false; }
        if (rows.length === 0 && rec.template && rec.template.status) { problems.push(tag(it) + ': the template block was filled instead of per-row blocks; add row=N to each block'); allOk = false; }
        rows.forEach(function (r) {
          r.complete = checkBlock(it, r, tag(it) + ' row=' + r.row);
          var cl1 = verifyCites(r.location, tag(it) + ' row=' + r.row), ce1 = verifyCites(r.evidence, tag(it) + ' row=' + r.row);
          if (!cl1 || !ce1) r.complete = false;
          if (!r.complete) allOk = false;
          if (r.status === 'na' && on && !/^rule:/.test(r.reason || '')) { summary.freeTextNa++; }
        });
        delete rec.template;
        rec.complete = allOk;
      } else {
        if (!on) {
          if (rec.status) { warnings.push(tag(it) + ': answered although its rule (' + ruleText(it) + ') is not met; kept'); }
          else { result.answers[it.id] = { status: 'na', reason: 'rule: ' + ruleText(it), inferred: true }; summary.na++; summary.inferredNa++; return; }
        }
        rec.complete = checkBlock(it, rec, tag(it));
        var cl2 = verifyCites(rec.location, tag(it)), ce2 = verifyCites(rec.evidence, tag(it));
        if (!cl2 || !ce2) rec.complete = false;
        if (rec.status === 'na' && on && !/^rule:/.test(rec.reason || '')) { warnings.push(tag(it) + ': marked na with a free-text reason ("' + (rec.reason || '').slice(0, 60) + '") although its rule is met; make sure this is not avoidance'); summary.freeTextNa++; }
      }
      noteClaim(it, rec, rec.complete);
      delete rec.claimedComplete;
      if (rec.complete) summary.complete++; else summary.incomplete++;
      return;
    }
    if (rec.status === 'na') {
      if (on && !rec.inferred) { problems.push(tag(it) + ': marked na, but its rule (' + ruleText(it) + ') is met by the answers'); summary.incomplete++; }
      else if (on && rec.inferred && !dev) { problems.push(tag(it) + ': marked na by rule, but the rule (' + ruleText(it) + ') is met by the answers'); summary.incomplete++; }
      else summary.na++;
      return;
    }
    if (rec.status === 'unable') {
      if (!on) { result.answers[it.id] = { status: 'na', reason: 'rule: ' + ruleText(it), inferred: true }; summary.na++; summary.inferredNa++; return; }
      if (!dev && !has(rec.reason)) { problems.push(tag(it) + ': unable without Reason; say what you read and where the trail ended'); summary.incomplete++; return; }
      if (!dev && !has(rec.searched)) { problems.push(tag(it) + ': unable without a Searched record; say what you looked for before concluding it cannot be settled here'); summary.incomplete++; return; }
      if (!dev && !has(rec.asked)) { problems.push(tag(it) + ': unable without an Asked record. Ask the developer before concluding this cannot be determined, then add an Asked: line saying what you asked and what was answered, or that no one was there to answer'); summary.incomplete++; return; }
      rec.complete = false;
      summary.undetermined++;
      return;
    }
    var isAnswered = answered(it, rec);
    if (it.optional && !isAnswered) { rec.complete = true; summary.complete++; return; }
    if (!on) {
      if (isAnswered) { warnings.push(tag(it) + ': answered although its rule (' + ruleText(it) + ') is not met; kept, but check the rule'); summary.complete++; rec.complete = true; }
      else { result.answers[it.id] = { status: 'na', reason: 'rule: ' + ruleText(it), inferred: true }; summary.na++; summary.inferredNa++; }
      return;
    }
    if (directGate(it) && rec.rows.length === 0 && !(dev && rec.none)) {
      problems.push(tag(it) + ': the table is empty although ' + condText(it.when) + '; either list the entries or change that answer');
      rec.complete = false; summary.incomplete++; return;
    }
    rec.complete = isComplete(it, rec, isAnswered);
    if (!verifyCites(rec.evidence, tag(it))) rec.complete = false;
    noteClaim(it, rec, rec.complete);
    delete rec.claimedComplete;
    if (rec.complete) summary.complete++; else summary.incomplete++;
  });
  result.findings = [];
  mine.forEach(function (it) {
    var r = result.answers[it.id];
    if (!r) return;
    if (it.findings && r.rows) r.rows.forEach(function (row) { var f = { item: it.id }; Object.keys(row).forEach(function (k) { if (k !== '_id') f[k] = row[k]; }); result.findings.push(f); });
    if (it.type === 'check') {
      if (r.perRow) r.perRow.forEach(function (x) { if (x.status === 'finding') result.findings.push({ item: it.id, row: x.row, location: x.location, description: x.findings, severity: it.severity }); });
      else if (r.status === 'finding') result.findings.push({ item: it.id, location: r.location, description: r.findings, severity: it.severity });
    }
  });
  result.endpoints = [];
  mine.forEach(function (it) {
    if (it.inventory !== 'endpoints') return;
    var r = result.answers[it.id];
    if (!r || !r.rows) return;
    r.rows.forEach(function (row) {
      result.endpoints.push({ methods: row.methods || '', url: row.path || row.url || '', handler: row.handler || '', isPublic: row.isPublic || '', idParams: row.idParams || '', idSource: row.idSource || '', returnsData: row.returnsData || '', mutates: row.mutates || '' });
    });
  });
  return summary;
}
function lint(md, schema, opts) {
  opts = opts || {};
  var problems = [], warnings = [];
  var io = itemsOf(schema);
  var itemsById = {};
  schema.items.forEach(function (it) { itemsById[it.id] = it; });
  var parsed = parseAnswers(md, itemsById);
  var blocks = parsed.blocks;
  if (parsed.unbalanced) problems.push('DOC: an answer block is not closed (an <!-- answer --> without a matching <!-- /answer -->)');
  parsed.duplicates.forEach(function (id) { problems.push(id + ': answer block appears more than once'); });
  parsed.notes.forEach(function (n) { (n.problem ? problems : warnings).push(n.text); });
  Object.keys(blocks).forEach(function (id) { if (id !== 'META' && id !== 'SELFCHECK' && !itemsById[id]) warnings.push(id + ': answer block for an id that is not in this checklist'); });
  var needsProfile = !io.all && schema.items.some(function (it) { return (it.phase || 'profile') !== io.lintPhase; });
  if (needsProfile && !opts.profile) warnings.push('DOC: no profile result available; branching rules are treated as met and per-row counts are not verified. Pass --profile <profile-result.json>.');
  var meta = blocks.META ? blocks.META.fields : {};
  var result = {
    checklist: schema.id, version: schema.version, title: schema.title, phase: io.lintPhase,
    app: opts.app || meta.application || (opts.profile && opts.profile.app) || '',
    reviewer: opts.reviewer || meta.reviewer || 'ai',
    reviewerKind: 'ai',
    exportedAt: new Date().toISOString(),
    source: opts.source || '',
    profileUsed: !!opts.profile,
    answers: recordsFromBlocks(schema, blocks, problems, warnings)
  };
  if (!has(result.app)) problems.push('META: Application is empty (use the artifactId from C-01)');
  else if (/\s/.test(result.app.trim())) warnings.push('META: Application contains spaces; the form matches results by this string, so use the artifactId alone');
  result.selfCheck = blocks.SELFCHECK && blocks.SELFCHECK.fields ? (blocks.SELFCHECK.fields.text || '') : '';
  var summary = validate(schema, result, { mode: 'ai', profile: opts.profile, files: opts.files }, problems, warnings);
  return { result: result, problems: problems, warnings: warnings, summary: summary };
}
function lintJson(obj, schema, opts) {
  opts = opts || {};
  var problems = [], warnings = [];
  if (!isObj(obj)) { problems.push('FILE: the JSON is not an object'); return { result: null, problems: problems, warnings: warnings, summary: { items: 0, complete: 0, incomplete: 0, na: 0, inferredNa: 0, freeTextNa: 0, missing: 0 } }; }
  if (obj.checklist !== schema.id) problems.push('FILE: checklist is "' + obj.checklist + '", expected "' + schema.id + '"');
  if (String(obj.version || '') !== String(schema.version)) warnings.push('FILE: written for checklist version ' + obj.version + '; this checklist is ' + schema.version + '. Items may have changed.');
  if (!isObj(obj.answers)) problems.push('FILE: answers is missing or not an object');
  if (obj.findings !== undefined && !Array.isArray(obj.findings)) problems.push('FILE: findings is not an array');
  var mode = obj.reviewerKind === 'dev' ? 'dev' : 'ai';
  if (obj.reviewerKind !== 'dev' && obj.reviewerKind !== 'ai') warnings.push('FILE: reviewerKind is "' + obj.reviewerKind + '"; expected dev or ai (checked as ai)');
  if (mode === 'ai' && obj.lintProblems === undefined) warnings.push('FILE: no lintProblems stamp; this file was not written by the linter, so it may be a snapshot');
  var result = {
    checklist: schema.id, version: schema.version, title: schema.title, phase: obj.phase || (schema.lintPhase || 'profile'),
    app: obj.app || '', reviewer: obj.reviewer || '', reviewerKind: mode,
    exportedAt: obj.exportedAt || '', source: opts.source || '',
    fileVersion: obj.version || '',
    answers: recordsFromJson(schema, obj, mode, problems, warnings)
  };
  if (!has(result.app)) problems.push('FILE: app is empty');
  if (typeof obj.selfCheck === 'string') result.selfCheck = obj.selfCheck;
  var summary = validate(schema, result, { mode: mode, profile: opts.profile, files: opts.files }, problems, warnings);
  if (Array.isArray(obj.findings)) {
    var derived = result.findings.length;
    if (obj.findings.length !== derived) warnings.push('FILE: findings has ' + obj.findings.length + ' entries but the answers imply ' + derived);
  }
  return { result: result, problems: problems, warnings: warnings, summary: summary };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { schemaFromDefinition: schemaFromDefinition, extractSchema: extractSchema, parseAnswers: parseAnswers, lint: lint, lintJson: lintJson };
}

var VALUE_OPTS = ['json', 'doc', 'app', 'reviewer', 'profile', 'definition', 'project', 'tasks', 'report', 'pdf', 'browser'];
var RESULT_FILE = 'ai-result.json', REPORT_HTML = 'review-report.html', REPORT_PDF = 'review-report.pdf';
function findBrowser(fs, path, explicit) {
  function isFile(p) { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }
  if (explicit) return isFile(explicit) ? explicit : null;
  var env = process.env, cands = [];
  ['CHECKLIST_BROWSER', 'CHROME_PATH', 'EDGE_PATH'].forEach(function (k) { if (env[k]) cands.push(env[k]); });
  [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA].forEach(function (b) {
    if (!b) return;
    cands.push(path.join(b, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    cands.push(path.join(b, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  });
  cands.push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium');
  var names = ['msedge', 'microsoft-edge', 'microsoft-edge-stable', 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome'];
  String(env.PATH || env.Path || '').split(path.delimiter).forEach(function (dir) {
    if (!dir) return;
    names.forEach(function (n) { cands.push(path.join(dir, n)); if (process.platform === 'win32') cands.push(path.join(dir, n + '.exe')); });
  });
  for (var i = 0; i < cands.length; i++) { if (isFile(cands[i])) return cands[i]; }
  return null;
}
function isPdf(fs, p) {
  try { var b = fs.readFileSync(p); return b.length > 500 && b.slice(0, 5).toString('latin1') === '%PDF-'; } catch (e) { return false; }
}
function printPdf(fs, path, browser, htmlPath, pdfPath) {
  var abs = path.resolve(htmlPath).replace(/\\/g, '/');
  var url = 'file://' + (abs.charAt(0) === '/' ? '' : '/') + encodeURI(abs).replace(/#/g, '%23');
  var out = path.resolve(pdfPath);
  try { fs.unlinkSync(out); } catch (e) {  }
  var r = require('child_process').spawnSync(browser, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--no-pdf-header-footer', '--print-to-pdf-no-header', '--virtual-time-budget=5000', '--print-to-pdf=' + out, url], { encoding: 'utf8', timeout: 180000 });
  if (r.error) return { ok: false, why: r.error.message };
  if (!isPdf(fs, out)) return { ok: false, why: 'the browser exited with ' + r.status + ' and wrote no valid PDF' + (r.stderr ? ' (' + String(r.stderr).split('\n')[0].slice(0, 160) + ')' : '') };
  return { ok: true, bytes: fs.statSync(out).size };
}
var REPORT_CSS = [
  '@page { margin: 14mm; }',
  'body { font: 11pt/1.45 system-ui, "Segoe UI", Roboto, sans-serif; color: #111; margin: 0; }',
  'h1 { font-size: 19pt; margin: 0 0 2px; } h2 { font-size: 14pt; margin: 22px 0 6px; border-bottom: 1px solid #bbb; padding-bottom: 3px; }',
  'h3 { font-size: 11.5pt; margin: 0 0 3px; }',
  '.sub { color: #555; margin: 0 0 14px; font-size: 10pt; }',
  '.counts { border: 1px solid #bbb; padding: 8px 10px; margin: 10px 0 18px; font-size: 10pt; }',
  '.counts b { font-size: 12pt; }',
  'table { border-collapse: collapse; width: 100%; margin: 6px 0 14px; }',
  'th, td { border: 1px solid #bbb; padding: 4px 6px; font-size: 9.5pt; text-align: left; vertical-align: top; }',
  'th { background: #eee; }',
  'code, .mono { font-family: Consolas, "Courier New", monospace; font-size: 9.5pt; }',
  '.item { break-inside: avoid; page-break-inside: avoid; border-left: 3px solid #ccc; padding: 0 0 0 10px; margin: 12px 0; }',
  '.item.finding { border-left-color: #b42318; } .item.pass { border-left-color: #1a7f37; }',
  '.item.unable, .item.open { border-left-color: #9a6700; } .item.na { border-left-color: #ddd; color: #666; }',
  '.id { font-family: Consolas, monospace; font-size: 9pt; color: #555; }',
  '.state { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .05em; padding: 1px 5px; border: 1px solid #999; border-radius: 3px; margin-left: 6px; }',
  '.state-finding { color: #b42318; border-color: #b42318; } .state-pass { color: #1a7f37; border-color: #1a7f37; }',
  '.state-unable, .state-open { color: #9a6700; border-color: #9a6700; }',
  '.f { margin: 2px 0; font-size: 10pt; } .f b { color: #333; }',
  '.row { margin: 6px 0 6px 10px; padding-left: 8px; border-left: 2px solid #ddd; }',
  '.muted { color: #666; } .sev-high { color: #b42318; font-weight: 700; }',
  'ul { margin: 4px 0 10px; padding-left: 20px; } li { margin: 2px 0; font-size: 10pt; }'
].join('\n');
function esc(v) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function field(label, value) { return has(value) ? '<p class="f"><b>' + esc(label) + ':</b> ' + esc(value) + '</p>' : ''; }
function tableOf(cols, rows, cell) {
  var o = ['<table><thead><tr>'];
  cols.forEach(function (c) { o.push('<th>' + esc(c) + '</th>'); });
  o.push('</tr></thead><tbody>');
  rows.forEach(function (r, i) {
    o.push('<tr>');
    cols.forEach(function (c, j) { o.push('<td>' + cell(r, j, i) + '</td>'); });
    o.push('</tr>');
  });
  o.push('</tbody></table>');
  return o.join('');
}
function answerBody(it, rec) {
  var o = [];
  if (rec.status === 'na') return field('Not applicable', rec.reason || 'by rule');
  if (rec.status === 'missing') return '<p class="f muted">Not answered.</p>';
  if (it.type === 'check') {
    var blocks = rec.perRow && rec.perRow.length ? rec.perRow : [rec];
    blocks.forEach(function (b, i) {
      var head = rec.perRow ? ('<p class="f mono"><b>' + esc(b.label || ('row ' + (b.row || (i + 1)))) + '</b>' + stateTag(b.status) + '</p>') : '';
      o.push('<div class="' + (rec.perRow ? 'row' : '') + '">' + head
        + field('Location', b.location) + field('Evidence', b.evidence)
        + field('Findings', b.findings) + field('Why no more findings', b.whyNoMore)
        + field('Reason', b.reason) + field('Asked', b.asked) + '</div>');
    });
    return o.join('');
  }
  if (it.type === 'list') {
    var cols = (it.columns || []).map(function (c) { return c.label; });
    var keys = (it.columns || []).map(function (c) { return c.key; });
    if (rec.rows && rec.rows.length) o.push(tableOf(cols, rec.rows, function (r, j) { return esc(r[keys[j]]); }));
    else o.push('<p class="f muted">None.</p>');
  } else {
    var v = Array.isArray(rec.value) ? rec.value.join(', ') : rec.value;
    o.push(field('Answer', v));
    o.push(field('Detail', rec.detail));
  }
  o.push(field('Evidence', rec.evidence));
  o.push(field('Searched', rec.searched));
  o.push(field('Notes', rec.notes));
  return o.join('');
}
function stateTag(st) { return st ? '<span class="state state-' + esc(st) + '">' + esc(st) + '</span>' : ''; }
function itemState(it, rec) {
  if (!rec || rec.status === 'missing') return 'open';
  if (rec.status === 'na') return 'na';
  if (it.type !== 'check') return rec.status === 'unable' ? 'unable' : (rec.complete ? 'pass' : 'open');
  var blocks = rec.perRow && rec.perRow.length ? rec.perRow : [rec];
  var st = 'pass', i;
  for (i = 0; i < blocks.length; i++) {
    if (blocks[i].status === 'finding') return 'finding';
    if (blocks[i].status === 'unable') st = 'unable';
    else if (blocks[i].status !== 'pass' && st !== 'unable') st = 'open';
  }
  return st;
}
function unsettledOf(schema, result) {
  var out = [];
  schema.items.forEach(function (it) {
    var rec = result.answers[it.id];
    if (!rec) return;
    if (rec.status === 'unable') out.push({ what: it.id + ' ' + it.title, why: rec.reason || rec.evidence || '', asked: rec.asked || '' });
    if (Array.isArray(rec.perRow)) {
      rec.perRow.forEach(function (b) {
        if (b && b.status === 'unable') out.push({ what: it.id + ' row ' + b.row + (b.label ? ' (' + b.label + ')' : ''), why: b.evidence || b.findings || b.reason || '', asked: b.asked || '' });
      });
    }
    if (it.warnRows && rec.rows) {
      rec.rows.forEach(function (r) {
        if (String(r[it.warnRows.col] || '').trim().toLowerCase() === String(it.warnRows.eq).toLowerCase()) {
          out.push({ what: it.id + ' ' + (r[(it.columns[0] || {}).key] || 'row'), why: it.warnRows.text, asked: '' });
        }
      });
    }
  });
  return out;
}
function buildReport(schema, result, summary) {
  var o = ['<!doctype html><html lang="en"><head><meta charset="utf-8">'];
  o.push('<title>' + esc(schema.title || 'Security review') + ' - ' + esc(result.app || 'application') + '</title>');
  o.push('<style>' + REPORT_CSS + '</style></head><body>');
  o.push('<h1>' + esc(schema.title || 'Security review') + '</h1>');
  o.push('<p class="sub">' + esc(result.app || 'application not named') + ' &middot; reviewed by ' + esc(result.reviewer || 'unknown')
    + ' (' + esc(result.reviewerKind || 'ai') + ') &middot; ' + esc(String(result.exportedAt || '').slice(0, 10))
    + ' &middot; checklist ' + esc(schema.id) + ' v' + esc(schema.version) + '</p>');
  o.push('<div class="counts"><b>' + result.findings.length + '</b> issue(s) recorded. '
    + summary.complete + ' of ' + summary.items + ' items complete, ' + summary.incomplete + ' incomplete, '
    + summary.na + ' not applicable, ' + (summary.undetermined || 0) + ' undetermined, ' + summary.missing + ' unanswered. '
    + 'Linter: ' + (result.lintProblems || 0) + ' problem(s), ' + (result.lintWarnings || 0) + ' warning(s).</div>');
  var tail = ['<h2>All issues found</h2>'];
  var sevOrder = { high: 0, medium: 1, low: 2 };
  var fs2 = result.findings.slice().sort(function (a, b) {
    var x = sevOrder[String(a.severity).toLowerCase()], y = sevOrder[String(b.severity).toLowerCase()];
    return (x === undefined ? 3 : x) - (y === undefined ? 3 : y);
  });
  tail.push('<h3 style="margin-top:14px">Issues found: ' + fs2.length + '</h3>');
  if (fs2.length) {
    tail.push(tableOf(['Item', 'Where', 'What', 'Severity'], fs2, function (f, j) {
      if (j === 0) return '<span class="mono">' + esc(f.item + (f.row ? ' row ' + f.row : '')) + '</span>';
      if (j === 1) return esc([f.label, f.location].filter(has).join(' '));
      if (j === 2) return esc(f.description || f.findings || '');
      return '<span class="' + (String(f.severity).toLowerCase() === 'high' ? 'sev-high' : '') + '">' + esc(f.severity || '') + '</span>';
    }));
  } else tail.push('<p class="f muted">No issues recorded.</p>');
  var unsettled = unsettledOf(schema, result);
  if (unsettled.length) {
    tail.push('<h3 style="margin-top:18px">Not settled: ' + unsettled.length + '</h3>');
    tail.push('<p class="f muted">Answered as far as reading allowed. Each of these is a question for the developers or a test for QA.</p>');
    tail.push('<ul>');
    unsettled.forEach(function (u) {
      tail.push('<li><b>' + esc(u.what) + '</b>' + (has(u.why) ? ' &mdash; ' + esc(u.why) : '')
        + (has(u.asked) ? ' <span class="muted">(' + esc(u.asked) + ')</span>' : '') + '</li>');
    });
    tail.push('</ul>');
  }
  var eps = result.endpoints || [];
  if (eps.length) {
    tail.push('<h3 style="margin-top:18px">All endpoints: ' + eps.length + '</h3>');
    tail.push(tableOf(['Method', 'URL', 'Handler', 'Public', 'Id source', 'Writes'], eps, function (e, j) {
      if (j === 0) return esc(e.methods);
      if (j === 1) return '<span class="mono">' + esc(e.url) + '</span>';
      if (j === 2) return esc(e.handler);
      if (j === 3) return esc(e.isPublic);
      if (j === 4) return esc(e.idSource);
      return esc(e.mutates);
    }));
  }
  o.push('<h2>The review, topic by topic</h2>');
  var bySection = {};
  schema.items.forEach(function (it) { (bySection[it.section] = bySection[it.section] || []).push(it); });
  schema.sections.forEach(function (sec) {
    var items = bySection[sec.id] || [];
    if (!items.length) return;
    o.push('<h3 style="margin-top:16px">' + esc(sec.id + ' ' + sec.title) + '</h3>');
    items.forEach(function (it) {
      var rec = result.answers[it.id] || { status: 'missing' };
      var st = itemState(it, rec);
      o.push('<div class="item ' + st + '"><h3><span class="id">' + esc(it.id) + '</span> ' + esc(it.title)
        + (it.type === 'check' ? stateTag(st) : '') + '</h3>' + answerBody(it, rec) + '</div>');
    });
  });
  o = o.concat(tail);
  if (has(result.selfCheck)) { o.push('<h2>Self-check</h2><p class="f">' + esc(result.selfCheck) + '</p>'); }
  o.push('</body></html>');
  return o.join('\n');
}
var TASK_LINE = /^\s*[-*]\s*\[( |x|X)\]\s*(?:\d+[.)]\s*)?(META|SELFCHECK|RESULT|REPORT|[CRF]-\d{2})\b/;
function taskEntries(schema) {
  var entries = [{ id: 'META', title: 'Application and reviewer' }];
  schema.items.forEach(function (it) { entries.push({ id: it.id, title: it.title + (it.forEach ? ' (one block per row of ' + it.forEach + ')' : '') }); });
  entries.push({ id: 'SELFCHECK', title: 'Self-check block' });
  entries.push({ id: 'RESULT', title: 'Write ' + RESULT_FILE + ' with --json and lint it' });
  entries.push({ id: 'REPORT', title: 'Write ' + REPORT_PDF + ' with --report ' + REPORT_HTML + ' --pdf ' + REPORT_PDF + ' (required)' });
  return entries;
}
function readTasks(text) {
  var ticks = {}, count = 0;
  text.split(/\r?\n/).forEach(function (line) {
    var m = line.match(TASK_LINE);
    if (m) { ticks[m[2]] = m[1] !== ' '; count++; }
  });
  return { ticks: ticks, count: count };
}
function blockWritten(rec) {
  if (!rec || rec.status === 'missing' || rec.inferred) return false;
  if (rec.status === 'na' || rec.status === 'unable') return true;
  if (Array.isArray(rec.perRow)) return rec.perRow.some(function (p) { return p && p.status; });
  if (rec.status) return true;
  if (Array.isArray(rec.rows)) return rec.rows.length > 0 || !!(rec.searched && String(rec.searched).trim());
  if (Array.isArray(rec.value)) return rec.value.length > 0;
  return !!((rec.value !== undefined && rec.value !== null && String(rec.value).trim()) || (rec.evidence && String(rec.evidence).trim()) || (rec.searched && String(rec.searched).trim()));
}
var DEPS_DIR = 'review-deps';
var SKIP_DIRS = ['node_modules', '.git', '.svn', 'target', 'build', 'dist', 'out', '.idea', '.gradle', 'bin', '.angular', DEPS_DIR];
var PROJECT_MARKERS = ['src', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'package.json', 'web.xml'];
function fileIndex(fs, path, root) {
  var all = [], byName = {}, count = 0, stopped = false;
  function walk(dir, rel) {
    if (stopped) return;
    var names;
    try { names = fs.readdirSync(dir); } catch (e) { return; }
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      if (SKIP_DIRS.indexOf(n) >= 0) continue;
      var full = path.join(dir, n), st;
      try { st = fs.statSync(full); } catch (e) { continue; }
      var r = rel ? rel + '/' + n : n;
      if (st.isDirectory()) walk(full, r);
      else {
        if (++count > 60000) { stopped = true; return; }
        all.push(r);
        var b = n.toLowerCase();
        if (!byName[b]) byName[b] = [];
        byName[b].push(r);
      }
    }
  }
  walk(root, '');
  var exact = {};
  all.forEach(function (p) { exact[p.toLowerCase()] = p; });
  var lineCache = {};
  function countLines(full) {
    if (lineCache[full] === undefined) {
      try { var t = fs.readFileSync(full, 'utf8'); lineCache[full] = t.length === 0 ? 0 : t.split('\n').length - (t.charAt(t.length - 1) === '\n' ? 1 : 0); }
      catch (e) { lineCache[full] = null; }
    }
    return lineCache[full];
  }
  return {
    root: root, count: all.length, truncated: stopped,
    resolve: function (p) {
      var q = String(p).replace(/\\/g, '/').replace(/^\.\//, '');
      if (q.indexOf('../') === 0 || q.indexOf(DEPS_DIR + '/') === 0 || /^[A-Za-z]:\//.test(q) || q.charAt(0) === '/') {
        var outside = path.resolve(root, q);
        try { if (fs.statSync(outside).isFile()) return { found: true, path: q, lines: countLines(outside) }; } catch (e) {  }
        return { found: false };
      }
      var hit = exact[q.toLowerCase()];
      if (!hit) {
        var suffix = '/' + q.toLowerCase();
        for (var i = 0; i < all.length; i++) { if (all[i].toLowerCase().slice(-suffix.length) === suffix) { hit = all[i]; break; } }
      }
      if (!hit && q.indexOf('/') < 0) { var c = byName[q.toLowerCase()]; if (c && c.length) hit = c[0]; }
      if (!hit) return { found: false };
      return { found: true, path: hit, lines: countLines(path.join(root, hit)) };
    }
  };
}
function looksLikeProject(fs, path, dir) {
  return PROJECT_MARKERS.some(function (n) { return fs.existsSync(path.join(dir, n)); });
}
function runCli(core, argv, defaults) {
  var fs = require('fs');
  var path = require('path');
  defaults = defaults || {};
  var usage = 'usage: node ' + path.basename(process.argv[1]) + ' <filled.md | result.json> [--json result.json] [--report review-report.html] [--pdf review-report.pdf] [--browser path] [--print-json] [--tasks review-tasks.md] [--list] [--endpoints] [--doc checklist.md] [--project dir] [--no-files] [--app name] [--reviewer name] [--definition definitions/checklist.json] [--profile profile-result.json (legacy split documents only)]';
  function fail(msg, exitCode) { console.error(msg); process.exit(exitCode || 2); }
  var opts = {}, flags = {}, positional = [];
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a.indexOf('--') === 0) {
      var name = a.slice(2);
      if (VALUE_OPTS.indexOf(name) >= 0) {
        var v = argv[i + 1];
        if (v === undefined || v.indexOf('--') === 0) fail('--' + name + ' needs a value\n' + usage);
        opts[name] = v; i++;
      } else flags[name] = true;
    } else positional.push(a);
  }
  var file = positional[0];
  if (!file) fail(usage);
  var text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { fail('cannot read ' + file + ': ' + e.message); }
  var isJson = /\.json$/i.test(file) || /^\s*\{/.test(text);
  if (isJson && opts.json) fail('--json writes a result file from a Markdown document; it does not apply to a JSON input\n' + usage);
  function readText(p, what) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { fail('cannot read ' + what + ' ' + p + ': ' + e.message); } }
  function schemaFromDefinitionFile(p) { return core.schemaFromDefinition(JSON.parse(readText(p, 'definition'))); }
  function findDocSchema(dir) {
    var names;
    try { names = fs.readdirSync(dir).filter(function (n) { return /\.md$/i.test(n); }).sort(); } catch (e) { return null; }
    var preferred = names.filter(function (n) { return /checklist/i.test(n); }).concat(names.filter(function (n) { return !/checklist/i.test(n); }));
    for (var j = 0; j < preferred.length; j++) {
      var s = null;
      try { s = core.extractSchema(fs.readFileSync(path.join(dir, preferred[j]), 'utf8')); } catch (e) { s = null; }
      if (s) return { schema: s, from: path.join(dir, preferred[j]) };
    }
    return null;
  }
  var schema = null, schemaFrom = '';
  if (isJson) {
    if (opts.doc) { schema = core.extractSchema(readText(opts.doc, 'document')); schemaFrom = opts.doc; if (!schema) fail('no <!-- lint-schema --> comment in ' + opts.doc); }
    if (!schema) { var found = findDocSchema(path.dirname(path.resolve(file))); if (found) { schema = found.schema; schemaFrom = found.from; } }
    if (!schema && opts.definition) { schema = schemaFromDefinitionFile(opts.definition); schemaFrom = opts.definition; }
    if (!schema) fail('No checklist schema found for ' + file + '. Pass --doc <the checklist Markdown> or keep the checklist next to the JSON.');
  } else {
    schema = core.extractSchema(text);
    if (!schema && opts.definition) schema = schemaFromDefinitionFile(opts.definition);
    if (!schema) fail('No <!-- lint-schema --> comment found in ' + file + ' and no --definition given. Do not remove the schema comment from the document.');
  }
  if (opts.tasks) {
    var taskPath = path.resolve(opts.tasks);
    if (fs.existsSync(taskPath)) { console.log(taskPath + ' already exists; not overwritten. Tick entries there as you complete blocks.'); process.exit(0); }
    var taskLines = ['# Review tasks for ' + path.basename(file), '', 'One entry per answer block, in document order. Research the item, write its block, then tick it. Never tick ahead, never write ahead.', '', 'The number on each entry is its position in the list, which is also its id in your workspace checklist: tick entry 7 here and send <check id="7"/> there.', ''];
    var lastTaskSec = null, taskNo = 0;
    taskEntries(schema).forEach(function (e) {
      var it = schema.items.filter(function (x) { return x.id === e.id; })[0];
      var secId = it ? it.section : null;
      if (secId && secId !== lastTaskSec) { lastTaskSec = secId; var sec = schema.sections.filter(function (x) { return x.id === secId; })[0]; taskLines.push(''); taskLines.push('## ' + secId + ' ' + (sec ? sec.title : '')); }
      if (!it && e.id === 'SELFCHECK') taskLines.push('');
      taskNo++;
      taskLines.push('- [ ] ' + taskNo + '. ' + e.id + ' ' + e.title);
    });
    try { fs.writeFileSync(taskPath, taskLines.join('\n') + '\n'); } catch (e) { fail('cannot write ' + taskPath + ': ' + e.message); }
    console.log('Wrote ' + taskPath + ' with ' + taskEntries(schema).length + ' entries, the last two being the result file and the PDF. Now run --checklist and paste the block it prints into your reply, so the run can be watched; tick each entry in both places only after its block is written.');
    process.exit(0);
  }
  if (flags.checklist) {
    var cl = [];
    taskEntries(schema).forEach(function (e) { cl.push(e.id + ' ' + e.title); });
    console.log('<remote-workspace><checklist>' + cl.join('\n') + '</checklist></remote-workspace>');
    process.exit(0);
  }
  if (flags.list) {
    var listLines = ['META  Application and reviewer'];
    var lastSec = null;
    schema.items.forEach(function (it) {
      if (it.section !== lastSec) {
        lastSec = it.section;
        var sec = schema.sections.filter(function (x) { return x.id === it.section; })[0];
        listLines.push('');
        listLines.push('# ' + it.section + ' ' + (sec ? sec.title : ''));
      }
      listLines.push(it.id + '  ' + it.title + (it.forEach ? '  (one block per row of ' + it.forEach + ')' : ''));
    });
    listLines.push('');
    listLines.push('SELFCHECK  Self-check block');
    console.log(listLines.join('\n'));
    process.exit(0);
  }
  var profile = null, profilePath = opts.profile;
  var lintPhase = schema.lintPhase || 'profile';
  if (!profilePath && lintPhase !== 'profile' && lintPhase !== 'all') {
    var guess = path.join(path.dirname(path.resolve(file)), 'profile-result.json');
    if (fs.existsSync(guess)) profilePath = guess;
  }
  if (profilePath) {
    try { profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')); }
    catch (e) { fail('Could not read profile result ' + profilePath + ': ' + e.message); }
  }
  var projectDir = opts.project ? path.resolve(opts.project) : path.dirname(path.resolve(file));
  var files = null, filesNote;
  if (flags['no-files']) filesNote = 'Citations not checked (--no-files).';
  else if (looksLikeProject(fs, path, projectDir)) { files = fileIndex(fs, path, projectDir); filesNote = 'Citations checked against ' + files.count + (files.truncated ? '+' : '') + ' files under ' + projectDir + ': every cited file must exist and every cited line must be inside it.'; }
  else filesNote = 'Citations not checked: ' + projectDir + ' does not look like a project root (no src, pom.xml, build.gradle, or package.json). Run the linter from the project, or pass --project <dir>.';
  var out;
  if (isJson) {
    var obj;
    try { obj = JSON.parse(text); } catch (e) { fail(file + ' is not valid JSON: ' + e.message, 1); }
    out = core.lintJson(obj, schema, { source: path.basename(file), profile: profile, files: files });
  } else {
    out = core.lint(text, schema, { app: opts.app, reviewer: opts.reviewer, source: path.basename(file), profile: profile, files: files });
  }
  if (out.result) { out.result.lintProblems = out.problems.length; out.result.lintWarnings = out.warnings.length; }
  var printJson = !isJson && (flags['print-json'] || (defaults.output === 'json' && !opts.json));
  var report = [];
  var s = out.summary;
  var versionNote = (isJson && out.result && out.result.fileVersion && out.result.fileVersion !== schema.version) ? ' (file written for v' + out.result.fileVersion + ')' : '';
  report.push((isJson ? 'Result file ' : 'Checklist ') + schema.id + ' v' + schema.version + versionNote + ' in ' + path.basename(file) + (out.result && out.result.app ? ' for ' + out.result.app : '') + (isJson && out.result ? ' (' + out.result.reviewerKind + ' rules)' : ''));
  if (isJson) report.push('Schema from: ' + schemaFrom);
  report.push(filesNote);
  if (lintPhase !== 'profile' && lintPhase !== 'all') report.push(profile ? 'Profile result: ' + profilePath : 'Profile result: none (pass --profile to verify rules and row counts)');
  report.push('Items: ' + s.items + '. Complete: ' + s.complete + '. Incomplete: ' + s.incomplete + '. Not applicable: ' + s.na + (s.inferredNa ? ' (' + s.inferredNa + ' by rule)' : '') + (s.freeTextNa ? ' (' + s.freeTextNa + ' with a free-text reason)' : '') + (s.undetermined ? '. Undetermined: ' + s.undetermined : '') + '. Missing: ' + s.missing + '. Findings: ' + (out.result ? out.result.findings.length : 0) + '.');
  if (!isJson) {
    var tasksFile = path.join(path.dirname(path.resolve(file)), 'review-tasks.md');
    if (fs.existsSync(tasksFile)) {
      var tasks = readTasks(fs.readFileSync(tasksFile, 'utf8'));
      var ticked = 0, aheadTicks = [], behindTicks = [];
      taskEntries(schema).forEach(function (e) {
        if (!(e.id in tasks.ticks)) return;
        var isTicked = tasks.ticks[e.id];
        if (isTicked) ticked++;
        var w;
        if (e.id === 'META') w = !!(out.result && out.result.app);
        else if (e.id === 'SELFCHECK') w = !!(out.result && out.result.selfCheck && String(out.result.selfCheck).trim());
        else if (e.id === 'RESULT') w = fs.existsSync(path.join(path.dirname(path.resolve(file)), RESULT_FILE));
        else if (e.id === 'REPORT') w = isPdf(fs, path.join(path.dirname(path.resolve(file)), REPORT_PDF));
        else w = blockWritten(out.result && out.result.answers ? out.result.answers[e.id] : null);
        if (isTicked && !w) aheadTicks.push(e.id);
        if (!isTicked && w) behindTicks.push(e.id);
      });
      report.push('Tasks: ' + ticked + ' of ' + tasks.count + ' ticked in review-tasks.md.');
      if (aheadTicks.length) out.warnings.push('TASKS: ticked but the block is not written: ' + aheadTicks.join(', ') + '. Untick them; an entry is ticked only after its block is written.');
      if (behindTicks.length) out.warnings.push('TASKS: block written but the entry is not ticked: ' + behindTicks.join(', ') + '. Tick each entry as you finish it, before taking the next; several at once means items were filled in a batch.');
    } else {
      report.push('Tasks: no review-tasks.md next to the document. Create it with --tasks review-tasks.md before answering, and tick one entry per finished block.');
      if (out.problems.length && out.result && out.result.answers && Object.keys(out.result.answers).some(function (id) { return blockWritten(out.result.answers[id]); })) out.warnings.push('TASKS: blocks have been written without a task file; create review-tasks.md with --tasks and tick what is already done, then continue one item at a time.');
    }
    if (out.result) out.result.lintWarnings = out.warnings.length;
  }
  var endpoints = (out.result && out.result.endpoints) || [];
  report.push('Endpoints listed: ' + endpoints.length + (endpoints.length ? ' (print them with --endpoints)' : ''));
  if (flags.endpoints) {
    report.push('');
    report.push(endpoints.length ? 'Endpoints (method, URL, handler, public, writes):' : 'No endpoints listed yet.');
    endpoints.forEach(function (e) { report.push('  ' + (e.methods || '?') + '  ' + (e.url || '?') + '  ' + (e.handler || '') + (e.isPublic === 'yes' ? '  [public]' : '') + (e.mutates === 'yes' ? '  [writes]' : '')); });
  }
  var undetermined = [];
  if (out.result && out.result.answers) {
    Object.keys(out.result.answers).forEach(function (id) {
      var a = out.result.answers[id];
      if (!a) return;
      if (a.status === 'unable') undetermined.push(id + (a.reason ? ': ' + String(a.reason).replace(/\s+/g, ' ').slice(0, 90) : ''));
      if (Array.isArray(a.perRow)) a.perRow.forEach(function (p) { if (p && p.status === 'unable') undetermined.push(id + ' row=' + p.row + (p.evidence ? ': ' + String(p.evidence).replace(/\s+/g, ' ').slice(0, 90) : '')); });
    });
  }
  if (undetermined.length) {
    report.push('');
    report.push(undetermined.length + ' answer(s) could not be determined from the code. They are not problems; ask the developer, or hand them to QA:');
    undetermined.forEach(function (u) { report.push('  ' + u); });
  }
  var wrotePdf = null;
  if ((opts.report || opts.pdf) && out.result) {
    var htmlOut = opts.report || String(opts.pdf).replace(/\.pdf$/i, '') + '.html';
    try { fs.writeFileSync(htmlOut, buildReport(schema, out.result, out.summary) + '\n'); }
    catch (e) { fail('cannot write ' + htmlOut + ': ' + e.message); }
    report.push('Wrote ' + htmlOut + '.');
    if (opts.pdf) {
      var browser = findBrowser(fs, path, opts.browser);
      if (!browser) out.problems.push('REPORT: cannot print the PDF: ' + (opts.browser ? 'no browser at ' + opts.browser : 'no Edge or Chrome found') + '. Ask the developer for the path to Edge or Chrome and rerun with --browser <path>. The review is not finished without ' + opts.pdf + '.');
      else {
        var pr = printPdf(fs, path, browser, htmlOut, opts.pdf);
        if (pr.ok) { wrotePdf = path.resolve(opts.pdf); report.push('Wrote ' + opts.pdf + ' (' + pr.bytes + ' bytes, printed with ' + browser + ').'); }
        else out.problems.push('REPORT: cannot print the PDF with ' + browser + ': ' + pr.why + '. Ask the developer for a working Edge or Chrome and rerun with --browser <path>. The review is not finished without ' + opts.pdf + '.');
      }
    }
  }
  if (isJson && files && out.result && out.result.reviewerKind === 'ai') {
    var needPdf = path.resolve(opts.pdf || path.join(path.dirname(path.resolve(file)), REPORT_PDF));
    if (!isPdf(fs, needPdf)) out.problems.push('REPORT: ' + path.basename(needPdf) + ' is required and is missing. Run: node ' + path.basename(process.argv[1]) + ' ' + path.basename(file) + ' --report ' + REPORT_HTML + ' --pdf ' + REPORT_PDF);
    else if (!wrotePdf) report.push('Report: ' + path.basename(needPdf) + ' present.');
  }
  if (out.problems.length) {
    report.push('');
    report.push(out.problems.length + ' problem(s) to fix (topic id first; later topics are listed until you reach them):');
    out.problems.forEach(function (p) { report.push('  ' + p); });
    report.push('  Fix problems by reading the code. Never invent a value, a citation, or a Searched record to make one go away; if an item cannot be answered from what you can read, ask the developer, and if no one answers mark it unable.');
  }
  if (out.warnings.length) {
    report.push('');
    report.push(out.warnings.length + ' warning(s). They do not block finishing. Re-read each one and change an answer only if the code supports the change; a warning is never a reason to add content:');
    out.warnings.forEach(function (w) { report.push('  ' + w); });
  }
  report.push('');
  report.push(out.problems.length ? 'RESULT: not done. Fix the problems above and run the linter again.' : (isJson ? 'RESULT: no problems. The result file is well formed and consistent with the checklist rules.' : 'RESULT: no problems. The linter checks form, not truth; re-read your answers once more.\nRequired next: write the result with --json ' + RESULT_FILE + ', then run: node ' + path.basename(process.argv[1]) + ' ' + RESULT_FILE + ' --report ' + REPORT_HTML + ' --pdf ' + REPORT_PDF + '. The review is not finished until ' + REPORT_PDF + ' exists.'));
  if (opts.json && out.result) {
    try { fs.writeFileSync(opts.json, JSON.stringify(out.result, null, 2) + '\n'); }
    catch (e) { fail('cannot write ' + opts.json + ': ' + e.message); }
    report.push('Wrote ' + opts.json + (out.problems.length ? ' (marked as having ' + out.problems.length + ' unresolved problems)' : ''));
  }
  if (printJson) {
    process.stdout.write(JSON.stringify(out.result, null, 2) + '\n');
    console.error(report.join('\n'));
  } else {
    console.log(report.join('\n'));
  }
  process.exitCode = out.problems.length ? 1 : 0;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runCli: runCli };
}

runCli({ schemaFromDefinition: schemaFromDefinition, extractSchema: extractSchema, parseAnswers: parseAnswers, lint: lint, lintJson: lintJson }, process.argv.slice(2), { output: 'report' });

````
