import { describe, expect, it, beforeEach } from 'vitest';
import type { ExpertManualPositionPayload } from '@bomb-squad/shared';
import { useGameStore } from '../../store/gameStore.js';
import { bindServerEvents } from '../bindServerEvents.js';
import type { AppClientSocket } from '../socket.js';

/**
 * Story 9.4: the EXPERT_MANUAL_POSITION binding accumulates one entry per Expert
 * (keyed by durable playerId) into the multiview map. Unlike the chapter
 * ASSIGNMENT, it has NO round-staleness guard — the position is inherently
 * current, and setBomb resets the map at the round boundary.
 */

function fakeSocket(): { socket: AppClientSocket; emit: (event: string, payload: unknown) => void } {
  const handlers = new Map<string, (payload: unknown) => void>();
  const socket = {
    on: (event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, handler);
    },
    off: () => {},
    io: { on: () => {}, off: () => {} },
  } as unknown as AppClientSocket;
  return { socket, emit: (event, payload) => handlers.get(event)?.(payload) };
}

beforeEach(() => useGameStore.setState({ expertManualPositions: {}, bomb: null }));

describe('bindServerEvents — EXPERT_MANUAL_POSITION accumulation (Story 9.4)', () => {
  it('an incoming frame updates exactly that Expert\'s entry (keyed by playerId)', () => {
    const { socket, emit } = fakeSocket();
    bindServerEvents(socket);
    emit('EXPERT_MANUAL_POSITION', { playerId: 'alice', chapterId: 'wires' } satisfies ExpertManualPositionPayload);
    emit('EXPERT_MANUAL_POSITION', { playerId: 'bob', chapterId: 'keypads' } satisfies ExpertManualPositionPayload);
    expect(useGameStore.getState().expertManualPositions).toEqual({ alice: 'wires', bob: 'keypads' });
  });

  it('a second frame for one Expert re-points only that pane', () => {
    const { socket, emit } = fakeSocket();
    bindServerEvents(socket);
    emit('EXPERT_MANUAL_POSITION', { playerId: 'alice', chapterId: 'wires' });
    emit('EXPERT_MANUAL_POSITION', { playerId: 'bob', chapterId: 'keypads' });
    emit('EXPERT_MANUAL_POSITION', { playerId: 'alice', chapterId: 'memory' });
    expect(useGameStore.getState().expertManualPositions).toEqual({ alice: 'memory', bob: 'keypads' });
  });
});
