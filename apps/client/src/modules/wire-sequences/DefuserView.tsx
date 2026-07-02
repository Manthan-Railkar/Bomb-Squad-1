import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import { useGameStore } from '../../store/gameStore.js';
import type { ModuleDefuserViewProps } from '../registry.js';
import { dispatchModuleAction } from '../dispatch.js';
import { moduleClickHandlers } from '../interaction.js';
import {
  WIRE_SEQUENCES_MODULE_ID,
  WIRE_SEQ_COLOR_LABELS,
  type WireSeqColor,
  type WireSequencesState,
} from './types.js';

/**
 * Wire Sequences DefuserView — R3F rendering ONLY, zero game logic. Renders the
 * CURRENT panel's wires (data-driven from the generated state), each showing its
 * connection letter A/B/C prominently and a redundant colour label (colorblind
 * floor — colour is rule-load-bearing; the label is distinct from the A/B/C
 * connection letters). Up/down nav buttons switch panels; a panel indicator
 * shows the position. The solve confirmation is ModuleBay's LED, not chrome.
 *
 * Occurrence counting is global and lives in the reducer — the view never
 * computes it. The view only knows: which panel is visible, and each wire's
 * GLOBAL index (panel offset + slot), which it dispatches on a cut.
 *
 * No timer → no useFrame. Body budget: ~0.7×0.4, shallow z (ModuleBay mounts
 * this group at [0, -0.04, faceZ] on a 0.8×0.55 faceplate).
 */

/** Raw hexes with token names in comments — CSS vars can't reach WebGL (4.x convention). */
const WIRE_TINTS: Readonly<Record<WireSeqColor, string>> = {
  red: '#D8402F', // mockup .wire.red gradient mid
  blue: '#3B7BE0', // mockup .wire.blue gradient mid
  black: '#23202A', // near-bakelite black (label K carries the signal)
};
const LABEL_INK = '#8A8590'; // mockup .wire-lab
const LETTER_INK = '#E5DDC9'; // bone ink for the load-bearing connection letter
const GROMMET = '#5A5560';
const NAV_CAP = '#2A2732';
const NAV_INK = '#E5DDC9';

const WIRE_LENGTH = 0.42;
const WIRE_RADIUS = 0.016;
const ROW_SPAN = 0.3; // vertical span for up to 3 wire rows
const LABEL_X = -0.32; // colour label, far left
const LETTER_X = -0.24; // connection letter, just inside the label
const WIRE_X = 0.05; // wire centreline
const NAV_X = 0.34; // nav buttons, far right

function selectWireSeqData(moduleIndex: number) {
  return (s: ReturnType<typeof useGameStore.getState>): WireSequencesState | null => {
    const mod = s.bomb?.modules[moduleIndex];
    // moduleId check guards a desynced payload from rendering garbage.
    return mod?.moduleId === WIRE_SEQUENCES_MODULE_ID ? (mod.data as WireSequencesState) : null;
  };
}

export function WireSequencesDefuserView({ moduleIndex }: ModuleDefuserViewProps) {
  // Snapshot-rate reactive selector — memoized on moduleIndex so the reference
  // is stable across renders; zustand only re-subscribes when moduleIndex
  // changes. Nothing per-frame here.
  const selector = useMemo(() => selectWireSeqData(moduleIndex), [moduleIndex]);
  const data = useGameStore(selector);

  if (!data || data.panels.length === 0) return null;

  const panelCount = data.panels.length;
  const current = Math.min(Math.max(data.currentPanel, 0), panelCount - 1);
  const panel = data.panels[current];
  // Global index offset of the first wire on the visible panel (occurrence is
  // global; the reducer judges by the global index we dispatch here).
  const globalOffset = data.panels
    .slice(0, current)
    .reduce((n, p) => n + p.wires.length, 0);

  const rows = panel.wires.length;
  const spacing = rows > 1 ? ROW_SPAN / (rows - 1) : 0;
  const topY = rows > 1 ? ROW_SPAN / 2 : 0;

  // Boundary panels get no dispatch (the server would just no-op the clamped
  // NAV) and a dimmed glyph as the affordance.
  const canNav = (direction: 'up' | 'down') =>
    direction === 'down' ? current < panelCount - 1 : current > 0;
  const nav = (direction: 'up' | 'down') =>
    moduleClickHandlers(() => {
      if (!canNav(direction)) return;
      dispatchModuleAction(moduleIndex, { type: 'NAV', direction });
    });

  return (
    <group>
      {/* Panel indicator — top of the module. */}
      <Text
        font="/fonts/jetbrains-mono-700.ttf"
        fontSize={0.05}
        color={LABEL_INK}
        anchorX="center"
        anchorY="middle"
        position={[0, 0.24, 0.02]}
      >
        {`Panel ${current + 1} of ${panelCount}`}
      </Text>

      {panel.wires.map((wire, slotIndex) => {
        const globalIndex = globalOffset + slotIndex;
        const y = topY - slotIndex * spacing;
        const tint = WIRE_TINTS[wire.color];
        const severed = wire.cut;
        // Click anywhere on the wire group = cut THIS wire by its GLOBAL index;
        // the reducer judges (idempotent on a severed wire, position-agnostic).
        const cut = moduleClickHandlers(() =>
          dispatchModuleAction(moduleIndex, { type: 'CUT', wireIndex: globalIndex }),
        );
        return (
          <group key={slotIndex} position={[0, y, 0.02]}>
            {/* Colour redundancy label (never colour alone). */}
            <Text
              font="/fonts/jetbrains-mono-700.ttf"
              fontSize={0.05}
              color={LABEL_INK}
              anchorX="center"
              anchorY="middle"
              position={[LABEL_X, 0, 0]}
            >
              {WIRE_SEQ_COLOR_LABELS[wire.color]}
            </Text>
            {/* Connection letter A/B/C — the reading the Expert needs. */}
            <Text
              font="/fonts/jetbrains-mono-700.ttf"
              fontSize={0.07}
              color={LETTER_INK}
              anchorX="center"
              anchorY="middle"
              position={[LETTER_X, 0, 0]}
            >
              {wire.letter}
            </Text>

            {/* name = e2e projection target (TD-6); module-scoped GLOBAL index, render-only. */}
            <group name={`m${moduleIndex}-wseq-wire-${globalIndex}`} position={[WIRE_X, 0, 0]} {...cut}>
              {severed ? (
                <>
                  <mesh position={[-WIRE_LENGTH / 4, -0.01, 0]} rotation={[0, 0, Math.PI / 2 - 0.25]}>
                    <cylinderGeometry args={[WIRE_RADIUS, WIRE_RADIUS, WIRE_LENGTH / 2 - 0.04, 8]} />
                    <meshStandardMaterial color={tint} />
                  </mesh>
                  <mesh position={[WIRE_LENGTH / 4, -0.01, 0]} rotation={[0, 0, Math.PI / 2 + 0.25]}>
                    <cylinderGeometry args={[WIRE_RADIUS, WIRE_RADIUS, WIRE_LENGTH / 2 - 0.04, 8]} />
                    <meshStandardMaterial color={tint} />
                  </mesh>
                </>
              ) : (
                <mesh rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[WIRE_RADIUS, WIRE_RADIUS, WIRE_LENGTH, 8]} />
                  <meshStandardMaterial color={tint} />
                </mesh>
              )}
              {([-1, 1] as const).map((side) => (
                <mesh key={side} position={[(side * WIRE_LENGTH) / 2, 0, 0]}>
                  <boxGeometry args={[0.035, 0.05, 0.035]} />
                  <meshStandardMaterial color={GROMMET} />
                </mesh>
              ))}
            </group>
          </group>
        );
      })}

      {/* Up / down navigation buttons — right side, single-click each. */}
      {([
        ['up', 0.08, '▲'],
        ['down', -0.08, '▼'],
      ] as const).map(([direction, y, glyph]) => (
        // name = e2e projection target (TD-6); module-scoped, render-only.
        <group key={direction} name={`m${moduleIndex}-wseq-nav-${direction}`} position={[NAV_X, y, 0.02]} {...nav(direction)}>
          <mesh>
            <boxGeometry args={[0.1, 0.1, 0.03]} />
            <meshStandardMaterial color={NAV_CAP} />
          </mesh>
          <Text
            font="/fonts/jetbrains-mono-700.ttf"
            fontSize={0.06}
            color={canNav(direction) ? NAV_INK : GROMMET}
            anchorX="center"
            anchorY="middle"
            position={[0, 0, 0.02]}
          >
            {glyph}
          </Text>
        </group>
      ))}
    </group>
  );
}
