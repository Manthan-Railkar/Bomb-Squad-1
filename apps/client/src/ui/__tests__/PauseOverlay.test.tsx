import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockSocket, type MockSocket } from '../../test/mockSocket.js';
import { makePlayer, makeSession } from '../../test/fixtures.js';
import { useGameStore } from '../../store/gameStore.js';

vi.mock('../../net/socket.js', () => ({ getSocket: vi.fn(), createSocket: vi.fn() }));
import { getSocket } from '../../net/socket.js';
import PauseOverlay from '../PauseOverlay.js';
import {
  PAUSE_HELD,
  PAUSE_RESUME_CTA,
  PAUSE_WAITING_READY,
  PAUSE_READY_CTA,
  FACILITATOR_PAUSE_CTA,
  FACILITATOR_PAUSE_CONFIRM_CTA,
} from '../copy.js';

let mock: MockSocket;

const players = (overrides: { mayaReady?: boolean } = {}) => ({
  fac: makePlayer({ playerId: 'fac', displayName: 'Faci', role: 'facilitator' }),
  maya: makePlayer({ playerId: 'maya', displayName: 'Maya', role: 'defuser', teamId: 'A', isReady: overrides.mayaReady ?? false }),
});

beforeEach(() => {
  mock = createMockSocket();
  vi.mocked(getSocket).mockReturnValue(mock.socket);
  useGameStore.setState({ session: null, myPlayerId: null });
});

describe('PauseOverlay (Story 8.7)', () => {
  it('not paused: the facilitator gets a confirm-guarded break-glass Pause (arm→confirm emits once, Story 9.5 AC-3)', async () => {
    useGameStore.setState({
      session: makeSession({ status: 'active', players: players() }),
      myPlayerId: 'fac',
    });
    render(<PauseOverlay />);
    const btn = screen.getByTestId('facilitator-pause');
    // First click ARMS — no emit yet; label flips to the confirm CTA.
    await userEvent.click(btn);
    expect(mock.emit).not.toHaveBeenCalled();
    expect(screen.getByTestId('facilitator-pause')).toHaveTextContent(FACILITATOR_PAUSE_CONFIRM_CTA);
    // Second click CONFIRMS — emits exactly once and disarms back to the resting label.
    await userEvent.click(screen.getByTestId('facilitator-pause'));
    expect(mock.emit).toHaveBeenCalledWith('FACILITATOR_PAUSE');
    expect(mock.emit).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('facilitator-pause')).toHaveTextContent(FACILITATOR_PAUSE_CTA);
  });

  it('Story 9.5 (AC-3): a teamed facilitator (role=defuser, flag-keyed) still gets the break-glass Pause', () => {
    useGameStore.setState({
      session: makeSession({
        status: 'active',
        players: {
          // The host opted onto Team A as the Defuser — role is a play role now,
          // but facilitatorPlayerId ('fac') keys their authority.
          fac: makePlayer({ playerId: 'fac', displayName: 'Faci', role: 'defuser', teamId: 'A' }),
          maya: makePlayer({ playerId: 'maya', displayName: 'Maya', role: 'expert', teamId: 'A' }),
        },
        activeTeamId: 'A',
      }),
      myPlayerId: 'fac',
    });
    render(<PauseOverlay />);
    expect(screen.getByTestId('facilitator-pause')).toBeInTheDocument();
  });

  it('not paused: a non-facilitator sees nothing', () => {
    useGameStore.setState({
      session: makeSession({ status: 'active', players: players() }),
      myPlayerId: 'maya',
    });
    const { container } = render(<PauseOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  it('facilitator pause: shows "Holding the clock" + dim, and a free Resume', async () => {
    useGameStore.setState({
      session: makeSession({ status: 'active', pausedAt: 100, pauseKind: 'facilitator', players: players() }),
      myPlayerId: 'fac',
    });
    render(<PauseOverlay />);
    expect(screen.getByTestId('pause-strip')).toHaveTextContent(PAUSE_HELD);
    expect(screen.getByTestId('pause-dim')).toBeInTheDocument();
    const resume = screen.getByTestId('pause-resume');
    expect(resume).toBeEnabled();
    await userEvent.click(resume);
    expect(mock.emit).toHaveBeenCalledWith('FACILITATOR_RESUME');
  });

  it('disconnect pause: amber strip names who dropped; facilitator Resume is gated until all ready', () => {
    useGameStore.setState({
      session: makeSession({
        status: 'active',
        pausedAt: 100,
        pauseKind: 'disconnect',
        disconnectedPlayerIds: ['maya'],
        players: players({ mayaReady: false }),
      }),
      myPlayerId: 'fac',
    });
    render(<PauseOverlay />);
    const strip = screen.getByTestId('pause-strip');
    expect(strip).toHaveAttribute('data-kind', 'disconnect');
    expect(strip).toHaveTextContent('Maya');
    expect(screen.getByTestId('pause-resume')).toBeDisabled();
    expect(screen.getByText(PAUSE_WAITING_READY)).toBeInTheDocument();
  });

  it('Story 9.5: a TEAMED facilitator-participant gets BOTH a ready-up affordance and Resume during a disconnect pause (no deadlock)', async () => {
    useGameStore.setState({
      session: makeSession({
        status: 'active',
        pausedAt: 100,
        pauseKind: 'disconnect',
        activeTeamId: 'A',
        disconnectedPlayerIds: [],
        players: {
          // The facilitator opted onto active Team A as the Defuser; the pause
          // reset their readiness, so they must be able to ready-up themselves.
          fac: makePlayer({ playerId: 'fac', displayName: 'Faci', role: 'defuser', teamId: 'A', isReady: false }),
          maya: makePlayer({ playerId: 'maya', displayName: 'Maya', role: 'expert', teamId: 'A', isReady: true }),
        },
      }),
      myPlayerId: 'fac',
    });
    render(<PauseOverlay />);
    // Resume is present but disabled (the facilitator themselves is not ready).
    expect(screen.getByTestId('pause-resume')).toBeDisabled();
    // And a ready-up affordance exists so they can clear their own gate.
    const ready = screen.getByTestId('pause-ready');
    await userEvent.click(ready);
    expect(mock.emit).toHaveBeenCalledWith('PLAYER_READY', { isReady: true });
  });

  it('disconnect pause: a not-ready participant gets an "I\'m ready" affordance → PLAYER_READY', async () => {
    useGameStore.setState({
      session: makeSession({
        status: 'active',
        pausedAt: 100,
        pauseKind: 'disconnect',
        disconnectedPlayerIds: ['maya'],
        players: players({ mayaReady: false }),
      }),
      myPlayerId: 'maya',
    });
    render(<PauseOverlay />);
    const ready = screen.getByTestId('pause-ready');
    expect(ready).toHaveTextContent(PAUSE_READY_CTA);
    await userEvent.click(ready);
    expect(mock.emit).toHaveBeenCalledWith('PLAYER_READY', { isReady: true });
  });

  it('disconnect pause: once all participants are ready, the facilitator Resume enables', () => {
    useGameStore.setState({
      session: makeSession({
        status: 'active',
        pausedAt: 100,
        pauseKind: 'disconnect',
        disconnectedPlayerIds: [],
        players: players({ mayaReady: true }),
      }),
      myPlayerId: 'fac',
    });
    render(<PauseOverlay />);
    expect(screen.getByTestId('pause-resume')).toBeEnabled();
  });
});
