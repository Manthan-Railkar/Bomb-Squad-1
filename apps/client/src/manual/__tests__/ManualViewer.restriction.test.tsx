import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManualChapter } from '../chapters.js';
import { useUiStore } from '../../store/uiStore.js';
import { useGameStore } from '../../store/gameStore.js';

// PageRenderer is rendering-only; stub it so this test can focus on the sidebar
// locking + navigation routing (Story 9.1).
vi.mock('../PageRenderer.js', () => ({ default: () => <div data-testid="page" /> }));

import ManualViewer from '../ManualViewer.js';

/** Five canonical-style chapters. Assigned subset in the restricted tests: Button + Memory. */
const TITLES: Array<[string, string]> = [
  ['wires', 'Wires'],
  ['the-button', 'Button'],
  ['keypads', 'Keypads'],
  ['memory', 'Memory'],
  ['mazes', 'Mazes'],
];
const CHAPTERS: ManualChapter[] = TITLES.map(([chapterId, chapterTitle]) => ({
  chapterId,
  chapterTitle,
  pages: [{ chapterId, chapterTitle, sections: [{ content: 'body' }] }],
}));
const ASSIGNED = ['the-button', 'memory'];

/** The <h1> shows the currently-open chapter's title. */
function currentTitle(): string {
  return screen.getByRole('heading', { level: 1 }).textContent ?? '';
}
function chapterButton(title: string): HTMLElement {
  // The sidebar button's accessible name is the canonical number + title with no
  // separator (e.g. "1Wires"), so match on the title substring alone.
  return screen.getByRole('button', { name: new RegExp(title) });
}

beforeEach(() => {
  useUiStore.setState({ manualChapterId: null });
  useGameStore.setState({ connection: 'disconnected', session: null });
});

describe('ManualViewer — Asymmetric Expert Roles restriction (Story 9.1)', () => {
  it('lists all 5 chapters with canonical numbers; the 3 unassigned render locked (disabled)', () => {
    render(<ManualViewer chapters={CHAPTERS} assignedChapterIds={ASSIGNED} />);

    // Every chapter is still listed (canonical numbering preserved).
    for (const [, title] of TITLES) expect(chapterButton(title)).toBeInTheDocument();
    // Canonical numbers 1..5 appear in the sidebar.
    for (const n of ['1', '2', '3', '4', '5']) expect(screen.getAllByText(n).length).toBeGreaterThan(0);

    // Unassigned = locked = disabled; assigned = enabled.
    expect(chapterButton('Wires')).toBeDisabled();
    expect(chapterButton('Keypads')).toBeDisabled();
    expect(chapterButton('Mazes')).toBeDisabled();
    expect(chapterButton('Button')).toBeEnabled();
    expect(chapterButton('Memory')).toBeEnabled();
  });

  it('first-open lands on the first ASSIGNED chapter, not the first overall', () => {
    render(<ManualViewer chapters={CHAPTERS} assignedChapterIds={ASSIGNED} />);
    expect(currentTitle()).toContain('Button'); // not "Wires" (locked)
  });

  it('clicking a locked chapter is a no-op (stays on the current assigned chapter)', async () => {
    const user = userEvent.setup();
    render(<ManualViewer chapters={CHAPTERS} assignedChapterIds={ASSIGNED} />);
    await user.click(chapterButton('Keypads')); // locked
    expect(currentTitle()).toContain('Button');
  });

  it('arrow navigation skips locked chapters to the nearest assigned neighbour', () => {
    render(<ManualViewer chapters={CHAPTERS} assignedChapterIds={ASSIGNED} />);
    expect(currentTitle()).toContain('Button');
    // Button → (skip Keypads) → Memory.
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(currentTitle()).toContain('Memory');
    // Memory is the last navigable — no wrap past it.
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(currentTitle()).toContain('Memory');
    // Back to Button.
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(currentTitle()).toContain('Button');
  });

  it('`/` search never returns a locked chapter', async () => {
    const user = userEvent.setup();
    render(<ManualViewer chapters={CHAPTERS} assignedChapterIds={ASSIGNED} />);
    fireEvent.keyDown(window, { key: '/' });
    const input = screen.getByRole('textbox', { name: /search chapters/i });
    await user.type(input, 'Keypads'); // a locked chapter
    expect(screen.getByText(/No chapter by that name/i)).toBeInTheDocument();
    // A search for an assigned chapter DOES surface it.
    await user.clear(input);
    await user.type(input, 'Memory');
    expect(chapterButton('Memory')).toBeInTheDocument();
  });

  it('a stored chapter id that is now locked falls back to the first assigned chapter', () => {
    useUiStore.setState({ manualChapterId: 'keypads' }); // locked this round
    render(<ManualViewer chapters={CHAPTERS} assignedChapterIds={ASSIGNED} />);
    expect(currentTitle()).toContain('Button');
  });
});

describe('ManualViewer — unrestricted (assignedChapterIds null) regression', () => {
  it('renders the full manual fully navigable (no locked chapters)', () => {
    render(<ManualViewer chapters={CHAPTERS} assignedChapterIds={null} />);
    for (const [, title] of TITLES) expect(chapterButton(title)).toBeEnabled();
    // First-open is the first overall chapter.
    expect(currentTitle()).toContain('Wires');
    // Arrows walk consecutive chapters (no skipping).
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(currentTitle()).toContain('Button');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(currentTitle()).toContain('Keypads');
  });

  it('with the prop omitted entirely, behaves as the full manual (current behaviour)', () => {
    render(<ManualViewer chapters={CHAPTERS} />);
    expect(chapterButton('Wires')).toBeEnabled();
    expect(currentTitle()).toContain('Wires');
  });
});
