import { suitColor, type Card, type Rank } from './card.model';

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

// Counting system descriptor. New systems (KO, Knock-Out, etc.) can be added
// as additional entries in data/counting-systems.ts without touching the
// engine — the engine reads values purely off this object.
export interface CountingSystem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly values: Readonly<Record<Rank, CountValue>>;
  // Optional per-color overrides for color-dependent systems. Omit for the
  // common case where the count depends on rank alone.
  readonly colorValues?: Readonly<Partial<Record<Rank, ColorCountValue>>>;
  readonly balanced: boolean;
}

// Per-card count contribution, honoring any color override. Ranks without a
// colorValues entry fall back to the scalar `values` tag, so rank-only systems
// behave exactly as before.
export function cardCountValue(system: CountingSystem, card: Card): number {
  const override = system.colorValues?.[card.rank];
  return override ? override[suitColor(card.suit)] : system.values[card.rank];
}
