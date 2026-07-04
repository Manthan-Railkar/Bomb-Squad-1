import { describe, expect, it } from '@jest/globals';
import { isSessionFacilitator } from '../facilitator.js';
import type { SessionState } from '../../types/index.js';

/** Minimal SessionState carrying only the field under test. */
function session(facilitatorPlayerId?: string): SessionState {
  return {
    sessionId: 's',
    joinCode: 'ABC123',
    status: 'lobby',
    config: { timerMs: 300_000 } as SessionState['config'],
    players: {},
    teams: {},
    roundNumber: 0,
    pausedAt: null,
    pauseKind: null,
    disconnectedPlayerIds: [],
    facilitatorPlayerId,
  };
}

describe('isSessionFacilitator (Story 9.5, FR48)', () => {
  it('matches the exact facilitator player id', () => {
    expect(isSessionFacilitator(session('fac-1'), 'fac-1')).toBe(true);
  });

  it('rejects a non-matching player id', () => {
    expect(isSessionFacilitator(session('fac-1'), 'player-2')).toBe(false);
  });

  it('fail-closed: null playerId is never the facilitator', () => {
    expect(isSessionFacilitator(session('fac-1'), null)).toBe(false);
  });

  it('fail-closed: undefined playerId is never the facilitator', () => {
    expect(isSessionFacilitator(session('fac-1'), undefined)).toBe(false);
  });

  it('fail-closed: a session missing the field grants authority to nobody', () => {
    // A pre-9.5 in-flight snapshot without facilitatorPlayerId locks authority.
    expect(isSessionFacilitator(session(undefined), 'fac-1')).toBe(false);
  });

  it('fail-closed: an empty-string id on both sides is not a match', () => {
    // Guards against a mis-seeded blank id silently authorising a blank-id caller.
    expect(isSessionFacilitator(session(''), '')).toBe(false);
  });
});
