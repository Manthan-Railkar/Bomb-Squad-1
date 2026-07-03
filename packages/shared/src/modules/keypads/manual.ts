import type { Locale, ManualPage } from '../../types/index.js';
import { KEYPADS_MODULE_ID, KEYPAD_COLUMNS, KEYPAD_SYMBOL_GLYPHS, SYMBOLS_PER_COLUMN } from './types.js';

/** Locale-keyed prose. Table row values (symbol glyphs) are locale-invariant. */
const TEXT = {
  en: {
    title: 'Keypads',
    intro:
      'Find the ONE column below that contains all four symbols on your ' +
      'keypad, then press the four buttons in the order their symbols appear ' +
      'from top to bottom in that column. A press out of order records a ' +
      'strike; your correct presses so far are kept, so you can keep going.',
    cols: ['Col 1', 'Col 2', 'Col 3', 'Col 4', 'Col 5', 'Col 6'],
  },
  zh: {
    title: '按键板 (Keypads)',
    intro:
      '在下表中找到唯一同时包含你按键板上全部四个符号的那一列，然后按照这四个' +
      '符号在该列中从上到下出现的顺序依次按下四个按钮。顺序按错会记一次失误' +
      '(strike)，但已按对的部分会保留，可以继续完成。',
    cols: ['第1列', '第2列', '第3列', '第4列', '第5列', '第6列'],
  },
} as const;

/**
 * Structured manual content — NEVER raw HTML or untyped JSX (project rule). The
 * six-column reference table renders from the exact KEYPAD_COLUMNS constant the
 * solver reads, so the manual the Expert reads and the logic that judges a press
 * order cannot diverge. Cells render each symbol's glyph (a rendering concern);
 * the manual test asserts the table reconstructs KEYPAD_COLUMNS exactly.
 */
export function getKeypadsManualPages(locale: Locale = 'en'): ManualPage[] {
  const t = TEXT[locale];
  // One table row per top-to-bottom position; one column per reference column.
  // The shared manual viewer (PageRenderer) right-aligns the LAST cell of every
  // row (its "action/answer" column, load-bearing for wires/the-button/passwords
  // — do NOT change it). This six-column grid is symmetric, so we append a
  // trailing empty spacer column that absorbs that right-align rule, leaving all
  // six reference columns left-aligned under their headers.
  const rows: string[][] = [];
  for (let r = 0; r < SYMBOLS_PER_COLUMN; r++) {
    rows.push([...KEYPAD_COLUMNS.map((col) => KEYPAD_SYMBOL_GLYPHS[col[r]].glyph), '']);
  }

  return [
    {
      chapterId: KEYPADS_MODULE_ID,
      chapterTitle: t.title,
      sections: [
        {
          content: t.intro,
          table: {
            headers: [...t.cols, ''],
            rows,
          },
        },
      ],
    },
  ];
}
