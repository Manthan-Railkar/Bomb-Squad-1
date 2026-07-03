import { useState } from 'react';
import { LIFELINE_PROMPTS } from '@bomb-squad/shared';
import { useGameStore } from '../store/gameStore.js';
import { sendLifeline } from '../net/sendLifeline.js';
import Button from './Button.js';
import {
  LIFELINE_SEND_CTA,
  LIFELINE_PICK_PROMPT,
  LIFELINE_PANEL_CANCEL,
  LIFELINE_SEND_CONFIRM,
  LIFELINE_CONFIRM_LINE,
} from './copy.js';

/**
 * Spectator lifeline send affordance (Story 9.3, AC-1/AC-3). A self-contained,
 * three-step panel:
 *   closed  → a "Send a lifeline" button
 *   list    → the FIXED shared prompt list (≤8 buttons, NO free-text input)
 *   confirm → the chosen tip + "Send this tip? You have N-1 tokens after." + confirm/cancel
 *
 * VISIBILITY (AC-1): rendered only when the modifier is ON *and* the viewer holds
 * ≥1 token. Both are read reactively, so after a successful send the server's
 * LIFELINE_TOKENS echo drives `lifelineTokens` to 0 and this panel self-hides —
 * there is NO client-side optimistic decrement (the server is the authority).
 *
 * The step is local presentation state (useState), never Zustand — the stores
 * hold server snapshots only. Kept self-contained so Story 9.4's Spectator Lounge
 * can re-host it in the split-pane HUD without change.
 */
export default function LifelinePanel() {
  const modifierOn = useGameStore((s) => s.session?.config.modifiers.spectatorLifelines ?? false);
  const tokens = useGameStore((s) => s.lifelineTokens);
  const [step, setStep] = useState<{ kind: 'closed' } | { kind: 'list' } | { kind: 'confirm'; promptId: string }>(
    { kind: 'closed' },
  );

  // AC-1: hidden unless the modifier is on AND the viewer has a token to spend.
  if (!modifierOn || tokens < 1) return null;

  if (step.kind === 'closed') {
    return (
      <div data-testid="lifeline-panel" className="mt-4 flex flex-col items-center">
        <Button
          data-testid="lifeline-send-cta"
          variant="secondary"
          onClick={() => setStep({ kind: 'list' })}
        >
          {LIFELINE_SEND_CTA}
        </Button>
      </div>
    );
  }

  if (step.kind === 'list') {
    return (
      <div data-testid="lifeline-panel" className="mt-4 flex flex-col items-center gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-ink-muted">
          {LIFELINE_PICK_PROMPT}
        </p>
        {LIFELINE_PROMPTS.map((p) => (
          <Button
            key={p.id}
            data-testid={`lifeline-prompt-${p.id}`}
            variant="secondary"
            className="w-full max-w-xs"
            onClick={() => setStep({ kind: 'confirm', promptId: p.id })}
          >
            {p.text}
          </Button>
        ))}
        <Button variant="secondary" onClick={() => setStep({ kind: 'closed' })}>
          {LIFELINE_PANEL_CANCEL}
        </Button>
      </div>
    );
  }

  // confirm step — resolve the chosen prompt's text from the shared list.
  const chosen = LIFELINE_PROMPTS.find((p) => p.id === step.promptId);
  // Defensive: a step referencing an id not in the list falls back to the picker
  // (fail-closed — never send an unknown id).
  if (chosen === undefined) {
    setStep({ kind: 'list' });
    return null;
  }
  return (
    <div data-testid="lifeline-panel" className="mt-4 flex flex-col items-center gap-2">
      <p className="max-w-xs text-center font-mono text-sm text-ink-primary">{chosen.text}</p>
      <p data-testid="lifeline-confirm-line" className="font-mono text-xs text-ink-muted">
        {LIFELINE_CONFIRM_LINE(tokens - 1)}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => setStep({ kind: 'list' })}>
          {LIFELINE_PANEL_CANCEL}
        </Button>
        <Button
          data-testid="lifeline-confirm"
          variant="primary"
          onClick={() => {
            sendLifeline(step.promptId);
            setStep({ kind: 'closed' });
          }}
        >
          {LIFELINE_SEND_CONFIRM}
        </Button>
      </div>
    </div>
  );
}
