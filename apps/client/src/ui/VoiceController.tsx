import { useEffect, useState } from 'react';
import { spectatorLoungeName } from '@bomb-squad/shared';
import { useGameStore } from '../store/gameStore.js';
import { useVoiceStore } from '../store/voiceStore.js';
import { connectVoice, disconnectVoice, reconnectVoice } from '../voice/connectVoice.js';
import { deriveDesiredScope } from '../voice/computeVoiceAction.js';
import { useVoiceScopeSync } from '../voice/useVoiceScopeSync.js';
import Button from './Button.js';
import {
  VOICE_CONNECT_CTA,
  VOICE_CONNECTING,
  VOICE_CONNECTED,
  VOICE_LOUNGE_CTA,
  VOICE_LOUNGE_CONNECTING,
  VOICE_LOUNGE_CONNECTED,
  VOICE_UNAVAILABLE,
  VOICE_DISMISS,
  VOICE_RECONNECT,
} from './copy.js';

/**
 * Voice join entry point — the minimal, gesture-driven affordance that connects
 * a player to their server-assigned voice room. It is rendering-only: all
 * connection logic lives in `voice/connectVoice.ts`; this component just drives
 * it from a click and mirrors `voiceStore` into EXPERIENCE.md microcopy.
 *
 * Two modes share this one mount (it already rides ActiveRound). The mode is
 * resolved from the player's SERVER-ASSIGNED scope (`deriveDesiredScope` — the
 * same shared derivation the server mints from), never the raw role, so the
 * relay's resting team lands in the lounge automatically (Story 3.7):
 * - Bomb Room (Story 3.2): the ACTIVE team's Defuser/Expert connects + PUBLISHES
 *   the mic so they can talk. "Connect to Bomb Room voice".
 * - Spectator Lounge (Story 3.3 / 3.7): a spectator OR a resting-team player
 *   connects to the lounge. Post-3.7 the lounge is BIDIRECTIONAL among members
 *   (`publish: true`) — they hear the active team's bomb (forwarded by the server
 *   bridge) AND can talk to each other. Lounge microcopy.
 *
 * Deliberately NOT here (Story 3.4): the speaker-indicator pill and the
 * self-mute toggle. No pill, no mute control in either mode.
 *
 * Non-blocking (AC #4): a voice failure renders as dismissible microcopy and
 * never blocks the game — there is no modal and no game-state coupling.
 *
 * Graceful degradation (Story 3.6): the `unavailable` state also offers a manual
 * "Reconnect voice" affordance that re-runs `connectVoice` with a FRESH token in
 * the player's existing role mode. The reconnect control stays reachable even
 * after the banner is dismissed — dismissing only hides the message line, never
 * the ability to re-attempt voice. There is no auto-backoff loop here (that
 * hardening is Story 10-3).
 */
export default function VoiceController() {
  const session = useGameStore((s) => s.session);
  // Resolve self via the reactive durable id (Story 2.7), NOT getSocket().id —
  // `players` is keyed by the durable playerId, so the socket.id lookup always
  // missed post-2.7 and the bomb-room CTA never rendered (Story 2.5 fix).
  const selfId = useGameStore((s) => s.myPlayerId);
  const status = useVoiceStore((s) => s.status);
  const [dismissed, setDismissed] = useState(false);

  // Re-mint on effective-scope change (Story 3.5): when a CONNECTED player's
  // server-assigned voice scope flips (e.g. facilitator reassigns a Defuser to
  // Spectator), tear down the stale connection and reconnect with a fresh token
  // in the new room/publish mode. A no-op for same-scope role relabels (e.g.
  // Defuser→Expert same team) and for a player who never connected (idle). MUST
  // run before the early return below — hooks are unconditional.
  useVoiceScopeSync(session, selfId);

  // Re-show the failure microcopy whenever we (re-)enter `unavailable`.
  useEffect(() => {
    if (status === 'unavailable') setDismissed(false);
  }, [status]);

  // Teardown on unmount (AC #5): round ends / role changes / navigate away.
  // Idempotent + safe even if we never connected.
  useEffect(() => {
    return () => {
      void disconnectVoice();
    };
  }, []);

  // Resolve which voice mode this player gets from their SERVER-ASSIGNED scope —
  // the shared derivation the server mints from — so the client never disagrees
  // with the token, and the relay's resting-team → lounge routing (3.7) is picked
  // up here for free. `deriveDesiredScope` returns null for roles this UI does not
  // manage (facilitator / un-teamed / teamless bomb role) → render nothing.
  const self = selfId !== null ? session?.players[selfId] : undefined;
  const desired = deriveDesiredScope(self, session?.status, session?.sessionId, session?.activeTeamId);
  if (desired === null || session === null) return null;

  // Microcopy follows the RESOLVED room, not the raw role — a resting Bomb-Room
  // player shows lounge copy. `publish` is the authoritative grant flag (lounge is
  // bidirectional post-3.7, so lounge members publish too — they acquire a mic).
  const inLounge = desired.room === spectatorLoungeName(session.sessionId);
  const publish = desired.publish;
  const ctaCopy = inLounge ? VOICE_LOUNGE_CTA : VOICE_CONNECT_CTA;
  const connectingCopy = inLounge ? VOICE_LOUNGE_CONNECTING : VOICE_CONNECTING;
  const connectedCopy = inLounge ? VOICE_LOUNGE_CONNECTED : VOICE_CONNECTED;

  return (
    <div className="pointer-events-auto absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
      {status === 'idle' && (
        // connectVoice() MUST be invoked from this click — autoplay AND (now that
        // the lounge is bidirectional, Story 3.7) getUserMedia for every managed
        // role need the user gesture. Lounge members acquire a mic too.
        <Button variant="secondary" onClick={() => void connectVoice({ publish })}>
          {ctaCopy}
        </Button>
      )}

      {status === 'connecting' && (
        <p className="rounded-md bg-surface-raised px-3 py-2 font-mono text-xs uppercase tracking-widest text-ink-muted">
          {connectingCopy}
        </p>
      )}

      {status === 'connected' && (
        <p className="rounded-md bg-surface-raised px-3 py-2 font-mono text-xs uppercase tracking-widest text-ink-muted">
          {connectedCopy}
        </p>
      )}

      {status === 'unavailable' && (
        // The banner message + Dismiss hide once dismissed, but the Reconnect
        // affordance ALWAYS stays reachable while unavailable (AC #1/#2): a
        // dismissed banner must never strip the ability to re-attempt voice.
        <div className="flex items-center gap-2 rounded-md bg-surface-raised px-3 py-2">
          {!dismissed && (
            <>
              <p className="font-mono text-xs text-ink-muted">{VOICE_UNAVAILABLE}</p>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="font-mono text-xs uppercase tracking-widest text-ink-muted underline hover:text-ink-primary"
              >
                {VOICE_DISMISS}
              </button>
            </>
          )}
          <Button variant="secondary" onClick={() => void reconnectVoice({ publish })}>
            {VOICE_RECONNECT}
          </Button>
        </div>
      )}
    </div>
  );
}
