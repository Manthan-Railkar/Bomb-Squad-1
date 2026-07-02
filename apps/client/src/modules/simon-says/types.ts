/**
 * Module contract file: types re-exported from packages/shared — NEVER
 * duplicated (project rule). The shared dir is the single source of truth;
 * this file exists so the per-module directory is self-contained for readers.
 */
export {
  SIMON_SAYS_MODULE_ID,
  SIMON_COLORS,
  SIMON_COLOR_LABELS,
  SIMON_SEQUENCE_LENGTH,
  isSimonSaysAction,
  type SimonColor,
  type SimonSaysAction,
  type SimonSaysReset,
  type SimonSaysState,
} from '@bomb-squad/shared';
