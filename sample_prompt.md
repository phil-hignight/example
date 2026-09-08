# Web Application Security Review: Phase 1, Application Profile (AI reviewer)

Checklist `web-idor-review` version 0.1.0, phase `profile`. Generated from `definitions/profile.json`; do not edit outside the answer blocks.

## Your task

You are performing a static security profile of the web application whose source code is open in this project. This document is the profile checklist. Fill it in completely, in place, by editing the answer blocks. Do not restructure, renumber, or delete anything outside the answer blocks.

The profile exists because of an incident in another application: a numeric identifier in a download URL could be changed to fetch another user's file. The application confirmed the caller was logged in and confirmed the caller was allowed to use the application, but never confirmed the caller was allowed to see that particular file. Static scanners and code reviews both missed it, because whether user A may see record 1002 is a question about the application's data-ownership rules, not about syntax. Your answers here establish those rules and select which review checks apply to this application. The review phase, in a separate document, depends on this profile being complete and correct.

## Step 0: set up the linter before anything else

Appendix A at the end of this document contains a small Node script that checks this document: every answer block present, values within each item's option list, negative answers backed by a `Searched:` record, and `Status: na` used only where the branching rules allow it. It reads its rules from the hidden `lint-schema` comment near the top of this document, so it needs nothing else.

1. If a file named `checklist-lint.js` already sits next to this document, use it. Otherwise create it by copying the script from Appendix A, exactly as written, in a single write. Do not retype or abbreviate any part of it.
2. Run it against this document: `node checklist-lint.js <this document's file name>`. Before you have answered anything it should report every item as not answered. If it reports a syntax error, your copy differs from Appendix A: recopy it. If the script cannot be run in your environment at all, write that in the self-check section at the end and continue without it.
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
{"id":"web-idor-review","version":"0.1.0","title":"Web Application Security Review","lintPhase":"profile","negativeValues":["no","none","none-found","unknown","not-established","not-set-default","no-weblogic-xml","none-api-only"],"sections":[{"id":"A","title":"Identity and stack"},{"id":"B","title":"Authentication and session"},{"id":"C","title":"Portal to portlet token handoff","when":{"q":"C-03","in":["portal","portlet"]}},{"id":"D","title":"Authorization and ownership model"},{"id":"E","title":"HTTP entry points and identifiers"},{"id":"F","title":"Data access and outbound services"},{"id":"G","title":"Files, documents, and uploads"},{"id":"H","title":"Responses, binding, headers, and static content"},{"id":"I","title":"Fortify artifacts"},{"id":"J","title":"JSF specifics","when":{"q":"C-04","includes":"jsf"}},{"id":"K","title":"Fleet defaults to confirm"},{"id":"Z","title":"Issues found"}],"items":[{"id":"C-01","phase":"profile","section":"A","type":"list","title":"Deployable modules, artifact ids, and context roots","columns":[{"key":"module","label":"Module (pom path)"},{"key":"artifactId","label":"artifactId"},{"key":"packaging","label":"Packaging"},{"key":"contextRoot","label":"Context root"}],"detail":false,"emptyRequires":false},{"id":"C-02","phase":"profile","section":"A","type":"select","title":"Audience: beneficiary self-service or operator","options":["beneficiary","operator","both","unknown"],"detail":true,"emptyRequires":false},{"id":"C-03","phase":"profile","section":"A","type":"select","title":"Application type","options":["portal","portlet","standalone","unknown"],"detail":true,"emptyRequires":false},{"id":"C-04","phase":"profile","section":"A","type":"multiselect","title":"Backend frameworks present","options":["spring-mvc","spring-boot","spring-security","jaxrs","jsf","jsp","servlets","websocket","struts","other"],"detail":true,"emptyRequires":false},{"id":"C-05","phase":"profile","section":"A","type":"select","title":"Frontend technology","options":["angular","angularjs","mixed","server-rendered","none-api-only"],"detail":true,"emptyRequires":false},{"id":"C-06","phase":"profile","section":"A","type":"select","title":"Frontend delivery and origin","options":["same-war","separate-origin-cors","separate-proxied","unknown"],"detail":true,"emptyRequires":false},{"id":"C-10","phase":"profile","section":"B","type":"multiselect","title":"Authentication mechanisms","options":["beneficiary-sso","operator-filter","portal-jwt","spring-security","container-managed","custom","none"],"detail":true,"emptyRequires":false},{"id":"C-11","phase":"profile","section":"B","type":"list","title":"Authentication and authorization filters","columns":[{"key":"filterClass","label":"Filter class"},{"key":"registeredIn","label":"Registered in"},{"key":"urlPatterns","label":"URL patterns"},{"key":"order","label":"Order"},{"key":"purpose","label":"Purpose"}],"detail":false,"emptyRequires":false},{"id":"C-12","phase":"profile","section":"B","type":"list","title":"Filter exclusions and public paths","columns":[{"key":"pattern","label":"Pattern"},{"key":"matching","label":"Matching"},{"key":"definedAt","label":"Defined at (file:line)"},{"key":"appliesTo","label":"Which filters skip it"}],"detail":false,"emptyRequires":true},{"id":"C-13","phase":"profile","section":"B","type":"list","title":"Everything reachable under the exclusions","columns":[{"key":"url","label":"URL"},{"key":"handler","label":"Handler class#method or path"},{"key":"returnsData","label":"Returns data"},{"key":"dataDescription","label":"What it returns"}],"detail":false,"emptyRequires":true},{"id":"C-14","phase":"profile","section":"B","type":"select","title":"Where identity is held after authentication","options":["http-session","custom-principal","thread-local","spring-security-context","jwt-each-request","other","unknown"],"detail":true,"emptyRequires":false},{"id":"C-15","phase":"profile","section":"B","type":"select","title":"Per-request credential","options":["session-cookie","bearer-jwt","both","none"],"detail":false,"emptyRequires":false},{"id":"C-16","phase":"profile","section":"B","type":"multiselect","title":"Session cookie flags","options":["http-only","secure","samesite","none-found"],"when":{"q":"C-15","in":["session-cookie","both"]},"detail":true,"emptyRequires":false},{"id":"C-17","phase":"profile","section":"B","type":"yesno","title":"Frontend JavaScript reads authentication cookies","detail":true,"emptyRequires":false},{"id":"C-20","phase":"profile","section":"C","type":"select","title":"Token delivery into the portlet iframe","options":["query-param","url-fragment","postmessage","shared-domain-cookie","proxy-header","other","unknown"],"detail":true,"emptyRequires":false},{"id":"C-21","phase":"profile","section":"C","type":"select","title":"Token construct and library","options":["jws-hmac","jws-asymmetric","jwe","jws-and-jwe","custom-crypto","unknown"],"detail":true,"emptyRequires":false},{"id":"C-22","phase":"profile","section":"C","type":"list","title":"Token claims","columns":[{"key":"claim","label":"Claim"},{"key":"meaning","label":"Meaning"},{"key":"setBy","label":"Set by (class)"},{"key":"usedFor","label":"Portlet uses it for"}],"detail":false,"emptyRequires":false},{"id":"C-23","phase":"profile","section":"C","type":"multiselect","title":"Validation performed on the received token","options":["signature","exp","nbf","iss","aud-or-app-id","alg-pinned","jti-replay","none-found"],"when":{"q":"C-03","eq":"portlet"},"detail":true,"emptyRequires":false},{"id":"C-24","phase":"profile","section":"C","type":"select","title":"Secret or key storage","options":["properties-in-war","credential-store-jndi","env-var","hardcoded","other","unknown"],"detail":true,"emptyRequires":false},{"id":"C-25","phase":"profile","section":"C","type":"select","title":"Secret scope","options":["fleet-shared","per-portlet","unknown"],"detail":true,"emptyRequires":false},{"id":"C-26","phase":"profile","section":"C","type":"select","title":"Session model after token validation","options":["creates-http-session","stateless","both","unknown"],"when":{"q":"C-03","eq":"portlet"},"detail":true,"emptyRequires":false},{"id":"C-27","phase":"profile","section":"C","type":"list","title":"Portlet entry guard","columns":[{"key":"guardClass","label":"Guard class"},{"key":"urlPatterns","label":"URL patterns"},{"key":"exclusions","label":"Exclusions"},{"key":"rejectsWhen","label":"Rejects when"}],"when":{"q":"C-03","eq":"portlet"},"detail":false,"emptyRequires":true},{"id":"C-28","phase":"profile","section":"C","type":"select","title":"Framing protection","options":["x-frame-options","csp-frame-ancestors","both","none-found"],"detail":true,"emptyRequires":false},{"id":"C-29","phase":"profile","section":"C","type":"text","title":"Where the portal mints the token","when":{"q":"C-03","eq":"portal"},"detail":false,"emptyRequires":false},{"id":"C-30","phase":"profile","section":"D","type":"select","title":"Ownership model","options":["beneficiary-family","operator-access-level","operator-site","mixed","none-found","unknown"],"detail":true,"emptyRequires":false},{"id":"C-31","phase":"profile","section":"D","type":"yesno","title":"Application-level authorization check present","detail":true,"emptyRequires":false},{"id":"C-32","phase":"profile","section":"D","type":"select","title":"Object-level scope check pattern","options":["canonical-helper","per-endpoint","annotation","none-found","unknown"],"detail":true,"emptyRequires":false},{"id":"C-33","phase":"profile","section":"D","type":"select","title":"How the caller's scope is established","options":["roster-in-session","per-request-lookup","jwt-claims","not-established","unknown"],"detail":true,"emptyRequires":false},{"id":"C-34","phase":"profile","section":"D","type":"text","title":"Operator access levels and site selection","when":{"q":"C-02","in":["operator","both"]},"detail":false,"emptyRequires":false},{"id":"C-35","phase":"profile","section":"D","type":"text","title":"Beneficiary scope: which people the logged-in beneficiary may see or change","when":{"q":"C-02","in":["beneficiary","both"]},"detail":false,"emptyRequires":false},{"id":"C-40","phase":"profile","section":"E","type":"multiselect","title":"HTTP entry point types","options":["spring-mvc","jaxrs","jsf-actions","servlets","websocket","actuator","other"],"detail":true,"emptyRequires":false},{"id":"C-41","phase":"profile","section":"E","type":"list","title":"Endpoint inventory","columns":[{"key":"methods","label":"HTTP method(s)"},{"key":"path","label":"Path"},{"key":"handler","label":"Handler class#method"},{"key":"isPublic","label":"Public (under a C-12 exclusion)"},{"key":"idParams","label":"Identifier parameters (name = what it identifies)"},{"key":"idSource","label":"Identifier source"},{"key":"returnsData","label":"Returns data"},{"key":"mutates","label":"Writes or deletes"}],"detail":false,"emptyRequires":true},{"id":"C-42","phase":"profile","section":"E","type":"multiselect","title":"Identifier kinds appearing in requests","options":["person-id","sponsor-id","family-id","document-id","db-primary-key","uuid","opaque-token","composite","other"],"detail":true,"emptyRequires":false},{"id":"C-50","phase":"profile","section":"F","type":"multiselect","title":"Data access mechanisms","options":["cuf","rest-client","soap-client","jpa-hibernate","jdbctemplate","stored-procedures","mybatis","file-system","ldap","other"],"detail":true,"emptyRequires":false},{"id":"C-51","phase":"profile","section":"F","type":"list","title":"Outbound service calls","columns":[{"key":"service","label":"Service"},{"key":"endpoint","label":"Base URL or property key"},{"key":"client","label":"Client class"},{"key":"operations","label":"Operations used"},{"key":"identifier","label":"Identifier passed"},{"key":"scopePassed","label":"Caller scope passed"}],"detail":false,"emptyRequires":true},{"id":"C-52","phase":"profile","section":"F","type":"text","title":"CUF request identity and scope","when":{"q":"C-50","includes":"cuf"},"detail":false,"emptyRequires":false},{"id":"C-53","phase":"profile","section":"F","type":"list","title":"Direct database access points","columns":[{"key":"location","label":"Class#method (file:line)"},{"key":"query","label":"Query or procedure"},{"key":"identifier","label":"Identifier in WHERE"},{"key":"scoped","label":"Scope constraint in WHERE"}],"when":{"q":"C-50","includesAny":["jpa-hibernate","jdbctemplate","stored-procedures","mybatis"]},"detail":false,"emptyRequires":false},{"id":"C-60","phase":"profile","section":"G","type":"yesno","title":"Serves files or documents by identifier","detail":false,"emptyRequires":false},{"id":"C-61","phase":"profile","section":"G","type":"list","title":"File-serving handlers","columns":[{"key":"handler","label":"Handler class#method"},{"key":"url","label":"URL"},{"key":"idParam","label":"Identifier parameter"},{"key":"byteSource","label":"Byte source"},{"key":"isPublic","label":"Public"},{"key":"scopeCheck","label":"Scope check location, or none"}],"when":{"q":"C-60","eq":"yes"},"detail":false,"emptyRequires":false},{"id":"C-62","phase":"profile","section":"G","type":"yesno","title":"Accepts file uploads","detail":false,"emptyRequires":false},{"id":"C-63","phase":"profile","section":"G","type":"list","title":"Upload handlers","columns":[{"key":"handler","label":"Handler class#method"},{"key":"url","label":"URL"},{"key":"target","label":"Record the upload attaches to"},{"key":"idSource","label":"Identifier source"},{"key":"storedAt","label":"Where bytes are stored"}],"when":{"q":"C-62","eq":"yes"},"detail":false,"emptyRequires":false},{"id":"C-70","phase":"profile","section":"H","type":"select","title":"Response serialization style","options":["entities-wholesale","dto-mapped","mixed","unknown"],"detail":true,"emptyRequires":false},{"id":"C-71","phase":"profile","section":"H","type":"multiselect","title":"Request binding styles present","options":["requestbody-domain","requestbody-dto","modelattribute","beanparam","jsf-properties","getparameter","none-found"],"detail":true,"emptyRequires":false},{"id":"C-72","phase":"profile","section":"H","type":"multiselect","title":"Binding allow-list mechanisms","options":["initbinder-allowed","initbinder-disallowed","jsonignore-setters","dto-only","none-found"],"detail":true,"emptyRequires":false},{"id":"C-73","phase":"profile","section":"H","type":"select","title":"Cache-Control on authenticated responses","options":["global-filter","per-endpoint","none-found","unknown"],"detail":true,"emptyRequires":false},{"id":"C-74","phase":"profile","section":"H","type":"select","title":"Directory listing setting","options":["disabled-explicit","enabled-explicit","not-set-default","no-weblogic-xml"],"detail":false,"emptyRequires":false},{"id":"C-75","phase":"profile","section":"H","type":"list","title":"Static resource handlers and roots","columns":[{"key":"config","label":"Configured at (file:line)"},{"key":"pattern","label":"URL pattern"},{"key":"root","label":"Filesystem or classpath root"},{"key":"sensitive","label":"Anything beyond frontend assets"}],"detail":false,"emptyRequires":false},{"id":"C-80","phase":"profile","section":"I","type":"yesno","title":"Fortify artifacts checked into the repository","detail":false,"emptyRequires":false},{"id":"C-81","phase":"profile","section":"I","type":"list","title":"Fortify artifacts","columns":[{"key":"path","label":"Path"},{"key":"kind","label":"Kind"},{"key":"suppresses","label":"What it suppresses or excludes"}],"when":{"q":"C-80","eq":"yes"},"detail":false,"emptyRequires":false},{"id":"C-82","phase":"profile","section":"I","type":"yesno","title":"Candidate taint-breaking wrappers","detail":false,"emptyRequires":false},{"id":"C-83","phase":"profile","section":"I","type":"list","title":"Taint-breaking wrapper candidates","columns":[{"key":"method","label":"Class#method (file:line)"},{"key":"pattern","label":"Pattern"},{"key":"callers","label":"Called from"}],"when":{"q":"C-82","eq":"yes"},"detail":false,"emptyRequires":false},{"id":"C-90","phase":"profile","section":"J","type":"list","title":"JSF pages and backing beans","columns":[{"key":"page","label":"Page"},{"key":"bean","label":"Bean class"},{"key":"scope","label":"Bean scope"},{"key":"idsHeld","label":"Record identifiers held"},{"key":"loadedFrom","label":"Identifiers loaded from"}],"detail":false,"emptyRequires":false},{"id":"C-91","phase":"profile","section":"J","type":"select","title":"ViewState protection","options":["server-side","client-encrypted","client-unencrypted","unknown"],"detail":false,"emptyRequires":false},{"id":"C-95","phase":"profile","section":"K","type":"list","title":"Enterprise shared libraries in the POM","columns":[{"key":"artifact","label":"groupId:artifactId"},{"key":"version","label":"Version"},{"key":"scope","label":"Scope"},{"key":"provides","label":"What it provides here"}],"detail":false,"emptyRequires":false},{"id":"C-96","phase":"profile","section":"K","type":"yesno","title":"CUF is the main data path","default":"yes","detail":false,"emptyRequires":false},{"id":"C-97","phase":"profile","section":"K","type":"yesno","title":"Backend services are called without authentication","default":"yes","detail":false,"emptyRequires":false},{"id":"C-98","phase":"profile","section":"K","type":"yesno","title":"Deployed to WebLogic","default":"yes","detail":true,"emptyRequires":false},{"id":"F-01","phase":"profile","section":"Z","type":"list","title":"Issues found while profiling","columns":[{"key":"location","label":"Location (file:line or URL)"},{"key":"description","label":"What is wrong"},{"key":"relatedItem","label":"Related item"},{"key":"severity","label":"Severity"}],"detail":false,"emptyRequires":false,"optional":true,"findings":true}]}
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

### C-02: Audience: beneficiary self-service or operator

**Type:** single choice  
**Applies when:** always  
**Refs:** 1, 6.1, 6.7

**How:** Decide from the login mechanism and the identifiers the code carries. Beneficiary self-service: the beneficiary SSO filter (AuthFilter, BeneficiaryAgentSSO, the iPlanetDirectoryPro cookie), logon methods FAM, CAC, DFAS, and identity expressed as a person, sponsor, or family id. Operator: the operator filters (OperatorAuthenticationFilter, OperatorAuthorizationFilter), logon methods CAC and SNT, site selection, and identity expressed as an operator id with access levels. Both: an application that serves both audiences through separate filters or paths. Cite the filter declarations and the identity fields.

**Signals to search:** `AuthFilter`, `BeneficiaryAgentSSO`, `iPlanetDirectoryPro`, `OperatorAuthenticationFilter`, `OperatorAuthorizationFilter`, `/selectsite`, `accessLevel`, `operatorId`, `familyId`, `sponsorId`, `beneficiary`, `operator`, `milconnect`, `opsconnect`

**Options:**

- `beneficiary`: Beneficiary self-service
- `operator`: Operator (call centre or office staff)
- `both`: Both audiences
- `unknown`: Unknown

<!-- answer C-02 -->
Value:
Detail (Who exactly: sponsors, dependents, call-centre operators, site staff):
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
**Applies when:** C-02 (Audience: beneficiary self-service or operator) is one of `operator`, `both`  
**Refs:** 6.3, Q9, Q10

**How:** List the access levels or roles that appear in code and what each permits. Describe how a site is selected (for example /selectsite), where the selection is stored, and how later requests are constrained to that site on the server side.

**Signals to search:** `/selectsite`, `selectedSite`, `siteId`, `accessLevel`, `AccessLevel`, `Role`, `hasRole`

<!-- answer C-34 -->
Value:
Evidence:
Searched:
<!-- /answer -->

### C-35: Beneficiary scope: which people the logged-in beneficiary may see or change

**Type:** free text  
**Applies when:** C-02 (Audience: beneficiary self-service or operator) is one of `beneficiary`, `both`  
**Refs:** 6.7, Q8

**How:** State which people a logged-in beneficiary can reach: only themselves, their dependents, their sponsor, the whole family, or something else depending on role (sponsor versus dependent). Cite where that set is built (login, session attribute, per-request lookup, token claim) and where it is consulted.

**Signals to search:** `familyId`, `sponsorId`, `personId`, `dependents`, `familyMembers`, `getFamily`, `isSponsor`

<!-- answer C-35 -->
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

Copy everything inside the fence below, exactly as written, into a file named `checklist-lint.js` in the same folder as this document, unless that file is already there. See Step 0 at the top for how to use it. It reads the rules from the hidden `lint-schema` comment near the top of this document, so do not remove that comment.

````javascript
#!/usr/bin/env node
'use strict';
// checklist-lint.js: checks a filled checklist Markdown document (profile or review).
// Generated by build.js; the same engine as md2json.js. No dependencies. Usage:
//   node checklist-lint.js <filled.md>                     report problems (exit 1 if any)
//   node checklist-lint.js <filled.md> --json out.json     also write the result JSON
//   node checklist-lint.js <review.md> --profile p.json    profile result for row counts and rules

var TICK3 = new RegExp('`{3}[\\s\\S]*?`{3}', 'g');
var LABEL_RE = /^(Status|Reason|Value|Detail(?:\s*\([^)]*\))?|Evidence|Searched|Location|Findings|Why no more findings|Application|Reviewer)\s*:\s*(.*)$/;
var CITATION_RE = /[\w\/.\\-]+\.(java|ts|js|xml|properties|ya?ml|json|html?|jspx?|xhtml|sql|txt|gradle|md)(:\d+)?/i;
var STATUSES = ['pass', 'finding', 'unable', 'na'];
function has(s) { return !!(s && String(s).trim()); }
function stripFences(md) { return md.replace(TICK3, ''); }
function compactItem(it, phase) {
  return {
    id: it.id, phase: phase, section: it.section, type: it.type, title: it.title,
    options: it.options ? it.options.map(function (o) { return o.value; }) : undefined,
    columns: it.columns ? it.columns.map(function (c) { return { key: c.key, label: c.label }; }) : undefined,
    when: it.when, default: it.default,
    detail: !!it.detail, emptyRequires: !!it.emptyRequires,
    optional: it.optional ? true : undefined, findings: it.findings ? true : undefined,
    forEach: it.forEach, forEachWhere: it.forEachWhere, severity: it.severity,
    negativeValues: it.negativeValues
  };
}
function schemaFromDefinition(def, context) {
  var phase = def.phase || 'profile';
  var items = def.items.map(function (it) { return compactItem(it, phase); });
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
      blocks[id].perRow = blocks[id].perRow || {};
      if (blocks[id].perRow[row]) duplicates.push(id + ' row=' + row);
      blocks[id].perRow[row] = parsed;
    }
  }
  var opens = (scan.match(/<!--\s*answer\s+/g) || []).length;
  var closes = (scan.match(/<!--\s*\/answer\s*-->/g) || []).length;
  return { blocks: blocks, duplicates: duplicates, unbalanced: opens !== closes };
}
function lint(md, schema, opts) {
  opts = opts || {};
  var NEG = schema.negativeValues || [];
  var lintPhase = schema.lintPhase || 'profile';
  var profile = opts.profile || null;
  var itemsById = {}, sectionsById = {};
  schema.items.forEach(function (it) { itemsById[it.id] = it; });
  schema.sections.forEach(function (s) { sectionsById[s.id] = s; });
  var mine = schema.items.filter(function (it) { return (it.phase || 'profile') === lintPhase; });
  var needsProfile = schema.items.some(function (it) { return (it.phase || 'profile') !== lintPhase; });
  var problems = [], warnings = [];
  var parsed = parseAnswers(md);
  var blocks = parsed.blocks;
  if (parsed.unbalanced) problems.push('DOC: an answer block is not closed (an <!-- answer --> without a matching <!-- /answer -->)');
  parsed.duplicates.forEach(function (id) { problems.push(id + ': answer block appears more than once'); });
  Object.keys(blocks).forEach(function (id) { if (id !== 'META' && !itemsById[id]) warnings.push(id + ': answer block for an id that is not in this checklist'); });
  if (needsProfile && !profile) warnings.push('DOC: no profile result available; branching rules are treated as met and per-row counts are not verified. Pass --profile <profile-result.json>.');
  var meta = blocks.META ? blocks.META.fields : {};
  var result = {
    checklist: schema.id,
    version: schema.version,
    title: schema.title,
    phase: lintPhase,
    app: opts.app || meta.application || (profile && profile.app) || '',
    reviewer: opts.reviewer || meta.reviewer || 'ai',
    reviewerKind: 'ai',
    exportedAt: new Date().toISOString(),
    source: opts.source || '',
    profileUsed: profile ? true : false,
    answers: {}
  };
  if (!has(result.app)) problems.push('META: Application is empty');
  function clean(s) { return s.trim().replace(/^`+|`+$/g, '').replace(/\.$/, '').trim(); }
  function readCheck(f) {
    return {
      status: clean(f.status || '').toLowerCase() || null,
      location: f.location || '',
      evidence: f.evidence || '',
      findings: f.findings || '',
      whyNoMore: f.why_no_more_findings || '',
      reason: f.reason || ''
    };
  }
  mine.forEach(function (it) {
    var b = blocks[it.id];
    if (!b) { result.answers[it.id] = { status: 'missing' }; return; }
    if (it.type === 'check') {
      if (it.forEach) {
        var rec = { perRow: [] };
        if (b.perRow) {
          Object.keys(b.perRow).map(Number).sort(function (a, c) { return a - c; }).forEach(function (n) {
            var r = readCheck(b.perRow[n].fields); r.row = n; rec.perRow.push(r);
          });
        }
        if (b.fields && Object.keys(b.fields).length) rec.template = readCheck(b.fields);
        result.answers[it.id] = rec;
      } else {
        result.answers[it.id] = readCheck(b.fields || {});
      }
      return;
    }
    var f = b.fields || {};
    if ((f.status || '').toLowerCase().replace(/[^a-z]/g, '') === 'na') { result.answers[it.id] = { status: 'na', reason: f.reason || '' }; return; }
    var rec2 = {};
    if (it.type === 'list') {
      var raw = parseTable(b.table);
      rec2.rows = raw.map(function (cells, idx) {
        if (cells.length > it.columns.length) problems.push(it.id + ': table row ' + (idx + 1) + ' has ' + cells.length + ' cells but the table has ' + it.columns.length + ' columns (escape a | inside a cell as \\|)');
        else if (cells.length < it.columns.length) warnings.push(it.id + ': table row ' + (idx + 1) + ' has only ' + cells.length + ' of ' + it.columns.length + ' cells');
        var row = {};
        it.columns.forEach(function (c, i) { row[c.key] = cells[i] || ''; });
        return row;
      });
    } else if (it.type === 'multiselect') {
      rec2.value = (f.value || '').split(/[,\n]/).map(function (s) { return clean(s); }).filter(Boolean);
    } else if (it.type === 'text') {
      rec2.value = f.value || '';
    } else {
      rec2.value = clean(f.value || '').toLowerCase() || null;
    }
    if (it.detail) rec2.detail = f.detail || '';
    rec2.evidence = f.evidence || '';
    rec2.searched = f.searched || '';
    result.answers[it.id] = rec2;
  });
  function answerOf(id) {
    var it = itemsById[id];
    if (!it) return null;
    if ((it.phase || 'profile') === lintPhase) return result.answers[id] || null;
    if (!profile || !profile.answers) return undefined; // unknown
    return profile.answers[id] || null;
  }
  function liveValue(id) { var r = answerOf(id); return r && !r.status ? r.value : undefined; }
  function liveRows(id) { var r = answerOf(id); return r && r.rows ? r.rows : []; }
  var applCache = {};
  function evalCond(c) {
    if (!c) return true;
    if (c.all) return c.all.every(evalCond);
    if (c.any) return c.any.some(evalCond);
    if (c.not) return !evalCond(c.not);
    var item = itemsById[c.q];
    if (!item) return false;
    if ((item.phase || 'profile') !== lintPhase && !profile) return true; // unknown: assume applicable
    if (!applicable(item)) return false;
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
  function expectedRows(it) {
    var src = itemsById[it.forEach];
    if (!src) return null;
    var a = answerOf(it.forEach);
    if (a === undefined) return null;
    var rows = a && a.rows ? a.rows : [];
    if (it.forEachWhere && rows.length && rows.some(function (r) { return Object.prototype.hasOwnProperty.call(r, it.forEachWhere.col); })) {
      rows = rows.filter(function (r) { return r[it.forEachWhere.col] === it.forEachWhere.eq; });
    }
    return rows;
  }
  var summary = { items: mine.length, complete: 0, incomplete: 0, na: 0, inferredNa: 0, missing: 0 };
  var neg = function (it) { return NEG.concat(it.negativeValues || []); };
  function answered(it, rec) {
    if (it.type === 'list') return rec.rows.length > 0;
    if (it.type === 'multiselect') return rec.value.length > 0;
    return has(rec.value);
  }
  function checkBlock(it, r, label) {
    var ok = true;
    if (!r.status) { problems.push(label + ': Status is empty'); return false; }
    if (STATUSES.indexOf(r.status) < 0) { problems.push(label + ': Status "' + r.status + '" is not one of ' + STATUSES.join(', ')); return false; }
    if (r.status === 'pass') {
      if (!has(r.evidence)) { problems.push(label + ': pass without Evidence citing the check'); ok = false; }
      else if (!CITATION_RE.test(r.evidence)) warnings.push(label + ': Evidence does not cite a file (expected path:line)');
      if (!has(r.whyNoMore)) { problems.push(label + ': pass without "Why no more findings"'); ok = false; }
    } else if (r.status === 'finding') {
      if (!has(r.location)) { problems.push(label + ': finding without Location'); ok = false; }
      if (!has(r.findings)) { problems.push(label + ': finding without Findings text'); ok = false; }
      if (!has(r.whyNoMore)) warnings.push(label + ': finding without "Why no more findings"; other paths may be unexamined');
    } else if (r.status === 'unable') {
      if (!has(r.evidence) && !has(r.findings)) { problems.push(label + ': unable without Evidence saying what was read and where the trail ended'); ok = false; }
    } else if (r.status === 'na') {
      if (!has(r.reason)) { problems.push(label + ': na without Reason'); ok = false; }
    }
    return ok;
  }
  function isComplete(it, rec, isAnswered) {
    var ok = true;
    if (it.type !== 'list' && it.type !== 'text' && isAnswered) {
      var allowed = it.type === 'yesno' ? ['yes', 'no'] : it.options;
      var bad = (Array.isArray(rec.value) ? rec.value : [rec.value]).filter(function (v) { return allowed.indexOf(v) < 0; });
      if (bad.length) { problems.push(it.id + ': value "' + bad.join('", "') + '" is not one of ' + allowed.join(', ')); ok = false; }
    }
    if (!isAnswered && !(it.type === 'list' && has(rec.searched))) { problems.push(it.id + ': not answered'); return false; }
    if (it.optional) return ok; // issue tables carry their citations in the rows
    var n = neg(it);
    var isNeg = it.type === 'list' ? rec.rows.length === 0
      : (Array.isArray(rec.value) ? rec.value.some(function (v) { return n.indexOf(v) >= 0; }) : n.indexOf(rec.value) >= 0);
    if (isNeg && !has(rec.searched)) { problems.push(it.id + ': negative answer without a Searched record listing the signals and directories searched'); ok = false; }
    if (it.default !== undefined && !has(rec.evidence)) { problems.push(it.id + ': fleet default not confirmed with evidence'); ok = false; }
    if (!has(rec.evidence) && !(isNeg && has(rec.searched))) { problems.push(it.id + ': no evidence cited'); ok = false; }
    else if (has(rec.evidence) && !CITATION_RE.test(rec.evidence)) warnings.push(it.id + ': Evidence does not cite a file (expected path:line)');
    return ok;
  }
  mine.forEach(function (it) {
    var rec = result.answers[it.id];
    var on = applicable(it);
    var exp = it.forEach ? expectedRows(it) : null;
    if (on && it.forEach && exp && exp.length === 0) on = false; // nothing to iterate
    if (rec.status === 'missing') {
      if (on) { problems.push(it.id + ': no answer block found'); summary.missing++; }
      else { result.answers[it.id] = { status: 'na', reason: 'rule: ' + (ruleText(it) || (it.forEach + ' has no matching rows')), inferred: true }; summary.na++; summary.inferredNa++; }
      return;
    }
    if (it.type === 'check') {
      if (it.forEach) {
        var rows = rec.perRow;
        if (!on) {
          if (rows.length && rows.some(function (r) { return r.status; })) warnings.push(it.id + ': answered although its rule (' + (ruleText(it) || it.forEach + ' has no matching rows') + ') is not met; kept');
          else { result.answers[it.id] = { status: 'na', reason: 'rule: ' + (ruleText(it) || it.forEach + ' has no matching rows'), inferred: true }; summary.na++; summary.inferredNa++; return; }
        }
        var allOk = true;
        if (exp) {
          rec.expectedRows = exp.length;
          for (var n = 1; n <= exp.length; n++) {
            if (!rows.some(function (r) { return r.row === n; })) { problems.push(it.id + ': no answer block for row=' + n + ' of ' + it.forEach); allOk = false; }
          }
          rows.forEach(function (r) { if (r.row > exp.length) warnings.push(it.id + ' row=' + r.row + ': ' + it.forEach + ' has only ' + exp.length + ' matching rows'); });
        } else if (!rows.length) { problems.push(it.id + ': no per-row answer blocks (row=1, row=2, ...)'); allOk = false; }
        if (rows.length === 0 && rec.template && rec.template.status) { problems.push(it.id + ': the template block was filled instead of per-row blocks; add row=N to each block'); allOk = false; }
        rows.forEach(function (r) { r.complete = checkBlock(it, r, it.id + ' row=' + r.row); if (!r.complete) allOk = false; });
        delete rec.template;
        rec.complete = allOk;
      } else {
        if (!on) {
          if (rec.status) { warnings.push(it.id + ': answered although its rule (' + ruleText(it) + ') is not met; kept'); }
          else { result.answers[it.id] = { status: 'na', reason: 'rule: ' + ruleText(it), inferred: true }; summary.na++; summary.inferredNa++; return; }
        }
        rec.complete = checkBlock(it, rec, it.id);
      }
      if (rec.complete) summary.complete++; else summary.incomplete++;
      return;
    }
    if (rec.status === 'na') {
      if (on) { problems.push(it.id + ': marked na, but its rule (' + ruleText(it) + ') is met by the answers'); summary.incomplete++; }
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
  mine.forEach(function (it) {
    var r = result.answers[it.id];
    if (!r) return;
    if (it.findings && r.rows) r.rows.forEach(function (row) { result.findings.push(Object.assign({ item: it.id }, row)); });
    if (it.type === 'check') {
      if (r.perRow) r.perRow.forEach(function (x) { if (x.status === 'finding') result.findings.push({ item: it.id, row: x.row, location: x.location, description: x.findings, severity: it.severity }); });
      else if (r.status === 'finding') result.findings.push({ item: it.id, location: r.location, description: r.findings, severity: it.severity });
    }
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
    console.error('usage: node ' + path.basename(process.argv[1]) + ' <filled.md> [--json result.json] [--print-json] [--app name] [--reviewer name] [--profile profile-result.json] [--definition definitions/profile.json]');
    process.exit(2);
  }
  var md = fs.readFileSync(file, 'utf8');
  var schema = core.extractSchema(md);
  if (!schema && opt('definition')) schema = core.schemaFromDefinition(JSON.parse(fs.readFileSync(opt('definition'), 'utf8')));
  if (!schema) {
    console.error('No <!-- lint-schema --> comment found in ' + file + ' and no --definition given. Do not remove the schema comment from the document.');
    process.exit(2);
  }
  var profile = null, profilePath = opt('profile');
  var lintPhase = schema.lintPhase || 'profile';
  if (!profilePath && lintPhase !== 'profile') {
    var guess = path.join(path.dirname(path.resolve(file)), 'profile-result.json');
    if (fs.existsSync(guess)) profilePath = guess;
  }
  if (profilePath) {
    try { profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')); }
    catch (e) { console.error('Could not read profile result ' + profilePath + ': ' + e.message); process.exit(2); }
  }
  var out = core.lint(md, schema, { app: opt('app'), reviewer: opt('reviewer'), source: path.basename(file), profile: profile });
  var printJson = flag('print-json') || (defaults.output === 'json' && !opt('json'));
  var report = [];
  var s = out.summary;
  report.push('Checklist ' + schema.id + ' v' + schema.version + ' phase ' + lintPhase + ' in ' + path.basename(file) + (out.result.app ? ' for ' + out.result.app : ''));
  if (lintPhase !== 'profile') report.push(profile ? 'Profile result: ' + profilePath : 'Profile result: none (pass --profile to verify rules and row counts)');
  report.push('Items: ' + s.items + '. Complete: ' + s.complete + '. Incomplete: ' + s.incomplete + '. Not applicable: ' + s.na + (s.inferredNa ? ' (' + s.inferredNa + ' inferred from the rules)' : '') + '. Missing: ' + s.missing + '. Findings: ' + out.result.findings.length + '.');
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


=================

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
.summary table.issues { border-collapse: collapse; width: 100%; min-width: 600px; }
.summary table.issues th, .summary table.issues td { border: 1px solid var(--line); padding: 5px 8px; text-align: left; vertical-align: top; font-size: 13px; }
.summary table.issues th { background: #f1f3f5; font-weight: 600; }
.summary table.issues .small { color: var(--muted); font-size: 12px; }
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
.ihead { display: flex; align-items: baseline; gap: 10px; }
.iid { font-family: ui-monospace, Consolas, monospace; color: var(--muted); font-size: 12.5px; min-width: 44px; }
.chip { margin-left: auto; font-size: 12px; border-radius: 10px; padding: 1px 8px; border: 1px solid var(--line); white-space: nowrap; }
.chip-ok { color: var(--ok); border-color: #b7e0c0; background: #eefaf0; }
.chip-warn { color: var(--warn); border-color: #f5d38f; background: #fff8e6; }
.chip-bad { color: var(--bad); border-color: #f3b4ae; background: #fdf0ee; }
.chip-open { color: var(--muted); }
.chip-na { color: var(--na); }
.tip { color: var(--muted); margin: 2px 0 8px; font-size: 13.5px; }
.problemif { margin: -2px 0 10px; font-size: 13.5px; color: var(--ink); background: #fdf0ee; border-left: 3px solid var(--bad); padding: 6px 10px; border-radius: 0 4px 4px 0; }
.problemif strong { color: var(--bad); }
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
  textarea { border: 1px solid #bbb; overflow: visible; resize: none; }
  ::placeholder { color: transparent; }
  body { background: #fff; }
}

</style>
</head>
<body>
<header class="top">
  <div class="title">Web Application Security Review <span class="ver">checklist web-idor-review v0.4.0</span></div>
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
<script type="application/json" id="def">{"id":"web-idor-review","version":"0.4.0","title":"Web Application Security Review","mode":"dev","negativeValues":["no","none","none-found","unknown","not-established","not-set-default","no-weblogic-xml","none-api-only"],"intro":"Each topic asks a few questions about one area of the application, then tells you what to check there and what a problem looks like, then gives you a place to record anything else you noticed in that area. Answer from the code. Mark a check Checked, OK only when you found the line that does the check; describe every problem.","phases":[],"sections":[{"id":"T0","title":"What this application is"},{"id":"T1","title":"Who uses it and how they log in"},{"id":"T2","title":"The token from the portal","when":{"q":"C-09","in":["portal","portlet","unknown"]}},{"id":"T3","title":"What can be reached without logging in"},{"id":"T4","title":"Who is allowed to see what"},{"id":"T5","title":"Reading records by identifier"},{"id":"T6","title":"Changing records"},{"id":"T7","title":"Files and documents"},{"id":"T8","title":"Where the data comes from"},{"id":"T9","title":"Caching and static content"},{"id":"T10","title":"JSF pages","when":{"q":"C-02","includes":"jsf"}},{"id":"T12","title":"Anything else"}],"items":[{"id":"C-01","section":"T0","type":"text","title":"Which module builds the deployable WAR, and what is its context root?","tip":"Root pom or the module with war packaging. Context root is in weblogic.xml."},{"id":"C-02","section":"T0","type":"multiselect","title":"Which frameworks handle requests on the backend?","tip":"Select everything that handles even one page. The pom and web.xml settle it.","detail":"Versions and anything selected as Other","options":[{"value":"spring-mvc","label":"Spring MVC (@Controller, DispatcherServlet)"},{"value":"spring-boot","label":"Spring Boot"},{"value":"spring-security","label":"Spring Security"},{"value":"jaxrs","label":"JAX-RS (@Path; Jersey, RESTEasy, or CXF)"},{"value":"jsf","label":"JSF (FacesServlet, .xhtml or .jspx pages)"},{"value":"jsp","label":"JSP pages"},{"value":"servlets","label":"Raw servlets (web.xml \u003cservlet> or @WebServlet)"},{"value":"websocket","label":"WebSocket endpoints"},{"value":"struts","label":"Struts"},{"value":"other","label":"Other (describe in Detail)"}]},{"id":"C-03","section":"T0","type":"select","title":"What is the frontend?","tip":"package.json under src/main/angular shows the Angular version.","detail":"Version from package.json and where the frontend source lives","options":[{"value":"angular","label":"Angular 2 or later"},{"value":"angularjs","label":"AngularJS 1.x"},{"value":"mixed","label":"Mixed (describe in Detail)"},{"value":"server-rendered","label":"Server-rendered pages only (JSF or JSP)"},{"value":"none-api-only","label":"None: API only"}]},{"id":"C-04","section":"T0","type":"select","title":"Is the frontend served from the same WAR as the backend?","tip":"CORS configuration on the backend (@CrossOrigin, CorsFilter) means a separate origin.","detail":"CORS allowed origins and credentials setting, if any","options":[{"value":"same-war","label":"Served from the same WAR (same origin)"},{"value":"separate-origin-cors","label":"Separate origin with CORS"},{"value":"separate-proxied","label":"Separate deployment behind the same origin (proxy)"}]},{"id":"C-07","section":"T0","type":"yesno","title":"Is this app deployed to WebLogic?","tip":"weblogic.xml in WEB-INF.","detail":"WebLogic version from the descriptor namespace"},{"id":"C-08","section":"T1","type":"select","title":"Who uses this application: beneficiaries or operators?","tip":"Beneficiary self-service apps log people in through the beneficiary SSO filter (AuthFilter, iPlanetDirectoryPro cookie) and scope data to a family. Operator apps use OperatorAuthenticationFilter and OperatorAuthorizationFilter and scope data by access level or selected site.","detail":"Who exactly: sponsors, dependents, call-centre operators, site staff","options":[{"value":"beneficiary","label":"Beneficiary self-service"},{"value":"operator","label":"Operator (call centre or office staff)"},{"value":"both","label":"Both audiences"}]},{"id":"C-09","section":"T1","type":"select","title":"Is this a portal, a portlet, or a standalone application?","tip":"A portal hosts other apps in iframes and creates the token they receive. A portlet runs inside a portal iframe and receives that token. A standalone app logs users in itself.","detail":"Naming convention observed (artifactId prefix, package name)","options":[{"value":"portal","label":"Portal: hosts portlets and mints their token"},{"value":"portlet","label":"Portlet: loaded in a portal iframe, receives a token"},{"value":"standalone","label":"Standalone: own SSO, no iframe hosting, no parent token"}]},{"id":"C-10","section":"T1","type":"multiselect","title":"How do users log in?","tip":"Usually one of the enterprise filters from the shared web-security library, declared in web.xml. Select everything that applies.","detail":"Logon methods supported (CAC, FAM, DFAS, SNT) and anything custom","options":[{"value":"beneficiary-sso","label":"Enterprise beneficiary SSO filter (AuthFilter / BeneficiaryAgentSSO)"},{"value":"operator-filter","label":"Enterprise operator filters (OperatorAuthenticationFilter / OperatorAuthorizationFilter)"},{"value":"portal-jwt","label":"Token received from a parent portal"},{"value":"spring-security","label":"Spring Security"},{"value":"container-managed","label":"Container-managed (\u003clogin-config> in web.xml)"},{"value":"custom","label":"Custom or home-grown"},{"value":"none","label":"None found"}]},{"id":"C-12","section":"T1","type":"select","title":"After login, where does the code keep who the user is?","tip":"Follow the login filter to where it stores the user, then find the class the rest of the code reads to get the person, family, or operator ids.","detail":"Class holding the identity and the identifiers it carries (person id, sponsor id, family id, operator id, access levels, site)","options":[{"value":"http-session","label":"HttpSession attribute"},{"value":"custom-principal","label":"Custom Principal via request.getUserPrincipal()"},{"value":"thread-local","label":"ThreadLocal or request-scoped holder"},{"value":"spring-security-context","label":"Spring SecurityContextHolder"},{"value":"jwt-each-request","label":"Re-derived from the token on every request"},{"value":"other","label":"Other (describe in Detail)"}]},{"id":"C-13","section":"T1","type":"select","title":"What does each request carry after login: a session cookie or a token?","tip":"A token means an Angular interceptor adds an Authorization header and the server parses it on every request.","options":[{"value":"session-cookie","label":"Session cookie"},{"value":"bearer-jwt","label":"Bearer token on every request"},{"value":"both","label":"Both"},{"value":"none","label":"None found"}]},{"id":"C-15","section":"T1","type":"yesno","title":"Does the Angular code read the login cookie directly, for example iPlanetDirectoryPro?","tip":"Search the frontend for document.cookie or a cookie service. If JavaScript can read it, the cookie is not HttpOnly.","detail":"Cookie names and the files that read them"},{"id":"R-01","section":"T1","type":"check","title":"Search for personId, sponsorId, familyId, or operatorId being read from a request parameter, header, or cookie.","tip":"Then follow each one to see whether it is used as the current user.","finding":"Any of them used as who the caller is, instead of the value from the session or the validated token.","severity":"high"},{"id":"R-02","section":"T1","type":"check","title":"Check the cookie flags in web.xml and weblogic.xml, and search for encodeURL and url-rewriting-enabled.","tip":"Effective values count, defaults included: WebLogic defaults HttpOnly on, Secure off, and URL rewriting on. \u003ctracking-mode>COOKIE\u003c/tracking-mode> in web.xml or url-rewriting-enabled false switches rewriting off.","finding":"HttpOnly explicitly false, Secure not explicitly true, URL rewriting left on, or code that appends jsessionid to a URL.","when":{"q":"C-13","in":["session-cookie","both"]},"severity":"medium"},{"id":"R-03","section":"T1","type":"check","title":"The login cookie is readable from JavaScript, so it is not HttpOnly.","tip":"Confirm the read runs in production code (it has a caller). If JavaScript can read it, script injection anywhere on the cookie domain can steal the SSO session.","finding":"It is (confirmed in code: the read runs in production). Mark it Problem found and note the file, even though the fix belongs to the identity service.","when":{"q":"C-15","eq":"yes"},"severity":"medium"},{"id":"F-01","section":"T1","type":"list","title":"Anything else wrong that you noticed in this area","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]},{"id":"C-16","section":"T2","type":"select","title":"How does the token get from the portal into the portlet?","tip":"How the iframe src is built on the portal side, and where the portlet first reads the token. A query parameter ends up in access logs and browser history.","detail":"Portal side (file:line) and portlet side (file:line)","options":[{"value":"query-param","label":"iframe src query parameter"},{"value":"url-fragment","label":"URL fragment"},{"value":"postmessage","label":"window.postMessage"},{"value":"shared-domain-cookie","label":"Cookie on a shared domain"},{"value":"proxy-header","label":"Header injected by a proxy"},{"value":"other","label":"Other (describe in Detail)"}]},{"id":"C-17","section":"T2","type":"select","title":"How is the token protected?","tip":"jjwt, auth0, or nimbus with a signWith call means signed. Cipher calls outside a JWT library mean custom encryption.","detail":"Library, class, and algorithm constant","options":[{"value":"jws-hmac","label":"JWS signed with HMAC (shared secret)"},{"value":"jws-asymmetric","label":"JWS signed with an asymmetric key"},{"value":"jwe","label":"JWE encrypted"},{"value":"jws-and-jwe","label":"Signed and encrypted"},{"value":"custom-crypto","label":"Custom encrypt/decrypt outside a JOSE library"}]},{"id":"C-18","section":"T2","type":"text","title":"What is in the token?","tip":"Family id, sponsor id, person id, access levels, app id, site, expiry."},{"id":"C-19","section":"T2","type":"multiselect","title":"What does the portlet check when it receives the token?","tip":"Select only what the code demonstrably enforces. jjwt and auth0 reject an expired token automatically when exp is present, but neither requires exp to exist; select exp only if the code requires it. Issuer and audience count only with requireIssuer/requireAudience, withIssuer/withAudience, or an explicit comparison.","when":{"q":"C-09","eq":"portlet"},"detail":"Class and lines performing each check","options":[{"value":"signature","label":"Signature verified"},{"value":"exp","label":"Expiry (exp) enforced"},{"value":"nbf","label":"Not-before (nbf) enforced"},{"value":"iss","label":"Issuer (iss) checked"},{"value":"aud-or-app-id","label":"Audience or application id checked"},{"value":"alg-pinned","label":"Algorithm pinned (rejects none and algorithm switching)"},{"value":"jti-replay","label":"Replay protection (jti or one-time use)"},{"value":"none-found","label":"None found"}]},{"id":"C-20","section":"T2","type":"select","title":"Where does the signing secret live?","tip":"Follow the property key from the code that loads the key.","detail":"Property key and file","options":[{"value":"properties-in-war","label":"Properties file inside the WAR"},{"value":"credential-store-jndi","label":"WebLogic credential store or JNDI"},{"value":"env-var","label":"Environment variable"},{"value":"hardcoded","label":"Hardcoded in source"},{"value":"other","label":"Other (describe in Detail)"}]},{"id":"C-21","section":"T2","type":"select","title":"Is the secret shared across all portlets or specific to this one?","tip":"A shared library default or the same property name in several apps means shared.","detail":"How this was determined","options":[{"value":"fleet-shared","label":"One key shared across the fleet"},{"value":"per-portlet","label":"Per portlet"}]},{"id":"C-22","section":"T2","type":"select","title":"After the token is accepted, does the portlet create a session or require the token on every request?","tip":"Look for getSession(true) after the token check.","when":{"q":"C-09","eq":"portlet"},"detail":"What is stored and how it is bound to the token identity","options":[{"value":"creates-http-session","label":"Creates an HttpSession holding identity"},{"value":"stateless","label":"Stateless: token on every request"},{"value":"both","label":"Both"}]},{"id":"C-23","section":"T2","type":"text","title":"Which filter rejects requests with no valid token or session, and what happens if the portlet URL is opened directly in a browser tab?","tip":"The filter class, its URL patterns, and its exclusions.","when":{"q":"C-09","eq":"portlet"}},{"id":"C-24","section":"T2","type":"select","title":"Is framing restricted with X-Frame-Options or a CSP frame-ancestors header?","tip":"Usually set in a filter or by the shared web-security library.","detail":"Values and where they are set","options":[{"value":"x-frame-options","label":"X-Frame-Options set"},{"value":"csp-frame-ancestors","label":"CSP frame-ancestors set"},{"value":"both","label":"Both"},{"value":"none-found","label":"None found"}]},{"id":"C-25","section":"T2","type":"text","title":"Where does the portal create the token, and what does it put in it?","tip":"Class and method, the fields copied from the logged-in user, and the expiry.","when":{"q":"C-09","eq":"portal"}},{"id":"R-04","section":"T2","type":"check","title":"Find the call that parses the token and read what it verifies.","tip":"jjwt: parseClaimsJws with a key is right (a byte[] key also pins HMAC); parse or parseClaimsJwt accept unsigned tokens. auth0: the verifier must name the algorithm; JWT.decode reads claims without verifying. Custom decryption must also authenticate the token.","finding":"An unsigned parse, a verifier without a fixed algorithm, custom decryption that does not authenticate, or any claim read before verification.","when":{"q":"C-09","eq":"portlet"},"severity":"high"},{"id":"R-05","section":"T2","type":"check","title":"Find the lines that enforce expiry, issuer, and audience or app id.","tip":"With jjwt or auth0, look for the line that requires exp to be present; expiry itself is automatic when the claim exists. Audience and issuer need requireAudience/withAudience or an explicit comparison.","finding":"exp not required to be present, or issuer or audience never compared. With a secret shared across portlets, a missing audience check accepts a token minted for another portlet.","when":{"q":"C-09","eq":"portlet"},"severity":"high"},{"id":"R-06","section":"T2","type":"check","title":"The token travels in the iframe URL.","tip":"A URL token ends up in access logs, browser history, and Referer headers.","finding":"It is (confirmed in code). Mark it Problem found and note the expiry and whether it is exchanged for a session immediately.","when":{"q":"C-16","eq":"query-param"},"severity":"medium"},{"id":"R-07","section":"T2","type":"check","title":"Search for familyId, sponsorId, or accessLevel being read from a parameter or the body, and follow each into a data call.","tip":"Compare with where the validated token claims are stored.","finding":"A request value replacing the token's claim on any data path.","when":{"q":"C-09","eq":"portlet"},"severity":"high"},{"id":"R-08","section":"T2","type":"check","title":"Read what happens at token login and what happens when a different token arrives on an existing session.","tip":"Look for invalidate or changeSessionId, and for attribute writes on later requests.","finding":"No session-id change at login, or a second token changing part of the session while the rest stays.","when":{"all":[{"q":"C-09","eq":"portlet"},{"q":"C-22","in":["creates-http-session","both","unknown"]}]},"severity":"medium"},{"id":"R-09","section":"T2","type":"check","title":"Open the minting code and trace the source of each claim.","tip":"Every value must come from the server-side identity.","finding":"A claim populated from a request parameter, including the target portlet used as audience, or a long expiry.","when":{"q":"C-09","eq":"portal"},"severity":"high"},{"id":"R-10","section":"T2","type":"check","title":"The signing secret is a literal in source.","tip":"Do not paste the value anywhere.","finding":"It is (confirmed in code). Anyone with repository access can mint tokens. Mark it Problem found and note the class.","when":{"q":"C-20","eq":"hardcoded"},"severity":"high"},{"id":"R-11","section":"T2","type":"check","title":"No framing restriction is set anywhere.","tip":"Search filters, security configuration, and the shared library for X-Frame-Options and frame-ancestors. For a portlet, the correct value allows only the portal origin.","finding":"It is (confirmed: neither header is set). Any origin can frame the application. Mark it Problem found.","when":{"q":"C-24","eq":"none-found"},"severity":"low"},{"id":"R-12","section":"T2","type":"check","title":"Find where the portal chooses which portlet URL the token is attached to, and where it posts the token.","tip":"The destination must come from fixed configuration. A postMessage must name the portlet origin.","finding":"The destination comes from a request or route parameter, or postMessage uses \"*\". A caller can then send a token valid for every portlet to a server they control.","when":{"q":"C-09","eq":"portal"},"severity":"high"},{"id":"F-02","section":"T2","type":"list","title":"Anything else wrong that you noticed in this area","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]},{"id":"C-26","section":"T3","type":"text","title":"Which URL patterns skip the login filter?","tip":"Filter mappings and exclusion patterns in web.xml or the filter's init-params, for example /ws/public/*, appmonitor.status, static folders. One per line."},{"id":"C-27","section":"T3","type":"text","title":"What can be reached without logging in, and does any of it return data?","tip":"For each excluded pattern, list what is behind it. Health checks and static assets are expected; anything that returns records is an issue."},{"id":"R-13","section":"T3","type":"check","title":"List every servlet mapping and controller prefix, and compare them with the login filter's mappings.","tip":"web.xml servlet mappings, controller @RequestMapping prefixes, the JSF servlet, error pages. Watch /* against /ws/*.","finding":"A mapping the filter does not cover, or a filter that does not run on FORWARD or ERROR dispatches.","severity":"high"},{"id":"R-14","section":"T3","type":"check","title":"For every exclusion pattern you listed in C-26, read the code that decides it skips the login filter.","tip":"Find the comparison and what it compares: the raw request URI or the normalised servlet path. For Spring Security rules, compare antMatchers with MVC's own matching and check web.ignoring.","finding":"A prefix, regex, or contains match on the raw URI. Try in your head: /public/../private, a double slash, an encoded slash, ;jsessionid=x, a case change, a .json suffix. For a servlet-mapping gap, the gap itself is the problem.","forEach":"C-26","severity":"high"},{"id":"R-15","section":"T3","type":"check","title":"For every public URL you listed in C-27, open its handler and follow every path to the response.","tip":"A status string or a health check is fine.","finding":"Any of them returns a record, a document, or a list, or looks anything up by an id, name, or number taken from the request.","forEach":"C-27","severity":"high"},{"id":"F-03","section":"T3","type":"list","title":"Anything else wrong that you noticed in this area","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]},{"id":"C-28","section":"T4","type":"select","title":"Who is allowed to see a given record in this application?","tip":"Beneficiary apps: the user's own family. Operator apps: by access level, by selected site, or both. Write the rule as one sentence in Detail.","detail":"In one sentence: what does 'allowed to see this record' mean in this application?","options":[{"value":"beneficiary-family","label":"Beneficiary: own family only"},{"value":"operator-access-level","label":"Operator: by access level"},{"value":"operator-site","label":"Operator: by selected site"},{"value":"mixed","label":"Mixed (describe in Detail)"},{"value":"none-found","label":"No ownership rule found in code"}]},{"id":"C-29","section":"T4","type":"text","title":"Which people can a logged-in beneficiary see or change, and where is that set built?","tip":"Only themselves, their dependents, their sponsor, the whole family, or different by role. Where the set comes from (login, session, per request, token) and where it is consulted.","when":{"q":"C-08","in":["beneficiary","both","unknown"]}},{"id":"C-30","section":"T4","type":"text","title":"What do access levels mean here, and how is the selected site enforced on later requests?","tip":"List the levels or roles and what each allows. Where the selected site is stored and how later requests are limited to it.","when":{"q":"C-08","in":["operator","both","unknown"]}},{"id":"C-31","section":"T4","type":"yesno","title":"Is there a check that the user may use this application at all?","tip":"For operator apps this is the App ID check in OperatorAuthorizationFilter. It is not the same as checking a specific record.","detail":"Class, application id, and configuration location"},{"id":"C-32","section":"T4","type":"select","title":"Where does the list of records the user may see come from?","tip":"Loaded at login into the session, looked up per request, carried in the token, or nowhere.","detail":"Class and method that establishes it","options":[{"value":"roster-in-session","label":"Roster fetched at login and stored in the session"},{"value":"per-request-lookup","label":"Looked up on every request"},{"value":"jwt-claims","label":"Carried in token claims"},{"value":"not-established","label":"Not established anywhere"}]},{"id":"C-33","section":"T4","type":"select","title":"When a request names a specific record, where is it checked that this user may see that record?","tip":"This is the question the whole review is about. One shared helper is best. Role checks (hasRole, @Secured, @RolesAllowed) do not count; they say who may use the app, not who may see this record. If you cannot point at a place where the record is checked, choose none found.","detail":"Helper name and location, or examples of the ad hoc pattern","options":[{"value":"canonical-helper","label":"Single canonical helper, for example isInMyFamily(personId)"},{"value":"per-endpoint","label":"Ad hoc per endpoint"},{"value":"annotation","label":"Annotation or aspect based"},{"value":"none-found","label":"None found"}]},{"id":"R-16","section":"T4","type":"check","title":"Find where the selection made through /selectsite is stored, then check that each query, CUF request, and service call uses it.","tip":"Session attribute or token claim, then every data path.","finding":"A data path that takes a site id from the request instead, or that never looks at the stored selection.","when":{"q":"C-08","in":["operator","both","unknown"]},"severity":"high"},{"id":"F-04","section":"T4","type":"list","title":"Anything else wrong that you noticed in this area","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]},{"id":"C-34","section":"T5","type":"multiselect","title":"How do requests reach code?","tip":"JSF action methods count. Actuator is out of scope but note it if present.","detail":"Anything selected as Other","options":[{"value":"spring-mvc","label":"Spring MVC controllers"},{"value":"jaxrs","label":"JAX-RS resources"},{"value":"jsf-actions","label":"JSF managed-bean actions"},{"value":"servlets","label":"Raw servlets"},{"value":"websocket","label":"WebSocket endpoints"},{"value":"actuator","label":"Spring Boot actuator (note only)"},{"value":"other","label":"Other (describe in Detail)"}]},{"id":"C-35","section":"T5","type":"list","title":"Which endpoints take a record identifier from the request, and where is scope checked for each?","tip":"Every endpoint where the caller supplies an id for a person, family, document, or other record in the path, query string, body, or a header. One row each; the checks below ask about each row.","columns":[{"key":"methods","label":"HTTP method"},{"key":"path","label":"Path"},{"key":"idParams","label":"What the id identifies"},{"key":"mutates","label":"Writes or deletes","type":"select","options":["yes","no"]}]},{"id":"C-36","section":"T5","type":"multiselect","title":"What kinds of identifiers appear in requests?","tip":"Sequential numeric ids are the easiest to guess.","detail":"Format notes: sequential numeric, guessable, base64 of an id, and so on","options":[{"value":"person-id","label":"Person id"},{"value":"sponsor-id","label":"Sponsor id"},{"value":"family-id","label":"Family id"},{"value":"document-id","label":"Document or file id"},{"value":"db-primary-key","label":"Database primary key"},{"value":"uuid","label":"UUID or GUID"},{"value":"opaque-token","label":"Opaque or encoded token"},{"value":"composite","label":"Composite key"},{"value":"other","label":"Other (describe in Detail)"},{"value":"none","label":"No request-supplied identifiers (every record is chosen from the session or token)"}]},{"id":"R-17","section":"T5","type":"check","title":"Follow the id from the request through the service to the data call, and find the line that compares it with the caller's family, site, or access level.","tip":"Logged in plus allowed to use the app is not enough. A check only in Angular does not count. A check after the data is already written to the response does not count.","finding":"No such line on any path from this handler to the data. Any caller can then read another person's record by changing the id.","forEach":"C-35","severity":"high"},{"id":"R-18","section":"T5","type":"check","title":"Find every call site of the shared scope helper, or every record-level annotation, and compare them with the endpoints you listed in C-35.","tip":"For annotations, first confirm method security is enabled (@EnableGlobalMethodSecurity(prePostEnabled = true) or @EnableMethodSecurity); without it @PreAuthorize is ignored.","finding":"An endpoint that reaches data without the helper or annotation, calls it with a different id than it uses, or has an annotation that only checks a role.","when":{"q":"C-33","in":["canonical-helper","annotation"]},"severity":"high"},{"id":"R-19","section":"T5","type":"check","title":"If no record-level check exists anywhere in this application, that is the incident shape across the whole application.","tip":"Only mark this if you searched (C-33) and found nothing that compares a requested record with the caller, and the R-17 rows above bear that out.","finding":"It is (confirmed by your search in C-33 and the rows above). Mark it Problem found.","when":{"q":"C-33","eq":"none-found"},"severity":"high"},{"id":"R-20","section":"T5","type":"check","title":"For each endpoint that returns a list or search result, find where the family or site constraint is applied.","tip":"It must be in the query, the CUF request, or a server-side filter before the response is built.","finding":"A list fetched whole and filtered in Angular, or not constrained at all.","severity":"high"},{"id":"C-37","section":"T5","type":"select","title":"Do endpoints return whole entities or CUF objects, or DTOs with only the needed fields?","tip":"Whole objects expose every field they carry, including ones the UI never shows.","detail":"Examples, and any @JsonIgnore or @JsonView usage","options":[{"value":"entities-wholesale","label":"Entities or CUF objects serialized wholesale"},{"value":"dto-mapped","label":"DTOs mapped from domain objects"},{"value":"mixed","label":"Mixed (describe in Detail)"}]},{"id":"R-21","section":"T5","type":"check","title":"Compare the class each endpoint returns, including nested objects, with what the screen actually shows.","tip":"Compare the returned class, including nested objects, with what the component reads, whatever the class is named. A DTO filled by MapStruct, ModelMapper, or copyProperties from the full record carries the full record.","finding":"Fields in the response the screen never shows: other family members, SSNs, internal flags, audit fields.","severity":"medium"},{"id":"F-05","section":"T5","type":"list","title":"Anything else wrong that you noticed in this area","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]},{"id":"C-38","section":"T6","type":"multiselect","title":"How are request bodies turned into objects on updates?","tip":"Binding straight onto a domain or CUF object lets the client set any field the object has.","detail":"Examples with file:line","options":[{"value":"requestbody-domain","label":"@RequestBody onto a domain, entity, or CUF object"},{"value":"requestbody-dto","label":"@RequestBody onto a DTO or command object"},{"value":"modelattribute","label":"@ModelAttribute form binding"},{"value":"beanparam","label":"JAX-RS @BeanParam or @FormParam"},{"value":"jaxrs-entity","label":"JAX-RS entity parameter onto a domain or CUF object (@Consumes JSON, @PUT/@POST)"},{"value":"jsf-properties","label":"JSF managed-bean properties bound from forms"},{"value":"getparameter","label":"Manual request.getParameter"},{"value":"none-found","label":"None found (no writes)"}]},{"id":"C-39","section":"T6","type":"multiselect","title":"Is there anything that limits which fields a request can set?","tip":"@InitBinder allowed fields, read-only Jackson properties, or DTOs that only carry the intended fields.","detail":"Where applied, global or per controller, and which binding style each mechanism covers","options":[{"value":"initbinder-allowed","label":"@InitBinder setAllowedFields (covers @ModelAttribute, form, and query binding only)"},{"value":"initbinder-disallowed","label":"@InitBinder setDisallowedFields (same coverage)"},{"value":"jsonignore-setters","label":"@JsonIgnoreProperties or @JsonProperty(access = READ_ONLY) without allowSetters (covers @RequestBody and JAX-RS entities)"},{"value":"dto-only","label":"DTOs carrying only the intended fields"},{"value":"none-found","label":"None found"}]},{"id":"R-22","section":"T6","type":"check","title":"Follow the id in the URL, and any id inside the body, to the write.","tip":"The body can name a different record than the URL.","finding":"No comparison with the caller's scope before the write. Any caller can then change or delete another person's record.","forEach":"C-35","forEachWhere":{"col":"mutates","eq":"yes"},"severity":"high"},{"id":"R-23","section":"T6","type":"check","title":"List the settable fields of the class the request body binds to, and compare with what the form actually sends.","tip":"List the settable fields of the class the body lands on (a Dto name proves nothing) and compare with what the form sends. @InitBinder allow-lists cover @ModelAttribute and form binding only; for @RequestBody only @JsonIgnore, @JsonProperty(access = READ_ONLY), or a class without the field counts.","finding":"A settable id, ownership, status, or access field with no allow-list. A caller can then include it in the body and the binder sets it.","when":{"q":"C-38","includesAny":["requestbody-domain","requestbody-dto","modelattribute","beanparam","jaxrs-entity","jsf-properties","getparameter"]},"severity":"high"},{"id":"C-40","section":"T6","type":"yesno","title":"Does the app accept file uploads?","tip":"MultipartFile, @FormDataParam, or a multipart-config in web.xml."},{"id":"C-41","section":"T6","type":"text","title":"Which record does each upload attach to, and where does that record's id come from?","tip":"An upload attached to a record id taken from the request is the write-side twin of file serving.","when":{"q":"C-40","eq":"yes"}},{"id":"R-24","section":"T6","type":"check","title":"Find where the target record id is checked before the upload is stored or linked.","tip":"Also note where the stored name or path comes from.","finding":"No check. A caller can attach a file to someone else's record.","forEach":"C-41","severity":"high"},{"id":"F-06","section":"T6","type":"list","title":"Anything else wrong that you noticed in this area","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]},{"id":"C-42","section":"T7","type":"yesno","title":"Does the app return files, PDFs, images, or documents by an identifier?","tip":"Downloads, reports, forms, letters, attachments. This is the exact pattern from the incident."},{"id":"C-43","section":"T7","type":"list","title":"For each file-serving endpoint, where is it checked that the caller may have that file?","tip":"One row per endpoint that returns bytes. The check below asks about each row.","when":{"q":"C-42","eq":"yes"},"columns":[{"key":"url","label":"URL"},{"key":"idParam","label":"Identifier parameter"},{"key":"isPublic","label":"Reachable without login","type":"select","options":["yes","no"]}]},{"id":"R-25","section":"T7","type":"check","title":"Follow the id to the file path, service call, or blob read, and find the line that compares the file's owner with the caller before the first byte is read.","tip":"This is the incident. If the id is used to build a file path, also look for the canonicalisation and base-directory check.","finding":"No comparison before the bytes are read, the handler is reachable without login, or a path built from the id with no canonicalisation check. Any caller can then download anyone's file by changing the id.","forEach":"C-43","severity":"high"},{"id":"R-26","section":"T7","type":"check","title":"Find every place a file id is written into a response.","tip":"Listings, links, JSON fields, generated HTML. Note whether ids are sequential.","finding":"Ids of other people's files reaching a caller, or sequential ids together with a missing check in R-25.","when":{"q":"C-42","eq":"yes"},"severity":"medium"},{"id":"F-07","section":"T7","type":"list","title":"Anything else wrong that you noticed in this area","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]},{"id":"C-44","section":"T8","type":"multiselect","title":"How does the app read and write data?","tip":"Select everything in use, not just the main path.","detail":"Anything selected as Other","options":[{"value":"cuf","label":"CUF (Common Update Framework) client"},{"value":"rest-client","label":"Other REST service clients"},{"value":"soap-client","label":"SOAP or JAX-WS clients"},{"value":"jpa-hibernate","label":"JPA or Hibernate"},{"value":"jdbctemplate","label":"JdbcTemplate or raw JDBC"},{"value":"stored-procedures","label":"Stored procedures"},{"value":"mybatis","label":"MyBatis"},{"value":"file-system","label":"File system"},{"value":"ldap","label":"LDAP"},{"value":"other","label":"Other (describe in Detail)"}]},{"id":"C-45","section":"T8","type":"text","title":"Which backend services does the app call, and what identifier does it send them?","tip":"Services return whatever they are asked for, so the check has to happen in this app before the call. One service per line."},{"id":"C-47","section":"T8","type":"yesno","title":"Are backend services called without any authentication?","tip":"If so, this app is the only place a record-level check can happen."},{"id":"C-48","section":"T8","type":"text","title":"What identifies a record in a CUF request, and does the request carry anything about the caller's scope?","tip":"Person id, sponsor id, family id, or something else.","when":{"q":"C-44","includes":"cuf"}},{"id":"C-49","section":"T8","type":"text","title":"For direct queries and stored procedures, is the WHERE clause limited to the caller's family or site, or only to the record id?","tip":"A query that finds by id alone returns anyone's record if the id is changed.","when":{"q":"C-44","includesAny":["jpa-hibernate","jdbctemplate","stored-procedures","mybatis"]}},{"id":"R-27","section":"T8","type":"check","title":"For every service you listed in C-45, find each call site and walk back up to the scope check.","tip":"The service checks nothing; whatever id it is sent, it returns.","finding":"A call site with no scope check anywhere above it.","forEach":"C-45","severity":"high"},{"id":"R-28","section":"T8","type":"check","title":"For every query or procedure you listed in C-49, read the WHERE clause and the code that calls it.","tip":"A scope constraint in the query, or a check on the result before it is returned, is fine.","finding":"Find-by-id alone, with no scope constraint and no check on the result.","forEach":"C-49","severity":"high"},{"id":"F-08","section":"T8","type":"list","title":"Anything else wrong that you noticed in this area","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]},{"id":"C-50","section":"T9","type":"select","title":"Are authenticated responses sent with Cache-Control: no-store?","tip":"Usually a filter or the shared web-security library. Spring Security adds no-store by default unless its headers are disabled.","detail":"Where set and the header value","options":[{"value":"global-filter","label":"Global filter or header writer sets no-store"},{"value":"per-endpoint","label":"Set per endpoint only"},{"value":"none-found","label":"None found"}]},{"id":"R-29","section":"T9","type":"check","title":"Search for Cache-Control and find which data endpoints get no-store.","tip":"Usually a filter or the shared web-security library.","finding":"Data endpoints with no no-store header. Browsers and proxies may keep the responses, including on shared workstations.","when":{"q":"C-50","in":["per-endpoint","none-found","unknown"]},"severity":"low"},{"id":"C-51","section":"T9","type":"select","title":"Is directory listing disabled in weblogic.xml?","tip":"index-directory-enabled inside container-descriptor.","when":{"q":"C-07","eq":"yes"},"options":[{"value":"disabled-explicit","label":"Explicitly disabled"},{"value":"enabled-explicit","label":"Explicitly enabled"},{"value":"not-set-default","label":"Not set (container default)"},{"value":"no-weblogic-xml","label":"No weblogic.xml present"}]},{"id":"C-52","section":"T9","type":"text","title":"Which folders are served as static content, and is anything besides frontend assets in them?","tip":"Resource handlers, the default servlet, src/main/webapp. Config files, source maps, or documents under a static folder are reachable by URL."},{"id":"R-30","section":"T9","type":"check","title":"Check index-directory-enabled in weblogic.xml, then walk each static root.","tip":"Config files, source maps, backups, documents.","finding":"Directory listing enabled, or anything under a static folder that is not a frontend asset.","when":{"any":[{"q":"C-51","in":["enabled-explicit","not-set-default","no-weblogic-xml"]},{"q":"C-52","notEmpty":true}]},"severity":"low"},{"id":"F-09","section":"T9","type":"list","title":"Anything else wrong that you noticed in this area","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]},{"id":"C-53","section":"T10","type":"text","title":"Which JSF pages hold a record id in a backing bean, and where does that id come from?","tip":"A view parameter, f:param, a managed-property bound to #{param.x}, getRequestParameterMap(), or f:attribute on a command link comes from the request and can be changed. A session attribute cannot."},{"id":"C-54","section":"T10","type":"select","title":"Is JSF view state saved on the server, or on the client, and if on the client is it encrypted?","tip":"javax.faces.STATE_SAVING_METHOD in web.xml; absent means server. For client-side state, MyFaces and Mojarra 2.2 and later encrypt by default; older Mojarra and the JSF 1.2 reference implementation need ClientStateSavingPassword.","options":[{"value":"server-side","label":"Server-side state saving"},{"value":"client-encrypted","label":"Client-side, encrypted"},{"value":"client-unencrypted","label":"Client-side, not encrypted"}]},{"id":"R-31","section":"T10","type":"check","title":"For every page you listed in C-53, find where the identifier enters the bean and every action method that uses it.","tip":"A view- or session-scoped bean keeps the id between requests, and a postback can change it. A managed-property bound to #{param.x} is re-read on every request.","finding":"No scope check when the page loads, or an action that trusts an id a postback can change.","forEach":"C-53","severity":"high"},{"id":"R-32","section":"T10","type":"check","title":"Check javax.faces.STATE_SAVING_METHOD and the implementation's secret key parameter.","tip":"Client-side state travels to the browser.","finding":"Client-side state without encryption. A caller can edit held identifiers.","when":{"q":"C-54","in":["client-unencrypted","unknown"]},"severity":"medium"},{"id":"F-10","section":"T10","type":"list","title":"Anything else wrong that you noticed in this area","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]},{"id":"F-12","section":"T12","type":"list","title":"Anything else wrong that no topic covered","tip":"Where it is (URL, class, or file), what is wrong, and how bad you think it is.","optional":true,"findings":true,"columns":[{"key":"location","label":"Where (URL, class, or file)"},{"key":"description","label":"What is wrong","type":"long"},{"key":"relatedItem","label":"Related item (optional)"},{"key":"severity","label":"How bad","type":"select","options":["high","medium","low","not sure"]}]}],"gaps":[{"id":"C-06","title":"Source of the shared libraries this review depends on","col":"obtained","eq":"no","text":"a needed source was not obtained; every check that depends on that library must be unable with the reason \"source of \u003cartifact> not available\", not pass","labelCol":"artifact","reasonCol":"reason"}]}</script>
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
  var CITE_RE = /[\w\/.\\-]+\.(?:java|ts|js|xml|properties|ya?ml|json|html?|jspx?|xhtml|sql|txt|gradle|md)(?::\d+)?/i;
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
    where.addEventListener('input', function () { rec.location = where.value; touch(item.id); });
    block.appendChild(h('label', { class: 'fld' }, [whereLabel, where]));
    var whatLabel = h('span', { text: 'What is wrong' });
    var what = textarea(2, '', rec.findings, function (v) { rec.findings = v; touch(item.id); }, 'What is wrong');
    var whatWrap = h('label', { class: 'fld' }, [whatLabel, what]);
    block.appendChild(whatWrap);
    function sync() {
      var s = rec.status;
      whereLabel.textContent = s === 'finding' ? 'Where the problem is' : (s === 'pass' ? 'Where the check is (required)' : 'Where');
      if (s === 'finding') { whatLabel.textContent = 'What is wrong, and what a caller could do'; whatWrap.hidden = false; }
      else if (s === 'unable') { whatLabel.textContent = 'What you tried and where the trail ended'; whatWrap.hidden = false; }
      else if (s === 'na') { whatLabel.textContent = 'Why it does not apply'; whatWrap.hidden = false; }
      else { whatWrap.hidden = true; }
    }
    sync();
    return block;
  }
  function renderCheck(item) {
    var box = h('div', { class: 'checkbox' });
    function draw() {
      box.innerHTML = '';
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
    var head = h('header', { class: 'ihead' }, [
      h('span', { class: 'iid', text: item.id }),
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
    if (a.perRow) Object.keys(a.perRow).forEach(function (k) {
      var x = a.perRow[k] || {};
      var lab = (function () { var rows = (state.answers[item.forEach] || {}).rows || []; var r = rows.filter(function (q) { return q._id === k; })[0]; return r ? rowLabel(r) : k; })();
      if (hasText(x.evidence)) aiBits.push(['Evidence (' + lab + ')', x.evidence]);
      if (hasText(x.whyNoMore)) aiBits.push(['Why no more findings (' + lab + ')', x.whyNoMore]);
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
    var root = h('article', { class: 'item', 'data-id': item.id, id: 'item-' + item.id }, [
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
      var diff = renderCompare(it, u);
      if (compare) {
        cmpTotal++;
        if (diff) { cmpDiff++; u.root.hidden = false; }
        else if (onlyDiff) u.root.hidden = true;
      }
      if (!on) {
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
        } else {
          if (a.status === 'finding') findings++;
          u.chip.textContent = a.status ? (ok ? statusLabel(a.status) : (a.status === 'pass' ? 'Say where the check is' : 'Describe the problem')) : 'Open';
          u.chip.className = 'chip ' + (a.status === 'finding' ? 'chip-bad' : (a.status === 'unable' ? 'chip-warn' : (ok ? 'chip-ok' : (a.status ? 'chip-warn' : 'chip-open'))));
        }
      } else {
        u.chip.textContent = ok ? (unc ? UNSURE_LABEL : (DEV ? 'Done' : 'Complete')) : (answered(it) ? 'Needs evidence' : 'Open');
        u.chip.className = 'chip ' + (ok ? (unc ? 'chip-warn' : 'chip-ok') : (answered(it) ? 'chip-warn' : 'chip-open'));
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
    return { status: status, location: join('location'), findings: join('findings'), evidence: join('evidence'), whyNoMore: join('whyNoMore'), reason: join('reason') };
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
            return r;
          });
        } else {
          rec.status = a.status || null; rec.location = a.location || ''; rec.findings = a.findings || '';
          if (rec.status === 'na' || rec.status === 'unable') rec.reason = a.findings || '';
          if (hasText(a.evidence)) rec.evidence = a.evidence;
          if (hasText(a.whyNoMore)) rec.whyNoMore = a.whyNoMore;
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
        a.perRow[target._id] = { status: x.status || undefined, location: locationOf(x), findings: x.findings || (x.reason && !/^rule:/.test(x.reason) ? x.reason : ''), evidence: x.evidence || '', whyNoMore: x.whyNoMore || '' };
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
