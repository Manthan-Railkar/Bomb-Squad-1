/**
 * Module contract file: types re-exported from packages/shared — NEVER
 * duplicated (project rule). The shared dir is the single source of truth;
 * this file exists so the per-module directory is self-contained for readers.
 */
export {
  WHOS_ON_FIRST_MODULE_ID,
  BUTTON_COUNT,
  POSITION_NAMES,
  DISPLAY_POSITIONS,
  DISPLAY_WORDS,
  LABEL_PRIORITIES,
  WOF_BUTTON_LABELS,
  isWhosOnFirstAction,
  type WhosOnFirstState,
  type WhosOnFirstAction,
  type WhosOnFirstReset,
} from '@bomb-squad/shared';
