import type { BombContext } from '../../types/index.js';
import type { SimonColor } from './types.js';

/**
 * The GDD Simon Says translation tables (gdd.md #Module 4 — the authoritative
 * source, verified identical to the KTANE manual p.8), encoded ONCE as data.
 * simonTranslate() looks a flash up in them; getSimonSaysManualPages() renders
 * the SAME constant — solver and manual are structurally incapable of diverging
 * (the wires/complicated-wires lesson: one shared rule source ⇒ both sides
 * provably agree).
 *
 * Table choice:
 *   A — the serial number CONTAINS a vowel (A/E/I/O/U).
 *   B — the serial number does NOT contain a vowel.
 * Row choice: the CURRENT team strike count (0 / 1 / 2). A bomb explodes on the
 * 3rd strike, so only rows 0–2 are ever selected.
 *
 * Each cell maps a FLASHED colour → the colour to PRESS.
 */

/** Strike-row index — bounded 0..2 (the 3rd strike ends the round). */
export type SimonStrikeRow = 0 | 1 | 2;

export type SimonRow = Readonly<Record<SimonColor, SimonColor>>;

export interface SimonTables {
  /** Serial CONTAINS a vowel. */
  readonly A: Readonly<Record<SimonStrikeRow, SimonRow>>;
  /** Serial does NOT contain a vowel. */
  readonly B: Readonly<Record<SimonStrikeRow, SimonRow>>;
}

/**
 * flashed → press. Transcribed VERBATIM from the GDD table (do not re-derive
 * from memory). Column order in the GDD is Red/Blue/Green/Yellow flash.
 */
export const SIMON_TABLES: SimonTables = {
  // Table A — serial CONTAINS a vowel.
  A: {
    0: { red: 'blue', blue: 'red', green: 'yellow', yellow: 'green' },
    1: { red: 'yellow', blue: 'green', green: 'blue', yellow: 'red' },
    2: { red: 'green', blue: 'red', green: 'yellow', yellow: 'blue' },
  },
  // Table B — serial does NOT contain a vowel.
  B: {
    0: { red: 'blue', blue: 'yellow', green: 'green', yellow: 'red' },
    1: { red: 'red', blue: 'blue', green: 'yellow', yellow: 'green' },
    2: { red: 'yellow', blue: 'green', green: 'blue', yellow: 'red' },
  },
};

/** True iff the serial number contains a vowel (A/E/I/O/U), case-insensitive. */
export function serialHasVowel(serial: string): boolean {
  return /[AEIOU]/i.test(serial);
}

/**
 * Pure translation: the colour to PRESS for a given FLASH under this bomb's
 * serial (vowel → Table A, else Table B) and the current strike count. Total —
 * every colour appears in every row.
 */
export function simonTranslate(
  flash: SimonColor,
  ctx: BombContext,
  strikes: SimonStrikeRow,
): SimonColor {
  const table = serialHasVowel(ctx.serialNumber) ? SIMON_TABLES.A : SIMON_TABLES.B;
  return table[strikes][flash];
}
