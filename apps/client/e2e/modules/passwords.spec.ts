/**
 * TD-7 (coverage completion) — Passwords on /dev/sandbox (Easy tier, Story 5.5).
 * Five cycleable letter columns; the team spells one of the public 35-word list
 * and SUBMITs. The target word is recomputed from PUBLIC state (which listed word
 * the generated columns can spell — generation guarantees exactly one) via the
 * shared word list + `countSpellableWords`; never a baked answer (the module
 * stores none). Covers the wrong-SUBMIT strike: submitting a non-word strikes and
 * leaves every column untouched so the team can keep cycling.
 */
import { test, expect } from '@playwright/test';
import {
  PASSWORD_WORDS,
  currentWord,
  isValidPassword,
  type PasswordsState,
} from '@bomb-squad/shared';
import { clickMesh, readBomb, waitForBomb, waitForMesh } from '../helpers/canvas.js';
import { generateSandboxModule, inspectorRow } from '../helpers/sandbox.js';

/** The unique listed word spellable from these columns (generation guarantees one). */
function targetWord(data: PasswordsState): string {
  const word = PASSWORD_WORDS.find((w) =>
    [...w].every((ch, i) => data.columns[i]?.includes(ch)),
  );
  if (!word) throw new Error('no spellable listed word — generation invariant broken');
  return word;
}

/** Cycle one column (up) until its shown letter equals `letter`, waiting each step. */
async function cycleColumnTo(
  page: import('@playwright/test').Page,
  columnIndex: number,
  letter: string,
) {
  for (let guard = 0; guard < 7; guard++) {
    const d = (await readBomb(page)).modules[0]!.data as PasswordsState;
    if (d.columns[columnIndex]![d.positions[columnIndex]!] === letter) return;
    // Wait for the EXACT next index — any-change would let a double-fired CYCLE
    // skip a letter and exhaust the guard with a misleading "never reached".
    const next = (d.positions[columnIndex]! + 1) % d.columns[columnIndex]!.length;
    await clickMesh(page, `m0-pass-up-${columnIndex}`);
    await waitForBomb(
      page,
      (b) => (b.modules[0]!.data as PasswordsState).positions[columnIndex] === next,
    );
  }
  throw new Error(`column ${columnIndex} never reached "${letter}"`);
}

test('passwords: a wrong SUBMIT strikes (columns untouched); spelling a listed word solves', async ({
  page,
}) => {
  const data = await generateSandboxModule<PasswordsState>(page, 'passwords', '7');
  await waitForMesh(page, 'm0-pass-submit');

  const word = targetWord(data);

  // Set columns 0..3 to the target letters, but column 4 to a WRONG letter — the
  // shown word then differs from the ONLY spellable listed word in one position,
  // so it is provably NOT a valid word (count-spellable == 1 ⇒ no other listed
  // word is reachable from these columns).
  for (let i = 0; i < 4; i++) await cycleColumnTo(page, i, word[i]!);
  const wrongLetter = data.columns[4]!.find((ch) => ch !== word[4]);
  // Guard the seed assumption: if column 4's fillers all rolled the target
  // letter, fail here honestly instead of via a misleading cycle exhaustion.
  expect(wrongLetter, 'column 4 must offer a non-target letter').toBeTruthy();
  await cycleColumnTo(page, 4, wrongLetter!);

  const beforeSubmit = (await readBomb(page)).modules[0]!.data as PasswordsState;
  expect(isValidPassword(currentWord(beforeSubmit)), 'the pre-submit word must be invalid').toBe(
    false,
  );

  // Wrong SUBMIT → strike; columns/positions are left exactly as they were.
  await clickMesh(page, 'm0-pass-submit');
  await expect(inspectorRow(page, 'strikes')).toHaveText('1');
  const struck = await waitForBomb(page, (b) => b.strikes === 1);
  expect(
    (struck.modules[0]!.data as PasswordsState).positions,
    'a wrong SUBMIT must not move the columns',
  ).toEqual(beforeSubmit.positions);

  // Fix the last column to the target letter → the shown word is now listed.
  await cycleColumnTo(page, 4, word[4]!);
  const ready = (await readBomb(page)).modules[0]!.data as PasswordsState;
  expect(currentWord(ready)).toBe(word);

  // Correct SUBMIT → solved.
  await clickMesh(page, 'm0-pass-submit');
  await expect(inspectorRow(page, 'status')).toHaveText('solved');
  await expect(inspectorRow(page, 'bomb.solved')).toHaveText('true');
});
