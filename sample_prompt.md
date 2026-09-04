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
code { background: var(--code); padding: 0 4px; border-radius: 3px; font-size: 12.5px; }
h1 { font-size: 20px; margin: 28px 0 6px; }
h2 { font-size: 17px; margin: 24px 0 6px; }
h3 { font-size: 15px; margin: 0; font-weight: 600; }
p { margin: 6px 0; }
.intro { color: var(--muted); }
.rule { color: var(--accent); font-size: 13px; margin: 4px 0; }
.refs { color: var(--muted); font-size: 12.5px; }

/* Top bar */
.top {
  position: sticky; top: 0; z-index: 5;
  background: var(--panel); border-bottom: 1px solid var(--line);
  padding: 10px 20px; display: grid; gap: 8px;
  grid-template-columns: 1fr auto; align-items: center;
}
.top .title { font-weight: 600; font-size: 16px; }
.top .ver { color: var(--muted); font-weight: 400; font-size: 13px; margin-left: 6px; }
.top .fields { display: flex; gap: 14px; flex-wrap: wrap; grid-column: 1 / -1; }
.top .fields label { display: flex; align-items: center; gap: 6px; }
.top .fields input { padding: 5px 8px; border: 1px solid var(--line); border-radius: 4px; min-width: 220px; }
.top .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: flex-end; }
.top .progressrow { display: flex; align-items: center; gap: 10px; grid-column: 1 / -1; flex-wrap: wrap; }
.top progress { width: 240px; height: 10px; }
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
}
.item.na { opacity: .6; background: #fafafa; }
.ihead { display: flex; align-items: baseline; gap: 10px; }
.iid { font-family: ui-monospace, Consolas, monospace; color: var(--muted); font-size: 12.5px; min-width: 44px; }
.chip { margin-left: auto; font-size: 12px; border-radius: 10px; padding: 1px 8px; border: 1px solid var(--line); white-space: nowrap; }
.chip-ok { color: var(--ok); border-color: #b7e0c0; background: #eefaf0; }
.chip-warn { color: var(--warn); border-color: #f5d38f; background: #fff8e6; }
.chip-open { color: var(--muted); }
.chip-na { color: var(--na); }
.tip { color: var(--muted); margin: 2px 0 8px; font-size: 13.5px; }
.how { margin: 6px 0; }
.how > summary { cursor: pointer; color: var(--accent); font-size: 13px; }
.how p { margin: 6px 0 0; }
.signals code { margin-right: 2px; }
.control { margin: 8px 0; }
.control .opt { display: block; padding: 2px 0; }
.control textarea, .fields textarea { width: 100%; font: inherit; padding: 6px 8px; border: 1px solid var(--line); border-radius: 4px; resize: vertical; }
.fields { display: grid; gap: 8px; margin-top: 8px; }
.fld > span { display: block; font-size: 12.5px; color: var(--muted); margin-bottom: 2px; }
.req { font-size: 12.5px; color: var(--muted); margin-top: 3px; }
.req-missing { color: var(--bad); }
.meta { color: var(--muted); font-size: 11.5px; margin-top: 6px; }
.remind { color: var(--muted); font-size: 12px; margin: 8px 0 0; }
.remind a { color: var(--accent); }

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

/* Modal */
[hidden] { display: none !important; }
#modal { position: fixed; inset: 0; background: rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center; z-index: 20; }
.modal { background: var(--panel); border-radius: 8px; padding: 18px 20px; width: min(900px, 94vw); max-height: 90vh; overflow: auto; box-shadow: 0 10px 40px rgba(0,0,0,.25); }
.modal h2 { margin: 0 0 10px; }
.modal textarea.json { width: 100%; font: 12.5px ui-monospace, Consolas, monospace; padding: 8px; border: 1px solid var(--line); border-radius: 4px; }
.modal .note { color: var(--muted); font-size: 13px; }
.modal .preview { white-space: pre-wrap; font-size: 13px; margin: 8px 0; color: var(--ink); }
.modalactions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }

/* Print */
@media print {
  .top .actions, .top .fields input::placeholder, #modal, .how > summary, .tableactions, .rowact, .instructions { display: none !important; }
  .top { position: static; border: 0; }
  .how { display: block; }
  .how p { display: block; }
  .item { break-inside: avoid; border-color: #bbb; }
  textarea { border: 1px solid #bbb; }
  body { background: #fff; }
}

</style>
</head>
<body>
<header class="top">
  <div class="title">Web Application Security Review <span class="ver">checklist web-idor-review v0.1.0</span></div>
  <div class="actions">
    <button type="button" id="btn-import">Import JSON</button>
    <button type="button" id="btn-export" class="primary">Export JSON</button>
    <button type="button" id="btn-clear">Clear this review</button>
    <button type="button" id="btn-print">Print</button>
  </div>
  <div class="fields">
    <label>Application <input id="app" list="slots" placeholder="artifactId or app name" autocomplete="off"></label>
    <datalist id="slots"></datalist>
    <label>Reviewer <input id="reviewer" placeholder="your name"></label>
  </div>
  <div class="progressrow">
    <progress id="progress" max="100" value="0"></progress>
    <span id="progresstext"></span>
    <span id="dirty" class="badge" hidden></span>
    <span id="status"></span>
  </div>
</header>
<details class="instructions" open>
  <summary>Instructions</summary>
  <div class="body">
<p><strong>Why.</strong> Another application at the customer had a download URL with a numeric id in it. Changing the id returned someone else's file. The application checked that the caller was logged in, but never checked that the caller was allowed to see that particular file. Scanners and code review both missed it. Every application is being checked for the same shape.</p>

<p><strong>How to answer.</strong> Answer from the code, not from memory. Each question has a tip on where to look. Some questions only appear depending on earlier answers. Anything that looks wrong goes in the Issues found table at the bottom, whether or not a question asked about it.</p>

<p><strong>Saving and export.</strong> Answers save in this browser as you type, under the application name above. When you are done, click Export, copy the JSON, and send it where you were asked to.</p>

  </div>
</details>
<main id="form"></main>
<div id="modal" hidden><div class="modal"></div></div>
<script type="application/json" id="def">{"id":"web-idor-review","version":"0.1.0","title":"Web Application Security Review","negativeValues":["no","none","none-found","unknown","not-established","not-set-default","no-weblogic-xml","none-api-only"],"phases":[{"id":"profile","title":"Phase 1: Application profile","intro":""}],"sections":[{"id":"A","phase":"profile","title":"Identity and stack"},{"id":"B","phase":"profile","title":"Authentication and session"},{"id":"C","phase":"profile","title":"Portal to portlet token handoff","when":{"q":"C-03","in":["portal","portlet"]}},{"id":"D","phase":"profile","title":"Authorization and ownership model"},{"id":"E","phase":"profile","title":"HTTP entry points and identifiers"},{"id":"F","phase":"profile","title":"Data access and outbound services"},{"id":"G","phase":"profile","title":"Files, documents, and uploads"},{"id":"H","phase":"profile","title":"Responses, binding, headers, and static content"},{"id":"J","phase":"profile","title":"JSF specifics","when":{"q":"C-04","includes":"jsf"}},{"id":"K","phase":"profile","title":"Environment"},{"id":"Z","phase":"profile","title":"Issues found","intro":"Anything that looks like a problem, whether or not a question asked about it. One row per issue."}],"items":[{"id":"C-01","section":"A","type":"text","title":"Which module builds the deployable WAR, and what is its context root?","tip":"Root pom or the module with war packaging. Context root is in weblogic.xml."},{"id":"C-03","section":"A","type":"select","title":"Is this a portal, a portlet, or a standalone application?","tip":"A portal hosts other apps in iframes and creates the token they receive. A portlet runs inside a portal iframe and receives that token. A standalone app logs users in itself.","detail":"Naming convention observed (artifactId prefix, package name)","options":[{"value":"portal","label":"Portal: hosts portlets and mints their token"},{"value":"portlet","label":"Portlet: loaded in a portal iframe, receives a token"},{"value":"standalone","label":"Standalone: own SSO, no iframe hosting, no parent token"}]},{"id":"C-04","section":"A","type":"multiselect","title":"Which frameworks handle requests on the backend?","tip":"Select everything that handles even one page. The pom and web.xml settle it.","detail":"Versions and anything selected as Other","options":[{"value":"spring-mvc","label":"Spring MVC (@Controller, DispatcherServlet)"},{"value":"spring-boot","label":"Spring Boot"},{"value":"spring-security","label":"Spring Security"},{"value":"jaxrs","label":"JAX-RS (@Path; Jersey, RESTEasy, or CXF)"},{"value":"jsf","label":"JSF (FacesServlet, .xhtml or .jspx pages)"},{"value":"jsp","label":"JSP pages"},{"value":"servlets","label":"Raw servlets (web.xml \u003cservlet> or @WebServlet)"},{"value":"websocket","label":"WebSocket endpoints"},{"value":"struts","label":"Struts"},{"value":"other","label":"Other (describe in Detail)"}]},{"id":"C-05","section":"A","type":"select","title":"What is the frontend?","tip":"package.json under src/main/angular shows the Angular version.","detail":"Version from package.json and where the frontend source lives","options":[{"value":"angular","label":"Angular 2 or later"},{"value":"angularjs","label":"AngularJS 1.x"},{"value":"mixed","label":"Mixed (describe in Detail)"},{"value":"server-rendered","label":"Server-rendered pages only (JSF or JSP)"},{"value":"none-api-only","label":"None: API only"}]},{"id":"C-06","section":"A","type":"select","title":"Is the frontend served from the same WAR as the backend?","tip":"CORS configuration on the backend (@CrossOrigin, CorsFilter) means a separate origin.","detail":"CORS allowed origins and credentials setting, if any","options":[{"value":"same-war","label":"Served from the same WAR (same origin)"},{"value":"separate-origin-cors","label":"Separate origin with CORS"},{"value":"separate-proxied","label":"Separate deployment behind the same origin (proxy)"}]},{"id":"C-10","section":"B","type":"multiselect","title":"How do users log in?","tip":"Usually one of the enterprise filters from the shared web-security library, declared in web.xml. Select everything that applies.","detail":"Logon methods supported (CAC, FAM, DFAS, SNT) and anything custom","options":[{"value":"beneficiary-sso","label":"Enterprise beneficiary SSO filter (AuthFilter / BeneficiaryAgentSSO)"},{"value":"operator-filter","label":"Enterprise operator filters (OperatorAuthenticationFilter / OperatorAuthorizationFilter)"},{"value":"portal-jwt","label":"Token received from a parent portal"},{"value":"spring-security","label":"Spring Security"},{"value":"container-managed","label":"Container-managed (\u003clogin-config> in web.xml)"},{"value":"custom","label":"Custom or home-grown"},{"value":"none","label":"None found"}]},{"id":"C-12","section":"B","type":"text","title":"Which URL patterns skip the login filter?","tip":"Filter mappings and exclusion patterns in web.xml or the filter's init-params, for example /ws/public/*, appmonitor.status, static folders. One per line."},{"id":"C-13","section":"B","type":"text","title":"What can be reached without logging in, and does any of it return data?","tip":"For each excluded pattern, list what is behind it. Health checks and static assets are expected; anything that returns records is an issue."},{"id":"C-14","section":"B","type":"select","title":"After login, where does the code keep who the user is?","tip":"Follow the login filter to where it stores the user, then find the class the rest of the code reads to get the person, family, or operator ids.","detail":"Class holding the identity and the identifiers it carries (person id, sponsor id, family id, operator id, access levels, site)","options":[{"value":"http-session","label":"HttpSession attribute"},{"value":"custom-principal","label":"Custom Principal via request.getUserPrincipal()"},{"value":"thread-local","label":"ThreadLocal or request-scoped holder"},{"value":"spring-security-context","label":"Spring SecurityContextHolder"},{"value":"jwt-each-request","label":"Re-derived from the token on every request"},{"value":"other","label":"Other (describe in Detail)"}]},{"id":"C-15","section":"B","type":"select","title":"What does each request carry after login: a session cookie or a token?","tip":"A token means an Angular interceptor adds an Authorization header and the server parses it on every request.","options":[{"value":"session-cookie","label":"Session cookie"},{"value":"bearer-jwt","label":"Bearer token on every request"},{"value":"both","label":"Both"},{"value":"none","label":"None found"}]},{"id":"C-17","section":"B","type":"yesno","title":"Does the Angular code read the login cookie directly, for example iPlanetDirectoryPro?","tip":"Search the frontend for document.cookie or a cookie service. If JavaScript can read it, the cookie is not HttpOnly.","detail":"Cookie names and the files that read them"},{"id":"C-20","section":"C","type":"select","title":"How does the token get from the portal into the portlet?","tip":"How the iframe src is built on the portal side, and where the portlet first reads the token. A query parameter ends up in access logs and browser history.","detail":"Portal side (file:line) and portlet side (file:line)","options":[{"value":"query-param","label":"iframe src query parameter"},{"value":"url-fragment","label":"URL fragment"},{"value":"postmessage","label":"window.postMessage"},{"value":"shared-domain-cookie","label":"Cookie on a shared domain"},{"value":"proxy-header","label":"Header injected by a proxy"},{"value":"other","label":"Other (describe in Detail)"}]},{"id":"C-21","section":"C","type":"select","title":"How is the token protected?","tip":"jjwt, auth0, or nimbus with a signWith call means signed. Cipher calls outside a JWT library mean custom encryption.","detail":"Library, class, and algorithm constant","options":[{"value":"jws-hmac","label":"JWS signed with HMAC (shared secret)"},{"value":"jws-asymmetric","label":"JWS signed with an asymmetric key"},{"value":"jwe","label":"JWE encrypted"},{"value":"jws-and-jwe","label":"Signed and encrypted"},{"value":"custom-crypto","label":"Custom encrypt/decrypt outside a JOSE library"}]},{"id":"C-22","section":"C","type":"text","title":"What is in the token?","tip":"Family id, sponsor id, person id, access levels, app id, site, expiry."},{"id":"C-23","section":"C","type":"multiselect","title":"What does the portlet check when it receives the token?","tip":"Select only what the code demonstrably checks. A library call that verifies the signature does not check issuer, audience, or expiry unless configured to.","when":{"q":"C-03","eq":"portlet"},"detail":"Class and lines performing each check","options":[{"value":"signature","label":"Signature verified"},{"value":"exp","label":"Expiry (exp) enforced"},{"value":"nbf","label":"Not-before (nbf) enforced"},{"value":"iss","label":"Issuer (iss) checked"},{"value":"aud-or-app-id","label":"Audience or application id checked"},{"value":"alg-pinned","label":"Algorithm pinned (rejects none and algorithm switching)"},{"value":"jti-replay","label":"Replay protection (jti or one-time use)"},{"value":"none-found","label":"None found"}]},{"id":"C-24","section":"C","type":"select","title":"Where does the signing secret live?","tip":"Follow the property key from the code that loads the key.","detail":"Property key and file","options":[{"value":"properties-in-war","label":"Properties file inside the WAR"},{"value":"credential-store-jndi","label":"WebLogic credential store or JNDI"},{"value":"env-var","label":"Environment variable"},{"value":"hardcoded","label":"Hardcoded in source"},{"value":"other","label":"Other (describe in Detail)"}]},{"id":"C-25","section":"C","type":"select","title":"Is the secret shared across all portlets or specific to this one?","tip":"A shared library default or the same property name in several apps means shared.","detail":"How this was determined","options":[{"value":"fleet-shared","label":"One key shared across the fleet"},{"value":"per-portlet","label":"Per portlet"}]},{"id":"C-26","section":"C","type":"select","title":"After the token is accepted, does the portlet create a session or require the token on every request?","tip":"Look for getSession(true) after the token check.","when":{"q":"C-03","eq":"portlet"},"detail":"What is stored and how it is bound to the token identity","options":[{"value":"creates-http-session","label":"Creates an HttpSession holding identity"},{"value":"stateless","label":"Stateless: token on every request"},{"value":"both","label":"Both"}]},{"id":"C-27","section":"C","type":"text","title":"Which filter rejects requests with no valid token or session, and what happens if the portlet URL is opened directly in a browser tab?","tip":"Which filter or guard rejects a request that has no valid token or session? Record its url-patterns and its exclusions. If the portlet can be opened directly in a browser tab without the portal, note what happens.","when":{"q":"C-03","eq":"portlet"}},{"id":"C-28","section":"C","type":"select","title":"Is framing restricted with X-Frame-Options or a CSP frame-ancestors header?","tip":"Usually set in a filter or by the shared web-security library.","detail":"Values and where they are set","options":[{"value":"x-frame-options","label":"X-Frame-Options set"},{"value":"csp-frame-ancestors","label":"CSP frame-ancestors set"},{"value":"both","label":"Both"},{"value":"none-found","label":"None found"}]},{"id":"C-29","section":"C","type":"text","title":"Where does the portal create the token, and what does it put in it?","tip":"Class and method, the fields copied from the logged-in user, and the expiry.","when":{"q":"C-03","eq":"portal"}},{"id":"C-30","section":"D","type":"select","title":"Who is allowed to see a given record in this application?","tip":"Beneficiary apps: the user's own family. Operator apps: by access level, by selected site, or both. Write the rule as one sentence in Detail.","detail":"In one sentence: what does 'allowed to see this record' mean in this application?","options":[{"value":"beneficiary-family","label":"Beneficiary: own family only"},{"value":"operator-access-level","label":"Operator: by access level"},{"value":"operator-site","label":"Operator: by selected site"},{"value":"mixed","label":"Mixed (describe in Detail)"},{"value":"none-found","label":"No ownership rule found in code"}]},{"id":"C-31","section":"D","type":"yesno","title":"Is there a check that the user may use this application at all?","tip":"For operator apps this is the App ID check in OperatorAuthorizationFilter. It is not the same as checking a specific record.","detail":"Class, application id, and configuration location"},{"id":"C-32","section":"D","type":"select","title":"When a request names a specific record, where is it checked that this user may see that record?","tip":"This is the question the whole review is about. If you cannot point at a place where it happens, choose none found.","detail":"Helper name and location, or examples of the ad hoc pattern","options":[{"value":"canonical-helper","label":"Single canonical helper, for example isInMyFamily(personId)"},{"value":"per-endpoint","label":"Ad hoc per endpoint"},{"value":"annotation","label":"Annotation or aspect based"},{"value":"none-found","label":"None found"}]},{"id":"C-33","section":"D","type":"select","title":"Where does the list of records the user may see come from?","tip":"Loaded at login into the session, looked up per request, carried in the token, or nowhere.","detail":"Class and method that establishes it","options":[{"value":"roster-in-session","label":"Roster fetched at login and stored in the session"},{"value":"per-request-lookup","label":"Looked up on every request"},{"value":"jwt-claims","label":"Carried in token claims"},{"value":"not-established","label":"Not established anywhere"}]},{"id":"C-34","section":"D","type":"text","title":"What do access levels mean here, and how is the selected site enforced on later requests?","tip":"List the levels or roles and what each allows. Where the selected site is stored and how later requests are limited to it.","when":{"q":"C-30","in":["operator-access-level","operator-site","mixed"]}},{"id":"C-40","section":"E","type":"multiselect","title":"How do requests reach code?","tip":"JSF action methods count. Actuator is out of scope but note it if present.","detail":"Anything selected as Other","options":[{"value":"spring-mvc","label":"Spring MVC controllers"},{"value":"jaxrs","label":"JAX-RS resources"},{"value":"jsf-actions","label":"JSF managed-bean actions"},{"value":"servlets","label":"Raw servlets"},{"value":"websocket","label":"WebSocket endpoints"},{"value":"actuator","label":"Spring Boot actuator (note only)"},{"value":"other","label":"Other (describe in Detail)"}]},{"id":"C-41","section":"E","type":"list","title":"Which endpoints take a record identifier from the request, and where is scope checked for each?","tip":"Every endpoint where the caller supplies an id for a person, family, document, or other record in the path, query string, or body. One row each.","columns":[{"key":"path","label":"Path"},{"key":"idParams","label":"What the id identifies"},{"key":"scopeCheck","label":"Scope check","type":"select","options":["checked","none","could not determine"]},{"key":"where","label":"Where it is checked (class or method)"}]},{"id":"C-42","section":"E","type":"multiselect","title":"What kinds of identifiers appear in requests?","tip":"Sequential numeric ids are the easiest to guess.","detail":"Format notes: sequential numeric, guessable, base64 of an id, and so on","options":[{"value":"person-id","label":"Person id"},{"value":"sponsor-id","label":"Sponsor id"},{"value":"family-id","label":"Family id"},{"value":"document-id","label":"Document or file id"},{"value":"db-primary-key","label":"Database primary key"},{"value":"uuid","label":"UUID or GUID"},{"value":"opaque-token","label":"Opaque or encoded token"},{"value":"composite","label":"Composite key"},{"value":"other","label":"Other (describe in Detail)"}]},{"id":"C-50","section":"F","type":"multiselect","title":"How does the app read and write data?","tip":"Select everything in use, not just the main path.","detail":"Anything selected as Other","options":[{"value":"cuf","label":"CUF (Common Update Framework) client"},{"value":"rest-client","label":"Other REST service clients"},{"value":"soap-client","label":"SOAP or JAX-WS clients"},{"value":"jpa-hibernate","label":"JPA or Hibernate"},{"value":"jdbctemplate","label":"JdbcTemplate or raw JDBC"},{"value":"stored-procedures","label":"Stored procedures"},{"value":"mybatis","label":"MyBatis"},{"value":"file-system","label":"File system"},{"value":"ldap","label":"LDAP"},{"value":"other","label":"Other (describe in Detail)"}]},{"id":"C-51","section":"F","type":"text","title":"Which backend services does the app call, and what identifier does it send them?","tip":"Services return whatever they are asked for, so the check has to happen in this app before the call. One service per line."},{"id":"C-52","section":"F","type":"text","title":"What identifies a record in a CUF request, and does the request carry anything about the caller's scope?","tip":"Person id, sponsor id, family id, or something else.","when":{"q":"C-50","includes":"cuf"}},{"id":"C-53","section":"F","type":"text","title":"For direct queries and stored procedures, is the WHERE clause limited to the caller's family or site, or only to the record id?","tip":"A query that finds by id alone returns anyone's record if the id is changed.","when":{"q":"C-50","includesAny":["jpa-hibernate","jdbctemplate","stored-procedures","mybatis"]}},{"id":"C-60","section":"G","type":"yesno","title":"Does the app return files, PDFs, images, or documents by an identifier?","tip":"Downloads, reports, forms, letters, attachments. This is the exact pattern from the incident."},{"id":"C-61","section":"G","type":"list","title":"For each file-serving endpoint, where is it checked that the caller may have that file?","tip":"One row per endpoint.","when":{"q":"C-60","eq":"yes"},"columns":[{"key":"url","label":"URL"},{"key":"idParam","label":"Identifier parameter"},{"key":"scopeCheck","label":"Scope check","type":"select","options":["checked","none","could not determine"]},{"key":"where","label":"Where it is checked"}]},{"id":"C-62","section":"G","type":"yesno","title":"Does the app accept file uploads?","tip":"MultipartFile, @FormDataParam, or a multipart-config in web.xml."},{"id":"C-63","section":"G","type":"text","title":"Which record does each upload attach to, and where does that record's id come from?","tip":"An upload attached to a record id taken from the request is the write-side twin of file serving.","when":{"q":"C-62","eq":"yes"}},{"id":"C-70","section":"H","type":"select","title":"Do endpoints return whole entities or CUF objects, or DTOs with only the needed fields?","tip":"Whole objects expose every field they carry, including ones the UI never shows.","detail":"Examples, and any @JsonIgnore or @JsonView usage","options":[{"value":"entities-wholesale","label":"Entities or CUF objects serialized wholesale"},{"value":"dto-mapped","label":"DTOs mapped from domain objects"},{"value":"mixed","label":"Mixed (describe in Detail)"}]},{"id":"C-71","section":"H","type":"multiselect","title":"How are request bodies turned into objects on updates?","tip":"Binding straight onto a domain or CUF object lets the client set any field the object has.","detail":"Examples with file:line","options":[{"value":"requestbody-domain","label":"@RequestBody onto a domain, entity, or CUF object"},{"value":"requestbody-dto","label":"@RequestBody onto a DTO or command object"},{"value":"modelattribute","label":"@ModelAttribute form binding"},{"value":"beanparam","label":"JAX-RS @BeanParam or @FormParam"},{"value":"jsf-properties","label":"JSF managed-bean properties bound from forms"},{"value":"getparameter","label":"Manual request.getParameter"},{"value":"none-found","label":"None found (no writes)"}]},{"id":"C-72","section":"H","type":"multiselect","title":"Is there anything that limits which fields a request can set?","tip":"@InitBinder allowed fields, read-only Jackson properties, or DTOs that only carry the intended fields.","detail":"Where applied, global or per controller","options":[{"value":"initbinder-allowed","label":"@InitBinder setAllowedFields"},{"value":"initbinder-disallowed","label":"@InitBinder setDisallowedFields"},{"value":"jsonignore-setters","label":"@JsonIgnoreProperties or @JsonProperty(access = READ_ONLY)"},{"value":"dto-only","label":"DTOs carrying only the intended fields"},{"value":"none-found","label":"None found"}]},{"id":"C-73","section":"H","type":"select","title":"Are authenticated responses sent with Cache-Control: no-store?","tip":"Usually a filter or the shared web-security library.","detail":"Where set and the header value","options":[{"value":"global-filter","label":"Global filter or header writer sets no-store"},{"value":"per-endpoint","label":"Set per endpoint only"},{"value":"none-found","label":"None found"}]},{"id":"C-74","section":"H","type":"select","title":"Is directory listing disabled in weblogic.xml?","tip":"index-directory-enabled inside container-descriptor.","options":[{"value":"disabled-explicit","label":"Explicitly disabled"},{"value":"enabled-explicit","label":"Explicitly enabled"},{"value":"not-set-default","label":"Not set (container default)"},{"value":"no-weblogic-xml","label":"No weblogic.xml present"}]},{"id":"C-75","section":"H","type":"text","title":"Which folders are served as static content, and is anything besides frontend assets in them?","tip":"Resource handlers, the default servlet, src/main/webapp. Config files, source maps, or documents under a static folder are reachable by URL."},{"id":"C-90","section":"J","type":"text","title":"Which JSF pages hold a record id in a backing bean, and where does that id come from?","tip":"A view parameter or f:param comes from the request and can be changed. A session attribute cannot."},{"id":"C-91","section":"J","type":"select","title":"Is JSF view state saved on the server, or on the client, and if on the client is it encrypted?","tip":"javax.faces.STATE_SAVING_METHOD in web.xml.","options":[{"value":"server-side","label":"Server-side state saving"},{"value":"client-encrypted","label":"Client-side, encrypted"},{"value":"client-unencrypted","label":"Client-side, not encrypted"}]},{"id":"C-96","section":"K","type":"yesno","title":"Is CUF the main data path for this app?","tip":"The Common Update Framework service most apps use to read and write the main data set."},{"id":"C-97","section":"K","type":"yesno","title":"Are backend services called without any authentication?","tip":"If so, this app is the only place a record-level check can happen."},{"id":"C-98","section":"K","type":"yesno","title":"Is this app deployed to WebLogic?","tip":"weblogic.xml in WEB-INF.","detail":"WebLogic version from the descriptor namespace"},{"id":"F-01","section":"Z","type":"list","title":"Issues found","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related question (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]}],"mode":"dev"}</script>
<script>
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Definition and lookups
  // ---------------------------------------------------------------------------
  var DEF = JSON.parse(document.getElementById('def').textContent);
  var MAJOR = String(DEF.version).split('.')[0];
  var PREFIX = 'secreview:' + DEF.id + ':' + MAJOR + ':';
  var NEG = DEF.negativeValues || [];
  // Developer mode: questionnaire wording, "Not sure" allowed everywhere, no
  // evidence or search records required. "Not sure" on a branching question
  // shows the dependent items rather than hiding them.
  var DEV = DEF.mode === 'dev';
  var UNSURE = 'unsure';
  var UNSURE_LABEL = 'Could not determine';
  function isUnsure(v) { return v === UNSURE || (Array.isArray(v) && v.indexOf(UNSURE) >= 0); }
  var itemsById = {}, sectionsById = {}, phasesById = {};
  DEF.items.forEach(function (it) { itemsById[it.id] = it; });
  DEF.sections.forEach(function (s) { sectionsById[s.id] = s; });
  (DEF.phases || []).forEach(function (p) { phasesById[p.id] = p; });

  var state = freshState();
  var showHidden = false;
  var applCache = {};
  var ui = { items: {}, sections: {} };

  function freshState() {
    return { app: '', reviewer: '', answers: {}, lastModifiedAt: null, lastExportedAt: null };
  }
  function ans(id) { return state.answers[id] || (state.answers[id] = {}); }
  function now() { return new Date().toISOString(); }
  function fmtTime(iso) { return iso ? new Date(iso).toLocaleString() : ''; }

  // ---------------------------------------------------------------------------
  // Storage: one slot per application name
  // ---------------------------------------------------------------------------
  function slotName(app) { var s = (app || '').trim(); return s ? s.toLowerCase() : '(unnamed)'; }
  function slotKey(app) { return PREFIX + slotName(app); }
  function listSlots() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k.indexOf(PREFIX) === 0 && !/:prev$/.test(k)) out.push(k.slice(PREFIX.length));
      }
    } catch (e) { /* storage unavailable */ }
    return out.sort();
  }
  function slotExists(app) { try { return localStorage.getItem(slotKey(app)) !== null; } catch (e) { return false; } }

  var saveTimer = null;
  function touch(id) {
    if (id) ans(id).updatedAt = now();
    state.lastModifiedAt = now();
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
  function loadSlot(app) {
    var raw = null;
    try { raw = localStorage.getItem(slotKey(app)); } catch (e) { /* ignore */ }
    if (raw) {
      try {
        state = JSON.parse(raw);
        state.app = app;
        state.answers = state.answers || {};
        return true;
      } catch (e) { /* fall through */ }
    }
    state = freshState();
    state.app = app;
    return false;
  }
  function saveNowTo(app) {
    try { localStorage.setItem(slotKey(app), JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------------------
  // Conditions
  // ---------------------------------------------------------------------------
  function value(id) { var a = state.answers[id]; return a ? a.value : undefined; }

  function evalCond(c) {
    if (!c) return true;
    if (c.all) return c.all.every(evalCond);
    if (c.any) return c.any.some(evalCond);
    if (c.not) return !evalCond(c.not);
    var item = itemsById[c.q];
    if (!item || !applicable(item)) return false;
    var v = value(c.q);
    var a = state.answers[c.q] || {};
    if (DEV && isUnsure(v)) return true;
    if (Object.prototype.hasOwnProperty.call(c, 'eq')) return v === c.eq;
    if (c.in) return c.in.indexOf(v) >= 0;
    if (c.includes) return Array.isArray(v) && v.indexOf(c.includes) >= 0;
    if (c.includesAny) return Array.isArray(v) && c.includesAny.some(function (x) { return v.indexOf(x) >= 0; });
    if (c.notEmpty) return item.type === 'list' ? (a.rows || []).length > 0 : !!(v && String(v).trim());
    return false;
  }

  function applicable(item) {
    if (!item) return false;
    if (Object.prototype.hasOwnProperty.call(applCache, item.id)) return applCache[item.id];
    applCache[item.id] = false; // guard against cycles
    var sec = sectionsById[item.section];
    var r = evalCond(sec && sec.when) && evalCond(item.when);
    applCache[item.id] = r;
    return r;
  }
  function sectionApplicable(sec) { return evalCond(sec.when); }

  function optionLabel(item, v) {
    var o = (item.options || []).filter(function (x) { return x.value === v; })[0];
    return o ? o.label : v;
  }
  // codes=true renders option codes (for export, matching the agent's Markdown);
  // otherwise option labels (for the screen).
  function condText(c, codes) {
    if (!c) return '';
    var rec = function (x) { return condText(x, codes); };
    if (c.all) return c.all.map(rec).join(' and ');
    if (c.any) return c.any.map(rec).join(' or ');
    if (c.not) return 'not (' + rec(c.not) + ')';
    var item = itemsById[c.q];
    var name = c.q + (item ? ' (' + item.title + ')' : '');
    var show = function (v) { return (codes || !item) ? v : optionLabel(item, v); };
    if (Object.prototype.hasOwnProperty.call(c, 'eq')) return name + (codes ? ' = ' : ' is ') + show(c.eq);
    if (c.in) return name + ' is one of ' + c.in.map(show).join(', ');
    if (c.includes) return name + ' includes ' + show(c.includes);
    if (c.includesAny) return name + ' includes any of ' + c.includesAny.map(show).join(', ');
    if (c.notEmpty) return name + ' has at least one row';
    return JSON.stringify(c);
  }
  function ruleText(item, codes) {
    var parts = [];
    var sec = sectionsById[item.section];
    if (sec && sec.when) parts.push(condText(sec.when, codes));
    if (item.when) parts.push(condText(item.when, codes));
    return parts.join('; and ');
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
  function hasText(s) { return !!(s && String(s).trim()); }
  function needsSearched(item) {
    var a = state.answers[item.id] || {};
    if (item.type === 'list') return (a.rows || []).length === 0;
    return isNegative(item, a);
  }
  function needsEvidence(item) { return item.default !== undefined; }
  function answered(item) {
    var a = state.answers[item.id] || {};
    if (item.type === 'list') return (a.rows || []).length > 0;
    if (item.type === 'multiselect') return Array.isArray(a.value) && a.value.length > 0;
    return a.value !== undefined && a.value !== null && a.value !== '' && hasText(String(a.value));
  }
  function complete(item) {
    var a = state.answers[item.id] || {};
    if (item.optional) return true;
    if (DEV) return answered(item);
    if (item.type === 'list') return (a.rows || []).length > 0 || hasText(a.searched);
    if (!answered(item)) return false;
    if (needsSearched(item) && !hasText(a.searched)) return false;
    if (needsEvidence(item) && !hasText(a.evidence)) return false;
    return true;
  }
  function requirementText(item) {
    var a = state.answers[item.id] || {};
    if (DEV) return '';
    if (item.type === 'list') {
      if ((a.rows || []).length === 0) return item.emptyRequires || 'An empty table must be justified in Searched: list the patterns and directories searched.';
      return '';
    }
    if (isNegative(item, a)) {
      var v = Array.isArray(a.value) ? a.value.filter(function (x) { return NEG.indexOf(x) >= 0; }).join(', ') : a.value;
      return 'Answering "' + (item.type === 'yesno' ? v : optionLabel(item, v)) + '" requires Searched to list every signal and directory searched.';
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
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }
  function setStatus(msg) { var s = document.getElementById('status'); if (s) s.textContent = msg; }
  function flash(msg) { setStatus(msg); }

  // ---------------------------------------------------------------------------
  // Item rendering
  // ---------------------------------------------------------------------------
  function renderControl(item) {
    var a = ans(item.id);
    var wrap = h('div', { class: 'control' });
    if (item.type === 'yesno' || item.type === 'select') {
      var opts = item.type === 'yesno'
        ? [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]
        : item.options.slice();
      if (DEV) opts.push({ value: UNSURE, label: UNSURE_LABEL });
      opts.forEach(function (o) {
        var input = h('input', { type: 'radio', name: item.id, value: o.value });
        if (a.value === o.value) input.checked = true;
        input.addEventListener('change', function () { ans(item.id).value = o.value; touch(item.id); });
        wrap.appendChild(h('label', { class: 'opt' }, [input, ' ', o.label]));
      });
    } else if (item.type === 'multiselect') {
      if (!Array.isArray(a.value)) a.value = [];
      var mopts = item.options.slice();
      if (DEV) mopts.push({ value: UNSURE, label: UNSURE_LABEL });
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
        wrap.appendChild(h('label', { class: 'opt' }, [input, ' ', o.label]));
      });
    } else if (item.type === 'text') {
      var ta = h('textarea', { rows: 3, placeholder: 'Answer' });
      ta.value = a.value || '';
      ta.addEventListener('input', function () { ans(item.id).value = ta.value; touch(item.id); });
      wrap.appendChild(ta);
    } else if (item.type === 'list') {
      wrap.appendChild(renderTable(item));
    }
    return wrap;
  }

  function renderTable(item) {
    var a = ans(item.id);
    if (!Array.isArray(a.rows)) a.rows = [];
    var box = h('div', { class: 'tablebox' });
    var table = h('table', { class: 'rows' });
    var thead = h('thead', null, [h('tr', null, item.columns.map(function (c) { return h('th', { text: c.label }); }).concat([h('th', { text: '' })]))]);
    var tbody = h('tbody');
    table.appendChild(thead);
    table.appendChild(tbody);

    function drawRows() {
      tbody.innerHTML = '';
      a.rows.forEach(function (row, idx) {
        var tr = h('tr');
        item.columns.forEach(function (c) {
          var cell;
          if (c.type === 'select') {
            cell = h('select', null, [h('option', { value: '', text: '' })].concat(c.options.map(function (o) { return h('option', { value: o, text: o }); })));
            cell.value = row[c.key] || '';
            cell.addEventListener('change', function () { row[c.key] = cell.value; touch(item.id); });
          } else if (c.type === 'long') {
            cell = h('textarea', { rows: 2 });
            cell.value = row[c.key] || '';
            cell.addEventListener('input', function () { row[c.key] = cell.value; touch(item.id); });
          } else {
            cell = h('input', { type: 'text', value: row[c.key] || '' });
            cell.addEventListener('input', function () { row[c.key] = cell.value; touch(item.id); });
          }
          tr.appendChild(h('td', null, [cell]));
        });
        var del = h('button', { type: 'button', class: 'mini', title: 'Remove row', text: 'x' });
        del.addEventListener('click', function () { a.rows.splice(idx, 1); drawRows(); touch(item.id); });
        tr.appendChild(h('td', { class: 'rowact' }, [del]));
        tbody.appendChild(tr);
      });
      var count = box.querySelector('.rowcount');
      if (count) count.textContent = a.rows.length + ' row' + (a.rows.length === 1 ? '' : 's');
    }

    var addBtn = h('button', { type: 'button', class: 'small', text: 'Add row' });
    addBtn.addEventListener('click', function () {
      var row = {}; item.columns.forEach(function (c) { row[c.key] = ''; });
      a.rows.push(row); drawRows(); touch(item.id);
      var last = tbody.lastChild && tbody.lastChild.querySelector('input,select');
      if (last) last.focus();
    });
    var pasteBtn = h('button', { type: 'button', class: 'small', text: 'Paste rows' });
    pasteBtn.addEventListener('click', function () { openPasteModal(item, function () { drawRows(); touch(item.id); }); });

    box.appendChild(h('div', { class: 'tablescroll' }, [table]));
    box.appendChild(h('div', { class: 'tableactions' }, [addBtn, ' ', pasteBtn, ' ', h('span', { class: 'rowcount' })]));
    drawRows();
    ui.items[item.id].drawRows = drawRows;
    return box;
  }

  function renderItem(item) {
    var a = ans(item.id);
    ui.items[item.id] = {};
    var chip = h('span', { class: 'chip' });
    var rule = ruleText(item);

    var head = h('header', { class: 'ihead' }, [
      h('span', { class: 'iid', text: item.id }),
      h('h3', { text: item.title }),
      chip
    ]);

    var howParts = [h('p', { text: item.how || '' })];
    if (item.signals && item.signals.length) {
      howParts.push(h('p', { class: 'signals' }, [h('strong', { text: 'Signals to search: ' })].concat(item.signals.map(function (s, i) {
        return h('span', null, [h('code', { text: s }), i < item.signals.length - 1 ? ', ' : '']);
      }))));
    }
    if (item.refs && item.refs.length) howParts.push(h('p', { class: 'refs', text: 'Refs: ' + item.refs.join(', ') }));
    var how = DEV
      ? h('p', { class: 'tip', text: item.tip || '' })
      : h('details', { class: 'how' }, [h('summary', { text: 'How to find it' })].concat(howParts));

    var fields = [];
    var req = h('div', { class: 'req' });
    if (item.detail) {
      var dt = h('textarea', { rows: 2, placeholder: item.detail });
      dt.value = a.detail || '';
      dt.addEventListener('input', function () { ans(item.id).detail = dt.value; touch(item.id); });
      fields.push(h('label', { class: 'fld' }, [h('span', { text: 'Detail: ' + item.detail }), dt]));
    }
    if (DEV) {
      var nt = h('textarea', { rows: 2, placeholder: 'optional' });
      nt.value = a.notes || '';
      nt.addEventListener('input', function () { ans(item.id).notes = nt.value; touch(item.id); });
      fields.push(h('label', { class: 'fld' }, [h('span', { text: 'Notes' }), nt, req]));
    } else {
      var ev = h('textarea', { rows: 2, placeholder: 'file:line citations that support the answer' });
      ev.value = a.evidence || '';
      ev.addEventListener('input', function () { ans(item.id).evidence = ev.value; touch(item.id); });
      fields.push(h('label', { class: 'fld' }, [h('span', { text: 'Evidence' }), ev]));

      var se = h('textarea', { rows: 2, placeholder: 'patterns and directories searched' });
      se.value = a.searched || '';
      se.addEventListener('input', function () { ans(item.id).searched = se.value; touch(item.id); });
      fields.push(h('label', { class: 'fld' }, [h('span', { text: 'Searched' }), se, req]));
    }

    var meta = h('footer', { class: 'meta' });

    var findingsSection = null;
    DEF.items.forEach(function (x) { if (x.findings) findingsSection = x.section; });
    var remind = (DEV && !item.findings && findingsSection)
      ? h('p', { class: 'remind' }, ['Anything wrong here goes in ', h('a', { href: '#sec-' + findingsSection, text: 'Issues found' }), ' at the bottom.'])
      : null;

    var root = h('article', { class: 'item', 'data-id': item.id }, [
      head,
      rule ? h('p', { class: 'rule', text: 'Applies when: ' + rule }) : null,
      how,
      renderControl(item),
      h('div', { class: 'fields' }, fields),
      remind,
      meta
    ]);
    ui.items[item.id].root = root;
    ui.items[item.id].chip = chip;
    ui.items[item.id].req = req;
    ui.items[item.id].meta = meta;
    return root;
  }

  function renderAll() {
    var form = document.getElementById('form');
    form.innerHTML = '';
    ui.items = {}; ui.sections = {};
    applCache = {};
    DEF.items.forEach(function (it) {
      if (it.default !== undefined && state.answers[it.id] === undefined) state.answers[it.id] = { value: it.default };
    });
    var phases = DEF.phases && DEF.phases.length ? DEF.phases : [{ id: null, title: '' }];
    phases.forEach(function (ph) {
      var phEl = h('div', { class: 'phase' });
      if (ph.title) phEl.appendChild(h('h1', { text: ph.title }));
      if (ph.intro) phEl.appendChild(h('p', { class: 'intro', text: ph.intro }));
      DEF.sections.filter(function (s) { return ph.id === null || s.phase === ph.id; }).forEach(function (sec) {
        var secEl = h('section', { class: 'sec', 'data-sec': sec.id, id: 'sec-' + sec.id }, [
          h('h2', { text: 'Section ' + sec.id + ': ' + sec.title }),
          sec.intro ? h('p', { class: 'intro', text: sec.intro }) : null,
          sec.when ? h('p', { class: 'rule', text: 'Applies when: ' + condText(sec.when) }) : null
        ]);
        DEF.items.filter(function (it) { return it.section === sec.id; }).forEach(function (it) {
          secEl.appendChild(renderItem(it));
        });
        ui.sections[sec.id] = secEl;
        phEl.appendChild(secEl);
      });
      form.appendChild(phEl);
    });
    document.getElementById('app').value = state.app || '';
    document.getElementById('reviewer').value = state.reviewer || '';
    refreshSlots();
    refresh();
  }

  // ---------------------------------------------------------------------------
  // Refresh: applicability, completion, progress
  // ---------------------------------------------------------------------------
  function refresh() {
    applCache = {};
    var total = 0, done = 0;
    DEF.sections.forEach(function (sec) {
      var secEl = ui.sections[sec.id];
      if (!secEl) return;
      var on = sectionApplicable(sec);
      secEl.classList.toggle('na', !on);
      secEl.hidden = !on && !showHidden;
    });
    DEF.items.forEach(function (it) {
      var u = ui.items[it.id];
      if (!u) return;
      var on = applicable(it);
      u.root.classList.toggle('na', !on);
      u.root.hidden = !on && !showHidden;
      Array.prototype.forEach.call(u.root.querySelectorAll('input,select,textarea,button'), function (x) { x.disabled = !on; });
      if (!on) {
        u.chip.textContent = 'N/A by rule';
        u.chip.className = 'chip chip-na';
        u.req.textContent = '';
        u.meta.textContent = '';
        return;
      }
      total++;
      var ok = complete(it);
      if (ok) done++;
      if (it.optional && !answered(it)) {
        u.chip.textContent = 'Optional';
        u.chip.className = 'chip chip-open';
      } else {
        u.chip.textContent = ok ? (DEV ? 'Answered' : 'Complete') : (answered(it) ? 'Needs evidence' : 'Open');
        u.chip.className = 'chip ' + (ok ? 'chip-ok' : (answered(it) ? 'chip-warn' : 'chip-open'));
      }
      var r = requirementText(it);
      var a = state.answers[it.id] || {};
      var missing = (needsSearched(it) && !hasText(a.searched)) || (needsEvidence(it) && !hasText(a.evidence));
      u.req.textContent = r;
      u.req.className = 'req' + (r && missing ? ' req-missing' : '');
      u.meta.textContent = a.updatedAt ? 'Updated ' + fmtTime(a.updatedAt) : '';
    });
    var pct = total ? Math.round(done / total * 100) : 0;
    document.getElementById('progress').value = pct;
    document.getElementById('progresstext').textContent = done + ' of ' + total + ' applicable items complete (' + pct + '%)';
    var dirty = state.lastModifiedAt && (!state.lastExportedAt || state.lastModifiedAt > state.lastExportedAt);
    var badge = document.getElementById('dirty');
    badge.hidden = !dirty;
    badge.textContent = state.lastExportedAt ? 'Changes since last export' : 'Never exported';
  }

  function refreshSlots() {
    var dl = document.getElementById('slots');
    dl.innerHTML = '';
    listSlots().forEach(function (s) { dl.appendChild(h('option', { value: s })); });
  }

  // ---------------------------------------------------------------------------
  // Export and import
  // ---------------------------------------------------------------------------
  function buildExport() {
    applCache = {};
    var out = {
      checklist: DEF.id, version: DEF.version, title: DEF.title,
      app: state.app || '', reviewer: state.reviewer || '', reviewerKind: 'dev',
      exportedAt: now(), answers: {}
    };
    DEF.items.forEach(function (it) {
      if (!applicable(it)) { out.answers[it.id] = { status: 'na', reason: 'rule: ' + ruleText(it, true) }; return; }
      var a = state.answers[it.id] || {};
      var rec = {};
      if (it.type === 'list') rec.rows = a.rows || [];
      else rec.value = (a.value === undefined) ? null : a.value;
      if (it.detail) rec.detail = a.detail || '';
      if (DEV) rec.notes = a.notes || '';
      else { rec.evidence = a.evidence || ''; rec.searched = a.searched || ''; }
      rec.complete = complete(it);
      rec.updatedAt = a.updatedAt || null;
      out.answers[it.id] = rec;
    });
    // Mirror the issues table at the top level so a roll-up does not need to know its id.
    out.findings = [];
    DEF.items.forEach(function (it) {
      if (it.findings && out.answers[it.id] && out.answers[it.id].rows) {
        out.answers[it.id].rows.forEach(function (r) { out.findings.push(Object.assign({ item: it.id }, r)); });
      }
    });
    return out;
  }

  function openExportModal() {
    var json = JSON.stringify(buildExport(), null, 2);
    var ta = h('textarea', { class: 'json', readonly: true, rows: 18 });
    ta.value = json;
    var copy = h('button', { type: 'button', class: 'primary', text: 'Copy to clipboard' });
    copy.addEventListener('click', function () { copyText(ta); });
    openModal('Export review as JSON', [
      h('p', { class: 'note', text: 'Exporting does not clear anything. Your answers stay saved in this browser until you use Clear.' }),
      ta
    ], [copy]);
    state.lastExportedAt = now();
    save();
    refresh();
  }

  function copyText(ta) {
    function fallback() {
      var ok = false;
      try { ta.focus(); ta.select(); ok = document.execCommand('copy'); } catch (e) { ok = false; }
      flash(ok ? 'Copied to clipboard' : 'Copy failed. Select the text and copy it manually.');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(function () { flash('Copied to clipboard'); }, fallback);
    } else fallback();
  }

  function openImportModal() {
    var ta = h('textarea', { class: 'json', rows: 14, placeholder: 'Paste exported JSON here' });
    var preview = h('div', { class: 'preview' });
    var replace = h('button', { type: 'button', class: 'primary', text: 'Replace current answers', disabled: true });
    var merge = h('button', { type: 'button', text: 'Merge into current answers', disabled: true });
    var parsed = null;
    function check() {
      parsed = null; replace.disabled = true; merge.disabled = true;
      var obj;
      try { obj = JSON.parse(ta.value); } catch (e) { preview.textContent = 'Not valid JSON: ' + e.message; return; }
      if (obj.checklist !== DEF.id) { preview.textContent = 'This JSON is for checklist "' + obj.checklist + '", not "' + DEF.id + '".'; return; }
      var major = String(obj.version || '').split('.')[0];
      var n = Object.keys(obj.answers || {}).length;
      var known = Object.keys(obj.answers || {}).filter(function (id) { return itemsById[id]; }).length;
      var lines = [
        'Application: ' + (obj.app || '(none)'),
        'Reviewer: ' + (obj.reviewer || '(none)') + ' [' + (obj.reviewerKind || 'unknown') + ']',
        'Exported: ' + fmtTime(obj.exportedAt),
        'Answers: ' + n + ' (' + known + ' match items in this checklist)'
      ];
      if (major !== MAJOR) lines.push('Warning: exported from version ' + obj.version + ', this form is ' + DEF.version + '. Items may not line up.');
      preview.textContent = lines.join('\n');
      parsed = obj; replace.disabled = false; merge.disabled = false;
    }
    ta.addEventListener('input', check);
    function apply(mode) {
      if (!parsed) return;
      if (mode === 'replace') { state = freshState(); }
      if (parsed.app) state.app = parsed.app;
      if (parsed.reviewer && !state.reviewer) state.reviewer = parsed.reviewer;
      Object.keys(parsed.answers || {}).forEach(function (id) {
        var r = parsed.answers[id];
        if (!itemsById[id] || !r || r.status === 'na') return;
        var a = {};
        if (Object.prototype.hasOwnProperty.call(r, 'rows')) a.rows = Array.isArray(r.rows) ? r.rows : [];
        if (Object.prototype.hasOwnProperty.call(r, 'value') && r.value !== null) a.value = r.value;
        if (r.detail) a.detail = r.detail;
        if (r.notes) a.notes = r.notes;
        if (r.evidence) a.evidence = r.evidence;
        if (r.searched) a.searched = r.searched;
        a.updatedAt = r.updatedAt || null;
        state.answers[id] = (mode === 'merge') ? Object.assign(state.answers[id] || {}, a) : a;
      });
      state.lastModifiedAt = now();
      closeModal();
      renderAll();
      save();
      flash('Imported into "' + slotName(state.app) + '"');
    }
    replace.addEventListener('click', function () { apply('replace'); });
    merge.addEventListener('click', function () { apply('merge'); });
    openModal('Import review JSON', [ta, preview], [replace, merge]);
  }

  function openPasteModal(item, done) {
    var ta = h('textarea', { class: 'json', rows: 10, placeholder: 'One row per line. Separate columns with tabs or " | ".\nColumn order: ' + item.columns.map(function (c) { return c.label; }).join(' | ') });
    var add = h('button', { type: 'button', class: 'primary', text: 'Add rows' });
    add.addEventListener('click', function () {
      var a = ans(item.id); if (!Array.isArray(a.rows)) a.rows = [];
      ta.value.split(/\r?\n/).forEach(function (line) {
        if (!line.trim()) return;
        var cells = line.indexOf('\t') >= 0 ? line.split('\t') : line.split(/\s*\|\s*/);
        var row = {};
        item.columns.forEach(function (c, i) { row[c.key] = (cells[i] || '').trim(); });
        a.rows.push(row);
      });
      closeModal(); done();
    });
    openModal('Paste rows into ' + item.id, [ta], [add]);
  }

  function clearReview() {
    var name = slotName(state.app);
    var dirty = state.lastModifiedAt && (!state.lastExportedAt || state.lastModifiedAt > state.lastExportedAt);
    var msg = 'Clear the saved review for "' + name + '"?';
    if (dirty) msg += '\n\nThere are changes newer than the last export. Export first if you want to keep them.';
    msg += '\n\nThe previous copy is kept once under a backup key until the next clear.';
    if (!window.confirm(msg)) return;
    try {
      var k = slotKey(state.app);
      var cur = localStorage.getItem(k);
      if (cur) localStorage.setItem(k + ':prev', cur);
      localStorage.removeItem(k);
    } catch (e) { /* ignore */ }
    var app = state.app;
    state = freshState();
    state.app = app;
    renderAll();
    flash('Cleared "' + name + '"');
  }

  // ---------------------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------------------
  function openModal(title, body, actions) {
    var back = document.getElementById('modal');
    var box = back.querySelector('.modal');
    box.innerHTML = '';
    var close = h('button', { type: 'button', text: 'Close' });
    close.addEventListener('click', closeModal);
    box.appendChild(h('h2', { text: title }));
    (body || []).forEach(function (b) { box.appendChild(b); });
    box.appendChild(h('div', { class: 'modalactions' }, (actions || []).concat([close])));
    back.hidden = false;
    var first = box.querySelector('textarea,input,button');
    if (first) first.focus();
  }
  function closeModal() { document.getElementById('modal').hidden = true; }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------
  function init() {
    var appInput = document.getElementById('app');
    var revInput = document.getElementById('reviewer');
    appInput.addEventListener('change', function () {
      var target = appInput.value;
      if (slotName(target) === slotName(state.app)) return;
      var hasAnswers = Object.keys(state.answers).some(function (id) { return answered(itemsById[id] || {}); });
      if (!slotExists(target) && hasAnswers) {
        // Rename: carry the current work to the new name.
        try { localStorage.removeItem(slotKey(state.app)); } catch (e) { /* ignore */ }
        state.app = target;
        saveNowTo(target);
        renderAll();
        flash('Renamed review to "' + slotName(target) + '"');
        return;
      }
      var found = loadSlot(target);
      renderAll();
      flash(found ? 'Loaded "' + slotName(target) + '", last saved ' + fmtTime(state.lastModifiedAt) : 'Started new review "' + slotName(target) + '"');
    });
    revInput.addEventListener('input', function () { state.reviewer = revInput.value; touch(null); });
    document.getElementById('btn-export').addEventListener('click', openExportModal);
    document.getElementById('btn-import').addEventListener('click', openImportModal);
    document.getElementById('btn-clear').addEventListener('click', clearReview);
    document.getElementById('btn-print').addEventListener('click', function () { window.print(); });
    var showHiddenBox = document.getElementById('show-hidden');
    if (showHiddenBox) showHiddenBox.addEventListener('change', function (e) { showHidden = e.target.checked; refresh(); });
    document.getElementById('modal').addEventListener('click', function (e) { if (e.target.id === 'modal') closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

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
    setAnswer: function (id, patch) { Object.assign(ans(id), patch); touch(id); },
    rerender: renderAll
  };

  document.addEventListener('DOMContentLoaded', init);
})();

</script>
</body>
</html>


=========================


# Web Application Security Review: Phase 1, Application Profile (AI reviewer)

Checklist `web-idor-review` version 0.1.0. Generated from `definitions/profile.json`; do not edit outside the answer blocks.

## Your task

You are performing a static security profile of the web application whose source code is open in this project. This document is the profile checklist. Fill it in completely, in place, by editing the answer blocks. Do not restructure, renumber, or delete anything outside the answer blocks.

The profile exists because of an incident in another application: a numeric identifier in a download URL could be changed to fetch another user's file. The application confirmed the caller was logged in and confirmed the caller was allowed to use the application, but never confirmed the caller was allowed to see that particular file. Static scanners and code reviews both missed it, because whether user A may see record 1002 is a question about the application's data-ownership rules, not about syntax. Your answers here establish those rules and select which review checks apply to this application. The review phase, in a separate document, depends on this profile being complete and correct.

## Step 0: set up the linter before anything else

Appendix A at the end of this document contains a small Node script that checks this document: every answer block present, values within each item's option list, negative answers backed by a `Searched:` record, and `Status: na` used only where the branching rules allow it. It reads its rules from the hidden `lint-schema` comment near the top of this document, so it needs nothing else.

1. If a file named `profile-lint.js` already sits next to this document, use it. Otherwise create it by copying the script from Appendix A, exactly as written, in a single write. Do not retype or abbreviate any part of it.
2. Run it against this document: `node profile-lint.js <this document's file name>`. Before you have answered anything it should report every item as not answered. If it reports a syntax error, your copy differs from Appendix A: recopy it. If the script cannot be run in your environment at all, write that in the self-check section at the end and continue without it.
3. Run it again after finishing each section. Fix what it reports before moving on.
4. Finish only when it reports zero problems. Then run it once more with `--json profile-result.json` to write the result file, and leave both files in place.

The linter checks form, not truth. A wrong answer that passes the linter is still wrong.

## Constraints

- You have read and search access to the source. You cannot build, run, or send requests. Every answer must come from reading code, descriptors, and configuration.
- Cite evidence as `path/to/File.java:123`. An answer without a citation is incomplete.
- The application does not contain personal data in `src/main/java` or `src/main/angular`. Do not quote configuration values that look like secrets; cite their location instead.
- Work through the sections in order. Section A must be finished before anything else, because later sections switch on its answers.

## The rule about negative answers

A negative answer (`no`, `none`, `none-found`, `unknown`, `not-established`, or an empty table) switches review checks off. It is therefore the most consequential answer in this document. A negative answer is valid only when the `Searched:` field lists every signal from the item's signal list that you searched for, and the directories you searched in. If you did not search for a listed signal, you may not answer negatively. A negative answer without a complete `Searched:` record will be treated as a failed item.

## How to fill an answer block

Each item ends with a block like this:

```
<!-- answer EXAMPLE -->
Value:
Detail (Naming convention observed):
Evidence:
Searched:
<!-- /answer -->
```

- `Value:` For yes/no items write `yes` or `no`. For single-choice items write exactly one option code from the item's option list, for example `portlet`. For multiple-choice items write the option codes separated by commas, for example `spring-mvc, jsf`. For free-text items write the answer; it may span several lines.
- `Detail (...)`: Only present on some items. Answer the question in the parentheses.
- `Evidence:` File and line citations that support the value, with a few words on what each one shows. May span several lines.
- `Searched:` The patterns you searched for and the directories you searched in. Required for negative answers; recommended everywhere.
- Table items have a Markdown table instead of `Value:`. Add one row per entry, keeping the header row and column order unchanged. Leave the placeholder empty row out once you have real rows. If the table is legitimately empty, leave it with no data rows and justify that in `Searched:`.
- If an item's `Applies when` rule is not met by your earlier answers, write `Status: na` as the first line inside the block, followed by `Reason: rule: <the rule as written>`, and leave the other fields empty.
- A value may continue on following lines until the next field label. Do not add labels of your own.

## Issues you notice on the way

If, while answering, you see something that looks like a flaw, record it in the Issues found table (item F-01, the last section) with a file:line citation, the item that led you to it, and a severity. Then carry on with the profile. Do not start hunting for flaws: that is the review phase, which has its own document and depends on this profile being complete first.

## When you finish

Re-read every item once. For each one confirm: the value is present, the evidence cites file and line, and every negative answer has a complete `Searched:` record. Then list, at the very end of this document under a heading `## Profile self-check`, any item you could not complete and why.

---

## Application

<!-- answer META -->
Application:
Reviewer: ai
<!-- /answer -->

<!-- lint-schema
{"id":"web-idor-review","version":"0.1.0","title":"Web Application Security Review","negativeValues":["no","none","none-found","unknown","not-established","not-set-default","no-weblogic-xml","none-api-only"],"sections":[{"id":"A","title":"Identity and stack"},{"id":"B","title":"Authentication and session"},{"id":"C","title":"Portal to portlet token handoff","when":{"q":"C-03","in":["portal","portlet"]}},{"id":"D","title":"Authorization and ownership model"},{"id":"E","title":"HTTP entry points and identifiers"},{"id":"F","title":"Data access and outbound services"},{"id":"G","title":"Files, documents, and uploads"},{"id":"H","title":"Responses, binding, headers, and static content"},{"id":"I","title":"Fortify artifacts"},{"id":"J","title":"JSF specifics","when":{"q":"C-04","includes":"jsf"}},{"id":"K","title":"Fleet defaults to confirm"},{"id":"Z","title":"Issues found"}],"items":[{"id":"C-01","section":"A","type":"list","title":"Deployable modules, artifact ids, and context roots","columns":[{"key":"module","label":"Module (pom path)"},{"key":"artifactId","label":"artifactId"},{"key":"packaging","label":"Packaging"},{"key":"contextRoot","label":"Context root"}],"detail":false,"emptyRequires":false},{"id":"C-03","section":"A","type":"select","title":"Application type","options":["portal","portlet","standalone","unknown"],"detail":true,"emptyRequires":false},{"id":"C-04","section":"A","type":"multiselect","title":"Backend frameworks present","options":["spring-mvc","spring-boot","spring-security","jaxrs","jsf","jsp","servlets","websocket","struts","other"],"detail":true,"emptyRequires":false},{"id":"C-05","section":"A","type":"select","title":"Frontend technology","options":["angular","angularjs","mixed","server-rendered","none-api-only"],"detail":true,"emptyRequires":false},{"id":"C-06","section":"A","type":"select","title":"Frontend delivery and origin","options":["same-war","separate-origin-cors","separate-proxied","unknown"],"detail":true,"emptyRequires":false},{"id":"C-10","section":"B","type":"multiselect","title":"Authentication mechanisms","options":["beneficiary-sso","operator-filter","portal-jwt","spring-security","container-managed","custom","none"],"detail":true,"emptyRequires":false},{"id":"C-11","section":"B","type":"list","title":"Authentication and authorization filters","columns":[{"key":"filterClass","label":"Filter class"},{"key":"registeredIn","label":"Registered in"},{"key":"urlPatterns","label":"URL patterns"},{"key":"order","label":"Order"},{"key":"purpose","label":"Purpose"}],"detail":false,"emptyRequires":false},{"id":"C-12","section":"B","type":"list","title":"Filter exclusions and public paths","columns":[{"key":"pattern","label":"Pattern"},{"key":"matching","label":"Matching"},{"key":"definedAt","label":"Defined at (file:line)"},{"key":"appliesTo","label":"Which filters skip it"}],"detail":false,"emptyRequires":true},{"id":"C-13","section":"B","type":"list","title":"Everything reachable under the exclusions","columns":[{"key":"url","label":"URL"},{"key":"handler","label":"Handler class#method or path"},{"key":"returnsData","label":"Returns data"},{"key":"dataDescription","label":"What it returns"}],"detail":false,"emptyRequires":true},{"id":"C-14","section":"B","type":"select","title":"Where identity is held after authentication","options":["http-session","custom-principal","thread-local","spring-security-context","jwt-each-request","other","unknown"],"detail":true,"emptyRequires":false},{"id":"C-15","section":"B","type":"select","title":"Per-request credential","options":["session-cookie","bearer-jwt","both","none"],"detail":false,"emptyRequires":false},{"id":"C-16","section":"B","type":"multiselect","title":"Session cookie flags","options":["http-only","secure","samesite","none-found"],"when":{"q":"C-15","in":["session-cookie","both"]},"detail":true,"emptyRequires":false},{"id":"C-17","section":"B","type":"yesno","title":"Frontend JavaScript reads authentication cookies","detail":true,"emptyRequires":false},{"id":"C-20","section":"C","type":"select","title":"Token delivery into the portlet iframe","options":["query-param","url-fragment","postmessage","shared-domain-cookie","proxy-header","other","unknown"],"detail":true,"emptyRequires":false},{"id":"C-21","section":"C","type":"select","title":"Token construct and library","options":["jws-hmac","jws-asymmetric","jwe","jws-and-jwe","custom-crypto","unknown"],"detail":true,"emptyRequires":false},{"id":"C-22","section":"C","type":"list","title":"Token claims","columns":[{"key":"claim","label":"Claim"},{"key":"meaning","label":"Meaning"},{"key":"setBy","label":"Set by (class)"},{"key":"usedFor","label":"Portlet uses it for"}],"detail":false,"emptyRequires":false},{"id":"C-23","section":"C","type":"multiselect","title":"Validation performed on the received token","options":["signature","exp","nbf","iss","aud-or-app-id","alg-pinned","jti-replay","none-found"],"when":{"q":"C-03","eq":"portlet"},"detail":true,"emptyRequires":false},{"id":"C-24","section":"C","type":"select","title":"Secret or key storage","options":["properties-in-war","credential-store-jndi","env-var","hardcoded","other","unknown"],"detail":true,"emptyRequires":false},{"id":"C-25","section":"C","type":"select","title":"Secret scope","options":["fleet-shared","per-portlet","unknown"],"detail":true,"emptyRequires":false},{"id":"C-26","section":"C","type":"select","title":"Session model after token validation","options":["creates-http-session","stateless","both","unknown"],"when":{"q":"C-03","eq":"portlet"},"detail":true,"emptyRequires":false},{"id":"C-27","section":"C","type":"list","title":"Portlet entry guard","columns":[{"key":"guardClass","label":"Guard class"},{"key":"urlPatterns","label":"URL patterns"},{"key":"exclusions","label":"Exclusions"},{"key":"rejectsWhen","label":"Rejects when"}],"when":{"q":"C-03","eq":"portlet"},"detail":false,"emptyRequires":true},{"id":"C-28","section":"C","type":"select","title":"Framing protection","options":["x-frame-options","csp-frame-ancestors","both","none-found"],"detail":true,"emptyRequires":false},{"id":"C-29","section":"C","type":"text","title":"Where the portal mints the token","when":{"q":"C-03","eq":"portal"},"detail":false,"emptyRequires":false},{"id":"C-30","section":"D","type":"select","title":"Ownership model","options":["beneficiary-family","operator-access-level","operator-site","mixed","none-found","unknown"],"detail":true,"emptyRequires":false},{"id":"C-31","section":"D","type":"yesno","title":"Application-level authorization check present","detail":true,"emptyRequires":false},{"id":"C-32","section":"D","type":"select","title":"Object-level scope check pattern","options":["canonical-helper","per-endpoint","annotation","none-found","unknown"],"detail":true,"emptyRequires":false},{"id":"C-33","section":"D","type":"select","title":"How the caller's scope is established","options":["roster-in-session","per-request-lookup","jwt-claims","not-established","unknown"],"detail":true,"emptyRequires":false},{"id":"C-34","section":"D","type":"text","title":"Operator access levels and site selection","when":{"q":"C-30","in":["operator-access-level","operator-site","mixed"]},"detail":false,"emptyRequires":false},{"id":"C-40","section":"E","type":"multiselect","title":"HTTP entry point types","options":["spring-mvc","jaxrs","jsf-actions","servlets","websocket","actuator","other"],"detail":true,"emptyRequires":false},{"id":"C-41","section":"E","type":"list","title":"Endpoint inventory","columns":[{"key":"methods","label":"HTTP method(s)"},{"key":"path","label":"Path"},{"key":"handler","label":"Handler class#method"},{"key":"isPublic","label":"Public (under a C-12 exclusion)"},{"key":"idParams","label":"Identifier parameters (name = what it identifies)"},{"key":"idSource","label":"Identifier source"},{"key":"returnsData","label":"Returns data"},{"key":"mutates","label":"Writes or deletes"}],"detail":false,"emptyRequires":true},{"id":"C-42","section":"E","type":"multiselect","title":"Identifier kinds appearing in requests","options":["person-id","sponsor-id","family-id","document-id","db-primary-key","uuid","opaque-token","composite","other"],"detail":true,"emptyRequires":false},{"id":"C-50","section":"F","type":"multiselect","title":"Data access mechanisms","options":["cuf","rest-client","soap-client","jpa-hibernate","jdbctemplate","stored-procedures","mybatis","file-system","ldap","other"],"detail":true,"emptyRequires":false},{"id":"C-51","section":"F","type":"list","title":"Outbound service calls","columns":[{"key":"service","label":"Service"},{"key":"endpoint","label":"Base URL or property key"},{"key":"client","label":"Client class"},{"key":"operations","label":"Operations used"},{"key":"identifier","label":"Identifier passed"},{"key":"scopePassed","label":"Caller scope passed"}],"detail":false,"emptyRequires":true},{"id":"C-52","section":"F","type":"text","title":"CUF request identity and scope","when":{"q":"C-50","includes":"cuf"},"detail":false,"emptyRequires":false},{"id":"C-53","section":"F","type":"list","title":"Direct database access points","columns":[{"key":"location","label":"Class#method (file:line)"},{"key":"query","label":"Query or procedure"},{"key":"identifier","label":"Identifier in WHERE"},{"key":"scoped","label":"Scope constraint in WHERE"}],"when":{"q":"C-50","includesAny":["jpa-hibernate","jdbctemplate","stored-procedures","mybatis"]},"detail":false,"emptyRequires":false},{"id":"C-60","section":"G","type":"yesno","title":"Serves files or documents by identifier","detail":false,"emptyRequires":false},{"id":"C-61","section":"G","type":"list","title":"File-serving handlers","columns":[{"key":"handler","label":"Handler class#method"},{"key":"url","label":"URL"},{"key":"idParam","label":"Identifier parameter"},{"key":"byteSource","label":"Byte source"},{"key":"isPublic","label":"Public"},{"key":"scopeCheck","label":"Scope check location, or none"}],"when":{"q":"C-60","eq":"yes"},"detail":false,"emptyRequires":false},{"id":"C-62","section":"G","type":"yesno","title":"Accepts file uploads","detail":false,"emptyRequires":false},{"id":"C-63","section":"G","type":"list","title":"Upload handlers","columns":[{"key":"handler","label":"Handler class#method"},{"key":"url","label":"URL"},{"key":"target","label":"Record the upload attaches to"},{"key":"idSource","label":"Identifier source"},{"key":"storedAt","label":"Where bytes are stored"}],"when":{"q":"C-62","eq":"yes"},"detail":false,"emptyRequires":false},{"id":"C-70","section":"H","type":"select","title":"Response serialization style","options":["entities-wholesale","dto-mapped","mixed","unknown"],"detail":true,"emptyRequires":false},{"id":"C-71","section":"H","type":"multiselect","title":"Request binding styles present","options":["requestbody-domain","requestbody-dto","modelattribute","beanparam","jsf-properties","getparameter","none-found"],"detail":true,"emptyRequires":false},{"id":"C-72","section":"H","type":"multiselect","title":"Binding allow-list mechanisms","options":["initbinder-allowed","initbinder-disallowed","jsonignore-setters","dto-only","none-found"],"detail":true,"emptyRequires":false},{"id":"C-73","section":"H","type":"select","title":"Cache-Control on authenticated responses","options":["global-filter","per-endpoint","none-found","unknown"],"detail":true,"emptyRequires":false},{"id":"C-74","section":"H","type":"select","title":"Directory listing setting","options":["disabled-explicit","enabled-explicit","not-set-default","no-weblogic-xml"],"detail":false,"emptyRequires":false},{"id":"C-75","section":"H","type":"list","title":"Static resource handlers and roots","columns":[{"key":"config","label":"Configured at (file:line)"},{"key":"pattern","label":"URL pattern"},{"key":"root","label":"Filesystem or classpath root"},{"key":"sensitive","label":"Anything beyond frontend assets"}],"detail":false,"emptyRequires":false},{"id":"C-80","section":"I","type":"yesno","title":"Fortify artifacts checked into the repository","detail":false,"emptyRequires":false},{"id":"C-81","section":"I","type":"list","title":"Fortify artifacts","columns":[{"key":"path","label":"Path"},{"key":"kind","label":"Kind"},{"key":"suppresses","label":"What it suppresses or excludes"}],"when":{"q":"C-80","eq":"yes"},"detail":false,"emptyRequires":false},{"id":"C-82","section":"I","type":"yesno","title":"Candidate taint-breaking wrappers","detail":false,"emptyRequires":false},{"id":"C-83","section":"I","type":"list","title":"Taint-breaking wrapper candidates","columns":[{"key":"method","label":"Class#method (file:line)"},{"key":"pattern","label":"Pattern"},{"key":"callers","label":"Called from"}],"when":{"q":"C-82","eq":"yes"},"detail":false,"emptyRequires":false},{"id":"C-90","section":"J","type":"list","title":"JSF pages and backing beans","columns":[{"key":"page","label":"Page"},{"key":"bean","label":"Bean class"},{"key":"scope","label":"Bean scope"},{"key":"idsHeld","label":"Record identifiers held"},{"key":"loadedFrom","label":"Identifiers loaded from"}],"detail":false,"emptyRequires":false},{"id":"C-91","section":"J","type":"select","title":"ViewState protection","options":["server-side","client-encrypted","client-unencrypted","unknown"],"detail":false,"emptyRequires":false},{"id":"C-95","section":"K","type":"list","title":"Enterprise shared libraries in the POM","columns":[{"key":"artifact","label":"groupId:artifactId"},{"key":"version","label":"Version"},{"key":"scope","label":"Scope"},{"key":"provides","label":"What it provides here"}],"detail":false,"emptyRequires":false},{"id":"C-96","section":"K","type":"yesno","title":"CUF is the main data path","default":"yes","detail":false,"emptyRequires":false},{"id":"C-97","section":"K","type":"yesno","title":"Backend services are called without authentication","default":"yes","detail":false,"emptyRequires":false},{"id":"C-98","section":"K","type":"yesno","title":"Deployed to WebLogic","default":"yes","detail":true,"emptyRequires":false},{"id":"F-01","section":"Z","type":"list","title":"Issues found while profiling","columns":[{"key":"location","label":"Location (file:line or URL)"},{"key":"description","label":"What is wrong"},{"key":"relatedItem","label":"Related item"},{"key":"severity","label":"Severity"}],"detail":false,"emptyRequires":false,"optional":true,"findings":true}]}
-->

# Phase 1: Application profile

Establish what this application is from code evidence, not from memory. Every later check switches on these answers, so a wrong answer here silently removes checks from the review. A negative answer (no, none found, unknown) is only valid when the Searched field lists the patterns and directories that were searched.

## Section A: Identity and stack

What is deployed, and which frameworks handle HTTP on the server and rendering on the client.

### C-01: Deployable modules, artifact ids, and context roots

**Type:** table  
**Applies when:** always  
**Refs:** 6.10, 6.11

**How:** Open the root pom.xml and every module pom.xml. Record one row for each module that produces a WAR or a Spring Boot executable. Take the context root from src/main/webapp/WEB-INF/weblogic.xml, or from server.servlet.context-path in application.properties or application.yml.

**Signals to search:** `<packaging>war</packaging>`, `spring-boot-maven-plugin`, `<artifactId>`, `<finalName>`, `<context-root>`, `server.servlet.context-path`

**Columns:**

- Module (pom path)
- artifactId
- Packaging (one of: `war`, `spring-boot-jar`, `other`)
- Context root

<!-- answer C-01 -->
| Module (pom path) | artifactId | Packaging | Context root |
|---|---|---|---|
|   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-03: Application type

**Type:** single choice  
**Applies when:** always  
**Refs:** 1, 6.1, Q26

**How:** Decide from evidence, not from the name. Portal: hosts other applications in iframes and mints the token they receive (iframe elements whose src is another application, a JWT builder or sign call, portlet URL configuration, plus its own SSO filter). Portlet: receives a token from a parent and validates it, has no SSO filter of its own, and often has an artifactId prefixed portlet-. Standalone: has its own SSO filter, hosts no iframes, validates no token from a parent. If signals conflict, choose the dominant role and describe the conflict in Evidence.

**Signals to search:** `<iframe`, `bypassSecurityTrustResourceUrl`, `Jwts.builder`, `signWith(`, `Jwts.parser`, `JWTVerifier`, `portlet`, `AuthFilter`, `BeneficiaryAgentSSO`, `OperatorAuthenticationFilter`, `web-security`, `frame-ancestors`, `X-Frame-Options`

**Options:**

- `portal`: Portal: hosts portlets and mints their token
- `portlet`: Portlet: loaded in a portal iframe, receives a token
- `standalone`: Standalone: own SSO, no iframe hosting, no parent token
- `unknown`: Unknown

<!-- answer C-03 -->
Value:
Detail (Naming convention observed: artifactId prefix, package name):
Evidence:
Searched:
<!-- /answer -->

### C-04: Backend frameworks present

**Type:** multiple choice  
**Applies when:** always  
**Refs:** 1, Q12, Q31

**How:** Check the POM dependencies, web.xml, and annotations in src/main/java. Select every framework that handles an HTTP request in this application, even if only for one page.

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

<!-- answer C-04 -->
Value:
Detail (Versions and anything selected as Other):
Evidence:
Searched:
<!-- /answer -->

### C-05: Frontend technology

**Type:** single choice  
**Applies when:** always  
**Refs:** Q19

**How:** Look for package.json and angular.json under src/main/angular or similar. AngularJS 1.x shows as angular.module( and ng-app in templates. If the only pages are JSF or JSP, choose server-rendered.

**Signals to search:** `angular.json`, `@angular/core`, `package.json`, `angular.module(`, `ng-app`, `ng-controller`, `src/main/angular`

**Options:**

- `angular`: Angular 2 or later
- `angularjs`: AngularJS 1.x
- `mixed`: Mixed (describe in Detail)
- `server-rendered`: Server-rendered pages only (JSF or JSP)
- `none-api-only`: None: API only

<!-- answer C-05 -->
Value:
Detail (Version from package.json and where the frontend source lives):
Evidence:
Searched:
<!-- /answer -->

### C-06: Frontend delivery and origin

**Type:** single choice  
**Applies when:** always  
**Refs:** 6.10, Q19

**How:** Same WAR: a frontend build plugin copies the compiled app into src/main/webapp or the WAR, so API calls are same-origin and the session cookie rides along. Separate origin: the frontend is deployed elsewhere and the backend has CORS configuration. Record allowed origins and whether credentials are allowed.

**Signals to search:** `frontend-maven-plugin`, `outputPath`, `src/main/webapp`, `@CrossOrigin`, `CorsFilter`, `CorsRegistry`, `addCorsMappings`, `Access-Control-Allow-Origin`, `allowCredentials`, `withCredentials`

**Options:**

- `same-war`: Served from the same WAR (same origin)
- `separate-origin-cors`: Separate origin with CORS
- `separate-proxied`: Separate deployment behind the same origin (proxy)
- `unknown`: Unknown

<!-- answer C-06 -->
Value:
Detail (CORS allowed origins and credentials setting, if any):
Evidence:
Searched:
<!-- /answer -->

## Section B: Authentication and session

How a caller becomes known to the application, what identity is kept afterward, and which paths skip the check.

### C-10: Authentication mechanisms

**Type:** multiple choice  
**Applies when:** always  
**Refs:** 6.1, 6.2, 6.3, Q26

**How:** Identify every mechanism that decides whether a request is authenticated. Enterprise filters usually come from a shared library and are declared in web.xml or registered by a Spring configuration class even though the class lives outside the repo.

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
**Refs:** 6.2, 6.3, Q6

**How:** One row per servlet filter or security-chain element that authenticates, authorizes, or writes security headers. Read web.xml <filter> and <filter-mapping>, @WebFilter annotations, FilterRegistrationBean beans, and Spring Security configuration. Record the url-patterns exactly as declared and the order they run in.

**Signals to search:** `<filter>`, `<filter-mapping>`, `<url-pattern>`, `@WebFilter`, `FilterRegistrationBean`, `addFilterBefore`, `SecurityFilterChain`, `OncePerRequestFilter`, `doFilter(`

**Columns:**

- Filter class
- Registered in (one of: `web.xml`, `@WebFilter`, `FilterRegistrationBean`, `Spring Security chain`, `other`)
- URL patterns
- Order
- Purpose (one of: `authentication`, `authorization`, `headers`, `other`)

<!-- answer C-11 -->
| Filter class | Registered in | URL patterns | Order | Purpose |
|---|---|---|---|---|
|   |   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-12: Filter exclusions and public paths

**Type:** table  
**Applies when:** always  
**Refs:** 6.3, Q17, Q18

**How:** For each filter in C-11, read its doFilter, shouldNotFilter, or init-params for path tests that skip authentication. Include Spring Security permitAll and web.ignoring rules. Also include any url-pattern gap: a servlet mapping that no authentication filter mapping covers is an exclusion even though nobody wrote it as one. Record how the match is performed, because prefix and regex matches are the ones that can be bypassed with path tricks.

**Signals to search:** `shouldNotFilter`, `excludeUrlPatterns`, `exclude`, `permitAll`, `web.ignoring`, `antMatchers`, `requestMatchers`, `startsWith(`, `matches(`, `endsWith(`, `contains(`, `/ws/public`, `appmonitor.status`, `/public`, `/static`, `/vendor`, `/assets`, `<url-pattern>`

**Columns:**

- Pattern
- Matching (one of: `exact`, `prefix`, `suffix`, `regex`, `servlet-mapping gap`, `other`)
- Defined at (file:line)
- Which filters skip it

**If empty:** An empty table must be justified in Searched: name each filter from C-11 and state that its path tests were read.

<!-- answer C-12 -->
| Pattern | Matching | Defined at (file:line) | Which filters skip it |
|---|---|---|---|
|   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-13: Everything reachable under the exclusions

**Type:** table  
**Applies when:** always  
**Refs:** 6.3, Q17

**How:** For each pattern in C-12, find every handler, servlet, JSF page, or static directory whose mapping falls under it. One row per handler. Static directories count: list anything under them that is not plain frontend assets, such as configuration, source maps, backups, or documents. Say whether the handler returns data and what data.

**Signals to search:** `@RequestMapping`, `@GetMapping`, `@Path(`, `<servlet-mapping>`, `src/main/webapp`, `src/main/resources/static`, `src/main/resources/public`

**Columns:**

- URL
- Handler class#method or path
- Returns data (one of: `yes`, `no`)
- What it returns

**If empty:** An empty table must be justified in Searched: name each C-12 pattern and what was found under it.

<!-- answer C-13 -->
| URL | Handler class#method or path | Returns data | What it returns |
|---|---|---|---|
|   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-14: Where identity is held after authentication

**Type:** single choice  
**Applies when:** always  
**Refs:** 6.7, Q7

**How:** Follow the authentication filter to the point where it stores who the caller is. Then find the class that later code reads to get the caller's identifiers. Record that class and every identifier it carries.

**Signals to search:** `getSession(`, `setAttribute(`, `getUserPrincipal`, `Principal`, `ThreadLocal`, `RequestContextHolder`, `SecurityContextHolder`, `UserContext`, `UserInfo`, `Identity`, `Beneficiary`, `Operator`, `Subject`

**Options:**

- `http-session`: HttpSession attribute
- `custom-principal`: Custom Principal via request.getUserPrincipal()
- `thread-local`: ThreadLocal or request-scoped holder
- `spring-security-context`: Spring SecurityContextHolder
- `jwt-each-request`: Re-derived from the token on every request
- `other`: Other (describe in Detail)
- `unknown`: Unknown

<!-- answer C-14 -->
Value:
Detail (Class holding the identity and the identifiers it carries: person id, sponsor id, family id, operator id, access levels, site):
Evidence:
Searched:
<!-- /answer -->

### C-15: Per-request credential

**Type:** single choice  
**Applies when:** always  
**Refs:** 6.1, Q5

**How:** What must accompany each backend request after login. Session cookie: server code calls getSession and the frontend sends cookies. Bearer token: an Angular interceptor adds an Authorization header and the server parses it on every request.

**Signals to search:** `JSESSIONID`, `getSession(`, `Authorization`, `Bearer`, `HttpInterceptor`, `withCredentials`, `cookie-name`

**Options:**

- `session-cookie`: Session cookie
- `bearer-jwt`: Bearer token on every request
- `both`: Both
- `none`: None found

<!-- answer C-15 -->
Value:
Evidence:
Searched:
<!-- /answer -->

### C-16: Session cookie flags

**Type:** multiple choice  
**Applies when:** C-15 (Per-request credential) is one of `session-cookie`, `both`  
**Refs:** Q5

**How:** Read web.xml <session-config><cookie-config> for http-only and secure, weblogic.xml <session-descriptor> for cookie-http-only and cookie-secure, and any filter that rewrites Set-Cookie to add SameSite. A flag counts only if it is set to true somewhere you can cite.

**Signals to search:** `<cookie-config>`, `<http-only>`, `<secure>`, `<session-descriptor>`, `cookie-http-only`, `cookie-secure`, `cookie-name`, `SameSite`, `Set-Cookie`

**Options:**

- `http-only`: HttpOnly
- `secure`: Secure
- `samesite`: SameSite
- `none-found`: None found

<!-- answer C-16 -->
Value:
Detail (Where each flag is set: file:line):
Evidence:
Searched:
<!-- /answer -->

### C-17: Frontend JavaScript reads authentication cookies

**Type:** yes/no  
**Applies when:** always  
**Refs:** 6.4, Q11

**How:** Search the frontend source for cookie reads. If JavaScript can read the SSO or session cookie by name, the cookie is not HttpOnly and the token is exposed to any script injection. Record the cookie names and files.

**Signals to search:** `document.cookie`, `CookieService`, `ngx-cookie`, `iPlanetDirectoryPro`, `JSESSIONID`, `getCookie(`

<!-- answer C-17 -->
Value:
Detail (Cookie names and the files that read them):
Evidence:
Searched:
<!-- /answer -->

## Section C: Portal to portlet token handoff

Only for portals and portlets. The token is the only thing that carries identity across the iframe boundary, so its delivery, contents, and validation decide whether a portlet can be driven by a forged identity.

**Applies when:** C-03 (Application type) is one of `portal`, `portlet`. If not met, mark every item in this section `Status: na` with the rule as the reason.

### C-20: Token delivery into the portlet iframe

**Type:** single choice  
**Applies when:** C-03 (Application type) is one of `portal`, `portlet`  
**Refs:** 6.6, Q1

**How:** On the portal side, find where the iframe src is built or where a message is posted to the frame. On the portlet side, find where the token is first read: query string, fragment, message event, cookie, or header. Cite both sides. A query parameter lands in WebLogic access logs, browser history, and Referer headers.

**Signals to search:** `<iframe`, `[src]`, `bypassSecurityTrustResourceUrl`, `token=`, `jwt=`, `postMessage(`, `addEventListener('message'`, `location.hash`, `queryParams`, `HttpParams`, `getParameter("token`, `getHeader(`

**Options:**

- `query-param`: iframe src query parameter
- `url-fragment`: URL fragment
- `postmessage`: window.postMessage
- `shared-domain-cookie`: Cookie on a shared domain
- `proxy-header`: Header injected by a proxy
- `other`: Other (describe in Detail)
- `unknown`: Unknown

<!-- answer C-20 -->
Value:
Detail (Portal side: file:line and portlet side: file:line):
Evidence:
Searched:
<!-- /answer -->

### C-21: Token construct and library

**Type:** single choice  
**Applies when:** C-03 (Application type) is one of `portal`, `portlet`  
**Refs:** 6.6, Q3

**How:** Find the code that creates or parses the token and identify the library and algorithm. Signed means JWS with HMAC or an asymmetric key. Encrypted means JWE. Custom means Cipher or Mac calls outside a JOSE library.

**Signals to search:** `io.jsonwebtoken`, `Jwts.`, `com.auth0.jwt`, `com.nimbusds.jose`, `JWSObject`, `JWEObject`, `signWith(`, `SignatureAlgorithm`, `Cipher.getInstance(`, `SecretKeySpec`, `Mac.getInstance(`, `Base64`

**Options:**

- `jws-hmac`: JWS signed with HMAC (shared secret)
- `jws-asymmetric`: JWS signed with an asymmetric key
- `jwe`: JWE encrypted
- `jws-and-jwe`: Signed and encrypted
- `custom-crypto`: Custom encrypt/decrypt outside a JOSE library
- `unknown`: Unknown

<!-- answer C-21 -->
Value:
Detail (Library, class, and algorithm constant):
Evidence:
Searched:
<!-- /answer -->

### C-22: Token claims

**Type:** table  
**Applies when:** C-03 (Application type) is one of `portal`, `portlet`  
**Refs:** 6.6, Q2

**How:** One row per claim placed in the token. Take the list from the code that builds it on the portal side, or from the code that reads it on the portlet side if the portal is not in this repo.

**Signals to search:** `claim(`, `setClaims`, `withClaim`, `getClaim`, `get("`, `sub`, `exp`, `iss`, `aud`, `familyId`, `sponsorId`, `personId`, `accessLevel`, `appId`, `site`

**Columns:**

- Claim
- Meaning
- Set by (class)
- Portlet uses it for (one of: `identity`, `authorization`, `scope`, `expiry or metadata`, `unused`)

<!-- answer C-22 -->
| Claim | Meaning | Set by (class) | Portlet uses it for |
|---|---|---|---|
|   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-23: Validation performed on the received token

**Type:** multiple choice  
**Applies when:** C-03 (Application type) is one of `portal`, `portlet`; and C-03 (Application type) = `portlet`  
**Refs:** Q3

**How:** Read the parse or verify call and everything around it. Select only what the code demonstrably checks. A library call that verifies the signature does not necessarily check issuer, audience, or expiry unless configured to.

**Signals to search:** `parseClaimsJws`, `verify(`, `requireIssuer`, `requireAudience`, `setSigningKey`, `verifyWith`, `ExpiredJwtException`, `getExpiration`, `getIssuer`, `getAudience`, `getAlgorithm`, `none`

**Options:**

- `signature`: Signature verified
- `exp`: Expiry (exp) enforced
- `nbf`: Not-before (nbf) enforced
- `iss`: Issuer (iss) checked
- `aud-or-app-id`: Audience or application id checked
- `alg-pinned`: Algorithm pinned (rejects none and algorithm switching)
- `jti-replay`: Replay protection (jti or one-time use)
- `none-found`: None found

<!-- answer C-23 -->
Value:
Detail (Class and lines performing each check):
Evidence:
Searched:
<!-- /answer -->

### C-24: Secret or key storage

**Type:** single choice  
**Applies when:** C-03 (Application type) is one of `portal`, `portlet`  
**Refs:** 6.6, Q4

**How:** Find where the signing or encryption key is loaded from. Follow the property key to its source: a properties file inside the WAR, a JNDI lookup, an environment variable, or a literal in source.

**Signals to search:** `secret`, `jwt.key`, `jwtSecret`, `SECRET`, `@Value(`, `getProperty(`, `InitialContext`, `lookup(`, `System.getenv`, `.properties`

**Options:**

- `properties-in-war`: Properties file inside the WAR
- `credential-store-jndi`: WebLogic credential store or JNDI
- `env-var`: Environment variable
- `hardcoded`: Hardcoded in source
- `other`: Other (describe in Detail)
- `unknown`: Unknown

<!-- answer C-24 -->
Value:
Detail (Property key and file):
Evidence:
Searched:
<!-- /answer -->

### C-25: Secret scope

**Type:** single choice  
**Applies when:** C-03 (Application type) is one of `portal`, `portlet`  
**Refs:** Q4

**How:** Is the same key used by every portlet, or does each portlet have its own? A shared library default, or the same property name in multiple applications, indicates fleet-shared.

**Signals to search:** `web-security`, `authagent`, `jwt`, `secret`

**Options:**

- `fleet-shared`: One key shared across the fleet
- `per-portlet`: Per portlet
- `unknown`: Unknown

<!-- answer C-25 -->
Value:
Detail (How this was determined):
Evidence:
Searched:
<!-- /answer -->

### C-26: Session model after token validation

**Type:** single choice  
**Applies when:** C-03 (Application type) is one of `portal`, `portlet`; and C-03 (Application type) = `portlet`  
**Refs:** Q5

**How:** After the token is accepted, does the portlet create an HttpSession and store identity in it, or does every request carry the token again? If a session is created, record what is stored and how the session is tied to the token identity.

**Signals to search:** `getSession(true)`, `setAttribute(`, `invalidate(`, `Bearer`, `HttpInterceptor`

**Options:**

- `creates-http-session`: Creates an HttpSession holding identity
- `stateless`: Stateless: token on every request
- `both`: Both
- `unknown`: Unknown

<!-- answer C-26 -->
Value:
Detail (What is stored and how it is bound to the token identity):
Evidence:
Searched:
<!-- /answer -->

### C-27: Portlet entry guard

**Type:** table  
**Applies when:** C-03 (Application type) is one of `portal`, `portlet`; and C-03 (Application type) = `portlet`  
**Refs:** Q6

**How:** Which filter or guard rejects a request that has no valid token or session? Record its url-patterns and its exclusions. If the portlet can be opened directly in a browser tab without the portal, note what happens.

**Signals to search:** `doFilter(`, `shouldNotFilter`, `sendError(401`, `sendError(403`, `sendRedirect(`, `<filter-mapping>`

**Columns:**

- Guard class
- URL patterns
- Exclusions
- Rejects when

**If empty:** An empty table means no guard was found. Searched must list every filter and configuration file read.

<!-- answer C-27 -->
| Guard class | URL patterns | Exclusions | Rejects when |
|---|---|---|---|
|   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-28: Framing protection

**Type:** single choice  
**Applies when:** C-03 (Application type) is one of `portal`, `portlet`  
**Refs:** Q6

**How:** Find where X-Frame-Options or a Content-Security-Policy frame-ancestors directive is set, in a filter, in Spring Security headers configuration, or in the shared web-security library. Record the value.

**Signals to search:** `X-Frame-Options`, `frame-ancestors`, `Content-Security-Policy`, `addHeader(`, `setHeader(`, `frameOptions`

**Options:**

- `x-frame-options`: X-Frame-Options set
- `csp-frame-ancestors`: CSP frame-ancestors set
- `both`: Both
- `none-found`: None found

<!-- answer C-28 -->
Value:
Detail (Values and where they are set):
Evidence:
Searched:
<!-- /answer -->

### C-29: Where the portal mints the token

**Type:** free text  
**Applies when:** C-03 (Application type) is one of `portal`, `portlet`; and C-03 (Application type) = `portal`  
**Refs:** Q1, Q2

**How:** Record the class and method that builds the token, which fields it copies from the authenticated identity, the expiry it sets, and whether it sets an audience or application id per portlet.

**Signals to search:** `Jwts.builder`, `signWith(`, `setExpiration`, `setAudience`, `setIssuer`, `claim(`

<!-- answer C-29 -->
Value:
Evidence:
Searched:
<!-- /answer -->

## Section D: Authorization and ownership model

State, in one place, what 'allowed to see this record' means for this application, and where that rule is enforced.

### C-30: Ownership model

**Type:** single choice  
**Applies when:** always  
**Refs:** 6.7, 8.2

**How:** State what 'allowed to see this record' means for this application. Beneficiary applications: the caller's family. Operator applications: access levels, a selected site, or both. Derive it from the identifiers carried in C-14 and the claims in C-22, then write the rule as one sentence in Detail.

**Signals to search:** `familyId`, `sponsorId`, `personId`, `accessLevel`, `siteId`, `role`, `permission`, `isInFamily`, `canAccess`

**Options:**

- `beneficiary-family`: Beneficiary: own family only
- `operator-access-level`: Operator: by access level
- `operator-site`: Operator: by selected site
- `mixed`: Mixed (describe in Detail)
- `none-found`: No ownership rule found in code
- `unknown`: Unknown

<!-- answer C-30 -->
Value:
Detail (In one sentence: what does 'allowed to see this record' mean in this application?):
Evidence:
Searched:
<!-- /answer -->

### C-31: Application-level authorization check present

**Type:** yes/no  
**Applies when:** always  
**Refs:** 6.3, Q9, 2

**How:** An application-level check verifies that the caller may use this application at all, for example OperatorAuthorizationFilter checking an App ID. It is not an object-level check. Record the class, the application id, and where it is configured.

**Signals to search:** `OperatorAuthorizationFilter`, `appId`, `APP_ID`, `applicationId`, `740`, `hasAccessToApp`

<!-- answer C-31 -->
Value:
Detail (Class, application id, and configuration location):
Evidence:
Searched:
<!-- /answer -->

### C-32: Object-level scope check pattern

**Type:** single choice  
**Applies when:** always  
**Refs:** 6.7, Q8, 8.5

**How:** Search for the code that compares a requested record to the caller's scope. A single canonical helper is the best case. Ad hoc means each endpoint does its own comparison. Annotation-based means @PreAuthorize or a custom aspect. None found means no comparison exists anywhere, which is itself the incident shape: application-level check present, object-level check absent.

**Signals to search:** `isInFamily`, `inFamily`, `isFamilyMember`, `canAccess`, `hasAccess`, `checkAccess`, `authorize`, `assertOwner`, `belongsTo`, `verifyAccess`, `@PreAuthorize`, `@PostAuthorize`, `@Secured`, `@RolesAllowed`, `@Aspect`

**Options:**

- `canonical-helper`: Single canonical helper, for example isInMyFamily(personId)
- `per-endpoint`: Ad hoc per endpoint
- `annotation`: Annotation or aspect based
- `none-found`: None found
- `unknown`: Unknown

<!-- answer C-32 -->
Value:
Detail (Helper name and location, or examples of the ad hoc pattern):
Evidence:
Searched:
<!-- /answer -->

### C-33: How the caller's scope is established

**Type:** single choice  
**Applies when:** always  
**Refs:** Q8

**How:** Where does the set of records the caller may see come from? A roster fetched at login and kept in the session, a lookup on every request, claims in the token, or nowhere.

**Signals to search:** `getFamily`, `familyMembers`, `roster`, `setAttribute(`, `getClaim`, `loadScope`

**Options:**

- `roster-in-session`: Roster fetched at login and stored in the session
- `per-request-lookup`: Looked up on every request
- `jwt-claims`: Carried in token claims
- `not-established`: Not established anywhere
- `unknown`: Unknown

<!-- answer C-33 -->
Value:
Detail (Class and method that establishes it):
Evidence:
Searched:
<!-- /answer -->

### C-34: Operator access levels and site selection

**Type:** free text  
**Applies when:** C-30 (Ownership model) is one of `operator-access-level`, `operator-site`, `mixed`  
**Refs:** 6.3, Q9, Q10

**How:** List the access levels or roles that appear in code and what each permits. Describe how a site is selected (for example /selectsite), where the selection is stored, and how later requests are constrained to that site on the server side.

**Signals to search:** `/selectsite`, `selectedSite`, `siteId`, `accessLevel`, `AccessLevel`, `Role`, `hasRole`

<!-- answer C-34 -->
Value:
Evidence:
Searched:
<!-- /answer -->

## Section E: HTTP entry points and identifiers

Every handler that can be reached over HTTP, and every identifier a caller can supply. This table is the target of the per-endpoint trace items in the review phase.

### C-40: HTTP entry point types

**Type:** multiple choice  
**Applies when:** always  
**Refs:** Q12

**How:** Select every mechanism through which an HTTP request reaches application code. JSF action methods count as entry points. Spring Boot actuator is out of scope for this review but should be noted.

**Signals to search:** `@RequestMapping`, `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`, `@PatchMapping`, `@Path(`, `@GET`, `@POST`, `<servlet>`, `@WebServlet`, `action="#{`, `actionListener`, `@ServerEndpoint`, `management.endpoints`

**Options:**

- `spring-mvc`: Spring MVC controllers
- `jaxrs`: JAX-RS resources
- `jsf-actions`: JSF managed-bean actions
- `servlets`: Raw servlets
- `websocket`: WebSocket endpoints
- `actuator`: Spring Boot actuator (note only)
- `other`: Other (describe in Detail)

<!-- answer C-40 -->
Value:
Detail (Anything selected as Other):
Evidence:
Searched:
<!-- /answer -->

### C-41: Endpoint inventory

**Type:** table  
**Applies when:** always  
**Refs:** Q12, Q13, 8.3

**How:** One row per handler method reachable over HTTP, from every type selected in C-40. Include JSF action methods (page plus method) and servlet url-patterns. List every identifier the caller can supply in the path, query string, body, or headers, and say what each identifies. Record whether the identifier comes from the request or from the session or token: an id that comes only from the session cannot be tampered with, an id from the request must be checked. This table drives the per-endpoint trace items in the review, so an endpoint missing here is an endpoint never reviewed.

**Signals to search:** `@RequestMapping`, `@GetMapping`, `@PostMapping`, `@PathVariable`, `@RequestParam`, `@RequestBody`, `@Path(`, `@PathParam`, `@QueryParam`, `<url-pattern>`, `getParameter(`, `action="#{`, `f:viewParam`

**Columns:**

- HTTP method(s)
- Path
- Handler class#method
- Public (under a C-12 exclusion) (one of: `yes`, `no`)
- Identifier parameters (name = what it identifies)
- Identifier source (one of: `request`, `session or token`, `both`, `none`)
- Returns data (one of: `yes`, `no`)
- Writes or deletes (one of: `yes`, `no`)

**If empty:** An empty table is only valid for an application with no HTTP handlers. Searched must list every annotation and descriptor searched.

<!-- answer C-41 -->
| HTTP method(s) | Path | Handler class#method | Public (under a C-12 exclusion) | Identifier parameters (name = what it identifies) | Identifier source | Returns data | Writes or deletes |
|---|---|---|---|---|---|---|---|
|   |   |   |   |   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-42: Identifier kinds appearing in requests

**Type:** multiple choice  
**Applies when:** always  
**Refs:** 2, Q13

**How:** From the C-41 identifier column, classify the identifiers. Sequential numeric database keys are the easiest to enumerate; note the format in Detail.

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

<!-- answer C-42 -->
Value:
Detail (Format notes: sequential numeric, guessable, base64 of an id, and so on):
Evidence:
Searched:
<!-- /answer -->

## Section F: Data access and outbound services

Every way data enters or leaves the application. Backend services are treated as returning whatever they are asked for, so every outbound call is a place where scope must already have been enforced.

### C-50: Data access mechanisms

**Type:** multiple choice  
**Applies when:** always  
**Refs:** 6.8

**How:** Select every mechanism through which this application reads or writes data. Check the POM as well as the code: a dependency with no usage is not a mechanism, and a usage without a dependency is a shared library.

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

<!-- answer C-50 -->
Value:
Detail (Anything selected as Other):
Evidence:
Searched:
<!-- /answer -->

### C-51: Outbound service calls

**Type:** table  
**Applies when:** always  
**Refs:** 6.8, 6.9, Q14

**How:** One row per backend service this application calls. Record which identifier is sent and whether any caller-scope information (family, site, operator) travels with the request. Backend services do not enforce scope, so each row is a place where scope must have been enforced before the call.

**Signals to search:** `RestTemplate`, `WebClient`, `HttpClient`, `@WebServiceClient`, `@FeignClient`, `baseUrl`, `.url`, `endpoint`, `getForObject`, `postForObject`, `exchange(`

**Columns:**

- Service
- Base URL or property key
- Client class
- Operations used
- Identifier passed
- Caller scope passed (one of: `yes`, `no`, `unknown`)

**If empty:** An empty table must be justified in Searched: list the client classes and property files searched.

<!-- answer C-51 -->
| Service | Base URL or property key | Client class | Operations used | Identifier passed | Caller scope passed |
|---|---|---|---|---|---|
|   |   |   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-52: CUF request identity and scope

**Type:** free text  
**Applies when:** C-50 (Data access mechanisms) includes `cuf`  
**Refs:** 6.8, Q14

**How:** What identifies a record in a CUF request (person id, sponsor id, family id, something else)? Does any CUF request carry the caller's scope, or does CUF return whatever id it is asked for? Cite the request builder.

**Signals to search:** `Cuf`, `CufRequest`, `appId`, `personId`, `sponsorId`

<!-- answer C-52 -->
Value:
Evidence:
Searched:
<!-- /answer -->

### C-53: Direct database access points

**Type:** table  
**Applies when:** C-50 (Data access mechanisms) includes any of `jpa-hibernate`, `jdbctemplate`, `stored-procedures`, `mybatis`  
**Refs:** Q15

**How:** One row per query, repository method, or stored procedure call that takes an identifier. Record which identifier is in the WHERE clause and whether the WHERE clause also constrains the result to the caller's scope (for example AND family_id = ?).

**Signals to search:** `@Query`, `createQuery`, `createNativeQuery`, `findById`, `JdbcTemplate.query`, `queryForObject`, `CallableStatement`, `{call `, `<select`, `SqlSession`

**Columns:**

- Class#method (file:line)
- Query or procedure
- Identifier in WHERE
- Scope constraint in WHERE (one of: `yes`, `no`, `unknown`)

<!-- answer C-53 -->
| Class#method (file:line) | Query or procedure | Identifier in WHERE | Scope constraint in WHERE |
|---|---|---|---|
|   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

## Section G: Files, documents, and uploads

The incident class. Any handler that turns an identifier into bytes is reviewed in its own section.

### C-60: Serves files or documents by identifier

**Type:** yes/no  
**Applies when:** always  
**Refs:** 2, Q16

**How:** Search Java and descriptors for anything that streams bytes to the response: content-disposition headers, binary media types, stream or byte-array return types, raw output streams, and servlet mappings for document paths. Also search the frontend for download links, since they point at the backend URL. This is the DWP incident shape. A 'no' answer switches off the file-serving review section, so the Searched field must list every signal and directory.

**Signals to search:** `Content-Disposition`, `application/octet-stream`, `application/pdf`, `InputStreamResource`, `StreamingResponseBody`, `StreamingOutput`, `getOutputStream(`, `ServletOutputStream`, `ResponseEntity<byte[]>`, `ResponseEntity<Resource>`, `byte[]`, `@Produces`, `*.pdf`, `/download`, `/export`, `/attachment`, `/document`, `/report`, `window.open(`, `download=`

<!-- answer C-60 -->
Value:
Evidence:
Searched:
<!-- /answer -->

### C-61: File-serving handlers

**Type:** table  
**Applies when:** C-60 (Serves files or documents by identifier) = `yes`  
**Refs:** 2, Q16

**How:** One row per handler that returns bytes. Record the identifier parameter, where the bytes come from, whether the handler is under a C-12 exclusion, and where (if anywhere) the identifier is checked against the caller's scope before the bytes are read.

**Signals to search:** `Content-Disposition`, `getOutputStream(`, `InputStreamResource`, `byte[]`

**Columns:**

- Handler class#method
- URL
- Identifier parameter
- Byte source (one of: `file system`, `service call`, `database blob`, `generated`, `other`)
- Public (one of: `yes`, `no`)
- Scope check location, or none

<!-- answer C-61 -->
| Handler class#method | URL | Identifier parameter | Byte source | Public | Scope check location, or none |
|---|---|---|---|---|---|
|   |   |   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-62: Accepts file uploads

**Type:** yes/no  
**Applies when:** always  
**Refs:** 7, 8.7

**How:** Search for multipart handling. An upload that attaches a file to a record identified by a request parameter is the write-side twin of file serving.

**Signals to search:** `MultipartFile`, `@FormDataParam`, `javax.servlet.http.Part`, `getPart(`, `<multipart-config>`, `CommonsMultipartResolver`, `MultipartResolver`, `FormData`

<!-- answer C-62 -->
Value:
Evidence:
Searched:
<!-- /answer -->

### C-63: Upload handlers

**Type:** table  
**Applies when:** C-62 (Accepts file uploads) = `yes`  
**Refs:** 8.7

**How:** One row per upload handler. Record which record the upload attaches to, where that record's identifier comes from, and where the bytes are stored.

**Signals to search:** `MultipartFile`, `@FormDataParam`, `getPart(`

**Columns:**

- Handler class#method
- URL
- Record the upload attaches to
- Identifier source (one of: `request`, `session or token`, `both`, `none`)
- Where bytes are stored

<!-- answer C-63 -->
| Handler class#method | URL | Record the upload attaches to | Identifier source | Where bytes are stored |
|---|---|---|---|---|
|   |   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

## Section H: Responses, binding, headers, and static content

How response objects are built, how request bodies are bound, and what the container exposes on its own.

### C-70: Response serialization style

**Type:** single choice  
**Applies when:** always  
**Refs:** 7, Q20

**How:** Look at what @ResponseBody and JAX-RS methods return. Entities or CUF response objects serialized wholesale expose every field they carry. DTOs mapped by hand or by a mapper expose only what was copied. Note any @JsonIgnore, @JsonView, or access-restricted properties in use.

**Signals to search:** `@ResponseBody`, `ResponseEntity<`, `@JsonIgnore`, `@JsonView`, `@JsonProperty`, `@JsonIgnoreProperties`, `MapStruct`, `ModelMapper`, `BeanUtils.copyProperties`, `Dto`, `DTO`

**Options:**

- `entities-wholesale`: Entities or CUF objects serialized wholesale
- `dto-mapped`: DTOs mapped from domain objects
- `mixed`: Mixed (describe in Detail)
- `unknown`: Unknown

<!-- answer C-70 -->
Value:
Detail (Examples, and any @JsonIgnore or @JsonView usage):
Evidence:
Searched:
<!-- /answer -->

### C-71: Request binding styles present

**Type:** multiple choice  
**Applies when:** always  
**Refs:** 7, Q21, 8.7

**How:** How request bodies and form fields become Java objects. Binding straight onto a domain, entity, or CUF object lets the client set any field the object has, including ones the UI never shows.

**Signals to search:** `@RequestBody`, `@ModelAttribute`, `@BeanParam`, `@FormParam`, `getParameter(`, `<h:inputText`, `value="#{`

**Options:**

- `requestbody-domain`: @RequestBody onto a domain, entity, or CUF object
- `requestbody-dto`: @RequestBody onto a DTO or command object
- `modelattribute`: @ModelAttribute form binding
- `beanparam`: JAX-RS @BeanParam or @FormParam
- `jsf-properties`: JSF managed-bean properties bound from forms
- `getparameter`: Manual request.getParameter
- `none-found`: None found (no writes)

<!-- answer C-71 -->
Value:
Detail (Examples with file:line):
Evidence:
Searched:
<!-- /answer -->

### C-72: Binding allow-list mechanisms

**Type:** multiple choice  
**Applies when:** always  
**Refs:** Q21

**How:** Anything that limits which fields a request can set. Record where each is applied and whether it is global or per controller.

**Signals to search:** `@InitBinder`, `setAllowedFields`, `setDisallowedFields`, `READ_ONLY`, `allowSetters`, `allowGetters`, `@JsonIgnoreProperties`

**Options:**

- `initbinder-allowed`: @InitBinder setAllowedFields
- `initbinder-disallowed`: @InitBinder setDisallowedFields
- `jsonignore-setters`: @JsonIgnoreProperties or @JsonProperty(access = READ_ONLY)
- `dto-only`: DTOs carrying only the intended fields
- `none-found`: None found

<!-- answer C-72 -->
Value:
Detail (Where applied, global or per controller):
Evidence:
Searched:
<!-- /answer -->

### C-73: Cache-Control on authenticated responses

**Type:** single choice  
**Applies when:** always  
**Refs:** 7, Q22

**How:** Find where Cache-Control, Pragma, or Expires headers are set for dynamic responses: a filter, Spring Security headers configuration, the shared web-security library, or individual handlers.

**Signals to search:** `Cache-Control`, `no-store`, `no-cache`, `Pragma`, `Expires`, `CacheControl.noStore`, `HeaderWriter`, `cacheControl()`, `setHeader(`

**Options:**

- `global-filter`: Global filter or header writer sets no-store
- `per-endpoint`: Set per endpoint only
- `none-found`: None found
- `unknown`: Unknown

<!-- answer C-73 -->
Value:
Detail (Where set and the header value):
Evidence:
Searched:
<!-- /answer -->

### C-74: Directory listing setting

**Type:** single choice  
**Applies when:** always  
**Refs:** 7, Q23

**How:** Read weblogic.xml for index-directory-enabled inside container-descriptor. If the element is absent, the WebLogic default applies (disabled on current versions, but record that it is not set).

**Signals to search:** `index-directory-enabled`, `<container-descriptor>`, `weblogic.xml`, `<welcome-file-list>`

**Options:**

- `disabled-explicit`: Explicitly disabled
- `enabled-explicit`: Explicitly enabled
- `not-set-default`: Not set (container default)
- `no-weblogic-xml`: No weblogic.xml present

<!-- answer C-74 -->
Value:
Evidence:
Searched:
<!-- /answer -->

### C-75: Static resource handlers and roots

**Type:** table  
**Applies when:** always  
**Refs:** Q23

**How:** One row per static resource mapping: Spring resource handlers, the container default servlet, and any explicit servlet mapping onto a directory. Record the root each one exposes and whether anything beyond frontend assets lives under it.

**Signals to search:** `addResourceHandlers`, `<mvc:resources`, `ResourceHttpRequestHandler`, `spring.resources`, `spring.web.resources`, `static-locations`, `<servlet-mapping>`, `default`

**Columns:**

- Configured at (file:line)
- URL pattern
- Filesystem or classpath root
- Anything beyond frontend assets (one of: `yes`, `no`, `unknown`)

<!-- answer C-75 -->
| Configured at (file:line) | URL pattern | Filesystem or classpath root | Anything beyond frontend assets |
|---|---|---|---|
|   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

## Section I: Fortify artifacts

Suppressions and wrappers that make Fortify pass without fixing the underlying issue.

### C-80: Fortify artifacts checked into the repository

**Type:** yes/no  
**Applies when:** always  
**Refs:** 7, Q24

**How:** Search for Fortify result files, filter files, scan properties, suppression annotations, and comments that mention Fortify next to code.

**Signals to search:** `.fpr`, `.filter`, `filtertemplate`, `fortify-sca.properties`, `fortify`, `Fortify`, `FORTIFY`, `@SuppressWarnings`, `NotAnIssue`, `audit`

<!-- answer C-80 -->
Value:
Evidence:
Searched:
<!-- /answer -->

### C-81: Fortify artifacts

**Type:** table  
**Applies when:** C-80 (Fortify artifacts checked into the repository) = `yes`  
**Refs:** Q24

**How:** One row per artifact. Say what each one suppresses or excludes.

**Signals to search:** `.fpr`, `.filter`, `Fortify`

**Columns:**

- Path
- Kind (one of: `fpr`, `filter file`, `suppression annotation`, `comment`, `properties`, `other`)
- What it suppresses or excludes

<!-- answer C-81 -->
| Path | Kind | What it suppresses or excludes |
|---|---|---|
|   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-82: Candidate taint-breaking wrappers

**Type:** yes/no  
**Applies when:** always  
**Refs:** 7, Q25

**How:** Find methods whose names suggest validation, sanitization, or encoding, and read their bodies. Candidates: the method returns its argument unchanged; it copies the value through String.valueOf, new String, toString, substring(0), String.format with %s, or a StringBuilder; it checks a regex that matches everything; or it is an encoder that does not encode. A Fortify comment nearby is a strong signal.

**Signals to search:** `sanitize`, `sanitise`, `validate`, `clean`, `escape`, `encode`, `safe`, `String.valueOf(`, `new String(`, `.toString()`, `.substring(0`, `String.format("%s"`, `StringBuilder`, `ESAPI`, `Fortify`

<!-- answer C-82 -->
Value:
Evidence:
Searched:
<!-- /answer -->

### C-83: Taint-breaking wrapper candidates

**Type:** table  
**Applies when:** C-82 (Candidate taint-breaking wrappers) = `yes`  
**Refs:** Q25

**How:** One row per candidate method. The review phase judges each one; here only enumerate.

**Signals to search:** `sanitize`, `validate`, `String.valueOf(`

**Columns:**

- Class#method (file:line)
- Pattern (one of: `returns input`, `string copy`, `permissive regex`, `no-op encoder`, `other`)
- Called from

<!-- answer C-83 -->
| Class#method (file:line) | Pattern | Called from |
|---|---|---|
|   |   |   |

Evidence:
Searched:
<!-- /answer -->

## Section J: JSF specifics

JSF holds record identifiers in managed beans and view state, which gives it its own IDOR shapes.

**Applies when:** C-04 (Backend frameworks present) includes `jsf`. If not met, mark every item in this section `Status: na` with the rule as the reason.

### C-90: JSF pages and backing beans

**Type:** table  
**Applies when:** C-04 (Backend frameworks present) includes `jsf`  
**Refs:** 6.2, Q31

**How:** One row per page and backing bean pair. Record the bean scope, which record identifiers the bean holds, and how those identifiers are loaded: a view parameter or f:param comes from the request and can be tampered with; a session attribute cannot.

**Signals to search:** `@ManagedBean`, `@Named`, `@SessionScoped`, `@ViewScoped`, `@RequestScoped`, `f:viewParam`, `f:param`, `f:metadata`, `faces-config.xml`, `managed-bean`, `.xhtml`, `.jspx`

**Columns:**

- Page
- Bean class
- Bean scope (one of: `request`, `view`, `session`, `application`, `other`)
- Record identifiers held
- Identifiers loaded from (one of: `view param`, `f:param`, `session`, `other`)

<!-- answer C-90 -->
| Page | Bean class | Bean scope | Record identifiers held | Identifiers loaded from |
|---|---|---|---|---|
|   |   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-91: ViewState protection

**Type:** single choice  
**Applies when:** C-04 (Backend frameworks present) includes `jsf`  
**Refs:** Q31

**How:** Read web.xml for javax.faces.STATE_SAVING_METHOD. Client-side state is sent to the browser and must be encrypted; check for the implementation's secret key parameter.

**Signals to search:** `javax.faces.STATE_SAVING_METHOD`, `ClientSideSecretKey`, `org.apache.myfaces.SECRET`, `com.sun.faces.ClientStateSavingPassword`

**Options:**

- `server-side`: Server-side state saving
- `client-encrypted`: Client-side, encrypted
- `client-unencrypted`: Client-side, not encrypted
- `unknown`: Unknown

<!-- answer C-91 -->
Value:
Evidence:
Searched:
<!-- /answer -->

## Section K: Fleet defaults to confirm

Facts believed true fleet-wide. Confirm or override for this application with evidence.

### C-95: Enterprise shared libraries in the POM

**Type:** table  
**Applies when:** always  
**Refs:** 6.1, 6.3, Q26

**How:** One row per enterprise or shared-library dependency. These are where authentication filters, token handling, and header filters usually live, so they determine which checks apply. Record the version and scope.

**Signals to search:** `mil.osd.dmdc`, `web-security`, `authagent`, `enterprise`, `<scope>provided</scope>`

**Columns:**

- groupId:artifactId
- Version
- Scope
- What it provides here

<!-- answer C-95 -->
| groupId:artifactId | Version | Scope | What it provides here |
|---|---|---|---|
|   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

### C-96: CUF is the main data path

**Type:** yes/no  
**Applies when:** always  
**Refs:** 6.8

**Fleet default:** `yes`. Confirm or override with evidence.

**How:** Fleet default: yes. Confirm against C-50 and C-51. Override if this application reaches its main data some other way.

**Signals to search:** `Cuf`, `CUF`

<!-- answer C-96 -->
Value:
Evidence:
Searched:
<!-- /answer -->

### C-97: Backend services are called without authentication

**Type:** yes/no  
**Applies when:** always  
**Refs:** 6.9

**Fleet default:** `yes`. Confirm or override with evidence.

**How:** Fleet default: yes. Look at the outbound client code in C-51 for any credential, token, or certificate. If none, confirm. Consequence: this web tier is the only place object-level authorization can be enforced.

**Signals to search:** `Authorization`, `setBasicAuth`, `KeyStore`, `SSLContext`, `Bearer`, `apiKey`

<!-- answer C-97 -->
Value:
Evidence:
Searched:
<!-- /answer -->

### C-98: Deployed to WebLogic

**Type:** yes/no  
**Applies when:** always  
**Refs:** 6.10

**Fleet default:** `yes`. Confirm or override with evidence.

**How:** Fleet default: yes. Confirm from weblogic.xml or weblogic-application.xml and record the version namespace.

**Signals to search:** `weblogic.xml`, `weblogic-application.xml`, `weblogic-version`, `wls:`

<!-- answer C-98 -->
Value:
Detail (WebLogic version from the descriptor namespace):
Evidence:
Searched:
<!-- /answer -->

## Section Z: Issues found

Anything noticed while profiling that looks like a problem, whether or not an item asked about it. This is not the review phase: record what was seen, do not go hunting yet.

### F-01: Issues found while profiling

**Type:** table  
**Applies when:** always  
**Refs:** 3, 4

**How:** One row per issue. Cite the location as file:line or as a URL. Name the item that led you to it where there is one. Severity: high when a caller can reach another user's data with no check in the way; medium when exposure needs a second condition; low for hardening; not sure otherwise. Leave the table empty if nothing was noticed.

**Columns:**

- Location (file:line or URL)
- What is wrong
- Related item
- Severity (one of: `high`, `medium`, `low`, `not sure`)

**Optional:** an empty table is acceptable here and needs no Searched record.

<!-- answer F-01 -->
| Location (file:line or URL) | What is wrong | Related item | Severity |
|---|---|---|---|
|   |   |   |   |

Evidence:
Searched:
<!-- /answer -->

## Profile self-check

(List any item you could not complete and why.)

## Appendix A: the linter

Copy everything inside the fence below, exactly as written, into a file named `profile-lint.js` in the same folder as this document. See Step 0 at the top for how to use it. It reads the rules from the hidden `lint-schema` comment near the top of this document, so do not remove that comment.

````javascript
#!/usr/bin/env node
'use strict';
// profile-lint.js: checks a filled checklist Markdown document. Generated by build.js;
// the same engine as md2json.js. No dependencies. Usage:
//   node profile-lint.js <filled.md>                  report problems (exit 1 if any)
//   node profile-lint.js <filled.md> --json out.json  also write the result JSON

var TICK3 = new RegExp('`{3}[\\s\\S]*?`{3}', 'g');
var LABEL_RE = /^(Status|Reason|Value|Detail(?:\s*\([^)]*\))?|Evidence|Searched|Location|Findings|Why no more findings|Application|Reviewer)\s*:\s*(.*)$/;
var CITATION_RE = /[\w\/.\\-]+\.(java|ts|js|xml|properties|ya?ml|json|html?|jspx?|xhtml|sql|txt|gradle|md)(:\d+)?/i;
function has(s) { return !!(s && String(s).trim()); }
function stripFences(md) { return md.replace(TICK3, ''); }
function schemaFromDefinition(def) {
  return {
    id: def.id,
    version: def.version,
    title: def.title,
    negativeValues: def.negativeValues || [],
    sections: def.sections.map(function (s) { return { id: s.id, title: s.title, when: s.when }; }),
    items: def.items.map(function (it) {
      return {
        id: it.id, section: it.section, type: it.type, title: it.title,
        options: it.options ? it.options.map(function (o) { return o.value; }) : undefined,
        columns: it.columns ? it.columns.map(function (c) { return { key: c.key, label: c.label }; }) : undefined,
        when: it.when, default: it.default,
        detail: !!it.detail, emptyRequires: !!it.emptyRequires,
        optional: it.optional ? true : undefined, findings: it.findings ? true : undefined,
        negativeValues: it.negativeValues
      };
    })
  };
}
function extractSchema(md) {
  var m = stripFences(md).match(/<!--\s*lint-schema\s*\r?\n([\s\S]*?)\r?\n-->/);
  if (!m) return null;
  return JSON.parse(m[1]);
}
function parseBody(body) {
  var lines = body.split(/\r?\n/);
  var fields = {};
  var table = null;
  var current = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/\s+$/, '');
    if (/^\|.*\|$/.test(line)) { current = null; table = table || []; table.push(line); continue; }
    var lm = line.match(LABEL_RE);
    if (lm) {
      current = lm[1].replace(/\s*\(.*\)$/, '').toLowerCase().replace(/ /g, '_');
      fields[current] = lm[2];
      continue;
    }
    if (current && line.trim() !== '') fields[current] += (fields[current] ? '\n' : '') + line;
  }
  Object.keys(fields).forEach(function (k) { fields[k] = fields[k].trim(); });
  return { fields: fields, table: table };
}
function splitCells(line) {
  var s = line.replace(/^\|/, '').replace(/\|$/, '');
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
function parseTable(lines) {
  if (!lines || lines.length < 2) return [];
  var rows = [];
  for (var i = 2; i < lines.length; i++) {
    var cells = splitCells(lines[i]);
    if (cells.every(function (x) { return x === ''; })) continue;
    rows.push(cells);
  }
  return rows;
}
function parseAnswers(md) {
  var scan = stripFences(md);
  var re = /<!--\s*answer\s+([A-Za-z0-9-]+)(?:\s+row=(\d+))?\s*-->([\s\S]*?)<!--\s*\/answer\s*-->/g;
  var blocks = {}, duplicates = [];
  var m;
  while ((m = re.exec(scan)) !== null) {
    var id = m[1];
    var row = m[2] !== undefined ? Number(m[2]) : null;
    var parsed = parseBody(m[3]);
    if (row === null) {
      if (blocks[id] && !blocks[id].perRow) duplicates.push(id);
      blocks[id] = parsed;
    } else {
      blocks[id] = blocks[id] || {};
      blocks[id].perRow = blocks[id].perRow || [];
      blocks[id].perRow.push(Object.assign({ row: row }, parsed));
    }
  }
  var opens = (scan.match(/<!--\s*answer\s+/g) || []).length;
  var closes = (scan.match(/<!--\s*\/answer\s*-->/g) || []).length;
  return { blocks: blocks, duplicates: duplicates, unbalanced: opens !== closes };
}
function lint(md, schema, opts) {
  opts = opts || {};
  var NEG = schema.negativeValues || [];
  var itemsById = {}, sectionsById = {};
  schema.items.forEach(function (it) { itemsById[it.id] = it; });
  schema.sections.forEach(function (s) { sectionsById[s.id] = s; });
  var problems = [], warnings = [];
  var parsed = parseAnswers(md);
  var blocks = parsed.blocks;
  if (parsed.unbalanced) problems.push('DOC: an answer block is not closed (an <!-- answer --> without a matching <!-- /answer -->)');
  parsed.duplicates.forEach(function (id) { problems.push(id + ': answer block appears more than once'); });
  Object.keys(blocks).forEach(function (id) { if (id !== 'META' && !itemsById[id]) warnings.push(id + ': answer block for an id that is not in this checklist'); });
  var meta = blocks.META ? blocks.META.fields : {};
  var result = {
    checklist: schema.id,
    version: schema.version,
    title: schema.title,
    app: opts.app || meta.application || '',
    reviewer: opts.reviewer || meta.reviewer || 'ai',
    reviewerKind: 'ai',
    exportedAt: new Date().toISOString(),
    source: opts.source || '',
    answers: {}
  };
  if (!has(result.app)) problems.push('META: Application is empty');
  schema.items.forEach(function (it) {
    var b = blocks[it.id];
    if (!b) { result.answers[it.id] = { status: 'missing' }; return; }
    var f = b.fields;
    if ((f.status || '').toLowerCase().replace(/[^a-z]/g, '') === 'na') { result.answers[it.id] = { status: 'na', reason: f.reason || '' }; return; }
    var rec = {};
    if (it.type === 'list') {
      var raw = parseTable(b.table);
      rec.rows = raw.map(function (cells, idx) {
        if (cells.length > it.columns.length) problems.push(it.id + ': table row ' + (idx + 1) + ' has ' + cells.length + ' cells but the table has ' + it.columns.length + ' columns (escape a | inside a cell as \\|)');
        else if (cells.length < it.columns.length) warnings.push(it.id + ': table row ' + (idx + 1) + ' has only ' + cells.length + ' of ' + it.columns.length + ' cells');
        var row = {};
        it.columns.forEach(function (c, i) { row[c.key] = cells[i] || ''; });
        return row;
      });
    } else if (it.type === 'multiselect') {
      rec.value = (f.value || '').split(/[,\n]/).map(function (s) { return clean(s); }).filter(Boolean);
    } else if (it.type === 'text') {
      rec.value = f.value || '';
    } else {
      rec.value = clean(f.value || '').toLowerCase() || null;
    }
    if (it.detail) rec.detail = f.detail || '';
    rec.evidence = f.evidence || '';
    rec.searched = f.searched || '';
    result.answers[it.id] = rec;
  });
  function clean(s) { return s.trim().replace(/^`+|`+$/g, '').replace(/\.$/, '').trim(); }
  function liveValue(id) { var r = result.answers[id]; return r && !r.status ? r.value : undefined; }
  function liveRows(id) { var r = result.answers[id]; return r && r.rows ? r.rows : []; }
  var applCache = {};
  function evalCond(c) {
    if (!c) return true;
    if (c.all) return c.all.every(evalCond);
    if (c.any) return c.any.some(evalCond);
    if (c.not) return !evalCond(c.not);
    var item = itemsById[c.q];
    if (!item || !applicable(item)) return false;
    var v = liveValue(c.q);
    if (Object.prototype.hasOwnProperty.call(c, 'eq')) return v === c.eq;
    if (c.in) return c.in.indexOf(v) >= 0;
    if (c.includes) return Array.isArray(v) && v.indexOf(c.includes) >= 0;
    if (c.includesAny) return Array.isArray(v) && c.includesAny.some(function (x) { return v.indexOf(x) >= 0; });
    if (c.notEmpty) return item.type === 'list' ? liveRows(c.q).length > 0 : has(v);
    return false;
  }
  function applicable(it) {
    if (Object.prototype.hasOwnProperty.call(applCache, it.id)) return applCache[it.id];
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
    if (Object.prototype.hasOwnProperty.call(c, 'eq')) return name + ' = ' + c.eq;
    if (c.in) return name + ' is one of ' + c.in.join(', ');
    if (c.includes) return name + ' includes ' + c.includes;
    if (c.includesAny) return name + ' includes any of ' + c.includesAny.join(', ');
    if (c.notEmpty) return name + ' has at least one row';
    return JSON.stringify(c);
  }
  function ruleText(it) {
    var parts = [];
    var sec = sectionsById[it.section];
    if (sec && sec.when) parts.push(condText(sec.when));
    if (it.when) parts.push(condText(it.when));
    return parts.join('; and ');
  }
  var summary = { items: schema.items.length, complete: 0, incomplete: 0, na: 0, inferredNa: 0, missing: 0 };
  function answered(it, rec) {
    if (it.type === 'list') return rec.rows.length > 0;
    if (it.type === 'multiselect') return rec.value.length > 0;
    return has(rec.value);
  }
  function isComplete(it, rec, isAnswered) {
    var ok = true;
    var neg = NEG.concat(it.negativeValues || []);
    if (it.type !== 'list' && it.type !== 'text' && isAnswered) {
      var allowed = it.type === 'yesno' ? ['yes', 'no'] : it.options;
      var bad = (Array.isArray(rec.value) ? rec.value : [rec.value]).filter(function (v) { return allowed.indexOf(v) < 0; });
      if (bad.length) { problems.push(it.id + ': value "' + bad.join('", "') + '" is not one of ' + allowed.join(', ')); ok = false; }
    }
    if (!isAnswered && !(it.type === 'list' && has(rec.searched))) { problems.push(it.id + ': not answered'); return false; }
    var isNeg = it.type === 'list' ? rec.rows.length === 0
      : (Array.isArray(rec.value) ? rec.value.some(function (v) { return neg.indexOf(v) >= 0; }) : neg.indexOf(rec.value) >= 0);
    if (isNeg && !has(rec.searched)) { problems.push(it.id + ': negative answer without a Searched record listing the signals and directories searched'); ok = false; }
    if (it.default !== undefined && !has(rec.evidence)) { problems.push(it.id + ': fleet default not confirmed with evidence'); ok = false; }
    if (!has(rec.evidence) && !(isNeg && has(rec.searched))) { problems.push(it.id + ': no evidence cited'); ok = false; }
    else if (has(rec.evidence) && !CITATION_RE.test(rec.evidence)) warnings.push(it.id + ': Evidence does not cite a file (expected path:line)');
    return ok;
  }
  schema.items.forEach(function (it) {
    var rec = result.answers[it.id];
    var on = applicable(it);
    if (rec.status === 'missing') {
      if (on) { problems.push(it.id + ': no answer block found'); summary.missing++; }
      else { result.answers[it.id] = { status: 'na', reason: 'rule: ' + ruleText(it), inferred: true }; summary.na++; summary.inferredNa++; }
      return;
    }
    if (rec.status === 'na') {
      if (on) { problems.push(it.id + ': marked na, but its rule (' + ruleText(it) + ') is met by the answers above it'); summary.incomplete++; }
      else summary.na++;
      return;
    }
    var isAnswered = answered(it, rec);
    if (it.optional && !isAnswered) { rec.complete = true; summary.complete++; return; }
    if (!on) {
      if (isAnswered) { warnings.push(it.id + ': answered although its rule (' + ruleText(it) + ') is not met; kept, but check the rule'); summary.complete++; rec.complete = true; }
      else { result.answers[it.id] = { status: 'na', reason: 'rule: ' + ruleText(it), inferred: true }; summary.na++; summary.inferredNa++; }
      return;
    }
    rec.complete = isComplete(it, rec, isAnswered);
    if (rec.complete) summary.complete++; else summary.incomplete++;
  });
  result.findings = [];
  schema.items.forEach(function (it) {
    var r = result.answers[it.id];
    if (it.findings && r && r.rows) r.rows.forEach(function (row) { result.findings.push(Object.assign({ item: it.id }, row)); });
  });
  return { result: result, problems: problems, warnings: warnings, summary: summary };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { schemaFromDefinition: schemaFromDefinition, extractSchema: extractSchema, parseAnswers: parseAnswers, lint: lint };
}

function runCli(core, argv, defaults) {
  var fs = require('fs');
  var path = require('path');
  defaults = defaults || {};
  var file = argv.filter(function (a) { return a.indexOf('--') !== 0; })[0];
  var flag = function (name) { return argv.indexOf('--' + name) >= 0; };
  var opt = function (name) { var i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : undefined; };
  if (!file) {
    console.error('usage: node ' + path.basename(process.argv[1]) + ' <filled.md> [--json result.json] [--print-json] [--app name] [--reviewer name] [--definition definitions/profile.json]');
    process.exit(2);
  }
  var md = fs.readFileSync(file, 'utf8');
  var schema = core.extractSchema(md);
  if (!schema && opt('definition')) schema = core.schemaFromDefinition(JSON.parse(fs.readFileSync(opt('definition'), 'utf8')));
  if (!schema) {
    console.error('No <!-- lint-schema --> comment found in ' + file + ' and no --definition given. Do not remove the schema comment from the document.');
    process.exit(2);
  }
  var out = core.lint(md, schema, { app: opt('app'), reviewer: opt('reviewer'), source: path.basename(file) });
  var printJson = flag('print-json') || (defaults.output === 'json' && !opt('json'));
  var report = [];
  var s = out.summary;
  report.push('Checklist ' + schema.id + ' v' + schema.version + ' in ' + path.basename(file) + (out.result.app ? ' for ' + out.result.app : ''));
  report.push('Items: ' + s.items + '. Complete: ' + s.complete + '. Incomplete: ' + s.incomplete + '. Not applicable: ' + s.na + (s.inferredNa ? ' (' + s.inferredNa + ' inferred from the rules)' : '') + '. Missing: ' + s.missing + '.');
  if (out.problems.length) {
    report.push('');
    report.push(out.problems.length + ' problem(s) to fix:');
    out.problems.forEach(function (p) { report.push('  ' + p); });
  }
  if (out.warnings.length) {
    report.push('');
    report.push(out.warnings.length + ' warning(s):');
    out.warnings.forEach(function (w) { report.push('  ' + w); });
  }
  report.push('');
  report.push(out.problems.length ? 'RESULT: not done. Fix the problems above and run the linter again.' : 'RESULT: no problems. The linter checks form, not truth; re-read your answers once more.');
  if (opt('json')) {
    fs.writeFileSync(opt('json'), JSON.stringify(out.result, null, 2) + '\n');
    report.push('Wrote ' + opt('json'));
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

runCli({ schemaFromDefinition: schemaFromDefinition, extractSchema: extractSchema, parseAnswers: parseAnswers, lint: lint }, process.argv.slice(2), { output: 'report' });

````
