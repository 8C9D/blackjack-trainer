# Roadmap Progress

_Maintained by the `roadmap-slice-autopilot` skill. The cursor below is the
source of truth for what runs next. Manual edits are fine if you keep the
format._

**Roadmap:** [docs/roadmap.md](roadmap.md)
**Next slice:** 7

## Prompt for next slice (slice 7)

Implement **Slice 7 — Wong Halves counting system** from `docs/roadmap.md`. One
slice only.

**Decision: Required — representation, but a safe default exists, so proceed (do
not pause).** Per the roadmap default, **store true fractional values** and
accept a natural fractional running count, documenting the convention in the UI.
(Alternative considered: store doubled integers ×2 — not chosen.) Record the
chosen representation in the log and report.

**Goal:** add Wong Halves — a balanced, fractional level-3 system — as a fourth
selectable system, including making the running-count answer input/validation
and display handle fractional answers.

**Counting data (Wong Halves):** `2,7 → +0.5`, `3,4,6 → +1`, `5 → +1.5`,
`8 → 0`, `9 → −0.5`, `10,J,Q,K,A → −1`. Balanced (`balanced: true`): a full
52-card deck sums to **0** (per suit: 0.5 + 0.5 + 1 + 1 + 1 + 1.5 + 0 − 0.5 − 1 −
1 − 1 − 1 − 1 = 0). Being balanced, it converts to a true count the Hi-Lo way.

**Carried forward from Slice 6:** `CountValue` is now the integer union
`-2 | -1 | 0 | 1 | 2` in `src/app/core/models/counting-system.model.ts` (widened
from `-1 | 0 | 1` for Omega II's ±2; the comment notes a fractional system needs
a _further_ widening). Hi-Lo, KO, and Omega II are registered in
`COUNTING_SYSTEMS` (`src/app/data/counting-systems.ts`); the page selector is
data-driven (`card-counting-page.component.ts` exposes `systems = COUNTING_SYSTEMS`,
`system = signal(...)`, `trueCountAvailable = computed(() => system().balanced)`).
True-count availability is gated purely on `system.balanced` — Wong Halves is
balanced, so it gets true count automatically. The engine
(`counting-engine.service.ts`) is system-agnostic: `runningCount` sums
`values[rank]` (handles fractions already); `trueCount = trunc(running / decks)`
works for fractional running counts too.

**Before writing code, read these to learn the real shapes (do not assume):**

- `src/app/core/models/counting-system.model.ts` — widen `CountValue` to allow
  fractions. With the "true fractional values" default, the cleanest is
  `CountValue = number` (the model comment already anticipates this). Keep
  Hi-Lo / KO / Omega II values valid and their outputs unchanged.
- `src/app/core/services/counting-engine.service.ts` — `isValidIntegerAnswer`
  only accepts integers (`/^-?\d+$/`). Fractional running counts (e.g. `2.5`,
  `-0.5`) need a fraction-aware validator. Decide: a system-aware accept
  (fractions only for fractional systems) or a general decimal validator. Note
  `trueCount` truncates toward zero — fine for fractions.
- `src/app/data/counting-systems.ts` — add `WONG_HALVES` and append it to
  `COUNTING_SYSTEMS`.
- `src/app/data/counting-systems.spec.ts` — extend (per-rank values, balanced
  full-deck sum 0, registry now `['hi-lo','ko','omega-ii','wong-halves']`).
- `src/app/core/services/counting-engine.service.spec.ts` — add engine tests for
  fractional summing and true count.
- The card-counting answer input/validation component (find it via the
  `isValidIntegerAnswer` usage under `src/app/features/card-counting/`) — make it
  accept fractional answers; document the convention (true fractional running
  count) in the UI.
- `src/app/features/card-counting/count-feedback-panel.component.ts` —
  `deltaLabel` / running totals will show fractions (e.g. `+0.5`, `-0.5`); verify
  the breakdown reads fine.

**Scope:**

- Widen `CountValue` for fractional values (default: `number`); keep existing
  systems' values valid and outputs unchanged.
- Add the `WONG_HALVES` descriptor + registry entry (no extra selector wiring —
  it is data-driven).
- Make the running-count answer input/validation/display handle fractional
  answers; document the representation/input convention in the UI.
- Tests: per-rank values, balanced full-deck sum 0, engine fractional summing,
  true count for Wong Halves, fractional answer validation, existing systems
  unchanged.

**Files:** `src/app/core/models/counting-system.model.ts`,
`src/app/core/services/counting-engine.service.ts` (validator),
`src/app/data/counting-systems.ts`, `src/app/data/counting-systems.spec.ts`,
`src/app/core/services/counting-engine.service.spec.ts`, and the
`features/card-counting/*` answer-input/validation component + its spec. Update
the page spec's selectable-systems assertion to include `wong-halves`.

**Out of scope:** Other systems; finite-shoe live deck estimation (Slice 8).

**Acceptance criteria:**

- Wong Halves selectable and correct (running and true count).
- Fractional answers accepted / validated / displayed; representation + input
  convention documented in the UI.
- Tests green.

**Validation:** full baseline — `npm run lint`, `CI=true npm test`,
`npm run build`.

**Commit:** `feat: add Wong Halves counting system`

One-slice contract: implement only Slice 7, make exactly one commit, push to
`origin main`, then record the prompt for **Slice 8 — Finite-shoe live deck
estimation**. Slice 8 is design-heavy with **Decision: Required — UX/scoring and
no safe default**: do _not_ implement feature code — write a design sub-plan into
this file, mark Slice 8 **Needs review** in `docs/roadmap.md`, make one `docs:`
commit, push, and stop. Do not start Slice 8.

## Execution log

| Slice | Title                                   | Status | Commit  | Validated                              | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----: | --------------------------------------- | ------ | ------- | -------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | Lint & format tooling                   | Done   | b6bd53c | typecheck+test+build+lint+format:check | 2026-06-03 | Added `format`/`format:check`/`lint` scripts + `.prettierignore`. Replaced the standalone CI `typecheck` step with `lint` (= typecheck + format:check, so typecheck still runs). Ran one repo-wide `prettier --write .` pass — reformatted many existing files. Ignored the untracked `docs/repo-current-state.md` scratch file in `.prettierignore`. ESLint deferred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
|     2 | LICENSE + license clarification         | Done   | afc3fda | lint+typecheck+test+build              | 2026-06-03 | Chose **MIT** (recorded default), copyright © 2026 Arthur Zhang (git author name; GitHub owner is `8C9D` — used the personal name per the recorded prompt). Added canonical MIT `LICENSE` at repo root (extensionless, so Prettier does not check it). Rewrote the README "App code" section to state MIT and carve out `public/cards/`; changed the card-art note from "all-rights-reserved" to "MIT license above". Left `package.json` (`license` field + `private: true`) unchanged — only `LICENSE` + `README.md` were in scope. Card attribution files untouched.                                                                                                                                                                                                                                                                                                                                                       |
|     3 | Chart correctness golden-file guards    | Done   | f896c22 | lint+typecheck+test+build              | 2026-06-03 | Added `src/app/data/chart-values.golden.spec.ts` (+10 tests → 491 total). Chose **inline** golden literals (simplest; matches existing style). Basic-strategy charts serialized as rowKey → space-joined cells across upcards 2..A; deviations serialized one line per rule capturing ruleSet/category/hand/upcard/index/direction and basic→deviation action (`playerHandLabel` + `source` excluded as documentation, not the decision matrix). Guards **regressions only**, not original transcription errors (re-verifying vs the BJA PDFs stays a human task). Bootstrapped the golden via a throwaway Node type-strip script (not committed) to avoid transcription error. Verified the "any single cell flip fails" intent by flipping H17 hard 16 v9 (SUR_H→S) and the H17 insurance index (3→2): both turned the golden spec red (and the existing engine specs), then reverted. Chart data files unchanged.          |
|     4 | Shared blackjack-UI / keyboard refactor | Done   | 3564bbf | lint+typecheck+test+build              | 2026-06-05 | Mechanical path (no pause): assessed remaining duplication first. Moved `BlackjackTableComponent` and `ActionButtonsComponent` from `features/basic-strategy/` to `src/app/shared/` (they were already shared via a cross-feature import from the deviations page) and repointed both pages' imports — removes the `features/deviations → features/basic-strategy` dependency. Extracted the duplicated trainer keydown body into `handleTrainerKeydown(event, { canNext, onNext, onAction })` in `core/keyboard.ts`; both pages delegate from their own `@HostListener` (behavior identical: basic-strategy gates Enter on a graded hand, deviations also on a valid next-hand). Added 6 helper unit tests (491→497). Feedback panels already share `feedback-shell` via content projection, and `rule-controls`/`stats-panel` were already shared — left as-is. `card-counting` keyboard handling untouched (out of scope). |
|     5 | KO (Knock-Out) counting system          | Done   | 3b1e365 | lint+typecheck+test+build              | 2026-06-05 | Safe default (no pause): KO is **running-count-only**; true-count stays Hi-Lo-only. Gated true-count on the existing `balanced` flag (not KO-by-name): the page exposes `trueCountAvailable = system().balanced`; added a `Counting system` `<select>` to `CountingSettingsComponent` (`systems`/`systemId`/`trueCountAvailable` inputs, `systemChange` output) that disables the true-count radio and shows a note when unbalanced; `onSystemChange` coerces mode→running-count for unbalanced systems. Page `system` is now a signal (was a const). Engine untouched — already system-agnostic (sums `values[rank]`). KO descriptor: 2–7→+1, 8–9→0, 10–A→−1, `balanced:false`, full-deck sum **+4** (differs from Hi-Lo only on the 7). New `data/counting-systems.spec.ts`; +27 tests (497→524). KO IRC/key-count true-count math deferred. Hi-Lo unaffected.                                                              |
|     6 | Widen CountValue + Omega II             | Done   | pending | lint+typecheck+test+build              | 2026-06-05 | Decision: None (proceeded). Widened `CountValue` from level-1 (−1/0/+1) to a level-2 integer union spanning −2…+2 — kept it an integer union (not `number`) to preserve cheap compile-time validation; fractional widening deferred to Slice 7. Engine untouched: `runningCount` already sums `values[rank]` so ±2 works, and `trueCount` is valid for the balanced Omega II. Added the `OMEGA_II` descriptor (2,3,7→+1; 4,5,6→+2; 8,A→0; 9→−1; 10,J,Q,K→−2; `balanced:true`, full-deck sum **0**) and appended it to `COUNTING_SYSTEMS`; the selector is data-driven, so no new UI wiring. Hi-Lo/KO values and outputs unchanged. Updated the page spec's selectable-systems assertion to include `omega-ii` and added a page test that Omega II keeps true count (balanced). `count-feedback-panel` `deltaLabel` already renders ±2. +14 tests (524→538).                                                                   |
