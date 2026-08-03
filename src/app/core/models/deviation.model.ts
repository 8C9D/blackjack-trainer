import { formatSignedCount } from './card-counting.model';
import type { Scenario } from './card.model';
import type { CountingSystem } from './counting-system.model';
import type { Action, DealerUpcard, RuleSet } from './strategy.model';

// The counting system every index in this app is written for. BJA publishes
// the Illustrious 18 and Fab 4 as Hi-Lo true counts, and a different system
// reads a different number off the same shoe — so the same index is a
// different decision. An index shown without naming its system is a trap, and
// a trainee counting something else has to be told the numbers are not theirs.
export const DEVIATION_INDEX_SYSTEM_ID = 'hi-lo';
export const DEVIATION_INDEX_SYSTEM_NAME = 'Hi-Lo';

// The advisory for a trainee whose counting system is not the one the indices
// are written for, or null when it is. Unbalanced systems get the stronger
// wording because they have no true count at all to compare against.
export function deviationIndexNote(system: CountingSystem): string | null {
  if (system.id === DEVIATION_INDEX_SYSTEM_ID) return null;
  const lead = `These indices are ${DEVIATION_INDEX_SYSTEM_NAME} true counts, and you count ${system.name}`;
  return system.balanced
    ? `${lead}, which reads a different true count off the same shoe. Its own indices are not these numbers.`
    : `${lead}, which is unbalanced and has no true count. These numbers do not carry over to it.`;
}

// How a deviation rule compares its index against the current true count.
//
//   at-or-above — TC >= index  (typical "stand at +3" style entry)
//   at-or-below — TC <= index  (typical "hit at -1" style entry)
//   positive    — TC > 0       (chart says e.g. "0+" exclusive of 0)
//   negative    — TC < 0       (chart says e.g. "0-" exclusive of 0)
//
// 'positive' and 'negative' ignore the `index` field; encode those entries
// explicitly with direction rather than overloading at-or-above/below with
// boundary trickery so the engine can be kept simple and unambiguous.
export type DeviationDirection = 'at-or-above' | 'at-or-below' | 'positive' | 'negative';

// Bucket a rule belongs to. The engine derives the category for a given hand
// from the same pair/soft/hard classifier the basic strategy engine uses;
// surrender and insurance are overlays that can match independently of
// hard/soft/pair lookup (surrender lives over a hard hand; insurance has no
// player hand at all).
export type DeviationCategory = 'hard' | 'soft' | 'pair' | 'surrender' | 'insurance';

// String key identifying a hand within its category. Conventions:
//   hard       — stringified total: '12', '15', '16'
//   soft       — stringified total: '18', '19'         (i.e. A,7 → '18')
//   pair       — rank string:       '10', 'A', '8'
//   surrender  — stringified total: '14', '15'         (hard total of hand)
//   insurance  — fixed:             'insurance'
export type DeviationHandKey = string;

export interface DeviationRule {
  readonly ruleSet: RuleSet;
  readonly category: DeviationCategory;
  // Stable lookup key — see DeviationHandKey for conventions.
  readonly playerHand: DeviationHandKey;
  // Human-readable label for UIs / explanations, e.g. 'Hard 16' or 'Pair of 10s'.
  readonly playerHandLabel: string;
  readonly dealerUpcard: DealerUpcard;
  // True-count threshold compared against using `direction`. For 'positive'
  // and 'negative' this is unused at lookup time; keep 0 by convention.
  readonly index: number;
  readonly direction: DeviationDirection;
  // Chart's pre-deviation play. Informational only — the engine's reported
  // basic action is always recomputed live from BasicStrategyEngineService so
  // EngineOptions (DAS / late surrender) are honored.
  readonly basicAction: Action;
  readonly deviationAction: Action;
  // Source citation (e.g. "BJA S17 Deviations chart, Illustrious 18 #5").
  readonly source: string;
}

// A rule's threshold as a clause inside a sentence ("stand at true count 0 or
// higher"). The chart page renders the same thresholds as symbols (`≥ +3`),
// which is right for a table column and wrong mid-sentence — two renderings of
// one field, deliberately, rather than one that reads badly in both places.
export function describeDeviationThreshold(rule: DeviationRule): string {
  switch (rule.direction) {
    case 'at-or-above':
      return `at true count ${formatSignedCount(rule.index)} or higher`;
    case 'at-or-below':
      return `at true count ${formatSignedCount(rule.index)} or lower`;
    case 'positive':
      return 'at any positive true count';
    case 'negative':
      return 'at any negative true count';
  }
}

export interface DeviationDecision {
  readonly basicAction: Action;
  readonly finalAction: Action;
  readonly deviationApplied: boolean;
  readonly matchedRule?: DeviationRule;
  readonly trueCount: number;
}

// A trainer scenario for the Deviations page — Scenario plus the practice
// true count and a flag indicating whether the scenario was deliberately
// generated to match an encoded deviation rule.
export interface DeviationScenario extends Scenario {
  readonly trueCount: number;
  readonly generatedAsDeviationCandidate?: boolean;
}

// Whether a deviation trainer evaluation came from the insurance overlay or
// the playing-decision path.
export type DeviationEvalSource = 'insurance' | 'playing';

// Result returned by the Deviations trainer after evaluating a single hand.
// Consumed by the feedback panel.
export interface DeviationTrainerResult {
  readonly userAction: Action;
  readonly expectedAction: Action;
  readonly basicAction: Action;
  readonly trueCount: number;
  readonly handDescription: string;
  readonly deviationApplied: boolean;
  readonly matchedRule?: DeviationRule;
  readonly source: DeviationEvalSource;
  readonly correct: boolean;
  readonly explanation: string;
  // True when this hand was generated to match an encoded deviation rule
  // (deviation-only practice mode). The panel renders a small badge in
  // that case so the user knows the hand was chosen as a deviation drill.
  readonly isDeviationCandidate?: boolean;
}
