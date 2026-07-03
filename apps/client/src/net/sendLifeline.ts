import type { LifelinePromptId } from '@bomb-squad/shared';
import { useGameStore } from '../store/gameStore.js';
import { getSocket } from './socket.js';

/**
 * Emit a spectator lifeline send (Story 9.3). Modelled on `publishManualPosition`:
 * a fire-and-forget typed emit, guarded on connected + in-a-session so the dev
 * harness (no socket/session) never throws.
 *
 * The wire carries ONLY the `promptId` (no free text) — the server validates it
 * against the fixed shared list and re-checks the token holding, so this helper
 * stays a thin, untrusted request. It does NOT optimistically decrement the local
 * token count: the balance drops only when the server's LIFELINE_TOKENS echo lands
 * (trust the server, single source of truth).
 */
export function sendLifeline(promptId: LifelinePromptId): void {
  const { connection, session } = useGameStore.getState();
  if (connection !== 'connected' || session === null) return;
  getSocket().emit('LIFELINE_SEND', { promptId });
}
