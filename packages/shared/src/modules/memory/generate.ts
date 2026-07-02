import type { BombContext } from '../../types/index.js';
import { makeSeededRng } from '../../seeding/index.js';
import {
  MEMORY_DIGITS,
  MEMORY_STAGE_COUNT,
  type MemoryDigit,
  type MemoryStage,
  type MemoryState,
} from './types.js';

/**
 * Pure, seeded instance generator — the ONLY place randomness is allowed in a
 * module, and only via makeSeededRng (Math.random is banned project-wide).
 *
 * All five stages' display digit + button layout are fixed HERE, from the seed
 * alone. In the original game the display re-rolls each time you (re-)enter a
 * stage; a pure reducer cannot re-randomise at reduce-time, so we fix the stages
 * at generation and REPLAY them from stage 1 on a reset. The memory challenge is
 * preserved (reproduce the correct sequence) and the module stays fully
 * deterministic per (seed) — required for per-team fairness and testing.
 *
 * `ctx` is unused: Memory's rules depend on neither the serial nor the strike
 * count. No answer is computed or stored — the correct button is recomputed by
 * solveMemory() at press-time from the rule table + press history.
 */
export function generateMemory(seed: number, _ctx: BombContext): MemoryState {
  const rng = makeSeededRng(seed); // asserts non-negative integer seed
  const stages: MemoryStage[] = Array.from({ length: MEMORY_STAGE_COUNT }, () => ({
    display: MEMORY_DIGITS[Math.floor(rng() * MEMORY_DIGITS.length)],
    labels: shuffleDigits(rng),
  }));
  return { stages, stage: 1, history: [] };
}

/** Fisher–Yates permutation of [1,2,3,4] driven by the seeded RNG. */
function shuffleDigits(rng: () => number): MemoryDigit[] {
  const a: MemoryDigit[] = [...MEMORY_DIGITS];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
