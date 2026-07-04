/**
 * Story 9.5 (AC-6) — the 2-player, two-tab smoke: a Facilitator opts ONTO a team
 * and plays, keeping session authority, with NO separate hosting tab.
 *
 * Tab 1 (Facilitator) hosts, assigns THEMSELVES to Team A as an Expert and the
 * one browser player "Ada" as the Defuser, configures + starts. Round 1: Ada
 * (relayOrder[0]) defuses while the Facilitator plays the Expert manual and the
 * confirm-guarded break-glass Pause is exercised (arm→confirm pause → resume).
 * Round 2: rotation makes the FACILITATOR the Defuser (relayOrder[1]); they solve
 * the bomb through real canvas clicks — proving `ROUND_START` and the play surface
 * work while the authority-holder is teamed. Finally SESSION_END succeeds from the
 * teamed Facilitator and the single-team scoreboard records both rounds.
 *
 * Two browser CONTEXTS only (identity is per-context sessionStorage — never
 * shared): the Facilitator page + one player context. No bots: Team A = {Ada,
 * Facilitator} meets MIN_TEAM_SIZE (a single-team session is allowed, 90631b2).
 */
import { test, expect } from '@playwright/test';
import {
  assignTeam,
  configureWiresOnly,
  endSession,
  expectBetweenRounds,
  hostSession,
  joinSession,
  openPreparation,
  setRole,
  startNextRound,
  startTheRound,
} from '../helpers/session.js';
import { solveWiresBombInBrowser } from '../helpers/bombSolve.js';

/** The Facilitator's own roster row (display name 'Facilitator'). */
const FACILITATOR = 'Facilitator';

test('a Facilitator opts onto a team, plays both roles across the rotation, and keeps session authority', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const joinCode = await hostSession(page);

  // Second context = the one human player. Ada joins as the Defuser.
  const adaContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    reducedMotion: 'reduce',
  });
  const adaPage = await adaContext.newPage();
  await joinSession(adaPage, joinCode, 'Ada', 'Defuser');

  try {
    // Team A relayOrder = [Ada, Facilitator]: Ada assigned FIRST → round-1 Defuser;
    // the Facilitator second → round-2 Defuser when the rotation comes round.
    await assignTeam(page, 'Ada', 'A');
    // The Facilitator opts THEMSELVES onto Team A (the self-row chip; role defaults
    // to defuser), then takes the Expert seat for round 1.
    await assignTeam(page, FACILITATOR, 'A');
    await setRole(page, FACILITATOR, 'expert');

    await configureWiresOnly(page);
    await openPreparation(page);
    await startTheRound(page);

    // ── Round 1: the Facilitator plays the Expert manual (AC-3 compact surface). ──
    // The in-round Expert manual is the real Defusal Handbook (the operator prep
    // view has no chapter nav), so its presence proves the round is active AND the
    // teamed Facilitator routed to their play surface.
    await expect(page.locator('nav[aria-label="Manual chapters"]')).toBeVisible({ timeout: 30_000 });

    // AC-3 confirm-guarded break-glass Pause: a single click ARMS (no pause), the
    // second CONFIRMS. Then Resume (a facilitator hold resumes on a free click).
    const pauseBtn = page.getByTestId('facilitator-pause');
    await pauseBtn.click(); // arm
    await expect(pauseBtn).toHaveText(/confirm pause/i);
    await pauseBtn.click(); // confirm → the round freezes
    await expect(page.getByTestId('pause-strip')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('pause-resume').click();
    await expect(page.getByTestId('pause-strip')).toBeHidden({ timeout: 10_000 });

    // Ada solves round 1 through the real canvas.
    await solveWiresBombInBrowser(adaPage);

    // Between rounds: the FULL dashboard is back for the (teamed) Facilitator — the
    // re-keyed Scoreboard controls render, so "Start next round" is clickable.
    await expectBetweenRounds(page);
    await expect(page.getByTestId('scoreboard-team-A')).toContainText('Round 1');

    // ── Round 2: rotation makes the FACILITATOR the Defuser — they solve the bomb. ──
    // `solveWiresBombInBrowser` waits for THIS page's game state to be active with a
    // live bomb (via __E2E_STATE__), so it proves the Facilitator got the bomb
    // surface and that ROUND_START succeeded while the authority-holder is teamed.
    await startNextRound(page);
    await startTheRound(page);
    await solveWiresBombInBrowser(page);

    // Between rounds again: both single-team rounds recorded.
    await expectBetweenRounds(page);
    await expect(page.getByTestId('scoreboard-team-A')).toContainText('Round 2');

    // SESSION_END succeeds from the teamed Facilitator (authority is the flag).
    await endSession(page);
    await expect(page.getByTestId('final-teams')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('final-team-A')).toBeVisible();
  } finally {
    await adaContext.close();
  }
});
