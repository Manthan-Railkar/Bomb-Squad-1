/**
 * Round-resolution ceremony (Story 8.5). The single code path all three outcomes
 * — defuse, 3rd strike, timeout — funnel through. The server RECORDS and
 * ANNOUNCES the result; it does not block on the cinematic (the 2s/3s scene holds
 * are client-side presentation, Task 5).
 *
 * IDEMPOTENCY FENCE (AC-4, per-team): a single `RoundState` is shared by both
 * racing teams, so its round-level `status` cannot express per-team resolution.
 * The authoritative per-team once-only fence is therefore the team's LIVE TIMER
 * KEY: it exists exactly once per active team and is deleted the first time that
 * team resolves. A second trigger for an already-resolved team (a late strike
 * after a defuse, a timer wake firing after an early defuse) finds no timer key
 * and is a logged no-op — never a second BOMB_DEFUSED/BOMB_EXPLODED, never a
 * double time entry. This is the same desync posture `onTimerExpired`'s fire path
 * and `escalateOnStrike` already use (timer-key-null → no-op). RoundState.status
 * is still recorded as the round-level outcome (last-writer-wins across teams);
 * the per-team result is carried by which event fired + that team's
 * cumulativeTimeMs (matching the ScoreboardPayload contract).
 *
 * ELAPSED-TIME CONVENTION: TWO values, computed once here from the live
 * `TimerState` via `timerCore.remainingMs` (the only timer math):
 *  - `displayedElapsedMs` = `config.timerMs - remainingMs(timer, now)` — the actual
 *    moment the round ended, bounded to [0, timerMs]; carried by the BOMB_DEFUSED/
 *    BOMB_EXPLODED announcement (Story 8.5 AC-5; preserves the 8.4 timeout = timerMs
 *    decision and the strike-accelerated countdown baked into `remainingMs`).
 *  - `scoredElapsedMs` (Story 8.10 AC-1) = the value RECORDED into
 *    cumulativeTimeMs/roundTimesMs. A `defused` round scores its displayed elapsed;
 *    a FAILED round (`exploded`/`time-expired`) scores a FULL-TIMER PENALTY
 *    (`timerMs`) so failing is never cheaper than defusing (Jay's decision,
 *    resolving the bugs-epic8:15 fast-fail loophole). Story 8.10 sums this.
 */
import type { RoundOutcome, RoundState, SessionState, TeamId, TeamState, TimerState } from '@bomb-squad/shared';
import type { RedisStore } from '../state/redis.js';
import { roundKey, sessionKey, timerKey } from '../state/keys.js';
import {
  sessionRoom,
  bombAudience,
  type SessionIOServer,
  type SessionLog,
  type LoungeBridgePort,
} from '../handlers/sessionHandlers.js';
import { remainingMs } from '../timer/timerCore.js';
import type { TimerScheduler } from '../timer/timerScheduler.js';
import { buildScoreboard } from './buildScoreboard.js';
import { grantToken } from '../lifelines/lifelineTokens.js';
import { afterSessionCeremony } from './sessionChain.js';

export interface ResolveRoundDeps {
  redis: RedisStore;
  io: SessionIOServer;
  log: SessionLog;
  /** Only `cancel` is needed — the ceremony cancels the resolving team's wake. */
  timer: Pick<TimerScheduler, 'cancel'>;
  /** Bomb Room → Lounge audio bridge (Story 3.7). Optional + best-effort: when a
   * round resolves INTO between-rounds the just-active team's forward into the
   * lounge is torn down (AC #6) so a finished round never keeps playing there.
   * Absent (unit tests / no LiveKit) ⇒ no teardown; the game is unaffected. */
  loungeBridge?: Pick<LoungeBridgePort, 'unbridgeAll'>;
}

/**
 * Resolve one team's round to a terminal `outcome`. `now` is the
 * server-authoritative instant the resolution fires (injected wall clock — never
 * `Date.now()`); it dates the displayed-elapsed computation.
 *
 * Serialized per session (see `sessionChain.ts`): the actual ceremony runs in
 * `resolveRoundCeremony`; this entry point queues it behind any in-flight
 * resolution for the same session so concurrent two-team resolutions cannot
 * clobber each other's `cumulativeTimeMs`.
 */
export function resolveRound(
  deps: ResolveRoundDeps,
  sessionId: string,
  teamId: TeamId,
  outcome: RoundOutcome,
  now: number,
): Promise<void> {
  return afterSessionCeremony(sessionId, () =>
    resolveRoundCeremony(deps, sessionId, teamId, outcome, now),
  );
}

async function resolveRoundCeremony(
  deps: ResolveRoundDeps,
  sessionId: string,
  teamId: TeamId,
  outcome: RoundOutcome,
  now: number,
): Promise<void> {
  // FENCE: the live timer key is the per-team once-only gate. Null means this
  // team already resolved (key deleted below) or never had a live clock — either
  // way a no-op, never a second announcement.
  const timer = await deps.redis.getJSON<TimerState>(timerKey(sessionId, teamId));
  if (timer === null) {
    deps.log.info({ sessionId, teamId, outcome }, 'round already resolved (no live timer) — no-op');
    return;
  }

  const session = await deps.redis.getJSON<SessionState>(sessionKey(sessionId));
  if (session === null) {
    // Live timer but no session is a desync — surface it, never throw.
    deps.log.error({ sessionId, teamId, outcome }, 'resolve with no session — dropped');
    return;
  }

  const roundNumber = session.roundNumber;
  const round = await deps.redis.getJSON<RoundState>(roundKey(sessionId, roundNumber));
  if (round === null) {
    deps.log.error({ sessionId, teamId, outcome, roundNumber }, 'resolve with no round state — dropped');
    return;
  }

  const team = session.teams[teamId];
  if (team === undefined) {
    // Cannot record cumulativeTimeMs for a team that does not exist (Partial map).
    deps.log.error({ sessionId, teamId, outcome }, 'resolve for unknown team — dropped');
    return;
  }

  // Displayed elapsed (Story 8.5 AC-5): the actual time the bomb was live, bounded
  // to [0, timerMs] (remainingMs clamps at 0). This is what the BOMB_DEFUSED/
  // BOMB_EXPLODED announcement carries — the honest moment the round ended. Rounded
  // to integer ms: `remainingMs` carries sub-ms timer drift, and the session-end
  // archive stores these in INTEGER columns (Story 8.10) — fractional ms is noise
  // (the LCD formats whole units) and would reject the Postgres write.
  const displayedElapsedMs = Math.round(Math.max(0, session.config.timerMs - remainingMs(timer, now)));

  // SCORED elapsed (Story 8.10 AC-1, Jay's decision): a FAILED round (3rd-strike
  // `exploded` / `time-expired`) contributes a FULL-TIMER PENALTY — the full
  // `timerMs` — so failing is never cheaper than a slow defuse (resolves the
  // bugs-epic8:15 fast-fail loophole). A successful `defused` records its real
  // displayed elapsed. A timeout already had displayed = timerMs, so the penalty is
  // a no-op there; only fast detonations are affected. This is the value recorded
  // into cumulativeTimeMs / roundTimesMs; the announcement still uses the real one.
  const scoredElapsedMs = outcome === 'defused' ? displayedElapsedMs : session.config.timerMs;

  // (a) Clear the live clock BEFORE announcing. This trips the per-team fence
  // (so a stray re-arm/strike can no longer find a "live" timer and double-fire)
  // and cancels the pending wake — the same del-before-emit reasoning as
  // onTimerExpired. cancel() is a harmless no-op on the timeout path (the wake
  // already fired and dropped its own handle).
  deps.timer.cancel(sessionId, teamId);
  await deps.redis.del(timerKey(sessionId, teamId));

  // BETWEEN-ROUNDS GATE (Story 8.6): the session enters 'between-rounds' only
  // when EVERY participating team (those in round.defusers) has resolved — i.e.
  // this is the LAST team to finish. We detect that via the same per-team fence:
  // a resolved team's live timer key is gone (deleted above / on its own
  // resolution). After deleting THIS team's key, if no OTHER participating team
  // still has a live timer key, this resolution completes the round. Until then
  // the shared session status stays 'active' so a still-playing team is never
  // routed off its bomb mid-round (preserves Story 8.5 AC-3 end-to-end). This
  // read-check is race-safe because the whole ceremony runs inside the per-session
  // serialization chain (see `sessionChain.ts`): two teams cannot both observe the
  // other as still-live.
  let anotherTeamStillLive = false;
  for (const otherTeamId of Object.keys(round.defusers) as TeamId[]) {
    if (otherTeamId === teamId) continue;
    const otherTimer = await deps.redis.getJSON<TimerState>(timerKey(sessionId, otherTeamId));
    if (otherTimer !== null) {
      anotherTeamStillLive = true;
      break;
    }
  }
  const enteringBetweenRounds = session.status === 'active' && !anotherTeamStillLive;

  // (b) Record elapsed into this team's cumulativeTimeMs + per-round history, and
  // flip the session phase only when this resolution completes the round.
  // Immutable: spread new TeamState/SessionState, never mutate in place (project
  // rule). The maintained invariant is cumulativeTimeMs === sum(roundTimesMs).
  //
  // RETRY (Story 8.8, AC-2): a re-attempt (round.retry === true) must NOT append a
  // second entry for the same round — it REPLACES this round's recorded time with
  // the BETTER (lower) of the two attempts in place, shifting cumulativeTimeMs by
  // the (non-positive) delta. roundTimesMs.length stays stable and the invariant
  // holds. A first attempt (retry === false) appends exactly as before.
  //
  // MODEL B (Story 8.11): a team plays only a SUBSET of rounds, so `roundTimesMs`
  // is densely packed per the team's OWN turns — `roundNumber - 1` no longer
  // indexes it. A retry is always of the team's just-resolved (most recent) turn,
  // so the slot to replace is the LAST appended entry. (`length - 1` equals
  // `roundNumber - 1` in the old all-teams-play-every-round model, so this is
  // correct in both.)
  // `roundOutcomes` (Story 8.10) is maintained in LOCK-STEP with `roundTimesMs` —
  // the kept outcome must correspond to the kept time. On a retry the replaced
  // slot keeps the BETTER attempt's time, so it keeps that attempt's outcome too:
  // if the new (retried) score is strictly better it wins (e.g. a successful
  // re-defuse replaces the failed first attempt); otherwise the prior outcome (and
  // time) stand. (Retries only happen on failed rounds, so `previous` is a penalty
  // timerMs; a faster successful retry is always strictly better.)
  const idx = team.roundTimesMs.length - 1;
  let roundTimesMs: number[];
  let roundOutcomes: RoundOutcome[];
  let cumulativeTimeMs: number;
  if (round.retry && idx >= 0 && idx < team.roundTimesMs.length) {
    const previous = team.roundTimesMs[idx]!;
    const newIsBetter = scoredElapsedMs < previous;
    const best = newIsBetter ? scoredElapsedMs : previous;
    const bestOutcome = newIsBetter ? outcome : (team.roundOutcomes[idx] ?? outcome);
    roundTimesMs = team.roundTimesMs.map((t, i) => (i === idx ? best : t));
    roundOutcomes = team.roundOutcomes.map((o, i) => (i === idx ? bestOutcome : o));
    cumulativeTimeMs = team.cumulativeTimeMs + (best - previous); // delta ≤ 0
  } else {
    if (round.retry) {
      // Desync: a retry resolution with no existing slot to replace. Best-effort
      // append rather than throw (the 8.5/8.6 reducer/handler no-throw posture).
      deps.log.error(
        { sessionId, teamId, roundNumber, historyLen: team.roundTimesMs.length },
        'retry resolution with no prior round time — appending (desync fallback)',
      );
    }
    roundTimesMs = [...team.roundTimesMs, scoredElapsedMs];
    roundOutcomes = [...team.roundOutcomes, outcome];
    cumulativeTimeMs = team.cumulativeTimeMs + scoredElapsedMs;
  }

  // POINTER ADVANCE (Story 8.11, Task 2 — the single advance site for Model B):
  // the team that just played a NATURAL round advances `currentDefuserIndex` by
  // one (the next un-played slot); a team that just played an EQUALISATION round
  // (exhausted naturals, so no natural slot) bumps `equalisationRoundsPlayed` and
  // clears the consumed `equalisationVolunteerId`. A RETRY advances NOTHING (it is
  // the same round). `openPreparation` no longer advances anything, so this is the
  // only place a pointer moves. Immutable spread; the cumulative time/history
  // update is folded in.
  let teamUpdate: TeamState = { ...team, cumulativeTimeMs, roundTimesMs, roundOutcomes };
  if (!round.retry) {
    if (team.currentDefuserIndex < team.relayOrder.length) {
      teamUpdate = { ...teamUpdate, currentDefuserIndex: team.currentDefuserIndex + 1 };
    } else {
      const { equalisationVolunteerId: _consumed, ...rest } = teamUpdate;
      teamUpdate = { ...rest, equalisationRoundsPlayed: team.equalisationRoundsPlayed + 1 };
    }
  }

  const updatedSession: SessionState = {
    ...session,
    status: enteringBetweenRounds ? 'between-rounds' : session.status,
    teams: {
      ...session.teams,
      [teamId]: teamUpdate,
    },
  };
  await deps.redis.setJSON(sessionKey(sessionId), updatedSession);

  // (c) Record the round-level outcome (last-writer-wins across teams; see header)
  // PLUS the authoritative per-team outcome (Story 8.8) the retry-eligibility gate
  // reads (ROUND_RETRY allows only a team whose outcome was a failure).
  const updatedRound: RoundState = {
    ...round,
    status: outcome,
    outcomes: { ...round.outcomes, [teamId]: outcome },
  };
  await deps.redis.setJSON(roundKey(sessionId, roundNumber), updatedRound);

  // (d) Announce this team's result. BOMB_DEFUSED for a defuse; BOMB_EXPLODED for
  // both failure outcomes (DETONATED vs TIME EXPIRED is a client-side label, not
  // a 3rd event).
  const event = outcome === 'defused' ? 'BOMB_DEFUSED' : 'BOMB_EXPLODED';
  // Story 9.4: dual-target the lounge so a read-only spectator sees the same
  // resolution banner (DEFUSED / EXPLODED) the active team's Bomb Room gets.
  deps.io.to(bombAudience(sessionId, teamId)).emit(event, { teamId, elapsedMs: displayedElapsedMs });

  deps.log.info({ sessionId, teamId, outcome, displayedElapsedMs, scoredElapsedMs }, 'round resolved');

  // (e) Between-rounds entry (Story 8.6): once every team has resolved, announce
  // the new phase to ALL roles — broadcast the between-rounds SESSION_STATE
  // (clients route to the scoreboard surface) then emit the SCOREBOARD preview.
  // Persist-then-emit (the persist already happened in step b). The next round
  // does not start automatically — it waits on the facilitator's PREPARATION_OPEN.
  if (enteringBetweenRounds) {
    // Teams whose just-resolved round failed (Story 8.8) — drives the Facilitator's
    // "Retry round" affordance. Derived from the now-complete per-team outcomes.
    const failedTeams = (Object.entries(updatedRound.outcomes) as [TeamId, RoundOutcome][])
      .filter(([, o]) => o === 'exploded' || o === 'time-expired')
      .map(([t]) => t);
    deps.io.to(sessionRoom(sessionId)).emit('SESSION_STATE', updatedSession);
    deps.io
      .to(sessionRoom(sessionId))
      .emit('SCOREBOARD', { ...buildScoreboard(updatedSession), failedTeams });
    deps.log.info({ sessionId, roundNumber, failedTeams }, 'between-rounds — scoreboard preview emitted');

    // Story 3.7 (AC #6): the round is over — stop forwarding the just-active team's
    // Bomb Room into the lounge. Best-effort, AFTER the authoritative broadcast, so
    // a LiveKit failure never blocks the resolution. At this instant the resolved
    // team is still connected to its Bomb Room (it only re-mints to the lounge on
    // the NEXT round's open), so removing the forwarded ghost is race-free.
    void deps.loungeBridge?.unbridgeAll(sessionId).catch(() => undefined);

    // Story 9.2: mint spectator lifeline tokens. This fires EXACTLY ONCE per
    // completed round (the enteringBetweenRounds fence guarantees it — the last
    // team to resolve), AFTER the authoritative SESSION_STATE/SCOREBOARD broadcasts
    // so a lifelines failure can never delay or block round completion. Guarded on
    // the modifier (AC-2: off ⇒ no grant) AND `!round.retry` (AC-1: a retry replays
    // an already-spectated round, so it must not re-grant — mirrors the
    // pointer-advance `!round.retry` guard above).
    if (updatedSession.config.modifiers.spectatorLifelines && !round.retry) {
      // EARNER PREDICATE (Design Decision 1): everyone who WATCHED this round —
      // a non-Facilitator NOT on the just-played active team. Covers both a
      // genuine spectator (teamId undefined ≠ activeTeamId) and a resting-team
      // relay player (benched team ≠ activeTeamId); excludes the Facilitator and
      // the active team who played. `activeTeamId` still points at the just-played
      // team here (it only advances on the next PREPARATION_OPEN).
      const earners = Object.values(updatedSession.players).filter(
        (p) => p.role !== 'facilitator' && p.teamId !== updatedSession.activeTeamId,
      );
      // Grant each earner INDEPENDENTLY — a single grantToken failure must NOT
      // abort the rest (one earner's Redis hiccup shouldn't strand the others
      // ungranted, and a whole-loop catch would mislabel a partial success as
      // "no tokens" while some were already persisted). Only the successes are
      // collected for delivery. Serialized inside the per-session ceremony chain.
      const counts = new Map<string, number>();
      let minted = 0;
      for (const earner of earners) {
        try {
          const grant = await grantToken(deps.redis, sessionId, earner.playerId);
          counts.set(earner.playerId, grant.count);
          if (grant.minted) minted += 1;
        } catch (grantErr) {
          deps.log.error(
            { grantErr, sessionId, roundNumber, playerId: earner.playerId },
            'lifeline grant failed for one earner; others unaffected',
          );
        }
      }

      // Deliver each earner ONLY their own count — targeted per-socket, never on
      // the SESSION_STATE broadcast (AC-3/AC-4). Mirrors Story 9.1's per-Expert
      // fetchSockets emit. A player with no live socket simply misses this push
      // and re-hydrates from Redis on reconnect (Task 4). Wrapped separately from
      // the grant so a fetchSockets hiccup leaves the already-persisted counts
      // intact (clients re-hydrate on reconnect) and never fails the resolution.
      try {
        const sockets = await deps.io.in(sessionRoom(sessionId)).fetchSockets();
        for (const member of sockets) {
          const count = counts.get(member.data.playerId ?? '');
          if (count !== undefined) member.emit('LIFELINE_TOKENS', { count });
        }
      } catch (deliverErr) {
        deps.log.error(
          { deliverErr, sessionId, roundNumber },
          'lifeline token delivery failed; counts persisted, clients re-hydrate on reconnect',
        );
      }
      // `granted` counts the tokens actually MINTED (a clamped grant at the cap
      // persists nothing), `notified` the earners whose count was re-delivered —
      // so the log never overstates a partial or fully-clamped grant (review 9.2).
      deps.log.info(
        { sessionId, roundNumber, granted: minted, notified: counts.size },
        'lifeline tokens granted',
      );
    }
  }
}

/**
 * Defuse trigger (AC-1). The future server-side MODULE_INTERACT handler (Story
 * 4.7) calls this AFTER `bombReducer` produces `BombState.solved` transitioning
 * false→true. There is no live caller in the repo yet (no interaction handler) —
 * exercised directly by tests, exactly as 8.4 did with `escalateOnStrike`.
 */
export async function onBombDefused(
  deps: ResolveRoundDeps,
  sessionId: string,
  teamId: TeamId,
  now: number,
): Promise<void> {
  await resolveRound(deps, sessionId, teamId, 'defused', now);
}

/**
 * 3rd-strike trigger (AC-2). `escalateOnStrike` deliberately early-returns at
 * `strikes >= 3` (the terminal strike escalates nothing); the interaction handler
 * (Story 4.7) calls THIS instead when the post-reduce strike total reaches 3.
 * Exercised directly by tests until that handler exists.
 */
export async function onThirdStrike(
  deps: ResolveRoundDeps,
  sessionId: string,
  teamId: TeamId,
  now: number,
): Promise<void> {
  await resolveRound(deps, sessionId, teamId, 'exploded', now);
}
