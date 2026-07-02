/**
 * Module contract file: types re-exported from packages/shared — NEVER
 * duplicated (project rule). The shared dir is the single source of truth;
 * this file exists so the per-module directory is self-contained for readers.
 */
export {
  MEMORY_MODULE_ID,
  MEMORY_DIGITS,
  MEMORY_STAGE_COUNT,
  isMemoryAction,
  type MemoryDigit,
  type MemoryStage,
  type MemoryPress,
  type MemoryState,
  type MemoryAction,
  type MemoryReset,
} from '@bomb-squad/shared';
