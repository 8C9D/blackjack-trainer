# Feature audit

Scope: the App Store build, i.e. the iOS target under `ios/`.
The Angular web app ships the same trainers; web-only items are at the end.

## Original purpose

Built as a browser drill for blackjack basic strategy: deal a hand, grade the action against a published H17/S17 chart, keep a running accuracy tally (first commits `611ea9d`, `499204e`, `d34a6ec`).
A "v2" arc then added card counting on the same loop, and `ios/` is a native mirror of that app.
In one line: put a blackjack decision on screen, say instantly whether it was right, and remember how you are doing.

## At a glance

4 core, 17 add-on, 4 nice-to-have.
No accounts, no payments, no ads, no analytics, no network calls anywhere in the iOS target.

## Core

### Basic Strategy drill

- What: deals a hand and grades hit/stand/double/split/surrender/insurance against the chart.
- Where: `ios/BlackjackTrainer/Views/Flow/BasicStrategyDrillView.swift`, `BasicStrategyDrillModel.swift`, `ios/BlackjackTrainer/Engine/BasicStrategyEngine.swift`.
- Why this category: it is the thing the repo was started to build.
- If removed: nothing is left of the original job; the chart screen and showdown grading survive but have no drill.
- [ ] Keep [ ] Cut [ ] Undecided

### Running-count drill

- What: streams cards at a set pace and asks for the running count.
- Where: `ios/BlackjackTrainer/Views/Flow/CardCountingFlowView.swift`, `ios/BlackjackTrainer/Views/Screens/CountingModel.swift`, `ios/BlackjackTrainer/Engine/CountingEngine.swift`.
- Why this category: the second half of the stated purpose, and the host screen for every other counting mode.
- If removed: true count, key count, bet spread, deck speed and the showdown all lose their entry point.
- [ ] Keep [ ] Cut [ ] Undecided

### Instant grading loop

- What: a correct answer flashes and auto-advances; a miss pauses with the right play and a reason.
- Where: `ios/BlackjackTrainer/Views/Flow/FlowStageView.swift`, `FlowRouter.swift` (`DrillPhase`).
- Why this category: "say instantly whether it was right" is the loop itself.
- If removed: every drill becomes an untimed quiz with no feedback beat.
- [ ] Keep [ ] Cut [ ] Undecided

### Persistent accuracy stats

- What: per-drill attempts, correct, best run, kept across launches.
- Where: `ios/BlackjackTrainer/Stores/StatsStore.swift`, `StatsModels.swift`.
- Why this category: "remember how you are doing" was in the first four commits.
- If removed: home accuracy chips, Progress, the widget, backup and iCloud all lose their content.
- [ ] Keep [ ] Cut [ ] Undecided

## Add-ons

### Practice reminders

- What: one optional daily local notification at a chosen time.
- Where: `ios/BlackjackTrainer/Notifications/`, `ios/BlackjackTrainer/Views/Screens/RemindersView.swift`.
- Why this category: nudges you to practise; drills work untouched without it.
- If removed: one Settings row disappears; nothing else references it.
- Flags: the app's only permission prompt.
- [ ] Keep [ ] Cut [ ] Undecided

### Home-screen widget

- What: a small/medium widget mirroring the daily-goal ring and streak.
- Where: `ios/BlackjackWidget/`, `ios/Shared/WidgetSnapshot.swift`, `ios/BlackjackTrainer/Stores/WidgetSnapshotPublisher.swift`.
- Why this category: a second view of numbers the app already shows.
- If removed: one target and one publisher go; the app is unaffected.
- Flags: needs the App Group provisioned or it shows empty data on device; duplicates the home screen.
- [ ] Keep [ ] Cut [ ] Undecided

### Deck speed mode

- What: self-paced countdown of 51 cards against a stopwatch, with a personal best.
- Where: `ios/BlackjackTrainer/Engine/DeckSpeed.swift`, `CardCountingFlowView.swift`.
- Why this category: a variant pacing of the counting drill.
- If removed: one Settings mode and one Progress row go.
- [ ] Keep [ ] Cut [ ] Undecided

### Key count mode

- What: for unbalanced systems, call whether the count has reached the published key count.
- Where: `ios/BlackjackTrainer/Views/Screens/AdvantageCallView.swift`, `ios/BlackjackTrainer/Engine/CountingSystem.swift`.
- Why this category: only reachable for a minority of the 58 systems.
- If removed: unbalanced systems drop to running count only.
- [ ] Keep [ ] Cut [ ] Undecided

### Bet spread mode

- What: after the true count, name the bet in units, graded against an editable ramp.
- Where: `ios/BlackjackTrainer/Engine/BetRamp.swift`, `ios/BlackjackTrainer/Views/Flow/BetRampEditor.swift`.
- Why this category: bet sizing sits beyond the count the app was built to teach.
- If removed: the showdown's bet sizing still writes the same store, so the Progress row stays half-fed.
- Flags: overlaps the showdown's bankroll betting; both grade a bet against the count.
- [ ] Keep [ ] Cut [ ] Undecided

### iCloud sync

- What: mirrors every store to iCloud key-value storage across a user's devices.
- Where: `ios/BlackjackTrainer/Stores/CloudKeyValueStore.swift`, `ios/BlackjackTrainer/BlackjackTrainer.entitlements`.
- Why this category: convenience over a local-only trainer.
- If removed: stats stay on one device; nothing else changes.
- Flags: entitlement is declared but the capability is not yet provisioned, so it is currently inert.
- [ ] Keep [ ] Cut [ ] Undecided

### Backup export and restore

- What: writes the whole profile to a JSON file and restores it, format-compatible with the web app.
- Where: `ios/BlackjackTrainer/Views/Flow/BackupSection.swift`, `ios/BlackjackTrainer/Engine/Backup.swift`, `Stores/BackupStore.swift`.
- Why this category: portability, not practice.
- If removed: `AppModel.restoreBackup` and every store's reload path go unused.
- Flags: uses the document picker; the only file I/O in the app.
- [ ] Keep [ ] Cut [ ] Undecided

### Counting system library (58 systems)

- What: pick among 58 tag sets, each with published betting, playing and insurance figures.
- Where: `ios/Fixtures/counting-systems.json`, `ios/BlackjackTrainer/Engine/CountingSystem.swift`.
- Why this category: one system would train the same skill.
- If removed: Settings simplifies, the chart's count tab loses its subject, key count loses its trigger.
- Flags: the deviation indices are Hi-Lo only, so 57 of the 58 raise a standing mismatch advisory.
- [ ] Keep [ ] Cut [ ] Undecided

### Strategy chart reference

- What: read-only basic, deviation and count-tag grids rendered from the live engine; tap a cell to drill that hand.
- Where: `ios/BlackjackTrainer/Views/Flow/ChartView.swift`, `Engine/StrategyChartGrid.swift`, `Views/Flow/CountReferenceView.swift`.
- Why this category: a lookup surface beside the drill, not the drill.
- If removed: pinned single-hand rounds lose their only entry point.
- [ ] Keep [ ] Cut [ ] Undecided

### Progress screen

- What: week bars, accuracy and pace trends, a per-drill table, count drift, the showdown ledger and weak spots.
- Where: `ios/BlackjackTrainer/Views/Flow/PracticeProgressView.swift`, `ios/BlackjackTrainer/Flow/ProgressSummary.swift`, `Stores/CountDrift.swift`.
- Why this category: reporting on the loop, not the loop.
- If removed: review rounds lose their only entry point; count drift is recorded and never shown.
- Flags: its trainer table duplicates the home accuracy chips.
- [ ] Keep [ ] Cut [ ] Undecided

### Showdown table

- What: after a live-shoe count, play 1-3 boxes against the dealer, optionally with chips and insurance, then answer the count on the way out.
- Where: `ios/BlackjackTrainer/Views/Screens/ShowdownView.swift`, `ShowdownModel*.swift`, `Engine/Showdown.swift`, `Engine/Bankroll.swift`.
- Why this category: a simulated table built on top of the drills, reachable only from one mode.
- If removed: four stores stop being written and their Progress rows sit empty.
- Flags: the chips and bankroll are the app's simulated-gambling surface, which `docs/app-store-submission.md` already expects to drive a 17+ rating; its count check and bet sizing overlap the running-count and bet-spread drills.
- [ ] Keep [ ] Cut [ ] Undecided

### Deviations drill

- What: hands graded against Hi-Lo index deviations plus an insurance overlay, with random or manual true counts.
- Where: `ios/BlackjackTrainer/Views/Flow/DeviationsDrillView.swift`, `DeviationsDrillModel.swift`, `Engine/DeviationEngine.swift`.
- Why this category: it extends basic strategy rather than replacing it, and arrived long after the original build.
- If removed: a trainer card, a chart tab, a Settings section and a weak-spot group all go; the showdown keeps the engine for insurance.
- [ ] Keep [ ] Cut [ ] Undecided

### Play hands out

- What: a hit deals the next card and asks again; a split plays every hand through, re-splitting to four.
- Where: `ios/BlackjackTrainer/Flow/DrillHand.swift`, Settings "Drills" section.
- Why this category: deepens both hand drills; the opening decision is still the graded question.
- If removed: both drills fall back to one decision per deal, which is how they originally worked.
- [ ] Keep [ ] Cut [ ] Undecided

### True count, live shoe and deck estimate

- What: answer the true count, with decks remaining from a preset or estimated off a real depleting shoe.
- Where: `ios/BlackjackTrainer/Engine/Shoe.swift`, `ShoeFactory.swift`, `Views/Screens/DeckEstimateView.swift`.
- Why this category: a second question on top of the running count.
- If removed: bet spread, the deck estimate and the entire showdown become unreachable.
- Flags: two competing sources for decks remaining (preset vs live shoe).
- [ ] Keep [ ] Cut [ ] Undecided

### Table rules

- What: S17/H17, double after split, late surrender.
- Where: `ios/BlackjackTrainer/Views/Flow/SettingsView.swift`, `Stores/FlowPrefs.swift`.
- Why this category: a fixed chart would still train the same skill.
- If removed: both hand drills, the chart, the deviation grid and the showdown dealer all need a hard-coded rule set.
- [ ] Keep [ ] Cut [ ] Undecided

### Weak spots and review rounds

- What: tallies missed scenarios, mixes them back in, retires them after three clean answers, and offers a misses-only round.
- Where: `ios/BlackjackTrainer/Stores/MissTally.swift`.
- Why this category: adaptive practice on top of a loop that works without it.
- If removed: Progress, the chart's miss shading, the Done screen and both drills lose a path each.
- [ ] Keep [ ] Cut [ ] Undecided

### Daily goal, streak and Flow home

- What: the launch screen: one Continue button, a goal ring, a 7-day streak strip, and a session Done screen.
- Where: `ios/BlackjackTrainer/Views/Flow/HomeView.swift`, `GoalRingView.swift`, `StreakDotsView.swift`, `FlowDoneView.swift`, `Stores/PracticeHistory.swift`.
- Why this category: habit scaffolding around the drills, added in the Flow redesign.
- If removed: the app needs a new root screen, every drill loses its session target, and the widget has nothing to show.
- [ ] Keep [ ] Cut [ ] Undecided

## Nice-to-have

### About and licenses

- What: app description plus the bundled LGPL and MIT license texts.
- Where: `ios/BlackjackTrainer/Views/AboutView.swift`, `Resources/Licenses/`.
- Why this category: no effect on practice.
- If removed: the card artwork's LGPL attribution loses its only home.
- Flags: attribution is a licence obligation, not a preference.
- [ ] Keep [ ] Cut [ ] Undecided

### Appearance theme

- What: system, light or dark.
- Where: Settings "Appearance", `ios/BlackjackTrainer/App/Theme.swift`.
- Why this category: cosmetic.
- If removed: the app follows the system appearance only.
- [ ] Keep [ ] Cut [ ] Undecided

### Hardware keyboard hints

- What: key-hint chips shown only when a keyboard is attached; the shortcuts are always live.
- Where: `ios/BlackjackTrainer/Views/Components/HardwareKeyboard.swift`, `Engine/Keyboard.swift`.
- Why this category: convenience for iPad users.
- If removed: shortcuts keep working, unlabelled.
- [ ] Keep [ ] Cut [ ] Undecided

### Reset practice data

- What: one confirmed action clearing every stat, history, weak spot and chip balance, leaving settings alone.
- Where: `ios/BlackjackTrainer/Views/Flow/PracticeDataSection.swift`.
- Why this category: housekeeping; a restore from backup covers the same ground.
- If removed: nothing depends on it.
- [ ] Keep [ ] Cut [ ] Undecided

## Self-contained

Practice reminders.
Home-screen widget.
Deck speed mode.
Key count mode.
iCloud sync.
Backup export and restore.
Appearance theme.
Hardware keyboard hints.
Reset practice data.
About and licenses.

## Needs a decision from me

- Deviations drill: I filed it as an add-on because the first commits are basic strategy only, but the README markets four equal trainers. Is v1.0's pitch "basic strategy and counting" or "four trainers"?
- Showdown chips and bankroll: is the simulated-gambling age rating acceptable for v1.0, or should the table ship without bet sizing?
- iCloud sync and the widget: both entitlements are declared but unprovisioned. Will you provision the App ID capabilities before submitting, or ship v1.0 without them?
- 58 counting systems: the deviation indices only exist for Hi-Lo. Keep the full library with the mismatch advisory, or cut to the systems the rest of the app can actually support?

## Web-only (not in the App Store build)

- Installable PWA with an offline service worker (`ngsw-config.json`).
- `?seed=<n>` deterministic replay of every draw, used by the Playwright suite.
- URL-addressable drills and deep links (`/drill/deviations?review=1`, `?hand=hard-16-v-10`); iOS has the same states, reached through the router rather than a URL.
- No widget, no local notifications, no iCloud sync on web; the shared backup file is the bridge between the two.
