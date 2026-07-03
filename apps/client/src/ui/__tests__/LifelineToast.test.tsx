import { render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../store/gameStore.js';
import LifelineToastHost from '../LifelineToast.js';

beforeEach(() => {
  vi.useFakeTimers();
  useGameStore.setState({ lifelineToasts: [], lifelineToastSeq: 0 });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('LifelineToastHost (Story 9.3)', () => {
  it('renders nothing when the queue is empty', () => {
    render(<LifelineToastHost />);
    expect(screen.queryByTestId('lifeline-toast-host')).not.toBeInTheDocument();
  });

  it('renders a toast with the resolved shared text and NO dismiss control', () => {
    render(<LifelineToastHost />);
    act(() => {
      useGameStore.getState().pushLifelineToast({ promptId: 'check-serial', fromName: 'Sam' });
    });
    const toast = screen.getByTestId('lifeline-toast');
    // Text resolved from the shared prompt list, not the wire.
    expect(toast).toHaveTextContent('Spectator Sam sent a tip: Check the serial number');
    // AC-2: non-dismissable — no button/close control inside the toast.
    expect(toast.querySelector('button')).toBeNull();
  });

  it('auto-dismisses after exactly 8s (fake timers; not before)', () => {
    render(<LifelineToastHost />);
    act(() => {
      useGameStore.getState().pushLifelineToast({ promptId: 'on-track', fromName: 'Bex' });
    });
    expect(screen.getByTestId('lifeline-toast')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(7_999);
    });
    expect(screen.getByTestId('lifeline-toast')).toBeInTheDocument(); // still held at 7.999s
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByTestId('lifeline-toast')).not.toBeInTheDocument(); // gone at 8s
    expect(useGameStore.getState().lifelineToasts).toEqual([]);
  });

  it('an unknown promptId fails closed — renders nothing (host present but no item)', () => {
    render(<LifelineToastHost />);
    act(() => {
      // pushLifelineToast now refuses unknown ids at the store boundary (review
      // 9.3), so inject directly to exercise the RENDER-level defense in depth.
      useGameStore.setState({
        lifelineToasts: [{ id: 'lt-1', promptId: 'not-a-prompt', fromName: 'Sam' }],
      });
    });
    expect(screen.queryByTestId('lifeline-toast')).not.toBeInTheDocument();
  });

  it('stacks up to 3 concurrent toasts (queue cap)', () => {
    render(<LifelineToastHost />);
    act(() => {
      const { pushLifelineToast } = useGameStore.getState();
      for (const n of ['check-serial', 'on-track', 'wrong-approach', 'missed-condition']) {
        pushLifelineToast({ promptId: n, fromName: 'S' });
      }
    });
    // The store caps the queue at 3, so at most 3 render.
    expect(screen.getAllByTestId('lifeline-toast')).toHaveLength(3);
  });
});
