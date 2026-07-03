/**
 * Pure round-robin allocation of manual chapters across a team's Experts
 * (Story 9.1, FR37). Used at ROUND_START when `asymmetricExpertRoles` is on and
 * the active team has ≥2 Experts, so each Expert holds only part of the manual
 * and the team must coordinate.
 *
 * Determinism comes from the CALLER: the injected `rng` is derived from the
 * round's seed chain (keyed by `pairIndex`, so a retry reproduces the identical
 * allocation) — never `Math.random()`. This function is total and side-effect
 * free: no I/O, no throw, no input mutation.
 */

/**
 * Deal `chapterIds` round-robin across `expertIds`.
 *
 * Behaviour:
 * - Seeded Fisher–Yates shuffle of BOTH the Expert order AND the chapter order
 *   (the "randomly allocated" part — determinism is the caller's seed), then
 *   deal shuffled chapter `i` to `shuffled[i % n]`. Shuffling only the Experts
 *   would fix the partition itself (2 Experts would always split into the same
 *   even/odd canonical half-sets, the seed merely picking who gets which half);
 *   shuffling the chapters makes the SPLIT vary per seed. Even-as-possible
 *   distribution falls out of round-robin dealing (2 Experts / 11 chapters →
 *   6 / 5).
 * - Returns a map keyed by `expertId` → that Expert's chapter ids, each list
 *   re-sorted into stable canonical (input) chapter order.
 *
 * Degenerate cases (all total, never throw):
 * - `expertIds` empty → `{}`.
 * - more Experts than chapters → trailing Experts map to `[]` (the CALLER must
 *   treat an empty list as "no restriction" — never deliver it, or the Expert
 *   would see an empty-forever manual).
 * - a single Expert → that Expert gets every chapter (the caller decides not to
 *   restrict a solo Expert; the function itself stays total).
 *
 * Inputs are never mutated — safe to call on frozen arrays.
 */
export function allocateExpertChapters(
  expertIds: readonly string[],
  chapterIds: readonly string[],
  rng: () => number,
): Record<string, string[]> {
  // Copy before shuffling so a frozen/shared input is never mutated.
  const shuffled = [...expertIds];
  // Fisher–Yates using the injected rng (no Math.random).
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }
  // Shuffle the chapters too (same rng stream) so the partition itself is
  // seed-random, not a fixed canonical interleave.
  const dealt = [...chapterIds];
  for (let i = dealt.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = dealt[i]!;
    dealt[i] = dealt[j]!;
    dealt[j] = tmp;
  }

  const result: Record<string, string[]> = {};
  // Seed every Expert with an empty list so trailing Experts (more Experts than
  // chapters) are present with `[]` rather than absent.
  for (const expertId of shuffled) result[expertId] = [];

  const n = shuffled.length;
  if (n === 0) return result;

  for (let i = 0; i < dealt.length; i++) {
    result[shuffled[i % n]!]!.push(dealt[i]!);
  }

  // Re-sort each Expert's list into canonical (input) chapter order so the
  // output stays sorted-stable regardless of the deal order.
  const canonical = new Map(chapterIds.map((id, index) => [id, index]));
  for (const list of Object.values(result)) {
    list.sort((a, b) => (canonical.get(a) ?? 0) - (canonical.get(b) ?? 0));
  }

  return result;
}
