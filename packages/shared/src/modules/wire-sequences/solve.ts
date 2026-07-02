import {
  CUT_RULES,
  MAX_OCCURRENCE,
  type WireSeqWire,
  type WireSequencesState,
} from './types.js';

/**
 * A wire lifted out of its panel into GLOBAL reading order (panel-major,
 * slot-minor), tagged with where it came from and its flat index.
 */
export interface FlatWire {
  readonly wire: WireSeqWire;
  readonly panelIndex: number;
  readonly slotIndex: number;
  readonly globalIndex: number;
}

/**
 * All wires in global reading order — panel 0 top→bottom, then panel 1, … This
 * flat order is the ONLY thing occurrence counting depends on; the currently
 * visible panel is irrelevant (occurrence is global and view-independent).
 */
export function flattenWires(state: WireSequencesState): FlatWire[] {
  const flat: FlatWire[] = [];
  state.panels.forEach((panel, panelIndex) => {
    panel.wires.forEach((wire, slotIndex) => {
      flat.push({ wire, panelIndex, slotIndex, globalIndex: flat.length });
    });
  });
  return flat;
}

/** The wire at a given global index, or undefined if out of range. */
export function wireByGlobalIndex(
  state: WireSequencesState,
  globalIndex: number,
): WireSeqWire | undefined {
  return flattenWires(state)[globalIndex]?.wire;
}

/**
 * 1-based cumulative occurrence of the wire at `globalIndex`: how many wires of
 * the SAME colour appear at-or-before it in global reading order (this one
 * included). Returns 0 for an out-of-range index.
 */
export function occurrenceOf(state: WireSequencesState, globalIndex: number): number {
  const flat = flattenWires(state);
  const target = flat[globalIndex];
  if (!target) return 0;
  let count = 0;
  for (let i = 0; i <= globalIndex; i++) {
    if (flat[i].wire.color === target.wire.color) count++;
  }
  return count;
}

/**
 * Whether the wire at `globalIndex` is a should-cut wire: its connection letter
 * is listed in CUT_RULES for its colour + cumulative occurrence. Defensive
 * guard: if occurrence exceeds the table's 9-row domain (which generation
 * prevents), return false rather than index `undefined`.
 */
export function shouldCut(state: WireSequencesState, globalIndex: number): boolean {
  const wire = wireByGlobalIndex(state, globalIndex);
  if (!wire) return false;
  const occurrence = occurrenceOf(state, globalIndex);
  if (occurrence < 1 || occurrence > MAX_OCCURRENCE) return false;
  return CUT_RULES[wire.color][occurrence - 1].includes(wire.letter);
}

/**
 * The module is solved iff EVERY should-cut wire (across all panels) is severed.
 * A should-not-cut wire's cut state is irrelevant to solving — leaving one
 * wrongly cut never blocks the solve (physical-cut semantics).
 */
export function isSolved(state: WireSequencesState): boolean {
  const flat = flattenWires(state);
  return flat.every((f) => !shouldCut(state, f.globalIndex) || f.wire.cut);
}

/** Highest cumulative occurrence reached by any single colour (generation cap check). */
export function maxColorOccurrence(state: WireSequencesState): number {
  const counts = new Map<string, number>();
  let max = 0;
  for (const { wire } of flattenWires(state)) {
    const next = (counts.get(wire.color) ?? 0) + 1;
    counts.set(wire.color, next);
    if (next > max) max = next;
  }
  return max;
}
