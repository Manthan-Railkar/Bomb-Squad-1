import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import { useGameStore } from '../../store/gameStore.js';
import type { ModuleDefuserViewProps } from '../registry.js';
import { dispatchModuleAction } from '../dispatch.js';
import { moduleClickHandlers } from '../interaction.js';
import { MAZES_MODULE_ID, MAZE_LAYOUTS, type Direction, type MazesState } from './types.js';

/**
 * Mazes DefuserView — R3F rendering ONLY, zero game logic. Draws the 6×6 grid
 * of cells, the two circular markers (the module's public identity, read from
 * MAZE_LAYOUTS[mazeId]), the white light at data.position, and the red triangle
 * at data.target. It deliberately does NOT draw the walls (AC3 — invisible on
 * the bomb; the Expert reads them from the manual). Four arrow buttons dispatch
 * a MOVE; the reducer judges legality and strikes on a wall/off-grid move.
 *
 * Fully data-driven; memoized scoped zustand selector on moduleIndex (5.3
 * pattern). No timer → no useFrame. Body budget: the grid + arrows stay within
 * the bay faceplate (~0.7×0.5, shallow z).
 *
 * Coordinate mapping: cell (x=col, y=row) has origin top-left; R3F +y is up, so
 * world y flips the row (row 0 renders at the top).
 */

const PANEL = '#1B1922'; // dark maze panel (mockup near-black)
const CELL_INK = '#4A4653'; // grid cell squares (dim, non-load-bearing)
const MARKER_INK = '#C9B98A'; // circular identity markings (brass ring)
const LIGHT_INK = '#F4F1E8'; // white light (current position)
const TRIANGLE_INK = '#D8402F'; // red triangle (target)
const ARROW_CAP = '#2A2732';
const ARROW_INK = '#E5DDC9';

const CELL = 0.062; // centre-to-centre cell spacing
const HALF = (6 - 1) / 2; // grid centre offset in cells (2.5)
const CELL_SQUARE = 0.04; // rendered cell footprint
const ARROW_R = 0.26; // arrow ring radius from grid centre

/** Cell (col,row) → local [x, y]. Row 0 is the TOP (world +y). */
function cellXY(x: number, y: number): [number, number] {
  return [(x - HALF) * CELL, (HALF - y) * CELL];
}

const ARROWS: ReadonlyArray<readonly [Direction, number, number, string]> = [
  ['up', 0, ARROW_R, '▲'],
  ['down', 0, -ARROW_R, '▼'],
  ['left', -ARROW_R, 0, '◀'],
  ['right', ARROW_R, 0, '▶'],
];

function isCell(c: unknown): c is { x: number; y: number } {
  return typeof c === 'object' && c !== null
    && typeof (c as { x: unknown }).x === 'number'
    && typeof (c as { y: unknown }).y === 'number';
}

function selectMazesData(moduleIndex: number) {
  return (s: ReturnType<typeof useGameStore.getState>): MazesState | null => {
    const mod = s.bomb?.modules[moduleIndex];
    // Guard a desynced payload: right moduleId but a malformed data shape must
    // render nothing, not throw on data.position/data.target (which would blank
    // the whole R3F bay). Validate the fields the view dereferences.
    if (mod?.moduleId !== MAZES_MODULE_ID) return null;
    const data = mod.data as Partial<MazesState> | undefined;
    if (!data || typeof data.mazeId !== 'number' || !isCell(data.position) || !isCell(data.target)) {
      return null;
    }
    return data as MazesState;
  };
}

export function MazesDefuserView({ moduleIndex }: ModuleDefuserViewProps) {
  // Snapshot-rate reactive selector — memoized on moduleIndex so the reference
  // is stable across renders; zustand only re-subscribes when moduleIndex
  // changes. Nothing per-frame here.
  const selector = useMemo(() => selectMazesData(moduleIndex), [moduleIndex]);
  const data = useGameStore(selector);

  if (!data) return null;
  const layout = MAZE_LAYOUTS[data.mazeId];
  if (!layout) return null; // desynced/invalid mazeId → render nothing

  const cells: [number, number][] = [];
  for (let x = 0; x < 6; x++) for (let y = 0; y < 6; y++) cells.push([x, y]);

  const move = (direction: Direction) =>
    moduleClickHandlers(() => dispatchModuleAction(moduleIndex, { type: 'MOVE', direction }));

  return (
    <group>
      {/* Dark maze panel behind the grid. */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[6 * CELL + 0.03, 6 * CELL + 0.03, 0.02]} />
        <meshStandardMaterial color={PANEL} />
      </mesh>

      {/* 6×6 grid cells (dim squares — NO walls drawn). */}
      {cells.map(([x, y]) => {
        const [lx, ly] = cellXY(x, y);
        return (
          <mesh key={`c${x}-${y}`} position={[lx, ly, 0.012]}>
            <boxGeometry args={[CELL_SQUARE, CELL_SQUARE, 0.005]} />
            <meshStandardMaterial color={CELL_INK} />
          </mesh>
        );
      })}

      {/* Circular markers — the module's public identity. */}
      {layout.markers.map((m, i) => {
        const [lx, ly] = cellXY(m.x, m.y);
        return (
          <mesh key={`m${i}`} position={[lx, ly, 0.02]} rotation={[0, 0, 0]}>
            <ringGeometry args={[CELL_SQUARE * 0.55, CELL_SQUARE * 0.8, 24]} />
            <meshBasicMaterial color={MARKER_INK} />
          </mesh>
        );
      })}

      {/* Red triangle — the target. */}
      <Text
        font="/fonts/jetbrains-mono-700.ttf"
        fontSize={0.05}
        color={TRIANGLE_INK}
        anchorX="center"
        anchorY="middle"
        position={[...cellXY(data.target.x, data.target.y), 0.022] as [number, number, number]}
      >
        ▲
      </Text>

      {/* White light — the current position. */}
      <mesh
        position={[...cellXY(data.position.x, data.position.y), 0.024] as [number, number, number]}
      >
        <circleGeometry args={[CELL_SQUARE * 0.42, 20]} />
        <meshBasicMaterial color={LIGHT_INK} />
      </mesh>

      {/* Four arrow buttons — single click each → MOVE. */}
      {ARROWS.map(([direction, ax, ay, glyph]) => (
        <group key={direction} position={[ax, ay, 0.02]} {...move(direction)}>
          <mesh>
            <boxGeometry args={[0.09, 0.09, 0.03]} />
            <meshStandardMaterial color={ARROW_CAP} />
          </mesh>
          <Text
            font="/fonts/jetbrains-mono-700.ttf"
            fontSize={0.055}
            color={ARROW_INK}
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
