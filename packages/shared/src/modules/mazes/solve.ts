import type { Cell } from '../../types/module.js';
import { GRID_SIZE, MAZE_LAYOUTS, edgeKey, type Direction } from './types.js';

/**
 * Pure spatial helpers — the single source of move legality is MAZE_LAYOUTS. No
 * answer is stored on the module; every check recomputes from the public maze
 * data (wires AI1). Used by both the reducer (MOVE legality) and generate.ts
 * (the defensive reachability assert).
 */

const DELTA: Readonly<Record<Direction, readonly [number, number]>> = {
  up: [0, -1], // origin top-left → up decreases row (y)
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/** The adjacent cell one step in `direction` (may be off-grid — caller checks). */
export function neighbor(cell: Cell, direction: Direction): Cell {
  const [dx, dy] = DELTA[direction];
  return { x: cell.x + dx, y: cell.y + dy };
}

/** True iff the cell lies inside the 6×6 grid. */
export function inBounds(cell: Cell): boolean {
  return cell.x >= 0 && cell.x < GRID_SIZE && cell.y >= 0 && cell.y < GRID_SIZE;
}

// Per-maze wall lookups, built once on first use (pure, deterministic — derived
// straight from MAZE_LAYOUTS, no I/O or randomness). Keeps isWall O(1) without
// rebuilding a Set on every MOVE.
const WALL_SETS: ReadonlyArray<ReadonlySet<string>> = MAZE_LAYOUTS.map(
  (layout) => new Set(layout.walls),
);

/** Is the edge between adjacent cells `a`,`b` a wall in this maze? Symmetric. */
export function isWall(mazeId: number, a: Cell, b: Cell): boolean {
  const walls = WALL_SETS[mazeId];
  // Fail CLOSED: an unknown/out-of-range mazeId treats every edge as a wall, so
  // canMove rejects all moves rather than yielding a wall-free, trivially-solvable
  // maze. mazeId is server-authoritative and set once by generate, but the single
  // legality checker must not fail open for a corrupt/desynced instance.
  if (!walls) return true;
  return walls.has(edgeKey(a, b));
}

/**
 * Can the light step from `from` in `direction`? Legal iff the destination is on
 * the grid AND no wall blocks that edge. Off-grid is treated as blocked (the
 * outer boundary is a line you cannot cross), unifying border + interior walls
 * into one check — the reducer strikes on either.
 */
export function canMove(mazeId: number, from: Cell, direction: Direction): boolean {
  const next = neighbor(from, direction);
  return inBounds(next) && !isWall(mazeId, from, next);
}

const ALL_DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

/** BFS over legal moves: is `to` reachable from `from` within this maze? */
export function isReachable(mazeId: number, from: Cell, to: Cell): boolean {
  if (!inBounds(from) || !inBounds(to)) return false;
  const key = (c: Cell) => `${c.x},${c.y}`;
  const seen = new Set<string>([key(from)]);
  const queue: Cell[] = [from];
  while (queue.length > 0) {
    const cell = queue.shift() as Cell;
    if (cell.x === to.x && cell.y === to.y) return true;
    for (const dir of ALL_DIRECTIONS) {
      if (!canMove(mazeId, cell, dir)) continue;
      const next = neighbor(cell, dir);
      const nk = key(next);
      if (!seen.has(nk)) {
        seen.add(nk);
        queue.push(next);
      }
    }
  }
  return false;
}
