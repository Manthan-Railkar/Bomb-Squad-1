/**
 * wire-sequences — the first genuinely STATEFUL Medium module (Story 6.3, FR26).
 *
 * Several panels (1–3 wires each), navigated one at a time with up/down. Each
 * wire has a colour (red/blue/black) and a connection letter (A/B/C). A wire is
 * cut per the page-14 CUT_RULES table, keyed by its colour and its CUMULATIVE
 * occurrence across ALL panels (panel-major, slot-minor reading order) — not its
 * panel-local position. The module auto-solves the instant every should-cut wire
 * is severed (no submit). Pure logic lives HERE in packages/shared so both the
 * server registry (MODULE_REDUCERS) and the client sandbox run the SAME code;
 * apps/client/src/modules/wire-sequences/ re-exports it.
 */

/** Module identifier — kebab-case (project naming convention). Reserved in MODULE_IDS. */
export const WIRE_SEQUENCES_MODULE_ID = 'wire-sequences';

/** The three rule-table colours — NOT the 5-colour `wires` set. */
export const WIRE_SEQ_COLORS = ['red', 'blue', 'black'] as const;

/** The three connection letters a wire can attach to. */
export const WIRE_SEQ_LETTERS = ['A', 'B', 'C'] as const;

export type WireSeqColor = (typeof WIRE_SEQ_COLORS)[number];
export type WireSeqLetter = (typeof WIRE_SEQ_LETTERS)[number];

/**
 * Colorblind redundancy label rendered beside each wire's colour (colour is
 * rule-load-bearing, so it must never be the only signal — the `wires`
 * convention). Deliberately DISTINCT from the A/B/C connection letters: `U` for
 * bl“U”e and `K` for blac“K” avoid colliding with a connection letter of `B`.
 */
export const WIRE_SEQ_COLOR_LABELS: Readonly<Record<WireSeqColor, string>> = {
  red: 'R',
  blue: 'U',
  black: 'K',
};

export interface WireSeqWire {
  readonly color: WireSeqColor;
  readonly letter: WireSeqLetter;
  /** A severed wire stays severed until MODULE_RESET (cuts are physical). */
  readonly cut: boolean;
}

export interface WireSeqPanel {
  /** 1–3 wires in distinct vertical slots. */
  readonly wires: ReadonlyArray<WireSeqWire>;
}

export interface WireSequencesState {
  readonly panels: ReadonlyArray<WireSeqPanel>;
  /** Which panel is visible (a view concern only — never affects occurrence). */
  readonly currentPanel: number;
}

/** Defuser actions: cut a wire (by GLOBAL index) or navigate panels. */
export type WireSequencesAction =
  | { type: 'CUT'; wireIndex: number }
  | { type: 'NAV'; direction: 'up' | 'down' };

/** Lifecycle action forwarded whole by the bomb reducer (see types/actions.ts). */
export type WireSequencesReset = { type: 'MODULE_RESET' };

/** Runtime guard: actions reach reducers as `unknown` (untrusted input). */
export function isWireSequencesAction(
  action: unknown,
): action is WireSequencesAction | WireSequencesReset {
  if (typeof action !== 'object' || action === null || !('type' in action)) return false;
  const type = (action as { type: unknown }).type;
  if (type === 'MODULE_RESET') return true;
  if (type === 'CUT') return typeof (action as { wireIndex?: unknown }).wireIndex === 'number';
  if (type === 'NAV') {
    const dir = (action as { direction?: unknown }).direction;
    return dir === 'up' || dir === 'down';
  }
  return false;
}

/**
 * The authoritative CUT_RULES table (canonical KTANE v1 manual, page 14 — clean
 * text-layer extract, PDF-verified). For each colour, 9 entries (occurrence
 * 1st..9th); entry `[occ-1]` is the set of connection letters that mean "cut".
 *
 * This ONE constant is the single source shared by solve.ts (the reducer) and
 * manual.ts (the Expert pages) — they cannot diverge. The table caps at the 9th
 * occurrence, which is why generate.ts guarantees no colour exceeds 9 cumulative
 * occurrences and shouldCut() guards the index defensively.
 */
export const CUT_RULES: Readonly<Record<WireSeqColor, ReadonlyArray<ReadonlyArray<WireSeqLetter>>>> = {
  red: [['C'], ['B'], ['A'], ['A', 'C'], ['B'], ['A', 'C'], ['A', 'B', 'C'], ['A', 'B'], ['B']],
  blue: [['B'], ['A', 'C'], ['B'], ['A'], ['B'], ['B', 'C'], ['C'], ['A', 'C'], ['A']],
  black: [['A', 'B', 'C'], ['A', 'C'], ['B'], ['A', 'C'], ['B'], ['B', 'C'], ['A', 'B'], ['C'], ['C']],
} as const;

/** Number of occurrence rows per colour (the table's domain). */
export const MAX_OCCURRENCE = 9;
