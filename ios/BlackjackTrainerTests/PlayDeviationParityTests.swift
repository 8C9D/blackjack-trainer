import Testing
@testable import BlackjackTrainer

/// The table's count-aware answer, graded against `play-deviation-vectors.json`.
///
/// `resolvePlayDecision` is where the two implementations are most likely to
/// drift: it wraps `decidePlay` rather than `decide`, so it has to classify a
/// hand that may be three cards deep and refuse an index whose play the felt is
/// not offering. Neither of those is exercised by the trainer's own vectors.
///
/// The fixture lists only the combinations where an index fires. This walks the
/// declared domain and asserts both halves — a listed combination deviates to
/// the named action and rule, and an unlisted one does not deviate at all and
/// still equals `decidePlay`.
struct PlayDeviationParityTests {
    /// One combination of the domain, flattened out of the nested loops so the
    /// comparison below reads as a single statement per row.
    private struct Case {
        let key: String
        let label: String
        let trueCount: Int
        let input: PlayInput
    }

    private func cases(_ domain: PlayDeviationDomain) -> [Case] {
        var out: [Case] = []
        for (handIndex, hand) in domain.hands.enumerated() {
            let cards = hand.cards.map { card($0) }
            for (dealerIndex, dealer) in domain.dealers.enumerated() {
                for trueCount in domain.trueCounts {
                    for ruleSetRaw in domain.ruleSets {
                        guard let ruleSet = RuleSet(rawValue: ruleSetRaw) else { continue }
                        for ls in domain.lateSurrender {
                            for (limitIndex, limits) in domain.restrictions.enumerated() {
                                out.append(Case(
                                    key: "\(handIndex)|\(dealerIndex)|\(trueCount)|"
                                        + "\(ruleSetRaw)|\(ls)|\(limitIndex)",
                                    label: "\(hand.label) v\(dealer) tc=\(trueCount) "
                                        + "\(ruleSetRaw) ls=\(ls) limits=\(limits)",
                                    trueCount: trueCount,
                                    input: PlayInput(
                                        player: cards,
                                        dealerUpcard: card(dealer),
                                        ruleSet: ruleSet,
                                        options: EngineOptions(
                                            doubleAfterSplit: domain.doubleAfterSplit,
                                            lateSurrender: ls
                                        ),
                                        canDouble: limits[0],
                                        canSplit: limits[1],
                                        canSurrender: limits[2]
                                    )
                                ))
                            }
                        }
                    }
                }
            }
        }
        return out
    }

    /// The complaint about one combination, or nil when it agrees.
    private func mismatch(_ item: Case, row: PlayDeviationRow?, sources: [String],
                          engine: DeviationEngine, basic: BasicStrategyEngine) -> String? {
        let got = engine.resolvePlayDecision(item.input, trueCount: item.trueCount)
        guard let row else {
            guard got.deviationApplied || got.decision != basic.decidePlay(item.input) else {
                return nil
            }
            return "\(item.label): deviated where the web did not (\(got.action.rawValue))"
        }
        let wantSource = sources[row.matchedRuleSourceIndex]
        guard !got.deviationApplied || got.action.rawValue != row.action
            || got.matchedRule?.source != wantSource
        else { return nil }
        return "\(item.label): got (\(got.action.rawValue),\(got.deviationApplied),"
            + "\(got.matchedRule?.source ?? "nil")) want (\(row.action),true,\(wantSource))"
    }

    @Test func everyPlayDeviationVectorMatches() throws {
        let charts = try GameData.loadCharts()
        let basic = BasicStrategyEngine(charts: charts)
        let engine = DeviationEngine(basic: basic, charts: charts)
        let file = try Fixtures.load(PlayDeviationVectorsFile.self, "play-deviation-vectors")
        #expect(file.deviations.count == file.count)
        #expect(file.count > 0)

        var expected: [String: PlayDeviationRow] = [:]
        for row in file.deviations {
            expected[row.key] = row
        }

        let items = cases(file.domain)
        #expect(items.count == file.examined)
        let mismatches = items.compactMap {
            mismatch($0, row: expected[$0.key], sources: file.sources,
                     engine: engine, basic: basic)
        }
        #expect(mismatches.isEmpty,
                "\(mismatches.count) mismatches; first: \(mismatches.first ?? "")")
    }
}
