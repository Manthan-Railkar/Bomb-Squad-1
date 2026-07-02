import { describe, expect, it } from 'vitest';
import { COMPLICATED_WIRES_MODULE_ID } from '@bomb-squad/shared';
import { COMPLICATED_WIRES_MODULE, SANDBOX_MODULES } from '../index.js';
import { getModuleRenderer } from '../registry.js';

/**
 * The client half of the plugin contract for complicated-wires (Story 7.1):
 * importing the module barrel registers the renderer (import-time side effect)
 * and exposes the IModule binding for the sandbox.
 */
describe('complicated-wires client binding', () => {
  it('registers its renderer via the barrel import (no scene changes)', () => {
    const renderer = getModuleRenderer(COMPLICATED_WIRES_MODULE_ID);
    expect(renderer.id).toBe(COMPLICATED_WIRES_MODULE_ID);
  });

  it('exposes the full IModule contract', () => {
    expect(COMPLICATED_WIRES_MODULE.id).toBe(COMPLICATED_WIRES_MODULE_ID);
    expect(typeof COMPLICATED_WIRES_MODULE.generate).toBe('function');
    expect(typeof COMPLICATED_WIRES_MODULE.reduce).toBe('function');
    const pages = COMPLICATED_WIRES_MODULE.getManualPages();
    expect(pages[0].chapterId).toBe(COMPLICATED_WIRES_MODULE_ID);
    // Legend (5 codes) + the 16-row truth table.
    const truthTable = pages[0].sections.find((s) => s.table?.headers[0] === 'Red stripe');
    expect(truthTable?.table?.rows).toHaveLength(16);
  });

  it('is listed for the sandbox picker', () => {
    expect(SANDBOX_MODULES.some((m) => m.id === COMPLICATED_WIRES_MODULE_ID)).toBe(true);
  });
});
