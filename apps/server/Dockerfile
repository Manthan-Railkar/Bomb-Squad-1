# syntax=docker/dockerfile:1
# Multi-stage build for @bomb-squad/server.
# Uses tsx to run TypeScript source directly so workspace imports from
# packages/shared (which exports its .ts source) resolve without a separate
# shared compile step.  Node base satisfies engines: ">=20 <21".

# Debian (glibc), NOT alpine: @livekit/rtc-node's native FFI binding
# (@livekit/rtc-ffi-bindings) ships only *-gnu variants — there is no musl build,
# so the server's static import of the voice relay bot crashes at boot on alpine.
# glibc resolves the linux-*-gnu binding so the server starts (voice deps load
# even though the no-voice tunnel deploy never runs the LiveKit containers).
FROM node:20-slim AS base
# wget: the docker-compose healthcheck probes /health with wget. Alpine bundled
# it via busybox; Debian slim does not ship it, so install it explicitly to keep
# the existing healthcheck contract working.
RUN apt-get update && apt-get install -y --no-install-recommends wget \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate
WORKDIR /app

# ── deps: install from lockfile (cached layer) ────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile

# ── runtime: copy source on top of installed deps ────────────────────────────
FROM deps AS runtime
COPY packages/shared/ packages/shared/
COPY apps/server/ apps/server/
EXPOSE 3001
# pnpm workspaces install each package's binaries under that package's own
# node_modules/.bin (NOT the root .bin), so tsx lives at apps/server/node_modules/.bin.
CMD ["apps/server/node_modules/.bin/tsx", "apps/server/src/index.ts"]
