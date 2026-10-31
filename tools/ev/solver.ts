/**
 * A combinatorial analyser for blackjack: expected values from the rules of the
 * game, with no chart anywhere in its inputs.
 *
 * The charts in `src/app/data/` are transcriptions, and `chart-values.golden.spec.ts`
 * only stops them changing. This is the check they never had: an independent
 * derivation of what each hand is worth under each play, computed from a shoe, so
 * a chart cell can be compared against arithmetic rather than against itself.
 * It deliberately imports nothing from `src/` for that reason. A bug shared with
 * the engines could not be caught by it.
 *
 * Exactness. Stand, hit and double are exact for the shoe given: the recursion
 * walks every player composition, draws without replacement, and conditions every
 * card on the dealer not holding a natural (the peek), including the player's own
 * draws. Splits are exact for one split without re-splitting; with re-splits the
 * cards drawn to sibling hands are not removed from the shoe, the standard
 * approximation, which moves a split's value by well under a tenth of a percent.
 *
 * All values are in units of the original bet, conditional on the dealer having
 * no natural, which is the moment a player actually decides.
 */

// Ranks are indexed 1..10: ace, 2..9, then every ten-value card as one rank.
export const ACE = 1;
export const TEN = 10;
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type Shoe = readonly number[]; // length 11; index 0 unused

export interface TableRules {
  // Dealer hits soft 17.
  readonly h17: boolean;
  readonly das: boolean;
  // Hands a box may be split into. The app's tables cap it at four.
  readonly maxHands: number;
  // A split ace takes one card and stands, and aces do not re-split.
  readonly blackjackPays: number;
}

export const H17_DAS: TableRules = { h17: true, das: true, maxHands: 4, blackjackPays: 1.5 };

export function makeShoe(decks: number): number[] {
  const shoe = new Array<number>(11).fill(0);
  for (const r of RANKS) shoe[r] = (r === TEN ? 16 : 4) * decks;
  return shoe;
}

export function shoeSize(shoe: Shoe): number {
  let n = 0;
  for (const r of RANKS) n += shoe[r];
  return n;
}

// ─── hand arithmetic ─────────────────────────────────────────────────────────

// A hand or a removal as a single number: five bits a rank. Fifty bits fits a
// double exactly, and no composition holds 32 of one rank.
const SHIFT = RANKS.map((r) => 32 ** (r - 1));
function keyAdd(key: number, rank: number): number {
  return key + SHIFT[rank - 1];
}

interface HandTotal {
  readonly total: number; // best total; a hand over 21 reads over 21
  readonly soft: boolean;
}

function totalOf(hard: number, aces: number): HandTotal {
  if (aces > 0 && hard + 10 <= 21) return { total: hard + 10, soft: true };
  return { total: hard, soft: false };
}

// ─── the dealer ──────────────────────────────────────────────────────────────

// Every way the dealer can finish from an upcard, collapsed to multisets. The
// tree of ordered draws is walked once per upcard and rule; a multiset's weight
// is how many of those orders reach it. A distribution for any shoe is then one
// product per multiset, which is what makes the player recursion affordable.
interface Terminal {
  readonly ranks: readonly number[]; // ranks present
  readonly counts: readonly number[]; // how many of each
  readonly drawn: number;
  readonly outcome: number; // index into DEALER_OUTCOMES
  readonly weight: number;
}

// Final totals 17..21 are indices 0..4; bust is 5.
const BUST = 5;

function buildTerminals(up: number, h17: boolean): readonly Terminal[] {
  const merged = new Map<number, { counts: number[]; outcome: number; weight: number }>();
  const counts = new Array<number>(11).fill(0);

  const walk = (hard: number, aces: number, drawn: number, key: number): void => {
    const { total, soft } = totalOf(hard, aces);
    const stands = total > 17 || (total === 17 && !(soft && h17));
    if (total > 21 || stands) {
      const entry = merged.get(key);
      if (entry) entry.weight += 1;
      else
        merged.set(key, {
          counts: [...counts],
          outcome: total > 21 ? BUST : total - 17,
          weight: 1,
        });
      return;
    }
    for (const r of RANKS) {
      // The peek: a hole card completing a natural never reaches this tree.
      if (drawn === 0 && ((up === ACE && r === TEN) || (up === TEN && r === ACE))) continue;
      counts[r]++;
      walk(hard + r, aces + (r === ACE ? 1 : 0), drawn + 1, keyAdd(key, r));
      counts[r]--;
    }
  };
  walk(up, up === ACE ? 1 : 0, 0, 0);

  const out: Terminal[] = [];
  for (const { counts: c, outcome, weight } of merged.values()) {
    const ranks = RANKS.filter((r) => c[r] > 0);
    out.push({
      ranks,
      counts: ranks.map((r) => c[r]),
      drawn: ranks.reduce((sum, r) => sum + c[r], 0),
      outcome,
      weight,
    });
  }
  return out;
}

const terminalCache = new Map<string, readonly Terminal[]>();
function terminalsFor(up: number, h17: boolean): readonly Terminal[] {
  const key = `${up}:${h17}`;
  let t = terminalCache.get(key);
  if (!t) {
    t = buildTerminals(up, h17);
    terminalCache.set(key, t);
  }
  return t;
}

// n × (n-1) × … × (n-k+1), the number of ordered ways to draw k cards from n.
function falling(n: number, k: number): number {
  let out = 1;
  for (let i = 0; i < k; i++) out *= n - i;
  return out;
}

// The dealer's final distribution from `shoe` (upcard already removed), given no
// natural. Six entries: 17, 18, 19, 20, 21, bust.
export function dealerDistribution(shoe: Shoe, up: number, h17: boolean): Float64Array {
  const dist = new Float64Array(6);
  const size = shoeSize(shoe);
  for (const t of terminalsFor(up, h17)) {
    // A draw longer than the shoe cannot happen, and would divide nothing by nothing.
    if (t.drawn > size) continue;
    let p = t.weight;
    for (let i = 0; i < t.ranks.length; i++) p *= falling(shoe[t.ranks[i]], t.counts[i]);
    dist[t.outcome] += p / falling(size, t.drawn);
  }
  const noNatural = 1 - naturalChance(shoe, up);
  for (let i = 0; i < 6; i++) dist[i] /= noNatural;
  return dist;
}

// What insurance is worth at a full shoe with an ace up: half a bet at 2:1 on the
// hole card being a ten, in units of the original bet.
export function insuranceValue(decks: number): number {
  const shoe = makeShoe(decks);
  shoe[ACE]--;
  return (3 * naturalChance(shoe, ACE) - 1) / 2;
}

// The chance the hole card completes a natural.
export function naturalChance(shoe: Shoe, up: number): number {
  const size = shoeSize(shoe);
  if (up === ACE) return shoe[TEN] / size;
  if (up === TEN) return shoe[ACE] / size;
  return 0;
}

// The next card's distribution, given the dealer's hole card is not the one that
// would have made a natural. The player's draw and the hole card come from the
// same unseen cards, so knowing the hole is not a ten leaves slightly fewer tens
// out of the hole and slightly more in the shoe.
function nextCardChances(shoe: Shoe, up: number): Float64Array {
  const size = shoeSize(shoe);
  const chances = new Float64Array(11);
  const blocked = up === ACE ? TEN : up === TEN ? ACE : 0;
  const noNatural = blocked === 0 ? 1 : 1 - shoe[blocked] / size;
  for (const r of RANKS) {
    const p = shoe[r] / size;
    if (blocked === 0 || size < 2) {
      chances[r] = p;
      continue;
    }
    const holeOk = 1 - (shoe[blocked] - (r === blocked ? 1 : 0)) / (size - 1);
    chances[r] = (p * holeOk) / noNatural;
  }
  return chances;
}

// ─── the player ──────────────────────────────────────────────────────────────

// A hand in play: its running hard sum and ace count, and its composition.
interface PlayerHand {
  readonly hard: number;
  readonly aces: number;
  readonly cards: number;
  readonly key: number; // the composition, the memo key
}

const EMPTY_HAND: PlayerHand = { hard: 0, aces: 0, cards: 0, key: 0 };

function addCard(hand: PlayerHand, rank: number): PlayerHand {
  return {
    hard: hand.hard + rank,
    aces: hand.aces + (rank === ACE ? 1 : 0),
    cards: hand.cards + 1,
    key: keyAdd(hand.key, rank),
  };
}

export function handOf(...ranks: readonly number[]): PlayerHand {
  return ranks.reduce(addCard, EMPTY_HAND);
}

export interface ActionValues {
  readonly stand: number;
  readonly hit: number;
  readonly double: number;
  // Null off a pair.
  readonly split: number | null;
}

// One shoe, one upcard: every value is a function of the composition held, so
// the recursion memoises on it. A solver instance is cheap to throw away, and a
// depleted shoe gets its own.
export class HandSolver {
  // Dealer distributions by total removal, shared by everything derived from
  // this base shoe: a split hand's removal differs from its composition.
  private readonly dealerMemo = new Map<number, Float64Array>();

  constructor(
    // The shoe with the upcard already out.
    private readonly shoe: Shoe,
    private readonly up: number,
    private readonly rules: TableRules,
  ) {}

  private dealerAfter(shoe: Shoe, removalKey: number): Float64Array {
    let dist = this.dealerMemo.get(removalKey);
    if (!dist) {
      dist = dealerDistribution(shoe, this.up, this.rules.h17);
      this.dealerMemo.set(removalKey, dist);
    }
    return dist;
  }

  private scoped(extraKey: number): Scope {
    return new Scope(this, extraKey);
  }

  values(hand: PlayerHand): ActionValues {
    const scope = this.scoped(0);
    const shoe = removeHand(this.shoe, hand);
    const split = pairRank(hand);
    return {
      stand: scope.stand(hand, shoe),
      hit: scope.hit(hand, shoe),
      double: scope.double(hand, shoe),
      split: split === null ? null : this.split(split),
    };
  }

  // A split, re-splitting to the table's cap.
  //
  // Each completed hand's value is exact for the cards known to be gone: the pair
  // cards the split has used. By symmetry every hand is worth the same in
  // expectation, so the only question is how many hands there will be. That is a
  // small walk over (hands made, one-card hands waiting), with `pairCards` the
  // cards of the rank now out of the shoe.
  split(rank: number): number {
    const { maxHands } = this.rules;
    const memo = new Map<string, number>();

    const walk = (hands: number, waiting: number): number => {
      if (waiting === 0) return 0;
      const key = `${hands}:${waiting}`;
      const seen = memo.get(key);
      if (seen !== undefined) return seen;
      const { pairChance, withPair, withoutPair } = this.splitDraw(rank, hands);
      const canResplit = rank !== ACE && hands < maxHands;
      const resolved = (1 - pairChance) * (withoutPair + walk(hands, waiting - 1));
      // Paired again, the hand can still be played as the pair it is: a re-split
      // is an option, and an option cannot lower a value.
      const played = withPair + walk(hands, waiting - 1);
      const another =
        pairChance * (canResplit ? Math.max(walk(hands + 1, waiting + 1), played) : played);
      const value = resolved + another;
      memo.set(key, value);
      return value;
    };
    return walk(2, 2);
  }

  // What a one-card hand of `rank` draws into when `pairCards` of the rank are
  // out: the chance of pairing it again, and the hand's value either way.
  private readonly splitMemo = new Map<string, SplitDraw>();
  private splitDraw(rank: number, pairCards: number): SplitDraw {
    const key = `${rank}:${pairCards}`;
    const cached = this.splitMemo.get(key);
    if (cached) return cached;

    // Everything but the one card this hand holds comes out of the base shoe, so
    // the hand's own recursion removes that card itself.
    const extra = [...this.shoe];
    extra[rank] -= pairCards - 1;
    let extraKey = 0;
    for (let i = 0; i < pairCards - 1; i++) extraKey = keyAdd(extraKey, rank);
    const scope = this.scoped(extraKey);

    const base = handOf(rank);
    const shoe = removeHand(extra, base);
    const chances = nextCardChances(shoe, this.up);

    let withoutPair = 0;
    let missTotal = 0;
    let withPair = 0;
    for (const r of RANKS) {
      if (chances[r] === 0) continue;
      const hand = addCard(base, r);
      const after = removeHand(extra, hand);
      let value: number;
      if (rank === ACE) {
        // A split ace takes its one card and stands; 21 here is not a natural.
        value = scope.stand(hand, after);
      } else {
        const stand = scope.stand(hand, after);
        const hit = scope.hit(hand, after);
        const double = this.rules.das ? scope.double(hand, after) : -Infinity;
        value = Math.max(stand, hit, double);
      }
      if (r === rank) {
        withPair = value;
      } else {
        withoutPair += chances[r] * value;
        missTotal += chances[r];
      }
    }
    const pairChance = chances[rank];
    const draw = {
      pairChance,
      withPair,
      withoutPair: missTotal > 0 ? withoutPair / missTotal : 0,
    };
    this.splitMemo.set(key, draw);
    return draw;
  }

  // Exposed to Scope, which is the recursion proper.
  dealerFor(removalKey: number, shoe: Shoe): Float64Array {
    return this.dealerAfter(shoe, removalKey);
  }
  chancesFor(shoe: Shoe): Float64Array {
    return nextCardChances(shoe, this.up);
  }
  memoFor(extraKey: number): { stand: Map<number, number>; hit: Map<number, number> } {
    let m = this.scopedMemos.get(extraKey);
    if (!m) {
      m = { stand: new Map(), hit: new Map() };
      this.scopedMemos.set(extraKey, m);
    }
    return m;
  }
  private readonly scopedMemos = new Map<
    number,
    { stand: Map<number, number>; hit: Map<number, number> }
  >();
}

interface SplitDraw {
  readonly pairChance: number;
  readonly withPair: number;
  readonly withoutPair: number;
}

// The recursion over one base shoe. A split works over the base shoe minus the
// pair cards already used, and a hand's value depends on both that and its
// composition, so each such shoe is a scope with memos of its own, while the
// dealer memo below it is shared across them all.
class Scope {
  private readonly memo: { stand: Map<number, number>; hit: Map<number, number> };

  constructor(
    private readonly solver: HandSolver,
    private readonly extraKey: number,
  ) {
    this.memo = solver.memoFor(extraKey);
  }

  // `shoe` is always this scope's base shoe minus the hand; callers have it to
  // hand already.
  stand(hand: PlayerHand, shoe: Shoe): number {
    const { total } = totalOf(hand.hard, hand.aces);
    if (total > 21) return -1;
    const memoKey = hand.key;
    const seen = this.memo.stand.get(memoKey);
    if (seen !== undefined) return seen;
    const dist = this.solver.dealerFor(hand.key + this.extraKey, shoe);
    let value = dist[BUST];
    for (let i = 0; i < 5; i++) {
      const dealer = 17 + i;
      if (total > dealer) value += dist[i];
      else if (total < dealer) value -= dist[i];
    }
    this.memo.stand.set(memoKey, value);
    return value;
  }

  // Hitting and then playing on as well as the cards allow.
  hit(hand: PlayerHand, shoe: Shoe): number {
    const seen = this.memo.hit.get(hand.key);
    if (seen !== undefined) return seen;
    const chances = this.solver.chancesFor(shoe);
    let value = 0;
    const next = [...shoe];
    for (const r of RANKS) {
      if (chances[r] === 0) continue;
      const grown = addCard(hand, r);
      if (totalOf(grown.hard, grown.aces).total > 21) {
        value -= chances[r];
        continue;
      }
      next[r]--;
      const standing = this.stand(grown, next);
      const hitting = this.hit(grown, next);
      next[r]++;
      value += chances[r] * Math.max(standing, hitting);
    }
    this.memo.hit.set(hand.key, value);
    return value;
  }

  double(hand: PlayerHand, shoe: Shoe): number {
    const chances = this.solver.chancesFor(shoe);
    let value = 0;
    const next = [...shoe];
    for (const r of RANKS) {
      if (chances[r] === 0) continue;
      next[r]--;
      value += chances[r] * this.stand(addCard(hand, r), next);
      next[r]++;
    }
    return 2 * value;
  }
}

function removeHand(shoe: Shoe, hand: PlayerHand): number[] {
  const out = [...shoe];
  let key = hand.key;
  for (const r of RANKS) {
    const count = key % 32;
    out[r] -= count;
    key = (key - count) / 32;
  }
  return out;
}

function pairRank(hand: PlayerHand): number | null {
  if (hand.cards !== 2) return null;
  const rank = hand.aces === 2 ? ACE : hand.aces === 0 && hand.hard % 2 === 0 ? hand.hard / 2 : 0;
  if (rank < 1 || rank > 10) return null;
  return hand.key === 2 * SHIFT[rank - 1] ? rank : null;
}

// ─── a whole table ───────────────────────────────────────────────────────────

export type ChartRow =
  | { readonly kind: 'hard'; readonly total: number }
  | { readonly kind: 'soft'; readonly total: number }
  | { readonly kind: 'pair'; readonly rank: number };

export interface RowValues extends ActionValues {
  // How often this row is dealt against this upcard, as a share of all deals
  // (upcard included).
  readonly frequency: number;
}

// How often two specific ranks are dealt from `shoe`, order ignored.
export function dealChance(shoe: Shoe, a: number, b: number): number {
  const size = shoeSize(shoe);
  if (a === b) return (shoe[a] * (shoe[a] - 1)) / (size * (size - 1));
  return (2 * shoe[a] * shoe[b]) / (size * (size - 1));
}

interface TwoCards {
  readonly a: number;
  readonly b: number;
  readonly row: ChartRow | null; // null: a natural
}

// Every distinct two-card deal, sorted into the chart row it reads at.
export function twoCardHands(): readonly TwoCards[] {
  const hands: TwoCards[] = [];
  for (let a = 1; a <= 10; a++) {
    for (let b = a; b <= 10; b++) {
      if (a === ACE && b === TEN) {
        hands.push({ a, b, row: null });
      } else if (a === b) {
        hands.push({ a, b, row: { kind: 'pair', rank: a } });
      } else if (a === ACE) {
        hands.push({ a, b, row: { kind: 'soft', total: 11 + b } });
      } else {
        hands.push({ a, b, row: { kind: 'hard', total: a + b } });
      }
    }
  }
  return hands;
}

export function rowKey(row: ChartRow): string {
  return row.kind === 'pair' ? `pair-${row.rank}` : `${row.kind}-${row.total}`;
}

export interface TableSolution {
  // rows.get(`hard-16`)[10] is hard 16 against a ten.
  readonly rows: ReadonlyMap<string, Record<number, RowValues>>;
  // Per-hand expectation with no surrender, in units of the bet.
  readonly expectation: number;
  // The same with late surrender taken wherever it beats the best play.
  readonly expectationWithSurrender: number;
}

// Solve a full shoe: every row against every upcard, as a deal-weighted average
// of the two-card hands that read at that row, plus the game's overall value.
export function solveTable(decks: number, rules: TableRules): TableSolution {
  const full = makeShoe(decks);
  const rows = new Map<string, Record<number, RowValues>>();
  let expectation = 0;
  let expectationWithSurrender = 0;

  for (const up of RANKS) {
    const shoe = [...full];
    const upChance = shoe[up] / shoeSize(shoe);
    shoe[up]--;
    const solver = new HandSolver(shoe, up, rules);

    // Accumulate per row, then divide by the row's weight.
    const sums = new Map<
      string,
      { w: number; s: number; h: number; d: number; p: number | null }
    >();

    for (const { a, b, row } of twoCardHands()) {
      const dealt = dealChance(shoe, a, b);
      if (dealt === 0) continue;
      const afterHand = [...shoe];
      afterHand[a]--;
      afterHand[b]--;
      const dealerNatural = naturalChance(afterHand, up);

      if (row === null) {
        // A natural pays unless the dealer has one too, in which case it pushes.
        const value = (1 - dealerNatural) * rules.blackjackPays;
        expectation += upChance * dealt * value;
        expectationWithSurrender += upChance * dealt * value;
        continue;
      }

      const v = solver.values(handOf(a, b));
      const best = Math.max(v.stand, v.hit, v.double, v.split ?? -Infinity);
      const atPlay = (1 - dealerNatural) * best - dealerNatural;
      const atPlaySurrender = (1 - dealerNatural) * Math.max(best, -0.5) - dealerNatural;
      expectation += upChance * dealt * atPlay;
      expectationWithSurrender += upChance * dealt * atPlaySurrender;

      // Weight by the chance of reaching the decision, not merely of the deal:
      // with an ace or ten up the hands that survive the peek are not quite the
      // hands dealt, since each removes different cards from the hole.
      const key = rowKey(row);
      const weight = dealt * (1 - dealerNatural);
      const sum = sums.get(key) ?? { w: 0, s: 0, h: 0, d: 0, p: v.split === null ? null : 0 };
      sum.w += weight;
      sum.s += weight * v.stand;
      sum.h += weight * v.hit;
      sum.d += weight * v.double;
      if (v.split !== null) sum.p = (sum.p ?? 0) + weight * v.split;
      sums.set(key, sum);
    }

    for (const [key, sum] of sums) {
      const row = rows.get(key) ?? ({} as Record<number, RowValues>);
      row[up] = {
        stand: sum.s / sum.w,
        hit: sum.h / sum.w,
        double: sum.d / sum.w,
        split: sum.p === null ? null : sum.p / sum.w,
        frequency: upChance * sum.w,
      };
      rows.set(key, row);
    }
  }
  return { rows, expectation, expectationWithSurrender };
}
