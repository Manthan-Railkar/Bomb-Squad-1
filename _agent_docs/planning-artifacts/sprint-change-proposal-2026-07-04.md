# Sprint Change Proposal — Facilitator Opt-In Play & Randomized Rulesets

**Date:** 2026-07-04
**Author:** Correct Course workflow (with Jay)
**Project:** Bomb Squad
**Status:** APPROVED by Jay 2026-07-04 (all 6 edit proposals A–F + final sign-off); Section 4 edits applied same day. Deviation: B3 (Story 9.4 note touch-up) deferred to an action item on Story 9.5 / sprint-status — 9.4's section was under concurrent edit (multiview amendment) by a parallel session.

---

## Section 1: Issue Summary

Two additions proposed by Jay during Epic 9 execution (9.1–9.3 in review, 9.4 ready-for-dev, Epic 10 backlog). Neither is a defect; both are **new requirements emerged from the stakeholder** based on play experience.

**Change 1 — Facilitator opt-in play.** The Facilitator is currently modeled as a fourth, non-playing role outside both teams. For single-team plays and 2-player sessions this forces a separate browser tab just to host. Jay wants the Facilitator to optionally join a team and play (Defuser/Expert during their team's rounds, Facilitator otherwise), eliminating the hosting tab.

**Change 2 — Randomized rulesets.** Bomb *values* are seeded-random per team per round, but the *rules* (which wire to cut, button tables, Simon mappings…) are the fixed KTANE v1 manual. Repeat players memorize the answer key, eroding the manual-reading core loop and Pillar 1 ("communication is the mechanic"). Jay asked whether to rotate fixed rule sets or live-generate rules, with solvability as the hard constraint.

**Evidence:** the "separate tab for hosting" friction is inherent in FR2/FR3 (host = Facilitator, exclusive); rule memorization is a structural property of a fixed manual + Pillar 4's own admission that "the team gets better" across sessions. The recent 2p-lite merge (single-team bomb-seed fix) confirms single-team play is an active use case.

## Section 2: Impact Analysis

### Epic impact
- **Epics 1–8 (done):** no rework. Change 1 *builds on* the durable-identity primitive (2.7), rotation/equalisation (8.9), sequential play (8.11), auto-pause (8.7), and voice re-mint (3.5/3.7) — all unchanged.
- **Epic 9 (in-progress):** gains **Story 9.5 (Facilitator Opt-In Play)**. Story 9.4 gets a one-line note touch-up ("facilitator watches from the lounge *when not on the active team*"). 9.1–9.3 unaffected.
- **Epic 10 (backlog):** unchanged.
- **New Epic 11 (Randomized Rulesets):** sequenced after Epic 10. Touches all 11 modules but as a data-refactor + additive generators, not a redesign.

### Artifact conflicts
- **GDD:** Facilitator role definition (Controls, Core Loop, Rotation); Module Mechanics preamble claims rules *are* the v1 manual — reframed as rule *structures* with the v1 tables as the "classic" ruleset; Pillar 4; new mechanic section; assumptions A10/A11.
- **epics.md:** new FR48–FR51, AR17, Story 9.5, Epic 11.
- **game-architecture.md:** seed chain gains `rulesetSeed`; decision log entry.
- **UX:** no structural changes — facilitator overlay reuses operator-world components; manual viewer already renders `getManualPages()` structured data (5.2), which becomes ruleset-parameterized.
- **project-context.md:** follow-up after Epic 11 lands ("never Math.random outside generate" extends to rule generators; module file contract gains rules-as-data note). Not edited now.

### Technical impact
- **Change 1:** role model — facilitator authority becomes a session-level flag on the durable player id, orthogonal to team/role. Authority gates (`ROUND_START`, `FACILITATOR_PAUSE`, etc.) already key on "is Facilitator"; they must never assume "has no team".
- **Change 2:** rules move from hardcoded `solve.ts`/manual pages into `RuleSet` data in `packages/shared/src/rules/`; seed chain extended (`rulesetSeed = hash(sessionId + ":ruleset")`); per-module generators with invariant validators + property tests. Fairness: one ruleset per session, shared by both teams and all rounds. FR19 (per-team value randomization) unchanged.

## Section 3: Recommended Approach

**Direct Adjustment (Option 1)** for both changes. No rollbacks (nothing done conflicts; both changes compose with shipped work). MVP scope untouched — both are additive post-core features.

**Change 1 scope: Moderate** (one story, cross-cutting role-model touch). **Change 2 scope: Major** (new epic, all 11 modules, seed-chain extension) — but risk is contained by the 11.1 golden-pinned refactor landing first with zero behavior change.

**Decisions made by Jay (2026-07-04):**
1. **Mode:** Incremental review (done — all proposals approved).
2. **Facilitator mid-round controls:** kept, as a compact confirm-guarded overlay while playing (essential for 2-player sessions).
3. **Ruleset generation: structure-preserving live generation.** Rule skeletons fixed per module; parameters seeded-generated; solvability by construction + validators + property tests. Curated rotation is subsumed (a curated set = blessed seeds).
4. **Rotation: per session.** One `rulesetSeed` per session — Experts study a stable manual in prep; cross-session memorization defeated; no mid-session chaos or extra config surface.

**Risk assessment:** Change 1 low (reuses shipped primitives; main risk is authority-gate assumptions — pinned by AC-1). Change 2 medium (difficulty variance across generated rulesets — A10; generator invariant bugs — mitigated by FR51 property tests and the classic-ruleset golden pin in 11.1).

## Section 4: Detailed Change Proposals

### 4.1 GDD (`planning-artifacts/gdds/gdd-Ktane-2026-06-09/gdd.md`) — Proposals A & C (approved)

**A1 — Controls and Input → Facilitator:**

OLD:
```
**Facilitator:**
- Dashboard UI, mouse only
- Session configuration, team assignment, round control, retry trigger, spectator chat toggle
```
NEW:
```
**Facilitator:**
- Dashboard UI, mouse only
- Session configuration, team assignment, round control, retry trigger, spectator chat toggle
- Opt-in play: the Facilitator may assign themselves to a team with a role, like any
  player. While their team's round is live they play that role; facilitator controls
  remain available as a compact overlay (pause/resume) with the full dashboard between
  rounds. Removes the need for a separate hosting tab in single-team / 2-player sessions.
```
*Rationale:* Facilitator becomes a session-level authority flag orthogonal to team/role membership, not an exclusive fourth role.

**A2 — Core Gameplay Loop, lobby line:** append `(the Facilitator may assign themselves to a team to play)` to `[Lobby] Facilitator creates session, shares link + join code; players join; teams assigned`.

**A3 — Session Structure → Rotation:** add "A Facilitator who has joined a team is part of that team's rotation and defuses like any player."

**C1 — New Primary Mechanic subsection** (after Spectator Lifelines):
```
#### Randomized Rulesets
Module rule *structures* are fixed (e.g. Wires is always "N wires → ordered condition
list → cut position"), but the concrete parameters — conditions, orderings, mappings,
tables — are deterministically generated per session from a rulesetSeed. Both teams and
all rounds in a session share one ruleset; the digital manual renders the active
ruleset, so Experts study the session's actual rules during Preparation. Every generator
enforces module-specific solvability invariants (validated by construction + property
tests). The KTANE v1 manual tables are preserved as the "classic" ruleset — encoded as
data and pinned by golden tests. Defeats cross-session rule memorization: veterans keep
their communication skill, not their answer key.
```

**C2 — Pillar 4 amendment:** append "With randomized rulesets, the *manual* is new each session too: what compounds across sessions is communication skill, never memorized answers."

**C3 — Module Mechanics preamble:**

OLD: `All rules are sourced from the *Keep Talking and Nobody Explodes Bomb Defusal Manual, v1 (verification code 241)*.`
NEW: `All rule **structures** are sourced from the *Keep Talking and Nobody Explodes Bomb Defusal Manual, v1 (verification code 241)*; the v1 tables constitute the "classic" ruleset. Concrete rule parameters are session-generated (see Randomized Rulesets). The tables below document the classic ruleset and the authoritative structure of each module's rules.`

**C4 — Assumptions table, add:**
- **A10:** Structure-preserving rule generation produces rulesets of comparable difficulty to the classic manual. *Impact if wrong:* difficulty variance across sessions → constrain generator parameter ranges after playtesting.
- **A11:** The 2–5 min prep default is sufficient for Experts to orient to a fresh manual. *Impact if wrong:* raise prep default when rulesets are randomized.

### 4.2 epics.md — Proposals B, D & E (approved)

**B1 — New Functional Requirement:**
`FR48: The Facilitator may opt in to play by assigning themselves to a team and role; facilitator authority (round control, pause, retry) is a session-level flag decoupled from team membership and is retained (as a compact overlay mid-round) while playing.`
Epic 9 header/FR-coverage map gain FR48 → Epic 9.

**B2 — New Story 9.5: Facilitator Opt-In Play** (Epic 9). ACs:
1. In the lobby, the Facilitator can assign themselves to Team A/B with a role via the same `TEAM_ASSIGN` path; all facilitator-only authority gates resolve against the facilitator flag on their durable player id (Story 2.7), never against "has no team".
2. When on a team, the Facilitator enters that team's Defuser rotation, reusing 8.9 rotation/equalisation unchanged.
3. While their team's round is live, a compact facilitator overlay (pause/resume; confirm-guarded) replaces the full dashboard; the full dashboard returns between rounds and while their team is resting.
4. Voice follows the played role: Bomb Room while active, Spectator Lounge while resting (3.7/9.4); token re-minted on every transition (3.5), never reused.
5. If the Facilitator-Defuser disconnects mid-round, the existing auto-pause fires (8.7); resume requires their reconnect (durable-id reattach) plus all-ready.
6. 2-player smoke: Facilitator + 1 player on a single team run a full session from two browser tabs total (no separate hosting tab); single-team scoreboard unaffected.

**B3 — Story 9.4 note touch-up:** facilitator watches from the lounge *when not on the active team*.

**D1 — New requirements:**
- `FR49:` Every module's solve logic, reducer rule lookups, and manual pages derive from a shared `RuleSet` data structure (rules-as-data); the classic KTANE v1 ruleset is encoded as data and pinned by golden tests asserting behavior identical to the previously hardcoded rules.
- `FR50:` A per-session `rulesetSeed = hash(sessionId + ":ruleset")` extends the seed chain; one ruleset per session, shared by both teams and all rounds (fairness); the manual renders the active ruleset; retry and the spectator manual-mirror reproduce it exactly. Bomb values remain independently randomized per team per round (FR19 unchanged).
- `FR51:` Every rule generator enforces its module's invariants — first-match totality with guaranteed catch-all (Wires, Button), permutation validity (Simon, Who's on First; Morse word↔frequency bijection), unique-column property (Keypads), well-founded cross-stage references (Memory), exactly-one-reachable-word (Passwords), connected mazes — via pure validators with deterministic bounded retry (derived sub-seeds), covered by property tests.
- `AR17:` Ruleset types, generators, and validators live in `packages/shared/src/rules/` — pure TypeScript, seeded, synchronous, zero infra imports; `getManualPages(ruleset)` renders from the same data the server solves against. Bomb solutions are still never sent to the client; clients receive only manual-visible rule data (public to Experts by design).

**E1 — New Epic 11: Randomized Rulesets** (after Epic 10; FR49–FR51, AR17):
- **Story 11.1 — Rules-as-Data Refactor & Classic Ruleset:** extract every hardcoded rule table across all 11 modules into `RuleSet` data; solve/reducer/manual consume it; classic ruleset = KTANE v1 encoded; golden tests pin zero behavior change. (Pure refactor first — de-risks everything downstream.)
- **Story 11.2 — Ruleset Seed Chain & Session Wiring:** `rulesetSeed` derivation; session-start ruleset generation + Redis storage; manual viewer + spectator mirror render the active ruleset; retry/reattach reproducibility; structured logging of ruleset id (never solutions).
- **Story 11.3 — Rule Generators, Permutation-Safe Modules:** Wires, The Button, Simon Says, Who's on First, Wire Sequences, Morse Code, Complicated Wires — shuffled tables/mappings/orderings with catch-all + bijection invariants; property tests per generator.
- **Story 11.4 — Rule Generators, Constraint-Heavy Modules:** Keypads (unique-column symbol pools), Memory (well-founded stage-reference tables), Passwords (word-list selection), Mazes (connected generated layouts) — each with validator + bounded deterministic retry + property tests.

### 4.3 game-architecture.md — Proposal F (approved)

- Seed-chain section (~line 271): add `rulesetSeed = hash(sessionId + ":ruleset")` above the template→team→module chain, with the note "rules rotate per session; values per team per round; both teams always share one ruleset".
- Decision log: new accepted decision — structure-preserving rule generation, per-session rotation, classic ruleset preserved as golden-pinned data.

### 4.4 sprint-status.yaml — Proposal F (approved)

- Epic 9: add `9-5-facilitator-opt-in-play: backlog`.
- New `epic-11: backlog` block with `11-1` … `11-4` as backlog + `epic-11-retrospective: optional`.

## Section 5: Implementation Handoff

| Change | Scope class | Route | Responsibility |
|---|---|---|---|
| Planning-artifact edits (GDD, epics.md, architecture, sprint-status) | Minor | Developer agent (this session) | Apply Section 4 edits verbatim on final approval |
| Story 9.5 | Moderate | `gds-create-story` → `gds-dev-story` | Carry AC-1's authority-gate constraint and the 2.7/8.9/8.7/3.5/3.7 dependencies into Dev Notes; per house rule, includes a "Jay verifies interactively" subtask (2-player two-tab session) |
| Epic 11 | Major (contained) | `gds-create-story` per story after Epic 10 (or in a parallel worktree if pulled forward) | 11.1 must land before 11.2–11.4; 11.1's golden pin is the safety net; per-module invariants from FR51 go into each story's spec up front (module reducer defect-class checklist applies) |

**Sequencing:** 9.5 joins the current Epic 9 backlog behind 9.4. Epic 11 after Epic 10 (Jay approved the default sequencing).

**Success criteria:**
- 9.5: a 2-player session (Facilitator + 1) runs end-to-end from two tabs; all facilitator gates hold while the Facilitator is on a team; Jay's interactive verification recorded.
- Epic 11: classic-ruleset golden tests green through 11.1; every generated ruleset passes its validators; a full session on a generated ruleset is defusable using only the rendered manual; Jay's interactive verification recorded.
