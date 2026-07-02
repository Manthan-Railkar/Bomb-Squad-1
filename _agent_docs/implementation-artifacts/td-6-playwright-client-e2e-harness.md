---
baseline_commit: 9a84c98
context:
  - _agent_docs/project-context.md
  - _agent_docs/implementation-artifacts/sprint-5-retro-2026-07-02.md
  - tools/sim-clients/src/verify.ts
  - apps/client/src/net/socket.ts
  - apps/client/vite.config.ts
  - apps/client/src/App.tsx
  - apps/client/src/modules/interaction.ts
---

# Story TD-6: Playwright Client E2E Harness + Test-Debt Catch-Up

Status: done

<!-- Tech-debt / tooling story (not from an epic). Sprint 5 retro Action Item 1:
     every 8.x story tripped on the same gap — "server logic correct, client
     integration broken" — and only Jay's interactive runs caught it (swallowed
     error codes → dead buttons, undriveable new UI states, bare "—"
     placeholders). jsdom never mounts R3F, TD-5 bots carry no browser. This
     story stands up a Playwright harness that mounts the REAL client in a REAL
     browser (WebGL) against the REAL server handlers, converts the recurring
     defect shapes into runnable regression specs, and pays down a bounded
     e2e test-debt slice for the surfaces that already exist. -->

## Story

As a solo developer whose interactive runs are currently the only thing catching client-integration and render defects,
I want a Playwright e2e harness that boots the real client bundle in a real browser against the real server handlers (Docker-free) and drives full socket flows — plus a bounded catch-up slice of e2e specs over the existing game surfaces,
so that the Sprint-5 class of client-integration gap fails in a repeatable CI-able command instead of in my interactive verification passes, and my runs shrink toward the things only a human can check (audio, feel, legibility).

## Context — the grounded picture (verified 2026-07-02)

- **There is no e2e layer and no CI.** No `.github/workflows` exists; the only automated gates are the husky pre-commit (`pnpm -r exec tsc --noEmit`) and manual `pnpm -r test`. No Playwright package is installed anywhere (the `@vitest/browser-playwright` lines in `pnpm-lock.yaml` are Vitest optional-peer declarations, not installed deps). `apps/client/e2e/` does not exist — but `project-context.md` **already reserves that exact location**: "E2E / visual: `apps/client/e2e/`" and "R3F components — rendering-only, covered by visual regression only (Playwright)". The architecture decision is pre-made; this story executes it.
- **The gap is structural, not accidental.** TD-1 gave the client jsdom component tests — but jsdom has no WebGL, so nothing ever mounts the R3F bomb scene (`src/scenes/`, `src/modules/*/DefuserView.tsx`). TD-5 bots are headless sockets — no browser at all. The retro names the consequence: "'done' and 'verified' are still decoupled for the client/render/audio surface." A real Chromium is the only environment that closes it.
- **The Docker-free real-server boot is already proven** — `tools/sim-clients/src/verify.ts` boots an in-process Socket.IO server wired with the REAL `registerSessionHandlers` + `registerModuleHandlers` + `createTimerScheduler` over a Map-backed `RedisStore` on an ephemeral port. The e2e harness reuses this boot (extracted into a shared helper), NOT the Docker stack — deterministic, fast, CI-able, and immune to the [[worktree-fullstack-testing-gap]] stale-image problem and worktree host-port collisions.
- **The client's server URL is injectable** — `createSocket(url)` is called from the App bootstrap with `VITE_SERVER_URL` (`apps/client/.env.example`). Playwright's `webServer` can therefore launch vite with `VITE_SERVER_URL` pointed at the in-process test server's port. No Caddy, no TLS, no Docker.
- **Seats can be filled without extra browsers** — TD-5's sim CLI (`pnpm sim --url <url> --code <code> --teams 2 --per-team 2`) joins real typed socket clients as players. An e2e spec can be: browser page = Facilitator (the surface under test), bots = players. Note TD-5's AC #1 one-way-dependency rule ("nothing in `apps/client` imports the tool") — see Dev Notes for the spawn-vs-import decision.
- **Deterministic R3F targets exist** — `/dev/sandbox` mounts a single seeded module with a local `devDispatch` (no server), and `/dev/manual` renders manual pages. These are ideal first WebGL specs: fixed seed → fixed geometry → clickable.
- **3D interaction is real pointer events on the canvas** — `apps/client/src/modules/interaction.ts` + R3F raycasting; DefuserViews have **no DOM buttons**. An e2e spec that solves a module must click canvas pixel coordinates, which requires projecting a target mesh's world position to screen space (see Dev Notes — the one genuinely new piece of machinery in this story).
- **The retro's success criterion is concrete.** Sprint 5's actual client-integration defects (all found by Jay, all post-"done") are the calibration targets: (1) `RELAY_COMPLETE` error swallowed → dead "Start" button; (2) odd-team equalisation had **no volunteer-picker UI** — the state was undriveable; (3) resting team rendered a bare "—". A harness that cannot express those three as failing-then-passing specs has missed the point.
- **Voice/audio stays human.** The 3-5/3-7 audio verifications are explicitly carried human debt (retro): Playwright does not hear. This story reduces Jay's verification load; it does not touch the audio closing conditions.

## Acceptance Criteria

1. **Given** the monorepo, **When** the harness is added, **Then** `@playwright/test` is a devDependency of `apps/client` only (never `apps/server`, never `packages/shared`), specs live under `apps/client/e2e/` (the project-context location) with their own `tsconfig.json`, a `playwright.config.ts` exists at the client root, Chromium is the only installed browser project (v1 scope), `pnpm -r typecheck` is clean with no `@ts-ignore`, and the existing Vitest suite neither picks up nor is disturbed by the e2e specs (`e2e/` is outside `src/`; `pnpm -r test` totals unchanged).
2. **Given** a checkout with browsers installed, **When** `pnpm e2e` (root script → `pnpm --filter @bomb-squad/client e2e`) runs, **Then** the entire suite executes Docker-free and headless: Playwright's `webServer` boots (a) the in-process game server — real `registerSessionHandlers` + `registerModuleHandlers` + real timer scheduler over in-memory Redis + an in-memory archive stub, extracted from TD-5's `verify.ts` into a shared boot helper — on a fixed uncommon port, and (b) vite with `VITE_SERVER_URL` pointed at it; the suite is deterministic (no arbitrary `waitForTimeout` sleeps — event/locator waits only), passes repeatably (3 consecutive green runs recorded), and finishes within a sane budget (≤5 min locally).
3. **Given** the R3F gap that motivated this story, **When** the WebGL specs run, **Then** at least one spec mounts the **real bomb scene in the real browser** and performs a **3D canvas interaction**: on `/dev/sandbox` with a fixed seed, the spec derives the correct move from the module's public state via the shared solve fns (never a baked answer), clicks the target mesh through the mesh→screen projection helper, and asserts the resulting state change through the UI. This is the capability jsdom structurally cannot provide, demonstrated end-to-end.
4. **Given** the retro's success criterion, **When** the regression specs run, **Then** the three Sprint-5 client-integration defect shapes exist as named specs against the current (fixed) code — (a) *error surfacing:* the relay-complete flow reaches the notice and the Start path either works or shows a surfaced error (a swallowed `ERROR` + dead button fails the spec); (b) *driveable states:* the odd-team equalisation volunteer picker is reachable and driveable through the real UI; (c) *no placeholder leaks:* the resting-team surface renders its real label, and a bare "—" fails the spec — **and** at least one of the three is demonstrated to fail when its historical fix is temporarily reverted (evidence in Completion Notes), proving the retro's "would have caught ≥1 of Sprint 5's defects" clause rather than asserting it.
5. **Given** a full-session flow, **When** the happy-path spec runs, **Then** a Facilitator browser page creates a session, sim-clients bots fill two teams' seats (spawned per the Dev Notes decision), the Facilitator configures and starts a round through the real UI, a **second browser context** joins as the active Defuser and solves at least one module via real canvas clicks (per AC #3 machinery), and the spec asserts round resolution and the between-rounds scoreboard through the UI — the multiplayer relay loop crossing real browser ↔ real server, end to end.
6. **Given** the test-debt catch-up slice (bounded, enumerated), **When** the story is done, **Then** e2e specs additionally cover: the between-round flow + scoreboard surface (Epic 8's most defect-prone UI), the retry-failed-round Facilitator flow (the 8-8 wrong-player-armed class), and a `/dev/sandbox` interaction spec for **each Medium module shipped so far** (Keypads, Who's on First, Wire Sequences — the exact R3F surfaces the retro said to target early). Explicitly OUT of scope: voice/audio (human, per retro), screenshot/visual-regression baselines (fold into a later story if wanted), Safari/Firefox projects, and Docker-stack e2e.
7. **Given** a contributor, **When** they read `apps/client/e2e/README.md`, **Then** it documents: the one-command run + browser install step, the architecture (in-process server + vite + Playwright, and why not Docker), the boot helper, the projection/canvas-click helper, the bot seat-filling pattern, the flake policy (retries ≤1 locally and what to do when a spec flakes — fix the wait, never add a sleep), **when to write an e2e spec vs a TD-1 component test vs a reducer test**, and the human-verification boundary that remains (audio, feel, legibility per [[human-verification-ac-rule]]). `pnpm -r test` + `pnpm -r typecheck` + `pnpm e2e` all green at close.

## Tasks / Subtasks

- [x] **Task 1 — Scaffold Playwright in `apps/client` (AC: #1)**
  - [x] Add `@playwright/test` to `apps/client` devDependencies; root `pnpm install`; `npx playwright install --with-deps chromium` (document the WSL2 sudo note in the README).
  - [x] `apps/client/playwright.config.ts`: chromium-only project, `testDir: './e2e'`, retries ≤1, trace/video on-first-retry, fixed uncommon ports (avoid worktree collisions — see [[timer-verification-tsx-watch-gotcha]] for the port-collision precedent).
  - [x] `apps/client/e2e/tsconfig.json` (separate per project-context Build rule); confirm Vitest ignores `e2e/` and `pnpm -r typecheck` stays clean.

- [x] **Task 2 — Extract the shared in-process server boot (AC: #2)**
  - [x] Lift `verify.ts`'s boot (memory `RedisStore`, real handlers, real `createTimerScheduler`, noop log) into an exported helper at `apps/server/src/testing/bootTestServer.ts` — add an in-memory `PostgresArchive` stub so `SESSION_END` flows work.
  - [x] Refactor `tools/sim-clients/src/verify.ts` to consume it (behaviour identical; `pnpm --filter @bomb-squad/sim-clients verify` still 6/6).
  - [x] `apps/client/e2e/servers/gameServer.ts`: a tsx entrypoint that boots the helper on the fixed e2e port — this is Playwright `webServer` entry (a); plain `tsx`, never `tsx watch` (timer-expiry wake gotcha). `@bomb-squad/server` becomes a **devDependency** of `apps/client` (dev-only edge, TD-5 precedent).
  - [x] Wire `webServer` entry (b): vite with `VITE_SERVER_URL=http://localhost:<e2e-port>`.

- [x] **Task 3 — The mesh→screen projection + canvas-click helper (AC: #3, #5)**
  - [x] Add a dev-gated scene hook (e.g. `window.__E2E_SCENE__` exposing the R3F scene + camera, registered only when `import.meta.env.DEV` or a `VITE_E2E` flag is set — never in production builds; R3F components stay rendering-only, the hook is registration not logic).
  - [x] `e2e/helpers/canvas.ts`: `clickMesh(page, meshName)` — `page.evaluate` projects the named object's world position through the camera to CSS pixels, then `page.mouse.click(x, y)`. Modules may need stable `name`/`userData` on interactive meshes — add names where missing (data-driven from state, no behaviour change).
  - [x] Prove it on `/dev/sandbox`: pin the seed by typing it into the sandbox's seed input (a plain DOM field — `SandboxHarness.tsx`; same seed → same instance, no query param exists), derive the correct move with the shared solve fns from the module's public state, click, assert the solved/struck UI response.

- [x] **Task 4 — Sprint-5 defect-shape regression specs (AC: #4)**
  - [x] `e2e/regressions/error-surfacing.spec.ts` — relay-complete → Start: a swallowed `ERROR` / dead button fails.
  - [x] `e2e/regressions/equalisation-picker.spec.ts` — odd-team equalisation volunteer picker reachable + driveable.
  - [x] `e2e/regressions/resting-label.spec.ts` — resting team shows its real label; bare "—" fails.
  - [x] Temporarily revert one historical fix (e.g. the 8-9 relay-predicate surfacing commit) locally, run the spec, record the failure output in Completion Notes, restore. This is the retro's acceptance clause, evidenced.

- [x] **Task 5 — Full-session multiplayer happy path (AC: #5)**
  - [x] Decide + document bot spawning (Dev Notes): child-process `pnpm sim --url … --code …` (keeps TD-5's one-way rule intact — recommended) vs dev-importing the swarm (requires amending TD-5's AC-1 note).
  - [x] `e2e/flows/full-session.spec.ts`: Facilitator page (create, configure, start) + bots (seats) + second browser context as active Defuser (canvas-solve one module) → resolution → scoreboard assertions.

- [x] **Task 6 — Test-debt catch-up slice (AC: #6)**
  - [x] `e2e/flows/between-rounds.spec.ts` — scoreboard, next-round advance, "Up next" surface.
  - [x] `e2e/flows/retry-round.spec.ts` — failed round → Retry → same Defuser re-armed (the 8-8 regression class, now UI-observable).
  - [x] `e2e/modules/{keypads,whos-on-first,wire-sequences}.spec.ts` — one seeded `/dev/sandbox` solve-and-strike spec each, via the Task 3 helper.
  - [x] Log anything discovered-but-deferred to `deferred-work.md` rather than silently expanding scope.

- [x] **Task 7 — README + gates + root wiring (AC: #7, #2)**
  - [x] Root `package.json`: `"e2e": "pnpm --filter @bomb-squad/client e2e"`; client `"e2e": "playwright test"`.
  - [x] `apps/client/e2e/README.md` per AC #7 (architecture, helpers, flake policy, e2e-vs-component-vs-reducer decision guide, remaining human boundary).
  - [x] Record 3 consecutive green `pnpm e2e` runs + runtime; `pnpm -r test` and `pnpm -r typecheck` green; note the browsers-install prerequisite prominently (fresh checkouts).

> **No interactive human-verify gate of its own.** Per [[human-verification-ac-rule]] and the TD-1/TD-5 precedent, that gate is for user-visible *feature* stories; TD-6 is developer-facing test infrastructure — its verification is AC #2's repeatable green runs plus AC #4's evidenced revert-fails-spec demonstration. Its *purpose* is to shrink Jay's future verification load: from Sprint 6 on, feature stories should get e2e specs at dev time and Jay's interactive pass narrows to what only a human can observe.

## Dev Notes

### Scope discipline — what this story is and is NOT

- **IS:** the one-time harness (Playwright + in-process server + vite wiring), the two genuinely new pieces of machinery (shared boot helper, mesh→screen canvas-click helper), the three retro defect shapes as evidenced regression specs, one full multiplayer flow, and a **bounded, enumerated** catch-up slice (AC #6's list — nothing more).
- **IS NOT:** exhaustive e2e coverage of every surface (future stories ship their own specs — this makes that cheap), visual-regression screenshot baselines, voice/audio testing (human, structurally — Playwright is deaf), cross-browser matrices, Docker-stack e2e, or a CI *service*. On that last point: **no CI exists in this repo at all** — the retro's "wired into CI" is satisfied here by making the suite a single deterministic CI-able command (`pnpm e2e`), exactly as TD-5's `pnpm verify` did. Standing up an actual CI runner (GitHub Actions or otherwise) is a separate infra decision for Jay — flagged, not assumed. If he wants it, it's a ~30-line workflow away *because* of this story.

### Why in-process server, not the Docker stack

The Docker stack is where e2e suites go to flake: stale images unless `--build` ([[worktree-fullstack-testing-gap]]), host-port collisions across worktrees, cold starts, and shared passworded Redis/Postgres. TD-5's `verify.ts` proved the real handlers + real scheduler run fine over a Map-backed store in-process — same reducers, same authority gates, same broadcasts, milliseconds to boot, perfectly isolated per run. The browser is the fidelity investment in this story; the infra doesn't have to be. (Jay's interactive Docker-stack passes remain the final acceptance mechanism for features — this harness is the layer *before* them.)

### The projection helper is the crux (read before Task 3)

DefuserViews are pure R3F — no DOM to `getByRole`. Playwright must click canvas pixels. Hardcoding coordinates is brittle (camera, viewport, layout shifts), so the harness projects the target mesh's world position → NDC → CSS pixels via the live camera, inside `page.evaluate`, through a dev-gated scene hook. Two constraints:
- **The hook is dev/e2e-only** (`import.meta.env.DEV` / `VITE_E2E` gate) and contains zero logic — exposing refs is not game logic, so the "R3F components are rendering-only" rule holds.
- **Solving stays honest** — like TD-5's bots, specs derive the correct move from the module's *public* state via the shared solve fns (`solveWires`, keypads column lookup, …), never a baked answer. The spec is a browser-shaped bot.

If a mesh has no stable identity, give it a `name` derived from its data (e.g. `wire-3`) — a render-only, data-driven change.

### Headless WebGL (the reason this can run in CI at all)

Modern headless Chromium renders WebGL via SwiftShader (software GL). If the canvas comes up blank, force it: `launchOptions: { args: ['--use-angle=swiftshader'] }` (WSL2 included — no GPU needed). Do NOT silently fall back to skipping WebGL specs; a blank canvas is a failure, not a skip. First run on a fresh machine needs `npx playwright install --with-deps chromium` (WSL2: the `--with-deps` apt step may prompt for sudo — document it, don't hide it).

### Bot spawning: subprocess vs import (Task 5 decision)

TD-5's AC #1 deliberately pinned "nothing in `apps/client`, `apps/server`, or `packages/shared` imports the tool". **Recommended: keep that letter — spawn the sim CLI as a child process** (`pnpm --filter @bomb-squad/sim-clients sim --url http://localhost:<port> --code <code> --teams 2 --per-team 2`) from a spec fixture with proper teardown (SIGINT; the CLI already handles graceful Ctrl-C). Fallback if subprocess orchestration fights you: dev-import `buildSwarm`/`playRound` from the tool and amend TD-5's dependency note to "no *shipped-code* import; e2e dev-import allowed" — acceptable, but record the amendment in both story files. Either way the bots fill **player** seats only; the surfaces under test (Facilitator UI, Defuser canvas) stay real browser pages.

### Gotchas to bake in

- **Plain `tsx`, never `tsx watch`** for the e2e game server — a watch restart drops in-memory `setTimeout` expiry wakes and the timeout-path specs silently hang ([[timer-verification-tsx-watch-gotcha]]).
- **Fixed uncommon ports** for the e2e server + vite (e.g. 5199/3199 class), documented in the config — worktree runs collide otherwise, and Playwright's `reuseExistingServer` can silently attach to the *wrong worktree's* server. Set `reuseExistingServer: false` in CI-shaped runs.
- **No `waitForTimeout`** — every wait is a locator/event condition. The server broadcasts `SESSION_STATE` on every mutation; the UI reflects it; wait on the UI.
- **Identity is per-context** — the client keys identity in `sessionStorage`; separate Playwright browser contexts are naturally separate players. Never share a context between two "players".
- **`SESSION_END` archive** — `verify.ts` already wires a no-op `archiveSession` stub (`verify.ts:80-90`), which is enough for the phase flip; carry it into the extracted helper. Upgrade it to a recording in-memory stub only if a spec wants to assert archived rows (none in this story's slice).
- **Test order/parallelism** — each spec boots its own session via the UI/bots; specs must not share sessions. Playwright workers > 1 is fine against one server process (sessions are keyed), but start with `workers: 1` and raise it only with evidence.

### Files to touch

- **UPDATE** `apps/client/package.json` — `@playwright/test` + `@bomb-squad/server` (devDeps), `e2e` script.
- **UPDATE** root `package.json` — `e2e` script.
- **NEW** `apps/client/playwright.config.ts`, `apps/client/e2e/tsconfig.json`.
- **NEW** `apps/server/src/testing/bootTestServer.ts` (extracted from `verify.ts`; + in-memory archive stub).
- **UPDATE** `tools/sim-clients/src/verify.ts` — consume the extracted helper.
- **NEW** `apps/client/e2e/servers/gameServer.ts` — webServer entrypoint.
- **NEW** `apps/client/e2e/helpers/canvas.ts` (+ the dev-gated scene hook in the client, likely `apps/client/src/scenes/` registration point).
- **NEW** `apps/client/e2e/regressions/{error-surfacing,equalisation-picker,resting-label}.spec.ts`.
- **NEW** `apps/client/e2e/flows/{full-session,between-rounds,retry-round}.spec.ts`.
- **NEW** `apps/client/e2e/modules/{keypads,whos-on-first,wire-sequences}.spec.ts`.
- **NEW** `apps/client/e2e/README.md`.

Read before editing:
- `tools/sim-clients/src/verify.ts` — the boot to extract (memory Redis, real handlers, scheduler, ports).
- `apps/client/src/App.tsx` — bootstrap, `createSocket(VITE_SERVER_URL)`, the `/dev/sandbox` / `/dev/manual` route gating.
- `apps/client/src/sandbox/SandboxHarness.tsx` + `devDispatch.ts` — seeding + local dispatch for the module specs.
- `apps/client/src/modules/interaction.ts` — how canvas clicks become module actions (what `clickMesh` must trigger).
- `apps/client/src/scenes/ModuleBay.tsx` — where interactive meshes live; where names/userData may be needed.
- `tools/sim-clients/src/main.ts` + `swarm.ts` — the CLI flags + teardown the subprocess fixture drives.

### Project Context Rules (from `_agent_docs/project-context.md`)

- **Testing boundaries:** "R3F components — rendering-only, covered by visual regression only (Playwright)" and "E2E / visual: `apps/client/e2e/`" — this story implements the documented boundary at the documented location. If an e2e spec wants to assert logic, the logic belongs in a reducer test — the README's decision guide must say so.
- **Server-authoritative:** specs assert what the server broadcasts as reflected in the UI; they never reach into Redis or fabricate state. The in-process server runs the real reducers.
- **Determinism:** no `Math.random()` in specs; module solves derive from public state via shared solve fns; sandbox specs pin seeds.
- **Socket.IO / Shared Types:** anything the harness emits programmatically (bot subprocess, boot helper) stays on the typed event surface — no `emit(string, any)`.
- **Build:** `tsc --noEmit` clean, no `@ts-ignore`, TypeScript only, separate tsconfig per workspace (the `e2e/` tsconfig included); devDeps confined to `apps/client` (+ the extracted helper in `apps/server`'s own source).

### References

- [Source: _agent_docs/implementation-artifacts/sprint-5-retro-2026-07-02.md#Action Item 1] — the mandate: R3F-render + socket-flow gaps fail in CI, not in Jay's runs; the three defect shapes; "would have caught ≥1"; early application to Medium modules.
- [Source: _agent_docs/implementation-artifacts/td-5-player-simulator-test-harness.md] — the in-process real-handler boot (`verify.ts`), the honest-solving keystone, the one-way dependency rule Task 5 must respect, hybrid seat-filling.
- [Source: _agent_docs/implementation-artifacts/td-1-client-component-test-framework.md] — the jsdom layer this complements; its R3F stub convention is explicitly what this story stops needing for real render coverage.
- [Source: _agent_docs/project-context.md#Testing Rules] — the pre-reserved `apps/client/e2e/` location + Playwright designation.
- [Source: apps/client/src/net/socket.ts + apps/client/.env.example] — `createSocket(url)` / `VITE_SERVER_URL` injection seam.
- [Source: apps/client/src/App.tsx:52-90] — `/dev/sandbox`, `/dev/bomb`, `/dev/manual` dev routes (the seeded WebGL targets).
- [Ref: Playwright webServer] — https://playwright.dev/docs/test-webserver (multiple webServer entries: game server + vite).
- [Ref: Chromium headless WebGL/SwiftShader] — `--use-angle=swiftshader` for GPU-less (WSL2/CI) WebGL rendering.

## Dev Agent Record

### Agent Model Used

claude-fable-5 (gds-dev-story)

### Debug Log References

- `pnpm --filter @bomb-squad/sim-clients verify` after the Task-2 extraction → **all checks pass** (defuse relay, multi-round rotation, button hold-loop, strike, detonate) — behaviour identical on the shared boot.
- `pnpm -r typecheck` → clean ×4 workspaces (client runs `tsc --noEmit && tsc --noEmit -p e2e`); no `@ts-ignore`.
- `pnpm -r test` → shared **375** / server **562** (+2 skipped) / client **447** green; client Vitest file count unchanged by e2e (Vitest `exclude: ['e2e/**']`).
- `pnpm --filter @bomb-squad/client build` → production build green (dev-gated hooks tree-shaken).
- **AC #2 evidence — 3 consecutive full-suite runs: 10/10 passed in 35.4s / 38.1s / 37.2s** (post root-cause fixes; zero leaked processes after).
- **AC #4 evidence — revert demonstration:** reverted the 8-9 relay-complete surfacing in `Scoreboard.tsx` (forced the pre-fix plain-Start branch), ran `error-surfacing.spec.ts --retries=0` → **FAILED exactly at the defect**: `expect(getByTestId('relay-complete')).toBeVisible() → element(s) not found` (the Facilitator faces the dead Start button). Restored via `git checkout`; spec green again.
- Three real defects/hazards were found and fixed IN THE HARNESS during bring-up (each converted to a deterministic wait or a structural fix — see Completion Notes 6–8).

### Completion Notes List

1. **AC #1** — `@playwright/test` (+ `@types/node`, `tsx`, and dev-only `@bomb-squad/server`) confined to `apps/client` devDependencies; specs in `apps/client/e2e/` with their own NodeNext `tsconfig.json` (also typechecks `playwright.config.ts`); chromium-only project; Vitest explicitly excludes `e2e/**` (it was silently collecting the specs before — 10 phantom failed files); unit totals unchanged.
2. **AC #2** — `pnpm e2e` (root) → Playwright boots `e2e/servers/gameServer.ts` (port 3199, plain tsx) + vite (5199, `VITE_SERVER_URL` injected). The boot helper was EXTRACTED to `apps/server/src/testing/bootTestServer.ts` from TD-5's `verify.ts` (which now consumes it — verify still green); it answers plain HTTP 200 for readiness probes and carries the no-op archive so `SESSION_END` flows work. Suite runtime ~37s, well under the 5-min budget; 3 consecutive greens recorded. `reuseExistingServer: false` + uncommon ports per the worktree-collision gotcha.
3. **AC #3** — `modules/wires.spec.ts` proves the jsdom-impossible capability end-to-end: real Chromium + SwiftShader WebGL mounts the real module, the spec derives the correct cut from the PUBLIC snapshot via `solveWires` (honest path — no baked answer exists), clicks the projected mesh, and asserts strike/severed/solved through the sandbox UI.
4. **AC #4** — three named regression specs, all green against fixed code: `error-surfacing` (relay-complete notice + working End session + NO dead Start), `equalisation-picker` (3v2 relay driven until the picker appears; volunteer chosen through the UI; advance un-gates; Preparation arms the volunteer), `resting-label` (Preparation shows "Resting this round"; a bare "—" fails). Revert demonstration performed on (a) — evidence in Debug Log.
5. **AC #5** — `flows/full-session.spec.ts`: Facilitator page (host → assign → configure wires-only → open prep → start) + 3 subprocess bots + a SECOND browser context ("Ada") who is round-1 Defuser by assignment order and solves the live bomb through real canvas clicks (bay click-to-focus → projected wire cut → Escape). Resolution asserted on the Defuser (banner-or-hand-off surface), scoreboard + Model-B "Up next" on the Facilitator.
6. **AC #6** — catch-up slice complete: `between-rounds` (both teams' scores + hand-off), `retry-round` (browser Defuser detonates via 3 wrong canvas cuts → Retry → **Preparation re-arms the SAME Defuser** — the 8-8 regression class, UI-observable → retry solved and scored), and seeded sandbox solve-and-strike specs for **Keypads, Who's on First, Wire Sequences** (`solutionOrder` / `solutionIndex` / `shouldCut` + panel NAV). **Mazes shipped (6-4) after this story was contexted** — its sandbox spec is the natural first extension, logged as a follow-up rather than silently scope-crept.
7. **Non-obvious harness findings (the story's real payload):**
   - **Canvas-scoped state hook was a trap.** The scene hook (`window.__E2E__`) unmounts WITH its Canvas — the instant a round resolves, session status became unreadable and solve-loop waits either silently early-returned (flake) or hung (deterministic once exits demanded explicit status). Fix: a second, Canvas-INDEPENDENT `window.__E2E_STATE__` registered once from the App bootstrap; all state waits read it, and round-over is only ever `status ∈ {between-rounds, ended}` — never "snapshot missing".
   - **Subprocess teardown must kill the process GROUP.** `child.kill('SIGINT')` only signalled the pnpm wrapper and leaked the tsx/node bots — 164 zombie processes accumulated across runs, reconnect-storming the fixed e2e port and degrading later runs (the suite's only flake source). Fix: `spawn(..., {detached: true})` + `process.kill(-pid, 'SIGTERM')`.
   - **Dead-centre canvas clicks can be swallowed.** A small unidentified raycast plane (mapped empirically to local x∈[-0.05,0] at row height on Wire Sequences, likely a troika Text SDF plane) ate exact-centre wire clicks; specs click off-centre along the wire (what a human does anyway). Also: cold-start hydration can drop the first interactions — the sandbox/host/join drivers re-drive-and-assert as one atomic unit (`expect().toPass`), which is a condition, not a sleep.
8. **AC #7** — `e2e/README.md`: run commands + install step (WSL2 sudo note), the architecture and the why-not-Docker rationale, every helper, the flake policy (fix the wait, never sleep; `waitForTimeout` appears in no spec), the which-layer decision table (reducer test vs TD-1 component test vs server integration vs e2e), and the human boundary (audio/feel/legibility stay with Jay per [[human-verification-ac-rule]]).
9. **No CI service exists in the repo** — per the story's scope note, "wired into CI" is satisfied as the single deterministic CI-able command (`pnpm e2e`), the TD-5 `pnpm verify` precedent. An actual runner (GitHub Actions) remains a separate decision for Jay (~30 lines away because of this story).
10. **Scope held:** no visual-regression baselines, no cross-browser projects, no Docker-stack e2e, no voice. Production code changes are registration/naming only (dev-gated hooks + data-driven mesh `name`s + the Vitest exclude); zero game logic touched.

### File List

- **UPDATE** `package.json` (root) — `e2e` script.
- **UPDATE** `pnpm-lock.yaml` — new client devDeps.
- **UPDATE** `apps/client/package.json` — devDeps `@playwright/test`, `@bomb-squad/server` (dev-only, TD-5 precedent), `@types/node`, `tsx`; `e2e` script; typecheck also compiles `-p e2e`.
- **UPDATE** `apps/client/vite.config.ts` — Vitest `exclude: ['e2e/**', …]` (Playwright owns e2e/).
- **NEW** `apps/client/playwright.config.ts` — chromium + SwiftShader, reduced motion, dual webServer (game server 3199 / vite 5199), retries 1 + trace on retry, `reuseExistingServer: false`.
- **NEW** `apps/client/e2e/tsconfig.json` — NodeNext, also covers `playwright.config.ts`.
- **NEW** `apps/server/src/testing/bootTestServer.ts` — the extracted in-process boot (memory Redis, real handlers + timer, no-op archive, HTTP-200 readiness).
- **UPDATE** `tools/sim-clients/src/verify.ts` — consumes the extracted boot (verify still green).
- **NEW** `apps/client/e2e/servers/gameServer.ts` — Playwright webServer entrypoint (plain tsx).
- **NEW** `apps/client/src/scenes/E2eSceneHook.tsx` — dev-gated scene hook (`__E2E__`) + Canvas-independent state hook (`registerE2eStateHook` → `__E2E_STATE__`); refs only, zero logic.
- **UPDATE** `apps/client/src/App.tsx` — dev-gated `registerE2eStateHook()` at bootstrap.
- **UPDATE** `apps/client/src/scenes/BombScene.tsx`, `apps/client/src/sandbox/SandboxHarness.tsx` — mount `<E2eSceneHook/>` in dev.
- **UPDATE** `apps/client/src/scenes/ModuleBay.tsx` — faceplate `name={'bay-'+moduleIndex}`.
- **UPDATE** `apps/client/src/modules/{wires,keypads,whos-on-first,wire-sequences}/DefuserView.tsx` — module-scoped interactive-mesh names (`m{i}-wire-{w}`, `m{i}-key-{k}`, `m{i}-wof-button-{b}`, `m{i}-wseq-wire-{g}`, `m{i}-wseq-nav-{dir}`); render-only.
- **NEW** `apps/client/e2e/helpers/canvas.ts` — projection + click (`clickMesh` with per-frame stability + object-local offsets), `waitForMesh`, `readBomb`, `waitForBomb`, `waitForGame`.
- **NEW** `apps/client/e2e/helpers/sandbox.ts` — atomic drive-and-assert sandbox generation + inspector rows.
- **NEW** `apps/client/e2e/helpers/session.ts` — host/join/assign/configure/two-step confirms + detached-process-group bot spawning.
- **NEW** `apps/client/e2e/helpers/bombSolve.ts` — live-round browser Defuser (solve + deliberate strike-out), status-gated round-over semantics.
- **NEW** `apps/client/e2e/regressions/{error-surfacing,equalisation-picker,resting-label}.spec.ts` — the three Sprint-5 defect shapes.
- **NEW** `apps/client/e2e/flows/{full-session,between-rounds,retry-round}.spec.ts` — multiplayer flows (AC #5 + catch-up).
- **NEW** `apps/client/e2e/modules/{wires,keypads,whos-on-first,wire-sequences}.spec.ts` — seeded sandbox canvas specs.
- **NEW** `apps/client/e2e/README.md` — architecture, helpers, flake policy, layer guide, human boundary.

## Review Findings

_gds-code-review (3 adversarial layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor) over the TD-6 commit `81e32e8` (`HEAD~1..HEAD`), 2026-07-02. 5 patch · 3 deferred · 2 dismissed. Two cross-layer disputes were resolved against the actual code (recorded under Dismissed)._

_Post-patch verification (2026-07-02): client+e2e typecheck green; **3 consecutive full-suite greens — 10/10 in 36.2s / 34.6s / 36.7s**, zero leaked bot processes (P1's failure-path teardown fix reconfirmed the baseline after the helper changes)._

### Patch

- [x] [Review][Patch] Bot process-group leaks on the readiness-wait failure path [apps/client/e2e/helpers/session.ts:111] — FIXED: `stop` defined before the readiness wait; the wait is wrapped in try/catch that kills the detached group on throw. — `spawnBots` `await`s the roster-count assertion (line 111) BEFORE returning the `stop` handle (line 115). If that assertion times out (a bot fails to join / slow boot / a prior leak already storming the port), it throws, so `const bots = await spawnBots(...)` never binds and the spec's `finally { bots.stop() }` can't run — the detached process group survives and reconnect-storms port 3199, re-introducing the exact zombie-storm the detached-group teardown was built to prevent. With `retries: 1` it then poisons the retry attempt. Fix: wrap the readiness `await` in try/catch that kills the child on throw (or register `stop` before awaiting). [Blind — confirmed via code]
- [x] [Review][Patch] `configureWiresOnly` hardcodes the two non-wires easy chips [apps/client/e2e/helpers/session.ts:153] — FIXED: scopes to the "Module pool" group, pins Wires ON, then deselects every enabled non-Wires chip generically (tier-agnostic). — deselects only `The Button`/`Passwords`. Correct at the default easy tier (only Wires/Button/Passwords chips render), but a latent landmine: if any spec sets difficulty medium/hard, the medium chips stay selected, the bomb can include a non-wires module, and `solveWiresBombInBrowser` (wires-only) never solves it → round never resolves → 60s timeout. Harden to deselect every chip except `Wires`. [Blind — low/latent]
- [x] [Review][Patch] Vitest `exclude` overrides the built-in default set [apps/client/vite.config.ts:28] — FIXED: anchored to `**/node_modules/**` + `**/dist/**`. — `exclude: ['e2e/**','node_modules/**','dist/**']` replaces Vitest's default `**/node_modules/**`; the un-anchored `node_modules/**` would stop excluding any nested `node_modules`. No impact today (single top-level `node_modules`). Use `**/node_modules/**` + `**/dist/**`. [Edge — low]
- [x] [Review][Patch] README references a nonexistent helper `waitForBombOrGone` [apps/client/e2e/README.md:51] — FIXED: replaced with the real `waitForBomb`/`waitForGame`; the straddle-resolution guidance now cites `waitForGame` gated on `session.status`. — no such function exists (real helpers are `waitForBomb`/`waitForGame`); the flake-policy line points contributors at a nonexistent API. Fix the doc. [Auditor — low]
- [x] [Review][Patch] README mislabels the snapshot-wait hook [apps/client/e2e/README.md:51] — FIXED: the snapshot waits are now documented against `window.__E2E_STATE__` (Canvas-independent), with `clickMesh` on the Canvas-scoped `window.__E2E__`. — says the waits read `window.__E2E__`; they actually read `window.__E2E_STATE__` (the Canvas-independent hook). The doc contradicts the very `__E2E__`/`__E2E_STATE__` split that Completion Note #7 calls the story's key lesson. Fix the doc. [Auditor — low]

### Deferred (real but guarded; not blocking)

- [x] [Review][Defer] Projection stability loop + `clickMesh` opaque throw when a round resolves mid-solve [apps/client/e2e/helpers/canvas.ts:77] — deferred, guarded today (reducedMotion snap + 300s timer vs 240s budget + single solver)
- [x] [Review][Defer] `gameServer` `void stop()` swallows an `io.close()` rejection [apps/client/e2e/servers/gameServer.ts:20] — deferred, Playwright reaps the process anyway
- [x] [Review][Defer] In-memory server state (memoryRedis Map + unref'd timers) never reset between specs [apps/server/src/testing/bootTestServer.ts] — deferred, no concrete failure (fresh session per spec via a new join code)

### Dismissed (verified false / non-defect)

- `strikeOutWiresBomb` "may not reach 3 strikes" (Blind #2) — FALSE. The flow specs run at the easy default (`TIER_DEFAULTS.easy` moduleCount 3) with the pool restricted to Wires, so the bomb always has 3 wires modules × ≥2 wrong wires (`generateWires` yields 3–6 wires) = ≥6 wrong cuts. Edge Case Hunter's refutation confirmed against the code.
- AC #4 revert-evidence "only narrative" (Auditor #3) — non-defect. The demonstration is recorded in the Debug Log and the spec structure (`error-surfacing.spec.ts` asserts `relay-complete` visible + no dead Start) is consistent with the claimed failure point; nothing to fix.

## Change Log

| Date       | Change                                                                 |
|------------|------------------------------------------------------------------------|
| 2026-07-02 | Implemented all 7 tasks (AC #1–#7). Playwright harness live: chromium+SwiftShader against the extracted in-process real-handler boot (TD-5 verify refactored onto it), mesh→screen projection with per-frame stability + module-scoped names, honest shared-solve canvas solving, subprocess bot seat-filling (process-group teardown), 10 specs (3 retro defect-shape regressions — one PROVEN by reverting its historical fix — full multiplayer round with a browser Defuser, retry re-arm (8-8 class), between-rounds, 4 sandbox module specs). Root-caused two structural harness hazards: Canvas-scoped state hook dying at round resolution (→ Canvas-independent `__E2E_STATE__`, status-explicit round-over) and pnpm-wrapper SIGINT leaking bot processes (164 zombies; → detached group kill). Gates: typecheck ×4 clean, shared 375 / server 562 / client 447 green, client build green, `pnpm e2e` 10/10 ×3 consecutive (~37s). Status → review. (claude-fable-5) |
| 2026-07-02 | Story TD-6 created (ready-for-dev) from Sprint 5 retro Action Item 1: Playwright e2e harness (real browser + real R3F/WebGL + real in-process server handlers, Docker-free via the TD-5 `verify.ts` boot extracted to a shared helper), the three Sprint-5 client-integration defect shapes as evidenced regression specs (one proven by reverting its historical fix), a full multiplayer browser↔server flow with sim-clients seat-filling, and a bounded test-debt catch-up slice (between-rounds, retry, Keypads/Who's-on-First/Wire-Sequences sandbox specs). Voice/audio explicitly stays human. Grounded at baseline 9a84c98: no CI exists, no Playwright installed, `apps/client/e2e/` pre-reserved by project-context. |
