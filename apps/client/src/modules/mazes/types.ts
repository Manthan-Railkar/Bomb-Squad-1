/**
 * Module contract file: types re-exported from packages/shared — NEVER
 * duplicated (project rule). The shared dir is the single source of truth;
 * this file exists so the per-module directory is self-contained for readers.
 */
export {
  MAZES_MODULE_ID,
  GRID_SIZE,
  MAZE_LAYOUTS,
  edgeKey,
  isMazesAction,
  type Cell,
  type Direction,
  type MazeLayout,
  type MazesState,
  type MazesAction,
  type MazesReset,
} from '@bomb-squad/shared';
