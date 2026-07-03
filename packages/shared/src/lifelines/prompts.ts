/**
 * The fixed pre-defined lifeline prompt list (Story 9.3).
 *
 * This is the SINGLE SOURCE OF TRUTH for the hint copy, consumed by BOTH sides:
 *   - the SERVER validates an incoming `LIFELINE_SEND { promptId }` against
 *     {@link LIFELINE_PROMPT_IDS} (fail-closed — an unknown id is rejected, never
 *     defaulted to a hint), and
 *   - the CLIENT renders the picker (Story 9.3 `LifelinePanel`) and resolves the
 *     toast text (`LifelineToast`) from `id → text`.
 *
 * The WIRE never carries hint text — only the `promptId` travels (see
 * `LifelineSendPayload` / `LifelineToastPayload`). That is the structural
 * guarantee against free-text coaching: a malicious client cannot inject
 * arbitrary text because the server only ever echoes an id it recognises.
 *
 * Content = the GDD's 5 generic, module-agnostic prompts (Story 9.3 Design
 * Decision 2). Static text, no `[placeholder]` interpolation for V1. Trivially
 * expandable up to the ≤8 cap later — add an entry with a fresh kebab-case id and
 * both sides pick it up. `packages/shared` stays framework-free: this is plain data.
 */

/** One selectable lifeline hint. `id` is the wire token; `text` is display-only. */
export interface LifelinePrompt {
  /** Stable kebab-case wire id. NEVER change an existing id — the wire carries it. */
  id: string;
  /** Static display text, resolved client-side for the picker and the toast. */
  text: string;
}

/**
 * The fixed, ordered prompt list. ≤8 entries (currently 5 — the GDD set).
 * `readonly` so no consumer can mutate the shared source of truth at runtime.
 */
export const LIFELINE_PROMPTS = [
  { id: 're-read-section', text: "Re-read the current module's section" },
  { id: 'check-serial', text: 'Check the serial number' },
  { id: 'missed-condition', text: 'You missed a condition' },
  { id: 'on-track', text: "You're on the right track" },
  { id: 'wrong-approach', text: 'Wrong approach' },
] as const satisfies readonly LifelinePrompt[];

/**
 * The literal union of every valid prompt id. Client call sites (the picker,
 * `sendLifeline`) type against this so a typo'd id fails at COMPILE time instead
 * of as a silent server rejection. The wire payload stays `string` — incoming
 * ids are untrusted and validated at runtime via {@link isLifelinePromptId}.
 */
export type LifelinePromptId = (typeof LIFELINE_PROMPTS)[number]['id'];

/**
 * O(1) fail-closed validation set of every valid `promptId`. The server checks
 * membership before any deduction/toast; an id not in this set is rejected.
 */
export const LIFELINE_PROMPT_IDS: ReadonlySet<string> = new Set(
  LIFELINE_PROMPTS.map((p) => p.id),
);

/** Fail-closed guard: `true` only for an id in the fixed list, `false` otherwise. */
export function isLifelinePromptId(id: string): boolean {
  return LIFELINE_PROMPT_IDS.has(id);
}

/**
 * Resolve a `promptId` to its display text, or `undefined` if unknown. The
 * client uses this to render the picker and the toast; an unknown id resolves to
 * `undefined` (fail-closed — the server would have rejected it before any toast).
 */
export function lifelinePromptText(id: string): string | undefined {
  return LIFELINE_PROMPTS.find((p) => p.id === id)?.text;
}
