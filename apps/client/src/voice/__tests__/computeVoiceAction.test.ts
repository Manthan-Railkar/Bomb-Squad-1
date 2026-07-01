import { describe, expect, it } from 'vitest';
import type { PlayerInfo, PlayerRole, TeamId } from '@bomb-squad/shared';
import {
  computeVoiceAction,
  deriveDesiredScope,
  type VoiceConnectionView,
} from '../computeVoiceAction.js';

/**
 * Pure decision tests for the re-mint reconciler (Story 3.5). The AC matrix:
 *  - Bomb-Room→Spectator while connected ⇒ reconnect listen-only to the lounge (AC #1/#2)
 *  - Defuser→Expert same team while connected ⇒ NO reconnect (AC #3, same effective scope)
 *  - any scope change while idle ⇒ NO action (AC #5, never auto-connect)
 * Zero infra — plain data in, a `VoiceAction` out.
 */

const SID = 'sess1';

function self(role: PlayerRole, teamId?: TeamId): PlayerInfo {
  return { playerId: 'self', displayName: 'Ada', role, teamId, isReady: false };
}

describe('deriveDesiredScope', () => {
  it('maps a defuser with a team to the Bomb Room (publish)', () => {
    expect(deriveDesiredScope(self('defuser', 'A'), 'active', SID)).toEqual({
      room: 'bomb-room:sess1:A',
      publish: true,
    });
  });

  it('maps a spectator to the listen-only lounge (no publish)', () => {
    expect(deriveDesiredScope(self('spectator'), 'active', SID)).toEqual({
      room: 'spectator-lounge:sess1',
      publish: false,
    });
  });

  it('returns null for roles this voice UI does not manage (facilitator)', () => {
    expect(deriveDesiredScope(self('facilitator'), 'active', SID)).toBeNull();
  });

  it('returns null for a teamless Bomb Room role outside the lobby (no resolvable scope)', () => {
    // defuser with no teamId, non-lobby phase → shared helper throws → null.
    expect(deriveDesiredScope(self('defuser'), 'active', SID)).toBeNull();
  });

  it('returns null when self/sessionId are absent', () => {
    expect(deriveDesiredScope(undefined, 'active', SID)).toBeNull();
    expect(deriveDesiredScope(self('defuser', 'A'), 'active', undefined)).toBeNull();
  });

  it('Defuser and Expert on the same team derive the SAME desired scope', () => {
    expect(deriveDesiredScope(self('defuser', 'A'), 'active', SID)).toEqual(
      deriveDesiredScope(self('expert', 'A'), 'active', SID),
    );
  });
});

describe('computeVoiceAction', () => {
  const connectedBombRoom: VoiceConnectionView = {
    status: 'connected',
    room: 'bomb-room:sess1:A',
    publishing: true,
  };

  it('Bomb-Room→Spectator while connected ⇒ reconnect listen-only to the lounge (AC #1/#2)', () => {
    const desired = deriveDesiredScope(self('spectator'), 'active', SID);
    expect(computeVoiceAction(connectedBombRoom, desired)).toEqual({
      type: 'reconnect',
      publish: false,
    });
  });

  it('Defuser→Expert same team while connected ⇒ NO reconnect (AC #3)', () => {
    // Connected as the Defuser; role relabeled to Expert — identical scope.
    const desired = deriveDesiredScope(self('expert', 'A'), 'active', SID);
    expect(computeVoiceAction(connectedBombRoom, desired)).toEqual({ type: 'none' });
  });

  it('Spectator→Defuser while connected ⇒ reconnect publishing into the Bomb Room', () => {
    const connectedLounge: VoiceConnectionView = {
      status: 'connected',
      room: 'spectator-lounge:sess1',
      publishing: false,
    };
    const desired = deriveDesiredScope(self('defuser', 'A'), 'active', SID);
    expect(computeVoiceAction(connectedLounge, desired)).toEqual({
      type: 'reconnect',
      publish: true,
    });
  });

  it('a same-room publish-rights change (lounge listen-only → publish) re-mints', () => {
    // Same room, different publish — the tuple comparison (not room alone) catches it.
    const connectedLoungeListen: VoiceConnectionView = {
      status: 'connected',
      room: 'spectator-lounge:sess1',
      publishing: false,
    };
    expect(
      computeVoiceAction(connectedLoungeListen, {
        room: 'spectator-lounge:sess1',
        publish: true,
      }),
    ).toEqual({ type: 'reconnect', publish: true });
  });

  it('an unchanged scope while connected ⇒ NO reconnect (no audio drop)', () => {
    expect(
      computeVoiceAction(connectedBombRoom, { room: 'bomb-room:sess1:A', publish: true }),
    ).toEqual({ type: 'none' });
  });

  it('any scope change while idle ⇒ NO action (AC #5 — never auto-connect)', () => {
    const idle: VoiceConnectionView = { status: 'idle', publishing: false };
    const desired = deriveDesiredScope(self('spectator'), 'active', SID);
    expect(computeVoiceAction(idle, desired)).toEqual({ type: 'none' });
  });

  it('does NOT act while connecting (room not yet known — reconcile after connected)', () => {
    const connecting: VoiceConnectionView = { status: 'connecting', publishing: false };
    const desired = deriveDesiredScope(self('spectator'), 'active', SID);
    expect(computeVoiceAction(connecting, desired)).toEqual({ type: 'none' });
  });

  it('re-mints from unavailable-after-connect toward the current desired scope (AC #5)', () => {
    // A post-connect failure (drop / failed connect the user gestured for) clears
    // room/publishing; a scope change while unavailable must still land the player
    // in the new scope, not strand them on the old room's affordance. The hook's
    // single-shot guard (not this pure fn) prevents a retry storm.
    const unavailable: VoiceConnectionView = { status: 'unavailable', publishing: false };
    const desired = deriveDesiredScope(self('spectator'), 'active', SID);
    expect(computeVoiceAction(unavailable, desired)).toEqual({ type: 'reconnect', publish: false });
  });

  it('no desired scope (unmanaged role) while connected ⇒ TEAR DOWN the stale connection', () => {
    // Leaving a connected, possibly-publishing connection alive in a room the
    // player no longer belongs to is the stale-scope leak this story targets.
    expect(computeVoiceAction(connectedBombRoom, null)).toEqual({ type: 'disconnect' });
  });

  it('no desired scope while unavailable ⇒ tear down (no lingering kept-alive room)', () => {
    const unavailable: VoiceConnectionView = { status: 'unavailable', publishing: false };
    expect(computeVoiceAction(unavailable, null)).toEqual({ type: 'disconnect' });
  });

  it('no desired scope while idle/connecting ⇒ NO action (nothing to tear down)', () => {
    expect(computeVoiceAction({ status: 'idle', publishing: false }, null)).toEqual({
      type: 'none',
    });
    expect(computeVoiceAction({ status: 'connecting', publishing: false }, null)).toEqual({
      type: 'none',
    });
  });
});
