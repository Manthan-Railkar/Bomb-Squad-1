import { describe, expect, it } from 'vitest';
import { WIRE_SEQUENCES_MODULE_ID, CUT_RULES, WIRE_SEQ_COLORS } from '@bomb-squad/shared';
import { WIRE_SEQUENCES_MODULE, SANDBOX_MODULES } from '../index.js';
import { getModuleRenderer } from '../registry.js';

/**
 * The client half of the plugin contract for wire-sequences (Story 6.3):
 * importing the module barrel registers the renderer (import-time side effect)
 * and exposes the IModule binding for the sandbox.
 */
describe('wire-sequences client binding', () => {
  it('registers its renderer via the barrel import (no scene changes)', () => {
    const renderer = getModuleRenderer(WIRE_SEQUENCES_MODULE_ID);
    expect(renderer.id).toBe(WIRE_SEQUENCES_MODULE_ID);
  });

  it('exposes the full IModule contract', () => {
    expect(WIRE_SEQUENCES_MODULE.id).toBe(WIRE_SEQUENCES_MODULE_ID);
    expect(typeof WIRE_SEQUENCES_MODULE.generate).toBe('function');
    expect(typeof WIRE_SEQUENCES_MODULE.reduce).toBe('function');
    const pages = WIRE_SEQUENCES_MODULE.getManualPages();
    expect(pages[0].chapterId).toBe(WIRE_SEQUENCES_MODULE_ID);
    // the three colour tables render the CUT_RULES answer column
    const format = (cell: ReadonlyArray<string>): string =>
      cell.length <= 1
        ? cell[0]
        : cell.length === 2
          ? `${cell[0]} or ${cell[1]}`
          : `${cell.slice(0, -1).join(', ')} or ${cell[cell.length - 1]}`;
    for (const color of WIRE_SEQ_COLORS) {
      const heading = `${color[0].toUpperCase()}${color.slice(1)} wire occurrences`;
      const table = pages[0].sections.find((s) => s.heading === heading)?.table;
      expect(table?.rows.map((r) => r[1])).toEqual(CUT_RULES[color].map(format));
    }
  });

  it('is listed for the sandbox picker', () => {
    expect(SANDBOX_MODULES.some((m) => m.id === WIRE_SEQUENCES_MODULE_ID)).toBe(true);
  });
});
