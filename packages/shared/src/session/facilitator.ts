import type { SessionState } from '../types/session.js';

/**
 * The single predicate for "does this player hold Facilitator session authority"
 * (Story 9.5, FR48). Used on BOTH server and client — one predicate, zero drift
 * (the 2.7 identity-key lesson: server gates and client self-identification must
 * move together, or the client silently mis-identifies).
 *
 * Authority is keyed on the durable player id against `state.facilitatorPlayerId`,
 * NOT on `role` — because once the Facilitator opts onto a team their `role`
 * becomes a real play role (defuser/expert/spectator) and the `startRound` mint
 * would destroy a `'facilitator'` role marker.
 *
 * FAIL-CLOSED: a null/undefined/empty playerId, or a session snapshot missing
 * (or blank-seeded) the field — e.g. an in-flight pre-9.5 Redis session — yields
 * `false`. Authority LOCKS rather than being granted to everyone, and an empty
 * string can never coincidentally authorise a blank-id caller. Never throws.
 */
export function isSessionFacilitator(
  state: SessionState,
  playerId: string | null | undefined,
): boolean {
  const holder = state.facilitatorPlayerId;
  return (
    playerId != null &&
    playerId !== '' &&
    holder != null &&
    holder !== '' &&
    playerId === holder
  );
}
