<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Web Application Security Review</title>
<style>
:root {
  --bg: #f7f7f5;
  --panel: #ffffff;
  --ink: #1f2328;
  --muted: #59636e;
  --line: #d9dde2;
  --accent: #1f5fbf;
  --ok: #1a7f37;
  --warn: #9a6700;
  --bad: #b42318;
  --na: #8b949e;
  --check: #5b3fbf;
  --code: #eef1f4;
  color-scheme: light;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--ink);
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
[hidden] { display: none !important; }
code { background: var(--code); padding: 0 4px; border-radius: 3px; font-size: 12.5px; }
h1 { font-size: 20px; margin: 28px 0 6px; }
h2 { font-size: 17px; margin: 24px 0 6px; }
h3 { font-size: 15px; margin: 0; font-weight: 600; }
p { margin: 6px 0; }
fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
legend { padding: 0; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.intro { color: var(--muted); }
.flowintro { margin: 18px 0 4px; }
.rule { color: var(--accent); font-size: 13px; margin: 4px 0; }
.refs { color: var(--muted); font-size: 12.5px; }

/* Top bar: kept to two rows so it does not eat the screen */
.top {
  position: sticky; top: 0; z-index: 5;
  background: var(--panel); border-bottom: 1px solid var(--line);
  padding: 8px 20px; display: grid; gap: 6px;
  grid-template-columns: 1fr auto; align-items: center;
}
.top .title { font-weight: 600; font-size: 16px; }
.top .ver { color: var(--muted); font-weight: 400; font-size: 13px; margin-left: 6px; }
.top .fields { display: flex; gap: 14px; flex-wrap: wrap; grid-column: 1 / -1; align-items: center; }
.top .fields label { display: flex; align-items: center; gap: 6px; }
.top .fields input { padding: 5px 8px; border: 1px solid var(--line); border-radius: 4px; min-width: 200px; }
.top .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: flex-end; }
.top .progressrow { display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.top progress { width: 160px; height: 10px; }

/* Issue count badge in the sticky top bar; hidden while there are no issues */
.issuesbadge { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; border: 1px solid #f3b4ae; background: #fdf0ee; color: var(--bad); font-weight: 600; padding: 4px 10px; cursor: pointer; }
.issuesbadge:hover, .issuesbadge:focus { background: #fbe3e0; outline: 2px solid var(--bad); outline-offset: 1px; }
.issuesbadge .ico { font-size: 15px; line-height: 1; }
.issuesbadge .count { background: var(--bad); color: #fff; border-radius: 999px; padding: 0 7px; font-size: 12px; line-height: 18px; min-width: 18px; text-align: center; }

/* Review gaps: a library the review depends on whose source was never obtained */
.gapbar { grid-column: 1 / -1; background: #fdf0ee; border: 1px solid #f3b4ae; color: var(--bad); border-radius: 6px; padding: 8px 12px; font-size: 13.5px; }
.gapbar ul { margin: 4px 0 6px; padding-left: 22px; }
.gapbar code { font-family: Consolas, "Courier New", monospace; font-size: 12.5px; }
.gapbar a { color: var(--bad); font-weight: 600; }
.gapbar .snap { margin: 0 0 6px; }
.summary .unfinished-head { color: var(--warn); }
.summary ul.unfinished { margin: 0 0 16px; padding-left: 22px; columns: 2; column-gap: 24px; }
.summary ul.unfinished li { margin: 3px 0; break-inside: avoid; }
.summary ul.unfinished .small { color: var(--muted); font-size: 12px; }
.summary .unsettled-head { color: var(--bad); }
.summary ul.unsettled { margin: 0 0 16px; padding-left: 22px; }
.summary ul.unsettled li { margin: 4px 0; }
.summary ul.unsettled li.gap { color: var(--bad); }
.summary ul.unsettled .small { color: var(--muted); font-size: 12px; }

/* Summary of every recorded issue, last section of the form */
.summary { scroll-margin-top: 130px; }
.summary h2:focus { outline: none; }
.summary .note { color: var(--muted); }
.summary h3 { font-size: 15px; margin: 18px 0 6px; }
.summary table.issues, .summary table.endpoints { border-collapse: collapse; width: 100%; min-width: 600px; }
.summary table.issues th, .summary table.issues td, .summary table.endpoints th, .summary table.endpoints td { border: 1px solid var(--line); padding: 5px 8px; text-align: left; vertical-align: top; font-size: 13px; }
.summary table.issues th, .summary table.endpoints th { background: #f1f3f5; font-weight: 600; }
.summary table.issues .small { color: var(--muted); font-size: 12px; }
.summary .endpoints-head { margin-top: 22px; }
.summary .endpoints-head .small { font-weight: 400; font-size: 12px; }
.summary table.endpoints code { font-family: Consolas, "Courier New", monospace; font-size: 12.5px; }
.summary table.endpoints tr.public td { background: #fff8e6; }
.summary table.endpoints tr.writes code { font-weight: 600; }
#status { color: var(--muted); font-size: 12.5px; }
.badge { background: #fff4e5; color: var(--warn); border: 1px solid #f5d38f; border-radius: 10px; padding: 1px 8px; font-size: 12px; }

button {
  font: inherit; padding: 6px 12px; border: 1px solid var(--line); border-radius: 5px;
  background: var(--panel); color: var(--ink); cursor: pointer;
}
button:hover { border-color: var(--accent); }
button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
button.small { padding: 3px 9px; font-size: 12.5px; }
button.mini { padding: 0 6px; font-size: 12px; line-height: 20px; }
button:disabled { opacity: .5; cursor: default; }

/* Layout */
main { max-width: 1100px; margin: 0 auto; padding: 8px 20px 80px; }
.instructions { max-width: 1100px; margin: 12px auto 0; padding: 0 20px; }
.instructions > summary { cursor: pointer; font-weight: 600; }
.instructions .body { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 12px 16px; margin-top: 8px; }
.sec { margin-top: 10px; }
.sec.na > h2 { color: var(--na); }

/* Items */
.item {
  background: var(--panel); border: 1px solid var(--line); border-radius: 6px;
  padding: 12px 14px; margin: 10px 0;
  scroll-margin-top: 130px;
}
.item.na { opacity: .6; background: #fafafa; }

/* Two states only. A check the reviewer still has to verify stands out: not answered,
   a problem found, could not determine, or judged not to apply. Everything else, the
   facts to record and a check already confirmed, stays a plain white card. */
.item-check:not(.state-pass) {
  border-left: 4px solid var(--bad);
  background: linear-gradient(90deg, #fdf1ef 0 280px, var(--panel) 560px);
}
.item-check:not(.state-pass) > .ihead h3 { font-weight: 650; }
.item-check.state-finding > .ihead h3 { font-weight: 700; }
.item-check:not(.state-pass) > .ihead .kind-check { background: var(--bad); }

/* Confirmed: an ordinary card with a quiet success mark. The chip carries the wording. */
.okmark { display: none; color: var(--ok); font-weight: 700; font-size: 15px; line-height: 1; align-self: center; }
.item.state-pass > .ihead .okmark { display: inline; }
.item.state-pass > .ihead .kind-check { background: none; color: var(--ok); border: 1px solid #b7e0c0; }
.kind {
  font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
  border-radius: 3px; padding: 2px 6px; white-space: nowrap; align-self: center;
}
.kind-check { color: #fff; background: var(--check); }
.kind-issues { color: var(--warn); background: #fff8e6; border: 1px solid #f5d38f; }
.ihead { display: flex; align-items: baseline; gap: 10px; }
.iid { font-family: ui-monospace, Consolas, monospace; color: var(--muted); font-size: 12.5px; min-width: 44px; }
.chip { margin-left: auto; font-size: 12px; border-radius: 10px; padding: 1px 8px; border: 1px solid var(--line); white-space: nowrap; }
.chip-ok { color: var(--ok); border-color: #b7e0c0; background: #eefaf0; }
.chip-warn { color: var(--warn); border-color: #f5d38f; background: #fff8e6; }
.chip-bad { color: var(--bad); border-color: #f3b4ae; background: #fdf0ee; }
.chip-open { color: var(--muted); }
.chip-na { color: var(--na); }
.tip { color: var(--muted); margin: 2px 0 8px; font-size: 13.5px; }
.problemif { margin: -2px 0 10px; font-size: 13.5px; color: var(--ink); background: #fff8e6; border-left: 3px solid var(--warn); padding: 6px 10px; border-radius: 0 4px 4px 0; }
.problemif strong { color: var(--warn); }
.how { margin: 6px 0; }
.how > summary { cursor: pointer; color: var(--accent); font-size: 13px; }
.how p { margin: 6px 0 0; }
.signals code { margin-right: 2px; }
.control { margin: 8px 0; }
.control .opt { display: block; padding: 2px 0; }
.control .opt.inline { display: inline-block; margin-right: 14px; }
.control textarea, .fields textarea { width: 100%; font: inherit; padding: 6px 8px; border: 1px solid var(--line); border-radius: 4px; resize: vertical; }
.fields { display: grid; gap: 8px; margin-top: 8px; }
.fld > span { display: block; font-size: 12.5px; color: var(--muted); margin-bottom: 2px; }
.req { font-size: 12.5px; color: var(--muted); margin-top: 3px; }
.req-missing { color: var(--bad); }
.meta { color: var(--muted); font-size: 11.5px; margin-top: 6px; }
.remind { color: var(--muted); font-size: 12px; margin: 8px 0 0; }
.remind a { color: var(--accent); }

/* Check items: one block, or one per row of the source table */
.checkblock { border-left: 3px solid var(--line); padding: 6px 0 6px 12px; margin: 6px 0 10px; }
.checkblock.block-todo { border-left-color: var(--bad); background: linear-gradient(90deg, #fdf1ef 0 200px, transparent 420px); }
.checkblock.block-done { border-left-color: #b7e0c0; }
.checkblock.block-done .rowlabel::after { content: " \2713"; color: var(--ok); font-weight: 700; }
.checkblock .rowlabel { font-family: ui-monospace, Consolas, monospace; font-size: 13px; font-weight: 600; margin-bottom: 4px; word-break: break-all; }
.checkblock .statusopts { margin-bottom: 6px; }
.checkblock .fld { margin-top: 6px; }
.checkblock textarea.where { width: 100%; font: inherit; padding: 5px 8px; border: 1px solid var(--line); border-radius: 4px; resize: vertical; min-height: 30px; }

/* Tables */
.tablescroll { overflow-x: auto; }
table.rows { border-collapse: collapse; width: 100%; min-width: 600px; }
table.rows th, table.rows td { border: 1px solid var(--line); padding: 3px 4px; text-align: left; vertical-align: top; font-size: 13px; }
table.rows th { background: #f1f3f5; font-weight: 600; }
table.rows input, table.rows select, table.rows textarea { width: 100%; min-width: 110px; font: inherit; font-size: 13px; padding: 3px 5px; border: 1px solid transparent; border-radius: 3px; background: transparent; }
table.rows textarea { min-width: 220px; resize: vertical; }
table.rows input:focus, table.rows select:focus, table.rows textarea:focus { border-color: var(--accent); background: #fff; outline: none; }
table.rows td.rowact { width: 30px; text-align: center; }
.tableactions { margin-top: 6px; display: flex; gap: 6px; align-items: center; }
.rowcount { color: var(--muted); font-size: 12.5px; margin-left: 6px; }
.nonebox { margin-left: auto; font-size: 13px; }

/* Comparison with a second result */
.cmpbar { grid-column: 1 / -1; display: flex; gap: 14px; align-items: center; flex-wrap: wrap; background: #fff8e6; border: 1px solid #f5d38f; border-radius: 6px; padding: 6px 10px; font-size: 13px; }
.cmp { margin-top: 10px; border: 1px dashed var(--line); border-radius: 5px; padding: 8px 10px; font-size: 13px; background: #fafbfc; }
.cmp.cmp-diff { border-color: #f5d38f; background: #fff8e6; }
.cmp .cmphead { font-weight: 600; margin-bottom: 4px; }
.cmp .cmprows { margin: 4px 0 0 18px; padding: 0; }
.cmp .muted { color: var(--muted); }
.pre { white-space: pre-wrap; }
.item.differs { border-left: 4px solid var(--warn); }
.aifields { margin-top: 8px; font-size: 13px; }
.aifields > summary { cursor: pointer; color: var(--accent); }
.aifields .pre { margin: 4px 0; }

/* Modal */
#modal { position: fixed; inset: 0; background: rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center; z-index: 20; }
.modal { background: var(--panel); border-radius: 8px; padding: 18px 20px; width: min(900px, 94vw); max-height: 90vh; overflow: auto; box-shadow: 0 10px 40px rgba(0,0,0,.25); }
.modal h2 { margin: 0 0 10px; }
.modal textarea.json { width: 100%; font: 12.5px ui-monospace, Consolas, monospace; padding: 8px; border: 1px solid var(--line); border-radius: 4px; }
.modal .note { color: var(--muted); font-size: 13px; }
.modal .preview { white-space: pre-wrap; font-size: 13px; margin: 8px 0; color: var(--ink); }
.modalactions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }

/* Print: everything visible, nothing clipped, no placeholder text */
@media print {
  .top .actions, .issuesbadge, #modal, .how > summary, .tableactions, .rowact, .instructions, .remind, .cmpbar { display: none !important; }
  .top { position: static; border: 0; }
  .how { display: block; }
  .how p { display: block; }
  .item { break-inside: avoid; border-color: #bbb; }
  /* Keep the markers in print; tints drop out, the rules and the chip carry the outcome */
  .item-check:not(.state-pass) { background: none !important; }
  .item-check.state-open { border-left-color: #333 !important; }
  .kind { border: 1px solid #333 !important; background: none !important; color: #000 !important; }
  textarea { border: 1px solid #bbb; overflow: visible; resize: none; }
  ::placeholder { color: transparent; }
  body { background: #fff; }
}

</style>
</head>
<body>
<header class="top">
  <div class="title">Web Application Security Review <span class="ver">checklist web-idor-review v0.5.0</span></div>
  <div class="actions">
    <button type="button" id="btn-import">Import JSON</button>
    <button type="button" id="btn-export" class="primary">Export JSON</button>
    <button type="button" id="btn-clear">Clear this review</button>
    <button type="button" id="btn-print">Print</button>
    <button type="button" id="issues-badge" class="issuesbadge" hidden title="Issues recorded. Click to see the list at the end of the form."><span class="ico" aria-hidden="true">&#9888;</span><span class="count">0</span></button>
  </div>
  <div class="fields">
    <label>Application <input id="app" list="slots" placeholder="artifactId or app name" autocomplete="off"></label>
    <datalist id="slots"></datalist>
    <label>Reviewer <input id="reviewer" placeholder="your name"></label>
    <span class="progressrow">
      <progress id="progress" max="100" value="0"></progress>
      <span id="progresstext"></span>
      <span id="dirty" class="badge" hidden></span>
      <span id="status"></span>
    </span>
  </div>
  <div id="gapbar" class="gapbar" role="alert" hidden></div>
  <div id="cmpbar" class="cmpbar" hidden>
    <span id="cmpinfo"></span>
    <label><input type="checkbox" id="cmp-only"> Only differences</label>
    <button type="button" id="btn-cmp-clear" class="small">Stop comparing</button>
  </div>
</header>
<details class="instructions" id="instructions" open>
  <summary>Instructions</summary>
  <div class="body">
<p><strong>Why.</strong> Another application at the customer had a download URL with a numeric id in it. Changing the id returned someone else's file. The application checked that the caller was logged in, but never checked that the caller was allowed to see that particular file. Scanners and code review both missed it. You are reviewing your application for the same shape, and what you record here is the review.</p>

<p><strong>How to work through it.</strong> Twelve topics, each about one area of the application; later topics only show what your earlier answers make relevant. Answer the questions from the code, not from memory. For each check, open the code, follow the identifier from the request to the data, and decide. Mark it Checked, OK only when you can point at the line that does the check. If you find the problem the item describes, or anything like it, mark it Problem found and write down where it is and what a caller could do with it. Everything you record that way, and every row you add to a topic's issues table, is collected in "All issues found" at the end of the form; the red count in the top bar takes you there.</p>

<p><strong>Saving and export.</strong> Your work saves in this browser as you type, under the application name above. When you have worked through everything, click Export, copy the JSON, and send it where you were asked to.</p>

  </div>
</details>
<main id="form"></main>
<div id="modal" hidden role="dialog" aria-modal="true"><div class="modal"></div></div>
<script type="application/json" id="def">{"id":"web-idor-review","version":"0.5.0","title":"Web Application Security Review","mode":"dev","negativeValues":["no","none","none-found","unknown","not-established","not-set-default","no-weblogic-xml","none-api-only"],"intro":"Each topic asks a few questions about one area of the application, then tells you what to check there and what a problem looks like, then gives you a place to record anything else you noticed in that area. Answer from the code. Mark a check Checked, OK only when you found the line that does the check; describe every problem.","phases":[],"sections":[{"id":"T0","title":"What this application is"},{"id":"T1","title":"Who uses it and how they log in"},{"id":"T2","title":"The token from the portal","when":{"q":"C-09","in":["portal","portlet","unknown"]}},{"id":"T3","title":"What can be reached without logging in"},{"id":"T4","title":"Who is allowed to see what"},{"id":"T5","title":"Reading records by identifier"},{"id":"T6","title":"Changing records"},{"id":"T7","title":"Files and documents"},{"id":"T8","title":"Where the data comes from"},{"id":"T9","title":"Caching and static content"},{"id":"T10","title":"JSF pages","when":{"q":"C-02","includes":"jsf"}},{"id":"T12","title":"Anything else"}],"items":[{"id":"C-01","section":"T0","type":"text","title":"Which module builds the deployable WAR, and what is its context root?","tip":"Root pom or the module with war packaging. Context root is in weblogic.xml."},{"id":"C-02","section":"T0","type":"multiselect","title":"Which frameworks handle requests on the backend?","tip":"Select everything that handles even one page. The pom and web.xml settle it.","detail":"Versions and anything selected as Other","options":[{"value":"spring-mvc","label":"Spring MVC (@Controller, DispatcherServlet)"},{"value":"spring-boot","label":"Spring Boot"},{"value":"spring-security","label":"Spring Security"},{"value":"jaxrs","label":"JAX-RS (@Path; Jersey, RESTEasy, or CXF)"},{"value":"jsf","label":"JSF (FacesServlet, .xhtml or .jspx pages)"},{"value":"jsp","label":"JSP pages"},{"value":"servlets","label":"Raw servlets (web.xml \u003cservlet> or @WebServlet)"},{"value":"websocket","label":"WebSocket endpoints"},{"value":"struts","label":"Struts"},{"value":"other","label":"Other (describe in Detail)"}]},{"id":"C-03","section":"T0","type":"select","title":"What is the frontend?","tip":"package.json under src/main/angular shows the Angular version.","detail":"Version from package.json and where the frontend source lives","options":[{"value":"angular","label":"Angular 2 or later"},{"value":"angularjs","label":"AngularJS 1.x"},{"value":"mixed","label":"Mixed (describe in Detail)"},{"value":"server-rendered","label":"Server-rendered pages only (JSF or JSP)"},{"value":"none-api-only","label":"None: API only"}]},{"id":"C-07","section":"T0","type":"yesno","title":"Is this app deployed to WebLogic?","tip":"weblogic.xml in WEB-INF.","detail":"WebLogic version from the descriptor namespace"},{"id":"C-08","section":"T1","type":"select","title":"Who uses this application: beneficiaries or operators?","tip":"Beneficiary self-service apps log people in through the beneficiary SSO filter (AuthFilter, iPlanetDirectoryPro cookie) and scope data to a family. Operator apps use OperatorAuthenticationFilter and OperatorAuthorizationFilter and scope data by access level or selected site.","detail":"Who exactly: sponsors, dependents, call-centre operators, site staff","options":[{"value":"beneficiary","label":"Beneficiary self-service"},{"value":"operator","label":"Operator (call centre or office staff)"},{"value":"both","label":"Both audiences"}]},{"id":"C-09","section":"T1","type":"select","title":"Is this a portal, a portlet, or a standalone application?","tip":"A portal hosts other apps in iframes and creates the token they receive. A portlet runs inside a portal iframe and receives that token. A standalone app logs users in itself.","detail":"Naming convention observed (artifactId prefix, package name)","options":[{"value":"portal","label":"Portal: hosts portlets and mints their token"},{"value":"portlet","label":"Portlet: loaded in a portal iframe, receives a token"},{"value":"standalone","label":"Standalone: own SSO, no iframe hosting, no parent token"}]},{"id":"C-10","section":"T1","type":"multiselect","title":"How do users log in?","tip":"Usually one of the enterprise filters from the shared web-security library, declared in web.xml. Select everything that applies.","detail":"Logon methods supported (CAC, FAM, DFAS, SNT) and anything custom","options":[{"value":"beneficiary-sso","label":"Enterprise beneficiary SSO filter (AuthFilter / BeneficiaryAgentSSO)"},{"value":"operator-filter","label":"Enterprise operator filters (OperatorAuthenticationFilter / OperatorAuthorizationFilter)"},{"value":"portal-jwt","label":"Token received from a parent portal"},{"value":"spring-security","label":"Spring Security"},{"value":"container-managed","label":"Container-managed (\u003clogin-config> in web.xml)"},{"value":"custom","label":"Custom or home-grown"},{"value":"none","label":"None found"}]},{"id":"C-12","section":"T1","type":"select","title":"After login, where does the code keep who the user is?","tip":"Follow the login filter to where it stores the user, then find the class the rest of the code reads to get the person, family, or operator ids.","detail":"Class holding the identity and the identifiers it carries (person id, sponsor id, family id, operator id, access levels, site)","options":[{"value":"http-session","label":"HttpSession attribute"},{"value":"custom-principal","label":"Custom Principal via request.getUserPrincipal()"},{"value":"thread-local","label":"ThreadLocal or request-scoped holder"},{"value":"spring-security-context","label":"Spring SecurityContextHolder"},{"value":"jwt-each-request","label":"Re-derived from the token on every request"},{"value":"other","label":"Other (describe in Detail)"}]},{"id":"C-13","section":"T1","type":"select","title":"What does each request carry after login: a session cookie or a token?","tip":"A token means an Angular interceptor adds an Authorization header and the server parses it on every request.","options":[{"value":"session-cookie","label":"Session cookie"},{"value":"bearer-jwt","label":"Bearer token on every request"},{"value":"both","label":"Both"},{"value":"none","label":"None found"}]},{"id":"C-15","section":"T1","type":"yesno","title":"Does the Angular code read the login cookie directly, for example iPlanetDirectoryPro?","tip":"Search the frontend for document.cookie or a cookie service. If JavaScript can read it, the cookie is not HttpOnly.","detail":"Cookie names and the files that read them"},{"id":"R-01","section":"T1","type":"check","title":"Search for personId, sponsorId, familyId, or operatorId being read from a request parameter, header, or cookie.","tip":"Then follow each one to see whether it is used as the current user.","finding":"Any of them used as who the caller is, instead of the value from the session or the validated token.","severity":"high"},{"id":"R-02","section":"T1","type":"check","title":"Check the cookie flags in web.xml and weblogic.xml, and search for encodeURL and url-rewriting-enabled.","tip":"Effective values count, defaults included: WebLogic defaults HttpOnly on, Secure off, and URL rewriting on. \u003ctracking-mode>COOKIE\u003c/tracking-mode> in web.xml or url-rewriting-enabled false switches rewriting off.","finding":"HttpOnly explicitly false, Secure not explicitly true, URL rewriting left on, or code that appends jsessionid to a URL.","when":{"q":"C-13","in":["session-cookie","both"]},"severity":"medium"},{"id":"R-03","section":"T1","type":"check","title":"The login cookie is readable from JavaScript, so it is not HttpOnly.","tip":"Confirm the read runs in production code (it has a caller). If JavaScript can read it, script injection anywhere on the cookie domain can steal the SSO session.","finding":"It is (confirmed in code: the read runs in production). Mark it Problem found and note the file, even though the fix belongs to the identity service.","when":{"q":"C-15","eq":"yes"},"severity":"medium"},{"id":"F-01","section":"T1","type":"list","title":"Anything else wrong that you noticed in this area","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]},{"id":"C-16","section":"T2","type":"select","title":"How does the token get from the portal into the portlet?","tip":"How the iframe src is built on the portal side, and where the portlet first reads the token. A query parameter ends up in access logs and browser history.","detail":"Portal side (file:line) and portlet side (file:line)","options":[{"value":"query-param","label":"iframe src query parameter"},{"value":"url-fragment","label":"URL fragment"},{"value":"postmessage","label":"window.postMessage"},{"value":"shared-domain-cookie","label":"Cookie on a shared domain"},{"value":"proxy-header","label":"Header injected by a proxy"},{"value":"other","label":"Other (describe in Detail)"}]},{"id":"C-17","section":"T2","type":"select","title":"How is the token protected?","tip":"jjwt, auth0, or nimbus with a signWith call means signed. Cipher calls outside a JWT library mean custom encryption.","detail":"Library, class, and algorithm constant","options":[{"value":"jws-hmac","label":"JWS signed with HMAC (shared secret)"},{"value":"jws-asymmetric","label":"JWS signed with an asymmetric key"},{"value":"jwe","label":"JWE encrypted"},{"value":"jws-and-jwe","label":"Signed and encrypted"},{"value":"custom-crypto","label":"Custom encrypt/decrypt outside a JOSE library"}]},{"id":"C-18","section":"T2","type":"text","title":"What is in the token?","tip":"Family id, sponsor id, person id, access levels, app id, site, expiry."},{"id":"C-19","section":"T2","type":"multiselect","title":"What does the portlet check when it receives the token?","tip":"Select only what the code demonstrably enforces. jjwt and auth0 reject an expired token automatically when exp is present, but neither requires exp to exist; select exp only if the code requires it. Issuer and audience count only with requireIssuer/requireAudience, withIssuer/withAudience, or an explicit comparison.","when":{"q":"C-09","eq":"portlet"},"detail":"Class and lines performing each check","options":[{"value":"signature","label":"Signature verified"},{"value":"exp","label":"Expiry (exp) enforced"},{"value":"nbf","label":"Not-before (nbf) enforced"},{"value":"iss","label":"Issuer (iss) checked"},{"value":"aud-or-app-id","label":"Audience or application id checked"},{"value":"alg-pinned","label":"Algorithm pinned (rejects none and algorithm switching)"},{"value":"jti-replay","label":"Replay protection (jti or one-time use)"},{"value":"none-found","label":"None found"}]},{"id":"C-20","section":"T2","type":"select","title":"Where does the signing secret live?","tip":"Follow the property key from the code that loads the key.","detail":"Property key and file","options":[{"value":"properties-in-war","label":"Properties file inside the WAR"},{"value":"credential-store-jndi","label":"WebLogic credential store or JNDI"},{"value":"env-var","label":"Environment variable"},{"value":"hardcoded","label":"Hardcoded in source"},{"value":"other","label":"Other (describe in Detail)"}]},{"id":"C-21","section":"T2","type":"select","title":"Is the secret shared across all portlets or specific to this one?","tip":"A shared library default or the same property name in several apps means shared.","detail":"How this was determined","options":[{"value":"fleet-shared","label":"One key shared across the fleet"},{"value":"per-portlet","label":"Per portlet"}]},{"id":"C-22","section":"T2","type":"select","title":"After the token is accepted, does the portlet create a session or require the token on every request?","tip":"Look for getSession(true) after the token check.","when":{"q":"C-09","eq":"portlet"},"detail":"What is stored and how it is bound to the token identity","options":[{"value":"creates-http-session","label":"Creates an HttpSession holding identity"},{"value":"stateless","label":"Stateless: token on every request"},{"value":"both","label":"Both"}]},{"id":"C-23","section":"T2","type":"text","title":"Which filter rejects requests with no valid token or session, and what happens if the portlet URL is opened directly in a browser tab?","tip":"The filter class, its URL patterns, and its exclusions.","when":{"q":"C-09","eq":"portlet"}},{"id":"C-24","section":"T2","type":"select","title":"Is framing restricted with X-Frame-Options or a CSP frame-ancestors header?","tip":"Usually set in a filter or by the shared web-security library.","detail":"Values and where they are set","options":[{"value":"x-frame-options","label":"X-Frame-Options set"},{"value":"csp-frame-ancestors","label":"CSP frame-ancestors set"},{"value":"both","label":"Both"},{"value":"none-found","label":"None found"}]},{"id":"C-25","section":"T2","type":"text","title":"Where does the portal create the token, and what does it put in it?","tip":"Class and method, the fields copied from the logged-in user, and the expiry.","when":{"q":"C-09","eq":"portal"}},{"id":"R-04","section":"T2","type":"check","title":"Find the call that parses the token and read what it verifies.","tip":"jjwt: parseClaimsJws with a key is right (a byte[] key also pins HMAC); parse or parseClaimsJwt accept unsigned tokens. auth0: the verifier must name the algorithm; JWT.decode reads claims without verifying. Custom decryption must also authenticate the token.","finding":"An unsigned parse, a verifier without a fixed algorithm, custom decryption that does not authenticate, or any claim read before verification.","when":{"q":"C-09","eq":"portlet"},"severity":"high"},{"id":"R-05","section":"T2","type":"check","title":"Find the lines that enforce expiry, issuer, and audience or app id.","tip":"With jjwt or auth0, look for the line that requires exp to be present; expiry itself is automatic when the claim exists. Audience and issuer need requireAudience/withAudience or an explicit comparison.","finding":"exp not required to be present, or issuer or audience never compared. With a secret shared across portlets, a missing audience check accepts a token minted for another portlet.","when":{"q":"C-09","eq":"portlet"},"severity":"high"},{"id":"R-06","section":"T2","type":"check","title":"The token travels in the iframe URL.","tip":"A URL token ends up in access logs, browser history, and Referer headers.","finding":"It is (confirmed in code). Mark it Problem found and note the expiry and whether it is exchanged for a session immediately.","when":{"q":"C-16","eq":"query-param"},"severity":"medium"},{"id":"R-07","section":"T2","type":"check","title":"Search for familyId, sponsorId, or accessLevel being read from a parameter or the body, and follow each into a data call.","tip":"Compare with where the validated token claims are stored.","finding":"A request value replacing the token's claim on any data path.","when":{"q":"C-09","eq":"portlet"},"severity":"high"},{"id":"R-08","section":"T2","type":"check","title":"Read what happens at token login and what happens when a different token arrives on an existing session.","tip":"Look for invalidate or changeSessionId, and for attribute writes on later requests.","finding":"No session-id change at login, or a second token changing part of the session while the rest stays.","when":{"all":[{"q":"C-09","eq":"portlet"},{"q":"C-22","in":["creates-http-session","both","unknown"]}]},"severity":"medium"},{"id":"R-09","section":"T2","type":"check","title":"Open the minting code and trace the source of each claim.","tip":"Every value must come from the server-side identity.","finding":"A claim populated from a request parameter, including the target portlet used as audience, or a long expiry.","when":{"q":"C-09","eq":"portal"},"severity":"high"},{"id":"R-10","section":"T2","type":"check","title":"The signing secret is a literal in source.","tip":"Do not paste the value anywhere.","finding":"It is (confirmed in code). Anyone with repository access can mint tokens. Mark it Problem found and note the class.","when":{"q":"C-20","eq":"hardcoded"},"severity":"high"},{"id":"R-11","section":"T2","type":"check","title":"No framing restriction is set anywhere.","tip":"Search filters, security configuration, and the shared library for X-Frame-Options and frame-ancestors. For a portlet, the correct value allows only the portal origin.","finding":"It is (confirmed: neither header is set). Any origin can frame the application. Mark it Problem found.","when":{"q":"C-24","eq":"none-found"},"severity":"low"},{"id":"R-12","section":"T2","type":"check","title":"Find where the portal chooses which portlet URL the token is attached to, and where it posts the token.","tip":"The destination must come from fixed configuration. A postMessage must name the portlet origin.","finding":"The destination comes from a request or route parameter, or postMessage uses \"*\". A caller can then send a token valid for every portlet to a server they control.","when":{"q":"C-09","eq":"portal"},"severity":"high"},{"id":"F-02","section":"T2","type":"list","title":"Anything else wrong that you noticed in this area","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]},{"id":"C-26","section":"T3","type":"text","title":"Which URL patterns skip the login filter?","tip":"Filter mappings and exclusion patterns in web.xml or the filter's init-params, for example /ws/public/*, appmonitor.status, static folders. One per line."},{"id":"C-27","section":"T3","type":"text","title":"What can be reached without logging in, and does any of it return data?","tip":"For each excluded pattern, list what is behind it. Health checks and static assets are expected; anything that returns records is an issue."},{"id":"R-13","section":"T3","type":"check","title":"List every servlet mapping and controller prefix, and compare them with the login filter's mappings.","tip":"web.xml servlet mappings, controller @RequestMapping prefixes, the JSF servlet, error pages. Watch /* against /ws/*.","finding":"A mapping the filter does not cover, or a filter that does not run on FORWARD or ERROR dispatches.","severity":"high"},{"id":"R-14","section":"T3","type":"check","title":"For every exclusion pattern you listed in C-26, read the code that decides it skips the login filter.","tip":"Find the comparison and what it compares: the raw request URI or the normalised servlet path. For Spring Security rules, compare antMatchers with MVC's own matching and check web.ignoring.","finding":"A prefix, regex, or contains match on the raw URI. Try in your head: /public/../private, a double slash, an encoded slash, ;jsessionid=x, a case change, a .json suffix. For a servlet-mapping gap, the gap itself is the problem.","forEach":"C-26","severity":"high"},{"id":"R-15","section":"T3","type":"check","title":"For every public URL you listed in C-27, open its handler and follow every path to the response.","tip":"A status string or a health check is fine.","finding":"Any of them returns a record, a document, or a list, or looks anything up by an id, name, or number taken from the request.","forEach":"C-27","severity":"high"},{"id":"F-03","section":"T3","type":"list","title":"Anything else wrong that you noticed in this area","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]},{"id":"C-28","section":"T4","type":"select","title":"Who is allowed to see a given record in this application?","tip":"Beneficiary apps: the user's own family. Operator apps: by access level, by selected site, or both. Write the rule as one sentence in Detail.","detail":"In one sentence: what does 'allowed to see this record' mean in this application?","options":[{"value":"beneficiary-family","label":"Beneficiary: own family only"},{"value":"operator-access-level","label":"Operator: by access level"},{"value":"operator-site","label":"Operator: by selected site"},{"value":"mixed","label":"Mixed (describe in Detail)"},{"value":"none-found","label":"No ownership rule found in code"}]},{"id":"C-29","section":"T4","type":"text","title":"Which people can a logged-in beneficiary see or change, and where is that set built?","tip":"Only themselves, their dependents, their sponsor, the whole family, or different by role. Where the set comes from (login, session, per request, token) and where it is consulted.","when":{"q":"C-08","in":["beneficiary","both","unknown"]}},{"id":"C-30","section":"T4","type":"text","title":"What do access levels mean here, and how is the selected site enforced on later requests?","tip":"List the levels or roles and what each allows. Where the selected site is stored and how later requests are limited to it.","when":{"q":"C-08","in":["operator","both","unknown"]}},{"id":"C-31","section":"T4","type":"yesno","title":"Is there a check that the user may use this application at all?","tip":"For operator apps this is the App ID check in OperatorAuthorizationFilter. It is not the same as checking a specific record.","detail":"Class, application id, and configuration location"},{"id":"C-32","section":"T4","type":"select","title":"Where does the list of records the user may see come from?","tip":"Loaded at login into the session, looked up per request, carried in the token, or nowhere.","detail":"Class and method that establishes it","options":[{"value":"roster-in-session","label":"Roster fetched at login and stored in the session"},{"value":"per-request-lookup","label":"Looked up on every request"},{"value":"jwt-claims","label":"Carried in token claims"},{"value":"not-established","label":"Not established anywhere"}]},{"id":"C-33","section":"T4","type":"select","title":"When a request names a specific record, where is it checked that this user may see that record?","tip":"This is the question the whole review is about. One shared helper is best. Role checks (hasRole, @Secured, @RolesAllowed) do not count; they say who may use the app, not who may see this record. If you cannot point at a place where the record is checked, choose none found.","detail":"Helper name and location, or examples of the ad hoc pattern","options":[{"value":"canonical-helper","label":"Single canonical helper, for example isInMyFamily(personId)"},{"value":"per-endpoint","label":"Ad hoc per endpoint"},{"value":"annotation","label":"Annotation or aspect based"},{"value":"none-found","label":"None found"}]},{"id":"R-16","section":"T4","type":"check","title":"Find where the selection made through /selectsite is stored, then check that each query, CUF request, and service call uses it.","tip":"Session attribute or token claim, then every data path.","finding":"A data path that takes a site id from the request instead, or that never looks at the stored selection.","when":{"q":"C-08","in":["operator","both","unknown"]},"severity":"high"},{"id":"F-04","section":"T4","type":"list","title":"Anything else wrong that you noticed in this area","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]},{"id":"C-34","section":"T5","type":"multiselect","title":"How do requests reach code?","tip":"JSF action methods count. Actuator is out of scope but note it if present.","detail":"Anything selected as Other","options":[{"value":"spring-mvc","label":"Spring MVC controllers"},{"value":"jaxrs","label":"JAX-RS resources"},{"value":"jsf-actions","label":"JSF managed-bean actions"},{"value":"servlets","label":"Raw servlets"},{"value":"websocket","label":"WebSocket endpoints"},{"value":"actuator","label":"Spring Boot actuator (note only)"},{"value":"other","label":"Other (describe in Detail)"}]},{"id":"C-35","section":"T5","type":"list","title":"Which endpoints take a record identifier from the request, and where is scope checked for each?","tip":"Every endpoint where the caller supplies an id for a person, family, document, or other record in the path, query string, body, or a header. One row each; the checks below ask about each row.","columns":[{"key":"methods","label":"HTTP method"},{"key":"path","label":"Path"},{"key":"idParams","label":"What the id identifies"},{"key":"mutates","label":"Writes or deletes","type":"select","options":["yes","no"]}]},{"id":"C-36","section":"T5","type":"multiselect","title":"What kinds of identifiers appear in requests?","tip":"Sequential numeric ids are the easiest to guess.","detail":"Format notes: sequential numeric, guessable, base64 of an id, and so on","options":[{"value":"person-id","label":"Person id"},{"value":"sponsor-id","label":"Sponsor id"},{"value":"family-id","label":"Family id"},{"value":"document-id","label":"Document or file id"},{"value":"db-primary-key","label":"Database primary key"},{"value":"uuid","label":"UUID or GUID"},{"value":"opaque-token","label":"Opaque or encoded token"},{"value":"composite","label":"Composite key"},{"value":"other","label":"Other (describe in Detail)"},{"value":"none","label":"No request-supplied identifiers (every record is chosen from the session or token)"}]},{"id":"R-17","section":"T5","type":"check","title":"Follow the id from the request through the service to the data call, and find the line that compares it with the caller's family, site, or access level.","tip":"Logged in plus allowed to use the app is not enough. A check only in Angular does not count. A check after the data is already written to the response does not count.","finding":"No such line on any path from this handler to the data. Any caller can then read another person's record by changing the id.","forEach":"C-35","severity":"high"},{"id":"R-18","section":"T5","type":"check","title":"Find every call site of the shared scope helper, or every record-level annotation, and compare them with the endpoints you listed in C-35.","tip":"For annotations, first confirm method security is enabled (@EnableGlobalMethodSecurity(prePostEnabled = true) or @EnableMethodSecurity); without it @PreAuthorize is ignored.","finding":"An endpoint that reaches data without the helper or annotation, calls it with a different id than it uses, or has an annotation that only checks a role.","when":{"q":"C-33","in":["canonical-helper","annotation"]},"severity":"high"},{"id":"R-19","section":"T5","type":"check","title":"If no record-level check exists anywhere in this application, that is the incident shape across the whole application.","tip":"Only mark this if you searched (C-33) and found nothing that compares a requested record with the caller, and the R-17 rows above bear that out.","finding":"It is (confirmed by your search in C-33 and the rows above). Mark it Problem found.","when":{"q":"C-33","eq":"none-found"},"severity":"high"},{"id":"R-20","section":"T5","type":"check","title":"For each endpoint that returns a list or search result, find where the family or site constraint is applied.","tip":"It must be in the query, the CUF request, or a server-side filter before the response is built.","finding":"A list fetched whole and filtered in Angular, or not constrained at all.","severity":"high"},{"id":"C-37","section":"T5","type":"select","title":"Do endpoints return whole entities or CUF objects, or DTOs with only the needed fields?","tip":"Whole objects expose every field they carry, including ones the UI never shows.","detail":"Examples, and any @JsonIgnore or @JsonView usage","options":[{"value":"entities-wholesale","label":"Entities or CUF objects serialized wholesale"},{"value":"dto-mapped","label":"DTOs mapped from domain objects"},{"value":"mixed","label":"Mixed (describe in Detail)"}]},{"id":"R-21","section":"T5","type":"check","title":"Compare the class each endpoint returns, including nested objects, with what the screen actually shows.","tip":"Compare the returned class, including nested objects, with what the component reads, whatever the class is named. A DTO filled by MapStruct, ModelMapper, or copyProperties from the full record carries the full record.","finding":"Fields in the response the screen never shows: other family members, SSNs, internal flags, audit fields.","severity":"medium"},{"id":"F-05","section":"T5","type":"list","title":"Anything else wrong that you noticed in this area","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]},{"id":"C-38","section":"T6","type":"multiselect","title":"How are request bodies turned into objects on updates?","tip":"Binding straight onto a domain or CUF object lets the client set any field the object has.","detail":"Examples with file:line","options":[{"value":"requestbody-domain","label":"@RequestBody onto a domain, entity, or CUF object"},{"value":"requestbody-dto","label":"@RequestBody onto a DTO or command object"},{"value":"modelattribute","label":"@ModelAttribute form binding"},{"value":"beanparam","label":"JAX-RS @BeanParam or @FormParam"},{"value":"jaxrs-entity","label":"JAX-RS entity parameter onto a domain or CUF object (@Consumes JSON, @PUT/@POST)"},{"value":"jsf-properties","label":"JSF managed-bean properties bound from forms"},{"value":"getparameter","label":"Manual request.getParameter"},{"value":"none-found","label":"None found (no writes)"}]},{"id":"C-39","section":"T6","type":"multiselect","title":"Is there anything that limits which fields a request can set?","tip":"@InitBinder allowed fields, read-only Jackson properties, or DTOs that only carry the intended fields.","detail":"Where applied, global or per controller, and which binding style each mechanism covers","options":[{"value":"initbinder-allowed","label":"@InitBinder setAllowedFields (covers @ModelAttribute, form, and query binding only)"},{"value":"initbinder-disallowed","label":"@InitBinder setDisallowedFields (same coverage)"},{"value":"jsonignore-setters","label":"@JsonIgnoreProperties or @JsonProperty(access = READ_ONLY) without allowSetters (covers @RequestBody and JAX-RS entities)"},{"value":"dto-only","label":"DTOs carrying only the intended fields"},{"value":"none-found","label":"None found"}]},{"id":"C-40","section":"T6","type":"list","title":"What does the screen stop the user from entering, and does the server stop it too?","tip":"Dropdowns with fixed options, required fields, maximum lengths, formats, ranges, fields that are greyed out, and buttons only some users see.","columns":[{"key":"field","label":"Field or action"},{"key":"kind","label":"Kind of constraint","type":"select","options":["allowed-values","required","length","pattern","range","disabled-or-readonly","hidden-action","other"]},{"key":"clientAt","label":"Enforced in the client at (file:line)"},{"key":"serverAt","label":"Enforced on the server at (file:line), or none"}]},{"id":"R-22","section":"T6","type":"check","title":"Follow the id in the URL, and any id inside the body, to the write.","tip":"The body can name a different record than the URL.","finding":"No comparison with the caller's scope before the write. Any caller can then change or delete another person's record.","forEach":"C-35","forEachWhere":{"col":"mutates","eq":"yes"},"severity":"high"},{"id":"R-23","section":"T6","type":"check","title":"List the settable fields of the class the request body binds to, and compare with what the form actually sends.","tip":"List the settable fields of the class the body lands on (a Dto name proves nothing) and compare with what the form sends. @InitBinder allow-lists cover @ModelAttribute and form binding only; for @RequestBody only @JsonIgnore, @JsonProperty(access = READ_ONLY), or a class without the field counts.","finding":"A settable id, ownership, status, or access field with no allow-list. A caller can then include it in the body and the binder sets it.","when":{"q":"C-38","includesAny":["requestbody-domain","requestbody-dto","modelattribute","beanparam","jaxrs-entity","jsf-properties","getparameter"]},"severity":"high"},{"id":"R-24","section":"T6","type":"check","title":"For each constraint, find the server-side line that rejects a value the screen would not allow.","tip":"Send the request without the form and nothing in the browser applies. Bean validation with a BindingResult the code never checks rejects nothing.","finding":"No server-side check for a constraint the screen enforces, or a check that runs after the value is stored.","forEach":"C-40","severity":"medium"},{"id":"C-41","section":"T6","type":"yesno","title":"Does the app accept file uploads?","tip":"MultipartFile, @FormDataParam, or a multipart-config in web.xml."},{"id":"C-42","section":"T6","type":"text","title":"Which record does each upload attach to, and where does that record's id come from?","tip":"An upload attached to a record id taken from the request is the write-side twin of file serving.","when":{"q":"C-41","eq":"yes"}},{"id":"R-25","section":"T6","type":"check","title":"Find where the target record id is checked before the upload is stored or linked.","tip":"Also note where the stored name or path comes from.","finding":"No check. A caller can attach a file to someone else's record.","forEach":"C-42","severity":"high"},{"id":"F-06","section":"T6","type":"list","title":"Anything else wrong that you noticed in this area","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]},{"id":"C-43","section":"T7","type":"yesno","title":"Does the app return files, PDFs, images, or documents by an identifier?","tip":"Downloads, reports, forms, letters, attachments. This is the exact pattern from the incident."},{"id":"C-44","section":"T7","type":"list","title":"For each file-serving endpoint, where is it checked that the caller may have that file?","tip":"One row per endpoint that returns bytes. The check below asks about each row.","when":{"q":"C-43","eq":"yes"},"columns":[{"key":"url","label":"URL"},{"key":"idParam","label":"Identifier parameter"},{"key":"isPublic","label":"Reachable without login","type":"select","options":["yes","no"]}]},{"id":"R-26","section":"T7","type":"check","title":"Follow the id to the file path, service call, or blob read, and find the line that compares the file's owner with the caller before the first byte is read.","tip":"This is the incident. If the id is used to build a file path, also look for the canonicalisation and base-directory check.","finding":"No comparison before the bytes are read, the handler is reachable without login, or a path built from the id with no canonicalisation check. Any caller can then download anyone's file by changing the id.","forEach":"C-44","severity":"high"},{"id":"R-27","section":"T7","type":"check","title":"Find every place a file id is written into a response.","tip":"Listings, links, JSON fields, generated HTML. Note whether ids are sequential.","finding":"Ids of other people's files reaching a caller, or sequential ids together with a missing check in R-26.","when":{"q":"C-43","eq":"yes"},"severity":"medium"},{"id":"F-07","section":"T7","type":"list","title":"Anything else wrong that you noticed in this area","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]},{"id":"C-45","section":"T8","type":"multiselect","title":"How does the app read and write data?","tip":"Select everything in use, not just the main path.","detail":"Anything selected as Other","options":[{"value":"cuf","label":"CUF (Common Update Framework) client"},{"value":"rest-client","label":"Other REST service clients"},{"value":"soap-client","label":"SOAP or JAX-WS clients"},{"value":"jpa-hibernate","label":"JPA or Hibernate"},{"value":"jdbctemplate","label":"JdbcTemplate or raw JDBC"},{"value":"stored-procedures","label":"Stored procedures"},{"value":"mybatis","label":"MyBatis"},{"value":"file-system","label":"File system"},{"value":"ldap","label":"LDAP"},{"value":"other","label":"Other (describe in Detail)"}]},{"id":"C-46","section":"T8","type":"text","title":"Which backend services does the app call, and what identifier does it send them?","tip":"Services return whatever they are asked for, so the check has to happen in this app before the call. One service per line."},{"id":"C-48","section":"T8","type":"yesno","title":"Are backend services called without any authentication?","tip":"If so, this app is the only place a record-level check can happen."},{"id":"C-49","section":"T8","type":"text","title":"What identifies a record in a CUF request, and does the request carry anything about the caller's scope?","tip":"Person id, sponsor id, family id, or something else.","when":{"q":"C-45","includes":"cuf"}},{"id":"C-50","section":"T8","type":"text","title":"For direct queries and stored procedures, is the WHERE clause limited to the caller's family or site, or only to the record id?","tip":"A query that finds by id alone returns anyone's record if the id is changed.","when":{"q":"C-45","includesAny":["jpa-hibernate","jdbctemplate","stored-procedures","mybatis"]}},{"id":"R-28","section":"T8","type":"check","title":"For every service you listed in C-46, find each call site and walk back up to the scope check.","tip":"The service checks nothing; whatever id it is sent, it returns.","finding":"A call site with no scope check anywhere above it.","forEach":"C-46","severity":"high"},{"id":"R-29","section":"T8","type":"check","title":"For every query or procedure you listed in C-50, read the WHERE clause and the code that calls it.","tip":"A scope constraint in the query, or a check on the result before it is returned, is fine.","finding":"Find-by-id alone, with no scope constraint and no check on the result.","forEach":"C-50","severity":"high"},{"id":"F-08","section":"T8","type":"list","title":"Anything else wrong that you noticed in this area","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]},{"id":"C-51","section":"T9","type":"select","title":"Are authenticated responses sent with Cache-Control: no-store?","tip":"Usually a filter or the shared web-security library. Spring Security adds no-store by default unless its headers are disabled.","detail":"Where set and the header value","options":[{"value":"global-filter","label":"Global filter or header writer sets no-store"},{"value":"per-endpoint","label":"Set per endpoint only"},{"value":"none-found","label":"None found"}]},{"id":"R-30","section":"T9","type":"check","title":"Search for Cache-Control and find which data endpoints get no-store.","tip":"Usually a filter or the shared web-security library.","finding":"Data endpoints with no no-store header. Browsers and proxies may keep the responses, including on shared workstations.","when":{"q":"C-51","in":["per-endpoint","none-found","unknown"]},"severity":"low"},{"id":"C-52","section":"T9","type":"select","title":"Is directory listing disabled in weblogic.xml?","tip":"index-directory-enabled inside container-descriptor.","when":{"q":"C-07","eq":"yes"},"options":[{"value":"disabled-explicit","label":"Explicitly disabled"},{"value":"enabled-explicit","label":"Explicitly enabled"},{"value":"not-set-default","label":"Not set (container default)"},{"value":"no-weblogic-xml","label":"No weblogic.xml present"}]},{"id":"C-53","section":"T9","type":"text","title":"Which folders are served as static content, and is anything besides frontend assets in them?","tip":"Resource handlers, the default servlet, src/main/webapp. Config files, source maps, or documents under a static folder are reachable by URL."},{"id":"R-31","section":"T9","type":"check","title":"Check index-directory-enabled in weblogic.xml, then walk each static root.","tip":"Config files, source maps, backups, documents.","finding":"Directory listing enabled, or anything under a static folder that is not a frontend asset.","when":{"any":[{"q":"C-52","in":["enabled-explicit","not-set-default","no-weblogic-xml"]},{"q":"C-53","notEmpty":true}]},"severity":"low"},{"id":"F-09","section":"T9","type":"list","title":"Anything else wrong that you noticed in this area","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]},{"id":"C-54","section":"T10","type":"text","title":"Which JSF pages hold a record id in a backing bean, and where does that id come from?","tip":"A view parameter, f:param, a managed-property bound to #{param.x}, getRequestParameterMap(), or f:attribute on a command link comes from the request and can be changed. A session attribute cannot."},{"id":"C-55","section":"T10","type":"select","title":"Is JSF view state saved on the server, or on the client, and if on the client is it encrypted?","tip":"javax.faces.STATE_SAVING_METHOD in web.xml; absent means server. For client-side state, MyFaces and Mojarra 2.2 and later encrypt by default; older Mojarra and the JSF 1.2 reference implementation need ClientStateSavingPassword.","options":[{"value":"server-side","label":"Server-side state saving"},{"value":"client-encrypted","label":"Client-side, encrypted"},{"value":"client-unencrypted","label":"Client-side, not encrypted"}]},{"id":"R-32","section":"T10","type":"check","title":"For every page you listed in C-54, find where the identifier enters the bean and every action method that uses it.","tip":"A view- or session-scoped bean keeps the id between requests, and a postback can change it. A managed-property bound to #{param.x} is re-read on every request.","finding":"No scope check when the page loads, or an action that trusts an id a postback can change.","forEach":"C-54","severity":"high"},{"id":"R-33","section":"T10","type":"check","title":"Check javax.faces.STATE_SAVING_METHOD and the implementation's secret key parameter.","tip":"Client-side state travels to the browser.","finding":"Client-side state without encryption. A caller can edit held identifiers.","when":{"q":"C-55","in":["client-unencrypted","unknown"]},"severity":"medium"},{"id":"F-10","section":"T10","type":"list","title":"Anything else wrong that you noticed in this area","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]},{"id":"F-12","section":"T12","type":"list","title":"Anything else wrong that no topic covered","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]}],"gaps":[{"id":"C-06","title":"Source this review needs that is not in this project","col":"obtained","eq":"no","text":"a needed source was never obtained; ask the developer for its GitLab URL, clone it, and answer the items that depend on it, or mark each of them unable with that reason","labelCol":"artifact","reasonCol":"reason"},{"id":"C-40","title":"Constraints the frontend enforces on submitted data","col":"serverAt","eq":"none","text":"a constraint the client enforces has no server-side equivalent; each of those rows must be answered in the check below, not left as an observation","labelCol":"field","reasonCol":null}],"inventory":{"endpoints":"C-35"}}</script>
<script>
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Definition and lookups
  // ---------------------------------------------------------------------------
  var DEF = JSON.parse(document.getElementById('def').textContent);
  // Compatibility key of a version: the major, or major.minor while the major is 0
  // (a 0.x minor bump renumbers items, so stored answers must not be reused).
  function majorOf(v) { var p = String(v || '').split('.'); return p[0] === '0' ? '0.' + (p[1] || '0') : p[0]; }
  var MAJOR = majorOf(DEF.version);
  var PREFIX = 'secreview:' + DEF.id + ':' + MAJOR + ':';
  var NEG = DEF.negativeValues || [];
  var DEV = DEF.mode === 'dev';
  var UNSURE = 'unsure';
  var UNSURE_LABEL = 'Could not determine';
  var STATUS_OPTS = [
    { value: 'pass', label: 'Checked, OK' },
    { value: 'finding', label: 'Problem found' },
    { value: 'unable', label: 'Could not determine' },
    { value: 'na', label: 'Does not apply' }
  ];
  var ROW_LABEL_KEYS = ['path', 'url', 'handler', 'service', 'location', 'page', 'pattern', 'method', 'module', 'claim', 'guardClass', 'filterClass', 'artifact', 'query'];
  var NONE_TEXT = /^none( to list| found)?\.?$/i;
  function isUnsure(v) { return v === UNSURE || (Array.isArray(v) && v.indexOf(UNSURE) >= 0); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  // First file citation in a piece of evidence, used to fill a missing Location on
  // import so that an older result whose passes cite only in Evidence still counts.
  var CITE_RE = /[\w\/.\\-]+\.(?:java|json|jspx?|js|ts|xml|xhtml|properties|ya?ml|html?|sql|txt|gradle|md)(?![\w])(?::\d+)?/i;
  function firstCitation(text) { var m = CITE_RE.exec(String(text || '')); return m ? m[0] : ''; }
  function locationOf(rec) { return hasText(rec.location) ? rec.location : (rec.status === 'pass' ? firstCitation(rec.evidence) : ''); }
  var itemsById = Object.create(null), sectionsById = Object.create(null);
  DEF.items.forEach(function (it) { itemsById[it.id] = it; });
  DEF.sections.forEach(function (s) { sectionsById[s.id] = s; });
  var findingsItemBySection = Object.create(null);
  DEF.items.forEach(function (it) { if (it.findings) findingsItemBySection[it.section] = it; });
  function sectionHeading(sec) {
    var m = /^T(\d+)$/.exec(sec.id);
    return m ? m[1] + '. ' + sec.title : 'Section ' + sec.id + ': ' + sec.title;
  }

  var state = freshState();
  var applCache = {};
  var naReason = {};
  var viaUnsure = {};
  var ui = { items: {}, sections: {} };
  var compare = null;
  var onlyDiff = false;
  var nextRowId = 1;

  function freshState() {
    return { app: '', reviewer: '', reviewerKind: 'dev', answers: {}, passthrough: {}, lastModifiedAt: null, lastExportedAt: null, importedFrom: null };
  }
  function ans(id) { return state.answers[id] || (state.answers[id] = {}); }
  // A control disabled for its own reasons (e.g. Add row while "None to list" is
  // ticked) must stay disabled when refresh() re-enables an applicable item.
  function lock(el, locked) { el.disabled = locked; if (locked) el.setAttribute('data-lock', '1'); else el.removeAttribute('data-lock'); }
  function now() { return new Date().toISOString(); }
  function fmtTime(iso) { return iso ? new Date(iso).toLocaleString() : ''; }
  function hasText(s) { return !!(s && String(s).trim()); }
  function code(s) { return String(s === undefined || s === null ? '' : s).trim().replace(/^`+|`+$/g, '').toLowerCase(); }
  function newRowId() {
    var id;
    do { id = 'r' + (nextRowId++).toString(36) + Math.floor(Math.random() * 1e6).toString(36); } while (false);
    return id;
  }

  // ---------------------------------------------------------------------------
  // Storage: one slot per application name; comparisons live beside a slot
  // ---------------------------------------------------------------------------
  function slotName(app) { var s = (app || '').trim().replace(/:/g, '-'); return s ? s.toLowerCase() : '(unnamed)'; }
  function slotKey(app) { return PREFIX + slotName(app); }
  function listSlots() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k.indexOf(PREFIX) === 0 && !/:(prev|compare)$/.test(k)) out.push(k.slice(PREFIX.length));
      }
    } catch (e) { /* storage unavailable */ }
    return out.sort();
  }
  function slotExists(app) { try { return localStorage.getItem(slotKey(app)) !== null; } catch (e) { return false; } }
  function reviewShaped(o) { return o && typeof o === 'object' && o.answers && typeof o.answers === 'object' && !Array.isArray(o.answers); }

  var saveTimer = null;
  function touch(id) {
    if (id) ans(id).updatedAt = now();
    state.lastModifiedAt = now();
    // A viewed AI result becomes the developer's own review as soon as it is edited.
    if (state.reviewerKind !== 'dev' && id) { state.reviewerKind = 'dev'; state.reviewer = ''; document.getElementById('reviewer').value = ''; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 250);
    refresh();
  }
  function save() {
    try {
      localStorage.setItem(slotKey(state.app), JSON.stringify(state));
      setStatus('Saved ' + new Date().toLocaleTimeString());
    } catch (e) {
      setStatus('Save failed: ' + e.message);
    }
  }
  function backupSlot(app) {
    try { var k = slotKey(app); var cur = localStorage.getItem(k); if (cur) localStorage.setItem(k + ':prev', cur); } catch (e) { /* ignore */ }
  }
  function loadSlot(app) {
    var raw = null;
    try { raw = localStorage.getItem(slotKey(app)); } catch (e) { /* ignore */ }
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (reviewShaped(parsed)) {
          state = parsed;
          // Keep the stored spelling of the name when it maps to the same slot.
          if (slotName(state.app) !== slotName(app)) state.app = app;
          state.reviewerKind = state.reviewerKind || 'dev';
          migrateRows();
          return true;
        }
      } catch (e) { /* fall through */ }
    }
    state = freshState();
    state.app = app;
    return false;
  }
  function saveNowTo(app) {
    try { localStorage.setItem(slotKey(app), JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  // Every table row carries a stable id; per-row answers are keyed by it.
  // Older saved reviews keyed answers by the row label: migrate once.
  function ensureRowIds(rows) {
    (rows || []).forEach(function (r) { if (!r._id) r._id = newRowId(); });
  }
  function migrateRows() {
    DEF.items.forEach(function (it) {
      var a = state.answers[it.id];
      if (!a) return;
      if (it.type === 'list' && Array.isArray(a.rows)) ensureRowIds(a.rows);
    });
    DEF.items.forEach(function (it) {
      var a = state.answers[it.id];
      if (!a || it.type !== 'check' || !it.forEach || !a.perRow) return;
      var src = itemsById[it.forEach];
      if (!src || src.type !== 'list') return;
      var rows = (state.answers[src.id] || {}).rows || [];
      var migrated = {};
      var byLabel = {};
      rows.forEach(function (r, i) { var l = rowLabel(r) || ('#' + (i + 1)); if (!byLabel[l]) byLabel[l] = r; });
      Object.keys(a.perRow).forEach(function (k) {
        if (rows.some(function (r) { return r._id === k; })) { migrated[k] = a.perRow[k]; return; }
        var m = /^(.*) #(\d+)$/.exec(k);
        var r = byLabel[k] || (m && rows[Number(m[2]) - 1]) || null;
        if (r && !migrated[r._id]) migrated[r._id] = a.perRow[k];
      });
      a.perRow = migrated;
    });
  }

  // ---------------------------------------------------------------------------
  // Conditions and per-row sources
  // ---------------------------------------------------------------------------
  function value(id) { var a = state.answers[id]; return a ? a.value : undefined; }
  function textEmpty(v) { return !hasText(v) || NONE_TEXT.test(String(v).trim()); }

  function evalCond(c, why) {
    if (!c) return true;
    if (c.all) return c.all.every(function (x) { return evalCond(x, why); });
    if (c.any) return c.any.some(function (x) { return evalCond(x, why); });
    if (c.not) return !evalCond(c.not, why);
    var item = itemsById[c.q];
    if (!item || !applicable(item)) return false;
    var v = value(c.q);
    var a = state.answers[c.q] || {};
    if (DEV && isUnsure(v)) { if (why) why.push(c.q); return true; }
    if (own(c, 'eq')) return v === c.eq;
    if (c.in) return c.in.indexOf(v) >= 0;
    if (c.includes) return Array.isArray(v) && v.indexOf(c.includes) >= 0;
    if (c.includesAny) return Array.isArray(v) && c.includesAny.some(function (x) { return v.indexOf(x) >= 0; });
    if (c.notEmpty) return item.type === 'list' ? (a.rows || []).length > 0 : !textEmpty(v);
    return false;
  }

  // Rows a per-row item iterates over. null: the source is a text field in this
  // form, so the item is asked once (and not at all when that text is empty).
  function sourceRows(item) {
    var src = itemsById[item.forEach];
    if (!src || src.type !== 'list') return null;
    var rows = (state.answers[src.id] || {}).rows || [];
    var w = item.forEachWhere;
    if (w) rows = rows.filter(function (r) { return !own(r, w.col) || code(r[w.col]) === code(w.eq); });
    return rows;
  }
  function sourceTextEmpty(item) {
    var src = itemsById[item.forEach];
    if (!src || src.type !== 'text') return false;
    return textEmpty(value(src.id));
  }
  function rowLabel(row) {
    var parts = [];
    if (hasText(row.methods)) parts.push(String(row.methods).trim());
    for (var i = 0; i < ROW_LABEL_KEYS.length; i++) {
      if (ROW_LABEL_KEYS[i] === 'method') continue;
      if (hasText(row[ROW_LABEL_KEYS[i]])) { parts.push(String(row[ROW_LABEL_KEYS[i]]).trim()); return parts.join(' '); }
    }
    var keys = Object.keys(row);
    for (var j = 0; j < keys.length; j++) { if (keys[j] !== '_id' && keys[j] !== 'methods' && hasText(row[keys[j]])) { parts.push(String(row[keys[j]]).trim()); return parts.join(' '); } }
    return parts.join(' ');
  }

  function applicable(item) {
    if (!item) return false;
    if (own(applCache, item.id)) return applCache[item.id];
    applCache[item.id] = false;
    var why = [];
    var sec = sectionsById[item.section];
    var r = evalCond(sec && sec.when, why) && evalCond(item.when, why);
    if (r && item.forEach) {
      var src = itemsById[item.forEach];
      if (src && !applicable(src)) {
        r = false;
        naReason[item.id] = item.forEach + ' does not apply';
      } else if (sourceTextEmpty(item)) {
        r = false;
        naReason[item.id] = item.forEach + ' is empty';
      } else {
        var rows = sourceRows(item);
        if (rows !== null && rows.length === 0) {
          r = false;
          naReason[item.id] = item.forEach + ' has no ' + (item.forEachWhere ? 'rows where ' + item.forEachWhere.col + ' = ' + item.forEachWhere.eq : 'rows');
        }
      }
    }
    if (r && why.length) viaUnsure[item.id] = why.filter(function (x, i) { return why.indexOf(x) === i; });
    applCache[item.id] = r;
    return r;
  }
  function sectionApplicable(sec) { return evalCond(sec.when); }

  function optionLabel(item, v) {
    if (v === UNSURE || v === 'unknown') return UNSURE_LABEL;
    if (item.type === 'yesno') return v === 'yes' ? 'Yes' : v === 'no' ? 'No' : v;
    var o = (item.options || []).filter(function (x) { return x.value === v; })[0];
    return o ? o.label : v;
  }
  function shortLabel(item, v) {
    var l = optionLabel(item, v);
    return l.split(/[:(]/)[0].trim();
  }
  // codes=true renders option codes (for export, matching the agent's Markdown);
  // otherwise short labels for the screen.
  function condText(c, codes) {
    if (!c) return '';
    var rec = function (x) { return condText(x, codes); };
    if (c.all) return c.all.map(rec).join(' and ');
    if (c.any) return c.any.map(rec).join(' or ');
    if (c.not) return 'not (' + rec(c.not) + ')';
    var item = itemsById[c.q];
    var name = codes ? c.q + (item ? ' (' + item.title + ')' : '') : c.q;
    var show = function (v) { return (codes || !item) ? v : shortLabel(item, v); };
    if (own(c, 'eq')) return name + (codes ? ' = ' : ' is ') + show(c.eq);
    if (c.in) return name + ' is one of ' + c.in.map(show).join(', ');
    if (c.includes) return name + ' includes ' + show(c.includes);
    if (c.includesAny) return name + ' includes any of ' + c.includesAny.map(show).join(', ');
    if (c.notEmpty) return name + (item && item.type === 'text' ? ' is not empty' : ' has at least one row');
    return JSON.stringify(c);
  }
  function ruleText(item, codes) {
    var parts = [];
    var sec = sectionsById[item.section];
    if (codes && sec && sec.when) parts.push(condText(sec.when, codes));
    if (item.when) parts.push(condText(item.when, codes));
    if (item.forEach && naReason[item.id] && !applicable(item)) parts.push(naReason[item.id]);
    else if (item.forEach && codes) parts.push(item.forEach + ' has at least one row' + (item.forEachWhere ? ' where ' + item.forEachWhere.col + ' = ' + item.forEachWhere.eq : ''));
    return parts.join('; and ');
  }
  function screenRule(item) {
    if (viaUnsure[item.id]) return 'Shown because ' + viaUnsure[item.id].join(' and ') + ' is "' + UNSURE_LABEL + '"; answering it will settle whether this applies.';
    var t = ruleText(item, false);
    return t ? 'Applies when ' + t : '';
  }

  // ---------------------------------------------------------------------------
  // Completion rules
  // ---------------------------------------------------------------------------
  function isNegative(item, a) {
    var v = a.value;
    var neg = NEG.concat(item.negativeValues || []);
    if (Array.isArray(v)) return v.some(function (x) { return neg.indexOf(x) >= 0; });
    return neg.indexOf(v) >= 0;
  }
  function needsSearched(item) {
    var a = state.answers[item.id] || {};
    if (item.type === 'list') return (a.rows || []).length === 0;
    return isNegative(item, a);
  }
  function needsEvidence(item) { return item.default !== undefined; }
  function checkRowComplete(r) {
    if (!r || !r.status) return false;
    if (r.status === 'finding') return hasText(r.findings);
    if (r.status === 'pass') return hasText(r.location);
    return true;
  }
  function checkRows(item) {
    var rows = sourceRows(item);
    if (rows === null) return null;
    var a = ans(item.id);
    if (!a.perRow) a.perRow = {};
    ensureRowIds(rows);
    return rows.map(function (r, i) { return { key: r._id, index: i, row: r, label: rowLabel(r) || ('row ' + (i + 1)), rec: a.perRow[r._id] || (a.perRow[r._id] = {}) }; });
  }
  function answered(item) {
    var a = state.answers[item.id] || {};
    if (item.type === 'check') {
      var rs = item.forEach ? checkRows(item) : null;
      if (rs) return rs.some(function (x) { return !!x.rec.status; });
      return !!a.status;
    }
    if (item.type === 'list') return (a.rows || []).length > 0 || (DEV && !!a.none);
    if (item.type === 'multiselect') return Array.isArray(a.value) && a.value.length > 0;
    return a.value !== undefined && a.value !== null && a.value !== '' && hasText(String(a.value));
  }
  function uncertain(item) {
    var a = state.answers[item.id] || {};
    if (item.type === 'check') {
      var rs = item.forEach ? checkRows(item) : null;
      if (rs) return rs.some(function (x) { return x.rec.status === 'unable'; });
      return a.status === 'unable';
    }
    return isUnsure(a.value);
  }
  function complete(item) {
    var a = state.answers[item.id] || {};
    if (item.optional) return true;
    if (item.type === 'check') {
      var rs = item.forEach ? checkRows(item) : null;
      if (rs) return rs.length > 0 && rs.every(function (x) { return checkRowComplete(x.rec); });
      return checkRowComplete(a);
    }
    if (DEV) return answered(item);
    if (item.type === 'list') return (a.rows || []).length > 0 || hasText(a.searched);
    if (!answered(item)) return false;
    if (needsSearched(item) && !hasText(a.searched)) return false;
    if (needsEvidence(item) && !hasText(a.evidence)) return false;
    return true;
  }
  function requirementText(item) {
    var a = state.answers[item.id] || {};
    if (DEV || item.type === 'check') return '';
    if (item.type === 'list') {
      if ((a.rows || []).length === 0) return item.emptyRequires || 'An empty table must be justified in Searched: list the patterns and directories searched.';
      return '';
    }
    if (isNegative(item, a)) {
      var v = Array.isArray(a.value) ? a.value.filter(function (x) { return NEG.indexOf(x) >= 0; }).join(', ') : a.value;
      return 'Answering "' + optionLabel(item, v) + '" requires Searched to list every signal and directory searched.';
    }
    if (needsEvidence(item)) return 'This is a fleet default. Confirm or override it with evidence.';
    return '';
  }

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------
  function h(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }
  // The card carries its outcome, so a passed check and a failed one are not the same
  // white box: pass green, problem red, undetermined amber, nothing answered plain.
  var STATE_CLASSES = ['state-pass', 'state-finding', 'state-unable', 'state-open'];
  function setState(el, s) {
    STATE_CLASSES.forEach(function (c) { if (c !== 'state-' + s) el.classList.remove(c); });
    if (s) el.classList.add('state-' + s);
  }
  function setStatus(msg) { var s = document.getElementById('status'); if (s) s.textContent = msg; }
  function flash(msg) { setStatus(msg); }
  function textarea(rows, placeholder, val, oninput, label) {
    var t = h('textarea', { rows: rows, placeholder: placeholder, 'aria-label': label || placeholder });
    t.value = val || '';
    t.addEventListener('input', function () { oninput(t.value); });
    return t;
  }

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------
  function renderControl(item) {
    var a = ans(item.id);
    var wrap = h('div', { class: 'control' });
    if (item.type === 'yesno' || item.type === 'select') {
      var opts = item.type === 'yesno'
        ? [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]
        : item.options.slice();
      if (DEV) opts.push({ value: UNSURE, label: UNSURE_LABEL });
      var group = h('fieldset', { class: 'choices' }, [h('legend', { class: 'sr', text: item.title })]);
      opts.forEach(function (o) {
        var input = h('input', { type: 'radio', name: item.id, value: o.value });
        if (a.value === o.value) input.checked = true;
        input.addEventListener('change', function () { ans(item.id).value = o.value; touch(item.id); });
        group.appendChild(h('label', { class: 'opt' }, [input, ' ', o.label]));
      });
      wrap.appendChild(group);
    } else if (item.type === 'multiselect') {
      if (!Array.isArray(a.value)) a.value = [];
      var mopts = item.options.slice();
      if (DEV) mopts.push({ value: UNSURE, label: UNSURE_LABEL });
      var mgroup = h('fieldset', { class: 'choices' }, [h('legend', { class: 'sr', text: item.title })]);
      mopts.forEach(function (o) {
        var input = h('input', { type: 'checkbox', name: item.id, value: o.value });
        if (a.value.indexOf(o.value) >= 0) input.checked = true;
        input.addEventListener('change', function () {
          var v = ans(item.id).value || [];
          var i = v.indexOf(o.value);
          if (input.checked && i < 0) v.push(o.value);
          if (!input.checked && i >= 0) v.splice(i, 1);
          ans(item.id).value = v;
          touch(item.id);
        });
        mgroup.appendChild(h('label', { class: 'opt' }, [input, ' ', o.label]));
      });
      wrap.appendChild(mgroup);
    } else if (item.type === 'text') {
      wrap.appendChild(textarea(3, 'Answer', a.value, function (v) { ans(item.id).value = v; touch(item.id); }, item.title));
    } else if (item.type === 'list') {
      wrap.appendChild(renderTable(item));
    } else if (item.type === 'check') {
      wrap.appendChild(renderCheck(item));
    }
    return wrap;
  }

  // A check: status radios, where, and a description whose meaning follows the
  // status. Per-row items get one block per row of the source table.
  function renderCheckBlock(item, rec, name, label) {
    var block = h('div', { class: 'checkblock' });
    var fs = h('fieldset', { class: 'statusopts' }, [h('legend', { class: label ? 'rowlabel' : 'sr', text: label || item.title })]);
    STATUS_OPTS.forEach(function (o) {
      var input = h('input', { type: 'radio', name: name, value: o.value });
      if (rec.status === o.value) input.checked = true;
      input.addEventListener('change', function () { rec.status = o.value; sync(); touch(item.id); });
      fs.appendChild(h('label', { class: 'opt inline' }, [input, ' ', o.label]));
    });
    block.appendChild(fs);
    var whereLabel = h('span', { text: 'Where' });
    var where = h('textarea', { rows: 1, class: 'where', placeholder: 'class, method, or URL', 'aria-label': 'Where' });
    where.value = rec.location || '';
    where.addEventListener('input', function () { rec.location = where.value; paint(); touch(item.id); });
    block.appendChild(h('label', { class: 'fld' }, [whereLabel, where]));
    var whatLabel = h('span', { text: 'What is wrong' });
    var what = textarea(2, '', rec.findings, function (v) { rec.findings = v; paint(); touch(item.id); }, 'What is wrong');
    var whatWrap = h('label', { class: 'fld' }, [whatLabel, what]);
    block.appendChild(whatWrap);
    // Only a row confirmed as OK is done; everything else is still to verify, so a card
    // with eight rows shows which one or two of them need a look.
    function paint() {
      var done = rec.status === 'pass' && checkRowComplete(rec);
      block.className = 'checkblock ' + (done ? 'block-done' : 'block-todo');
    }
    function sync() {
      paint();
      var s = rec.status;
      whereLabel.textContent = s === 'finding' ? 'Where the problem is' : (s === 'pass' ? 'Where the check is (required)' : 'Where');
      if (s === 'finding') { whatLabel.textContent = 'What is wrong, and what a caller could do'; whatWrap.hidden = false; }
      else if (s === 'unable') { whatLabel.textContent = 'What you tried and where the trail ended'; whatWrap.hidden = false; }
      else if (s === 'na') { whatLabel.textContent = 'Why it does not apply'; whatWrap.hidden = false; }
      else { whatWrap.hidden = true; }
    }
    sync();
    (ui.items[item.id].blockPaints = ui.items[item.id].blockPaints || []).push(paint);
    return block;
  }
  function renderCheck(item) {
    var box = h('div', { class: 'checkbox' });
    function draw() {
      box.innerHTML = '';
      ui.items[item.id].blockPaints = [];
      var rs = item.forEach ? checkRows(item) : null;
      if (rs) {
        rs.forEach(function (x) { box.appendChild(renderCheckBlock(item, x.rec, item.id + ':' + x.key, x.label)); });
        ui.items[item.id].rowsKey = rs.map(function (x) { return x.key; }).join('');
      } else {
        box.appendChild(renderCheckBlock(item, ans(item.id), item.id, null));
        ui.items[item.id].rowsKey = '';
      }
    }
    draw();
    ui.items[item.id].redraw = draw;
    return box;
  }

  function renderTable(item) {
    var a = ans(item.id);
    if (!Array.isArray(a.rows)) a.rows = [];
    ensureRowIds(a.rows);
    var box = h('div', { class: 'tablebox' });
    var table = h('table', { class: 'rows' });
    var thead = h('thead', null, [h('tr', null, item.columns.map(function (c) { return h('th', { text: c.label }); }).concat([h('th', { text: '' })]))]);
    var tbody = h('tbody');
    table.appendChild(thead);
    table.appendChild(tbody);
    var noneBox = null;

    function drawRows() {
      tbody.innerHTML = '';
      a.rows.forEach(function (row, idx) {
        var tr = h('tr');
        item.columns.forEach(function (c) {
          var cell;
          var aria = c.label + ', row ' + (idx + 1);
          if (c.type === 'select') {
            var stored = row[c.key] || '';
            var opts = c.options.slice();
            var match = opts.filter(function (o) { return code(o) === code(stored); })[0];
            if (stored && !match) opts.push(stored); // keep an unlisted value visible rather than losing it
            cell = h('select', { 'aria-label': aria }, [h('option', { value: '', text: '' })].concat(opts.map(function (o) { return h('option', { value: o, text: o }); })));
            cell.value = match || stored;
            cell.addEventListener('change', function () { row[c.key] = cell.value; touch(item.id); });
          } else if (c.type === 'long') {
            cell = h('textarea', { rows: 2, 'aria-label': aria });
            cell.value = row[c.key] || '';
            cell.addEventListener('input', function () { row[c.key] = cell.value; touch(item.id); });
          } else {
            cell = h('input', { type: 'text', value: row[c.key] || '', 'aria-label': aria });
            cell.addEventListener('input', function () { row[c.key] = cell.value; touch(item.id); });
          }
          tr.appendChild(h('td', null, [cell]));
        });
        var del = h('button', { type: 'button', class: 'mini', title: 'Remove row', 'aria-label': 'Remove row ' + (idx + 1), text: 'x' });
        del.addEventListener('click', function () { a.rows.splice(idx, 1); drawRows(); touch(item.id); });
        tr.appendChild(h('td', { class: 'rowact' }, [del]));
        tbody.appendChild(tr);
      });
      var count = box.querySelector('.rowcount');
      if (count) count.textContent = a.rows.length + ' row' + (a.rows.length === 1 ? '' : 's');
      if (noneBox) {
        if (a.rows.length) { a.none = false; noneBox.checked = false; }
        noneBox.parentNode.hidden = a.rows.length > 0;
      }
      lock(addBtn, !!a.none);
      lock(pasteBtn, !!a.none);
    }

    var addBtn = h('button', { type: 'button', class: 'small', text: 'Add row' });
    addBtn.addEventListener('click', function () {
      var row = { _id: newRowId() }; item.columns.forEach(function (c) { row[c.key] = ''; });
      a.rows.push(row); drawRows(); touch(item.id);
      var last = tbody.lastChild && tbody.lastChild.querySelector('input,select,textarea');
      if (last) last.focus();
    });
    var pasteBtn = h('button', { type: 'button', class: 'small', text: 'Paste rows' });
    pasteBtn.addEventListener('click', function () { openPasteModal(item, function () { drawRows(); touch(item.id); }, pasteBtn); });

    var actions = [addBtn, ' ', pasteBtn, ' ', h('span', { class: 'rowcount' })];
    if (DEV && !item.optional) {
      noneBox = h('input', { type: 'checkbox' });
      noneBox.checked = !!a.none;
      noneBox.addEventListener('change', function () { ans(item.id).none = noneBox.checked; drawRows(); touch(item.id); });
      actions.push(h('label', { class: 'opt inline nonebox' }, [noneBox, ' None to list']));
    }
    box.appendChild(h('div', { class: 'tablescroll' }, [table]));
    box.appendChild(h('div', { class: 'tableactions' }, actions));
    drawRows();
    ui.items[item.id].drawRows = drawRows;
    return box;
  }

  // ---------------------------------------------------------------------------
  // Items and sections
  // ---------------------------------------------------------------------------
  function renderItem(item) {
    var a = ans(item.id);
    ui.items[item.id] = {};
    var chip = h('span', { class: 'chip' });
    // Checks are work: something to trace and decide. Facts are what you know. The card
    // says which it is, so a check is never skimmed as another question.
    var kind = item.type === 'check' ? 'check' : (item.findings ? 'issues' : 'fact');
    var head = h('header', { class: 'ihead' }, [
      h('span', { class: 'iid', text: item.id }),
      kind === 'fact' ? null : h('span', { class: 'kind kind-' + kind, text: kind === 'check' ? 'Check' : 'Record issues' }),
      kind === 'check' ? h('span', { class: 'okmark', title: 'Checked, OK', 'aria-hidden': 'true', text: '✓' }) : null,
      h('h3', { text: item.title }),
      chip
    ]);
    var ruleEl = h('p', { class: 'rule' });

    var howParts = [h('p', { text: item.how || '' })];
    if (item.signals && item.signals.length) {
      howParts.push(h('p', { class: 'signals' }, [h('strong', { text: 'Signals to search: ' })].concat(item.signals.map(function (s, i) {
        return h('span', null, [h('code', { text: s }), i < item.signals.length - 1 ? ', ' : '']);
      }))));
    }
    var how = DEV
      ? h('div', null, [
          h('p', { class: 'tip', text: item.tip || '' }),
          (item.type === 'check' && item.finding) ? h('p', { class: 'problemif' }, [h('strong', { text: 'Problem if: ' }), item.finding]) : null
        ])
      : h('details', { class: 'how' }, [h('summary', { text: 'How to find it' })].concat(howParts));

    var fields = [];
    var req = h('div', { class: 'req' });
    if (item.detail) {
      fields.push(h('label', { class: 'fld' }, [h('span', { text: 'Detail: ' + item.detail }),
        textarea(2, item.detail, a.detail, function (v) { ans(item.id).detail = v; touch(item.id); }, 'Detail')]));
    }
    if (DEV) {
      fields.push(h('label', { class: 'fld' }, [h('span', { text: 'Notes' }),
        textarea(2, 'optional', a.notes, function (v) { ans(item.id).notes = v; touch(item.id); }, 'Notes'), req]));
    } else {
      fields.push(h('label', { class: 'fld' }, [h('span', { text: 'Evidence' }),
        textarea(2, 'file:line citations that support the answer', a.evidence, function (v) { ans(item.id).evidence = v; touch(item.id); }, 'Evidence')]));
      fields.push(h('label', { class: 'fld' }, [h('span', { text: 'Searched' }),
        textarea(2, 'patterns and directories searched', a.searched, function (v) { ans(item.id).searched = v; touch(item.id); }, 'Searched'), req]));
    }

    var aiBits = [];
    if (hasText(a.evidence)) aiBits.push(['Evidence', a.evidence]);
    if (hasText(a.searched)) aiBits.push(['Searched', a.searched]);
    if (hasText(a.whyNoMore)) aiBits.push(['Why no more findings', a.whyNoMore]);
    if (hasText(a.asked)) aiBits.push(['Asked the developer', a.asked]);
    if (a.perRow) Object.keys(a.perRow).forEach(function (k) {
      var x = a.perRow[k] || {};
      var lab = (function () { var rows = (state.answers[item.forEach] || {}).rows || []; var r = rows.filter(function (q) { return q._id === k; })[0]; return r ? rowLabel(r) : k; })();
      if (hasText(x.evidence)) aiBits.push(['Evidence (' + lab + ')', x.evidence]);
      if (hasText(x.whyNoMore)) aiBits.push(['Why no more findings (' + lab + ')', x.whyNoMore]);
      if (hasText(x.asked)) aiBits.push(['Asked the developer (' + lab + ')', x.asked]);
    });
    var aiEl = (DEV && aiBits.length)
      ? h('details', { class: 'aifields' }, [h('summary', { text: 'Evidence from the imported result' })].concat(aiBits.map(function (b) {
          return h('div', { class: 'pre' }, [h('strong', { text: b[0] + ': ' }), b[1]]);
        })))
      : null;

    var findingsItem = findingsItemBySection[item.section];
    var remind = (DEV && !item.findings && findingsItem)
      ? h('p', { class: 'remind' }, ['Spotted something else wrong while looking? Add it to ', h('a', { href: '#item-' + findingsItem.id, text: 'Issues found in this area' }), ' at the end of this topic.'])
      : null;

    var cmp = h('div', { class: 'cmp', hidden: true });
    var meta = h('footer', { class: 'meta' });
    var root = h('article', { class: 'item item-' + kind, 'data-id': item.id, id: 'item-' + item.id }, [
      head, ruleEl, how, renderControl(item), h('div', { class: 'fields' }, fields), aiEl, cmp, remind, meta
    ]);
    ui.items[item.id].root = root;
    ui.items[item.id].cmp = cmp;
    ui.items[item.id].chip = chip;
    ui.items[item.id].req = req;
    ui.items[item.id].meta = meta;
    ui.items[item.id].ruleEl = ruleEl;
    return root;
  }

  function renderAll() {
    var form = document.getElementById('form');
    form.innerHTML = '';
    ui.items = {}; ui.sections = {};
    applCache = {}; naReason = {}; viaUnsure = {};
    compare = readCompare();
    DEF.items.forEach(function (it) {
      if (it.default !== undefined && state.answers[it.id] === undefined) state.answers[it.id] = { value: it.default };
      if (it.type === 'list' && state.answers[it.id] && Array.isArray(state.answers[it.id].rows)) ensureRowIds(state.answers[it.id].rows);
    });
    if (DEF.intro) form.appendChild(h('p', { class: 'intro flowintro', text: DEF.intro }));
    var phases = DEF.phases && DEF.phases.length ? DEF.phases : [{ id: null, title: '' }];
    phases.forEach(function (ph) {
      var phEl = h('div', { class: 'phase', 'data-phase': ph.id || '' });
      if (ph.title) phEl.appendChild(h('h1', { text: ph.title }));
      if (ph.intro) phEl.appendChild(h('p', { class: 'intro', text: ph.intro }));
      DEF.sections.filter(function (s) { return ph.id === null || s.phase === ph.id; }).forEach(function (sec) {
        var secEl = h('section', { class: 'sec', 'data-sec': sec.id, id: 'sec-' + sec.id }, [
          h('h2', { text: sectionHeading(sec) }),
          sec.intro ? h('p', { class: 'intro', text: sec.intro }) : null,
          sec.when ? h('p', { class: 'rule', text: 'Applies when ' + condText(sec.when) }) : null
        ]);
        DEF.items.filter(function (it) { return it.section === sec.id; }).forEach(function (it) {
          secEl.appendChild(renderItem(it));
        });
        ui.sections[sec.id] = secEl;
        phEl.appendChild(secEl);
      });
      form.appendChild(phEl);
    });
    form.appendChild(h('section', { class: 'sec summary', id: 'issues-summary' }, [
      h('h2', { id: 'issues-heading', tabindex: '-1', text: 'All issues found' }),
      h('p', { class: 'note', text: 'Filled in automatically from every check marked "' + statusLabel('finding') + '" and every row of the issues tables above. Nothing is entered here directly; click an item to go to where it was recorded.' }),
      h('div', { id: 'issues-list' })
    ]));
    document.getElementById('app').value = state.app || '';
    document.getElementById('reviewer').value = state.reviewer || '';
    refreshSlots();
    refresh();
  }

  // ---------------------------------------------------------------------------
  // Refresh: applicability, completion, progress
  // ---------------------------------------------------------------------------
  function statusLabel(v) { var o = STATUS_OPTS.filter(function (x) { return x.value === v; })[0]; return o ? o.label : v; }
  function refresh() {
    applCache = {}; naReason = {}; viaUnsure = {};
    var total = 0, done = 0, findings = 0, unsureCount = 0, cmpDiff = 0, cmpTotal = 0;
    DEF.sections.forEach(function (sec) {
      var secEl = ui.sections[sec.id];
      if (!secEl) return;
      var on = sectionApplicable(sec);
      secEl.classList.toggle('na', !on);
      secEl.hidden = !on && !compare;
    });
    DEF.items.forEach(function (it) {
      var u = ui.items[it.id];
      if (!u) return;
      if (it.type === 'check' && it.forEach && u.redraw) {
        var rs = checkRows(it);
        var key = rs ? rs.map(function (x) { return x.key; }).join('') : '';
        if (key !== u.rowsKey) u.redraw();
      }
      var on = applicable(it);
      u.root.classList.toggle('na', !on);
      u.root.hidden = !on;
      Array.prototype.forEach.call(u.root.querySelectorAll('input,select,textarea,button'), function (x) { x.disabled = !on || x.getAttribute('data-lock') === '1'; });
      var rt = screenRule(it);
      u.ruleEl.textContent = rt;
      u.ruleEl.hidden = !rt;
      if (u.blockPaints) u.blockPaints.forEach(function (p) { p(); });
      var diff = renderCompare(it, u);
      if (compare) {
        cmpTotal++;
        if (diff) { cmpDiff++; u.root.hidden = false; }
        else if (onlyDiff) u.root.hidden = true;
      }
      if (!on) {
        setState(u.root, null);
        u.chip.textContent = 'N/A by rule';
        u.chip.className = 'chip chip-na';
        u.req.textContent = '';
        u.meta.textContent = '';
        return;
      }
      var a = state.answers[it.id] || {};
      if (it.optional && !answered(it)) {
        u.chip.textContent = 'Optional';
        u.chip.className = 'chip chip-open';
        u.req.textContent = '';
        u.meta.textContent = '';
        return;
      }
      total++;
      var ok = complete(it);
      if (ok) done++;
      var unc = uncertain(it);
      if (unc) unsureCount++;
      if (it.type === 'check') {
        var rs2 = it.forEach ? checkRows(it) : null;
        if (rs2) {
          var n = rs2.filter(function (x) { return checkRowComplete(x.rec); }).length;
          var f = rs2.filter(function (x) { return x.rec.status === 'finding'; }).length;
          findings += f;
          u.chip.textContent = n + ' of ' + rs2.length + (f ? ', ' + f + ' problem' + (f === 1 ? '' : 's') : '') + (unc ? ', some undetermined' : '');
          u.chip.className = 'chip ' + (f ? 'chip-bad' : (unc ? 'chip-warn' : (ok ? 'chip-ok' : 'chip-open')));
          var allPass = rs2.length > 0 && rs2.every(function (x) { return x.rec.status === 'pass'; });
          setState(u.root, f ? 'finding' : (unc ? 'unable' : (ok && allPass ? 'pass' : 'open')));
        } else {
          if (a.status === 'finding') findings++;
          u.chip.textContent = a.status ? (ok ? statusLabel(a.status) : (a.status === 'pass' ? 'Say where the check is' : 'Describe the problem')) : 'Open';
          u.chip.className = 'chip ' + (a.status === 'finding' ? 'chip-bad' : (a.status === 'unable' ? 'chip-warn' : (ok ? 'chip-ok' : (a.status ? 'chip-warn' : 'chip-open'))));
          setState(u.root, a.status === 'finding' ? 'finding' : (a.status === 'unable' ? 'unable' : (a.status === 'pass' && ok ? 'pass' : 'open')));
        }
      } else {
        u.chip.textContent = ok ? (unc ? UNSURE_LABEL : (DEV ? 'Done' : 'Complete')) : (answered(it) ? 'Needs evidence' : 'Open');
        u.chip.className = 'chip ' + (ok ? (unc ? 'chip-warn' : 'chip-ok') : (answered(it) ? 'chip-warn' : 'chip-open'));
        setState(u.root, unc ? 'unable' : null);
      }
      if (it.findings && a.rows) findings += a.rows.length;
      var r = requirementText(it);
      var missing = (needsSearched(it) && !hasText(a.searched)) || (needsEvidence(it) && !hasText(a.evidence));
      u.req.textContent = r;
      u.req.className = 'req' + (r && missing ? ' req-missing' : '');
      u.meta.textContent = a.updatedAt ? 'Updated ' + fmtTime(a.updatedAt) : '';
    });
    var bar = document.getElementById('cmpbar');
    if (bar) {
      bar.hidden = !compare;
      if (compare) {
        var who = compare.sources.map(function (s) { return (s.reviewer || 'unknown') + ' [' + (s.reviewerKind || '?') + ']'; }).join(' + ');
        document.getElementById('cmpinfo').textContent = 'Comparing with ' + who + ': ' + cmpDiff + ' of ' + cmpTotal + ' items differ';
      }
    }
    if (compare) {
      DEF.sections.forEach(function (sec) {
        var secEl = ui.sections[sec.id];
        if (!secEl) return;
        secEl.hidden = !Array.prototype.some.call(secEl.querySelectorAll('.item'), function (el) { return !el.hidden; });
      });
    }
    var issues = collectIssues();
    findings = issues.length;
    renderIssueSummary(issues);
    var pct = total ? Math.round(done / total * 100) : 0;
    document.getElementById('progress').value = pct;
    document.getElementById('progresstext').textContent = done + ' of ' + total + ' applicable items complete (' + pct + '%)'
      + (unsureCount ? ', ' + unsureCount + ' undetermined' : '')
      + (findings ? ', ' + findings + ' issue' + (findings === 1 ? '' : 's') + ' recorded' : '');
    var dirty = state.lastModifiedAt && (!state.lastExportedAt || state.lastModifiedAt > state.lastExportedAt);
    var badge = document.getElementById('dirty');
    badge.hidden = !dirty;
    badge.textContent = state.lastExportedAt ? 'Changes since last export' : 'Never exported';
  }

  // Review gaps: rows of a gap-flagging item (DEF.gaps, derived by the build from
  // warnRows) that carry the flagged value. The item may be one the form renders or one
  // it never shows, in which case the record sits in the passthrough from an import.
  function reviewGaps() {
    var out = [];
    (DEF.gaps || []).forEach(function (g) {
      var rec = state.answers[g.id] || (state.passthrough && state.passthrough[g.id]) || null;
      var rows = rec && Array.isArray(rec.rows) ? rec.rows : [];
      rows.forEach(function (row) {
        if (String(row[g.col] || '').trim().toLowerCase() !== String(g.eq).toLowerCase()) return;
        out.push({ item: g.id, title: g.title, label: String(row[g.labelCol] || '').trim() || '(unnamed)', reason: g.reasonCol ? String(row[g.reasonCol] || '').trim() : '', text: g.text });
      });
    });
    return out;
  }
  // Every applicable check marked Could not determine, per row or as a whole.
  function unsettledChecks() {
    var out = [];
    DEF.items.forEach(function (it) {
      if (it.type !== 'check' || !applicable(it)) return;
      var a = state.answers[it.id] || {};
      var rs = it.forEach ? checkRows(it) : null;
      if (rs) rs.forEach(function (x) { if (x.rec.status === 'unable') out.push({ item: it.id, row: x.index + 1, label: x.label, title: it.title, note: x.rec.findings || x.rec.evidence || '' }); });
      else if (a.status === 'unable') out.push({ item: it.id, title: it.title, note: a.findings || a.evidence || '' });
    });
    return out;
  }
  // The imported file was written while the linter still reported problems, or an AI
  // result carries no linter stamp at all: a snapshot of an unfinished run.
  function snapshotNote() {
    var f = state.importedFrom;
    if (!f) return '';
    if (f.lintProblems > 0) return 'This result was written while the linter still reported ' + f.lintProblems + ' problem' + (f.lintProblems === 1 ? '' : 's') + '. It is a snapshot of an unfinished review, not a final result; the unfinished items are listed at the end of the form.';
    if (f.reviewerKind === 'ai' && f.lintProblems === null) return 'This AI result carries no linter stamp, so it was not written by the linter and may be a snapshot of an unfinished review.';
    return '';
  }
  function renderGapBar(gaps) {
    var bar = document.getElementById('gapbar');
    if (!bar) return;
    bar.innerHTML = '';
    var snap = snapshotNote();
    bar.hidden = gaps.length === 0 && !snap;
    if (bar.hidden) return;
    if (snap) {
      bar.appendChild(h('p', { class: 'snap' }, [h('strong', { text: 'Unfinished result: ' }), snap, ' ', (function () { var a = h('a', { href: '#issues-summary', text: 'See what is unfinished' }); a.addEventListener('click', function (e) { e.preventDefault(); goToIssues(); }); return a; })()]));
    }
    if (!gaps.length) return;
    bar.appendChild(h('strong', { text: 'Review incomplete: ' }));
    bar.appendChild(document.createTextNode(gaps.length === 1 ? 'the source of one library this review depends on was not obtained. ' : 'the sources of ' + gaps.length + ' libraries this review depends on were not obtained. '));
    var ul = h('ul', null, gaps.map(function (g) { return h('li', null, [h('code', { text: g.label }), g.reason ? ' (' + g.reason + ')' : '']); }));
    bar.appendChild(ul);
    bar.appendChild(document.createTextNode('Every check that depends on them must be Could not determine, not Checked OK. '));
    var link = h('a', { href: '#issues-summary', text: 'See what is unsettled' });
    link.addEventListener('click', function (e) { e.preventDefault(); goToIssues(); });
    bar.appendChild(link);
  }
  function unfinishedItems() {
    var out = [];
    DEF.items.forEach(function (it) {
      if (!applicable(it) || it.optional || complete(it)) return;
      var u = ui.items[it.id];
      out.push({ item: it.id, title: it.title, why: u && u.chip ? u.chip.textContent : '' });
    });
    return out;
  }
  function renderUnfinished(list, items) {
    if (!items.length) return;
    list.appendChild(h('h3', { class: 'unfinished-head', text: 'Unfinished: ' + items.length + ' item' + (items.length === 1 ? '' : 's') }));
    list.appendChild(h('ul', { class: 'unfinished' }, items.map(function (x) {
      return h('li', null, [h('a', { href: '#item-' + x.item, text: x.item }), ' ', h('span', { text: x.title }), x.why ? h('span', { class: 'small', text: ' (' + x.why + ')' }) : null]);
    })));
  }
  // Every endpoint the review listed, as a plain table at the end: method, URL, handler,
  // whether it is public and whether it writes. Read from the inventory item's rows, which
  // keep every column the agent wrote even where the form shows fewer.
  function endpointRows() {
    var id = DEF.inventory && DEF.inventory.endpoints;
    if (!id || !applicable(itemsById[id] || { section: 'T0' })) return [];
    var a = state.answers[id] || {};
    return (a.rows || []).map(function (r) { return { methods: r.methods || '', url: r.path || r.url || '', handler: r.handler || '', isPublic: String(r.isPublic || '').toLowerCase(), idSource: r.idSource || '', mutates: String(r.mutates || '').toLowerCase() }; });
  }
  function renderEndpoints(list) {
    var rows = endpointRows();
    if (!rows.length) return;
    var id = DEF.inventory.endpoints;
    list.appendChild(h('h3', { class: 'endpoints-head' }, ['All endpoints: ' + rows.length + ' ', h('a', { href: '#item-' + id, class: 'small', text: '(from ' + id + ')' })]));
    var head = h('tr', null, ['Method', 'URL', 'Handler', 'Public', 'Id source', 'Writes'].map(function (t) { return h('th', { text: t }); }));
    var tbody = h('tbody', null, rows.map(function (r) {
      return h('tr', { class: (r.isPublic === 'yes' ? 'public ' : '') + (r.mutates === 'yes' ? 'writes' : '') }, [
        h('td', { text: r.methods }), h('td', null, [h('code', { text: r.url })]), h('td', { text: r.handler }),
        h('td', { text: r.isPublic === 'yes' ? 'yes' : (r.isPublic || '') }), h('td', { text: r.idSource }), h('td', { text: r.mutates === 'yes' ? 'yes' : (r.mutates || '') })
      ]);
    }));
    list.appendChild(h('div', { class: 'tablescroll' }, [h('table', { class: 'endpoints' }, [h('thead', null, [head]), tbody])]));
  }
  function renderUnsettled(list, gaps, unsettled) {
    if (!gaps.length && !unsettled.length) return;
    list.appendChild(h('h3', { class: 'unsettled-head', text: 'Not settled: ' + (gaps.length + unsettled.length) }));
    var ul = h('ul', { class: 'unsettled' }, []);
    gaps.forEach(function (g) {
      ul.appendChild(h('li', { class: 'gap' }, [h('strong', { text: 'Library source not obtained: ' }), h('code', { text: g.label }), g.reason ? ' (' + g.reason + ')' : '', ' ', h('span', { class: 'small', text: g.text })]));
    });
    unsettled.forEach(function (u) {
      ul.appendChild(h('li', null, [h('a', { href: '#item-' + u.item, text: u.item + (u.row ? ' row ' + u.row : '') }), ' ', h('span', { text: statusLabel('unable') + (u.label ? ': ' + u.label : '') }), h('div', { class: 'small', text: (u.title || '') + (u.note ? ': ' + u.note : '') })]));
    });
    list.appendChild(ul);
  }
  function issueTable(issues) {
    var head = h('tr', null, ['Topic', 'Item', 'Where', 'What', 'Severity'].map(function (t) { return h('th', { text: t }); }));
    var tbody = h('tbody', null, []);
    issues.forEach(function (x) {
      var sec = sectionsById[x.sectionId];
      var where = [x.label, x.location].filter(hasText).join(' ');
      var itemText = x.item + (x.row ? ' row ' + x.row : '') + (hasText(x.relatedItem) ? ' (see ' + x.relatedItem + ')' : '');
      tbody.appendChild(h('tr', null, [
        h('td', { text: sec ? sectionHeading(sec) : (x.sectionId || '') }),
        h('td', null, [h('a', { href: '#item-' + x.item, text: itemText }), h('div', { class: 'small', text: x.title || '' })]),
        h('td', { text: where }),
        h('td', { text: x.description || '' }),
        h('td', { text: x.severity || '' })
      ]));
    });
    return h('div', { class: 'tablescroll' }, [h('table', { class: 'issues' }, [h('thead', null, [head]), tbody])]);
  }
  function renderIssueSummary(issues) {
    var list = document.getElementById('issues-list');
    var gaps = reviewGaps();
    renderGapBar(gaps);
    if (list) {
      list.innerHTML = '';
      renderUnfinished(list, unfinishedItems());
      renderUnsettled(list, gaps, unsettledChecks());
      if (issues.length) list.appendChild(issueTable(issues));
      else list.appendChild(h('p', { class: 'intro', text: 'No issues recorded yet.' }));
      if (compare) {
        var theirs = issuesFromResult(compare.answers);
        var who = compare.sources.map(function (s) { return (s.reviewer || 'unknown') + ' [' + (s.reviewerKind || '?') + ']'; }).join(' + ');
        list.appendChild(h('h3', { text: 'Issues in the comparison result from ' + who + ': ' + theirs.length }));
        if (theirs.length) list.appendChild(issueTable(theirs));
      }
      renderEndpoints(list);
    }
    var badge = document.getElementById('issues-badge');
    if (badge) {
      var n = issues.length;
      var words = n + ' issue' + (n === 1 ? '' : 's') + ' recorded';
      badge.hidden = n === 0;
      badge.querySelector('.count').textContent = String(n);
      badge.setAttribute('aria-label', words + '; go to the list');
      badge.title = words + '. Click to see the list at the end of the form.';
    }
  }
  function goToIssues() {
    var target = document.getElementById('issues-summary');
    if (!target) return;
    if (target.scrollIntoView) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    var hd = document.getElementById('issues-heading');
    if (hd) { try { hd.focus({ preventScroll: true }); } catch (e) { hd.focus(); } }
  }
  function refreshSlots() {
    var dl = document.getElementById('slots');
    dl.innerHTML = '';
    listSlots().forEach(function (s) { dl.appendChild(h('option', { value: s })); });
  }

  // ---------------------------------------------------------------------------
  // Comparison with a second result (for example the AI's), shown per item
  // ---------------------------------------------------------------------------
  function compareKey() { return slotKey(state.app) + ':compare'; }
  function saveCompare() {
    try { if (compare) localStorage.setItem(compareKey(), JSON.stringify(compare)); else localStorage.removeItem(compareKey()); } catch (e) { /* ignore */ }
  }
  function readCompare() {
    try { var raw = localStorage.getItem(compareKey()); var c = raw ? JSON.parse(raw) : null; return (c && Array.isArray(c.sources) && c.answers && typeof c.answers === 'object') ? c : null; } catch (e) { return null; }
  }
  function loadCompare(obj) {
    if (!obj || typeof obj !== 'object' || !obj.answers || typeof obj.answers !== 'object') { flash('That JSON has no answers to compare'); return; }
    var next = compare && Array.isArray(compare.sources) ? compare : { sources: [], answers: Object.create(null) };
    next.sources.push({ reviewer: obj.reviewer || '', reviewerKind: obj.reviewerKind || '', exportedAt: obj.exportedAt || '', app: obj.app || '' });
    Object.keys(obj.answers).forEach(function (id) { if (own(itemsById, id) && obj.answers[id] && typeof obj.answers[id] === 'object') next.answers[id] = obj.answers[id]; });
    compare = next;
    refresh();
    saveCompare();
  }
  function clearCompare() {
    compare = null; onlyDiff = false;
    var box = document.getElementById('cmp-only');
    if (box) box.checked = false;
    saveCompare();
    refresh();
  }

  function rowsToText(rows) {
    return (rows || []).map(function (r) { return Object.keys(r).filter(function (k) { return k !== '_id'; }).map(function (k) { return r[k]; }).filter(hasText).join(' | '); }).filter(hasText).join('\n');
  }
  function collapseRows(perRow) {
    perRow = perRow.map(function (x) { var c = Object.assign({}, x); c.location = locationOf(x); return c; });
    var st = perRow.map(function (x) { return x.status || null; }).filter(Boolean);
    var status = !st.length ? null
      : st.every(function (s) { return s === st[0]; }) ? st[0]
      : st.indexOf('finding') >= 0 ? 'finding' : st.indexOf('unable') >= 0 ? 'unable' : st.indexOf('pass') >= 0 ? 'pass' : 'na';
    var join = function (k) { return perRow.map(function (x) { return hasText(x[k]) ? ((x.label || ('row ' + x.row)) + ': ' + x[k]) : ''; }).filter(Boolean).join('; '); };
    return { status: status, location: join('location'), findings: join('findings'), evidence: join('evidence'), whyNoMore: join('whyNoMore'), reason: join('reason'), asked: join('asked') };
  }
  function textOf(rec) {
    if (!rec) return '';
    if (Array.isArray(rec.rows)) return rec.rows.length ? rowsToText(rec.rows) : ((rec.complete || hasText(rec.searched) || rec.none) ? 'None' : '');
    return rec.value === undefined || rec.value === null ? '' : String(rec.value);
  }
  function normalizeRec(item, rec, perRowStatuses) {
    if (!rec || rec.status === 'na' || rec.status === 'missing') return null;
    if (item.type === 'check') {
      if (perRowStatuses) return perRowStatuses.length ? perRowStatuses : null;
      return rec.status || null;
    }
    if (item.type === 'list') { var labels = (rec.rows || []).map(rowLabel).sort(); return labels.length ? labels : null; }
    if (item.type === 'multiselect') return Array.isArray(rec.value) && rec.value.length ? rec.value.slice().sort() : null;
    if (item.type === 'text') { var tv = textOf(rec); return hasText(tv) ? String(tv).trim() : null; }
    return (rec.value === undefined || rec.value === null || rec.value === '') ? null : rec.value;
  }
  function mineNormalized(item) {
    if (!applicable(item)) return null;
    var a = state.answers[item.id] || {};
    var rs = (item.type === 'check' && item.forEach) ? checkRows(item) : null;
    return normalizeRec(item, a, rs ? rs.map(function (x) { return x.rec.status || null; }) : null);
  }
  function theirsNormalized(item, rec) {
    if (rec && Array.isArray(rec.perRow) && item.type === 'check' && item.forEach && sourceRows(item) === null) return normalizeRec(item, collapseRows(rec.perRow), null);
    return normalizeRec(item, rec, (rec && Array.isArray(rec.perRow)) ? rec.perRow.map(function (x) { return x.status || null; }) : null);
  }
  function statusText(v) { return v ? statusLabel(v) : '(no status)'; }
  function formatTheirs(item, rec) {
    if (!rec) return h('div', { class: 'cmpv muted', text: 'no answer in the other result' });
    if (rec.status === 'na') return h('div', { class: 'cmpv muted', text: 'N/A: ' + (rec.reason || '') });
    if (rec.status === 'missing') return h('div', { class: 'cmpv muted', text: 'missing in the other result' });
    var parts = [];
    if (item.type === 'check') {
      if (Array.isArray(rec.perRow)) {
        var ul = h('ul', { class: 'cmprows' });
        rec.perRow.forEach(function (x) {
          ul.appendChild(h('li', null, [h('code', { text: x.label || ('row ' + x.row) }), ': ' + statusText(x.status) + (x.location ? ' at ' + x.location : '') + (x.findings ? '. ' + x.findings : '')]));
        });
        parts.push(ul);
      } else {
        parts.push(h('div', { text: statusText(rec.status) + (rec.location ? ' at ' + rec.location : '') + (rec.findings ? '. ' + rec.findings : '') }));
      }
    } else if (item.type === 'list') {
      var rows = Array.isArray(rec.rows) ? rec.rows : [];
      parts.push(h('div', { text: rows.length + ' row' + (rows.length === 1 ? '' : 's') + (rows.length > 12 ? ' (first 12 shown)' : '') }));
      if (rows.length) {
        var ul2 = h('ul', { class: 'cmprows' });
        rows.slice(0, 12).forEach(function (r) { ul2.appendChild(h('li', { text: rowLabel(r) + (Object.keys(r).length > 2 ? ' | ' + Object.keys(r).filter(function (k) { return k !== '_id'; }).map(function (k) { return r[k]; }).filter(hasText).slice(1).join(' | ') : '') })); });
        parts.push(ul2);
      }
    } else if (item.type === 'multiselect') {
      parts.push(h('div', { text: (Array.isArray(rec.value) ? rec.value : []).map(function (v) { return optionLabel(item, v); }).join(', ') || '(none)' }));
    } else if (item.type === 'text') {
      parts.push(h('div', { class: 'pre', text: textOf(rec) || '(empty)' }));
    } else {
      var v = rec.value;
      var shown = v ? optionLabel(item, v) : '';
      parts.push(h('div', { text: shown || '(empty)' }));
    }
    if (hasText(rec.detail)) parts.push(h('div', { class: 'muted', text: 'Detail: ' + rec.detail }));
    if (hasText(rec.notes)) parts.push(h('div', { class: 'muted', text: 'Notes: ' + rec.notes }));
    if (hasText(rec.evidence)) parts.push(h('div', { class: 'muted pre', text: 'Evidence: ' + rec.evidence }));
    if (hasText(rec.searched)) parts.push(h('div', { class: 'muted pre', text: 'Searched: ' + rec.searched }));
    if (hasText(rec.whyNoMore)) parts.push(h('div', { class: 'muted pre', text: 'Why no more findings: ' + rec.whyNoMore }));
    if (Array.isArray(rec.perRow)) rec.perRow.forEach(function (x) {
      if (hasText(x.evidence)) parts.push(h('div', { class: 'muted pre', text: 'Evidence (' + (x.label || 'row ' + x.row) + '): ' + x.evidence }));
      if (hasText(x.whyNoMore)) parts.push(h('div', { class: 'muted pre', text: 'Why no more findings (' + (x.label || 'row ' + x.row) + '): ' + x.whyNoMore }));
    });
    return h('div', { class: 'cmpv' }, parts);
  }
  function renderCompare(item, u) {
    if (!compare) { u.cmp.hidden = true; u.root.classList.remove('differs'); return false; }
    var theirs = own(compare.answers, item.id) ? compare.answers[item.id] : undefined;
    var mine = mineNormalized(item);
    var other = theirsNormalized(item, theirs);
    var diff = !(mine === null && other === null) && JSON.stringify(mine) !== JSON.stringify(other);
    u.cmp.innerHTML = '';
    u.cmp.appendChild(h('div', { class: 'cmphead', text: diff ? 'Differs from the other result:' : 'Same as the other result:' }));
    u.cmp.appendChild(formatTheirs(item, theirs));
    u.cmp.hidden = false;
    u.cmp.classList.toggle('cmp-diff', diff);
    u.root.classList.toggle('differs', diff);
    return diff;
  }

  // ---------------------------------------------------------------------------
  // Export and import
  // ---------------------------------------------------------------------------
  // Every recorded issue in the current state: checks marked Problem found (per row
  // or as a whole) and every row of an issues table. One list feeds the export's
  // findings array, the summary section, and the badge, so they cannot disagree.
  function collectIssues() {
    var out = [];
    DEF.items.forEach(function (it) {
      if (!applicable(it)) return;
      var a = state.answers[it.id] || {};
      if (it.type === 'check') {
        var rs = it.forEach ? checkRows(it) : null;
        if (rs) {
          rs.forEach(function (x) {
            if (x.rec.status !== 'finding') return;
            out.push({ item: it.id, row: x.index + 1, label: x.label, location: x.rec.location || '', description: x.rec.findings || '', severity: it.severity, sectionId: it.section, title: it.title });
          });
        } else if (a.status === 'finding') {
          out.push({ item: it.id, location: a.location || '', description: a.findings || '', severity: it.severity, sectionId: it.section, title: it.title });
        }
      } else if (it.type === 'list' && it.findings && Array.isArray(a.rows)) {
        a.rows.forEach(function (r) {
          var c = { item: it.id };
          Object.keys(r).forEach(function (k) { if (k !== '_id') c[k] = r[k]; });
          c.sectionId = it.section; c.title = it.title;
          out.push(c);
        });
      }
    });
    return out;
  }
  // The same list read from a result file (the comparison side).
  function issuesFromResult(answers) {
    var out = [];
    DEF.items.forEach(function (it) {
      var r = own(answers, it.id) ? answers[it.id] : null;
      if (!r || typeof r !== 'object') return;
      if (it.type === 'check') {
        if (Array.isArray(r.perRow)) {
          r.perRow.forEach(function (x, i) {
            if (!x || x.status !== 'finding') return;
            out.push({ item: it.id, row: x.row || (i + 1), label: x.label || '', location: x.location || '', description: x.findings || '', severity: it.severity, sectionId: it.section, title: it.title });
          });
        } else if (r.status === 'finding') {
          out.push({ item: it.id, location: r.location || '', description: r.findings || '', severity: it.severity, sectionId: it.section, title: it.title });
        }
      } else if (it.type === 'list' && it.findings && Array.isArray(r.rows)) {
        r.rows.forEach(function (x) {
          if (!x || typeof x !== 'object') return;
          var c = { item: it.id };
          Object.keys(x).forEach(function (k) { if (k !== '_id') c[k] = x[k]; });
          c.sectionId = it.section; c.title = it.title;
          out.push(c);
        });
      }
    });
    return out;
  }
  function exportIssue(x) {
    var c = {};
    Object.keys(x).forEach(function (k) { if (k !== 'sectionId' && k !== 'title') c[k] = x[k]; });
    return c;
  }

  function buildExport() {
    applCache = {}; naReason = {}; viaUnsure = {};
    var out = {
      checklist: DEF.id, version: DEF.version, title: DEF.title, phase: 'all',
      app: state.app || '', reviewer: state.reviewer || '', reviewerKind: state.reviewerKind || 'dev',
      exportedAt: now(), answers: {}, findings: []
    };
    DEF.items.forEach(function (it) {
      if (!applicable(it)) { out.answers[it.id] = { status: 'na', reason: 'rule: ' + ruleText(it, true) }; return; }
      var a = state.answers[it.id] || {};
      var rec = {};
      if (it.type === 'check') {
        var rs = it.forEach ? checkRows(it) : null;
        if (rs) {
          rec.perRow = rs.map(function (x) {
            var r = { row: x.index + 1, label: x.label, status: x.rec.status || null, location: x.rec.location || '', findings: x.rec.findings || '' };
            if (r.status === 'na' || r.status === 'unable') r.reason = x.rec.findings || '';
            if (hasText(x.rec.evidence)) r.evidence = x.rec.evidence;
            if (hasText(x.rec.whyNoMore)) r.whyNoMore = x.rec.whyNoMore;
            if (hasText(x.rec.asked)) r.asked = x.rec.asked;
            return r;
          });
        } else {
          rec.status = a.status || null; rec.location = a.location || ''; rec.findings = a.findings || '';
          if (rec.status === 'na' || rec.status === 'unable') rec.reason = a.findings || '';
          if (hasText(a.evidence)) rec.evidence = a.evidence;
          if (hasText(a.whyNoMore)) rec.whyNoMore = a.whyNoMore;
          if (hasText(a.asked)) rec.asked = a.asked;
        }
      } else if (it.type === 'list') {
        rec.rows = (a.rows || []).map(function (r) { var c = {}; Object.keys(r).forEach(function (k) { if (k !== '_id') c[k] = r[k]; }); return c; });
        if (a.none && !rec.rows.length) rec.none = true;
      } else {
        rec.value = (a.value === undefined) ? null : a.value;
      }
      if (it.detail) rec.detail = a.detail || '';
      if (DEV) { rec.notes = a.notes || ''; if (hasText(a.evidence)) rec.evidence = a.evidence; if (hasText(a.searched)) rec.searched = a.searched; if (hasText(a.whyNoMore)) rec.whyNoMore = a.whyNoMore; }
      else { rec.evidence = a.evidence || ''; rec.searched = a.searched || ''; }
      rec.complete = complete(it);
      rec.updatedAt = a.updatedAt || null;
      out.answers[it.id] = rec;
    });
    out.findings = collectIssues().map(exportIssue);
    // An unedited AI result re-exports with the answers this form never showed.
    if (state.reviewerKind === 'ai' && state.passthrough) Object.keys(state.passthrough).forEach(function (id) { if (!own(out.answers, id)) out.answers[id] = state.passthrough[id]; });
    return out;
  }

  function openExportModal(opener) {
    var json = JSON.stringify(buildExport(), null, 2);
    var ta = h('textarea', { class: 'json', readonly: true, rows: 18, 'aria-label': 'Exported JSON' });
    ta.value = json;
    var copy = h('button', { type: 'button', class: 'primary', text: 'Copy to clipboard' });
    copy.addEventListener('click', function () { copyText(ta, function () { state.lastExportedAt = now(); save(); refresh(); }); });
    ta.addEventListener('copy', function () { state.lastExportedAt = now(); save(); refresh(); });
    openModal('Export review as JSON', [
      h('p', { class: 'note', text: 'Your answers stay saved in this browser until you use Clear. "Never exported" clears once the JSON has been copied.' }),
      ta
    ], [copy], opener);
  }

  function copyText(ta, done) {
    function fallback() {
      var ok = false;
      try { ta.focus(); ta.select(); ok = document.execCommand('copy'); } catch (e) { ok = false; }
      flash(ok ? 'Copied to clipboard' : 'Copy failed. Select the text and copy it manually.');
      if (ok && done) done();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(function () { flash('Copied to clipboard'); if (done) done(); }, fallback);
    } else fallback();
  }

  function openImportModal(opener) {
    var ta = h('textarea', { class: 'json', rows: 14, placeholder: 'Paste exported JSON here', 'aria-label': 'JSON to import' });
    var preview = h('div', { class: 'preview' });
    var replace = h('button', { type: 'button', class: 'primary', text: 'Replace current answers', disabled: true });
    var merge = h('button', { type: 'button', text: 'Merge into current answers', disabled: true });
    var asCompare = h('button', { type: 'button', text: 'Load as comparison', disabled: true });
    var parsed = null;
    function check() {
      parsed = null; replace.disabled = true; merge.disabled = true; asCompare.disabled = true;
      var obj;
      if (!hasText(ta.value)) { preview.textContent = ''; return; }
      try { obj = JSON.parse(ta.value); } catch (e) { preview.textContent = 'Not valid JSON: ' + e.message; return; }
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { preview.textContent = 'Not a result file.'; return; }
      if (obj.checklist !== DEF.id) { preview.textContent = 'This JSON is for checklist "' + obj.checklist + '", not "' + DEF.id + '".'; return; }
      var major = majorOf(obj.version);
      var answers = obj.answers && typeof obj.answers === 'object' ? obj.answers : {};
      var n = Object.keys(answers).length;
      var known = Object.keys(answers).filter(function (id) { return own(itemsById, id); }).length;
      var lines = [
        'Application: ' + (obj.app || '(none)'),
        'Reviewer: ' + (obj.reviewer || '(none)') + ' [' + (obj.reviewerKind || 'unknown') + ']',
        'Exported: ' + fmtTime(obj.exportedAt),
        'Answers: ' + n + ' (' + known + ' match items in this checklist)'
      ];
      if (String(obj.version) !== String(DEF.version)) lines.push((major !== MAJOR ? 'Warning' : 'Note') + ': exported from version ' + obj.version + ', this form is ' + DEF.version + '. Items may not line up.');
      if (obj.lintProblems > 0) lines.push('Warning: the linter reported ' + obj.lintProblems + ' unresolved problem' + (obj.lintProblems === 1 ? '' : 's') + ' when this file was written. It is a snapshot of an unfinished review, not a final result.');
      else if (obj.reviewerKind === 'ai' && obj.lintProblems === undefined) lines.push('Warning: this AI result carries no linter stamp, so it was not produced by the linter and may be a snapshot.');
      preview.textContent = lines.join('\n');
      parsed = obj; replace.disabled = false; merge.disabled = false; asCompare.disabled = false;
    }
    ta.addEventListener('input', check);
    replace.addEventListener('click', function () {
      if (!parsed) return;
      var hasAnswers = Object.keys(state.answers).some(function (id) { return own(itemsById, id) && answered(itemsById[id]); });
      if (hasAnswers && !window.confirm('Replace every answer in the review "' + slotName(state.app) + '" with this file? The current answers are kept once under a backup key.')) return;
      importResult(parsed, 'replace'); closeModal();
    });
    merge.addEventListener('click', function () { if (parsed) { importResult(parsed, 'merge'); closeModal(); } });
    asCompare.addEventListener('click', function () { if (parsed) { loadCompare(parsed); closeModal(); flash('Loaded comparison from ' + (parsed.reviewer || parsed.reviewerKind || 'the other result')); } });
    openModal('Import review JSON', [
      h('p', { class: 'note', text: 'Replace or Merge loads the answers into this form. Load as comparison keeps your answers and shows the other result beside each item.' }),
      ta, preview
    ], [replace, merge, asCompare], opener, function () { return hasText(ta.value) ? 'Discard the pasted JSON?' : null; });
  }

  // Loads a result (developer or AI) into the form. Per-row answers from the AI
  // are numbered; they are matched to the current table rows by label when
  // present, otherwise by position. Merge never moves the review to another
  // application, and only fields that carry content are merged.
  function importResult(parsed, mode) {
    if (!parsed || typeof parsed !== 'object' || !parsed.answers || typeof parsed.answers !== 'object') { flash('Nothing to import'); return; }
    if (mode === 'replace') {
      backupSlot(state.app);
      var keepApp = state.app;
      state = freshState();
      state.app = hasText(parsed.app) ? parsed.app : keepApp;
      state.reviewerKind = parsed.reviewerKind === 'ai' ? 'ai' : 'dev';
      state.reviewer = parsed.reviewer || '';
      state.importedFrom = { reviewer: parsed.reviewer || '', reviewerKind: parsed.reviewerKind || '', exportedAt: parsed.exportedAt || '', lintProblems: typeof parsed.lintProblems === 'number' ? parsed.lintProblems : null, version: parsed.version || '' };
      state.lastExportedAt = parsed.exportedAt || now();
    }
    var pendingRows = {};
    var mergeOnto = function (id, a) {
      if (mode !== 'merge') { state.answers[id] = a; return; }
      var cur = state.answers[id] || {};
      Object.keys(a).forEach(function (k) {
        var v = a[k];
        var empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
        if (!empty) cur[k] = v;
      });
      state.answers[id] = cur;
    };
    // Answers to items this form does not show (skipped for developers) are kept
    // verbatim so that viewing and re-exporting an AI result loses nothing.
    if (mode !== 'merge' || !state.passthrough) state.passthrough = {};
    Object.keys(parsed.answers).forEach(function (id) {
      if (!own(itemsById, id)) { if (/^[CRF]-\d{2}$/.test(id) && parsed.answers[id] && typeof parsed.answers[id] === 'object' && !Array.isArray(parsed.answers[id])) state.passthrough[id] = parsed.answers[id]; return; }
      var r = parsed.answers[id];
      var it = itemsById[id];
      if (!r || typeof r !== 'object' || Array.isArray(r)) return;
      if (r.status === 'missing') return;
      if (r.status === 'na') {
        if (it.type === 'check') mergeOnto(id, { status: 'na', findings: r.reason && !/^rule:/.test(r.reason) ? r.reason : '' });
        return;
      }
      // An AI fact that could not be determined arrives as the developer's "Could not determine".
      if (r.status === 'unable' && it.type !== 'check') {
        var u = {};
        if (it.type === 'yesno' || it.type === 'select') u.value = UNSURE;
        else if (it.type === 'multiselect') u.value = [UNSURE];
        else if (it.type === 'text') u.value = UNSURE_LABEL + (hasText(r.reason) ? ': ' + r.reason : '');
        u.evidence = (UNSURE_LABEL + (hasText(r.reason) ? '. ' + r.reason : '')).trim();
        if (hasText(r.searched)) u.searched = r.searched;
        if (hasText(r.asked)) u.asked = r.asked;
        u.updatedAt = r.updatedAt || null;
        mergeOnto(id, u);
        return;
      }
      var a = {};
      if (own(r, 'rows')) {
        var rows = Array.isArray(r.rows) ? r.rows.filter(function (x) { return x && typeof x === 'object'; }) : [];
        var emptyButDone = rows.length === 0 && (r.complete === true || hasText(r.searched) || r.none);
        if (it.type === 'text') a.value = rows.length ? rowsToText(rows) : (emptyButDone ? 'None' : '');
        else { a.rows = rows.map(function (x) { var c = { _id: newRowId() }; Object.keys(x).forEach(function (k) { if (k !== '_id') c[k] = x[k]; }); return c; }); if (emptyButDone) a.none = true; }
      }
      if (own(r, 'value') && r.value !== null) {
        var v = r.value;
        if (it.type === 'yesno' || it.type === 'select') { if (v === 'unknown') v = UNSURE; }
        if (it.type === 'multiselect' && Array.isArray(v)) v = v.map(function (x) { return x === 'unknown' ? UNSURE : x; });
        if (it.type === 'list' && typeof v === 'string') { a.rows = NONE_TEXT.test(v.trim()) ? [] : v.split(/\r?\n/).filter(hasText).map(function (line) { var o = { _id: newRowId() }; o[it.columns[0].key] = line; return o; }); if (NONE_TEXT.test(v.trim())) a.none = true; }
        else a.value = v;
      }
      if (it.type === 'check') {
        if (Array.isArray(r.perRow)) {
          if (it.forEach && sourceRows(it) === null) Object.assign(a, collapseRows(r.perRow));
          else pendingRows[id] = r.perRow;
        } else {
          if (r.status) a.status = r.status;
          a.location = locationOf(r); a.findings = r.findings || (r.reason && !/^rule:/.test(r.reason) ? r.reason : '');
          if (r.whyNoMore) a.whyNoMore = r.whyNoMore;
          if (hasText(r.asked)) a.asked = r.asked;
        }
      }
      if (r.detail) a.detail = r.detail;
      if (r.notes) a.notes = r.notes;
      if (r.none) a.none = true;
      if (r.evidence) a.evidence = r.evidence;
      if (r.searched) a.searched = r.searched;
      if (r.whyNoMore) a.whyNoMore = r.whyNoMore;
      a.updatedAt = r.updatedAt || null;
      mergeOnto(id, a);
    });
    applCache = {}; naReason = {}; viaUnsure = {};
    Object.keys(pendingRows).forEach(function (id) {
      var it = itemsById[id];
      var rows = it.forEach ? sourceRows(it) : null;
      if (!rows) return;
      ensureRowIds(rows);
      var a = ans(id);
      if (mode !== 'merge' || !a.perRow) a.perRow = {};
      pendingRows[id].forEach(function (x, i) {
        if (!x || typeof x !== 'object') return;
        var n = Number(x.row) || (i + 1);
        var byLabel = x.label ? rows.filter(function (r) { return rowLabel(r) === x.label; })[0] : null;
        var target = byLabel || rows[n - 1];
        if (!target) return;
        a.perRow[target._id] = { status: x.status || undefined, location: locationOf(x), findings: x.findings || (x.reason && !/^rule:/.test(x.reason) ? x.reason : ''), evidence: x.evidence || '', whyNoMore: x.whyNoMore || '', asked: x.asked || '' };
      });
    });
    state.lastModifiedAt = now();
    renderAll();
    save();
    flash('Imported into "' + slotName(state.app) + '"' + (parsed.lintProblems > 0 ? '. Warning: this file was a snapshot with ' + parsed.lintProblems + ' unresolved linter problems.' : ''));
  }

  function openPasteModal(item, done, opener) {
    var ta = h('textarea', { class: 'json', rows: 10, placeholder: 'One row per line. Separate columns with tabs or " | ".\nColumn order: ' + item.columns.map(function (c) { return c.label; }).join(' | '), 'aria-label': 'Rows to paste' });
    var add = h('button', { type: 'button', class: 'primary', text: 'Add rows' });
    add.addEventListener('click', function () {
      var a = ans(item.id); if (!Array.isArray(a.rows)) a.rows = [];
      var unmatched = [];
      ta.value.split(/\r?\n/).forEach(function (line, li) {
        if (!line.trim()) return;
        var cells = line.indexOf('\t') >= 0 ? line.split('\t') : line.split(/\s*\|\s*/);
        var row = { _id: newRowId() };
        item.columns.forEach(function (c, i) {
          var v = (cells[i] || '').trim();
          if (c.type === 'select' && v) {
            var m = c.options.filter(function (o) { return code(o) === code(v); })[0];
            if (m) v = m; else unmatched.push('line ' + (li + 1) + ' "' + v + '" is not one of ' + c.options.join(', '));
          }
          row[c.key] = v;
        });
        a.rows.push(row);
      });
      closeModal(); done();
      if (unmatched.length) flash('Pasted, but check: ' + unmatched.join('; '));
    });
    openModal('Paste rows into ' + item.id, [ta], [add], opener, function () { return hasText(ta.value) ? 'Discard the pasted rows?' : null; });
  }

  function clearReview() {
    var name = slotName(state.app);
    var dirty = state.lastModifiedAt && (!state.lastExportedAt || state.lastModifiedAt > state.lastExportedAt);
    var msg = 'Clear the saved review for "' + name + '"?';
    if (dirty) msg += '\n\nThere are changes newer than the last export. Export first if you want to keep them.';
    msg += '\n\nThe previous copy is kept once under a backup key until the next clear. Any loaded comparison is removed.';
    if (!window.confirm(msg)) return;
    try {
      var k = slotKey(state.app);
      var cur = localStorage.getItem(k);
      if (cur) localStorage.setItem(k + ':prev', cur);
      localStorage.removeItem(k);
      localStorage.removeItem(k + ':compare');
    } catch (e) { /* ignore */ }
    var app = state.app;
    state = freshState();
    state.app = app;
    compare = null; onlyDiff = false;
    renderAll();
    flash('Cleared "' + name + '"');
  }

  // ---------------------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------------------
  var modalOpener = null, modalGuard = null;
  function openModal(title, body, actions, opener, guard) {
    var back = document.getElementById('modal');
    var box = back.querySelector('.modal');
    box.innerHTML = '';
    modalOpener = opener || document.activeElement;
    modalGuard = guard || null;
    var close = h('button', { type: 'button', text: 'Close' });
    close.addEventListener('click', closeModal);
    box.appendChild(h('h2', { text: title }));
    (body || []).forEach(function (b) { box.appendChild(b); });
    box.appendChild(h('div', { class: 'modalactions' }, (actions || []).concat([close])));
    back.hidden = false;
    var first = box.querySelector('textarea,input,button');
    if (first) first.focus();
  }
  function closeModal(force) {
    var back = document.getElementById('modal');
    if (back.hidden) return;
    if (!force && modalGuard) { var q = modalGuard(); if (q && !window.confirm(q)) return; }
    back.hidden = true;
    modalGuard = null;
    if (modalOpener && typeof modalOpener.focus === 'function') { try { modalOpener.focus(); } catch (e) { /* ignore */ } }
    modalOpener = null;
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------
  function init() {
    var appInput = document.getElementById('app');
    var revInput = document.getElementById('reviewer');
    appInput.addEventListener('change', function () {
      var target = appInput.value;
      if (slotName(target) === slotName(state.app)) { if (state.app !== target) { state.app = target; save(); } return; }
      var hasAnswers = Object.keys(state.answers).some(function (id) { return own(itemsById, id) && answered(itemsById[id]); });
      if (!slotExists(target) && hasAnswers && slotName(state.app) === '(unnamed)') {
        // Naming an unnamed review: carry the work and any comparison to the new name.
        try {
          var cmp = localStorage.getItem(slotKey(state.app) + ':compare');
          localStorage.removeItem(slotKey(state.app));
          localStorage.removeItem(slotKey(state.app) + ':compare');
          state.app = target;
          saveNowTo(target);
          if (cmp) localStorage.setItem(slotKey(target) + ':compare', cmp);
        } catch (e) { state.app = target; }
        renderAll();
        flash('Named this review "' + slotName(target) + '"');
        return;
      }
      save();
      var found = loadSlot(target);
      renderAll();
      flash(found ? 'Loaded "' + slotName(target) + '", last saved ' + fmtTime(state.lastModifiedAt) : 'Started a new review "' + slotName(target) + '"; the previous one is still saved under its own name');
    });
    revInput.addEventListener('input', function () { state.reviewer = revInput.value; state.lastModifiedAt = now(); clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); refresh(); });
    document.getElementById('btn-export').addEventListener('click', function (e) { openExportModal(e.currentTarget); });
    document.getElementById('btn-import').addEventListener('click', function (e) { openImportModal(e.currentTarget); });
    document.getElementById('btn-clear').addEventListener('click', clearReview);
    document.getElementById('btn-print').addEventListener('click', function () { window.print(); });
    var issuesBadge = document.getElementById('issues-badge');
    if (issuesBadge) issuesBadge.addEventListener('click', goToIssues);
    var cmpOnly = document.getElementById('cmp-only');
    if (cmpOnly) cmpOnly.addEventListener('change', function (e) { onlyDiff = e.target.checked; refresh(); });
    var cmpClear = document.getElementById('btn-cmp-clear');
    if (cmpClear) cmpClear.addEventListener('click', clearCompare);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
    var instr = document.getElementById('instructions');
    if (instr) {
      try { if (localStorage.getItem(PREFIX + 'instructions') === 'closed') instr.removeAttribute('open'); } catch (e) { /* ignore */ }
      instr.addEventListener('toggle', function () { try { localStorage.setItem(PREFIX + 'instructions', instr.open ? 'open' : 'closed'); } catch (e) { /* ignore */ } });
    }
    // Printing: grow textareas to their content so nothing is clipped.
    window.addEventListener('beforeprint', function () {
      Array.prototype.forEach.call(document.querySelectorAll('textarea'), function (t) { t.dataset.h = t.style.height; t.style.height = 'auto'; t.style.height = Math.max(t.scrollHeight, 24) + 'px'; });
    });
    window.addEventListener('afterprint', function () {
      Array.prototype.forEach.call(document.querySelectorAll('textarea'), function (t) { t.style.height = t.dataset.h || ''; });
    });

    var slots = listSlots();
    var initial = slots.length === 1 ? slots[0] : '';
    var found = loadSlot(initial);
    renderAll();
    if (found) flash('Resumed "' + slotName(initial) + '", last saved ' + fmtTime(state.lastModifiedAt));
    else if (slots.length > 1) flash(slots.length + ' saved reviews found. Pick one in the Application field.');
  }

  // Small hook for tooling and tests. Not used by the form itself.
  window.SecReview = {
    buildExport: buildExport,
    getState: function () { return state; },
    setAnswer: function (id, patch) {
      Object.assign(ans(id), patch);
      if (patch && Array.isArray(patch.rows)) ensureRowIds(patch.rows);
      var u = ui.items[id];
      if (u && u.drawRows && patch && (Array.isArray(patch.rows) || own(patch, 'none'))) u.drawRows();
      // Replacing the per-row record wholesale orphans the blocks that hold the old objects.
      if (u && u.redraw && patch && patch.perRow) u.redraw();
      touch(id);
    },
    importResult: importResult,
    loadCompare: loadCompare,
    clearCompare: clearCompare,
    collectIssues: collectIssues,
    reviewGaps: reviewGaps,
    unfinishedItems: unfinishedItems,
    goToIssues: goToIssues,
    rowsOf: function (id) { return ((state.answers[id] || {}).rows || []).slice(); },
    rerender: renderAll
  };

  document.addEventListener('DOMContentLoaded', init);
})();

</script>
</body>
</html>
