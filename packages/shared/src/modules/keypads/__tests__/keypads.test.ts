import { describe, expect, it } from '@jest/globals';
import type { ModuleState } from '../../../types/index.js';
import {
  KEYPADS_MODULE_ID,
  KEY_COUNT,
  KEYPAD_COLUMN_COUNT,
  SYMBOLS_PER_COLUMN,
  KEYPAD_SYMBOLS,
  KEYPAD_COLUMNS,
  KEYPAD_SYMBOL_GLYPHS,
  isKeypadsAction,
  type KeypadsState,
  type KeypadsAction,
  type SymbolId,
} from '../types.js';
import { generateKeypads } from '../generate.js';
import { solutionColumn, solutionOrder, countContainingColumns, isNextCorrect } from '../solve.js';
import { keypadsReducer } from '../reducer.js';
import { getKeypadsManualPages } from '../manual.js';

/** Deep-frozen armed envelope (immutability gate). */
const armed = (data: KeypadsState): ModuleState<KeypadsState> => {
  Object.freeze(data.keys);
  Object.freeze(data.pressed);
  Object.freeze(data);
  return Object.freeze({ moduleId: KEYPADS_MODULE_ID, status: 'armed', data });
};

/** State whose four keys are the first four symbols of reference column `col`,
 *  placed on the grid in the given order (grid index i → column[order[i]]). */
const stateForColumn = (col: number, order: number[] = [0, 1, 2, 3], pressed: number[] = []): ModuleState<KeypadsState> => {
  const keys = order.map((row) => KEYPAD_COLUMNS[col][row]);
  return armed({ keys, pressed });
};

const press = (keyIndex: number): KeypadsAction => ({ type: 'PRESS', keyIndex });

/** Drive a full correct solve on `s` and return the terminal state. */
const solveInOrder = (s: ModuleState<KeypadsState>): ModuleState<KeypadsState> => {
  let cur = s;
  for (const keyIndex of solutionOrder(cur.data.keys)) {
    cur = keypadsReducer(cur, press(keyIndex));
  }
  return cur;
};

describe('KEYPAD_COLUMNS / KEYPAD_SYMBOLS — table integrity (AC1, AC3)', () => {
  it('has exactly six reference columns', () => {
    expect(KEYPAD_COLUMNS).toHaveLength(KEYPAD_COLUMN_COUNT);
  });

  it('every column has exactly seven symbols, top-to-bottom', () => {
    for (const col of KEYPAD_COLUMNS) expect(col).toHaveLength(SYMBOLS_PER_COLUMN);
  });

  it('every symbol used is a member of KEYPAD_SYMBOLS', () => {
    const vocab = new Set<string>(KEYPAD_SYMBOLS);
    for (const col of KEYPAD_COLUMNS) for (const sym of col) expect(vocab.has(sym)).toBe(true);
  });

  it('no column contains a duplicate symbol', () => {
    for (const col of KEYPAD_COLUMNS) expect(new Set(col).size).toBe(col.length);
  });

  it('KEYPAD_SYMBOLS has no duplicate ids and every id has a glyph + label', () => {
    expect(new Set(KEYPAD_SYMBOLS).size).toBe(KEYPAD_SYMBOLS.length);
    for (const id of KEYPAD_SYMBOLS) {
      const entry = KEYPAD_SYMBOL_GLYPHS[id];
      expect(entry).toBeDefined();
      expect(entry.glyph.length).toBeGreaterThan(0);
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it('symbols recur across columns (the uniqueness crux exists in the data)', () => {
    // e.g. lambda-italic appears in cols 1, 2 and 3.
    const cols = KEYPAD_COLUMNS.map((c, i) => (c.includes('lambda-italic') ? i : -1)).filter((i) => i >= 0);
    expect(cols).toEqual([0, 1, 2]);
  });

  it('no two columns share KEY_COUNT or more symbols — the invariant that makes every 4-subset unambiguous (AC1)', () => {
    // This is the property that actually guarantees AC1: a 4-subset drawn from
    // one column can only be contained in a second column if the two columns
    // share ≥ KEY_COUNT symbols. With the canonical table the max pairwise
    // overlap is 3, so generation's per-instance uniqueness check never fires —
    // it is a firewall. A column edit pushing an overlap to 4 must fail HERE,
    // loudly, not rely on the probabilistic seed sweep to notice.
    for (let a = 0; a < KEYPAD_COLUMNS.length; a++) {
      for (let b = a + 1; b < KEYPAD_COLUMNS.length; b++) {
        const overlap = KEYPAD_COLUMNS[a].filter((sym) => KEYPAD_COLUMNS[b].includes(sym)).length;
        expect(overlap).toBeLessThan(KEY_COUNT);
      }
    }
  });
});

describe('generateKeypads — determinism + uniqueness (AC1)', () => {
  it('is deterministic: the same seed produces deep-equal state', () => {
    expect(generateKeypads(42)).toEqual(generateKeypads(42));
  });

  it('different seeds eventually produce different instances', () => {
    const first = JSON.stringify(generateKeypads(0));
    const anyDiffers = [1, 2, 3, 4, 5, 6, 7, 8].some((seed) => JSON.stringify(generateKeypads(seed)) !== first);
    expect(anyDiffers).toBe(true);
  });

  it('produces four grid symbols from the vocabulary and an empty pressed list', () => {
    for (const seed of [0, 1, 7, 99, 1000, 123456]) {
      const s = generateKeypads(seed);
      expect(s.keys).toHaveLength(KEY_COUNT);
      expect(s.pressed).toEqual([]);
      const vocab = new Set<string>(KEYPAD_SYMBOLS);
      for (const sym of s.keys) expect(vocab.has(sym)).toBe(true);
      // four distinct symbols on the grid
      expect(new Set(s.keys).size).toBe(KEY_COUNT);
    }
  });

  it('EXACTLY ONE reference column contains all four keys for every seed in a wide sweep (AC1)', () => {
    for (let seed = 0; seed < 500; seed++) {
      expect(countContainingColumns(generateKeypads(seed).keys)).toBe(1);
    }
  });

  it('is never born with progress (pressed is always empty)', () => {
    for (let seed = 0; seed < 500; seed++) {
      expect(generateKeypads(seed).pressed).toHaveLength(0);
    }
  });

  it('never calls Math.random (seeded RNG only)', () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error('Math.random is banned in module generation');
    };
    try {
      expect(() => generateKeypads(7)).not.toThrow();
    } finally {
      Math.random = original;
    }
  });
});

describe('solve helpers', () => {
  it('countContainingColumns counts every reference column containing all keys', () => {
    // First four of column 0 belong to column 0 only (unique).
    expect(countContainingColumns(KEYPAD_COLUMNS[0].slice(0, 4))).toBe(1);
  });

  it('countContainingColumns returns 0 when no column contains all four', () => {
    // Mix symbols that never co-occur in one column.
    expect(countContainingColumns(['copyright', 'omega', 'ae', 'star-solid'])).toBe(0);
  });

  it('solutionColumn returns the unique containing column index', () => {
    const keys = KEYPAD_COLUMNS[2].slice(0, 4) as SymbolId[];
    // guard: only meaningful if unique
    expect(countContainingColumns(keys)).toBe(1);
    expect(solutionColumn(keys)).toBe(2);
  });

  it('solutionColumn returns -1 for a non-unique / no-column set', () => {
    expect(solutionColumn(['copyright', 'omega', 'ae', 'star-solid'])).toBe(-1);
  });

  it('solutionOrder returns grid indices sorted by top-to-bottom column position', () => {
    // Place column-0 rows [3,1,0,2] on grid indices [0,1,2,3]; the correct order
    // is grid indices sorted by row → rows 0,1,2,3 sit at grid 2,1,3,0.
    const order = [3, 1, 0, 2];
    const keys = order.map((row) => KEYPAD_COLUMNS[0][row]) as SymbolId[];
    expect(solutionOrder(keys)).toEqual([2, 1, 3, 0]);
  });

  it('isNextCorrect reflects the next expected grid index', () => {
    const s = stateForColumn(0, [0, 1, 2, 3]);
    // With grid i → column row i, the correct order is grid [0,1,2,3].
    expect(isNextCorrect(s.data, 0)).toBe(true);
    expect(isNextCorrect(s.data, 1)).toBe(false);
  });
});

describe('keypadsReducer — contract obligations (frozen inputs throughout)', () => {
  it('happy path: pressing in solution order solves', () => {
    const s = stateForColumn(1); // keys = column 1 rows 0..3, grid order = [0,1,2,3]
    const solved = solveInOrder(s);
    expect(solved.status).toBe('solved');
    expect(solved.data.pressed).toHaveLength(KEY_COUNT);
  });

  it('a correct press advances but does not solve until the fourth', () => {
    const s = stateForColumn(0, [0, 1, 2, 3]);
    const order = solutionOrder(s.data.keys);
    const one = keypadsReducer(s, press(order[0]));
    expect(one.status).toBe('armed');
    expect(one.data.pressed).toEqual([order[0]]);
  });

  it('an out-of-order press strikes and leaves pressed unchanged (progress kept)', () => {
    const s = stateForColumn(0, [0, 1, 2, 3]);
    const order = solutionOrder(s.data.keys); // [0,1,2,3]
    const wrong = order[1]; // not the first expected
    const next = keypadsReducer(s, press(wrong));
    expect(next.status).toBe('struck');
    expect(next.data.pressed).toEqual(s.data.pressed);
    expect(next.data.keys).toEqual(s.data.keys);
  });

  it('preserves correct progress across a strike, then can finish', () => {
    let s = stateForColumn(2, [0, 1, 2, 3]);
    const order = solutionOrder(s.data.keys);
    s = keypadsReducer(s, press(order[0])); // correct
    const struck = keypadsReducer(s, press(order[2])); // out of order → strike
    expect(struck.status).toBe('struck');
    expect(struck.data.pressed).toEqual([order[0]]); // progress kept
    // continue from the (struck, re-armed by the bomb reducer) progress
    let cur: ModuleState<KeypadsState> = armed({ keys: s.data.keys, pressed: [...s.data.pressed] });
    for (const k of order.slice(1)) cur = keypadsReducer(cur, press(k));
    expect(cur.status).toBe('solved');
  });

  it('pressing an already-pressed index is a no-op (idempotent), not a strike', () => {
    const s = stateForColumn(0, [0, 1, 2, 3]);
    const order = solutionOrder(s.data.keys);
    const one = keypadsReducer(s, press(order[0]));
    expect(keypadsReducer(one, press(order[0]))).toBe(one);
  });

  it('out-of-bounds / NaN / non-integer keyIndex falls through unchanged (guard)', () => {
    const s = stateForColumn(0);
    expect(keypadsReducer(s, press(-1))).toBe(s);
    expect(keypadsReducer(s, press(KEY_COUNT))).toBe(s);
    expect(keypadsReducer(s, press(99))).toBe(s);
    expect(keypadsReducer(s, press(NaN))).toBe(s);
    expect(keypadsReducer(s, press(1.5))).toBe(s);
  });

  it('unknown / malformed actions fall through unchanged (guard, no throw)', () => {
    const s = stateForColumn(0);
    expect(keypadsReducer(s, { type: 'WAT' })).toBe(s);
    expect(keypadsReducer(s, { type: 'PRESS' })).toBe(s); // no keyIndex
    expect(keypadsReducer(s, { type: 'PRESS', keyIndex: 'x' })).toBe(s);
    expect(keypadsReducer(s, null)).toBe(s);
    expect(keypadsReducer(s, undefined)).toBe(s);
  });

  it('solved module is inert to PRESS', () => {
    const solved = Object.freeze({
      moduleId: KEYPADS_MODULE_ID,
      status: 'solved' as const,
      data: stateForColumn(0).data,
    });
    expect(keypadsReducer(solved, press(0))).toBe(solved);
  });

  it('MODULE_RESET clears pressed and re-arms', () => {
    const struck = Object.freeze({
      moduleId: KEYPADS_MODULE_ID,
      status: 'struck' as const,
      data: Object.freeze({ keys: KEYPAD_COLUMNS[0].slice(0, 4), pressed: Object.freeze([2, 1]) }),
    });
    const next = keypadsReducer(struck, { type: 'MODULE_RESET' });
    expect(next.status).toBe('armed');
    expect(next.data.pressed).toEqual([]);
    expect(next.data.keys).toEqual(struck.data.keys); // layout preserved
  });

  it('MODULE_RESET on an already-armed, unpressed module is a structural no-op', () => {
    const s = stateForColumn(0, [0, 1, 2, 3], []);
    expect(keypadsReducer(s, { type: 'MODULE_RESET' })).toBe(s);
  });

  it('MODULE_RESET deliberately re-arms even a SOLVED module (passwords-template semantics)', () => {
    // The one sanctioned exception to solved-inert: reset is forwarded whole,
    // bypassing the bomb reducer's solved guard (sandbox Reset / bomb-level
    // reset path) — pinned so a refactor reordering the guards fails loud.
    const solved = solveInOrder(stateForColumn(0));
    expect(solved.status).toBe('solved');
    const reset = keypadsReducer(Object.freeze(solved), { type: 'MODULE_RESET' });
    expect(reset.status).toBe('armed');
    expect(reset.data.pressed).toEqual([]);
    expect(reset.data.keys).toEqual(solved.data.keys); // layout preserved
  });

  it('a lingering struck status behaves like armed: correct press advances, wrong press stays struck', () => {
    // 'struck' is transient (the bomb reducer re-arms), but the reducer must be
    // safe standalone — a PRESS arriving while status is still 'struck' judges
    // the order exactly as if armed.
    const base = stateForColumn(3, [0, 1, 2, 3]);
    const order = solutionOrder(base.data.keys);
    const struck = Object.freeze({ ...base, status: 'struck' as const });
    const advanced = keypadsReducer(struck, press(order[0]));
    expect(advanced.status).toBe('armed');
    expect(advanced.data.pressed).toEqual([order[0]]);
    const struckAgain = keypadsReducer(struck, press(order[2]));
    expect(struckAgain.status).toBe('struck');
    expect(struckAgain.data.pressed).toEqual([]);
  });

  it('a malformed state whose keys resolve to no column is inert, not an unsolvable strike faucet', () => {
    // Never produced by generate — corrupted/persisted state or a future data
    // edit. Without the guard every in-bounds press would strike forever
    // (solutionOrder returns [] → order[pressed.length] is undefined) and
    // MODULE_RESET could not cure it.
    const malformed = armed({ keys: ['copyright', 'omega', 'ae', 'star-solid'], pressed: [] });
    expect(countContainingColumns(malformed.data.keys)).toBe(0);
    for (let keyIndex = 0; keyIndex < KEY_COUNT; keyIndex++) {
      expect(keypadsReducer(malformed, press(keyIndex))).toBe(malformed);
    }
  });

  it('never mutates a frozen input state (immutability gate)', () => {
    const s = stateForColumn(0, [0, 1, 2, 3]);
    const order = solutionOrder(s.data.keys);
    expect(() => keypadsReducer(s, press(order[0]))).not.toThrow();
    expect(() => keypadsReducer(s, press(order[1]))).not.toThrow(); // wrong order → strike
    expect(s.data.pressed).toEqual([]); // original untouched
  });

  it('is idempotent after solve (repeat actions no-op)', () => {
    const solved = solveInOrder(stateForColumn(0));
    expect(solved.status).toBe('solved');
    expect(keypadsReducer(Object.freeze(solved), press(0))).toBe(solved);
  });

  it('solves end-to-end for a swept set of generated instances', () => {
    for (let seed = 0; seed < 100; seed++) {
      const data = generateKeypads(seed);
      const solved = solveInOrder(armed(data));
      expect(solved.status).toBe('solved');
    }
  });
});

describe('isKeypadsAction', () => {
  it('accepts PRESS and MODULE_RESET', () => {
    expect(isKeypadsAction({ type: 'PRESS', keyIndex: 0 })).toBe(true);
    expect(isKeypadsAction({ type: 'MODULE_RESET' })).toBe(true);
  });

  it('rejects malformed actions', () => {
    expect(isKeypadsAction({ type: 'PRESS' })).toBe(false);
    expect(isKeypadsAction({ type: 'PRESS', keyIndex: '0' })).toBe(false);
    expect(isKeypadsAction({ type: 'CUT', wireIndex: 0 })).toBe(false);
    expect(isKeypadsAction(null)).toBe(false);
    expect(isKeypadsAction({})).toBe(false);
  });
});

describe('getKeypadsManualPages — generated from the same table as the solver', () => {
  const pages = getKeypadsManualPages();

  it('is a single keypads chapter', () => {
    expect(pages).toHaveLength(1);
    expect(pages[0].chapterId).toBe(KEYPADS_MODULE_ID);
  });

  it('renders exactly KEYPAD_COLUMNS as glyphs (manual ↔ solver share the constant)', () => {
    const table = pages[0].sections.find((s) => s.table)?.table;
    expect(table).toBeDefined();
    // Six reference-column headers plus a trailing spacer (absorbs the viewer's
    // right-align-last-column rule); every row carries the same trailing spacer.
    expect(table!.headers.slice(0, KEYPAD_COLUMN_COUNT)).toEqual(['Col 1', 'Col 2', 'Col 3', 'Col 4', 'Col 5', 'Col 6']);
    expect(table!.headers[KEYPAD_COLUMN_COUNT]).toBe('');
    for (const row of table!.rows) expect(row[KEYPAD_COLUMN_COUNT]).toBe('');
    // Reconstruct the columns from the rendered rows and compare to the source.
    for (let c = 0; c < KEYPAD_COLUMN_COUNT; c++) {
      const rendered = table!.rows.map((row) => row[c]);
      const expected = KEYPAD_COLUMNS[c].map((id) => KEYPAD_SYMBOL_GLYPHS[id].glyph);
      expect(rendered).toEqual(expected);
    }
  });
});
