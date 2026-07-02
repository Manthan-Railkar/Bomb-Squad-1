import { makeSeededRng } from '../../seeding/index.js';
import { BUTTON_COUNT, WOF_BUTTON_LABELS, DISPLAY_WORDS, type WhosOnFirstState } from './types.js';
import { solutionIndex } from './solve.js';

/**
 * Pure, seeded instance generator — the ONLY place randomness is allowed, and
 * only via makeSeededRng (Math.random is banned project-wide). Synchronous and
 * CPU-cheap (called for all modules at round start). `ctx` is unused — Who's on
 * First has no bomb-context rule (same as generateKeypads/generatePasswords).
 *
 * Algorithm:
 *  1. Pick a display word from the 28 (seeded).
 *  2. Pick SIX distinct button labels from the 28-word pool (seeded Fisher–Yates,
 *     take the first six).
 *
 * Solvability is STRUCTURAL, not by re-roll (unlike passwords/keypads): Step 1
 * maps the display to a position that always exists (6 buttons); the label there
 * is one of the six buttons and always appears in its own priority list, so a
 * first-match always exists. We assert solutionIndex is valid as a never-happens
 * safety net (a thrown round is debuggable; a silent unsolvable puzzle is not).
 *
 * The answer is NOT stored: each PRESS recomputes it from the public tables +
 * public display/labels (wires AI1 / keypads / passwords).
 */
export function generateWhosOnFirst(seed: number): WhosOnFirstState {
  const rng = makeSeededRng(seed); // asserts non-negative integer seed
  const randInt = (n: number): number => Math.floor(rng() * n);

  const display = DISPLAY_WORDS[randInt(DISPLAY_WORDS.length)];

  // Fisher–Yates over WOF_BUTTON_LABELS indices; take the first BUTTON_COUNT.
  const idx = Array.from({ length: WOF_BUTTON_LABELS.length }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const labels = idx.slice(0, BUTTON_COUNT).map((i) => WOF_BUTTON_LABELS[i]);

  const state: WhosOnFirstState = { display, labels };

  /* istanbul ignore next -- unreachable: the read label is always one of the six buttons */
  if (solutionIndex(state) === -1) {
    throw new Error('whos-on-first: generated an unsolvable instance');
  }

  return state;
}
