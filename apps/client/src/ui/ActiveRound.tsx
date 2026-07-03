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
import LifelinePanel from './LifelinePanel.js';
import LifelineToastHost from './LifelineToast.js';
import VoiceController from './VoiceController.js';
import { isVoiceEnabled } from '../voice/voiceEnabled.js';
import PauseOverlay from './PauseOverlay.js';
import SpeakerIndicator from './SpeakerIndicator.js';
import MuteControl from './MuteControl.js';
import AudioUnblockPrompt from './AudioUnblockPrompt.js';
import { ROUND_IN_PROGRESS, WATCHING_THE_BOMB_ROOM, RESTING_SPECTATE, LIFELINE_TOKENS_LABEL } from './copy.js';

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
  // Story 9.2: this spectator's standing lifeline-token balance. Read reactively
  // so the counter updates the instant a grant lands.
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

  // Story 9.2: passive lifeline-token counter for watching players (spectators +
  // resting-team relayers — Design Decision 1). Gated STRICTLY on the modifier
  // flag: even if a stale non-zero `lifelineTokens` lingers from a prior
  // modifier-on config, the modifier-off branch renders no counter (AC-2). The
  // send affordance is Story 9.3 — this is the balance only.
  const showLifelineTokens = session.config.modifiers.spectatorLifelines;
  const lifelineCounter = showLifelineTokens ? (
    <p
      data-testid="lifeline-token-counter"
      className="mt-4 font-mono text-xs uppercase tracking-widest text-ink-muted"
    >
      {LIFELINE_TOKENS_LABEL(lifelineTokens)}
    </p>
  ) : null;

  let surface: ReactNode;
  if (isResting) {
    surface = (
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        <p
          data-testid="resting-standby"
          className="max-w-md text-center font-mono text-sm uppercase tracking-widest text-ink-muted"
        >
          {RESTING_SPECTATE}
        </p>
        {lifelineCounter}
        {/* Story 9.3: send affordance for watching players — self-hides unless the
            modifier is on AND this viewer holds a token. */}
        <LifelinePanel />
      </div>
    );
  } else if (role === 'defuser' && myTeamId !== undefined) {
    surface = (
      <BombStage>
        <BombScene />
      </BombStage>
    );
  } else if (role === 'expert' && myTeamId !== undefined) {
    // Teamless expert/defuser (joined between rounds; TEAM_ASSIGN is
    // lobby-locked so they can never be teamed) falls through to standby —
    // otherwise a fresh-name rejoin would hold the FULL manual while the
    // active team's Experts are split (restriction bypass, review 9.1).
    surface =
      assignedChapterIds !== null ? (
        <ManualViewer chapters={realChapters} assignedChapterIds={assignedChapterIds} />
      ) : (
        <ManualViewer chapters={realChapters} />
      );
  } else {
    surface = (
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        <p className="font-mono text-sm uppercase tracking-widest text-ink-muted">
          {role === 'spectator' ? WATCHING_THE_BOMB_ROOM : ROUND_IN_PROGRESS}
        </p>
        {/* Counter for every non-facilitator on this fallback — the earner set
            exactly (review 9.2): besides a genuine spectator, a TEAMLESS
            defuser/expert (joined between rounds; TEAM_ASSIGN is lobby-locked)
            lands here AND earns tokens, so hiding the counter from them would
            mint an invisible balance. The facilitator never earns. */}
        {role !== undefined && role !== 'facilitator' ? lifelineCounter : null}
        {/* Story 9.3: send affordance — same earner predicate, so a teamless
            earner can spend what they hold; self-hides at 0 tokens. */}
        {role !== undefined && role !== 'facilitator' ? <LifelinePanel /> : null}
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
