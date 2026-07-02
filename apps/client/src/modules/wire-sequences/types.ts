/**
 * Module contract file: types re-exported from packages/shared — NEVER
 * duplicated (project rule). The shared dir is the single source of truth;
 * this file exists so the per-module directory is self-contained for readers.
 */
export {
  WIRE_SEQUENCES_MODULE_ID,
  WIRE_SEQ_COLORS,
  WIRE_SEQ_LETTERS,
  WIRE_SEQ_COLOR_LABELS,
  CUT_RULES,
  MAX_OCCURRENCE,
  isWireSequencesAction,
  type WireSeqColor,
  type WireSeqLetter,
  type WireSeqWire,
  type WireSeqPanel,
  type WireSequencesAction,
  type WireSequencesReset,
  type WireSequencesState,
} from '@bomb-squad/shared';
