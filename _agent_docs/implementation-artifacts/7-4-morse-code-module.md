---
baseline_commit: d8e27bd7bf83595a3b6c3c9a7ab8a530dd17b880
---

# Story 7.4: Morse Code Module

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a team,
I want to defuse the Morse Code module,
so that we solve a timing-interpretation module by decoding a flashing word to a frequency.

## Acceptance Criteria

1. **Word-level decode → frequency lookup (the crux).** A lamp flashes a word in Morse code on a loop (short flash = dot, long flash = dash, long gap between letters, very long gap before the word repeats). The Expert decodes the **full word** and looks it up in the manual's 16-row word → frequency table — the lookup is word → frequency, NOT character-by-character → frequency (`project-context.md` gotcha line 219; FR31; `gdd.md#Module 6`). The module itself never accepts per-letter input; its only inputs are the dial and TX.

2. **Dial + TX solve/strike semantics.** The Defuser steps a frequency dial through the 16 listed frequencies (3.505–3.600 MHz) via up/down controls and presses TX (single click — FR20 names "Morse = click TX"). TX on the frequency matching the transmitted word → `status: 'solved'`. TX on any other frequency → transient `'struck'` (rolled up to a team strike by the bomb reducer) with the **dial position preserved** — no progress reset (contrast Memory 7.3). Dial steps at the ends clamp (no wrap, no strike, state returned unchanged).

3. **Deterministic generation from the seed.** `generate(seed, ctx)` draws the word uniformly from the manual's 16 words using `makeSeededRng(seed)` only, and a starting dial index that is **never the answer index** (no born-solved blind-TX — complicated-wires 7.1 precedent), all deterministic in the seed. The correct frequency is computed at TX-time from `MORSE_TABLE[word]` — **never stored in state** (Sprint-2 retro AI1).

4. **Manual pages from the same constants.** `getManualPages()` renders (a) an interpretation intro (dot/dash/gaps/loop), (b) the full Morse chart (A–Z, 0–9), and (c) the 16-row word → frequency table — all generated from the same `MORSE_ALPHABET` / `MORSE_TABLE` constants the solver uses (single source of truth; a transcription typo fails both).

5. **Client rendering: looping flash + dial + TX, 60fps-safe.** The DefuserView drives the flashing lamp exclusively from `useFrame` (never `setInterval`), with the flash timeline precomputed once per word (no per-frame allocations — 7.2 review lesson). The flash loop does **NOT restart when the dial moves** (deliberate divergence from Simon's reset-on-any-data-change — see Dev Notes). Frequency readout shows the selected value (e.g. `3.505 MHz`). Flash rate stays under 3 flashes/second (photosensitivity floor); `prefers-reduced-motion` slows the tempo uniformly (preserving the dot:dash ratio) but keeps discrete on/off steps. Solved → lamp quiescent + interactions gated (7.2 review's solved-quiescent pattern).

6. **Reducer test suite.** Covers happy / wrong / idempotent / immutable / guard / reset, **plus**: all 16 word→frequency cells asserted against an INDEPENDENTLY hard-coded expectation (7.1/7.2 pattern); dial clamp at both ends; wrong-TX preserves the dial; `generate` determinism (same seed → `toEqual`), a never-born-solved sweep, and a `Math.random`-throws guard.

7. **Additive registration, no core edits.** `morse-code` is registered in all three places (generator, reducer, tier pool) in one commit; `bombReducer.ts`, `moduleHandlers.ts`, and the client interaction/dispatch/registry primitives are untouched. A Hard-tier default round can draw and solve the module without `generateLayout` throwing. This completes the Hard tier — with it, **every Hard module is generatable** and the unregistered-id test fixtures must move to an Epic-6 id (see Task 8).

## Tasks / Subtasks

- [x] **Task 0 — Sequencing gate: confirm 7.3 (Memory) has landed** (AC: 7)
  - [x] Story 7.3 is `in-progress` in this worktree and its Task 8 repoints the "unregistered id" test fixtures from `'memory'` to `'morse-code'`. Do not start until the memory commit is in; then `grep -rn "morse-code" packages/shared/src apps/server/src` and confirm the four fixtures (layout / assembleBomb / initializeRoundBombs / moduleRegistration) currently use `'morse-code'` as the unregistered example. If 7.3 somehow did NOT land first, its fixture repoints become part of this story's Task 8 instead (repoint whatever id they hold to `'keypads'`).

- [x] **Task 1 — Shared module: types** (AC: 1,2,3) — `packages/shared/src/modules/morse-code/types.ts`
  - [x] `export const MORSE_CODE_MODULE_ID = 'morse-code';` (id already reserved in `MODULE_IDS` at `registry.ts:86`; display label already in `RoundConfigPanel.tsx:55`).
  - [x] `export const MORSE_WORDS = ['shell','halls','slick','trick','boxes','leaks','strobe','bistro','flick','bombs','break','brick','steak','sting','vector','beats'] as const;` and `export type MorseWord = (typeof MORSE_WORDS)[number];` — transcribe EXACTLY from Dev Notes → *Word → frequency table* (order = ascending frequency).
  - [x] **Frequencies are integer kHz** (3505..3600), never floats — TX correctness is an equality check and float literals invite epsilon bugs. `export const MORSE_FREQUENCIES: ReadonlyArray<number>` = the 16 kHz values ascending (the dial's positions). `export function formatMorseFrequency(khz: number): string` → `'3.505 MHz'` (`(khz / 1000).toFixed(3) + ' MHz'`) — used by DefuserView AND manual so display can't drift.
  - [x] `MorseCodeState`: `readonly word: MorseWord` (the transmitted word — the physical observable, flashed to the Defuser; see Dev Notes → *Why storing the word is not an answer leak*), `readonly freqIndex: number` (0..15, current dial position), `readonly initialFreqIndex: number` (generate-time start, kept so `MODULE_RESET` can restore it). **No `ctx`** — Morse Code depends on neither serial nor strike count (like Memory 7.3, unlike Simon 7.2): no `BombContext` stored, no handler change.
  - [x] `export type MorseCodeAction = { type: 'FREQ_UP' } | { type: 'FREQ_DOWN' } | { type: 'TX' };` and `export type MorseCodeReset = { type: 'MODULE_RESET' };`.
  - [x] `export function isMorseCodeAction(action: unknown): action is MorseCodeAction | MorseCodeReset` — runtime guard (untrusted input): accept `MODULE_RESET`, `FREQ_UP`, `FREQ_DOWN`, `TX` by `type` string. Must tolerate extra fields — the `MODULE_INTERACT` handler stamps `strikeCount` onto every action (`moduleHandlers.ts:173-186`); structural type-checks pass, do not reject unknown keys. Mirror `isWiresAction` / `isSimonSaysAction` shape.

- [x] **Task 2 — Shared module: Morse alphabet + lookup (the single source of truth)** (AC: 1,4,6) — `packages/shared/src/modules/morse-code/solve.ts`
  - [x] `export const MORSE_ALPHABET: Readonly<Record<string, string>>` — A–Z and 0–9 → dot/dash strings (`'a': '.-'`, …) — transcribe from the standard chart (manual p.12 shows the same International Morse chart). The 16 words use letters only, but ship the full chart: the Expert reads it while decoding arbitrary letters.
  - [x] `export const MORSE_TABLE: Readonly<Record<MorseWord, number>>` — word → frequency in kHz, all 16 rows transcribed EXACTLY from Dev Notes → *Word → frequency table* (verified identical: `gdd.md#Module 6` == KTANE manual p.12). Invariant (assert in tests): `Object.values(MORSE_TABLE)` sorted == `MORSE_FREQUENCIES`, and every `MorseWord` has an entry.
  - [x] `export function morsePatternForWord(word: string): ReadonlyArray<string>` — per-letter dot/dash codes (e.g. `'shell'` → `['...', '....', '.', '.-..', '.-..']`). Pure; consumed by the client flash renderer and by tests. Throws on a character missing from the alphabet (generation only ever passes listed words, so this is a programmer-error guard, not a runtime path).
  - [x] `export function correctFreqIndex(word: MorseWord): number` — `MORSE_FREQUENCIES.indexOf(MORSE_TABLE[word])`. Used by the reducer at TX-time and by `generate`'s born-solved avoidance. Never persisted.

- [x] **Task 3 — Shared module: generator** (AC: 3,6) — `packages/shared/src/modules/morse-code/generate.ts`
  - [x] `export function generateMorseCode(seed: number, _ctx: BombContext): MorseCodeState` using `makeSeededRng(seed)` ONLY. Draw `word = MORSE_WORDS[Math.floor(rng() * MORSE_WORDS.length)]`. Draw the start index from the 15 non-answer positions: `const answer = correctFreqIndex(word); const d = Math.floor(rng() * (MORSE_FREQUENCIES.length - 1)); const start = d >= answer ? d + 1 : d;` — deterministic, never born-solved (a blind TX at spawn can never solve; complicated-wires 7.1 precedent, cheaper than its re-roll loop because the draw space is index-shaped). Return `{ word, freqIndex: start, initialFreqIndex: start }`. `_ctx` accepted for signature conformance, unused and not stored.

- [x] **Task 4 — Shared module: reducer** (AC: 2,6) — `packages/shared/src/modules/morse-code/reducer.ts`
  - [x] `export const morseCodeReducer: Reducer<ModuleState<MorseCodeState>, unknown>`. Contract obligations (copy the wires/memory structure):
    - [x] `if (!isMorseCodeAction(action)) return state;` (guard, never throw).
    - [x] `MODULE_RESET` → `{ ...state, status: 'armed', data: { ...data, freqIndex: data.initialFreqIndex } }` (word unchanged — the transmission is physical, fixed at generate).
    - [x] Solved-inert: `if (state.status === 'solved') return state;` (defense-in-depth; sandbox drives the reducer directly).
    - [x] `FREQ_UP`: if `freqIndex === MORSE_FREQUENCIES.length - 1` → `return state` (clamp, same ref); else `freqIndex + 1`, status stays `'armed'`. `FREQ_DOWN` mirror at 0. Dial movement is never a strike.
    - [x] `TX`: `data.freqIndex === correctFreqIndex(data.word)` → `{ ...state, status: 'solved', data }`. Else → `{ ...state, status: 'struck', data }` — **`freqIndex` preserved** (no reset; the bomb reducer rolls `'struck'` into a team strike and re-arms, preserving the returned `data` — `bombReducer.ts:29-33`).
    - [x] No `Date.now()`/`Math.random()`/I/O; never mutate input (spread/new objects); ignore the stamped `strikeCount` field.

- [x] **Task 5 — Shared module: manual** (AC: 1,4) — `packages/shared/src/modules/morse-code/manual.ts`
  - [x] `export function getMorseCodeManualPages(): ManualPage[]` with `chapterId: MORSE_CODE_MODULE_ID`, `chapterTitle: 'Morse Code'`. Sections:
    - [x] Intro `content`: how to interpret — short flash = dot, long flash = dash, long gap between letters, very long gap before the word repeats; identify the FULL word (the table is word → frequency, not letter → frequency), then set the dial and press TX. Add the decode tip: several words differ only in their first letters (`slick`/`trick`/`brick`/`flick`, `break`/`steak`/`beats`) — use the long repeat-gap to find the word start before committing.
    - [x] Morse chart as `ManualTable`(s) rendered FROM `MORSE_ALPHABET` (headers `['Character', 'Code']`; render dots/dashes as `.` / `-` strings — the manual system is text-only, `ManualTable = headers + string[][]`, no images).
    - [x] Frequency table rendered FROM `MORSE_TABLE` via `formatMorseFrequency` (headers `['If the word is', 'Respond at frequency']`, 16 rows ascending).
  - [x] Mirror `getWiresManualPages()` / `getSimonSaysManualPages()` shape. Never hardcode a second copy of any table.

- [x] **Task 6 — Shared module: barrel + generator registry + tier pool** (AC: 7) — one commit with Task 7
  - [x] `packages/shared/src/modules/morse-code/index.ts`: assemble `MORSE_CODE_MODULE: IModule<MorseCodeState, unknown>` = `{ id: MORSE_CODE_MODULE_ID, generate: generateMorseCode, reduce: morseCodeReducer, getManualPages: getMorseCodeManualPages }` and re-export the public surface.
  - [x] `packages/shared/src/modules/index.ts`: `export * from './morse-code/index.js';`.
  - [x] `packages/shared/src/modules/registry.ts`: add `[MORSE_CODE_MODULE_ID]: generateMorseCode as ModuleGenerator` to `MODULE_GENERATORS` (import from `./morse-code/generate.js` + `./morse-code/types.js` **directly**, not the barrel — explicit design note at `registry.ts:9-11`). Add `'morse-code'` to `TIER_POOLS.hard` ONLY (easy/medium untouched; `TIER_CATALOG.hard` is already `[...MODULE_IDS]`, no edit).

- [x] **Task 7 — Server reducer registry** (AC: 7) — `apps/server/src/reducers/MODULE_REDUCERS.ts`
  - [x] Add `[MORSE_CODE_MODULE_ID]: morseCodeReducer as ModuleReducer` (both imported from `@bomb-squad/shared`). Do **not** edit `bombReducer.ts`. **No `moduleHandlers.ts` change** — Morse Code takes no live bomb value (the existing module-agnostic `strikeCount` stamp is harmlessly ignored, same as Memory).

- [x] **Task 8 — Repoint the "unregistered id" fixtures to `'keypads'`** (AC: 7)
  - [x] Registering `morse-code` exhausts the Hard tier — the fail-loud "unregistered id" fixtures (repointed 7.2→`memory`→7.3→`morse-code`) flip a third time. Repoint each to **`'keypads'`** (Story 6.1, Epic 6 — backlog, the next planned still-unregistered id in `MODULE_IDS`) and update the comment/story reference:
    - `packages/shared/src/generation/__tests__/layout.test.ts` — `toThrow(/unregistered id "keypads"/)` on `generateLayout(1, 3, ['keypads'])`.
    - `packages/shared/src/generation/__tests__/assembleBomb.test.ts` — `generateRoundBombs(..., config({ modulePool: ['keypads'] }))` throws.
    - `apps/server/src/round/__tests__/initializeRoundBombs.test.ts` — same repoint.
    - `apps/server/src/reducers/__tests__/moduleRegistration.test.ts` — the rogue-rebind example id switches to `'keypads'`.
  - [x] `packages/shared/src/modules/__tests__/tierGating.test.ts` — widen the generatable-subset assertion (sorted) to `['complicated-wires', 'memory', 'morse-code', 'passwords', 'simon-says', 'the-button', 'wires']` and update the `it(...)` title (verify `'memory'` is present per 7.3's edit before adding `'morse-code'`).
  - [x] **Add** a positive registration assertion in `moduleRegistration.test.ts`: `'morse-code'` present in `MODULE_REDUCERS`; a dial-to-correct-frequency + TX solve AND a wrong-TX strike (dial preserved) round-trip through the untouched `createBombReducer(registry)`.

- [x] **Task 9 — Client module** (AC: 2,5) — `apps/client/src/modules/morse-code/`
  - [x] Re-export files (`types.ts`/`generate.ts`/`solve.ts`/`reducer.ts`) that `export … from '@bomb-squad/shared'` — never duplicate logic.
  - [x] `DefuserView.tsx` (R3F, **rendering only**, zero game logic):
    - [x] **Flashing lamp** — one mesh whose `MeshStandardMaterial.emissiveIntensity` is driven inside `useFrame` from a clock ref (copy Simon 7.2's playback architecture: timing consts, `clock` ref, materials refs, no React state, no per-frame allocations). Build the timeline **once per word** with `useMemo`: from `morsePatternForWord(word)`, flatten to cumulative on/off segments using standard Morse units — dot = 1 unit on, dash = 3 on, intra-letter gap = 1 off, letter gap = 3 off, word (repeat) gap = 7 off — with `UNIT ≈ 0.25s` (worst-case flash cadence = 1 dot + 1 gap = 0.5 s → 2 flashes/sec, under the 3/sec photosensitivity floor; keep `UNIT ≥ 0.17s`). Each frame: `local = clock % totalLoop`, scan segments for on/off (cache a segment-index ref advancing monotonically, reset on wrap — no `.find()` allocation per frame).
    - [x] **CRITICAL divergence from Simon 7.2:** do NOT reset playback on every `data` reference change — the store hands a fresh `data` object on every `MODULE_UPDATE`, and for Morse the dial moves on every FREQ_UP/DOWN click. Restarting the transmission on a dial click would garble mid-word decoding. Track `word` (a primitive) in a ref and reset the clock only when `word` changes or on mount; when `status === 'solved'`, stop playback and hold the lamp dark + gate clicks (7.2 review's solved-quiescent pattern).
    - [x] `prefers-reduced-motion` → scale `delta` uniformly (e.g. ×0.6, Simon precedent) — uniform scaling preserves the dot:dash ratio, never drop the discrete on/off steps.
    - [x] **Frequency readout** — drei `<Text font="/fonts/DSEG7Classic-Regular.ttf">` showing `formatMorseFrequency(MORSE_FREQUENCIES[freqIndex])` (the LCD look; TimerLcd precedent); static labels with `/fonts/jetbrains-mono-700.ttf`.
    - [x] **Controls** — up/down arrow buttons and a TX button, each via `moduleClickHandlers(...)` → `dispatchModuleAction(moduleIndex, { type: 'FREQ_UP' | 'FREQ_DOWN' | 'TX' })` (single-click per FR20 — `interaction.ts:46` already names "Morse TX" as the click gesture). No keyboard listeners (UX-DR13). Optional press feedback (depress/brighten) mirrors Simon — presentation only.
    - [x] Read state via a memoized `moduleIndex`-scoped selector (`useMemo(() => selectMorseData(moduleIndex), [moduleIndex])`, mirror `selectSimonData`).
  - [x] `ManualPages.tsx` — typed renderer of `getMorseCodeManualPages()` (mirror wires/simon-says).
  - [x] `index.ts` — `MORSE_CODE_MODULE` IModule binding + `registerModuleRenderer({ id: MORSE_CODE_MODULE_ID, DefuserView: MorseCodeDefuserView })`.
  - [x] `apps/client/src/modules/index.ts` — import + add to `SANDBOX_MODULES` + export.
  - [x] `apps/client/src/manual/devManualFixtures.ts` — replace `stub('morse-code', 'Morse Code')` (line ~55) with `...getMorseCodeManualPages()` and add the import.
  - [x] `apps/client/src/modules/__tests__/morseCodeBinding.test.ts` (vitest) — renderer registered, IModule complete (`getManualPages()[0].chapterId === MORSE_CODE_MODULE_ID`; chart + frequency tables present), listed in `SANDBOX_MODULES`.

- [x] **Task 10 — Full verification**
  - [x] `pnpm -r typecheck` clean (all 4 workspaces); `pnpm -r test` green (shared/server/client), including the new morse-code suite (all 16 table cells vs an independent expectation, alphabet spot-checks vs independently hard-coded codes, clamp/preserve-dial/never-born-solved/determinism).
  - [x] **Jay verifies interactively (human-verification AC rule — story is not done until his observed result is in Completion Notes):** in `/dev/sandbox`, generate a Morse Code module; confirm (a) the lamp flashes a looping pattern with legible dot/dash/letter-gap/word-gap distinctions; (b) decoding via `/dev/manual`'s chart and looking the word up, dialing to the listed frequency, and pressing TX solves the module; (c) TX on a wrong frequency records a strike AND leaves the dial where it was (no reset, transmission keeps looping without restarting); (d) dial clicks do NOT restart the flash loop mid-word; (e) dial clamps at 3.505 and 3.600 with no strike; (f) a Hard-tier live round (Facilitator picks Hard) can draw and solve Morse Code end-to-end.

### Review Findings

- [x] [Review][Patch] Independent alphabet expectation misses letters `m` and `n` — `bombs` uses `m`, `sting` uses `n`, but `EXPECTED_CODES` covers neither, and no other assertion (shape regex, `shell`/`beats` pattern checks) contains them; a transcription typo in `MORSE_ALPHABET['m']`/`['n']` would pass every test and silently garble two words' transmissions. Violates the story's own testing standard ("every letter used by the 16 words"). Add `m: '--'`, `n: '-.'` to `EXPECTED_CODES` and a `morsePatternForWord('bombs')`/`('sting')` assertion. [packages/shared/src/modules/morse-code/__tests__/morse-code.test.ts]
- [x] [Review][Patch] Duplicate React keys in manual table header row — `headers.map((h) => <th key={h}>)` with the Morse chart's `['Character','Code','Character','Code']` produces duplicate sibling keys; key by index. [apps/client/src/modules/morse-code/ManualPages.tsx:20]
- [x] [Review][Patch] Dial clamp uses strict equality, not a range check — an out-of-band `freqIndex` (e.g. corrupted Redis state: 16, or 0.5) never hits `=== 15`/`=== 0` and walks unboundedly; LCD then renders `NaN MHz` and TX can never solve. Use `>=`/`<=` clamps so the reducer is self-healing. [packages/shared/src/modules/morse-code/reducer.ts:45,50]
- [x] [Review][Patch] Story record corrections — File List omits the modified `sprint-status.yaml`; and the claim "frequency readout re-renders only on `freqIndex` change via the memoized selector" overstates: `selectMorseModule` selects the whole module envelope, so any `MODULE_UPDATE` for this module re-renders the view (matches the sibling pattern and is fine — fix the wording, not the code). [_agent_docs/implementation-artifacts/7-4-morse-code-module.md]
- [x] [Review][Defer] Client can forge `{type:'MODULE_RESET'}` through MODULE_INTERACT — the handler forwards the payload verbatim and every module guard accepts `MODULE_RESET`, so an armed module executes a lifecycle reset on client demand. Benign for Morse (self-sabotage only) but materially harmful on Memory (progress wipe). Fix belongs in `moduleHandlers.ts` (reject `MODULE_RESET` in client payloads), not per-module. [apps/server/src/handlers/moduleHandlers.ts:181] — deferred, pre-existing systemic pattern (since 7.2/7.3)
- [x] [Review][Defer] `prefers-reduced-motion` sampled once per mount — toggling the OS setting mid-round has no effect until remount; identical pattern in Simon 7.2 and Memory 7.3, but Morse is the photosensitivity-relevant module. Fix as a pattern-level sweep (hold the MediaQueryList, read `.matches` per frame or subscribe). [apps/client/src/modules/morse-code/DefuserView.tsx:115] — deferred, pre-existing pattern
- [x] [Review][Defer] A malformed `word` in a store snapshot throws inside `useMemo` (`morsePatternForWord`) during render and crashes the whole R3F canvas — no error boundary exists in the module render path; reducer-side input is guarded but render-side trusts store data. Architectural: add a module-level error boundary, not a per-module try/catch. [apps/client/src/modules/morse-code/DefuserView.tsx:109] — deferred, pre-existing architectural gap shared by all modules

## Dev Notes

### The module in one paragraph

Morse Code is the LAST Hard module (completes Epic 7's pool). The server generates a word (1 of 16); the client flashes it in Morse on a loop (pure presentation — the flash timeline derives from the word); the Expert decodes the **full word** (gotcha line 219: word → frequency lookup, never per-character) and reads its frequency off the manual table; the Defuser dials to that frequency and clicks TX. Correct → solved; wrong → strike with the dial left in place. It is the simplest Hard-module reducer (a clamp counter + one equality check) — the genuine work is the client flash playback and the test-fixture endgame (Task 8).

### Why storing the word is not an answer leak (vs Sprint-2 AI1)

The wires AI1 leak was an **extra stored field** (`shouldCut`) the client never needed. Here `word` IS the physical observable — the client cannot flash the lamp without it, exactly as wires' colours or Memory's displays ship to the client. Yes, a cheating client could decode it programmatically; that is inherent to the module (the observable is the encoded answer) and is true of every module whose manual is public. The line we hold: the **frequency** (the actual answer) is computed at TX-time via `correctFreqIndex(word)` and never persisted; the server validates TX authoritatively; `initialFreqIndex` reveals only a position that is NOT the answer. No extra derived-answer field ever crosses the wire.

### Integer kHz, not float MHz (the one representation trap)

TX correctness is `MORSE_FREQUENCIES[freqIndex] === MORSE_TABLE[word]`. Store frequencies as integers (3505..3600 kHz) so this is exact integer equality; format for display only via `formatMorseFrequency`. Never write `3.505` as a literal anywhere in logic.

### Word → frequency table (transcribe EXACTLY — AC #1/#6)

Verified identical: `gdd.md#Module 6` (lines 327–343) == KTANE manual p.12 (`docs/…v1.pdf`). Encode as `MORSE_TABLE` (kHz); the manual and dial render from it.

| Word | kHz | | Word | kHz |
|---|---|---|---|---|
| shell | 3505 | | flick | 3555 |
| halls | 3515 | | bombs | 3565 |
| slick | 3522 | | break | 3572 |
| trick | 3532 | | brick | 3575 |
| boxes | 3535 | | steak | 3582 |
| leaks | 3542 | | sting | 3592 |
| strobe | 3545 | | vector | 3595 |
| bistro | 3552 | | beats | 3600 |

Test the 16 cells against an INDEPENDENTLY hard-coded expectation array (7.1's `EXPECTED` tuple pattern) so a transcription typo fails loudly rather than propagating into both solver and manual.

### Flash playback: copy Simon's architecture, NOT its reset trigger

Simon 7.2's `DefuserView` is the template — `useFrame` + clock ref + modulo-loop + emissive mutation, zero React state, zero per-frame allocations (its review specifically removed per-frame slices). **But Simon resets playback on ANY `data` reference change** (deliberate, Jay-verified: a press/strike should restart its sequence). For Morse that trigger is wrong: every FREQ_UP/DOWN produces a fresh `data` object, and restarting the transmission on a dial click would make mid-word decoding impossible. Reset only when the **`word` primitive** changes (compare in a ref) or on mount; keep looping across dial moves and even across a wrong-TX strike (the physical lamp doesn't care). Stop and hold dark when solved. Put a comment on the reset condition explaining this divergence so a reviewer doesn't "fix" it back to the Simon pattern.

Morse timing (standard, encode as named consts): dot = 1 unit ON, dash = 3 ON, symbol gap = 1 OFF, letter gap = 3 OFF, repeat gap = 7 OFF. `UNIT ≈ 0.25 s` keeps worst-case cadence at 2 flashes/s (photosensitivity floor is 3/s — do not go below `UNIT = 0.17 s`). Precompute the word's cumulative on/off segment boundaries once per word (`useMemo`); per frame do a ref-cursor scan, not `Array.find`.

### Reducer semantics (all decisions made — implement as written)

- **Dial:** `FREQ_UP`/`FREQ_DOWN` clamp at indices 0 / 15 — at-bound returns `state` unchanged (same ref; idempotent no-op, never a strike). No wrap (the physical dial has ends; manual table is a bounded band).
- **Wrong TX:** transient `'struck'`, `data` returned as-is (dial preserved). The bomb reducer rolls `'struck'` → team strike and re-arms, preserving returned data (`bombReducer.ts:29-33`). NO progress reset — Morse has no progress to lose (contrast Memory's reset-to-stage-1).
- **`MODULE_RESET`:** `status: 'armed'`, `freqIndex: initialFreqIndex`, `word` unchanged (the transmission is fixed at generate — deterministic replay, same rationale as Memory's fixed stages).
- **Solved:** inert to all further actions (same-ref return).
- **`strikeCount` stamp:** arrives on every action from `moduleHandlers.ts:181` — the guard must tolerate it and the reducer ignores it. Do not add any handler code.

### The three-registration gotcha (or ROUND_START throws)

All three in one commit or `generateLayout` throws when a Hard round starts (validates the whole pool — `module-registry-two-registries-and-tier-pools` memory):
1. **Generator** — `MODULE_GENERATORS` in `packages/shared/src/modules/registry.ts` (Task 6).
2. **Reducer** — `apps/server/src/reducers/MODULE_REDUCERS.ts` (Task 7).
3. **Tier pool** — `TIER_POOLS.hard` in the same registry (Task 6).

Already in place, no edits needed: `MODULE_IDS` entry (`registry.ts:86`), `TIER_CATALOG.hard` (`[...MODULE_IDS]`), `RoundConfigPanel.tsx:55` label `'morse-code': 'Morse Code'`. The dashboard Hard chip flips selectable the moment the generator exists (`TIER_CATALOG[tier] ∩ keys(MODULE_GENERATORS)`).

### Fixture-chain endgame (Task 8 — the recurring mechanical hazard, third rotation)

The fail-loud "unregistered id" fixtures have rotated `simon-says` (7.1-era) → `memory` (7.2's Task 9) → `morse-code` (7.3's Task 8). Registering `morse-code` turns them red again. This time the Hard tier is exhausted, so the repoint target leaves the epic: **`'keypads'`** (Story 6.1; Epic 6 is backlog so it stays unregistered until that sprint, which will inherit this same task). All four Hard modules generatable is the new `tierGating` expectation. Run the full suite BEFORE claiming done — these are pre-existing tests that go red on registration.

### Sequencing dependency on 7.3 (Task 0)

7.3 (Memory) is `in-progress` in THIS worktree right now — `packages/shared/src/modules/memory/` exists untracked and the registry/fixture files carry uncommitted 7.3 edits. 7.4 must start from 7.3's landed commit: it edits the same registry lines, the same fixture files, and assumes the fixtures already say `'morse-code'`. The baseline_commit above predates 7.3's landing; treat 7.3's commit as the real base.

### Module plugin contract (the pattern to copy)

- **Pure logic in `packages/shared/src/modules/morse-code/`**; client dir re-exports [Source: `game-architecture.md` Pattern 3; `project-context.md#Code Organization Rules`]. Closest templates: **`memory` (7.3)** — identical no-ctx/no-handler shape, freshest; **`simon-says` (7.2)** — the flash-playback DefuserView; **`wires` (5.3)** — cleanest baseline.
- **`ModuleState<S>` envelope:** `{ moduleId, status: 'armed'|'solved'|'struck', data: S }`; `'struck'` transient [Source: `packages/shared/src/types/module.ts:23-33`].
- **`IModule`:** `{ id, generate(seed,ctx), reduce, getManualPages() }` [Source: `packages/shared/src/types/module.ts:35-50`].
- **Actions arrive as `unknown`** — guard first, never throw; `MODULE_RESET` is forwarded whole (bypasses the bomb reducer's solved-inert guard) and must be handled.
- **Manual is structured text only** — `ManualTable = { headers: string[], rows: string[][] }`, no images/JSX; dots/dashes render as `.`/`-` characters [Source: `packages/shared/src/types/module.ts:4-21`].
- **Seeding:** `makeSeededRng(seed)` (mulberry32) from `packages/shared/src/seeding/` — the ONLY randomness source; no shuffle helper exists, inline index draws are the convention (simon-says `generate.ts:22`).

### Source tree — files to touch

**New (shared):** `packages/shared/src/modules/morse-code/{types,generate,solve,reducer,manual,index}.ts` + `__tests__/morse-code.test.ts`.
**New (client):** `apps/client/src/modules/morse-code/{index.ts,DefuserView.tsx,ManualPages.tsx,types.ts,generate.ts,solve.ts,reducer.ts}` + `__tests__/morseCodeBinding.test.ts`.
**Modified (append-only unless noted):** `packages/shared/src/modules/index.ts`; `packages/shared/src/modules/registry.ts`; `apps/server/src/reducers/MODULE_REDUCERS.ts`; `apps/client/src/modules/index.ts`; `apps/client/src/manual/devManualFixtures.ts` (stub swap, line ~55); the five Task-8 fixture repoints/widenings.
**Never touch (open/closed):** `apps/server/src/reducers/bombReducer.ts`; `apps/server/src/handlers/moduleHandlers.ts`; `apps/client/src/modules/{interaction,dispatch,registry}.ts`; `RoundConfigPanel.tsx`; stores; scenes; `net/`; Docker.

### Testing standards

- **Reducer/generate/solve** — Jest, co-located `__tests__/`, zero infrastructure. Required taxonomy: happy (dial to answer via steps + TX → solved) / wrong (TX off-answer → transient `'struck'`, `freqIndex` preserved) / idempotent (post-solve TX/FREQ → same ref; at-bound step → same ref) / immutable (frozen `data` — no throw, unchanged) / guard (malformed `[undefined, null, 42, 'TX', {}, {type:'X'}]` → same ref; `TX` with stamped `strikeCount` accepted) / reset (`MODULE_RESET` → `freqIndex === initialFreqIndex`, `'armed'`, word unchanged). **Plus:** 16-cell table sweep vs an independent expectation; `MORSE_FREQUENCIES` ascending + bijective with `MORSE_TABLE` values; alphabet spot-checks vs independently hard-coded codes (at minimum every letter used by the 16 words, plus digits); `morsePatternForWord('shell')`-style pattern assertions; clamp at both ends; never-born-solved sweep (seeds 0–299: `initialFreqIndex !== correctFreqIndex(word)`); determinism (same seed → `toEqual`, different seeds differ); `Math.random`-throws guard.
- **Client `DefuserView`** — rendering only; binding test + optional visual regression. If it needs a logic test, logic has leaked — move it to the reducer.
- **Server registration** — extend `moduleRegistration.test.ts` (Task 8): presence + solve/strike round-trips through the untouched `createBombReducer`.

### Project Structure Notes

Aligns with the established per-module layout (`project-context.md#Code Organization Rules`, `game-architecture.md` Pattern 3). Like Memory (7.3) and unlike Simon (7.2), zero change outside the module directory + registries/barrels/fixtures — no handler seam, no ctx. The only structural novelties are presentation-side (flash timeline memo; word-keyed playback reset) and are confined to `DefuserView.tsx`.

### Project Context Rules

- **Pure reducers** — zero framework imports; no `Date.now()`/`Math.random()`/`setTimeout`; randomness only in `generate(seed)`. [`project-context.md#Critical Don't-Miss Rules`]
- **Server-authoritative, client untrusted** — TX validated server-side from module state; dial bounds-checked; the answer never stored nor taken from the client. [`project-context.md#Security`]
- **Modules are plugins** — directory + registry entries; never edit `bombReducer.ts`/`moduleHandlers.ts`. [`project-context.md#Code Organization Rules`]
- **Naming** — id `morse-code`; `MorseCodeState`; `MorseCodeAction`; `morseCodeReducer` export. [`project-context.md#Naming Conventions`]
- **R3F** — `useFrame` only (never `setInterval`); no per-frame allocations; no reactive store reads in the loop; dispose is R3F-managed for primitives created in JSX. [`project-context.md#React / R3F Gotchas`]
- **Morse-specific gotcha (line 219)** — lookup is word → frequency, NOT character-by-character decode → frequency; the full word must be decoded first. Bake this into the manual intro wording.
- **60fps** — flash driving is one material-intensity write per frame off a precomputed timeline; the view re-renders only on this module's own `MODULE_UPDATE`s (the memoized selector returns the module envelope — sibling pattern), never on other modules' traffic or per frame. [`project-context.md#Performance Rules`]

### References

- [Source: `_agent_docs/planning-artifacts/epics.md#Story 7.4: Morse Code Module`] — acceptance criteria; FR20 (click TX), FR31 (word-level decode).
- [Source: `_agent_docs/planning-artifacts/gdds/gdd-Ktane-2026-06-09/gdd.md#Module 6: Morse Code`] — canonical description + word/frequency table (lines 327–343); timer 90–150 s (line 607).
- [Source: `docs/KeepTalkingAndNobodyExplodes-BombDefusalManual-v1.pdf` p.12] — "On the Subject of Morse Code" (verified identical to the GDD table); interpretation rules; A–Z/0–9 chart.
- [Source: `_agent_docs/implementation-artifacts/7-3-memory-module.md`] — freshest template (no-ctx module, fixture-chain Task 8 pattern); MUST land before this story (Task 0).
- [Source: `apps/client/src/modules/simon-says/DefuserView.tsx`] — the flash-playback architecture (`flashAt`, clock ref, emissive mutation, reduced-motion, solved-quiescent) — copy the mechanics, change the reset trigger (word-keyed, not data-keyed).
- [Source: `packages/shared/src/modules/registry.ts`] — `MODULE_GENERATORS` (~line 66), `TIER_POOLS.hard` (line 119), `MODULE_IDS` (`morse-code` at line 86), direct-import convention (lines 9-11).
- [Source: `apps/server/src/handlers/moduleHandlers.ts:173-186`] — module-agnostic `strikeCount` stamp the guard must tolerate.
- [Source: `apps/server/src/reducers/bombReducer.ts:29-33`] — transient-`'struck'` roll-up preserving returned `data` (why the dial survives a wrong TX).
- [Source: `apps/client/src/manual/devManualFixtures.ts:55`] — `stub('morse-code', 'Morse Code')` to replace.
- [Source: `apps/client/src/ui/RoundConfigPanel.tsx:55`] — display label already present; no edit.
- [Source: `_agent_docs/project-context.md`] — module structure, testing rules, gotcha line 219 (word-level decode).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (gds-dev-story workflow)

### Debug Log References

- `pnpm --filter @bomb-squad/shared test` → 15 suites, 350 tests green (incl. new `morse-code.test.ts`).
- `pnpm --filter @bomb-squad/server test` → 36 suites, 563 passed / 2 skipped (incl. widened `moduleRegistration.test.ts`).
- `pnpm --filter @bomb-squad/client test` → 51 files, 443 tests green (incl. new `morseCodeBinding.test.ts`).
- `pnpm -r typecheck` → clean across all 4 workspaces.
- No `lint` script is configured in this monorepo; typecheck is the static-analysis gate.

### Completion Notes List

- **Task 0 (sequencing gate):** confirmed 7.3 (Memory) landed first — commits `9aed8bb`/`c0da139`/`ac34fba`, sprint-status `done`. The four "unregistered id" fixtures held `'morse-code'` as predicted before this story repointed them.
- **Shared module** (`packages/shared/src/modules/morse-code/`): `types.ts` (id, 16 words + integer-kHz frequencies ascending, `formatMorseFrequency`, state, action guard tolerating the stamped `strikeCount`), `solve.ts` (full A–Z/0–9 `MORSE_ALPHABET`, `MORSE_TABLE` paired positionally from words×frequencies, `morsePatternForWord`, `correctFreqIndex`), `generate.ts` (seeded word + never-born-solved dial start via index-shift, `_ctx` unused/unstored), `reducer.ts` (clamped dial + one TX equality check; wrong TX → transient `'struck'` with dial PRESERVED; `MODULE_RESET` restores `initialFreqIndex`; solved-inert), `manual.ts` (intro + Morse chart + word→freq table, all from the same constants), `index.ts` (barrel re-export only — IModule binding lives client-side, matching every existing module; the story's Task-6 "assemble in shared" wording would have collided with the client-defined `MORSE_CODE_MODULE`, so I followed the established pattern).
- **Registration (3 places, one story):** `MODULE_GENERATORS` + `TIER_POOLS.hard` in `registry.ts`, `MODULE_REDUCERS` on the server. No edits to `bombReducer.ts` / `moduleHandlers.ts` — Morse consumes no live bomb state (like Memory).
- **Client module** (`apps/client/src/modules/morse-code/`): re-export contract files, `DefuserView.tsx` (flashing lamp driven from `useFrame` off a precomputed word timeline — cumulative on/off segment boundaries built once per word via `useMemo`, ref-cursor scan per frame, zero per-frame allocations; **word-keyed reset, NOT Simon's data-keyed reset** so a dial click never garbles the transmission; `UNIT = 0.25s` → 2 flashes/sec worst case, under the 3/sec photosensitivity floor; reduced-motion scales delta ×0.6; solved → lamp dark; DSEG7 LCD frequency readout; up/down + TX via `moduleClickHandlers`), `ManualPages.tsx`, `index.ts` (IModule binding + `registerModuleRenderer`). Barrel + `SANDBOX_MODULES` + `/dev/manual` fixture swap wired.
- **Fixture-chain endgame (Task 8, third rotation):** the "unregistered id" example repointed `morse-code`→`keypads` (Epic 6, still backlog) in `layout.test.ts`, `assembleBomb.test.ts`, `initializeRoundBombs.test.ts`, and the rogue-rebind id in `moduleRegistration.test.ts`; `tierGating.test.ts` generatable subset widened to all four Hard modules; added a positive morse-code solve/strike round-trip through the untouched `createBombReducer`. **The Hard tier is now exhausted — every Hard module is generatable.**
- **Human verification (AC #6 / Task 10): Jay CONFIRMED WORKING (2026-07-02, interactive).** The flashing lamp, dial + TX solve, wrong-TX strike with the dial preserved (loop uninterrupted), dial clicks not restarting the transmission, end clamps, and a Hard-tier live round drawing + solving Morse Code all behaved as specified. The compact two-column manual (chart 2-pair, tightened intro) was also confirmed as the fix for the earlier too-long/empty-space page.

### File List

**New (shared):**
- `packages/shared/src/modules/morse-code/types.ts`
- `packages/shared/src/modules/morse-code/solve.ts`
- `packages/shared/src/modules/morse-code/generate.ts`
- `packages/shared/src/modules/morse-code/reducer.ts`
- `packages/shared/src/modules/morse-code/manual.ts`
- `packages/shared/src/modules/morse-code/index.ts`
- `packages/shared/src/modules/morse-code/__tests__/morse-code.test.ts`

**New (client):**
- `apps/client/src/modules/morse-code/types.ts`
- `apps/client/src/modules/morse-code/generate.ts`
- `apps/client/src/modules/morse-code/solve.ts`
- `apps/client/src/modules/morse-code/reducer.ts`
- `apps/client/src/modules/morse-code/DefuserView.tsx`
- `apps/client/src/modules/morse-code/ManualPages.tsx`
- `apps/client/src/modules/morse-code/index.ts`
- `apps/client/src/modules/__tests__/morseCodeBinding.test.ts`

**Modified:**
- `packages/shared/src/modules/index.ts` (barrel export)
- `packages/shared/src/modules/registry.ts` (generator + `TIER_POOLS.hard`)
- `apps/server/src/reducers/MODULE_REDUCERS.ts` (reducer registration)
- `apps/client/src/modules/index.ts` (barrel import + `SANDBOX_MODULES`)
- `apps/client/src/manual/devManualFixtures.ts` (stub → canonical pages)
- `packages/shared/src/generation/__tests__/layout.test.ts` (fixture repoint → `keypads`)
- `packages/shared/src/generation/__tests__/assembleBomb.test.ts` (fixture repoint → `keypads`)
- `apps/server/src/round/__tests__/initializeRoundBombs.test.ts` (fixture repoint → `keypads`)
- `apps/server/src/reducers/__tests__/moduleRegistration.test.ts` (rogue-rebind id → `keypads`; + morse-code round-trip)
- `packages/shared/src/modules/__tests__/tierGating.test.ts` (generatable subset widened)
- `_agent_docs/implementation-artifacts/sprint-status.yaml` (7-4 → review; last_updated note)

## Change Log

| Date | Change |
|---|---|
| 2026-07-02 | Story 7.4 (Morse Code Module) created via gds-create-story in the sprint-7-hard-modules worktree. Status → ready-for-dev. |
| 2026-07-02 | Implemented Morse Code module (shared logic + client rendering + 3-place registration). Repointed the "unregistered id" fixture chain to `keypads` (Hard tier exhausted). All automated tests + typecheck green. Status → review (pending Jay interactive verification). |
| 2026-07-02 | Manual polish (Jay feedback): Morse chart now renders as a compact two-pair `Char\|Code\|Char\|Code` table (18 rows, A–Z then 0–9) instead of a tall 36-row single column; intro condensed from two paragraphs to one — mirrors the printed manual's density. |
| 2026-07-02 | Jay interactive verification CONFIRMED WORKING (Task 10): flash/dial/TX solve, wrong-TX strike with dial preserved, loop-uninterrupted-on-dial, clamps, and a Hard-tier live round all as specified. Human-verification AC satisfied. |
| 2026-07-02 | Code review (3-layer adversarial): 4 patches applied — `m`/`n` added to the independent `EXPECTED_CODES` + coverage meta-guard + `bombs`/`sting` pattern assertions; index keys for the repeated manual header pair; reducer dial clamps widened `===`→`>=`/`<=` (self-healing on out-of-band state, + regression test); story record corrections. 3 systemic items deferred to `deferred-work.md` (client-forged MODULE_RESET via MODULE_INTERACT, mount-frozen reduced-motion sampling, missing module render error boundary). Shared 352 / server 563 / client 443 green, typecheck clean. Status → done. |
