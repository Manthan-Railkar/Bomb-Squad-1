import { describe, expect, it } from '@jest/globals';
import type { BombContext, ModuleState } from '../../../types/index.js';
import {
  COMPLICATED_WIRES_MODULE_ID,
  isComplicatedWiresAction,
  type ComplicatedWiresState,
  type ComplicatedWiresAction,
  type ComplicatedWire,
  type WireAttributes,
} from '../types.js';
import { generateComplicatedWires } from '../generate.js';
import {
  COMPLICATED_WIRES_TABLE,
  codeForAttributes,
  shouldCut,
  serialLastDigitEven,
  type CutCode,
} from '../solve.js';
import { complicatedWiresReducer } from '../reducer.js';
import { getComplicatedWiresManualPages } from '../manual.js';

/** Serial ends in 4 → last digit EVEN; no Parallel port; 2 batteries. */
const EVEN_CTX: BombContext = {
  serialNumber: 'AB3XK4',
  batteryCount: 2,
  indicators: [{ label: 'FRK', lit: true }],
  ports: ['Serial'],
};
/** Serial ends in 7 → last digit ODD. */
const ODD_CTX: BombContext = { ...EVEN_CTX, serialNumber: 'AB3XK7' };

const attrs = (redStripe: boolean, blueStripe: boolean, star: boolean, led: boolean): WireAttributes => ({
  redStripe,
  blueStripe,
  star,
  led,
});

const cut = (wireIndex: number): ComplicatedWiresAction => ({ type: 'CUT', wireIndex });

/** Deep-frozen armed envelope around explicit wires + ctx (immutability gate). */
const armed = (
  wireAttrs: readonly WireAttributes[],
  ctx: BombContext,
): ModuleState<ComplicatedWiresState> => {
  const wires: ComplicatedWire[] = wireAttrs.map((a) => ({ attrs: a, cut: false }));
  wires.forEach((w) => Object.freeze(w));
  const data: ComplicatedWiresState = { wires, ctx };
  Object.freeze(wires);
  Object.freeze(data);
  return Object.freeze({ moduleId: COMPLICATED_WIRES_MODULE_ID, status: 'armed', data });
};

/**
 * The GDD 16-row truth table hard-coded INDEPENDENTLY of COMPLICATED_WIRES_TABLE
 * (a transcription typo in the constant must fail this — do not import the
 * constant to build it). Tuples: [red, blue, star, led, code].
 */
const EXPECTED: ReadonlyArray<readonly [boolean, boolean, boolean, boolean, CutCode]> = [
  [false, false, false, false, 'C'],
  [false, false, false, true, 'C'],
  [false, false, true, false, 'S'],
  [false, false, true, true, 'S'],
  [false, true, false, false, 'S'],
  [false, true, false, true, 'D'],
  [false, true, true, false, 'B'],
  [false, true, true, true, 'P'],
  [true, false, false, false, 'C'],
  [true, false, false, true, 'B'],
  [true, false, true, false, 'S'],
  [true, false, true, true, 'C'],
  [true, true, false, false, 'S'],
  [true, true, false, true, 'D'],
  [true, true, true, false, 'B'],
  [true, true, true, true, 'D'],
];

describe('COMPLICATED_WIRES_TABLE integrity', () => {
  it('has exactly 16 rows covering all 2^4 combinations with no duplicates/gaps', () => {
    expect(COMPLICATED_WIRES_TABLE).toHaveLength(16);
    const keys = new Set(
      COMPLICATED_WIRES_TABLE.map(
        (r) => `${+r.redStripe}${+r.blueStripe}${+r.star}${+r.led}`,
      ),
    );
    expect(keys.size).toBe(16); // all unique
    for (let i = 0; i < 16; i++) {
      const key = i.toString(2).padStart(4, '0'); // covers 0000..1111
      expect(keys.has(key)).toBe(true);
    }
  });

  it('every code is one of C/D/S/P/B', () => {
    for (const row of COMPLICATED_WIRES_TABLE) {
      expect(['C', 'D', 'S', 'P', 'B']).toContain(row.code);
    }
  });
});

describe('codeForAttributes — matches the GDD table verbatim (independent expectations)', () => {
  it('returns the GDD code for every one of the 16 combinations', () => {
    for (const [red, blue, star, led, code] of EXPECTED) {
      expect(codeForAttributes(attrs(red, blue, star, led))).toBe(code);
    }
  });
});

describe('serialLastDigitEven', () => {
  it('is true for an even trailing digit, false for odd', () => {
    expect(serialLastDigitEven({ ...EVEN_CTX, serialNumber: 'ZZ0' })).toBe(true);
    expect(serialLastDigitEven({ ...EVEN_CTX, serialNumber: 'ZZ4' })).toBe(true);
    expect(serialLastDigitEven({ ...EVEN_CTX, serialNumber: 'ZZ1' })).toBe(false);
    expect(serialLastDigitEven({ ...EVEN_CTX, serialNumber: 'ZZ7' })).toBe(false);
  });
});

describe('shouldCut — 16 combos × bomb-context sweep (AC6, the correctness crux)', () => {
  // Context matrix: serial parity even/odd × Parallel present/absent × batteries 0/1/2.
  const CONTEXTS: ReadonlyArray<{ label: string; ctx: BombContext }> = (() => {
    const out: { label: string; ctx: BombContext }[] = [];
    for (const [serial, evenLabel] of [['SN2', 'even'], ['SN3', 'odd']] as const) {
      for (const ports of [[], ['Parallel']] as const) {
        for (const batteryCount of [0, 1, 2] as const) {
          out.push({
            label: `serial ${evenLabel}/ports ${ports.length}/batts ${batteryCount}`,
            ctx: { serialNumber: serial, batteryCount, indicators: [], ports: [...ports] },
          });
        }
      }
    }
    return out;
  })();

  // Independent code→decision mapping (a second implementation, not the solver's).
  const expectedDecision = (code: CutCode, ctx: BombContext): boolean => {
    if (code === 'C') return true;
    if (code === 'D') return false;
    if (code === 'S') return (ctx.serialNumber.charCodeAt(ctx.serialNumber.length - 1) - 48) % 2 === 0;
    if (code === 'P') return ctx.ports.includes('Parallel');
    return ctx.batteryCount >= 2; // 'B'
  };

  it('every combination yields the correct cut decision under every context', () => {
    for (const [red, blue, star, led, code] of EXPECTED) {
      const a = attrs(red, blue, star, led);
      for (const { ctx } of CONTEXTS) {
        expect(shouldCut(a, ctx)).toBe(expectedDecision(code, ctx));
      }
    }
  });
});

describe('generateComplicatedWires', () => {
  it('is deterministic: same (seed, ctx) → deep-equal state', () => {
    expect(generateComplicatedWires(42, EVEN_CTX)).toEqual(generateComplicatedWires(42, EVEN_CTX));
  });

  it('different seeds eventually produce different instances', () => {
    const first = JSON.stringify(generateComplicatedWires(0, EVEN_CTX));
    const anyDiffers = [1, 2, 3, 4, 5].some(
      (seed) => JSON.stringify(generateComplicatedWires(seed, EVEN_CTX)) !== first,
    );
    expect(anyDiffers).toBe(true);
  });

  it('never calls Math.random (seeded RNG only)', () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error('Math.random is banned in module generation');
    };
    try {
      expect(() => generateComplicatedWires(7, EVEN_CTX)).not.toThrow();
    } finally {
      Math.random = original;
    }
  });

  it('always produces 3–6 wires, all uncut, storing the public ctx by reference (seeds 0–199)', () => {
    for (const ctx of [EVEN_CTX, ODD_CTX]) {
      for (let seed = 0; seed < 200; seed++) {
        const state = generateComplicatedWires(seed, ctx);
        expect(state.wires.length).toBeGreaterThanOrEqual(3);
        expect(state.wires.length).toBeLessThanOrEqual(6);
        expect(state.wires.every((w) => w.cut === false)).toBe(true);
        expect(state.ctx).toBe(ctx);
        expect(Object.keys(state).sort()).toEqual(['ctx', 'wires']);
      }
    }
  });

  it('covers every wire count 3–6 across seeds (no dead branch)', () => {
    const counts = new Set<number>();
    for (let seed = 0; seed < 200; seed++) counts.add(generateComplicatedWires(seed, EVEN_CTX).wires.length);
    expect([...counts].sort()).toEqual([3, 4, 5, 6]);
  });

  it('NON-TRIVIAL-LAYOUT invariant (AC1): every layout has ≥1 should-cut wire — never born-solved', () => {
    // Sweep both serial parities, port present/absent, and battery counts so
    // the ctx-driven re-roll is exercised in every S/P/B regime.
    for (const serialNumber of ['SN0', 'SN1']) {
      for (const ports of [[], ['Parallel'] as const]) {
        for (const batteryCount of [0, 1, 2]) {
          const ctx: BombContext = { serialNumber, batteryCount, indicators: [], ports: [...ports] };
          for (let seed = 0; seed < 300; seed++) {
            const { wires } = generateComplicatedWires(seed, ctx);
            expect(wires.some((w) => shouldCut(w.attrs, ctx))).toBe(true);
          }
        }
      }
    }
  });

  it('is deterministic at seed 0, 1 and a large seed', () => {
    for (const seed of [0, 1, 2 ** 31 - 1]) {
      expect(generateComplicatedWires(seed, EVEN_CTX)).toEqual(generateComplicatedWires(seed, EVEN_CTX));
    }
  });
});

describe('complicatedWiresReducer — contract obligations (frozen inputs throughout)', () => {
  // Under EVEN_CTX (even serial, no Parallel, 2 batteries):
  //   idx0 = C (should cut), idx1 = S even (should cut), idx2 = D (should NOT cut).
  const LAYOUT: readonly WireAttributes[] = [
    attrs(false, false, false, false), // C  → cut
    attrs(false, false, true, false), //  S  → even → cut
    attrs(false, true, false, true), //   D  → do not cut
  ];
  const SHOULD_CUT = [0, 1];
  const SHOULD_NOT_CUT = 2;

  it('happy path: cutting every should-cut wire solves; those wires are severed', () => {
    const state = armed(LAYOUT, EVEN_CTX);
    const afterFirst = complicatedWiresReducer(state, cut(SHOULD_CUT[0]));
    expect(afterFirst.status).toBe('armed'); // not all should-cut severed yet
    expect(afterFirst.data.wires[SHOULD_CUT[0]].cut).toBe(true);
    Object.freeze(afterFirst);
    const solved = complicatedWiresReducer(afterFirst, cut(SHOULD_CUT[1]));
    expect(solved.status).toBe('solved');
    expect(SHOULD_CUT.every((i) => solved.data.wires[i].cut)).toBe(true);
    expect(solved.data.wires[SHOULD_NOT_CUT].cut).toBe(false); // left uncut, which is fine
  });

  it('wrong cut: cutting a should-not-cut wire → transient struck, wire stays severed, not solved', () => {
    const state = armed(LAYOUT, EVEN_CTX);
    const next = complicatedWiresReducer(state, cut(SHOULD_NOT_CUT));
    expect(next.status).toBe('struck');
    expect(next.data.wires[SHOULD_NOT_CUT].cut).toBe(true);
    expect(next.data.wires[SHOULD_CUT[0]].cut).toBe(false);
  });

  it('a wrongly-cut wire does not block solving: cut all should-cut after a strike → solved', () => {
    const state = armed(LAYOUT, EVEN_CTX);
    let s: ModuleState<ComplicatedWiresState> = { ...complicatedWiresReducer(state, cut(SHOULD_NOT_CUT)), status: 'armed' };
    for (const i of SHOULD_CUT) s = complicatedWiresReducer(s, cut(i));
    expect(s.status).toBe('solved');
    expect(s.data.wires[SHOULD_NOT_CUT].cut).toBe(true); // wrongly-cut wire stays severed
  });

  it('idempotency: re-cutting a severed wire is a no-op (no second strike)', () => {
    const state = armed(LAYOUT, EVEN_CTX);
    const afterWrong = { ...complicatedWiresReducer(state, cut(SHOULD_NOT_CUT)), status: 'armed' as const };
    Object.freeze(afterWrong);
    expect(complicatedWiresReducer(afterWrong, cut(SHOULD_NOT_CUT))).toBe(afterWrong);
  });

  it('immutability: never mutates the (frozen) input state', () => {
    const state = armed(LAYOUT, EVEN_CTX);
    expect(() => complicatedWiresReducer(state, cut(SHOULD_CUT[0]))).not.toThrow();
    expect(state.status).toBe('armed');
    expect(state.data.wires.every((w) => !w.cut)).toBe(true);
  });

  it('guard clauses: out-of-bounds, negative, NaN, non-integer index → unchanged', () => {
    const state = armed(LAYOUT, EVEN_CTX);
    for (const wireIndex of [3, 99, -1, Number.NaN, 1.5]) {
      expect(complicatedWiresReducer(state, { type: 'CUT', wireIndex })).toBe(state);
    }
  });

  it('guard clauses: unknown / malformed actions → unchanged (no throw)', () => {
    const state = armed(LAYOUT, EVEN_CTX);
    for (const action of [undefined, null, 42, 'CUT', {}, { type: 'EXPLODE' }, { type: 'CUT' }]) {
      expect(complicatedWiresReducer(state, action)).toBe(state);
    }
  });

  it('solved-inert: actions after solve are no-ops', () => {
    let s = armed(LAYOUT, EVEN_CTX);
    for (const i of SHOULD_CUT) s = complicatedWiresReducer(s, cut(i));
    expect(s.status).toBe('solved');
    Object.freeze(s);
    expect(complicatedWiresReducer(s, cut(SHOULD_NOT_CUT))).toBe(s);
  });

  it('MODULE_RESET restores all wires uncut and re-arms (after wrong cut and after solve)', () => {
    const base = armed(LAYOUT, EVEN_CTX);
    let solved = base as ModuleState<ComplicatedWiresState>;
    for (const i of SHOULD_CUT) solved = complicatedWiresReducer(solved, cut(i));
    for (const dirty of [complicatedWiresReducer(base, cut(SHOULD_NOT_CUT)), solved]) {
      Object.freeze(dirty);
      const reset = complicatedWiresReducer(dirty, { type: 'MODULE_RESET' });
      expect(reset.status).toBe('armed');
      expect(reset.data.wires.every((w) => !w.cut)).toBe(true);
      expect(reset.data.ctx).toBe(EVEN_CTX); // layout + public ctx survive reset
    }
  });

  it('the stored ctx drives solving: same layout, odd serial flips a should-cut wire', () => {
    // idx1 is code S: should-cut under EVEN_CTX, should-NOT-cut under ODD_CTX.
    // Under ODD_CTX only idx0 (C) is should-cut, so cutting idx0 alone solves.
    const oddState = armed(LAYOUT, ODD_CTX);
    const solved = complicatedWiresReducer(oddState, cut(0));
    expect(solved.status).toBe('solved'); // idx1 no longer required under odd serial
  });
});

describe('isComplicatedWiresAction', () => {
  it('accepts CUT with a numeric index and MODULE_RESET', () => {
    expect(isComplicatedWiresAction({ type: 'CUT', wireIndex: 0 })).toBe(true);
    expect(isComplicatedWiresAction({ type: 'MODULE_RESET' })).toBe(true);
  });
  it('rejects malformed payloads', () => {
    for (const bad of [null, 7, 'CUT', { type: 'CUT' }, { type: 'CUT', wireIndex: '0' }, { type: 'NOPE' }]) {
      expect(isComplicatedWiresAction(bad)).toBe(false);
    }
  });
});

describe('getComplicatedWiresManualPages — renders the same constant the solver reads', () => {
  const pages = getComplicatedWiresManualPages();
  const sections = pages[0].sections;
  const truthTable = sections.find((s) => s.table?.headers[0] === 'Red stripe');

  it('is a single complicated-wires chapter with a legend and a 16-row truth table', () => {
    expect(pages).toHaveLength(1);
    expect(pages[0].chapterId).toBe(COMPLICATED_WIRES_MODULE_ID);
    const legend = sections.find((s) => s.table?.headers[0] === 'Code');
    expect(legend!.table!.rows).toHaveLength(5); // C/D/S/P/B
    expect(truthTable).toBeDefined();
    expect(truthTable!.table!.rows).toHaveLength(16);
  });

  it('each truth-table row mirrors COMPLICATED_WIRES_TABLE exactly (manual ↔ solver share the constant)', () => {
    const rows = truthTable!.table!.rows;
    COMPLICATED_WIRES_TABLE.forEach((row, i) => {
      const m = (b: boolean) => (b ? '✓' : '—');
      expect(rows[i]).toEqual([m(row.redStripe), m(row.blueStripe), m(row.star), m(row.led), row.code]);
    });
  });
});
