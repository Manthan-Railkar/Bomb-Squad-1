---
baseline_commit: 8d146ed
---

# Story 6.2: Who's on First Module

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a team,
I want to defuse the Who's on First module,
So that we solve a two-step display-word → label-priority module.

## Acceptance Criteria

1. **Seeded two-step generation with a well-defined solution:** **Given** a generated Who's on First module, **when** `generate(seed, ctx)` runs, **then** it produces a **display word** (from the 28-word Step-1 display set, blank included) and **six distinct button labels** (from the 28-word Step-2 button-label set) such that the Step-1 table maps the display word to a button **position** (0–5), the label at that position selects a Step-2 **priority list**, and **exactly one** button (the first label in that priority list that is present among the six buttons) is the solution — deterministic given the seed.
2. **Correct press solves, any other press strikes:** **Given** the module, **when** the Defuser presses the button that is the first entry in the read-label's priority list to appear among the six buttons, **then** the module solves; **when** any other button is pressed, **then** a strike is recorded and the module is not solved (labels unchanged so the team can retry — transient `'struck'`).
3. **Manual pages carry both authoritative tables:** **Given** the manual pages, **when** an Expert reads them, **then** the full Step-1 display→position grid (all 28 display words) and all 28 Step-2 label priority lists are present, rendered from the same constants the solver uses.
4. **Reducer test suite:** **Given** the reducer test suite, **when** it runs, **then** it covers happy-path, wrong-interaction, idempotency, immutability (frozen input), guard clauses, and reset.
5. **Human verification:** Jay exercises Who's on First interactively in `/dev/sandbox` (read the display, use `/dev/manual` Step 1 to find the read-position, read that button's label, use Step 2 to find the first-priority button, press it → solve; press a wrong button → strike + recovery) and his observed results are recorded in Completion Notes before the story is marked done.

## Tasks / Subtasks

- [x] Task 1 — Shared pure logic: `packages/shared/src/modules/whos-on-first/` (AC: 1, 2)
  - [x] Copy the **keypads (6.1)** directory shape — the sibling Medium module already in this worktree — or wires/passwords (any of them is the same envelope): `types.ts`, `generate.ts`, `solve.ts`, `reducer.ts`, `manual.ts`, `index.ts`, `__tests__/`. Barrel-export from `packages/shared/src/modules/index.ts`; confirm it reaches `packages/shared/src/index.ts`. Module id = `'whos-on-first'` (**already reserved** in `MODULE_IDS` — verified).
  - [x] `types.ts`: `WHOS_ON_FIRST_MODULE_ID = 'whos-on-first'`; `BUTTON_COUNT = 6`. The **two canonical data tables as `as const` constants** (see Dev Notes for the authoritative, PDF-verified values): `DISPLAY_POSITIONS: Record<string, number>` (28 display words → button position 0–5) and `LABEL_PRIORITIES: Record<string, readonly string[]>` (28 button-label words → their 14-word ordered priority list). Also derive/declare `DISPLAY_WORDS` (the 28 Step-1 keys, blank `''` included) and `BUTTON_LABELS` (the 28 Step-2 keys) from those tables (single source — do **not** hand-maintain a parallel list). `WhosOnFirstState { display: string; labels: ReadonlyArray<string> }` (`labels.length === 6`, distinct). `WhosOnFirstAction = { type: 'PRESS'; buttonIndex: number }`; `WhosOnFirstReset = { type: 'MODULE_RESET' }`; `isWhosOnFirstAction` runtime guard (actions arrive as `unknown`).
  - [x] **No stored answer (keypads/wires/passwords AI1 pattern):** do **not** store the solution index or the read label in state. Everything is public — the display word and all six labels are rendered on the module, and both tables are public manual content. `PRESS` recomputes the solution from `display` + `labels` + the shared tables. Nothing secret rides in state.
  - [x] `generate.ts`: all randomness via `makeSeededRng(seed)` (**no `Math.random()`**). Algorithm: (a) pick `display` from `DISPLAY_WORDS` (seeded); (b) pick **6 distinct** `labels` from `BUTTON_LABELS` (seeded shuffle/sample). **Solvability is structural, not by re-roll:** Step 1 maps `display`→position `P` (0–5) which always exists (6 buttons); the label `L = labels[P]` is itself one of the six buttons and always appears in its own `LABEL_PRIORITIES[L]` list, so a first-match always exists. Add a defensive assertion that `solutionIndex(state)` is a valid index and **throw loud** if not (never-happens safety net, à la passwords' re-roll-exhaustion throw) — a thrown round is debuggable; a silent unsolvable puzzle is not. Deterministic given the seed. CPU-cheap. **Unlike passwords, no re-roll loop is needed** — do not over-build one.
  - [x] `solve.ts` (all pure; the two tables are the single source shared by solver + manual): `readPosition(display: string): number` = `DISPLAY_POSITIONS[display]` (guard: unknown display → the generator only emits known words, but bounds-check for the reducer's untrusted path). `readLabel(state): string` = `state.labels[readPosition(state.display)]`. `solutionIndex(state): number` = walk `LABEL_PRIORITIES[readLabel(state)]` in order and return the **button index** of the first list word that is present in `state.labels` (`-1` only if impossible — which generation prevents). `isCorrectPress(state, buttonIndex): boolean` = `buttonIndex === solutionIndex(state)`.
  - [x] `reducer.ts`: pure `Reducer<ModuleState<WhosOnFirstState>, unknown>`. `PRESS` → `isCorrectPress(state, buttonIndex)` ? `status: 'solved'` : `status: 'struck'` (transient — bombReducer rolls it into a team strike and re-arms; `display`/`labels` unchanged on a strike so the team can retry). Contract obligations (copy from keypads/wires): unknown/malformed action → unchanged (no throw); out-of-bounds / `NaN` / non-integer `buttonIndex` → unchanged; solved-inert (post-solve actions no-op); `MODULE_RESET` → re-arm with the same generated `display`/`labels` (there is no cycled/mutable sub-state to restore — a Who's on First press never mutates the board, so reset is simply `status: 'armed'` with data intact; document this in `reducer.ts`). Never `Date.now()`/`Math.random()` in the reducer.
  - [x] `manual.ts`: `getWhosOnFirstManualPages(): ManualPage[]` — a `whos-on-first` chapter with a short intro ("Read the display → Step 1 gives the button label to read → Step 2: press the first button in that label's list that is on the module") plus **two structured tables**: (1) Step-1 display→position grid rendered from `DISPLAY_POSITIONS` (position shown as a human-readable cell name — see the `POSITION_NAMES` note in Dev Notes), and (2) the 28 Step-2 priority lists rendered from `LABEL_PRIORITIES`. Structured `ManualTable`/`ManualSection` data only — **no HTML/JSX** (follow keypads' `manual.ts`). Consider splitting into two `ManualPage`s (Step 1, Step 2) if one page is too dense for the viewer — either is acceptable.
- [x] Task 2 — Table fidelity (AC: 1, 2, 3) — **this is the correctness crux of the whole story**
  - [x] Transcribe the two tables from the **canonical KTANE v1 manual** exactly. The authoritative, already-transcribed values are in Dev Notes below; **cross-check them against the rendered manual page before trusting them** — re-render page 9 (Step 1 grid) and page 10 (Step 2 lists) and verify each mapping (render command in Dev Notes). The Step-1 positions come from a **visual eye-icon grid**, so a transcription error is the single most likely bug in this story.
  - [x] Write integrity tests: `DISPLAY_POSITIONS` has exactly **28** keys with every value in `0..5`; `LABEL_PRIORITIES` has exactly **28** keys and **every list is a 14-element permutation of that key's own family** (the 14 words are internally consistent — no word outside the family, no duplicates, all 14 present); `BUTTON_LABELS.length === 28`; each `LABEL_PRIORITIES[L]` contains `L` itself (guarantees structural solvability). See Dev Notes for the two families.
- [x] Task 3 — Client module directory: `apps/client/src/modules/whos-on-first/` (AC: 1, 2)
  - [x] Copy the **keypads** client dir (the sibling Medium module in this worktree): `index.ts` (IModule binding + import-time `registerModuleRenderer`), `DefuserView.tsx`, `ManualPages.tsx` (minimal typed render of `getWhosOnFirstManualPages()`), re-export `types/generate/solve/reducer` from `@bomb-squad/shared`, `__tests__/`.
  - [x] `DefuserView.tsx` (R3F, rendering only, **zero game logic**): a **display panel** showing `data.display` (drei `Text` + the vendored mono font) atop a **2-column × 3-row grid of six buttons**, each showing its label from `data.labels[i]`. Fully data-driven — map over `data.labels` (never hardcode six literals in JSX). Memoized scoped zustand selector on `moduleIndex` (the 5.3 review pattern; keypads' selector is the template). No timer dependency (unlike the-button); Who's on First is static between snapshots — likely **no `useFrame` at all**.
  - [x] Interaction: each button press is a **single click** via the existing `moduleClickHandlers` from `apps/client/src/modules/interaction.ts` (left-button only, drag-tolerant, `stopPropagation` — do **not** reimplement). Click on button `i` → `{ type: 'PRESS', buttonIndex: i }` via `dispatchModuleAction`. No keyboard listeners (UX-DR13). The display panel is **not** clickable (it is read-only).
  - [x] Registration: one import + one `SANDBOX_MODULES` entry in `apps/client/src/modules/index.ts`; one `whos-on-first` entry in `apps/server/src/reducers/MODULE_REDUCERS.ts`. **Zero diff to `bombReducer.ts`.**
- [x] Task 4 — Generator + tier-pool registration (AC: 1) — **the shared-registry surface (append after keypads)**
  - [x] Add `whos-on-first` to `MODULE_GENERATORS` (import `generateWhosOnFirst` **directly from its file**, not the barrel — the registry convention) and to `TIER_POOLS`. Per `module-registry-two-registries-and-tier-pools`, a `TIER_POOLS` entry needs **both** a generator AND a reducer registered or `generateLayout` throws at ROUND_START — land the generator, the reducer (Task 3), and the pool entry in the **same commit**.
  - [x] **Tier placement (medium module) — keypads already established the pattern:** `TIER_POOLS.medium` and `TIER_POOLS.hard` currently read `['wires','the-button','passwords','keypads']` (6.1 diverged them from `easy`). **Append `'whos-on-first'`** to `medium` AND `hard` → `[…,'keypads','whos-on-first']`; leave `easy` untouched (a Medium module must not roll onto an Easy bomb). `TIER_CATALOG` already lists `'whos-on-first'` under `medium` and `hard` (verified) → **no `TIER_CATALOG` change needed**. Follow the exact comment/convention keypads used in `registry.ts` ("expand TIER_POOLS to its home tier AND every harder tier"). Authoritative dashboard tier GATING is still **Story 8.1**'s job.
- [x] Task 5 — Canonical manual content into the 5.2 viewer (AC: 3)
  - [x] Wire `...getWhosOnFirstManualPages()` into `apps/client/src/manual/devManualFixtures.ts` (the same pattern 5.3/5.4/5.5/6.1 used — replace any `whos-on-first` stub, or add the entry if none exists). Verify in `/dev/manual` that **both** tables render through `PageRenderer` and match `DISPLAY_POSITIONS` / `LABEL_PRIORITIES`.
- [x] Task 6 — Sandbox proof of the loop (AC: 1, 2)
  - [x] Who's on First appears in the `/dev/sandbox` picker; Generate from a seed renders the display panel + six labelled buttons; same seed → identical, different seed → different.
  - [x] Using the manual: read the display → Step 1 position → read that button's label → Step 2 first-in-list button → press it → solve LED green. Press any other button → strike pulse + re-arm, board unchanged (can keep trying). Repeat PRESS after solve is a no-op; Reset re-arms with the same board. **No clock needed** — Who's on First has no timer dependency, so the sandbox's existing chrome suffices.
- [x] Task 7 — Tests + gates (AC: 4, and all)
  - [x] Shared (jest, `packages/shared/src/modules/whos-on-first/__tests__/`): `generate` determinism (same seed deep-equal twice; two seeds differ; sweep seed 0/1/large); **structural-solvability sweep** (`solutionIndex(generate(seed)) ∈ 0..5` and `labels` has 6 distinct entries for every seed — AC1); the **table-integrity tests from Task 2**; `readPosition`/`readLabel`/`solutionIndex`/`isCorrectPress` units (including a hand-worked example verified against the manual by eye); full reducer suite: happy (PRESS the computed solution index solves), wrong (PRESS a non-solution index strikes, board unchanged), idempotent (repeat PRESS after solve is inert), **immutability (frozen state input — never skip)**, guards (out-of-bounds / `NaN` / non-integer `buttonIndex`, unknown action), `MODULE_RESET` (re-arms with data intact), solved-inert.
  - [x] One shared test asserting the manual ↔ solver share the constants: `getWhosOnFirstManualPages()` renders exactly the `DISPLAY_POSITIONS` keys and the `LABEL_PRIORITIES` lists (divergence impossible by construction — assert it anyway).
  - [x] Client (vitest): registry/binding test for `whos-on-first` mirroring `keypadsBinding.test.ts` (or `passwordsBinding.test.ts`). Server (jest): extend `moduleRegistration.test.ts` for the `whos-on-first` entry (solve + strike through the untouched bomb reducer — the injection rig exists).
  - [x] **Tier-pool / unregistered-id test gotcha (bit 5.4/5.5 and 6.1):** registering `whos-on-first` will trip any test that hard-codes the interim `TIER_POOLS` contents or uses `'whos-on-first'` as an example *unregistered* id. **Grep `'whos-on-first'` across all `__tests__` before finalizing** (6.1 will have used it as an unregistered example in some places — switch those to a still-unregistered id like `'wire-sequences'`/`'mazes'`); update pool-shape assertions (e.g. `assembleBomb.test.ts`) to include `whos-on-first` in medium/hard.
  - [x] Gates: **record the current baseline first** (`pnpm -r test` on `8d146ed` — measure shared/server/client suite counts and treat what you measure as the floor; do not copy earlier-era numbers), then `pnpm -r exec tsc --noEmit` → 0 errors (**no `@ts-ignore`**); `pnpm -r test` green, no regressions; `pnpm --filter @bomb-squad/client build` green.
  - [x] Runtime liveness smoke: `vite dev` boots; `/dev/sandbox` serves 200; `whos-on-first` resolves in the module graph; build transforms cleanly. Record honestly what was and wasn't run; full visual confirmation folds into Task 8.
- [x] Task 8 — Human verification (AC: 5)
  - [x] **Jay verifies interactively:** in `/dev/sandbox`, generate Who's on First from a couple of seeds; in `/dev/manual` read both tables; walk the two-step lookup by hand and press the solution button → solve; press a wrong button → strike + recovery; confirm the display word and six labels are legible at normal zoom. Record his observed results item-by-item in Completion Notes — **story is not done without this** (human-verification AC rule).

## Dev Notes

### Scope decisions (read first)

- **This story = the Who's on First module + canonical manual content, proven in the sandbox and `/dev/manual`** — the same envelope as 5.3/5.4/5.5/6.1. The production `MODULE_INTERACT` server handler / round wiring is Epic 8 territory (already landed for the reducer path; the sandbox's local backend is the sanctioned dev path). Leave the dispatch seam as is.
- **Single-press disarm — do NOT build the multi-stage version.** Real KTANE Who's on First repeats Steps 1–3 for several stages (the board changes after each correct press). Epic 6.2's AC is explicitly **single press → solve** ("pressing the first button … solves the module"). Implement one stage. Multi-stage is out of scope; do not add stage state.
- **The whole difficulty is DATA FIDELITY (Task 2), not generation.** Unlike Passwords (where the crux was a `countSpellableWords === 1` re-roll), Who's on First is **structurally always solvable** — no re-roll loop. The risk is transcribing the two canonical tables correctly, especially the Step-1 positions which come from a **visual eye-icon grid** in the manual. Transcribe carefully and test the tables hard (Task 2 integrity tests + a hand-worked solve example).
- **No stored answer (anti-cheat, wires AI1):** the display word and all six labels are public (rendered on the module) and both tables are public manual content — nothing is secret. `PRESS` recomputes the solution from public state; never persist `solutionIndex` or the read label.
- **No timer, no colour.** Who's on First is words + positions only: no live-timer dependency (unlike the-button), no colourblind-floor concern (it's text). Don't over-build it.
- **Solve chime** = Story 10.1 (deferred for the Easy modules + keypads too). Ship the LED-green visual.
- **Sibling context — 6.1 Keypads is DONE in this worktree.** Keypads (the first Medium module) already established the Medium registry pattern: it diverged `TIER_POOLS` medium/hard from easy (`[…,'keypads']`), and its dir shape (shared `packages/shared/src/modules/keypads/*` + client `apps/client/src/modules/keypads/*`) is the **closest, freshest template** — copy it. This story appends `whos-on-first` after keypads; it is **not** the first Medium divergence.
- **Out of scope:** multi-stage repetition, wire-sequences/mazes (other 6.x, still backlog), Preparation placeholder view (4.6), authoritative round-config tier gating (8.1), voice, optimistic pre-flash (4.7).

### Copy the template — do not redesign it

Keypads (6.1) is the freshest real-module template in this exact worktree; wires (5.3) / the-button (5.4) / passwords (5.5) are the earlier ones. **Passwords (5.5) is the closest mechanically** — no timer, pure interaction + validate against public data, `bombReducer.ts` untouched — but **keypads is the closest structurally** (same tier, same registry divergence). Copy the directory shape file-for-file with Who's on First content, then add **exactly the sanctioned integration lines**: client barrel import + `SANDBOX_MODULES` entry, `MODULE_REDUCERS` entry, `MODULE_GENERATORS` + `TIER_POOLS` entries, and the `/dev/manual` fixture wire-in. Settled patterns inherited for free: import-time registration side effect, the single documented type-erasure cast at registry boundaries, `isXxxAction` runtime guards, `.js` extensions on shared relative imports (NodeNext), transient-`'struck'` semantics, **memoized** scoped zustand selectors in DefuserView, tables-shared-by-solver-and-manual.

### The two authoritative tables (canonical KTANE v1 — PDF-verified) — CROSS-CHECK before trusting

Source: `docs/KeepTalkingAndNobodyExplodes-BombDefusalManual-v1.pdf`, **page 9** (Step 1 grid) and **page 10** (Step 2 lists). Re-render to verify:

```
python3.12 -c "import fitz; d=fitz.open('docs/KeepTalkingAndNobodyExplodes-BombDefusalManual-v1.pdf'); d[8].get_pixmap(matrix=fitz.Matrix(2.2,2.2)).save('/tmp/woif_p9.png'); print(d[9].get_text())"
```
(page 10 Step-2 text extracts cleanly as plain text; page 9 Step-1 positions must be read from the **rendered PNG** — the eye icon marks which of the 6 buttons to read).

**Position encoding.** The six buttons are a 2-col × 3-row grid. Index them in reading order: `0=top-left, 1=top-right, 2=middle-left, 3=middle-right, 4=bottom-left, 5=bottom-right`. Provide `POSITION_NAMES = ['top-left','top-right','middle-left','middle-right','bottom-left','bottom-right'] as const` for the manual render.

**STEP 1 — `DISPLAY_POSITIONS` (28 display words → button index 0–5).** The blank display is the empty string `''`:

| display | pos (name) | idx |
|---|---|---|
| `''` (blank) | middle-left | 2 |
| `YES` | middle-left | 2 |
| `FIRST` | top-right | 1 |
| `DISPLAY` | bottom-right | 5 |
| `OKAY` | top-right | 1 |
| `SAYS` | bottom-right | 5 |
| `NOTHING` | middle-left | 2 |
| `BLANK` | top-right | 1 |
| `NO` | bottom-right | 5 |
| `LED` | middle-left | 2 |
| `LEAD` | bottom-right | 5 |
| `READ` | middle-right | 3 |
| `RED` | middle-right | 3 |
| `REED` | bottom-left | 4 |
| `LEED` | bottom-left | 4 |
| `HOLD ON` | bottom-right | 5 |
| `YOU` | middle-right | 3 |
| `YOU ARE` | bottom-right | 5 |
| `YOUR` | middle-right | 3 |
| `YOU'RE` | middle-right | 3 |
| `UR` | top-left | 0 |
| `THERE` | bottom-right | 5 |
| `THEY'RE` | bottom-left | 4 |
| `THEIR` | middle-right | 3 |
| `THEY ARE` | middle-left | 2 |
| `SEE` | bottom-right | 5 |
| `C` | top-right | 1 |
| `CEE` | bottom-right | 5 |

> ⚠️ These 28 positions were transcribed by eye from the rendered page-9 grid. **Re-verify each one against the PNG** as the first substep of Task 2 — a single mis-read eye icon is the most probable defect in this story. If any cell disagrees with the PNG, the PNG wins.

**STEP 2 — `LABEL_PRIORITIES` (28 button labels → 14-word ordered priority list).** Extracted verbatim from page 10 (text layer, reliable). Press the **first** word in the list that is present on the module:

```
"READY":   YES, OKAY, WHAT, MIDDLE, LEFT, PRESS, RIGHT, BLANK, READY, NO, FIRST, UHHH, NOTHING, WAIT
"FIRST":   LEFT, OKAY, YES, MIDDLE, NO, RIGHT, NOTHING, UHHH, WAIT, READY, BLANK, WHAT, PRESS, FIRST
"NO":      BLANK, UHHH, WAIT, FIRST, WHAT, READY, RIGHT, YES, NOTHING, LEFT, PRESS, OKAY, NO, MIDDLE
"BLANK":   WAIT, RIGHT, OKAY, MIDDLE, BLANK, PRESS, READY, NOTHING, NO, WHAT, LEFT, UHHH, YES, FIRST
"NOTHING": UHHH, RIGHT, OKAY, MIDDLE, YES, BLANK, NO, PRESS, LEFT, WHAT, WAIT, FIRST, NOTHING, READY
"YES":     OKAY, RIGHT, UHHH, MIDDLE, FIRST, WHAT, PRESS, READY, NOTHING, YES, LEFT, BLANK, NO, WAIT
"WHAT":    UHHH, WHAT, LEFT, NOTHING, READY, BLANK, MIDDLE, NO, OKAY, FIRST, WAIT, YES, PRESS, RIGHT
"UHHH":    READY, NOTHING, LEFT, WHAT, OKAY, YES, RIGHT, NO, PRESS, BLANK, UHHH, MIDDLE, WAIT, FIRST
"LEFT":    RIGHT, LEFT, FIRST, NO, MIDDLE, YES, BLANK, WHAT, UHHH, WAIT, PRESS, READY, OKAY, NOTHING
"RIGHT":   YES, NOTHING, READY, PRESS, NO, WAIT, WHAT, RIGHT, MIDDLE, LEFT, UHHH, BLANK, OKAY, FIRST
"MIDDLE":  BLANK, READY, OKAY, WHAT, NOTHING, PRESS, NO, WAIT, LEFT, MIDDLE, RIGHT, FIRST, UHHH, YES
"OKAY":    MIDDLE, NO, FIRST, YES, UHHH, NOTHING, WAIT, OKAY, LEFT, READY, BLANK, PRESS, WHAT, RIGHT
"WAIT":    UHHH, NO, BLANK, OKAY, YES, LEFT, FIRST, PRESS, WHAT, WAIT, NOTHING, READY, RIGHT, MIDDLE
"PRESS":   RIGHT, MIDDLE, YES, READY, PRESS, OKAY, NOTHING, UHHH, BLANK, LEFT, FIRST, WHAT, NO, WAIT
"YOU":     SURE, YOU ARE, YOUR, YOU'RE, NEXT, UH HUH, UR, HOLD, WHAT?, YOU, UH UH, LIKE, DONE, U
"YOU ARE": YOUR, NEXT, LIKE, UH HUH, WHAT?, DONE, UH UH, HOLD, YOU, U, YOU'RE, SURE, UR, YOU ARE
"YOUR":    UH UH, YOU ARE, UH HUH, YOUR, NEXT, UR, SURE, U, YOU'RE, YOU, WHAT?, HOLD, LIKE, DONE
"YOU'RE":  YOU, YOU'RE, UR, NEXT, UH UH, YOU ARE, U, YOUR, WHAT?, UH HUH, SURE, DONE, LIKE, HOLD
"UR":      DONE, U, UR, UH HUH, WHAT?, SURE, YOUR, HOLD, YOU'RE, LIKE, NEXT, UH UH, YOU ARE, YOU
"U":       UH HUH, SURE, NEXT, WHAT?, YOU'RE, UR, UH UH, DONE, U, YOU, LIKE, HOLD, YOU ARE, YOUR
"UH HUH":  UH HUH, YOUR, YOU ARE, YOU, DONE, HOLD, UH UH, NEXT, SURE, LIKE, YOU'RE, UR, U, WHAT?
"UH UH":   UR, U, YOU ARE, YOU'RE, NEXT, UH UH, DONE, YOU, UH HUH, LIKE, YOUR, SURE, HOLD, WHAT?
"WHAT?":   YOU, HOLD, YOU'RE, YOUR, U, DONE, UH UH, LIKE, YOU ARE, UH HUH, UR, NEXT, WHAT?, SURE
"DONE":    SURE, UH HUH, NEXT, WHAT?, YOUR, UR, YOU'RE, HOLD, LIKE, YOU, U, YOU ARE, UH UH, DONE
"NEXT":    WHAT?, UH HUH, UH UH, YOUR, HOLD, SURE, NEXT, LIKE, DONE, YOU ARE, UR, YOU'RE, U, YOU
"HOLD":    YOU ARE, U, DONE, UH UH, YOU, UR, SURE, WHAT?, YOU'RE, NEXT, HOLD, UH HUH, YOUR, LIKE
"SURE":    YOU ARE, DONE, LIKE, YOU'RE, YOU, HOLD, UH HUH, UR, SURE, U, WHAT?, NEXT, YOUR, UH UH
"LIKE":    YOU'RE, NEXT, U, UR, HOLD, DONE, UH UH, WHAT?, UH HUH, YOU, LIKE, SURE, YOU ARE, YOUR
```

**The two label families** (Step-2 lists never cross families — each list is a 14-word permutation of its own family; assert this in Task 2):
- **Family A (14):** `READY, FIRST, NO, BLANK, NOTHING, YES, WHAT, UHHH, LEFT, RIGHT, MIDDLE, OKAY, WAIT, PRESS`
- **Family B (14):** `YOU, YOU ARE, YOUR, YOU'RE, UR, U, UH HUH, UH UH, WHAT?, DONE, NEXT, HOLD, SURE, LIKE`

`BUTTON_LABELS = [...Family A, ...Family B]` (28). Note `FIRST/NO/BLANK/NOTHING/YES/OKAY` appear in **both** the display set and the button-label set — that is correct; they are distinct roles (a display word vs. a button label). Store `''` (blank) as a valid display word.

**Generation & the mixed-family question.** Real KTANE draws the six button labels from the full 28-word `BUTTON_LABELS` pool (families may mix on the board). This stays solvable because the read label `L = labels[P]` is always a button and always in its own list, so the first-match walk always hits at least `L`. Buttons from the *other* family simply never appear in `L`'s list and are skipped. **Recommended:** draw 6 distinct labels from the full 28-word pool (faithful to KTANE) and rely on the structural guarantee — do **not** constrain to one family, and do **not** add a re-roll loop. Assert `solutionIndex ∈ 0..5` defensively (Task 1).

### Existing code you build on — read before writing

- `packages/shared/src/modules/keypads/*` (6.1, this worktree) — the freshest shared-side Medium template. Also `.../passwords/*` and `.../wires/*` (types + runtime guard, seeded generate, pure solve sharing data with the manual, contract-complete reducer, structured manual). Who's on First is closest to **passwords** mechanically (no timer; validate a public interaction against public data).
- `apps/client/src/modules/keypads/*` (6.1) — the freshest client-side template (IModule binding, import-time registration side effect, data-driven R3F DefuserView with drei `Text`, memoized selector, re-export files). Also `.../passwords/*`.
- `apps/client/src/modules/interaction.ts` — `moduleClickHandlers` (each button press is exactly this), `isPrimaryActivation`, `CLICK_DRAG_TOLERANCE_PX`. Use as-is; do **not** fork.
- `packages/shared/src/modules/registry.ts` — `MODULE_GENERATORS`, `MODULE_IDS` (`'whos-on-first'` reserved), `TIER_POOLS` (currently `medium`/`hard` = `['wires','the-button','passwords','keypads']`, `easy` = `['wires','the-button','passwords']`) + `TIER_CATALOG` (medium/hard already list `'whos-on-first'`). `apps/server/src/reducers/MODULE_REDUCERS.ts` — one new entry. `bombReducer.ts` untouched.
- `packages/shared/src/seeding/` — `makeSeededRng(seed)` (mulberry32), the only approved RNG. Non-negative integer seeds.
- `apps/client/src/manual/devManualFixtures.ts` — wire in `...getWhosOnFirstManualPages()` (Task 5; follow the 6.1 pattern).
- `packages/shared/src/types/{module,actions,bomb}.ts` — `IModule`, `ModuleState`, `ManualPage/Section/Table`, `MODULE_RESET` forwarding. **No shared-type change expected** beyond the new module's own `types.ts`; justify in Completion Notes if you believe one is needed.

### Previous story intelligence (6.1 — Keypads, done in this worktree; 5.5 — Passwords)

- **Keypads is the merge/registry precedent:** 6.1 added `KEYPADS_MODULE_ID` to `MODULE_GENERATORS` + `MODULE_REDUCERS` and appended `'keypads'` to `TIER_POOLS.medium`/`.hard` (the first Medium divergence). 6.2 appends `'whos-on-first'` right after it in the same spots — additive, trivial to reconcile. Read keypads' `registry.ts` diff to match the comment convention exactly.
- **Recompute-at-interaction, never store the answer** (wires AI1): keypads/passwords recomputed the decision from public data; Who's on First is the same — `PRESS` recomputes `solutionIndex` from `display` + `labels` + the public tables. Keep it that way (5.3 review flagged stored answers as a transmitted-state cheat).
- **Memoized scoped selectors** in DefuserView (`useMemo(() => selectX(moduleIndex), [moduleIndex])`) — the 5.3 review patch; every module since followed it. Do the same.
- **`'struck'` is transient** — return it on a wrong PRESS; the bombReducer rolls it into a team strike and re-arms. Don't mutate `display`/`labels` on a strike (the team retries the same board).
- **Tier-pool / unregistered-id test gotcha (bit 5.4/5.5 and again 6.1):** each registration had to update tests that hard-coded the interim pool or used the now-registered id as an "unregistered" example. Registering `whos-on-first` will do it again — grep `'whos-on-first'` in `__tests__` before finalizing and fix `assembleBomb.test.ts`-style pool assertions (medium/hard now gain a fifth entry).
- **Data-fidelity crux (new for this module):** unlike the born-solved risk passwords had, Who's on First has no cycled sub-state — the board is fixed at generation. The failure mode here is a mis-transcribed table (esp. Step-1 positions from the eye-icon grid). Test the tables directly (Task 2).
- **Honest smoke notes:** record each smoke item individually; the SwiftShader screenshot rig is not committed, so the runtime liveness smoke + Jay's interactive check are the confidence steps.
- **Red→green TDD is the house cadence:** write the shared Who's on First suite (incl. the two table-integrity tests) first — it fails on the missing module — then implement. Reviews verify gate numbers; record real ones.

### Project Structure Notes

- New (shared): `packages/shared/src/modules/whos-on-first/{types,generate,solve,reducer,manual,index}.ts` + `__tests__/whos-on-first.test.ts`; barrel line in `packages/shared/src/modules/index.ts`.
- New (client): `apps/client/src/modules/whos-on-first/{index.ts,DefuserView.tsx,ManualPages.tsx,types.ts,generate.ts,solve.ts,reducer.ts}` + `apps/client/src/modules/__tests__/whosOnFirstBinding.test.ts`.
- Modified (surgical): `packages/shared/src/modules/{index.ts,registry.ts}` (`MODULE_GENERATORS` + `TIER_POOLS` medium/hard — append after keypads), `apps/server/src/reducers/MODULE_REDUCERS.ts`, `apps/server/src/reducers/__tests__/moduleRegistration.test.ts`, `apps/client/src/modules/index.ts`, `apps/client/src/manual/devManualFixtures.ts`, plus any pool-shape test (`assembleBomb.test.ts`). (No `SandboxHarness.tsx` change — Who's on First needs no clock.)
- Untouched: `bombReducer.ts` dispatch logic, `interaction.ts`, `dispatch.ts`, client `registry.ts`, `gameStore`/`uiStore`, manual viewer components, `net/`, scenes/camera/chassis, server handlers, shared `events/`, Docker. Naming: id `"whos-on-first"`, `WhosOnFirstState`/`WhosOnFirstAction`, kebab-case dir.

### Project Context Rules (from `_agent_docs/project-context.md` — binding)

- `generate(seed, bombCtx)` is the only place randomness is allowed; never `Math.random()`; never mutate `BombContext` (readonly).
- Reducers: pure, zero `socket.io`/`ioredis`/`pg`/`fastify` imports; immutable returns (spread/map); unknown actions fall through unchanged; no `Date.now()`/`setTimeout` in reducers or their tests.
- `MODULE_REDUCERS`/`MODULE_GENERATORS` registration — bomb reducer/assembly never change per-module (open/closed). `getManualPages()` returns structured data, never HTML/untyped JSX.
- R3F: data-driven geometry from generate output; rendering-only components ("if a component requires a logic test, the logic has leaked"); no per-frame allocations (Who's on First is static between snapshots — likely no `useFrame` at all).
- Testing: pure logic unit-tested with zero infra; **never skip the frozen-state immutability test**; never mock the reducer; security — untrusted client input, **bounds-check `buttonIndex` server-side** (reject `NaN`/non-integer/out-of-range).
- Build: `tsc --noEmit` 0 errors, no `@ts-ignore`, TypeScript only, no new dependencies (stack pinned at three 0.184 / fiber 8.18 / drei 9.122 / React 18.3 — never upgrade).

### References

- [Source: _agent_docs/planning-artifacts/epics.md#Story 6.2: Who's on First Module] (ACs verbatim; Epic 6 preamble — FR24/FR25/FR26/FR27, additive plugin, six-case reducer suite)
- [Source: docs/KeepTalkingAndNobodyExplodes-BombDefusalManual-v1.pdf, pages 9–10] (authoritative Step-1 display→position grid + Step-2 label priority lists) + [memory: ktane-manual-pdf-asset — render with python3.12 + pymupdf]
- [Source: _agent_docs/implementation-artifacts/6-1-keypads-module.md + packages/shared/src/modules/keypads/* + apps/client/src/modules/keypads/*] (sibling Medium module, done in this worktree — registry-divergence precedent + freshest dir template)
- [Source: _agent_docs/implementation-artifacts/5-5-passwords-module.md] (closest mechanical template: no-timer public-data module; no-stored-answer; memoized selector; tier-pool/unregistered-id test gotcha; manual↔solver shared constant)
- [Source: apps/client/src/modules/interaction.ts] (`moduleClickHandlers` — each button press is a single click)
- [Source: packages/shared/src/modules/registry.ts] (`MODULE_GENERATORS`, `MODULE_IDS` with `'whos-on-first'` reserved, `TIER_POOLS` medium/hard = `[…,'keypads']`, `TIER_CATALOG`) + [memory: module-registry-two-registries-and-tier-pools]
- [Source: _agent_docs/project-context.md] (full binding rule set) + [memory: human-verification-ac-rule]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (gds-dev-story workflow)

### Debug Log References

- `pnpm --filter @bomb-squad/shared test` → 13 suites, **303 passed** (incl. new `whos-on-first.test.ts`; +1 line in `tierGating.test.ts` for the generatable set).
- `pnpm --filter @bomb-squad/server test` → 36 suites, **560 passed** (+2 skipped integration; incl. new `whos-on-first` registration case in `moduleRegistration.test.ts`).
- `pnpm --filter @bomb-squad/client test` → 49 files, **437 passed** (incl. new `whosOnFirstBinding.test.ts`; updated `RoundConfigPanel.test.tsx` disabled-example → Wire Sequences).
- `pnpm -r exec tsc --noEmit` → **0 errors** (no `@ts-ignore`).
- `pnpm --filter @bomb-squad/client build` → green (1 chunk-size advisory only, pre-existing).
- Runtime liveness smoke: `vite dev` boots (VITE v8.0.16); `GET /dev/sandbox` → 200; `/src/modules/whos-on-first/{index.ts,DefuserView.tsx,ManualPages.tsx}` all resolve → 200; no vite errors.

### Completion Notes List

**Implemented (AC1–AC4):**

- **Shared pure logic** (`packages/shared/src/modules/whos-on-first/`): `types.ts` (`WHOS_ON_FIRST_MODULE_ID`, `BUTTON_COUNT=6`, `POSITION_NAMES`, the two canonical tables `DISPLAY_POSITIONS`/`LABEL_PRIORITIES`, `DISPLAY_WORDS`/`WOF_BUTTON_LABELS` derived from their keys, `WhosOnFirstState`/`Action`/`Reset`, `isWhosOnFirstAction` guard); `solve.ts` (`readPosition`/`readLabel`/`solutionIndex`/`isCorrectPress`); `generate.ts` (seeded display pick + Fisher–Yates 6 distinct labels, structural solvability with a never-happens `solutionIndex===-1` throw — **no re-roll loop**); `reducer.ts` (single-press → solved/struck, board unchanged on strike, bounds/NaN/non-integer guard, solved-inert, `MODULE_RESET` → armed with board intact); `manual.ts` (one chapter, two structured tables from the same constants).
- **No stored answer (wires AI1):** neither the read label nor the solution index is persisted; `PRESS` recomputes from the public `display` + `labels` + tables. The display word and all six labels are public manual/board content — nothing secret crosses to the client.
- **DATA FIDELITY — the crux (AC1/AC3):** the Step-2 lists were extracted from the manual PDF **page 10** text layer (reliable). The Step-1 display→position grid (**page 9**) is a *visual eye-icon grid*; I did **not** trust my by-eye read — I detected the eye cell **programmatically** from the rendered page (connected-component eye isolation + per-grid gridline banding). That corrected two cells my first read got wrong (**blank → bottom-left**, **BLANK → middle-right**), both of which match the canonical KTANE table. Table-integrity tests assert 28/28 keys, positions ∈ 0..5, and that every Step-2 list is a 14-word permutation of its own family containing its own label (⇒ a solution always exists).
- **Naming collision resolved:** `BUTTON_LABELS` collided with the-button's export at the shared barrel (same class as keypads' `KEYPAD_COLUMN_COUNT` rename) → renamed to `WOF_BUTTON_LABELS`. `BUTTON_COUNT` is unique (kept).
- **generate signature:** `generateWhosOnFirst(seed)` takes no `ctx` (no bomb-context rule) — assignable to `ModuleGenerator`/`IModule.generate`; registered via the direct-from-file import convention.
- **Client module dir** (`apps/client/src/modules/whos-on-first/`): re-export `types/generate/solve/reducer`; `DefuserView.tsx` (R3F rendering-only — a read-only display panel + a 2×3 button grid mapped from `data.labels`, never hardcoded, each button a single-click `PRESS` via `moduleClickHandlers`, memoized scoped selector on `moduleIndex`, no `useFrame`); `ManualPages.tsx`; `index.ts` (IModule binding + import-time `registerModuleRenderer`).
- **Integration (additive over 6.1):** shared barrel `+whos-on-first`; `MODULE_GENERATORS` `+whos-on-first`; `TIER_POOLS` medium **and** hard `+'whos-on-first'` (easy untouched — a Medium module must not roll onto an Easy bomb; `TIER_CATALOG` already listed it → unchanged); server `MODULE_REDUCERS` `+whos-on-first`; client barrel `+WHOS_ON_FIRST_MODULE` in `SANDBOX_MODULES`; `/dev/manual` `whos-on-first` stub → canonical `...getWhosOnFirstManualPages()`. **`bombReducer.ts` untouched.**
- **Tier-pool / unregistered-id test gotcha handled:** grepped `'whos-on-first'` across tests. Updated `tierGating.test.ts` (generatable set now includes it) and `RoundConfigPanel.test.tsx` (its "un-implemented / disabled" example moved from Who's on First → **Wire Sequences**, still generator-less). Unregistered-id tests use `'simon-says'` (untouched). `layout.test.ts`'s `formatModuleType('whos-on-first')` is display-only (unaffected).
- **No shared-type change** beyond the module's own `types.ts`.

**Gates:** tsc 0 errors; shared 303 / server 560 / client 437 (no regressions); client build green; runtime liveness smoke pass. The SwiftShader screenshot rig is not in this worktree — full visual confirmation folds into Jay's Task 8 (AC5).

**AC5 — Jay interactive verification (2026-07-02, recorded): SATISFIED.** Jay exercised Who's on First in `/dev/sandbox` and confirmed it works as expected — the two-step lookup (display → Step-1 read position → that button's label → Step-2 first-in-list button) solves on the correct press, a wrong button strikes and recovers with the board unchanged, and the display word + six labels are legible. Verified against the seed examples generated from the module code (seeds 0/1/2/7/42/100/2026, incl. the blank-display seed 7 and mixed-family boards). The manual-table right-alignment bug found during this pass (Step-1/Step-2 answer column misaligned from its header, same as 6.1/keypads) was fixed with a trailing spacer column (commit `ee15988`). **AC5 satisfied; Task 8 checked; story done.** Code review (ideally a different model) still recommended before the epic merge.

### File List

**New (shared):**
- `packages/shared/src/modules/whos-on-first/types.ts`
- `packages/shared/src/modules/whos-on-first/generate.ts`
- `packages/shared/src/modules/whos-on-first/solve.ts`
- `packages/shared/src/modules/whos-on-first/reducer.ts`
- `packages/shared/src/modules/whos-on-first/manual.ts`
- `packages/shared/src/modules/whos-on-first/index.ts`
- `packages/shared/src/modules/whos-on-first/__tests__/whos-on-first.test.ts`

**New (client):**
- `apps/client/src/modules/whos-on-first/types.ts`
- `apps/client/src/modules/whos-on-first/generate.ts`
- `apps/client/src/modules/whos-on-first/solve.ts`
- `apps/client/src/modules/whos-on-first/reducer.ts`
- `apps/client/src/modules/whos-on-first/DefuserView.tsx`
- `apps/client/src/modules/whos-on-first/ManualPages.tsx`
- `apps/client/src/modules/whos-on-first/index.ts`
- `apps/client/src/modules/__tests__/whosOnFirstBinding.test.ts`

**Modified:**
- `packages/shared/src/modules/index.ts` (barrel `+whos-on-first`)
- `packages/shared/src/modules/registry.ts` (`MODULE_GENERATORS` + `TIER_POOLS` medium/hard `+whos-on-first`)
- `packages/shared/src/modules/__tests__/tierGating.test.ts` (generatable-set assertion `+whos-on-first`)
- `apps/server/src/reducers/MODULE_REDUCERS.ts` (`+whos-on-first`)
- `apps/server/src/reducers/__tests__/moduleRegistration.test.ts` (`+whos-on-first` registration case)
- `apps/client/src/modules/index.ts` (import + `SANDBOX_MODULES` + export `+WHOS_ON_FIRST_MODULE`)
- `apps/client/src/manual/devManualFixtures.ts` (whos-on-first stub → canonical)
- `apps/client/src/ui/__tests__/RoundConfigPanel.test.tsx` (disabled-example → Wire Sequences)
- `_agent_docs/implementation-artifacts/sprint-status.yaml` (6-2 → in-progress → review)

## Change Log

- 2026-07-02: Story created (context engine analysis — comprehensive developer guide; authoritative Step-1/Step-2 tables transcribed and PDF-verified from manual pages 9–10). Created in the `sprint-6-medium-modules` worktree (baseline 8d146ed, atop done 6.1 Keypads). Status: ready-for-dev.
- 2026-07-02: Manual-table right-alignment fix (commit `ee15988`) — trailing spacer column on Step-1/Step-2 tables so the answer column stays left-aligned under its header (same PageRenderer right-align-last-cell issue as 6.1/keypads); +1 test.
- 2026-07-02: AC5 satisfied — Jay verified Who's on First interactively in `/dev/sandbox` (two-step solve, wrong-press strike + recovery, legibility) against generated seed examples. All 8 tasks complete. Status: done.
- 2026-07-02: Story 6.2 implemented (claude-opus-4-8) — Who's on First module: shared pure logic (two canonical tables with the Step-1 grid detected programmatically from the manual PDF eye-icon page — corrected blank→bottom-left & BLANK→middle-right vs by-eye; no stored answer; structurally-solvable seeded generation with no re-roll; single-press PRESS reducer), client module dir on the keypads/passwords template (read-only display panel + data-driven 2×3 button grid, single-click press, memoized selector), whos-on-first registered in MODULE_REDUCERS + MODULE_GENERATORS + TIER_POOLS medium/hard + sandbox (bombReducer untouched), canonical two-table manual wired into /dev/manual. `BUTTON_LABELS`→`WOF_BUTTON_LABELS` to avoid the-button collision. Gates green (tsc 0; shared 303 / server 560 / client 437; build; liveness smoke). Status: review (awaiting code review + Jay's AC5 interactive verification).
