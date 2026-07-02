/**
 * Sprint-5 defect shape (a) — swallowed error codes → dead buttons. The 8-9
 * verification run found RELAY_COMPLETE was swallowed: at relay completion the
 * Facilitator faced a "Start" button that silently did nothing. The fixed UI
 * derives relay completion from the SAME shared predicate the server gates on
 * and swaps the dead path for the relay-complete notice + "End session".
 *
 * This spec drives a real single-team relay to completion (bots defuse) and
 * fails if the Facilitator is ever left with the dead-button state.
 */
import { test, expect } from '@playwright/test';
import {
  assignTeam,
  configureWiresOnly,
  endSession,
  expectBetweenRounds,
  hostSession,
  openPreparation,
  setRole,
  spawnBots,
  startNextRound,
  startTheRound,
} from '../helpers/session.js';

test('relay completion surfaces the notice + End session — never a dead Start button', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const joinCode = await hostSession(page);
  const bots = await spawnBots(page, { joinCode, teams: 1, perTeam: 2 }, 3);
  try {
    await assignTeam(page, 'Bot-A1', 'A');
    await assignTeam(page, 'Bot-A2', 'A');
    await setRole(page, 'Bot-A2', 'expert');
    await configureWiresOnly(page);

    // Round 1 (Bot-A1 defuses) …
    await openPreparation(page);
    await startTheRound(page);
    await expectBetweenRounds(page);
    await expect(page.getByTestId('relay-complete')).toHaveCount(0);

    // … round 2 (rotation → Bot-A2 defuses; roles are participant-only) …
    await startNextRound(page);
    await startTheRound(page);
    await expectBetweenRounds(page);

    // … relay complete: the notice + End session, and NO Start-next-round
    // (the pre-fix dead button). A swallowed RELAY_COMPLETE fails here.
    await expect(page.getByTestId('relay-complete')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start next round' })).toHaveCount(0);

    // End session actually works (no silent rejection): the final scoreboard.
    await endSession(page);
    await expect(page.getByRole('heading', { name: 'Final scoreboard' })).toBeVisible();
    await expect(page.getByTestId('final-headline')).toBeVisible();
  } finally {
    bots.stop();
  }
});
