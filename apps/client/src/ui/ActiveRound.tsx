import { useMemo, type ReactNode } from 'react';
import { CHAPTER_IDS } from '@bomb-squad/shared';
import { useGameStore } from '../store/gameStore.js';
import { useUiStore } from '../store/uiStore.js';
import BombStage from '../scenes/BombStage.js';
import BombScene from '../scenes/BombScene.js';
import ManualViewer from '../manual/ManualViewer.js';
import { buildChapters } from '../manual/chapters.js';
import { MANUAL_MODULES } from '../modules/index.js';
import ResolutionBanner from './ResolutionBanner.js';
import SpectatorLounge from './SpectatorLounge.js';
import LifelinePanel from './LifelinePanel.js';
import LifelineToastHost from './LifelineToast.js';
import VoiceController from './VoiceController.js';
import { isVoiceEnabled } from '../voice/voiceEnabled.js';
import PauseOverlay from './PauseOverlay.js';
import SpeakerIndicator from './SpeakerIndicator.js';
import MuteControl from './MuteControl.js';
import AudioUnblockPrompt from './AudioUnblockPrompt.js';
import { ROUND_IN_PROGRESS, LIFELINE_TOKENS_LABEL } from './copy.js';

/**
 * Active-round surface routing (Story 8.3, FR11) — the same session URL shows
 * a different primary surface per committed role (EXPERIENCE.md role-gating
 * principle; roles never see each other's surface).
 *
 * ACTIVE-TEAM ROUTING (Story 8.11, Model B): exactly one team plays per round.
 * We route by ACTIVE TEAM FIRST, role second — a player whose team is NOT
 * `session.activeTeamId` is RESTING and sees a spectate/standby surface for ALL
 * roles (never a dead bomb or a manual for a bomb nobody on their team is
 * solving). The full split-pane lounge is Story 9.4; this is the legible interim.
 *
 * - Active-team Defuser: the bomb. BombScene tolerates `bomb === null` (falls back
 *   to its dev placeholder modules) until BOMB_INIT.
 * - Active-team Expert: the manual (5.2) — same chapter wiring as Preparation.
 * - Resting team (any role) / Spectator / Facilitator: standby panels; the
 *   Spectator Lounge is Epic 9 and the in-round facilitator dashboard is 8.5+.
 * No HUD work here — the timer LCD and strike indicator are Stories 4.4/4.5.
 */
export default function ActiveRound() {
  const session = useGameStore((s) => s.session);
  const selfId = useGameStore((s) => s.myPlayerId);
  // Story 9.1: this Expert's restricted chapter set (null = full access). Read
  // reactively so the manual re-restricts the moment the assignment lands.
  const assignedChapterIds = useGameStore((s) => s.assignedChapterIds);
  // Story 9.2: this earner's standing lifeline-token balance — only the teamless
  // earner reads it here now (spectators/resting players see it inside the lounge).
  const lifelineTokens = useGameStore((s) => s.lifelineTokens);
  const manualLocale = useUiStore((s) => s.manualLocale);

  const chapters = useMemo(
    () => buildChapters(MANUAL_MODULES.flatMap((m) => m.getManualPages(manualLocale))),
    [manualLocale],
  );
  // Drop the sandbox-only `dev-demo` chapter from BOTH manual paths (review
  // 9.1): if the unrestricted list kept dev-demo as chapter 1, every real
  // chapter's number would shift by one between restricted and unrestricted
  // rounds — poison for a game whose loop is shouting chapter numbers.
  const realChapters = useMemo(
    () => chapters.filter((c) => (CHAPTER_IDS as readonly string[]).includes(c.chapterId)),
    [chapters],
  );

  if (session === null) return null;

  // Resolve "which player am I" by the durable playerId (Story 2.7) from the
  // reactive store, not socket.id — socket.id is no longer a roster key.
  const self = selfId !== null ? session.players[selfId] : undefined;
  const role = self?.role;
  // Resting players (their team is not the active team) are routed to standby for
  // ALL roles — gate on activeTeamId BEFORE role. The facilitator (no teamId) is
  // never "resting"; it falls through to its own placeholder below.
  const myTeamId = self?.teamId;
  const isResting = myTeamId !== undefined && myTeamId !== session.activeTeamId;

  let surface: ReactNode;
  if (isResting) {
    // A resting-team player (any role) watches the active bomb via the lounge (9.4).
    surface = <SpectatorLounge chapters={realChapters} />;
  } else if (role === 'defuser' && myTeamId !== undefined) {
    surface = (
      <BombStage>
        <BombScene />
      </BombStage>
    );
  } else if (role === 'expert' && myTeamId !== undefined) {
    surface =
      assignedChapterIds !== null ? (
        <ManualViewer chapters={realChapters} assignedChapterIds={assignedChapterIds} />
      ) : (
        <ManualViewer chapters={realChapters} />
      );
  } else if (role === 'spectator' || role === 'facilitator') {
    // Genuine Spectator AND the Facilitator (DD4 — the facilitator watches the
    // active bomb too) get the composed lounge. The lounge self-suppresses the
    // token counter + Send-Tip for the (non-earner) facilitator.
    surface = <SpectatorLounge chapters={realChapters} />;
  } else {
    // The only remaining case: a TEAMLESS bomb-role (defuser/expert joined between
    // rounds; TEAM_ASSIGN is lobby-locked so they can never be teamed). Keep the
    // legible round-in-progress text (Story 9.4 leaves this the ONE fallback that is
    // NOT the lounge — they hold a bomb role but no team, so no split-pane). They
    // ARE lifeline earners though (server grants + accepts their send — review 9.2/9.3),
    // so preserve the token counter + Send-Tip here so their balance is not invisible.
    // Reaching here, role is a teamless bomb-role or undefined (spectator/facilitator
    // were routed to the lounge above) — an earner is exactly the teamless bomb-role.
    const isTeamlessEarner = role === 'defuser' || role === 'expert';
    const showTeamlessCounter = isTeamlessEarner && session.config.modifiers.spectatorLifelines;
    surface = (
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        <p className="font-mono text-sm uppercase tracking-widest text-ink-muted">
          {ROUND_IN_PROGRESS}
        </p>
        {showTeamlessCounter ? (
          <p
            data-testid="lifeline-token-counter"
            className="mt-4 font-mono text-xs uppercase tracking-widest text-ink-muted"
          >
            {LIFELINE_TOKENS_LABEL(lifelineTokens)}
          </p>
        ) : null}
        {isTeamlessEarner ? <LifelinePanel /> : null}
      </div>
    );
  }

  // The result banner overlays whatever role surface is showing (Story 8.5). It
  // self-hides while `resolution` is null, so this wrapper is inert mid-round.
  return (
    <div className="relative flex flex-1 flex-col">
      {surface}
      <ResolutionBanner />
      {/* Bomb-Room lifeline toast overlay (Story 9.3): a top-right stacked, 8s,
          non-dismissable host on its own compositor layer. Sibling above the
          surface — reaches the active-team Defuser's bomb AND Expert's manual
          (both share the team room), never a child of the sized canvas box. */}
      <LifelineToastHost />
      {/* Pause surface (Story 8.7): the facilitator's break-glass Pause control, and
          the "Holding the clock" / amber disconnect strip + scene dim when paused. */}
      <PauseOverlay />
      {/* Voice HUD corners (non-blocking, self-gating). Story 3.2 connect CTA is
          bottom-right; Story 3.4 adds the speaker pill (top-left, all in-round
          roles incl. a spectator watching the Bomb Room) and the self-mute toggle
          (bottom-left, publisher-only — self-gates internally). The timer LCD
          (top-center/right) is reserved for Stories 4.4/4.5 — pill stays clear. */}
      <SpeakerIndicator />
      <MuteControl />
      <AudioUnblockPrompt />
      {isVoiceEnabled() && <VoiceController />}
    </div>
  );
}
