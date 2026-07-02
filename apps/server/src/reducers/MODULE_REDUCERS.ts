import {
  DEV_DEMO_MODULE_ID,
  WIRES_MODULE_ID,
  BUTTON_MODULE_ID,
  PASSWORDS_MODULE_ID,
  COMPLICATED_WIRES_MODULE_ID,
  SIMON_SAYS_MODULE_ID,
  MEMORY_MODULE_ID,
  MORSE_CODE_MODULE_ID,
  devDemoReducer,
  wiresReducer,
  buttonReducer,
  passwordsReducer,
  complicatedWiresReducer,
  simonSaysReducer,
  memoryReducer,
  morseCodeReducer,
  type ModuleState,
  type Reducer,
} from '@bomb-squad/shared';

export type ModuleReducer = Reducer<ModuleState<unknown>, unknown>;

/**
 * Open/closed module registry.
 *
 * Add an entry here to register a module. Never edit bombReducer.ts to support a new module.
 * Modules from Epic 5+ register into this map additively; the bomb reducer delegates by moduleId.
 *
 * Entries are cast to ModuleReducer: each module's reducer is fully typed in
 * packages/shared; the per-module state type is deliberately erased at this
 * registry boundary (the bomb reducer dispatches by moduleId and treats data
 * as opaque). Reducers themselves guard against malformed actions.
 */
export const MODULE_REDUCERS: Record<string, ModuleReducer> = {
  // dev-demo: Story 5.1 reference module. Harmless in production — no bomb
  // generation emits 'dev-demo' until Story 8.2 defines the module pool.
  [DEV_DEMO_MODULE_ID]: devDemoReducer as ModuleReducer,
  // wires: Story 5.3 walking skeleton — first real module.
  [WIRES_MODULE_ID]: wiresReducer as ModuleReducer,
  // the-button: Story 5.4 — press/hold with a timed release.
  [BUTTON_MODULE_ID]: buttonReducer as ModuleReducer,
  // passwords: Story 5.5 — cycle five columns to spell a listed word, SUBMIT.
  [PASSWORDS_MODULE_ID]: passwordsReducer as ModuleReducer,
  // complicated-wires: Story 7.1 — first Hard module. Per-wire truth-table cut
  // decision against the bomb's public edgework; cut every should-cut wire.
  [COMPLICATED_WIRES_MODULE_ID]: complicatedWiresReducer as ModuleReducer,
  // simon-says: Story 7.2 — second Hard module. Growing colour-flash sequence;
  // the translation row is chosen by the live team strike count, which the
  // MODULE_INTERACT handler stamps onto the action (server-authoritative).
  [SIMON_SAYS_MODULE_ID]: simonSaysReducer as ModuleReducer,
  // memory: Story 7.3 — third Hard module. A 5-stage sequential state machine; a
  // wrong press resets to stage 1 (not a per-stage retry) and rolls up a strike.
  // No live bomb state, so no MODULE_INTERACT enrichment is needed.
  [MEMORY_MODULE_ID]: memoryReducer as ModuleReducer,
  // morse-code: Story 7.4 — the last Hard module. A flashed word decoded to a
  // frequency; the dial + TX solve (wrong TX = strike, dial preserved). No live
  // bomb state, so no MODULE_INTERACT enrichment is needed (like memory).
  [MORSE_CODE_MODULE_ID]: morseCodeReducer as ModuleReducer,
};
