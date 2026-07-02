---
baseline_commit: 0f389788a6592babeb2641fc3d0d36248ef47e60
---

# Story 7.3: Memory Module

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a team,
I want to defuse the 5-stage Memory module by pressing the correct button at each stage,
so that we solve a sequential state machine that references the position and label of buttons pressed in earlier stages.

## Acceptance Criteria

1. **Five-stage sequential progression.** The module has five stages. Each stage shows a display value (1–4) above four buttons labelled 1–4 arranged left-to-right (positions 1–4). The correct button per stage is resolved by the stage's rule table (see Dev Notes → *Stage tables*), which may name an absolute **position**, an absolute **label**, or a back-reference to the **position pressed** or **label pressed** in an earlier stage. A correct press advances to the next stage; the correct press on stage 5 solves the module (`gdd.md#Module 5` — verified identical to the KTANE manual p.11).

2. **Cross-stage tracking (position AND label).** After each correct press the module records BOTH the position pressed and the label that was on that button, because later stages reference either one ("same position as stage 1", "same label as stage 2", etc.). All five back-references in the tables resolve against these recorded results — never against the live layout alone.

3. **Wrong press → reset to stage 1 (the crux, not merely a strike).** An incorrect press returns a transient `'struck'` (rolled up to a team strike by the bomb reducer) AND resets the module's progress to **stage 1** with the press history cleared. It is NOT a strike-on-the-current-stage that lets the Defuser retry from where they were — the whole sequence restarts (`project-context.md` gotcha line 217; `epics.md#Story 7.3`).

4. **Solve on completing stage 5.** When all five stages are completed correctly in sequence, the final correct press sets `status: 'solved'` and the module is inert to further presses.

5. **Numeric legibility (accessibility).** Display and button labels are digits (1–4) rendered with the mono font — Memory is inherently non-colour-dependent (it is NOT on the `NFR11`/`UX-DR14` colorblind module list), but the digits must be legible under the same rendering standard as other modules. The button layout (which label sits at which position) is shown so the Defuser can read position↔label; the **press history is NOT rendered** (remembering it is the module's entire challenge — see Dev Notes).

6. **Reducer test suite.** Covers happy / wrong / idempotent / immutable / guard / reset **and explicitly verifies (a) the reset-to-stage-1 behaviour on a wrong press at every stage ≥2, and (b) each cross-stage reference resolves to the correct button given a recorded history** (`generate` determinism + no-`Math.random` + no stored answer). All 20 table cells (5 stages × 4 display values) are asserted via the solver.

7. **Additive registration, no core edits.** `memory` is registered in all three places (generator, reducer, tier pool) in one commit; `bombReducer.ts`, the `MODULE_INTERACT` handler, and the client interaction/dispatch/registry primitives are untouched. A Hard-tier default round can draw and solve the module without `generateLayout` throwing.

## Tasks / Subtasks

- [x] **Task 1 — Shared module: types** (AC: 1,2,3,5) — `packages/shared/src/modules/memory/types.ts`
  - [x] `export const MEMORY_MODULE_ID = 'memory';` (id already reserved in `MODULE_IDS`).
  - [x] `export type MemoryDigit = 1 | 2 | 3 | 4;` and `export const MEMORY_DIGITS = [1, 2, 3, 4] as const;` (both the display value domain and the button-label domain).
  - [x] `export const MEMORY_STAGE_COUNT = 5;` (solve target — documented constant; the module solves on completing stage `MEMORY_STAGE_COUNT`).
  - [x] `export interface MemoryStage { readonly display: MemoryDigit; readonly labels: ReadonlyArray<MemoryDigit>; }` — `labels` is a length-4 permutation of `[1,2,3,4]`; `labels[i]` is the digit printed on the button at position `i+1` (positions are 1-indexed in the manual; store the array 0-indexed).
  - [x] `export interface MemoryPress { readonly position: MemoryDigit; readonly label: MemoryDigit; }` — one recorded correct press (position 1–4 and the label that was on it).
  - [x] `MemoryState`: `readonly stages: ReadonlyArray<MemoryStage>` (length `MEMORY_STAGE_COUNT`, fixed at generate — displays + layouts are physical, see Dev Notes → *Determinism*), `readonly stage: number` (1..`MEMORY_STAGE_COUNT`, current stage), `readonly history: ReadonlyArray<MemoryPress>` (length `stage-1`; recorded correct presses so far). **No `ctx`** — Memory depends on neither the serial nor the strike count (unlike Simon Says), so it stores no `BombContext`.
  - [x] `export type MemoryAction = { type: 'PRESS'; position: number };` and `export type MemoryReset = { type: 'MODULE_RESET' };`. `position` is 1–4 (left-to-right, matching the manual's "position" language).
  - [x] `export function isMemoryAction(action: unknown): action is MemoryAction | MemoryReset` — runtime guard (untrusted input): accept `MODULE_RESET`; accept `PRESS` only when `typeof position === 'number'`. Bounds/integer checks live in the reducer (mirror `isWiresAction` shape).

- [x] **Task 2 — Shared module: stage tables + solver** (AC: 1,2,6) — `packages/shared/src/modules/memory/solve.ts`
  - [x] Encode `MEMORY_RULES` as structured rule data: a length-5 array (stage 1..5), each a `Record<MemoryDigit, MemoryInstruction>` keyed by the display value. `MemoryInstruction` is a discriminated union — **transcribe EXACTLY** from Dev Notes → *Stage tables*:
    - `{ kind: 'position'; value: MemoryDigit }` — press this absolute position.
    - `{ kind: 'label'; value: MemoryDigit }` — press the button bearing this label.
    - `{ kind: 'samePosition'; stage: number }` — press the same position pressed in that (1-indexed) earlier stage.
    - `{ kind: 'sameLabel'; stage: number }` — press the button with the same label pressed in that earlier stage.
    This single constant feeds BOTH the solver and the manual so they cannot diverge (mirror `WIRES_RULES` / `SIMON_TABLES`).
  - [x] `export function solveMemory(stage: MemoryStage, stageNumber: number, history: ReadonlyArray<MemoryPress>): MemoryDigit` — returns the correct **position** (1–4) to press:
    - `position` → `value`.
    - `label` → the position `i+1` where `stage.labels[i] === value` (always exists; `labels` is a permutation).
    - `samePosition` → `history[stage-1].position` (back-reference; the referenced stage is always `< stageNumber`, so the entry exists).
    - `sameLabel` → the position in the CURRENT layout whose label equals `history[stage-1].label` (i.e. find `i` with `stage.labels[i] === history[stage-1].label`, return `i+1`). Note: "same label" means find that digit in *this* stage's layout, which may sit at a different position.
  - [x] All back-references point strictly backward (stage 2→1; 3→1,2; 4→1,2; 5→1,2,3,4) — no forward references, so `solveMemory` never reads a missing history slot when called at its own stage.

- [x] **Task 3 — Shared module: generator** (AC: 1,6) — `packages/shared/src/modules/memory/generate.ts`
  - [x] `export function generateMemory(seed: number, _ctx: BombContext): MemoryState` using `makeSeededRng(seed)` ONLY (no `Math.random`). For each of `MEMORY_STAGE_COUNT` stages produce: a `display` drawn from `MEMORY_DIGITS`, and a `labels` array = a seeded permutation (shuffle) of `[1,2,3,4]`. Return `{ stages, stage: 1, history: [] }`. `ctx` is unused (accept it for signature conformance; do not store it). Never store the computed answer.
  - [x] Use the existing seeded shuffle helper if one exists in the seed utility; otherwise a Fisher–Yates driven by `makeSeededRng`. Same seed → identical `stages` (determinism test).

- [x] **Task 4 — Shared module: reducer** (AC: 1,2,3,4,6) — `packages/shared/src/modules/memory/reducer.ts`
  - [x] `export const memoryReducer: Reducer<ModuleState<MemoryState>, unknown>`. Contract obligations (copy the wires/simon-says structure):
    - [x] `if (!isMemoryAction(action)) return state;` (guard, never throw).
    - [x] `MODULE_RESET` → `{ ...state, status: 'armed', data: { ...data, stage: 1, history: [] } }` (stages preserved; lifecycle reset — see Dev Notes on why this mirrors the wrong-press reset but stays `'armed'`).
    - [x] Solved-inert: `if (state.status === 'solved') return state;` (defense-in-depth; sandbox runs the reducer directly).
    - [x] Bounds guard: `PRESS` with non-integer or `position < 1 || position > 4` → `return state` (no-op).
    - [x] `const current = data.stages[data.stage - 1];` → `const correct = solveMemory(current, data.stage, data.history);`.
    - [x] **Correct** (`action.position === correct`): record `{ position, label: current.labels[position - 1] }` appended to `history`. If `data.stage === MEMORY_STAGE_COUNT` → `status: 'solved'` (history may be left as the completed record; do not advance stage past 5). Else → `status: 'armed', stage: stage + 1, history: [...history, press]`.
    - [x] **Wrong** (`action.position !== correct`): `status: 'struck'`, **`stage: 1`, `history: []`** (THE reset-to-stage-1 crux — AC #3). `stages` unchanged.
    - [x] No `Date.now()`/`Math.random()`/I/O; never mutate input (spread/return new objects).

- [x] **Task 5 — Shared module: manual** (AC: 1,5) — `packages/shared/src/modules/memory/manual.ts`
  - [x] `export function getMemoryManualPages(): ManualPage[]` with `chapterId: MEMORY_MODULE_ID`, `chapterTitle: 'Memory'`. Build one `ManualTable` per stage (Display → Action) rendered **from `MEMORY_RULES`** (never hardcode a second copy) — format each instruction as human text: `position N` → "Press the button in position N"; `label N` → 'Press the button labeled "N"'; `samePosition k` → "Press the same position as stage k"; `sameLabel k` → "Press the same label as stage k". Include an intro section describing the 5-stage progress/reset loop and the "remember position vs. label" note per stage, and a rule statement that an incorrect press resets to stage 1. Mirror `getSimonSaysManualPages()` / `getWiresManualPages()` shape (`headers`/`rows` string arrays only).

- [x] **Task 6 — Shared module: barrel + generator registry + tier pool** (AC: 7) — one commit
  - [x] `packages/shared/src/modules/memory/index.ts`: assemble `MEMORY_MODULE: IModule<MemoryState, unknown>` = `{ id: MEMORY_MODULE_ID, generate: generateMemory, reduce: memoryReducer, getManualPages: getMemoryManualPages }` and re-export the public surface (types, `MEMORY_RULES`, `solveMemory`, `generateMemory`, `memoryReducer`, `getMemoryManualPages`).
  - [x] `packages/shared/src/modules/index.ts`: `export * from './memory/index.js';`.
  - [x] `packages/shared/src/modules/registry.ts`: add `[MEMORY_MODULE_ID]: generateMemory as ModuleGenerator` to `MODULE_GENERATORS` (import `generateMemory` **directly from `./memory/generate.js`**, not the barrel). Add `'memory'` to `TIER_POOLS.hard` (Memory is a **Hard**-tier module — `TIER_CATALOG.hard` already lists it via `[...MODULE_IDS]`; do NOT touch `easy`/`medium`).

- [x] **Task 7 — Server reducer registry** (AC: 7) — `apps/server/src/reducers/MODULE_REDUCERS.ts`
  - [x] Add `[MEMORY_MODULE_ID]: memoryReducer as ModuleReducer` (import both from `@bomb-squad/shared`). Do **not** edit `bombReducer.ts`. **No `moduleHandlers.ts` change is needed** — Memory takes no live bomb value as input (contrast Simon Says Task 8; the handler already stamps `strikeCount`, which Memory harmlessly ignores).

- [x] **Task 8 — Repoint tests that use `memory` as an *unregistered* example** (AC: 7)
  - [x] Story 7.2 repointed the "unregistered id" fixtures FROM `simon-says` TO `memory`. Now that `memory` is registered, those flip again — repoint each to `'morse-code'` (Story 7.4, the last still-unregistered Hard id) and update the comment/story reference:
    - `packages/shared/src/generation/__tests__/layout.test.ts:24` — `toThrow(/unregistered id "morse-code"/)` on `generateLayout(1, 3, ['morse-code'])`.
    - `packages/shared/src/generation/__tests__/assembleBomb.test.ts:93` — `generateRoundBombs(..., config({ modulePool: ['morse-code'] }))` throws.
    - `apps/server/src/round/__tests__/initializeRoundBombs.test.ts:51` — same repoint to `['morse-code']`.
    - `apps/server/src/reducers/__tests__/moduleRegistration.test.ts:293` — the `rogue({ moduleId: 'memory', ... })` example switches to `'morse-code'`.
  - [x] `packages/shared/src/modules/__tests__/tierGating.test.ts:87-96` — widen the generatable-subset assertion to include `'memory'` (keep the array sorted): `['complicated-wires', 'memory', 'passwords', 'simon-says', 'the-button', 'wires']`; update the `it(...)` title to mention memory 7.3.
  - [x] **Add** a positive registration assertion in `moduleRegistration.test.ts`: `'memory'` is present in `MODULE_REDUCERS`, and a full 5-stage solve (plus a wrong-press reset-to-stage-1) round-trips through the untouched `createBombReducer(registry)`.

- [x] **Task 9 — Client module** (AC: 1,2,5) — `apps/client/src/modules/memory/`
  - [x] Re-export files (`types.ts`/`generate.ts`/`solve.ts`/`reducer.ts`) that `export … from '@bomb-squad/shared'` — never duplicate logic.
  - [x] `DefuserView.tsx` (R3F, **rendering only**, zero game logic): render the current stage's `display` digit prominently and four buttons left-to-right showing `stages[stage-1].labels`. Read state via a memoized `moduleIndex`-scoped selector (`useMemo(() => selectMemoryData(moduleIndex), [moduleIndex])`, mirror `selectSimonData`/`selectWiresData`). Render each digit with drei `<Text font="/fonts/jetbrains-mono-700.ttf">`. A stage indicator (e.g. "Stage 3 / 5") is fine; **do NOT render the press history** (AC #5 — remembering past presses is the module's challenge). Click a button via `moduleClickHandlers(...)` → `dispatchModuleAction(moduleIndex, { type: 'PRESS', position })` where `position` is the clicked slot (1–4). Respect `prefers-reduced-motion` for any press feedback. Optional press feedback (depress/brighten) mirrors the Simon panel feedback — presentation only.
  - [x] `ManualPages.tsx` — typed renderer of `getMemoryManualPages()` (mirror wires/simon-says).
  - [x] `index.ts` — `MEMORY_MODULE` IModule binding + `registerModuleRenderer({ id: MEMORY_MODULE_ID, DefuserView: MemoryDefuserView })`.
  - [x] `apps/client/src/modules/index.ts` — import + add to `SANDBOX_MODULES` + export.
  - [x] `apps/client/src/manual/devManualFixtures.ts` — replace the `memory` **long-chapter placeholder object** (lines ~45–54) with `...getMemoryManualPages()` (import `getMemoryManualPages` alongside the others). The canonical Memory chapter (five stage tables + intro) is itself long, so it continues to exercise per-chapter scroll memory (AC2 of the manual-viewer story) — note this in the replacing comment so the scroll fixture intent is preserved. `search.test.ts` builds its own `page('memory', …)` fixtures and is unaffected.
  - [x] `apps/client/src/modules/__tests__/memoryBinding.test.ts` (vitest) — renderer registered, IModule complete (`getManualPages()[0].chapterId === MEMORY_MODULE_ID` and there are 5 stage tables), listed in `SANDBOX_MODULES`.

- [x] **Task 10 — Full verification**
  - [x] `pnpm -r typecheck` clean (all 4 workspaces); `pnpm -r test` green (shared/server/client), including the new memory suite covering all 20 stage cells, the reset-to-stage-1 cases, and the cross-stage references.
  - [x] **Jay verifies interactively (human-verification AC rule — story is not done until his observed result is in Completion Notes):** in `/dev/sandbox`, generate a Memory module; confirm (a) each stage shows a display digit + four labelled buttons; (b) following the manual, a correct 5-stage run solves the module; (c) a wrong press at stage ≥2 records a strike AND visibly resets the module to stage 1 (the display/layout return to the stage-1 values, not the current stage); (d) digits are legible and past-press history is NOT shown; (e) a Hard-tier live round (Facilitator picks Hard, module drawn from the pool) reaches the Memory module and solves end-to-end.

## Review Findings

_Code review 2026-07-02 (gds-code-review, 3 adversarial layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor). Core logic is clean: all 20 stage-table cells verified correct against the GDD/manual and the independent `EXPECTED_RULES`; AC1–AC7 pass; reset-to-stage-1 crux confirmed to stick through `bombReducer`; purity/immutability/determinism all hold. Two Low presentation/hardening items only._

- [x] [Review][Patch] `prefers-reduced-motion` not respected in press feedback [apps/client/src/modules/memory/DefuserView.tsx:62] — FIXED: imported `prefersReducedMotion` from `../../scenes/dom.js`, gate the depress (`group.position.z`) behind `!reduced` so reduced-motion users get no positional movement; the static emissive brighten remains as non-motion press feedback (mirrors `simon-says`). Presentation-only.
- [x] [Review][Patch] DefuserView only null-checks `data`, not `data.stages[data.stage-1]` [apps/client/src/modules/memory/DefuserView.tsx:76] — FIXED: guard tightened to `if (!data?.stages?.[data.stage - 1]) return null` so a partial/malformed `MemoryState` renders null instead of throwing a render-time TypeError. Defensive hardening (not reachable via the normal server contract).

## Dev Notes

### The one non-trivial design decision: reset-to-stage-1, not a per-stage retry (read this first)

Memory's defining behaviour (and the top project-context gotcha for it, line 217) is that a wrong press **throws away all progress** — the module returns to stage 1 with its press history cleared — in addition to recording a strike. Agents commonly mis-model this as "strike on the current stage, try again from here." It is not: the Defuser must re-execute the entire sequence from stage 1.

Mechanically this rides the SAME transient-`'struck'` seam every module uses. The module reducer returns `{ status: 'struck', data: { ...data, stage: 1, history: [] } }`. The bomb reducer then rolls `'struck'` up into a team strike and flips the module's status back to `'armed'`, **preserving the returned data** — so the reset-to-stage-1 sticks [Source: `apps/server/src/reducers/bombReducer.ts` lines 29–33: `wasStruck ? { ...next, status: 'armed' } : next`]. There is no extra plumbing; the reset is entirely inside the module reducer's returned `data`.

`MODULE_RESET` (the lifecycle action for between-round re-arming) does the identical stage/history reset but returns `status: 'armed'` directly (it does not go through the strike roll-up). Both land at the same `{ stage: 1, history: [] }` state; they differ only in status and in whether a strike is recorded.

### Memory needs NO server handler change (contrast Simon Says)

Simon Says Story 7.2 added a line to `moduleHandlers.ts` to stamp the authoritative `bomb.strikes` onto the action, because its table selection depends on live mutating bomb state. **Memory has no such dependency** — its answer is a pure function of the module's own state (`stages` + `stage` + `history`) and the incoming press. So:

- The pure reducer needs no injected live value; do NOT add any handler stamping for Memory.
- The handler already stamps `strikeCount` (from 7.2); Memory's guard/reducer simply ignore that extra field. That is fine and expected — the stamp is module-agnostic enrichment.
- Do not touch `moduleHandlers.ts`. This keeps Memory strictly additive (AC #7).

Because there is no live-value input and no serial dependency, `MemoryState` carries **no `BombContext`** — one fewer thing to store/immutability-test than wires or simon-says.

### Determinism: displays and layouts are fixed at generate (and replay on reset)

In the original game the display digits are re-rolled each time you (re-)enter a stage. We CANNOT re-randomise at reduce time — reducers are pure, no `Math.random`/`Date.now` [Source: `project-context.md#Critical Don't-Miss Rules`]. So we fix all five stages' `display` + `labels` at `generate(seed)` time and, on a reset, **replay the same fixed stages from stage 1**. This is a deliberate, deterministic simplification: the memory challenge is preserved (you must reproduce the correct sequence), and the module is fully reproducible for tests and for per-team fairness (`A7` — Memory sequences are seeded per team). Document this in a comment in `generate.ts`/`types.ts` so a future reviewer doesn't "fix" it into non-determinism.

### Stage tables (transcribe EXACTLY — the crux of AC #1/#2 and #6)

Display value → button to press. Verified identical between `gdd.md#Module 5: Memory` (project canon, lines 268–324) and the KTANE manual p.11 (`docs/…v1.pdf`). Encode as `MEMORY_RULES` in `solve.ts`; the manual renders from the same constant. "position N" = the slot N (1–4, left→right); "label N" = the button bearing the digit N (its slot varies per stage).

**Stage 1** — *remember: position pressed*

| Display | Action |
|---|---|
| 1 | Press **position 2** |
| 2 | Press **position 2** |
| 3 | Press **position 3** |
| 4 | Press **position 4** |

**Stage 2** — *remember: position pressed*

| Display | Action |
|---|---|
| 1 | Press **label "4"** |
| 2 | Press **same position as stage 1** |
| 3 | Press **position 1** |
| 4 | Press **same position as stage 1** |

**Stage 3** — *remember: label pressed*

| Display | Action |
|---|---|
| 1 | Press **same label as stage 2** |
| 2 | Press **same label as stage 1** |
| 3 | Press **position 3** |
| 4 | Press **label "4"** |

**Stage 4** — *remember: position pressed*

| Display | Action |
|---|---|
| 1 | Press **same position as stage 1** |
| 2 | Press **position 1** |
| 3 | Press **same position as stage 2** |
| 4 | Press **same position as stage 2** |

**Stage 5** — *(final)*

| Display | Action |
|---|---|
| 1 | Press **same label as stage 1** |
| 2 | Press **same label as stage 2** |
| 3 | Press **same label as stage 4** |
| 4 | Press **same label as stage 3** |

> Common LLM failure (project-context gotcha line 217): implementing a single stage / a per-stage retry. **It is a 5-stage machine that resets to stage 1 on any wrong press**, and stages 2–5 reference earlier presses by BOTH position and label — you must record both.

### `MEMORY_RULES` as the single source of truth

Encode the tables above as one typed constant (`MemoryInstruction` union). The solver evaluates it and the manual renders from it — a transcription typo then fails BOTH the solve test and shows in the manual, and the two can never drift (the pattern `WIRES_RULES` / `SIMON_TABLES` established). The reducer test asserts every one of the 20 cells (`solveMemory` against a constructed stage + history), plus per-instruction resolution (a `label`/`sameLabel` reference lands on the position whose layout digit matches).

### Module plugin contract (the pattern to copy)

- **Pure logic lives in `packages/shared/src/modules/memory/`** so both the server registry (run via `tsx`) and the client sandbox execute the same code; the client dir just re-exports [Source: `game-architecture.md` Pattern 3; `project-context.md#Code Organization Rules`]. Closest templates: **`simon-says` (7.2)** — the freshest multi-stage/growing-sequence module with the same directory shape; **`wires` (5.3)** — the cleanest baseline. Copy the directory shape (`types/generate/solve/reducer/manual/index/__tests__`).
- **`ModuleState<S>` envelope:** `{ moduleId, status: 'armed'|'solved'|'struck', data: S }`. `'struck'` is **transient** — the bomb reducer rolls it into a team strike and re-arms; the module never holds it [Source: `packages/shared/src/types/module.ts`].
- **`IModule` shape:** `{ id, generate(seed,ctx), reduce, getManualPages() }` [Source: `packages/shared/src/types/module.ts`].
- **Actions arrive as `unknown`** (untrusted). Guard first with `isMemoryAction`, never throw. `MODULE_RESET` is forwarded whole and must be handled (it bypasses the bomb reducer's solved-inert guard) [Source: `apps/server/src/reducers/bombReducer.ts`].
- **Never store the answer / never `Math.random`.** Randomness only in `generate(seed,ctx)` via `makeSeededRng`. The `stages` (displays + layouts the Defuser sees anyway) are not the answer — the *correct position* is computed at reduce time from `MEMORY_RULES` + `history`, never stored [Source: `project-context.md#Critical Don't-Miss Rules`; Sprint-2 retro AI1].

### The three-registration gotcha (or ROUND_START throws)

A module needs **all three** or `generateLayout` throws when a round starts [Source: `packages/shared/src/generation/layout.ts` — validates the whole pool]:
1. **Reducer registry** — `apps/server/src/reducers/MODULE_REDUCERS.ts` (Task 7).
2. **Generator registry** — `packages/shared/src/modules/registry.ts → MODULE_GENERATORS` (Task 6).
3. **Tier pool** — `TIER_POOLS.hard` in the same registry (Task 6).

Land all three in one commit. `MODULE_IDS` already reserves `'memory'`; `TIER_CATALOG.hard` already lists it (it is `[...MODULE_IDS]`), and `RoundConfigPanel.tsx:54` already has its display label `memory: 'Memory'` — so the dashboard shows the chip as *selectable* the moment the generator exists (`TIER_CATALOG[tier] ∩ keys(MODULE_GENERATORS)`). Note the two-pool split: `TIER_POOLS` is the runtime draw; `TIER_CATALOG` is display metadata — expanding the pool without the generator is what throws.

### Inherited test debt — the `memory` id was the "unregistered" example (Task 8, do not skip)

Story 7.2 repointed the fail-loud "unregistered id" fixtures FROM `simon-says` TO `memory` (four call sites + a rogue-rebind id). Registering `memory` now flips all of them — they will fail unless repointed to `'morse-code'` (Story 7.4's id, the last still-unregistered Hard module). This is the exact same mechanical hazard 7.2 hit; the grep is in Task 8. Also widen `tierGating.test.ts`'s generatable-subset expectation to include `'memory'`. Run the full suite BEFORE claiming done — these are pre-existing tests that go red on registration.

### Colorblind / accessibility (AC #5)

Memory is **NOT** on the `NFR11`/`UX-DR14` colorblind-floor list (that list is Wires, The Button, Simon Says, Complicated Wires) because its signal is numeric (digits 1–4), not colour — so there is no colour→label redundancy gate to satisfy. Just render the display and button digits legibly with the mono drei `<Text>` (mirror wires' label rendering). The genuine UX constraint here is the opposite of revealing information: **do not render the press history** — surfacing "you pressed position 2 in stage 1" would defeat the memory mechanic. Show only the current stage. [Source: `epics.md` NFR11/UX-DR14; `gdd.md#Module 5`.]

### Source tree — files to touch

**New (shared):** `packages/shared/src/modules/memory/{types,generate,solve,reducer,manual,index}.ts` + `__tests__/memory.test.ts`.
**New (client):** `apps/client/src/modules/memory/{index.ts,DefuserView.tsx,ManualPages.tsx,types.ts,generate.ts,solve.ts,reducer.ts}` + `__tests__/memoryBinding.test.ts`.
**Modified (append-only unless noted):** `packages/shared/src/modules/index.ts`; `packages/shared/src/modules/registry.ts`; `apps/server/src/reducers/MODULE_REDUCERS.ts`; `apps/client/src/modules/index.ts`; `apps/client/src/manual/devManualFixtures.ts` (replace the `memory` long-chapter fixture with canonical pages); plus the five test repoints/widenings in Task 8.
**Never touch (open/closed):** `apps/server/src/reducers/bombReducer.ts`; `apps/server/src/handlers/moduleHandlers.ts` (Memory needs no strike/live-value injection); `apps/client/src/modules/{interaction,dispatch,registry}.ts`; stores; scenes; `net/`; Docker.

### Testing standards

- **Reducer/generate/solve** — Jest, co-located in the module's `__tests__/`, zero infrastructure [Source: `project-context.md#Testing Rules`]. Required taxonomy: happy (full 5-stage solve) / wrong (→ transient `'struck'` AND `stage:1, history:[]`) / idempotent (post-solve press → same ref) / immutable (freeze `data`, `stages`, `history`; assert no throw + unchanged) / guard (malformed actions `[undefined,null,42,'PRESS',{},{type:'X'}]` → same ref; `position` out of 1–4; non-integer) / reset (`MODULE_RESET` → stage 1, history cleared, status `armed`). **Plus:** an assertion per table cell (5 stages × 4 displays = 20) via `solveMemory` with a constructed stage + history; a targeted test that a wrong press at stage 3, 4 and 5 all return to stage 1 (not the current stage); a cross-stage test proving `samePosition`/`sameLabel` resolve against recorded history (build a history where the answer differs from the naive same-display reading); `generate` determinism (same seed → `toEqual`), differing seeds differ, `labels` is always a permutation of 1–4, and a `Math.random`-throws guard proving generate doesn't call it.
- **Client `DefuserView`** — rendering only; covered by the binding test + (optional) visual regression. If it "needs a logic test," logic has leaked into the view — move it to the reducer [Source: `project-context.md#Testing Rules`].
- **Server registration** — extend `moduleRegistration.test.ts` (Task 8): presence + a 5-stage solve and a wrong-press reset round-trip through the untouched `createBombReducer`.

### Project Structure Notes

Aligns with the established per-module layout (`project-context.md#Code Organization Rules`, `game-architecture.md` Pattern 3). No structural variance. Unlike Simon Says (7.2), there is **zero** change outside the module directory and the registry/barrel/test-fixture edits — no `moduleHandlers.ts` seam is needed because Memory consumes no live bomb state. That keeps this the most strictly-additive Hard module so far.

### Project Context Rules

- **Pure reducers** — zero imports from `socket.io`/`ioredis`/`pg`/`fastify`; no `Date.now()`/`Math.random()`/`setTimeout`. Randomness only in `generate(seed)`. [`project-context.md#Critical Don't-Miss Rules`]
- **Server-authoritative, client untrusted** — bounds-check `position` in the reducer; never trust the payload. The answer is computed server-side from module state, never sent to or taken from the client. [`project-context.md#Security`]
- **Modules are plugins** — add a directory + registry entries; never edit `bombReducer.ts` (and here, not `moduleHandlers.ts` either). [`project-context.md#Code Organization Rules`]
- **Naming** — module id `kebab-case` (`memory`); state `MemoryState`; action `MemoryAction`; reducer file exports `memoryReducer`. [`project-context.md#Code Organization Rules`]
- **No keyboard listeners in module code** (UX-DR13); interaction via `moduleClickHandlers`. Memoize the store selector to avoid re-render cascades. [`project-context.md#React / R3F Gotchas`]
- **Memory-specific gotcha** — resets to stage 1 on an incorrect press; it is a 5-stage sequential state machine, not a single stage. [`project-context.md` line 217]

### References

- [Source: `_agent_docs/planning-artifacts/epics.md#Story 7.3: Memory Module`] — acceptance criteria.
- [Source: `_agent_docs/planning-artifacts/gdds/gdd-Ktane-2026-06-09/gdd.md#Module 5: Memory`] — canonical stage tables (lines 268–324); timer 120–180 s (line 606).
- [Source: `docs/KeepTalkingAndNobodyExplodes-BombDefusalManual-v1.pdf` p.11] — "On the Subject of Memory" (verified identical to the GDD tables).
- [Source: `_agent_docs/implementation-artifacts/7-2-simon-says-module.md`] — closest just-landed template (multi-stage module, three-registration gotcha, test-fixture repoint pattern).
- [Source: `packages/shared/src/modules/wires/`] — baseline template (`types/generate/solve/reducer/manual/index`, manual-from-rule-data, colour/label labels).
- [Source: `packages/shared/src/modules/simon-says/`] — sequence/stage state machine + `MEMORY_RULES`-style single-source-of-truth pattern (`SIMON_TABLES`).
- [Source: `apps/server/src/reducers/bombReducer.ts` lines 29–33] — the transient-`'struck'` roll-up that preserves returned `data` (how reset-to-stage-1 sticks).
- [Source: `packages/shared/src/modules/registry.ts`] — `MODULE_GENERATORS`, `TIER_POOLS`, `TIER_CATALOG`, `MODULE_IDS` (memory reserved at line 85).
- [Source: `apps/client/src/manual/devManualFixtures.ts` lines 45–54] — the `memory` long-chapter fixture to replace with canonical pages.
- [Source: `_agent_docs/project-context.md`] — module file structure, testing rules, critical rules, gotchas (line 217 = Memory reset-to-stage-1 trap).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (gds-dev-story workflow) — implemented in the `sprint-7-hard-modules` worktree (`/home/jiawei/Ktane-sprint7`).

### Debug Log References

- Shared: `pnpm --filter @bomb-squad/shared test` → 14 suites / 316 tests green (memory suite = 27 tests). Typecheck clean.
- Server: `pnpm --filter @bomb-squad/server test` → 36 suites / 562 tests green (+2 skipped LiveKit integration). Typecheck clean.
- Client: `pnpm --filter @bomb-squad/client test` → 50 files / 440 tests green (memoryBinding = 3). Typecheck clean. Production build clean (`vite build` ✓).
- Full recursive: `pnpm -r typecheck` clean across all 4 workspaces; `pnpm -r test` green (shared 316 / server 562 / client 440).

### Completion Notes List

- **ALL tasks complete — Jay CONFIRMED WORKING (2026-07-02, interactive `/dev/sandbox`).** Verified against real-code walkthroughs generated from `generateMemory`/`solveMemory` (sandbox feeds the typed seed straight into `generate`): seed 1 solves on presses 3·3·3·3·1, seed 7 on 2·1·3·1·4 (exercising the samePosition/sameLabel cross-stage references), seed 42 on 3·1·2·1·4; and a wrong press mid-run visibly resets the module all the way to stage 1 (display + button layout return to the stage-1 values) rather than retrying the current stage. Stays `review` pending `code-review` (which auto-marks `done`).
- **AC1/AC6 (stage tables):** `MEMORY_RULES` in `solve.ts` transcribed from `gdd.md#Module 5` (verified identical to KTANE manual p.11 by rendering the PDF). The test asserts all 20 cells against an INDEPENDENTLY hard-coded `EXPECTED_RULES` (a transcription typo fails the suite), plus a "no forward references" structural check. `solveMemory` has per-instruction-kind resolution tests (position / label / samePosition / sameLabel), including a `sameLabel` case where the referenced label sits at a different position this stage.
- **AC2/AC3 (the crux — reset-to-stage-1):** a wrong press returns transient `'struck'` with `data` reset to `{ stage: 1, history: [] }`; the bomb reducer rolls `'struck'` into a team strike and re-arms while preserving the returned data, so the reset sticks. A dedicated test drives to stages 3, 4 and 5, issues a wrong press at each, and asserts `stage === 1` + `history === []` (NOT a per-stage retry), then re-solves from the reset. The `moduleRegistration` server test proves the same through the untouched `createBombReducer`.
- **AC2 (cross-stage tracking):** each correct press records `{ position, label: current.labels[position-1] }`; stages 2–5 back-reference `history[stage-1]` by position (`samePosition`) or by label (`sameLabel`). Happy path drives a hand-verified 5-stage instance (`FIVE_STAGES`, correct presses `[2,2,1,2,2]`) exercising position + samePosition + sameLabel references end-to-end.
- **AC4 (solve on stage 5):** the correct press when `stage === MEMORY_STAGE_COUNT (5)` sets `status: 'solved'`; solved modules are inert (post-solve press → same ref).
- **AC5 (accessibility / no history leak):** display + button labels are digits (1–4) rendered with drei mono `<Text>` — Memory is inherently non-colour (not on the `NFR11`/`UX-DR14` list). The DefuserView renders ONLY the current stage (display, four labelled buttons, a "STAGE n / 5" counter) — the press history is deliberately NOT shown, preserving the memory mechanic. Press feedback (depress + brighten) fires locally on click.
- **AC7 (additive registration — NO handler change):** generator (`MODULE_GENERATORS`) + reducer (`MODULE_REDUCERS`) + `TIER_POOLS.hard` landed together. Unlike Simon Says (7.2), **`moduleHandlers.ts` was NOT touched** — Memory consumes no live bomb state (no serial/strike input), so `MemoryState` carries no `BombContext` and needs no per-module enrichment. `bombReducer.ts` and the client interaction/dispatch/registry primitives are untouched. Most strictly-additive Hard module so far.
- **Determinism note:** displays + button layouts are fixed at `generate(seed)` and REPLAYED on reset (a pure reducer cannot re-randomise). Documented in `generate.ts`/`types.ts`. `generateMemory` uses `makeSeededRng` only (a `Math.random`-throws guard proves it); labels are always a permutation of 1–4 (Fisher–Yates).
- **Inherited test debt (Task 8):** Story 7.2 had repointed the four "unregistered id" fixtures FROM `simon-says` TO `memory`; registering `memory` flipped them, so all four were repointed to `'morse-code'` (Story 7.4, the last unregistered id) — `layout.test.ts`, `assembleBomb.test.ts`, `initializeRoundBombs.test.ts`, and the `moduleRegistration` rogue-rebind id. `tierGating.test.ts` generatable-subset widened to include `'memory'`; a positive memory registration + solve/reset round-trip test added.
- **devManualFixtures:** the `memory` long-chapter placeholder (the AC2 scroll-memory fixture) was replaced with canonical `...getMemoryManualPages()`; the five stage tables + intro keep it the longest chapter, so the scroll-memory intent is preserved. `search.test.ts` builds its own `page('memory', …)` fixtures and was unaffected.

### File List

**New — shared (`packages/shared/src/modules/memory/`):**
- `types.ts`, `solve.ts`, `generate.ts`, `reducer.ts`, `manual.ts`, `index.ts`
- `__tests__/memory.test.ts`

**New — client (`apps/client/src/modules/memory/`):**
- `types.ts`, `generate.ts`, `solve.ts`, `reducer.ts` (re-exports), `DefuserView.tsx`, `ManualPages.tsx`, `index.ts`
- `apps/client/src/modules/__tests__/memoryBinding.test.ts`

**Modified:**
- `packages/shared/src/modules/index.ts` — barrel export
- `packages/shared/src/modules/registry.ts` — `MODULE_GENERATORS` + `TIER_POOLS.hard` entries + import
- `apps/server/src/reducers/MODULE_REDUCERS.ts` — reducer registry entry + import
- `apps/client/src/modules/index.ts` — barrel import + `SANDBOX_MODULES` entry + export
- `apps/client/src/manual/devManualFixtures.ts` — replaced the `memory` long-chapter fixture with canonical pages
- `packages/shared/src/generation/__tests__/layout.test.ts` — repoint unregistered-id example `memory` → `morse-code`
- `packages/shared/src/generation/__tests__/assembleBomb.test.ts` — same repoint
- `apps/server/src/round/__tests__/initializeRoundBombs.test.ts` — same repoint
- `apps/server/src/reducers/__tests__/moduleRegistration.test.ts` — positive memory registration/solve+reset test + rogue-id `memory` → `morse-code`
- `packages/shared/src/modules/__tests__/tierGating.test.ts` — widened generatable-subset to include `memory`

## Change Log

| Date | Change |
|---|---|
| 2026-07-02 | Story 7.3 (Memory Module) created via gds-create-story in the sprint-7-hard-modules worktree. Status → ready-for-dev. |
| 2026-07-02 | Implemented Memory module (Story 7.3, Tasks 1–9 + Task 10 code-gate) in the sprint-7-hard-modules worktree. All 4 workspaces typecheck clean; shared 316 / server 562 / client 440 tests green; client build clean. Task 10 interactive verify (Jay) outstanding — status → review. |
