import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '@bomb-squad/shared';
import { sendLifeline } from '../sendLifeline.js';
import { useGameStore } from '../../store/gameStore.js';

/**
 * sendLifeline helper (Story 9.3, review 9.3 coverage): the panel test mocks this
 * helper, so the connected+session guard and the actual typed emit were otherwise
 * exercised by no client test. The wire carries ONLY the promptId — no free text,
 * no optimistic token decrement.
 */

const emit = vi.fn();

vi.mock('../socket.js', () => ({
  getSocket: () => ({ id: 'rotating-socket-id', emit }),
}));

beforeEach(() => {
  useGameStore.setState({
    connection: 'connected',
    session: { sessionId: 'sess-1' } as unknown as SessionState,
    lifelineTokens: 1,
  });
});

afterEach(() => {
  emit.mockClear();
  useGameStore.setState({ connection: 'disconnected', session: null, lifelineTokens: 0 });
  vi.restoreAllMocks();
});

describe('sendLifeline', () => {
  it('emits the typed LIFELINE_SEND with ONLY the promptId when connected + in a session', () => {
    sendLifeline('check-serial');
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('LIFELINE_SEND', { promptId: 'check-serial' });
  });

  it('does NOT optimistically decrement the local balance — the server echo owns it', () => {
    sendLifeline('on-track');
    expect(useGameStore.getState().lifelineTokens).toBe(1);
  });

  it.each([
    ['disconnected', { connection: 'disconnected' as const }],
    ['connecting', { connection: 'connecting' as const }],
    ['no session', { session: null }],
  ])('is a silent no-op when %s (dev harness never throws)', (_label, patch) => {
    useGameStore.setState(patch);
    sendLifeline('check-serial');
    expect(emit).not.toHaveBeenCalled();
  });
});
