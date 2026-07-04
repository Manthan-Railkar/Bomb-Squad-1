import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useUiStore } from '../store/uiStore.js';
import { useGameStore } from '../store/gameStore.js';
import { isTextEntryTarget } from '../scenes/dom.js';
import { adjacentChapterId, type ManualChapter } from './chapters.js';
import { searchChapters } from './search.js';
import { publishManualPosition } from './publishPosition.js';
import PageRenderer from './PageRenderer.js';

/**
 * The Expert's defusal handbook (Story 5.2). Visual spec: mockup
 * `4. Expert Manual.html`; behavior spec: EXPERIENCE.md (arrows/PageUp-Down
 * navigate, `/` searches chapters by name, current chapter highlighted,
 * per-chapter scroll memory).
 *
 * Surface rules (DESIGN.md): two columns max (chapter list / paper), exactly
 * ONE scrolling region (the sheet content), never a modal — the paper is laid
 * on the desk. Serif on cream is the "you're reading rules" signal.
 *
 * Rendering + dispatch only: chapter grouping, search, and adjacency live in
 * pure modules; the observable position lives in uiStore via
 * publishManualPosition (AC5). Per-chapter scroll offsets are presentation
 * state and stay in refs (ui/README.md rule).
 */

/** Paper grain (mockup tokens.css .paper-grain): SVG fractal noise, multiplied. */
const PAPER_GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.045'/%3E%3C/svg%3E\")";

interface ManualViewerProps {
  chapters: ManualChapter[];
  /**
   * Asymmetric Expert Roles (Story 9.1). `undefined`/`null` = full access (every
   * chapter unlocked — the default). A non-null set restricts this Expert: only
   * its chapter ids are navigable; every other chapter is SHOWN-LOCKED (still
   * listed with its canonical number, but greyed, non-clickable, and out of
   * search / arrow navigation).
   */
  assignedChapterIds?: string[] | null;
  /**
   * Spectator Lounge follow-only mode (Story 9.4). When this prop is PRESENT (a
   * string chapterId, or `null`), the viewer mirrors THAT chapter read-only: the
   * sidebar, `/`-search, and prev/next arrows are gone, the local
   * `uiStore.manualChapterId` is ignored, and it NEVER writes a position
   * (`publishManualPosition` is never called — the spectator has no own position).
   * A `null`/unknown id renders a "waiting for the Expert…" placeholder (fail-open).
   * ABSENT (`undefined`) ⇒ the full, navigable Expert viewer — the default,
   * regression-critical path — is completely unchanged.
   */
  followChapterId?: string | null;
}

export default function ManualViewer({ chapters, assignedChapterIds, followChapterId }: ManualViewerProps) {
  // Follow mode is keyed on the prop being PROVIDED at all (SpectatorLounge always
  // passes a string or null; the Expert viewer omits it entirely → undefined).
  const isFollow = followChapterId !== undefined;
  const storedChapterId = useUiStore((s) => s.manualChapterId);
  const manualLocale = useUiStore((s) => s.manualLocale);
  const setManualLocale = useUiStore((s) => s.setManualLocale);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** chapterId → saved scrollTop. Presentation state — never Zustand. */
  const scrollMemoryRef = useRef(new Map<string, number>());
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Story 9.1: a chapter is locked iff a restriction is present and it is not in
  // the assigned set. `navigable` is the subset the Expert may actually reach —
  // adjacency, search, and the initial/current resolution all route through it,
  // so arrows/`/`-search skip locked chapters. The FULL `chapters` array stays
  // the sidebar/numbering source (canonical chapter numbers are preserved).
  const restricted = assignedChapterIds != null;
  const isLocked = (chapterId: string): boolean =>
    restricted && !assignedChapterIds!.includes(chapterId);
  const navigable = restricted
    ? chapters.filter((c) => assignedChapterIds!.includes(c.chapterId))
    : chapters;

  // Resolve the effective chapter. Follow mode (Story 9.4): the chapter is forced
  // to `followChapterId` from the FULL chapter list, ignoring the local stored
  // position entirely. Otherwise (Expert path): the stored position if still
  // navigable, else the first navigable chapter (also guards a now-locked stored id).
  const current = isFollow
    ? (followChapterId != null ? chapters.find((c) => c.chapterId === followChapterId) ?? null : null)
    : navigable.find((c) => c.chapterId === storedChapterId) ?? navigable[0] ?? null;

  // SINGLE publish point (review 9.4): assert the resolved position into the
  // observable store + wire whenever the effective chapter or the connection
  // changes — INCLUDING on mount with an unchanged stored id. A new round
  // remounts this viewer with the same `uiStore.manualChapterId` while the
  // server's per-Expert map was cleared at ROUND_START, and a disconnected
  // emit is silently dropped by publishManualPosition — so both the fresh
  // round and the reconnect need this re-assert, not a stored-id diff.
  // The emit is idempotent server-side (CAS map merge of the same entry).
  // Story 9.4: a follow-only pane must NEVER write a position (it has none of
  // its own — it mirrors the Expert), so this is skipped in follow mode.
  const connection = useGameStore((s) => s.connection);
  const currentChapterId = current?.chapterId ?? null;
  useEffect(() => {
    if (isFollow) return;
    if (currentChapterId !== null) {
      publishManualPosition(currentChapterId);
    }
  }, [isFollow, currentChapterId, connection]);

  const selectChapter = (chapterId: string) => {
    if (current !== null && scrollRef.current !== null) {
      scrollMemoryRef.current.set(current.chapterId, scrollRef.current.scrollTop);
    }
    // Store write only — the publish effect above is the single emit point (it
    // fires when the resolved chapter changes, so a click emits exactly once).
    useUiStore.getState().setManualChapterId(chapterId);
    setSearchOpen(false);
    setQuery('');
  };

  // Restore per-chapter scroll after the new chapter has rendered (AC2).
  useLayoutEffect(() => {
    if (current !== null && scrollRef.current !== null) {
      scrollRef.current.scrollTop = scrollMemoryRef.current.get(current.chapterId) ?? 0;
    }
  }, [current]);

  // Global keys: arrows / PageUp-PageDown flip chapters, `/` opens search.
  // Story 9.4: a follow-only pane is not navigable — no key bindings at all.
  useEffect(() => {
    if (isFollow) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event.target)) return;
      if (current === null) return;
      switch (event.key) {
        case 'ArrowLeft':
        case 'PageUp': {
          const prev = adjacentChapterId(navigable, current.chapterId, -1);
          if (prev !== null) selectChapter(prev);
          event.preventDefault();
          break;
        }
        case 'ArrowRight':
        case 'PageDown': {
          const next = adjacentChapterId(navigable, current.chapterId, 1);
          if (next !== null) selectChapter(next);
          event.preventDefault();
          break;
        }
        case '/':
          setSearchOpen(true);
          event.preventDefault();
          break;
        default:
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // Re-bind only when the manual, active chapter, or restriction changes — not
    // on every render (e.g. search keystrokes). `selectChapter` is recreated each
    // render but reads only refs + props, so the closure captured here stays
    // correct as long as `current`/`chapters`/`assignedChapterIds` are in the dep
    // set (the last so arrow nav re-routes through a changed navigable set).
  }, [isFollow, chapters, current, assignedChapterIds]);

  // Focus the search input the moment it opens (keyboard-first flow).
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Story 9.4: follow-only render. One read-only sheet mirroring the Expert's
  // chapter — no sidebar, no search, no arrows, no position writes. The outer
  // Expert-name/lock header + card framing belong to SpectatorLounge (mockup 5b);
  // this fills its card and owns the single scroll region over the page content.
  if (isFollow) {
    if (current === null) {
      return (
        <div
          className="grid h-full place-items-center rounded-sm border border-dashed bg-surface-manual/40 px-6 py-8 text-center font-body text-sm text-ink-muted"
          style={{ borderColor: '#C9BC9D' }}
          data-testid="lounge-manual-waiting"
        >
          Hasn&rsquo;t opened the manual yet.
        </div>
      );
    }
    const followIndex = chapters.findIndex((c) => c.chapterId === current.chapterId) + 1;
    return (
      <article
        className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-sm border bg-surface-manual text-ink-manual"
        style={{ borderColor: '#C9BC9D', padding: '28px 40px 20px' }}
        data-testid="lounge-manual-pane"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50 mix-blend-multiply"
          style={{ backgroundImage: PAPER_GRAIN_URL }}
        />
        <div className="mb-3 flex items-baseline gap-3 border-b-2 pb-2" style={{ borderColor: '#211A12' }}>
          <span className="font-manual text-[34px] font-bold leading-none text-bakelite">{followIndex}</span>
          <h2 className="font-manual text-[26px] font-bold tracking-[-0.01em]">{current.chapterTitle}</h2>
        </div>
        {/* THE single scrolling region for this card (DESIGN.md: no nested scroll).
            Keyed by chapter so a followed Expert's nav remounts it at scrollTop 0
            (review 9.4 — the Expert path resets via scrollRef; this pane has none). */}
        <div key={current.chapterId} className="relative min-h-0 flex-1 overflow-y-auto pr-2">
          {current.pages.map((page, i) => (
            <PageRenderer key={i} page={page} />
          ))}
        </div>
      </article>
    );
  }

  if (current === null) {
    return (
      <div className="grid h-screen place-items-center bg-surface font-body text-ink-muted">
        No manual chapters available.
      </div>
    );
  }

  // Search runs over the NAVIGABLE set only (Story 9.1) — a locked chapter is
  // never a search hit. Not searching: show the FULL manual (locked chapters
  // greyed in place, so canonical numbers stay legible).
  const visibleChapters = searchOpen ? searchChapters(navigable, query) : [...chapters];
  // Chapter numbers come from position in the FULL manual, not the filtered list.
  const numberOf = (chapterId: string) =>
    chapters.findIndex((c) => c.chapterId === chapterId) + 1;
  const currentIndex = numberOf(current.chapterId);
  const prevId = adjacentChapterId(navigable, current.chapterId, -1);
  const nextId = adjacentChapterId(navigable, current.chapterId, 1);

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const top = searchChapters(navigable, query)[0];
      if (top !== undefined) selectChapter(top.chapterId);
      event.preventDefault();
    } else if (event.key === 'Escape') {
      setSearchOpen(false);
      setQuery('');
      event.preventDefault();
    }
  };

  return (
    <div
      className="relative grid h-screen grid-cols-[300px_1fr] overflow-hidden font-body text-ink-primary"
      style={{
        background:
          'radial-gradient(120% 90% at 30% 0%, #211D24 0%, var(--color-surface) 55%, #0C0B0E 100%)',
      }}
    >
      {/* SIDEBAR — operator world */}
      <aside
        className="relative z-10 flex flex-col border-r px-7 py-11"
        style={{ borderColor: '#2A242F' }}
      >
        <div className="mb-7">
          <div className="mb-2 font-mono text-xs uppercase tracking-[0.26em] text-ink-muted">
            Defusal Handbook
          </div>
          <div className="font-manual text-[26px] font-bold text-ink-primary">Chapters</div>

          {/* Manual language selector (i18n). Switching re-selects the localized
              pages upstream (buildChapters depends on manualLocale); chapter ids
              are language-invariant, so the open chapter is preserved. */}
          <div
            className="mt-3.5 inline-flex gap-1 rounded-md border p-0.5"
            role="group"
            aria-label="Manual language"
            style={{ borderColor: '#2A242F' }}
          >
            {(['en', 'zh'] as const).map((loc) => {
              const active = manualLocale === loc;
              return (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setManualLocale(loc)}
                  aria-pressed={active}
                  className={`rounded-[3px] px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors ${
                    active
                      ? 'bg-surface-manual font-semibold text-ink-manual'
                      : 'text-ink-muted hover:bg-white/5 hover:text-ink-primary'
                  }`}
                >
                  {loc === 'en' ? 'EN' : '中文'}
                </button>
              );
            })}
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5" aria-label="Manual chapters">
          {visibleChapters.map((chapter) => {
            const active = chapter.chapterId === current.chapterId;
            // Story 9.1: a locked chapter is listed (canonical number preserved)
            // but disabled — greyed, non-clickable, and removed from the tab order
            // (`disabled` also drops it from focus/keyboard). It is never `active`
            // because `current` is always resolved from the navigable set.
            const locked = isLocked(chapter.chapterId);
            return (
              <button
                key={chapter.chapterId}
                type="button"
                disabled={locked}
                aria-disabled={locked || undefined}
                onClick={locked ? undefined : () => selectChapter(chapter.chapterId)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3.5 rounded-md px-3.5 py-2 text-left font-manual text-md transition-colors ${
                  locked
                    ? 'cursor-default text-ink-muted opacity-40'
                    : active
                      ? 'bg-surface-manual font-semibold text-ink-manual shadow-[0_2px_10px_rgba(0,0,0,0.3)]'
                      : 'text-ink-muted hover:bg-white/5 hover:text-ink-primary'
                }`}
              >
                <span
                  className={`w-5 flex-none text-right font-mono text-sm ${
                    active ? 'text-bakelite' : 'opacity-70'
                  }`}
                >
                  {numberOf(chapter.chapterId)}
                </span>
                {chapter.chapterTitle}
              </button>
            );
          })}
          {searchOpen && visibleChapters.length === 0 && (
            <div className="px-3.5 py-2 font-body text-sm text-ink-muted">No chapter by that name.</div>
          )}
        </nav>

        <div className="mt-5 border-t pt-4" style={{ borderColor: '#2A242F' }}>
          {searchOpen ? (
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Search a chapter by name…"
              aria-label="Search chapters by name"
              className="w-full rounded-sm border bg-surface-raised px-3 py-1.5 font-body text-sm text-ink-primary placeholder:text-ink-muted"
              style={{ borderColor: '#3A3340' }}
            />
          ) : (
            <div className="flex items-center gap-2.5 text-sm text-ink-muted">
              <span
                className="rounded-sm border border-b-2 bg-surface-raised px-2 py-0.5 font-mono text-sm text-ink-primary"
                style={{ borderColor: '#3A3340' }}
              >
                /
              </span>
              Search a chapter by name
            </div>
          )}
        </div>
      </aside>

      {/* DESK + PAPER */}
      {/* flex (not grid place-items): the sheet's h-full needs a definite
          container height to resolve against, or it silently grows past the desk */}
      <main className="relative z-10 flex items-center justify-center overflow-hidden px-14 py-10">
        <article
          className="relative flex h-full max-h-full flex-col rounded-sm border bg-surface-manual text-ink-manual"
          style={{
            width: 'min(980px, 100%)',
            borderColor: '#C9BC9D',
            boxShadow: 'var(--panel-manual-shadow), 0 30px 70px rgba(0,0,0,0.45)',
            transform: 'rotate(-0.8deg)',
            padding: '48px 64px 32px',
          }}
        >
          {/* paper grain (mockup .paper-grain) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-50 mix-blend-multiply"
            style={{ backgroundImage: PAPER_GRAIN_URL }}
          />

          <div
            className="flex items-baseline justify-between border-b-2 pb-2.5"
            style={{ borderColor: '#211A12' }}
          >
            <span className="font-mono text-xs uppercase tracking-[0.18em]" style={{ color: '#8A7A5E' }}>
              Bomb Defusal Manual
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.18em]" style={{ color: '#8A7A5E' }}>
              Verification — 241
            </span>
          </div>

          <div className="mb-1.5 mt-5 flex items-baseline gap-4">
            <span className="font-manual text-[56px] font-bold leading-none text-bakelite">
              {currentIndex}
            </span>
            <h1 className="font-manual text-[40px] font-bold tracking-[-0.01em]">
              {current.chapterTitle}
            </h1>
          </div>

          {/* THE single scrolling region (DESIGN.md: no nested scrolling, ever).
              min-h-0 overrides the flex min-height:auto floor — without it the
              content can't overflow here and the sheet grows past the desk. */}
          <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto pr-2 pt-2">
            {current.pages.map((page, i) => (
              <PageRenderer key={i} page={page} />
            ))}
          </div>

          <div
            className="mt-auto flex items-center justify-between border-t pt-4"
            style={{ borderColor: '#C9BC9D' }}
          >
            <span className="font-mono text-xs tracking-[0.1em]" style={{ color: '#8A7A5E' }}>
              {current.chapterTitle} · ch. {String(currentIndex).padStart(2, '0')}
            </span>
            <div className="flex items-center gap-5 font-manual text-[16px]" style={{ color: '#5A4F3E' }}>
              <button
                type="button"
                disabled={prevId === null}
                onClick={() => prevId !== null && selectChapter(prevId)}
                className="disabled:cursor-default"
                style={{ color: prevId === null ? '#A8946C' : undefined }}
              >
                ← prev
              </button>
              <button
                type="button"
                disabled={nextId === null}
                onClick={() => nextId !== null && selectChapter(nextId)}
                className="disabled:cursor-default"
                style={{ color: nextId === null ? '#A8946C' : undefined }}
              >
                next →
              </button>
            </div>
          </div>
        </article>
      </main>
    </div>
  );
}
