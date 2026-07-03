/**
 * Story 9.2 — Spectator Lifeline Token Economy, full end-to-end verification
 * across a real browser ↔ the real in-process server. Automates the human-
 * verification checklist:
 *
 *  1. modifier ON → a genuine Spectator earns +1 token per COMPLETED round they
 *     watch, delivered by the real server grant + LIFELINE_TOKENS socket event
 *     and rendered as the passive counter (0 → 1 → 2 → 3). (AC-1, AC-4)
 *  2. the count CAPS at 3 — a 4th completed round leaves the counter at 3. (AC-1)
 *  3. a Spectator who RELOADS mid-round re-hydrates the counter from Redis. (AC-4)
 *  4. the Facilitator never sees the counter. (AC-3/AC-4 — own count only)
 *  5. modifier OFF → no counter renders at all. (AC-2)
 *
 * TOPOLOGY (deterministic, no bots — no TD-5 swarm to leak): a SINGLE team A
 * whose relayOrder is a line of browser Defusers (D1…D5). With team B absent,
 * `selectActiveTeam` picks A every round until its rotation exhausts, so round N's
 * active Defuser is exactly `defusers[N-1]` — solved on command via the real
 * BombScene canvas. Sam is a genuine Spectator (no team) who watches EVERY round,
 * so he is the sole earner (team-A members are on the active team → never earn).
 * The counter lives on the ActiveRound spectator surface, so it is read while a
 * round is live (between rounds Sam sees the scoreboard).
 */
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  assignTeam,
  configureWiresOnly,
  expectBetweenRounds,
  hostSession,
  joinSession,
  openPreparation,
  startNextRound,
  startTheRound,
} from '../helpers/session.js';
import { solveWiresBombInBrowser } from '../helpers/bombSolve.js';

const COUNTER = 'lifeline-token-counter';
const tokensLabel = (n: number): string => `Lifeline tokens: ${n}`;

interface Session {
  facilitator: Page;
  sam: Page;
  defusers: Page[];
  cleanup: () => Promise<void>;
}

/**
 * Host a single-team-A session: `defuserCount` browser Defusers in relayOrder
 * (round N's Defuser = defusers[N-1]) plus Sam the Spectator, wires-only pool,
 * modifier per `opts`. Round is NOT started (the caller drives rounds).
 */
async function hostLifelineSession(
  facilitator: Page,
  browser: Browser,
  opts: { defuserCount: number; modifier: boolean },
): Promise<Session> {
  const joinCode = await hostSession(facilitator);
  const contexts: BrowserContext[] = [];
  const newPlayer = async (): Promise<Page> => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
    contexts.push(ctx);
    return ctx.newPage();
  };

  // Defusers first (join order = relayOrder = defuse rotation), then Sam.
  const defusers: Page[] = [];
  const names: string[] = [];
  for (let i = 0; i < opts.defuserCount; i++) {
    const name = `Def${i + 1}`;
    const p = await newPlayer();
    await joinSession(p, joinCode, name, 'Defuser');
    defusers.push(p);
    names.push(name);
  }
  const sam = await newPlayer();
  await joinSession(sam, joinCode, 'Sam', 'Spectator');

  // Assign every Defuser to team A in order (SEQUENTIAL — TD-5 load-modify-store).
  for (const name of names) await assignTeam(facilitator, name, 'A');

  if (opts.modifier) {
    const toggle = facilitator.getByRole('switch', { name: 'Spectator lifelines' });
    await expect(async () => {
      if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 3_000 });
    }).toPass({ timeout: 15_000 });
  }

  await configureWiresOnly(facilitator);

  return {
    facilitator,
    sam,
    defusers,
    cleanup: () => Promise.all(contexts.map((c) => c.close())).then(() => undefined),
  };
}

/** Sam's live counter must read exactly N tokens (polls until the render lands). */
async function expectSamTokens(sam: Page, n: number): Promise<void> {
  await expect(sam.getByTestId(COUNTER)).toHaveText(tokensLabel(n), { timeout: 30_000 });
}

test('modifier ON: a spectator earns 1 token per watched round, caps at 3, and re-hydrates on reload', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  // Five Defusers ⇒ five consecutive team-A rounds. Sam earns on each COMPLETED
  // round; after four completions the 4th grant clamps, so round 5 still shows 3.
  const { facilitator, sam, defusers, cleanup } = await hostLifelineSession(page, browser, {
    defuserCount: 5,
    modifier: true,
  });
  try {
    // ── Round 1: no round completed yet → 0.
    await openPreparation(facilitator);
    await startTheRound(facilitator);
    await expectSamTokens(sam, 0);
    // The Facilitator never sees a counter (own-count-only delivery).
    await expect(facilitator.getByTestId(COUNTER)).toHaveCount(0);
    await solveWiresBombInBrowser(defusers[0]!);
    await expectBetweenRounds(facilitator);

    // ── Round 2: earned 1 from watching round 1.
    await startNextRound(facilitator);
    await startTheRound(facilitator);
    await expectSamTokens(sam, 1);

    // Reload mid-round → reconnect re-delivers the persisted count (AC-4).
    await sam.reload();
    await expectSamTokens(sam, 1);
    await solveWiresBombInBrowser(defusers[1]!);
    await expectBetweenRounds(facilitator);

    // ── Round 3: 2.
    await startNextRound(facilitator);
    await startTheRound(facilitator);
    await expectSamTokens(sam, 2);
    await solveWiresBombInBrowser(defusers[2]!);
    await expectBetweenRounds(facilitator);

    // ── Round 4: 3.
    await startNextRound(facilitator);
    await startTheRound(facilitator);
    await expectSamTokens(sam, 3);
    await solveWiresBombInBrowser(defusers[3]!);
    await expectBetweenRounds(facilitator);

    // ── Round 5: the 4th completed round's grant clamped 3→3 — cap holds.
    await startNextRound(facilitator);
    await startTheRound(facilitator);
    await expectSamTokens(sam, 3);
  } finally {
    await cleanup();
  }
});

test('modifier OFF: no lifeline counter renders for the spectator (AC-2)', async ({ page, browser }) => {
  test.setTimeout(120_000);
  // Team A needs ≥ MIN_TEAM_SIZE (2) players to open preparation — two Defusers.
  const { facilitator, sam, cleanup } = await hostLifelineSession(page, browser, {
    defuserCount: 2,
    modifier: false,
  });
  try {
    await openPreparation(facilitator);
    await startTheRound(facilitator);
    // Sam is watching the live round (spectator surface is up)…
    await expect(sam.getByText(/watching the bomb room/i)).toBeVisible({ timeout: 30_000 });
    // …but the modifier is off, so the counter never renders for any role.
    await expect(sam.getByTestId(COUNTER)).toHaveCount(0);
    await expect(facilitator.getByTestId(COUNTER)).toHaveCount(0);
  } finally {
    await cleanup();
  }
});
