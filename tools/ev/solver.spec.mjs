import { describe, expect, it } from 'vitest';

import { countAtDecision, insuranceByCount, sampleShoes, seededRandom } from './count-sampler';
import {
  ACE,
  HandSolver,
  TEN,
  dealChance,
  dealerDistribution,
  handOf,
  makeShoe,
  naturalChance,
  shoeSize,
  solveTable,
} from './solver';

/**
 * The solver is the check the charts are held to, so it needs anchors that owe
 * nothing to the charts. Three kinds, from outside in: figures published by
 * others, a brute-force enumeration that shares no code with it, and the
 * internal identities any correct analyser has to satisfy.
 */

const S17_DAS = { h17: false, das: true, maxHands: 4, blackjackPays: 1.5 };

const PERCENT = 100;

describe('published anchors', () => {
  // The textbook infinite-deck dealer table. A two-thousand-deck shoe removes
  // the composition effect to well inside these tolerances.
  const hugeShoe = (up) => {
    const shoe = makeShoe(2000);
    shoe[up]--;
    return shoe;
  };

  it.each([
    [2, 35.36],
    [3, 37.39],
    [4, 39.45],
    [5, 41.64],
    [6, 42.32],
    [7, 26.23],
    [8, 24.47],
    [9, 22.84],
  ])('an S17 dealer showing %i busts %f%% of the time', (up, published) => {
    const bust = dealerDistribution(hugeShoe(up), up, false)[5];
    expect(bust * PERCENT).toBeCloseTo(published, 1);
  });

  it('hitting soft 17 moves only the upcards that can reach it', () => {
    const s17 = dealerDistribution(hugeShoe(7), 7, false);
    const h17 = dealerDistribution(hugeShoe(7), 7, true);
    // 7 + ace is soft 18, and no draw from a 7 passes through soft 17.
    expect(Array.from(h17)).toEqual(Array.from(s17));
    const up6s17 = dealerDistribution(hugeShoe(6), 6, false);
    const up6h17 = dealerDistribution(hugeShoe(6), 6, true);
    expect(up6h17[5]).toBeGreaterThan(up6s17[5]);
  });

  // The six-deck edges are pinned by `ev-table.spec.ts` against the table CI
  // regenerates: a full solve takes minutes under coverage. One deck solves the
  // same code, and the game is famously close to even there.
  it('solves a whole table to a near-even single-deck game', () => {
    const { expectation, expectationWithSurrender } = solveTable(1, S17_DAS);
    expect(Math.abs(expectation) * PERCENT).toBeLessThan(0.3);
    expect(expectationWithSurrender).toBeGreaterThan(expectation);
  }, 120_000);
});

// A small shoe played out by exhaustive enumeration, sharing nothing with the
// solver but the arithmetic of a hand: every ordering of the unseen cards, with
// the dealer's rule applied literally.
function handTotal(cards) {
  const hard = cards.reduce((sum, card) => sum + card, 0);
  return cards.includes(ACE) && hard + 10 <= 21 ? hard + 10 : hard;
}

function isSoft(cards) {
  const hard = cards.reduce((sum, card) => sum + card, 0);
  return cards.includes(ACE) && hard + 10 <= 21;
}

function dealerPlays(cards, h17, next) {
  const hand = [...cards];
  for (;;) {
    const total = handTotal(hand);
    const hits = total < 17 || (h17 && total === 17 && isSoft(hand));
    if (!hits) return hand;
    hand.push(next());
  }
}

function settle(player, dealer) {
  const p = handTotal(player);
  const d = handTotal(dealer);
  if (p > 21) return -1;
  if (d > 21 || p > d) return 1;
  return p < d ? -1 : 0;
}

// Every ordering of `cards`, visited as a list.
function permutations(cards, visit) {
  const walk = (prefix, rest) => {
    if (rest.length === 0) {
      visit(prefix);
      return;
    }
    for (let i = 0; i < rest.length; i++) {
      walk([...prefix, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)]);
    }
  };
  walk([], cards);
}

function expand(shoe) {
  const cards = [];
  for (let r = 1; r <= 10; r++) for (let i = 0; i < shoe[r]; i++) cards.push(r);
  return cards;
}

// The value of a fixed plan: `draws` cards to the player, then stand. The first
// unseen card is the hole card, as it is at a table, conditioned on no natural.
function bruteForce(shoe, player, up, h17, draws, stake = 1) {
  let sum = 0;
  let count = 0;
  permutations(expand(shoe), (order) => {
    const [hole, ...rest] = order;
    if ((up === ACE && hole === TEN) || (up === TEN && hole === ACE)) return;
    let i = 0;
    const next = () => rest[i++];
    const hand = [...player];
    for (let d = 0; d < draws; d++) hand.push(next());
    const dealer = handTotal(hand) > 21 ? [up, hole] : dealerPlays([up, hole], h17, next);
    sum += stake * settle(hand, dealer);
    count++;
  });
  return sum / count;
}

describe('exact against brute force', () => {
  // Eight unseen cards is 40,320 orderings, and enough for a dealer to need
  // several draws and for a hit to be a real decision.
  const unseen = () => {
    const shoe = new Array(11).fill(0);
    shoe[ACE] = 1;
    shoe[2] = 1;
    shoe[3] = 1;
    shoe[5] = 1;
    shoe[6] = 1;
    shoe[7] = 1;
    shoe[TEN] = 2;
    return shoe;
  };

  it.each([
    ['hard 16 v 10', [TEN, 6], TEN, false],
    ['hard 12 v 2 under H17', [TEN, 2], 2, true],
    ['soft 17 v 9', [ACE, 6], 9, false],
  ])(
    'stand and double on %s',
    (_label, player, up, h17) => {
      const shoe = unseen();
      const base = [...shoe];
      for (const card of player) base[card] += 1;
      base[up] += 1;
      const opening = [...base];
      opening[up]--;
      const solver = new HandSolver(opening, up, { ...S17_DAS, h17 });
      const values = solver.values(handOf(...player));
      expect(values.stand).toBeCloseTo(bruteForce(shoe, player, up, h17, 0), 9);
      expect(values.double).toBeCloseTo(bruteForce(shoe, player, up, h17, 1, 2), 9);
    },
    60_000,
  );

  it('a hit takes the better of standing and drawing on', () => {
    // Hard 17 from a thin shoe: hitting once then standing is one line through
    // the tree, so optimal play must be worth at least that.
    const shoe = unseen();
    const player = [TEN, 7];
    const up = 9;
    const base = [...shoe];
    base[TEN] += 1;
    base[7] += 1;
    const solver = new HandSolver(base, up, S17_DAS);
    const values = solver.values(handOf(...player));
    const oneCard = bruteForce(shoe, player, up, false, 1);
    expect(values.hit).toBeGreaterThanOrEqual(oneCard - 1e-9);
  }, 60_000);
});

describe('identities', () => {
  it('a dealer distribution is a distribution', () => {
    const shoe = makeShoe(6);
    for (let up = 1; up <= 10; up++) {
      const s = [...shoe];
      s[up]--;
      for (const h17 of [false, true]) {
        const total = dealerDistribution(s, up, h17).reduce((sum, p) => sum + p, 0);
        expect(total).toBeCloseTo(1, 12);
      }
    }
  });

  it('a natural is only possible behind an ace or a ten', () => {
    const shoe = makeShoe(6);
    expect(naturalChance(shoe, ACE)).toBeCloseTo(96 / 312, 12);
    expect(naturalChance(shoe, TEN)).toBeCloseTo(24 / 312, 12);
    expect(naturalChance(shoe, 7)).toBe(0);
  });

  it('every two-card deal sums to certainty', () => {
    const shoe = makeShoe(6);
    let total = 0;
    for (let a = 1; a <= 10; a++) for (let b = a; b <= 10; b++) total += dealChance(shoe, a, b);
    expect(total).toBeCloseTo(1, 12);
    expect(shoeSize(shoe)).toBe(312);
  });

  it('a split with no re-split is exactly two hands', () => {
    const shoe = makeShoe(6);
    shoe[7]--;
    const twoHands = new HandSolver(shoe, 7, { ...S17_DAS, maxHands: 2 }).split(8);
    const fourHands = new HandSolver(shoe, 7, S17_DAS).split(8);
    expect(twoHands).toBeGreaterThan(0);
    // Re-splitting 8s against a 7 is a good bet, so the option adds value.
    expect(fourHands).toBeGreaterThan(twoHands);
  });

  it('split aces take one card and may not re-split', () => {
    const shoe = makeShoe(6);
    shoe[6]--;
    const twoHands = new HandSolver(shoe, 6, { ...S17_DAS, maxHands: 2 }).split(ACE);
    const fourHands = new HandSolver(shoe, 6, S17_DAS).split(ACE);
    expect(fourHands).toBe(twoHands);
  });

  it('doubling after a split is an option, so it can only add', () => {
    const shoe = makeShoe(6);
    shoe[5]--;
    const noDas = new HandSolver(shoe, 5, { ...S17_DAS, das: false }).split(4);
    const das = new HandSolver(shoe, 5, S17_DAS).split(4);
    expect(das).toBeGreaterThan(noDas);
  });

  it('a hand can never be worth less than losing it', () => {
    const shoe = makeShoe(6);
    shoe[10]--;
    const v = new HandSolver(shoe, 10, S17_DAS).values(handOf(10, 6));
    expect(v.stand).toBeGreaterThanOrEqual(-1);
    expect(v.hit).toBeGreaterThanOrEqual(-1);
    expect(v.double).toBeGreaterThanOrEqual(-2);
    expect(v.split).toBeNull();
  });
});

describe('sampled shoes', () => {
  const spec = {
    decks: 6,
    minDealt: 0.5,
    maxDealt: 4.5,
    minCount: -2,
    maxCount: 3,
    perBucket: 40,
    seed: 7,
    maxDraws: 100_000,
  };

  it('are reproducible from the seed', () => {
    const a = sampleShoes(spec);
    const b = sampleShoes(spec);
    expect(a.get(2)?.[0]).toEqual(b.get(2)?.[0]);
    const random = seededRandom(1);
    expect(random()).not.toBe(random());
  });

  it('land in the bucket their own count truncates to', () => {
    for (const [tc, shoes] of sampleShoes(spec)) {
      expect(shoes.length).toBe(spec.perBucket);
      for (const shoe of shoes) {
        expect(Math.trunc(shoe.runningCount / shoe.decksRemaining) + 0).toBe(tc);
        expect(shoeSize(shoe.shoe)).toBe(Math.round(shoe.decksRemaining * 52));
      }
    }
  });

  it('price insurance at its known break-even of a third tens', () => {
    const buckets = sampleShoes({ ...spec, minCount: 0, maxCount: 6, perBucket: 200 });
    const value = insuranceByCount([...buckets.values()].flat());
    expect(value.get(0)).toBeLessThan(0);
    expect(value.get(6)).toBeGreaterThan(0);
  });

  it('read the count at the decision, with the table cards in it', () => {
    const sampled = { runningCount: 6, decksRemaining: 3 };
    expect(countAtDecision(sampled, [])).toBe(2);
    // Two tens and a six out of 2.94 decks: the same shoe, a lower count.
    expect(countAtDecision(sampled, [TEN, TEN, 6])).toBe(1);
  });

  it('weigh a capped bucket by how much of the deal it stands for', () => {
    const buckets = sampleShoes({ ...spec, perBucket: 10 });
    const neutral = buckets.get(0)[0].weight;
    const rare = buckets.get(3)[0].weight;
    expect(neutral).toBeGreaterThan(rare);
  });
});
