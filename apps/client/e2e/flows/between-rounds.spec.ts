/**
 * Task 6 — the between-round flow + scoreboard (Epic 8's most defect-prone UI):
 * two all-bot teams play back-to-back rounds under Model B; the Facilitator
 * advances through the real controls and the scoreboard/up-next surfaces must
 * track each hand-off.
 */
import { test, expect } from '@playwright/test';
import {
  assignTeam,
  configureWiresOnly,
  expectBetweenRounds,
  hostSession,
  openPreparation,
  setRole,
  spawnBots,
  startNextRound,
  startTheRound,
} from '../helpers/session.js';

test('between-rounds scoreboard tracks both teams across the Model-B hand-off', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const joinCode = await hostSession(page);
  const bots = await spawnBots(page, { joinCode, teams: 2, perTeam: 2 }, 5);
  try {
    await assignTeam(page, 'Bot-A1', 'A');
    await assignTeam(page, 'Bot-A2', 'A');
    await setRole(page, 'Bot-A2', 'expert');
    await assignTeam(page, 'Bot-B1', 'B');
    await assignTeam(page, 'Bot-B2', 'B');
    await setRole(page, 'Bot-B2', 'expert');
    await configureWiresOnly(page);

    // Round 1: Team A plays (bots self-solve).
    await openPreparation(page);
    await startTheRound(page);
    await expectBetweenRounds(page);
    await expect(page.getByTestId('scoreboard-team-A')).toContainText('Round 1');
    await expect(page.getByTestId('up-next')).toContainText('Team B');

    // Hand-off: Team B plays round 2.
    await startNextRound(page);
    await expect(page.getByRole('button', { name: 'Start the round' })).toBeVisible();
    await startTheRound(page);
    await expectBetweenRounds(page);
    await expect(page.getByTestId('scoreboard-team-B')).toContainText('Round 1');
  } finally {
    bots.stop();
  }
});
