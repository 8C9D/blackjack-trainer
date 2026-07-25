import { TestBed } from '@angular/core/testing';

import { RANDOM_SOURCE, mulberry32, randomSourceForLocation } from './random-source';

describe('randomSourceForLocation', () => {
  it('falls back to Math.random with no seed param', () => {
    expect(randomSourceForLocation(undefined)).toBe(Math.random);
    expect(randomSourceForLocation('')).toBe(Math.random);
    expect(randomSourceForLocation('?other=1')).toBe(Math.random);
  });

  it('falls back to Math.random for a non-numeric seed', () => {
    expect(randomSourceForLocation('?seed=abc')).toBe(Math.random);
    expect(randomSourceForLocation('?seed=')).toBe(Math.random);
  });

  it('returns the same sequence for the same seed', () => {
    // Two separate calls, so each gets its own generator state.
    const first = Array.from({ length: 8 }, randomSourceForLocation('?seed=7'));
    const second = Array.from({ length: 8 }, randomSourceForLocation('?seed=7'));
    expect(first).toEqual(second);
    expect(new Set(first).size).toBeGreaterThan(1);
  });

  it('returns different sequences for different seeds', () => {
    const first = Array.from({ length: 8 }, randomSourceForLocation('?seed=7'));
    const second = Array.from({ length: 8 }, randomSourceForLocation('?seed=8'));
    expect(first).not.toEqual(second);
  });

  it('truncates a fractional seed rather than rejecting it', () => {
    const whole = Array.from({ length: 4 }, randomSourceForLocation('?seed=7'));
    const fractional = Array.from({ length: 4 }, randomSourceForLocation('?seed=7.9'));
    expect(fractional).toEqual(whole);
  });
});

describe('mulberry32', () => {
  it('stays inside [0, 1)', () => {
    const random = mulberry32(12345);
    for (let i = 0; i < 5000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('does not immediately repeat itself', () => {
    const random = mulberry32(1);
    const seen = new Set(Array.from({ length: 1000 }, random));
    expect(seen.size).toBe(1000);
  });

  it('spreads roughly evenly across the unit interval', () => {
    const random = mulberry32(99);
    const buckets = new Array(10).fill(0);
    const draws = 20_000;
    for (let i = 0; i < draws; i++) buckets[Math.floor(random() * 10)]++;
    // A uniform generator puts ~10% in each tenth; ±2 points is far outside
    // sampling noise at n = 20,000 but tolerant of a single seed's quirks.
    for (const count of buckets) {
      expect(Math.abs(count / draws - 0.1)).toBeLessThan(0.02);
    }
  });
});

describe('RANDOM_SOURCE', () => {
  it('resolves to a usable source under the test harness (no seed in the URL)', () => {
    TestBed.configureTestingModule({});
    const random = TestBed.inject(RANDOM_SOURCE);
    const value = random();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });
});
