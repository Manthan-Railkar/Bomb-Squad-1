import { describe, expect, it } from '@jest/globals';
import { MAX_LIFELINE_TOKENS } from '@bomb-squad/shared';
import { createMemoryRedisStore } from '../../handlers/__tests__/testSocketServer.js';
import { lifelinesKey } from '../../state/keys.js';
import { getTokens, grantToken, spendToken } from '../lifelineTokens.js';

const SID = 'sess-1';

describe('lifelineTokens — getTokens (fail-closed)', () => {
  it('returns 0 for an absent key', async () => {
    const store = createMemoryRedisStore();
    expect(await getTokens(store, SID, 'spec-1')).toBe(0);
  });

  it('returns 0 for an unknown playerId on a populated map', async () => {
    const store = createMemoryRedisStore();
    await store.setJSON(lifelinesKey(SID), { 'spec-1': 2 });
    expect(await getTokens(store, SID, 'someone-else')).toBe(0);
  });

  it('returns the stored count for a known playerId', async () => {
    const store = createMemoryRedisStore();
    await store.setJSON(lifelinesKey(SID), { 'spec-1': 2 });
    expect(await getTokens(store, SID, 'spec-1')).toBe(2);
  });
});

describe('lifelineTokens — grantToken (increment + cap)', () => {
  it('grants the first token (absent key ⇒ {} ⇒ 1)', async () => {
    const store = createMemoryRedisStore();
    expect(await grantToken(store, SID, 'spec-1')).toBe(1);
    expect(await getTokens(store, SID, 'spec-1')).toBe(1);
  });

  it('increments an existing count', async () => {
    const store = createMemoryRedisStore();
    await grantToken(store, SID, 'spec-1');
    expect(await grantToken(store, SID, 'spec-1')).toBe(2);
  });

  it('clamps at MAX_LIFELINE_TOKENS — a grant at the cap stays at the cap', async () => {
    const store = createMemoryRedisStore();
    for (let i = 0; i < MAX_LIFELINE_TOKENS; i++) await grantToken(store, SID, 'spec-1');
    expect(await getTokens(store, SID, 'spec-1')).toBe(MAX_LIFELINE_TOKENS);
    // A further grant is idempotent at the ceiling — no overflow, no error.
    expect(await grantToken(store, SID, 'spec-1')).toBe(MAX_LIFELINE_TOKENS);
    expect(await getTokens(store, SID, 'spec-1')).toBe(MAX_LIFELINE_TOKENS);
  });

  it('tracks players independently in the shared map', async () => {
    const store = createMemoryRedisStore();
    await grantToken(store, SID, 'spec-1');
    await grantToken(store, SID, 'spec-1');
    await grantToken(store, SID, 'spec-2');
    const map = await store.getJSON<Record<string, number>>(lifelinesKey(SID));
    expect(map).toEqual({ 'spec-1': 2, 'spec-2': 1 });
  });

  it('a concurrent write between load and commit does not lose the update (CAS retry)', async () => {
    // Arm the one-shot interleave: a simulated Story-9.3 spend for spec-2 lands
    // between grantToken's read and write on the SAME map key. The fake sees the
    // bytes moved and re-runs the mutate against the new value, so spec-1's grant
    // still applies AND spec-2's concurrent change survives (no clobber).
    const store = createMemoryRedisStore(undefined, {
      onBeforeCommit: (key) => {
        if (key === lifelinesKey(SID)) {
          store.data.set(lifelinesKey(SID), JSON.stringify({ 'spec-1': 0, 'spec-2': 5 }));
        }
      },
    });
    const result = await grantToken(store, SID, 'spec-1');
    expect(result).toBe(1);
    const map = await store.getJSON<Record<string, number>>(lifelinesKey(SID));
    // spec-1 incremented from the re-read baseline (0 → 1); spec-2's concurrent
    // write (5) is preserved — the grant did not overwrite the whole map.
    expect(map).toEqual({ 'spec-1': 1, 'spec-2': 5 });
  });
});

describe('lifelineTokens — spendToken (decrement + reject-at-0, Story 9.3)', () => {
  it('spends the last token: 1 → { ok: true, count: 0 }', async () => {
    const store = createMemoryRedisStore();
    await store.setJSON(lifelinesKey(SID), { 'spec-1': 1 });
    expect(await spendToken(store, SID, 'spec-1')).toEqual({ ok: true, count: 0 });
    expect(await getTokens(store, SID, 'spec-1')).toBe(0);
  });

  it('refuses a spend at 0 with NO state change (AC-3)', async () => {
    const store = createMemoryRedisStore();
    await store.setJSON(lifelinesKey(SID), { 'spec-1': 0, 'spec-2': 2 });
    expect(await spendToken(store, SID, 'spec-1')).toEqual({ ok: false, count: 0 });
    // Map is byte-for-byte unchanged — no negative balance, no clobber of others.
    const map = await store.getJSON<Record<string, number>>(lifelinesKey(SID));
    expect(map).toEqual({ 'spec-1': 0, 'spec-2': 2 });
  });

  it('refuses a spend for an unknown / absent player (fail-closed, never negative)', async () => {
    const store = createMemoryRedisStore();
    expect(await spendToken(store, SID, 'nobody')).toEqual({ ok: false, count: 0 });
    // Absent key stays absent — a refused spend must not create a phantom entry.
    expect(await store.getJSON(lifelinesKey(SID))).toBeNull();
  });

  it('leaves other players untouched when one spends', async () => {
    const store = createMemoryRedisStore();
    await store.setJSON(lifelinesKey(SID), { 'spec-1': 2, 'spec-2': 3 });
    await spendToken(store, SID, 'spec-1');
    expect(await store.getJSON(lifelinesKey(SID))).toEqual({ 'spec-1': 1, 'spec-2': 3 });
  });

  it('an interleaved grant+spend both apply (CAS retry, no lost update)', async () => {
    // A concurrent grant for spec-2 lands between spendToken's read and commit on
    // the shared key. The CAS re-runs the mutate against the moved bytes, so
    // spec-1's spend still applies AND spec-2's grant survives.
    const store = createMemoryRedisStore(undefined, {
      onBeforeCommit: (key) => {
        if (key === lifelinesKey(SID)) {
          store.data.set(lifelinesKey(SID), JSON.stringify({ 'spec-1': 1, 'spec-2': 2 }));
        }
      },
    });
    await store.setJSON(lifelinesKey(SID), { 'spec-1': 1, 'spec-2': 1 });
    const result = await spendToken(store, SID, 'spec-1');
    expect(result).toEqual({ ok: true, count: 0 });
    // spec-1 decremented from the re-read baseline (1 → 0); spec-2's concurrent
    // grant (2) is preserved.
    expect(await store.getJSON(lifelinesKey(SID))).toEqual({ 'spec-1': 0, 'spec-2': 2 });
  });
});
