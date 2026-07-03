import type { Locale, ManualPage } from '../../types/index.js';
import { COMPLICATED_WIRES_MODULE_ID } from './types.js';
import { COMPLICATED_WIRES_TABLE } from './solve.js';

/** ✓ / — cell text so the truth table is unambiguous without colour (AC4). */
const mark = (present: boolean): string => (present ? '✓' : '—');

/** Locale-keyed prose. The truth-table rows (✓/— marks + code letters) and the
 *  cut-code LETTERS (C/D/S/P/B) are locale-invariant; only the descriptions
 *  translate. */
const TEXT = {
  en: {
    title: 'Complicated Wires',
    intro:
      'The module shows three to six wires, each carrying any combination of ' +
      'four attributes: a red stripe, a blue stripe, a white star, and a lit ' +
      'LED. Evaluate each wire INDEPENDENTLY: read its four attributes, look ' +
      'the combination up in the truth table below, and apply the resulting ' +
      'cut code. Cut every wire that should be cut; leave the rest. A severed ' +
      'wire cannot be un-cut.',
    codesHeading: 'Cut codes',
    codesBody:
      'Each row of the truth table gives one code. S, P and B depend on the ' +
      "bomb's edgework (serial number, ports, batteries), which the Defuser " +
      'reads off the bomb face.',
    codesHeaders: ['Code', 'Rule'],
    codeRules: [
      'Cut the wire',
      'Do not cut the wire',
      'Cut only if the last digit of the serial number is even',
      'Cut only if the bomb has a Parallel port',
      'Cut only if the bomb has two or more batteries',
    ],
    truthHeading: 'Truth table',
    truthBody:
      'Columns: red stripe, blue stripe, star, LED (✓ = present, — = absent) ' +
      '→ cut code.',
    truthHeaders: ['Red stripe', 'Blue stripe', 'Star', 'LED', 'Code'],
  },
  zh: {
    title: '复杂接线 (Complicated Wires)',
    intro:
      '模块上有三到六根导线，每根可带有四种属性的任意组合：红色条纹、蓝色条纹、' +
      '白色星标、以及点亮的 LED。逐根「独立」判断：读出它的四个属性，在下面的' +
      '真值表中查找该组合，套用得到的剪断代码。应剪断的全部剪断，其余保留。' +
      '剪断的导线无法复原。',
    codesHeading: '剪断代码',
    codesBody:
      '真值表每一行给出一个代码。S、P、B 取决于炸弹的边缘信息（序列号、端口、' +
      '电池），由拆弹手从弹体表面读取。',
    codesHeaders: ['代码', '规则'],
    codeRules: [
      '剪断该导线',
      '不要剪断该导线',
      '仅当序列号最后一位为偶数时剪断',
      '仅当炸弹有并行端口(Parallel)时剪断',
      '仅当炸弹有两个或以上电池时剪断',
    ],
    truthHeading: '真值表',
    truthBody:
      '各列依次为：红色条纹、蓝色条纹、星标、LED（✓ = 有，— = 无）→ 剪断代码。',
    truthHeaders: ['红条纹', '蓝条纹', '星标', 'LED', '代码'],
  },
} as const;

/** The five cut-code LETTERS — locale-invariant, referenced by the truth table. */
const CODE_LETTERS = ['C', 'D', 'S', 'P', 'B'] as const;

/**
 * Structured manual content — NEVER raw HTML or untyped JSX (project rule).
 * The 16-row truth table renders from COMPLICATED_WIRES_TABLE, the exact
 * constant the solver reads: the Expert's manual and the solver that judges
 * the cut cannot diverge.
 *
 * Chosen representation: the structured 16-row truth table is the PRIMARY,
 * authoritative, colorblind-safe manual (the GDD paper manual draws this as a
 * Venn diagram, p.13 of the v1 PDF — an optional visual enhancement only).
 */
export function getComplicatedWiresManualPages(locale: Locale = 'en'): ManualPage[] {
  const t = TEXT[locale];
  return [
    {
      chapterId: COMPLICATED_WIRES_MODULE_ID,
      chapterTitle: t.title,
      sections: [
        {
          content: t.intro,
        },
        {
          heading: t.codesHeading,
          content: t.codesBody,
          table: {
            headers: [...t.codesHeaders],
            rows: CODE_LETTERS.map((letter, i) => [letter, t.codeRules[i]!]),
          },
        },
        {
          heading: t.truthHeading,
          content: t.truthBody,
          table: {
            // A ✓/— truth table: render as an even grid (Story TD-9
            // `evenColumns`) — full width, equal columns, centred cells — so the
            // matrix fills the sheet in a regular lattice instead of the auto
            // layout bunching every column against the left.
            evenColumns: true,
            headers: [...t.truthHeaders],
            rows: COMPLICATED_WIRES_TABLE.map((row) => [
              mark(row.redStripe),
              mark(row.blueStripe),
              mark(row.star),
              mark(row.led),
              row.code,
            ]),
          },
        },
      ],
    },
  ];
}
