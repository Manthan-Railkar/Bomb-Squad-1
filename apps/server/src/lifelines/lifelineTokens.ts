/**
 * Spectator lifeline token map helpers (Story 9.2).
 *
 * Wraps the per-session token map stored at `lifelinesKey(sessionId)` =
 * `session:{id}:lifelines`. The stored value is `Record<playerId, number>`
 * (playerId → held token count). An absent key ⇒ `{}` ⇒ everyone at 0.
 *
 * This map is a SINGLE shared key, so a grant (this story) and a Story-9.3 spend
 * can race on it. Every mutation therefore goes through `redis.updateJSON` — the
 * WATCH/MULTI compare-and-set primitive — NOT bare getJSON+setJSON, so no update
 * is ever lost. The `identity.ts` reattach pair can use plain get/set only because
 * it writes DISTINCT per-player keys; a shared map needs CAS.
 *
 * The map is Redis-only, ephemeral — it dies with the session and is never
 * archived to Postgres (no AC requires token history).
 */
import { MAX_LIFELINE_TOKENS } from '@bomb-squad/shared';
import type { RedisStore } from '../state/redis.js';
import { lifelinesKey } from '../state/keys.js';

/** The stored shape at `lifelinesKey`: playerId → held token count. */
type LifelineMap = Record<string, number>;

/**
 * Read one player's current token count. Fail-closed: an absent key, a null map,
 * or an unknown playerId all return 0 — never a throw. O(1) single-key read.
 */
export async function getTokens(
  redis: RedisStore,
  sessionId: string,
  playerId: string,
): Promise<number> {
  const map = await redis.getJSON<LifelineMap>(lifelinesKey(sessionId));
  return map?.[playerId] ?? 0;
}

/**
 * Grant one token to a player, clamped to `MAX_LIFELINE_TOKENS`. Race-safe via
 * `updateJSON` CAS: loads the map (null ⇒ `{}`), computes
 * `next = min(cap, (map[playerId] ?? 0) + 1)`, commits `{ ...map, [playerId]: next }`,
 * and returns `next`. A player already at the cap commits the cap again
 * (idempotent at the ceiling — no overflow, no error). Returns the player's new
 * (possibly-clamped) count.
 */
export async function grantToken(
  redis: RedisStore,
  sessionId: string,
  playerId: string,
): Promise<number> {
  const { result } = await redis.updateJSON<LifelineMap, number>(
    lifelinesKey(sessionId),
    (current) => {
      const map = current ?? {};
      const next = Math.min(MAX_LIFELINE_TOKENS, (map[playerId] ?? 0) + 1);
      return { commit: true, value: { ...map, [playerId]: next }, result: next };
    },
  );
  return result;
}

// Story 9.3 will add `spendToken` here — same `updateJSON` CAS pattern,
// decrement, reject-at-0. Do NOT implement spend in this story.
