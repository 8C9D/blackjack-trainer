import Foundation

/// A surrender gives up half the bet, whatever the hand.
private let surrenderValue: Double = -5000

/// Below this a mistake is a coin flip the chart happened to call, which is worth
/// saying: a trainee should spend their attention elsewhere.
private let closeCall: Double = 50

/// The table a play is priced at. Mirrors the web `PlayContext`.
struct PlayContext {
    let ruleSet: RuleSet
    let options: EngineOptions
    /// Only where the count is part of the question. Without one, values are read
    /// at a full shoe, which is what basic strategy is.
    var trueCount: Int?

    func at(trueCount: Int) -> PlayContext {
        PlayContext(ruleSet: ruleSet, options: options, trueCount: trueCount)
    }
}

/// What a play is worth, and what a mistake costs. Grading says right or wrong;
/// this says how much, because the two are nothing alike: hitting 16 v 10 instead
/// of standing at a neutral count gives up half a percent of the bet, and splitting
/// tens against a six gives up an eighth of it. A trainer that treats those as the
/// same mistake is teaching the wrong thing to worry about.
///
/// All values are hundredths of a percent of the bet, as the tables store them.
/// Mirrors `play-cost.ts`, and the parity vectors hold every read to it.
struct PlayCost {
    let table: EvTable
    let byCount: EvByCount

    init(table: EvTable, byCount: EvByCount) {
        self.table = table
        self.byCount = byCount
    }

    init(_ file: EvTablesFile) {
        self.init(table: file.table, byCount: file.byCount)
    }

    /// The value of a play on a hand, at the count when that hand has an index and
    /// at a full shoe when it does not: away from a published index the count does
    /// not change the answer, and the full-shoe gap is the right size of the
    /// mistake.
    func playValue(_ ref: ScenarioRef, _ action: Action, _ context: PlayContext) -> Double? {
        if action == .surrender { return surrenderValue }
        guard let column = Column(action) else { return nil }
        if let trueCount = context.trueCount,
           let cell = byCount.cells[context.ruleSet][scenarioKey(ref)],
           let counted = value(in: cell[column.rawValue], at: countIndex(trueCount)) {
            return counted
        }
        return fullShoeValue(ref, column, context)
    }

    /// What `played` gave up against `correct`, or nil when the table has no value
    /// for one of them. Never negative: at a count right on an index the two plays
    /// are within sampling noise of each other, and that reads as a close call
    /// rather than as a mistake that made money.
    func costOfPlay(
        _ ref: ScenarioRef,
        played: Action,
        correct: Action,
        _ context: PlayContext
    ) -> Double? {
        if played == correct { return 0 }
        // Insurance is a side bet, so its cost is its own value rather than a gap
        // between two plays of the hand.
        if played == .insurance { return max(0, -insuranceValue(context.trueCount)) }
        if correct == .insurance { return max(0, insuranceValue(context.trueCount)) }
        guard let playedValue = playValue(ref, played, context),
              let correctValue = playValue(ref, correct, context) else { return nil }
        return max(0, correctValue - playedValue)
    }

    /// What the nearest wrong answer gives up: the best play against the next best.
    /// A tally knows that a hand was missed and not how, so this is the floor of
    /// what each miss cost, and a figure built on it is a figure that can only
    /// understate.
    func cheapestMiss(_ ref: ScenarioRef, _ context: PlayContext) -> Double? {
        // With an ace up at a count where insurance pays, insurance is the question
        // being asked, so the bet is what a miss there gave up, whatever the hand.
        if ref.dealer == "A", let trueCount = context.trueCount {
            let insurance = insuranceValue(trueCount)
            if insurance > 0 { return insurance }
        }
        let values = offeredPlays(ref, context.options)
            .compactMap { playValue(ref, $0, context) }
            .sorted(by: >)
        let nextBest = values.count < 2 ? nil : values[0] - values[1]
        // Against an ace a hand can also be missed by insuring it, which costs the
        // side bet and nothing else. A miss may have been that, so the floor is
        // the cheaper of the two: priced as the next-best play, insuring 10,9 v A
        // read "at least 101% a miss" for a 3.7% mistake.
        guard ref.dealer == "A", !(ref.kind == "hard" && ref.hand == "20") else {
            return nextBest
        }
        let insuring = max(0, -insuranceValue(context.trueCount))
        return nextBest.map { min($0, insuring) } ?? insuring
    }

    /// How often a scenario comes up at a table, as a share of hands.
    func tableFrequency(_ ref: ScenarioRef) -> Double {
        (value(in: table.frequency[rowKey(ref)], at: upcardIndex(ref)) ?? 0) / 1_000_000
    }

    /// What a set of misses would cost per hand at a real table: for each hand, how
    /// often it is dealt, how often it is being missed, and what a miss gives up.
    ///
    /// The drills deal hands nothing like as a table does, and over-deal the ones
    /// being missed, so a drill's own accuracy says little about a table. This reads
    /// each hand's miss rate and weighs it by the table's frequency instead. One
    /// more attempt than happened keeps a single miss from reading as a hundred
    /// percent.
    func tableLeak(_ spots: [WeakSpot]) -> Double {
        spots.reduce(0) { leak, spot in
            let missRate = Double(spot.misses) / Double(spot.attempts + 1)
            return leak + tableFrequency(spot.ref) * missRate * (spot.costPerMiss ?? 0)
        }
    }

    func houseEdge(_ ruleSet: RuleSet, _ options: EngineOptions) -> Double {
        let edges = table.houseEdge[ruleSet]
        let edge = options.doubleAfterSplit ? edges.das : edges.noDas
        return options.lateSurrender ? edge.surrender : edge.noSurrender
    }
}

// MARK: - Reading the tables

extension PlayCost {
    /// The plays a table holds a value for, spelled as the by-count cells key them.
    private enum Column: String {
        case stand, hit, double, split

        init?(_ action: Action) {
            switch action {
            case .stand: self = .stand
            case .hit: self = .hit
            case .double: self = .double
            case .split: self = .split
            case .surrender, .insurance: return nil
            }
        }
    }

    /// The table's row for a scenario. Two totals exist only as pairs when dealt
    /// two cards: a played-out hard 20 reads from the tens, and hard 4 from the
    /// twos.
    private func rowKey(_ ref: ScenarioRef) -> String {
        if ref.kind == "hard", ref.hand == "20" { return "pair-10" }
        if ref.kind == "hard", ref.hand == "4" { return "pair-2" }
        return "\(ref.kind)-\(ref.hand)"
    }

    private func upcardIndex(_ ref: ScenarioRef) -> Int? {
        table.upcards.firstIndex(of: ref.dealer)
    }

    private func countIndex(_ trueCount: Int) -> Int {
        min(byCount.maxCount, max(byCount.minCount, trueCount)) - byCount.minCount
    }

    /// One entry of a row, or nil where there is none. An index out of range reads
    /// as a gap in the table, which every caller already has an answer for; on the
    /// web it is `undefined`, and here it would otherwise trap.
    private func value(in row: [Double]?, at index: Int?) -> Double? {
        guard let row, let index, row.indices.contains(index) else { return nil }
        return row[index]
    }

    private func fullShoeValue(
        _ ref: ScenarioRef,
        _ column: Column,
        _ context: PlayContext
    ) -> Double? {
        let rules = table.rules[context.ruleSet]
        let rows: EvColumn = switch column {
        case .stand: rules.stand
        case .hit: rules.hit
        case .double: rules.double
        case .split: context.options.doubleAfterSplit ? rules.split : rules.splitNoDas
        }
        return value(in: rows[rowKey(ref)], at: upcardIndex(ref))
    }

    private func insuranceValue(_ trueCount: Int?) -> Double {
        guard let trueCount else { return table.insurance }
        return value(in: byCount.insurance, at: countIndex(trueCount)) ?? table.insurance
    }

    /// The actions that could have been taken on a dealt hand.
    private func offeredPlays(_ ref: ScenarioRef, _ options: EngineOptions) -> [Action] {
        var plays: [Action] = [.hit, .stand]
        // Hard 20 reaches a tally only as a played-out hand, past doubling.
        if !(ref.kind == "hard" && ref.hand == "20") { plays.append(.double) }
        if ref.kind == "pair" { plays.append(.split) }
        if options.lateSurrender { plays.append(.surrender) }
        return plays
    }
}

// MARK: - Saying it

/// "3.4%", "12%", "under 0.1%": one decimal where it is the size of the thing, and
/// never a precision the figure does not have. Rounded half-up on whole tenths
/// rather than by a formatter, which breaks an exact tie differently from the web:
/// 0.25 would read 0.2% here and 0.3% there. Mirrors `formatBetShare`.
func formatBetShare(_ units: Double) -> String {
    if units < 10 { return "under 0.1%" }
    let tenths = Int((units / 10).rounded(.toNearestOrAwayFromZero))
    if tenths >= 100 { return "\(Int((units / 100).rounded(.toNearestOrAwayFromZero)))%" }
    return "\(tenths / 10).\(tenths % 10)%"
}

/// The sentence a miss earns. Mirrors `costSentence`.
func costSentence(_ units: Double) -> String {
    let share = formatBetShare(units)
    if units < closeCall { return "A close call: that play gives up \(share) of your bet." }
    return "That play gives up \(share) of your bet."
}
