/**
 * mazes — the LAST Medium module (Story 6.4, FR27), and the first module with a
 * 2D navigable board. One of 9 canonical maze layouts is chosen per instance,
 * identified by its two circular markers (the identity the Expert matches). The
 * Defuser navigates a white light with four arrow buttons toward a red triangle;
 * moving across a wall (invisible on the bomb, drawn in the manual) or off the
 * 6×6 grid strikes and leaves the light where it was. Reaching the triangle
 * solves — no submit.
 *
 * Pure logic lives HERE in packages/shared so both the server registry
 * (MODULE_REDUCERS) and the client sandbox run the SAME code;
 * apps/client/src/modules/mazes/ re-exports it. No secret is stored: the walls
 * are public manual content and the markers are drawn on the bomb, so
 * broadcasting mazeId + position + target reveals nothing the Expert isn't
 * meant to hold (wires AI1). Move legality is recomputed each MOVE from
 * MAZE_LAYOUTS — there is no stored path or "next correct move".
 */

// The canonical Cell type lives in ../../types/module.ts (next to ManualTable /
// ManualMaze — the additive structured-manual types this module introduces).
// Imported here (not re-exported) so it is exported from @bomb-squad/shared
// exactly once, via the types barrel.
import type { Cell } from '../../types/module.js';

/** Module identifier — kebab-case. Reserved in MODULE_IDS (registry.ts). */
export const MAZES_MODULE_ID = 'mazes';

/** 6×6 cells; coordinates 0..5 on each axis (origin top-left). */
export const GRID_SIZE = 6;

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface MazesState {
  readonly mazeId: number; // 0..8 — indexes MAZE_LAYOUTS (identity = its two markers)
  readonly start: Cell; // immutable spawn (restored by MODULE_RESET)
  readonly position: Cell; // white light (current)
  readonly target: Cell; // red triangle (goal)
}

/** Defuser action: step the white light one cell in a direction. */
export type MazesAction = { type: 'MOVE'; direction: Direction };

/** Lifecycle action forwarded whole by the bomb reducer (see types/actions.ts). */
export type MazesReset = { type: 'MODULE_RESET' };

const DIRECTIONS: ReadonlySet<string> = new Set<Direction>(['up', 'down', 'left', 'right']);

/** Runtime guard: actions reach reducers as `unknown` (untrusted input). */
export function isMazesAction(action: unknown): action is MazesAction | MazesReset {
  if (typeof action !== 'object' || action === null || !('type' in action)) return false;
  const type = (action as { type: unknown }).type;
  if (type === 'MODULE_RESET') return true;
  if (type === 'MOVE') return DIRECTIONS.has((action as { direction?: unknown }).direction as string);
  return false;
}

/**
 * One of the 9 canonical maze designs: two circular markers (its identity) and
 * the set of interior walls (blocked edges between adjacent cells). Only interior
 * walls are stored — the outer 6×6 boundary is implicit (the reducer treats an
 * off-grid move as a wall). This ONE constant is shared by solve.ts (move
 * legality) and manual.ts (the Expert render) — they cannot diverge.
 */
export interface MazeLayout {
  readonly markers: readonly [Cell, Cell];
  /**
   * Canonical, order-independent blocked-edge keys — see `edgeKey`. Each key
   * `"x1,y1|x2,y2"` names the wall between two orthogonally-adjacent cells.
   */
  readonly walls: readonly string[];
}

/**
 * Canonical, order-independent key for the wall between two adjacent cells. The
 * two `"x,y"` halves are sorted so `edgeKey(a, b) === edgeKey(b, a)`. Because
 * every coordinate is a single digit (0..5), lexicographic string ordering of
 * `"x,y"` matches numeric ordering — the same canonical form MAZE_LAYOUTS stores.
 */
export function edgeKey(a: Cell, b: Cell): string {
  const ka = `${a.x},${a.y}`;
  const kb = `${b.x},${b.y}`;
  return ka <= kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/**
 * The 9 canonical KTANE v1 maze layouts (manual page 15, reading order
 * top-left → right, then next row). Walls + markers were extracted
 * PROGRAMMATICALLY from the PDF's vector line segments and cross-checked by an
 * independent pixel-sampling pass (both methods agreed on all 225 walls); every
 * maze is a perfect maze (25 interior walls, fully connected) and all 9
 * marker-pairs are distinct. See the mazes integrity tests, which pin all of
 * this so a transcription typo fails loud.
 */
export const MAZE_LAYOUTS: readonly MazeLayout[] = [
  // Maze 0 (reading order: row 0, col 0)
  {
    markers: [
      { x: 0, y: 1 },
      { x: 5, y: 2 },
    ],
    walls: ['0,1|1,1', '0,2|1,2', '0,3|1,3', '1,0|1,1', '1,2|1,3', '1,3|1,4', '1,4|1,5', '1,5|2,5', '2,0|3,0', '2,1|2,2', '2,1|3,1', '2,2|3,2', '2,3|2,4', '2,4|3,4', '3,1|3,2', '3,3|3,4', '3,3|4,3', '3,5|4,5', '4,0|4,1', '4,1|4,2', '4,2|4,3', '4,3|4,4', '4,4|4,5', '4,4|5,4', '5,0|5,1'],
  },
  // Maze 1 (reading order: row 0, col 1)
  {
    markers: [
      { x: 1, y: 3 },
      { x: 4, y: 1 },
    ],
    walls: ['0,0|0,1', '0,2|1,2', '0,4|1,4', '0,5|1,5', '1,1|1,2', '1,1|2,1', '1,3|1,4', '1,3|2,3', '1,4|2,4', '2,0|2,1', '2,0|3,0', '2,2|2,3', '2,2|3,2', '2,4|3,4', '2,5|3,5', '3,1|3,2', '3,1|4,1', '3,3|3,4', '3,3|4,3', '4,1|4,2', '4,2|4,3', '4,3|5,3', '4,4|4,5', '4,4|5,4', '5,0|5,1'],
  },
  // Maze 2 (reading order: row 0, col 2)
  {
    markers: [
      { x: 3, y: 3 },
      { x: 5, y: 3 },
    ],
    walls: ['0,1|0,2', '0,1|1,1', '0,3|1,3', '0,4|1,4', '1,0|1,1', '1,1|2,1', '1,2|2,2', '1,3|2,3', '1,4|1,5', '2,0|3,0', '2,1|3,1', '2,2|3,2', '2,3|3,3', '2,4|2,5', '2,4|3,4', '3,0|4,0', '3,1|3,2', '3,3|4,3', '3,4|4,4', '3,5|4,5', '4,1|4,2', '4,1|5,1', '4,2|5,2', '4,3|5,3', '4,4|5,4'],
  },
  // Maze 3 (reading order: row 1, col 0)
  {
    markers: [
      { x: 0, y: 0 },
      { x: 0, y: 3 },
    ],
    walls: ['0,1|1,1', '0,2|1,2', '0,3|1,3', '1,0|2,0', '1,1|2,1', '1,2|1,3', '1,3|1,4', '1,4|1,5', '2,0|2,1', '2,2|2,3', '2,2|3,2', '2,3|2,4', '2,4|2,5', '2,5|3,5', '3,0|3,1', '3,1|3,2', '3,3|3,4', '3,4|3,5', '4,0|4,1', '4,1|4,2', '4,2|4,3', '4,2|5,2', '4,3|4,4', '4,4|5,4', '4,5|5,5'],
  },
  // Maze 4 (reading order: row 1, col 1)
  {
    markers: [
      { x: 3, y: 5 },
      { x: 4, y: 2 },
    ],
    walls: ['0,0|0,1', '0,3|1,3', '0,4|1,4', '0,5|1,5', '1,0|1,1', '1,1|1,2', '1,2|2,2', '1,3|1,4', '2,0|2,1', '2,1|2,2', '2,2|2,3', '2,3|2,4', '2,4|2,5', '3,0|3,1', '3,2|3,3', '3,2|4,2', '3,3|4,3', '3,4|3,5', '4,1|4,2', '4,1|5,1', '4,3|4,4', '4,3|5,3', '4,4|4,5', '4,4|5,4', '5,1|5,2'],
  },
  // Maze 5 (reading order: row 1, col 2)
  {
    markers: [
      { x: 2, y: 4 },
      { x: 4, y: 0 },
    ],
    walls: ['0,0|1,0', '0,1|1,1', '0,3|0,4', '1,1|2,1', '1,2|1,3', '1,2|2,2', '1,3|2,3', '1,4|1,5', '1,4|2,4', '2,0|3,0', '2,1|3,1', '2,2|2,3', '2,2|3,2', '2,4|2,5', '2,4|3,4', '3,0|3,1', '3,2|4,2', '3,3|4,3', '3,4|4,4', '3,5|4,5', '4,1|4,2', '4,1|5,1', '4,3|5,3', '4,4|4,5', '5,2|5,3'],
  },
  // Maze 6 (reading order: row 2, col 0)
  {
    markers: [
      { x: 1, y: 0 },
      { x: 1, y: 5 },
    ],
    walls: ['0,1|1,1', '0,2|0,3', '0,4|1,4', '1,0|1,1', '1,2|1,3', '1,2|2,2', '1,3|2,3', '1,4|1,5', '1,4|2,4', '2,0|2,1', '2,1|2,2', '2,1|3,1', '2,4|2,5', '3,0|4,0', '3,1|3,2', '3,2|3,3', '3,2|4,2', '3,3|3,4', '3,4|3,5', '4,1|4,2', '4,1|5,1', '4,3|4,4', '4,3|5,3', '4,4|5,4', '5,2|5,3'],
  },
  // Maze 7 (reading order: row 2, col 1)
  {
    markers: [
      { x: 2, y: 3 },
      { x: 3, y: 0 },
    ],
    walls: ['0,0|1,0', '0,2|1,2', '0,3|1,3', '0,4|1,4', '1,1|1,2', '1,3|1,4', '1,4|2,4', '2,0|2,1', '2,1|2,2', '2,1|3,1', '2,2|2,3', '2,3|3,3', '2,4|2,5', '3,0|4,0', '3,1|3,2', '3,2|3,3', '3,3|3,4', '3,4|3,5', '4,1|4,2', '4,1|5,1', '4,2|5,2', '4,3|4,4', '4,4|4,5', '5,3|5,4', '5,4|5,5'],
  },
  // Maze 8 (reading order: row 2, col 2)
  {
    markers: [
      { x: 0, y: 4 },
      { x: 2, y: 1 },
    ],
    walls: ['0,0|1,0', '0,1|1,1', '0,3|1,3', '0,4|1,4', '1,1|2,1', '1,2|1,3', '1,3|2,3', '1,4|2,4', '1,5|2,5', '2,0|2,1', '2,2|2,3', '2,2|3,2', '2,4|3,4', '3,0|3,1', '3,1|3,2', '3,1|4,1', '3,3|3,4', '3,3|4,3', '3,5|4,5', '4,1|5,1', '4,2|4,3', '4,2|5,2', '4,3|4,4', '4,4|5,4', '5,4|5,5'],
  },
] as const;
