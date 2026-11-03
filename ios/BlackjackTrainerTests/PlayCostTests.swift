import Testing
@testable import BlackjackTrainer

private let das = EngineOptions(doubleAfterSplit: true, lateSurrender: false)
private let dasLs = EngineOptions(doubleAfterSplit: true, lateSurrender: true)
private let noRules = EngineOptions(doubleAfterSplit: false, lateSurrender: false)

private func hard(_ total: Int, _ dealer: String) -> ScenarioRef {
    ScenarioRef(kind: "hard", hand: String(total), dealer: dealer)
}

private func pair(_ rank: String, _ dealer: String) -> ScenarioRef {
    ScenarioRef(kind: "pair", hand: rank, dealer: dealer)
}

private func spot(_ ref: ScenarioRef, _ misses: Int, _ attempts: Int, _ cost: Double?) -> WeakSpot {
    WeakSpot(ref: ref, label: "", misses: misses, attempts: attempts, costPerMiss: cost)
}

/// Mirrors `play-cost.spec.ts`. The parity vectors hold every read to the web's;
/// these say what the reads are for.
struct PlayCostTests {
    private let cost = CostFixture.playCost
    private let s17 = PlayContext(ruleSet: .s17, options: das)

    private func upcard(_ key: String) throws -> Int {
        try #require(cost.table.upcards.firstIndex(of: key))
    }

    @Test func readsAPlayOffTheFullShoeTable() throws {
        let column = try upcard("10")
        let rules = cost.table.rules.s17
        #expect(cost.playValue(hard(16, "10"), .hit, s17) == rules.hit["hard-16"]?[column])
        #expect(cost.playValue(hard(16, "10"), .stand, s17) == rules.stand["hard-16"]?[column])
    }

    @Test func pricesASurrenderAtHalfTheBetWhateverTheHand() {
        let context = PlayContext(ruleSet: .s17, options: dasLs)
        #expect(cost.playValue(hard(16, "10"), .surrender, context) == -5000)
        #expect(cost.playValue(hard(99, "10"), .surrender, context) == -5000)
    }

    @Test func tellsASplitWithDasFromOneWithout() throws {
        let withDas = try #require(cost.playValue(pair("4", "5"), .split, s17))
        let without = try #require(
            cost.playValue(pair("4", "5"), .split, PlayContext(ruleSet: .s17, options: noRules))
        )
        #expect(withDas > without)
    }

    @Test func readsTheTwoTotalsThatOnlyExistAsPairsFromThePair() {
        #expect(cost.playValue(hard(20, "6"), .stand, s17)
            == cost.playValue(pair("10", "6"), .stand, s17))
        #expect(cost.playValue(hard(4, "6"), .hit, s17)
            == cost.playValue(pair("2", "6"), .hit, s17))
        #expect(cost.tableFrequency(hard(20, "6")) == cost.tableFrequency(pair("10", "6")))
        #expect(cost.tableFrequency(hard(4, "6")) == cost.tableFrequency(pair("2", "6")))
    }

    @Test func hasNoValueForAPlayThatIsNotAPlayOfTheHand() {
        #expect(cost.playValue(hard(16, "10"), .insurance, s17) == nil)
    }

    @Test func measuresAMistakeAgainstTheRightPlay() throws {
        // Over an eighth of the bet: the mistake this whole module exists for.
        let miss = try #require(cost.costOfPlay(
            pair("10", "6"),
            played: .split,
            correct: .stand,
            s17
        ))
        #expect(miss > 1250)
    }

    @Test func tellsACoinFlipFromABlunderWhichGradingCannot() throws {
        let flip = try #require(cost.costOfPlay(hard(16, "10"), played: .stand, correct: .hit, s17))
        #expect(flip < 100)
    }

    /// Backwards on purpose: naming a worse play as correct still costs nothing.
    @Test func neverCallsAMistakeProfitable() {
        #expect(cost.costOfPlay(pair("10", "6"), played: .stand, correct: .split, s17) == 0)
    }

    @Test func chargesNothingForTheRightPlayInsuranceIncluded() {
        #expect(cost.costOfPlay(hard(16, "10"), played: .hit, correct: .hit, s17) == 0)
        #expect(cost.costOfPlay(hard(16, "A"), played: .insurance, correct: .insurance, s17) == 0)
        // The early return comes before any table is read.
        #expect(cost.costOfPlay(hard(99, "10"), played: .hit, correct: .hit, s17) == 0)
    }

    @Test func pricesInsuranceAsASideBet() {
        #expect(cost.costOfPlay(hard(16, "A"), played: .insurance, correct: .hit, s17)
            == -cost.table.insurance)
    }

    @Test func hasNothingToSayAboutAHandOffTheTable() {
        #expect(cost.costOfPlay(hard(99, "10"), played: .hit, correct: .stand, s17) == nil)
    }

    @Test func cheapestMissIsTheGapToTheNextBestPlay() throws {
        let ref = hard(11, "6")
        let double = try #require(cost.playValue(ref, .double, s17))
        let hit = try #require(cost.playValue(ref, .hit, s17))
        #expect(cost.cheapestMiss(ref, s17) == double - hit)
    }

    @Test func onlyCountsSurrenderWhereTheTableOffersOne() {
        let withSurrender = PlayContext(ruleSet: .s17, options: dasLs)
        #expect(cost.cheapestMiss(hard(16, "10"), withSurrender)
            != cost.cheapestMiss(hard(16, "10"), s17))
    }

    @Test func offersASplitOnlyOnAPair() throws {
        let gap = try #require(cost.cheapestMiss(pair("A", "6"), s17))
        #expect(gap > 0)
    }

    @Test func offersNoDoubleOnAPlayedOutHard20() throws {
        let stand = try #require(cost.playValue(hard(20, "6"), .stand, s17))
        let hit = try #require(cost.playValue(hard(20, "6"), .hit, s17))
        #expect(cost.cheapestMiss(hard(20, "6"), s17) == stand - hit)
    }

    @Test func hasNothingToCompareOnAHandOffTheTable() {
        #expect(cost.cheapestMiss(hard(99, "10"), s17) == nil)
    }

    @Test func findsCommonHandsCommonAndRareOnesRare() {
        #expect(cost.tableFrequency(pair("10", "10")) > cost.tableFrequency(pair("2", "2")))
        #expect(cost.tableFrequency(hard(99, "10")) == 0)
    }

    @Test func leakIsWhatTheHandCostsHowOftenItIsMissedAndHowOftenItComesUp() {
        let ref = hard(16, "10")
        let expected = cost.tableFrequency(ref) * 0.75 * 400
        #expect(abs(cost.tableLeak([spot(ref, 3, 3, 400)]) - expected) < 1e-9)
    }

    @Test func leakDoesNotReadOneMissAsAHundredPercent() {
        let ref = hard(16, "10")
        let expected = cost.tableFrequency(ref) * 0.5 * 400
        #expect(abs(cost.tableLeak([spot(ref, 1, 1, 400)]) - expected) < 1e-9)
    }

    @Test func leakAddsNothingForASpotTheTablesCannotPrice() {
        #expect(cost.tableLeak([spot(hard(16, "10"), 1, 1, nil)]) == 0)
        #expect(cost.tableLeak([]) == 0)
    }

    @Test func readsTheFourCombinationsOfTheOptionalRules() {
        let edges = cost.table.houseEdge.h17
        #expect(cost.houseEdge(.h17, dasLs) == edges.das.surrender)
        #expect(cost.houseEdge(.h17, das) == edges.das.noSurrender)
        #expect(cost.houseEdge(.h17, .surrenderOffered) == edges.noDas.surrender)
        #expect(cost.houseEdge(.h17, noRules) == edges.noDas.noSurrender)
    }

    /// The table rules read as preferences until they carry a price: the two ends
    /// of what the Settings hint can say. Mirrors `settings-page.component.spec`.
    @Test func statesAHouseEdgeThatMovesWithTheRules() {
        #expect(formatBetShare(cost.houseEdge(.s17, dasLs)) == "0.3%")
        #expect(formatBetShare(cost.houseEdge(.h17, noRules)) == "0.8%")
    }
}

/// The formatting needs no tables, and pins the ties a platform's own formatter
/// would break the other way.
struct PlayCostFormattingTests {
    @Test(arguments: [
        (1.0, "under 0.1%"), (9, "under 0.1%"), (9.99, "under 0.1%"), (10, "0.1%"),
        (25, "0.3%"), (35, "0.4%"), (45, "0.5%"), (340, "3.4%"), (994, "9.9%"),
        (995, "10%"), (1000, "10%"), (1250, "13%"), (2875, "29%")
    ])
    func formatsABetShare(units: Double, label: String) {
        #expect(formatBetShare(units) == label)
    }

    @Test func callsAThinMarginWhatItIs() {
        #expect(costSentence(30) == "A close call: that play gives up 0.3% of your bet.")
        #expect(costSentence(44) == "A close call: that play gives up 0.4% of your bet.")
    }

    /// Judged on the printed figure: 46 and 50 hundredths both print 0.5%, and one
    /// reading "a close call" while the other did not was two verdicts on one number.
    @Test func givesEveryCostThatPrintsTheSameTheSameVerdict() {
        #expect(costSentence(46) == "That play gives up 0.5% of your bet.")
        #expect(costSentence(49) == "That play gives up 0.5% of your bet.")
    }

    @Test func pricesARealMistakePlainly() {
        #expect(costSentence(50) == "That play gives up 0.5% of your bet.")
        #expect(costSentence(340) == "That play gives up 3.4% of your bet.")
    }
}

/// The sampled table fills in after the export this suite runs against may have
/// been cut, so the count path is held to a table the spec controls. Mirrors the
/// reads `cost-vectors.json` pins once the cells are filled.
struct PlayCostByCountTests {
    private let cost = CostFixture.counted(["hard-16-v-10": CostFixture.hard16Cell])
    private let ref = hard(16, "10")

    private func at(_ trueCount: Int?) -> PlayContext {
        PlayContext(ruleSet: .s17, options: noRules, trueCount: trueCount)
    }

    @Test func readsAnIndexedHandAtTheCount() {
        #expect(cost.playValue(ref, .stand, at(-2)) == -5600)
        #expect(cost.playValue(ref, .stand, at(0)) == -4970)
        #expect(cost.playValue(ref, .stand, at(2)) == -3000)
    }

    @Test func clampsACountOffEitherEndOfTheRange() {
        #expect(cost.playValue(ref, .stand, at(-30)) == -5600)
        #expect(cost.playValue(ref, .stand, at(30)) == -3000)
    }

    @Test func readsAFullShoeWithNoCountInTheQuestion() {
        #expect(cost.playValue(ref, .stand, at(nil))
            == CostFixture.playCost.playValue(ref, .stand, at(nil)))
    }

    @Test func fallsBackToAFullShoeForAColumnTheCellDoesNotHold() {
        #expect(cost.playValue(ref, .double, at(1))
            == CostFixture.playCost.playValue(ref, .double, at(nil)))
    }

    @Test func fallsBackToAFullShoeForAHandWithNoIndex() {
        let other = hard(12, "4")
        #expect(cost.playValue(other, .hit, at(1))
            == CostFixture.playCost.playValue(other, .hit, at(nil)))
    }

    /// The sampled cells key the hand as dealt, so a played-out hard 20 only
    /// reaches the tens through the full-shoe table's row fallback.
    @Test func keysACellByTheHandAsDealt() {
        let tens = CostFixture.counted(["pair-10-v-6": ["stand": [1, 2, 3, 4, 5]]])
        #expect(tens.playValue(pair("10", "6"), .stand, at(0)) == 3)
        #expect(tens.playValue(hard(20, "6"), .stand, at(0))
            == CostFixture.playCost.playValue(hard(20, "6"), .stand, at(nil)))
    }

    @Test func readsTheRuleSetsOwnCells() {
        let h17 = PlayContext(ruleSet: .h17, options: noRules, trueCount: 1)
        #expect(cost.playValue(ref, .stand, h17)
            == CostFixture.playCost.playValue(
                ref,
                .stand,
                PlayContext(ruleSet: .h17, options: noRules)
            ))
    }

    @Test func measuresACostAtTheCount() {
        #expect(cost.costOfPlay(ref, played: .hit, correct: .stand, at(2)) == 2000)
        // Right on the index the two are within noise: a close call, never a gain.
        #expect(cost.costOfPlay(ref, played: .hit, correct: .stand, at(-2)) == 0)
    }

    @Test func measuresTheCheapestMissAtTheCount() {
        #expect(cost.cheapestMiss(ref, at(1)) == 1000)
    }

    @Test func pricesInsuranceAtTheCountAndClampsIt() {
        let taken = cost.costOfPlay(ref, played: .insurance, correct: .hit, at(-1))
        #expect(taken == 200)
        #expect(cost.costOfPlay(ref, played: .insurance, correct: .hit, at(-30)) == 400)
        #expect(cost.costOfPlay(ref, played: .insurance, correct: .hit, at(2)) == 0)

        #expect(cost.costOfPlay(ref, played: .hit, correct: .insurance, at(1)) == 200)
        #expect(cost.costOfPlay(ref, played: .hit, correct: .insurance, at(30)) == 400)
        #expect(cost.costOfPlay(ref, played: .hit, correct: .insurance, at(-2)) == 0)
    }

    @Test func pricesInsuranceAtAFullShoeWithNoCountInTheQuestion() {
        #expect(cost.costOfPlay(ref, played: .insurance, correct: .hit, at(nil))
            == -cost.table.insurance)
    }

    /// A short table is a broken export, which every other read turns into a gap
    /// rather than a crash mid-drill.
    @Test func readsAShortRowAsAGap() {
        let short = CostFixture.counted(["hard-16-v-10": ["stand": [1]]], insurance: [])
        #expect(short.playValue(ref, .stand, at(2))
            == CostFixture.playCost.playValue(ref, .stand, at(nil)))
        #expect(short.costOfPlay(ref, played: .insurance, correct: .hit, at(2))
            == -short.table.insurance)
    }
}
