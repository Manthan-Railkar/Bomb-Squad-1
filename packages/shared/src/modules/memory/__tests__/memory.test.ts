import { describe, expect, it } from '@jest/globals';
import type { BombContext, ModuleState } from '../../../types/index.js';
import {
  MEMORY_MODULE_ID,
  MEMORY_DIGITS,
  MEMORY_STAGE_COUNT,
  isMemoryAction,
  type MemoryDigit,
  type MemoryPress,
  type MemoryStage,
  type MemoryState,
} from '../types.js';
import { generateMemory } from '../generate.js';
import { MEMORY_RULES, solveMemory, type MemoryInstruction, type MemoryStageRules } from '../solve.js';
import { memoryReducer } from '../reducer.js';
import { getMemoryManualPages } from '../manual.js';

/** ctx is unused by Memory, but generate() requires the signature. */
const CTX: BombContext = {
  serialNumber: 'AB3XK4',
  batteryCount: 1,
  indicators: [],
  ports: [],
};
Object.freeze(CTX);

const st = (display: MemoryDigit, labels: readonly MemoryDigit[]): MemoryStage =>
  Object.freeze({ display, labels: Object.freeze([...labels]) });

/**
 * A deterministic five-stage instance whose correct presses are [2,2,1,2,2].
 * Chosen so the walk exercises position (stage 1), samePosition (stages 2 & 4)
 * and sameLabel (stages 3 & 5) back-references. Verified by hand against the GDD
 * tables (see the reducer happy-path test comments).
 */
const FIVE_STAGES: readonly MemoryStage[] = Object.freeze([
  st(1, [3, 1, 4, 2]), // stage 1, display 1 → position 2 (label there = 1)
  st(2, [2, 4, 1, 3]), // stage 2, display 2 → same position as stage 1 = 2 (label 4)
  st(1, [4, 2, 3, 1]), // stage 3, display 1 → same label as stage 2 (=4) → position 1 (label 4)
  st(3, [1, 3, 2, 4]), // stage 4, display 3 → same position as stage 2 = 2 (label 3)
  st(4, [2, 4, 1, 3]), // stage 5, display 4 → same label as stage 3 (=4) → position 2 → solves
]);
const CORRECT_PRESSES: readonly MemoryDigit[] = [2, 2, 1, 2, 2];

const armed = (
  stages: readonly MemoryStage[] = FIVE_STAGES,
  stage = 1,
  history: readonly MemoryPress[] = [],
): ModuleState<MemoryState> => {
  const data: MemoryState = {
    stages: Object.freeze([...stages]),
    stage,
    history: Object.freeze([...history]),
  };
  Object.freeze(data);
  return Object.freeze({ moduleId: MEMORY_MODULE_ID, status: 'armed', data });
};

const pressAt = (position: number) => ({ type: 'PRESS' as const, position });

// ---------------------------------------------------------------------------
// Stage tables — independent transcription of the GDD (a typo in MEMORY_RULES
// must fail this; do NOT import MEMORY_RULES to build it).
// ---------------------------------------------------------------------------

const EXPECTED_RULES: readonly MemoryStageRules[] = [
  {
    1: { kind: 'position', value: 2 },
    2: { kind: 'position', value: 2 },
    3: { kind: 'position', value: 3 },
    4: { kind: 'position', value: 4 },
  },
  {
    1: { kind: 'label', value: 4 },
    2: { kind: 'samePosition', stage: 1 },
    3: { kind: 'position', value: 1 },
    4: { kind: 'samePosition', stage: 1 },
  },
  {
    1: { kind: 'sameLabel', stage: 2 },
    2: { kind: 'sameLabel', stage: 1 },
    3: { kind: 'position', value: 3 },
    4: { kind: 'label', value: 4 },
  },
  {
    1: { kind: 'samePosition', stage: 1 },
    2: { kind: 'position', value: 1 },
    3: { kind: 'samePosition', stage: 2 },
    4: { kind: 'samePosition', stage: 2 },
  },
  {
    1: { kind: 'sameLabel', stage: 1 },
    2: { kind: 'sameLabel', stage: 2 },
    3: { kind: 'sameLabel', stage: 4 },
    4: { kind: 'sameLabel', stage: 3 },
  },
];

describe('MEMORY_RULES — GDD stage tables (all 20 cells, independent expectation)', () => {
  it('has five stages, each covering displays 1–4', () => {
    expect(MEMORY_RULES).toHaveLength(MEMORY_STAGE_COUNT);
    for (const rules of MEMORY_RULES) {
      for (const d of MEMORY_DIGITS) expect(rules[d]).toBeDefined();
    }
  });

  it('matches the GDD tables verbatim, cell by cell', () => {
    for (let s = 0; s < MEMORY_STAGE_COUNT; s++) {
      for (const d of MEMORY_DIGITS) {
        expect(MEMORY_RULES[s][d]).toEqual(EXPECTED_RULES[s][d]);
      }
    }
  });

  it('only ever back-references strictly-earlier stages (no forward refs)', () => {
    for (let s = 0; s < MEMORY_STAGE_COUNT; s++) {
      for (const d of MEMORY_DIGITS) {
        const instr: MemoryInstruction = MEMORY_RULES[s][d];
        if (instr.kind === 'samePosition' || instr.kind === 'sameLabel') {
          expect(instr.stage).toBeGreaterThanOrEqual(1);
          expect(instr.stage).toBeLessThan(s + 1); // s+1 is this stage's 1-indexed number
        }
      }
    }
  });
});

describe('solveMemory — resolves each instruction kind to the correct position', () => {
  it("'position' → the absolute position", () => {
    // stage 1, display 3 → position 3, regardless of layout.
    expect(solveMemory(st(3, [4, 3, 2, 1]), 1, [])).toBe(3);
  });

  it("'label' → the position currently bearing that label", () => {
    // stage 2, display 1 → label "4". Layout [1,2,3,4] puts 4 at position 4;
    // layout [4,1,2,3] puts it at position 1.
    expect(solveMemory(st(1, [1, 2, 3, 4]), 2, [{ position: 1, label: 1 }])).toBe(4);
    expect(solveMemory(st(1, [4, 1, 2, 3]), 2, [{ position: 1, label: 1 }])).toBe(1);
  });

  it("'samePosition' → the position pressed in the referenced stage", () => {
    // stage 2, display 2 → same position as stage 1. history[0].position = 3.
    expect(solveMemory(st(2, [1, 2, 3, 4]), 2, [{ position: 3, label: 3 }])).toBe(3);
  });

  it("'sameLabel' → the position holding the label pressed earlier (may differ)", () => {
    // stage 3, display 2 → same label as stage 1. history[0].label = 2.
    // This stage's layout puts label 2 at position 4, NOT where it was pressed.
    expect(solveMemory(st(2, [1, 3, 4, 2]), 3, [{ position: 1, label: 2 }])).toBe(4);
  });
});

describe('generateMemory', () => {
  it('is deterministic for a given seed', () => {
    expect(generateMemory(42, CTX)).toEqual(generateMemory(42, CTX));
  });

  it('produces five stages at stage 1 / empty history', () => {
    for (let seed = 0; seed < 100; seed++) {
      const state = generateMemory(seed, CTX);
      expect(state.stages).toHaveLength(MEMORY_STAGE_COUNT);
      expect(state.stage).toBe(1);
      expect(state.history).toEqual([]);
    }
  });

  it('every stage has a valid display and a permutation of 1–4 as labels', () => {
    for (let seed = 0; seed < 100; seed++) {
      for (const stage of generateMemory(seed, CTX).stages) {
        expect(MEMORY_DIGITS).toContain(stage.display);
        expect([...stage.labels].sort()).toEqual([1, 2, 3, 4]);
      }
    }
  });

  it('varies across seeds (not a constant instance)', () => {
    const sig = (s: MemoryState) =>
      s.stages.map((st) => `${st.display}:${st.labels.join('')}`).join('|');
    const first = sig(generateMemory(0, CTX));
    const anyDifferent = Array.from({ length: 20 }, (_, i) => i + 1).some(
      (seed) => sig(generateMemory(seed, CTX)) !== first,
    );
    expect(anyDifferent).toBe(true);
  });

  it('stores no pre-computed answer (only stages / stage / history)', () => {
    expect(Object.keys(generateMemory(7, CTX)).sort()).toEqual(['history', 'stage', 'stages']);
  });

  it('never calls Math.random (seeded RNG only)', () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error('Math.random is banned in module generation');
    };
    try {
      expect(() => generateMemory(3, CTX)).not.toThrow();
    } finally {
      Math.random = original;
    }
  });
});

describe('memoryReducer — contract obligations (frozen inputs throughout)', () => {
  it('happy path: five correct presses in sequence solve the module', () => {
    let state = armed();
    for (let i = 0; i < MEMORY_STAGE_COUNT; i++) {
      const next = memoryReducer(state, pressAt(CORRECT_PRESSES[i]));
      if (i < MEMORY_STAGE_COUNT - 1) {
        expect(next.status).toBe('armed');
        expect(next.data.stage).toBe(i + 2);
        expect(next.data.history).toHaveLength(i + 1);
      } else {
        expect(next.status).toBe('solved');
        expect(next.data.history).toHaveLength(MEMORY_STAGE_COUNT);
      }
      Object.freeze(next.data);
      state = Object.freeze(next) as ModuleState<MemoryState>;
    }
  });

  it('wrong press at stage 1 → transient struck, stays stage 1 / empty history', () => {
    const state = armed(); // stage 1 correct press is 2
    const next = memoryReducer(state, pressAt(1));
    expect(next.status).toBe('struck');
    expect(next.data.stage).toBe(1);
    expect(next.data.history).toEqual([]);
  });

  it('THE CRUX: a wrong press at stages 3, 4 and 5 all reset to stage 1 (not the current stage)', () => {
    for (const failAt of [3, 4, 5]) {
      // Drive to `failAt` with correct presses.
      let state = armed();
      for (let i = 0; i < failAt - 1; i++) {
        state = Object.freeze(memoryReducer(state, pressAt(CORRECT_PRESSES[i]))) as ModuleState<MemoryState>;
        Object.freeze(state.data);
      }
      expect(state.data.stage).toBe(failAt);
      // A deliberately wrong press (correct is CORRECT_PRESSES[failAt-1]).
      const wrong = CORRECT_PRESSES[failAt - 1] === 1 ? 3 : 1;
      const next = memoryReducer(state, pressAt(wrong));
      expect(next.status).toBe('struck');
      expect(next.data.stage).toBe(1); // reset ALL the way to stage 1
      expect(next.data.history).toEqual([]); // history cleared
      // …and the module is fully re-solvable from the reset (re-arm then solve).
      let replay: ModuleState<MemoryState> = { ...next, status: 'armed' };
      for (let i = 0; i < MEMORY_STAGE_COUNT; i++) {
        replay = memoryReducer(replay, pressAt(CORRECT_PRESSES[i]));
      }
      expect(replay.status).toBe('solved');
    }
  });

  it('records BOTH the position and the label of each correct press', () => {
    const next = memoryReducer(armed(), pressAt(2)); // stage 1, position 2, label there = 1
    expect(next.data.history[0]).toEqual({ position: 2, label: 1 });
  });

  it('solved-inert: a press on a solved module is a no-op (same ref)', () => {
    const solved = Object.freeze({ ...armed(FIVE_STAGES, 5), status: 'solved' as const });
    expect(memoryReducer(solved, pressAt(2))).toBe(solved);
  });

  it('immutability: never mutates the (frozen) input state', () => {
    const state = armed();
    expect(() => memoryReducer(state, pressAt(2))).not.toThrow();
    expect(state.data.stage).toBe(1);
    expect(state.data.history).toEqual([]);
    expect(state.status).toBe('armed');
  });

  it('guard: malformed / out-of-range actions are no-ops (same ref)', () => {
    const state = armed();
    const bad: unknown[] = [
      undefined,
      null,
      42,
      'PRESS',
      {},
      { type: 'EXPLODE' },
      { type: 'PRESS' }, // missing position
      { type: 'PRESS', position: '2' }, // non-number
      { type: 'PRESS', position: 0 }, // below range
      { type: 'PRESS', position: 5 }, // above range
      { type: 'PRESS', position: 2.5 }, // fractional
      { type: 'PRESS', position: NaN },
    ];
    for (const action of bad) {
      expect(memoryReducer(state, action)).toBe(state);
    }
  });

  it('MODULE_RESET restores stage 1 / empty history; stages preserved; still solvable', () => {
    // Advance a couple of stages first.
    let state = armed();
    state = Object.freeze(memoryReducer(state, pressAt(2))) as ModuleState<MemoryState>;
    Object.freeze(state.data);
    state = Object.freeze(memoryReducer(state, pressAt(2))) as ModuleState<MemoryState>;
    Object.freeze(state.data);
    expect(state.data.stage).toBe(3);

    const reset = memoryReducer(state, { type: 'MODULE_RESET' });
    expect(reset.status).toBe('armed');
    expect(reset.data.stage).toBe(1);
    expect(reset.data.history).toEqual([]);
    expect(reset.data.stages).toBe(state.data.stages); // same fixed stages
    // Solvable from the reset.
    expect(memoryReducer(reset, pressAt(2)).data.stage).toBe(2);
  });

  it('MODULE_RESET on an already-reset armed module is a no-op (same ref)', () => {
    const state = armed();
    expect(memoryReducer(state, { type: 'MODULE_RESET' })).toBe(state);
  });
});

describe('isMemoryAction', () => {
  it('accepts well-formed PRESS and MODULE_RESET', () => {
    expect(isMemoryAction({ type: 'PRESS', position: 2 })).toBe(true);
    expect(isMemoryAction({ type: 'MODULE_RESET' })).toBe(true);
  });
  it('rejects malformed input', () => {
    expect(isMemoryAction(null)).toBe(false);
    expect(isMemoryAction({ type: 'PRESS' })).toBe(false);
    expect(isMemoryAction({ type: 'PRESS', position: '2' })).toBe(false);
    expect(isMemoryAction({ type: 'NOPE' })).toBe(false);
  });
});

describe('getMemoryManualPages — renders the same constant the solver reads', () => {
  const pages = getMemoryManualPages();

  it('is a single chapter keyed by the module id', () => {
    expect(pages).toHaveLength(1);
    expect(pages[0].chapterId).toBe(MEMORY_MODULE_ID);
  });

  it('has one Display→Action table per stage, matching MEMORY_RULES', () => {
    const describe = (instr: MemoryInstruction): string => {
      switch (instr.kind) {
        case 'position':
          return `Press the button in position ${instr.value}`;
        case 'label':
          return `Press the button labeled "${instr.value}"`;
        case 'samePosition':
          return `Press the same position as stage ${instr.stage}`;
        case 'sameLabel':
          return `Press the same label as stage ${instr.stage}`;
      }
    };
    for (let s = 0; s < MEMORY_STAGE_COUNT; s++) {
      const section = pages[0].sections.find((sec) => sec.heading === `Stage ${s + 1}`);
      expect(section?.table).toBeDefined();
      const rows = section!.table!.rows;
      for (const d of MEMORY_DIGITS) {
        const row = rows.find((r) => r[0] === String(d));
        expect(row?.[1]).toBe(describe(MEMORY_RULES[s][d]));
      }
    }
  });
});
