import Foundation
import Observation

/// Rolling window for weak-spot selection ("missed 3 of 7 this week").
private let missTallyWindowDays = 7

/// Trainers that produce per-scenario tallies. Card counting has no scenario
/// identity per rep, so it never records here. Raw values are the stored keys.
enum TalliedTrainer: String {
    case basicStrategy = "basic-strategy"
    case deviations
}

/// Identity of a drillable scenario, structured so a drill can re-deal it as the
/// first hand of the next session. Mirrors the web `ScenarioRef`.
struct ScenarioRef: Codable, Equatable {
    /// `hard` | `soft` | `pair`.
    let kind: String
    /// hard/soft: stringified total (`16`, `18`); pair: rank key (`8`, `A`, `10`).
    let hand: String
    let dealer: String
}

/// The weak spot surfaced on the Done screen. Mirrors the web `WeakSpot`.
struct WeakSpot: Equatable {
    let ref: ScenarioRef
    let label: String
    let misses: Int
    let attempts: Int
}

struct DayTally: Codable, Equatable {
    let date: String
    let attempts: Int
    let misses: Int
}

struct ScenarioTally: Codable, Equatable {
    let ref: ScenarioRef
    let days: [DayTally]
}

/// The `ScenarioRef` for a graded hand. Mirrors the web `scenarioRefFor`.
func scenarioRefFor(_ player: TwoCardHand, dealerUpcard: Card) -> ScenarioRef {
    let dealer = normalizeUpcardKey(dealerUpcard)
    if let pairKey = HandClassification.pairKey(player) {
        return ScenarioRef(kind: "pair", hand: pairKey, dealer: dealer)
    }
    if HandClassification.isSoftTwoCard(player) {
        return ScenarioRef(kind: "soft", hand: String(11 + softNonAceValue(player)), dealer: dealer)
    }
    return ScenarioRef(
        kind: "hard",
        hand: String(player.first.highValue + player.second.highValue),
        dealer: dealer
    )
}

/// Stable storage key, e.g. `hard-16-v-10`. Mirrors the web `scenarioKey`.
func scenarioKey(_ ref: ScenarioRef) -> String {
    "\(ref.kind)-\(ref.hand)-v-\(ref.dealer)"
}

/// Chart-style shorthand: hard `16 vs 10`, soft `A,7 vs 9`, pair `8,8 vs 10`.
/// Mirrors the web `scenarioLabel`.
func scenarioLabel(_ ref: ScenarioRef) -> String {
    switch ref.kind {
    case "soft": "A,\((Int(ref.hand) ?? 11) - 11) vs \(ref.dealer)"
    case "pair": "\(ref.hand),\(ref.hand) vs \(ref.dealer)"
    default: "\(ref.hand) vs \(ref.dealer)"
    }
}

/// Per-scenario attempt/miss tallies over a rolling 7-day window, keyed by
/// trainer. Drives the Done screen's "Drill next" card and the next session's
/// opening hand. Mirrors `MissTallyService`.
@Observable
final class MissTallyStore: CloudSyncable {
    @ObservationIgnored let key: String
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let cloud: CloudKeyValueStore?
    /// Test seam mirroring the web `setNowSource`.
    @ObservationIgnored var now: () -> Date = { Date() }
    private(set) var state: [String: [String: ScenarioTally]]

    init(
        key: String = StatsKeys.missTally,
        defaults: UserDefaults = .standard,
        cloud: CloudKeyValueStore? = nil
    ) {
        self.key = key
        self.defaults = defaults
        self.cloud = cloud
        state = [:]
        state = load(data: defaults.data(forKey: key))
    }

    func setNowSource(_ source: @escaping () -> Date) {
        now = source
        // Re-derive the window-dependent load now that "now" is known.
        state = load(data: defaults.data(forKey: key))
    }

    func record(_ trainer: TalliedTrainer, ref: ScenarioRef, correct: Bool) {
        let today = localDateKey(now())
        let key = scenarioKey(ref)
        var forTrainer = state[trainer.rawValue] ?? [:]
        let existing = forTrainer[key] ?? ScenarioTally(ref: ref, days: [])
        var days = existing.days
        if let index = days.firstIndex(where: { $0.date == today }) {
            let day = days[index]
            days[index] = DayTally(
                date: today,
                attempts: day.attempts + 1,
                misses: day.misses + (correct ? 0 : 1)
            )
        } else {
            days.append(DayTally(date: today, attempts: 1, misses: correct ? 0 : 1))
        }
        forTrainer[key] = ScenarioTally(ref: ref, days: pruneDays(days))
        state[trainer.rawValue] = pruneScenarios(forTrainer)
        persist()
    }

    /// The scenario with the most misses in the window (tiebreak: higher miss
    /// rate), or nil when nothing was missed this week. Mirrors `weakSpotFor`.
    func weakSpotFor(_ trainer: TalliedTrainer) -> WeakSpot? {
        guard let forTrainer = state[trainer.rawValue] else { return nil }
        let cutoff = cutoffDate()
        var best: WeakSpot?
        // Iterate in a stable (sorted-key) order: Dictionary.values order is
        // nondeterministic across launches, which would resolve a miss/rate tie
        // differently each time. Sorting the scenario keys makes the pick stable.
        for key in forTrainer.keys.sorted() {
            let tally = forTrainer[key]!
            var attempts = 0
            var misses = 0
            for day in tally.days where day.date >= cutoff {
                attempts += day.attempts
                misses += day.misses
            }
            if misses == 0 {
                continue
            }
            let candidate = WeakSpot(
                ref: tally.ref,
                label: scenarioLabel(tally.ref),
                misses: misses,
                attempts: attempts
            )
            if best == nil
                || misses > best!.misses
                || (misses == best!.misses
                    && Double(misses) / Double(attempts)
                    > Double(best!.misses) / Double(best!.attempts)) {
                best = candidate
            }
        }
        return best
    }

    private func cutoffDate() -> String {
        let date = Calendar.current.date(
            byAdding: .day,
            value: -(missTallyWindowDays - 1),
            to: now()
        ) ?? now()
        return localDateKey(date)
    }

    private func pruneDays(_ days: [DayTally]) -> [DayTally] {
        let cutoff = cutoffDate()
        return days.filter { $0.date >= cutoff }
    }

    /// Re-prune every scenario's window and drop scenarios whose window emptied,
    /// so the stored map cannot grow without bound. Mirrors `pruneScenarios`.
    private func pruneScenarios(_ forTrainer: [String: ScenarioTally]) -> [String: ScenarioTally] {
        var out: [String: ScenarioTally] = [:]
        for (key, tally) in forTrainer {
            let days = pruneDays(tally.days)
            if !days.isEmpty {
                out[key] = ScenarioTally(ref: tally.ref, days: days)
            }
        }
        return out
    }

    private func persist() {
        save(state)
        pushToCloud()
    }

    private func load(data: Data?) -> [String: [String: ScenarioTally]] {
        guard let data,
              let parsed = try? JSONDecoder().decode(
                  [String: [String: ScenarioTally]].self,
                  from: data
              )
        else { return [:] }
        var out: [String: [String: ScenarioTally]] = [:]
        for trainer in [TalliedTrainer.basicStrategy, .deviations] {
            guard let forTrainer = parsed[trainer.rawValue] else { continue }
            var valid: [String: ScenarioTally] = [:]
            for (key, tally) in forTrainer {
                valid[key] = ScenarioTally(ref: tally.ref, days: pruneDays(tally.days))
            }
            out[trainer.rawValue] = pruneScenarios(valid)
        }
        return out
    }

    private func save(_ state: [String: [String: ScenarioTally]]) {
        guard let data = try? JSONEncoder().encode(state) else { return }
        defaults.set(data, forKey: key)
    }

    // MARK: CloudSyncable

    var cloudKey: String {
        key
    }

    func adoptFromCloud() {
        guard let cloud else { return }
        state = load(data: cloud.data(forKey: key))
        save(state)
    }

    func pushToCloud() {
        guard let cloud, let data = try? JSONEncoder().encode(state) else { return }
        cloud.set(data, forKey: key)
    }
}
