---
baseline_commit: 0c78aa5c04c4ad42a01408b0ba253d59385b311f
---

# Story 9.2: Spectator Lifeline Token Economy

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Spectator,
I want to earn and hold lifeline tokens,
so that I can meaningfully contribute when I have one to spend.

> **Depends on Story 8.11** (single active bomb, Model B): the "1 token per round spectated" economy assumes one live bomb with a watching audience, not concurrent bombs. Story 9.3 (Send a Lifeline Hint) is the CONSUMER that spends what this story mints.

## Acceptance Criteria

1. **Earn 1 token per round spectated, capped at 3 held.** When a round completes with `config.modifiers.spectatorLifelines === true`, every player who watched (did **not** play) that round earns **+1** lifeline token, clamped to a maximum of **3 held**. The "watched" set is every non-Facilitator player who was **not on the active team** for the just-resolved round (genuine `spectator`-role players **and** resting-team relay players under Model B — see Design Decision 1). A player already at 3 tokens stays at 3 (no overflow, no error). Tokens are granted **exactly once per round** — a **retry** (Story 8.8, `round.retry === true`) does **not** re-grant (the round was already spectated once).

2. **Modifier off → no tokens earned, affordance hidden.** When `spectatorLifelines === false`, no tokens are granted at round completion, and the client's lifeline affordance/token counter is **hidden** for every role. A round run with the modifier off must not leave any stale token UI showing from a prior modifier-on configuration.

3. **Per-spectator counts stored under `session:{id}:lifelines` and accurate.** Token counts live in Redis at `lifelinesKey(sessionId)` = `session:{id}:lifelines` as a `Record<playerId, number>` map, updated accurately as tokens are earned (this story) and spent (Story 9.3). Reads/writes on this key are **race-safe** (concurrent grant + spend must not lose an update). This map is **server-side only** — it is never placed on the session-wide `SESSION_STATE` broadcast (a spectator learns only their **own** count, never another's).

4. **Each spectator learns their own current count; reconnect re-delivers it.** After a grant, each earning player receives their **own** updated token count via a targeted `LIFELINE_TOKENS` event (per-player emit — never broadcast). A spectator who reconnects mid-session re-receives their current count from the persisted `lifelines` map, so the counter re-hydrates on reload (exactly as `BOMB_INIT` is re-sent to a reconnecting Defuser).

## Tasks / Subtasks

<!-- NOT a module story: no reducer / generate / solve — the "Module reducer defect-class
     checklist" (project-context.md → Module System) does not apply literally. Its SPIRIT
     does and is speced below: the grant is idempotent-per-round (never double-grants),
     the cap fails SAFE (clamps at 3, never overflows or throws), the token map read/write
     is race-safe (updateJSON CAS), and unknown/absent playerIds are treated as 0 (fail-closed,
     never a crash). No client can influence its own token count — grant is server-computed. -->

- [x] **Task 1 — Shared: token cap + token-count event/payload** (AC: 1, 4)
  - [x] Add `MAX_LIFELINE_TOKENS = 3` as a shared constant (co-locate with the lifeline payloads or in a small `packages/shared/src/lifelines/` module; re-export from the shared barrel). Both the server grant (this story) and the Story 9.3 spend gate read it. Add a unit test pinning `MAX_LIFELINE_TOKENS === 3`.
  - [x] Add `LifelineTokensPayload { count: number }` to `packages/shared/src/events/payloads.ts` (Server→Client section, beside `LifelineToastPayload`). This carries the recipient's OWN token count only — no playerId, no map, no other spectator's data.
  - [x] Add `LIFELINE_TOKENS: (payload: LifelineTokensPayload) => void;` to `ServerToClientEvents` (`packages/shared/src/events/server-to-client.ts`) — placed beside `LIFELINE_TOAST`. Export `LifelineTokensPayload` from the events barrel (`packages/shared/src/events/index.ts`, beside `LifelineToastPayload`). **No new client→server event** in this story. `tsc` passes on both sides.
  - [x] **Did NOT re-add** `LifelineSendPayload`/`LifelineToastPayload`/`LIFELINE_SEND`/`LIFELINE_TOAST` — already existed. This story only added `LIFELINE_TOKENS`.

- [x] **Task 2 — Server: lifelines Redis helper module** (AC: 1, 3)
  - [x] `lifelinesKey(sessionId)` already existed — did NOT add a new key; this story is its first consumer.
  - [x] Added `apps/server/src/lifelines/lifelineTokens.ts` wrapping the map at `lifelinesKey`. Stored value `Record<string, number>` (absent key ⇒ `{}` ⇒ 0). `getTokens` (fail-closed 0) + `grantToken` (CAS clamp to cap). `// Story 9.3` spend note left; spend NOT implemented.
  - [x] Uses `updateJSON` (CAS), not bare get+set. Unit-tested against the in-memory RedisStore fake: grant increments; grant at 3 stays 3; get on empty key / unknown playerId returns 0; a one-shot interleave (simulated concurrent spend) proves no lost update.

- [x] **Task 3 — Server: grant at round completion** (AC: 1, 2)
  - [x] Grant added inside the `if (enteringBetweenRounds) { … }` block of `resolveRoundCeremony`, AFTER the SESSION_STATE + SCOREBOARD broadcasts + lounge-bridge teardown, so a lifelines failure never delays round completion.
  - [x] Guarded on `updatedSession.config.modifiers.spectatorLifelines && !round.retry`.
  - [x] Earner predicate `p.role !== 'facilitator' && p.teamId !== updatedSession.activeTeamId` (Design Decision 1 — spectators + resting team, excludes active team + facilitator).
  - [x] For each earner `grantToken(deps.redis, sessionId, p.playerId)` (awaited, inside the per-session chain); collected `playerId → newCount` in a Map.
  - [x] Targeted per-player delivery via `deps.io.in(sessionRoom(sessionId)).fetchSockets()` → `member.emit('LIFELINE_TOKENS', { count })` for earners only. Never on SESSION_STATE.
  - [x] Wrapped in try/catch that logs and continues; info line `{ sessionId, roundNumber, granted }`.

- [x] **Task 4 — Server: reconnect re-delivery of token count** (AC: 4)
  - [x] In the reattach restore path (`sessionHandlers.ts`), after the mid-round replay block, read `getTokens(deps.redis, sessionId, playerId)` and — only if `latest.config.modifiers.spectatorLifelines === true` — `socket.emit('LIFELINE_TOKENS', { count })` (emitted even for `0`). Own self-guarded try so a lifelines read failure never fails the reattach. Runs for all reconnecting players incl. genuine spectators (no teamId).

- [x] **Task 5 — Client: token store slice + binding + counter display** (AC: 2, 4)
  - [x] Added `lifelineTokens: number` (default `0`) + `setLifelineTokens` to `gameStore`. Reset to `0` in `clearSession`; NOT reset in `setBomb` (tokens persist across rounds).
  - [x] Registered `LIFELINE_TOKENS` in `bindServerEvents.ts` (on + off), `LifelineTokensPayload` imported from `@bomb-squad/shared`.
  - [x] Counter in `ActiveRound.tsx` on BOTH the `isResting` and `role === 'spectator'` surfaces, gated strictly on `session.config.modifiers.spectatorLifelines`. Copy constant `LIFELINE_TOKENS_LABEL(n)` in `copy.ts`. Send affordance deferred to Story 9.3.

- [x] **Task 6 — Tests + typecheck + regression sweep** (AC: 1, 2, 3, 4)
  - [x] Server integration tests (`resolveRoundLifelines.test.ts`): modifier ON → every watcher's map entry +1 and each receives its own `LIFELINE_TOKENS`; active team + facilitator get none; cap holds at 3; retry grants nothing; `SESSION_STATE` carries no token field; modifier OFF → no grant/event; grants on failed rounds too; lifelines failure is fail-safe (round still records + broadcasts).
  - [x] Lifeline-helper unit tests (`lifelineTokens.test.ts`): grant increments; grant at cap stays; absent key / unknown playerId ⇒ 0; interleaved CAS mutation preserves both updates.
  - [x] Reconnect tests (`sessionHandlers.test.ts`): spectator with N tokens re-receives `LIFELINE_TOKENS { count: N }` (modifier on); re-emits even count 0; NO event when modifier off.
  - [x] Client store + component tests: `setLifelineTokens` sets; `clearSession` resets to 0; `setBomb` does NOT reset; counter renders on spectator + resting branches only when the modifier is on, absent when off, absent for the active-team defuser.
  - [x] `pnpm -w typecheck` clean (no `@ts-ignore`); shared 503 / server 591 (+2 skipped, pre-existing) / client 483 all green; no regression.
  - [ ] **Human verification (Jay)** [[human-verification-ac-rule]]: on the full Docker stack with the TD-5 bot swarm — configure a session with Spectator Lifelines ON and at least one spectator/resting player; complete a round and confirm the watching player's counter shows **1** (and the active team + facilitator show none); complete more rounds and confirm it **caps at 3**; toggle the modifier OFF and confirm the counter disappears; reload a spectator mid-session and confirm the counter re-hydrates to its stored value. Record the observed result in Completion Notes — not done until Jay confirms.

## Dev Notes

### The scaffolding already exists — this story is the CONSUMER (do NOT re-plumb)

Like Story 9.1's `asymmetricExpertRoles`, the lifeline surface is **pre-plumbed but dormant**:
- **Modifier flag** `spectatorLifelines: boolean` — `packages/shared/src/types/session.ts:12`; defaulted `false` in `createSession.ts:13` (and merged at :56); validated in `parseRoundConfig.ts:100,109-110`; change-detected in `sessionHandlers.ts:163`; Facilitator UI switch already wired in `RoundConfigPanel.tsx:256-261` (copy `MODIFIER_LIFELINES`/`_SUB` at `copy.ts:210-211`). **No config/type/validation/UI change is needed** — read `config.modifiers.spectatorLifelines` and act.
- **Redis key** `lifelinesKey(sessionId)` — `keys.ts:18-19`, exported + tested, **zero runtime call sites**. This story populates it.
- **Events/payloads** `LIFELINE_SEND` / `LIFELINE_TOAST` / `LifelineSendPayload` / `LifelineToastPayload` already exist — but those belong to **Story 9.3** (spend). This story adds only `LIFELINE_TOKENS` + `LifelineTokensPayload` (the count-delivery event, which does NOT yet exist).

### Why a separate `LIFELINE_TOKENS` event (not SESSION_STATE)

Token counts live in a **separate** Redis key (`lifelinesKey`), deliberately — the epic mandates `session:{id}:lifelines`. Folding counts onto `SESSION_STATE` would (a) leak every spectator's count to every client, and (b) restructure the authoritative session blob. Instead deliver each spectator only their own count via a **targeted per-player emit** (mirroring 9.1's per-Expert `EXPERT_CHAPTER_ASSIGNMENT`). Targeted delivery is strictly stronger than "not broadcast to all."

### The grant hook: `enteringBetweenRounds`, once per round, retry-safe

`resolveRound` is the single funnel for all three outcomes (defuse / 3rd-strike / timeout — `resolveRound.ts:279`, callers at :316-338 and `onTimerExpired.ts:28`). The `if (enteringBetweenRounds)` block (lines 289-307) fires **exactly once** when the round truly completes (the last participating team resolved — fence at lines 166-186), so hooking here cannot double-grant across teams. The remaining double-grant risk is **retry** (Story 8.8): a retried round re-arms and re-resolves, re-entering this block — so the grant MUST be gated on `!round.retry` (the round was already spectated once; a retry replays the same round). This matches the existing `!round.retry` guard on pointer-advance at line 247.

### Earner predicate — one line covers both audiences (Design Decision 1)

`earner(p) = p.role !== 'facilitator' && p.teamId !== activeTeamId`. Truth table at grant time (`activeTeamId` = the just-played team, since it advances only on the next `PREPARATION_OPEN`):
- Active-team Defuser/Expert (`teamId === activeTeamId`) → **no** (they played).
- Resting-team Defuser/Expert (`teamId !==` active) → **yes** (Model B benchwarmer who watched).
- Genuine `spectator` (`teamId === undefined`) → **yes** (`undefined !== activeTeamId`).
- Facilitator (`role === 'facilitator'`, no `teamId`) → **no** (not a participant).

### Concurrency: use `updateJSON` (CAS), not get+set

A grant (this story) and a Story-9.3 spend can hit the **same** `lifelines` map concurrently (a spectator spends the instant a round resolves). The `RedisStore.updateJSON` primitive (`redis.ts:174-194`) is the WATCH/MULTI compare-and-set for exactly this. Bare `getJSON`+`setJSON` (as `identity.ts` uses for the reattach pair) is only safe there because those are **distinct per-player keys**; the lifelines map is **one shared key**, so it needs CAS. `resolveRound` already serializes its own ceremony per session (`sessionChains`), but a spend arrives on a different handler outside that chain — CAS is the safety net.

### Client: tokens persist across rounds (unlike resolution/scoreboard)

`resolution` and `scoreboard` clear on `setBomb` (new round) because they are per-round presentation. `lifelineTokens` is a **standing balance** — it must NOT reset on `setBomb`; it changes only via `LIFELINE_TOKENS` (server-authoritative grant/spend) and clears only on `clearSession`. The modifier-off HIDE is a render gate on `session.config.modifiers.spectatorLifelines`, independent of the stored count.

### Ephemeral by design — Redis only, not archived

The `lifelines` map is in-flight Redis state; it dies with the session. `SessionArchiveRecord` (`postgres.ts:28-45`) has no lifeline columns and this story does NOT add any — tokens are not part of session history (no AC requires it). If future scoring wants lifeline stats archived, that is a separate story extending the archive schema + `SESSION_END` handler.

### Testing standards summary

- Lifeline helpers + `MAX_LIFELINE_TOKENS` — Jest unit, in-memory RedisStore fake (`packages/shared` for the constant; `apps/server/src/lifelines/__tests__/` for the helpers). No `Date.now()`/`setTimeout`.
- Grant at resolution — integration/unit via the existing `resolveRound` test harness (follow `apps/server/src/round/__tests__/` if present, else `sessionHandlers` integration). Assert per-player receipt/non-receipt, cap, retry-no-grant, modifier-off-no-grant, and `SESSION_STATE` omits counts.
- Client store + counter — jsdom (TD-1). No R3F/visual (DOM counter only).
- Forbidden: `Math.random()`; `setTimeout`/`Date.now()` in reducers/tests; untyped `socket.emit(string, any)`.

### Project Structure Notes

- New shared: `MAX_LIFELINE_TOKENS` + `LifelineTokensPayload` + `LIFELINE_TOKENS` event (re-exported from barrel). New server: `apps/server/src/lifelines/lifelineTokens.ts` (+ `__tests__`). Client: edits to `gameStore.ts`, `bindServerEvents.ts`, `ActiveRound.tsx`, `copy.ts` (no new client files).
- Modified server: `resolveRound.ts` (grant block), `sessionHandlers.ts` (reattach re-send). Modified shared: `events/payloads.ts`, `events/server-to-client.ts`, `events/index.ts`.
- Naming: event `LIFELINE_TOKENS` (SCREAMING_SNAKE); payload `LifelineTokensPayload` (PascalCase); store field `lifelineTokens` (camelCase); constant `MAX_LIFELINE_TOKENS`. `packages/shared` stays framework-free.

### Project Context Rules

- **Socket/shared types**: new event/payload defined ONLY in `packages/shared/src/events/`, imported on both sides; never `socket.emit(string, any)`.
- **Server-authoritative + pure boundaries**: the client cannot influence its own token count — grant is server-computed at resolution; the client only receives `LIFELINE_TOKENS`. Handler/ceremony owns all I/O.
- **State boundaries**: token map lives in Redis (`lifelinesKey`), never Postgres on any hot path; never on `SESSION_STATE`. O(1) per-player read/write (single map key).
- **No throws from the grant path**: a lifelines failure logs-and-continues; the round resolution never fails because of tokens.
- **TypeScript**: `tsc --noEmit` clean, no `// @ts-ignore`.

### References

- [Source: _agent_docs/planning-artifacts/epics.md#Story 9.2] (lines 1412-1432 — user story + BDD ACs + 8.11 dependency note)
- [Source: _agent_docs/planning-artifacts/epics.md#FR42] (line 76 — earn 1/round, cap 3, facilitator-disable)
- [Source: _agent_docs/planning-artifacts/gdds/gdd-Ktane-2026-06-09/gdd.md#Spectator Lifelines] (lines 142-152 — token economy + overlay behaviour)
- [Source: _agent_docs/planning-artifacts/ux-designs/ux-Ktane-2026-06-10/EXPERIENCE.md#Flow 4] (lines 235-249 — Sam's lifeline decision; token counter shows 0 after spend)
- [Source: packages/shared/src/types/session.ts:3,12,158-168] (`PlayerRole`, `ModifierConfig.spectatorLifelines`, `SessionState.activeTeamId`)
- [Source: packages/shared/src/events/payloads.ts:139-142] (`LifelineToastPayload` — place `LifelineTokensPayload` beside it)
- [Source: packages/shared/src/events/server-to-client.ts:45] (`LIFELINE_TOAST` — place `LIFELINE_TOKENS` beside it)
- [Source: apps/server/src/state/keys.ts:18-19] (`lifelinesKey` — already defined, first consumer here)
- [Source: apps/server/src/state/redis.ts:174-194] (`updateJSON` CAS primitive)
- [Source: apps/server/src/round/resolveRound.ts:186,247,289-307] (`enteringBetweenRounds` grant hook; `!round.retry` guard precedent; once-per-round fence)
- [Source: apps/server/src/handlers/sessionHandlers.ts:528-549] (reattach mid-round replay — token re-send point)
- [Source: apps/server/src/handlers/sessionHandlers.ts:1481-1487] (fetchSockets targeted-emit pattern — mirror for per-player token delivery)
- [Source: apps/server/src/session/identity.ts:33-65] (per-player Redis precedent — note: distinct keys, not a shared map; this story uses a shared map ⇒ CAS)
- [Source: apps/client/src/store/gameStore.ts:44-105] (slice + reset patterns; `clearSession` vs `setBomb`)
- [Source: apps/client/src/net/bindServerEvents.ts:49-51,116,137] (`LIFELINE_TOAST` stub — bind `LIFELINE_TOKENS` beside it)
- [Source: apps/client/src/ui/ActiveRound.tsx:53-83] (resting + spectator branches — counter home)
- [Source: apps/client/src/ui/copy.ts:210-211] (lifeline modifier copy — add counter copy beside it)

### Design Decisions (proposed 2026-07-03 — pending Jay confirmation; asked but AFK, sensible defaults chosen; re-confirm before/at dev)

1. **Who earns a token → SPECTATOR ROLE + RESTING-TEAM players** (everyone not on the active team, excluding the Facilitator). Rationale: faithful to GDD Flow 4 (Sam defuses round 2, then spectates round 3 — under Model B relay he is still a role-holder on the benched team; a "genuine `spectator`-role only" reading would give him nothing, contradicting the GDD narrative). Encoded as the one-line earner predicate. → Drives Task 3 + the two-surface counter in Task 5. *If Jay picks spectator-role-only, narrow the predicate to `role === 'spectator'` and drop the resting-branch counter.*
2. **Token-count delivery → new targeted `LIFELINE_TOKENS` event** (not on `SESSION_STATE`). Rationale: keeps the lifelines map server-side per the epic's `session:{id}:lifelines` mandate and avoids leaking counts. → Task 1/3.
3. **Persistence → Redis-only, ephemeral** (not archived to Postgres). No AC requires history; keeps the session-end transaction unchanged.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (gds-dev-story)

### Debug Log References

- `pnpm -w typecheck` — clean (no `@ts-ignore`).
- `pnpm --filter @bomb-squad/shared test` — 503 passed (21 suites), incl. new `lifelines.test.ts`.
- `pnpm --filter @bomb-squad/server test` — 591 passed, 2 skipped (pre-existing LiveKit/Docker suite), incl. new `lifelineTokens.test.ts` (8), `resolveRoundLifelines.test.ts` (7), and 3 reconnect cases in `sessionHandlers.test.ts`.
- `pnpm --filter @bomb-squad/client test` — 483 passed (62 files), incl. new `lifelineTokens.test.ts` (store, 3) + `ActiveRoundLifelines.test.tsx` (5).

### Completion Notes List

- **Design Decision 1 chosen: SPECTATORS + RESTING TEAM earn** (the story's documented AFK-default). Jay was AFK when re-asked at dev start (60s no-response), so I proceeded with the well-justified default (faithful to GDD Flow 4 under Model B relay). Encoded as the one-line earner predicate `p.role !== 'facilitator' && p.teamId !== activeTeamId` and the two-surface counter. **If Jay prefers spectator-role-only**, narrow the predicate to `role === 'spectator'` and drop the resting-branch counter (the story documents this fallback).
- The scaffolding (modifier flag, `lifelinesKey`, `LIFELINE_SEND`/`LIFELINE_TOAST`) was pre-plumbed and untouched — this story only ADDED `LIFELINE_TOKENS` + `LifelineTokensPayload` + `MAX_LIFELINE_TOKENS` + the server helper + the grant/reconnect hooks + the client counter.
- Grant is race-safe (CAS `updateJSON` on the single shared `lifelines` map), fail-safe (runs after the authoritative broadcast, never a resolution failure), idempotent-per-round (`enteringBetweenRounds` fence + `!round.retry`), cap-clamped at 3, and fail-closed (unknown/absent playerId ⇒ 0).
- **Resolved a 9.1-review carry-over finding** (`deferred-work.md`): the grant loop originally wrapped grant+deliver in ONE try/catch, so a single `grantToken` throw mid-loop stranded the remaining earners and mislabelled a partial success as "no tokens." Hardened to **per-earner** grant resilience (one earner's Redis hiccup never aborts the rest) + a **separate** delivery try/catch, and the info log now reports `granted: counts.size` (tokens actually persisted, never overstated). New `resolveRoundLifelines` test covers the partial-failure case (fail earner #2 → earner #1 still granted + notified).
- Token counts are NEVER on `SESSION_STATE` — delivered targeted per-earner via `fetchSockets()` (mirrors Story 9.1). Reconnect re-hydrates each player's own count (even 0) when the modifier is on.
- **Automated the human-verification checklist as a real-browser e2e** (`spectator-lifeline-token-economy.spec.ts`, `pnpm e2e`, 2 passed / 20.4s): a genuine Spectator watching a single-team-A relay earns 1 token per completed round (counter 0→1→2→3), the count CAPS at 3 (a 4th completed round's grant clamps → round 5 still shows 3), the counter re-hydrates after a mid-round reload, and with the modifier OFF no counter renders. Drives the REAL server grant + `LIFELINE_TOKENS` socket delivery through the real BombScene canvas (no bots).
- **Interactive human verification (Jay) still PENDING** — the e2e covers the same checks automatically, but per [[human-verification-ac-rule]] Jay's own observed Docker-stack result is not yet recorded. Not fully done until Jay confirms (or accepts the e2e as sufficient).

### File List

**Added:**
- `packages/shared/src/lifelines/index.ts` — `MAX_LIFELINE_TOKENS` constant + barrel.
- `packages/shared/src/lifelines/__tests__/lifelines.test.ts` — pins the cap at 3.
- `apps/server/src/lifelines/lifelineTokens.ts` — `getTokens` + `grantToken` (CAS, cap).
- `apps/server/src/lifelines/__tests__/lifelineTokens.test.ts` — helper unit tests.
- `apps/server/src/round/__tests__/resolveRoundLifelines.test.ts` — grant integration tests.
- `apps/client/src/store/__tests__/lifelineTokens.test.ts` — store slice tests.
- `apps/client/src/ui/__tests__/ActiveRoundLifelines.test.tsx` — counter render tests.
- `apps/client/e2e/flows/spectator-lifeline-token-economy.spec.ts` — real-browser e2e automating the human-verification checklist (earn 1/round → cap 3 → reload re-hydrate → modifier-off hidden). Both tests green (`pnpm e2e`, 20.4s).

**Modified:**
- `packages/shared/src/events/payloads.ts` — `LifelineTokensPayload`.
- `packages/shared/src/events/server-to-client.ts` — `LIFELINE_TOKENS` event.
- `packages/shared/src/events/index.ts` — export `LifelineTokensPayload`.
- `packages/shared/src/index.ts` — export the `lifelines` barrel.
- `apps/server/src/round/resolveRound.ts` — grant at `enteringBetweenRounds` + targeted delivery.
- `apps/server/src/handlers/sessionHandlers.ts` — reconnect re-delivery of the token count.
- `apps/server/src/handlers/__tests__/sessionHandlers.test.ts` — 3 reconnect re-hydration tests.
- `apps/client/src/store/gameStore.ts` — `lifelineTokens` slice + `setLifelineTokens`.
- `apps/client/src/net/bindServerEvents.ts` — bind/unbind `LIFELINE_TOKENS`.
- `apps/client/src/ui/ActiveRound.tsx` — passive counter on the resting + spectator surfaces.
- `apps/client/src/ui/copy.ts` — `LIFELINE_TOKENS_LABEL` copy.

## Change Log

- 2026-07-03 — Story 9.2 drafted (ready-for-dev) via gds-create-story. Consumer of the dormant `spectatorLifelines` modifier + `lifelinesKey` Redis key. Adds `LIFELINE_TOKENS` count-delivery event; grants at `resolveRound` `enteringBetweenRounds` (retry-safe, cap 3). Design decisions proposed with AFK-defaults pending Jay confirmation.
- 2026-07-03 — Story 9.2 implemented (→ review) via gds-dev-story. Tasks 1–6 complete: shared `MAX_LIFELINE_TOKENS` + `LIFELINE_TOKENS`/`LifelineTokensPayload`; server `lifelineTokens` CAS helper; grant at round completion (earner predicate, targeted per-player emit, fail-safe); reconnect re-hydration; client store slice + passive counter on both watching surfaces. Design Decision 1 → spectators + resting team (AFK-default). typecheck clean; shared 503 / server 591 / client 483 green. Human verification (Jay) pending.
