import { EV_BY_COUNT } from '../../data/ev-by-count.generated';
import { EV_TABLE } from '../../data/ev-table.generated';
import type { Action, EngineOptions, RuleSet } from '../models/strategy.model';
import type { ScenarioRef, WeakSpot } from './miss-tally.service';

// What a play is worth, and what a mistake costs. Grading says right or wrong; this
// says how much, because the two are nothing alike: hitting 16 v 10 instead of
// standing at a neutral count gives up half a percent of the bet, and splitting
// tens against a six gives up an eighth of it. A trainer that treats those as the
// same mistake is teaching the wrong thing to worry about.
//
// All values are hundredths of a percent of the bet, as the tables store them.

const SURRENDER_VALUE = -5000;

export interface PlayContext {
  readonly ruleSet: RuleSet;
  readonly options: EngineOptions;
  // Only where the count is part of the question. Without one, values are read
  // at a full shoe, which is what basic strategy is.
  readonly trueCount?: number;
}

function columnOf(action: Action): 'stand' | 'hit' | 'double' | 'split' | null {
  switch (action) {
    case 'S':
      return 'stand';
    case 'H':
      return 'hit';
    case 'D':
      return 'double';
    case 'P':
      return 'split';
    default:
      return null;
  }
}

// The table's row for a scenario. Two totals exist only as pairs when dealt two
// cards: a played-out hard 20 reads from the tens, and hard 4 from the twos.
function rowKey(ref: ScenarioRef): string {
  if (ref.kind === 'hard' && ref.hand === '20') return 'pair-10';
  if (ref.kind === 'hard' && ref.hand === '4') return 'pair-2';
  return `${ref.kind}-${ref.hand}`;
}

function upcardIndex(ref: ScenarioRef): number {
  return EV_TABLE.upcards.indexOf(ref.dealer);
}

function clampedCountIndex(trueCount: number): number {
  const count = Math.min(EV_BY_COUNT.maxCount, Math.max(EV_BY_COUNT.minCount, trueCount));
  return count - EV_BY_COUNT.minCount;
}

function fullShoeValue(ref: ScenarioRef, action: Action, context: PlayContext): number | null {
  if (action === 'SUR') return SURRENDER_VALUE;
  const column = columnOf(action);
  if (column === null) return null;
  const rules = EV_TABLE.rules[context.ruleSet];
  const table =
    column === 'split' && !context.options.doubleAfterSplit ? rules.splitNoDas : rules[column];
  return table[rowKey(ref)]?.[upcardIndex(ref)] ?? null;
}

// The value of a play on a hand, at the count when that hand has an index and at
// a full shoe when it does not: away from a published index the count does not
// change the answer, and the full-shoe gap is the right size of the mistake.
export function playValue(ref: ScenarioRef, action: Action, context: PlayContext): number | null {
  if (action === 'SUR') return SURRENDER_VALUE;
  const column = columnOf(action);
  if (context.trueCount !== undefined && column !== null) {
    const key = `${ref.kind}-${ref.hand}-v-${ref.dealer}`;
    const cell = EV_BY_COUNT.cells[context.ruleSet][key];
    const values = cell?.[column];
    if (values) return values[clampedCountIndex(context.trueCount)];
  }
  return fullShoeValue(ref, action, context);
}

function insuranceValue(trueCount: number | undefined): number {
  return trueCount === undefined
    ? EV_TABLE.insurance
    : EV_BY_COUNT.insurance[clampedCountIndex(trueCount)];
}

// What `played` gave up against `correct`, or null when the table has no value
// for one of them. Never negative: at a count right on an index the two plays
// are within sampling noise of each other, and that reads as a close call rather
// than as a mistake that made money.
export function costOfPlay(
  ref: ScenarioRef,
  played: Action,
  correct: Action,
  context: PlayContext,
): number | null {
  if (played === correct) return 0;
  // Insurance is a side bet, so its cost is its own value rather than a gap
  // between two plays of the hand.
  if (played === 'INS') return Math.max(0, -insuranceValue(context.trueCount));
  if (correct === 'INS') return Math.max(0, insuranceValue(context.trueCount));
  const playedValue = playValue(ref, played, context);
  const correctValue = playValue(ref, correct, context);
  if (playedValue === null || correctValue === null) return null;
  return Math.max(0, correctValue - playedValue);
}

// The actions that could have been taken on a dealt hand.
function offeredPlays(ref: ScenarioRef, options: EngineOptions): readonly Action[] {
  const plays: Action[] = ['H', 'S'];
  // Hard 20 reaches a tally only as a played-out hand, past doubling.
  if (!(ref.kind === 'hard' && ref.hand === '20')) plays.push('D');
  if (ref.kind === 'pair') plays.push('P');
  if (options.lateSurrender) plays.push('SUR');
  return plays;
}

// What the nearest wrong answer gives up: the best play against the next best. A
// tally knows that a hand was missed and not how, so this is the floor of what
// each miss cost, and a figure built on it is a figure that can only understate.
export function cheapestMiss(ref: ScenarioRef, context: PlayContext): number | null {
  // With an ace up at a count where insurance pays, insurance is the question
  // being asked, so the bet is what a miss there gave up, whatever the hand.
  if (ref.dealer === 'A' && context.trueCount !== undefined) {
    const insurance = insuranceValue(context.trueCount);
    if (insurance > 0) return insurance;
  }
  const values = offeredPlays(ref, context.options)
    .map((play) => playValue(ref, play, context))
    .filter((value): value is number => value !== null)
    .sort((a, b) => b - a);
  return values.length < 2 ? null : values[0] - values[1];
}

// How often a scenario comes up at a table, as a share of hands.
export function tableFrequency(ref: ScenarioRef): number {
  const perMillion = EV_TABLE.frequency[rowKey(ref)]?.[upcardIndex(ref)] ?? 0;
  return perMillion / 1_000_000;
}

// What a set of misses would cost per hand at a real table: for each hand, how
// often it is dealt, how often it is being missed, and what a miss gives up.
//
// The drills deal hands nothing like as a table does, and over-deal the ones
// being missed, so a drill's own accuracy says little about a table. This reads
// each hand's miss rate and weighs it by the table's frequency instead. One more
// attempt than happened keeps a single miss from reading as a hundred percent.
export function tableLeak(spots: readonly WeakSpot[]): number {
  return spots.reduce((leak, spot) => {
    const missRate = spot.misses / (spot.attempts + 1);
    return leak + tableFrequency(spot.ref) * missRate * (spot.costPerMiss ?? 0);
  }, 0);
}

export function houseEdge(ruleSet: RuleSet, options: EngineOptions): number {
  const edges = EV_TABLE.houseEdge[ruleSet][options.doubleAfterSplit ? 'das' : 'noDas'];
  return options.lateSurrender ? edges.surrender : edges.noSurrender;
}

// "3.4%", "12%", "under 0.1%": one decimal where it is the size of the thing, and
// never a precision the figure does not have.
export function formatBetShare(units: number): string {
  if (units < 10) return 'under 0.1%';
  // Rounded here rather than by `toFixed`, which breaks an exact tie differently
  // from every Swift formatter: 0.25 would read 0.3% on one platform and 0.2% on
  // the other.
  const tenths = Math.round(units / 10);
  if (tenths >= 100) return `${Math.round(units / 100)}%`;
  return `${(tenths / 10).toFixed(1)}%`;
}

// Below this a mistake is a coin flip the chart happened to call, which is worth
// saying: a trainee should spend their attention elsewhere.
const CLOSE_CALL = 50;

// The sentence a miss earns.
export function costSentence(units: number): string {
  const share = formatBetShare(units);
  if (units < CLOSE_CALL) return `A close call: that play gives up ${share} of your bet.`;
  return `That play gives up ${share} of your bet.`;
}
