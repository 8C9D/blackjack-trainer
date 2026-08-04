import Foundation
import Testing
@testable import BlackjackTrainer

/// The chart's count tab: the tags every counted card in the app is graded
/// against, which the app printed nowhere until this tab. Mirrors the web
/// `tagTableFor` block in `counting-system.model.spec.ts` and the count-tab
/// block in `chart-page.component.spec.ts`.
@MainActor
struct CountReferenceTests {
    private var systems: [CountingSystem] {
        TestEngines.shared.countingSystems
    }

    private func system(_ id: String) -> CountingSystem {
        systems.first { $0.id == id }!
    }

    private func reference(_ id: String, decks: Int = 6) -> CountReference {
        CountReference(system: system(id), decks: decks)
    }

    @Test func collapsesARunOfRanksThatShareATagIntoOneColumn() {
        let table = system("hi-lo").tagTable
        #expect(table.rowLabels == ["Count"])
        #expect(table.columns == [
            SystemTagColumn(label: "2–6", values: ["+1"]),
            SystemTagColumn(label: "7–9", values: ["0"]),
            SystemTagColumn(label: "10–A", values: ["-1"])
        ])
    }

    /// KO differs from Hi-Lo only by the 7, which lands it in the low run.
    @Test func labelsAColumnOfOneRankWithThatRankAlone() {
        #expect(system("ko").tagTable.columns.map(\.label) == ["2–7", "8–9", "10–A"])
        #expect(system("wong-halves").tagTable.columns == [
            SystemTagColumn(label: "2", values: ["+0.5"]),
            SystemTagColumn(label: "3–4", values: ["+1"]),
            SystemTagColumn(label: "5", values: ["+1.5"]),
            SystemTagColumn(label: "6", values: ["+1"]),
            SystemTagColumn(label: "7", values: ["+0.5"]),
            SystemTagColumn(label: "8", values: ["0"]),
            SystemTagColumn(label: "9", values: ["-0.5"]),
            SystemTagColumn(label: "10–A", values: ["-1"])
        ])
    }

    /// The 7 agrees with 2–6 when red and with 8–9 when black, so it can join
    /// neither: a column is only merged when every row agrees.
    @Test func givesAColorDependentSystemARowPerColor() {
        let table = system("red-seven").tagTable
        #expect(table.rowLabels == ["Red", "Black"])
        #expect(table.columns.contains(SystemTagColumn(label: "7", values: ["+1", "0"])))
        #expect(reference("red-seven").colorNote?.contains("Hearts and diamonds are red") == true)
    }

    @Test func leavesARankOnlySystemWithoutAColorNote() {
        #expect(reference("hi-lo").colorNote == nil)
    }

    /// The point of the table is that it cannot drift from what a miss is graded
    /// on, so each printed figure is checked back against `value(for:)`.
    @Test func readsEveryTagBackThroughTheEngineAccessor() {
        for system in systems {
            let table = system.tagTable
            var printed: [Rank: [String]] = [:]
            for column in table.columns {
                for rank in Self.ranks(in: column.label) {
                    printed[rank] = column.values
                }
            }
            #expect(printed.count == Card.allRanks.count, "\(system.id) covers every rank")
            let suits: [Suit] = table.rowLabels.count == 2 ? [.hearts, .spades] : [.spades]
            for rank in Card.allRanks {
                let expected = suits.map {
                    CountFormat.signedCount(system.value(for: Card(rank: rank, suit: $0)))
                }
                #expect(printed[rank] == expected, "\(system.id) \(rank.rawValue)")
            }
        }
    }

    @Test func saysWhatTheZeroDeckSumBuys() {
        let note = reference("hi-lo").balanceNote
        #expect(note.contains("sums to 0"))
        #expect(note.contains("true count"))
        #expect(reference("hi-lo").balanceLabel == "Balanced")
    }

    /// The deck sum is read off the tags, not the `balanced` flag — and it is
    /// not always KO's +4.
    @Test func namesTheDriftAnUnbalancedSystemHasAndWhichWayItRuns() {
        #expect(reference("ko").balanceNote.contains("sums to +4, not 0"))
        #expect(reference("ko").balanceNote.contains("drifts up"))
        #expect(reference("ace-mt").balanceNote.contains("sums to -20, not 0"))
        #expect(reference("ace-mt").balanceNote.contains("drifts down"))
    }

    @Test func laysOutThePublishedKeyCountsForTheShoeTheDrillIsSetTo() {
        let six = reference("ko", decks: 6)
        #expect(six.keyCountCaption.contains("6-deck shoe"))
        #expect(six.keyCountRows.map(\.value) == ["-20", "-4", "+4", "+3 or above"])
        #expect(six.keyCountMissing == nil)

        // The schedule is per deck count, so the figures follow the setting.
        let two = reference("ko", decks: 2)
        #expect(two.keyCountCaption.contains("2-deck shoe"))
        #expect(two.keyCountRows.first?.value == "-4")
    }

    /// The absence is why Settings offers these systems no key-count drill, so
    /// the reference screen says it rather than leaving a blank.
    @Test func saysSoWhenAnUnbalancedSystemCarriesNoPublishedSchedule() {
        let archer = reference("archer")
        #expect(archer.keyCountRows.isEmpty)
        #expect(archer.keyCountMissing?.contains("no published key-count schedule") == true)
    }

    @Test func saysSoWhenTheScheduleSkipsTheShoeSizeInUse() {
        // KO publishes 1, 2, 6 and 8 decks; nothing else has a row.
        let four = reference("ko", decks: 4)
        #expect(four.keyCountRows.isEmpty)
        #expect(four.keyCountMissing?.contains("4-deck shoe") == true)
    }

    /// The ranks a column label covers: "7" is one, "2–6" is the slice between
    /// its ends.
    private static func ranks(in label: String) -> [Rank] {
        let parts = label.split(separator: "–").map(String.init)
        guard parts.count == 2,
              let first = Rank(rawValue: parts[0]),
              let last = Rank(rawValue: parts[1]),
              let start = Card.allRanks.firstIndex(of: first),
              let end = Card.allRanks.firstIndex(of: last)
        else {
            return Rank(rawValue: label).map { [$0] } ?? []
        }
        return Array(Card.allRanks[start ... end])
    }
}
