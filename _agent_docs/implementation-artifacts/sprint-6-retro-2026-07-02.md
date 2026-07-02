# Sprint 6 Retrospective — "Medium modules"

- **Date:** 2026-07-02
- **Facilitator:** Link Freeman (Game Developer)
- **Participants:** Jay (Project Lead), Link Freeman (Game Developer), Cloud Dragonborn (Game Architect), Samus Shepard (Game Designer), Paige (Tech Writer)
- **Scope:** Sprint 6 of the sprint plan — `6-1` Keypads, `6-2` Who's on First, `6-3` Wire Sequences, `6-4` Mazes, plus `TD-6` Playwright client e2e harness (Sprint 5 Action Item 1, executed in this worktree).
- **Note:** Sprint retro, not an epic retro — but Sprint 6 == the entirety of Epic 6, so **Epic 6 is closed with this retro** (`epic-6: done`, `epic-6-retrospective: done` per Jay). Retroactive retro: Sprint 7 (Hard modules) had already merged to master before this session, so the forward-looking half is assessed against evidence, not predictions.
- **`3-5`/`3-7` audio verification:** known, explicitly ignored for this retro (Jay's call — unchanged from the Sprint 5 carry-forward; tracked, non-blocking).

---

## Sprint Summary

| Metric | Result |
|---|---|
| Stories completed | **5 to `done`** — `6-1` Keypads, `6-2` Who's on First, `6-3` Wire Sequences, `6-4` Mazes, `TD-6` client e2e harness |
| Epic 6 | **Closed** — all 4 Medium modules done; `TIER_POOLS.medium == TIER_CATALOG.medium` |
| Code reviews | 3-layer adversarial (Blind Hunter / Edge Case Hunter / Acceptance Auditor) on every story; patch counts **fell monotonically 9→7→4→2** across 6.1→6.4 |
| Tests | shared 237→375 / server 558→562 / client 431→447 — all green; **+10 e2e specs** (`pnpm e2e`, ~37s, Docker-free, 3×3 consecutive greens); tsc clean throughout |
| Jay-found defects | **3** — 6.1 blank keycaps (font cmap gap) + manual column misalignment; 6.2 same alignment class. All rendering/asset territory — exactly TD-6's target class |
| Blockers | 0 hard. TD-6 bring-up fought a 164-zombie-process reconnect storm (subprocess teardown must kill the process **group**) — the suite's only flake source, fixed |

**Delivered:** the complete Medium module tier — Keypads (glyph identification, DejaVu font stopgap behind `KEYPAD_SYMBOL_GLYPHS`), Who's on First (two-step lookup, programmatically-verified eye-icon grid), Wire Sequences (first genuinely stateful module: multi-panel NAV + cumulative-occurrence), Mazes (first 2D navigable grid + the sprint's one architectural extension: additive `ManualSection.maze` + shared `MazeDiagram.tsx` so viewer and module renderer can't diverge). Plus **TD-6**: real-Chromium + SwiftShader-WebGL e2e harness against an in-process real-handler server (`bootTestServer.ts`, extracted from TD-5's verify), mesh→screen click projection, honest solving via shared solve fns. The harness AC was *evidenced, not asserted*: reverting the historical 8-9 fix made `error-surfacing.spec.ts` fail exactly at the defect.

## Sprint 5 Retro Follow-Through

| # | Sprint 5 action item | Status |
|---|---|---|
| 1 | **Client e2e harness** (R3F-render + socket-flow gaps fail in CI, not in Jay's runs) | ✅ **Delivered as TD-6** — and its would-have-caught claim was proven by defect-revert evidence. Residual: no CI runner exists yet ("wired into CI" = one deterministic command; runner is a flagged Jay decision) |
| 2 | **Mandatory semantic re-verify on invariant change** | ⚠️ **Not exercised** — pure-content sprint, no shared-invariant change. Stays armed for the next correct-course |
| 3 | **Real-container gate for LiveKit/self-hosted-infra primitives** | ⚠️ **Not exercised** — no LiveKit surface touched this sprint |
| — | Carried: `3-5`/`3-7` audio verification | ➡️ **Still open, known, explicitly non-blocking** (Jay) — rides forward unchanged |
| — | Prerequisite: provision KTANE manual v1 PDF | ✅ **Done and load-bearing** — the PDF became the *ground truth* for programmatic extraction in 6.2 and 6.4 |

## What Went Well

1. **Programmatic extraction of visual manual data — the sprint's signature discipline, born and then institutionalized.** 6.2 didn't trust the by-eye read of the eye-icon grid: connected-component detection corrected **2 cells** the transcription got wrong. The 6.4 spec then *mandated* the approach, and executed it with a dual independent detector (PDF vector geometry × PNG ink-sampling) — 225/225 walls agreed, and the by-eye marker table was wrong on **4 of 9 mazes**. House rule proven: *never trust a by-eye read of a visual grid; a second independent detector is cheap confidence.*
2. **TD-6 flips the verification economics.** Every Jay-found defect this sprint (fonts, alignment) lived in exactly the render/asset surface jsdom can't see. The harness now exists, is fast (~37s, Docker-free), solves honestly via shared solve fns, and proved its own value against a historical defect. From Sprint 7 on, feature stories ship e2e specs and Jay's role narrows to audio/feel/legibility.
3. **Template-copying discipline held velocity and quality simultaneously.** Each story's spec named its closest mechanical + structural templates and inherited the settled patterns (no-stored-answer, transient-struck, reroll-then-throw, frozen-state immutability). Review patch counts falling 9→7→4→2 across the sprint is what pattern maturation looks like.
4. **Story-spec "previous story intelligence" sections were consistently right** — the tier-pool test gotcha, per-story transcription risk, and where each story's crux lived were all predicted, shifting cost from discovery to execution.
5. **Difficulty escalated as designed with zero regressions** — fixed-board single-decision (6.1/6.2) → first stateful module (6.3) → spatial grid + first additive manual-schema extension (6.4). Test counts grew monotonically; tsc stayed clean.

## What Hurt

1. **Review lessons transferred to the next story's *spec* but not its *implementation*.** The unsolvable-board strike-trap was found and guarded by review in 6.1 — then the identical inert guard was **missing again in 6.2** and had to be re-found; the same class (fail-open `isWall` on unknown `mazeId`) appeared in 6.4. Same story for the MODULE_RESET-re-arms-solved pin (unpinned in both 6.1 and 6.2). The defect classes are now known; they need to stop being rediscovered per-story.
2. **The PageRenderer right-align-last-cell bug bit Jay interactively twice** (6.1, 6.2), got the same trailing-spacer-column hack baked into *canonical shared manual data* both times, and is now double-entered debt. 6.3 dodged it only by layout luck. The proper fix (alignment field on `ManualTable`, plus the `EmphasizedText` RED-tint opt-out) is ledgered on deferred-work.md.
3. **Tier-pool / unregistered-id gotcha fired on all four module stories** (and 5.4/5.5 before). Predicted every time, cheap every time — but structurally the tests encode a moving snapshot of the registry, and the "disabled-example" walked Who's on First → Wire Sequences → Mazes → (Sprint 7) Complicated Wires.
4. **Vacuous and weak tests recurred as a review theme.** 6.1's 500-seed uniqueness sweep was vacuously green because the story's core premise ("a 4-subset can belong to two columns") was **false** — max pairwise overlap is 3; 6.2's seed-sensitivity assertion passed on 1-of-8; 6.3 had a seed-coupled non-null assertion. Reviewers repeatedly had to identify *the invariant that actually guarantees the AC* and pin it.
5. **Record hygiene lapses that mislead future agents:** 6.2's Dev Notes still certified corrected-away table values as "PDF-verified"; TD-6's README documented a nonexistent helper and the wrong hook name — contradicting the story's own key lesson; 6.1 had contradictory Task 8 lines. 6.3's review also flagged process debt: out-of-scope 6.4 planning artifacts rode inside the 6.3 feature diff.

## Key Insights

1. **A recurring review finding is a checklist item, not a review finding.** Three defect classes (degenerate-state inert guard, fail-open lookup, RESET-on-solved pin) each appeared in ≥2 module stories. The transfer mechanism that works here is the story-spec template — the same channel that successfully carried the tier-pool prediction and the copy-the-freshest-sibling rule.
2. **Ground truth must be machine-derived when the source is visual.** Two independent detectors agreeing is cheap; a human eye against a 6×6 grid was wrong 2 times in 6.2 and 4-of-9 in 6.4. This is now settled discipline.
3. **The deferred-ledger capability chain continued:** Sprint 3 → TD-1 (component tests), Sprint 4 → TD-5 (multiplayer bots), Sprint 5 → TD-6 (browser e2e). The honest next link is not a new harness but **coverage**: the harness exists, the Medium/Hard module interaction surfaces don't have specs on it yet (Jay's call — see Action Item 1).
4. **Human verification found only what automation couldn't see — and that surface just shrank.** All 3 Jay-found defects were render/asset-class. With TD-6 live, the remaining human-only surface is audio, feel, and legibility.

## Action Items (confirmed by Jay)

| # | Action | Owner | Done when |
|---|---|---|---|
| 1 | **TD-7 — e2e coverage catch-up ticket.** Extend the TD-6 harness with additional test cases: solve (and strike/recovery) specs for the shipped modules beyond the current 10 specs — e.g. solving each Medium module (Keypads, Who's on First, Wire Sequences, Mazes — the Mazes sandbox spec is already logged as a TD-6 follow-up) and the Sprint 7 Hard modules now on master. Honest solving via shared solve fns, no baked answers. | Game Developer | A TD-7 story exists and lands `pnpm e2e` specs that drive solve + strike paths per shipped module tier |
| 2 | **Module-reducer defect-class checklist in the story template.** The three recurring review classes — degenerate/malformed-state inert guard (never a strike-forever trap), fail-closed lookups on unknown ids, MODULE_RESET-on-solved semantics pinned by test — become explicit spec-template checklist items for every future module story, so reviews stop re-finding them. | Game Developer | The next module story's spec carries the checklist and its review re-finds none of the three classes |
| 3 | **ManualTable/PageRenderer presentation rework** — replace the double-entered trailing-spacer hack with a real alignment field, plus the `EmphasizedText` color-tint opt-out (the RED/READ/REED/LEED cluster). Already on deferred-work.md; promoted to a named commitment because the debt was paid twice this sprint. | Game Developer | Spacer columns removed from 6.1/6.2 canonical data; alignment expressed as presentation metadata; RED renders untinted |

**Carried forward (tracked, non-blocking — unchanged per Jay):**
- `3-5`/`3-7` human audio verification (known; closing conditions as written in the Sprint 5 retro).
- CI runner for `pnpm e2e` (flagged Jay decision), `updateJSON` real-concurrency test (CI-Redis), `RELEASE.timerDigits` server-recompute, TD-6 deferrals (projection-loop mid-resolution throw, `gameServer` swallowed close, between-spec state reset), 6.4 `edgeKey` GRID_SIZE<10 coupling, authoritative p.7 glyph art swap-in, solve chime → 10.1, planning-artifacts-in-feature-diffs process note.

## Sprint 7 Check (retroactive)

Sprint 7 (Hard modules — Complicated Wires, Simon Says, Memory, Morse Code) already merged to master before this retro. Evidence of Sprint 6 lessons carrying: the tier-pool gotcha handoff jumped to Complicated Wires as predicted, and the Hard tier shipped on the same template discipline. **No epic update was required and none is pending** — the Sprint 6 → 7 seam held. Action Items 1 and 2 apply *forward* (TD-7 coverage; checklist for Epic 9/10-era module work and any new reducer surfaces).

## Readiness Assessment

- **Quality:** all gates green at sprint close — tsc clean across 4 workspaces; shared 375 / server 562 / client 447 / e2e 10; every feature story passed 3-layer adversarial review with patches before `done`; every module verified interactively by Jay across multiple seeds.
- **Deployment:** local-only by design; no host incidents.
- **Stakeholders:** solo project; Jay's interactive passes cleared all five stories (6.1 required a font + alignment fix round first — both now regression-gated, including a novel dependency-free TTF cmap coverage test).
- **Stability:** no open blockers. Known tracked limitations as listed under carried-forward.
- **Verdict:** **Sprint 6 is complete and Epic 6 is closed.** The Medium tier shipped verified with falling review-defect counts, the sprint's one architectural extension (structured non-table manuals) landed additively, and Sprint 5's headline commitment (client e2e harness) was delivered and proven. Residuals are named, owned, and non-blocking.

---

## Commitments Summary

- **Action Items:** 3 (TD-7 e2e module-solve coverage · module defect-class checklist in spec template · ManualTable/PageRenderer presentation rework)
- **Status flips:** `epic-6: done`, `epic-6-retrospective: done` (this document)
- **Carried-forward debt:** `3-5`/`3-7` audio verification (known, ignored for this retro per Jay) + tracked deferrals ledger
