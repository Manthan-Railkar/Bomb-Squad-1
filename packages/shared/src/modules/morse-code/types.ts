/**
 * morse-code — the LAST Hard-tier module (Story 7.4, GDD Module 6). Completes
 * Epic 7's Hard pool.
 *
 * A lamp flashes a WORD in Morse code on a loop (short flash = dot, long flash =
 * dash, long gap between letters, very long gap before the word repeats). The
 * Expert decodes the FULL word, looks it up in the manual's 16-row word →
 * frequency table (the lookup is word → frequency, NEVER character-by-character;
 * project-context gotcha line 219 / FR31), the Defuser steps a frequency dial to
 * that value and clicks TX (FR20). Correct frequency → solved; any other → strike
 * with the dial LEFT IN PLACE (no progress to reset — contrast Memory 7.3).
 *
 * Pure logic lives HERE in packages/shared so both the server registry
 * (MODULE_REDUCERS) and the client sandbox run the SAME code;
 * apps/client/src/modules/morse-code/ re-exports it.
 *
 * NO LIVE BOMB STATE (like Memory 7.3, unlike Simon 7.2): the answer is a pure
 * function of this module's own `word` — neither serial nor strike count feed it.
 * So MorseCodeState carries no BombContext and MODULE_INTERACT needs no change.
 */

/** Module identifier — kebab-case (project naming convention). */
export const MORSE_CODE_MODULE_ID = 'morse-code';

/**
 * The 16 transmittable words, in ASCENDING frequency order (index == dial
 * position of that word's answer). Transcribed EXACTLY from the manual's word →
 * frequency table (docs/…v1.pdf p.12 == gdd.md#Module 6). See MORSE_TABLE for
 * the paired frequencies.
 */
export const MORSE_WORDS = [
  'shell',
  'halls',
  'slick',
  'trick',
  'boxes',
  'leaks',
  'strobe',
  'bistro',
  'flick',
  'bombs',
  'break',
  'brick',
  'steak',
  'sting',
  'vector',
  'beats',
] as const;

export type MorseWord = (typeof MORSE_WORDS)[number];

/**
 * Dial positions as INTEGER kHz (3505..3600), ascending — never floats. TX
 * correctness is exact integer equality (`MORSE_FREQUENCIES[freqIndex] ===
 * MORSE_TABLE[word]`); float MHz literals would invite epsilon bugs. Format for
 * DISPLAY only via formatMorseFrequency. Kept in lockstep with MORSE_WORDS (the
 * i-th word transmits at the i-th frequency) — an invariant the tests assert.
 */
export const MORSE_FREQUENCIES: ReadonlyArray<number> = [
  3505, 3515, 3522, 3532, 3535, 3542, 3545, 3552, 3555, 3565, 3572, 3575, 3582,
  3592, 3595, 3600,
];

/**
 * Integer kHz → the LCD frequency string, e.g. 3505 → '3.505 MHz'. Used by BOTH
 * the DefuserView readout AND the manual table so the display can never drift
 * between them.
 */
export function formatMorseFrequency(khz: number): string {
  return (khz / 1000).toFixed(3) + ' MHz';
}

export interface MorseCodeState {
  /**
   * The transmitted word — the PHYSICAL observable flashed to the Defuser (the
   * client cannot render the lamp without it, exactly as wires ship their
   * colours). NOT an answer leak: the actual answer (the frequency) is computed
   * at TX-time via correctFreqIndex(word) and never persisted.
   */
  readonly word: MorseWord;
  /** Current dial position, 0..15 (index into MORSE_FREQUENCIES). */
  readonly freqIndex: number;
  /** Generate-time dial start, kept so MODULE_RESET can restore it. */
  readonly initialFreqIndex: number;
}

/** Defuser actions — step the dial (single click) or transmit (single click, FR20). */
export type MorseCodeAction = { type: 'FREQ_UP' } | { type: 'FREQ_DOWN' } | { type: 'TX' };

/** Lifecycle action forwarded whole by the bomb reducer (see types/actions.ts). */
export type MorseCodeReset = { type: 'MODULE_RESET' };

/**
 * Runtime guard: actions reach reducers as `unknown` (untrusted client input).
 * Accept MODULE_RESET / FREQ_UP / FREQ_DOWN / TX by their `type` string. Must
 * TOLERATE extra fields — the MODULE_INTERACT handler stamps `strikeCount` onto
 * every action (moduleHandlers.ts:173-186); a structural check passes and the
 * reducer simply ignores it. Mirrors isSimonSaysAction / isMemoryAction shape.
 */
export function isMorseCodeAction(action: unknown): action is MorseCodeAction | MorseCodeReset {
  if (typeof action !== 'object' || action === null || !('type' in action)) return false;
  const type = (action as { type: unknown }).type;
  return type === 'MODULE_RESET' || type === 'FREQ_UP' || type === 'FREQ_DOWN' || type === 'TX';
}
