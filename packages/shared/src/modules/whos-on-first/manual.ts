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
  // These are reference lookup tables, not action/answer tables: both columns
  // are read left-to-right, so each table opts its last column out of the
  // viewer's right-align rule (`rightAlignLastColumn: false`, Story TD-9) — the
  // real columns stay left-aligned under their headers with no faked spacer.
  // Both tables also opt OUT of colour-word emphasis (`emphasizeColorWords:
  // false`): in the spelling-discrimination cluster (RED vs READ/REED/LEED) the
  // colourblind floor forbids colour as a cue, so tinting only RED is a false
  // signal — the WORD is the signal, not its ink.

  // Step 1 — one row per display word: [display, position name]. The blank
  // display renders as '(blank)'.
  const step1Rows: string[][] = DISPLAY_WORDS.map((word) => [
    word === '' ? '(blank)' : word,
    POSITION_NAMES[DISPLAY_POSITIONS[word]],
  ]);

  // Step 2 — one row per button label: [label, comma-joined priority list].
  const step2Rows: string[][] = WOF_BUTTON_LABELS.map((label) => [label, LABEL_PRIORITIES[label].join(', ')]);

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
          table: {
            headers: ['Display', 'Button to read'],
            rows: step1Rows,
            rightAlignLastColumn: false,
            emphasizeColorWords: false,
          },
        },
        {
          heading: 'Step 2 — press a button',
          content:
            'Using the label you just read, find its row below and press the FIRST ' +
            'word in the list that appears on any of the six buttons. A wrong press ' +
            'records a strike; the puzzle is unchanged, so you can try again.',
          table: {
            headers: ['Label', 'Press the first of these that appears'],
            rows: step2Rows,
            rightAlignLastColumn: false,
            emphasizeColorWords: false,
          },
        },
      ],
    },
  ];
}
