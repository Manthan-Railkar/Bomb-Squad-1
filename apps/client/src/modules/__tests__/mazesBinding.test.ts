import { describe, expect, it } from 'vitest';
import { MAZES_MODULE_ID, MAZE_LAYOUTS } from '@bomb-squad/shared';
import { MAZES_MODULE, SANDBOX_MODULES } from '../index.js';
import { getModuleRenderer } from '../registry.js';

/**
 * The client half of the plugin contract for mazes (Story 6.4): importing the
 * module barrel registers the renderer (import-time side effect) and exposes the
 * IModule binding for the sandbox.
 */
describe('mazes client binding', () => {
  it('registers its renderer via the barrel import (no scene changes)', () => {
    const renderer = getModuleRenderer(MAZES_MODULE_ID);
    expect(renderer.id).toBe(MAZES_MODULE_ID);
  });

  it('exposes the full IModule contract', () => {
    expect(MAZES_MODULE.id).toBe(MAZES_MODULE_ID);
    expect(typeof MAZES_MODULE.generate).toBe('function');
    expect(typeof MAZES_MODULE.reduce).toBe('function');
    const pages = MAZES_MODULE.getManualPages();
    expect(pages[0].chapterId).toBe(MAZES_MODULE_ID);
    // the 9-up section carries the same walls + markers as MAZE_LAYOUTS
    const section = pages[0].sections.find((s) => s.mazes !== undefined);
    expect(section?.mazes).toHaveLength(9);
    section?.mazes?.forEach((m, i) => {
      expect(m.walls).toEqual(MAZE_LAYOUTS[i].walls);
      expect(m.markers).toEqual(MAZE_LAYOUTS[i].markers);
    });
  });

  it('is listed for the sandbox picker', () => {
    expect(SANDBOX_MODULES.some((m) => m.id === MAZES_MODULE_ID)).toBe(true);
  });
});
