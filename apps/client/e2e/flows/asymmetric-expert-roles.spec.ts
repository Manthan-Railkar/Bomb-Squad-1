/**
 * Story 9.1 — Asymmetric Expert Roles, full end-to-end verification across real
 * browsers ↔ the real in-process server. Automates the human-verification check:
 *
 *  1. modifier ON + 2 Experts → each Expert's manual lists ALL 11 chapters
 *     (canonical numbers) but exposes a DIFFERENT, DISJOINT navigable subset
 *     (union = 11); the rest are shown-locked (disabled). Defuser sees no manual.
 *  2. modifier ON + SOLO Expert → full manual (modifier inert). (AC-3)
 *  3. modifier OFF + 2 Experts → full manual. (AC-3)
 *  4. a restricted Expert who RELOADS mid-round re-restricts to the same set. (AC-4)
 *  5. on a restricted Expert: clicking a locked chapter is a no-op, arrows skip
 *     locked chapters, and `/` search never surfaces a locked chapter. (AC-2)
 *
 * Single active team A (Ada Defuser + browser Experts): `selectActiveTeam` picks
 * A for round 1, and the idle browser Defuser keeps the round unresolved while we
 * inspect the manuals. No bots — no TD-5 swarm to leak.
 */
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  assignTeam,
  hostSession,
  joinSession,
  openPreparation,
  startTheRound,
} from '../helpers/session.js';

const NAV = 'nav[aria-label="Manual chapters"]';
/** Shown only in Preparation (not ActiveRound) — its absence means the round is live. */
const PREP_MANUAL_LINE = "You're on the manual. Read fast.";

function normalize(texts: string[]): string[] {
  return texts
    .map((t) => t.replace(/\s+/g, ' ').replace(/^\d+\s*/, '').trim())
    .filter(Boolean);
}
/** Chapter titles this Expert may navigate (enabled buttons), in sidebar order. */
async function navigableOrdered(page: Page): Promise<string[]> {
  return normalize(await page.locator(`${NAV} button:not([disabled])`).allInnerTexts());
}
/** Every chapter title currently shown in the sidebar (search-filtered when searching). */
async function shownTitles(page: Page): Promise<string[]> {
  return normalize(await page.locator(`${NAV} button`).allInnerTexts());
}
/** The open chapter's title, read from the sidebar's aria-current button (scoped
 *  to the manual nav — the sheet's own <h1> is not unique on the ActiveRound). */
async function currentTitle(page: Page): Promise<string> {
  return normalize([await page.locator(`${NAV} button[aria-current="page"]`).innerText()])[0] ?? '';
}

interface Round {
  ada: Page;
  experts: Page[];
  cleanup: () => Promise<void>;
}

/**
 * Host a round with Ada as Defuser (relayOrder[0]) and `expertNames` as Experts
 * on the single active team A, optionally with the modifier ON, then start it.
 */
async function hostRound(
  facilitator: Page,
  browser: Browser,
  opts: { modifier: boolean; expertNames: string[] },
): Promise<Round> {
  const joinCode = await hostSession(facilitator);
  const contexts: BrowserContext[] = [];
  const newPlayer = async (): Promise<Page> => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
    contexts.push(ctx);
    return ctx.newPage();
  };

  const ada = await newPlayer();
  await joinSession(ada, joinCode, 'Ada', 'Defuser');
  const experts: Page[] = [];
  for (const name of opts.expertNames) {
    const p = await newPlayer();
    await joinSession(p, joinCode, name, 'Expert');
    experts.push(p);
  }

  // Ada assigned FIRST → relayOrder[0] → round-1 Defuser; Experts stay Experts.
  await assignTeam(facilitator, 'Ada', 'A');
  for (const name of opts.expertNames) await assignTeam(facilitator, name, 'A');

  if (opts.modifier) {
    const toggle = facilitator.getByRole('switch', { name: 'Asymmetric Expert roles' });
    await expect(async () => {
      if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 3_000 });
    }).toPass({ timeout: 15_000 });
  }

  await openPreparation(facilitator);
  await startTheRound(facilitator);

  return { ada, experts, cleanup: () => Promise.all(contexts.map((c) => c.close())).then(() => undefined) };
}

/** Wait until this Expert page is in the ACTIVE round and the restriction landed. */
async function waitRestricted(expert: Page): Promise<void> {
  await expect(expert.getByText(PREP_MANUAL_LINE)).toHaveCount(0, { timeout: 30_000 });
  await expect(expert.locator(NAV)).toBeVisible({ timeout: 30_000 });
  await expect(expert.locator(`${NAV} button[disabled]`).first()).toBeVisible({ timeout: 30_000 });
  await expect(expert.locator(`${NAV} button`)).toHaveCount(11); // all 11 real chapters listed
}

/** Wait until this Expert page is in the ACTIVE round with the FULL manual (nothing locked). */
async function waitFullManual(expert: Page): Promise<void> {
  await expect(expert.getByText(PREP_MANUAL_LINE)).toHaveCount(0, { timeout: 30_000 });
  await expect(expert.locator(NAV)).toBeVisible({ timeout: 30_000 });
  await expect(expert.locator(`${NAV} button[disabled]`)).toHaveCount(0);
  expect((await shownTitles(expert)).length).toBeGreaterThanOrEqual(11);
}

test('modifier ON + 2 Experts → disjoint shown-locked manuals (union = 11); Defuser sees no manual', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const { ada, experts, cleanup } = await hostRound(page, browser, {
    modifier: true,
    expertNames: ['Xander', 'Yara'],
  });
  try {
    for (const expert of experts) await waitRestricted(expert);

    const everyChapter = [...(await shownTitles(experts[0]!))].sort();
    expect(everyChapter.length).toBe(11);
    expect([...(await shownTitles(experts[1]!))].sort()).toEqual(everyChapter);

    const xNav = await navigableOrdered(experts[0]!);
    const yNav = await navigableOrdered(experts[1]!);

    // Each genuinely restricted (some open, some locked).
    for (const nav of [xNav, yNav]) {
      expect(nav.length).toBeGreaterThan(0);
      expect(nav.length).toBeLessThan(11);
    }
    // Disjoint, union covers all 11, round-robin sizes {6,5}.
    expect(xNav.filter((t) => yNav.includes(t))).toEqual([]);
    expect([...xNav, ...yNav].sort()).toEqual(everyChapter);
    expect([xNav.length, yNav.length].sort((a, b) => a - b)).toEqual([5, 6]);

    // The Defuser is on the bomb, never a manual (role-gated surface).
    await expect(ada.locator(NAV)).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test('modifier ON + SOLO Expert → full manual, modifier inert (AC-3)', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const { experts, cleanup } = await hostRound(page, browser, { modifier: true, expertNames: ['Xander'] });
  try {
    await waitFullManual(experts[0]!);
  } finally {
    await cleanup();
  }
});

test('modifier OFF + 2 Experts → full manual for both (AC-3)', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const { experts, cleanup } = await hostRound(page, browser, {
    modifier: false,
    expertNames: ['Xander', 'Yara'],
  });
  try {
    for (const expert of experts) await waitFullManual(expert);
  } finally {
    await cleanup();
  }
});

test('a restricted Expert who RELOADS mid-round re-restricts to the same set (AC-4)', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const { experts, cleanup } = await hostRound(page, browser, {
    modifier: true,
    expertNames: ['Xander', 'Yara'],
  });
  try {
    const xander = experts[0]!;
    await waitRestricted(xander);
    const before = [...(await navigableOrdered(xander))].sort();

    await xander.reload(); // reconnect via stored identity → server re-delivers the assignment
    await waitRestricted(xander);
    const after = [...(await navigableOrdered(xander))].sort();

    expect(after).toEqual(before);
  } finally {
    await cleanup();
  }
});

test('restricted Expert: locked chapters are non-clickable, arrows skip them, search excludes them (AC-2)', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const { experts, cleanup } = await hostRound(page, browser, {
    modifier: true,
    expertNames: ['Xander', 'Yara'],
  });
  try {
    const xander = experts[0]!;
    await waitRestricted(xander);

    const nav = await navigableOrdered(xander);
    const shown = await shownTitles(xander);
    const locked = shown.filter((t) => !nav.includes(t));
    expect(locked.length).toBeGreaterThan(0);

    // First-open lands on the first assigned chapter (never a locked one).
    expect(await currentTitle(xander)).toBe(nav[0]);

    // Clicking a locked chapter is a no-op (it is disabled; a forced click changes nothing).
    const lockedBtn = xander.locator(`${NAV} button[disabled]`).first();
    await expect(lockedBtn).toBeDisabled();
    await lockedBtn.click({ force: true }).catch(() => undefined);
    expect(await currentTitle(xander)).toBe(nav[0]);

    // Arrows skip locked chapters — step through the NAVIGABLE order, never a locked one.
    await xander.keyboard.press('ArrowRight');
    await expect.poll(() => currentTitle(xander)).toBe(nav[1]);
    await xander.keyboard.press('ArrowRight');
    await expect.poll(() => currentTitle(xander)).toBe(nav[2]);

    // `/` search surfaces an assigned chapter but never a locked one.
    await xander.keyboard.press('/');
    const input = xander.getByRole('textbox', { name: /search chapters/i });
    await input.fill(nav[0]!);
    expect(await shownTitles(xander)).toContain(nav[0]);
    await input.fill(locked[0]!);
    expect(await shownTitles(xander)).not.toContain(locked[0]);
  } finally {
    await cleanup();
  }
});
