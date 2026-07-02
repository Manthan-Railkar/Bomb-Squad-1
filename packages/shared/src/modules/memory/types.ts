/**
 * memory — a Hard-tier module (Story 7.3, GDD Module 5).
 *
 * Five sequential stages. Each stage shows a display digit (1–4) above four
 * buttons labelled 1–4, arranged left→right (positions 1–4). The correct button
 * per stage is resolved by the stage's rule table (solve.ts), which may name an
 * absolute POSITION, an absolute LABEL, or a back-reference to the position/label
 * pressed in an EARLIER stage. A correct press advances a stage; the correct
 * press on stage 5 disarms. A WRONG press resets the whole module to stage 1
 * (clearing the press history) AND records a strike — it is not a per-stage
 * retry (project-context gotcha line 217).
 *
 * Pure logic lives HERE in packages/shared so both the server registry
 * (MODULE_REDUCERS, runtime via tsx) and the client sandbox run the SAME code;
 * apps/client/src/modules/memory/ re-exports it.
 *
 * NO LIVE BOMB STATE (contrast Simon Says): the correct button is a pure
 * function of this module's own state (stages + stage + history) and the press.
 * There is no serial-vowel or strike-count input, so MemoryState carries no
 * BombContext and MODULE_INTERACT needs no per-module enrichment.
 */

/** A display value and a button label are both drawn from 1..4. */
export type MemoryDigit = 1 | 2 | 3 | 4;

/** Module identifier — kebab-case (project naming convention). */
export const MEMORY_MODULE_ID = 'memory';

/** The four digits used for both displays and button labels. */
export const MEMORY_DIGITS = [1, 2, 3, 4] as const;

/**
 * The module disarms once stage MEMORY_STAGE_COUNT is completed correctly. The
 * stages are generated to this fixed length; `stage` walks 1..count.
 */
export const MEMORY_STAGE_COUNT = 5;

/**
 * One stage instance: the digit shown on the display and the button layout — a
 * length-4 permutation of [1,2,3,4] where `labels[i]` is the digit printed on
 * the button at position `i + 1` (positions are 1-indexed in the manual). Fixed
 * at generate-time (see generate.ts) and physical: a reset REPLAYS the same
 * stages from stage 1.
 */
export interface MemoryStage {
  readonly display: MemoryDigit;
  readonly labels: ReadonlyArray<MemoryDigit>;
}

/**
 * One recorded correct press. Later stages back-reference BOTH the position that
 * was pressed and the label that was on that button, so both are stored.
 */
export interface MemoryPress {
  readonly position: MemoryDigit;
  readonly label: MemoryDigit;
}

export interface MemoryState {
  /** The five fixed stages (display + layout). Never mutated after generate. */
  readonly stages: ReadonlyArray<MemoryStage>;
  /** Current stage, 1..MEMORY_STAGE_COUNT. */
  readonly stage: number;
  /**
   * Recorded correct presses so far (length `stage - 1`). The reducer resolves
   * cross-stage references against this — it is NOT the answer (the correct
   * button is recomputed from the rule table + history at press-time). The
   * DefuserView deliberately does not render it; remembering it is the module's
   * challenge.
   */
  readonly history: ReadonlyArray<MemoryPress>;
}

/** Defuser action — pressing a button = single click. `position` is 1..4 (left→right). */
export type MemoryAction = { type: 'PRESS'; position: number };

/** Lifecycle action forwarded whole by the bomb reducer (see types/actions.ts). */
export type MemoryReset = { type: 'MODULE_RESET' };

/** Runtime guard: actions reach reducers as `unknown` (untrusted input). */
export function isMemoryAction(action: unknown): action is MemoryAction | MemoryReset {
  if (typeof action !== 'object' || action === null || !('type' in action)) return false;
  const type = (action as { type: unknown }).type;
  if (type === 'MODULE_RESET') return true;
  if (type !== 'PRESS') return false;
  // Bounds/integer checks live in the reducer; the guard only shapes the action.
  return typeof (action as { position?: unknown }).position === 'number';
}
