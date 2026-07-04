---
baseline_commit: cfd7913 (9.4 landed: feat 6ed3450 + fix cfd7913; old fb0a061 note superseded — 9.4 WIP now committed)
---

# Story 9.5: Facilitator Opt-In Play

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Facilitator,
I want to optionally join a team and play while keeping my session controls,
so that single-team and 2-player sessions don't need a separate hosting tab.

> **Added 2026-07-04** via `sprint-change-proposal-2026-07-04.md` (FR48, approved by Jay same day). Builds on the durable-identity primitive (2.7), rotation/equalisation (8.9), sequential play (8.11), auto-pause (8.7), and voice re-mint (3.5/3.7) — **all unchanged**. The recent vercel-2p-lite merge (commit 90631b2, single-team bomb-seed fix) confirms single-team play is a live use case this story serves.

## ⚠️ Sequencing: do NOT start until Story 9.4 lands

The working tree currently carries **uncommitted Story 9.4 server WIP** (`sessionHandlers.ts`, `moduleHandlers.ts`, `manualHandlers.ts`, `resolveRound.ts`, `escalateOnStrike.ts`, `pauseTimers.ts`, `state/keys.ts`, new `loungeHandlers.test.ts`) from a parallel session. 9.5 edits `sessionHandlers.ts` and `resolveRound.ts` heavily — starting before 9.4 commits guarantees a collision. **Re-run `git status` before writing code**; all `file:line` references below were verified against baseline `fb0a061` + the 9.4 WIP and will drift once 9.4 commits — re-verify each anchor, the surrounding code is stable enough to re-find by the quoted conditions.

**Carried action item (from sprint-change-proposal §B3 + sprint-status):** reconcile Story 9.4's facilitator-lounge wording — the facilitator watches from the lounge *when not on the active team*. Once 9.4's multiview edit is committed, apply the one-line touch-up in `epics.md` §9.4 and (if needed) 9.4's story file. → Task 7.

## The core design rule (read this before anything else)

Today facilitator authority IS the roster role: `PlayerRole = 'facilitator'` (`packages/shared/src/types/session.ts:3`), there is no flag, and `SessionState` has no facilitator id field. This story splits the concept:

- **`role` answers "what am I playing right now."** When the Facilitator opts onto a team, their roster `role` becomes the assigned play role (`defuser`/`expert`/`spectator`) — exactly like any player, via the same `TEAM_ASSIGN` path and the same `startRound` role-reconciliation mint.
- **A new session-level `facilitatorPlayerId` answers "who holds session authority."** Set once at `SESSION_CREATE` from the durable player id (Story 2.7), never changed, orthogonal to team/role. Every authority gate re-keys to `playerId === state.facilitatorPlayerId`.

**Why this split is the cheap path:** once the opted-in Facilitator's `role` is a real play role, every role-keyed *gameplay* site works with ZERO edits — `moduleHandlers` `role !== 'defuser'` gate, `manualHandlers` `role !== 'expert'` gate, voice `resolveVoiceScope` (bomb-room vs resting-lounge branches), client `ActiveRound` defuser/expert/resting branches, and the 9.4 lounge-audience predicates (all `teamId`-keyed). Meanwhile every site that still checks `role === 'facilitator'` after this story means precisely "the **teamless, non-playing** facilitator" — which is the correct semantics for the lifeline exclusions (9.2/9.3, Jay: the non-playing facilitator never earns/spends) and the voice lounge short-circuit. **The only mandatory edits are the AUTHORITY sites** (10 server gates + client `isFacilitator` derivations) **and the assignment-refusal sites.**

## Acceptance Criteria

(From `epics.md` §Story 9.5, lines 1513–1546 — restated with implementation anchors.)

1. **Lobby self-assign + flag-keyed authority.** In the lobby, the Facilitator can assign themselves to Team A/B with a role via the same `TEAM_ASSIGN` path as any player; they appear in that team's roster with that role. ALL facilitator-only authority gates (`TEAM_ASSIGN`, `PREPARATION_OPEN`, `PREPARATION_CANCEL`, `ROUND_CONFIGURE`, `ROUND_START`, `ROUND_RETRY`, `FACILITATOR_PAUSE`/`RESUME`, `SESSION_END`, `PLAYER_REMOVE`) resolve against the facilitator flag on the durable player id — never against `role === 'facilitator'` and never against "has no team".
2. **Rotation reuse.** When on a team, the Facilitator enters that team's Defuser rotation, reusing 8.9 rotation / `isRelayComplete` / equalisation **unchanged** (they're appended to `relayOrder` by the same `assignPlayerToTeam`; no relay-code edits).
3. **Compact overlay mid-round; full dashboard otherwise.** While their team's round is live, the Facilitator plays their role's surface (bomb or manual) with a compact, **confirm-guarded** facilitator overlay (pause/resume) instead of the full dashboard; the full dashboard surfaces (round config, start/retry/advance/end, lobby controls) return between rounds. *(Reconciled by 9.5 review, Jay's call: while their team is RESTING mid-round they watch from the Spectator Lounge per the §9.4 rule — the original "full dashboard while resting" wording was unimplementable, config/start controls are phase-gated off mid-round anyway. The break-glass pause overlay stays available in the lounge.)*
4. **Voice follows the played role.** Bomb Room while on the active team, Spectator Lounge while resting (3.7/9.4); a fresh LiveKit token minted on every transition (3.5), never reused. (This falls out of the existing scope resolver once `role`/`teamId` are real — verification + un-excluding the facilitator in the client scope deriver.)
5. **Disconnect auto-pause holds.** If the Facilitator-Defuser disconnects mid-round, the existing 8.7 auto-pause fires; resume requires their reconnect (durable-id reattach) plus all players ready. No deadlock: authority is flag-on-durable-id, so the reattached Facilitator can still resume.
6. **2-player smoke.** A 2-player session (Facilitator + 1 player, single team) runs a full session end-to-end from **two browser tabs total** (no separate hosting tab); the single-team scoreboard is unaffected.

## Tasks / Subtasks

<!-- NOT a module story: no reducer/generate/solve — the "Module reducer defect-class checklist"
     (project-context.md → Module System) does not apply literally. Its SPIRIT is speced here:
     the flag lookup is fail-closed (missing/undefined facilitatorPlayerId ⇒ nobody passes an
     authority gate, never "everyone does"); pure transitions keep their never-throw guard
     posture; no new client-trusted authority. -->

- [x] **Task 1 — Shared: the `facilitatorPlayerId` field + authority helper** (AC: 1)
  - [x] Add `facilitatorPlayerId: string` to `SessionState` (`packages/shared/src/types/session.ts:101-169`), doc-commented: *set once at SESSION_CREATE from the durable player id; the sole source of facilitator authority; orthogonal to `role`/`teamId`, survives the ROUND_START role mint*. `SessionState` is broadcast wholesale via `SESSION_STATE`, so the client gets it for free — no new event.
  - [x] Add a pure helper `isSessionFacilitator(state: SessionState, playerId: string | null | undefined): boolean` in `packages/shared` (beside the session types or `packages/shared/src/session/`) — `playerId != null && playerId === state.facilitatorPlayerId`. **Fail-closed:** `null`/`undefined`/missing field ⇒ `false`, never throws. Use it on BOTH sides — one predicate, zero drift (the identity-key-change lesson from 2.7: server gates AND client self-identification must move together).
  - [x] Set it in `createSessionState` (`apps/server/src/session/createSession.ts:38-58` already receives `facilitatorId`) — `facilitatorPlayerId: facilitatorId`. No other construction site exists (verify with a grep for `SessionState` literals in tests and update fixtures).
  - [x] Tests: shared — helper truth table (match / non-match / null / undefined / empty-string id). Update every test fixture that builds a `SessionState` literal (compiler will enumerate them).

- [x] **Task 2 — Server: re-key the 10 authority gates + fix the role-mint landmine** (AC: 1, 5)
  - [x] Replace all ten identical gates `state.players[socket.data.playerId ?? '']?.role !== 'facilitator'` with `!isSessionFacilitator(state, socket.data.playerId)` in `sessionHandlers.ts` — TEAM_ASSIGN `:1049`, PREPARATION_OPEN `:1177`, SESSION_END `:1299`, ROUND_CONFIGURE `:1417`, PREPARATION_CANCEL `:1517`, ROUND_START `:1579`, ROUND_RETRY `:1862`, FACILITATOR_PAUSE `:1940`, FACILITATOR_RESUME `:1990`, PLAYER_REMOVE `:2060`. Keep error codes/messages unchanged (client copy depends on nothing here, but tests pin the codes).
  - [x] **The role-mint landmine (why the flag is mandatory):** `startRound.ts:135-143` role-reconciliation overwrites the committed Defuser's role to `'defuser'` and demotes other on-team `'defuser'`s to `'expert'` — it guards on `teamId === undefined`, NOT role, so a teamed Facilitator IS minted and the `'facilitator'` role marker is destroyed. That is now **correct and intended** (role = play role). Update the stale doc comment at `startRound.ts:39` ("the facilitator is never touched" — false once teamed). Same pass exists in `startRetryRound` (`startRound.ts:190-197`) and `designateEqualisationVolunteer` (`equalisationVolunteer.ts:74-81`) — no code change, just verify + comment.
  - [x] **Reattach record:** SESSION_CREATE stores `role: 'facilitator'` in the reattach record (`sessionHandlers.ts:842-843`). Audit the reattach path: the roster (`state.players[playerId]`) must be the authority for current role on reconnect — a Facilitator who reattaches mid-round as the committed Defuser must come back as `'defuser'`, not be reset to `'facilitator'`. Also verify `joinSession.ts`'s "facilitator re-joining can never demote their role" comment (`joinSession.ts:18-19`) still holds semantically (the protection now lives in the flag, not the role).
  - [x] **PLAYER_REMOVE self-target:** decide-and-pin — the Facilitator must NOT be able to remove *themselves* (orphans the session's only authority). If no self-target guard exists today (facilitator rows had no controls, so it was unreachable), add one: refuse `PLAYER_REMOVE` where `payload.playerId === state.facilitatorPlayerId`, typed error. (DD4)
  - [x] Tests (integration, `testSocketServer` — follow the gate tests already pinning each handler): for EVERY one of the 10 gates — (a) a Facilitator **on a team as `defuser`** is still authorized; (b) a non-facilitator `defuser` is still refused; (c) fail-closed: a session state without the field / a null playerId is refused. Plus: reattached Facilitator-Defuser keeps authority (flag keys on durable id); PLAYER_REMOVE refuses the facilitator as target.

- [x] **Task 3 — Server: open the assignment path** (AC: 1, 2)
  - [x] `assignTeam.ts:45` — delete the `if (player.role === 'facilitator') return state;` guard (and rewrite the doc comment at `:36-41`); the function already does everything else right (appends to `relayOrder`, lazily creates the team, sets `{teamId, role}`).
  - [x] `sessionHandlers.ts:1067` — remove the TEAM_ASSIGN target guard (`INVALID_ASSIGNMENT` "The facilitator doesn't sit on a team."). The `JOINABLE_ROLES = ['defuser','expert','spectator']` payload whitelist (`:216`, `:332-334`) stays — `'facilitator'` is still never an *assignable* role; the seat is mint-only.
  - [x] Confirm rotation inclusion needs **zero relay edits**: `relay.ts` (`hasNaturalSlot:72`, `equalisationRoundsOwed:91`, `isRelayComplete:116`, `selectActiveTeam:158-176`) draws purely from `relayOrder`/`currentDefuserIndex` — the appended Facilitator is an ordinary slot and counts toward `MIN_TEAM_SIZE`/`maxRelayLength`. Pin with a test, don't re-implement.
  - [x] **No opt-out path in 9.5** (DD2): once teamed, the Facilitator can be *moved* between teams / re-roled in the lobby like any player, but there is no "return to teamless facilitator" affordance. Document in Dev Notes; a future story adds it if Jay wants it.
  - [x] Tests: shared/unit — `assignPlayerToTeam` now assigns the facilitator (teamId+role set, relayOrder appended, idempotent re-assert still same-ref no-op). Integration — facilitator self-`TEAM_ASSIGN` succeeds in lobby, refused mid-round (existing phase guard `:1112-1119` unchanged); after assignment a `ROUND_START` from the (now-teamed) facilitator still passes its gate; the facilitator appears in `relayOrder` and is committed as natural Defuser when their index comes up; `isRelayComplete` true only after they've defused.

- [x] **Task 4 — Server: participant-flow consequences (pause/ready/lifelines)** (AC: 5)
  - [x] **Auto-pause + resume — verify, don't build:** `autoPauseOnDisconnect` (`sessionHandlers.ts:700-755`) keys on the dropper's `teamId === activeTeamId`; `isActiveParticipant` (`pauseSession.ts:38-41`) and `canResume` (`pauseSession.ts:118-123`) key on `teamId` — a teamed Facilitator is automatically a counted participant. The old deadlock (role-keyed resume gate + minted role ⇒ nobody can resume) is dissolved by Task 2's flag re-key. Pin the full loop with a test.
  - [x] **Lifelines for a teamed facilitator (DD3, AFK-default):** re-key the two 9.2/9.3 exclusions so a Facilitator **playing on the resting team** earns/spends like any resting player, while the **teamless** facilitator stays excluded (Jay's 9.4 decision). Because role is now the play role, the existing checks *almost* work already — but make the intent explicit and pinned: earner predicate `resolveRound.ts:304` (`p.role !== 'facilitator' && p.teamId !== activeTeamId`) and spend gate `lifelineHandlers.ts:104-111` (`player.role === 'facilitator' || …`). A teamed facilitator's role is `defuser`/`expert`/`spectator`, so both checks pass them naturally — **leave the code as-is**, add tests pinning: teamed-facilitator-on-resting-team EARNS and may SPEND; teamless facilitator earns/spends NOTHING. (If Jay overrides DD3 to "facilitator never earns even when playing", the re-key is `!isSessionFacilitator(...)` added to both predicates — one line each.)
  - [x] Tests: integration — facilitator-Defuser disconnect mid-round → `pauseKind:'disconnect'`, they appear in `disconnectedPlayerIds`; reattach (durable id) + all-ready + their own `FACILITATOR_RESUME` resumes; lifeline pins above.

- [x] **Task 5 — Client: re-key authority derivations + surface routing** (AC: 1, 3)
  - [x] Add a tiny client selector (e.g. in `gameStore` or a `ui/selectors.ts`): `selectIsFacilitator = isSessionFacilitator(session, myPlayerId)` using the shared helper — then sweep EVERY `self?.role === 'facilitator'` authority derivation to it: `Lobby.tsx:148`, `RoundConfigPanel.tsx:94`, `PauseOverlay.tsx:42-43`, `Scoreboard.tsx:115-116`, `Preparation.tsx:92-93`. (Client-side lesson from the 2.7 sweep [[identity-key-change-needs-client-sweep]]: there is no component-test harness that catches a missed site at compile time — grep exhaustively for `'facilitator'` in `apps/client/src` and classify every hit as authority (re-key) vs play-role/display (keep).)
  - [x] **Display sites that keep `role === 'facilitator'`** (they now mean "teamless non-playing host", still correct): `ActiveRound.tsx:123-139` fallback branch + lifeline gating `:134,137`; roster badge/sort (`Lobby.tsx:265`, `sortRoster:83-89` — but see next bullet); copy `ROLE_FACILITATOR`. For the roster, a teamed facilitator should still be visibly the host — add a small "Host" chip keyed on the flag (reuse existing badge styling; `copy.ts` string), since their role label will now read Defuser/Expert.
  - [x] **Lobby self-assign UI:** `Lobby.tsx:272` hides team chips/role-select/remove for the facilitator's row — change the condition so the facilitator viewer gets team chips + role select on their OWN row too (`ASSIGNABLE_ROLES:52` unchanged — no 'facilitator' option). Keep Remove hidden for the facilitator row (Task 2's server guard is the backstop). Team badge `:265` shows once they have a team.
  - [x] **ActiveRound routing needs almost nothing:** a teamed facilitator hits the existing defuser (`:106-111`) / expert (`:112-122`) / resting (`:91-105`) branches naturally (they key on `role`+`teamId`/`isResting`). Update the stale comment at `:70-71` ("the facilitator is never 'resting'" — now false when teamed). The teamless facilitator still falls to the fallback (9.4 will mount `SpectatorLounge` there; do not fight that edit — coordinate if 9.4 landed first).
  - [x] **Compact overlay = `PauseOverlay`, re-keyed + confirm-guarded (DD1):** `PauseOverlay` already floats over every surface (`ActiveRound.tsx:155`, `Scoreboard.tsx:175`) and renders the break-glass Pause for `isFacilitator` (`PauseOverlay.tsx:51-60`) — after the flag re-key it appears on the playing facilitator's bomb/manual surface automatically. AC-3 requires **confirm-guarded**: wrap the one-click Pause emit in the `ConfirmButton` two-step pattern (`ConfirmButton.tsx:36-103`) or an equivalent arm→confirm on the existing button (keep `data-testid="facilitator-pause"`; keep the 20%-opacity break-glass styling, EXPERIENCE.md:134). Resume already lives behind the paused-state strip (`:87-95`) — a paused state is itself the confirm context; leave it one-click (matches 8.7 UX).
  - [x] **Full dashboard "returns between rounds" is free:** the dashboard is phase surfaces (`Lobby`/`Scoreboard`/`Preparation`/`RoundConfigPanel`), routed by `session.status` in `App.tsx:109-121` — a playing facilitator leaves `ActiveRound` at round end like everyone and lands on `Scoreboard` where the re-keyed controls render. **Preparation:** keep routing the facilitator (flag) to the operator prep view (`Preparation.tsx:127-166`) — they must be able to start the round; that view already lists "on the bomb next". (DD5: if Jay prefers the player prep surface + a compact start control when teamed, that's a swap inside `Preparation.tsx`; AFK-default = operator view, it's between-rounds context, not mid-round.)
  - [x] **Ready affordance:** `PauseOverlay.tsx:32-34` `isParticipant` = has `teamId` — the teamed facilitator is automatically asked to ready-up during a disconnect pause and counted in `allReady` (`:69-80`). Also verify the lobby ready toggle (`Lobby.tsx:183-186,335-347`) renders for them (it keys on self row, not role — verify, don't assume).
  - [x] Tests (jsdom, TD-1 pattern): Lobby — facilitator sees chips/select on own row, assigning self emits `TEAM_ASSIGN{playerId: self}`; with the flag but role `'defuser'`, RoundConfigPanel/Scoreboard/Preparation still render facilitator controls, and a non-facilitator defuser does NOT. ActiveRound — teamed facilitator w/ role `defuser` + active team renders `BombStage`; role `expert` renders `ManualViewer`; resting team renders the resting branch; teamless facilitator unchanged fallback. PauseOverlay — Pause is confirm-guarded (arm→confirm emits once); playing facilitator sees it over the bomb surface; teamed facilitator gets the "I'm ready" affordance when another participant drops.

- [x] **Task 6 — Voice: verify the scope chain end-to-end** (AC: 4) — mostly verification, one real edit
  - [x] **The one real edit:** client `deriveDesiredScope` (`voice/computeVoiceAction.ts:60-87`) hard-excludes by role — `isBombRoomParticipant` = `defuser|expert` + teamId, everything else (incl. `'facilitator'`) → `null` → `VoiceController` renders nothing (`VoiceController.tsx:88`). A TEAMED facilitator has a real play role so they're covered mid-session; but pre-assignment and post-opt-in-lobby states must not regress. Verify each transition resolves a non-null scope where the shared resolver has one: `resolveVoiceScope` (`packages/shared/src/voice/scope.ts:141-189`) — lobby branch `:148-150`; facilitator/spectator → lounge `:160-162`; bomb-room roles: resting → lounge `:176-182`, active → `bomb-room:{sessionId}:{teamId}` `:183`. Decide with the code in front of you whether `deriveDesiredScope` should stop `null`-ing the facilitator entirely (aligning client with shared, which already grants the teamless facilitator a lounge scope) — **do not** change `scope.ts` branch order; the `role === 'facilitator'` short-circuit at `:160` is correct now that it only ever matches the teamless host.
  - [x] Re-mint on transitions is already the 3.5 machinery: `useVoiceScopeSync.ts:43-67` reconnects when the resolved scope changes on any `SESSION_STATE` (TEAM_ASSIGN, ROUND_START role mint, turn flip). Verify: opt-in in lobby (lobby room, no change) → round starts with their team active as defuser (→ bomb-room, fresh token) → their team rests next round (→ lounge, fresh token) → between rounds. No token reuse (server mints per `VOICE_TOKEN` request, `voiceHandlers.ts:68-168` — resolves role/team from the durable id, so it's automatically correct post-mint).
  - [x] Tests: unit on `deriveDesiredScope`/`computeVoiceAction` — facilitator+teamId+`defuser`+activeTeam ⇒ bomb-room publish; same but resting ⇒ lounge; teamless facilitator ⇒ (per the decision above) lounge or unchanged `null`, pinned either way. Live two-browser voice is NOT e2e-able (see [[livekit-wsl2-localhost-voice-verification]]) — scope-resolution units + Jay's interactive check cover AC-4.

- [x] **Task 7 — Docs reconciliation (carried action item)** (AC: —)
  - [x] After 9.4's edits are committed: apply sprint-change-proposal §B3 — in `epics.md` §9.4 (and 9.4's story file if the wording appears there), scope the facilitator-lounge note to *"when not on the active team"*. One-line edits; do not touch 9.4's ACs otherwise.
  - [x] Update `_agent_docs/game-architecture.md` API table (`TEAM_ASSIGN | Facilitator only` etc., ~line 462-470) authority-column wording: "Facilitator only" now means the flag-holder. One-line note, not a rewrite.

- [ ] **Task 8 — Tests + typecheck + e2e + regression sweep** (AC: 1–6)
  - [x] `pnpm -w typecheck` clean (no `@ts-ignore`); full shared + server + client suites green. The `SessionState` field addition will break fixtures across suites — fix them all, no `as any`.
  - [x] **Regression (critical):** all 10 gate tests re-pass for the plain (teamless) facilitator; a non-facilitator can still do nothing facilitator-only; 8.9 relay/equalisation suites untouched and green; 8.7 pause suites green; 9.2/9.3 lifeline suites green (teamless facilitator still excluded); 9.4 lounge tests (if landed) green — the lounge audience is `teamId`-keyed so a teamed facilitator on the resting team is in the lounge, on the active team is NOT.
  - [x] **e2e (TD-6 harness, `apps/client/e2e/`) — the 2-player smoke (AC-6):** extend the `full-session.spec.ts` two-context pattern (facilitator page + one `browser.newContext()` player; identity is per-context sessionStorage — never share a context). Flow: host → facilitator assigns SELF to Team A as expert + player "Ada" as defuser → configure wires-only → start → Ada solves (canvas seam) → between rounds → facilitator starts round 2 where rotation makes the FACILITATOR the Defuser → facilitator solves via canvas → session end → single-team scoreboard renders both rounds. Assert mid-round: facilitator sees the manual (round 1) / bomb (round 2), the confirm-guarded pause affordance is present and works (pause → resume), and `ROUND_START`/`SESSION_END` from the facilitator succeed while teamed. Reuse `hostSession`/`spawnBots`/`assignTeam`/`confirmTwoStep` helpers; add a helper to target the facilitator's own roster row. *(Implemented as a new spec `facilitator-opt-in-play.spec.ts`; no bots needed — Team A = {Ada, Facilitator} meets MIN_TEAM_SIZE. 27/27 e2e green.)*
  - [ ] **Human verification (Jay)** — ⏳ PENDING (story stays `review` until confirmed, per [[human-verification-ac-rule]]). [[human-verification-ac-rule]]: on the full Docker stack, a real 2-tab session — tab 1 Facilitator, tab 2 one player, single team. Confirm: (a) lobby: you can put yourself on Team A with a role; (b) you play your role mid-round with the compact confirm-guarded pause overlay (pause + resume it once); (c) full dashboard is back between rounds (config/start/retry/end); (d) voice: bomb-room audio while playing, lounge while the other team plays (needs a 2-team variant or skip if single-team); (e) kill your own tab mid-round as Defuser → auto-pause; reopen → reattach, ready-up, resume; (f) finish the session — scoreboard correct. Record the observed result in Completion Notes — **not done until Jay confirms**.

### Review Findings (adversarial review 2026-07-04, baseline cfd7913)

- [x] [Review][Decision] AC-3 wording vs shipped resting-facilitator routing — epics §9.5 AC3 and this story's AC3 promise "the full dashboard … while their team is resting", but the implementation routes the resting-team facilitator to the Spectator Lounge (`ActiveRound.tsx:68-76`, pinned by test), matching the reconciled §9.4 note ("watches from the lounge when not on the active team"). The two spec docs now contradict each other; either accept the lounge behavior and fix the §9.5 AC text, or change the code.
- [x] [Review][Decision] Preparation phase: teamed facilitator sees ONLY the operator prep view — the `isFacilitator` branch in `Preparation.tsx:129` returns before the upcoming-Defuser bomb-orientation view (4.6) and the Expert prep manual. Newly reachable via 9.5 (the diff's own e2e round 2 hits it: the facilitator enters the live bomb with no orientation prep). DD5 says "operator prep view kept" but is ambiguous on *exclusively*. Options: keep operator-only (DD5 letter) or add the play-role prep surface alongside the operator controls.
- [x] [Review][Decision] `facilitatorPlayerId` speced required, shipped optional — Task 1 speced `facilitatorPlayerId: string` (compile-time fixture enumeration); shipped as `?: string` for pre-9.5 snapshot honesty (`types/session.ts`). Optional + fail-closed helper works, but future `SessionState` literals can silently omit the flag and every gate refuses the host at runtime with zero compile signal. Options: keep optional (recommend; matches `activeTeamId` precedent, wire-honest) and note the deviation, or make it required per spec.
- [x] [Review][Patch] Stale-armed break-glass Pause bypasses the confirm guard [apps/client/src/ui/PauseOverlay.tsx:59-66] — `pauseArmed` resets only in the `!isFacilitator || !canPause` branch; when `pausedAt !== null` renders the paused strip, the armed flag survives. Arm → teammate drops (auto-pause) → resume ⇒ button returns already-armed and ONE stray click pauses — the exact one-click detonation AC-3/DD1 guards against. Fix: clear the armed flag whenever the button is not rendered (also subsumes the render-phase-setState idiom nit; the Escape handler is near-dead code given blur-disarm — tidy while there).
- [x] [Review][Patch] Client Resume gate stricter than server for a resting-teamed facilitator [apps/client/src/ui/PauseOverlay.tsx:35,102-113] — client `isParticipant`/`allReady` count EVERY teamed player; server `canResume` counts only the ACTIVE team (`pauseSession.ts:118-123`). A facilitator on the resting team during a disconnect pause sees Resume disabled even when the server would accept `FACILITATOR_RESUME`. Fix: scope the client predicate to `session.activeTeamId` (mirror Model B), including `facilitatorNeedsReady`.
- [x] [Review][Patch] AC-5 socket-level integration test missing (Task 4 marked [x]) [apps/server/src/handlers/__tests__/sessionHandlers.test.ts] — the speced loop (facilitator-Defuser disconnect → `pauseKind:'disconnect'` + `disconnectedPlayerIds`; durable-id reattach + all-ready + own `FACILITATOR_RESUME` resumes) is pinned only at pure-unit level (`pauseSession.test.ts`) and jsdom. Add the `testSocketServer` integration test.
- [x] [Review][Patch] `equalisationVolunteer.ts` verify+comment subtask not delivered [apps/server/src/session/equalisationVolunteer.ts:74-81] — Task 2 speced a comment noting the mint pass intentionally overwrites a teamed facilitator's role marker; file is untouched.
- [x] [Review][Patch] `isRelayComplete` facilitator pin missing (Task 3) — "true only after they've defused" is unpinned; the gate-matrix SESSION_END test hand-seeds an already-complete relay and never asserts the false-before half. Add the relay test.
- [x] [Review][Patch] Duplicate import from `@bomb-squad/shared` [apps/server/src/handlers/sessionHandlers.ts:51-52] — merge `undersizedTeams` and `isSessionFacilitator` into one import.
- [x] [Review][Patch] Lifeline spend test narrower than its comment claims [apps/server/src/handlers/__tests__/lifelineHandlers.test.ts] — comment says "'spectator'/'expert'" but only `role = 'spectator'` is exercised; fix the comment or add the expert variant.
- [x] [Review][Defer] No opt-out from opt-in (one-way door) [apps/client/src/ui/Lobby.tsx:302-360] — a mis-click on the host's own team chip is irreversible for the session (team-to-team moves only; Remove hidden + server-refused, DD4). Speced as out of scope (DD2, future story) — deferred by design.
- [x] [Review][Defer] No backfill for pre-9.5 Redis session snapshots — a session persisted before this deploy has no `facilitatorPlayerId`; fail-closed means all ten gates refuse everyone forever (worst case: a paused pre-9.5 session can never be resumed nor ended). Speced behavior (fail-closed is the Task 1 constraint) and sessions are ephemeral dev-stage state — recorded so it is a conscious accept, not an oversight.

## Dev Notes

### What already works with ZERO edits (verify-and-pin, do not rebuild)

- **Rotation/equalisation (8.9):** `relay.ts` is entirely `relayOrder`-driven, role-agnostic. `assignPlayerToTeam` appends the facilitator like anyone. (`relay.ts:56-176`)
- **Round orchestration (8.11):** `startRound` natural pick (`relayOrder[currentDefuserIndex]`, `startRound.ts:107`), equalisation volunteer (`:119`), per-role payload delivery (BOMB_INIT via `bombAudience`, EXPERT_CHAPTER_ASSIGNMENT) — all `teamId`/`role`/socket-keyed.
- **Auto-pause/resume mechanics (8.7):** `autoPauseOnDisconnect` + `isActiveParticipant` + `canResume` all `teamId`-keyed (`sessionHandlers.ts:728-734`, `pauseSession.ts:38-41,118-123`).
- **9.4 lounge audience (once landed):** `loungeRoom`/`bombAudience` + join loops key on `teamId !== activeTeamId` — a teamed facilitator flows correctly through lounge/team rooms.
- **Module/manual authority:** `moduleHandlers.ts:131` (`role !== 'defuser'`), `manualHandlers.ts:93` (`role !== 'expert'`) — the minted play role passes them.
- **Voice scope shared resolver:** `scope.ts` routes by role+teamId+activeTeam; the `'facilitator'` short-circuit (`:160`) only ever matches the teamless host post-story.

### The three genuine hazards (each maps to a task)

1. **Role-mint destroys the marker** (`startRound.ts:138-139` overwrites role for ANY teamed player, guard is `teamId === undefined` not role; doc comment at `:39` claims otherwise — it's wrong). Without the flag, the facilitator loses all authority at their first ROUND_START on a team. → Task 1/2.
2. **Resume deadlock:** facilitator-Defuser drops → auto-pause; resume gate is facilitator-only. Role-keyed authority + minted role = nobody can ever resume. Flag on durable id + reattach dissolves it. → Task 2/4.
3. **Client sweep completeness:** every client `isFacilitator` derivation is `self?.role === 'facilitator'` — all silently false once teamed; the dashboard controls would vanish for the playing facilitator with no compile error and no component test to catch it [[identity-key-change-needs-client-sweep]]. Grep-sweep + jsdom pins. → Task 5.

### Sites keyed on `role === 'facilitator'` — classification table

| Site | Meaning post-story | Action |
|---|---|---|
| 10 gates `sessionHandlers.ts:1049,1177,1299,1417,1517,1579,1862,1940,1990,2060` | AUTHORITY | re-key to flag (Task 2) |
| `assignTeam.ts:45` + `sessionHandlers.ts:1067` guard | assignment refusal | delete (Task 3) |
| `JOINABLE_ROLES` `:216,332` / `ASSIGNABLE_ROLES` `Lobby.tsx:52` | 'facilitator' never assignable | keep |
| `resolveRound.ts:304`, `lifelineHandlers.ts:104-111` | teamless host never earns/spends | keep + pin (Task 4, DD3) |
| `scope.ts:160` lounge short-circuit | teamless host → lounge | keep |
| `computeVoiceAction.ts:67-70` client null-scope | over-broad exclusion | edit (Task 6) |
| Client `isFacilitator` derivations (`Lobby:148`, `RoundConfigPanel:94`, `PauseOverlay:42`, `Scoreboard:115`, `Preparation:92`) | AUTHORITY | re-key to flag (Task 5) |
| `ActiveRound.tsx:123-139` fallback + `:134,137` lifeline gating; roster badge/sort | teamless host display | keep (+ "Host" chip) |
| `createSession.ts:44`, reattach record `sessionHandlers.ts:842` | initial mint | keep role; add flag (Task 1/2) |

### Fail-closed posture (defect-class SPIRIT for a non-module story)

- `isSessionFacilitator` returns `false` on any missing/null input — a session snapshot without the field (e.g. an in-flight Redis session created pre-deploy) locks authority rather than granting it to everyone. V1 posture: sessions are ephemeral; a stale in-flight session is re-created, not migrated. Document in the helper comment.
- No pure transition gains a throw path; `assignPlayerToTeam` keeps its guard-and-return-same-ref discipline.
- Never trust the client: the flag lives server-side in `SessionState`; the client copy is display-only (server re-checks every gate).

### Out of scope (do not gold-plate)

- **No opt-out** back to teamless facilitator (DD2) — lobby re-assignment between teams suffices for v1.
- **No dedicated in-round facilitator dashboard** (mockup `6. Facilitator Dashboard.html` remains future; the compact overlay is the re-keyed, confirm-guarded `PauseOverlay`).
- **No facilitator PTT bridge** (deferred-work.md:194 — separate story), **no Epic 11 ruleset work** (same proposal, sequenced after Epic 10).
- **No relay/equalisation changes**, no scoring changes (single-team scoreboard already works post-90631b2).

### Testing standards summary

- Pure transitions (`assignTeam`, `startRound`, `pauseSession`, helper) — Jest unit, zero infra (`apps/server/src/session/__tests__/`, `packages/shared/src/__tests__/`).
- Handler gates + flows — integration via `apps/server/src/handlers/__tests__/testSocketServer.ts` (follow the existing per-gate specs; 10 gates × {teamed-facilitator-passes, non-facilitator-refused, fail-closed}).
- Client — jsdom (TD-1): Lobby self-assign, control rendering by flag-not-role, ActiveRound routing, PauseOverlay confirm-guard + ready affordance.
- Full-AC — Playwright e2e (TD-6): the 2-player two-tab smoke. Note [[timer-verification-tsx-watch-gotcha]] if verifying timers manually: run the server without `tsx watch`.
- Forbidden: `Math.random()`/`Date.now()` in new logic; untyped `socket.emit(string, any)`; any client-trusted authority; `as any` on fixture updates.

### Project Structure Notes

- **Modified shared:** `packages/shared/src/types/session.ts` (`facilitatorPlayerId`), new helper file (e.g. `packages/shared/src/session/facilitator.ts`) + barrel export.
- **Modified server:** `apps/server/src/session/createSession.ts` (set field), `session/assignTeam.ts` (drop guard), `handlers/sessionHandlers.ts` (10 gate re-keys, drop `:1067` guard, PLAYER_REMOVE self-guard, reattach audit), `round/startRound.ts` (comment fix only) — plus test fixture sweeps. **All after 9.4 lands.**
- **Modified client:** `apps/client/src/ui/Lobby.tsx` (self-assign row, Host chip), `ui/PauseOverlay.tsx` (flag re-key + confirm-guard), `ui/RoundConfigPanel.tsx`, `ui/Scoreboard.tsx`, `ui/Preparation.tsx`, `ui/ActiveRound.tsx` (comment + verify routing), `voice/computeVoiceAction.ts` (facilitator scope), `ui/copy.ts` (Host chip + any overlay strings), store selector.
- **New e2e:** `apps/client/e2e/flows/facilitator-opt-in-play.spec.ts` (or extend `full-session.spec.ts` — prefer a new spec; keep the existing green).
- **Naming:** field `facilitatorPlayerId`; helper `isSessionFacilitator` (shared, camelCase); no new events, no new Redis keys.

### Project Context Rules

- **Server-authoritative:** authority is the server-side flag; every gate re-validates. Client input untrusted (project-context Security).
- **Pure boundaries:** `createSession`/`assignTeam`/`pauseSession` stay pure (no I/O/clock/randomness); handlers own I/O (parse→load→reduce→persist→emit).
- **Typed events both sides:** no new events needed — `SESSION_STATE` carries the new field via the shared type. Never `socket.emit(string, any)`.
- **State boundaries:** the flag lives in the `SessionState` Redis blob; no Postgres, no new keys, O(1) unchanged.
- **Voice:** tokens re-minted on every scope transition, never reused (3.5 rule; ADR-007); lounge/bomb-room boundary structural.
- **TypeScript:** `tsc --noEmit` clean; per-workspace tsconfigs; no `@ts-ignore`.
- **Testing boundaries:** pure logic in Node/Jest; handlers via TestSocketServer; e2e in `apps/client/e2e/` (TD-6).

### Previous-story intelligence (9.1–9.4 + reviews)

- **9.1/9.2/9.3 review pattern:** every review found round-phase/authority-gate gaps and stale-state hygiene — spec gates as tests UP FRONT (this story's 10×3 gate matrix does exactly that). 9.3 added a round-phase gate to LIFELINE_SEND; nothing here loosens it.
- **9.2 counter-desync lesson:** modifier/config re-delivery on reattach matters — the reattach audit in Task 2 is the analogue (roster role vs stored record).
- **9.4 (in progress):** its lounge audience predicates are deliberately `teamId`-keyed — the exact pattern this story relies on; its DD4 ("the facilitator watches the lounge") is scoped by this story to *when not on the active team* (Task 7 reconciliation). Do not edit 9.4's WIP files until it lands.
- **8.6 decision (c) (deferred-work.md:131):** relay rotation is the SOLE Defuser authority; the lobby role pick distinguishes participant-vs-spectator only. The facilitator's opt-in role pick follows the same rule — picking `defuser` in the lobby does not promise defusing a specific round.
- **Git intelligence:** recent commits are 9.2/9.3 review-hardening on these same handler files (fb0a061, 3f0569c) — the gate-test conventions to follow are fresh in `sessionHandlers`' test suites; 90631b2 merged the single-team/2-player path this story completes.

### Web research

No new libraries, no version changes — this story is purely internal patterns (Socket.IO rooms, Zustand, existing LiveKit mint flow). The LiveKit re-mint rule (never reuse tokens across role change) is already codified in ADR-007/project-context; no upstream API change affects it (SDK pinned; see 3.x stories).

### References

- [Source: _agent_docs/planning-artifacts/epics.md:1513-1546] (Story 9.5 — user story + BDD ACs + FR48 note)
- [Source: _agent_docs/planning-artifacts/epics.md:88] (FR48 definition)
- [Source: _agent_docs/planning-artifacts/sprint-change-proposal-2026-07-04.md §2-§5] (impact analysis, Jay's decisions, handoff — AC-1 authority-gate constraint + 2.7/8.9/8.7/3.5/3.7 dependency list; §B3 carried action item)
- [Source: _agent_docs/planning-artifacts/gdds/gdd-Ktane-2026-06-09/gdd.md:495-501,526] (Facilitator controls incl. opt-in play; rotation amendment)
- [Source: _agent_docs/planning-artifacts/ux-designs/ux-Ktane-2026-06-10/EXPERIENCE.md:34-35,84,134] (facilitator surface routing; pause strip; break-glass pause at 20% opacity)
- [Source: _agent_docs/game-architecture.md:456-495] (event surface + authority checks; Pattern 7 voice topology; ADR-007)
- [Source: packages/shared/src/types/session.ts:3,28-34,101-169] (PlayerRole; PlayerInfo; SessionState — add `facilitatorPlayerId`)
- [Source: apps/server/src/session/createSession.ts:22,38-58] (facilitatorId in; role mint; seed the flag here)
- [Source: apps/server/src/session/assignTeam.ts:42-85] (pure assignment — delete the `:45` facilitator guard)
- [Source: apps/server/src/handlers/sessionHandlers.ts:1049,1177,1299,1417,1517,1579,1862,1940,1990,2060] (the 10 authority gates to re-key)
- [Source: apps/server/src/handlers/sessionHandlers.ts:216,332-334,1067,1112-1119] (JOINABLE_ROLES; TEAM_ASSIGN payload/target/phase guards)
- [Source: apps/server/src/handlers/sessionHandlers.ts:700-755,826,842-843] (autoPauseOnDisconnect; identity mint; reattach record)
- [Source: apps/server/src/round/startRound.ts:39,89-156,169-214] (role-reconciliation mint — the landmine; stale comment)
- [Source: apps/server/src/round/equalisationVolunteer.ts:74-81] (same mint pass)
- [Source: apps/server/src/session/pauseSession.ts:38-41,118-123] (isActiveParticipant; canResume — teamId-keyed)
- [Source: packages/shared/src/session/relay.ts:56-176] (rotation/equalisation — role-agnostic, zero edits)
- [Source: apps/server/src/round/resolveRound.ts:304, apps/server/src/handlers/lifelineHandlers.ts:104-111] (lifeline earner/spend predicates — DD3)
- [Source: packages/shared/src/voice/scope.ts:141-189] (resolveVoiceScope branch order; facilitator short-circuit `:160`)
- [Source: apps/client/src/voice/computeVoiceAction.ts:60-87,129 + apps/client/src/voice/useVoiceScopeSync.ts:43-67 + apps/client/src/ui/VoiceController.tsx:86-97] (client scope derivation — the facilitator exclusion to lift; 3.5 re-mint reconciler)
- [Source: apps/server/src/handlers/voiceHandlers.ts:68-168] (VOICE_TOKEN mint — durable-id-resolved, correct post-mint)
- [Source: apps/client/src/App.tsx:109-121] (phase router — dashboard "returns between rounds" for free)
- [Source: apps/client/src/ui/ActiveRound.tsx:36,67-73,91-139,144-166] (branch order; stale facilitator comment; fallback; overlay wrapper)
- [Source: apps/client/src/ui/Lobby.tsx:52,83-89,148,161,167-170,183-186,265,272,279-314,335-354] (assign emit; facilitator row gating; ready toggle)
- [Source: apps/client/src/ui/PauseOverlay.tsx:32-34,42-43,51-60,69-95,102-109] (break-glass pause; isParticipant; resume + ready gates)
- [Source: apps/client/src/ui/ConfirmButton.tsx:36-103] (the confirm-guard pattern for the compact overlay)
- [Source: apps/client/src/ui/RoundConfigPanel.tsx:94-96, Scoreboard.tsx:115-116,175,248-309, Preparation.tsx:92-93,127-166] (dashboard controls to re-key)
- [Source: apps/client/src/net/identity.ts:27-36,61-66 + store/gameStore.ts:56,144] (durable identity; myPlayerId)
- [Source: apps/client/e2e/flows/full-session.spec.ts + e2e/helpers/session.ts:27-199] (two-context pattern + helpers for the 2-player smoke)
- [Source: _agent_docs/implementation-artifacts/deferred-work.md:17,95,105,131,194] (equalisation edge; identity history; TEAM_ASSIGN race posture — accepted V1; 8.6 decision (c); PTT bridge = separate story)
- [Source: _agent_docs/implementation-artifacts/9-4-spectator-lounge-view.md] (in-flight WIP — audience predicates, DD4 facilitator-lounge note to reconcile)

### Design Decisions (proposed 2026-07-04 — AFK-defaults pending Jay's confirmation; re-confirm before/at dev)

1. **Compact overlay = the existing `PauseOverlay`, re-keyed to the flag, Pause made confirm-guarded.** No new overlay component; it already floats over every surface and carries resume + ready machinery. *Alternative rejected: a bespoke mini-dashboard — scope creep toward the unbuilt mockup-6 dashboard.* → Task 5.
2. **No opt-out path in 9.5.** Once teamed, the Facilitator can be re-assigned between teams/roles in the lobby but not returned to the teamless facilitator seat. *Rationale: TEAM_ASSIGN has no "unassign" semantics for anyone; adding one is a separate, symmetric feature.* → Task 3.
3. **A Facilitator playing on the RESTING team earns/spends lifelines like any resting player; the teamless facilitator still never does.** Falls out naturally since role is now the play role — pinned by tests rather than new code. *Alternative (Jay may prefer): the facilitator never earns even while playing — one-line predicate change, say the word.* → Task 4.
4. **PLAYER_REMOVE refuses the facilitator as target (self- or otherwise).** The session must always have exactly one authority-holder. → Task 2.
5. **Preparation keeps the operator view for the teamed Facilitator** (they must start the round; prep is between-rounds context, not mid-round). *Alternative: player prep surface + compact start button.* → Task 5.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Opus 4.8)

### Debug Log References

- e2e first run: `getByTestId('manual')` / `getByTestId('bomb-stage')` are unit-test MOCK testids, absent from real DOM — the round actually started and the Facilitator WAS on the manual. Fixed to real locators (`nav[aria-label="Manual chapters"]`; `solveWiresBombInBrowser` waits on `__E2E_STATE__` for the active bomb).
- server gate-matrix first run: `ROUND_RETRY` parses `{ teamId }` before the authority gate; supplied a valid payload so the probe reaches `NOT_FACILITATOR`. `SESSION_END` needs a relay-complete state to pass its phase gate. Silent-no-op gates required a window-collect assertion instead of first-reaction.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created (2026-07-04): two parallel code-mapping investigations (server authority model, client surfaces/voice) + full planning-artifact sweep (sprint-change-proposal, epics, GDD amendments, EXPERIENCE.md, game-architecture, deferred-work) distilled into the flag-vs-role design rule, a 10-gate re-key matrix, and verify-don't-rebuild boundaries.
- **Implemented 2026-07-04 (claude-opus-4-8).** Baseline `cfd7913` — 9.4 had already LANDED (feat 6ed3450 + fix cfd7913), so the sequencing block was clear and all `file:line` anchors were re-verified against the current tree (several drifted: `startRound.ts`/`equalisationVolunteer.ts` live under `session/`, not `round/`; gate lines shifted). Old `baseline_commit` placeholder note superseded.
- **The flag-vs-role split (Task 1):** added `SessionState.facilitatorPlayerId?: string` + the shared fail-closed predicate `isSessionFacilitator(state, playerId)` (rejects null/undefined/empty on either side), seeded once in `createSessionState`. One predicate, used on BOTH server and client (`selectIsFacilitator`), zero drift.
- **Server (Tasks 2–4):** re-keyed all 10 authority gates in `sessionHandlers.ts` to the flag; audited the `startRound` role-mint (a teamed facilitator IS reconciled to a play role — intended; authority survives via the flag) and fixed the stale `startRound.ts:39` comment; PLAYER_REMOVE now explicitly refuses `facilitatorPlayerId` as target (DD4); opened the assignment path (deleted the `assignTeam` facilitator guard + the TEAM_ASSIGN target refusal). Verified-and-pinned (no code change, per DD3 AFK-defaults): auto-pause/resume + lifeline earn/spend already teamId/role-keyed — a teamed facilitator on the resting team earns/spends; the teamless host never does.
- **Reattach audit (Task 2):** the roster is the role authority mid-round (no re-add path), so a reattaching Facilitator-Defuser stays `defuser`. The stored reattach `role: 'facilitator'` seeds ONLY a lobby re-add; a facilitator who opted in then dropped+reattached in the LOBBY returns as teamless host and re-opts-in — an accepted V1 edge, authority never lost (`facilitatorPlayerId` survives any prune). Documented in the store site + `joinSession` comment.
- **Client (Task 5):** `selectIsFacilitator` sweep across `Lobby`/`RoundConfigPanel`/`PauseOverlay`/`Scoreboard`/`Preparation`; Lobby self-assign (team chips + role select on the host's OWN row, role sanitised to `defuser` so opting in emits a valid TEAM_ASSIGN) + a flag-keyed "Host" chip + Remove hidden on the host row; `sortRoster` now sorts the flag-holder first; `ActiveRound` routing already correct (teamed facilitator → bomb/manual/lounge by role+teamId), only the stale comment fixed. **PauseOverlay:** the break-glass Pause is now confirm-guarded (arm→confirm on the same `facilitator-pause` button, keeps the 20%-opacity break-glass styling); ALSO fixed a would-be **client deadlock** — a teamed facilitator-participant now gets a ready-up affordance during a disconnect pause (their own not-ready state gated Resume with no way to clear it).
- **Voice (Task 6):** a TEAMED facilitator already resolves correctly (play role). Resolved the flagged decision by ALIGNING the client with the shared resolver: `deriveDesiredScope` no longer null-tears the TEAMLESS facilitator — they resolve to the lounge (bidirectional, 3.7) / lobby room like any lounge member (consistent with 9.4/DD4). Updated the contradictory `computeVoiceAction` doc.
- **Docs (Task 7):** scoped the 9.4 facilitator-lounge note to "when not on the active team" in `epics.md` §9.4 + a forward-ref in 9.4's story file; added a Story-9.5 authority-flag note to the `game-architecture.md` event table; marked the §B3 action item reconciled.
- **Test evidence (Task 8):** `pnpm -w typecheck` clean (no `@ts-ignore`/`as any` in new logic). Suites green: **shared 515, server 648 (2 pre-existing skips), client 561, e2e 27** — including the new **2-player two-tab smoke** (`facilitator-opt-in-play.spec.ts`): the Facilitator opts onto Team A, plays the Expert manual in round 1 (with a confirm-guarded pause→resume), becomes the Defuser in round 2 by rotation and solves the bomb, then ends the session — all while teamed, proving `ROUND_START`/`SESSION_END` authority holds. Full regression: 10 gate tests, 8.9 relay, 8.7 pause, 9.2/9.3 lifelines, 9.4 lounge all green.
- **Fixture note for reviewers:** client `makeSession` now defaults `facilitatorPlayerId: 'fac'` (the fixture convention) so component tests that mark a `fac`-id player as the facilitator keep working under the flag. A "non-facilitator" case must use a DIFFERENT viewer id, not just a non-facilitator role (RoundConfigPanel test updated accordingly).
- **Spec deviation (accepted by Jay, 9.5 code review):** Task 1 speced `facilitatorPlayerId: string` (required, compiler enumerates fixtures); shipped `?: string` — wire-honest for pre-9.5 snapshots, matches the `activeTeamId` optional precedent, guarded by the fail-closed helper. Trade-off consciously accepted: a future `SessionState` literal can omit the flag with no compile error (gates then refuse everyone at runtime — fail-closed, never fail-open); client `makeSession` defaults it to `'fac'` so component fixtures stay covered.
- **Code review 2026-07-04 (3-layer adversarial):** 3 decisions resolved by Jay (lounge-over-dashboard AC-3 wording, operator-only prep view pinned, field stays optional) + 10 patches applied — the 2 real bug fixes both in `PauseOverlay.tsx`: (1) a lingering ARMED break-glass Pause now disarms whenever the button isn't rendered (an intervening auto-pause used to return it pre-armed after resume = one-click bypass of the confirm guard); (2) the client resume gate now mirrors the server's ACTIVE-team-only `canResume` (a resting-teamed facilitator no longer sees a wrongly-disabled Resume). Plus: AC-5 socket-level disconnect→reattach→resume integration test, `isRelayComplete` facilitator pin, `equalisationVolunteer` mint comment, import/comment hygiene. 2 defers → `deferred-work.md` (no opt-out one-way door per DD2; no pre-9.5 snapshot backfill). 7 dismissed (3 disproved against source).
- **⏳ PENDING — Jay's interactive human verification (Task 8, [[human-verification-ac-rule]]):** not done until Jay runs the real 2-tab Docker session and confirms (a) lobby self-assign, (b) mid-round play + confirm-guarded pause/resume, (c) full dashboard between rounds, (d) voice bomb-room↔lounge, (e) disconnect auto-pause→reattach→resume, (f) final scoreboard. Record the observed result here.

### File List

**New (shared):**
- `packages/shared/src/session/facilitator.ts` — `isSessionFacilitator` predicate
- `packages/shared/src/session/__tests__/facilitator.test.ts` — helper truth table

**New (client):**
- `apps/client/src/ui/selectors.ts` — `selectIsFacilitator` client derivation
- `apps/client/e2e/flows/facilitator-opt-in-play.spec.ts` — 2-player two-tab smoke (AC-6)

**Modified (shared):**
- `packages/shared/src/types/session.ts` — `facilitatorPlayerId?: string` field
- `packages/shared/src/session/index.ts` — barrel export

**Modified (server):**
- `apps/server/src/session/createSession.ts` — seed the flag
- `apps/server/src/session/assignTeam.ts` — drop the facilitator-target guard
- `apps/server/src/session/startRound.ts` — stale role-mint comment fix
- `apps/server/src/session/joinSession.ts` — comment: authority now in the flag
- `apps/server/src/handlers/sessionHandlers.ts` — 10 gate re-keys, drop TEAM_ASSIGN target guard, PLAYER_REMOVE facilitator-target guard, reattach comment
- Tests: `handlers/__tests__/sessionHandlers.test.ts` (gate matrix + self-assign), `handlers/__tests__/lifelineHandlers.test.ts` (teamed-facilitator spends), `round/__tests__/resolveRoundLifelines.test.ts` (teamed-facilitator earns), `session/__tests__/{assignTeam,createSession,pauseSession,startRound}.test.ts`

**Modified (client):**
- `apps/client/src/ui/Lobby.tsx` — self-assign row, Host chip, flag sort/derivation
- `apps/client/src/ui/PauseOverlay.tsx` — flag re-key + confirm-guard + participant ready fix
- `apps/client/src/ui/{RoundConfigPanel,Scoreboard,Preparation,ActiveRound}.tsx` — flag re-key / comment
- `apps/client/src/ui/copy.ts` — `HOST_TAG`, `FACILITATOR_PAUSE_CONFIRM_CTA`
- `apps/client/src/voice/computeVoiceAction.ts` — facilitator lounge scope + doc
- `apps/client/src/test/fixtures.ts` — default `facilitatorPlayerId`
- Tests: `ui/__tests__/{Lobby,PauseOverlay,RoundConfigPanel,ActiveRound}.test.tsx`, `voice/__tests__/{computeVoiceAction,useVoiceScopeSync}.test.*`

**Modified (docs):**
- `_agent_docs/planning-artifacts/epics.md` (§9.4 note + §B3 reconciled)
- `_agent_docs/game-architecture.md` (authority-flag note)
- `_agent_docs/implementation-artifacts/9-4-spectator-lounge-view.md` (forward-ref)

## Change Log

| Date | Change |
|---|---|
| 2026-07-04 | Story 9.5 implemented (claude-opus-4-8): `facilitatorPlayerId` flag + `isSessionFacilitator` helper; 10 server authority gates + 5 client derivations re-keyed to the flag; assignment path opened (facilitator can opt onto a team); PLAYER_REMOVE facilitator-target guard (DD4); confirm-guarded break-glass Pause (AC-3) + teamed-facilitator disconnect-pause ready fix; voice `deriveDesiredScope` aligned (teamless facilitator → lounge); auto-pause/lifeline earn+spend verified-and-pinned (DD3 AFK-default, no code change). Docs reconciled (§B3). Suites green: shared 515 / server 648 / client 561 / e2e 27 (incl. new 2-player two-tab smoke); typecheck clean. Status → review. **Pending Jay's interactive human verification.** |
