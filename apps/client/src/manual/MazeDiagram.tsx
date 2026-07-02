import type { ManualMaze } from '@bomb-squad/shared';

/**
 * Renders a single structured ManualMaze (Story 6.4) as an inline SVG — the
 * grid of dots, the interior wall segments (from the canonical edge-key set),
 * and the two circular markers. This is the manual's STATIC layout: it shows
 * walls + markers but NO start/target (those are per-instance and live on the
 * bomb, not the manual).
 *
 * Rendering-only, no game logic. Reused by BOTH the shared PageRenderer (the
 * Expert manual viewer / /dev/manual) and the per-module MazesManualPages so the
 * two cannot diverge. On-cream mockup inks (matches the paper manual palette).
 */

const CELL = 26; // px per cell
const PAD = 12; // px margin around the grid
const WALL_INK = '#2A2118'; // manual body ink
const DOT_INK = '#B8A882'; // faint cell dots
const MARKER_INK = '#2A2118'; // circular marker ring (ink)

/** Parse an edge key "x1,y1|x2,y2" into its two integer cell coordinates. */
function parseEdge(key: string): [number, number, number, number] {
  const [a, b] = key.split('|');
  const [ax, ay] = a.split(',').map(Number);
  const [bx, by] = b.split(',').map(Number);
  return [ax, ay, bx, by];
}

export function MazeDiagram({ maze }: { maze: ManualMaze }) {
  const { size, walls, markers } = maze;
  const span = size * CELL;
  const dim = span + PAD * 2;
  const center = (c: number) => PAD + c * CELL + CELL / 2;

  return (
    <svg
      width={dim}
      height={dim}
      viewBox={`0 0 ${dim} ${dim}`}
      role="img"
      aria-label={`Maze with markers at ${markers.map((m) => `(${m.x},${m.y})`).join(' and ')}`}
    >
      {/* Outer boundary. */}
      <rect
        x={PAD}
        y={PAD}
        width={span}
        height={span}
        fill="none"
        stroke={WALL_INK}
        strokeWidth={2}
      />

      {/* Cell dots. */}
      {Array.from({ length: size }, (_, x) =>
        Array.from({ length: size }, (_, y) => (
          <circle key={`d${x}-${y}`} cx={center(x)} cy={center(y)} r={1.6} fill={DOT_INK} />
        )),
      )}

      {/* Interior walls (invisible on the bomb — the whole point of the manual). */}
      {walls.map((key) => {
        const [ax, ay, bx, by] = parseEdge(key);
        if (ax === bx) {
          // vertical neighbours → horizontal wall on the shared edge
          const y = PAD + Math.max(ay, by) * CELL;
          return (
            <line
              key={key}
              x1={PAD + ax * CELL}
              y1={y}
              x2={PAD + (ax + 1) * CELL}
              y2={y}
              stroke={WALL_INK}
              strokeWidth={2}
              strokeLinecap="square"
            />
          );
        }
        // horizontal neighbours → vertical wall on the shared edge
        const x = PAD + Math.max(ax, bx) * CELL;
        return (
          <line
            key={key}
            x1={x}
            y1={PAD + ay * CELL}
            x2={x}
            y2={PAD + (ay + 1) * CELL}
            stroke={WALL_INK}
            strokeWidth={2}
            strokeLinecap="square"
          />
        );
      })}

      {/* Circular markers — the maze identity. */}
      {markers.map((m, i) => (
        <circle
          key={`m${i}`}
          cx={center(m.x)}
          cy={center(m.y)}
          r={CELL * 0.32}
          fill="none"
          stroke={MARKER_INK}
          strokeWidth={1.6}
        />
      ))}
    </svg>
  );
}
