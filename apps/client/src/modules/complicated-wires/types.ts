/**
 * Module contract file: types re-exported from packages/shared — NEVER
 * duplicated (project rule). The shared dir is the single source of truth;
 * this file exists so the per-module directory is self-contained for readers.
 */
export {
  COMPLICATED_WIRES_MODULE_ID,
  isComplicatedWiresAction,
  type WireAttributes,
  type ComplicatedWire,
  type ComplicatedWiresAction,
  type ComplicatedWiresReset,
  type ComplicatedWiresState,
} from '@bomb-squad/shared';
