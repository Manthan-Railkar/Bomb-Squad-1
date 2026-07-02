---
baseline_commit: ad7ad22975a57802cab1f832afd8c5e131329851
---

# Story 7.2: Simon Says Module

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a team,
I want to defuse the Simon Says module by translating a growing colour-flash sequence with the correct table,
so that we solve a sequence module whose colour mapping changes with the live strike count and the serial number.

## Acceptance Criteria

1. **Table selection is correct.** The active translation table is chosen by whether the serial number contains a vowel (A/E/I/O/U → Table A) or not (Table B) **AND** by the **current team strike count** (0/1/2). All three strike rows of **both** tables are implemented and correct (six rows total, per `gdd.md#Module 4` — verified identical to the KTANE manual p.8).

2. **Growing-sequence progression.** The Defuser reproduces the translated sequence; entering the full current stage correctly grows the revealed sequence by one flash and replays from the start. Completing the final stage solves the module.

3. **Wrong press → strike, and the strike re-selects the row.** An incorrect press returns a transient `'struck'` (rolled up to a team strike by the bomb reducer) and resets the current-stage input to the start. Because the team strike count then increases, the **next** press is evaluated against the new strike row (server injects the fresh count each interaction).

4. **Strike count is server-authoritative.** The reducer never trusts a client-supplied strike count. The `MODULE_INTERACT` handler stamps the authoritative live `bomb.strikes` onto the module action before reducing; any client-sent value is overridden.

5. **Colorblind floor.** Each of the four colour panels carries a non-colour signal (letter label + flash cue); the manual includes a label↔colour table. Colour is never the only signal (`UX-DR14`, `DESIGN.md` accessibility gate).

6. **Reducer test suite.** Covers happy / wrong / idempotent / immutable / guard / reset **and explicitly verifies all three strike-level rows for both the vowel and no-vowel cases** (`generate` determinism + no-`Math.random` + no stored answer included).

7. **Additive registration, no core edits.** `simon-says` is registered in all three places (generator, reducer, tier pool) in one commit; `bombReducer.ts` and the client interaction/dispatch/registry primitives are untouched. A Hard-tier default round can draw and solve the module without `generateLayout` throwing.

## Tasks / Subtasks

- [x] **Task 1 — Shared module: types** (AC: 1,2,3,5) — `packages/shared/src/modules/simon-says/types.ts`
  - [x] `export const SIMON_SAYS_MODULE_ID = 'simon-says';` (id already reserved in `MODULE_IDS`).
  - [x] `export type SimonColor = 'red' | 'blue' | 'green' | 'yellow';` + `export const SIMON_COLORS = [...] as const`.
  - [x] `export const SIMON_COLOR_LABELS: Readonly<Record<SimonColor,string>> = { red:'R', blue:'B', green:'G', yellow:'Y' };` (colorblind floor — mirror `WIRE_COLOR_LABELS`).
  - [x] `SimonSaysState`: `readonly sequence: ReadonlyArray<SimonColor>` (full seeded flash order), `readonly stage: number` (1..sequence.length; flashes currently revealed), `readonly progress: number` (0..stage; correct presses this stage), `readonly ctx: BombContext` (carried for serial-vowel at reduce-time — **never store the answer**, per Sprint-2 retro AI1; mirror `WiresState.ctx`).
  - [x] `export type SimonSaysAction = { type: 'PRESS'; color: SimonColor; strikeCount: number };` and `export type SimonSaysReset = { type: 'MODULE_RESET' };`.
  - [x] `export function isSimonSaysAction(action: unknown): action is SimonSaysAction | SimonSaysReset` — runtime guard (untrusted input): accept `MODULE_RESET`; accept `PRESS` only when `color ∈ SIMON_COLORS` and `typeof strikeCount === 'number'`. Mirror `isButtonAction` / `isWiresAction`.
  - [x] `export const SIMON_SEQUENCE_LENGTH = 5;` (solve target — documented constant; the module solves on completing stage `SIMON_SEQUENCE_LENGTH`).

- [x] **Task 2 — Shared module: solve tables** (AC: 1,6) — `packages/shared/src/modules/simon-says/solve.ts`
  - [x] Export `SIMON_TABLES` as structured rule data keyed `A`/`B` → strike `0|1|2` → `Record<SimonColor, SimonColor>` (flashed → press). **Transcribe exactly** (see Dev Notes → *Translation tables*). This single constant feeds both the solver and the manual so they cannot diverge (mirror `WIRES_RULES`).
  - [x] `export function serialHasVowel(serial: string): boolean { return /[AEIOU]/i.test(serial); }`.
  - [x] `export function simonTranslate(flash: SimonColor, ctx: BombContext, strikes: 0|1|2): SimonColor` → picks `SIMON_TABLES[hasVowel?'A':'B'][strikes][flash]`.

- [x] **Task 3 — Shared module: generator** (AC: 2,6) — `packages/shared/src/modules/simon-says/generate.ts`
  - [x] `export function generateSimonSays(seed: number, ctx: BombContext): SimonSaysState` using `makeSeededRng(seed)` ONLY (no `Math.random`). Produce a `sequence` of `SIMON_SEQUENCE_LENGTH` colours drawn from `SIMON_COLORS`; return `{ sequence, stage: 1, progress: 0, ctx }`. Store `ctx` by reference; never mutate it; never store the translated answer.

- [x] **Task 4 — Shared module: reducer** (AC: 1,2,3,6) — `packages/shared/src/modules/simon-says/reducer.ts`
  - [x] `export const simonSaysReducer: Reducer<ModuleState<SimonSaysState>, unknown>`. Contract obligations (copy the wires/the-button structure):
    - [x] `if (!isSimonSaysAction(action)) return state;` (guard, never throw).
    - [x] `MODULE_RESET` → `{ ...state, status:'armed', data:{ ...data, stage:1, progress:0 } }` (sequence + ctx preserved).
    - [x] Solved-inert: `if (state.status === 'solved') return state;`.
    - [x] Clamp: `const strikes = Math.max(0, Math.min(2, action.strikeCount)) as 0|1|2;`.
    - [x] `const flash = data.sequence[data.progress];` → `const expected = simonTranslate(flash, data.ctx, strikes);`.
    - [x] Correct (`action.color === expected`): `progress+1`. If it reaches `data.stage`: when `stage === sequence.length` → `status:'solved'`; else advance → `stage+1, progress:0, status:'armed'`. Otherwise `status:'armed', progress: progress+1`.
    - [x] Wrong: `status:'struck'`, `progress:0`, `stage` unchanged (replays current stage from the start under the new strike row on the next press).
    - [x] No `Date.now()`/`Math.random()`/I/O; never mutate input (spread/return new objects).

- [x] **Task 5 — Shared module: manual** (AC: 1,5) — `packages/shared/src/modules/simon-says/manual.ts`
  - [x] `export function getSimonSaysManualPages(): ManualPage[]` with `chapterId: SIMON_SAYS_MODULE_ID`, `chapterTitle:'Simon Says'`. Build the two tables (A vowel / B no-vowel), each with a strike-row section, **from `SIMON_TABLES`** (never hardcode a second copy). Include a "Confirming colours" `ManualTable` (Label↔Colour from `SIMON_COLOR_LABELS`) and an intro section describing the flash→translate→press→grow loop and the vowel + strike selection rule. Mirror `getWiresManualPages()` shape (`headers`/`rows` string arrays only).

- [x] **Task 6 — Shared module: barrel + generator registry + tier pool** (AC: 7) — one commit
  - [x] `packages/shared/src/modules/simon-says/index.ts`: assemble `SIMON_SAYS_MODULE: IModule<SimonSaysState, unknown>` = `{ id, generate: generateSimonSays, reduce: simonSaysReducer, getManualPages: getSimonSaysManualPages }` and re-export the public surface.
  - [x] `packages/shared/src/modules/index.ts`: `export * from './simon-says/index.js';`.
  - [x] `packages/shared/src/modules/registry.ts`: add `[SIMON_SAYS_MODULE_ID]: generateSimonSays as ModuleGenerator` to `MODULE_GENERATORS` (import `generateSimonSays` **directly from `./simon-says/generate.js`**, not the barrel). Add `'simon-says'` to `TIER_POOLS.hard` (Simon Says is a **Hard**-tier module — `TIER_CATALOG.hard` already lists it; do NOT touch `easy`/`medium`).

- [x] **Task 7 — Server reducer registry** (AC: 7) — `apps/server/src/reducers/MODULE_REDUCERS.ts`
  - [x] Add `[SIMON_SAYS_MODULE_ID]: simonSaysReducer as ModuleReducer` (import both from `@bomb-squad/shared`). Do **not** edit `bombReducer.ts`.

- [x] **Task 8 — Server: inject authoritative strike count** (AC: 3,4) — `apps/server/src/handlers/moduleHandlers.ts`
  - [x] Before reducing, stamp the live team strike count onto the action: replace
        `payload: action` with `payload: { ...(action as object), strikeCount: bomb.strikes }` in the `bombReducer(bomb, { type:'MODULE_ACTION', moduleIndex, payload })` call. This is a **module-agnostic** enrichment (other modules ignore `strikeCount`) and overrides any client-supplied value → server-authoritative (project-context security rule; resolves the 5.4-deferred "server must recompute the live action value" debt for the strike-count case; consistent with Sprint-4 AI-3). `bomb.strikes` is guaranteed `0|1|2` here (the handler already rejects `strikes >= 3` above this line). Do not alter the `MODULE_RESET` path.

- [x] **Task 9 — Fix tests that use `simon-says` as an *unregistered* example** (AC: 7)
  - [x] `packages/shared/src/generation/__tests__/layout.test.ts:24` — the `expect(...).toThrow(/unregistered id "simon-says"/)` assertion now flips (it IS registered). Repoint to a still-unregistered id, e.g. `'memory'` or `'morse-code'`; update the comment.
  - [x] `packages/shared/src/generation/__tests__/assembleBomb.test.ts:93` — same repoint.
  - [x] `apps/server/src/round/__tests__/initializeRoundBombs.test.ts:51` — same repoint.
  - [x] `apps/server/src/reducers/__tests__/moduleRegistration.test.ts:216` — uses `moduleId:'simon-says'` as a *rogue rebound* example for the `isContractResult` guard; re-run and, if it now conflicts, switch the rogue id to an unregistered one (`'memory'`). Also **add** a positive registration assertion: `'simon-says'` is present in `MODULE_REDUCERS` and a solve+strike round-trips through the untouched `createBombReducer(registry)`.

- [x] **Task 10 — Client module** (AC: 2,4,5) — `apps/client/src/modules/simon-says/`
  - [x] Re-export files (`types.ts`/`generate.ts`/`solve.ts`/`reducer.ts`) that `export … from '@bomb-squad/shared'` — never duplicate logic.
  - [x] `DefuserView.tsx` (R3F, **rendering only**, zero game logic): four colour panels positioned per the GDD diamond — **Blue top, Red left, Yellow right, Green bottom**. Read state via a memoized `moduleIndex`-scoped selector (`useMemo(() => selectSimonData(moduleIndex), [moduleIndex])`, mirror `selectWiresData`). Play back the revealed flashes `sequence.slice(0, stage)` as a timed animation (visual only — derive from state; use `useFrame` + a local clock, not `setInterval`; respect `prefers-reduced-motion`). Render each panel's letter with drei `<Text font="/fonts/jetbrains-mono-700.ttf">` (colorblind floor). Click a panel via `moduleClickHandlers(...)` → `dispatchModuleAction(moduleIndex, { type:'PRESS', color, strikeCount: useGameStore.getState().bomb?.strikes ?? 0 })` (live read at click, mirroring `currentTimerDigits()`; the server overrides `strikeCount` in production, and the sandbox reducer uses the local value).
  - [x] `ManualPages.tsx` — typed renderer of `getSimonSaysManualPages()` (mirror wires).
  - [x] `index.ts` — `SIMON_SAYS_MODULE` IModule binding + `registerModuleRenderer({ id: SIMON_SAYS_MODULE_ID, DefuserView: SimonSaysDefuserView })`.
  - [x] `apps/client/src/modules/index.ts` — import + add to `SANDBOX_MODULES` + export.
  - [x] `apps/client/src/manual/devManualFixtures.ts:35` — replace `stub('simon-says','Simon Says')` with `...getSimonSaysManualPages()`.
  - [x] `apps/client/src/modules/__tests__/simonSaysBinding.test.ts` (vitest) — renderer registered, IModule complete, listed in `SANDBOX_MODULES`.

- [x] **Task 11 — Full verification**
  - [x] `pnpm -r typecheck` clean (all 4 workspaces); `pnpm -r test` green (shared/server/client), including the new suite covering all six table rows.
  - [x] **Jay verifies interactively (human-verification AC rule — story is not done until his observed result is in Completion Notes):** in `/dev/sandbox`, generate a Simon Says module; confirm (a) the flash sequence plays and grows by one after a correct stage; (b) using the manual, a correct translated run solves it; (c) a wrong press strikes AND the mapping shifts to the next strike row (visible by the correct answer changing); (d) colour labels are legible; (e) a Hard-tier live round (Facilitator picks Hard, module drawn from the pool) reaches the module and solves end-to-end.

### Review Findings

- [x] [Review][Patch] `isSimonSaysAction` accepts `strikeCount: NaN`/non-integer and the reducer then throws in `simonTranslate` — violates the "guard, never throw" contract [packages/shared/src/modules/simon-says/types.ts:97] — tighten the guard to `Number.isInteger(strikeCount)` and add `NaN`/`Infinity`/`1.5` to the malformed-action test list. Unreachable in production (server stamps 0|1|2) but the shared reducer must be safe standalone (sandbox). (blind+edge+auditor)
- [x] [Review][Patch] `DefuserView` never reads module `status` — a solved module keeps looping the full flash sequence forever and clicks still dispatch `MODULE_INTERACT` with press feedback [apps/client/src/modules/simon-says/DefuserView.tsx:100] — gate playback and the click dispatch on `status !== 'solved'` (mirror wires' `canChange` live-store read). (blind+edge)
- [x] [Review][Patch] Per-frame allocations in `useFrame`: `data.sequence.slice(0, data.stage)` and `Object.keys(PANEL_POS)` allocate every frame — violates the project-context "no new objects inside useFrame" rule [apps/client/src/modules/simon-says/DefuserView.tsx:100] — compute `revealed` inside the `data !== lastData` branch and hoist the panel-colour array to a module constant. (blind)
- [x] [Review][Patch] Immutability test freezes `data`/`sequence`/envelope but never freezes `ctx` (or its nested `indicators`/`ports`) — a ctx mutation would pass, and `ctx` is the bomb-wide shared object where mutation is most catastrophic [packages/shared/src/modules/simon-says/__tests__/simon-says.test.ts armed() helper] — deep-freeze the ctx fixtures. (auditor+blind)
- [x] [Review][Patch] Mid-stage strike-row switch untested: no test covers a strike landing between press 1 and press 2 of the same stage (remaining presses judged under the new row) — the module's headline mechanic [packages/shared/src/modules/simon-says/__tests__/simon-says.test.ts] — add a multi-flash-stage reducer test varying `strikeCount` between presses. (blind)
- [x] [Review][Patch] Comment/code mismatches in DefuserView: header claims "panel AND its label brightening together" but only the panel mesh's `emissiveIntensity` changes (label ink is constant), and `CYCLE_PAUSE`'s "quiet gap" comment understates the actual gap (`FLASH_GAP + CYCLE_PAUSE` = 1.38 s) [apps/client/src/modules/simon-says/DefuserView.tsx:24] — fix the comments (or implement the label-emphasis cue if preferred; AC5 holds either way per audit). (auditor+blind)
- [x] [Review][Defer] Sandbox stays playable past the 3rd strike — `devDispatch` saturates `strikes` at 3 with no detonation, so Simon clamps 3→row 2, a mapping the manual never defines [apps/client/src/sandbox/devDispatch.ts:65] — deferred, pre-existing sandbox design shared by all modules, not introduced by this story. (edge)

## Dev Notes

### The one non-trivial design decision: live strike count (read this first)

Simon Says is the **first module whose rule depends on live, mutating bomb state** (the team strike count), not just static `BombContext`. Two facts constrain the design:

- The module reducer signature is `Reducer<ModuleState<S>, unknown>` — it receives **only its own `ModuleState`**, never `BombState`, so `bomb.strikes` is not directly reachable [Source: `apps/server/src/reducers/bombReducer.ts` — `reduce(mod, action.payload)`].
- The serial-vowel half **is** reachable: store `ctx` in module data (like `WiresState.ctx`) and read `ctx.serialNumber` at reduce time [Source: `packages/shared/src/modules/wires/solve.ts`].

**Resolution:** carry the strike count as an action input (the-button's proven `RELEASE.timerDigits` pattern), but make the **server** the authority. The `MODULE_INTERACT` handler already has the freshly-loaded `bomb` in scope, so it stamps `strikeCount: bomb.strikes` onto the action before reducing (Task 8), overriding whatever the client sent. The client still supplies a value so the **sandbox** (no server) works via its local reducer. Do **not** trust the client value in production — a spoofed `strikeCount:0` would let a Defuser always use the 0-strike table (a cheat). This is exactly the "server must recompute the live action value" debt flagged in the 5.4 review and Sprint-4 AI-3.

Because each press is a separate `MODULE_INTERACT` round-trip, the strike count is re-stamped fresh every press: a wrong press strikes → `bomb.strikes` increments → the **next** press is judged against the new row automatically. Within the striking press itself you correctly evaluate under the pre-strike row. This is precisely AC #3.

### Translation tables (transcribe EXACTLY — the crux of AC #1 and #6)

Flashed colour → button to press. Verified identical between `gdd.md#Module 4: Simon Says` (project canon) and the KTANE manual p.8 (`docs/…v1.pdf`). Encode as `SIMON_TABLES` in `solve.ts`; the manual renders from the same constant.

**Table A — serial number CONTAINS a vowel:**

| strikes | Red flash | Blue flash | Green flash | Yellow flash |
|---|---|---|---|---|
| 0 | Blue | Red | Yellow | Green |
| 1 | Yellow | Green | Blue | Red |
| 2 | Green | Red | Yellow | Blue |

**Table B — serial number does NOT contain a vowel:**

| strikes | Red flash | Blue flash | Green flash | Yellow flash |
|---|---|---|---|---|
| 0 | Blue | Yellow | Green | Red |
| 1 | Red | Blue | Yellow | Green |
| 2 | Yellow | Green | Blue | Red |

> Common LLM failure (project-context gotcha, line 216): implementing only the 0-strike row. **All three rows of both tables are required** — the reducer test must assert every cell.

### Module plugin contract (the pattern to copy)

- **Pure logic lives in `packages/shared/src/modules/<id>/`** so both the server registry (run via `tsx`) and the client sandbox execute the same code; the client dir just re-exports [Source: `game-architecture.md` Pattern 3; `project-context.md#Module File Structure`]. Template chain: `wires` (5.3) is the cleanest — copy its directory shape (`types/generate/solve/reducer/manual/index/__tests__`). `the-button` (5.4) is the reference for the live-value-as-action-input pattern.
- **`ModuleState<S>` envelope:** `{ moduleId, status: 'armed'|'solved'|'struck', data: S }`. `'struck'` is **transient** — the bomb reducer rolls it into a team strike and re-arms; the module never holds it [Source: `packages/shared/src/types/module.ts`].
- **`IModule` shape:** `{ id, generate(seed,ctx), reduce, getManualPages() }` [Source: `packages/shared/src/types/module.ts`].
- **Actions arrive as `unknown`** (untrusted). Guard first with `isSimonSaysAction`, never throw. `MODULE_RESET` is forwarded whole and must be handled (it bypasses the bomb reducer's solved-inert guard) [Source: `apps/server/src/reducers/bombReducer.ts`].
- **Never store the answer / never `Math.random`.** Randomness only in `generate(seed,ctx)` via `makeSeededRng` [Source: `project-context.md#Module System`; Sprint-2 retro AI1]. The `sequence` (raw flashes the Defuser sees anyway) is not the answer — the *translation* is computed server-side, never stored.

### The three-registration gotcha (or ROUND_START throws)

A module needs **all three** or `generateLayout` throws when a round starts [Source: `packages/shared/src/generation/layout.ts` — validates the whole pool]:
1. **Reducer registry** — `apps/server/src/reducers/MODULE_REDUCERS.ts` (Task 7).
2. **Generator registry** — `packages/shared/src/modules/registry.ts → MODULE_GENERATORS` (Task 6).
3. **Tier pool** — `TIER_POOLS.hard` in the same registry (Task 6).

Land all three in one commit. `MODULE_IDS` already reserves `'simon-says'`; `TIER_CATALOG.hard` already lists it (the dashboard shows it as a selectable chip once the generator exists — `RoundConfigPanel.tsx:53` already has its display label). Note the two-pool split: `TIER_POOLS` is the runtime draw; `TIER_CATALOG` is display metadata — expanding the pool without the generator is what throws.

### Colorblind floor (AC #5 — it is a gate, not polish)

`NFR11`/`UX-DR14` list Simon Says explicitly. Every panel gets a `SIMON_COLOR_LABELS` letter (`R/B/G/Y`) rendered with drei `<Text>` (mirror `wires/DefuserView.tsx`), and the flash animation must carry a non-colour cue (label emphasis / pulse) so a colourblind Defuser can still read the sequence. Manual carries a Label↔Colour table. [Source: `epics.md` NFR11/UX-DR14; `packages/shared/src/modules/wires/types.ts` `WIRE_COLOR_LABELS`.]

### Source tree — files to touch

**New (shared):** `packages/shared/src/modules/simon-says/{types,generate,solve,reducer,manual,index}.ts` + `__tests__/simon-says.test.ts`.
**New (client):** `apps/client/src/modules/simon-says/{index.ts,DefuserView.tsx,ManualPages.tsx,types.ts,generate.ts,solve.ts,reducer.ts}` + `__tests__/simonSaysBinding.test.ts`.
**Modified (append-only unless noted):** `packages/shared/src/modules/index.ts`; `packages/shared/src/modules/registry.ts`; `apps/server/src/reducers/MODULE_REDUCERS.ts`; `apps/server/src/handlers/moduleHandlers.ts` (Task 8 — one line); `apps/client/src/modules/index.ts`; `apps/client/src/manual/devManualFixtures.ts`; plus the four test fixes in Task 9.
**Never touch (open/closed):** `apps/server/src/reducers/bombReducer.ts`; `apps/client/src/modules/{interaction,dispatch,registry}.ts`; stores; scenes; `net/`; Docker.

### Testing standards

- **Reducer/generate/solve** — Jest, co-located in the module's `__tests__/`, zero infrastructure [Source: `project-context.md#Testing Rules`]. Required taxonomy: happy / wrong (→transient `'struck'`) / idempotent (post-solve press → same ref) / immutable (freeze `data`, `sequence`, `ctx`; assert no throw + unchanged) / guard (malformed actions `[undefined,null,42,'PRESS',{},{type:'X'}]` → same ref; bad `color`; out-of-range) / reset. **Plus:** one assertion per table cell (2 tables × 3 rows × 4 colours) via `simonTranslate`; `generate` determinism (same seed → `toEqual`), differing seeds differ, and a `Math.random`-throws guard proving generate doesn't call it.
- **Client `DefuserView`** — rendering only; covered by the binding test + (optional) visual regression. If it "needs a logic test," logic has leaked into the view — move it to the reducer [Source: `project-context.md`].
- **Server registration** — extend `moduleRegistration.test.ts` (Task 9): presence + a solve/strike round-trip through the untouched `createBombReducer`.

### Project Structure Notes

Aligns with the established per-module layout (`project-context.md#Module File Structure`, `game-architecture.md` Pattern 3). No structural variance. The only non-append edit is the single Task-8 line in `moduleHandlers.ts`; it is I/O-layer payload enrichment (not game logic and not a `bombReducer` change), so it does not violate the open/closed module rule — it is the sanctioned seam for feeding authoritative live bomb state to any module that needs it.

### Project Context Rules

- **Server-authoritative, never trust the client** — the strike count that selects the table MUST come from server state, not the payload (Task 8). [`project-context.md#Critical Rules`]
- **Pure reducers** — zero imports from `socket.io`/`ioredis`/`pg`/`fastify`; no `Date.now()`/`Math.random()`/`setTimeout`; live values enter as action input. [`project-context.md#Server-Authoritative State`]
- **`BombContext` is read-only** — never mutate it inside the module. Serial last char is always a digit; vowel check scans the whole serial. [`project-context.md#Module System Gotchas`]
- **Naming** — module id `kebab-case` (`simon-says`); state `SimonSaysState`; action `SimonSaysAction`; reducer file exports `simonSaysReducer`. [`project-context.md#Naming Conventions`]
- **Modules are plugins** — add a directory + registry entries; never edit `bombReducer.ts`. [`project-context.md#Module System`]
- **No keyboard listeners in module code** (UX-DR13); interaction via `moduleClickHandlers`. Memoize the store selector to avoid re-render cascades. [`project-context.md#Performance`]

### References

- [Source: `_agent_docs/planning-artifacts/epics.md#Story 7.2: Simon Says Module`] — acceptance criteria.
- [Source: `_agent_docs/planning-artifacts/gdds/gdd-Ktane-2026-06-09/gdd.md#Module 4: Simon Says`] — canonical tables (lines 246–266); timer 90–150 s (line 605).
- [Source: `docs/KeepTalkingAndNobodyExplodes-BombDefusalManual-v1.pdf` p.8] — manual tables (verified identical to GDD).
- [Source: `_agent_docs/game-architecture.md` Patterns 3/4/6] — IModule contract, seeded generation, per-module snapshot sync.
- [Source: `_agent_docs/project-context.md`] — module file structure, testing rules, critical rules, gotchas (line 216 = Simon three-table trap).
- [Source: `packages/shared/src/modules/wires/`] — closest template (ctx-in-state, recompute-at-reduce, manual-from-rule-data, colour labels).
- [Source: `packages/shared/src/modules/the-button/`] — live-value-as-action-input pattern (`RELEASE.timerDigits`).
- [Source: `apps/server/src/handlers/moduleHandlers.ts`] — the `MODULE_INTERACT` reduce/persist/broadcast path (strike injection point, Task 8).
- [Source: `packages/shared/src/modules/registry.ts`] — `MODULE_GENERATORS`, `TIER_POOLS`, `TIER_CATALOG`, `MODULE_IDS`.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (gds-dev-story workflow) — implemented in the `sprint-7-hard-modules` worktree (`/home/jiawei/Ktane-sprint7`).

### Debug Log References

- Shared: `pnpm --filter @bomb-squad/shared test` → 13 suites / 289 tests green (simon-says suite = 26 tests). Typecheck clean.
- Server: `pnpm --filter @bomb-squad/server test` → 36 suites / 561 tests green (+2 skipped LiveKit integration). Typecheck clean.
- Client: `pnpm --filter @bomb-squad/client test` → 49 files / 437 tests green (simonSaysBinding = 3). Typecheck clean. Production build clean.
- Full recursive: `pnpm -r typecheck` clean across all 4 workspaces; `pnpm -r test` green.

### Completion Notes List

- **ALL tasks complete — Jay CONFIRMED WORKING (2026-07-02, interactive /dev/sandbox).** Observed: flash sequence plays and grows by one after a correct stage; a manual-guided translated run solves the module; a wrong press strikes AND the mapping shifts to the next strike row; colour labels legible; press feedback (depress + brighten) visible; the post-strike/post-press playback restart (stop → ~1 s quiet → replay from the first flash) reads cleanly with no stray blink. Stays `review` pending `code-review` (which auto-marks `done`).
- **AC1/AC6 (tables):** `SIMON_TABLES` in `solve.ts` transcribed from `gdd.md#Module 4` (verified identical to KTANE manual p.8). The test asserts all 24 cells against an INDEPENDENTLY hard-coded expectation (a transcription typo fails the suite), plus a bijection/permutation integrity check per row.
- **AC3/AC4 (live strike count — the design crux):** the pure reducer takes the strike count as an action input (`SimonSaysAction.strikeCount`), and the `MODULE_INTERACT` handler now STAMPS the authoritative `bomb.strikes` onto the action before reducing (`{ ...action, strikeCount: bomb.strikes }`), overriding any client value. This is a module-agnostic enrichment (other modules ignore the field — all server tests stayed green). A dedicated handler test proves a spoofed client `strikeCount:0` is overridden by the real count (a press correct only under the true strike row solves). The serial-vowel half reads `ctx` carried in module state (wires precedent) — no stored answer.
- **AC2 (growing sequence):** reducer grows `stage` on a completed stage and solves when `stage === sequence.length` (fixed `SIMON_SEQUENCE_LENGTH = 5`); a wrong press resets `progress` to 0 (replay from the start) and re-arms via transient `'struck'`.
- **AC5 (colorblind floor):** `SIMON_COLOR_LABELS` (R/B/G/Y) rendered on each panel via drei `<Text>`; a flash brightens the panel AND its label together (discrete on/off, reduced-motion safe); the manual carries a Label↔Colour table.
- **AC7 (additive registration):** generator (`MODULE_GENERATORS`) + reducer (`MODULE_REDUCERS`) + `TIER_POOLS.hard` all landed together; `bombReducer.ts` and the client interaction/dispatch/registry primitives untouched. `moduleRegistration.test.ts` gains a positive presence + solve/strike round-trip assertion.
- **Test-fixture debt (Task 9):** four tests used `'simon-says'` as an *unregistered* example — repointed the three fail-loud pool tests to `'memory'` (still unregistered), widened `tierGating` generatable-subset to include `simon-says`, and switched the rogue-rebind example id to `'memory'`.
- **Design note (sequence length):** solving requires reproducing stages 1..5 (15 correct presses total). Matches the KTANE growing mechanic and the 90–150 s timer; `SIMON_SEQUENCE_LENGTH` is a single documented constant if tuning is wanted.
- **Post-verification UX tweaks (Jay interactive run, DefuserView only — rendering, no logic change):** (1) fixed a stray one-panel blink after any press — the continuous flash clock landed mid-flash across a MODULE_UPDATE. Playback now RESETS on any change to the module `data` reference (the store hands a fresh object on every update), which catches a grown stage, a strike (stage/sequence unchanged — only progress resets, so an earlier stage/sequence string signature missed it), and every press: stop immediately → 1 s quiet lead-in (`RESTART_PAUSE`) → replay from the first flash. (2) Added press feedback — a clicked panel briefly depresses (−z) and brightens, so the Defuser sees the press register regardless of server accept/reject. Client typecheck + 437 tests + build still green.

### File List

**New — shared (`packages/shared/src/modules/simon-says/`):**
- `types.ts`, `solve.ts`, `generate.ts`, `reducer.ts`, `manual.ts`, `index.ts`
- `__tests__/simon-says.test.ts`

**New — client (`apps/client/src/modules/simon-says/`):**
- `types.ts`, `generate.ts`, `solve.ts`, `reducer.ts` (re-exports), `DefuserView.tsx`, `ManualPages.tsx`, `index.ts`
- `apps/client/src/modules/__tests__/simonSaysBinding.test.ts`

**Modified:**
- `packages/shared/src/modules/index.ts` — barrel export
- `packages/shared/src/modules/registry.ts` — `MODULE_GENERATORS` + `TIER_POOLS.hard` entries + import
- `apps/server/src/reducers/MODULE_REDUCERS.ts` — reducer registry entry + import
- `apps/server/src/handlers/moduleHandlers.ts` — authoritative strike-count stamp on the module action (Task 8)
- `apps/client/src/modules/index.ts` — barrel import + `SANDBOX_MODULES` entry
- `apps/client/src/manual/devManualFixtures.ts` — replaced the `simon-says` stub with canonical pages
- `packages/shared/src/generation/__tests__/layout.test.ts` — repoint unregistered-id example to `memory`
- `packages/shared/src/generation/__tests__/assembleBomb.test.ts` — repoint unregistered-id example to `memory`
- `apps/server/src/round/__tests__/initializeRoundBombs.test.ts` — repoint unregistered-id example to `memory`
- `apps/server/src/reducers/__tests__/moduleRegistration.test.ts` — positive registration test + rogue-id switched to `memory`
- `packages/shared/src/modules/__tests__/tierGating.test.ts` — widened generatable-subset to include `simon-says`
- `apps/server/src/handlers/__tests__/moduleHandlers.test.ts` — server-authoritative strike-count override test

## Change Log

| Date | Change |
|---|---|
| 2026-07-02 | Implemented Simon Says module (Story 7.2, Tasks 1–10 + Task 11 code-gate) in the sprint-7-hard-modules worktree. All 4 workspaces typecheck clean; shared 289 / server 561 / client 437 tests green; client build clean. Task 11 interactive verify (Jay) outstanding — status → review. |
| 2026-07-02 | Adversarial code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor): all 7 ACs verified satisfied, 0 AC violations. 6 patch findings applied (integer-only strikeCount guard + NaN/Infinity/1.5 tests; solved-quiescent DefuserView playback + click gate; per-frame allocations removed from useFrame; ctx deep-frozen in immutability tests; mid-stage strike-row-switch reducer test; comment accuracy fixes), 1 deferred (sandbox playable past 3rd strike — pre-existing), 6 dismissed. Shared 290 / server 561 / client 437 green; typecheck clean. Status → done. |
