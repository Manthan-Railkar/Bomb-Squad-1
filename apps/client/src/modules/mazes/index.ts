import type { IModule } from '@bomb-squad/shared';
import {
  MAZES_MODULE_ID,
  generateMazes,
  getMazesManualPages,
  mazesReducer,
  type MazesState,
} from '@bomb-squad/shared';
import { registerModuleRenderer } from '../registry.js';
import { MazesDefuserView } from './DefuserView.js';

/**
 * mazes module directory — fourth and LAST Medium module (Story 6.4), the first
 * module with a 2D navigable board. Built on the wires (5.3) reducer template
 * (physical interaction → 'struck'/'solved', no stored answer) and the
 * keypads/whos-on-first/wire-sequences (6.1/6.2/6.3) Medium registry pattern:
 *
 *   generate.ts / solve.ts / reducer.ts / types.ts  → re-exports of the pure
 *     logic in packages/shared/src/modules/mazes/ (shared so the server's
 *     MODULE_REDUCERS and the client sandbox both run the SAME code)
 *   DefuserView.tsx  → R3F rendering only, zero game logic (6×6 grid, NO walls)
 *   ManualPages.tsx  → renders getManualPages() structured data (the new maze
 *     diagrams reuse the shared MazeDiagram), never markup
 *   index.ts (this)  → the IModule binding + renderer registration
 *   __tests__/       → client-side binding tests (pure-logic tests live in shared)
 *
 * Adding this module touched: this directory, one barrel import +
 * SANDBOX_MODULES entry, one MODULE_REDUCERS entry, one MODULE_GENERATORS +
 * TIER_POOLS (medium/hard) entry, the additive ManualSection.maze/PageRenderer
 * branch, and the /dev/manual fixture swap to canonical content. bombReducer.ts
 * unchanged (open/closed). Completes the Medium tier (TIER_POOLS == TIER_CATALOG).
 */
export const MAZES_MODULE: IModule<MazesState, unknown> = {
  id: MAZES_MODULE_ID,
  generate: generateMazes,
  reduce: mazesReducer,
  getManualPages: getMazesManualPages,
};

// Import-time registration: the module cache makes this once-per-bundle (no
// StrictMode double-registration — effects are not involved). Same pattern as
// wires/keypads/whos-on-first/wire-sequences.
registerModuleRenderer({ id: MAZES_MODULE_ID, DefuserView: MazesDefuserView });

export { MazesDefuserView } from './DefuserView.js';
export { MazesManualPages } from './ManualPages.js';
export * from './types.js';
