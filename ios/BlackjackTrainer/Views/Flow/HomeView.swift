import SwiftUI

/// The Open moment: one loud primary action (resume the last trainer), the
/// daily-goal ring and streak, and the other two trainers in stable positions.
/// Zero decisions to start. Mirrors the web `home-page` component.
struct HomeView: View {
    @Environment(AppModel.self) private var model
    @Environment(FlowRouter.self) private var router

    private let buttonBrown = Color(hex: 0x1A1408)

    private var prefs: FlowPrefs {
        model.flowPrefs.prefs
    }

    private var goal: Int {
        prefs.dailyGoal
    }

    private var lastTrainer: TrainerId {
        prefs.lastTrainer
    }

    private var handsToday: Int {
        model.practiceHistory.handsToday()
    }

    private var dots: [StreakDot] {
        model.practiceHistory.last7(goal: goal)
    }

    private var streak: Int {
        model.practiceHistory.streak(goal: goal)
    }

    private var subtext: String {
        let remaining = goal - handsToday
        if remaining <= 0 { return "goal met — one more round?" }
        return "\(countOf(remaining, "hand")) to today's goal"
    }

    private var otherTrainers: [TrainerCard] {
        TrainerId.allCases.filter { $0 != lastTrainer }.map { id in
            TrainerCard(id: id, label: id.label, accuracy: accuracy(for: id))
        }
    }

    var body: some View {
        VStack(spacing: 14) {
            VStack(spacing: 10) {
                Text(formatDayLabel(Date()))
                    .font(.system(size: 12))
                    .tracking(1.5)
                    .textCase(.uppercase)
                    .foregroundStyle(Theme.muted)
                GoalRingView(value: handsToday, goal: goal)
                StreakDotsView(dots: dots, streak: streak)
            }
            .padding(.top, 12)

            Spacer(minLength: 20)

            VStack(spacing: 12) {
                primaryButton
                HStack(spacing: 12) {
                    ForEach(otherTrainers) { trainer in
                        otherCard(trainer)
                    }
                }
                HStack(spacing: 16) {
                    quietButton("Chart") { router.go(.chart()) }
                    quietButton("Progress") { router.go(.progress) }
                    quietButton("Settings") { router.go(.settings) }
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 36)
        .padding(.bottom, 24)
        .frame(maxWidth: 460)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.ground.ignoresSafeArea())
    }

    private func quietButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 14))
                .foregroundStyle(Theme.muted)
                .padding(.vertical, 6)
                .padding(.horizontal, 6)
        }
        .buttonStyle(.plain)
    }

    private var primaryButton: some View {
        Button { router.go(.drill(lastTrainer)) } label: {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Continue — \(lastTrainer.label)")
                        .font(.system(size: 16, weight: .semibold))
                    Text(subtext)
                        .font(.system(size: 12))
                        .opacity(0.75)
                }
                Spacer()
            }
            .foregroundStyle(buttonBrown)
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity)
            .background(Theme.accent)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }

    private func otherCard(_ trainer: TrainerCard) -> some View {
        Button { router.go(.drill(trainer.id)) } label: {
            HStack(spacing: 8) {
                Text(trainer.label)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.midInk)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 4)
                AccuracyChip(accuracy: trainer.accuracy)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .background(Theme.surface)
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.hairline, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    /// Lifetime accuracy for a trainer card. Counting sums every one of its
    /// stores — running count, true count, and the deck estimate that divides
    /// it — mirroring the web: the card shows one number for the trainer, and
    /// leaving a question out shows "new" to someone who has drilled only that,
    /// and lets the chip disagree with that question's own Progress row.
    private func accuracy(for id: TrainerId) -> Int? {
        switch id {
        case .basicStrategy:
            flowAccuracy(model.basicStrategyStats.stats)
        case .deviations:
            flowAccuracy(model.deviationStats.stats)
        case .cardCounting:
            countingAccuracy([
                model.runningCountStats.stats,
                model.trueCountStats.stats,
                model.deckEstimationStats.stats
            ])
        }
    }
}

private struct TrainerCard: Identifiable {
    let id: TrainerId
    let label: String
    let accuracy: Int?
}

/// `new` at zero attempts; green at ≥ 85%; otherwise a neutral percentage chip.
private struct AccuracyChip: View {
    let accuracy: Int?

    private var isGood: Bool {
        (accuracy ?? 0) >= 85 && accuracy != nil
    }

    var body: some View {
        Text(accuracy.map { "\($0)%" } ?? "new")
            .font(.system(size: 12))
            .monospacedDigit()
            .foregroundStyle(chipColor)
            .padding(.horizontal, 9)
            .padding(.vertical, 3)
            .background(Capsule().fill(Theme.raised))
            .overlay(
                Capsule().strokeBorder(
                    isGood ? Theme.good.opacity(0.4) : Theme.hairline,
                    lineWidth: 1
                )
            )
    }

    private var chipColor: Color {
        if accuracy == nil { return Theme.muted }
        return isGood ? Theme.good : Theme.midInk
    }
}

/// The Card Counting card's one number: every counting store summed. A free
/// function so it is testable without the view.
func countingAccuracy(_ stores: [SessionStats]) -> Int? {
    flowAccuracy(
        attempts: stores.reduce(0) { $0 + $1.attempts },
        correct: stores.reduce(0) { $0 + $1.correct }
    )
}

private func flowAccuracy(_ stats: SessionStats) -> Int? {
    flowAccuracy(attempts: stats.attempts, correct: stats.correct)
}

private func flowAccuracy(attempts: Int, correct: Int) -> Int? {
    guard attempts > 0 else { return nil }
    return Int((Double(correct) / Double(attempts) * 100).rounded())
}

/// "Thursday evening" — ambient, glanceable, no clock precision. Mirrors the web
/// `formatDayLabel`.
func formatDayLabel(_ now: Date) -> String {
    let weekday = now.formatted(.dateTime.weekday(.wide))
    let hour = Calendar.current.component(.hour, from: now)
    let part = hour < 12 ? "morning" : (hour < 18 ? "afternoon" : "evening")
    return "\(weekday) \(part)"
}
