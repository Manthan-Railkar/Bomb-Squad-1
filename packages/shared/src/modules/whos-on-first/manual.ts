import type { Locale, ManualPage } from '../../types/index.js';
import { WHOS_ON_FIRST_MODULE_ID, DISPLAY_POSITIONS, DISPLAY_WORDS, LABEL_PRIORITIES, WOF_BUTTON_LABELS, POSITION_NAMES } from './types.js';

/** Locale-keyed prose. Row values — display words, button labels, priority-list
 *  words, position names — are the literal English tokens the Defuser reads off
 *  the bomb, so they stay identical across locales. */
const TEXT = {
  en: {
    title: "Who's on First",
    blank: '(blank)',
    step1Heading: 'Step 1 — read the display',
    step1Body:
      'Find the word shown on the display in the table below; it tells you ' +
      'which button position to READ. Note the label printed on that button ' +
      'and go to Step 2.',
    step1Headers: ['Display', 'Button to read'],
    step2Heading: 'Step 2 — press a button',
    step2Body:
      'Using the label you just read, find its row below and press the FIRST ' +
      'word in the list that appears on any of the six buttons. A wrong press ' +
      'records a strike; the puzzle is unchanged, so you can try again.',
    step2Headers: ['Label', 'Press the first of these that appears'],
  },
  zh: {
    title: "谁在前 (Who's on First)",
    blank: '(空白)',
    step1Heading: '第 1 步 — 读取显示屏',
    step1Body:
      '在下表中找到显示屏上显示的单词；它会告诉你要「读取」哪个按钮位置。' +
      '记下该按钮上印着的标签词，然后进入第 2 步。（位置名称保留英文，与弹体一致。）',
    step1Headers: ['显示', '要读取的按钮'],
    step2Heading: '第 2 步 — 按下一个按钮',
    step2Body:
      '根据刚才读到的标签词，在下表中找到对应的行，按下列表中第一个出现在' +
      '六个按钮任意之一上的单词。按错会记一次失误(strike)，但谜题保持不变，' +
      '可以再试。',
    step2Headers: ['标签', '按下下列中最先出现的一个'],
  },
} as const;

/**
 * Structured manual content — NEVER raw HTML or untyped JSX (project rule). Both
 * tables render from the exact DISPLAY_POSITIONS / LABEL_PRIORITIES constants the
 * solver reads, so the manual the Expert reads and the logic that judges a press
 * cannot diverge (the manual test reconstructs both tables from the render).
 *
 * Step 1: display word → the button position to READ.
 * Step 2: the read label → the priority list (press the first list word present).
 */
export function getWhosOnFirstManualPages(locale: Locale = 'en'): ManualPage[] {
  const t = TEXT[locale];
  // These are reference lookup tables, not action/answer tables: both columns
  // are read left-to-right, so each table opts its last column out of the
  // viewer's right-align rule (`rightAlignLastColumn: false`, Story TD-9) — the
  // real columns stay left-aligned under their headers with no faked spacer.
  // Both tables also opt OUT of colour-word emphasis (`emphasizeColorWords:
  // false`): in the spelling-discrimination cluster (RED vs READ/REED/LEED) the
  // colourblind floor forbids colour as a cue, so tinting only RED is a false
  // signal — the WORD is the signal, not its ink.

  // Step 1 — one row per display word: [display, position name]. The blank
  // display renders as '(blank)'.
  const step1Rows: string[][] = DISPLAY_WORDS.map((word) => [
    word === '' ? t.blank : word,
    POSITION_NAMES[DISPLAY_POSITIONS[word]],
  ]);

  // Step 2 — one row per button label: [label, comma-joined priority list].
  const step2Rows: string[][] = WOF_BUTTON_LABELS.map((label) => [label, LABEL_PRIORITIES[label].join(', ')]);

  return [
    {
      chapterId: WHOS_ON_FIRST_MODULE_ID,
      chapterTitle: t.title,
      sections: [
        {
          heading: t.step1Heading,
          content: t.step1Body,
          table: {
            headers: [...t.step1Headers],
            rows: step1Rows,
            rightAlignLastColumn: false,
            emphasizeColorWords: false,
          },
        },
        {
          heading: t.step2Heading,
          content: t.step2Body,
          table: {
            headers: [...t.step2Headers],
            rows: step2Rows,
            rightAlignLastColumn: false,
            emphasizeColorWords: false,
          },
        },
      ],
    },
  ];
}
