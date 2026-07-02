import type { IModule } from '@bomb-squad/shared';
import {
  WIRE_SEQUENCES_MODULE_ID,
  generateWireSequences,
  getWireSequencesManualPages,
  wireSequencesReducer,
  type WireSequencesState,
} from '@bomb-squad/shared';
import { registerModuleRenderer } from '../registry.js';
import { WireSequencesDefuserView } from './DefuserView.js';

/**
 * wire-sequences module directory — third Medium module (Story 6.3), the first
 * genuinely STATEFUL module (multi-panel + NAV + cumulative-occurrence
 * auto-solve). Built on the wires (5.3) template for CUT / physical-sever
 * mechanics and the keypads/whos-on-first (6.1/6.2) template for the Medium
 * registry pattern:
 *
 *   generate.ts / solve.ts / reducer.ts / types.ts  → re-exports of the pure
 *     logic in packages/shared/src/modules/wire-sequences/ (shared so the
 *     server's MODULE_REDUCERS and the client sandbox both run the SAME code)
 *   DefuserView.tsx  → R3F rendering only, zero game logic (current panel + nav)
 *   ManualPages.tsx  → renders getManualPages() structured data, never markup
 *   index.ts (this)  → the IModule binding + renderer registration
 *   __tests__/       → client-side binding tests (pure-logic tests live in shared)
 *
 * Adding this module touched: this directory, one barrel import +
 * SANDBOX_MODULES entry, one MODULE_REDUCERS entry, one MODULE_GENERATORS +
 * TIER_POOLS (medium/hard) entry, and the /dev/manual fixture swap to canonical
 * content. bombReducer.ts unchanged (open/closed).
 */
export const WIRE_SEQUENCES_MODULE: IModule<WireSequencesState, unknown> = {
  id: WIRE_SEQUENCES_MODULE_ID,
  generate: generateWireSequences,
  reduce: wireSequencesReducer,
  getManualPages: getWireSequencesManualPages,
};

// Import-time registration: the module cache makes this once-per-bundle (no
// StrictMode double-registration — effects are not involved). Same pattern as
// wires/keypads/whos-on-first.
registerModuleRenderer({ id: WIRE_SEQUENCES_MODULE_ID, DefuserView: WireSequencesDefuserView });

export { WireSequencesDefuserView } from './DefuserView.js';
export { WireSequencesManualPages } from './ManualPages.js';
export * from './types.js';
