import type { Locale, ManualMaze, ManualPage } from '../../types/index.js';
import { GRID_SIZE, MAZES_MODULE_ID, MAZE_LAYOUTS } from './types.js';

/** Locale-keyed prose. The maze layouts (walls + markers) are locale-invariant. */
const TEXT = {
  en: {
    title: 'Mazes',
    intro:
      'Find the maze whose two circular markings match the ones on the ' +
      'module. Navigate the white light to the red triangle with the four ' +
      'arrow buttons. Do NOT cross the lines — they are drawn here but are ' +
      'invisible on the bomb. Moving into a line, or off the edge of the ' +
      'grid, causes a strike and the light stays put.',
    gridHeading: 'The nine mazes',
  },
  zh: {
    title: '迷宫 (Mazes)',
    intro:
      '找到两个圆形标记与模块上一致的那张迷宫。用四个方向按钮把白色光点移动到' +
      '红色三角。切勿穿过线条——它们画在手册上，但在弹体上是看不见的。撞上线条' +
      '或移出网格边缘都会记一次失误(strike)，且光点保持原位不动。',
    gridHeading: '九张迷宫',
  },
} as const;

/**
 * Structured manual content — NEVER raw HTML or untyped JSX (project rule). The
 * 9 mazes render from the exact MAZE_LAYOUTS constant the reducer reads (same
 * walls + markers), so the manual the Expert reads and the logic that judges a
 * move cannot diverge (the manual test asserts the emitted mazes reconstruct
 * MAZE_LAYOUTS exactly).
 *
 * The manual shows the STATIC layout only — walls + markers. It does NOT show a
 * start/target: those are per-instance (seeded) and live on the bomb, not the
 * manual. The Expert matches the on-bomb markers to one of these 9 mazes, then
 * reads the walls to guide the Defuser's white light to the red triangle.
 */
export function getMazesManualPages(locale: Locale = 'en'): ManualPage[] {
  const t = TEXT[locale];
  const mazes: ManualMaze[] = MAZE_LAYOUTS.map((layout) => ({
    size: GRID_SIZE,
    markers: layout.markers,
    walls: layout.walls,
  }));

  return [
    {
      chapterId: MAZES_MODULE_ID,
      chapterTitle: t.title,
      sections: [
        {
          content: t.intro,
        },
        {
          heading: t.gridHeading,
          content: '',
          mazes,
        },
      ],
    },
  ];
}
