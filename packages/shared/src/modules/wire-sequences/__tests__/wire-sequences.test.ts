import { describe, expect, it } from '@jest/globals';
import type { ModuleState } from '../../../types/index.js';
import {
  CUT_RULES,
  MAX_OCCURRENCE,
  WIRE_SEQUENCES_MODULE_ID,
  WIRE_SEQ_COLORS,
  WIRE_SEQ_COLOR_LABELS,
  WIRE_SEQ_LETTERS,
  isWireSequencesAction,
  type WireSeqColor,
  type WireSeqLetter,
  type WireSeqWire,
  type WireSequencesState,
} from '../types.js';
import { generateWireSequences } from '../generate.js';
import {
  flattenWires,
  isSolved,
  maxColorOccurrence,
  occurrenceOf,
  shouldCut,
  wireByGlobalIndex,
} from '../solve.js';
import { wireSequencesReducer } from '../reducer.js';
import { getWireSequencesManualPages } from '../manual.js';

// ---- helpers -----------------------------------------------------------------

const wire = (color: WireSeqColor, letter: WireSeqLetter, cut = false): WireSeqWire => ({
  color,
  letter,
  cut,
});

/** Build a state from a compact panel spec: [[ 'red:A', ... ], ...]. */
const build = (panels: string[][], currentPanel = 0): WireSequencesState => ({
  panels: panels.map((slots) => ({
    wires: slots.map((s) => {
      const [color, rest] = s.split(':');
      const cut = rest.endsWith('*');
      const letter = (cut ? rest.slice(0, -1) : rest) as WireSeqLetter;
      return wire(color as WireSeqColor, letter, cut);
    }),
  })),
  currentPanel,
});

/** Deep-frozen armed envelope (immutability gate). */
const armed = (data: WireSequencesState): ModuleState<WireSequencesState> => {
  data.panels.forEach((p) => {
    p.wires.forEach((w) => Object.freeze(w));
    Object.freeze(p.wires);
    Object.freeze(p);
  });
  Object.freeze(data.panels);
  Object.freeze(data);
  return Object.freeze({ moduleId: WIRE_SEQUENCES_MODULE_ID, status: 'armed', data });
};

/** The Dev Notes worked example (cross-panel occurrence). */
const WORKED = (): WireSequencesState =>
  build([
    ['red:A', 'blue:B'],
    ['black:C', 'red:C', 'red:B'],
    ['blue:A'],
  ]);
// occurrences: red:A=1st(C→no) blue:B=1st(B→cut) black:C=1st(A/B/C→cut)
//              red:C=2nd(B→no) red:B=3rd(A→no) blue:A=2nd(A/C→cut)
// should-cut set = { globalIndex 1 (blue:B), 2 (black:C), 5 (blue:A) }

// ---- CUT_RULES table fidelity (Task 2) --------------------------------------

describe('CUT_RULES — canonical KTANE v1 page-14 fidelity (AC1, AC2, AC3)', () => {
  it('has exactly the three colour keys', () => {
    expect(Object.keys(CUT_RULES).sort()).toEqual(['black', 'blue', 'red']);
  });

  it('each colour has exactly 9 occurrence entries', () => {
    for (const color of WIRE_SEQ_COLORS) {
      expect(CUT_RULES[color]).toHaveLength(MAX_OCCURRENCE);
    }
  });

  it('every cell is a duplicate-free subset of {A,B,C}', () => {
    for (const color of WIRE_SEQ_COLORS) {
      for (const cell of CUT_RULES[color]) {
        expect(cell.length).toBeGreaterThanOrEqual(1);
        expect(new Set(cell).size).toBe(cell.length); // no duplicates
        for (const letter of cell) expect(WIRE_SEQ_LETTERS).toContain(letter);
      }
    }
  });

  // Pinned literal assertion — a future typo fails loud (cell-for-cell vs the PDF).
  it('matches the manual page-14 tables exactly', () => {
    expect(CUT_RULES.red).toEqual([['C'], ['B'], ['A'], ['A', 'C'], ['B'], ['A', 'C'], ['A', 'B', 'C'], ['A', 'B'], ['B']]);
    expect(CUT_RULES.blue).toEqual([['B'], ['A', 'C'], ['B'], ['A'], ['B'], ['B', 'C'], ['C'], ['A', 'C'], ['A']]);
    expect(CUT_RULES.black).toEqual([['A', 'B', 'C'], ['A', 'C'], ['B'], ['A', 'C'], ['B'], ['B', 'C'], ['A', 'B'], ['C'], ['C']]);
  });

  it('hand-worked occurrence spot-checks (verified by eye against the manual)', () => {
    expect(CUT_RULES.red[2]).toEqual(['A']); // 3rd red → A
    expect(CUT_RULES.blue[5]).toEqual(['B', 'C']); // 6th blue → B or C
    expect(CUT_RULES.black[0]).toEqual(['A', 'B', 'C']); // 1st black → A, B or C
  });
});

// ---- flatten / occurrence / shouldCut / isSolved (AC2) ----------------------

describe('flattenWires — global reading order (panel-major, slot-minor)', () => {
  it('lifts wires with correct panel/slot/global tags', () => {
    const flat = flattenWires(WORKED());
    expect(flat.map((f) => f.globalIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(flat.map((f) => `${f.panelIndex}.${f.slotIndex}`)).toEqual([
      '0.0', '0.1', '1.0', '1.1', '1.2', '2.0',
    ]);
    expect(flat[2].wire.color).toBe('black');
  });
});

describe('occurrenceOf — cumulative, colour-scoped, view-independent (AC2)', () => {
  it('counts same-colour wires at-or-before, across panels', () => {
    const s = WORKED();
    expect(occurrenceOf(s, 0)).toBe(1); // 1st red
    expect(occurrenceOf(s, 1)).toBe(1); // 1st blue
    expect(occurrenceOf(s, 2)).toBe(1); // 1st black
    expect(occurrenceOf(s, 3)).toBe(2); // 2nd red
    expect(occurrenceOf(s, 4)).toBe(3); // 3rd red
    expect(occurrenceOf(s, 5)).toBe(2); // 2nd blue
  });

  it('is independent of currentPanel (occurrence never depends on the view)', () => {
    expect(occurrenceOf(WORKED(), 4)).toBe(occurrenceOf(build(WORKED().panels.map((p) => p.wires.map((w) => `${w.color}:${w.letter}`)), 2), 4));
  });

  it('returns 0 for an out-of-range index', () => {
    expect(occurrenceOf(WORKED(), 99)).toBe(0);
  });
});

describe('shouldCut — CUT_RULES ∘ occurrence (AC2)', () => {
  it('decides the Dev Notes worked example correctly (cross-panel dependency)', () => {
    const s = WORKED();
    expect(shouldCut(s, 0)).toBe(false); // red:A, 1st red → C
    expect(shouldCut(s, 1)).toBe(true); // blue:B, 1st blue → B
    expect(shouldCut(s, 2)).toBe(true); // black:C, 1st black → A/B/C
    expect(shouldCut(s, 3)).toBe(false); // red:C, 2nd red → B
    expect(shouldCut(s, 4)).toBe(false); // red:B, 3rd red → A
    expect(shouldCut(s, 5)).toBe(true); // blue:A, 2nd blue → A/C
  });

  it('a wire on a LATER panel is judged by its cumulative (not panel-local) occurrence', () => {
    // Two reds, both slot 0 of their own panel — the 2nd red is judged as 2nd,
    // not as "1st on panel 1". red 2nd → B, so red:B cuts, red:A does not.
    const s = build([['red:A'], ['red:B']]);
    expect(occurrenceOf(s, 1)).toBe(2);
    expect(shouldCut(s, 0)).toBe(false); // red:A 1st → C
    expect(shouldCut(s, 1)).toBe(true); // red:B 2nd → B
  });

  it('guards defensively past the 9-occurrence domain', () => {
    const s = build([Array.from({ length: 10 }, () => 'red:A')]);
    expect(shouldCut(s, 9)).toBe(false); // 10th red — no table row, never throws
  });

  it('false for an out-of-range index', () => {
    expect(shouldCut(WORKED(), 99)).toBe(false);
  });
});

describe('isSolved — every should-cut wire severed (AC3)', () => {
  it('false until all should-cut wires are cut, true once they are', () => {
    let s = WORKED();
    expect(isSolved(s)).toBe(false);
    // cut the three should-cut wires (globals 1,2,5)
    for (const gi of [1, 2, 5]) {
      const flat = flattenWires(s);
      const { panelIndex, slotIndex } = flat[gi];
      s = {
        ...s,
        panels: s.panels.map((p, pi) =>
          pi === panelIndex
            ? { wires: p.wires.map((w, si) => (si === slotIndex ? { ...w, cut: true } : w)) }
            : p,
        ),
      };
    }
    expect(isSolved(s)).toBe(true);
  });

  it('a wrongly cut should-not-cut wire does not block solving', () => {
    // worked example with the three should-cut wires cut AND a should-not-cut cut
    const s = build([['red:A*', 'blue:B*'], ['black:C*', 'red:C', 'red:B'], ['blue:A*']]);
    expect(isSolved(s)).toBe(true);
  });
});

// ---- generate (AC1) ---------------------------------------------------------

describe('generateWireSequences — determinism + invariants (AC1)', () => {
  it('is deterministic given the seed', () => {
    expect(generateWireSequences(42)).toEqual(generateWireSequences(42));
  });

  it('different seeds differ', () => {
    expect(generateWireSequences(1)).not.toEqual(generateWireSequences(2));
  });

  it('starts on panel 0 with all wires uncut', () => {
    const s = generateWireSequences(7);
    expect(s.currentPanel).toBe(0);
    expect(flattenWires(s).every((f) => f.wire.cut === false)).toBe(true);
  });

  it('sweep: never born-solved, ≤9 per colour, 3–4 panels, 1–3 distinct-slot wires', () => {
    for (let seed = 0; seed < 400; seed++) {
      const s = generateWireSequences(seed);
      expect(isSolved(s)).toBe(false); // ≥1 should-cut wire (AC1)
      expect(maxColorOccurrence(s)).toBeLessThanOrEqual(MAX_OCCURRENCE);
      expect(s.panels.length).toBeGreaterThanOrEqual(3);
      expect(s.panels.length).toBeLessThanOrEqual(4);
      for (const panel of s.panels) {
        expect(panel.wires.length).toBeGreaterThanOrEqual(1);
        expect(panel.wires.length).toBeLessThanOrEqual(3);
      }
    }
  });

  it('handles seed 0 and a large seed', () => {
    expect(() => generateWireSequences(0)).not.toThrow();
    expect(() => generateWireSequences(2_000_000)).not.toThrow();
  });
});

// ---- reducer (AC3, AC4, AC5) ------------------------------------------------

describe('wireSequencesReducer — CUT progression + auto-solve (AC3)', () => {
  it('happy path: cutting every should-cut wire solves only on the last', () => {
    let state = armed(WORKED());
    // cut globals 1, 2 → still armed; then 5 → solved.
    state = wireSequencesReducer(state, { type: 'CUT', wireIndex: 1 }) as typeof state;
    expect(state.status).toBe('armed');
    state = wireSequencesReducer(state, { type: 'CUT', wireIndex: 2 }) as typeof state;
    expect(state.status).toBe('armed');
    state = wireSequencesReducer(state, { type: 'CUT', wireIndex: 5 }) as typeof state;
    expect(state.status).toBe('solved');
  });

  it('wrong cut → struck, wire stays severed, not solved', () => {
    const state = armed(WORKED());
    const next = wireSequencesReducer(state, { type: 'CUT', wireIndex: 0 }); // red:A should-not-cut
    expect(next.status).toBe('struck');
    expect(flattenWires(next.data)[0].wire.cut).toBe(true); // physical: stays severed
  });

  it('idempotent: re-cutting an already-cut wire is a no-op (no 2nd strike)', () => {
    const state = armed(WORKED());
    const struck = wireSequencesReducer(state, { type: 'CUT', wireIndex: 0 });
    // re-cut the same (now severed) wrong wire → unchanged, no strike signal
    const again = wireSequencesReducer({ ...struck, status: 'armed' }, { type: 'CUT', wireIndex: 0 });
    expect(again.status).toBe('armed');
    // re-cutting an already-cut should-cut wire is also a no-op
    const s2 = wireSequencesReducer(state, { type: 'CUT', wireIndex: 1 }); // should-cut, armed
    const s2again = wireSequencesReducer(s2, { type: 'CUT', wireIndex: 1 });
    expect(s2again).toBe(s2); // same object → true no-op
  });

  it('immutability: a frozen input state is never mutated', () => {
    const state = armed(WORKED());
    expect(() => wireSequencesReducer(state, { type: 'CUT', wireIndex: 1 })).not.toThrow();
    expect(() => wireSequencesReducer(state, { type: 'NAV', direction: 'down' })).not.toThrow();
    expect(() => wireSequencesReducer(state, { type: 'MODULE_RESET' })).not.toThrow();
    expect(state.data.panels[0].wires[1].cut).toBe(false); // untouched
  });

  it('guards: out-of-bounds / NaN / non-integer wireIndex → unchanged', () => {
    const state = armed(WORKED());
    expect(wireSequencesReducer(state, { type: 'CUT', wireIndex: -1 })).toBe(state);
    expect(wireSequencesReducer(state, { type: 'CUT', wireIndex: 99 })).toBe(state);
    expect(wireSequencesReducer(state, { type: 'CUT', wireIndex: NaN })).toBe(state);
    expect(wireSequencesReducer(state, { type: 'CUT', wireIndex: 1.5 })).toBe(state);
  });

  it('guards: unknown action / malformed NAV → unchanged', () => {
    const state = armed(WORKED());
    expect(wireSequencesReducer(state, { type: 'BOGUS' })).toBe(state);
    expect(wireSequencesReducer(state, { type: 'NAV', direction: 'sideways' })).toBe(state);
    expect(wireSequencesReducer(state, null)).toBe(state);
    expect(wireSequencesReducer(state, { type: 'CUT' })).toBe(state); // missing wireIndex
  });

  it('solved-inert: any action but MODULE_RESET on a solved module → unchanged', () => {
    const solved = { ...armed(WORKED()), status: 'solved' as const };
    expect(wireSequencesReducer(solved, { type: 'CUT', wireIndex: 1 })).toBe(solved);
    expect(wireSequencesReducer(solved, { type: 'NAV', direction: 'down' })).toBe(solved);
  });
});

describe('wireSequencesReducer — NAV (AC4)', () => {
  it('down = next, up = previous, clamped at both boundaries; never strikes/solves', () => {
    let state = armed(build([['red:A'], ['blue:B'], ['black:C']], 0));
    // up at first panel → clamped, same object
    expect(wireSequencesReducer(state, { type: 'NAV', direction: 'up' })).toBe(state);
    state = wireSequencesReducer(state, { type: 'NAV', direction: 'down' }) as typeof state;
    expect(state.data.currentPanel).toBe(1);
    expect(state.status).toBe('armed');
    state = wireSequencesReducer(state, { type: 'NAV', direction: 'down' }) as typeof state;
    expect(state.data.currentPanel).toBe(2);
    // down at last panel → clamped, same object
    expect(wireSequencesReducer(state, { type: 'NAV', direction: 'down' })).toBe(state);
    state = wireSequencesReducer(state, { type: 'NAV', direction: 'up' }) as typeof state;
    expect(state.data.currentPanel).toBe(1);
  });

  it('NAV never changes occurrence counting (occurrence is view-independent, AC5)', () => {
    // Navigate to panel 1, then cut a wire whose correctness depends on its
    // CUMULATIVE occurrence (2nd red), not its panel-local slot.
    let state = armed(build([['red:A'], ['red:B']], 0));
    state = wireSequencesReducer(state, { type: 'NAV', direction: 'down' }) as typeof state;
    expect(state.data.currentPanel).toBe(1);
    // global index 1 = red:B = 2nd red → should-cut → solves (only should-cut wire)
    const next = wireSequencesReducer(state, { type: 'CUT', wireIndex: 1 });
    expect(next.status).toBe('solved');
  });
});

describe('wireSequencesReducer — MODULE_RESET (AC5 reset)', () => {
  it('re-arms: all wires uncut, currentPanel back to 0', () => {
    let state = armed(build([['red:A'], ['blue:B']], 0));
    state = wireSequencesReducer(state, { type: 'NAV', direction: 'down' }) as typeof state;
    state = wireSequencesReducer(state, { type: 'CUT', wireIndex: 1 }) as typeof state; // cut blue:B (1st blue → B)
    const reset = wireSequencesReducer(state, { type: 'MODULE_RESET' });
    expect(reset.status).toBe('armed');
    expect(reset.data.currentPanel).toBe(0);
    expect(flattenWires(reset.data).every((f) => f.wire.cut === false)).toBe(true);
  });

  it('bypasses solved-inert (re-arms a solved module)', () => {
    const solved = { ...armed(build([['blue:B']])), status: 'solved' as const };
    const reset = wireSequencesReducer(solved, { type: 'MODULE_RESET' });
    expect(reset.status).toBe('armed');
  });
});

// ---- action guard -----------------------------------------------------------

describe('isWireSequencesAction', () => {
  it('accepts the valid shapes and rejects the rest', () => {
    expect(isWireSequencesAction({ type: 'MODULE_RESET' })).toBe(true);
    expect(isWireSequencesAction({ type: 'CUT', wireIndex: 0 })).toBe(true);
    expect(isWireSequencesAction({ type: 'NAV', direction: 'up' })).toBe(true);
    expect(isWireSequencesAction({ type: 'NAV', direction: 'down' })).toBe(true);
    expect(isWireSequencesAction({ type: 'CUT' })).toBe(false);
    expect(isWireSequencesAction({ type: 'CUT', wireIndex: '0' })).toBe(false);
    expect(isWireSequencesAction({ type: 'NAV', direction: 'left' })).toBe(false);
    expect(isWireSequencesAction({ type: 'NOPE' })).toBe(false);
    expect(isWireSequencesAction(null)).toBe(false);
    expect(isWireSequencesAction(42)).toBe(false);
  });
});

// ---- manual ↔ solver share the constant (Task 7) ----------------------------

describe('getWireSequencesManualPages — renders exactly CUT_RULES (no divergence)', () => {
  it('one chapter with the three colour tables + a colour-label table', () => {
    const pages = getWireSequencesManualPages();
    expect(pages).toHaveLength(1);
    expect(pages[0].chapterId).toBe(WIRE_SEQUENCES_MODULE_ID);
  });

  it('each colour table reconstructs CUT_RULES cell-for-cell', () => {
    const [page] = getWireSequencesManualPages();
    const format = (cell: ReadonlyArray<string>): string =>
      cell.length <= 1 ? cell[0] : cell.length === 2 ? `${cell[0]} or ${cell[1]}` : `${cell.slice(0, -1).join(', ')} or ${cell[cell.length - 1]}`;
    for (const color of WIRE_SEQ_COLORS) {
      const heading = `${color[0].toUpperCase()}${color.slice(1)} wire occurrences`;
      const section = page.sections.find((s) => s.heading === heading);
      expect(section?.table).toBeDefined();
      const answers = section!.table!.rows.map((r) => r[1]);
      expect(answers).toEqual(CUT_RULES[color].map(format));
    }
  });

  it('the colour-label table matches WIRE_SEQ_COLOR_LABELS (colorblind floor)', () => {
    const [page] = getWireSequencesManualPages();
    const section = page.sections.find((s) => s.heading === 'Confirming colours');
    const rows = section!.table!.rows;
    for (const color of WIRE_SEQ_COLORS) {
      const row = rows.find((r) => r[0].toLowerCase() === color);
      expect(row?.[1]).toBe(WIRE_SEQ_COLOR_LABELS[color]);
    }
    // labels must not collide with the A/B/C connection letters
    for (const color of WIRE_SEQ_COLORS) {
      expect(WIRE_SEQ_LETTERS).not.toContain(WIRE_SEQ_COLOR_LABELS[color]);
    }
  });
});
