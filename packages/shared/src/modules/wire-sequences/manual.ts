import type { ManualPage, ManualSection } from '../../types/index.js';
import {
  CUT_RULES,
  WIRE_SEQUENCES_MODULE_ID,
  WIRE_SEQ_COLORS,
  WIRE_SEQ_COLOR_LABELS,
  type WireSeqColor,
} from './types.js';

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

const COLOR_HEADINGS: Readonly<Record<WireSeqColor, string>> = {
  red: 'Red wire occurrences',
  blue: 'Blue wire occurrences',
  black: 'Black wire occurrences',
};

const capitalize = (word: string): string => word[0].toUpperCase() + word.slice(1);

/** "A", "A or C", "A, B or C" — the manual's natural-language answer cell. */
function formatLetters(letters: ReadonlyArray<string>): string {
  if (letters.length <= 1) return letters[0] ?? '';
  if (letters.length === 2) return `${letters[0]} or ${letters[1]}`;
  return `${letters.slice(0, -1).join(', ')} or ${letters[letters.length - 1]}`;
}

/**
 * Structured manual content — NEVER raw HTML or untyped JSX (project rule). The
 * three colour tables render from the exact CUT_RULES constant the reducer
 * reads, so the manual the Expert reads and the logic that judges a cut cannot
 * diverge (the manual test asserts the tables reconstruct CUT_RULES exactly).
 *
 * The shared PageRenderer right-aligns the LAST cell of every row (its
 * action/answer column). "Cut if connected to" is naturally that last cell here,
 * so — unlike keypads' symmetric grid — no trailing spacer column is needed.
 */
export function getWireSequencesManualPages(): ManualPage[] {
  const colorSections: ManualSection[] = WIRE_SEQ_COLORS.map((color) => ({
    heading: COLOR_HEADINGS[color],
    content: '',
    table: {
      headers: ['Occurrence', 'Cut if connected to'],
      rows: CUT_RULES[color].map((letters, i) => [ORDINALS[i], formatLetters(letters)]),
    },
  }));

  return [
    {
      chapterId: WIRE_SEQUENCES_MODULE_ID,
      chapterTitle: 'Wire Sequences',
      sections: [
        {
          content:
            'Several panels of wires, only one visible at a time. Switch panels ' +
            'with the up (previous) and down (next) buttons. Wire occurrences are ' +
            'CUMULATIVE across ALL panels: for each wire, count how many wires of ' +
            'its colour have appeared so far in reading order (top to bottom, panel ' +
            'by panel — this wire included), then cut it only if its connection ' +
            'letter is listed for that colour and occurrence below. A severed wire ' +
            'cannot be un-cut.',
        },
        ...colorSections,
        {
          heading: 'Confirming colours',
          content:
            'Every wire carries a printed colour label, so colour is never the ' +
            'only signal. The labels are distinct from the A/B/C connection ' +
            'letters — if a colour is in doubt, read its label aloud.',
          table: {
            headers: ['Colour', 'Label'],
            rows: WIRE_SEQ_COLORS.map((color) => [capitalize(color), WIRE_SEQ_COLOR_LABELS[color]]),
          },
        },
      ],
    },
  ];
}
