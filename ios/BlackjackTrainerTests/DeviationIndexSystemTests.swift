import Foundation
import Testing
@testable import BlackjackTrainer

/// Mirrors `deviation.model.spec.ts` and the `countingSystemById` half of
/// `counting-systems.spec.ts`: which system the app's indices belong to, and
/// what a trainee counting something else is told.
@MainActor
struct DeviationIndexSystemTests {
    private var systems: [CountingSystem] {
        TestEngines.shared.countingSystems
    }

    private func system(_ id: String) throws -> CountingSystem {
        try #require(systems.first { $0.id == id })
    }

    @Test func saysNothingForTheSystemTheIndicesAreWrittenFor() throws {
        let hiLo = try system(DeviationIndexSystem.id)
        #expect(DeviationIndexSystem.note(for: hiLo) == nil)
    }

    @Test func warnsEveryOtherSystemNamingIt() throws {
        let others = systems.filter { $0.id != DeviationIndexSystem.id }
        #expect(!others.isEmpty)
        for system in others {
            let note = try #require(DeviationIndexSystem.note(for: system), "\(system.id)")
            #expect(note.contains("Hi-Lo"))
            #expect(note.contains(system.name))
        }
    }

    /// The two mismatches are not the same mistake: a balanced system has a true
    /// count that simply reads differently, an unbalanced one has none at all.
    @Test func tellsABalancedSystemItsTrueCountReadsDifferently() throws {
        let note = try #require(try DeviationIndexSystem.note(for: system("omega-ii")))
        #expect(note.contains("different true count"))
        #expect(!note.contains("unbalanced"))
    }

    @Test func tellsAnUnbalancedSystemItHasNoTrueCount() throws {
        let note = try #require(try DeviationIndexSystem.note(for: system("ko")))
        #expect(note.contains("unbalanced"))
        #expect(note.contains("no true count"))
    }

    @Test func resolvesEveryRegisteredIdToItsOwnDescriptor() {
        for system in systems {
            #expect(systems.system(withId: system.id)?.id == system.id, "\(system.id)")
        }
    }

    /// Prefs carry a stored id, which can outlive the build that wrote it. Every
    /// screen resolves through here so they agree on what a stale id means.
    @Test func fallsBackToHiLoForAnIdThisBuildDoesNotShip() {
        #expect(systems.system(withId: "does-not-exist")?.id == DeviationIndexSystem.id)
        #expect(systems.system(withId: "")?.id == DeviationIndexSystem.id)
    }
}
