import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { makePlayer, makeRoundConfig, makeSession, makeTeam } from '../../test/fixtures.js';
import { useGameStore } from '../../store/gameStore.js';
import type { ManualChapter } from '../../manual/chapters.js';

// R3F children → DOM sentinels. ManualViewer echoes its followChapterId so each
// pane's mirrored chapter is assertable without rendering the real viewer (its
// follow-mode + placeholder are covered in ManualViewer.follow.test.tsx).
vi.mock('../../scenes/BombStage.js', () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="bomb-stage">{children}</div>,
}));
vi.mock('../../scenes/BombScene.js', () => ({
  default: ({ readOnly }: { readOnly?: boolean }) => (
    <div data-testid="bomb-scene" data-readonly={String(readOnly ?? false)} />
  ),
}));
vi.mock('../../manual/ManualViewer.js', () => ({
  default: ({ followChapterId }: { followChapterId?: string | null }) => (
    <div data-testid="manual-follow" data-chapter={followChapterId ?? 'none'} />
  ),
}));
vi.mock('../LifelinePanel.js', () => ({ default: () => <div data-testid="lifeline-panel" /> }));

import SpectatorLounge from '../SpectatorLounge.js';

const CHAPTERS: ManualChapter[] = [
  ['wires', 'Wires'],
  ['the-button', 'Button'],
  ['keypads', 'Keypads'],
  ['memory', 'Memory'],
].map(([chapterId, chapterTitle]) => ({
  chapterId,
  chapterTitle,
  pages: [{ chapterId, chapterTitle, sections: [{ content: 'x' }] }],
}));

/** Team A active with two Experts (Ana, Devon) + a Defuser; a resting Team-B
 *  expert; a genuine spectator; the facilitator. */
function seed(opts: {
  viewer: string;
  spectatorLifelines?: boolean;
  positions?: Record<string, string>;
}) {
  const session = makeSession({
    status: 'active',
    activeTeamId: 'A',
    config: makeRoundConfig({
      modifiers: { asymmetricExpertRoles: false, spectatorLifelines: opts.spectatorLifelines ?? false },
    }),
    players: {
      ad: makePlayer({ playerId: 'ad', displayName: 'Ada', role: 'defuser', teamId: 'A' }),
      // Two active-team Experts — the multiview panes.
      ana: makePlayer({ playerId: 'ana', displayName: 'Ana', role: 'expert', teamId: 'A' }),
      dev: makePlayer({ playerId: 'dev', displayName: 'Devon', role: 'expert', teamId: 'A' }),
      // A RESTING Team-B expert — must NOT become a pane.
      be: makePlayer({ playerId: 'be', displayName: 'Ben', role: 'expert', teamId: 'B' }),
      sp: makePlayer({ playerId: 'sp', displayName: 'Sam', role: 'spectator' }),
      fac: makePlayer({ playerId: 'fac', displayName: 'Fae', role: 'facilitator' }),
    },
    teams: { A: makeTeam('A', ['ad', 'ana', 'dev']), B: makeTeam('B', ['be']) },
  });
  useGameStore.setState({
    session,
    myPlayerId: opts.viewer,
    lifelineTokens: 2,
    expertManualPositions: opts.positions ?? {},
  });
}

beforeEach(() => {
  useGameStore.setState({ session: null, myPlayerId: null, lifelineTokens: 0, expertManualPositions: {} });
});

describe('SpectatorLounge (Story 9.4)', () => {
  it('renders the split-pane: a read-only bomb + the Expert multiview', () => {
    seed({ viewer: 'sp' });
    render(<SpectatorLounge chapters={CHAPTERS} />);
    expect(screen.getByTestId('bomb-stage')).toBeInTheDocument();
    expect(screen.getByTestId('bomb-scene')).toHaveAttribute('data-readonly', 'true');
    expect(screen.getByTestId('lounge-manual-multiview')).toBeInTheDocument();
    expect(screen.getByTestId('lounge-voice-indicator')).toBeInTheDocument();
  });

  it('renders one follow pane per active-team Expert, each mirroring its own position', () => {
    seed({ viewer: 'sp', positions: { ana: 'memory', dev: 'wires' } });
    render(<SpectatorLounge chapters={CHAPTERS} />);
    // Two Experts → two panes (keyed by playerId). The resting Team-B expert is not one.
    expect(screen.getByTestId('lounge-expert-pane-ana')).toBeInTheDocument();
    expect(screen.getByTestId('lounge-expert-pane-dev')).toBeInTheDocument();
    expect(screen.queryByTestId('lounge-expert-pane-be')).not.toBeInTheDocument();
    // Each pane follows its OWN Expert's chapter.
    const panes = screen.getAllByTestId('manual-follow');
    const chapters = panes.map((p) => p.getAttribute('data-chapter')).sort();
    expect(chapters).toEqual(['memory', 'wires']);
  });

  it('labels each pane with the Expert name + current chapter', () => {
    seed({ viewer: 'sp', positions: { ana: 'memory' } });
    render(<SpectatorLounge chapters={CHAPTERS} />);
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText(/Ch\. 4 · Memory/)).toBeInTheDocument(); // memory is chapter 4
  });

  it('a single Expert → a single pane', () => {
    const session = makeSession({
      status: 'active',
      activeTeamId: 'A',
      players: {
        ad: makePlayer({ playerId: 'ad', displayName: 'Ada', role: 'defuser', teamId: 'A' }),
        ana: makePlayer({ playerId: 'ana', displayName: 'Ana', role: 'expert', teamId: 'A' }),
        sp: makePlayer({ playerId: 'sp', displayName: 'Sam', role: 'spectator' }),
      },
      teams: { A: makeTeam('A', ['ad', 'ana']) },
    });
    useGameStore.setState({ session, myPlayerId: 'sp', expertManualPositions: { ana: 'wires' } });
    render(<SpectatorLounge chapters={CHAPTERS} />);
    expect(screen.getAllByTestId('manual-follow')).toHaveLength(1);
  });

  it('an Expert with no position passes a null follow id (→ the viewer placeholder)', () => {
    seed({ viewer: 'sp', positions: { ana: 'memory' } }); // dev has no entry
    render(<SpectatorLounge chapters={CHAPTERS} />);
    const devPane = screen.getByTestId('lounge-expert-pane-dev');
    expect(devPane.querySelector('[data-testid="manual-follow"]')?.getAttribute('data-chapter')).toBe('none');
  });

  it('shows the token counter + Send-Tip to a non-facilitator earner when the modifier is ON', () => {
    seed({ viewer: 'sp', spectatorLifelines: true });
    render(<SpectatorLounge chapters={CHAPTERS} />);
    expect(screen.getByTestId('lifeline-token-counter')).toHaveTextContent('Lifeline tokens: 2');
    expect(screen.getByTestId('lifeline-panel')).toBeInTheDocument();
  });

  it('HIDES the counter + Send-Tip for the FACILITATOR even with the modifier ON (DD4 non-earner)', () => {
    seed({ viewer: 'fac', spectatorLifelines: true });
    render(<SpectatorLounge chapters={CHAPTERS} />);
    expect(screen.queryByTestId('lifeline-token-counter')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lifeline-panel')).not.toBeInTheDocument();
    // …but the facilitator still watches the bomb + multiview.
    expect(screen.getByTestId('bomb-scene')).toBeInTheDocument();
    expect(screen.getByTestId('lounge-manual-multiview')).toBeInTheDocument();
  });

  it('HIDES the counter when the modifier is OFF (even for an earner)', () => {
    seed({ viewer: 'sp', spectatorLifelines: false });
    render(<SpectatorLounge chapters={CHAPTERS} />);
    expect(screen.queryByTestId('lifeline-token-counter')).not.toBeInTheDocument();
  });
});
