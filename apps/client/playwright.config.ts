import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e harness (Story TD-6) — real browser + real R3F/WebGL against
 * the REAL in-process game server (bootTestServer: real handlers + real timer
 * scheduler over memory Redis). Docker-free by design: the Docker stack is where
 * e2e suites go to flake (stale images, cross-worktree port collisions); the
 * browser is the fidelity investment here, the infra doesn't have to be.
 *
 * Ports are fixed and deliberately uncommon (worktree runs collide on the usual
 * 5173/3001): game server 3199, vite 5199. `reuseExistingServer: false` so a
 * run can never silently attach to another worktree's server.
 */

/** In-process game server port — VITE_SERVER_URL below must agree. */
const GAME_SERVER_PORT = 3199;
/** Vite dev-server port for the suite. */
const CLIENT_PORT = 5199;

export default defineConfig({
  testDir: './e2e',
  // Specs share one game server process but each boots its own session; run
  // them serially until parallel workers are justified with evidence.
  fullyParallel: false,
  workers: 1,
  // Flake policy: one retry locally (trace captured on it); a spec that needs
  // the retry gets its wait fixed — never a sleep.
  retries: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    viewport: { width: 1280, height: 720 },
    // prefers-reduced-motion: camera focus jumps land instantly (no animated
    // dolly), so mesh→screen projections are stable the frame after a click.
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        contextOptions: { reducedMotion: 'reduce' },
        launchOptions: {
          // Software WebGL (SwiftShader via ANGLE) — headless/GPU-less (WSL2,
          // CI) still renders the R3F scene. A blank canvas is a FAILURE, not
          // a reason to skip WebGL specs.
          args: ['--use-angle=swiftshader'],
        },
      },
    },
  ],
  webServer: [
    {
      // The in-process game server (real handlers, memory Redis). Plain tsx,
      // NEVER `tsx watch` — a watch restart drops in-memory timer wakes.
      command: `pnpm exec tsx e2e/servers/gameServer.ts`,
      url: `http://localhost:${GAME_SERVER_PORT}`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { E2E_GAME_SERVER_PORT: String(GAME_SERVER_PORT) },
    },
    {
      command: `pnpm exec vite --port ${CLIENT_PORT} --strictPort`,
      url: `http://localhost:${CLIENT_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        // Point the client's socket at the e2e game server (App.tsx seam).
        VITE_SERVER_URL: `http://localhost:${GAME_SERVER_PORT}`,
      },
    },
  ],
});
