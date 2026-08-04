import { TestBed } from '@angular/core/testing';

import type { Card, Rank, Suit } from '../models/card.model';
import { localDateKey } from './practice-history.service';
import {
  CLEAR_STREAK,
  MISSED_COUNT_MEMORY,
  MISS_TALLY_KEY,
  MissTallyService,
  missedCountsLabel,
  scenarioKey,
  scenarioLabel,
  scenarioRefFor,
  type ScenarioRef,
} from './miss-tally.service';

const card = (rank: Rank, suit: Suit = 'spades'): Card => ({ rank, suit });

// Anchored to the real "today" (not a fixed literal) because the service
// prunes its 7-day window at load time using the real wall clock, before a
// test's setNowSource can take effect. A fixed past date would drift out of
// that window and fail the reload test once the real date advanced 7+ days.
const BASE = (() => {
  const d = new Date();
  d.setHours(18, 0, 0, 0);
  return d;
})();

const HARD_16_V_10: ScenarioRef = { kind: 'hard', hand: '16', dealer: '10' };
const SOFT_18_V_9: ScenarioRef = { kind: 'soft', hand: '18', dealer: '9' };
const PAIR_8S_V_10: ScenarioRef = { kind: 'pair', hand: '8', dealer: '10' };

function createService(now: () => Date): MissTallyService {
  const service = TestBed.inject(MissTallyService);
  service.setNowSource(now);
  return service;
}

describe('MissTallyService', () => {
  let current: Date;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    current = new Date(BASE);
  });

  describe('scenarioRefFor', () => {
    it('classifies hard totals with a normalized dealer key', () => {
      expect(scenarioRefFor([card('K'), card('6')], card('Q'))).toEqual(HARD_16_V_10);
    });

    it('classifies soft hands by total', () => {
      expect(scenarioRefFor([card('A'), card('7')], card('9'))).toEqual(SOFT_18_V_9);
    });

    it('classifies pairs by rank key, including ten-values and aces', () => {
      expect(scenarioRefFor([card('8'), card('8', 'hearts')], card('10'))).toEqual({
        kind: 'pair',
        hand: '8',
        dealer: '10',
      });
      expect(scenarioRefFor([card('K'), card('10', 'hearts')], card('A'))).toEqual({
        kind: 'pair',
        hand: '10',
        dealer: 'A',
      });
      expect(scenarioRefFor([card('A'), card('A', 'hearts')], card('6'))).toEqual({
        kind: 'pair',
        hand: 'A',
        dealer: '6',
      });
    });
  });

  describe('scenarioKey / scenarioLabel', () => {
    it('builds stable keys', () => {
      expect(scenarioKey(HARD_16_V_10)).toBe('hard-16-v-10');
      expect(scenarioKey({ kind: 'pair', hand: 'A', dealer: 'A' })).toBe('pair-A-v-A');
    });

    it('formats chart-style labels', () => {
      expect(scenarioLabel(HARD_16_V_10)).toBe('16 vs 10');
      expect(scenarioLabel(SOFT_18_V_9)).toBe('A,7 vs 9');
      expect(scenarioLabel({ kind: 'pair', hand: '8', dealer: '10' })).toBe('8,8 vs 10');
    });
  });

  describe('record / weakSpotFor', () => {
    it('returns null when nothing has been missed', () => {
      const s = createService(() => current);
      expect(s.weakSpotFor('basic-strategy')).toBeNull();
      s.record('basic-strategy', HARD_16_V_10, true);
      expect(s.weakSpotFor('basic-strategy')).toBeNull();
    });

    it('accumulates attempts and misses for a scenario', () => {
      const s = createService(() => current);
      // Ends on a single correct answer, short of the clear streak that
      // would retire this scenario from the weak list.
      for (const correct of [false, true, false, true, true, false, true]) {
        s.record('basic-strategy', HARD_16_V_10, correct);
      }
      const weak = s.weakSpotFor('basic-strategy');
      expect(weak).toEqual({
        ref: HARD_16_V_10,
        label: '16 vs 10',
        misses: 3,
        attempts: 7,
        streak: 1,
        // Basic strategy has no count in its question, so nothing is remembered.
        missedCounts: [],
      });
    });

    // In the Deviations trainer the count is half the question, so the miss
    // remembers it: the scenario has to come back as the question that beat
    // the trainee, not as the same hand at a count they already had right.
    describe('the count a scenario was missed at', () => {
      it('remembers a miss, newest first, and ignores correct answers', () => {
        const s = createService(() => current);
        s.record('deviations', HARD_16_V_10, false, 2);
        s.record('deviations', HARD_16_V_10, true, -4);
        s.record('deviations', HARD_16_V_10, false, -1);
        expect(s.weakSpotFor('deviations')!.missedCounts).toEqual([-1, 2]);
      });

      it('promotes a repeated count rather than storing it twice', () => {
        const s = createService(() => current);
        s.record('deviations', HARD_16_V_10, false, 2);
        s.record('deviations', HARD_16_V_10, false, 5);
        s.record('deviations', HARD_16_V_10, false, 2);
        expect(s.weakSpotFor('deviations')!.missedCounts).toEqual([2, 5]);
      });

      it('keeps only the most recent few, so a bad week cannot grow the store', () => {
        const s = createService(() => current);
        for (let count = 1; count <= MISSED_COUNT_MEMORY + 3; count++) {
          s.record('deviations', HARD_16_V_10, false, count);
        }
        const counts = s.weakSpotFor('deviations')!.missedCounts;
        expect(counts.length).toBe(MISSED_COUNT_MEMORY);
        expect(counts[0]).toBe(MISSED_COUNT_MEMORY + 3);
      });

      it('ignores a count that is not a plausible true count', () => {
        const s = createService(() => current);
        s.record('deviations', HARD_16_V_10, false, 2.5);
        s.record('deviations', HARD_16_V_10, false, 5000);
        expect(s.weakSpotFor('deviations')!.missedCounts).toEqual([]);
      });

      it('survives a reload, and tolerates a payload written without them', () => {
        const s = createService(() => current);
        s.record('deviations', HARD_16_V_10, false, 3);
        expect(createService(() => current).weakSpotFor('deviations')!.missedCounts).toEqual([3]);

        localStorage.setItem(
          MISS_TALLY_KEY,
          JSON.stringify({
            deviations: {
              [scenarioKey(HARD_16_V_10)]: {
                ref: HARD_16_V_10,
                days: [{ date: localDateKey(current), attempts: 1, misses: 1 }],
                streak: 0,
              },
            },
          }),
        );
        TestBed.resetTestingModule();
        expect(createService(() => current).weakSpotFor('deviations')!.missedCounts).toEqual([]);
      });

      it('drops garbage and duplicates out of a restored list', () => {
        localStorage.setItem(
          MISS_TALLY_KEY,
          JSON.stringify({
            deviations: {
              [scenarioKey(HARD_16_V_10)]: {
                ref: HARD_16_V_10,
                days: [{ date: localDateKey(current), attempts: 1, misses: 1 }],
                streak: 0,
                missedCounts: [3, '4', 3, 1.5, 900, -2, null],
              },
            },
          }),
        );
        expect(createService(() => current).weakSpotFor('deviations')!.missedCounts).toEqual([
          3, -2,
        ]);
      });
    });

    it('picks the scenario with the most misses, tiebreaking on miss rate', () => {
      const s = createService(() => current);
      // 16v10: 2 misses of 4; A,7v9: 2 misses of 2 (higher rate).
      s.record('basic-strategy', HARD_16_V_10, false);
      s.record('basic-strategy', HARD_16_V_10, false);
      s.record('basic-strategy', HARD_16_V_10, true);
      s.record('basic-strategy', HARD_16_V_10, true);
      s.record('basic-strategy', SOFT_18_V_9, false);
      s.record('basic-strategy', SOFT_18_V_9, false);
      expect(s.weakSpotFor('basic-strategy')!.ref).toEqual(SOFT_18_V_9);

      s.record('basic-strategy', HARD_16_V_10, false);
      expect(s.weakSpotFor('basic-strategy')!.ref).toEqual(HARD_16_V_10);
    });

    it('keeps trainer tallies independent', () => {
      const s = createService(() => current);
      s.record('deviations', HARD_16_V_10, false);
      expect(s.weakSpotFor('basic-strategy')).toBeNull();
      expect(s.weakSpotFor('deviations')!.label).toBe('16 vs 10');
    });

    it('only counts misses inside the 7-day window and prunes older days', () => {
      const s = createService(() => current);
      s.record('basic-strategy', HARD_16_V_10, false);
      // 8 days later the old miss has aged out of the window.
      current = new Date(BASE);
      current.setDate(current.getDate() + 8);
      expect(s.weakSpotFor('basic-strategy')).toBeNull();
      // A write prunes the stale scenario from storage entirely.
      s.record('basic-strategy', SOFT_18_V_9, false);
      const stored = JSON.parse(localStorage.getItem(MISS_TALLY_KEY)!);
      expect(Object.keys(stored['basic-strategy'])).toEqual([scenarioKey(SOFT_18_V_9)]);
    });

    it('persists across instances', () => {
      const s = createService(() => current);
      s.record('basic-strategy', HARD_16_V_10, false);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const reloaded = createService(() => current);
      expect(reloaded.weakSpotFor('basic-strategy')!.label).toBe('16 vs 10');
    });

    it('tolerates a malformed stored payload', () => {
      localStorage.setItem(MISS_TALLY_KEY, '[broken');
      const s = createService(() => current);
      expect(s.weakSpotFor('basic-strategy')).toBeNull();
      s.record('basic-strategy', HARD_16_V_10, false);
      expect(s.weakSpotFor('basic-strategy')).not.toBeNull();
    });

    it('drops semantically impossible restored tallies and combines duplicate days', () => {
      const today = localDateKey(current);
      localStorage.setItem(
        MISS_TALLY_KEY,
        JSON.stringify({
          'basic-strategy': {
            [scenarioKey(HARD_16_V_10)]: {
              ref: HARD_16_V_10,
              days: [
                { date: today, attempts: 2, misses: 1 },
                { date: today, attempts: 3, misses: 2 },
                { date: '2026-02-30', attempts: 100, misses: 100 },
                { date: today, attempts: 1, misses: 2 },
              ],
              streak: Number.POSITIVE_INFINITY,
            },
            'hard-12-v-6': {
              ref: HARD_16_V_10,
              days: [{ date: today, attempts: 9, misses: 9 }],
              streak: 0,
            },
            'hard-99-v-10': {
              ref: { kind: 'hard', hand: '99', dealer: '10' },
              days: [{ date: today, attempts: 9, misses: 9 }],
              streak: 0,
            },
          },
        }),
      );

      const s = createService(() => current);

      expect(s.weakSpots('basic-strategy')).toEqual([
        {
          ref: HARD_16_V_10,
          label: '16 vs 10',
          attempts: 5,
          misses: 3,
          streak: 0,
          missedCounts: [],
        },
      ]);
    });
  });

  describe('clearing a weak spot', () => {
    it('retires a scenario from the weak list after CLEAR_STREAK correct answers', () => {
      const s = createService(() => current);
      s.record('basic-strategy', HARD_16_V_10, false);
      for (let i = 0; i < CLEAR_STREAK - 1; i++) {
        s.record('basic-strategy', HARD_16_V_10, true);
        expect(s.weakSpotFor('basic-strategy')).not.toBeNull();
      }
      s.record('basic-strategy', HARD_16_V_10, true);

      expect(s.weakSpots('basic-strategy')).toEqual([]);
      expect(s.weakSpotFor('basic-strategy')).toBeNull();
      expect(s.clearedSpots('basic-strategy').map((spot) => spot.label)).toEqual(['16 vs 10']);
    });

    it('a single miss un-clears a cleared scenario', () => {
      const s = createService(() => current);
      s.record('basic-strategy', HARD_16_V_10, false);
      for (let i = 0; i < CLEAR_STREAK; i++) {
        s.record('basic-strategy', HARD_16_V_10, true);
      }
      expect(s.clearedSpots('basic-strategy')).toHaveLength(1);

      s.record('basic-strategy', HARD_16_V_10, false);
      expect(s.clearedSpots('basic-strategy')).toEqual([]);
      expect(s.weakSpotFor('basic-strategy')!.streak).toBe(0);
    });

    it('never counts a scenario that was answered correctly from the start', () => {
      const s = createService(() => current);
      for (let i = 0; i < CLEAR_STREAK + 2; i++) {
        s.record('basic-strategy', HARD_16_V_10, true);
      }
      // Clearing is only meaningful for something that was missed this week.
      expect(s.clearedSpots('basic-strategy')).toEqual([]);
      expect(s.weakSpots('basic-strategy')).toEqual([]);
    });

    it('survives a payload written before clear-streak tracking existed', () => {
      const legacy = {
        'basic-strategy': {
          [scenarioKey(HARD_16_V_10)]: {
            ref: HARD_16_V_10,
            days: [{ date: localDateKey(current), attempts: 4, misses: 2 }],
          },
        },
      };
      localStorage.setItem(MISS_TALLY_KEY, JSON.stringify(legacy));

      const s = createService(() => current);
      const weak = s.weakSpotFor('basic-strategy')!;
      expect(weak.misses).toBe(2);
      expect(weak.streak).toBe(0);
    });
  });

  describe('weakSpots ranking', () => {
    it('orders by misses, then miss rate, then a stable key', () => {
      const s = createService(() => current);
      // 16v10: 2 of 4. A,7v9: 2 of 2 — same misses, higher rate, so first.
      s.record('basic-strategy', HARD_16_V_10, false);
      s.record('basic-strategy', HARD_16_V_10, false);
      s.record('basic-strategy', HARD_16_V_10, true);
      s.record('basic-strategy', HARD_16_V_10, true);
      s.record('basic-strategy', SOFT_18_V_9, false);
      s.record('basic-strategy', SOFT_18_V_9, false);
      // Pair 8s: 3 misses — the most, so it leads.
      s.record('basic-strategy', PAIR_8S_V_10, false);
      s.record('basic-strategy', PAIR_8S_V_10, false);
      s.record('basic-strategy', PAIR_8S_V_10, false);

      expect(s.weakSpots('basic-strategy').map((spot) => spot.label)).toEqual([
        '8,8 vs 10',
        'A,7 vs 9',
        '16 vs 10',
      ]);
    });
  });
  describe('missedCountsLabel', () => {
    const spot = (missedCounts: readonly number[]) => ({
      ref: HARD_16_V_10,
      label: '16 vs 10',
      misses: 1,
      attempts: 1,
      streak: 0,
      missedCounts,
    });

    it('says nothing for a scenario that files no counts', () => {
      expect(missedCountsLabel(spot([]))).toBeNull();
    });

    it('signs every count and reads them low to high', () => {
      expect(missedCountsLabel(spot([2, -1, 0]))).toBe('TC -1, 0, +2');
    });

    // Three misses at the same count is one lesson, not three.
    it('collapses repeats of the same count', () => {
      expect(missedCountsLabel(spot([2, 2, 2]))).toBe('TC +2');
    });

    it('keeps both sides of an index, which are opposite mistakes', () => {
      expect(missedCountsLabel(spot([-1, 2]))).toBe('TC -1, +2');
    });
  });

  describe('reset', () => {
    it('forgets every tally and the stored payload', () => {
      const s = createService(() => current);
      s.record('basic-strategy', HARD_16_V_10, false);
      s.record('deviations', SOFT_18_V_9, false);
      expect(s.weakSpots('basic-strategy')).toHaveLength(1);

      s.reset();

      expect(s.weakSpots('basic-strategy')).toEqual([]);
      expect(s.weakSpots('deviations')).toEqual([]);
      expect(s.state()).toEqual({});
      expect(localStorage.getItem(MISS_TALLY_KEY)).toBe('{}');
    });
  });
});
