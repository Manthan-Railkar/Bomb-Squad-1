import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KEYPAD_SYMBOL_GLYPHS, KEYPAD_SYMBOLS } from '@bomb-squad/shared';

/**
 * Regression gate for the Story 6.1 blank-keycap defect: the originally vendored
 * mono UI font silently lacked 15 of the 30 keypad glyphs, so keycaps rendered
 * blank and only Jay's interactive run caught it. This test parses the vendored
 * glyph font's cmap table directly (no font-parsing dependency — project rule:
 * no new npm deps) and asserts EVERY code point of every glyph in
 * KEYPAD_SYMBOL_GLYPHS maps to a real (non-.notdef) glyph. Swapping the font or
 * the glyph lookup without coverage now fails here, not in the sandbox.
 *
 * Keep GLYPH_FONT (DefuserView.tsx) and FONT_PATH pointing at the same file.
 */
// vitest runs with cwd = apps/client (jsdom rewrites import.meta.url, so no file URL here).
const FONT_PATH = resolve(process.cwd(), 'public/fonts/dejavu-sans-bold.ttf');

/** Minimal TTF/OTF cmap reader: returns glyph id for a code point (0 = .notdef). */
function makeCmapLookup(font: Buffer): (codePoint: number) => number {
  const numTables = font.readUInt16BE(4);
  let cmapOffset = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (font.toString('latin1', rec, rec + 4) === 'cmap') {
      cmapOffset = font.readUInt32BE(rec + 8);
      break;
    }
  }
  if (cmapOffset < 0) throw new Error('font has no cmap table');

  // Pick the best Unicode subtable: prefer format 12 (full range), else format 4 (BMP).
  const subtableCount = font.readUInt16BE(cmapOffset + 2);
  let format4 = -1;
  let format12 = -1;
  for (let i = 0; i < subtableCount; i++) {
    const rec = cmapOffset + 4 + i * 8;
    const platformId = font.readUInt16BE(rec);
    const encodingId = font.readUInt16BE(rec + 2);
    const isUnicode =
      platformId === 0 || (platformId === 3 && (encodingId === 1 || encodingId === 10));
    if (!isUnicode) continue;
    const sub = cmapOffset + font.readUInt32BE(rec + 4);
    const format = font.readUInt16BE(sub);
    if (format === 12) format12 = sub;
    if (format === 4) format4 = sub;
  }

  if (format12 >= 0) {
    const numGroups = font.readUInt32BE(format12 + 12);
    return (cp) => {
      for (let g = 0; g < numGroups; g++) {
        const rec = format12 + 16 + g * 12;
        const start = font.readUInt32BE(rec);
        const end = font.readUInt32BE(rec + 4);
        if (cp >= start && cp <= end) return font.readUInt32BE(rec + 8) + (cp - start);
      }
      return 0;
    };
  }
  if (format4 < 0) throw new Error('font has no usable Unicode cmap subtable');

  const segCount = font.readUInt16BE(format4 + 6) / 2;
  const endCodes = format4 + 14;
  const startCodes = endCodes + segCount * 2 + 2; // +2 skips reservedPad
  const idDeltas = startCodes + segCount * 2;
  const idRangeOffsets = idDeltas + segCount * 2;
  return (cp) => {
    if (cp > 0xffff) return 0;
    for (let s = 0; s < segCount; s++) {
      if (font.readUInt16BE(endCodes + s * 2) < cp) continue;
      const start = font.readUInt16BE(startCodes + s * 2);
      if (start > cp) return 0;
      const idRangeOffset = font.readUInt16BE(idRangeOffsets + s * 2);
      const idDelta = font.readInt16BE(idDeltas + s * 2);
      if (idRangeOffset === 0) return (cp + idDelta) & 0xffff;
      const glyphAddr = idRangeOffsets + s * 2 + idRangeOffset + (cp - start) * 2;
      const glyphId = font.readUInt16BE(glyphAddr);
      return glyphId === 0 ? 0 : (glyphId + idDelta) & 0xffff;
    }
    return 0;
  };
}

describe('keypad glyph font coverage (AC3 regression gate)', () => {
  it('the vendored glyph font maps every KEYPAD_SYMBOL_GLYPHS code point to a real glyph', () => {
    const lookup = makeCmapLookup(readFileSync(FONT_PATH));
    const missing: string[] = [];
    for (const id of KEYPAD_SYMBOLS) {
      const { glyph } = KEYPAD_SYMBOL_GLYPHS[id];
      for (const char of glyph) {
        const cp = char.codePointAt(0)!;
        if (lookup(cp) === 0) {
          missing.push(`${id} ('${glyph}' U+${cp.toString(16).toUpperCase().padStart(4, '0')})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
