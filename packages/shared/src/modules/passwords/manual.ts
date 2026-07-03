import type { Locale, ManualPage } from '../../types/index.js';
import { PASSWORDS_MODULE_ID, PASSWORD_WORDS } from './types.js';

/** Words per row when laying the 35-word list into a table. */
const WORDS_PER_ROW = 5;

/** Locale-keyed prose. The word list (row values) is locale-invariant. */
const TEXT = {
  en: {
    title: 'Passwords',
    intro:
      'The module is five letter columns. Cycle each column up or down ' +
      'until the five visible letters spell one of the valid words below, ' +
      'then press SUBMIT. A wrong word records a strike; the columns keep ' +
      'their letters so you can keep trying.',
    header: 'Valid words',
  },
  zh: {
    title: '密码 (Passwords)',
    intro:
      '模块由五个字母列组成。上下滚动每一列，直到可见的五个字母拼出下面某个' +
      '有效单词，然后按下 SUBMIT。拼错会记一次失误(strike)，但各列会保留当前' +
      '字母，可以继续尝试。',
    header: '有效单词',
  },
} as const;

/**
 * Structured manual content — NEVER raw HTML or untyped JSX (project rule). The
 * word table renders from the exact PASSWORD_WORDS constant the solver checks
 * against, so the manual the Expert reads and the logic that judges SUBMIT
 * cannot diverge.
 */
export function getPasswordsManualPages(locale: Locale = 'en'): ManualPage[] {
  const t = TEXT[locale];
  // 35 words / 5 per row → 7 full rows, each a word per cell. Flattening the
  // rows reproduces PASSWORD_WORDS exactly (asserted in the suite).
  const rows: string[][] = [];
  for (let i = 0; i < PASSWORD_WORDS.length; i += WORDS_PER_ROW) {
    rows.push([...PASSWORD_WORDS.slice(i, i + WORDS_PER_ROW)]);
  }

  return [
    {
      chapterId: PASSWORDS_MODULE_ID,
      chapterTitle: t.title,
      sections: [
        {
          content: t.intro,
          table: {
            headers: [t.header, '', '', '', ''],
            rows,
          },
        },
      ],
    },
  ];
}
