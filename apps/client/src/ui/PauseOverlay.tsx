import { useState } from 'react';
import type { PlayerInfo, TeamId } from '@bomb-squad/shared';
import { useGameStore } from '../store/gameStore.js';
import { getSocket } from '../net/socket.js';
import { selectIsFacilitator } from './selectors.js';
import {
  PAUSE_HELD,
  PAUSE_DROPPED_PREFIX,
  PAUSE_RESUME_CTA,
  PAUSE_WAITING_READY,
  PAUSE_WAITING_FACILITATOR,
  PAUSE_READY_CTA,
  PAUSE_READY_DONE,
  FACILITATOR_PAUSE_CTA,
  FACILITATOR_PAUSE_CONFIRM_CTA,
} from './copy.js';

/**
 * Pause surface (Story 8.7, AC-1/AC-2/AC-3). Rendering only — it derives entirely
 * from the authoritative `session` pause fields (`pausedAt`/`pauseKind`/
 * `disconnectedPlayerIds`), so it is reconnect-safe and needs no separate store
 * state. Self-hides when the session is running.
 *
 * - Facilitator pause (between rounds): neutral "Holding the clock." strip; the
 *   facilitator gets a free Resume.
 * - Disconnect auto-pause (mid round): AMBER strip naming who dropped + a dimmed
 *   scene; resume requires the facilitator AND every participant ready, so a
 *   waiting participant gets an "I'm ready" affordance and the facilitator's
 *   Resume is disabled until the gate clears.
 *
 * A non-diegetic DOM overlay (EXPERIENCE.md) — the same z-layer pattern as
 * ResolutionBanner; no Three.js/WebGL changes. The per-team timer LCD already
 * freezes on `TimerState.pausedAt` (Story 8.4), so this owns only the strip + dim.
 */
/**
 * Mirror of the server's `isActiveParticipant` (pauseSession.ts): only players on
 * the team CURRENTLY playing gate the disconnect-pause ready/resume flow. A
 * resting-team player — including a facilitator who opted onto the resting team
 * (Story 9.5 review) — must not disable Resume client-side when the server's
 * `canResume` would accept it. Defensive: with no `activeTeamId`, any teamed
 * player counts (same as the server).
 */
function isActiveParticipant(
  player: PlayerInfo | undefined,
  activeTeamId: TeamId | undefined,
): boolean {
  if (player?.teamId === undefined) return false;
  return activeTeamId === undefined || player.teamId === activeTeamId;
}

export default function PauseOverlay() {
  const session = useGameStore((s) => s.session);
  const selfId = useGameStore((s) => s.myPlayerId);
  // Story 9.5 (AC-3): local arm→confirm state for the break-glass Pause. Purely
  // presentational (never game state), so it stays in useState per the store
  // discipline (Zustand holds server snapshots only).
  const [pauseArmed, setPauseArmed] = useState(false);

  if (session === null) return null;

  const self = selfId !== null ? session.players[selfId] : undefined;
  // Story 9.5: authority is the durable-id flag, not role — a teamed facilitator
  // (role now defuser/expert) still gets the break-glass pause on their surface.
  const isFacilitator = selectIsFacilitator(session, selfId);

  // The break-glass button exists ONLY un-paused, for the facilitator, in a
  // pausable phase. On ANY other render — including the paused strip — a
  // lingering armed flag must drop, or the confirm guard is bypassed: arm →
  // teammate drops (auto-pause) → resume would return the button pre-armed and
  // a single stray click pauses (review 9.5). Same-component render-phase reset
  // (the React-sanctioned derived-state pattern), self-terminating.
  const showPauseButton =
    session.pausedAt === null &&
    isFacilitator &&
    (session.status === 'active' || session.status === 'between-rounds');
  if (pauseArmed && !showPauseButton) setPauseArmed(false);

  // Not paused: the facilitator's "break-glass" Pause affordance (EXPERIENCE.md —
  // fades to low opacity until hovered). Only meaningful for a live round or the
  // between-rounds gap; everyone else sees nothing.
  if (session.pausedAt === null) {
    if (!showPauseButton) return null;
    // AC-3 (DD1): confirm-guarded on the SAME break-glass button (single testid).
    // First click ARMS (label flips to "Confirm pause", full opacity); second
    // click emits. A stray single click can no longer detonate the round. Blur
    // disarms so an armed control is never a resting state.
    return (
      <button
        type="button"
        data-testid="facilitator-pause"
        onClick={() => {
          if (pauseArmed) {
            getSocket().emit('FACILITATOR_PAUSE');
            setPauseArmed(false);
          } else {
            setPauseArmed(true);
          }
        }}
        onBlur={() => setPauseArmed(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setPauseArmed(false);
        }}
        aria-pressed={pauseArmed}
        className={`absolute right-4 top-4 z-40 rounded border px-3 py-1 font-mono text-xs uppercase tracking-widest transition-opacity ${
          pauseArmed
            ? 'border-brass bg-surface-raised text-ink-primary opacity-100'
            : 'border-ink-muted/40 bg-surface-raised/80 text-ink-muted opacity-20 hover:opacity-100'
        }`}
      >
        {pauseArmed ? FACILITATOR_PAUSE_CONFIRM_CTA : FACILITATOR_PAUSE_CTA}
      </button>
    );
  }

  const isDisconnect = session.pauseKind === 'disconnect';

  const droppedNames = session.disconnectedPlayerIds.map(
    (id) => session.players[id]?.displayName ?? 'A player',
  );
  // Mirror the server's canResume: every ACTIVE-TEAM participant must be ready
  // (Model B — a resting-team player never gates resume).
  const participants = Object.values(session.players).filter((p) =>
    isActiveParticipant(p, session.activeTeamId),
  );
  const allReady = participants.every((p) => p.isReady);

  const resume = () => getSocket().emit('FACILITATOR_RESUME');
  const readyUp = () => getSocket().emit('PLAYER_READY', { isReady: true });

  const message = isDisconnect
    ? `${droppedNames.join(', ')} ${PAUSE_DROPPED_PREFIX}`
    : PAUSE_HELD;

  // Resume is gated for a disconnect pause until all participants are ready.
  const resumeDisabled = isDisconnect && !allReady;

  // Story 9.5: a TEAMED facilitator IS a participant, so a disconnect pause resets
  // their readiness too. They must be able to ready-up (server canResume counts
  // them) AND resume (authority) — without the ready button their own not-ready
  // state would make Resume unreachable. Pre-9.5 the facilitator was always
  // teamless, so `facilitatorNeedsReady` is simply false and the UI is unchanged.
  const facilitatorNeedsReady =
    isDisconnect && isActiveParticipant(self, session.activeTeamId) && self?.isReady === false;

  let control: React.ReactNode;
  if (isFacilitator) {
    control = (
      <div className="flex items-center gap-3">
        {facilitatorNeedsReady && (
          <button
            type="button"
            data-testid="pause-ready"
            onClick={readyUp}
            className="rounded bg-ink-primary px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-widest text-surface"
          >
            {PAUSE_READY_CTA}
          </button>
        )}
        {resumeDisabled && <span className="font-mono text-xs">{PAUSE_WAITING_READY}</span>}
        <button
          type="button"
          data-testid="pause-resume"
          onClick={resume}
          disabled={resumeDisabled}
          className="rounded bg-ink-primary px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-widest text-surface disabled:cursor-not-allowed disabled:opacity-40"
        >
          {PAUSE_RESUME_CTA}
        </button>
      </div>
    );
  } else if (isDisconnect && isActiveParticipant(self, session.activeTeamId)) {
    control = self?.isReady ? (
      <span className="font-mono text-xs">{PAUSE_READY_DONE}</span>
    ) : (
      <button
        type="button"
        data-testid="pause-ready"
        onClick={readyUp}
        className="rounded bg-ink-primary px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-widest text-surface"
      >
        {PAUSE_READY_CTA}
      </button>
    );
  } else {
    control = <span className="font-mono text-xs">{PAUSE_WAITING_FACILITATOR}</span>;
  }

  return (
    <>
      {/* Scene dim — semi-transparent, promoted to its own compositor layer so it
          never repaints/flickers over the WebGL canvas (ResolutionBanner pattern). */}
      <div
        data-testid="pause-dim"
        className="pointer-events-none absolute inset-0 z-40 transform-gpu bg-black/50 will-change-transform"
      />
      {/* Full-width top strip — amber for a disconnect, neutral for a facilitator hold. */}
      <div
        role="status"
        data-testid="pause-strip"
        data-kind={session.pauseKind ?? ''}
        className={`absolute inset-x-0 top-0 z-50 flex items-center justify-between gap-4 px-6 py-3 ${
          isDisconnect ? 'bg-amber-500 text-black' : 'bg-surface-raised text-ink-primary'
        }`}
      >
        <span className="font-mono text-sm font-semibold uppercase tracking-widest">{message}</span>
        {control}
      </div>
    </>
  );
}
