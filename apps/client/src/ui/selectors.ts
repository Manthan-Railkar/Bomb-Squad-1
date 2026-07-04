import type { SessionState } from '@bomb-squad/shared';
import { isSessionFacilitator } from '@bomb-squad/shared';

/**
 * Client-side facilitator-authority derivation (Story 9.5). Uses the SAME shared
 * predicate as every server gate, keyed on the durable player id against
 * `session.facilitatorPlayerId` — NOT `role === 'facilitator'`. Once the
 * Facilitator opts onto a team their `role` becomes a play role, so the old
 * role check silently goes false and their dashboard controls would vanish;
 * this keeps client self-identification and server authority in lock-step
 * (the 2.7 identity-key lesson). Fail-closed for a null session/id.
 */
export function selectIsFacilitator(
  session: SessionState | null,
  myPlayerId: string | null,
): boolean {
  return session !== null && isSessionFacilitator(session, myPlayerId);
}
