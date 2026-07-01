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
   `
