import Testing
@testable import BlackjackTrainer

/// Slice 1.4 — counting engine, graded against counting-vectors.json: per-system
/// running/true counts over fixed sequences (color, fractional, and
/// truncation-toward-zero cases) plus the scoreDeckEstimate boundaries.
struct CountingParityTests {
    private let engine = CountingEngine()

    @Test func everyCountingVectorMatches() throws {
        let systems = try GameData.loadCountingSystems()
        let byID = Dictionary(uniqueKeysWithValues: systems.map { ($0.id, $0) })
        let file = try Fixtures.load(CountingVectorsFile.self, "counting-vectors")
        #expect(file.systems.count == 58)

        var mismatches: [String] = []
        for systemVectors in file.systems {
            guard let system = byID[systemVectors.systemId] else {
                mismatches.append("unknown system \(systemVectors.systemId)")
                continue
            }
            // The engine's fractional computation matches the exported flag.
            if engine.isFractionalSystem(system) != systemVectors.isFractional {
                mismatches.append("\(system.id): isFractional mismatch")
            }
            for sequence in systemVectors.sequences {
                let runningCount = engine.runningCount(sequence.cards, system: system)
                let trueCount = engine.trueCount(runningCount: runningCount,
                                                 decksRemaining: sequence.decksRemaining)
                if abs(runningCount - sequence.runningCount) > 1e-9 || trueCount != sequence
                    .trueCount {
                    mismatches.append(
                        "\(system.id)/\(sequence.label): got rc=\(runningCount) tc=\(trueCount) "
                            + "want rc=\(sequence.runningCount) tc=\(sequence.trueCount)"
                    )
                }
            }
        }
        #expect(
            mismatches.isEmpty,
            "\(mismatches.count) mismatches; first: \(mismatches.first ?? "")"
        )
    }

    @Test func deckEstimateBoundariesMatch() throws {
        let file = try Fixtures.load(CountingVectorsFile.self, "counting-vectors")
        for testCase in file.deckEstimateCases {
            let got: Bool = if let tolerance = testCase.tolerance {
                engine.scoreDeckEstimate(estimate: testCase.estimate, actual: testCase.actual,
                                         tolerance: tolerance)
            } else {
                engine.scoreDeckEstimate(estimate: testCase.estimate, actual: testCase.actual)
            }
            #expect(got == testCase.withinBand,
                    "estimate \(testCase.estimate) actual \(testCase.actual): got \(got)")
        }
    }

    @Test func truncationTowardZero() {
        // The cited boundary: −5 over 2 decks → −2 (not −3); +5 → +2.
        #expect(engine.trueCount(runningCount: -5, decksRemaining: 2) == -2)
        #expect(engine.trueCount(runningCount: 5, decksRemaining: 2) == 2)
        #expect(engine.trueCount(runningCount: -1, decksRemaining: 2) == 0)
    }

    @Test func koIsUnbalancedAndRunningCountOnly() throws {
        // KO drives the Count screen's running-count-only restriction by being
        // unbalanced (a full deck does not sum to zero).
        let systems = try GameData.loadCountingSystems()
        let ko = try #require(systems.first { $0.id == "ko" })
        #expect(!ko.balanced)
        let fullDeck = Card.allRanks
            .flatMap { rank in Card.allSuits.map { Card(rank: rank, suit: $0) } }
        #expect(engine.runningCount(fullDeck, system: ko) != 0)
    }

    @Test func answerValidators() {
        #expect(engine.isValidIntegerAnswer("-3"))
        #expect(engine.isValidIntegerAnswer("12"))
        #expect(!engine.isValidIntegerAnswer("2.5"))
        #expect(!engine.isValidIntegerAnswer("abc"))
        #expect(engine.isValidDecimalAnswer("2.5"))
        #expect(engine.isValidDecimalAnswer("-0.5"))
        #expect(engine.isValidDecimalAnswer("3"))
        #expect(!engine.isValidDecimalAnswer("."))
    }
}
