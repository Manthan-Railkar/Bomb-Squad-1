# Play over the internet — local Docker + ngrok (no voice, 2 players)

A lightweight way to invite friends to play the bomb-defusal game over the internet
while the whole stack runs on your machine in Docker. Voice is disabled; the game is
exposed through a single ngrok HTTP tunnel.

Branch: `worktree-vercel-2p-lite`. Run everything from this worktree directory.

---

## How it works

- The stack runs locally in Docker: **redis, postgres, server, client, caddy**.
  LiveKit + coturn (voice) are **intentionally not started**.
- **Caddy** is the single entrypoint. A bare `docker compose up` auto-merges
  `docker-compose.override.yml`, which swaps in `Caddyfile.dev` — plain **HTTP on
  port 80** (no HTTPS redirect), serving the SPA, `/socket.io/*`, and `/health`
  through one port. That single port is what ngrok tunnels.
- **ngrok** dials outbound and gives you a public `https://…ngrok-free.app` URL that
  forwards to your local `:80`. It layers TLS on top, so players get HTTPS. Because
  ngrok connects *out*, there is no router/port-forwarding and no WSL2 NAT setup.
- The client reads its server URL from `window.location.origin`, so it works at
  whatever ngrok URL you get — **no rebuild per session**.
- Voice is off via a build flag (`VITE_VOICE_ENABLED=false`), so the voice-connect
  UI is hidden and there are no `ws://localhost` references (no mixed-content issues
  over the ngrok HTTPS URL).

---

## One-time setup

1. **`.env`** must exist in this worktree (a fresh worktree doesn't inherit the
   gitignored `.env`). It's already present here; if you recreate the worktree, copy
   it from the main checkout. The `LIVEKIT_*` / `TURN_*` values only need to be
   non-empty (config validation) — the containers never run.
2. `.env` sets **`VITE_VOICE_ENABLED=false`** — this is what disables voice. Leave it
   set for this deploy.
3. Install [ngrok](https://ngrok.com/download) and add your authtoken once:
   `ngrok config add-authtoken <token>`.

---

## Start the stack

```bash
docker compose -p vercel-2p-lite up -d --build redis postgres server client caddy
```

- `-p vercel-2p-lite` scopes the project so it never collides with the main stack.
- `--build` is required after any code change (and the first run).
- Note: only these five services are listed, so **livekit/coturn stay stopped**.

Wait for all five to report healthy (the server has a ~30s health `start_period`; Caddy
starts only once the server is healthy):

```bash
docker compose -p vercel-2p-lite ps
```

Verify the entrypoint answers:

```bash
curl -s http://localhost/health      # -> {"status":"ok",...}
curl -s -o /dev/null -w "%{http_code}\n" http://localhost/    # -> 200
```

---

## Open the tunnel

```bash
ngrok http 80
```

Share the `https://…ngrok-free.app` URL it prints.

- Free-tier URLs change every time you restart ngrok — just re-share the new one.
- First-time visitors see ngrok's interstitial warning page once; they click
  **"Visit Site"** to continue. The game socket uses the WebSocket transport, so it
  isn't affected by that page.

---

## How to play (2 players + you hosting)

The game has a **facilitator** (host) who can't defuse, plus the players. For a
2-player co-op on a single team:

1. Open the ngrok URL in a **spare tab** as the **facilitator** → create a session.
2. Your 2 friends open the same URL and join with the session's **join code**.
3. As facilitator, assign **both friends to Team A** (leave Team B empty), then
   configure and start rounds.
4. Each round, one is **Defuser** (drives the 3D bomb) and the other is **Expert**
   (reads the manual). They **swap** each round via the relay rotation.

> Single-team play works but has no opponent, so the scoreboard is a solo time-trial
> (cosmetic — gameplay is unaffected).

---

## Stop / restart / logs

```bash
# Stop (keep data volumes)
docker compose -p vercel-2p-lite down

# Restart after a code change
docker compose -p vercel-2p-lite up -d --build redis postgres server client caddy

# Tail logs
docker compose -p vercel-2p-lite logs -f server
docker compose -p vercel-2p-lite logs -f caddy
```

Stop the tunnel with `Ctrl-C` in the ngrok terminal.

---

## What this deploy changed (all non-destructive)

- `apps/client/src/voice/voiceEnabled.ts` — build-time voice flag, **defaults to
  enabled**; only `VITE_VOICE_ENABLED=false` turns it off.
- `apps/client/src/ui/Lobby.tsx`, `ActiveRound.tsx`, `src/vite-env.d.ts` — gate the
  two voice-connect entry points behind the flag.
- `apps/client/Dockerfile`, `docker-compose.yml` — thread `VITE_VOICE_ENABLED`
  through the client build (default `true`).
- `apps/server/Dockerfile` — base image `node:20-alpine → node:20-slim` (glibc: the
  LiveKit native FFI binding has no musl build, so the server crashed at boot on
  Alpine) and add `wget` (the compose healthcheck needs it on Debian). Required to
  make the server start.
- `.env` — `VITE_VOICE_ENABLED=false`.

Flip `VITE_VOICE_ENABLED` back to `true` (and run the full stack including
livekit/coturn) to restore voice — nothing was removed.
