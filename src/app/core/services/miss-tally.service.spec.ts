import { TestBed } from '@angular/core/testing';

import type { Card, Rank, Suit } from '../models/card.model';
import { localDateKey } from './practice-history.service';
import {
  CLEAR_STREAK,
  MISS_TALLY_KEY,
  MissTallyService,
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
