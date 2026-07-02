# Client e2e harness (Playwright)

Real browser + real R3F/WebGL against the **real** server handlers — the layer
that catches what jsdom structurally can't (Story TD-6, from the Sprint 5 retro:
"server logic correct, client integration broken" recurred every story and only
interactive runs caught it).

## Run it

```bash
# one-time, fresh checkout (WSL2: --with-deps may ask for sudo for apt packages)
pnpm --filter @bomb-squad/client exec playwright install --with-deps chromium

# the whole suite, from the repo root — Docker-free, ~40s
pnpm e2e

# one spec, headed, from apps/client/
pnpm exec playwright test e2e/modules/wires.spec.ts --headed
```

## Architecture — and why not Docker

`playwright.config.ts` boots two `webServer`s:

1. **The in-process game server** (`e2e/servers/gameServer.ts`, port **3199**) —
   `bootTestServer` from `@bomb-squad/server/src/testing/` wires the REAL
   `registerSessionHandlers` + `registerModuleHandlers` + the real timer
   scheduler over a Map-backed in-memory Redis and a no-op archive. Same
   reducers, same authority gates, same broadcasts as production; boots in
   milliseconds. It runs on plain `tsx` — **never `tsx watch`** (a watch restart
   drops in-memory timer wakes and timer-path specs silently hang).
2. **Vite** (port **5199**) with `VITE_SERVER_URL` pointed at (1).

The Docker stack is where e2e suites go to flake — stale images unless
`--build`, cross-worktree port collisions, shared passworded stores. The browser
is the fidelity investment here; the infra doesn't have to be. Jay's interactive
Docker-stack pass remains the FINAL acceptance layer for features; this suite is
the layer before it. Ports are deliberately uncommon (3199/5199) and
`reuseExistingServer: false`, so a run can never attach to another worktree's
servers.

WebGL renders headlessly via SwiftShader (`--use-angle=swiftshader`) — no GPU
needed (WSL2/CI). **A blank canvas is a failure, not a reason to skip.**

## The helpers

- **`helpers/canvas.ts`** — the R3F seam. `clickMesh(page, name, {offset?})`
  projects a named object's world position (plus an object-local offset)
  through the live camera to CSS pixels and clicks there; it waits per-frame
  until the projection is stable, so camera focus-jumps are safe.
  `waitForBomb` / `waitForBombOrGone` poll the authoritative snapshot via the
  dev-only `window.__E2E__` hook (`src/scenes/E2eSceneHook.tsx` — refs only,
  zero logic, never mounted in production builds). Interactive meshes carry
  module-scoped names (`bay-2`, `m0-wire-3`, `m1-key-0`, …) — data-driven,
  render-only.
- **`helpers/sandbox.ts`** — `/dev/sandbox` drivers. `generateSandboxModule`
  drives + asserts as one atomic unit and re-drives until the store reflects
  the request (cold-start hydration can drop the first interactions).
- **`helpers/session.ts`** — Landing/Lobby/Preparation/Scoreboard drivers
  (host, join, assign, configure, the two-step confirms) and **bot
  seat-filling**: TD-5's sim-clients CLI is spawned as a **child process** so
  its one-way dependency rule (nothing in `apps/*` imports the tool) holds to
  the letter. Assignments are sequential by design (TEAM_ASSIGN is a
  load-modify-store).
- **`helpers/bombSolve.ts`** — the browser-shaped bot: focus a bay, derive the
  correct cut from the PUBLIC snapshot via the shared solve fns, click the
  projected wire. **Solving is honest** — there is no baked answer to read
  (TD-5 keystone); a spec that needs an answer recomputes it the way a human
  Defuser reading the manual would.

## Flake policy

`retries: 1` locally, trace on the retry. If a spec needed the retry, **fix the
wait — never add a sleep**. Every wait in this suite is a condition: a locator,
a store predicate, a projection-stability check. `waitForTimeout` does not
appear in specs and should not start to. Round resolution drops the bomb from
the store the instant the last module solves — waits that straddle resolution
must use `waitForBombOrGone`, and transient overlays (the 2s resolution banner)
are asserted as `banner.or(next-surface)`, not as a timing lottery.

## Which test layer?

| You want to verify… | Write a… |
| --- | --- |
| Rule/reducer/generator logic, edge cases, immutability | **Jest/Vitest unit test** next to the pure fn (`packages/shared`, reducers) |
| A plain-DOM component's behaviour (props → DOM, clicks → emits) | **TD-1 component test** (jsdom + Testing Library, `src/ui/__tests__`) |
| Socket handler authority/broadcast semantics | **server integration test** (`testSocketServer`) |
| Anything that needs the real canvas, the real camera, the real socket round-trip, or several browsers/roles | **e2e spec here** |

If an e2e spec wants to assert *logic*, the logic has leaked — move it into a
reducer and unit-test it there (project-context rule).

## What stays human

Playwright is deaf and has no taste: **voice/audio** (the 3-5/3-7 audible
verifications), game *feel*, 3D legibility/aesthetics, and mic/device flows stay
on Jay's interactive pass per the human-verification AC rule. This suite's job
is to make sure his runs start where the machines stop.
