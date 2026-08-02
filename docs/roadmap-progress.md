# Roadmap Progress

_Maintained by the `roadmap-slice-autopilot` skill. The cursor below is the
source of truth for what runs next. Manual edits are fine if you keep the
format._

**Roadmap:** [docs/roadmap.md](roadmap.md)
**Next slice:** none (roadmap complete)

## Slice 9 — design sub-plan (resolved 2026-06-06)

_Written 2026-06-06 by the `roadmap-slice-autopilot` pause-for-decision
protocol; **resolved 2026-06-06** — the owner answered all six open questions
(see "Slice 9 — decisions (locked)" below). Kept for rationale/history; the
implementation prompt at the end of this file is now the actionable spec._

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

## Slice 9 — decisions (locked)

_Owner answered all six open questions on 2026-06-06 via the autopilot
`AskUserQuestion` prompt — **every choice was the sub-plan's recommendation**
(Option A in full). No feature code in this commit; the next run implements
Slice 9 from the implementation prompt below._

1. **Card source — finite shoe.** Deal from the Slice 8 finite shoe (without
   replacement), reusing its depletion / cut-card logic, so the showdown ties to
   the count just practiced.
2. **Hands — single hand.** One player hand vs the dealer (Option A). Write the
   evaluator and dealer-play so they can extend to multiple boxes (Option B)
   later.
3. **Payouts — win/lose/push tally.** Resolve each hand win/lose/push with 3:2
   naturals and keep a tally. **No bankroll, money, or bet sizing.**
4. **Player actions — hit/stand only.** No doubles, splits, or surrender in this
   slice.
5. **Attach point — after the card-counting drill.** Chain the showdown off the
   end of a true-count drill round, dealing from the same persistent shoe (the
   live-shoe true-count path, where the persistent shoe already lives).
6. **Dealer rules — reuse the H17/S17 RuleSet.** Dealer stands on hard 17+ and
   hits soft 17 only under H17; user-toggleable, reusing the toggle the trainers
   already expose.

**Settlement rules to implement (standard, ratified with the above):** a player
natural (two-card 21) pays **3:2**; a dealer natural beats any non-natural player
hand; two naturals **push**; a player bust **loses immediately** even if the
dealer later busts; a dealer bust pays every standing (non-bust) player hand even
money; otherwise the higher total wins and equal totals push.

**Divergence from the roadmap wording:** the roadmap titles this slice
"multi-hand showdowns" and prescribes the commit `feat: add post-count
multi-hand showdowns`. Because the owner chose **single-hand** (Option A), the
implementation commit is the accurate `feat: add post-count showdown vs dealer`;
true multi-hand (Option B) and bankroll/splits/doubles (Option C) remain deferred
follow-on slices.

## Roadmap complete

All nine planned slices are **Done**. Slice 9 (the final slice) shipped the
single-hand post-count showdown (Option A) as `feat: add post-count showdown vs
dealer`. There is no next slice; **Next slice** is `none (roadmap complete)`.

### Post-roadmap: the deferred showdown options have since landed

The Slice 9 write-up below deferred **Option B** (multi-hand) and the
splits/doubles half of **Option C**. Both have since shipped:

- **Doubles and splits** (Option C, minus bankroll/bet sizing) — `feat: add
showdown doubles and splits, with audit and iOS cleanup fixes`.
- **Bankroll and bet sizing** (the rest of Option C, 2026-07-25) — the showdown
  can now be played for chips, behind Settings → Card counting → _Bet sizing
  (bankroll)_ (**off by default**, so the showdown stays the pure hand tally
  unless asked). A round opens on a bet before any card is dealt — the count just
  practised is the only information the decision rests on — every box posts that
  bet, and a double or split posts a second one. Settlement pays the stake on a
  win, 3:2 **on the bet** for a natural, returns it on a push, and forfeits it on
  a loss, against a persisted 500-chip bankroll (`blackjack-showdown-bankroll`).
  Chips are abstract units, not currency: the drill is the _ratio_ of bet to
  bankroll. A bet the bankroll cannot back across every box is not offered, a
  double or split that cannot be backed is withheld, and busting out offers a
  reset. The payout and bet-clamp math is pure (`core/models/bankroll.model.ts`),
  ported to `ios/BlackjackTrainer/Engine/Bankroll.swift`, and pinned by new
  `payoutCases` / `betClampCases` parity vectors (`showdown-vectors/3`).
  Surrender and insurance remain out of scope.
- **Multi-hand** (Option B, 2026-07-25) — the showdown now deals **one to three
  simultaneous boxes** against a single dealer, configured by
  `counting.showdownSpots` in flow prefs (Settings → Card counting → _Showdown
  hands_). The opening round deals in casino order; each box is played and
  settled independently; a dealer natural ends every box at once and a box
  holding a natural is paid immediately and sits out. Still **no bankroll or bet
  sizing** — the tally stays win/lose/push.

  One correctness note worth recording: the pre-existing code inferred "this
  hand came from a split" from `hands.length > 1`, which was sound while splits
  were the only way to get multiple hands. Multiple boxes break that inference
  (a natural in box 2 would have been denied its 3:2), so the flag is now
  tracked per hand as `fromSplit` on both platforms.

### Post-roadmap continued: insurance and late surrender (2026-07-27)

The last two pieces of showdown scope that had been called out as out of scope
have now shipped, each on both platforms with parity vectors.

- **Insurance** — with bet sizing on, a dealer ace pauses the deal in a new
  `insurance` phase before the hole card is checked: one take/skip decision
  (keys `I` / `N`) insures every box for half its bet, paid 2:1 on a dealer
  natural and forfeited otherwise. One decision covers all boxes because the
  count — the only input the drill cares about — is the same for every box. The
  offer is skipped when the bankroll's free chips cannot back it, and with
  betting off (insurance is purely a money bet). Pure math in
  `bankroll.model.ts` (`insuranceCost` / `insurancePayout`), ported to
  `Bankroll.swift`, pinned by `insuranceCases` (`showdown-vectors/4`).
- **Late surrender** — when the shared Late Surrender table rule is enabled, a
  box's original two cards may be given up as a first decision (key `R`),
  settling the box as an immediate loss; half the bet comes back when betting
  is on. Never after a split, and the option lapses once a card is drawn.
  Because the peek already settles any dealer natural before hands are played,
  the surrender on offer is genuinely _late_. The hand
  carries a `surrendered` flag so its verdict and payout read half a bet, not
  the full-stake loss its settlement would imply. `surrenderForfeit` is pinned
  by `surrenderCases` (`showdown-vectors/5`). Offered with betting off too —
  unlike insurance it is a playing decision from the charts, not a side bet —
  and recorded as a loss in the tally.

Both features also forced two structural moves on iOS to stay inside the
SwiftLint length caps: the play gates (`canDouble` / `canSplit` /
`canSurrender` and friends) now live in `ShowdownModel+Betting.swift`, and
`PlayerHand` has its own file.

### Post-roadmap continued: KO key count (2026-07-30)

The last web-side deferred item — "KO true count (IRC/key count)" — shipped on
both platforms. KO has no true count; what its book publishes instead is a
schedule, and that schedule is now a third drill mode, **Key count**, offered
only for systems that carry one (KO alone today).

- **The schedule** (Vancura & Fuchs, _Knock-Out Blackjack_, K-O Preferred;
  cross-checked against bonusinsider.com's reference table and
  blackjackinfo.com forum quotes of the book — sources cited in
  `data/counting-systems.ts`): IRC = 4 − 4×decks (0 / −4 / −20 / −28 for the
  shoe's 1/2/6/8 deck options), key counts +2 / +1 / −4 / −6, pivot +4,
  insurance at +3. Lives on the descriptor as `CountingSystem.keyCounts`
  (`KeyCountSchedule`), pinned by a golden spec including the
  IRC-plus-deck-sum-reaches-pivot identity.
- **The drill**: always a live shoe (deck/penetration settings shared with
  live-shoe true count), whose carried running count opens at the IRC — and
  resets to it at the cut-card reshuffle — rather than 0. After the stream the
  trainee answers the running count as usual, then a second question, "Do you
  have the advantage?" (Y/N), graded against the key count, which is
  deliberately not displayed: recalling it is the skill. Feedback cites the
  key count, IRC, pivot, and — at +3 or above — the insurance trigger. The rep
  is correct only when both parts are; the count answer feeds the running-count
  store and the advantage call a new `blackjack-key-count-stats` store. The
  post-count showdown attaches to the key-count drill exactly as it does to
  live-shoe true count (bet by the count just practised).
- **Gating**: mode `'key-count'` joins `DrillMode` on both platforms;
  `mergePrefs` / `FlowPrefs.merged` coerce it away from systems without a
  schedule, Settings disables the radio (web) or swaps the segmented picker
  (iOS), and `validateSettings` shares the live-shoe shoe checks.
- **Parity**: `counting-systems.json` (schema /2) carries `keyCounts`;
  `counting-vectors.json` (schema /2) adds `keyCountCases` — per-deck IRC/key
  rows plus advantage calls probed one either side of each threshold through
  the web engine — and `CountingParityTests` grades the Swift
  `evaluateKeyCount` against them.

### Post-roadmap continued: resetting practice data (2026-08-02)

Ten stores could be written but never cleared: `StatsStore.reset()` existed and had no caller outside the showdown's busted-out bankroll, and the history and miss tally had no reset at all.

- **One coordinator.** `PracticeDataService` holds every practice store and resets them in one call, so a new store is one line away from being covered rather than a silent omission.
  `PracticeHistoryService.reset()` and `MissTallyService.reset()` are new; the rest already had one.
- **Settings keeps its settings.** The rules, daily goal, appearance, and drill configuration are untouched: a trainee clearing their numbers has not changed their mind about the table they are practising for.
- **Two steps, no dialog.** The confirm replaces the button in place and names exactly what goes, matching the app's no-modal habit; a `role="status"` line confirms afterwards.
- **Validation.** +4 unit tests (962 total), an E2E that resets and reloads (the goal survives, the history does not), and a contrast sweep of the confirm state, the app's only destructive control; 70 E2E.
- **iOS mirror.** `AppModel.resetPracticeData()` is the coordinator (`PracticeHistoryStore.reset()` and `MissTallyStore.reset()` are new), and `PracticeDataSection` is its own file so `SettingsView` stays inside the `type_body_length` cap.
  It asks with a `confirmationDialog` rather than the web's in-place confirm — the platform's own answer for a destructive action — and `flowPrefs` is deliberately not in the list. +1 Swift test (303 total).
- **The destructive role picks its own red.** `Button(role: .destructive)` paints the label systemRed, ~3.5:1 on the light theme's near-white row; the label now takes `Theme.bad`, the pair tuned per scheme exactly as the web's `--bad` is.
  Only a real screenshot showed it: `ImageRenderer` draws a `Form` as its "unsupported" placeholder, so the section was run as the app's root view in the simulator and captured under both `simctl ui appearance` settings.

### Post-roadmap continued: the Progress screen (2026-08-02)

Eleven stores had been recording for months behind two accuracy chips on Home and a session summary that vanished on the next round.
`/progress` (`P` from Home) is the read-only place they surface.

- **This week** is seven bars, scaled against `max(dailyGoal, week's peak)` so a week spent under the goal does not render as a full bar; met days take the accent, the rest the muted foreground (a raised surface sat a hair off the track and read as empty), and today keeps an outline.
  The line under it carries the streak, the goal, and lifetime hands.
- **Trainers** is one table over all six `StatsStore`s — both drills plus running count, true count, deck estimate, and the key-count advantage call — as hands / accuracy / best run, with an em dash until a store has an attempt.
- **The showdown** card appears only once a hand has been played, and its chip line only once something was wagered, so a tally-only player never sees a bankroll.
- **Weak spots** repeat the Done screen's list per trainer, but persistently and in full: outstanding worst-first with "missed 3 of 7", plus the week's cleared scenarios.
- **A specificity bug caught by rendering, not by a test:** `.progress__good` (the ≥85% green) lost to `.progress__table td`'s own `--ink-2`, so the class applied and the colour did not.
  The unit test asserted the class, which is all jsdom can see without the global palette; nesting the rule inside the table block fixed it.
- **Validation.** +11 unit tests (958 total). `/progress` joined the E2E route sweep (contrast, landmark, heading) plus two navigation specs; 67 E2E, run four times.
- **iOS mirror.** `Flow/ProgressSummary.swift` (rows, bars, weekday initials, cleared label) plus `PracticeProgressView` / `ProgressBodyView` — named around SwiftUI's own `ProgressView` — and a fifth `FlowRoute`; Home's quiet row is now Chart / Progress / Settings on both platforms.
  The trainer table gives its three numeric columns fixed widths and the label the remainder: an even four-way `Grid` split truncated "Basic Strategy" on a phone. +7 Swift tests (302 total), both themes rendered.

### Post-roadmap continued: the deviation chart reference (2026-08-02)

The chart screen grew a second tab, so the Deviations trainer has a reference too.
A segmented switch above the rules line picks Basic strategy (the grids) or Deviations (the list), and the DAS / Late-Surrender chips drop away in the second, because no deviation rule reads them.

- **The list** comes from `deviationsFor(ruleSet)`, the same table the deviation engine looks up, grouped in the order the source PDF reads: insurance, hard, soft, pairs, surrender.
  Each row is hand ("Hard 16 vs 10", or "Dealer ace" for insurance, which has no player hand), the threshold, and the play as an action pill plus its word.
- **The threshold** prints the comparison the chart legend uses: `≥ +3` / `≤ -1` for the indexed directions (signs via the shared `formatSignedCount`), and `> 0` / `< 0` for the two count-sign directions, which carry no index.
- **Insurance** is the one action outside the basic grids' five, so it gets its own cell hue (`--chart-insurance`) and the symbol `I`.
- **Validation.** +5 unit tests (943 total) and a contrast sweep of the second tab in both themes (65 E2E), since the route sweep only ever measures a screen's opening state.
- **iOS mirror.** `StrategyChartGrid.deviationSections(rules:)` / `.threshold(_:)` (fed from `charts.deviations`, the same table `DeviationEngine` looks up) plus a `ChartMode` segmented `Picker` and a row list in `ChartGridView`; `Theme.chartInsurance` is the sixth cell hue.
  +4 Swift tests (295 total). The probe render shows the segmented picker as ImageRenderer's "unsupported" bar, which is a renderer limitation, not the screen: `.pickerStyle(.segmented)` is what Settings already uses in four places.

### Post-roadmap continued: the strategy chart reference (2026-08-02)

The app could grade a play but never show the chart it graded against.
`/chart` (a quiet `Chart` link next to Settings on home, key `C`) now renders the hard, soft, and pair grids for the rules the trainee actually plays under.

- **Rendered, not re-encoded.** Each cell calls `BasicStrategyEngineService.decide()` on a representative hand for its row rather than reading the chart data a second time, so the page cannot drift from what a miss is scored on.
  Rows are drawn as hands: hard totals below 12 as `x,2` and 12+ as `10,x`, softs as `A,x`, pairs as `x,x`.
  Hard 20's only two-card form is `10,10`, and the pair row for tens is `N` against every upcard, so the engine falls through the pair lookup onto hard 20 and that row still shows its own play.
- **Rule-aware.** `SUR_H` / `SUR_S` / `SUR_Y` and `YN` cells resolve through the engine against the live `EngineOptions`, so turning Late Surrender on flips 16 vs 10 from `H` to `R`, and Double After Split flips 4,4 vs 5 from `H` to `P`.
  A pair the chart declines to split shows the fall-back play (10,10 stands, 5,5 doubles) rather than a bare `N`, because that is the action the drill grades.
- **Surrender is `R`, not `SUR`.** Ten columns have to fit a 320px screen; three glyphs overran the cell and merged into the neighbouring one.
  The legend and each cell's `aria-label` (`Hit`, `Stand`, ..., `Surrender`) spell every symbol out, so color and the letter are never the only carriers.
- **Palette.** Five chart-cell tints joined the two palette mixins in `src/styles.scss` (hit, stand, double, split, surrender), always under `--ink`.
- **iOS mirror.** `StrategyChartGrid` (pure, in `Engine/`, reusing `ChartKeys` for the row/column lists) plus `ChartView` / `ChartGridView`, a fourth `FlowRoute`, and the same `Chart` / `Settings` pair on Home.
  The body is split from its navigation shell because `ImageRenderer` draws a `NavigationStack` as the "unsupported" glyph, and an ImageRenderer probe is the only way to look at a screen in this project; both themes were rendered and match the web cell for cell.
  Five chart-cell fills joined `Theme`. +11 Swift tests (292 total).
- **Validation.** +16 unit tests (938 total), including guards that every representative hand lands on the row it is meant to.
  `/chart` joined the E2E route sweep, so its markup and both themes' contrast are measured, plus two navigation specs (the home link and the `C` key); the suite is 63 tests and was run four times for flakiness.

### Bugs found reviewing the multi-box work (2026-07-25)

Three defects surfaced while reviewing and exercising the multi-box showdown.
Each was reproduced with a failing test (or a render) before the fix, and each
was fixed on both platforms where it applied.

- **The four-hand split cap counted the whole table, not the box.** `MAX_HANDS`
  (web) / `maxHands` (Swift) compared against `hands.length`, which was the
  box's own hand count only while there was one box. With three boxes occupied
  the table opened at three hands, so a single split exhausted the cap and a
  fresh 8,8 in box 2 was refused. Hands now carry their `box`, and the cap —
  renamed `MAX_HANDS_PER_BOX` / `maxHandsPerBox` — counts only the hands sharing
  that box. A split's two halves stay in the box that split.
- **iOS never folded the showdown's cards into the carried running count.** The
  web hands every dealt card back on exit so the next true-count round's
  numerator and denominator agree; `ShowdownModel` tracked no such list and
  `CountingModel.exitShowdown()` took no argument, so an iOS trainee who counted
  the visible showdown cards was graded wrong on the following round. The model
  now accumulates `dealtCards` and the exit carries them through.
- **Two contrast failures.** The showdown's `[Enter]` key hint sat at 3.84:1 on
  the accent fill (AA wants 4.5:1 at that size) — the a11y E2E only measured
  each route's opening state, so the showdown was never sampled; it now walks
  into the showdown in both themes. On iOS, `.borderedProminent` was left to
  pick its own label colour: white on `Theme.raised` (a light surface in the
  light theme) made every drill's Hit/Stand/Double/Split labels near-invisible,
  and white on the amber accent fill failed AA in both themes. Filled buttons
  now state their label colour, via a shared `accentFilledButton()` modifier
  pairing the accent fill with `onAccent`, exactly as the web does.

What Slice 9 added (Option A, as locked above):

- **`core/models/hand.model.ts`** — pure N-card, soft-aware hand math
  (`handTotal`, `isSoftHand`, `isBust`, `isBlackjack`).
- **`core/models/showdown.model.ts`** — pure `dealerShouldHit` / `playDealerHand`
  (hit to hard 17; hit soft 17 only under H17) and `settle(player, dealer)`
  returning `{ outcome, playerBlackjack, dealerBlackjack }`, plus the
  `MIN_SHOWDOWN_CARDS` gate.
- **`core/services/showdown-stats.service.ts`** — win/lose/push (+ player
  blackjacks) tally under its own localStorage key (`blackjack-showdown-stats`);
  it does **not** extend `StatsStore` because the tally is ternary, not the
  correct/incorrect binary model.
- **`features/card-counting/showdown.component.ts`** — self-contained showdown
  UI: deals from the passed live `Shoe`, hit/stand via `shared/action-buttons`
  (now subsettable) + `handleTrainerKeydown`, auto-plays the dealer, settles,
  records the tally, and carries its own H17/S17 dealer-rule toggle.
- **Page wiring** — `card-counting-page` offers the showdown after a live-shoe
  true-count round, deals from the **same persistent shoe** (depletion carries
  back; the next round reshuffles past the cut), locks settings during a
  showdown, and owns the `ruleSet` signal (default S17). Classic-preset,
  running-count, and KO/Omega II/Wong Halves paths and the other trainers are
  unchanged.

Divergences from the original roadmap wording (all pre-ratified): single-hand
**Option A** instead of literal "multi-hand", commit `feat: add post-count
showdown vs dealer` instead of `…multi-hand showdowns`. The dealer-rule toggle
reuses the `RuleSet` type and an H17/S17 radio **inside the showdown** rather
than the shared `RuleControlsComponent`, which bundles DAS / Late-Surrender
options that are irrelevant to a hit/stand-only showdown. Deferred follow-ons:
true multi-hand (Option B) and bankroll / splits / doubles (Option C).

To extend the roadmap, add new slices to [`docs/roadmap.md`](roadmap.md) and set
**Next slice** above back to a number.

## Execution log

| Slice | Title                                     | Status       | Commit  | Validated                              | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----: | ----------------------------------------- | ------------ | ------- | -------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | Lint & format tooling                     | Done         | b6bd53c | typecheck+test+build+lint+format:check | 2026-06-03 | Added `format`/`format:check`/`lint` scripts + `.prettierignore`. Replaced the standalone CI `typecheck` step with `lint` (= typecheck + format:check, so typecheck still runs). Ran one repo-wide `prettier --write .` pass — reformatted many existing files. Ignored the untracked `docs/repo-current-state.md` scratch file in `.prettierignore`. ESLint deferred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
|     2 | LICENSE + license clarification           | Done         | afc3fda | lint+typecheck+test+build              | 2026-06-03 | Chose **MIT** (recorded default), copyright © 2026 Arthur Zhang (git author name; GitHub owner is `8C9D` — used the personal name per the recorded prompt). Added canonical MIT `LICENSE` at repo root (extensionless, so Prettier does not check it). Rewrote the README "App code" section to state MIT and carve out `public/cards/`; changed the card-art note from "all-rights-reserved" to "MIT license above". Left `package.json` (`license` field + `private: true`) unchanged — only `LICENSE` + `README.md` were in scope. Card attribution files untouched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
|     3 | Chart correctness golden-file guards      | Done         | f896c22 | lint+typecheck+test+build              | 2026-06-03 | Added `src/app/data/chart-values.golden.spec.ts` (+10 tests → 491 total). Chose **inline** golden literals (simplest; matches existing style). Basic-strategy charts serialized as rowKey → space-joined cells across upcards 2..A; deviations serialized one line per rule capturing ruleSet/category/hand/upcard/index/direction and basic→deviation action (`playerHandLabel` + `source` excluded as documentation, not the decision matrix). Guards **regressions only**, not original transcription errors (re-verifying vs the BJA PDFs stays a human task). Bootstrapped the golden via a throwaway Node type-strip script (not committed) to avoid transcription error. Verified the "any single cell flip fails" intent by flipping H17 hard 16 v9 (SUR_H→S) and the H17 insurance index (3→2): both turned the golden spec red (and the existing engine specs), then reverted. Chart data files unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
|     4 | Shared blackjack-UI / keyboard refactor   | Done         | 3564bbf | lint+typecheck+test+build              | 2026-06-05 | Mechanical path (no pause): assessed remaining duplication first. Moved `BlackjackTableComponent` and `ActionButtonsComponent` from `features/basic-strategy/` to `src/app/shared/` (they were already shared via a cross-feature import from the deviations page) and repointed both pages' imports — removes the `features/deviations → features/basic-strategy` dependency. Extracted the duplicated trainer keydown body into `handleTrainerKeydown(event, { canNext, onNext, onAction })` in `core/keyboard.ts`; both pages delegate from their own `@HostListener` (behavior identical: basic-strategy gates Enter on a graded hand, deviations also on a valid next-hand). Added 6 helper unit tests (491→497). Feedback panels already share `feedback-shell` via content projection, and `rule-controls`/`stats-panel` were already shared — left as-is. `card-counting` keyboard handling untouched (out of scope).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
|     5 | KO (Knock-Out) counting system            | Done         | 3b1e365 | lint+typecheck+test+build              | 2026-06-05 | Safe default (no pause): KO is **running-count-only**; true-count stays Hi-Lo-only. Gated true-count on the existing `balanced` flag (not KO-by-name): the page exposes `trueCountAvailable = system().balanced`; added a `Counting system` `<select>` to `CountingSettingsComponent` (`systems`/`systemId`/`trueCountAvailable` inputs, `systemChange` output) that disables the true-count radio and shows a note when unbalanced; `onSystemChange` coerces mode→running-count for unbalanced systems. Page `system` is now a signal (was a const). Engine untouched — already system-agnostic (sums `values[rank]`). KO descriptor: 2–7→+1, 8–9→0, 10–A→−1, `balanced:false`, full-deck sum **+4** (differs from Hi-Lo only on the 7). New `data/counting-systems.spec.ts`; +27 tests (497→524). KO IRC/key-count true-count math deferred. Hi-Lo unaffected.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
|     6 | Widen CountValue + Omega II               | Done         | 0422a25 | lint+typecheck+test+build              | 2026-06-05 | Decision: None (proceeded). Widened `CountValue` from level-1 (−1/0/+1) to a level-2 integer union spanning −2…+2 — kept it an integer union (not `number`) to preserve cheap compile-time validation; fractional widening deferred to Slice 7. Engine untouched: `runningCount` already sums `values[rank]` so ±2 works, and `trueCount` is valid for the balanced Omega II. Added the `OMEGA_II` descriptor (2,3,7→+1; 4,5,6→+2; 8,A→0; 9→−1; 10,J,Q,K→−2; `balanced:true`, full-deck sum **0**) and appended it to `COUNTING_SYSTEMS`; the selector is data-driven, so no new UI wiring. Hi-Lo/KO values and outputs unchanged. Updated the page spec's selectable-systems assertion to include `omega-ii` and added a page test that Omega II keeps true count (balanced). `count-feedback-panel` `deltaLabel` already renders ±2. +14 tests (524→538).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
|     7 | Wong Halves counting system               | Done         | a27525a | lint+typecheck+test+build              | 2026-06-05 | Decision: representation — chose **true fractional values** (recorded default); doubled-integer ×2 not used. Widened `CountValue` from the `-2..2` union to `number` (the model comment had anticipated this); existing systems' values/outputs unchanged. Added `WONG_HALVES` (2,7→+0.5; 3,4,6→+1; 5→+1.5; 8→0; 9→−0.5; 10–A→−1; `balanced:true`, full-deck sum **0**) and appended to `COUNTING_SYSTEMS` (selector is data-driven). Engine: added `isValidDecimalAnswer` (sign + int + optional `.frac`) and `isFractionalSystem` (any non-integer per-rank value); `isValidIntegerAnswer`/`runningCount`/`trueCount` untouched — halves are binary-exact so `===` and `trunc` stay correct. Answer form: new `allowFractions` input (default false → integer behavior identical); `canSubmit` branches to the decimal validator, `onSubmit` now uses `Number()` (was `parseInt`, which truncated 2.5→2), dynamic `step=0.5`/`inputmode=decimal`, plus a UI note documenting the half-point convention. Page gates `fractionalAnswers = running-count mode && isFractionalSystem` (true count is always whole via trunc). `count-feedback-panel` already renders fractional deltas/totals. +30 tests (538→568).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
|     8 | Finite-shoe live deck estimation          | Needs review | 8a83325 | docs-only (design pause)               | 2026-06-05 | Pause-for-decision (no safe default): wrote the Slice 8 design sub-plan — finite-shoe model (`shoe.model.ts`/`ShoeService`, deals without replacement, tracks `decksRemaining`), how it wires into the true-count trainer (live shoe `decksRemaining` replaces the `DECKS_REMAINING_PRESETS` pick; shoe persists across rounds to the cut card), and **3 prompt/scoring options** with a recommendation + **8 open questions** — and set roadmap Status → **Needs review**. **No feature code.** Recommended Option 1: estimate-then-reveal, true count graded vs **actual** decks, separate ±0.5-deck estimation accuracy stat. Applies to balanced systems (hi-lo/omega-ii/wong-halves); KO unaffected. Next slice stays **8** until the owner decides. Also backfilled Slice 7's commit hash (pending → a27525a).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
|     8 | Finite-shoe — design decisions recorded   | Planned      | fae00cc | docs-only (decisions recorded)         | 2026-06-05 | Owner answered the 4 load-bearing Slice 8 questions via the autopilot AskUserQuestion prompt (all recommended): grade true count vs **actual** decks + separate ±0.5-deck estimation stat; shoe **persists** to the cut card; **player-configurable** decks (1/2/6/8) + penetration (~75%); **keep** `DECKS_REMAINING_PRESETS` as a classic mode. Defaulted the other four (half-deck ±0.5 band; auto-reshuffle+notice+count-reset at the cut; finite shoe in true-count mode only; separate persisted estimation-accuracy store) — see §6. Rewrote the slice-8 prompt as a concrete implementation prompt and set roadmap Status Needs review → Planned. No feature code. Next slice stays 8 (now ready to build).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
|     8 | Finite-shoe live deck estimation          | Done         | 4088446 | lint+typecheck+test+build              | 2026-06-05 | Implemented per the owner-locked decisions. New `shoe.model.ts` (`Shoe`: deals without replacement, `decksRemaining` to bottom of shoe, cut card at penetration, `needsReshuffle`) + `ShoeService` (Fisher–Yates behind `setRandomSource`). New `DeckEstimationStatsService` (own localStorage key) + `DeckEstimateFormComponent` (half-deck stepper). Engine: `evaluateTrueCount` gains a `priorRunningCount` (default 0, preserving classic behavior); new `scoreDeckEstimate` (±0.5 band); `validateSettings` covers live-shoe config. Model: settings gain `trueCountSource`/`numberOfDecks`/`penetration`; `TrueCountDrillResult` gains `priorRunningCount`/`deckEstimate`/`deckEstimateWithinBand`. Page: live-shoe TC draws from a persistent shoe, carries running count + decks across rounds to the cut, auto-reshuffles (visible notice + count reset), adds an `estimating` state, grades TC vs **actual** decks, records a separate deck-estimation stat, shows split stats panels. Settings: live-shoe (default) vs classic toggle + decks (1/2/6/8)/penetration (~75%)/live readout; classic `DECKS_REMAINING_PRESETS`, running-count, and KO/Omega II/Wong Halves paths unchanged. +71 tests (568→639). Backfilled the prior row's hash (pending → fae00cc).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
|     9 | Multi-hand showdowns — design sub-plan    | Needs review | 435d11b | docs-only (design pause)               | 2026-06-06 | Pause-for-decision (no safe default): wrote the Slice 9 design sub-plan — what to reuse (finite shoe, shared UI, `RuleSet`) vs the genuinely new pieces (N-card hand evaluator, dealer-play routine, settlement/3:2 payout helper, showdown UI), **3 design options** (A single hand [recommended]; B multi-hand, no splits; C full table + bankroll) with a recommendation, and **6 open questions** only the owner can settle (card source; one vs many hands; bankroll vs win/lose/push; attach point; dealer rules; player-action scope) — and set roadmap Status → **Needs review**. **No feature code.** Next slice stays **9** (decisions next). Also backfilled Slice 8's commit hash (pending → 4088446).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
|     9 | Multi-hand showdowns — decisions recorded | Planned      | f98cdea | docs-only (decisions recorded)         | 2026-06-06 | Owner answered all six Slice 9 open questions via the autopilot AskUserQuestion prompt — **every choice the recommended Option A**: deal from the finite **shoe** (no replacement); **single** player hand; **hit/stand only**; **win/lose/push** tally (no bankroll/bets); attach **after the card-counting drill** (persistent live shoe); dealer plays the active **H17/S17** RuleSet (3:2 naturals; player bust loses even if the dealer busts; two naturals push). Rewrote the slice-9 prompt into a concrete implementation prompt and set roadmap Status Needs review → Planned (Decision: Resolved 2026-06-06). Implementation commit will be `feat: add post-count showdown vs dealer` (single-hand Option A) — diverges from the roadmap's "multi-hand" wording; Options B/C deferred. No feature code. Next slice stays 9 (ready to build). Backfilled Slice 9 sub-plan hash (pending → 435d11b).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
|     9 | Post-count showdown vs dealer             | Done         | pending | lint+typecheck+test+build              | 2026-06-06 | Implemented single-hand Option A (all six decisions locked). New pure `core/models/hand.model.ts` (`handTotal`/`isSoftHand`/`isBust`/`isBlackjack`) and `core/models/showdown.model.ts` (`dealerShouldHit`/`playDealerHand` — hit to hard 17, hits soft 17 only under H17; `settle` returns outcome + player/dealer-blackjack flags; `MIN_SHOWDOWN_CARDS` gate). New `ShowdownStatsService` (own key `blackjack-showdown-stats`; ternary win/lose/push + blackjacks tally — does **not** extend `StatsStore`, whose model is binary correct/incorrect). New `ShowdownComponent` under features/card-counting: deals from the passed live `Shoe`, hit/stand via `shared/action-buttons` (generalized with an optional `actions` subset input, default unchanged) + `handleTrainerKeydown`, resolves naturals at the deal (effective peek), skips the dealer draw on a player bust, settles 3:2 naturals, records the tally, and carries its own H17/S17 dealer-rule toggle. Page: added a `showdown` state + `ruleSet` signal (default S17, persisted across hands), a post-feedback "Play a hand vs the dealer" CTA gated on a live shoe with 4+ cards, deals from the SAME persistent shoe (depletion carries back; the next round reshuffles past the cut), and locks settings during a showdown. Dealer-rule toggle reuses the `RuleSet` type + an H17/S17 radio inside the showdown rather than `RuleControlsComponent`, which bundles DAS/Late-Surrender options irrelevant to a hit/stand-only showdown. Classic-preset, running-count, and KO/Omega II/Wong Halves paths and the other trainers are unchanged. +71 tests (639 to 710). Backfilled the Slice 9 decisions-recorded hash (pending to f98cdea). Final slice — roadmap complete; this row's own commit hash stays `pending` (no next run to backfill it). |
