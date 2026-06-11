# Roadmap Progress

_Maintained by the `roadmap-slice-autopilot` skill. The cursor below is the
source of truth for what runs next. Manual edits are fine if you keep the
format._

**Roadmap:** [docs/roadmap.md](roadmap.md)
**Next slice:** 5

## Prompt for next slice (slice 5)

Implement **Slice 5 — KO (Knock-Out) counting system** from `docs/roadmap.md`.
One slice only. This slice has a **safe default**, so proceed (no pause): KO is
**running-count-only**; true-count conversion stays Hi-Lo-only for now. Record
that assumption in the log and surface it in the report.

**Goal:** add KO as a selectable second counting system in the card-counting
(running-count) trainer, with correct counting math and Hi-Lo behavior unchanged.

**Counting data (KO):** `2,3,4,5,6,7 → +1`, `8,9 → 0`, `10,J,Q,K,A → −1`. KO
differs from Hi-Lo only by counting the **7** as +1. KO is **unbalanced**
(`balanced: false`): a full 52-card deck sums to **+4** (Hi-Lo sums to 0).

**Before writing code, read these to learn the real shapes (do not assume):**

- `src/app/core/models/counting-system.model.ts` — the `CountingSystem`
  interface and the `CountValue` type (currently locked to `-1 | 0 | 1`; KO fits,
  so do **not** widen it here — that is Slice 6). Check whether the interface
  already carries a `balanced` flag; if not, see the Decision note.
- `src/app/data/counting-systems.ts` — how Hi-Lo is described and how
  `COUNTING_SYSTEMS` registers systems (the registry the UI discovers from).
- `src/app/core/services/counting-engine.service.ts` — how running count and true
  count are computed; verify how an unbalanced system is / should be handled.
- `src/app/features/card-counting/*` — how the trainer selects a system and where
  a system selector lives (or must be added), plus the running- vs true-count
  modes.

**Scope:**

- Add the KO descriptor to `data/counting-systems.ts` and register it in
  `COUNTING_SYSTEMS` so the UI discovers it.
- Ensure the running-count trainer lets the user pick the counting system.
- Handle the unbalanced case in the true-count path per the default: restrict KO
  to running-count mode with a clear in-UI note. Do **not** implement KO
  IRC/key-count true-count math (that can be a later slice).
- Tests: KO per-rank values, the +4 full-deck sum, trainer/selector wiring, and
  that Hi-Lo is unaffected.

**Files:** `src/app/data/counting-systems.ts`,
`src/app/core/services/counting-engine.service.ts` (verify/adjust unbalanced
handling), `src/app/features/card-counting/*` (system selector), + co-located
specs.

**Out of scope:** Omega II / Wong Halves (Slices 6–7); widening `CountValue`.

**Acceptance criteria:**

- KO is selectable in the running-count trainer.
- Counting math is correct for KO; Hi-Lo behavior is unchanged.
- Tests green.

**Validation:** full baseline — `npm run lint`, `CI=true npm test`,
`npm run build`.

**Commit:** `feat: add KO (Knock-Out) counting system`

**Decision (safe default — proceed):** unbalanced true-count handling →
**running-count-only for KO**, documented in the UI and the log. A full
key-count/IRC true-count model for unbalanced systems can be its own later slice.
If the `CountingSystem` interface lacks a `balanced` field, prefer adding the
minimal field needed to express "unbalanced / running-count-only" rather than
hard-coding KO by name; keep the change tight and behavior-preserving for Hi-Lo.

**Assumptions carried forward (Slice 4):** the shared trainer keyboard
orchestration now lives in `src/app/core/keyboard.ts` as `handleTrainerKeydown`
(the card-counting page still imports `shouldIgnoreKeyboardEvent` from the same
module — unchanged). `BlackjackTableComponent` and `ActionButtonsComponent` were
moved from `features/basic-strategy/` to `src/app/shared/`. None of this affects
the card-counting counting logic Slice 5 touches.

One-slice contract: implement only Slice 5, make exactly one commit, push to
`origin main`, then record the prompt for **Slice 6 — Widen CountValue + Omega II
counting system** (Slice 6 widens `CountValue` per the model's own comment; no
pause). Do not start Slice 6.

## Execution log

| Slice | Title                                   | Status | Commit  | Validated                              | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----: | --------------------------------------- | ------ | ------- | -------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | Lint & format tooling                   | Done   | b6bd53c | typecheck+test+build+lint+format:check | 2026-06-03 | Added `format`/`format:check`/`lint` scripts + `.prettierignore`. Replaced the standalone CI `typecheck` step with `lint` (= typecheck + format:check, so typecheck still runs). Ran one repo-wide `prettier --write .` pass — reformatted many existing files. Ignored the untracked `docs/repo-current-state.md` scratch file in `.prettierignore`. ESLint deferred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
|     2 | LICENSE + license clarification         | Done   | afc3fda | lint+typecheck+test+build              | 2026-06-03 | Chose **MIT** (recorded default), copyright © 2026 Arthur Zhang (git author name; GitHub owner is `8C9D` — used the personal name per the recorded prompt). Added canonical MIT `LICENSE` at repo root (extensionless, so Prettier does not check it). Rewrote the README "App code" section to state MIT and carve out `public/cards/`; changed the card-art note from "all-rights-reserved" to "MIT license above". Left `package.json` (`license` field + `private: true`) unchanged — only `LICENSE` + `README.md` were in scope. Card attribution files untouched.                                                                                                                                                                                                                                                                                                                                                       |
|     3 | Chart correctness golden-file guards    | Done   | f896c22 | lint+typecheck+test+build              | 2026-06-03 | Added `src/app/data/chart-values.golden.spec.ts` (+10 tests → 491 total). Chose **inline** golden literals (simplest; matches existing style). Basic-strategy charts serialized as rowKey → space-joined cells across upcards 2..A; deviations serialized one line per rule capturing ruleSet/category/hand/upcard/index/direction and basic→deviation action (`playerHandLabel` + `source` excluded as documentation, not the decision matrix). Guards **regressions only**, not original transcription errors (re-verifying vs the BJA PDFs stays a human task). Bootstrapped the golden via a throwaway Node type-strip script (not committed) to avoid transcription error. Verified the "any single cell flip fails" intent by flipping H17 hard 16 v9 (SUR_H→S) and the H17 insurance index (3→2): both turned the golden spec red (and the existing engine specs), then reverted. Chart data files unchanged.          |
|     4 | Shared blackjack-UI / keyboard refactor | Done   | pending | lint+typecheck+test+build              | 2026-06-05 | Mechanical path (no pause): assessed remaining duplication first. Moved `BlackjackTableComponent` and `ActionButtonsComponent` from `features/basic-strategy/` to `src/app/shared/` (they were already shared via a cross-feature import from the deviations page) and repointed both pages' imports — removes the `features/deviations → features/basic-strategy` dependency. Extracted the duplicated trainer keydown body into `handleTrainerKeydown(event, { canNext, onNext, onAction })` in `core/keyboard.ts`; both pages delegate from their own `@HostListener` (behavior identical: basic-strategy gates Enter on a graded hand, deviations also on a valid next-hand). Added 6 helper unit tests (491→497). Feedback panels already share `feedback-shell` via content projection, and `rule-controls`/`stats-panel` were already shared — left as-is. `card-counting` keyboard handling untouched (out of scope). |
