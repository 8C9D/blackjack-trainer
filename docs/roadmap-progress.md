# Roadmap Progress

> **Closed 2026-08-04.**
> The roadmap this cursor drove is complete, so nothing runs next and the log below is kept as the record of how each slice landed.

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

### Post-roadmap continued: five modes, told honestly (2026-08-02)

Adding modes quietly broke two surfaces that had been written when there were two.

- **Home's Card Counting chip summed the running- and true-count stores only.** The key-count call, the bet, and the deck countdown were invisible there, so a trainee who drilled nothing but deck speed saw "new" on the card forever.
  It now sums every counting store.
- **The drill's idle screen names the mode it is about to run.** Five modes differ enough — a self-paced deck, two-part answers — that "Start counting" no longer says what is coming.
  The labels are one shared map (`DRILL_MODE_LABELS`) that Settings' radios now render from too, so the two lists cannot drift.
- **Validation.** +3 unit tests (1042 total).
- **iOS mirror.** The same rollup (extracted as `countingAccuracy(_:)` so it is testable without the view) and the same idle-screen line, with `DrillMode.label` as the shared source for Settings' picker and the drill. +2 Swift tests (336 total).

### Post-roadmap continued: deck speed (2026-08-02)

The oldest drill in counting was the one the app could not do: the timed stream sets the pace, and counting down a deck is about measuring _yours_.

- **Self-paced, and it grades itself.** A shuffled deck with one card burned face down; the other 51 advance only on a tap (or the space bar), timed from the first card to the last.
  A full deck sums to a known constant — 0 balanced, +4 for KO — so the 51 shown must come to that constant minus the burned card's tag, and the burned card revealed in the feedback is the proof.
  No system gating: any set of tags can be summed.
- **The record only moves on a correct round**, because speed with the wrong count is not a counting skill.
  It persists under its own key (`blackjack-deck-speed-best`) beside the drill's accuracy store, and the Progress screen carries "Fastest deck counted down" under the trainer table.
  Under 30 seconds is the benchmark the feedback cites when a new best beats it.
- **The settings that do not apply are hidden**, not just ignored: the length and pacing fields disappear in this mode, replaced by a line explaining what the drill measures.
- **Validation.** +25 unit tests (1039 total), an E2E that flips all 51 and reads the burned-card proof, and a contrast sweep of the new stage and its feedback in both themes; 76 E2E.
  One of the session's own new tests turned out flaky — a bet-spread assertion that a carried count was non-zero, which is false whenever a round's cards cancel — and now asserts the carry-over itself.
- **iOS mirror.** `Engine/DeckSpeed.swift` + `evaluateDeckSpeed`, a `.flipping` state whose clock is an injected `now()` (the drill is self-paced, so there is no timer for a test to fast-forward), `DeckSpeedBestStore` for the record, and a stage that reuses `CountStreamView` with a `Next card` button bound to the space bar. +10 Swift tests (334 total), both themes rendered.
  Two adaptations: the record is its own store rather than a field on the shared stats shape (the web keeps two keys behind one service), and **the mode picker is now a menu row, not a segmented control** — four modes no longer fit a phone's width, and it now matches the System/shoe pickers around it.

### Post-roadmap continued: the bet spread (2026-08-02)

The app drilled count → convert → play, and stopped there.
Betting is where a counter's edge is actually taken, and it was the one step nothing graded: the showdown let a trainee bet anything at any count and never said a word about it.

- **A fourth drill mode.** `bet-spread` is the true-count round plus the question the count is for — "How many units do you bet?" — asked after the count exactly as the KO drill asks for the advantage call.
  It reuses the true-count machinery whole (live shoe or classic preset, the deck estimate, the true-count store), so only the second question and its store are new.
- **The ramp is the player's, not the app's.** Five bands (`TC ≤ +1`, `+2`, `+3`, `+4`, `+5 or more`), whole units 1–100, edited under the mode radio, defaulting to the textbook 1-2-4-8-12 six-deck spread.
  What to bet follows from bankroll, risk of ruin, rules, and table tolerance — none of which this app knows — so it grades the ramp the trainee intends to play rather than inventing an optimum.
  A ramp that shrinks as the count rises gets a note, not an error: it is legal, just usually a typo.
- **Graded at the correct true count**, not the claimed one, and the rep counts only when count and bet are both right — the same strict AND the key-count drill uses.
  A miscount that leads to the wrong bet is the failure the drill exists to catch.
- **Validation.** +52 unit tests (1014 total), an E2E round that edits the spread in Settings and reads it back in the feedback, and a contrast sweep of the spread editor, the bet question, and the accent-filled matched band, in both themes; 73 E2E.
  `counting-vectors` (schema /3) carries `betRampCases` for the iOS port.
- **iOS mirror.** `Engine/BetRamp.swift` (bands, bounds, the shrink advisory, tolerant decode) plus `evaluateBetSpread`, a `.betting` drill state, and `BetRampEditor` — a stepper per band inside Settings' Card counting section, since a stepper is what the rest of that screen uses for a number and it cannot produce an out-of-range ramp.
  The mode picker is now a three-way segmented control (Running / True count / Bet spread) for balanced systems. +21 Swift tests (324 total), the ramp vectors graded against the fixture, both themes rendered.
- **A file-length split the mirror forced.** `CountingModel` was 13 lines short of the 400-line cap, so its read-only half moved to `CountingModel+Presentation.swift` (mode predicates, validation, labels, stat snapshots) — the shape `ShowdownModel+Presentation` already had.
  Swift's `private` is file-scoped, so the engine and stat stores it reads became internal; the mutators that assign `private(set)` state stayed put.

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
  +4 Swift tests (295 total).
  The probe render shows the segmented picker as ImageRenderer's "unsupported" bar, which is a renderer limitation, not the screen: `.pickerStyle(.segmented)` is what Settings already uses in four places.

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

### Post-roadmap continued: whose true count the indices are (2026-08-03)

The app shipped a dozen counting systems and one set of deviation indices, and never mentioned that they are not the same thing.

- **The bug.** `DeviationsDrillPageComponent` never read `counting.systemId`.
  A trainee who set the counting system to Omega II or Wong Halves — level-2 and level-3 systems, whose true counts read differently off the same shoe — was graded on BJA's Hi-Lo indices with nothing on screen saying so, and an unbalanced pick (KO, AceMT, Ambition-U) has no true count to compare against at all.
  Weeks of drilling the wrong threshold, silently.
- **The fix is attribution, not new charts.** Transcribing Omega II or Wong Halves index numbers would need sources this pass cannot verify, so the honest move is to name the system the numbers belong to.
  The chart's footnote now opens "Every index here is a Hi-Lo true count", and `deviationIndexNote(system)` returns a standing advisory for any other system — worded differently for balanced systems (a true count that reads differently) than unbalanced ones (no true count at all).
  It shows on the drill (every hand — a correctness warning, not a dismissible tip), on the deviation chart, and in Settings' Deviations section, where the picker's cost is stated next to the trainer it affects.
- **One dedup on the way past.** `countingSystemById` is now the single resolver for a stored system id, with the Hi-Lo fallback the card-counting page already had open-coded, so four screens cannot disagree about what a stale id means.
- **Validation.** +16 unit tests (1058 total), an E2E walking Settings → drill → chart and back, and the new elements checked in both themes (10.9:1 in dark).
- **iOS mirror.** `DeviationIndexSystem` in `Deviation.swift`, a `Collection<CountingSystem>.system(withId:)` mirror of the resolver, and a shared `AdvisoryNoteView`. +9 Swift tests (345 total), both themes rendered.
  Settings' Deviations section moved into its own `DeviationsSection` view — the six added lines pushed `SettingsView.swift` over the 400-line `file_length` cap, and `PracticeDataSection` is the precedent for exactly that split.

### Post-roadmap continued: the showdown grades the play (2026-08-03)

The bet-spread drill exists because "the showdown let a trainee bet anything at any count and never said a word about it".
The same was true of every _playing_ decision, which is the more basic failure: the showdown is the only place the app lets a hand be played out — multi-card hits, splits, doubles, surrender — and it silently accepted a hit on a hard 20.

- **A mid-hand decision, not a chart lookup.** `decide()` answers the opening question: two cards, every action on the table.
  Playing a hand out asks a narrower one, so `decidePlay(PlayInput)` reads the same charts against the hand as it stands (N cards, via the shared `handTotal`/`isSoftHand`) and against the actions actually on offer.
  A cell calling for something unavailable falls back the way the published chart reads it: a hard `D` becomes a hit, a soft `Ds` becomes a **stand** (that is what the small 's' means), and a `SUR_*` cell becomes the play named behind it.
- **The `can*` flags are the table's answer, not the cards'.** Double, split and surrender are first-two-card actions; the engine enforces that itself, so a caller that leaves `canDouble` true on a three-card hand still cannot be told to double.
  Two hands fall off the chart's edges and are handled explicitly: hard/soft 21 stands, and soft 12 — reachable only as a pair of aces that could not be split — hits.
  Without that last case the lookup would have indexed `soft[1]` and crashed.
- **The guard that matters** is an exhaustive agreement test: on all 17,576 two-card hands × upcards × rule sets × DAS/LS pairs, `decidePlay` with nothing withheld must return exactly what `decide` returns.
  If they ever diverge, `decidePlay` has grown a second, private copy of the chart.
  A second sweep asserts every non-bust three-card hand comes back hit-or-stand under every offer combination.
- **It coaches, it does not block.** The verdict names the correct play and the misplay stands and is settled — this is a table, not a quiz.
  The round's misplays are listed again in the result panel, since a verdict that scrolls past as the next hand is played would be no use.
  Accuracy persists under `blackjack-showdown-play-stats`, separate from the win/lose/push tally: one measures how the cards fell, the other whether the hand was played right, and only the second is a skill.
  It gets a "Showdown play" row on Progress.
- **Validation.** +21 unit tests (1105 total), a contrast sweep of both verdict states in both themes (seed 2 deals a hand where hitting is a misplay, so the tinted state is reached deterministically), 81 E2E.
- **iOS mirror.** `decidePlay` + `PlayInput`, `PlayVerdict`, `ShowdownModel+Grading.swift`, and a shared `PlayCoachView`. +14 Swift tests (359 total), both themes rendered.
  Three SwiftLint caps were crossed on the way and fixed rather than left: the reducers now take a `CellContext` (the 5-parameter cap, the shape `KeyCountAnswer` already uses), the verdict views moved out of `ShowdownView`, and the grading moved to its own file — which, because `private(set)` is file-scoped, could only take the _scoring_; `onAction` still does the recording.

### Post-roadmap continued: persisted data is no longer trusted (2026-08-03)

Every store read its own `localStorage` payload back with a shape check that stopped at `typeof`.
That is enough for data this app wrote and nothing else, and the file-backup feature added a supported way for a hand-edited payload to arrive.
A `NaN` bankroll, a day tally with more misses than attempts, or a scenario key that does not match the hand it claims to describe all survived the old guards and then poisoned an average, a streak, or a weak-spot ranking with no way to tell from the screen.

- **Validate the value, not just the type.** `Number.isSafeInteger` and explicit ranges replace `typeof x === 'number'`: a miss tally now requires `0 ≤ misses ≤ attempts`, a date key has to be a real calendar day (`isLocalDateKey` round-trips it through `Date`), a manual true count is clamped to ±20, and `buildShoeCards` refuses a deck count outside the options the UI offers.
  `coerceNumericRecord` rejects non-finite numbers, which is what let a `NaN` through into the stat rollups.
- **Duplicate keys merge instead of last-one-wins.** Practice history and the miss tally both keyed days by date but stored them in arrays, so a duplicated date silently dropped one entry's hands.
  Both now fold duplicates together (saturating at `MAX_SAFE_INTEGER`) and sort, which also makes the read deterministic.
- **The scenario key has to agree with its ref.** The miss tally's map key is derived from the ref it points at; requiring them to still agree on read keeps one hand from masquerading under another hand's stable identity and inheriting its streak.
- **Restore is now recoverable.** `localStorage` has no transaction, so `BackupService.restore` snapshots the namespace first, refuses to start if that snapshot cannot be taken, and rolls back on a write failure — a quota or private-mode error no longer turns a valid profile into a half-applied backup.
  Each outcome gets its own message.
  The export's object URL is revoked in a `finally`, and an empty backup is now a legal one (an untouched profile is a real thing to back up).
- **A media-query listener that outlived the service.** `ThemeService` added a `change` listener and never removed it; it now unregisters through `DestroyRef`, and the deprecated Safari `addListener`/`removeListener` pair is handled as a real fallback rather than an optional call.
- **Validation.** +30 unit tests (1147 total with the insurance work below).

### Post-roadmap continued: the showdown grades the insurance call (2026-08-03)

Grading the play left one decision at that table ungraded, and it is the one the drill next door exists to teach: insurance is purely a bet on the count.
The showdown already knew the shoe and the system; it just never said whether the number the trainee was carrying was worth acting on.

- **Graded on the count the player can actually see.** The showdown starts from the running count the drill hands it and adds every card it turns face up.
  The dealer's hole card is deliberately held back until the next round opens — insurance is decided before it is seen, and scoring against a card the player cannot see would be scoring a different game.
  `drawHole()` deals and tracks it like any other card, then removes it from the visible count until the deal that reveals it.
- **Only against numbers that are the system's own.** `countBasisFor` answers what this system's count can be graded as: Hi-Lo gets a true count (the indices are Hi-Lo true counts), KO gets its book's published running-count trigger, and everything else is `ungraded` — dealt and settled exactly as before rather than scored against numbers that are not its own.
  This is the same honesty the deviation-index advisory already ships.
- **The index is quoted, never restated.** The verdict reads the threshold off the same chart rule the grading consulted, so a corrected chart cannot leave the sentence citing a number the verdict no longer uses.
  The spec asserts against `deviationsFor('S17')` rather than the literal `+3` for the same reason.
- **Whether the bet won is beside the point.** Insurance at a low count that happens to pay 2:1 is still marked a misplay, and that is the whole lesson — the E2E walks exactly that case (seed 14 deals a dealer natural, so the bet wins and the call is still wrong).
  `PlayVerdict` gained a `headline` sentence in place of the `expected` action, because declining insurance is a correct play with no action to name.
- **Validation.** +13 unit tests (1147 total), +1 E2E (82), both verdict states rendered in both themes.
- **iOS mirror.** `CountBasis` in `Showdown.swift`, the visible-count bookkeeping in `ShowdownModel`, and `gradeInsurance` alongside the play scoring in `ShowdownModel+Grading.swift`. +8 Swift tests (367 total), both themes rendered.
  Two SwiftLint caps were crossed and fixed rather than left.
  `file_length` now sets `ignore_comment_only_lines`, matching the `ignores_comments` that `line_length` already sets: these files run ~25% doc comment by design, and counting that against the cap had already cost real encapsulation once (`CountingModel` was split at 301 lines of _code_, which forced its stores to drop `private`).
  `type_body_length` already excludes comments, so that one was a genuine size signal and the hand-play flow moved into a same-file `extension` — same file, so the `private(set)` mutators still work, which is the pattern the insurance block in that file already used.

### Post-roadmap continued: showdown misplays become weak spots (2026-08-03)

Grading the play said the right thing and then threw it away.
The verdict scrolled past, the round's misplay list cleared on the next deal, and nothing else in the app ever heard about it — so the Basic Strategy drill's adaptive opener, the Done screen's "Drill next", and the Progress weak-spot list all stayed blind to the hands a trainee actually misplays at a table.
Progress already labels the row "not a drill of its own — it is basic strategy, scored where the hands are actually played out"; it just wasn't filed like it.

- **Filed under the trainer it belongs to.** A misplay at the showdown is a basic-strategy miss on that hand, so it goes into `missTally` under `basic-strategy` — the same store the drill writes and reads.
  Play 16 vs 10 badly at the table and the next Basic Strategy session opens on it, with no new plumbing: the drill already seeds from `weakSpotFor('basic-strategy')`.
- **Only decisions with an identity to file.** A `ScenarioRef` names a two-card hand — it is the seed the drill re-deals from — so a three-card 16 has nothing to file under and is graded on the felt only.
  Post-split hands do qualify: their first two cards are a real two-card scenario.
- **Only when the table asked the drill's question.** The felt can withhold an action the chart wants — a double the free chips cannot back, a split past the box's four-hand cap — and then the correct answer here is not the drill's.
  Recording it would clear a weak spot on a question the drill never asks.
  The guard is a direct one: the decision is filed only when the unrestricted `decide()` agrees with the restricted `decidePlay()` answer, so the two engines' existing exhaustive agreement property is what makes it sound.
- **Validation.** +4 unit tests (1151 total), +1 E2E (83) walking a misplay at the table through to the weak-spot card on Progress.
- **iOS mirror.** `GradedPlay` gained a `tallyRef`, so the scoring in `+Grading` still only reads and `record(_:)` in the model does the writing. +4 Swift tests (371 total).

### Post-roadmap continued: the showdown grades the bet (2026-08-03)

Three decisions are made at that table — how much to bet, whether to insure, how to play the hand — and after the two above, the bet was the last one nobody said anything about.
The bet-spread drill exists for it, but that drill asks for a number in the abstract; the showdown is where the chips actually go out, and a trainee could flat-bet the minimum through a +5 shoe and hear nothing.

- **The ladder became the spread.** Grading was impossible while the bet control offered a fixed 1/2/5/10/25 chip tray and the ramp spoke in units of 1/2/4/8/12: a spread calling for 4 had nothing to put out, and any mapping between the two would have been a rounding rule this repo invented.
  So the rungs are now the player's own ramp at one chip per unit (`betOptionsFor`), which makes "correct" exact and needs no rule.
  It also makes the control what it should always have been — the spread you intend to play, rehearsed.
- **Graded on the count before the deal.** `dealAfterBet` snapshots the true count first: the bet was decided on what the player could see at that moment, and dealing moves the count.
- **A ramp is not an index.** The insurance index is a Hi-Lo number, so `countBasisFor` refuses to apply it to anything else.
  A bet ramp is the player's own, indexed by whatever true count they keep — so `trueCountFor` is a separate question with a wider answer: every **balanced** system qualifies, exactly as the bet-spread drill already allows.
  Conflating the two would have silently withheld the verdict from every Omega II or Wong Halves counter.
- **Two guards, both about not scoring a question that was not asked.** A bet is skipped when the system has no true count, and when the bankroll could not have covered the called bet — that rung is offered disabled, so marking it wrong would score a bet the table never let the player place.
- **A bug this surfaced:** `gradeInsurance` used to null `lastPlay` when it had nothing to say. With the bet graded first, that wiped a verdict that was still true. It now leaves the panel alone.
- **Validation.** +7 unit tests (1158 total), +1 E2E (84) asserting the rungs are the spread and the verdict names the called bet; both verdict states rendered.
- **iOS mirror.** `Bankroll.betOptions(for:)`, `trueCountFor`, and `gradeBet` alongside the play and insurance scoring in `ShowdownModel+Grading.swift`. +7 Swift tests (378 total).

### Post-roadmap continued: iOS backs up to the web's file (2026-08-03)

The web's file backup shipped without an iOS mirror, and the reasoning was recorded at the time: "the iOS app has iCloud sync, the web has this".
That is right about what iCloud does — carry a trainee between their own devices, silently — and wrong about what it does not. iCloud cannot carry them **off** the platform: onto the web app, onto someone else's phone, or into a file kept before deleting the app.

- **The same file, not a second format.** Every store on both sides persists JSON under the same `blackjack-`-prefixed key; iOS holds it as `Data` whose bytes are exactly the string the web holds in `localStorage`.
  So `BackupStore` reads `defaults.data(forKey:)` as UTF-8 text and writes it back the same way, and one file restores on either platform.
  `FlowPrefs.jsonObject` was already documented as "matching the web's key/value forms", which is what makes the settings half of the file portable too.
- **Defined by the prefix, as the web's is.** A list of stores would silently omit whatever store is added next.
- **The live stores are re-read, not relaunched.** The web restores by reloading the page; iOS has no reload to hide behind, and asking for a relaunch would be a worse answer than doing the work.
  `ReloadableStore` is the counterpart to the `reset()` every store already has, and `AppModel` lists them for the same reason `resetPracticeData` does — so a store added later cannot be left holding stale state.
- **Rolled back on a failed write,** matching the web: `UserDefaults` has no transaction either, so the namespace is snapshotted, replaced, and verified, and a mismatch puts the snapshot back rather than leaving a profile half of each.
- **Validation.** +13 Swift tests (392 total), including a round-trip through `UserDefaults` and a check that the live store keeps stale state until told to re-read.
  The section was photographed in the simulator in both themes — `ImageRenderer` cannot draw a `Form`, so Settings is always shot rather than rendered.

### Post-roadmap continued: reviewing the day's own work (2026-08-03)

Four features landed in one session across both platforms, so the last task was a pass over the session's own diff rather than another feature.
It found three real defects, all of them in the newest code and none caught by the tests that shipped with it.

- **A bet graded off the ladder.** A losing run clamps the carried bet to whatever the stack can still back, which need not be a rung — the ladder is the only way to place a bet, so that figure is one the player never chose, and scoring it marked them wrong for the bankroll's arithmetic.
- **A bet graded into a shoe that dealt nothing.** `dealHand` bails to `exhausted` when the shoe cannot serve the round, and grading ran anyway: a verdict, a recorded attempt, and a misplay appended to the _previous_ round's list, which the early return had left uncleared.
- **An iOS restore that iCloud could undo.** The file replaced everything locally while the cloud still held the profile it replaced, so the next external change would adopt the old values straight back.
  A restore now pushes the restored values up, and the practice-history and prefs reloads fire `onChange` so the home-screen widget stops showing the pre-restore numbers.
- **The lesson worth keeping:** all three were in the seams _between_ the new code and code that already worked — a clamp, an early return, a sync path.
  The feature tests exercised the feature; nothing exercised what the feature now sat on top of.

### Post-roadmap continued: the showdown grades against the count, not just the chart (2026-08-03)

The showdown grades all three table decisions, but the play was graded against basic strategy alone — while the insurance call next to it was graded against the deviation chart.
So the one place in the app where a live count meets an actual hand marked the Illustrious 18 **wrong**: stand 16 vs 10 at a true count of +2, exactly what the Deviations trainer teaches, and the table said "Hit was the play" and filed the hand as a Basic Strategy weak spot.
One app was teaching two different games.

- **`resolvePlayDecision` is `decidePlay` with an index on top.** The trainer's `resolveDeviationDecision` could not be reused: it takes two cards and assumes every action is on the table, and a hand at the felt may be three cards deep with doubling, splitting or surrender already gone.
  The new path keeps the trainer's resolution order exactly — surrender overlay, then a charted surrender that must not be downgraded, then the natural category — and returns a `StrategyDecision`, so the caller grades the same way whether or not an index was in play.
- **A total is a total.** An index is written against a hand's total, so the hard-16 rule applies to a three-card 16 exactly as it does to a two-card one.
  Only the pair row still needs two cards with the split on offer, mirroring how `decidePlay` takes a lapsed split straight to the total.
- **Only a play the felt is offering can be the right answer.** A deviation calling for a double the bankroll cannot back, a split past the box's four-hand cap, or a surrender the split already spent is not a play the trainee declined, so the chart's own answer stands.
  Without that gate the table would mark a hand wrong for an action it never showed.
- **The index is quoted, not restated.** The verdict reads the threshold off the rule that fired ("stand at true count 0 or higher, and the count is +2") and names what basic strategy alone would have done, so the line teaches instead of just scoring.
  The chart screen keeps its symbolic `≥ +3` rendering — right for a table column, wrong mid-sentence.
- **Filed under the trainer that teaches the answer.** An index miss is a Deviations question, so it goes to that drill's weak list rather than Basic Strategy's; filing it under Basic Strategy would have seeded that drill a hand whose chart answer the trainee got right.
  The existing "did the felt withhold anything" guard is applied against the unrestricted deviation decision in that case, so a split hand whose surrender overlay could not fire is still skipped.
- **Still only against numbers that are the system's own.** A playing index is a Hi-Lo true count, so every other system is graded on basic strategy alone — the same line insurance already draws, and the reason KO gets its book's insurance trigger and no playing schedule.
- **Validation.** +14 unit tests on the engine and +7 on the component (1182 total); both verdict states rendered.
- **iOS mirror.** `PlayDeviationDecision` and `DeviationRule.thresholdClause` in `Deviation.swift`, `resolvePlayDecision` in `DeviationEngine.swift`, and `correctPlay`/`tallyRef` in `ShowdownModel+Grading.swift`; `GradedPlay` gained a `tallyTrainer` so the model still does all the writing. +18 Swift tests (413 total), the coach line rendered in both themes.

### Post-roadmap continued: every counting system says what it is for (2026-08-03)

The picker offers **58 counting systems** and, until now, gave no basis for choosing among them beyond a sentence of card values.
That is the most consequential setting in the app — it decides which drills are even available, which numbers the showdown can grade, and how much work a trainee signs up for per hand — and the app knew nothing about the trade-off it was asking them to make.

- **Three figures, from the table the registry already came from.** Betting correlation, playing efficiency and insurance correlation are published per system on the Blackjack Review comparison page the README has always cited as the source of the 58.
  The card values were transcribed from it; these three columns were not.
  They are now, verbatim.
- **Each one is a drill this app already runs.** Betting correlation is what the bet-spread drill and the showdown's bet measure; playing efficiency is what the Deviations trainer measures; insurance correlation is the one decision that is purely a count of tens.
  So the numbers are not trivia — they say which of the app's own screens a system will do well on.
- **Transcribed by matching tag vectors, not names.** The importer keyed each registry entry to its published row by its ten per-rank values, which matched **58 of 58** — independently confirming that every card value already in the registry agrees with the source.
  Where two systems share a tag vector (Andersen and Tri-Level; C-K and Mentor; DMPro and EBJ III) the source still publishes each its own row, and the name disambiguates so each entry carries its own.
- **Required, not optional.** `SystemMetrics` is a required field on `CountingSystem`, so a system cannot be added without saying what it is good at, and a spec asserts all three are in `[0, 1]` for every entry with spot-checks against the four defaults and the table's extremes.
- **Figures, not a ranking.** The copy says so in as many words: these measure a system's _tags_, never a trainee.
  The perfect `1.00` betting correlations on that table belong to Griffin Ultimate and Thorp Ultimate — counts the source itself annotates "only a computer could play this" — and Revere Five-Count's `.43 / .15 / .19` is the app admitting that one of its own options barely tracks anything.
- **Label/value pairs rather than one string,** because "Insurance" on one line and "correlation .76" on the next reads as two different things.
  The web wraps between figures with `white-space: nowrap` per figure; iOS uses non-breaking spaces inside each on the drill screen and a right-aligned value column in the Settings form.
- **Validation.** +70 unit tests (1252 total), +1 E2E (87) walking the picker from Hi-Lo to a weak system and on to the drill screen; both surfaces shot in both themes.
- **iOS mirror.** `SystemMetrics` and `metricLabels` on the decoded `CountingSystem`, rendered in the counting section of Settings and on the drill's start screen.
  The exporter's `counting-systems` fixture went to `/3`. +5 Swift tests (418 total), both screens photographed in the simulator in both themes.

### Post-roadmap continued: the showdown says whose numbers these are, and the delta gets a parity gate (2026-08-03)

Two follow-ons to the deviation grading above, both about the same thing: what the app is entitled to claim.

- **The fourth screen where indices matter.** The Deviations drill, the deviation chart and Settings all warn a trainee whose counting system is not Hi-Lo that the indices are not theirs.
  The showdown — the one place indices are applied to a hand actually played — said nothing, so an Omega II counter watched their plays graded on basic strategy with no hint why.
  It now carries the same shared advisory plus the consequence at this table: hands graded on basic strategy alone, and the insurance call left ungraded — or, for KO, graded against its book's own running-count trigger, which is the one thing it does publish.
  Said once before a card is dealt, not repeated per verdict.
- **A parity gate for the delta.** `resolvePlayDecision` is now two hand-written implementations of the same restriction-aware resolution, and it is exactly where they can drift: it wraps `decidePlay` rather than `decide`, so it classifies hands more than two cards deep and refuses an index whose play the felt is not offering.
  Neither axis is touched by the trainer's own vectors.
- **Only the rows where an index fires.** A full cross-product over the restriction and N-card axes would have doubled the fixture weight in the repo for coverage that is mostly `decidePlay` restated.
  Instead the exporter declares its `domain` and emits only the combinations where a deviation applies — 2,158 rows out of 70,400 examined, 82 KB — and the Swift test walks the same domain asserting both halves: a listed combination deviates to the named action and rule, an unlisted one does not deviate at all and still equals `decidePlay` (which the basic-strategy vectors already pin exhaustively).
  The `examined` count is asserted too, so a domain change on the web side surfaces as a mismatch rather than as silently thinner coverage.
- **It passed on the first run**, which is the answer the gate exists to give: the two implementations already agreed on all 70,400.
  Verified by breaking each new axis in the Swift engine in turn — dropping the `canDouble` gate produced 210 mismatches, all in the no-double restriction; refusing to classify hands past two cards produced 592, all on the three-card hands.
  (Breaking the `canSplit` gate produced none, because the classifier already declines to read the pair row when the split has lapsed — the gate is enforced twice.)
- **Validation.** +3 unit tests and +1 E2E (88) for the advisory, +5 Swift tests (422 total) and the new fixture; the advisory rendered on both platforms in both themes.

### Post-roadmap continued: the hole card, and the week's accuracy (2026-08-03)

Two independent findings, one a defect in the newest grading path and one a hole in what the app has been recording all along.

- **The showdown graded the next bet against a stale count.** The dealer's hole card is held out of the visible running count while it is face down, which is right: insurance is decided before it is seen.
  But it rejoined the count at the _next deal_ rather than when the round resolved and turned it over — so the bet that opens the next round was graded against a count one card behind the felt, while the decks-remaining divisor already counted it.
  A trainee who counted the card they could see was marked wrong for it, at exactly the moment a single point most changes the true count.
  The reveal now folds it in (`resolveRound`), and the reproduction is a two-round vector: a bust hand whose 5 in the hole moves a carried +3 across the ramp's TC +2 boundary.
- **The history recorded volume and nothing else.** Every rep in the app is graded, the goal ring and the streak have always been fed from a per-day hands count — and per-day _correctness_ was never stored.
  So the Progress screen could say how much was practised and never how well, and the lifetime accuracy beside it barely moves once a trainee has thousands of attempts.
  The screen could not answer the one question a trainer exists for.
- **`graded` is tracked separately from `hands`,** which is the whole reason the migration is honest: a day written by an older build has no verdicts at all, so dividing its correct count by its hands would report a week of real practice as 0%.
  Days from before the change read as unmeasured, and a day straddling it is measured over the reps that actually carry a verdict.
  Stored values are clamped into `correct ≤ graded ≤ hands`, so no restored backup or synced payload can show an accuracy over 100%.
- **A week beside the week before it.** One week's figure is a reading; the direction is what says whether the practice is working, so the line reads "88% correct this week" with "up from 77% the week before" under it, and stays silent until there are two measured weeks to compare.
  Per-day accuracy rides in the strip's screen-reader text, where a bar's numbers already live.
- **Validation.** +10 unit tests (1266 total) across the store and the screen, including the pre-grading migration and the clamp; the card rendered in both themes.
- **iOS mirror.** `PracticeDay.graded`/`.correct`, `accuracyLast7`, and `ProgressSummary.trend` behind the same week card; the iCloud payload and the `UserDefaults` round trip both carry the counts, and a malformed cloud payload is still nothing to adopt rather than an empty history. +10 Swift tests (432 total), the card photographed in both themes.

### Post-roadmap continued: the table asks for the count on the way out (2026-08-03)

The showdown grades three decisions against the count — the bet, the insurance call, the index plays — and every one of those verdicts was scored against a count the app kept for the player.
The trainee was never once asked for theirs.
So the screen that exists to put a live count on a real hand was, for the count itself, a spectator sport: dozens of cards came out and the number they were carrying was never tested.

- **The way out runs through the count.** Leaving the table stops on one question — the running count as the player can see it — and answering it is the exit.
  The bypass button is hidden while the question is up, because a "Back to counting" beside it would make the check optional in the one moment it is worth anything.
- **Only between rounds.** Mid-hand the dealer's hole card is dealt but face down, so there is no single count both sides could agree is right: the table holds it out of the visible count deliberately, and asking then would grade a different game.
  An exit from a player turn leaves straight away, as it always did.
- **The count the player could see, over the cards they saw.** The verdict names the table's count and the drift, in points and in the direction of the error, over the number of cards actually turned face up — the hole card of an unresolved round is dealt but not shown, so it is not one of them.
- **It feeds the running-count drill's own store,** because it is the same skill: a count held through played-out hands, past splits and dealer draws, is the running count the drill measures, only harder.
  It is not a second scoreboard.
- **One answer, not a second guess.** The verdict replaces the answer box, and a further submission is ignored — a stat that improves because the trainee tried again would not be measuring anything.
- **On by default, and switchable.** It is the only showdown setting that defaults on: the table has been keeping the count all along, and asking for it is the point of the screen.
  Prefs written before the setting existed get asked; only an explicit `false` turns it off.
- **Validation.** +9 unit tests (1275 total) and +2 E2E (90) walking the answer and the Settings opt-out; the question and both verdict states rendered.
- **iOS mirror.** `ShowdownModel.requestExit` / `answerCountCheck` with the reads in `+Grading`, a `CountCheckView` beside `PlayCoachView` (the answer box is the counting drill's own form), the `showdownCountCheck` pref through the tolerant merge and the Settings toggle. +11 Swift tests (443 total); the question and both verdict states photographed in the simulator in both themes, plus the new Settings row.

### Post-roadmap continued: two things the table was not honest about (2026-08-03)

The count check asks the trainee for the count the table has been keeping, which made two long-standing seams matter for the first time: what the table had shown them, and how long it kept dealing.
Both were found by asking the same question as the review pass above — not "does the feature work" but "what does the app let you get wrong silently".

- **A hole card the table never turned over was going into the trainee's count.** Leaving mid-hand (or at the insurance decision) handed the drill _every_ card the showdown had dealt, the face-down hole card included.
  The drill folds those into the carried count, so the next round was graded against a count containing a card the trainee could not have seen — their answer, correct for everything on the felt, marked wrong by exactly that card's tag.
  The count check made it worse than silent: at the insurance decision it confirmed the visible count and then diverged from it one line later.
- **The fix is the app's own principle, applied one step further.** The insurance call is graded against the visible count because "grading against a card the player cannot see would be grading a different game"; the same holds for the count they leave with.
  So the exit carries back the cards the table turned face up.
  A hole card never shown is gone from the shoe and uncounted — which is exactly what a burn card is, and what a real counter does with one — and the count check now says so where it asks.
- **The showdown dealt on past the cut card, down to the last four cards.** Every other part of the app respects the cut: the counting drill reshuffles at it and says so.
  The table ignored it, which is not a game any casino deals — and it quietly poisoned the grading, because the true count divides by the decks remaining.
  The reproduction is the drill's own feedback line at that depth: `running count 3 ÷ 0.5 decks = true count 6`.
  Bets were being scored against a spread band at counts like that, and index plays against thresholds they clear by a mile.
- **A dealer stops at the cut card, never mid-round,** so the round in progress when it surfaces still plays out and settles; only the next one is refused.
  The counting screen withdraws the showdown offer for the same reason and says why, rather than letting the button vanish.
- **Both were in the seams, again.** The exit handover and the deal-another guard were each written before the count was graded at this table, and each was correct for what the table did then.
  The tests that shipped with the count check exercised the count check.
- **Validation.** +6 unit tests (1281 total) and +2 E2E (92); the count-check note and the withdrawn offer both rendered in the browser.
- **iOS mirror.** `ShowdownModel.seenCards` (the hole card tracked by index, so the one card that must not leave with the player is identified exactly) and `cutCardOut` / `showdownAvailable` / `shoeSpent`. +6 Swift tests (449 total); both new lines photographed in the simulator.

### Post-roadmap continued: the Basic Strategy drill plays the hand out (2026-08-03)

The showdown has graded multi-card decisions since the play coach shipped, and its weak-spot filing says out loud that it cannot teach them: "a `ScenarioRef` names a two-card hand … so a three-card 16 has nothing to file under".
The engine has answered them since `decidePlay`.
The trainer that exists to teach basic strategy asked the opening question and dealt a fresh hand — so the one skill the table graded was the one no drill rehearsed, and the app's own manual-testing guide named the gap: "You never play a hand out on those pages, and there is no multi-card decision practice."

- **A hit is the one answer that leaves another question behind it.** Stand, double, split and surrender end a hand at a table; a hit draws a card and asks again.
  So that is the whole rule: a correct hit deals the next card and re-asks on the grown hand.
  Every other action advances as before, and a miss still ends the hand — this is a drill, not a table, and the pause where the chart is read is the teaching.
- **The narrowed grid is the lesson, not a limitation.** Past two cards `legalActionsFor` returns hit and stand, so Double / Split / Surrender go dead rather than disappearing.
  That is the rule being taught: they are first-two-card actions.
  It also makes the same total read two ways — hard 11 vs 6 doubles on the deal and can only hit three cards deep — which is the distinction `PlayInput` was written for and which no drill had ever put in front of a trainee.
- **One grading path per question, and they are different questions.** The opening decision stays `evaluate`/`decide`; every continued one goes through a new `evaluatePlay`, which is `decidePlay` behind the same verdict shape.
  `evaluate` was refactored to share the grading (the insurance branch included) so the two cannot drift.
- **Only the opening decision files a weak spot,** for exactly the reason the showdown gives: re-dealing a three-card 16 as the two-card hand a `ScenarioRef` names would ask a hand that can double, which is a different question with a different answer.
  The showdown's rule now holds in both places that apply it.
- **The hand ends where the cards end it.** Busting or reaching 21 leaves nothing to ask, so the drawn card is held on screen for twice the flash with the total said plainly ("Bust — 26.", "21 — nothing left to decide.") while the hit stays graded green: the play was right, the card was not.
  The live region carries the same line, since the stage conveys it as colour and position.
- **The session finishes the hand it is on.** The target is checked when a hand ends, not when a decision does, so the Done screen never lands between a hit and the card it drew.
- **On by default, and switchable** (Settings → Basic Strategy → Play hands out).
  The opening decision alone is the chart, not the game.
  Prefs written before the setting existed play hands out; an explicit `false` is the only thing that turns it off.
- **The stage grew a hand.** `FlowStageComponent` took exactly two cards; it now renders any number, shrinking the cards past two and wrapping past what a phone can hold in a row.
  Verified at four and five cards on a 390 px viewport.
- **Validation.** +16 unit tests (1297 total) and +1 E2E (93), the E2E seeded (`?seed=9`) so the hand it hits is a hard 7 that draws into a hard 12 rather than busting.
  Rendered in the browser at three, four and five cards, in both themes, plus the bust beat and the new Settings section.
  A 40-seed sweep of the real drill exercised continuation, bust and 21 across every opening the generator deals.
- **iOS mirror.** `FlowPrefs.playHandsOut` through the tolerant merge and the stored shape, `BasicStrategyDrillModel.hand` with `afterCorrect`, `BasicStrategyEngine.evaluatePlay`, the `[Card]` overloads of `handQuestion` / `legalActionsFor`, a `FlowStageView` that takes a hand rather than two cards, and the `.over` phase. +15 Swift tests (464 total); the stage rendered at three, four and five cards plus the bust beat in both themes, and the new Settings section photographed in the simulator in both.
  The parity fixtures are untouched — `evaluatePlay` wraps `decidePlay`, whose vectors already pin it.

### Post-roadmap continued: a deviations weak spot comes back at the count that beat you (2026-08-03)

Adaptive practice promises that what you keep missing keeps coming back.
For the Deviations trainer it was keeping half that promise: the weak spot recorded the _hand_ and the re-deal drew a **fresh random true count**.

- **The count is half the question.** 16 vs 10 is a stand at +2 and a hit at −1 — the same hand, two different answers, and the whole point of the trainer.
  Miss it at +2 and the drill could hand it back at −3, where the index never fires and the correct answer is plain basic strategy: the hand the trainee had right all along.
- **Worse than useless — it cleared the spot.** Three correct answers running retire a scenario.
  At fresh counts those three could all be the easy side, so the tally would report a learned deviation the trainee had never once answered correctly at the count that beat them.
- **The miss remembers its count** (`ScenarioTally.missedCounts`, newest first, capped at five).
  Five because a hand has more than one failure mode — 16 vs 10 can be stood at −1 _and_ hit at +2 — and because a bad week should not write an unbounded list into `localStorage`.
  A repeat promotes rather than duplicates; a correct answer leaves the list alone, since it is the record of what went wrong.
- **Only where the count is part of the question.** The Deviations drill passes the scenario's count; the showdown passes the Hi-Lo true count with an _index_ misplay only.
  Basic Strategy passes none and reads back an empty list — the same random count it always used, which for a chart with no count in it is right.
- **Old and hostile payloads both degrade to the old behaviour.** A tally written before this (or by hand) has no list, and the drill falls back to a fresh count exactly as before; a restored list drops non-integers, duplicates and anything past ±30.
- **A pinned manual count still wins.** Setting a manual true count is the trainee naming the threshold they are drilling, and a weak spot must not override that.
- **Validation.** +12 unit tests (1309 total) across the store, the drill and the showdown's filing; walked in the browser, where a hand missed three times at TC +1 now opens the next session at TC +1 rather than a fresh draw.
- **iOS mirror.** `WeakSpot.missedCounts` / `ScenarioTally.missedCounts` with `rememberMissedCount` and `sanitizeMissedCounts`, the drill's `trueCount(for:random:)`, and `GradedPlay.tallyTrueCount` carrying the showdown's index count into the tally.
  The hand-rolled `Codable` init decodes the field if present, so an older `UserDefaults` payload — or an iCloud one from a device still on the previous build — adopts cleanly with an empty list. +13 Swift tests (477 total).
  No new surface, so nothing to photograph: the change is which count the next hand is dealt at.

### Post-roadmap continued: the Deviations drill plays the hand out too (2026-08-03)

The matching half of the change above, and the one with the sharper claim behind it.

- **An index is written against a total.** The showdown has graded that since the play coach shipped — "a hard-total index applies to a three-card 16 exactly as it does to a two-card one" — and the trainer that exists to teach indices could only ever ask the opening decision.
  A trainee could pass every Deviations round and still have never once been asked whether the hard-16 rule survives a hit.
- **`DeviationEvaluatorService.evaluatePlay`** is `resolvePlayDecision` behind the same `DeviationTrainerResult` the drill already renders, so the feedback line, the weak-spot filing and the stats need no special case.
  The insurance overlay is deliberately not consulted: insurance is settled before the hand is played, and past the deal the grid offers hit and stand only.
- **The count is the scenario's, not a shoe's,** so it does not move when a card is drawn.
  This trainer presents the count as given — the showdown is where a live count meets a real hand — and pretending the drawn card nudged it would be inventing a number the screen never showed.
- **One setting, both trainers.** `playHandsOut` was always a top-level pref; the Settings section it lives in is now **Drills** rather than Basic Strategy, and its hint names what changes in each.
- **Validation.** +10 unit tests (1319 total): the evaluator's N-card path (an index firing on a three-card 16, the same total graded the other way one count lower, a lapsed double, a softened ace) and the drill's loop.
  Walked in the browser to a three-card hard 20 vs 10 at TC +1 with the count still on the question line and only hit and stand live.
- **iOS mirror.** `DeviationEvaluator.evaluatePlay(_:userAction:)` over a bundled `PlayedOutHand` (the parameter-count limit is why it is a struct), `DeviationEngine.basicPlay` to reach the chart's own answer (`private` is file-scoped to its declaring type), and the model's `hand` / `afterCorrect` / `.over` beside the Basic Strategy one.
  The model's read-only half moved to an extension to stay inside the type-body limit. +8 Swift tests (485 total); the renamed **Drills** section photographed in the simulator.

### Post-roadmap continued: how long the hand took (2026-08-03)

The deck-speed drill exists because the app already believed speed is a counting skill — "the timed stream sets the pace, and counting down a deck is about measuring _yours_".
For every play decision the app has graded, it measured accuracy alone.
A trainee who answers the chart perfectly in eight seconds a hand is not table-ready, and the app called them 100%.

- **A decision's own clock.** The two strategy drills timestamp the question when it goes up and read the clock when the answer lands.
  Nothing else is timed: the counting drills are paced by the app, and the deck countdown already has a stopwatch and a record.
- **A hand you walked away from is not a hand you were slow on.** Past `MAX_TIMED_DECISION_MS` (a minute) the reading is dropped — not clamped — and so is a non-positive one, which is a clock that moved backwards.
  The rep still counts as practised and graded; only its time is missing.
  `plausibleDecisionMs` is exported so the drill and the store apply that judgement in one place rather than two.
- **`timed` and `millis` are tracked separately from `graded`,** for the same reason `graded` was tracked separately from `hands`: a day written before this has no readings at all, and dividing zero milliseconds by its hands would report a week of real practice as instant.
  Those days read as untimed.
- **Median for the round, mean for the week.** A twenty-hand round is small enough that one interrupted hand would decide a mean, so the Done screen reports the middle decision; the week has only per-day totals stored and hundreds of hands to average, where the cap does the outlier work.
  The difference is visible in the first walkthrough: a round whose mean was 4.4s had a median of 2.1s.
- **Reported, never judged.** The deck-speed drill can cite "under 30 seconds" because that benchmark is published.
  There is no equivalent number for a playing decision, so the app declines to invent one: the pace line says what it took and how it compares with the trainee's own week before, and nothing else.
  (Faster is the good direction, which is why the pace trend cannot reuse the accuracy trend's — there, up is better.)
- **Validation.** +17 unit tests (1336 total) across the store, the session's median, and both screens, plus +1 E2E asserting the hand was timed at all (which figure it lands on is a wall-clock question a browser test cannot pin).
  Walked in the browser: three deliberate hands, the Done line, and the Progress card.
- **iOS mirror.** `PracticeDay.timed`/`.millis` with `plausibleDecisionMs` and `paceLast7`, `DrillSession.medianSeconds`, an injected `now()` on both drill models (there is no fake-timer equivalent for `Date()` in the Swift tests, so the clock is a seam like the deck-speed drill's), `ProgressSummary.paceTrend`, and the pace line under the accuracy one on the week card.
  The local save and the iCloud push now share one `payload` builder so the two cannot carry different fields; an older device's payload decodes with no timings and reads as untimed. +19 Swift tests (504 total); the week card rendered in both themes.
  The shared drill fixture moved to its own file to stay inside the file-length limit.
  Two traps: `Text` has no `+=`, so swiftlint's `shorthand_operator` — an error in this config — cannot be satisfied by the obvious rewrite; the line is folded from strings instead, which is also the shape that keeps this file type-checking quickly.

### Post-roadmap continued: a review pass over the four above (2026-08-03)

Same question as the last review pass — not "does the feature work" but "what does the app now let you get wrong silently" — asked of the work in this session rather than of the app at large.

- **The pace figure was measuring a setting, not a trainee.** Timing every graded decision meant timing the continuations of a played-out hand, which offer two buttons and one total where the deal offers six and a pair-or-soft-or-hard lookup.
  Turning _Play hands out_ on would therefore have made the week look faster, and the trend line — whose whole claim is "this week against your own week before" — would have reported it as progress.
  Only the opening decision is timed now, the same line the weak-spot tally already draws for the same reason: it is the question the drill has always asked.
- **What survived the pass.** The 'over' phase is inert to the keyboard and to a tap (both handlers already gate on their own phase); a setting turned off mid-hand ends the hand and deals a fresh one rather than stranding it; the deviations weak-spot re-deal still honours a pinned manual count and still falls back for a spot filed before counts were kept; and the round median resets with the round.
- **Deviation-only practice keeps its promise for the deal, not for the draws.** A hand hit onward can land on a total with no encoded rule.
  That is honest on screen — the feedback says no deviation exists, and the "deviation candidate" badge is not set for a continued decision — and the README now says it too, because a mode named "deviation-only" implies otherwise.
- **The backup file is a cross-platform contract, and both new fields ride in it.** Neither backup implementation knows any store's shape (the web copies the `blackjack-` namespace as strings; iOS copies each key's JSON bytes), so `missedCounts`, `timed` and `millis` move between browser and phone untouched — but only because both platforms write the same field names.
  That was true by review alone, so each side now pins the practice-day key set in a test that names the other platform as the reason.
- **Validation.** +3 unit tests (1338) and +2 Swift (506).

### Post-roadmap continued: what the weak-spot list knew and would not say (2026-08-04)

Five slices, found by the usual question — where does the app do something and never say anything about it — plus the accessibility pass that was already in the tree.

- **The flow's chrome had no name for a screen reader.** The goal ring and the session bar are `progressbar`s now, with clamped `aria-valuenow`/`max` so a repaired preference cannot emit a value outside its own range; the streak row's seven dots carry per-day volume and goal state rather than only the streak headline; the cards on the table are labelled groups; and the Done screen has a heading, which the route sweep could never have caught because it only measures a screen's opening state.
  The Done screen also said "% today" for a figure bound to `session.accuracy()` — the round's, not the day's — on both platforms.
- **A deviation was filed with the counts it was missed at, and they were never shown.** `missedCounts` has always fed the re-deal (16 vs 10 comes back at a count that beat you) and appeared nowhere on screen.
  Progress and the Done screen now read "missed 3 of 7 at TC -1, +2", deduplicated and low to high, because a hand missed on both sides of its index is two different mistakes and the label carries neither. Basic Strategy files no counts, so it says none.
- **Progress named your weaknesses on a read-only screen.** The card that lists what is costing you hands now starts the review round the Done screen has always offered, via `?review=1` (iOS: `FlowRoute.drill(_:review:)`), where every hand comes from the weak list — a deviation at a count it was actually missed at.
  Any other value of the parameter is an ordinary round: a typo should not silently narrow the practice.
- **Every counted noun now agrees with its count.** "1 hands all time", "1 blackjacks", and — in the line that has to look like arithmetic — "÷ 1 decks".
  One helper (`countOf`, mirrored in `Engine/Text.swift`) replaces three hand-rolled ternaries and the two local ones that already had it right. Two tests had pinned the wrong copy.
- **A bad week made that same card unreadable.** Twenty-eight outstanding scenarios rendered twenty-eight rows and pushed the page half again past the viewport, burying the ones actually costing hands.
  The card names the worst five and states the remainder ("+23 more this week"); the cut is presentational only, which is what makes stating it honest — the review round it starts still draws from all of them.
- **Validation.** +21 unit tests (1382), +9 Swift (515), +1 E2E (97), and a contrast check of the new action in both themes, since the route sweep never sees a card that needs a miss tally to exist.
  Corrupt-storage probing over every route found nothing to fix: a negative goal, an unknown rule set, and an unknown counting system are all repaired on load, with no page errors.

### Post-roadmap continued: what the counting side did and would not say (2026-08-04)

Four slices and a review pass, found by the usual question - where does the app do something and never say anything about it - asked this time of the counting drills and the reference screen.

- **The decks estimate was graded and never priced.** A live-shoe round asks for a half-deck estimate, scores it inside a ±0.5 band, and grades the true count against the shoe's real remainder - so both halves are on screen and nothing said what the one did to the other, which is the only reason to estimate decks at all.
  The panel now does that division too ("Your estimate: -2 ÷ 1 deck = true count -2"), says when the answer given is exactly that, and names an estimate that lands on the same true count anyway as costing nothing: how far out an estimate is only matters against the running count it divides.
  In bet-spread mode it is priced in units, which is what a deck estimate is for.
- **The chart knew nothing about the hands you keep missing.** The weak-spot tally has always known which cells are costing hands, and the page a trainee reads to look one up said nothing.
  An outstanding scenario now wears a ring on the grid - a shape, not a seventh colour, since the six actions have spent the palette - with its count in the cell's own label, and the deviation list says "missed 3 of 7 this week" in words, having room for them.
  Each trainer marks its own chart; a surrender rule looks itself up under the hard total it is written over, because that is how the drill files it; insurance carries no mark, being filed against the hand that was dealt rather than the offer.
  Marked, not ranked, and still read-only: the counts and the review round belong to Progress.
- **A refused write was swallowed in silence.** `localStorage` is the app's only persistence and it can reject a write - quota exhausted, or storage blocked in private browsing - and nothing downstream can tell: the drill goes on grading, the session bar goes on counting, and Progress goes on showing what was stored before.
  A trainee could practise a whole evening into nothing and be told by nobody.
  The write cannot be recovered, so the storage layer now stops the app pretending it happened: a notice above every screen, sticky for the session because it reports something already lost, linking to the backup export - which reads what is stored and writes it to a file rather than to the browser.
  No iOS counterpart: `UserDefaults` writes do not fail this way.
- **Accuracy said a count was wrong and never how.** The two ways to be wrong want different practice - a count that lands under nearly every time is dropping the same thing each shoe; one that scatters is being lost and restarted - and the app had the figure on every miss it ever graded and threw it away.
  Every wrong count now says how far and which way, in the words the table's count check already used (one helper behind both, since the same miss described twice reads as two mistakes), and the last 20 answers are kept as signed distances under `blackjack-count-drift` for the Progress line: "Your last 20 counts: 14 low · 2 high · 4 exact."
  Named, not diagnosed - the app cannot tell which card went missing - and silent under five rounds, where a lean is not yet a lean.
- **The review pass caught two sentences that had started lying.** "The count you would have played on" is only true where the answer agrees with the estimate; said of an answer that landed on the shoe's own count - which is marked _correct_ - it contradicted the verdict two lines above, so it is now claimed only where it holds.
  And "over 20 cards" is only true where the round's cards are the whole count: a key-count round carries the shoe's prior, so its drift spans every card since the shuffle and the line drops the figure rather than naming the wrong one.
- **Validation.** +52 unit tests (1434), +25 Swift (540), +1 E2E (98), each new surface walked in the browser and rendered on the phone in both themes.
  Two iOS files were split at their type-body limits by the work rather than beyond it (the counting feedback's paragraph modes, the Progress screen's showdown ledger), and the drift is recorded in the flow model beside the other things a graded rep feeds rather than inside the drill that only knows its own round.

### Post-roadmap continued: the hands the drill would not follow, and the page that could not drill them (2026-08-04)

Four slices found the usual way - where does the app do something and never say anything about it - asked this time of the two strategy drills and the reference screen they send you to.

- **A split ended the hand the drill promised to play out.** _Play hands out_ followed a correct hit and stopped at a correct split, which is the one action whose whole point is the hands it leaves behind: split 8s against a 9 and you hold two hands the drill never asked about.
  Both halves are dealt and played in turn now, re-splitting to the usual four hands, with split aces taking one card each and standing - the same rules the showdown's table has played since it shipped, which is where multi-card play was graded long before any drill taught it.
  A hand out of a split is two cards again but is not the hand that was dealt: surrender and insurance are gone for good, doubling comes back only under DAS, and it is neither timed nor filed as a weak spot, the same line the tally already drew for a three-card 16.
  The stage says **Hand 2 of 3**, because it shows one hand at a time and the second would otherwise read as a fresh deal.
- **The chart could name a play and do nothing about it.** It is the page a trainee opens to look a hand up, it already marks the hands they keep missing, and it was inert - the same gap the Progress weak-spot list closed when it learned to start a review round, on the one screen where "I never remember this one" is actually thought.
  Picking a cell opens the drill with `?hand=hard-16-v-10` - the tally's own scenario key, so the chart, the weak list and the drill share one encoding - and every deal that round is that hand, which the drill says on screen.
  A deviation row does the same into the Deviations trainer, where the hand is pinned and the count is not: both sides of an index have to come up, or the round only asks the half you already know.
  Insurance is the one row with nothing to drill, being filed against the hand that was dealt rather than the offer; a hand the app cannot deal falls back to an ordinary round, the call `?review=1` already makes; and the pin belongs to the round the chart started, so "One more round" is ordinary practice again.
  The grid is 340 cells, so it holds one tab stop per table with the arrow keys moving inside it, rather than 340 buttons between "Back" and the legend.
- **The review pass over those two found a target too small and a ring that was the browser's.** A cell that can be tapped owes 24px, and the grid's were 21 - so the page spends its own margins on them below 420px, which clears the minimum from about 355px up; below that the columns stay narrower rather than scrolling sideways, the same call that spells surrender `R` so ten columns fit at all.
  The new buttons also took the page's own focus ring instead of a UA outline that has no contrast guarantee against six action colours in two themes, and the Settings hint for _Play hands out_ still said splitting was gone.
- **A changed daily goal rewrote your streak.** Every past day was judged by the number currently on the Settings screen, so raising the goal turned a month of met days into a 0-day streak and lowering it handed back days that were never met - a setting quietly rewriting what reads as history.
  Each day now stores the goal in force when it was last practised and is judged by that; today is judged by the goal set now, because the day is still running and raising it is a statement about today too.
  A day written before the goal was stored, or carrying one a hand-edited backup could not have meant, falls back to the current goal - exactly what every day did before.
  The store reads the goal itself rather than taking it from each drill: six call sites would be six chances to forget, and a forgotten one is indistinguishable from a day that predates the field.
- **Validation.** +45 unit tests (1479), +38 Swift (578), +6 E2E (104), each surface walked in the browser at desktop and phone widths and rendered on the phone in both themes.
  Probes that came back clean, so they are not worth repeating: the day rolling over mid-round (the round finishes the new day's goal, which is what a per-day goal means), and the practice history's retention (pruned at 400 days on every write).
  Four iOS files were split at their type-body or file-length limits by the work rather than beyond it (both drill models out of their views, the chart's deviation half, the deviations spec's harness into a shared fixture).
