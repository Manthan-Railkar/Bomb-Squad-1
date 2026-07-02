import type { ManualPage, ManualSection } from '../../types/index.js';
import { MORSE_CODE_MODULE_ID, MORSE_WORDS, formatMorseFrequency, type MorseWord } from './types.js';
import { MORSE_ALPHABET, MORSE_TABLE } from './solve.js';

/**
 * Structured manual content — NEVER raw HTML or untyped JSX (project rule). Both
 * tables render from the SAME constants the solver reads (MORSE_ALPHABET,
 * MORSE_TABLE): the Expert's manual and the code that judges TX cannot diverge.
 * The manual system is text-only (ManualTable = headers + string[][]), so
 * dots/dashes render as '.' / '-' characters, no images.
 */

/**
 * Morse chart (A–Z, 0–9) rendered from MORSE_ALPHABET — never a 2nd copy. Laid
 * out in TWO side-by-side character/code column pairs (mirroring the printed
 * manual, docs/…v1.pdf p.12) so the 36 entries render as a compact 18-row block
 * instead of a tall single-column ribbon.
 */
function alphabetTable(): ManualSection {
  // Explicit A–Z then 0–9 order (JS would otherwise list the digit keys first);
  // matches the printed manual's reading order.
  const chars = [...'abcdefghijklmnopqrstuvwxyz0123456789'];
  const half = Math.ceil(chars.length / 2); // 18
  const rows: string[][] = [];
  for (let r = 0; r < half; r++) {
    const lch = chars[r];
    const rch = chars[r + half];
    rows.push([
      lch.toUpperCase(),
      MORSE_ALPHABET[lch],
      rch ? rch.toUpperCase() : '',
      rch ? MORSE_ALPHABET[rch] : '',
    ]);
  }
  return {
    heading: 'International Morse Code',
    content: '',
    table: {
      headers: ['Character', 'Code', 'Character', 'Code'],
      rows,
    },
  };
}

/** Word → frequency rows rendered from MORSE_TABLE via formatMorseFrequency. */
function frequencyTable(): ManualSection {
  return {
    heading: 'Word → Frequency',
    content: '',
    table: {
      headers: ['If the word is', 'Respond at frequency'],
      // MORSE_WORDS is in ascending-frequency order — render it as-is.
      rows: MORSE_WORDS.map((word: MorseWord) => [word, formatMorseFrequency(MORSE_TABLE[word])]),
    },
  };
}

export function getMorseCodeManualPages(): ManualPage[] {
  return [
    {
      chapterId: MORSE_CODE_MODULE_ID,
      chapterTitle: 'Morse Code',
      sections: [
        {
          content:
            'A short flash is a dot; a long flash is a dash. A long gap separates ' +
            'letters and a very long gap marks the end of the word before it loops. ' +
            'Decode the ENTIRE word, then look up its frequency below — the lookup ' +
            'is by whole word, NOT letter by letter. Tip: some words differ only in ' +
            'their first letters (slick / trick / brick / flick), so use the long ' +
            'repeat-gap to find where the word starts.',
        },
        alphabetTable(),
        frequencyTable(),
      ],
    },
  ];
}
