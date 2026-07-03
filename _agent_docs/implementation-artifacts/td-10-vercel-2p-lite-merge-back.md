---
baseline_commit: bf4630f
context:
  - _agent_docs/project-context.md
  - _agent_docs/vercel-2p-lite-plan.md
  - apps/server/src/handlers/sessionHandlers.ts
  - packages/shared/src/session/relay.ts
  - packages/shared/src/types/module.ts
  - apps/client/src/manual/ManualViewer.tsx
---

# Story TD-10: vercel-2p-lite Merge-Back — Single-Team Bomb-Seed Fix, zh Manual i18n, ngrok Deploy Path

Status: done

<!-- Retroactive implementation-summary ticket (work already landed in merge
     90631b2). The vercel-2p-lite worktree hosted the "play over the internet
     from local Docker via one ngrok tunnel" deployment. Live 2-player testing
     there surfaced a same-bomb-every-round bug; the fix, plus the worktree's
     accumulated i18n and deploy work, was merged back to master and the
     worktree retired. -->

## Story

As a 2-player team relaying on a single team,
I want each round to generate a fresh bomb (and the manual readable in Simplified Chinese, over an internet tunnel),
so that swapping Defuser/Expert roles between rounds is a real second round — not a replay of a bomb the new Defuser just watched being solved.

## The bug (root cause)

**Symptom (Jay, live 2-player session, 2026-07-03):** two players on Team A; after the role swap, round 2 showed the identical bomb as round 1.

**Root cause:** Story 8.11 (AC-2, FR19) seeds bomb generation by *pair*, not turn — `pairIndex = ceil(roundNumber / 2)` in the ROUND_START handler — so that in two-team play, the two teams' matched turns share a layout while `deriveTeamSeed` diverges per team. The design assumes the two turns of a pair go to **different** teams. In a single-populated-team session, `selectActiveTeam`'s snake **fallback** arms the *same* team for both turns of the pair: rounds 1 and 2 share `pairIndex = 1` AND the same team seed → byte-identical bomb.

**Fix:** in the ROUND_START handler, when fewer than 2 teams are populated, seed by the raw `roundNumber` instead of `pairIndexFor(roundNumber)`. Invariants preserved:
- Two-team pair-layout sharing (FR19) — unchanged, ≥2 populated teams keep the pair key.
- Story 8.8 retry reused-seed guarantee — a retry reuses the same `roundNumber`, so the identical bomb still regenerates in both modes.

**Regression test:** `sessionHandlers.test.ts` — "single-team relay: round 2 gets a DIFFERENT bomb than round 1 (no pair-seed reuse)"; verified failing against the pre-fix handler, passing after.

## What landed (merge `90631b2`, three branch commits)

1. **`fix:` single-team bomb-seed** — as above. `apps/server/src/handlers/sessionHandlers.ts` + regression test.
2. **`feat(i18n):` Simplified-Chinese manual prose + language toggle**
   - Shared: `Locale` type (`'en' | 'zh'`), `getManualPages(locale?: Locale)` (optional param — backward compatible). All 11 module manuals carry zh translations of the **prose only**; table row values (words, symbols, labels the Defuser reads off the bomb) stay literal English tokens so Defuser↔Expert callouts hold across languages.
   - Client: EN/中文 toggle in the ManualViewer sidebar, persisted to localStorage via `uiStore.manualLocale`; chapters rebuild on switch. Chapter ids are locale-invariant, so the open chapter — and a 9.1 per-expert chapter assignment — survive a language switch.
   - Client: new `MANUAL_MODULES` list (= `SANDBOX_MODULES` minus `dev-demo`) keeps the sandbox-only reference module out of the player-facing handbook in Preparation/ActiveRound; the `/dev` sandbox keeps the full list.
3. **`feat(deploy):` no-voice local + ngrok tunnel path** (authored in a prior session)
   - `VITE_VOICE_ENABLED` build flag, **default on** — only an explicit `false` (baked at vite build) hides the two voice-connect entry points (`LobbyMicCheck`, `VoiceController`), keeping LiveKit fully dormant where the tunnel can't reach it. Master behavior unchanged by default.
   - Server image `node:20-alpine` → `node:20-slim`: `@livekit/rtc-node`'s FFI bindings ship no musl build, so the server crashed at boot on alpine; `wget` installed explicitly for the compose healthcheck.
   - `README-tunnel.md` — run/stop/ngrok/how-to-play.

## Merge-conflict resolution (branch predates td-9 + 9.1 on master)

Six conflicts, all resolved as "combine both sides" — nothing dropped:

- **4 manuals** (`keypads`, `morse-code`, `whos-on-first`, `complicated-wires`): localized headers/prose **plus** td-9 presentation metadata (`rightAlignLastColumn` / `emphasizeColorWords` / `evenColumns`). The branch's pre-td-9 trailing-spacer-column hack (`[...headers, '']`) was discarded — td-9's metadata is exactly its replacement.
- **`ActiveRound.tsx` / `Preparation.tsx`**: locale-driven chapter rebuild composed with 9.1's per-expert chapter restriction (`assignedChapterIds`) and the review-9.1 real-chapters filter (drop `dev-demo` so chapter numbers players memorise in prep survive into the round). `SANDBOX_MODULES` → `MANUAL_MODULES` in both.
- **3 test stubs** (`ActiveRound*.test.tsx`): the `modules/index.js` mock gained the `MANUAL_MODULES: []` export.

## Verification

- `pnpm -r typecheck` green (4 workspaces); `pnpm -r test` green post-merge — shared 509, server 620, client 511.
- Seed-fix regression test confirmed red on pre-fix code, green after.
- Live fix deployed to the worktree's Docker stack during the session (server rebuilt, clients auto-reattached).
- **Interactive verification ([[human-verification-ac-rule]]): PENDING Jay** — (a) single-team session: play round 1, swap roles, confirm round 2's modules differ; (b) manual 中文 toggle renders zh prose with English table tokens, in both Preparation and ActiveRound (including under a 9.1 restricted chapter set). Record the observed result here when done.

## Worktree retirement

- Compose stack `vercel-2p-lite` brought down (named volumes preserved; containers + network removed).
- Worktree `.claude/worktrees/vercel-2p-lite` removed; branch `worktree-vercel-2p-lite` deleted after full merge (`git branch -d` clean).
- The tunnel deploy now runs from master: `docker compose up -d --build` + `README-tunnel.md`.

## File List

- `apps/server/src/handlers/sessionHandlers.ts` — single-team raw-roundNumber seeding (UPDATED)
- `apps/server/src/handlers/__tests__/sessionHandlers.test.ts` — single-team fresh-bomb regression test (UPDATED)
- `packages/shared/src/types/module.ts`, `types/index.ts` — `Locale`, `getManualPages(locale?)` (UPDATED)
- `packages/shared/src/modules/*/manual.ts` (all 11) — locale-keyed prose, en/zh (UPDATED)
- `apps/client/src/store/uiStore.ts` — `manualLocale` + localStorage persistence (UPDATED)
- `apps/client/src/manual/ManualViewer.tsx` — EN/中文 toggle (UPDATED)
- `apps/client/src/modules/index.ts` — `MANUAL_MODULES` (UPDATED)
- `apps/client/src/ui/ActiveRound.tsx`, `ui/Preparation.tsx` — locale rebuild × 9.1 restriction × real-chapters filter (UPDATED)
- `apps/client/src/ui/__tests__/ActiveRound{,Lifelines,ManualChapters}.test.tsx` — stub `MANUAL_MODULES` (UPDATED)
- `apps/client/src/voice/voiceEnabled.ts`, `vite-env.d.ts`, `ui/Lobby.tsx`, Dockerfiles, `docker-compose.yml`, `README-tunnel.md` — deploy path (NEW/UPDATED)

## Change Log

| Date       | Change |
|------------|--------|
| 2026-07-03 | Bug reported (same bomb both rounds after role swap, 2-player Team A); root-caused to pair-keyed seeding × snake fallback; fixed + regression-tested; deployed to the worktree stack. |
| 2026-07-03 | Worktree i18n + deploy commits committed; branch merged back to master as `90631b2` (6 conflicts resolved against td-9/9.1); all suites green (shared 509, server 620, client 511). |
| 2026-07-03 | Worktree + branch retired; compose stack down (volumes kept). TD-10 written as retroactive summary. Interactive verification pending Jay. |
