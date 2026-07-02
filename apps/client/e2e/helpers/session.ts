/**
 * Session-flow drivers (Story TD-6): host/join through the real Landing UI,
 * fill player seats with TD-5 sim-clients bots (spawned as a CHILD PROCESS so
 * TD-5's one-way dependency rule — nothing in apps/* imports the tool — holds
 * to the letter), and drive the Facilitator controls (assignments, round
 * config, the two-step confirms) exactly as a human would.
 *
 * Every driver is server-truth-driven: it waits for the UI to reflect the
 * broadcast, never for time. Assignments are SEQUENTIAL by design — TEAM_ASSIGN
 * is a load-modify-store on the session key (TD-5's documented race).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Must agree with playwright.config.ts. */
export const GAME_SERVER_URL = 'http://localhost:3199';
/** The vite dev server the suite runs against (for extra browser contexts —
 *  `browser.newContext()` does not inherit the config's baseURL). */
export const CLIENT_URL = 'http://localhost:5199';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Two-step ConfirmButton: arm (label) then Confirm. */
export async function confirmTwoStep(page: Page, label: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: label }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
}

/**
 * Host a session from Landing; returns the join code shown in the Lobby.
 * Self-healing against the cold-start hydration window (see helpers/sandbox.ts):
 * re-clicks until the lobby's join code is visible.
 */
export async function hostSession(page: Page): Promise<string> {
  await page.goto(`${CLIENT_URL}/`);
  await expect(async () => {
    await page.getByRole('button', { name: 'Host a session' }).click();
    await expect(page.getByTestId('join-code')).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  return (await page.getByTestId('join-code').innerText()).trim();
}

/** Join via Landing: name, role pick, then the 6-cell code (auto-submits). */
export async function joinSession(
  page: Page,
  joinCode: string,
  displayName: string,
  role: 'Defuser' | 'Expert' | 'Spectator',
): Promise<void> {
  await page.goto(`${CLIENT_URL}/`);
  await expect(async () => {
    await page.getByLabel(/name/i).fill(displayName);
    await page.getByRole('button', { name: role, exact: true }).click();
    const firstCell = page.getByLabel('Join code character 1');
    await firstCell.click();
    await firstCell.pressSequentially(joinCode, { delay: 30 });
    // In the lobby when the roster testid renders (we're no longer on Landing).
    await expect(page.getByTestId('roster')).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
}

export interface BotSwarmHandle {
  stop: () => void;
}

/**
 * Fill player seats with TD-5 bots (join mode: they join + ready and self-solve
 * whenever one of them is the current Defuser; the humans keep the Facilitator
 * and any browser-player seats). Waits until the facilitator page's roster
 * shows every expected participant.
 */
export async function spawnBots(
  facilitatorPage: Page,
  args: { joinCode: string; teams?: number; perTeam?: number; sizes?: string; outcome?: string },
  expectedRosterCount: number,
): Promise<BotSwarmHandle> {
  const cli = [
    '--filter',
    '@bomb-squad/sim-clients',
    'sim',
    '--url',
    GAME_SERVER_URL,
    '--code',
    args.joinCode,
  ];
  if (args.sizes !== undefined) cli.push('--sizes', args.sizes);
  else cli.push('--teams', String(args.teams ?? 2), '--per-team', String(args.perTeam ?? 2));
  if (args.outcome !== undefined) cli.push('--outcome', args.outcome);

  // detached → own process group, so stop() can kill the WHOLE pnpm→tsx→node
  // chain. Signalling only the pnpm wrapper LEAKS the node bots (observed:
  // dozens of zombie swarms reconnect-storming the e2e port across runs —
  // the source of the suite's only flake).
  const child: ChildProcess = spawn('pnpm', cli, {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  child.stdout?.on('data', (d: Buffer) => {
    process.stderr.write(`[sim] ${d}`);
  });
  child.stderr?.on('data', (d: Buffer) => {
    // Surface bot-side errors into the test log; a typed server ERROR is
    // information, not a crash (TD-5 contract).
    process.stderr.write(`[sim] ${d}`);
  });

  const stop = (): void => {
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, 'SIGTERM'); // the whole process group
      } catch {
        child.kill('SIGTERM');
      }
    }
  };

  // Kill the detached group if the readiness wait throws. Otherwise a timeout
  // here strands the bots: the caller's `const bots = await spawnBots(...)`
  // never binds, so its `finally { bots.stop() }` can't run, and the leaked
  // group reconnect-storms the fixed e2e port — the exact zombie-storm the
  // detached-group teardown exists to prevent (and with `retries: 1` the retry
  // would then run against the poisoned port).
  try {
    await expect(facilitatorPage.getByTestId('roster').locator('li')).toHaveCount(
      expectedRosterCount,
      { timeout: 30_000 },
    );
  } catch (err) {
    stop();
    throw err;
  }
  return { stop };
}

/** Facilitator: assign a rostered player (by display name) to a team chip. */
export async function assignTeam(page: Page, displayName: string, teamId: 'A' | 'B'): Promise<void> {
  const row = page.getByTestId('roster').locator('li').filter({ hasText: displayName });
  const chip = row.getByRole('button', { name: teamId, exact: true });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
}

/** Facilitator: set a rostered player's role via the row's role select. */
export async function setRole(
  page: Page,
  displayName: string,
  role: 'defuser' | 'expert' | 'spectator',
): Promise<void> {
  const select = page.getByLabel(`Role for ${displayName}`);
  await select.selectOption(role);
  await expect(select).toHaveValue(role);
}

/**
 * Facilitator: restrict the round's module pool to Wires only (fast, and the
 * full-session Defuser flow is a wires canvas solve). Chips are server-truth
 * driven, so assert each deselection round-trips.
 */
export async function configureWiresOnly(page: Page): Promise<void> {
  // Scope to the Module pool group and deselect EVERY enabled chip except Wires,
  // whatever the tier's catalog holds. Hardcoding the non-wires labels silently
  // fails the moment the difficulty is anything but easy — a medium/hard pool
  // leaves other modules armed and the wires-only browser Defuser can never
  // resolve the round.
  const pool = page.getByRole('group', { name: 'Module pool' });
  // Pin Wires ON first so deselecting the rest can never empty the pool
  // (generation needs ≥1 module; the panel refuses to drop the last one).
  const wires = pool.getByRole('button', { name: 'Wires', exact: true });
  await expect(async () => {
    if ((await wires.getAttribute('aria-pressed')) !== 'true') await wires.click();
    await expect(wires).toHaveAttribute('aria-pressed', 'true', { timeout: 3_000 });
  }).toPass({ timeout: 15_000 });

  const chips = pool.getByRole('button');
  const count = await chips.count();
  for (let i = 0; i < count; i++) {
    const chip = chips.nth(i);
    if ((await chip.textContent())?.trim() === 'Wires') continue;
    if (await chip.isDisabled()) continue; // non-generatable → never in the pool
    await expect(async () => {
      if ((await chip.getAttribute('aria-pressed')) === 'true') await chip.click();
      await expect(chip).toHaveAttribute('aria-pressed', 'false', { timeout: 3_000 });
    }).toPass({ timeout: 15_000 });
  }
}

export const openPreparation = (page: Page) => confirmTwoStep(page, 'Open preparation');
export const startTheRound = (page: Page) => confirmTwoStep(page, 'Start the round');
export const startNextRound = (page: Page) => confirmTwoStep(page, 'Start next round');
export const endSession = (page: Page) => confirmTwoStep(page, /End session/);

/** The between-rounds scoreboard surface is showing. */
export async function expectBetweenRounds(page: Page): Promise<void> {
  await expect(page.getByTestId('scoreboard-teams')).toBeVisible({ timeout: 60_000 });
}
