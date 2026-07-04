import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore.js';
import BombStage from '../scenes/BombStage.js';
import BombScene from '../scenes/BombScene.js';
import ManualViewer from '../manual/ManualViewer.js';
import type { ManualChapter } from '../manual/chapters.js';
import LifelinePanel from './LifelinePanel.js';
import {
  LOUNGE_INDICATOR,
  LOUNGE_WATCHING_TEAM,
  LOUNGE_READ_ONLY,
  LOUNGE_EXPERT_CHAPTER,
  LOUNGE_EXPERT_CHAPTER_NONE,
  LOUNGE_EXPERT_FOLLOWING,
  LOUNGE_EXPERT_FALLBACK_NAME,
  LIFELINE_TOKENS_LABEL,
} from './copy.js';

/**
 * Spectator Lounge (Story 9.4) — the composed watching surface a genuine
 * Spectator, a resting-team player, OR the Facilitator sees during a live round
 * (mounted by ActiveRound; DD4). A split-pane over the top bar:
 *   - LEFT (~60%): the active team's READ-ONLY bomb (the Epic 4 renderer reused,
 *     `readOnly` — no module interaction, no Defuser camera-focus).
 *   - RIGHT (~40%): the read-only Expert MULTIVIEW — one follow-only pane PER
 *     active-team Expert, stacked cards (mockup 5b, Jay-decided variant A), each
 *     mirroring THAT Expert's current chapter and headed with the Expert's name.
 *   - TOP BAR: a neutral lounge/voice pill (DD5 — never a literal "Listen-only"
 *     pill; 3.7 made the lounge bidirectional) + the re-hosted Story 9.3 lifeline
 *     affordance (token counter + Send Tip), suppressed for the Facilitator.
 *
 * Composition over the existing bomb + manual surfaces (DESIGN.md "no fourth
 * surface") — no new colours. The voice HUD + pause/resolution overlays float
 * from ActiveRound's outer wrapper, so this surface inherits them for free.
 */
export default function SpectatorLounge({ chapters }: { chapters: ManualChapter[] }) {
  const session = useGameStore((s) => s.session);
  const selfId = useGameStore((s) => s.myPlayerId);
  const expertManualPositions = useGameStore((s) => s.expertManualPositions);
  const lifelineTokens = useGameStore((s) => s.lifelineTokens);

  const activeTeamId = session?.activeTeamId;

  // The active-team Experts drive the multiview panes — ordered stably by display
  // name so panes never reshuffle as Experts navigate. Keyed by durable playerId.
  const experts = useMemo(() => {
    if (session == null || activeTeamId === undefined) return [];
    return Object.values(session.players)
      .filter((p) => p.role === 'expert' && p.teamId === activeTeamId)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [session, activeTeamId]);

  if (session == null) return null;

  const self = selfId !== null ? session.players[selfId] : undefined;
  const role = self?.role;
  // Earner gate (Story 9.2/9.3): the Facilitator watches but never earns/holds
  // tokens, so its lounge shows NEITHER the counter NOR the Send-Tip affordance.
  const isEarner = role !== undefined && role !== 'facilitator';
  const showLifelineTokens = session.config.modifiers.spectatorLifelines && isEarner;

  return (
    <div className="relative flex h-screen flex-col bg-surface">
      {/* TOP BAR — lounge/voice indicator (left) · lifeline affordance (right) */}
      <div
        className="flex items-center justify-between border-b px-6 py-2.5"
        style={{ borderColor: '#2A242F' }}
      >
        <span
          data-testid="lounge-voice-indicator"
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-widest text-ink-muted"
          style={{ borderColor: '#2A242F' }}
        >
          {LOUNGE_INDICATOR}
        </span>
        <div className="flex items-center gap-4">
          {showLifelineTokens ? (
            <span
              data-testid="lifeline-token-counter"
              className="font-mono text-xs uppercase tracking-widest text-ink-muted"
            >
              {LIFELINE_TOKENS_LABEL(lifelineTokens)}
            </span>
          ) : null}
          {/* Re-hosted Story 9.3 affordance — self-hides unless modifier on AND ≥1
              token; the Facilitator (non-earner) never mounts it at all. */}
          {isEarner ? <LifelinePanel /> : null}
        </div>
      </div>

      {/* SPLIT: read-only bomb (60) · Expert multiview (40) */}
      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: '60fr 40fr' }}
      >
        {/* LEFT — read-only bomb */}
        <div className="relative min-h-0 border-r" style={{ borderColor: '#2A242F' }}>
          <BombStage fill>
            <BombScene readOnly />
          </BombStage>
          {/* Watching tag + read-only chip (mockup 5. Spectator Lounge). */}
          <div className="pointer-events-none absolute left-4 top-3 flex items-center gap-2">
            {activeTeamId !== undefined ? (
              <span
                data-testid="lounge-watching-tag"
                className="rounded-full bg-black/50 px-3 py-1 font-mono text-xs uppercase tracking-widest text-ink-muted"
              >
                {LOUNGE_WATCHING_TEAM(activeTeamId)}
              </span>
            ) : null}
            <span className="rounded-full bg-black/50 px-3 py-1 font-mono text-xs uppercase tracking-widest text-ink-muted">
              {LOUNGE_READ_ONLY}
            </span>
          </div>
        </div>

        {/* RIGHT — Expert manual multiview (stacked cards, per-card scroll) */}
        <div
          data-testid="lounge-manual-multiview"
          className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4"
        >
          {experts.map((expert) => {
            const chapterId = expertManualPositions[expert.playerId];
            const chapterIndex =
              chapterId !== undefined ? chapters.findIndex((c) => c.chapterId === chapterId) : -1;
            const chapter = chapterIndex >= 0 ? chapters[chapterIndex] : undefined;
            const name =
              expert.displayName !== '' ? expert.displayName : LOUNGE_EXPERT_FALLBACK_NAME;
            const avatar = name.charAt(0).toUpperCase();
            return (
              <div
                key={expert.playerId}
                data-testid={`lounge-expert-pane-${expert.playerId}`}
                className="flex min-h-[240px] flex-1 flex-col gap-2"
              >
                {/* Card header — {avatar} {name} · Ch.{n} {title} · 🔒 following */}
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="grid h-6 w-6 flex-none place-items-center rounded-full bg-surface-raised font-mono text-xs text-ink-primary"
                  >
                    {avatar}
                  </span>
                  <span className="font-manual text-md font-semibold text-ink-primary">{name}</span>
                  <span className="font-mono text-xs text-ink-muted">
                    {chapter !== undefined
                      ? LOUNGE_EXPERT_CHAPTER(chapterIndex + 1, chapter.chapterTitle)
                      : LOUNGE_EXPERT_CHAPTER_NONE}
                  </span>
                  <span
                    className="ml-auto rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-muted"
                    style={{ borderColor: '#2A242F' }}
                  >
                    {LOUNGE_EXPERT_FOLLOWING}
                  </span>
                </div>
                {/* One follow-only ManualViewer per Expert (Task 4). A missing entry
                    ⇒ the viewer's own "hasn't opened the manual" placeholder. */}
                <div className="min-h-0 flex-1">
                  <ManualViewer chapters={chapters} followChapterId={chapterId ?? null} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
