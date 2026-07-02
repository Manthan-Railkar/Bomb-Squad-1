/**
 * Sprint-5 defect shape (c) — placeholder leaks. The 8-9 verification run found
 * the resting team rendered a bare "—" in Preparation instead of a label. This
 * spec drives the real two-team prep and fails on any bare "—" in the upcoming-
 * defusers list; the resting team must carry its real "Resting this round"
 * label (Model B: exactly one team plays a round).
 */
import { test, expect } from '@playwright/test';
import {
  assignTeam,
  hostSession,
  openPreparation,
  setRole,
  spawnBots,
} from '../helpers/session.js';

test('preparation labels the resting team — no bare "—" placeholder', async ({ page }) => {
  const joinCode = await hostSession(page);
  const bots = await spawnBots(page, { joinCode, teams: 2, perTeam: 2 }, 5);
  try {
    // Sequential assignment (TD-5's load-modify-store discipline): A first, so
    // round 1's active team is A and Bot-A1 its upcoming Defuser.
    await assignTeam(page, 'Bot-A1', 'A');
    await assignTeam(page, 'Bot-A2', 'A');
    await setRole(page, 'Bot-A2', 'expert');
    await assignTeam(page, 'Bot-B1', 'B');
    await assignTeam(page, 'Bot-B2', 'B');
    await setRole(page, 'Bot-B2', 'expert');

    await openPreparation(page);

    const upcoming = page.getByTestId('upcoming-defusers');
    await expect(upcoming).toBeVisible();
    // The active team's upcoming Defuser is named…
    await expect(upcoming).toContainText('Bot-A1');
    // …the resting team carries its real label…
    await expect(upcoming).toContainText('Resting this round');
    // …and the historical defect — a bare em-dash placeholder — fails the spec.
    await expect(upcoming).not.toContainText('—');
  } finally {
    bots.stop();
  }
});
