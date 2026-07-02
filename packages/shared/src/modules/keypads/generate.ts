import { makeSeededRng } from '../../seeding/index.js';
import { KEYPAD_COLUMNS, KEY_COUNT, SYMBOLS_PER_COLUMN, type KeypadsState, type SymbolId } from './types.js';
import { countContainingColumns } from './solve.js';

/**
 * Pure, seeded instance generator — the ONLY place randomness is allowed, and
 * only via makeSeededRng (Math.random is banned project-wide). Synchronous and
 * CPU-cheap (called for all modules at round start). `ctx` is unused — Keypads
 * has no bomb-context rule (same as generatePasswords(seed)).
 *
 * Algorithm:
 *  1. Pick a target column from the six (seeded).
 *  2. Choose 4 of its 7 symbols (seeded shuffle) — these are the four glyphs.
 *  3. Verify with countContainingColumns that EXACTLY ONE reference column
 *     contains all four (AC1). NOTE: with the canonical table no two columns
 *     share more than 3 symbols (< KEY_COUNT), so a 4-subset drawn from one
 *     column can never be contained in a second — this check never rejects
 *     today. It is a data-invariant firewall: a future column edit pushing a
 *     pairwise overlap to 4 would make ambiguity possible, and the pinned
 *     pairwise-overlap test in __tests__ fails loud before this loop ever has
 *     to save us. If not unique, re-pick target + subset from the SAME seeded
 *     stream and re-check. Deterministic given the seed.
 *  4. Place the four chosen symbols onto the four grid positions in a seeded
 *     random spatial arrangement — the on-screen 2×2 layout is independent of
 *     the solution order (which is derived from the column table, not position).
 *
 * The answer is NOT stored: `pressed` starts empty and each PRESS recomputes the
 * expected order from the public KEYPAD_COLUMNS (wires AI1 / passwords).
 */
export function generateKeypads(seed: number): KeypadsState {
  const rng = makeSeededRng(seed); // asserts non-negative integer seed
  const randInt = (n: number): number => Math.floor(rng() * n);

  // Fisher–Yates on the indices [0..SYMBOLS_PER_COLUMN), take the first KEY_COUNT.
  const chooseSubset = (column: ReadonlyArray<SymbolId>): SymbolId[] => {
    const idx = Array.from({ length: SYMBOLS_PER_COLUMN }, (_, i) => i);
    for (let i = SYMBOLS_PER_COLUMN - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx.slice(0, KEY_COUNT).map((i) => column[i]);
  };

  // Re-pick target column + 4-subset (deterministically, from the same stream)
  // until exactly one reference column contains all four. The cap is a safety
  // net only — most subsets are unique, so the first pick almost always wins.
  let chosen: SymbolId[] = [];
  for (let attempt = 0; attempt < 10000; attempt++) {
    const targetColumn = KEYPAD_COLUMNS[randInt(KEYPAD_COLUMNS.length)];
    chosen = chooseSubset(targetColumn);
    if (countContainingColumns(chosen) === 1) break;
  }

  /* istanbul ignore next -- unreachable: a unique 4-subset is found in a handful of tries */
  if (countContainingColumns(chosen) !== 1) {
    throw new Error('keypads: could not generate a unique-solution instance');
  }

  // Seeded spatial arrangement onto the 2×2 grid (independent of press order).
  const keys = [...chosen];
  for (let i = keys.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }

  return { keys, pressed: [] };
}
