/**
 * whos-on-first — The Who's on First module (Story 6.2, FR25). Second Medium-tier
 * module, built on the keypads (6.1) / passwords (5.5) template.
 *
 * A two-step word puzzle. The module shows a DISPLAY word and SIX button labels
 * (2 columns × 3 rows). Step 1: the display word maps (DISPLAY_POSITIONS) to one
 * of the six button POSITIONS (0–5) — read the label sitting at that position.
 * Step 2: that read label selects a priority list (LABEL_PRIORITIES); press the
 * FIRST label in the list that appears among the six buttons. Single press
 * disarms (epic 6.2 AC — NOT the multi-stage arcade version).
 *
 * No stored answer (wires AI1 / keypads / passwords convention): neither the read
 * label nor the solution button index is stored. Everything is public — the
 * display word and all six labels are rendered on the module, and both lookup
 * tables are public manual content. Each PRESS recomputes the solution from the
 * public display + labels + tables; nothing secret rides in state or crosses to
 * the client.
 *
 * Like keypads/passwords (and unlike the-button) there is no live-timer
 * dependency and no colour cue.
 */

/** Module identifier — kebab-case (project naming convention). */
export const WHOS_ON_FIRST_MODULE_ID = 'whos-on-first';

/** Six button labels in a 2-column × 3-row grid. */
export const BUTTON_COUNT = 6;

/**
 * Button position index → human-readable name. Index scheme (reading order):
 * 0=top-left, 1=top-right, 2=middle-left, 3=middle-right, 4=bottom-left,
 * 5=bottom-right — i.e. `index = row*2 + col`. Used by the manual's Step-1 table.
 */
export const POSITION_NAMES = [
  'top-left',
  'top-right',
  'middle-left',
  'middle-right',
  'bottom-left',
  'bottom-right',
] as const;

/**
 * STEP 1 — display word → button position to READ (0–5). The 28 canonical
 * display words (the blank display is the empty string `''`). Transcribed from
 * the KTANE v1 manual page 9 (the eye-icon grid), detected programmatically from
 * the rendered page and cross-checked against the canonical table (the two
 * eye-ambiguous cells — blank → bottom-left, BLANK → middle-right — match). This
 * is the authoritative source; the solver and manual both read it.
 *
 * ONE constant, TWO consumers (solver + manual). `DISPLAY_WORDS` derives from its
 * keys so a display word can never exist without a mapping.
 */
export const DISPLAY_POSITIONS: Readonly<Record<string, number>> = {
  '': 4, // blank display
  YES: 2,
  FIRST: 1,
  DISPLAY: 5,
  OKAY: 1,
  SAYS: 5,
  NOTHING: 2,
  BLANK: 3,
  NO: 5,
  LED: 2,
  LEAD: 5,
  READ: 3,
  RED: 3,
  REED: 4,
  LEED: 4,
  'HOLD ON': 5,
  YOU: 3,
  'YOU ARE': 5,
  YOUR: 3,
  "YOU'RE": 3,
  UR: 0,
  THERE: 5,
  "THEY'RE": 4,
  THEIR: 3,
  'THEY ARE': 2,
  SEE: 5,
  C: 1,
  CEE: 5,
} as const;

/**
 * STEP 2 — button label → its 14-word ordered priority list. Press the FIRST word
 * in the list that appears among the six buttons. Extracted verbatim from the
 * KTANE v1 manual page 10 (plain-text layer). Two disjoint 14-word FAMILIES: each
 * list is a permutation of its own family only (a label's list always contains
 * the label itself → a solution always exists, since the read label is one of the
 * six buttons). `WOF_BUTTON_LABELS` derives from its keys.
 *
 * ONE constant, TWO consumers (solver + manual).
 */
export const LABEL_PRIORITIES: Readonly<Record<string, readonly string[]>> = {
  // ---- Family A (14) ----
  READY: ['YES', 'OKAY', 'WHAT', 'MIDDLE', 'LEFT', 'PRESS', 'RIGHT', 'BLANK', 'READY', 'NO', 'FIRST', 'UHHH', 'NOTHING', 'WAIT'],
  FIRST: ['LEFT', 'OKAY', 'YES', 'MIDDLE', 'NO', 'RIGHT', 'NOTHING', 'UHHH', 'WAIT', 'READY', 'BLANK', 'WHAT', 'PRESS', 'FIRST'],
  NO: ['BLANK', 'UHHH', 'WAIT', 'FIRST', 'WHAT', 'READY', 'RIGHT', 'YES', 'NOTHING', 'LEFT', 'PRESS', 'OKAY', 'NO', 'MIDDLE'],
  BLANK: ['WAIT', 'RIGHT', 'OKAY', 'MIDDLE', 'BLANK', 'PRESS', 'READY', 'NOTHING', 'NO', 'WHAT', 'LEFT', 'UHHH', 'YES', 'FIRST'],
  NOTHING: ['UHHH', 'RIGHT', 'OKAY', 'MIDDLE', 'YES', 'BLANK', 'NO', 'PRESS', 'LEFT', 'WHAT', 'WAIT', 'FIRST', 'NOTHING', 'READY'],
  YES: ['OKAY', 'RIGHT', 'UHHH', 'MIDDLE', 'FIRST', 'WHAT', 'PRESS', 'READY', 'NOTHING', 'YES', 'LEFT', 'BLANK', 'NO', 'WAIT'],
  WHAT: ['UHHH', 'WHAT', 'LEFT', 'NOTHING', 'READY', 'BLANK', 'MIDDLE', 'NO', 'OKAY', 'FIRST', 'WAIT', 'YES', 'PRESS', 'RIGHT'],
  UHHH: ['READY', 'NOTHING', 'LEFT', 'WHAT', 'OKAY', 'YES', 'RIGHT', 'NO', 'PRESS', 'BLANK', 'UHHH', 'MIDDLE', 'WAIT', 'FIRST'],
  LEFT: ['RIGHT', 'LEFT', 'FIRST', 'NO', 'MIDDLE', 'YES', 'BLANK', 'WHAT', 'UHHH', 'WAIT', 'PRESS', 'READY', 'OKAY', 'NOTHING'],
  RIGHT: ['YES', 'NOTHING', 'READY', 'PRESS', 'NO', 'WAIT', 'WHAT', 'RIGHT', 'MIDDLE', 'LEFT', 'UHHH', 'BLANK', 'OKAY', 'FIRST'],
  MIDDLE: ['BLANK', 'READY', 'OKAY', 'WHAT', 'NOTHING', 'PRESS', 'NO', 'WAIT', 'LEFT', 'MIDDLE', 'RIGHT', 'FIRST', 'UHHH', 'YES'],
  OKAY: ['MIDDLE', 'NO', 'FIRST', 'YES', 'UHHH', 'NOTHING', 'WAIT', 'OKAY', 'LEFT', 'READY', 'BLANK', 'PRESS', 'WHAT', 'RIGHT'],
  WAIT: ['UHHH', 'NO', 'BLANK', 'OKAY', 'YES', 'LEFT', 'FIRST', 'PRESS', 'WHAT', 'WAIT', 'NOTHING', 'READY', 'RIGHT', 'MIDDLE'],
  PRESS: ['RIGHT', 'MIDDLE', 'YES', 'READY', 'PRESS', 'OKAY', 'NOTHING', 'UHHH', 'BLANK', 'LEFT', 'FIRST', 'WHAT', 'NO', 'WAIT'],
  // ---- Family B (14) ----
  YOU: ['SURE', 'YOU ARE', 'YOUR', "YOU'RE", 'NEXT', 'UH HUH', 'UR', 'HOLD', 'WHAT?', 'YOU', 'UH UH', 'LIKE', 'DONE', 'U'],
  'YOU ARE': ['YOUR', 'NEXT', 'LIKE', 'UH HUH', 'WHAT?', 'DONE', 'UH UH', 'HOLD', 'YOU', 'U', "YOU'RE", 'SURE', 'UR', 'YOU ARE'],
  YOUR: ['UH UH', 'YOU ARE', 'UH HUH', 'YOUR', 'NEXT', 'UR', 'SURE', 'U', "YOU'RE", 'YOU', 'WHAT?', 'HOLD', 'LIKE', 'DONE'],
  "YOU'RE": ['YOU', "YOU'RE", 'UR', 'NEXT', 'UH UH', 'YOU ARE', 'U', 'YOUR', 'WHAT?', 'UH HUH', 'SURE', 'DONE', 'LIKE', 'HOLD'],
  UR: ['DONE', 'U', 'UR', 'UH HUH', 'WHAT?', 'SURE', 'YOUR', 'HOLD', "YOU'RE", 'LIKE', 'NEXT', 'UH UH', 'YOU ARE', 'YOU'],
  U: ['UH HUH', 'SURE', 'NEXT', 'WHAT?', "YOU'RE", 'UR', 'UH UH', 'DONE', 'U', 'YOU', 'LIKE', 'HOLD', 'YOU ARE', 'YOUR'],
  'UH HUH': ['UH HUH', 'YOUR', 'YOU ARE', 'YOU', 'DONE', 'HOLD', 'UH UH', 'NEXT', 'SURE', 'LIKE', "YOU'RE", 'UR', 'U', 'WHAT?'],
  'UH UH': ['UR', 'U', 'YOU ARE', "YOU'RE", 'NEXT', 'UH UH', 'DONE', 'YOU', 'UH HUH', 'LIKE', 'YOUR', 'SURE', 'HOLD', 'WHAT?'],
  'WHAT?': ['YOU', 'HOLD', "YOU'RE", 'YOUR', 'U', 'DONE', 'UH UH', 'LIKE', 'YOU ARE', 'UH HUH', 'UR', 'NEXT', 'WHAT?', 'SURE'],
  DONE: ['SURE', 'UH HUH', 'NEXT', 'WHAT?', 'YOUR', 'UR', "YOU'RE", 'HOLD', 'LIKE', 'YOU', 'U', 'YOU ARE', 'UH UH', 'DONE'],
  NEXT: ['WHAT?', 'UH HUH', 'UH UH', 'YOUR', 'HOLD', 'SURE', 'NEXT', 'LIKE', 'DONE', 'YOU ARE', 'UR', "YOU'RE", 'U', 'YOU'],
  HOLD: ['YOU ARE', 'U', 'DONE', 'UH UH', 'YOU', 'UR', 'SURE', 'WHAT?', "YOU'RE", 'NEXT', 'HOLD', 'UH HUH', 'YOUR', 'LIKE'],
  SURE: ['YOU ARE', 'DONE', 'LIKE', "YOU'RE", 'YOU', 'HOLD', 'UH HUH', 'UR', 'SURE', 'U', 'WHAT?', 'NEXT', 'YOUR', 'UH UH'],
  LIKE: ["YOU'RE", 'NEXT', 'U', 'UR', 'HOLD', 'DONE', 'UH UH', 'WHAT?', 'UH HUH', 'YOU', 'LIKE', 'SURE', 'YOU ARE', 'YOUR'],
} as const;

/** The 28 display words (Step-1 keys) — derived from the single source of truth. */
export const DISPLAY_WORDS: readonly string[] = Object.keys(DISPLAY_POSITIONS);

/** The 28 button-label words (Step-2 keys) — derived from the single source. */
export const WOF_BUTTON_LABELS: readonly string[] = Object.keys(LABEL_PRIORITIES);

export interface WhosOnFirstState {
  /** The word shown on the module's display (may be '' for the blank display). */
  readonly display: string;
  /** The six button labels, grid order 0=TL,1=TR,2=ML,3=MR,4=BL,5=BR (distinct). */
  readonly labels: ReadonlyArray<string>;
}

/** Defuser action: press one button. Actions reach the reducer as `unknown`. */
export type WhosOnFirstAction = { type: 'PRESS'; buttonIndex: number };

/** Lifecycle action forwarded whole by the bomb reducer (see types/actions.ts). */
export type WhosOnFirstReset = { type: 'MODULE_RESET' };

/** Runtime guard: actions reach reducers as `unknown` (untrusted input). */
export function isWhosOnFirstAction(action: unknown): action is WhosOnFirstAction | WhosOnFirstReset {
  if (typeof action !== 'object' || action === null || !('type' in action)) return false;
  const type = (action as { type: unknown }).type;
  if (type === 'MODULE_RESET') return true;
  if (type !== 'PRESS') return false;
  return typeof (action as { buttonIndex?: unknown }).buttonIndex === 'number';
}
