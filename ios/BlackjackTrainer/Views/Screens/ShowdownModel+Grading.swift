import Foundation

/// Scoring the showdown's playing decisions against the count.
///
/// The showdown is the only place the app lets a hand be played out, and it used
/// to accept anything. It still does — this is a table, not a quiz, so a wrong
/// play stands and is settled — but the play is scored and said out loud.
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
        /// Which drill's weak list `tallyRef` belongs to — the one that teaches
        /// the answer this decision was graded against.
        var tallyTrainer: TalliedTrainer = .basicStrategy
        /// The count an index play was made at, for the Deviations trainer to
        /// re-deal the hand at. Nil for a basic-strategy decision, which has no
        /// count in its question.
        var tallyTrueCount: Int?
    }

    /// Nil when there is nothing to grade against — no charts (a preview or a
    /// spec built without them), or no hand on the felt.
    func grade(_ action: Action) -> GradedPlay? {
        guard let engine = strategy, let hand = activeHand, let upcard = dealerCards.first
        else { return nil }
        let input = PlayInput(
            player: hand.cards,
            dealerUpcard: upcard,
            ruleSet: ruleSet,
            options: options,
            canDouble: canDouble,
            canSplit: canSplit,
            canSurrender: canSurrender
        )
        let correct = correctPlay(input, engine: engine)
        let wasRight = action == correct.action
        let verdict = PlayVerdict(
            correct: wasRight,
            headline: "\(correct.action.label) was the play.",
            reason: correct.reason
        )
        let ref = tallyRef(for: hand.cards, upcard: upcard, correct: correct, engine: engine)
        let trainer: TalliedTrainer = correct.deviationApplied ? .deviations : .basicStrategy
        // An index play is a question about a count, so the count it was played
        // at goes with it.
        var tallyCount: Int?
        if trainer == .deviations, case let .trueCount(trueCount) = countBasis {
            tallyCount = trueCount
        }
        guard !wasRight else {
            return GradedPlay(
                verdict: verdict,
                misplay: nil,
                tallyRef: ref,
                tallyTrainer: trainer,
                tallyTrueCount: tallyCount
            )
        }
        let index = correct.deviationApplied ? " (index play)" : ""
        let misplay = "\(correct.handDescription) vs \(normalizeUpcardKey(upcard)): "
            + "\(correct.action.label), not \(action.label)\(index)"
        return GradedPlay(
            verdict: verdict,
            misplay: misplay,
            tallyRef: ref,
            tallyTrainer: trainer,
            tallyTrueCount: tallyCount
        )
    }

    /// What this table calls correct. The count carried in from the drill is the
    /// whole reason the showdown exists, and a hand is where it finally pays: a
    /// trainee taught to stand 16 vs 10 at +1 and then marked wrong for it here
    /// would be taught two different games by one app.
    ///
    /// The index only applies where the app has one. A playing deviation is a
    /// Hi-Lo true count, so every other system is graded on basic strategy alone
    /// rather than against numbers that are not its own — the same line the
    /// insurance call already draws. (KO's book publishes an insurance trigger,
    /// not a playing schedule, so its running count grades that one decision and
    /// no other.)
    private func correctPlay(_ input: PlayInput,
                             engine: BasicStrategyEngine) -> PlayDeviationDecision {
        guard let deviations, case let .trueCount(trueCount) = countBasis else {
            return PlayDeviationDecision(decision: engine.decidePlay(input),
                                         deviationApplied: false, matchedRule: nil)
        }
        return deviations.resolvePlayDecision(input, trueCount: trueCount)
    }

    /// The scenario a decision at the table should be filed under, or nil when it
    /// has none.
    ///
    /// A misplay here is a miss on the hand it was made on, so it belongs in the
    /// same weak-spot tally the drills keep: play 16 vs 10 badly at the table and
    /// the next session opens on it. Without that the verdict is said once and
    /// forgotten the moment the round settles. It files against whichever trainer
    /// teaches the answer — an index play is a Deviations question, and filing it
    /// under Basic Strategy would seed that drill a hand whose chart answer the
    /// trainee got right.
    ///
    /// Only an opening two-card decision qualifies, and only when the table asked
    /// the same question the drill does. A `ScenarioRef` names a two-card hand — it
    /// is the seed the drill re-deals from — so a three-card 16 has nothing to file
    /// under. And when the felt withheld an action the chart wanted (a double the
    /// free chips could not back, a split past the box's four-hand cap, a
    /// surrender the split already spent), the correct answer here is not the
    /// drill's, and recording it would clear a weak spot the trainee has not
    /// actually learned.
    private func tallyRef(for cards: [Card], upcard: Card, correct: PlayDeviationDecision,
                          engine: BasicStrategyEngine) -> ScenarioRef? {
        guard cards.count == 2 else { return nil }
        let hand = TwoCardHand(cards[0], cards[1])
        let input = EngineInput(player: hand, dealerUpcard: upcard,
                                ruleSet: ruleSet, options: options)
        let unrestricted: Action = if correct.deviationApplied, let deviations,
                                      case let .trueCount(trueCount) = countBasis {
            deviations.resolveDeviationDecision(input, trueCount: trueCount)
                .finalAction
        } else {
            engine.decide(input).action
        }
        guard unrestricted == correct.action else { return nil }
        return scenarioRefFor(hand, dealerUpcard: upcard)
    }

    /// What this table cannot say about this trainee's play, and why — or nil
    /// when the indices are theirs. A playing index is a Hi-Lo true count, so
    /// every other system is graded on basic strategy alone; said once here
    /// rather than left to be inferred from verdicts that quietly never mention
    /// an index. The reason is the shared advisory the Deviations drill, the
    /// chart and Settings already show; only the consequence is added.
    /// Mirrors the web `indexNote`.
    var indexNote: String? {
        let basis = countBasis
        if case .trueCount = basis { return nil }
        guard let system, let note = DeviationIndexSystem.note(for: system) else { return nil }
        if case .runningCount = basis {
            return note + " Hands here are graded on basic strategy, and the insurance "
                + "call against \(system.name)'s own running-count trigger."
        }
        return note + " Hands here are graded on basic strategy alone, and the "
            + "insurance call is left ungraded."
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
        // A shrinking bankroll clamps the carried bet to whatever it can still
        // back, which need not land on a rung. The ladder is the only way to
        // place a bet, so a figure that is not on it is one the player never
        // chose.
        guard betOptions.contains(bet) else { return nil }
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

/// Leaving the table. Every count-dependent verdict here — the bet, the
/// insurance call, the index plays — was scored against a count this model kept,
/// and the trainee was never asked for theirs. So the way out runs through it,
/// once, on the count as they could see it. Mirrors the web
/// `returnToCounting` / `onCountCheck`.
///
/// Reads only, like the rest of this file: the phase change and the recording
/// live in `ShowdownModel`.
extension ShowdownModel {
    /// Cards the player has actually seen face up. The hole card of an
    /// unresolved round is dealt but not shown, so it is not one of them.
    var cardsSeen: Int {
        seenCards.count
    }

    /// Whether the round being left still holds a face-down hole card, so the
    /// count check can say why it is not in the number it is asking for.
    var holeCardUnseen: Bool {
        pendingHoleCard != nil
    }

    /// Wong Halves and friends run on half-points, so the answer box has to take
    /// them — the same rule the counting drill's own form follows.
    var fractionalCount: Bool {
        guard let system else { return false }
        return CountingEngine().isFractionalSystem(system)
    }

    /// Whether leaving should stop at the count check. Only between rounds:
    /// mid-hand the dealer's hole card is dealt but face down, so there is no
    /// single count both sides could agree is right.
    var asksForTheCount: Bool {
        countCheck && !dealtCards.isEmpty && phase != .playerTurn
    }

    /// The count they leave with against the one the table kept. This is the
    /// running-count skill the drill measures, so the caller feeds the same
    /// store: a count held through a played-out shoe is the same count, harder.
    func gradeCountCheck(_ answer: Double) -> PlayVerdict {
        let actual = visibleRunningCount
        let drift = answer - actual
        let points = abs(drift) == 1 ? "point" : "points"
        return PlayVerdict(
            correct: drift == 0,
            headline: "The running count is \(CountFormat.signedCount(actual)).",
            reason: drift == 0
                ? "You carried it through \(cardsSeen) cards at the table."
                : "You said \(CountFormat.signedCount(answer)) — "
                + "\(CountFormat.count(abs(drift))) \(points) "
                + "\(drift > 0 ? "high" : "low") over \(cardsSeen) cards."
        )
    }
}
