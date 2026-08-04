import Foundation
import Testing
@testable import BlackjackTrainer

/// Which side a wrong running count lands on — the half of a miscount the
/// accuracy stores never carried. Mirrors `count-drift.service.spec.ts`.
struct CountDriftTests {
    private func suite() -> UserDefaults {
        let name = "count-drift-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    private func store(_ defaults: UserDefaults) -> CountDriftStore {
        CountDriftStore(key: StatsKeys.countDrift, defaults: defaults)
    }

    @Test func recordsTheSignedDistanceNewestFirst() {
        let drift = store(suite())
        drift.record(answer: 3, actual: 5)
        drift.record(answer: 6, actual: 5)
        #expect(drift.drifts == [1, -2])
    }

    @Test func keepsAnExactCountAsAZero() {
        let drift = store(suite())
        drift.record(answer: 5, actual: 5)
        #expect(drift.drifts == [0])
    }

    @Test func remembersOnlyTheMostRecentRounds() {
        let drift = store(suite())
        for i in 0 ..< (countDriftMemory + 5) {
            drift.record(answer: Double(i), actual: 0)
        }
        #expect(drift.drifts.count == countDriftMemory)
        #expect(drift.drifts.first == Double(countDriftMemory + 4))
    }

    @Test func persistsAcrossAReload() {
        let defaults = suite()
        store(defaults).record(answer: 3, actual: 5)
        #expect(store(defaults).drifts == [-2])
    }

    @Test func holdsTheHalfPointsAFractionalSystemProduces() {
        let drift = store(suite())
        drift.record(answer: 2.5, actual: 3)
        #expect(drift.drifts == [-0.5])
    }

    @Test func ignoresADriftNoTraineeCouldHaveHeld() {
        let drift = store(suite())
        drift.record(answer: .infinity, actual: 0)
        drift.record(answer: 10000, actual: 0)
        #expect(drift.drifts.isEmpty)
    }

    @Test func shapeStaysNilUntilThereAreEnoughRounds() {
        let drift = store(suite())
        drift.record(answer: 1, actual: 0)
        drift.record(answer: 1, actual: 0)
        #expect(drift.shape() == nil)
    }

    @Test func shapeCountsEachSide() {
        let drift = store(suite())
        for (answer, actual) in [(1.0, 3.0), (2, 4), (0, 1), (5, 4), (2, 2)] {
            drift.record(answer: answer, actual: actual)
        }
        #expect(drift.shape() == DriftShape(rounds: 5, low: 3, high: 1, exact: 1))
    }

    @Test func clearsWithAPracticeDataReset() {
        let drift = store(suite())
        drift.record(answer: 3, actual: 5)
        drift.reset()
        #expect(drift.drifts.isEmpty)
        #expect(drift.shape() == nil)
    }

    @Test func dropsACorruptStoredPayload() {
        let defaults = suite()
        defaults.set(Data("not json".utf8), forKey: StatsKeys.countDrift)
        #expect(store(defaults).drifts.isEmpty)
    }

    /// The same miss described two ways would read as two different mistakes, so
    /// the drill's feedback and the table's count check share one helper.
    @Test func driftLabelNamesTheDistanceAndTheSide() {
        #expect(countDriftLabel(2) == "2 points high")
        #expect(countDriftLabel(-1) == "1 point low")
        #expect(countDriftLabel(-0.5) == "0.5 points low")
    }

    /// The backup file moves this payload between the phone and the browser, so
    /// the stored shape is a cross-platform contract rather than this store's
    /// private business. A field named differently on one side is dropped
    /// silently on the trip.
    @Test func writesExactlyTheFieldsTheWebStoreReads() throws {
        let defaults = suite()
        store(defaults).record(answer: 3, actual: 5)
        let data = try #require(defaults.data(forKey: StatsKeys.countDrift))
        let root = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(Array(root.keys) == ["drifts"])
        #expect(root["drifts"] as? [Double] == [-2])
    }

    @Test func driftNoteNamesEachSide() {
        let note = ProgressSummary.driftNote(DriftShape(rounds: 20, low: 14, high: 2, exact: 4))
        #expect(note.contains("Your last 20 counts"))
        #expect(note.contains("14 low"))
        #expect(note.contains("2 high"))
        #expect(note.contains("4 exact"))
    }
}
