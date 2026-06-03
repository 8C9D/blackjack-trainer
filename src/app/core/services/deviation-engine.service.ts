import { Injectable } from '@angular/core';

import { H17_DEVIATIONS } from '../../data/h17-deviations';
import { S17_DEVIATIONS } from '../../data/s17-deviations';
import { cardHighValue, softNonAceValue, type Card } from '../models/card.model';
import type {
  DeviationCategory,
  DeviationDecision,
  DeviationHandKey,
  DeviationRule,
} from '../models/deviation.model';
import type { DealerUpcard, RuleSet } from '../models/strategy.model';
import {
  BasicStrategyEngineService,
  classifyAsPair,
  isSoftHand,
  normalizeUpcardKey,
  type EngineInput,
} from './basic-strategy-engine.service';

// Resolution order in resolveDeviationDecision():
//   1. Get the live basic-strategy action (honors EngineOptions for DAS / LS).
//   2. Check the surrender overlay: surrender deviations live in a dedicated
//      category and convert a non-surrender basic action to SUR when the
//      true count threshold is met. They are checked first because a hard
//      hand can have both a "regular" deviation and a surrender deviation
//      (e.g. 16 v 9 has both a SUR-at-low-TC rule and a stand-at-+4 rule).
//   3. If the live basic action is already SUR (LS enabled + chart cell is
//      SUR_*), respect it: do not let a hard/soft/pair deviation downgrade
//      surrender to stand/hit. Surrender is more valuable than the
//      alternative the natural-category deviation would suggest at this
//      threshold (e.g. 16 v 10 stand @ 0+ assumes LS is unavailable —
//      the BJA LS overlay says surrender at any count).
//   4. Otherwise check the natural-category deviation (hard / soft / pair).
//   5. If nothing matches or thresholds are unmet, the basic action stands.
@Injectable({ providedIn: 'root' })
export class DeviationEngineService {
  constructor(private readonly basicStrategy: BasicStrategyEngineService) {}

  findDeviationRule(args: {
    ruleSet: RuleSet;
    category: DeviationCategory;
    playerHand: DeviationHandKey;
    dealerUpcard: DealerUpcard;
  }): DeviationRule | undefined {
    const table = deviationsFor(args.ruleSet);
    return table.find(
      (r) =>
        r.category === args.category &&
        r.playerHand === args.playerHand &&
        r.dealerUpcard === args.dealerUpcard,
    );
  }

  isDeviationThresholdMet(rule: DeviationRule, trueCount: number): boolean {
    switch (rule.direction) {
      case 'at-or-above':
        return trueCount >= rule.index;
      case 'at-or-below':
        return trueCount <= rule.index;
      case 'positive':
        return trueCount > 0;
      case 'negative':
        return trueCount < 0;
    }
  }

  resolveDeviationDecision(input: EngineInput, trueCount: number): DeviationDecision {
    const basicDecision = this.basicStrategy.decide(input);
    const basicAction = basicDecision.action;
    const dealerKey = normalizeUpcardKey(input.dealerUpcard);
    const { category, playerHand } = classifyForDeviation(input.player);

    const surrenderRule = this.findDeviationRule({
      ruleSet: input.ruleSet,
      category: 'surrender',
      playerHand,
      dealerUpcard: dealerKey,
    });
    if (surrenderRule && this.isDeviationThresholdMet(surrenderRule, trueCount)) {
      return {
        basicAction,
        finalAction: surrenderRule.deviationAction,
        deviationApplied: true,
        matchedRule: surrenderRule,
        trueCount,
      };
    }

    if (basicAction === 'SUR') {
      return {
        basicAction,
        finalAction: basicAction,
        deviationApplied: false,
        // Surface the surrender candidate (below threshold) for UI hints; if
        // none exists, leave matchedRule undefined.
        matchedRule: surrenderRule,
        trueCount,
      };
    }

    const rule = this.findDeviationRule({
      ruleSet: input.ruleSet,
      category,
      playerHand,
      dealerUpcard: dealerKey,
    });
    if (rule && this.isDeviationThresholdMet(rule, trueCount)) {
      return {
        basicAction,
        finalAction: rule.deviationAction,
        deviationApplied: true,
        matchedRule: rule,
        trueCount,
      };
    }

    return {
      basicAction,
      finalAction: basicAction,
      deviationApplied: false,
      matchedRule: rule, // surface the candidate (below threshold) for UI hints
      trueCount,
    };
  }

  // Insurance is offered before the playing decision and has no player-hand
  // context, so it lives on its own path. basicAction is 'H' as a benign
  // placeholder — basic strategy declines insurance and the field is not
  // meaningful for this code path.
  resolveInsuranceDecision(trueCount: number, ruleSet: RuleSet): DeviationDecision {
    const rule = this.findDeviationRule({
      ruleSet,
      category: 'insurance',
      playerHand: 'insurance',
      dealerUpcard: 'A',
    });
    const declineAction = 'H' as const;
    if (rule && this.isDeviationThresholdMet(rule, trueCount)) {
      return {
        basicAction: declineAction,
        finalAction: rule.deviationAction,
        deviationApplied: true,
        matchedRule: rule,
        trueCount,
      };
    }
    return {
      basicAction: declineAction,
      finalAction: declineAction,
      deviationApplied: false,
      matchedRule: rule,
      trueCount,
    };
  }
}

// ─── pure helpers (exported for tests; not part of the Angular service) ──

export function deviationsFor(ruleSet: RuleSet): readonly DeviationRule[] {
  return ruleSet === 'H17' ? H17_DEVIATIONS : S17_DEVIATIONS;
}

// Classify a two-card hand into the (category, playerHand) tuple used to
// look up deviation rules. Pairs take precedence over hard/soft (mirroring
// the basic strategy engine's resolution order). 'surrender' is never
// returned here — surrender rules are looked up explicitly as an overlay
// using the same hard total.
export function classifyForDeviation(player: readonly [Card, Card]): {
  category: Exclude<DeviationCategory, 'surrender' | 'insurance'>;
  playerHand: DeviationHandKey;
} {
  const pairKey = classifyAsPair(player);
  if (pairKey !== null) {
    return { category: 'pair', playerHand: pairKey };
  }
  if (isSoftHand(player)) {
    const softTotal = 11 + softNonAceValue(player);
    return { category: 'soft', playerHand: String(softTotal) };
  }
  const total = cardHighValue(player[0]) + cardHighValue(player[1]);
  return { category: 'hard', playerHand: String(total) };
}
