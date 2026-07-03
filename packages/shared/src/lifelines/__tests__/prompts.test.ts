import { describe, expect, it } from '@jest/globals';
import {
  LIFELINE_PROMPTS,
  LIFELINE_PROMPT_IDS,
  isLifelinePromptId,
  lifelinePromptText,
} from '../prompts.js';

const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('lifeline prompt list — shared source of truth (Story 9.3)', () => {
  it('holds between 1 and 8 prompts (≤8 scannable options, AC-1)', () => {
    expect(LIFELINE_PROMPTS.length).toBeGreaterThanOrEqual(1);
    expect(LIFELINE_PROMPTS.length).toBeLessThanOrEqual(8);
  });

  it('every id is unique kebab-case with non-empty text', () => {
    const ids = LIFELINE_PROMPTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids
    for (const p of LIFELINE_PROMPTS) {
      expect(p.id).toMatch(KEBAB_RE);
      expect(p.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('LIFELINE_PROMPT_IDS mirrors the list exactly', () => {
    expect(LIFELINE_PROMPT_IDS.size).toBe(LIFELINE_PROMPTS.length);
    for (const p of LIFELINE_PROMPTS) expect(LIFELINE_PROMPT_IDS.has(p.id)).toBe(true);
  });

  it('isLifelinePromptId is fail-closed (AC-4)', () => {
    expect(isLifelinePromptId('re-read-section')).toBe(true);
    expect(isLifelinePromptId('not-a-prompt')).toBe(false);
    expect(isLifelinePromptId('')).toBe(false);
    // A near-miss / injection attempt must not slip through.
    expect(isLifelinePromptId('re-read-section ')).toBe(false);
  });

  it('lifelinePromptText resolves known ids and fails closed on unknown', () => {
    expect(lifelinePromptText('check-serial')).toBe('Check the serial number');
    expect(lifelinePromptText('not-a-prompt')).toBeUndefined();
  });
});
