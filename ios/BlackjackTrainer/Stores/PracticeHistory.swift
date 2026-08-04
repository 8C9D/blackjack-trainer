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
    /// Reps the app timed, and the milliseconds they took between them. Counted
    /// separately again: only the strategy drills time a decision (the counting
    /// drills are paced by the app or, for the deck countdown, timed already),
    /// and days written before this have none — untimed, not instant.
    var timed: Int = 0
    var millis: Int = 0
    /// The daily goal in force when this day was last practised. Kept per day
    /// because a goal is a decision about a day, and judging every past day by
    /// today's number lets one setting rewrite history: raise the goal and a
    /// thirty-day streak reads 0, lower it and days you barely practised count.
    /// Nil on a day written before this was stored, which reads as "whatever the
    /// goal is now" — exactly what those days did before. Mirrors `PracticeDay`.
    var goal: Int?
}

/// A stored goal has to be a whole number of hands to judge a day by. Anything
/// else — a repaired preference, a hand-edited backup — reads as no goal at all.
/// Mirrors `plausibleGoal`.
func plausibleGoal(_ goal: Int?) -> Int? {
    guard let goal, goal >= 1 else { return nil }
    return goal
}

/// Longest a single decision can be and still count as one. Past this the
/// trainee put the phone down: a hand you walked away from is not a hand you
/// were slow on. Mirrors `MAX_TIMED_DECISION_MS`.
let maxTimedDecisionMs = 60000

/// A decision counts as timed only when the clock read plausibly: a non-positive
/// reading is a clock that moved backwards, and anything past the cap is a
/// trainee who walked away. Mirrors `plausibleDecisionMs`.
func plausibleDecisionMs(_ elapsedMs: Int?) -> Int? {
    guard let elapsedMs, elapsedMs > 0, elapsedMs <= maxTimedDecisionMs else { return nil }
    return elapsedMs
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

/// Mean seconds per timed decision to one decimal, or nil when none were timed.
/// A mean rather than a median because only per-day totals are stored, and over
/// a week's hands the cap above is what keeps it honest.
private func paceOf(timed: Int, millis: Int) -> Double? {
    guard timed > 0 else { return nil }
    return (Double(millis) / Double(timed) / 100).rounded() / 10
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
    /// The daily goal in force, read at write time rather than passed in by each
    /// drill: the call sites would be that many chances to forget, and a day with
    /// no goal falls back to whatever the goal is now — the very thing storing it
    /// is here to stop. Unset in a spec that does not care.
    @ObservationIgnored var goalSource: (() -> Int)?
    private(set) var days: [PracticeDay]

    init(
        key: String = StatsKeys.practiceHistory,
        defaults: UserDefaults = .standard,
        cloud: CloudKeyValueStore? = nil,
        goalSource: (() -> Int)? = nil
    ) {
        self.key = key
        self.defaults = defaults
        self.cloud = cloud
        self.goalSource = goalSource
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
    func recordHand(correct: Bool, elapsedMs: Int? = nil) {
        let today = localDateKey(now())
        let won = correct ? 1 : 0
        let millis = plausibleDecisionMs(elapsedMs)
        let goal = plausibleGoal(goalSource?())
        if let index = days.firstIndex(where: { $0.date == today }) {
            let day = days[index]
            days[index] = PracticeDay(
                date: today,
                hands: day.hands + 1,
                graded: day.graded + 1,
                correct: day.correct + won,
                timed: day.timed + (millis == nil ? 0 : 1),
                millis: day.millis + (millis ?? 0),
                // The goal in force when the day was last practised: a day whose
                // goal was raised and then practised again was practised under
                // the new number.
                goal: goal ?? day.goal
            )
        } else {
            days.append(PracticeDay(
                date: today, hands: 1, graded: 1, correct: won,
                timed: millis == nil ? 0 : 1, millis: millis ?? 0, goal: goal
            ))
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
                met: hands >= goalFor(day, current: goal, isToday: back == 0),
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
    /// How long a decision took over the seven days ending `weeksBack` weeks ago.
    /// Accuracy says whether the practice is working; this says whether it would
    /// survive a table, where the dealer is waiting. Mirrors `paceLast7`.
    func paceLast7(weeksBack: Int = 0) -> Double? {
        var timed = 0
        var millis = 0
        let first = weeksBack * 7
        for back in first ..< (first + 7) {
            let day = dayOn(dateKeyDaysAgo(back))
            timed += day?.timed ?? 0
            millis += day?.millis ?? 0
        }
        return paceOf(timed: timed, millis: millis)
    }

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

    /// Which goal a day is judged by: today's is the one on the Settings screen —
    /// the day is still running, and raising the goal is a statement about it —
    /// but a finished day keeps the goal it was practised under, so changing the
    /// number cannot un-meet a day that was met. Mirrors `goalFor`.
    private func goalFor(_ day: PracticeDay?, current: Int, isToday: Bool) -> Int {
        if isToday { return current }
        return plausibleGoal(day?.goal) ?? current
    }

    /// Whether a day reached the goal it is judged by.
    private func metOn(_ date: String, current: Int, isToday: Bool) -> Bool {
        let day = dayOn(date)
        return (day?.hands ?? 0) >= goalFor(day, current: current, isToday: isToday)
    }

    /// Consecutive goal-met days ending today (if today's goal is met) or
    /// yesterday otherwise. Mirrors `streak`.
    func streak(goal: Int) -> Int {
        var count = 0
        var back = metOn(dateKeyDaysAgo(0), current: goal, isToday: true) ? 0 : 1
        // Bounded by the retention window rather than by the data: days past it
        // are pruned, so no real streak can run longer, and the walk cannot spin
        // forever on a goal of zero — which every day in history, stored or not,
        // satisfies. The goal is clamped to at least 1 before it reaches here, so
        // this is a backstop for a caller that stops doing that, not a live path.
        while back < maxHistoryDays,
              metOn(dateKeyDaysAgo(back), current: goal, isToday: back == 0) {
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
            // A timed rep is a graded one, and no run of them can average past
            // the cap, so a hand-edited file cannot report an impossible pace.
            let timed = min(graded, (entry["timed"] as? NSNumber)?.intValue ?? 0)
            return PracticeDay(
                date: date,
                hands: hands,
                graded: graded,
                correct: min(graded, (entry["correct"] as? NSNumber)?.intValue ?? 0),
                timed: timed,
                millis: min(
                    timed * maxTimedDecisionMs,
                    (entry["millis"] as? NSNumber)?.intValue ?? 0
                ),
                goal: plausibleGoal((entry["goal"] as? NSNumber)?.intValue)
            )
        }
    }

    private static func save(_ days: [PracticeDay], key: String, defaults: UserDefaults) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload(days)) else { return }
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
        guard let data = try? JSONSerialization.data(withJSONObject: Self.payload(days)) else {
            return
        }
        cloud.set(data, forKey: key)
    }

    /// The stored shape, shared by the local save and the cloud push so the two
    /// cannot carry different fields.
    private static func payload(_ days: [PracticeDay]) -> [String: Any] {
        ["days": days.map { day in
            var entry: [String: Any] = [
                "date": day.date, "hands": day.hands, "graded": day.graded,
                "correct": day.correct, "timed": day.timed, "millis": day.millis
            ]
            // Omitted rather than written as 0 on a day that has none, so a
            // browser reading this file sees the same absence iOS does.
            if let goal = day.goal { entry["goal"] = goal }
            return entry
        }]
    }
}
