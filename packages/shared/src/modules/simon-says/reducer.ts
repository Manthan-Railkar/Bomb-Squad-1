import type { ModuleState, Reducer } from '../../types/index.js';
import { isSimonSaysAction, type SimonSaysState } from './types.js';
import { simonTranslate, type SimonStrikeRow } from './solve.js';

/**
 * Pure reducer for the simon-says module.
 *
 * Contract obligations (project-context Testing Rules):
 * - Actions arrive as `unknown` (untrusted client input) — guard, never throw.
 * - Never mutate input state; return new objects via spread.
 * - 'struck' is TRANSIENT: returned to signal a wrong press; the bomb reducer
 *   rolls it into a team strike and re-arms the module. A wrong press resets the
 *   current-stage input to the start (progress → 0); the revealed `stage` is
 *   unchanged, so the Defuser replays the current stage from the beginning.
 * - GROWING SEQUENCE: entering all `stage` flashes correctly grows the reveal by
 *   one (stage+1, progress 0) until stage === sequence.length, at which point
 *   the final correct press SOLVES.
 * - Solved-inert: actions on a solved module are no-ops (defense-in-depth — the
 *   sandbox runs the reducer standalone).
 * - MODULE_RESET (forwarded whole by the bomb reducer, bypassing its
 *   solved-inert guard) restores stage 1 / progress 0; sequence + ctx unchanged.
 * - No Date.now(), no Math.random(), no I/O. The vowel table is read from the
 *   public ctx; the strike ROW comes from the action's server-stamped
 *   `strikeCount` — no pre-computed answer in module data.
 */
export const simonSaysReducer: Reducer<ModuleState<SimonSaysState>, unknown> = (state, action) => {
  if (!isSimonSaysAction(action)) return state; // guard: malformed/unknown → no-op

  if (action.type === 'MODULE_RESET') {
    // Already in the reset shape → avoid a needless new object.
    if (state.status === 'armed' && state.data.stage === 1 && state.data.progress === 0) {
      return state;
    }
    return { ...state, status: 'armed', data: { ...state.data, stage: 1, progress: 0 } };
  }

  // Defense-in-depth: the bomb reducer keeps solved modules inert, but the
  // module reducer must be safe standalone (the sandbox runs it directly).
  if (state.status === 'solved') return state;

  const { sequence, stage, progress, ctx } = state.data;

  // The strike row is bounded to 0–2 (a 3rd strike ends the round before any
  // further press). The server stamps the authoritative count; clamp defensively.
  const strikes = Math.max(0, Math.min(2, action.strikeCount)) as SimonStrikeRow;

  const flash = sequence[progress];
  const expected = simonTranslate(flash, ctx, strikes);

  if (action.color !== expected) {
    // Wrong press → transient strike; restart the current stage from the top.
    return { ...state, status: 'struck', data: { ...state.data, progress: 0 } };
  }

  const nextProgress = progress + 1;
  if (nextProgress < stage) {
    // Correct, mid-stage — advance the input pointer, still armed.
    return { ...state, status: 'armed', data: { ...state.data, progress: nextProgress } };
  }

  // Stage complete.
  if (stage >= sequence.length) {
    // Final stage completed → disarmed.
    return { ...state, status: 'solved', data: { ...state.data, progress: nextProgress } };
  }

  // Grow the revealed sequence by one and replay from the start.
  return { ...state, status: 'armed', data: { ...state.data, stage: stage + 1, progress: 0 } };
};
