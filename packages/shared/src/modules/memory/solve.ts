import type { MemoryDigit, MemoryPress, MemoryStage } from './types.js';

/**
 * The GDD Memory stage tables (gdd.md #Module 5 — the authoritative source,
 * verified identical to the KTANE manual p.11), encoded ONCE as data.
 * solveMemory() evaluates them; getMemoryManualPages() renders the SAME constant
 * — solver and manual are structurally incapable of diverging (the wires /
 * simon-says lesson: one shared rule source ⇒ both sides provably agree).
 *
 * Each stage maps a DISPLAY digit (1–4) → an instruction resolving to the button
 * POSITION (1–4) to press:
 *   - position   → press this absolute position.
 *   - label      → press whichever button currently bears this label.
 *   - samePosition → press the same position pressed in that earlier stage.
 *   - sameLabel  → press the button whose current label equals the one pressed in
 *                  that earlier stage (its position may differ this stage).
 * All back-references point strictly backward, so history[stage-1] always exists
 * when the rule for the current stage is evaluated.
 */
export type MemoryInstruction =
  | { readonly kind: 'position'; readonly value: MemoryDigit }
  | { readonly kind: 'label'; readonly value: MemoryDigit }
  | { readonly kind: 'samePosition'; readonly stage: number }
  | { readonly kind: 'sameLabel'; readonly stage: number };

/** display digit → instruction, for one stage. */
export type MemoryStageRules = Readonly<Record<MemoryDigit, MemoryInstruction>>;

/**
 * Stage rules, index 0 = stage 1. Transcribed VERBATIM from the GDD table (do
 * not re-derive from memory).
 */
export const MEMORY_RULES: readonly MemoryStageRules[] = [
  // Stage 1 — remember position pressed.
  {
    1: { kind: 'position', value: 2 },
    2: { kind: 'position', value: 2 },
    3: { kind: 'position', value: 3 },
    4: { kind: 'position', value: 4 },
  },
  // Stage 2 — remember position pressed.
  {
    1: { kind: 'label', value: 4 },
    2: { kind: 'samePosition', stage: 1 },
    3: { kind: 'position', value: 1 },
    4: { kind: 'samePosition', stage: 1 },
  },
  // Stage 3 — remember label pressed.
  {
    1: { kind: 'sameLabel', stage: 2 },
    2: { kind: 'sameLabel', stage: 1 },
    3: { kind: 'position', value: 3 },
    4: { kind: 'label', value: 4 },
  },
  // Stage 4 — remember position pressed.
  {
    1: { kind: 'samePosition', stage: 1 },
    2: { kind: 'position', value: 1 },
    3: { kind: 'samePosition', stage: 2 },
    4: { kind: 'samePosition', stage: 2 },
  },
  // Stage 5 — final.
  {
    1: { kind: 'sameLabel', stage: 1 },
    2: { kind: 'sameLabel', stage: 2 },
    3: { kind: 'sameLabel', stage: 4 },
    4: { kind: 'sameLabel', stage: 3 },
  },
];

/** The position (1–4) whose button currently bears `label`. Total: labels is a permutation of 1..4. */
function positionOfLabel(stage: MemoryStage, label: MemoryDigit): MemoryDigit {
  return (stage.labels.indexOf(label) + 1) as MemoryDigit;
}

/**
 * Pure resolver: the correct button POSITION (1–4) to press this stage, given
 * the stage's display + layout, the 1-indexed stage number, and the recorded
 * history of prior correct presses. No randomness, no stored answer.
 */
export function solveMemory(
  stage: MemoryStage,
  stageNumber: number,
  history: ReadonlyArray<MemoryPress>,
): MemoryDigit {
  const instruction = MEMORY_RULES[stageNumber - 1][stage.display];
  switch (instruction.kind) {
    case 'position':
      return instruction.value;
    case 'label':
      return positionOfLabel(stage, instruction.value);
    case 'samePosition':
      return history[instruction.stage - 1].position;
    case 'sameLabel':
      return positionOfLabel(stage, history[instruction.stage - 1].label);
  }
}
