/**
 * TD-7 — Mazes on /dev/sandbox: the first 2D navigable board (white light +
 * four arrow buttons). The solving path is derived from PUBLIC state (mazeId +
 * position + target) by BFS over the shared `canMove` legality fn — never a
 * baked path (the reducer stores none either). Covers both strike surfaces the
 * retro named: an OFF-GRID move (stepping past the outer boundary) and a WALL
 * move (an interior blocked edge) each strike and leave the light where it was,
 * then the honest path solves.
 */
import { test, expect } from '@playwright/test';
import {
  canMove,
  inBounds,
  neighbor,
  type Cell,
  type Direction,
  type MazesState,
} from '@bomb-squad/shared';
import { clickMesh, readBomb, waitForBomb, waitForMesh } from '../helpers/canvas.js';
import { generateSandboxModule, inspectorRow } from '../helpers/sandbox.js';

const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];
const cellKey = (c: Cell) => `${c.x},${c.y}`;

/** BFS shortest direction-path from `position` to `target` over legal moves. */
function solvePath(state: MazesState): Direction[] {
  const seen = new Set<string>([cellKey(state.position)]);
  const queue: { cell: Cell; path: Direction[] }[] = [{ cell: state.position, path: [] }];
  while (queue.length > 0) {
    const { cell, path } = queue.shift()!;
    if (cell.x === state.target.x && cell.y === state.target.y) return path;
    for (const dir of DIRECTIONS) {
      if (!canMove(state.mazeId, cell, dir)) continue;
      const next = neighbor(cell, dir);
      if (seen.has(cellKey(next))) continue;
      seen.add(cellKey(next));
      queue.push({ cell: next, path: [...path, dir] });
    }
  }
  return [];
}

/** A direction that steps OFF the 6×6 grid from `cell` (undefined if none). */
function offGridDir(cell: Cell): Direction | undefined {
  return DIRECTIONS.find((d) => !inBounds(neighbor(cell, d)));
}

/** A direction blocked by an INTERIOR wall (in-bounds but illegal). */
function wallDir(mazeId: number, cell: Cell): Direction | undefined {
  return DIRECTIONS.find((d) => inBounds(neighbor(cell, d)) && !canMove(mazeId, cell, d));
}

test('mazes: off-grid + wall moves strike and hold position; the honest path solves', async ({
  page,
}) => {
  // Deterministic seed choice: walk fixed candidates until the START cell offers
  // BOTH an off-grid move (border cell) AND an interior-wall move — so one seed
  // exercises both strike surfaces. Generation is seeded → identical every run.
  let data!: MazesState;
  let offDir: Direction | undefined;
  let blockDir: Direction | undefined;
  let sawOffGrid = false;
  let sawWall = false;
  for (const seed of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']) {
    data = await generateSandboxModule<MazesState>(page, 'mazes', seed);
    offDir = offGridDir(data.position);
    blockDir = wallDir(data.mazeId, data.position);
    if (offDir) sawOffGrid = true;
    if (blockDir) sawWall = true;
    if (offDir && blockDir) break;
  }
  // Separate precondition failures so an exhausted walk names the missing half
  // (offDir/blockDir alone reflect only the LAST candidate seed).
  expect(sawOffGrid, 'no candidate seed had a start with an off-grid move').toBe(true);
  expect(sawWall, 'no candidate seed had a start with an interior-wall move').toBe(true);
  expect(offDir && blockDir, 'no single candidate seed offered both strike surfaces').toBeTruthy();
  await waitForMesh(page, 'm0-maze-nav-up');

  const start = data.position;

  // Off-grid strike: the light stays put (position unchanged).
  await clickMesh(page, `m0-maze-nav-${offDir}`);
  await expect(inspectorRow(page, 'strikes')).toHaveText('1');
  const afterOff = await waitForBomb(page, (b) => b.strikes === 1);
  const offPos = (afterOff.modules[0]!.data as MazesState).position;
  expect(offPos, 'off-grid strike must not move the light').toEqual(start);

  // Wall strike: the light stays put again (≤2 strikes — the sandbox clamps at 3).
  await clickMesh(page, `m0-maze-nav-${blockDir}`);
  await expect(inspectorRow(page, 'strikes')).toHaveText('2');
  const afterWall = await waitForBomb(page, (b) => b.strikes === 2);
  const wallPos = (afterWall.modules[0]!.data as MazesState).position;
  expect(wallPos, 'wall strike must not move the light').toEqual(start);

  // Solve: BFS the honest path from the (unchanged) start and walk it.
  const path = solvePath(data);
  expect(path.length, 'BFS found no path to target').toBeGreaterThan(0);
  let cursor: Cell = start;
  for (const dir of path) {
    cursor = neighbor(cursor, dir);
    await clickMesh(page, `m0-maze-nav-${dir}`);
    await waitForBomb(page, (b) => {
      const pos = (b.modules[0]!.data as MazesState).position;
      return pos.x === cursor.x && pos.y === cursor.y;
    });
  }
  await expect(inspectorRow(page, 'status')).toHaveText('solved');
  await expect(inspectorRow(page, 'bomb.solved')).toHaveText('true');
  // Pin the final count: a walk that brushed a wall would strike-and-hold, and
  // the BFS path would still reach the target — the strike total is the tell.
  expect((await readBomb(page)).strikes, 'the solve leg must not add strikes').toBe(2);
});
