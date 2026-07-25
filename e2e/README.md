# End-to-End tests

Playwright smoke tests for whole-flow, browser-only properties the Vitest/jsdom
unit layer can't reach: real lazy-route bootstrap and redirects, per-route
titles, the responsive `.kcap` media-query behavior, and `localStorage`
rehydration across a full page reload.

These are a thin **regression alarm on wiring**, not a second copy of the engine
tests. They deliberately never re-assert chart values, count math, or exact
correct/incorrect outcomes (those depend on an unseeded `Math.random()` draw) —
only the flow and the values the app itself renders.

## Run

```bash
npm run e2e:install   # one-time: download the Chromium browser
npm run e2e           # boots `ng serve` via the config's webServer, runs specs
npm run e2e:ui        # interactive runner
npm run e2e:report    # open the last HTML report
```

The config's `webServer` starts `npm start` (http://127.0.0.1:4200) and reuses a
dev server you already have running locally. In CI (`CI` set) it instead serves
the production bundle with `tools/serve-dist.mjs`, so run `npm run build` first
in that mode.

## Layout

```
e2e/
├── fixtures/
│   ├── app.fixture.ts   # base test: lands each spec on a clean home
│   └── viewports.ts     # DESKTOP (1024×768), PHONE (390×844)
└── smoke/
    ├── navigation.e2e.ts     # routes, titles, redirects, keyboard nav
    ├── responsive.e2e.ts     # .kcap visible desktop / hidden < 600px
    ├── basic-strategy.e2e.ts # answer → session counter advances
    ├── card-counting.e2e.ts  # Settings-configured stream → (estimate) → answer → feedback
    ├── deviations.e2e.ts     # TC in the question line, manual TC from Settings, rep counting
    └── persistence.e2e.ts    # handsToday + last trainer survive a reload
```

Specs live outside `src/` with a `*.e2e.ts` suffix so they stay invisible to the
Vitest unit run (`src/**/*.spec.ts`) and the app typecheck (`src/**/*.ts`).
