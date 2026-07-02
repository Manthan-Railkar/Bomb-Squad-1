---
baseline_commit: 15bd168
context:
  - _agent_docs/project-context.md
  - _agent_docs/implementation-artifacts/sprint-6-retro-2026-07-02.md
  - .claude/skills/gds-create-story/template.md
  - .claude/skills/gds-create-story/SKILL.md
---

# Story TD-8: Module Reducer Defect-Class Checklist in the Story-Spec Template

Status: done

<!-- Process / tooling story (not from an epic). Sprint 6 retro Action Item 2.
     Three module-reducer defect classes were each RE-FOUND by review across ≥2
     module stories (degenerate/malformed-state strike-trap, fail-open lookup on
     an unknown id, MODULE_RESET-re-arms-solved). A recurring review finding is a
     checklist item, not a review finding (retro Key Insight 1). The transfer
     channel that demonstrably works in this project is project-context.md — it is
     FULL_LOADed by gds-create-story and rendered into every story's "Project
     Context Rules" section (the same channel that successfully carried the
     tier-pool prediction). This story codifies the three classes there (plus a
     reminder in the create-story template) so future module reviews stop
     re-finding them. -->

## Story

As the developer who keeps paying to re-discover the same three module-reducer defect classes one story at a time,
I want those classes written into the project-context module rules (and surfaced by the story-spec template) as an explicit pre-implementation checklist,
so that every future module story is written to satisfy them up front and its adversarial review re-finds none of the three.

## Context — the grounded picture

- **The three recurring classes (each found in ≥2 module stories):**
  1. **Degenerate/malformed-state inert guard — never a strike-forever trap.** An unsolvable/degenerate generated board or a malformed action must be *inert* (no-op), never a state that strikes on every interaction with no escape. Found + guarded in 6.1 (unsolvable keypad board), then **missing again in 6.2**, and the same fail-open class reappeared in 6.4 (`isWall` on unknown `mazeId`). Reducer guards must never `throw` either (guard-never-throw — cf. the 7.2 `Number.isInteger(strikeCount)` tightening).
  2. **Fail-closed lookups on unknown ids.** A table/registry lookup on an unknown key must fail *closed* (safe no-op / rejected), not fail *open* (e.g. `isWall` returning `false` for an unknown maze → walk-through-walls; a missing translation row silently treated as valid). 6.4's `fail-closed isWall` fix is the canonical example.
  3. **MODULE_RESET-on-solved semantics pinned by test.** A lifecycle reset must not re-arm an already-`solved` module, and (fleet-wide) a client must not be able to *drive* a reset on demand. Unpinned in both 6.1 and 6.2; the client-forgeable `MODULE_RESET` is a live cheat on Memory (see [[td-9-manualtable-presentation-rework]]'s sibling deferral — the handler-side fix is tracked separately in `deferred-work.md`, not owned here). TD-8 owns only the **test-pin discipline** — every module story asserts reset-on-solved is a no-op.
- **Why project-context.md, not just the template.** `gds-create-story` (`SKILL.md`) FULL_LOADs `**/project-context.md` and renders its rules into each story's **Project Context Rules** section automatically. That is the channel retro Key Insight 1 identifies as the one that *works* (it already carries the tier-pool + copy-the-freshest-sibling rules). A line only in the generic skill `template.md` is weaker (skill-global, not project-scoped, and easy to miss). So the primary edit is a project-context module-rules addition; the template gets a short reminder pointer.
- **Scope is docs/process only.** No product code changes. Success is measured on the *next* module story: its spec carries the checklist and its review re-finds none of the three classes. There is no runtime surface to drive here.
- **The template file.** `.claude/skills/gds-create-story/template.md` is the active story template (produces the `Status: ready-for-dev` header used by every story). A `<!-- Module story checklist -->` reminder in its `## Tasks / Subtasks` or `### Project Context Rules` scaffold points authors at the project-context checklist.

## Acceptance Criteria

1. **Given** `_agent_docs/project-context.md`, **When** TD-8 is done, **Then** its **Module System** section carries an explicit, named **"Module reducer defect-class checklist"** enumerating the three classes (degenerate/malformed-state inert-and-never-throw guard · fail-closed unknown-id lookups · MODULE_RESET-on-solved is a test-pinned no-op), each stated as a rule a module reducer/generator must satisfy, with a one-line pointer to the shipped example fix for each (6.1/6.2/6.4/7.2).
2. **Given** the story-spec template, **When** a new module story is generated, **Then** `.claude/skills/gds-create-story/template.md` contains a short reminder (comment or a Tasks-scaffold line) directing the author to the project-context module checklist, so the three classes appear as spec-time checklist items — **not** merely as a post-hoc review concern.
3. **Given** the checklist, **When** a future module story is written and reviewed, **Then** the story's spec visibly carries the three checklist items (in its Tasks and/or Project Context Rules) **and** its 3-layer adversarial review re-finds **none** of the three classes (the retro's "done when" — verified on the first module story after this lands; if none is imminent, the AC is met by the artifacts of #1/#2 being in place and a self-audit of 6.1–7.4 confirming each class maps to a checklist line).
4. **Given** the change is documentation/process only, **When** TD-8 closes, **Then** no product code, test, or manual data is modified; `pnpm -r test` / `pnpm -r typecheck` are untouched-and-green; and the relevant `deferred-work.md` review entries that motivated the checklist are cross-referenced (not deleted — the handler-side `MODULE_RESET` fix remains its own open item).

## Tasks / Subtasks

- [x] **Task 1 — Author the checklist in project-context.md (AC: #1)** — add a "Module reducer defect-class checklist" subsection under **Module System** in `_agent_docs/project-context.md`; three named rules + per-rule example-fix pointer; phrase as pre-implementation constraints, guard-never-throw included.
- [x] **Task 2 — Reminder in the story template (AC: #2)** — add a `<!-- Module story: satisfy the Module reducer defect-class checklist (project-context.md) -->` pointer to `.claude/skills/gds-create-story/template.md` (Tasks scaffold or Project Context Rules scaffold), so generated module stories surface it at spec time.
- [x] **Task 3 — Self-audit + cross-reference (AC: #3, #4)** — walk 6.1/6.2/6.4/7.2 review findings and confirm each of the three classes maps to exactly one checklist line (no gap, no overlap); cross-reference the motivating `deferred-work.md` entries; confirm zero product-code change and green gates.

> **No interactive human-verify gate** — process/docs story. Its real verification is the *next* module story's review re-finding none of the three classes (AC #3).

## Dev Notes

### Files to touch

- **UPDATE** `_agent_docs/project-context.md` — new "Module reducer defect-class checklist" under **Module System**.
- **UPDATE** `.claude/skills/gds-create-story/template.md` — reminder pointer.
- **UPDATE (cross-ref only)** `_agent_docs/implementation-artifacts/deferred-work.md` — link the checklist from the 6.1/6.2/6.4/7.2 entries; do **not** remove the handler-side `MODULE_RESET` item (owned elsewhere).

Read before editing:
- `.claude/skills/gds-create-story/SKILL.md:29,40` — confirms `project-context.md` is FULL_LOADed and rendered into "Project Context Rules" (the reason this channel works).
- The Sprint 6 retro §"What Hurt" #1 and §Key Insights #1 — the three classes and the transfer-mechanism argument.
- `deferred-work.md` entries: 6-1 (unsolvable strike-trap), 6-2 (fail-open lookup / reset pin), 6-4 (fail-closed `isWall`), 7-2 (`Number.isInteger` guard-never-throw), 7-4 (client-forgeable `MODULE_RESET`).

### Project Context Rules

- Docs/process story: no reducer, generator, manual, or client change. The `MODULE_RESET` *handler* fix (reject lifecycle actions in client payloads) stays a separate deferred item — TD-8 pins only the per-module reset-on-solved *test* discipline.

### References

- [Source: sprint-6-retro-2026-07-02.md#Action Items] — AI-2: "Module-reducer defect-class checklist in the story template … so reviews stop re-finding them. Done when: the next module story's spec carries the checklist and its review re-finds none of the three classes."
- [Source: sprint-6-retro-2026-07-02.md#Key Insights] — #1 "A recurring review finding is a checklist item, not a review finding"; the story-spec/project-context transfer channel.
- [Source: .claude/skills/gds-create-story/SKILL.md] — project-context FULL_LOAD → Project Context Rules rendering.

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Claude Fable 5)

### Completion Notes

- **Task 1:** Added the named **"Module reducer defect-class checklist"** directly under the **Module System** rules in `_agent_docs/project-context.md` — three numbered rules phrased as pre-implementation constraints: (1) degenerate/malformed-state inert guard, never a strike-forever trap, guards never throw (pointers: 6.1 unsolvable-board guard, re-found missing in 6.2; 7.2 `Number.isInteger(strikeCount)`); (2) fail-closed lookups on unknown ids (pointer: 6.4 fail-closed `isWall`); (3) MODULE_RESET-on-solved is a test-pinned no-op (pointer: unpinned in 6.1/6.2; handler-side client-forgery fix explicitly noted as NOT owned here, → deferred-work 7-4 entry). Frontmatter `rule_count` 47→50 and `_Last Updated_` stamped.
- **Task 2:** Added a `<!-- Module story: satisfy the "Module reducer defect-class checklist" ... -->` comment at the top of the `## Tasks / Subtasks` scaffold in `.claude/skills/gds-create-story/template.md`, naming all three items so module-story authors spec them as tasks/tests, not post-hoc review findings. Note: `.claude/` is gitignored — the template edit is live on disk for the skill but not version-tracked.
- **Task 3 self-audit (no gap, no overlap):** 6.1 strike-trap → line 1; 6.1 reset unpinned → line 3; 6.2 missing inert guard → line 1; 6.2 reset unpinned → line 3; 6.4 fail-open `isWall` → line 2; 7.2 guard-never-throw → line 1; 7.4 client-forgeable `MODULE_RESET` → handler-side, cross-referenced from checklist line 3 and from the deferred-work 7-4 entry, deliberately not owned by TD-8. Each historical finding maps to exactly one line.
- **Cross-reference:** appended a TD-8 cross-ref sentence to the open 7-4 `MODULE_RESET` entry in `deferred-work.md` (entry NOT removed/resolved). The 6-1/6-2 deferred entries proved to be the (TD-9-resolved) spacer-column items, not the three classes — those classes were fixed in-story and are documented in the Sprint 6 retro, which the checklist cites; no other deferred entries required linking.
- **AC #3 (no imminent module story):** met via the artifacts of AC #1/#2 plus the self-audit above; live verification lands on the first module story created after this (its spec should surface the checklist via Project Context Rules + the template comment, and its review should re-find none of the three classes).
- **AC #4 gates:** zero product code/test/manual-data modified by TD-8 (docs + gitignored template only — the product-code diffs in the working tree are TD-9's, status `review`). `pnpm -r typecheck` clean ×4 workspaces; `pnpm -r test` green: shared 491, server 567 (+2 skipped), client 464.

### File List

- `_agent_docs/project-context.md` (modified — checklist under Module System; frontmatter rule_count; Last Updated)
- `.claude/skills/gds-create-story/template.md` (modified — Tasks-scaffold reminder comment; gitignored path)
- `_agent_docs/implementation-artifacts/deferred-work.md` (modified — cross-ref appended to the 7-4 MODULE_RESET entry)
- `_agent_docs/implementation-artifacts/td-8-module-defect-class-checklist.md` (modified — this story file)
- `_agent_docs/implementation-artifacts/sprint-status.yaml` (modified — td-8 status)

## Change Log

| Date       | Change |
|------------|--------|
| 2026-07-03 | Story TD-8 created (backlog) from Sprint 6 retro Action Item 2: codify the three recurring module-reducer defect classes as a project-context module checklist (auto-surfaced into every story's Project Context Rules) + a story-template reminder, so module reviews stop re-finding them. Baseline 15bd168. |
| 2026-07-03 | TD-8 implemented (docs/process only): checklist authored in project-context.md Module System (3 rules + example-fix pointers), template Tasks-scaffold reminder added, deferred-work 7-4 MODULE_RESET entry cross-referenced, 6.1/6.2/6.4/7.2→checklist self-audit recorded. Gates green (typecheck ×4; shared 491 / server 567 / client 464). Status → review. |
| 2026-07-03 | Jay waived review ("no need to review") → Status: done. Committed on master. Live AC #3 verification still lands on the first module story created after this. |
