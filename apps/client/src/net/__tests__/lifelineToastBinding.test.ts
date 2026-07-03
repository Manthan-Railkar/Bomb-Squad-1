import { describe, expect, it, beforeEach } from 'vitest';
import type { LifelineToastPayload } from '@bomb-squad/shared';
import { useGameStore } from '../../store/gameStore.js';
import { bindServerEvents } from '../bindServerEvents.js';
import type { AppClientSocket } from '../socket.js';

/**
 * Story 9.3 (Task 5): the LIFELINE_TOAST binding used to be a `console.info`
 * stub — assert it now enqueues the toast into the store (the overlay renders it).
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

beforeEach(() => {
  useGameStore.setState({ lifelineToasts: [], lifelineToastSeq: 0 });
});

describe('bindServerEvents — LIFELINE_TOAST (Story 9.3)', () => {
  it('pushes the toast to the store (no longer a console.info stub)', () => {
    const { socket, emit } = fakeSocket();
    bindServerEvents(socket);
    emit('LIFELINE_TOAST', {
      promptId: 'check-serial',
      fromName: 'Sam',
    } satisfies LifelineToastPayload);
    expect(useGameStore.getState().lifelineToasts).toEqual([
      { id: 'lt-1', promptId: 'check-serial', fromName: 'Sam' },
    ]);
  });
});
