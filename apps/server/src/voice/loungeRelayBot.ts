/**
 * Bomb Room → Spectator Lounge one-way audio RELAY BOT (Story 3.7).
 *
 * Replaces the never-implemented `RoomServiceClient.forwardParticipant` (see the
 * `livekit-forwardparticipant-not-implemented-oss` finding) with a self-contained
 * relay: a headless `@livekit/rtc-node` participant the server controls, joined to
 * BOTH rooms with deliberately asymmetric grants —
 *
 *   • the ACTIVE Bomb Room  → `canSubscribe: true,  canPublish: false`  (it only LISTENS)
 *   • the Spectator Lounge  → `canPublish: true,  canSubscribe: false`  (it only SPEAKS)
 *
 * For every audio track it hears in the Bomb Room it publishes a mirror track into
 * the lounge and pumps the frames across. Because its Bomb-Room token literally
 * cannot publish and its lounge token literally cannot subscribe, audio can ONLY
 * flow Bomb Room → Lounge — the one-way boundary (AC #2) is structural, not a
 * permission toggle. `autoSubscribe` means late joiners / reconnects in the Bomb
 * Room are picked up natively, so no webhook is needed.
 *
 * This module owns the LiveKit media plumbing; `LoungeBridge` owns the per-session
 * lifecycle (spawn on round open, stop on resolve/end). Kept behind the
 * {@link RelayBot} interface so `LoungeBridge` is unit-testable with a fake bot.
 */
import { AccessToken } from 'livekit-server-sdk';
import {
  AudioSource,
  AudioStream,
  LocalAudioTrack,
  RemoteAudioTrack,
  Room,
  RoomEvent,
  TrackPublishOptions,
  TrackSource,
  type RemoteTrack,
  type RemoteTrackPublication,
} from '@livekit/rtc-node';
import {
  BRIDGE_IDENTITY_PREFIX,
  bombRoomName,
  spectatorLoungeName,
  type TeamId,
} from '@bomb-squad/shared';
import type { BridgeLog } from './loungeBridge.js';

/** Audio format for the relay. 48 kHz mono matches Opus voice; the source and the
 * stream are constructed with the same rate/channels so frames pass straight through. */
const SAMPLE_RATE = 48000;
const CHANNELS = 1;

/** The minimal lifecycle a relay bot exposes to {@link LoungeBridge}. */
export interface RelayBot {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface RelayBotOptions {
  /** Server-reachable ws:// signaling URL (derived from LIVEKIT_SERVER_URL). */
  wsUrl: string;
  apiKey: string;
  apiSecret: string;
  sessionId: string;
  /** The active team whose Bomb Room audio is bridged into the lounge. */
  teamId: TeamId;
  log: BridgeLog;
}

/** A single mirrored track: the lounge publication + the frame-pump reader feeding it. */
interface Mirror {
  /** sid of the LOUNGE publication we created (undefined only if publish returned no sid). */
  localTrackSid: string | undefined;
  source: AudioSource;
  reader: ReadableStreamDefaultReader<unknown>;
}

/** Factory the bridge injects (real bot in prod, a fake in unit tests). */
export type RelayBotFactory = (opts: RelayBotOptions) => RelayBot;

/** Mint a room-scoped bot token with exactly the asymmetric grants above. */
async function mintBotToken(
  opts: RelayBotOptions,
  identity: string,
  room: string,
  grants: { canPublish: boolean; canSubscribe: boolean },
): Promise<string> {
  const at = new AccessToken(opts.apiKey, opts.apiSecret, { identity, ttl: 6 * 60 * 60 });
  at.addGrant({ roomJoin: true, room, canPublish: grants.canPublish, canSubscribe: grants.canSubscribe });
  return at.toJwt();
}

/** Create (but do not start) a relay bot for one session's active Bomb Room. */
export const createLoungeRelayBot: RelayBotFactory = (opts) => {
  const { sessionId, teamId, wsUrl, log } = opts;
  const bombRoom = bombRoomName(sessionId, teamId);
  const lounge = spectatorLoungeName(sessionId);

  const subRoom = new Room(); // listens in the Bomb Room
  const pubRoom = new Room(); // speaks into the lounge
  // Keyed by the REMOTE (Bomb Room) publication sid → the lounge mirror it feeds.
  const mirrors = new Map<string, Mirror>();
  let stopped = false;

  async function addMirror(track: RemoteTrack, publication: RemoteTrackPublication): Promise<void> {
    if (stopped) return;
    if (!(track instanceof RemoteAudioTrack)) return; // audio only
    const key = publication.sid;
    if (key === undefined || mirrors.has(key)) return;
    const local = pubRoom.localParticipant;
    if (local === undefined) return;

    try {
      const source = new AudioSource(SAMPLE_RATE, CHANNELS);
      const mirrorTrack = LocalAudioTrack.createAudioTrack(`bridge-${key}`, source);
      const pub = await local.publishTrack(
        mirrorTrack,
        new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }),
      );
      // Read the Bomb-Room track's frames and write them straight into the lounge
      // source. Constructed at the same rate/channels as the source so frames pass
      // through unchanged. The reader loop ends when the stream closes (track gone)
      // or we cancel it in stop()/removeMirror().
      const stream = new AudioStream(track, SAMPLE_RATE, CHANNELS);
      const reader = stream.getReader();
      mirrors.set(key, { localTrackSid: pub.sid, source, reader });
      void pump(reader, source);
    } catch (err) {
      log.error({ err, sessionId, key }, 'loungeRelayBot: failed to mirror a track');
    }
  }

  async function pump(
    reader: ReadableStreamDefaultReader<unknown>,
    source: AudioSource,
  ): Promise<void> {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        // `value` is an AudioFrame at SAMPLE_RATE/CHANNELS — feed it to the lounge.
        if (value !== undefined) await source.captureFrame(value as never);
      }
    } catch {
      // Reader cancelled (removeMirror/stop) or the stream errored — either way the
      // pump is done; nothing to surface.
    }
  }

  async function removeMirror(publication: RemoteTrackPublication): Promise<void> {
    const key = publication.sid;
    if (key === undefined) return;
    const mirror = mirrors.get(key);
    if (mirror === undefined) return;
    mirrors.delete(key);
    try {
      await mirror.reader.cancel();
    } catch {
      /* already closed */
    }
    if (mirror.localTrackSid !== undefined) {
      try {
        await pubRoom.localParticipant?.unpublishTrack(mirror.localTrackSid, true);
      } catch {
        /* lounge already torn down */
      }
    }
  }

  return {
    async start(): Promise<void> {
      // Attach handlers BEFORE connecting so `autoSubscribe`'s initial
      // TrackSubscribed events (for people already in the Bomb Room) are caught.
      subRoom.on(RoomEvent.TrackSubscribed, (track, publication) => {
        void addMirror(track, publication);
      });
      subRoom.on(RoomEvent.TrackUnsubscribed, (_track, publication) => {
        void removeMirror(publication);
      });

      const subToken = await mintBotToken(opts, `${BRIDGE_IDENTITY_PREFIX}-sub:${sessionId}`, bombRoom, {
        canPublish: false,
        canSubscribe: true,
      });
      const pubToken = await mintBotToken(opts, `${BRIDGE_IDENTITY_PREFIX}-pub:${sessionId}`, lounge, {
        canPublish: true,
        canSubscribe: false,
      });

      // Connect the publish side first so a Bomb-Room track that arrives the instant
      // we subscribe already has a lounge to be mirrored into.
      await pubRoom.connect(wsUrl, pubToken, { autoSubscribe: false, dynacast: false });
      await subRoom.connect(wsUrl, subToken, { autoSubscribe: true, dynacast: false });
      log.info({ sessionId, teamId, bombRoom, lounge }, 'loungeRelayBot: started');
    },

    async stop(): Promise<void> {
      stopped = true;
      for (const mirror of mirrors.values()) {
        try {
          await mirror.reader.cancel();
        } catch {
          /* already closed */
        }
      }
      mirrors.clear();
      await subRoom.disconnect().catch(() => undefined);
      await pubRoom.disconnect().catch(() => undefined);
      log.info({ sessionId }, 'loungeRelayBot: stopped');
    },
  };
};
