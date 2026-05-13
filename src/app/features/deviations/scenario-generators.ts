// Scenario generators for the "Deviation-only" practice mode.
//
// These helpers are pure functions that take an injectable `random` source
// so they can be unit-tested deterministically. They never reach into Angular
// state and never mutate.
//
// The page component calls them with `Math.random` and combines the result
// with the user-selected TrueCountSource (random/manual).

import {
  ALL_RANKS,
  ALL_SUITS,
  type Card,
  type Rank,
  type Suit,
} from '../../core/models/card.model';
import type { DeviationRule } from '../../core/models/deviation.model';
import type { DealerUpcard, RuleSet } from '../../core/models/strategy.model';
import { H17_DEVIATIONS } from '../../data/h17-deviations';
import { S17_DEVIATIONS } from '../../data/s17-deviations';

export function deviationRulesFor(ruleSet: RuleSet): readonly DeviationRule[] {
  return ruleSet === 'H17' ? H17_DEVIATIONS : S17_DEVIATIONS;
}

export function pickDeviationRule(
  ruleSet: RuleSet,
  random: () => number,
): DeviationRule {
  const rules = deviationRulesFor(ruleSet);
  return rules[Math.floor(random() * rules.length)];
}

// Build a two-card player hand that the deviation engine will route to the
// given rule. For 'hard'/'surrender' we deliberately avoid same-rank pairs
// (which would route through the pair lookup instead).
export function makePlayerCardsForDeviationRule(
  rule: DeviationRule,
  random: () => number,
): readonly [Card, Card] {
  switch (rule.category) {
    case 'hard':
    case 'surrender':
      return makeHardTotalCards(Number(rule.playerHand), random);
    case 'soft':
      return makeSoftTotalCards(Number(rule.playerHand), random);
    case 'pair':
      return makePairCards(rule.playerHand, random);
    case 'insurance':
      return makeAnyTwoCards(random);
  }
}

// Pick a dealer upcard card matching the rule's chart-key upcard. '10' is
// expanded to any of the four ten-value ranks so the table doesn't always
// show the same face.
export function makeDealerUpcardCard(
  upcard: DealerUpcard,
  random: () => number,
): Card {
  if (upcard === 'A') return { rank: 'A', suit: randomSuit(random) };
  if (upcard === '10') return tenValueCard(random);
  return { rank: upcard as Rank, suit: randomSuit(random) };
}

// Pick a true count that exercises the given rule's threshold. The result
// is clamped to [minTc, maxTc]. With 50% probability the count lands on the
// "threshold met" side of the rule and 50% on the "not met" side, so users
// must still decide whether the deviation applies.
export function pickTrueCountForDeviationRule(
  rule: DeviationRule,
  random: () => number,
  minTc: number,
  maxTc: number,
): number {
  const wantMet = random() < 0.5;
  const [lo, hi] = rangeFor(rule, wantMet, minTc, maxTc);
  if (lo <= hi) return pickInt(lo, hi, random);
  // Empty range — every TC in [minTc, maxTc] satisfies wantMet, so picking
  // any in-range TC keeps the wantMet semantics. Fall back to the threshold
  // itself when even that fails (defensive — not reachable for current data).
  const [fallbackLo, fallbackHi] = rangeFor(rule, !wantMet, minTc, maxTc);
  if (fallbackLo <= fallbackHi) return pickInt(fallbackLo, fallbackHi, random);
  return clampTc(rule.index, minTc, maxTc);
}

export interface GeneratedScenario {
  readonly player: readonly [Card, Card];
  readonly dealerUpcard: Card;
}

export function generateScenarioForDeviationRule(args: {
  rule: DeviationRule;
  random: () => number;
}): GeneratedScenario {
  return {
    player: makePlayerCardsForDeviationRule(args.rule, args.random),
    dealerUpcard: makeDealerUpcardCard(args.rule.dealerUpcard, args.random),
  };
}

// ─── internal helpers ──────────────────────────────────────────────────

// Generates a non-pair two-card combo summing to `total`. Same-rank pairs
// are filtered out because they would route through the pair lookup and
// miss the hard/surrender rule we're targeting. (None of the encoded hard
// deviation totals require a same-rank fallback — 8, 9, 10, 11, 12, 13, 15, 16
// all have a non-pair option.)
function makeHardTotalCards(
  total: number,
  random: () => number,
): readonly [Card, Card] {
  const options: Array<[number, number]> = [];
  for (let a = 2; a <= 10; a++) {
    for (let b = a + 1; b <= 10; b++) {
      if (a + b === total) options.push([a, b]);
    }
  }
  if (options.length === 0) {
    // Safety net for unusual totals; same-rank pairs are accepted as a
    // last resort even though they'd route through pair lookup.
    for (let a = 2; a <= 10; a++) {
      if (2 * a === total) options.push([a, a]);
    }
  }
  const pick = options[Math.floor(random() * options.length)];
  const [v1, v2] = random() < 0.5 ? pick : [pick[1], pick[0]];
  return [cardOfValue(v1, random), cardOfValue(v2, random)] as const;
}

// soft total = 11 + non-ace value → A + (total - 11). Soft 17 → A + 6,
// Soft 19 → A + 8. The two cards are returned in a randomized order.
function makeSoftTotalCards(
  total: number,
  random: () => number,
): readonly [Card, Card] {
  const nonAceValue = total - 11;
  const ace: Card = { rank: 'A', suit: randomSuit(random) };
  const other = cardOfValue(nonAceValue, random);
  return random() < 0.5 ? ([ace, other] as const) : ([other, ace] as const);
}

function makePairCards(
  playerHand: string,
  random: () => number,
): readonly [Card, Card] {
  if (playerHand === '10') {
    return [tenValueCard(random), tenValueCard(random)] as const;
  }
  const rank = playerHand as Rank;
  return [
    { rank, suit: randomSuit(random) },
    { rank, suit: randomSuit(random) },
  ] as const;
}

function makeAnyTwoCards(random: () => number): readonly [Card, Card] {
  return [randomAnyCard(random), randomAnyCard(random)] as const;
}

function randomAnyCard(random: () => number): Card {
  // Drawn from the full 13 ranks (A and ten-value variants included) so
  // insurance scenarios show realistic player hands.
  return {
    rank: ALL_RANKS[Math.floor(random() * ALL_RANKS.length)],
    suit: randomSuit(random),
  };
}

// value: 2..9 → that rank; 10 → random of '10' | 'J' | 'Q' | 'K'.
// Callers (makeHardTotalCards, makeSoftTotalCards) only ever pass values in
// 2..10; Aces are produced by makeSoftTotalCards / makePairCards directly.
function cardOfValue(value: number, random: () => number): Card {
  let rank: Rank;
  if (value === 10) {
    const tens: readonly Rank[] = ['10', 'J', 'Q', 'K'];
    rank = tens[Math.floor(random() * tens.length)];
  } else {
    rank = String(value) as Rank;
  }
  return { rank, suit: randomSuit(random) };
}

function tenValueCard(random: () => number): Card {
  const tens: readonly Rank[] = ['10', 'J', 'Q', 'K'];
  return {
    rank: tens[Math.floor(random() * tens.length)],
    suit: randomSuit(random),
  };
}

function randomSuit(random: () => number): Suit {
  return ALL_SUITS[Math.floor(random() * ALL_SUITS.length)];
}

function pickInt(lo: number, hi: number, random: () => number): number {
  return lo + Math.floor(random() * (hi - lo + 1));
}

function clampTc(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

// Inclusive [lo, hi] for the wantMet side of the rule's threshold. The
// returned range is also intersected with [minTc, maxTc] so callers don't
// need to clamp.
function rangeFor(
  rule: DeviationRule,
  wantMet: boolean,
  minTc: number,
  maxTc: number,
): [number, number] {
  // Cap how far away from the index we'll stray so the random TC stays
  // useful for drilling the rule (not e.g. always TC = MIN_RANDOM_TRUE_COUNT).
  const SPREAD = 3;
  switch (rule.direction) {
    case 'at-or-above': {
      const i = rule.index;
      if (wantMet) return [Math.max(i, minTc), Math.min(i + SPREAD, maxTc)];
      return [Math.max(i - SPREAD, minTc), Math.min(i - 1, maxTc)];
    }
    case 'at-or-below': {
      const i = rule.index;
      if (wantMet) return [Math.max(i - SPREAD, minTc), Math.min(i, maxTc)];
      return [Math.max(i + 1, minTc), Math.min(i + SPREAD, maxTc)];
    }
    case 'positive': {
      if (wantMet) return [Math.max(1, minTc), maxTc];
      return [minTc, Math.min(0, maxTc)];
    }
    case 'negative': {
      if (wantMet) return [minTc, Math.min(-1, maxTc)];
      return [Math.max(0, minTc), maxTc];
    }
  }
}
