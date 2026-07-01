import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { AccessToken } from 'livekit-server-sdk';
import {
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  RemoteAudioTrack,
  Room,
  RoomEvent,
  TrackPublishOptions,
  TrackSource,
  type RemoteTrack,
  type RemoteParticipant,
} from '@livekit/rtc-node';
import { bombRoomName, spectatorLoungeName, isBridgeIdentity } from '@bomb-squad/shared';
import { LoungeBridge, type BridgeLog } from '../loungeBridge.js';
import { createLoungeRelayBot } from '../loungeRelayBot.js';

/**
 * REAL LiveKit-container integration for the audio-relay BOT (Story 3.7).
 *
 * Gated behind `RUN_LIVEKIT_IT=1` so the default `pnpm test` (no container) stays
 * green. Bring the container up first: `docker compose up -d livekit`, then
 *   RUN_LIVEKIT_IT=1 pnpm --filter @bomb-squad/server test -- loungeBridge.integration
 *
 * This proves the end-to-end audio topology the unit tests (fake bot) can't: a real
 * peer publishes audio in a Bomb Room, the LoungeBridge spins up a real
 * `@livekit/rtc-node` relay bot, and a real peer IN THE LOUNGE actually receives
 * the bridged audio track — published by the bot's `#bridge` identity, proving the
 * one-way Bomb Room → Lounge path works on self-hosted LiveKit (which
 * forwardParticipant could not). Teardown removes the bridged track. The
 * human-audible check remains Jay's interactive Task 10.
 */

const RUN = process.env.RUN_LIVEKIT_IT === '1';
// The bot connects to LiveKit's ws:// signaling endpoint from the server process —
// derived from LIVEKIT_SERVER_URL in prod; here we default to localhost.
const WS_URL = (process.env.LIVEKIT_SERVER_URL ?? 'http://localhost:7880').replace(/^http/, 'ws');
const KEY = process.env.LIVEKIT_API_KEY ?? 'devkey';
const SECRET = process.env.LIVEKIT_API_SECRET ?? 'devsecret';

const silentLog: BridgeLog = { info: () => undefined, error: () => undefined };
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Mint a real join token (roomJoin + publish + subscribe) for a test peer. */
async function mintJoinToken(room: string, identity: string): Promise<string> {
  const at = new AccessToken(KEY, SECRET, { identity, ttl: 600 });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
  return at.toJwt();
}

/** Connect a peer and start publishing a silent mic track (keeps the pump fed). */
async function connectPublishing(room: string, identity: string): Promise<Room> {
  const peer = new Room();
  await peer.connect(WS_URL, await mintJoinToken(room, identity), {
    autoSubscribe: true,
    dynacast: false,
  });
  const local = peer.localParticipant;
  if (local === undefined) throw new Error('peer connected but localParticipant is undefined');
  const source = new AudioSource(48000, 1);
  const track = LocalAudioTrack.createAudioTrack('mic', source);
  await local.publishTrack(track, new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }));
  // Keep pushing silent frames in the background so the track carries audio.
  const samplesPerChannel = 480; // 10ms @ 48kHz mono
  void (async () => {
    for (let i = 0; i < 200; i++) {
      try {
        await source.captureFrame(
          new AudioFrame(new Int16Array(samplesPerChannel), 48000, 1, samplesPerChannel),
        );
      } catch {
        return; // room torn down
      }
      await sleep(10);
    }
  })();
  return peer;
}

async function poll(predicate: () => boolean, timeoutMs = 20000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(300);
  }
  return predicate();
}

(RUN ? describe : describe.skip)('LoungeBridge relay bot — REAL LiveKit (RUN_LIVEKIT_IT=1)', () => {
  const SID = `it-${Date.now()}`;
  const bombRoom = bombRoomName(SID, 'A');
  const lounge = spectatorLoungeName(SID);

  let bridge: LoungeBridge;
  let bombPeer: Room; // active-team defuser publishing in the Bomb Room
  let loungePeer: Room; // spectator listening in the lounge

  beforeEach(() => {
    bridge = new LoungeBridge(
      { wsUrl: WS_URL, apiKey: KEY, apiSecret: SECRET },
      silentLog,
      createLoungeRelayBot,
    );
  });

  afterEach(async () => {
    await bridge.unbridgeAll(SID).catch(() => undefined);
    for (const p of [bombPeer, loungePeer]) {
      try {
        await p?.disconnect();
      } catch {
        /* already gone */
      }
    }
  });

  it(
    'bridges Bomb Room audio into the lounge (a lounge peer receives the bot-published track)',
    async () => {
      // A lounge listener records every audio track it gets subscribed to.
      const bridgedPublishers: string[] = [];
      loungePeer = new Room();
      loungePeer.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
          if (track instanceof RemoteAudioTrack) bridgedPublishers.push(participant.identity);
        },
      );
      await loungePeer.connect(WS_URL, await mintJoinToken(lounge, 'spectator-1'), {
        autoSubscribe: true,
        dynacast: false,
      });

      // The active team's defuser is talking in the Bomb Room.
      bombPeer = await connectPublishing(bombRoom, 'defuser-A');

      // Start the bridge — the bot subscribes in the Bomb Room and republishes into
      // the lounge. The lounge peer should get subscribed to a `#bridge`-published track.
      await bridge.bridgeActiveTeam(SID, 'A');

      const got = await poll(() => bridgedPublishers.some((id) => isBridgeIdentity(id)));
      expect(got).toBe(true); // lounge HEARS the Bomb Room via the relay bot

      // Teardown removes the bridged track from the lounge.
      const unsubscribed: string[] = [];
      loungePeer.on(RoomEvent.TrackUnsubscribed, (_t, _p, participant: RemoteParticipant) => {
        unsubscribed.push(participant.identity);
      });
      await bridge.unbridgeAll(SID);
      const gone = await poll(() => unsubscribed.some((id) => isBridgeIdentity(id)), 15000);
      expect(gone).toBe(true);
    },
    60000,
  );

  it(
    'one-way: the bot never publishes into the Bomb Room (the defuser hears no #bridge track)',
    async () => {
      // The defuser records any audio track it gets subscribed to in the Bomb Room.
      const heardInBomb: string[] = [];
      bombPeer = new Room();
      bombPeer.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _p, participant: RemoteParticipant) => {
        if (track instanceof RemoteAudioTrack) heardInBomb.push(participant.identity);
      });
      await bombPeer.connect(WS_URL, await mintJoinToken(bombRoom, 'defuser-A'), {
        autoSubscribe: true,
        dynacast: false,
      });
      // A lounge participant is talking (would leak if the boundary were two-way).
      loungePeer = await connectPublishing(lounge, 'spectator-loud');

      await bridge.bridgeActiveTeam(SID, 'A');
      await sleep(6000); // give any (erroneous) reverse path time to establish

      // The Bomb Room peer must NEVER receive a #bridge track — the bot's Bomb-Room
      // token cannot publish, so lounge audio has no path back in. (It may hear other
      // real Bomb-Room players, but never the bridge.)
      expect(heardInBomb.some((id) => isBridgeIdentity(id))).toBe(false);
    },
    60000,
  );
});
