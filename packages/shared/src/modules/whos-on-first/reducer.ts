import type { ModuleState, Reducer } from '../../types/index.js';
import { isWhosOnFirstAction, BUTTON_COUNT, type WhosOnFirstState } from './types.js';
import { solutionIndex } from './solve.js';

/**
 * Pure reducer for the Who's on First module.
 *
 *  - PRESS → if `buttonIndex` is the module's solution press (recomputed from the
 *    public display + labels + tables), → solved; any other button → strike. The
 *    board (`display`/`labels`) is left UNCHANGED on a strike so the team retries
 *    the same puzzle (mirror keypads/passwords). Single press disarms.
 *
 * No stored answer: the solution is recomputed each PRESS from the public tables
 * (wires AI1). Nothing secret rides in state.
 *
 * Contract obligations (project-context Testing Rules):
 *  - Actions arrive as `unknown` (untrusted) — guard, never throw. Out-of-bounds
 *    / NaN / non-integer buttonIndex falls through unchanged.
 *  - Never mutate input state; return new objects via spread.
 *  - 'struck' is TRANSIENT: the bomb reducer rolls it into a team strike and
 *    re-arms the module (4.3/5.3 roll-up contract).
 *  - solved-inert: actions on a solved module are no-ops.
 *  - MODULE_RESET (forwarded whole, bypassing the bomb reducer's solved guard)
 *    re-arms with the same board — Who's on First has no mutable sub-state to
 *    restore (a press never changes the board), so reset is just status→armed.
 *  - No Date.now(), no Math.random(), no I/O — no time dependency.
 */
export const whosOnFirstReducer: Reducer<ModuleState<WhosOnFirstState>, unknown> = (state, action) => {
  if (!isWhosOnFirstAction(action)) return state; // guard: malformed/unknown action → no-op

  if (action.type === 'MODULE_RESET') {
    return state.status === 'armed'
      ? state // already armed with its board intact — avoid a needless new object
      : { ...state, status: 'armed' };
  }

  // Defense-in-depth: the bomb reducer keeps solved modules inert, but the
  // module reducer must be safe standalone (the sandbox runs it directly).
  if (state.status === 'solved') return state;

  const { buttonIndex } = action;
  // Bounds/NaN guard: untrusted client input (project-context security rule).
  if (!Number.isInteger(buttonIndex) || buttonIndex < 0 || buttonIndex >= BUTTON_COUNT) {
    return state;
  }

  // Recompute the solution from the public tables (no stored answer). A
  // malformed instance with no solution (unknown display / short labels / no
  // list word on the board — never produced by generate) is treated as inert
  // rather than striking every press forever (an unsolvable strike faucet
  // MODULE_RESET couldn't cure — mirror keypads' malformed-state guard).
  const sol = solutionIndex(state.data);
  if (sol === -1) return state;
  return buttonIndex === sol
    ? { ...state, status: 'solved' }
    : { ...state, status: 'struck' }; // wrong button → strike, board preserved
};
