import Foundation

/// One chart cell's surroundings, bundled so the reducers below stay inside the
/// five-parameter limit (the shape `KeyCountAnswer` and friends already use).
///
/// The chart names a play assuming every action is on the table. These collapse
/// a cell onto what the hand may actually do, the way the published charts read
/// their own footnotes: a hard double falls back to a hit, a soft `Ds` falls
/// back to a stand (that is what the small 's' means), and a surrender cell
/// names the play to make when surrender is not offered. Mirrors the
/// `reduceSoftCell` / `reduceHardCell` helpers in
/// `basic-strategy-engine.service.ts`.
struct CellContext {
    let description: String
    let dealerKey: String
    let ruleSet: String
    let canDouble: Bool
    let canSurrender: Bool

    func decision(_ action: Action, _ source: DecisionSource, _ verb: String) -> StrategyDecision {
        StrategyDecision(
            action: action, source: source, handDescription: description,
            reason: "\(description) vs dealer \(dealerKey) under \(ruleSet): \(verb)."
        )
    }

    func reduceSoft(_ cell: String) -> StrategyDecision {
        switch cell {
        case "H": return decision(.hit, .soft, "hit")
        case "S": return decision(.stand, .soft, "stand")
        case "D":
            guard canDouble else { return decision(.hit, .soft, "hit (doubling is not available)") }
            return decision(.double, .soft, "double")
        case "Ds":
            guard canDouble else {
                return decision(.stand, .soft, "stand (doubling is not available)")
            }
            return decision(.double, .soft, "double")
        default: preconditionFailure("illegal soft cell '\(cell)'")
        }
    }

    func reduceHard(_ cell: String) -> StrategyDecision {
        switch cell {
        case "H": return decision(.hit, .hard, "hit")
        case "S": return decision(.stand, .hard, "stand")
        case "D":
            guard canDouble else { return decision(.hit, .hard, "hit (doubling is not available)") }
            return decision(.double, .hard, "double")
        case "SUR_H":
            guard canSurrender else {
                return decision(.hit, .hard, "hit (surrender is not available)")
            }
            return decision(.surrender, .surrender, "surrender")
        case "SUR_S":
            guard canSurrender else {
                return decision(.stand, .hard, "stand (surrender is not available)")
            }
            return decision(.surrender, .surrender, "surrender")
        default: preconditionFailure("illegal hard cell '\(cell)'")
        }
    }
}
