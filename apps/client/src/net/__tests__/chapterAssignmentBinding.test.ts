import { describe, expect, it, beforeEach } from 'vitest';
import type { ExpertChapterAssignmentPayload } from '@bomb-squad/shared';
import { makeSession } from '../../test/fixtures.js';
import { useGameStore } from '../../store/gameStore.js';
import { bindServerEvents } from '../bindServerEvents.js';
import type { AppClientSocket } from '../socket.js';

/**
 * Story 9.1 (review): the EXPERT_CHAPTER_ASSIGNMENT binding must drop a
 * stale delivery — the payload carries its roundNumber for exactly this. A
 * late/replayed assignment from a PRIOR round must never restrict the manual
 * of the CURRENT one.
 */

/** Fake socket that records the handlers bindServerEvents registers, so a test
 *  can invoke a server event by name (same pattern as resolutionBinding). */
function fakeSocket(): { socket: AppClientSocket; emit: (event: string, payload: unknown) => void } {
  const handlers = new Map<string, (payload: unknown) => void>();
  const socket = {
    on: (event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, handler);
    },
    off: () => {},
    io: { on: () => {}, off: () => {} },
  } as unknown as AppClientSocket;
  return {
    socket,
    emit: (event, payload) => handlers.get(event)?.(payload),
  };
}

const resetStore = () =>
  useGameStore.setState({
    session: null,
    bomb: null,
    assignedChapterIds: null,
  });

describe('bindServerEvents — EXPERT_CHAPTER_ASSIGNMENT staleness guard (Story 9.1 review)', () => {
  beforeEach(resetStore);

  it('applies an assignment whose roundNumber matches the current round', () => {
    const { socket, emit } = fakeSocket();
    bindServerEvents(socket);
    useGameStore.setState({ session: makeSession({ status: 'active', roundNumber: 2 }) });
    emit('EXPERT_CHAPTER_ASSIGNMENT', {
      roundNumber: 2,
      chapterIds: ['wires', 'mazes'],
    } satisfies ExpertChapterAssignmentPayload);
    expect(useGameStore.getState().assignedChapterIds).toEqual(['wires', 'mazes']);
  });

  it('DROPS a stale assignment from a prior round', () => {
    const { socket, emit } = fakeSocket();
    bindServerEvents(socket);
    useGameStore.setState({ session: makeSession({ status: 'active', roundNumber: 2 }) });
    emit('EXPERT_CHAPTER_ASSIGNMENT', {
      roundNumber: 1,
      chapterIds: ['wires'],
    } satisfies ExpertChapterAssignmentPayload);
    expect(useGameStore.getState().assignedChapterIds).toBeNull();
  });

  it('applies when no session is loaded yet (SESSION_STATE always precedes in practice)', () => {
    const { socket, emit } = fakeSocket();
    bindServerEvents(socket);
    emit('EXPERT_CHAPTER_ASSIGNMENT', {
      roundNumber: 1,
      chapterIds: ['wires'],
    } satisfies ExpertChapterAssignmentPayload);
    expect(useGameStore.getState().assignedChapterIds).toEqual(['wires']);
  });

  it('a matching assignment after a stale one still lands (guard is per-payload, not sticky)', () => {
    const { socket, emit } = fakeSocket();
    bindServerEvents(socket);
    useGameStore.setState({ session: makeSession({ status: 'active', roundNumber: 3 }) });
    emit('EXPERT_CHAPTER_ASSIGNMENT', { roundNumber: 2, chapterIds: ['wires'] });
    emit('EXPERT_CHAPTER_ASSIGNMENT', { roundNumber: 3, chapterIds: ['mazes'] });
    expect(useGameStore.getState().assignedChapterIds).toEqual(['mazes']);
  });
});
