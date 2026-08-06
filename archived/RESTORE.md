# Restoring an archived feature

Every feature below was archived from the iOS target in the v1.0 scope trim.
The authoritative full-featured tree is the git tag `pre-trim-full-featureset` (also the branch `archive/full-featureset`); wholly-owned files were moved here with their original path preserved under each feature's slug, and code that lived inside shared files was deleted in place and exists only in that tag.
The Xcode project is generated: after moving any file back, edit `ios/project.yml` if targets change and run `cd ios && xcodegen generate`.
The Angular web app still ships every one of these features, so the web implementation is a living reference for behaviour.

General notes that apply to several features:

- `DrillMode` was trimmed to `runningCount`/`trueCount`; restoring key count, bet spread, or deck speed means re-adding its enum case, `CountingSystem.allows`, the Settings mode picker entry, and the clamp in `FlowPrefs+Persistence.mergedCounting`.
- `CountingDrillResult` was trimmed to `.running`/`.trueCount`; the archived modes' result types and `CountingEngine.evaluateKeyCount`/`evaluateBetSpread`/`evaluateDeckSpeed` are in the tag (`ios/BlackjackTrainer/Engine/CardCounting.swift`, `CountingEngine.swift`).
- `AppModel` no longer builds the archived stores; each restore re-adds its store property, the `StatsCloudSync` list entry, and (if practice data) the `resetPracticeData` entry.
- Stored data was never deleted: every orphaned `UserDefaults`/iCloud KVS key listed below still holds whatever the user had, and the current build ignores unknown keys.
- The parity fixtures were NOT stripped: `ios/Fixtures/showdown-vectors.json`, `play-deviation-vectors.json`, and the `keyCountCases`/`betRampCases` sections of `counting-vectors.json` are committed but unconsumed (the web exporter's anti-drift CI check requires them).

## practice-reminders

- Files here: `ios/BlackjackTrainer/Notifications/NotificationCoordinator.swift`, `PracticeReminders.swift`, `RemindersModel.swift`, `ios/BlackjackTrainer/Views/Screens/RemindersView.swift`, `ios/BlackjackTrainerTests/RemindersTests.swift`.
- In-place deletions: `BlackjackTrainerApp` dropped the `UserNotifications` import, the retained `NotificationCoordinator`, and the `UNUserNotificationCenter.current().delegate` wiring; Settings dropped the "Practice reminders" `NavigationLink` (it sat in the trailing section beside About).
- Target membership: all four app files were `BlackjackTrainer` sources; the test was a `BlackjackTrainerTests` source (membership is by directory, so moving them back restores it after `xcodegen generate`).
- Info.plist/entitlements: none existed for local notifications; the permission prompt comes back with the code.
- Orphaned store key: `blackjack-practice-reminders` (schedule + enabled flag).

## widget

- Files here: `ios/BlackjackWidget/` (the whole extension target: `BlackjackStatsWidget.swift`, `BlackjackWidgetBundle.swift`, `BlackjackWidget.entitlements`, `Info.plist`), `ios/Shared/WidgetSnapshot.swift`, `ios/BlackjackTrainer/Stores/WidgetSnapshotPublisher.swift`, `ios/BlackjackTrainerTests/WidgetSnapshotTests.swift`.
- `ios/project.yml`: the `BlackjackWidget` app-extension target was removed, along with the app target's `- target: BlackjackWidget` embed dependency and its `- path: Shared` source entry (restore all three, then regenerate).
- Entitlements: `com.apple.security.application-groups` (`group.com.arthurzhang.blackjacktrainer`) was removed from `ios/BlackjackTrainer/BlackjackTrainer.entitlements`; nothing else used the App Group (iCloud KVS does not).
- In-place deletions: `AppModel.widgetPublisher`; the `onChange` hooks on `FlowPrefsStore`, `PracticeHistoryStore`, and `SessionStatsStore` (the publisher was their only consumer — re-add the `var onChange: (() -> Void)?` and the `onChange?()` calls in `persist`/`adoptFromCloud`, see the tag).
- The App Group was never provisioned; provisioning both App IDs remains a human action.

## deck-speed

- Files here: `ios/BlackjackTrainer/Engine/DeckSpeed.swift`, `ios/BlackjackTrainerTests/DeckSpeedTests.swift`.
- In-place deletions (all in the tag): `DrillMode.deckSpeed`; `CountingModel`'s `.flipping` state, `dealBurnedDeck`, `flipNext`, `gradeDeckSpeed`, the `burnedCard`/`startedAt`/`elapsedMilliseconds` state and the injectable `now` clock; `CountingEngine.evaluateDeckSpeed`; `CountingDrillResult.deckSpeed`; `DeckSpeedBestStore` and the `DeckSpeedBest` shape (in `Stores/StatsStore.swift`); `CountFeedbackView.deckSpeedDetails`/`burnedLabel`/`deckSpeedProof`; `CardCountingFlowView`'s `deckSpeedStage` and `flipNext`; the Settings mode-picker entry and deck-speed footnote; the `HomeView` counting-accuracy term; the Progress "Deck speed" row.
- Orphaned store keys: `blackjack-deck-speed-stats`, `blackjack-deck-speed-best`.

## key-count

- Files here: `ios/BlackjackTrainer/Views/Screens/AdvantageCallView.swift`.
- In-place deletions: `DrillMode.keyCount`; `CountingModel`'s `.advantage` state, `answerAdvantage`, `pendingUserCount`, the IRC seeding in `ensureShoeForRound`, and `countResetLabel`; `CountingModel+Presentation`'s `keyCountSchedule`/`keyCountDrill`; `CountingEngine.evaluateKeyCount` and the key-count branch of `validateSettings`; `KeyCountAnswer`/`KeyCountDrillResult`; `CountFeedbackView.keyCountDetails`/`keyCountRationale`; the Settings unbalanced-system mode picker branch; the `HomeView` counting-accuracy term; the Progress "Key count call" row; `CardCountingFlowModel.advantage`.
- Deliberately kept (do not re-add): `KeyCountSchedule`/`ResolvedKeyCounts` parsing, the chart count tab's IRC/key-count/pivot/insurance rows, and the fixture's `keyCounts` data — the reference surface survived the trim.
- Orphaned store key: `blackjack-key-count-stats`.

## bet-spread

- Files here: `ios/BlackjackTrainer/Engine/BetRamp.swift`, `ios/BlackjackTrainer/Views/Flow/BetRampEditor.swift`, `ios/BlackjackTrainerTests/BetRampTests.swift`, `BetSpreadDrillTests.swift`.
- In-place deletions: `DrillMode.betSpread`; `CountingPrefs.betRamp` and `CountingDrillSettings.betRamp` (plus the `betRamp` field in the prefs JSON shape and merge); `CountingModel`'s `.betting` state and `answerBet`; `CountingEngine.evaluateBetSpread` and the ramp branch of `validateSettings`; `BetSpreadAnswer`/`BetSpreadDrillResult`; `CountAnswerView`'s `Question.bet` variant; `CountFeedbackView.betSpreadDetails`/`spread`/`estimateBetLine`; the Settings mode-picker entry and inline `BetRampEditor()` row; the `HomeView` counting-accuracy term; the Progress "Bet spread" row; `CardCountingFlowModel.bet`.
- Orphaned store key: `blackjack-bet-spread-stats`; old `blackjack-flow-prefs` payloads may still carry a `counting.betRamp` field, which the merge ignores.

## backup

- Files here: `ios/BlackjackTrainer/Engine/Backup.swift`, `ios/BlackjackTrainer/Stores/BackupStore.swift` (which also defined the `ReloadableStore` protocol), `ios/BlackjackTrainer/Views/Flow/BackupSection.swift`, `ios/BlackjackTrainerTests/BackupTests.swift`.
- Conflict 2 finding: the backup codec is NOT shared with iCloud sync — `StatsCloudSync` and each store encode their own per-key JSON — so all of it was archived and iCloud sync was left untouched (verified by `CloudSyncTests`).
- In-place deletions: `AppModel.backup`/`restoreBackup`/`reloadableStores`; the `BackupSection()` row in Settings; every store's `ReloadableStore` conformance and `reloadFromDefaults()` (`SessionStatsStore`, `FlowPrefsStore`, `PracticeHistoryStore`, `MissTallyStore`, `CountDriftStore`); `StatsCloudSync.pushAll()` (its only caller was the restore path).
- Info.plist: no document-picker or document-browser keys ever existed (SwiftUI's `fileExporter`/`fileImporter` need none), so none were dropped.
- Restoring: also restore the `UniformTypeIdentifiers` import in `BackupSection.swift` (it comes with the file).

## showdown

- Files here: `ios/BlackjackTrainer/Views/Screens/ShowdownView.swift`, `ShowdownModel.swift`, `ShowdownModel+Betting.swift`, `ShowdownModel+Grading.swift`, `ShowdownModel+Presentation.swift`, `PlayerHand.swift`; `ios/BlackjackTrainer/Views/Components/PlayCoachView.swift`, `CountCheckView.swift`; `ios/BlackjackTrainer/Engine/Showdown.swift`, `Bankroll.swift`; tests `ShowdownModelTests`, `ShowdownBetGradingTests`, `ShowdownCountCheckTests`, `ShowdownDeviationGradingTests`, `ShowdownInsuranceGradingTests`, `ShowdownInsuranceTests`, `ShowdownMultiBoxTests`, `ShowdownParityTests`, `ShowdownPlayGradingTests`, `ShowdownSurrenderTests`, `BankrollTests`.
- In-place deletions: `CountingModel`'s `.showdown` state, `showdownSpots`/`showdownBetting`/`showdownCountCheck`, `showdownStatsStore`, `enterShowdown`/`exitShowdown`, `showdownAvailable`/`shoeSpent`; `CardCountingFlowView`'s showdown wiring, the "Play a hand vs the dealer" feedback affordance, and the cut-card notice tied to it (the live-shoe drill now ends in the standard `FlowDoneView`, which it already reached via `runAgain`); `ShowdownStats`/`BankrollState` (in `Stores/StatsModels.swift`) and `ShowdownStatsStore`/`BankrollStore` (in `Stores/StatsStore.swift`); `CountingPrefs.showdownSpots`/`showdownBetting`/`showdownCountCheck` plus their JSON shape, merge, and Settings rows ("Showdown hands", "Bet sizing (bankroll)", "Ask for the count on the way out"); `AppModel.showdownStats`/`showdownPlayStats`/`showdownBankroll` and their reset entries; the Progress showdown ledger card, bankroll line, and "Showdown play" row; `ProgressSummary.signed`; the `PracticeDataSection` confirmation copy's "showdown record and chips" clause; the showdown grading path also consumed the play-out engine layer below.
- The showdown's play grading depended on the play-hands-out engine layer (`decidePlay`, `resolvePlayDecision`, `evaluatePlay`); restoring the showdown means restoring that layer too.
- Orphaned store keys (data left on disk): `blackjack-showdown-stats`, `blackjack-showdown-play-stats`, `blackjack-showdown-bankroll`; old prefs payloads may carry `counting.showdownSpots`/`showdownBetting`/`showdownCountCheck`.

## play-hands-out

- Files here: `ios/BlackjackTrainer/Engine/CellContext.swift` (wholly owned by `decidePlay`); tests `BasicStrategyPlayTests`, `BasicStrategySplitTests`, `DeviationsSplitTests`, `PlayDeviationParityTests`.
- In-place deletions (see the tag for all of them): `FlowPrefs.playHandsOut` (+ default, JSON shape, merge, `setPlayHandsOut`) and the Settings "Drills" section; `DrillHand.swift`'s `splitHandAt`, `maxSplitHands`, `SplitContext`, and the N-card `handQuestion`/`legalActionsFor` overloads (the two-card `legalActionsFor` lost its `split:` parameter); both drill models' `hands`/`activeIndex`/`splitAces`/`atDeal` state, `afterCorrect`, the draw/split/finish extensions, `handLabel`/`handOver`, and the `decidePlay`-based `gradeDecision` branch; `DrillPhase.over` and the drill views' `.over` stage line; `FlowStageView`'s multi-card sizing and `handLabel`; engine layer: `BasicStrategyEngine.decidePlay`/`evaluatePlay`, `PlayInput` (in `Strategy.swift`), `DeviationEngine.basicPlay`/`resolvePlayDecision`/`classifyPlayForDeviation`/`deviationPlay`/`deviated`, `PlayDeviationDecision` (in `Deviation.swift`), `PlayedOutHand`, and `DeviationEvaluator.evaluatePlay`.
- The opening-decision grading (`decide`/`evaluate`, the deviation overlay, insurance) was untouched; double, split and surrender are still valid opening answers.
- No store key of its own; old `blackjack-flow-prefs` payloads may carry `playHandsOut`, which the merge ignores.

## about

- Files here: `ios/BlackjackTrainer/Views/AboutView.swift`.
- The licence obligation did NOT move: `ios/BlackjackTrainer/Views/LicensesView.swift` is a new, kept screen carrying the LGPL 3.0 card-artwork attribution, the MIT notice, and the bundled licence-text viewer (`LicenseTextView` + `LicenseLoader`, both formerly in `AboutView.swift`); `Resources/Licenses/` never moved and still ships in the bundle.
- Settings: the "About & licenses" `NavigationLink` became a "Licenses" link to the new screen; restoring About means re-adding its link and deciding whether the licence sections return to it.
- Only the marketing copy (the app-description header) is actually archived.
