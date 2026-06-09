// Player actions surfaced in the UI. The engine never recommends INS; it is
// only included so the UI can pass an Insurance click through evaluate().
export type Action = 'H' | 'S' | 'D' | 'P' | 'SUR' | 'INS';

export const ACTION_LABELS: Record<Action, string> = {
  H: 'Hit',
  S: 'Stand',
  D: 'Double',
  P: 'Split',
  SUR: 'Surrender',
  INS: 'Insurance',
};

export type RuleSet = 'H17' | 'S17';

export interface EngineOptions {
  doubleAfterSplit: boolean;
  lateSurrender: boolean;
}

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  doubleAfterSplit: false,
  lateSurrender: false,
};

// Dealer upcard keys for the chart tables. Face cards normalize to '10'
// before lookup.
export type DealerUpcard = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'A';

// Chart cell symbols.
//   H, S, D     — hit / stand / double
//   Ds          — double if allowed, else stand (collapses to Double in this
//                 trainer since we only deal with initial 2-card hands).
//                 Only appears in the soft chart.
//   Y, N, YN    — split / do not split / split only if Double After Split
//   SUR_H/S/Y   — surrender if Late Surrender enabled, else hit / stand /
//                 split. The SUR_* variants are an internal encoding for
//                 cells where BJA's published charts embed a "no-surrender"
//                 fallback (e.g., H17 8,8 vs A is SUR/Y).
export type HardCell = 'H' | 'S' | 'D' | 'SUR_H' | 'SUR_S';
export type SoftCell = 'H' | 'S' | 'D' | 'Ds';
export type PairCell = 'Y' | 'N' | 'YN' | 'SUR_Y';
export type ChartCell = HardCell | SoftCell | PairCell;

export type HardRow = Record<DealerUpcard, HardCell>;
export type SoftRow = Record<DealerUpcard, SoftCell>;
export type PairRow = Record<DealerUpcard, PairCell>;

// Hard totals 5..20 reachable from initial two-card hands. Hard 4 (from 2,2
// falling through pair lookup) is clamped to 5 at lookup time — they play
// identically (always hit).
export type HardKey = 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;

// Soft totals are keyed on the non-ace card's value (A,2 → key 2, etc.).
// Key 10 (soft 21 / blackjack) is handled in the engine without a chart row.
export type SoftKey = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type PairKey = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'A';

export interface StrategyChart {
  readonly ruleSet: RuleSet;
  readonly hard: Readonly<Record<HardKey, HardRow>>;
  readonly soft: Readonly<Record<SoftKey, SoftRow>>;
  readonly pair: Readonly<Record<PairKey, PairRow>>;
}

export type DecisionSource = 'insurance' | 'surrender' | 'pair' | 'soft' | 'hard';

export interface StrategyDecision {
  readonly action: Exclude<Action, 'INS'>;
  readonly source: DecisionSource;
  readonly handDescription: string;
  readonly reason: string;
}

export interface EvaluationResult extends StrategyDecision {
  readonly userAction: Action;
  readonly correct: boolean;
}
