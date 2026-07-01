import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVoiceStore } from '../../store/voiceStore.js';
import MuteControl from '../MuteControl.js';
import { MUTE_SELF, MUTED_STATUS } from '../copy.js';

/**
 * MuteControl render-gating tests (Story 3.4, generalised by 3.7). The control
 * shows ONLY when the local connection is publishing a mic
 * (`voiceStore.publishing` + `connected`) and reflects `voiceStore.muted` in its
 * own glyph/label. Post-3.7 that includes bidirectional-lounge members, not just
 * Bomb Room seats. A listen-only connection and any non-`connected` state render
 * nothing. Toggle logic lives in connectVoice (covered there) — here we pin only
 * the publish/connection gate + the muted visual.
 */
afterEach(() => {
  vi.restoreAllMocks();
  useVoiceStore.setState({ status: 'idle', muted: false, publishing: false });
});

describe('MuteControl', () => {
  it('shows for a connected publisher (has a live mic)', () => {
    useVoiceStore.setState({ status: 'connected', muted: false, publishing: true });
    render(<MuteControl />);
    expect(screen.getByRole('button', { name: MUTE_SELF })).toBeInTheDocument();
  });

  it('shows for a bidirectional-lounge publisher too (Story 3.7 — publishing is the gate)', () => {
    // No role/session seeded at all — the store's publishing flag is authoritative.
    useVoiceStore.setState({ status: 'connected', muted: false, publishing: true });
    render(<MuteControl />);
    expect(screen.getByRole('button', { name: MUTE_SELF })).toBeInTheDocument();
  });

  it('reflects the muted flag: aria-pressed + the muted glyph/label', () => {
    useVoiceStore.setState({ status: 'connected', muted: true, publishing: true });
    render(<MuteControl />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(MUTED_STATUS)).toBeInTheDocument();
  });

  it('un-muted state is not pressed', () => {
    useVoiceStore.setState({ status: 'connected', muted: false, publishing: true });
    render(<MuteControl />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders nothing for a listen-only connection (not publishing)', () => {
    useVoiceStore.setState({ status: 'connected', muted: false, publishing: false });
    const { container } = render(<MuteControl />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when voice is not connected', () => {
    useVoiceStore.setState({ status: 'connecting', muted: false, publishing: true });
    const { container } = render(<MuteControl />);
    expect(container).toBeEmptyDOMElement();
  });
});
