# iOS App — Native SwiftUI Mirror Roadmap

A sequenced, vertical-slice plan to ship a **native iOS app** to the **App
Store** that mirrors the existing Angular Blackjack Trainer — all four trainers
(Basic Strategy, Running Count, True Count, Deviations), the live shoe, and the
post-count showdown — rebuilt in **SwiftUI**, plus a set of **native extras**
(iCloud stats sync, a home-screen widget, and local-notification practice
reminders).

This roadmap follows the same slice schema as
[`roadmap.md`](roadmap.md): each slice is a single shippable increment that
leaves the iOS project green (build + tests) and is worth one commit.

## Chosen approach (and what it implies)

Two product decisions were made up front:

1. **Build approach: native SwiftUI rewrite.** Not a Capacitor/WKWebView
   wrapper. The UI is rebuilt in SwiftUI and the pure decision/counting/
   deviation/shoe/showdown engines are **re-implemented in Swift**.
2. **Scope: mirror + native extras.** Beyond a faithful mirror (icon, launch
   screen, offline play, safe-area, haptics) the first release adds **iCloud
   stats sync**, a **home-screen widget**, and **local-notification reminders**.

The defining consequence of a rewrite is that the chart logic now has **two
implementations** (TypeScript and Swift) that must stay in lockstep. The web
app's own docs warn that the charts are hand-transcribed and that "a
transcription typo that is still structurally legal would pass." We must not
re-introduce that risk by hand-porting the engines into Swift.

> **The mirror is enforced by parity fixtures, not by careful re-typing.** The
> TypeScript engines (390+ tests, "more test code than app code") are the
> **source of truth**. We export their chart data and exhaustive
> input→output **golden vectors** as JSON, bundle that JSON into the iOS app and
> its test target, and assert the Swift engines reproduce every row exactly.
> Chart data ships as the **same exported bytes** rather than re-typed Swift
> literals. This makes "mirror" a structural, CI-checked property. See
> [Parity strategy](#parity-strategy-the-backbone).

## Goal & success criteria

**Goal:** A blackjack _strategy trainer_ (no real-money wagering) live on the
App Store, behaviorally identical to the web app's trainers, that works fully
offline and feels native.

Done when:

- [ ] All four trainers + live shoe + showdown behave identically to the web
      app, proven by the Swift engines passing the exported parity vectors.
- [ ] Per-trainer session stats persist on-device and **sync via iCloud**
      across a user's devices.
- [ ] A home-screen **widget** surfaces at least one stat (e.g. accuracy /
      current streak); **local-notification reminders** are schedulable.
- [ ] The app passes App Review and is downloadable on the App Store.
- [ ] Card-art **LGPL attribution** ships in-app (acknowledgements screen).

## Status legend

Same as [`roadmap.md`](roadmap.md): **Planned** · **In progress** · **Done** ·
**Skipped** · **Needs review** (paused for a human decision recorded in the
slice's _Decision_ field).

Slices started as **Planned**; live per-slice status is tracked below and the
authoritative cursor/execution log lives in
[`ios-app-roadmap-progress.md`](ios-app-roadmap-progress.md).

## Validation baseline (applies to every slice)

The Swift analogue of the web app's `typecheck → test → build` gate. Unless a
slice says otherwise, "validated" means:

```bash
# In the iOS project:
xcodebuild -scheme BlackjackTrainer -destination 'platform=iOS Simulator,name=iPhone 16' build
xcodebuild -scheme BlackjackTrainer -destination 'platform=iOS Simulator,name=iPhone 16' test
swiftformat --lint .      # formatting gate (mirrors prettier --check)
swiftlint                 # lint gate
```

Plus, for any slice that touches an engine: **the parity-vector tests pass**
(Phase 1 onward). A GitHub Actions macOS runner enforces this, mirroring the
web repo's existing `.github/workflows/ci.yml` culture.

---

## Prerequisites (Phase 0 gate — not code)

These block submission and have lead times, so start them on day one:

- **Apple Developer Program** membership ($99/yr) — enrollment can take 24–48h
  (longer for organizations / D-U-N-S). Required for signing, TestFlight, and
  App Store Connect.
- **A Mac with Xcode** (current stable) and a real device for on-hardware QA.
- **App Store Connect** app record + bundle ID + signing certificates.
- **Decision:** whether the iOS project lives in **this repo** (`ios/`
  directory — recommended, keeps the parity-fixture codegen wired to the
  TypeScript source of truth in CI) or a **separate repository** (cleaner
  history, but the fixture export must be published/vendored across repos). See
  Slice 0.1.

---

## Cross-cutting decisions (resolve before/at Phase 0)

| #   | Decision                              | Recommended default                                         | Why                                                                                                                                       |
| --- | ------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Repo layout                           | **Monorepo `ios/`** alongside `src/`                        | Parity fixtures regenerate from the TS engines in one CI run; no cross-repo vendoring.                                                    |
| D2  | Chart/counting data delivery to Swift | **Bundle exported JSON** as app resources, decode at launch | Same bytes as the source of truth → zero transcription drift. (Alt: codegen Swift literals.)                                              |
| D3  | Minimum iOS version                   | **iOS 17**                                                  | Modern SwiftUI (Observation), WidgetKit, broad device coverage in 2026.                                                                   |
| D4  | Local persistence                     | **Codable structs → `UserDefaults`**                        | Tiny key/value stats; maps 1:1 to the web's `localStorage` keys/shape; pairs naturally with iCloud KVS. (Alt: SwiftData — overkill here.) |
| D5  | iCloud sync transport                 | **`NSUbiquitousKeyValueStore`** (iCloud KVS)                | The stats are a handful of small blobs; KVS mirrors `localStorage` semantics with near-zero code. (Alt: CloudKit — only if data grows.)   |
| D6  | Test framework                        | **Swift Testing** (fallback XCTest)                         | Modern, expressive; either can load the JSON fixtures as bundle resources.                                                                |
| D7  | App Store positioning                 | **"Educational strategy trainer," no wagering**             | Drives the age-rating questionnaire answers and review framing (see [App Store specifics](#app-store-specifics--review-risk)).            |

These are surfaced as `Decision:` fields on the relevant slices so the plan
stays consumable the same way `roadmap.md` is.

---

## Parity strategy (the backbone)

This is the single most important idea in the roadmap; every engine slice
depends on it.

**Exporter (lives in the web repo).** A small script —
`tools/export-parity-fixtures.ts`, run with `tsx`/Node — imports the existing
engines and chart data and emits JSON into `ios/Fixtures/` (or a published
artifact):

- `charts.json` — the four charts (`h17/s17-basic-strategy`,
  `h17/s17-deviations`) normalized to a stable shape.
- `counting-systems.json` — all **58** systems with per-rank **and per-color**
  values, `balanced`, and `level`.
- `basic-strategy-vectors.json` — **exhaustive**: every (player hand class ×
  dealer upcard × rule set × DAS × LS) → `{ action, source, label, rationale }`.
  The input space is fully enumerable (hard 5–20, soft 13–21, all pairs, 10
  upcards, 2 rule sets, DAS on/off, LS on/off).
- `deviation-vectors.json` — every (hand × upcard × true count over `[-10,+12]`
  × rule set × DAS × LS) → expected action, including the **insurance overlay**
  (Ace upcard, TC ≥ +3) and the **surrender-precedence** ordering.
- `counting-vectors.json` — representative card sequences per system →
  `{ runningCount, trueCount }` for given `decksRemaining` (covering truncation
  toward zero, **fractional** Wong Halves, and **color-dependent** Red Seven /
  KISS), plus `scoreDeckEstimate` ±0.5 boundary cases.
- `showdown-vectors.json` — enumerated dealer-play + settlement cases (3:2
  naturals, dealer/player naturals, bust ordering, H17/S17 dealer rule).

**Consumer (the Swift test target).** Loads each JSON as a bundled resource and
asserts the Swift engine reproduces every row exactly. Porting an engine is
therefore not "read TS, re-type Swift, hope" — it is "make the fixtures pass."

**Notes & boundaries:**

- **RNG is a seam, not domain logic.** The web app injects randomness
  (`CardGeneratorService.setRandomSource`). We do **not** try to byte-match a JS
  RNG in Swift. Parity is asserted on the **pure decision functions** (strategy,
  deviation, counting math, dealer play, settlement) over enumerated inputs; the
  shoe's depletion/penetration logic is tested independently in Swift.
- **Truncation toward zero** (`Math.trunc`) is explicit in `counting-vectors`
  (e.g. `-5/2 → -2`) so the Swift port can't silently pick a different rounding.
- **Anti-drift gate.** A CI step regenerates the fixtures and fails if they
  differ from the committed copy, so the TS engines and the Swift app can never
  silently diverge.

---

## Phase 0 — Foundations, parity harness & prerequisites

### Slice 0.1 — Repo layout decision + Apple Developer prerequisites

- **Phase:** 0 — Foundations
- **Status:** Done (automatable parts: D1 decided + documented). Apple
  enrollment / bundle ID / App Store Connect record are tracked as **pending
  human actions** in [`ios-app-roadmap-progress.md`](ios-app-roadmap-progress.md);
  per the roadmap they gate signing/TestFlight/submission, **not** simulator
  development, so the autopilot proceeds.
- **Goal:** Unblock everything: choose where the iOS code lives and start the
  account/tooling clock.
- **Why here:** Account enrollment has real lead time; the repo-layout choice
  determines how fixtures flow to Swift.
- **Scope:** Enroll in the Apple Developer Program; install Xcode + create
  signing assets; reserve a bundle ID and create the App Store Connect record;
  decide repo layout (D1).
- **Out of scope:** Any Swift code.
- **Acceptance criteria:**
  - [ ] Developer Program active; bundle ID + app record created. — **deferred
        to the human (account creation/payment is human-only); see the progress
        log's _Pending human actions_. Unblocks Phase 4 entitlements and Phase 5
        submission; does not block development.**
  - [x] Repo layout decided (**D1 = monorepo `ios/`**, the recommended default)
        and documented in the progress log.
- **Validation:** n/a (process).
- **Commit:** `docs: record iOS repo layout decision and App Store prerequisites`
- **Decision:** **Required — D1 (monorepo vs separate repo).** Default:
  monorepo `ios/`.

### Slice 0.2 — Parity fixture exporter in the web repo

- **Phase:** 0 — Foundations
- **Status:** Done — `tools/export-parity-fixtures.ts` (run via `npm run
export:fixtures`) emits the six fixtures to `ios/Fixtures/`; CI anti-drift gate
  added. D2 resolved to the default (bundled JSON).
- **Goal:** Produce the golden JSON the Swift engines will be graded against.
- **Why here:** The exporter must exist before any engine is ported; it defines
  "correct."
- **Scope:** Add `tools/export-parity-fixtures.ts` importing the live engines +
  chart data; emit the six JSON files described in
  [Parity strategy](#parity-strategy-the-backbone); add an `npm run
export:fixtures` script; add a CI step that regenerates and **diffs** the
  fixtures (anti-drift gate).
- **Files (web repo):** `tools/export-parity-fixtures.ts`, `package.json`,
  `.github/workflows/ci.yml`, generated `ios/Fixtures/*.json`.
- **Out of scope:** Swift consumption (Phase 1).
- **Acceptance criteria:**
  - [x] All six fixtures generate deterministically (verified byte-identical on
        re-run; no timestamps/randomness, fixed iteration order).
  - [x] Basic-strategy (2,720) and deviation (62,560) vectors are exhaustive over
        their input spaces via canonical hand representatives; counting vectors
        cover fractional (Wong Halves), color (Red Seven/KISS), and
        truncation-toward-zero (−5/2 → −2) cases.
  - [x] CI regenerates the fixtures and fails on any diff (anti-drift gate).
- **Validation:** web baseline — `npm run lint` ✓, `CI=true npm test` ✓ (702
  tests), `npm run build` ✓, and `npm run export:fixtures` re-generates with a
  clean `git diff`.
- **Commit:** `feat(tools): export cross-language parity fixtures for the iOS port`
- **Decision:** **Required — D2 (bundled JSON vs codegen Swift literals).**
  Default: bundled JSON.

### Slice 0.3 — Xcode project skeleton + CI

- **Phase:** 0 — Foundations
- **Status:** Done — XcodeGen-generated `ios/BlackjackTrainer.xcodeproj` (committed)
  builds + tests green on the iPhone 16 Pro simulator (iOS 18.5 SDK, iOS 17
  deployment); SwiftFormat + SwiftLint clean; iOS CI workflow added. D3 = iOS 17,
  D6 = Swift Testing. Four tabs: Strategy / Count / Deviations / About.
- **Goal:** A buildable, testable SwiftUI app shell with empty tabs and a green
  CI run.
- **Why here:** Establishes the validation baseline every later slice relies on.
- **Scope:** SwiftUI `App` (min iOS per D3), dark color scheme, a `TabView`
  scaffold with four placeholder tabs matching the web routes
  (Strategy / Count / Deviations — the web's two counting _modes_ live inside
  the Count tab); Swift Testing target; SwiftFormat + SwiftLint configs;
  GitHub Actions macOS workflow running build + test + lint.
- **Files (iOS):** project, `BlackjackTrainerApp.swift`, `RootTabView.swift`,
  `.swiftformat`, `.swiftlint.yml`, CI workflow.
- **Out of scope:** Real screens, engines, assets.
- **Acceptance criteria:**
  - [x] App launches to four empty tabs (Strategy / Count / Deviations / About)
        in the simulator (build succeeds; root view instantiates in tests).
  - [x] `xcodebuild test` + SwiftFormat/SwiftLint run green locally. CI workflow
        added (`.github/workflows/ios-ci.yml`); green-in-CI is provable only when
        it runs on a GitHub macOS runner.
- **Validation:** baseline — `xcodebuild build` ✓, `xcodebuild test` ✓ (Swift
  Testing smoke test), `swiftformat --lint` ✓, `swiftlint` ✓. Destination is
  `iPhone 16 Pro` (no plain "iPhone 16" simulator is installed).
- **Commit:** `chore(ios): scaffold SwiftUI app, test target, and CI`
- **Decision:** **Required — D3 (min iOS), D6 (test framework).** Defaults:
  iOS 17, Swift Testing.

---

## Phase 1 — Domain & engines in Swift (graded by parity vectors)

> Every slice here ends by **passing the relevant parity vectors** from Slice
> 0.2. That is the acceptance bar; unit tests are additive.

### Slice 1.1 — Card & hand model

- **Phase:** 1 — Engines
- **Status:** Done — `Card.swift` + `Hand.swift` port the value types and hand
  math; `CardHandTests` cross-checks canonical labels against
  `basic-strategy-vectors.json` (8 tests green).
- **Goal:** Port `card.model.ts` + `hand.model.ts` (Rank, Suit, Card,
  ten-value normalization, soft-aware N-card totals, pair detection, hand labels
  like `Soft 18 (A,7)` / `Hard 16` / `Pair of 8s` / `Blackjack`).
- **Why here:** Foundational types every engine and screen needs.
- **Scope:** Swift value types + hand math; unit tests; hand-label strings
  validated against labels embedded in `basic-strategy-vectors.json`.
- **Out of scope:** Strategy/counting decisions.
- **Acceptance criteria:**
  - [x] Totals/soft/pair/label helpers match the web semantics (face→10, A+10 =
        Blackjack, soft-aware N-card totals, pair/ten-value detection); labels
        cross-checked against the fixture.
- **Validation:** baseline + label cross-check — `xcodebuild test` ✓ (8 tests),
  `swiftformat --lint` ✓, `swiftlint` ✓.
- **Commit:** `feat(ios): port card and hand domain model`
- **Decision:** None.

### Slice 1.2 — Chart & counting-system data layer

- **Phase:** 1 — Engines
- **Status:** Done — `StrategyChart.swift` / `CountingSystem.swift` decode the
  bundled `charts.json` + `counting-systems.json`; `GameData` loads them from the
  app bundle and runs the integrity check. 13 tests green.
- **Goal:** Load `charts.json` + `counting-systems.json` as bundled resources
  into Decodable Swift models (the single source of truth, per D2).
- **Why here:** The engines read off this data; loading it as the exported bytes
  guarantees the charts match.
- **Scope:** `Decodable` chart-cell + counting-system models; a resource loader;
  a startup integrity check (expected key sets, 58 systems, legal cell symbols)
  mirroring the web's structural specs.
- **Out of scope:** Decision logic (next slices).
- **Acceptance criteria:**
  - [x] Both charts (H17/S17) + 58 systems decode; integrity check passes (key
        sets, legal cell symbols, full rank coverage, color-averaging invariant);
        per-color tags preserved for Red Seven / KISS (verified via `value(for:)`).
- **Validation:** baseline — `xcodebuild test` ✓ (13 tests), `swiftformat` ✓,
  `swiftlint` ✓.
- **Commit:** `feat(ios): load chart and counting-system data from exported JSON`
- **Decision:** Confirms D2.

### Slice 1.3 — Basic-strategy engine

- **Phase:** 1 — Engines
- **Status:** Done — `BasicStrategyEngine` (+ `Strategy.swift` model) reproduces
  all 2,720 `basic-strategy-vectors` exactly (action + source + label +
  rationale); `evaluate` handles the insurance short-circuit. The parity harness
  is proven end-to-end.
- **Goal:** Port `basic-strategy-engine.service.ts` (`decide` + `evaluate`),
  including the resolution order: insurance short-circuit → pair (with `YN`/DAS
  and `SUR_Y` fall-through) → soft → hard, and `SUR_*`/`Ds` handling.
- **Why here:** Smallest fully-enumerable engine; proves the parity harness
  end-to-end.
- **Scope:** Swift engine + the **exhaustive** `basic-strategy-vectors.json`
  test; insurance is always wrong (fixed rationale).
- **Out of scope:** Deviations, counting.
- **Acceptance criteria:**
  - [x] Every basic-strategy vector passes (action + source + label + rationale)
        — all 2,720 vectors green.
- **Validation:** baseline + full vector pass — `xcodebuild test` ✓ (16 tests
  incl. the 2,720-vector sweep), `swiftformat` ✓, `swiftlint` ✓.
- **Commit:** `feat(ios): port basic-strategy engine (parity-verified)`
- **Decision:** None.

### Slice 1.4 — Counting engine

- **Phase:** 1 — Engines
- **Status:** Done — `CountingEngine` reproduces all `counting-vectors`
  (58 systems × sequences: running + truncated true count, fractional Wong
  Halves, color Red Seven/KISS) and the `scoreDeckEstimate` boundaries; answer
  validators + `isFractionalSystem` ported. `validateSettings` / drill-result
  builders deferred to the Count screen (3.3) where the settings types live.
- **Goal:** Port `counting-engine.service.ts`: `runningCount`, `trueCount`
  (`Math.trunc` truncation toward zero), `scoreDeckEstimate` (±0.5),
  fractional-system handling (Wong Halves), color-aware tags (Red Seven / KISS),
  unbalanced systems (KO) restricted to running count, and the settings/answer
  validators.
- **Why here:** Second pure engine; unlocks the Count tab.
- **Scope:** Swift engine + `counting-vectors.json` test covering truncation,
  fractional, color, and deck-estimate boundary cases.
- **Out of scope:** Shoe/showdown (Slice 1.6), UI.
- **Acceptance criteria:**
  - [x] Every counting vector passes; truncation matches (`-5/2 → -2`); KO is
        unbalanced (drives the Count screen's running-count-only restriction in
        3.3 — the engine math is system-agnostic, as in the web).
- **Validation:** baseline + full vector pass — `xcodebuild test` ✓ (21 tests),
  `swiftformat` ✓, `swiftlint` ✓.
- **Commit:** `feat(ios): port counting engine with truncation, fractional, and color parity`
- **Decision:** None.

### Slice 1.5 — Deviation engine + evaluator

- **Phase:** 1 — Engines
- **Status:** Done — `DeviationEngine` + `DeviationEvaluator` reproduce all
  62,560 `deviation-vectors` (expected action, basic action, deviationApplied,
  matched-rule source, eval source), incl. the insurance overlay and surrender
  precedence. `ChartsFile` now also decodes the deviation tables. Feedback
  explanation strings deferred to the Deviations screen (3.5).
- **Goal:** Port `deviation-engine.service.ts` + `deviation-evaluator.service.ts`:
  the BJA Hi-Lo overlay on basic strategy, **surrender-precedence** ordering,
  and the **insurance overlay** (Ace upcard only, correct at TC ≥ +3).
- **Why here:** Depends on 1.3 (it resolves on top of the live basic action) and
  1.2's deviation charts.
- **Scope:** Swift engine + `deviation-vectors.json` test (every hand × upcard ×
  TC × rule set × DAS × LS), including the documented surrender-vs-natural
  precedence and the `0+`/`0-` inclusive-boundary convention.
- **Out of scope:** UI.
- **Acceptance criteria:**
  - [x] Every deviation vector passes, including insurance and surrender
        precedence — all 62,560 vectors green.
- **Validation:** baseline + full vector pass — `xcodebuild test` ✓ (24 tests
  incl. the 62,560-vector sweep), `swiftformat` ✓, `swiftlint` ✓.
- **Commit:** `feat(ios): port deviation engine and evaluator (parity-verified)`
- **Decision:** None.

### Slice 1.6 — Shoe model + showdown settlement

- **Phase:** 1 — Engines
- **Status:** Done — `Showdown` (dealerShouldHit/playDealerHand/settle)
  reproduces all `showdown-vectors`; `Shoe` (finite, depleting, cut card)
  tested independently (depletes without replacement, reshuffles at the cut
  card, carries position across rounds). **Phase 1 complete.**
- **Goal:** Port `shoe.model.ts` (finite deck, depletion, penetration/cut card,
  carry-across + reshuffle) and `showdown.model.ts` (dealer auto-play H17/S17,
  3:2 naturals, win/lose/push settlement, bust ordering).
- **Why here:** Last engine; the live-shoe true count + showdown depend on it.
- **Scope:** Swift shoe + showdown; `showdown-vectors.json` parity on the **pure**
  dealer-play/settlement functions; shoe depletion/penetration tested
  independently (RNG is a seam — see [Parity strategy](#parity-strategy-the-backbone)).
- **Out of scope:** Multi-hand / bankroll (deferred in the web app too).
- **Acceptance criteria:**
  - [x] Settlement vectors pass; shoe depletes without replacement, reshuffles at
        the cut card, carries position (and thus the running count) across rounds.
- **Validation:** baseline + settlement vectors — `xcodebuild test` ✓ (30 tests),
  `swiftformat` ✓, `swiftlint` ✓.
- **Commit:** `feat(ios): port finite shoe and showdown settlement`
- **Decision:** None.

---

## Phase 2 — Persistence & app shell

### Slice 2.1 — Stats stores (local)

- **Phase:** 2 — Shell
- **Status:** Done — `SessionStatsStore` (×5 keys) + `ShowdownStatsStore`
  (Codable → UserDefaults, D4) reuse the web's storage keys; malformed data
  falls back to empty, reset clears only its own key, legacy keys are wiped.
  Observable for the screens.
- **Goal:** Port the six stat stores (Basic Strategy, Running Count, True Count,
  Deviations, Deck estimation = `StatsStore` shape; Showdown = its own
  `{ hands, wins, losses, pushes, blackjacks }` shape) to Codable+`UserDefaults`
  (D4), reusing the **same storage keys** as the web app for conceptual parity.
- **Why here:** Screens need stats; sync (Phase 4) builds on this layer.
- **Scope:** Codable stat models; per-store persistence with the documented keys
  (`blackjack-basic-strategy-stats`, …, `blackjack-showdown-stats`); type-guarded
  decode with empty-stats fallback (mirrors the web's try/catch + field
  validation); legacy-key cleanup analogue.
- **Out of scope:** iCloud (Slice 4.2), widget sharing (Slice 4.3).
- **Acceptance criteria:**
  - [x] Each store persists/restores independently; malformed data falls back to
        empty; reset clears only its own key.
- **Validation:** baseline — `xcodebuild test` ✓ (37 tests), `swiftformat` ✓,
  `swiftlint` ✓.
- **Commit:** `feat(ios): persist per-trainer stats with localStorage-parity keys`
- **Decision:** **Resolved — D4 = UserDefaults** (the default; Codable structs
  → UserDefaults).

### Slice 2.2 — App shell, navigation & theme

- **Phase:** 2 — Shell
- **Status:** Done — `Theme` (dark casino-green palette mirroring the web),
  `AppModel` composition root (engines + stat stores, injected via environment),
  and a themed `RootTabView` whose per-tab visit-keyed `.id` rebuilds a tab on
  re-entry (in-memory drill state resets; persisted stats survive). Renders in
  the simulator (smoke screenshot).
- **Goal:** Real tab navigation + dark theme + safe-area handling; per-tab state
  reset semantics matching the web (navigating away discards in-memory drill
  state; only persisted stats survive).
- **Why here:** The frame the trainer screens slot into.
- **Scope:** `TabView`-based shell (the web's bottom tab bar maps directly to
  iOS tabs), dark theme tokens mirroring the web palette, `safeAreaInset`
  handling, hand-off of state-reset semantics to each screen's view model.
- **Out of scope:** Trainer screen internals (Phase 3).
- **Acceptance criteria:**
  - [x] Tabs route correctly; leaving and returning to a tab resets in-progress
        drill state (visit-keyed `.id`) but preserves stats (held by `AppModel`).
- **Validation:** baseline + manual smoke — `xcodebuild test` ✓ (39 tests),
  `swiftformat` ✓, `swiftlint` ✓, themed shell renders in the iPhone 16 Pro
  simulator.
- **Commit:** `feat(ios): tab navigation, dark theme, and safe-area shell`
- **Decision:** None.

### Slice 2.3 — Card art + acknowledgements/licenses screen

- **Phase:** 2 — Shell
- **Status:** Done — the 52 faces + blue back ship as **asset-catalog SVGs with
  vector data preserved** (Xcode's native renderer; zero new dependencies — the
  Decision default). `CardImage` maps a `Card` to its asset and renders
  face-up/face-down. `AboutView` (wired to the About tab) carries the Vector
  Playing Card Library 1.3 (Chris Aguilar) **LGPL 3.0** attribution with the
  bundled `AUTHORS`/`COPYING`/`COPYING.LESSER` texts viewable in-app, plus the
  **MIT** app-code notice. `actool` compiled all 53 vectors (verified in the
  built `Assets.car`).
- **Goal:** Bring the 52 card faces + blue back into the app and ship the
  **LGPL** attribution required by the card art's license.
- **Why here:** Screens need card images; the license obligation must land with
  the assets, not after.
- **Scope:** Import the cardsJS SVGs (render via an SVG library or convert to a
  PDF/asset-catalog set — a format change of an LGPL work, still LGPL); a
  `CardImage` view (face-up/face-down); an in-app **Acknowledgements** screen
  carrying `AUTHORS.txt` / `COPYING(.LESSER).txt` text and the app-code
  (MIT) notice.
- **Out of scope:** Trainer layout (Phase 3).
- **Acceptance criteria:**
  - [x] All 52 + back render crisply at trainer sizes (shipped as preserved
        vectors — `actool` compiled all 53 into `Assets.car`, verified via
        `assetutil`; the on-device crispness eyeball is folded into the 4.1 device
        pass); acknowledgements screen shows the LGPL attribution and the MIT
        app-code notice.
- **Validation:** baseline + visual check — `xcodebuild test` ✓ (43 tests, incl.
  the card-name mapping for all 52 + back), `swiftformat --lint` ✓, `swiftlint` ✓,
  `assetutil` confirms all 53 card vectors in `Assets.car`, app launches in the
  iPhone 16 Pro simulator (smoke screenshot). The About-screen pixels weren't
  auto-captured (no accessibility permission for scripted simulator taps).
- **Commit:** `feat(ios): card art assets and LGPL acknowledgements screen`
- **Decision:** **Resolved — asset-catalog SVG (preserve vector data)** over an
  SVG library or PDF conversion: it renders the vendored SVGs crisply with the
  least tooling (no new dependency), per the slice's default. LGPL notices ship
  in `AboutView`.

---

## Phase 3 — Trainer screens

### Slice 3.1 — Shared SwiftUI components

- **Phase:** 3 — Screens
- **Status:** Done — `Views/Components/` ports the five shared views:
  `BlackjackTableView` (dealer upcard + hole / full reveal), `ActionButtonsView`
  (subsettable H/S/D/P/R/I, default = full set), `FeedbackShellView` (verdict
  chrome + `@ViewBuilder` detail slot + "Deal next hand"), `RuleControlsView`
  (S17/H17 segmented + DAS/LS toggles bound to `EngineOptions`), and
  `StatsPanelView` (attempts/correct/accuracy/streak/longest + reset). Hardware
  hotkeys (H/S/D/P/R/I via `Keyboard.swift`, Enter→deal) are wired with
  `.keyboardShortcut`; key-hint chips show only when a hardware keyboard is
  attached (`HardwareKeyboardMonitor` → `\.hasHardwareKeyboard`).
- **Goal:** Port the shared UI: blackjack table (dealer/player layout), action
  buttons (subsettable: H/S/D/P/R/I), feedback shell, rule controls (H17/S17 +
  DAS + LS), stats panel (+ reset), reused across screens.
- **Why here:** Built once, consumed by all four screens — mirrors the web's
  `shared/` extraction.
- **Scope:** Reusable SwiftUI views + view-model seams; hardware-keyboard
  shortcuts (H/S/D/P/R/I, Enter) wired for iPad/Magic Keyboard, hidden on touch
  (mirrors the web hiding hint chips on touch).
- **Out of scope:** Per-trainer orchestration.
- **Acceptance criteria:**
  - [x] Each shared view renders standalone in previews (all five have `#Preview`
        blocks that compile into the debug build); action subsetting works
        (`ActionButtonsView(actions:)` — tested defaults + subsets).
- **Validation:** baseline + previews — `xcodebuild test` ✓ (48 tests, incl.
  hotkey mapping + accuracy formatting), `swiftformat --lint` ✓, `swiftlint` ✓.
  Disabled `multiple_closures_with_trailing_closure` (idiomatic SwiftUI builder
  views) and excluded build output earlier (2.3).
- **Commit:** `feat(ios): shared blackjack-UI components`
- **Decision:** None.

### Slice 3.2 — Basic Strategy screen

- **Phase:** 3 — Screens
- **Status:** Done — `BasicStrategyView` over a testable `@Observable`
  `BasicStrategyModel` (deal → answer → feedback → next, mirroring the web page
  component): shared table/action-buttons/rule-controls/stats-panel/feedback-shell
  components, the six actions (gated once graded), the insurance-always-wrong
  rationale, and persisted session stats with reset. `CardGenerator` ports the
  RNG-seam scenario generator. Wired to the Strategy tab; renders the live
  trainer in the simulator (smoke screenshot — card art crisp at trainer size).
- **Goal:** Full Basic Strategy trainer: two-card hand vs dealer upcard, six
  actions, H17/S17 + DAS + LS toggles, per-attempt feedback (hand label, correct
  action, rationale, "insurance is always wrong"), stats + reset.
- **Why here:** Simplest full screen; validates the engine→UI→stats loop.
- **Scope:** Screen + view model over the Slice 1.3 engine and Slice 2.1 store.
- **Out of scope:** Counting/deviations.
- **Acceptance criteria:**
  - [x] Behavior matches the web trainer (engine-graded, insurance always wrong);
        stats update and persist (UserDefaults via the 2.1 store); reset works —
        covered by `BasicStrategyModelTests` + a live simulator screenshot.
- **Validation:** baseline + manual smoke — `xcodebuild test` ✓ (57 tests, incl.
  `CardGeneratorTests` + `BasicStrategyModelTests`), `swiftformat --lint` ✓,
  `swiftlint` ✓, live Strategy screen screenshotted in the iPhone 16 Pro sim.
- **Commit:** `feat(ios): basic strategy trainer screen`
- **Decision:** None.

### Slice 3.3 — Card Counting screen (running + true count)

- **Phase:** 3 — Screens
- **Status:** Done — `CountingView` over a `@MainActor @Observable`
  `CountingModel` (idle → streaming → answering → feedback). System picker over
  all 58 systems, mode selector (true count hidden/coerced for unbalanced KO),
  number-of-cards + ms steppers, and the **classic** decks-remaining preset; the
  timed card stream advances via an async task; `CountAnswerView` does
  integer/decimal entry (decimal for fractional systems); `CountFeedbackView`
  shows the count/true-count details, the running ÷ decks formula, and the
  card-by-card breakdown. The drill-result builders + `validateSettings` were
  added to `CountingEngine` (deferred from 1.4). Live shoe / deck estimation /
  showdown remain for 3.4.
- **Goal:** The counting trainer's shared flow: mode selector (running/true),
  settings (system picker over 58 systems, card count 1–200, ms ≥ 100, classic
  decks-remaining preset), card stream with progress, numeric answer
  (integer/decimal per system), feedback with card-by-card breakdown, stats.
- **Why here:** The richest non-shoe screen; exercises the counting engine and
  validators.
- **Scope:** Screen + state machine (settings → stream → answer → feedback);
  numeric keypad + decimal handling for Wong Halves; system picker discovers
  systems from the data layer.
- **Out of scope:** Live shoe + showdown (Slice 3.4).
- **Acceptance criteria:**
  - [x] Running and true-count (classic preset) drills match the web (engine-
        graded; truncation toward zero; fractional decimal entry); breakdown and
        validation behave identically; KO is running-count-only (coerced on
        system change) — covered by `CountingDrillTests` + `CountingModelTests`.
- **Validation:** baseline + manual smoke — `xcodebuild test` ✓ (66 tests, incl.
  the timed drill round), `swiftformat --lint` ✓, `swiftlint` ✓ (0 violations),
  app launches cleanly with the Count tab wired (its model builds at launch).
- **Commit:** `feat(ios): card counting trainer (running and true count)`
- **Decision:** None.

### Slice 3.4 — Live shoe + deck estimation + showdown

- **Phase:** 3 — Screens
- **Status:** Done — extends `CountingModel` with the live-shoe true-count source
  (decks 1/2/6/8 + penetration; `ShoeFactory` builds + Fisher–Yates-shuffles the
  shoe via the RNG seam), the `estimating` step (`DeckEstimateView`, scored ±0.5),
  the carried running count + cut-card reshuffle notice across rounds, the split
  stats panels (True count + Deck estimation), and the post-count `ShowdownView`
  (its own `@MainActor ShowdownModel`: hit/stand, dealer auto-play H17/S17, 3:2
  naturals, win/lose/push tally) dealing off the same persistent shoe.
- **Goal:** Live-shoe true count (configure decks 1/2/6/8 + penetration; "how
  many decks remain?" ±0.5 step; grade TC vs actual; carry across rounds;
  reshuffle notice) and the post-count **showdown** (hit/stand vs dealer, H17/S17
  toggle, 3:2 naturals, win/lose/push tally).
- **Why here:** Builds on 3.3 and the Slice 1.6 shoe/showdown engines.
- **Scope:** Live-shoe flow + deck-estimate step + the two stats panels (True
  count + Deck estimation) + showdown UI and its own tally store.
- **Out of scope:** Multi-hand / bankroll (deferred, as in the web app).
- **Acceptance criteria:**
  - [x] Live shoe depletes/reshuffles correctly (carries position + running count
        across rounds, reshuffles at the cut card); deck estimate scored ±0.5;
        showdown settles per the rules; both stat panels + showdown tally persist
        — covered by `ShoeFactoryTests`, `ShowdownModelTests`, and the live-shoe
        round in `CountingModelTests` (the shoe/settlement math itself is the 1.6
        parity sweep).
- **Validation:** baseline + manual smoke — `xcodebuild test` ✓ (72 tests),
  `swiftformat --lint` ✓, `swiftlint` ✓ (0 violations), app launches cleanly with
  the live-shoe Count model wired. (Split `CountingModel` into its own file.)
- **Commit:** `feat(ios): live-shoe deck estimation and post-count showdown`
- **Decision:** None.

### Slice 3.5 — Deviations screen

- **Phase:** 3 — Screens
- **Status:** Done — `DeviationsView` over a testable `@Observable`
  `DeviationsModel` (random hand+upcard+TC, graded by the 1.5 evaluator):
  Random/Manual TC source (manual validated to `[-20,+20]`, next-hand gated on a
  valid value), All-hands vs Deviation-only practice (`DeviationScenarioGenerator`
  builds hands that route back to an encoded rule with a threshold-biased count),
  the six actions, and feedback with the matched-rule rationale + the insurance
  overlay. `DeviationTrainer.swift` adds the feedback formatters
  (`formatTrueCount`/`formatThreshold`/`explanation`, deferred from 1.5) and
  `parseManualTrueCount`. Wired the Deviations tab; removed the placeholder.
  **Phase 3 complete — all four trainers live.**
- **Goal:** Deviations trainer: random two-card hand + upcard + true count (Random
  in `[-5,+8]` or Manual in `[-20,+20]`), All-hands vs Deviation-only practice,
  six actions, feedback with matched-rule rationale and the insurance overlay.
- **Why here:** Depends on the Slice 1.5 evaluator; completes the four trainers.
- **Scope:** Screen + view model over the deviation evaluator; Deviation-only
  scenario generation (count biased to thresholds under Random).
- **Out of scope:** KO/Omega/Wong deviation charts (Hi-Lo only, as in the web app).
- **Acceptance criteria:**
  - [x] Matches the web deviations trainer across both TC sources and both
        practice modes; insurance evaluated at TC ≥ +3 — covered by
        `DeviationFeedbackTests`, `DeviationScenarioGeneratorTests` (every encoded
        rule's generated hand routes back to it), and `DeviationsModelTests`.
- **Validation:** baseline + manual smoke — `xcodebuild test` ✓ (88 tests),
  `swiftformat --lint` ✓, `swiftlint` ✓ (0 violations), app launches cleanly with
  all four trainer tabs live.
- **Commit:** `feat(ios): deviations trainer screen`
- **Decision:** None.

---

## Phase 4 — Native extras (the chosen scope)

### Slice 4.1 — Haptics, icon, launch screen & accessibility pass

- **Phase:** 4 — Native
- **Status:** Done (code; on-device a11y/haptics verification is a pending human
  action) — added an `AppIcon` set (1024² spade-on-felt, compiled into
  `Assets.car`, restored `ASSETCATALOG_COMPILER_APPICON_NAME`), feedback +
  deal haptics via SwiftUI `.sensoryFeedback` (success/error on every graded
  result across all four trainers + the showdown; `.selection` on each deal),
  card/action VoiceOver labels, and Dynamic Type via system text styles. The
  generated dark `UILaunchScreen` is present. The Accessibility-Inspector audit
  and real-device haptics check stay in the device pass.
- **Goal:** The "feels native" baseline: app icon, launch screen, tap haptics on
  actions/feedback, finalized safe-area, VoiceOver labels, and Dynamic Type.
- **Why here:** Polish that should be in place before beta and is partly
  required by App Review (icon, launch screen).
- **Scope:** Asset-catalog app icon set; launch screen; `UIFeedbackGenerator`
  haptics on correct/incorrect + deal; accessibility labels on cards/actions;
  Dynamic Type audit.
- **Out of scope:** Sync/widget/reminders.
- **Acceptance criteria:**
  - [x] Icon + launch screen present (icon compiled into `Assets.car` + installed;
        generated dark launch screen); haptics fire (`.sensoryFeedback` wired);
        VoiceOver labels on cards/actions; layout uses Dynamic Type system styles.
        The on-device VoiceOver read-through + large-type eyeball is the human
        device pass.
- **Validation:** baseline + device check + Accessibility Inspector — `xcodebuild
test` ✓ (88 tests, no regressions), `swiftformat --lint` ✓, `swiftlint` ✓ (0
  violations), `assetutil` confirms `AppIcon` in `Assets.car`, app installs with
  the icon. Device check + Accessibility Inspector are the pending human action.
- **Commit:** `feat(ios): app icon, launch screen, haptics, and accessibility pass`
- **Decision:** None.

### Slice 4.2 — iCloud stats sync

- **Phase:** 4 — Native
- **Status:** Done (code + entitlement; iCloud capability provisioning + the
  two-device verification are pending human actions) — `CloudKeyValueStore`
  protocol + `UbiquitousKeyValueStore` (NSUbiquitousKeyValueStore) backing; the
  six stat stores write-through to KVS and adopt external changes (last-writer-
  wins, D5); `StatsCloudSync` seeds/pulls at launch and observes the
  did-change-externally notification; `BlackjackTrainer.entitlements` carries the
  KVS key (wired but inert with signing off → simulator build stays green; it
  degrades to local-only until the human enables the iCloud capability).
- **Goal:** Sync the per-trainer stats across a user's devices.
- **Why here:** First of the chosen native extras; builds directly on Slice 2.1.
- **Scope:** Mirror each stat store into `NSUbiquitousKeyValueStore` (D5) with a
  last-writer-wins merge and change observation; enable the iCloud KVS
  capability; graceful offline/no-account fallback to local-only.
- **Out of scope:** CloudKit, account systems, server backend.
- **Acceptance criteria:**
  - [x] (code) Stats mirror to KVS and a second store sharing the KVS adopts them
        (last-writer-wins); no data loss when iCloud is unavailable (local-only
        fallback) — covered by `CloudSyncTests` with a fake cloud standing in for
        two devices. **The real two-device sync test on hardware is a pending
        human action (needs the provisioned iCloud capability).**
- **Validation:** baseline + two-device manual test — `xcodebuild test` ✓ (94
  tests incl. `CloudSyncTests`), `swiftformat --lint` ✓, `swiftlint` ✓ (0
  violations); the simulator logs the expected "no KVS entitlement" notice and
  runs local-only. Two-device verification is the pending human action.
- **Commit:** `feat(ios): iCloud sync for per-trainer stats`
- **Decision:** **Resolved — D5 = KVS** (`NSUbiquitousKeyValueStore`), the
  default. Re-evaluate only if the data model outgrows KVS's 1MB/key limits.

### Slice 4.3 — Home-screen widget

- **Phase:** 4 — Native
- **Status:** Done (code + entitlements; on-device App-Group provisioning +
  Home-Screen verification are pending human actions) — added a WidgetKit
  app-extension target `ios/BlackjackWidget/` (XcodeGen `type: app-extension`,
  embedded into `BlackjackTrainer.app/PlugIns/` and `ValidateEmbeddedBinary`-clean
  on the simulator). An `AppIntentConfiguration` widget (`SelectTrainerIntent`)
  with small + medium layouts surfaces **accuracy + current streak per selected
  trainer** (the resolved default). A shared `Shared/WidgetSnapshot.swift`
  (compiled into both the app and the widget) carries the snapshot model + the
  App Group store; the app's `WidgetSnapshotPublisher` (owned by `AppModel`, the
  widget analogue of `StatsCloudSync`) rebuilds the snapshot from the five
  session-stat stores on each change — via a new `SessionStatsStore.onChange`
  hook — and calls `WidgetCenter.shared.reloadAllTimelines()` (timeline policy
  `.never`, since refreshes are event-driven). App Group
  `group.com.arthurzhang.blackjacktrainer` is wired in both entitlements files;
  inert with signing off, so the simulator build stays green and the widget shows
  live cross-process data only once the human provisions the group. The original
  pause note (account-gated) no longer applies: the account is active (2026-06-12,
  user-confirmed), so the code is built + simulator-validated and only the
  on-device Home-Screen check is deferred (same pattern as 4.2's iCloud).
- **Goal:** A WidgetKit widget surfacing at least one stat (e.g. overall
  accuracy and current streak, selectable per trainer).
- **Why here:** Needs the stats container shared via an **App Group**, which also
  benefits the widget/extension boundary.
- **Scope:** Widget extension; move the stats container behind a shared App Group
  so app + widget read the same data; small/medium widget layouts; timeline
  refresh on stat changes.
- **Out of scope:** Interactive widgets / Live Activities.
- **Acceptance criteria:**
  - [x] (code) Widget builds + embeds, reads the shared snapshot, and is driven by
        the per-trainer configuration intent (small + medium); the app writes the
        snapshot + reloads timelines on each stat change — covered by
        `WidgetSnapshotTests` (snapshot/store round-trip, publisher refresh on
        record/reset, accuracy parity with the in-app panel) and a clean simulator
        launch with the `.appex` embedded. **On-device install + Home-Screen render
        + update-after-a-drill needs the provisioned App Group (pending human
        action).**
- **Validation:** baseline + device check — `xcodebuild build` ✓ (widget `.appex`
  embedded, `ValidateEmbeddedBinary` ✓), `xcodebuild test` ✓ (104 tests incl.
  `WidgetSnapshotTests`), `swiftformat --lint` ✓, `swiftlint` ✓ (0 violations), app
  launches cleanly in the iPhone 16 Pro simulator with the widget embedded.
  On-device Home-Screen verification is the pending human action.
- **Commit:** `feat(ios): home-screen stats widget via WidgetKit`
- **Decision:** **Resolved (default) — accuracy + current streak, per selected
  trainer.** (Implementation deferred to the human per the handoff above.)

### Slice 4.4 — Local-notification practice reminders

- **Phase:** 4 — Native
- **Status:** Planned
- **Goal:** Optional reminders to practice on a user-set schedule.
- **Why here:** Last native extra; self-contained (local notifications, no
  backend).
- **Scope:** `UserNotifications` permission UX; a settings screen to enable/set
  time(s); schedule repeating local notifications; deep-link a tapped
  notification to the relevant trainer.
- **Out of scope:** Push notifications / server-scheduled reminders.
- **Acceptance criteria:**
  - [ ] Permission flow is correct; reminders fire on schedule; tapping opens the
        chosen trainer; disabling cancels them.
- **Validation:** baseline + device check.
- **Commit:** `feat(ios): local-notification practice reminders`
- **Decision:** **Required — default cadence & copy.** Default: off until enabled;
  one daily reminder when turned on.

---

## Phase 5 — App Store readiness & submission

### Slice 5.1 — App Store Connect metadata, privacy & ratings

- **Phase:** 5 — Release
- **Status:** Planned
- **Goal:** Everything App Review needs besides the binary.
- **Why here:** Can be prepared in parallel with Phase 4 but gated by a
  near-final build for screenshots.
- **Scope:** App name/subtitle/description/keywords; screenshots for required
  device sizes; **privacy nutrition labels** (data **not collected** — stats are
  on-device + the user's own iCloud); **age-rating questionnaire** answered
  honestly for a no-wager strategy trainer; **export compliance**
  (`ITSAppUsesNonExemptEncryption = false` — no non-exempt crypto); support URL +
  marketing copy positioning it as an **educational trainer**. See
  [App Store specifics](#app-store-specifics--review-risk).
- **Out of scope:** Code changes (unless review demands them).
- **Acceptance criteria:**
  - [ ] App Store Connect record complete and passes validation; privacy + rating + export-compliance answers recorded.
- **Validation:** App Store Connect validation.
- **Commit:** `chore(ios): App Store Connect metadata, privacy labels, and ratings`
- **Decision:** **Required — D7 framing + final age rating.** Default:
  educational, no-wager positioning; accept the rating the honest questionnaire
  yields (commonly 17+ for simulated-gambling content).

### Slice 5.2 — TestFlight beta

- **Phase:** 5 — Release
- **Status:** Planned
- **Goal:** Real-device validation before public review.
- **Why here:** Catches signing, capability (iCloud/widget/notifications), and
  on-hardware issues a simulator hides.
- **Scope:** Archive + upload; internal (and optional external) TestFlight
  testing across device sizes; triage and fix blockers.
- **Out of scope:** New features.
- **Acceptance criteria:**
  - [ ] Build installs via TestFlight; sync, widget, and reminders work on real
        devices; no crash/blocker outstanding.
- **Validation:** TestFlight + device matrix.
- **Commit:** `chore(ios): TestFlight beta and on-device fixes`
- **Decision:** None.

### Slice 5.3 — Submit for review & release

- **Phase:** 5 — Release
- **Status:** Planned
- **Goal:** Pass App Review and go live.
- **Why here:** Final gate.
- **Scope:** Submit; respond to any rejection (most likely the gambling/age-rating
  or "minimum functionality" angles — see risks); release (manual or phased
  rollout).
- **Out of scope:** Post-launch features.
- **Acceptance criteria:**
  - [ ] App approved and downloadable on the App Store.
- **Validation:** App Review approval.
- **Commit:** `chore(ios): submit and release v1 to the App Store`
- **Decision:** **Required — release type.** Default: phased rollout.

---

## App Store specifics & review risk

- **Gambling guideline (5.3).** Apple's gambling rules target **real-money**
  gaming. This app has **no wagering, no real or virtual currency, and no
  payouts** — the showdown's "3:2" is flavor with a win/lose/push tally — so it
  is a _strategy trainer_, not gambling. Still, **card-counting / blackjack
  framing draws reviewer scrutiny**: position the app as **educational**, avoid
  implying real-money advantage, and answer the **age-rating** "Simulated
  Gambling" item honestly (blackjack trainers commonly land at **17+**). This is
  the most likely source of friction; budget a review round for it.
- **Minimum functionality (4.2).** A native SwiftUI app with real interaction
  clears this easily (the reason a webview wrapper was _not_ chosen).
- **Privacy.** No analytics, no accounts, no third-party SDKs; stats live
  on-device and in the user's own iCloud. App Privacy = **Data Not Collected**.
  Keep it that way to preserve the simplest possible privacy posture.
- **Export compliance.** No non-exempt encryption →
  `ITSAppUsesNonExemptEncryption = false`.
- **Licensing.** App code stays **MIT**; the card art stays **LGPL 3.0** and its
  notices ship in the in-app acknowledgements screen (Slice 2.3). The web repo's
  `private: true` npm guard is irrelevant to the iOS target.

## Risk register

| Risk                                                 | Likelihood | Mitigation                                                                                         |
| ---------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| Swift engine silently diverges from TS               | Med        | Exhaustive parity vectors + CI anti-drift gate ([Parity strategy](#parity-strategy-the-backbone)). |
| App Review flags gambling/age rating                 | Med        | Educational positioning; honest 17+ rating; no wagering; budget a review round.                    |
| Card-art SVG rendering fidelity on device            | Low-Med    | Evaluate SVG lib vs asset-catalog conversion early (Slice 2.3); keep LGPL notices.                 |
| iCloud KVS limits/edge cases (no account, conflicts) | Low        | Local-first with KVS mirror + LWW merge; graceful offline fallback (Slice 4.2).                    |
| Apple Developer enrollment delay                     | Low        | Start Slice 0.1 on day one; it gates submission, not development.                                  |
| Scope creep from "native extras"                     | Med        | Extras are isolated to Phase 4; each is independently shippable and can be cut for v1.             |

## Rough sizing (very approximate, solo dev)

Order-of-magnitude only — not commitments. Phases are independently shippable.

- **Phase 0** (foundations + exporter + skeleton): ~0.5–1 week.
- **Phase 1** (engines + parity): ~1.5–2.5 weeks — the highest-confidence work,
  because the vectors define "done."
- **Phase 2** (persistence + shell + assets): ~1 week.
- **Phase 3** (four screens): ~2–3 weeks.
- **Phase 4** (haptics/a11y + iCloud + widget + reminders): ~1.5–2.5 weeks.
- **Phase 5** (store prep + TestFlight + review): ~1 week of work + **review
  latency** (often a few days per round).

**A leaner v1** is available by cutting Phase 4 to just Slice 4.1 (polish) and
deferring iCloud/widget/reminders — but those were explicitly chosen as in-scope,
so they're included above. Each is a clean cut line if timelines tighten.

## Out of scope / future (beyond v1)

- **Android / cross-platform.** This roadmap is iOS-only; a native rewrite does
  not produce an Android app (a factor noted when the approach was chosen).
- **The web app's own deferred items** carry over: KO true count (IRC/key
  count), deviation charts for KO/Omega II/Wong Halves, and true multi-hand /
  bankroll showdowns (Option B/C).
- **CloudKit / accounts**, interactive widgets / Live Activities, iPad-optimized
  multi-column layouts, and Apple Watch — all deferred.

## How this roadmap is consumed

Like [`roadmap.md`](roadmap.md): this file is the source of truth for _what_ each
slice is. Implement the next **Planned** slice, leave the project green per the
[validation baseline](#validation-baseline-applies-to-every-slice), make one
commit per slice, and record progress (and any resolved `Decision:` defaults) in
a companion progress log (e.g. `docs/ios-app-roadmap-progress.md`) the first time
a slice lands.
