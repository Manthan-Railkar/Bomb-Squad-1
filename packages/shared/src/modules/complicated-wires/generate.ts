import type { BombContext } from '../../types/index.js';
import { makeSeededRng } from '../../seeding/index.js';
import type { ComplicatedWiresState, ComplicatedWire, WireAttributes } from './types.js';
import { shouldCut } from './solve.js';

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

  let wires: ComplicatedWire[];
  do {
    wires = Array.from({ length: wireCount }, () => ({ attrs: rollAttrs(), cut: false }));
    // Re-roll (from the same seeded stream) until the layout is live: at least
    // one wire must be a should-cut wire, so the module is never born solved.
  } while (!wires.some((w) => shouldCut(w.attrs, ctx)));

  return { wires, ctx };
}
