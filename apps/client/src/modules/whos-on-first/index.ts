import type { IModule } from '@bomb-squad/shared';
import {
  WHOS_ON_FIRST_MODULE_ID,
  generateWhosOnFirst,
  getWhosOnFirstManualPages,
  whosOnFirstReducer,
  type WhosOnFirstState,
} from '@bomb-squad/shared';
import { registerModuleRenderer } from '../registry.js';
import { WhosOnFirstDefuserView } from './DefuserView.js';

/**
 * whos-on-first module directory — second Medium module (Story 6.2), built on the
 * keypads (6.1) / passwords (5.5) template:
 *
 *   generate.ts / solve.ts / reducer.ts / types.ts  → re-exports of the pure
 *     logic in packages/shared/src/modules/whos-on-first/ (shared so the server's
 *     MODULE_REDUCERS and the client sandbox both run the SAME code)
 *   DefuserView.tsx  → R3F rendering only, zero game logic (display + 2×3 grid)
 *   ManualPages.tsx  → renders getManualPages() structured data, never markup
 *   index.ts (this)  → the IModule binding + renderer registration
 *   __tests__/       → client-side binding tests (pure-logic tests live in shared)
 *
 * Adding this module touched: this directory, one barrel import +
 * SANDBOX_MODULES entry, one MODULE_REDUCERS entry, one MODULE_GENERATORS +
 * TIER_POOLS (medium/hard) entry, and the /dev/manual fixture swap to canonical
 * content. bombReducer.ts unchanged (open/closed).
 */
export const WHOS_ON_FIRST_MODULE: IModule<WhosOnFirstState, unknown> = {
  id: WHOS_ON_FIRST_MODULE_ID,
  generate: generateWhosOnFirst,
  reduce: whosOnFirstReducer,
  getManualPages: getWhosOnFirstManualPages,
};

// Import-time registration: the module cache makes this once-per-bundle. Same
// pattern as wires/the-button/passwords/keypads.
registerModuleRenderer({ id: WHOS_ON_FIRST_MODULE_ID, DefuserView: WhosOnFirstDefuserView });

export { WhosOnFirstDefuserView } from './DefuserView.js';
export { WhosOnFirstManualPages } from './ManualPages.js';
export * from './types.js';
