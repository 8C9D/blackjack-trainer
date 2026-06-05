import { ALL_RANKS, ALL_SUITS, type Rank } from '../core/models/card.model';
import type { CountingSystem } from '../core/models/counting-system.model';
import { COUNTING_SYSTEMS, HI_LO, KO, OMEGA_II } from './counting-systems';

// Sum of every card in a single 52-card deck for the given system: each rank
// appears once per suit. A balanced system sums to 0; KO (unbalanced) to +4.
function fullDeckSum(system: CountingSystem): number {
  let total = 0;
  for (const rank of ALL_RANKS) {
    total += system.values[rank] * ALL_SUITS.length;
  }
  return total;
}

describe('counting systems registry', () => {
  it('registers Hi-Lo, KO, and Omega II (and nothing else), with unique ids', () => {
    const ids = COUNTING_SYSTEMS.map((s) => s.id);
    expect(ids).toEqual(['hi-lo', 'ko', 'omega-ii']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the HI_LO, KO, and OMEGA_II descriptors by reference', () => {
    expect(COUNTING_SYSTEMS).toContain(HI_LO);
    expect(COUNTING_SYSTEMS).toContain(KO);
    expect(COUNTING_SYSTEMS).toContain(OMEGA_II);
  });
});

describe('Hi-Lo descriptor (unchanged)', () => {
  it('is balanced and sums to 0 over a full deck', () => {
    expect(HI_LO.balanced).toBe(true);
    expect(fullDeckSum(HI_LO)).toBe(0);
  });

  it('keeps the canonical per-rank values (7 is neutral)', () => {
    for (const r of ['2', '3', '4', '5', '6'] as const) expect(HI_LO.values[r]).toBe(1);
    for (const r of ['7', '8', '9'] as const) expect(HI_LO.values[r]).toBe(0);
    for (const r of ['10', 'J', 'Q', 'K', 'A'] as const) expect(HI_LO.values[r]).toBe(-1);
  });
});

describe('KO (Knock-Out) descriptor', () => {
  it('is unbalanced and sums to +4 over a full deck', () => {
    expect(KO.balanced).toBe(false);
    expect(fullDeckSum(KO)).toBe(4);
  });

  it('counts 2 through 7 as +1', () => {
    for (const r of ['2', '3', '4', '5', '6', '7'] as const) expect(KO.values[r]).toBe(1);
  });

  it('counts 8 and 9 as 0', () => {
    for (const r of ['8', '9'] as const) expect(KO.values[r]).toBe(0);
  });

  it('counts 10, J, Q, K, A as -1', () => {
    for (const r of ['10', 'J', 'Q', 'K', 'A'] as const) expect(KO.values[r]).toBe(-1);
  });

  it('differs from Hi-Lo only by counting the 7 as +1', () => {
    const differingRanks = ALL_RANKS.filter((r: Rank) => KO.values[r] !== HI_LO.values[r]);
    expect(differingRanks).toEqual(['7']);
    expect(KO.values['7']).toBe(1);
    expect(HI_LO.values['7']).toBe(0);
  });
});

describe('Omega II descriptor', () => {
  it('is balanced and sums to 0 over a full deck', () => {
    expect(OMEGA_II.balanced).toBe(true);
    expect(fullDeckSum(OMEGA_II)).toBe(0);
  });

  it('counts 2, 3, 7 as +1', () => {
    for (const r of ['2', '3', '7'] as const) expect(OMEGA_II.values[r]).toBe(1);
  });

  it('counts 4, 5, 6 as +2', () => {
    for (const r of ['4', '5', '6'] as const) expect(OMEGA_II.values[r]).toBe(2);
  });

  it('counts 8 and A as 0', () => {
    for (const r of ['8', 'A'] as const) expect(OMEGA_II.values[r]).toBe(0);
  });

  it('counts 9 as -1', () => {
    expect(OMEGA_II.values['9']).toBe(-1);
  });

  it('counts 10, J, Q, K as -2', () => {
    for (const r of ['10', 'J', 'Q', 'K'] as const) expect(OMEGA_II.values[r]).toBe(-2);
  });

  it('is a level-2 system (uses ±2, unlike level-1 Hi-Lo/KO)', () => {
    const maxMagnitude = Math.max(...ALL_RANKS.map((r: Rank) => Math.abs(OMEGA_II.values[r])));
    expect(maxMagnitude).toBe(2);
  });
});
