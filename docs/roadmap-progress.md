# Roadmap Progress

_Maintained by the `roadmap-slice-autopilot` skill. The cursor below is the
source of truth for what runs next. Manual edits are fine if you keep the
format._

**Roadmap:** [docs/roadmap.md](roadmap.md)
**Next slice:** 9

## Slice 9 — design sub-plan (Needs review)

_Written 2026-06-06 by the `roadmap-slice-autopilot` pause-for-decision
protocol. **No feature code in this commit.** The owner must answer the open
questions below; a later run records the decisions (as the Slice 8 `fae00cc` run
did) and only then implements Slice 9._

### What the roadmap asks for

Slice 9 — "Multi-hand showdowns": after a drill ends, resolve hand(s) against a
dealer — hand resolution, dealer play, payouts, and a UI to drive the showdown.
The largest feature; it depends on everything above.

### What already exists that we can build on

- **Finite shoe** (`src/app/core/models/shoe.model.ts` `Shoe`,
  `src/app/core/services/shoe.service.ts` `ShoeService.create(decks, penetration)`):
  deals without replacement, Fisher–Yates behind `setRandomSource`, tracks
  `decksRemaining` / `needsReshuffle`. Slice 8's true-count trainer already
  holds a persistent shoe across rounds — a showdown can deal from that shoe.
- **Card model** (`src/app/core/models/card.model.ts`): `Card`, `cardHighValue`
  (ace = 11), `isAce`, `isTenValue`. **Gap:** the helpers are two-card only
  (`softNonAceValue`, `Scenario`); there is **no N-card, soft-aware hand-total**
  function and no bust / natural-blackjack classifier for arbitrary hands.
- **Rules** (`src/app/core/models/strategy.model.ts`): `RuleSet = 'H17' | 'S17'`,
  `EngineOptions` (`doubleAfterSplit`, `lateSurrender`). The trainers already let
  the user pick H17/S17. **Gap:** `BasicStrategyEngineService` only _recommends
  the first action_ for a two-card hand; it never _plays a hand out_. There is
  **no dealer-play routine** (hit to 17; H17 hits soft 17) and no player
  auto-play.
- **Persistence** (`src/app/core/services/stats-store.ts` + per-feature stats
  services, each its own localStorage key). A bankroll / results tracker would
  follow this pattern.
- **Shared UI** (`shared/blackjack-table`, `shared/action-buttons`,
  `shared/card-image`, `shared/feedback-shell`, `shared/rule-controls`,
  `shared/stats-panel`) and `core/keyboard.ts`.

So Slice 9's genuinely **new** building blocks are: (a) an N-card hand evaluator
(total, soft/hard, bust, natural blackjack); (b) a dealer-play routine
parameterized by `RuleSet`; (c) a settlement/payout helper (win/lose/push,
blackjack 3:2, bust); and (d) the showdown UI + state.

### Showdown rules to confirm (proposed defaults; owner to ratify)

- **Dealer play:** stand on hard 17+; on soft 17, hit under **H17**, stand under
  **S17** — reuse the existing `RuleSet`.
- **Naturals / payout:** player blackjack pays **3:2**; dealer blackjack beats
  any non-blackjack; two naturals push.
- **Outcomes:** win / lose / push; a player bust loses immediately even if the
  dealer later busts; a dealer bust pays a standing hand even money.
- **Player actions in a first slice:** _hit/stand only_ vs _doubles_ vs _full
  splits & doubles_. Splits/doubles materially expand scope (multiple hands per
  box, re-split limits, DAS) — recommend **out of a first slice**.

### Design options

**Option A — Minimal "play one hand vs the dealer" (recommended).** One player
hand. After the existing drill, deal from the _same shoe_; the player hits/stands
(reusing `action-buttons`) until standing or busting; the dealer auto-plays by
`RuleSet`; settle win/lose/push with 3:2 naturals; show the result in
`feedback-shell`. No splits/doubles; bankroll is just a per-session
win/loss/push tally. New code: a `hand-evaluator` + `dealer-play` in `core/`, a
showdown component, and a small results stat store. The smallest correct
vertical slice; defers the genuinely hard parts (splits, bankroll).

**Option B — Multi-hand (true to the title), still no splits.** The player plays
_K_ simultaneous hands (configurable 1–3 boxes) against one dealer from the shoe;
each hand is played and settled independently; optional flat-bet bankroll.
Honors the "multi-hand" name but adds per-box UI/state and a betting surface;
still no splits/doubles. Medium scope.

**Option C — Full table with splits, doubles, and a bankroll.** Splits
(re-split/DAS), doubles, surrender, configurable bet sizing, and a persisted
bankroll — a complete play simulator. Closest to a real game and best for "bet
the count," but by far the largest; would itself want to be broken into
sub-slices. Recommend deferring beyond a first showdown slice.

**Recommendation:** ship **Option A** as Slice 9 (single hand, single shoe,
H17/S17 dealer, 3:2 naturals, session tally), then consider B/C as follow-on
slices. It delivers a correct, testable showdown end-to-end, reuses the shoe and
shared UI, and isolates the two new engines (hand evaluator, dealer play) that B
and C also need — so the hard correctness work is done once and extended
incrementally. (If the owner wants the "multi-hand" name honored immediately,
pick B; A's evaluator/dealer-play are designed to extend to multiple boxes.)

### Open questions only the owner can settle (no safe default)

1. **Card source:** reuse the Slice 8 finite **shoe** for realistic dealing
   (recommended — ties the showdown to the count just practiced), or deal fresh
   i.i.d. cards from `CardGeneratorService`?
2. **One hand or many:** single player hand (Option A) or multiple simultaneous
   hands (Option B, "multi-hand")?
3. **Bankroll / payouts:** track a persisted bankroll + bet sizing, or just
   resolve win/lose/push (with a session tally) in a first slice?
4. **Attach point:** chain the showdown after the **card-counting** drill (the
   roadmap's "after the count drill ends"), after basic-strategy, after
   deviations, or a **new standalone** route/feature?
5. **Dealer rules:** reuse the existing **H17/S17** `RuleSet` (recommended); if
   standalone, what is the default and is it user-toggleable?
6. **Player-action scope:** hit/stand only (recommended first), or include
   doubles / splits / surrender in the first slice?

### When approved, the implementation slice would (Option A shape)

- Add `core/services/hand-evaluator` (N-card total, soft/hard, bust, natural) and
  `core/services/dealer-play` (auto-play by `RuleSet`), both pure and
  unit-tested, plus a `settle()` payout helper (3:2 naturals, push, bust).
- Add a showdown component + minimal state; deal from the existing shoe; reuse
  `blackjack-table` / `action-buttons` / `feedback-shell` / `core/keyboard.ts`.
- Add a results store (its own localStorage key, per the stats pattern).
- Wire it at the chosen attach point; run baseline validation + a manual smoke.
- Commit: `feat: add post-count multi-hand showdowns` (per the roadmap).

## Prompt for next slice (slice 9)

> **Decision-recording step — still NO feature code.** Slice 9 is **Needs
> review**: the design sub-plan above is written, and the owner now needs to
> answer its open questions. This run gathers those answers, records them, and
> stops — exactly as the Slice 8 `fae00cc` run did between its sub-plan and its
> implementation. Governed by the one-slice contract + pause-for-decision
> protocol.

**At startup — backfill the previous hash:** the prior execution-log row (Slice
9 design sub-plan, `docs: add Slice 9 multi-hand showdown design sub-plan`) was
logged with commit `pending`. Find it (`git log --oneline`) and replace
`pending` with the real short hash, including that fix in this run's single
commit.

**What to do (no feature code):**

1. Put the six open questions from the Slice 9 sub-plan to the owner via
   `AskUserQuestion` (card source; one hand vs multi-hand; bankroll vs
   win/lose/push; attach point; dealer rules; player-action scope). Offer the
   sub-plan's recommendation as the first/recommended option for each.
2. Record the answers in `docs/roadmap-progress.md`: add a
   `## Slice 9 — decisions (locked)` section summarizing each choice, and
   **rewrite this "Prompt for next slice (slice 9)" section** into a concrete,
   self-contained _implementation_ prompt for Slice 9 (scope, files, acceptance
   criteria, validation `npm run lint` + `CI=true npm test` + `npm run build` +
   manual smoke, commit `feat: add post-count multi-hand showdowns`).
3. Set Slice 9's **Status** in `docs/roadmap.md` from **Needs review** →
   **Planned**, and update its **Decision** field to "Resolved 2026-06-06" (or
   the run date) with a one-line summary of the choices.
4. Append an execution-log row (Slice 9, "decisions recorded", Planned, commit
   `pending`, docs-only).
5. Make **one** `docs:` commit (decisions + rewritten prompt + status + hash
   backfill), push to `origin main`, and **stop**. Keep **Next slice** at **9** —
   the following run implements it.

**Commit:** `docs: record Slice 9 multi-hand showdown design decisions`

**One-slice contract reminder:** do only this decision-recording step; one
commit; push; leave **Next slice** at 9.

## Execution log

| Slice | Title                                   | Status       | Commit  | Validated                              | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----: | --------------------------------------- | ------------ | ------- | -------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | Lint & format tooling                   | Done         | b6bd53c | typecheck+test+build+lint+format:check | 2026-06-03 | Added `format`/`format:check`/`lint` scripts + `.prettierignore`. Replaced the standalone CI `typecheck` step with `lint` (= typecheck + format:check, so typecheck still runs). Ran one repo-wide `prettier --write .` pass — reformatted many existing files. Ignored the untracked `docs/repo-current-state.md` scratch file in `.prettierignore`. ESLint deferred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
|     2 | LICENSE + license clarification         | Done         | afc3fda | lint+typecheck+test+build              | 2026-06-03 | Chose **MIT** (recorded default), copyright © 2026 Arthur Zhang (git author name; GitHub owner is `8C9D` — used the personal name per the recorded prompt). Added canonical MIT `LICENSE` at repo root (extensionless, so Prettier does not check it). Rewrote the README "App code" section to state MIT and carve out `public/cards/`; changed the card-art note from "all-rights-reserved" to "MIT license above". Left `package.json` (`license` field + `private: true`) unchanged — only `LICENSE` + `README.md` were in scope. Card attribution files untouched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
|     3 | Chart correctness golden-file guards    | Done         | f896c22 | lint+typecheck+test+build              | 2026-06-03 | Added `src/app/data/chart-values.golden.spec.ts` (+10 tests → 491 total). Chose **inline** golden literals (simplest; matches existing style). Basic-strategy charts serialized as rowKey → space-joined cells across upcards 2..A; deviations serialized one line per rule capturing ruleSet/category/hand/upcard/index/direction and basic→deviation action (`playerHandLabel` + `source` excluded as documentation, not the decision matrix). Guards **regressions only**, not original transcription errors (re-verifying vs the BJA PDFs stays a human task). Bootstrapped the golden via a throwaway Node type-strip script (not committed) to avoid transcription error. Verified the "any single cell flip fails" intent by flipping H17 hard 16 v9 (SUR_H→S) and the H17 insurance index (3→2): both turned the golden spec red (and the existing engine specs), then reverted. Chart data files unchanged.                                                                                                                                                                                                                                                                                                                                                         |
|     4 | Shared blackjack-UI / keyboard refactor | Done         | 3564bbf | lint+typecheck+test+build              | 2026-06-05 | Mechanical path (no pause): assessed remaining duplication first. Moved `BlackjackTableComponent` and `ActionButtonsComponent` from `features/basic-strategy/` to `src/app/shared/` (they were already shared via a cross-feature import from the deviations page) and repointed both pages' imports — removes the `features/deviations → features/basic-strategy` dependency. Extracted the duplicated trainer keydown body into `handleTrainerKeydown(event, { canNext, onNext, onAction })` in `core/keyboard.ts`; both pages delegate from their own `@HostListener` (behavior identical: basic-strategy gates Enter on a graded hand, deviations also on a valid next-hand). Added 6 helper unit tests (491→497). Feedback panels already share `feedback-shell` via content projection, and `rule-controls`/`stats-panel` were already shared — left as-is. `card-counting` keyboard handling untouched (out of scope).                                                                                                                                                                                                                                                                                                                                                |
|     5 | KO (Knock-Out) counting system          | Done         | 3b1e365 | lint+typecheck+test+build              | 2026-06-05 | Safe default (no pause): KO is **running-count-only**; true-count stays Hi-Lo-only. Gated true-count on the existing `balanced` flag (not KO-by-name): the page exposes `trueCountAvailable = system().balanced`; added a `Counting system` `<select>` to `CountingSettingsComponent` (`systems`/`systemId`/`trueCountAvailable` inputs, `systemChange` output) that disables the true-count radio and shows a note when unbalanced; `onSystemChange` coerces mode→running-count for unbalanced systems. Page `system` is now a signal (was a const). Engine untouched — already system-agnostic (sums `values[rank]`). KO descriptor: 2–7→+1, 8–9→0, 10–A→−1, `balanced:false`, full-deck sum **+4** (differs from Hi-Lo only on the 7). New `data/counting-systems.spec.ts`; +27 tests (497→524). KO IRC/key-count true-count math deferred. Hi-Lo unaffected.                                                                                                                                                                                                                                                                                                                                                                                                             |
|     6 | Widen CountValue + Omega II             | Done         | 0422a25 | lint+typecheck+test+build              | 2026-06-05 | Decision: None (proceeded). Widened `CountValue` from level-1 (−1/0/+1) to a level-2 integer union spanning −2…+2 — kept it an integer union (not `number`) to preserve cheap compile-time validation; fractional widening deferred to Slice 7. Engine untouched: `runningCount` already sums `values[rank]` so ±2 works, and `trueCount` is valid for the balanced Omega II. Added the `OMEGA_II` descriptor (2,3,7→+1; 4,5,6→+2; 8,A→0; 9→−1; 10,J,Q,K→−2; `balanced:true`, full-deck sum **0**) and appended it to `COUNTING_SYSTEMS`; the selector is data-driven, so no new UI wiring. Hi-Lo/KO values and outputs unchanged. Updated the page spec's selectable-systems assertion to include `omega-ii` and added a page test that Omega II keeps true count (balanced). `count-feedback-panel` `deltaLabel` already renders ±2. +14 tests (524→538).                                                                                                                                                                                                                                                                                                                                                                                                                  |
|     7 | Wong Halves counting system             | Done         | a27525a | lint+typecheck+test+build              | 2026-06-05 | Decision: representation — chose **true fractional values** (recorded default); doubled-integer ×2 not used. Widened `CountValue` from the `-2..2` union to `number` (the model comment had anticipated this); existing systems' values/outputs unchanged. Added `WONG_HALVES` (2,7→+0.5; 3,4,6→+1; 5→+1.5; 8→0; 9→−0.5; 10–A→−1; `balanced:true`, full-deck sum **0**) and appended to `COUNTING_SYSTEMS` (selector is data-driven). Engine: added `isValidDecimalAnswer` (sign + int + optional `.frac`) and `isFractionalSystem` (any non-integer per-rank value); `isValidIntegerAnswer`/`runningCount`/`trueCount` untouched — halves are binary-exact so `===` and `trunc` stay correct. Answer form: new `allowFractions` input (default false → integer behavior identical); `canSubmit` branches to the decimal validator, `onSubmit` now uses `Number()` (was `parseInt`, which truncated 2.5→2), dynamic `step=0.5`/`inputmode=decimal`, plus a UI note documenting the half-point convention. Page gates `fractionalAnswers = running-count mode && isFractionalSystem` (true count is always whole via trunc). `count-feedback-panel` already renders fractional deltas/totals. +30 tests (538→568).                                                            |
|     8 | Finite-shoe live deck estimation        | Needs review | 8a83325 | docs-only (design pause)               | 2026-06-05 | Pause-for-decision (no safe default): wrote the Slice 8 design sub-plan — finite-shoe model (`shoe.model.ts`/`ShoeService`, deals without replacement, tracks `decksRemaining`), how it wires into the true-count trainer (live shoe `decksRemaining` replaces the `DECKS_REMAINING_PRESETS` pick; shoe persists across rounds to the cut card), and **3 prompt/scoring options** with a recommendation + **8 open questions** — and set roadmap Status → **Needs review**. **No feature code.** Recommended Option 1: estimate-then-reveal, true count graded vs **actual** decks, separate ±0.5-deck estimation accuracy stat. Applies to balanced systems (hi-lo/omega-ii/wong-halves); KO unaffected. Next slice stays **8** until the owner decides. Also backfilled Slice 7's commit hash (pending → a27525a).                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
|     8 | Finite-shoe — design decisions recorded | Planned      | fae00cc | docs-only (decisions recorded)         | 2026-06-05 | Owner answered the 4 load-bearing Slice 8 questions via the autopilot AskUserQuestion prompt (all recommended): grade true count vs **actual** decks + separate ±0.5-deck estimation stat; shoe **persists** to the cut card; **player-configurable** decks (1/2/6/8) + penetration (~75%); **keep** `DECKS_REMAINING_PRESETS` as a classic mode. Defaulted the other four (half-deck ±0.5 band; auto-reshuffle+notice+count-reset at the cut; finite shoe in true-count mode only; separate persisted estimation-accuracy store) — see §6. Rewrote the slice-8 prompt as a concrete implementation prompt and set roadmap Status Needs review → Planned. No feature code. Next slice stays 8 (now ready to build).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
|     8 | Finite-shoe live deck estimation        | Done         | 4088446 | lint+typecheck+test+build              | 2026-06-05 | Implemented per the owner-locked decisions. New `shoe.model.ts` (`Shoe`: deals without replacement, `decksRemaining` to bottom of shoe, cut card at penetration, `needsReshuffle`) + `ShoeService` (Fisher–Yates behind `setRandomSource`). New `DeckEstimationStatsService` (own localStorage key) + `DeckEstimateFormComponent` (half-deck stepper). Engine: `evaluateTrueCount` gains a `priorRunningCount` (default 0, preserving classic behavior); new `scoreDeckEstimate` (±0.5 band); `validateSettings` covers live-shoe config. Model: settings gain `trueCountSource`/`numberOfDecks`/`penetration`; `TrueCountDrillResult` gains `priorRunningCount`/`deckEstimate`/`deckEstimateWithinBand`. Page: live-shoe TC draws from a persistent shoe, carries running count + decks across rounds to the cut, auto-reshuffles (visible notice + count reset), adds an `estimating` state, grades TC vs **actual** decks, records a separate deck-estimation stat, shows split stats panels. Settings: live-shoe (default) vs classic toggle + decks (1/2/6/8)/penetration (~75%)/live readout; classic `DECKS_REMAINING_PRESETS`, running-count, and KO/Omega II/Wong Halves paths unchanged. +71 tests (568→639). Backfilled the prior row's hash (pending → fae00cc). |
|     9 | Multi-hand showdowns — design sub-plan  | Needs review | pending | docs-only (design pause)               | 2026-06-06 | Pause-for-decision (no safe default): wrote the Slice 9 design sub-plan — what to reuse (finite shoe, shared UI, `RuleSet`) vs the genuinely new pieces (N-card hand evaluator, dealer-play routine, settlement/3:2 payout helper, showdown UI), **3 design options** (A single hand [recommended]; B multi-hand, no splits; C full table + bankroll) with a recommendation, and **6 open questions** only the owner can settle (card source; one vs many hands; bankroll vs win/lose/push; attach point; dealer rules; player-action scope) — and set roadmap Status → **Needs review**. **No feature code.** Next slice stays **9** (decisions next). Also backfilled Slice 8's commit hash (pending → 4088446).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
