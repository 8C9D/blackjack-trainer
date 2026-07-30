import Foundation
import Observation

/// Codable persistence helpers. A malformed payload falls back to the empty
/// value (the Swift analogue of the web's try/catch + field validation), and
/// writes tolerate failure silently.
private enum StatsPersistence {
    static func load<T: Codable>(
        _: T.Type,
        key: String,
        defaults: UserDefaults,
        empty: T,
        validate: (T) -> Bool
    ) -> T {
        guard let data = defaults.data(forKey: key),
              let value = try? JSONDecoder().decode(T.self, from: data),
              validate(value)
        else { return empty }
        return value
    }

    static func save(_ value: some Codable, key: String, defaults: UserDefaults) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        defaults.set(data, forKey: key)
    }
}

/// Persists a trainer's correct/incorrect session stats under its own key.
/// Mirrors `StatsStore`; observable so SwiftUI screens update on change. When a
/// `cloud` store is supplied (4.2) it write-throughs to iCloud KVS and can adopt
/// remote values; with none it is local-only (the web parity behavior).
@Observable
final class SessionStatsStore: CloudSyncable {
    @ObservationIgnored let key: String
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let cloud: CloudKeyValueStore?
    /// Fired after a local change is persisted (record or reset), so the widget
    /// snapshot can be refreshed (4.3). Cloud adoption deliberately doesn't fire
    /// it — the cloud-sync coordinator owns that path.
    @ObservationIgnored var onChange: (() -> Void)?
    private(set) var stats: SessionStats

    init(key: String, defaults: UserDefaults = .standard, cloud: CloudKeyValueStore? = nil) {
        self.key = key
        self.defaults = defaults
        self.cloud = cloud
        stats = StatsPersistence.load(
            SessionStats.self,
            key: key,
            defaults: defaults,
            empty: .empty,
            validate: \.isValid
        )
    }

    func recordAttempt(correct: Bool) {
        stats = stats.recording(correct: correct)
        persist()
    }

    /// Resets only this store's key.
    func reset() {
        stats = .empty
        persist()
    }

    private func persist() {
        StatsPersistence.save(stats, key: key, defaults: defaults)
        pushToCloud()
        onChange?()
    }

    // MARK: CloudSyncable

    var cloudKey: String {
        key
    }

    func adoptFromCloud() {
        guard let cloud, let data = cloud.data(forKey: key),
              let value = try? JSONDecoder().decode(SessionStats.self, from: data),
              value.isValid else { return }
        stats = value
        StatsPersistence.save(stats, key: key, defaults: defaults)
    }

    func pushToCloud() {
        guard let cloud, let data = try? JSONEncoder().encode(stats) else { return }
        cloud.set(data, forKey: key)
    }
}

/// Persists the post-count showdown tally under its own key.
@Observable
final class ShowdownStatsStore: CloudSyncable {
    @ObservationIgnored let key: String
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let cloud: CloudKeyValueStore?
    private(set) var stats: ShowdownStats

    init(
        key: String = StatsKeys.showdown,
        defaults: UserDefaults = .standard,
        cloud: CloudKeyValueStore? = nil
    ) {
        self.key = key
        self.defaults = defaults
        self.cloud = cloud
        stats = StatsPersistence.load(
            ShowdownStats.self,
            key: key,
            defaults: defaults,
            empty: .empty,
            validate: \.isValid
        )
    }

    func record(outcome: ShowdownOutcome, playerBlackjack: Bool = false) {
        stats = stats.recording(outcome: outcome, playerBlackjack: playerBlackjack)
        persist()
    }

    func reset() {
        stats = .empty
        persist()
    }

    private func persist() {
        StatsPersistence.save(stats, key: key, defaults: defaults)
        pushToCloud()
    }

    // MARK: CloudSyncable

    var cloudKey: String {
        key
    }

    func adoptFromCloud() {
        guard let cloud, let data = cloud.data(forKey: key),
              let value = try? JSONDecoder().decode(ShowdownStats.self, from: data),
              value.isValid else { return }
        stats = value
        StatsPersistence.save(stats, key: key, defaults: defaults)
    }

    func pushToCloud() {
        guard let cloud, let data = try? JSONEncoder().encode(stats) else { return }
        cloud.set(data, forKey: key)
    }
}

/// Persists the showdown bankroll under its own key, alongside (not inside) the
/// hand tally: the tally is meaningful with betting off, so the two stay
/// separable. Mirrors the web `BankrollService`.
@Observable
final class BankrollStore: CloudSyncable {
    @ObservationIgnored let key: String
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let cloud: CloudKeyValueStore?
    private(set) var state: BankrollState

    init(
        key: String = StatsKeys.showdownBankroll,
        defaults: UserDefaults = .standard,
        cloud: CloudKeyValueStore? = nil
    ) {
        self.key = key
        self.defaults = defaults
        self.cloud = cloud
        state = StatsPersistence.load(
            BankrollState.self,
            key: key,
            defaults: defaults,
            empty: .empty,
            validate: \.isValid
        )
    }

    var bankroll: Double {
        state.bankroll
    }

    /// Out of chips: the caller offers a reset instead of another round.
    var bustedOut: Bool {
        state.bankroll < Bankroll.minBet
    }

    /// Settle one hand: `stake` is what it risked and `payout` the net chips it
    /// returned (negative on a loss). Recorded together so `wagered` counts a
    /// doubled second bet too.
    func record(stake: Double, payout: Double) {
        state = state.recording(stake: stake, payout: payout)
        persist()
    }

    func reset() {
        state = .empty
        persist()
    }

    private func persist() {
        StatsPersistence.save(state, key: key, defaults: defaults)
        pushToCloud()
    }

    // MARK: CloudSyncable

    var cloudKey: String {
        key
    }

    func adoptFromCloud() {
        guard let cloud, let data = cloud.data(forKey: key),
              let value = try? JSONDecoder().decode(BankrollState.self, from: data),
              value.isValid else { return }
        state = value
        StatsPersistence.save(state, key: key, defaults: defaults)
    }

    func pushToCloud() {
        guard let cloud, let data = try? JSONEncoder().encode(state) else { return }
        cloud.set(data, forKey: key)
    }
}

/// Wipes stat keys from earlier versions. Call once at launch.
func cleanupLegacyStatsKeys(defaults: UserDefaults = .standard) {
    for key in StatsKeys.legacy {
        defaults.removeObject(forKey: key)
    }
}
