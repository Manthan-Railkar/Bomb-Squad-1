import type { ModuleState, Reducer } from '../../types/index.js';
import { isMazesAction, type MazesState } from './types.js';
import { canMove, neighbor } from './solve.js';

/**
 * Pure reducer for the Mazes module — the first module with a 2D navigable board
 * (white light + directional MOVE). Small, but new: the light steps one cell per
 * legal MOVE and strikes on an illegal one.
 *
 * Contract obligations (project-context Testing Rules):
 *  - Actions arrive as `unknown` (untrusted client input) — guard, never throw.
 *  - Never mutate input state; return new objects via spread.
 *  - 'struck' is TRANSIENT: returned to signal an illegal move; the bomb reducer
 *    rolls it into a team strike and re-arms. On a strike the light does NOT move
 *    (position unchanged) — the strike is the only effect (AC2).
 *  - Off-grid = strike, exactly like an interior wall: both fail the single
 *    canMove check (the outer boundary is a line you cannot cross — KTANE-faithful).
 *  - MODULE_RESET (forwarded whole by the bomb reducer, bypassing its
 *    solved-inert guard) re-arms: position back to `start`.
 *  - No Date.now(), no Math.random(), no I/O.
 *
 * Move legality is recomputed from MAZE_LAYOUTS every MOVE (via canMove) — no
 * stored path, no "next correct move" (wires AI1).
 */
export const mazesReducer: Reducer<ModuleState<MazesState>, unknown> = (state, action) => {
  if (!isMazesAction(action)) return state; // guard: malformed/unknown → no-op

  if (action.type === 'MODULE_RESET') {
    const { start, position } = state.data;
    // Return the same object if already at spawn (no needless alloc).
    if (position.x === start.x && position.y === start.y && state.status === 'armed') {
      return state;
    }
    return { ...state, status: 'armed', data: { ...state.data, position: start } };
  }

  // Defense-in-depth: the bomb reducer keeps solved modules inert, but the module
  // reducer must be safe standalone (the sandbox runs it directly).
  if (state.status === 'solved') return state;

  // MOVE — illegal (wall or off-grid) strikes; the light stays put (AC2).
  const { mazeId, position, target } = state.data;
  if (!canMove(mazeId, position, action.direction)) {
    return { ...state, status: 'struck' };
  }

  const next = neighbor(position, action.direction);
  const solved = next.x === target.x && next.y === target.y;
  return {
    ...state,
    status: solved ? 'solved' : 'armed',
    data: { ...state.data, position: next },
  };
};
