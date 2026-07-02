import { describe, expect, it } from '@jest/globals';
import {
  DEV_DEMO_MODULE_ID,
  WIRES_MODULE_ID,
  BUTTON_MODULE_ID,
  PASSWORDS_MODULE_ID,
  KEYPADS_MODULE_ID,
  WHOS_ON_FIRST_MODULE_ID,
  WIRE_SEQUENCES_MODULE_ID,
  MAZES_MODULE_ID,
  COMPLICATED_WIRES_MODULE_ID,
  SIMON_SAYS_MODULE_ID,
  MEMORY_MODULE_ID,
  MORSE_CODE_MODULE_ID,
  MORSE_FREQUENCIES,
  devDemoReducer,
  generateDevDemo,
  generateWires,
  solveWires,
  generateKeypads,
  solutionOrder,
  generateWhosOnFirst,
  solutionIndex,
  generateWireSequences,
  flattenWires,
  shouldCut,
  correctFreqIndex,
  type BombContext,
  type BombState,
  type ButtonState,
  type ComplicatedWiresState,
  type MemoryState,
  type ModuleState,
  type MorseCodeState,
  type PasswordsState,
  type KeypadsState,
  type WhosOnFirstState,
  type WireSequencesState,
  type MazesState,
  type SimonSaysState,
} from '@bomb-squad/shared';
import { createBombReducer, bombReducer } from '../bombReducer.js';
import { MODULE_REDUCERS, type ModuleReducer } from '../MODULE_REDUCERS.js';

/**
 * Story 5.1 — the open/closed plugin contract, proven end-to-end:
 * a module registered into a reducer registry appears on the bomb with ZERO
 * change to bombReducer's dispatch logic (ADR-003), and the bomb reducer
 * defensively rejects out-of-contract module-reducer output (1.6 deferral).
 */

const CTX: BombContext = {
  serialNumber: 'XY42Z1',
  batteryCount: 1,
  indicators: [],
  ports: [],
};

const seedFor = (solution: 'cut' | 'press' | 'cut-press'): number => {
  for (let seed = 0; seed < 1000; seed++) {
    if (generateDevDemo(seed, CTX).solution === solution) return seed;
  }
  throw new Error(`no seed under 1000 produces ${solution}`);
};

const devDemoBomb = (solution: 'cut' | 'press' | 'cut-press'): BombState => ({
  context: CTX,
  modules: [
    {
      moduleId: DEV_DEMO_MODULE_ID,
      status: 'armed',
      data: generateDevDemo(seedFor(solution), CTX),
    },
  ],
  strikes: 0,
  solved: false,
});

describe('open/closed module registration (AC2)', () => {
  // The injection seam: register dev-demo without editing bombReducer.ts.
  const reduce = createBombReducer({
    [DEV_DEMO_MODULE_ID]: devDemoReducer as ModuleReducer,
  });

  it('a registered module solves through the bomb reducer', () => {
    const next = reduce(devDemoBomb('cut'), {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'CUT' },
    });
    expect(next.modules[0].status).toBe('solved');
    expect(next.strikes).toBe(0);
    expect(next.solved).toBe(true); // single-module bomb: all solved
  });

  it('a wrong interaction rolls up into a team strike and re-arms', () => {
    const next = reduce(devDemoBomb('press'), {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'CUT' },
    });
    expect(next.modules[0].status).toBe('armed'); // transient 'struck' rolled up
    expect(next.strikes).toBe(1);
    expect(next.solved).toBe(false);
  });

  it('MODULE_RESET restores a solved module to armed', () => {
    const solved = reduce(devDemoBomb('cut'), {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'CUT' },
    });
    const reset = reduce(solved, { type: 'MODULE_RESET', moduleIndex: 0 });
    expect(reset.modules[0].status).toBe('armed');
    expect(reset.solved).toBe(false);
  });

  it('wires (5.3) is registered and solves/strikes through the untouched bomb reducer', () => {
    expect(MODULE_REDUCERS[WIRES_MODULE_ID]).toBeDefined();
    const data = generateWires(7, CTX);
    // The answer is no longer stored in state — recompute it (Sprint 2 retro AI1).
    const solutionIndex = solveWires(data.wires.map((w) => w.color), CTX);
    const wiresBomb: BombState = {
      context: CTX,
      modules: [{ moduleId: WIRES_MODULE_ID, status: 'armed', data }],
      strikes: 0,
      solved: false,
    };
    const solved = bombReducer(wiresBomb, {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'CUT', wireIndex: solutionIndex },
    });
    expect(solved.modules[0].status).toBe('solved');
    expect(solved.strikes).toBe(0);
    const wrongIndex = (solutionIndex + 1) % data.wires.length;
    const struck = bombReducer(wiresBomb, {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'CUT', wireIndex: wrongIndex },
    });
    expect(struck.modules[0].status).toBe('armed'); // transient 'struck' rolled up
    expect(struck.strikes).toBe(1);
  });

  it('the-button (5.4) is registered and presses/releases through the untouched bomb reducer', () => {
    expect(MODULE_REDUCERS[BUTTON_MODULE_ID]).toBeDefined();
    // yellow → hold (rule 5), strip blue → release on a 4. Explicit data so the
    // decision is deterministic without seed-searching.
    const data: ButtonState = { color: 'yellow', label: 'Press', stripColor: 'blue', held: false, ctx: CTX };
    const buttonBomb: BombState = {
      context: CTX,
      modules: [{ moduleId: BUTTON_MODULE_ID, status: 'armed', data }],
      strikes: 0,
      solved: false,
    };
    // PRESS reveals the strip (held) without solving — flows through bombReducer.
    const held = bombReducer(buttonBomb, {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'PRESS' },
    });
    expect((held.modules[0].data as ButtonState).held).toBe(true);
    expect(held.modules[0].status).toBe('armed');
    // RELEASE at the matching digit (4 present) solves with no strike.
    const solved = bombReducer(held, {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'RELEASE', timerDigits: [1, 4, 3] },
    });
    expect(solved.modules[0].status).toBe('solved');
    expect(solved.strikes).toBe(0);
    // RELEASE at a wrong digit rolls up into a team strike and re-arms.
    const struck = bombReducer(held, {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'RELEASE', timerDigits: [1, 2, 3] },
    });
    expect(struck.modules[0].status).toBe('armed'); // transient 'struck' rolled up
    expect(struck.strikes).toBe(1);
  });

  it('passwords (5.5) is registered and solves/strikes through the untouched bomb reducer', () => {
    expect(MODULE_REDUCERS[PASSWORDS_MODULE_ID]).toBeDefined();
    // Explicit columns spelling "about" at index 0 (filler 'z' spells no word),
    // so the decision is deterministic without seed-searching.
    const data: PasswordsState = {
      columns: 'about'.split('').map((ch) => [ch, 'z', 'z', 'z', 'z', 'z']),
      positions: [0, 0, 0, 0, 0],
      startPositions: [0, 0, 0, 0, 0],
    };
    const passwordsBomb: BombState = {
      context: CTX,
      modules: [{ moduleId: PASSWORDS_MODULE_ID, status: 'armed', data }],
      strikes: 0,
      solved: false,
    };
    // SUBMIT on the valid word "about" solves with no strike.
    const solved = bombReducer(passwordsBomb, {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'SUBMIT' },
    });
    expect(solved.modules[0].status).toBe('solved');
    expect(solved.strikes).toBe(0);
    // Cycle column 0 off the answer, SUBMIT → team strike + re-arm.
    const cycled = bombReducer(passwordsBomb, {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'CYCLE', columnIndex: 0, direction: 'up' },
    });
    const struck = bombReducer(cycled, {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'SUBMIT' },
    });
    expect(struck.modules[0].status).toBe('armed'); // transient 'struck' rolled up
    expect(struck.strikes).toBe(1);
  });

  it('complicated-wires (7.1) is registered and solves/strikes through the untouched bomb reducer', () => {
    expect(MODULE_REDUCERS[COMPLICATED_WIRES_MODULE_ID]).toBeDefined();
    // CTX serial 'XY42Z1' ends in 1 (odd), no Parallel port, 1 battery. Under it:
    //   idx0 attrs all-false → code C → should cut.
    //   idx1 blue+led → code D → should NOT cut.
    // Explicit data so the decision is deterministic without seed-searching.
    const data: ComplicatedWiresState = {
      wires: [
        { attrs: { redStripe: false, blueStripe: false, star: false, led: false }, cut: false }, // C
        { attrs: { redStripe: false, blueStripe: true, star: false, led: true }, cut: false }, // D
      ],
      ctx: CTX,
    };
    const bomb: BombState = {
      context: CTX,
      modules: [{ moduleId: COMPLICATED_WIRES_MODULE_ID, status: 'armed', data }],
      strikes: 0,
      solved: false,
    };
    // Cutting the sole should-cut wire (idx0) solves with no strike.
    const solved = bombReducer(bomb, {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'CUT', wireIndex: 0 },
    });
    expect(solved.modules[0].status).toBe('solved');
    expect(solved.strikes).toBe(0);
    // Cutting the should-not-cut wire (idx1) rolls up into a team strike and re-arms.
    const struck = bombReducer(bomb, {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'CUT', wireIndex: 1 },
    });
    expect(struck.modules[0].status).toBe('armed'); // transient 'struck' rolled up
    expect(struck.strikes).toBe(1);
  });

  it('simon-says (7.2) is registered and solves/strikes through the untouched bomb reducer', () => {
    expect(MODULE_REDUCERS[SIMON_SAYS_MODULE_ID]).toBeDefined();
    // Serial 'AB3XK4' contains a vowel (A) → Table A. At 0 strikes a red flash
    // maps to a blue press. Single-flash sequence so the first correct press solves.
    const SIMON_CTX: BombContext = {
      serialNumber: 'AB3XK4',
      batteryCount: 1,
      indicators: [],
      ports: [],
    };
    const data: SimonSaysState = { sequence: ['red'], stage: 1, progress: 0, ctx: SIMON_CTX };
    const bomb: BombState = {
      context: SIMON_CTX,
      modules: [{ moduleId: SIMON_SAYS_MODULE_ID, status: 'armed', data }],
      strikes: 0,
      solved: false,
    };
    // Correct translated press (red flash → blue) with the server-stamped strike
    // count solves with no strike.
    const solved = bombReducer(bomb, {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'PRESS', color: 'blue', strikeCount: 0 },
    });
    expect(solved.modules[0].status).toBe('solved');
    expect(solved.strikes).toBe(0);
    // A wrong press rolls up into a team strike and re-arms.
    const struck = bombReducer(bomb, {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'PRESS', color: 'red', strikeCount: 0 },
    });
    expect(struck.modules[0].status).toBe('armed'); // transient 'struck' rolled up
    expect(struck.strikes).toBe(1);
  });

  it('memory (7.3) is registered: a full 5-stage solve and a wrong-press reset round-trip', () => {
    expect(MODULE_REDUCERS[MEMORY_MODULE_ID]).toBeDefined();
    // Explicit instance so presses are deterministic without seed-searching. All
    // layouts are the identity [1,2,3,4]; displays chosen so the correct presses
    // are [2,1,3,1,2] (stage 5 uses "same label as stage 1").
    const identity = [1, 2, 3, 4] as const;
    const stages = ([1, 3, 3, 2, 1] as const).map((display) => ({
      display,
      labels: [...identity],
    }));
    const data: MemoryState = { stages, stage: 1, history: [] };
    const bomb: BombState = {
      context: CTX,
      modules: [{ moduleId: MEMORY_MODULE_ID, status: 'armed', data }],
      strikes: 0,
      solved: false,
    };

    // Five correct presses in sequence solve the module, no strikes.
    const presses = [2, 1, 3, 1, 2];
    let state = bomb;
    presses.forEach((position, i) => {
      state = bombReducer(state, { type: 'MODULE_ACTION', moduleIndex: 0, payload: { type: 'PRESS', position } });
      expect(state.modules[0].status).toBe(i === presses.length - 1 ? 'solved' : 'armed');
    });
    expect(state.strikes).toBe(0);

    // Advance one correct stage, then a wrong press: rolls up a team strike AND
    // resets the module to stage 1 (the crux) via the transient 'struck'.
    const atStage2 = bombReducer(bomb, {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'PRESS', position: 2 },
    });
    expect((atStage2.modules[0].data as MemoryState).stage).toBe(2);
    const struck = bombReducer(atStage2, {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'PRESS', position: 4 }, // wrong at stage 2
    });
    expect(struck.modules[0].status).toBe('armed'); // transient 'struck' rolled up
    expect(struck.strikes).toBe(1);
    expect((struck.modules[0].data as MemoryState).stage).toBe(1); // reset to stage 1
    expect((struck.modules[0].data as MemoryState).history).toEqual([]);
  });

  it('morse-code (7.4) is registered: dial-to-frequency TX solves; wrong TX strikes, dial preserved', () => {
    expect(MODULE_REDUCERS[MORSE_CODE_MODULE_ID]).toBeDefined();
    // 'trick' transmits at 3.532 MHz (answer dial index 3). Start away from it.
    const word = 'trick' as const;
    const answer = correctFreqIndex(word);
    const data: MorseCodeState = { word, freqIndex: 0, initialFreqIndex: 0 };
    const bomb: BombState = {
      context: CTX,
      modules: [{ moduleId: MORSE_CODE_MODULE_ID, status: 'armed', data }],
      strikes: 0,
      solved: false,
    };

    // Step the dial up to the answer, then TX → solved with no strike.
    let state = bomb;
    for (let i = 0; i < answer; i++) {
      state = bombReducer(state, { type: 'MODULE_ACTION', moduleIndex: 0, payload: { type: 'FREQ_UP' } });
    }
    expect((state.modules[0].data as MorseCodeState).freqIndex).toBe(answer);
    const solved = bombReducer(state, { type: 'MODULE_ACTION', moduleIndex: 0, payload: { type: 'TX' } });
    expect(solved.modules[0].status).toBe('solved');
    expect(solved.strikes).toBe(0);

    // A wrong TX (dial at a non-answer index) rolls up a team strike and re-arms,
    // leaving the dial exactly where it was (no reset — the crux vs Memory).
    const wrongIdx = (answer + 1) % MORSE_FREQUENCIES.length;
    const atWrong: BombState = {
      ...bomb,
      modules: [{ moduleId: MORSE_CODE_MODULE_ID, status: 'armed', data: { ...data, freqIndex: wrongIdx } }],
    };
    const struck = bombReducer(atWrong, { type: 'MODULE_ACTION', moduleIndex: 0, payload: { type: 'TX' } });
    expect(struck.modules[0].status).toBe('armed'); // transient 'struck' rolled up
    expect(struck.strikes).toBe(1);
    expect((struck.modules[0].data as MorseCodeState).freqIndex).toBe(wrongIdx); // dial preserved
  });

  it('keypads (6.1) is registered and solves/strikes through the untouched bomb reducer', () => {
    expect(MODULE_REDUCERS[KEYPADS_MODULE_ID]).toBeDefined();
    // Recompute the press order from the public column table (no stored answer).
    const data: KeypadsState = generateKeypads(7);
    const order = solutionOrder(data.keys);
    const keypadsBomb: BombState = {
      context: CTX,
      modules: [{ moduleId: KEYPADS_MODULE_ID, status: 'armed', data }],
      strikes: 0,
      solved: false,
    };
    // Press all four in order → solved with no strike.
    let solved: BombState = keypadsBomb;
    for (const keyIndex of order) {
      solved = bombReducer(solved, { type: 'MODULE_ACTION', moduleIndex: 0, payload: { type: 'PRESS', keyIndex } });
    }
    expect(solved.modules[0].status).toBe('solved');
    expect(solved.strikes).toBe(0);
    // An out-of-order first press rolls up into a team strike and re-arms.
    const wrongFirst = order[1]; // not the expected first press
    const struck = bombReducer(keypadsBomb, {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'PRESS', keyIndex: wrongFirst },
    });
    expect(struck.modules[0].status).toBe('armed'); // transient 'struck' rolled up
    expect(struck.strikes).toBe(1);
  });

  it('whos-on-first (6.2) is registered and solves/strikes through the untouched bomb reducer', () => {
    expect(MODULE_REDUCERS[WHOS_ON_FIRST_MODULE_ID]).toBeDefined();
    // Recompute the solution from the public tables (no stored answer).
    const data: WhosOnFirstState = generateWhosOnFirst(7);
    const sol = solutionIndex(data);
    const wofBomb: BombState = {
      context: CTX,
      modules: [{ moduleId: WHOS_ON_FIRST_MODULE_ID, status: 'armed', data }],
      strikes: 0,
      solved: false,
    };
    // Pressing the solution button → solved with no strike.
    const solved = bombReducer(wofBomb, {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'PRESS', buttonIndex: sol },
    });
    expect(solved.modules[0].status).toBe('solved');
    expect(solved.strikes).toBe(0);
    // A wrong button rolls up into a team strike and re-arms.
    const struck = bombReducer(wofBomb, {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'PRESS', buttonIndex: (sol + 1) % 6 },
    });
    expect(struck.modules[0].status).toBe('armed'); // transient 'struck' rolled up
    expect(struck.strikes).toBe(1);
    // Purity: both dispatches reused the same input bomb — it must be untouched.
    expect(wofBomb.modules[0].status).toBe('armed');
    expect(wofBomb.strikes).toBe(0);
  });

  it('wire-sequences (6.3) is registered and solves/strikes through the untouched bomb reducer', () => {
    expect(MODULE_REDUCERS[WIRE_SEQUENCES_MODULE_ID]).toBeDefined();
    // Recompute cut decisions from the public panels + CUT_RULES (no stored answer).
    const data: WireSequencesState = generateWireSequences(7);
    const flat = flattenWires(data);
    const shouldCutIndices = flat.filter((f) => shouldCut(data, f.globalIndex)).map((f) => f.globalIndex);
    // Generation only guarantees ≥1 should-CUT wire; a should-not-cut wire is a
    // property of THIS seed's shape — pin it explicitly so a generator change
    // fails here with a clear message, not a TypeError on the dereference.
    const shouldNotCutWire = flat.find((f) => !shouldCut(data, f.globalIndex));
    expect(shouldNotCutWire).toBeDefined();
    const shouldNotCutIndex = shouldNotCutWire!.globalIndex;
    const wsBomb: BombState = {
      context: CTX,
      modules: [{ moduleId: WIRE_SEQUENCES_MODULE_ID, status: 'armed', data }],
      strikes: 0,
      solved: false,
    };
    // Cut every should-cut wire in order → solved only once the last one is severed.
    let solved: BombState = wsBomb;
    shouldCutIndices.forEach((wireIndex, i) => {
      solved = bombReducer(solved, { type: 'MODULE_ACTION', moduleIndex: 0, payload: { type: 'CUT', wireIndex } });
      const expected = i === shouldCutIndices.length - 1 ? 'solved' : 'armed';
      expect(solved.modules[0].status).toBe(expected);
    });
    expect(solved.strikes).toBe(0);
    // A should-not-cut wire rolls up into a team strike and re-arms.
    const struck = bombReducer(wsBomb, {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'CUT', wireIndex: shouldNotCutIndex },
    });
    expect(struck.modules[0].status).toBe('armed'); // transient 'struck' rolled up
    expect(struck.strikes).toBe(1);
    // Purity: the input bomb is untouched across dispatches.
    expect(wsBomb.modules[0].status).toBe('armed');
    expect(wsBomb.strikes).toBe(0);
  });

  it('mazes (6.4) is registered and solves/strikes through the untouched bomb reducer', () => {
    expect(MODULE_REDUCERS[MAZES_MODULE_ID]).toBeDefined();
    // Fixed instance (maze 0): from (0,0) a 'down' move is legal and reaches the
    // target (0,1) → solved; from (0,1) a 'right' move crosses wall '0,1|1,1' → strike.
    const data: MazesState = {
      mazeId: 0,
      start: { x: 0, y: 0 },
      position: { x: 0, y: 0 },
      target: { x: 0, y: 1 },
    };
    const mazeBomb: BombState = {
      context: CTX,
      modules: [{ moduleId: MAZES_MODULE_ID, status: 'armed', data }],
      strikes: 0,
      solved: false,
    };
    // Legal MOVE down → reaches the target → solved.
    const solved = bombReducer(mazeBomb, {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'MOVE', direction: 'down' },
    });
    expect(solved.modules[0].status).toBe('solved');
    expect(solved.strikes).toBe(0);
    // Illegal MOVE into a wall rolls up into a team strike and re-arms; light stays put.
    const intoWall: BombState = {
      context: CTX,
      modules: [
        {
          moduleId: MAZES_MODULE_ID,
          status: 'armed',
          data: { mazeId: 0, start: { x: 0, y: 1 }, position: { x: 0, y: 1 }, target: { x: 5, y: 5 } },
        },
      ],
      strikes: 0,
      solved: false,
    };
    const struck = bombReducer(intoWall, {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'MOVE', direction: 'right' },
    });
    expect(struck.modules[0].status).toBe('armed'); // transient 'struck' rolled up
    expect(struck.strikes).toBe(1);
    expect((struck.modules[0].data as MazesState).position).toEqual({ x: 0, y: 1 });
    // Purity: the input bomb is untouched.
    expect(mazeBomb.modules[0].status).toBe('armed');
  });

  it('dev-demo is registered in the production MODULE_REDUCERS map', () => {
    expect(MODULE_REDUCERS[DEV_DEMO_MODULE_ID]).toBeDefined();
    const next = bombReducer(devDemoBomb('cut'), {
      type: 'MODULE_ACTION',
      moduleIndex: 0,
      payload: { type: 'CUT' },
    });
    expect(next.modules[0].status).toBe('solved');
  });
});

describe('module-reducer output guard (1.6 deferral closed in 5.1)', () => {
  const bomb = devDemoBomb('cut');

  const rogue = (next: Partial<ModuleState<unknown>>): ModuleReducer => {
    return (state) => ({ ...state, ...next });
  };

  it('rejects output that rebinds moduleId to another reducer', () => {
    const reduce = createBombReducer({
      [DEV_DEMO_MODULE_ID]: rogue({ moduleId: 'keypads', status: 'solved' }),
    });
    const next = reduce(bomb, { type: 'MODULE_ACTION', moduleIndex: 0, payload: {} });
    expect(next).toBe(bomb); // state unchanged, no throw
  });

  it('rejects output with an illegal status', () => {
    const reduce = createBombReducer({
      [DEV_DEMO_MODULE_ID]: rogue({ status: 'detonated' as ModuleState<unknown>['status'] }),
    });
    const next = reduce(bomb, { type: 'MODULE_ACTION', moduleIndex: 0, payload: {} });
    expect(next).toBe(bomb);
  });

  it('rejects non-object output', () => {
    const reduce = createBombReducer({
      [DEV_DEMO_MODULE_ID]: (() => undefined) as unknown as ModuleReducer,
    });
    const next = reduce(bomb, { type: 'MODULE_ACTION', moduleIndex: 0, payload: {} });
    expect(next).toBe(bomb);
  });

  it('still accepts in-contract output (guard is not over-broad)', () => {
    const reduce = createBombReducer({
      [DEV_DEMO_MODULE_ID]: devDemoReducer as ModuleReducer,
    });
    const next = reduce(bomb, { type: 'MODULE_ACTION', moduleIndex: 0, payload: { type: 'CUT' } });
    expect(next.modules[0].status).toBe('solved');
  });
});
