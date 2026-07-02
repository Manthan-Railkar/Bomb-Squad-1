import type { BombContext } from './bomb.js';
import type { Reducer } from './reducer.js';

export interface ManualTable {
  headers: string[];
  rows: string[][];
  /**
   * Presentation (additive, Story TD-9): right-align the LAST column — header
   * and cells — as the module's "action/answer" column. Default (undefined) is
   * `true`: load-bearing for wires/the-button/passwords, whose final column IS
   * the answer, so existing tables render exactly as before. Set `false` for
   * symmetric reference grids (Keypads, Who's on First) so the last real column
   * stays left-aligned under its header — instead of faking a trailing empty
   * spacer column to absorb the right-align rule.
   */
  rightAlignLastColumn?: boolean;
  /**
   * Presentation (additive, Story TD-9): opt this table out of colour-word
   * emphasis (the `MANUAL_COLOR_INKS` tint the viewer applies to RED/BLUE/…).
   * Default (undefined) is `true` — tables keep the tint. Set `false` where
   * colour must NOT be a cue: the Who's on First spelling-discrimination cluster
   * (RED vs READ/REED/LEED — colourblind floor), where tinting only `RED` is a
   * false signal. Opts out this table's tint only; other tables keep theirs.
   */
  emphasizeColorWords?: boolean;
  /**
   * Presentation (additive, Story TD-9): render as an EVEN GRID — full width
   * with equal (fixed-layout) columns and centre-aligned headers + cells.
   * Default (undefined) is `false` — the normal auto-width layout where an
   * answer column right-aligns to the sheet edge. Set `true` for matrix/truth
   * tables (single-glyph ✓/— cells under wide headers, e.g. Complicated Wires)
   * so the columns fill the width in an even lattice instead of the auto layout
   * bunching them all against the left. Overrides `rightAlignLastColumn`.
   */
  evenColumns?: boolean;
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

  /** Returns structured manual content. NOT raw HTML or untyped JSX. */
  getManualPages(): ManualPage[];

  /** Optional needy-module lifecycle hook (V2). Default: no-op. */
  onTick?(state: ModuleState<S>, now: number): ModuleState<S>;
}
