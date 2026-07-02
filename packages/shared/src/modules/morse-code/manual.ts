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

/** Morse chart rows (A–Z, 0–9) rendered from MORSE_ALPHABET — never a 2nd copy. */
function alphabetTable(): ManualSection {
  return {
    heading: 'International Morse Code',
    content: '',
    table: {
      headers: ['Character', 'Code'],
      rows: Object.entries(MORSE_ALPHABET).map(([ch, code]) => [ch.toUpperCase(), code]),
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
            'A light on the module flashes a single WORD in Morse code, then loops. ' +
            'A short flash is a dot; a long flash is a dash. A short gap separates ' +
            'symbols within a letter; a longer gap separates letters; a very long ' +
            'gap marks the end of the word before it repeats. Decode the ENTIRE ' +
            'word first — then look it up below. The table maps a WORD to a ' +
            'frequency; it is NOT a letter-by-letter lookup.',
        },
        {
          content:
            'Once you know the word, tell the Defuser its frequency. They step the ' +
            'dial to that frequency and press TX to transmit. Decode tip: several ' +
            'words differ only in their first letter or two (slick / trick / brick ' +
            '/ flick, and break / steak / beats) — use the long repeat-gap to find ' +
            'where the word starts before committing to a reading.',
        },
        alphabetTable(),
        frequencyTable(),
      ],
    },
  ];
}
