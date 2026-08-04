import { TestBed } from '@angular/core/testing';

import {
  SHOWDOWN_STATS_KEY,
  ShowdownStatsService,
  coerceShowdownStats,
} from './showdown-stats.service';
import { TRUE_COUNT_STATS_KEY } from './true-count-stats.service';
import { CARD_COUNTING_STATS_KEY } from './card-counting-stats.service';

describe('ShowdownStatsService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('uses a distinct storage key from the counting stores', () => {
    expect(SHOWDOWN_STATS_KEY).not.toBe(TRUE_COUNT_STATS_KEY);
    expect(SHOWDOWN_STATS_KEY).not.toBe(CARD_COUNTING_STATS_KEY);
  });

  // The backup file moves this payload between the browser and the phone, so
  // the stored shape is a cross-platform contract; a field added on one side
  // and not the other is dropped silently on the trip.
  it('writes exactly the fields the iOS store reads', () => {
    const service = TestBed.inject(ShowdownStatsService);
    service.record('win', true);
    expect(Object.keys(JSON.parse(localStorage.getItem(SHOWDOWN_STATS_KEY)!)).sort()).toEqual([
      'blackjacks',
      'hands',
      'losses',
      'pushes',
      'wins',
    ]);
  });

  it('starts empty', () => {
    const service = TestBed.inject(ShowdownStatsService);
    expect(service.stats()).toEqual({
      hands: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      blackjacks: 0,
    });
  });

  it('tallies wins, losses, and pushes separately', () => {
    const service = TestBed.inject(ShowdownStatsService);
    service.record('win');
    service.record('lose');
    service.record('push');
    service.record('win');
    expect(service.stats()).toEqual({
      hands: 4,
      wins: 2,
      losses: 1,
      pushes: 1,
      blackjacks: 0,
    });
  });

  it('counts a player natural among the wins only when it won', () => {
    const service = TestBed.inject(ShowdownStatsService);
    service.record('win', true); // natural win
    service.record('push', true); // pushed natural — not a counted blackjack win
    expect(service.stats().wins).toBe(1);
    expect(service.stats().blackjacks).toBe(1);
    expect(service.stats().pushes).toBe(1);
  });

  it('persists under its own key and reloads', () => {
    const service = TestBed.inject(ShowdownStatsService);
    service.record('win');
    expect(localStorage.getItem(SHOWDOWN_STATS_KEY)).not.toBeNull();

    // A fresh instance reads the persisted tally back.
    const reloaded = new ShowdownStatsService();
    expect(reloaded.stats().hands).toBe(1);
    expect(reloaded.stats().wins).toBe(1);
  });

  it('reset clears the tally', () => {
    const service = TestBed.inject(ShowdownStatsService);
    service.record('win');
    service.record('lose');
    service.reset();
    expect(service.stats()).toEqual({
      hands: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      blackjacks: 0,
    });
  });

  it('tolerates a malformed payload by starting empty', () => {
    localStorage.setItem(SHOWDOWN_STATS_KEY, '{ not json');
    const service = new ShowdownStatsService();
    expect(service.stats().hands).toBe(0);
  });

  it.each([
    {
      label: 'negative counts',
      value: { hands: -1, wins: 0, losses: 0, pushes: 0, blackjacks: 0 },
    },
    {
      label: 'fractional counts',
      value: { hands: 1.5, wins: 1, losses: 0, pushes: 0, blackjacks: 0 },
    },
    {
      label: 'outcomes that do not add up to hands',
      value: { hands: 2, wins: 2, losses: 1, pushes: 0, blackjacks: 0 },
    },
    {
      label: 'more blackjacks than wins',
      value: { hands: 2, wins: 1, losses: 1, pushes: 0, blackjacks: 2 },
    },
  ])('rejects an impossible persisted tally: $label', ({ value }) => {
    localStorage.setItem(SHOWDOWN_STATS_KEY, JSON.stringify(value));
    expect(new ShowdownStatsService().stats()).toEqual({
      hands: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      blackjacks: 0,
    });
  });

  it('accepts a consistent persisted tally', () => {
    expect(coerceShowdownStats({ hands: 4, wins: 2, losses: 1, pushes: 1, blackjacks: 1 })).toEqual(
      { hands: 4, wins: 2, losses: 1, pushes: 1, blackjacks: 1 },
    );
  });
});
