import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../gameStore.js';

beforeEach(() => {
  useGameStore.setState({ lifelineToasts: [], lifelineToastSeq: 0, session: null });
});

describe('gameStore.lifelineToasts (Story 9.3)', () => {
  it('pushLifelineToast enqueues with a DETERMINISTIC monotonic id (no Math.random/Date.now)', () => {
    const { pushLifelineToast } = useGameStore.getState();
    pushLifelineToast({ promptId: 'check-serial', fromName: 'Sam' });
    pushLifelineToast({ promptId: 'on-track', fromName: 'Bex' });
    const toasts = useGameStore.getState().lifelineToasts;
    expect(toasts).toEqual([
      { id: 'lt-1', promptId: 'check-serial', fromName: 'Sam' },
      { id: 'lt-2', promptId: 'on-track', fromName: 'Bex' },
    ]);
  });

  it('the id counter keeps climbing even after dismissals (ids never collide)', () => {
    const { pushLifelineToast, dismissLifelineToast } = useGameStore.getState();
    pushLifelineToast({ promptId: 'check-serial', fromName: 'Sam' });
    dismissLifelineToast('lt-1');
    pushLifelineToast({ promptId: 'on-track', fromName: 'Bex' });
    expect(useGameStore.getState().lifelineToasts).toEqual([
      { id: 'lt-2', promptId: 'on-track', fromName: 'Bex' },
    ]);
  });

  it('dismissLifelineToast removes exactly one toast by id and no-ops on an unknown id', () => {
    const { pushLifelineToast, dismissLifelineToast } = useGameStore.getState();
    pushLifelineToast({ promptId: 'a', fromName: 'X' });
    pushLifelineToast({ promptId: 'b', fromName: 'Y' });
    dismissLifelineToast('lt-1');
    expect(useGameStore.getState().lifelineToasts.map((t) => t.id)).toEqual(['lt-2']);
    dismissLifelineToast('lt-999'); // unknown → no-op
    expect(useGameStore.getState().lifelineToasts.map((t) => t.id)).toEqual(['lt-2']);
  });

  it('caps the queue at 3 — a 4th push drops the oldest and logs the overflow', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { pushLifelineToast } = useGameStore.getState();
    for (const id of ['a', 'b', 'c', 'd']) pushLifelineToast({ promptId: id, fromName: id });
    const toasts = useGameStore.getState().lifelineToasts;
    expect(toasts.map((t) => t.id)).toEqual(['lt-2', 'lt-3', 'lt-4']); // lt-1 dropped
    expect(toasts.map((t) => t.promptId)).toEqual(['b', 'c', 'd']);
    expect(info).toHaveBeenCalledWith(
      '[gameStore] lifeline toast overflow — dropped oldest',
      { droppedId: 'lt-1' },
    );
    info.mockRestore();
  });

  it('clearSession empties the queue and resets the id counter', () => {
    const { pushLifelineToast, clearSession } = useGameStore.getState();
    pushLifelineToast({ promptId: 'a', fromName: 'X' });
    clearSession();
    expect(useGameStore.getState().lifelineToasts).toEqual([]);
    expect(useGameStore.getState().lifelineToastSeq).toBe(0);
    // A push after clear restarts ids from lt-1 (deterministic fresh session).
    useGameStore.getState().pushLifelineToast({ promptId: 'b', fromName: 'Y' });
    expect(useGameStore.getState().lifelineToasts[0].id).toBe('lt-1');
  });
});
