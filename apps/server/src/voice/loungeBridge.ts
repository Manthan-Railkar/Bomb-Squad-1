/**
 * Bomb Room → Spectator Lounge one-way audio bridge — lifecycle manager (Story 3.7).
 *
 * The actual audio-forwarding is done by a per-session RELAY BOT (see
 * {@link ./loungeRelayBot.ts}) — a headless `@livekit/rtc-node` participant that
 * listens in the active Bomb Room and republishes into the lounge. This class owns
 * only the LIFECYCLE: exactly one bot per session (sequential relay means one team
 * is active at a time, Story 8.11), spun up when a round opens and torn down when
 * it resolves / the session ends.
 *
 * We moved off `RoomServiceClient.forwardParticipant` after the integration test
 * proved it is unimplemented on self-hosted LiveKit (see the
 * `livekit-forwardparticipant-not-implemented-oss` memory). The public surface the
 * game handlers drive — `bridgeActiveTeam` / `unbridgeAll` — is unchanged, so the
 * `PREPARATION_OPEN` / resolve / `SESSION_END` hooks did not move.
 *
 * Every method is BEST-EFFORT: a LiveKit/bot failure is logged and swallowed so a
 * voice-infra hiccup can never block a game transition (AC #5). Handlers call this
 * AFTER the authoritative state write + broadcast.
 */
import type { TeamId } from '@bomb-squad/shared';
import type { RelayBot, RelayBotFactory } from './loungeRelayBot.js';

/** Minimal structural logger (pino/Fastify-compatible), matching `SessionLog`. */
export interface BridgeLog {
  info(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

/** Connection facts the bots need — injected once at construction. */
export interface LoungeBridgeConfig {
  /** Server-reachable ws:// signaling URL (derived from LIVEKIT_SERVER_URL). */
  wsUrl: string;
  apiKey: string;
  apiSecret: string;
}

export class LoungeBridge {
  /** One relay bot per session (only one team is active at a time — Story 8.11). */
  private readonly bots = new Map<string, RelayBot>();

  constructor(
    private readonly config: LoungeBridgeConfig,
    private readonly log: BridgeLog,
    /** Injected so unit tests can supply a fake bot without a real LiveKit. */
    private readonly createRelay: RelayBotFactory,
  ) {}

  /**
   * Bridge the active team's Bomb Room audio into the session lounge. Tears down any
   * prior bot for this session first (idempotent — a turn flip to a new active team,
   * or a re-open of the same team, replaces the bot cleanly), then starts a fresh one.
   */
  async bridgeActiveTeam(sessionId: string, activeTeamId: TeamId): Promise<void> {
    await this.unbridgeAll(sessionId);
    const bot = this.createRelay({
      wsUrl: this.config.wsUrl,
      apiKey: this.config.apiKey,
      apiSecret: this.config.apiSecret,
      sessionId,
      teamId: activeTeamId,
      log: this.log,
    });
    // Register BEFORE start so a start that partially connects is still tracked and
    // can be torn down by a later unbridge.
    this.bots.set(sessionId, bot);
    try {
      await bot.start();
    } catch (err) {
      // Best-effort: a bot that fails to start must not surface into the caller. Drop
      // it (nothing to tear down) — the next round-open re-attempts.
      this.log.error({ err, sessionId, activeTeamId }, 'loungeBridge: relay bot failed to start');
      if (this.bots.get(sessionId) === bot) this.bots.delete(sessionId);
      await bot.stop().catch(() => undefined);
    }
  }

  /** Stop and forget this session's relay bot (round resolve / turn flip / session end). */
  async unbridgeAll(sessionId: string): Promise<void> {
    const bot = this.bots.get(sessionId);
    if (bot === undefined) return;
    this.bots.delete(sessionId);
    try {
      await bot.stop();
      this.log.info({ sessionId }, 'loungeBridge: unbridged lounge');
    } catch (err) {
      this.log.error({ err, sessionId }, 'loungeBridge: relay bot failed to stop');
    }
  }
}
