import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { LoungeBridge, type BridgeLog, type LoungeBridgeConfig } from '../loungeBridge.js';
import type { RelayBot, RelayBotFactory, RelayBotOptions } from '../loungeRelayBot.js';

/**
 * Unit tests for the bridge LIFECYCLE (Story 3.7). The real relay bot is
 * `@livekit/rtc-node` media plumbing exercised by the integration test; here we
 * inject a FAKE bot factory and assert the manager spawns exactly one bot per
 * session, tears the prior one down on a re-bridge / unbridge, and stays
 * best-effort (a throwing bot never surfaces).
 */

const SID = 'sess1';
const CONFIG: LoungeBridgeConfig = { wsUrl: 'ws://livekit:7880', apiKey: 'k', apiSecret: 's' };
const silentLog: BridgeLog = { info: () => undefined, error: () => undefined };

interface FakeBot extends RelayBot {
  readonly opts: RelayBotOptions;
  readonly start: jest.Mock<() => Promise<void>>;
  readonly stop: jest.Mock<() => Promise<void>>;
}

/** A recording factory: every created bot is captured so tests can inspect it. */
function recordingFactory(overrides?: {
  start?: () => Promise<void>;
  stop?: () => Promise<void>;
}): { factory: RelayBotFactory; bots: FakeBot[] } {
  const bots: FakeBot[] = [];
  const factory: RelayBotFactory = (opts) => {
    const start = jest.fn(overrides?.start ?? (async () => undefined));
    const stop = jest.fn(overrides?.stop ?? (async () => undefined));
    const bot: FakeBot = { opts, start, stop } as FakeBot;
    bots.push(bot);
    return bot;
  };
  return { factory, bots };
}

describe('LoungeBridge (bot manager)', () => {
  let bots: FakeBot[];
  let bridge: LoungeBridge;

  beforeEach(() => {
    const rec = recordingFactory();
    bots = rec.bots;
    bridge = new LoungeBridge(CONFIG, silentLog, rec.factory);
  });

  it('bridgeActiveTeam spawns and starts one bot for the active team', async () => {
    await bridge.bridgeActiveTeam(SID, 'A');
    expect(bots).toHaveLength(1);
    expect(bots[0].opts).toMatchObject({ sessionId: SID, teamId: 'A', wsUrl: 'ws://livekit:7880' });
    expect(bots[0].start).toHaveBeenCalledTimes(1);
    expect(bots[0].stop).not.toHaveBeenCalled();
  });

  it('a re-bridge (turn flip) stops the prior bot and starts a new one', async () => {
    await bridge.bridgeActiveTeam(SID, 'A');
    await bridge.bridgeActiveTeam(SID, 'B');
    expect(bots).toHaveLength(2);
    expect(bots[0].stop).toHaveBeenCalledTimes(1); // team A bot torn down
    expect(bots[1].opts.teamId).toBe('B');
    expect(bots[1].start).toHaveBeenCalledTimes(1);
  });

  it('unbridgeAll stops the session bot and forgets it (a second unbridge is a no-op)', async () => {
    await bridge.bridgeActiveTeam(SID, 'A');
    await bridge.unbridgeAll(SID);
    expect(bots[0].stop).toHaveBeenCalledTimes(1);

    await bridge.unbridgeAll(SID); // nothing tracked → no throw, no extra stop
    expect(bots[0].stop).toHaveBeenCalledTimes(1);
  });

  it('unbridgeAll with nothing bridged is a no-op', async () => {
    await expect(bridge.unbridgeAll(SID)).resolves.toBeUndefined();
    expect(bots).toHaveLength(0);
  });

  it('a bot that throws on start is swallowed, stopped, and forgotten (best-effort, AC #5)', async () => {
    const rec = recordingFactory({
      start: async () => {
        throw new Error('livekit unreachable');
      },
    });
    const b = new LoungeBridge(CONFIG, silentLog, rec.factory);

    await expect(b.bridgeActiveTeam(SID, 'A')).resolves.toBeUndefined();
    expect(rec.bots[0].stop).toHaveBeenCalledTimes(1); // cleaned up
    // Forgotten → a later unbridge does not double-stop.
    rec.bots[0].stop.mockClear();
    await b.unbridgeAll(SID);
    expect(rec.bots[0].stop).not.toHaveBeenCalled();
  });

  it('a bot that throws on stop is swallowed (unbridge still resolves + forgets it)', async () => {
    const rec = recordingFactory({
      stop: async () => {
        throw new Error('disconnect failed');
      },
    });
    const b = new LoungeBridge(CONFIG, silentLog, rec.factory);
    await b.bridgeActiveTeam(SID, 'A');
    await expect(b.unbridgeAll(SID)).resolves.toBeUndefined();
  });

  it('bridges are per-session (two sessions get independent bots)', async () => {
    await bridge.bridgeActiveTeam('s1', 'A');
    await bridge.bridgeActiveTeam('s2', 'B');
    expect(bots).toHaveLength(2);
    // Unbridging s1 leaves s2's bot running.
    await bridge.unbridgeAll('s1');
    expect(bots[0].stop).toHaveBeenCalledTimes(1);
    expect(bots[1].stop).not.toHaveBeenCalled();
  });
});
