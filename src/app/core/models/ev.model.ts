import type { RuleSet } from './strategy.model';

// The shape of the two generated value tables. Both come out of `tools/ev/`, which
// derives them from the rules of the game and imports nothing from the charts.
//
// Every value is in hundredths of a percent of the bet (-5404 is -54.04%), given
// the dealer has no natural, which is the moment a player decides.

export type EvColumn = Readonly<Record<string, readonly number[]>>;

// One column of rows per play. Rows are keyed `hard-16`, `soft-18`, `pair-A`, and
// each row has one value per entry of `upcards`.
export interface EvRuleTable {
  readonly stand: EvColumn;
  readonly hit: EvColumn;
  readonly double: EvColumn;
  readonly split: EvColumn;
  readonly splitNoDas: EvColumn;
}

export interface EvEdges {
  readonly surrender: number;
  readonly noSurrender: number;
}

// A full shoe: what every chart cell is worth at a neutral count.
export interface EvTable {
  readonly decks: number;
  readonly upcards: readonly string[];
  // Half a bet at 2:1 on the hole card, with an ace up.
  readonly insurance: number;
  readonly houseEdge: Readonly<Record<RuleSet, { readonly das: EvEdges; readonly noDas: EvEdges }>>;
  // How often each row is dealt against each upcard, per million hands.
  readonly frequency: EvColumn;
  readonly rules: Readonly<Record<RuleSet, EvRuleTable>>;
}

// One indexed hand at each true count from `minCount` to `maxCount`, read at the
// decision. Columns are keyed `stand`, `hit`, `double`, and `split` on a pair.
export type EvCountCell = Readonly<Record<string, readonly number[]>>;

// Sampled depleted shoes: what the hands with a published index are worth at the
// counts that decide them.
export interface EvByCount {
  readonly decks: number;
  readonly minCount: number;
  readonly maxCount: number;
  readonly insurance: readonly number[];
  // Keyed `hard-16-v-10`, the same spelling as `scenarioKey`.
  readonly cells: Readonly<Record<RuleSet, Readonly<Record<string, EvCountCell>>>>;
}
