/**
 * /dev/sandbox drivers (Story TD-6). The sandbox mounts one seeded module on
 * the real BombStage with a LOCAL reducer backend (devDispatch) — the
 * deterministic WebGL target for per-module interaction specs.
 *
 * Cold-start note: on the very first load of a dev-server session the app can
 * re-render surfaces while the module graph is still streaming (socket connect,
 * vite dep optimisation), and an interaction fired into that window can be
 * dropped. `generateSandboxModule` therefore DRIVES + ASSERTS as one atomic
 * unit and re-drives until the store provably reflects the request — a
 * condition-based wait (flake policy: fix the wait, never sleep).
 */
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { readBomb } from './canvas.js';

/** Sidebar inspector row (dt label → dd value). */
export function inspectorRow(page: Page, label: string) {
  return page
    .locator('dl > div')
    .filter({ has: page.locator('dt', { hasText: label }) })
    .locator('dd');
}

/**
 * Select a module + seed and Generate, until the authoritative store holds the
 * requested instance. Returns the generated module data.
 */
export async function generateSandboxModule<TData>(
  page: Page,
  moduleId: string,
  seed: string,
): Promise<TData> {
  await page.goto('/dev/sandbox');
  await expect(async () => {
    await page.getByLabel('Module').selectOption(moduleId);
    await page.getByLabel(/Seed/).fill(seed);
    await page.getByRole('button', { name: 'Generate' }).click();
    // Both must hold: the inspector echoes the typed seed AND the store carries
    // the requested module — proof the interaction landed on a live tree.
    await expect(inspectorRow(page, 'seed')).toHaveText(seed, { timeout: 2_000 });
    const bomb = await readBomb(page);
    expect(bomb.modules[0]?.moduleId).toBe(moduleId);
  }).toPass({ timeout: 30_000 });
  const bomb = await readBomb(page);
  return bomb.modules[0]!.data as TData;
}
