import SwiftUI

/// The Basic Strategy drill screen in the Flow shell. The model that drives it
/// lives in `BasicStrategyDrillModel.swift`.
struct BasicStrategyDrillView: View {
    @State private var model: BasicStrategyDrillModel
    let onExit: () -> Void

    init(
        app: AppModel,
        review: Bool = false,
        pinned: ScenarioRef? = nil,
        onExit: @escaping () -> Void
    ) {
        _model = State(
            initialValue: BasicStrategyDrillModel(app: app, review: review, pinned: pinned)
        )
        self.onExit = onExit
    }

    /// Render seam: a caller-built model, so probes and screenshots can pose a
    /// mid-round state (the pattern the showdown's screen used pre-trim).
    init(model: BasicStrategyDrillModel, onExit: @escaping () -> Void) {
        _model = State(initialValue: model)
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
        // Grading shows as color and position on the action grid, which
        // announces as nothing — the spoken verdict is VoiceOver's whole
        // feedback loop (the web's sr-only status region).
        .onChange(of: model.result) { _, result in
            guard let result else { return }
            AccessibilityNotification.Announcement(
                result.correct
                    ? "Correct: \(result.action.label)."
                    : "Incorrect. Correct: \(result.action.label). \(result.reason)"
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
            if let pinnedLabel = model.pinnedLabel {
                AdvisoryNoteView(text: "Drilling \(pinnedLabel) — every hand this round.")
                    .padding(.top, 10)
            }
            FlowStageView(
                player: model.scenario.player,
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

    /// The miss rule line, or the computed question line, as one styled Text.
    /// Basic-strategy miss: "Correct: <action>. <reason>"; question: the total
    /// computed for the user, e.g. "Hard 16 vs 10".
    private var stageLine: Text {
        if model.phase == .miss, let result = model.result {
            return Text("Correct: \(result.action.label). ").bold().foregroundStyle(Theme.accentInk)
                + Text(result.reason).foregroundStyle(Theme.midInk)
        }
        let question = model.question
        let prefix = question.prefix.isEmpty ? Text("") : Text("\(question.prefix) ")
        return prefix
            + Text(question.value).bold().foregroundStyle(Theme.inkStrong)
            + Text(" vs ")
            + Text(question.dealer).bold().foregroundStyle(Theme.inkStrong)
    }

    private func leave() {
        model.exit()
        onExit()
    }
}

/// Renders the composed question/rule line beneath the stage.
struct DrillLineView: View {
    let line: Text

    var body: some View {
        line
            .font(.callout)
            .foregroundStyle(Theme.midInk)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
    }
}
