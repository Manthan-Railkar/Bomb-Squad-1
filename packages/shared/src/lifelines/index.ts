/**
 * Spectator lifeline token economy (Story 9.2).
 *
 * A spectating player earns 1 token per round they watch, held up to a hard cap.
 * The cap is a shared constant so BOTH sides read the SAME ceiling: the server
 * grant (Story 9.2, `apps/server/src/lifelines/lifelineTokens.ts`) clamps to it,
 * and the Story 9.3 spend gate reads it. `packages/shared` stays framework-free.
 */

/** Maximum lifeline tokens a single spectator may hold at once (Story 9.2, FR42). */
export const MAX_LIFELINE_TOKENS = 3;

// Story 9.3: the fixed pre-defined hint prompt list (shared source of truth for
// both the server's fail-closed validation and the client's picker/toast text).
export * from './prompts.js';
