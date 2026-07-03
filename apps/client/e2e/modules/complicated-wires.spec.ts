/**
 * TD-7 — Complicated Wires on /dev/sandbox (Hard tier). MULTI-CUT solve: every
 * should-cut wire must be severed to disarm. Each wire's cut decision is
 * recomputed from PUBLIC state (the wire's four attributes + the bomb ctx) via
 * the shared `complicatedWiresShouldCut` truth-table fn — never a baked answer
 * (the module stores none). Covers the wrong-cut strike: cutting a
 * should-NOT-cut wire strikes but the wire still severs and the remaining
 * should-cut wires stay cuttable.
 */
import { test, expect } from '@playwright/test';
import {
  complicatedWiresShouldCut,
  type ComplicatedWiresState,
} from '@bomb-squad/shared';
import { clickMesh, readBomb, waitForBomb, waitForMesh } from '../helpers/canvas.js';
import { generateSandboxModule, inspectorRow } from '../helpers/sandbox.js';

const shouldCut = (data: ComplicatedWiresState, i: number) =>
  complicatedWiresShouldCut(data.wires[i]!.attrs, data.ctx);

/**
 * Click the wire OFF-CENTRE (local +0.08 along the horizontal cylinder, inside
 * the grommets at ±0.16). Dead-centre can be swallowed by the on-wire star Text
 * SDF plane (present when a wire has the star attribute) — the same off-centre
 * discipline wire-sequences uses; a human clicks anywhere on the wire anyway.
 */
const WIRE_CLICK_OFFSET: [number, number, number] = [0.08, 0, 0];

test('complicated-wires: a wrong cut strikes (others stay cuttable); cutting every should-cut wire solves', async ({
  page,
}) => {
  // Deterministic seed choice: walk fixed candidates until the instance has BOTH
  // a should-NOT-cut wire (the strike leg) AND ≥1 should-cut wire (a real solve).
  // Generation is seeded → the chosen seed is identical on every run.
  let data!: ComplicatedWiresState;
  let wrongIndex = -1;
  let sawWrong = false;
  let sawCut = false;
  for (const seed of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']) {
    data = await generateSandboxModule<ComplicatedWiresState>(page, 'complicated-wires', seed);
    const wrong = data.wires.findIndex((_, i) => !shouldCut(data, i));
    const hasCut = data.wires.some((_, i) => shouldCut(data, i));
    if (wrong >= 0) sawWrong = true;
    if (hasCut) sawCut = true;
    if (wrong >= 0 && hasCut) {
      wrongIndex = wrong;
      break;
    }
  }
  // Separate precondition failures so an exhausted walk names the missing half.
  expect(sawWrong, 'no candidate seed had a should-NOT-cut wire').toBe(true);
  expect(sawCut, 'no candidate seed had a should-cut wire').toBe(true);
  expect(wrongIndex, 'no candidate seed combined both in one instance').not.toBe(-1);
  await waitForMesh(page, 'm0-cwire-0');

  const shouldCutIdx = data.wires
    .map((_, i) => i)
    .filter((i) => shouldCut(data, i));

  // Wrong cut → strike; the wire still severs, and every should-cut wire is
  // still uncut (i.e. remains cuttable — a wrong cut doesn't lock the module).
  await clickMesh(page, `m0-cwire-${wrongIndex}`, { offset: WIRE_CLICK_OFFSET });
  await expect(inspectorRow(page, 'strikes')).toHaveText('1');
  const struck = await waitForBomb(page, (b) => b.strikes === 1);
  const struckWires = (struck.modules[0]!.data as ComplicatedWiresState).wires;
  expect(struckWires[wrongIndex]!.cut, 'wrong-cut wire must still sever').toBe(true);
  for (const i of shouldCutIdx) {
    expect(struckWires[i]!.cut, `should-cut wire ${i} must stay cuttable after a wrong cut`).toBe(
      false,
    );
  }

  // Solve: cut every should-cut wire; the module disarms on the last one.
  for (const i of shouldCutIdx) {
    await clickMesh(page, `m0-cwire-${i}`, { offset: WIRE_CLICK_OFFSET });
    await waitForBomb(page, (b) => {
      const d = b.modules[0]!.data as ComplicatedWiresState;
      return d.wires[i]!.cut;
    });
  }
  await expect(inspectorRow(page, 'status')).toHaveText('solved');
  await expect(inspectorRow(page, 'bomb.solved')).toHaveText('true');
  // Pin the final count: a mis-derived cut set could sever extra wires, earn
  // strikes, and still end `solved` — the strike total is the only tell.
  expect((await readBomb(page)).strikes, 'the solve leg must not add strikes').toBe(1);
});
