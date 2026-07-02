/**
 * Live-round Defuser drivers (Story TD-6) — a browser-shaped bot. The Defuser
 * page drives the REAL BombScene: click-to-focus a bay (the 4.1 camera
 * contract), derive the correct cut from the PUBLIC snapshot via the shared
 * solve fn, click the projected wire mesh, Escape back to overview. Solving is
 * honest by construction — no baked answers exist to read (TD-5 keystone).
 *
 * Round-state discipline: `session.status` is the authoritative signal for
 * "the round resolved". A null bomb alone is NOT (a resync can blank it
 * transiently), so every wait here gates on status, never on bomb presence.
 *
 * Wires-only bombs by design: the flow specs configure the pool down to Wires
 * (configureWiresOnly) so the canvas interaction stays one primitive deep.
 */
import type { Page } from '@playwright/test';
import { solveWires, type BombContext, type WireColor } from '@bomb-squad/shared';
import { clickMesh, waitForGame, type BombState, type GameSnapshot } from './canvas.js';

interface WiresData {
  wires: { color: WireColor; cut: boolean }[];
}

/**
 * The round has ACTUALLY resolved. A null/absent status is NOT resolution —
 * the client can transiently lose its snapshot mid-round (reload/reconnect →
 * reattach), and treating that as "round over" silently abandons the solve.
 */
const roundResolved = (g: GameSnapshot): boolean =>
  g.status === 'between-rounds' || g.status === 'ended';

/**
 * Faceplate click spot in bay-local space: right of the wires' grommets
 * (x≈0.30 max), clear of the solve LED (0.3, 0.21) and the corner screws
 * (±0.355, ±0.23), proud of the plate so the ray hits the faceplate itself.
 */
const BAY_FOCUS_OFFSET: [number, number, number] = [0.34, 0, 0.06];

function correctWire(bomb: BombState, moduleIndex: number): number {
  const data = bomb.modules[moduleIndex]!.data as WiresData;
  return solveWires(
    data.wires.map((w) => w.color),
    bomb.context as BombContext,
  );
}

/** The live round is up on this page: status active AND the bomb snapshot in. */
async function waitForActiveBomb(page: Page): Promise<BombState> {
  const game = await waitForGame(
    page,
    (g) => g.status === 'active' && g.bomb !== null && g.bomb.modules.length > 0,
    60_000,
  );
  return game.bomb!;
}

/** Solve every wires module on the live bomb through real canvas clicks. */
export async function solveWiresBombInBrowser(page: Page): Promise<void> {
  const bomb = await waitForActiveBomb(page);
  for (let i = 0; i < bomb.modules.length; i++) {
    const live = await waitForGame(
      page,
      (g) => roundResolved(g) || (g.status === 'active' && g.bomb !== null && g.bomb.modules[i] !== undefined),
    );
    if (roundResolved(live)) return; // round resolved (last solve landed)
    if (live.bomb!.modules[i]!.status === 'solved') continue;
    // Click-to-focus the bay, then cut the correct wire.
    await clickMesh(page, `bay-${i}`, { offset: BAY_FOCUS_OFFSET });
    await clickMesh(page, `m${i}-wire-${correctWire(live.bomb!, i)}`);
    const after = await waitForGame(
      page,
      (g) => roundResolved(g) || (g.status === 'active' && g.bomb?.modules[i]?.status === 'solved'),
    );
    if (roundResolved(after)) return; // that was the last module
    await page.keyboard.press('Escape'); // 4.1 contract: back to overview
  }
}

/**
 * Deliberately strike out (3 wrong cuts → detonation). Never touches a correct
 * wire; walks modules until three strikes have been dealt or the round ends.
 */
export async function strikeOutWiresBomb(page: Page): Promise<void> {
  const bomb = await waitForActiveBomb(page);
  let strikes = bomb.strikes;
  for (let i = 0; i < bomb.modules.length && strikes < 3; i++) {
    const live = await waitForGame(
      page,
      (g) => roundResolved(g) || (g.status === 'active' && g.bomb !== null && g.bomb.modules[i] !== undefined),
    );
    if (roundResolved(live)) return;
    const correct = correctWire(live.bomb!, i);
    const data = live.bomb!.modules[i]!.data as WiresData;
    await clickMesh(page, `bay-${i}`, { offset: BAY_FOCUS_OFFSET });
    for (let w = 0; w < data.wires.length && strikes < 3; w++) {
      if (w === correct || data.wires[w]!.cut) continue;
      await clickMesh(page, `m${i}-wire-${w}`);
      strikes += 1;
      // The 3rd strike detonates (status leaves 'active') — covered below.
      const seen = await waitForGame(
        page,
        (g) => roundResolved(g) || (g.status === 'active' && g.bomb !== null && g.bomb.strikes >= strikes),
      );
      if (roundResolved(seen)) return; // detonated
    }
    await page.keyboard.press('Escape');
  }
}
