/**
 * AC #5 — the full multiplayer relay round crossing real browser ↔ real server:
 * a Facilitator page creates + configures + starts the round through the real
 * UI, TD-5 bots fill the remaining seats, and a SECOND browser context joins as
 * the round-1 Defuser and solves the bomb through real canvas clicks (bay
 * focus → projected wire cut, honest shared-solve). Resolution and the
 * between-rounds scoreboard are asserted through the UI on both pages.
 */
import { test, expect } from '@playwright/test';
import {
  assignTeam,
  configureWiresOnly,
  expectBetweenRounds,
  hostSession,
  joinSession,
  openPreparation,
  setRole,
  spawnBots,
  startTheRound,
} from '../helpers/session.js';
import { solveWiresBombInBrowser } from '../helpers/bombSolve.js';

test('a browser Defuser solves a real round end-to-end; the scoreboard reflects it', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const joinCode = await hostSession(page);

  // Second browser context = a separate player (identity is per-context
  // sessionStorage — never share a context between two "players").
  const defuserContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    reducedMotion: 'reduce',
  });
  const defuserPage = await defuserContext.newPage();
  await joinSession(defuserPage, joinCode, 'Ada', 'Defuser');

  const bots = await spawnBots(page, { joinCode, teams: 1, perTeam: 3 }, 5);
  try {
    // Ada is assigned to Team A FIRST → relayOrder[0] → round-1 Defuser.
    await assignTeam(page, 'Ada', 'A');
    await assignTeam(page, 'Bot-A1', 'A');
    await setRole(page, 'Bot-A1', 'expert');
    await assignTeam(page, 'Bot-A2', 'B');
    await assignTeam(page, 'Bot-A3', 'B');
    await setRole(page, 'Bot-A3', 'expert');

    await configureWiresOnly(page);
    await openPreparation(page);
    await startTheRound(page);

    // The browser Defuser solves every module through the real canvas.
    await solveWiresBombInBrowser(defuserPage);

    // Resolution lands on the Defuser's screen: the 8.5 banner if we catch its
    // 2s hold, else the between-rounds surface it hands off to (the banner's
    // verdict/hold behaviour itself is pinned by TD-1's component tests —
    // asserting only the transient overlay would be a timing lottery).
    await expect(
      defuserPage
        .getByText('DEFUSED.', { exact: true })
        .or(defuserPage.getByText(/waiting for the facilitator/i)),
    ).toBeVisible({ timeout: 20_000 });

    // … and the Facilitator's between-rounds scoreboard records the round.
    await expectBetweenRounds(page);
    await expect(page.getByTestId('scoreboard-team-A')).toContainText('Round 1');
    await expect(page.getByTestId('up-next')).toBeVisible(); // Model B hand-off
  } finally {
    bots.stop();
    await defuserContext.close();
  }
});
