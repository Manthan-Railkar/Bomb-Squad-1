import { makeSeededRng } from '../../seeding/index.js';
import type { Cell } from '../../types/module.js';
import { GRID_SIZE, MAZE_LAYOUTS, type MazesState } from './types.js';
import { isReachable } from './solve.js';

const MAX_ATTEMPTS = 10000;
// Bias start/target apart so trivial one-move instances are rare (nice-to-have,
// not a correctness requirement — every distinct pair is solvable).
const MIN_MANHATTAN = 3;

/**
 * Pure, seeded instance generator — the ONLY place randomness is allowed in a
 * module, and only via makeSeededRng (Math.random is banned project-wide).
 * `ctx` is unused: Mazes has no bomb-context rule (like keypads/whos-on-first/
 * wire-sequences), so the signature takes seed alone.
 *
 * Algorithm:
 *  1. Seeded mazeId ∈ 0..8.
 *  2. Seeded distinct start + target cells, biased at least MIN_MANHATTAN apart.
 *  3. position = start.
 *
 * The 9 canonical mazes are perfect mazes (fully connected — every cell reaches
 * every other), so any distinct start/target is solvable. The BFS reachability
 * assert below is therefore a never-happens safety net (à la keypads/passwords):
 * a valid instance is found on the first try; the throw only fires if the maze
 * data were ever corrupted. No answer/path is stored — the reducer recomputes
 * legality from MAZE_LAYOUTS at MOVE time (wires AI1).
 */
export function generateMazes(seed: number): MazesState {
  const rng = makeSeededRng(seed); // asserts non-negative integer seed
  const randInt = (n: number): number => Math.floor(rng() * n);
  const cell = (): Cell => ({ x: randInt(GRID_SIZE), y: randInt(GRID_SIZE) });
  const manhattan = (a: Cell, b: Cell): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  const mazeId = randInt(MAZE_LAYOUTS.length);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const start = cell();
    const target = cell();
    if (manhattan(start, target) < MIN_MANHATTAN) continue;
    if (!isReachable(mazeId, start, target)) continue; // defensive: always true here
    return { mazeId, start, position: start, target };
  }

  /* istanbul ignore next -- unreachable: perfect mazes make every distinct pair reachable */
  throw new Error('mazes: could not generate a solvable instance (maze data corrupt?)');
}
