import { beforeEach, describe, expect, it } from 'vitest';
import type { BombState } from '@bomb-squad/shared';
import { useGameStore } from '../gameStore.js';

/** Minimal bomb snapshot — setBomb only stores it and resets sibling fields. */
const BOMB = {
  context: {} as BombState['context'],
  modules: [],
  strikes: 0,
  solved: false,
} as BombState;

beforeEach(() => {
  useGameStore.setState({ lifelineTokens: 0, bomb: null, session: null });
});

describe('gameStore.lifelineTokens (Story 9.2)', () => {
  it('setLifelineTokens stores the server-authoritative count', () => {
    useGameStore.getState().setLifelineTokens(2);
    expect(useGameStore.getState().lifelineTokens).toBe(2);
    useGameStore.getState().setLifelineTokens(3);
    expect(useGameStore.getState().lifelineTokens).toBe(3);
  });

  it('setBomb does NOT reset the balance — tokens persist across rounds', () => {
    useGameStore.getState().setLifelineTokens(2);
    useGameStore.getState().setBomb(BOMB);
    expect(useGameStore.getState().lifelineTokens).toBe(2);
  });

  it('clearSession resets the balance to 0 (a full session clear)', () => {
    useGameStore.getState().setLifelineTokens(3);
    useGameStore.getState().clearSession();
    expect(useGameStore.getState().lifelineTokens).toBe(0);
  });
});
