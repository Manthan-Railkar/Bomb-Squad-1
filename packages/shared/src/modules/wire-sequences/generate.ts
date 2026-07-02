import { makeSeededRng } from '../../seeding/index.js';
import {
  MAX_OCCURRENCE,
  WIRE_SEQ_COLORS,
  WIRE_SEQ_LETTERS,
  type WireSeqPanel,
  type WireSeqWire,
  type WireSequencesState,
} from './types.js';
import { isSolved, maxColorOccurrence } from './solve.js';

const MIN_PANELS = 3;
const MAX_PANELS = 4;
const MIN_WIRES_PER_PANEL = 1;
const MAX_WIRES_PER_PANEL = 3;
const MAX_ATTEMPTS = 10000;

/**
 * Pure, seeded instance generator — the ONLY place randomness is allowed in a
 * module, and only via makeSeededRng (Math.random is banned project-wide).
 * Synchronous and CPU-cheap. `ctx` is unused — Wire Sequences has no
 * bomb-context rule (like keypads/whos-on-first), so the signature takes seed
 * alone.
 *
 * Algorithm:
 *  1. Seeded panel count (3–4).
 *  2. Per panel, seeded wire count (1–3), each wire a seeded colour + letter,
 *     all cut: false; currentPanel starts at 0.
 *  3. VALIDATE-THEN-REROLL from the SAME seeded stream until BOTH hold:
 *       (i)  the instance is NOT born-solved (≥1 should-cut wire — AC1), and
 *       (ii) no colour exceeds 9 cumulative occurrences (the table's domain).
 *     Cap the loop and throw loud if unsatisfiable (a thrown round is
 *     debuggable; a silent born-solved/unsolvable puzzle is not).
 *
 * The answer is NOT stored: the reducer recomputes shouldCut/isSolved from the
 * public panels + CUT_RULES at cut-time (wires AI1 — nothing secret in state).
 */
export function generateWireSequences(seed: number): WireSequencesState {
  const rng = makeSeededRng(seed); // asserts non-negative integer seed
  const randInt = (n: number): number => Math.floor(rng() * n);
  const pick = <T>(arr: readonly T[]): T => arr[randInt(arr.length)];

  const draw = (): WireSequencesState => {
    const panelCount = MIN_PANELS + randInt(MAX_PANELS - MIN_PANELS + 1);
    const panels: WireSeqPanel[] = Array.from({ length: panelCount }, () => {
      const wireCount = MIN_WIRES_PER_PANEL + randInt(MAX_WIRES_PER_PANEL - MIN_WIRES_PER_PANEL + 1);
      const wires: WireSeqWire[] = Array.from({ length: wireCount }, () => ({
        color: pick(WIRE_SEQ_COLORS),
        letter: pick(WIRE_SEQ_LETTERS),
        cut: false,
      }));
      return { wires };
    });
    return { panels, currentPanel: 0 };
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const state = draw();
    // Not born-solved (≥1 should-cut wire) AND within the 9-occurrence ceiling.
    if (!isSolved(state) && maxColorOccurrence(state) <= MAX_OCCURRENCE) {
      return state;
    }
  }

  /* istanbul ignore next -- unreachable: a valid instance is found in a handful of tries */
  throw new Error('wire-sequences: could not generate a non-trivial, in-domain instance');
}
