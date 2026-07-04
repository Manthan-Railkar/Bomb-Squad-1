import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import type {
  SessionState,
  SessionCreatedPayload,
  LifelineToastPayload,
  LifelineTokensPayload,
  ErrorPayload,
} from '@bomb-squad/shared';
import { registerSessionHandlers } from '../sessionHandlers.js';
import { registerManualHandlers } from '../manualHandlers.js';
import { registerLifelineHandlers, parseLifelineSendPayload } from '../lifelineHandlers.js';
import { sessionKey, lifelinesKey } from '../../state/keys.js';
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
 * LIFELINE_SEND handler (Story 9.3) — integration through a real socket
 * round-trip. The session is driven to an active round via the real
 * SESSION_CREATE → JOIN → TEAM_ASSIGN → PREPARATION_OPEN → ROUND_START flow (so
 * Team A's Bomb Room room is joined), then the stored SessionState is patched to
 * turn the Spectator-Lifelines modifier ON and the lifelines map is seeded — the
 * handler reads fresh Redis state on every send, so these patches are authoritative.
 */

const VALID_PROMPT = 're-read-section';

function nextEvent<T>(socket: TestClientSocket, event: string): Promise<T> {
  return new Promise<T>((resolve) => {
    socket.once(event as 'SESSION_STATE', ((payload: T) => resolve(payload)) as never);
  });
}

/** Resolves true if the event fires within ms, false otherwise (absence assert). */
function eventWithin(socket: TestClientSocket, event: string, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const onEvent = (() => {
      clearTimeout(timer);
      resolve(true);
    }) as never;
    const timer = setTimeout(() => {
      // Remove the listener on timeout (review 9.3) — a leaked `once` would
      // swallow the next same-named event later in the same test.
      socket.off(event as 'LIFELINE_TOAST', onEvent);
      resolve(false);
    }, ms);
    socket.once(event as 'LIFELINE_TOAST', onEvent);
  });
}

function createSession(socket: TestClientSocket): Promise<SessionCreatedPayload> {
  return new Promise((resolve) => socket.emit('SESSION_CREATE', {}, resolve));
}

function idOf(state: SessionState, displayName: string): string {
  return Object.values(state.players).find((p) => p.displayName === displayName)!.playerId;
}

describe('parseLifelineSendPayload (fail-closed against the fixed set)', () => {
  it('accepts a promptId in the fixed list', () => {
    expect(parseLifelineSendPayload({ promptId: VALID_PROMPT })).toEqual({
      ok: true,
      promptId: VALID_PROMPT,
    });
  });

  it.each([
    ['null payload', null],
    ['array payload', [VALID_PROMPT]],
    ['missing promptId', {}],
    ['non-string promptId', { promptId: 7 }],
    ['empty promptId', { promptId: '' }],
    ['unknown promptId (AC-4)', { promptId: 'inject-arbitrary-text' }],
  ])('rejects %s', (_label, payload) => {
    expect(parseLifelineSendPayload(payload).ok).toBe(false);
  });
});

describe('LIFELINE_SEND handler', () => {
  let server: TestSocketServer;
  let store: MemoryRedisStore;
  let facilitator: TestClientSocket;
  let maya: TestClientSocket; // Team A Defuser
  let devon: TestClientSocket; // Team A Expert
  let sam: TestClientSocket; // Spectator (no team)

  beforeEach(async () => {
    store = createMemoryRedisStore();
    server = await startTestSocketServer((io) => {
      registerSessionHandlers(io, {
        redis: store,
        log: noopLog,
        timer: createTestScheduler({ redis: store, io, log: noopLog }),
        archive: fakeArchive,
      });
      registerManualHandlers(io, { redis: store, log: noopLog });
      registerLifelineHandlers(io, { redis: store, log: noopLog });
    });
    facilitator = await server.connectClient();
    maya = await server.connectClient();
    devon = await server.connectClient();
    sam = await server.connectClient();
  });

  afterEach(async () => {
    await server.close();
  });

  /** Join and resolve the joiner's durable playerId once SESSION_STATE has landed. */
  function join(
    socket: TestClientSocket,
    joinCode: string,
    displayName: string,
    role: 'defuser' | 'expert' | 'spectator',
  ): Promise<string> {
    return new Promise((resolve) => {
      let playerId: string | null = null;
      let gotState = false;
      const maybeDone = () => {
        if (playerId !== null && gotState) resolve(playerId);
      };
      socket.once('SESSION_IDENTITY', (p) => {
        playerId = p.playerId;
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
   * Drive to an active round with Maya (Defuser) + Devon (Expert) on Team A and
   * Sam a Spectator. Then turn the modifier ON and seed Sam's token map. Returns
   * the durable ids.
   */
  async function activeRound(seed: {
    samTokens?: number;
    mayaTokens?: number;
    modifier?: boolean;
  } = {}): Promise<{ sessionId: string; mayaId: string; devonId: string; samId: string }> {
    const ack = await createSession(facilitator);
    const mayaId = await join(maya, ack.joinCode, 'Maya', 'expert');
    const devonId = await join(devon, ack.joinCode, 'Devon', 'expert');
    const samId = await join(sam, ack.joinCode, 'Sam', 'spectator');

    const teamed = () =>
      Promise.all([facilitator, maya, devon].map((s) => nextEvent(s, 'SESSION_STATE')));
    let done = teamed();
    facilitator.emit('TEAM_ASSIGN', { playerId: mayaId, teamId: 'A', role: 'defuser' });
    await done;
    done = teamed();
    facilitator.emit('TEAM_ASSIGN', { playerId: devonId, teamId: 'A', role: 'expert' });
    await done;
    done = teamed();
    facilitator.emit('PREPARATION_OPEN');
    await done;

    const mayaTimer = nextEvent(maya, 'TIMER_UPDATE');
    facilitator.emit('ROUND_START');
    await mayaTimer;

    // Patch modifier + seed tokens directly in Redis (handler reads fresh state).
    const state = (await store.getJSON<SessionState>(sessionKey(ack.sessionId)))!;
    state.config.modifiers.spectatorLifelines = seed.modifier ?? true;
    await store.setJSON(sessionKey(ack.sessionId), state);
    const map: Record<string, number> = {};
    if (seed.samTokens !== undefined) map[samId] = seed.samTokens;
    if (seed.mayaTokens !== undefined) map[mayaId] = seed.mayaTokens;
    await store.setJSON(lifelinesKey(ack.sessionId), map);

    return { sessionId: ack.sessionId, mayaId, devonId, samId };
  }

  it('eligible spectator with a token → toast to the Bomb Room + balance echo; sender/facilitator excluded', async () => {
    const { sessionId, samId } = await activeRound({ samTokens: 1 });

    const mayaToast = nextEvent<LifelineToastPayload>(maya, 'LIFELINE_TOAST');
    const devonToast = nextEvent<LifelineToastPayload>(devon, 'LIFELINE_TOAST');
    const samEcho = nextEvent<LifelineTokensPayload>(sam, 'LIFELINE_TOKENS');
    // The sender and facilitator are NOT in the team room → assert absence.
    const samToastSeen = eventWithin(sam, 'LIFELINE_TOAST', 200);
    const facToastSeen = eventWithin(facilitator, 'LIFELINE_TOAST', 200);

    sam.emit('LIFELINE_SEND', { promptId: VALID_PROMPT });

    expect(await mayaToast).toEqual({ promptId: VALID_PROMPT, fromName: 'Sam' });
    expect(await devonToast).toEqual({ promptId: VALID_PROMPT, fromName: 'Sam' });
    expect(await samEcho).toEqual({ count: 0 });
    expect(await samToastSeen).toBe(false);
    expect(await facToastSeen).toBe(false);

    // The token was spent — map decremented by exactly 1.
    const map = await store.getJSON<Record<string, number>>(lifelinesKey(sessionId));
    expect(map).toEqual({ [samId]: 0 });
  });

  it('0 tokens → refused: no toast, no deduction, no state change (AC-3)', async () => {
    const { sessionId, samId } = await activeRound({ samTokens: 0 });

    const mayaToastSeen = eventWithin(maya, 'LIFELINE_TOAST', 200);
    const samEchoSeen = eventWithin(sam, 'LIFELINE_TOKENS', 200);
    sam.emit('LIFELINE_SEND', { promptId: VALID_PROMPT });

    expect(await mayaToastSeen).toBe(false);
    expect(await samEchoSeen).toBe(false);
    const map = await store.getJSON<Record<string, number>>(lifelinesKey(sessionId));
    expect(map).toEqual({ [samId]: 0 }); // unchanged
  });

  it('unknown promptId → ERROR, no toast, no deduction (AC-4 fail-closed)', async () => {
    const { sessionId, samId } = await activeRound({ samTokens: 1 });

    const errorPromise = nextEvent<ErrorPayload>(sam, 'ERROR');
    const mayaToastSeen = eventWithin(maya, 'LIFELINE_TOAST', 200);
    sam.emit('LIFELINE_SEND', { promptId: 'inject-arbitrary-text' });

    const error = await errorPromise;
    expect(error.code).toBe('INVALID_PAYLOAD');
    expect(error.recoverable).toBe(true);
    expect(await mayaToastSeen).toBe(false);
    const map = await store.getJSON<Record<string, number>>(lifelinesKey(sessionId));
    expect(map).toEqual({ [samId]: 1 }); // not deducted
  });

  it('an active-team player cannot spend → no-op, no toast, token intact', async () => {
    const { sessionId, mayaId } = await activeRound({ mayaTokens: 1 });

    const devonToastSeen = eventWithin(devon, 'LIFELINE_TOAST', 200);
    const mayaEchoSeen = eventWithin(maya, 'LIFELINE_TOKENS', 200);
    maya.emit('LIFELINE_SEND', { promptId: VALID_PROMPT });

    expect(await devonToastSeen).toBe(false);
    expect(await mayaEchoSeen).toBe(false);
    const map = await store.getJSON<Record<string, number>>(lifelinesKey(sessionId));
    expect(map).toEqual({ [mayaId]: 1 }); // active-team actor never spends
  });

  it('the TEAMLESS facilitator cannot spend → silent no-op', async () => {
    await activeRound({ samTokens: 1 });
    const mayaToastSeen = eventWithin(maya, 'LIFELINE_TOAST', 200);
    facilitator.emit('LIFELINE_SEND', { promptId: VALID_PROMPT });
    expect(await mayaToastSeen).toBe(false);
  });

  it('Story 9.5 (DD3): a TEAMED facilitator on the RESTING team CAN spend (role is a play role)', async () => {
    // The facilitator opted onto resting Team B with a play role — the spend
    // gate excludes only `role === 'facilitator' || teamId === activeTeamId`, so
    // a facilitator whose role is now 'spectator'/'expert' and who sits off the
    // active team spends like any resting player. Seed that shape directly (same
    // pattern as the resting-team-player test); the facilitator socket's
    // data.playerId is the durable facilitator id.
    const { sessionId } = await activeRound({ samTokens: 0 });
    const state = (await store.getJSON<SessionState>(sessionKey(sessionId)))!;
    const facId = state.facilitatorPlayerId!;
    state.players[facId].role = 'spectator';
    state.players[facId].teamId = 'B';
    await store.setJSON(sessionKey(sessionId), state);
    await store.setJSON(lifelinesKey(sessionId), { [facId]: 1 });

    const mayaToast = nextEvent<LifelineToastPayload>(maya, 'LIFELINE_TOAST');
    const facEcho = nextEvent<LifelineTokensPayload>(facilitator, 'LIFELINE_TOKENS');
    facilitator.emit('LIFELINE_SEND', { promptId: VALID_PROMPT });

    expect(await mayaToast).toEqual({ promptId: VALID_PROMPT, fromName: 'Facilitator' });
    expect(await facEcho).toEqual({ count: 0 });
    const map = await store.getJSON<Record<string, number>>(lifelinesKey(sessionId));
    expect(map).toEqual({ [facId]: 0 }); // spent exactly one
  });

  it('modifier OFF → silent no-op even for an eligible token holder', async () => {
    const { sessionId, samId } = await activeRound({ samTokens: 1, modifier: false });

    const mayaToastSeen = eventWithin(maya, 'LIFELINE_TOAST', 200);
    sam.emit('LIFELINE_SEND', { promptId: VALID_PROMPT });

    expect(await mayaToastSeen).toBe(false);
    const map = await store.getJSON<Record<string, number>>(lifelinesKey(sessionId));
    expect(map).toEqual({ [samId]: 1 }); // untouched
  });

  it('a RESTING-TEAM player is an eligible sender — toast to the active Bomb Room + echo (review 9.3)', async () => {
    // The earner predicate admits any non-Facilitator NOT on the active team —
    // including a benched Team-B player, the one eligible class the client's
    // resting branch explicitly mounts the panel for. Sam joined teamless; park
    // him on Team B in the stored state (the handler reads fresh Redis state, and
    // room membership is irrelevant for a SENDER — only recipients need the room).
    const { sessionId, samId } = await activeRound({ samTokens: 1 });
    const state = (await store.getJSON<SessionState>(sessionKey(sessionId)))!;
    state.players[samId].teamId = 'B';
    await store.setJSON(sessionKey(sessionId), state);

    const mayaToast = nextEvent<LifelineToastPayload>(maya, 'LIFELINE_TOAST');
    const samEcho = nextEvent<LifelineTokensPayload>(sam, 'LIFELINE_TOKENS');
    sam.emit('LIFELINE_SEND', { promptId: VALID_PROMPT });

    expect(await mayaToast).toEqual({ promptId: VALID_PROMPT, fromName: 'Sam' });
    expect(await samEcho).toEqual({ count: 0 });
    const map = await store.getJSON<Record<string, number>>(lifelinesKey(sessionId));
    expect(map).toEqual({ [samId]: 0 });
  });

  it.each([
    ['between-rounds', (s: SessionState) => { s.status = 'between-rounds'; }],
    ['preparation', (s: SessionState) => { s.status = 'preparation'; }],
    ['paused mid-round', (s: SessionState) => { s.pausedAt = 12_345; s.pauseKind = 'facilitator'; }],
  ])('phase gate: a send during %s → silent no-op, no deduction (review 9.3)', async (_label, mutate) => {
    const { sessionId, samId } = await activeRound({ samTokens: 1 });
    const state = (await store.getJSON<SessionState>(sessionKey(sessionId)))!;
    mutate(state);
    await store.setJSON(sessionKey(sessionId), state);

    const mayaToastSeen = eventWithin(maya, 'LIFELINE_TOAST', 200);
    const samEchoSeen = eventWithin(sam, 'LIFELINE_TOKENS', 200);
    sam.emit('LIFELINE_SEND', { promptId: VALID_PROMPT });

    expect(await mayaToastSeen).toBe(false);
    expect(await samEchoSeen).toBe(false);
    const map = await store.getJSON<Record<string, number>>(lifelinesKey(sessionId));
    expect(map).toEqual({ [samId]: 1 }); // token intact
  });

  it('a socket not in any session → silent no-op (no crash, no error storm)', async () => {
    const outsider = await server.connectClient();
    let errored = false;
    outsider.on('ERROR', () => {
      errored = true;
    });
    outsider.emit('LIFELINE_SEND', { promptId: VALID_PROMPT });
    // Give the server a beat; a not-in-session send is silent (unlike a bad payload).
    await new Promise((r) => setTimeout(r, 100));
    expect(errored).toBe(false);
  });
});
