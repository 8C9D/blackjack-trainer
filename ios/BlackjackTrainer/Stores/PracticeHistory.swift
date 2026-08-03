import Foundation
import Observation

/// How many days of per-day hand counts to retain. The 7-day dot strip needs
/// only a week, but `streak` walks backward without another bound: a 30-day
/// window silently capped longer streaks. Match the web's 400-day window so a
/// year-long streak remains accurate while the stored array stays small.
private let maxHistoryDays = 400

/// One day's hands-practiced count. Mirrors the web `PracticeDay`.
struct PracticeDay: Equatable {
    /// Local calendar date, `YYYY-MM-DD`.
    let date: String
    let hands: Int
    /// Reps whose verdict was recorded, and how many of those were right.
    /// Counted separately from `hands` because a day written by a build that
    /// only tallied volume has no verdicts at all: dividing its correct count by
    /// its hands would report a week of real practice as 0% rather than as
    /// unmeasured.
    var graded: Int = 0
    var correct: Int = 0
}

/// One dot of the home screen's 7-day strip. `met` is whether the day reached
/// the daily goal. Mirrors the web `StreakDot`.
struct StreakDot: Equatable {
    let date: String
    let hands: Int
    let met: Bool
    let isToday: Bool
    /// Correct share of that day's graded reps, or nil when it graded none.
    var accuracy: Int?
}

/// Percentage of graded reps that were right, or nil when nothing was graded —
/// an unpractised (or pre-grading) window is unmeasured, not zero.
private func accuracyOf(graded: Int, correct: Int) -> Int? {
    graded == 0 ? nil : Int((Double(correct) / Double(graded) * 100).rounded())
}

/// Local (not UTC) calendar date key — a hand practiced at 23:30 belongs to the
/// user's day. Mirrors the web `localDateKey`.
func localDateKey(_ date: Date) -> String {
    let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
}

/// Per-day hands-practiced history backing the daily-goal ring and streak dots.
/// Mirrors `PracticeHistoryService`: tolerant load, 400-day prune on write, and
/// the stat-store iCloud pattern. The stored key is additive.
@Observable
final class PracticeHistoryStore: CloudSyncable, ReloadableStore {
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

    func reloadFromDefaults() {
        days = Self.load(key: key, defaults: defaults)
        // A restore changed today's data; notify so the widget snapshot
        // republishes, exactly as a cross-device adoption does.
        onChange?()
    }

    /// One graded rep. The verdict is the same one the session streak counts, so
    /// a counting round that answers two questions is one rep, right only if
    /// both were.
    func recordHand(correct: Bool) {
        let today = localDateKey(now())
        let won = correct ? 1 : 0
        if let index = days.firstIndex(where: { $0.date == today }) {
            let day = days[index]
            days[index] = PracticeDay(
                date: today,
                hands: day.hands + 1,
                graded: day.graded + 1,
                correct: day.correct + won
            )
        } else {
            days.append(PracticeDay(date: today, hands: 1, graded: 1, correct: won))
        }
        days = prune(days)
        persist()
    }

    func handsToday() -> Int {
        handsOn(localDateKey(now()))
    }

    func handsOn(_ date: String) -> Int {
        dayOn(date)?.hands ?? 0
    }

    private func dayOn(_ date: String) -> PracticeDay? {
        days.first(where: { $0.date == date })
    }

    /// The 7-day dot strip ending today, oldest first. Mirrors `last7`.
    func last7(goal: Int) -> [StreakDot] {
        var dots: [StreakDot] = []
        for back in stride(from: 6, through: 0, by: -1) {
            let date = dateKeyDaysAgo(back)
            let day = dayOn(date)
            let hands = day?.hands ?? 0
            dots.append(StreakDot(
                date: date,
                hands: hands,
                met: hands >= goal,
                isToday: back == 0,
                accuracy: accuracyOf(graded: day?.graded ?? 0, correct: day?.correct ?? 0)
            ))
        }
        return dots
    }

    /// How well the seven days ending `weeksBack` weeks ago went. Volume is
    /// already on the screen; this is the half of practice the app grades every
    /// rep of and has never said anything about — and a week beside the week
    /// before it is the only way the app can answer "am I getting better?".
    /// Mirrors the web `accuracyLast7`.
    func accuracyLast7(weeksBack: Int = 0) -> Int? {
        var graded = 0
        var correct = 0
        let first = weeksBack * 7
        for back in first ..< (first + 7) {
            let day = dayOn(dateKeyDaysAgo(back))
            graded += day?.graded ?? 0
            correct += day?.correct ?? 0
        }
        return accuracyOf(graded: graded, correct: correct)
    }

    /// Consecutive goal-met days ending today (if today's goal is met) or
    /// yesterday otherwise. Mirrors `streak`.
    func streak(goal: Int) -> Int {
        var count = 0
        var back = handsOn(dateKeyDaysAgo(0)) >= goal ? 0 : 1
        // Bounded by the retention window rather than by the data: days past it
        // are pruned, so no real streak can run longer, and the walk cannot spin
        // forever on a goal of zero — which every day in history, stored or not,
        // satisfies. The goal is clamped to at least 1 before it reaches here, so
        // this is a backstop for a caller that stops doing that, not a live path.
        while back < maxHistoryDays, handsOn(dateKeyDaysAgo(back)) >= goal {
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

    /// Wipes the history: the goal ring, streak, and week strip all start over.
    func reset() {
        days = []
        persist()
    }

    private func persist() {
        Self.save(days, key: key, defaults: defaults)
        pushToCloud()
        onChange?()
    }

    private static func load(key: String, defaults: UserDefaults) -> [PracticeDay] {
        guard let data = defaults.data(forKey: key) else { return [] }
        return decode(data) ?? []
    }

    /// Coerce a stored payload. The verdict counts are optional: days written
    /// before the app recorded them read as ungraded (and so as unmeasured)
    /// rather than as a day nothing was got right on. Both are clamped into
    /// `correct ≤ graded ≤ hands` so no stored file can show an accuracy over
    /// 100%. Nil when the payload is not a day list at all, which a cloud
    /// adoption treats as nothing to adopt rather than as an empty history.
    private static func decode(_ data: Data) -> [PracticeDay]? {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let rawDays = root["days"] as? [[String: Any]]
        else { return nil }
        return rawDays.compactMap { entry in
            guard let date = entry["date"] as? String,
                  let hands = (entry["hands"] as? NSNumber)?.intValue
            else { return nil }
            let graded = min(hands, (entry["graded"] as? NSNumber)?.intValue ?? 0)
            return PracticeDay(
                date: date,
                hands: hands,
                graded: graded,
                correct: min(graded, (entry["correct"] as? NSNumber)?.intValue ?? 0)
            )
        }
    }

    private static func save(_ days: [PracticeDay], key: String, defaults: UserDefaults) {
        let payload = ["days": days.map {
            ["date": $0.date, "hands": $0.hands, "graded": $0.graded, "correct": $0.correct]
                as [String: Any]
        }]
        guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
        defaults.set(data, forKey: key)
    }

    // MARK: CloudSyncable

    var cloudKey: String {
        key
    }

    func adoptFromCloud() {
        guard let cloud, let data = cloud.data(forKey: key), let adopted = Self.decode(data)
        else { return }
        days = adopted
        Self.save(days, key: key, defaults: defaults)
        // A cross-device sync changed today's data; notify so the widget snapshot
        // republishes (the publisher listens on onChange). No-op before launch
        // wires it up; the init seed covers that first adoption.
        onChange?()
    }

    func pushToCloud() {
        guard let cloud else { return }
        let payload = ["days": days.map {
            ["date": $0.date, "hands": $0.hands, "graded": $0.graded, "correct": $0.correct]
                as [String: Any]
        }]
        guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
        cloud.set(data, forKey: key)
    }
}
