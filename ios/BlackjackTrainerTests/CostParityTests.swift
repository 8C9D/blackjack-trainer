import Testing
@testable import BlackjackTrainer

/// The value tables are the same bytes on both platforms, so reading them is where
/// the two could still differ: which row a hand reads, what a hard 20 falls back
/// to, how a count clamps, how a tie rounds. Graded against cost-vectors.json, every
/// expectation read from the fixture.
struct CostParityTests {
    private let hard16v10 = ScenarioRef(kind: "hard", hand: "16", dealer: "10")

    private func playCost() throws -> PlayCost {
        try PlayCost(GameData.loadEvTables())
    }

    private func vectors() throws -> CostVectorsFile {
        try Fixtures.load(CostVectorsFile.self, "cost-vectors")
    }

    @Test func everyRowReadsTheSameValues() throws {
        let cost = try playCost()
        let file = try vectors()
        #expect(file.columns == [
            "kind", "hand", "dealer", "ruleSet", "das", "lateSurrender", "trueCount",
            "hit", "stand", "double", "split", "surrender", "cheapestMiss"
        ])
        // 35 hands × 10 upcards × 2 rule sets × 2 option pairs × 7 counts.
        #expect(file.count == 9800)
        #expect(file.rows.count == 9800)

        var mismatches: [String] = []
        for row in file.rows {
            let ruleSet = try #require(RuleSet(rawValue: row.ruleSet))
            let context = PlayContext(
                ruleSet: ruleSet,
                options: EngineOptions(
                    doubleAfterSplit: row.das,
                    lateSurrender: row.lateSurrender
                ),
                trueCount: row.trueCount
            )
            let got = [
                cost.playValue(row.ref, .hit, context),
                cost.playValue(row.ref, .stand, context),
                cost.playValue(row.ref, .double, context),
                cost.playValue(row.ref, .split, context),
                cost.playValue(row.ref, .surrender, context),
                cost.cheapestMiss(row.ref, context)
            ]
            let want = [row.hit, row.stand, row.double, row.split, row.surrender, row.cheapestMiss]
            if got != want {
                mismatches.append(
                    "\(scenarioKey(row.ref)) \(row.ruleSet) das=\(row.das) "
                        + "ls=\(row.lateSurrender) tc=\(String(describing: row.trueCount)): "
                        + "got \(got) want \(want)"
                )
            }
        }
        #expect(
            mismatches.isEmpty,
            "\(mismatches.count) mismatches; first: \(mismatches.first ?? "")"
        )
    }

    @Test func everyCostCaseMatches() throws {
        let cost = try playCost()
        let cases = try vectors().costCases
        #expect(!cases.isEmpty)
        for vector in cases {
            let played = try #require(Action(rawValue: vector.played))
            let correct = try #require(Action(rawValue: vector.correct))
            let context = PlayContext(
                ruleSet: .s17,
                options: EngineOptions(doubleAfterSplit: false, lateSurrender: false),
                trueCount: vector.trueCount
            )
            #expect(
                cost.costOfPlay(hard16v10, played: played, correct: correct, context)
                    == vector.cost,
                "\(vector.played) for \(vector.correct) at \(String(describing: vector.trueCount))"
            )
        }
    }

    @Test func everyShareCaseFormatsTheSame() throws {
        let cases = try vectors().shareCases
        #expect(!cases.isEmpty)
        for vector in cases {
            #expect(formatBetShare(vector.units) == vector.share)
            #expect(costSentence(vector.units) == vector.sentence)
        }
    }

    @Test func everyLeakCaseMatches() throws {
        let cost = try playCost()
        let cases = try vectors().leakCases
        #expect(!cases.isEmpty)
        for vector in cases {
            let spots = vector.spots.map { spot in
                WeakSpot(
                    ref: spot.ref,
                    label: "",
                    misses: spot.misses,
                    attempts: spot.attempts,
                    costPerMiss: spot.costPerMiss
                )
            }
            let difference = abs(cost.tableLeak(spots) - vector.leak)
            #expect(difference < 1e-9, "got \(cost.tableLeak(spots)) want \(vector.leak)")
        }
    }

    @Test func everyHouseEdgeCaseMatches() throws {
        let cost = try playCost()
        let cases = try vectors().houseEdgeCases
        #expect(cases.count == 8)
        for vector in cases {
            let ruleSet = try #require(RuleSet(rawValue: vector.ruleSet))
            let options = EngineOptions(doubleAfterSplit: vector.das, lateSurrender: vector.ls)
            #expect(cost.houseEdge(ruleSet, options) == vector.edge)
        }
    }
}
