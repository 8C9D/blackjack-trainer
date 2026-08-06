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

    /// Drives the shoe pickers.
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
                PracticeDataSection()
                licensesSection
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

            // Which system to count is the most consequential setting here, and
            // the tags alone say nothing about what each one is for. These do.
            if let selectedSystem {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(selectedSystem.metricLabels) { metric in
                        HStack {
                            Text(metric.label)
                            Spacer(minLength: 8)
                            Text(metric.value)
                                .monospacedDigit()
                                .foregroundStyle(Theme.ink)
                        }
                    }
                    .font(.footnote)
                    .foregroundStyle(Theme.midInk)
                    Text(
                        "What this system's tags are good at: sizing the bet, indexing a "
                            + "playing decision, and calling insurance. Published figures for "
                            + "the tags alone, not a verdict on the system: a count you keep "
                            + "accurately beats a stronger one you do not."
                    )
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                    .padding(.top, 2)

                    // The figures say what the tags are for; this is where the
                    // tags themselves are. Picking among 58 systems is the
                    // moment a trainee most needs to see what one actually asks
                    // them to memorise.
                    Button("See what each card is worth") { router.go(.chart(.count)) }
                        .font(.footnote)
                        .tint(Theme.accentInk)
                        .padding(.top, 6)
                }
            }

            if trueCountAvailable {
                Picker("Mode", selection: modeBinding) {
                    Text(DrillMode.runningCount.label).tag(DrillMode.runningCount)
                    Text(DrillMode.trueCount.label).tag(DrillMode.trueCount)
                }
                .pickerStyle(.segmented)
            } else {
                Text("True count is only trained for balanced systems, so this system "
                    + "is drilled by running count.")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }

            countingPacingFields

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
            }

            ForEach(countingErrors, id: \.self) { error in
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(Theme.bad)
            }
        }
    }

    /// Drill length and pacing.
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

    // MARK: Licenses

    private var licensesSection: some View {
        Section {
            NavigationLink("Licenses") { LicensesView() }
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
}
