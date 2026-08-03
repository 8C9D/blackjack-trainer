import SwiftUI

/// The one home for every pre-made decision: daily goal, table rules, the
/// Deviations config, and the full Card Counting drill config. Drill screens never
/// show any of this. Mirrors the web `settings-page` component.
struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(FlowRouter.self) private var router

    private var prefs: FlowPrefs {
        model.flowPrefs.prefs
    }

    private var selectedSystem: CountingSystem? {
        model.countingSystems.first { $0.id == prefs.counting.systemId }
    }

    private var trueCountAvailable: Bool {
        selectedSystem?.balanced ?? false
    }

    private var keyCountAvailable: Bool {
        selectedSystem?.allows(.keyCount) ?? false
    }

    /// Drives the shoe pickers and showdown settings.
    private var usesLiveShoe: Bool {
        prefs.counting.mode.usesLiveShoe(source: prefs.counting.trueCountSource)
    }

    private var countingErrors: [String] {
        model.counting.validateSettings(prefs.counting.drillSettings).errors
    }

    var body: some View {
        NavigationStack {
            Form {
                dailyGoalSection
                appearanceSection
                tableRulesSection
                DeviationsSection()
                countingSection
                BackupSection()
                PracticeDataSection()
                aboutSection
            }
            .scrollContentBackground(.hidden)
            .background(Theme.ground.ignoresSafeArea())
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { router.goHome() }
                        .tint(Theme.accentInk)
                }
            }
        }
    }

    // MARK: Daily goal

    private var dailyGoalSection: some View {
        Section("Daily goal") {
            Stepper(
                "Hands per day: \(prefs.dailyGoal)",
                value: intBinding(
                    get: { prefs.dailyGoal },
                    set: { model.flowPrefs.setDailyGoal(Double($0)) }
                ),
                in: FlowPrefsConstants.minDailyGoal ... FlowPrefsConstants.maxDailyGoal
            )
        }
    }

    // MARK: Appearance

    private var appearanceSection: some View {
        Section("Appearance") {
            Picker("Theme", selection: themeBinding) {
                ForEach(ThemePref.allCases, id: \.self) { theme in
                    Text(theme.label).tag(theme)
                }
            }
            .pickerStyle(.segmented)
        }
    }

    // MARK: Table rules

    private var tableRulesSection: some View {
        Section("Table rules") {
            Picker("Dealer", selection: ruleSetBinding) {
                Text("S17 — stands on soft 17").tag(RuleSet.s17)
                Text("H17 — hits on soft 17").tag(RuleSet.h17)
            }
            Toggle("Double After Split (DAS)", isOn: doubleAfterSplitBinding)
            Toggle("Late Surrender", isOn: lateSurrenderBinding)
        }
    }

    // MARK: Card counting

    private var countingSection: some View {
        Section("Card counting") {
            Picker("System", selection: systemBinding) {
                ForEach(model.countingSystems, id: \.id) { system in
                    Text(system.name).tag(system.id)
                }
            }

            if trueCountAvailable {
                // Four modes no longer fit a segmented control on a phone, so
                // this one is a menu picker like the shoe settings below it.
                Picker("Mode", selection: modeBinding) {
                    Text(DrillMode.runningCount.label).tag(DrillMode.runningCount)
                    Text(DrillMode.trueCount.label).tag(DrillMode.trueCount)
                    Text(DrillMode.betSpread.label).tag(DrillMode.betSpread)
                    Text(DrillMode.deckSpeed.label).tag(DrillMode.deckSpeed)
                }
            } else if keyCountAvailable {
                Picker("Mode", selection: modeBinding) {
                    Text(DrillMode.runningCount.label).tag(DrillMode.runningCount)
                    Text(DrillMode.keyCount.label).tag(DrillMode.keyCount)
                    Text(DrillMode.deckSpeed.label).tag(DrillMode.deckSpeed)
                }
                Text(
                    "This system is unbalanced, so there is no true count. Its published "
                        + "schedule is drilled instead: the shoe starts at the IRC and you "
                        + "call whether the running count has reached the key count."
                )
                .font(.footnote)
                .foregroundStyle(Theme.muted)
            } else {
                Picker("Mode", selection: modeBinding) {
                    Text(DrillMode.runningCount.label).tag(DrillMode.runningCount)
                    Text(DrillMode.deckSpeed.label).tag(DrillMode.deckSpeed)
                }
                Text("True count is only trained for balanced systems.")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }

            if prefs.counting.mode == .deckSpeed {
                Text(
                    "A shuffled deck with one card burned: you flip the other 51 at your own "
                        + "pace, against a stopwatch, then give the count. The length and pacing "
                        + "settings do not apply — the deck is the deck, and the speed is what "
                        + "is being measured."
                )
                .font(.footnote)
                .foregroundStyle(Theme.muted)
            } else {
                countingPacingFields
            }

            if prefs.counting.mode == .betSpread {
                BetRampEditor()
            }

            if prefs.counting.mode.asksTrueCount {
                Picker("Decks source", selection: countingSourceBinding) {
                    Text("Live shoe").tag(TrueCountSource.liveShoe)
                    Text("Classic (preset)").tag(TrueCountSource.classic)
                }
                .pickerStyle(.segmented)

                if prefs.counting.trueCountSource == .classic {
                    Picker("Decks remaining", selection: decksRemainingBinding) {
                        ForEach(CountingConstants.decksRemainingPresets, id: \.self) { preset in
                            Text(CountFormat.decks(preset)).tag(preset)
                        }
                    }
                }
            }
            if usesLiveShoe {
                Picker("Number of decks", selection: numberOfDecksBinding) {
                    ForEach(ShoeConstants.deckOptions, id: \.self) { decks in
                        Text("\(decks)").tag(decks)
                    }
                }
                Picker("Penetration", selection: penetrationBinding) {
                    ForEach(ShoeConstants.penetrationPresets, id: \.self) { value in
                        Text("\(Int((value * 100).rounded()))%").tag(value)
                    }
                }
                Picker("Showdown hands", selection: showdownSpotsBinding) {
                    ForEach(Showdown.showdownSpotOptions, id: \.self) { spots in
                        Text("\(spots)").tag(spots)
                    }
                }
                Toggle("Bet sizing (bankroll)", isOn: showdownBettingBinding)
            }

            ForEach(countingErrors, id: \.self) { error in
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(Theme.bad)
            }
        }
    }

    /// Drill length and pacing — every mode but deck speed, which sets neither.
    @ViewBuilder private var countingPacingFields: some View {
        Stepper(
            "Cards per drill: \(prefs.counting.numberOfCards)",
            value: intBinding(
                get: { prefs.counting.numberOfCards },
                set: { value in model.flowPrefs.updateCounting { $0.numberOfCards = value } }
            ),
            in: 1 ... CountingConstants.maxCardsPerDrill
        )
        Stepper(
            "Time between cards: \(prefs.counting.millisecondsBetweenCards) ms",
            value: intBinding(
                get: { prefs.counting.millisecondsBetweenCards },
                set: { value in
                    model.flowPrefs.updateCounting { $0.millisecondsBetweenCards = value }
                }
            ),
            in: CountingConstants.minMillisecondsBetweenCards ... 5000,
            step: 100
        )
    }

    // MARK: Notifications & about

    private var aboutSection: some View {
        Section {
            NavigationLink("Practice reminders") { RemindersView() }
            NavigationLink("About & licenses") { AboutView() }
        }
    }
}

// MARK: - Bindings

/// The prefs bindings, kept out of the view struct so the screen body stays
/// readable (and under the type-body length limit).
extension SettingsView {
    private func intBinding(get: @escaping () -> Int,
                            set: @escaping (Int) -> Void) -> Binding<Int> {
        Binding(get: get, set: set)
    }

    private var ruleSetBinding: Binding<RuleSet> {
        Binding(get: { prefs.ruleSet }, set: { model.flowPrefs.setRuleSet($0) })
    }

    private var doubleAfterSplitBinding: Binding<Bool> {
        Binding(
            get: { prefs.options.doubleAfterSplit },
            set: { value in
                model.flowPrefs.setOptions(
                    EngineOptions(
                        doubleAfterSplit: value,
                        lateSurrender: prefs.options.lateSurrender
                    )
                )
            }
        )
    }

    private var lateSurrenderBinding: Binding<Bool> {
        Binding(
            get: { prefs.options.lateSurrender },
            set: { value in
                model.flowPrefs.setOptions(
                    EngineOptions(
                        doubleAfterSplit: prefs.options.doubleAfterSplit,
                        lateSurrender: value
                    )
                )
            }
        )
    }

    private var systemBinding: Binding<String> {
        Binding(
            get: { prefs.counting.systemId },
            set: { id in
                model.flowPrefs.updateCounting { $0.systemId = id }
                // Coerce a mode the new system cannot host back so the drill
                // never starts impossible.
                let system = model.countingSystems.first { $0.id == id }
                if let system, !system.allows(prefs.counting.mode) {
                    model.flowPrefs.updateCounting { $0.mode = .runningCount }
                }
            }
        )
    }

    private var modeBinding: Binding<DrillMode> {
        Binding(
            get: { prefs.counting.mode },
            set: { value in model.flowPrefs.updateCounting { $0.mode = value } }
        )
    }

    private var countingSourceBinding: Binding<TrueCountSource> {
        Binding(
            get: { prefs.counting.trueCountSource },
            set: { value in model.flowPrefs.updateCounting { $0.trueCountSource = value } }
        )
    }

    private var decksRemainingBinding: Binding<Double> {
        Binding(
            get: { prefs.counting.decksRemaining },
            set: { value in model.flowPrefs.updateCounting { $0.decksRemaining = value } }
        )
    }

    private var numberOfDecksBinding: Binding<Int> {
        Binding(
            get: { prefs.counting.numberOfDecks },
            set: { value in model.flowPrefs.updateCounting { $0.numberOfDecks = value } }
        )
    }

    private var penetrationBinding: Binding<Double> {
        Binding(
            get: { prefs.counting.penetration },
            set: { value in model.flowPrefs.updateCounting { $0.penetration = value } }
        )
    }

    private var themeBinding: Binding<ThemePref> {
        Binding(
            get: { prefs.theme },
            set: { value in model.flowPrefs.setTheme(value) }
        )
    }

    private var showdownSpotsBinding: Binding<Int> {
        Binding(
            get: { prefs.counting.showdownSpots },
            set: { value in
                model.flowPrefs.updateCounting { $0.showdownSpots = Showdown.clampSpots(value) }
            }
        )
    }

    private var showdownBettingBinding: Binding<Bool> {
        Binding(
            get: { prefs.counting.showdownBetting },
            set: { value in
                model.flowPrefs.updateCounting { $0.showdownBetting = value }
            }
        )
    }
}
