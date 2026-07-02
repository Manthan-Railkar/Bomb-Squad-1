import { KEYPAD_COLUMNS, type KeypadsState, type SymbolId } from './types.js';

/**
 * Pure solver helpers — all read the single shared KEYPAD_COLUMNS constant, so
 * the generator's uniqueness check, the reducer's press-order validation, and
 * the manual cannot disagree about the reference table or the press order.
 */

/** True iff every symbol in `keys` appears somewhere in reference column `col`. */
function columnContainsAll(col: ReadonlyArray<SymbolId>, keys: ReadonlyArray<SymbolId>): boolean {
  return keys.every((k) => col.includes(k));
}

/**
 * How many of the six reference columns contain ALL four key symbols. Generation
 * requires this to be EXACTLY 1 (AC1: the solution — and thus the press order —
 * is unambiguous). Pure and CPU-cheap (6 columns × 7 symbols).
 */
export function countContainingColumns(keys: ReadonlyArray<SymbolId>): number {
  let count = 0;
  for (const col of KEYPAD_COLUMNS) {
    if (columnContainsAll(col, keys)) count++;
  }
  return count;
}

/**
 * The index of the UNIQUE reference column containing all four key symbols, or
 * -1 if there is not exactly one (a malformed instance — never produced by
 * generate, which enforces uniqueness). No answer is stored: this is recomputed
 * from the public column table each time.
 */
export function solutionColumn(keys: ReadonlyArray<SymbolId>): number {
  let found = -1;
  for (let c = 0; c < KEYPAD_COLUMNS.length; c++) {
    if (columnContainsAll(KEYPAD_COLUMNS[c], keys)) {
      if (found !== -1) return -1; // more than one containing column → ambiguous
      found = c;
    }
  }
  return found;
}

/**
 * The correct press sequence as GRID indices: the four grid positions ordered by
 * where each one's symbol sits top-to-bottom in the unique solution column.
 * Returns [] for a malformed (non-unique) instance.
 */
export function solutionOrder(keys: ReadonlyArray<SymbolId>): number[] {
  const col = solutionColumn(keys);
  if (col === -1) return [];
  const column = KEYPAD_COLUMNS[col];
  // Grid indices sorted by their symbol's top-to-bottom row in the column.
  return keys
    .map((_, gridIndex) => gridIndex)
    .sort((a, b) => column.indexOf(keys[a]) - column.indexOf(keys[b]));
}

/**
 * Is `keyIndex` the next expected grid index for a state mid-solve — i.e. does
 * it match `solutionOrder[pressed.length]`? Pure helper shared by the reducer.
 */
export function isNextCorrect(state: KeypadsState, keyIndex: number): boolean {
  return solutionOrder(state.keys)[state.pressed.length] === keyIndex;
}
