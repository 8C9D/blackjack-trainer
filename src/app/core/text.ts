// A counted noun, agreeing with its count: "1 hand", "2 hands", "0 hands",
// "1.5 decks". Every noun this app counts — hand, card, deck, day, chip, unit,
// blackjack — has a regular English plural, so the rule is only ever about the
// value, and singular means exactly one.
//
// `display` is for counts that are formatted before they are shown (decks to
// one decimal, say): the text comes from the formatter, the noun still follows
// the raw value, so 1.0 decks rendered as "1" still reads "1 deck".
export function countOf(value: number, singular: string, display = String(value)): string {
  return `${display} ${value === 1 ? singular : `${singular}s`}`;
}
