import { Injectable } from '@angular/core';

import { H17_DEVIATIONS } from '../../data/h17-deviations';
import { S17_DEVIATIONS } from '../../data/s17-deviations';
import { formatSignedCount } from '../models/card-counting.model';
import { cardHighValue, softNonAceValue, type Card } from '../models/card.model';
import {
  describeDeviationThreshold,
  type DeviationCategory,
  type DeviationDecision,
  type DeviationHandKey,
  type DeviationRule,
} from '../models/deviation.model';
import { handTotal, isSoftHand as isSoftNCardHand } from '../models/hand.model';
import {
  ACTION_LABELS,
  type Action,
  type DealerUpcard,
  type RuleSet,
  type StrategyDecision,
} from '../models/strategy.model';
import {
  BasicStrategyEngineService,
  classifyAsPair,
  isSoftHand,
  normalizeUpcardKey,
  type EngineInput,
  type PlayInput,
} from './basic-strategy-engine.service';

// A table decision with the count on top of it. Shaped as a StrategyDecision so
// a caller grades the same way whether or not an index was in play — the count
// the player is keeping decides whether they get here or go straight to
// BasicStrategyEngineService.decidePlay(), and nothing downstream has to care.
export interface PlayDeviationDecision extends StrategyDecision {
  readonly deviationApplied: boolean;
  // The rule that fired — or, when none did, the candidate encoded for this
  // hand, so a caller can name the index the count fell short of.
  readonly matchedRule?: DeviationRule;
}

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

    // Surrender deviations are HARD-total rules ('15'/'16'). Only apply them to
    // a hard hand: a soft hand's total key collides with a hard total (soft 15
    // (A,4) → '15', soft 16 (A,5) → '16'), and surrendering a soft 15/16 — which
    // can never bust — is never correct. Gating on category keeps the overlay
    // off soft (and pair) hands whose key would otherwise match a hard rule.
    const surrenderRule =
      category === 'hard'
        ? this.findDeviationRule({
            ruleSet: input.ruleSet,
            category: 'surrender',
            playerHand,
            dealerUpcard: dealerKey,
          })
        : undefined;
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

  // The same question as resolveDeviationDecision, asked at a table instead of
  // off a chart: the hand may be three cards deep and doubling, splitting or
  // surrender may already be gone, so it wraps `decidePlay` rather than
  // `decide`. The showdown is where the count a trainee has been keeping finally
  // meets a hand, and grading that hand on basic strategy alone would mark the
  // Illustrious 18 wrong at the one table the app owns.
  //
  // The index only overrides a play the felt is actually offering. A deviation
  // calling for a double the bankroll cannot back, or a split past the box's
  // four-hand cap, is not a play the trainee declined — so the chart's own
  // answer stands and nothing is graded against a phantom action.
  resolvePlayDecision(input: PlayInput, trueCount: number): PlayDeviationDecision {
    const basic = this.basicStrategy.decidePlay(input);
    const opening = input.player.length === 2;
    const classified = classifyPlayForDeviation(input.player, opening && input.canSplit);
    if (classified === null) return { ...basic, deviationApplied: false };

    const dealerKey = normalizeUpcardKey(input.dealerUpcard);
    // Surrender deviations are hard-total rules over a first-two-card action,
    // so the overlay is gated exactly the way `decidePlay` gates the chart's own
    // SUR cells — see resolveDeviationDecision for why category matters here.
    const surrenderRule =
      classified.category === 'hard' && opening && input.canSurrender && input.options.lateSurrender
        ? this.findDeviationRule({
            ruleSet: input.ruleSet,
            category: 'surrender',
            playerHand: classified.playerHand,
            dealerUpcard: dealerKey,
          })
        : undefined;
    const surrenderPlay =
      surrenderRule && this.isDeviationThresholdMet(surrenderRule, trueCount)
        ? deviationPlay(surrenderRule, input)
        : null;
    if (surrenderRule && surrenderPlay !== null) {
      return deviated(basic, surrenderRule, surrenderPlay, trueCount);
    }

    // A surrender the chart already calls for is not downgraded to a stand or a
    // hit by a natural-category index — same precedence as the trainer's path.
    if (basic.action === 'SUR') {
      return { ...basic, deviationApplied: false, matchedRule: surrenderRule };
    }

    const rule = this.findDeviationRule({
      ruleSet: input.ruleSet,
      category: classified.category,
      playerHand: classified.playerHand,
      dealerUpcard: dealerKey,
    });
    const play =
      rule && this.isDeviationThresholdMet(rule, trueCount) ? deviationPlay(rule, input) : null;
    if (rule && play !== null) return deviated(basic, rule, play, trueCount);

    return { ...basic, deviationApplied: false, matchedRule: rule };
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

// The same classification for a hand mid-round, which may be more than two
// cards. An index is written against a total, so a three-card 16 vs 10 is the
// same chart cell as a two-card one; only the pair row needs the hand to still
// be two cards with the split on offer, mirroring how `decidePlay` takes a
// lapsed split straight to the total. Returns null when there is no cell to
// look up: a single card, or a hand already past 21.
export function classifyPlayForDeviation(
  cards: readonly Card[],
  splitOnOffer: boolean,
): {
  category: Exclude<DeviationCategory, 'surrender' | 'insurance'>;
  playerHand: DeviationHandKey;
} | null {
  if (cards.length < 2) return null;
  if (cards.length === 2 && splitOnOffer) {
    const pairKey = classifyAsPair(cards as readonly [Card, Card]);
    if (pairKey !== null) return { category: 'pair', playerHand: pairKey };
  }
  const total = handTotal(cards);
  if (total > 21) return null;
  return { category: isSoftNCardHand(cards) ? 'soft' : 'hard', playerHand: String(total) };
}

// The play a rule calls for, or null when the felt is not offering it. Insurance
// is filtered here too: it has its own overlay and its own decision point, and
// must never surface as a playing action.
function deviationPlay(rule: DeviationRule, input: PlayInput): Exclude<Action, 'INS'> | null {
  const action = rule.deviationAction;
  const opening = input.player.length === 2;
  switch (action) {
    case 'INS':
      return null;
    case 'D':
      return input.canDouble && opening ? action : null;
    case 'P':
      return input.canSplit && opening ? action : null;
    case 'SUR':
      return input.canSurrender && opening && input.options.lateSurrender ? action : null;
    default:
      return action;
  }
}

function deviated(
  basic: StrategyDecision,
  rule: DeviationRule,
  action: Exclude<Action, 'INS'>,
  trueCount: number,
): PlayDeviationDecision {
  const verb = ACTION_LABELS[action].toLowerCase();
  return {
    action,
    source: rule.category === 'surrender' ? 'surrender' : rule.category,
    handDescription: basic.handDescription,
    // The index is quoted from the rule that just fired rather than restated,
    // so a corrected chart cannot leave this sentence citing a stale number.
    reason:
      `${rule.playerHandLabel} vs dealer ${rule.dealerUpcard}: ${verb} ` +
      `${describeDeviationThreshold(rule)}, and the count is ${formatSignedCount(trueCount)}. ` +
      `Basic strategy alone would ${ACTION_LABELS[basic.action].toLowerCase()}.`,
    deviationApplied: true,
    matchedRule: rule,
  };
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
