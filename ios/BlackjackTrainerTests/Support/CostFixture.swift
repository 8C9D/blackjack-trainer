import Foundation
@testable import BlackjackTrainer

/// The value tables for the suites that price a miss: the bundled ones decoded
/// once, a stand-in for the sampled by-count table, and a tally wired the way
/// `AppModel` wires it.
enum CostFixture {
    static let playCost: PlayCost = {
        guard let tables = try? GameData.loadEvTables() else {
            preconditionFailure("bundled ev-tables.json failed to load")
        }
        return PlayCost(tables)
    }()

    /// The real full-shoe table over a by-count table the spec controls, spanning
    /// −2…+2. Whether the sampled cells are filled is a fact about the last export,
    /// and the count path has to be held to account either way.
    static func counted(
        _ cells: [String: EvCountCell] = [:],
        insurance: [Double] = [-400, -200, 0, 200, 400]
    ) -> PlayCost {
        PlayCost(
            table: playCost.table,
            byCount: EvByCount(
                decks: playCost.byCount.decks,
                minCount: -2,
                maxCount: 2,
                insurance: insurance,
                cells: EvByRuleSet(h17: [:], s17: cells)
            )
        )
    }

    /// Hard 16 v 10, a hand with an index: behind hitting below zero, a coin flip
    /// at it, and further ahead the higher the count climbs.
    static let hard16Cell: EvCountCell = [
        "hit": [-5000, -5000, -5000, -5000, -5000],
        "stand": [-5600, -5300, -4970, -4000, -3000]
    ]

    static func tally(
        defaults: UserDefaults,
        prefs: FlowPrefsStore,
        playCost: PlayCost = CostFixture.playCost
    ) -> MissTallyStore {
        MissTallyStore(
            defaults: defaults,
            playCost: playCost,
            contextSource: { prefs.prefs.playContext }
        )
    }
}
