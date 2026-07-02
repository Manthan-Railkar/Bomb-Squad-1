import type { ModuleState, Reducer } from '../../types/index.js';
import { isComplicatedWiresAction, type ComplicatedWiresState } from './types.js';
import { complicatedWiresShouldCut } from './solve.js';

/**
 * Pure reducer for the complicated-wires module.
 *
 * Contract obligations (project-context Testing Rules):
 * - Actions arrive as `unknown` (untrusted client input) — guard, never throw.
 * - Never mutate input state; return new objects via spread/map.
 * - 'struck' is TRANSIENT: returned to signal a wrong cut; the bomb reducer
 *   rolls it into a team strike and re-arms the module. The wrongly-cut wire
 *   still severs in data (cuts are physical) and does not block solving.
 * - MULTI-CUT SOLVE (differs from wires): the module solves only when EVERY
 *   should-cut wire is severed. Cutting a should-not-cut wire is a strike but
 *   still severs the wire; leaving a should-not-cut wire uncut is fine.
 * - Cutting an already-severed wire is a no-op (idempotent — never a second
 *   strike for the same wire).
 * - MODULE_RESET (forwarded whole by the bomb reducer, bypassing its
 *   solved-inert guard) restores all wires uncut; layout/ctx unchanged.
 * - No Date.now(), no Math.random(), no I/O. shouldCut is recomputed at
 *   cut-time from the public ctx — no pre-computed answer in module data.
 */
export const complicatedWiresReducer: Reducer<ModuleState<ComplicatedWiresState>, unknown> = (
  state,
  action,
) => {
  if (!isComplicatedWiresAction(action)) return state; // guard: malformed/unknown → no-op

  if (action.type === 'MODULE_RESET') {
    return {
      ...state,
      status: 'armed',
      data: {
        ...state.data,
        wires: state.data.wires.map((wire) => (wire.cut ? { ...wire, cut: false } : wire)),
      },
    };
  }

  // Defense-in-depth: the bomb reducer keeps solved modules inert, but the
  // module reducer must be safe standalone (the sandbox runs it directly).
  if (state.status === 'solved') return state;

  const { wireIndex } = action;
  if (!Number.isInteger(wireIndex) || wireIndex < 0 || wireIndex >= state.data.wires.length) {
    return state; // guard: out-of-bounds / NaN / fractional index → no-op
  }
  if (state.data.wires[wireIndex].cut) return state; // idempotent: severed stays severed

  const { ctx } = state.data;
  // Physically sever the wire (cuts are permanent) regardless of correctness.
  const wires = state.data.wires.map((wire, i) =>
    i === wireIndex ? { ...wire, cut: true } : wire,
  );

  // Wrong cut → transient strike (wire still severed above). Correct cut →
  // solved iff every should-cut wire is now severed; else stays armed.
  const wasShouldCut = complicatedWiresShouldCut(state.data.wires[wireIndex].attrs, ctx);
  const allShouldCutSevered = wires.every((w) => !complicatedWiresShouldCut(w.attrs, ctx) || w.cut);

  return {
    ...state,
    status: wasShouldCut ? (allShouldCutSevered ? 'solved' : 'armed') : 'struck',
    data: { ...state.data, wires },
  };
};
