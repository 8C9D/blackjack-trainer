import Foundation

/// Suit color, used by color-dependent counting systems (Red Seven, KISS),
/// which tag a rank differently by the card's color rather than rank alone.
enum CardColor {
    case red
    case black
}

/// Card suit. Raw values match the exported fixtures' suit strings.
enum Suit: String, Codable, CaseIterable {
    case spades
    case hearts
    case diamonds
    case clubs

    /// Hearts and diamonds are red; spades and clubs are black.
    var color: CardColor {
        self == .hearts || self == .diamonds ? .red : .black
    }
}

/// Card rank. Raw values match the exported fixtures (`"10"`, `"J"`, … `"A"`).
enum Rank: String, Codable, CaseIterable {
    case two = "2"
    case three = "3"
    case four = "4"
    case five = "5"
    case six = "6"
    case seven = "7"
    case eight = "8"
    case nine = "9"
    case ten = "10"
    case jack = "J"
    case queen = "Q"
    case king = "K"
    case ace = "A"

    var isAce: Bool {
        self == .ace
    }

    var isTenValue: Bool {
        switch self {
        case .ten, .jack, .queen, .king: true
        default: false
        }
    }

    /// Blackjack value treating aces as 11; hand math softens aces separately.
    var highValue: Int {
        if isAce { return 11 }
        if isTenValue { return 10 }
        return Int(rawValue) ?? 0
    }
}

struct Card: Equatable, Hashable, Codable {
    let rank: Rank
    let suit: Suit

    var isAce: Bool {
        rank.isAce
    }

    var isTenValue: Bool {
        rank.isTenValue
    }

    var highValue: Int {
        rank.highValue
    }

    var color: CardColor {
        suit.color
    }
}

extension Card {
    /// `ALL_RANKS` order from the web model.
    static let allRanks: [Rank] = Rank.allCases
    /// `ALL_SUITS` order from the web model.
    static let allSuits: [Suit] = Suit.allCases
}

/// The non-ace card's high value (2…10) for a soft two-card hand — a hand with
/// exactly one ace. Both engines key their soft-total lookups off this.
func softNonAceValue(_ player: TwoCardHand) -> Int {
    let nonAce = player.first.isAce ? player.second : player.first
    return nonAce.highValue
}

/// The initial two-card player hand both trainers reason about. Mirrors the
/// web's `readonly [Card, Card]`.
struct TwoCardHand: Equatable {
    let first: Card
    let second: Card

    init(_ first: Card, _ second: Card) {
        self.first = first
        self.second = second
    }

    var cards: [Card] {
        [first, second]
    }
}
