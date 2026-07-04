/**
 * Story 9.4 — Spectator Lounge, end-to-end across real browsers ↔ the real
 * in-process server. Automates the human-verification check:
 *
 *  1. a Spectator sees the split-pane lounge — a read-only bomb scene + the
 *     read-only Expert manual MULTIVIEW (AC-1).
 *  2. the Spectator's read-only bomb MIRRORS the active team's bomb: it starts
 *     from the same snapshot and reflects a Defuser's cut (AC-5).
 *  3. the Spectator cannot interact — a forced click on the read-only bomb
 *     changes nothing (AC-1/5).
 *  4. one pane PER active-team Expert, each following its OWN Expert: Expert A on
 *     one chapter, Expert B on another → two panes, two chapters (AC-2/3/4).
 *  5. a Spectator who RELOADS mid-round re-enters the lounge with the current bomb
 *     + BOTH Experts' pages replayed (AC-4 per-Expert replay).
 *
 * Single active team A: Ada (Defuser, relayOrder[0]) + Xander/Yara (Experts) +
 * Sam (Spectator). The idle Defuser keeps the round unresolved while we inspect.
 * No bots — no TD-5 swarm to leak. AC-6 (Send-Tip with a held token) needs a
 * round to complete first to mint tokens; it is covered by the 9.3 suite + unit
 * tests + human verification, not re-driven here.
 */
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  assignTeam,
  configureWiresOnly,
  hostSession,
  joinSession,
  openPreparation,
  startTheRound,
} from '../helpers/session.js';
import { clickMesh, readBomb, waitForBomb, waitForMesh } from '../helpers/canvas.js';

const NAV = 'nav[aria-label="Manual chapters"]';
const MULTIVIEW = '[data-testid="lounge-manual-multiview"]';

interface Lounge {
  ada: Page; // active-team Defuser
  xander: Page; // active-team Expert
  yara: Page; // active-team Expert
  sam: Page; // genuine Spectator
  cleanup: () => Promise<void>;
}

async function hostLounge(facilitator: Page, browser: Browser): Promise<Lounge> {
  const joinCode = await hostSession(facilitator);
  const contexts: BrowserContext[] = [];
  const newPlayer = async (): Promise<Page> => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
    contexts.push(ctx);
    return ctx.newPage();
  };

  const ada = await newPlayer();
  await joinSession(ada, joinCode, 'Ada', 'Defuser');
  const xander = await newPlayer();
  await joinSession(xander, joinCode, 'Xander', 'Expert');
  const yara = await newPlayer();
  await joinSession(yara, joinCode, 'Yara', 'Expert');
  const sam = await newPlayer();
  await joinSession(sam, joinCode, 'Sam', 'Spectator');

  // Ada assigned FIRST → relayOrder[0] → round-1 Defuser; the others stay Experts.
  await assignTeam(facilitator, 'Ada', 'A');
  await assignTeam(facilitator, 'Xander', 'A');
  await assignTeam(facilitator, 'Yara', 'A');
  // Sam stays teamless (a genuine spectator).

  await configureWiresOnly(facilitator);
  await openPreparation(facilitator);
  await startTheRound(facilitator);

  return {
    ada,
    xander,
    yara,
    sam,
    cleanup: () => Promise.all(contexts.map((c) => c.close())).then(() => undefined),
  };
}

/** Read a spectator's accumulated per-Expert positions (playerId → chapterId). */
async function readExpertPositions(spectator: Page): Promise<Record<string, string>> {
  return spectator.evaluate(() => {
    const e2e = (
      window as { __E2E_STATE__?: { getState: () => { expertManualPositions: Record<string, string> } } }
    ).__E2E_STATE__;
    return e2e ? e2e.getState().expertManualPositions : {};
  });
}

/**
 * Navigate an Expert's manual to a chapter and CONFIRM the position reached the
 * spectator's store. Re-clicks under `toPass`: a click only emits MANUAL_NAVIGATE
 * while the Expert socket is 'connected', and the e2e harness (5 browser contexts
 * on software WebGL) can transiently drop + auto-reconnect a socket. Re-emitting
 * on reconnect is idempotent (selectChapter re-publishes), so a retry converges.
 */
async function navigateAndConfirm(
  expert: Page,
  chapterTitle: string,
  chapterId: string,
  sam: Page,
): Promise<void> {
  await expect(async () => {
    await expect(expert.locator(NAV)).toBeVisible({ timeout: 5_000 });
    await expert.locator(`${NAV} button`).filter({ hasText: chapterTitle }).first().click();
    const positions = await readExpertPositions(sam);
    expect(Object.values(positions)).toContain(chapterId);
  }).toPass({ timeout: 60_000 });
}

test('a Spectator sees the split-pane lounge, mirrors the bomb, and cannot interact (AC-1/5)', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const { ada, sam, cleanup } = await hostLounge(page, browser);
  try {
    // AC-1: the composed lounge — a bomb scene + the Expert multiview + the pill.
    await expect(sam.getByTestId('lounge-voice-indicator')).toBeVisible({ timeout: 30_000 });
    await expect(sam.locator(MULTIVIEW)).toBeVisible();
    await waitForMesh(sam, 'm0-wire-0'); // the read-only bomb rendered on the spectator's canvas

    // AC-5: Sam's read-only bomb starts from the SAME snapshot as the active team.
    const adaBomb = await waitForBomb(ada, (b) => b.modules.length > 0);
    const samBomb = await waitForBomb(sam, (b) => b.modules.length > 0);
    expect(samBomb.context.serialNumber).toBe(adaBomb.context.serialNumber);

    // A Defuser cut broadcasts to the lounge — Sam's mirror reflects it (AC-5).
    const firstWire = { color: adaBomb.modules[0]!.data as { wires: { cut: boolean }[] } };
    const uncut = firstWire.color.wires.findIndex((w) => !w.cut);
    expect(uncut).toBeGreaterThanOrEqual(0);
    await clickMesh(ada, `m0-wire-${uncut}`);
    await waitForBomb(sam, (b) => (b.modules[0]!.data as { wires: { cut: boolean }[] }).wires[uncut]!.cut === true);

    // AC-1/5: the Spectator cannot interact — a forced click on a STILL-UNCUT wire
    // changes nothing on Sam's mirror (review 9.4: clicking the already-cut wire was
    // vacuous — that is a no-op for a Defuser too). Read-only is enforced both
    // client-side (no dispatch) and server-side (NOT_TEAM_DEFUSER); if either layer
    // broke, this wire would flip to cut (or a strike would land).
    const before = await readBomb(sam);
    const beforeStrikes = before.strikes;
    const beforeWires = (before.modules[0]!.data as { wires: { cut: boolean }[] }).wires;
    const stillUncut = beforeWires.findIndex((w) => !w.cut);
    expect(stillUncut).toBeGreaterThanOrEqual(0); // 3+ wires, only one cut so far
    await clickMesh(sam, `m0-wire-${stillUncut}`).catch(() => undefined);
    await sam.waitForTimeout(500);
    const after = await readBomb(sam);
    expect(after.strikes).toBe(beforeStrikes);
    // No NEW cut appeared from Sam's click (only the Defuser's earlier cut stands).
    const cutCountBefore = beforeWires.filter((w) => w.cut).length;
    const cutCountAfter = (after.modules[0]!.data as { wires: { cut: boolean }[] }).wires.filter((w) => w.cut).length;
    expect(cutCountAfter).toBe(cutCountBefore);

    // AC-1: no Defuser camera-focus controls — a forced click on the module
    // faceplate (the click-to-focus surface) never sets uiStore.activeModuleIndex
    // on a read-only bay (review 9.4: ModuleBay drops the handler under readOnly).
    await clickMesh(sam, 'bay-0').catch(() => undefined);
    await sam.waitForTimeout(300);
    const focused = await sam.evaluate(() => {
      const e2e = (
        window as { __E2E_STATE__?: { getUiState: () => { activeModuleIndex: number | null } } }
      ).__E2E_STATE__;
      return e2e ? e2e.getUiState().activeModuleIndex : 'no-hook';
    });
    expect(focused).toBeNull();
  } finally {
    await cleanup();
  }
});

test('the manual multiview shows one follow pane per Expert; a reload replays every page (AC-2/3/4)', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const { xander, yara, sam, cleanup } = await hostLounge(page, browser);
  try {
    // Round is live and the lounge is mirroring (bomb present) before we navigate.
    await waitForBomb(sam, (b) => b.modules.length > 0);

    // Sam's multiview shows one pane per active-team Expert (from the roster).
    const multiview = sam.locator(MULTIVIEW);
    await expect(multiview.getByText('Xander')).toBeVisible({ timeout: 30_000 });
    await expect(multiview.getByText('Yara')).toBeVisible({ timeout: 30_000 });

    // Each Expert navigates to a DIFFERENT chapter → each position broadcasts to the
    // lounge; Sam accumulates one entry per Expert (keyed by durable playerId).
    await navigateAndConfirm(xander, 'Keypads', 'keypads', sam);
    await navigateAndConfirm(yara, 'Memory', 'memory', sam);
    await expect
      .poll(async () => Object.values(await readExpertPositions(sam)).sort(), { timeout: 30_000 })
      .toEqual(['keypads', 'memory']);

    // …and each pane renders its own Expert's chapter (AC-2/3/4).
    await expect(multiview.getByText(/Keypads/).first()).toBeVisible();
    await expect(multiview.getByText(/Memory/).first()).toBeVisible();

    // AC-4: a mid-round RELOAD re-enters the lounge with BOTH Experts' pages
    // replayed (the server persists per-Expert positions and replays them on join).
    await sam.reload();
    await expect
      .poll(async () => Object.values(await readExpertPositions(sam)).sort(), { timeout: 30_000 })
      .toEqual(['keypads', 'memory']);
    const reloaded = sam.locator(MULTIVIEW);
    await expect(reloaded.getByText('Xander')).toBeVisible({ timeout: 30_000 });
    await expect(reloaded.getByText('Yara')).toBeVisible({ timeout: 30_000 });
    await expect(reloaded.getByText(/Keypads/).first()).toBeVisible();
    await expect(reloaded.getByText(/Memory/).first()).toBeVisible();
    // …and the bomb mirror is restored too.
    await waitForBomb(sam, (b) => b.modules.length > 0);
  } finally {
    await cleanup();
  }
});
