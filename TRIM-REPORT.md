# iOS v1.0 scope trim — report

Scope: the iOS target under `ios/`.
The Angular web app was not modified except for the two iOS-facing doc updates noted below; it keeps its full feature set.
The authoritative restore point is the git tag `pre-trim-full-featureset` (branch `archive/full-featureset`); per-feature restore instructions are in `archived/RESTORE.md`.

## What was archived and where

Nine features were removed from the app and the built product; wholly-owned files were `git mv`'d to `archived/<slug>/` preserving their `ios/` paths, and code inside shared files was deleted in place (recoverable from the tag).

| Feature               | Slug                 | Wholly-owned files moved                                                                                                      | Shared-file surface deleted in place                                                                                                                                                                                                                                     |
| --------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Practice reminders    | `practice-reminders` | `Notifications/` (3 files), `RemindersView.swift`, `RemindersTests`                                                           | app delegate wiring + `UserNotifications` import, Settings row                                                                                                                                                                                                           |
| Home-screen widget    | `widget`             | the `BlackjackWidget` target (4 files), `Shared/WidgetSnapshot.swift`, `WidgetSnapshotPublisher.swift`, `WidgetSnapshotTests` | `project.yml` target/embed/Shared source, `AppModel.widgetPublisher`, the stores' `onChange` hooks, the App Group entitlement                                                                                                                                            |
| Deck speed mode       | `deck-speed`         | `Engine/DeckSpeed.swift`, `DeckSpeedTests`                                                                                    | `DrillMode.deckSpeed`, model/engine/feedback/Settings/Progress/Home surfaces, `DeckSpeedBestStore`                                                                                                                                                                       |
| Key count mode        | `key-count`          | `AdvantageCallView.swift`                                                                                                     | `DrillMode.keyCount`, `.advantage` state, `evaluateKeyCount`, IRC shoe seeding, feedback/Settings/Progress/Home surfaces                                                                                                                                                 |
| Bet spread mode       | `bet-spread`         | `Engine/BetRamp.swift`, `BetRampEditor.swift`, `BetRampTests`, `BetSpreadDrillTests`                                          | `DrillMode.betSpread`, `.betting` state, `evaluateBetSpread`, `CountingPrefs.betRamp`, the bet answer form, feedback/Settings/Progress/Home surfaces                                                                                                                     |
| Backup export/restore | `backup`             | `Engine/Backup.swift`, `Stores/BackupStore.swift`, `BackupSection.swift`, `BackupTests`                                       | `AppModel.restoreBackup`, the `ReloadableStore` protocol + every conformance, `StatsCloudSync.pushAll`, Settings section                                                                                                                                                 |
| Showdown table        | `showdown`           | 6 screen files, `PlayCoachView`, `CountCheckView`, `Engine/Showdown.swift`, `Engine/Bankroll.swift`, 11 test files            | `.showdown` state + entry/exit, 3 prefs fields + 3 Settings rows, `ShowdownStats`/`BankrollState` + their stores, Progress ledger/bankroll/"Showdown play" row, reset scope                                                                                              |
| Play hands out        | `play-hands-out`     | `Engine/CellContext.swift`, 4 test files                                                                                      | `playHandsOut` pref + Settings "Drills" section, `DrillHand` multi-card helpers, both drill models' continuation loops, `DrillPhase.over`, engine play-out layer (`decidePlay`/`evaluatePlay`/`resolvePlayDecision`/`PlayInput`/`PlayedOutHand`/`PlayDeviationDecision`) |
| About screen          | `about`              | `Views/AboutView.swift`                                                                                                       | Settings link replaced by a "Licenses" link (see Conflict 1)                                                                                                                                                                                                             |

## Conflict resolutions

**Conflict 1 — LGPL attribution keeps shipping.**
The LGPL-licensed card artwork is still used everywhere (every drill and the chart render `CardImage` from the asset catalog), so the attribution obligation stands.
A new minimal `Views/LicensesView.swift` carries the card-artwork LGPL attribution, the MIT notice, and the bundled licence-text viewer, reachable from Settings → Licenses; only About's marketing header was archived.
Verified in the built device bundle: `AUTHORS.txt`, `COPYING.txt`, `COPYING.LESSER.txt` are present, and the screen renders (screen-walk probe).

**Conflict 2 — no shared codec; all of backup archived.**
`Engine/Backup.swift` is whole-namespace file export/restore only; `CloudKeyValueStore`/`StatsCloudSync` and each store encode their own per-key JSON and never touch the backup types (verified by reading both files and by `rg` over all call sites).
So `Backup.swift`, `BackupStore.swift`, `BackupSection.swift`, and `AppModel.restoreBackup` were all archived, and iCloud sync was left untouched end to end — `CloudSyncTests` still passes, including a new test pinning that unknown (archived-feature) keys arriving from another device's cloud data are ignored rather than erroring.
Two things died with the restore path: the `ReloadableStore` protocol (its only caller) and `StatsCloudSync.pushAll()` (restore-only), both noted in `RESTORE.md`.

**Other conflict rules, as applied.**
Rule 3: the showdown's four stores are no longer constructed or written; their persisted data stays on disk untouched (`blackjack-showdown-stats`, `-showdown-play-stats`, `-showdown-bankroll`, and the bet-spread key below).
Rule 4: the bet-sizing Progress row was removed entirely, and `BetRampEditor` + its Settings entry archived.
Rule 5: the live-shoe drill already completed into the standard Done screen via its own target logic; the trim removed the "Play a hand vs the dealer" affordance, the `.showdown` state, and the cut-card "no hand to play" notice, so the flow now ends only at `FlowDoneView` and records to the same history/stats as every drill (covered by `CardCountingFlowModelTests`).
Rule 6: all 58 systems remain selectable; unbalanced systems drop to running count (`allows` + the prefs-merge clamp + `CountingModel.changeSystem`); `counting-systems.json` keeps the key-count figures and the chart's count tab still prints the IRC/key-count/pivot/insurance rows.
Rule 7: the Hi-Lo mismatch advisory still fires in the Deviations drill, the deviation chart tab, and the Deviations settings section (untouched; `DeviationsDrillModelTests` covers it).
Rule 8: both drills ask one graded decision per deal; double, split and surrender remain valid opening answers and grading is unchanged (`evaluate` untouched, `BasicStrategyParityTests`/`DeviationParityTests` green).
Rule 9: the widget target is gone from `xcodebuild -list`; the App Group entitlement was removed from the app (nothing else used it — iCloud KVS uses its own `ubiquity-kvstore-identifier`).
Rule 10: no `UserNotifications` usage, no notification Info.plist keys, no background modes remain; a source sweep for every permission-prompting API (`requestAuthorization`, location, camera, photos, tracking) finds none, and the generated Info.plist carries no usage-description keys — the app requests no runtime permissions.

## Kept features that were trimmed

- Progress: keeps week bars, accuracy/pace trends, the per-drill table (Basic Strategy, Deviations, Running count, True count, Deck estimate), count drift, weak spots, and the review-round entry; lost the deck-speed, key-count, bet-spread and "Showdown play" rows, the showdown ledger card, and the bankroll line.
- Settings: keeps daily goal, appearance, table rules, Deviations config, counting config (system, running/true mode, pacing, decks source, live-shoe decks/penetration), reset practice data, and the new Licenses entry; lost the Drills (play-hands-out) section, the deck-speed/key-count/bet-spread mode options, the bet-ramp editor, the three showdown rows, the Backup section, and the Reminders link.
- Reset practice data: now clears the five kept stat stores, practice history, weak spots, and count drift; chips/bankroll and the archived stores are out of scope, and the confirmation copy no longer mentions them.
- Flow home: unchanged in shape (goal ring, streak strip, Continue, three trainer cards); the counting card's accuracy chip now sums only running count, true count and deck estimate.
- Strategy chart: all three tabs remain and every cell/deviation row still drills into a live trainer (`ChartView` routes only to `basicStrategy`/`deviations`).
- Stats recording: deck-speed, key-count, bet-spread and showdown results are no longer recorded; everything else records as before.
- iCloud sync: the synced payload shrank to the nine kept keys (five stat stores + prefs, history, miss tally, count drift), far under the 1 MB / 1024-key KVS limits; unknown keys from a fuller device are ignored by construction (adoption iterates this build's stores) and now by test.
- Counting flow: `CountingModel` lost its injectable clock and the archived states; its drill states are idle → streaming → (estimating) → answering → feedback.

## User-visible behaviour changes

- Both hand drills ask exactly one graded decision per deal; a correct hit no longer deals the next card, and a correct split no longer plays the hands out.
- The live-shoe counting session never chains into a table; it ends on the ordinary Done screen.
- The counting drill offers two modes (running count, true count) instead of five.
- No backup export/restore, no home-screen widget, no practice reminders, and no permission prompt of any kind.
- Settings and Progress are smaller as listed above; About is replaced by a Licenses screen.
- Previously stored data for archived features stays on disk and is ignored; stored prefs naming an archived mode fall back to running count.

## Frameworks and entitlements removed

- Framework imports removed from the app: `WidgetKit`, `UserNotifications`, `UniformTypeIdentifiers` (there were no explicit framework build-phase entries; XcodeGen links by import).
- Remaining imports: SwiftUI, Foundation, Observation, UIKit, GameController (hardware-keyboard detection).
- Entitlements: `com.apple.security.application-groups` removed from the app; the widget's entitlements file left with its target.
- `com.apple.developer.ubiquity-kvstore-identifier` (iCloud KVS) **stays** — declared but unprovisioned, provisioning is on you.
- Info.plist: nothing to remove — the generated plist never carried notification, document-picker/browser, URL-type or activity keys (verified in the built product).
- Xcode targets: `BlackjackWidget` deleted; `xcodebuild -list` now shows `BlackjackTrainer` and `BlackjackTrainerTests` only.

## Tests

Deleted (moved to `archived/` with their features): `RemindersTests`, `WidgetSnapshotTests`, `DeckSpeedTests`, `BetRampTests`, `BetSpreadDrillTests`, `BackupTests`, `BankrollTests`, the ten `Showdown*Tests`, `BasicStrategyPlayTests`, `BasicStrategySplitTests`, `DeviationsSplitTests`, `PlayDeviationParityTests`.
Trimmed in place (archived-mode cases only): `CountingParityTests` (key-count/bet-ramp vector sections), `CountingDrillTests`, `CountingModelTests`, `CardCountingFlowModelTests`, `CloudSyncTests`, `StatsStoreTests`, `FlowPrefsStoreTests`, `DrillHandTests`, `BasicStrategyDrillModelTests`, `DeviationsDrillModelTests`, `PinnedHandTests`, `AppModelTests`, `HomeHelpersTests`, `ProgressSummaryTests`, plus the shared fixtures.
Kept intact for the kept engines: `BasicStrategyParityTests` (golden basic-strategy vectors), `DeviationParityTests` (deviation vectors, minus its two `evaluatePlay` cases), the counting parity sweep over all 58 systems, `CountReferenceTests`, `CountingSystemMetricsTests`, `CardHandTests`, and the store/UI suites.
Added: a `CloudSyncTests` case pinning unknown-cloud-key tolerance, and a `FlowPrefsStoreTests` case pinning that archived mode raw values degrade to running count.
All `ios/Fixtures/*.json` stay committed — the web CI anti-drift check regenerates them from the untouched web engines — so `showdown-vectors.json`, `play-deviation-vectors.json`, and the key-count/bet-ramp sections of `counting-vectors.json` are now unconsumed test resources.

## iOS/web divergence introduced

- The web app keeps all nine archived features; the iOS app no longer mirrors them (noted in `README.md`, which was updated only where it described the iOS app).
- The backup file no longer bridges profiles between web and phone (web still exports/imports it; iOS cannot read or write one).
- `blackjack-flow-prefs` written by iOS no longer contains `playHandsOut`, `counting.betRamp`, or the three `counting.showdown*` fields; both platforms' tolerant merges make the shapes interoperable in either direction.
- iOS `DrillMode`, drill loops, and `FlowStageView` diverge from their web counterparts (one decision per deal, two counting modes); the kept engine surfaces remain byte-parity with the web via the fixtures.
- `Engine/Hand.swift`'s N-card evaluator is retained (kept engine math, covered by `CardHandTests`) though the app no longer calls it.

## Verification

- `xcodebuild -list`: widget target gone, nothing else lost.
- Clean build for a device destination (`generic/platform=iOS`): succeeded with zero warnings introduced (the only emitted warning is the environmental `appintentsmetadataprocessor` note that predates the trim).
- Full test suite: 325 tests in 37 suites, all passing on the iPhone 16 Pro simulator.
- `archived/` has zero references in the generated project and contributes nothing to the built product (no `PlugIns/`, no archived sources in any build phase).
- Screen walk: a throwaway ImageRenderer probe rendered Home, Settings, Progress, all three chart tabs, Licenses (+ a licence text), all three drills, and the Done screen without a dangling reference; every navigation target routes to a live destination (verified in source).
- No runtime permissions: no permission-requesting API remains in the target and the built Info.plist carries no usage-description, notification, document, URL-type or background-mode keys.
- Licence texts present in the built bundle and reachable via Settings → Licenses.
- swiftformat and swiftlint clean.

## Commits

- `archive the nine cut features out of the iOS project` — Phase 1: the `git mv`s, `project.yml`, entitlements, regenerated project, `archived/RESTORE.md`.
- `trim the kept iOS surfaces and tests to the v1 feature set` — Phases 2–3 (and the test edits those forced): conflict rules and kept-feature trims.
- `update the docs for the trimmed v1 iOS build` — Phase 4: `README.md`, `docs/app-store-submission.md`, this report.
- Phase 0 produced no tree changes (tag + branch only); the archive moves do not compile without the shared-file edits, so Phases 2 and 3 share one commit.

## Still on me

- Provision the **iCloud Key-Value Store** capability for the App ID `com.arthurzhang.blackjacktrainer.app` and sign with a matching profile; the entitlement is declared but inert until then (the widget App Group is no longer needed).
- **Re-answer the age-rating questionnaire** from the re-derived section in `docs/app-store-submission.md`: the simulated-wagering surface (chips, bankroll, bet sizing, settled hands) is gone, but the app still depicts casino blackjack and teaches card counting — answer Simulated Gambling honestly against Apple's current wording rather than carrying the old 17+ answer forward, and re-take the App Store screenshots from the trimmed build.
