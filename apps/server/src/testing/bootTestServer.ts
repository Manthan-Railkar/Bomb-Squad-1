/**
 * bootTestServer — the Docker-free in-process game server (Story TD-6, extracted
 * from tools/sim-clients/src/verify.ts where TD-5 proved the pattern).
 *
 * Boots a REAL Socket.IO server wired with the REAL session + module handlers
 * and the REAL timer scheduler over a Map-backed in-memory Redis and a no-op
 * session-end archive. Same reducers, same authority gates, same broadcasts as
 * production — only the infrastructure (Redis/Postgres/Caddy/Docker) is swapped
 * for in-process stand-ins. Consumers: the sim-clients `pnpm verify` harness and
 * the Playwright e2e suite's webServer entrypoint.
 *
 * Run the host process on plain `tsx`, never `tsx watch` — a watch restart drops
 * the in-memory setTimeout expiry wake and timer-expiry paths silently die.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server as SocketIOServer } from 'socket.io';
import {
  registerSessionHandlers,
  type SessionIOServer,
  type SessionLog,
} from '../handlers/sessionHandlers.js';
import { registerModuleHandlers } from '../handlers/moduleHandlers.js';
import { registerManualHandlers } from '../handlers/manualHandlers.js';
import { createTimerScheduler } from '../timer/index.js';
import type { RedisStore, UpdateDecision } from '../state/redis.js';

const noopLog: SessionLog = { info: () => {}, error: () => {} };

/** Single-process Map-backed RedisStore (mirrors the server test harness). */
export function memoryRedis(): RedisStore {
  const data = new Map<string, string>();
  return {
    async getJSON<T>(key: string): Promise<T | null> {
      const raw = data.get(key);
      return raw === undefined ? null : (JSON.parse(raw) as T);
    },
    async setJSON<T>(key: string, value: T): Promise<void> {
      data.set(key, JSON.stringify(value));
    },
    async del(key: string): Promise<void> {
      data.delete(key);
    },
    async updateJSON<T, R>(
      key: string,
      mutate: (current: T | null) => UpdateDecision<T, R>,
    ): Promise<{ committed: boolean; result: R }> {
      const before = data.get(key);
      const current = before === undefined ? null : (JSON.parse(before) as T);
      const decision = mutate(current);
      if (!decision.commit) return { committed: false, result: decision.result };
      data.set(key, JSON.stringify(decision.value));
      return { committed: true, result: decision.result };
    },
    async ping(): Promise<boolean> {
      return true;
    },
    isReady(): boolean {
      return true;
    },
  };
}

/**
 * No-op session-end archive (Story 8.10 seam): SESSION_END flips the phase and
 * the archive resolves to nothing. Upgrade to a recording stub only when a test
 * wants to assert archived rows.
 */
export function noopArchive() {
  return {
    async ping() {
      return true;
    },
    async ensureSchema() {},
    async archiveSession() {},
    async close() {},
  };
}

export interface TestServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

/**
 * Boot the in-process server. `port` 0 (default) picks an ephemeral port —
 * pass a fixed one for the Playwright webServer contract. Plain HTTP GETs
 * (anything socket.io doesn't own) answer 200 "ok" so a readiness probe has
 * something to poll.
 */
export async function bootTestServer(port = 0): Promise<TestServer> {
  const httpServer = createServer((req, res) => {
    // Readiness/health for webServer probes; socket.io intercepts /socket.io/*
    // before this handler, so this only ever answers plain HTTP.
    res.statusCode = 200;
    res.end('ok');
  });
  const io = new SocketIOServer(httpServer) as unknown as SessionIOServer;
  const redis = memoryRedis();
  const timer = createTimerScheduler({
    redis,
    io,
    log: noopLog,
    // unref so an armed wake never keeps the host process alive.
    setTimer: (cb, ms) => setTimeout(cb, ms).unref(),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  });
  const archive = noopArchive();
  registerSessionHandlers(io, { redis, log: noopLog, timer, archive });
  registerModuleHandlers(io, { redis, log: noopLog, timer, archive });
  // Story 9.4: the Expert manual-position relay drives the Spectator Lounge
  // multiview (MANUAL_NAVIGATE → EXPERT_MANUAL_POSITION). Register it so the e2e
  // suite exercises manual navigation + the lounge mirror end-to-end.
  registerManualHandlers(io, { redis, log: noopLog });
  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  const bound = (httpServer.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${bound}`,
    port: bound,
    close: () => new Promise<void>((resolve) => io.close(() => resolve())),
  };
}
