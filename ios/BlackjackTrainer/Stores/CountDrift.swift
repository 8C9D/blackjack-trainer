import Foundation
import Observation

/// How many answered counts the store remembers, newest first. Enough rounds for
/// a lean to be a lean rather than a run of luck, few enough that a week of
/// practice can still change what it says. Mirrors `COUNT_DRIFT_MEMORY`.
let countDriftMemory = 20

/// Anything past this is a corrupt payload, not a count a trainee held.
private let maxCountDrift = 200.0

/// Which side the answers land on, over the rounds remembered.
struct DriftShape: Equatable {
    let rounds: Int
    let low: Int
    let high: Int
    let exact: Int
}

/// Every graded running count, kept as the signed distance from the real one
/// (0 for an exact answer).
///
/// Accuracy alone says a count was wrong; it never says *how*, and the two ways
/// to be wrong want different practice. A count that lands under nearly every
/// time is dropping the same thing each shoe — a rank, or the second card of a
/// pair flashed together. One that scatters is being lost and restarted. The app
/// has had this figure on every miss it ever graded and thrown it away.
///
/// Its own key rather than a field on the running-count stats store, which is a
/// flat record of counters. Mirrors `CountDriftService`.
@Observable
final class CountDriftStore: CloudSyncable {
    @ObservationIgnored let key: String
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let cloud: CloudKeyValueStore?
    private(set) var drifts: [Double]

    init(
        key: String = StatsKeys.countDrift,
        defaults: UserDefaults = .standard,
        cloud: CloudKeyValueStore? = nil
    ) {
        self.key = key
        self.defaults = defaults
        self.cloud = cloud
        drifts = Self.loaded(data: defaults.data(forKey: key))
    }

    /// `answer - actual`, so a count held too high is positive. Rounds that never
    /// asked for a running count do not reach this.
    func record(answer: Double, actual: Double) {
        let drift = answer - actual
        guard drift.isFinite, abs(drift) <= maxCountDrift else { return }
        drifts = Array(([drift] + drifts).prefix(countDriftMemory))
        persist()
    }

    /// The round's running-count answer, when it asked for one.
    func record(_ result: CountingDrillResult) {
        guard let answered = result.runningCountAnswer else { return }
        record(answer: answered.answer, actual: answered.actual)
    }

    /// Nil until there are enough rounds for a shape to mean anything: three
    /// counts leaning one way is not a lean.
    func shape(minimumRounds: Int = 5) -> DriftShape? {
        guard drifts.count >= minimumRounds else { return nil }
        return DriftShape(
            rounds: drifts.count,
            low: drifts.count { $0 < 0 },
            high: drifts.count { $0 > 0 },
            exact: drifts.count { $0 == 0 }
        )
    }

    func reset() {
        drifts = []
        persist()
    }

    private static func loaded(data: Data?) -> [Double] {
        guard let data,
              let stored = try? JSONDecoder().decode(StoredDrifts.self, from: data)
        else { return [] }
        return sanitized(stored.drifts)
    }

    private static func sanitized(_ drifts: [Double]) -> [Double] {
        Array(
            drifts
                .filter { $0.isFinite && abs($0) <= maxCountDrift }
                .prefix(countDriftMemory)
        )
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(StoredDrifts(drifts: drifts)) else { return }
        defaults.set(data, forKey: key)
        pushToCloud()
    }

    // MARK: CloudSyncable

    var cloudKey: String {
        key
    }

    func adoptFromCloud() {
        // Cloud bytes are another device's write and untrusted: a payload that
        // does not decode leaves valid local state alone rather than wiping it.
        guard let cloud, let data = cloud.data(forKey: key),
              let stored = try? JSONDecoder().decode(StoredDrifts.self, from: data)
        else { return }
        drifts = Self.sanitized(stored.drifts)
        guard let encoded = try? JSONEncoder().encode(StoredDrifts(drifts: drifts)) else { return }
        defaults.set(encoded, forKey: key)
    }

    func pushToCloud() {
        guard let cloud,
              let data = try? JSONEncoder().encode(StoredDrifts(drifts: drifts))
        else { return }
        cloud.set(data, forKey: key)
    }
}

/// The stored shape, matching the web's `{ drifts }`.
private struct StoredDrifts: Codable {
    let drifts: [Double]
}
