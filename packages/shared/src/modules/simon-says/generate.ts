import type { BombContext } from '../../types/index.js';
import { makeSeededRng } from '../../seeding/index.js';
import { SIMON_COLORS, SIMON_SEQUENCE_LENGTH, type SimonColor, type SimonSaysState } from './types.js';

/**
 * Pure, seeded instance generator — the ONLY place randomness is allowed in a
 * module, and only via makeSeededRng (Math.random is banned project-wide).
 * Synchronous and CPU-cheap (a fixed-length draw of single-colour picks).
 *
 * The flash `sequence` (length SIMON_SEQUENCE_LENGTH) comes from the seed alone.
 * No translation/answer is computed or stored here — the reducer recomputes the
 * expected press via simonTranslate(flash, ctx, strikes) at press-time from the
 * public ctx carried in state and the live strike count, so nothing secret
 * crosses to the client (Sprint 2 retro AI1). Any sequence is solvable (every
 * table cell has a defined mapping), so no generation constraint is needed.
 * BombContext is stored by reference, never mutated.
 */
export function generateSimonSays(seed: number, ctx: BombContext): SimonSaysState {
  const rng = makeSeededRng(seed); // asserts non-negative integer seed
  const sequence: SimonColor[] = Array.from(
    { length: SIMON_SEQUENCE_LENGTH },
    () => SIMON_COLORS[Math.floor(rng() * SIMON_COLORS.length)],
  );
  return { sequence, stage: 1, progress: 0, ctx };
}
