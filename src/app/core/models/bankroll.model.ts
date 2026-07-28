import type { Settlement } from './showdown.model';

// Pure betting math for the post-count showdown. Chips are abstract units, not a
// currency: the point is practising *bet sizing* against the count, so the only
// thing that matters is the ratio between a bet and the bankroll.
//
// Kept free of Angular and of the shoe so the Swift port can be checked against
// the same parity vectors.

// Chips a fresh bankroll starts with. 500 at a 1-chip minimum leaves room for a
// long session of counting-sized spreads (1 to 25) without a reset.
export const DEFAULT_BANKROLL = 500;

// Selectable bet sizes, for the round's bet control. A 1-to-25 spread is the
// range a card counter actually varies across, which is the skill being drilled.
export const BET_OPTIONS: readonly number[] = [1, 2, 5, 10, 25];

export const MIN_BET = 1;

// Clamp a bet to something playable: at least the minimum, never more than the
// bankroll can cover, and a whole number of chips.
export function clampBet(bet: number, bankroll: number): number {
  if (!Number.isFinite(bet)) return MIN_BET;
  const affordable = Math.max(MIN_BET, Math.floor(bankroll));
  return Math.min(affordable, Math.max(MIN_BET, Math.floor(bet)));
}

// The largest of BET_OPTIONS the bankroll can still cover, so the bet control can
// fall back sensibly after a losing streak.
export function largestAffordableBet(bankroll: number): number {
  const affordable = BET_OPTIONS.filter((b) => b <= bankroll);
  return affordable.length > 0 ? affordable[affordable.length - 1] : MIN_BET;
}

// Chips at risk on a hand: a double puts a second bet up alongside the first.
export function stakeFor(bet: number, doubled: boolean): number {
  return doubled ? bet * 2 : bet;
}

// Net chips a settled hand returns, relative to the bet already committed:
// a win pays the stake, a natural pays 3:2 *on the bet*, a push returns the
// stake (net zero), and a loss forfeits it. A natural is settled at the deal and
// so can never be doubled, which is why the 3:2 branch reads `bet`, not `stake`.
export function handPayout(settlement: Settlement, bet: number, doubled: boolean): number {
  const stake = stakeFor(bet, doubled);
  if (settlement.outcome === 'push') return 0;
  if (settlement.outcome === 'lose') return -stake;
  if (settlement.playerBlackjack) return bet * 1.5;
  return stake;
}

// Surrendering forfeits half the bet and returns the rest. It is only ever the
// single opening bet at stake: surrender is a first decision, so no doubled or
// split stake can exist behind it.
export function surrenderForfeit(bet: number): number {
  return -(bet / 2);
}

// Insurance is a side bet of half the box's bet, offered when the dealer shows
// an ace. Half of an odd bet is a genuine half chip, matching the 3:2 payouts.
export function insuranceCost(bet: number): number {
  return bet / 2;
}

// Net chips an insurance bet returns: it pays 2:1 when the dealer turns over a
// natural (so it exactly covers the bet the hand is about to lose), and is
// forfeited otherwise.
export function insurancePayout(bet: number, dealerBlackjack: boolean): number {
  const cost = insuranceCost(bet);
  return dealerBlackjack ? cost * 2 : -cost;
}
