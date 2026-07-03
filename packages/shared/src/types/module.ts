import type { BombContext } from './bomb.js';
import type { Reducer } from './reducer.js';

/**
 * Supported manual languages. `'en'` is the authoritative source (all on-bomb
 * literal tokens live in English); `'zh'` is a Simplified-Chinese translation of
 * the PROSE only — table row values (words, symbols, labels the Defuser reads off
 * the bomb) stay identical across locales so Defuser↔Expert communication holds.
 */
export type Locale = 'en' | 'zh';

export interface ManualTable {
  headers: string[];
  rows: string[][];
}

/** A grid cell coordinate (x = column, y = row; origin top-left). */
export interface Cell {
  readonly x: number;
  readonly y: number;
}

/**
 * A structured maze for the manual — the first non-table structured manual
 * content (Story 6.4). A maze cannot be a text table, so `ManualSection.maze`
 * carries the data (size + walls + markers) and the shared PageRenderer draws
 * it (modules author data, never markup). `walls` uses the same canonical
 * blocked-edge encoding (`"x1,y1|x2,y2"` keys) as the module's MAZE_LAYOUTS, so
 * the manual the Expert reads and the logic that judges a move cannot diverge.
 */
export interface ManualMaze {
  /** Grid dimension (6 → a 6×6 lattice). */
  size: number;
  /** The circular markers that identify this maze. */
  markers: readonly Cell[];
  /** Canonical blocked-edge keys between adjacent cells. */
  walls: readonly string[];
}

export interface ManualSection {
  heading?: string;
  /** Plain text content or a structured description for rendering. */
  content: string;
  table?: ManualTable;
  /** Additive (Story 6.4): a single structured maze rendered by PageRenderer. */
  maze?: ManualMaze;
  /** Additive (Story 6.4): a grid of structured mazes (the 9-up mazes page). */
  mazes?: ManualMaze[];
}

/** Structured manual content. NOT raw HTML or untyped JSX. */
export interface ManualPage {
  chapterId: string;
  chapterTitle: string;
  sections: ManualSection[];
}

export interface ModuleState<S> {
  /** Module identifier in kebab-case, e.g. "wires", "simon-says". */
  moduleId: string;
  /**
   * 'struck' is transient — the bomb reducer rolls it up into a team strike and
   * resets status back to 'armed'. Reducers return 'struck' to signal a wrong
   * interaction; they never hold that status permanently.
   */
  status: 'armed' | 'solved' | 'struck';
  data: S;
}

export interface IModule<S = unknown, A = unknown> {
  /** Module identifier in kebab-case, e.g. "wires", "simon-says". */
  readonly id: string;

  /** Pure, seeded. The ONLY place randomness is allowed in a module. */
  generate(seed: number, ctx: BombContext): S;

  /** Pure reducer for this module's actions. */
  reduce: Reducer<ModuleState<S>, A>;

  /**
   * Returns structured manual content. NOT raw HTML or untyped JSX.
   * `locale` selects the language of the PROSE (default `'en'`); table row
   * values are locale-invariant literal tokens.
   */
  getManualPages(locale?: Locale): ManualPage[];

  /** Optional needy-module lifecycle hook (V2). Default: no-op. */
  onTick?(state: ModuleState<S>, now: number): ModuleState<S>;
}
