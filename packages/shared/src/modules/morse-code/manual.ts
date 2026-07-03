import type { Locale, ManualPage, ManualSection } from '../../types/index.js';
import { MORSE_CODE_MODULE_ID, MORSE_WORDS, formatMorseFrequency, type MorseWord } from './types.js';
import { MORSE_ALPHABET, MORSE_TABLE } from './solve.js';

/** Locale-keyed prose. Row values — morse codes, the literal words, and the
 *  response frequencies — are locale-invariant. */
const TEXT = {
  en: {
    title: 'Morse Code',
    intro:
      'A short flash is a dot; a long flash is a dash. A long gap separates ' +
      'letters and a very long gap marks the end of the word before it loops. ' +
      'Decode the ENTIRE word, then look up its frequency below — the lookup ' +
      'is by whole word, NOT letter by letter. Tip: some words differ only in ' +
      'their first letters (slick / trick / brick / flick), so use the long ' +
      'repeat-gap to find where the word starts.',
    alphabetHeading: 'International Morse Code',
    alphabetHeaders: ['Character', 'Code', 'Character', 'Code'],
    freqHeading: 'Word → Frequency',
    freqHeaders: ['If the word is', 'Respond at frequency'],
  },
  zh: {
    title: '摩尔斯电码 (Morse Code)',
    intro:
      '短闪为「点」，长闪为「划」。较长的间隔分隔字母，非常长的间隔标志着单词' +
      '结束、随后循环重放。先解码「整个单词」，再在下表中查其频率——查表是按' +
      '整词进行，而非逐个字母。提示：有些单词只有开头字母不同（slick / trick /' +
      ' brick / flick），可利用那个长的重复间隔来判断单词从哪里开始。',
    alphabetHeading: '国际摩尔斯电码',
    alphabetHeaders: ['字符', '电码', '字符', '电码'],
    freqHeading: '单词 → 频率',
    freqHeaders: ['若单词为', '回复频率'],
  },
} as const;

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
function alphabetTable(headers: readonly string[], heading: string): ManualSection {
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
    heading,
    content: '',
    table: {
      // Two side-by-side character/code PAIRS — a symmetric reference chart, not
      // an action/answer table. Opt the last column out of the viewer's
      // right-align rule (Story TD-9) so the 2nd Code column reads like the 1st
      // (left-aligned under its header) instead of hugging the right edge.
      headers: [...headers],
      rows,
      rightAlignLastColumn: false,
    },
  };
}

/** Word → frequency rows rendered from MORSE_TABLE via formatMorseFrequency. */
function frequencyTable(headers: readonly string[], heading: string): ManualSection {
  return {
    heading,
    content: '',
    table: {
      headers: [...headers],
      // MORSE_WORDS is in ascending-frequency order — render it as-is.
      rows: MORSE_WORDS.map((word: MorseWord) => [word, formatMorseFrequency(MORSE_TABLE[word])]),
    },
  };
}

export function getMorseCodeManualPages(locale: Locale = 'en'): ManualPage[] {
  const t = TEXT[locale];
  return [
    {
      chapterId: MORSE_CODE_MODULE_ID,
      chapterTitle: t.title,
      sections: [
        {
          content: t.intro,
        },
        alphabetTable(t.alphabetHeaders, t.alphabetHeading),
        frequencyTable(t.freqHeaders, t.freqHeading),
      ],
    },
  ];
}
