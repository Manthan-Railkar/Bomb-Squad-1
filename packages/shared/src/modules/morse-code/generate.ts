import type { BombContext } from '../../types/index.js';
import { makeSeededRng } from '../../seeding/index.js';
import { MORSE_FREQUENCIES, MORSE_WORDS, type MorseCodeState } from './types.js';
import { correctFreqIndex } from './solve.js';

/**
 * Pure, seeded instance generator — the ONLY place randomness is allowed in a
 * module, and only via makeSeededRng (Math.random is banned project-wide).
 *
 * Draws the transmitted word uniformly from the 16 words, then a starting dial
 * position from the 15 NON-answer indices so the module is never born solved (a
 * blind TX at spawn can never disarm it — complicated-wires 7.1 precedent). The
 * skip-the-answer draw is index-shaped, so it needs no re-roll loop: pick one of
 * 15 slots and shift past the answer index. Everything is deterministic in the
 * seed — required for per-team fairness and replayable tests.
 *
 * `_ctx` is accepted for signature conformance, unused and not stored: Morse
 * Code's answer depends on neither the serial nor the strike count. No answer is
 * computed or stored — the correct frequency is recomputed at TX-time by the
 * reducer via correctFreqIndex(word).
 */
export function generateMorseCode(seed: number, _ctx: BombContext): MorseCodeState {
  const rng = makeSeededRng(seed); // asserts non-negative integer seed
  const word = MORSE_WORDS[Math.floor(rng() * MORSE_WORDS.length)];
  const answer = correctFreqIndex(word);
  // Draw from the 15 non-answer positions, then step past the answer index.
  const d = Math.floor(rng() * (MORSE_FREQUENCIES.length - 1));
  const start = d >= answer ? d + 1 : d;
  return { word, freqIndex: start, initialFreqIndex: start };
}
