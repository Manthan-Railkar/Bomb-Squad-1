import type { ModuleState, Reducer } from '../../types/index.js';
import { isMorseCodeAction, MORSE_FREQUENCIES, type MorseCodeState } from './types.js';
import { correctFreqIndex } from './solve.js';

/**
 * Pure reducer for the morse-code module — the simplest Hard-module reducer: a
 * clamped counter (the dial) plus one equality check (TX).
 *
 * Contract obligations (project-context Testing Rules):
 * - Actions arrive as `unknown` (untrusted client input) — guard, never throw.
 *   The guard tolerates the module-agnostic `strikeCount` field the
 *   MODULE_INTERACT handler stamps on every action; the reducer ignores it.
 * - Never mutate input state; return new objects via spread.
 * - 'struck' is TRANSIENT: a wrong TX returns it to signal a strike; the bomb
 *   reducer rolls it into a team strike and re-arms, PRESERVING the returned
 *   `data` (bombReducer.ts:29-33). The dial is returned unchanged, so a wrong TX
 *   leaves the dial exactly where it was — Morse has no progress to reset
 *   (contrast Memory's reset-to-stage-1).
 * - The dial CLAMPS at both ends (indices 0 / 15): an at-bound step returns the
 *   same state ref (idempotent no-op, never a strike). No wrap.
 * - Solved-inert: actions on a solved module are no-ops (defense-in-depth — the
 *   sandbox runs the reducer standalone).
 * - MODULE_RESET (forwarded whole by the bomb reducer, bypassing its solved-inert
 *   guard) restores the initial dial position; the transmitted `word` is fixed at
 *   generate and never changes (deterministic replay, same rationale as Memory).
 * - No Date.now(), no Math.random(), no I/O. The answer (the correct frequency)
 *   is recomputed from the word via correctFreqIndex — never stored in state.
 */
export const morseCodeReducer: Reducer<ModuleState<MorseCodeState>, unknown> = (state, action) => {
  if (!isMorseCodeAction(action)) return state; // guard: malformed/unknown → no-op

  const { data } = state;

  if (action.type === 'MODULE_RESET') {
    // Already at the reset position → avoid a needless new object.
    if (state.status === 'armed' && data.freqIndex === data.initialFreqIndex) return state;
    return { ...state, status: 'armed', data: { ...data, freqIndex: data.initialFreqIndex } };
  }

  // Defense-in-depth: the bomb reducer keeps solved modules inert, but the
  // module reducer must be safe standalone (the sandbox runs it directly).
  if (state.status === 'solved') return state;

  if (action.type === 'FREQ_UP') {
    // Range clamp (not ===): an out-of-band freqIndex in corrupted persisted
    // state must not walk past the dial — the at/over-bound step is a no-op.
    if (data.freqIndex >= MORSE_FREQUENCIES.length - 1) return state; // clamp at top (same ref)
    return { ...state, status: 'armed', data: { ...data, freqIndex: data.freqIndex + 1 } };
  }

  if (action.type === 'FREQ_DOWN') {
    if (data.freqIndex <= 0) return state; // clamp at bottom (same ref)
    return { ...state, status: 'armed', data: { ...data, freqIndex: data.freqIndex - 1 } };
  }

  // TX: transmit at the current dial position.
  if (data.freqIndex === correctFreqIndex(data.word)) {
    return { ...state, status: 'solved', data };
  }
  // Wrong frequency → transient strike, dial PRESERVED (data returned as-is).
  return { ...state, status: 'struck', data };
};
