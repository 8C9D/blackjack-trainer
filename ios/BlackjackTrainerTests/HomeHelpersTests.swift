import Foundation
import Testing
@testable import BlackjackTrainer

/// Mirrors the `formatDayLabel` coverage in `home-page.component.spec.ts`.
struct HomeHelpersTests {
    private func part(atHour hour: Int) -> String {
        let date = Calendar.current.date(
            from: DateComponents(year: 2026, month: 7, day: 10, hour: hour)
        ) ?? .distantPast
        return String(formatDayLabel(date).split(separator: " ").last ?? "")
    }

    @Test func labelsTheTimeOfDayByHourBoundaries() {
        #expect(part(atHour: 0) == "morning")
        #expect(part(atHour: 11) == "morning")
        #expect(part(atHour: 12) == "afternoon")
        #expect(part(atHour: 17) == "afternoon")
        #expect(part(atHour: 18) == "evening")
        #expect(part(atHour: 23) == "evening")
    }

    @Test func prefixesTheWeekday() {
        let date = Calendar.current.date(
            from: DateComponents(year: 2026, month: 7, day: 10, hour: 9)
        ) ?? .distantPast
        let weekday = date.formatted(.dateTime.weekday(.wide))
        #expect(formatDayLabel(date) == "\(weekday) morning")
    }

    @Test func countingAccuracySumsEveryCountingStore() {
        func stats(_ attempts: Int, _ correct: Int) -> SessionStats {
            SessionStats(attempts: attempts, correct: correct, streak: 0, longestStreak: correct)
        }
        // 5 of 6 across the six stores.
        let mixed = [stats(1, 1), stats(1, 0), stats(1, 1), stats(1, 1), stats(1, 1), stats(1, 1)]
        #expect(countingAccuracy(mixed) == 83)
        // A trainee who has only ever drilled the newest mode still gets a
        // number, not "new".
        #expect(countingAccuracy([stats(0, 0), stats(0, 0), stats(0, 0), stats(0, 0),
                                  stats(2, 2)]) == 100)
        #expect(countingAccuracy([stats(0, 0), stats(0, 0)]) == nil)
    }

    /// The estimate is what the true count is divided by, and Progress has always
    /// listed it as one of this trainer's rows. Leaving it out let the chip read
    /// 90% for someone missing the divisor nine rounds in ten.
    @Test func countingAccuracyIncludesTheDeckEstimate() {
        func stats(_ attempts: Int, _ correct: Int) -> SessionStats {
            SessionStats(attempts: attempts, correct: correct, streak: 0, longestStreak: correct)
        }
        // 19 of 30, not the 18 of 20 the two count stores show on their own.
        #expect(countingAccuracy([stats(10, 9), stats(10, 9), stats(10, 1)]) == 63)
    }

    @Test func everyDrillModeHasItsOwnLabel() {
        let labels = DrillMode.allCases.map(\.label)
        #expect(labels == ["Running count", "True count"])
        #expect(Set(labels).count == DrillMode.allCases.count)
    }
}
