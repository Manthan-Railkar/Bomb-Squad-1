import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import type { Group, MeshStandardMaterial } from 'three';
import { useGameStore } from '../../store/gameStore.js';
import type { ModuleDefuserViewProps } from '../registry.js';
import { dispatchModuleAction } from '../dispatch.js';
import { moduleClickHandlers } from '../interaction.js';
import { prefersReducedMotion } from '../../scenes/dom.js';
import { MEMORY_MODULE_ID, MEMORY_STAGE_COUNT, type MemoryState } from './types.js';

/**
 * Memory DefuserView — R3F rendering ONLY, zero game logic. The display digit
 * and the four button labels are read straight from the CURRENT stage of module
 * state; the correct button is resolved server-side and never present here.
 *
 * DELIBERATELY SHOWS ONLY THE CURRENT STAGE: the display, the four labelled
 * buttons, and a "Stage N / 5" counter. The press history is NOT rendered —
 * remembering which position/label you pressed in earlier stages is the entire
 * point of the module (AC #5). Numbers (1–4) are inherently non-colour signals,
 * so there is no colorblind concern.
 *
 * PRESS FEEDBACK: a click depresses the button and brightens it briefly, so the
 * Defuser sees the press register regardless of whether the server accepts it
 * (a wrong press resets the whole module — the reset itself is the feedback).
 *
 * SOLVED: a solved module goes quiescent — presses neither animate nor dispatch.
 */

const FACE_INK = '#0b0f0a'; // dark digit on the lit display / button face
const DISPLAY_COLOR = '#1c2b1a'; // recessed display panel
const DISPLAY_EMISSIVE = '#7CFF6B'; // faint green LCD glow
const BUTTON_COLOR = '#d7d2c4'; // pale keycap
const REST_EMISSIVE = 0.05;
const PRESS_EMISSIVE = 0.9;
const BASE_Z = 0.02;
const PRESS_DEPTH = 0.02;
const PRESS_HOLD = 0.16; // seconds the press feedback lingers

const BUTTON_SIZE = 0.13;
/** Four seats left→right = positions 1..4. */
const BUTTON_X: readonly number[] = [-0.24, -0.08, 0.08, 0.24];
const BUTTON_Y = -0.12;

/** Select the whole module envelope — the view needs `status` (solved) + `data`. */
function selectMemoryModule(moduleIndex: number) {
  return (s: ReturnType<typeof useGameStore.getState>) => {
    const mod = s.bomb?.modules[moduleIndex];
    return mod?.moduleId === MEMORY_MODULE_ID ? mod : null;
  };
}

export function MemoryDefuserView({ moduleIndex }: ModuleDefuserViewProps) {
  const selector = useMemo(() => selectMemoryModule(moduleIndex), [moduleIndex]);
  const mod = useGameStore(selector);
  const data = (mod?.data as MemoryState | undefined) ?? null;

  const pressed = useRef<{ position: number; remaining: number } | null>(null);
  const materials = useRef<Array<MeshStandardMaterial | null>>([]);
  const groups = useRef<Array<Group | null>>([]);
  // Reduced-motion: suppress the physical depress (motion); the emissive brighten
  // is a static brightness change and still conveys that the press registered.
  const reduced = useMemo(() => prefersReducedMotion(), []);

  // Press-feedback decay only (no sequence playback for Memory).
  useFrame((_, delta) => {
    if (pressed.current) {
      pressed.current.remaining -= delta;
      if (pressed.current.remaining <= 0) pressed.current = null;
    }
    const held = pressed.current?.position ?? null;
    for (let i = 0; i < 4; i++) {
      const mat = materials.current[i];
      if (mat) mat.emissiveIntensity = held === i + 1 ? PRESS_EMISSIVE : REST_EMISSIVE;
      const group = groups.current[i];
      if (group) group.position.z = held === i + 1 && !reduced ? BASE_Z - PRESS_DEPTH : BASE_Z;
    }
  });

  if (!data?.stages?.[data.stage - 1]) return null;
  const stage = data.stages[data.stage - 1];

  return (
    <group>
      {/* Display panel — the digit driving this stage's lookup. */}
      <mesh position={[0, 0.14, BASE_Z]}>
        <boxGeometry args={[0.2, 0.16, 0.03]} />
        <meshStandardMaterial color={DISPLAY_COLOR} emissive={DISPLAY_EMISSIVE} emissiveIntensity={0.35} />
      </mesh>
      <Text
        font="/fonts/jetbrains-mono-700.ttf"
        fontSize={0.12}
        color={DISPLAY_EMISSIVE}
        anchorX="center"
        anchorY="middle"
        position={[0, 0.14, BASE_Z + 0.02]}
      >
        {String(stage.display)}
      </Text>

      {/* Stage counter — progress only, never the press history. */}
      <Text
        font="/fonts/jetbrains-mono-700.ttf"
        fontSize={0.045}
        color="#9aa39a"
        anchorX="center"
        anchorY="middle"
        position={[0, 0.02, BASE_Z + 0.02]}
      >
        {`STAGE ${data.stage} / ${MEMORY_STAGE_COUNT}`}
      </Text>

      {/* Four buttons, positions 1..4 left→right, each showing its label digit. */}
      {stage.labels.map((label, i) => {
        const position = i + 1;
        const press = moduleClickHandlers(() => {
          const live = useGameStore.getState().bomb?.modules[moduleIndex];
          if (live?.status === 'solved') return;
          pressed.current = { position, remaining: PRESS_HOLD };
          dispatchModuleAction(moduleIndex, { type: 'PRESS', position });
        });
        return (
          <group
            key={i}
            ref={(g) => {
              groups.current[i] = g;
            }}
            position={[BUTTON_X[i], BUTTON_Y, BASE_Z]}
            {...press}
          >
            <mesh>
              <boxGeometry args={[BUTTON_SIZE, BUTTON_SIZE, 0.03]} />
              <meshStandardMaterial
                ref={(m) => {
                  materials.current[i] = m;
                }}
                color={BUTTON_COLOR}
                emissive={BUTTON_COLOR}
                emissiveIntensity={REST_EMISSIVE}
              />
            </mesh>
            <Text
              font="/fonts/jetbrains-mono-700.ttf"
              fontSize={0.07}
              color={FACE_INK}
              anchorX="center"
              anchorY="middle"
              position={[0, 0, 0.02]}
            >
              {String(label)}
            </Text>
          </group>
        );
      })}
    </group>
  );
}
