/**
 * TD-7 (coverage completion) — The Button on /dev/sandbox (Easy tier, Story 5.4).
 * A single press/hold button: the correct play (tap vs hold-and-release-at-a-
 * timer-digit) is recomputed from PUBLIC state (colour + label + the button's own
 * ctx) via the shared `decideButton`; the hold-release digit from the strip
 * colour via `releaseDigitFor` — never a baked answer (the module stores none).
 *
 * This spec picks a HOLD-answer instance (the richer path) and drives both
 * surfaces on it via the sandbox's frozen-clock control: releasing while the
 * displayed timer does NOT show the strip's digit strikes; releasing while it
 * DOES show the digit solves. A single canvas click on the cap fires the
 * pointerdown→PRESS then pointerup→RELEASE pair (interaction.ts), and RELEASE
 * reads the frozen timer we set — so no live countdown or `waitForTimeout` (AC3).
 */
import { test, expect } from '@playwright/test';
import { decideButton, releaseDigitFor, type ButtonState } from '@bomb-squad/shared';
import { clickMesh, waitForBomb, waitForMesh } from '../helpers/canvas.js';
import { generateSandboxModule, inspectorRow } from '../helpers/sandbox.js';

/** Freeze the sandbox clock at `seconds` (single digit) and confirm it landed. */
async function setClock(page: import('@playwright/test').Page, seconds: number) {
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 9) {
    // The digits echo below assumes the m:ss shape [0, 0, s] — two-digit
    // seconds would time out with no hint why.
    throw new Error(`setClock: single-digit seconds only (got ${seconds})`);
  }
  const label = page.locator('label', { hasText: 'Clock seconds' });
  await label.locator('input').fill(String(seconds));
  await page.getByRole('button', { name: 'Set clock' }).click();
  // Deterministic wait: the sidebar echoes the frozen timer's digits, proving the
  // store timer is set before we release the button. (seconds 1..9 → "0:0s".)
  await expect(label).toContainText(`digits [0, 0, ${seconds}]`);
}

test('the-button: a hold released on the wrong timer digit strikes; releasing on the right digit solves', async ({
  page,
}) => {
  // Deterministic seed choice: walk fixed candidates until the instance's answer
  // is HOLD (so both the strike and the solve are exercisable via the clock). The
  // ctx is the fixed sandbox context, so decideButton is stable per seed.
  let data!: ButtonState;
  for (const seed of ['7', '1', '2', '3', '4', '5', '6', '8', '9', '10']) {
    data = await generateSandboxModule<ButtonState>(page, 'the-button', seed);
    if (decideButton(data.color, data.label, data.ctx) === 'hold') break;
  }
  expect(decideButton(data.color, data.label, data.ctx), 'need a hold-answer instance').toBe('hold');
  await waitForMesh(page, 'm0-button');

  const releaseDigit = releaseDigitFor(data.stripColor);
  const wrongSeconds = releaseDigit === 2 ? 3 : 2;
  // The frozen clock will show digits [0, 0, wrongSeconds]; NONE of them may
  // equal the strip digit, or the "wrong" release is silently correct. Guards a
  // future strip-table change mapping a colour to 0 (the two fixed zeros).
  expect(
    [0, wrongSeconds],
    'wrong-release timer digits must exclude the strip digit',
  ).not.toContain(releaseDigit);

  // Wrong release: hold, then release while the timer shows a non-matching digit.
  await setClock(page, wrongSeconds);
  await clickMesh(page, 'm0-button');
  await expect(inspectorRow(page, 'strikes')).toHaveText('1');
  await waitForBomb(page, (b) => b.strikes === 1 && b.modules[0]!.status !== 'solved');

  // Correct release: hold, then release while the timer shows the strip's digit.
  await setClock(page, releaseDigit);
  await clickMesh(page, 'm0-button');
  await expect(inspectorRow(page, 'status')).toHaveText('solved');
  await expect(inspectorRow(page, 'bomb.solved')).toHaveText('true');
});
