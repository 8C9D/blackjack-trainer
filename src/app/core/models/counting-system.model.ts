import type { Rank } from './card.model';

// Per-rank value contribution to the running count. Level-1 systems (Hi-Lo, KO)
// use -1/0/+1; the level-2 system Omega II also uses ±2; the fractional level-3
// system Wong Halves uses halves such as ±0.5 and ±1.5. To accommodate fractional
// values, CountValue is a plain number — correctness is guarded by each system's
// descriptor and its spec (per-rank values + balanced full-deck sum) rather than
// by a narrow type union.
export type CountValue = number;

// Counting system descriptor. New systems (KO, Knock-Out, etc.) can be added
// as additional entries in data/counting-systems.ts without touching the
// engine — the engine reads values purely off this object.
export interface CountingSystem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly values: Readonly<Record<Rank, CountValue>>;
  readonly balanced: boolean;
}
