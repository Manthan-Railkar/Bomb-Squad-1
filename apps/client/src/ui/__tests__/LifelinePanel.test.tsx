import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LIFELINE_PROMPTS } from '@bomb-squad/shared';
import { makeRoundConfig, makeSession } from '../../test/fixtures.js';
import { useGameStore } from '../../store/gameStore.js';

// Mock the net helper so we assert the emit intent without a real socket.
const sendLifeline = vi.fn();
vi.mock('../../net/sendLifeline.js', () => ({ sendLifeline: (id: string) => sendLifeline(id) }));

import LifelinePanel from '../LifelinePanel.js';

function seed(opts: { spectatorLifelines: boolean; tokens: number }) {
  const session = makeSession({
    config: makeRoundConfig({
      modifiers: { asymmetricExpertRoles: false, spectatorLifelines: opts.spectatorLifelines },
    }),
  });
  useGameStore.setState({ session, lifelineTokens: opts.tokens });
}

beforeEach(() => {
  sendLifeline.mockClear();
  useGameStore.setState({ session: null, lifelineTokens: 0 });
});

describe('LifelinePanel (Story 9.3)', () => {
  it('is HIDDEN when the modifier is off (even with tokens)', () => {
    seed({ spectatorLifelines: false, tokens: 2 });
    render(<LifelinePanel />);
    expect(screen.queryByTestId('lifeline-panel')).not.toBeInTheDocument();
  });

  it('is HIDDEN at 0 tokens (even with the modifier on) — AC-1', () => {
    seed({ spectatorLifelines: true, tokens: 0 });
    render(<LifelinePanel />);
    expect(screen.queryByTestId('lifeline-panel')).not.toBeInTheDocument();
  });

  it('shows the send CTA when the modifier is on AND the viewer holds a token', () => {
    seed({ spectatorLifelines: true, tokens: 1 });
    render(<LifelinePanel />);
    expect(screen.getByTestId('lifeline-send-cta')).toBeInTheDocument();
  });

  it('opening the picker shows exactly the fixed prompt list — no free-text input (AC-1)', () => {
    seed({ spectatorLifelines: true, tokens: 2 });
    render(<LifelinePanel />);
    fireEvent.click(screen.getByTestId('lifeline-send-cta'));
    for (const p of LIFELINE_PROMPTS) {
      expect(screen.getByTestId(`lifeline-prompt-${p.id}`)).toHaveTextContent(p.text);
    }
    // The picker renders the whole fixed list and nothing user-typed.
    expect(screen.queryAllByTestId(/^lifeline-prompt-/)).toHaveLength(LIFELINE_PROMPTS.length);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('choosing a prompt shows the confirm line with N-1 tokens after', () => {
    seed({ spectatorLifelines: true, tokens: 3 });
    render(<LifelinePanel />);
    fireEvent.click(screen.getByTestId('lifeline-send-cta'));
    fireEvent.click(screen.getByTestId('lifeline-prompt-check-serial'));
    expect(screen.getByTestId('lifeline-confirm-line')).toHaveTextContent(
      'Send this tip? You have 2 tokens after.',
    );
  });

  it('confirming emits the typed LIFELINE_SEND { promptId } and returns to closed', () => {
    seed({ spectatorLifelines: true, tokens: 1 });
    render(<LifelinePanel />);
    fireEvent.click(screen.getByTestId('lifeline-send-cta'));
    fireEvent.click(screen.getByTestId('lifeline-prompt-on-track'));
    fireEvent.click(screen.getByTestId('lifeline-confirm'));
    expect(sendLifeline).toHaveBeenCalledTimes(1);
    expect(sendLifeline).toHaveBeenCalledWith('on-track');
    // Back to the resting CTA (no optimistic decrement — the panel stays until the
    // server echo drops tokens; here tokens is still 1 so the CTA is shown again).
    expect(screen.getByTestId('lifeline-send-cta')).toBeInTheDocument();
  });

  it('self-hides once the server echo drops the balance to 0 after a send', () => {
    seed({ spectatorLifelines: true, tokens: 1 });
    const { rerender } = render(<LifelinePanel />);
    fireEvent.click(screen.getByTestId('lifeline-send-cta'));
    fireEvent.click(screen.getByTestId('lifeline-prompt-wrong-approach'));
    fireEvent.click(screen.getByTestId('lifeline-confirm'));
    // Server LIFELINE_TOKENS echo arrives → balance 0.
    useGameStore.setState({ lifelineTokens: 0 });
    rerender(<LifelinePanel />);
    expect(screen.queryByTestId('lifeline-panel')).not.toBeInTheDocument();
  });
});
