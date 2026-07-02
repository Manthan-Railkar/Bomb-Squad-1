import type { ModuleState, Reducer } from '../../types/index.js';
import {
  isWireSequencesAction,
  type WireSeqPanel,
  type WireSequencesState,
} from './types.js';
import { flattenWires, isSolved, shouldCut, wireByGlobalIndex } from './solve.js';

/**
 * Pure reducer for the Wire Sequences module — the first genuinely STATEFUL
 * module (multi-panel + NAV + cumulative-occurrence auto-solve).
 *
 * Contract obligations (project-context Testing Rules):
 *  - Actions arrive as `unknown` (untrusted client input) — guard, never throw.
 *  - Never mutate input state; return new objects via spread/map.
 *  - 'struck' is TRANSIENT: returned to signal a wrong cut; the bomb reducer
 *    rolls it into a team strike and re-arms. The wrongly-cut wire STAYS
 *    severed (cuts are physical) — that is what makes a repeat CUT a no-op and
 *    satisfies the idempotency AC.
 *  - Cutting an already-severed wire is a no-op (idempotent — never a second
 *    strike for the same wire).
 *  - NAV is purely a view change; it never strikes, never solves, and never
 *    affects occurrence counting (which is global and view-independent).
 *  - MODULE_RESET (forwarded whole by the bomb reducer, bypassing its
 *    solved-inert guard) re-arms: all wires uncut, currentPanel back to 0.
 *  - No Date.now(), no Math.random(), no I/O.
 *
 * CUT is intentionally POSITION-AGNOSTIC: it takes a GLOBAL wire index and is
 * NOT gated on currentPanel. The KTANE-faithful "only cut the visible panel"
 * rule is a UI concern (the client only makes current-panel wires clickable);
 * an out-of-panel index can only arrive from a malformed client and is handled
 * purely by the bounds guard.
 */
export const wireSequencesReducer: Reducer<ModuleState<WireSequencesState>, unknown> = (
  state,
  action,
) => {
  if (!isWireSequencesAction(action)) return state; // guard: malformed/unknown → no-op

  if (action.type === 'MODULE_RESET') {
    return {
      ...state,
      status: 'armed',
      data: {
        panels: state.data.panels.map((panel) =>
          panel.wires.some((w) => w.cut)
            ? { wires: panel.wires.map((w) => (w.cut ? { ...w, cut: false } : w)) }
            : panel,
        ),
        currentPanel: 0,
      },
    };
  }

  // Defense-in-depth: the bomb reducer keeps solved modules inert, but the
  // module reducer must be safe standalone (the sandbox runs it directly).
  if (state.status === 'solved') return state;

  if (action.type === 'NAV') {
    const last = state.data.panels.length - 1;
    const delta = action.direction === 'down' ? 1 : -1;
    const next = Math.min(Math.max(state.data.currentPanel + delta, 0), last);
    // Clamped at a boundary → same panel → return the SAME object (no alloc).
    if (next === state.data.currentPanel) return state;
    return { ...state, data: { ...state.data, currentPanel: next } };
  }

  // CUT — global-index bounds/NaN/non-integer guard (untrusted client input).
  const { wireIndex } = action;
  const target = wireByGlobalIndex(state.data, wireIndex);
  if (!Number.isInteger(wireIndex) || wireIndex < 0 || target === undefined) {
    return state; // out-of-bounds / NaN / fractional → no-op
  }
  if (target.cut) return state; // idempotent: severed stays severed, never a 2nd strike

  // Mark this wire cut (physical). Rebuild only the panel it lives in.
  const flat = flattenWires(state.data);
  const { panelIndex, slotIndex } = flat[wireIndex];
  const panels: WireSeqPanel[] = state.data.panels.map((panel, pi) =>
    pi === panelIndex
      ? { wires: panel.wires.map((w, si) => (si === slotIndex ? { ...w, cut: true } : w)) }
      : panel,
  );
  const nextData: WireSequencesState = { ...state.data, panels };

  // Recompute from public data (no stored answer). A should-cut wire that
  // completes the set solves; otherwise it stays armed. A should-not-cut wire
  // strikes (transient) but stays severed.
  const status = shouldCut(state.data, wireIndex)
    ? isSolved(nextData)
      ? 'solved'
      : 'armed'
    : 'struck';

  return { ...state, status, data: nextData };
};
