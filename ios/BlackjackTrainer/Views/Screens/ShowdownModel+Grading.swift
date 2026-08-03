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
            expected: correct.action,
            reason: correct.reason
        )
        guard !wasRight else { return GradedPlay(verdict: verdict, misplay: nil) }
        let misplay = "\(correct.handDescription) vs \(normalizeUpcardKey(upcard)): "
            + "\(correct.action.label), not \(action.label)"
        return GradedPlay(verdict: verdict, misplay: misplay)
    }
}
