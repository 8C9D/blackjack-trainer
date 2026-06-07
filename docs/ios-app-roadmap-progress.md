# iOS App Roadmap Progress

_Maintained by the `ios-app-roadmap-autopilot` skill. The cursor below is the
source of truth for what runs next. Manual edits are fine if you keep the
format._

**Roadmap:** [docs/ios-app-roadmap.md](ios-app-roadmap.md)
**iOS project location:** `./ios` (monorepo, D1 default)
**Toolchain:** `xcodebuild` 16.4 (Build 16F6) ✓ · `swift` 6.1.2 ✓ · `swiftformat`
✓ · `swiftlint` ✓ (both installed via Homebrew at Slice 0.3) · `xcodegen` 2.45.4
✓ · macOS 15.6.1 host. All Swift build/test/lint gates run locally. Simulator
destination is `iPhone 16 Pro` (no plain "iPhone 16" is installed).
**Apple Developer account:** not available on this machine → account/device/App
Store-gated steps are prepared and handed off (see _Pending human actions_).
**Current phase:** 1
**Next slice:** 1.6

## Decisions applied

| ID  | Decision                    | Value                                     | Source                                                      |
| --- | --------------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| D1  | Repo layout                 | **Monorepo `./ios`** alongside `src/`     | default (roadmap §Cross-cutting decisions) — applied in 0.1 |
| D2  | Chart/counting data → Swift | Bundle exported JSON, decode at launch    | default — **applied in 0.2**; reused in 1.2                 |
| D3  | Minimum iOS version         | iOS 17                                    | default — **applied in 0.3**                                |
| D4  | Local persistence           | Codable → `UserDefaults`                  | default — to apply in 2.1                                   |
| D5  | iCloud sync transport       | `NSUbiquitousKeyValueStore` (KVS)         | default — to apply in 4.2                                   |
| D6  | Test framework              | Swift Testing (fallback XCTest)           | default — **applied in 0.3**                                |
| D7  | App Store positioning       | Educational strategy trainer, no wagering | default — to apply in 5.1                                   |

## Pending human actions (handoffs)

These require a human and/or an Apple Developer account; the autopilot prepares
everything automatable around them and does **not** mark them Done.

- [ ] **Enroll in the Apple Developer Program** ($99/yr). Gates signing,
      entitlement provisioning, TestFlight, and App Store Connect. _(Slice 0.1;
      unblocks Phases 4–5.)_
- [ ] **Reserve the bundle ID and create the App Store Connect app record.**
      Needs the account. _(Slice 0.1.)_
- [ ] **Provision the iCloud KVS capability** and run the two-device iCloud sync
      verification. _(Slice 4.2.)_
- [ ] **Provision the App Group** shared container and verify the widget on a
      real Home Screen. _(Slice 4.3.)_
- [ ] **Verify notification permission + on-schedule delivery on device.**
      _(Slice 4.4.)_
- [ ] **Device pass:** icon/launch screen on hardware + Accessibility Inspector
      audit. _(Slice 4.1.)_
- [ ] **App Store Connect:** metadata entry, screenshots from a near-final
      build, privacy nutrition labels, age-rating questionnaire,
      export-compliance flag. _(Slice 5.1.)_
- [ ] **TestFlight:** archive upload + internal/external testing on a device
      matrix. _(Slice 5.2.)_
- [ ] **Submit for review and release.** _(Slice 5.3.)_

## Execution log

| Phase | Slice | Title                                | Status | Commit  | Validated                                                                  | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----: | ----: | ------------------------------------ | ------ | ------- | -------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   pre |     — | Lockfile engines sync                | Done   | 341088f | tracked tree clean                                                         | 2026-06-07 | Pre-flight: committed unrelated `package-lock.json` change so the autopilot could start on a clean tracked tree (user-approved).                                                                                                                                                                                                                                                                                              |
|     0 |   0.1 | Repo layout decision + Apple prereqs | Done   | b191a08 | n/a (process)                                                              | 2026-06-07 | D1 = monorepo `./ios` (default). Apple enrollment + bundle ID + ASC record recorded as pending human actions; per roadmap they gate signing/submission, not dev, so we proceed to 0.2.                                                                                                                                                                                                                                        |
|     0 |   0.2 | Parity fixture exporter              | Done   | a350ebd | npm lint+test(702)+build ✓; byte-clean re-export                           | 2026-06-07 | `tools/export-parity-fixtures.ts` (tsx) → 6 fixtures in `ios/Fixtures/`: charts, counting-systems (58), basic-strategy-vectors (2,720), deviation-vectors (62,560, columnar/interned to ~4MB), counting-vectors, showdown-vectors. D2 = bundled JSON. CI anti-drift gate added. Installed `tsx` devDep. Prettier-normalized the roadmap docs to satisfy the repo's `prettier --check` gate.                                   |
|     0 |   0.3 | Xcode SwiftUI skeleton + CI          | Done   | 2c20a7e | xcodebuild build+test ✓; swiftformat+swiftlint ✓                           | 2026-06-07 | XcodeGen-generated `ios/BlackjackTrainer.xcodeproj` (committed). SwiftUI app: 4 dark-mode tabs (Strategy/Count/Deviations/About), Swift Testing target (smoke test). `.swiftformat`, `.swiftlint.yml`, `ios/project.yml`, and `.github/workflows/ios-ci.yml` added. D3 = iOS 17, D6 = Swift Testing. Installed `xcodegen`, `swiftformat`, `swiftlint` (Homebrew). `ios/` excluded from web prettier; `ios/build/` gitignored. |
|     1 |   1.1 | Card & hand model                    | Done   | 66e97df | xcodebuild test (8) ✓; swiftformat+swiftlint ✓                             | 2026-06-07 | `Card.swift` (Rank/Suit/Card, ten-value/ace/color/high-value) + `Hand.swift` (soft-aware N-card scoring, two-card pair/soft classification, canonical labels). Test target bundles `ios/Fixtures` as resources; `CardHandTests` cross-checks labels vs `basic-strategy-vectors.json`. Relaxed swiftlint `identifier_name` min-length for engine math vars.                                                                    |
|     1 |   1.2 | Chart & counting-system data layer   | Done   | 30284f0 | xcodebuild test (13) ✓; swiftformat+swiftlint ✓                            | 2026-06-07 | `StrategyChart.swift` + `CountingSystem.swift` Decodable models; `GameData` loads `charts.json` + `counting-systems.json` from the app bundle and runs the integrity check (key sets, legal cell symbols, 58 systems, color-averaging invariant). App target bundles the two data files; `DataLayerTests` cover decode + integrity + color/fractional flags.                                                                  |
|     1 |   1.3 | Basic-strategy engine                | Done   | abed13e | xcodebuild test (16, incl. 2,720-vector sweep) ✓; swiftformat+swiftlint ✓  | 2026-06-07 | `Strategy.swift` (Action/EngineOptions/DecisionSource/EngineInput) + `BasicStrategyEngine` reproduce every `basic-strategy-vectors` row exactly (action+source+label+rationale), incl. pair fall-through, SUR\_\* options, and the `evaluate` insurance short-circuit. Resolved the swiftformat↔swiftlint brace conflict via `--disable wrapMultilineStatementBraces`.                                                        |
|     1 |   1.4 | Counting engine                      | Done   | 3c01244 | xcodebuild test (21) ✓; swiftformat+swiftlint ✓                            | 2026-06-07 | `CountingEngine`: running/true count (truncation toward zero), `scoreDeckEstimate`, `isFractionalSystem`, integer/decimal answer validators. Graded against `counting-vectors` (58 systems × sequences incl. fractional Wong Halves, color Red Seven/KISS, −5/2→−2) and the deck-estimate boundaries. `validateSettings`/drill-result builders deferred to 3.3.                                                               |
|     1 |   1.5 | Deviation engine + evaluator         | Done   | pending | xcodebuild test (24, incl. 62,560-vector sweep) ✓; swiftformat+swiftlint ✓ | 2026-06-07 | `Deviation.swift` (DeviationRule/Decision/Scenario/Result) + `DeviationEngine` (resolveDeviationDecision/resolveInsuranceDecision, classifyForDeviation, surrender precedence) + `DeviationEvaluator` reproduce every `deviation-vectors` row (expectedAction/basicAction/deviationApplied/matchedRuleSource/evalSource). `ChartsFile` extended to decode the deviation tables. Feedback explanation strings deferred to 3.5. |

</content>
