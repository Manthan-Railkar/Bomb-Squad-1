/**
 * keypads — The Keypads module (Story 6.1, FR24). First Medium-tier module.
 *
 * A 2×2 grid of four glyph buttons. Exactly one of six reference columns (each
 * seven symbols, listed top-to-bottom) contains all four glyphs shown on the
 * keypad; the team must press the four buttons in the order their symbols appear
 * top-to-bottom in that unique column. A press out of order is a strike.
 *
 * No stored answer (wires AI1 / passwords convention): the solution column and
 * press order are NEVER stored in state. They are derivable from public data —
 * generation guarantees exactly one reference column contains all four `keys`,
 * and the press order is that column's top-to-bottom ordering. Each PRESS
 * recomputes the expected order from the public KEYPAD_COLUMNS table; nothing
 * secret rides in state or crosses to the client (the column table is public
 * manual content).
 *
 * Like passwords (and unlike the-button) there is no live-timer dependency and
 * no colour cue — Keypads is pure press-in-order validated against a public
 * column table.
 */

/** Module identifier — kebab-case (project naming convention). */
export const KEYPADS_MODULE_ID = 'keypads';

/** The keypad is a 2×2 grid: four buttons (0=TL, 1=TR, 2=BL, 3=BR). */
export const KEY_COUNT = 4;
/**
 * Six reference columns in the manual. Named KEYPAD_-prefixed (not the passwords
 * `COLUMN_COUNT`) — the shared barrel re-exports every module's public names, so
 * a bare `COLUMN_COUNT` would collide with passwords' five keypad columns.
 */
export const KEYPAD_COLUMN_COUNT = 6;
/** Each reference column lists seven symbols, top-to-bottom. */
export const SYMBOLS_PER_COLUMN = 7;

/**
 * The canonical symbol vocabulary — stable kebab-case ids. The glyph a symbol
 * renders as is a RENDERING concern (see KEYPAD_SYMBOL_GLYPHS); the reducer,
 * solver and generator treat these ids as opaque, so the visual asset can be
 * swapped without touching any logic (AC3). Transcribed from the GDD Module 3
 * table (six reference columns, verbatim).
 */
export const KEYPAD_SYMBOLS = [
  'q-mirror',
  'lambda-serif',
  'lambda-italic',
  'h-barred',
  'hz-crossed',
  'psi-tail',
  'paren-dot',
  'e-umlaut',
  'e-plain',
  'omega-macron',
  'star-hollow',
  'question-upside',
  'copyright',
  'omega-hook',
  'zhe',
  'ezh-reversed',
  'be-cyrillic',
  'pilcrow',
  'hard-sign',
  'h-zhe',
  'question-variant',
  'dots',
  'psi',
  'c-dot',
  'ze-cedilla',
  'star-solid',
  'star-four',
  'ae',
  'i-macron',
  'omega',
] as const;

export type SymbolId = (typeof KEYPAD_SYMBOLS)[number];

/**
 * The SIX reference columns, transcribed verbatim from the GDD Module 3:
 * Keypads table. `KEYPAD_COLUMNS[c]` is column c's seven symbol ids in
 * TOP-TO-BOTTOM order (index 0 = top). The order is load-bearing — it IS the
 * press order. Distinct symbols recur across columns (e.g. lambda-italic in
 * cols 1/2/3, hard-sign in cols 4/5), which is why a 4-subset CAN belong to two
 * columns; generation rejects any such non-unique instance (AC1).
 *
 * ONE constant, THREE consumers: the generator picks a target column + 4
 * symbols, the solver finds the unique containing column and its top-to-bottom
 * order, and the manual renders the whole table. They cannot diverge.
 */
export const KEYPAD_COLUMNS: ReadonlyArray<ReadonlyArray<SymbolId>> = [
  // Col 1
  ['q-mirror', 'lambda-serif', 'lambda-italic', 'h-barred', 'hz-crossed', 'psi-tail', 'paren-dot'],
  // Col 2
  ['e-umlaut', 'q-mirror', 'e-plain', 'omega-macron', 'star-hollow', 'lambda-italic', 'question-upside'],
  // Col 3
  ['copyright', 'omega-hook', 'omega-macron', 'zhe', 'ezh-reversed', 'lambda-italic', 'star-hollow'],
  // Col 4
  ['be-cyrillic', 'pilcrow', 'hard-sign', 'h-zhe', 'zhe', 'question-variant', 'dots'],
  // Col 5
  ['psi', 'dots', 'hard-sign', 'c-dot', 'pilcrow', 'ze-cedilla', 'star-solid'],
  // Col 6
  ['be-cyrillic', 'e-umlaut', 'star-four', 'ae', 'psi', 'i-macron', 'omega'],
] as const;

/**
 * Symbol id → { glyph, label }. PURELY a rendering/description concern (the
 * logic never reads it) — the single swap point for the AC3 glyph asset. Ships
 * with the GDD's closest-Unicode approximations (a stopgap; the authoritative
 * visuals are the manual PDF page 7). `label` is the closest natural
 * description, so a player can name the symbol under time pressure and the
 * manual/Defuser stay describable even where a font lacks the glyph.
 */
export const KEYPAD_SYMBOL_GLYPHS: Record<SymbolId, { readonly glyph: string; readonly label: string }> = {
  'q-mirror': { glyph: 'Ϙ', label: 'mirrored Q' },
  'lambda-serif': { glyph: 'ƛ', label: 'crossed lambda' },
  'lambda-italic': { glyph: 'λ', label: 'lambda' },
  'h-barred': { glyph: 'ħ', label: 'barred h' },
  'hz-crossed': { glyph: 'Ħ', label: 'crossed H' },
  'psi-tail': { glyph: 'ѱ', label: 'tailed psi' },
  'paren-dot': { glyph: '϶', label: 'reversed bracket' },
  'e-umlaut': { glyph: 'Ӭ', label: 'backwards E with dots' },
  'e-plain': { glyph: 'Э', label: 'backwards E' },
  'omega-macron': { glyph: 'ῶ', label: 'omega with bar' },
  'star-hollow': { glyph: '☆', label: 'hollow star' },
  'question-upside': { glyph: '¿', label: 'upside-down question mark' },
  copyright: { glyph: '©', label: 'copyright' },
  'omega-hook': { glyph: 'ῳ', label: 'hooked omega' },
  zhe: { glyph: 'Ж', label: 'cursive butterfly (Zhe)' },
  'ezh-reversed': { glyph: 'Ƹ', label: 'reversed 3' },
  'be-cyrillic': { glyph: 'б', label: 'balloon (be)' },
  pilcrow: { glyph: '¶', label: 'paragraph mark' },
  'hard-sign': { glyph: 'Ъ', label: 'b with tail (hard sign)' },
  'h-zhe': { glyph: 'Җ', label: 'tailed butterfly' },
  'question-variant': { glyph: '⸮', label: 'reversed question mark' },
  dots: { glyph: '‥', label: 'two dots' },
  psi: { glyph: 'Ψ', label: 'trident (psi)' },
  'c-dot': { glyph: 'Ċ', label: 'C with dot' },
  'ze-cedilla': { glyph: 'Ҙ', label: 'hooked 3' },
  'star-solid': { glyph: '★', label: 'solid star' },
  'star-four': { glyph: '✦', label: 'four-point star' },
  ae: { glyph: 'æ', label: 'ae ligature' },
  'i-macron': { glyph: 'Ӣ', label: 'N with bar' },
  omega: { glyph: 'Ω', label: 'omega' },
};

export interface KeypadsState {
  /** `keys[i]` is the symbol id shown on grid position i (0=TL,1=TR,2=BL,3=BR). */
  readonly keys: ReadonlyArray<SymbolId>;
  /** Ordered grid indices pressed correctly so far (the team's progress). */
  readonly pressed: ReadonlyArray<number>;
}

/** Defuser action: press one grid button. Actions reach the reducer as `unknown`. */
export type KeypadsAction = { type: 'PRESS'; keyIndex: number };

/** Lifecycle action forwarded whole by the bomb reducer (see types/actions.ts). */
export type KeypadsReset = { type: 'MODULE_RESET' };

/** Runtime guard: actions reach reducers as `unknown` (untrusted input). */
export function isKeypadsAction(action: unknown): action is KeypadsAction | KeypadsReset {
  if (typeof action !== 'object' || action === null || !('type' in action)) return false;
  const type = (action as { type: unknown }).type;
  if (type === 'MODULE_RESET') return true;
  if (type !== 'PRESS') return false;
  return typeof (action as { keyIndex?: unknown }).keyIndex === 'number';
}
