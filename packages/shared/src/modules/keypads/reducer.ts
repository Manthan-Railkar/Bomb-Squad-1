import type { ModuleState, Reducer } from '../../types/index.js';
import { isKeypadsAction, KEY_COUNT, type KeypadsState } from './types.js';
import { isNextCorrect, solutionOrder } from './solve.js';

/**
 * Pure reducer for the Keypads module.
 *
 *  - PRESS → if `keyIndex` is the next expected grid index in the solution order
 *    (solutionOrder[pressed.length]), append it; when all four are pressed →
 *    solved. A press that is not the next expected index → strike. On a strike
 *    `pressed` is left UNCHANGED so the team keeps their correct progress and
 *    retries (mirror passwords' columns-unchanged-on-strike). An already-pressed
 *    index is a no-op (idempotent), not a strike.
 *
 * No stored answer: the expected order is recomputed from the public
 * KEYPAD_COLUMNS each PRESS (wires AI1). Nothing secret rides in state.
 *
 * Contract obligations (project-context Testing Rules):
 *  - Actions arrive as `unknown` (untrusted) — guard, never throw. Out-of-bounds
 *    / NaN keyIndex falls through unchanged.
 *  - Never mutate input state; return new objects via spread/map.
 *  - 'struck' is TRANSIENT: the bomb reducer rolls it into a team strike and
 *    re-arms the module (4.3/5.3 roll-up contract).
 *  - solved-inert: PRESS on a solved module is a no-op. MODULE_RESET is the one
 *    deliberate exception (forwarded whole, bypassing the bomb reducer's solved
 *    guard — the passwords template's semantics): it re-arms even a solved
 *    module and clears `pressed` back to the generated start (empty).
 *  - No Date.now(), no Math.random(), no I/O — Keypads has no time dependency.
 */
export const keypadsReducer: Reducer<ModuleState<KeypadsState>, unknown> = (state, action) => {
  if (!isKeypadsAction(action)) return state; // guard: malformed/unknown action → no-op

  if (action.type === 'MODULE_RESET') {
    return state.status === 'armed' && state.data.pressed.length === 0
      ? state // already in the reset shape — avoid a needless new object
      : { ...state, status: 'armed', data: { ...state.data, pressed: [] } };
  }

  // Defense-in-depth: the bomb reducer keeps solved modules inert, but the
  // module reducer must be safe standalone (the sandbox runs it directly).
  if (state.status === 'solved') return state;

  const { keyIndex } = action;
  // Bounds/NaN guard: untrusted client input (project-context security rule).
  if (!Number.isInteger(keyIndex) || keyIndex < 0 || keyIndex >= KEY_COUNT) {
    return state;
  }

  // Pressing an already-correct button again is a no-op (idempotent), never a
  // strike — the button is already lit.
  if (state.data.pressed.includes(keyIndex)) return state;

  // Recompute the expected press order from the public column table (no stored
  // answer). A malformed state whose keys don't resolve to exactly one column
  // (never produced by generate — corrupted/persisted state, future data edits)
  // yields an empty order; treat it as inert rather than striking every press
  // forever (an unsolvable strike faucet MODULE_RESET couldn't cure).
  if (solutionOrder(state.data.keys).length !== KEY_COUNT) return state;
  if (!isNextCorrect(state.data, keyIndex)) {
    return { ...state, status: 'struck' }; // wrong order → strike, progress preserved
  }

  const pressed = [...state.data.pressed, keyIndex];
  const solved = pressed.length === KEY_COUNT;
  return { ...state, status: solved ? 'solved' : 'armed', data: { ...state.data, pressed } };
};
