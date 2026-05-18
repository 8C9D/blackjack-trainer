# Blackjack Basic Strategy Trainer

A frontend-only Angular app for practicing blackjack basic strategy on initial
two-card hands, sourced from the
[Blackjack Apprenticeship](https://www.blackjackapprenticeship.com/) H17 and
S17 strategy charts.

The trainer deals a random scenario (two player cards + a dealer upcard),
asks the player to pick an action, then checks the answer against the chart
and explains why. Session stats (attempts, accuracy, streak) persist via
`localStorage`.

## Quick start

Requires Node 20+ and npm. From the repo root:

```bash
npm install
npm start        # dev server at http://127.0.0.1:4200/
npm test         # vitest, single run in CI / watch in TTY
npm run build    # production bundle in dist/blackjack-trainer/
```

## Features (v1)

- **H17 and S17 rule sets** — toggle which dealer rule to practice against.
- **Toggleable Double After Split (DAS) and Late Surrender** — exercises the
  parts of the chart that vary with table rules.
- **Insurance is always wrong** — clicking the Insurance button is flagged
  with an explanation that basic strategy never takes the side bet.
- **Per-attempt feedback** with the canonical hand label (e.g. `Soft 18
  (A, 7)`, `Hard 16`, `Pair of 8s`), the correct action, and a one-line
  rationale.
- **Persistent session stats** — attempts, correct count, accuracy, current
  streak, longest streak, with a reset button.
- **Keyboard shortcuts** — `H` / `S` / `D` / `P` / `R` (surrender) /
  `I` (insurance) for actions, `Enter` to deal the next hand.
- **Real card images** — 52 SVGs + face-down back from
  [richardschneider/cardsJS](https://github.com/richardschneider/cardsJS).

## Tech stack

- **Angular 21** (standalone components, signal-based inputs/outputs)
- **TypeScript 5.9**, strict mode
- **SCSS** for styles
- **Vitest 4** with `jsdom` for unit tests
- **No backend** — `localStorage` is the only persistence layer

## Project structure

```
src/app/
├── app.ts, app.config.ts, app.spec.ts        bootstrap shell
├── core/
│   ├── models/
│   │   ├── card.model.ts                     Rank, Suit, Card, helpers
│   │   └── strategy.model.ts                 Action, RuleSet, chart cell types
│   └── services/
│       ├── basic-strategy-engine.service.ts  pure-TS strategy logic
│       ├── basic-strategy-engine.service.spec.ts  40 engine tests
│       ├── card-generator.service.ts         random hand generator
│       ├── stats.service.ts                  localStorage-backed stats
│       └── stats.service.spec.ts             6 stats tests
├── data/
│   ├── h17-basic-strategy.ts                 BJA H17 chart (PDF linked)
│   └── s17-basic-strategy.ts                 BJA S17 chart (PDF linked)
├── features/basic-strategy/
│   ├── basic-strategy-page.component.ts      thin orchestrator
│   ├── rule-selector.component.ts            H17/S17 + DAS + LS toggles
│   ├── blackjack-table.component.ts          dealer / player layout
│   ├── action-buttons.component.ts           6 action buttons
│   └── feedback-panel.component.ts           result + rationale
└── shared/
    ├── card-image.component.ts               face-up/face-down card
    └── stats-panel.component.ts              stats + reset

public/cards/                                 52 SVGs + BLUE_BACK + LGPL notices
```

## Strategy engine

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

## Chart encoding & assumptions

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

## Card asset attribution

The 52 card SVGs and `BLUE_BACK.svg` under `public/cards/` come from
[richardschneider/cardsJS](https://github.com/richardschneider/cardsJS),
which packages Chris Aguilar's
[Vector Playing Card Library](https://code.google.com/archive/p/vectorized-playing-cards/)
1.3. The library is licensed under **LGPL** (see
`public/cards/COPYING.txt`, `COPYING.LESSER.txt`, `AUTHORS.txt`). The
LGPL files are committed alongside the SVGs to preserve attribution.

## Roadmap (not in v1)

The codebase is organized to make these additions straightforward later:

- Card counting (running / true count, deviations)
- Multi-hand / multi-deal simulation against a real shoe
- Showdowns and multiplayer
- Accounts, online leaderboards, server-side persistence
- Mobile-first layout (current MVP is desktop-focused)
