---
baseline_commit: 0df5286458a692f4baf29a0d09a1c380e6c64543
---

# Story 9.1: Asymmetric Expert Roles

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an Expert on a team with the modifier enabled,
I want only my assigned manual chapters,
so that Experts must coordinate with each other as well as the Defuser.

## Acceptance Criteria

1. **Round-robin allocation at round start (≥2 Experts).** When a round starts and `config.modifiers.asymmetricExpertRoles === true` AND the active team has **≥2 Experts**, the **11 canonical manual chapters** (one per real module type) are dealt **round-robin** across that team's Experts — distributed as evenly as possible (with 2 Experts → 6 / 5). The allocation is computed **deterministically from the round's seed chain** (a retry of the same round reproduces the identical allocation; never `Math.random()`), and the resulting per-Expert assignment map is stored in the round's role-assignment state (`RoundState.chapterAssignments`).

2. **Restricted Experts navigate only their chapters; the rest are shown-locked; delivered role-gated (not broadcast).** A chapter-restricted Expert sees **all 11 chapters listed with their canonical chapter numbers** (so Experts can reference chapters by number across the team — "it's on chapter 10, that's yours"), but the chapters they were **not** assigned render **locked**: greyed, non-clickable, and excluded from `/` search. Only assigned chapters are reachable — by click, `/` search, and arrow/PageUp-Down navigation, which **skip over** locked chapters to the nearest assigned neighbour. Each Expert's assignment is delivered **targeted to that Expert only** (per-player emit, the recipient receives only their own `chapterIds`); it is **never** placed on the session-wide `SESSION_STATE` broadcast, so no Expert learns another Expert's assignment.

3. **Solo Expert / modifier off → full access (modifier inert).** When the modifier is enabled but the active team has a **single Expert** (or zero), that Expert retains **full manual access** — no assignment event is sent and the manual is unrestricted. Likewise when `asymmetricExpertRoles === false`, no allocation occurs and every Expert keeps the full manual. A round that does not restrict must not leave any client in a stale-restricted state from a prior round.

4. **Reconnect re-delivers the restriction.** An Expert who reconnects mid-round (rejoin path) re-receives their chapter assignment from the persisted `RoundState`, so the manual re-restricts on reload — exactly as `BOMB_INIT` is re-sent to a reconnecting Defuser today.

## Tasks / Subtasks

<!-- NOT a module story: no reducer / generate / solve — the "Module reducer defect-class
     checklist" (project-context.md → Module System) does not apply. Its SPIRIT does: the
     allocator is pure + seeded (no Math.random), fails SAFE (an Expert with no assignment =
     full access, never a broken/empty-forever manual), and the client filter is fail-open to
     the full manual when no restriction is present. Those guards are speced in Tasks 1 & 4. -->

- [ ] **Task 1 — Pure round-robin allocator (shared)** (AC: 1)
  - [ ] Add a canonical chapter-id list to `packages/shared`. Chapter id === module id (convention — see Dev Notes). The 11 chapters are the 11 **real** module types. **`MODULE_IDS` (`packages/shared/src/modules/registry.ts:114-126`) is already exactly those 11** — `dev-demo` is registered separately and is NOT a member — so `CHAPTER_IDS` can simply be (or re-export) `MODULE_IDS`. Add a unit test pinning `CHAPTER_IDS.length === 11` and `!CHAPTER_IDS.includes('dev-demo')`, so a future registry edit that adds a 12th id or leaks `dev-demo` fails loudly here.
  - [ ] Add pure `allocateExpertChapters(expertIds: readonly string[], chapterIds: readonly string[], rng: () => number): Record<string, string[]>` in `packages/shared` (e.g. `packages/shared/src/roles/allocateExpertChapters.ts`, re-exported from the shared barrel). Behaviour: **seeded-shuffle the Expert order first** (Fisher–Yates using the injected `rng` — this is the "randomly allocated" part; determinism comes from the caller's seed), then **deal the chapters round-robin** into the shuffled Experts (chapter i → expert `shuffled[i % n]`). Even-as-possible falls out of round-robin dealing. Returns a map keyed by `expertId` → sorted-stable `chapterIds`. Pure: no `Math.random`, no I/O, no throw — an empty `expertIds` returns `{}`; more Experts than chapters leaves trailing Experts with `[]` (documented degenerate, viewer already renders "No manual chapters available").
  - [ ] Unit tests (`packages/shared/src/roles/__tests__/`, Jest, zero infra): 2 Experts / 11 chapters → sizes {6,5} and the two sets are disjoint with union === all 11; **determinism** — same `rng` seed → identical map across two calls; different seed → (generally) different Expert-to-chapter mapping but always a valid partition; 1 Expert → that Expert gets all 11 (caller decides not to call this for solo, but the fn is still total); 0 Experts → `{}`; 12 Experts → exactly one Expert gets `[]`; immutability — inputs not mutated (call on frozen arrays must not throw).

- [ ] **Task 2 — Typed delivery event (shared)** (AC: 2)
  - [ ] Add `ExpertChapterAssignmentPayload { roundNumber: number; chapterIds: string[] }` to `packages/shared/src/events/payloads.ts` (the recipient's OWN assigned set only — no other Expert's data, no full map).
  - [ ] Add `EXPERT_CHAPTER_ASSIGNMENT: (payload: ExpertChapterAssignmentPayload) => void` to `ServerToClientEvents` (`packages/shared/src/events/server-to-client.ts`) — place it beside `EXPERT_MANUAL_POSITION`. Export the payload from the shared events barrel. **No client→server event** (server-driven only). Confirm `tsc` is happy on both sides.

- [ ] **Task 3 — Store assignments on RoundState (shared)** (AC: 1, 4)
  - [ ] Add optional `chapterAssignments?: Record<string, string[]>` to `RoundState` (`packages/shared/src/types/round.ts`) — playerId → assigned chapterIds, present **only** for restricted Experts (absent/`undefined` when the round does not restrict). Document it in the interface JSDoc (server-side only; NOT part of any client broadcast — the reconnect re-send reads it and emits each Expert only their own slice). This is the AC-1 "role-assignment state." Leave the reserved `rolesKey` unused (roles live on `SessionState.players`; per-round assignments belong on `RoundState`).

- [ ] **Task 4 — Compute + deliver at ROUND_START (server)** (AC: 1, 2, 3)
  - [ ] In the `ROUND_START` handler (`apps/server/src/handlers/sessionHandlers.ts:1383`), **after `startRound(state)` succeeds** (roles are settled — the just-promoted Defuser is no longer an Expert) and after the bomb/round persist, branch on `result.state.config.modifiers.asymmetricExpertRoles`.
  - [ ] For each active team (`teamIds = Object.keys(result.round.defusers)` — under Model B this is the single active team), gather its Experts: `Object.values(result.state.players).filter(p => p.teamId === teamId && p.role === 'expert').map(p => p.playerId)`. **Only restrict when the flag is on AND `experts.length >= 2`** (AC-3: solo/zero Experts → skip, no event, full access).
  - [ ] Derive the allocation seed from the **existing seed chain, keyed by pair not raw round** (retry-reproducible — mirror the bomb seed at line 1448): `deriveTemplateSeed(sessionId, pairIndex)` → a chapter-namespaced team seed `deriveTeamSeed(templateSeed, `${teamId}:expert-chapters`)` (namespacing the teamId string keeps this rng independent of the bomb-value seed for the same team) → `makeSeededRng(seed)`. Call `allocateExpertChapters(experts, CHAPTER_IDS, rng)`.
  - [ ] Stamp the map onto the persisted round: build `round = { ...result.round, chapterAssignments }` and `setJSON(roundKey(...), round)` (write it in the SAME persist that already writes the round at line 1476 — do not add a second write). Only include entries for restricted Experts.
  - [ ] Deliver **targeted per-Expert** using the existing `fetchSockets()` loop (the one already at `sessionHandlers.ts:1481-1487` that joins team rooms — reuse it or add a parallel targeted loop AFTER the `BOMB_INIT` broadcast at line 1513): for each roster socket whose `member.data.playerId` has an entry in `chapterAssignments`, `member.emit('EXPERT_CHAPTER_ASSIGNMENT', { roundNumber, chapterIds })`. **Never** add the map to the `SESSION_STATE` payload (AC-2 "not broadcast to all"). Emit AFTER `BOMB_INIT` so the client's new-round reset (Task 6) has already cleared any prior restriction.
  - [ ] Wrap the allocation/delivery so a failure here cannot detonate the round: it runs after the round is already persisted+armed; a defensive `try/catch` that logs and continues (Experts fall back to full access) is safer than letting it bubble into the `ROUND_START` catch that cancels timers. Confirm the existing catch semantics before deciding — do not silently swallow if it can leave a half-delivered state.

- [ ] **Task 5 — Reconnect re-delivery (server)** (AC: 4)
  - [ ] Find the rejoin path that re-sends `BOMB_INIT` to a reconnecting player (`apps/server/src/handlers/sessionHandlers.ts:~512-539`, the team-room join + `socket.emit('BOMB_INIT', bomb)` block). After it re-sends the bomb, load the current `RoundState` (`roundKey(sessionId, state.roundNumber)`) and, if `chapterAssignments?.[playerId]` exists, `socket.emit('EXPERT_CHAPTER_ASSIGNMENT', { roundNumber, chapterIds })` for that reconnecting Expert only. Order after BOMB_INIT (same reason as Task 4).

- [ ] **Task 6 — Client store + shown-locked manual gating (client)** (AC: 2, 3)
  - [ ] Add `assignedChapterIds: string[] | null` to `gameStore` (`apps/client/src/store/gameStore.ts`; `null` = full access, the default). Reset to `null` in `clearSession` (line 89) AND in `setBomb` (line 102 — a fresh `BOMB_INIT` = new round; clearing here prevents a prior round's restriction bleeding into an unrestricted round; the assignment event arrives right after BOMB_INIT and re-sets it if the new round restricts). Add a `setAssignedChapters(chapterIds: string[] | null)` action.
  - [ ] Register the event in `apps/client/src/net/bindServerEvents.ts` (beside `BOMB_INIT` at line 108): `socket.on('EXPERT_CHAPTER_ASSIGNMENT', (p) => setAssignedChapters(p.chapterIds))`.
  - [ ] **Extend `ManualViewer`** (`apps/client/src/manual/ManualViewer.tsx`) to accept an optional `assignedChapterIds?: string[] | null` prop (undefined/`null` = all chapters unlocked = current behaviour). A chapter is **locked** iff a non-null assigned set is present and the chapter's id is not in it. Changes (all additive — keep the full `chapters` array as the display/numbering source so canonical chapter numbers are preserved, AC-2):
    - **Sidebar**: still map the FULL `chapters` array (so `numberOf` = canonical position). For a locked chapter render it disabled — greyed, `aria-disabled`, `onClick` no-op, not focusable. Reuse the existing muted styling language; do not invent new tokens.
    - **Navigable set**: derive `navigable = assignedChapterIds == null ? chapters : chapters.filter(c => assignedChapterIds.includes(c.chapterId))`. Route **adjacency** (`adjacentChapterId`), **`/` search** (`searchChapters`), and the **initial/`current` resolution** through `navigable`, NOT the full array — so arrows/PageUp-Down skip locked chapters, search never returns a locked chapter, and a first-open lands on the first *assigned* chapter (never a locked one). Guard: if the stored `manualChapterId` points at a now-locked chapter (e.g. it was navigable last round), fall back to the first `navigable` chapter.
    - `buildChapters`, `chapters.ts`, and `search.ts` are unchanged — only `ManualViewer` learns about locking. Prefer a small pure helper (e.g. `adjacentChapterId(navigable, …)`) over duplicating adjacency logic.
  - [ ] In `apps/client/src/ui/ActiveRound.tsx` (Expert branch, line 73-74): read `assignedChapterIds` reactively from the store. When it is non-null, pass the chapters filtered to the **11 real** chapters (`chapters.filter(c => CHAPTER_IDS.includes(c.chapterId))`) so the sandbox-only `dev-demo` chapter is dropped from a real restricted round and canonical numbering is the 11-module order; also pass `assignedChapterIds` so `ManualViewer` locks the unassigned ones. When `null`, pass the full `chapters` and no assigned set (current behaviour — unchanged, incl. `dev-demo`). Import `CHAPTER_IDS` from shared.
  - [ ] Leave `Preparation.tsx` unrestricted — allocation happens **at round start** (AC-1), so during preparation the full manual is correct (Experts coordinate hand-offs before the bomb arms). No locking there.

- [ ] **Task 7 — Tests + typecheck + regression sweep** (AC: 1, 2, 3, 4)
  - [ ] Server integration tests (`apps/server/src/handlers/__tests__/sessionHandlers.test.ts` via `testSocketServer`): modifier ON + active team with 2 Experts → each Expert socket receives `EXPERT_CHAPTER_ASSIGNMENT` with disjoint `chapterIds`, union === 11; the Defuser and any non-active-team socket receive NO such event; the broadcast `SESSION_STATE` does NOT contain any chapter-assignment field (AC-2); `RoundState` persisted at `roundKey` carries `chapterAssignments` for exactly the 2 Experts. Modifier ON + solo Expert → NO event, no `chapterAssignments` (AC-3). Modifier OFF → NO event (AC-3). Determinism: two ROUND_STARTs of the same round (retry) yield the identical assignment per Expert (AC-1).
  - [ ] Reconnect test: an Expert restricted this round who rejoins re-receives their `EXPERT_CHAPTER_ASSIGNMENT` after `BOMB_INIT` (AC-4).
  - [ ] Client component test (`apps/client/src/ui/__tests__/` or `apps/client/src/manual/__tests__/`, jsdom — follow existing `ActiveRound`/manual tests): with a 3-id assigned subset, the Expert manual sidebar lists **all 11** chapters with canonical numbers but the 8 unassigned render **locked** (disabled/non-clickable); clicking a locked chapter is a no-op; arrow/adjacency + `/` search reach only the 3 assigned chapters (skip locked); first-open lands on the first assigned chapter; a stored chapter id that is now locked falls back to the first assigned. With `assignedChapterIds === null`, the full manual renders fully navigable (regression — current behaviour). Store test: `setBomb` and `clearSession` reset `assignedChapterIds` to `null`; the event action sets it.
  - [ ] `pnpm -w typecheck` clean (no `@ts-ignore`); full shared + server + client suites green; no regression in existing `ActiveRound`, manual, or `sessionHandlers` tests.
  - [ ] **Human verification (Jay)** [[human-verification-ac-rule]]: on the full Docker stack with the TD-5 bot swarm — configure a round with Asymmetric Expert Roles ON and a team of 2+ Experts, start the round, and confirm each Expert's manual lists **all 11 chapters with canonical numbers** but has a **different, disjoint** subset navigable (the rest greyed/locked; the union of navigable sets covers all 11); locked chapters can't be clicked and arrows/`/`-search skip them; a solo-Expert round and a modifier-off round show the full manual fully navigable; a mid-round reload re-restricts. Record the observed result in Completion Notes — not done until Jay confirms.

## Dev Notes

### The toggle already exists — this story is the CONSUMER (do NOT re-plumb config)

`asymmetricExpertRoles` is fully plumbed but **dormant** — it is read nowhere today:
- Type: `ModifierConfig.asymmetricExpertRoles: boolean` — `packages/shared/src/types/session.ts:10-13`; carried on `RoundConfig.modifiers` → `SessionState.config`.
- Default: `apps/server/src/session/createSession.ts:13` (`false`).
- Validation: `apps/server/src/session/parseRoundConfig.ts:93-113` (whitelisted boolean; required in `full` mode).
- Facilitator UI: the "Asymmetric Expert roles" switch is already wired in `RoundConfigPanel.tsx` (Story 8.1) and toggled via `ROUND_CONFIGURE`.
**No config/type/UI/validation change is needed.** Your job is to READ `config.modifiers.asymmetricExpertRoles` at round start and act on it.

### Chapter id === module id — the gating hinge (shown-locked, decided 2026-07-03)

Every module's manual sets `chapterId` to its module-id constant (e.g. `packages/shared/src/modules/wires/manual.ts:32` uses `WIRES_MODULE_ID = 'wires'`). The server's `MANUAL_NAVIGATE` validator documents the same convention (`manualHandlers.ts:33-34`). The client builds the manual as `buildChapters(SANDBOX_MODULES.flatMap(m => m.getManualPages()))` at `ActiveRound.tsx:38-41` and `Preparation.tsx:60-63`. So an assignment is just a **set of chapter/module ids**.

**Jay's decision (Q1): shown-locked, NOT hidden.** The restricted Expert still sees all 11 chapters with their **canonical numbers** (Ch. 10 = Memory for everyone → cross-Expert references by number work — the whole point of the coordination modifier); the unassigned ones render **locked** (greyed, non-navigable, out of search). This means `ManualViewer` must learn about locking (Task 6) — it is NOT a pure "filter the array upstream" change. Keep the full `chapters` array as the sidebar/numbering source; route only *navigation* (adjacency, search, initial selection) through the assigned subset. `SANDBOX_MODULES` has **12** entries (11 real + `dev-demo`); when restricted, `ActiveRound` passes the chapters filtered to the **11 real** (`CHAPTER_IDS`) so `dev-demo` doesn't appear as a stray locked row and numbering is the canonical 11-module order; when unrestricted (`null`) it passes the full list unchanged.

### Delivery: targeted per-player emit, NOT a role room, NOT SESSION_STATE

AC-2 says "delivered via the role-gated room, not broadcast to all." The literal AR10 room `session:{id}:role:{role}` is **one room for ALL Experts** — broadcasting each Expert's distinct set there would leak every assignment to every Expert. There is no per-player room today. **Use the existing per-player targeting hook**: `ROUND_START` already does `io.in(sessionRoom(sessionId)).fetchSockets()` and reads `member.data.playerId` (`sessionHandlers.ts:1481-1487`) to join team rooms. Emit `EXPERT_CHAPTER_ASSIGNMENT` to each Expert's own socket in that loop. Targeted delivery is **stricter** than a role room and satisfies "not broadcast to all." The full map lives only on server-side `RoundState` (never sent wholesale to any client). `EXPERT_MANUAL_POSITION` (`manualHandlers.ts`) is the reference for a role-checked Expert event, but note it broadcasts session-wide — do NOT copy that for the assignment (the manual *position* is public for the spectator mirror; the *assignment* is per-Expert).

### Determinism & the seed chain (retry-reproducible, no Math.random)

`Math.random()` is banned outside `generate()`. Derive the shuffle rng from the seed chain exactly as bomb generation does, and key it by **pairIndex** (not raw `roundNumber`) so a retry reproduces the identical allocation — `pairIndexFor(roundNumber)` is already computed at `sessionHandlers.ts:1448` and `deriveTemplateSeed`/`deriveTeamSeed`/`makeSeededRng` are exported from `packages/shared/src/seeding/seedChain.ts`. Namespace the team seed (`${teamId}:expert-chapters`) so the allocation rng stream is independent of the team's bomb-value rng. The pure `allocateExpertChapters` takes the rng as a parameter (testable with a fixed-seed rng; no clock, no global randomness).

### Scope: active team only (Model B)

Under sequential play (Story 8.11, Model B) exactly one team is active per round; `Object.keys(result.round.defusers)` is that single active team. Only its Experts are on the manual surface in `ActiveRound.tsx` (resting-team players — all roles — get the standby panel, never the manual, `ActiveRound.tsx:53-66`). Allocate for the active team's Experts only. Count Experts from the **post-`startRound`** state (the promoted Defuser has already been reconciled out of `role === 'expert'`, `startRound.ts:135-143`).

### Client new-round reset (avoid stale-restriction bleed) — AC-3

`assignedChapterIds` defaults `null` (= full). Reset it to `null` on every new round (`setBomb`, `gameStore.ts:102`) and on `clearSession`. The server emits the assignment **after** `BOMB_INIT`, so ordering is: new-round `BOMB_INIT` clears → assignment (if the round restricts) re-sets. An unrestricted round never sends the event, so the client stays `null` (full manual). This is why AC-3's "must not leave any client stale-restricted" holds without extra client bookkeeping.

### Testing standards summary

- Pure `allocateExpertChapters` + `CHAPTER_IDS` — Jest unit, zero infra (`packages/shared/src/roles/__tests__/`). Fixed-seed rng for determinism assertions.
- `ROUND_START` delivery — integration via `apps/server/src/handlers/__tests__/testSocketServer.ts` (follow the existing `ROUND_START` / `sessionHandlers.test.ts` setup; assert per-socket receipt and non-receipt, and that `SESSION_STATE` omits the map).
- Client store + manual filter — jsdom component/store tests (TD-1 framework; follow existing `ActiveRound`/manual specs). No R3F/visual work (DOM manual surface).
- Forbidden: `Math.random()` anywhere outside `generate()`; `setTimeout`/`Date.now()` in the allocator or its tests (pass the rng and any values in).

### Project Structure Notes

- New files: `packages/shared/src/roles/allocateExpertChapters.ts` (+ `__tests__`), and a `CHAPTER_IDS` export (co-locate with `MODULE_IDS` in `registry.ts` or a small `roles`/`manual` module — re-export from the shared barrel). Client: no new files required (edits to `gameStore.ts`, `bindServerEvents.ts`, `ActiveRound.tsx`).
- Modified shared: `types/round.ts` (+`chapterAssignments`), `events/payloads.ts` (+payload), `events/server-to-client.ts` (+event), the events barrel.
- Naming: event `EXPERT_CHAPTER_ASSIGNMENT` (SCREAMING_SNAKE); payload `ExpertChapterAssignmentPayload` (PascalCase); store field `assignedChapterIds` (camelCase). `packages/shared` stays framework-free (the allocator is plain TS).

### Project Context Rules

- **Socket/shared types**: new event/payload defined ONLY in `packages/shared/src/events/` and imported on both sides; never `socket.emit(string, any)`.
- **Server-authoritative + pure boundaries**: allocation logic is a pure function; the handler owns all I/O (compute seed → allocate → persist to `roundKey` → targeted emit). No reducer emits sockets; no Postgres on this path (Redis-only round state).
- **Security / untrusted client**: the client cannot influence its own assignment — allocation is server-computed from the seed; the client only *receives* its set. Never trust a client-supplied chapter set.
- **State boundaries**: per-round assignments live on server-side `RoundState` (Redis `session:{id}:round:{n}`); they are never broadcast wholesale (AC-2).
- **Determinism**: no `Math.random()` — seed via the chain, keyed by `pairIndex` for retry parity (Story 8.2/8.8 reused-seed guarantee).
- **TypeScript**: `tsc --noEmit` clean, no `// @ts-ignore`.

### References

- [Source: _agent_docs/planning-artifacts/epics.md#Story 9.1: Asymmetric Expert Roles] (lines 1392-1410 — user story + BDD ACs)
- [Source: _agent_docs/planning-artifacts/epics.md#FR36, #FR37] (lines 66-67 — manual navigation + asymmetric-roles requirement)
- [Source: _agent_docs/planning-artifacts/epics.md#AR10] (line 118 — room namespacing `session:{id}` / `:team:` / `:role:`)
- [Source: _agent_docs/planning-artifacts/gdds/gdd-Ktane-2026-06-09/gdd.md#Asymmetric Expert Roles] (lines 139-140 — "11 chapters round-robin, evenly, randomly allocated; ≥2 Experts; solo retains full access")
- [Source: _agent_docs/planning-artifacts/ux-designs/ux-Ktane-2026-06-10/EXPERIENCE.md#Flow 2] (lines 206-218 — Expert manual-split experience; NOTE: narrates contiguous blocks 1–6 / 7–11 — illustrative only; normative rule is round-robin per FR37/GDD; see Open Questions)
- [Source: _agent_docs/planning-artifacts/ux-designs/ux-Ktane-2026-06-10/DESIGN.md] (UX-DR8 manual surface; no chapter-gating visual specified — see Open Questions)
- [Source: packages/shared/src/types/session.ts:10-13, 106] (`ModifierConfig`, `SessionState.config`)
- [Source: packages/shared/src/types/round.ts] (`RoundState` — add `chapterAssignments`)
- [Source: packages/shared/src/modules/registry.ts] (`MODULE_IDS` — source for `CHAPTER_IDS`)
- [Source: packages/shared/src/seeding/seedChain.ts:22-56] (`deriveTemplateSeed`, `deriveTeamSeed`, `makeSeededRng`)
- [Source: apps/server/src/handlers/sessionHandlers.ts:1383-1537] (`ROUND_START` handler — allocate + deliver after `startRound`; `fetchSockets` loop at 1481-1487; round persist at 1476; `BOMB_INIT` at 1513; `pairIndexFor` at 1448)
- [Source: apps/server/src/handlers/sessionHandlers.ts:512-539] (rejoin path — `BOMB_INIT` re-send point for Task 5)
- [Source: apps/server/src/session/startRound.ts:135-143] (role reconciliation — Experts settled here)
- [Source: apps/server/src/handlers/manualHandlers.ts:59-114] (role-checked Expert event reference; note it broadcasts session-wide — do NOT copy for the assignment)
- [Source: apps/client/src/ui/ActiveRound.tsx:38-74] (chapter build + Expert branch — client filter site)
- [Source: apps/client/src/manual/ManualViewer.tsx, chapters.ts, search.ts] (chapter-agnostic viewer — unchanged; filter the array upstream)
- [Source: apps/client/src/store/gameStore.ts:88-105] (`setBomb`/`clearSession` — add `assignedChapterIds` + reset)
- [Source: apps/client/src/net/bindServerEvents.ts:105-110] (server-event registration site)
- [Source: apps/server/src/state/keys.ts:6, 15-16] (`roundKey`; `rolesKey` reserved-unused)

### Design Decisions (resolved by Jay 2026-07-03 — no longer open)

1. **Unassigned chapters → SHOWN-LOCKED** (not hidden). All 11 chapters stay listed with canonical numbers; unassigned ones are greyed/non-navigable/out-of-search. Rationale: preserves cross-Expert chapter references by number, matching EXPERIENCE.md Flow 2's "on my side / on Ana's" and serving the modifier's coordination purpose. → Drives Task 6's `ManualViewer` change (not a bare array filter).
2. **Allocation shape → ROUND-ROBIN** (interleaved, seeded-shuffle then deal). Normative per FR37 + GDD (stated 3×); EXPERIENCE.md Flow 2's contiguous-block narration (1–6 / 7–11, self-contradicting) is treated as illustrative only. → Task 1.
3. **"Randomly allocated" → DETERMINISTIC-SEEDED** off the seed chain, keyed by `pairIndex` (retry-reproducible; obeys the `Math.random` ban). → Task 4.

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-07-03 — Story 9.1 drafted (ready-for-dev) via gds-create-story. First story of Epic 9; epic → in-progress.
- 2026-07-03 — Design decisions resolved by Jay: (1) unassigned chapters SHOWN-LOCKED not hidden; (2) allocation ROUND-ROBIN; (3) DETERMINISTIC-SEEDED. AC-2 + Task 6 reworked for shown-locked (`ManualViewer` gains an `assignedChapterIds` prop; canonical numbering preserved; nav/search skip locked chapters).
