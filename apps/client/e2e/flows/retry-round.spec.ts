/**
 * Task 6 — the 8-8 regression class, UI-observable end to end: a failed round's
 * Retry must re-arm the EXACT Defuser who failed (retryDefuserId), not the
 * rotation's next pick (the Model-B pointer has already advanced past them).
 * A browser Defuser detonates deliberately (3 wrong canvas cuts), the
 * Facilitator retries through the real UI, and Preparation must arm the SAME
 * player — then the retry round is solved and scored (better-of-two).
 */
import { test, expect } from '@playwright/test';
import {
  assignTeam,
  configureWiresOnly,
  confirmTwoStep,
  expectBetweenRounds,
  hostSession,
  joinSession,
  openPreparation,
  setRole,
  spawnBots,
  startTheRound,
} from '../helpers/session.js';
import { solveWiresBombInBrowser, strikeOutWiresBomb } from '../helpers/bombSolve.js';

test('retry after detonation re-arms the same Defuser and scores the better round', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const joinCode = await hostSession(page);

  const defuserContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    reducedMotion: 'reduce',
  });
  const defuserPage = await defuserContext.newPage();
  await joinSession(defuserPage, joinCode, 'Ada', 'Defuser');

  const bots = await spawnBots(page, { joinCode, teams: 1, perTeam: 3 }, 5);
  try {
    await assignTeam(page, 'Ada', 'A');
    await assignTeam(page, 'Bot-A1', 'A');
    await setRole(page, 'Bot-A1', 'expert');
    await assignTeam(page, 'Bot-A2', 'B');
    await assignTeam(page, 'Bot-A3', 'B');
    await setRole(page, 'Bot-A3', 'expert');
    await configureWiresOnly(page);

    // Round 1: Ada detonates (3 wrong cuts through the real canvas).
    await openPreparation(page);
    await startTheRound(page);
    await strikeOutWiresBomb(defuserPage);
    await expectBetweenRounds(page);

    // The failed team gets the confirm-gated Retry; drive it.
    await confirmTwoStep(page, 'Retry round');

    // THE 8-8 ASSERTION: Preparation re-arms Ada — the player who failed —
    // not the rotation's next pick.
    const upcoming = page.getByTestId('upcoming-defusers');
    await expect(upcoming).toBeVisible();
    await expect(upcoming).toContainText('Ada');

    // The retry round (identical bomb) is solved this time and scored.
    await startTheRound(page);
    await solveWiresBombInBrowser(defuserPage);
    await expectBetweenRounds(page);
    await expect(page.getByTestId('scoreboard-team-A')).toContainText('Round 1');
  } finally {
    bots.stop();
    await defuserContext.close();
  }
});
