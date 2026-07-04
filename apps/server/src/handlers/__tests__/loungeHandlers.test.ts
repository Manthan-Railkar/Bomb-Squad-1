import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { io as ioClient } from 'socket.io-client';
import type {
  SessionState,
  BombState,
  ModuleUpdate,
  StrikePayload,
  TimerState,
  BombContext,
  WireColor,
  ExpertManualPositionPayload,
} from '@bomb-squad/shared';
import { solveWires } from '@bomb-squad/shared';
import { registerSessionHandlers, loungeRoom, teamRoom } from '../sessionHandlers.js';
import { registerModuleHandlers } from '../moduleHandlers.js';
import { registerManualHandlers } from '../manualHandlers.js';
import { bombKey, sessionKey, timerKey, manualPositionKey } from '../../state/keys.js';
import {
  startTestSocketServer,
  createMemoryRedisStore,
  createTestScheduler,
  noopLog,
  fakeArchive,
  type TestSocketServer,
  type TestClientSocket,
  type MemoryRedisStore,
} from './testSocketServer.js';

/**
 * Story 9.4 — Spectator Lounge server plumbing (integration).
 *
 * Drives a REAL active round via SESSION_CREATE → JOIN → TEAM_ASSIGN →
 * PREPARATION_OPEN → ROUND_START so the lounge room is joined by the real handler
 * loop, then asserts:
 *  - Task 1: audience membership (spectator + resting player + facilitator IN the
 *    lounge; the active team is NOT), and the round-to-round flip.
 *  - Task 2: the active bomb stream is dual-targeted to the lounge (BOMB_INIT +
 *    TIMER at start, MODULE_UPDATE + STRIKE on interaction), the per-Expert manual
 *    map merges + replays on a mid-round join, and it clears at ROUND_START.
 *
 * NOTE (DD4 reconciliation): the story's Task-1 test bullet says "the facilitator
 * is NOT" a lounge member, which CONTRADICTS the confirmed DD4 ("the facilitator
 * watches the active bomb too") — a stale line from before DD4 landed. The
 * facilitator has no teamId, so it can only receive the active bomb stream via the
 * lounge room; it MUST be a member. These tests assert the facilitator IS in the
 * lounge, per DD4.
 */

const CTX_FIXED: BombContext = { serialNumber: 'AB1CD2', batteryCount: 0, indicators: [], ports: [] };

/** One three-wire wires module whose GDD solution IS `correctIndex` (see moduleHandlers.test). */
function wiresBomb(correctIndex: number): BombState {
  const layoutByIndex: Record<number, readonly WireColor[]> = {
    1: ['blue', 'blue', 'blue'], // no red → rule 3① cut the 2nd
    2: ['red', 'blue', 'yellow'], // otherwise → rule 3④ cut the last
  };
  const colors = layoutByIndex[correctIndex];
  if (!colors || solveWires(colors, CTX_FIXED) !== correctIndex) {
    throw new Error(`wiresBomb: no 3-wire layout solving at index ${correctIndex}`);
  }
  return {
    context: CTX_FIXED,
    modules: [{ moduleId: 'wires', status: 'armed', data: { wires: colors.map((color) => ({ color, cut: false })), ctx: CTX_FIXED } }],
    strikes: 0,
    solved: false,
  };
}

function nextEvent<T>(socket: TestClientSocket, event: string): Promise<T> {
  return new Promise<T>((resolve) => socket.once(event as 'SESSION_STATE', ((p: T) => resolve(p)) as never));
}

/** Settle 'seen'/'absent': true if `event` fires within `ms`, false on timeout. */
function seenWithin(socket: TestClientSocket, event: string, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), ms);
    socket.once(event as 'SESSION_STATE', (() => {
      clearTimeout(t);
      resolve(true);
    }) as never);
  });
}

describe('Story 9.4 — Spectator Lounge (server)', () => {
  let server: TestSocketServer;
  let store: MemoryRedisStore;
  let facilitator: TestClientSocket;
  let maya: TestClientSocket; // Team A — becomes Defuser (relayOrder[0])
  let alice: TestClientSocket; // Team A — Expert
  let bob: TestClientSocket; // Team A — Expert
  let devon: TestClientSocket; // Team B — resting
  let sam: TestClientSocket; // genuine Spectator

  beforeEach(async () => {
    store = createMemoryRedisStore();
    server = await startTestSocketServer((io) => {
      const scheduler = createTestScheduler({ redis: store, io, log: noopLog });
      registerSessionHandlers(io, { redis: store, log: noopLog, timer: scheduler, archive: fakeArchive });
      registerModuleHandlers(io, { redis: store, log: noopLog, timer: scheduler, archive: fakeArchive });
      registerManualHandlers(io, { redis: store, log: noopLog });
    });
    facilitator = await server.connectClient();
    maya = await server.connectClient();
    alice = await server.connectClient();
    bob = await server.connectClient();
    devon = await server.connectClient();
    sam = await server.connectClient();
  });

  afterEach(async () => {
    await server.close();
  });

  function createSession(): Promise<{ sessionId: string; joinCode: string }> {
    return new Promise((resolve) => facilitator.emit('SESSION_CREATE', {}, (ack) => resolve(ack)));
  }

  /** Join `socket`, resolving its durable playerId + reattachToken once state has landed. */
  function join(
    socket: TestClientSocket,
    joinCode: string,
    displayName: string,
    role: 'expert' | 'spectator',
  ): Promise<{ playerId: string; reattachToken: string }> {
    return new Promise((resolve) => {
      let identity: { playerId: string; reattachToken: string } | null = null;
      let gotState = false;
      const maybeDone = () => {
        if (identity !== null && gotState) resolve(identity);
      };
      socket.once('SESSION_IDENTITY', (p) => {
        identity = { playerId: p.playerId, reattachToken: p.reattachToken };
        maybeDone();
      });
      socket.once('SESSION_STATE', () => {
        gotState = true;
        maybeDone();
      });
      socket.emit('SESSION_JOIN', { joinCode, displayName, role });
    });
  }

  /**
   * Team A (active round 1) = Maya (Defuser) + Alice + Bob (Experts); Team B rests
   * = Devon (+ a synthetic pad to meet min size); Sam is a genuine Spectator. Assign
   * Maya to A FIRST so relayOrder[0] = Maya → she is the committed Defuser and
   * Alice/Bob stay Experts (the two multiview panes). Returns durable ids.
   */
  async function activeRound(opts: { staleManualMapBeforeStart?: Record<string, string> } = {}): Promise<{
    sessionId: string;
    ids: { maya: string; alice: string; bob: string; devon: string; sam: string };
    reattach: { sam: string };
  }> {
    const { sessionId, joinCode } = await createSession();
    const m = await join(maya, joinCode, 'Maya', 'expert');
    const a = await join(alice, joinCode, 'Alice', 'expert');
    const b = await join(bob, joinCode, 'Bob', 'expert');
    const d = await join(devon, joinCode, 'Devon', 'expert');
    const s = await join(sam, joinCode, 'Sam', 'spectator');

    const roster = [facilitator, maya, alice, bob, devon, sam];
    const broadcast = () => Promise.all(roster.map((sock) => nextEvent<SessionState>(sock, 'SESSION_STATE')));
    const assign = async (playerId: string, teamId: 'A' | 'B') => {
      const done = broadcast();
      facilitator.emit('TEAM_ASSIGN', { playerId, teamId, role: 'expert' });
      await done;
    };
    await assign(m.playerId, 'A');
    await assign(a.playerId, 'A');
    await assign(b.playerId, 'A');
    await assign(d.playerId, 'B');

    // Pad Team B to the min size of 2 with a synthetic socketless Expert (Team A
    // already has 3). Direct store write, no broadcast — mirrors the sessionHandlers
    // ROUND_START setup helper.
    const seeded = (await store.getJSON<SessionState>(sessionKey(sessionId)))!;
    const teamB = seeded.teams.B!;
    seeded.players['pad-B'] = { playerId: 'pad-B', displayName: 'Pad-B', role: 'expert', teamId: 'B', isReady: true };
    seeded.teams.B = { ...teamB, relayOrder: [...teamB.relayOrder, 'pad-B'] };
    await store.setJSON(sessionKey(sessionId), seeded);

    let done = broadcast();
    facilitator.emit('PREPARATION_OPEN');
    await done;

    // Optionally seed a stale per-Expert map just before ROUND_START, so a test can
    // prove the handler's del(manualPositionKey) actually clears it.
    if (opts.staleManualMapBeforeStart !== undefined) {
      await store.setJSON(manualPositionKey(sessionId), opts.staleManualMapBeforeStart);
    }

    const mayaTimer = nextEvent(maya, 'TIMER_UPDATE');
    facilitator.emit('ROUND_START');
    await mayaTimer;

    // Confirm the round shape the tests rely on: A active, Maya defuser, Alice/Bob experts.
    const state = (await store.getJSON<SessionState>(sessionKey(sessionId)))!;
    expect(state.activeTeamId).toBe('A');
    expect(state.players[m.playerId].role).toBe('defuser');
    expect(state.players[a.playerId].role).toBe('expert');
    expect(state.players[b.playerId].role).toBe('expert');

    return {
      sessionId,
      ids: { maya: m.playerId, alice: a.playerId, bob: b.playerId, devon: d.playerId, sam: s.playerId },
      reattach: { sam: s.reattachToken },
    };
  }

  // ── Task 1: lounge audience membership ──────────────────────────────────────
  it('ROUND_START: spectator + resting player + facilitator join the lounge; the active team does NOT', async () => {
    const { sessionId, ids } = await activeRound();

    const members = (await server.io.in(loungeRoom(sessionId)).fetchSockets()).map((sk) => sk.data.playerId);
    // Genuine spectator + resting Team-B player + the facilitator watch (DD4).
    expect(members).toContain(ids.sam);
    expect(members).toContain(ids.devon);
    expect(members.some((id) => id !== undefined && id !== ids.sam && id !== ids.devon)).toBe(true); // facilitator
    // The active team (Defuser + both Experts) is NEVER in the lounge.
    expect(members).not.toContain(ids.maya);
    expect(members).not.toContain(ids.alice);
    expect(members).not.toContain(ids.bob);
    // The facilitator, teamless, IS a member (would-be false under the stale bullet).
    const facId = Object.values((await store.getJSON<SessionState>(sessionKey(sessionId)))!.players).find(
      (p) => p.role === 'facilitator',
    )!.playerId;
    expect(members).toContain(facId);
  });

  // ── Task 2: the active bomb stream reaches the lounge ────────────────────────
  it('a spectator present at ROUND_START receives the dual-targeted BOMB_INIT + TIMER_UPDATE', async () => {
    // Sam is connected before ROUND_START, so the dual-target broadcast reaches him.
    const samBomb = nextEvent<BombState>(sam, 'BOMB_INIT');
    const samTimer = nextEvent<TimerState>(sam, 'TIMER_UPDATE');
    await activeRound();
    expect(await samBomb).toBeDefined();
    expect((await samTimer).remainingAtStart).toBeGreaterThan(0);
  });

  it('a Defuser cut broadcasts the same MODULE_UPDATE to the lounge; the spectator mirrors it', async () => {
    const { sessionId, ids: _ids } = await activeRound();
    await store.setJSON(bombKey(sessionId, 'A'), wiresBomb(1)); // controlled bomb

    const samUpdate = nextEvent<ModuleUpdate>(sam, 'MODULE_UPDATE');
    const mayaUpdate = nextEvent<ModuleUpdate>(maya, 'MODULE_UPDATE');
    maya.emit('MODULE_INTERACT', { teamId: 'A', moduleIndex: 0, action: { type: 'CUT', wireIndex: 1 } });

    const [su, mu] = await Promise.all([samUpdate, mayaUpdate]);
    expect(su).toEqual(mu); // the lounge sees exactly what the Bomb Room saw
    expect(su.state.status).toBe('solved');
  });

  it('a strike reaches the lounge', async () => {
    const { sessionId } = await activeRound();
    await store.setJSON(bombKey(sessionId, 'A'), wiresBomb(1));

    const samStrike = nextEvent<StrikePayload>(sam, 'STRIKE');
    maya.emit('MODULE_INTERACT', { teamId: 'A', moduleIndex: 0, action: { type: 'CUT', wireIndex: 0 } }); // wrong
    expect((await samStrike).strikes).toBe(1);
  });

  // ── Task 2: per-Expert manual multiview ─────────────────────────────────────
  it('two Experts navigate → the per-Expert map MERGES (neither clobbers the other)', async () => {
    const { sessionId, ids } = await activeRound();

    // Alice navigates first, then Bob — the second write must NOT overwrite the first.
    const aliceEcho = nextEvent<ExpertManualPositionPayload>(sam, 'EXPERT_MANUAL_POSITION');
    alice.emit('MANUAL_NAVIGATE', { chapterId: 'wires' });
    await aliceEcho;
    const bobEcho = nextEvent<ExpertManualPositionPayload>(sam, 'EXPERT_MANUAL_POSITION');
    bob.emit('MANUAL_NAVIGATE', { chapterId: 'keypads' });
    await bobEcho;

    const map = await store.getJSON<Record<string, string>>(manualPositionKey(sessionId));
    expect(map).toEqual({ [ids.alice]: 'wires', [ids.bob]: 'keypads' });
  });

  it('a mid-round-joining spectator is replayed the bomb + one EXPERT_MANUAL_POSITION per Expert', async () => {
    const { sessionId, ids, reattach } = await activeRound();
    await store.setJSON(bombKey(sessionId, 'A'), wiresBomb(1));

    // Two Experts have navigated before Sam refreshes.
    const aliceEcho = nextEvent(sam, 'EXPERT_MANUAL_POSITION');
    alice.emit('MANUAL_NAVIGATE', { chapterId: 'wires' });
    await aliceEcho;
    const bobEcho = nextEvent(sam, 'EXPERT_MANUAL_POSITION');
    bob.emit('MANUAL_NAVIGATE', { chapterId: 'keypads' });
    await bobEcho;

    sam.disconnect(); // refresh

    // Reconnect with the reattach token; collect the replayed positions before connect.
    const positions: ExpertManualPositionPayload[] = [];
    const rejoined = ioClient(server.url, {
      transports: ['websocket'],
      auth: { sessionId, reattachToken: reattach.sam },
    });
    const bombSeen = new Promise<BombState>((resolve) => rejoined.once('BOMB_INIT', (b) => resolve(b as BombState)));
    rejoined.on('EXPERT_MANUAL_POSITION', (p) => positions.push(p as ExpertManualPositionPayload));
    await new Promise<void>((resolve, reject) => {
      rejoined.once('connect', () => resolve());
      rejoined.once('connect_error', reject);
    });
    await bombSeen; // the active bomb was replayed
    // Give the per-Expert replay loop a beat to deliver both frames.
    await new Promise<void>((r) => setTimeout(r, 100));

    const byPlayer = Object.fromEntries(positions.map((p) => [p.playerId, p.chapterId]));
    expect(byPlayer).toEqual({ [ids.alice]: 'wires', [ids.bob]: 'keypads' });

    // And the reconnected spectator re-entered the lounge room.
    const members = (await server.io.in(loungeRoom(sessionId)).fetchSockets()).map((sk) => sk.data.playerId);
    expect(members).toContain(ids.sam);
    rejoined.disconnect();
  });

  it('ROUND_START deletes any stale per-Expert manual map so last round does not bleed in (R4)', async () => {
    // Seed a stale map immediately BEFORE ROUND_START; the handler's del must remove it.
    const { sessionId } = await activeRound({
      staleManualMapBeforeStart: { 'ghost-expert': 'defused-round-ago' },
    });
    expect(await store.getJSON(manualPositionKey(sessionId))).toBeNull();
  });

  it('a resting player is in BOTH its idle team room and the lounge (R5)', async () => {
    const { sessionId, ids } = await activeRound();
    const teamB = (await server.io.in(teamRoom(sessionId, 'B')).fetchSockets()).map((sk) => sk.data.playerId);
    const lounge = (await server.io.in(loungeRoom(sessionId)).fetchSockets()).map((sk) => sk.data.playerId);
    expect(teamB).toContain(ids.devon); // its own (idle) team room — delivers nothing surprising
    expect(lounge).toContain(ids.devon); // AND the lounge, where it watches the active bomb
  });
});
