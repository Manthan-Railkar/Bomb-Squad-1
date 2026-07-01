---
baseline_commit: 517151d7df62e579ae43bcb0a47ca7188cac2036
---

# Story 3.7: Bomb Room → Spectator Lounge One-Way Audio Bridge

Status: review

> ## Mechanism note — audio bridge is an `@livekit/rtc-node` relay bot (Jay decision 2026-07-01)
>
> The original design used `RoomServiceClient.forwardParticipant`. The real-LiveKit integration
> test proved that RPC is **not implemented on self-hosted LiveKit** (`twirp error: not implemented`
> on v1.13.1 AND latest v1.13.2, with/without Redis routing — it's a Cloud/unreleased feature). See
> the `livekit-forwardparticipant-not-implemented-oss` memory.
>
> **Resolution (Jay picked option 1):** the bridge is now a per-session **relay bot** — a headless
> `@livekit/rtc-node` participant (`apps/server/src/voice/loungeRelayBot.ts`) that joins the active
> Bomb Room with `canSubscribe:true, canPublish:false` (listens) AND the lounge with
> `canPublish:true, canSubscribe:false` (speaks), and pumps each Bomb-Room audio track's frames into
> a mirror track it publishes in the lounge. The one-way boundary is **structural** — the bot's
> Bomb-Room token literally cannot publish, its lounge token literally cannot subscribe, so audio can
> only flow Bomb Room → Lounge. `autoSubscribe` picks up late joiners natively, so **the webhook
> (Task 6) was removed** — a room-subscribing bot needs no per-participant trigger.
>
> **This is proven working end-to-end** against a real LiveKit container: the bot integration test
> (`RUN_LIVEKIT_IT=1`) connects a real publisher to the Bomb Room and a real listener to the lounge,
> and the listener actually receives the bot-published bridged track; a second test confirms the
> Bomb-Room peer never receives a `#bridge` track (one-way). `LoungeBridge`'s public surface
> (`bridgeActiveTeam`/`unbridgeAll`) and the game-lifecycle hooks are unchanged — only its internals
> swapped from `forwardParticipant` to bot spawn/stop. Task 10 (Jay's human-audible ≥3-browser
> check) still outstanding.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a spectator or resting-team player,
I want to hear the active team's Bomb Room from the Spectator Lounge (and talk to the other people in the lounge),
so that spectating the live round is meaningful — and my chatter can never leak into the Bomb Room the active team is using.

## Acceptance Criteria

From epics.md (Story 3.7, lines 675–695) plus the topology invariants this story must not regress. **Two coordinated deliverables**: (A) make the resting team + spectators an *audience in the lounge* (relay-aware scope), and (B) *forward the active Bomb Room's audio into that lounge* (server-side one-way bridge).

1. **Active Bomb Room audio is forwarded one-way into the lounge (AC #1, `game-architecture.md:332`).** Given a live round (`status ∈ {preparation, active}`) with an active team, when spectators / resting-team players are in `spectator-lounge:{sessionId}`, then the **active** team's Bomb Room audio (`bomb-room:{sessionId}:{activeTeamId}`) is forwarded one-way into the lounge so every lounge participant hears it. Forwarding follows late joins and reconnects of active-team participants for the whole round.

2. **One-way boundary, enforced at the topology/grant level — not the UI (AC #2).** Given any lounge participant (spectator, resting-team player, or facilitator), when they speak, then their audio is delivered to other lounge members **but is never injected into any Bomb Room**. The boundary is structural: no lounge member is ever a member of a Bomb Room, and the bridge only ever forwards Bomb Room → Lounge (never the reverse). This is verified explicitly — it is a confidentiality boundary, not a feature toggle.

3. **Lounge participants can talk to each other (AC #2, Jay decision 2026-07-01 — bidirectional lounge).** Given spectators and resting-team players in the lounge, when they speak, then they are heard by other lounge members and the facilitator. Spectator + resting-team + facilitator lounge grants are `canPublish: true` **in the lounge**. This reinterprets FR39: "spectator listen-only" means *listen-only with respect to the Bomb Room* (they can never publish INTO a bomb room), **not** "cannot publish at all." The pre-3.7 `resolveVoiceScope` gave spectators `canPublish:false`; this story changes that to `true`.

4. **Relay rotation re-mints active ↔ resting to the correct room (AC #3, pairs with 3.5).** Given relay rotation changes which team is active, when the turn flips (a `SESSION_STATE` with a new `activeTeamId`), then each affected Bomb-Room participant's **effective voice scope** flips (active team → their Bomb Room; resting team → the Lounge, listen-to-the-active-bomb + talk-in-lounge) and a **fresh** token is minted for the new room — the old token is never reused. This rides Story 3.5's existing re-mint mechanism (`computeVoiceAction` + `useVoiceScopeSync`): 3.7 only has to change *what scope the server assigns*, and the client re-mints for it.

5. **Voice never gates the game / graceful degradation preserved (3.6).** Given the bridge (forward/webhook/RoomService admin call) fails, when the failure is detected, then it is logged and the game continues unaffected — no game-state transition is blocked, no `ROUND_START`/`PREPARATION_OPEN`/resolve is gated on a LiveKit admin call succeeding, and any client whose re-mint fails routes through the existing `unavailable` banner + "Reconnect voice" affordance.

6. **Bridge is torn down when the round ends / turn flips.** Given the active round resolves, the turn flips, or the session ends, when the transition is applied, then the previous active team's forwarded tracks are removed from the lounge (`removeParticipant` on the destination room stops the forward) so a stale bomb room never keeps playing into the lounge.

7. **Server scope derivation stays authoritative + stateless (regression on 3.1/3.5).** Given any `VOICE_TOKEN` request, when the server mints, then it derives room + grants from current authoritative `SessionState` (now including `activeTeamId` + `status`), never from client payload; tokens are never logged; and the shared `resolveVoiceScope` remains the single source of truth for client and server (no drift).

## Tasks / Subtasks

- [x] **Task 1 — Make the shared voice-scope helper relay-aware (AC: 3, 4, 7)**
  - [x] In `packages/shared/src/voice/scope.ts`, add an optional `activeTeamId?: TeamId` to `VoiceScopeParticipant`.
  - [x] Change the **spectator** grant to `canPublish: true` (bidirectional lounge — AC #3). Facilitator stays `canPublish: true`. (Lobby branch unchanged — everyone already `canPublish:true` there for the mic check.)
  - [x] Add the **relay-aware resting-team rule** for `defuser`/`expert`: when `phase ∈ {'preparation','active'}` **and** `activeTeamId !== undefined` **and** `teamId !== activeTeamId` → the player is **resting** → resolve to `spectatorLoungeName(sessionId)` with `canPublish: true` (they join the lounge, hear the bridged active bomb, and talk to the lounge). Otherwise (active team, or no live round / `activeTeamId` undefined / between-rounds / ended) → their own `bombRoomName(sessionId, teamId)`, `canPublish: true` (unchanged).
  - [x] Keep the `VoiceScopeError` "Bomb Room role with no team, outside lobby" contract intact — the resting-team branch still requires a `teamId` (a resting player has a team; that is how we know they are resting).
  - [x] Keep `packages/shared` free of `livekit-server-sdk`/`react`/`socket.io` — still pure TS returning plain data.
  - [x] Unit tests in `packages/shared/src/__tests__/voiceScope.test.ts` (extend existing): active-team defuser/expert → own bomb room; resting-team defuser/expert (`teamId !== activeTeamId`, phase active/preparation) → lounge `canPublish:true`; **spectator → lounge `canPublish:true`** (the changed grant); `activeTeamId` undefined → bomb room (no relay routing); between-rounds/ended → bomb room; lobby → lobby room for all (unchanged).

- [x] **Task 2 — Thread `activeTeamId`/`status` through the server mint path (AC: 4, 7)**
  - [x] `apps/server/src/voice/mintToken.ts`: add `activeTeamId?: TeamId` to `VoiceParticipant`; pass it into the shared `resolveVoiceScope` call (server keeps `VideoGrant` shaping + `roomJoin:true`). No behavior lives here — it delegates.
  - [x] `apps/server/src/handlers/voiceHandlers.ts`: the handler already loads authoritative `state`. Pass `activeTeamId: state.activeTeamId` (alongside the existing `phase: state.status`) into `mintVoiceToken`. Nothing else changes — the mint stays stateless and derived only from loaded state.
  - [x] Extend `apps/server/src/handlers/__tests__/voiceHandlers.test.ts`: a resting-team defuser (state has `activeTeamId` = the *other* team, `status:'active'`) gets a lounge token; the active-team defuser gets a bomb-room token; token never logged.

- [x] **Task 3 — Client: mirror the relay-aware scope so 3.5's re-mint fires on turn flip (AC: 4, 5)**
  - [x] `apps/client/src/voice/computeVoiceAction.ts` → `deriveDesiredScope`: thread the session's `activeTeamId` into the shared `resolveVoiceScope` call (currently passes only `role/sessionId/teamId/phase`). Update the "roles this manages" guard so a **resting** Bomb-Room participant now resolves to a lounge desired scope (today it resolves to its own bomb room and never moves) — i.e. do NOT early-return for the resting case; let the shared helper decide. Spectators already resolve to the lounge (now `publish:true`).
  - [x] Update the caller in `apps/client/src/ui/useVoiceScopeSync.ts` / `VoiceController.tsx` to pass `session.activeTeamId` into `deriveDesiredScope`. The re-mint decision (`computeVoiceAction`) is unchanged — it already compares the full `{room, publish}` tuple, so the turn-flip room change triggers a `reconnect` "for free" (AC #4). Never auto-connect from `idle` (3.5 AC #5 preserved).
  - [x] Extend `apps/client/src/voice/__tests__/computeVoiceAction.test.ts`: turn flip active→resting while connected ⇒ reconnect to lounge (`publish:true`); resting→active ⇒ reconnect to own bomb room; spectator across a flip ⇒ stays lounge (no reconnect — same room+publish).

- [x] **Task 4 — Client: lounge members publish (mic), and render forwarded speakers (AC: 3)**
  - [x] `apps/client/src/ui/VoiceController.tsx`: the lounge mode currently hard-codes `publish = isBombRoomParticipant` (spectator → listen-only). Change so lounge members connect with `publish: true` (they can talk). Reuse the shared scope's `canPublish` rather than re-deriving `publish` from role, to avoid drift. Keep the gesture-gated first connect (mic + autoplay need the click) and the self-mute control (3.4) available for lounge members now that they publish.
  - [x] Confirm forwarded Bomb-Room participants (LiveKit `ParticipantKind.Forwarded`, **same `identity`/playerId** as the source) are subscribed + played by the existing `playRemoteAudio` path (`apps/client/src/voice/connectVoice.ts`) and mapped in the speaker/roster attribution (2.5/3.4 map participants→roster by identity). They are remote/read-only — the client must not try to mute or treat them as local. Add a note/guard if the roster assumes lounge members only.
  - [x] Microcopy: the lounge is no longer "listen-only." Adjust `VOICE_LOUNGE_*` copy in `apps/client/src/ui/copy.js` to reflect "you can talk in the lounge; you're hearing the live Bomb Room." Keep the `unavailable` banner + Reconnect (3.6) untouched.

- [x] **Task 5 — Server: `LoungeBridge` + `loungeRelayBot` (AC: 1, 2, 6)** — *implemented as an `@livekit/rtc-node` relay bot after the integration test proved `forwardParticipant` is unimplemented on OSS LiveKit (Jay decision). Original forwardParticipant sub-tasks superseded.*
  - [x] New `apps/server/src/voice/loungeRelayBot.ts`: `createLoungeRelayBot(opts)` returns a `RelayBot` (`start`/`stop`). `start()` connects a headless `@livekit/rtc-node` participant to the active Bomb Room (`canSubscribe:true, canPublish:false`) and the lounge (`canPublish:true, canSubscribe:false`) — the one-way boundary is structural (its tokens physically can't do the reverse). On each Bomb-Room `TrackSubscribed` (audio) it publishes a mirror track into the lounge and pumps frames via `AudioStream`→`AudioSource`. `autoSubscribe` handles late joiners (this is why the webhook is unneeded). `stop()` cancels the pumps + disconnects both rooms. Uses shared room-name builders + `BRIDGE_IDENTITY_PREFIX` (`#bridge`).
  - [x] Refactor `apps/server/src/voice/loungeBridge.ts` into a bot LIFECYCLE manager: `Map<sessionId, RelayBot>` via an injected `RelayBotFactory`; `bridgeActiveTeam(sid, team)` tears down any prior bot then spawns+starts a new one; `unbridgeAll(sid)` stops+forgets it. Best-effort (a bot that fails to start/stop is swallowed + logged, never throws — AC #5). No Socket.IO/reducer imports.
  - [x] Unit test `apps/server/src/voice/__tests__/loungeBridge.test.ts` with a FAKE bot factory: one bot per session; a re-bridge stops the prior + starts a new; unbridge stops+forgets (second is a no-op); throwing start/stop are swallowed; bridges are per-session.
  - [x] Add `BRIDGE_IDENTITY_PREFIX` + `isBridgeIdentity` to `packages/shared/src/voice/scope.ts` (shared so the bot + client agree); client filters `#bridge` participants out of the speaker pills.

- [x] **Task 6 — ~~LiveKit webhook receiver~~ REMOVED (the room-subscribing bot makes it redundant)**
  - [x] The webhook existed only to trigger per-participant `forwardParticipant` for late joiners. A relay bot with `autoSubscribe:true` picks up anyone who (re)joins the Bomb Room natively, so `webhookRoutes.ts` + its test + the `livekit.yaml`/`livekit.dev.yaml` `webhook` blocks + the `WebhookReceiver` wiring in `index.ts` were all removed. `parseBombRoomName` (added for the webhook) is kept — it's covered by shared tests and is a useful pure inverse of the builder.

- [x] **Task 7 — Wiring: config, deps injection, docker-compose, livekit.yaml (AC: 1, 5)**
  - [x] **New env var** `LIVEKIT_SERVER_URL` (server-to-server HTTP admin URL, e.g. `http://livekit:7880` over the compose network; `http://localhost:7880` for a host-run server). Add to `apps/server/src/config/env.ts` `EnvSchema` + `Config` (required, `NonEmpty`), to `.env.example`, and to `docker-compose.yml` server env. **Do NOT reuse `LIVEKIT_URL`** — that is the browser-reachable `ws://localhost:7880` and is wrong for the Node admin API (it must be `http(s)://` and reachable from the server container). See the LiveKit WSL2 memory: browser-reachable vs node-reachable URLs are different axes.
  - [x] Construct `RoomServiceClient` / `LoungeBridge` once at boot in `apps/server/src/index.ts` (alongside `archive`), inject it into `SessionHandlerDeps` (add `loungeBridge: LoungeBridge`, mirroring the `archive` precedent at `index.ts:129`) and into the webhook route deps.
  - [x] `livekit.yaml` **and** `livekit.dev.yaml`: add a `webhook` block — `api_key: <the LIVEKIT_API_KEY>` and `urls: ["http://server:${PORT}/livekit/webhook"]` (server container name `server`, port defaults to `3001`). This makes the LiveKit container POST lifecycle events to our route over the compose network. Keep the prod/dev split convention (dev file only differs where it must).
  - [x] Verify the LiveKit container can reach the server container: both are on the compose network; the server listens on `0.0.0.0:${PORT}` (it already does — `index.ts:186`).

- [x] **Task 8 — Drive the bridge from game lifecycle transitions (AC: 1, 6)**
  - [x] In `apps/server/src/handlers/sessionHandlers.ts`, after the authoritative state write + `SESSION_STATE` broadcast (never before — voice must not gate the transition), call the bridge best-effort:
    - `PREPARATION_OPEN` handler (`openPreparation`, ~line 1094–1099): the new `activeTeamId` is set → `loungeBridge.unbridgeTeam(sessionId, <previous active team, if any>)` then `bridgeActiveTeam(sessionId, next.activeTeamId)`. (A sweep here bridges anyone already connected; the webhook covers later joins.)
    - Round resolve → between-rounds (the resolve path that flips `status:'between-rounds'`, ~line 1197) and `SESSION_END` (~line 1197/1205 area): `unbridgeTeam` the just-active team (tear down — AC #6). Simplest: `unbridge` all forwarded ghosts from the lounge (only one team is ever bridged).
  - [x] These calls are fire-best-effort (`.catch(log)`), synchronous-looking but non-blocking; they must not be `await`ed in a way that can fail the handler (AC #5). Follow the "handler owns I/O, best-effort side effect after the authoritative emit" shape.
  - [x] Handler test: after `PREPARATION_OPEN`, `bridgeActiveTeam` is invoked with the newly-selected `activeTeamId`; after resolve, `unbridgeTeam` is invoked; a thrown bridge error does NOT fail the handler or block the `SESSION_STATE` emit (mock `LoungeBridge`).

- [x] **Task 9 — Full test gate (AC: all)**
  - [x] `tsc --noEmit` clean across all three workspaces (no `// @ts-ignore`).
  - [x] Shared + server + client suites green; note counts vs baseline. Extend the sim-clients harness (td-5) only if a relay voice-routing assertion is cheap to add; otherwise leave it.
  - [x] Per project-context, LiveKit logic is integration-tested against a real container in CI — added `loungeBridge.integration.test.ts` (gated behind `RUN_LIVEKIT_IT=1`, skipped by default so CI without a container stays green). Run: `docker compose up -d livekit && RUN_LIVEKIT_IT=1 pnpm --filter @bomb-squad/server test -- loungeBridge.integration`. Covers the `RoomServiceClient` HTTP-admin seam (real URL/creds/colon room-names via create→list→delete), `bridgeActiveTeam`/`bridgeParticipant`/`unbridgeAll` best-effort behaviour against REAL LiveKit error responses, and `WebhookReceiver` rejecting unsigned bodies. The full 2-peer audio forward still needs a connected media peer (`@livekit/rtc-node` or a browser) → remains Jay's interactive Task 10.

- [ ] **Task 10 — Jay verifies interactively (human verification — required, not done until observed)**
  - [ ] In the Docker stack with ≥3 browsers in one session (an active-team defuser, a resting-team player, and a spectator), during a live round: (a) the active defuser speaks → **both** the resting player and the spectator hear them in the lounge; (b) the resting player and spectator speak → they hear **each other** (and the facilitator) but the active defuser **does NOT** hear them (the one-way boundary — verify by having the resting player say something the active team must not hear); (c) advance the turn → the previously-resting team becomes active (moves into its own Bomb Room, now bridged into the lounge) and the previously-active team drops into the lounge as an audience; (d) kill voice / LiveKit mid-round → the game keeps running and the banner appears (3.6). Record the observed result in Completion Notes. (Per the human-verification AC rule — the one-way boundary and the turn-flip re-mint are the two highest-risk points and MUST be observed.)

## Dev Notes

### What this story actually is (read first)

This story has **two coordinated halves** that only make sense together:

- **Half A — make the resting team an audience (client/shared scope):** In the current relay model (Story 8.11), the resting team keeps its `defuser`/`expert` roles; nobody reassigns them to `spectator`. So today a resting player's scope resolves to *their own* (silent) Bomb Room. Story 3.7 makes `resolveVoiceScope` **relay-aware**: during a live round, a Bomb-Room role whose team is **not** the active team resolves to the **Lounge** instead. Story 3.5 already built the client machinery to re-mint whenever the effective `{room, publish}` changes — so once the *scope derivation* moves the resting team to the lounge, 3.5's `useVoiceScopeSync` re-mints them there automatically (this is exactly the "3.7 rides this mechanism for free" seam that 3.5's Dev Notes and `computeVoiceAction.ts:48-52` call out).

- **Half B — actually pipe the active Bomb Room's audio into the lounge (server bridge):** Putting the resting team + spectators in the lounge is useless if the lounge is silent. The lounge today carries only the facilitator's voice — **there is no bridge/egress code anywhere** (confirmed: the only `livekit-server-sdk` import in the repo is `mintToken.ts`, importing only `AccessToken`/`VideoGrant`). Half B adds a server-side one-way forward of the active team's Bomb Room participants into the lounge using LiveKit's native `RoomServiceClient.forwardParticipant`.

Neither half alone delivers the story. Half A without Half B = a silent lounge. Half B without Half A = spectators hear the bomb but the resting team is stuck alone in their own room.

### The bridge mechanism — `forwardParticipant` (Jay decision: webhooks + game events)

LiveKit does not have "forward one room's mix into another room." The native primitive is **`RoomServiceClient.forwardParticipant(sourceRoom, identity, destinationRoom)`** (present in `livekit-server-sdk@2.15.4`, our installed version; supported by our `livekit/livekit-server:v1.13.1`). Its semantics are exactly the one-way bridge we need (from the SDK doc):

> Forwards a participant's track to another room. This creates a participant to join the destination room that has the same information as the source participant except the kind is `Forwarded`. All changes to the source participant are reflected to the forwarded participant. When the source participant disconnects or `RemoveParticipant` is called in the destination room, the forwarding stops.

Why this satisfies the ACs:
- **One-way (AC #2):** the forwarded "ghost" *publishes into* the lounge but never *subscribes to* it; the real source participant stays in the Bomb Room and never receives lounge audio. No lounge member is ever a member of a Bomb Room, so lounge chatter is structurally incapable of reaching a Bomb Room. This is the "enforced at topology level, not UI" the AC demands.
- **Follows the source (AC #1):** "all changes to the source participant are reflected" — mute/unmute of the active defuser propagate; disconnect auto-stops the forward.
- **Teardown (AC #6):** `removeParticipant(lounge, identity)` on the destination stops the forward.

**Do NOT use `moveParticipant`** — that *removes* the participant from the Bomb Room (the active team would lose each other). We want `forwardParticipant` (source stays, a read-only copy appears in the lounge).

**Trigger (Jay chose webhooks + game events):** `forwardParticipant` requires the source participant to already be connected, so a one-shot sweep at round start misses anyone who joins/reconnects mid-round. Two triggers together give correctness:
- **LiveKit webhooks** (`participant_joined` on the active bomb room → forward that identity; `participant_left` → auto-stop) handle the per-participant lifecycle robustly across reconnects/late joins.
- **Game events** (`PREPARATION_OPEN` sweeps the newly-active bomb room via `listParticipants`+forward; resolve/turn-flip/`SESSION_END` unbridges) handle the *which team is active* transition, which LiveKit knows nothing about.

### Relay-aware scope rule (exact — implement in shared `resolveVoiceScope`)

`SessionState.status` union is `'lobby' | 'preparation' | 'active' | 'between-rounds' | 'ended'` (`packages/shared/src/types/session.ts:105`). The relay routing applies **only** during a live round:

```
lobby                         → lobby:{sid},            publish:true  (all roles — mic check, unchanged)
spectator (non-lobby)         → spectator-lounge:{sid}, publish:true  (CHANGED from false — bidirectional lounge)
facilitator (non-lobby)       → spectator-lounge:{sid}, publish:true  (unchanged)
defuser/expert, phase∈{preparation,active}, activeTeamId set, teamId !== activeTeamId
                              → spectator-lounge:{sid}, publish:true  (RESTING — new)
defuser/expert, otherwise     → bomb-room:{sid}:{teamId}, publish:true (ACTIVE team / no live round — unchanged)
```

- The resting branch **still requires a `teamId`** (a resting player has a team — that is how we know they are resting). The teamless-bomb-role `VoiceScopeError` contract is unchanged.
- When `activeTeamId` is `undefined` (lobby, between-rounds, ended) there is no relay routing → Bomb-Room roles resolve to their own room. Between rounds the teams simply regroup in their own bomb rooms; the bridge is torn down. That is acceptable and intentional.
- FR39 reinterpretation is deliberate and is **Jay's 2026-07-01 decision**: "spectator listen-only" = cannot publish *into a Bomb Room*, not *cannot publish at all*. The lounge is bidirectional among its members. This flips the current `scope.ts` spectator grant from `false` to `true` and means **spectators now acquire a mic on connect** (a UX change from Story 3.3's silent listen-only lounge — call it out; it is intended, not a regression).

### Server-to-server URL vs browser URL (critical config gotcha)

`RoomServiceClient` and `WebhookReceiver` run **on the server, talking to the LiveKit container's HTTP API** — they need an `http(s)://` URL reachable from the *server* process (`http://livekit:7880` in compose; `http://localhost:7880` host-run). `LIVEKIT_URL` in the existing config is `ws://localhost:7880` — the **browser-reachable** WebSocket URL handed to clients in the token grant. **These are different axes** (see the `livekit-wsl2-localhost-voice-verification` memory: browser-reachable vs node_ip are independent). Add a new `LIVEKIT_SERVER_URL` env var; do not overload `LIVEKIT_URL`.

### Where the lifecycle transitions fire (server hook points)

- **`PREPARATION_OPEN`** → `openPreparation(state)` sets the new `activeTeamId` (`apps/server/src/handlers/sessionHandlers.ts:1094`, broadcast at `:1099`). Hook the `unbridge(prev)`+`bridgeActiveTeam(next.activeTeamId)` **after** the `SESSION_STATE` emit.
- **Round resolve → `between-rounds`** and **`SESSION_END`** (`sessionHandlers.ts:~1197`, `:1205`) → `unbridgeTeam` the just-active team after the emit.
- `activeTeamId` is set by `openPreparation`, consumed by `startRound`, cleared by `endSession` (`apps/server/src/session/endSession.ts:21`). `selectActiveTeam` (`packages/shared/src/session/relay.ts:158`) is the shared snake-rule source; you read `state.activeTeamId` (already committed) — do not recompute.
- All bridge calls sit in the **handler** (I/O layer), after the authoritative reduce+emit, as best-effort side effects. Reducers never touch LiveKit (project-context: no I/O in reducers).

### Client wiring details (build on 3.5, do not rebuild)

- `deriveDesiredScope` (`apps/client/src/voice/computeVoiceAction.ts:54`) currently early-returns `null` for anything but a teamed Bomb-Room participant or a spectator, and passes only `role/sessionId/teamId/phase`. Change: pass `activeTeamId` too, and let the shared helper route the resting case to the lounge (remove the assumption that a defuser/expert always means "their bomb room"). `computeVoiceAction` (`:102`) is unchanged — it already reconnects on any `{room, publish}` tuple change, which is precisely the turn-flip signal.
- Self identity via `gameStore.myPlayerId` (durable id), **never** `getSocket().id` — `players` is keyed by durable playerId (Story 2.7; see `identity-key-change-needs-client-sweep` memory + `VoiceController.tsx:47-50`).
- `VoiceController.tsx:89` hard-codes `const publish = isBombRoomParticipant;`. Replace with the shared scope's `canPublish` so lounge members publish. Preserve the gesture-gated first connect and 3.4 self-mute.
- Forwarded participants arrive with `ParticipantKind.Forwarded` and the **same identity** as the active source player. `playRemoteAudio` (`apps/client/src/voice/connectVoice.ts:111`) already plays all remote audio, so they are audible with no change. The only care point: roster/speaker attribution (2.5/3.4) maps by identity — a forwarded active defuser will show as a lounge speaker (desirable). Under our topology a real lounge member and a forwarded ghost can never share an identity (a player is in exactly one room), so no collision.

### One-way boundary — the thing to verify hardest (AC #2)

The confidentiality boundary is the whole point of the story. It holds because:
1. Scope routes every participant to **exactly one** room. A resting/spectator player is in the *lounge*, never a bomb room. So they cannot publish into a bomb room — there is no token that lets them.
2. The bridge only ever forwards **bomb room → lounge**. There is no reverse forward. The active team never receives lounge audio.
3. `forwardParticipant` ghosts are read-only in the destination and do not subscribe to it.

Jay's interactive check (Task 10b) exists specifically to *observe* that a resting player's speech does not reach the active team. Do not treat this as covered by unit tests alone.

### Testing standards summary

- **Pure logic** (shared `resolveVoiceScope` relay branch, `parseBombRoomName`, client `deriveDesiredScope`) → Jest unit, zero infra, table-driven.
- **`LoungeBridge`** → unit test with a mock `RoomServiceClient` (assert `forwardParticipant`/`removeParticipant`/`listParticipants` call args; per-participant failure is swallowed + logged). Do **not** mock the pure scope/room-name helpers — call them.
- **Webhook route** → `fastify.inject()` with a genuinely-signed `WebhookReceiver` payload (valid + invalid signature); mock `LoungeBridge` + a fake `RedisStore`. Assert active-team join forwards, resting-team join does not, bad signature 401s.
- **Session handler** → existing in-memory `RedisStore` integration pattern (`apps/server/src/handlers/__tests__/sessionHandlers.test.ts`); assert bridge called on prepare/resolve and a bridge failure never fails the handler.
- **LiveKit real-container integration** (project-context rule) → attempt a lightweight forward assertion against the compose LiveKit; if infeasible in this story, document + defer, and lean on Jay's interactive check for the end-to-end audio path.
- Forbidden: never log the token or webhook secret; never assert opaque JWT strings (decode claims); spectator/resting `canPublish` assertions are non-negotiable.

### Project Structure Notes

- **Shared:** extend `packages/shared/src/voice/scope.ts` (relay branch + `parseBombRoomName`); tests in `packages/shared/src/__tests__/`. No new files strictly required (add a parser beside the builders).
- **Server (new):** `apps/server/src/voice/loungeBridge.ts` (+ `__tests__/loungeBridge.test.ts`); a webhook route module (e.g. `apps/server/src/handlers/webhookRoutes.ts` or inline in `index.ts`'s `buildServer` — prefer a small registered module for testability with `fastify.inject()`).
- **Server (edit):** `mintToken.ts` (thread `activeTeamId`), `voiceHandlers.ts` (pass `state.activeTeamId`), `sessionHandlers.ts` (bridge on prepare/resolve; add `loungeBridge` to `SessionHandlerDeps`), `config/env.ts` (`LIVEKIT_SERVER_URL`), `index.ts` (construct + inject `LoungeBridge`, register webhook route).
- **Client (edit):** `voice/computeVoiceAction.ts`, `ui/useVoiceScopeSync.ts`/`VoiceController.tsx` (thread `activeTeamId`, publish flag), `ui/copy.js` (lounge microcopy).
- **Infra:** `docker-compose.yml` (+ `.env.example`) new `LIVEKIT_SERVER_URL`; `livekit.yaml` + `livekit.dev.yaml` `webhook` block.
- **No new Socket.IO event** — Half A rides the existing `SESSION_STATE`/`VOICE_TOKEN` pull; Half B is server-internal (admin API + inbound webhook). Do not add a server→client "bridge now" push.

### References

- [Source: _agent_docs/planning-artifacts/epics.md#Story 3.7] (lines 675–695) — AC source (one-way bridge; lounge members talk to each other but never into the bomb room; active↔resting re-mint pairs with 3.5).
- [Source: _agent_docs/game-architecture.md#Pattern 7 — LiveKit Voice Topology] (lines ~316–334) — two rooms per session; `bomb-room:{sid}:{teamId}` bidirectional, `spectator-lounge:{sid}` receives Bomb Room track; "Spectator Lounge one-way bridge ... verify explicitly; it is a confidentiality boundary."
- [Source: packages/shared/src/voice/scope.ts] — `resolveVoiceScope` (l.90), `bombRoomName` (l.45), `spectatorLoungeName` (l.49), `VoiceScopeParticipant` (l.57), `VoiceScopeError` (l.37) — the file to make relay-aware.
- [Source: packages/shared/src/types/session.ts] — `status` union (l.105), `activeTeamId` (l.168), `PlayerRole`/`TeamId`.
- [Source: packages/shared/src/session/relay.ts] — `selectActiveTeam` (l.158) snake rule; the authority for which team is active.
- [Source: apps/server/src/voice/mintToken.ts] — `VoiceParticipant` (l.29), `resolveVoiceScope` delegating to shared (l.67), `mintVoiceToken` (l.89) — thread `activeTeamId` here.
- [Source: apps/server/src/handlers/voiceHandlers.ts] — `VOICE_TOKEN` handler (l.68); already loads `state`; pass `state.activeTeamId` at the `mintVoiceToken` call (l.109–121).
- [Source: apps/server/src/handlers/sessionHandlers.ts] — `SessionHandlerDeps` (l.93, `archive` at l.101 = injection precedent); `PREPARATION_OPEN`/`openPreparation` (l.1094–1099); resolve/`SESSION_END` (~l.1197, l.1205) — bridge/unbridge hook points (after the `SESSION_STATE` emit).
- [Source: apps/server/src/session/openPreparation.ts / startRound.ts / endSession.ts] — `activeTeamId` set/consumed/cleared lifecycle.
- [Source: apps/server/src/index.ts] — `buildServer` Fastify+Socket.IO (l.35–58); handler deps wiring (l.129–143); `fastify.listen 0.0.0.0` (l.186) — where to register the webhook route + construct `LoungeBridge`.
- [Source: apps/server/src/config/env.ts] — `EnvSchema`/`Config` (add `LIVEKIT_SERVER_URL`); `LIVEKIT_URL` is the browser `ws://` URL (do not reuse).
- [Source: apps/client/src/voice/computeVoiceAction.ts] — `deriveDesiredScope` (l.54, note l.48–52 "active↔resting arrives with Story 3.7"), `computeVoiceAction` (l.102).
- [Source: apps/client/src/voice/connectVoice.ts] — `connectVoice({publish})`/`reconnectVoice` (l.556+), `playRemoteAudio` (l.111), fresh-token `requestVoiceToken` (l.88), `connectEpoch` guard.
- [Source: apps/client/src/ui/VoiceController.tsx] — role-mode + `publish = isBombRoomParticipant` (l.89, change this), durable-id self lookup (l.47–50), 3.6 banner/Reconnect (l.117–138).
- [Source: apps/client/src/ui/useVoiceScopeSync.ts] — re-mint effect hosting (thread `activeTeamId`).
- [Source: docker-compose.yml] — `livekit/livekit-server:v1.13.1` (l.43), server port `${PORT:-3001}` (l.141), compose network; `livekit.yaml` / `livekit.dev.yaml` — add the `webhook` block.
- [Source: _agent_docs/implementation-artifacts/3-5-token-re-mint-on-role-change.md] — the re-mint mechanism 3.7 rides; "scope boundary vs 3.7" Dev Note (the seam this story fills).
- [Source: _agent_docs/implementation-artifacts/3-6-graceful-voice-degradation.md] — `unavailable` banner + Reconnect resilience (AC #5).
- [Source: _agent_docs/implementation-artifacts/8-11-sequential-round-orchestration.md] — relay model: resting team keeps its roles (why scope must become relay-aware, not role-reassignment).
- [Source: LiveKit JS Server SDK — RoomServiceClient] — `forwardParticipant(room, identity, destinationRoom)` semantics (installed `livekit-server-sdk@2.15.4` `dist/RoomServiceClient.d.ts:136–158`); `WebhookReceiver`. https://docs.livekit.io/reference/server-sdk-js/classes/RoomServiceClient.html

### Project Context Rules

From `_agent_docs/project-context.md` — the rules that bind this story:

- **Voice/LiveKit gotchas (verbatim):** "The Spectator Lounge receives Bomb Room audio as a one-way listen-only track — spectators must never be able to send audio into the Bomb Room channel." Half B implements the *forward* side; the "never into the Bomb Room" side is the AC #2 boundary (structural, per the topology above). "Participant tokens must be regenerated on role change — do not reuse the same token" → the turn-flip re-mint (AC #4) via 3.5. "Test the facilitator PTT bridge / voice topology explicitly — most likely failure point" → Task 10 is mandatory.
- **`packages/shared` has zero runtime deps on `react`/`socket.io`/server frameworks and no `livekit-server-sdk`** — the relay-aware scope + `parseBombRoomName` stay pure TS. The `RoomServiceClient`/`WebhookReceiver` live only in `apps/server`.
- **Socket.IO / shared types:** the scope helper + room-name builders/parsers are the single source of truth imported by both sides — never duplicate room-string formatting.
- **Voice never gates game state:** all bridge calls are best-effort side effects in handlers, after the authoritative reduce+emit; a LiveKit admin/webhook failure must never block a game transition (AC #5). Reducers never touch LiveKit or emit sockets.
- **Security:** tokens + webhook secret are secrets — never logged; the webhook route MUST verify the LiveKit signature (an unsigned webhook can drive admin actions); grants derived from authoritative state only, never client payload; TTLs bounded (existing `MAX_VOICE_TOKEN_TTL_S`).
- **Build gate:** `tsc --noEmit` zero errors before commit; no `// @ts-ignore`; TypeScript only; separate tsconfig per workspace.
- **LiveKit voice logic is integration-tested against a real container in CI** — do not mock the SDK surface for the token path; for the bridge, mock `RoomServiceClient` in unit tests but pursue/park a real-container integration test (Task 9) and rely on Jay's interactive verification for the end-to-end audio + one-way boundary.
- **Commit on master, no branch unless Jay asks** (`commit-on-master-no-branch-unless-asked` memory).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (gds-dev-story)

### Debug Log References

- Final gate (2026-07-02, after the relay-bot rework): `tsc --noEmit` clean across
  shared / server / client / sim-clients. Suites: shared **237** passed, server **558**
  passed + **2 skipped** (the `RUN_LIVEKIT_IT` bot integration), client **431** passed.
  (Server dropped 569→558 vs the forwardParticipant version: −8 removed webhook-route tests,
  −3 `LoungeBridge` unit tests reshaped 10→7 for the bot manager.)
- Real-LiveKit bot integration (`docker compose up -d livekit`, v1.13.1,
  `RUN_LIVEKIT_IT=1 pnpm --filter @bomb-squad/server test -- loungeBridge.integration`): **2/2 pass**
  — a real lounge peer RECEIVES the bot-published bridged Bomb-Room track; the Bomb-Room peer never
  receives a `#bridge` track (one-way). This is the end-to-end audio-topology proof.

### Completion Notes List

- **⚠️ MECHANISM CHANGED forwardParticipant → relay bot (2026-07-01, Jay decision).** The
  real-LiveKit integration test proved `RoomServiceClient.forwardParticipant` is unimplemented on
  self-hosted LiveKit (`not implemented` on v1.13.1 + latest v1.13.2). Half B was re-implemented as
  a per-session `@livekit/rtc-node` **relay bot** (`apps/server/src/voice/loungeRelayBot.ts`): joins
  the active Bomb Room listen-only + the lounge publish-only, mirrors each Bomb-Room audio track's
  frames into the lounge. One-way is structural (asymmetric bot tokens). `LoungeBridge` is now a bot
  LIFECYCLE manager (`Map<sid, bot>` via an injected factory) — its `bridgeActiveTeam`/`unbridgeAll`
  surface + the game-lifecycle hooks are UNCHANGED. The **webhook was removed** (a room-subscribing
  bot with `autoSubscribe` handles late joiners natively). `RoomServiceClient`/`WebhookReceiver` are
  gone from the server. `LIVEKIT_SERVER_URL` is retained and now ALSO used to derive the bot's ws://
  URL (http→ws). Client filters `#bridge` identities from speaker pills (`isBridgeIdentity`, shared).
  Proven working end-to-end (see Debug Log). The notes below describe the superseded forwardParticipant
  path where they still apply (relay-aware scope / lifecycle hooks are unchanged and correct).
- **Two halves, both landed.** (A) `packages/shared/src/voice/scope.ts` is now relay-aware:
  `VoiceScopeParticipant.activeTeamId` added; spectator grant flipped `canPublish` false→true
  (bidirectional lounge — Jay decision); a `defuser`/`expert` whose `teamId !== activeTeamId`
  during `preparation`/`active` resolves to the lounge (resting audience). `parseBombRoomName`
  added beside the builders (webhook uses it — no format drift). (B) server-side one-way bridge
  via `RoomServiceClient.forwardParticipant`.
- **Server already threaded `canPublish` to the client** (HEAD had advanced past the 3.5 story
  file's File List): `VoiceController`/`MuteControl` now key off the authoritative grant, so
  making the lounge bidirectional "just worked" client-side — the mute control migrated from a
  role gate to `voiceStore.publishing` so lounge publishers get it too.
- **`LoungeBridge`** (`apps/server/src/voice/loungeBridge.ts`) wraps a narrow `RoomForwarder`
  slice of `RoomServiceClient` (2nd SDK import site). Tracks forwarded identities in-memory
  (the installed `@livekit/protocol` enum has no `Forwarded` kind to filter on) — `bridgeParticipant`
  (idempotent), `bridgeActiveTeam` (round-open sweep), `unbridgeAll` (resolve/end teardown). Every
  method best-effort: catches + logs, never throws.
- **Webhook** (`apps/server/src/handlers/webhookRoutes.ts`): `POST /livekit/webhook` with a
  dedicated `application/webhook+json` raw-body parser (verifier hashes exact bytes) +
  `WebhookReceiver` verification (401 on bad sig). `participant_joined` on the ACTIVE bomb room →
  `bridgeParticipant`; resting-team / non-live / non-bomb-room / unknown-session → ignored (200).
  Leaves auto-stop (no action). `verify` injected for testability.
- **Trigger = webhooks + game events (Jay decision):** `PREPARATION_OPEN` sweeps+bridges the new
  active team (after the authoritative emit); the round-resolve ceremony (`resolveRound.ts`, the
  single funnel for defuse/explode/time-expired/strike-3) unbridges on between-rounds entry;
  `SESSION_END` unbridges (belt-and-suspenders). All fire-and-forget with `.catch(()=>{})` —
  voice never gates a transition (AC #5). Teardown is race-free: unbridge always runs while the
  just-active team is still in its Bomb Room (it only re-mints to the lounge on the NEXT open).
- **`LIVEKIT_SERVER_URL`** (new required env): server→LiveKit HTTP admin URL, DISTINCT from the
  browser `ws://` `LIVEKIT_URL` (WSL2 memory: browser- vs node-reachable are different axes).
  Compose sets `http://livekit:7880`; `.env.example` documents host-run `http://localhost:7880`.
  `livekit.yaml` + `livekit.dev.yaml` gained a `webhook` block pointing at `http://server:3001/livekit/webhook`.
- **`SessionHandlerDeps.loungeBridge` is OPTIONAL** (structural `LoungeBridgePort`) so the ~25
  existing `registerSessionHandlers`/`registerModuleHandlers`/timer test call sites compile
  unchanged and a bridge-less server is fully functional (voice just doesn't bridge).
- **Real-container LiveKit integration test: ADDED + now proves the bot end-to-end.**
  `apps/server/src/voice/__tests__/loungeBridge.integration.test.ts`, gated `RUN_LIVEKIT_IT=1`
  (skipped by default → CI stays green). Against `docker compose up -d livekit` (v1.13.1): **2/2
  pass** — (1) a real lounge peer receives the bot-published bridged Bomb-Room track; (2) the
  Bomb-Room peer never receives a `#bridge` track (one-way, structural). This is exactly the test
  that first caught the `forwardParticipant` blocker, then confirmed the relay-bot replacement works.
- **`@livekit/rtc-node` added as a server devDependency** — powers the relay bot (prod) and the
  real-peer integration test. (Runtime for the bot; the bot code ships, so it's effectively a runtime
  dep imported by `loungeRelayBot.ts` — installed via `pnpm --filter @bomb-squad/server add`.)
- **sim-clients harness NOT extended** — no LiveKit/voice leg; a relay voice assertion isn't cheap there.
- **Task 10 (Jay interactive ≥3-browser verify) OUTSTANDING** — per the human-verification AC rule
  the story stays in `review` until Jay observes the audible one-way boundary + turn-flip re-mint.

### File List

- `packages/shared/src/voice/scope.ts` — relay-aware `resolveVoiceScope` (+`activeTeamId`), spectator `canPublish` true, `parseBombRoomName`
- `packages/shared/src/__tests__/voiceScope.test.ts` — relay routing + spectator-publish + `parseBombRoomName` tests
- `apps/server/src/voice/mintToken.ts` — thread `activeTeamId` through `VoiceParticipant`/`resolveVoiceScope`
- `apps/server/src/handlers/voiceHandlers.ts` — pass `state.activeTeamId` into the mint
- `apps/server/src/handlers/__tests__/voiceHandlers.test.ts` — relay routing + bidirectional-lounge assertions
- `apps/server/src/voice/__tests__/mintToken.test.ts` — bidirectional-lounge + relay routing assertions
- `apps/server/src/voice/loungeRelayBot.ts` (new) — the `@livekit/rtc-node` relay bot (subscribe active Bomb Room → republish into lounge; structural one-way)
- `apps/server/src/voice/loungeBridge.ts` (new) — bot LIFECYCLE manager (`Map<sid, RelayBot>` via injected factory; `bridgeActiveTeam`/`unbridgeAll`, best-effort)
- `apps/server/src/voice/__tests__/loungeBridge.test.ts` (new) — bot-manager unit tests (fake factory)
- `apps/server/src/voice/__tests__/loungeBridge.integration.test.ts` (new) — real-LiveKit bot end-to-end (gated `RUN_LIVEKIT_IT=1`)
- `apps/server/package.json` (+ `pnpm-lock.yaml`) — added `@livekit/rtc-node` (relay bot + integration peer)
- `apps/client/src/voice/connectVoice.ts` — filter `#bridge` identities out of active-speaker pills (`isBridgeIdentity`)
- `packages/shared/src/voice/scope.ts` — also added `BRIDGE_IDENTITY_PREFIX` + `isBridgeIdentity` (shared bot↔client)
- ~~`apps/server/src/handlers/webhookRoutes.ts` + test~~ — REMOVED (bot autoSubscribe handles late joiners; no webhook needed)
- `apps/server/src/config/env.ts` — new required `LIVEKIT_SERVER_URL` (server→LiveKit base; bot derives its ws:// URL from it)
- `apps/server/src/config/__tests__/env.test.ts` — `LIVEKIT_SERVER_URL` fixture + assertion
- `apps/server/src/__tests__/health.test.ts` — `LIVEKIT_SERVER_URL` in the valid-env fixture
- `apps/server/src/handlers/sessionHandlers.ts` — `LoungeBridgePort`, optional `loungeBridge` dep, bridge on `PREPARATION_OPEN`, unbridge on `SESSION_END`
- `apps/server/src/handlers/__tests__/sessionHandlers.test.ts` — PREPARATION_OPEN bridge assertion
- `apps/server/src/handlers/moduleHandlers.ts` — thread `loungeBridge` into the resolve deps
- `apps/server/src/round/resolveRound.ts` — optional `loungeBridge`, unbridge on between-rounds entry
- `apps/server/src/round/__tests__/resolveRound.test.ts` — unbridge-on-resolve + best-effort tests
- `apps/server/src/timer/timerScheduler.ts` — thread `loungeBridge` into the time-expiry resolve path
- `apps/server/src/index.ts` — construct `RoomServiceClient`/`LoungeBridge`/`WebhookReceiver`, register webhook route, inject into session/module/timer deps
- `apps/client/src/voice/computeVoiceAction.ts` — thread `activeTeamId` into `deriveDesiredScope`
- `apps/client/src/voice/useVoiceScopeSync.ts` — pass `session.activeTeamId`
- `apps/client/src/voice/__tests__/computeVoiceAction.test.ts` — relay routing + bidirectional-lounge tests
- `apps/client/src/voice/__tests__/useVoiceScopeSync.test.tsx` — relay turn-flip re-mint tests
- `apps/client/src/ui/VoiceController.tsx` — mode from resolved scope (lounge vs bomb room), publish from grant
- `apps/client/src/ui/__tests__/VoiceController.test.tsx` — bidirectional-lounge + resting-team reconnect tests
- `apps/client/src/ui/MuteControl.tsx` — gate on `voiceStore.publishing` (covers lounge publishers)
- `apps/client/src/ui/__tests__/MuteControl.test.tsx` — publishing-gate tests
- `apps/client/src/ui/copy.ts` — lounge microcopy reflects the bidirectional lounge
- `.env.example` — `LIVEKIT_SERVER_URL`
- `docker-compose.yml` — `LIVEKIT_SERVER_URL` server env
- `livekit.yaml`, `livekit.dev.yaml` — `webhook` block

### Change Log

- 2026-07-01 — Story 3.7 IMPLEMENTED (Tasks 1–9). Relay-aware voice scope (bidirectional lounge +
  resting-team routing) + server-side one-way audio bridge (`RoomServiceClient.forwardParticipant`)
  driven by LiveKit webhooks + game-lifecycle sweeps. New `LoungeBridge`, `/livekit/webhook` route,
  `LIVEKIT_SERVER_URL` env, `livekit.yaml` webhook block. `tsc` clean all workspaces; shared 235 /
  server 569 / client 431 green.
- 2026-07-01 — BLOCKER found via the real-LiveKit integration test (added `@livekit/rtc-node`,
  connected a real peer): `forwardParticipant` is "not implemented" on self-hosted LiveKit
  (v1.13.1 + latest v1.13.2). Half B (audio forward) can't work as designed → AC #1 undelivered.
  Integration suite made green documenting the blocker; wrong-hypothesis infra experiments (LiveKit
  Redis routing / image→latest) reverted. Status review → in-progress (blocked); escalated to Jay.
- 2026-07-02 — BLOCKER RESOLVED (Jay picked the relay-bot option). Re-implemented Half B as a
  per-session `@livekit/rtc-node` relay bot (`loungeRelayBot.ts`): listen in the active Bomb Room,
  republish into the lounge; one-way is structural via asymmetric bot tokens. `LoungeBridge` became a
  bot lifecycle manager (surface + hooks unchanged). REMOVED the now-redundant webhook (route + test
  + `livekit.yaml` blocks + `WebhookReceiver`/`RoomServiceClient` wiring) — `autoSubscribe` handles
  late joiners. Client filters `#bridge` speaker pills. Proven end-to-end on a real LiveKit container
  (`RUN_LIVEKIT_IT=1` → 2/2: lounge peer hears the bridge; Bomb-Room peer doesn't). `tsc` clean all
  workspaces; shared 237 / server 558 (+2 skipped integration) / client 431 green. Status →
  **review**; Task 10 (Jay interactive audible verify) outstanding.

- 2026-07-01 — Story 3.7 created via gds-create-story → ready-for-dev. Two-half design: (A) relay-aware `resolveVoiceScope` (resting Bomb-Room roles + spectators → bidirectional lounge; spectator `canPublish` false→true) so Story 3.5's re-mint routes active↔resting on turn flip; (B) server-side one-way bridge via `RoomServiceClient.forwardParticipant` driven by LiveKit webhooks (`participant_joined` on active bomb room) + game-lifecycle sweeps (prepare/resolve). New `LoungeBridge` + `LIVEKIT_SERVER_URL` (server→LiveKit http admin URL, distinct from browser `ws://`) + `/livekit/webhook` route + `livekit.yaml` webhook block. Jay decisions baked in (2026-07-01): bidirectional lounge (FR39 reinterpreted as "never into the Bomb Room", not "never publish"); webhooks+game-events trigger. Task 10 = Jay interactive ≥3-browser verify (one-way boundary + turn-flip re-mint) — required.
