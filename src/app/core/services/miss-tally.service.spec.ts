import { TestBed } from '@angular/core/testing';

import type { Card, Rank, Suit } from '../models/card.model';
import {
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
      for (const correct of [false, true, false, false, true, true, true]) {
        s.record('basic-strategy', HARD_16_V_10, correct);
      }
      const weak = s.weakSpotFor('basic-strategy');
      expect(weak).toEqual({ ref: HARD_16_V_10, label: '16 vs 10', misses: 3, attempts: 7 });
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
});
