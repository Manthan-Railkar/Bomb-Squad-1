import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { makePlayer, makeSession, makeTeam } from '../../test/fixtures.js';
import { useGameStore } from '../../store/gameStore.js';

// R3F-heavy children are rendering-only — stub them with DOM sentinels so a jsdom
// component test can assert the active-team-first routing (Story 8.11).
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
// Story 9.4: the lounge is the composed watching surface — stub it to a sentinel
// so this test asserts ROUTING (which surface a role gets), not lounge internals
// (those are covered in SpectatorLounge.test.tsx). It renders its own bomb + manual.
vi.mock('../SpectatorLounge.js', () => ({ default: () => <div data-testid="spectator-lounge" /> }));

import ActiveRound from '../ActiveRound.js';
import { ROUND_IN_PROGRESS } from '../copy.js';

/** An active round where Team A is active; viewer is one of the seeded players. */
function seed(viewer: string) {
  const session = makeSession({
    status: 'active',
    activeTeamId: 'A',
    players: {
      // Team A (active): a defuser + an expert.
      ad: makePlayer({ playerId: 'ad', displayName: 'Ada', role: 'defuser', teamId: 'A' }),
      ae: makePlayer({ playerId: 'ae', displayName: 'Aki', role: 'expert', teamId: 'A' }),
      // Team B (resting): a defuser-that-was + an expert.
      bd: makePlayer({ playerId: 'bd', displayName: 'Bex', role: 'defuser', teamId: 'B' }),
      be: makePlayer({ playerId: 'be', displayName: 'Ben', role: 'expert', teamId: 'B' }),
      // A genuine spectator + the facilitator (both watch via the lounge — DD4).
      sp: makePlayer({ playerId: 'sp', displayName: 'Sam', role: 'spectator' }),
      fa: makePlayer({ playerId: 'fa', displayName: 'Fae', role: 'facilitator' }),
      // TEAMLESS late joiners (joined between rounds; TEAM_ASSIGN is
      // lobby-locked so they can never be teamed) — review 9.1.
      te: makePlayer({ playerId: 'te', displayName: 'Tia', role: 'expert' }),
      td: makePlayer({ playerId: 'td', displayName: 'Tod', role: 'defuser' }),
    },
    teams: { A: makeTeam('A', ['ad', 'ae']), B: makeTeam('B', ['bd', 'be']) },
  });
  useGameStore.setState({ session, myPlayerId: viewer });
}

beforeEach(() => {
  useGameStore.setState({ session: null, myPlayerId: null });
});

describe('ActiveRound — Model B active-team-first routing (Story 8.11)', () => {
  it('renders nothing when there is no session', () => {
    const { container } = render(<ActiveRound />);
    expect(container).toBeEmptyDOMElement();
  });

  it('active-team defuser sees the bomb', () => {
    seed('ad');
    render(<ActiveRound />);
    expect(screen.getByTestId('bomb-stage')).toBeInTheDocument();
    expect(screen.queryByTestId('spectator-lounge')).not.toBeInTheDocument();
  });

  it('active-team expert sees the manual', () => {
    seed('ae');
    render(<ActiveRound />);
    expect(screen.getByTestId('manual')).toBeInTheDocument();
    expect(screen.queryByTestId('spectator-lounge')).not.toBeInTheDocument();
  });

  it('a RESTING-team defuser (their team is not active) is routed to the lounge, NOT the bomb (9.4)', () => {
    seed('bd');
    render(<ActiveRound />);
    expect(screen.getByTestId('spectator-lounge')).toBeInTheDocument();
    expect(screen.queryByTestId('bomb-stage')).not.toBeInTheDocument();
  });

  it('a RESTING-team expert is routed to the lounge, NOT their own manual (9.4)', () => {
    seed('be');
    render(<ActiveRound />);
    expect(screen.getByTestId('spectator-lounge')).toBeInTheDocument();
    expect(screen.queryByTestId('manual')).not.toBeInTheDocument();
  });

  it('a genuine spectator is routed to the lounge (9.4)', () => {
    seed('sp');
    render(<ActiveRound />);
    expect(screen.getByTestId('spectator-lounge')).toBeInTheDocument();
  });

  it('the facilitator is routed to the lounge too (DD4 — the facilitator watches)', () => {
    seed('fa');
    render(<ActiveRound />);
    expect(screen.getByTestId('spectator-lounge')).toBeInTheDocument();
  });

  it('a TEAMLESS expert (between-rounds joiner) never gets the manual — restriction bypass guard (review 9.1)', () => {
    seed('te');
    render(<ActiveRound />);
    expect(screen.queryByTestId('manual')).not.toBeInTheDocument();
    expect(screen.getByText(ROUND_IN_PROGRESS)).toBeInTheDocument();
  });

  it('a TEAMLESS defuser never gets the bomb', () => {
    seed('td');
    render(<ActiveRound />);
    expect(screen.queryByTestId('bomb-stage')).not.toBeInTheDocument();
    expect(screen.getByText(ROUND_IN_PROGRESS)).toBeInTheDocument();
  });
});

describe('ActiveRound — a TEAMED facilitator plays their role (Story 9.5)', () => {
  /** The facilitator ('fac', the flag holder) opted onto a team with a play role. */
  function seedTeamedFac(facRole: 'defuser' | 'expert', facTeam: 'A' | 'B') {
    const session = makeSession({
      status: 'active',
      activeTeamId: 'A',
      players: {
        fac: makePlayer({ playerId: 'fac', displayName: 'Faci', role: facRole, teamId: facTeam }),
        mate: makePlayer({
          playerId: 'mate',
          displayName: 'Mate',
          role: facRole === 'defuser' ? 'expert' : 'defuser',
          teamId: facTeam,
        }),
        // A minimal resting/active counterpart team so Model B has two teams.
        other: makePlayer({ playerId: 'other', displayName: 'Otto', role: 'defuser', teamId: facTeam === 'A' ? 'B' : 'A' }),
      },
      teams: {
        A: makeTeam('A', facTeam === 'A' ? ['fac', 'mate'] : ['other']),
        B: makeTeam('B', facTeam === 'B' ? ['fac', 'mate'] : ['other']),
      },
    });
    useGameStore.setState({ session, myPlayerId: 'fac' });
  }

  it('facilitator-Defuser on the ACTIVE team sees the bomb', () => {
    seedTeamedFac('defuser', 'A');
    render(<ActiveRound />);
    expect(screen.getByTestId('bomb-stage')).toBeInTheDocument();
  });

  it('facilitator-Expert on the ACTIVE team sees the manual', () => {
    seedTeamedFac('expert', 'A');
    render(<ActiveRound />);
    expect(screen.getByTestId('manual')).toBeInTheDocument();
  });

  it('facilitator on the RESTING team is routed to the lounge', () => {
    seedTeamedFac('defuser', 'B');
    render(<ActiveRound />);
    expect(screen.getByTestId('spectator-lounge')).toBeInTheDocument();
    expect(screen.queryByTestId('bomb-stage')).not.toBeInTheDocument();
  });
});
