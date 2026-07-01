import { describe, expect, it } from '@jest/globals';
import {
  resolveVoiceScope,
  VoiceScopeError,
  bombRoomName,
  spectatorLoungeName,
  lobbyRoomName,
  parseBombRoomName,
  isBridgeIdentity,
  BRIDGE_IDENTITY_PREFIX,
  type PlayerRole,
  type SessionState,
  type TeamId,
} from '../index.js';

/**
 * Unit tests for the canonical voice-scope helper (Story 3.5, AR16: pure logic,
 * zero infra). This is the SINGLE source of truth the server token minting and
 * the client re-mint reconciler both derive from — so the table here is the
 * contract that keeps them from drifting. Story 3.7 made it relay-aware: the
 * resting team routes to the Lounge, and the lounge is bidirectional among its
 * members (spectator `canPublish: true`).
 */

const SID = 'sess1';

describe('resolveVoiceScope (shared)', () => {
  it('scopes a defuser to the team Bomb Room with publish + subscribe', () => {
    expect(resolveVoiceScope({ role: 'defuser', sessionId: SID, teamId: 'A' })).toEqual({
      room: 'bomb-room:sess1:A',
      canPublish: true,
      canSubscribe: true,
    });
  });

  it('scopes an expert to its team Bomb Room (distinct room per team)', () => {
    expect(resolveVoiceScope({ role: 'expert', sessionId: SID, teamId: 'B' }).room).toBe(
      'bomb-room:sess1:B',
    );
  });

  it('scopes a spectator to the Spectator Lounge WITH publish (bidirectional lounge, Story 3.7)', () => {
    expect(resolveVoiceScope({ role: 'spectator', sessionId: SID })).toEqual({
      room: 'spectator-lounge:sess1',
      canPublish: true,
      canSubscribe: true,
    });
  });

  it('scopes a facilitator to the Spectator Lounge WITH publish (host narration)', () => {
    expect(resolveVoiceScope({ role: 'facilitator', sessionId: SID })).toEqual({
      room: 'spectator-lounge:sess1',
      canPublish: true,
      canSubscribe: true,
    });
  });

  it('does not require a teamId for a facilitator (lounge-scoped, never throws)', () => {
    expect(() => resolveVoiceScope({ role: 'facilitator', sessionId: SID })).not.toThrow();
  });

  it('throws VoiceScopeError for a Bomb Room role with no team (outside the lobby)', () => {
    expect(() => resolveVoiceScope({ role: 'defuser', sessionId: SID })).toThrow(VoiceScopeError);
    expect(() => resolveVoiceScope({ role: 'expert', sessionId: SID })).toThrow(VoiceScopeError);
  });

  // ── Lobby mic-check phase (Story 2.5) ──────────────────────────────────────
  it('lobby phase scopes EVERY role to the shared lobby room with publish', () => {
    const roles: PlayerRole[] = ['defuser', 'expert', 'spectator', 'facilitator'];
    for (const role of roles) {
      // No teamId even for a Bomb Room role — the lobby branch precedes the team check.
      expect(resolveVoiceScope({ role, sessionId: SID, phase: 'lobby' })).toEqual({
        room: 'lobby:sess1',
        canPublish: true,
        canSubscribe: true,
      });
    }
  });

  it('the SAME spectator stays in the (now bidirectional) lounge outside the lobby', () => {
    const phases: SessionState['status'][] = ['preparation', 'active', 'between-rounds', 'ended'];
    for (const phase of phases) {
      const scope = resolveVoiceScope({ role: 'spectator', sessionId: SID, phase });
      expect(scope.room).toBe('spectator-lounge:sess1');
      expect(scope.canPublish).toBe(true);
    }
  });

  // ── Effective-scope nuance (Story 3.5 AC #3) ───────────────────────────────
  it('Defuser and Expert on the SAME team resolve to an IDENTICAL scope (no re-mint trigger)', () => {
    const teamId: TeamId = 'A';
    const def = resolveVoiceScope({ role: 'defuser', sessionId: SID, teamId, phase: 'active' });
    const exp = resolveVoiceScope({ role: 'expert', sessionId: SID, teamId, phase: 'active' });
    expect(def).toEqual(exp);
  });

  it('Defuser→Spectator is a real scope CHANGE (room differs; both publish post-3.7)', () => {
    const def = resolveVoiceScope({ role: 'defuser', sessionId: SID, teamId: 'A', phase: 'active' });
    const spec = resolveVoiceScope({ role: 'spectator', sessionId: SID, phase: 'active' });
    expect(def.room).not.toBe(spec.room); // bomb-room → lounge is the re-mint trigger
    expect(def.canPublish).toBe(true);
    expect(spec.canPublish).toBe(true); // lounge is bidirectional now (Story 3.7)
  });

  // ── Relay-aware resting-team routing (Story 3.7) ───────────────────────────
  it('an ACTIVE-team defuser/expert stays in its own Bomb Room during a live round', () => {
    for (const phase of ['preparation', 'active'] as const) {
      const scope = resolveVoiceScope({
        role: 'defuser',
        sessionId: SID,
        teamId: 'A',
        phase,
        activeTeamId: 'A',
      });
      expect(scope).toEqual({ room: 'bomb-room:sess1:A', canPublish: true, canSubscribe: true });
    }
  });

  it('a RESTING-team defuser/expert routes to the Lounge (audience) during a live round', () => {
    for (const role of ['defuser', 'expert'] as const) {
      for (const phase of ['preparation', 'active'] as const) {
        const scope = resolveVoiceScope({
          role,
          sessionId: SID,
          teamId: 'B',
          phase,
          activeTeamId: 'A',
        });
        expect(scope).toEqual({
          room: 'spectator-lounge:sess1',
          canPublish: true,
          canSubscribe: true,
        });
      }
    }
  });

  it('with NO active team (between-rounds/ended) a Bomb-Room role keeps its own room', () => {
    for (const phase of ['between-rounds', 'ended'] as const) {
      const scope = resolveVoiceScope({
        role: 'defuser',
        sessionId: SID,
        teamId: 'B',
        phase,
        // activeTeamId intentionally undefined — no relay routing off a live round
      });
      expect(scope.room).toBe('bomb-room:sess1:B');
    }
  });

  it('a resting Bomb-Room role with no teamId still throws (contract preserved)', () => {
    expect(() =>
      resolveVoiceScope({ role: 'defuser', sessionId: SID, phase: 'active', activeTeamId: 'A' }),
    ).toThrow(VoiceScopeError);
  });
});

describe('room-name builders', () => {
  it('build the documented room names', () => {
    expect(bombRoomName('s', 'A')).toBe('bomb-room:s:A');
    expect(spectatorLoungeName('s')).toBe('spectator-lounge:s');
    expect(lobbyRoomName('s')).toBe('lobby:s');
  });
});

describe('parseBombRoomName (inverse of bombRoomName)', () => {
  it('round-trips a built Bomb Room name', () => {
    for (const teamId of ['A', 'B'] as const) {
      const room = bombRoomName(SID, teamId);
      expect(parseBombRoomName(room)).toEqual({ sessionId: SID, teamId });
    }
  });

  it('round-trips a sessionId that itself contains a colon (teamId = last segment)', () => {
    expect(parseBombRoomName('bomb-room:sess:1:A')).toEqual({ sessionId: 'sess:1', teamId: 'A' });
  });

  it('returns null for the lounge / lobby / arbitrary strings', () => {
    expect(parseBombRoomName(spectatorLoungeName(SID))).toBeNull();
    expect(parseBombRoomName(lobbyRoomName(SID))).toBeNull();
    expect(parseBombRoomName('nonsense')).toBeNull();
  });

  it('returns null for a non-A/B team segment or an empty sessionId', () => {
    expect(parseBombRoomName('bomb-room:sess1:C')).toBeNull();
    expect(parseBombRoomName('bomb-room:sess1:')).toBeNull();
    expect(parseBombRoomName('bomb-room::A')).toBeNull();
  });
});

describe('isBridgeIdentity (Story 3.7 audio-relay bot)', () => {
  it('matches the relay bot sub/pub identities', () => {
    expect(isBridgeIdentity(`${BRIDGE_IDENTITY_PREFIX}-sub:sess1`)).toBe(true);
    expect(isBridgeIdentity(`${BRIDGE_IDENTITY_PREFIX}-pub:sess1`)).toBe(true);
  });

  it('does NOT match a normal durable playerId', () => {
    expect(isBridgeIdentity('player-abc123')).toBe(false);
    expect(isBridgeIdentity('bridgekeeper')).toBe(false); // no leading '#'
  });
});
