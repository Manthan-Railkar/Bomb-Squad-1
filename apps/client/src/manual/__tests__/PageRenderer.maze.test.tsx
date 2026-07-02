import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ManualMaze, ManualPage } from '@bomb-squad/shared';
import PageRenderer from '../PageRenderer.js';

/**
 * PageRenderer's additive maze branch (Story 6.4): a section carrying a
 * structured `maze` (or `mazes`) renders an SVG grid with walls + markers, while
 * a section WITHOUT one renders exactly as before (backward-compat assertion).
 */

const MAZE: ManualMaze = {
  size: 3,
  markers: [
    { x: 0, y: 0 },
    { x: 2, y: 2 },
  ],
  // one vertical wall (0,0)-(1,0) and one horizontal wall (1,1)-(1,2)
  walls: ['0,0|1,0', '1,1|1,2'],
};

describe('PageRenderer maze branch', () => {
  it('renders a section.maze as an SVG with wall segments and marker circles', () => {
    const page: ManualPage = {
      chapterId: 'mazes',
      chapterTitle: 'Mazes',
      sections: [{ content: 'intro', maze: MAZE }],
    };
    const { container } = render(<PageRenderer page={page} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // Two wall segments → two <line>s.
    expect(container.querySelectorAll('line')).toHaveLength(2);
    // 3×3 dots + 2 markers = 11 circles.
    expect(container.querySelectorAll('circle')).toHaveLength(3 * 3 + 2);
  });

  it('renders section.mazes as multiple SVGs', () => {
    const page: ManualPage = {
      chapterId: 'mazes',
      chapterTitle: 'Mazes',
      sections: [{ heading: 'The nine mazes', content: '', mazes: [MAZE, MAZE] }],
    };
    const { container } = render(<PageRenderer page={page} />);
    expect(container.querySelectorAll('svg')).toHaveLength(2);
  });

  it('a section WITHOUT a maze renders no SVG (backward compatible)', () => {
    const page: ManualPage = {
      chapterId: 'wires',
      chapterTitle: 'Wires',
      sections: [
        { content: 'plain text' },
        { heading: 'A table', content: '', table: { headers: ['H'], rows: [['a']] } },
      ],
    };
    const { container } = render(<PageRenderer page={page} />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('table')).not.toBeNull();
  });
});
