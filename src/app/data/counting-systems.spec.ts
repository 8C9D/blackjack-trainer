import { ALL_RANKS, ALL_SUITS, type Rank } from '../core/models/card.model';
import type { CountingSystem } from '../core/models/counting-system.model';
import { COUNTING_SYSTEMS } from './counting-systems';

// Sum of every card in a single 52-card deck for the given system: each rank
// appears once per suit. A balanced system sums to 0; KO (unbalanced) to +4.
// Identical to reference-systems.md's "Deck Sum" column, so it doubles as the
// balance gate. Reads `values`, which for color systems holds the (red+black)/2
// average — keeping this correct (each rank is two red + two black per deck).
function fullDeckSum(system: CountingSystem): number {
  let total = 0;
  for (const rank of ALL_RANKS) {
    total += system.values[rank] * ALL_SUITS.length;
  }
  return total;
}

// Expand a reference-systems.md row — given in card order A 2 3 4 5 6 7 8 9 10,
// where the single "10" column applies to every ten-value rank — into a
// rank-keyed values map. Transcribing each row this way (ten numbers, in the
// reference's order) keeps EXPECTED independent of the descriptors in
// counting-systems.ts, so a typo on either side fails the golden test below.
function row(
  a: number,
  two: number,
  three: number,
  four: number,
  five: number,
  six: number,
  seven: number,
  eight: number,
  nine: number,
  ten: number,
): Record<Rank, number> {
  return {
    '2': two,
    '3': three,
    '4': four,
    '5': five,
    '6': six,
    '7': seven,
    '8': eight,
    '9': nine,
    '10': ten,
    J: ten,
    Q: ten,
    K: ten,
    A: a,
  };
}

interface ExpectedSystem {
  values: Record<Rank, number>;
  colorValues?: Partial<Record<Rank, { red: number; black: number }>>;
  deckSum: number; // reference-systems.md "Deck Sum" column
}

// Golden table transcribed independently from
// .claude/skills/add-counting-systems/reference-systems.md. `values` holds each
// per-rank tag (for color systems, the (red+black)/2 average the reference
// shows); `colorValues` carries the true per-color split. CAC2 (no data), the
// computer-only / inverted novelty counts, and systems whose real per-card rule
// could not be reconciled (Red Zen, KISS 1) are intentionally absent.
const EXPECTED: Record<string, ExpectedSystem> = {
  // Original four (unchanged).
  'hi-lo': { deckSum: 0, values: row(-1, 1, 1, 1, 1, 1, 0, 0, 0, -1) },
  ko: { deckSum: 4, values: row(-1, 1, 1, 1, 1, 1, 1, 0, 0, -1) },
  'omega-ii': { deckSum: 0, values: row(0, 1, 1, 2, 2, 2, 1, 0, -1, -2) },
  'wong-halves': { deckSum: 0, values: row(-1, 0.5, 1, 1, 1.5, 1, 0.5, 0, -0.5, -1) },
  // Standard batch.
  'ace-mt': { deckSum: -20, values: row(-1, 0, 0, 0, 0, 0, 0, 0, 0, -1) },
  awk: { deckSum: 0, values: row(-2, 1, 1, 1, 2, 1, 0, 0, 0, -1) },
  ambition: { deckSum: 0, values: row(-1, 1, 1, 1, 1, 1, 0.5, 0, -0.5, -1) },
  'ambition-u': { deckSum: 2, values: row(-0.5, 1, 1, 1, 1, 1, 0, 0, 0, -1) },
  andersen: { deckSum: 0, values: row(-2, 1, 1, 1, 2, 1, 1, 0, -1, -1) },
  archer: { deckSum: 4, values: row(1, 1, 1, 1, 1, 1, 1, 1, 1, -2) },
  'brh-0': { deckSum: 4, values: row(-2, 2, 2, 2, 2, 2, 1, 0, 0, -2) },
  'brh-i': { deckSum: 4, values: row(-2, 1, 2, 2, 3, 2, 1, 0, 0, -2) },
  'brh-ii': { deckSum: 4, values: row(0, 1, 1, 2, 2, 2, 1, 0, 0, -2) },
  bushido: { deckSum: 8, values: row(-1, 2, 2, 2, 2, 2, 1, 0, 0, -2) },
  'canfield-expert': { deckSum: 0, values: row(0, 0, 1, 1, 1, 1, 1, 0, -1, -1) },
  'ck-precision': { deckSum: 0, values: row(-1, 1, 2, 2, 2, 2, 1, 0, -1, -2) },
  'c-r': { deckSum: 0, values: row(-1, 0.5, 1, 1, 1, 1, 0.5, 0, 0, -1) },
  dhm: { deckSum: 0, values: row(0, 1, 1, 1, 1, 0, 0, 0, 0, -1) },
  dmpro: { deckSum: 0, values: row(-2, 1, 2, 2, 3, 2, 1, 0, -1, -2) },
  'ebj-ii': { deckSum: 0, values: row(-2, 2, 2, 2, 2, 2, 1, 0, -1, -2) },
  'ebj-ii-u': { deckSum: 4, values: row(-2, 2, 2, 2, 2, 2, 1, 0, 0, -2) },
  'ebj-iii': { deckSum: 0, values: row(-2, 1, 2, 2, 3, 2, 1, 0, -1, -2) },
  'ebj-iii-u': { deckSum: 4, values: row(-2, 2, 2, 2, 3, 2, 1, 0, -1, -2) },
  'graham-2': { deckSum: 0, values: row(-2, 1, 1, 1, 1, 1, 1, 0, 0, -1) },
  griffin: { deckSum: 0, values: row(0, 0, 0, 1, 1, 1, 1, 0, 0, -1) },
  'griffin-3': { deckSum: 0, values: row(0, 1, 2, 2, 3, 2, 2, 1, -1, -3) },
  'griffin-4': { deckSum: 0, values: row(0, 1, 2, 3, 4, 3, 3, 1, -1, -4) },
  'griffin-5': { deckSum: 0, values: row(0, 2, 2, 4, 5, 4, 3, 1, -1, -5) },
  'hi-opt-i': { deckSum: 0, values: row(0, 0, 1, 1, 1, 1, 0, 0, 0, -1) },
  'hi-opt-ii': { deckSum: 0, values: row(0, 1, 1, 2, 2, 1, 1, 0, 0, -2) },
  hnf: { deckSum: 4, values: row(1, 1, 1, 2, 2, 1, 1, 0, 0, -2) },
  'j-noir': { deckSum: -8, values: row(-2, 1, 1, 1, 1, 1, 1, 1, 1, -2) },
  lima: { deckSum: 16, values: row(-1, 0, 1, 1, 1, 1, 1, 0, 0, 0) },
  mentor: { deckSum: 0, values: row(-1, 1, 2, 2, 2, 2, 1, 0, -1, -2) },
  'olsen-trucount': { deckSum: 8, values: row(-1, 1, 1, 1, 2, 1, 0.5, 0, 0.5, -1) },
  'revere-five-count': { deckSum: 4, values: row(0, 0, 0, 0, 1, 0, 0, 0, 0, 0) },
  'revere-plus-minus': { deckSum: 0, values: row(0, 1, 1, 1, 1, 1, 0, 0, -1, -1) },
  'revere-point-count': { deckSum: 0, values: row(-2, 1, 2, 2, 2, 2, 1, 0, 0, -2) },
  'silver-fox': { deckSum: 0, values: row(-1, 1, 1, 1, 1, 1, 1, 0, -1, -1) },
  't-hop-1': { deckSum: 4, values: row(0, 0, 1, 1, 1, 1, 1, 0, 0, -1) },
  't-hop-2': { deckSum: 4, values: row(0, 1, 1, 2, 2, 2, 1, 0, 0, -2) },
  'tri-level': { deckSum: 0, values: row(-2, 1, 1, 1, 2, 1, 1, 0, -1, -1) },
  'ubz-ii': { deckSum: 4, values: row(-1, 1, 2, 2, 2, 2, 1, 0, 0, -2) },
  'uston-ace-five': { deckSum: 0, values: row(-1, 0, 0, 0, 1, 0, 0, 0, 0, 0) },
  'uston-adv-plus-minus': { deckSum: 0, values: row(-1, 0, 1, 1, 1, 1, 1, 0, 0, -1) },
  'uston-apc': { deckSum: 0, values: row(0, 1, 2, 2, 3, 2, 2, 1, -1, -3) },
  'uston-ss': { deckSum: 4, values: row(-2, 2, 2, 2, 3, 2, 1, 0, -1, -2) },
  'victor-apc': { deckSum: 0, values: row(0, 2, 2, 2, 3, 2, 2, 0, -1, -3) },
  zen: { deckSum: 0, values: row(-1, 1, 1, 2, 2, 2, 1, 0, 0, -2) },
};

describe('counting systems registry (data-driven golden)', () => {
  it('registry ids exactly match the expected set, all unique', () => {
    const ids = COUNTING_SYSTEMS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice().sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it('every system matches its golden tags, deck sum, and balance flag', () => {
    for (const s of COUNTING_SYSTEMS) {
      const exp = EXPECTED[s.id];
      expect(exp, `no golden entry for ${s.id}`).toBeDefined();
      for (const r of ALL_RANKS) {
        expect(s.values[r], `${s.id} ${r}`).toBe(exp.values[r]);
      }
      expect(fullDeckSum(s), `${s.id} deck sum`).toBe(exp.deckSum);
      expect(s.balanced, `${s.id} balanced`).toBe(exp.deckSum === 0);
    }
  });

  it('color systems honor their overrides and the (red+black)/2 invariant', () => {
    for (const s of COUNTING_SYSTEMS) {
      const exp = EXPECTED[s.id];
      if (!exp.colorValues) {
        expect(s.colorValues ?? {}, `${s.id} should have no colorValues`).toEqual({});
        continue;
      }
      expect(s.colorValues, `${s.id} colorValues`).toEqual(exp.colorValues);
      for (const [r, cv] of Object.entries(exp.colorValues)) {
        expect(s.values[r as Rank], `${s.id} ${r} average`).toBe((cv.red + cv.black) / 2);
      }
    }
  });

  it('every descriptor is well-formed (non-empty id/name/description, numeric full rank map)', () => {
    for (const s of COUNTING_SYSTEMS) {
      expect(s.id.length, 'id').toBeGreaterThan(0);
      expect(s.name.length, `${s.id} name`).toBeGreaterThan(0);
      expect(s.description.length, `${s.id} description`).toBeGreaterThan(0);
      for (const r of ALL_RANKS) {
        expect(typeof s.values[r], `${s.id} ${r} type`).toBe('number');
      }
    }
  });
});
