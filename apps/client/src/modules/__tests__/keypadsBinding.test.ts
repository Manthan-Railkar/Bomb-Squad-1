import { describe, expect, it } from 'vitest';
import { KEYPADS_MODULE_ID, KEYPAD_COLUMNS, KEYPAD_SYMBOL_GLYPHS } from '@bomb-squad/shared';
import { KEYPADS_MODULE, SANDBOX_MODULES } from '../index.js';
import { getModuleRenderer } from '../registry.js';

/**
 * The client half of the plugin contract for keypads (Story 6.1): importing the
 * module barrel registers the renderer (import-time side effect) and exposes the
 * IModule binding for the sandbox.
 */
describe('keypads client binding', () => {
  it('registers its renderer via the barrel import (no scene changes)', () => {
    const renderer = getModuleRenderer(KEYPADS_MODULE_ID);
    expect(renderer.id).toBe(KEYPADS_MODULE_ID);
  });

  it('exposes the full IModule contract', () => {
    expect(KEYPADS_MODULE.id).toBe(KEYPADS_MODULE_ID);
    expect(typeof KEYPADS_MODULE.generate).toBe('function');
    expect(typeof KEYPADS_MODULE.reduce).toBe('function');
    const pages = KEYPADS_MODULE.getManualPages();
    expect(pages[0].chapterId).toBe(KEYPADS_MODULE_ID);
    // the table renders the six reference columns as glyphs
    const table = pages[0].sections.find((s) => s.table)?.table;
    // exactly six reference-column headers, no phantom spacer (TD-9); the last
    // column opts out of the viewer's right-align rule via presentation metadata
    expect(table?.headers).toEqual(['Col 1', 'Col 2', 'Col 3', 'Col 4', 'Col 5', 'Col 6']);
    expect(table?.rightAlignLastColumn).toBe(false);
    const col0 = table?.rows.map((row) => row[0]);
    expect(col0).toEqual(KEYPAD_COLUMNS[0].map((id) => KEYPAD_SYMBOL_GLYPHS[id].glyph));
  });

  it('is listed for the sandbox picker', () => {
    expect(SANDBOX_MODULES.some((m) => m.id === KEYPADS_MODULE_ID)).toBe(true);
  });
});
