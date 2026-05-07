# Blackjack Trainer

A frontend-only Angular app for practicing two blackjack skills:

1. **Basic Strategy Trainer** — initial two-card hands against H17/S17 charts
   from [Blackjack Apprenticeship](https://www.blackjackapprenticeship.com/).
2. **Hi-Lo Card Counting Trainer** — running-count drills on random card
   streams of configurable length and speed.

Both trainers persist independent session stats to `localStorage` and reuse
the same card model + cardsJS images.

## Quick start

Requires Node 20+ and npm. From the repo root:

```bash
npm install
npm start        # dev server at http://127.0.0.1:4200/
npm test         # vitest, single run in CI / watch in TTY
npm run build    # production bundle in dist/blackjack-trainer/
```

Navigate to `/basic-strategy` or `/card-counting` (top nav links).

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

### Hi-Lo Card Counting Trainer (v2)

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
│   │   └── card-counting.model.ts              Drill settings + result types
│   └── services/
│       ├── basic-strategy-engine.service.ts    pure-TS strategy logic
│       ├── basic-strategy-engine.service.spec.ts  40 engine tests
│       ├── counting-engine.service.ts          pure-TS Hi-Lo engine
│       ├── counting-engine.service.spec.ts     30 engine tests
│       ├── card-generator.service.ts           random card + sequence generator
│       ├── stats-store.ts                      parameterized stats container
│       ├── stats-store.spec.ts                 10 stats tests
│       ├── basic-strategy-stats.service.ts     Basic strategy StatsStore subclass
│       └── card-counting-stats.service.ts      Card counting StatsStore subclass
├── data/
│   ├── h17-basic-strategy.ts                   BJA H17 chart (PDF linked)
│   ├── s17-basic-strategy.ts                   BJA S17 chart (PDF linked)
│   └── counting-systems.ts                     HI_LO + system registry
├── features/
│   ├── basic-strategy/
│   │   ├── basic-strategy-page.component.ts    thin orchestrator
│   │   ├── rule-selector.component.ts          H17/S17 + DAS + LS toggles
│   │   ├── blackjack-table.component.ts        dealer / player layout
│   │   ├── action-buttons.component.ts         6 action buttons
│   │   └── feedback-panel.component.ts         result + rationale
│   └── card-counting/
│       ├── card-counting-page.component.ts     state machine orchestrator
│       ├── counting-settings.component.ts      cards / ms inputs + errors
│       ├── card-stream.component.ts            current card + progress
│       ├── count-answer-form.component.ts      integer input + submit
│       └── count-feedback-panel.component.ts   verdict + breakdown
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
- `evaluate(cards, userCount, system)` — wraps `runningCount` and returns
  a `CountingDrillResult` carrying the cards, both counts, and `isCorrect`.
- `validateSettings(settings)` — returns `{ valid, errors }` where `errors`
  is the full list (number-of-cards must be a positive integer; time
  between cards must be a finite number ≥ 100ms).
- `isValidIntegerAnswer(raw)` — drives the answer form's Submit button.

Hi-Lo values are defined in `data/counting-systems.ts` with a comment
linking to the Blackjack Apprenticeship reference.

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

Each trainer persists its own stats under a dedicated `localStorage` key
via a `StatsStore` base class:

| Trainer | Key |
|---|---|
| Basic Strategy | `blackjack-basic-strategy-stats` |
| Card Counting | `blackjack-card-counting-stats` |

Note: v2 dropped the v1 key (`blackjack-trainer:stats:v1`). If you were
running v1 locally, your previous basic-strategy stats are orphaned in
storage — they're not loaded by v2.

## Card asset attribution

The 52 card SVGs and `BLUE_BACK.svg` under `public/cards/` come from
[richardschneider/cardsJS](https://github.com/richardschneider/cardsJS),
which packages Chris Aguilar's
[Vector Playing Card Library](https://code.google.com/archive/p/vectorized-playing-cards/)
1.3. The library is licensed under **LGPL** (see
`public/cards/COPYING.txt`, `COPYING.LESSER.txt`, `AUTHORS.txt`). The
LGPL files are committed alongside the SVGs to preserve attribution.

## Roadmap (not yet implemented)

The codebase is organized to make these additions straightforward later:

- **True count** — deck-estimation + true-count drills (running count is
  in v2).
- **Counting deviations** — Illustrious 18, Fab 4, etc.
- **Additional counting systems** — KO, Omega II, Wong Halves (data-only
  addition; the engine already accepts arbitrary `CountingSystem` values).
- **Multi-hand / shoe simulation** — playing through a real deck, not
  independently-drawn scenarios.
- **Accounts, online leaderboards, server-side persistence.**
