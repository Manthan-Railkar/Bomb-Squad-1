import type { BombContext } from '../types/bomb.js';
import type { DifficultyTier } from '../types/session.js';
import { DEV_DEMO_MODULE_ID } from './dev-demo/types.js';
import { WIRES_MODULE_ID } from './wires/types.js';
import { BUTTON_MODULE_ID } from './the-button/types.js';
import { PASSWORDS_MODULE_ID } from './passwords/types.js';
import { KEYPADS_MODULE_ID } from './keypads/types.js';
import { WHOS_ON_FIRST_MODULE_ID } from './whos-on-first/types.js';
import { WIRE_SEQUENCES_MODULE_ID } from './wire-sequences/types.js';
import { MAZES_MODULE_ID } from './mazes/types.js';
// Import each generator directly from its own file, NOT via the module barrel
// (./<mod>/index.js → ../index.js), so the registry never depends on the barrel
// that parallel module stories edit.
import { generateDevDemo } from './dev-demo/generate.js';
import { generateWires } from './wires/generate.js';
import { generateButton } from './the-button/generate.js';
import { generatePasswords } from './passwords/generate.js';
import { generateKeypads } from './keypads/generate.js';
import { generateWhosOnFirst } from './whos-on-first/generate.js';
import { generateWireSequences } from './wire-sequences/generate.js';
import { generateMazes } from './mazes/generate.js';

/**
 * A module's seeded instance generator. `seed` is the per-(team,slot) moduleSeed
 * from the seed chain; `ctx` is the frozen per-team BombContext. Returns the
 * module's opaque `data` payload (typed per-module in its own dir, erased here).
 */
export type ModuleGenerator = (seed: number, ctx: BombContext) => unknown;

/**
 * Open/closed module GENERATOR registry — the generation-time twin of the
 * server's MODULE_REDUCERS. Add one entry per module; bomb assembly
 * (generateRoundBombs) never changes when a module is added.
 *
 * Entries are cast to ModuleGenerator: each generate fn is fully typed in its
 * own module dir (e.g. generateDevDemo → DevDemoState); the per-module return
 * type is deliberately erased to `unknown` at this registry boundary, which is
 * where assembly dispatches by moduleId. This mirrors the 5.1 type-erasure
 * pattern (one documented cast at the boundary).
 *
 * Add one entry per module — same open/closed property as MODULE_REDUCERS.
 */
export const MODULE_GENERATORS: Record<string, ModuleGenerator> = {
  // dev-demo: Story 5.1 reference module. It is registered but in NO tier pool
  // (see TIER_POOLS below) — the only way it reaches a bomb is a Facilitator
  // modulePool override of ['dev-demo'].
  [DEV_DEMO_MODULE_ID]: generateDevDemo as ModuleGenerator,
  // wires: Story 5.3 walking-skeleton module, the first real generatable module
  // and the sole member of every tier pool until 5.4 (the-button) / 5.5
  // (passwords) land. Registered here (Story 4.7 closed the gap 5.3 left) so a
  // default-config round can actually build a bomb for snapshot sync to ride.
  [WIRES_MODULE_ID]: generateWires as ModuleGenerator,
  // the-button: Story 5.4 — second Easy module. Generator + reducer + an Easy
  // tier-pool entry land together (a pool may only list modules with both, or
  // generateLayout throws at ROUND_START).
  [BUTTON_MODULE_ID]: generateButton as ModuleGenerator,
  // passwords: Story 5.5 — third Easy module, completing the canonical Easy pool
  // (Wires/Button/Passwords). Generator + reducer + tier-pool entry land
  // together (same generateLayout requirement as above).
  [PASSWORDS_MODULE_ID]: generatePasswords as ModuleGenerator,
  // keypads: Story 6.1 — first MEDIUM-tier module. Generator + reducer + a
  // medium/hard tier-pool entry land together (a pool may only list modules with
  // both a generator and a reducer, or generateLayout throws at ROUND_START).
  [KEYPADS_MODULE_ID]: generateKeypads as ModuleGenerator,
  // whos-on-first: Story 6.2 — second MEDIUM-tier module. Generator + reducer + a
  // medium/hard tier-pool entry land together (same generateLayout requirement).
  [WHOS_ON_FIRST_MODULE_ID]: generateWhosOnFirst as ModuleGenerator,
  // wire-sequences: Story 6.3 — third MEDIUM-tier module (first stateful one).
  // Generator + reducer + a medium/hard tier-pool entry land together (same
  // generateLayout requirement). Takes seed alone (no bomb-context rule).
  [WIRE_SEQUENCES_MODULE_ID]: generateWireSequences as ModuleGenerator,
  // mazes: Story 6.4 — fourth (and last) MEDIUM-tier module; first module with a
  // 2D navigable board. Generator + reducer + a medium/hard tier-pool entry land
  // together (same generateLayout requirement). Takes seed alone (no
  // bomb-context rule). Completes the Medium tier (TIER_POOLS.medium == catalog).
  [MAZES_MODULE_ID]: generateMazes as ModuleGenerator,
};

/**
 * Canonical production module IDs (kebab-case). Fixed here so every Epic 5–7
 * module story conforms to one ID instead of inventing its own. `'dev-demo'` is
 * intentionally absent — it is a reference module, not a production module, and
 * belongs to no tier pool.
 */
export const MODULE_IDS = [
  'wires',
  'the-button',
  'passwords',
  'keypads',
  'whos-on-first',
  'wire-sequences',
  'mazes',
  'complicated-wires',
  'simon-says',
  'memory',
  'morse-code',
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

/**
 * Default module pool per difficulty tier — each tier is a superset of the
 * easier one (harder rounds can still draw easy modules). Generation resolves
 * `config.modulePool ?? TIER_POOLS[config.difficulty]`.
 *
 * INTERIM COMPOSITION (Story 5.5): every pool ID must have a registered
 * generator in MODULE_GENERATORS (generateLayout enforces this and fails loud).
 * The real generatable Easy modules are `'wires'` (5.3), `'the-button'` (5.4)
 * and now `'passwords'` (5.5) — the canonical Easy trio.
 *
 * WHO OWNS RE-EXPANSION (read before adding a module): Story 8.1 did NOT
 * reconcile this map — it built `TIER_CATALOG` (display/gating metadata) + the
 * facilitator dashboard, and deliberately left this runtime pool alone. There is
 * no later reconciliation pass. **Each per-module story expands TIER_POOLS when
 * its generator lands**, honouring the superset rule above: add the module to its
 * home tier AND to every harder tier (e.g. a Medium module like keypads goes into
 * BOTH `medium` and `hard`, because `hard ⊇ medium`). Targets as generators land:
 * keypads/whos-on-first/wire-sequences/mazes (medium+hard) and complicated-wires/
 * simon-says/memory/morse-code (hard). The canonical target composition is
 * preserved in `TIER_CATALOG` + `MODULE_IDS` + the per-story backlog. A Facilitator
 * can still override with an explicit `modulePool` (e.g. `['dev-demo']`).
 */
export const TIER_POOLS: Record<DifficultyTier, readonly string[]> = {
  easy: ['wires', 'the-button', 'passwords'],
  // keypads (6.1) is the first Medium module — it joins medium AND hard (hard ⊇
  // medium). Easy stays the canonical Easy trio.
  // whos-on-first (6.2) joins keypads as the second Medium module (medium + hard).
  // wire-sequences (6.3) is the third Medium module (medium + hard).
  // mazes (6.4) is the fourth and LAST Medium module — it completes the Medium
  // tier, so TIER_POOLS.medium now equals TIER_CATALOG.medium (medium + hard).
  medium: ['wires', 'the-button', 'passwords', 'keypads', 'whos-on-first', 'wire-sequences', 'mazes'],
  hard: ['wires', 'the-button', 'passwords', 'keypads', 'whos-on-first', 'wire-sequences', 'mazes'],
};

/**
 * Canonical KTANE difficulty tiering (Decision 006) used as DISPLAY / GATING
 * metadata by the Facilitator dashboard (Story 8.1) — NOT the runtime generation
 * pool. It lists every module a tier *will* contain, including ones whose
 * generators land in later epics (keypads/simon-says/…). Each tier is a superset
 * of the easier one.
 *
 * THE TWO-POOL SPLIT (read before editing): `TIER_POOLS` above is the RUNTIME
 * pool — generation draws from it and `generateLayout` throws for any id without
 * a registered generator. `TIER_CATALOG` is the FULL design tiering for the UI.
 * The dashboard's *selectable* pool is `TIER_CATALOG[tier] ∩ keys(MODULE_GENERATORS)`;
 * un-implemented modules render as disabled chips. Do NOT collapse these two —
 * expanding `TIER_POOLS` to match this catalog before the generators exist makes
 * a default round throw at ROUND_START.
 */
export const TIER_CATALOG: Record<DifficultyTier, readonly ModuleId[]> = {
  easy: ['wires', 'the-button', 'passwords'],
  medium: ['wires', 'the-button', 'passwords', 'keypads', 'whos-on-first', 'wire-sequences', 'mazes'],
  hard: [...MODULE_IDS],
};

/**
 * Recommended per-tier defaults the dashboard applies when a tier is selected
 * (GDD Difficulty System table). Count is the low end of each tier's documented
 * range (easy 3–4 → 3, medium 5–6 → 5, hard 7–9 → 7); timers are the GDD
 * placeholder values pending playtesting. The Facilitator may override both.
 * Easy stays consistent with `DEFAULT_ROUND_CONFIG` (server createSession).
 */
export const TIER_DEFAULTS: Record<DifficultyTier, { moduleCount: number; timerMs: number }> = {
  easy: { moduleCount: 3, timerMs: 300_000 },
  medium: { moduleCount: 5, timerMs: 360_000 },
  hard: { moduleCount: 7, timerMs: 420_000 },
};
