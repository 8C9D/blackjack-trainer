import Foundation

/// Scoring the showdown's playing decisions against basic strategy.
///
/// The showdown is the only place the app lets a hand be played out, and it used
/// to accept anything. It still does — this is a table, not a quiz, so a wrong
/// play stands and is settled — but the play is now scored against the same
/// chart the Basic Strategy drill grades on, and said out loud.
///
/// Its own file so `ShowdownModel` stays inside the file-length budget. It only
/// reads: `private(set)` is file-scoped, so `onAction` does the recording.
extension ShowdownModel {
    struct GradedPlay {
        let verdict: PlayVerdict
        /// The line for the round's misplay list, or nil when the play was right.
        let misplay: String?
    }

    /// Nil when there is nothing to grade against — no charts (a preview or a
    /// spec built without them), or no hand on the felt.
    func grade(_ action: Action) -> GradedPlay? {
        guard let engine = strategy, let hand = activeHand, let upcard = dealerCards.first
        else { return nil }
        let correct = engine.decidePlay(PlayInput(
            player: hand.cards,
            dealerUpcard: upcard,
            ruleSet: ruleSet,
            options: options,
            canDouble: canDouble,
            canSplit: canSplit,
            canSurrender: canSurrender
        ))
        let wasRight = action == correct.action
        let verdict = PlayVerdict(
            correct: wasRight,
            headline: "\(correct.action.label) was the play.",
            reason: correct.reason
        )
        guard !wasRight else { return GradedPlay(verdict: verdict, misplay: nil) }
        let misplay = "\(correct.handDescription) vs \(normalizeUpcardKey(upcard)): "
            + "\(correct.action.label), not \(action.label)"
        return GradedPlay(verdict: verdict, misplay: misplay)
    }

    /// The count as this table can grade it, on the shoe as it now stands.
    var countBasis: CountBasis {
        CountBasis.of(system: system, runningCount: visibleRunningCount,
                      decksRemaining: shoe.decksRemaining)
    }

    /// Insurance is the one decision at this table that is purely about the
    /// count, and the showdown hangs off the drill that just practised it — so
    /// this is where a trainee finds out whether the number they were carrying
    /// was worth acting on. It is graded on the count as they could see it:
    /// every card face up at this moment, and not the hole card the bet is
    /// about.
    ///
    /// Whether the bet won is beside the point. Insurance at +3 that loses was
    /// still right, and that is exactly the lesson.
    ///
    /// Nil when there is nothing to grade against — no charts, or a system whose
    /// count the app has no published trigger for.
    func gradeInsurance(took: Bool) -> GradedPlay? {
        guard let deviations else { return nil }
        let basis = countBasis
        let decision = deviations.resolveInsuranceDecision(
            trueCount: basis.trueCountForIndex, ruleSet: ruleSet
        )
        guard let shouldTake = basis.insuranceIsCorrect(
            hiLoThresholdMet: decision.deviationApplied
        ) else { return nil }
        let correct = took == shouldTake
        let verdict = PlayVerdict(
            correct: correct,
            headline: shouldTake ? "Insurance was the play." : "Declining was the play.",
            reason: insuranceReason(basis, shouldTake: shouldTake,
                                    index: decision.matchedRule?.index)
        )
        guard !correct else { return GradedPlay(verdict: verdict, misplay: nil) }
        let misplay = "Insurance: \(shouldTake ? "take it" : "decline"), "
            + "not \(took ? "take" : "decline")"
        return GradedPlay(verdict: verdict, misplay: misplay)
    }

    private func insuranceReason(_ basis: CountBasis, shouldTake: Bool, index: Int?) -> String {
        let at = shouldTake ? "at or above" : "below"
        if case let .runningCount(count, insuranceAt) = basis {
            let name = system?.name ?? DeviationIndexSystem.name
            let trigger = CountFormat.signedCount(Double(insuranceAt))
            return "Running count \(CountFormat.signedCount(count)) is \(at) "
                + "\(name)'s insurance count of \(trigger)."
        }
        // The index is quoted from the chart the grading just consulted, never
        // restated here, so a corrected chart cannot leave this sentence citing
        // a number the verdict no longer uses.
        let named = index.map { " of \(CountFormat.signedCount(Double($0)))" } ?? ""
        let count = CountFormat.signedCount(Double(basis.trueCountForIndex))
        return "True count \(count) is \(at) the insurance index\(named)."
    }
}
