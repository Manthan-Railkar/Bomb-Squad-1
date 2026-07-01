/**
 * Canonical voice-scope derivation (Story 3.5).
 *
 * The SINGLE source of truth for "which LiveKit room + what publish/subscribe
 * rights does a participant get". The server (token minting) and the client
 * (the re-mint-on-role-change reconciler) BOTH derive scope from here, so they
 * can never drift on the voice topology — the same "client/server can't drift"
 * lesson that moved the relay predicates into shared (Story 8.9).
 *
 * Pure TypeScript returning plain data: NO `livekit-server-sdk`, NO `react`, NO
 * `socket.io`. The server shapes this into a `VideoGrant` (adding `roomJoin`);
 * the client maps `canPublish` → its connect `publish` flag.
 */
import type { PlayerRole, SessionState, TeamId } from '../types/index.js';

/**
 * Roles that belong in a team's bidirectional Bomb Room (AR12). The facilitator
 * is deliberately NOT here: their baseline room is the Spectator Lounge (see
 * {@link resolveVoiceScope}). Their on-demand push-to-talk INTO a team's Bomb
 * Room is a separate mechanism handled by a later story.
 */
const BOMB_ROOM_ROLES: ReadonlySet<PlayerRole> = new Set<PlayerRole>([
  'defuser',
  'expert',
]);

/**
 * Raised when a participant cannot be scoped to a room (e.g. a Bomb Room role
 * with no team assigned, outside the lobby). The server's voiceHandlers guard
 * catches this and acks an error rather than minting a malformed token; the
 * client's scope-sync treats it as "no resolvable scope" → no re-mint.
 *
 * Defined HERE (shared) so the `instanceof` check works regardless of whether
 * the throw originates client- or server-side; the server re-exports it for
 * backward compatibility with existing import sites.
 */
export class VoiceScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VoiceScopeError';
  }
}

/** LiveKit room name for a team's Bomb Room (bidirectional). */
export const bombRoomName = (sessionId: string, teamId: TeamId): string =>
  `bomb-room:${sessionId}:${teamId}`;

/** LiveKit room name for the session's Spectator Lounge (listen-only). */
export const spectatorLoungeName = (sessionId: string): string =>
  `spectator-lounge:${sessionId}`;

/** LiveKit room name for the session's pre-game lobby mic check (Story 2.5).
 * A single shared, bidirectional room every participant joins while the session
 * is in `lobby` status. */
export const lobbyRoomName = (sessionId: string): string => `lobby:${sessionId}`;

/**
 * Identity prefix for the Story 3.7 audio-relay bot's participants. The bot joins
 * the active Bomb Room (listen-only) AND the lounge (publish-only) under
 * `#bridge-*` identities to carry Bomb Room audio one-way into the lounge. It is
 * infrastructure, not a player — clients filter these out of roster / speaker
 * displays via {@link isBridgeIdentity}. Defined in shared so the server bot and
 * the client agree on the one prefix.
 */
export const BRIDGE_IDENTITY_PREFIX = '#bridge';

/** True if a LiveKit participant identity belongs to the audio-relay bot (Story 3.7). */
export const isBridgeIdentity = (identity: string): boolean =>
  identity.startsWith(BRIDGE_IDENTITY_PREFIX);

/**
 * Parse a Bomb Room room name back into its parts, or `null` if the string is
 * not a Bomb Room name. The inverse of {@link bombRoomName} — defined HERE, next
 * to the builder, so the LiveKit-webhook route (server) and the builder can
 * never drift on the `bomb-room:{sessionId}:{teamId}` format (Story 3.7).
 *
 * The `teamId` is the LAST colon-delimited segment (always `'A'`/`'B'`); the
 * `sessionId` is everything between the `bomb-room:` prefix and that final
 * segment (so a session id containing a colon still round-trips).
 */
export function parseBombRoomName(
  room: string,
): { sessionId: string; teamId: TeamId } | null {
  const prefix = 'bomb-room:';
  if (!room.startsWith(prefix)) return null;
  const rest = room.slice(prefix.length);
  const lastColon = rest.lastIndexOf(':');
  if (lastColon <= 0) return null; // need a non-empty sessionId before the team segment
  const sessionId = rest.slice(0, lastColon);
  const teamSegment = rest.slice(lastColon + 1);
  if (teamSegment !== 'A' && teamSegment !== 'B') return null;
  return { sessionId, teamId: teamSegment };
}

export interface VoiceScopeParticipant {
  role: PlayerRole;
  sessionId: string;
  /** Required for Bomb Room roles outside the lobby; absent for spectators. */
  teamId?: TeamId;
  /**
   * Current session phase (Story 2.5). When `'lobby'`, EVERY participant is
   * scoped to the shared lobby mic-check room regardless of role/team. Absent or
   * any other phase keeps the role-scoped routing.
   */
  phase?: SessionState['status'];
  /**
   * The team whose bomb is live this round (Story 3.7 relay routing). During a
   * live round (`phase` `'preparation'`/`'active'`) a Bomb-Room role whose
   * `teamId` is NOT this active team is RESTING and routes to the Lounge instead
   * of its own (now-silent) Bomb Room. Absent ⇒ no relay routing (lobby /
   * between-rounds / ended keep the per-team Bomb Room).
   */
  activeTeamId?: TeamId;
}

/** The pure scope a participant resolves to: a single room + its grant flags.
 * The server adds `roomJoin: true` when shaping the LiveKit `VideoGrant`. */
export interface VoiceScope {
  room: string;
  canPublish: boolean;
  canSubscribe: boolean;
}

/**
 * Resolve a participant's single room + grant flags from their role/team/phase.
 * Pure and total over valid inputs; throws {@link VoiceScopeError} for the one
 * unrepresentable case (a Bomb Room role with no team, outside the lobby).
 *
 * - `phase === 'lobby'` → shared `lobby:{sessionId}`, `canPublish: true` for
 *   EVERYONE (mic check, Story 2.5).
 * - spectator → `spectator-lounge:{sessionId}`, `canPublish: true` (Story 3.7:
 *   the lounge is bidirectional AMONG its members; FR39 "listen-only" means
 *   "never publish INTO a Bomb Room", NOT "never publish at all").
 * - facilitator → `spectator-lounge:{sessionId}`, `canPublish: true` (narration).
 * - defuser / expert on the ACTIVE team (or with no live round) →
 *   `bomb-room:{sessionId}:{teamId}`, `canPublish: true`.
 * - defuser / expert on the RESTING team during a live round (`activeTeamId`
 *   set, `teamId !== activeTeamId`) → `spectator-lounge:{sessionId}`,
 *   `canPublish: true` (Story 3.7: the resting team becomes an audience).
 */
export function resolveVoiceScope(participant: VoiceScopeParticipant): VoiceScope {
  const { role, sessionId, teamId, phase, activeTeamId } = participant;

  // Lobby mic check (Story 2.5): while in `lobby` status EVERY participant shares
  // one bidirectional room. Runs BEFORE the role checks so an un-teamed Bomb Room
  // role in the lobby does not throw — in the lobby they belong in the lobby room
  // regardless of team.
  if (phase === 'lobby') {
    return { room: lobbyRoomName(sessionId), canPublish: true, canSubscribe: true };
  }

  // Spectators and the facilitator share the Spectator Lounge. The lounge is
  // BIDIRECTIONAL among its members (Story 3.7, Jay decision 2026-07-01): both
  // may publish so spectators, resting-team players and the facilitator can talk
  // to each other. The one-way boundary (nothing said here reaches a Bomb Room)
  // is STRUCTURAL — no lounge member is ever in a Bomb Room, and the audio bridge
  // only forwards Bomb Room → Lounge, never the reverse. So `canPublish: true`
  // here is safe; do NOT "fix" it back to listen-only (that was the pre-3.7 grant
  // when the lounge had no one to talk to).
  if (role === 'spectator' || role === 'facilitator') {
    return { room: spectatorLoungeName(sessionId), canPublish: true, canSubscribe: true };
  }

  if (BOMB_ROOM_ROLES.has(role)) {
    if (teamId === undefined) {
      throw new VoiceScopeError(`Bomb Room role "${role}" has no team assigned`);
    }
    // Relay-aware routing (Story 3.7): during a live round only ONE team's bomb
    // is armed (Story 8.11). A Bomb-Room role whose team is NOT the active team
    // is RESTING this turn — route them to the Lounge as an audience (they hear
    // the active team's bomb via the server-side bridge and can talk in the
    // lounge), never their own now-silent Bomb Room. Off a live round
    // (`activeTeamId` undefined — lobby handled above / between-rounds / ended)
    // teams regroup in their own Bomb Room. Story 3.5's re-mint reconciler moves
    // players between these on the turn flip because the resolved room changes.
    if (
      (phase === 'preparation' || phase === 'active') &&
      activeTeamId !== undefined &&
      teamId !== activeTeamId
    ) {
      return { room: spectatorLoungeName(sessionId), canPublish: true, canSubscribe: true };
    }
    return { room: bombRoomName(sessionId, teamId), canPublish: true, canSubscribe: true };
  }

  // Defensive: PlayerRole is a closed union, so this is unreachable today, but a
  // future role must opt into a scope explicitly rather than default-publish.
  throw new VoiceScopeError(`role "${role}" has no voice scope`);
}
