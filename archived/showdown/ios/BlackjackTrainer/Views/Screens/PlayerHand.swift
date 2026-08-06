/// One player hand in the showdown. Hands come from two places: the opening deal
/// gives one per occupied box, and splitting a pair turns one hand into several.
/// Either way each is played and settled independently against the one dealer.
struct PlayerHand {
    var cards: [Card]
    /// Which box (0-based) this hand belongs to. Splits stay in their box, so the
    /// four-hand cap counts only the hands sharing a box.
    var box = 0
    /// Doubled: took exactly one card at a doubled stake.
    var doubled = false
    /// A split-ace hand takes exactly one card, then stands (no hit/double/re-split).
    var isSplitAce = false
    /// Came out of a split. A 21 on such a hand is not a natural and pays even
    /// money — tracked per hand rather than inferred from the hand count, because
    /// multiple boxes also produce multiple hands without any split involved.
    var fromSplit = false
    /// Gave up the hand as a first decision, forfeiting half the bet. The dealer
    /// owes this hand nothing, so it settles as a loss the moment it surrenders.
    var surrendered = false
    /// Chips this hand has up. Every box posts the round's bet, and a split puts a
    /// second bet on the new hand. Zero when betting is off.
    var bet = 0.0
    /// Finished acting (stood, busted, doubled, or a completed split ace).
    var done = false
    var settlement: Settlement?
}
