/** Single source of truth for the Redis keyspace. All key segments join with `:`. */

export const sessionKey = (sessionId: string): string =>
  `session:${sessionId}`;

export const roundKey = (sessionId: string, roundNumber: number): string =>
  `session:${sessionId}:round:${roundNumber}`;

export const bombKey = (sessionId: string, teamId: string): string =>
  `session:${sessionId}:team:${teamId}:bomb`;

export const timerKey = (sessionId: string, teamId: string): string =>
  `session:${sessionId}:team:${teamId}:timer`;

export const rolesKey = (sessionId: string): string =>
  `session:${sessionId}:roles`;

export const lifelinesKey = (sessionId: string): string =>
  `session:${sessionId}:lifelines`;

/**
 * Per-Expert manual positions for the session (Story 9.4 multiview). Value: JSON
 * `Record<playerId, chapterId>` — one entry per active-team Expert, MERGED on each
 * navigation (NOT last-write-wins). Story 5.2 wrote a single `{ chapterId, playerId }`
 * object here; 9.4 replaced it with a map so a mid-round-joining spectator can be
 * replayed EVERY Expert's current page (one `EXPERT_MANUAL_POSITION` per entry), not
 * just the last one. Cleared at ROUND_START so last round's pages don't bleed into
 * a new round. Small O(1) single-key read/write per navigation.
 */
export const manualPositionKey = (sessionId: string): string =>
  `session:${sessionId}:manualPosition`;

/** Join-code → sessionId lookup (value: the sessionId string, stored as JSON). */
export const joinCodeKey = (joinCode: string): string =>
  `joincode:${joinCode}`;

/**
 * Reattach record (Story 2.7): a secret-token → durable identity mapping.
 * Value: JSON `{ playerId, displayName, role }`. The token is the reconnect
 * credential (never broadcast, never logged); this key is the only place that
 * resolves it back to the durable `playerId`. O(1) single-key lookup.
 */
export const reattachKey = (sessionId: string, reattachToken: string): string =>
  `reattach:${sessionId}:${reattachToken}`;

/**
 * Companion lookup (Story 2.7): durable `playerId` → its reattach token (value:
 * the token string, stored as JSON). Lets PLAYER_REMOVE invalidate a kicked
 * player's token without a reverse scan — the handler knows the playerId, not
 * the secret token. O(1).
 */
export const reattachByPlayerKey = (sessionId: string, playerId: string): string =>
  `reattachByPlayer:${sessionId}:${playerId}`;
