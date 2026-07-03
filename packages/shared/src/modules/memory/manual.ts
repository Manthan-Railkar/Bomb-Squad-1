import type { Locale, ManualPage, ManualSection } from '../../types/index.js';
import { MEMORY_MODULE_ID, MEMORY_DIGITS, type MemoryDigit } from './types.js';
import { MEMORY_RULES, type MemoryInstruction, type MemoryStageRules } from './solve.js';

/** Locale-keyed prose. The Display digits (row values) are locale-invariant; the
 *  action sentences translate but keep their literal position/label tokens. */
const TEXT = {
  en: {
    title: 'Memory',
    intro:
      'The module has five stages. Each stage shows a large display number ' +
      'and four buttons, each labelled 1–4. Button positions are numbered ' +
      'left to right (position 1 is leftmost). Press the correct button to ' +
      'advance to the next stage; complete all five stages to disarm.',
    intro2:
      'Pressing an incorrect button records a strike AND resets the module ' +
      'all the way back to stage 1 — you must repeat the whole sequence. So ' +
      'track BOTH the position you press and the label on that button: later ' +
      'stages refer back to earlier presses by position or by label.',
    stage: (n: number) => `Stage ${n}`,
    displayHeaders: ['Display', 'Action'],
    remember: {
      1: 'Remember the position you pressed.',
      2: 'Remember the position you pressed.',
      3: 'Remember the label on the button you pressed.',
      4: 'Remember the position you pressed.',
    } as Readonly<Record<number, string>>,
    instruction: (i: MemoryInstruction): string => {
      switch (i.kind) {
        case 'position':
          return `Press the button in position ${i.value}`;
        case 'label':
          return `Press the button labeled "${i.value}"`;
        case 'samePosition':
          return `Press the same position as stage ${i.stage}`;
        case 'sameLabel':
          return `Press the same label as stage ${i.stage}`;
      }
    },
  },
  zh: {
    title: '记忆 (Memory)',
    intro:
      '模块有五个阶段。每个阶段会显示一个大的显示数字和四个按钮，按钮上分别标着' +
      '1–4。按钮「位置」从左到右编号（位置 1 在最左）。按下正确的按钮进入下一' +
      '阶段；完成全部五个阶段即可拆除。',
    intro2:
      '按错按钮会记一次失误(strike)，并且把模块「一路重置回第 1 阶段」——你必须' +
      '重做整个序列。因此要同时记住你按下的「位置」和该按钮上的「标签」：后面的' +
      '阶段会按位置或按标签回溯到前面的按压。',
    stage: (n: number) => `第 ${n} 阶段`,
    displayHeaders: ['显示', '操作'],
    remember: {
      1: '记住你按下的位置。',
      2: '记住你按下的位置。',
      3: '记住你按下的那个按钮上的标签。',
      4: '记住你按下的位置。',
    } as Readonly<Record<number, string>>,
    instruction: (i: MemoryInstruction): string => {
      switch (i.kind) {
        case 'position':
          return `按下位置 ${i.value} 的按钮`;
        case 'label':
          return `按下标签为 “${i.value}” 的按钮`;
        case 'samePosition':
          return `按下与第 ${i.stage} 阶段相同的位置`;
        case 'sameLabel':
          return `按下与第 ${i.stage} 阶段相同的标签`;
      }
    },
  },
} as const;

/**
 * Structured manual content — NEVER raw HTML or untyped JSX (project rule). All
 * five stage tables render from MEMORY_RULES, the exact constant solveMemory()
 * reads: the Expert's manual and the solver that judges the press cannot diverge.
 */
export function getMemoryManualPages(locale: Locale = 'en'): ManualPage[] {
  const t = TEXT[locale];

  /** One stage's Display → Action table, rendered from the rule data. */
  const stageSection = (stageNumber: number, rules: MemoryStageRules): ManualSection => ({
    heading: t.stage(stageNumber),
    content: t.remember[stageNumber] ?? '',
    table: {
      headers: [...t.displayHeaders],
      rows: MEMORY_DIGITS.map((display: MemoryDigit) => [String(display), t.instruction(rules[display])]),
    },
  });

  return [
    {
      chapterId: MEMORY_MODULE_ID,
      chapterTitle: t.title,
      sections: [
        { content: t.intro },
        { content: t.intro2 },
        ...MEMORY_RULES.map((rules, i) => stageSection(i + 1, rules)),
      ],
    },
  ];
}
