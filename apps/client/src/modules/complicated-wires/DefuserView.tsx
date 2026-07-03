import { useCallback, useMemo } from 'react';
import { Text } from '@react-three/drei';
import { useGameStore } from '../../store/gameStore.js';
import type { ModuleDefuserViewProps } from '../registry.js';
import { dispatchModuleAction } from '../dispatch.js';
import { moduleClickHandlers } from '../interaction.js';
import { useOptimisticPreFlash } from '../useOptimisticPreFlash.js';
import {
  COMPLICATED_WIRES_MODULE_ID,
  type WireAttributes,
  type ComplicatedWiresState,
} from './types.js';

/**
 * Complicated Wires DefuserView — R3F rendering ONLY, zero game logic. Layout
 * is fully data-driven from the generated wires array (count, per-wire
 * attributes, cut flags); the solve confirmation is ModuleBay's LED.
 *
 * COLORBLIND FLOOR (AC4, NFR11/UX-DR14): each wire carries four attributes
 * (red stripe / blue stripe / star / LED). Colour is NEVER the only signal —
 * every attribute is shown as an explicit LABEL token that is present or a
 * dim "—" when absent, so the readout is legible without perceiving hue.
 *
 * Body budget: the bay faceplate is 0.8×0.55; keep geometry within ~0.7×0.4.
 */

/** Raw hexes with token intent in comments — CSS vars can't reach WebGL. */
const WIRE_BASE = '#B87333'; // neutral copper wire body
const RED_TINT = '#D8402F'; // red-stripe band
const BLUE_TINT = '#3B7BE0'; // blue-stripe band
const LED_ON = '#F2C744'; // lit LED
const LED_OFF = '#2A2730'; // dark LED
const LABEL_INK = '#CFC9D4'; // present-attribute label
const LABEL_DIM = '#5A5560'; // absent-attribute placeholder
const GROMMET = '#5A5560';

const ROW_SPAN = 0.34; // total vertical span available for wire rows
const WIRE_LENGTH = 0.32;
const WIRE_RADIUS = 0.016;
const WIRE_X = 0.16; // wire centreline (attribute readout sits to its left)
// Four attribute-token x positions, left of the wire.
const TOKEN_X = [-0.34, -0.27, -0.2, -0.11] as const;

/**
 * Ordered attribute descriptors: [label-when-present, accessor]. Labels are
 * plain ASCII letter tokens (RS/BS/ST/LED) — the bundled jetbrains-mono-700
 * WebGL font has no ★ (U+2605) glyph, so a symbol token would render as tofu
 * and silently defeat the AC4 colourblind floor. 'ST' matches the manual's
 * "Star" column and the RS/BS/LED convention.
 */
const ATTRS: ReadonlyArray<{ label: string; get: (a: WireAttributes) => boolean }> = [
  { label: 'RS', get: (a) => a.redStripe },
  { label: 'BS', get: (a) => a.blueStripe },
  { label: 'ST', get: (a) => a.star },
  { label: 'LED', get: (a) => a.led },
];

function selectComplicatedWiresData(moduleIndex: number) {
  return (s: ReturnType<typeof useGameStore.getState>): ComplicatedWiresState | null => {
    const mod = s.bomb?.modules[moduleIndex];
    return mod?.moduleId === COMPLICATED_WIRES_MODULE_ID ? (mod.data as ComplicatedWiresState) : null;
  };
}

export function ComplicatedWiresDefuserView({ moduleIndex }: ModuleDefuserViewProps) {
  const selector = useMemo(() => selectComplicatedWiresData(moduleIndex), [moduleIndex]);
  const data = useGameStore(selector);

  // Optimistic pre-flash: a cut wire shows severed on the click's own frame,
  // before the server confirms. `isConfirmed` reads the LATEST authoritative
  // snapshot so reconcile drops the marker once the server reflects the cut;
  // if no confirmation lands it rolls back. Never touches the solve LED.
  const isConfirmed = useCallback(
    (wireIndex: number) => {
      const mod = useGameStore.getState().bomb?.modules[moduleIndex];
      if (mod?.moduleId !== COMPLICATED_WIRES_MODULE_ID) return false;
      return (mod.data as ComplicatedWiresState).wires[wireIndex]?.cut === true;
    },
    [moduleIndex],
  );
  const preFlash = useOptimisticPreFlash(isConfirmed);

  if (!data) return null;

  const rows = data.wires.length;
  const spacing = rows > 1 ? ROW_SPAN / (rows - 1) : 0;
  const topY = ROW_SPAN / 2;

  return (
    <group>
      {data.wires.map((wire, wireIndex) => {
        const y = topY - wireIndex * spacing;
        const severed = wire.cut || preFlash.active.has(wireIndex);
        const cut = moduleClickHandlers(() => {
          const mod = useGameStore.getState().bomb?.modules[moduleIndex];
          const liveWire =
            mod?.moduleId === COMPLICATED_WIRES_MODULE_ID
              ? (mod.data as ComplicatedWiresState).wires[wireIndex]
              : undefined;
          const canChange = mod?.status !== 'solved' && liveWire?.cut === false;
          // Don't emit a redundant CUT for an already-severed wire or a solved
          // module — the reducer no-ops it, but there's no reason to send it.
          if (!canChange) return;
          const dispatched = dispatchModuleAction(moduleIndex, { type: 'CUT', wireIndex });
          if (dispatched) preFlash.mark(wireIndex);
        });
        return (
          <group key={wireIndex} position={[0, y, 0.02]}>
            {/* Attribute readout — LABEL redundancy (never colour alone).
                Present → the glyph in bright ink; absent → a dim "—". */}
            {ATTRS.map((attr, i) => {
              const present = attr.get(wire.attrs);
              return (
                <Text
                  key={attr.label}
                  font="/fonts/jetbrains-mono-700.ttf"
                  fontSize={0.034}
                  color={present ? LABEL_INK : LABEL_DIM}
                  anchorX="center"
                  anchorY="middle"
                  position={[TOKEN_X[i], 0, 0]}
                >
                  {present ? attr.label : '—'}
                </Text>
              );
            })}

            {/* LED pip — reads on/off by fill AND the adjacent "LED" token. */}
            <mesh position={[TOKEN_X[3], 0.032, 0]}>
              <sphereGeometry args={[0.01, 12, 12]} />
              <meshStandardMaterial
                color={wire.attrs.led ? LED_ON : LED_OFF}
                emissive={wire.attrs.led ? LED_ON : '#000000'}
                emissiveIntensity={wire.attrs.led ? 0.8 : 0}
              />
            </mesh>

            {/* name = e2e projection target (TD-7); module-scoped, render-only. */}
            <group name={`m${moduleIndex}-cwire-${wireIndex}`} position={[WIRE_X, 0, 0]} {...cut}>
              {severed ? (
                <>
                  <mesh position={[-WIRE_LENGTH / 4, -0.01, 0]} rotation={[0, 0, Math.PI / 2 - 0.25]}>
                    <cylinderGeometry args={[WIRE_RADIUS, WIRE_RADIUS, WIRE_LENGTH / 2 - 0.03, 8]} />
                    <meshStandardMaterial color={WIRE_BASE} />
                  </mesh>
                  <mesh position={[WIRE_LENGTH / 4, -0.01, 0]} rotation={[0, 0, Math.PI / 2 + 0.25]}>
                    <cylinderGeometry args={[WIRE_RADIUS, WIRE_RADIUS, WIRE_LENGTH / 2 - 0.03, 8]} />
                    <meshStandardMaterial color={WIRE_BASE} />
                  </mesh>
                </>
              ) : (
                <>
                  <mesh rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[WIRE_RADIUS, WIRE_RADIUS, WIRE_LENGTH, 8]} />
                    <meshStandardMaterial color={WIRE_BASE} />
                  </mesh>
                  {/* Stripe bands — visual flavour; the RS/BS tokens carry the
                      authoritative signal, so a colourblind player is unaffected. */}
                  {wire.attrs.redStripe ? (
                    <mesh position={[-WIRE_LENGTH / 4, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                      <cylinderGeometry args={[WIRE_RADIUS + 0.004, WIRE_RADIUS + 0.004, 0.05, 8]} />
                      <meshStandardMaterial color={RED_TINT} />
                    </mesh>
                  ) : null}
                  {wire.attrs.blueStripe ? (
                    <mesh position={[WIRE_LENGTH / 4, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                      <cylinderGeometry args={[WIRE_RADIUS + 0.004, WIRE_RADIUS + 0.004, 0.05, 8]} />
                      <meshStandardMaterial color={BLUE_TINT} />
                    </mesh>
                  ) : null}
                  {/* Star mark sits on the wire when present (flavour only; the
                      'ST' token carries the authoritative signal). Uses '*' — the
                      bundled font has no ★ glyph and would render tofu. */}
                  {wire.attrs.star ? (
                    <Text
                      font="/fonts/jetbrains-mono-700.ttf"
                      fontSize={0.05}
                      color={LABEL_INK}
                      anchorX="center"
                      anchorY="middle"
                      position={[0, 0.035, 0.01]}
                    >
                      *
                    </Text>
                  ) : null}
                </>
              )}
              {/* End grommets anchor the wire and pad the click target. */}
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
    </group>
  );
}
