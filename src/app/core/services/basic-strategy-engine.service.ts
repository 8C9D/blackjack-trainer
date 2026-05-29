import { Injectable } from '@angular/core';

import { H17_CHART } from '../../data/h17-basic-strategy';
import { S17_CHART } from '../../data/s17-basic-strategy';
import {
  cardHighValue,
  isAce,
  isTenValue,
  softNonAceValue,
  type Card,
} from '../models/card.model';
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
        return { action: 'H', source: 'soft', handDescription: description, reason: `${prefix}: hit.` };
      case 'S':
        return { action: 'S', source: 'soft', handDescription: description, reason: `${prefix}: stand.` };
      case 'D':
      case 'Ds':
        // Initial two-card hand → doubling is always permitted, so 'Ds'
        // collapses to Double here.
        return { action: 'D', source: 'soft', handDescription: description, reason: `${prefix}: double.` };
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
        return { action: 'H', source: 'hard', handDescription: description, reason: `${prefix}: hit.` };
      case 'S':
        return { action: 'S', source: 'hard', handDescription: description, reason: `${prefix}: stand.` };
      case 'D':
        return { action: 'D', source: 'hard', handDescription: description, reason: `${prefix}: double.` };
      case 'SUR_H':
        if (options.lateSurrender) {
          return { action: 'SUR', source: 'surrender', handDescription: description, reason: `${prefix}: surrender.` };
        }
        return { action: 'H', source: 'hard', handDescription: description, reason: `${prefix}: hit (Late Surrender unavailable).` };
      case 'SUR_S':
        if (options.lateSurrender) {
          return { action: 'SUR', source: 'surrender', handDescription: description, reason: `${prefix}: surrender.` };
        }
        return { action: 'S', source: 'hard', handDescription: description, reason: `${prefix}: stand (Late Surrender unavailable).` };
    }
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
