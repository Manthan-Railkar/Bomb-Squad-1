import { describe, expect, it } from 'vitest';
import { MEMORY_MODULE_ID } from '@bomb-squad/shared';
import { MEMORY_MODULE, SANDBOX_MODULES } from '../index.js';
import { getModuleRenderer } from '../registry.js';

/**
 * The client half of the plugin contract for memory (Story 7.3): importing the
 * module barrel registers the renderer (import-time side effect) and exposes the
 * IModule binding for the sandbox.
 */
describe('memory client binding', () => {
  it('registers its renderer via the barrel import (no scene changes)', () => {
    const renderer = getModuleRenderer(MEMORY_MODULE_ID);
    expect(renderer.id).toBe(MEMORY_MODULE_ID);
  });

  it('exposes the full IModule contract', () => {
    expect(MEMORY_MODULE.id).toBe(MEMORY_MODULE_ID);
    expect(typeof MEMORY_MODULE.generate).toBe('function');
    expect(typeof MEMORY_MODULE.reduce).toBe('function');
    const pages = MEMORY_MODULE.getManualPages();
    expect(pages[0].chapterId).toBe(MEMORY_MODULE_ID);
    // Five stage tables (Display→Action), one per stage.
    const stageTables = pages[0].sections.filter((s) => s.table?.headers[0] === 'Display');
    expect(stageTables).toHaveLength(5);
  });

  it('is listed for the sandbox picker', () => {
    expect(SANDBOX_MODULES.some((m) => m.id === MEMORY_MODULE_ID)).toBe(true);
  });
});
