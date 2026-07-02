---
baseline_commit: 15bd168
context:
  - _agent_docs/project-context.md
  - _agent_docs/implementation-artifacts/sprint-6-retro-2026-07-02.md
  - packages/shared/src/types/module.ts
  - apps/client/src/manual/PageRenderer.tsx
  - apps/client/src/manual/colorWords.ts
  - packages/shared/src/modules/keypads/manual.ts
  - packages/shared/src/modules/whos-on-first/manual.ts
---

# Story TD-9: ManualTable Presentation Rework — Alignment Field + Spacer Removal + Emphasis Opt-Out

Status: done

<!-- Refactor / tech-debt story (not from an epic). Sprint 6 retro Action Item 3.
     PageRenderer hardcodes "right-align the LAST cell of every row" (load-bearing
     for wires/the-button/passwords, whose last column is the action/answer). To
     dodge it, Keypads (6.1) and Who's on First (6.2) baked a permanent empty
     TRAILING SPACER COLUMN into their canonical shared manual data — and pinned it
     with tests. That is double-entered debt: any future consumer of the shared
     manual (export/print/alternate viewer) inherits a phantom column. Separately,
     EmphasizedText tints EVERY recognized colour word, so `RED` renders in wire-red
     ink while READ/REED/LEED stay plain — a false visual cue in the Who's on First
     spelling-discrimination cluster where colour is explicitly not a cue. Both
     resolve in one presentation-field rework on ManualTable, consumed by
     PageRenderer, then drop the spacers + their pinning tests. -->

## Story

As an Expert reading module manuals (and any future consumer of the shared manual data),
I want table column alignment and colour-word emphasis expressed as presentation metadata on `ManualTable` and honoured by `PageRenderer`, instead of a phantom spacer column baked into canonical data and an unconditional colour tint,
so that Keypads/Who's-on-First tables align correctly without a fake column, `RED` is not falsely emphasized in a spelling-discrimination table, and the wires/the-button/passwords answer-column right-align still works — with the shared manual data carrying real content only.

## Context — the grounded picture

- **The hardcoded rule.** `apps/client/src/manual/PageRenderer.tsx` right-aligns the **last** cell of every row (`c === row.length - 1 → text-right font-semibold`) and matches the last header to it. This is correct and load-bearing for wires/the-button/passwords, whose final column is the action/answer. `ManualTable` today is just `{ headers: string[]; rows: string[][] }` (`packages/shared/src/types/module.ts:4`) — no presentation metadata.
- **The spacer hack (double-entered).** To keep their reference columns left-aligned under their headers, two modules append a permanent empty trailing column:
  - `packages/shared/src/modules/keypads/manual.ts` — `getKeypadsManualPages()` carries an empty 7th column; pinned by `packages/shared/src/modules/keypads/__tests__/keypads.test.ts` (~line 361) and `apps/client/src/modules/__tests__/keypadsBinding.test.ts`.
  - `packages/shared/src/modules/whos-on-first/manual.ts` (commit `ee15988`) — both Step-1 and Step-2 tables carry an empty trailing column; pinned by `whos-on-first/__tests__/whos-on-first.test.ts` (~line 318). Additionally the module's own contract renderer `apps/client/src/modules/whos-on-first/ManualPages.tsx` draws the spacer as a visible empty bordered column.
  - Wire Sequences (6.3) dodged it by layout luck (its last column *is* the answer), so it carries no spacer — do not add presentation metadata there unless it changes rendering.
- **The false-emphasis bug.** `EmphasizedText` (`PageRenderer.tsx:12`) splits every cell via `splitColorWords` (`apps/client/src/manual/colorWords.ts`) and tints any recognized colour word with `MANUAL_COLOR_INKS`. In the Who's on First Step-1 table, `RED` renders in wire-red while READ/REED/LEED stay plain — a false cue in exactly the module where colour must not be a signal (colourblind floor). Needs a per-table (or per-section) emphasis opt-out.
- **One coherent rework.** Add presentation fields to `ManualTable`, consume them in `PageRenderer`, then remove both modules' spacer columns and their spacer-pinning tests, and set the emphasis opt-out on the Who's on First tables. The wires/the-button/passwords right-align must keep working unchanged (regression-gate it).
- **Note — this is NOT the 7-1 dispute.** The 7-1 review dismissed "header right-align is a defect" (the last-`<td>` right-align is correct by design). TD-9 does not remove the right-align behaviour; it makes alignment *expressible* so tables that shouldn't right-align their last column don't have to fake a column to avoid it.

## Acceptance Criteria

1. **Given** `packages/shared/src/types/module.ts`, **When** TD-9 is done, **Then** `ManualTable` carries **presentation metadata** that expresses (a) per-column (or last-column-opt-out) alignment and (b) a colour-word-emphasis opt-out — additive and optional (existing tables with neither field render exactly as today), typed (no `any`), and documented with the load-bearing default (last column right-aligns unless opted out).
2. **Given** `PageRenderer`, **When** it renders a table, **Then** it consumes the new fields: a table that opts its last column out of right-align renders that column left-aligned (header and cells), a table with no metadata keeps the current right-align-last-cell behaviour, and a table/section with emphasis opted out renders colour words as plain text (no `MANUAL_COLOR_INKS` tint).
3. **Given** the spacer hack, **When** TD-9 is done, **Then** the trailing empty spacer column is **removed** from `keypads/manual.ts` and both Who's on First tables in `whos-on-first/manual.ts`, the modules render correctly aligned via the new metadata (not a fake column), and the spacer-**pinning** tests are updated to assert the alignment metadata instead (the `keypads.test.ts` ~L361, `keypadsBinding.test.ts`, and `whos-on-first.test.ts` ~L318 assertions no longer require a phantom column). The Who's on First contract renderer `ManualPages.tsx` no longer draws an empty bordered column.
4. **Given** the false-emphasis bug, **When** the Who's on First Step-1 table renders, **Then** `RED` renders untinted (plain), matching READ/REED/LEED — the colourblind-floor requirement — via the emphasis opt-out set on the Who's on First tables (not by removing tinting globally; wires/other tables keep their colour emphasis).
5. **Given** the load-bearing consumers, **When** the rework lands, **Then** wires / the-button / passwords manual tables still right-align their answer column exactly as before (regression-gated by an existing or added test), and every module's manual still renders — `pnpm -r test` + `pnpm -r typecheck` green across all four workspaces; client build green.
6. **Given** interactive verification (user-visible manual rendering — [[human-verification-ac-rule]]), **When** Jay opens `/dev/manual` (or the in-game Expert manual) for Keypads, Who's on First, wires, the-button, and passwords, **Then** he confirms: Keypads/Who's-on-First reference columns are left-aligned under their headers with **no empty trailing column**, Who's on First `RED` is **not** tinted, and wires/the-button/passwords answer columns are still right-aligned — recorded in Completion Notes.

## Tasks / Subtasks

- [x] **Task 1 — Add presentation metadata to `ManualTable` (AC: #1)** — additive optional fields for column alignment (last-column right-align opt-out at minimum) + emphasis opt-out; document the load-bearing default; keep it minimal (no speculative per-cell styling).
- [x] **Task 2 — Consume the fields in `PageRenderer` (AC: #2)** — alignment drives header + `<td>` classes; emphasis opt-out bypasses `EmphasizedText` tinting (plain text). No behaviour change for tables without metadata.
- [x] **Task 3 — Remove the keypads spacer (AC: #3)** — drop the 7th column from `keypads/manual.ts`; set the alignment opt-out; update `keypads.test.ts` (~L361) + `keypadsBinding.test.ts` to assert alignment metadata, not a phantom column.
- [x] **Task 4 — Remove the Who's on First spacers + fix emphasis (AC: #3, #4)** — drop the trailing column from both tables in `whos-on-first/manual.ts`; set alignment opt-out + emphasis opt-out; fix `ManualPages.tsx` to not draw the empty column; update `whos-on-first.test.ts` (~L318) to assert the metadata; add/adjust an assertion that Step-1 `RED` is not tinted.
- [x] **Task 5 — Regression-gate the load-bearing consumers (AC: #5)** — confirm/add a test that wires/the-button/passwords last-column right-align survives; full `pnpm -r test` + `pnpm -r typecheck` + client build green.
- [x] **Task 6 — Interactive verification + ledger (AC: #6)** — ledger DONE (deferred-work 6-1/6-2 spacer + RED-tint entries resolved). Interactive `/dev/manual` pass **CONFIRMED by Jay (2026-07-03)** — see Completion Notes.

## Dev Notes

### Files to touch

- **UPDATE** `packages/shared/src/types/module.ts` — `ManualTable` presentation fields.
- **UPDATE** `apps/client/src/manual/PageRenderer.tsx` — consume alignment + emphasis opt-out.
- **UPDATE** `packages/shared/src/modules/keypads/manual.ts` — drop spacer, set alignment.
- **UPDATE** `packages/shared/src/modules/whos-on-first/manual.ts` — drop spacers, set alignment + emphasis opt-out.
- **UPDATE** `apps/client/src/modules/whos-on-first/ManualPages.tsx` — stop drawing the empty column.
- **UPDATE (tests)** `packages/shared/src/modules/keypads/__tests__/keypads.test.ts` (~L361), `apps/client/src/modules/__tests__/keypadsBinding.test.ts`, `packages/shared/src/modules/whos-on-first/__tests__/whos-on-first.test.ts` (~L318) — assert metadata, not spacer.
- **UPDATE** `_agent_docs/implementation-artifacts/deferred-work.md` — resolve the 6-1/6-2 spacer entries + the RED-tint entry.

Read before editing:
- `apps/client/src/manual/PageRenderer.tsx:30-70` — the exact right-align logic (header + `<td>`), `EmphasizedText` at L12/L64/L93.
- `apps/client/src/manual/colorWords.ts` — `splitColorWords` / `MANUAL_COLOR_INKS` (the tint the opt-out bypasses).
- `packages/shared/src/modules/wires/manual.ts` (+ the-button, passwords) — the load-bearing right-align consumers that must NOT regress.
- `packages/shared/src/modules/wire-sequences/manual.ts:33-35` — the comment noting it needs no spacer (its last column IS the answer) — leave as-is.

### Project Context Rules

- **Modules author data, never markup** (project-context): the fix must keep alignment/emphasis as *data* on `ManualTable` consumed by the shared `PageRenderer` — not per-module JSX. The maze precedent (`ManualSection.maze`, Story 6.4) is the template: additive shared-type field + shared renderer.
- **Shared types stay minimal + typed**: additive optional fields, no `any`, existing tables unchanged by default.
- **Determinism / no behaviour drift**: manual content is generated data; alignment is presentation only — no change to any solve/reducer path.

### References

- [Source: sprint-6-retro-2026-07-02.md#Action Items] — AI-3: "ManualTable/PageRenderer presentation rework — replace the double-entered trailing-spacer hack with a real alignment field, plus the EmphasizedText color-tint opt-out (RED/READ/REED/LEED cluster). Done when: spacer columns removed from 6.1/6.2 canonical data; alignment expressed as presentation metadata; RED renders untinted."
- [Source: deferred-work.md] — 6-1 "Trailing spacer column baked into canonical shared manual data"; 6-2 "Trailing spacer column baked into Who's on First" + "Color-word tint falsely emphasizes the RED row".
- [Source: 7-1 review dismissal] — the last-`<td>` right-align is correct by design; TD-9 makes alignment *expressible*, it does not remove the default.

## Dev Agent Record

### Implementation Plan

Followed the maze-field precedent: additive optional presentation fields on the shared `ManualTable` type, consumed by the shared `PageRenderer` — modules author data, never markup. Two orthogonal opt-outs, both **default-on** so every metadata-free table renders byte-identically to before:

- `rightAlignLastColumn?: boolean` — undefined/`true` keeps the load-bearing "last column is the answer" right-align (wires/the-button/passwords); `false` leaves the last real column left-aligned under its header (Keypads, Who's on First) — replacing the faked trailing-spacer column.
- `emphasizeColorWords?: boolean` — undefined/`true` keeps the `MANUAL_COLOR_INKS` tint; `false` renders cells as plain text (Who's on First, where colour must not be a cue).

`PageRenderer.TableView` derives `rightAlignLast = table.rightAlignLastColumn !== false` and `emphasize = table.emphasizeColorWords !== false`, gating the header/`<td>` alignment classes and the `EmphasizedText` wrap respectively. The Who's on First contract renderer `ManualPages.tsx` renders straight from the row data, so dropping the spacer column removed its empty bordered column with no markup change.

### Completion Notes

- **AC1 (metadata):** `ManualTable` carries `rightAlignLastColumn?` + `emphasizeColorWords?` — additive, optional, typed (no `any`), documented with the load-bearing default (last column right-aligns unless opted out). Metadata-free tables unchanged.
- **AC2 (renderer):** `PageRenderer` consumes both fields; render-level regression in `PageRenderer.table.test.tsx` proves default right-align + tint, last-column left-align opt-out, and plain-text emphasis opt-out.
- **AC3 (spacers removed):** Keypads table is now 6 columns (`rightAlignLastColumn: false`); both Who's on First tables are 2 columns (`rightAlignLastColumn: false`). Pinning tests (`keypads.test.ts`, `keypadsBinding.test.ts`, `whos-on-first.test.ts`) assert the alignment metadata instead of a phantom column. `ManualPages.tsx` no longer draws an empty column.
- **AC4 (RED untinted):** Both Who's on First tables set `emphasizeColorWords: false`; `RED` renders plain, matching READ/REED/LEED. Asserted at data level (`whos-on-first.test.ts`) and render level (`PageRenderer.table.test.tsx`). Other tables keep their colour emphasis.
- **AC5 (no regression):** `pnpm -r typecheck` green (4 workspaces); `pnpm -r test` green — shared 491, server 567, client 463; client build green (pre-existing chunk-size advisory only). Load-bearing right-align covered by the default-behaviour test in `PageRenderer.table.test.tsx`.
- **AC6 (interactive): CONFIRMED by Jay (2026-07-03).** Ledger resolved (deferred-work 6-1/6-2 spacer + RED-tint entries marked RESOLVED). Jay's `/dev/manual` pass across the modules confirmed the rendering: Keypads / Who's on First reference columns left-aligned with no phantom column, Who's on First `RED` untinted, wires/the-button/passwords answer columns still right-aligned, Morse both Code columns even, Mazes a 3×3 block, and the Complicated Wires truth table filling the sheet as an even, centred 5-column grid. His `/dev/manual` pass also surfaced three presentation follow-ups on the same `PageRenderer` surface, all addressed and confirmed this session (below).

### AC6-pass follow-ups (Jay's `/dev/manual` findings, 2026-07-03)

- **Morse alphabet chart** — the two-pair `[Character, Code, Character, Code]` chart right-aligned its 2nd (last) Code column to the sheet edge while the 1st Code column read left-aligned. It's a symmetric reference chart, not an answer table, so set `rightAlignLastColumn: false` — both Code columns now read identically. (`morse-code/manual.ts`)
- **Complicated Wires truth table** — the ✓/— truth table under wide headers ("Red stripe"/"Blue stripe") looked unevenly distributed: every table renders `w-full`, so auto-layout sized columns to their (varying) header widths and bunched the single-glyph cells against the left with `Code` hugging the far right. Added an additive `evenColumns?: boolean` (default false) to `ManualTable`, consumed by `PageRenderer` (`w-full table-fixed` + centred headers/cells, overriding the answer-column right-align), and set `evenColumns: true` on the truth table so the 5 columns fill the sheet in a regular, centred lattice. (`module.ts`, `PageRenderer.tsx`, `complicated-wires/manual.ts`)
  - _Iteration note: a first pass used a `fullWidth: false` (content-sized) opt-out; Jay's screenshot showed that left the table occupying <½ the width. Replaced with the full-width even-grid `evenColumns` layout above._
  - **Latent header-padding bug fixed en route.** The `<th>` cells carried NO horizontal padding — the full-width auto layout hid it by spreading columns apart. Gave the header cells the same `px-1` + `pr-3.5` (or right-aligned-last) rhythm as the body `<td>`s, so header text aligns to its column's cells instead of hanging ~4px left. Improves every non-even table. (`PageRenderer.tsx`)
- **Mazes page** — the 9 mazes used `flex flex-wrap`, so they reflowed by available width instead of a fixed 3×3. Changed `MazeGridView` to `grid w-fit grid-cols-3` → a stable 3×3 block. (`PageRenderer.tsx`)

## File List

- `packages/shared/src/types/module.ts` — `ManualTable` presentation fields: `rightAlignLastColumn`, `emphasizeColorWords`, `evenColumns` (UPDATED)
- `apps/client/src/manual/PageRenderer.tsx` — consume alignment + emphasis opt-outs + `evenColumns` grid; header horizontal-padding fix; `MazeGridView` → fixed 3×3 grid (UPDATED)
- `packages/shared/src/modules/morse-code/manual.ts` — alphabet chart opts out of last-column right-align (AC6 follow-up) (UPDATED)
- `packages/shared/src/modules/complicated-wires/manual.ts` — truth table `evenColumns: true` (AC6 follow-up) (UPDATED)
- `packages/shared/src/modules/keypads/manual.ts` — drop spacer, set `rightAlignLastColumn: false` (UPDATED)
- `packages/shared/src/modules/whos-on-first/manual.ts` — drop spacers, set alignment + emphasis opt-out (UPDATED)
- `packages/shared/src/modules/keypads/__tests__/keypads.test.ts` — assert metadata, not spacer (UPDATED)
- `apps/client/src/modules/__tests__/keypadsBinding.test.ts` — assert metadata, not spacer (UPDATED)
- `packages/shared/src/modules/whos-on-first/__tests__/whos-on-first.test.ts` — assert metadata + RED-not-emphasized (UPDATED)
- `apps/client/src/manual/__tests__/PageRenderer.table.test.tsx` — render-level coverage of both opt-outs (NEW)
- `_agent_docs/implementation-artifacts/deferred-work.md` — resolve 6-1/6-2 spacer + RED-tint entries (UPDATED)
- `_agent_docs/implementation-artifacts/sprint-status.yaml` — td-9 → in-progress/review (UPDATED)

_Note: `apps/client/src/modules/whos-on-first/ManualPages.tsx` needed no edit — it renders straight from the row data, so removing the spacer column removed its empty bordered column._

## Change Log

| Date       | Change |
|------------|--------|
| 2026-07-03 | Story TD-9 created (backlog) from Sprint 6 retro Action Item 3: add presentation metadata (column alignment + colour-emphasis opt-out) to `ManualTable`, consume it in `PageRenderer`, remove the Keypads/Who's-on-First trailing-spacer hack + its pinning tests, and fix the false `RED` tint — a shared-type + viewer rework (maze-field precedent). Baseline 15bd168. |
| 2026-07-03 | TD-9 implemented: `ManualTable` gains `rightAlignLastColumn?` + `emphasizeColorWords?` (both default-on); `PageRenderer` consumes them; Keypads/Who's-on-First spacer columns removed + pinning tests re-pointed to the metadata; Who's on First `RED` untinted via emphasis opt-out; new `PageRenderer.table.test.tsx`. `pnpm -r test`/`typecheck` + client build green. Interactive `/dev/manual` AC6 pending Jay. Status → review. |
| 2026-07-03 | AC6-pass follow-ups from Jay's `/dev/manual` review: Morse alphabet chart opts out of last-column right-align (both Code columns match); `MazeGridView` → fixed 3×3 grid; fixed a latent `<th>` horizontal-padding gap (headers now align to their column body). Complicated Wires truth table: added additive `ManualTable.evenColumns?` (default false) → `w-full table-fixed` + centred cells, set `evenColumns: true` so the matrix fills the sheet in an even lattice (superseded an initial content-sized `fullWidth: false` attempt that left it <½ width). Tests/typecheck/build green. Interactive re-verification still pending Jay. |
