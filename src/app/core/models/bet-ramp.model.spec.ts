import {
  BET_RAMP_BANDS,
  BET_RAMP_BAND_LABELS,
  DEFAULT_BET_RAMP,
  MAX_BET_UNITS,
  MIN_BET_UNITS,
  betRampBandIndex,
  betUnitsForTrueCount,
  normalizeBetRamp,
  rampShrinks,
  validateBetRamp,
} from './bet-ramp.model';

describe('bet ramp', () => {
  it('has one label per band and a default entry for each', () => {
    expect(BET_RAMP_BAND_LABELS.length).toBe(BET_RAMP_BANDS);
    expect(DEFAULT_BET_RAMP.length).toBe(BET_RAMP_BANDS);
  });

  describe('betRampBandIndex', () => {
    it('puts everything at or below +1 in the first band', () => {
      for (const tc of [-9, -1, 0, 1]) {
        expect(betRampBandIndex(tc)).toBe(0);
      }
    });

    it('gives +2 through +4 a band each', () => {
      expect(betRampBandIndex(2)).toBe(1);
      expect(betRampBandIndex(3)).toBe(2);
      expect(betRampBandIndex(4)).toBe(3);
    });

    it('caps +5 and above in the top band', () => {
      for (const tc of [5, 6, 20]) {
        expect(betRampBandIndex(tc)).toBe(BET_RAMP_BANDS - 1);
      }
    });

    it('truncates a fractional count toward zero rather than landing between bands', () => {
      expect(betRampBandIndex(2.9)).toBe(betRampBandIndex(2));
      expect(betRampBandIndex(-0.5)).toBe(0);
    });

    it('falls back to the first band for a non-finite count', () => {
      expect(betRampBandIndex(Number.NaN)).toBe(0);
      expect(betRampBandIndex(Number.POSITIVE_INFINITY)).toBe(0);
    });
  });

  describe('betUnitsForTrueCount', () => {
    it('reads the default 1-2-4-8-12 spread across the bands', () => {
      expect(betUnitsForTrueCount(0, DEFAULT_BET_RAMP)).toBe(1);
      expect(betUnitsForTrueCount(1, DEFAULT_BET_RAMP)).toBe(1);
      expect(betUnitsForTrueCount(2, DEFAULT_BET_RAMP)).toBe(2);
      expect(betUnitsForTrueCount(3, DEFAULT_BET_RAMP)).toBe(4);
      expect(betUnitsForTrueCount(4, DEFAULT_BET_RAMP)).toBe(8);
      expect(betUnitsForTrueCount(9, DEFAULT_BET_RAMP)).toBe(12);
    });

    it('reads a flat spread the same at every count', () => {
      const flat = [1, 1, 1, 1, 1];
      for (const tc of [-3, 0, 2, 5, 12]) {
        expect(betUnitsForTrueCount(tc, flat)).toBe(1);
      }
    });
  });

  describe('validateBetRamp', () => {
    it('accepts the default spread', () => {
      expect(validateBetRamp(DEFAULT_BET_RAMP)).toEqual([]);
    });

    it('rejects units outside the supported range', () => {
      expect(validateBetRamp([0, 2, 4, 8, 12]).length).toBe(1);
      expect(validateBetRamp([1, 2, 4, 8, MAX_BET_UNITS + 1]).length).toBe(1);
    });

    it('rejects a fractional unit count', () => {
      expect(validateBetRamp([1, 2.5, 4, 8, 12]).length).toBe(1);
    });

    it('rejects a ramp with the wrong number of bands', () => {
      expect(validateBetRamp([1, 2]).length).toBe(1);
    });

    it('accepts a shrinking ramp — that is an advisory, not an error', () => {
      expect(validateBetRamp([12, 8, 4, 2, 1])).toEqual([]);
      expect(rampShrinks([12, 8, 4, 2, 1])).toBe(true);
      expect(rampShrinks(DEFAULT_BET_RAMP)).toBe(false);
      // Flat between two bands is not shrinking.
      expect(rampShrinks([1, 1, 4, 4, 12])).toBe(false);
    });
  });

  describe('normalizeBetRamp', () => {
    it('keeps a well-formed stored ramp', () => {
      expect(normalizeBetRamp([1, 3, 6, 10, 20])).toEqual([1, 3, 6, 10, 20]);
    });

    it('falls back to the default for a non-array payload', () => {
      expect(normalizeBetRamp(undefined)).toEqual(DEFAULT_BET_RAMP);
      expect(normalizeBetRamp('1,2,4')).toEqual(DEFAULT_BET_RAMP);
    });

    it('replaces only the bands it cannot use', () => {
      expect(normalizeBetRamp([2, 'x', 4.5, MIN_BET_UNITS - 1, 20])).toEqual([
        2,
        DEFAULT_BET_RAMP[1],
        DEFAULT_BET_RAMP[2],
        DEFAULT_BET_RAMP[3],
        20,
      ]);
    });

    it('pads a short stored ramp from the default', () => {
      expect(normalizeBetRamp([5, 5])).toEqual([5, 5, ...DEFAULT_BET_RAMP.slice(2)]);
    });
  });
});
