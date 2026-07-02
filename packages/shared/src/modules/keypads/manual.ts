import type { ManualPage } from '../../types/index.js';
import { KEYPADS_MODULE_ID, KEYPAD_COLUMNS, KEYPAD_SYMBOL_GLYPHS, SYMBOLS_PER_COLUMN } from './types.js';

/**
 * Structured manual content — NEVER raw HTML or untyped JSX (project rule). The
 * six-column reference table renders from the exact KEYPAD_COLUMNS constant the
 * solver reads, so the manual the Expert reads and the logic that judges a press
 * order cannot diverge. Cells render each symbol's glyph (a rendering concern);
 * the manual test asserts the table reconstructs KEYPAD_COLUMNS exactly.
 */
export function getKeypadsManualPages(): ManualPage[] {
  // One table row per top-to-bottom position; one column per reference column.
  // This six-column grid is symmetric (no action/answer column), so the table
  // opts its last column out of the viewer's right-align rule
  // (`rightAlignLastColumn: false`, Story TD-9) — all six reference columns stay
  // left-aligned under their headers with no faked trailing spacer column.
  const rows: string[][] = [];
  for (let r = 0; r < SYMBOLS_PER_COLUMN; r++) {
    rows.push(KEYPAD_COLUMNS.map((col) => KEYPAD_SYMBOL_GLYPHS[col[r]].glyph));
  }

  return [
    {
      chapterId: KEYPADS_MODULE_ID,
      chapterTitle: 'Keypads',
      sections: [
        {
          content:
            'Find the ONE column below that contains all four symbols on your ' +
            'keypad, then press the four buttons in the order their symbols appear ' +
            'from top to bottom in that column. A press out of order records a ' +
            'strike; your correct presses so far are kept, so you can keep going.',
          table: {
            headers: ['Col 1', 'Col 2', 'Col 3', 'Col 4', 'Col 5', 'Col 6'],
            rows,
            rightAlignLastColumn: false,
          },
        },
      ],
    },
  ];
}
