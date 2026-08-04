import Foundation

/// One line of the published key-count schedule.
struct KeyCountRow: Equatable, Identifiable {
    let label: String
    let value: String

    var id: String {
        label
    }
}

/// Everything the chart's count tab prints about the selected counting system.
///
/// The app grades every counted card against one of 58 systems' tags and, until
/// this tab, printed those tags nowhere: a trainee who picked Zen or Wong Halves
/// had to leave the app to learn what it was marking them on. Built here rather
/// than in the view so it can be checked without SwiftUI. Mirrors the count-tab
/// computeds on the web `chart-page` component.
struct CountReference: Equatable {
    let systemName: String
    let balanceLabel: String
    let table: SystemTagTable
    /// The registry's own description of the system.
    let systemDescription: String
    let balanceNote: String
    let keyCountCaption: String
    let keyCountRows: [KeyCountRow]
    /// Set when an unbalanced system has no schedule this app can print, nil
    /// otherwise.
    let keyCountMissing: String?
    /// Set only for a color-dependent system, whose table has two rows.
    let colorNote: String?

    init(system: CountingSystem, decks: Int) {
        systemName = system.name
        balanceLabel = system.balanced ? "Balanced" : "Unbalanced"
        table = system.tagTable
        systemDescription = system.description

        // Derived from the tags on screen, not from the `balanced` flag, so the
        // sentence and the table above it can never disagree.
        let sum = CountingEngine().fullDeckCount(system)
        balanceNote = Self.balanceNote(sum: sum)

        keyCountCaption = "Running counts for a \(decks)-deck shoe"
        let schedule = system.keyCounts?.resolved(decks: decks)
        keyCountRows = schedule.map(Self.rows) ?? []
        keyCountMissing = Self.missingNote(system: system, schedule: schedule, decks: decks)

        // Only three systems tag a rank by suit color, and the two rows say
        // nothing about why they are there.
        colorNote = system.colorValues == nil
            ? nil
            : "This system counts some cards by suit color, so its table has a row each for red "
            + "and black. Hearts and diamonds are red; spades and clubs are black."
    }

    /// The one line that explains why two systems are drilled by different
    /// questions: a deck that sums to zero is what a true count divides.
    private static func balanceNote(sum: Double) -> String {
        guard sum != 0 else {
            return "A full deck of these tags sums to 0. That is what a true count divides: the "
                + "running count over the decks still to come is a per-deck figure, so this system "
                + "can be drilled as a true count and its indices read at one."
        }
        let direction = sum > 0 ? "up" : "down"
        return "A full deck of these tags sums to \(CountFormat.signedCount(sum)), not 0, so the "
            + "running count drifts \(direction) on its own as a shoe is dealt. There is nothing "
            + "for a true count to divide — an unbalanced system is read against running-count "
            + "thresholds instead."
    }

    private static func rows(_ schedule: ResolvedKeyCounts) -> [KeyCountRow] {
        [
            KeyCountRow(label: "Start of shoe (IRC)",
                        value: CountFormat.signedCount(Double(schedule.irc))),
            KeyCountRow(label: "Key count — your advantage starts",
                        value: CountFormat.signedCount(Double(schedule.keyCount))),
            KeyCountRow(label: "Pivot — where a fully dealt shoe ends",
                        value: CountFormat.signedCount(Double(schedule.pivot))),
            KeyCountRow(label: "Take insurance at",
                        value: "\(CountFormat.signedCount(Double(schedule.insuranceCount))) or above")
        ]
    }

    /// An unbalanced system with no schedule this app can print. Said rather
    /// than left blank: the absence is why Settings offers it no key-count
    /// drill.
    private static func missingNote(
        system: CountingSystem,
        schedule: ResolvedKeyCounts?,
        decks: Int
    ) -> String? {
        guard !system.balanced, schedule == nil else { return nil }
        guard system.keyCounts != nil else {
            return "This app carries no published key-count schedule for it, so it is drilled by "
                + "running count alone."
        }
        return "Its published key counts cover other shoe sizes, not the \(decks)-deck shoe your "
            + "counting drill is set to."
    }
}
