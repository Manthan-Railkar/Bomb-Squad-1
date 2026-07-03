import type { Locale, ManualPage, ManualSection } from '../../types/index.js';
import { SIMON_SAYS_MODULE_ID, SIMON_COLORS, SIMON_COLOR_LABELS, type SimonColor } from './types.js';
import { SIMON_TABLES, type SimonRow, type SimonStrikeRow } from './solve.js';

/** Locale-keyed prose. Translation-table row values (colour names) and letter
 *  labels are locale-invariant. */
const TEXT = {
  en: {
    title: 'Simon Says',
    intro:
      'The module flashes a growing sequence of coloured buttons. Translate ' +
      'each flash to the colour you must press using the correct table below, ' +
      'then press them in order. Enter the whole sequence correctly and it ' +
      'grows by one flash; complete the final flash to disarm. A wrong press ' +
      'is a strike and the sequence replays from the start.',
    chooseBody:
      'Choose the table by the serial number: use Table A if the serial ' +
      'CONTAINS a vowel (A, E, I, O, U), otherwise Table B. Within that table, ' +
      'read the row for the current number of strikes on the bomb (0, 1 or 2) ' +
      '— the mapping changes as you accumulate strikes.',
    tableAHeading: 'Table A — serial contains a vowel',
    tableBHeading: 'Table B — serial has no vowel',
    strikeHeadings: { 0: 'No strikes', 1: '1 strike', 2: '2 strikes' },
    rowHeaders: ['Flashed', 'Press'],
    tableALabel: 'Table A',
    tableBLabel: 'Table B',
    confirmHeading: 'Confirming colours',
    confirmBody:
      'Every button carries a printed letter label, so colour is never the ' +
      'only signal. If a colour is in doubt, have the Defuser read the letter ' +
      'aloud.',
    confirmHeaders: ['Label', 'Colour'],
  },
  zh: {
    title: '西蒙说 (Simon Says)',
    intro:
      '模块会闪烁一段不断变长的彩色按钮序列。用下面正确的表格把每一次闪烁' +
      '「翻译」成你应当按下的颜色，然后按顺序依次按下。整段序列输入正确后它会' +
      '增加一次闪烁；完成最后一次闪烁即可拆除。按错会记一次失误(strike)，' +
      '序列从头重放。',
    chooseBody:
      '根据序列号选择表格：若序列号「含有」元音字母（A、E、I、O、U）用表 A，' +
      '否则用表 B。在该表内，读取对应当前炸弹失误次数（0、1 或 2）的那一行' +
      '——映射会随着失误累积而改变。',
    tableAHeading: '表 A — 序列号含元音',
    tableBHeading: '表 B — 序列号不含元音',
    strikeHeadings: { 0: '0 次失误', 1: '1 次失误', 2: '2 次失误' },
    rowHeaders: ['闪烁', '按下'],
    tableALabel: '表 A',
    tableBLabel: '表 B',
    confirmHeading: '确认颜色',
    confirmBody:
      '每个按钮都印有一个字母标签，因此颜色绝不是唯一的判断依据。若某个颜色' +
      '难以辨认，让拆弹手读出对应的字母。',
    confirmHeaders: ['字母', '颜色'],
  },
} as const;

const capitalize = (word: string): string => word[0].toUpperCase() + word.slice(1);

/**
 * Structured manual content — NEVER raw HTML or untyped JSX (project rule). Both
 * translation tables render from SIMON_TABLES, the exact constant simonTranslate()
 * reads: the Expert's manual and the solver that judges the press cannot diverge.
 */
export function getSimonSaysManualPages(locale: Locale = 'en'): ManualPage[] {
  const t = TEXT[locale];
  const strikeRows: SimonStrikeRow[] = [0, 1, 2];

  /** One "flashed → press" table for a given strike row, columns in SIMON_COLORS order. */
  const rowSection = (heading: string, row: SimonRow): ManualSection => ({
    heading,
    content: '',
    table: {
      headers: [...t.rowHeaders],
      rows: SIMON_COLORS.map((flash: SimonColor) => [capitalize(flash), capitalize(row[flash])]),
    },
  });

  return [
    {
      chapterId: SIMON_SAYS_MODULE_ID,
      chapterTitle: t.title,
      sections: [
        {
          content: t.intro,
        },
        {
          content: t.chooseBody,
        },
        {
          heading: t.tableAHeading,
          content: '',
        },
        ...strikeRows.map((s) => rowSection(`${t.tableALabel} · ${t.strikeHeadings[s]}`, SIMON_TABLES.A[s])),
        {
          heading: t.tableBHeading,
          content: '',
        },
        ...strikeRows.map((s) => rowSection(`${t.tableBLabel} · ${t.strikeHeadings[s]}`, SIMON_TABLES.B[s])),
        {
          heading: t.confirmHeading,
          content: t.confirmBody,
          table: {
            headers: [...t.confirmHeaders],
            rows: SIMON_COLORS.map((color) => [SIMON_COLOR_LABELS[color], capitalize(color)]),
          },
        },
      ],
    },
  ];
}
