import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { PlayerInfo, PlayerRole, SessionState, TeamId } from '@bomb-squad/shared';
import { useVoiceStore } from '../../store/voiceStore.js';
import { useVoiceScopeSync } from '../useVoiceScopeSync.js';

/**
 * Hook tests for the re-mint reconciler (Story 3.5). The pure decision is tested
 * in computeVoiceAction.test.ts; here we pin that the hook drives `reconnectVoice`
 * (FRESH token, no gesture) exactly when an effective-scope change warrants it,
 * and is inert otherwise. `reconnectVoice` is mocked — the real teardown→connect
 * + failure→unavailable semantics are covered in connectVoice.test.ts.
 */
const reconnectVoice = vi.fn(async (_opts?: { publish?: boolean }) => undefined);
const disconnectVoice = vi.fn(async () => undefined);
vi.mock('../connectVoice.js', () => ({
  connectVoice: async () => undefined,
  reconnectVoice: (opts?: { publish?: boolean }) => reconnectVoice(opts),
  disconnectVoice: () => disconnectVoice(),
}));

const SID = 'sess1';

function player(role: PlayerRole, teamId?: TeamId): PlayerInfo {
  return { playerId: 'self', displayName: 'Ada', role, teamId, isReady: false };
}
function session(role: PlayerRole, teamId?: TeamId, activeTeamId?: TeamId): SessionState {
  return {
    sessionId: SID,
    status: 'active',
    activeTeamId,
    players: { self: player(role, teamId) },
  } as unknown as SessionState;
}

/** Put the store into a connected state with a known room + publish intent. */
function setConnected(room: string, publishing: boolean) {
  useVoiceStore.setState({ status: 'connected', room, publishing });
}

beforeEach(() => {
  reconnectVoice.mockClear();
  disconnectVoice.mockClear();
  useVoiceStore.setState({ status: 'idle', room: undefined, publishing: false });
});

afterEach(() => {
  vi.restoreAllMocks();
  useVoiceStore.setState({ status: 'idle', room: undefined, publishing: false });
});

describe('useVoiceScopeSync', () => {
  it('connected Bomb Room → reassigned Spectator: reconnects to the lounge (AC #1/#2)', () => {
    setConnected('bomb-room:sess1:A', true);
    renderHook(() => useVoiceScopeSync(session('spectator'), 'self'));
    // Room changes bomb-room → lounge; lounge is bidirectional (publish true, 3.7).
    expect(reconnectVoice).toHaveBeenCalledWith({ publish: true });
  });

  it('connected Spectator → reassigned Defuser: reconnects publishing into the Bomb Room', () => {
    setConnected('spectator-lounge:sess1', false);
    renderHook(() => useVoiceScopeSync(session('defuser', 'A'), 'self'));
    expect(reconnectVoice).toHaveBeenCalledWith({ publish: true });
  });

  it('Defuser→Expert on the same team: NO reconnect (AC #3, same effective scope)', () => {
    setConnected('bomb-room:sess1:A', true);
    renderHook(() => useVoiceScopeSync(session('expert', 'A'), 'self'));
    expect(reconnectVoice).not.toHaveBeenCalled();
  });

  it('relay turn flip: an active-team Defuser becomes RESTING → reconnects to the lounge (Story 3.7 AC #4)', () => {
    // Connected in bomb-room:A as the active team; the turn flips so B is active.
    setConnected('bomb-room:sess1:A', true);
    renderHook(() => useVoiceScopeSync(session('defuser', 'A', 'B'), 'self'));
    expect(reconnectVoice).toHaveBeenCalledWith({ publish: true });
  });

  it('relay turn flip: a resting Defuser becomes ACTIVE → reconnects into its Bomb Room (Story 3.7 AC #4)', () => {
    // Connected in the lounge (resting); the turn flips so A is active again.
    setConnected('spectator-lounge:sess1', true);
    renderHook(() => useVoiceScopeSync(session('defuser', 'A', 'A'), 'self'));
    expect(reconnectVoice).toHaveBeenCalledWith({ publish: true });
  });

  it('does not reconnect when the connected scope already matches the desired one', () => {
    setConnected('bomb-room:sess1:A', true);
    renderHook(() => useVoiceScopeSync(session('defuser', 'A'), 'self'));
    expect(reconnectVoice).not.toHaveBeenCalled();
  });

  it('never auto-connects from idle even on a scope change (AC #5)', () => {
    // status stays idle (never connected) — a scope that WOULD differ if connected.
    renderHook(() => useVoiceScopeSync(session('spectator'), 'self'));
    expect(reconnectVoice).not.toHaveBeenCalled();
  });

  it('connected → promoted to an unmanaged role (facilitator): tears the stale connection down', () => {
    setConnected('bomb-room:sess1:A', true);
    renderHook(() => useVoiceScopeSync(session('facilitator'), 'self'));
    expect(reconnectVoice).not.toHaveBeenCalled();
    expect(disconnectVoice).toHaveBeenCalledTimes(1);
  });

  it('connected → self removed from the roster: tears the stale publishing connection down', () => {
    setConnected('bomb-room:sess1:A', true);
    // `self` is no longer in session.players → desired scope is null.
    const orphaned = { sessionId: SID, status: 'active', players: {} } as unknown as SessionState;
    renderHook(() => useVoiceScopeSync(orphaned, 'self'));
    expect(disconnectVoice).toHaveBeenCalledTimes(1);
    expect(reconnectVoice).not.toHaveBeenCalled();
  });

  it('reassigned WHILE unavailable: re-mints once toward the new scope, then does not storm (AC #5)', () => {
    // A post-connect drop left us unavailable; a scope change must still re-mint.
    useVoiceStore.setState({ status: 'unavailable', room: undefined, publishing: false });
    const { rerender } = renderHook(({ s }: { s: SessionState }) => useVoiceScopeSync(s, 'self'), {
      initialProps: { s: session('spectator') },
    });
    expect(reconnectVoice).toHaveBeenCalledTimes(1);
    expect(reconnectVoice).toHaveBeenLastCalledWith({ publish: true });

    // A re-render that keeps us unavailable toward the SAME scope must not re-fire
    // (single-shot guard — the failing re-mint churns status but does not loop).
    rerender({ s: session('spectator') });
    expect(reconnectVoice).toHaveBeenCalledTimes(1);
  });

  it('never re-mints from unavailable that never connected toward an idle scope change... still fires once (opted-in)', () => {
    // Even a first-connect failure means the user gestured (opted in) — a scope
    // change re-mints once toward the resolvable target (never auto-connects idle).
    useVoiceStore.setState({ status: 'unavailable', room: undefined, publishing: false });
    renderHook(() => useVoiceScopeSync(session('defuser', 'A'), 'self'));
    expect(reconnectVoice).toHaveBeenCalledTimes(1);
    expect(reconnectVoice).toHaveBeenLastCalledWith({ publish: true });
  });

  it('collapses to the latest desired scope across successive updates (no storm)', () => {
    setConnected('bomb-room:sess1:A', true);
    const { rerender } = renderHook(({ s }: { s: SessionState }) => useVoiceScopeSync(s, 'self'), {
      initialProps: { s: session('defuser', 'A') }, // identical scope → no reconnect
    });
    expect(reconnectVoice).not.toHaveBeenCalled();

    // Now a real scope change → exactly one reconnect to the new (spectator) scope.
    rerender({ s: session('spectator') });
    expect(reconnectVoice).toHaveBeenCalledTimes(1);
    expect(reconnectVoice).toHaveBeenLastCalledWith({ publish: true });

    // A rerender that does NOT change the desired scope must not re-fire.
    rerender({ s: session('spectator') });
    expect(reconnectVoice).toHaveBeenCalledTimes(1);
  });
});
