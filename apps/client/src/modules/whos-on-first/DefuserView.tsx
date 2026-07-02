import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import { useGameStore } from '../../store/gameStore.js';
import type { ModuleDefuserViewProps } from '../registry.js';
import { dispatchModuleAction } from '../dispatch.js';
import { moduleClickHandlers } from '../interaction.js';
import { WHOS_ON_FIRST_MODULE_ID, type WhosOnFirstState } from './types.js';

/**
 * Who's on First DefuserView — R3F rendering ONLY, zero game logic. The display
 * word and the six button labels are fully data-driven from the generated
 * WhosOnFirstState (never hardcode the six — we map over data.labels). The solve
 * confirmation is ModuleBay's LED, not module chrome.
 *
 * Interaction is the single-click primitive (moduleClickHandlers): each button
 * dispatches a PRESS with its grid index; the reducer recomputes the solution
 * from the public tables and strikes on a wrong press. No timer, no colour cue —
 * like keypads/passwords. The display panel is read-only (not clickable).
 *
 * Body budget: the bay faceplate is 0.8×0.55 and ModuleBay mounts this group at
 * [0, -0.04, faceZ] — the display panel + 2×3 label grid stay within ~0.55×0.5.
 */

const PANEL = '#14121A'; // display panel ground
const PANEL_INK = '#E5DDC9'; // bone display text
const CAP = '#2A2732'; // button keycap
const CAP_INK = '#E5DDC9'; // button label ink

const FONT = '/fonts/jetbrains-mono-700.ttf';

const BTN_W = 0.34;
const BTN_H = 0.078;

/** Grid position → local [x, y]. 0=TL,1=TR,2=ML,3=MR,4=BL,5=BR. */
const GRID_XY: ReadonlyArray<readonly [number, number]> = [
  [-0.19, 0.06],
  [0.19, 0.06],
  [-0.19, -0.04],
  [0.19, -0.04],
  [-0.19, -0.14],
  [0.19, -0.14],
];

function selectWhosOnFirstData(moduleIndex: number) {
  return (s: ReturnType<typeof useGameStore.getState>): WhosOnFirstState | null => {
    const mod = s.bomb?.modules[moduleIndex];
    // moduleId check guards a desynced payload from rendering garbage.
    return mod?.moduleId === WHOS_ON_FIRST_MODULE_ID ? (mod.data as WhosOnFirstState) : null;
  };
}

export function WhosOnFirstDefuserView({ moduleIndex }: ModuleDefuserViewProps) {
  // Snapshot-rate reactive selector — memoized on moduleIndex so the reference is
  // stable across renders; zustand only re-subscribes when moduleIndex changes.
  const selector = useMemo(() => selectWhosOnFirstData(moduleIndex), [moduleIndex]);
  const data = useGameStore(selector);

  if (!data) return null;

  return (
    <group>
      {/* Display panel (read-only). Empty string renders as a blank panel. */}
      <group position={[0, 0.19, 0.02]}>
        <mesh>
          <boxGeometry args={[0.42, 0.11, 0.02]} />
          <meshStandardMaterial color={PANEL} />
        </mesh>
        <Text font={FONT} fontSize={0.06} color={PANEL_INK} anchorX="center" anchorY="middle" position={[0, 0, 0.02]}>
          {data.display}
        </Text>
      </group>

      {/* Six labelled buttons, mapped from data.labels (never hardcoded). */}
      {data.labels.map((label: string, buttonIndex: number) => {
        const [x, y] = GRID_XY[buttonIndex] ?? [0, 0];
        // Each button press is a single click that dispatches THIS grid index;
        // the reducer judges the solution (the view only dispatches).
        const press = moduleClickHandlers(() =>
          dispatchModuleAction(moduleIndex, { type: 'PRESS', buttonIndex }),
        );
        return (
          // name = e2e projection target (TD-6); module-scoped, render-only.
          <group key={buttonIndex} name={`m${moduleIndex}-wof-button-${buttonIndex}`} position={[x, y, 0.02]} {...press}>
            <mesh>
              <boxGeometry args={[BTN_W, BTN_H, 0.03]} />
              <meshStandardMaterial color={CAP} />
            </mesh>
            <Text
              font={FONT}
              fontSize={0.045}
              maxWidth={BTN_W - 0.04}
              color={CAP_INK}
              anchorX="center"
              anchorY="middle"
              position={[0, 0, 0.02]}
            >
              {label}
            </Text>
          </group>
        );
      })}
    </group>
  );
}
