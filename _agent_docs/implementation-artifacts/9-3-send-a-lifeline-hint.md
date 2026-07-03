---
baseline_commit: 0c78aa5c04c4ad42a01408b0ba253d59385b311f
---

# Story 9.3: Send a Lifeline Hint

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Spectator with a token,
I want to send a pre-defined hint to the Bomb Room,
so that I can help without coaching via free text.

> **Depends on Story 9.2** (token economy): 9.2 mints and holds the tokens this story spends, delivers the client's `lifelineTokens` count, and adds the `MAX_LIFELINE_TOKENS` constant + `lifelines` Redis helper module this story extends with `spendToken`. Do 9.2 first.

## Acceptance Criteria

1. **Pre-defined prompt list + confirm step (no free text).** A spectator holding ≥1 token who opens the lifeline affordance sees the **fixed pre-defined prompt list** (≤8 scannable options, **no free-text input**) and a **confirm step** ("Send this tip? You have N tokens after." where N = current − 1). The affordance is present only when `config.modifiers.spectatorLifelines === true` AND the spectator holds ≥1 token; otherwise it is hidden.

2. **Confirmed send → server validates the token → deduct + toast to Bomb Room.** On a confirmed `LIFELINE_SEND { promptId }`, the server **validates the spectator actually holds a token** (server-side, against the `lifelines` map — never trusts the client). On success it **deducts one token** and delivers a `LIFELINE_TOAST { promptId, fromName }` to the **Defuser and Experts** of the active team, rendered as an **8-second non-blocking toast** ("Spectator [name] sent a tip: …") that **neither can dismiss early** and that **never animates/relayouts the bomb scene**. The sender's own token counter updates to N − 1.

3. **0 tokens → refused, no state change.** A spectator with 0 tokens who attempts to send is **refused server-side with no state change** — no deduction, no toast, no negative balance. (The affordance is hidden at 0 per AC-1, but the server is the authority and re-checks regardless of what the client shows.)

4. **Unknown / malformed prompt → rejected (fail-closed).** A `LIFELINE_SEND` with a `promptId` not in the fixed list (or a malformed payload) is rejected with no deduction and no toast — the lookup fails **closed** (never a default hint, never a crash).

## Tasks / Subtasks

<!-- NOT a module story: no reducer / generate / solve — the "Module reducer defect-class
     checklist" does not apply literally. Its SPIRIT is speced below: fail-CLOSED promptId
     lookup (unknown id → rejected, never a default hint — AC-4); the handler NEVER throws
     (0-token / bad-payload / unknown-promptId are typed-error or silent no-ops, not throws);
     server re-validates the token holding server-side (untrusted client — AC-2/3); the
     token decrement is race-safe (CAS) so it can never go negative. -->

- [x] **Task 1 — Shared: fixed prompt list** (AC: 1, 4)
  - [x] Add the fixed lifeline prompt list to `packages/shared` (e.g. `packages/shared/src/lifelines/prompts.ts`, re-exported from the barrel; co-locate with `MAX_LIFELINE_TOKENS` from Story 9.2). Shape: an ordered readonly array of `{ id: string; text: string }`, **≤8 entries**, ids kebab-case, text static (no `[placeholder]` interpolation for V1). Also export a derived `LIFELINE_PROMPT_IDS: ReadonlySet<string>` (or a `isLifelinePromptId(id): boolean` helper) for O(1) fail-closed validation.
  - [x] **Content (Design Decision 2 — GDD's 5 generic prompts):**
    - `re-read-section` → "Re-read the current module's section"
    - `check-serial` → "Check the serial number"
    - `missed-condition` → "You missed a condition"
    - `on-track` → "You're on the right track"
    - `wrong-approach` → "Wrong approach"
  - [x] Unit test: `LIFELINE_PROMPTS.length` is ≤ 8 and ≥ 1; every `id` is unique + kebab-case; `isLifelinePromptId('re-read-section') === true`; `isLifelinePromptId('not-a-prompt') === false` (fail-closed). This is the single source of truth consumed by BOTH the server (validate `promptId`) and the client (render the list + resolve toast text) — the wire never carries hint text (see Dev Notes).
  - [x] **Do NOT re-add** `LifelineSendPayload`/`LifelineToastPayload`/`LIFELINE_SEND`/`LIFELINE_TOAST` — they already exist (payloads.ts:79-82,139-142; client-to-server.ts:65; server-to-client.ts:45).

- [x] **Task 2 — Server: `spendToken` helper** (AC: 2, 3)
  - [x] Extend the Story-9.2 lifelines helper (`apps/server/src/lifelines/lifelineTokens.ts`) with `spendToken(redis, sessionId, playerId): Promise<{ ok: boolean; count: number }>` using `deps.redis.updateJSON` (CAS): load the map (null ⇒ `{}`), `current = map[playerId] ?? 0`; if `current < 1` **do not commit** (return `{ ok: false, count: current }` — AC-3 no state change); else commit `{ ...map, [playerId]: current - 1 }` and return `{ ok: true, count: current - 1 }`. The decrement can never go negative (guarded) and is race-safe against a concurrent 9.2 grant on the same shared key.
  - [x] Unit-test: spend at 1 → `{ ok: true, count: 0 }`; spend at 0 → `{ ok: false, count: 0 }` and the map is unchanged; interleaved grant+spend both apply.

- [x] **Task 3 — Server: `LIFELINE_SEND` handler** (AC: 2, 3, 4)
  - [x] Add a new `registerLifelineHandlers(io, deps)` module (`apps/server/src/handlers/lifelineHandlers.ts`) modeled closely on `registerManualHandlers` (`manualHandlers.ts:59-114`): `io.on('connection', socket => socket.on('LIFELINE_SEND', async (payload) => { … }))`. Wire it in `apps/server/src/index.ts` beside `registerManualHandlers(io, { redis, log })` at line 158. Deps: `{ redis, log }` (same shape as `ManualHandlerDeps`).
  - [x] **Payload validation (untrusted input, fail-closed — AC-4):** parse `{ promptId }`; reject non-object / non-string `promptId` / a `promptId` not in `LIFELINE_PROMPT_IDS` with `socket.emit('ERROR', { code: 'INVALID_PAYLOAD', message, recoverable: true })` and return. Mirror `parseManualNavigatePayload` (manualHandlers.ts:37-46) but validate against the **fixed prompt set**, not just a regex.
  - [x] **Authority + gating (server is the truth — AC-2/3):** resolve `sessionId = socket.data.sessionId` and `playerId = socket.data.playerId` (durable id, Story 2.7 — never socket.id); load fresh `SessionState` (`getJSON(sessionKey)`; null ⇒ `NOT_IN_SESSION` error, like manualHandlers.ts:83-88). Then, in order:
    - modifier gate: `state.config.modifiers.spectatorLifelines === true` (else silent no-op or typed error — pick the manualHandlers no-op posture for a wrong-state actor);
    - actor gate: the sender must be an eligible watcher — `state.players[playerId]` exists and `role !== 'facilitator' && teamId !== state.activeTeamId` (the same earner predicate as 9.2; a client on the active team or the facilitator cannot spend). A non-eligible actor is a silent no-op (nothing is "wrong" — they simply have no lifeline surface).
  - [x] **Spend + toast + echo (persist-then-emit):** call `spendToken(...)`. If `!ok` (0 tokens) → **no toast, no state change** (AC-3); optionally emit a soft `ERROR`/no-op (prefer silent — the affordance was hidden anyway). If `ok`:
    - resolve `fromName = state.players[playerId]?.displayName` (the `PlayerInfo` name field, `session.ts:30`; fall back to a generic "A spectator" if absent — never leak the playerId);
    - `io.to(teamRoom(sessionId, state.activeTeamId)).emit('LIFELINE_TOAST', { promptId, fromName })` — the team room IS the Bomb Room (Defuser + Experts of the active team; the spectator/facilitator are NOT in it, so the sender never sees their own toast). Model the team-scoped emit on `resolveRound.ts:280` / `sessionHandlers.ts:1513`.
    - echo the sender's new balance: `socket.emit('LIFELINE_TOKENS', { count })` so their counter drops to N−1 immediately (AC-2).
  - [x] Wrap the load/spend/emit in `try/catch` that logs and emits a recoverable `ERROR` (never throws out of the handler) — mirror manualHandlers.ts:104-110.

- [x] **Task 4 — Client: send affordance (spectator branch)** (AC: 1, 3)
  - [x] Add a `sendLifeline(promptId: string)` helper (e.g. `apps/client/src/net/sendLifeline.ts`) modeled on `publishPosition.ts:14-19`: guard on `connection === 'connected' && session !== null`, then `getSocket().emit('LIFELINE_SEND', { promptId })`.
  - [x] Add a `LifelinePanel.tsx` affordance component: a "Send a lifeline" button that opens the fixed `LIFELINE_PROMPTS` list (≤8 buttons, no text input), then a **confirm step** showing "Send this tip? You have {N-1} tokens after." with confirm/cancel (reuse an existing confirm pattern — see `ConfirmButton`/`Scoreboard` retry confirm if one exists; else a minimal inline two-step). Confirm calls `sendLifeline(promptId)`. Resolve each option's display text from the shared `LIFELINE_PROMPTS` list (id → text). Read `lifelineTokens` reactively from the store; render the panel only when `session.config.modifiers.spectatorLifelines === true && lifelineTokens > 0` (AC-1 hidden otherwise). After a successful send the store's `lifelineTokens` drops via the server's `LIFELINE_TOKENS` echo, so at 0 the panel self-hides (no client-side optimistic decrement — trust the server echo).
  - [x] Mount `LifelinePanel` inside `ActiveRound.tsx`'s watching surfaces (Design Decision 3, interim home): the spectator branch (lines 75-83) and — per 9.2 Design Decision 1 — the resting branch (lines 56-66). Story 9.4 (Spectator Lounge) later relocates this into the split-pane lounge HUD; keep the panel self-contained so 9.4 can re-host it. Add copy constants to `copy.ts` (send CTA, confirm-line builder `(nAfter) => …`, per-prompt labels come from shared).

- [x] **Task 5 — Client: lifeline toast (Bomb Room, 8s, non-dismissable)** (AC: 2)
  - [x] Add a `lifelineToasts` slice to `gameStore` — an append-only queue of `{ id: string; promptId: string; fromName: string }` plus actions `pushLifelineToast(toast)` and `dismissLifelineToast(id)`. Generate the toast `id` from a monotonic counter in the store (NOT `Math.random()`/`Date.now()` — per project rule; a `set`-incremented counter is deterministic and test-friendly). Reset the queue in `clearSession`.
  - [x] Replace the `onLifelineToast` **stub** in `bindServerEvents.ts:49-51` (currently `console.info`) with `pushLifelineToast({ promptId: p.promptId, fromName: p.fromName })`. Keep the existing `socket.on/off('LIFELINE_TOAST', …)` registration (lines 116/137).
  - [x] Add a `LifelineToast.tsx` (or `ToastHost.tsx`) overlay component modeled on `ResolutionBanner.tsx`'s **compositor-layer** technique (`transform-gpu` + `will-change-transform`, comment at ResolutionBanner.tsx:77-79) so it never repaints/relayouts the WebGL bomb scene (AC-2 "never animates the bomb scene's layout"). Position it **top-right, stacked** (EXPERIENCE.md "Toast": non-blocking, stack vertically top-right, **max 3 visible**) — NOT `inset-0`. Each toast: resolves `promptId → text` from shared `LIFELINE_PROMPTS`, renders "Spectator {fromName} sent a tip: {text}", auto-dismisses after **8000ms** via `window.setTimeout` (like ResolutionBanner's hold at lines 40-51), and has **no dismiss control** and **no click handler** (AC-2 "neither can dismiss early"). Cap the rendered stack at 3 (drop-oldest or queue overflow — log if dropped, do not silently swallow). Visual tokens (graphite bg / cream ink / brass border, `durationLifeline: 8s`) per DESIGN.md `components.toast` (DESIGN.md:141-147) and the mockup `7. Toasts on Bomb View.html` (`.toast.lifeline`).
  - [x] Mount the toast host in `ActiveRound.tsx` as a sibling to `ResolutionBanner` (line 90) so it overlays whatever active-team surface (Defuser's bomb OR Expert's manual) is showing — the toast reaches both because they share the team room. It must NOT be a child of `BombStage` (that box sizes the canvas; overlays live above it).

- [x] **Task 6 — Tests + typecheck + regression sweep** (AC: 1, 2, 3, 4)
  - [x] Shared: prompt-list unit test (Task 1) — size ≤8, unique kebab ids, fail-closed `isLifelinePromptId`.
  - [x] Server integration (`apps/server/src/handlers/__tests__/`, `testSocketServer`): an eligible spectator holding 1 token sends a valid `promptId` → the active team's Defuser + Expert sockets receive `LIFELINE_TOAST { promptId, fromName }`; the sender receives `LIFELINE_TOKENS { count: 0 }`; the `lifelines` map decremented by 1; the sender and facilitator do NOT receive the toast. A 0-token send → NO toast, NO deduction, map unchanged (AC-3). An unknown `promptId` → `ERROR` (or no-op), NO toast, NO deduction (AC-4). A send from an **active-team** player or the facilitator → no-op, no toast. Modifier OFF → no-op.
  - [x] `spendToken` unit tests (Task 2): 1→0 ok; 0→refused; race-safe interleave.
  - [x] Client tests (jsdom): `LifelinePanel` renders only when modifier on AND tokens>0; shows the ≤8 fixed prompts + confirm line "You have N tokens after"; confirm emits `LIFELINE_SEND { promptId }`; hidden at 0 tokens / modifier off. `LifelineToast`: a pushed toast renders "Spectator {name} sent a tip: {resolved text}", has no dismiss control, and auto-clears after 8s (use fake timers — jest `useFakeTimers`, advance 8000ms; do NOT use real `setTimeout` in the test); the stack caps at 3. Store: `pushLifelineToast`/`dismissLifelineToast`/counter-id determinism; `clearSession` empties the queue. `bindServerEvents`: `LIFELINE_TOAST` now pushes to the store (no longer console.info).
  - [x] `pnpm -w typecheck` clean (no `@ts-ignore`); full shared + server + client suites green; no regression in `manualHandlers`, `resolveRound`, `ActiveRound`, `gameStore`, or `bindServerEvents` tests.
  - [ ] **Human verification (Jay)** [[human-verification-ac-rule]]: on the full Docker stack with the TD-5 bot swarm — with Spectator Lifelines ON, give a spectator a token (complete a round per 9.2), open the lifeline panel, pick a prompt, confirm ("You have 0 tokens after"), and confirm: (a) an **8-second** toast appears on the **Defuser's and Expert's** screens ("Spectator [name] sent a tip: …") that **cannot be dismissed** and does **not** shift the bomb layout; (b) the spectator's counter drops to 0 and the panel disappears; (c) the facilitator and the sender do NOT see the toast; (d) a second send at 0 tokens is refused. Record the observed result in Completion Notes — not done until Jay confirms.

## Dev Notes

### The wire carries `promptId` + `fromName`, NOT hint text — text resolves on the client

`LifelineToastPayload` is `{ promptId, fromName }` (payloads.ts:139-142) and `LifelineSendPayload` is `{ promptId }` (payloads.ts:79-82). **Hint text never travels on the wire** — this is the structural guarantee against free-text coaching (AC "help without coaching via free text"). The fixed `LIFELINE_PROMPTS` list (Task 1) is the single source of truth: the **server** uses it to validate the incoming `promptId` (fail-closed), and the **client** uses it to render both the picker (Task 4) and the toast text (Task 5). A `promptId` the server doesn't recognise is rejected before any toast — so a malicious client can never inject arbitrary text.

### The scaffolding already exists — this story wires the handler + UI

Like 9.1/9.2, the events are **pre-plumbed but dormant**: `LIFELINE_SEND` (client-to-server.ts:65), `LIFELINE_TOAST` (server-to-client.ts:45), and both payloads exist and are barrel-exported. The **client binding is a STUB** (`bindServerEvents.ts:49-51` just `console.info`s the toast) — Task 5 replaces it. Missing entirely: the **server handler**, the **prompt list**, the **toast UI**, and the **send affordance**. There is **no existing toast/notification component** anywhere in the client — Task 5 builds the first one (model on `ResolutionBanner.tsx`).

### Targeting the Bomb Room = the active team's team room

There is no separate defuser/expert room — `teamRoom(sessionId, teamId)` (`sessionHandlers.ts:131-132` = `session:${id}:team:${teamId}`) contains exactly the Defuser + Experts of one team, and IS the Bomb Room. Emit the toast to `teamRoom(sessionId, state.activeTeamId)` (the currently-active team). The Facilitator (no `teamId`) and the sending spectator are NOT in that room, so neither receives the toast — matching AC-2 ("to the Defuser and Experts") and EXPERIENCE.md Flow 4 (the toast appears "in the Bomb Room"). Team-scoped emit exemplars: `resolveRound.ts:280`, `sessionHandlers.ts:1502,1513`.

### Toast must not relayout the bomb — compositor-layer overlay

The Defuser's surface is the R3F canvas inside `BombStage`. `ActiveRound.tsx` mounts overlays (`ResolutionBanner`, `PauseOverlay`, voice HUD) as **siblings** above the canvas (lines 88-102), never as children of the sized canvas box. The lifeline toast host mounts there too. `ResolutionBanner` documents the exact technique (`transform-gpu` + `will-change-transform`, lines 77-79): promote the overlay to its own compositor layer so it doesn't repaint/flicker/relayout the WebGL scene. Reuse it, but position top-right + stacked (not `inset-0` full-screen). AC-2 "never animates the bomb scene's layout" is satisfied structurally by keeping the toast out of the canvas box and on its own compositor layer.

### Toasts are ephemeral — not replayed on reconnect

Unlike the token count (9.2 re-sends on reattach), an 8-second toast is transient presentation. A Defuser who reloads mid-toast simply misses it — no replay, no persistence. This mirrors how a missed `STRIKE` presentation isn't re-shown. Do NOT persist toasts to Redis or re-emit on reattach.

### Determinism in the toast queue

Toast ids must NOT use `Math.random()` or `Date.now()` (project rule — silent-correctness + untestable). Use a store-held monotonic counter incremented in `pushLifelineToast`. Auto-dismiss uses `window.setTimeout(8000)` in the component (presentation, not game logic — allowed on the client render side, exactly as `ResolutionBanner` uses `window.setTimeout` for its hold); tests use jest fake timers, never real waits.

### Non-module-story guardrails (defect-class SPIRIT)

- **Fail-closed lookup (AC-4):** unknown `promptId` → rejected, never a default/first hint. Validate against `LIFELINE_PROMPT_IDS` (a Set), not a permissive regex.
- **Never-throw handler:** bad payload / 0 tokens / ineligible actor / unknown promptId are typed-error or silent no-ops; the load/spend/emit is `try/catch`-wrapped (manualHandlers posture). No path throws out of the socket handler.
- **Server re-validates the holding (AC-2/3):** the client hides the affordance at 0 tokens, but the server independently re-checks `spendToken`'s `ok` before any toast — the client is untrusted.
- **Never-negative balance:** `spendToken` guards `current < 1` before committing (CAS), so concurrency can't drive it below 0.

### Testing standards summary

- Shared prompt list — Jest unit (`packages/shared/src/lifelines/__tests__/`).
- `spendToken` — server unit with in-memory RedisStore fake.
- Handler — integration via `testSocketServer` (assert team-room receipt, sender/facilitator non-receipt, deduction, 0-token refusal, unknown-promptId rejection, modifier-off + wrong-actor no-op).
- Client panel + toast + store — jsdom (TD-1), jest fake timers for the 8s auto-dismiss.
- Forbidden: `Math.random()`/`Date.now()` for toast ids; real `setTimeout` in tests; untyped `socket.emit(string, any)`; hint text on the wire.

### Project Structure Notes

- New shared: `packages/shared/src/lifelines/prompts.ts` (+ `__tests__`) — `LIFELINE_PROMPTS`, `LIFELINE_PROMPT_IDS`/`isLifelinePromptId` (co-located with 9.2's `MAX_LIFELINE_TOKENS`). New server: `apps/server/src/handlers/lifelineHandlers.ts` (+ `__tests__`); extend `apps/server/src/lifelines/lifelineTokens.ts` with `spendToken`. New client: `apps/client/src/net/sendLifeline.ts`, `apps/client/src/ui/LifelinePanel.tsx`, `apps/client/src/ui/LifelineToast.tsx` (or `ToastHost.tsx`).
- Modified server: `index.ts` (register handler at ~158). Modified client: `gameStore.ts` (toast queue slice), `bindServerEvents.ts` (replace stub), `ActiveRound.tsx` (mount panel + toast), `copy.ts`.
- Naming: handler `registerLifelineHandlers` / `lifelineHandlers.ts`; components `LifelinePanel`/`LifelineToast` (PascalCase); store slice `lifelineToasts` + `pushLifelineToast`/`dismissLifelineToast`; helper `sendLifeline`. `packages/shared` stays framework-free (prompts are plain data).

### Project Context Rules

- **Socket/shared types**: reuse the existing `LIFELINE_SEND`/`LIFELINE_TOAST` typed events + payloads; the prompt list lives in `packages/shared` and is imported on both sides; never `socket.emit(string, any)`.
- **Security / untrusted client**: the server validates `promptId` against the fixed list AND re-checks the token holding server-side; hint text never rides the wire (no free-text injection). Never trust a client-claimed token count.
- **Server-authoritative + pure boundaries**: the handler owns all I/O (parse → load → spend via CAS → emit); no reducer emits sockets; Redis-only (no Postgres on this path).
- **No throws**: fail-closed + typed-error/no-op posture; the handler never throws.
- **Performance / R3F**: the toast overlay is a DOM sibling on its own compositor layer — it never triggers a bomb-scene re-render or relayout; no work inside `useFrame`.
- **Determinism**: no `Math.random()`/`Date.now()` for toast ids (store counter); `setTimeout` only for client presentation auto-dismiss, faked in tests.
- **TypeScript**: `tsc --noEmit` clean, no `// @ts-ignore`.

### References

- [Source: _agent_docs/planning-artifacts/epics.md#Story 9.3] (lines 1434-1452 — user story + BDD ACs)
- [Source: _agent_docs/planning-artifacts/epics.md#FR42] (line 76 — pre-defined hint, no free text, 8s non-blocking toast)
- [Source: _agent_docs/planning-artifacts/gdds/gdd-Ktane-2026-06-09/gdd.md#Spectator Lifelines] (lines 142-152 — the 5 prompts + overlay behaviour: 8s, non-dismissable, informational)
- [Source: _agent_docs/planning-artifacts/ux-designs/ux-Ktane-2026-06-10/EXPERIENCE.md#Flow 4] (lines 235-249 — pick prompt → confirm "You have 0 tokens after" → toast in Bomb Room → "Spectator [name] sent a tip: …")
- [Source: _agent_docs/planning-artifacts/ux-designs/ux-Ktane-2026-06-10/EXPERIENCE.md] (line 76 — Toast component pattern: non-blocking, top-right stack, max 3, lifeline 8s, "Never animates the bomb scene's layout")
- [Source: _agent_docs/planning-artifacts/ux-designs/ux-Ktane-2026-06-10/DESIGN.md:141-147] (`components.toast` tokens: graphite bg / cream ink / brass border / `durationLifeline: 8s`)
- [Source: _agent_docs/planning-artifacts/ux-designs/ux-Ktane-2026-06-10/mockups/7. Toasts on Bomb View.html] (`.toast.lifeline` visual reference — top-right stack, kicker "Spectator [name] sent a tip")
- [Source: packages/shared/src/events/client-to-server.ts:65] (`LIFELINE_SEND` — already defined)
- [Source: packages/shared/src/events/server-to-client.ts:45] (`LIFELINE_TOAST` — already defined)
- [Source: packages/shared/src/events/payloads.ts:79-82,139-142] (`LifelineSendPayload`, `LifelineToastPayload` — already defined)
- [Source: apps/server/src/handlers/manualHandlers.ts:37-114] (handler MODEL — parse/validate → load → authority → persist → emit; try/catch; registration shape)
- [Source: apps/server/src/index.ts:158] (register `registerLifelineHandlers` beside `registerManualHandlers`)
- [Source: apps/server/src/handlers/sessionHandlers.ts:131-132,1513] (`teamRoom` = Bomb Room; team-scoped emit exemplar)
- [Source: apps/server/src/round/resolveRound.ts:280] (team-scoped emit exemplar)
- [Source: apps/server/src/lifelines/lifelineTokens.ts] (Story 9.2 helper — extend with `spendToken`, CAS via `redis.updateJSON`)
- [Source: apps/client/src/net/publishPosition.ts:14-19] (emit-helper MODEL — connected+session guard → `getSocket().emit`)
- [Source: apps/client/src/net/bindServerEvents.ts:49-51,116,137] (`LIFELINE_TOAST` STUB to replace)
- [Source: apps/client/src/ui/ResolutionBanner.tsx:40-92] (overlay MODEL — compositor layer, `window.setTimeout` auto-dismiss)
- [Source: apps/client/src/ui/ActiveRound.tsx:56-102] (watching branches = panel home; overlay sibling layer = toast host mount)
- [Source: apps/client/src/store/gameStore.ts:23-137] (slice + `clearSession` reset patterns; add `lifelineToasts` queue)
- [Source: apps/client/src/ui/copy.ts:210-211] (lifeline modifier copy — add send/confirm copy beside it)

### Design Decisions (proposed 2026-07-03 — pending Jay confirmation; asked but AFK, sensible defaults chosen; re-confirm before/at dev)

1. **Wire carries `promptId` only; text resolves client-side from a shared fixed list** — dictated by the existing `LifelineToastPayload` shape and the "no free-text coaching" requirement. → Task 1/5.
2. **Prompt list content → GDD's 5 generic, module-agnostic prompts** (static text, no `[placeholder]` interpolation). Rationale: matches the GDD verbatim; module-agnostic text avoids coupling a prompt to a specific module and sidesteps placeholder-resolution complexity for V1; trivially expandable to 8 later. *If Jay wants different/richer copy (the mockup shows a more specific "Check the serial number for vowels — flips the color table"), swap the `LIFELINE_PROMPTS` text — the ids + all wiring stay.*
3. **Affordance home → interim in `ActiveRound` watching branches** (spectator + resting), since the Spectator Lounge (Story 9.4) is not built. 9.4's ACs already reference "the lifeline affordance from Story 9.3," so 9.4 will re-host the self-contained `LifelinePanel` into the lounge split-pane. → Task 4.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Opus 4.8)

### Debug Log References

- `pnpm --filter @bomb-squad/shared test -- prompts` → 5/5 green (prompt list: ≤8, unique kebab ids, fail-closed).
- `pnpm --filter @bomb-squad/server test -- lifelineTokens` → 13/13 (adds spendToken: 1→0 ok, 0→refused-no-change, unknown/absent fail-closed, interleaved grant+spend CAS).
- `pnpm --filter @bomb-squad/server test -- lifelineHandlers` → 14/14 (toast to Bomb Room, sender/facilitator excluded, balance echo, 0-token refusal, unknown-promptId ERROR, active-team/facilitator/modifier-off no-ops, not-in-session silent).
- `pnpm --filter @bomb-squad/client test` → 509/509 (adds LifelinePanel, LifelineToast fake-timer 8s, store slice, bindServerEvents push).
- `pnpm -w typecheck` → exit 0 (no `@ts-ignore`). Full suites: shared 509, server 614 (+2 pre-existing skips), client 509. `pnpm e2e` → 24/24.

### Completion Notes List

**Implemented (AC 1–4 satisfied by automated tests):**

- **AC-1 (fixed list + confirm, no free text):** `LifelinePanel` renders only when `spectatorLifelines === true` AND `lifelineTokens > 0`; opens the fixed shared `LIFELINE_PROMPTS` (5 buttons, no textbox) → confirm step "Send this tip? You have N-1 tokens after." No client-side optimistic decrement — self-hides when the server echo drops the balance to 0.
- **AC-2 (validate → deduct → toast + echo):** `registerLifelineHandlers` validates the token holding server-side via `spendToken` (CAS), emits `LIFELINE_TOAST { promptId, fromName }` to `teamRoom(sessionId, activeTeamId)` (the Bomb Room — Defuser + Experts; sender & facilitator are NOT in it), and echoes `LIFELINE_TOKENS { count }` to the sender. Client toast: top-right stacked, own compositor layer (`transform-gpu`/`will-change-transform`), 8000ms `window.setTimeout` auto-dismiss, no dismiss control / no click handler, never a child of the canvas box.
- **AC-3 (0 tokens → refused, no state change):** `spendToken` commits nothing at `held < 1` (returns `{ ok:false, count }`); handler silently no-ops (affordance already hidden at 0). Verified map is byte-for-byte unchanged.
- **AC-4 (unknown/malformed → fail-closed):** `parseLifelineSendPayload` validates against `LIFELINE_PROMPT_IDS` (a Set, not a permissive regex); unknown id → `ERROR INVALID_PAYLOAD`, no deduction, no toast. Never a default hint, never a throw.
- **Guardrails:** handler never throws (try/catch + typed-error/silent-no-op posture); balance can never go negative (CAS guard); toast ids are a store monotonic counter (`lt-N`), never `Math.random`/`Date.now`; hint text never rides the wire.

**Design decision confirmation (was flagged "re-confirm at dev"):** proceeded with the documented default — Design Decision 2's **GDD 5 generic prompts** (`re-read-section`, `check-serial`, `missed-condition`, `on-track`, `wrong-approach`). This is reversible with zero wiring change: swapping the `text` in `packages/shared/src/lifelines/prompts.ts` (ids + all server/client wiring stay). **Jay: if you want the richer/module-specific copy from the mockup, say so and I'll swap the text only.**

**Human verification (Task 6, final subtask) — PENDING Jay.** Left unchecked per [[human-verification-ac-rule]]: not done until Jay drives the full Docker + TD-5 bot-swarm flow and records the observed result here. Automated coverage stands in for the logic; the interactive 8s-toast / no-relayout / cross-screen visibility check is Jay's.

### File List

**Added**
- `packages/shared/src/lifelines/prompts.ts` — fixed prompt list, `LIFELINE_PROMPT_IDS`, `isLifelinePromptId`, `lifelinePromptText`.
- `packages/shared/src/lifelines/__tests__/prompts.test.ts`
- `apps/server/src/handlers/lifelineHandlers.ts` — `registerLifelineHandlers` + `parseLifelineSendPayload`.
- `apps/server/src/handlers/__tests__/lifelineHandlers.test.ts`
- `apps/client/src/net/sendLifeline.ts`
- `apps/client/src/ui/LifelinePanel.tsx`
- `apps/client/src/ui/LifelineToast.tsx` — `LifelineToastHost` overlay.
- `apps/client/src/ui/__tests__/LifelinePanel.test.tsx`
- `apps/client/src/ui/__tests__/LifelineToast.test.tsx`
- `apps/client/src/store/__tests__/lifelineToasts.test.ts`
- `apps/client/src/net/__tests__/lifelineToastBinding.test.ts`

**Modified**
- `packages/shared/src/lifelines/index.ts` — re-export `./prompts.js`.
- `apps/server/src/lifelines/lifelineTokens.ts` — add `spendToken` (CAS, reject-at-0).
- `apps/server/src/lifelines/__tests__/lifelineTokens.test.ts` — spendToken cases.
- `apps/server/src/index.ts` — import + register `registerLifelineHandlers`.
- `apps/client/src/store/gameStore.ts` — `lifelineToasts` slice (`LifelineToast` type, `MAX_LIFELINE_TOASTS`, push/dismiss, clearSession reset).
- `apps/client/src/net/bindServerEvents.ts` — replace `LIFELINE_TOAST` console stub with `pushLifelineToast`.
- `apps/client/src/ui/ActiveRound.tsx` — mount `LifelinePanel` (watching branches) + `LifelineToastHost` (overlay sibling).
- `apps/client/src/ui/copy.ts` — send CTA / confirm-line / toast-text copy.

## Change Log

- 2026-07-03 — Story 9.3 drafted (ready-for-dev) via gds-create-story. Consumer of the dormant `LIFELINE_SEND`/`LIFELINE_TOAST` events; adds the fixed shared prompt list, the `LIFELINE_SEND` server handler (spend via CAS + team-room toast), the first client toast component, and the interim send affordance. Depends on 9.2. Design decisions proposed with AFK-defaults pending Jay confirmation.
- 2026-07-03 — Story 9.3 implemented (Opus 4.8). Shared prompt list + fail-closed validation; server `spendToken` (CAS) + `registerLifelineHandlers`; client `LifelinePanel` send affordance, `LifelineToastHost` (8s non-dismissable, compositor-layer, top-right max-3), store toast slice, `bindServerEvents` un-stubbed. AC 1–4 covered by shared/server/client/integration tests. `pnpm -w typecheck` clean; shared 509 / server 614 / client 509 / e2e 24 green. Status → review. Prompt copy kept as GDD default (reversible text-only swap). Human-verification subtask left open pending Jay.
