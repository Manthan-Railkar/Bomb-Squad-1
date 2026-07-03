import type { IModule } from '@bomb-squad/shared';
import { DEV_DEMO_MODULE } from './dev-demo/index.js';
import { WIRES_MODULE } from './wires/index.js';
import { BUTTON_MODULE } from './the-button/index.js';
import { PASSWORDS_MODULE } from './passwords/index.js';
import { KEYPADS_MODULE } from './keypads/index.js';
import { WHOS_ON_FIRST_MODULE } from './whos-on-first/index.js';
import { WIRE_SEQUENCES_MODULE } from './wire-sequences/index.js';
import { MAZES_MODULE } from './mazes/index.js';
import { COMPLICATED_WIRES_MODULE } from './complicated-wires/index.js';
import { SIMON_SAYS_MODULE } from './simon-says/index.js';
import { MEMORY_MODULE } from './memory/index.js';
import { MORSE_CODE_MODULE } from './morse-code/index.js';

/**
 * Module registration barrel — importing it (main.tsx does, once) registers
 * every module's renderer. Each module dir self-registers at import time;
 * adding a module here is one import + one SANDBOX_MODULES entry.
 */

/** Type-erased IModule for heterogeneous lists (mirrors the server registry's
 *  ModuleReducer erasure — per-module types live inside each module). */
export type SandboxModule = IModule<unknown, unknown>;

/** Modules available in /dev/sandbox. */
export const SANDBOX_MODULES: readonly SandboxModule[] = [
  DEV_DEMO_MODULE as SandboxModule,
  WIRES_MODULE as SandboxModule,
  BUTTON_MODULE as SandboxModule,
  PASSWORDS_MODULE as SandboxModule,
  KEYPADS_MODULE as SandboxModule,
  WHOS_ON_FIRST_MODULE as SandboxModule,
  WIRE_SEQUENCES_MODULE as SandboxModule,
  MAZES_MODULE as SandboxModule,
  COMPLICATED_WIRES_MODULE as SandboxModule,
  SIMON_SAYS_MODULE as SandboxModule,
  MEMORY_MODULE as SandboxModule,
  MORSE_CODE_MODULE as SandboxModule,
];

/**
 * Modules shown in the PLAYER-facing Expert manual (Preparation + ActiveRound).
 * Excludes `dev-demo` ("On the Subject of the Test Rig") — a reference module
 * registered for the /dev sandbox but in NO tier pool, so it never appears on a
 * real bomb and must not lead the player's handbook. The dev sandbox still uses
 * the full SANDBOX_MODULES list.
 */
export const MANUAL_MODULES: readonly SandboxModule[] = SANDBOX_MODULES.filter(
  (m) => m.id !== DEV_DEMO_MODULE.id,
);

export {
  DEV_DEMO_MODULE,
  WIRES_MODULE,
  BUTTON_MODULE,
  PASSWORDS_MODULE,
  KEYPADS_MODULE,
  WHOS_ON_FIRST_MODULE,
  WIRE_SEQUENCES_MODULE,
  MAZES_MODULE,
  COMPLICATED_WIRES_MODULE,
  SIMON_SAYS_MODULE,
  MEMORY_MODULE,
  MORSE_CODE_MODULE,
};
