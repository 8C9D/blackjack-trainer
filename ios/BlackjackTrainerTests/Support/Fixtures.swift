import Foundation
@testable import BlackjackTrainer

/// Loads the exported parity fixtures (`ios/Fixtures/*.json`) that are bundled
/// into the test target as resources. These are the source-of-truth golden
/// vectors the Swift engines are graded against.
enum Fixtures {
    private final class BundleToken {}

    static var bundle: Bundle {
        Bundle(for: BundleToken.self)
    }

    static func load<T: Decodable>(_: T.Type, _ name: String) throws -> T {
        guard let url = bundle.url(forResource: name, withExtension: "json") else {
            throw FixtureError.notFound(name)
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(T.self, from: data)
    }

    enum FixtureError: Error, CustomStringConvertible {
        case notFound(String)

        var description: String {
            switch self {
            case let .notFound(name): "fixture \(name).json not found in test bundle"
            }
        }
    }
}

/// Builds a `Card` from a fixture rank string; suit is arbitrary for the
/// suit-independent strategy/deviation/showdown vectors.
func card(_ rank: String, _ suit: Suit = .spades) -> Card {
    guard let r = Rank(rawValue: rank) else {
        fatalError("invalid fixture rank \(rank)")
    }
    return Card(rank: r, suit: suit)
}
