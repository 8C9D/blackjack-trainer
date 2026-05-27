import { ALL_RANKS, ALL_SUITS } from '../models/card.model';
import { CardGeneratorService } from './card-generator.service';

// Returns a random() stand-in that yields the scripted values in order,
// cycling once exhausted. Lets each test pin the exact cards produced.
const sequencedRandom = (values: readonly number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('CardGeneratorService', () => {
  let service: CardGeneratorService;

  beforeEach(() => {
    service = new CardGeneratorService();
  });

  describe('generateCard', () => {
    it('produces a card with a rank and suit drawn from the canonical lists', () => {
      const card = service.generateCard();
      expect(ALL_RANKS).toContain(card.rank);
      expect(ALL_SUITS).toContain(card.suit);
    });

    it('maps random() = 0 to the first rank and suit', () => {
      service.setRandomSource(() => 0);
      expect(service.generateCard()).toEqual({
        rank: ALL_RANKS[0],
        suit: ALL_SUITS[0],
      });
    });

    it('maps random() just below 1 to the last rank and suit', () => {
      // Guards the floor(random()*len) index math against an off-by-one that
      // would make the final rank ('A') or suit ('clubs') unreachable.
      service.setRandomSource(() => 0.999999);
      expect(service.generateCard()).toEqual({
        rank: ALL_RANKS[ALL_RANKS.length - 1],
        suit: ALL_SUITS[ALL_SUITS.length - 1],
      });
    });

    it('draws the rank then the suit from successive random() values', () => {
      // 0.0385 → rank index floor(0.0385*13)=0 → '2';
      // 0.625  → suit index floor(0.625*4)=2  → 'diamonds'.
      service.setRandomSource(sequencedRandom([0.0385, 0.625]));
      expect(service.generateCard()).toEqual({ rank: '2', suit: 'diamonds' });
    });

    it('only ever emits legal cards across the whole unit interval', () => {
      const draws = Array.from({ length: 100 }, (_, i) => i / 100);
      service.setRandomSource(sequencedRandom(draws));
      for (let i = 0; i < draws.length; i++) {
        const card = service.generateCard();
        expect(ALL_RANKS).toContain(card.rank);
        expect(ALL_SUITS).toContain(card.suit);
      }
    });
  });

  describe('generate', () => {
    it('returns two player cards and one dealer upcard', () => {
      const scenario = service.generate();
      expect(scenario.player).toHaveLength(2);
      expect(ALL_RANKS).toContain(scenario.dealerUpcard.rank);
      expect(ALL_SUITS).toContain(scenario.dealerUpcard.suit);
      for (const card of scenario.player) {
        expect(ALL_RANKS).toContain(card.rank);
        expect(ALL_SUITS).toContain(card.suit);
      }
    });

    it('draws with replacement — identical draws yield duplicate cards', () => {
      service.setRandomSource(() => 0);
      const scenario = service.generate();
      expect(scenario.player[0]).toEqual(scenario.player[1]);
      expect(scenario.player[0]).toEqual(scenario.dealerUpcard);
    });

    it('is deterministic for a fixed random source', () => {
      const seed = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
      service.setRandomSource(sequencedRandom(seed));
      const first = service.generate();
      service.setRandomSource(sequencedRandom(seed));
      const second = service.generate();
      expect(second).toEqual(first);
    });
  });

  describe('generateSequence', () => {
    it('returns the requested number of cards', () => {
      service.setRandomSource(() => 0);
      expect(service.generateSequence(5)).toHaveLength(5);
    });

    it('returns an empty array for length 0', () => {
      expect(service.generateSequence(0)).toEqual([]);
    });

    it('returns an empty array for negative lengths', () => {
      expect(service.generateSequence(-3)).toEqual([]);
    });

    it('produces only legal cards', () => {
      const draws = Array.from({ length: 41 }, (_, i) => ((i * 7) % 100) / 100);
      service.setRandomSource(sequencedRandom(draws));
      for (const card of service.generateSequence(20)) {
        expect(ALL_RANKS).toContain(card.rank);
        expect(ALL_SUITS).toContain(card.suit);
      }
    });
  });
});
