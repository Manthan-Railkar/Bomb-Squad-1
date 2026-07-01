import type { PlayerInfo, SessionState, TeamId } from '@bomb-squad/shared';
import { resolveVoiceScope, VoiceScopeError } from '@bomb-squad/shared';
import type { VoiceStatus } from '../store/voiceStore.js';

/**
 * Pure decision logic for the re-mint-on-role-change reconciler (Story 3.5).
 *
 * The server is already correct and stateless: every `VOICE_TOKEN` request mints
 * a fresh token for the player's CURRENT authoritative role, and the client never
 * caches tokens. The only gap is client REACTION — nothing tears down and
 * reconnects when the player's effective voice scope changes mid-session (a
 * connected Bomb Room player reassigned to Spectator keeps the old publishing
 * connection while the UI merely relabels — the bug this story fixes).
 *
 * Kept pure (no store/hook/LiveKit imports beyond the shared scope helper) so the
 * full AC matrix is unit-testable with plain data.
 */

/** The local player's desired voice scope, derived from authoritative state. */
export interface DesiredVoiceScope {
  room: string;
  /** Mirrors the shared `canPublish` → the client's connect `publish` flag. */
  publish: boolean;
}

/** The voice connection as the store currently reflects it. */
export interface VoiceConnectionView {
  status: VoiceStatus;
  /** The connected LiveKit room (set on `connected`); undefined otherwise. */
  room?: string;
  /** Whether the current connection published the mic. */
  publishing: boolean;
}

export type VoiceAction =
  | { type: 'none' }
  | { type: 'reconnect'; publish: boolean }
  | { type: 'disconnect' };

const NONE: VoiceAction = { type: 'none' };

/**
 * Derive the local player's desired voice scope from authoritative session
 * state, or `null` when no re-mint-managed scope applies.
 *
 * Scoped DELIBERATELY to the two roles this client's voice UI manages — a Bomb
 * Room participant (defuser/expert with a team) and a Spectator — which is the
 * Bomb-Room↔Lounge boundary the facilitator's `TEAM_ASSIGN` crosses. Other roles
 * (facilitator, un-teamed) resolve to `null` → no auto re-mint; their voice is
 * owned by later stories.
 *
 * Story 3.7 threads `activeTeamId`: during a live round a Bomb-Room participant
 * whose team is NOT the active team RESTS and the shared helper now resolves them
 * to the Lounge. Because a resting player still has a team, the guard below keeps
 * treating them as a "Bomb Room participant" (managed) — the only difference is
 * the resolved room, so on the turn flip the desired room changes bomb-room↔
 * lounge and `computeVoiceAction` re-mints for it (this is the "3.7 rides 3.5 for
 * free" seam the 3.5 notes anticipated).
 */
export function deriveDesiredScope(
  self: PlayerInfo | undefined,
  status: SessionState['status'] | undefined,
  sessionId: string | undefined,
  activeTeamId: TeamId | undefined,
): DesiredVoiceScope | null {
  if (self === undefined || sessionId === undefined) return null;
  const isBombRoomParticipant =
    (self.role === 'defuser' || self.role === 'expert') && self.teamId !== undefined;
  const isSpectator = self.role === 'spectator';
  if (!isBombRoomParticipant && !isSpectator) return null;

  try {
    const scope = resolveVoiceScope({
      role: self.role,
      sessionId,
      teamId: self.teamId,
      phase: status,
      activeTeamId,
    });
    return { room: scope.room, publish: scope.canPublish };
  } catch (err) {
    // A teamless Bomb Room role outside the lobby throws VoiceScopeError — there
    // is no resolvable scope to re-mint to, so leave the connection as-is.
    if (err instanceof VoiceScopeError) return null;
    throw err;
  }
}

const DISCONNECT: VoiceAction = { type: 'disconnect' };

/**
 * Decide what to do with the voice connection given the current connection and
 * the desired scope. Acts ONLY once the user has opted in — status is `connected`
 * or `unavailable`-after-connect (AC #5: never auto-connect from `idle`; the
 * first connect still needs the gesture). `connecting` is left alone: the room
 * isn't known yet, so we cannot compare — the in-flight connect lands first, then
 * the next `connected` evaluation reconciles to the latest desired scope
 * (collapsing rapid SESSION_STATE bursts to the newest target, not each one).
 *
 * - **`desired === null`** (a role this client's voice UI does not manage —
 *   facilitator / un-teamed / self removed from the roster): TEAR DOWN. Leaving a
 *   connected — possibly still-publishing — connection alive in a room the player
 *   no longer belongs to is exactly the stale-scope leak this story targets
 *   (Story 3.5 review, finding 1). Not reachable via `TEAM_ASSIGN` today, but the
 *   relay's active↔resting routing (3.7) and roster removal can reach it.
 * - **`connected` with a resolvable desired scope**: re-mint (disconnect → fresh
 *   connect) only when the desired `{ room, publish }` actually DIFFERS from the
 *   connected one. Comparing the full tuple is what makes Defuser↔Expert on the
 *   same team a no-op (identical room + publish ⇒ no audio drop — AC #3) while
 *   Spectator↔Facilitator in the shared lounge (same room, different publish)
 *   still re-mints.
 * - **`unavailable` with a resolvable desired scope** (a post-connect failure —
 *   transport drop or a failed connect the user already gestured for): re-mint
 *   toward the desired scope (AC #5, Story 3.5 review finding 2), so a player
 *   reassigned WHILE unavailable is not stranded showing the old room's
 *   affordance. `unavailable` clears `room`/`publishing`, so a tuple compare
 *   cannot gate this — the caller (`useVoiceScopeSync`) holds a single-shot
 *   attempt guard so a re-mint that keeps failing does not storm.
 */
export function computeVoiceAction(
  conn: VoiceConnectionView,
  desired: DesiredVoiceScope | null,
): VoiceAction {
  // Only reconcile a connection the user has opted into and that has settled;
  // `idle` (never connected — AC #5) and `connecting` (room unknown) do nothing.
  if (conn.status !== 'connected' && conn.status !== 'unavailable') return NONE;

  // Managed scope disappeared → tear the stale connection down.
  if (desired === null) return DISCONNECT;

  if (conn.status === 'unavailable') return { type: 'reconnect', publish: desired.publish };

  // status === 'connected': re-mint only on an actual effective-scope change.
  if (conn.room === desired.room && conn.publishing === desired.publish) return NONE;
  return { type: 'reconnect', publish: desired.publish };
}
