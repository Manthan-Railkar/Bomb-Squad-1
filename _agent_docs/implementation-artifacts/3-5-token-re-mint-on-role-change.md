---
baseline_commit: 64b9e7d3403d29c8813ae1bf88ce4e14ecc68577
---

# Story 3.5: Token Re-Mint on Role Change

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a player whose role changes during a session,
I want a fresh voice token minted for my new role/room,
so that stale voice permissions can never leak across roles and I always land in the right channel.

## Acceptance Criteria

From epics.md (Story 3.5) plus the resilience invariants this story must not regress:

1. **Fresh token + room on role change.** Given a player whose effective voice scope changes (e.g. Defuser/Expert → Spectator, or vice versa, via facilitator reassignment / relay rotation), when the role change is applied and broadcast in `SESSION_STATE`, then a **new** LiveKit token is minted scoped to the new room + grants and the **old token is never reused** (the prior LiveKit connection is torn down; a fresh `VOICE_TOKEN` request is issued).
2. **Spectator re-mint is listen-only and routes to the Lounge.** Given a player who just became a Spectator, when their new token is issued, then it has `canPublish: false` and routes them to the Spectator Lounge (`spectator-lounge:{sessionId}`) — and the client connects **listen-only** (no mic acquired, no mic prompt).
3. **No churn when the effective scope is unchanged.** Given a role label change that does **not** change the effective voice scope (e.g. Defuser → Expert within the same team: both are Bomb-Room roles, same room + same grants), when `SESSION_STATE` updates, then the existing voice connection is **not** torn down/reconnected (avoid needless audio drop). The trigger is a change in **effective scope (room + publish rights)**, not the raw role label.
4. **Re-mint never blocks the game (preserve 3.6).** Given the re-mint/reconnect fails, when the failure is detected, then voice goes to the `unavailable` state with the dismissible "Voice unavailable — game continues without it" banner and all game UI stays fully interactive — a voice failure during re-mint must never gate a game-state transition.
5. **Only re-mint an already-active connection.** Given a player who has **not** connected voice yet (`status: 'idle'`), when their role/scope changes, then voice is **not** auto-connected (the first connect still requires the user gesture for autoplay + `getUserMedia`). Re-mint applies only when voice is currently `connecting`/`connected`/`unavailable`-after-connect.
6. **Server minting stays stateless and grant-correct.** Given any `VOICE_TOKEN` request after a role change, when the server mints, then it derives room + grants from current authoritative `SessionState` (never from client payload), spectator tokens keep `canPublish:false`, and the token value is never logged (regression guard on 3.1).

## Tasks / Subtasks

- [x] **Task 1 — Extract a shared, single-source voice-scope helper (AC: 1, 2, 3, 6)**
  - [x] Add a pure helper to `packages/shared/src` (new `packages/shared/src/voice/scope.ts`, re-exported from the package index) that maps `(role, teamId, phase?)` → `{ room: string; canPublish: boolean }`, plus the room-name builders `bombRoomName(sessionId, teamId)`, `spectatorLoungeName(sessionId)`, `lobbyRoomName(sessionId)`. This is the **canonical** room/grant derivation.
  - [x] Refactor the server `resolveVoiceScope`/room-name builders in `apps/server/src/voice/mintToken.ts` to **delegate to the shared helper** (server keeps the `VideoGrant` shaping + `roomJoin:true`, but room name + `canPublish`/`canSubscribe` come from shared). Goal: client and server can never drift on what room/grants a role gets (the 8-9 "client/server can't drift" lesson).
  - [x] Keep `packages/shared` free of any `livekit-server-sdk`/`react`/`socket.io` import — the helper is pure TypeScript returning plain data (project-context: shared has zero runtime deps on frameworks).
  - [x] Unit tests in `packages/shared/src/__tests__/`: every role → expected room + publish; lobby phase → shared lobby room for all roles; Bomb-Room role with no `teamId` is a defined error/`undefined` contract (match current `VoiceScopeError` behavior the server relies on).

- [x] **Task 2 — Client: detect effective-scope change and re-mint (AC: 1, 2, 3, 5)**
  - [x] Add a small, testable unit (recommended: `apps/client/src/voice/useVoiceScopeSync.ts` hook, or a pure `computeVoiceAction(prev, next)` in `voice/` + a thin effect) that, on each `SESSION_STATE`/`gameStore.session` update, computes the local player's **desired** scope via the shared helper from `self.role` + `self.teamId` + `session.status`, and compares it to the **connected** scope (`voiceStore.room` + the published mode).
  - [x] Re-mint rule: if voice `status` is `connecting`/`connected` (i.e. the user already opted in) **and** the desired `{room, publish}` differs from the connected one, then `await disconnectVoice()` then `connectVoice({ publish: desired.publish })`. `connectVoice` already requests a **fresh** `VOICE_TOKEN` every call (never cached) — this satisfies "old token never reused"; do **not** add token caching. (Implemented via `reconnectVoice` = disconnect→connect; we act on `connected` only — `connecting` defers until the in-flight connect lands, then reconciles.)
  - [x] Do **not** auto-connect from `idle` (AC #5): no desired-scope reaction when the player has never connected. (A first connect still needs the gesture-driven button in `VoiceController`.)
  - [x] Reconnect-without-gesture is acceptable here: the mic permission + audio unlock were already granted on the initial connect within this page session — note this in code comments so a reviewer doesn't "fix" it back to a gesture gate.
  - [x] Guard against reconnect storms: the existing `connectEpoch` concurrency guard in `connectVoice.ts` supersedes stale in-flight connects; ensure rapid successive `SESSION_STATE` updates collapse to the latest desired scope (compare against desired, not against each intermediate state).

- [x] **Task 3 — Reconcile `VoiceController` role-mode with the re-mint (AC: 2, 3, 4)**
  - [x] `VoiceController.tsx` currently recomputes `publish`/microcopy from the live role each render but never reconnects when the role flips — wire it to the Task 2 unit (or host the effect here). When a connected Bomb-Room participant becomes a Spectator, the UI must flip to lounge microcopy **and** the underlying connection must move to the lounge (listen-only), not just relabel.
  - [x] Preserve the existing teardown-on-unmount (AC #5 of 3.3) and the `unavailable`→Reconnect affordance (3.6). A re-mint failure routes through the same `unavailable` path (AC #4 here).
  - [x] Spectator re-mint path must not acquire the mic / must not prompt (`publish:false`) — reuse the existing listen-only branch.

- [x] **Task 4 — Server handler regression pass (AC: 6)**
  - [x] Confirm the `VOICE_TOKEN` handler (`apps/server/src/handlers/voiceHandlers.ts`) re-derives role + teamId from authoritative `SessionState` on every request (it does today) and that the `ROUND_START`/role-mutation path leaves `state.players[*].role` correct for the next token request. No new server event is required — re-mint is pull-based (client requests a fresh token); the existing `SESSION_STATE` broadcast after `startRound` is the change signal.
  - [x] Verify the secret-leak guard (token + TURN creds never logged) still holds; add/extend a handler test asserting a post-role-change request returns the new room + grants.

- [x] **Task 5 — Tests (AC: all)**
  - [x] Shared: scope-helper table tests (Task 1).
  - [x] Client unit: `computeVoiceAction`/scope-sync — (a) Bomb-Room→Spectator while connected ⇒ reconnect with `publish:false` to lounge; (b) Defuser→Expert same team while connected ⇒ **no** reconnect (AC #3); (c) any scope change while `idle` ⇒ **no** connect (AC #5); (d) reconnect failure ⇒ `unavailable` (AC #4 — covered by `connectVoice.test.ts` reconnect/failure path). Use the td-1 client component/unit test framework; mock `connectVoice`/`disconnectVoice`.
  - [x] Server handler integration: post-role-change `VOICE_TOKEN` returns new room + correct grants; spectator `canPublish:false`; no token in logs.
  - [x] Run the full gate: `tsc --noEmit` clean across workspaces; shared + server + client suites green; sim-clients verify if touched (not touched — additive shared export only).

- [ ] **Task 6 — Jay verifies interactively (human verification — required, not done until observed)**
  - [ ] In the Docker stack, with two browsers in one session: become a Bomb-Room participant and connect voice; have the facilitator reassign you to Spectator → confirm you (a) drop out of the Bomb Room, (b) reconnect listen-only to the lounge with no mic prompt, (c) cannot publish. Reassign back → confirm you re-mint into the Bomb Room and can talk again. Record the observed result in Completion Notes. (Per the human-verification AC rule.)

## Dev Notes

### What this story actually is (read first)

The **server is already correct and stateless**: every `VOICE_TOKEN` request mints a fresh token scoped to the player's **current** authoritative role/team (`apps/server/src/handlers/voiceHandlers.ts` → `mintVoiceToken` → `resolveVoiceScope`). The **client already never caches tokens** (`requestVoiceToken` emits a fresh `VOICE_TOKEN` on every `connectVoice` call). So "old token never reused" is structurally satisfied **as long as the client re-requests** on a scope change.

**The gap is purely client-side reaction:** today nothing tears down and re-establishes the voice connection when the player's role/team changes mid-session. `VoiceController` recomputes its `publish`/microcopy from the live role on each render, but a player who is **connected to the Bomb Room and then becomes a Spectator** keeps the old Bomb-Room connection (still able to publish!) while the UI merely relabels. **That is the bug this story fixes.** The deliverable is: detect an *effective voice scope* change from `SESSION_STATE`, tear down, and reconnect with a fresh token.

### Effective scope, not raw role (AC #3 — critical nuance)

Derive the desired voice scope the same way the server does, from `(role, teamId, phase)`:
- `defuser`, `expert` → Bomb Room `bomb-room:{sessionId}:{teamId}`, `canPublish:true`.
- `spectator` → `spectator-lounge:{sessionId}`, `canPublish:false`.
- `facilitator` → lounge, `canPublish:true`.
- `phase === 'lobby'` → shared `lobby:{sessionId}` for all (mic-check, Story 2.5).

Because **Defuser↔Expert are both Bomb-Room roles in the same team room with identical grants**, the relay rotation that demotes a stale Defuser to Expert (in `startRound`, `apps/server/src/session/startRound.ts:135-143`) is a *no-op for voice* — do **not** reconnect for it (AC #3). Only reconnect when the computed `{room, publish}` actually differs. Triggering on raw role would needlessly drop audio every round.

### Scope boundary vs Story 3.7 (do not over-build)

The **relay "resting team" → Lounge** routing (where a team keeps `defuser`/`expert` roles but is *resting* for the turn and should hear the active team) is **owned by Story 3.7** (the Bomb Room→Lounge one-way audio bridge), which also re-mints active↔resting and "pairs with 3.5". Today `startRound` keeps the resting team as Bomb-Room roles (in their own team room), so under the current role model a resting player's effective scope does **not** change to the lounge — that change arrives with 3.7. **This story (3.5) owns the generic mechanism**: whenever the server-assigned effective scope changes, the client re-mints. The clearest, fully-functional-today trigger is **facilitator role reassignment** (Defuser/Expert ↔ Spectator via `TEAM_ASSIGN`), which crosses the Bomb-Room↔Lounge boundary independently of 3.7. Build the mechanism cleanly so 3.7 gets active↔resting routing "for free" once it changes what scope the resting team resolves to. Do **not** implement the audio bridge or change `startRound`'s role demotion here.

### Where role/scope changes originate (server)

- **`startRound` role pass** (`apps/server/src/session/startRound.ts:130-143`): commits the active team's Defuser, demotes every other `defuser` to `expert`. Broadcast via `SESSION_STATE` in the `ROUND_START` handler (`apps/server/src/handlers/sessionHandlers.ts:1460`, which carries the comment "Epic 3: voice tokens are re-minted here on role change"). Voice impact under current model: same-room Defuser↔Expert → **no reconnect** (AC #3).
- **Facilitator reassignment** (`assignPlayerToTeam`, `apps/server/src/session/assignTeam.ts`) via `TEAM_ASSIGN`: can change `role` and `teamId` → **can cross room/grant boundaries → reconnect** (the core observable AC #1/#2 path today).
- Active-team selection: `selectActiveTeam` (`packages/shared/src/session/relay.ts`) + `openPreparation` (`apps/server/src/session/openPreparation.ts:34-47`) set `session.activeTeamId` — relevant to 3.7's resting-team routing, not to 3.5's current scope derivation.
- `ROUND_RETRY` and pause/resume do **not** change roles → no re-mint.

### Client wiring details

- `voiceStore` (`apps/client/src/store/voiceStore.ts`) exposes `status` and the connected `room` (set on `setConnected`). Compare desired room vs `voiceStore.room`. The published mode is implied by the role at connect time; track the connected `publish` intent if needed (e.g. add a stored `publishing` flag, or infer: a lounge room is always listen-only). Prefer comparing the full `{room, publish}` tuple.
- `connectVoice({ publish })` / `disconnectVoice()` / `reconnectVoice({ publish })` live in `apps/client/src/voice/connectVoice.ts`. `connectVoice` requests a fresh token; the `connectEpoch` guard already serializes overlapping connect/disconnect (double-click, unmount-mid-connect). Reuse it — do not add a parallel guard.
- Self identity: resolve via `gameStore.myPlayerId` (durable id), **not** `getSocket().id` — `players` is keyed by durable playerId (Story 2.7 fix; see the comment in `VoiceController.tsx:47-50`). This is a known footgun: the socket.id lookup silently misses post-2.7.
- Reconnect-without-gesture: acceptable after the initial gesture-driven connect (mic + audio already unlocked for the page session). First connect still needs the button.

### UX / EXPERIENCE.md microcopy

Reuse existing copy constants in `apps/client/src/ui/copy.js` (`VOICE_*`, `VOICE_LOUNGE_*`, `VOICE_UNAVAILABLE`, `VOICE_RECONNECT`). The transition to spectator should show lounge microcopy ("Listen to the Bomb Room") and the transition back should show Bomb-Room microcopy. No new modal; failure stays a dismissible banner (3.6).

### Testing standards summary

- **Pure logic** (shared scope helper, `computeVoiceAction`) → Jest unit, zero infra. Table-driven.
- **Client voice** → mock `connectVoice`/`disconnectVoice` and the LiveKit `Room` (existing pattern in `apps/client/src/voice/__tests__/connectVoice.test.ts`); use the td-1 client test framework for any component-level effect.
- **Server handler** → integration test against in-memory `RedisStore` (existing pattern in `apps/server/src/handlers/__tests__/voiceHandlers.test.ts`); decode JWT claims, never assert opaque token strings.
- Forbidden: never log the token; never mock the pure scope helper inside a handler test (call it directly); spectator `canPublish:false` test is non-negotiable.

### Project Structure Notes

- New shared helper: `packages/shared/src/voice/scope.ts` (+ re-export from the package entry; tests in `packages/shared/src/__tests__/`). This is a new `voice/` subfolder in shared — consistent with the existing `session/` subfolder (e.g. `relay.ts`).
- Server change is a **refactor-to-delegate** in `apps/server/src/voice/mintToken.ts` (keep the public `resolveVoiceScope`/`mintVoiceToken` API; move room-name + publish derivation into shared). Do not break `voiceHandlers.ts` call sites.
- Client: new `apps/client/src/voice/useVoiceScopeSync.ts` (or `computeVoiceAction.ts`) + wiring in `VoiceController.tsx`. Keep connection logic in `voice/`, not in the component (component stays rendering/effect-only).
- No new Socket.IO event — re-mint is pull-based over the existing `VOICE_TOKEN`. Do not add a server→client "re-mint now" push.

### References

- [Source: _agent_docs/planning-artifacts/epics.md#Story 3.5: Token Re-Mint on Role Change] (lines 643-657) — AC source.
- [Source: _agent_docs/planning-artifacts/epics.md#Story 3.7] (lines 675-695) — the active↔resting Lounge re-mint "pairs with 3.5"; 3.7 owns the bridge + resting routing.
- [Source: apps/server/src/voice/mintToken.ts] — `resolveVoiceScope` (l.92), `bombRoomName` (l.65), `spectatorLoungeName` (l.69), `lobbyRoomName` (l.75), `BOMB_ROOM_ROLES` (l.22), `mintVoiceToken`.
- [Source: apps/server/src/handlers/voiceHandlers.ts] — `VOICE_TOKEN` handler; stateless server-derived scope; secret-leak guards.
- [Source: apps/server/src/session/startRound.ts] (l.104-143) — defuser commit + Defuser→Expert demotion (same-room, no voice reconnect).
- [Source: apps/server/src/handlers/sessionHandlers.ts] (l.1354-1508, esp. l.1460) — `ROUND_START` `SESSION_STATE` broadcast (the role-change signal).
- [Source: apps/server/src/session/assignTeam.ts] — `assignPlayerToTeam` / `TEAM_ASSIGN` (facilitator role reassignment — the cross-boundary trigger usable today).
- [Source: packages/shared/src/session/relay.ts] — `selectActiveTeam` (relay/active-team; relevant to 3.7).
- [Source: apps/client/src/voice/connectVoice.ts] — `connectVoice`/`disconnectVoice`/`reconnectVoice`, fresh-token `requestVoiceToken` (l.88), `connectEpoch` guard.
- [Source: apps/client/src/store/voiceStore.ts] — store shape; `room` set on `setConnected`.
- [Source: apps/client/src/ui/VoiceController.tsx] — role-mode resolution; durable-id self lookup (l.47-50); teardown-on-unmount; `unavailable`/Reconnect.
- [Source: packages/shared/src/types/session.ts] — `PlayerRole` (l.3), `TeamId` (l.6), `PlayerInfo.role`/`teamId`, `SessionState.activeTeamId`.
- [Source: _agent_docs/implementation-artifacts/deferred-work.md] (l.19) — resting-team/facilitator voice routing on rotation → 3-5/3-7.
- [Source: _agent_docs/implementation-artifacts/8-11-sequential-round-orchestration.md] & [8-9-...md] — relay model; "client/server can't drift" lesson; resting-team voice deferred to 3-5/3-7.
- [Source: _agent_docs/implementation-artifacts/3-6-graceful-voice-degradation.md] — `unavailable` banner + Reconnect resilience this story must preserve (AC #4).

### Project Context Rules

From `_agent_docs/project-context.md` — the rules that bind this story:

- **Socket.IO / Shared types:** all event types live in `packages/shared/src/events/` and are imported on both sides — never duplicate. The new scope helper follows the same single-source rule (shared, imported by client + server) to prevent drift.
- **`packages/shared` has zero runtime deps on `react`/`socket.io`/server/client frameworks and no `livekit-server-sdk`** — the scope helper must be pure TS returning plain data.
- **Voice/LiveKit gotchas (verbatim project rules):** "The Spectator Lounge receives Bomb Room audio as a one-way listen-only track — spectators must never be able to send audio into the Bomb Room channel." / "Participant tokens must be regenerated on role change (defuser ↔ spectator) — do not reuse the same token with different room permissions." This story is the direct implementation of that second rule.
- **Voice never gates game state:** voice connection state lives in its own Zustand store and never blocks a game-state transition (AC #4). Socket handlers own all I/O; reducers never emit sockets or touch LiveKit.
- **Security:** tokens are secrets — never logged; spectator `canPublish:false` enforced at the grant level, never merely hidden in the UI; client input untrusted (server derives scope from authoritative state, ignores client-supplied room/role).
- **Build gate:** `tsc --noEmit` zero errors before commit; no `// @ts-ignore`; TypeScript only; separate tsconfig per workspace.
- **LiveKit voice logic is integration-tested against a real LiveKit container in CI** — do not mock the SDK surface for the server token path; client-side may mock the `Room` per the existing `connectVoice.test.ts` pattern.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (gds-dev-story)

### Debug Log References

- Full gate (2026-06-22): `tsc --noEmit` clean in shared / server / client. Suites:
  shared **227** passed (was 216, +11 scope tests), server **545** passed (was 539,
  +6 mint-delegation + post-role-change handler tests), client **419** passed (was
  396, +23 `computeVoiceAction` + `useVoiceScopeSync` tests). No regressions.

### Completion Notes List

- **Server was already correct/stateless** — confirmed: every `VOICE_TOKEN` mints
  from current authoritative `SessionState`, and the client never caches a token
  (`connectVoice` requests fresh every call). The story's gap was purely client
  REACTION; this story adds it.
- **Single-source scope (Task 1):** new pure `packages/shared/src/voice/scope.ts`
  (`resolveVoiceScope`, room builders, `VoiceScopeError`). Server `mintToken.ts`
  now delegates room/publish/subscribe to it and only shapes the `VideoGrant`
  (`roomJoin:true`). `VoiceScopeError` + room builders MOVED to shared and
  re-exported from `mintToken.ts` so existing import sites (`voiceHandlers`,
  server tests) are unchanged and `instanceof` still matches. Shared stays free of
  `livekit-server-sdk`/`react`/`socket.io`.
- **Effective scope, not raw role (AC #3):** the re-mint trigger compares the full
  `{ room, publish }` tuple. Added `voiceStore.publishing` (the connected publish
  intent, set on `setConnected`) so a same-room publish-rights change (lounge
  listen-only → publish) is detected while Defuser↔Expert on the same team (identical
  room + publish) is a no-op — no audio drop.
- **Client mechanism (Tasks 2/3):** pure `computeVoiceAction` + `useVoiceScopeSync`
  hook hosted in `VoiceController` (called before the early return — hooks are
  unconditional). Re-mints via `reconnectVoice` (disconnect→fresh connect) ONLY when
  `status === 'connected'` and the desired scope differs. Never auto-connects from
  `idle` (AC #5); `connecting` defers (room unknown) then reconciles on the next
  `connected`. `unavailable` is left to the existing manual Reconnect affordance
  (3.6), which already connects in the live role mode. Reconnect-without-gesture is
  intentional (mic/audio already unlocked for the page session) and commented so a
  reviewer won't re-gate it. `connectEpoch` guard (unchanged) handles storms.
- **Scope boundary vs 3.7:** `deriveDesiredScope` is deliberately limited to the
  roles `VoiceController` manages (Bomb-Room participant / Spectator) — the
  Bomb-Room↔Lounge boundary the facilitator's `TEAM_ASSIGN` crosses today. Did NOT
  build the audio bridge or change `startRound`'s role demotion; the active↔resting
  Lounge routing arrives with 3.7 and rides this mechanism for free.
- **AC #4 preserved:** a re-mint failure routes through `connect`'s existing
  failure→`unavailable` path (dismissible banner, game keeps running). No game-state
  coupling added; voice writes only `voiceStore`.
- **Task 6 (Jay interactive) OUTSTANDING** — per the human-verification AC rule the
  story stays in `review` until Jay observes the two-browser reassign behaviour.

### File List

- `packages/shared/src/voice/scope.ts` (new) — canonical scope helper + room builders + `VoiceScopeError`
- `packages/shared/src/voice/index.ts` (new) — re-export
- `packages/shared/src/index.ts` — export `./voice/index.js`
- `packages/shared/src/__tests__/voiceScope.test.ts` (new) — scope table tests
- `apps/server/src/voice/mintToken.ts` — delegate to shared; re-export error + builders
- `apps/server/src/handlers/__tests__/voiceHandlers.test.ts` — post-role-change re-derivation test
- `apps/client/src/store/voiceStore.ts` — add `publishing` flag; `setConnected({ ..., publish })`
- `apps/client/src/voice/connectVoice.ts` — thread `publish` into both `setConnected` calls
- `apps/client/src/voice/computeVoiceAction.ts` (new) — pure desired-scope derivation + re-mint decision
- `apps/client/src/voice/useVoiceScopeSync.ts` (new) — store→decision→`reconnectVoice` effect hook
- `apps/client/src/voice/__tests__/computeVoiceAction.test.ts` (new)
- `apps/client/src/voice/__tests__/useVoiceScopeSync.test.tsx` (new)
- `apps/client/src/ui/VoiceController.tsx` — call `useVoiceScopeSync`

### Change Log

- 2026-06-22 — Story 3.5 implemented (Tasks 1–5). Shared single-source voice-scope
  helper + server delegation; client re-mint-on-effective-scope-change
  (`computeVoiceAction` + `useVoiceScopeSync`, `voiceStore.publishing`). Status →
  review; Task 6 (Jay interactive 2-browser verify) outstanding.

### Review Findings

_Code review 2026-07-01 (Blind Hunter + Edge Case Hunter + Acceptance Auditor). Core re-mint/scope logic is sound and well-tested; all six ACs verified present. Three convergent findings surfaced; all three patched (Jay's calls: teardown + handle-unavailable + authoritative-publish). tsc clean; shared 227 / server 545 / client 424 green (+5). Task 6 (Jay interactive 2-browser verify) still OUTSTANDING — the patches changed re-mint behavior, so re-verification is required; story stays `review`._

- [x] [Review][Patch][applied] Reconciler now tears down on `desired === null` while connected/unavailable — added `{ type: 'disconnect' }` to `VoiceAction`; `computeVoiceAction` returns it when a connected/unavailable player's managed scope disappears (facilitator / un-teamed / self removed from roster); `useVoiceScopeSync` dispatches `disconnectVoice()`. Closes the stale-publishing-leak class. [`apps/client/src/voice/computeVoiceAction.ts`, `apps/client/src/voice/useVoiceScopeSync.ts`]
- [x] [Review][Patch][applied] `computeVoiceAction` now re-mints from `unavailable`-after-connect (AC #5) — a player reassigned while `unavailable` re-mints toward the new scope instead of being stranded on the old room's affordance; a `lastAttemptRef` single-shot guard in `useVoiceScopeSync` prevents a retry storm when the re-mint itself keeps failing. [`apps/client/src/voice/computeVoiceAction.ts`, `apps/client/src/voice/useVoiceScopeSync.ts`]
- [x] [Review][Patch][applied] `publish` is now server-authoritative — added `canPublish` to `VoiceTokenGrantPayload`; `mintVoiceToken` returns it, the handler surfaces it on the ack, and `connect()` derives its mic decision from `grant.canPublish` (not the caller's pre-request intent) — a token requested as Defuser but granted as Spectator can no longer prompt the mic / strand the player. [`packages/shared/src/events/payloads.ts`, `apps/server/src/voice/mintToken.ts`, `apps/server/src/handlers/voiceHandlers.ts`, `apps/client/src/voice/connectVoice.ts`]

<details><summary>Original findings (pre-patch)</summary>

- [ ] [Review][Decision] Reconciler has no teardown branch — `desired === null` while connected leaves a stale (possibly-publishing) connection alive — `computeVoiceAction` returns `{none}` whenever `deriveDesiredScope` yields `null` (facilitator/un-teamed/self-removed-from-roster), and `useVoiceScopeSync` has no `disconnect` path. A player connected + publishing into a Bomb Room who transitions to a null-desired scope keeps the old mic-live connection. NOT reachable via `TEAM_ASSIGN` today (payload whitelisted to defuser/expert/spectator × team A/B → always a resolvable scope), and `removePlayerFromSession` is lobby-phase-only — so low reachability now, but it is exactly the stale-publishing-leak class this story targets, and the server's `resolveVoiceScope` treats a teamless Bomb-Room role as an *error*. Decision: should the reconciler `disconnect()` when `desired === null` while connected, or is leaving it deliberately out-of-scope (documented in `computeVoiceAction.ts:41-52` as owned by later stories)? [`apps/client/src/voice/computeVoiceAction.ts:107`, `apps/client/src/voice/useVoiceScopeSync.ts:42`]
- [ ] [Review][Decision] AC #5 literal deviation — `unavailable`-after-connect is never auto-re-minted — AC #5 text lists re-mint-eligible states as `connecting`/`connected`/**`unavailable`-after-connect**, but `computeVoiceAction` gates strictly to `status === 'connected'`. A player who drops to `unavailable` (transport blip) and is then reassigned stays showing the *old* room's affordance until they manually Reconnect (3.6) or a self-heal flips them back to `connected`. Dev documented this as deliberate (`computeVoiceAction.ts:98-100`). Decision: amend AC #5 text to match the connected-only behavior, or extend the reconciler to cover `unavailable`. [`apps/client/src/voice/computeVoiceAction.ts:106`]
- [ ] [Review][Patch] `publish` uses client intent, not the server-authoritative grant — token-window re-flip can strand a player — the `VOICE_TOKEN` grant payload carries the server-derived `room` but not `canPublish`; `connect()` pairs that room with the caller's stale `publish` flag. On a rapid double-reassign within the token window (Spectator→Defuser→Spectator), the token resolves to `spectator-lounge` while `publish:true` still fires `getUserMedia` → an unexpected mic prompt for a listen-only spectator (violates Story 3.3 AC #2) and a publish the `canPublish:false` grant rejects → stuck `unavailable` (which the reconciler won't auto-recover). Fix: add `canPublish` to the grant payload and have `connect()` derive `publish` from the authoritative grant, not caller intent. Rare race, but the consequence is a real permission/UX leak. [`apps/client/src/voice/connectVoice.ts`, `packages/shared/src/events/payloads.ts`]

</details>
