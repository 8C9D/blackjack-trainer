import { Injectable, inject } from '@angular/core';

import { isAce } from '../models/card.model';
import type {
  DeviationDecision,
  DeviationScenario,
  DeviationTrainerResult,
} from '../models/deviation.model';
import {
  ACTION_LABELS,
  type Action,
  type EngineOptions,
  type RuleSet,
} from '../models/strategy.model';
import { BasicStrategyEngineService, type EngineInput } from './basic-strategy-engine.service';
import { DeviationEngineService } from './deviation-engine.service';

// Formats a true count for display: positive values get a '+' prefix, zero
// and negatives are returned as their plain string. Exported so the trainer
// page can render the same label format above the table.
export function formatTrueCount(tc: number): string {
  return tc > 0 ? `+${tc}` : String(tc);
}

// Builds the trainer-result for a single deviation scenario. Orchestrates
// basic-strategy resolution, the playing-decision deviation overlay, and
// the insurance overlay (dealer-Ace only). The page consumes the result
// directly; the deviation feedback panel renders it.
@Injectable({ providedIn: 'root' })
export class DeviationEvaluatorService {
  private readonly basicStrategy = inject(BasicStrategyEngineService);
  private readonly deviationEngine = inject(DeviationEngineService);

  evaluate(
    scenario: DeviationScenario,
    userAction: Action,
    ruleSet: RuleSet,
    options: EngineOptions,
  ): DeviationTrainerResult {
    const engineInput: EngineInput = {
      player: scenario.player,
      dealerUpcard: scenario.dealerUpcard,
      ruleSet,
      options,
    };
    const playing = this.deviationEngine.resolveDeviationDecision(engineInput, scenario.trueCount);
    const handDescription = this.basicStrategy.decide(engineInput).handDescription;
    const dealerAce = isAce(scenario.dealerUpcard);
    // Only consult the insurance overlay when the dealer shows an Ace. For
    // non-Ace upcards there is no insurance offer.
    const insurance: DeviationDecision | null = dealerAce
      ? this.deviationEngine.resolveInsuranceDecision(scenario.trueCount, ruleSet)
      : null;
    const isDeviationCandidate = scenario.generatedAsDeviationCandidate === true;

    if (insurance && insurance.deviationApplied) {
      // Insurance is offered before the playing decision and dominates when
      // the threshold is met. Expected action is INS regardless of the hand.
      const matchedRule = insurance.matchedRule;
      const expectedAction: Action = 'INS';
      const correct = userAction === expectedAction;
      const insuranceExplanation = `Take insurance: dealer shows an Ace and the true count is ${formatTrueCount(scenario.trueCount)} (≥ +3 makes insurance +EV).`;
      return {
        userAction,
        expectedAction,
        basicAction: playing.basicAction,
        trueCount: scenario.trueCount,
        handDescription,
        deviationApplied: true,
        matchedRule,
        source: 'insurance',
        correct,
        isDeviationCandidate,
        explanation: correct
          ? insuranceExplanation
          : `${insuranceExplanation} You picked ${ACTION_LABELS[userAction]}.`,
      };
    }

    const expectedAction = playing.finalAction;
    const correct = userAction === expectedAction;
    return {
      userAction,
      expectedAction,
      basicAction: playing.basicAction,
      trueCount: scenario.trueCount,
      handDescription,
      deviationApplied: playing.deviationApplied,
      matchedRule: playing.matchedRule,
      source: 'playing',
      correct,
      isDeviationCandidate,
      explanation: explainPlaying({
        dealerAce,
        userAction,
        playing,
        trueCount: scenario.trueCount,
      }),
    };
  }
}

// ─── internal helpers (exported for tests) ─────────────────────────────

export function explainPlaying(args: {
  dealerAce: boolean;
  userAction: Action;
  playing: DeviationDecision;
  trueCount: number;
}): string {
  const { dealerAce, userAction, playing, trueCount } = args;
  const tcLabel = formatTrueCount(trueCount);

  // Distinguish a misplaced Insurance click — the user reached for INS but
  // the insurance overlay didn't fire (either dealer isn't showing an Ace, or
  // dealer Ace but TC below +3).
  if (userAction === 'INS') {
    if (!dealerAce) {
      return `Insurance is only offered when the dealer shows an Ace. Play the hand: ${ACTION_LABELS[playing.finalAction]}.`;
    }
    return `Decline insurance — true count ${tcLabel} is below the +3 threshold. Play the hand: ${ACTION_LABELS[playing.finalAction]}.`;
  }

  if (playing.deviationApplied && playing.matchedRule) {
    return `Hi-Lo deviation: ${playing.matchedRule.source}. At TC ${tcLabel}, play ${ACTION_LABELS[playing.finalAction]} instead of basic ${ACTION_LABELS[playing.basicAction]}.`;
  }

  if (playing.matchedRule) {
    // Rule exists but threshold not met — surface it as a learning hint.
    return `No deviation at TC ${tcLabel}; basic strategy plays ${ACTION_LABELS[playing.finalAction]}. (A deviation for this hand exists but only fires at a different count.)`;
  }

  return `No deviation for this hand; basic strategy plays ${ACTION_LABELS[playing.finalAction]}.`;
}
