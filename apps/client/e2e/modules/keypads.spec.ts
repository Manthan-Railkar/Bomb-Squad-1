/**
 * Task 6 backfill — Keypads on /dev/sandbox: real R3F grid, real canvas
 * clicks. The press order is derived from the PUBLIC keys via the shared
 * `solutionOrder` (column lookup) — never a baked answer. Covers the retro's
 * solve-and-strike shape: a wrong press strikes (progress retained), the
 * correct column order solves.
 */
import { test, expect } from '@playwright/test';
import { solutionOrder, type KeypadsState } from '@bomb-squad/shared';
import { clickMesh, waitForBomb, waitForMesh } from '../helpers/canvas.js';
import { generateSandboxModule, inspectorRow } from '../helpers/sandbox.js';

test('keypads: wrong press strikes; pressing the column order solves', async ({ page }) => {
  const data = await generateSandboxModule<KeypadsState>(page, 'keypads', '7');
  await waitForMesh(page, 'm0-key-0');

  const order = solutionOrder(data.keys as never);
  expect(order).toHaveLength(4);

  // Wrong press: the LAST key of the solution order, pressed first.
  await clickMesh(page, `m0-key-${order[3]}`);
  await expect(inspectorRow(page, 'strikes')).toHaveText('1');

  // Correct order → solved; progress (pressed) accumulates per correct press.
  for (let step = 0; step < order.length; step++) {
    await clickMesh(page, `m0-key-${order[step]}`);
    await waitForBomb(page, (b) => {
      const d = b.modules[0]!.data as KeypadsState;
      return d.pressed.length >= step + 1;
    });
  }
  await expect(inspectorRow(page, 'status')).toHaveText('solved');
  await expect(inspectorRow(page, 'bomb.solved')).toHaveText('true');
});
