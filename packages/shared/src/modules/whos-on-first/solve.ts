import { DISPLAY_POSITIONS, LABEL_PRIORITIES, BUTTON_COUNT, type WhosOnFirstState } from './types.js';

/**
 * Pure solver helpers — all read the single shared DISPLAY_POSITIONS /
 * LABEL_PRIORITIES constants, so the generator's solvability check, the reducer's
 * press validation, and the manual cannot disagree about either table.
 *
 * No answer is stored: every helper recomputes from the public display + labels.
 */

/**
 * STEP 1 — the button position (0–5) to READ for `display`, or -1 for an unknown
 * display word (the generator only emits known words; the guard protects the
 * reducer's untrusted path).
 */
export function readPosition(display: string): number {
  return Object.prototype.hasOwnProperty.call(DISPLAY_POSITIONS, display) ? DISPLAY_POSITIONS[display] : -1;
}

/** The label at the Step-1 read position, or '' if the display/position is invalid. */
export function readLabel(state: WhosOnFirstState): string {
  const pos = readPosition(state.display);
  if (pos < 0 || pos >= state.labels.length) return '';
  return state.labels[pos];
}

/**
 * STEP 2 — the button index to press: the first word in the read label's priority
 * list that is present among the six buttons. Returns -1 for a malformed instance
 * (unknown display, or a read label with no priority list, or no list word on the
 * module) — never produced by generate, which guarantees a solution exists.
 */
export function solutionIndex(state: WhosOnFirstState): number {
  const label = readLabel(state);
  if (label === '') return -1;
  const list = LABEL_PRIORITIES[label];
  if (!list) return -1;
  for (const word of list) {
    const idx = state.labels.indexOf(word);
    if (idx !== -1) return idx;
  }
  return -1;
}

/** Is `buttonIndex` the module's solution press? Pure helper shared by the reducer. */
export function isCorrectPress(state: WhosOnFirstState, buttonIndex: number): boolean {
  const sol = solutionIndex(state);
  return sol !== -1 && sol === buttonIndex && buttonIndex < BUTTON_COUNT;
}
