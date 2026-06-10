# Roadmap Progress

_Maintained by the `roadmap-slice-autopilot` skill. The cursor below is the
source of truth for what runs next. Manual edits are fine if you keep the
format._

**Roadmap:** [docs/roadmap.md](roadmap.md)
**Next slice:** 4

## Prompt for next slice (slice 4)

Implement **Slice 4 — Shared blackjack-UI / keyboard refactor** from
`docs/roadmap.md`. One slice only. **Read the Decision gate below before writing
any feature code** — Slice 4 may need to pause for human review.

**Goal:** remove remaining duplication in the table / action-buttons / feedback
shell and keyboard handling shared between the basic-strategy trainer (v1) and
the deviations trainer (v4), **without changing behavior**.

**Decision gate (Required if non-mechanical):** First, assess how much real
duplication is left and what extracting it would cost.

- If the duplication is **small and mechanical** (e.g. a clearly shared template
  fragment or a tiny utility, with no meaningful API/design choices): proceed and
  implement the extraction.
- If extracting it requires **meaningful API/design choices** (component inputs/
  outputs, how state/keyboard wiring is shared, a non-obvious shape): **do not
  implement feature code.** Instead:
  1. Write the proposed extraction plan (options, recommendation, open questions)
     into this file under the slice.
  2. Set Slice 4's **Status** in `docs/roadmap.md` to **Needs review**.
  3. Make **one** `docs:` commit with just the two doc updates and push it.
  4. Stop and report that the slice needs a human decision. Do **not** advance
     **Next slice** past 4.

**Scope (only if proceeding):** identify the remaining duplication between
`src/app/features/basic-strategy/` and `src/app/features/deviations/` (and their
use of `src/app/core/keyboard.ts`), extract it into shared components/utilities,
and update both features to consume them. Some shared pieces already exist — at
startup, check `src/app/shared/` (e.g. `feedback-shell.component.ts`,
`rule-controls.component.ts`, `stats-panel.component.ts`) and `core/keyboard.ts`
so you extract only what is **still** duplicated. Verify the actual feature
directory names first (`features/deviations/` is the v4 trainer per the roadmap).

**Files:** `src/app/shared/*`, `src/app/features/basic-strategy/*`,
`src/app/features/deviations/*`, `src/app/core/keyboard.ts` (+ co-located specs).

**Out of scope:** any behavior change, restyle, or new feature.

**Acceptance criteria (proceed case):**

- No behavior change: existing tests pass unmodified, or are updated only to
  follow moved code (not to change assertions).
- The targeted duplication is gone.
- Build green; manual smoke of v1 and v4 looks identical to before.

**Validation:** full baseline — `npm run lint`, `CI=true npm test`,
`npm run build` — plus a manual smoke of both trainers.

**Commit (proceed case):**
`refactor: extract shared blackjack-UI scaffolding between v1 and v4`

**Assumption carried forward (Slice 3):** value-level golden guards now exist in
`src/app/data/chart-values.golden.spec.ts` for all four charts (H17/S17 basic
strategy + H17/S17 deviations). They guard chart **data**, which Slice 4 must not
touch, so the refactor is safe from that angle. No new decisions from Slice 3
affect Slice 4. (Slice 2 carry-forward: app code is MIT; `package.json`
`license`/`private` left as-is — not relevant here.)

One-slice contract: implement only Slice 4 (or pause per the Decision gate), make
exactly one commit, push to `origin main`, then record the prompt for **Slice 5 —
KO (Knock-Out) counting system** (Slice 5 default: KO is running-count-only; true-
count conversion stays Hi-Lo-only). Do not start Slice 5.

## Execution log

| Slice | Title                                | Status | Commit  | Validated                              | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----: | ------------------------------------ | ------ | ------- | -------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | Lint & format tooling                | Done   | b6bd53c | typecheck+test+build+lint+format:check | 2026-06-03 | Added `format`/`format:check`/`lint` scripts + `.prettierignore`. Replaced the standalone CI `typecheck` step with `lint` (= typecheck + format:check, so typecheck still runs). Ran one repo-wide `prettier --write .` pass — reformatted many existing files. Ignored the untracked `docs/repo-current-state.md` scratch file in `.prettierignore`. ESLint deferred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
|     2 | LICENSE + license clarification      | Done   | afc3fda | lint+typecheck+test+build              | 2026-06-03 | Chose **MIT** (recorded default), copyright © 2026 Arthur Zhang (git author name; GitHub owner is `8C9D` — used the personal name per the recorded prompt). Added canonical MIT `LICENSE` at repo root (extensionless, so Prettier does not check it). Rewrote the README "App code" section to state MIT and carve out `public/cards/`; changed the card-art note from "all-rights-reserved" to "MIT license above". Left `package.json` (`license` field + `private: true`) unchanged — only `LICENSE` + `README.md` were in scope. Card attribution files untouched.                                                                                                                                                                                                                                                                                                                                              |
|     3 | Chart correctness golden-file guards | Done   | pending | lint+typecheck+test+build              | 2026-06-03 | Added `src/app/data/chart-values.golden.spec.ts` (+10 tests → 491 total). Chose **inline** golden literals (simplest; matches existing style). Basic-strategy charts serialized as rowKey → space-joined cells across upcards 2..A; deviations serialized one line per rule capturing ruleSet/category/hand/upcard/index/direction and basic→deviation action (`playerHandLabel` + `source` excluded as documentation, not the decision matrix). Guards **regressions only**, not original transcription errors (re-verifying vs the BJA PDFs stays a human task). Bootstrapped the golden via a throwaway Node type-strip script (not committed) to avoid transcription error. Verified the "any single cell flip fails" intent by flipping H17 hard 16 v9 (SUR_H→S) and the H17 insurance index (3→2): both turned the golden spec red (and the existing engine specs), then reverted. Chart data files unchanged. |
