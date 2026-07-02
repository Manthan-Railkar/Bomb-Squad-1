---
baseline_commit: 59b2d94
---

# Story 7.1: Complicated Wires Module

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a team,
I want to defuse the Complicated Wires module,
So that we solve a per-wire truth-table module whose cut decisions reference the bomb's serial number, ports, and batteries.

## Acceptance Criteria

1. **Seeded generation with a live, non-trivial layout:** **Given** a generated Complicated Wires module, **when** `generate(seed, ctx)` runs, **then** it produces N wires (3–6) each carrying an independent four-attribute combination (red stripe / blue stripe / star / LED) drawn only from the seeded RNG, and — evaluated against the frozen `ctx` — **at least one** wire is a should-cut wire (no born-solved layout). Same seed + ctx → identical layout; different seed → different. No `Math.random()`.
2. **Per-wire truth-table cut decision (the correctness crux):** **Given** each wire's attribute combination, **when** it is looked up in the authoritative 16-row truth table, **then** the resulting code (C/D/S/P/B) is applied — **C** cut, **D** don't cut, **S** cut iff the last serial-number digit is **even**, **P** cut iff the bomb has a **Parallel** port, **B** cut iff the bomb has **≥2 batteries** — all read from the public `ctx` (`serialNumber`, `ports`, `batteryCount`).
3. **Solve / strike / idempotency semantics:** **Given** a should-cut wire, **when** the Defuser cuts it, **then** it is severed and, once **every** should-cut wire is cut, the module solves; **given** a should-not-cut wire, **when** it is cut, **then** a strike is recorded (transient `'struck'`) and the wire stays severed; **given** an already-severed wire, **when** it is cut again, **then** it is a no-op (never a second strike for the same wire).
4. **Colorblind floor (UX-DR14 / NFR11):** **Given** the module visuals, **when** rendered, **then** the red-stripe, blue-stripe, star, and LED attributes each carry pattern/label redundancy (colour is never the only signal) and are legible at normal zoom.
5. **Reducer test suite:** **Given** the reducer test suite, **when** it runs, **then** it covers happy-path, wrong-interaction, idempotency, immutability (frozen input state), guard clauses, and reset across representative truth-table rows.
6. **Full 16-combination truth-table sweep:** **Given** all 16 attribute combinations, **when** each is resolved under varied bomb contexts (serial last digit even/odd, Parallel port present/absent, battery count 0/1/≥2), **then** each combination maps to the correct code and the correct cut decision — the manual and the solver read the exact same table constant.
7. **Human verification:** Jay exercises Complicated Wires interactively in `/dev/sandbox` (generate from a couple of seeds; read the Venn/truth table in `/dev/manual`; cut each should-cut wire → module solves; cut a should-not-cut wire → strike + recovery, wire stays severed; re-cut a severed wire → no-op) and his observed results are recorded in Completion Notes before the story is marked done.

## Tasks / Subtasks

- [x] Task 1 — Shared pure logic: `packages/shared/src/modules/complicated-wires/` (AC: 1, 2, 3)
  - [x] Copy the **wires** directory shape file-for-file: `types.ts`, `generate.ts`, `solve.ts`, `reducer.ts`, `manual.ts`, `index.ts`, `__tests__/`. Barrel-export from `packages/shared/src/modules/index.ts`; confirm it reaches `packages/shared/src/index.ts`. Module id = `'complicated-wires'` (already reserved in `MODULE_IDS`).
  - [x] `types.ts`: `COMPLICATED_WIRES_MODULE_ID = 'complicated-wires'`. `WireAttributes { readonly redStripe: boolean; readonly blueStripe: boolean; readonly star: boolean; readonly led: boolean }`. `ComplicatedWire { readonly attrs: WireAttributes; readonly cut: boolean }`. `ComplicatedWiresState { readonly wires: ReadonlyArray<ComplicatedWire>; readonly ctx: BombContext }` — carry the **public** `BombContext` in state exactly like `WiresState.ctx` (serial/ports/batteries are all bomb-face-visible, NOT secret). `ComplicatedWiresAction = { type: 'CUT'; wireIndex: number }`; `ComplicatedWiresReset = { type: 'MODULE_RESET' }`; `isComplicatedWiresAction(action: unknown)` runtime guard (actions arrive as `unknown`) — mirror `isWiresAction` exactly (accept `MODULE_RESET`, accept `CUT` iff `wireIndex` is a number).
  - [x] **No stored answer (wires AI1 pattern):** do NOT store the cut decision or code. The state carries only the attributes + `cut` flags + the public `ctx`. The reducer recomputes `shouldCut(attrs, ctx)` at cut-time; nothing secret ever crosses to the client (the truth table and the edgework are both public manual/bomb-face content).
  - [x] `solve.ts` — **the correctness crux.** Encode the **16-row GDD truth table ONCE** as a data constant `COMPLICATED_WIRES_TABLE` keyed by the four booleans (see Dev Notes for the verbatim table). Provide `codeForAttributes(attrs): CutCode` (`CutCode = 'C' | 'D' | 'S' | 'P' | 'B'`) and `shouldCut(attrs, ctx): boolean` that applies the code against `ctx`: `C→true`, `D→false`, `S→ serial last digit even`, `P→ ctx.ports.includes('Parallel')`, `B→ ctx.batteryCount >= 2`. Add `serialLastDigitEven(ctx)` (mirror wires' `serialLastDigitOdd` — `ctx.serialNumber` guarantees a trailing digit). All pure; this ONE table is the single source shared by solver + manual (the wires "rule/data shared by solver and manual" property — divergence structurally impossible).
  - [x] `generate.ts`: all randomness via `makeSeededRng(seed)` (never `Math.random()`). Pick `wireCount` 3–6 (uniform, mirror wires), then for each wire roll its four attribute booleans from the seeded stream. **Non-trivial-layout constraint (AC1 — the generation risk):** because `shouldCut` depends on `ctx`, after rolling verify `wires.some((w) => shouldCut(w.attrs, ctx))`; if zero wires are should-cut (a born-solved module), re-roll the attributes deterministically from the same seeded stream until at least one is cuttable. Store `ctx` by reference, never mutate it. Deterministic given `(seed, ctx)`; CPU-cheap (≤6 wires × 16-row lookup).
  - [x] `reducer.ts`: pure `Reducer<ModuleState<ComplicatedWiresState>, unknown>`, modelled on `wiresReducer`. Guard malformed/unknown → unchanged. `MODULE_RESET` → all wires uncut, `status: 'armed'` (attributes/ctx unchanged). Solved-inert (post-solve actions no-op; defense-in-depth, the sandbox runs the reducer standalone). Out-of-bounds/NaN/fractional `wireIndex` → unchanged. Already-cut wire → unchanged (idempotent — no second strike). Otherwise sever the wire (`cut: true`) and set status: if `shouldCut(attrs, ctx)` for the cut wire → the module solves **iff every should-cut wire is now cut** (`status: 'solved'`), else stays `'armed'`; if NOT `shouldCut` → `status: 'struck'` (transient — the bombReducer rolls it into a team strike and re-arms; the wrongly-cut wire stays severed). Never `Date.now()`/`Math.random()`.
  - [x] `manual.ts`: `getComplicatedWiresManualPages(): ManualPage[]` — one `complicated-wires` chapter: a short intro (evaluate each wire independently; look up its attribute combination; apply the code), a **cut-code legend** `ManualTable` (Code → Rule: C/D/S/P/B), and the **16-row truth table** `ManualTable` (columns: Red stripe, Blue stripe, Star, LED, Code) rendered from `COMPLICATED_WIRES_TABLE` — the exact constant the solver reads. Structured data only (no HTML/JSX). Use clear ✓/— (or "Yes"/"No") cell text so the table is unambiguous without colour. See Dev Notes on the Venn-diagram asset (the GDD's authoritative table is fully transcribed here, so logic is unblocked; the *visual* Venn is now available at `docs/…-v1.pdf` p.13 as an optional enhancement).
- [x] Task 2 — Truth-table fidelity (AC: 2, 6)
  - [x] Transcribe the GDD's 16-row table verbatim into `COMPLICATED_WIRES_TABLE` (see Dev Notes — copy it exactly; do not re-derive from memory). Write a test asserting the table has exactly 16 rows covering all `2^4` attribute combinations with no duplicates/gaps, and that every code is one of `C/D/S/P/B`.
  - [x] **Sweep is the correctness crux:** write a test that, for each of the 16 combinations, asserts `codeForAttributes` returns the GDD code AND `shouldCut` returns the correct boolean under a matrix of bomb contexts — serial last digit even vs odd, `ports` with/without `'Parallel'`, `batteryCount` 0/1/2 (AC6). This is where a transcription typo hides; hard-code the expected codes/decisions in the test independently of the constant.
- [x] Task 3 — Client module directory: `apps/client/src/modules/complicated-wires/` (AC: 1, 2, 3, 4)
  - [x] Copy the wires client dir: `index.ts` (IModule binding + import-time `registerModuleRenderer`), `DefuserView.tsx`, `ManualPages.tsx` (minimal typed render of `getComplicatedWiresManualPages()`), re-export `types/generate/solve/reducer` from `@bomb-squad/shared`, `__tests__/`.
  - [x] `DefuserView.tsx` (R3F, rendering only, zero game logic): render each wire row data-driven from `data.wires` (never hardcode the count — map over them), reusing the wires severed-stub + grommet visuals as the base. **Attribute redundancy (AC4):** each wire must show its four attributes with pattern/label redundancy, not colour alone — a legible **RS** (red stripe) / **BS** (blue stripe) label or hatch, a **★** glyph for the star, and an LED that is both tinted AND labelled (e.g. an "LED" pip that is clearly on/off by shape, not just hue). Memoized scoped zustand selector on `moduleIndex` (`useMemo(() => selectX(moduleIndex), [moduleIndex])` — the 5.3 pattern). Reuse `useOptimisticPreFlash` + the live-authoritative `isConfirmed`/`canChange` cut pattern from wires verbatim (per-wire pre-flash on cut).
  - [x] Interaction: each wire cut is a single click via the existing `moduleClickHandlers` from `apps/client/src/modules/interaction.ts` (left-button only, drag-tolerant, stopPropagation — do NOT reimplement). Click a wire → `dispatchModuleAction(moduleIndex, { type: 'CUT', wireIndex })`. No keyboard listeners (UX-DR13). No timer dependency.
  - [x] Registration: one import + one `SANDBOX_MODULES` entry in `apps/client/src/modules/index.ts`; one `complicated-wires` entry in `apps/server/src/reducers/MODULE_REDUCERS.ts`. **Zero diff to `bombReducer.ts`.**
- [x] Task 4 — Generator + reducer + HARD-tier-pool registration (AC: 1) — **the shared-registry invariant, all in one commit**
  - [x] Add `complicated-wires` to `MODULE_GENERATORS` (import `generateComplicatedWires` directly from its file, not the barrel — the registry convention) AND to `MODULE_REDUCERS` (Task 3) AND to the **hard** `TIER_POOLS` entry. Per `module-registry-two-registries-and-tier-pools`, a pool entry needs BOTH a generator AND a reducer registered or `generateLayout` throws at ROUND_START — land generator + reducer + pool entry in the **same commit**.
  - [x] Complicated Wires is a **Hard-tier** module (GDD Difficulty System; `TIER_CATALOG.hard` already lists it). Append `'complicated-wires'` to `TIER_POOLS.hard` only (leave easy/medium untouched). Note: `TIER_CATALOG.hard` is already `[...MODULE_IDS]` and needs no edit; this story makes the id actually *generatable* so 8.1's dashboard chip flips from disabled to selectable for Hard.
- [x] Task 5 — Canonical manual content into the 5.2 viewer (AC: 2, 4)
  - [x] Replace the `stub('complicated-wires', 'Complicated Wires')` line in `apps/client/src/manual/devManualFixtures.ts` with `...getComplicatedWiresManualPages()` (the 5.3/5.4/5.5 pattern). Verify in `/dev/manual` that the cut-code legend + 16-row truth table render through `PageRenderer` and match `COMPLICATED_WIRES_TABLE`.
- [x] Task 6 — Sandbox proof of the loop (AC: 1, 2, 3, 4)
  - [x] Complicated Wires appears in the `/dev/sandbox` picker; Generate from a seed renders the wire rows with visible attributes; same seed → identical, different seed → different.
  - [x] Read the truth table in `/dev/manual`, determine each should-cut wire for the generated layout + sandbox ctx, cut them → solve LED green once all should-cut wires are severed. Cut a should-not-cut wire → strike pulse + re-arm, wire stays severed. Re-cut a severed wire → no-op. Reset restores all wires uncut. **No clock needed** (no timer dependency) — the sandbox chrome suffices.
- [x] Task 7 — Tests + gates (AC: 5, 6, and all)
  - [x] Shared (jest, `packages/shared/src/modules/complicated-wires/__tests__/`): `generate` determinism (same `(seed, ctx)` deep-equal twice; two seeds differ; sweep seed 0/1/large); **non-trivial-layout invariant** (`wires.some(shouldCut)` across many seeds — AC1); truth-table integrity (16 unique combos, valid codes); **16-combo × bomb-context sweep** (AC6 — codes + cut decisions); `codeForAttributes`/`shouldCut`/`serialLastDigitEven` units; full reducer suite: happy (cut all should-cut wires → solved), wrong (cut a should-not-cut wire → struck, wire severed, module not solved), idempotent (re-cut a severed wire → no-op; cutting after solve inert), **immutability (frozen state input — never skip)**, guards (out-of-bounds/NaN `wireIndex`, unknown action), `MODULE_RESET` (all wires uncut, armed).
  - [x] One shared test asserting `getComplicatedWiresManualPages()` renders exactly the 16 rows of `COMPLICATED_WIRES_TABLE` (manual ↔ solver share the constant — assert it anyway).
  - [x] Client (vitest): registry/binding test for `complicated-wires` mirroring `wiresBinding.test.ts`. Server (jest): extend `moduleRegistration.test.ts` with a `complicated-wires` case (solve + strike through the untouched bomb reducer — the injection rig exists; pick a `ctx` where a known combo is should-cut).
  - [x] Gates: record the baseline first (`pnpm -r test` — treat what you measure as the floor), then `pnpm -r exec tsc --noEmit` → 0 errors (no `@ts-ignore`); `pnpm -r test` green, no regressions; `pnpm --filter @bomb-squad/client build` green.
  - [x] Registration-test gotcha: grep `__tests__` for `'complicated-wires'` used as an *unregistered* example id — registering it may trip a pool/unregistered-id assertion; switch any such example to a still-unregistered id (e.g. `'simon-says'`). Also widen any "no-override pool" assertion that enumerates `TIER_POOLS.hard`.
  - [x] Headless/runtime smoke: `vite dev` boots, `/dev/sandbox` serves 200, `complicated-wires` resolves in the module graph, build transforms cleanly. Record honestly what was and wasn't run; full visual confirmation folds into Task 8.
- [x] Task 8 — Human verification (AC: 7)
  - [x] **Jay verifies interactively:** in `/dev/sandbox`, generate Complicated Wires from a couple of seeds, read the truth table in `/dev/manual`, cut each should-cut wire → solve; cut a should-not-cut wire → strike + recovery (wire stays severed); re-cut a severed wire → no-op; confirm the four attributes are legible/distinguishable at normal zoom without relying on colour. Record his observed results item-by-item in Completion Notes — story is not done without this.

## Dev Notes

### Scope decisions (read first)

- **This story = the Complicated Wires module + canonical manual content, proven in the sandbox and `/dev/manual`** — the same envelope as the Epic 5 modules (5.3/5.4/5.5). The production `MODULE_INTERACT` server handler and the difficulty-gated dashboard already exist (Epic 8 is `done` per sprint-status); this story only makes the id *generatable* by landing generator + reducer + a hard-pool entry. Leave `bombReducer.ts` and the dispatch seam untouched (open/closed, ADR-003).
- **The 16-row truth-table transcription is the correctness crux.** The table lives in **one shared constant** (`COMPLICATED_WIRES_TABLE` in `solve.ts`) read by both the solver (`codeForAttributes`/`shouldCut`) and the manual (`getComplicatedWiresManualPages`). Transcribe it verbatim from the GDD (below); the 16-combo sweep test (AC6) hard-codes the expected codes independently so a typo fails loudly. This is the single place a subtle bug hides — treat it like the passwords uniqueness check.
- **BOMB CONTEXT dependency — already fully exposed by the module contract; no contract extension needed.** `generate(seed, ctx)` receives the frozen `BombContext` and the wires module already stores it in state (`WiresState.ctx`) and recomputes at interaction time. Complicated Wires does the **exact same thing**: `ComplicatedWiresState` carries `ctx: BombContext`, and `shouldCut` reads three fields:
  - **S code — serial last-digit parity:** `ctx.serialNumber` (its last character is guaranteed a digit `0–9`, per `types/bomb.ts`). Cut iff **even** (note: the wires S-rule uses *odd*; Complicated Wires' S is *even* per the GDD — do not copy the wires predicate blindly, write `serialLastDigitEven`).
  - **P code — parallel port:** `ctx.ports.includes('Parallel')` (`PortType` union includes `'Parallel'`).
  - **B code — batteries:** `ctx.batteryCount >= 2`.
  These are all public bomb-face edgework, so nothing secret crosses to the client (same as wires). `BombContext` is `readonly` — never mutate it.
- **No stored answer (anti-cheat, wires AI1):** the cut decision/code is never persisted in module data; the reducer recomputes `shouldCut(attrs, ctx)` at cut-time from the public table + public ctx. The old baked-`solutionIndex` was a literal cheat value once bomb state broadcasts (Sprint 2 retro AI1) — do not reintroduce it.
- **Born-solved edge case (the generation risk):** unlike wires (cut exactly one; every table ends in an "Otherwise" so a solution always exists), Complicated Wires can roll a layout where **no** wire should be cut (all `D`, or all `S/P/B` false under this ctx) — which would be solved at birth. `generate` MUST re-roll (deterministically, from the same seeded stream) until `wires.some(shouldCut)` (AC1). Because `generate` has `ctx`, it can compute this. Document the chosen re-roll behaviour in `generate.ts`.
- **Multi-cut solve semantics (differs from wires):** wires cuts exactly one wire; Complicated Wires may require **several** cuts. The module solves when **every** should-cut wire is severed; cutting a should-not-cut wire is a transient strike but the wire still physically severs (and does not block solving). Leaving a should-not-cut wire uncut is fine. Encode this precisely in the reducer and test it.
- **Manual PDF / Venn-diagram asset — now provisioned:** the GDD notes the manual presents Complicated Wires as a **Venn diagram (KTANE manual p.13)**. **UPDATE 2026-07-02 — the KTANE manual v1 PDF is now provisioned at `docs/KeepTalkingAndNobodyExplodes-BombDefusalManual-v1.pdf` (page 13 holds the Venn + the C/D/S/P/B legend; also copied into this worktree's `docs/`).** The rule **DATA** is fully specified in the GDD (the 16-row truth-table expansion below), so all logic, tests, and the structured truth-table manual proceed with zero blockage. Recommendation stands: ship the structured 16-row truth table as the primary manual representation (authoritative, colorblind-safe, renders through the existing `PageRenderer`); the p.13 Venn image is now available as an optional visual enhancement (embed/trace it) rather than a prerequisite. Note the chosen representation in Completion Notes.
- **Colorblind floor (AC4, NFR11/UX-DR14):** Complicated Wires leans on red/blue stripes + LED colour, so pattern/label redundancy is a **gate, not polish** — RS/BS labels or hatching for the stripes, a ★ glyph for the star, an LED that reads on/off by shape+label, not hue alone.
- **Out of scope:** the other Epic 7 modules (7.2 Simon Says, 7.3 Memory, 7.4 Morse Code), the solve chime (Story 10.1 — ship the LED-green visual only), voice, and any dashboard/gating change (Epic 8 owns tier gating and is already done — this story only appends to `TIER_POOLS.hard`).

### Copy the template — do not redesign it

**Wires (5.3) is the proven, closest template** — Complicated Wires *is* Wires plus a per-wire attribute→code truth table that references bomb context. Copy `packages/shared/src/modules/wires/` and `apps/client/src/modules/wires/` file-for-file, then substitute Complicated Wires content:
- Shared: same `types.ts`/`generate.ts`/`solve.ts`/`reducer.ts`/`manual.ts`/`index.ts` shape; keep `ctx`-in-state, the `isXxxAction` guard, seeded-only generation, rule-data-shared-by-solver-and-manual, transient-`'struck'`, `.js` extensions on relative imports (NodeNext).
- Client: same `index.ts` IModule binding + import-time `registerModuleRenderer`, data-driven R3F `DefuserView` with drei `Text` + the memoized scoped selector, the `useOptimisticPreFlash` per-wire cut pattern, `moduleClickHandlers` for the click. Reuse the severed-stub/grommet geometry; add the four attribute affordances.
- Then add **exactly the sanctioned integration lines**: shared barrel export; `MODULE_GENERATORS` + `TIER_POOLS.hard` entries; `MODULE_REDUCERS` entry; client barrel import + `SANDBOX_MODULES` entry; the `/dev/manual` fixture swap; the server `moduleRegistration.test.ts` case. `bombReducer.ts` stays untouched.

### The authoritative 16-row truth table (transcribe verbatim — GDD Module 7)

Cut codes:

| Code | Rule |
|---|---|
| C | Cut the wire |
| D | Do not cut |
| S | Cut if last serial digit is **even** |
| P | Cut if bomb has a **Parallel** port |
| B | Cut if bomb has **two or more batteries** |

Attribute-to-code mapping (Red = red stripe, Blue = blue stripe, Star = ★ below, LED = lit above; ✓ = present, — = absent):

| Red | Blue | Star | LED | Code |
|---|---|---|---|---|
| — | — | — | — | C |
| — | — | — | ✓ | C |
| — | — | ✓ | — | S |
| — | — | ✓ | ✓ | S |
| — | ✓ | — | — | S |
| — | ✓ | — | ✓ | D |
| — | ✓ | ✓ | — | B |
| — | ✓ | ✓ | ✓ | P |
| ✓ | — | — | — | C |
| ✓ | — | — | ✓ | B |
| ✓ | — | ✓ | — | S |
| ✓ | — | ✓ | ✓ | C |
| ✓ | ✓ | — | — | S |
| ✓ | ✓ | — | ✓ | D |
| ✓ | ✓ | ✓ | — | B |
| ✓ | ✓ | ✓ | ✓ | D |

> The GDD notes the paper manual presents this as a Venn diagram (manual p.13); the table above is the full truth-table expansion and is the authoritative implementation source. Store it once in `COMPLICATED_WIRES_TABLE`; the solver evaluates it, the manual renders it.

### Existing code you build on — read before writing

- `packages/shared/src/modules/wires/*` — the shared-side template (types + runtime guard, seeded generate storing `ctx` by reference, pure solve sharing data with the manual, contract-complete reducer, structured manual). Read it in full; Complicated Wires is the same shape with a richer per-wire attribute set and a 16-row lookup instead of per-count rule tables. **Note:** wires' `serialLastDigitOdd` — Complicated Wires needs `serialLastDigitEven` (opposite parity per the GDD S-code); do not copy the predicate blindly.
- `packages/shared/src/types/bomb.ts` — `BombContext { serialNumber; batteryCount; indicators; ports }`; `PortType` includes `'Parallel'`. This is where S/P/B come from — no shared-type change is expected beyond the module's own `types.ts`.
- `apps/client/src/modules/wires/*` — the client-side template (IModule binding, registration side effect, data-driven R3F DefuserView with drei `Text`, memoized selector, `useOptimisticPreFlash` cut pattern, re-export files).
- `apps/client/src/modules/interaction.ts` — `moduleClickHandlers` (each wire cut is exactly this); `isPrimaryActivation`, `CLICK_DRAG_TOLERANCE_PX`. Use as-is; do NOT fork.
- `packages/shared/src/modules/registry.ts` — `MODULE_GENERATORS`, `MODULE_IDS` (`'complicated-wires'` reserved at index 7), `TIER_POOLS` (append to `.hard` only), `TIER_CATALOG.hard` (already `[...MODULE_IDS]` — no edit). `apps/server/src/reducers/MODULE_REDUCERS.ts` — one new entry. `bombReducer.ts` untouched.
- `packages/shared/src/seeding/` — `makeSeededRng(seed)` (mulberry32), the only approved RNG. Non-negative integer seeds.
- `apps/client/src/manual/devManualFixtures.ts` — replace the `stub('complicated-wires', ...)` line (Task 5).
- `apps/server/src/reducers/__tests__/moduleRegistration.test.ts` — add a `complicated-wires` case (it already imports `solveWires`/`generateWires`-style helpers and defines a `CTX`; add analogous imports).
- `packages/shared/src/types/{module,actions}.ts` — `IModule`, `ModuleState`, `ManualPage/Section/Table`, `MODULE_RESET` forwarding. **No shared-type change expected** beyond the new module's own `types.ts`; justify in Completion Notes if you believe one is needed.

### Project Context Rules (from `_agent_docs/project-context.md` — binding)

- `generate(seed, bombCtx)` is the only place randomness is allowed; never `Math.random()`; never mutate `BombContext` (readonly).
- Reducers: pure, zero socket.io/ioredis/pg/fastify imports; immutable returns (spread/map); unknown actions fall through unchanged; no `Date.now()`/`setTimeout` in reducers or their tests.
- `MODULE_REDUCERS`/`MODULE_GENERATORS` registration — bomb reducer/assembly never change per-module (open/closed). `getManualPages()` returns structured data, never HTML/untyped JSX.
- R3F: data-driven geometry from generate output; rendering-only components ("if a component requires a logic test, the logic has leaked"); no per-frame allocations (Complicated Wires is static between snapshots — no `useFrame` beyond the existing pre-flash pattern).
- Testing: pure logic unit-tested with zero infra; **never skip the frozen-state immutability test**; never mock the reducer; security — untrusted client input, bounds-check `wireIndex` server-side.
- Build: `tsc --noEmit` 0 errors, no `@ts-ignore`, TypeScript only, no new dependencies (stack pinned — three 0.184 / fiber 8.18 / drei 9.122 / React 18.3; never upgrade).

### Project Structure Notes

- New (shared): `packages/shared/src/modules/complicated-wires/{types,generate,solve,reducer,manual,index}.ts` + `__tests__/complicated-wires.test.ts`; barrel line in `packages/shared/src/modules/index.ts`.
- New (client): `apps/client/src/modules/complicated-wires/{index.ts,DefuserView.tsx,ManualPages.tsx,types.ts,generate.ts,solve.ts,reducer.ts}` + `apps/client/src/modules/__tests__/complicatedWiresBinding.test.ts`.
- Modified (surgical): `packages/shared/src/modules/{index.ts,registry.ts}` (`MODULE_GENERATORS` + `TIER_POOLS.hard`), `apps/server/src/reducers/MODULE_REDUCERS.ts`, `apps/server/src/reducers/__tests__/moduleRegistration.test.ts`, `apps/client/src/modules/index.ts`, `apps/client/src/manual/devManualFixtures.ts`. (Possibly one existing pool/unregistered-id test — grep first.)
- Untouched: `bombReducer.ts` dispatch logic, `interaction.ts`, `dispatch.ts`, client `registry.ts`, `gameStore`/`uiStore`, manual viewer components, `net/`, scenes/camera/chassis, server handlers, shared `events/`, Docker. Naming: id `"complicated-wires"`, `ComplicatedWiresState`/`ComplicatedWiresAction`, kebab-case dir.

### References

- [Source: _agent_docs/planning-artifacts/epics.md#Story 7.1 (~L1057–1079) + Epic 7 preamble] (ACs verbatim; FR28; NFR11, UX-DR14)
- [Source: _agent_docs/planning-artifacts/gdds/gdd-Ktane-2026-06-09/gdd.md#Module 7: Complicated Wires (~L345–381)] (authoritative 16-row truth table + cut codes; Venn-diagram/manual-p.13 note)
- [Source: _agent_docs/implementation-artifacts/5-3-wires-module-walking-skeleton.md] (the real-module template; ctx-in-state + recompute-no-stored-answer; rule/data-shared-by-solver+manual; transient-struck)
- [Source: _agent_docs/implementation-artifacts/5-5-passwords-module.md] (sibling module-story format; generation-uniqueness-as-crux analog to the born-solved re-roll)
- [Source: packages/shared/src/types/bomb.ts] (`BombContext`: serialNumber/batteryCount/ports — the S/P/B sources; `PortType` includes `'Parallel'`)
- [Source: packages/shared/src/modules/registry.ts] (`MODULE_GENERATORS`, `MODULE_IDS` reserves `'complicated-wires'`, `TIER_POOLS`/`TIER_CATALOG`) + [memory: module-registry-two-registries-and-tier-pools]
- [Source: apps/client/src/modules/interaction.ts] (`moduleClickHandlers` — each wire cut is a single click)
- [Source: _agent_docs/game-architecture.md] (module plugin contract — IModule, open/closed registry)
- [Source: _agent_docs/project-context.md] (full binding rule set)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (gds-dev-story workflow, sprint-7-hard-modules worktree).

### Debug Log References

- Baseline (pre-work, `pnpm -r test`): shared 237 / client 431 / server 558 (+2 skipped integration).
- After story: shared 263 (+26) / client 434 (+3) / server 559 (+1, +2 skipped) — all green, no regressions.
- `pnpm -r exec tsc --noEmit` → 0 errors (no `@ts-ignore`). `pnpm --filter @bomb-squad/client build` → clean (739 modules transformed).
- Runtime smoke: `vite dev` boots; `GET /dev/sandbox` → 200; `complicated-wires` resolves in the module graph (build transform includes it).

### Completion Notes List

Implemented as a file-for-file clone of the Wires (5.3) template with a per-wire 16-row attribute→code truth table. `bombReducer.ts` untouched (open/closed, ADR-003). No shared-type change was needed beyond the module's own `types.ts` — `BombContext` already exposes serial/ports/batteries.

- **Truth table (correctness crux):** the GDD 16-row table is transcribed verbatim ONCE into `COMPLICATED_WIRES_TABLE` in `solve.ts`; both `codeForAttributes`/`shouldCut` (solver) and `getComplicatedWiresManualPages` (manual) read it — divergence is structurally impossible. The AC6 sweep test hard-codes the expected 16 codes INDEPENDENTLY of the constant (a separate `EXPECTED` tuple array) and re-derives the code→decision mapping with a second implementation, so a transcription typo fails loudly. Sweep covers all 16 combos × {serial even/odd} × {Parallel present/absent} × {batteries 0/1/2}.
- **S code parity:** `serialLastDigitEven` (NOT wires' `serialLastDigitOdd`) — the GDD S-code for Complicated Wires is EVEN. Written fresh, not copied.
- **No stored answer (anti-cheat, wires AI1):** state carries only `attrs` + `cut` flags + the public `ctx`; the reducer recomputes `shouldCut(attrs, ctx)` at cut-time. No baked cut decision ever crosses to the client.
- **Born-solved re-roll behaviour chosen (AC1):** `generate` rolls all wires, then re-rolls the ENTIRE wire set from the SAME seeded stream (a `do…while (!wires.some(shouldCut))` loop) until at least one wire is should-cut. Determinism preserved because `(seed, ctx)` fully determines both the stream and the ctx-driven acceptance test. Invariant test sweeps seeds 0–299 across every S/P/B context regime — never born-solved.
- **Multi-cut solve semantics (differs from wires):** cutting any wire physically severs it (cuts are permanent) regardless of correctness. A should-cut wire → solved iff EVERY should-cut wire is now severed, else stays armed; a should-not-cut wire → transient `'struck'` (bomb reducer rolls it into a team strike and re-arms) with the wire still severed and not blocking solving. Leaving a should-not-cut wire uncut is fine.
- **MODULE_RESET semantics:** restores all wires uncut and `status: 'armed'`; attributes + public `ctx` unchanged. Forwarded whole by the bomb reducer (bypasses its solved-inert guard).
- **Colorblind floor (AC4):** each wire renders four explicit LABEL tokens (`RS`/`BS`/`★`/`LED`) that are the authoritative signal — present tokens show the glyph in bright ink, absent show a dim `—`, so presence is legible without perceiving hue. Colour bands (red/blue stripe) and the emissive LED pip are visual flavour layered on top of the labels, never the sole signal.
- **Manual representation / Venn-diagram asset:** shipped the structured 16-row truth table + C/D/S/P/B legend as the PRIMARY authoritative manual (colorblind-safe, renders through the existing `PageRenderer`). The GDD's paper Venn diagram (KTANE manual v1 PDF, `docs/…-v1.pdf` p.13) is now provisioned but used only as an optional visual reference — it was NOT a prerequisite and did not block any logic/tests.
- **Registration invariant:** `MODULE_GENERATORS` + `MODULE_REDUCERS` + `TIER_POOLS.hard` all landed together (per `module-registry-two-registries-and-tier-pools`). `complicated-wires` added to `hard` ONLY (easy/medium untouched); `TIER_CATALOG.hard` already `[...MODULE_IDS]`, no edit. This flips 8.1's dashboard Hard chip from disabled → selectable.
- **Registration-test gotcha:** grep found no test using `'complicated-wires'` as an unregistered example id. `tierGating.test.ts` had a `catalog ∩ generators` assertion that enumerated the generatable set — widened from the Easy trio to include `complicated-wires`. `layout.test.ts` uses `'simon-says'` as its unregistered-id example (still unregistered) — no change needed.

**AC7 (Jay interactive verification): CONFIRMED WORKING (2026-07-02).** Jay exercised Complicated Wires in `/dev/sandbox` + `/dev/manual` using a seed cheat-sheet computed against the sandbox ctx (`DEV_BOMB_CONTEXT`: serial `KTANE5` → odd, 2 batteries, Parallel port present → C/P/B cut, D/S leave). Observed item-by-item:
- Generate from a couple of seeds → wire rows render with visible attributes; same seed → identical layout, different seed → different. ✓
- Read the truth table + cut-code legend in `/dev/manual`; determined the should-cut wires for the generated layout. ✓
- Cut each should-cut wire → module solves (LED green) once all should-cut wires are severed (verified across single-cut, multi-cut, and cut-all layouts). ✓
- Cut a should-not-cut wire → strike + re-arm, the wrongly-cut wire stays severed and does not block solving. ✓
- Re-cut a severed wire → no-op (no second strike). ✓
- Reset → all wires uncut. ✓
- Four attributes (RS / BS / ★ / LED) legible and distinguishable at normal zoom via the label tokens, without relying on colour. ✓

**Manual representation Q&A (Jay, 2026-07-02):** chose the structured 16-row truth table over the GDD paper Venn diagram because (1) they are logically identical — a 4-set Venn has 2^4=16 regions, one code each, so the table is the flattened Venn with no information lost; (2) colorblind floor (AC4/NFR11/UX-DR14) — the Venn conveys set membership via overlapping colour-filled regions (colour-only signal, which the gate forbids), whereas the ✓/— table + letter codes are hue-independent; (3) the manual system is structured-data-only (`ManualTable`, no images/JSX) so a table renders with zero new infrastructure while a Venn would need an image/SVG component; (4) single source of truth — the manual renders the exact `COMPLICATED_WIRES_TABLE` the solver evaluates, so they cannot diverge. The p.13 Venn (now in `docs/…-v1.pdf`) remains an optional future visual enhancement.

### File List

**New (shared):**
- `packages/shared/src/modules/complicated-wires/types.ts`
- `packages/shared/src/modules/complicated-wires/solve.ts`
- `packages/shared/src/modules/complicated-wires/generate.ts`
- `packages/shared/src/modules/complicated-wires/reducer.ts`
- `packages/shared/src/modules/complicated-wires/manual.ts`
- `packages/shared/src/modules/complicated-wires/index.ts`
- `packages/shared/src/modules/complicated-wires/__tests__/complicated-wires.test.ts`

**New (client):**
- `apps/client/src/modules/complicated-wires/types.ts`
- `apps/client/src/modules/complicated-wires/solve.ts`
- `apps/client/src/modules/complicated-wires/generate.ts`
- `apps/client/src/modules/complicated-wires/reducer.ts`
- `apps/client/src/modules/complicated-wires/DefuserView.tsx`
- `apps/client/src/modules/complicated-wires/ManualPages.tsx`
- `apps/client/src/modules/complicated-wires/index.ts`
- `apps/client/src/modules/__tests__/complicatedWiresBinding.test.ts`

**Modified (surgical):**
- `packages/shared/src/modules/index.ts` (barrel export)
- `packages/shared/src/modules/registry.ts` (`MODULE_GENERATORS` + `TIER_POOLS.hard`)
- `packages/shared/src/modules/__tests__/tierGating.test.ts` (widened generatable-subset assertion)
- `apps/server/src/reducers/MODULE_REDUCERS.ts` (reducer entry)
- `apps/server/src/reducers/__tests__/moduleRegistration.test.ts` (complicated-wires solve/strike case)
- `apps/client/src/modules/index.ts` (barrel import + `SANDBOX_MODULES` entry)
- `apps/client/src/manual/devManualFixtures.ts` (stub → canonical `getComplicatedWiresManualPages()`)
- `apps/client/src/manual/PageRenderer.tsx` (last-column header alignment fix — see Change Log 2026-07-02)
- `_agent_docs/implementation-artifacts/sprint-status.yaml` (status tracking)

**Untouched (as required):** `bombReducer.ts`, `interaction.ts`, client `registry.ts`.

## Change Log

- 2026-07-02: Story created (context engine analysis — comprehensive developer guide). Status: ready-for-dev.
- 2026-07-02: dev-story Tasks 1–5, 7 implemented (shared logic + 16-row truth table, client module + R3F view, all registrations, manual swap, full test suites + gates). tsc clean; shared 263 / client 434 / server 559 green; client build clean; vite dev + /dev/sandbox smoke passed. Status → review. Task 6 + Task 8 (Jay interactive verification, AC7) outstanding.
- 2026-07-02: Jay interactive verification CONFIRMED WORKING (AC7) — generate/solve/strike/idempotency/reset + colorblind legibility all observed and recorded in Completion Notes. Task 6 + Task 8 checked. All tasks/subtasks complete; ready for code-review.
- 2026-07-02: Manual table alignment fix (Jay report) — `PageRenderer.tsx` `TableView` forced the LAST column's `<td>` to `text-right` while every `<th>` was `text-left`, so the last column's values hung right of their header (visible on the truth-table `Code` column; a pre-existing shared-viewer bug that also affected Sprint 6.1's keypads table). Fixed by right-aligning the last `<th>` to match its cells. Client tsc clean; client 434 tests green (no PageRenderer test asserted on the alignment class). NOTE: this is a fix in the SHARED manual viewer — it should also land on master / the sprint-6 worktree so 6.1's table renders correctly there too.
