import {
  coerceNumericRecord,
  readJson,
  resetStorageWriteRefused,
  storageWriteRefused,
  writeJson,
} from './storage';

const KEY = 'storage-spec-key';

describe('storage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('readJson', () => {
    it('returns the fallback when nothing is stored', () => {
      expect(readJson(KEY, 'fallback', () => 'coerced')).toBe('fallback');
    });

    it('passes the parsed payload through coerce', () => {
      localStorage.setItem(KEY, JSON.stringify({ n: 2 }));
      expect(readJson(KEY, 0, (raw) => (raw as { n: number }).n * 10)).toBe(20);
    });

    it('returns the fallback on malformed JSON', () => {
      localStorage.setItem(KEY, '{not json');
      expect(readJson(KEY, 'fallback', () => 'coerced')).toBe('fallback');
    });

    it('returns the fallback when coerce throws on a bad shape', () => {
      localStorage.setItem(KEY, 'null');
      expect(readJson(KEY, 'fallback', (raw) => (raw as { days: string[] }).days.join())).toBe(
        'fallback',
      );
    });

    it('returns the fallback when localStorage refuses a read', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('private mode');
      });
      expect(readJson(KEY, 'fallback', () => 'coerced')).toBe('fallback');
      vi.restoreAllMocks();
    });
  });

  describe('coerceNumericRecord', () => {
    const EMPTY = { hands: 0, wins: 0 } as const;

    it('picks exactly the fallback keys when all are numbers', () => {
      expect(coerceNumericRecord({ hands: 3, wins: 2 }, EMPTY)).toEqual({ hands: 3, wins: 2 });
    });

    it('ignores extra keys the shape does not declare', () => {
      expect(coerceNumericRecord({ hands: 3, wins: 2, bogus: 'x' }, EMPTY)).toEqual({
        hands: 3,
        wins: 2,
      });
    });

    it('rejects the whole payload when a field is missing', () => {
      expect(coerceNumericRecord({ hands: 3 }, EMPTY)).toBe(EMPTY);
    });

    it('rejects the whole payload when a field is not a number', () => {
      expect(coerceNumericRecord({ hands: 3, wins: '2' }, EMPTY)).toBe(EMPTY);
    });

    it('rejects non-finite numbers that would poison every derived statistic', () => {
      expect(coerceNumericRecord({ hands: Number.POSITIVE_INFINITY, wins: 2 }, EMPTY)).toBe(EMPTY);
      expect(coerceNumericRecord({ hands: Number.NaN, wins: 2 }, EMPTY)).toBe(EMPTY);
    });

    it('throws on a null payload so readJson falls back', () => {
      expect(() => coerceNumericRecord(null, EMPTY)).toThrow();
      localStorage.setItem(KEY, 'null');
      expect(readJson(KEY, EMPTY, (raw) => coerceNumericRecord(raw, EMPTY))).toBe(EMPTY);
    });
  });

  describe('writeJson', () => {
    it('round-trips through readJson', () => {
      writeJson(KEY, { hands: 3 });
      expect(readJson(KEY, null, (raw) => raw)).toEqual({ hands: 3 });
    });

    it('tolerates setItem throwing (quota / private browsing)', () => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = () => {
        throw new Error('quota');
      };
      try {
        expect(() => writeJson(KEY, { hands: 3 })).not.toThrow();
      } finally {
        Storage.prototype.setItem = original;
      }
    });
  });

  // A refused write is practice the trainee will not get back, and it is
  // invisible from inside the drill — which goes on grading and counting.
  describe('storageWriteRefused', () => {
    const refusing = (fn: () => void) => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = () => {
        throw new Error('quota');
      };
      try {
        fn();
      } finally {
        Storage.prototype.setItem = original;
      }
    };

    beforeEach(() => {
      resetStorageWriteRefused();
    });

    it('is false while writes are being accepted', () => {
      writeJson(KEY, { hands: 3 });
      expect(storageWriteRefused()).toBe(false);
    });

    it('is set by a write the browser refuses', () => {
      refusing(() => writeJson(KEY, { hands: 3 }));
      expect(storageWriteRefused()).toBe(true);
    });

    // A later write succeeding does not bring the lost one back.
    it('stays set once something has been lost', () => {
      refusing(() => writeJson(KEY, { hands: 3 }));
      writeJson(KEY, { hands: 4 });
      expect(storageWriteRefused()).toBe(true);
    });

    it('is not set by a read the browser refuses, which loses nothing', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('private mode');
      });
      readJson(KEY, 'fallback', () => 'coerced');
      vi.restoreAllMocks();
      expect(storageWriteRefused()).toBe(false);
    });
  });
});
