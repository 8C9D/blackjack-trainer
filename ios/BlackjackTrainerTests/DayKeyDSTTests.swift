import Foundation
import Testing
@testable import BlackjackTrainer

/// Suspicion S1 (review/findings.md): day keys drifting by one around DST.
/// The stores' whole date arithmetic is `Calendar.current.dateComponents`
/// (`localDateKey`) and `Calendar.current.date(byAdding: .day, ...)`
/// (`dateKeyDaysAgo`, the miss-tally cutoff); this probes those same
/// Foundation calls pinned to the two zones whose rules are nastiest — Chile
/// shifts at midnight, so a transition day runs 23 or 25 hours, and Lord Howe
/// shifts by 30 minutes — and pins that walking back from any real instant
/// lands on consecutive calendar dates: none skipped, none doubled. (A device
/// clock never produces a nonexistent wall time, so anchoring at the resolved
/// instant matches what the stores see.) Mirrors the web `day-keys-dst.spec.ts`.
struct DayKeyDSTTests {
    private struct ProbeDay {
        let year: Int
        let month: Int
        let day: Int
    }

    private static let probes: [(zone: String, days: [ProbeDay])] = [
        ("America/Santiago", [
            ProbeDay(year: 2026, month: 4, day: 3), ProbeDay(year: 2026, month: 4, day: 4),
            ProbeDay(year: 2026, month: 4, day: 5), ProbeDay(year: 2026, month: 4, day: 6),
            ProbeDay(year: 2026, month: 9, day: 5), ProbeDay(year: 2026, month: 9, day: 6),
            ProbeDay(year: 2026, month: 9, day: 7), ProbeDay(year: 2026, month: 9, day: 8)
        ]),
        ("Australia/Lord_Howe", [
            ProbeDay(year: 2026, month: 4, day: 4), ProbeDay(year: 2026, month: 4, day: 5),
            ProbeDay(year: 2026, month: 4, day: 6), ProbeDay(year: 2026, month: 10, day: 3),
            ProbeDay(year: 2026, month: 10, day: 4), ProbeDay(year: 2026, month: 10, day: 5)
        ])
    ]

    @Test func dayWalkLandsOnConsecutiveCalendarDatesAcrossDSTTransitions() throws {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = try #require(TimeZone(identifier: "UTC"))
        for probe in Self.probes {
            var cal = Calendar(identifier: .gregorian)
            cal.timeZone = try #require(TimeZone(identifier: probe.zone))
            for probeDay in probe.days {
                for (hour, minute) in [(0, 0), (0, 15), (1, 15), (23, 45)] {
                    let now = try #require(cal.date(from: DateComponents(
                        year: probeDay.year, month: probeDay.month, day: probeDay.day,
                        hour: hour, minute: minute
                    )))
                    // Anchor at the date the instant actually resolved to, the
                    // same "today" the stores would key.
                    let today = cal.dateComponents([.year, .month, .day], from: now)
                    let anchor = try #require(utc.date(from: DateComponents(
                        year: today.year, month: today.month, day: today.day
                    )))
                    for back in 0 ... 10 {
                        let walked = try #require(cal.date(byAdding: .day, value: -back, to: now))
                        let got = cal.dateComponents([.year, .month, .day], from: walked)
                        let wantDate = try #require(
                            utc.date(byAdding: .day, value: -back, to: anchor)
                        )
                        let want = utc.dateComponents([.year, .month, .day], from: wantDate)
                        #expect(
                            got.year == want.year && got.month == want.month
                                && got.day == want.day,
                            "\(probe.zone) \(probeDay.month)/\(probeDay.day) \(hour):\(minute) back \(back)"
                        )
                    }
                }
            }
        }
    }
}
