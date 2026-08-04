import SwiftUI

/// The chart the drills grade against, rendered rather than re-encoded: every
/// cell is the engine's own decision for a representative hand under the live
/// rule set, so the page cannot drift from what a miss is scored on. Read-only —
/// rules stay a Settings decision. Mirrors the web `chart-page` component.
struct ChartView: View {
    /// Which reference to open on. The screens that route here are asking about
    /// one of the three in particular.
    var tab: ChartMode = .basic

    @Environment(AppModel.self) private var model
    @Environment(FlowRouter.self) private var router
    @State private var mode: ChartMode = .basic

    private var prefs: FlowPrefs {
        model.flowPrefs.prefs
    }

    private var sections: [ChartSection] {
        StrategyChartGrid.sections(
            engine: model.basicStrategy,
            ruleSet: prefs.ruleSet,
            options: prefs.options,
            misses: StrategyChartGrid.missesByKey(model.missTally.weakSpots(.basicStrategy))
        )
    }

    private var deviationSections: [DeviationSection] {
        StrategyChartGrid.deviationSections(
            rules: model.charts.deviations[prefs.ruleSet.rawValue] ?? [],
            misses: StrategyChartGrid.missesByKey(model.missTally.weakSpots(.deviations))
        )
    }

    /// Named on the reference screen too, not just in the drill: reading an
    /// index off this chart while counting another system is the same mistake.
    private var indexNote: String? {
        model.countingSystems
            .system(withId: prefs.counting.systemId)
            .flatMap(DeviationIndexSystem.note)
    }

    /// The tags the counting drill grades against — the count tab's whole body.
    private var countReference: CountReference? {
        model.countingSystems
            .system(withId: prefs.counting.systemId)
            .map { CountReference(system: $0, decks: prefs.counting.numberOfDecks) }
    }

    /// The DAS and Late-Surrender chips are dropped in the deviation list: no
    /// deviation rule reads either option. Table rules are dropped entirely on
    /// the count tab — they decide a play, and have nothing to do with what a
    /// card is worth to the count, so the system it does depend on takes their
    /// place.
    private var ruleChips: [String] {
        if mode == .count {
            guard let countReference else { return [] }
            return [countReference.systemName, countReference.balanceLabel]
        }
        let ruleSet = prefs.ruleSet == .h17
            ? "H17 — dealer hits soft 17"
            : "S17 — dealer stands soft 17"
        guard mode == .basic else { return [ruleSet] }
        return [
            ruleSet,
            prefs.options.doubleAfterSplit ? "Double after split" : "No double after split",
            prefs.options.lateSurrender ? "Late surrender" : "No late surrender"
        ]
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                ChartGridView(
                    mode: $mode,
                    sections: sections,
                    deviationSections: deviationSections,
                    ruleChips: ruleChips,
                    indexNote: indexNote,
                    countReference: countReference,
                    onDrill: { trainer, ref in router.go(.drill(trainer, hand: ref)) }
                ) {
                    router.go(.settings)
                }
            }
            .background(Theme.ground.ignoresSafeArea())
            // @State takes its initial value once, before the route's tab is
            // known, so the opening tab is applied on appear.
            .onAppear { mode = tab }
            .navigationTitle("Chart")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { router.goHome() }
                        .tint(Theme.accentInk)
                }
            }
        }
    }
}

/// The screen's whole body, split out from its navigation shell so it can be
/// rendered on its own (previews, and the ImageRenderer probes that are the only
/// way to actually look at a screen in this project).
struct ChartGridView: View {
    @Binding var mode: ChartMode
    let sections: [ChartSection]
    let deviationSections: [DeviationSection]
    let ruleChips: [String]
    /// Set when the trainee's counting system is not the one the indices are
    /// written for; nil (the common case) leaves the list unadorned.
    var indexNote: String?
    /// The count tab's body. Nil only when the registry failed to load, which
    /// leaves the tab empty rather than inventing a system.
    var countReference: CountReference?
    /// Start a round pinned to one hand. The chart is where a trainee looks a
    /// hand up, and until now it could name the play and do nothing else.
    var onDrill: (TrainerId, ScenarioRef) -> Void = { _, _ in }
    let onChangeRules: () -> Void

    private let rowHeaderWidth: CGFloat = 46

    private var ringedCells: Int {
        sections.flatMap(\.rows).flatMap(\.cells).count { $0.missed != nil }
    }

    private var markedRules: Int {
        deviationSections.flatMap(\.rows).count { $0.missed != nil }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Picker("Chart", selection: $mode) {
                ForEach(ChartMode.allCases) { option in
                    Text(option.label).tag(option)
                }
            }
            .pickerStyle(.segmented)

            rules

            if mode == .count {
                if let countReference {
                    CountReferenceView(reference: countReference)
                }
            } else if mode == .deviations {
                ForEach(deviationSections) { section in
                    deviationCard(section)
                }
                note(
                    "Every index here is a \(DeviationIndexSystem.name) true count. Deviations "
                        + "override basic strategy only once the true count reaches the index. "
                        + "Everything not listed here is played straight off the chart, at any "
                        + "count."
                )
                // Insurance is the one row with no hand to pin: it is filed
                // against whatever was dealt, so it has no scenario to drill.
                note(
                    "Tap a hand to drill it — every deal that round is that hand, at the counts "
                        + "your settings give it, so both sides of its index come up."
                )
                if let indexNote {
                    AdvisoryNoteView(text: indexNote, alignment: .leading)
                }
                // No count here, unlike the grid's: one hand can carry two rules
                // (a hard total and the surrender written over it), so a tally
                // of marked rows would read as more weaknesses than there are.
                if markedRules > 0 {
                    note(
                        "Marked hands are ones you have missed in the last 7 days and not yet "
                            + "answered right three times running."
                    )
                }
            } else {
                ForEach(sections) { section in
                    card(section)
                }
                legend
                note(
                    "Every cell is the play for a two-card starting hand under the rules above. "
                        + "Pair rows show the split decision, or the play the hand falls back to "
                        + "when the chart says not to split."
                )
                // The page a trainee reads to look a hand up could say what the
                // play is and nothing else.
                note("Tap any cell to drill that hand.")
                // The app has always known which hands keep costing you, and the
                // page a trainee actually reads never said.
                if ringedCells > 0 {
                    note(
                        "\(countOf(ringedCells, "ringed cell")) — hands you have missed in the "
                            + "last 7 days and not yet answered right three times running."
                    )
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .frame(maxWidth: 560)
        .frame(maxWidth: .infinity)
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 12))
            .foregroundStyle(Theme.muted)
    }

    private var rules: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(ruleChips, id: \.self) { chip in
                Text(chip)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.midInk)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(Theme.surface))
                    .overlay(Capsule().strokeBorder(Theme.hairline, lineWidth: 1))
            }
            Button(mode == .count ? "Change system" : "Change rules", action: onChangeRules)
                .font(.system(size: 12))
                .tint(Theme.accentInk)
        }
    }

    private func card(_ section: ChartSection) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(section.title)
                .font(.system(size: 11, weight: .semibold))
                .tracking(1.4)
                .textCase(.uppercase)
                .foregroundStyle(Theme.muted)

            Grid(horizontalSpacing: 2, verticalSpacing: 2) {
                GridRow {
                    Text(section.rowHeader)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.muted)
                        .frame(width: rowHeaderWidth, alignment: .trailing)
                    ForEach(ChartKeys.dealerUpcards, id: \.self) { upcard in
                        Text(upcard)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Theme.muted)
                            .frame(maxWidth: .infinity)
                    }
                }
                .accessibilityHidden(true)

                ForEach(section.rows) { row in
                    GridRow {
                        Text(row.label)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Theme.midInk)
                            .lineLimit(1)
                            .frame(width: rowHeaderWidth, alignment: .trailing)
                            .accessibilityHidden(true)
                        ForEach(row.cells) { cell in
                            cellView(cell, in: row)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface)
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Theme.hairline, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    /// The grid has no table semantics for VoiceOver to lean on, so each cell
    /// carries its own row and column in its label — and its miss count, which
    /// the ring cannot say.
    /// Ten columns cannot each be 44pt wide on a phone, and a strategy chart you
    /// have to scroll sideways is not one you can read — the same call that
    /// spells surrender 'R' so the columns fit at all. What the cell can give,
    /// it gives: the whole coloured box is the target, padding included.
    private func cellView(_ cell: ChartCell, in row: ChartRow) -> some View {
        Button {
            onDrill(.basicStrategy, cell.ref)
        } label: {
            Text(cell.symbol)
                .font(.system(size: 12, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Theme.ink)
                .frame(maxWidth: .infinity, minHeight: 24)
                .padding(.vertical, 5)
                .background(Theme.chartCell(cell.action))
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .overlay(missRing(cell.missed != nil))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement()
        .accessibilityLabel(
            "\(row.label) versus \(cell.id): \(cell.action.label)"
                + (cell.missed.map { ". \($0)" } ?? "")
        )
        .accessibilityHint("Drills this hand")
    }

    /// A hand still outstanding in the rolling week. Every cell is already
    /// coloured by its action, so the mark has to be a shape rather than a hue:
    /// a ring in the body ink, which reads over all six action colours in both
    /// themes.
    @ViewBuilder
    private func missRing(_ missed: Bool) -> some View {
        if missed {
            RoundedRectangle(cornerRadius: 4).strokeBorder(Theme.ink, lineWidth: 2)
        }
    }

    private var legend: some View {
        LazyVGrid(
            columns: [GridItem(.adaptive(minimum: 104), alignment: .leading)],
            alignment: .leading,
            spacing: 8
        ) {
            ForEach(Action.chartLegend, id: \.self) { action in
                HStack(spacing: 6) {
                    Text(StrategyChartGrid.symbol(for: action))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 26)
                        .padding(.vertical, 3)
                        .background(Theme.chartCell(action))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                    Text(action.label)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.midInk)
                }
                .accessibilityElement(children: .combine)
            }
            // The ring is a shape, not a colour: every cell is already coloured
            // by its action, so a seventh hue would collide with the six above.
            if ringedCells > 0 {
                HStack(spacing: 6) {
                    Text(" ")
                        .font(.system(size: 12, weight: .semibold))
                        .frame(width: 26)
                        .padding(.vertical, 3)
                        .overlay(missRing(true))
                    Text("Missed this week")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.midInk)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

extension Action {
    /// The five actions a basic-strategy grid can print, in legend order.
    static let chartLegend: [Action] = [.hit, .stand, .double, .split, .surrender]
}

/// The deviation list's half of the screen. An extension so the struct body stays
/// inside the lint limit; it reads only what the view was handed.
extension ChartGridView {
    private func deviationCard(_ section: DeviationSection) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(section.title)
                .font(.system(size: 11, weight: .semibold))
                .tracking(1.4)
                .textCase(.uppercase)
                .foregroundStyle(Theme.muted)

            VStack(spacing: 0) {
                ForEach(Array(section.rows.enumerated()), id: \.element.id) { index, row in
                    if index > 0 {
                        Divider().overlay(Theme.hairline)
                    }
                    deviationRowView(row)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface)
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Theme.hairline, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    @ViewBuilder
    private func deviationRowView(_ row: DeviationRuleRow) -> some View {
        if let ref = row.ref {
            Button { onDrill(.deviations, ref) } label: { deviationRowBody(row) }
                .buttonStyle(.plain)
                .accessibilityHint("Drills this hand")
        } else {
            deviationRowBody(row)
        }
    }

    private func deviationRowBody(_ row: DeviationRuleRow) -> some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                Text(row.hand)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.ink)
                // The list is text, not a ten-column grid, so an outstanding
                // rule can say so in words rather than wear the grid's ring.
                if let missed = row.missed {
                    Text(missed)
                        .font(.system(size: 10))
                        .foregroundStyle(Theme.muted)
                }
            }
            Spacer(minLength: 4)
            Text(row.threshold)
                .font(.system(size: 13))
                .monospacedDigit()
                .foregroundStyle(Theme.midInk)
            Text(row.symbol)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .frame(width: 24)
                .padding(.vertical, 3)
                .background(Theme.chartCell(row.action))
                .clipShape(RoundedRectangle(cornerRadius: 4))
            Text(row.label)
                .font(.system(size: 13))
                .foregroundStyle(Theme.midInk)
                .frame(width: 74, alignment: .leading)
        }
        .padding(.vertical, 7)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(row.hand), true count \(row.threshold): \(row.label)"
                + (row.missed.map { ". \($0)" } ?? "")
        )
    }
}

#Preview {
    ChartView()
        .environment(AppModel())
        .environment(FlowRouter())
        .preferredColorScheme(.dark)
}
