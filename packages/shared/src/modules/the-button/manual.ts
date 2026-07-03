import type { Locale, ManualPage } from '../../types/index.js';
import { BUTTON_MODULE_ID, STRIP_COLORS, BUTTON_COLOR_LABELS } from './types.js';
import { BUTTON_RULES, STRIP_RELEASE_DIGIT } from './solve.js';

/** Locale-keyed prose. Rule/strip row values (condition/action text, colour
 *  names, digits, letter labels) are locale-invariant. */
const TEXT = {
  en: {
    title: 'The Button',
    intro:
      'The module is a single coloured button with a printed label. ' +
      'Decide whether to PRESS-and-immediately-release or to HOLD by ' +
      'reading the rules below top to bottom and applying the first one ' +
      'that matches.',
    ruleHeaders: ['#', 'Condition', 'Action'],
    releaseHeading: 'Releasing a held button',
    releaseBody:
      'When you hold the button, a coloured strip lights up on its right ' +
      'side. Keep holding and release the button when the countdown shows ' +
      'the matching digit in ANY position.',
    releaseHeaders: ['Strip', 'Release when the timer shows'],
    releaseCell: (label: string, color: string, digit: number | string) =>
      [`${label} — ${color}`, `a ${digit} in any position`] as const,
    confirmHeading: 'Confirming colours',
    confirmBody:
      'The button and its release strip each carry a printed letter (R, ' +
      'W, B, Y) so colour is never the only signal. If a colour is in ' +
      'doubt, have the Defuser read the letter aloud.',
  },
  zh: {
    title: '按钮 (The Button)',
    intro:
      '模块是一个印有文字标签的彩色按钮。通过从上到下阅读下面的规则、套用第一条' +
      '匹配的规则，来决定是「按下并立即松开」还是「按住」。',
    ruleHeaders: ['#', '条件', '操作'],
    releaseHeading: '松开按住的按钮',
    releaseBody:
      '当你按住按钮时，其右侧会亮起一条彩色灯条。继续按住，当倒计时的任意一位' +
      '出现对应数字时松开按钮。',
    releaseHeaders: ['灯条', '当计时器出现以下数字时松开'],
    releaseCell: (label: string, color: string, digit: number | string) =>
      [`${label} — ${color}`, `任意一位出现 ${digit}`] as const,
    confirmHeading: '确认颜色',
    confirmBody:
      '按钮及其松开灯条上都印有一个字母（R、W、B、Y），因此颜色绝不是唯一的' +
      '判断依据。若某个颜色难以辨认，让拆弹手读出对应的字母。',
  },
} as const;

const capitalize = (word: string): string => word[0].toUpperCase() + word.slice(1);

/**
 * Structured manual content — NEVER raw HTML or untyped JSX (project rule).
 * Both tables render from the exact data the solver evaluates (BUTTON_RULES,
 * STRIP_RELEASE_DIGIT): the manual the Expert reads and the logic that judges
 * the interaction cannot diverge.
 */
export function getButtonManualPages(locale: Locale = 'en'): ManualPage[] {
  const t = TEXT[locale];
  return [
    {
      chapterId: BUTTON_MODULE_ID,
      chapterTitle: t.title,
      sections: [
        {
          content: t.intro,
          table: {
            headers: [...t.ruleHeaders],
            rows: BUTTON_RULES.map((rule, i) => [String(i + 1), rule.conditionText, rule.actionText]),
          },
        },
        {
          heading: t.releaseHeading,
          content: t.releaseBody,
          table: {
            headers: [...t.releaseHeaders],
            rows: STRIP_COLORS.map((color) => [
              ...t.releaseCell(BUTTON_COLOR_LABELS[color], capitalize(color), STRIP_RELEASE_DIGIT[color]),
            ]),
          },
        },
        {
          heading: t.confirmHeading,
          content: t.confirmBody,
        },
      ],
    },
  ];
}
