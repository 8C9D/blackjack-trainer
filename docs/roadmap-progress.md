# Roadmap Progress

_Maintained by the `roadmap-slice-autopilot` skill. The cursor below is the
source of truth for what runs next. Manual edits are fine if you keep the
format._

**Roadmap:** [docs/roadmap.md](roadmap.md)
**Next slice:** 8

## Prompt for next slice (slice 8)

> **Status: ready to implement.** The design pause is complete and the owner
> answered the Slice 8 design questions on 2026-06-05 (all recommended options — see
> "6. Decisions (resolved 2026-06-05)" in the sub-plan below). Implement Slice 8 now
> as a single feature commit. **Next slice stays 8** until it lands.

Implement **Slice 8 — Finite-shoe live deck estimation** from `docs/roadmap.md`.
One slice only: one feature commit, push, then record the prompt for Slice 9.

**Goal:** Replace the decks-remaining _preset pick_ with a live estimate read off a
real, finite, depleting shoe in true-count mode. After the card stream, prompt the
player for decks remaining, grade the true count against the shoe's **actual** decks
remaining, and track deck-estimation accuracy as a separate ±0.5-deck stat.

**Decisions to apply (locked in 2026-06-05):**

1. **Grading = Option 1:** grade the true count vs the shoe's **actual** decks
   remaining (NOT the user's estimate); track deck-estimation accuracy as its own
   stat. Do not fold the estimate into true-count correctness.
2. **Shoe persists across rounds** to the cut card: decks-remaining and the running
   count carry over and deplete as the player works down the shoe; reshuffle at the
   cut card.
3. **Player-configurable shoe:** expose number of decks (1 / 2 / 6 / 8) and
   penetration (~50–90%, default ~75%) as settings (true-count mode).
4. **Keep classic mode:** retain the `DECKS_REMAINING_PRESETS` picker as a
   selectable fallback ("classic") true-count mode alongside the new live-shoe mode.
   Default the live-shoe mode on; the preset path must keep working unchanged.
5. **Defaulted (recommended) — apply as-is:** estimate granularity = half-deck
   stepper with a **±0.5-deck "good" tolerance band**; at the cut card
   **auto-reshuffle with a visible notice and reset the running count to 0**; the
   finite shoe applies to **true-count mode only** (running-count drills keep the
   i.i.d. `CardGeneratorService`); add a **separate persisted deck-estimation
   accuracy store** (new localStorage key).

**Scope / concrete steps (grounded in the real code):**

- New `src/app/core/models/shoe.model.ts` + `src/app/core/services/shoe.service.ts`
  (or a `Shoe` class). Build `52 × N` cards from `ALL_RANKS × ALL_SUITS`
  (`card.model.ts`); Fisher–Yates shuffle behind a `setRandomSource(fn)` seam
  mirroring `CardGeneratorService` (deterministic specs). Deal **without
  replacement**; expose `cardsDealt`, `cardsRemaining`,
  `decksRemaining = cardsRemaining / 52` (measured to bottom-of-shoe), a cut card at
  the configured penetration, and a `needsReshuffle` / reshuffle API.
- `card-counting.model.ts`: add shoe config to settings (e.g. `numberOfDecks`,
  `penetration`, and a true-count sub-mode flag distinguishing **live-shoe** vs
  **classic preset**). Keep `DECKS_REMAINING_PRESETS` for classic mode. Carry the
  actual decks remaining + the user's deck estimate + whether it was within ±0.5 on
  the true-count result (extend `TrueCountDrillResult` or add fields).
- `counting-engine.service.ts` stays pure: keep `trueCount` / `evaluateTrueCount`
  graded against **actual** decks remaining; add a helper to score a deck estimate
  against actual within a ±0.5 band (or do it in the page). Extend `validateSettings`
  for shoe config (decks ∈ {1,2,6,8}; penetration in range) in live-shoe mode.
- `card-counting-page.component.ts` state machine: in live-shoe true-count mode draw
  the drill's `numberOfCards` from a persistent `ShoeService` instead of
  `cardGenerator.generateSequence(...)`; carry the shoe + running count across rounds
  until the cut, then auto-reshuffle (visible notice, reset running count). Add an
  estimate-prompt step after `streaming` (ask decks remaining, then the true count —
  or a combined form) without breaking the existing running-count and classic
  true-count flows.
- `counting-settings.component.ts`: add decks (1/2/6/8) + penetration controls and a
  live-shoe vs classic toggle (true-count mode). Keep the existing "Decks remaining"
  preset `<select>` for classic mode; add a live decks-remaining / penetration
  readout.
- Estimation prompt UI: extend `count-answer-form.component.ts` or add a small
  deck-estimate form (half-deck stepper, `step=0.5`, `inputmode=decimal`).
- New `src/app/core/services/deck-estimation-stats.service.ts` extending `StatsStore`
  with a new key (pattern: `true-count-stats.service.ts`); surface it via the stats
  panel in live-shoe mode.
- Specs (co-located `*.spec.ts`) for: shoe model/service (deal-without-replacement,
  depletion, `decksRemaining`, deterministic shuffle via the seam, cut-card /
  reshuffle), estimate scoring (±0.5 band), page wiring (round persistence +
  reshuffle, estimate prompt, true count graded vs actual), settings controls, the
  new stats store, and **regression**: Hi-Lo / KO / Omega II / Wong Halves
  running-count and the classic-preset true-count path unchanged.

**Files (likely):** `src/app/core/models/shoe.model.ts` (new),
`src/app/core/services/shoe.service.ts` (new),
`src/app/core/services/deck-estimation-stats.service.ts` (new),
`src/app/core/models/card-counting.model.ts`,
`src/app/core/services/counting-engine.service.ts`,
`src/app/features/card-counting/card-counting-page.component.ts`,
`src/app/features/card-counting/counting-settings.component.ts`,
`src/app/features/card-counting/count-answer-form.component.ts` (or a new
deck-estimate form), plus all co-located specs.

**Out of scope:** Showdowns (Slice 9); finite depletion for running-count drills;
Option-2 "estimate drives the true count" grading (can be a later toggle).

**Acceptance criteria:**

- [ ] A finite, persistent shoe drives a true-count drill end to end (dealt without
      replacement; decks-remaining + running count carry across rounds to the cut
      card; auto-reshuffle with notice + running-count reset at the cut).
- [ ] After the stream the player is prompted for decks remaining; the estimate is
      scored within a ±0.5-deck band and tracked in a separate persisted stat store.
- [ ] True count is graded against the shoe's **actual** decks remaining.
- [ ] Player can configure decks (1/2/6/8) and penetration (~75% default).
- [ ] Classic `DECKS_REMAINING_PRESETS` true-count mode still works unchanged.
- [ ] Running-count drills and Hi-Lo/KO/Omega II/Wong Halves behavior unchanged.
- [ ] Tests green.

**Validation:** `npm run lint`, `npm run typecheck`, `CI=true npm test`,
`npm run build`, plus a manual smoke of a live-shoe true-count drill.

**Commit:** `feat: add finite-shoe live deck estimation`

**One-slice contract:** implement only Slice 8; make exactly **one** commit (feature
code + this file's updates + `docs/roadmap.md` status → Done); push to `origin main`;
then record a self-contained prompt for **Slice 9 (Multi-hand showdowns)**. Slice 9
is itself a _pause-for-decision_ slice with **no safe default**, so its recorded
prompt must instruct the next run to write a design sub-plan and mark Slice 9
**Needs review** rather than implement. Do not start Slice 9 in this run.

## Slice 8 — design sub-plan (Needs review)

_Owner decisions recorded 2026-06-05 (see "6. Decisions (resolved 2026-06-05)"
below) — Slice 8 is now ready to implement. The options below are kept for context.
Next slice stays 8 until the feature lands._

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

The owner has now answered (2026-06-05); the chosen options are recorded in
"6. Decisions" below and encoded in the slice-8 implementation prompt above. A
future run implements Slice 8 as a single feature commit (shoe model/service +
true-count wiring + estimation prompt/scoring + specs).

### 6. Decisions (resolved 2026-06-05)

The owner answered the four load-bearing questions via the autopilot (all
recommended); the other four take the sub-plan's recommended defaults. By the
"5. Open questions" numbering above:

1. **Grading → Option 1 (owner):** grade the true count vs the shoe's **actual**
   decks remaining; track deck-estimation accuracy as a separate ±0.5-deck stat.
2. **Granularity & tolerance → default:** half-deck stepper, ±0.5-deck "good" band.
3. **Shoe persistence → persist (owner):** the shoe persists across rounds to the
   cut card (decks-remaining + running count carry over and deplete); reshuffle at
   the cut.
4. **Shoe config → configurable (owner):** expose decks (1/2/6/8) and penetration
   (~50–90%, default ~75%).
5. **Reshuffle UX → default:** auto-reshuffle at the cut with a visible notice and
   reset the running count to 0.
6. **Mode coverage → default:** finite shoe in true-count mode only; running-count
   drills keep the i.i.d. `CardGeneratorService`.
7. **Classic presets → keep (owner):** retain `DECKS_REMAINING_PRESETS` as a
   selectable "classic" true-count mode alongside the live shoe.
8. **Stats → default:** add a separate persisted deck-estimation accuracy store
   (new localStorage key, like the running/true-count stores).

These are encoded in the slice-8 implementation prompt above.

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
|     8 | Finite-shoe live deck estimation        | Needs review | 8a83325 | docs-only (design pause)               | 2026-06-05 | Pause-for-decision (no safe default): wrote the Slice 8 design sub-plan — finite-shoe model (`shoe.model.ts`/`ShoeService`, deals without replacement, tracks `decksRemaining`), how it wires into the true-count trainer (live shoe `decksRemaining` replaces the `DECKS_REMAINING_PRESETS` pick; shoe persists across rounds to the cut card), and **3 prompt/scoring options** with a recommendation + **8 open questions** — and set roadmap Status → **Needs review**. **No feature code.** Recommended Option 1: estimate-then-reveal, true count graded vs **actual** decks, separate ±0.5-deck estimation accuracy stat. Applies to balanced systems (hi-lo/omega-ii/wong-halves); KO unaffected. Next slice stays **8** until the owner decides. Also backfilled Slice 7's commit hash (pending → a27525a).                                                                                                                                                                                                                                                                                                                                                                                              |
|     8 | Finite-shoe — design decisions recorded | Planned      | pending | docs-only (decisions recorded)         | 2026-06-05 | Owner answered the 4 load-bearing Slice 8 questions via the autopilot AskUserQuestion prompt (all recommended): grade true count vs **actual** decks + separate ±0.5-deck estimation stat; shoe **persists** to the cut card; **player-configurable** decks (1/2/6/8) + penetration (~75%); **keep** `DECKS_REMAINING_PRESETS` as a classic mode. Defaulted the other four (half-deck ±0.5 band; auto-reshuffle+notice+count-reset at the cut; finite shoe in true-count mode only; separate persisted estimation-accuracy store) — see §6. Rewrote the slice-8 prompt as a concrete implementation prompt and set roadmap Status Needs review → Planned. No feature code. Next slice stays 8 (now ready to build).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
