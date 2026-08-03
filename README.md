# Blackjack Trainer

A frontend-only Angular app for practicing four blackjack skills:

1. **Basic Strategy Trainer** — initial two-card hands against H17/S17 charts
   from [Blackjack Apprenticeship](https://www.blackjackapprenticeship.com/).
2. **Running Count Trainer** — running-count drills on random card streams of
   configurable length and speed, across 58 counting systems (Hi-Lo, KO,
   Omega II, Wong Halves, plus the Blackjack Review comparison set).
3. **True Count Trainer** — same card streams, but the user answers the true
   count (`runningCount / decksRemaining`, truncated toward zero). Decks
   remaining can come from a fixed preset (classic mode) or be estimated live
   from a finite, depleting shoe — and a live-shoe round can roll into a
   post-count showdown against the dealer.
4. **Deviations Trainer** — initial two-card hands against the BJA H17/S17
   Hi-Lo deviation charts, with the true count either randomly generated or
   manually entered to drill exact thresholds. Practice all hands or
   restrict to deviation-candidate hands. Evaluates the playing decision
   against basic strategy + the deviation overlay, plus an insurance
   overlay when the dealer shows an Ace.

All four modes persist independent session stats to `localStorage` and reuse the same card model + cardsJS images.
The web app runs as a **Flow shell**: it launches into a one-action home screen (Continue the last trainer, a daily-goal ring, and a 7-day streak strip), drills run full screen and auto-advance on correct answers, adapt to the scenarios you keep missing, and all configuration lives on a dedicated Settings screen.
A native iOS SwiftUI mirror (with a home-screen widget, iCloud sync, and App Store metadata) lives under `ios/`, kept in lockstep with the web engines by exported parity fixtures (see [iOS app](#ios-app)). Both apps read and write the same backup file, so a profile moves between the browser and the phone.

## Quick start

Node 22 is recommended — run `nvm use` to match the bundled `.nvmrc`. npm is
required too. From the repo root:

```bash
npm install
npm start          # dev server at http://127.0.0.1:4200/
npm test           # vitest, single run in CI / watch in TTY
npm run test:coverage  # tests + v8 coverage, gated by vitest.config.ts thresholds
npm run typecheck  # tsc --noEmit on the app sources
npm run lint       # typecheck + prettier --check
npm run build      # production bundle in dist/blackjack-trainer/
npm run e2e        # Playwright smoke suite (starts its own dev server)
```

Before the first `npm run e2e`, install the Playwright browser with `npm run e2e:install`.

GitHub Actions (`.github/workflows/ci.yml`) runs two jobs on every push and pull request to `main`: **validate** (`npm run lint`, `CI=true npm run test:coverage` — which enforces the coverage thresholds in `vitest.config.ts` — `npm run build`, plus an anti-drift check that the exported iOS parity fixtures are up to date) and **e2e** (the Playwright smoke suite run against the production bundle, with the browser install cached and the HTML report uploaded as an artifact).

The app launches into the Flow home at `/`.
Drills live at `/drill/basic-strategy`, `/drill/card-counting`, and `/drill/deviations`; configuration lives at `/settings`.
The pre-Flow trainer URLs (`/basic-strategy`, `/card-counting`, `/deviations`) redirect into the flow.

Adding `?seed=<integer>` to any URL (e.g. `/drill/basic-strategy?seed=42`) pins every draw the app makes — hands, card streams, shoe shuffles, true counts, weak-spot picks — so a practice session replays exactly.
It exists so the E2E suite can assert real outcomes rather than only that the flow advanced, and it is useful for reproducing a specific hand by hand. Without the parameter nothing changes.

## Features

### Basic Strategy Trainer (v1)

- **H17 and S17 rule sets** — toggle which dealer rule to practice against (set on the Settings screen; shared with the Deviations trainer and the showdown dealer).
- **Toggleable Double After Split (DAS) and Late Surrender** — exercises the parts of the chart that vary with table rules.
- **Insurance is always wrong** — picking Insurance is flagged with an explanation that basic strategy never takes the side bet.
- **Flow grading** — a correct answer flashes in place and auto-advances; a miss is the loop's only pause, showing the correct action and a one-line rationale until you tap or press any key.
- **Keyboard shortcuts** — `H` / `S` / `D` / `P` / `R` (surrender) / `I` (insurance) for actions.

### Card Counting Trainer (v2 + v3, plus live shoe & showdown)

The card counting page hosts five drill modes that share the same flow; the mode (like the rest of the counting configuration) is chosen on the Settings screen.

**Running count mode (v2)** — user watches a card stream and submits the
running count at the end of the stream.

**True count mode (v3)** — same card stream, plus a decks-remaining figure.
User submits the true count, computed as
`Math.trunc(runningCount / decksRemaining)`.

**Key count mode** — the unbalanced-system counterpart of the true count (KO
only); see the counting-systems notes below.

**Bet spread mode** — the true-count round, then the question the count is
for: how many units do you bet? See
[Bet spread](#bet-spread-what-the-count-is-for).

**Deck speed mode** — the self-paced one: a shuffled deck with a card burned,
counted down against a stopwatch. See
[Deck speed](#deck-speed-counting-down-a-deck).

#### Counting systems

The running-count trainer offers **58 counting systems**, discovered from a
registry in `data/counting-systems.ts` (the engine reads values straight off the
descriptor, so adding a system is data-only). The four below are the defaults,
shown first in the picker; the rest are the
[Blackjack Review comparison set](https://www.blackjackreview.com/wp/encyclopedia/card-counting-system-comparisons/)
(Hi-Opt I/II, Zen, Revere Point Count, Mentor, the Griffin / Uston / EBJ
families, and more) — see the in-app picker for the full list:

| System             | Level | Balanced                 | Card values                                                  |
| ------------------ | ----- | ------------------------ | ------------------------------------------------------------ |
| **Hi-Lo**          | 1     | yes                      | 2–6 = +1, 7–9 = 0, 10/J/Q/K/A = −1                           |
| **KO** (Knock-Out) | 1     | **no** (deck sums to +4) | 2–7 = +1, 8–9 = 0, 10–A = −1                                 |
| **Omega II**       | 2     | yes                      | 2/3/7 = +1, 4/5/6 = +2, 8/A = 0, 9 = −1, 10–K = −2           |
| **Wong Halves**    | 3     | yes                      | 2/7 = +0.5, 3/4/6 = +1, 5 = +1.5, 8 = 0, 9 = −0.5, 10–A = −1 |

- **Every system says what it is for.** Picking among 58 is the most
  consequential setting the app has, and the card values alone say nothing about
  what each choice trades away. So the picker (and the drill's own start screen)
  carries the three published correlations from the same comparison table the
  registry came from: **betting correlation** (how closely the count tracks the
  shifting edge — what the bet-spread drill and the showdown's bet measure),
  **playing efficiency** (how well it indexes a playing decision — the Deviations
  trainer), and **insurance correlation** (the one decision that is purely a
  count of tens). Hi-Lo's `.97 / .51 / .76` is the trade-off in miniature: it
  bets about as well as anything on the table and plays worse than most, which is
  why it is the system the Illustrious 18 is written for. They rank a system's
  _tags_, never a trainee — the perfect `1.00` betting correlations belong to
  counts no human can keep, and a count you hold accurately beats a stronger one
  you do not.
- **True count is offered only for balanced systems.** Unbalanced systems are
  trained as a running count; the true-count radio is disabled with a note.
- **KO adds a key-count mode** in place of a true count: the live shoe opens at
  the book's IRC (0 / −4 / −20 / −28 for 1/2/6/8 decks), the count is answered
  from that seed, and a second question asks whether the running count has
  reached the key count (+2 / +1 / −4 / −6) — the advantage threshold from
  Vancura & Fuchs' "Knock-Out Blackjack". Feedback cites the IRC, the +4 pivot,
  and the +3 insurance trigger.
- **Wong Halves uses fractional values.** In running-count mode the answer
  input accepts decimals (step 0.5); true counts are still whole numbers
  (`Math.trunc`).
- **A few systems are color-dependent.** Red Seven (red 7 = +1, black 7 = 0)
  and KISS 2 / 3 (black 2 = +1, red 2 = 0) tag a rank by the card's color; the
  engine resolves the per-color value via each system's `colorValues` override.
  The averaged value the picker shows (e.g. 7 = +0.5) is only the deck-sum
  average — the actual per-card tags are integers, so these stay integer-input.
- **A handful are novelties, not meant for real play.** The computer-only counts
  (Griffin Ultimate, Thorp Ultimate, Graham 7, Griffin 7) use extreme or
  impractically high weights, and the inverted "opposite of traditional" counts
  (Tek's, Wilson APC) run opposite in sign to a normal system. They round out the
  Blackjack Review set and appear in the picker, but are included for completeness
  rather than training.

#### Shared mechanics

- **Configurable drill** — number of cards (1–200) and time between cards (≥ 100ms), set on the Settings screen (the drill pages host no configuration).
- **State machine** — start → cards stream → answer prompt → feedback with optional card-by-card breakdown. (Live-shoe true count inserts a deck-estimate step before the answer; see below.)
- **Validation** — drill settings validate on the Settings screen; the answer field only enables Submit on valid input.
- **Keyboard shortcuts** — `Enter` starts a drill from idle or continues after feedback; `Escape` exits to home. The answer form has its own native Enter-to-submit.
- **Card-by-card breakdown** — expandable view shows each card's count delta and the running total at that point.
- **Flow session** — graded reps count toward the daily goal; the top bar shows today's count, the session target, and the current streak, and a Done screen summarizes the round.

#### True count: classic preset vs live shoe

True count mode has two sources for "decks remaining":

- **Classic (preset decks)** — pick a decks-remaining preset before the drill:
  `0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6`. Half-deck granularity below 3 decks (where
  small changes swing the true count the most), whole decks from 3 to 6.
- **Live shoe (default)** — play a finite, depleting shoe. Configure the number
  of decks (1/2/6/8) and penetration (50–90%, default ~75%). Each round:
  1. Cards stream from the shoe (dealt **without replacement**).
  2. A **"how many decks remain?"** step prompts a half-deck estimate, scored
     within a **±0.5-deck** band.
  3. The true-count answer is graded against the **actual** decks remaining.

  The running count and decks remaining **carry across rounds** of the same
  shoe; crossing the cut card triggers a reshuffle (running count resets to 0
  with a visible notice). Live-shoe rounds grade both answers, persisting the
  true count and the ±0.5-deck estimate to separate stats stores.

**Truncation toward zero** — examples: `5 / 2 = 2`, `-5 / 2 = -2`,
`3 / 0.5 = 6`. This app uses truncation toward zero; other references may round
differently, and this is the convention the trainer scores against. True-count
attempts persist under their own `localStorage` key (see
[Stats persistence](#stats-persistence)).

#### Deck speed: counting down a deck

The oldest drill in card counting, and the one the app's timed stream cannot
cover — there the app sets the pace, and here the whole point is to measure
yours. **Deck speed** mode (Settings → Card counting → drill mode) shuffles a
single deck, **burns one card face down**, and shows the other 51 one at a time.

- **You set the pace.** Nothing advances on its own: tap **Next card** (or press
  space) for each one, and the clock runs from the first card to the last.
- **It grades itself.** A full deck sums to a known constant — 0 for a balanced
  system, +4 for KO — so the 51 you saw must come to that constant minus the
  burned card's tag. Answer the running count and the burned card is revealed as
  the proof: "the jack of spades, worth −1 … so the 51 you saw had to come to
  +1".
- **The record only moves on a correct round.** Speed with the wrong count is
  not a counting skill, so the fastest _correct_ countdown is what persists
  (shown on the Progress screen, and celebrated when beaten). Under 30 seconds
  is the usual benchmark for a competent counter.
- The length and pacing settings do not apply here — the deck is the deck — so
  they are hidden while this mode is selected.

#### Bet spread: what the count is for

Counting and converting are only worth anything if the bet moves with the
count, and that step was previously ungraded — the showdown let you bet
anything you liked. **Bet spread** mode (Settings → Card counting → drill mode)
runs a true-count round and then asks **"How many units do you bet?"**, grading
the answer against your own ramp.

- **The ramp is yours.** Five bands — `TC ≤ +1`, `+2`, `+3`, `+4`, `+5 or more`
  — each holding a whole number of units (1–100), edited right under the mode.
  The default is the textbook **1-2-4-8-12** six-deck spread. The app does not
  compute an "optimal" bet: what to bet follows from bankroll, risk of ruin,
  the rules of the game, and how much spread the table tolerates, so the drill
  rehearses the ramp _you_ intend to play. A spread that shrinks as the count
  rises is allowed, with a note that it is usually a typo.
- **Graded at the correct count**, not the one you claimed: a miscount that
  leads to the wrong bet is exactly what the drill is there to catch. The rep
  counts as correct only when both the true count and the bet are right, and
  the two skills persist to separate stats stores (`True count` and
  `Bet spread` on the Progress screen).
- **Units, not chips.** They are ratios to a bankroll, deliberately unitless —
  unrelated to the showdown's 500 chips.
- **Live shoe or classic preset**, exactly like the true-count drill it is built
  on, and the post-count showdown follows a live-shoe round as usual: bet what
  your ramp says, then play the hand out.

#### Post-count showdown (live shoe only)

After a live-shoe true-count round, a **"Play a hand vs the dealer"** option
appears (when the shoe holds enough cards for the opening round). It deals from
the **same persistent shoe**, depleting it further:

- **One to three boxes** — Settings → Card counting → **Showdown hands** picks how many hands you play at once against the single dealer. The opening round deals in casino order (one card to each box, the dealer's upcard, a second to each box, the dealer's hole card), and each box is then played and settled on its own.
- **Hit, stand, double, split, and late surrender** — doubling takes exactly one card; pairs re-split up to four hands **per box**; split aces take one card each and stand; a 21 made after splitting is not a natural. The shared table rules govern DAS and LS: a split hand can double only with DAS on, and a box's original two cards may surrender only with LS on. Surrender settles the box as an immediate loss (half the bet comes back when bet sizing is on); never after a split, and the option lapses once a card is drawn. The peek settles any dealer natural before hands are played, which is what makes the surrender genuinely _late_.
- **Dealer auto-plays** the rule set from the shared table rules: stand on hard 17+, hit soft 17 only under H17.
- **Settlement** — each hand settles win / lose / push independently; a player natural pays 3:2; a dealer natural beats any non-natural; two naturals push; a player bust loses immediately even if the dealer later busts. A dealer natural ends every box at once, and a box holding a natural is paid immediately and sits out the rest of the round. Multi-hand rounds close with a one-line tally ("2 won, 1 lost"). The showdown keeps a win/lose/push (plus blackjacks) tally under its own `localStorage` key.
- **Bet sizing (optional)** — Settings → Card counting → **Bet sizing (bankroll)** turns the showdown into a spreading drill. Each round opens on a bet before any card is dealt (the count you just practised is the only information you have), every box posts that bet, and a double or split posts a second one. The rungs on offer are your own configured bet spread — one chip per unit — and the bet is graded against what that spread calls for at the count, so flat-betting a rich shoe is named rather than passing quietly. It is your spread, never a computed optimum: what to bet at a count follows from bankroll, risk of ruin and what the table tolerates, none of which this app knows. Any balanced system is graded on its own true count; an unbalanced one has none to index a ramp by, so its bet is left alone. Hands settle against a persisted bankroll of 500 chips: a win pays the stake, a natural 3:2 on the bet, a push returns it, a loss forfeits it. Chips are abstract units, not currency — what is being drilled is the ratio between the bet and the bankroll. A bet the bankroll cannot back across every box is not offered, and running out of chips offers a reset. Off by default, when the showdown is the pure hand tally above.
- **Insurance (with bet sizing on)** — when the dealer shows an ace, the round pauses before the hole card is checked: insure every box for half its bet, paid 2:1 on a dealer natural (exactly covering the lost hands) and forfeited otherwise. The classic count-driven side bet — the Hi-Lo deviation chart says take it at TC ≥ +3 — decided with the `I` / `N` keys, and skipped when the free chips cannot back it.
- **The play is graded against the count, and so is the insurance call** — every hit / stand / double / split / surrender is scored, and the round's misplays are listed again when it settles. The misplay still stands and is settled: this is a table, not a quiz. The insurance call is graded against the count you carried in from the drill plus every card face up at that moment — the hole card the bet is about is deliberately excluded — so insurance at +3 that loses is still marked correct. Both feed one "Showdown play" accuracy, separate from the win/lose/push tally: one measures how the cards fell, the other whether the hand was played right. An opening two-card misplay is also filed as a weak spot for the trainer that teaches the answer, so the hand you played badly at the table is the one the next session opens on. Systems the app has no published trigger for (a level-2 or fractional count) are dealt and settled without a verdict rather than scored against Hi-Lo's numbers; KO is graded on its book's own running-count insurance trigger.
- **Deviations apply here, because the count is real** — the showdown is the one place in the app where a live count meets an actual hand, so the play is scored against the [deviation chart](#deviations-trainer-v4) laid over basic strategy, not against basic strategy alone. Stand 16 vs 10 at a true count of 0 or higher and the table says so; hit it at −1 and the same hand grades the other way. The verdict names the index it fired on and what basic strategy alone would have done, an index miss is filed as a **Deviations** weak spot rather than a Basic Strategy one, and a hard-total index applies to a three-card 16 exactly as it does to a two-card one. Two limits: an index is a Hi-Lo true count, so every other system is graded on basic strategy alone (the same line insurance already draws), and a deviation calling for a play the felt is not offering — a double the bankroll cannot back, a split past the box's four-hand cap, a surrender the split already spent — leaves the chart's own answer standing.

- **And it says whose numbers these are** — a playing index is a Hi-Lo true count, so a trainee counting anything else is told once, before a card is dealt, that the indices are not theirs and what this table can still grade: basic strategy for every hand, plus KO's own running-count trigger for the insurance call where its book publishes one. The same advisory the Deviations drill, the deviation chart and Settings carry, now on the fourth screen where indices matter.

Returning from the showdown keeps the depletion it caused, so the next count
round may reshuffle past the cut card.

### Deviations Trainer (v4)

Drills initial two-card hands against the BJA Hi-Lo deviation charts on top
of basic strategy. Each scenario presents a random two-card player hand,
random dealer upcard, and a random integer true count, and the user picks
one of Hit / Stand / Double / Split / Surrender / Insurance.

- **H17 or S17 rule set** — toggle which dealer rule (and which deviation chart) to practice against.
- **Toggleable Double After Split (DAS) and Late Surrender (LS)** — the evaluator's live basic-strategy call honors both toggles, so deviations resolve on top of the same basic-strategy answer the trainer would give in v1.
- **True count source — Random or Manual** (chosen on the Settings screen, like the rest of the deviation options).
  - **Random** (default) — each hand draws a fresh uniform integer in
    `[-5, +8]`. Wide enough to exercise both negative- and positive-side
    deviations from the BJA chart.
  - **Manual** — set an integer in `[-20, +20]` in Settings and every dealt
    hand uses that count until you change it. Useful for drilling exact
    thresholds (e.g. `16 v 10` at `0`, insurance at `+3`, `15 v 10` at
    `+4`, `13 v 2` at `-1`).
- **Practice mode — All hands or Deviation-only.**
  - **All hands** (default) — random player hand, dealer upcard, and
    true count. Most dealt hands are ordinary basic-strategy hands.
  - **Deviation-only** — each scenario is built around a randomly chosen
    encoded deviation rule for the current rule set, so the user
    practices the chart cells where deviations actually matter. A
    "Deviation candidate hand" note appears in the feedback panel.
    Deviation-only means the _hand_ has an encoded rule — the true count
    may or may not trigger the deviation, so the user still has to
    decide whether to apply it. Under Random true count, the count is
    biased toward each rule's threshold (50% met / 50% unmet). Under
    Manual true count, the typed value is used as-is.
- **Six action choices** — Hit, Stand, Double, Split, Surrender, Insurance.
  Insurance is treated as a single action choice rather than a separate
  pre-decision prompt.
- **Keyboard shortcuts** — same bindings as the basic strategy drill: `H` / `S` / `D` / `P` / `R` (surrender) / `I` (insurance); correct answers auto-advance and any key continues after a miss.

#### Final-action evaluation

For each attempt the engine computes the correct action by combining:

- basic strategy (H17 or S17 chart, with DAS / LS toggles applied),
- the displayed true count,
- the BJA deviation rules for the active rule set,
- the insurance overlay (Ace upcard only).

The expected action is the result of that combination; the user's pick is
correct iff it matches.

#### Resolution order

The deviation engine resolves a playing decision in this order:

1. Compute the live basic-strategy action (honoring DAS / LS toggles).
2. Check the **surrender deviation overlay** first. Surrender deviations
   live in their own category and convert a non-surrender basic action to
   SUR when the threshold is met.
3. If the live basic action is already SUR (LS enabled + chart cell is
   `SUR_*`), respect it — do **not** let a hard/soft/pair deviation
   downgrade surrender to stand or hit.
4. Otherwise check the natural-category deviation (hard / soft / pair).
5. If nothing matches or the threshold isn't met, the basic action stands.

Surrender precedence (step 3) matters because natural deviations like
`16 v 10 stand @ 0+` would otherwise downgrade a basic surrender when
Late Surrender is available — the BJA LS overlay says surrender wins at
any count for those cells, so the basic-strategy SUR is preserved.

Insurance is offered before the playing decision and is evaluated on its
own path:

- **Only when the dealer upcard is Ace.** For any other upcard, insurance
  is incorrect — clicking Insurance prints a hint that insurance is only
  offered against a dealer Ace and shows the correct playing action.
- **Correct at true count ≥ +3.** Otherwise decline.
- **Single action choice.** The current trainer presents insurance as one
  of the six action buttons rather than a separate pre-decision step; the
  evaluator decides between "take insurance" and "play the hand normally"
  based on whether the insurance threshold is met.

#### Deviation source of truth

Deviation data is statically encoded from the
[Blackjack Apprenticeship Hi-Lo Deviation Charts](https://www.blackjackapprenticeship.com/hi-lo-deviations/):

- `data/h17-deviations.ts` — H17 deviation chart.
- `data/s17-deviations.ts` — S17 deviation chart.

Both files were transcribed from and verified against the BJA H17 / S17
deviation PDFs (linked from the chart page above). Each rule cites the
chart section it came from in its `source` field. **The PDFs are not
scraped at runtime** — the charts ship as static TypeScript literals,
exactly like the basic-strategy charts in v1.

The BJA chart legend uses `0+` for "any positive running count" and `0-`
for "any negative running count"; this trainer treats them inclusively
(TC ≥ 0 and TC ≤ 0 respectively) to align with the canonical
Illustrious 18 framing. For integer true counts this only affects the
boundary at TC = 0.

A handful of LS-category rules (e.g. `16 v 9 SUR @ -1-`, `15 v 10 SUR @ 0-`)
are encoded for chart faithfulness even though basic strategy already
returns SUR for the same hand when LS is enabled. These entries are
no-ops at runtime but document the chart cell.

### Shared (the Flow shell)

- **Flow home** — one loud primary action ("Continue — last trainer", `Enter`), the other two trainers on stable cards with lifetime-accuracy chips (keys `2` / `3`), the strategy chart (`C`), Settings (`,`), a daily-goal ring, and a 7-day streak strip.
- **Daily goal & practice history** — every graded rep records to a per-day hands count; the goal ring, streak dots, and each drill's session target derive from it. The daily goal (1–200, default 20) is set in Settings.
- **Adaptive weak-spot practice** — Basic Strategy and Deviations misses are tallied per scenario over a rolling 7-day window. Every round opens on the worst outstanding scenario and then draws ~40% of its hands from the weak list, weighted by miss count, so what you keep missing keeps coming back. A scenario retires from the list once you answer it correctly three times running, and the Done screen names the week's cleared spots.
- **Review rounds** — the Done screen's queued weakness is a button (`R`): it starts a round drawn entirely from the weak list, falling back to fresh hands if you clear it mid-round.
- **Flow drill shell** — shared top bar (today's count, session target, current streak, exit), full-screen stage, action buttons with key hints, and a Done screen with the round's accuracy and best streak.
- **Settings screen** — daily goal, appearance, table rules (H17/S17, DAS, LS), deviation options, and the full counting-drill configuration all live here; the drill pages host no configuration.
- **Reset practice data** (Settings → Practice data): a two-step control that clears every stat store, the practice history and streak, the weak-spot tallies, and the showdown record and bankroll through one `PracticeDataService`, so no store is missed.
  Settings themselves are deliberately untouched.
- **Strategy chart reference** (`/chart`, `C` from home): the hard/soft/pair grids for the active table rules, color-coded per action with a legend.
  Every cell is `BasicStrategyEngineService.decide()` run on a representative hand rather than a second transcription of the chart data, so what the page shows and what a drill grades cannot drift.
  `SUR_*` and `YN` cells resolve against the live DAS / Late-Surrender settings, and a pair the chart declines to split shows the play it falls back to.
  A second tab lists the deviation chart for the same rule set (insurance, hard, soft, pairs, surrender), each rule as hand, true-count threshold (`≥ +3`, `≤ -1`, `> 0`), and play.
- **Light and dark themes** — one semantic token set in two palettes (`src/styles.scss`). The palette follows `prefers-color-scheme`; Settings → Appearance pins it, which `ThemeService` applies as `data-theme` on `<html>` and mirrors into the `theme-color` meta so the browser chrome matches.
- **Accessibility** — grading is announced through a live region (the action grid conveys it with color and position alone), the Done screen takes focus when it replaces the drill, every screen carries a level-1 heading, focus rings clear 3:1 in both themes, and `prefers-reduced-motion` is honored.
- **Persistent lifetime stats per trainer** — attempts, correct count, accuracy, current streak, longest streak, each under its own `localStorage` key.
- **Progress screen** (`/progress`, `P` from home): the week as bars scaled against the daily goal, every stat store's lifetime hands / accuracy / best run (both drills plus the four counting modes), the showdown's W-L-P record and chip position once either exists, and the outstanding and cleared weak spots per trainer.
  Read-only, and each section hides itself until there is something to show.
- **Real card images** — 52 SVGs + face-down back from
  [richardschneider/cardsJS](https://github.com/richardschneider/cardsJS).
- **Routing** — `/` (home), `/drill/*`, `/chart`, `/progress`, `/settings`; pre-Flow trainer URLs redirect into the flow. Each route's component is destroyed and recreated by Angular's router, so in-memory drill state (current cards, in-progress answer, the live shoe) resets on navigation; persisted state is rehydrated from `localStorage` on reinit.
- **Installable PWA** — production builds ship the Angular service worker (`ngsw-config.json`; registered when the app goes stable), so the app works offline and installs from the browser. Once a complete new version is cached, a dismissible prompt reloads into it without force-activating a mixed bundle. The manifest carries 192/512 maskable icons derived from the iOS app icon, plus an `apple-touch-icon`; the page shells pad both safe-area insets so the top bars stay clear of the status bar in iOS standalone mode.

## iOS app

`ios/` hosts a native SwiftUI mirror of the trainer (app + home-screen widget), generated with XcodeGen from `ios/project.yml`.
It ports the Flow shell (home, drills, settings, chart, showdown) and the pure engines to Swift, syncs stats through iCloud Key-Value Store, and offers an optional daily practice reminder.
Engine parity with the web app is enforced by fixtures: `npm run export:fixtures` (`tools/export-parity-fixtures.ts`) emits `ios/Fixtures/*.json` from the TypeScript engines, the Swift parity tests replay those vectors, and CI fails if the exported fixtures drift from the committed ones.
Most vector files are exhaustive cross-products, but `play-deviation-vectors.json` lists only the combinations where a playing index actually fires over `decidePlay`, and declares the domain it speaks for.
The Swift test walks that domain and asserts both halves — a listed combination deviates to the named action and rule, an unlisted one does not deviate at all — so the delta is the whole specification at a fraction of the size.
`ios/AppStore/` holds submission collateral (privacy policy, support page, 6.9″ screenshots); the submission runbook is `docs/app-store-submission.md` and the iOS roadmap is `docs/ios-app-roadmap.md`.

## Tech stack

- **Angular 21** (standalone components, signal-based inputs/outputs,
  `provideRouter`, `afterNextRender`)
- **TypeScript 5.9**, strict mode
- **SCSS** for styles
- **Vitest 4** with `jsdom` for unit tests
- **Playwright** for the Chromium E2E smoke suite (`e2e/`)
- **No backend** — `localStorage` is the only persistence layer

## Project structure

Specs (`*.spec.ts`) are co-located next to the unit they cover and are omitted
below for brevity.

```
src/app/
├── app.ts, app.config.ts, app.routes.ts        bootstrap + lazy routes (home / drills / chart / settings)
├── core/
│   ├── keyboard.ts                              action hotkeys + shared keydown helpers
│   ├── models/
│   │   ├── card.model.ts                        Rank, Suit, Card, hand/card helpers
│   │   ├── strategy.model.ts                    Action, RuleSet, chart cell types
│   │   ├── counting-system.model.ts             CountingSystem, CountValue
│   │   ├── card-counting.model.ts               drill settings, result types, presets
│   │   ├── deviation.model.ts                   DeviationRule / DeviationDecision types
│   │   ├── shoe.model.ts                        Shoe — finite deck, depletion, cut card
│   │   ├── hand.model.ts                        N-card soft-aware hand math
│   │   ├── showdown.model.ts                    dealer play + settlement (3:2 naturals)
│   │   └── bankroll.model.ts                    bet clamping + payouts (chips, not currency)
│   └── services/
│       ├── basic-strategy-engine.service.ts     pure-TS basic-strategy logic
│       ├── counting-engine.service.ts           pure-TS counting engine (system-agnostic)
│       ├── deviation-engine.service.ts          pure-TS deviation overlay on basic strategy
│       ├── deviation-evaluator.service.ts       combines basic strategy + deviation + insurance
│       ├── card-generator.service.ts            random card + sequence generator (RNG seam)
│       ├── shoe.service.ts                      builds + shuffles a finite Shoe
│       ├── flow-prefs.service.ts                last trainer, daily goal, table rules, drill settings
│       ├── practice-history.service.ts          per-day hands → goal ring / streak dots
│       ├── miss-tally.service.ts                7-day per-scenario miss tally → weak spots
│       ├── stats-store.ts                       parameterized correct/incorrect stats container
│       ├── basic-strategy-stats.service.ts      Basic strategy StatsStore
│       ├── card-counting-stats.service.ts       Running count StatsStore
│       ├── true-count-stats.service.ts          True count StatsStore
│       ├── deviation-stats.service.ts           Deviations StatsStore
│       ├── deck-estimation-stats.service.ts     Deck-estimate (±0.5) StatsStore
│       ├── showdown-stats.service.ts            Showdown win/lose/push tally (own shape)
│       ├── practice-data.service.ts             one-call reset of every practice store
│       └── bankroll.service.ts                  Showdown bankroll (chips wagered + net)
├── data/
│   ├── h17-basic-strategy.ts                    BJA H17 chart (PDF linked)
│   ├── s17-basic-strategy.ts                    BJA S17 chart (PDF linked)
│   ├── counting-systems.ts                      Hi-Lo, KO, Omega II, Wong Halves + Blackjack Review set
│   ├── h17-deviations.ts                        BJA H17 deviation chart (PDF linked)
│   └── s17-deviations.ts                        BJA S17 deviation chart (PDF linked)
├── features/
│   ├── home/
│   │   └── home-page.component.ts               Flow home (continue, goal ring, streak)
│   ├── settings/
│   │   └── settings-page.component.ts           all configuration (goal, rules, drill settings)
│   ├── chart/
│   │   └── chart-page.component.ts              read-only strategy grids + deviation list
│   ├── progress/
│   │   └── progress-page.component.ts           week bars, per-store stats, weak spots
│   ├── drill/
│   │   ├── basic-strategy-drill-page.component.ts  Basic Strategy in the Flow loop
│   │   ├── deviations-drill-page.component.ts   Deviations in the Flow loop
│   │   ├── drill-session.ts                     per-round answer counters
│   │   ├── drill-hand.ts                        question labels, legal actions, weak-spot deals
│   │   ├── drill-timing.ts                      flash auto-advance delay token
│   │   ├── flow-stage.component.ts              full-screen dealer/player stage
│   │   └── scenario-generators.ts               pure helpers for Deviation-only mode
│   └── card-counting/
│       ├── card-counting-page.component.ts      state-machine orchestrator (drill + shoe + showdown)
│       ├── counting-settings.component.ts       counting config (hosted by the Settings page)
│       ├── card-stream.component.ts             current card + progress
│       ├── count-answer-form.component.ts       integer/decimal input + submit
│       ├── deck-estimate-form.component.ts      half-deck estimate stepper
│       ├── count-feedback-panel.component.ts    verdict + breakdown
│       └── showdown.component.ts                hit/stand/double/split showdown vs dealer
└── shared/
    ├── card-image.component.ts                 face-up/face-down card
    ├── flow-topbar.component.ts                in-drill top bar (count / target / streak / exit)
    ├── flow-actions.component.ts               action buttons + key hints
    ├── flow-done.component.ts                  session-end summary (+ weak spot)
    ├── goal-ring.component.ts                  daily-goal progress ring
    └── streak-dots.component.ts                7-day streak strip

e2e/                                            Playwright smoke suite (*.e2e.ts)
tools/export-parity-fixtures.ts                 emits ios/Fixtures/*.json from the TS engines
ios/                                            SwiftUI iOS app + widget (see iOS app)
public/cards/                                   52 SVGs + BLUE_BACK + LGPL notices
```

## Strategy engine (Basic Strategy)

The engine is pure TypeScript with no Angular runtime dependencies (the
`@Injectable` decorator is the only Angular concern, and the class is
instantiated directly in tests). It exposes two methods:

- `decide(input)` returns the chart's recommended action, the resolution
  source (`pair` / `soft` / `hard` / `surrender`), a hand description, and a
  rationale.
- `evaluate(input, userAction)` calls `decide()` and compares against what
  the user picked. Insurance is short-circuited at this layer — the engine
  never recommends Insurance, so a user pick of `INS` is always wrong with
  a fixed rationale.

Resolution order (matches the spec):

1. **Insurance check** — only at `evaluate()` time; engine output is unchanged.
2. **Pair check** with fall-through. `Y` → split; `YN` → split iff DAS;
   `N` / `YN`-without-DAS → fall through to hard/soft total; `SUR_Y` →
   surrender iff Late Surrender, else split (only used for H17 8,8 vs A).
3. **Soft total** for hands containing exactly one ace. Soft 21 (A + 10) is
   returned as Stand with a `Blackjack` description.
4. **Hard total** for the remainder. Cells `SUR_H` / `SUR_S` resolve as
   surrender iff Late Surrender, else fall back to hit / stand.

## Counting engine (Card Counting)

Also pure TypeScript, generic over `CountingSystem`. All shipped systems — the
original Hi-Lo, KO, Omega II, Wong Halves plus the Blackjack Review comparison
set — are defined as data in `data/counting-systems.ts`; more can be added there
without engine changes. API:

- `runningCount(cards, system)` — sum of per-card values. Empty sequence
  returns 0. Constant time per card.
- `trueCount(runningCount, decksRemaining)` — returns
  `Math.trunc(runningCount / decksRemaining)`. Truncation toward zero is
  this trainer's convention: a running count of `-5` over 2 decks rounds
  to `-2`, not `-3`.
- `evaluate(cards, userCount, system)` — wraps `runningCount` and returns
  a `RunningCountDrillResult` carrying the cards, both counts, and
  `isCorrect`.
- `evaluateTrueCount(cards, userTrueCount, decksRemaining, system, priorRunningCount = 0)`
  — wraps `runningCount` + `trueCount` and returns a `TrueCountDrillResult`.
  `priorRunningCount` is the count carried in from earlier rounds of the same
  live shoe (0 in classic mode), added to this round's cards to form the
  correct running count.
- `scoreDeckEstimate(estimate, actual, tolerance = 0.5)` — whether a
  decks-remaining estimate falls within the ±0.5-deck "good" band (with a
  small epsilon for floating-point error). Drives the live-shoe deck
  estimation stat.
- `validateSettings(settings)` — returns `{ valid, errors }`. Cards count must
  be a positive integer ≤ 200; time between cards must be ≥ 100ms. In true
  count mode either `decksRemaining` (classic) must be > 0, or the live-shoe
  config (decks, penetration, and a card count that fits the shoe) must be
  valid; in running count mode the decks settings are ignored.
- `isValidIntegerAnswer(raw)` / `isValidDecimalAnswer(raw)` — drive the answer
  form's Submit button. Integer systems use the integer validator; fractional
  systems (Wong Halves, in running-count mode) use the decimal one.
- `isFractionalSystem(system)` — true when any per-card value is non-integer
  (e.g. Wong Halves), used to pick the validator and input step. It reads the
  per-color tags of color systems, so Red Seven / KISS — whose averaged scalar
  is 0.5 but whose real per-card tags are integers — stay integer-input.

Counting systems are defined in `data/counting-systems.ts`, each with a comment
listing its per-rank tags, balance, and source. The classic decks-remaining presets are in
`core/models/card-counting.model.ts` as `DECKS_REMAINING_PRESETS`
(`0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6`); the live shoe's deck options
(`1, 2, 6, 8`) and penetration presets live in `core/models/shoe.model.ts`.

## Chart encoding & assumptions (Basic Strategy)

Both BJA charts are encoded as static TypeScript literals in
`src/app/data/`. Each cell uses one of:

| Symbol   | Meaning                                                                            |
| -------- | ---------------------------------------------------------------------------------- |
| `H`, `S` | Hit / Stand                                                                        |
| `D`      | Double (hard chart; always allowed here since we only handle initial 2-card hands) |
| `Ds`     | Double if allowed, else stand (soft chart) — collapses to Double in this trainer   |
| `Y`, `N` | Split / do not split                                                               |
| `YN`     | Split only if Double After Split is enabled                                        |
| `SUR_H`  | Surrender if Late Surrender is enabled, else Hit                                   |
| `SUR_S`  | Surrender if Late Surrender is enabled, else Stand                                 |
| `SUR_Y`  | Surrender if Late Surrender is enabled, else Split                                 |

The `SUR_*` variants are an internal extension. The published BJA charts
indicate the no-surrender fallback via footnotes; encoding it inline lets
the engine resolve toggles without secondary tables.

Other encoding choices:

- **Face cards normalize to 10** for hand totaling, dealer upcard lookup,
  and pair detection. Any two ten-value cards (e.g. `K + Q`, `10 + J`)
  share the `'10'` pair row, which is `N` everywhere → fall through to
  hard 20 → Stand.
- **`A + 10` (or `A + face`)** is rendered as Blackjack and returns
  Stand without a chart lookup.
- **Hard 4** (the 2,2 → DAS-off fall-through case) is clamped to hard 5
  at lookup time, since both rows are uniformly Hit.
- **D and Ds both map to Double** at the engine boundary because this
  trainer only handles initial two-card hands. The `Ds` symbol is
  preserved in the chart data for fidelity to BJA.

## Stats persistence

Each trainer (and each card-counting mode) persists its own stats under a
dedicated `localStorage` key. The first eight share the `StatsStore` base class
(`{ attempts, correct, streak, longestStreak }`); the showdown keeps a
different tally and does **not** extend `StatsStore`:

| Trainer / mode  | Key                               | Shape                                          |
| --------------- | --------------------------------- | ---------------------------------------------- |
| Basic Strategy  | `blackjack-basic-strategy-stats`  | StatsStore                                     |
| Running Count   | `blackjack-card-counting-stats`   | StatsStore                                     |
| True Count      | `blackjack-true-count-stats`      | StatsStore                                     |
| Deviations      | `blackjack-deviation-stats`       | StatsStore                                     |
| Deck estimation | `blackjack-deck-estimation-stats` | StatsStore (±0.5-deck hit = "correct")         |
| Key count call  | `blackjack-key-count-stats`       | StatsStore (the advantage call)                |
| Bet spread      | `blackjack-bet-spread-stats`      | StatsStore (the bet against your ramp)         |
| Deck speed      | `blackjack-deck-speed-stats`      | StatsStore (the countdown's count)             |
| Deck record     | `blackjack-deck-speed-best`       | `{ bestMs }` — fastest correct countdown       |
| Showdown        | `blackjack-showdown-stats`        | `{ hands, wins, losses, pushes, blackjacks }`  |
| Showdown chips  | `blackjack-showdown-bankroll`     | `{ bankroll, wagered, net }` (bet sizing only) |

The Flow shell adds three keys of its own:

| Store            | Key                          | Shape                                                                             |
| ---------------- | ---------------------------- | --------------------------------------------------------------------------------- |
| Flow prefs       | `blackjack-flow-prefs`       | last trainer, daily goal, theme, table rules, per-trainer drill settings          |
| Practice history | `blackjack-practice-history` | per-day hands counts (local calendar dates, pruned past ~400 days)                |
| Miss tally       | `blackjack-miss-tally`       | per-scenario attempt/miss day tallies + clear streak (Basic Strategy, Deviations) |

Every store loads tolerantly (a malformed or partial payload degrades to defaults field by field) and persists silently through quota / private-browsing errors.
The home screen's accuracy chips read the lifetime stats stores; the card-counting card combines the running-count and true-count stores.

Note: v2 dropped the v1 key (`blackjack-trainer:stats:v1`); `main.ts` runs
`cleanupLegacyStatsKeys()` on boot to wipe it. If you were running v1 locally,
your previous basic-strategy stats are orphaned in storage — they're not loaded
by the current app.

## License and attribution

### App code

The application code in this repository is licensed under the **MIT License** —
see the top-level [`LICENSE`](LICENSE) file for the full text (copyright © 2026
Arthur Zhang). MIT covers the application **source only**; it does **not** cover
the bundled card art under `public/cards/`, which is licensed separately (see
[Card art](#card-art)).

The package is still marked `"private": true` in `package.json`, which guards
against an accidental `npm publish`; that flag is independent of the MIT license
on the source.

For a point-in-time review of the repository's licensing and asset-attribution
state, see
[`docs/license-and-attribution-audit.md`](docs/license-and-attribution-audit.md).

### Card art

The card SVG assets are licensed and attributed **separately** from the app
code and are **not** covered by the MIT license above. The 52
card SVGs and `BLUE_BACK.svg` under `public/cards/` come from
[richardschneider/cardsJS](https://github.com/richardschneider/cardsJS), which
packages Chris Aguilar's
[Vector Playing Card Library](https://code.google.com/archive/p/vectorized-playing-cards/)
1.3, licensed under **LGPL 3.0**. The upstream notices are committed alongside
the SVGs and ship in the production build to preserve attribution:

- [`public/cards/AUTHORS.txt`](public/cards/AUTHORS.txt) — author and copyright notice.
- [`public/cards/COPYING.txt`](public/cards/COPYING.txt) — GNU GPL v3 license text.
- [`public/cards/COPYING.LESSER.txt`](public/cards/COPYING.LESSER.txt) — GNU LGPL v3 license text.

## Roadmap

All nine planned slices are complete — see [`docs/roadmap.md`](docs/roadmap.md)
and the cursor/handoff log in
[`docs/roadmap-progress.md`](docs/roadmap-progress.md).

### Completed

- **Basic Strategy Trainer (v1)** — H17/S17 charts, DAS / LS toggles, insurance.
- **Running Count Trainer (v2)** — card-stream drills, configurable length and
  speed.
- **True Count Trainer (v3)** — decks-remaining presets, truncation toward zero.
- **Deviations Trainer (v4)** — BJA H17/S17 Hi-Lo deviation overlay on basic
  strategy, with insurance evaluated at TC ≥ +3.
- **Lint/format tooling + CI** — `lint` / `format` scripts and a GitHub Actions
  gate (`lint → test → build`).
- **Chart golden-file guards** — value-level regression guards for the four
  chart data files.
- **Shared blackjack-UI / keyboard refactor** — table, action buttons, feedback
  shell, rule controls, and the trainer keydown handler shared across trainers.
- **Counting systems KO, Omega II, Wong Halves** — added alongside Hi-Lo, with
  `CountValue` widened to support level-2/level-3 and fractional values.
- **Finite-shoe live deck estimation** — play a real depleting shoe and estimate
  decks remaining (scored within ±0.5), instead of a fixed preset.
- **Post-count showdown** — single hand vs the dealer off the live shoe
  (hit/stand, H17/S17 dealer, 3:2 naturals, win/lose/push tally).
- **Blackjack Review counting systems** — the comparison-table set added as pure
  data (Hi-Opt I/II, Zen, Revere Point Count, Mentor, the Griffin / Uston / EBJ
  families, the color-dependent Red Seven and KISS 2/3, and the computer-only /
  inverted novelties), on a color-aware counting model — 58 systems in all.
- **Flow redesign** — the one-action home (continue, daily-goal ring, 7-day streak), full-screen auto-advancing drills, the weak-spot "Drill next" loop, and a dedicated Settings screen replacing all in-drill configuration.
- **Playwright E2E smoke suite** — navigation, drill flows (basic strategy, card counting, deviations), persistence, responsive, theme, seeded-determinism, and review-round specs in `e2e/`, with a CI job uploading the HTML report.
- **Showdown doubles and splits** — double takes one card; pairs re-split to four hands; split aces take one card; split 21s pay even money.
- **iOS SwiftUI app** — the Flow shell mirrored natively (widget, iCloud sync, daily reminder), with fixture-enforced engine parity and App Store collateral prepared. Adaptive weak-spot practice, review rounds, the Appearance preference, and multi-hand showdowns are mirrored too.
- **Multi-hand showdowns** — one to three simultaneous boxes against a single dealer, on both web and iOS, with the box count in Settings.
- **Light theme on iOS** — `Theme` resolves every token per color scheme (mirroring the web light/dark palettes) and Settings → Appearance drives `preferredColorScheme`.
- **Real PWA install** — Angular service worker for offline use, maskable 192/512 icons, apple-touch-icon, and top safe-area handling for iOS standalone.
- **Coverage gate + deeper E2E** — enforced coverage thresholds (`vitest.config.ts`, run in CI), counting/deviation drill e2e specs, and a value-by-value audit (2026-07-24) of all four chart data files against the published BJA PDFs — every cell matched.
- **Seeded sessions** — a `?seed=` hook behind one injection token makes every draw reproducible, which is what lets the E2E suite assert exact outcomes instead of only that the flow advanced.
- **Light theme + accessibility pass** — a second palette over one semantic token set, selectable in Settings or left to the OS, plus live-region grading announcements, Done-screen focus handling, per-screen headings, and reduced-motion support.
- **Adaptive weak-spot practice** — weighted scenario selection across the whole round, a three-in-a-row clear-streak threshold that retires a scenario, `R` review rounds drawn entirely from the weak list, and the week's cleared spots on the Done screen.

### Future (not yet implemented)

Deferred follow-ons, documented in `docs/roadmap-progress.md` and
`docs/ios-app-roadmap.md`:

- **Deviation charts for KO / Omega II / Wong Halves** — deviations are Hi-Lo
  only.
  The app no longer hides this: the indices are labelled as Hi-Lo true counts,
  and picking another counting system puts an advisory on the Deviations drill,
  the deviation chart, and the Deviations settings section.
- **App Store submission** — the human/Apple steps in
  [`docs/app-store-submission.md`](docs/app-store-submission.md): hosting the
  privacy/support pages, App Store Connect setup, TestFlight, and review.
