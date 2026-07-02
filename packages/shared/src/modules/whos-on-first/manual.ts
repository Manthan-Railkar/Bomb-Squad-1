import type { ManualPage } from '../../types/index.js';
import { WHOS_ON_FIRST_MODULE_ID, DISPLAY_POSITIONS, DISPLAY_WORDS, LABEL_PRIORITIES, WOF_BUTTON_LABELS, POSITION_NAMES } from './types.js';

/**
 * Structured manual content — NEVER raw HTML or untyped JSX (project rule). Both
 * tables render from the exact DISPLAY_POSITIONS / LABEL_PRIORITIES constants the
 * solver reads, so the manual the Expert reads and the logic that judges a press
 * cannot diverge (the manual test reconstructs both tables from the render).
 *
 * Step 1: display word → the button position to READ.
 * Step 2: the read label → the priority list (press the first list word present).
 */
export function getWhosOnFirstManualPages(): ManualPage[] {
  // PageRenderer right-aligns the LAST cell of every row (its "action/answer"
  // column — load-bearing for wires/the-button/passwords), while headers stay
  // left-aligned. A two-column table would therefore misalign its answer column
  // from its header. As in keypads, append a trailing empty SPACER column that
  // absorbs the right-align rule, leaving the real columns left-aligned under
  // their headers. (Deferred: a proper alignment field on ManualTable —
  // deferred-work.md, out of this story's scope.)

  // Step 1 — one row per display word: [display, position name, spacer]. The
  // blank display renders as '(blank)'.
  const step1Rows: string[][] = DISPLAY_WORDS.map((word) => [
    word === '' ? '(blank)' : word,
    POSITION_NAMES[DISPLAY_POSITIONS[word]],
    '',
  ]);

  // Step 2 — one row per button label: [label, comma-joined priority list, spacer].
  const step2Rows: string[][] = WOF_BUTTON_LABELS.map((label) => [label, LABEL_PRIORITIES[label].join(', '), '']);

  return [
    {
      chapterId: WHOS_ON_FIRST_MODULE_ID,
      chapterTitle: "Who's on First",
      sections: [
        {
          heading: 'Step 1 — read the display',
          content:
            'Find the word shown on the display in the table below; it tells you ' +
            'which button position to READ. Note the label printed on that button ' +
            'and go to Step 2.',
          table: { headers: ['Display', 'Button to read', ''], rows: step1Rows },
        },
        {
          heading: 'Step 2 — press a button',
          content:
            'Using the label you just read, find its row below and press the FIRST ' +
            'word in the list that appears on any of the six buttons. A wrong press ' +
            'records a strike; the puzzle is unchanged, so you can try again.',
          table: { headers: ['Label', 'Press the first of these that appears', ''], rows: step2Rows },
        },
      ],
    },
  ];
}
