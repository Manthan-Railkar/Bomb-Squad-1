import type { BombContext } from '../../types/index.js';
import type { WireAttributes } from './types.js';

/**
 * The GDD Complicated Wires truth table (gdd.md #Module 7 — the authoritative
 * source), encoded ONCE as data. codeForAttributes() looks a wire's four
 * booleans up in it; getComplicatedWiresManualPages() renders the SAME array —
 * solver and manual are structurally incapable of diverging (the wires lesson:
 * one shared rule source ⇒ both sides provably agree).
 *
 * Cut codes:
 *   C — Cut the wire.
 *   D — Do NOT cut.
 *   S — Cut iff the last serial-number digit is EVEN.
 *   P — Cut iff the bomb has a Parallel port.
 *   B — Cut iff the bomb has two or more batteries.
 */
export type CutCode = 'C' | 'D' | 'S' | 'P' | 'B';

export interface ComplicatedWiresRow {
  readonly redStripe: boolean;
  readonly blueStripe: boolean;
  readonly star: boolean;
  readonly led: boolean;
  readonly code: CutCode;
}

/**
 * All 16 attribute combinations → code. Transcribed VERBATIM from the GDD's
 * truth-table expansion (do not re-derive from memory). Row order is the
 * natural 4-bit count of (red, blue, star, led) with led the least-significant
 * bit — every 2^4 combination appears exactly once.
 */
export const COMPLICATED_WIRES_TABLE: ReadonlyArray<ComplicatedWiresRow> = [
  { redStripe: false, blueStripe: false, star: false, led: false, code: 'C' },
  { redStripe: false, blueStripe: false, star: false, led: true, code: 'C' },
  { redStripe: false, blueStripe: false, star: true, led: false, code: 'S' },
  { redStripe: false, blueStripe: false, star: true, led: true, code: 'S' },
  { redStripe: false, blueStripe: true, star: false, led: false, code: 'S' },
  { redStripe: false, blueStripe: true, star: false, led: true, code: 'D' },
  { redStripe: false, blueStripe: true, star: true, led: false, code: 'B' },
  { redStripe: false, blueStripe: true, star: true, led: true, code: 'P' },
  { redStripe: true, blueStripe: false, star: false, led: false, code: 'C' },
  { redStripe: true, blueStripe: false, star: false, led: true, code: 'B' },
  { redStripe: true, blueStripe: false, star: true, led: false, code: 'S' },
  { redStripe: true, blueStripe: false, star: true, led: true, code: 'C' },
  { redStripe: true, blueStripe: true, star: false, led: false, code: 'S' },
  { redStripe: true, blueStripe: true, star: false, led: true, code: 'D' },
  { redStripe: true, blueStripe: true, star: true, led: false, code: 'B' },
  { redStripe: true, blueStripe: true, star: true, led: true, code: 'D' },
];

/** BombContext guarantees the serial's last character is a digit (0–9). */
export const serialLastDigitEven = (ctx: BombContext): boolean => {
  const digit = ctx.serialNumber.charCodeAt(ctx.serialNumber.length - 1) - 48;
  return digit % 2 === 0;
};

/**
 * Pure lookup: the cut code for a wire's attribute combination. All 16
 * combinations are present in the table, so the match is total.
 */
export function codeForAttributes(attrs: WireAttributes): CutCode {
  const row = COMPLICATED_WIRES_TABLE.find(
    (r) =>
      r.redStripe === attrs.redStripe &&
      r.blueStripe === attrs.blueStripe &&
      r.star === attrs.star &&
      r.led === attrs.led,
  );
  /* istanbul ignore next -- the table covers all 2^4 combinations (asserted in tests) */
  if (!row) throw new Error('complicated-wires: no truth-table row for attribute combination');
  return row.code;
}

/**
 * Pure cut decision: does THIS wire need to be cut for this bomb context?
 * Applies the wire's code against the public edgework:
 *   C → true, D → false, S → serial last digit even,
 *   P → Parallel port present, B → ≥2 batteries.
 * BombContext is read-only — never mutated.
 */
export function complicatedWiresShouldCut(attrs: WireAttributes, ctx: BombContext): boolean {
  switch (codeForAttributes(attrs)) {
    case 'C':
      return true;
    case 'D':
      return false;
    case 'S':
      return serialLastDigitEven(ctx);
    case 'P':
      return ctx.ports.includes('Parallel');
    case 'B':
      return ctx.batteryCount >= 2;
  }
}
