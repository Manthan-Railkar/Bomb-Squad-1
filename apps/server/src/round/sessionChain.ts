/**
 * Per-session serialization chain (single-process V1). Both racing teams share
 * ONE `sessionKey`, and `resolveRound` does a read-modify-write of that session
 * to add `cumulativeTimeMs`. With no CAS primitive on `RedisStore` (only
 * get/set/del), two teams resolving concurrently would both read the same
 * baseline and the second `setJSON` would clobber the first team's recorded
 * time. We serialize all resolutions for a given session through a promise chain
 * so each read-modify-write runs to completion before the next begins. This
 * matches the documented single-process posture (timerScheduler header); a
 * multi-instance deployment would need a Redis-side atomic increment / WATCH.
 *
 * Extracted from `resolveRound.ts` (review 9.2) so the reattach path in
 * `sessionHandlers.ts` can queue behind the ceremony without an import cycle.
 */
const sessionChains = new Map<string, Promise<void>>();

/**
 * Queue `task` behind any in-flight work chained for `sessionId`. Used by the
 * resolution ceremony itself AND (review 9.2) by the reattach lifeline-token
 * read: unserialized, a reattach could read the PRE-grant count while the
 * ceremony commits and delivers the new one, leaving the reattach's stale emit
 * as the last write the client sees. Chained, the read observes the post-commit
 * map and emits after the ceremony's own delivery. With nothing in flight the
 * chain is empty and the task runs immediately.
 */
export function afterSessionCeremony<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
  const prior = sessionChains.get(sessionId) ?? Promise.resolve();
  const next = prior.then(task);
  // Track the chain swallowing errors so one failed task never poisons the next
  // queued one; callers still see `next`'s real outcome.
  const tracked = next.then(
    () => {},
    () => {},
  );
  sessionChains.set(sessionId, tracked);
  void tracked.then(() => {
    if (sessionChains.get(sessionId) === tracked) sessionChains.delete(sessionId);
  });
  return next;
}
