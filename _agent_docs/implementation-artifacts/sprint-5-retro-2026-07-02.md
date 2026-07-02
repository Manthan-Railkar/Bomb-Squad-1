# Sprint 5 Retrospective — "Relay, resilience & full voice"

- **Date:** 2026-07-02
- **Facilitator:** Link Freeman (Game Developer)
- **Participants:** Jay (Project Lead), Link Freeman (Game Developer), Cloud Dragonborn (Game Architect), Samus Shepard (Game Designer), Paige (Tech Writer)
- **Scope:** Sprint 5 of the sprint plan — planned `8-7`, `8-8`, `8-9`, `8-10`, `3-3`, `3-4`, `3-5`, `3-6`; **+2 added mid-sprint** by the 2026-06-20 correct-course (`8-11` Sequential Round Orchestration, `3-7` Bomb Room→Lounge audio bridge). `3-3`/`3-4`/`3-6` merged from master (Sprint 3 voice track).
- **Note:** Sprint retro, not an epic retro. **Epic 8 reached `done` this sprint** (all 11 stories verified); Epics 3, 4, 5 remain `in-progress` by design (playability-first sequencing). Epic-retrospective keys in `sprint-status.yaml` stay untouched.
- **Verification caveat (per Jay):** `3-5` and `3-7` are `review` with outstanding human audio-verification; this retro proceeds without gating on them (Jay's explicit call).

---

## Sprint Summary

| Metric | Result |
|---|---|
| Stories completed | **7 to `done`** — `8-7` Pause, `8-8` Retry, `8-9` Relay orchestration & odd-team equalisation, `8-10` Scoring/final-scoreboard/persistence, `8-11` Sequential round (Model B), + merged voice `3-3`/`3-4`/`3-6` |
| Stories in `review` | **2** — `3-5` Token re-mint (Task 6 human-verify outstanding; post-review patches changed behaviour → re-verify required), `3-7` Lounge audio bridge (Task 10 ≥3-browser audible verify outstanding) |
| Mid-sprint scope change | **+2 stories** (`8-11`, `3-7`) from the correct-course; **not a replan** — a return to spec |
| Epic 8 | **Closed — `done`.** All of `8-1…8-11` verified |
| Code reviews | 3-layer adversarial (Blind Hunter / Edge Case Hunter / Acceptance Auditor) on every feature story; patches applied before `done` |
| Tests (latest) | shared **237** / server **558** (+2 skipped integration) / client **431** — all green; `tsc --noEmit` clean across all 4 workspaces |
| Blockers | **1 hard** — `RoomServiceClient.forwardParticipant` returns "not implemented" on self-hosted OSS LiveKit (v1.13.1 **and** v1.13.2). Resolved via a `@livekit/rtc-node` relay-bot pivot (Jay decision) |
| Production / host incidents | 0 |

**Delivered:** the complete competitive relay loop. Model-B sequential play (one bomb live, snake `A,B,B,A` alternation, identical layout per pair via `pairIndex` — `8-11`), pause/resume + mid-round disconnect auto-pause scoped to the active team (`8-7`), per-team retry re-arming the exact failed Defuser with better-of-two scoring (`8-8`), relay termination + odd-team equalisation with a volunteer picker (`8-9`), and the terminal state — full-timer failure penalty, `roundOutcomes` history, and single-transaction Postgres archive written only at session end (`8-10`). Plus the voice remainder: listen-only lounge (`3-3`), speaker pills + self-mute (`3-4`), graceful degradation (`3-6`), token re-mint on effective-scope change (`3-5`, in review), and the one-way Bomb Room→Lounge audio relay bot (`3-7`, in review).

> **Milestone B is delivered (pending the two voice verifications):** a complete, multi-round, two-team sequential relay session on the three Easy modules with full voice — the target "shippable for a first internal playtest."

## Sprint 4 Retro Follow-Through

| # | Sprint 4 action item | Status |
|---|---|---|
| 1 | **Escalate the load-modify-store / concurrency theme** (3rd-recurrence escalation) | ✅ **Held.** Race-safe `updateJSON` carried the disconnect-vs-resolution interleaving (`8-7`); durable-`playerId`-not-`socket.id` resolution held across `8-7` reconnect, `3-5`, `3-7`. No new last-write-wins regressions. (1b real-Redis WATCH/MULTI race test still owned by CI-Redis, not yet landed.) |
| 2 | **Every story ships explicit human-validation instructions** | ✅ **Applied from the first story — and it was the sprint's highest-leverage practice.** Every 8.x story carried step-by-step Jay-verify tasks; those runs caught real defects the suite could not (see What Hurt #2). |
| 3 | **Server recomputes displayed `RELEASE` timer digit; never trust client** | ⚠️ **Not exercised** — no Button/`MODULE_INTERACT` digit work in Sprint 5. Remains on the Epic-8 hardening checklist for when a module-interaction story next touches it. |

## What Went Well

1. **The correct-course process worked exactly as designed.** Parallel-defuse was caught in a design Q&A (2026-06-20), not by a customer or a failing test (the suite was green because it asserted the *reinterpreted* behaviour). The proposal gave serialisation an accountable owning story (`8-11`), **embedded the GDD + architecture rationale directly into the AC so the ambiguity can't re-erode**, and sequenced all edits inside one worktree (`8-9 amend → 8-7 → 8-11`) so master never saw parallel defuse. Textbook return-to-spec.
2. **Client/server drift now has a reflex fix: lift to `packages/shared`.** `8-9` lifted the relay predicates; `8-11` put `selectActiveTeam`/`pairIndexFor` in shared; `3-5` lifted the voice-scope helper the server `mintToken` delegates to. Same move three times — it's a standing rule now, not a one-off rescue ([[identity-key-change-needs-client-sweep]] neighbour).
3. **Best-effort-side-effect-after-authoritative-emit is settled discipline.** Pause timer-freeze, session-end archive, and the lounge bridge all persist(authoritative) → emit → then fire-and-forget the risky I/O (`.catch(log)`). A LiveKit/Postgres/timer failure never gates a game transition (`8-7` banner from 3.6 preserved; `8-10` made the Postgres archive the explicit commit point: archive-then-flip-Redis-then-emit).
4. **Jay-decisions-baked-in reduced churn.** `8-10` and `8-11` pre-resolved the contentious calls in the story file *before* dev — full-timer penalty (closing the "fast detonation is cheaper" loophole), normalised `session_rounds` schema, explicit `SESSION_END` event, snake order, seed-by-`pairIndex`. Noticeably fewer mid-dev reversals than `8-9`, which left its client-integration discovery to verification.
5. **Epic 8 closed clean.** All 11 stories `done` and verified. `8-10` is the first and only Postgres writer — single transaction, `ON CONFLICT DO NOTHING` idempotency, verified against real archived rows (full-timer penalty confirmed; winner = lowest cumulative).

## What Hurt

1. **Model B (`8-11`) was a latent landmine under its own worktree-mates.** `8-7` and `8-8` were written and "passing" against `8-9`'s all-teams-advance-together pointer model. When `8-11` moved the pointer advance into `resolveRound`, both **silently regressed** — `8-8` armed the *next* player instead of the one who failed; `8-7` let a *resting*-team player's disconnect pause the *active* team and then block resume on the absent non-participant. Neither surfaced in tests. The file-collision-ordered chain managed **merge** conflicts but not **semantic** ones.
2. **Repeated under-claiming of client work — "server logic correct, client integration gap."** Every 8.x story reached `done` only *after* a Jay interactive run exposed a real defect: swallowed `RELAY_COMPLETE` → dead "Start next round" button, an undriveable odd-team equalisation flow, resting teams rendered as a bare `—` (`8-9`); wrong player armed on retry (`8-8`); invisible Resume button from a non-existent Tailwind token (`8-7`); fractional-ms archive reject (`8-10`). `8-9`'s "no new client surface needed" was flatly wrong.
3. **Voice/LiveKit is the highest-risk, least-test-reachable surface — and it bit hard.** `3-7`'s entire premise, `forwardParticipant`, is unimplemented on self-hosted OSS LiveKit (a Cloud-only RPC present in the SDK + protocol but with no server handler). We only learned this because Jay asked for a **real-container integration test** — it forced a full mechanism pivot to a per-session `@livekit/rtc-node` relay bot (one-way boundary now *structural* via asymmetric tokens). The webhook built in Tasks 6/7 was then removed entirely (bot `autoSubscribe` handles late joiners). ([[livekit-forwardparticipant-not-implemented-oss]], [[livekit-wsl2-localhost-voice-verification]])
4. **"Done" and "verified" are still decoupled for the client/render/audio surface.** jsdom never mounts R3F; TD-5 bots carry no real audio. Two voice stories remain unverified at sprint close.

## Key Insights

1. **When a foundational invariant changes mid-sprint, merge-order hygiene is not enough — you need a *semantic* sweep of every story that encoded the old invariant.** `8-11` changed the pointer model; `8-7`/`8-8` needed active re-checking, not clean merges. This is the root of Action Item 2.
2. **Interactive verification is load-bearing, not a formality — and Sprint 4's Action Item 2 is what made it effective.** It is currently the *only* thing catching client-integration and render defects. This is also the case *for* the client e2e harness (Action Item 1): convert the human-only surface into a runnable gate, exactly as TD-5 did for multiplayer.
3. **A design primitive on self-hosted infra must be proven against the real container before a story is allowed to depend on it.** A vendor SDK method existing ≠ your deployed server implementing it. The real-container integration test is now the required gate for any LiveKit-primitive dependency.
4. **The deferred-ledger keeps generating capability, not just tracking fixes.** Sprint 3: 2.1→TD-1 (test harness). Sprint 4: 8.6-deferral→TD-5 (verification harness). Sprint 5's honest next link is a **client e2e harness** to close the render/integration gap that every 8.x story tripped on.

## Action Items (confirmed by Jay)

| # | Action | Owner | Done when |
|---|---|---|---|
| 1 | **Build/extend a client e2e harness** so R3F-render + socket-flow integration gaps fail in CI, not in Jay's interactive runs. Target the exact recurring shape from this sprint (swallowed error codes → dead buttons, undriveable new UI states, bare-`—` placeholders). Same capability-generation move as TD-1 (tests) and TD-5 (multiplayer): turn a human-only surface into a runnable gate. Likely a new TD story. | Game Developer / Architect | A harness exists that mounts real client components + drives socket flows and would have caught ≥1 of Sprint 5's client-integration defects; wired into CI |
| 2 | **Mandatory semantic re-verify on invariant change.** When a correct-course (or any change) alters a *shared invariant* — e.g. `8-11`'s pointer-advance site, active-team scoping — every already-`done` or in-flight story that encoded the old invariant gets an explicit re-verification task **before the worktree merges**. Merge-clean ≠ semantically-correct. | Game Developer (in correct-course / dev-story) | The next correct-course touching a shared invariant produces re-verify tasks for affected stories, checked before merge |
| 3 | **Real-container integration test is the required gate for any LiveKit/self-hosted-infra primitive** a story depends on. Prove the primitive works on the deployed OSS server (not just the SDK/protocol) before building on it. | Game Developer | Any future story depending on a LiveKit RPC / infra primitive carries a `RUN_*_IT`-gated real-container test proving the primitive before the dependent code lands |

**Carried forward (tracked debt, not blocking Sprint 6):**
- **`3-5` and `3-7` human audio-verification** — Jay's call: Sprint 6 (Medium modules) is disjoint from voice/relay, so these ride as explicitly-tracked `review` items and get verified opportunistically. Closing condition: Jay's ≥3-browser audible run (`3-7`: active speaks→lounge hears; resting/spectator hear each other but NOT into the active bomb room; turn flip swaps rooms; kill voice→game continues. `3-5`: fresh token after reassignment, old connection torn down — **re-verify required because post-review patches changed re-mint behaviour**). Not `done` until observed ([[human-verification-ac-rule]]).

**Deferred (watch, no action this cycle):**
- **`RELEASE.timerDigits` server-recompute** (Sprint 4 AI-3) — still parked; activate when a module-interaction story next touches the displayed-timer path.
- **`updateJSON` real-concurrency test** (Sprint 4 AI-1b) — owned by CI-Redis; add when that infra lands.
- **R3F/3D visual render-correctness eye-only** — folds into Action Item 1 (client e2e harness) rather than a separate visual-regression stack.

## Sprint 6 Preview & Inherited Obligations

**Sprint 6 — Medium modules:** `6-1` Keypads · `6-2` Who's on First · `6-3` Wire Sequences · `6-4` Mazes.

- **Subsystem fault line:** Sprint 6 is pure content (module plugins), **disjoint from Sprint 5's voice/relay surface** — so the two `review` voice stories carry as tracked debt without blocking content work.
- **Prerequisite (from sprint-plan):** *provision the KTANE manual v1 PDF asset first* — glyph/grid/maze references for these four modules.
- **Module discipline holds:** each module needs a reducer **and** a generator registered **plus** a tier-pool entry, or `ROUND_START` throws (`generateLayout` validates the whole pool) ([[module-registry-two-registries-and-tier-pools]]). Copy-the-template pattern (5.3 Wires → Button → Passwords) extends to the Medium tier.
- **No epic-update required:** nothing in Sprint 5 invalidates the Sprint 6 plan. The Model-B correction is fully landed and Epic 8 is closed; the medium-module stories are unaffected.
- **Apply Action Item 1 early** if the client e2e harness is stood up — the Medium modules (Keypads grid, Mazes navigation) are exactly the R3F-interaction surface the harness targets.

## Significant Discovery Check

- **No fundamental epic misalignment for Sprint 6.** The one significant discovery this sprint (`forwardParticipant` unavailable on OSS) was contained within Epic 3 and already resolved via the relay-bot pivot; it does not touch the Medium-module epic.
- **Epic update required before Sprint 6: NO.** Sprint 6 may start once the KTANE manual asset is provisioned.

## Readiness Assessment

- **Quality:** all Sprint 5 gates green (typecheck; shared 237 / server 558 / client 431; builds). Every feature story passed 3-layer adversarial review with patches before `done`. Epic 8 closed.
- **Deployment:** local-only by design. `3-7` proven end-to-end against a **real** LiveKit container (`RUN_LIVEKIT_IT=1` → 2/2: a real lounge peer receives the bot-bridged Bomb-Room track; the Bomb-Room peer never receives a `#bridge` track).
- **Stakeholders:** solo project; Jay's interactive Docker-stack passes are the acceptance mechanism — cleared on `8-7`/`8-8`/`8-9`/`8-10`/`8-11`. Outstanding: `3-5`/`3-7` audio verification.
- **Stability:** no open blockers (the LiveKit blocker is resolved). Known tracked limitations — two voice stories awaiting audio verify, `updateJSON` real-concurrency (CI-Redis), trusted `RELEASE.timerDigits`, R3F visual correctness eye-only (→ Action Item 1), a few deferred asymmetric-team equalisation edge cases logged in `bugs-epic8-2026-06-21.md`.
- **Verdict:** **Sprint 5 is functionally complete and Epic 8 is done.** The competitive Model-B relay loop is delivered end-to-end; the one hard blocker was caught by a real-container test and resolved via the relay-bot pivot. The residual is two voice stories in `review` pending Jay's audio verification — carried as explicit, closing-condition-named debt into Sprint 6 (content), which is disjoint and unblocked once the KTANE manual asset is provisioned.

---

## Commitments Summary

- **Action Items:** 3 (client e2e harness · mandatory semantic re-verify on invariant change · real-container gate for infra primitives)
- **Carried-forward debt:** 1 (`3-5`/`3-7` audio verification — tracked, non-blocking)
- **Next-sprint prerequisite:** 1 (provision KTANE manual v1 PDF before Sprint 6)
