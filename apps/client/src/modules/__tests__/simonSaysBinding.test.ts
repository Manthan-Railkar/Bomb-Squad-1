import { describe, expect, it } from 'vitest';
import { SIMON_SAYS_MODULE_ID } from '@bomb-squad/shared';
import { SIMON_SAYS_MODULE, SANDBOX_MODULES } from '../index.js';
import { getModuleRenderer } from '../registry.js';

/**
 * The client half of the plugin contract for simon-says (Story 7.2): importing
 * the module barrel registers the renderer (import-time side effect) and
 * exposes the IModule binding for the sandbox.
 */
describe('simon-says client binding', () => {
  it('registers its renderer via the barrel import (no scene changes)', () => {
    const renderer = getModuleRenderer(SIMON_SAYS_MODULE_ID);
    expect(renderer.id).toBe(SIMON_SAYS_MODULE_ID);
  });

  it('exposes the full IModule contract', () => {
    expect(SIMON_SAYS_MODULE.id).toBe(SIMON_SAYS_MODULE_ID);
    expect(typeof SIMON_SAYS_MODULE.generate).toBe('function');
    expect(typeof SIMON_SAYS_MODULE.reduce).toBe('function');
    const pages = SIMON_SAYS_MODULE.getManualPages();
    expect(pages[0].chapterId).toBe(SIMON_SAYS_MODULE_ID);
    // Both translation tables render: 3 strike rows each → 6 flashed→press tables.
    const pressTables = pages[0].sections.filter((s) => s.table?.headers[0] === 'Flashed');
    expect(pressTables).toHaveLength(6);
  });

  it('is listed for the sandbox picker', () => {
    expect(SANDBOX_MODULES.some((m) => m.id === SIMON_SAYS_MODULE_ID)).toBe(true);
  });
});
