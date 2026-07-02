/**
 * Task 6 backfill — Who's on First on /dev/sandbox: the two-step lookup
 * (display → position → label priority) is recomputed from PUBLIC state via
 * the shared `solutionIndex`; a wrong press strikes and recovers, the correct
 * single press disarms (6.2's epic AC: one press, not multi-stage).
 */
import { test, expect } from '@playwright/test';
import { solutionIndex, type WhosOnFirstState } from '@bomb-squad/shared';
import { clickMesh, waitForMesh } from '../helpers/canvas.js';
import { generateSandboxModule, inspectorRow } from '../helpers/sandbox.js';

test('whos-on-first: wrong press strikes and recovers; the looked-up press solves', async ({
  page,
}) => {
  const data = await generateSandboxModule<WhosOnFirstState>(page, 'whos-on-first', '7');
  await waitForMesh(page, 'm0-wof-button-0');

  const correct = solutionIndex(data as never);
  const wrong = (correct + 1) % 6;

  // Wrong press → strike, module recovers (transient 'struck' re-arms).
  await clickMesh(page, `m0-wof-button-${wrong}`);
  await expect(inspectorRow(page, 'strikes')).toHaveText('1');
  await expect(inspectorRow(page, 'status')).toHaveText('armed');

  // The two-step lookup's press disarms in one press.
  await clickMesh(page, `m0-wof-button-${correct}`);
  await expect(inspectorRow(page, 'status')).toHaveText('solved');
  await expect(inspectorRow(page, 'bomb.solved')).toHaveText('true');
});
