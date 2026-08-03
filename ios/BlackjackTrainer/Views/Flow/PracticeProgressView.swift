import SwiftUI

/// Everything the app has been quietly recording, in one place: the week, each
/// trainer's lifetime accuracy, the showdown ledger, and the scenarios still
/// costing hands. Read-only — practice is what changes these. Mirrors the web
/// `progress-page` component. (Named around SwiftUI's own `ProgressView`.)
struct PracticeProgressView: View {
    @Environment(AppModel.self) private var model
    @Environment(FlowRouter.self) private var router

    private var goal: Int {
        model.flowPrefs.prefs.dailyGoal
    }

    private var bars: [ProgressDayBar] {
        ProgressSummary.bars(dots: model.practiceHistory.last7(goal: goal), goal: goal)
    }

    private var streakLabel: String {
        let streak = model.practiceHistory.streak(goal: goal)
        return streak == 0 ? "No streak yet" : "\(streak)-day streak"
    }

    private var totalHands: Int {
        model.practiceHistory.days.reduce(0) { $0 + $1.hands }
    }

    private var rows: [ProgressStatRow] {
        [
            ProgressSummary.row("Basic Strategy", model.basicStrategyStats.stats),
            ProgressSummary.row("Deviations", model.deviationStats.stats),
            ProgressSummary.row("Running count", model.runningCountStats.stats),
            ProgressSummary.row("True count", model.trueCountStats.stats),
            ProgressSummary.row("Deck estimate", model.deckEstimationStats.stats),
            ProgressSummary.row("Key count call", model.keyCountStats.stats),
            ProgressSummary.row("Bet spread", model.betSpreadStats.stats),
            ProgressSummary.row("Deck speed", model.deckSpeedStats.stats),
            // Not a drill of its own — it is every decision at a table, scored
            // where the hands are actually played out rather than dealt two at a
            // time: basic strategy, the indices over it, and the insurance call.
            ProgressSummary.row("Showdown play", model.showdownPlayStats.stats)
        ]
    }

    /// Only trainers that tally scenarios appear, and only once they have one.
    private var weakGroups: [ProgressWeakGroup] {
        [(TalliedTrainer.basicStrategy, "Basic Strategy"), (.deviations, "Deviations")]
            .map { trainer, label in
                ProgressWeakGroup(
                    trainer: label,
                    outstanding: model.missTally.weakSpots(trainer),
                    cleared: model.missTally.clearedSpots(trainer)
                )
            }
            .filter { !$0.outstanding.isEmpty || !$0.cleared.isEmpty }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                ProgressBodyView(
                    bars: bars,
                    streakLabel: streakLabel,
                    goal: goal,
                    totalHands: totalHands,
                    rows: rows,
                    showdown: model.showdownStats.stats,
                    bankroll: model.showdownBankroll.state,
                    weakGroups: weakGroups
                )
            }
            .background(Theme.ground.ignoresSafeArea())
            .navigationTitle("Progress")
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

/// The screen's whole body, split from its navigation shell so it can be
/// rendered on its own (previews, and the ImageRenderer probes that are the only
/// way to actually look at a screen in this project).
struct ProgressBodyView: View {
    let bars: [ProgressDayBar]
    let streakLabel: String
    let goal: Int
    let totalHands: Int
    let rows: [ProgressStatRow]
    let showdown: ShowdownStats
    let bankroll: BankrollState
    let weakGroups: [ProgressWeakGroup]

    private let weekHeight: CGFloat = 72
    private let handsWidth: CGFloat = 42
    private let accuracyWidth: CGFloat = 70
    private let bestWidth: CGFloat = 58

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            weekCard
            trainerCard
            if showdown.hands > 0 {
                showdownCard
            }
            ForEach(weakGroups) { group in
                weakCard(group)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .frame(maxWidth: 560)
        .frame(maxWidth: .infinity)
    }

    private var weekCard: some View {
        card("This week") {
            HStack(alignment: .bottom, spacing: 8) {
                ForEach(bars) { bar in
                    VStack(spacing: 5) {
                        ZStack(alignment: .bottom) {
                            RoundedRectangle(cornerRadius: 6).fill(Theme.ground)
                            RoundedRectangle(cornerRadius: 6)
                                // A day short of the goal still has to read as a
                                // bar, so it takes the muted foreground rather
                                // than a raised surface, a hair off the track.
                                .fill(bar.met ? Theme.accentInk : Theme.muted)
                                .frame(height: max(2, weekHeight * bar.height))
                                .opacity(bar.hands == 0 ? 0 : 1)
                        }
                        .frame(height: weekHeight)
                        .overlay(
                            RoundedRectangle(cornerRadius: 6)
                                .strokeBorder(
                                    bar.isToday ? Theme.accentInk.opacity(0.4) : .clear,
                                    lineWidth: 1
                                )
                        )
                        Text(bar.weekday)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.muted)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(bar.weekday): \(bar.hands) hands")
                }
            }
            Text("\(streakLabel) · goal \(goal) hands/day · \(totalHands) hands all time")
                .font(.system(size: 12))
                .foregroundStyle(Theme.midInk)
        }
    }

    private var trainerCard: some View {
        card("Trainers") {
            // The numeric columns are fixed and the label takes what is left:
            // an even four-way split truncated "Basic Strategy" on a phone.
            Grid(horizontalSpacing: 8, verticalSpacing: 0) {
                GridRow {
                    columnHeader("Drill", width: nil)
                    columnHeader("Hands", width: handsWidth)
                    columnHeader("Accuracy", width: accuracyWidth)
                    columnHeader("Best run", width: bestWidth)
                }
                .padding(.bottom, 4)

                ForEach(rows) { row in
                    Divider().overlay(Theme.hairline)
                    GridRow {
                        Text(row.label)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .gridColumnAlignment(.leading)
                        value("\(row.attempts)", width: handsWidth)
                        value(
                            row.accuracy.map { "\($0)%" } ?? "—",
                            width: accuracyWidth,
                            color: (row.accuracy ?? 0) >= 85 ? Theme.good : Theme.midInk
                        )
                        value("\(row.best)", width: bestWidth)
                    }
                    .padding(.vertical, 6)
                }
            }
        }
    }

    private var showdownCard: some View {
        card("Showdown") {
            VStack(alignment: .leading, spacing: 3) {
                Text("\(showdown.wins)W · \(showdown.losses)L · \(showdown.pushes)P")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                Text(
                    "\(showdown.hands) hands · \(showdown.blackjacks) blackjacks · "
                        + "\(winRate)% won"
                )
                .font(.system(size: 12))
                .foregroundStyle(Theme.muted)
            }
            if bankroll.wagered > 0 {
                VStack(alignment: .leading, spacing: 3) {
                    Text(ProgressSummary.signed(bankroll.net))
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(netColor)
                    Text(
                        "\(CountFormat.count(bankroll.bankroll)) chips on hand · "
                            + "\(CountFormat.count(bankroll.wagered)) wagered"
                    )
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
                }
            }
        }
    }

    private func weakCard(_ group: ProgressWeakGroup) -> some View {
        card("\(group.trainer) — this week") {
            if group.outstanding.isEmpty {
                Text("Nothing outstanding.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
            } else {
                ForEach(group.outstanding, id: \.label) { spot in
                    HStack {
                        Text(spot.label)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                        Spacer(minLength: 8)
                        Text("missed \(spot.misses) of \(spot.attempts)")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.muted)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            if !group.cleared.isEmpty {
                Text("Cleared: \(ProgressSummary.clearedLabel(group.cleared))")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
            }
        }
    }

    // MARK: - chrome

    private var winRate: Int {
        showdown.hands == 0
            ? 0
            : Int((Double(showdown.wins) / Double(showdown.hands) * 100).rounded())
    }

    private var netColor: Color {
        if bankroll.net > 0 { return Theme.good }
        return bankroll.net < 0 ? Theme.bad : Theme.ink
    }

    private func columnHeader(_ title: String, width: CGFloat?) -> some View {
        Text(title)
            .font(.system(size: 10, weight: .semibold))
            .tracking(0.8)
            .textCase(.uppercase)
            .foregroundStyle(Theme.muted)
            .frame(
                maxWidth: width ?? .infinity,
                alignment: width == nil ? .leading : .trailing
            )
    }

    private func value(_ text: String, width: CGFloat, color: Color = Theme.midInk) -> some View {
        Text(text)
            .font(.system(size: 13))
            .monospacedDigit()
            .foregroundStyle(color)
            .frame(width: width, alignment: .trailing)
    }

    private func card(
        _ title: String,
        @ViewBuilder content: () -> some View
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 11, weight: .semibold))
                .tracking(1.4)
                .textCase(.uppercase)
                .foregroundStyle(Theme.muted)
            content()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface)
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Theme.hairline, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

#Preview {
    PracticeProgressView()
        .environment(AppModel())
        .environment(FlowRouter())
        .preferredColorScheme(.dark)
}
