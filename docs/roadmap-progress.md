# Roadmap Progress

_Maintained by the `roadmap-slice-autopilot` skill. The cursor below is the
source of truth for what runs next. Manual edits are fine if you keep the
format._

**Roadmap:** [docs/roadmap.md](roadmap.md)
**Next slice:** 8

## Prompt for next slice (slice 8)

Address **Slice 8 — Finite-shoe live deck estimation** from `docs/roadmap.md`.
One slice only.

**STOP — this is a pause-for-decision slice. Do NOT implement feature code.**
Slice 8 is marked **Decision: Required — UX/scoring design with no safe default**
(how deck-remaining estimation is prompted and scored; penetration / cut-card
settings). Per the autopilot's _Pause-for-decision protocol_, when a slice needs
a human decision with no safe default you must NOT write feature code. Instead:

1. Write a concise **design sub-plan** for Slice 8 into this file (under this
   slice), covering: a finite-shoe model (N decks, depletion, penetration / cut
   card), how it wires into the true-count trainer, and 2–3 concrete options for
   **how the deck-remaining estimate is prompted and scored** (e.g. exact-decks
   vs. nearest-half-deck tolerance; penalty vs. separate accuracy stat), with a
   recommendation and the open questions for the owner.
2. Set Slice 8's **Status** to **Needs review** in `docs/roadmap.md`.
3. Make **one** `docs:` commit containing only the two doc updates
   (`docs/roadmap.md` + `docs/roadmap-progress.md`), e.g.
   `docs: add Slice 8 finite-shoe design sub-plan and mark needs review`.
4. Push to `origin main`, report, and **stop**.
5. Do **NOT** advance **Next slice** past 8 — leave it at 8 until the owner
   approves a design. (Only after approval does a future run implement it.)

**Context carried forward (so the design sub-plan is grounded in the real code):**

- Counting engine `src/app/core/services/counting-engine.service.ts` is
  system-agnostic and already pure: `runningCount(cards, system)` sums
  `values[rank]`; `trueCount(running, decksRemaining) = Math.trunc(running /
decksRemaining)`. Today decks-remaining is a **preset the user picks** before a
  true-count drill (`DECKS_REMAINING_PRESETS = [0.5,1,1.5,2,2.5,3,4,5,6]` in
  `src/app/core/models/card-counting.model.ts`); Slice 8 replaces that preset
  with a live estimate from a real finite shoe.
- The drill flow lives in
  `src/app/features/card-counting/card-counting-page.component.ts` (state machine
  `idle → streaming → answering → feedback`) and currently draws cards from
  `CardGeneratorService` (`generateSequence(n)`) — an **infinite** i.i.d. source
  with no depletion. A finite shoe is a new model/service under
  `src/app/core/` (e.g. `shoe.model.ts` / a `ShoeService`) that deals without
  replacement and tracks cards dealt / decks remaining.
- Four counting systems now exist (`hi-lo`, `ko`, `omega-ii`, `wong-halves`).
  KO is unbalanced (running-count only); the balanced three support true count.
  Finite-shoe estimation is a true-count concern, so it applies to the balanced
  systems.

**Files (design phase only):** `docs/roadmap.md` (status → Needs review),
`docs/roadmap-progress.md` (design sub-plan; keep Next slice = 8). No source
changes in this slice.

**Validation:** docs-only — no code to validate. (Do not advance to coding.)

**Commit:** `docs: add Slice 8 finite-shoe design sub-plan and mark needs review`

One-slice contract: this run does the design pause for Slice 8 only — one
`docs:` commit, push, stop. Do not implement the shoe, and do not start Slice 9.

## Execution log

| Slice | Title                                   | Status | Commit  | Validated                              | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----: | --------------------------------------- | ------ | ------- | -------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | Lint & format tooling                   | Done   | b6bd53c | typecheck+test+build+lint+format:check | 2026-06-03 | Added `format`/`format:check`/`lint` scripts + `.prettierignore`. Replaced the standalone CI `typecheck` step with `lint` (= typecheck + format:check, so typecheck still runs). Ran one repo-wide `prettier --write .` pass — reformatted many existing files. Ignored the untracked `docs/repo-current-state.md` scratch file in `.prettierignore`. ESLint deferred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
|     2 | LICENSE + license clarification         | Done   | afc3fda | lint+typecheck+test+build              | 2026-06-03 | Chose **MIT** (recorded default), copyright © 2026 Arthur Zhang (git author name; GitHub owner is `8C9D` — used the personal name per the recorded prompt). Added canonical MIT `LICENSE` at repo root (extensionless, so Prettier does not check it). Rewrote the README "App code" section to state MIT and carve out `public/cards/`; changed the card-art note from "all-rights-reserved" to "MIT license above". Left `package.json` (`license` field + `private: true`) unchanged — only `LICENSE` + `README.md` were in scope. Card attribution files untouched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
|     3 | Chart correctness golden-file guards    | Done   | f896c22 | lint+typecheck+test+build              | 2026-06-03 | Added `src/app/data/chart-values.golden.spec.ts` (+10 tests → 491 total). Chose **inline** golden literals (simplest; matches existing style). Basic-strategy charts serialized as rowKey → space-joined cells across upcards 2..A; deviations serialized one line per rule capturing ruleSet/category/hand/upcard/index/direction and basic→deviation action (`playerHandLabel` + `source` excluded as documentation, not the decision matrix). Guards **regressions only**, not original transcription errors (re-verifying vs the BJA PDFs stays a human task). Bootstrapped the golden via a throwaway Node type-strip script (not committed) to avoid transcription error. Verified the "any single cell flip fails" intent by flipping H17 hard 16 v9 (SUR_H→S) and the H17 insurance index (3→2): both turned the golden spec red (and the existing engine specs), then reverted. Chart data files unchanged.                                                                                                                                                                                                                                                                                              |
|     4 | Shared blackjack-UI / keyboard refactor | Done   | 3564bbf | lint+typecheck+test+build              | 2026-06-05 | Mechanical path (no pause): assessed remaining duplication first. Moved `BlackjackTableComponent` and `ActionButtonsComponent` from `features/basic-strategy/` to `src/app/shared/` (they were already shared via a cross-feature import from the deviations page) and repointed both pages' imports — removes the `features/deviations → features/basic-strategy` dependency. Extracted the duplicated trainer keydown body into `handleTrainerKeydown(event, { canNext, onNext, onAction })` in `core/keyboard.ts`; both pages delegate from their own `@HostListener` (behavior identical: basic-strategy gates Enter on a graded hand, deviations also on a valid next-hand). Added 6 helper unit tests (491→497). Feedback panels already share `feedback-shell` via content projection, and `rule-controls`/`stats-panel` were already shared — left as-is. `card-counting` keyboard handling untouched (out of scope).                                                                                                                                                                                                                                                                                     |
|     5 | KO (Knock-Out) counting system          | Done   | 3b1e365 | lint+typecheck+test+build              | 2026-06-05 | Safe default (no pause): KO is **running-count-only**; true-count stays Hi-Lo-only. Gated true-count on the existing `balanced` flag (not KO-by-name): the page exposes `trueCountAvailable = system().balanced`; added a `Counting system` `<select>` to `CountingSettingsComponent` (`systems`/`systemId`/`trueCountAvailable` inputs, `systemChange` output) that disables the true-count radio and shows a note when unbalanced; `onSystemChange` coerces mode→running-count for unbalanced systems. Page `system` is now a signal (was a const). Engine untouched — already system-agnostic (sums `values[rank]`). KO descriptor: 2–7→+1, 8–9→0, 10–A→−1, `balanced:false`, full-deck sum **+4** (differs from Hi-Lo only on the 7). New `data/counting-systems.spec.ts`; +27 tests (497→524). KO IRC/key-count true-count math deferred. Hi-Lo unaffected.                                                                                                                                                                                                                                                                                                                                                  |
|     6 | Widen CountValue + Omega II             | Done   | 0422a25 | lint+typecheck+test+build              | 2026-06-05 | Decision: None (proceeded). Widened `CountValue` from level-1 (−1/0/+1) to a level-2 integer union spanning −2…+2 — kept it an integer union (not `number`) to preserve cheap compile-time validation; fractional widening deferred to Slice 7. Engine untouched: `runningCount` already sums `values[rank]` so ±2 works, and `trueCount` is valid for the balanced Omega II. Added the `OMEGA_II` descriptor (2,3,7→+1; 4,5,6→+2; 8,A→0; 9→−1; 10,J,Q,K→−2; `balanced:true`, full-deck sum **0**) and appended it to `COUNTING_SYSTEMS`; the selector is data-driven, so no new UI wiring. Hi-Lo/KO values and outputs unchanged. Updated the page spec's selectable-systems assertion to include `omega-ii` and added a page test that Omega II keeps true count (balanced). `count-feedback-panel` `deltaLabel` already renders ±2. +14 tests (524→538).                                                                                                                                                                                                                                                                                                                                                       |
|     7 | Wong Halves counting system             | Done   | pending | lint+typecheck+test+build              | 2026-06-05 | Decision: representation — chose **true fractional values** (recorded default); doubled-integer ×2 not used. Widened `CountValue` from the `-2..2` union to `number` (the model comment had anticipated this); existing systems' values/outputs unchanged. Added `WONG_HALVES` (2,7→+0.5; 3,4,6→+1; 5→+1.5; 8→0; 9→−0.5; 10–A→−1; `balanced:true`, full-deck sum **0**) and appended to `COUNTING_SYSTEMS` (selector is data-driven). Engine: added `isValidDecimalAnswer` (sign + int + optional `.frac`) and `isFractionalSystem` (any non-integer per-rank value); `isValidIntegerAnswer`/`runningCount`/`trueCount` untouched — halves are binary-exact so `===` and `trunc` stay correct. Answer form: new `allowFractions` input (default false → integer behavior identical); `canSubmit` branches to the decimal validator, `onSubmit` now uses `Number()` (was `parseInt`, which truncated 2.5→2), dynamic `step=0.5`/`inputmode=decimal`, plus a UI note documenting the half-point convention. Page gates `fractionalAnswers = running-count mode && isFractionalSystem` (true count is always whole via trunc). `count-feedback-panel` already renders fractional deltas/totals. +30 tests (538→568). |
