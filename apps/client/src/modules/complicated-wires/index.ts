import type { IModule } from '@bomb-squad/shared';
import {
  COMPLICATED_WIRES_MODULE_ID,
  generateComplicatedWires,
  getComplicatedWiresManualPages,
  complicatedWiresReducer,
  type ComplicatedWiresState,
} from '@bomb-squad/shared';
import { registerModuleRenderer } from '../registry.js';
import { ComplicatedWiresDefuserView } from './DefuserView.js';

/**
 * complicated-wires module directory — a Hard-tier module (Story 7.1), built
 * on the wires (5.3) template:
 *
 *   generate.ts / solve.ts / reducer.ts / types.ts  → re-exports of the pure
 *     logic in packages/shared/src/modules/complicated-wires/ (shared so the
 *     server's MODULE_REDUCERS and the client sandbox both run the SAME code)
 *   DefuserView.tsx  → R3F rendering only, zero game logic
 *   ManualPages.tsx  → renders getManualPages() structured data, never markup
 *   index.ts (this)  → the IModule binding + renderer registration
 *
 * Adding this module touched: this directory, one barrel import +
 * SANDBOX_MODULES entry, one MODULE_GENERATORS + TIER_POOLS.hard entry, one
 * MODULE_REDUCERS entry, and the /dev/manual fixture swap. bombReducer.ts
 * unchanged (open/closed, ADR-003).
 */
export const COMPLICATED_WIRES_MODULE: IModule<ComplicatedWiresState, unknown> = {
  id: COMPLICATED_WIRES_MODULE_ID,
  generate: generateComplicatedWires,
  reduce: complicatedWiresReducer,
  getManualPages: getComplicatedWiresManualPages,
};

// Import-time registration (once per bundle; StrictMode-safe — no effects).
registerModuleRenderer({
  id: COMPLICATED_WIRES_MODULE_ID,
  DefuserView: ComplicatedWiresDefuserView,
});

export { ComplicatedWiresDefuserView } from './DefuserView.js';
export { ComplicatedWiresManualPages } from './ManualPages.js';
export * from './types.js';
