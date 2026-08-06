import Foundation
import Testing
@testable import BlackjackTrainer

/// Mirrors `basic-strategy-engine.play.spec.ts`: the mid-hand decision must be
/// the opening decision whenever the hand is two cards with nothing withheld,
/// and must never name an action the hand cannot legally take.
@MainActor
struct BasicStrategyPlayTests {
    private var engine: BasicStrategyEngine {
        TestEngines.shared.basicStrategy
    }

    private func card(_ rank: Rank) -> Card {
        Card(rank: rank, suit: .spades)
    }

    private static let optionSets: [EngineOptions] = [
        EngineOptions(doubleAfterSplit: false, lateSurrender: false),
        EngineOptions(doubleAfterSplit: true, lateSurrender: false),
        EngineOptions(doubleAfterSplit: false, lateSurrender: true),
        EngineOptions(doubleAfterSplit: true, lateSurrender: true)
    ]

    private func play(
        _ ranks: [Rank], vs up: Rank, _ ruleSet: RuleSet, _ options: EngineOptions,
        canDouble: Bool = true, canSplit: Bool = true, canSurrender: Bool = true
    ) -> PlayInput {
        PlayInput(
            player: ranks.map(card), dealerUpcard: card(up), ruleSet: ruleSet, options: options,
            canDouble: canDouble, canSplit: canSplit, canSurrender: canSurrender
        )
    }

    /// The load-bearing guard: with two cards and nothing withheld, the mid-hand
    /// decision *is* the opening decision. If these ever disagree, `decidePlay`
    /// has grown a second, private copy of the chart.
    @Test func matchesDecideOnEveryOpeningHand() {
        var disagreements: [String] = []
        var compared = 0
        for ruleSet in [RuleSet.s17, .h17] {
            for options in Self.optionSets {
                for a in Rank.allCases {
                    for b in Rank.allCases {
                        for up in Rank.allCases {
                            let opening = engine.decide(EngineInput(
                                player: TwoCardHand(card(a), card(b)),
                                dealerUpcard: card(up), ruleSet: ruleSet, options: options
                            ))
                            let mid = engine.decidePlay(play([a, b], vs: up, ruleSet, options))
                            compared += 1
                            if mid.action != opening.action {
                                disagreements.append(
                                    "\(a.rawValue),\(b.rawValue) vs \(up.rawValue) "
                                        + "\(ruleSet.rawValue): \(opening.action) vs \(mid.action)"
                                )
                            }
                        }
                    }
                }
            }
        }
        #expect(disagreements.isEmpty)
        #expect(compared == 2 * 4 * 13 * 13 * 13)
    }

    /// The `can*` flags say what the table allows; past two cards the rules of
    /// the game say no regardless, so even the permissive row must come back
    /// hit-or-stand.
    @Test func answersEveryThreeCardHandWithHitOrStand() {
        var bad: [String] = []
        let offers = [(true, true, true), (false, false, false)]
        for options in Self.optionSets {
            for (dbl, split, sur) in offers {
                for a in Rank.allCases {
                    for b in Rank.allCases {
                        for c in Rank.allCases {
                            let cards = [a, b, c].map(card)
                            if Hand.isBust(cards) { continue }
                            for up in Rank.allCases {
                                let decision = engine.decidePlay(play(
                                    [a, b, c], vs: up, .h17, options,
                                    canDouble: dbl, canSplit: split, canSurrender: sur
                                ))
                                if decision.action != .hit, decision.action != .stand {
                                    bad.append("\(a.rawValue),\(b.rawValue),\(c.rawValue): "
                                        + "\(decision.action)")
                                }
                                if !decision.handDescription.contains("\(Hand.total(cards))") {
                                    bad.append("\(a.rawValue),\(b.rawValue),\(c.rawValue): "
                                        + decision.handDescription)
                                }
                            }
                        }
                    }
                }
            }
        }
        #expect(bad.isEmpty)
    }

    @Test func readsMultiCardTotalsOffTheRightChart() {
        let s17 = Self.optionSets[0]
        let hard16 = engine.decidePlay(play([.five, .four, .seven], vs: .ten, .s17, s17))
        #expect(hard16.action == .hit)
        #expect(hard16.handDescription == "Hard 16")

        let soft17 = engine.decidePlay(play([.ace, .two, .four], vs: .ten, .s17, s17))
        #expect(soft17.action == .hit)
        #expect(soft17.handDescription == "Soft 17")

        // A+9+8 is 18 hard, not 28.
        let demoted = engine.decidePlay(play([.ace, .nine, .eight], vs: .ten, .s17, s17))
        #expect(demoted.action == .stand)
        #expect(demoted.handDescription == "Hard 18")
    }

    @Test func fallsUnavailableActionsBackTheWayTheChartReads() {
        let s17 = Self.optionSets[0]
        let ls = EngineOptions(doubleAfterSplit: false, lateSurrender: true)

        // Hard 11 vs 6 doubles; without a double it hits.
        #expect(engine.decidePlay(play([.six, .five], vs: .six, .s17, s17)).action == .double)
        let noDouble = engine.decidePlay(play([.six, .five], vs: .six, .s17, s17, canDouble: false))
        #expect(noDouble.action == .hit)

        // Soft 18 vs 6 is `Ds` under S17: the small 's' means stand, not hit.
        #expect(engine.decidePlay(play([.ace, .seven], vs: .six, .s17, s17)).action == .double)
        let ds = engine.decidePlay(play([.ace, .seven], vs: .six, .s17, s17, canDouble: false))
        #expect(ds.action == .stand)

        // Hard 16 vs 9 surrenders with LS on; hits when surrender has lapsed.
        #expect(engine.decidePlay(play([.ten, .six], vs: .nine, .s17, ls)).action == .surrender)
        let lapsed = engine.decidePlay(play([.ten, .six], vs: .nine, .s17, ls, canSurrender: false))
        #expect(lapsed.action == .hit)
    }

    /// A pair of aces is the one hand whose total falls off the bottom of the
    /// soft chart, so it only shows up when the split is unavailable.
    @Test func hitsAnUnsplittablePairOfAces() {
        let s17 = Self.optionSets[0]
        for up in Rank.allCases {
            let decision = engine.decidePlay(play([.ace, .ace], vs: up, .s17, s17, canSplit: false))
            #expect(decision.action == .hit, "A,A vs \(up.rawValue)")
            #expect(decision.handDescription == "Soft 12")
        }
    }

    @Test func standsATotalOffTheTopOfTheChart() {
        let s17 = Self.optionSets[0]
        #expect(engine.decidePlay(play([.seven, .seven, .seven], vs: .ten, .s17, s17))
            .action == .stand)
        #expect(engine.decidePlay(play([.ace, .five, .five], vs: .ten, .s17, s17))
            .action == .stand)
    }

    // The drill grades a played-out hand through this, so it has to carry the
    // same verdict shape `evaluate` does.

    private var hard16: PlayInput {
        play([.ten, .four, .two], vs: .ten, .s17, Self.optionSets[0])
    }

    @Test func evaluatePlayGradesAContinuedDecision() {
        let right = engine.evaluatePlay(hard16, userAction: .hit)
        #expect(right.correct)
        #expect(right.userAction == .hit)
        #expect(right.reason.contains("Hard 16 vs dealer 10 under S17: hit"))

        let wrong = engine.evaluatePlay(hard16, userAction: .stand)
        #expect(!wrong.correct)
        #expect(wrong.action == .hit)
    }

    @Test func evaluatePlayKeepsTheInsuranceVerdict() {
        let result = engine.evaluatePlay(hard16, userAction: .insurance)
        #expect(!result.correct)
        #expect(result.source == .insurance)
        #expect(result.reason.contains("never takes insurance"))
    }
}
