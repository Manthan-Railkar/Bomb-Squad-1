import { describe, expect, it } from '@jest/globals';
import type { Cell, ModuleState } from '../../../types/index.js';
import {
  GRID_SIZE,
  MAZES_MODULE_ID,
  MAZE_LAYOUTS,
  edgeKey,
  isMazesAction,
  type Direction,
  type MazesState,
} from '../types.js';
import { generateMazes } from '../generate.js';
import { canMove, inBounds, isReachable, isWall, neighbor } from '../solve.js';
import { mazesReducer } from '../reducer.js';
import { getMazesManualPages } from '../manual.js';

// ---- helpers -----------------------------------------------------------------

const cell = (x: number, y: number): Cell => ({ x, y });

/** Deep-frozen armed envelope (immutability gate). */
const armed = (data: MazesState): ModuleState<MazesState> => {
  Object.freeze(data.start);
  Object.freeze(data.position);
  Object.freeze(data.target);
  Object.freeze(data);
  return Object.freeze({ moduleId: MAZES_MODULE_ID, status: 'armed', data });
};

const state = (mazeId: number, position: Cell, target: Cell, start = position): MazesState => ({
  mazeId,
  start,
  position,
  target,
});

/** All cells in a maze, for exhaustive sweeps. */
const allCells = (): Cell[] => {
  const cells: Cell[] = [];
  for (let x = 0; x < GRID_SIZE; x++) for (let y = 0; y < GRID_SIZE; y++) cells.push(cell(x, y));
  return cells;
};

// ---- Task 2: the 9-maze data integrity ---------------------------------------

describe('MAZE_LAYOUTS integrity (the correctness crux)', () => {
  it('has exactly 9 mazes', () => {
    expect(MAZE_LAYOUTS).toHaveLength(9);
  });

  it('every maze is a perfect maze: exactly 25 interior walls and fully connected', () => {
    // A spanning tree over 36 cells has 35 passages; 60 interior edges − 35 = 25
    // walls. All 9 canonical KTANE mazes are perfect mazes, so a wrong wall count
    // or any isolated cell means a mis-transcription.
    MAZE_LAYOUTS.forEach((layout, mazeId) => {
      expect(layout.walls).toHaveLength(25);
      const cells = allCells();
      cells.forEach((from) => {
        cells.forEach((to) => {
          expect(isReachable(mazeId, from, to)).toBe(true);
        });
      });
    });
  });

  it('walls are symmetric (isWall(a,b) === isWall(b,a))', () => {
    MAZE_LAYOUTS.forEach((_, mazeId) => {
      allCells().forEach((a) => {
        (['up', 'down', 'left', 'right'] as Direction[]).forEach((dir) => {
          const b = neighbor(a, dir);
          if (!inBounds(b)) return;
          expect(isWall(mazeId, a, b)).toBe(isWall(mazeId, b, a));
        });
      });
    });
  });

  it('every wall key names two orthogonally-adjacent, in-bounds cells', () => {
    MAZE_LAYOUTS.forEach((layout) => {
      layout.walls.forEach((key) => {
        const [ka, kb] = key.split('|');
        const [ax, ay] = ka.split(',').map(Number);
        const [bx, by] = kb.split(',').map(Number);
        expect(inBounds(cell(ax, ay))).toBe(true);
        expect(inBounds(cell(bx, by))).toBe(true);
        expect(Math.abs(ax - bx) + Math.abs(ay - by)).toBe(1);
        // Stored in canonical (sorted) form.
        expect(edgeKey(cell(ax, ay), cell(bx, by))).toBe(key);
      });
    });
  });

  it('each maze has two distinct, in-bounds markers', () => {
    MAZE_LAYOUTS.forEach((layout) => {
      expect(layout.markers).toHaveLength(2);
      const [a, b] = layout.markers;
      expect(inBounds(a)).toBe(true);
      expect(inBounds(b)).toBe(true);
      expect(a.x === b.x && a.y === b.y).toBe(false);
    });
  });

  it('all 9 marker-pairs are distinct (markers uniquely identify a maze)', () => {
    const keys = MAZE_LAYOUTS.map((l) => {
      const pair = [...l.markers].map((m) => `${m.x},${m.y}`).sort();
      return pair.join('/');
    });
    expect(new Set(keys).size).toBe(9);
  });

  it('hand-worked legal + blocked cases (eye-verified against manual page 15)', () => {
    // Maze 0: (0,0) has a wall to its right — '0,0|1,0' is NOT in the wall set,
    // but '1,0|1,1' is. From the top-left corner you can move right and down.
    expect(canMove(0, cell(0, 0), 'right')).toBe(true);
    expect(canMove(0, cell(0, 0), 'down')).toBe(true);
    // Maze 0 wall '0,1|1,1' blocks moving right from the left marker (0,1).
    expect(isWall(0, cell(0, 1), cell(1, 1))).toBe(true);
    expect(canMove(0, cell(0, 1), 'right')).toBe(false);
    // Maze 3 wall '1,0|2,0' blocks that edge.
    expect(isWall(3, cell(1, 0), cell(2, 0))).toBe(true);
  });
});

// ---- solve.ts units ----------------------------------------------------------

describe('solve helpers', () => {
  it('neighbor steps one cell per direction (origin top-left)', () => {
    expect(neighbor(cell(2, 2), 'up')).toEqual(cell(2, 1));
    expect(neighbor(cell(2, 2), 'down')).toEqual(cell(2, 3));
    expect(neighbor(cell(2, 2), 'left')).toEqual(cell(1, 2));
    expect(neighbor(cell(2, 2), 'right')).toEqual(cell(3, 2));
  });

  it('inBounds rejects off-grid cells', () => {
    expect(inBounds(cell(0, 0))).toBe(true);
    expect(inBounds(cell(5, 5))).toBe(true);
    expect(inBounds(cell(-1, 0))).toBe(false);
    expect(inBounds(cell(6, 0))).toBe(false);
    expect(inBounds(cell(0, 6))).toBe(false);
  });

  it('canMove treats off-grid as blocked (implicit boundary)', () => {
    expect(canMove(0, cell(0, 0), 'up')).toBe(false);
    expect(canMove(0, cell(0, 0), 'left')).toBe(false);
    expect(canMove(0, cell(5, 5), 'down')).toBe(false);
    expect(canMove(0, cell(5, 5), 'right')).toBe(false);
  });

  it('isWall returns false for an unknown maze id', () => {
    expect(isWall(99, cell(0, 0), cell(1, 0))).toBe(false);
  });

  it('isReachable is false for off-grid endpoints', () => {
    expect(isReachable(0, cell(-1, 0), cell(0, 0))).toBe(false);
    expect(isReachable(0, cell(0, 0), cell(9, 9))).toBe(false);
  });
});

// ---- generate.ts -------------------------------------------------------------

describe('generateMazes', () => {
  it('is deterministic: same seed → deep-equal twice', () => {
    expect(generateMazes(12345)).toEqual(generateMazes(12345));
  });

  it('different seeds generally differ', () => {
    const a = generateMazes(1);
    const b = generateMazes(2);
    expect(a).not.toEqual(b);
  });

  it('invariant sweep: start≠target, both in-bounds, valid mazeId, reachable, position=start', () => {
    for (const seed of [0, 1, 2, 3, 7, 42, 100, 999, 65535, 1_000_000]) {
      const s = generateMazes(seed);
      expect(s.mazeId).toBeGreaterThanOrEqual(0);
      expect(s.mazeId).toBeLessThan(MAZE_LAYOUTS.length);
      expect(inBounds(s.start)).toBe(true);
      expect(inBounds(s.target)).toBe(true);
      expect(s.start).toEqual(s.position);
      expect(s.start.x === s.target.x && s.start.y === s.target.y).toBe(false);
      expect(isReachable(s.mazeId, s.start, s.target)).toBe(true);
    }
  });

  it('rejects a negative / non-integer seed (via makeSeededRng)', () => {
    expect(() => generateMazes(-1)).toThrow();
    expect(() => generateMazes(1.5)).toThrow();
  });
});

// ---- isMazesAction guard -----------------------------------------------------

describe('isMazesAction', () => {
  it('accepts MODULE_RESET and MOVE with a valid direction', () => {
    expect(isMazesAction({ type: 'MODULE_RESET' })).toBe(true);
    for (const dir of ['up', 'down', 'left', 'right']) {
      expect(isMazesAction({ type: 'MOVE', direction: dir })).toBe(true);
    }
  });

  it('rejects malformed / unknown actions', () => {
    expect(isMazesAction(null)).toBe(false);
    expect(isMazesAction(undefined)).toBe(false);
    expect(isMazesAction(42)).toBe(false);
    expect(isMazesAction({})).toBe(false);
    expect(isMazesAction({ type: 'MOVE' })).toBe(false);
    expect(isMazesAction({ type: 'MOVE', direction: 'sideways' })).toBe(false);
    expect(isMazesAction({ type: 'NAV', direction: 'up' })).toBe(false);
  });
});

// ---- reducer -----------------------------------------------------------------

describe('mazesReducer', () => {
  it('happy path: a scripted legal path solves on the final move, armed before', () => {
    // Maze 0, start (0,0), target (0,2). '0,1|1,1' etc don't block the left column.
    // Verify column 0 is walkable downward: no '0,0|0,1' or '0,1|0,2' walls in maze 0.
    expect(isWall(0, cell(0, 0), cell(0, 1))).toBe(false);
    expect(isWall(0, cell(0, 1), cell(0, 2))).toBe(false);
    let s: ModuleState<MazesState> = armed(state(0, cell(0, 0), cell(0, 2)));
    s = mazesReducer(s, { type: 'MOVE', direction: 'down' });
    expect(s.status).toBe('armed');
    expect(s.data.position).toEqual(cell(0, 1));
    s = mazesReducer(s, { type: 'MOVE', direction: 'down' });
    expect(s.status).toBe('solved');
    expect(s.data.position).toEqual(cell(0, 2));
  });

  it('wrong: MOVE into a wall strikes and leaves position unchanged', () => {
    // Maze 0 wall '0,1|1,1' blocks right from (0,1).
    const s0 = armed(state(0, cell(0, 1), cell(5, 5)));
    const s1 = mazesReducer(s0, { type: 'MOVE', direction: 'right' });
    expect(s1.status).toBe('struck');
    expect(s1.data.position).toEqual(cell(0, 1));
  });

  it('wrong: MOVE off-grid strikes and leaves position unchanged', () => {
    const s0 = armed(state(0, cell(0, 0), cell(5, 5)));
    const s1 = mazesReducer(s0, { type: 'MOVE', direction: 'up' });
    expect(s1.status).toBe('struck');
    expect(s1.data.position).toEqual(cell(0, 0));
  });

  it('idempotency: a blocked MOVE returns identical position; solved module is inert', () => {
    const s0 = armed(state(0, cell(0, 1), cell(5, 5)));
    const s1 = mazesReducer(s0, { type: 'MOVE', direction: 'right' });
    const s2 = mazesReducer({ ...s1, status: 'armed' }, { type: 'MOVE', direction: 'right' });
    expect(s2.data.position).toEqual(cell(0, 1));

    const solved: ModuleState<MazesState> = {
      moduleId: MAZES_MODULE_ID,
      status: 'solved',
      data: state(0, cell(0, 2), cell(0, 2), cell(0, 0)),
    };
    Object.freeze(solved.data);
    expect(mazesReducer(solved, { type: 'MOVE', direction: 'down' })).toBe(solved);
  });

  it('immutability: a frozen input state is never mutated', () => {
    const s0 = armed(state(0, cell(0, 0), cell(0, 2)));
    expect(() => mazesReducer(s0, { type: 'MOVE', direction: 'down' })).not.toThrow();
    // Original unchanged.
    expect(s0.data.position).toEqual(cell(0, 0));
    expect(s0.status).toBe('armed');
  });

  it('guards: unknown / malformed action returns the same state object', () => {
    const s0 = armed(state(0, cell(0, 0), cell(0, 2)));
    expect(mazesReducer(s0, { type: 'FOO' })).toBe(s0);
    expect(mazesReducer(s0, { type: 'MOVE', direction: 'sideways' })).toBe(s0);
    expect(mazesReducer(s0, null)).toBe(s0);
  });

  it('MODULE_RESET returns the light to start and re-arms', () => {
    const s0 = armed(state(0, cell(0, 2), cell(5, 5), cell(0, 0)));
    const struck: ModuleState<MazesState> = { ...s0, status: 'struck' };
    const reset = mazesReducer(struck, { type: 'MODULE_RESET' });
    expect(reset.status).toBe('armed');
    expect(reset.data.position).toEqual(cell(0, 0));
  });

  it('MODULE_RESET re-arms even a solved module (bypasses solved-inert guard)', () => {
    const solved: ModuleState<MazesState> = {
      moduleId: MAZES_MODULE_ID,
      status: 'solved',
      data: state(0, cell(0, 2), cell(0, 2), cell(0, 0)),
    };
    const reset = mazesReducer(solved, { type: 'MODULE_RESET' });
    expect(reset.status).toBe('armed');
    expect(reset.data.position).toEqual(cell(0, 0));
  });
});

// ---- manual ↔ solver share the data -----------------------------------------

describe('getMazesManualPages', () => {
  it('is one Mazes chapter with an intro + a 9-maze section', () => {
    const pages = getMazesManualPages();
    expect(pages).toHaveLength(1);
    expect(pages[0].chapterId).toBe(MAZES_MODULE_ID);
    const mazeSection = pages[0].sections.find((s) => s.mazes !== undefined);
    expect(mazeSection?.mazes).toHaveLength(9);
  });

  it('carries the SAME walls + markers as MAZE_LAYOUTS (divergence impossible)', () => {
    const section = getMazesManualPages()[0].sections.find((s) => s.mazes !== undefined);
    const mazes = section?.mazes ?? [];
    mazes.forEach((m, i) => {
      expect(m.size).toBe(GRID_SIZE);
      expect(m.walls).toEqual(MAZE_LAYOUTS[i].walls);
      expect(m.markers).toEqual(MAZE_LAYOUTS[i].markers);
    });
  });
});
