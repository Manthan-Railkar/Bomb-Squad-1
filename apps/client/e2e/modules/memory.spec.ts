/**
 * TD-7 — Memory on /dev/sandbox (Hard tier). Five sequential stages; the correct
 * button POSITION each stage is recomputed from PUBLIC state (the current stage's
 * display + labels, the stage number, and the recorded history) via the shared
 * `solveMemory` — never a baked answer (the module stores none). THE CRUX
 * (AC #2): a wrong press does not just fail the stage — it RESETS the whole
 * module to stage 1 and clears the history. This spec walks two stages honestly,
 * proves the wrong-press reset via the authoritative stage indicator, then
 * re-solves all five stages to disarm.
 */
import { test, expect } from '@playwright/test';
import { solveMemory, type MemoryState } from '@bomb-squad/shared';
import { clickMesh, readBomb, waitForBomb, waitForMesh } from '../helpers/canvas.js';
import { generateSandboxModule, inspectorRow } from '../helpers/sandbox.js';

/** The correct position (1..4) for the live stage, from public state. */
function correctPosition(d: MemoryState): number {
  return solveMemory(d.stages[d.stage - 1]!, d.stage, d.history);
}

/** Press the correct button for the live stage; wait until the stage advances or it solves. */
async function pressCorrect(page: import('@playwright/test').Page) {
  const before = await readBomb(page);
  const d = before.modules[0]!.data as MemoryState;
  const beforeStage = d.stage;
  await clickMesh(page, `m0-mem-btn-${correctPosition(d)}`);
  return waitForBomb(page, (b) => {
    const nd = b.modules[0]!.data as MemoryState;
    return b.modules[0]!.status === 'solved' || nd.stage !== beforeStage;
  });
}

test('memory: two stages honestly; a wrong press resets to stage 1; re-solving disarms', async ({
  page,
}) => {
  const data = await generateSandboxModule<MemoryState>(page, 'memory', '7');
  await waitForMesh(page, 'm0-mem-btn-1');
  expect(data.stage, 'a fresh instance starts at stage 1').toBe(1);

  // Walk two stages honestly → reach stage 3 with a 2-press history.
  await pressCorrect(page);
  await waitForBomb(page, (b) => (b.modules[0]!.data as MemoryState).stage === 2);
  await pressCorrect(page);
  const atStage3 = await waitForBomb(page, (b) => (b.modules[0]!.data as MemoryState).stage === 3);
  expect((atStage3.modules[0]!.data as MemoryState).history).toHaveLength(2);

  // Wrong press at stage 3 → strike AND full reset to stage 1, history cleared.
  const live = (await readBomb(page)).modules[0]!.data as MemoryState;
  const correct = correctPosition(live);
  const wrong = [1, 2, 3, 4].find((p) => p !== correct)!;
  await clickMesh(page, `m0-mem-btn-${wrong}`);
  await expect(inspectorRow(page, 'strikes')).toHaveText('1');
  const reset = await waitForBomb(page, (b) => b.strikes === 1);
  const rd = reset.modules[0]!.data as MemoryState;
  expect(rd.stage, 'a wrong press resets the module to stage 1').toBe(1);
  expect(rd.history, 'a wrong press clears the press history').toHaveLength(0);

  // Re-solve from stage 1 through 5 — driven by the module's own stage/history,
  // re-derived each press (the reset wiped the history we had built). A clean
  // re-solve is exactly 5 presses; the guard only absorbs wait retries.
  for (let guard = 0; guard < 10; guard++) {
    const bomb = await readBomb(page);
    if (bomb.modules[0]!.status === 'solved') break;
    await pressCorrect(page);
  }
  // Assert the loop's exit reason and pin the final count: exhaustion or a
  // spurious mid-run reset must fail HERE with a cause, not as an opaque
  // status-row timeout below.
  const final = await readBomb(page);
  expect(final.modules[0]!.status, 'guard exhausted before the module solved').toBe('solved');
  expect(final.strikes, 'the re-solve must not add strikes').toBe(1);
  await expect(inspectorRow(page, 'status')).toHaveText('solved');
  await expect(inspectorRow(page, 'bomb.solved')).toHaveText('true');
});
