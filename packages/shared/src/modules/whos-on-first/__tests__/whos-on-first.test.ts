import { describe, expect, it } from '@jest/globals';
import type { ModuleState } from '../../../types/index.js';
import {
  WHOS_ON_FIRST_MODULE_ID,
  BUTTON_COUNT,
  DISPLAY_POSITIONS,
  DISPLAY_WORDS,
  LABEL_PRIORITIES,
  WOF_BUTTON_LABELS,
  POSITION_NAMES,
  isWhosOnFirstAction,
  type WhosOnFirstState,
  type WhosOnFirstAction,
} from '../types.js';
import { generateWhosOnFirst } from '../generate.js';
import { readPosition, readLabel, solutionIndex, isCorrectPress } from '../solve.js';
import { whosOnFirstReducer } from '../reducer.js';
import { getWhosOnFirstManualPages } from '../manual.js';

/** The two canonical 14-word label families (Step-2). */
const FAMILY_A = ['READY', 'FIRST', 'NO', 'BLANK', 'NOTHING', 'YES', 'WHAT', 'UHHH', 'LEFT', 'RIGHT', 'MIDDLE', 'OKAY', 'WAIT', 'PRESS'];
const FAMILY_B = ['YOU', 'YOU ARE', 'YOUR', "YOU'RE", 'UR', 'U', 'UH HUH', 'UH UH', 'WHAT?', 'DONE', 'NEXT', 'HOLD', 'SURE', 'LIKE'];

/** Deep-frozen armed envelope (immutability gate). */
const armed = (data: WhosOnFirstState): ModuleState<WhosOnFirstState> => {
  Object.freeze(data.labels);
  Object.freeze(data);
  return Object.freeze({ moduleId: WHOS_ON_FIRST_MODULE_ID, status: 'armed', data });
};

const press = (buttonIndex: number): WhosOnFirstAction => ({ type: 'PRESS', buttonIndex });

describe('DISPLAY_POSITIONS — Step-1 table integrity (AC1, AC3)', () => {
  it('has exactly 28 display words', () => {
    expect(Object.keys(DISPLAY_POSITIONS)).toHaveLength(28);
    expect(DISPLAY_WORDS).toHaveLength(28);
  });

  it('every position is a valid button index 0..5', () => {
    for (const word of DISPLAY_WORDS) {
      const pos = DISPLAY_POSITIONS[word];
      expect(Number.isInteger(pos)).toBe(true);
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThan(BUTTON_COUNT);
    }
  });

  it('includes the blank display and the known canonical entries', () => {
    expect(DISPLAY_POSITIONS['']).toBe(4); // blank → bottom-left
    expect(DISPLAY_POSITIONS.YES).toBe(2); // middle-left
    expect(DISPLAY_POSITIONS.UR).toBe(0); // top-left
    expect(DISPLAY_POSITIONS.BLANK).toBe(3); // middle-right
    expect(DISPLAY_POSITIONS.DISPLAY).toBe(5); // bottom-right
  });
});

describe('LABEL_PRIORITIES — Step-2 table integrity (AC1, AC3)', () => {
  it('has exactly 28 button labels', () => {
    expect(Object.keys(LABEL_PRIORITIES)).toHaveLength(28);
    expect(WOF_BUTTON_LABELS).toHaveLength(28);
  });

  it('the two families are exactly the 28 labels and are disjoint', () => {
    expect(new Set([...FAMILY_A, ...FAMILY_B]).size).toBe(28);
    expect(new Set(WOF_BUTTON_LABELS)).toEqual(new Set([...FAMILY_A, ...FAMILY_B]));
    for (const a of FAMILY_A) expect(FAMILY_B).not.toContain(a);
  });

  it('every list is a 14-word permutation of its own family (no cross-family words, no dupes)', () => {
    for (const label of WOF_BUTTON_LABELS) {
      const list = LABEL_PRIORITIES[label];
      const family = FAMILY_A.includes(label) ? FAMILY_A : FAMILY_B;
      expect(list).toHaveLength(14);
      expect(new Set(list).size).toBe(14); // no duplicates
      expect(new Set(list)).toEqual(new Set(family)); // exactly the family
    }
  });

  it('every list contains its own label (guarantees a solution always exists)', () => {
    for (const label of WOF_BUTTON_LABELS) {
      expect(LABEL_PRIORITIES[label]).toContain(label);
    }
  });
});

describe('generateWhosOnFirst — determinism + structural solvability (AC1)', () => {
  it('is deterministic: the same seed produces deep-equal state', () => {
    expect(generateWhosOnFirst(42)).toEqual(generateWhosOnFirst(42));
  });

  it('is seed-sensitive: a 64-seed sweep yields many distinct boards', () => {
    const boards = new Set<string>();
    for (let seed = 0; seed < 64; seed++) boards.add(JSON.stringify(generateWhosOnFirst(seed)));
    // 6-of-28 label draws + 28 displays: collisions are astronomically unlikely;
    // anything under ~90% distinct means the generator is ignoring the seed.
    expect(boards.size).toBeGreaterThanOrEqual(58);
  });

  it('produces a known display word and six distinct button labels for every seed', () => {
    const displaySet = new Set<string>(DISPLAY_WORDS);
    const labelSet = new Set<string>(WOF_BUTTON_LABELS);
    for (const seed of [0, 1, 7, 99, 1000, 123456]) {
      const s = generateWhosOnFirst(seed);
      expect(displaySet.has(s.display)).toBe(true);
      expect(s.labels).toHaveLength(BUTTON_COUNT);
      expect(new Set(s.labels).size).toBe(BUTTON_COUNT); // distinct
      for (const l of s.labels) expect(labelSet.has(l)).toBe(true);
    }
  });

  it('every generated instance has a valid solution index in a wide sweep (AC1)', () => {
    for (let seed = 0; seed < 500; seed++) {
      const s = generateWhosOnFirst(seed);
      const sol = solutionIndex(s);
      expect(sol).toBeGreaterThanOrEqual(0);
      expect(sol).toBeLessThan(BUTTON_COUNT);
    }
  });

  it('never calls Math.random (seeded RNG only)', () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error('Math.random is banned in module generation');
    };
    try {
      expect(() => generateWhosOnFirst(7)).not.toThrow();
    } finally {
      Math.random = original;
    }
  });
});

describe('solve helpers — hand-worked example verified against the manual', () => {
  // display 'FIRST' → Step-1 position 1 (top-right). labels[1] = 'READY'.
  // LABEL_PRIORITIES['READY'] = [YES, OKAY, ...]; first list word on the module
  // is 'YES' at index 3 → solution is button 3.
  const data: WhosOnFirstState = { display: 'FIRST', labels: ['NO', 'READY', 'BLANK', 'YES', 'OKAY', 'LEFT'] };

  it('readPosition maps the display via Step-1', () => {
    expect(readPosition('FIRST')).toBe(1);
    expect(readPosition('')).toBe(4); // blank display is a known word
    expect(readPosition('NOT-A-WORD')).toBe(-1);
  });

  it('readLabel reads the label at the Step-1 position', () => {
    expect(readLabel(data)).toBe('READY');
  });

  it('solutionIndex walks the priority list to the first button present', () => {
    expect(solutionIndex(data)).toBe(3); // 'YES'
  });

  it('isCorrectPress is true only for the solution index', () => {
    expect(isCorrectPress(data, 3)).toBe(true);
    for (const i of [0, 1, 2, 4, 5]) expect(isCorrectPress(data, i)).toBe(false);
  });

  it('solutionIndex returns -1 for an unknown display (untrusted path)', () => {
    expect(solutionIndex({ display: 'ZZZ', labels: data.labels })).toBe(-1);
  });

  it('readLabel/solutionIndex guard a labels array shorter than the read position (untrusted path)', () => {
    // display 'FIRST' → position 1, but only one label present
    const short: WhosOnFirstState = { display: 'FIRST', labels: ['NO'] };
    expect(readLabel(short)).toBe('');
    expect(solutionIndex(short)).toBe(-1);
    expect(readLabel({ display: 'FIRST', labels: [] })).toBe('');
  });

  it('solutionIndex is prototype-safe: an Object.prototype key as read label returns -1, never throws', () => {
    // display 'FIRST' → position 1 → read label 'constructor' (inherited, not an own table key)
    const hostile: WhosOnFirstState = { display: 'FIRST', labels: ['NO', 'constructor', 'BLANK', 'YES', 'OKAY', 'LEFT'] };
    expect(() => solutionIndex(hostile)).not.toThrow();
    expect(solutionIndex(hostile)).toBe(-1);
  });
});

describe('whosOnFirstReducer — contract obligations (frozen inputs throughout)', () => {
  const data: WhosOnFirstState = { display: 'FIRST', labels: ['NO', 'READY', 'BLANK', 'YES', 'OKAY', 'LEFT'] };
  const sol = 3; // computed above

  it('happy path: pressing the solution button solves', () => {
    const s = armed(data);
    const next = whosOnFirstReducer(s, press(sol));
    expect(next.status).toBe('solved');
    expect(next.data).toBe(s.data); // board unchanged — same reference, no gratuitous copy
  });

  it('a wrong press strikes and leaves the board unchanged', () => {
    const s = armed(data);
    const wrong = whosOnFirstReducer(s, press(0));
    expect(wrong.status).toBe('struck');
    expect(wrong.data).toBe(s.data); // same reference
  });

  it('an unsolvable (malformed) board is inert, not a strike faucet', () => {
    // Unknown display word → solutionIndex === -1: every press must fall
    // through unchanged (mirror keypads' malformed-state guard) — striking
    // forever would be uncurable even by MODULE_RESET.
    const s = armed({ display: 'ZZZ', labels: data.labels });
    for (let i = 0; i < BUTTON_COUNT; i++) expect(whosOnFirstReducer(s, press(i))).toBe(s);
    // Prototype-hostile read label: inert, never throws.
    const hostile = armed({ display: 'FIRST', labels: ['NO', 'constructor', 'BLANK', 'YES', 'OKAY', 'LEFT'] });
    expect(() => whosOnFirstReducer(hostile, press(0))).not.toThrow();
    expect(whosOnFirstReducer(hostile, press(0))).toBe(hostile);
  });

  it('out-of-bounds / NaN / non-integer buttonIndex falls through unchanged (guard)', () => {
    const s = armed(data);
    expect(whosOnFirstReducer(s, press(-1))).toBe(s);
    expect(whosOnFirstReducer(s, press(BUTTON_COUNT))).toBe(s);
    expect(whosOnFirstReducer(s, press(99))).toBe(s);
    expect(whosOnFirstReducer(s, press(NaN))).toBe(s);
    expect(whosOnFirstReducer(s, press(2.5))).toBe(s);
  });

  it('unknown / malformed actions fall through unchanged (guard, no throw)', () => {
    const s = armed(data);
    expect(whosOnFirstReducer(s, { type: 'WAT' })).toBe(s);
    expect(whosOnFirstReducer(s, { type: 'PRESS' })).toBe(s); // no buttonIndex
    expect(whosOnFirstReducer(s, { type: 'PRESS', buttonIndex: 'x' })).toBe(s);
    expect(whosOnFirstReducer(s, null)).toBe(s);
    expect(whosOnFirstReducer(s, undefined)).toBe(s);
  });

  it('solved module is inert to PRESS (idempotent after solve)', () => {
    const solved = Object.freeze({ moduleId: WHOS_ON_FIRST_MODULE_ID, status: 'solved' as const, data: armed(data).data });
    expect(whosOnFirstReducer(solved, press(sol))).toBe(solved);
    expect(whosOnFirstReducer(solved, press(0))).toBe(solved);
  });

  it('MODULE_RESET re-arms with the same board', () => {
    const struck = Object.freeze({ moduleId: WHOS_ON_FIRST_MODULE_ID, status: 'struck' as const, data: armed(data).data });
    const next = whosOnFirstReducer(struck, { type: 'MODULE_RESET' });
    expect(next.status).toBe('armed');
    expect(next.data).toBe(struck.data); // board preserved — same reference
  });

  it('MODULE_RESET re-arms even a SOLVED module (deliberate template exception — pin it)', () => {
    // Like keypads/passwords: MODULE_RESET is forwarded whole, bypassing the
    // bomb reducer's solved guard, and re-arms even a solved module.
    const solved = Object.freeze({ moduleId: WHOS_ON_FIRST_MODULE_ID, status: 'solved' as const, data: armed(data).data });
    const next = whosOnFirstReducer(solved, { type: 'MODULE_RESET' });
    expect(next.status).toBe('armed');
    expect(next.data).toBe(solved.data); // board preserved
  });

  it('MODULE_RESET on an already-armed module is a structural no-op', () => {
    const s = armed(data);
    expect(whosOnFirstReducer(s, { type: 'MODULE_RESET' })).toBe(s);
  });

  it('never mutates a frozen input state (immutability gate)', () => {
    const s = armed(data);
    expect(() => whosOnFirstReducer(s, press(sol))).not.toThrow();
    expect(() => whosOnFirstReducer(s, press(0))).not.toThrow(); // wrong → strike
    // MODULE_RESET's non-armed branch builds a new envelope — run it frozen too.
    const struck = Object.freeze({ moduleId: WHOS_ON_FIRST_MODULE_ID, status: 'struck' as const, data: s.data });
    expect(() => whosOnFirstReducer(struck, { type: 'MODULE_RESET' })).not.toThrow();
    expect(s.status).toBe('armed'); // original untouched
    expect(whosOnFirstReducer(s, press(sol)).data).toBe(s.data); // no board copy either
  });

  it('solves end-to-end for a swept set of generated instances', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = armed(generateWhosOnFirst(seed));
      const next = whosOnFirstReducer(s, press(solutionIndex(s.data)));
      expect(next.status).toBe('solved');
      // and a different (wrong) button strikes
      const wrongIdx = (solutionIndex(s.data) + 1) % BUTTON_COUNT;
      expect(whosOnFirstReducer(s, press(wrongIdx)).status).toBe('struck');
    }
  });
});

describe('isWhosOnFirstAction', () => {
  it('accepts PRESS and MODULE_RESET', () => {
    expect(isWhosOnFirstAction({ type: 'PRESS', buttonIndex: 0 })).toBe(true);
    expect(isWhosOnFirstAction({ type: 'MODULE_RESET' })).toBe(true);
  });

  it('rejects malformed actions', () => {
    expect(isWhosOnFirstAction({ type: 'PRESS' })).toBe(false);
    expect(isWhosOnFirstAction({ type: 'PRESS', buttonIndex: '0' })).toBe(false);
    expect(isWhosOnFirstAction({ type: 'CUT', wireIndex: 0 })).toBe(false);
    expect(isWhosOnFirstAction(null)).toBe(false);
    expect(isWhosOnFirstAction({})).toBe(false);
  });
});

describe('getWhosOnFirstManualPages — generated from the same tables as the solver', () => {
  const pages = getWhosOnFirstManualPages();

  it("is a single who's-on-first chapter", () => {
    expect(pages).toHaveLength(1);
    expect(pages[0].chapterId).toBe(WHOS_ON_FIRST_MODULE_ID);
  });

  it('Step-1 table reconstructs DISPLAY_POSITIONS exactly (manual ↔ solver share the constant)', () => {
    const table = pages[0].sections[0].table;
    expect(table).toBeDefined();
    expect(table!.rows).toHaveLength(28);
    for (const [display, positionName] of table!.rows) {
      const word = display === '(blank)' ? '' : display;
      expect(POSITION_NAMES[DISPLAY_POSITIONS[word]]).toBe(positionName);
    }
  });

  it('Step-2 table reconstructs LABEL_PRIORITIES exactly', () => {
    const table = pages[0].sections[1].table;
    expect(table).toBeDefined();
    expect(table!.rows).toHaveLength(28);
    for (const [label, listStr] of table!.rows) {
      expect(listStr).toBe(LABEL_PRIORITIES[label].join(', '));
    }
  });

  it('both tables carry a trailing spacer column so the answer column stays left-aligned under its header', () => {
    for (const section of pages[0].sections) {
      const table = section.table!;
      // last header is the empty spacer (absorbs PageRenderer's right-align rule)
      expect(table.headers[table.headers.length - 1]).toBe('');
      // every row has the same trailing spacer, so real columns are not the "last cell"
      for (const row of table.rows) {
        expect(row).toHaveLength(table.headers.length);
        expect(row[row.length - 1]).toBe('');
      }
    }
  });
});
