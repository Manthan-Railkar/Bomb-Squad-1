import { describe, expect, it } from '@jest/globals';
import type { ModifierConfig, PlayerInfo, RoundState, SessionState, TeamId, TimerState } from '@bomb-squad/shared';
import { createMemoryRedisStore, noopLog, type MemoryRedisStore } from '../../handlers/__tests__/testSocketServer.js';
import type { SessionIOServer } from '../../handlers/sessionHandlers.js';
import { lifelinesKey, roundKey, sessionKey, timerKey } from '../../state/keys.js';
import { createSessionState } from '../../session/createSession.js';
import { startSegment } from '../../timer/timerCore.js';
import { resolveRound, type ResolveRoundDeps } from '../resolveRound.js';

interface Emitted {
  room: string;
  event: string;
  payload: unknown;
}
interface MemberEmit {
  playerId: string | undefined;
  event: string;
  payload: unknown;
}

/** A fake RemoteSocket with the fields the grant delivery touches. */
function fakeMember(playerId: string | undefined, sink: MemberEmit[]) {
  return {
    data: { playerId },
    emit(event: string, payload: unknown) {
      sink.push({ playerId, event, payload });
    },
  };
}

/**
 * fakeIo supporting BOTH `.to(room).emit()` (the between-rounds broadcasts) and
 * `.in(room).fetchSockets()` (the targeted per-player token delivery, Story 9.2).
 */
function fakeIo(emitted: Emitted[], members: ReturnType<typeof fakeMember>[]): SessionIOServer {
  return {
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          emitted.push({ room, event, payload });
        },
      };
    },
    in(_room: string) {
      return {
        async fetchSockets() {
          return members;
        },
      };
    },
  } as unknown as SessionIOServer;
}

const SID = 'sess-1';
const TIMER_MS = 300_000;
const ROUND_NUMBER = 1;

const MODIFIERS_ON: ModifierConfig = { asymmetricExpertRoles: false, spectatorLifelines: true };
const MODIFIERS_OFF: ModifierConfig = { asymmetricExpertRoles: false, spectatorLifelines: false };

/**
 * Roster: an active-team defuser (played), a resting-team defuser (watched), a
 * genuine spectator (watched), a TEAMLESS defuser (joined between rounds —
 * watched; review 9.2 pins that they earn), and the facilitator (never earns).
 */
const ROSTER: Record<string, PlayerInfo> = {
  ad: { playerId: 'ad', displayName: 'Ada', role: 'defuser', teamId: 'A', isReady: true },
  bd: { playerId: 'bd', displayName: 'Bex', role: 'defuser', teamId: 'B', isReady: true },
  sp: { playerId: 'sp', displayName: 'Sam', role: 'spectator', isReady: true },
  td: { playerId: 'td', displayName: 'Tia', role: 'defuser', isReady: true },
  fac: { playerId: 'fac', displayName: 'Fin', role: 'facilitator', isReady: true },
};

interface Harness {
  deps: ResolveRoundDeps;
  store: MemoryRedisStore;
  emitted: Emitted[];
  memberEmits: MemberEmit[];
}

async function makeHarness(opts?: {
  modifiers?: ModifierConfig;
  retry?: boolean;
  seedLifelines?: Record<string, number>;
}): Promise<Harness> {
  const store = createMemoryRedisStore();
  const emitted: Emitted[] = [];
  const memberEmits: MemberEmit[] = [];

  const base = createSessionState({
    sessionId: SID,
    joinCode: 'ABC123',
    facilitatorId: 'fac',
    config: { timerMs: TIMER_MS },
  });
  const session: SessionState = {
    ...base,
    status: 'active',
    activeTeamId: 'A',
    roundNumber: ROUND_NUMBER,
    config: { ...base.config, modifiers: opts?.modifiers ?? MODIFIERS_ON },
    players: ROSTER,
    teams: {
      A: {
        teamId: 'A',
        relayOrder: ['ad'],
        currentDefuserIndex: 0,
        cumulativeTimeMs: 0,
        roundTimesMs: [],
        roundOutcomes: [],
        equalisationRoundsPlayed: 0,
      },
    },
  };
  await store.setJSON(sessionKey(SID), session);

  const round: RoundState = {
    roundNumber: ROUND_NUMBER,
    status: 'active',
    defusers: { A: 'ad' },
    outcomes: {},
    retry: opts?.retry ?? false,
  };
  await store.setJSON(roundKey(SID, ROUND_NUMBER), round);
  await store.setJSON(timerKey(SID, 'A'), startSegment(TIMER_MS, 0));

  if (opts?.seedLifelines) await store.setJSON(lifelinesKey(SID), opts.seedLifelines);

  const members = Object.keys(ROSTER).map((pid) => fakeMember(pid, memberEmits));
  return {
    deps: { redis: store, io: fakeIo(emitted, members), log: noopLog, timer: { cancel: () => {} } },
    store,
    emitted,
    memberEmits,
  };
}

const loadLifelines = (h: Harness) =>
  h.store.getJSON<Record<string, number>>(lifelinesKey(SID));
const tokenEmits = (h: Harness) => h.memberEmits.filter((m) => m.event === 'LIFELINE_TOKENS');

describe('resolveRound — lifeline grant (Story 9.2, AC-1/AC-4)', () => {
  it('grants +1 to every watcher (resting-team + spectator + teamless), NOT the active team or facilitator', async () => {
    const h = await makeHarness();
    await resolveRound(h.deps, SID, 'A', 'defused', 60_000);

    // Only the three watchers are in the map; the active-team defuser and the
    // facilitator are absent (never granted). The teamless defuser earning is
    // Design Decision 1 as resolved at review: they watched, they earn.
    expect(await loadLifelines(h)).toEqual({ bd: 1, sp: 1, td: 1 });

    // Targeted delivery: each watcher receives their OWN count; ad + fac get none.
    const emits = tokenEmits(h);
    expect(emits).toHaveLength(3);
    expect(emits.find((e) => e.playerId === 'bd')?.payload).toEqual({ count: 1 });
    expect(emits.find((e) => e.playerId === 'sp')?.payload).toEqual({ count: 1 });
    expect(emits.find((e) => e.playerId === 'td')?.payload).toEqual({ count: 1 });
    expect(emits.some((e) => e.playerId === 'ad')).toBe(false);
    expect(emits.some((e) => e.playerId === 'fac')).toBe(false);
  });

  it('never places token counts on the SESSION_STATE broadcast (AC-3)', async () => {
    const h = await makeHarness();
    await resolveRound(h.deps, SID, 'A', 'defused', 60_000);
    const sessionState = h.emitted.find((e) => e.event === 'SESSION_STATE')?.payload as Record<string, unknown>;
    expect(sessionState).toBeDefined();
    expect(sessionState).not.toHaveProperty('lifelines');
    expect(sessionState).not.toHaveProperty('lifelineTokens');
  });

  it('clamps at the cap — a watcher already at 3 stays at 3 after another completed round (AC-1)', async () => {
    // Sam sat through three prior rounds (seeded at the cap). A fourth completed
    // round leaves the balance at 3, and the re-emit carries the clamped 3.
    const h = await makeHarness({ seedLifelines: { sp: 3 } });
    await resolveRound(h.deps, SID, 'A', 'defused', 60_000);
    expect((await loadLifelines(h))!.sp).toBe(3);
    expect(tokenEmits(h).find((e) => e.playerId === 'sp')?.payload).toEqual({ count: 3 });
  });

  it('a RETRY resolution grants nothing (the round was already spectated once, AC-1)', async () => {
    const h = await makeHarness({ retry: true, seedLifelines: { sp: 1 } });
    await resolveRound(h.deps, SID, 'A', 'defused', 40_000);
    // No new grant: Sam stays at his prior 1, and no LIFELINE_TOKENS is emitted.
    expect((await loadLifelines(h))!.sp).toBe(1);
    expect(tokenEmits(h)).toHaveLength(0);
  });

  it('modifier OFF → no grant, no event (AC-2)', async () => {
    const h = await makeHarness({ modifiers: MODIFIERS_OFF });
    await resolveRound(h.deps, SID, 'A', 'defused', 60_000);
    expect(await loadLifelines(h)).toBeNull();
    expect(tokenEmits(h)).toHaveLength(0);
  });

  it('grants on a FAILED round too (watching is watching, regardless of outcome)', async () => {
    const h = await makeHarness();
    await resolveRound(h.deps, SID, 'A', 'time-expired', TIMER_MS + 1);
    expect(await loadLifelines(h)).toEqual({ bd: 1, sp: 1, td: 1 });
  });

  it('a total lifelines failure never fails the resolution (fail-safe) — round still records + broadcasts', async () => {
    const h = await makeHarness();
    // Every grant throws (Redis down). Per-earner catch swallows each → no tokens,
    // no emits, but the round is already recorded and broadcast. Scoped to the
    // lifelines key ONLY (review 9.2): an all-key rejection would silently start
    // asserting the wrong failure if the ceremony itself ever adopts updateJSON.
    const realUpdate = h.deps.redis.updateJSON.bind(h.deps.redis);
    h.deps.redis.updateJSON = ((key, mutate, opts) =>
      key === lifelinesKey(SID)
        ? Promise.reject(new Error('redis down'))
        : realUpdate(key, mutate, opts)) as typeof h.deps.redis.updateJSON;
    await expect(resolveRound(h.deps, SID, 'A', 'defused', 60_000)).resolves.toBeUndefined();
    const after = (await h.store.getJSON<SessionState>(sessionKey(SID)))!;
    expect(after.status).toBe('between-rounds');
    expect(h.emitted.some((e) => e.event === 'SESSION_STATE')).toBe(true);
    expect(tokenEmits(h)).toHaveLength(0);
  });

  it('a PARTIAL grant failure does not strand the other earners (per-earner resilience)', async () => {
    // Fail ONLY sp's grant, identified by WHICH PLAYER the mutate targets — not by
    // call ordinal (review 9.2: an ordinal couples the test to earner iteration
    // order and to how many updateJSON calls precede the grant loop). bd must
    // still be granted AND notified; sp gets neither — the failure of one never
    // aborts the loop (the defect flagged in the 9.1-review carry-over).
    const h = await makeHarness();
    const realUpdate = h.deps.redis.updateJSON.bind(h.deps.redis);
    h.deps.redis.updateJSON = (async (key, mutate, opts) => {
      if (key === lifelinesKey(SID)) {
        // Probe the pure mutate to see whose entry this grant would move.
        const current = await h.store.getJSON<Record<string, number>>(lifelinesKey(SID));
        const probe = (mutate as (c: Record<string, number> | null) => {
          commit: boolean;
          value?: Record<string, number>;
        })(current);
        if (probe.commit && probe.value?.sp !== current?.sp) {
          return Promise.reject(new Error("redis blip for sp's grant"));
        }
      }
      return realUpdate(key, mutate, opts);
    }) as typeof h.deps.redis.updateJSON;

    await resolveRound(h.deps, SID, 'A', 'defused', 60_000);

    // bd + td persisted + notified; sp neither — the loop survived sp's failure
    // and carried on to the earners AFTER it.
    expect(await loadLifelines(h)).toEqual({ bd: 1, td: 1 });
    const emits = tokenEmits(h);
    expect(emits).toHaveLength(2);
    expect(emits.find((e) => e.playerId === 'bd')?.payload).toEqual({ count: 1 });
    expect(emits.find((e) => e.playerId === 'td')?.payload).toEqual({ count: 1 });
    expect(emits.some((e) => e.playerId === 'sp')).toBe(false);
  });
});
