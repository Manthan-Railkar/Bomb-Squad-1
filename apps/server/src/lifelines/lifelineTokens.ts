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
 * Clamp a stored map value to a sane token count (review 9.2). The map shares a
 * key with every writer, so a corrupt/foreign value (a string, NaN, a negative,
 * an over-cap number) must never propagate into arithmetic, an emit, or the
 * client counter. Fail-closed: anything that is not a non-negative integer ⇒ 0;
 * an over-cap integer ⇒ the cap.
 */
function sanitizeCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? Math.min(value, MAX_LIFELINE_TOKENS)
    : 0;
}

/**
 * Read one player's current token count. Fail-closed: an absent key, a null map,
 * an unknown playerId, or a corrupt stored value all resolve to a sane count in
 * `[0, MAX_LIFELINE_TOKENS]` — never a throw. O(1) single-key read.
 */
export async function getTokens(
  redis: RedisStore,
  sessionId: string,
  playerId: string,
): Promise<number> {
  const map = await redis.getJSON<LifelineMap>(lifelinesKey(sessionId));
  return sanitizeCount(map?.[playerId]);
}

/**
 * Grant one token to a player, clamped to `MAX_LIFELINE_TOKENS`. Race-safe via
 * `updateJSON` CAS: loads the map (null ⇒ `{}`), computes
 * `next = min(cap, sanitize(map[playerId]) + 1)`, commits `{ ...map, [playerId]: next }`.
 * A player already at the cap commits the cap again (idempotent at the ceiling —
 * no overflow, no error). Returns the player's new (possibly-clamped) `count`
 * plus `minted` — whether this grant actually added a token (false when clamped),
 * so the caller's log can report tokens persisted, never merely earners processed.
 */
export async function grantToken(
  redis: RedisStore,
  sessionId: string,
  playerId: string,
): Promise<{ count: number; minted: boolean }> {
  const { result } = await redis.updateJSON<LifelineMap, { count: number; minted: boolean }>(
    lifelinesKey(sessionId),
    (current) => {
      const map = current ?? {};
      const held = sanitizeCount(map[playerId]);
      const next = Math.min(MAX_LIFELINE_TOKENS, held + 1);
      return {
        commit: true,
        value: { ...map, [playerId]: next },
        result: { count: next, minted: next > held },
      };
    },
  );
  return result;
}

/**
 * Spend one token for a player (Story 9.3). Race-safe via `updateJSON` CAS on the
 * SAME shared map key a concurrent 9.2 grant may touch.
 *
 * Fail-closed + never-negative: loads the map (null ⇒ `{}`), reads
 * `current = map[playerId] ?? 0`. If `current < 1` it commits NOTHING (AC-3: a
 * 0-token spend leaves the map byte-for-byte unchanged — no negative balance, no
 * phantom key) and returns `{ ok: false, count: current }`. Otherwise it commits
 * `{ ...map, [playerId]: current - 1 }` and returns `{ ok: true, count: current - 1 }`.
 *
 * The guard runs inside the pure `mutate`, so on a CAS retry it is always
 * re-evaluated against the freshly committed state — a token granted (or spent)
 * concurrently can never drive this below 0 or lose the other side's write.
 */
export async function spendToken(
  redis: RedisStore,
  sessionId: string,
  playerId: string,
): Promise<{ ok: boolean; count: number }> {
  const { result } = await redis.updateJSON<LifelineMap, { ok: boolean; count: number }>(
    lifelinesKey(sessionId),
    (current) => {
      const map = current ?? {};
      const held = sanitizeCount(map[playerId]);
      if (held < 1) {
        // AC-3: no deduction, no state change, never negative — commit nothing.
        return { commit: false, result: { ok: false, count: held } };
      }
      const next = held - 1;
      return { commit: true, value: { ...map, [playerId]: next }, result: { ok: true, count: next } };
    },
  );
  return result;
}
