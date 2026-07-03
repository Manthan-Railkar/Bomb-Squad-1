import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { makePlayer, makeRoundConfig, makeSession, makeTeam } from '../../test/fixtures.js';
import { useGameStore } from '../../store/gameStore.js';

// Same R3F stubs as ActiveRound.test.tsx — rendering-only children.
vi.mock('../../scenes/BombStage.js', () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="bomb-stage">{children}</div>,
}));
vi.mock('../../scenes/BombScene.js', () => ({ default: () => <div data-testid="bomb-scene" /> }));
vi.mock('../../manual/ManualViewer.js', () => ({ default: () => <div data-testid="manual" /> }));
vi.mock('../../manual/chapters.js', () => ({ buildChapters: () => [] }));
vi.mock('../../modules/index.js', () => ({ SANDBOX_MODULES: [], MANUAL_MODULES: [] }));
vi.mock('../ResolutionBanner.js', () => ({ default: () => null }));
vi.mock('../PauseOverlay.js', () => ({ default: () => null }));
vi.mock('../VoiceController.js', () => ({ default: () => null }));

import ActiveRound from '../ActiveRound.js';

/**
 * Team A active. Watching players: a resting-team defuser (`bd`, team B) and a
 * genuine spectator (`sp`, no team). Modifier + token balance are per-test.
 */
function seed(opts: { viewer: string; spectatorLifelines: boolean; tokens: number }) {
  const session = makeSession({
    status: 'active',
    activeTeamId: 'A',
    config: makeRoundConfig({
      modifiers: { asymmetricExpertRoles: false, spectatorLifelines: opts.spectatorLifelines },
    }),
    players: {
      ad: makePlayer({ playerId: 'ad', displayName: 'Ada', role: 'defuser', teamId: 'A' }),
      bd: makePlayer({ playerId: 'bd', displayName: 'Bex', role: 'defuser', teamId: 'B' }),
      sp: makePlayer({ playerId: 'sp', displayName: 'Sam', role: 'spectator' }),
      // Teamless defuser (joined between rounds; TEAM_ASSIGN is lobby-locked) —
      // an earner on the ROUND_IN_PROGRESS fallback surface (review 9.2).
      td: makePlayer({ playerId: 'td', displayName: 'Tia', role: 'defuser' }),
      fac: makePlayer({ playerId: 'fac', displayName: 'Fin', role: 'facilitator' }),
    },
    teams: { A: makeTeam('A', ['ad']), B: makeTeam('B', ['bd']) },
  });
  useGameStore.setState({ session, myPlayerId: opts.viewer, lifelineTokens: opts.tokens });
}

beforeEach(() => {
  useGameStore.setState({ session: null, myPlayerId: null, lifelineTokens: 0 });
});

describe('ActiveRound — lifeline token counter (Story 9.2)', () => {
  it('shows the counter to a genuine spectator when the modifier is ON', () => {
    seed({ viewer: 'sp', spectatorLifelines: true, tokens: 2 });
    render(<ActiveRound />);
    expect(screen.getByTestId('lifeline-token-counter')).toHaveTextContent('Lifeline tokens: 2');
  });

  it('shows the counter to a RESTING-team player when the modifier is ON', () => {
    seed({ viewer: 'bd', spectatorLifelines: true, tokens: 1 });
    render(<ActiveRound />);
    expect(screen.getByTestId('lifeline-token-counter')).toHaveTextContent('Lifeline tokens: 1');
  });

  it('HIDES the counter for a spectator when the modifier is OFF (even with a stale non-zero balance)', () => {
    seed({ viewer: 'sp', spectatorLifelines: false, tokens: 3 });
    render(<ActiveRound />);
    expect(screen.queryByTestId('lifeline-token-counter')).not.toBeInTheDocument();
  });

  it('HIDES the counter for a resting player when the modifier is OFF', () => {
    seed({ viewer: 'bd', spectatorLifelines: false, tokens: 3 });
    render(<ActiveRound />);
    expect(screen.queryByTestId('lifeline-token-counter')).not.toBeInTheDocument();
  });

  it('does NOT show the counter to the active-team defuser (they play, they do not watch)', () => {
    seed({ viewer: 'ad', spectatorLifelines: true, tokens: 2 });
    render(<ActiveRound />);
    expect(screen.getByTestId('bomb-stage')).toBeInTheDocument();
    expect(screen.queryByTestId('lifeline-token-counter')).not.toBeInTheDocument();
  });

  it('shows the counter to a TEAMLESS defuser on the fallback surface (they earn — review 9.2)', () => {
    seed({ viewer: 'td', spectatorLifelines: true, tokens: 1 });
    render(<ActiveRound />);
    expect(screen.getByTestId('lifeline-token-counter')).toHaveTextContent('Lifeline tokens: 1');
  });

  it('does NOT show the counter to the facilitator (they never earn)', () => {
    seed({ viewer: 'fac', spectatorLifelines: true, tokens: 2 });
    render(<ActiveRound />);
    expect(screen.queryByTestId('lifeline-token-counter')).not.toBeInTheDocument();
  });
});
