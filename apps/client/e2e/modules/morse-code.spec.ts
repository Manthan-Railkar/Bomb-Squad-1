/**
 * TD-7 — Morse Code on /dev/sandbox (the LAST Hard module). The lamp flashes a
 * WORD; the transmitted `word` is PUBLIC state (the physical observable the
 * Defuser watches), and the target dial index is recomputed from it via the
 * shared `correctFreqIndex(word)` — never a baked answer (the module stores
 * none). This spec dials to the answer and TXes to disarm, and covers the
 * wrong-TX strike: transmitting on the wrong frequency strikes and LEAVES THE
 * DIAL IN PLACE (Morse has no progress to reset — contrast Memory).
 *
 * All waits are deterministic conditions on the public snapshot (freqIndex /
 * strikes / status); the flash animation is irrelevant because `word` is already
 * in state — no pixel-watching, no `waitForTimeout` (AC3).
 */
import { test, expect } from '@playwright/test';
import { correctFreqIndex, type MorseCodeState } from '@bomb-squad/shared';
import { clickMesh, readBomb, waitForBomb, waitForMesh } from '../helpers/canvas.js';
import { generateSandboxModule, inspectorRow } from '../helpers/sandbox.js';

/** Step the dial to `target`, one click at a time, waiting for each move to land. */
async function dialTo(page: import('@playwright/test').Page, target: number) {
  for (let guard = 0; guard < 20; guard++) {
    const cur = ((await readBomb(page)).modules[0]!.data as MorseCodeState).freqIndex;
    if (cur === target) return;
    const step = target > cur ? 1 : -1;
    await clickMesh(page, `m0-morse-${step === 1 ? 'up' : 'down'}`);
    // Wait for the EXACT next index — any-change would let a double-fired click
    // overshoot and turn into a misleading guard exhaustion.
    await waitForBomb(page, (b) => (b.modules[0]!.data as MorseCodeState).freqIndex === cur + step);
  }
  throw new Error(`dial never reached index ${target}`);
}

test('morse-code: a wrong TX strikes with the dial preserved; dialling the word frequency solves', async ({
  page,
}) => {
  const data = await generateSandboxModule<MorseCodeState>(page, 'morse-code', '7');
  await waitForMesh(page, 'm0-morse-tx');

  const target = correctFreqIndex(data.word);
  expect(target, 'the word must map to a dial index').toBeGreaterThanOrEqual(0);
  // Generation avoids born-solved, so the dial does not start on the answer —
  // an immediate TX is therefore a genuine WRONG transmission.
  expect(data.freqIndex, 'a fresh instance is not born on the answer').not.toBe(target);

  // Wrong TX → strike, and the dial is LEFT EXACTLY WHERE IT WAS (no reset).
  const dialBefore = data.freqIndex;
  await clickMesh(page, 'm0-morse-tx');
  await expect(inspectorRow(page, 'strikes')).toHaveText('1');
  const struck = await waitForBomb(page, (b) => b.strikes === 1);
  expect(
    (struck.modules[0]!.data as MorseCodeState).freqIndex,
    'a wrong TX must preserve the dial position',
  ).toBe(dialBefore);

  // Solve: dial to the word's frequency, then transmit.
  await dialTo(page, target);
  await clickMesh(page, 'm0-morse-tx');
  await expect(inspectorRow(page, 'status')).toHaveText('solved');
  await expect(inspectorRow(page, 'bomb.solved')).toHaveText('true');
});
