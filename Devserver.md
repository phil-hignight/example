# Fast Local Dev Runtime — Design & Build Plan

A lightweight, fast-starting replacement for the local WebLogic deploy loop. It runs
classic Spring MVC / JAX-RS WAR projects directly from source, fakes the small slice of
WebLogic container services the apps actually use, hot-recompiles changed classes, and
serves Angular frontends with native hot reload — all proxied behind a single origin so
relative `/ws` and `/api` calls "just work."

The goal is to collapse the ~20-minute Maven-build → EAR → WebLogic-deploy → login loop
into a sub-minute edit/refresh loop, with no new downloads in a restricted environment.

---

## 0. How to read this spec (build agent: read first)

This spec is written to be implemented by a **less-capable, offline coding agent**
(Gemini 3.5 Flash class, no internet). That shapes everything below:

- **All design decisions are already made.** Do not redesign, choose between alternatives,
  or "improve" the architecture. Where a choice existed, this doc has already made it. If
  something seems suboptimal, build it as written — the trade-off was deliberate.
- **You cannot look anything up.** Every external API you need (Hikari, Jersey, Spring
  context wiring, the JDK `HttpServer`, JNDI SPI) is given in §15 (Reference Code & Exact
  APIs) with exact class names, method names, and call order. **Use §15 verbatim. Do not
  invent method names from memory** — if a method isn't in §15 and you're unsure, stop and
  flag it rather than guess.
- **Build strictly one step at a time** (§13), in order. Each step states what it **Proves**,
  what to **Build**, how to **Verify** (the pass check), and what to do **If it fails**. Do not
  start a step until the previous one's Verify passes. Do not combine steps. If a Verify fails,
  read that step's "If it fails" first — it names the most likely broken assumption and the
  fix.
- **The runtime explains itself; read its output, don't infer.** Primary debug surface is the
  **captured log** (§11.6): `GET /logs` / `GET /logs/tail`, searchable by app/level/text — the
  apps' own output plus reload/compile results. The agent's loop is edit → save → autocompile →
  run a test → read the log. The runtime also exposes structured state as JSON (§11.5): `/model`
  (what it parsed), `/classpath` (loader layers + mode), `/routes` (routing table), `/dryrun`
  (plan, no side effects), `/events` (decision log), and structured errors with `phase`/`cause`/
  `hint`. When something surprises you, read the log first, then query these — don't guess.
- **Prefer the dumb, explicit version.** Where this doc offers a simple approach and notes a
  cleverer optimization "for a later pass," build the simple one. Optimizations marked LATER
  are out of scope for v1.
- **When unsure, throw a loud error rather than guess.** A method that throws
  `UnsupportedOperationException("not implemented: <what>")` surfaces the gap. A method that
  silently returns `null` hides it and creates a mystery bug. Fail loud.

§1–§12 are design + rationale. §11.5 is the agent-observability design. §13 is the
step-by-step build plan. §14 is risks. **§15 is your API cheat-sheet — keep it open while
coding.**

---

## 1. Scope & non-goals

### In scope (v1)
- Classic Spring MVC WAR projects (packaging `war`, bootstrapped by `web.xml` +
  `ContextLoaderListener` + `DispatcherServlet`).
- JAX-RS resources hosted via Jersey's `ServletContainer`.
- Plain `HttpServlet`s declared in `web.xml`, including `load-on-startup` ordering.
- Servlet `Filter` chain (the apps rely on filters — notably a JWT filter on `/ws/*`).
- Fake JNDI: `jdbc/*` datasources (parsed from committed `*data-sources.xml`) and
  `env-entry` values from `web.xml`.
- Per-app **child-first** classloaders parented to a stable framework loader and the
  resolved WebLogic shared libraries.
- File watching + in-process incremental recompile (`javax.tools.JavaCompiler`). **Reload uses
  the fast-restart model:** the framework + shared-lib classloaders stay warm for the whole
  session; only the app's own "restart" classloader is discarded and its Spring context
  rebuilt (lazy-init makes this ~sub-second). One decision path; no per-class bean analysis.
  Non-Java resource/static changes skip the Java side entirely. (See §3 reload rule.)
- Angular apps run via their own `ng serve`; the runtime reverse-proxies them and routes
  their backend calls to the in-JVM apps.
- A control HTTP API the coding agent drives (add/start/stop/status/logs).
- Dev identity injection (mint/attach a JWT for a chosen user).

### Explicit non-goals (v1)
- **JSP / Jasper.** Confirmed not needed. `welcome-file index.jspx` and JSP error pages
  are ignored. Real UIs are Angular.
- **Spring Boot services.** Deferred. When added, run them as a child process on their
  own port and proxy to them (same pattern as `ng serve`), NOT by hosting their
  `DispatcherServlet`.
- **EJB, JMS, JTA/global transactions.** Apps don't use them.
- **Real WebLogic security, full audit pipeline.** Filters can be selectively bypassed in
  dev.
- **Production concerns** (clustering, TLS, etc.).

---

## 2. Confirmed environment facts (design inputs)

These are established and the design depends on them. If any change, revisit the noted
section.

| Fact | Source | Affects |
|---|---|---|
| Java 11, WebLogic 12c | stated | everything |
| Apps are classic Spring MVC WARs; some web services are Boot (deferred) | pom `packaging war`, no Boot starters | §6 bootstrap |
| Root context via `ContextLoaderListener`, `contextConfigLocation` = `/WEB-INF/applicationContext.xml /WEB-INF/applicationContext_enrollment.xml` | web.xml | §6 |
| Web context via `DispatcherServlet` mapped to `/ws/enrollment/*` | web.xml | §6 |
| Filters: `AuditFilter`(`*`), `CrossOriginFilter`(`/*`), `JwtFilter`(`/ws/*`), `webdoesHelpFilter` | web.xml | §5, §9 |
| Plain servlets w/ load-on-startup: `AppMonitorServlet`(1), `CUFCacheRefreshController`(0), `FeeGatewaySim` | web.xml | §5 |
| `env-entry` `logging-context` (String) | web.xml | §7 |
| `${app.id}`, `${app.name.short}`, `${regionproperties.version}` etc. resolve from the **parent pom** `<properties>` | stated | §8 |
| Datasource descriptor is a flat custom `<wls-data-source>` with attributes | TEST1_data-sources.xml | §7 |
| TNS alias URLs (`jdbc:oracle:thin:@DMTPD`); `tnsnames.ora` at `D:/TNSNAMES/tnsnames.ora` | stated | §7 |
| `prefer-web-inf-classes` controls delegation order; **`true`=child-first**, absent/`false`=parent-first (WebLogic default) | weblogic.xml | §4 |
| `context-root` is declared in weblogic.xml (`/milconnect`, `/portlet-enrollment`) | weblogic.xml | §6 |
| Shared libs are named version-less refs: `sharedlib.appmonitor`, `sharedlib.portlet-common`, `sharedlib.regionproperties` (+ commented `cuf-client`, `applicationsecurity-policyagent`) | weblogic.xml, weblogic-application.xml | §4, §10 |
| Oracle driver `oracle.jdbc.OracleDriver`, bundled by WebLogic | stated | §7 |

### Library inventory (confirmed available — no download needed)
Jackson, HikariCP, `javax.ws.rs-api`, `jersey-server` 2.35, `jersey-hk2` 2.35,
`jersey-container-servlet` + `-core` 2.35, all Spring (web/webmvc/context/core/beans),
Angular CLI + `@angular-devkit/build-angular`, Oracle JDBC (WebLogic module).
`javax.servlet-api` (3.1.0/4.0.1) available from Maven repo — **compile/provided only**.

---

## 3. Top-level architecture

One JVM process ("the runtime") plus N child `ng serve` processes.

```
                          ┌─────────────────────────────────────────────┐
   Browser ──────────────▶│  Reverse Proxy / Single Origin (one port)   │
                          │  - routes /<frontend>/*  → ng serve child    │
                          │  - routes /<ctx-root>/*  → hosted app servlet│
                          └───────┬─────────────────────────┬───────────┘
                                  │                          │
                  ┌───────────────▼──────────┐    ┌──────────▼───────────┐
                  │  ng serve (child proc)    │    │  Servlet Container    │
                  │  per Angular app          │    │  Shim (over JDK       │
                  │  native HMR               │    │  HttpServer)          │
                  └───────────────────────────┘    │  - filter chain       │
                                                    │  - DispatcherServlet  │
                                                    │  - Jersey ServletCnt  │
                                                    │  - plain servlets     │
                                                    └──────────┬───────────┘
                                                               │
                    ┌──────────────────────────────────────────┼───────────────────┐
                    │                          │                │                   │
            ┌───────▼────────┐    ┌────────────▼─────┐  ┌───────▼───────┐  ┌────────▼────────┐
            │ Per-app child- │    │ Fake JNDI:        │  │ File Watcher  │  │ Control API     │
            │ first loader   │    │ jdbc/* + env-entry│  │ + JavaCompiler│  │ (agent-facing)  │
            └───────┬────────┘    └──────────────────┘  └───────────────┘  └─────────────────┘
                    │
            ┌───────▼───────────────────────┐
            │ Stable framework loader        │  (Spring, Jersey, Jackson, servlet-api,
            │                                │   HikariCP — loaded once, never reloaded)
            └───────┬───────────────────────┘
                    │
            ┌───────▼───────────────────────┐
            │ Resolved WebLogic shared libs  │  (per-app subset from <library-ref>)
            └────────────────────────────────┘
```

### Components
1. **HTTP layer** — JDK `com.sun.net.httpserver.HttpServer`. Zero deps.
2. **Servlet container shim** — adapts `HttpServer` exchanges to the Servlet 3.1 API,
   manages a `ServletContext` per app, runs the filter chain, dispatches to servlets. The
   one genuinely custom build item (§5).
3. **Classloader stack** — stable framework loader → resolved shared libs → per-app
   child-first loader (§4).
4. **App bootstrap** — parses `web.xml` + `weblogic.xml`, builds Spring contexts, registers
   servlets/filters (§6).
5. **Fake JNDI + env-entry provider** (§7).
6. **Property resolver** — parent-pom `<properties>` → `${...}` substitution in descriptors (§8).
7. **Watch + incremental compile + tiered reload** (§9 build phases; reload boundary below).
8. **Angular layer + reverse proxy** (covered across §3 and build phases).
9. **Control API** — agent-facing (§11).

### The reload rule (v1 — fast restart, single safe path)

The speed win is real but it does **not** come from "skipping Spring for non-bean changes."
That approach is a correctness trap: the live beans Spring already instantiated were loaded
by the *old* classloader and hold references to the *old* version of every class. Swapping in
a new util class without rebuilding means old beans keep calling old code (your change never
runs), and passing objects across the old/new boundary throws `ClassCastException`. So there
is **no safe "keep the context, swap the class" path** for any class a live bean can reach.

Instead, use the model real tools (spring-boot-devtools, JRebel-lite) use: **keep the
expensive stuff warm, throw away only the cheap stuff, and make the rebuild fast.** Concretely
the classloader stack (§4) already splits this for you:

- **Base / framework loader + shared-libs loader = WARM. Never discarded.** Spring, Jersey,
  Jackson, Hikari jars, and the shared libs stay loaded for the whole dev session. This is
  the 8-12 seconds of class-loading you pay **once**.
- **Per-app "restart" loader (the throwaway) = only the app's own `target/classes`.** This is
  the only loader discarded on a change. Reloading it is ~100-150ms.

So the reload decision has exactly **one Java path**, which a build agent cannot get wrong:

| Change | Action |
|---|---|
| File under the Angular project (frontend) | Nothing — `ng serve` handles it. |
| File under a **resource/static** path (not `.java`) | Reload that resource only; **no Spring rebuild**, no loader swap. (See safe-skip list below.) |
| **Any `.java` → recompiled `.class`** | Recompile changed files → discard the app's restart loader + Spring contexts → recreate the restart loader and re-run the Spring bootstrap (§6). Base/shared loaders untouched. |

There is no "is it a bean?" decision. Every `.java` change rebuilds the context. The
architecture (warm base loader) plus **`spring.main.lazy-initialization=true`** is what makes
that rebuild fast — empirically ~400ms-2s versus the ~20-minute WebLogic loop. That is the
fast path.

**Safe-skip list (no Spring rebuild — these never hit the staleness trap):** changes to files
that are not Java classes on the app classpath — i.e. under `src/main/webapp` static assets,
the Angular project, or plain resource files Spring re-reads per request. Do NOT add compiled
`.class` files or Spring XML/config to this list; those must rebuild.

**Why not a finer-grained skip?** Determining which `.java` changes are "safe" to skip
requires reasoning about whether the class is reachable from a live bean — exactly the
judgment that is unsafe to get wrong and hard for the build agent. The warm-base-loader design
already captures ~90% of the available speedup with zero risk, so v1 takes it and stops there.

**Making the rebuild even faster is a tuning task, not a redesign (LATER):** raising
`load-on-startup` laziness, caching the parsed descriptor model between rebuilds, and reusing
the root context when only the web context changed. These are safe optimizations a later pass
can add on top of the always-rebuild rule without changing its logic.

### What "discard the restart loader" must do (required teardown, in order)
Before recreating the loader on each rebuild, to avoid leaks and stale state:
1. `webContext.close()` then `rootContext.close()` (child context first). This releases Hikari
   pools and stops Spring-managed threads.
2. Deregister servlets/filters for this app from the shim routing table.
3. `DriverManager.deregisterDriver(...)` for any JDBC driver the app's loader registered.
4. Clear any thread-locals the app set; null all references to the old loader and contexts so
   they become GC-eligible.
5. Recreate the restart loader (§15.2) over the freshly compiled `target/classes`, then re-run
   the Spring bootstrap (§6 / §15.3).

If a loader fails to GC after several reloads (Metaspace climbing), the control API's
hard-restart endpoint tears the whole app down and rebuilds from scratch — the escape hatch
for leaks the incremental path can't clear.

---

## 4. Classloader design

Three stable layers + one throwaway, per app:

1. **System/app loader** — the runtime's own classes + JDK.
2. **Stable framework loader** (created once): Spring, Jersey, HK2, Jackson, HikariCP, and
   the **servlet-api interfaces**. Critical: servlet-api loads here exactly once so the shim
   and every app share the same `HttpServletRequest` type (otherwise `ClassCastException`).
3. **Shared-libs loader(s)**: the resolved on-disk jars for the app's `<library-ref>` set.
   May be shared across apps when refs match; cache by resolved path set.
4. **Per-app child-first loader** (throwaway): the app's own `target/classes` (compiled by
   us into a scratch dir we own — never the user's tree) + the app's bundled
   `WEB-INF/lib/*.jar`.

**Delegation order is read from the app's `weblogic.xml`**, matching WebLogic:
`<prefer-web-inf-classes>true</prefer-web-inf-classes>` → **child-first**; tag absent or
`false` → **parent-first** (WebLogic's default). Read the value; do not hardcode one mode.

The two modes are one loader with the lookup order flipped — **not** two code paths. Use the
exact `loadClass` implementation in **§15.2**; it takes a `boolean childFirst` and handles
both. Do not write your own delegation logic from scratch — adapt §15.2 verbatim.

**The framework-isolation set is unconditional** (independent of `childFirst`). A fixed list
of package prefixes — `java.`, `javax.`, `org.springframework.`, `org.glassfish.`,
`com.fasterxml.jackson.`, `com.zaxxer.hikari.` — ALWAYS delegates to the parent, even in
child-first mode. This list is hardcoded in §15.2. WebLogic behaves the same way:
`prefer-web-inf-classes` never lets an app shadow the servlet API or core framework. Getting
this wrong loads a second copy of e.g. `HttpServletRequest` → `ClassCastException`. The
isolation list is not configurable and the agent must not change it.

**Reload = discard layer 4 and rebuild it.** Layers 1–3 persist. Before discarding:
- close the app's Spring context(s) (release Hikari pools, stop app threads),
- deregister servlets/filters for that app from the shim,
- clear thread-locals, deregister any JDBC drivers the child registered,
- null references so the loader is GC-eligible.

**Leak mitigation:** set `-XX:MaxMetaspaceSize`, log Metaspace after each reload, and expose
a control-API "hard restart this app" escape hatch for when a loader won't collect.

---

## 5. Servlet container shim (the long pole)

Implement the minimal slice of Servlet 3.1 that `DispatcherServlet`, Jersey
`ServletContainer`, and the app's plain servlets/filters actually call. Implement only what's
needed; throw `UnsupportedOperationException` on the rest so gaps surface loudly.

### Objects to implement
- `HttpServletRequest` — method, requestURI, contextPath, servletPath, pathInfo,
  queryString, parameters (query + `application/x-www-form-urlencoded` body), headers,
  `getInputStream`/`getReader`, attributes, cookies, contentType, contentLength,
  characterEncoding, `getRequestDispatcher` (minimal), `getSession` (in-memory sessions).
- `HttpServletResponse` — status, headers, `getOutputStream`/`getWriter`, contentType,
  `sendError`, `sendRedirect`, `addCookie`, buffer/flush.
- `ServletContext` — init params (from `web.xml` `context-param`), attributes,
  `getRealPath`, resource lookups against the app's `src/main/webapp`, logging, context path.
- `ServletConfig` / `FilterConfig` — init params, back-reference to `ServletContext`.
- `FilterChain` — ordered execution honoring `web.xml` `filter-mapping` url-patterns.

### Behaviors
- **Routing:** match incoming path to `<context-root>` (from weblogic.xml), then to a
  servlet-mapping within the app. Longest-prefix / exact / extension matching per the
  servlet spec subset actually used (the apps use prefix `/ws/enrollment/*`,
  `/appmonitor.status/*`, and exact `feegateway`).
- **Filter chain:** build the ordered chain from `filter-mapping` for the request path;
  run before the target servlet. The JWT filter on `/ws/*` MUST run (or be explicitly
  dev-bypassed via config).
- **`load-on-startup`:** at app start, instantiate + `init()` servlets with
  `load-on-startup >= 0` in ascending order (so `CUFCacheRefreshController`=0 then
  `AppMonitorServlet`=1).
- **Sessions:** simple in-memory `HttpSession` keyed by a cookie; honor
  `session-config` timeout loosely. `cookie-path` from weblogic.xml session-descriptor.
- **Lifecycle listeners:** fire `ServletContextListener.contextInitialized` for declared
  listeners (`ContextLoaderListener`, the app's `ContextListener`, the log4j listener,
  `RequestContextListener`) in `web.xml` order. Order matters — Spring's
  `ContextLoaderListener` must run before anything touching the dispatcher.

### Surface-locking step (do this first, before coding the shim)
Produce a checklist of every `HttpServletRequest`/`Response`/`ServletContext`/`ServletConfig`
method, each tagged: **REAL / NOOP / THROW**. This checklist is the shim's contract and the
first artifact the agent writes (build phase 1a).

---

## 6. App bootstrap (classic WAR)

Given a project path, the runtime:

1. **Discover descriptors** (read-only, no build): `pom.xml` (+ parent pom for properties),
   `src/main/webapp/WEB-INF/web.xml`, `.../weblogic.xml`, optionally
   `META-INF/weblogic-application.xml`, and the committed `*data-sources.xml`.
2. **Resolve properties** (§8) and apply `${...}` substitution to descriptor contents
   in-memory.
3. **Resolve context-root** from weblogic.xml (`/milconnect`, `/portlet-enrollment`).
4. **Resolve shared libs** from `<library-ref>` names → on-disk jar sets (§10) → build
   layers 3 + 4 of the classloader stack (§4).
5. **Compile** the app's `src/main/java` (and any generated sources it needs — flag if
   annotation processors/codegen are involved) into our scratch output dir.
6. **Fake JNDI bind** datasources + env-entries (§7).
7. **Fire listeners** in `web.xml` order. `ContextLoaderListener` builds the **root**
   `XmlWebApplicationContext` from `contextConfigLocation`
   (`/WEB-INF/applicationContext.xml /WEB-INF/applicationContext_enrollment.xml`), with
   lazy-init enabled.
8. **Register servlets:** create each `<servlet>`. For `DispatcherServlet`
   (`services-enrollment-dispatcher`), build its web `XmlWebApplicationContext`
   (default `/WEB-INF/<servlet-name>-servlet.xml` unless an init-param overrides) as a child
   of the root context. Honor `load-on-startup`.
9. **Register filters** with their mappings.
10. **Mount** the app's context-root in the reverse proxy / shim routing table.

**Property/config note:** enable lazy-init by injecting
`spring.main.lazy-initialization=true` (or, for XML contexts, set
`default-lazy-init="true"` on the bean factory programmatically / wrap the context creation
to mark all definitions lazy). Provide a config flag to disable when debugging startup-time
beans.

---

## 7. Fake JNDI, datasources, env-entries

### JNDI provider
Stand up a minimal in-process JNDI `InitialContextFactory` so
`new InitialContext().lookup("jdbc/...")` and `java:comp/env/...` resolve. Set it via
`-Djava.naming.factory.initial=<ourFactory>` (or install programmatically).

### Datasource parsing (flat custom format)
For each `<wls-data-source>` element, read attributes:

| Attribute | Maps to |
|---|---|
| `jndi-name` | JNDI key to bind (`jdbc/milconnectDS`) |
| `jdbc-driver` | `oracle.jdbc.OracleDriver` |
| `url` | Hikari `jdbcUrl` (`jdbc:oracle:thin:@DMTPD`) |
| `username` / `password` | Hikari user/pass |
| `min-connections` | `minimumIdle` |
| `max-connections` | `maximumPoolSize` |
| `capacity-increment` | ignored |

Build one `HikariDataSource` per entry; bind at `jndi-name`. Also honor the
`<resource-description>` `res-ref-name` → `jndi-name` aliasing from weblogic.xml.

### TNS resolution
TNS alias URLs require `-Doracle.net.tns_admin=D:/TNSNAMES` (default to that path, make it a
config setting; also read existing `TNS_ADMIN` env if present). Validate one real connection
at app start and surface failures via the control API.

### env-entry
Bind `web.xml` `<env-entry>` values (e.g. `logging-context` : String) into `java:comp/env`.
The app's `ContextListener` / log4j listener may read these at startup.

---

## 8. Property resolution

`${...}` tokens in descriptors come from the **parent pom** `<properties>`. The runtime:
1. Locates the parent pom via the project pom's `<parent>` coordinates / relativePath.
2. Reads `<properties>` (and the project pom's own, project wins).
3. Substitutes `${name}` in web.xml / weblogic.xml / context XML as they're loaded.

Unresolved tokens → log a clear warning naming the missing property (don't silently leave
literal `${...}` — that's a classic startup failure). Provide a config map for manual
overrides.

---

## 9. Filters & dev identity (JWT)

The app enforces auth via `JwtFilter` on `/ws/*`. For local dev:

- **Dev login endpoint** on the control/proxy layer: `POST /dev/login {user, claims?}`
  mints a JWT with the claims the app expects and either sets it as a cookie or causes the
  proxy to attach `Authorization: Bearer <jwt>` to proxied `/ws/*` requests automatically.
- **Open question to resolve during build:** how does `JwtFilter` validate — signature
  (which key?) or parse-only in test regions? If signature-checked, the runtime must sign
  with a key the filter accepts (supply the dev/test key, or run the test region's public
  key). If parse-only, trivial.
- **Per-filter dev controls:** config to bypass `AuditFilter` and `webdoesHelpFilter` in
  dev; keep `CrossOriginFilter` and `JwtFilter` (with injected dev token) active.

---

## 10. Shared library resolution

`<library-ref>` names (`sharedlib.appmonitor`, `sharedlib.portlet-common`,
`sharedlib.regionproperties`, …) must resolve to on-disk jar sets. These are deployed to
WebLogic, so they live under the WebLogic library/deployment area on the dev box.

- Build a **resolver**: name → directory/jar-set. Source the mapping from the WebLogic
  library directory (the deployed shared libraries). Since refs are version-less here, match
  by library name; if multiple versions exist, pick highest or take a config override.
- **User responsibility (accepted):** libraries must already be deployed to WebLogic; the
  runtime piggybacks on those files and does not fetch them.
- Cache resolved sets; reuse the same layer-3 loader across apps with identical ref sets.
- Surface unresolved refs clearly via the control API (app won't start correctly without
  them).

---

## 11. Control API (agent-facing)

Plain HTTP+JSON on a fixed port (served by the JDK `HttpServer` or a small Jersey resource).
Structured errors are the highest-value part — they close the agent's edit/fix loop.

| Method / path | Purpose |
|---|---|
| `POST /apps` `{path, type?}` | Introspect a project; register it; return `{id, type, contextRoot, mountUrl}`. `type` auto-detected (war / angular) if omitted. |
| `POST /apps/{id}/start` | Build classloaders, compile, bind JNDI, start contexts, mount. |
| `POST /apps/{id}/stop` | Tear down context, unmount, release pools/threads. |
| `POST /apps/{id}/restart` | Hard restart (full teardown + rebuild) — the leak/escape hatch. |
| `GET /apps/{id}/status` | `{state, lastCompile:{ok,errors[]}, jndiBound[], libsResolved[], libsMissing[], lastReload}` |
| `GET /apps/{id}/logs?since=` | App + runtime logs for this app. |
| `GET /logs?app=&level=&logger=&since=&contains=&limit=` | **Primary debug surface (§11.6):** search captured logs across apps by level/logger/time/text. |
| `GET /logs/tail?app=` | Most recent captured log records — the default "what just happened" read. |
| `GET /apps/{id}/model` | **Introspect (read-only):** the parsed descriptor model — contextRoot, listeners (ordered), servlets+mappings, filters+mappings, env-entries, datasource refs, library refs, resolved `${...}` values. Lets the agent see what the runtime parsed without changing anything. |
| `GET /apps/{id}/classpath` | **Introspect (read-only):** the resolved classpath per loader layer (framework / shared-libs / app-restart), and the delegation mode (child-first/parent-first) with the reason. |
| `GET /apps/{id}/routes` | **Introspect (read-only):** the routing table — which path patterns map to which servlet/filter chain, and (for frontends) which backend `/ws` calls route to. |
| `POST /apps/{id}/dryrun` | **Introspect (no side effects):** run the bootstrap planning steps (parse, resolve props, resolve libs, build classpath) and return what it *would* do, including any problems found, WITHOUT compiling, binding JNDI, or starting contexts. The agent's primary "test a hypothesis cheaply" probe. |
| `DELETE /apps/{id}` | Stop + forget. |
| `POST /dev/login` `{appId,user,claims?}` | Mint/attach dev JWT. |
| `GET /health` | Runtime up, JDK-not-JRE confirmed, Metaspace, app count. |
| `GET /events?appId=&since=` | **Decision log (read-only):** structured decision/event trace (see §11.5). |

Compile and startup errors must be returned as structured JSON (file, line, message) so the
agent can act without scraping stack traces.

---

## 11.5 Design for agent observability

The runtime is both built and operated by the same less-capable agent. It cannot infer the
runtime's internal state from prose logs or stack traces — so the runtime must **externalize
its state and its decisions as structured data the agent can read mechanically.** The guiding
rule: *never make the agent infer something the runtime already knows; serialize it instead.*

This is deliberately scoped to be cheap to build — mostly **serializing state the runtime
already computes**, not new machinery. Three pillars:

### 1. Structured errors (always)
Every error from the control API is an object, never a bare stack trace:
```json
{
  "ok": false,
  "phase": "resolve-shared-libs",      // which operation was running
  "appId": "enrollment",
  "cause": "missing-shared-lib",       // a code, see named-failures below
  "detail": "library-ref 'sharedlib.appmonitor' did not resolve to any jar set",
  "offending": "sharedlib.appmonitor", // the specific input at fault
  "hint": "confirm the library is deployed to WebLogic and the library dir is configured (§10)",
  "raw": "<original exception + stack, kept for the hard cases>"
}
```
`phase` + `offending` are the high-value fields — they point the agent at one thing. `raw` is
always included so nothing is lost when the diagnosis is uncertain.

### 2. Named known-failures (conservative middle path)
The runtime recognizes a **small, fixed set** of failure modes where the cause is certain, and
tags them with a `cause` code + `hint`. Only these get an interpreted diagnosis; everything
else returns `cause: "unclassified"` with the raw error (do NOT guess a cause — a confident
wrong diagnosis is worse than none). The v1 known-failure set:

| `cause` code | Detected when | `hint` |
|---|---|---|
| `jdk-required` | `ToolProvider.getSystemJavaCompiler()` is null | Run the runtime on a JDK, not a JRE (§15.4). |
| `missing-shared-lib` | a `<library-ref>` resolves to nothing | Deploy the lib to WebLogic / set the library dir (§10). |
| `unresolved-placeholder` | a `${...}` token remains after property resolution | The named property is missing from the parent pom; add it or override (§8). |
| `datasource-unreachable` | Hikari fails to open the validation connection | Check TNS alias + `oracle.net.tns_admin` + credentials (§7). |
| `duplicate-framework-class` | `ClassCastException`/`LinkageError` mentioning a framework type | A framework class leaked into the app loader; check the PARENT_ONLY list (§15.2). |
| `compile-error` | `JavaCompiler` task returns false | Return the diagnostics (file/line/message); fix the source. |
| `missing-codegen` | a referenced generated class is absent | The app relies on Maven codegen; pre-generate or reuse (§12.2). |

### 3. Introspection without mutation (read-only probes)
The agent must be able to **ask questions without changing state** — so it can build a correct
model before acting, instead of mutate-rebuild-guess loops. These are the `/model`,
`/classpath`, `/routes`, and `/dryrun` endpoints above. `/dryrun` is the most important: it
runs all the *planning* (parse, resolve, build classpath) and reports problems with zero side
effects, so the agent can confirm "will this app even resolve?" in one cheap call.

### 4. Decision log (`GET /events`)
A structured, append-only trace of **decisions**, separate from human prose logs. Each event:
`{ts, appId, phase, decision, detail}`. Examples the runtime must emit:
- `{phase:"classloader", decision:"child-first", detail:"weblogic.xml prefer-web-inf-classes=true"}`
- `{phase:"reload", decision:"skip-spring", detail:"change under src/main/webapp static"}`
- `{phase:"reload", decision:"rebuild-context", detail:"App.java changed; rebuilt in 1.4s"}`
- `{phase:"jndi", decision:"bound", detail:"jdbc/milconnectDS → pool(max=20)"}`
- `{phase:"routing", decision:"mapped", detail:"/ws/enrollment/* → services-enrollment-dispatcher"}`
When behavior surprises the agent, it reads the actual decision instead of inferring it.

**Build note:** these are serializations of state the components already hold. Implement them
as each component is built (the build steps add them incrementally), not as a separate
subsystem at the end. A bug in the debug layer is especially harmful — it makes the agent
distrust true information — so keep each probe a thin, side-effect-free getter.

---

## 11.6 Log capture (the agent's debugging surface)

The agent's debug loop is: **edit code → autosave → autocompile → run a test → read the
log.** So the only debugging machinery the runtime needs is to **capture the apps' log output
and make it easy to read and search.** No request tracing, no object inspection, no
breakpoints — just good, searchable logs.

### What to build
A programmatic in-memory **log appender** that the runtime attaches to each app's logging
context, capturing log records into a bounded buffer the control API can query.

- **Attach to the log context the app actually uses.** The apps initialize log4j themselves
  at startup (the enrollment app does it via `Log4jContextListener` in `web.xml`). The
  appender must be added to *that* context, during/after the app's logging init — NOT to a
  log4j the framework loader might load separately. If you attach to the wrong log context you
  capture nothing and won't know why. (Verify by confirming a known app log line is captured.)
- **Bounded ring buffer.** Cap by record count and age; evict oldest. A long dev session must
  not grow without limit. This is the only bound that matters here.
- **Each record carries:** timestamp, level, logger name, the message (and the
  exception/stack for errors), and which `appId` it came from.
- **The reload/compile result is written into this same log.** On every autosave-triggered
  rebuild, emit a clear marker the agent will see when it reads the log:
  `=== reload enrollment: App.java → compile OK, context rebuilt in 1.3s ===` or
  `=== reload enrollment: COMPILE FAILED — Foo.java:42 cannot find symbol ===`. The agent's
  single act of "read the log" then tells it whether its edit even took.

### Read & search (control API)
| Method / path | Purpose |
|---|---|
| `GET /logs?app=&level=&logger=&since=&contains=&limit=` | Recent log records, filterable by app, minimum level (e.g. just `ERROR`), logger name, time window, and a text match on the message. |
| `GET /logs/tail?app=` | The most recent records (the default "what just happened" read). |

This is deliberately the whole debugging story. Other structured endpoints from §11.5
(`/status`, `/model`, `/classpath`, `/routes`, `/dryrun`, `/events`) still exist for when the
agent wants structured state, but the **primary** path is: read and search the log.

---

## 12. Open items to resolve during build (tracked, non-blocking)

1. **JwtFilter validation mode + dev key** (§9). Resolve before the dev-login phase.
2. **Generated sources / annotation processors** — does any app rely on codegen (JAXB,
   MapStruct, wsimport) that Maven normally runs? If so, the compile step (§6.5) must run or
   reuse those. Inspect the pom plugins; flag per-app.
3. **Shared-lib on-disk location** on a real dev box (§10) — confirm the exact WebLogic
   library directory to seed the resolver.
4. **Multiple-context-config ordering** — confirm whether any app's web context init-param
   overrides the default `<servlet-name>-servlet.xml` location.
5. **Frontend→backend routing topology** — confirm each Angular app's backend target(s) for
   proxy routing rules (1:1 vs map).

---

## 13. Iterative build plan

Ordered for **time-to-first-working-app**, not bottom-up purity. Three tiers:

- **Tier 1 — Signs of life:** the runtime runs, responds, and captures logs. Reached fast.
- **Tier 2 — I can run my app:** the enrollment app boots and a real filtered endpoint returns
  Oracle data. Everything strictly required for that, nothing more. (Code changes need a manual
  runtime restart at this tier — that's fine; it still *runs*.)
- **Tier 3 — Useful, not required:** fast reload, real shared-lib resolver, JAX-RS, Angular,
  multi-app, real dev-JWT, hardening. Each makes it nicer; none is needed to prove it runs.

Hand the agent **one step at a time.** Every step has: **Proves** (one idea), **Build**,
**Verify** (the gate — don't advance until it passes), **If it fails** (likely cause + fix).
Steps stay fine-grained so each failure points at one thing. Logs (§11.6) come online in Tier
1 so every later step is debuggable by reading them.

---

## TIER 1 — Signs of life

### Step 0 — Skeleton, control API, log capture
- **Proves:** the process runs on a JDK, the agent can talk to it, and logs are visible from
  the very start.
- **Build:** JVM process; JDK `HttpServer` (§15.1); control endpoints as stubs returning
  structured JSON (§11.5 error envelope from the start); `GET /health` reports
  `getSystemJavaCompiler() != null`. **Log capture (§11.6):** in-memory ring-buffer appender +
  `GET /logs` / `GET /logs/tail`. (At this point it captures the runtime's own logs; app logs
  join once apps load in Tier 2.)
- **Verify:** `GET /health` returns `{ok:true, jdk:true}`; `POST /apps` echoes input;
  `GET /logs/tail` shows the runtime's startup log lines.
- **If it fails:** `health.jdk` false → on a JRE; switch to a JDK (`cause: jdk-required`).
  Server won't bind → port in use. `/logs` empty → appender not attached to the root logger.

### Step 1 — Shim contract (doc, no code)
- **Proves:** the exact shim surface is agreed before any shim code exists.
- **Build:** the REAL/NOOP/THROW table for
  `HttpServletRequest`/`Response`/`ServletContext`/`ServletConfig`/`FilterConfig`/`FilterChain`
  (§5). Every method tagged; unimplemented → THROW with a message.
- **Verify:** table committed; every method on each interface appears exactly once with a tag.
- **If it fails:** can't classify a method → default THROW; it'll surface loudly later if used.

### Step 2 — Servlet shim + hello servlet
- **Proves:** the shim serves one hand-written servlet end to end. (First sign of life.)
- **Build:** the shim over `HttpServer` to the Step-1 contract; register one hardcoded
  `HttpServlet` (no app, no Spring, no classloader work).
- **Verify:** a `curl` hit on the mapped path returns the servlet's output; GET query params, a
  POST body, request headers, response status, and response headers all verified by a small
  test matrix.
- **If it fails:** wrong/blank body → check `sendResponseHeaders(status, length)` is called once
  before writing and the stream is closed (§15.1). Missing params → check query vs body parsing.
  A `THROW` fired → the path hit an unimplemented method; implement just that one (REAL) and note
  it in the Step-1 table.

---

## TIER 2 — I can run my app

### Step 3 — Descriptor parsing + property resolution
- **Proves:** the runtime reads the app's config exactly as WebLogic would, placeholders
  resolved.
- **Build:** DOM-parse `web.xml` + `weblogic.xml` (+ parent-pom `<properties>`) into the model
  (§15.8, §8); resolve `${...}`; validation disabled (offline). Expose `GET /apps/{id}/model`
  and `POST /apps/{id}/dryrun` (§11.5), read-only.
- **Verify:** `/model` for the enrollment app shows correct context-root, ordered listeners,
  servlets+mappings (incl. load-on-startup), filters+mappings, env-entries, datasource refs,
  library refs — **all `${...}` resolved**.
- **If it fails:** literal `${x}` remains → property missing from the parent pom
  (`cause: unresolved-placeholder`); add/override it. Parse error → external DTD/schema fetch
  attempted; confirm validation + external DTD loading are disabled (§15.8).

### Step 4 — Classloader sufficient to load the app
- **Proves:** the app's classes + shared libs load correctly, in the delegation mode the app
  needs. (Leak/GC proving is deferred to Tier 3 — not needed just to *run* once.)
- **Build:** stable framework loader (incl. servlet-api); per-app loader via the §15.2 loader
  with the PARENT_ONLY isolation list verbatim. Read `prefer-web-inf-classes` from the parsed
  `weblogic.xml` to set `childFirst` (enrollment = child-first). **Shared libs: feed a
  hand-configured path** to the lib jars for now (automatic `<library-ref>` resolution is Tier
  3). Expose `GET /apps/{id}/classpath` showing layers + mode.
- **Verify:** the app's classes and shared libs load; a framework type loaded via the app loader
  is the *same* `Class` as via the framework loader (no duplicate); `/classpath` shows the mode
  the weblogic.xml dictates.
- **If it fails:** `ClassCastException`/`LinkageError` on a framework type → PARENT_ONLY list
  wrong or a framework jar also in the app layer; fix (`cause: duplicate-framework-class`).
  App class not found → the hand-configured lib path is missing a jar.

### Step 5 — Fake JNDI + one real Oracle query
- **Proves:** the DB path works through the fake JNDI before Spring is involved.
- **Build:** JNDI SPI provider (§15.6); datasource parser → Hikari (§15.7); set
  `oracle.net.tns_admin`; bind `env-entry` values too. A hand-written servlet does
  `InitialContext().lookup("jdbc/...")` then `SELECT 1 FROM DUAL`.
- **Verify:** the servlet returns a real row; `/status` lists the bound JNDI names.
- **If it fails:** lookup null → name mismatch; support both `jdbc/x` and `java:comp/env/jdbc/x`
  (strip the prefix). Connection fails → `cause: datasource-unreachable`; check TNS alias,
  `tns_admin` dir, credentials.

### Step 6a — Spring ROOT context only
- **Proves:** the slow context builds under the runtime in isolation. (App logs now flow into
  `/logs` via §11.6 — attach the appender to the app's log context as it initializes.)
- **Build:** fire `web.xml` listeners in order; build the root `XmlWebApplicationContext` from
  `contextConfigLocation` with all beans forced lazy (§15.3); JNDI from Step 5 available.
- **Verify:** `root.refresh()` completes; `/status` shows the root context up and the datasource
  bean created; the app's own startup log lines appear in `/logs`.
- **If it fails:** bean error naming a missing class → a shared lib isn't on the hand-configured
  path (Step 4). Datasource bean fails → back to Step 5. (Read `/logs` first — the app logs the
  cause.)

### Step 6b — Dispatcher (web) context + one endpoint
- **Proves:** a Spring MVC controller actually serves through the shim.
- **Build:** web `XmlWebApplicationContext` as a child of root; `DispatcherServlet(web)`
  (§15.3); register it in the shim under its `<url-pattern>` (`/ws/enrollment/*`); honor
  `load-on-startup`.
- **Verify:** one real `/ws/enrollment/*` GET returns correct data from Oracle — **filters not
  yet in path.**
- **If it fails:** 404 → mapping mismatch (check `/routes`). Controller throws on a dependency →
  bean is in root but web context can't see it; confirm `web.setParent(root)`. (Check `/logs`.)

### Step 6c — Plain servlets + load-on-startup ordering
- **Proves:** non-dispatcher servlets and startup ordering work.
- **Build:** instantiate + `init()` the plain servlets (`AppMonitorServlet`,
  `CUFCacheRefreshController`, `FeeGatewaySim`) in ascending `load-on-startup` order; register
  their mappings.
- **Verify:** `/appmonitor.status/*` responds; startup order is visible in `/logs`.
- **If it fails:** a servlet NPEs at init → it expects an env-entry/JNDI value; confirm Step 5
  bound it.

### Step 6d — Filter chain (JWT bypassed)
- **Proves:** the real filter chain runs — the piece that makes behavior match WebLogic.
- **Build:** ordered chain from `filter-mapping` per request path; run before the target
  servlet. CORS active; **`JwtFilter` behind a dev-bypass flag (ON for now)**; `AuditFilter`/help
  filter also bypassable. (Real dev-JWT minting is Tier 3.)
- **Verify:** a `/ws/enrollment/*` request passes through the chain and returns Oracle data with
  JWT bypassed; chain execution is visible in `/logs`.
- **If it fails:** filter not invoked → mapping/order wrong (check `/routes`). `THROW` from the
  shim → a filter touched an unimplemented `FilterConfig`/`ServletContext` method; implement it.

> **★ MILESTONE — end of Tier 2:** the enrollment app boots under the runtime and a real
> filtered `/ws/enrollment/*` endpoint returns live Oracle data. This is "runs like WebLogic"
> for one vertical slice. Code changes still need a manual runtime restart — Tier 3 fixes that —
> but the thing **runs.**

---

## TIER 3 — Useful, not required

### Step 7 — Fast reload (watch + recompile + restart loader) + leak proof
- **Proves:** the edit loop — turns the manual-restart milestone into the fast loop.
- **Build:** `WatchService` on `src/main/java`; `JavaCompiler` → scratch dir (§15.4); ~300ms
  debounce; on `.java` change run teardown (§3) → recreate only the app restart loader → re-run
  6a–6d. Resource/static changes skip the Java side. Write the reload result into `/logs`
  (`=== reload … compile OK / FAILED … ===`, §11.6). Prove the discarded loader GCs (Metaspace
  returns over repeated reloads).
- **Verify:** editing a backend `.java` reflects on the next request with no manual restart;
  reload result + timing visible in `/logs`; repeated reloads don't climb Metaspace.
- **If it fails:** change doesn't take → stale loader retained (teardown incomplete) or compiler
  wrote to the wrong dir (check `-d`). Slow rebuild → confirm lazy-init on and the framework
  loader is NOT recreated. Metaspace climbs → a reference pins the old loader.

### Step 8 — Real shared-lib resolver + missing-lib reporting
- **Proves:** real `<library-ref>` resolution replaces the hand-configured path from Step 4.
- **Build:** `<library-ref>` → WebLogic-library-dir resolver with missing-lib reporting (§10).
- **Verify:** enrollment resolves `sharedlib.appmonitor`/`portlet-common`/`regionproperties`
  automatically and starts; a deliberately-missing ref reports `cause: missing-shared-lib` via
  `/status`.
- **If it fails:** lib not found → wrong library dir; set it.

### Step 9 — JAX-RS hosting
- **Proves:** Jersey resources host through the same shim.
- **Build:** register `org.glassfish.jersey.servlet.ServletContainer` as a servlet, passing the
  app's web.xml `init-param`s through unchanged (§15.5). Don't hand-build a `ResourceConfig`.
- **Verify:** a JAX-RS resource returns a real response.
- **If it fails:** 404/500 from Jersey → wrong/missing `jersey.config.server.provider.packages`
  or `javax.ws.rs.Application`; copy it verbatim from `/model`.

### Step 10 — Angular + reverse proxy
- **Proves:** the frontend story and single-origin routing.
- **Build:** detect `angular.json`; launch `ng serve --port <internal>` (§15.9); reverse-proxy
  the frontend route via JDK `HttpClient`; route relative `/ws|/api` to the hosted backend.
  Expose `/routes`.
- **Verify:** the Angular app loads via the runtime origin, hot-reloads on edit, and its relative
  backend calls reach the Spring endpoints.
- **If it fails:** frontend loads but API calls 404 → routing sends `/ws` to `ng serve`; fix the
  split (check `/routes`). `ng serve` won't start → missing per-project `node_modules`.

### Step 11 — Multi-app + routing
- **Proves:** isolation and routing across several apps at once.
- **Build:** run multiple apps with isolated loaders; proxy routing table mapping each frontend's
  backend calls to the right app (§12.5).
- **Verify:** two backends + one frontend run together; the frontend's calls hit the correct
  backend; `/routes` shows the full table.
- **If it fails:** cross-talk/`ClassCastException` between apps → loaders not isolated (each app
  needs its own restart loader). Wrong backend hit → routing map wrong.

### Step 12 — Dev identity (real JWT)
- **Proves:** authenticated flows work locally without the bypass. (Resolve §12-open-item 1
  first.)
- **Build:** `POST /dev/login` mints/attaches a JWT the `JwtFilter` accepts; replace the Step-6d
  bypass with real minting; keep per-filter dev bypass as an option (§9).
- **Verify:** a `/ws/*` call succeeds through `JwtFilter` with the dev token; the chosen user
  identity flows into the app.
- **If it fails:** filter still rejects → signature mismatch; sign with a key the filter trusts
  (§9 / §12-open-item 1).

### Step 13 — Hardening
- **Proves:** sustained use without degradation.
- **Build:** Metaspace watch + `/apps/{id}/restart` escape hatch; finalize the named-failure set
  (§11.5 pillar 2); optional error-page handling; the Spring Boot child-process pattern if
  needed.
- **Verify:** long edit/reload sessions stay healthy; known failures return correct `cause`
  codes; the hard-restart hatch recovers a wedged app.
- **If it fails:** Metaspace climbs after many reloads → a loader leak survives teardown; use the
  hard-restart hatch and investigate retained references.

### Plugin wrapping (last)
- **Proves:** the runtime plugs into the coding agent.
- **Build:** wrap the control API in the agent's plugin interface (point-at-project / start /
  stop map to endpoints). Deferred by design — the runtime is fully usable standalone first.
- **Verify:** the agent drives a full add → start → edit → reload cycle through the plugin.
---

## 14. Risk register (where bugs will concentrate)

| Risk | Mitigation |
|---|---|
| Duplicate framework classes across loaders → `ClassCastException` | Strict never-child-load list; servlet-api + frameworks only in layer 2 |
| Metaspace leak from repeated loader discard | Explicit context close, driver deregister, thread-local clear; `MaxMetaspaceSize`; hard-restart hatch |
| Unresolved `${...}` placeholders silently breaking startup | Property resolver warns by name; fail-loud |
| Listener ordering wrong (Spring before dispatcher) | Fire listeners strictly in web.xml order |
| Filter chain skipped → JWT/CORS behavior differs from WebLogic | Run real chain; explicit per-filter dev bypass, not implicit skip |
| Hidden codegen the Maven build normally runs | Inspect pom plugins per app (open item §12.2) |
| Shim under-built → mysterious framework failures | THROW (not silent) on unimplemented methods so gaps surface immediately |
| Log appender attached to the wrong log4j context → captures nothing | Attach to the context the *app* initializes (after its log init); verify a known app log line is captured (§11.6) |
| Captured-log buffer grows unbounded | Ring buffer capped by count + age, evict oldest (§11.6) |

---

## 15. Reference Code & Exact APIs (offline agent: use verbatim)

You have no internet. The APIs below are the ones you'll get wrong from memory. Copy the
exact names and call order. Code is illustrative scaffolding to adapt, not drop-in final code
— but the **class names, method names, and sequence are exact**. Versions: Java 11, Jersey
2.35, Spring 5.3.x, HikariCP 4.x.

### 15.1 JDK HTTP server (the raw HTTP layer)
Package `com.sun.net.httpserver`. No dependency needed.
```java
import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpExchange;
import java.net.InetSocketAddress;

HttpServer server = HttpServer.create(new InetSocketAddress(8080), 0);
server.createContext("/", (HttpExchange ex) -> {
    String method = ex.getRequestMethod();
    java.net.URI uri = ex.getRequestURI();          // path + query
    com.sun.net.httpserver.Headers reqHeaders = ex.getRequestHeaders();
    java.io.InputStream body = ex.getRequestBody();
    // ... build your shim request/response wrappers around these ...
    byte[] out = "hello".getBytes(java.nio.charset.StandardCharsets.UTF_8);
    ex.getResponseHeaders().add("Content-Type", "text/plain");
    ex.sendResponseHeaders(200, out.length);          // status + content length
    try (java.io.OutputStream os = ex.getResponseBody()) { os.write(out); }
});
server.setExecutor(java.util.concurrent.Executors.newFixedThreadPool(50));
server.start();
```
Key gotchas: call `sendResponseHeaders(status, length)` exactly once before writing the body;
pass `0` as length for chunked/unknown; always close the response body stream.

### 15.2 Child-first classloader with framework isolation (USE VERBATIM)
This is the single most error-prone class. Adapt this; do not write from scratch.
```java
import java.net.URL;
import java.net.URLClassLoader;

public class AppClassLoader extends URLClassLoader {
    private final boolean childFirst;

    // Packages that ALWAYS load from parent, even in child-first mode. DO NOT EDIT.
    private static final String[] PARENT_ONLY = {
        "java.", "javax.", "sun.", "com.sun.",
        "org.springframework.", "org.glassfish.", "org.jvnet.hk2.",
        "com.fasterxml.jackson.", "com.zaxxer.hikari.", "javax.ws.rs."
    };

    public AppClassLoader(URL[] appUrls, ClassLoader parent, boolean childFirst) {
        super(appUrls, parent);
        this.childFirst = childFirst;
    }

    private boolean isParentOnly(String name) {
        for (String p : PARENT_ONLY) if (name.startsWith(p)) return true;
        return false;
    }

    @Override
    protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
        synchronized (getClassLoadingLock(name)) {
            Class<?> c = findLoadedClass(name);
            if (c == null) {
                if (isParentOnly(name) || !childFirst) {
                    // parent-first path
                    try { c = super.loadClass(name, false); }
                    catch (ClassNotFoundException e) { c = findClass(name); }
                } else {
                    // child-first path: try our own URLs, then parent
                    try { c = findClass(name); }
                    catch (ClassNotFoundException e) { c = super.loadClass(name, false); }
                }
            }
            if (resolve) resolveClass(c);
            return c;
        }
    }
}
```
On reload: drop all references to the `AppClassLoader` instance and the Spring contexts it
created so it can be GC'd. Before dropping, close contexts (§15.3) and call
`java.sql.DriverManager.deregisterDriver(...)` for any driver the app registered.

### 15.3 Classic Spring MVC context wiring (programmatic, replacing WebLogic)
You are doing by hand what `ContextLoaderListener` + `DispatcherServlet` normally do.
```java
import org.springframework.web.context.support.XmlWebApplicationContext;

// ROOT context (from web.xml context-param "contextConfigLocation"):
XmlWebApplicationContext root = new XmlWebApplicationContext();
root.setConfigLocations(
    "/WEB-INF/applicationContext.xml", "/WEB-INF/applicationContext_enrollment.xml");
root.setServletContext(yourShimServletContext);   // your shim's ServletContext
// make all beans lazy (fast rebuild):
root.addBeanFactoryPostProcessor(bf -> {
    for (String n : bf.getBeanDefinitionNames()) bf.getBeanDefinition(n).setLazyInit(true);
});
root.refresh();                                    // <-- this is the slow call; lazy helps

// WEB context for the DispatcherServlet (child of root):
XmlWebApplicationContext web = new XmlWebApplicationContext();
web.setParent(root);
web.setConfigLocation("/WEB-INF/services-enrollment-dispatcher-servlet.xml"); // default name
web.setServletContext(yourShimServletContext);
web.refresh();

org.springframework.web.servlet.DispatcherServlet dispatcher =
    new org.springframework.web.servlet.DispatcherServlet(web);
// register `dispatcher` into your shim under the servlet's <url-pattern> (/ws/enrollment/*)
```
On teardown call `web.close();` then `root.close();` (child first). Closing releases the
Hikari pools and stops Spring-managed threads — required before discarding the classloader.

### 15.4 In-process Java compiler (incremental recompile)
```java
import javax.tools.*;
import java.util.*;

JavaCompiler compiler = ToolProvider.getSystemJavaCompiler(); // null if running on a JRE!
DiagnosticCollector<JavaFileObject> diags = new DiagnosticCollector<>();
StandardJavaFileManager fm = compiler.getStandardFileManager(diags, null, null);

Iterable<? extends JavaFileObject> units =
    fm.getJavaFileObjectsFromFiles(listOfChangedJavaFiles);   // List<File>
List<String> opts = Arrays.asList(
    "-d", scratchOutputDir,                 // write .class here (NOT the user's target/)
    "-classpath", builtClasspathString,     // app classes + shared libs + framework jars
    "-source", "11", "-target", "11");
boolean ok = compiler.getTask(null, fm, diags, opts, null, units).call();
// if !ok, read diags.getDiagnostics() -> {getSource(), getLineNumber(), getMessage(...)}
// return these as structured JSON to the control API (file/line/message).
```
Gotcha: `getSystemJavaCompiler()` returns null on a JRE. The runtime must run on a **JDK**.
Fail loud at startup if it's null.

### 15.5 Jersey as a servlet (JAX-RS hosting)
`org.glassfish.jersey.servlet.ServletContainer` **is an `HttpServlet`**. Register it in your
shim like any servlet, feeding it the init-params from the app's web.xml. The common one:
```
init-param  jersey.config.server.provider.packages = <resource package(s), ';'-separated>
```
Alternative the app may use instead: `javax.ws.rs.Application` = FQCN of an `Application`
subclass. Whichever the web.xml declares, pass it through unchanged. Do not construct a
`ResourceConfig` yourself unless the web.xml gives you nothing (it will).

### 15.6 Fake JNDI (datasources + env-entry)
Install a minimal in-memory context as the JVM's JNDI provider.
```java
// At startup, before any app looks up JNDI:
System.setProperty(javax.naming.Context.INITIAL_CONTEXT_FACTORY,
    "your.pkg.SimpleContextFactory");

// SimpleContextFactory implements javax.naming.spi.InitialContextFactory:
//   public Context getInitialContext(Hashtable<?,?> env) { return SHARED_CONTEXT; }
// SHARED_CONTEXT is a Context whose bind(name,obj)/lookup(name) use a ConcurrentHashMap.
// Support names like "jdbc/milconnectDS" AND "java:comp/env/jdbc/milconnectDS"
// (strip a leading "java:comp/env/" before map lookup).
```
Bind a `com.zaxxer.hikari.HikariDataSource` per `<wls-data-source>` (§15.7). Bind `env-entry`
values (e.g. `logging-context` String) under `java:comp/env/<name>`.

### 15.7 HikariCP datasource (exact setters)
```java
com.zaxxer.hikari.HikariConfig cfg = new com.zaxxer.hikari.HikariConfig();
cfg.setJdbcUrl("jdbc:oracle:thin:@DMTPD");           // from <wls-data-source url=...>
cfg.setUsername("wcprtl");                            // username
cfg.setPassword("...");                               // password
cfg.setDriverClassName("oracle.jdbc.OracleDriver");  // jdbc-driver
cfg.setMinimumIdle(0);                                // min-connections
cfg.setMaximumPoolSize(20);                           // max-connections
com.zaxxer.hikari.HikariDataSource ds = new com.zaxxer.hikari.HikariDataSource(cfg);
```
TNS aliases (`@DMTPD`) require this set ONCE at JVM startup, before opening connections:
```java
System.setProperty("oracle.net.tns_admin", "D:/TNSNAMES");   // dir containing tnsnames.ora
```

### 15.8 web.xml parsing (what to extract, in order)
Parse with the JDK's built-in DOM (`javax.xml.parsers.DocumentBuilderFactory` — no deps).
Disable DTD/schema validation (offline; no network for the XSD):
```java
DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
f.setNamespaceAware(true);
f.setValidating(false);
f.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
```
Extract, preserving document order where it matters: `context-param` (esp.
`contextConfigLocation`), `listener` (ORDER MATTERS), `filter` + `filter-mapping`,
`servlet` + `servlet-mapping` (+ `load-on-startup`), `env-entry`. Ignore `welcome-file-list`,
`error-page`, `mime-mapping`, `jsp-*` (out of scope).

### 15.9 Reverse proxy + Angular
Start Angular per app as a child process; proxy to it. Exact command (run in the app's
Angular project dir, which already has `node_modules`):
```
ng serve --port <internalPort>
```
(or `npm run start -- --port <internalPort>` if a script wraps it). Then in the runtime,
proxy: forward browser requests for that frontend's route to `http://localhost:<internalPort>`
and forward the response back. Use `java.net.http.HttpClient` (JDK 11 built-in) for the
proxy hop — no proxy library needed. Route relative `/ws/*` calls to the hosted backend
servlet instead of to `ng serve`.

---

## 16. Correctness notes confirmed during review

- Jersey `ServletContainer` is an `HttpServlet` and self-configures from `init-param`s — no
  special hosting path; it goes through the shim like any servlet (§15.5). Confirmed against
  the Jersey 2.35 API.
- `prefer-web-inf-classes` default when absent is **parent-first** (WebLogic default), so the
  loader must read it, not assume child-first (§4).
- `ToolProvider.getSystemJavaCompiler()` returns null on a JRE — the runtime must run on a
  JDK and fail loud otherwise (§15.4).
- The reload fast-path is kept but respecified correctly: there is no safe "skip Spring for
  non-bean changes" path (cross-classloader staleness / `ClassCastException`). The real
  speedup is the spring-boot-devtools model — a warm base/framework classloader plus a
  throwaway per-app restart loader, with `spring.main.lazy-initialization=true` making the
  rebuild ~sub-second. One decision path, no bean analysis (§3, Tier-3 Step 7). Confirmed against
  spring-boot-devtools' two-classloader design.

---

*Built for: Java 11 / WebLogic 12c, classic Spring MVC WARs + JAX-RS, restricted no-download
environment. JSP and Spring Boot explicitly out of v1. Written for an offline, less-capable
build agent: all design choices pre-made, all external APIs given verbatim in §15.*
