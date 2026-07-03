import { describe, expect, it } from '@jest/globals';
import { MAX_LIFELINE_TOKENS } from '../index.js';

describe('lifeline token economy — shared constants (Story 9.2)', () => {
  it('pins the held-token cap at 3 (FR42)', () => {
    // Both the server grant clamp and the Story 9.3 spend gate read this; a change
    // here silently reshapes the economy on both sides — pin it explicitly.
    expect(MAX_LIFELINE_TOKENS).toBe(3);
  });
});
