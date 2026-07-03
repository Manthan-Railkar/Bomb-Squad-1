import type { Locale, ManualPage, ManualSection } from '../../types/index.js';
import { WIRES_MODULE_ID, WIRE_COLORS, WIRE_COLOR_LABELS } from './types.js';
import { WIRES_RULES } from './solve.js';

/** Locale-keyed prose. Rule-table row values (condition/action text, colour
 *  names, letter labels) are locale-invariant — the Defuser reads them off the
 *  English bomb. */
const TEXT = {
  en: {
    title: 'Wires',
    countHeadings: { 3: 'Three wires', 4: 'Four wires', 5: 'Five wires', 6: 'Six wires' },
    ruleHeaders: ['#', 'Condition', 'Action'],
    intro:
      'The module shows three to six coloured wires. Cut exactly one wire to ' +
      'disarm it. Count the wires first, then apply the matching table below — ' +
      'the rules differ for every wire count. Apply the first rule that ' +
      'matches, reading top to bottom. Wire positions are counted from the ' +
      'top, starting at 1. A severed wire cannot be un-cut.',
    confirmHeading: 'Confirming colours',
    confirmBody:
      'Every wire carries a printed letter label beside it, so colour is ' +
      'never the only signal. If a colour is in doubt, have the Defuser ' +
      'read the letter aloud.',
    confirmHeaders: ['Label', 'Colour'],
  },
  zh: {
    title: '接线 (Wires)',
    countHeadings: { 3: '三根线', 4: '四根线', 5: '五根线', 6: '六根线' },
    ruleHeaders: ['#', '条件', '操作'],
    intro:
      '模块上有三到六根彩色导线。剪断且仅剪断一根即可拆除。先数清导线数量，' +
      '再套用下面对应数量的表格——不同导线数量的规则不同。从上到下阅读，套用' +
      '第一条匹配的规则。导线位置从最上方开始编号，第一根为 1。剪断的导线无法' +
      '复原。',
    confirmHeading: '确认颜色',
    confirmBody:
      '每根导线旁都印有一个字母标签，因此颜色绝不是唯一的判断依据。若某个' +
      '颜色难以辨认，让拆弹手读出对应的字母。',
    confirmHeaders: ['字母', '颜色'],
  },
} as const;

const capitalize = (word: string): string => word[0].toUpperCase() + word.slice(1);

/**
 * Structured manual content — NEVER raw HTML or untyped JSX (project rule).
 * The rule tables are rendered from WIRES_RULES, the exact data solveWires()
 * evaluates: the manual the Expert reads and the solver that judges the cut
 * cannot diverge.
 */
export function getWiresManualPages(locale: Locale = 'en'): ManualPage[] {
  const t = TEXT[locale];
  const ruleSections: ManualSection[] = ([3, 4, 5, 6] as const).map((count) => ({
    heading: t.countHeadings[count],
    content: '',
    table: {
      headers: [...t.ruleHeaders],
      rows: WIRES_RULES[count].map((rule, i) => [String(i + 1), rule.conditionText, rule.actionText]),
    },
  }));

  return [
    {
      chapterId: WIRES_MODULE_ID,
      chapterTitle: t.title,
      sections: [
        {
          content: t.intro,
        },
        ...ruleSections,
        {
          heading: t.confirmHeading,
          content: t.confirmBody,
          table: {
            headers: [...t.confirmHeaders],
            rows: WIRE_COLORS.map((color) => [WIRE_COLOR_LABELS[color], capitalize(color)]),
          },
        },
      ],
    },
  ];
}
