import { useEffect, useRef, useState, type ReactNode } from 'react';
import { computeStageSize, type StageSize } from './stage.js';
import { useIdleCursor } from './useIdleCursor.js';

/**
 * Bomb-world stage: centres a fixed-aspect (16:9) box on a PURE BLACK
 * letterbox background (Story 2.1 decision: black bars, not --color-surface —
 * the stage is a different surface from the operator shell).
 *
 * The canvas box is RESIZED, never remounted, on viewport changes — a WebGL
 * context rebuild per resize would be both a state-loss and a performance bug.
 */
export default function BombStage({ children, fill = false }: { children: ReactNode; fill?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<StageSize>({ width: 0, height: 0 });

  useIdleCursor(containerRef);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize(computeStageSize(rect.width, rect.height));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      // AC1: right-click is reserved — never the browser context menu over the scene.
      onContextMenu={(e) => e.preventDefault()}
      // Story 9.4: `fill` sizes the stage to its container (a lounge split-pane cell)
      // instead of the whole viewport — the Defuser's full-screen stage is default.
      className={`flex items-center justify-center overflow-hidden bg-black ${
        fill ? 'h-full w-full' : 'h-screen w-screen'
      }`}
    >
      <div style={{ width: size.width, height: size.height }}>
        {size.width > 0 && size.height > 0 ? children : null}
      </div>
    </div>
  );
}
