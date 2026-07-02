import type { ManualPage, ManualSection } from '../../types/index.js';
import { SIMON_SAYS_MODULE_ID, SIMON_COLORS, SIMON_COLOR_LABELS, type SimonColor } from './types.js';
import { SIMON_TABLES, type SimonRow, type SimonStrikeRow } from './solve.js';

const capitalize = (word: string): string => word[0].toUpperCase() + word.slice(1);

/** One "flashed → press" table for a given strike row, columns in SIMON_COLORS order. */
function rowSection(heading: string, row: SimonRow): ManualSection {
  return {
    heading,
    content: '',
    table: {
      headers: ['Flashed', 'Press'],
      rows: SIMON_COLORS.map((flash: SimonColor) => [capitalize(flash), capitalize(row[flash])]),
    },
  };
}

const STRIKE_HEADINGS: Readonly<Record<SimonStrikeRow, string>> = {
  0: 'No strikes',
  1: '1 strike',
  2: '2 strikes',
};

/**
 * Structured manual content — NEVER raw HTML or untyped JSX (project rule). Both
 * translation tables render from SIMON_TABLES, the exact constant simonTranslate()
 * reads: the Expert's manual and the solver that judges the press cannot diverge.
 */
export function getSimonSaysManualPages(): ManualPage[] {
  const strikeRows: SimonStrikeRow[] = [0, 1, 2];

  return [
    {
      chapterId: SIMON_SAYS_MODULE_ID,
      chapterTitle: 'Simon Says',
      sections: [
        {
          content:
            'The module flashes a growing sequence of coloured buttons. Translate ' +
            'each flash to the colour you must press using the correct table below, ' +
            'then press them in order. Enter the whole sequence correctly and it ' +
            'grows by one flash; complete the final flash to disarm. A wrong press ' +
            'is a strike and the sequence replays from the start.',
        },
        {
          content:
            'Choose the table by the serial number: use Table A if the serial ' +
            'CONTAINS a vowel (A, E, I, O, U), otherwise Table B. Within that table, ' +
            'read the row for the current number of strikes on the bomb (0, 1 or 2) ' +
            '— the mapping changes as you accumulate strikes.',
        },
        {
          heading: 'Table A — serial contains a vowel',
          content: '',
        },
        ...strikeRows.map((s) => rowSection(`Table A · ${STRIKE_HEADINGS[s]}`, SIMON_TABLES.A[s])),
        {
          heading: 'Table B — serial has no vowel',
          content: '',
        },
        ...strikeRows.map((s) => rowSection(`Table B · ${STRIKE_HEADINGS[s]}`, SIMON_TABLES.B[s])),
        {
          heading: 'Confirming colours',
          content:
            'Every button carries a printed letter label, so colour is never the ' +
            'only signal. If a colour is in doubt, have the Defuser read the letter ' +
            'aloud.',
          table: {
            headers: ['Label', 'Colour'],
            rows: SIMON_COLORS.map((color) => [SIMON_COLOR_LABELS[color], capitalize(color)]),
          },
        },
      ],
    },
  ];
}
