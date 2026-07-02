import { describe, expect, it } from 'vitest';
import { WHOS_ON_FIRST_MODULE_ID, DISPLAY_POSITIONS, LABEL_PRIORITIES } from '@bomb-squad/shared';
import { WHOS_ON_FIRST_MODULE, SANDBOX_MODULES } from '../index.js';
import { getModuleRenderer } from '../registry.js';

/**
 * The client half of the plugin contract for whos-on-first (Story 6.2): importing
 * the module barrel registers the renderer (import-time side effect) and exposes
 * the IModule binding for the sandbox.
 */
describe('whos-on-first client binding', () => {
  it('registers its renderer via the barrel import (no scene changes)', () => {
    const renderer = getModuleRenderer(WHOS_ON_FIRST_MODULE_ID);
    expect(renderer.id).toBe(WHOS_ON_FIRST_MODULE_ID);
  });

  it('exposes the full IModule contract', () => {
    expect(WHOS_ON_FIRST_MODULE.id).toBe(WHOS_ON_FIRST_MODULE_ID);
    expect(typeof WHOS_ON_FIRST_MODULE.generate).toBe('function');
    expect(typeof WHOS_ON_FIRST_MODULE.reduce).toBe('function');
    const pages = WHOS_ON_FIRST_MODULE.getManualPages();
    expect(pages[0].chapterId).toBe(WHOS_ON_FIRST_MODULE_ID);
    // both canonical tables render (Step 1 = 28 display rows, Step 2 = 28 labels)
    expect(pages[0].sections[0].table?.rows).toHaveLength(Object.keys(DISPLAY_POSITIONS).length);
    expect(pages[0].sections[1].table?.rows).toHaveLength(Object.keys(LABEL_PRIORITIES).length);
  });

  it('is listed for the sandbox picker', () => {
    expect(SANDBOX_MODULES.some((m) => m.id === WHOS_ON_FIRST_MODULE_ID)).toBe(true);
  });
});
