import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import { useGameStore } from '../../store/gameStore.js';
import type { ModuleDefuserViewProps } from '../registry.js';
import { dispatchModuleAction } from '../dispatch.js';
import { moduleClickHandlers } from '../interaction.js';
import { KEYPADS_MODULE_ID, KEYPAD_SYMBOL_GLYPHS, type KeypadsState, type SymbolId } from './types.js';

/**
 * Keypads DefuserView — R3F rendering ONLY, zero game logic. The four buttons,
 * their glyphs, and their pressed/lit state are fully data-driven from the
 * generated KeypadsState (never hardcode the four — we map over data.keys). The
 * solve confirmation is ModuleBay's LED, not module chrome.
 *
 * Interaction is the single-click primitive (moduleClickHandlers): each button
 * dispatches a PRESS with its grid index; the reducer judges the order and
 * strikes on a wrong press. No timer, no colour cue — like passwords.
 *
 * Glyph rendering (AC3): each button shows its symbol's glyph via the
 * KEYPAD_SYMBOL_GLYPHS lookup (keyed by the opaque symbol id) — the single swap
 * point for the authoritative manual-p.7 asset. Ships with the GDD Unicode
 * approximations via drei Text + the vendored mono font.
 *
 * Body budget: the bay faceplate is 0.8×0.55 and ModuleBay mounts this group at
 * [0, -0.04, faceZ] — the 2×2 grid stays within ~0.55×0.4, shallow z.
 */

const GLYPH_INK = '#E5DDC9'; // bone glyph ink (mockup palette)
const CAP = '#2A2732'; // unpressed keycap
const CAP_LIT = '#3B7BE0'; // pressed/lit keycap (mockup blue)
const CAP_INK_LIT = '#1A1820';

const CELL = 0.24; // centre-to-centre spacing of the 2×2 grid
const KEY_SIZE = 0.2; // keycap footprint

// Keypad glyphs draw from the GDD's closest-Unicode approximations (the AC3
// stopgap). Half of them (all three stars, several extended Cyrillic/Greek
// code points) are absent from the vendored mono UI font and render blank, so
// the glyphs use DejaVu Sans Bold — a broad-coverage static asset that carries
// every symbol id in KEYPAD_SYMBOL_GLYPHS. Swapping in the authoritative
// manual-p.7 asset later only touches that lookup (and this font path).
const GLYPH_FONT = '/fonts/dejavu-sans-bold.ttf';

/** Grid position → local [x, y]. 0=TL, 1=TR, 2=BL, 3=BR. */
const GRID_XY: ReadonlyArray<readonly [number, number]> = [
  [-CELL / 2, CELL / 2],
  [CELL / 2, CELL / 2],
  [-CELL / 2, -CELL / 2],
  [CELL / 2, -CELL / 2],
];

function selectKeypadsData(moduleIndex: number) {
  return (s: ReturnType<typeof useGameStore.getState>): KeypadsState | null => {
    const mod = s.bomb?.modules[moduleIndex];
    // moduleId check guards a desynced payload from rendering garbage.
    return mod?.moduleId === KEYPADS_MODULE_ID ? (mod.data as KeypadsState) : null;
  };
}

export function KeypadsDefuserView({ moduleIndex }: ModuleDefuserViewProps) {
  // Snapshot-rate reactive selector — memoized on moduleIndex so the reference
  // is stable across renders; zustand only re-subscribes when moduleIndex
  // changes. Nothing per-frame here.
  const selector = useMemo(() => selectKeypadsData(moduleIndex), [moduleIndex]);
  const data = useGameStore(selector);

  if (!data) return null;

  return (
    <group>
      {data.keys.map((symbol: SymbolId, keyIndex: number) => {
        const [x, y] = GRID_XY[keyIndex] ?? [0, 0];
        const lit = data.pressed.includes(keyIndex);
        const glyph = KEYPAD_SYMBOL_GLYPHS[symbol]?.glyph ?? '?';
        // Each button press is a single click that dispatches THIS grid index;
        // the reducer judges the order (the view only dispatches).
        const press = moduleClickHandlers(() =>
          dispatchModuleAction(moduleIndex, { type: 'PRESS', keyIndex }),
        );
        return (
          <group key={keyIndex} position={[x, y, 0.02]} {...press}>
            <mesh>
              <boxGeometry args={[KEY_SIZE, KEY_SIZE, 0.03]} />
              <meshStandardMaterial color={lit ? CAP_LIT : CAP} />
            </mesh>
            <Text
              font={GLYPH_FONT}
              fontSize={0.11}
              color={lit ? CAP_INK_LIT : GLYPH_INK}
              anchorX="center"
              anchorY="middle"
              position={[0, 0, 0.02]}
            >
              {glyph}
            </Text>
          </group>
        );
      })}
    </group>
  );
}
