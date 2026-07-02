/**
 * Task 6 backfill — Wire Sequences on /dev/sandbox: the first genuinely
 * STATEFUL Medium module (multi-panel, up/down nav, cumulative-occurrence
 * auto-solve). Should-cut wires are recomputed from PUBLIC state via the
 * shared `shouldCut` (global reading order); the spec navigates the real
 * panels, cuts through the canvas, and covers the wrong-cut strike (wire
 * stays severed — physical-cut contract).
 */
import { test, expect } from '@playwright/test';
import { shouldCut, type WireSequencesState } from '@bomb-squad/shared';
import { clickMesh, waitForBomb, waitForMesh } from '../helpers/canvas.js';
import { generateSandboxModule, inspectorRow } from '../helpers/sandbox.js';

/** Global index of panel p, slot s. */
function globalIndex(state: WireSequencesState, panel: number, slot: number): number {
  return state.panels.slice(0, panel).reduce((n, pl) => n + pl.wires.length, 0) + slot;
}

/**
 * Click the wire OFF-CENTRE (local +0.10 along the cylinder, well inside the
 * grommets at ±0.21). Empirically mapped: a small unidentified raycast plane
 * (local x ∈ [-0.05, 0] at row height, likely a troika Text SDF plane) swallows
 * dead-centre clicks on this module's middle row. Deterministic, and a human
 * clicks anywhere on the wire anyway.
 */
const WIRE_CLICK_OFFSET: [number, number, number] = [0.1, 0, 0];

test('wire-sequences: nav + cumulative-occurrence cuts solve; a wrong cut strikes and stays severed', async ({
  page,
}) => {
  // Deterministic seed choice: walk fixed candidates until panel 0 carries a
  // NON-should-cut wire (for the strike leg). Generation is seeded, so the
  // chosen seed is identical on every run.
  let data!: WireSequencesState;
  let wrongGlobal = -1;
  for (const seed of ['7', '8', '9', '11', '13']) {
    data = await generateSandboxModule<WireSequencesState>(page, 'wire-sequences', seed);
    const wrongSlot = data.panels[0]!.wires.findIndex(
      (_, s) => !shouldCut(data, globalIndex(data, 0, s)),
    );
    if (wrongSlot >= 0) {
      wrongGlobal = globalIndex(data, 0, wrongSlot);
      break;
    }
  }
  expect(wrongGlobal, 'no candidate seed produced a non-should-cut wire on panel 0').not.toBe(-1);
  await waitForMesh(page, `m0-wseq-wire-0`);

  // Wrong cut → strike, and the wire stays PHYSICALLY severed (no re-strike
  // faucet: a repeat CUT on a severed wire is a no-op).
  await clickMesh(page, `m0-wseq-wire-${wrongGlobal}`, { offset: WIRE_CLICK_OFFSET });
  await expect(inspectorRow(page, 'strikes')).toHaveText('1');
  const struck = await waitForBomb(page, (b) => b.strikes === 1);
  const struckData = struck.modules[0]!.data as WireSequencesState;
  expect(struckData.panels[0]!.wires.map((w) => w.cut)).toContain(true);

  // Solve: per panel, cut every should-cut wire (global reading order), then
  // navigate down. Auto-solves on the final should-cut cut — no submit.
  for (let p = 0; p < data.panels.length; p++) {
    for (let s = 0; s < data.panels[p]!.wires.length; s++) {
      const g = globalIndex(data, p, s);
      if (!shouldCut(data, g)) continue;
      await clickMesh(page, `m0-wseq-wire-${g}`, { offset: WIRE_CLICK_OFFSET });
      await waitForBomb(page, (b) => {
        const d = b.modules[0]!.data as WireSequencesState;
        return d.panels[p]!.wires[s]!.cut;
      });
    }
    const solvedNow = await waitForBomb(page, () => true);
    if (solvedNow.modules[0]!.status === 'solved') break;
    if (p < data.panels.length - 1) {
      await clickMesh(page, `m0-wseq-nav-down`);
      await waitForBomb(page, (b) => {
        const d = b.modules[0]!.data as WireSequencesState;
        return d.currentPanel === p + 1;
      });
    }
  }
  await expect(inspectorRow(page, 'status')).toHaveText('solved');
  await expect(inspectorRow(page, 'bomb.solved')).toHaveText('true');
});
