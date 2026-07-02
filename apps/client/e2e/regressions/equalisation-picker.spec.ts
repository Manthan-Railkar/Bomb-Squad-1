/**
 * Sprint-5 defect shape (b) — undriveable UI states. The 8-9 verification run
 * found odd-team equalisation had NO volunteer-picker UI: the server state was
 * reachable but the Facilitator could not drive it. This spec runs a real 3v2
 * relay until the equalisation round comes up, then drives the picker end to
 * end: volunteer chosen → advance un-gates → Preparation arms the volunteer.
 */
import { test, expect } from '@playwright/test';
import {
  assignTeam,
  configureWiresOnly,
  expectBetweenRounds,
  hostSession,
  openPreparation,
  spawnBots,
  startNextRound,
  startTheRound,
} from '../helpers/session.js';

test('odd-team equalisation: volunteer picker is reachable and driveable', async ({ page }) => {
  test.setTimeout(300_000);
  const joinCode = await hostSession(page);
  const bots = await spawnBots(page, { joinCode, sizes: '3,2' }, 6);
  try {
    for (const name of ['Bot-A1', 'Bot-A2', 'Bot-A3']) await assignTeam(page, name, 'A');
    for (const name of ['Bot-B1', 'Bot-B2']) await assignTeam(page, name, 'B');
    await configureWiresOnly(page);

    // Play natural rounds (bots self-solve) until the up-next team owes its
    // equalisation round — the snake interleaves, so poll each between-rounds.
    await openPreparation(page);
    await startTheRound(page);
    let sawPicker = false;
    for (let round = 0; round < 8; round++) {
      await expectBetweenRounds(page);
      if (await page.getByTestId('equalisation-B').isVisible()) {
        sawPicker = true;
        break;
      }
      expect(
        await page.getByTestId('relay-complete').isVisible(),
        'relay completed without ever offering the equalisation round',
      ).toBe(false);
      await startNextRound(page);
      await expect(page.getByRole('button', { name: 'Start the round' })).toBeVisible();
      await startTheRound(page);
    }
    expect(sawPicker, 'equalisation picker never appeared').toBe(true);

    // The pre-fix defect: this state existed server-side with no UI to drive it.
    const picker = page.getByTestId('equalisation-B');
    const advance = picker.getByRole('button', { name: 'Start next round' });
    await expect(advance).toBeDisabled(); // gated until a volunteer is chosen
    await picker.getByRole('button', { name: 'Bot-B1', exact: true }).click();
    await expect(advance).toBeEnabled({ timeout: 15_000 });
    await startNextRound(page);

    // Preparation arms the chosen volunteer as Team B's upcoming Defuser.
    const upcoming = page.getByTestId('upcoming-defusers');
    await expect(upcoming).toBeVisible();
    await expect(upcoming).toContainText('Bot-B1');
  } finally {
    bots.stop();
  }
});
