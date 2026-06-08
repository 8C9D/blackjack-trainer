# End-to-End (E2E) Testing Plan

_Authored 2026-06-02. **Planning slice only** — no E2E tooling, config, CI
changes, or dependencies are added by this document. It grounds a future E2E
pass in the app as it actually exists today (Angular 21, routes
`/basic-strategy` · `/card-counting` · `/deviations`, `localStorage`-only
persistence, 27 spec files / 481 unit + component tests passing). Selectors and
flows below were read off the current source, not assumed._

## 1. Why E2E is still worth adding

The suite already covers the pure decision logic and the component boundaries
well (see [`docs/test-coverage-improvement.md`](test-coverage-improvement.md)):
every decision-critical service and every `*.component.ts` has a co-located
Vitest/jsdom spec. So why add a browser layer at all?

Because the existing tests deliberately stop at seams the user never sees:

- **Wiring between units is mocked or bypassed.** Component specs mount one
  component in `TestBed` with stub inputs; they never exercise the real
  `loadComponent` lazy route → page orchestrator → child component →
  `localStorage` chain in a real browser. A broken lazy import, a router
  misconfiguration, or a provider that only fails under the real bootstrap
  (`app.config.ts`) would pass every current spec.
- **jsdom is not a browser.** Layout, the `@media (max-width: 600px)` nav swap
  (`src/app/app.scss`), real focus management (`afterNextRender` autofocus in
  `count-answer-form.component.ts`), `setTimeout`-driven card streaming, and
  real `localStorage` semantics across reloads are only approximated under
  jsdom. The responsive top-nav/bottom-nav swap in particular has **no**
  meaningful unit coverage because jsdom does not apply CSS media queries.
- **Cross-route persistence is an integration property.** "Navigating away
  resets in-memory drill state but persisted stats survive" (README, _Shared →
  Routing + top nav_) is a claim about the router + four `StatsStore` keys +
  `localStorage` working together. No single unit owns it.
- **Route/title/redirect behavior** (`/` → `/basic-strategy`, wildcard →
  `/basic-strategy`, per-route `title`) lives in `app.routes.ts` and is
  currently unspecced (listed as an open low-value gap in the coverage report).

E2E is the cheapest way to get a regression alarm on those whole-flow
properties. It is **not** a replacement for the unit layer and should stay
small — see §6 (boundaries) and §9 (risks).

## 2. Recommended framework: Playwright

**Recommendation: [Playwright](https://playwright.dev/) (`@playwright/test`).**

| Factor | Why Playwright fits this repo |
|---|---|
| Runtime fit | Pure Node, no JVM/Selenium grid; runs on the pinned Node 22 (`.nvmrc`, CI `setup-node@v5`). |
| Isolation from Vitest | Ships its own runner (`playwright test`). It does **not** reuse Vitest, so the two layers stay independent — important because the unit layer is `@angular/build:unit-test` + Vitest, not Karma. |
| Auto-waiting | Web-first assertions (`expect(locator).toBeVisible()`) auto-retry, which suits this app's async card stream and signal-driven re-renders without hand-rolled sleeps. |
| Viewport/emulation | First-class device/viewport control — directly needed for the phone-width bottom-nav scenario (§7). |
| Tracing | Built-in trace viewer + screenshots/video on failure, ideal for debugging CI-only flakes. |
| Maintenance | Single dependency pulls the runner, assertions, and browsers; no extra assertion/driver libraries to keep in sync. |

**Why not the alternatives.** Cypress is viable but adds a heavier
dependency/runner and is weaker at multi-tab/true-headless CI ergonomics;
WebdriverIO/Selenium is more setup than a single-app frontend warrants. Angular
no longer ships an official Protractor/`ng e2e` story. Nothing in this repo
(no existing Cypress config, no Selenium, Vitest already chosen for units)
pulls away from Playwright, so Playwright is the default and the rest of this
plan assumes it.

> Not installed here. Install happens in Phase 0 (§8), not in this doc.

## 3. Recommended folder layout

E2E specs **must live outside `src/`.** The Vitest target discovers specs via
`tsconfig.spec.json` → `"include": ["src/**/*.spec.ts"]`, and `npm run
typecheck` compiles `tsconfig.app.json` → `src/**/*.ts`. Anything under `src/`
named `*.spec.ts` would be swept into the unit run; anything else under `src/`
would be typechecked by the app config. Keeping E2E in a top-level `e2e/`
directory with a distinct `*.e2e.ts` suffix keeps it invisible to both — belt
and suspenders.

```
e2e/                                   # top-level, NOT under src/
├── fixtures/
│   ├── app.fixture.ts                 # base test: fresh context, storage reset
│   └── viewports.ts                   # DESKTOP (e.g. 1024×768), PHONE (e.g. 390×844)
├── smoke/
│   ├── navigation.e2e.ts              # redirect + desktop nav + titles
│   ├── mobile-nav.e2e.ts              # phone-width bottom nav
│   ├── basic-strategy.e2e.ts          # answer → feedback → stats
│   ├── card-counting.e2e.ts           # running-count + true-count drills
│   ├── deviations.e2e.ts              # manual TC scenario → feedback
│   └── persistence.e2e.ts             # reset + reload-preserves-stats
└── README.md                          # how to run locally

playwright.config.ts                   # repo root (added in Phase 0)
tsconfig.e2e.json                      # E2E-only TS config (added in Phase 0)
```

Rationale for the split: `fixtures/` holds the one shared setup every spec
needs (a clean storage state + named viewports); `smoke/` is the v1 surface and
maps one file per trainer/area so a failure points straight at the feature.
`playwright.config.ts` and `tsconfig.e2e.json` sit at the root (Playwright's
default config location) and are added with the tooling, not now.

## 4. Recommended npm scripts

To add **in Phase 0**, alongside the existing `start` / `build` / `test` /
`typecheck` scripts (not added by this doc):

```jsonc
{
  "scripts": {
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui",          // local interactive runner
    "e2e:report": "playwright show-report",     // open last HTML report
    "e2e:install": "playwright install --with-deps chromium"
  }
}
```

`playwright.config.ts` should own the dev-server lifecycle via its `webServer`
block so `npm run e2e` is one command:

```ts
// sketch only — added in Phase 0
webServer: {
  command: 'npm start',                 // ng serve → http://127.0.0.1:4200/
  url: 'http://127.0.0.1:4200',
  reuseExistingServer: !process.env.CI, // reuse a hand-started dev server locally
  timeout: 120_000,
},
use: { baseURL: 'http://127.0.0.1:4200' },
```

The `start` script already serves at `http://127.0.0.1:4200/` (README, _Quick
start_). For faster, production-fidelity CI runs, a later refinement can build
once (`npm run build`, output `dist/blackjack-trainer/`) and serve the static
bundle instead of running `ng serve` — noted as a Phase 2+ option, not v1.

## 5. Recommended CI integration

Today CI is a single `validate` job: `npm ci` → `npm run typecheck` →
`CI=true npm test` → `npm run build`, on Node 22 (`.github/workflows/ci.yml`).

**Recommendation: add a separate `e2e` job rather than appending steps to
`validate`.** Reasons:

- Keeps the fast signal (typecheck/unit/build, ~seconds) independent from the
  slower browser run, so a unit failure isn't hidden behind a browser download.
- Lets E2E start from the already-produced build artifact later (serve `dist/`)
  without entangling the two jobs' caches.
- Makes it trivial to mark E2E `continue-on-error` during the Phase 1
  stabilization window, then flip it to required once it's proven non-flaky.

Sketch of the added job (added in Phase 0/1, **not** by this doc):

```yaml
e2e:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v5
    - uses: actions/setup-node@v5
      with: { node-version: 22, cache: npm }
    - run: npm ci
    - run: npx playwright install --with-deps chromium   # cache this dir
    - run: npm run e2e                                    # webServer boots ng serve
    - uses: actions/upload-artifact@v4
      if: ${{ !cancelled() }}
      with: { name: playwright-report, path: playwright-report/ }
```

CI specifics to honor:

- **Chromium-only in v1.** One browser is enough to catch wiring/routing/
  responsive regressions; add Firefox/WebKit only if a real cross-browser bug
  motivates it.
- **Cache the Playwright browser download** (`~/.cache/ms-playwright`) keyed on
  the Playwright version to keep the job fast.
- **Upload the HTML report + traces on failure** for debuggability; enable
  `trace: 'on-first-retry'` in config.
- **Retries:** `retries: process.env.CI ? 1 : 0` to absorb rare timing flakes
  without masking real regressions.

## 6. What E2E should — and should not — cover

### In scope (whole-flow, browser-only properties)

- Route redirects, lazy-route loading, and per-route `<title>`.
- The responsive nav swap (desktop top nav vs. phone bottom nav) — CSS media
  query behavior jsdom can't see.
- One representative happy-path per trainer: input → feedback renders → stats
  panel updates.
- Persistence integration: per-trainer reset, and stats surviving a full page
  reload (`localStorage` rehydration).
- Cross-route state behavior: navigating away resets in-memory drill state while
  persisted stats survive.

### Out of scope (covered better elsewhere, or brittle)

- **Exhaustive chart correctness.** Every H17/S17 basic-strategy and deviation
  cell is the engines' job — `basic-strategy-engine`, `deviation-engine`, and
  the structural chart guards already do this. E2E must **not** re-assert chart
  values.
- **Duplicating pure-engine tests.** Running-count math, `Math.trunc` true-count
  truncation, deviation resolution order, insurance threshold — all already have
  thorough unit specs. E2E checks that the UI _shows a verdict_, not that the
  verdict math is right.
- **Pixel-perfect / visual-regression snapshots in v1.** Too brittle against
  card art and layout tweaks; revisit only if a specific visual contract needs
  guarding.
- **Implementation details.** No assertions on signal internals, private
  methods, component class shape, or exact DOM structure beyond stable anchors.
- **Uncontrolled randomness.** See §7.1 — never assert a value that depends on
  an unseeded `Math.random()` draw.

## 7. Initial smoke-test scenarios (v1)

### 7.1 Determinism strategy (read this first)

The trainers draw hands and card streams from `Math.random` via
`CardGeneratorService`. That service exposes `setRandomSource()` **for unit
tests only** — it is an in-process seam and is **not** reachable from a
browser-driven test. So v1 E2E must get determinism from properties that do
**not** depend on the random draw:

- **Flow + counter anchors.** "After answering once, a feedback verdict is
  visible and `Attempts` went `0 → 1`" is true for _any_ random hand. Assert the
  flow and the attempts counter, not which action was correct.
- **Manual true count (Deviations).** The deviations page exposes a **Manual**
  true-count source (`deviation-settings.component.ts`,
  `[-20, +20]`). Selecting Manual and typing a value makes the displayed
  "Practice true count" and the feedback "True count" row deterministic — a real
  user-facing anchor to assert against, independent of the random hand.
- **Small, slow-free streams (Card Counting).** Set a small card count and the
  minimum 100 ms interval so the stream finishes fast; then submit _any_ valid
  integer and read the engine's "Correct count" back out of the feedback panel
  rather than precomputing it.
- **Reading, not predicting.** Where a value must be checked, read it from the
  DOM the app already rendered (e.g. the feedback "True count" row) instead of
  recomputing it in the test.

A **future** enhancement (Phase 3, §8) could add a tiny, dev-only seeded-RNG
hook (e.g. honoring a `?seed=` query param wired to `setRandomSource()`) to make
exact correct/incorrect outcomes assertable end-to-end. That is a **production
code change** and is explicitly out of scope for this planning slice and for
v1.

### 7.2 Stable selectors available today

Read off the current templates — prefer these role/text/aria anchors over CSS
classes:

| Anchor | Source |
|---|---|
| Page titles `Basic Strategy Trainer` / `Card Counting Trainer` / `Deviations Trainer` | `app.routes.ts` `title` |
| `nav[aria-label="Primary"]` (top) and `nav[aria-label="Primary mobile"]` (bottom) | `app.ts` |
| Nav link/tab text — desktop `Basic Strategy`/`Card Counting`/`Deviations`, phone `Strategy`/`Count`/`Deviations` | `app.ts` |
| `section[aria-label="Player actions"]` with `Hit/Stand/Double/Split/Surrender/Insurance` buttons | `action-buttons.component.ts` |
| `section[aria-label="Session statistics"]` — `Attempts` / `Correct` / `Accuracy` / `Streak` / `Longest streak`, `Reset stats` button | `stats-panel.component.ts` |
| Feedback verdict `Correct.` / `Incorrect.` (strategy + deviations); `Correct!` / `Incorrect` (counting); `Deal next hand` / `Run again` button | `feedback-shell` / `count-feedback-panel` |
| `section[aria-label="Practice true count"]` value | `deviations-page.component.ts` |
| `Start drill` button, `What is the running/true count?` label + number input, `Submit` | counting page / `count-answer-form` |
| `section[aria-label="Card stream"]` + `Card N of M` progress | `card-stream.component.ts` |

> v1 should rely on these existing anchors. If any scenario proves too fragile,
> the _only_ production change worth making is adding explicit `data-testid`
> hooks — deferred to Phase 3, not done here.

### 7.3 Scenarios

1. **App loads & redirects.** Visit `/` → URL settles on `/basic-strategy`,
   title is `Basic Strategy Trainer`, `h1` visible. Visit an unknown path →
   wildcard redirects to `/basic-strategy`.
2. **Desktop nav across all routes.** At desktop viewport (e.g. 1024×768), the
   top nav is visible and the bottom nav hidden; clicking each link navigates to
   `/basic-strategy`, `/card-counting`, `/deviations`, updates the title, and
   marks the active link.
3. **Mobile bottom nav (phone width).** At ≤600px (e.g. 390×844), the top nav is
   hidden and the fixed bottom tab bar (`Strategy` / `Count` / `Deviations`) is
   visible; tapping each tab navigates and marks the active tab.
4. **Basic Strategy — answer → feedback → stats.** From a fresh load, click one
   action (e.g. `Stand`). Assert: a feedback verdict (`Correct.`/`Incorrect.`)
   appears, the `Deal next hand` button is shown, and `Attempts` is `1`. Then
   `Deal next hand` clears the feedback and re-enables the action buttons.
   (Correctness-independent — see §7.1.)
5. **Card Counting — running count.** Set a small card count + 100 ms interval,
   `Start drill`, wait for the stream to finish (auto-wait for the answer form),
   type any valid integer, `Submit`. Assert a verdict renders, the
   card-by-card breakdown can be expanded, and `Attempts` is `1`.
6. **Card Counting — true count mode.** Switch the mode selector to true count
   (decks-remaining preset appears), run one drill as in #5, submit an integer.
   Assert the true-count feedback (running count ÷ decks formula + verdict)
   renders and the **true-count** stats — a separate `localStorage` key —
   increment.
7. **Deviations — manual true-count scenario.** Choose **Manual** true count,
   type a value (e.g. `+3`), confirm the "Practice true count" display matches,
   answer one action, and assert the feedback "True count" row equals the entered
   value and `Attempts` is `1`. (Manual TC is the deterministic anchor.)
8. **Stats reset (one trainer).** On Basic Strategy, record one attempt
   (`Attempts = 1`, `Reset stats` enabled), click `Reset stats`, assert
   `Attempts = 0` and the button is disabled again.
9. **Reload preserves stats.** Record an attempt on a trainer, reload the page,
   and assert the stats panel still shows the recorded attempt (rehydrated from
   `localStorage`). Complement: navigating away and back resets the in-progress
   hand/feedback **but** the stats survive.

Each spec starts from a **clean storage state** (fresh Playwright context, or an
explicit `localStorage.clear()` in setup) so the `0 → 1` attempt anchors are
reliable.

## 8. Phased implementation plan

- **Phase 0 — Tooling (one PR, no app-code change).** Add `@playwright/test`,
  `playwright.config.ts` (with `webServer` → `npm start`), `tsconfig.e2e.json`,
  the `e2e/` skeleton + fixtures, and the npm scripts (§4). Land **one** trivial
  green spec (scenario #1) to prove the harness end-to-end locally.
- **Phase 1 — Smoke suite + CI.** Implement scenarios #1–#9. Add the separate
  `e2e` CI job (§5), initially `continue-on-error: true`. Stabilize until the
  suite is reliably green, then make it required.
- **Phase 2 — Hardening & speed.** Switch CI to build-once + serve `dist/`
  static bundle for production fidelity and speed; add traces-on-retry,
  report artifact upload, and browser caching. Consider a couple of
  cross-route state-reset assertions.
- **Phase 3 — Determinism & depth (optional, needs a product decision).** If
  exact correct/incorrect outcomes need asserting, add a dev-only seeded-RNG
  hook (e.g. `?seed=` → `setRandomSource()`) and/or `data-testid` anchors. These
  are production changes; weigh them against keeping E2E thin. Cross-browser
  (Firefox/WebKit) only if a real bug motivates it.

Keep each phase one focused PR, validated against a green baseline, matching how
the unit-coverage work was landed.

## 9. Risks & maintenance cautions

- **Flakiness from timing.** The card stream is `setTimeout`-driven. Rely on
  Playwright's auto-waiting (`expect(...).toBeVisible()`) and small card counts;
  **never** use fixed `waitForTimeout` sleeps as synchronization. If timing
  proves fragile, prefer Playwright's clock-control API over sleeps.
- **Randomness leakage.** Any assertion that depends on an unseeded draw will
  flake. Enforce the §7.1 discipline in review: assert flow + counters + manually
  controlled values only, until/unless a seed hook exists.
- **Selector brittleness.** Favor role/text/aria anchors (§7.2) over generated
  CSS classes. Treat a churning selector as a signal to add a `data-testid`
  (Phase 3), not to pin a fragile class.
- **Scope creep into engine territory.** Resist re-testing chart/engine values
  through the UI (§6). Every such assertion duplicates a faster unit test and
  doubles maintenance. Keep the suite at "wiring + flow."
- **Runtime/CI cost.** Browser downloads and real navigation are slower than the
  unit run. Keep v1 Chromium-only, cache browsers, and keep the suite small so it
  stays a fast gate.
- **Storage bleed between specs.** The four per-trainer `localStorage` keys
  persist within a context. Always start specs from a clean storage state to
  keep the `Attempts 0 → 1` anchors deterministic.
- **Don't let E2E substitute for units.** It is a thin top-of-pyramid alarm. The
  unit/component layer stays the primary safety net; E2E catches only what that
  layer structurally cannot.

## 10. Summary

Add **Playwright** as a small, Chromium-only smoke layer in a top-level `e2e/`
directory (kept out of Vitest's and `typecheck`'s `src/` globs), driven by an
`npm run e2e` script whose `webServer` boots the existing dev server, and gated
by a **separate** CI job. Target nine whole-flow scenarios — redirect/routing,
the responsive nav swap, one happy-path per trainer, stats reset, and
reload-persistence — using flow/counter/manual-value anchors for determinism and
explicitly **not** re-testing chart or engine correctness. Land it in phases,
tooling first, with a clean green spec before expanding. This stays a planning
slice until Phase 0 begins.
