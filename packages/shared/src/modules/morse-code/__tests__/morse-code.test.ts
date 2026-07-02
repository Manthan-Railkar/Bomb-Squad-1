import { describe, expect, it } from '@jest/globals';
import type { BombContext, ModuleState } from '../../../types/index.js';
import {
  MORSE_CODE_MODULE_ID,
  MORSE_WORDS,
  MORSE_FREQUENCIES,
  formatMorseFrequency,
  isMorseCodeAction,
  type MorseCodeState,
  type MorseWord,
} from '../types.js';
import { generateMorseCode } from '../generate.js';
import { MORSE_ALPHABET, MORSE_TABLE, morsePatternForWord, correctFreqIndex } from '../solve.js';
import { morseCodeReducer } from '../reducer.js';
import { getMorseCodeManualPages } from '../manual.js';

/** ctx is unused by Morse Code, but generate() requires the signature. */
const CTX: BombContext = {
  serialNumber: 'AB3XK4',
  batteryCount: 1,
  indicators: [],
  ports: [],
};
Object.freeze(CTX);

// ---------------------------------------------------------------------------
// INDEPENDENT expectations — transcribed by hand from the manual (docs/…v1.pdf
// p.12). A typo in MORSE_TABLE / MORSE_FREQUENCIES / MORSE_ALPHABET must fail
// THESE; do NOT import the module constants to build them.
// ---------------------------------------------------------------------------

const EXPECTED_TABLE: ReadonlyArray<readonly [MorseWord, number]> = [
  ['shell', 3505],
  ['halls', 3515],
  ['slick', 3522],
  ['trick', 3532],
  ['boxes', 3535],
  ['leaks', 3542],
  ['strobe', 3545],
  ['bistro', 3552],
  ['flick', 3555],
  ['bombs', 3565],
  ['break', 3572],
  ['brick', 3575],
  ['steak', 3582],
  ['sting', 3592],
  ['vector', 3595],
  ['beats', 3600],
];

/** Independently hard-coded Morse codes — every letter used by the 16 words + digits. */
const EXPECTED_CODES: Readonly<Record<string, string>> = {
  a: '.-',
  b: '-...',
  c: '-.-.',
  e: '.',
  f: '..-.',
  g: '--.',
  h: '....',
  i: '..',
  k: '-.-',
  l: '.-..',
  m: '--',
  n: '-.',
  o: '---',
  r: '.-.',
  s: '...',
  t: '-',
  v: '...-',
  x: '-..-',
  '0': '-----',
  '5': '.....',
  '9': '----.',
};

const armed = (word: MorseWord, freqIndex: number, initialFreqIndex = freqIndex): ModuleState<MorseCodeState> =>
  Object.freeze({
    moduleId: MORSE_CODE_MODULE_ID,
    status: 'armed',
    data: Object.freeze({ word, freqIndex, initialFreqIndex }),
  });

describe('MORSE_TABLE / MORSE_FREQUENCIES — word ↔ frequency (independent expectation)', () => {
  it('maps every word to the hand-transcribed frequency, all 16 cells', () => {
    expect(MORSE_WORDS).toHaveLength(16);
    for (const [word, khz] of EXPECTED_TABLE) {
      expect(MORSE_TABLE[word]).toBe(khz);
    }
  });

  it('has an entry for every MorseWord and no extras', () => {
    expect(Object.keys(MORSE_TABLE).sort()).toEqual([...MORSE_WORDS].sort());
  });

  it('MORSE_FREQUENCIES is ascending and bijective with MORSE_TABLE values', () => {
    for (let i = 1; i < MORSE_FREQUENCIES.length; i++) {
      expect(MORSE_FREQUENCIES[i]).toBeGreaterThan(MORSE_FREQUENCIES[i - 1]);
    }
    expect([...Object.values(MORSE_TABLE)].sort((a, b) => a - b)).toEqual([...MORSE_FREQUENCIES]);
  });

  it('the i-th word transmits at the i-th (ascending) frequency', () => {
    MORSE_WORDS.forEach((word, i) => {
      expect(MORSE_TABLE[word]).toBe(MORSE_FREQUENCIES[i]);
      expect(correctFreqIndex(word)).toBe(i);
    });
  });

  it('frequencies are integer kHz (no floats)', () => {
    for (const f of MORSE_FREQUENCIES) expect(Number.isInteger(f)).toBe(true);
  });
});

describe('formatMorseFrequency', () => {
  it('renders integer kHz as a 3-decimal MHz string', () => {
    expect(formatMorseFrequency(3505)).toBe('3.505 MHz');
    expect(formatMorseFrequency(3600)).toBe('3.600 MHz');
    expect(formatMorseFrequency(3572)).toBe('3.572 MHz');
  });
});

describe('MORSE_ALPHABET / morsePatternForWord', () => {
  it('matches the independently hard-coded codes for every letter used + digits', () => {
    for (const [ch, code] of Object.entries(EXPECTED_CODES)) {
      expect(MORSE_ALPHABET[ch]).toBe(code);
    }
  });

  it('EXPECTED_CODES covers every letter used by the 16 words (meta-guard)', () => {
    // Review-7.4 finding: 'm' (bombs) and 'n' (sting) were missing — a typo in
    // an uncovered letter would pass the suite. Guard the coverage itself.
    const used = new Set([...MORSE_WORDS.join('')]);
    for (const ch of used) {
      expect(EXPECTED_CODES[ch]).toBeDefined();
    }
  });

  it('covers all 26 letters and 10 digits', () => {
    for (const ch of 'abcdefghijklmnopqrstuvwxyz0123456789') {
      expect(typeof MORSE_ALPHABET[ch]).toBe('string');
    }
    expect(Object.keys(MORSE_ALPHABET)).toHaveLength(36);
  });

  it('every code is dots and dashes only, length 1..5', () => {
    for (const code of Object.values(MORSE_ALPHABET)) {
      expect(code).toMatch(/^[.-]{1,5}$/);
    }
  });

  it('encodes a word letter-by-letter', () => {
    expect(morsePatternForWord('shell')).toEqual(['...', '....', '.', '.-..', '.-..']);
    expect(morsePatternForWord('beats')).toEqual(['-...', '.', '.-', '-', '...']);
    expect(morsePatternForWord('bombs')).toEqual(['-...', '---', '--', '-...', '...']);
    expect(morsePatternForWord('sting')).toEqual(['...', '-', '..', '-.', '--.']);
  });

  it('handles every one of the 16 words without throwing', () => {
    for (const word of MORSE_WORDS) {
      expect(() => morsePatternForWord(word)).not.toThrow();
    }
  });

  it('throws on a character outside the alphabet (programmer-error guard)', () => {
    expect(() => morsePatternForWord('a!b')).toThrow(/no Morse code/);
  });
});

describe('generateMorseCode', () => {
  it('is deterministic for a given seed', () => {
    expect(generateMorseCode(42, CTX)).toEqual(generateMorseCode(42, CTX));
  });

  it('varies across seeds (not a constant instance)', () => {
    const sig = (s: MorseCodeState) => `${s.word}:${s.freqIndex}`;
    const first = sig(generateMorseCode(0, CTX));
    const anyDifferent = Array.from({ length: 40 }, (_, i) => i + 1).some(
      (seed) => sig(generateMorseCode(seed, CTX)) !== first,
    );
    expect(anyDifferent).toBe(true);
  });

  it('draws a valid word and an in-range dial start; start == initial', () => {
    for (let seed = 0; seed < 300; seed++) {
      const s = generateMorseCode(seed, CTX);
      expect(MORSE_WORDS).toContain(s.word);
      expect(s.freqIndex).toBeGreaterThanOrEqual(0);
      expect(s.freqIndex).toBeLessThan(MORSE_FREQUENCIES.length);
      expect(s.initialFreqIndex).toBe(s.freqIndex);
    }
  });

  it('is NEVER born solved (start dial ≠ answer) across seeds 0–299', () => {
    for (let seed = 0; seed < 300; seed++) {
      const s = generateMorseCode(seed, CTX);
      expect(s.freqIndex).not.toBe(correctFreqIndex(s.word));
    }
  });

  it('stores no pre-computed answer (only word / freqIndex / initialFreqIndex)', () => {
    expect(Object.keys(generateMorseCode(7, CTX)).sort()).toEqual([
      'freqIndex',
      'initialFreqIndex',
      'word',
    ]);
  });

  it('never calls Math.random (seeded RNG only)', () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error('Math.random is banned in module generation');
    };
    try {
      expect(() => generateMorseCode(3, CTX)).not.toThrow();
    } finally {
      Math.random = original;
    }
  });
});

describe('morseCodeReducer — contract obligations (frozen inputs throughout)', () => {
  it('happy path: dial to the answer via steps, then TX → solved', () => {
    const word: MorseWord = 'trick'; // answer index 3
    let state = armed(word, 0);
    for (let i = 0; i < correctFreqIndex(word); i++) {
      state = Object.freeze(morseCodeReducer(state, { type: 'FREQ_UP' })) as ModuleState<MorseCodeState>;
      Object.freeze(state.data);
    }
    expect(state.data.freqIndex).toBe(correctFreqIndex(word));
    const solved = morseCodeReducer(state, { type: 'TX' });
    expect(solved.status).toBe('solved');
    expect(solved.data.freqIndex).toBe(correctFreqIndex(word));
  });

  it('wrong TX → transient struck with the dial PRESERVED (no reset)', () => {
    const word: MorseWord = 'shell'; // answer index 0
    const state = armed(word, 7); // dialed away from the answer
    const struck = morseCodeReducer(state, { type: 'TX' });
    expect(struck.status).toBe('struck');
    expect(struck.data.freqIndex).toBe(7); // dial left where it was
    expect(struck.data.word).toBe(word);
  });

  it('FREQ_UP / FREQ_DOWN step the dial, staying armed', () => {
    const up = morseCodeReducer(armed('shell', 5), { type: 'FREQ_UP' });
    expect(up.status).toBe('armed');
    expect(up.data.freqIndex).toBe(6);
    const down = morseCodeReducer(armed('shell', 5), { type: 'FREQ_DOWN' });
    expect(down.data.freqIndex).toBe(4);
  });

  it('clamps at both ends (same ref, never a strike)', () => {
    const top = armed('beats', MORSE_FREQUENCIES.length - 1);
    expect(morseCodeReducer(top, { type: 'FREQ_UP' })).toBe(top);
    const bottom = armed('shell', 0);
    expect(morseCodeReducer(bottom, { type: 'FREQ_DOWN' })).toBe(bottom);
  });

  it('clamps out-of-band freqIndex too — never walks past the dial (review-7.4)', () => {
    // Corrupted persisted state must not escape the range clamp.
    const over = armed('beats', 16);
    expect(morseCodeReducer(over, { type: 'FREQ_UP' })).toBe(over);
    const under = armed('shell', -1);
    expect(morseCodeReducer(under, { type: 'FREQ_DOWN' })).toBe(under);
  });

  it('a strike leaves the dial free to keep stepping and eventually solve', () => {
    const word: MorseWord = 'boxes'; // answer index 4
    let state: ModuleState<MorseCodeState> = armed(word, 0);
    // Wrong TX at index 0.
    state = Object.freeze(morseCodeReducer(state, { type: 'TX' })) as ModuleState<MorseCodeState>;
    Object.freeze(state.data);
    expect(state.status).toBe('struck');
    // Bomb reducer would re-arm; simulate that, dial preserved.
    state = Object.freeze({ ...state, status: 'armed' as const });
    while (state.data.freqIndex < correctFreqIndex(word)) {
      state = Object.freeze(morseCodeReducer(state, { type: 'FREQ_UP' })) as ModuleState<MorseCodeState>;
      Object.freeze(state.data);
    }
    expect(morseCodeReducer(state, { type: 'TX' }).status).toBe('solved');
  });

  it('solved-inert: any action on a solved module is a no-op (same ref)', () => {
    const solved = Object.freeze({ ...armed('shell', 0), status: 'solved' as const });
    expect(morseCodeReducer(solved, { type: 'TX' })).toBe(solved);
    expect(morseCodeReducer(solved, { type: 'FREQ_UP' })).toBe(solved);
    expect(morseCodeReducer(solved, { type: 'FREQ_DOWN' })).toBe(solved);
  });

  it('immutability: never mutates the (frozen) input state', () => {
    const state = armed('trick', 0);
    expect(() => morseCodeReducer(state, { type: 'FREQ_UP' })).not.toThrow();
    expect(() => morseCodeReducer(state, { type: 'TX' })).not.toThrow();
    expect(state.data.freqIndex).toBe(0);
    expect(state.status).toBe('armed');
  });

  it('guard: malformed actions are no-ops (same ref)', () => {
    const state = armed('shell', 3);
    const bad: unknown[] = [undefined, null, 42, 'TX', {}, { type: 'X' }, { type: 'PRESS' }];
    for (const action of bad) {
      expect(morseCodeReducer(state, action)).toBe(state);
    }
  });

  it('tolerates the stamped strikeCount field on a TX action', () => {
    const word: MorseWord = 'shell'; // answer index 0
    const state = armed(word, 0);
    const solved = morseCodeReducer(state, { type: 'TX', strikeCount: 2 } as unknown);
    expect(solved.status).toBe('solved');
  });

  it('MODULE_RESET restores initialFreqIndex, re-arms, word unchanged', () => {
    const word: MorseWord = 'sting';
    // Start at initial 2, step up, then a wrong TX (struck) — reset should restore 2.
    let state: ModuleState<MorseCodeState> = armed(word, 2, 2);
    state = Object.freeze(morseCodeReducer(state, { type: 'FREQ_UP' })) as ModuleState<MorseCodeState>;
    Object.freeze(state.data);
    expect(state.data.freqIndex).toBe(3);
    const reset = morseCodeReducer(state, { type: 'MODULE_RESET' });
    expect(reset.status).toBe('armed');
    expect(reset.data.freqIndex).toBe(2);
    expect(reset.data.word).toBe(word);
  });

  it('MODULE_RESET on an already-at-initial armed module is a no-op (same ref)', () => {
    const state = armed('shell', 4, 4);
    expect(morseCodeReducer(state, { type: 'MODULE_RESET' })).toBe(state);
  });
});

describe('isMorseCodeAction', () => {
  it('accepts the well-formed actions', () => {
    for (const type of ['FREQ_UP', 'FREQ_DOWN', 'TX', 'MODULE_RESET']) {
      expect(isMorseCodeAction({ type })).toBe(true);
    }
    expect(isMorseCodeAction({ type: 'TX', strikeCount: 1 })).toBe(true); // tolerates stamp
  });
  it('rejects malformed input', () => {
    expect(isMorseCodeAction(null)).toBe(false);
    expect(isMorseCodeAction(42)).toBe(false);
    expect(isMorseCodeAction({})).toBe(false);
    expect(isMorseCodeAction({ type: 'NOPE' })).toBe(false);
  });
});

describe('getMorseCodeManualPages — renders the same constants the solver reads', () => {
  const pages = getMorseCodeManualPages();

  it('is a single chapter keyed by the module id', () => {
    expect(pages).toHaveLength(1);
    expect(pages[0].chapterId).toBe(MORSE_CODE_MODULE_ID);
  });

  it('renders the alphabet chart FROM MORSE_ALPHABET (compact 2-pair layout)', () => {
    const chart = pages[0].sections.find((s) => s.table?.headers[0] === 'Character');
    expect(chart?.table).toBeDefined();
    // Two character/code column pairs → 18 rows for the 36 entries.
    expect(chart!.table!.headers).toEqual(['Character', 'Code', 'Character', 'Code']);
    expect(chart!.table!.rows).toHaveLength(18);
    // Every non-empty (char, code) cell pair matches the alphabet, and all 36
    // entries are present exactly once.
    const seen = new Set<string>();
    for (const [lch, lcode, rch, rcode] of chart!.table!.rows) {
      expect(MORSE_ALPHABET[lch.toLowerCase()]).toBe(lcode);
      seen.add(lch.toLowerCase());
      if (rch !== '') {
        expect(MORSE_ALPHABET[rch.toLowerCase()]).toBe(rcode);
        seen.add(rch.toLowerCase());
      }
    }
    expect(seen.size).toBe(36);
  });

  it('renders the word→frequency table FROM MORSE_TABLE via formatMorseFrequency', () => {
    const freq = pages[0].sections.find((s) => s.table?.headers[0] === 'If the word is');
    expect(freq?.table).toBeDefined();
    expect(freq!.table!.rows).toHaveLength(16);
    for (const [word, display] of freq!.table!.rows) {
      expect(display).toBe(formatMorseFrequency(MORSE_TABLE[word as MorseWord]));
    }
  });
});
