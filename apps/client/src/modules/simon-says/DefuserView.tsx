import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import type { Group, MeshStandardMaterial } from 'three';
import { useGameStore } from '../../store/gameStore.js';
import { prefersReducedMotion } from '../../scenes/dom.js';
import type { ModuleDefuserViewProps } from '../registry.js';
import { dispatchModuleAction } from '../dispatch.js';
import { moduleClickHandlers } from '../interaction.js';
import {
  SIMON_SAYS_MODULE_ID,
  SIMON_COLOR_LABELS,
  type SimonColor,
  type SimonSaysState,
} from './types.js';

/**
 * Simon Says DefuserView — R3F rendering ONLY, zero game logic. The panel
 * layout and the flash playback are fully data-driven from module state
 * (`sequence`, `stage`); the translation/answer lives server-side and is never
 * present here (the Defuser sees only the raw flashes, which is by design).
 *
 * COLORBLIND FLOOR (AC5, NFR11/UX-DR14): every panel carries its persistent
 * letter label (R/B/G/Y) in dark mono ink, and a flash is a large discrete
 * luminance step of the whole panel face behind it — a brightness signal, so
 * hue is never the only cue. Flashes are discrete on/off steps (no easing),
 * which also satisfies reduced-motion.
 *
 * PLAYBACK RESTART: on ANY module update (a grown stage, a strike, an accepted
 * press — the store hands a fresh module object each time), the flash halts
 * IMMEDIATELY, holds a short quiet lead-in, then replays from the first flash —
 * so no stray mid-flash blink leaks across a state change (behaviour verified
 * interactively, Story 7.2 Completion Notes).
 *
 * SOLVED: a solved module goes quiescent — no playback, and presses neither
 * animate nor dispatch (server/sandbox reducers are solved-inert anyway; this
 * just stops dead traffic and a forever-looping flash).
 *
 * PRESS FEEDBACK: a click depresses the panel and brightens it briefly, so the
 * Defuser sees the press register regardless of whether the server accepts it.
 *
 * Body budget: keep geometry within ~0.6×0.6 of the bay faceplate.
 */

/** Raw hexes with token intent in comments — CSS vars can't reach WebGL. */
const PANEL_COLOR: Readonly<Record<SimonColor, string>> = {
  red: '#D8402F',
  blue: '#3B7BE0',
  green: '#3fae5a',
  yellow: '#F2C744',
};
const LABEL_INK = '#111014'; // dark label on the bright panel face

/** Diamond seats (GDD): Blue top, Red left, Yellow right, Green bottom. */
const PANEL_POS: Readonly<Record<SimonColor, readonly [number, number]>> = {
  blue: [0, 0.19],
  red: [-0.19, 0],
  yellow: [0.19, 0],
  green: [0, -0.19],
};

const PANEL_SIZE = 0.15;
const BASE_Z = 0.02; // resting panel depth on the faceplate
const REST_EMISSIVE = 0.06; // dim resting glow
const FLASH_EMISSIVE = 0.9; // lit during a sequence flash
const PRESS_EMISSIVE = 1.15; // brightest — the just-pressed panel
const PRESS_DEPTH = 0.02; // how far a pressed panel sinks in −z
const PRESS_HOLD = 0.16; // seconds the press feedback lingers

/** Flash timing (seconds). Discrete on/off — reduced-motion safe by design. */
const FLASH_ON = 0.45;
const FLASH_GAP = 0.28;
const CYCLE_PAUSE = 1.1; // extra pause after the last flash's gap (loop quiet gap = FLASH_GAP + CYCLE_PAUSE)
const RESTART_PAUSE = 1.0; // quiet lead-in after any module-state change

/** Panel colours in a stable module-scope array — never rebuilt per frame. */
const PANEL_COLORS = Object.keys(PANEL_POS) as SimonColor[];

/** Select the whole module envelope — the view needs `status` (solved) + `data`. */
function selectSimonModule(moduleIndex: number) {
  return (s: ReturnType<typeof useGameStore.getState>) => {
    const mod = s.bomb?.modules[moduleIndex];
    return mod?.moduleId === SIMON_SAYS_MODULE_ID ? mod : null;
  };
}

/** Which revealed flash (if any) is lit at time `t` into the playback loop. */
function flashAt(t: number, revealed: readonly SimonColor[]): SimonColor | null {
  const slot = FLASH_ON + FLASH_GAP;
  const loop = revealed.length * slot + CYCLE_PAUSE;
  const local = t % loop;
  const i = Math.floor(local / slot);
  if (i >= revealed.length) return null; // in the trailing cycle pause
  return local - i * slot < FLASH_ON ? revealed[i] : null;
}

export function SimonSaysDefuserView({ moduleIndex }: ModuleDefuserViewProps) {
  const selector = useMemo(() => selectSimonModule(moduleIndex), [moduleIndex]);
  const mod = useGameStore(selector);
  const data = (mod?.data as SimonSaysState | undefined) ?? null;

  const clock = useRef(-RESTART_PAUSE);
  const lastData = useRef<SimonSaysState | null>(null);
  const revealed = useRef<readonly SimonColor[]>([]);
  const pressed = useRef<{ color: SimonColor; remaining: number } | null>(null);
  const materials = useRef<Partial<Record<SimonColor, MeshStandardMaterial | null>>>({});
  const groups = useRef<Partial<Record<SimonColor, Group | null>>>({});
  const reduced = useMemo(() => prefersReducedMotion(), []);

  // Drive playback + press feedback off the frame clock (never setInterval).
  useFrame((_, delta) => {
    // Reset playback on ANY module-state change — the store hands us a fresh
    // `data` object on every MODULE_UPDATE, so this catches a grown stage, a
    // strike (stage/sequence unchanged, only progress resets), and every press
    // alike: stop flashing now, hold a short quiet lead-in, then replay from the
    // first flash. (A string signature over stage/sequence missed strikes.)
    // The revealed slice is computed HERE, only on change — never per frame
    // (project-context: no new objects inside useFrame). A solved module goes
    // quiescent: nothing left to play back.
    if (data !== lastData.current) {
      lastData.current = data;
      clock.current = -RESTART_PAUSE;
      revealed.current =
        data && mod?.status !== 'solved' ? data.sequence.slice(0, data.stage) : [];
    }

    // Reduced motion softens the tempo but keeps the discrete steps.
    clock.current += reduced ? delta * 0.6 : delta;
    const lit =
      clock.current >= 0 && revealed.current.length > 0
        ? flashAt(clock.current, revealed.current)
        : null;

    // Decay the press-feedback timer.
    if (pressed.current) {
      pressed.current.remaining -= delta;
      if (pressed.current.remaining <= 0) pressed.current = null;
    }
    const held = pressed.current?.color ?? null;

    for (const color of PANEL_COLORS) {
      const mat = materials.current[color];
      if (mat) {
        mat.emissiveIntensity =
          held === color ? PRESS_EMISSIVE : lit === color ? FLASH_EMISSIVE : REST_EMISSIVE;
      }
      const group = groups.current[color];
      if (group) group.position.z = held === color ? BASE_Z - PRESS_DEPTH : BASE_Z;
    }
  });

  if (!data) return null;

  return (
    <group>
      {PANEL_COLORS.map((color) => {
        const [x, y] = PANEL_POS[color];
        const press = moduleClickHandlers(() => {
          // Solved modules are inert — no press animation, no dead traffic
          // (live-store read at click time, mirroring wires' canChange gate).
          const live = useGameStore.getState().bomb?.modules[moduleIndex];
          if (live?.status === 'solved') return;
          // Local press feedback fires immediately (independent of the server's
          // accept/reject) so the Defuser sees the click land.
          pressed.current = { color, remaining: PRESS_HOLD };
          dispatchModuleAction(moduleIndex, {
            type: 'PRESS',
            color,
            // Live team strike count at press-time; the SERVER overrides this
            // with the authoritative value, so a stale read here is harmless in
            // production (it only matters for the serverless /dev/sandbox).
            strikeCount: useGameStore.getState().bomb?.strikes ?? 0,
          });
        });
        return (
          <group
            key={color}
            ref={(g) => {
              groups.current[color] = g;
            }}
            position={[x, y, BASE_Z]}
            {...press}
          >
            <mesh>
              <boxGeometry args={[PANEL_SIZE, PANEL_SIZE, 0.03]} />
              <meshStandardMaterial
                ref={(m) => {
                  materials.current[color] = m;
                }}
                color={PANEL_COLOR[color]}
                emissive={PANEL_COLOR[color]}
                emissiveIntensity={REST_EMISSIVE}
              />
            </mesh>
            {/* Letter label — the authoritative, colour-independent signal. */}
            <Text
              font="/fonts/jetbrains-mono-700.ttf"
              fontSize={0.07}
              color={LABEL_INK}
              anchorX="center"
              anchorY="middle"
              position={[0, 0, 0.02]}
            >
              {SIMON_COLOR_LABELS[color]}
            </Text>
          </group>
        );
      })}
    </group>
  );
}
