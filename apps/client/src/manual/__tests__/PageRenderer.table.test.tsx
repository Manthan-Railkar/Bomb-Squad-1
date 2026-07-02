import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ManualPage, ManualTable } from '@bomb-squad/shared';
import PageRenderer from '../PageRenderer.js';

/**
 * PageRenderer's ManualTable presentation metadata (Story TD-9): the
 * `rightAlignLastColumn` and `emphasizeColorWords` opt-outs, both default-on so
 * a metadata-free table renders exactly as before (the load-bearing
 * wires/the-button/passwords answer-column right-align).
 */

function renderTable(table: ManualTable) {
  const page: ManualPage = {
    chapterId: 'test',
    chapterTitle: 'Test',
    sections: [{ heading: 'T', content: '', table }],
  };
  return render(<PageRenderer page={page} />).container;
}

describe('PageRenderer table presentation metadata (TD-9)', () => {
  it('right-aligns the last column by default (no metadata) — load-bearing answer column', () => {
    const container = renderTable({ headers: ['Wire', 'Action'], rows: [['3rd', 'Cut']] });
    const th = container.querySelectorAll('th');
    const td = container.querySelectorAll('td');
    expect(th[th.length - 1].className).toContain('text-right');
    expect(th[0].className).toContain('text-left');
    expect(td[td.length - 1].className).toContain('text-right');
    expect(td[0].className).not.toContain('text-right');
  });

  it('left-aligns the last column when rightAlignLastColumn is false (no faked spacer)', () => {
    const container = renderTable({
      headers: ['Col 1', 'Col 2'],
      rows: [['a', 'b']],
      rightAlignLastColumn: false,
    });
    for (const th of container.querySelectorAll('th')) expect(th.className).toContain('text-left');
    for (const td of container.querySelectorAll('td')) expect(td.className).not.toContain('text-right');
  });

  it('tints recognised colour words by default (emphasis on)', () => {
    const container = renderTable({ headers: ['Display'], rows: [['RED']] });
    // EmphasizedText wraps a recognised colour word in a tinted font-semibold
    // span carrying an inline colour style.
    const emph = container.querySelector('td span.font-semibold') as HTMLElement | null;
    expect(emph).not.toBeNull();
    expect(emph!.textContent).toBe('RED');
    expect(emph!.style.color).not.toBe('');
  });

  it('renders an even grid (full-width, fixed equal columns, centred) when evenColumns is true', () => {
    const normal = renderTable({ headers: ['A', 'B'], rows: [['x', 'y']] });
    expect(normal.querySelector('table')!.className).toContain('w-full');
    expect(normal.querySelector('table')!.className).not.toContain('table-fixed');

    const even = renderTable({
      headers: ['Red stripe', 'Blue stripe', 'Code'],
      rows: [['✓', '—', 'C']],
      evenColumns: true,
    });
    const table = even.querySelector('table')!;
    expect(table.className).toContain('w-full');
    expect(table.className).toContain('table-fixed');
    // Every header and cell is centred; the last column does NOT right-align.
    for (const th of even.querySelectorAll('th')) expect(th.className).toContain('text-center');
    for (const td of even.querySelectorAll('td')) {
      expect(td.className).toContain('text-center');
      expect(td.className).not.toContain('text-right');
    }
  });

  it('renders colour words plain when emphasizeColorWords is false (RED untinted — colourblind floor)', () => {
    const container = renderTable({
      headers: ['Display'],
      rows: [['RED'], ['READ'], ['REED'], ['LEED']],
      emphasizeColorWords: false,
    });
    // No cell carries an emphasis span, so RED reads identically to its
    // near-spellings (all plain text, no tint).
    expect(container.querySelector('td span.font-semibold')).toBeNull();
    expect(container.querySelector('td [style*="color"]')).toBeNull();
    const cells = [...container.querySelectorAll('td')].map((td) => td.textContent);
    expect(cells).toEqual(['RED', 'READ', 'REED', 'LEED']);
  });
});
