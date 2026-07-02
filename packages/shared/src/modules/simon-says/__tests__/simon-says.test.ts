import { describe, expect, it } from '@jest/globals';
import type { BombContext, ModuleState } from '../../../types/index.js';
import {
  SIMON_SAYS_MODULE_ID,
  SIMON_COLORS,
  SIMON_COLOR_LABELS,
  SIMON_SEQUENCE_LENGTH,
  isSimonSaysAction,
  type SimonColor,
  type SimonSaysAction,
  type SimonSaysState,
} from '../types.js';
import { generateSimonSays } from '../generate.js';
import {
  SIMON_TABLES,
  serialHasVowel,
  simonTranslate,
  type SimonRow,
  type SimonStrikeRow,
} from '../solve.js';
import { simonSaysReducer } from '../reducer.js';
import { getSimonSaysManualPages } from '../manual.js';

/** Serial 'AB3XK4' contains a vowel (A) → Table A. Last char is a digit. */
const VOWEL_CTX: BombContext = {
  serialNumber: 'AB3XK4',
  batteryCount: 1,
  indicators: [{ label: 'FRK', lit: true }],
  ports: ['Serial'],
};
/** Serial 'BCXKZ4' has NO vowel → Table B. */
const NO_VOWEL_CTX: BombContext = { ...VOWEL_CTX, serialNumber: 'BCXKZ4' };

const press = (color: SimonColor, strikeCount: number): SimonSaysAction => ({
  type: 'PRESS',
  color,
  strikeCount,
});

/** Deep-frozen armed envelope around an explicit sequence + ctx (immutability gate). */
const armed = (
  sequence: readonly SimonColor[],
  ctx: BombContext,
  stage = 1,
  progress = 0,
): ModuleState<SimonSaysState> => {
  const seq = Object.freeze([...sequence]);
  const data: SimonSaysState = { sequence: seq, stage, progress, ctx };
  Object.freeze(data);
  return Object.freeze({ moduleId: SIMON_SAYS_MODULE_ID, status: 'armed', data });
};

/**
 * The GDD translation tables hard-coded INDEPENDENTLY of SIMON_TABLES (a
 * transcription typo in the constant must fail this — do not import the constant
 * to build it). Keyed [table][strikes][flash] → press.
 */
const EXPECTED: Record<'A' | 'B', Record<SimonStrikeRow, Record<SimonColor, SimonColor>>> = {
  // Table A — serial CONTAINS a vowel.
  A: {
    0: { red: 'blue', blue: 'red', green: 'yellow', yellow: 'green' },
    1: { red: 'yellow', blue: 'green', green: 'blue', yellow: 'red' },
    2: { red: 'green', blue: 'red', green: 'yellow', yellow: 'blue' },
  },
  // Table B — serial does NOT contain a vowel.
  B: {
    0: { red: 'blue', blue: 'yellow', green: 'green', yellow: 'red' },
    1: { red: 'red', blue: 'blue', green: 'yellow', yellow: 'green' },
    2: { red: 'yellow', blue: 'green', green: 'blue', yellow: 'red' },
  },
};

const STRIKE_ROWS: readonly SimonStrikeRow[] = [0, 1, 2];

describe('SIMON_TABLES integrity', () => {
  it('every table/row is a total permutation over the four colours', () => {
    for (const table of ['A', 'B'] as const) {
      for (const s of STRIKE_ROWS) {
        const row: SimonRow = SIMON_TABLES[table][s];
        // Every flash colour is a defined, valid press colour.
        for (const flash of SIMON_COLORS) {
          expect(SIMON_COLORS).toContain(row[flash]);
        }
        // The mapping is a bijection (a permutation) — no two flashes collide.
        const outputs = new Set(SIMON_COLORS.map((c) => row[c]));
        expect(outputs.size).toBe(SIMON_COLORS.length);
      }
    }
  });

  it('matches the GDD tables verbatim (independent expectations, all 24 cells)', () => {
    for (const table of ['A', 'B'] as const) {
      for (const s of STRIKE_ROWS) {
        for (const flash of SIMON_COLORS) {
          expect(SIMON_TABLES[table][s][flash]).toBe(EXPECTED[table][s][flash]);
        }
      }
    }
  });
});

describe('serialHasVowel', () => {
  it('detects each vowel and is case-insensitive', () => {
    for (const v of ['A', 'E', 'I', 'O', 'U', 'a', 'e', 'i', 'o', 'u']) {
      expect(serialHasVowel(`X${v}9`)).toBe(true);
    }
  });
  it('is false when no vowel is present', () => {
    expect(serialHasVowel('BCXKZ4')).toBe(false);
    expect(serialHasVowel('9')).toBe(false);
  });
});

describe('simonTranslate — every cell, both tables (AC1, the correctness crux)', () => {
  it('vowel serial → Table A for all strike rows', () => {
    for (const s of STRIKE_ROWS) {
      for (const flash of SIMON_COLORS) {
        expect(simonTranslate(flash, VOWEL_CTX, s)).toBe(EXPECTED.A[s][flash]);
      }
    }
  });
  it('no-vowel serial → Table B for all strike rows', () => {
    for (const s of STRIKE_ROWS) {
      for (const flash of SIMON_COLORS) {
        expect(simonTranslate(flash, NO_VOWEL_CTX, s)).toBe(EXPECTED.B[s][flash]);
      }
    }
  });
});

describe('generateSimonSays', () => {
  it('is deterministic for a given seed', () => {
    expect(generateSimonSays(42, VOWEL_CTX)).toEqual(generateSimonSays(42, VOWEL_CTX));
  });

  it('produces a fixed-length sequence of valid colours, at stage 1 / progress 0', () => {
    for (let seed = 0; seed < 100; seed++) {
      const state = generateSimonSays(seed, VOWEL_CTX);
      expect(state.sequence).toHaveLength(SIMON_SEQUENCE_LENGTH);
      expect(state.stage).toBe(1);
      expect(state.progress).toBe(0);
      for (const c of state.sequence) expect(SIMON_COLORS).toContain(c);
    }
  });

  it('varies across seeds (not a constant sequence)', () => {
    const first = generateSimonSays(0, VOWEL_CTX).sequence.join('');
    const anyDifferent = Array.from({ length: 20 }, (_, i) => i + 1).some(
      (seed) => generateSimonSays(seed, VOWEL_CTX).sequence.join('') !== first,
    );
    expect(anyDifferent).toBe(true);
  });

  it('stores the ctx by reference and never computes/stores an answer', () => {
    const state = generateSimonSays(7, VOWEL_CTX);
    expect(state.ctx).toBe(VOWEL_CTX);
    // No 'answer'/'expected'/'solution' field leaks the translated presses.
    expect(Object.keys(state).sort()).toEqual(['ctx', 'progress', 'sequence', 'stage']);
  });

  it('never calls Math.random (seeded RNG only)', () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error('Math.random is banned in module generation');
    };
    try {
      expect(() => generateSimonSays(3, VOWEL_CTX)).not.toThrow();
    } finally {
      Math.random = original;
    }
  });
});

describe('simonSaysReducer — contract obligations (frozen inputs throughout)', () => {
  it('happy path: correct presses grow the sequence and finally solve (Table A, 0 strikes)', () => {
    // sequence [red, green]; A0: red→blue, green→yellow.
    let state = armed(['red', 'green'], VOWEL_CTX);

    // Stage 1: press blue (red→blue) → stage grows to 2, progress resets.
    let next = simonSaysReducer(state, press('blue', 0));
    expect(next.status).toBe('armed');
    expect(next.data.stage).toBe(2);
    expect(next.data.progress).toBe(0);

    // Stage 2, flash 0 (red→blue): correct, mid-stage.
    Object.freeze(next.data);
    Object.freeze(next);
    state = next;
    next = simonSaysReducer(state, press('blue', 0));
    expect(next.status).toBe('armed');
    expect(next.data.stage).toBe(2);
    expect(next.data.progress).toBe(1);

    // Stage 2, flash 1 (green→yellow): final flash of the final stage → solved.
    Object.freeze(next.data);
    Object.freeze(next);
    state = next;
    next = simonSaysReducer(state, press('yellow', 0));
    expect(next.status).toBe('solved');
  });

  it('wrong press → transient struck and resets the current-stage input to the start', () => {
    // sequence [red, green] advanced to stage 2, progress 1 (one correct press in).
    const state = armed(['red', 'green'], VOWEL_CTX, 2, 1);
    // flash index 1 is green → A0 expects yellow; press blue → wrong.
    const next = simonSaysReducer(state, press('blue', 0));
    expect(next.status).toBe('struck');
    expect(next.data.progress).toBe(0); // replay the stage from the start
    expect(next.data.stage).toBe(2); // stage unchanged
  });

  it('the strike count re-selects the row (same flash, different expected press)', () => {
    // Flash red. A0: red→blue. A1: red→yellow.
    const state = armed(['red'], VOWEL_CTX);
    // Under 0 strikes, pressing yellow is WRONG.
    expect(simonSaysReducer(state, press('yellow', 0)).status).toBe('struck');
    // Under 1 strike, pressing yellow is CORRECT (single-flash → solves).
    expect(simonSaysReducer(state, press('yellow', 1)).status).toBe('solved');
    // Under 0 strikes, pressing blue solves.
    expect(simonSaysReducer(state, press('blue', 0)).status).toBe('solved');
  });

  it('uses Table B when the serial has no vowel', () => {
    // B0: red→blue, blue→yellow. Single flash blue → expects yellow press.
    const state = armed(['blue'], NO_VOWEL_CTX);
    expect(simonSaysReducer(state, press('red', 0)).status).toBe('struck');
    expect(simonSaysReducer(state, press('yellow', 0)).status).toBe('solved');
  });

  it('clamps an out-of-range strike count to the 0..2 rows', () => {
    // A high (illegal) strike count clamps to row 2. A2: red→green.
    const state = armed(['red'], VOWEL_CTX);
    expect(simonSaysReducer(state, press('green', 9)).status).toBe('solved');
    // A negative one clamps to row 0. A0: red→blue.
    expect(simonSaysReducer(state, press('blue', -5)).status).toBe('solved');
  });

  it('solved-inert: a press on a solved module is a no-op (same ref)', () => {
    const solved = Object.freeze({
      ...armed(['red'], VOWEL_CTX),
      status: 'solved' as const,
    });
    expect(simonSaysReducer(solved, press('blue', 0))).toBe(solved);
  });

  it('immutability: never mutates the (frozen) input state', () => {
    const state = armed(['red', 'green'], VOWEL_CTX);
    expect(() => simonSaysReducer(state, press('blue', 0))).not.toThrow();
    // Original untouched.
    expect(state.data.stage).toBe(1);
    expect(state.data.progress).toBe(0);
    expect(state.status).toBe('armed');
  });

  it('guard: malformed / unknown actions are no-ops (same ref)', () => {
    const state = armed(['red'], VOWEL_CTX);
    const bad: unknown[] = [
      undefined,
      null,
      42,
      'PRESS',
      {},
      { type: 'EXPLODE' },
      { type: 'PRESS' }, // missing color/strikeCount
      { type: 'PRESS', color: 'purple', strikeCount: 0 }, // invalid colour
      { type: 'PRESS', color: 'red' }, // missing strikeCount
      { type: 'PRESS', color: 'red', strikeCount: '0' }, // non-number strikeCount
    ];
    for (const action of bad) {
      expect(simonSaysReducer(state, action)).toBe(state);
    }
  });

  it('MODULE_RESET restores stage 1 / progress 0; sequence + ctx preserved; still solvable', () => {
    const advanced = armed(['red', 'green'], VOWEL_CTX, 2, 1);
    const reset = simonSaysReducer(advanced, { type: 'MODULE_RESET' });
    expect(reset.status).toBe('armed');
    expect(reset.data.stage).toBe(1);
    expect(reset.data.progress).toBe(0);
    expect(reset.data.sequence).toEqual(['red', 'green']);
    expect(reset.data.ctx).toBe(VOWEL_CTX);
    // Still solvable from the reset state (red→blue at 0 strikes).
    expect(simonSaysReducer(reset, press('blue', 0)).data.stage).toBe(2);
  });

  it('MODULE_RESET on an already-reset armed module is a no-op (same ref)', () => {
    const state = armed(['red'], VOWEL_CTX);
    expect(simonSaysReducer(state, { type: 'MODULE_RESET' })).toBe(state);
  });
});

describe('isSimonSaysAction', () => {
  it('accepts well-formed PRESS and MODULE_RESET', () => {
    expect(isSimonSaysAction({ type: 'PRESS', color: 'red', strikeCount: 0 })).toBe(true);
    expect(isSimonSaysAction({ type: 'MODULE_RESET' })).toBe(true);
  });
  it('rejects malformed input', () => {
    expect(isSimonSaysAction(null)).toBe(false);
    expect(isSimonSaysAction({ type: 'PRESS', color: 'red' })).toBe(false);
    expect(isSimonSaysAction({ type: 'PRESS', color: 'pink', strikeCount: 0 })).toBe(false);
    expect(isSimonSaysAction({ type: 'PRESS', color: 'red', strikeCount: '0' })).toBe(false);
  });
});

describe('getSimonSaysManualPages — renders the same constant the solver reads', () => {
  const pages = getSimonSaysManualPages();

  it('is a single chapter keyed by the module id', () => {
    expect(pages).toHaveLength(1);
    expect(pages[0].chapterId).toBe(SIMON_SAYS_MODULE_ID);
  });

  it('every flashed→press row equals SIMON_TABLES', () => {
    const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
    for (const table of ['A', 'B'] as const) {
      for (const s of STRIKE_ROWS) {
        const label = table === 'A' ? 'Table A' : 'Table B';
        const heading = `${label} · ${s === 0 ? 'No strikes' : s === 1 ? '1 strike' : '2 strikes'}`;
        const section = pages[0].sections.find((sec) => sec.heading === heading);
        expect(section?.table).toBeDefined();
        const rows = section!.table!.rows;
        for (const flash of SIMON_COLORS) {
          const row = rows.find((r) => r[0] === cap(flash));
          expect(row?.[1]).toBe(cap(SIMON_TABLES[table][s][flash]));
        }
      }
    }
  });

  it('carries a colorblind label↔colour table', () => {
    const confirm = pages[0].sections.find((s) => s.heading === 'Confirming colours');
    expect(confirm?.table?.rows).toEqual(
      SIMON_COLORS.map((c) => [SIMON_COLOR_LABELS[c], c[0].toUpperCase() + c.slice(1)]),
    );
  });
});
