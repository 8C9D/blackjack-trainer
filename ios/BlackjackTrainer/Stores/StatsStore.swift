import Foundation
import Observation

/// Codable persistence helpers. A malformed payload falls back to the empty
/// value (the Swift analogue of the web's try/catch + field validation), and
/// writes tolerate failure silently.
private enum StatsPersistence {
    static func load<T: Codable>(_: T.Type, key: String, defaults: UserDefaults, empty: T) -> T {
        guard let data = defaults.data(forKey: key),
              let value = try? JSONDecoder().decode(T.self, from: data)
        else { return empty }
        return value
    }

    static func save(_ value: some Codable, key: String, defaults: UserDefaults) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        defaults.set(data, forKey: key)
    }
}

/// Persists a trainer's correct/incorrect session stats under its own key.
/// Mirrors `StatsStore`; observable so SwiftUI screens update on change.
@Observable
final class SessionStatsStore {
    @ObservationIgnored let key: String
    @ObservationIgnored private let defaults: UserDefaults
    private(set) var stats: SessionStats

    init(key: String, defaults: UserDefaults = .standard) {
        self.key = key
        self.defaults = defaults
        stats = StatsPersistence.load(
            SessionStats.self,
            key: key,
            defaults: defaults,
            empty: .empty
        )
    }

    func recordAttempt(correct: Bool) {
        stats = stats.recording(correct: correct)
        StatsPersistence.save(stats, key: key, defaults: defaults)
    }

    /// Resets only this store's key.
    func reset() {
        stats = .empty
        StatsPersistence.save(stats, key: key, defaults: defaults)
    }
}

/// Persists the post-count showdown tally under its own key.
@Observable
final class ShowdownStatsStore {
    @ObservationIgnored let key: String
    @ObservationIgnored private let defaults: UserDefaults
    private(set) var stats: ShowdownStats

    init(key: String = StatsKeys.showdown, defaults: UserDefaults = .standard) {
        self.key = key
        self.defaults = defaults
        stats = StatsPersistence.load(
            ShowdownStats.self,
            key: key,
            defaults: defaults,
            empty: .empty
        )
    }

    func record(outcome: ShowdownOutcome, playerBlackjack: Bool = false) {
        stats = stats.recording(outcome: outcome, playerBlackjack: playerBlackjack)
        StatsPersistence.save(stats, key: key, defaults: defaults)
    }

    func reset() {
        stats = .empty
        StatsPersistence.save(stats, key: key, defaults: defaults)
    }
}

/// Wipes stat keys from earlier versions. Call once at launch.
func cleanupLegacyStatsKeys(defaults: UserDefaults = .standard) {
    for key in StatsKeys.legacy {
        defaults.removeObject(forKey: key)
    }
}
