import type { ManualPage, ManualSection } from '../../types/index.js';
import { MEMORY_MODULE_ID, MEMORY_DIGITS, type MemoryDigit } from './types.js';
import { MEMORY_RULES, type MemoryInstruction, type MemoryStageRules } from './solve.js';

/** Human text for one instruction — the Expert reads this to the Defuser. */
function describeInstruction(instruction: MemoryInstruction): string {
  switch (instruction.kind) {
    case 'position':
      return `Press the button in position ${instruction.value}`;
    case 'label':
      return `Press the button labeled "${instruction.value}"`;
    case 'samePosition':
      return `Press the same position as stage ${instruction.stage}`;
    case 'sameLabel':
      return `Press the same label as stage ${instruction.stage}`;
  }
}

/**
 * A "remember" reminder per stage (GDD Module 5) — which of the two facts the
 * Defuser must carry forward. Stage 5 is final, so nothing to remember.
 */
const REMEMBER: Readonly<Record<number, string>> = {
  1: 'Remember the position you pressed.',
  2: 'Remember the position you pressed.',
  3: 'Remember the label on the button you pressed.',
  4: 'Remember the position you pressed.',
};

/** One stage's Display → Action table, rendered from the rule data. */
function stageSection(stageNumber: number, rules: MemoryStageRules): ManualSection {
  const remember = REMEMBER[stageNumber];
  return {
    heading: `Stage ${stageNumber}`,
    content: remember ?? '',
    table: {
      headers: ['Display', 'Action'],
      rows: MEMORY_DIGITS.map((display: MemoryDigit) => [
        String(display),
        describeInstruction(rules[display]),
      ]),
    },
  };
}

/**
 * Structured manual content — NEVER raw HTML or untyped JSX (project rule). All
 * five stage tables render from MEMORY_RULES, the exact constant solveMemory()
 * reads: the Expert's manual and the solver that judges the press cannot diverge.
 */
export function getMemoryManualPages(): ManualPage[] {
  return [
    {
      chapterId: MEMORY_MODULE_ID,
      chapterTitle: 'Memory',
      sections: [
        {
          content:
            'The module has five stages. Each stage shows a large display number ' +
            'and four buttons, each labelled 1–4. Button positions are numbered ' +
            'left to right (position 1 is leftmost). Press the correct button to ' +
            'advance to the next stage; complete all five stages to disarm.',
        },
        {
          content:
            'Pressing an incorrect button records a strike AND resets the module ' +
            'all the way back to stage 1 — you must repeat the whole sequence. So ' +
            'track BOTH the position you press and the label on that button: later ' +
            'stages refer back to earlier presses by position or by label.',
        },
        ...MEMORY_RULES.map((rules, i) => stageSection(i + 1, rules)),
      ],
    },
  ];
}
