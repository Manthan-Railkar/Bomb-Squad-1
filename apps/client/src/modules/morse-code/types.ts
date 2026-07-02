/**
 * Module contract file: types re-exported from packages/shared — NEVER
 * duplicated (project rule). The shared dir is the single source of truth;
 * this file exists so the per-module directory is self-contained for readers.
 */
export {
  MORSE_CODE_MODULE_ID,
  MORSE_WORDS,
  MORSE_FREQUENCIES,
  formatMorseFrequency,
  isMorseCodeAction,
  type MorseWord,
  type MorseCodeState,
  type MorseCodeAction,
  type MorseCodeReset,
} from '@bomb-squad/shared';
