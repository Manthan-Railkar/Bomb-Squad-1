/**
 * Module contract file: types re-exported from packages/shared — NEVER
 * duplicated (project rule). The shared dir is the single source of truth;
 * this file exists so the per-module directory is self-contained for readers.
 */
export {
  KEYPADS_MODULE_ID,
  KEY_COUNT,
  KEYPAD_COLUMN_COUNT,
  SYMBOLS_PER_COLUMN,
  KEYPAD_SYMBOLS,
  KEYPAD_COLUMNS,
  KEYPAD_SYMBOL_GLYPHS,
  isKeypadsAction,
  type SymbolId,
  type KeypadsState,
  type KeypadsAction,
  type KeypadsReset,
} from '@bomb-squad/shared';
