import { readJson, writeJson } from './storage';

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
});
