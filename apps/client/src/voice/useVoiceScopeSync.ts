import { useEffect, useRef } from 'react';
import type { SessionState } from '@bomb-squad/shared';
import { useVoiceStore } from '../store/voiceStore.js';
import { disconnectVoice, reconnectVoice } from './connectVoice.js';
import { computeVoiceAction, deriveDesiredScope } from './computeVoiceAction.js';

/**
 * Re-mint the voice connection when the local player's effective voice scope
 * changes mid-session (Story 3.5). Drives the pure {@link computeVoiceAction}
 * decision from the live `voiceStore` connection + the desired scope derived
 * from authoritative `SessionState`, and reconnects with a FRESH token (via
 * `reconnectVoice`, which `disconnect()`s then `connect()`s — `connectVoice`
 * never caches a token, so "old token never reused" holds) only when the
 * effective `{ room, publish }` actually changed.
 *
 * Reconnect-WITHOUT-gesture is intentional and correct here: the mic permission
 * + audio autoplay were already unlocked by the initial gesture-driven connect
 * for this page session, so re-establishing within the same session needs no new
 * gesture. Do NOT "fix" this back to a gesture gate — that would strand a
 * reassigned player in the wrong room. (The FIRST connect still requires the
 * `VoiceController` button; this only fires once `status === 'connected'`.)
 *
 * Reconnect-storm safety: `connectVoice`'s `connectEpoch` guard supersedes any
 * in-flight connect/disconnect, and `computeVoiceAction` compares against the
 * DESIRED scope (not each intermediate state), so a burst of `SESSION_STATE`
 * updates collapses to the latest target. Re-minting from `unavailable` (AC #5)
 * has no connected tuple to compare against, so a `lastAttemptRef` gate makes it
 * single-shot per target: a re-mint that itself fails settles back to
 * `unavailable` and would otherwise re-run this effect forever — the gate skips
 * a repeat toward the SAME desired scope (a genuinely new scope still fires).
 */
export function useVoiceScopeSync(
  session: SessionState | null,
  selfId: string | null,
): void {
  const status = useVoiceStore((s) => s.status);
  const room = useVoiceStore((s) => s.room);
  const publishing = useVoiceStore((s) => s.publishing);

  const self = selfId !== null ? session?.players[selfId] : undefined;
  const desired = deriveDesiredScope(self, session?.status, session?.sessionId);

  // The desired scope we last initiated an `unavailable` re-mint toward, so a
  // failing re-mint (unavailable → idle → connecting → unavailable) does not
  // retry the same target on every re-run. Cleared once we reach a healthy
  // `connected` so a later drop can re-mint afresh.
  const lastAttemptRef = useRef<string | null>(null);

  // Depend on the resolved scalars (not object identities) so the effect re-runs
  // exactly when the connection or the desired scope changes — never on an
  // unrelated SESSION_STATE field churn.
  useEffect(() => {
    if (status === 'connected') lastAttemptRef.current = null;
    const action = computeVoiceAction({ status, room, publishing }, desired);
    if (action.type === 'reconnect') {
      if (status === 'unavailable') {
        const target = `${action.publish ? 'pub' : 'sub'}@${desired?.room ?? ''}`;
        if (lastAttemptRef.current === target) return; // already tried this scope
        lastAttemptRef.current = target;
      }
      void reconnectVoice({ publish: action.publish });
    } else if (action.type === 'disconnect') {
      void disconnectVoice();
    }
  }, [status, room, publishing, desired?.room, desired?.publish]);
}
