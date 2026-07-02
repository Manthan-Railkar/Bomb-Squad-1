import { describe, expect, it } from 'vitest';
import { MORSE_CODE_MODULE_ID } from '@bomb-squad/shared';
import { MORSE_CODE_MODULE, SANDBOX_MODULES } from '../index.js';
import { getModuleRenderer } from '../registry.js';

/**
 * The client half of the plugin contract for morse-code (Story 7.4): importing
 * the module barrel registers the renderer (import-time side effect) and exposes
 * the IModule binding for the sandbox.
 */
describe('morse-code client binding', () => {
  it('registers its renderer via the barrel import (no scene changes)', () => {
    const renderer = getModuleRenderer(MORSE_CODE_MODULE_ID);
    expect(renderer.id).toBe(MORSE_CODE_MODULE_ID);
  });

  it('exposes the full IModule contract', () => {
    expect(MORSE_CODE_MODULE.id).toBe(MORSE_CODE_MODULE_ID);
    expect(typeof MORSE_CODE_MODULE.generate).toBe('function');
    expect(typeof MORSE_CODE_MODULE.reduce).toBe('function');
    const pages = MORSE_CODE_MODULE.getManualPages();
    expect(pages[0].chapterId).toBe(MORSE_CODE_MODULE_ID);
    // Both source-of-truth tables are present: the Morse chart and the word→freq map.
    expect(pages[0].sections.some((s) => s.table?.headers[0] === 'Character')).toBe(true);
    expect(pages[0].sections.some((s) => s.table?.headers[0] === 'If the word is')).toBe(true);
  });

  it('is listed for the sandbox picker', () => {
    expect(SANDBOX_MODULES.some((m) => m.id === MORSE_CODE_MODULE_ID)).toBe(true);
  });
});
