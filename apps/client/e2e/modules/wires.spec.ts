/**
 * AC #3 proof — the real bomb scene in the real browser, driven through real
 * canvas pixels. /dev/sandbox mounts the Wires module (fixed seed typed into the
 * seed field), the spec derives the correct cut from the PUBLIC snapshot via the
 * shared solve fn (never a baked answer), clicks the projected mesh, and asserts
 * the state change through the UI. This is the surface jsdom structurally
 * cannot mount (no WebGL) — the gap that motivated TD-6.
 */
import { test, expect } from '@playwright/test';
import { solveWires, type BombContext, type WireColor } from '@bomb-squad/shared';
import { clickMesh, readBomb, waitForBomb, waitForMesh } from '../helpers/canvas.js';
import { generateSandboxModule, inspectorRow } from '../helpers/sandbox.js';

interface SandboxWiresData {
  wires: { color: WireColor; cut: boolean }[];
}

test('wires: canvas click solves the module; a wrong cut strikes and stays severed', async ({
  page,
}) => {
  // Pin the instance: module = wires, seed typed into the sandbox seed field
  // (same seed → same instance; there is no query param by design).
  const data = await generateSandboxModule<SandboxWiresData>(page, 'wires', '7');
  await waitForMesh(page, 'm0-wire-0');

  // Derive the correct move from the public snapshot — the honest path.
  const bomb = await readBomb(page);
  const colors = data.wires.map((w) => w.color);
  const correct = solveWires(colors, bomb.context as BombContext);
  const wrong = data.wires.findIndex((_, i) => i !== correct);
  expect(wrong).toBeGreaterThanOrEqual(0);

  // Wrong cut → a strike, and the wire stays physically severed (5.3 contract).
  await clickMesh(page, `m0-wire-${wrong}`);
  await expect(inspectorRow(page, 'strikes')).toHaveText('1');
  const afterStrike = await waitForBomb(page, (b) => b.strikes === 1);
  expect((afterStrike.modules[0]!.data as SandboxWiresData).wires[wrong]!.cut).toBe(true);

  // Correct cut → solved, asserted through the UI (the sidebar renders state).
  await clickMesh(page, `m0-wire-${correct}`);
  await expect(inspectorRow(page, 'status')).toHaveText('solved');
  await expect(inspectorRow(page, 'bomb.solved')).toHaveText('true');
});
