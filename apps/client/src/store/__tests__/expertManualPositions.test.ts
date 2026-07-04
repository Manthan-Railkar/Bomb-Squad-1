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
  useGameStore.setState({ expertManualPositions: {}, bomb: null });
});

describe('gameStore.expertManualPositions (Story 9.4 multiview)', () => {
  it('setExpertManualPosition merges per-playerId (one entry per Expert)', () => {
    const { setExpertManualPosition } = useGameStore.getState();
    setExpertManualPosition({ playerId: 'alice', chapterId: 'wires' });
    setExpertManualPosition({ playerId: 'bob', chapterId: 'keypads' });
    expect(useGameStore.getState().expertManualPositions).toEqual({
      alice: 'wires',
      bob: 'keypads',
    });
  });

  it("a re-nav overwrites only that Expert's entry, never another's", () => {
    const { setExpertManualPosition } = useGameStore.getState();
    setExpertManualPosition({ playerId: 'alice', chapterId: 'wires' });
    setExpertManualPosition({ playerId: 'bob', chapterId: 'keypads' });
    setExpertManualPosition({ playerId: 'alice', chapterId: 'memory' }); // alice moves
    expect(useGameStore.getState().expertManualPositions).toEqual({
      alice: 'memory', // updated
      bob: 'keypads', // untouched
    });
  });

  it('setBomb resets the map to {} (new-round clear — R4, no stale bleed)', () => {
    useGameStore.getState().setExpertManualPosition({ playerId: 'alice', chapterId: 'wires' });
    useGameStore.getState().setBomb(BOMB);
    expect(useGameStore.getState().expertManualPositions).toEqual({});
  });

  it('clearSession resets the map to {}', () => {
    useGameStore.getState().setExpertManualPosition({ playerId: 'alice', chapterId: 'wires' });
    useGameStore.getState().clearSession();
    expect(useGameStore.getState().expertManualPositions).toEqual({});
  });
});
