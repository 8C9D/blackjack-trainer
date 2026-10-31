/**
 * What a hand is worth at a given true count.
 *
 * A published index is a claim about shoes: "across the shoes that show this
 * count, this play beats that one". So this tests it the same way. It deals real
 * depleted shoes, buckets them by the count a player would hold, and runs the
 * exact solver on each one. Nothing here is a linear estimate or an effect of
 * removal: every number is an average of exact hands over sampled shoes, with
 * the sampling itself seeded so a run is reproducible.
 *
 * The count is Hi-Lo, read the way this app reads it: running count over decks
 * remaining, truncated toward zero, and read at the decision. A player's count
 * already includes their own two cards and the upcard, so a hand is binned by
 * the count it would be played at rather than by the shoe it was dealt from.
 * An index measured here means what the same number means on screen.
 */
import {
  ACE,
  HandSolver,
  TEN,
  dealChance,
  handOf,
  makeShoe,
  naturalChance,
  shoeSize,
  type ActionValues,
  type Shoe,
  type TableRules,
} from './solver';

// A small, seedable generator. The app's own mulberry32 lives behind DI, and
// this file imports nothing from `src/` on purpose.
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hiLoTag(rank: number): number {
  if (rank >= 2 && rank <= 6) return 1;
  if (rank === TEN || rank === ACE) return -1;
  return 0;
}

export interface SampledShoe {
  readonly shoe: Shoe;
  readonly runningCount: number;
  readonly decksRemaining: number;
  readonly trueCount: number;
  // How many real shoes this one stands for. Buckets are capped so rare counts
  // get as many samples as common ones, which makes a sample from a common
  // bucket count for more once shoes are re-binned at the decision.
  readonly weight: number;
}

export interface SampleSpec {
  readonly decks: number;
  // How deep a sampled shoe may be dealt, in decks. The deepest bucket is the
  // cut card: nothing is decided past it at a real table.
  readonly minDealt: number;
  readonly maxDealt: number;
  readonly minCount: number;
  readonly maxCount: number;
  readonly perBucket: number;
  readonly seed: number;
  // Give up on a sparse bucket after this many shoes in total.
  readonly maxDraws: number;
}

// Shoes bucketed by true count. Each bucket stops at `perBucket`, so the common
// neutral counts do not crowd out the rare ones.
export function sampleShoes(spec: SampleSpec): Map<number, SampledShoe[]> {
  const random = seededRandom(spec.seed);
  const buckets = new Map<number, SampledShoe[]>();
  for (let tc = spec.minCount; tc <= spec.maxCount; tc++) buckets.set(tc, []);

  const deck: number[] = [];
  const full = makeShoe(spec.decks);
  for (let r = 1; r <= 10; r++) for (let i = 0; i < full[r]; i++) deck.push(r);
  const size = deck.length;
  const minCards = Math.round(spec.minDealt * 52);
  const maxCards = Math.round(spec.maxDealt * 52);

  // Every shoe seen, kept or not: a bucket's true share of the deal.
  const seen = new Map<number, number>();
  let open = buckets.size;
  for (let draw = 0; draw < spec.maxDraws && open > 0; draw++) {
    const dealt = minCards + Math.floor(random() * (maxCards - minCards + 1));
    const shoe = [...full];
    let runningCount = 0;
    for (let i = 0; i < dealt; i++) {
      const j = i + Math.floor(random() * (size - i));
      const card = deck[j];
      deck[j] = deck[i];
      deck[i] = card;
      shoe[card]--;
      runningCount += hiLoTag(card);
    }
    const decksRemaining = (size - dealt) / 52;
    const trueCount = Math.trunc(runningCount / decksRemaining) + 0;
    seen.set(trueCount, (seen.get(trueCount) ?? 0) + 1);
    const bucket = buckets.get(trueCount);
    if (bucket === undefined || bucket.length >= spec.perBucket) continue;
    bucket.push({ shoe, runningCount, decksRemaining, trueCount, weight: 1 });
    if (bucket.length === spec.perBucket) open--;
  }
  for (const [tc, bucket] of buckets) {
    const weight = (seen.get(tc) ?? 0) / Math.max(1, bucket.length);
    buckets.set(
      tc,
      bucket.map((sampled) => ({ ...sampled, weight })),
    );
  }
  return buckets;
}

// The count a player holds at the decision: the shoe's, plus the three cards on
// the table.
export function countAtDecision(sampled: SampledShoe, cards: readonly number[]): number {
  const runningCount = cards.reduce((rc, card) => rc + hiLoTag(card), sampled.runningCount);
  const decksRemaining = sampled.decksRemaining - cards.length / 52;
  return Math.trunc(runningCount / decksRemaining) + 0;
}

export interface TwoCardForm {
  readonly a: number;
  readonly b: number;
}

// The two-card hands a chart row is dealt as.
export function hardForms(total: number): readonly TwoCardForm[] {
  const forms: TwoCardForm[] = [];
  for (let a = 2; a <= 10; a++) {
    const b = total - a;
    if (b > a && b <= 10) forms.push({ a, b });
  }
  return forms;
}

export interface MeanValues {
  readonly weight: number;
  readonly stand: number;
  readonly hit: number;
  readonly double: number;
  readonly split: number | null;
}

// A row's action values at each true count it is played at, deal-weighted: a shoe
// rich in the hand's cards deals it more often, and a player meets the decision
// in proportion. Hands are binned by the count at the decision, so a shoe can
// land one bucket away from where it was sampled.
export function valuesByCount(
  shoes: readonly SampledShoe[],
  forms: readonly TwoCardForm[],
  up: number,
  rules: TableRules,
): Map<number, MeanValues> {
  const sums = new Map<
    number,
    { w: number; stand: number; hit: number; double: number; split: number; hasSplit: boolean }
  >();
  for (const sampled of shoes) {
    if (sampled.shoe[up] === 0) continue;
    const upChance = sampled.shoe[up] / shoeSize(sampled.shoe);
    const shoe = [...sampled.shoe];
    shoe[up]--;
    const solver = new HandSolver(shoe, up, rules);
    for (const { a, b } of forms) {
      const dealt = dealChance(shoe, a, b);
      if (dealt === 0) continue;
      const after = [...shoe];
      after[a]--;
      after[b]--;
      const weight = sampled.weight * upChance * dealt * (1 - naturalChance(after, up));
      const v: ActionValues = solver.values(handOf(a, b));
      const tc = countAtDecision(sampled, [a, b, up]);
      const sum = sums.get(tc) ?? { w: 0, stand: 0, hit: 0, double: 0, split: 0, hasSplit: false };
      sum.w += weight;
      sum.stand += weight * v.stand;
      sum.hit += weight * v.hit;
      sum.double += weight * v.double;
      if (v.split !== null) {
        sum.split += weight * v.split;
        sum.hasSplit = true;
      }
      sums.set(tc, sum);
    }
  }
  const out = new Map<number, MeanValues>();
  for (const [tc, sum] of sums) {
    out.set(tc, {
      weight: sum.w,
      stand: sum.stand / sum.w,
      hit: sum.hit / sum.w,
      double: sum.double / sum.w,
      split: sum.hasSplit ? sum.split / sum.w : null,
    });
  }
  return out;
}

// Insurance is a side bet on the hole card alone. Half a bet at 2:1, in units of
// the original bet, at each count an ace can be showing at.
export function insuranceByCount(shoes: readonly SampledShoe[]): Map<number, number> {
  const sums = new Map<number, { w: number; value: number }>();
  for (const sampled of shoes) {
    if (sampled.shoe[ACE] === 0) continue;
    const after = [...sampled.shoe];
    after[ACE]--;
    const p = after[TEN] / shoeSize(after);
    const weight = sampled.weight * (sampled.shoe[ACE] / shoeSize(sampled.shoe));
    const tc = countAtDecision(sampled, [ACE]);
    const sum = sums.get(tc) ?? { w: 0, value: 0 };
    sum.w += weight;
    sum.value += (weight * (3 * p - 1)) / 2;
    sums.set(tc, sum);
  }
  return new Map([...sums].map(([tc, sum]) => [tc, sum.value / sum.w]));
}
