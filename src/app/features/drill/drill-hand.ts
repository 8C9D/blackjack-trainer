// Pure helpers shared by the Flow drill pages (Basic Strategy, Deviations):
// question-line labels, per-hand action legality (poka-yoke), weak-spot
// scenario construction, and session-target math.

import type { ActivatedRoute } from '@angular/router';

import {
  ALL_SUITS,
  TEN_VALUE_RANKS,
  cardHighValue,
  isAce,
  softNonAceValue,
  type Card,
  type Rank,
  type Scenario,
  type Suit,
} from '../../core/models/card.model';
import { handTotal, isSoftHand as isSoftNCardHand } from '../../core/models/hand.model';
import type { Action, DealerUpcard, EngineOptions } from '../../core/models/strategy.model';
import {
  classifyAsPair,
  isSoftHand,
  normalizeUpcardKey,
} from '../../core/services/basic-strategy-engine.service';
import type { ScenarioRef, WeakSpot } from '../../core/services/miss-tally.service';

// Parts of the computed question line, e.g. "Hard 10 vs 6" (recognition over
// recall: the total is computed for the user). Pairs have no prefix: "8,8 vs 10".
export interface HandQuestion {
  readonly prefix: 'Hard' | 'Soft' | '';
  readonly value: string;
  readonly dealer: string;
}

export function handQuestion(player: readonly Card[], dealerUpcard: Card): HandQuestion {
  const dealer = normalizeUpcardKey(dealerUpcard);
  // Past two cards there is no pair to name and the ace may have softened, so
  // the line is the N-card total the chart is about to be read at.
  if (player.length !== 2) {
    return {
      prefix: isSoftNCardHand(player) ? 'Soft' : 'Hard',
      value: String(handTotal(player)),
      dealer,
    };
  }
  const opening: readonly [Card, Card] = [player[0], player[1]];
  const pairKey = classifyAsPair(opening);
  if (pairKey !== null) return { prefix: '', value: `${pairKey},${pairKey}`, dealer };
  if (isSoftHand(opening)) {
    return { prefix: 'Soft', value: String(11 + softNonAceValue(opening)), dealer };
  }
  return {
    prefix: 'Hard',
    value: String(cardHighValue(opening[0]) + cardHighValue(opening[1])),
    dealer,
  };
}

// Most a pair splits to: three splits, four hands — the common casino cap, and
// the same one the showdown's table already enforces per box.
export const MAX_SPLIT_HANDS = 4;

// What a split has taken away from the hand in front of you. Insurance was
// settled on the deal and surrender is a first-two-cards action of the hand the
// dealer dealt, so both are gone for good; doubling comes back only under DAS;
// and a re-split needs the deal to be under its four-hand cap.
export interface SplitContext {
  readonly fromSplit: boolean;
  readonly canSplitAgain: boolean;
}

// A hand nobody has split: every action is still on the table.
export const UNSPLIT: SplitContext = { fromSplit: false, canSplitAgain: true };

// Which of the six actions are answerable for this hand. Hit/Stand/Double are
// always live on an initial two-card hand; Split needs a pair; Insurance
// needs a dealer Ace. Surrender needs Late Surrender in the table rules —
// except where the caller's engine can expect SUR regardless of the option
// (the deviations surrender overlay), signalled via `surrenderAlways`.
//
// Once a card has been drawn, hit and stand are the whole of it: double, split
// and surrender are first-two-card actions, and insurance was decided before
// the hand was played. The grid says so by going dead rather than by hiding
// them, which is the rule the drill is teaching.
//
// A hand that came out of a split is two cards again, but not the hand that was
// dealt: `split` is what the table has left it.
export function legalActionsFor(
  player: readonly Card[],
  dealerUpcard: Card,
  options: EngineOptions,
  surrenderAlways = false,
  split: SplitContext = UNSPLIT,
): readonly Action[] {
  if (player.length !== 2) return ['H', 'S'];
  const opening: readonly [Card, Card] = [player[0], player[1]];
  const legal: Action[] = ['H', 'S'];
  if (!split.fromSplit || options.doubleAfterSplit) legal.push('D');
  if (classifyAsPair(opening) !== null && split.canSplitAgain) legal.push('P');
  if (!split.fromSplit && (surrenderAlways || options.lateSurrender)) legal.push('SUR');
  if (!split.fromSplit && isAce(dealerUpcard)) legal.push('INS');
  return legal;
}

// Split the hand at `index` into two, each keeping one of its cards. The second
// card of each is dealt as that hand is reached, exactly as a dealer deals it —
// so a hand waiting behind the one in play holds a single card. A re-split
// lands its halves in place, which keeps the hands in the order they are played.
export function splitHandAt(
  hands: readonly (readonly Card[])[],
  index: number,
): readonly (readonly Card[])[] {
  const hand = hands[index];
  if (hand === undefined || hand.length !== 2) return hands;
  return [...hands.slice(0, index), [hand[0]], [hand[1]], ...hands.slice(index + 1)];
}

// Session target: the next multiple of the daily goal beyond the hands
// already practiced today. Resuming at 14/20 targets 20 (finish the goal);
// "one more round" after 20/20 targets 40.
export function nextSessionTarget(handsToday: number, goal: number): number {
  const safeGoal = Math.max(1, goal);
  return (Math.floor(Math.max(0, handsToday) / safeGoal) + 1) * safeGoal;
}

// Query parameter that opens a drill straight into a review round, so Progress
// can act on the weak spots it names. Only '1' counts: a drill entered any other
// way is an ordinary round, and a typo should not silently narrow the practice.
export const REVIEW_QUERY_PARAM = 'review';

export function isReviewEntry(route: ActivatedRoute): boolean {
  return route.snapshot.queryParamMap.get(REVIEW_QUERY_PARAM) === '1';
}

// Query parameter that pins a round to one scenario, so the chart a trainee
// reads a hand off is also where they can practise it. The value is the tally's
// own scenario key ("hard-16-v-10") — the language the chart, the weak-spot list
// and the drill already share, so no second encoding of a hand exists.
export const HAND_QUERY_PARAM = 'hand';

// The dealer upcards a chart has columns for; ten-value cards normalize to '10'.
const PINNABLE_DEALERS: readonly DealerUpcard[] = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'A',
];
const PINNABLE_PAIRS: readonly string[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];
// Soft hands are keyed by their total (A,2 is 13); hard totals start at 5, the
// lowest two cards can make, and stop at 20.
const SOFT_TOTALS = { min: 13, max: 20 };
const HARD_TOTALS = { min: 5, max: 20 };

export function pinnedScenarioRef(route: ActivatedRoute): ScenarioRef | null {
  return parseScenarioKey(route.snapshot.queryParamMap.get(HAND_QUERY_PARAM));
}

// Strict, for the same reason `?review=1` is: a value naming a hand this app
// cannot deal must fall back to an ordinary round rather than pin every hand of
// it to something no chart ever showed.
export function parseScenarioKey(value: string | null): ScenarioRef | null {
  const match = /^(hard|soft|pair)-([0-9A]{1,2})-v-([0-9A]{1,2})$/.exec(value ?? '');
  if (match === null) return null;
  const [, kind, hand, upcard] = match;
  const dealer = PINNABLE_DEALERS.find((u) => u === upcard);
  if (dealer === undefined) return null;
  if (kind === 'pair') {
    return PINNABLE_PAIRS.includes(hand) ? { kind, hand, dealer } : null;
  }
  const total = Number(hand);
  const range = kind === 'soft' ? SOFT_TOTALS : HARD_TOTALS;
  if (!Number.isInteger(total) || total < range.min || total > range.max) return null;
  return { kind: kind as ScenarioRef['kind'], hand, dealer };
}

// Share of an ordinary round's hands drawn from the user's weak spots. High
// enough that a weakness gets real repetition inside one session, low enough
// that the round still feels like practice rather than a loop of three hands
// — and the rest of the chart keeps getting rehearsed.
export const WEAK_SPOT_SHARE = 0.4;

// Choose the next hand's source: a weak spot, or null meaning "deal a fresh
// random hand". Weak spots compete in proportion to their miss counts, so the
// scenario a user misses most comes back most. `share` is the probability of
// drawing from the weak list at all — review rounds pass 1.
export function pickWeakSpot(
  weakSpots: readonly WeakSpot[],
  random: () => number,
  share: number = WEAK_SPOT_SHARE,
): WeakSpot | null {
  if (weakSpots.length === 0) return null;
  if (random() >= share) return null;
  const total = weakSpots.reduce((sum, spot) => sum + spot.misses, 0);
  if (total <= 0) return null;
  let ticket = random() * total;
  for (const spot of weakSpots) {
    ticket -= spot.misses;
    if (ticket < 0) return spot;
  }
  // Only reachable if `random()` returns exactly 1 (or floating-point error
  // eats the last slice); the final spot is the right answer either way.
  return weakSpots[weakSpots.length - 1];
}

// Build a concrete deal matching a recorded weak-spot ref, so a session can
// open with the scenario the user keeps missing.
export function scenarioFromRef(ref: ScenarioRef, random: () => number): Scenario {
  return {
    player: playerCardsFromRef(ref, random),
    dealerUpcard: dealerCardFor(ref.dealer, random),
  };
}

function playerCardsFromRef(ref: ScenarioRef, random: () => number): readonly [Card, Card] {
  switch (ref.kind) {
    case 'pair': {
      if (ref.hand === '10') return [tenValueCard(random), tenValueCard(random)];
      const rank = ref.hand as Rank;
      return [
        { rank, suit: randomSuit(random) },
        { rank, suit: randomSuit(random) },
      ];
    }
    case 'soft': {
      const ace: Card = { rank: 'A', suit: randomSuit(random) };
      const other = cardOfValue(Number(ref.hand) - 11, random);
      return random() < 0.5 ? [ace, other] : [other, ace];
    }
    case 'hard':
      return hardTotalCards(Number(ref.hand), random);
  }
}

// Two distinct-value non-ace cards summing to the total, so the hand
// classifies as hard (recorded hard refs always have such a decomposition;
// a same-value pair is the defensive fallback).
function hardTotalCards(total: number, random: () => number): readonly [Card, Card] {
  const options: Array<[number, number]> = [];
  for (let a = 2; a <= 10; a++) {
    for (let b = a + 1; b <= 10; b++) {
      if (a + b === total) options.push([a, b]);
    }
  }
  if (options.length === 0) {
    return [cardOfValue(total / 2, random), cardOfValue(total / 2, random)];
  }
  const pick = options[Math.floor(random() * options.length)];
  const [v1, v2] = random() < 0.5 ? pick : [pick[1], pick[0]];
  return [cardOfValue(v1, random), cardOfValue(v2, random)];
}

function dealerCardFor(upcard: string, random: () => number): Card {
  if (upcard === 'A') return { rank: 'A', suit: randomSuit(random) };
  if (upcard === '10') return tenValueCard(random);
  return { rank: upcard as Rank, suit: randomSuit(random) };
}

// value 2..9 → that rank; 10 → a random ten-value face.
function cardOfValue(value: number, random: () => number): Card {
  if (value >= 10) return tenValueCard(random);
  return { rank: String(value) as Rank, suit: randomSuit(random) };
}

function tenValueCard(random: () => number): Card {
  return {
    rank: TEN_VALUE_RANKS[Math.floor(random() * TEN_VALUE_RANKS.length)],
    suit: randomSuit(random),
  };
}

function randomSuit(random: () => number): Suit {
  return ALL_SUITS[Math.floor(random() * ALL_SUITS.length)];
}
