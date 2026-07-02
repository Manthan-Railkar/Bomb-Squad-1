/**
 * complicated-wires — a Hard-tier module (Story 7.1, GDD Module 7).
 *
 * N wires (3–6), each carrying an independent four-attribute combination
 * (red stripe / blue stripe / star / LED). Each wire's cut decision comes from
 * a single authoritative 16-row truth table (solve.ts) whose code (C/D/S/P/B)
 * is evaluated against the bomb's public edgework (serial / ports / batteries).
 * Cut EVERY should-cut wire to disarm; a wrong cut is a strike but the wire
 * still severs. Pure logic lives HERE in packages/shared so both the server
 * registry (MODULE_REDUCERS, runtime via tsx) and the client sandbox run the
 * SAME code; apps/client/src/modules/complicated-wires/ re-exports it.
 */

import type { BombContext } from '../../types/index.js';

/** Module identifier — kebab-case (project naming convention). */
export const COMPLICATED_WIRES_MODULE_ID = 'complicated-wires';

/**
 * The four independent per-wire attributes. All four are booleans (present /
 * absent); the truth table is keyed by their 2^4 = 16 combinations.
 */
export interface WireAttributes {
  readonly redStripe: boolean;
  readonly blueStripe: boolean;
  readonly star: boolean;
  readonly led: boolean;
}

export interface ComplicatedWire {
  readonly attrs: WireAttributes;
  /** A severed wire stays severed until MODULE_RESET (cuts are physical). */
  readonly cut: boolean;
}

export interface ComplicatedWiresState {
  readonly wires: ReadonlyArray<ComplicatedWire>;
  /**
   * The public bomb context (serial / batteries / ports / indicators) — all
   * visible on the bomb face, NOT secret. The reducer recomputes shouldCut()
   * from the public truth table + this ctx at cut-time, so no pre-computed
   * cut decision is ever stored in module data or crosses to the client
   * (Sprint 2 retro AI1 — the old baked answer was a literal cheat value).
   */
  readonly ctx: BombContext;
}

/** Defuser action — wire cut = single click (the sole interaction primitive). */
export type ComplicatedWiresAction = { type: 'CUT'; wireIndex: number };

/** Lifecycle action forwarded whole by the bomb reducer (see types/actions.ts). */
export type ComplicatedWiresReset = { type: 'MODULE_RESET' };

/** Runtime guard: actions reach reducers as `unknown` (untrusted input). */
export function isComplicatedWiresAction(
  action: unknown,
): action is ComplicatedWiresAction | ComplicatedWiresReset {
  if (typeof action !== 'object' || action === null || !('type' in action)) return false;
  const type = (action as { type: unknown }).type;
  if (type === 'MODULE_RESET') return true;
  return type === 'CUT' && typeof (action as { wireIndex?: unknown }).wireIndex === 'number';
}
