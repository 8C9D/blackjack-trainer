import Foundation
import Observation

/// Rolling window for weak-spot selection ("missed 3 of 7 this week").
private let missTallyWindowDays = 7

/// Consecutive correct answers that retire a scenario from the weak list. Three
/// is enough to distinguish "learned it" from "guessed it once": at six
/// answerable actions a lucky run of three is a 1-in-216 accident. Mirrors the
/// web `CLEAR_STREAK`.
let clearStreak = 3

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
    /// Consecutive correct answers since this scenario was last missed.
    var streak: Int = 0
    /// True counts this scenario was recently missed at, most recent first. Only
    /// the Deviations trainer records them: there the count is half the question,
    /// and a re-deal that draws a fresh one asks something else.
    var missedCounts: [Int] = []
}

/// How many missed true counts a scenario remembers. A hand can be missed on
/// both sides of its index — 16 vs 10 stood at −1, hit at +2 — so one is too few;
/// five covers a hand's real failure modes without letting a bad week write an
/// unbounded list to storage. Mirrors `MISSED_COUNT_MEMORY`.
let missedCountMemory = 5

/// Widest true count worth storing. The trainer's own manual range is ±20; a
/// stored value outside this is corrupt rather than practice.
private let maxStoredTrueCount = 30

struct DayTally: Codable, Equatable {
    let date: String
    let attempts: Int
    let misses: Int
}

struct ScenarioTally: Codable, Equatable {
    let ref: ScenarioRef
    let days: [DayTally]
    /// Consecutive correct answers since the last miss. Unlike `days` this is not
    /// windowed: it is the live clear-streak signal, reset by any miss.
    var streak: Int = 0
    /// The true counts the scenario was missed at, most recent first.
    var missedCounts: [Int] = []

    init(ref: ScenarioRef, days: [DayTally], streak: Int = 0, missedCounts: [Int] = []) {
        self.ref = ref
        self.days = days
        self.streak = streak
        self.missedCounts = missedCounts
    }

    /// Hand-rolled so payloads written before clear-streak tracking still decode; a
    /// fresh 0 just means those scenarios must earn it again. Likewise for the
    /// missed counts: a scenario stored before they were kept (or by the Basic
    /// Strategy trainer, which has no count) simply has none.
    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        ref = try container.decode(ScenarioRef.self, forKey: .ref)
        days = try container.decode([DayTally].self, forKey: .days)
        streak = try max(0, container.decodeIfPresent(Int.self, forKey: .streak) ?? 0)
        let stored = try container.decodeIfPresent([Int].self, forKey: .missedCounts) ?? []
        missedCounts = sanitizeMissedCounts(stored)
    }
}

/// Newest first, capped, and only for a miss — a correct answer leaves the list
/// alone, since it is the record of what went wrong. Mirrors
/// `rememberMissedCount`.
func rememberMissedCount(_ existing: [Int], correct: Bool, trueCount: Int?) -> [Int] {
    guard !correct, let trueCount, abs(trueCount) <= maxStoredTrueCount else { return existing }
    return Array(([trueCount] + existing.filter { $0 != trueCount }).prefix(missedCountMemory))
}

/// Drops implausible values and duplicates out of a restored list.
func sanitizeMissedCounts(_ values: [Int]) -> [Int] {
    var seen: [Int] = []
    for value in values where abs(value) <= maxStoredTrueCount && !seen.contains(value) {
        seen.append(value)
    }
    return Array(seen.prefix(missedCountMemory))
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

    /// `trueCount` is the count the question was asked at, and is only meaningful
    /// where the count is part of the question — the Deviations trainer. A miss
    /// remembers it so the scenario can come back as the question that was
    /// actually missed rather than the hand alone.
    func record(
        _ trainer: TalliedTrainer,
        ref: ScenarioRef,
        correct: Bool,
        trueCount: Int? = nil
    ) {
        let today = localDateKey(now())
        let key = scenarioKey(ref)
        var forTrainer = state[trainer.rawValue] ?? [:]
        let existing = forTrainer[key] ?? ScenarioTally(ref: ref, days: [], streak: 0)
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
        forTrainer[key] = ScenarioTally(
            ref: ref,
            days: pruneDays(days),
            streak: correct ? existing.streak + 1 : 0,
            missedCounts: rememberMissedCount(
                existing.missedCounts,
                correct: correct,
                trueCount: trueCount
            )
        )
        state[trainer.rawValue] = pruneScenarios(forTrainer)
        persist()
    }

    /// Scenarios missed inside the window and not yet cleared, worst first
    /// (most misses, then highest miss rate, then scenario key so the order is
    /// stable). This is what adaptive selection draws from. Mirrors `weakSpots`.
    func weakSpots(_ trainer: TalliedTrainer) -> [WeakSpot] {
        windowed(trainer)
            .filter { $0.spot.streak < clearStreak }
            .sorted { lhs, rhs in
                if lhs.spot.misses != rhs.spot.misses { return lhs.spot.misses > rhs.spot.misses }
                let lhsRate = Double(lhs.spot.misses) / Double(lhs.spot.attempts)
                let rhsRate = Double(rhs.spot.misses) / Double(rhs.spot.attempts)
                if lhsRate != rhsRate { return lhsRate > rhsRate }
                return lhs.key < rhs.key
            }
            .map(\.spot)
    }

    /// The counterpart: scenarios that were missed this week and have since been
    /// answered correctly `clearStreak` times running. Mirrors `clearedSpots`.
    func clearedSpots(_ trainer: TalliedTrainer) -> [WeakSpot] {
        windowed(trainer)
            .filter { $0.spot.streak >= clearStreak }
            .sorted { lhs, rhs in
                if lhs.spot.streak != rhs.spot.streak { return lhs.spot.streak > rhs.spot.streak }
                return lhs.key < rhs.key
            }
            .map(\.spot)
    }

    /// The worst outstanding scenario, or nil when nothing is outstanding.
    func weakSpotFor(_ trainer: TalliedTrainer) -> WeakSpot? {
        weakSpots(trainer).first
    }

    /// Every scenario with at least one miss inside the window, paired with its
    /// storage key. Unsorted; the callers above rank it. The key rides along
    /// because `Dictionary` iteration order is nondeterministic across launches,
    /// and it is what breaks a tie the same way every time.
    private func windowed(_ trainer: TalliedTrainer) -> [(key: String, spot: WeakSpot)] {
        guard let forTrainer = state[trainer.rawValue] else { return [] }
        let cutoff = cutoffDate()
        var spots: [(key: String, spot: WeakSpot)] = []
        for (key, tally) in forTrainer {
            var attempts = 0
            var misses = 0
            for day in tally.days where day.date >= cutoff {
                attempts += day.attempts
                misses += day.misses
            }
            if misses == 0 {
                continue
            }
            spots.append((
                key: key,
                spot: WeakSpot(
                    ref: tally.ref,
                    label: scenarioLabel(tally.ref),
                    misses: misses,
                    attempts: attempts,
                    streak: tally.streak,
                    missedCounts: tally.missedCounts
                )
            ))
        }
        return spots
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
                out[key] = ScenarioTally(
                    ref: tally.ref,
                    days: days,
                    streak: tally.streak,
                    missedCounts: tally.missedCounts
                )
            }
        }
        return out
    }

    /// Forgets every scenario tally, so adaptive practice starts from scratch.
    func reset() {
        state = [:]
        persist()
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
                valid[key] = ScenarioTally(
                    ref: tally.ref,
                    days: pruneDays(tally.days),
                    streak: tally.streak,
                    missedCounts: tally.missedCounts
                )
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
