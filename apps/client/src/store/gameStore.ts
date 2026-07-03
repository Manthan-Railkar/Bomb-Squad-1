import { create } from 'zustand';
import type {
  SessionState,
  BombState,
  TimerState,
  ModuleUpdate,
  StrikePayload,
  RoundOutcome,
  ScoreboardPayload,
} from '@bomb-squad/shared';

/**
 * Resolved-round result for presentation (Story 8.5). Non-authoritative — set
 * only from the server's BOMB_DEFUSED / BOMB_EXPLODED events. `null` while a
 * round is active. The client never derives an outcome itself.
 */
export interface ResolutionState {
  outcome: RoundOutcome;
  /** Displayed elapsed time the server recorded, in ms (RoundEndPayload). */
  elapsedMs: number;
}

interface GameState {
  session: SessionState | null;
  bomb: BombState | null;
  timer: TimerState | null;
  resolution: ResolutionState | null;
  /**
   * Between-rounds scoreboard preview (Story 8.6). Set from the one-shot
   * SCOREBOARD event. The Scoreboard surface derives its render from
   * `session.teams` (authoritative, reconnect-safe), so this is the explicit
   * "scoreboard now" signal/corroboration — the surface does NOT require it.
   * Cleared on a new round (BOMB_INIT) and on clearSession.
   */
  scoreboard: ScoreboardPayload | null;
  connection: 'disconnected' | 'connecting' | 'connected';
  /** This client's durable playerId (Story 2.7), resolved from SESSION_IDENTITY.
   * Reactive so the "You" tag / role routing update the moment identity lands —
   * a sessionStorage read is not reactive and would miss the first render. */
  myPlayerId: string | null;
  /** Human-readable notice to surface on Landing after a forced return (e.g. the
   * facilitator removed this client — Story 2.7). Read-then-cleared by Landing. */
  removalNotice: string | null;
  /**
   * This Expert's assigned manual chapters for a round restricted by the
   * `asymmetricExpertRoles` modifier (Story 9.1). `null` = full access (the
   * default, and every non-restricted round) — the manual is unlocked. A non-null
   * array locks every chapter NOT in it. Set by the EXPERT_CHAPTER_ASSIGNMENT
   * event; reset to `null` on every new round (setBomb) and on clearSession so a
   * prior round's restriction never bleeds into an unrestricted one.
   */
  assignedChapterIds: string[] | null;
  /**
   * This spectator's OWN lifeline-token balance (Story 9.2). A STANDING balance,
   * not per-round presentation — it must NOT reset on setBomb (unlike
   * resolution/scoreboard); it changes only via the server-authoritative
   * LIFELINE_TOKENS event (grant this story, spend Story 9.3) and clears only on
   * clearSession. The client never derives it. Rendered only when
   * `session.config.modifiers.spectatorLifelines === true` (the modifier-off HIDE
   * is a render gate, independent of this stored value).
   */
  lifelineTokens: number;
  setSession: (session: SessionState) => void;
  /** Record this client's durable playerId (from SESSION_IDENTITY or a stored seed). */
  setMyPlayerId: (playerId: string | null) => void;
  /** Drop all session/round snapshot state — routes the app back to Landing.
   * Optionally carry a notice to show there (e.g. a removal message). */
  clearSession: (notice?: string) => void;
  /** Acknowledge the removal notice once Landing has shown it. */
  clearRemovalNotice: () => void;
  setBomb: (bomb: BombState) => void;
  setTimer: (timer: TimerState) => void;
  setResolution: (resolution: ResolutionState | null) => void;
  setScoreboard: (scoreboard: ScoreboardPayload | null) => void;
  /**
   * Immutably replaces one module in the bomb's modules array.
   * Non-integer or out-of-range moduleIndex is dropped with a console warning
   * (defensive against malformed payloads; the warning surfaces desync).
   * Does NOT touch strikes or timer — those arrive via STRIKE / TIMER_UPDATE events.
   */
  applyModuleUpdate: (update: ModuleUpdate) => void;
  setStrike: (payload: StrikePayload) => void;
  /** Set (or clear, with `null`) this Expert's restricted chapter set (Story 9.1). */
  setAssignedChapters: (chapterIds: string[] | null) => void;
  /** Set this spectator's lifeline-token balance from the LIFELINE_TOKENS event (Story 9.2). */
  setLifelineTokens: (count: number) => void;
  setConnection: (connection: 'disconnected' | 'connecting' | 'connected') => void;
}

/**
 * Render-only, NON-authoritative snapshot of the last server-sent game state.
 * The server owns all game truth — never derive strikes, solved-state, or
 * timer expiry on the client.
 *
 * ACCESS PATTERN: Inside a render loop (useFrame / RAF), read state via:
 *   useGameStore.getState()
 * NOT the reactive selector hook. Reactive selectors are fine in React display components
 * that are not on a per-frame render loop.
 */
export const useGameStore = create<GameState>((set) => ({
  session: null,
  bomb: null,
  timer: null,
  resolution: null,
  scoreboard: null,
  connection: 'disconnected',
  myPlayerId: null,
  removalNotice: null,
  assignedChapterIds: null,
  lifelineTokens: 0,

  setSession: (session) => set({ session }),
  setMyPlayerId: (myPlayerId) => set({ myPlayerId }),
  clearSession: (notice) =>
    set({
      session: null,
      bomb: null,
      timer: null,
      resolution: null,
      scoreboard: null,
      myPlayerId: null,
      removalNotice: notice ?? null,
      assignedChapterIds: null,
      lifelineTokens: 0,
    }),
  clearRemovalNotice: () => set({ removalNotice: null }),
  // A fresh bomb (BOMB_INIT) means a new round — clear any prior resolution AND
  // the stale between-rounds scoreboard so neither bleeds into the next round.
  // Also clear the Story 9.1 chapter restriction: the assignment event (if the
  // new round restricts) arrives right after BOMB_INIT and re-sets it, so an
  // unrestricted round is left with full manual access (null).
  setBomb: (bomb) => set({ bomb, resolution: null, scoreboard: null, assignedChapterIds: null }),
  setTimer: (timer) => set({ timer }),
  setResolution: (resolution) => set({ resolution }),
  setScoreboard: (scoreboard) => set({ scoreboard }),

  applyModuleUpdate: ({ moduleIndex, state }) =>
    set((s) => {
      if (!s.bomb) {
        console.warn('[gameStore] MODULE_UPDATE dropped: no bomb in store', { moduleIndex });
        return {};
      }
      // Number.isInteger also rejects NaN/fractional indices, which would
      // corrupt the array via slice(0, NaN).
      if (!Number.isInteger(moduleIndex) || moduleIndex < 0 || moduleIndex >= s.bomb.modules.length) {
        console.warn('[gameStore] MODULE_UPDATE dropped: moduleIndex out of range', { moduleIndex });
        return {};
      }
      const modules = [
        ...s.bomb.modules.slice(0, moduleIndex),
        state,
        ...s.bomb.modules.slice(moduleIndex + 1),
      ];
      return { bomb: { ...s.bomb, modules } };
    }),

  setStrike: ({ strikes, timer }) =>
    set((s) => {
      if (!s.bomb) {
        console.warn('[gameStore] STRIKE before BOMB_INIT: strike count dropped', { strikes });
        return { timer };
      }
      return { bomb: { ...s.bomb, strikes }, timer };
    }),

  setAssignedChapters: (assignedChapterIds) => set({ assignedChapterIds }),

  // Standing balance — set only from the server's LIFELINE_TOKENS event. Deliberately
  // NOT touched by setBomb (tokens persist across rounds); cleared only by clearSession.
  setLifelineTokens: (lifelineTokens) => set({ lifelineTokens }),

  setConnection: (connection) => set({ connection }),
}));
