import type { Rank } from './card.model';

// Per-rank value contribution to the running count. Hi-Lo only uses -1/0/+1;
// systems like Omega II or Wong Halves would need a wider value type, but for
// v2 we lock to this range to keep validation cheap.
export type CountValue = -1 | 0 | 1;

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
