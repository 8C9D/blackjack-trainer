import type { Rank } from './card.model';

// Per-rank value contribution to the running count. Level-1 systems (Hi-Lo, KO)
// only use -1/0/+1; level-2 systems like Omega II also use ±2. The union is kept
// to integer levels so validation stays cheap; a fractional system (Wong Halves)
// would need a further widening.
export type CountValue = -2 | -1 | 0 | 1 | 2;

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
