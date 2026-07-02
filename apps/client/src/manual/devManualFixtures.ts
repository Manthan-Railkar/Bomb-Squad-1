import type { ManualPage } from '@bomb-squad/shared';
import {
  getWiresManualPages,
  getButtonManualPages,
  getPasswordsManualPages,
  getKeypadsManualPages,
  getWhosOnFirstManualPages,
  getWireSequencesManualPages,
  getMazesManualPages,
  getComplicatedWiresManualPages,
  getSimonSaysManualPages,
  getMemoryManualPages,
  getMorseCodeManualPages,
} from '@bomb-squad/shared';

/**
 * DEV FIXTURES for `/dev/manual` ONLY — not game content.
 *
 * Canonical manual content ships per-module via `IModule.getManualPages()`
 * starting with Wires in Story 5.3. These fixtures exist so the viewer can be
 * built/verified before any real module lands: the 11 chapter titles from the
 * mockup, a multi-page chapter (grouping), and a long chapter (scroll memory).
 * Wires (5.3), The Button (5.4) and Passwords (5.5) are the exceptions: their
 * chapters are the CANONICAL module content from getWiresManualPages() /
 * getButtonManualPages() / getPasswordsManualPages(), not fixtures. Remaining
 * stubs are replaced as each module story lands.
 */

const stub = (chapterId: string, chapterTitle: string): ManualPage => ({
  chapterId,
  chapterTitle,
  sections: [
    {
      content: `Placeholder for the ${chapterTitle} chapter. Authored module manual content arrives with the ${chapterTitle} module story via getManualPages().`,
    },
  ],
});

export const DEV_MANUAL_PAGES: ManualPage[] = [
  // Wires: CANONICAL content from the module's getManualPages() (Story 5.3) —
  // the rule tables render from the same data solveWires() evaluates.
  ...getWiresManualPages(),
  // The Button: CANONICAL content from the module's getManualPages() (Story 5.4)
  // — the decision + release tables render from the same data the solver uses.
  ...getButtonManualPages(),
  // Keypads: CANONICAL content from the module's getManualPages() (Story 6.1)
  // — the six-column reference table renders from the same KEYPAD_COLUMNS the
  // solver uses.
  ...getKeypadsManualPages(),
  // Simon Says: CANONICAL content from the module's getManualPages() (Story 7.2)
  // — both translation tables (vowel/no-vowel × 3 strike rows) render from the
  // same SIMON_TABLES the solver reads.
  ...getSimonSaysManualPages(),
  // Memory: CANONICAL content from the module's getManualPages() (Story 7.3) —
  // the five stage tables render from the same MEMORY_RULES the solver reads.
  // Its five stage tables + intro make it the longest chapter here, so it still
  // exercises per-chapter scroll memory (AC2) — the intent of the old fixture.
  ...getMemoryManualPages(),
  // Morse Code: CANONICAL content from the module's getManualPages() (Story 7.4)
  // — the full Morse chart + the 16-row word→frequency table render from the same
  // MORSE_ALPHABET / MORSE_TABLE constants the solver reads.
  ...getMorseCodeManualPages(),
  // Complicated Wires: CANONICAL content from the module's getManualPages()
  // (Story 7.1) — the cut-code legend + 16-row truth table render from the same
  // COMPLICATED_WIRES_TABLE the solver evaluates.
  ...getComplicatedWiresManualPages(),
  // Wire Sequences: CANONICAL content from the module's getManualPages()
  // (Story 6.3) — the three colour occurrence tables render from the same
  // CUT_RULES the reducer reads.
  ...getWireSequencesManualPages(),
  // Who's on First: CANONICAL content from the module's getManualPages()
  // (Story 6.2) — both the Step-1 display→position grid and the Step-2 label
  // priority lists render from the same tables the solver reads.
  ...getWhosOnFirstManualPages(),
  // Passwords: CANONICAL content from the module's getManualPages() (Story 5.5)
  // — the 35-word list renders from the same PASSWORD_WORDS the solver checks.
  ...getPasswordsManualPages(),
  // Mazes: CANONICAL content from the module's getManualPages() (Story 6.4) —
  // all 9 maze diagrams (walls + markers) render from the same MAZE_LAYOUTS the
  // reducer reads, via the additive ManualSection.mazes structured field.
  ...getMazesManualPages(),
];
