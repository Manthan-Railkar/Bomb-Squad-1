---
baseline_commit: 51d43ca
---

# Story 6.3: Wire Sequences Module

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a team,
I want to defuse the Wire Sequences module across paged panels,
So that we solve a module requiring cumulative occurrence tracking.

## Acceptance Criteria

1. **Seeded multi-panel generation with a well-defined, non-trivial solution:** **Given** a generated Wire Sequences module, **when** `generate(seed, ctx)` runs, **then** it produces **several panels** (recommend 3–4), each holding **1–3 wires** in distinct vertical slots, where every wire has a **colour** (`red`/`blue`/`black`) and a **connection letter** (`A`/`B`/`C`); the instance is deterministic given the seed, is **not born-solved** (at least one wire must be cut per the rules), and **no colour exceeds 9 cumulative occurrences** (the rule table only defines occurrences 1–9).
2. **Cumulative occurrence counting drives the cut decision:** **Given** the wires laid out across all panels in reading order (panel 0 top→bottom, then panel 1, …), **when** a wire is evaluated, **then** its **occurrence number** is the running count of wires of the **same colour** at-or-before it across **all** panels (not per-panel), and it is a *should-cut* wire **iff** its connection letter is in the rule table's cell for its colour + occurrence.
3. **Cutting a should-cut wire progresses; cutting a should-not-cut wire strikes:** **Given** a wire the table says to cut, **when** the Defuser cuts it, **then** the wire becomes severed and, once **every** should-cut wire across all panels is severed, the module solves. **Given** a wire the table says **not** to cut for its occurrence, **when** the Defuser cuts it, **then** a strike is recorded (transient `'struck'`). A cut is **physical**: an already-severed wire is a no-op (never a second strike), so the wrongly-cut wire stays severed.
4. **Panel navigation:** **Given** multiple panels, **when** the Defuser presses up/down, **then** the visible panel changes (down = next, up = previous), clamped to the first/last panel; navigation never strikes, never solves, and never changes occurrence counting (which is global and view-independent).
5. **Reducer test suite:** **Given** the reducer test suite, **when** it runs, **then** it covers happy-path, wrong-interaction, idempotency, immutability (frozen input), guard clauses, and reset — **including occurrence counting across panel navigation** (cut a should-cut wire on a later panel after navigating to it; verify a wire's cut decision depends on its cumulative occurrence, not its panel-local position).
6. **Human verification:** Jay exercises Wire Sequences interactively in `/dev/sandbox` (navigate panels with up/down; use `/dev/manual` to count each colour's cumulative occurrence and cut the wires the table directs; confirm the module solves once all should-cut wires are severed; cut a should-not-cut wire → strike + recovery) and his observed results are recorded in Completion Notes before the story is marked done.

## Tasks / Subtasks

- [x] Task 1 — Shared pure logic: `packages/shared/src/modules/wire-sequences/` (AC: 1, 2, 3, 4)
  - [x] Copy the directory shape of a sibling module: `types.ts`, `generate.ts`, `solve.ts`, `reducer.ts`, `manual.ts`, `index.ts`, `__tests__/`. **The two closest templates:** `wires` (5.3) for the **CUT / physical-sever / colorblind-label** mechanics, and `keypads` (6.1) for the **Medium registry pattern**. Barrel-export from `packages/shared/src/modules/index.ts`; confirm it reaches `packages/shared/src/index.ts`. Module id = `'wire-sequences'` (**already reserved** in `MODULE_IDS` — verified at `registry.ts:78`).
  - [x] `types.ts`: `WIRE_SEQUENCES_MODULE_ID = 'wire-sequences'`. Types:
    ```ts
    export const WIRE_SEQ_COLORS = ['red', 'blue', 'black'] as const;      // the 3 rule-table colours (NOT the 5-colour `wires` set)
    export const WIRE_SEQ_LETTERS = ['A', 'B', 'C'] as const;
    export type WireSeqColor = (typeof WIRE_SEQ_COLORS)[number];
    export type WireSeqLetter = (typeof WIRE_SEQ_LETTERS)[number];
    export interface WireSeqWire { readonly color: WireSeqColor; readonly letter: WireSeqLetter; readonly cut: boolean; }
    export interface WireSeqPanel { readonly wires: ReadonlyArray<WireSeqWire>; }  // 1..3 wires, distinct slots
    export interface WireSequencesState { readonly panels: ReadonlyArray<WireSeqPanel>; readonly currentPanel: number; }
    export type WireSequencesAction = { type: 'CUT'; wireIndex: number } | { type: 'NAV'; direction: 'up' | 'down' };
    export type WireSequencesReset = { type: 'MODULE_RESET' };
    ```
    plus `isWireSequencesAction(action: unknown)` runtime guard (actions arrive as `unknown`; accept `MODULE_RESET`, `CUT` with a `number` `wireIndex`, and `NAV` with `direction` ∈ `{'up','down'}`; reject everything else).
  - [x] **The authoritative CUT_RULES table** (canonical KTANE v1 — see Dev Notes for the PDF-verified transcription): `CUT_RULES: Record<WireSeqColor, ReadonlyArray<ReadonlyArray<WireSeqLetter>>>` — for each colour, **9 entries** (occurrence 1..9) where entry `[occ-1]` is the set of letters that mean "cut". This ONE constant is the single source shared by `solve.ts` (the reducer) and `manual.ts` (the Expert pages) — they cannot diverge.
  - [x] **No stored answer (wires AI1 / keypads / whos-on-first convention):** do **not** store which wires are should-cut, nor a solution list, in state. Everything needed is public — the wires (colour + letter) are rendered on the module, and `CUT_RULES` is public manual content. The reducer recomputes the cut decision from `panels` + `CUT_RULES` at cut-time. Nothing secret rides in state or crosses to the client.
  - [x] `generate.ts`: all randomness via `makeSeededRng(seed)` (**no `Math.random()`**; `ctx` unused — Wire Sequences has no bomb-context rule, like keypads/whos-on-first — signature `generateWireSequences(seed: number)`). Algorithm: (a) seeded panel count (recommend **3–4**); (b) per panel, seeded wire count **1–3** in distinct slots; (c) per wire, seeded `color` ∈ `WIRE_SEQ_COLORS` and `letter` ∈ `WIRE_SEQ_LETTERS`; all `cut: false`; `currentPanel: 0`. **Validate-then-reroll (passwords/keypads/whos-on-first pattern):** re-draw from the same seeded stream until the instance satisfies **both** (i) `isSolved` is **false** at generation (≥1 should-cut wire — never born-solved, AC1) **and** (ii) no colour's total occurrence count exceeds **9** (the table's domain). Cap the loop and **throw loud** if unsatisfiable (never-happens safety net — a thrown round is debuggable; a silent unsolvable/born-solved puzzle is not). Deterministic given the seed; CPU-cheap.
  - [x] `solve.ts` (all pure; single source = `CUT_RULES` + the flattened wire order): `flattenWires(state)` → wires in **global reading order** (panel-major, slot-minor) each tagged with its `{ panelIndex, slotIndex, globalIndex }`. `occurrenceOf(state, globalIndex)` → 1-based count of same-colour wires at global index ≤ this one. `shouldCut(state, globalIndex)` → `true` iff the wire's `letter` ∈ `CUT_RULES[color][occurrence - 1]` (**guard**: if `occurrence - 1 >= CUT_RULES[color].length`, return `false` — defensive against a >9 occurrence that generation should have prevented; never index `undefined`). `isSolved(state)` → **every** wire where `shouldCut` is `true` is `cut === true` (a should-not-cut wire's cut state is irrelevant to solving). `wireByGlobalIndex(state, globalIndex)` helper for the reducer's bounds check.
  - [x] `reducer.ts`: pure `Reducer<ModuleState<WireSequencesState>, unknown>`. Copy the `wires` reducer contract, then add NAV + the solve check:
    - `MODULE_RESET` → re-arm: all wires `cut: false`, `currentPanel: 0`, `status: 'armed'` (bypasses the bomb reducer's solved-inert guard, forwarded whole — the sibling template semantics).
    - solved-inert: any action on a `'solved'` module (except `MODULE_RESET`) → unchanged.
    - `NAV` → `currentPanel` moves ±1 (`down` = +1, `up` = −1) **clamped** to `[0, panels.length - 1]`; at a boundary it returns the **same** object (no needless allocation). NAV never sets `'struck'`/`'solved'`.
    - `CUT` → bounds/`NaN`/non-integer guard on `wireIndex` (global index) → unchanged; **already-cut wire → no-op** (idempotent, never a second strike); else mark that wire `cut: true`. Then: if `shouldCut(state, wireIndex)` → `isSolved(newState)` ? `'solved'` : `'armed'`; else → `'struck'` (transient; the wire **stays severed** — that is what makes a repeat CUT a no-op and satisfies the idempotency AC). **Do NOT gate CUT on `currentPanel`** — the reducer is position-agnostic; the client only makes current-panel wires clickable, so out-of-panel cuts only arrive from a malformed client and are handled purely by the bounds guard (KTANE-faithful "cut only the visible panel" is a UI concern, not a reducer rule; document this choice in `reducer.ts`).
    - Never `Date.now()`/`Math.random()`/I/O in the reducer.
  - [x] `manual.ts`: `getWireSequencesManualPages(): ManualPage[]` — a `wire-sequences` chapter with a short intro ("Switch panels with up/down. Wire occurrences are cumulative across ALL panels. For each wire, count how many wires of its colour have appeared so far (this one included), then cut it only if its letter is listed for that colour + occurrence.") plus **three structured `ManualTable`s** (one per colour) rendered from `CUT_RULES` — columns `Occurrence | Cut if connected to`, rows 1st…9th. Structured `ManualTable`/`ManualSection` only — **no HTML/JSX** (follow keypads' `manual.ts`). Mind the shared `PageRenderer` right-aligns the **last** cell of each row — the "Cut if connected to" answer column is naturally that last cell, so no spacer column is needed (unlike keypads' symmetric grid).
- [x] Task 2 — Rule-table fidelity + integrity tests (AC: 1, 2, 3) — **the correctness crux**
  - [x] Transcribe `CUT_RULES` from the **canonical KTANE v1 manual** exactly. The authoritative, already-extracted values are in Dev Notes (PDF **page 14**, text layer — reliable, no by-eye reading required, unlike 6.2's eye-icon grid). **Cross-check against the rendered/extracted page before trusting** (render command in Dev Notes).
  - [x] Integrity tests: `CUT_RULES` has exactly the 3 colour keys; each colour has exactly **9** entries; every entry is a subset of `{A,B,C}` with **no duplicates within a cell**; the letter sets match the Dev Notes table cell-for-cell (a pinned literal assertion so a future typo fails loud). Add a hand-worked occurrence example verified against the manual by eye (e.g. "3rd red → A", "6th blue → B or C").
- [x] Task 3 — Client module directory: `apps/client/src/modules/wire-sequences/` (AC: 1, 3, 4)
  - [x] Copy the **wires** client dir (closest for wire rendering + cut) and the **keypads** dir (for the IModule binding shape): `index.ts` (IModule binding + import-time `registerModuleRenderer`), `DefuserView.tsx`, `ManualPages.tsx` (minimal typed render of `getWireSequencesManualPages()`), re-export `types/generate/solve/reducer` from `@bomb-squad/shared`, `__tests__/`.
  - [x] `DefuserView.tsx` (R3F, rendering only, **zero game logic**): render **only the current panel** (`data.panels[data.currentPanel].wires`) as horizontal wires (reuse the `wires` DefuserView layout: colour tint + severed-stub visual when `cut`), each wire showing its **connection letter A/B/C** prominently (the readable the Expert needs) **and** a **colour redundancy label** (colorblind floor — colour is rule-load-bearing; use a colour label that does **not** collide with the A/B/C connection letters, e.g. spell the colour or use `R`/`U`/`K`; see Dev Notes). Add **up/down nav buttons** and a **panel indicator** ("Panel {currentPanel+1} of {panels.length}"). Fully data-driven — map over the current panel's wires (never hardcode). Memoized scoped zustand selector on `moduleIndex` (the 5.3 review pattern; `wires`/`keypads` selectors are the template). No timer → **no `useFrame`**.
  - [x] Interaction (all single-click via the existing `moduleClickHandlers` from `apps/client/src/modules/interaction.ts` — left-button only, drag-tolerant, `stopPropagation`; do **not** reimplement): click a wire → `{ type: 'CUT', wireIndex }` where `wireIndex` is that wire's **global** index (compute from panel offsets; the view knows the flattening); click up/down → `{ type: 'NAV', direction }`. All via `dispatchModuleAction`. No keyboard listeners (UX-DR13). **Optimistic pre-flash (`useOptimisticPreFlash`, 4.7) is OPTIONAL** — keypads/whos-on-first shipped without it; only add it if trivial. Do not over-scope.
  - [x] Registration: one import + one `SANDBOX_MODULES` entry in `apps/client/src/modules/index.ts`; one `wire-sequences` entry in `apps/server/src/reducers/MODULE_REDUCERS.ts`. **Zero diff to `bombReducer.ts`.**
- [x] Task 4 — Generator + tier-pool registration (AC: 1) — **shared-registry surface (append after whos-on-first)**
  - [x] Add `wire-sequences` to `MODULE_GENERATORS` (import `generateWireSequences` **directly from its file**, not the barrel — the registry convention) and to `TIER_POOLS`. Per `module-registry-two-registries-and-tier-pools`, a `TIER_POOLS` entry needs **both** a generator AND a reducer registered or `generateLayout` throws at ROUND_START — land the generator, the reducer (Task 3), and the pool entry in the **same commit**.
  - [x] **Tier placement (medium module):** `TIER_POOLS.medium` and `.hard` currently read `['wires','the-button','passwords','keypads','whos-on-first']` (6.1/6.2 diverged them from `easy`). **Append `'wire-sequences'`** to `medium` AND `hard`; leave `easy` untouched (a Medium module must not roll onto an Easy bomb). `TIER_CATALOG` already lists `'wire-sequences'` under `medium` and `hard` (verified `registry.ts:136-137`) → **no `TIER_CATALOG` change needed**. Match the comment/convention the keypads/whos-on-first entries used. Authoritative dashboard tier GATING is still **Story 8.1**'s job.
- [x] Task 5 — Canonical manual content into the 5.2 viewer (AC: 2) — **replace the existing stub**
  - [x] `apps/client/src/manual/devManualFixtures.ts:57` currently has `stub('wire-sequences', 'Wire Sequences')`. **Replace** it with `...getWireSequencesManualPages()` (the exact pattern 5.3/5.4/5.5/6.1/6.2 used). Verify in `/dev/manual` that all three colour tables render through `PageRenderer` and match `CUT_RULES`.
- [x] Task 6 — Sandbox proof of the loop (AC: 1, 3, 4)
  - [x] Wire Sequences appears in the `/dev/sandbox` picker; Generate from a seed renders the current panel's wires + up/down nav + panel indicator; same seed → identical, different seed → different.
  - [x] Using the manual: navigate panels; count each colour's cumulative occurrence across panels; cut the should-cut wires → once all are severed the solve LED turns green. Cut a should-not-cut wire → strike pulse + re-arm, the wrongly-cut wire stays severed (repeat click is a no-op, no re-strike). Reset re-arms with all wires uncut and `currentPanel` back to 0. **No clock needed** — Wire Sequences has no timer dependency, so the sandbox's existing chrome suffices (no `SandboxHarness` change, like 6.2).
- [x] Task 7 — Tests + gates (AC: 5, and all)
  - [x] Shared (jest, `packages/shared/src/modules/wire-sequences/__tests__/`): `generate` determinism (same seed deep-equal twice; two seeds differ; sweep seed 0/1/large); **invariant sweep** for every seed — `isSolved(generate(seed)) === false` (never born-solved, AC1), no colour exceeds 9 occurrences, every panel has 1–3 wires in distinct slots (AC1); the **table-integrity tests from Task 2**; `flattenWires`/`occurrenceOf`/`shouldCut`/`isSolved` units incl. a **cross-panel occurrence case** (a wire's decision depends on same-colour wires on *earlier* panels, not its panel-local index — AC2). Full reducer suite: **happy** (cut every should-cut wire in some order → `'solved'` only on the last one; earlier should-cut cuts stay `'armed'`); **wrong** (cut a should-not-cut wire → `'struck'`, wire severed, not solved); **idempotent** (repeat CUT on an already-cut wire — should-cut *or* should-not-cut — is a no-op, no second strike); **immutability (frozen state input — never skip)**; **guards** (out-of-bounds / `NaN` / non-integer `wireIndex`, unknown action, malformed NAV direction → unchanged); **NAV** (down/up move + clamp at both boundaries; NAV never strikes/solves); **occurrence-across-navigation** (NAV to a later panel, then cut a wire whose correct decision is driven by its cumulative occurrence — AC5); `MODULE_RESET` (all uncut + `currentPanel` 0); solved-inert.
  - [x] One shared test asserting the manual ↔ solver share the constant: `getWireSequencesManualPages()` renders exactly the `CUT_RULES` cells (divergence impossible by construction — assert it anyway).
  - [x] Client (vitest): registry/binding test for `wire-sequences` mirroring `keypadsBinding.test.ts` / `whosOnFirstBinding.test.ts`. Server (jest): extend `moduleRegistration.test.ts` for the `wire-sequences` entry (a should-cut CUT and a should-not-cut CUT through the untouched bomb reducer — the injection rig exists).
  - [x] **Tier-pool / unregistered-id + stub test gotcha (bit 5.4/5.5/6.1/6.2):** registering `wire-sequences` flips it from "no generator yet" to generatable, tripping tests that assumed the interim state. **Grep `'wire-sequences'` across all `__tests__` and fixtures before finalizing** and fix:
    - `packages/shared/src/modules/__tests__/tierGating.test.ts:47` — `'wire-sequences'` is in the **non-generatable** set; move it to the generatable set (as 6.2 did for whos-on-first).
    - `apps/client/src/ui/__tests__/RoundConfigPanel.test.tsx:135-138` — uses **Wire Sequences** as the *disabled (no generator yet)* pool example. After 6.3 it is enabled → **move the disabled-example to `Mazes`** (the last generator-less Medium module) or delete the disabled-assertion if none remains generator-less at the intended tier. Update `RoundConfigPanel.tsx` only if it hard-codes disabled ids (it maps display names — likely no change).
    - `apps/client/src/manual/__tests__/search.test.ts:15,31-33` — defines its **own local** `page('wire-sequences', …)` fixture to test prefix matching; it does not read the real registry, so it should stay green. **Verify** it still passes; only touch it if it breaks.
    - `apps/server/src/handlers/__tests__/manualHandlers.test.ts:75` and `manualHandlers.ts:30` use `'wire-sequences'` merely as an example chapterId string — harmless, no change.
    - Update any pool-shape assertion (e.g. `assembleBomb.test.ts`-style) so `medium`/`hard` now include `wire-sequences` (a **sixth** entry).
  - [x] Gates: **record the current baseline first** on `51d43ca` (`pnpm -r test` — measure shared/server/client suite counts and treat what you measure as the floor; do not copy earlier-era numbers), then `pnpm -r exec tsc --noEmit` → 0 errors (**no `@ts-ignore`**); `pnpm -r test` green, no regressions; `pnpm --filter @bomb-squad/client build` green.
  - [x] Runtime liveness smoke: `vite dev` boots; `/dev/sandbox` serves 200; `wire-sequences` module files resolve in the module graph; build transforms cleanly. Record honestly what was and wasn't run; full visual confirmation folds into Task 8.
- [x] Task 8 — Human verification (AC: 6)
  - [x] **Jay verifies interactively:** in `/dev/sandbox`, generate Wire Sequences from a couple of seeds; navigate all panels with up/down; in `/dev/manual` read the three colour tables; count each colour's cumulative occurrence across panels and cut the wires the table directs → module solves once all should-cut wires are severed; cut a should-not-cut wire → strike + recovery (wire stays severed, no re-strike on re-click); confirm wire colours/letters and the panel indicator are legible at normal zoom. Record his observed results item-by-item in Completion Notes — **story is not done without this** (human-verification AC rule).

## Dev Notes

### Scope decisions (read first)

- **This story = the Wire Sequences module + canonical manual content, proven in the sandbox and `/dev/manual`** — the same envelope as 5.3/5.4/5.5/6.1/6.2. The production `MODULE_INTERACT` server handler / round wiring is Epic 8 territory (already landed for the reducer path; the sandbox's local backend is the sanctioned dev path). Leave the dispatch seam as is.
- **This is the FIRST genuinely stateful module — respect that.** Unlike keypads/whos-on-first (a fixed board judged by a single or ordered press) and unlike wires (a one-cut solve), Wire Sequences has **real progression state**: multiple panels, a navigable view (`currentPanel`), and a solve condition that spans *all* panels (every should-cut wire severed). Two actions (`CUT`, `NAV`), not one. Budget for this — it is why 6.3 is harder than 6.1/6.2.
- **Auto-solve, NO submit/confirm.** The module solves the instant the last should-cut wire is severed (exactly like `wires` solving on the one correct cut — there is no "done" button). Do **not** add a submit action.
- **Occurrence is GLOBAL and view-independent.** A wire's occurrence number counts same-colour wires across *all* panels in reading order, regardless of which panel is currently visible or what has been cut. `NAV` is purely a view concern; it must not affect the cut decision. The AC5 test exists to pin exactly this.
- **The idempotency requirement forces "physical cut" semantics.** A wrong cut records a strike **and leaves the wire severed** (copy `wires` exactly). If a wrong cut left the wire uncut, re-clicking it would strike again → the idempotency AC would fail. Every CUT marks the wire `cut: true`; the strike is an *additional* signal. A should-not-cut severed wire never gates solving, so leaving it cut is harmless.
- **No stored answer (anti-cheat, wires AI1):** the wires (colour + letter) are public (rendered on the module) and `CUT_RULES` is public manual content — nothing is secret. The reducer recomputes `shouldCut`/`isSolved` from public state each CUT; never persist a should-cut list or solution.
- **No timer.** Wire Sequences is colours + letters + navigation only — no live-timer dependency (unlike the-button). No `useFrame`, no `SandboxHarness` clock change (like 6.2).
- **Colorblind floor (convention, not an explicit 6.3 AC).** The wire **colour** is rule-load-bearing (red/blue/black key different rows), so colourblind players must be able to distinguish it — carry over the `wires` redundant-label convention (colour is never the only signal). **Watch the label collision:** the connection letters are already `A/B/C`, so a colour label of `B` (blue) would collide — use a distinct scheme (spell the colour, or `R`/`U`/`K`). Keep it lightweight; do not gold-plate.
- **Solve chime** = Story 10.1 (deferred for all modules so far). Ship the LED-green visual.
- **Out of scope:** the fourth colour set / any variant not in the v1 manual, mazes (6.4, still backlog), Preparation placeholder view (4.6), authoritative round-config tier gating (8.1), voice, non-trivial optimistic pre-flash (4.7 — optional here).

### Copy the templates — do not redesign

- **`wires` (5.3)** is the closest for the **interaction + rendering + reducer contract**: the `CUT` action, `isWiresAction` guard shape, physical-sever semantics (severed stays severed, idempotent no-op, wrong cut → `'struck'` with the wire still cut), the colorblind letter label, the `WiresWire { color, cut }` shape, and the horizontal-wire R3F DefuserView. Wire Sequences = `wires` + panels + navigation + cumulative-occurrence solve.
- **`keypads` (6.1) / `whos-on-first` (6.2)** are the freshest **Medium registry** precedents (the `TIER_POOLS` medium/hard divergence, the direct-from-file generator import, the client IModule binding + import-time `registerModuleRenderer`, the `/dev/manual` fixture swap, the tier-pool/unregistered-id test gotcha). 6.3 appends `'wire-sequences'` right after `'whos-on-first'` in the same spots.
- Settled patterns inherited for free: import-time registration side effect, the single documented type-erasure cast at registry boundaries, `isXxxAction` runtime guards, `.js` extensions on shared relative imports (NodeNext), transient-`'struck'` semantics, **memoized** scoped zustand selectors in DefuserView, tables-shared-by-solver-and-manual.

### The authoritative CUT_RULES table (canonical KTANE v1 — PDF-verified)

Source: `docs/KeepTalkingAndNobodyExplodes-BombDefusalManual-v1.pdf`, **page 14** (0-indexed page 13). This is a clean text-layer extract — no by-eye grid reading (contrast 6.2's eye-icon page). Re-verify:

```
python3.12 -c "import fitz; d=fitz.open('docs/KeepTalkingAndNobodyExplodes-BombDefusalManual-v1.pdf'); print(d[13].get_text())"
```

Each colour lists occurrences 1st→9th and the letter(s) that mean **cut**:

| Occurrence | **Red** | **Blue** | **Black** |
|---|---|---|---|
| 1st | C | B | A, B or C |
| 2nd | B | A or C | A or C |
| 3rd | A | B | B |
| 4th | A or C | A | A or C |
| 5th | B | B | B |
| 6th | A or C | B or C | B or C |
| 7th | A, B or C | C | A or B |
| 8th | A or B | A or C | C |
| 9th | B | A | C |

As the `CUT_RULES` constant (index `[occ-1]`):

```ts
export const CUT_RULES: Record<WireSeqColor, ReadonlyArray<ReadonlyArray<WireSeqLetter>>> = {
  red:   [['C'], ['B'], ['A'], ['A','C'], ['B'], ['A','C'], ['A','B','C'], ['A','B'], ['B']],
  blue:  [['B'], ['A','C'], ['B'], ['A'], ['B'], ['B','C'], ['C'], ['A','C'], ['A']],
  black: [['A','B','C'], ['A','C'], ['B'], ['A','C'], ['B'], ['B','C'], ['A','B'], ['C'], ['C']],
} as const;
```

> The table caps at the **9th** occurrence — that is why generation must guarantee no colour exceeds 9 cumulative occurrences (AC1), and why `shouldCut` guards `occurrence - 1 < 9` defensively. The flavour text ("nine wires") is the origin of the 9-occurrence ceiling.

### Occurrence counting — worked example (put one like this in a test)

Panels (reading order), each `[color:letter]`:
- Panel 0: `red:A`, `blue:B`
- Panel 1: `black:C`, `red:C`, `red:B`
- Panel 2: `blue:A`

Global order → occurrences: `red:A` = 1st red (rule C → **don't cut**); `blue:B` = 1st blue (rule B → **cut**); `black:C` = 1st black (rule A/B/C → **cut**); `red:C` = 2nd red (rule B → **don't cut**); `red:B` = 3rd red (rule A → **don't cut**); `blue:A` = 2nd blue (rule A or C → **cut**). Should-cut set = {`blue:B` (P0), `black:C` (P1), `blue:A` (P2)}. The module solves only once all three are severed — note two of them are on *different panels than the wire that shares their colour*, which is exactly the cross-panel dependency AC5 pins.

### Existing code you build on — read before writing

- `packages/shared/src/modules/wires/{types,reducer,solve,generate,manual}.ts` (5.3) — the CUT action, physical-sever/idempotent/transient-`'struck'` reducer contract, colorblind label, seeded generate, manual-shares-constant. **The single closest mechanical template.**
- `packages/shared/src/modules/keypads/*` (6.1) + `.../whos-on-first/*` (6.2) — the freshest Medium templates (registry divergence, generate-with-reroll-then-throw, structured manual, contract-complete reducer).
- `apps/client/src/modules/wires/DefuserView.tsx` — horizontal-wire R3F rendering + `moduleClickHandlers` cut dispatch + memoized scoped selector (the pattern to copy; the `useOptimisticPreFlash` block is OPTIONAL for 6.3). `apps/client/src/modules/keypads/index.ts` — the IModule binding + `registerModuleRenderer` shape.
- `apps/client/src/modules/interaction.ts` — `moduleClickHandlers`, `isPrimaryActivation`, `CLICK_DRAG_TOLERANCE_PX`. Use as-is for BOTH wire cuts and nav buttons; do **not** fork.
- `packages/shared/src/modules/registry.ts` — `MODULE_GENERATORS` (append after `generateWhosOnFirst`), `MODULE_IDS` (`'wire-sequences'` reserved at :78), `TIER_POOLS` medium/hard (currently `[…,'whos-on-first']` → append `'wire-sequences'`) + `TIER_CATALOG` (medium/hard already list it). `apps/server/src/reducers/MODULE_REDUCERS.ts` — one new entry. `bombReducer.ts` untouched.
- `packages/shared/src/seeding/` — `makeSeededRng(seed)` (mulberry32), the only approved RNG. Non-negative integer seeds.
- `apps/client/src/manual/devManualFixtures.ts:57` — swap the `stub('wire-sequences', …)` for `...getWireSequencesManualPages()` (Task 5).
- `packages/shared/src/types/{module,actions,bomb}.ts` — `IModule`, `ModuleState` (`status: 'armed'|'solved'|'struck'`), `ManualPage/Section/Table`, `MODULE_RESET` forwarding. **No shared-type change expected** beyond the new module's own `types.ts`; justify in Completion Notes if you believe one is needed.

### Previous story intelligence (6.2 — Who's on First, this worktree; 6.1 — Keypads; 5.3 — Wires)

- **Registry precedent (6.1 → 6.2 → 6.3):** each Medium module appended its id to `MODULE_GENERATORS` + `MODULE_REDUCERS` + `TIER_POOLS.medium`/`.hard`. 6.3 does the same, appending after `whos-on-first` — additive, trivial to reconcile. `bombReducer.ts` never changes (open/closed).
- **The stub → canonical swap (Task 5):** 6.2 replaced a `whos-on-first` stub in `devManualFixtures.ts` with canonical pages; 6.3 does the identical swap for the `wire-sequences` stub already present at line 57.
- **The disabled-pool test example moves each story:** 6.2's Completion Notes record that it moved `RoundConfigPanel.test.tsx`'s "disabled / no generator yet" example **from Who's on First → Wire Sequences**. 6.3 enables Wire Sequences, so that example must move again — **to Mazes** (the last generator-less Medium module).
- **tierGating test:** 6.2 added `whos-on-first` to the generatable set; 6.3 moves `wire-sequences` from the non-generatable set to the generatable set (`tierGating.test.ts:47`).
- **Recompute-at-interaction, never store the answer** (wires AI1): keypads/passwords/whos-on-first all recompute from public data; Wire Sequences is the same — `shouldCut`/`isSolved` recomputed from `panels` + `CUT_RULES` each CUT.
- **Memoized scoped selectors** in DefuserView (`useMemo(() => selectX(moduleIndex), [moduleIndex])`) — the 5.3 review patch; every module since followed it.
- **`'struck'` is transient** — return it on a wrong CUT; the bombReducer rolls it into a team strike and re-arms. The severed wire stays severed (physical cut).
- **Data-fidelity crux (easier than 6.2):** the `CUT_RULES` table extracts cleanly from the page-14 text layer — no eye-icon detection needed. The real risk here is the **stateful reducer** (occurrence counting, NAV clamp, all-should-cut solve, physical-cut idempotency), not transcription. Test the reducer hard (Task 7).
- **Honest smoke notes:** record each smoke item individually; the SwiftShader screenshot rig is not committed, so the runtime liveness smoke + Jay's interactive check are the confidence steps.
- **Red→green TDD is the house cadence:** write the shared Wire Sequences suite (incl. table-integrity + the cross-panel occurrence case) first — it fails on the missing module — then implement.

### Project Structure Notes

- New (shared): `packages/shared/src/modules/wire-sequences/{types,generate,solve,reducer,manual,index}.ts` + `__tests__/wire-sequences.test.ts`; barrel line in `packages/shared/src/modules/index.ts`.
- New (client): `apps/client/src/modules/wire-sequences/{index.ts,DefuserView.tsx,ManualPages.tsx,types.ts,generate.ts,solve.ts,reducer.ts}` + `apps/client/src/modules/__tests__/wireSequencesBinding.test.ts`.
- Modified (surgical): `packages/shared/src/modules/{index.ts,registry.ts}` (`MODULE_GENERATORS` + `TIER_POOLS` medium/hard — append after whos-on-first), `packages/shared/src/modules/__tests__/tierGating.test.ts` (move `wire-sequences` to generatable), `apps/server/src/reducers/MODULE_REDUCERS.ts`, `apps/server/src/reducers/__tests__/moduleRegistration.test.ts`, `apps/client/src/modules/index.ts`, `apps/client/src/manual/devManualFixtures.ts` (stub → canonical), `apps/client/src/ui/__tests__/RoundConfigPanel.test.tsx` (disabled-example → Mazes), plus any pool-shape test (`assembleBomb.test.ts`).
- Untouched: `bombReducer.ts` dispatch logic, `interaction.ts`, `dispatch.ts`, client `registry.ts`, `gameStore`/`uiStore`, manual viewer components, `net/`, scenes/camera/chassis, server handlers, shared `events/`, Docker, `SandboxHarness.tsx` (no clock). Naming: id `"wire-sequences"`, `WireSequencesState`/`WireSequencesAction`, kebab-case dir.

### Project Context Rules (from `_agent_docs/project-context.md` — binding)

- `generate(seed, bombCtx)` is the only place randomness is allowed; never `Math.random()`; never mutate `BombContext` (readonly).
- Reducers: pure, zero `socket.io`/`ioredis`/`pg`/`fastify` imports; immutable returns (spread/map); unknown actions fall through unchanged; no `Date.now()`/`setTimeout` in reducers or their tests.
- `MODULE_REDUCERS`/`MODULE_GENERATORS` registration — bomb reducer/assembly never change per-module (open/closed). `getManualPages()` returns structured data, never HTML/untyped JSX.
- **Wire rule tables are per-attribute — never apply the same decision tree across colours** (project-context Module System Gotchas; here: red/blue/black each have distinct 9-row occurrence rules — implement all three, keyed correctly).
- R3F: data-driven geometry from generate output; rendering-only components ("if a component requires a logic test, the logic has leaked"); no per-frame allocations (Wire Sequences is static between snapshots — no `useFrame`).
- Testing: pure logic unit-tested with zero infra; **never skip the frozen-state immutability test**; never mock the reducer; security — untrusted client input, **bounds-check `wireIndex` server-side** (reject `NaN`/non-integer/out-of-range) and validate the `NAV` direction.
- Build: `tsc --noEmit` 0 errors, no `@ts-ignore`, TypeScript only, no new dependencies (stack pinned at three 0.184 / fiber 8.18 / drei 9.122 / React 18.3 — never upgrade).

### References

- [Source: _agent_docs/planning-artifacts/epics.md#Story 6.3: Wire Sequences Module] (ACs verbatim; Epic 6 preamble — FR24/FR25/FR26/FR27, additive plugin, six-case reducer suite) + [FR26: paged panels; cumulative occurrence counting per wire colour; cut-by-letter rules]
- [Source: docs/KeepTalkingAndNobodyExplodes-BombDefusalManual-v1.pdf, page 14] (authoritative Red/Blue/Black occurrence → cut-letter tables; clean text-layer extract) + [memory: ktane-manual-pdf-asset — render with python3.12 + pymupdf]
- [Source: packages/shared/src/modules/wires/* + apps/client/src/modules/wires/DefuserView.tsx] (closest mechanical template: CUT action, physical-sever/idempotent/transient-'struck' reducer, colorblind label, horizontal-wire R3F view)
- [Source: _agent_docs/implementation-artifacts/6-2-whos-on-first-module.md + 6-1-keypads-module.md + packages/shared/src/modules/{keypads,whos-on-first}/*] (freshest Medium registry precedents — TIER_POOLS divergence, reroll-then-throw generate, stub→canonical swap, tier-pool/disabled-example test gotcha)
- [Source: packages/shared/src/modules/registry.ts] (`MODULE_GENERATORS`, `MODULE_IDS` with `'wire-sequences'` reserved :78, `TIER_POOLS` medium/hard `[…,'whos-on-first']`, `TIER_CATALOG` already lists wire-sequences :136-137) + [memory: module-registry-two-registries-and-tier-pools]
- [Source: apps/client/src/modules/interaction.ts] (`moduleClickHandlers` — wire cuts AND nav buttons are single clicks)
- [Source: apps/client/src/manual/devManualFixtures.ts:57] (the `wire-sequences` stub to replace) + [apps/client/src/ui/__tests__/RoundConfigPanel.test.tsx:135, packages/shared/src/modules/__tests__/tierGating.test.ts:47] (the two disabled/non-generatable examples to move)
- [Source: _agent_docs/project-context.md] (full binding rule set; Wire rule tables per-attribute gotcha) + [memory: human-verification-ac-rule]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (gds-dev-story workflow, sprint-6-medium-modules worktree).

### Debug Log References

- CUT_RULES re-verified cell-for-cell against the manual PDF page 14 (0-indexed 13) via `python3.12 -c "import fitz; ..."` — text-layer extract matched the Dev Notes transcription exactly (Red C,B,A,A/C,B,A/C,A/B/C,A/B,B; Blue B,A/C,B,A,B,B/C,C,A/C,A; Black A/B/C,A/C,B,A/C,B,B/C,A/B,C,C).
- Baseline gates recorded before implementation: shared 312 / server 560 (+2 skip) / client 438.

### Completion Notes List

Implemented the Wire Sequences module — the first genuinely stateful Medium module (multi-panel + NAV + cumulative-occurrence auto-solve). Tasks 1–7 complete; Task 8 (Jay's interactive verification) outstanding per the human-verification AC rule.

- **Shared pure logic** (`packages/shared/src/modules/wire-sequences/`): `types.ts` (colours red/blue/black, letters A/B/C, `WireSeqWire`/`WireSeqPanel`/`WireSequencesState`, `CUT`/`NAV`/`MODULE_RESET` actions + `isWireSequencesAction` guard, the PDF-verified `CUT_RULES` constant, `WIRE_SEQ_COLOR_LABELS` = R/U/K to avoid the A/B/C collision); `solve.ts` (`flattenWires` global reading order, `occurrenceOf` cumulative colour-scoped count, `shouldCut` with a defensive >9 guard, `isSolved` = every should-cut wire severed, `maxColorOccurrence`); `generate.ts` (seeded, `ctx`-free like keypads, validate-then-reroll guaranteeing not-born-solved AND ≤9 per colour, throw-loud safety net); `reducer.ts` (CUT/NAV/RESET, physical-sever idempotency, transient `'struck'`, solved-inert, position-agnostic CUT by global index); `manual.ts` (three colour tables + colour-label table rendered from `CUT_RULES`, no spacer column needed).
- **No stored answer** (wires AI1): `shouldCut`/`isSolved` recomputed from public `panels` + `CUT_RULES` each CUT — nothing secret in state.
- **Client dir** (`apps/client/src/modules/wire-sequences/`): re-export `types/generate/solve/reducer` from shared; `DefuserView.tsx` renders ONLY the current panel's wires (colour tint + severed stub, prominent A/B/C letter, R/U/K colour label), up/down nav buttons, and a "Panel N of M" indicator — memoized scoped selector, no `useFrame`, global wireIndex computed from panel offsets, all single-click via `moduleClickHandlers`; `ManualPages.tsx` minimal typed render; `index.ts` IModule binding + import-time `registerModuleRenderer`. Optional optimistic pre-flash NOT added (keypads/whos-on-first shipped without it).
- **Registry (same commit, both twins + pools)**: `MODULE_GENERATORS` + `MODULE_REDUCERS` + `TIER_POOLS.medium`/`.hard` all append `wire-sequences` after `whos-on-first`; `easy` untouched; `TIER_CATALOG` already listed it; `bombReducer.ts` untouched (open/closed). Client `SANDBOX_MODULES` + `/dev/manual` stub → `getWireSequencesManualPages()`.
- **Test gotchas handled**: `tierGating.test.ts` generatable set += `wire-sequences`; `RoundConfigPanel.test.tsx` disabled-example moved Wire Sequences → **Mazes** (now the last generator-less Medium); `server moduleRegistration.test.ts` gained a wire-sequences solve/strike/purity case through the untouched bomb reducer; `search.test.ts` (local fixture) and `manualHandlers.test.ts` (literal example strings) verified still green, untouched.
- **Gates (final)**: `tsc --noEmit` 0 errors across all 4 workspaces (no `@ts-ignore`); `pnpm -r test` green with no regressions — shared **347** (+35), server **561** (+1, +2 skip), client **441** (+3); `@bomb-squad/client build` green.
- **Runtime liveness smoke** (honest, item-by-item): `vite dev` boots (VITE 8.0.16 ready); `/dev/sandbox` serves HTTP 200; `src/modules/wire-sequences/index.ts` + `DefuserView.tsx` resolve in the module graph and transform to JS with no transform errors. Full visual/GL confirmation folds into Task 8 (the SwiftShader screenshot rig is not committed).
- **Task 8 (Jay) — VERIFIED 2026-07-02 ✅**: Jay exercised Wire Sequences interactively in `/dev/sandbox` + `/dev/manual` and confirmed it working — panel navigation, cumulative-occurrence cut → solve, wrong-cut strike + recovery (wire stays severed, no re-strike), and manual-table cross-check all behave as specified; colours/letters/panel indicator legible. AC6 satisfied → story done.

### File List

New (shared):
- `packages/shared/src/modules/wire-sequences/types.ts`
- `packages/shared/src/modules/wire-sequences/generate.ts`
- `packages/shared/src/modules/wire-sequences/solve.ts`
- `packages/shared/src/modules/wire-sequences/reducer.ts`
- `packages/shared/src/modules/wire-sequences/manual.ts`
- `packages/shared/src/modules/wire-sequences/index.ts`
- `packages/shared/src/modules/wire-sequences/__tests__/wire-sequences.test.ts`

New (client):
- `apps/client/src/modules/wire-sequences/types.ts`
- `apps/client/src/modules/wire-sequences/generate.ts`
- `apps/client/src/modules/wire-sequences/solve.ts`
- `apps/client/src/modules/wire-sequences/reducer.ts`
- `apps/client/src/modules/wire-sequences/DefuserView.tsx`
- `apps/client/src/modules/wire-sequences/ManualPages.tsx`
- `apps/client/src/modules/wire-sequences/index.ts`
- `apps/client/src/modules/__tests__/wireSequencesBinding.test.ts`

Modified (shared):
- `packages/shared/src/modules/index.ts` (barrel export)
- `packages/shared/src/modules/registry.ts` (`MODULE_GENERATORS` + `TIER_POOLS` medium/hard)
- `packages/shared/src/modules/__tests__/tierGating.test.ts` (generatable set += wire-sequences)

Modified (server):
- `apps/server/src/reducers/MODULE_REDUCERS.ts` (entry)
- `apps/server/src/reducers/__tests__/moduleRegistration.test.ts` (wire-sequences case)

Modified (client):
- `apps/client/src/modules/index.ts` (barrel import + SANDBOX_MODULES)
- `apps/client/src/manual/devManualFixtures.ts` (stub → canonical)
- `apps/client/src/ui/__tests__/RoundConfigPanel.test.tsx` (disabled-example → Mazes)

## Change Log

- 2026-07-02: Task 8 VERIFIED by Jay in `/dev/sandbox` + `/dev/manual` (confirmed working — nav, cumulative-occurrence solve, wrong-cut strike + recovery, legibility). All 6 ACs satisfied → Status: done.
- 2026-07-02: Dev-story Tasks 1–7 complete (Wire Sequences module + canonical manual, proven in tests + sandbox liveness smoke). Shared logic (types/generate/solve/reducer/manual), client dir (DefuserView with panel nav + indicator, IModule binding), registry (generator + reducer + medium/hard pools), `/dev/manual` stub → canonical, test gotchas fixed (tierGating generatable set, RoundConfigPanel disabled-example → Mazes, server registration case). Gates: tsc 0 ×4; shared 347 / server 561 (+2 skip) / client 441 green; client build green. Task 8 (Jay interactive verify) outstanding → Status: review.
- 2026-07-02: Story created (context engine analysis — comprehensive developer guide; authoritative Red/Blue/Black cut-rule tables transcribed and PDF-verified from manual page 14). Created in the `sprint-6-medium-modules` worktree (baseline 51d43ca, atop done 6.1 Keypads + reviewed 6.2 Who's on First). First genuinely stateful Medium module (multi-panel + NAV + cumulative-occurrence auto-solve). Status: ready-for-dev.
