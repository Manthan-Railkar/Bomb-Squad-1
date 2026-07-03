import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { makePlayer, makeSession, makeTeam } from '../../test/fixtures.js';
import { useGameStore } from '../../store/gameStore.js';

/**
 * Story 9.1 (review): chapter NUMBERING must be identical between restricted
 * and unrestricted rounds — both manual paths must receive the dev-demo-free
 * `realChapters` list, or every chapter number shifts by one whenever the
 * restriction toggles ("it's chapter 3!" would point at different modules).
 *
 * ManualViewer is mocked to expose the chapters it was handed, so the test
 * asserts the ROUTING (which list ActiveRound passes), not viewer rendering.
 */
vi.mock('../../scenes/BombStage.js', () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="bomb-stage">{children}</div>,
}));
vi.mock('../../scenes/BombScene.js', () => ({ default: () => <div data-testid="bomb-scene" /> }));
vi.mock('../../manual/ManualViewer.js', () => ({
  default: ({
    chapters,
    assignedChapterIds,
  }: {
    chapters: Array<{ chapterId: string }>;
    assignedChapterIds?: string[];
  }) => (
    <div
      data-testid="manual"
      data-chapters={chapters.map((c) => c.chapterId).join(',')}
      data-assigned={assignedChapterIds?.join(',') ?? 'none'}
    />
  ),
}));
// Two chapters: the sandbox-only dev-demo (must be dropped) and a real module.
vi.mock('../../manual/chapters.js', () => ({
  buildChapters: () => [{ chapterId: 'dev-demo' }, { chapterId: 'wires' }],
}));
vi.mock('../../modules/index.js', () => ({ SANDBOX_MODULES: [] }));
vi.mock('../ResolutionBanner.js', () => ({ default: () => null }));
vi.mock('../PauseOverlay.js', () => ({ default: () => null }));
vi.mock('../VoiceController.js', () => ({ default: () => null }));

import ActiveRound from '../ActiveRound.js';

function seedActiveExpert(assignedChapterIds: string[] | null) {
  const session = makeSession({
    status: 'active',
    activeTeamId: 'A',
    players: {
      ad: makePlayer({ playerId: 'ad', displayName: 'Ada', role: 'defuser', teamId: 'A' }),
      ae: makePlayer({ playerId: 'ae', displayName: 'Aki', role: 'expert', teamId: 'A' }),
    },
    teams: { A: makeTeam('A', ['ad', 'ae']) },
  });
  useGameStore.setState({ session, myPlayerId: 'ae', assignedChapterIds });
}

beforeEach(() => {
  useGameStore.setState({ session: null, myPlayerId: null, assignedChapterIds: null });
});

describe('ActiveRound — manual chapter list routing (Story 9.1 review)', () => {
  it('an UNRESTRICTED expert gets the dev-demo-free list (numbering matches restricted rounds)', () => {
    seedActiveExpert(null);
    render(<ActiveRound />);
    const manual = screen.getByTestId('manual');
    expect(manual.getAttribute('data-chapters')).toBe('wires');
    expect(manual.getAttribute('data-assigned')).toBe('none');
  });

  it('a RESTRICTED expert gets the same dev-demo-free list plus their assignment', () => {
    seedActiveExpert(['wires']);
    render(<ActiveRound />);
    const manual = screen.getByTestId('manual');
    expect(manual.getAttribute('data-chapters')).toBe('wires');
    expect(manual.getAttribute('data-assigned')).toBe('wires');
  });
});
