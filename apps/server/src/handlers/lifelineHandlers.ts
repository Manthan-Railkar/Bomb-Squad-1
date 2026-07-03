import type { Server as SocketIOServer, DefaultEventsMap } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SessionState,
} from '@bomb-squad/shared';
import { isLifelinePromptId } from '@bomb-squad/shared';
import type { RedisStore } from '../state/redis.js';
import { sessionKey } from '../state/keys.js';
import { teamRoom, type SessionLog, type SessionSocketData } from './sessionHandlers.js';
import { spendToken } from '../lifelines/lifelineTokens.js';

/** Typed server alias declared locally to avoid an import cycle with index.ts. */
type LifelineIOServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SessionSocketData
>;

export interface LifelineHandlerDeps {
  redis: RedisStore;
  log: SessionLog;
}

type LifelineSendParseResult =
  | { ok: true; promptId: string }
  | { ok: false; message: string };

/**
 * Boundary validation for the untrusted LIFELINE_SEND payload (AC-4, fail-CLOSED).
 * Unlike MANUAL_NAVIGATE's permissive kebab regex, this validates against the
 * FIXED prompt set — an id the server doesn't recognise is rejected before any
 * lookup, so a malicious client can never inject an arbitrary hint. The wire
 * carries only the id; the hint text lives in the shared list, never on the wire.
 */
export function parseLifelineSendPayload(payload: unknown): LifelineSendParseResult {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, message: 'payload must be an object' };
  }
  const { promptId } = payload as { promptId?: unknown };
  if (typeof promptId !== 'string' || !isLifelinePromptId(promptId)) {
    return { ok: false, message: 'promptId must be one of the fixed lifeline prompts' };
  }
  return { ok: true, promptId };
}

/**
 * Spectator lifeline send (Story 9.3). A watching player spends one token to
 * deliver a pre-defined hint to the active team's Bomb Room. Not game state: no
 * reducer is involved and the handler owns the whole flow — parse/validate →
 * load session → authority/modifier/actor gates → spend one token (CAS) →
 * toast the team room + echo the sender's new balance.
 *
 * NEVER-THROW posture (mirrors registerManualHandlers): a bad payload is a typed
 * ERROR; every authority/eligibility miss (no session, wrong actor, modifier off,
 * no active team, 0 tokens) is a SILENT no-op — nothing is "wrong", the actor
 * simply has no lifeline surface. The server is the sole authority: it re-checks
 * the token holding server-side regardless of what the client's (hidden-at-0)
 * affordance showed (AC-2/3). The load/spend/emit is try/catch-wrapped so no path
 * throws out of the socket handler.
 */
export function registerLifelineHandlers(io: LifelineIOServer, deps: LifelineHandlerDeps): void {
  io.on('connection', (socket) => {
    socket.on('LIFELINE_SEND', async (payload) => {
      const parsed = parseLifelineSendPayload(payload);
      if (!parsed.ok) {
        // AC-4: unknown / malformed promptId → rejected, no deduction, no toast.
        socket.emit('ERROR', { code: 'INVALID_PAYLOAD', message: parsed.message, recoverable: true });
        return;
      }

      // socket.data.sessionId is a pointer to WHICH session to load — never
      // authority. Authority is the gate chain against freshly loaded state.
      const sessionId = socket.data.sessionId;
      if (sessionId === undefined) return; // no session → silent no-op

      try {
        const state = await deps.redis.getJSON<SessionState>(sessionKey(sessionId));
        if (state === null) return; // stale pointer (session evicted) → silent no-op

        // Authority resolves against the durable playerId (Story 2.7), never the
        // rotating socket.id — a spectator who reconnects keeps their tokens.
        const playerId = socket.data.playerId;
        if (playerId === undefined) return;

        // Modifier gate (AC-1): lifelines off ⇒ no send surface at all.
        if (!state.config.modifiers.spectatorLifelines) return;

        // Actor gate: the sender must be an eligible WATCHER — the same earner
        // predicate as Story 9.2 (a non-Facilitator NOT on the active team). A
        // player on the active team or the Facilitator has no lifeline surface;
        // their send is a silent no-op (nothing is wrong — they simply can't spend).
        const activeTeamId = state.activeTeamId;
        const player = state.players[playerId];
        if (
          activeTeamId === undefined ||
          player === undefined ||
          player.role === 'facilitator' ||
          player.teamId === activeTeamId
        ) {
          return;
        }

        // Spend one token (CAS, re-validated server-side — AC-2/3). A 0-token /
        // absent holder returns ok:false with NO state change: no toast, no
        // deduction, no negative balance. Prefer a silent no-op (the affordance
        // was hidden at 0 anyway) over a soft error.
        const { ok, count } = await spendToken(deps.redis, sessionId, playerId);
        if (!ok) return;

        // Persist-then-emit. The team room IS the Bomb Room (Defuser + Experts of
        // the active team); the sender and Facilitator are NOT in it, so the
        // sender never sees their own toast. Never leak the playerId — fall back
        // to a generic name if the display name is somehow absent.
        const fromName = player.displayName || 'A spectator';
        io.to(teamRoom(sessionId, activeTeamId)).emit('LIFELINE_TOAST', {
          promptId: parsed.promptId,
          fromName,
        });
        // Echo the sender's new balance so their counter drops to N−1 immediately
        // (AC-2) and the affordance self-hides at 0.
        socket.emit('LIFELINE_TOKENS', { count });
        deps.log.info(
          { sessionId, playerId, promptId: parsed.promptId, count },
          'lifeline sent',
        );
      } catch (err) {
        deps.log.error({ err, socketId: socket.id }, 'LIFELINE_SEND failed');
        socket.emit('ERROR', {
          code: 'LIFELINE_SEND_FAILED',
          message: 'Could not send your lifeline. Try again.',
          recoverable: true,
        });
      }
    });
  });
}
