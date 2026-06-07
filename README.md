# Blackjack Trainer

A frontend-only Angular app for practicing four blackjack skills:

1. **Basic Strategy Trainer** — initial two-card hands against H17/S17 charts
   from [Blackjack Apprenticeship](https://www.blackjackapprenticeship.com/).
2. **Running Count Trainer** — running-count drills on random card streams of
   configurable length and speed, across four counting systems (Hi-Lo, KO,
   Omega II, Wong Halves).
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

All four modes persist independent session stats to `localStorage` and reuse
the same card model + cardsJS images. The layout is responsive (desktop top
nav, phone bottom tab bar) with PWA-ready metadata.

## Quick start

Node 22 is recommended — run `nvm use` to match the bundled `.nvmrc`. npm is
required too. From the repo root:

```bash
npm install
npm start          # dev server at http://127.0.0.1:4200/
npm test           # vitest, single run in CI / watch in TTY
npm run typecheck  # tsc --noEmit on the app sources
npm run lint       # typecheck + prettier --check
npm run build      # production bundle in dist/blackjack-trainer/
```

GitHub Actions runs `npm ci`, `npm run lint`, `CI=true npm test`, and
`npm run build` on every push and pull request to `main`
(`.github/workflows/ci.yml`).

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

### Card Counting Trainer (v2 + v3, plus live shoe & showdown)

The card counting page hosts two drill modes that share the same flow. A
mode selector switches between them at drill setup.

**Running count mode (v2)** — user watches a card stream and submits the
running count at the end of the stream.

**True count mode (v3)** — same card stream, plus a decks-remaining figure.
User submits the true count, computed as
`Math.trunc(runningCount / decksRemaining)`.

#### Counting systems

The running-count trainer offers four systems, discovered from a registry in
`data/counting-systems.ts` (the engine reads values straight off the
descriptor, so adding a system is data-only):

| System             | Level | Balanced                 | Card values                                                  |
| ------------------ | ----- | ------------------------ | ------------------------------------------------------------ |
| **Hi-Lo**          | 1     | yes                      | 2–6 = +1, 7–9 = 0, 10/J/Q/K/A = −1                           |
| **KO** (Knock-Out) | 1     | **no** (deck sums to +4) | 2–7 = +1, 8–9 = 0, 10–A = −1                                 |
| **Omega II**       | 2     | yes                      | 2/3/7 = +1, 4/5/6 = +2, 8/A = 0, 9 = −1, 10–K = −2           |
| **Wong Halves**    | 3     | yes                      | 2/7 = +0.5, 3/4/6 = +1, 5 = +1.5, 8 = 0, 9 = −0.5, 10–A = −1 |

- **True count is offered only for balanced systems.** KO is unbalanced, so it
  is trained as a running count only; the true-count radio is disabled with a
  note. (KO's IRC / key-count true-count math is not implemented.)
- **Wong Halves uses fractional values.** In running-count mode the answer
  input accepts decimals (step 0.5); true counts are still whole numbers
  (`Math.trunc`).

#### Shared mechanics

- **Configurable drill** — number of cards (1–200) and time between cards
  (≥ 100ms).
- **State machine** — settings → start → cards stream → answer prompt →
  feedback with optional card-by-card breakdown. (Live-shoe true count inserts
  a deck-estimate step before the answer; see below.)
- **Validation** — invalid settings disable the Start button with inline
  errors; the answer field only enables Submit on valid input.
- **Keyboard shortcut** — `Enter` starts a drill from idle / restarts after
  feedback. The answer form has its own native Enter-to-submit.
- **Card-by-card breakdown** — expandable view shows each card's count
  delta and the running total at that point.

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
  with a visible notice). Live-shoe rounds show two stats panels — **True
  count** and **Deck estimation (±0.5)**.

**Truncation toward zero** — examples: `5 / 2 = 2`, `-5 / 2 = -2`,
`3 / 0.5 = 6`. This app uses truncation toward zero; other references may round
differently, and this is the convention the trainer scores against. True-count
attempts persist under their own `localStorage` key (see
[Stats persistence](#stats-persistence)).

#### Post-count showdown (live shoe only)

After a live-shoe true-count round, a **"Play a hand vs the dealer"** option
appears (when the shoe has at least four cards). It deals one player hand from
the **same persistent shoe**, depleting it further:

- **Hit/stand only** — no doubles, splits, surrender, or insurance.
- **Dealer auto-plays** the active rule set: stand on hard 17+, hit soft 17
  only under H17 (an H17/S17 toggle lives inside the showdown).
- **Settlement** — win / lose / push; a player natural pays 3:2; a dealer
  natural beats any non-natural; two naturals push; a player bust loses
  immediately even if the dealer later busts. There is **no bankroll or
  betting** — the "3:2" is flavor; the showdown keeps a win/lose/push (plus
  blackjacks) tally under its own `localStorage` key.

Returning from the showdown keeps the depletion it caused, so the next count
round may reshuffle past the cut card.

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
    Deviation-only means the _hand_ has an encoded rule — the true count
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
- **Routing + responsive nav** — switch trainers via the top nav on desktop
  or a fixed bottom tab bar on phones (`max-width: 600px`); both render from
  one shared links array. Each route's component is destroyed and recreated by
  Angular's router, so in-memory drill state (current cards, in-progress
  answer, current hand, the live shoe) is reset on navigation. Only persisted
  session stats survive route changes, since they're rehydrated from
  `localStorage` on component reinit.
- **PWA-ready metadata** — `manifest.webmanifest`, theme color, and iOS
  add-to-home-screen hints ship as static assets. There is **no** service
  worker, so the app is not offline-capable / installable as a full PWA yet.

## Tech stack

- **Angular 21** (standalone components, signal-based inputs/outputs,
  `provideRouter`, `afterNextRender`)
- **TypeScript 5.9**, strict mode
- **SCSS** for styles
- **Vitest 4** with `jsdom` for unit tests
- **No backend** — `localStorage` is the only persistence layer

## Project structure

Specs (`*.spec.ts`) are co-located next to the unit they cover and are omitted
below for brevity.

```
src/app/
├── app.ts, app.config.ts, app.routes.ts        bootstrap + lazy routes + responsive nav
├── core/
│   ├── keyboard.ts                              action hotkeys + shared trainer-keydown helper
│   ├── models/
│   │   ├── card.model.ts                        Rank, Suit, Card, hand/card helpers
│   │   ├── strategy.model.ts                    Action, RuleSet, chart cell types
│   │   ├── counting-system.model.ts             CountingSystem, CountValue
│   │   ├── card-counting.model.ts               drill settings, result types, presets
│   │   ├── deviation.model.ts                   DeviationRule / DeviationDecision types
│   │   ├── shoe.model.ts                        Shoe — finite deck, depletion, cut card
│   │   ├── hand.model.ts                        N-card soft-aware hand math
│   │   └── showdown.model.ts                    dealer play + settlement (3:2 naturals)
│   └── services/
│       ├── basic-strategy-engine.service.ts     pure-TS basic-strategy logic
│       ├── counting-engine.service.ts           pure-TS counting engine (system-agnostic)
│       ├── deviation-engine.service.ts          pure-TS deviation overlay on basic strategy
│       ├── deviation-evaluator.service.ts       combines basic strategy + deviation + insurance
│       ├── card-generator.service.ts            random card + sequence generator (RNG seam)
│       ├── shoe.service.ts                      builds + shuffles a finite Shoe
│       ├── stats-store.ts                       parameterized correct/incorrect stats container
│       ├── basic-strategy-stats.service.ts      Basic strategy StatsStore
│       ├── card-counting-stats.service.ts       Running count StatsStore
│       ├── true-count-stats.service.ts          True count StatsStore
│       ├── deviation-stats.service.ts           Deviations StatsStore
│       ├── deck-estimation-stats.service.ts     Deck-estimate (±0.5) StatsStore
│       └── showdown-stats.service.ts            Showdown win/lose/push tally (own shape)
├── data/
│   ├── h17-basic-strategy.ts                    BJA H17 chart (PDF linked)
│   ├── s17-basic-strategy.ts                    BJA S17 chart (PDF linked)
│   ├── counting-systems.ts                      Hi-Lo, KO, Omega II, Wong Halves + registry
│   ├── h17-deviations.ts                        BJA H17 deviation chart (PDF linked)
│   └── s17-deviations.ts                        BJA S17 deviation chart (PDF linked)
├── features/
│   ├── basic-strategy/
│   │   ├── basic-strategy-page.component.ts     thin orchestrator
│   │   └── feedback-panel.component.ts          result + rationale
│   ├── card-counting/
│   │   ├── card-counting-page.component.ts      state-machine orchestrator (drill + shoe + showdown)
│   │   ├── counting-settings.component.ts       system / mode / cards / ms / shoe inputs
│   │   ├── card-stream.component.ts             current card + progress
│   │   ├── count-answer-form.component.ts       integer/decimal input + submit
│   │   ├── deck-estimate-form.component.ts      half-deck estimate stepper
│   │   ├── count-feedback-panel.component.ts    verdict + breakdown
│   │   └── showdown.component.ts                hit/stand showdown vs dealer
│   └── deviations/
│       ├── deviations-page.component.ts         orchestrator (hand + TC + action eval)
│       ├── deviation-settings.component.ts      rule set + DAS + LS + TC source + practice mode
│       ├── deviation-feedback-panel.component.ts  result + deviation rationale
│       └── scenario-generators.ts              pure helpers for Deviation-only mode
└── shared/
    ├── blackjack-table.component.ts            dealer / player layout
    ├── action-buttons.component.ts             action buttons (subsettable)
    ├── card-image.component.ts                 face-up/face-down card
    ├── feedback-shell.component.ts             shared feedback container
    ├── rule-controls.component.ts              H17/S17 + DAS + LS toggles
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

Also pure TypeScript, generic over `CountingSystem`. The four shipped systems
(Hi-Lo, KO, Omega II, Wong Halves) are all defined as data in
`data/counting-systems.ts`; more can be added there without engine changes. API:

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
- `isFractionalSystem(system)` — true when any per-rank value is non-integer
  (Wong Halves), used to decide which validator and input step to use.

Counting systems are defined in `data/counting-systems.ts`, each with a comment
linking to its reference. The classic decks-remaining presets are in
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
dedicated `localStorage` key. The first five share the `StatsStore` base class
(`{ attempts, correct, streak, longestStreak }`); the showdown keeps a
different tally and does **not** extend `StatsStore`:

| Trainer / mode  | Key                               | Shape                                         |
| --------------- | --------------------------------- | --------------------------------------------- |
| Basic Strategy  | `blackjack-basic-strategy-stats`  | StatsStore                                    |
| Running Count   | `blackjack-card-counting-stats`   | StatsStore                                    |
| True Count      | `blackjack-true-count-stats`      | StatsStore                                    |
| Deviations      | `blackjack-deviation-stats`       | StatsStore                                    |
| Deck estimation | `blackjack-deck-estimation-stats` | StatsStore (±0.5-deck hit = "correct")        |
| Showdown        | `blackjack-showdown-stats`        | `{ hands, wins, losses, pushes, blackjacks }` |

The stats panel on the card counting page reflects the currently selected
mode, and each **Reset** button only resets that store — the other keys are
untouched. Switching modes mid-drill is blocked (the selector is disabled
while a drill or showdown is in flight). Live-shoe true count shows two panels
(True count + Deck estimation); the showdown has its own tally.

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

### Future (not yet implemented)

Deferred follow-ons, documented in `docs/roadmap-progress.md` and
`docs/manual-testing-guide.md`:

- **True multi-hand showdowns** (Option B) and **bankroll / betting / splits /
  doubles / surrender** (Option C) — the current showdown is single-hand,
  hit/stand, no money.
- **KO true count** — IRC / key-count math so unbalanced systems get a true
  count (KO is running-count only today).
- **Deviation charts for KO / Omega II / Wong Halves** — deviations are Hi-Lo
  only.
- **End-to-end tests** — a Playwright smoke layer (plan in
  [`docs/e2e-testing-plan.md`](docs/e2e-testing-plan.md)), plus an enforced
  coverage threshold and a value-by-value chart check against the BJA PDFs.
- **Real PWA install** — service worker + maskable icons (and a light theme);
  see [`docs/mobile-mirror.md`](docs/mobile-mirror.md).
