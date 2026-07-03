---
baseline_commit: 0df5286458a692f4baf29a0d09a1c380e6c64543
---

# Story 9.1: Asymmetric Expert Roles

Status: review

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

- [x] **Task 1 — Pure round-robin allocator (shared)** (AC: 1)
  - [x] Add a canonical chapter-id list to `packages/shared`. Chapter id === module id (convention — see Dev Notes). The 11 chapters are the 11 **real** module types. **`MODULE_IDS` (`packages/shared/src/modules/registry.ts:114-126`) is already exactly those 11** — `dev-demo` is registered separately and is NOT a member — so `CHAPTER_IDS` can simply be (or re-export) `MODULE_IDS`. Add a unit test pinning `CHAPTER_IDS.length === 11` and `!CHAPTER_IDS.includes('dev-demo')`, so a future registry edit that adds a 12th id or leaks `dev-demo` fails loudly here. **Done:** `CHAPTER_IDS = MODULE_IDS` in `registry.ts`; pinned in the allocator test.
  - [x] Add pure `allocateExpertChapters(expertIds, chapterIds, rng): Record<string, string[]>` in `packages/shared/src/roles/allocateExpertChapters.ts`, re-exported from the shared barrel (`roles/index.ts` → `index.ts`). Seeded Fisher–Yates shuffle then round-robin deal; sorted-stable lists; total + no throw + no input mutation.
  - [x] Unit tests (`packages/shared/src/roles/__tests__/allocateExpertChapters.test.ts`, Jest): 2/11 → {6,5} disjoint union 11; determinism same-seed; valid-partition different-seed; 1 Expert → all 11; 0 → `{}`; 12 → exactly one `[]`; immutability on frozen inputs; canonical-order + even-as-possible invariants. **11 tests green.**

- [x] **Task 2 — Typed delivery event (shared)** (AC: 2)
  - [x] Add `ExpertChapterAssignmentPayload { roundNumber: number; chapterIds: string[] }` to `packages/shared/src/events/payloads.ts` (recipient's OWN set only).
  - [x] Add `EXPERT_CHAPTER_ASSIGNMENT` to `ServerToClientEvents` beside `EXPERT_MANUAL_POSITION`; payload exported from the events barrel. No client→server event. `tsc` clean both sides.

- [x] **Task 3 — Store assignments on RoundState (shared)** (AC: 1, 4)
  - [x] Added optional `chapterAssignments?: Record<string, string[]>` to `RoundState` (`types/round.ts`) with server-side-only JSDoc (never in a client broadcast). `rolesKey` left reserved-unused.

- [x] **Task 4 — Compute + deliver at ROUND_START (server)** (AC: 1, 2, 3)
  - [x] In `ROUND_START` (`sessionHandlers.ts`), after `startRound` succeeds and `pairIndex` is computed, branch on `result.state.config.modifiers.asymmetricExpertRoles`.
  - [x] For each active team (`teamIds = Object.keys(result.round.defusers)`), gather `role === 'expert'` players; **restrict only when the flag is on AND `experts.length >= 2`** (AC-3).
  - [x] Seed off the chain keyed by `pairIndex`: `deriveTemplateSeed(sessionId, pairIndex)` → `deriveTeamSeed(templateSeed, `${teamId}:expert-chapters`)` → `makeSeededRng` → `allocateExpertChapters(experts, CHAPTER_IDS, rng)`.
  - [x] Stamped onto the round in the **existing** persist: `setJSON(roundKey(...), { ...result.round, chapterAssignments })` (undefined ⇒ key dropped by JSON, so an unrestricted round is unchanged). No second write.
  - [x] Delivered **targeted per-Expert** by reusing the `sockets` array from the room `fetchSockets()`, emitting AFTER the `BOMB_INIT` broadcast. Never on `SESSION_STATE`.
  - [x] Allocation AND delivery each wrapped in a defensive `try/catch` that logs + continues (fail-safe to full access) so it cannot bubble into the `ROUND_START` catch that cancels timers.

- [x] **Task 5 — Reconnect re-delivery (server)** (AC: 4)
  - [x] In the mid-round replay block, after the re-sent `BOMB_INIT`, load `RoundState` at `roundKey(sessionId, latest.roundNumber)`; if `chapterAssignments?.[playerId]` exists, `socket.emit('EXPERT_CHAPTER_ASSIGNMENT', …)` for that Expert only. Self-guarded (no-op on an unrestricted round). Ordered after BOMB_INIT.

- [x] **Task 6 — Client store + shown-locked manual gating (client)** (AC: 2, 3)
  - [x] Added `assignedChapterIds: string[] | null` (default `null`) + `setAssignedChapters` to `gameStore`; reset to `null` in `clearSession` AND `setBomb`.
  - [x] Registered `EXPERT_CHAPTER_ASSIGNMENT` in `bindServerEvents.ts` (+ matching `off`).
  - [x] Extended `ManualViewer` with an optional `assignedChapterIds` prop: full `chapters` stays the sidebar/numbering source (canonical numbers preserved); locked chapters render disabled (greyed, `aria-disabled`, `onClick` no-op, `disabled` drops focus); adjacency, `/` search, and initial/`current` resolution all route through the `navigable` subset (arrows/search skip locked; stored-locked id falls back to first assigned). `buildChapters`/`chapters.ts`/`search.ts` unchanged.
  - [x] `ActiveRound.tsx` Expert branch reads `assignedChapterIds` reactively; when non-null passes chapters filtered to the 11 real (`CHAPTER_IDS`, dropping `dev-demo`) + the assigned set; when null passes the full list unchanged.
  - [x] `Preparation.tsx` left unrestricted (allocation is at round start).

- [x] **Task 7 — Tests + typecheck + regression sweep** (AC: 1, 2, 3, 4)
  - [x] Server integration tests (new `ROUND_START — Asymmetric Expert Roles` describe in `sessionHandlers.test.ts`): modifier ON + 2 Experts → each Expert receives a disjoint set (union 11, sizes {6,5}); Defuser + resting team receive none; `SESSION_STATE` omits the map; persisted `RoundState` carries it for exactly the 2 Experts. Solo Expert → none. Modifier OFF → none. Seed-derived (retry-reproducible) → persisted map matches a re-derivation off the seed chain.
  - [x] Reconnect test: a restricted Expert who reattaches (durable token) re-receives `EXPERT_CHAPTER_ASSIGNMENT` after `BOMB_INIT` with the identical set.
  - [x] Client tests: `ManualViewer.restriction.test.tsx` (all 11-style chapters listed with canonical numbers; unassigned locked/non-clickable; click no-op; arrows + `/` search skip locked; first-open = first assigned; stored-locked falls back; `null`/omitted = full manual regression) + `store/__tests__/assignedChapters.test.ts` (`setBomb`/`clearSession` reset to `null`; action sets it).
  - [x] `pnpm -w typecheck` clean (no `@ts-ignore`); shared 502 / server 573 / client 475 green; no regressions.
  - [x] **e2e coverage — all ACs, real browsers ↔ real in-process server** (`apps/client/e2e/flows/asymmetric-expert-roles.spec.ts`, 5 specs). A Facilitator hosts a single active team A (Ada Defuser + browser Experts; the idle Defuser keeps the round unresolved while manuals are inspected). Specs: **(1)** modifier ON + 2 Experts → each manual lists all 11 chapters, unassigned **shown-locked (disabled)**, the two navigable sets **disjoint**, **union = 11** (sizes {6,5}), Defuser has no manual (AC-1/2); **(2)** modifier ON + solo Expert → full manual (AC-3); **(3)** modifier OFF + 2 Experts → full manual (AC-3); **(4)** a restricted Expert who **reloads** mid-round re-restricts to the identical set (AC-4, exercises the server reconnect re-delivery in the browser); **(5)** on a restricted Expert: locked chapters non-clickable, arrows **skip** locked, `/` search **excludes** locked (AC-2). **All 5 pass**; full e2e suite **22 passed** (17 pre-existing + 5 new), no regressions.
  - [ ] **Human verification (Jay)** [[human-verification-ac-rule]]: every observable behaviour of all four ACs is now automated headlessly by the 5 e2e specs above (real Chromium ↔ real server). Jay's interactive pass on the Docker stack is a final confirmation only — record the observed result here. **PENDING Jay's confirmation** (story stays at `review` until then).

### Review Findings (adversarial code review 2026-07-03)

- [ ] [Review][Decision] Allocation shuffles only the Expert ORDER, never the chapters — with 2 Experts the two half-sets are always the same fixed canonical interleave ({1,3,5,7,9,11} vs {2,4,6,8,10}); the seed only decides who gets which half (2 outcomes, not C(11,6)). GDD "randomly allocated" arguably intends a chapter-level seeded shuffle. Decide: shuffle `chapterIds` too (still seeded/deterministic) or accept the fixed interleave. [`packages/shared/src/roles/allocateExpertChapters.ts`]
- [ ] [Review][Decision] `PLAYER_REMOVE` mid-round of a restricted Expert permanently strands their 5–6 chapters — no re-allocation, no fail-open for the survivor, and the reattach record is deleted so re-delivery can never heal it; the now-solo Expert stays locked to their half (AC-3's solo rule is only evaluated at ROUND_START). Decide: fail-open the survivors / re-allocate / block mid-round removal. [`apps/server/src/handlers/sessionHandlers.ts:1852`]
- [ ] [Review][Decision] An Expert who disconnected during preparation still consumes a chapter share at round start (allocation filters on roster role only, no connectivity check) — their chapters are dark for the round unless they reconnect, with no facilitator warning. Decide: allocate only to connected Experts, warn the facilitator, or accept. [`apps/server/src/handlers/sessionHandlers.ts:1509`]
- [ ] [Review][Decision] A teamless player who joins between rounds with role `expert` gets the FULL manual during a restricted round (`TEAM_ASSIGN` is lobby-locked so they can never be teamed; `teamId === undefined` ⇒ not resting ⇒ ManualViewer with `assignedChapterIds: null`) — a restriction bypass anyone can create by rejoining under a fresh name. Decide: route teamless experts to the standby panel, or accept for v1. [`apps/client/src/ui/ActiveRound.tsx:67,103-109`]
- [ ] [Review][Patch] Reattach race + missing staleness guard can leave a restricted Expert silently unrestricted all round: the reattach `EXPERT_CHAPTER_ASSIGNMENT` emit sits outside the `timer !== null && bomb !== null` gate, and a refresh landing between the round persist and BOMB_INIT gets the assignment first, then BOMB_INIT's `setBomb` wipes it (the ROUND_START delivery loop reuses a pre-refresh socket snapshot, so no re-send). Fix both ends: client checks `payload.roundNumber` before applying (the field exists for exactly this), and the reattach emit moves inside the bomb/timer gate. [`apps/client/src/net/bindServerEvents.ts:84-86`, `apps/server/src/handlers/sessionHandlers.ts:546-564`]
- [ ] [Review][Patch] An Expert dealt `[]` (team with ≥12 Experts; MAX_PLAYERS=16 makes it reachable) gets a dead "No manual chapters available" screen for the whole round — exactly the "empty-forever manual" the story's fail-safe guard forbids. Fix: server skips empty-list emits (Expert falls back to full access per the pledge). [`apps/server/src/handlers/sessionHandlers.ts:1614-1620`, `packages/shared/src/roles/allocateExpertChapters.ts`]
- [ ] [Review][Patch] Chapter numbering shifts between restricted and unrestricted rounds: restricted numbers against `realChapters` (dev-demo dropped), unrestricted against the full list including `dev-demo` (unconditionally first in `SANDBOX_MODULES`) — the same chapter is "chapter 3" one round and "chapter 4" the next, poison for number-shouting coordination (AC-2's canonical-numbers intent). Fix: pass `realChapters` on both ActiveRound manual paths. [`apps/client/src/ui/ActiveRound.tsx:103-111`]
- [ ] [Review][Patch] The "never broadcast" test only asserts `SESSION_STATE` omits the map (near-tautological — `RoundState` was never on it); the real leak vector is untested. Add an assertion that Expert A never receives Expert B's `EXPERT_CHAPTER_ASSIGNMENT` payload. [`apps/server/src/handlers/__tests__/sessionHandlers.test.ts:511-534`]
- [x] [Review][Defer] Story 9.2 lifeline-token work is intermixed in the same uncommitted tree (LIFELINE_TOKENS event/payload, gameStore token state, `resolveRound.ts` grant block, reconnect re-hydration, untracked `lifelines/` modules + their own tests) — out of 9.1 scope; review with 9.2. Carry-over finding for that review: one `grantToken` throw mid-loop leaves earlier earners granted-but-unnotified and later earners ungranted, with a misleading "no tokens this round" log [`apps/server/src/round/resolveRound.ts:333-345`] — deferred, belongs to story 9.2

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

claude-opus-4-8 (Claude Opus 4.8) via gds-dev-story

### Debug Log References

- Shared build (emitting tsc) initially failed on `roles/__tests__/allocateExpertChapters.test.ts`: `CHAPTER_IDS` is a `readonly ModuleId[]`, so `[...CHAPTER_IDS].indexOf(id: string)` rejected the `string` arg. Fixed by typing the test's `CHAPTERS` fixture as `string[]`.
- Client `ManualViewer.restriction.test.tsx` initially failed: the sidebar button's accessible name is the canonical number + title with **no separator** (e.g. `"1Wires"`), so a `/\bWires\b/` matcher found no word boundary between the digit and `W`. Fixed by matching on the bare title substring.
- Server test typecheck: mirrored the file's existing `onceEvent` cast (`socket.once(event as 'SESSION_STATE', … as never)`) and used `as unknown as Record<…>` for the `'chapterAssignments' in state` guard.

### Completion Notes List

- **Consumer story, not a module.** Wired the dormant `asymmetricExpertRoles` modifier end-to-end: pure seeded allocator (shared) → server compute+persist+targeted-deliver at ROUND_START + reconnect re-delivery → client store + shown-locked `ManualViewer` gating. No config/type/UI/validation change (the toggle was already plumbed).
- **All three design decisions honoured:** unassigned chapters are SHOWN-LOCKED (listed with canonical numbers, greyed/non-clickable/out-of-search) not hidden; allocation is ROUND-ROBIN (seeded Fisher–Yates shuffle then deal); "randomly allocated" is DETERMINISTIC-SEEDED off the seed chain keyed by `pairIndex` (retry-reproducible; no `Math.random`).
- **Fail-safe posture (defect-class spirit):** the allocator is pure/total (no throw; empty experts → `{}`); the server allocation + delivery are each `try/catch`-wrapped so a failure falls back to full manual access rather than detonating an already-armed round; the client filter is fail-open (`null` = full manual). An unrestricted round never sends the event, so the client stays `null` — no stale-restriction bleed (guaranteed by the `setBomb` reset landing before any assignment).
- **AC-2 secrecy:** delivery is targeted per-Expert (reusing the roster `fetchSockets()` array), never on `SESSION_STATE`; a server test asserts the broadcast omits the map and that the Defuser + resting team receive nothing. The full map lives only on server-side `RoundState`.
- **Tests:** 11 shared allocator/`CHAPTER_IDS` unit tests; 6 server integration specs (2-Expert disjoint delivery, SESSION_STATE omission, solo-Expert none, modifier-off none, seed-derived/retry-reproducible, reconnect re-delivery); 8 client component specs + 3 store specs. `pnpm -w typecheck` clean (no `@ts-ignore`); full suites green — shared 502, server 573 (+2 pre-existing skips), client 475.
- **Full e2e verification (real browsers):** 5 Playwright specs cover every observable AC — disjoint shown-locked split (union 11, {6,5}), solo-Expert full manual, modifier-off full manual, **mid-round reload re-restrict** (drives the server reconnect re-delivery through the browser), and locked-chapter non-clickable + arrows/`/`-search skipping locked. All pass; full suite 22 passed, no regressions.
- **⏳ Human verification (Jay) still PENDING** — every observable behaviour is now automated by the e2e specs, so Jay's interactive check ([[human-verification-ac-rule]]) is a final confirmation; the story sits at `review` until he records his observed result here.

### File List

**Shared (`packages/shared`)**
- `src/modules/registry.ts` — add `CHAPTER_IDS` (= `MODULE_IDS`)
- `src/roles/allocateExpertChapters.ts` — new pure allocator
- `src/roles/index.ts` — new barrel
- `src/roles/__tests__/allocateExpertChapters.test.ts` — new tests
- `src/index.ts` — export `./roles/index.js`
- `src/events/payloads.ts` — add `ExpertChapterAssignmentPayload`
- `src/events/index.ts` — export the payload
- `src/events/server-to-client.ts` — add `EXPERT_CHAPTER_ASSIGNMENT`
- `src/types/round.ts` — add `chapterAssignments?` to `RoundState`

**Server (`apps/server`)**
- `src/handlers/sessionHandlers.ts` — imports; ROUND_START allocate+persist+targeted-deliver; reconnect re-delivery
- `src/handlers/__tests__/sessionHandlers.test.ts` — new `ROUND_START — Asymmetric Expert Roles` describe

**Client (`apps/client`)**
- `src/store/gameStore.ts` — `assignedChapterIds` + `setAssignedChapters` + resets
- `src/net/bindServerEvents.ts` — register/unregister `EXPERT_CHAPTER_ASSIGNMENT`
- `src/manual/ManualViewer.tsx` — `assignedChapterIds` prop + shown-locked gating
- `src/ui/ActiveRound.tsx` — reactive read + real-chapter filter for restricted rounds
- `src/manual/__tests__/ManualViewer.restriction.test.tsx` — new tests
- `src/store/__tests__/assignedChapters.test.ts` — new tests
- `e2e/flows/asymmetric-expert-roles.spec.ts` — new real-browser e2e (5 specs: disjoint shown-locked, solo full, modifier-off full, reload re-restrict, locked non-clickable/skip)

## Change Log

- 2026-07-03 — Story 9.1 drafted (ready-for-dev) via gds-create-story. First story of Epic 9; epic → in-progress.
- 2026-07-03 — Design decisions resolved by Jay: (1) unassigned chapters SHOWN-LOCKED not hidden; (2) allocation ROUND-ROBIN; (3) DETERMINISTIC-SEEDED. AC-2 + Task 6 reworked for shown-locked (`ManualViewer` gains an `assignedChapterIds` prop; canonical numbering preserved; nav/search skip locked chapters).
- 2026-07-03 — Implemented (gds-dev-story). Tasks 1–7 complete: shared seeded round-robin allocator + `CHAPTER_IDS` + typed event + `RoundState.chapterAssignments`; server ROUND_START compute/persist/targeted-deliver + reconnect re-delivery (both fail-safe); client store + shown-locked `ManualViewer` + `ActiveRound` real-chapter filter. 28 new tests (11 shared / 6 server / 8+3 client); `pnpm -w typecheck` clean; shared 502 / server 573 / client 475 green. Status → review. Human verification (Jay) pending.
