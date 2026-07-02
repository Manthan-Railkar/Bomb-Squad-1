import type { IModule } from '@bomb-squad/shared';
import {
  SIMON_SAYS_MODULE_ID,
  generateSimonSays,
  getSimonSaysManualPages,
  simonSaysReducer,
  type SimonSaysState,
} from '@bomb-squad/shared';
import { registerModuleRenderer } from '../registry.js';
import { SimonSaysDefuserView } from './DefuserView.js';

/**
 * simon-says module directory — a Hard-tier module (Story 7.2), built on the
 * wires (5.3) / complicated-wires (7.1) template:
 *
 *   generate.ts / solve.ts / reducer.ts / types.ts  → re-exports of the pure
 *     logic in packages/shared/src/modules/simon-says/ (shared so the server's
 *     MODULE_REDUCERS and the client sandbox both run the SAME code)
 *   DefuserView.tsx  → R3F rendering only, zero game logic
 *   ManualPages.tsx  → renders getManualPages() structured data, never markup
 *   index.ts (this)  → the IModule binding + renderer registration
 *
 * Adding this module touched: this directory, one barrel import +
 * SANDBOX_MODULES entry, one MODULE_GENERATORS + TIER_POOLS.hard entry, one
 * MODULE_REDUCERS entry, the /dev/manual fixture swap, and one handler line
 * (authoritative strike-count stamp — the live-bomb-state seam). bombReducer.ts
 * unchanged (open/closed, ADR-003).
 */
export const SIMON_SAYS_MODULE: IModule<SimonSaysState, unknown> = {
  id: SIMON_SAYS_MODULE_ID,
  generate: generateSimonSays,
  reduce: simonSaysReducer,
  getManualPages: getSimonSaysManualPages,
};

// Import-time registration (once per bundle; StrictMode-safe — no effects).
registerModuleRenderer({
  id: SIMON_SAYS_MODULE_ID,
  DefuserView: SimonSaysDefuserView,
});

export { SimonSaysDefuserView } from './DefuserView.js';
export { SimonSaysManualPages } from './ManualPages.js';
export * from './types.js';
