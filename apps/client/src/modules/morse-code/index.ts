import type { IModule } from '@bomb-squad/shared';
import {
  MORSE_CODE_MODULE_ID,
  generateMorseCode,
  getMorseCodeManualPages,
  morseCodeReducer,
  type MorseCodeState,
} from '@bomb-squad/shared';
import { registerModuleRenderer } from '../registry.js';
import { MorseCodeDefuserView } from './DefuserView.js';

/**
 * morse-code module directory — the LAST Hard-tier module (Story 7.4), built on
 * the simon-says (7.2, flash playback) / memory (7.3, no-ctx) template:
 *
 *   generate.ts / solve.ts / reducer.ts / types.ts  → re-exports of the pure
 *     logic in packages/shared/src/modules/morse-code/ (shared so the server's
 *     MODULE_REDUCERS and the client sandbox both run the SAME code)
 *   DefuserView.tsx  → R3F rendering only: the flashing lamp + dial + TX
 *   ManualPages.tsx  → renders getManualPages() structured data, never markup
 *   index.ts (this)  → the IModule binding + renderer registration
 *
 * Like Memory it consumes NO live bomb state, so bombReducer.ts and the
 * MODULE_INTERACT handler are unchanged (open/closed, ADR-003). Adding it
 * touched: this directory, one barrel import + SANDBOX_MODULES entry, one
 * MODULE_GENERATORS + TIER_POOLS.hard entry, one MODULE_REDUCERS entry, the
 * /dev/manual fixture swap, and the recurring "unregistered id" fixture repoint
 * (now to 'keypads' — the Hard tier is exhausted).
 */
export const MORSE_CODE_MODULE: IModule<MorseCodeState, unknown> = {
  id: MORSE_CODE_MODULE_ID,
  generate: generateMorseCode,
  reduce: morseCodeReducer,
  getManualPages: getMorseCodeManualPages,
};

// Import-time registration (once per bundle; StrictMode-safe — no effects).
registerModuleRenderer({
  id: MORSE_CODE_MODULE_ID,
  DefuserView: MorseCodeDefuserView,
});

export { MorseCodeDefuserView } from './DefuserView.js';
export { MorseCodeManualPages } from './ManualPages.js';
export * from './types.js';
