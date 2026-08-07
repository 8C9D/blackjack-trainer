import SwiftUI

/// The Deviations drill screen in the Flow shell. The model that drives it lives
/// in `DeviationsDrillModel.swift`.
struct DeviationsDrillView: View {
    @State private var model: DeviationsDrillModel
    let onExit: () -> Void

    init(
        app: AppModel,
        review: Bool = false,
        pinned: ScenarioRef? = nil,
        onExit: @escaping () -> Void
    ) {
        _model = State(
            initialValue: DeviationsDrillModel(app: app, review: review, pinned: pinned)
        )
        self.onExit = onExit
    }

    var body: some View {
        Group {
            if model.phase == .done {
                FlowDoneView(
                    hands: model.handsToday,
                    target: model.target,
                    goalMet: model.goalMet,
                    bestStreak: model.session.bestStreak,
                    accuracy: model.session.accuracy,
                    medianSeconds: model.session.medianSeconds,
                    weakSpot: model.weakSpot,
                    weakSpots: model.weakSpots,
                    cleared: model.clearedSpots,
                    onAgain: { model.oneMoreRound() },
                    onReview: { model.reviewMisses() },
                    onExit: leave
                )
            } else {
                drillBody
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.ground.ignoresSafeArea())
        .onDisappear { model.exit() }
        // The spoken verdict is VoiceOver's whole feedback loop (the web's
        // sr-only status region); the count context is in the explanation.
        .onChange(of: model.result) { _, result in
            guard let result else { return }
            AccessibilityNotification.Announcement(
                result.correct
                    ? "Correct: \(result.expectedAction.label)."
                    : "Incorrect. Correct: \(result.expectedAction.label). \(model.explanation)"
            ).post()
        }
    }

    @Environment(\.dynamicTypeSize) private var typeSize

    /// At the accessibility sizes the question and the six actions outgrow the
    /// viewport, so the drill scrolls rather than squeezing the stage until the
    /// question clips.
    @ViewBuilder private var drillBody: some View {
        if typeSize.isAccessibilitySize {
            ScrollView { drillColumn }
        } else {
            drillColumn
        }
    }

    private var drillColumn: some View {
        VStack(spacing: 0) {
            FlowTopBarView(
                count: model.handsToday,
                target: model.target,
                streak: model.session.streak,
                onExit: leave
            )
            if let note = model.indexNote {
                AdvisoryNoteView(text: note)
                    .padding(.top, 10)
            }
            if let pinnedLabel = model.pinnedLabel {
                AdvisoryNoteView(
                    text: "Drilling \(pinnedLabel) — every hand this round, "
                        + "at the counts your settings deal."
                )
                .padding(.top, 10)
            }
            FlowStageView(
                player: model.scenario.player.cards,
                dealer: model.scenario.dealerUpcard
            ) {
                DrillLineView(line: stageLine)
            }
            FlowActionsView(
                legal: model.legalActions,
                picked: model.picked,
                correct: model.correctAction,
                onAction: { model.answer($0) }
            )
            Text("tap anywhere to continue")
                .font(.caption2)
                .tracking(1)
                .textCase(.uppercase)
                .foregroundStyle(Theme.muted)
                .opacity(model.phase == .miss ? 1 : 0)
                .padding(.bottom, 8)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if model.phase == .miss { model.continueFromMiss() }
        }
    }

    private var stageLine: Text {
        if model.phase == .miss, let result = model.result {
            return Text("Correct: \(result.expectedAction.label). ").bold()
                .foregroundStyle(Theme.accentInk)
                + Text(model.explanation).foregroundStyle(Theme.midInk)
        }
        let question = model.question
        let prefix = question.prefix.isEmpty ? Text("") : Text("\(question.prefix) ")
        return prefix
            + Text(question.value).bold().foregroundStyle(Theme.inkStrong)
            + Text(" vs ")
            + Text(question.dealer).bold().foregroundStyle(Theme.inkStrong)
            + Text(" · TC ").foregroundStyle(Theme.muted)
            + Text(model.trueCountLabel).bold().foregroundStyle(Theme.accentInk)
    }

    private func leave() {
        model.exit()
        onExit()
    }
}
