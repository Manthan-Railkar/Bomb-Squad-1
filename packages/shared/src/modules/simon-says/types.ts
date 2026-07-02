/**
 * simon-says — a Hard-tier module (Story 7.2, GDD Module 4).
 *
 * Four coloured buttons flash a growing sequence; the Defuser translates each
 * flash through the correct table and presses the mapped colour. The table is
 * chosen by whether the serial number contains a vowel (Table A) or not
 * (Table B) AND by the CURRENT team strike count (0/1/2) — so the mapping
 * shifts mid-round as strikes accrue. Enter the whole revealed sequence
 * correctly and it grows by one; complete the final stage to disarm.
 *
 * Pure logic lives HERE in packages/shared so both the server registry
 * (MODULE_REDUCERS, runtime via tsx) and the client sandbox run the SAME code;
 * apps/client/src/modules/simon-says/ re-exports it.
 *
 * LIVE STRIKE COUNT (the design crux): the module reducer only receives its own
 * ModuleState, never BombState, so it cannot read `bomb.strikes` directly. The
 * live strike count therefore enters as an ACTION INPUT (the-button's proven
 * RELEASE.timerDigits pattern) — and the MODULE_INTERACT handler stamps the
 * AUTHORITATIVE `bomb.strikes` onto the action before reducing, overriding any
 * client-sent value (server-authoritative; a spoofed 0 would be a cheat). The
 * serial-vowel half is static and read from the public ctx carried in state.
 */

import type { BombContext } from '../../types/index.js';

/** Module identifier — kebab-case (project naming convention). */
export const SIMON_SAYS_MODULE_ID = 'simon-says';

/** The four Simon colours the GDD translation tables reference. */
export const SIMON_COLORS = ['red', 'blue', 'green', 'yellow'] as const;

export type SimonColor = (typeof SIMON_COLORS)[number];

/**
 * Mono letter label rendered on each colour panel (colorblind floor: colour is
 * never the only signal — DESIGN.md / NFR11 / UX-DR14). R/B/G/Y; the manual
 * documents the same lettering so both sides of the information asymmetry
 * (Defuser panel + Expert table) name colours identically.
 */
export const SIMON_COLOR_LABELS: Readonly<Record<SimonColor, string>> = {
  red: 'R',
  blue: 'B',
  green: 'G',
  yellow: 'Y',
};

/**
 * The number of flashes in the full sequence — the module solves once the
 * Defuser reproduces stage `SIMON_SEQUENCE_LENGTH` correctly. The sequence is
 * generated to this fixed length; `stage` reveals 1..length of it as the round
 * progresses.
 */
export const SIMON_SEQUENCE_LENGTH = 5;

export interface SimonSaysState {
  /**
   * The full seeded flash order (length SIMON_SEQUENCE_LENGTH). These are the
   * raw flashes the Defuser sees anyway — NOT the answer. The translated press
   * is recomputed at reduce-time from `ctx` + the live strike count, so no
   * pre-computed solution is ever stored or crosses to the client (Sprint 2
   * retro AI1).
   */
  readonly sequence: ReadonlyArray<SimonColor>;
  /** How many flashes are currently revealed (1..sequence.length). */
  readonly stage: number;
  /** Correct presses so far in the current stage attempt (0..stage). */
  readonly progress: number;
  /**
   * The public bomb context (serial / batteries / ports / indicators) — all
   * visible on the bomb face, NOT secret. The reducer reads `ctx.serialNumber`
   * to pick the vowel/no-vowel table at press-time; nothing secret is stored.
   */
  readonly ctx: BombContext;
}

/**
 * Defuser action — pressing a colour panel = single click. `strikeCount` is the
 * live team strike count at press-time; the SERVER overrides it with the
 * authoritative `bomb.strikes` in MODULE_INTERACT (the client supplies it only
 * so the sandbox, which has no server, can run the reducer locally).
 */
export type SimonSaysAction = { type: 'PRESS'; color: SimonColor; strikeCount: number };

/** Lifecycle action forwarded whole by the bomb reducer (see types/actions.ts). */
export type SimonSaysReset = { type: 'MODULE_RESET' };

/** Runtime guard: actions reach reducers as `unknown` (untrusted input). */
export function isSimonSaysAction(action: unknown): action is SimonSaysAction | SimonSaysReset {
  if (typeof action !== 'object' || action === null || !('type' in action)) return false;
  const type = (action as { type: unknown }).type;
  if (type === 'MODULE_RESET') return true;
  if (type !== 'PRESS') return false;
  const { color, strikeCount } = action as { color?: unknown; strikeCount?: unknown };
  return (
    typeof color === 'string' &&
    (SIMON_COLORS as readonly string[]).includes(color) &&
    typeof strikeCount === 'number'
  );
}
