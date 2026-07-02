# Sprint 7 Retrospective — "Hard modules"

- **Date:** 2026-07-02
- **Facilitator:** Link Freeman (Game Developer)
- **Participants:** Jay (Project Lead), Link Freeman (Game Developer), Cloud Dragonborn (Game Architect), Samus Shepard (Game Designer), Paige (Tech Writer)
- **Scope:** Sprint 7 of the sprint plan — the **Epic 7 Hard tier**: `7-1` Complicated Wires · `7-2` Simon Says · `7-3` Memory · `7-4` Morse Code. Built in the `sprint-7-hard-modules` worktree, merged to master as `28aff7b`.
- **Note:** Sprint retro, not an epic retro. **Both content tiers are done in parallel worktrees.** Sprint 7 (Hard) is built and **merged to master (`28aff7b`)**; Sprint 6 (Medium modules — Epic 6: Keypads / Who's-on-First / Wire-Sequences / Mazes) is **complete in the `sprint-6-medium-modules` worktree (`b3e9c3e`), not yet merged** — so the main-worktree `sprint-status.yaml` still shows Epic 6 `backlog` purely because the work is unmerged, not because it's undone. Epic 7 is one adversarial review away from `done` (see 7-1 below). Epic-retrospective keys in `sprint-status.yaml` stay untouched (sprint retro convention, per the Sprint 5 precedent).
- **Verification caveat:** `7-1` is `review` — Jay-confirmed working interactively, but its 3-layer adversarial code-review was never run (no `fix(review-7.1)` commit; contrast `7-2`/`7-3`/`7-4`). This retro records it as the one open Epic 7 gate. **Jay confirmed (post-retro): run the 7-1 review — in progress; leave the deferred systemic items open this cycle; Sprint 6 needs no action here.**

---

## Sprint Summary

| Metric | Result |
|---|---|
| Stories completed | **3 to `done`** — `7-2` Simon Says, `7-3` Memory, `7-4` Morse Code |
| Stories in `review` | **1** — `7-1` Complicated Wires (Jay-verified working; adversarial code-review not yet run) |
| Modules delivered | **4** — the complete Hard tier; every Hard module now generatable |
| Sequencing | **Two content tiers in parallel worktrees** — Sprint 7 (Hard) merged to master; Sprint 6 (Medium) done in `sprint-6-medium-modules` (`b3e9c3e`), pending merge |
| Code reviews | 3-layer adversarial (Blind / Edge-Case / Acceptance) on `7-2`/`7-3`/`7-4` — patches applied before `done`. **`7-1` not reviewed.** |
| Tests (latest) | shared **352** / server **563** (+2 skipped integration) / client **443** — all green; `tsc --noEmit` clean across all 4 workspaces; client build clean. (Sprint 5 close was 237/558/431 → **+115/+5/+12**.) |
| Blockers | **0 hard.** Pure content sprint, disjoint from the Sprint 5 voice/relay surface |
| Production / host incidents | 0 |

**Delivered:** the full Hard tier, each module a file-for-file clone of the Wires (5.3) template extended with its own rule surface. `7-1` Complicated Wires — a 16-row attribute→cut truth table referencing serial/ports/batteries, multi-cut solve, born-solved re-roll. `7-2` Simon Says — a growing colour-flash sequence whose translation table is selected by serial-vowel **and live team strike count**, the first module rule that depends on live mutating bomb state. `7-3` Memory — a 5-stage sequential state machine with cross-stage position/label back-references and a wrong-press full-reset-to-stage-1. `7-4` Morse Code — a flashed-word decode → dial → TX, integer-kHz exact equality, dial preserved on wrong TX. All four confirmed working by Jay in `/dev/sandbox` with real-code seed walkthroughs.

> **Milestone C (content breadth) is half-delivered:** the Hard tier is complete; the Medium tier (Epic 6) is the remaining content gap before advanced features.

## Sprint 5 Retro Follow-Through

| # | Sprint 5 action item | Status |
|---|---|---|
| 1 | **Build/extend a client e2e harness** (R3F-render + socket-flow gaps fail in CI, not Jay's runs) | ❌ **Not extended to modules.** The four Hard `DefuserView` R3F surfaces shipped **no e2e specs** — each verified human-only (Jay `/dev/sandbox`). Module *logic* has strong jsdom coverage (26–27-test suites + 3-test bindings each), so the gap was smaller than Sprint 5's; the R3F interaction surface is still uncovered. Most acute for the upcoming Mazes (grid nav). |
| 2 | **Mandatory semantic re-verify on invariant change** | ✅ **Held in miniature.** No shared-invariant correct-course this sprint, but the fixture-chain handoffs exercised the same discipline: `7-3` Task 8 explicitly inherited and repointed `7-2`'s fixture change; `7-4` Task 0 was a sequencing gate that started from `7-3`'s *landed* commit and confirmed the fixtures held `'morse-code'` before editing. Merge-clean was never assumed to mean semantically-correct. |
| 3 | **Real-container integration test gate for LiveKit/infra primitives** | ⚠️ **Not exercised** — no LiveKit/self-hosted-infra work in a pure-content sprint. Remains the standing gate for the next voice/infra story. |

**Carried debt from Sprint 5:** `3-5` / `3-7` voice audio-verification is **still open** (both `review`). Sprint 7 was disjoint from voice as predicted, so they rode as tracked debt — and Sprint 6 (Medium) is also disjoint, so they continue to carry. Closing condition unchanged (Jay's ≥3-browser audible run).

## What Went Well

1. **The module template is now a factory.** Four Hard modules in one sprint, each a file-for-file clone of Wires (5.3) — shared `types/generate/solve/reducer/manual/index/__tests__` + client `IModule` binding, R3F `DefuserView`, memoized scoped selector, click handler. The copy-the-template discipline (5.3→5.4→5.5) scaled cleanly to the hardest tier. Simon's `useFrame`-plus-local-clock flash-playback (7.2) became a **reusable visual primitive** picked up verbatim by Morse (7.4).
2. **Single-source-of-truth rule constants made divergence structurally impossible.** `COMPLICATED_WIRES_TABLE` / `SIMON_TABLES` (24 cells) / `MEMORY_RULES` (20 cells) / `MORSE_TABLE` each feed **both** the solver and the manual from one constant — a solver/manual drift can't happen. Every table was transcribed from `gdd.md`, verified against the KTANE manual, and asserted **cell-by-cell against an independent expectation** — which is exactly what caught the `m`/`n` alphabet coverage hole in the 7.4 review.
3. **No-stored-answer anti-cheat held across all four** (recompute `shouldCut`/translation/correct-position/`correctFreqIndex` at reduce-time), extending Sprint 2 AI1. And `7-2` **closed the Sprint-4 AI-3 / 5.4-deferred debt**: server-authoritative live-strike injection — the `MODULE_INTERACT` handler stamps `strikeCount: bomb.strikes` onto the action before reducing (module-agnostic; a spoofed `strikeCount:0` is overridden), so the pure reducer stays strikes-in-as-input while never trusting the client. The first module whose rule depends on live mutating bomb state ([[module-live-bomb-state-seam]]).
4. **Determinism discipline was explicit and defended.** Born-solved avoidance two ways (7.1 `do…while` re-roll loop; 7.4 non-answer index-shift, cheaper), replayed-not-re-randomised reset (7.3 — a pure reducer can't re-randomise, so displays/layouts are fixed at `generate(seed)` and replayed), and integer-kHz exact equality (7.4, no float epsilon bugs). Each documented with a code comment so a reviewer doesn't "fix" it into non-determinism.
5. **Interactive verification stayed load-bearing** (Sprint 5 AI-2). All four Jay-confirmed with real-code seed walkthroughs — `7-1` against a `KTANE5` sandbox cheat-sheet (single/multi/all-cut + wrong-cut recovery); `7-3` seeds 1 (3·3·3·3·1), 7 (2·1·3·1·4, cross-stage refs), 42 (3·1·2·1·4) with a visible full-reset-to-stage-1 on a wrong press; `7-4` decode→dial→TX with dial-preserved strike and clamp-at-both-ends.
6. **Adversarial review caught real correctness bugs, not just polish.** `7-2`: `isSimonSaysAction` accepted `NaN`/non-integer `strikeCount` → reducer threw (violates guard-never-throw) → tightened to `Number.isInteger`. `7-4`: dial clamp used strict `===`, so an out-of-band `freqIndex` (corrupted Redis, `0.5`) walked unboundedly to `NaN MHz`, unsolvable → widened to `>=`/`<=` (self-healing) + regression test; and the `m`/`n` alphabet gap. `7-3`: reduced-motion + defensive stage-array guard.

## What Hurt

1. **`7-1` is the asymmetric loose end — the first Hard module is the only un-reviewed one.** `7-2`/`7-3`/`7-4` each got a committed 3-layer adversarial pass; `7-1` has none (`review` state, no `fix(review-7.1)` commit) despite being the earliest and one of the simpler modules to review. The cause is process ordering: "move to the next story" outran "close the current story," and the review that gates `done` was left trailing. Ironic inversion — the module that has been in `review` longest is the one still waiting for the safety net.
2. **The fixture-chain rotation tax was paid four times.** The "unregistered id" test fixtures (`layout` / `assembleBomb` / `initializeRoundBombs` / `moduleRegistration` fail-loud examples) had to be **repointed on every single registration**: `simon-says` → `memory` → `morse-code` → finally out of the epic to `keypads` (Epic 6 backlog, since registering Morse exhausted the Hard tier). Four rotations for four modules, each an inherited mechanical hazard (7.2 Task 9, 7.3 Task 8, 7.4 Task 8 "third rotation") plus a `tierGating` generatable-subset widening. A test pattern that must be hand-edited on every new module is itself tech debt ([[module-registry-two-registries-and-tier-pools]]).
3. **Systemic module-fleet gaps surfaced together and were deferred together.** The `7-4` review logged three architectural items in `deferred-work.md` that now touch the **whole fleet** (7 generatable modules, 9 with sandbox): (a) a client can forge `{type:'MODULE_RESET'}` through `MODULE_INTERACT` — benign on Morse (self-sabotage), **materially harmful on Memory (on-demand progress wipe)** — pre-existing since 7.2/7.3, fixable once in `moduleHandlers.ts`; (b) `prefers-reduced-motion` sampled once per mount across all three flashing modules; (c) no error boundary in the module render path — a malformed `word` throws inside `useMemo` during render and takes down the **entire R3F canvas**. At fleet scale, per-module deferral is compounding into a cross-cutting bill.
4. **The fixture rotation planted a cross-worktree merge hazard.** The rotation (#2) ended by repointing the "unregistered id" example to `'keypads'` — chosen because keypads read as Epic 6 `backlog` from inside the sprint-7 worktree. But **Sprint 6 registers keypads** (confirmed: all four Medium modules are in the registry in `sprint-6-medium-modules`). When both worktrees merge to master, those fail-loud fixtures assert `'keypads'` is *unregistered* against a registry that now *contains* it → they break. The rotation didn't just cost four edits; it engineered a merge-time failure that only surfaces when the two content branches meet. This is exactly why the pattern needs a registry-derived sentinel, not a hand-picked "backlog" id (Insight 2 / Merge reconciliation below).
5. **Client render/interaction is still human-only, and a shared-viewer bug is stranded.** No module e2e specs (What-Went-Well caveat + Follow-Through #1). Separately, `7-1` found a **pre-existing `PageRenderer` last-column alignment bug** (last `<td>` forced `text-right` while `<th>` stayed `text-left`) that **also affects Sprint 6.1 Keypads** — fixed in the sprint-7 worktree, but the **port to master / the sprint-6 worktree is still outstanding**.

## Key Insights

1. **The marginal cost of a Hard module is now dominated by two automatable chores, not by architecture.** What's left after the template clone is (a) transcribing + independently asserting the rule table and (b) paying the fixture-chain tax. Neither is design work; both are mechanizable. The architecture (open/closed bomb reducer, two-registry + tier-pool, transient-`struck` roll-up seam) absorbed all four Hard modules with **zero `bombReducer.ts` edits**.
2. **A test pattern that must be edited on every registration is O(modules) debt — and here it went past debt into a live merge break.** The unregistered-id fixture rotation should be a **registry-derived guaranteed-unregistered sentinel** (or a synthetic never-registered id), so adding a module never turns fixtures red. The proof it's overdue: 7.4 picked `'keypads'` as "safely unregistered," but the parallel Sprint 6 worktree registers it — so the two content branches can't both merge until the fixture is repointed. A hand-picked "backlog" id is only safe against the branch you can see.
3. **Deferred systemic items compound with fleet size.** A per-module gap logged when there were 3 Easy modules is a 3× liability; at 7 generatable (9 sandbox) it's a 7–9× liability. The reset-forge, reduced-motion, and error-boundary items have crossed from "watch" to "sweep" — one of them (Memory reset-forge) is a **live cheat**, not a latent one.
4. **Review must gate story-close, not trail it.** `7-1` slipping to `review` while three later stories reached `done` is the concrete failure mode. The 3-layer review is only a safety net if it runs **before** the story is considered finished — otherwise the earliest work is the least-checked.

## Action Items

| # | Action | Owner | Done when |
|---|---|---|---|
| 1 | **Run the 3-layer adversarial code-review on `7-1` Complicated Wires and close it to `done`.** Restores Hard-tier review uniformity; closes the last Epic 7 gate. **Confirmed by Jay — in progress this session.** | Game Developer | `7-1` has a recorded Blind/Edge/Acceptance pass with patches applied, status `done`, Epic 7 fully `done`. |

**Merge reconciliation — when `sprint-6-medium-modules` and the merged Sprint 7 meet on master** (not a this-cycle action; the checklist for whoever runs the content merge):
- **Repoint the unregistered-id fixtures off `'keypads'`.** Sprint 6 registers keypads; the sprint-7 fail-loud fixtures (`layout` / `assembleBomb` / `initializeRoundBombs` / `moduleRegistration`) assert it's *unregistered* → they break at merge. Best fix: swap the hand-picked id for a **registry-derived guaranteed-unregistered sentinel** so this class of break can't recur (What Hurt #2/#4, Insight 2).
- **Reconcile the `7-1` `PageRenderer` last-column alignment fix** with the sprint-6 worktree — Keypads 6.1 renders the same shared table and is affected by the same pre-existing bug.

**Carried forward (tracked debt):**
- **`3-5` / `3-7` voice audio-verification** — still `review`, still Jay's ≥3-browser audible run. Both remaining content branches are disjoint from voice, so they continue to carry ([[human-verification-ac-rule]], [[livekit-forwardparticipant-not-implemented-oss]]).
- **Client e2e harness for module `DefuserView` R3F interaction** (Sprint 5 AI-1) — not extended to the Hard modules; the Medium tier's Mazes (grid nav) is the most acute uncovered surface.

**Deferred — left open this cycle (Jay's call):**
- **The three systemic module-fleet gaps** (`deferred-work.md`, from 7.4 review), left open for now: (a) client-forgeable `MODULE_RESET` via `MODULE_INTERACT` — **a live cheat on Memory** (on-demand progress wipe), fixable once in `moduleHandlers.ts`; (b) `prefers-reduced-motion` sampled once per mount across the three flashing modules; (c) no render error boundary — a malformed `word` crashes the whole R3F canvas. Elevate to actions when the fleet is next touched.
- **`RELEASE.timerDigits` server-recompute** (Sprint 4 AI-3) — still parked; activate when a module-interaction story next touches the displayed-timer path.
- **Real-container infra-primitive gate** (Sprint 5 AI-3) — standing gate for the next LiveKit/infra story; not exercised in a content sprint.

## What's Next & Inherited Obligations

Both content tiers are done — Sprint 7 (Hard) on master, Sprint 6 (Medium) in `sprint-6-medium-modules`. The near-term path is **integration, not new content**:

- **Merge the two content branches to master** (Sprint 6 needs no retro action of its own — Jay's call). Run the merge-reconciliation checklist above **first**: the `'keypads'` fixture repoint is a hard prerequisite (the branches won't both go green until it's done), and the `PageRenderer` fix should reconcile in the same pass.
- **Then Milestone D:** Sprint 8 — Advanced features (Epic 9: asymmetric Expert roles, spectator lifeline economy, send-a-hint, lounge view) · Sprint 9 — Polish & release gates (Epic 10: SFX, 60fps hardening, symmetric-NAT WebRTC, accessibility sign-off, playtest instrumentation).
- **Inherited into that work:** `3-5`/`3-7` voice audio-verification still rides (Epic 9's lounge-view / lifeline stories are the natural place it stops being disjoint); the three deferred module-fleet gaps are left open now but should be swept when Epic 9/10 next touches the module render path or handlers (the Memory reset-forge is a live cheat, so flag it if a playtest build ships first).
- **Module discipline holds** for any future module work: reducer **and** generator registered **plus** a tier-pool entry in one commit, or `ROUND_START` throws ([[module-registry-two-registries-and-tier-pools]]).

## Significant Discovery Check

- **No fundamental epic misalignment.** The Hard tier landed strictly-additive — zero `bombReducer.ts` edits, no core-invariant change. Nothing in Sprint 7 invalidates any downstream epic.
- **One concrete integration hazard, not a replan trigger:** the cross-worktree `'keypads'` unregistered-id fixture break (What Hurt #4). It's a mechanical merge fix, not a design change — but the content-branch merge **will fail its test gate** until it's handled.
- **Epic update required: NO.** Close 7-1's review, then merge the content branches with the reconciliation checklist applied.

## Readiness Assessment

- **Quality:** all gates green — shared **352** / server **563** (+2 skipped integration) / client **443**; `tsc --noEmit` clean ×4; client build clean. `7-2`/`7-3`/`7-4` passed the 3-layer adversarial review with patches before `done`. **`7-1` verified working but its review has not run** (Action Item 1).
- **Deployment:** local-only by design; the Hard tier is merged to master (`28aff7b`). No infra changes.
- **Stakeholders:** solo project; Jay's `/dev/sandbox` interactive passes are the acceptance mechanism — cleared on all four modules (seed-verified walkthroughs).
- **Stability:** no open blockers. Tracked: `7-1` un-reviewed (review running now); the cross-worktree `'keypads'` fixture merge break; three systemic module-fleet gaps left open (one — the Memory `MODULE_RESET` forge — is a **live cheat**); `3-5`/`3-7` audio verify; `PageRenderer` reconcile; no module e2e coverage.
- **Verdict:** **Sprint 7 is functionally complete — the Hard tier is delivered, merged, and Jay-verified end-to-end.** Epic 7 is **one adversarial review (`7-1`, running now) from `done`.** The residual is process and integration hygiene (close 7-1's review; reconcile the `'keypads'` fixture + `PageRenderer` fix when the content branches merge; the fleet-wide gaps stay open by Jay's call), not capability. The template factory proved it scales to the hardest tier, and with Sprint 6 (Medium) already done in its worktree, **both content tiers are in hand** — the near-term work is merging them cleanly, then Milestone D.

---

## Commitments Summary

- **Action Items:** 1 (run the `7-1` adversarial code-review → close Epic 7) — **confirmed by Jay, in progress this session.**
- **Merge reconciliation (content-branch merge, not this cycle):** 2 (repoint the `'keypads'` unregistered-id fixtures → ideally a registry-derived sentinel · reconcile the `7-1` `PageRenderer` alignment fix).
- **Deferred — left open per Jay:** the 3 systemic module-fleet gaps (Memory reset-forge is a live cheat), plus `RELEASE.timerDigits` recompute and the real-container infra gate.
- **Carried-forward debt:** 2 (`3-5`/`3-7` audio verification · module `DefuserView` e2e coverage) — tracked, non-blocking.
