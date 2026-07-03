import { describe, expect, it } from '@jest/globals';
import { allocateExpertChapters, CHAPTER_IDS, makeSeededRng } from '../../index.js';

/** The 11 canonical chapters, as the allocator is always called with them. */
const CHAPTERS: string[] = [...CHAPTER_IDS];

describe('CHAPTER_IDS', () => {
  it('is exactly the 11 real module chapters', () => {
    expect(CHAPTER_IDS.length).toBe(11);
  });

  it('never leaks the sandbox-only dev-demo chapter', () => {
    expect(CHAPTER_IDS.includes('dev-demo' as (typeof CHAPTER_IDS)[number])).toBe(false);
  });
});

describe('allocateExpertChapters', () => {
  it('2 Experts / 11 chapters → sizes {6,5}, disjoint, union === all 11', () => {
    const map = allocateExpertChapters(['e1', 'e2'], CHAPTERS, makeSeededRng(1));
    const lists = Object.values(map);
    expect(lists.length).toBe(2);
    const sizes = lists.map((l) => l.length).sort();
    expect(sizes).toEqual([5, 6]);

    const [a, b] = lists;
    // Disjoint (no chapter in both) …
    expect(a!.filter((c) => b!.includes(c))).toEqual([]);
    // … and together they cover every chapter exactly once.
    expect([...a!, ...b!].sort()).toEqual([...CHAPTERS].sort());
  });

  it('is deterministic — same rng seed → identical map', () => {
    const a = allocateExpertChapters(['e1', 'e2', 'e3'], CHAPTERS, makeSeededRng(42));
    const b = allocateExpertChapters(['e1', 'e2', 'e3'], CHAPTERS, makeSeededRng(42));
    expect(a).toEqual(b);
  });

  it('a different seed still yields a valid partition (disjoint, full union)', () => {
    const map = allocateExpertChapters(['e1', 'e2', 'e3'], CHAPTERS, makeSeededRng(99));
    const all = Object.values(map).flat();
    // Every chapter dealt exactly once, nothing invented.
    expect([...all].sort()).toEqual([...CHAPTERS].sort());
    expect(new Set(all).size).toBe(all.length);
  });

  it('each Expert list is in canonical (sorted-stable) chapter order', () => {
    const map = allocateExpertChapters(['e1', 'e2', 'e3'], CHAPTERS, makeSeededRng(11));
    const canonicalIndex = (id: string) => CHAPTERS.indexOf(id);
    for (const list of Object.values(map)) {
      const indices = list.map(canonicalIndex);
      expect(indices).toEqual([...indices].sort((a, b) => a - b));
    }
  });

  it('round-robin dealing keeps sizes even-as-possible (max-min ≤ 1)', () => {
    const map = allocateExpertChapters(['e1', 'e2', 'e3', 'e4'], CHAPTERS, makeSeededRng(8));
    const sizes = Object.values(map).map((l) => l.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it('1 Expert → that Expert gets all 11', () => {
    const map = allocateExpertChapters(['solo'], CHAPTERS, makeSeededRng(7));
    expect(map.solo).toEqual(CHAPTERS);
  });

  it('0 Experts → {}', () => {
    expect(allocateExpertChapters([], CHAPTERS, makeSeededRng(7))).toEqual({});
  });

  it('12 Experts / 11 chapters → exactly one Expert gets []', () => {
    const experts = Array.from({ length: 12 }, (_, i) => `e${i}`);
    const map = allocateExpertChapters(experts, CHAPTERS, makeSeededRng(3));
    expect(Object.keys(map).length).toBe(12);
    const empty = Object.values(map).filter((l) => l.length === 0);
    expect(empty.length).toBe(1);
    // The 11 chapters are still fully covered across the other 11 Experts.
    expect(Object.values(map).flat().sort()).toEqual([...CHAPTERS].sort());
  });

  it('does not mutate its inputs (safe on frozen arrays)', () => {
    const experts = Object.freeze(['e1', 'e2', 'e3']);
    const chapters = Object.freeze([...CHAPTERS]);
    expect(() => allocateExpertChapters(experts, chapters, makeSeededRng(5))).not.toThrow();
    expect(experts).toEqual(['e1', 'e2', 'e3']);
    expect(chapters).toEqual([...CHAPTERS]);
  });
});
