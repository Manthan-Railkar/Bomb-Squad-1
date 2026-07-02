import type { ModuleState, Reducer } from '../../types/index.js';
import {
  isMemoryAction,
  MEMORY_STAGE_COUNT,
  type MemoryDigit,
  type MemoryPress,
  type MemoryState,
} from './types.js';
import { solveMemory } from './solve.js';

/**
 * Pure reducer for the memory module.
 *
 * Contract obligations (project-context Testing Rules):
 * - Actions arrive as `unknown` (untrusted client input) — guard, never throw.
 * - Never mutate input state; return new objects via spread.
 * - 'struck' is TRANSIENT: returned to signal a wrong press; the bomb reducer
 *   rolls it into a team strike and re-arms the module. THE CRUX (AC #3): a wrong
 *   press also RESETS the module to stage 1 with the history cleared — the whole
 *   sequence restarts, not just the current stage. The bomb reducer preserves the
 *   returned `data`, so the reset sticks after the strike roll-up.
 * - SEQUENTIAL PROGRESS: a correct press records {position,label} and advances the
 *   stage; the correct press on stage MEMORY_STAGE_COUNT SOLVES.
 * - Solved-inert: actions on a solved module are no-ops (defense-in-depth — the
 *   sandbox runs the reducer standalone).
 * - MODULE_RESET (forwarded whole by the bomb reducer, bypassing its solved-inert
 *   guard) restores stage 1 / empty history; the fixed stages are unchanged.
 * - No Date.now(), no Math.random(), no I/O. The correct button is recomputed from
 *   the rule table + history via solveMemory — no pre-computed answer in state.
 */
export const memoryReducer: Reducer<ModuleState<MemoryState>, unknown> = (state, action) => {
  if (!isMemoryAction(action)) return state; // guard: malformed/unknown → no-op

  if (action.type === 'MODULE_RESET') {
    // Already in the reset shape → avoid a needless new object.
    if (state.status === 'armed' && state.data.stage === 1 && state.data.history.length === 0) {
      return state;
    }
    return { ...state, status: 'armed', data: { ...state.data, stage: 1, history: [] } };
  }

  // Defense-in-depth: the bomb reducer keeps solved modules inert, but the
  // module reducer must be safe standalone (the sandbox runs it directly).
  if (state.status === 'solved') return state;

  const { position } = action;
  if (!Number.isInteger(position) || position < 1 || position > 4) return state; // bounds guard

  const { stages, stage, history } = state.data;
  const current = stages[stage - 1];
  const correct = solveMemory(current, stage, history);

  if (position !== correct) {
    // Wrong press → transient strike AND full reset to stage 1 (clear history).
    return { ...state, status: 'struck', data: { ...state.data, stage: 1, history: [] } };
  }

  // Correct: record BOTH the position and the label on that button.
  const press: MemoryPress = {
    position: position as MemoryDigit,
    label: current.labels[position - 1],
  };
  const nextHistory = [...history, press];

  if (stage >= MEMORY_STAGE_COUNT) {
    // Final stage completed → disarmed.
    return { ...state, status: 'solved', data: { ...state.data, history: nextHistory } };
  }
  // Advance to the next stage, still armed.
  return { ...state, status: 'armed', data: { ...state.data, stage: stage + 1, history: nextHistory } };
};
