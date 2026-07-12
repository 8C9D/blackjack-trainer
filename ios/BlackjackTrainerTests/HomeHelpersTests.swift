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
}
