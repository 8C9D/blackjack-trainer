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
        /// The scenario to file this decision under in the weak-spot tally, or
        /// nil when the decision has no identity the drill could re-deal.
        var tallyRef: ScenarioRef?
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
        let ref = tallyRef(for: hand.cards, upcard: upcard, played: correct.action, engine: engine)
        guard !wasRight else {
            return GradedPlay(verdict: verdict, misplay: nil, tallyRef: ref)
        }
        let misplay = "\(correct.handDescription) vs \(normalizeUpcardKey(upcard)): "
            + "\(correct.action.label), not \(action.label)"
        return GradedPlay(verdict: verdict, misplay: misplay, tallyRef: ref)
    }

    /// The scenario a decision at the table should be filed under, or nil when it
    /// has none.
    ///
    /// A misplay here is a basic-strategy miss on the hand it was made on, so it
    /// belongs in the same weak-spot tally the drill keeps: play 16 vs 10 badly at
    /// the table and the next Basic Strategy session opens on it. Without that the
    /// verdict is said once and forgotten the moment the round settles.
    ///
    /// Only an opening two-card decision qualifies, and only when the table asked
    /// the same question the drill does. A `ScenarioRef` names a two-card hand — it
    /// is the seed the drill re-deals from — so a three-card 16 has nothing to file
    /// under. And when the felt withheld an action the chart wanted (a double the
    /// free chips could not back, a split past the box's four-hand cap), the
    /// correct answer here is not the drill's, and recording it would clear a weak
    /// spot the trainee has not actually learned.
    private func tallyRef(for cards: [Card], upcard: Card, played: Action,
                          engine: BasicStrategyEngine) -> ScenarioRef? {
        guard cards.count == 2 else { return nil }
        let hand = TwoCardHand(cards[0], cards[1])
        let unrestricted = engine.decide(EngineInput(
            player: hand, dealerUpcard: upcard, ruleSet: ruleSet, options: options
        ))
        guard unrestricted.action == played else { return nil }
        return scenarioRefFor(hand, dealerUpcard: upcard)
    }

    /// The count as this table can grade it, on the shoe as it now stands.
    var countBasis: CountBasis {
        CountBasis.of(system: system, runningCount: visibleRunningCount,
                      decksRemaining: shoe.decksRemaining)
    }

    /// The true count the bet is graded on — this system's own, not Hi-Lo's.
    var betTrueCount: Int? {
        trueCountFor(system: system, runningCount: visibleRunningCount,
                     decksRemaining: shoe.decksRemaining)
    }

    /// The bet is the other decision here that is purely about the count, and the
    /// one the bet-spread drill exists for — but that drill asks for a number in
    /// the abstract, while this is the table where chips actually go out. Until
    /// now a trainee could flat-bet the minimum through a +5 shoe and hear
    /// nothing.
    ///
    /// Graded against the player's own spread, never a computed optimum: what to
    /// bet at a count follows from bankroll, risk of ruin and what the table will
    /// tolerate, none of which this app knows (see `BetRamp`). Because the ramp is
    /// the player's own it is indexed by whatever true count they keep, so every
    /// balanced system qualifies — unlike the insurance index, which is a Hi-Lo
    /// number and may only be applied to Hi-Lo.
    ///
    /// Nil when there is no true count to read, and when the bankroll could not
    /// have covered the called bet: that rung is offered disabled, so marking it
    /// wrong would score a bet the table never let the player place.
    func gradeBet(trueCount: Int?, bet: Double) -> GradedPlay? {
        guard let trueCount else { return nil }
        let called = Double(BetRamp.units(trueCount: trueCount, ramp: betRamp))
        guard called * Double(spots) <= bankrollStore.bankroll else { return nil }
        let correct = bet == called
        let band = BetRamp.bandLabels[BetRamp.bandIndex(trueCount: trueCount)]
        let units = BetRamp.unitsLabel(Int(called))
        let verdict = PlayVerdict(
            correct: correct,
            headline: "\(units) was the bet.",
            reason: "Your spread calls for \(Int(called)) at \(band), and the true "
                + "count is \(CountFormat.signedCount(Double(trueCount)))."
        )
        guard !correct else { return GradedPlay(verdict: verdict, misplay: nil) }
        let misplay = "Bet: \(Int(called)) at \(band), not \(CountFormat.count(bet))"
        return GradedPlay(verdict: verdict, misplay: misplay)
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
