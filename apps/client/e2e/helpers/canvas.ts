/**
 * Canvas helpers (Story TD-6) — the mesh→screen projection seam that lets
 * Playwright click R3F geometry. DefuserViews carry no DOM: the only honest way
 * to interact is a real pointer event on real canvas pixels, so we project the
 * named object's world position through the live camera to CSS coordinates and
 * click there. The scene/camera/canvas refs come from the dev-gated
 * `window.__E2E__` hook (src/scenes/E2eSceneHook.tsx).
 *
 * Determinism notes:
 * - The Playwright context runs with `reducedMotion: 'reduce'`, so camera focus
 *   moves land instantly — a projection taken after the store reflects the move
 *   is stable.
 * - Solving stays honest: specs derive the correct move from the PUBLIC
 *   snapshot (readBomb + the shared solve fns), never a baked answer.
 */
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { BombContext, BombState } from '@bomb-squad/shared';

interface ProjectResult {
  x?: number;
  y?: number;
  error?: string;
}

/** Wait until the named object exists in the registered scene. */
export async function waitForMesh(page: Page, name: string): Promise<void> {
  await page.waitForFunction(
    (meshName) => {
      const e2e = (window as { __E2E__?: { scene?: { getObjectByName(n: string): unknown } } }).__E2E__;
      return Boolean(e2e?.scene?.getObjectByName(meshName));
    },
    name,
    { timeout: 15_000 },
  );
}

/**
 * Project the named object's world position (plus an optional OBJECT-LOCAL
 * offset — it rotates with the object, so back-face bays behave) through the
 * live camera and click the resulting CSS pixel.
 */
export async function clickMesh(
  page: Page,
  name: string,
  opts: { offset?: [number, number, number] } = {},
): Promise<void> {
  await waitForMesh(page, name);
  const point = await page.evaluate(
    async ({ meshName, offset }): Promise<{ x?: number; y?: number; error?: string }> => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const e2e = (window as any).__E2E__;
      if (!e2e) return { error: 'window.__E2E__ hook not registered' };
      const obj = e2e.scene.getObjectByName(meshName);
      if (!obj) return { error: `object "${meshName}" not found` };
      const projectNow = () => {
        obj.updateWorldMatrix(true, false);
        const v = obj.position.clone(); // borrow a Vector3 instance (no THREE import in-page)
        if (offset) {
          v.set(offset[0], offset[1], offset[2]);
          obj.localToWorld(v);
        } else {
          obj.getWorldPosition(v);
        }
        e2e.camera.updateMatrixWorld();
        v.project(e2e.camera);
        const rect = e2e.canvas.getBoundingClientRect();
        return {
          x: rect.x + ((v.x + 1) / 2) * rect.width,
          y: rect.y + ((1 - v.y) / 2) * rect.height,
        };
      };
      const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
      // The camera may still be moving (a click-to-focus jump lands over a
      // frame or two even under reduced motion) — sample per frame until the
      // projection is stable, so the click lands where the mesh IS.
      let prev = projectNow();
      for (let frame = 0; frame < 120; frame++) {
        await raf();
        const next = projectNow();
        if (Math.abs(next.x - prev.x) < 0.5 && Math.abs(next.y - prev.y) < 0.5) return next;
        prev = next;
      }
      return { error: `projection of "${meshName}" never stabilised` };
    },
    { meshName: name, offset: opts.offset ?? null },
  ) as ProjectResult;
  if (point.error !== undefined || point.x === undefined || point.y === undefined) {
    throw new Error(`clickMesh(${name}): ${point.error ?? 'projection failed'}`);
  }
  await page.mouse.click(point.x, point.y);
}

/** Read the authoritative bomb snapshot the client currently holds. */
export async function readBomb(page: Page): Promise<BombState> {
  const bomb = await page.evaluate(() => {
    const e2e = (window as { __E2E_STATE__?: { getState: () => { bomb: unknown } } })
      .__E2E_STATE__;
    return e2e ? e2e.getState().bomb : null;
  });
  expect(bomb, 'window.__E2E_STATE__ game state hook').not.toBeNull();
  return bomb as BombState;
}

/**
 * Wait until the client's bomb snapshot satisfies a predicate, then return it.
 * The predicate runs in NODE (closures welcome) over polled snapshots —
 * a condition-based wait, not a sleep.
 */
export async function waitForBomb(
  page: Page,
  predicate: (bomb: BombState) => boolean,
  timeout = 30_000,
): Promise<BombState> {
  let bomb!: BombState;
  await expect(async () => {
    const snapshot = await page.evaluate(() => {
      const e2e = (window as { __E2E_STATE__?: { getState: () => { bomb: unknown } } })
        .__E2E_STATE__;
      return e2e ? e2e.getState().bomb : null;
    });
    expect(snapshot).not.toBeNull();
    bomb = snapshot as BombState;
    expect(predicate(bomb)).toBe(true);
  }).toPass({ timeout });
  return bomb;
}

export interface GameSnapshot {
  bomb: BombState | null;
  /** session.status — the AUTHORITATIVE round signal. A null bomb does NOT
   *  mean the round resolved (reconnect/resync can blank it transiently);
   *  only a status change off 'active' does. */
  status: string | null;
}

/**
 * Wait until the client's game snapshot (bomb + session status) satisfies a
 * predicate; the predicate runs in NODE (closures welcome) over polled
 * snapshots — a condition-based wait, not a sleep.
 */
export async function waitForGame(
  page: Page,
  predicate: (game: GameSnapshot) => boolean,
  timeout = 30_000,
): Promise<GameSnapshot> {
  let game!: GameSnapshot;
  await expect(async () => {
    game = (await page.evaluate(() => {
      // Canvas-INDEPENDENT hook: session status must stay readable when a
      // round resolves and the bomb scene (and its __E2E__ hook) unmounts.
      const e2e = (
        window as {
          __E2E_STATE__?: { getState: () => { bomb: unknown; session: { status?: string } | null } };
        }
      ).__E2E_STATE__;
      if (!e2e) return { bomb: null, status: null };
      const s = e2e.getState();
      return { bomb: s.bomb, status: s.session?.status ?? null };
    })) as GameSnapshot;
    expect(predicate(game)).toBe(true);
  }).toPass({ timeout });
  return game;
}

export type { BombContext, BombState };
