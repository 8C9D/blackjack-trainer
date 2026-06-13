# Roadmap Progress

_Maintained by the `roadmap-slice-autopilot` skill. The cursor below is the
source of truth for what runs next. Manual edits are fine if you keep the
format._

**Roadmap:** [docs/roadmap.md](roadmap.md)
**Next slice:** 8

## Prompt for next slice (slice 8)

> **Status: paused — Needs review.** The design sub-plan for Slice 8 has now been
> written (see "Slice 8 — design sub-plan" below) and the roadmap Status is
> **Needs review**. **Next slice stays 8.** Do not implement feature code until the
> owner answers the open questions and selects the prompt/scoring + shoe options; a
> future run then records the chosen options here and implements Slice 8 as one
> feature commit. The original pause instructions are kept below for reference.

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

## Slice 8 — design sub-plan (Needs review)

_Written per the pause-for-decision protocol. Slice 8 has no safe default for how
the deck-remaining estimate is prompted and scored, so no feature code is written
until the owner picks the options below. Next slice stays 8._

### 1. Finite-shoe model (new, under `src/app/core/`)

- New `shoe.model.ts` + a `ShoeService` (or `Shoe` class) that owns a real, finite
  multiset of cards and deals **without replacement** — distinct from the existing
  `CardGeneratorService`, which draws i.i.d. **with replacement** and never
  depletes.
- Construction: `N` decks (typical 1 / 2 / 6 / 8). Build `52 × N` cards from the
  existing `ALL_RANKS × ALL_SUITS`, then shuffle.
- Randomness seam: reuse the `setRandomSource(fn)` pattern already on
  `CardGeneratorService` so a Fisher–Yates shuffle is deterministic in specs.
- State exposed: `cardsDealt`, `cardsRemaining`, and
  `decksRemaining = cardsRemaining / 52` (the live value the true count needs).
- Penetration / cut card: a configurable cut placed at a fraction of the shoe
  (e.g. 75%). Dealing past the cut triggers a reshuffle (see wiring). Decide
  whether `decksRemaining` is measured to the **bottom of the shoe** (standard) or
  **to the cut card**; recommend bottom-of-shoe to match how players estimate from
  the discard tray.

### 2. Wiring into the true-count trainer

- Today `start()` calls `cardGenerator.generateSequence(numberOfCards)` and the
  `decksRemaining` passed to `evaluateTrueCount(...)` is a **preset the user
  picks** (`DECKS_REMAINING_PRESETS`). Slice 8 makes true-count drills draw their
  `numberOfCards` from a persistent `Shoe`, and `decksRemaining` becomes the
  shoe's **live** value instead of a preset.
- Persistence (key design choice): for realistic depletion the shoe should
  **persist across rounds** until the cut card — the running count and
  decks-remaining then evolve as the player works down the shoe — rather than
  resetting every drill. This is a real change to the page state machine
  (`idle → streaming → answering → feedback`) and to running-count stat semantics
  (the count would carry across rounds within a shoe), which is exactly why this
  slice needs review.
- Scope by system: estimation is a true-count concern, so it applies to the
  **balanced** systems (`hi-lo`, `omega-ii`, `wong-halves`). KO is unbalanced /
  running-count-only and is unaffected. Running-count-only mode can keep using the
  i.i.d. generator unless the owner wants finite-shoe realism there too.
- The "Decks remaining" `<select>` preset in `counting-settings.component.ts` is
  superseded (in true-count mode) by shoe config (number of decks, penetration) +
  a live decks-remaining readout. Decide whether to keep the preset path as a
  "classic" mode or remove it.

### 3. Options for prompting & scoring the deck-remaining estimate

**Option 1 — Estimate-then-reveal, separate accuracy stat (recommended).** After
the stream ends, prompt "How many decks remain?" (half-deck stepper / number
input). Score it against the shoe's actual `decksRemaining` with a tolerance band
(e.g. within ±0.5 deck = good) and track a **separate** deck-estimation accuracy
stat — not folded into true-count correctness. Grade the true count against the
**actual** decks remaining so the counting skill is graded in isolation. _Pros:_
trains and measures both skills independently; least disruptive to existing
true-count grading. _Cons:_ two prompts per round.

**Option 2 — Estimate drives the true count, single pass/fail.** Prompt the deck
estimate, then grade the true count as `trunc(running / userEstimate)`. One
combined score; errors propagate as in real play. _Pros:_ most game-realistic.
_Cons:_ conflates two error sources — a perfect counter fails on an estimate slip;
harder to learn from.

**Option 3 — No explicit estimate; discard-tray readout, grade true count only.**
Show a visual discard tray / penetration bar; the player reads decks remaining off
it and answers only the true count, graded against actual decks remaining. _Pros:_
simplest UI. _Cons:_ does not actually train or measure the estimation skill, which
is the slice's stated goal.

### 4. Recommendation

Option 1, with the true count graded against **actual** decks remaining and the
estimate tracked as its own ±0.5-deck tolerance-banded accuracy stat (a third
persisted stat store alongside the running-count and true-count stores). It keeps
existing true-count semantics intact and learnable, makes estimation a first-class
but separate competency, and avoids punishing good counting for an estimate slip.
Option 2's realistic error-propagation can be a later toggle.

### 5. Open questions for the owner (no safe default — please decide)

1. **Grading:** true count vs **actual** decks (Option 1, recommended) or vs the
   user's **estimate** (Option 2)? Or a toggle offering both?
2. **Estimate granularity & tolerance:** half-deck stepper with a ±0.5 "good"
   band? Quarter-deck? A single pass threshold vs a good/close/off band?
3. **Shoe persistence:** persist the shoe across rounds until the cut card
   (realistic depletion; count carries over) — recommended — or reset per drill?
4. **Shoe config exposed:** let the user choose decks (1/2/6/8) and penetration
   (~50–90%, default ~75%)? Or fix sensible defaults?
5. **Reshuffle UX:** at the cut card, auto-reshuffle with a visible notice and
   reset the running count to 0?
6. **Mode coverage:** finite-shoe in true-count mode only (recommended), or also
   bring finite depletion to running-count drills?
7. **Classic presets:** keep `DECKS_REMAINING_PRESETS` as a fallback "pick the
   decks" mode, or remove it once the live shoe drives `decksRemaining`?
8. **Stats:** add a separate persisted deck-estimation accuracy store (new
   localStorage key, like the existing running/true-count stores)?

Once the owner answers, a future run records the chosen options in the slice-8
prompt above and implements Slice 8 as a single feature commit (shoe
model/service + true-count wiring + estimation prompt/scoring + specs).

## Execution log

| Slice | Title                                   | Status       | Commit  | Validated                              | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----: | --------------------------------------- | ------------ | ------- | -------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | Lint & format tooling                   | Done         | b6bd53c | typecheck+test+build+lint+format:check | 2026-06-03 | Added `format`/`format:check`/`lint` scripts + `.prettierignore`. Replaced the standalone CI `typecheck` step with `lint` (= typecheck + format:check, so typecheck still runs). Ran one repo-wide `prettier --write .` pass — reformatted many existing files. Ignored the untracked `docs/repo-current-state.md` scratch file in `.prettierignore`. ESLint deferred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
|     2 | LICENSE + license clarification         | Done         | afc3fda | lint+typecheck+test+build              | 2026-06-03 | Chose **MIT** (recorded default), copyright © 2026 Arthur Zhang (git author name; GitHub owner is `8C9D` — used the personal name per the recorded prompt). Added canonical MIT `LICENSE` at repo root (extensionless, so Prettier does not check it). Rewrote the README "App code" section to state MIT and carve out `public/cards/`; changed the card-art note from "all-rights-reserved" to "MIT license above". Left `package.json` (`license` field + `private: true`) unchanged — only `LICENSE` + `README.md` were in scope. Card attribution files untouched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
|     3 | Chart correctness golden-file guards    | Done         | f896c22 | lint+typecheck+test+build              | 2026-06-03 | Added `src/app/data/chart-values.golden.spec.ts` (+10 tests → 491 total). Chose **inline** golden literals (simplest; matches existing style). Basic-strategy charts serialized as rowKey → space-joined cells across upcards 2..A; deviations serialized one line per rule capturing ruleSet/category/hand/upcard/index/direction and basic→deviation action (`playerHandLabel` + `source` excluded as documentation, not the decision matrix). Guards **regressions only**, not original transcription errors (re-verifying vs the BJA PDFs stays a human task). Bootstrapped the golden via a throwaway Node type-strip script (not committed) to avoid transcription error. Verified the "any single cell flip fails" intent by flipping H17 hard 16 v9 (SUR_H→S) and the H17 insurance index (3→2): both turned the golden spec red (and the existing engine specs), then reverted. Chart data files unchanged.                                                                                                                                                                                                                                                                                              |
|     4 | Shared blackjack-UI / keyboard refactor | Done         | 3564bbf | lint+typecheck+test+build              | 2026-06-05 | Mechanical path (no pause): assessed remaining duplication first. Moved `BlackjackTableComponent` and `ActionButtonsComponent` from `features/basic-strategy/` to `src/app/shared/` (they were already shared via a cross-feature import from the deviations page) and repointed both pages' imports — removes the `features/deviations → features/basic-strategy` dependency. Extracted the duplicated trainer keydown body into `handleTrainerKeydown(event, { canNext, onNext, onAction })` in `core/keyboard.ts`; both pages delegate from their own `@HostListener` (behavior identical: basic-strategy gates Enter on a graded hand, deviations also on a valid next-hand). Added 6 helper unit tests (491→497). Feedback panels already share `feedback-shell` via content projection, and `rule-controls`/`stats-panel` were already shared — left as-is. `card-counting` keyboard handling untouched (out of scope).                                                                                                                                                                                                                                                                                     |
|     5 | KO (Knock-Out) counting system          | Done         | 3b1e365 | lint+typecheck+test+build              | 2026-06-05 | Safe default (no pause): KO is **running-count-only**; true-count stays Hi-Lo-only. Gated true-count on the existing `balanced` flag (not KO-by-name): the page exposes `trueCountAvailable = system().balanced`; added a `Counting system` `<select>` to `CountingSettingsComponent` (`systems`/`systemId`/`trueCountAvailable` inputs, `systemChange` output) that disables the true-count radio and shows a note when unbalanced; `onSystemChange` coerces mode→running-count for unbalanced systems. Page `system` is now a signal (was a const). Engine untouched — already system-agnostic (sums `values[rank]`). KO descriptor: 2–7→+1, 8–9→0, 10–A→−1, `balanced:false`, full-deck sum **+4** (differs from Hi-Lo only on the 7). New `data/counting-systems.spec.ts`; +27 tests (497→524). KO IRC/key-count true-count math deferred. Hi-Lo unaffected.                                                                                                                                                                                                                                                                                                                                                  |
|     6 | Widen CountValue + Omega II             | Done         | 0422a25 | lint+typecheck+test+build              | 2026-06-05 | Decision: None (proceeded). Widened `CountValue` from level-1 (−1/0/+1) to a level-2 integer union spanning −2…+2 — kept it an integer union (not `number`) to preserve cheap compile-time validation; fractional widening deferred to Slice 7. Engine untouched: `runningCount` already sums `values[rank]` so ±2 works, and `trueCount` is valid for the balanced Omega II. Added the `OMEGA_II` descriptor (2,3,7→+1; 4,5,6→+2; 8,A→0; 9→−1; 10,J,Q,K→−2; `balanced:true`, full-deck sum **0**) and appended it to `COUNTING_SYSTEMS`; the selector is data-driven, so no new UI wiring. Hi-Lo/KO values and outputs unchanged. Updated the page spec's selectable-systems assertion to include `omega-ii` and added a page test that Omega II keeps true count (balanced). `count-feedback-panel` `deltaLabel` already renders ±2. +14 tests (524→538).                                                                                                                                                                                                                                                                                                                                                       |
|     7 | Wong Halves counting system             | Done         | a27525a | lint+typecheck+test+build              | 2026-06-05 | Decision: representation — chose **true fractional values** (recorded default); doubled-integer ×2 not used. Widened `CountValue` from the `-2..2` union to `number` (the model comment had anticipated this); existing systems' values/outputs unchanged. Added `WONG_HALVES` (2,7→+0.5; 3,4,6→+1; 5→+1.5; 8→0; 9→−0.5; 10–A→−1; `balanced:true`, full-deck sum **0**) and appended to `COUNTING_SYSTEMS` (selector is data-driven). Engine: added `isValidDecimalAnswer` (sign + int + optional `.frac`) and `isFractionalSystem` (any non-integer per-rank value); `isValidIntegerAnswer`/`runningCount`/`trueCount` untouched — halves are binary-exact so `===` and `trunc` stay correct. Answer form: new `allowFractions` input (default false → integer behavior identical); `canSubmit` branches to the decimal validator, `onSubmit` now uses `Number()` (was `parseInt`, which truncated 2.5→2), dynamic `step=0.5`/`inputmode=decimal`, plus a UI note documenting the half-point convention. Page gates `fractionalAnswers = running-count mode && isFractionalSystem` (true count is always whole via trunc). `count-feedback-panel` already renders fractional deltas/totals. +30 tests (538→568). |
|     8 | Finite-shoe live deck estimation        | Needs review | pending | docs-only (design pause)               | 2026-06-05 | Pause-for-decision (no safe default): wrote the Slice 8 design sub-plan — finite-shoe model (`shoe.model.ts`/`ShoeService`, deals without replacement, tracks `decksRemaining`), how it wires into the true-count trainer (live shoe `decksRemaining` replaces the `DECKS_REMAINING_PRESETS` pick; shoe persists across rounds to the cut card), and **3 prompt/scoring options** with a recommendation + **8 open questions** — and set roadmap Status → **Needs review**. **No feature code.** Recommended Option 1: estimate-then-reveal, true count graded vs **actual** decks, separate ±0.5-deck estimation accuracy stat. Applies to balanced systems (hi-lo/omega-ii/wong-halves); KO unaffected. Next slice stays **8** until the owner decides. Also backfilled Slice 7's commit hash (pending → a27525a).                                                                                                                                                                                                                                                                                                                                                                                              |
