import Testing
@testable import BlackjackTrainer

/// The bet spread: band arithmetic, the bounds/advisory split, tolerant decode,
/// and the graded round. Mirrors the web `bet-ramp.model.spec.ts` plus the
/// `evaluateBetSpread` half of `counting-engine.service.spec.ts`.
struct BetRampTests {
    private let engine = CountingEngine()
    /// 2..6 is +5 Hi-Lo; over one deck that is true count +5, the top band.
    private let round: [Card] = [.two, .three, .four, .five, .six]
        .map { Card(rank: $0, suit: .spades) }

    private func hiLo() throws -> CountingSystem {
        try #require(GameData.loadCountingSystems().first { $0.id == "hi-lo" })
    }

    @Test func hasOneLabelPerBandAndADefaultEntryForEach() {
        #expect(BetRamp.bandLabels.count == BetRamp.bands)
        #expect(BetRamp.default.count == BetRamp.bands)
    }

    @Test func everythingAtOrBelowPlusOneIsTheFirstBand() {
        for trueCount in [-9, -1, 0, 1] {
            #expect(BetRamp.bandIndex(trueCount: trueCount) == 0)
        }
    }

    @Test func plusTwoThroughPlusFourEachGetABandAndTheRestCap() {
        #expect(BetRamp.bandIndex(trueCount: 2) == 1)
        #expect(BetRamp.bandIndex(trueCount: 3) == 2)
        #expect(BetRamp.bandIndex(trueCount: 4) == 3)
        for trueCount in [5, 6, 20] {
            #expect(BetRamp.bandIndex(trueCount: trueCount) == BetRamp.bands - 1)
        }
    }

    @Test func readsTheDefaultSpreadAcrossTheBands() {
        let ramp = BetRamp.default
        #expect(BetRamp.units(trueCount: 0, ramp: ramp) == 1)
        #expect(BetRamp.units(trueCount: 1, ramp: ramp) == 1)
        #expect(BetRamp.units(trueCount: 2, ramp: ramp) == 2)
        #expect(BetRamp.units(trueCount: 3, ramp: ramp) == 4)
        #expect(BetRamp.units(trueCount: 4, ramp: ramp) == 8)
        #expect(BetRamp.units(trueCount: 9, ramp: ramp) == 12)
    }

    @Test func validationRejectsOnlyOutOfRangeUnits() {
        #expect(BetRamp.validate(BetRamp.default).isEmpty)
        #expect(BetRamp.validate([0, 2, 4, 8, 12]).count == 1)
        #expect(BetRamp.validate([1, 2, 4, 8, BetRamp.maxUnits + 1]).count == 1)
        #expect(BetRamp.validate([1, 2]).count == 1)
        // A shrinking ramp is an advisory, not an error.
        #expect(BetRamp.validate([12, 8, 4, 2, 1]).isEmpty)
        #expect(BetRamp.shrinks([12, 8, 4, 2, 1]))
        #expect(!BetRamp.shrinks(BetRamp.default))
        #expect(!BetRamp.shrinks([1, 1, 4, 4, 12]))
    }

    @Test func normalizationReplacesOnlyTheBandsItCannotUse() {
        #expect(BetRamp.normalized([1, 3, 6, 10, 20]) == [1, 3, 6, 10, 20])
        #expect(BetRamp.normalized(nil) == BetRamp.default)
        #expect(BetRamp.normalized("1,2,4") == BetRamp.default)
        #expect(BetRamp.normalized([2, "x", 4.5, 0, 20]) == [
            2, BetRamp.default[1], BetRamp.default[2], BetRamp.default[3], 20
        ])
        #expect(BetRamp.normalized([5, 5]) == [5, 5] + BetRamp.default.dropFirst(2))
    }

    @Test func gradesTheTrueCountAndTheBetAgainstTheRampAtThatCount() throws {
        let result = try engine.evaluateBetSpread(
            round,
            answer: BetSpreadAnswer(trueCount: 5, units: 12),
            decksRemaining: 1,
            system: hiLo(),
            ramp: BetRamp.default
        )
        #expect(result.correctRunningCount == 5)
        #expect(result.correctTrueCount == 5)
        #expect(result.countCorrect)
        #expect(result.correctUnits == 12)
        #expect(result.betCorrect)
        #expect(result.isCorrect)
        #expect(result.ramp == BetRamp.default)
    }

    @Test func aRepIsCorrectOnlyWhenBothTheCountAndTheBetAre() throws {
        let wrongBet = try engine.evaluateBetSpread(
            round,
            answer: BetSpreadAnswer(trueCount: 5, units: 4),
            decksRemaining: 1,
            system: hiLo(),
            ramp: BetRamp.default
        )
        #expect(wrongBet.countCorrect)
        #expect(!wrongBet.betCorrect)
        #expect(!wrongBet.isCorrect)

        let wrongCount = try engine.evaluateBetSpread(
            round,
            answer: BetSpreadAnswer(trueCount: 3, units: 12),
            decksRemaining: 1,
            system: hiLo(),
            ramp: BetRamp.default
        )
        #expect(!wrongCount.countCorrect)
        #expect(wrongCount.betCorrect)
        #expect(!wrongCount.isCorrect)
    }

    @Test func gradesTheBetAtTheCorrectCountNotTheClaimedOne() throws {
        // Two decks: +5 running is true count +2 → 2 units. Calling +5 and
        // betting the +5 band's 12 units is wrong on both halves.
        let result = try engine.evaluateBetSpread(
            round,
            answer: BetSpreadAnswer(trueCount: 5, units: 12),
            decksRemaining: 2,
            system: hiLo(),
            ramp: BetRamp.default
        )
        #expect(result.correctTrueCount == 2)
        #expect(result.correctUnits == 2)
        #expect(!result.countCorrect)
        #expect(!result.betCorrect)
    }

    @Test func foldsInTheCountCarriedFromEarlierRounds() throws {
        let result = try engine.evaluateBetSpread(
            round,
            answer: BetSpreadAnswer(trueCount: 4, units: 8),
            decksRemaining: 2,
            system: hiLo(),
            ramp: BetRamp.default,
            priorRunningCount: 4
        )
        #expect(result.priorRunningCount == 4)
        #expect(result.correctRunningCount == 9)
        #expect(result.correctTrueCount == 4)
        #expect(result.correctUnits == 8)
        #expect(result.isCorrect)
    }

    @Test func onlyBetSpreadModeIsHeldToTheRamp() {
        var settings = CountingDrillSettings()
        settings.betRamp = [0, 2, 4, 8, 12]
        settings.trueCountSource = .classic
        settings.decksRemaining = 2
        #expect(engine.validateSettings(settings).valid)
        settings.mode = .trueCount
        #expect(engine.validateSettings(settings).valid)
        settings.mode = .betSpread
        let graded = engine.validateSettings(settings)
        #expect(!graded.valid)
        #expect(graded.errors.contains { $0.contains("Bet spread units") })
    }

    @Test func betSpreadSharesTheTrueCountShoeChecks() {
        var settings = CountingDrillSettings()
        settings.mode = .betSpread
        settings.trueCountSource = .liveShoe
        settings.numberOfDecks = 1
        settings.numberOfCards = 52
        #expect(!engine.validateSettings(settings).valid)
        settings.trueCountSource = .classic
        settings.decksRemaining = 0
        #expect(!engine.validateSettings(settings).valid)
    }

    @Test func everyExportedRampVectorMatches() throws {
        let file = try Fixtures.load(CountingVectorsFile.self, "counting-vectors")
        #expect(!file.betRampCases.isEmpty)
        for rampCase in file.betRampCases {
            for call in rampCase.calls {
                let units = BetRamp.units(trueCount: call.trueCount, ramp: rampCase.ramp)
                #expect(units == call.units, "ramp \(rampCase.ramp) at TC \(call.trueCount)")
            }
        }
    }
}
