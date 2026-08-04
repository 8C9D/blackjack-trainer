import { formatSignedCount, type DrillMode } from './card-counting.model';
import {
  ALL_RANKS,
  suitColor,
  type Card,
  type CardColor,
  type Rank,
  type Suit,
} from './card.model';

// Per-rank value contribution to the running count. Level-1 systems (Hi-Lo, KO)
// use -1/0/+1; the level-2 system Omega II also uses ±2; the fractional level-3
// system Wong Halves uses halves such as ±0.5 and ±1.5. To accommodate fractional
// values, CountValue is a plain number — correctness is guarded by each system's
// descriptor and its spec (per-rank values + balanced full-deck sum) rather than
// by a narrow type union.
export type CountValue = number;

// Per-color tags for color-dependent systems (Red Seven, KISS). When a rank
// appears here the count uses the red or black tag by the card's suit color;
// ranks absent from colorValues use the scalar `values` entry.
// INVARIANT: for every rank in colorValues, values[rank] === (red + black) / 2,
// so the balanced deck-sum check (which reads `values`) stays correct — each
// rank is two red + two black suits per deck.
export interface ColorCountValue {
  readonly red: CountValue; // hearts, diamonds
  readonly black: CountValue; // spades, clubs
}

// Published play schedule for an unbalanced system that is drilled by running
// count alone: the per-deck initial running count (IRC) the shoe starts at and
// the per-deck key count at which the player has the advantage, plus the
// deck-independent pivot and insurance trigger. Only systems whose source
// publishes such a table carry one (KO); its presence unlocks the key-count
// drill mode.
export interface KeyCountSchedule {
  // Initial running count for a fresh shoe, keyed by number of decks.
  readonly irc: Readonly<Record<number, number>>;
  // Running count at or above which the player has the advantage, keyed by
  // number of decks.
  readonly keyCount: Readonly<Record<number, number>>;
  // The count every shoe converges to once fully dealt (IRC + 4 per deck).
  readonly pivot: number;
  // Take insurance at or above this running count, regardless of decks.
  readonly insuranceCount: number;
}

// The three published correlations that say what a system is *for*. Choosing
// between 58 systems is the most consequential setting this app has, and the
// tags alone do not tell a trainee what they are trading away — these do, and
// each one lines up with a drill the app already runs.
//
// All three are correlations in [0, 1], transcribed from the same Blackjack
// Review comparison table the registry itself came from. They rank a system's
// *tags*, never a trainee: a level-3 count read wrong beats nothing, and the
// highest numbers on this table belong to counts no human can keep.
export interface SystemMetrics {
  // How closely the count tracks the shifting edge — what the bet is sized on.
  // The bet-spread drill and the showdown's bet are this number in practice.
  readonly bettingCorrelation: number;
  // How well the count indexes a playing decision, which is what a deviation
  // is. The Deviations trainer is this number in practice.
  readonly playingEfficiency: number;
  // How well the count calls the insurance bet, the one decision that is purely
  // a count of tens.
  readonly insuranceCorrelation: number;
}

// Counting system descriptor. New systems (KO, Knock-Out, etc.) can be added
// as additional entries in data/counting-systems.ts without touching the
// engine — the engine reads values purely off this object.
export interface CountingSystem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  // Required, so a system cannot be added without saying what it is good at.
  readonly metrics: SystemMetrics;
  readonly values: Readonly<Record<Rank, CountValue>>;
  // Optional per-color overrides for color-dependent systems. Omit for the
  // common case where the count depends on rank alone.
  readonly colorValues?: Readonly<Partial<Record<Rank, ColorCountValue>>>;
  readonly balanced: boolean;
  // Optional published IRC/key-count schedule (unbalanced systems only).
  readonly keyCounts?: KeyCountSchedule;
}

// A correlation as the published table writes it: two decimals, no leading
// zero. The form is the source's, and it is the right one — these are
// dimensionless figures between 0 and 1, never quantities to be summed.
export function formatCorrelation(value: number): string {
  return value.toFixed(2).replace(/^0\./, '.');
}

// The three figures as label/value pairs, in the order a trainee meets them:
// you size a bet before you play a hand, and you only decide insurance when the
// dealer shows an ace.
//
// Pairs rather than one string so a narrow screen can wrap between the figures
// and never inside one — "Insurance" on one line and "correlation .76" on the
// next reads as two different things.
export interface SystemMetricLabel {
  readonly label: string;
  readonly value: string;
}

export function metricsParts(system: CountingSystem): readonly SystemMetricLabel[] {
  const { bettingCorrelation, playingEfficiency, insuranceCorrelation } = system.metrics;
  return [
    { label: 'Betting correlation', value: formatCorrelation(bettingCorrelation) },
    { label: 'Playing efficiency', value: formatCorrelation(playingEfficiency) },
    { label: 'Insurance correlation', value: formatCorrelation(insuranceCorrelation) },
  ];
}

// Per-card count contribution, honoring any color override. Ranks without a
// colorValues entry fall back to the scalar `values` tag, so rank-only systems
// behave exactly as before.
export function cardCountValue(system: CountingSystem, card: Card): number {
  const override = system.colorValues?.[card.rank];
  return override ? override[suitColor(card.suit)] : system.values[card.rank];
}

// One column of the printed tag table: the ranks it covers, and that column's
// tag for each of the table's rows.
export interface SystemTagColumn {
  // '2–6', '7', '10–A' — the ranks that share this column's tags.
  readonly label: string;
  // One formatted tag per row of the table, in `rowLabels` order.
  readonly values: readonly string[];
}

export interface SystemTagTable {
  // 'Count' for a rank-only system; 'Red' and 'Black' for a color-dependent one.
  readonly rowLabels: readonly string[];
  readonly columns: readonly SystemTagColumn[];
}

// One suit per color, used only to ask `cardCountValue` for that color's tag.
const COLOR_SUITS: Readonly<Record<CardColor, Suit>> = { red: 'hearts', black: 'spades' };

// The system's tags as a reference table reads them.
//
// Every figure comes back through `cardCountValue`, the same accessor the
// engine counts a shoe with, so the table a trainee memorises cannot drift from
// what a miss is graded on — the principle the strategy chart is already built
// on, where each cell is the engine's own decision rather than a second copy.
//
// Adjacent ranks whose tags all agree share a column, which is how every
// published system table prints ("2–6 +1, 7–9 0, 10–A −1") and the only way
// thirteen ranks fit a phone: a level-3 system's '+1.5' cannot be read in a
// thirteenth of a 320px screen. The merge is derived, never assumed — a system
// that tagged J apart from 10 would simply print J its own column.
//
// A color-dependent system gets two rows rather than two figures crammed into
// one cell, and a rank only joins a column when it agrees on both of them.
export function tagTableFor(system: CountingSystem): SystemTagTable {
  const colors: readonly CardColor[] = system.colorValues ? ['red', 'black'] : ['black'];
  const rowLabels = system.colorValues ? ['Red', 'Black'] : ['Count'];
  const columns: SystemTagColumn[] = [];
  // The ranks in the column being built, so its label can name the run's ends.
  let run: Rank[] = [];
  let runValues: readonly string[] = [];

  const flush = (): void => {
    if (run.length === 0) return;
    const first = run[0];
    const last = run[run.length - 1];
    columns.push({ label: run.length === 1 ? first : `${first}–${last}`, values: runValues });
  };

  for (const rank of ALL_RANKS) {
    const values = colors.map((color) =>
      formatSignedCount(cardCountValue(system, { rank, suit: COLOR_SUITS[color] })),
    );
    if (run.length > 0 && values.every((value, i) => value === runValues[i])) {
      run.push(rank);
      continue;
    }
    flush();
    run = [rank];
    runValues = values;
  }
  flush();

  return { rowLabels, columns };
}

// A KeyCountSchedule resolved for one shoe size — the row the drill and its
// feedback actually consume. Mirrors the Swift ResolvedKeyCounts.
export interface ResolvedKeyCounts {
  readonly irc: number;
  readonly keyCount: number;
  readonly pivot: number;
  readonly insuranceCount: number;
}

// Whether a system can host the requested drill mode: true count — and the bet
// spread drilled on top of it — requires a balanced system, the key-count drill
// a published schedule; running count is always available. A system capability,
// so it lives here rather than in the prefs machinery that first needed it.
export function modeAllowedFor(system: CountingSystem, mode: DrillMode): boolean {
  if (mode === 'true-count' || mode === 'bet-spread') return system.balanced;
  if (mode === 'key-count') return system.keyCounts !== undefined;
  // Running count and deck speed: any system's tags can be summed.
  return true;
}

// The schedule row for a shoe size, or null when the system carries no
// schedule or the source publishes no values for that deck count. The single
// resolver shared by the engine and the drill page (as on iOS).
export function resolveKeyCounts(system: CountingSystem, decks: number): ResolvedKeyCounts | null {
  const schedule = system.keyCounts;
  const irc = schedule?.irc[decks];
  const keyCount = schedule?.keyCount[decks];
  if (!schedule || irc === undefined || keyCount === undefined) return null;
  return { irc, keyCount, pivot: schedule.pivot, insuranceCount: schedule.insuranceCount };
}
