import type { Locale, ManualPage, ManualSection } from '../../types/index.js';
import {
  CUT_RULES,
  WIRE_SEQUENCES_MODULE_ID,
  WIRE_SEQ_COLORS,
  WIRE_SEQ_COLOR_LABELS,
  type WireSeqColor,
} from './types.js';

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

/** Locale-keyed prose. Answer cells (connection letters), ordinals, colour names
 *  and labels are locale-invariant literal tokens. */
const TEXT = {
  en: {
    title: 'Wire Sequences',
    colorHeadings: {
      red: 'Red wire occurrences',
      blue: 'Blue wire occurrences',
      black: 'Black wire occurrences',
    },
    ruleHeaders: ['Occurrence', 'Cut if connected to'],
    intro:
      'Several panels of wires, only one visible at a time. Switch panels ' +
      'with the up (previous) and down (next) buttons. Wire occurrences are ' +
      'CUMULATIVE across ALL panels: for each wire, count how many wires of ' +
      'its colour have appeared so far in reading order (top to bottom, panel ' +
      'by panel — this wire included), then cut it only if its connection ' +
      'letter is listed for that colour and occurrence below. A severed wire ' +
      'cannot be un-cut.',
    confirmHeading: 'Confirming colours',
    confirmBody:
      'Every wire carries a printed colour label, so colour is never the ' +
      'only signal. The labels are distinct from the A/B/C connection ' +
      'letters — if a colour is in doubt, read its label aloud.',
    confirmHeaders: ['Colour', 'Label'],
    or: (a: string, b: string) => `${a} or ${b}`,
    orList: (init: string[], last: string) => `${init.join(', ')} or ${last}`,
  },
  zh: {
    title: '线序 (Wire Sequences)',
    colorHeadings: {
      red: '红线出现次数',
      blue: '蓝线出现次数',
      black: '黑线出现次数',
    },
    ruleHeaders: ['第几次出现', '当连接到以下端子时剪断'],
    intro:
      '模块有多块线板，每次只显示一块。用向上（上一块）和向下（下一块）按钮' +
      '切换线板。导线的「出现次数」在所有线板间是累计的：对每根导线，按阅读' +
      '顺序（从上到下、逐块线板，包含当前这根）数出到目前为止该颜色已出现过' +
      '多少根，然后仅当它的连接端子字母列在下表对应颜色与出现次数的行中时才' +
      '剪断。剪断的导线无法复原。',
    confirmHeading: '确认颜色',
    confirmBody:
      '每根导线都印有颜色标签，因此颜色绝不是唯一的判断依据。这些标签与 A/B/C' +
      '连接端子字母不同——若某个颜色难以辨认，读出它的标签。',
    confirmHeaders: ['颜色', '标签'],
    or: (a: string, b: string) => `${a} 或 ${b}`,
    orList: (init: string[], last: string) => `${init.join('、')} 或 ${last}`,
  },
} as const;

const capitalize = (word: string): string => word[0].toUpperCase() + word.slice(1);

/**
 * Structured manual content — NEVER raw HTML or untyped JSX (project rule). The
 * three colour tables render from the exact CUT_RULES constant the reducer
 * reads, so the manual the Expert reads and the logic that judges a cut cannot
 * diverge (the manual test asserts the tables reconstruct CUT_RULES exactly).
 *
 * The shared PageRenderer right-aligns the LAST cell of every row (its
 * action/answer column). "Cut if connected to" is naturally that last cell here,
 * so — unlike keypads' symmetric grid — no trailing spacer column is needed.
 */
export function getWireSequencesManualPages(locale: Locale = 'en'): ManualPage[] {
  const t = TEXT[locale];

  /** "A", "A or C", "A, B or C" — the manual's natural-language answer cell. */
  const formatLetters = (letters: ReadonlyArray<string>): string => {
    if (letters.length <= 1) return letters[0] ?? '';
    if (letters.length === 2) return t.or(letters[0], letters[1]);
    return t.orList(letters.slice(0, -1), letters[letters.length - 1]!);
  };

  const colorSections: ManualSection[] = WIRE_SEQ_COLORS.map((color: WireSeqColor) => ({
    heading: t.colorHeadings[color],
    content: '',
    table: {
      headers: [...t.ruleHeaders],
      rows: CUT_RULES[color].map((letters, i) => [ORDINALS[i], formatLetters(letters)]),
    },
  }));

  return [
    {
      chapterId: WIRE_SEQUENCES_MODULE_ID,
      chapterTitle: t.title,
      sections: [
        {
          content: t.intro,
        },
        ...colorSections,
        {
          heading: t.confirmHeading,
          content: t.confirmBody,
          table: {
            headers: [...t.confirmHeaders],
            rows: WIRE_SEQ_COLORS.map((color) => [capitalize(color), WIRE_SEQ_COLOR_LABELS[color]]),
          },
        },
      ],
    },
  ];
}
