import { MORSE_FREQUENCIES, MORSE_WORDS, type MorseWord } from './types.js';

/**
 * The single source of truth for the module's Morse content. The manual renders
 * FROM these constants and the reducer/generator resolve answers FROM them, so a
 * transcription typo fails both (asserted in the tests) rather than silently
 * diverging.
 */

/**
 * International Morse chart — A–Z and 0–9 → dot/dash strings. The 16 words use
 * letters only, but the manual ships the full chart (the Expert reads it while
 * decoding arbitrary letters). Transcribed from the standard chart (manual p.12).
 */
export const MORSE_ALPHABET: Readonly<Record<string, string>> = {
  a: '.-',
  b: '-...',
  c: '-.-.',
  d: '-..',
  e: '.',
  f: '..-.',
  g: '--.',
  h: '....',
  i: '..',
  j: '.---',
  k: '-.-',
  l: '.-..',
  m: '--',
  n: '-.',
  o: '---',
  p: '.--.',
  q: '--.-',
  r: '.-.',
  s: '...',
  t: '-',
  u: '..-',
  v: '...-',
  w: '.--',
  x: '-..-',
  y: '-.--',
  z: '--..',
  '0': '-----',
  '1': '.----',
  '2': '..---',
  '3': '...--',
  '4': '....-',
  '5': '.....',
  '6': '-....',
  '7': '--...',
  '8': '---..',
  '9': '----.',
};

/**
 * Word → transmitted frequency in INTEGER kHz. All 16 rows transcribed EXACTLY
 * from the manual's word → frequency table (docs/…v1.pdf p.12 == gdd.md#Module
 * 6). Built by pairing MORSE_WORDS with MORSE_FREQUENCIES positionally — the two
 * are kept in ascending-frequency lockstep, and the tests assert the pairing
 * against an INDEPENDENTLY hard-coded expectation so a typo in either array fails
 * loudly rather than propagating into both solver and manual.
 */
export const MORSE_TABLE: Readonly<Record<MorseWord, number>> = Object.freeze(
  MORSE_WORDS.reduce<Record<MorseWord, number>>((acc, word, i) => {
    acc[word] = MORSE_FREQUENCIES[i];
    return acc;
  }, {} as Record<MorseWord, number>),
);

/**
 * Per-letter dot/dash codes for a word, e.g. 'shell' →
 * ['...', '....', '.', '.-..', '.-..']. Pure; consumed by the client flash
 * renderer and by tests. Throws on a character missing from the alphabet —
 * generation only ever passes listed (lowercase-letter) words, so this is a
 * programmer-error guard, not a runtime path.
 */
export function morsePatternForWord(word: string): ReadonlyArray<string> {
  return [...word.toLowerCase()].map((ch) => {
    const code = MORSE_ALPHABET[ch];
    if (code === undefined) {
      throw new Error(`morsePatternForWord: no Morse code for character "${ch}"`);
    }
    return code;
  });
}

/**
 * The dial index whose frequency matches the word's transmission. Used by the
 * reducer at TX-time and by generate()'s born-solved avoidance. NEVER persisted
 * (Sprint-2 retro AI1 — the answer is recomputed, never stored).
 */
export function correctFreqIndex(word: MorseWord): number {
  return MORSE_FREQUENCIES.indexOf(MORSE_TABLE[word]);
}
