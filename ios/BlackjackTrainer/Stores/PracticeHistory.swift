import Foundation
import Observation

/// How many days of per-day hand counts to retain (7-day streak dots plus
/// headroom). Older entries are pruned on every write.
private let maxHistoryDays = 30

/// One day's hands-practiced count. Mirrors the web `PracticeDay`.
struct PracticeDay: Equatable {
    /// Local calendar date, `YYYY-MM-DD`.
    let date: String
    let hands: Int
}

/// One dot of the home screen's 7-day strip. `met` is whether the day reached
/// the daily goal. Mirrors the web `StreakDot`.
struct StreakDot: Equatable {
    let date: String
    let hands: Int
    let met: Bool
    let isToday: Bool
}

/// Local (not UTC) calendar date key — a hand practiced at 23:30 belongs to the
/// user's day. Mirrors the web `localDateKey`.
func localDateKey(_ date: Date) -> String {
    let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
}

/// Per-day hands-practiced history backing the daily-goal ring and streak dots.
/// Mirrors `PracticeHistoryService`: tolerant load, 30-day prune on write, and
/// the stat-store iCloud pattern. The stored key is additive.
@Observable
final class PracticeHistoryStore: CloudSyncable {
    @ObservationIgnored let key: String
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let cloud: CloudKeyValueStore?
    /// Test seam mirroring the web `setNowSource`.
    @ObservationIgnored var now: () -> Date = { Date() }
    /// Fired after a local change (so the widget snapshot can refresh).
    @ObservationIgnored var onChange: (() -> Void)?
    private(set) var days: [PracticeDay]

    init(
        key: String = StatsKeys.practiceHistory,
        defaults: UserDefaults = .standard,
        cloud: CloudKeyValueStore? = nil
    ) {
        self.key = key
        self.defaults = defaults
        self.cloud = cloud
        days = Self.load(key: key, defaults: defaults)
    }

    func setNowSource(_ source: @escaping () -> Date) {
        now = source
    }

    func recordHand() {
        let today = localDateKey(now())
        if let index = days.firstIndex(where: { $0.date == today }) {
            days[index] = PracticeDay(date: today, hands: days[index].hands + 1)
        } else {
            days.append(PracticeDay(date: today, hands: 1))
        }
        days = prune(days)
        persist()
    }

    func handsToday() -> Int {
        handsOn(localDateKey(now()))
    }

    func handsOn(_ date: String) -> Int {
        days.first(where: { $0.date == date })?.hands ?? 0
    }

    /// The 7-day dot strip ending today, oldest first. Mirrors `last7`.
    func last7(goal: Int) -> [StreakDot] {
        var dots: [StreakDot] = []
        for back in stride(from: 6, through: 0, by: -1) {
            let date = dateKeyDaysAgo(back)
            let hands = handsOn(date)
            dots.append(StreakDot(date: date, hands: hands, met: hands >= goal, isToday: back == 0))
        }
        return dots
    }

    /// Consecutive goal-met days ending today (if today's goal is met) or
    /// yesterday otherwise. Mirrors `streak`.
    func streak(goal: Int) -> Int {
        var count = 0
        var back = handsOn(dateKeyDaysAgo(0)) >= goal ? 0 : 1
        while handsOn(dateKeyDaysAgo(back)) >= goal {
            count += 1
            back += 1
        }
        return count
    }

    private func dateKeyDaysAgo(_ back: Int) -> String {
        let date = Calendar.current.date(byAdding: .day, value: -back, to: now()) ?? now()
        return localDateKey(date)
    }

    private func prune(_ days: [PracticeDay]) -> [PracticeDay] {
        let cutoff = dateKeyDaysAgo(maxHistoryDays - 1)
        // 'YYYY-MM-DD' compares chronologically as a string.
        return days.filter { $0.date >= cutoff }
    }

    private func persist() {
        Self.save(days, key: key, defaults: defaults)
        pushToCloud()
        onChange?()
    }

    private static func load(key: String, defaults: UserDefaults) -> [PracticeDay] {
        guard let data = defaults.data(forKey: key),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let rawDays = root["days"] as? [[String: Any]]
        else { return [] }
        return rawDays.compactMap { entry in
            guard let date = entry["date"] as? String,
                  let hands = (entry["hands"] as? NSNumber)?.intValue
            else { return nil }
            return PracticeDay(date: date, hands: hands)
        }
    }

    private static func save(_ days: [PracticeDay], key: String, defaults: UserDefaults) {
        let payload = ["days": days.map { ["date": $0.date, "hands": $0.hands] as [String: Any] }]
        guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
        defaults.set(data, forKey: key)
    }

    // MARK: CloudSyncable

    var cloudKey: String {
        key
    }

    func adoptFromCloud() {
        guard let cloud, let data = cloud.data(forKey: key),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let rawDays = root["days"] as? [[String: Any]]
        else { return }
        days = rawDays.compactMap { entry in
            guard let date = entry["date"] as? String,
                  let hands = (entry["hands"] as? NSNumber)?.intValue
            else { return nil }
            return PracticeDay(date: date, hands: hands)
        }
        Self.save(days, key: key, defaults: defaults)
    }

    func pushToCloud() {
        guard let cloud else { return }
        let payload = ["days": days.map { ["date": $0.date, "hands": $0.hands] as [String: Any] }]
        guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
        cloud.set(data, forKey: key)
    }
}
