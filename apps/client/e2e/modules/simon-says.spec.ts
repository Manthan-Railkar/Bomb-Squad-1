/**
 * TD-7 — Simon Says on /dev/sandbox (Hard tier, the LIVE-STRIKE module). The
 * growing flash sequence is PUBLIC state (`data.sequence` — the raw flashes the
 * Defuser watches anyway); the colour to PRESS is recomputed from it via the
 * shared `simonTranslate(flash, ctx, strikes)`, never a baked answer. The
 * translation row is selected by the serial's vowel AND the LIVE team strike
 * count ([[module-live-bomb-state-seam]]) — so a strike SHIFTS the correct
 * answer mid-round. This spec proves all three surfaces: the sequence grows, a
 * wrong press restarts the current stage from the first flash, and the post-
 * strike solve uses the shifted (strikes=1) table row.
 *
 * All waits are deterministic conditions on the public module snapshot
 * (progress / stage / status) — no pixel-watching, no `waitForTimeout` (AC3):
 * the flash animation is irrelevant because `sequence` is already in state.
 */
import { test, expect } from '@playwright/test';
import {
  simonTranslate,
  SIMON_COLORS,
  type SimonColor,
  type SimonStrikeRow,
  type SimonSaysState,
} from '@bomb-squad/shared';
import { clickMesh, readBomb, waitForBomb, waitForMesh } from '../helpers/canvas.js';
import { generateSandboxModule, inspectorRow } from '../helpers/sandbox.js';

/** The correct press for the flash currently pointed at, at `strikes`. */
function expectedPress(data: SimonSaysState, progress: number, strikes: SimonStrikeRow): SimonColor {
  return simonTranslate(data.sequence[progress]!, data.ctx, strikes);
}

/** Press the correct colour for the live progress pointer; wait for the state to move. */
async function pressCorrect(page: import('@playwright/test').Page, data: SimonSaysState) {
  const before = await readBomb(page);
  const d = before.modules[0]!.data as SimonSaysState;
  const strikes = Math.min(2, before.strikes) as SimonStrikeRow;
  const color = expectedPress(data, d.progress, strikes);
  const { stage, progress } = d;
  await clickMesh(page, `m0-simon-${color}`);
  return waitForBomb(page, (b) => {
    const nd = b.modules[0]!.data as SimonSaysState;
    return b.modules[0]!.status === 'solved' || nd.progress !== progress || nd.stage !== stage;
  });
}

test('simon-says: sequence grows; a wrong press restarts the stage and shifts the table; solving disarms', async ({
  page,
}) => {
  const data = await generateSandboxModule<SimonSaysState>(page, 'simon-says', '7');
  await waitForMesh(page, 'm0-simon-red');
  expect(data.stage, 'a fresh instance reveals stage 1').toBe(1);

  // Grow the sequence: solve stage 1 correctly (strikes 0) → reveal grows to 2.
  await pressCorrect(page, data);
  const grown = await waitForBomb(page, (b) => (b.modules[0]!.data as SimonSaysState).stage === 2);
  expect((grown.modules[0]!.data as SimonSaysState).progress).toBe(0);

  // Advance one correct press WITHIN stage 2 (strikes still 0) → progress 1.
  await pressCorrect(page, data);
  const mid = await waitForBomb(page, (b) => (b.modules[0]!.data as SimonSaysState).progress === 1);
  expect((mid.modules[0]!.data as SimonSaysState).stage).toBe(2);

  // Wrong press: the correct colour for THIS flash at strikes 0, deliberately
  // avoided. Strikes → 1, the stage input restarts from the first flash
  // (progress 0), and the revealed stage is unchanged.
  const correctAtZero = expectedPress(data, 1, 0);
  const wrong = SIMON_COLORS.find((c) => c !== correctAtZero)!;
  await clickMesh(page, `m0-simon-${wrong}`);
  await expect(inspectorRow(page, 'strikes')).toHaveText('1');
  const struck = await waitForBomb(page, (b) => b.strikes === 1);
  const sd = struck.modules[0]!.data as SimonSaysState;
  expect(sd.progress, 'a wrong press restarts the stage from the first flash').toBe(0);
  expect(sd.stage, 'the revealed stage is unchanged by a strike').toBe(2);

  // Sanity-check that this seed still exercises the shift: rows 0 and 1 of the
  // shared table map this first flash to different presses. This is a Node-side
  // table property, NOT proof of the live seam — the seam is exercised by the
  // solve loop below, which derives every press from the LIVE strike count and
  // fails if the reducer ignores the shifted row.
  expect(expectedPress(data, 0, 1)).not.toBe(expectedPress(data, 0, 0));

  // Solve the rest honestly using the LIVE strike count (now 1) each press,
  // driven by the module's own progress/stage until it disarms.
  for (let guard = 0; guard < 40; guard++) {
    const bomb = await readBomb(page);
    if (bomb.modules[0]!.status === 'solved') break;
    await pressCorrect(page, data);
  }
  // Assert the loop's exit reason and pin the final count: a press the reducer
  // scored wrong would strike, restart the stage, and be silently absorbed by
  // the guard — the strike total is the only tell.
  const final = await readBomb(page);
  expect(final.modules[0]!.status, 'guard exhausted before the module solved').toBe('solved');
  expect(final.strikes, 'the post-strike solve must not add strikes').toBe(1);
  await expect(inspectorRow(page, 'status')).toHaveText('solved');
  await expect(inspectorRow(page, 'bomb.solved')).toHaveText('true');
});
