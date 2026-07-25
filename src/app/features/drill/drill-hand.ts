// Pure helpers shared by the Flow drill pages (Basic Strategy, Deviations):
// question-line labels, per-hand action legality (poka-yoke), weak-spot
// scenario construction, and session-target math.

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
import type { Action, EngineOptions } from '../../core/models/strategy.model';
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

export function handQuestion(player: readonly [Card, Card], dealerUpcard: Card): HandQuestion {
  const dealer = normalizeUpcardKey(dealerUpcard);
  const pairKey = classifyAsPair(player);
  if (pairKey !== null) return { prefix: '', value: `${pairKey},${pairKey}`, dealer };
  if (isSoftHand(player)) {
    return { prefix: 'Soft', value: String(11 + softNonAceValue(player)), dealer };
  }
  return {
    prefix: 'Hard',
    value: String(cardHighValue(player[0]) + cardHighValue(player[1])),
    dealer,
  };
}

// Which of the six actions are answerable for this hand. Hit/Stand/Double are
// always live on an initial two-card hand; Split needs a pair; Insurance
// needs a dealer Ace. Surrender needs Late Surrender in the table rules —
// except where the caller's engine can expect SUR regardless of the option
// (the deviations surrender overlay), signalled via `surrenderAlways`.
export function legalActionsFor(
  player: readonly [Card, Card],
  dealerUpcard: Card,
  options: EngineOptions,
  surrenderAlways = false,
): readonly Action[] {
  const legal: Action[] = ['H', 'S', 'D'];
  if (classifyAsPair(player) !== null) legal.push('P');
  if (surrenderAlways || options.lateSurrender) legal.push('SUR');
  if (isAce(dealerUpcard)) legal.push('INS');
  return legal;
}

// Session target: the next multiple of the daily goal beyond the hands
// already practiced today. Resuming at 14/20 targets 20 (finish the goal);
// "one more round" after 20/20 targets 40.
export function nextSessionTarget(handsToday: number, goal: number): number {
  const safeGoal = Math.max(1, goal);
  return (Math.floor(Math.max(0, handsToday) / safeGoal) + 1) * safeGoal;
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
