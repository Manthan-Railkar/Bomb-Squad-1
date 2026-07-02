/**
 * Playwright webServer entrypoint — boots the shared in-process game server
 * (real session + module handlers, real timer scheduler, memory Redis, no-op
 * archive) on the fixed e2e port. See playwright.config.ts; run on plain tsx.
 *
 * @bomb-squad/server is a DEV dependency of the client used only under e2e/
 * (the TD-5 precedent) — nothing shipped imports it.
 */
import { bootTestServer } from '@bomb-squad/server/src/testing/bootTestServer.js';

const port = Number(process.env.E2E_GAME_SERVER_PORT ?? 3199);

const server = await bootTestServer(port);
console.log(`[e2e] in-process game server at ${server.url}`);

// Keep the process alive; Playwright owns the lifecycle and kills it at exit.
const stop = async (): Promise<void> => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
await new Promise(() => {});
