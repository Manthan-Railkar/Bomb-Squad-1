import { render, screen, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManualChapter } from '../chapters.js';
import { useUiStore } from '../../store/uiStore.js';
import { useGameStore } from '../../store/gameStore.js';

// PageRenderer is rendering-only; stub it so this test focuses on follow-mode
// chapter selection + the absence of navigation chrome (Story 9.4).
vi.mock('../PageRenderer.js', () => ({ default: () => <div data-testid="page" /> }));
// publishPosition is the Expert write path a follow pane must NEVER invoke.
const publishSpy = vi.fn();
vi.mock('../publishPosition.js', () => ({ publishManualPosition: (id: string) => publishSpy(id) }));

import ManualViewer from '../ManualViewer.js';

const TITLES: Array<[string, string]> = [
  ['wires', 'Wires'],
  ['the-button', 'Button'],
  ['keypads', 'Keypads'],
  ['memory', 'Memory'],
];
const CHAPTERS: ManualChapter[] = TITLES.map(([chapterId, chapterTitle]) => ({
  chapterId,
  chapterTitle,
  pages: [{ chapterId, chapterTitle, sections: [{ content: 'body' }] }],
}));

beforeEach(() => {
  publishSpy.mockClear();
  useUiStore.setState({ manualChapterId: null });
});

describe('ManualViewer — follow-only mode (Story 9.4 Spectator Lounge)', () => {
  it('forces the displayed chapter to followChapterId, ignoring the local stored position', () => {
    // The spectator has a stale local position; follow-mode must ignore it.
    useUiStore.setState({ manualChapterId: 'wires' });
    render(<ManualViewer chapters={CHAPTERS} followChapterId="memory" />);
    expect(screen.getByRole('heading', { name: /Memory/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Wires/ })).not.toBeInTheDocument();
  });

  it('renders no navigable chrome: no sidebar chapter buttons, no search hint, no prev/next', () => {
    render(<ManualViewer chapters={CHAPTERS} followChapterId="keypads" />);
    // No sidebar chapter list buttons (the Expert viewer renders one per chapter).
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    // No "Search a chapter by name" affordance.
    expect(screen.queryByText(/Search a chapter by name/i)).not.toBeInTheDocument();
    // No prev/next arrows.
    expect(screen.queryByText(/prev/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/next/i)).not.toBeInTheDocument();
  });

  it('never writes a manual position (publishManualPosition is not called)', () => {
    render(<ManualViewer chapters={CHAPTERS} followChapterId="memory" />);
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it('re-points the pane when followChapterId changes to another Expert chapter', () => {
    const { rerender } = render(<ManualViewer chapters={CHAPTERS} followChapterId="wires" />);
    expect(screen.getByRole('heading', { name: /Wires/ })).toBeInTheDocument();
    rerender(<ManualViewer chapters={CHAPTERS} followChapterId="keypads" />);
    expect(screen.getByRole('heading', { name: /Keypads/ })).toBeInTheDocument();
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it('null / unknown followChapterId → a "hasn\'t opened the manual" placeholder (fail-open, no crash)', () => {
    const { rerender } = render(<ManualViewer chapters={CHAPTERS} followChapterId={null} />);
    expect(screen.getByTestId('lounge-manual-waiting')).toBeInTheDocument();
    rerender(<ManualViewer chapters={CHAPTERS} followChapterId="not-a-real-chapter" />);
    expect(screen.getByTestId('lounge-manual-waiting')).toBeInTheDocument();
  });

  it('regression (R3): with followChapterId ABSENT the full navigable Expert viewer renders', () => {
    render(<ManualViewer chapters={CHAPTERS} />);
    // The sidebar chapter buttons are back (one per chapter).
    for (const [, title] of TITLES) {
      expect(screen.getByRole('button', { name: new RegExp(title) })).toBeInTheDocument();
    }
  });
});

describe('ManualViewer — Expert republish (review 9.4: round-N+1 / reconnect blank panes)', () => {
  it('publishes on mount even when the stored id already matches the resolved chapter', () => {
    // Round N+1 remount: the server's per-Expert map was cleared at ROUND_START but
    // uiStore.manualChapterId persists — the old `!== storedChapterId` guard never
    // fired, so the spectator multiview stayed on the placeholder all round.
    useUiStore.setState({ manualChapterId: 'keypads' });
    render(<ManualViewer chapters={CHAPTERS} />);
    expect(publishSpy).toHaveBeenCalledWith('keypads');
  });

  it('republishes when the connection comes back (a disconnected emit was dropped)', () => {
    act(() => useGameStore.setState({ connection: 'disconnected' }));
    useUiStore.setState({ manualChapterId: 'memory' });
    render(<ManualViewer chapters={CHAPTERS} />);
    publishSpy.mockClear();
    act(() => useGameStore.setState({ connection: 'connected' }));
    expect(publishSpy).toHaveBeenCalledWith('memory');
  });
});
