import type { BombContext } from '../../types/index.js';
import { makeSeededRng } from '../../seeding/index.js';
import type { ComplicatedWiresState, ComplicatedWire, WireAttributes } from './types.js';
import { complicatedWiresShouldCut } from './solve.js';

/**
 * Pure, seeded instance generator — the ONLY place randomness is allowed in a
 * module, and only via makeSeededRng (Math.random is banned project-wide).
 * Synchronous and CPU-cheap (≤6 wires × a 16-row lookup).
 *
 * Layout (count + per-wire attributes) comes from the seed alone. No cut
 * decision is computed or stored here — the reducer recomputes shouldCut(attrs,
 * ctx) at cut-time from the public ctx carried in state, so nothing secret
 * crosses to the client (Sprint 2 retro AI1).
 *
 * BORN-SOLVED RE-ROLL (AC1): unlike wires, Complicated Wires can roll a layout
 * where NO wire should be cut (e.g. all D, or all S/P/B false under this ctx) —
 * which would be disarmed at birth. Because generate() has ctx, it re-rolls the
 * whole attribute set deterministically from the SAME seeded stream until at
 * least one wire is a should-cut wire. Determinism is preserved: (seed, ctx)
 * fully determines the stream and the ctx-driven acceptance test, so the same
 * inputs always yield the same layout. BombContext is stored by reference,
 * never mutated.
 */
export function generateComplicatedWires(seed: number, ctx: BombContext): ComplicatedWiresState {
  const rng = makeSeededRng(seed); // asserts non-negative integer seed
  const wireCount = 3 + Math.floor(rng() * 4); // uniform 3–6

  const rollAttrs = (): WireAttributes => ({
    redStripe: rng() < 0.5,
    blueStripe: rng() < 0.5,
    star: rng() < 0.5,
    led: rng() < 0.5,
  });

  // A live layout is always reachable — code C rows are should-cut under every
  // ctx and rollAttrs is uniform over all 16 combos — so this terminates near
  // instantly. The cap is defensive: if the COMPLICATED_WIRES_TABLE were ever
  // edited to drop every unconditional-cut row, this synchronous loop (run
  // inside generateLayout at ROUND_START) would otherwise hang the server / the
  // test suite silently. Fail loud at generation time instead.
  const MAX_REROLLS = 100;
  let wires: ComplicatedWire[] = [];
  let ok = false;
  for (let i = 0; i < MAX_REROLLS && !ok; i++) {
    wires = Array.from({ length: wireCount }, () => ({ attrs: rollAttrs(), cut: false }));
    // Re-roll (from the same seeded stream) until the layout is live: at least
    // one wire must be a should-cut wire, so the module is never born solved.
    ok = wires.some((w) => complicatedWiresShouldCut(w.attrs, ctx));
  }
  if (!ok) {
    throw new Error(
      `generateComplicatedWires: no live layout after ${MAX_REROLLS} re-rolls ` +
        `(seed=${seed}) — the cut-decision table has no should-cut row for this context`,
    );
  }

  return { wires, ctx };
}
