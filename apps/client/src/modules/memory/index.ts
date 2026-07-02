import type { IModule } from '@bomb-squad/shared';
import {
  MEMORY_MODULE_ID,
  generateMemory,
  getMemoryManualPages,
  memoryReducer,
  type MemoryState,
} from '@bomb-squad/shared';
import { registerModuleRenderer } from '../registry.js';
import { MemoryDefuserView } from './DefuserView.js';

/**
 * memory module directory — a Hard-tier module (Story 7.3), built on the
 * wires (5.3) / simon-says (7.2) template:
 *
 *   generate.ts / solve.ts / reducer.ts / types.ts  → re-exports of the pure
 *     logic in packages/shared/src/modules/memory/ (shared so the server's
 *     MODULE_REDUCERS and the client sandbox both run the SAME code)
 *   DefuserView.tsx  → R3F rendering only, zero game logic (current stage only)
 *   ManualPages.tsx  → renders getManualPages() structured data, never markup
 *   index.ts (this)  → the IModule binding + renderer registration
 *
 * Adding this module touched: this directory, one barrel import +
 * SANDBOX_MODULES entry, one MODULE_GENERATORS + TIER_POOLS.hard entry, one
 * MODULE_REDUCERS entry, and the /dev/manual fixture swap. Unlike simon-says it
 * needed NO handler change — Memory consumes no live bomb state. bombReducer.ts
 * and the MODULE_INTERACT handler are unchanged (open/closed, ADR-003).
 */
export const MEMORY_MODULE: IModule<MemoryState, unknown> = {
  id: MEMORY_MODULE_ID,
  generate: generateMemory,
  reduce: memoryReducer,
  getManualPages: getMemoryManualPages,
};

// Import-time registration (once per bundle; StrictMode-safe — no effects).
registerModuleRenderer({
  id: MEMORY_MODULE_ID,
  DefuserView: MemoryDefuserView,
});

export { MemoryDefuserView } from './DefuserView.js';
export { MemoryManualPages } from './ManualPages.js';
export * from './types.js';
