import SwiftUI

/// The chart the drills grade against, rendered rather than re-encoded: every
/// cell is the engine's own decision for a representative hand under the live
/// rule set, so the page cannot drift from what a miss is scored on. Read-only —
/// rules stay a Settings decision. Mirrors the web `chart-page` component.
struct ChartView: View {
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
            options: prefs.options
        )
    }

    private var deviationSections: [DeviationSection] {
        StrategyChartGrid.deviationSections(
            rules: model.charts.deviations[prefs.ruleSet.rawValue] ?? []
        )
    }

    /// The DAS and Late-Surrender chips are dropped in the deviation list: no
    /// deviation rule reads either option.
    private var ruleChips: [String] {
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
                    ruleChips: ruleChips
                ) {
                    router.go(.settings)
                }
            }
            .background(Theme.ground.ignoresSafeArea())
            .navigationTitle("Strategy chart")
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
    let onChangeRules: () -> Void

    private let rowHeaderWidth: CGFloat = 46

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Picker("Chart", selection: $mode) {
                ForEach(ChartMode.allCases) { option in
                    Text(option.label).tag(option)
                }
            }
            .pickerStyle(.segmented)

            rules

            if mode == .deviations {
                ForEach(deviationSections) { section in
                    deviationCard(section)
                }
                note(
                    "Deviations override basic strategy only once the true count reaches the "
                        + "index. Everything not listed here is played straight off the chart, "
                        + "at any count."
                )
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
                    HStack(spacing: 8) {
                        Text(row.hand)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.ink)
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
                    .accessibilityLabel("\(row.hand), true count \(row.threshold): \(row.label)")
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
            Button("Change rules", action: onChangeRules)
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
    /// carries its own row and column in its label.
    private func cellView(_ cell: ChartCell, in row: ChartRow) -> some View {
        Text(cell.symbol)
            .font(.system(size: 12, weight: .semibold))
            .monospacedDigit()
            .foregroundStyle(Theme.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 5)
            .background(Theme.chartCell(cell.action))
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .accessibilityElement()
            .accessibilityLabel("\(row.label) versus \(cell.id): \(cell.action.label)")
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
        }
    }
}

extension Action {
    /// The five actions a basic-strategy grid can print, in legend order.
    static let chartLegend: [Action] = [.hit, .stand, .double, .split, .surrender]
}

#Preview {
    ChartView()
        .environment(AppModel())
        .environment(FlowRouter())
        .preferredColorScheme(.dark)
}
