import { Injectable } from '@angular/core';

import { H17_CHART } from '../../data/h17-basic-strategy';
import { S17_CHART } from '../../data/s17-basic-strategy';
import { cardHighValue, isAce, isTenValue, softNonAceValue, type Card } from '../models/card.model';
import { handTotal, isSoftHand as isSoftNCardHand } from '../models/hand.model';
import {
  ACTION_LABELS,
  type Action,
  type DealerUpcard,
  type EngineOptions,
  type EvaluationResult,
  type HardCell,
  type HardKey,
  type PairCell,
  type PairKey,
  type RuleSet,
  type SoftCell,
  type SoftKey,
  type StrategyChart,
  type StrategyDecision,
} from '../models/strategy.model';

export interface EngineInput {
  readonly player: readonly [Card, Card];
  readonly dealerUpcard: Card;
  readonly ruleSet: RuleSet;
  readonly options: EngineOptions;
}

// A decision at the table rather than off the chart. `decide` answers the
// opening question — two cards, every action on the table — which is the whole
// of the Basic Strategy drill. Playing a hand out asks a narrower one: the hand
// may be three cards deep, and doubling, splitting and surrender may already be
// off the table (a hit has been taken, the box was split, the bankroll cannot
// back a second bet). The chart is the same; only the set of answers it may
// legally give has shrunk.
export interface PlayInput {
  // The hand as it stands, one card or many.
  readonly player: readonly Card[];
  readonly dealerUpcard: Card;
  readonly ruleSet: RuleSet;
  readonly options: EngineOptions;
  // What the *table* allows this hand right now — the bankroll cannot back a
  // second bet, the box was already split, the house does not offer surrender.
  // What the *cards* allow is not the caller's to say: all three are first-two-
  // card actions, and the engine enforces that itself, so a caller that leaves
  // these true on a three-card hand still cannot be told to double.
  //
  // A cell calling for an unavailable action falls back the way the published
  // chart reads it: a double becomes a hit (or a stand, for the soft `Ds`
  // cells), and a surrender becomes the play the cell names behind it.
  readonly canDouble: boolean;
  readonly canSplit: boolean;
  readonly canSurrender: boolean;
}

// Resolution priority (per spec):
//   1. Insurance is handled in evaluate() — never a correct chart action.
//   2. Pair check (with Y/N fall-through to hard/soft when DAS is off).
//   3. Soft total chart (one ace, total ≤ 21).
//   4. Hard total chart.
// Surrender (SUR_*) cells are resolved in-place against EngineOptions.
@Injectable({ providedIn: 'root' })
export class BasicStrategyEngineService {
  decide(input: EngineInput): StrategyDecision {
    const chart = this.chartFor(input.ruleSet);
    const dealerKey = normalizeUpcardKey(input.dealerUpcard);

    const pairKey = classifyAsPair(input.player);
    if (pairKey !== null) {
      const cell = chart.pair[pairKey][dealerKey];
      const fromPair = this.resolvePair(cell, pairKey, dealerKey, chart, input.options);
      if (fromPair !== null) return fromPair;
      // 'N' / 'YN' with DAS off — fall through to hard/soft total resolution.
    }

    if (isSoftHand(input.player)) {
      return this.resolveSoft(input.player, dealerKey, chart);
    }
    return this.resolveHard(input.player, dealerKey, chart, input.options);
  }

  // The correct play for a hand mid-round. Resolution priority matches
  // `decide` — pair, then soft, then hard — but every branch resolves against
  // the actions actually on offer, and totals are read from the N-card
  // evaluator rather than from two cards.
  decidePlay(input: PlayInput): StrategyDecision {
    const chart = this.chartFor(input.ruleSet);
    const dealerKey = normalizeUpcardKey(input.dealerUpcard);
    const cards = input.player;
    // Double, split and surrender are all first-two-card actions. Once a card
    // has been drawn they are gone as a matter of the rules, whatever the
    // caller passed.
    const opening = cards.length === 2;
    const doubleOffered = input.canDouble && opening;
    const surrenderOffered = input.canSurrender && opening;

    // Pairs are a first-two-cards decision, so a split offer that has lapsed
    // (or that the bankroll cannot back) takes the hand straight to its total.
    if (input.canSplit && opening) {
      const pairKey = classifyAsPair(cards as readonly [Card, Card]);
      if (pairKey !== null) {
        const fromPair = this.resolvePair(
          chart.pair[pairKey][dealerKey],
          pairKey,
          dealerKey,
          chart,
          // Surrender may have lapsed even where the chart's SUR_Y cell wants
          // it, so the pair branch sees the same narrowed rule the rest does.
          { ...input.options, lateSurrender: input.options.lateSurrender && surrenderOffered },
        );
        if (fromPair !== null) return fromPair;
      }
    }

    const total = handTotal(cards);
    const surrenderAvailable = input.options.lateSurrender && surrenderOffered;

    if (isSoftNCardHand(cards)) {
      // Soft 21 is off the top of the chart, which stops at soft 20, and there
      // is nothing to decide: stand.
      if (total >= 21) return standing(`Soft ${total}`, dealerKey, chart.ruleSet);
      // Soft 12 is off the bottom, which starts at soft 13. The only hand that
      // reaches it is A,A that could not be split — a pair of aces is always a
      // split when splitting is on offer — and a soft 12 cannot bust, so it
      // hits.
      if (total < 13) {
        return decisionOf(
          'H',
          'soft',
          `Soft ${total}`,
          dealerKey,
          chart.ruleSet,
          'hit (a pair of aces that cannot be split)',
        );
      }
      const softKey = (total - 11) as SoftKey;
      const description = `Soft ${total}`;
      const cell: SoftCell = chart.soft[softKey][dealerKey];
      return reduceSoftCell(cell, description, dealerKey, chart.ruleSet, doubleOffered);
    }

    // Hard 21 (and anything above it) is likewise off the chart.
    if (total >= 21) return standing(`Hard ${total}`, dealerKey, chart.ruleSet);
    // 2,2 falling through from the pair branch is a hard 4; the chart starts at
    // 5, and every row below it hits regardless.
    const key: HardKey = (total < 5 ? 5 : total) as HardKey;
    const cell: HardCell = chart.hard[key][dealerKey];
    return reduceHardCell(
      cell,
      `Hard ${total}`,
      dealerKey,
      chart.ruleSet,
      doubleOffered,
      surrenderAvailable,
    );
  }

  evaluate(input: EngineInput, userAction: Action): EvaluationResult {
    const decision = this.decide(input);

    if (userAction === 'INS') {
      return {
        ...decision,
        userAction,
        correct: false,
        source: 'insurance',
        reason:
          'Basic strategy never takes insurance (or even money) — the bet has a ' +
          `negative expectation. The correct action here is ${ACTION_LABELS[decision.action]}: ` +
          decision.reason,
      };
    }
    return { ...decision, userAction, correct: userAction === decision.action };
  }

  private chartFor(ruleSet: RuleSet): StrategyChart {
    return ruleSet === 'H17' ? H17_CHART : S17_CHART;
  }

  private resolvePair(
    cell: PairCell,
    pairKey: PairKey,
    dealerKey: DealerUpcard,
    chart: StrategyChart,
    options: EngineOptions,
  ): StrategyDecision | null {
    const description = describePair(pairKey);
    const prefix = `${description} vs dealer ${dealerKey} under ${chart.ruleSet}`;

    switch (cell) {
      case 'Y':
        return {
          action: 'P',
          source: 'pair',
          handDescription: description,
          reason: `${prefix}: split.`,
        };
      case 'YN':
        if (options.doubleAfterSplit) {
          return {
            action: 'P',
            source: 'pair',
            handDescription: description,
            reason: `${prefix}: split (Double After Split is enabled).`,
          };
        }
        return null;
      case 'N':
        return null;
      case 'SUR_Y':
        if (options.lateSurrender) {
          return {
            action: 'SUR',
            source: 'surrender',
            handDescription: description,
            reason: `${prefix}: surrender (Late Surrender available).`,
          };
        }
        return {
          action: 'P',
          source: 'pair',
          handDescription: description,
          reason: `${prefix}: split (Late Surrender unavailable, so fall back to split).`,
        };
    }
  }

  private resolveSoft(
    player: readonly [Card, Card],
    dealerKey: DealerUpcard,
    chart: StrategyChart,
  ): StrategyDecision {
    const nonAceValue = softNonAceValue(player); // 2..10

    if (nonAceValue === 10) {
      return {
        action: 'S',
        source: 'soft',
        handDescription: 'Blackjack (A + 10)',
        reason: 'Blackjack — stand.',
      };
    }

    const softKey = nonAceValue as SoftKey;
    const softTotal = 11 + softKey;
    const description = `Soft ${softTotal} (A, ${softKey})`;
    const prefix = `${description} vs dealer ${dealerKey} under ${chart.ruleSet}`;
    const cell: SoftCell = chart.soft[softKey][dealerKey];

    switch (cell) {
      case 'H':
        return {
          action: 'H',
          source: 'soft',
          handDescription: description,
          reason: `${prefix}: hit.`,
        };
      case 'S':
        return {
          action: 'S',
          source: 'soft',
          handDescription: description,
          reason: `${prefix}: stand.`,
        };
      case 'D':
      case 'Ds':
        // Initial two-card hand → doubling is always permitted, so 'Ds'
        // collapses to Double here.
        return {
          action: 'D',
          source: 'soft',
          handDescription: description,
          reason: `${prefix}: double.`,
        };
    }
  }

  private resolveHard(
    player: readonly [Card, Card],
    dealerKey: DealerUpcard,
    chart: StrategyChart,
    options: EngineOptions,
  ): StrategyDecision {
    const total = cardHighValue(player[0]) + cardHighValue(player[1]);
    // Clamp 2,2 fall-through (hard 4) up to the lowest chart row — plays
    // identically (always hit).
    const key: HardKey = (total < 5 ? 5 : total) as HardKey;
    const description = `Hard ${total}`;
    const prefix = `${description} vs dealer ${dealerKey} under ${chart.ruleSet}`;
    const cell: HardCell = chart.hard[key][dealerKey];

    switch (cell) {
      case 'H':
        return {
          action: 'H',
          source: 'hard',
          handDescription: description,
          reason: `${prefix}: hit.`,
        };
      case 'S':
        return {
          action: 'S',
          source: 'hard',
          handDescription: description,
          reason: `${prefix}: stand.`,
        };
      case 'D':
        return {
          action: 'D',
          source: 'hard',
          handDescription: description,
          reason: `${prefix}: double.`,
        };
      case 'SUR_H':
        if (options.lateSurrender) {
          return {
            action: 'SUR',
            source: 'surrender',
            handDescription: description,
            reason: `${prefix}: surrender.`,
          };
        }
        return {
          action: 'H',
          source: 'hard',
          handDescription: description,
          reason: `${prefix}: hit (Late Surrender unavailable).`,
        };
      case 'SUR_S':
        if (options.lateSurrender) {
          return {
            action: 'SUR',
            source: 'surrender',
            handDescription: description,
            reason: `${prefix}: surrender.`,
          };
        }
        return {
          action: 'S',
          source: 'hard',
          handDescription: description,
          reason: `${prefix}: stand (Late Surrender unavailable).`,
        };
    }
  }
}

// ─── mid-hand cell reduction (pure; used by decidePlay) ─────────────────
//
// The chart names a play assuming every action is on the table. These collapse
// a cell onto what the hand may actually do, the way the published charts read
// their own footnotes: a hard double falls back to a hit, a soft `Ds` falls
// back to a stand (that is what the small 's' means), and a surrender cell
// names the play to make when surrender is not offered.

function decisionOf(
  action: StrategyDecision['action'],
  source: StrategyDecision['source'],
  description: string,
  dealerKey: DealerUpcard,
  ruleSet: RuleSet,
  verb: string,
): StrategyDecision {
  return {
    action,
    source,
    handDescription: description,
    reason: `${description} vs dealer ${dealerKey} under ${ruleSet}: ${verb}.`,
  };
}

function standing(
  description: string,
  dealerKey: DealerUpcard,
  ruleSet: RuleSet,
): StrategyDecision {
  return decisionOf('S', 'hard', description, dealerKey, ruleSet, 'stand');
}

function reduceSoftCell(
  cell: SoftCell,
  description: string,
  dealerKey: DealerUpcard,
  ruleSet: RuleSet,
  canDouble: boolean,
): StrategyDecision {
  const soft = (action: StrategyDecision['action'], verb: string) =>
    decisionOf(action, 'soft', description, dealerKey, ruleSet, verb);
  switch (cell) {
    case 'H':
      return soft('H', 'hit');
    case 'S':
      return soft('S', 'stand');
    case 'D':
      return canDouble ? soft('D', 'double') : soft('H', 'hit (doubling is not available)');
    case 'Ds':
      return canDouble ? soft('D', 'double') : soft('S', 'stand (doubling is not available)');
  }
}

function reduceHardCell(
  cell: HardCell,
  description: string,
  dealerKey: DealerUpcard,
  ruleSet: RuleSet,
  canDouble: boolean,
  canSurrender: boolean,
): StrategyDecision {
  const hard = (action: StrategyDecision['action'], verb: string) =>
    decisionOf(action, 'hard', description, dealerKey, ruleSet, verb);
  switch (cell) {
    case 'H':
      return hard('H', 'hit');
    case 'S':
      return hard('S', 'stand');
    case 'D':
      return canDouble ? hard('D', 'double') : hard('H', 'hit (doubling is not available)');
    case 'SUR_H':
      return canSurrender
        ? decisionOf('SUR', 'surrender', description, dealerKey, ruleSet, 'surrender')
        : hard('H', 'hit (surrender is not available)');
    case 'SUR_S':
      return canSurrender
        ? decisionOf('SUR', 'surrender', description, dealerKey, ruleSet, 'surrender')
        : hard('S', 'stand (surrender is not available)');
  }
}

// ─── pure helpers (exported for tests; not part of the Angular service) ──

export function normalizeUpcardKey(card: Card): DealerUpcard {
  if (isAce(card)) return 'A';
  if (isTenValue(card)) return '10';
  return card.rank as DealerUpcard;
}

export function classifyAsPair(player: readonly [Card, Card]): PairKey | null {
  const [a, b] = player;
  if (isTenValue(a) && isTenValue(b)) return '10';
  if (a.rank === b.rank) return a.rank as PairKey;
  return null;
}

// Soft hand = exactly one ace among the two initial cards (A,A is treated
// as a pair, not soft).
export function isSoftHand(player: readonly [Card, Card]): boolean {
  return isAce(player[0]) !== isAce(player[1]);
}

function describePair(pairKey: PairKey): string {
  if (pairKey === 'A') return 'Pair of Aces';
  if (pairKey === '10') return 'Pair of ten-value cards';
  return `Pair of ${pairKey}s`;
}
