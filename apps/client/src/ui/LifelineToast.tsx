import { useEffect } from 'react';
import { lifelinePromptText } from '@bomb-squad/shared';
import { useGameStore, type LifelineToast as LifelineToastData } from '../store/gameStore.js';
import { LIFELINE_TOAST_TEXT } from './copy.js';

/** Lifeline toast hold before auto-dismiss (AC-2: 8 seconds, non-dismissable). */
const HOLD_MS = 8_000;

/**
 * One lifeline toast. Auto-dismisses after 8s via `window.setTimeout` (presentation
 * only — allowed on the client render side, exactly as ResolutionBanner holds its
 * banner). NO dismiss control and NO click handler: AC-2 "neither can dismiss early".
 * Text is resolved from the shared prompt list; an unknown id (should never reach
 * here — the server validated it) fails closed by rendering nothing.
 */
function LifelineToastItem({ toast }: { toast: LifelineToastData }) {
  const dismiss = useGameStore((s) => s.dismissLifelineToast);

  useEffect(() => {
    const handle = window.setTimeout(() => dismiss(toast.id), HOLD_MS);
    return () => window.clearTimeout(handle);
  }, [toast.id, dismiss]);

  const tip = lifelinePromptText(toast.promptId);
  if (tip === undefined) return null;

  return (
    <div
      data-testid="lifeline-toast"
      // No onClick / no close button — AC-2 non-dismissable.
      className="pointer-events-none rounded-md border-2 border-brass bg-graphite px-4 py-3 shadow-lg"
    >
      <p className="font-mono text-sm text-cream">{LIFELINE_TOAST_TEXT(toast.fromName, tip)}</p>
    </div>
  );
}

/**
 * Bomb-Room lifeline toast host (Story 9.3, AC-2). A top-right, vertically-stacked
 * overlay (max 3 — the store caps the queue) mounted as a SIBLING above the bomb
 * scene, never a child of the sized canvas box. `transform-gpu` + `will-change-transform`
 * promote it to its own compositor layer so it never repaints/relayouts the WebGL
 * scene (the ResolutionBanner technique). It is NOT full-screen (`inset-0`) — it
 * hugs the top-right corner and is `pointer-events-none` so it never blocks the bomb.
 */
export default function LifelineToastHost() {
  const toasts = useGameStore((s) => s.lifelineToasts);
  if (toasts.length === 0) return null;

  return (
    <div
      data-testid="lifeline-toast-host"
      className="pointer-events-none absolute right-4 top-4 z-40 flex transform-gpu flex-col gap-2 will-change-transform"
    >
      {toasts.map((t) => (
        <LifelineToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
