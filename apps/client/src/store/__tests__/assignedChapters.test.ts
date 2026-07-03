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
  useGameStore.setState({ assignedChapterIds: null, bomb: null });
});

describe('gameStore.assignedChapterIds (Story 9.1)', () => {
  it('setAssignedChapters stores the restricted set and clears it with null', () => {
    useGameStore.getState().setAssignedChapters(['wires', 'memory']);
    expect(useGameStore.getState().assignedChapterIds).toEqual(['wires', 'memory']);
    useGameStore.getState().setAssignedChapters(null);
    expect(useGameStore.getState().assignedChapterIds).toBeNull();
  });

  it('setBomb resets a prior restriction to null (new-round clear — no stale bleed)', () => {
    useGameStore.getState().setAssignedChapters(['wires']);
    useGameStore.getState().setBomb(BOMB);
    expect(useGameStore.getState().assignedChapterIds).toBeNull();
  });

  it('clearSession resets the restriction to null', () => {
    useGameStore.getState().setAssignedChapters(['wires']);
    useGameStore.getState().clearSession();
    expect(useGameStore.getState().assignedChapterIds).toBeNull();
  });
});
