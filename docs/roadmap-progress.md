# Roadmap Progress

_Maintained by the `roadmap-slice-autopilot` skill. The cursor below is the
source of truth for what runs next. Manual edits are fine if you keep the
format._

**Roadmap:** [docs/roadmap.md](roadmap.md)
**Next slice:** 3

## Prompt for next slice (slice 3)

Implement **Slice 3 — Chart correctness golden-file guards** from
`docs/roadmap.md`. One slice only: implement it, validate, make one commit, push
to `origin main`, then record the prompt for Slice 4.

**Goal:** guard the transcribed chart **values** (not just their shape) against
accidental edits, so the Phase B feature slices can't silently corrupt a chart
cell. This guards against **regressions**, not original transcription errors —
re-verifying values against the BJA PDFs is a separate human review task and is
out of scope.

**Scope:**

- Add value-level regression specs for the four chart data files:
  `src/app/data/h17-basic-strategy.ts`, `s17-basic-strategy.ts`,
  `h17-deviations.ts`, `s17-deviations.ts`. Each must assert the **full**
  decision matrix against a checked-in golden representation (an inline fixture
  in the spec, or a committed `*.golden` artifact loaded by the spec — your
  choice; inline is simplest and matches the existing style).
- The guard must be tight enough that mutating **any single chart cell** makes a
  test fail.
- Add a short comment in the spec (and a note in the log entry) stating that this
  guards against regressions, not transcription errors.

**Files:** new co-located spec/fixture file(s) under `src/app/data/`. There is
already a `src/app/data/basic-strategy-charts.spec.ts` (structure-level tests) —
read it first to match conventions; you may extend it or add new sibling specs
(e.g. `*-golden.spec.ts`). There is **no** existing deviations spec under
`src/app/data/`, so deviation-chart golden coverage is net-new. Do **not** modify
the chart data files themselves.

**Out of scope:** re-verifying values against the BJA PDFs (human review, not an
automated slice); changing chart data; touching engines or feature components.

**Acceptance criteria:**

- Each of the four charts has a value-level golden guard.
- Mutating any single chart cell makes a test fail (design intent — sanity-check
  by temporarily flipping one cell locally, confirm a failure, then revert).
- Tests green.

**Validation:** `npm run lint`, `npm run typecheck`, `CI=true npm test`,
`npm run build` (full baseline; `lint` applies now that Slice 1 landed).

**Commit:** `test: add golden-file guards for basic-strategy and deviation charts`

**Decision:** None. Pick the golden representation (inline vs `*.golden` file)
pragmatically and record which you chose in the log.

**Assumption carried forward (Slice 2):** the app code is licensed **MIT**
(copyright © 2026 Arthur Zhang); the `package.json` `license` field and
`private: true` were intentionally left unchanged because Slice 2's Files list
was only `LICENSE` + `README.md`. Not relevant to Slice 3 — recorded so it is not
re-litigated.

After committing and pushing, set **Next slice** to `4`, generate the
self-contained prompt for **Slice 4 — Shared blackjack-UI / keyboard refactor**
(note: Slice 4 is **Decision: Required if non-mechanical** — if the extraction
needs meaningful API/design choices, pause, write a sub-plan into this file, mark
the slice **Needs review**, make one `docs:` commit, push, and stop without
implementing feature code), and append Slice 3's row to the execution log.

One-slice contract: implement only Slice 3, make exactly one commit (the new
spec/fixture file(s) plus the two doc updates), push to `origin main`, then
record the prompt for Slice 4. Do not start Slice 4.

## Execution log

| Slice | Title                           | Status | Commit  | Validated                              | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----: | ------------------------------- | ------ | ------- | -------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | Lint & format tooling           | Done   | b6bd53c | typecheck+test+build+lint+format:check | 2026-06-03 | Added `format`/`format:check`/`lint` scripts + `.prettierignore`. Replaced the standalone CI `typecheck` step with `lint` (= typecheck + format:check, so typecheck still runs). Ran one repo-wide `prettier --write .` pass — reformatted many existing files. Ignored the untracked `docs/repo-current-state.md` scratch file in `.prettierignore`. ESLint deferred.                                                                                                                                                                                                  |
|     2 | LICENSE + license clarification | Done   | pending | lint+typecheck+test+build              | 2026-06-03 | Chose **MIT** (recorded default), copyright © 2026 Arthur Zhang (git author name; GitHub owner is `8C9D` — used the personal name per the recorded prompt). Added canonical MIT `LICENSE` at repo root (extensionless, so Prettier does not check it). Rewrote the README "App code" section to state MIT and carve out `public/cards/`; changed the card-art note from "all-rights-reserved" to "MIT license above". Left `package.json` (`license` field + `private: true`) unchanged — only `LICENSE` + `README.md` were in scope. Card attribution files untouched. |
