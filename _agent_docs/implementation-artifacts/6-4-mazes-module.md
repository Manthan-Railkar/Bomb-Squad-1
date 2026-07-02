---
baseline_commit: 51d43ca
depends_on: 6.3 (wire-sequences) — build atop its landed commit so the registry/test appends stack cleanly
---

# Story 6.4: Mazes Module

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a team,
I want to defuse the Mazes module,
So that we solve a spatial-navigation module with invisible walls.

## Acceptance Criteria

1. **Seeded generation selects one of 9 layouts, identified by its two circular markers:** **Given** a generated Mazes module, **when** `generate(seed, ctx)` runs, **then** exactly **one of the 9 canonical maze layouts** is selected (deterministic from the seed) and the instance carries that maze's **two circular marker positions** (the identity the Expert matches), plus a **start** cell (white light) and a **target** cell (red triangle) that are seeded, **distinct**, and reachable within that maze.
2. **Navigation with arrow buttons; walls block and strike; reaching the target solves:** **Given** the Defuser navigates the white light with the four arrow buttons, **when** a move would cross a wall (invisible on the bomb, shown in the manual) **or leave the 6×6 grid**, **then** the move is **rejected** (position unchanged) and a **strike** is recorded (transient `'struck'`); **when** a move is legal, **then** the light advances one cell; **when** the light reaches the red triangle, **then** the module solves.
3. **Walls are invisible on the bomb but present in the manual:** **Given** the Defuser view, **when** the module renders, **then** the 6×6 grid shows the two markers, the white light, and the red triangle **but NOT the walls**; **given** the manual, **when** the Expert reads the Mazes chapter, **then** all 9 maze layouts render **with their walls and markers** so the Expert can match markers and read the path.
4. **Reducer test suite:** **Given** the reducer test suite, **when** it runs, **then** it covers happy-path (a legal move sequence reaches the target → solved), wrong-interaction (a move into a wall/off-grid strikes, position unchanged), idempotency (a blocked move leaves position unchanged; a move on a solved module is inert), immutability (frozen input), guard clauses (unknown/malformed action, invalid direction), and reset (`MODULE_RESET` returns the light to `start`).
5. **Human verification:** Jay exercises Mazes interactively in `/dev/sandbox` (identify the maze from its markers in `/dev/manual`, navigate the white light to the red triangle with the arrow buttons, confirm the module solves; move into a wall → strike + recovery; confirm the walls are NOT drawn on the bomb but ARE in the manual) and his observed results are recorded in Completion Notes before the story is marked done.

## Tasks / Subtasks

- [x] Task 1 — Shared pure logic: `packages/shared/src/modules/mazes/` (AC: 1, 2)
  - [x] Copy the directory shape of a sibling module: `types.ts`, `generate.ts`, `solve.ts`, `reducer.ts`, `manual.ts`, `index.ts`, `__tests__/`. Barrel-export from `packages/shared/src/modules/index.ts`; confirm it reaches `packages/shared/src/index.ts`. Module id = `'mazes'` (**already reserved** in `MODULE_IDS`, `registry.ts:79`; already in `TIER_CATALOG.medium`, `:136`).
  - [x] `types.ts`:
    ```ts
    export const MAZES_MODULE_ID = 'mazes';
    export const GRID_SIZE = 6;                                    // 6×6 cells, coords 0..5
    export type Direction = 'up' | 'down' | 'left' | 'right';
    export interface Cell { readonly x: number; readonly y: number }   // x = col 0..5, y = row 0..5 (origin top-left)
    export interface MazesState {
      readonly mazeId: number;      // 0..8 — indexes MAZE_LAYOUTS (identity = its two markers)
      readonly start: Cell;         // immutable spawn (for MODULE_RESET)
      readonly position: Cell;      // white light (current)
      readonly target: Cell;        // red triangle (goal)
    }
    export type MazesAction = { type: 'MOVE'; direction: Direction };
    export type MazesReset = { type: 'MODULE_RESET' };
    ```
    plus `isMazesAction(action: unknown)` runtime guard (accept `MODULE_RESET`, and `MOVE` with `direction` ∈ `{'up','down','left','right'}`; reject everything else — actions arrive as `unknown`).
  - [x] **The 9 canonical maze layouts** — `MAZE_LAYOUTS: readonly MazeLayout[]` (length 9), where `MazeLayout = { markers: readonly [Cell, Cell]; walls: <blocked-edge set> }`. See **Task 2** for the authoritative source + the recommended encoding. This ONE constant is shared by `solve.ts` (the reducer's move-legality) and `manual.ts` (the Expert render) — they cannot diverge. **Wall representation (recommended):** a canonical, order-independent set of blocked edges between adjacent cells, e.g. a `Set<string>` of keys `edgeKey(a, b)` = the two cell coords sorted then joined (`"x1,y1|x2,y2"`), or a boolean adjacency helper. Only interior walls need storing; the outer boundary is implicit (see reducer). Keep it a plain data structure serialisable in `as const`/frozen form.
  - [x] **No secret path (wires AI1 convention):** do **not** store a solved path or a "next correct move" in state. The maze walls are **public manual content** (the Expert reads them) and the maze identity is public (the markers are drawn on the bomb) — so broadcasting `mazeId` + `position` + `target` reveals nothing the Expert isn't meant to have. The *rule* that walls are invisible on the **bomb** is a **DefuserView rendering choice** (Task 3), not a state secret. Move legality is recomputed each MOVE from `MAZE_LAYOUTS[mazeId]`.
  - [x] `generate.ts`: all randomness via `makeSeededRng(seed)` (**no `Math.random()`**; `ctx` unused — Mazes has no bomb-context rule; signature `generateMazes(seed: number)`). Algorithm: (a) seeded `mazeId` ∈ `0..8`; (b) seeded **distinct** `start` and `target` cells; set `position = start`. Because the 9 canonical mazes are **fully connected** (every cell reachable from every other), any distinct start/target is solvable — but add a **defensive BFS reachability assert** (`isReachable(mazeId, start, target)`), and **throw loud** if it ever fails (never-happens net, à la keypads/passwords). Deterministic; CPU-cheap. (Optional flavour: bias `start`/`target` apart by a minimum Manhattan distance so trivial 1-move instances are rare — nice-to-have, not required.)
  - [x] `solve.ts` (all pure; single source = `MAZE_LAYOUTS`): `neighbor(cell, direction)` → the adjacent `Cell` (may be off-grid). `inBounds(cell)` → `0 ≤ x,y < GRID_SIZE`. `isWall(mazeId, a, b)` → is the edge between adjacent cells `a`,`b` blocked in this maze. `canMove(mazeId, from, direction)` → `inBounds(next) && !isWall(mazeId, from, next)`. `isReachable(mazeId, from, to)` → BFS over legal moves (used by generate's assert and a test). No stored answer — every check reads `MAZE_LAYOUTS`.
  - [x] `reducer.ts`: pure `Reducer<ModuleState<MazesState>, unknown>`. Contract (copy the sibling envelope):
    - `MODULE_RESET` → `position: start`, `status: 'armed'` (bypasses the bomb reducer's solved-inert guard, forwarded whole).
    - solved-inert: any action on `'solved'` (except `MODULE_RESET`) → unchanged.
    - `MOVE` → compute `next = neighbor(position, direction)`. If `!inBounds(next)` **or** `isWall(mazeId, position, next)` → `'struck'`, **position unchanged** (the strike is the only effect; the light does not move — AC2). Else advance: `position = next`; if `next` equals `target` → `'solved'`, else `'armed'`.
    - Guards: malformed/unknown action or invalid `direction` → unchanged (never throw). Untrusted input.
    - **Off-grid = strike (recommended).** The outer boundary is a "line you cannot cross," so a move off the 6×6 grid strikes exactly like an interior wall — this unifies the two into one `canMove` check and matches KTANE. (Alternative: a silent clamp/no-op at the border; **not** recommended — it hides a real mistake and diverges from KTANE. If you deviate, document why and adjust the AC2 test.)
    - Never `Date.now()`/`Math.random()`/I/O.
  - [x] `manual.ts`: `getMazesManualPages(): ManualPage[]` — a `mazes` chapter with the intro ("Find the maze whose two circular markings match the module. Navigate the white light to the red triangle with the arrow buttons. Do NOT cross the lines — they are invisible on the bomb.") plus a rendering of **all 9 mazes with walls + markers**. **This needs a structured maze section, not a text table** — see Task 5 for the additive `ManualSection` extension. `manual.ts` emits maze **data** (dimensions + walls + markers per maze), never markup (project rule: modules author data, the renderer draws).
- [x] Task 2 — The 9-maze data fidelity + integrity tests (AC: 1, 2, 3) — **the correctness crux (a visual-source transcription, like 6.2's eye-icon grid — but 9 mazes, so harder)**
  - [x] **Source:** `docs/KeepTalkingAndNobodyExplodes-BombDefusalManual-v1.pdf`, **page 15** (0-indexed 14). The 9 mazes are a **graphical grid** (no text layer), laid out **3×3** on the page: reading order top-left→right, then next row. Render it:
    ```
    python3.12 -c "import fitz; d=fitz.open('docs/KeepTalkingAndNobodyExplodes-BombDefusalManual-v1.pdf'); d[14].get_pixmap(matrix=fitz.Matrix(3,3)).save('/tmp/mazes_p15.png')"
    ```
  - [x] **Transcribe carefully — and prefer PROGRAMMATIC extraction (the 6.2 lesson).** In 6.2 a by-eye read of a visual grid produced two wrong cells that a *programmatic* detection corrected. Do the same here: the 9 mazes sit on a regular lattice (6×6 dots per maze), and walls are straight line segments **between adjacent dots**. Detect each wall by sampling for ink at the **midpoint between adjacent dot centres** (horizontal neighbours → vertical wall segment; vertical neighbours → horizontal wall segment) after locating the 9 maze bounding boxes and their dot grids. Detect the two **markers** as the circled dots. Emit `MAZE_LAYOUTS` from the detection, then **spot-check a few mazes by eye against the render** and record the method in Completion Notes. A single mis-read wall makes a maze subtly unsolvable-looking or lets an illegal move pass — test hard (below).
  - [x] **Marker positions — by-eye starting reference (VERIFY against the render; the detection/PNG wins on any disagreement).** Coords are `(x=col, y=row)`, origin top-left, 0..5:
    | Maze (reading order) | Marker A | Marker B |
    |---|---|---|
    | 0 (top-left) | (0,1) | (4,2) |
    | 1 (top-mid) | (4,1) | (1,3) |
    | 2 (top-right) | (4,3) | (5,3) |
    | 3 (mid-left) | (0,0) | (0,3) |
    | 4 (center) | (4,2) | (3,5) |
    | 5 (mid-right) | (5,0) | (2,3) |
    | 6 (bottom-left) | (1,0) | (1,5) |
    | 7 (bottom-mid) | (3,0) | (2,3) |
    | 8 (bottom-right) | (3,1) | (0,3) |
    > These were read by eye at low confidence — **treat them as a cross-check target for the programmatic pass, not ground truth.** The markers are the module's identity, so a wrong marker = the Expert matches the wrong maze = every move judged against the wrong walls. Get them right.
  - [x] **Integrity tests** (pin the data so a transcription typo fails loud): `MAZE_LAYOUTS.length === 9`; every maze is **fully connected** (`isReachable` between every pair of cells — the canonical KTANE mazes have no isolated cells; a connectivity failure means a mis-transcribed wall); walls are **symmetric** (`isWall(m,a,b) === isWall(m,b,a)`); each maze's two markers are **distinct** and in-bounds; **all 9 marker-pairs are distinct across mazes** (markers must uniquely identify a maze — assert no two mazes share the same unordered marker pair); a couple of **hand-worked legal/illegal move** cases verified by eye against the render.
- [x] Task 3 — Client module directory: `apps/client/src/modules/mazes/` (AC: 1, 2, 3)
  - [x] Copy the **keypads/whos-on-first** client dir shape: `index.ts` (IModule binding + import-time `registerModuleRenderer`), `DefuserView.tsx`, `ManualPages.tsx` (typed render of `getMazesManualPages()`), re-export `types/generate/solve/reducer` from `@bomb-squad/shared`, `__tests__/`.
  - [x] `DefuserView.tsx` (R3F, rendering only, **zero game logic**): draw the **6×6 grid** of cells; overlay the **two markers** (from `MAZE_LAYOUTS[data.mazeId].markers` — public identity), the **white light** at `data.position`, and the **red triangle** at `data.target`. **Do NOT render walls** (AC3 — invisible on the bomb). Add the **four arrow buttons** (up/down/left/right) around the grid. Fully data-driven; memoized scoped zustand selector on `moduleIndex` (the 5.3 review pattern). No timer → **no `useFrame`**. Body budget: keep geometry within the bay faceplate (~0.7×0.4, shallow z — see the `wires` DefuserView header note).
  - [x] Interaction: each arrow is a **single click** via the existing `moduleClickHandlers` from `apps/client/src/modules/interaction.ts` (do **not** reimplement) → `{ type: 'MOVE', direction }` via `dispatchModuleAction`. No keyboard listeners (UX-DR13, even though this is spatial — clicks only).
  - [x] Registration: one import + one `SANDBOX_MODULES` entry in `apps/client/src/modules/index.ts`; one `mazes` entry in `apps/server/src/reducers/MODULE_REDUCERS.ts`. **Zero diff to `bombReducer.ts`.**
- [x] Task 4 — Generator + tier-pool registration (AC: 1) — **append after `wire-sequences` (6.3)**
  - [x] Add `mazes` to `MODULE_GENERATORS` (import `generateMazes` **directly from its file**, not the barrel) and to `TIER_POOLS`. Per `module-registry-two-registries-and-tier-pools`, a `TIER_POOLS` entry needs **both** a generator AND a reducer or `generateLayout` throws at ROUND_START — land generator + reducer (Task 3) + pool entry in the **same commit**.
  - [x] **Tier placement (medium module, the LAST one):** after 6.3, `TIER_POOLS.medium`/`.hard` read `[…,'whos-on-first','wire-sequences']`. **Append `'mazes'`** to `medium` AND `hard` (→ the full Medium set); leave `easy` untouched. `TIER_CATALOG` already lists `'mazes'` under `medium`/`hard` (`registry.ts:136`) → **no `TIER_CATALOG` change**. **Completes Epic 6's Medium pool** — after this, `TIER_POOLS.medium` equals `TIER_CATALOG.medium`. Match the keypads/whos-on-first/wire-sequences comment convention.
- [x] Task 5 — Manual: additive structured-maze rendering (AC: 3) — **new manual capability; the one architectural extension in this story**
  - [x] The shared manual is text + bordered tables only (`ManualSection` = `heading?`, `content`, `table?`; `PageRenderer` renders those three). A maze is a 2D wall grid — it **cannot** be a text table. **Add an additive, backward-compatible structured field:** `ManualSection.maze?: ManualMaze` (or `mazes?: ManualMaze[]` for the 9-up page), where `ManualMaze = { size: number; markers: readonly Cell[]; walls: <the same edge encoding as MAZE_LAYOUTS> }` (define `ManualMaze`/`Cell` in `packages/shared/src/types/module.ts` next to `ManualTable`). Existing sections omit it → **zero behaviour change** for every current module (assert nothing else moves).
  - [x] Teach **`PageRenderer.tsx`** to render `section.maze`/`section.maze[]` as a small **SVG or CSS grid**: draw the 6×6 cell lattice, the wall segments (from the edge set), the two markers (circles), and — for the manual — this is the **static layout** (no start/target; those are per-instance and live on the bomb, not the manual). Keep it rendering-only, mockup-styled inks (match the existing on-cream palette). Mirror the same render in the per-module `MazesManualPages.tsx` (it reuses `getMazesManualPages()` data). The Expert manual viewer (Story 5.2) and `/dev/manual` both go through `PageRenderer`, so this branch is what makes the walls visible to the Expert.
  - [x] Wire `...getMazesManualPages()` into `apps/client/src/manual/devManualFixtures.ts` — **replace** the existing `stub('mazes', 'Mazes')` at **line 65** (same pattern as 5.3/5.4/5.5/6.1/6.2/6.3). Verify in `/dev/manual` that all 9 mazes render with walls + markers.
  - [x] **Decision flag for Jay (see end):** the recommended path is this additive structured `ManualMaze` + SVG renderer. A lower-effort fallback is a **monospace ASCII/box-drawing** maze via a `ManualSection.preformatted?: boolean` flag rendered in a `<pre className="font-mono">`. The SVG path is cleaner and more legible; the ASCII path is smaller but uglier. Proceed with the SVG path unless Jay prefers otherwise.
- [x] Task 6 — Sandbox proof of the loop (AC: 1, 2, 3)
  - [x] Mazes appears in the `/dev/sandbox` picker; Generate from a seed renders the 6×6 grid with markers + white light + red triangle + arrow buttons (**no walls drawn**); same seed → identical, different seed → different.
  - [x] Using the manual: match the markers to one of the 9 mazes; navigate the light to the triangle → solve LED green. Move into a wall or off the edge → strike pulse + re-arm (light stays put). Reset returns the light to `start`. **No clock needed** (no `SandboxHarness` change, like 6.2/6.3).
- [x] Task 7 — Tests + gates (AC: 4, and all)
  - [x] Shared (jest, `packages/shared/src/modules/mazes/__tests__/`): `generate` determinism (same seed deep-equal twice; two seeds differ; sweep 0/1/large); **invariant sweep** — for every seed: `start`≠`target`, both in-bounds, `isReachable(mazeId, start, target)` true (AC1); the **Task 2 integrity tests** (9 mazes, full connectivity, symmetric walls, distinct + unique marker pairs); `neighbor`/`inBounds`/`isWall`/`canMove`/`isReachable` units incl. a hand-worked legal-move and blocked-move case. Full reducer suite: **happy** (a scripted legal path reaches `target` → the final MOVE flips `'solved'`, intermediate MOVEs stay `'armed'`); **wrong** (MOVE into a wall → `'struck'`, position unchanged; MOVE off-grid → `'struck'`, position unchanged); **idempotency** (a blocked MOVE leaves `position` identical; MOVE on a `'solved'` module is inert); **immutability (frozen state input — never skip)**; **guards** (unknown action, invalid `direction` → unchanged); `MODULE_RESET` (light back to `start`, status armed); solved-inert.
  - [x] One shared test asserting the manual ↔ solver share the data: `getMazesManualPages()` carries the same walls + markers as `MAZE_LAYOUTS` (divergence impossible by construction — assert it anyway).
  - [x] Client (vitest): registry/binding test for `mazes` mirroring `keypadsBinding.test.ts` / `whosOnFirstBinding.test.ts`. **PageRenderer test:** a `section.maze` renders the grid/walls/markers (and a section WITHOUT `maze` is unchanged — the backward-compat assertion). Server (jest): extend `moduleRegistration.test.ts` for the `mazes` entry (a legal MOVE and an into-wall MOVE through the untouched bomb reducer).
  - [x] **Tier-pool / unregistered-id + stub test gotcha (bit every prior module) — and this one clears the LAST Medium generator gap, so extra care:**
    - `packages/shared/src/modules/__tests__/tierGating.test.ts` — the **generatable subset** test at **lines 86-89** currently expects `['keypads','passwords','the-button','whos-on-first','wires']`. It must include **both** `'wire-sequences'` (added by 6.3) **and** `'mazes'` (this story); update the array (sorted) and the `it(...)` description (no longer "6.1 and 6.2"). The `TIER_CATALOG.medium` assertion at :44-52 already lists `mazes` → unchanged.
    - `apps/client/src/manual/devManualFixtures.ts:65` — `stub('mazes','Mazes')` → `...getMazesManualPages()`.
    - `apps/client/src/ui/__tests__/RoundConfigPanel.test.tsx` — 6.3 moved the "disabled (no generator yet)" pool example to **Mazes**. This story **enables Mazes**, so **no Medium module is generator-less anymore** — move the disabled-example to a **Hard-tier** module (e.g. `Simon Says` / `Complicated Wires`, still generator-less) at a Hard difficulty selection, or drop the disabled-assertion if the test's difficulty context can't surface a Hard module. Do not leave it asserting Mazes is disabled.
    - Update any pool-shape assertion (`assembleBomb.test.ts`-style) so `medium`/`hard` include `mazes` (now the full Medium set).
    - **Grep `'mazes'` / `Mazes` across all `__tests__` + fixtures before finalizing** and reconcile anything that assumed Mazes had no generator/manual.
  - [x] Gates: **record the current baseline first** (`pnpm -r test` on the 6.3-landed commit — measure shared/server/client suite counts, treat as the floor), then `pnpm -r exec tsc --noEmit` → 0 errors (**no `@ts-ignore`**); `pnpm -r test` green, no regressions; `pnpm --filter @bomb-squad/client build` green.
  - [x] Runtime liveness smoke: `vite dev` boots; `/dev/sandbox` serves 200; `mazes` files resolve in the module graph; `/dev/manual` renders the 9-maze page; build transforms cleanly. Record honestly what was and wasn't run; full visual confirmation folds into Task 8.
- [x] Task 8 — Human verification (AC: 5)
  - [x] **Jay verifies interactively:** in `/dev/sandbox`, generate Mazes from a couple of seeds; in `/dev/manual` confirm all 9 mazes render with walls + markers; match the on-bomb markers to the right maze; navigate the white light to the red triangle → solves; move into a wall and off the grid edge → strike + recovery (light doesn't move); confirm the bomb view shows markers + light + triangle but **no walls**, and everything is legible at normal zoom. Record his observed results item-by-item in Completion Notes — **story is not done without this** (human-verification AC rule).

## Dev Notes

### Scope decisions (read first)

- **This story = the Mazes module + canonical 9-maze manual content + a small additive manual-render capability, proven in the sandbox and `/dev/manual`** — the same envelope as 5.3/5.4/5.5/6.1/6.2/6.3, plus the one manual-renderer extension mazes force (Task 5). Production round wiring is Epic 8 territory (the reducer path already landed; the sandbox is the sanctioned dev path).
- **Two genuinely new things vs prior modules — budget for them:**
  1. **A 2D navigable board** (6×6 grid + white light + directional MOVE). Wire Sequences (6.3) introduced navigation *between panels*; Mazes introduces navigation *within a spatial grid*. Reducer is small but the R3F grid layout is new.
  2. **The manual can't be a table.** Every prior module fit `ManualTable`; a maze does not. This story adds the first **structured non-table manual section** (`ManualSection.maze`) + the `PageRenderer` branch to draw it. Keep it additive and backward-compatible (Task 5).
- **Walls are a DefuserView rendering rule, not a state secret.** Broadcasting `mazeId`/`position`/`target` is safe — the markers (identity) are drawn on the bomb and the walls are public manual content the Expert holds. The Defuser view simply **chooses not to draw the walls** (AC3). This mirrors `wires` (public `ctx` in state) — no precomputed answer is stored (no path, no next-move).
- **Off-grid moves strike (recommended).** The border is a line you can't cross → a move off the 6×6 grid strikes exactly like an interior wall (one `canMove` check). Faithful to KTANE and simplest. The alternative (silent border clamp) hides mistakes — avoid unless Jay asks.
- **Start/target are per-instance and NOT part of maze identity.** The maze's identity is its walls + two markers (fixed per the 9 designs). `start` (white light) and `target` (red triangle) are seeded per instance. Store `start` separately from `position` so `MODULE_RESET` can restore the spawn.
- **The 9 mazes are fully connected** (canonical KTANE) → any distinct start/target is solvable; the BFS assert in `generate` is a never-happens safety net, not a re-roll driver.
- **No timer, no colour rules.** Mazes is pure spatial navigation — no live-timer dependency (no `useFrame`, no `SandboxHarness` clock change), no colourblind-floor concern (markers are shapes/positions, not colour-coded rules; the white light and red triangle are shape+position distinct).
- **Solve chime** = Story 10.1 (deferred for all modules). Ship the LED-green visual.
- **Out of scope:** any maze not in the v1 manual's 9, Preparation placeholder view (4.6), authoritative round-config tier gating (8.1), voice, optimistic pre-flash (4.7 — a MOVE is a discrete step; pre-flash is optional and probably not worth it).

### Copy the templates — do not redesign

- **`wires` (5.3)** for the reducer envelope (physical action → `'struck'`/`'solved'`, guards, `MODULE_RESET`, transient-strike, no-stored-answer recompute-at-interaction) and the R3F DefuserView budget/pattern (memoized selector, `moduleClickHandlers`, drei `Text`).
- **`keypads` (6.1) / `whos-on-first` (6.2) / `wire-sequences` (6.3)** for the Medium registry pattern (direct-from-file generator import, `TIER_POOLS` medium/hard append, client IModule binding + import-time `registerModuleRenderer`, `/dev/manual` stub→canonical swap, the tier-pool/unregistered-id test gotcha).
- **The manual extension (Task 5) has no prior template** — it is new. Keep it minimal: one optional `ManualSection` field + one `PageRenderer` branch + one per-module component branch, all additive.
- Settled patterns inherited for free: import-time registration side effect, the single documented type-erasure cast at registry boundaries, `isXxxAction` runtime guards, `.js` extensions on shared relative imports (NodeNext), transient-`'struck'` semantics, **memoized** scoped zustand selectors in DefuserView, data-shared-by-solver-and-manual.

### The 9-maze data — provenance & method

- The 9 mazes are the **canonical KTANE v1** layouts on manual **page 15** (see the render in Task 2). They are graphical — **no text layer** — so, exactly like 6.2's eye-icon grid, **prefer programmatic extraction over by-eye transcription** (6.2 proved by-eye reads of a visual grid are error-prone; a script corrected two cells). The lattice is regular, so wall detection = sampling ink at midpoints between adjacent dots. Emit `MAZE_LAYOUTS`, spot-check against the render, and pin it with the connectivity + uniqueness integrity tests (Task 2). Record the extraction method in Completion Notes.
- The by-eye marker table in Task 2 is a **verification target, not ground truth** — markers are the identity, so wrong markers silently judge moves against the wrong maze.

### Existing code you build on — read before writing

- `packages/shared/src/modules/wires/{types,reducer,solve,generate}.ts` (5.3) — the closest reducer/guard/no-stored-answer template.
- `packages/shared/src/modules/{keypads,whos-on-first,wire-sequences}/*` — the Medium registry precedents (reroll/assert-then-throw generate, contract-complete reducer, registry appends).
- `apps/client/src/modules/{wires,keypads}/DefuserView.tsx` — R3F rendering-only, memoized scoped selector, `moduleClickHandlers` dispatch. `apps/client/src/modules/keypads/index.ts` — the IModule binding + `registerModuleRenderer` shape.
- `apps/client/src/manual/PageRenderer.tsx` — the shared structured-data renderer (heading/`content`/`table`). **Task 5 adds a `maze` branch here.** `apps/client/src/manual/ManualViewer.tsx` + `devManualFixtures.ts:65` (the `mazes` stub to replace).
- `apps/client/src/modules/keypads/ManualPages.tsx` — the per-module manual component pattern (mirror the maze render here too).
- `packages/shared/src/types/module.ts` — `ManualPage/Section/Table`, `ModuleState`, `IModule`. **Task 5 adds `ManualMaze`/`Cell` + `ManualSection.maze?` here** (additive, next to `ManualTable`).
- `apps/client/src/modules/interaction.ts` — `moduleClickHandlers` (arrow buttons are single clicks). `packages/shared/src/seeding/` — `makeSeededRng(seed)` (mulberry32; non-negative integer seeds).
- `packages/shared/src/modules/registry.ts` — `MODULE_GENERATORS` (append after `generateWireSequences`), `MODULE_IDS` (`'mazes'` reserved :79), `TIER_POOLS` medium/hard (append `'mazes'`), `TIER_CATALOG` (already lists mazes :136). `apps/server/src/reducers/MODULE_REDUCERS.ts` — one new entry. `bombReducer.ts` untouched.

### Dependency & baseline

- **Build atop 6.3 (wire-sequences).** 6.4 is the LAST Medium module; its registry appends and its `tierGating` generatable-set update assume `wire-sequences` is already present. Dev this story **after 6.3 lands** so the appends stack (`[…,'whos-on-first','wire-sequences','mazes']`) and the generatable-set test includes both new ids. If for some reason 6.3 is not yet landed, append after `whos-on-first` and reconcile with 6.3 at merge — but the intended order is 6.3 → 6.4.
- Baseline recorded as `51d43ca` (worktree HEAD at story creation = done 6.1 + reviewed 6.2); the real dev baseline is the 6.3 commit.

### Previous story intelligence (6.3 — Wire Sequences; 6.2 — Who's on First; 5.3 — Wires)

- **Registry precedent (6.1→6.2→6.3→6.4):** each Medium module appended its id to `MODULE_GENERATORS` + `MODULE_REDUCERS` + `TIER_POOLS.medium`/`.hard` and moved the `tierGating` generatable-set + `RoundConfigPanel` disabled-example + `devManualFixtures` stub. 6.4 does the same and **closes the Medium tier** (pool == catalog).
- **The disabled-pool example has walked once per story:** whos-on-first (6.2) → Wire Sequences (6.3) → Mazes (in 6.3's change). Since 6.4 enables the last Medium module, the example must jump **tiers** to a Hard module — there is no Medium fallback left. Don't leave it on Mazes.
- **Visual-source transcription is a known trap (6.2):** a by-eye read of the eye-icon grid was wrong in two cells; programmatic detection fixed it. Mazes has 9 visual grids — apply the same programmatic discipline (Task 2).
- **Recompute-at-interaction, never store the answer** (wires AI1): every module recomputes from public data; Mazes recomputes move legality from `MAZE_LAYOUTS` — no stored path.
- **Memoized scoped selectors** in DefuserView; **`'struck'` is transient** (bomb reducer rolls it into a team strike + re-arm); **frozen-state immutability test never skipped**; **bounds/validity-guard untrusted input** — all carried forward.
- **Honest smoke notes:** record each smoke item individually; the SwiftShader screenshot rig is not committed, so the runtime liveness smoke + Jay's interactive check are the confidence steps.
- **Red→green TDD is the house cadence:** write the shared Mazes suite (incl. the 9-maze integrity tests + reducer suite) and the `PageRenderer` maze-render test first — they fail on the missing module/branch — then implement.

### Project Structure Notes

- New (shared): `packages/shared/src/modules/mazes/{types,generate,solve,reducer,manual,index}.ts` + `__tests__/mazes.test.ts`; barrel line in `packages/shared/src/modules/index.ts`.
- New (client): `apps/client/src/modules/mazes/{index.ts,DefuserView.tsx,ManualPages.tsx,types.ts,generate.ts,solve.ts,reducer.ts}` + `apps/client/src/modules/__tests__/mazesBinding.test.ts`; a `PageRenderer` maze-render test under `apps/client/src/manual/__tests__/`.
- Modified (surgical): `packages/shared/src/types/module.ts` (**additive** `ManualMaze`/`Cell` + `ManualSection.maze?`), `packages/shared/src/modules/{index.ts,registry.ts}` (`MODULE_GENERATORS` + `TIER_POOLS` medium/hard — append after wire-sequences), `packages/shared/src/modules/__tests__/tierGating.test.ts` (generatable set +wire-sequences +mazes, description), `apps/server/src/reducers/MODULE_REDUCERS.ts`, `apps/server/src/reducers/__tests__/moduleRegistration.test.ts`, `apps/client/src/manual/PageRenderer.tsx` (**additive** maze branch), `apps/client/src/modules/index.ts`, `apps/client/src/manual/devManualFixtures.ts` (stub → canonical, line 65), `apps/client/src/ui/__tests__/RoundConfigPanel.test.tsx` (disabled-example → a Hard module), plus any pool-shape test.
- Untouched: `bombReducer.ts` dispatch logic, `interaction.ts`, `dispatch.ts`, client `registry.ts`, `gameStore`/`uiStore`, `ManualViewer` chrome (only `PageRenderer` gains a branch), `net/`, scenes/camera/chassis, server handlers, shared `events/`, Docker, `SandboxHarness.tsx`. Naming: id `"mazes"`, `MazesState`/`MazesAction`, kebab-case dir.

### Project Context Rules (from `_agent_docs/project-context.md` — binding)

- `generate(seed, bombCtx)` is the only place randomness is allowed; never `Math.random()`; never mutate `BombContext` (readonly).
- Reducers: pure, zero `socket.io`/`ioredis`/`pg`/`fastify` imports; immutable returns (spread/map); unknown actions fall through unchanged; no `Date.now()`/`setTimeout` in reducers or their tests.
- `MODULE_REDUCERS`/`MODULE_GENERATORS` registration — bomb reducer/assembly never change per-module (open/closed). `getManualPages()` returns **structured data, never HTML/untyped JSX** — the new `ManualSection.maze` field keeps this contract (data in, `PageRenderer` draws).
- R3F: data-driven geometry from generate output; rendering-only components ("if a component requires a logic test, the logic has leaked"); no per-frame allocations (Mazes is static between snapshots — no `useFrame`).
- Testing: pure logic unit-tested with zero infra; **never skip the frozen-state immutability test**; never mock the reducer; security — untrusted client input, **validate `direction` and bounds server-side**.
- Build: `tsc --noEmit` 0 errors, no `@ts-ignore`, TypeScript only, no new dependencies (stack pinned at three 0.184 / fiber 8.18 / drei 9.122 / React 18.3 — never upgrade; render the maze with SVG/CSS/Three primitives already in-stack, not a new lib).

### References

- [Source: _agent_docs/planning-artifacts/epics.md#Story 6.4: Mazes Module] (ACs verbatim; Epic 6 preamble — additive plugin, six-case reducer suite) + [FR27: Epic 6 — Module: Mazes]
- [Source: _agent_docs/planning-artifacts/gdds/gdd-Ktane-2026-06-09/gdd.md#Module 11: Mazes, lines 470-474] ("9 maze layouts are purely visual; authoritative reference: manual p.15; each maze identified by its two circular markers")
- [Source: docs/KeepTalkingAndNobodyExplodes-BombDefusalManual-v1.pdf, page 15] (the 9 canonical maze layouts + markers — graphical, extract programmatically) + [memory: ktane-manual-pdf-asset — render with python3.12 + pymupdf]
- [Source: packages/shared/src/modules/wires/* + apps/client/src/modules/wires/DefuserView.tsx] (closest reducer/guard/no-stored-answer + R3F view template)
- [Source: _agent_docs/implementation-artifacts/{6-3-wire-sequences-module,6-2-whos-on-first-module,6-1-keypads-module}.md] (Medium registry precedents; the visual-source transcription lesson; the disabled-example/tier-pool test gotcha)
- [Source: apps/client/src/manual/PageRenderer.tsx + packages/shared/src/types/module.ts] (the structured-manual renderer + types the additive `ManualSection.maze` extends)
- [Source: packages/shared/src/modules/registry.ts] (`MODULE_GENERATORS`, `MODULE_IDS` with `'mazes'` reserved :79, `TIER_POOLS` medium/hard, `TIER_CATALOG` already lists mazes :136) + [memory: module-registry-two-registries-and-tier-pools]
- [Source: packages/shared/src/modules/__tests__/tierGating.test.ts:86-89] (generatable-subset test to update) + [apps/client/src/manual/devManualFixtures.ts:65] (mazes stub to replace) + [apps/client/src/ui/__tests__/RoundConfigPanel.test.tsx] (disabled-example to move to a Hard module)
- [Source: _agent_docs/project-context.md] (full binding rule set) + [memory: human-verification-ac-rule]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (dev-story workflow)

### Debug Log References

- Gates on the 6.3-landed baseline (`9a84c98`): `pnpm -r exec tsc --noEmit` → 0 errors; `pnpm -r test` green; `pnpm --filter @bomb-squad/client build` green.
- Post-implementation gates (all in the `Ktane-sprint6` worktree):
  - `tsc --noEmit` (all packages): 0 errors, no `@ts-ignore`.
  - shared: 15 suites / **375 tests** pass (incl. 28 new mazes tests).
  - server: 36 suites / **562 tests** pass, 2 pre-existing skips (incl. new mazes registration test).
  - client: 53 files / **447 tests** pass (incl. `mazesBinding` + `PageRenderer.maze`).
  - client build: green (770 modules; pre-existing >500 kB chunk warning only).
  - Runtime liveness smoke: `vite dev` boots; `/`, `/dev/sandbox`, `/dev/manual` all serve 200; `mazes/index.ts`, `mazes/DefuserView.tsx`, `manual/MazeDiagram.tsx` all resolve 200 in the module graph (clean transform).

### Completion Notes List

**9-maze data extraction method (the correctness crux — Task 2).** Rendered manual page 15 (0-indexed 14) with `python3.12` + PyMuPDF. The 9 mazes are a graphical 3×3 layout with no text layer, so extraction was **fully programmatic** (per the 6.2 lesson):
- Geometry: all 423 wall/border segments are exactly 24pt (one cell). Found the three maze-column x-origins `[80, 234, 388]` and three row y-origins `[230, 384, 538]`; each maze is 144pt (6 cells × 24pt); dots sit at cell centres.
- Walls: for every interior edge, tested membership against the PDF's vector line segments → `MAZE_LAYOUTS`.
- **Independent cross-check:** a second detector sampled rendered-PNG ink at each edge midpoint. **Both methods agreed on all 225 walls across all 9 mazes (0 mismatches).**
- Integrity signals (all pinned by tests): every maze is a **perfect maze** — exactly 25 interior walls and fully connected (36 cells → 35 passages → 25 of 60 walls); all 9 marker-pairs distinct; walls symmetric.
- Markers: detected from the circle-ring vector drawings (18 = 2×9); snapped to cells with a max residual of **0.25pt** (cell = 24pt) — unambiguous. The story's by-eye marker table disagreed on mazes 0/2/5/8; per the story ("detection/PNG wins"), the programmatic values are used — maze 0's right marker was eye-verified at **(5,2)** (rightmost column), confirming the table's `(4,2)` was the low-confidence error.

**Design decisions taken as written:**
- Off-grid = strike (one `canMove` check unifies border + interior walls; KTANE-faithful).
- No stored answer/path — move legality recomputed from `MAZE_LAYOUTS` each MOVE (wires AI1).
- Walls are a DefuserView rendering choice, not a state secret (`mazeId`/`position`/`target` broadcast freely).
- `start` stored separately from `position` so `MODULE_RESET` restores the spawn.

**Task 5 decision flag for Jay (manual maze rendering):** proceeded with the **recommended SVG path** — additive `ManualSection.maze?`/`mazes?` + `Cell`/`ManualMaze` in `types/module.ts`, a shared `MazeDiagram.tsx` SVG component reused by both `PageRenderer` (the Expert viewer / `/dev/manual`) and the per-module `MazesManualPages`, so the two renders cannot diverge. The ASCII/box-drawing fallback was not taken. Say the word if you'd prefer ASCII.

**Epic 6 Medium tier closed:** `TIER_POOLS.medium` now equals `TIER_CATALOG.medium`. The `RoundConfigPanel` disabled-example moved off Mazes to a Hard-tier generator-less module (Complicated Wires) since no Medium module is generator-less anymore.

**✅ Task 8 (AC5) — Human verification PASSED (2026-07-02).** Jay exercised Mazes interactively in `/dev/sandbox` + `/dev/manual` (against the generated seed examples — 42/2026/100/7/0/1/2, with markers→maze match, shortest-solve navigation, wall + off-grid strike/recovery with the light staying put, walls absent on the bomb but present in the manual, legibility) and **confirmed working**. All 5 ACs satisfied.

### File List

**Created — shared (`packages/shared/src/`):**
- `modules/mazes/types.ts`
- `modules/mazes/generate.ts`
- `modules/mazes/solve.ts`
- `modules/mazes/reducer.ts`
- `modules/mazes/manual.ts`
- `modules/mazes/index.ts`
- `modules/mazes/__tests__/mazes.test.ts`

**Created — client (`apps/client/src/`):**
- `modules/mazes/types.ts`
- `modules/mazes/generate.ts`
- `modules/mazes/solve.ts`
- `modules/mazes/reducer.ts`
- `modules/mazes/DefuserView.tsx`
- `modules/mazes/ManualPages.tsx`
- `modules/mazes/index.ts`
- `modules/__tests__/mazesBinding.test.ts`
- `manual/MazeDiagram.tsx`
- `manual/__tests__/PageRenderer.maze.test.tsx`

**Modified — shared:**
- `types/module.ts` (additive `Cell`, `ManualMaze`, `ManualSection.maze?`/`mazes?`)
- `types/index.ts` (export `Cell`, `ManualMaze`)
- `modules/index.ts` (barrel: `export * from './mazes/index.js'`)
- `modules/registry.ts` (`MODULE_GENERATORS` + `TIER_POOLS` medium/hard append `mazes`)
- `modules/__tests__/tierGating.test.ts` (generatable-set + description)

**Modified — server (`apps/server/src/`):**
- `reducers/MODULE_REDUCERS.ts` (register `mazesReducer`)
- `reducers/__tests__/moduleRegistration.test.ts` (mazes legal-move + into-wall case)

**Modified — client:**
- `manual/PageRenderer.tsx` (additive `section.maze`/`section.mazes` branch)
- `manual/devManualFixtures.ts` (mazes stub → `...getMazesManualPages()`)
- `modules/index.ts` (barrel import + `SANDBOX_MODULES` entry)
- `ui/__tests__/RoundConfigPanel.test.tsx` (disabled-example → Hard-tier module)

## Change Log

- 2026-07-02: Story created (context engine analysis — comprehensive developer guide; 9-maze data sourced from manual page 15, marker positions read by eye as a verification target with programmatic wall/marker extraction recommended). Created in the `sprint-6-medium-modules` worktree (baseline 51d43ca; real dev baseline = the landed 6.3 commit). Last & most involved Medium module: 2D grid navigation + a new additive `ManualSection.maze` structured-render capability (the manual can't be a text table). Closes the Epic 6 Medium tier (TIER_POOLS == TIER_CATALOG). Status: ready-for-dev.
- 2026-07-02: Implemented (dev-story). Shared mazes module (types/generate/solve/reducer/manual) + client module (DefuserView, ManualPages) + registries (generator, reducer, tier pools medium/hard). 9-maze `MAZE_LAYOUTS` extracted programmatically from manual p.15 and cross-verified by an independent pixel-sampling pass (0/225 wall mismatches; all perfect mazes; markers snap ≤0.25pt). Additive manual capability landed: `Cell`/`ManualMaze` + `ManualSection.maze?`/`mazes?` in `types/module.ts`, a shared `MazeDiagram` SVG component, and a `PageRenderer` branch (backward-compatible — existing sections unchanged). `/dev/manual` mazes stub swapped to canonical content; `RoundConfigPanel` disabled-example moved to a Hard module (Medium tier now fully generatable). Gates: tsc 0 errors; shared 375 / server 562 / client 447 tests pass; client build green; runtime smoke (vite + /dev routes + module graph) green. Tasks 1–7 complete; Task 8 (Jay's interactive verification, AC5) pending. Status: review.
