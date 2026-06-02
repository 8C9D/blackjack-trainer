# Blackjack Trainer

A frontend-only Angular app for practicing four blackjack skills:

1. **Basic Strategy Trainer** — initial two-card hands against H17/S17 charts
   from [Blackjack Apprenticeship](https://www.blackjackapprenticeship.com/).
2. **Hi-Lo Running Count Trainer** — running-count drills on random card
   streams of configurable length and speed.
3. **Hi-Lo True Count Trainer** — same card streams, but the user answers the
   true count (`runningCount / decksRemaining`, truncated toward zero) given
   a chosen decks-remaining value.
4. **Deviations Trainer** — initial two-card hands against the BJA H17/S17
   Hi-Lo deviation charts, with the true count either randomly generated or
   manually entered to drill exact thresholds. Practice all hands or
   restrict to deviation-candidate hands. Evaluates the playing decision
   against basic strategy + the deviation overlay, plus an insurance
   overlay when the dealer shows an Ace.

All four modes persist independent session stats to `localStorage` and reuse
the same card model + cardsJS images.

## Quick start

Node 22 is recommended — run `nvm use` to match the bundled `.nvmrc`. npm is
required too. From the repo root:

```bash
npm install
npm start        # dev server at http://127.0.0.1:4200/
npm test         # vitest, single run in CI / watch in TTY
npm run build    # production bundle in dist/blackjack-trainer/
```

GitHub Actions runs `npm ci`, `CI=true npm test`, and `npm run build` on every
push and pull request to `main` (`.github/workflows/ci.yml`).

Navigate to `/basic-strategy`, `/card-counting`, or `/deviations` (top nav
links).

## Features

### Basic Strategy Trainer (v1)

- **H17 and S17 rule sets** — toggle which dealer rule to practice against.
- **Toggleable Double After Split (DAS) and Late Surrender** — exercises the
  parts of the chart that vary with table rules.
- **Insurance is always wrong** — clicking the Insurance button is flagged
  with an explanation that basic strategy never takes the side bet.
- **Per-attempt feedback** with the canonical hand label (e.g. `Soft 18
  (A, 7)`, `Hard 16`, `Pair of 8s`), the correct action, and a one-line
  rationale.
- **Keyboard shortcuts** — `H` / `S` / `D` / `P` / `R` (surrender) /
  `I` (insurance) for actions, `Enter` to deal the next hand.

### Hi-Lo Card Counting Trainer (v2 + v3)

The card counting page hosts two drill modes that share the same flow. A
mode selector switches between them at drill setup.

**Running count mode (v2)** — user watches a card stream and submits the
Hi-Lo running count at the end of the stream.

**True count mode (v3)** — same card stream, plus a decks-remaining preset.
User submits the true count, computed as
`Math.trunc(runningCount / decksRemaining)`.

#### Shared mechanics

- **Hi-Lo running count** — 2–6 = +1, 7–9 = 0, 10/J/Q/K/A = −1.
- **Configurable drill** — number of cards and time between cards (≥ 100ms).
- **State machine** — settings → start → cards stream → answer prompt →
  feedback with optional card-by-card breakdown.
- **Validation** — invalid settings disable the Start button with inline
  errors; the answer field only enables Submit on valid integer input.
- **Keyboard shortcut** — `Enter` starts a drill from idle / restarts after
  feedback. The answer form has its own native Enter-to-submit.
- **Card-by-card breakdown** — expandable view shows each card's Hi-Lo
  delta and the running total at that point.

#### True count specifics

- **Decks remaining presets** — `0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6`. Half-deck
  granularity below 3 decks (where small changes swing the true count the
  most), whole decks from 3 to 6. The selector only appears in true count
  mode.
- **Truncation toward zero** — the trainer scores against
  `Math.trunc(runningCount / decksRemaining)`. Examples:
  `5 / 2 = 2`, `-5 / 2 = -2`, `3 / 0.5 = 6`. This app uses truncation toward
  zero for true count answers; other references may use different rounding
  rules, and this is the convention this trainer scores against.
- **Separate stats** — true count attempts are persisted under their own
  `localStorage` key (see [Stats persistence](#stats-persistence)).

### Deviations Trainer (v4)

Drills initial two-card hands against the BJA Hi-Lo deviation charts on top
of basic strategy. Each scenario presents a random two-card player hand,
random dealer upcard, and a random integer true count, and the user picks
one of Hit / Stand / Double / Split / Surrender / Insurance.

- **H17 or S17 rule set** — toggle which dealer rule (and which deviation
  chart) to practice against.
- **Toggleable Double After Split (DAS) and Late Surrender (LS)** — the
  evaluator's live basic-strategy call honors both toggles, so deviations
  resolve on top of the same basic-strategy answer the trainer would give
  in v1.
- **True count source — Random or Manual.**
  - **Random** (default) — each hand draws a fresh uniform integer in
    `[-5, +8]`. Wide enough to exercise both negative- and positive-side
    deviations from the BJA chart.
  - **Manual** — type an integer in `[-20, +20]` and every dealt hand
    uses that count until you change it. Useful for drilling exact
    thresholds (e.g. `16 v 10` at `0`, insurance at `+3`, `15 v 10` at
    `+4`, `13 v 2` at `-1`). Invalid input blocks the next-hand button
    until corrected.
- **Practice mode — All hands or Deviation-only.**
  - **All hands** (default) — random player hand, dealer upcard, and
    true count. Most dealt hands are ordinary basic-strategy hands.
  - **Deviation-only** — each scenario is built around a randomly chosen
    encoded deviation rule for the current rule set, so the user
    practices the chart cells where deviations actually matter. A
    "Deviation candidate hand" note appears in the feedback panel.
    Deviation-only means the *hand* has an encoded rule — the true count
    may or may not trigger the deviation, so the user still has to
    decide whether to apply it. Under Random true count, the count is
    biased toward each rule's threshold (50% met / 50% unmet). Under
    Manual true count, the typed value is used as-is.
- **Six action choices** — Hit, Stand, Double, Split, Surrender, Insurance.
  Insurance is treated as a single action choice rather than a separate
  pre-decision prompt.
- **Keyboard shortcuts** — same bindings as the basic strategy page:
  `H` / `S` / `D` / `P` / `R` (surrender) / `I` (insurance), `Enter` to
  deal the next hand after feedback.

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

### Shared

- **Persistent session stats per trainer** — attempts, correct count,
  accuracy, current streak, longest streak. Each trainer stores under its
  own `localStorage` key, with a per-trainer reset button.
- **Real card images** — 52 SVGs + face-down back from
  [richardschneider/cardsJS](https://github.com/richardschneider/cardsJS).
- **Routing + top nav** — switch trainers via the top nav. Each route's
  component is destroyed and recreated by Angular's router, so in-memory
  drill state (current cards, in-progress answer, current hand) is reset
  on navigation. Only persisted session stats survive route changes,
  since they're rehydrated from `localStorage` on component reinit.

## Tech stack

- **Angular 21** (standalone components, signal-based inputs/outputs,
  `provideRouter`, `afterNextRender`)
- **TypeScript 5.9**, strict mode
- **SCSS** for styles
- **Vitest 4** with `jsdom` for unit tests
- **No backend** — `localStorage` is the only persistence layer

## Project structure

```
src/app/
├── app.ts, app.config.ts, app.routes.ts, app.spec.ts   bootstrap + routing
├── core/
│   ├── models/
│   │   ├── card.model.ts                       Rank, Suit, Card, helpers
│   │   ├── strategy.model.ts                   Action, RuleSet, chart cell types
│   │   ├── counting-system.model.ts            CountingSystem, CountValue
│   │   ├── card-counting.model.ts              Drill settings, result types, decks-remaining presets
│   │   └── deviation.model.ts                  DeviationRule / DeviationDecision types
│   └── services/
│       ├── basic-strategy-engine.service.ts    pure-TS strategy logic
│       ├── basic-strategy-engine.service.spec.ts  40 engine tests
│       ├── counting-engine.service.ts          pure-TS Hi-Lo engine
│       ├── counting-engine.service.spec.ts     30 engine tests
│       ├── deviation-engine.service.ts         pure-TS Hi-Lo deviation engine (overlay on basic strategy)
│       ├── card-generator.service.ts           random card + sequence generator
│       ├── stats-store.ts                      parameterized stats container
│       ├── stats-store.spec.ts                 10 stats tests
│       ├── basic-strategy-stats.service.ts     Basic strategy StatsStore subclass
│       ├── card-counting-stats.service.ts      Hi-Lo running count StatsStore subclass
│       ├── true-count-stats.service.ts         Hi-Lo true count StatsStore subclass
│       └── deviation-stats.service.ts          Deviations StatsStore subclass
├── data/
│   ├── h17-basic-strategy.ts                   BJA H17 chart (PDF linked)
│   ├── s17-basic-strategy.ts                   BJA S17 chart (PDF linked)
│   ├── counting-systems.ts                     HI_LO + system registry
│   ├── h17-deviations.ts                       BJA H17 deviation chart (PDF linked)
│   └── s17-deviations.ts                       BJA S17 deviation chart (PDF linked)
├── features/
│   ├── basic-strategy/
│   │   ├── basic-strategy-page.component.ts    thin orchestrator
│   │   ├── rule-selector.component.ts          H17/S17 + DAS + LS toggles
│   │   ├── blackjack-table.component.ts        dealer / player layout
│   │   ├── action-buttons.component.ts         6 action buttons
│   │   └── feedback-panel.component.ts         result + rationale
│   ├── card-counting/
│   │   ├── card-counting-page.component.ts     state machine orchestrator
│   │   ├── counting-settings.component.ts      cards / ms inputs + errors
│   │   ├── card-stream.component.ts            current card + progress
│   │   ├── count-answer-form.component.ts      integer input + submit
│   │   └── count-feedback-panel.component.ts   verdict + breakdown
│   └── deviations/
│       ├── deviations-page.component.ts        orchestrator (hand + TC + action eval)
│       ├── deviation-settings.component.ts     H17/S17 + DAS + LS + practice mode toggles
│       ├── deviation-feedback-panel.component.ts  result + deviation rationale
│       └── scenario-generators.ts              pure helpers for Deviation-only mode
└── shared/
    ├── card-image.component.ts                 face-up/face-down card
    └── stats-panel.component.ts                stats + reset

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

Also pure TypeScript, generic over `CountingSystem` so additional systems
(KO, Omega II, Wong Halves) can be added as data in
`data/counting-systems.ts` without engine changes. API:

- `runningCount(cards, system)` — sum of per-card values. Empty sequence
  returns 0. Constant time per card.
- `trueCount(runningCount, decksRemaining)` — returns
  `Math.trunc(runningCount / decksRemaining)`. Truncation toward zero is
  this trainer's convention: a running count of `-5` over 2 decks rounds
  to `-2`, not `-3`.
- `evaluate(cards, userCount, system)` — wraps `runningCount` and returns
  a `RunningCountDrillResult` carrying the cards, both counts, and
  `isCorrect`.
- `evaluateTrueCount(cards, userTrueCount, decksRemaining, system)` —
  wraps `runningCount` + `trueCount` and returns a `TrueCountDrillResult`
  carrying the cards, the running count, the decks remaining, both true
  counts, and `isCorrect`.
- `validateSettings(settings)` — returns `{ valid, errors }`. Cards count
  must be a positive integer; time between cards must be ≥ 100ms. In true
  count mode `decksRemaining` must be a finite number greater than 0; in
  running count mode it's ignored.
- `isValidIntegerAnswer(raw)` — drives the answer form's Submit button.
  Same shape for both modes (signed integers; decimals rejected).

Hi-Lo values are defined in `data/counting-systems.ts` with a comment
linking to the Blackjack Apprenticeship reference. Decks remaining
presets are defined in `core/models/card-counting.model.ts` as
`DECKS_REMAINING_PRESETS` (`0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6`).

## Chart encoding & assumptions (Basic Strategy)

Both BJA charts are encoded as static TypeScript literals in
`src/app/data/`. Each cell uses one of:

| Symbol | Meaning |
|---|---|
| `H`, `S` | Hit / Stand |
| `D` | Double (hard chart; always allowed here since we only handle initial 2-card hands) |
| `Ds` | Double if allowed, else stand (soft chart) — collapses to Double in this trainer |
| `Y`, `N` | Split / do not split |
| `YN` | Split only if Double After Split is enabled |
| `SUR_H` | Surrender if Late Surrender is enabled, else Hit |
| `SUR_S` | Surrender if Late Surrender is enabled, else Stand |
| `SUR_Y` | Surrender if Late Surrender is enabled, else Split |

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
dedicated `localStorage` key via a `StatsStore` base class:

| Trainer / mode | Key |
|---|---|
| Basic Strategy | `blackjack-basic-strategy-stats` |
| Hi-Lo Running Count | `blackjack-card-counting-stats` |
| Hi-Lo True Count | `blackjack-true-count-stats` |
| Deviations | `blackjack-deviation-stats` |

The stats panel on the card counting page reflects the currently selected
mode, and the **Reset** button only resets the active mode's stats —
the other mode's stats are untouched. Switching modes mid-drill is blocked
(the mode selector is disabled while a drill is in flight).

Note: v2 dropped the v1 key (`blackjack-trainer:stats:v1`). If you were
running v1 locally, your previous basic-strategy stats are orphaned in
storage — they're not loaded by v2 or v3.

## Card asset attribution

The 52 card SVGs and `BLUE_BACK.svg` under `public/cards/` come from
[richardschneider/cardsJS](https://github.com/richardschneider/cardsJS),
which packages Chris Aguilar's
[Vector Playing Card Library](https://code.google.com/archive/p/vectorized-playing-cards/)
1.3. The library is licensed under **LGPL** (see
`public/cards/COPYING.txt`, `COPYING.LESSER.txt`, `AUTHORS.txt`). The
LGPL files are committed alongside the SVGs to preserve attribution.

## Roadmap

### Completed

- **Basic Strategy Trainer (v1)** — H17/S17 charts, DAS / LS toggles,
  insurance.
- **Hi-Lo Running Count Trainer (v2)** — card-stream drills, configurable
  length and speed.
- **Hi-Lo True Count Trainer (v3)** — decks-remaining presets, truncation
  toward zero.
- **Deviations Trainer (v4)** — BJA H17/S17 Hi-Lo deviation overlay on
  basic strategy, with insurance evaluated at TC ≥ +3.

### Future (not yet implemented)

The codebase is organized to make these additions straightforward later.
None of the items in this list ship in the current build.

- **Additional counting systems later** — KO, Omega II, Wong Halves
  (data-only addition; the engine already accepts arbitrary
  `CountingSystem` values).
- **Finite shoe / deck estimation later** — playing through a real shoe
  and estimating decks remaining from observed cards, rather than picking
  a preset before each drill.
- **Showdowns later** — multi-hand / dealer-resolution scenarios after
  the count drill ends.
- **Shared blackjack UI component refactor** — extract the table /
  action buttons / feedback shell shared between v1 and v4, if the
  duplication starts to hurt.
