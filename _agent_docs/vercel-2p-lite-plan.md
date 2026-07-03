# Reduced Deployment Plan — `vercel-2p-lite`

**Goal:** Ship a public, HTTP-hosted demo of the bomb-defusal game supporting **2 players per
session, no voice**. Worktree: `.claude/worktrees/vercel-2p-lite` (branch `worktree-vercel-2p-lite`).

---

## The one architectural constraint that shapes everything

The server is a **persistent, stateful Fastify + Socket.IO process**:
- Real-time WebSocket connections (Socket.IO) that must stay open for the whole game.
- A **server-authoritative countdown timer** — the *only* legit `setTimeout` in the codebase
  (`apps/server/src/timer/timerScheduler.ts`) fires expiry wakes in the background.
- State in **Redis** (live session/bomb state) + **Postgres** (session archive).

Vercel's serverless/edge functions are request→response with **no long-lived sockets and no
background timers**. **The game server cannot run on Vercel.** The Vite/React/Three.js client,
however, is a static SPA that already falls back to `window.location.origin` / `VITE_SERVER_URL`
for its socket target (`apps/client/src/App.tsx:33-36`) — Vercel hosts it perfectly.

### Chosen topology (defaults — override if you disagree)
- **Client → Vercel** (static build).
- **Server → a WebSocket-capable PaaS** (Railway / Render / Fly.io / Koyeb) as a normal
  long-running Node service.
- **State → in-memory, single instance** — drop Redis + Postgres, hold session/bomb state in a
  process `Map`. Zero managed dependencies; state is lost on restart (fine for a demo). Requires
  **exactly one** server instance (no horizontal scaling).
- **2-player cap → hard reject the 3rd join** with a "session full" error (net-new; sessions are
  currently unbounded).

> If you'd rather keep managed Redis, or push everything onto one PaaS instead of Vercel, say so —
> only the deploy config changes, not the app surgery below.

---

## Work breakdown

### A. Strip voice (LiveKit / coturn / TURN)
**Server** (`apps/server`):
- Remove `registerVoiceHandlers` from `src/index.ts`; delete `src/handlers/voiceHandlers.ts`,
  `src/voice/*` (loungeBridge, loungeRelayBot, mintToken, turnCredentials), and the `LoungeBridge`
  construction block in `index.ts`.
- Drop deps: `livekit-server-sdk`, `@livekit/rtc-node`.
- Drop env vars: `LIVEKIT_*`, `TURN_*` from `src/config/env.ts` (`EnvSchema`, `Config`, `parseEnv`)
  and `.env.example`.
- Remove VOICE_TOKEN / voice events from the shared socket contract (`packages/shared`).

**Client** (`apps/client`):
- Remove voice UI + logic: `src/voice/*`, `src/store/voiceStore.ts`, and voice UI components
  (`VoiceController`, `MuteControl`, `SpeakerIndicator`, `AudioUnblockPrompt`, `LobbyMicCheck`)
  plus their mount points in `Lobby.tsx`, `ActiveRound.tsx`, `ui/index.ts`.
- Drop dep: `livekit-client`.
- Remove `VITE_FORCE_TURN_RELAY` handling.

### B. Replace Redis + Postgres with in-memory state
- Implement an in-memory `RedisStore` shim satisfying the existing `RedisStore` interface
  (`getJSON/setJSON/del/ping/isReady/updateJSON`) over a `Map` — `updateJSON` becomes a trivial
  synchronous load→mutate→store (no real WATCH/MULTI needed on a single instance). This keeps every
  call site (`state/index.ts` consumers, session/timer code) unchanged.
- Stub or no-op the Postgres archive (`persistence/postgres.ts`) — `archiveSession` becomes a
  logging no-op; `ensureSchema`/`ping` return ok.
- Remove `REDIS_URL` / `DATABASE_URL` from required env (or default them, unused).
- Drop deps `ioredis`, `pg` (or keep behind the real adapter via an env switch — see C).

> Keep the swap behind a single factory so the full stack still builds. Simplest: an env flag
> `LITE=1` (or a separate entrypoint) that selects in-memory adapters. This preserves the original
> Redis/Postgres path on `master` and makes the lite build a thin override, not a fork.

### C. 2-player cap
- In the `SESSION_JOIN` transaction (`apps/server/src/handlers/sessionHandlers.ts`, the
  `updateJSON` around line 452-457 that calls `addPlayerToSession`), add a guard: if the roster
  already holds 2 non-facilitator players and the joiner is new, `commit: false` with a
  `SESSION_FULL` result → emit a clear error to the client.
- Decide whether the facilitator counts toward the 2 (recommend: 2 = the two *players*; facilitator
  is separate, matching the existing `role: 'facilitator'` distinction). Confirm against how a
  1-machine demo is actually played.
- Client: surface the "session full" error on the join screen.

### D. Client build / Vercel config
- `apps/client/vercel.json` (or Vercel dashboard): build command `pnpm --filter @bomb-squad/client build`,
  output `apps/client/dist`, SPA rewrite all routes → `/index.html`.
- Handle the pnpm monorepo on Vercel (root install, filtered build) — set root directory + install
  command, or use `vercel.json` `installCommand`.
- Set `VITE_SERVER_URL` = the PaaS server's public `https://` origin (Socket.IO upgrades to `wss://`).
- **CORS:** server currently `cors: { origin: true }` (`index.ts`) — fine for a demo, or lock to the
  Vercel domain.

### E. Server deploy config (Railway/Render/etc.)
- Dockerfile or Nixpacks build for `apps/server` (`pnpm --filter @bomb-squad/server build`, run
  `node dist/index.js`). Confirm `tsc` build output path + workspace resolution of
  `@bomb-squad/shared`.
- Env: `PORT` (platform-injected), plus whatever remains after B. **Single instance only.**
- Ensure WebSocket support is on (Railway/Render/Fly all support it by default; no extra config on
  Render for WS, Fly needs `[[services]]` handlers — verify per chosen host).

### F. Tests / cleanup
- Delete/adjust voice tests (`voiceHandlers.test.ts`, client voice `__tests__`).
- Update `redis.test.ts` / persistence tests for the in-memory shim, or gate them.
- Keep the e2e harness (`pnpm e2e`) green against the lite server.
- `pnpm -r typecheck` + `pnpm -r test` clean.

---

## Open questions to confirm before implementing
1. **Topology** — Vercel (client) + Railway/Render (server)? Or single-PaaS? *(assumed split)*
2. **State** — in-memory single instance OK, or keep managed Redis? *(assumed in-memory)*
3. **Lite as an env-switch on `master`'s code vs. a hard fork** — recommend env-switch so the
   full-featured build keeps working. *(assumed env-switch)*
4. Does the facilitator count toward the 2-player cap?

## Rough sequencing
1. In-memory adapters + env-switch (B) — unblocks local run without Redis/Postgres.
2. Strip voice (A).
3. 2-player cap (C).
4. Vercel + PaaS deploy config (D, E).
5. Test cleanup + green CI (F).
6. Deploy, then interactive 2-player verification (per the human-verification rule).
