---
baseline_commit: 59b2d94
---

# Story 6.1: Keypads Module

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a team,
I want to defuse the Keypads module,
So that we solve a symbol/spatial-vocabulary module by pressing four glyph buttons in the correct column order.

## Acceptance Criteria

1. **Seeded generation with a unique solution:** **Given** a generated Keypads module, **when** `generate(seed, ctx)` runs, **then** four symbols are placed on the 2×2 grid such that **exactly one** of the six reference columns contains all four — and no other column contains all four (the solution order is unambiguous).
2. **Correct-order press solves; wrong-order strikes:** **Given** the four buttons, **when** they are pressed in the order their symbols appear **top-to-bottom** in the unique column that contains all four, **then** the module solves; a press that is not the next symbol in that order records a strike (progress so far is preserved so the team can continue).
3. **Custom glyphs reinforce a natural description:** **Given** the custom glyphs, **when** rendered in the Defuser view, **then** they visually reinforce the closest natural description so a first-time player can name each symbol under time pressure (GDD "Module design principle"). The glyph set is the authoritative manual p.7 reference (or a Jay-chosen substitute — see Scope decisions).
4. **Reducer test suite:** **Given** the reducer test suite, **when** it runs, **then** it covers happy-path, wrong-interaction, idempotency, immutability (frozen input), guard clauses, and reset.
5. **Human verification:** Jay exercises Keypads interactively in `/dev/sandbox` (read the reference columns in `/dev/manual`, press the four buttons in the correct top-to-bottom column order → solve; press one out of order → strike + recovery) and his observed results are recorded in Completion Notes before the story is marked done.

## Tasks / Subtasks

- [x] Task 1 — Shared pure logic: `packages/shared/src/modules/keypads/` (AC: 1, 2)
  - [x] Copy the **passwords/wires/the-button** directory shape: `types.ts`, `generate.ts`, `solve.ts`, `reducer.ts`, `manual.ts`, `index.ts`, `__tests__/`. Barrel-export from `packages/shared/src/modules/index.ts`; confirm it reaches `packages/shared/src/index.ts`. Module id = `'keypads'` (already reserved in `MODULE_IDS`).
  - [x] `types.ts`: `KEYPADS_MODULE_ID = 'keypads'`; `KEY_COUNT = 4` (the 2×2 grid), `COLUMN_COUNT = 6`, `SYMBOLS_PER_COLUMN = 7`. The canonical **symbol vocabulary** `KEYPAD_SYMBOLS` (the distinct glyph ids, `as const`) and the **six reference columns** `KEYPAD_COLUMNS: ReadonlyArray<ReadonlyArray<SymbolId>>` — `KEYPAD_COLUMNS[c]` is column `c`'s 7 symbol ids in **top-to-bottom order** (index 0 = top; order is load-bearing — it IS the press order). `KeypadsState { keys: ReadonlyArray<SymbolId>; pressed: ReadonlyArray<number> }` — `keys[i]` is the symbol id shown on grid position `i` (0=TL, 1=TR, 2=BL, 3=BR); `pressed` is the ordered list of grid indices pressed correctly so far. `KeypadsAction = { type: 'PRESS'; keyIndex: number }`; `KeypadsReset = { type: 'MODULE_RESET' }`; `isKeypadsAction` runtime guard (actions arrive as `unknown` — validate `keyIndex` is a number).
  - [x] **No stored answer (wires/the-button/passwords AI1 pattern):** do NOT store the solution column or the correct order. The "answer" is derivable from public data — generation guarantees exactly one column contains all four `keys`, and the press order is that column's top-to-bottom ordering. Each PRESS recomputes the expected order from `KEYPAD_COLUMNS` and the placed `keys`; nothing secret rides in state (the column table is public manual content).
  - [x] `generate.ts`: all randomness via `makeSeededRng(seed)` (no `Math.random()`). Algorithm: (1) pick a target column from the six (seeded); (2) choose 4 of its 7 symbols (seeded) — these are the four glyphs; (3) place them onto the four grid positions in a seeded random spatial arrangement (the on-screen 2×2 layout is independent of the solution order). **Solvability constraint (AC1 — the real risk):** after choosing, verify with `countContainingColumns(keys)` (see solve.ts) that **exactly one** of the six columns contains all four symbols; if a different 4-subset happens to be a subset of a second column too, reject and re-choose from the same seeded stream until unique. Deterministic given the seed. CPU-cheap (6 columns × 7 symbols). `ctx` unused (Keypads has no bomb-context rule) — same as `generatePasswords(seed)`.
  - [x] `solve.ts`: `solutionColumn(keys): number` = the index of the unique reference column containing all four key symbols. `solutionOrder(keys): number[]` = the four **grid indices** ordered by where each key's symbol sits top-to-bottom in that column (the correct press sequence). `countContainingColumns(keys): number` = how many of the six columns contain all four symbols (the generation uniqueness check → must be `1`). `isNextCorrect(state): boolean` helper (or inline in reducer) = is the next un-pressed grid index in solution order the one being pressed. All pure; `KEYPAD_COLUMNS` is the single source shared by solver, generator, and manual.
  - [x] `reducer.ts`: pure `Reducer<ModuleState<KeypadsState>, unknown>`. `PRESS` → if `keyIndex` is the next expected index in `solutionOrder(keys)` (i.e. `solutionOrder[pressed.length] === keyIndex`), append it to `pressed`; when `pressed.length === KEY_COUNT` → `status: 'solved'`. A press that is not the next-expected index → `status: 'struck'` (transient — bombReducer rolls it into a team strike and re-arms). **KTANE semantics decision (document it):** on a wrong press, `pressed` is left unchanged so the team keeps their correct progress and retries (mirror passwords' columns-unchanged-on-strike); do NOT reset progress on a strike. Contract obligations (copy from passwords): unknown/malformed action → unchanged (no throw); out-of-bounds/NaN `keyIndex` → unchanged; solved-inert (post-solve presses no-op); `MODULE_RESET` → `pressed` cleared to `[]` (re-arm to the generated start); status armed. Never `Date.now()`/`Math.random()` in the reducer.
  - [x] `manual.ts`: `getKeypadsManualPages(): ManualPage[]` — one `keypads` chapter: short intro ("find the ONE column below that contains all four symbols on your keypad; press the buttons in the order their symbols appear top-to-bottom in that column") + a `ManualTable` of the six columns × seven symbols, rendered from the same `KEYPAD_COLUMNS` constant the solver uses. Structured data only — no HTML/JSX. Symbols render by their id/glyph reference (see the glyph-asset note in Scope decisions).
- [x] Task 2 — Symbol/column data fidelity (AC: 1, 2, 3)
  - [x] Transcribe the authoritative **six reference columns** from the GDD (Module 3: Keypads table — reproduced verbatim in Dev Notes below) into `KEYPAD_COLUMNS`, preserving row order (top-to-bottom) exactly. Source the symbol vocabulary once in `types.ts`; the generator, solver, and manual all read `KEYPAD_COLUMNS`. Write a test asserting `KEYPAD_COLUMNS.length === 6`, every column has exactly 7 symbols, and every symbol used is a member of `KEYPAD_SYMBOLS`.
  - [x] **Uniqueness is the correctness crux:** write tests that sweep many seeds and assert `countContainingColumns(generate(seed).keys) === 1` for every seed (AC1). Symbols recur across columns (e.g. `Q-mirror` in col 1 & 2, `λ-italic` in cols 1/2/3, `☆` in cols 2 & 3, `Ъ` in cols 4 & 5, `¶` in cols 4 & 5, `Ψ` in cols 5 & 6, `б` in cols 4 & 6, `Э-umlaut` in cols 2 & 6, `·· dots` in cols 4 & 5, `ω-macron` in cols 2 & 3), so a 4-subset CAN belong to two columns — this is the property most likely to have a generation bug.
- [x] Task 3 — Client module directory: `apps/client/src/modules/keypads/` (AC: 1, 2, 3)
  - [x] Copy the passwords client dir: `index.ts` (IModule binding + import-time `registerModuleRenderer`), `DefuserView.tsx`, `ManualPages.tsx` (minimal typed render of `getKeypadsManualPages()`), re-export `types/generate/solve/reducer` from `@bomb-squad/shared`, `__tests__/`.
  - [x] `DefuserView.tsx` (R3F, rendering only, zero game logic): a **2×2 grid of four buttons**, each rendering its symbol glyph. Fully data-driven from `data.keys` (map over the four — never hardcode). Show pressed state (e.g. depressed/lit) from `data.pressed`. Memoized scoped zustand selector on `moduleIndex` (the 5.3 review pattern; `selectPasswordsData`/`selectButtonData` are the templates).
  - [x] **Glyph rendering (AC3):** each button shows a custom glyph. The authoritative visuals are the manual PDF p.7 glyph set — **now provisioned at `docs/KeepTalkingAndNobodyExplodes-BombDefusalManual-v1.pdf` (page 7)** (see Scope decisions for the trace-to-asset vs. Unicode-stopgap call). Implement the rendering behind a small glyph lookup keyed by symbol id so the visual asset can be swapped without touching logic; ship with the chosen substitute (the GDD Unicode approximations via drei `Text` + the vendored font, OR a Jay-provided asset set). Do NOT block the logic on the asset — the symbol id is opaque to the reducer/solver.
  - [x] Interaction: each button press is a single click via the existing `moduleClickHandlers` from `apps/client/src/modules/interaction.ts` (left-button only, drag-tolerant, stopPropagation — do NOT reimplement). Press → `{ type: 'PRESS', keyIndex }` via `dispatchModuleAction`. No keyboard listeners (UX-DR13). No timer dependency — Keypads is pure press-in-order (like passwords, unlike the-button).
  - [x] Registration: one import + one `SANDBOX_MODULES` entry in `apps/client/src/modules/index.ts`; one `keypads` entry in `apps/server/src/reducers/MODULE_REDUCERS.ts`. **Zero diff to `bombReducer.ts`.**
- [x] Task 4 — Generator + tier-pool registration (AC: 1) — **the shared-registry surface; medium tier**
  - [x] Add `keypads` to `MODULE_GENERATORS` (import `generateKeypads` directly from its file, not the barrel — the registry convention). Per `module-registry-two-registries-and-tier-pools`, a tier-pool entry needs both a generator AND a reducer registered or `generateLayout` throws at ROUND_START — land all three (generator, reducer, pool) in the same commit.
  - [x] **Keypads is a MEDIUM-tier module** — append `'keypads'` to `TIER_POOLS.medium` (currently `['wires', 'the-button', 'passwords']` → `['wires', 'the-button', 'passwords', 'keypads']`). Leave `easy` unchanged. `hard` is a superset of medium — append `'keypads'` there too (hard currently mirrors the interim easy trio; keep it ⊇ medium). Do NOT touch `TIER_CATALOG` (it already lists `keypads` under medium/hard — that is the design catalog for Story 8.1's dashboard gating, not the runtime pool). The authoritative tier GATING surfaced in the dashboard is still **Story 8.1**'s job; these runtime-pool defaults feed it.
- [x] Task 5 — Canonical manual content into the 5.2 viewer (AC: 2, 3)
  - [x] Replace the `keypads` stub in `apps/client/src/manual/devManualFixtures.ts` with `...getKeypadsManualPages()` (the same pattern 5.3/5.4/5.5 used). Verify in `/dev/manual` that the six-column reference table renders through `PageRenderer` and matches `KEYPAD_COLUMNS`.
- [x] Task 6 — Sandbox proof of the loop (AC: 1, 2, 3)
  - [x] Keypads appears in the `/dev/sandbox` picker; Generate from a seed renders four glyph buttons in a 2×2 grid; same seed → identical, different seed → different.
  - [x] Read the reference columns in `/dev/manual`, find the unique column containing all four glyphs, press the four buttons in that column's top-to-bottom order → solve LED green. Press one out of order → strike pulse + re-arm, correct progress preserved (can keep going). Repeat presses after solve are a no-op; Reset clears progress back to the generated start. **No clock needed** — like passwords, Keypads has no timer dependency, so the sandbox's existing chrome suffices.
- [x] Task 7 — Tests + gates (AC: 4, and all)
  - [x] Shared (jest, `packages/shared/src/modules/keypads/__tests__/`): `generate` determinism (same seed deep-equal twice; two seeds differ; sweep seed 0/1/large); **uniqueness sweep** (`countContainingColumns === 1` across many seeds — AC1); column-table integrity (6 columns, 7 symbols each, all in `KEYPAD_SYMBOLS`); `solutionColumn`/`solutionOrder`/`countContainingColumns` units; full reducer suite: happy (press in correct order → solve), wrong (out-of-order press strikes, `pressed` unchanged), idempotent (repeat press after solve; pressing an already-pressed index), **immutability (frozen state input — never skip)**, guards (out-of-bounds/NaN `keyIndex`, unknown action), `MODULE_RESET` (clears `pressed`), solved-inert.
  - [x] One shared test asserting `getKeypadsManualPages()` renders exactly `KEYPAD_COLUMNS` (manual ↔ solver share the constant — divergence impossible, assert it anyway).
  - [x] Client (vitest): registry/binding test for `keypads` mirroring `passwordsBinding.test.ts`. Server (jest): extend `moduleRegistration.test.ts` for the `keypads` entry (solve + strike through the untouched bomb reducer — the injection rig exists).
  - [x] Gates: record the merged baseline first (`pnpm -r test` — treat what you measure as the floor), then `pnpm -r exec tsc --noEmit` → 0 errors (no `@ts-ignore`); `pnpm -r test` green, no regressions; `pnpm --filter @bomb-squad/client build` green.
  - [x] **Tier-pool / unregistered-id test gotcha:** registering `keypads` may trip tests that hard-code the interim pool or use `'keypads'` as an *unregistered* example id. Grep for `'keypads'` in `__tests__` before finalizing; widen the pool assertion (e.g. `assembleBomb.test.ts`), and if a test uses `'keypads'` as its unregistered example, switch it to a still-unregistered id (e.g. `'complicated-wires'`).
  - [x] Headless/runtime smoke: at minimum run the liveness smoke (`vite dev` boots, `/dev/sandbox` serves 200, `keypads` resolves in the module graph; build transforms cleanly). Record honestly what was and wasn't run; full visual confirmation folds into Task 8.
- [x] Task 8 — Human verification (AC: 5)
  - [x] **Jay verifies interactively:** in `/dev/sandbox`, generate Keypads from a couple of seeds, read the reference columns in `/dev/manual`, identify the unique column, press the four buttons in top-to-bottom order → solve; press one out of order → strike + recovery; confirm the glyphs are legible/describable at normal zoom (AC3). Record his observed results item-by-item in Completion Notes — story is not done without this.

## Dev Notes

### Scope decisions (read first)

- **This story = the Keypads module + canonical manual content, proven in the sandbox and `/dev/manual`** — the same envelope as 5.3/5.4/5.5. The production `MODULE_INTERACT` server handler is Epic 8's (the sandbox's local backend is the sanctioned dev path). Leave the dispatch seam as is.
- **GLYPH ASSET DEPENDENCY (AC3).** Keypads needs a **custom glyph set** (manual p.7). **UPDATE 2026-07-02 — the KTANE manual v1 PDF is now provisioned at `docs/KeepTalkingAndNobodyExplodes-BombDefusalManual-v1.pdf`; the authoritative glyph set is on page 7 (also present in this worktree's `docs/`).** The remaining open call is only *how* to turn that page into renderable assets (trace/export the p.7 glyphs to a font or SVG set vs. ship the GDD Unicode approximations as a stopgap) — a Jay decision, not a blocker. Crucially, all rule **DATA is already specified verbatim in the GDD** (the six-column table below), and the symbol id is *opaque to the reducer/solver/generator* — so the logic, generation, tests, and manual structure can proceed to completion right now. What the asset gates is only the **glyph VISUALS**: the Defuser buttons and the `/dev/manual` table need either (a) the authoritative manual-PDF page-7 glyph set (a font or SVG asset), or (b) a Jay-chosen **substitute glyph set** (the GDD's Unicode approximations rendered via drei `Text` + the vendored font is the obvious stopgap, but note it only partially satisfies "visually reinforce the closest natural description"). **Flag this to Jay before Task 3's glyph rendering and again at Task 8** — the substitute-vs-asset call is his, and AC3 is not fully met until the chosen glyphs are legible/describable. Keep rendering behind a symbol-id → glyph lookup so the asset can be swapped without touching logic.
- **The whole difficulty is generation uniqueness (AC1).** Symbols recur across the six columns (see the recurrence list in Task 2), so a random 4-symbol subset CAN be contained in two columns, which would make the press order ambiguous. The generator MUST verify `countContainingColumns === 1` and re-choose (deterministically, from the seeded stream) until unique — exactly how passwords re-rolls fillers until `countSpellableWords === 1`. Test this hard; it is the one place a subtle bug hides.
- **No stored answer (anti-cheat, wires AI1 / passwords):** the solution column and press order are never stored in state; each PRESS recomputes the expected order from the public `KEYPAD_COLUMNS`. `KeypadsState` carries only `keys` (the four placed symbols) and `pressed` (progress). Nothing secret crosses to the client.
- **No timer, no colour-only cue.** Keypads is pure press-in-order, validated against a public column table — no live-timer dependency (unlike the-button) and no colorblind-floor concern (it's shape/glyph). Don't over-build it.
- **Solve chime** = Story 10.1 (deferred for the Easy modules too). Ship the LED-green visual; note chime as deferred-to-10.1 if you touch `deferred-work.md`.
- **Out of scope:** the other Epic-6 modules (6.2 Who's on First, 6.3 Wire Sequences, 6.4 Mazes), round config/difficulty gating (8.1 owns authoritative tier gating), voice, timer chime (10.1), the-button/passwords (Epic 5, done).

### Copy the template — do not redesign it

Wires (5.3), The Button (5.4) and **Passwords (5.5)** are the proven real-module templates in this repo. **Passwords is the closest analogue** (single discrete interaction set, no timer, public-list validation, re-roll-until-unique generation, transient-struck-with-progress-preserved). Copy the passwords directory shape file-for-file with Keypads content, then add **exactly the sanctioned integration lines**: client barrel import + `SANDBOX_MODULES` entry, `MODULE_REDUCERS` entry, `MODULE_GENERATORS` + `TIER_POOLS` (medium/hard) entries, and the `/dev/manual` fixture swap. Settled patterns inherited for free: import-time registration side effect, the single documented type-erasure cast at registry boundaries, `isXxxAction` runtime guards, `.js` extensions on shared relative imports (NodeNext), transient-`'struck'` semantics, **memoized** scoped zustand selectors in DefuserView, rule/data-shared-by-solver-and-manual.

### The six reference columns (authoritative — transcribed verbatim from the GDD, Module 3: Keypads)

The GDD table (positions are **top-to-bottom**; index 0 = top; this order IS the press order):

| Position | Col 1 | Col 2 | Col 3 | Col 4 | Col 5 | Col 6 |
|---|---|---|---|---|---|---|
| 1 | Q-mirror | Э-umlaut | © | б | Ψ | б |
| 2 | λ-serif | Q-mirror | ω-hook | ¶ | ·· (dots) | Э-umlaut |
| 3 | λ-italic | Э (plain) | ω-macron | Ъ | Ъ | ✶ (4-star) |
| 4 | ħ (barred h) | ω-macron | Ж | H-Ж | C-dot | æ |
| 5 | H-Z crossed | ☆ (star) | Ʒ (rev-3) | Ж | ¶ | Ψ |
| 6 | ψ-tail | λ-italic | λ-italic | ¿-variant | Ӡ-cedilla | Ӣ |
| 7 | )-dot | ¿ | ☆ (star) | ·· (dots) | ★ (solid) | Ω |

> GDD implementation note (verbatim): "symbols are custom glyphs. The table above uses closest Unicode approximations. Authoritative visual reference is the manual PDF, page 7."

Encode these as stable symbol **ids** (the glyph is a rendering concern, not a logic concern). Distinct symbols recur across columns — the correctness crux (see Task 2 recurrence list). One constant, three consumers: the generator picks a target column + 4 symbols; the solver finds the unique containing column and its top-to-bottom order; the manual renders the whole table.

### Existing code you build on — read before writing

- `packages/shared/src/modules/passwords/*` — the closest shared-side template: `types.ts` (id + guard + canonical data constant `as const` + state/action types), `generate.ts` (seeded pick + **re-roll-until-unique** guard — mirror `countSpellableWords===1` with `countContainingColumns===1`), `solve.ts` (pure, sharing the data constant with the manual), `reducer.ts` (contract-complete, transient-`'struck'`, progress-preserved-on-strike, `MODULE_RESET`), `manual.ts` (structured `ManualTable` from the same constant).
- `apps/client/src/modules/passwords/*` — the client-side template (IModule binding, import-time registration side effect, data-driven R3F `DefuserView` with drei `Text` + memoized selector, re-export files, `ManualPages.tsx`).
- `apps/client/src/modules/interaction.ts` — `moduleClickHandlers` (each button press is exactly this), `isPrimaryActivation`, `CLICK_DRAG_TOLERANCE_PX`. Use as-is; do NOT fork.
- `packages/shared/src/modules/registry.ts` — `MODULE_GENERATORS`, `MODULE_IDS` (`'keypads'` reserved at line 65), `TIER_POOLS` (medium currently `['wires','the-button','passwords']` — append `'keypads'`), `TIER_CATALOG` (already lists `keypads` under medium/hard — do NOT edit; it is the 8.1 dashboard catalog, not the runtime pool). `apps/server/src/reducers/MODULE_REDUCERS.ts` — one new entry. `bombReducer.ts` untouched.
- `packages/shared/src/seeding/` — `makeSeededRng(seed)` (mulberry32), the only approved RNG. Non-negative integer seeds.
- `apps/client/src/manual/devManualFixtures.ts` — replace the `keypads` stub (line ~34) with `...getKeypadsManualPages()` (Task 5). Follow the 5.5 `...getXManualPages()` spread.
- `packages/shared/src/types/{module,actions,bomb}.ts` — `IModule`, `ModuleState`, `ManualPage/Section/Table`, `MODULE_RESET` forwarding. **No shared-type change expected** beyond the new module's own `types.ts`; justify in Completion Notes if you believe one is needed.

### Merge / integration surface

Additive edits (append-only maps/arrays, trivial to reconcile):
- `packages/shared/src/modules/index.ts` (barrel) — add the `keypads` export line.
- `packages/shared/src/modules/registry.ts` — `MODULE_GENERATORS` (`+keypads`, direct-from-file import) + `TIER_POOLS` (`medium` and `hard` `+'keypads'`).
- `apps/server/src/reducers/MODULE_REDUCERS.ts` — add the `keypads` entry.
- `apps/client/src/modules/index.ts` — add the import + `SANDBOX_MODULES` entry + export.
- `apps/client/src/manual/devManualFixtures.ts` — replace the `keypads` stub with canonical.
- `apps/server/src/reducers/__tests__/moduleRegistration.test.ts` — add a `keypads` registration case.
- `packages/shared/src/generation/__tests__/assembleBomb.test.ts` (and any other test hard-coding the pool) — widen the medium/hard pool assertion to include `'keypads'`.

### Previous story intelligence (5.5 — Passwords, done)

- **Recompute-at-interaction, never store the answer** (wires AI1): 5.5 carried no secret — SUBMIT recomputed the shown word and checked the public list. Keypads is identical in spirit: recompute the solution order from the public column table each PRESS. Keep it that way (5.3 review flagged stored answers as a transmitted-state cheat).
- **Memoized scoped selectors** in DefuserView (`useMemo(() => selectX(moduleIndex), [moduleIndex])`) — the 5.3 review patch; 5.4/5.5 followed it. Do the same.
- **`'struck'` is transient** — return it on a wrong-order press; the bombReducer rolls it into a team strike and re-arms. Don't reset `pressed` on a strike (the team keeps their correct progress to retry) — mirror passwords' columns-unchanged-on-strike.
- **Re-roll-until-unique is the generation crux** — 5.5's `countSpellableWords === 1` re-roll is the exact pattern for Keypads' `countContainingColumns === 1`. 5.5's review also caught a "born already solved" edge (random start already spelling the word); Keypads has no analogous free-solve risk (the on-screen arrangement never auto-solves — the team must still press in order), but do assert the module is never born with a non-empty `pressed`.
- **Tier-pool / unregistered-id tests:** 5.5 had to widen `assembleBomb.test.ts`'s pool assertion and confirmed the unregistered-id tests used a still-unregistered id (`'simon-says'`). Registering `keypads` may trip the same kind of assertion — grep for `'keypads'` in `__tests__` before finalizing; if a test uses `'keypads'` as its example *unregistered* id, switch it to a still-unregistered id (e.g. `'complicated-wires'`).
- **Honest smoke notes:** record each smoke item individually; the SwiftShader screenshot rig is not in this worktree, so the runtime liveness smoke + Jay's interactive check are the confidence steps (don't claim an unexecuted visual smoke).
- **Red→green TDD is the house cadence:** write the shared Keypads suite first (it fails on the missing module), then implement. Reviews verify gate numbers — record real ones.

### Project Structure Notes

- New (shared): `packages/shared/src/modules/keypads/{types,generate,solve,reducer,manual,index}.ts` + `__tests__/keypads.test.ts`; barrel line in `packages/shared/src/modules/index.ts`.
- New (client): `apps/client/src/modules/keypads/{index.ts,DefuserView.tsx,ManualPages.tsx,types.ts,generate.ts,solve.ts,reducer.ts}` + `apps/client/src/modules/__tests__/keypadsBinding.test.ts`.
- Modified (surgical): `packages/shared/src/modules/{index.ts,registry.ts}`, `apps/server/src/reducers/MODULE_REDUCERS.ts`, `apps/server/src/reducers/__tests__/moduleRegistration.test.ts`, `apps/client/src/modules/index.ts`, `apps/client/src/manual/devManualFixtures.ts`, and any pool-assertion test (`assembleBomb.test.ts`). (No `SandboxHarness.tsx` change — Keypads needs no clock, like passwords.)
- Untouched: `bombReducer.ts` dispatch logic, `interaction.ts`, `dispatch.ts`, client `registry.ts`, `gameStore`/`uiStore`, manual viewer components, `net/`, scenes/camera/chassis, server handlers, shared `events/`, Docker. Naming: id `"keypads"`, `KeypadsState`/`KeypadsAction`, kebab-case dir.

### Project Context Rules (from `_agent_docs/project-context.md` — binding)

- `generate(seed, bombCtx)` is the only place randomness is allowed; never `Math.random()`; never mutate `BombContext` (readonly).
- Reducers: pure, zero socket.io/ioredis/pg/fastify imports; immutable returns (spread/map); unknown actions fall through unchanged; no `Date.now()`/`setTimeout` in reducers or their tests.
- `MODULE_REDUCERS`/`MODULE_GENERATORS` registration — bomb reducer/assembly never change per-module (open/closed). `getManualPages()` returns structured data, never HTML/untyped JSX.
- R3F: data-driven geometry from generate output; rendering-only components ("if a component requires a logic test, the logic has leaked"); no per-frame allocations (Keypads is static between snapshots — likely no `useFrame` at all).
- Testing: pure logic unit-tested with zero infra; **never skip the frozen-state immutability test**; never mock the reducer; security — untrusted client input, bounds-check `keyIndex` server-side.
- Build: `tsc --noEmit` 0 errors, no `@ts-ignore`, TypeScript only, no new dependencies (everything needed is in-repo; stack pinned at three 0.184 / fiber 8.18 / drei 9.122 / React 18.3 — never upgrade). A glyph FONT/SVG asset (if Jay provides the manual-p.7 set) is a static asset, not an npm dependency.

### References

- [Source: _agent_docs/planning-artifacts/epics.md#Story 6.1: Keypads Module (~L963–985) + Epic 6 preamble] (ACs verbatim; FR24)
- [Source: _agent_docs/planning-artifacts/gdds/gdd-Ktane-2026-06-09/gdd.md#Module 3: Keypads (~L226–242) + "Module design principle" (~L647) + Difficulty System / Module pool tables] (authoritative column table; custom-glyph note; medium-tier placement)
- [Source: _agent_docs/game-architecture.md#Pattern 3 — IModule Plugin Contract + per-module file contract (~L217–280)] (open/closed registry; generate/solve/reducer purity; structured manual)
- [Source: _agent_docs/implementation-artifacts/5-5-passwords-module.md] (the closest sibling template: re-roll-until-unique generation, no-stored-answer, transient-struck-with-progress, memoized selector, tier-pool/unregistered-id test gotcha, merge surface)
- [Source: apps/client/src/modules/interaction.ts] (`moduleClickHandlers` — each press is a single click)
- [Source: packages/shared/src/modules/registry.ts] (`MODULE_GENERATORS`, `MODULE_IDS` `'keypads'` reserved, `TIER_POOLS` medium/hard, `TIER_CATALOG` do-not-edit) + [memory: module-registry-two-registries-and-tier-pools]
- [Source: _agent_docs/project-context.md] (full binding rule set)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (gds-dev-story), in the `Ktane-sprint6` worktree (branch `sprint-6-medium-modules`).

### Debug Log References

- Shared-barrel name collision: `COLUMN_COUNT` is already a public shared export (passwords, =5). Renamed the keypads constant to `KEYPAD_COLUMN_COUNT` (=6) to avoid the `export *` ambiguity (tsc TS2308). No other collisions (`KEY_COUNT`, `SYMBOLS_PER_COLUMN` are unique).
- Tier-pool / unregistered-id gotcha (as the story predicted): registering `keypads` broke four tests that used `'keypads'` as an *unregistered/un-implemented* example. Switched each to a still-unregistered id — server `parseRoundConfig.test.ts` + `sessionHandlers.test.ts` → `'complicated-wires'`; client `RoundConfigPanel.test.tsx` disabled-chip example → `"Who's on First"`; shared `tierGating.test.ts` generatable-subset assertion widened to include `'keypads'`.

### Completion Notes List

**Implemented (Tasks 1–7 complete; Task 8 = Jay's interactive verify OUTSTANDING).**

- **Shared pure logic** (`packages/shared/src/modules/keypads/`): built on the passwords template file-for-file. `types.ts` carries the symbol vocabulary (`KEYPAD_SYMBOLS`, 30 distinct ids), the six reference columns (`KEYPAD_COLUMNS`, transcribed verbatim from the GDD Module 3 table, top-to-bottom order = press order), a `KEYPAD_SYMBOL_GLYPHS` id→{glyph,label} lookup (the single AC3 swap point), `KeypadsState { keys, pressed }`, `PRESS`/`MODULE_RESET` actions + `isKeypadsAction` guard. **No stored answer** (wires AI1 / passwords): each PRESS recomputes the expected order from the public column table.
- **`generate.ts`**: seeded (`makeSeededRng`, no `Math.random`) — pick a target column, choose 4 of its 7 symbols (seeded Fisher–Yates), verify `countContainingColumns === 1` (re-pick target+subset from the same stream until unique — the AC1 crux), then a seeded spatial arrangement onto the 2×2 grid. `ctx` unused (no bomb-context rule, like passwords).
- **`solve.ts`**: `solutionColumn` / `solutionOrder` (grid indices ordered by top-to-bottom column position) / `countContainingColumns` / `isNextCorrect` — all pure, reading the single shared `KEYPAD_COLUMNS`.
- **`reducer.ts`**: `PRESS` advances on the next-expected grid index → solved on the 4th; out-of-order press → transient `'struck'` with `pressed` **unchanged** (progress kept, mirrors passwords); an already-pressed index is a no-op (idempotent). Contract-complete: bounds/NaN guard, unknown-action fall-through, solved-inert, `MODULE_RESET` clears `pressed` to `[]`. No `Date.now`/`Math.random`.
- **`manual.ts`**: one `keypads` chapter — a 6-column × 7-row table rendered from the same `KEYPAD_COLUMNS` constant (cells are glyphs via the lookup). Zero `bombReducer.ts` diff.
- **Client dir** (`apps/client/src/modules/keypads/`): re-export files + `DefuserView.tsx` (R3F-only 2×2 glyph grid, memoized scoped selector on `moduleIndex`, single-click `moduleClickHandlers` → `{ type:'PRESS', keyIndex }`, pressed→lit) + `ManualPages.tsx`. Registered via one barrel import + `SANDBOX_MODULES` entry.
- **Registries**: `MODULE_GENERATORS` + `MODULE_REDUCERS` `+keypads`; `TIER_POOLS` medium **and** hard `+'keypads'` (hard ⊇ medium; easy untouched; `TIER_CATALOG` untouched). `/dev/manual` fixture stub swapped for `...getKeypadsManualPages()`.

**AC3 glyph decision (which glyph set shipped):** flagged the substitute-vs-asset call to Jay; he was away, so per the story's documented default I shipped the **GDD Unicode-approximation stopgap**, kept entirely behind the `KEYPAD_SYMBOL_GLYPHS` id→glyph lookup so the authoritative manual-p.7 asset can be swapped in later without touching any logic.

**AC3 follow-up (Jay's first verify, 2026-07-02) — two defects found and fixed:**
1. **Sandbox blanks.** Jay saw blank keycaps (e.g. reversed-question, two-dots). Root cause: the vendored `jetbrains-mono-700.ttf` is missing **15 of the 30** approximation glyphs (verified via `fc-query` — all three stars, several extended Cyrillic/Greek code points). Fix: vendored **DejaVu Sans Bold** (`apps/client/public/fonts/dejavu-sans-bold.ttf` + `DejaVu-LICENSE.txt`, following the existing DSEG7/OFL vendoring precedent — a static asset, not an npm dep) which covers **all 30** glyphs; the keypad `Text` now draws from it via a single `GLYPH_FONT` constant. Still the Unicode *stopgap*, just one that actually renders; the p.7 traced asset remains the path to full fidelity (Jay's call), swappable via the same lookup.
2. **Manual Col 6 misaligned.** Root cause: the shared `PageRenderer` right-aligns the LAST cell of every row (its "action/answer" column — load-bearing for wires/the-button/passwords, must not change). Our symmetric six-column grid tripped it. Fix (keypads-local, viewer untouched): appended a trailing empty spacer column to the manual table so the right-align rule lands on the blank; all six reference columns now sit left-aligned under their headers. Tests updated for the spacer.

**Task 8 — Jay's interactive verification (2026-07-02, OBSERVED):**
- (a) Same-seed determinism — **confirmed** (same seed → identical instance).
- (b) Correct top-to-bottom column order press → **solved** — **confirmed**.
- (c) Out-of-order press → **struck** with correct progress preserved / recovers → **confirmed**.
- (d) AC3 glyphs — after the DejaVu fix, **no blank keycaps**; `/dev/manual` Col 6 **aligned correctly** — **confirmed**.

All five ACs observed on the DejaVu Unicode stopgap. The authoritative manual-p.7 glyph art remains a tracked, contained upgrade (swap the `KEYPAD_SYMBOL_GLYPHS` lookup + font path) — not a blocker for this story. Story stays **review** per Jay pending code review.

**Gates (in the worktree, merged baseline recorded first):**
- Baseline floor: shared 237 (per Sprint-5 record) / server 558 (+2 skipped) / client 431.
- After story: `pnpm -r exec tsc --noEmit` → **0 errors, no @ts-ignore** (all 4 workspaces); `pnpm -r test` → **shared 272 / server 559 (+2 skipped) / client 434 (48 files)** green, no regressions; `pnpm --filter @bomb-squad/client build` → green (pre-existing chunk-size warning only).
- Runtime liveness smoke: `vite dev` boots (ready in ~182ms), `/` and `/dev/sandbox` both serve HTTP 200, keypads transforms into the production module graph (739 modules) and `getModuleRenderer('keypads')` resolves (binding test). The SwiftShader screenshot rig is not in this worktree, so full visual confirmation folds into Task 8 (honest).

**Task 8 (Jay interactive verify) OUTSTANDING** — per the human-verification AC rule the story stays `review` until Jay's observed results are recorded here.

### File List

New (shared — pure logic + tests):
- `packages/shared/src/modules/keypads/types.ts`
- `packages/shared/src/modules/keypads/generate.ts`
- `packages/shared/src/modules/keypads/solve.ts`
- `packages/shared/src/modules/keypads/reducer.ts`
- `packages/shared/src/modules/keypads/manual.ts`
- `packages/shared/src/modules/keypads/index.ts`
- `packages/shared/src/modules/keypads/__tests__/keypads.test.ts`

New (client — assets):
- `apps/client/public/fonts/dejavu-sans-bold.ttf` — broad-coverage glyph font (AC3 stopgap render)
- `apps/client/public/fonts/DejaVu-LICENSE.txt` — its license (Bitstream Vera / public)

New (client — rendering + binding):
- `apps/client/src/modules/keypads/index.ts`
- `apps/client/src/modules/keypads/DefuserView.tsx`
- `apps/client/src/modules/keypads/ManualPages.tsx`
- `apps/client/src/modules/keypads/types.ts`
- `apps/client/src/modules/keypads/generate.ts`
- `apps/client/src/modules/keypads/solve.ts`
- `apps/client/src/modules/keypads/reducer.ts`
- `apps/client/src/modules/__tests__/keypadsBinding.test.ts`

Modified (surgical, additive):
- `packages/shared/src/modules/index.ts` — barrel `+keypads`
- `packages/shared/src/modules/registry.ts` — `MODULE_GENERATORS` `+keypads`, `TIER_POOLS` medium+hard `+'keypads'`
- `apps/server/src/reducers/MODULE_REDUCERS.ts` — `+keypads`
- `apps/server/src/reducers/__tests__/moduleRegistration.test.ts` — `+keypads` registration case
- `apps/client/src/modules/index.ts` — import + `SANDBOX_MODULES` entry
- `apps/client/src/manual/devManualFixtures.ts` — `keypads` stub → canonical `...getKeypadsManualPages()`
- `packages/shared/src/modules/__tests__/tierGating.test.ts` — generatable-subset assertion widened for keypads
- `apps/server/src/session/__tests__/parseRoundConfig.test.ts` — unregistered example → `complicated-wires`
- `apps/server/src/handlers/__tests__/sessionHandlers.test.ts` — unregistered example → `complicated-wires`
- `apps/client/src/ui/__tests__/RoundConfigPanel.test.tsx` — disabled-chip example → Who's on First
- `_agent_docs/implementation-artifacts/sprint-status.yaml` — 6-1 → in-progress → review

## Change Log

- 2026-07-02: Story created (Scrum Master context engine — comprehensive developer guide). Status: ready-for-dev. Flagged the manual-p.7 custom-glyph asset as a Jay decision/prerequisite for AC3 (rule DATA fully specified in the GDD, so logic proceeds; only glyph VISUALS are blocked).
- 2026-07-02: Manual v1 PDF provisioned by Jay at `docs/KeepTalkingAndNobodyExplodes-BombDefusalManual-v1.pdf` (copied into this worktree's `docs/`). AC3 glyph asset now available on page 7; remaining call is trace-to-font/SVG vs. Unicode stopgap (no longer a hard blocker).
- 2026-07-02: AC3 follow-up after Jay's first interactive verify (a/b/c confirmed). Fixed two defects: (1) sandbox blank keycaps — the vendored mono font lacks 15/30 approximation glyphs, so vendored DejaVu Sans Bold (covers all 30) for the keypad `Text`; (2) `/dev/manual` Col 6 misalignment — appended a trailing spacer column so the viewer's right-align-last-column rule (untouched, load-bearing for other modules) lands on a blank. tsc clean; shared 272 / server 559 (+2 skipped) / client 434 green; dev server serves the new font (200). Stays `review` pending Jay's AC3 re-confirmation.
- 2026-07-02: dev-story implementation (Tasks 1–7) COMPLETE → Status `review`. Added the Keypads module (shared pure logic + client render + registries + canonical `/dev/manual` content) on the passwords template. Renamed the module's column-count constant to `KEYPAD_COLUMN_COUNT` (shared-barrel collision with passwords' `COLUMN_COUNT`). Shipped the GDD Unicode-approximation glyph stopgap behind an id→glyph lookup (AC3 pending Jay's legibility confirmation). Fixed four tests that used `keypads` as an unregistered/un-implemented example. Gates: tsc 0 errors (4 workspaces); shared 272 / server 559 (+2 skipped) / client 434 green; client build green; `vite dev` + `/dev/sandbox` liveness 200. Task 8 (Jay interactive verify) OUTSTANDING — stays `review` until observed (human-verification AC rule).
