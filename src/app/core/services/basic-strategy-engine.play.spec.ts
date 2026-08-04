import { BasicStrategyEngineService, type PlayInput } from './basic-strategy-engine.service';
import { ALL_RANKS, type Card, type Rank } from '../models/card.model';
import { handTotal, isBust } from '../models/hand.model';
import type { EngineOptions, RuleSet } from '../models/strategy.model';

const card = (rank: Rank): Card => ({ rank, suit: 'spades' });

const RULE_SETS: readonly RuleSet[] = ['S17', 'H17'];
const OPTION_SETS: readonly EngineOptions[] = [
  { doubleAfterSplit: false, lateSurrender: false },
  { doubleAfterSplit: true, lateSurrender: false },
  { doubleAfterSplit: false, lateSurrender: true },
  { doubleAfterSplit: true, lateSurrender: true },
];

const play = (
  player: readonly Rank[],
  up: Rank,
  ruleSet: RuleSet,
  options: EngineOptions,
  offers: Partial<Pick<PlayInput, 'canDouble' | 'canSplit' | 'canSurrender'>> = {},
): PlayInput => ({
  player: player.map(card),
  dealerUpcard: card(up),
  ruleSet,
  options,
  canDouble: true,
  canSplit: true,
  canSurrender: true,
  ...offers,
});

describe('BasicStrategyEngineService.decidePlay', () => {
  let engine: BasicStrategyEngineService;

  beforeEach(() => {
    engine = new BasicStrategyEngineService();
  });

  // The load-bearing guard: with two cards and nothing withheld, the mid-hand
  // decision *is* the opening decision. If these ever disagree, decidePlay has
  // grown a second, private copy of the chart.
  describe('agreement with decide() on an opening hand', () => {
    // Assertions are accumulated rather than made per hand: at 17,576 cases an
    // expect() per iteration is most of the suite's runtime.
    it('matches on every two-card hand, upcard, rule set, and option pair', () => {
      const disagreements: string[] = [];
      let compared = 0;
      for (const ruleSet of RULE_SETS) {
        for (const options of OPTION_SETS) {
          for (const a of ALL_RANKS) {
            for (const b of ALL_RANKS) {
              for (const up of ALL_RANKS) {
                const opening = engine.decide({
                  player: [card(a), card(b)],
                  dealerUpcard: card(up),
                  ruleSet,
                  options,
                });
                const mid = engine.decidePlay(play([a, b], up, ruleSet, options));
                compared++;
                if (mid.action !== opening.action) {
                  disagreements.push(
                    `${a},${b} vs ${up} ${ruleSet} DAS=${options.doubleAfterSplit} LS=${options.lateSurrender}: ` +
                      `decide=${opening.action} decidePlay=${mid.action}`,
                  );
                }
              }
            }
          }
        }
      }
      expect(disagreements).toEqual([]);
      // 2 rule sets × 4 option pairs × 13³ hands.
      expect(compared).toBe(2 * 4 * 13 * 13 * 13);
    });
  });

  describe('hands past the opening two cards', () => {
    const s17 = OPTION_SETS[0];

    it('reads a three-card hard total off the hard chart', () => {
      // 5+4+7 is a hard 16; vs a 10 the S17 chart hits it.
      const decision = engine.decidePlay(play(['5', '4', '7'], '10', 'S17', s17));
      expect(decision.action).toBe('H');
      expect(decision.handDescription).toBe('Hard 16');
    });

    it('reads a three-card soft total off the soft chart', () => {
      // A+2+4 is a soft 17, which hits against a 10.
      const decision = engine.decidePlay(play(['A', '2', '4'], '10', 'S17', s17));
      expect(decision.action).toBe('H');
      expect(decision.handDescription).toBe('Soft 17');
    });

    it('demotes an ace once the hand would bust, and plays the hard total', () => {
      // A+9+8 is 18 hard, not 28: stand.
      const decision = engine.decidePlay(play(['A', '9', '8'], '10', 'S17', s17));
      expect(decision.action).toBe('S');
      expect(decision.handDescription).toBe('Hard 18');
    });

    it('stands a hard 21 and a soft 21, both of which are off the chart', () => {
      expect(engine.decidePlay(play(['7', '7', '7'], '10', 'S17', s17)).action).toBe('S');
      expect(engine.decidePlay(play(['A', '5', '5'], '10', 'S17', s17)).action).toBe('S');
    });

    it('never looks up a pair beyond two cards', () => {
      // 8,8 splits; 8,8,5 is a hard 21 and stands.
      expect(engine.decidePlay(play(['8', '8'], '10', 'S17', s17)).action).toBe('P');
      expect(engine.decidePlay(play(['8', '8', '5'], '10', 'S17', s17)).action).toBe('S');
    });
  });

  describe('actions the hand can no longer take', () => {
    const s17 = OPTION_SETS[0];
    const ls: EngineOptions = { doubleAfterSplit: false, lateSurrender: true };

    it('falls a hard double back to a hit', () => {
      // Hard 11 vs 6 doubles.
      expect(engine.decidePlay(play(['6', '5'], '6', 'S17', s17)).action).toBe('D');
      const noDouble = engine.decidePlay(play(['6', '5'], '6', 'S17', s17, { canDouble: false }));
      expect(noDouble.action).toBe('H');
      expect(noDouble.reason).toContain('doubling is not available');
    });

    // The small 's' in `Ds` is exactly this: double, or stand if you cannot.
    it('falls a soft Ds back to a stand, not a hit', () => {
      // Soft 18 vs 6 is Ds under S17.
      expect(engine.decidePlay(play(['A', '7'], '6', 'S17', s17)).action).toBe('D');
      expect(
        engine.decidePlay(play(['A', '7'], '6', 'S17', s17, { canDouble: false })).action,
      ).toBe('S');
    });

    it('falls a plain soft double back to a hit', () => {
      // Soft 13 vs 5 is a plain D: hitting is the fallback, not standing.
      expect(engine.decidePlay(play(['A', '2'], '5', 'S17', s17)).action).toBe('D');
      expect(
        engine.decidePlay(play(['A', '2'], '5', 'S17', s17, { canDouble: false })).action,
      ).toBe('H');
    });

    it('falls a lapsed surrender back to the play behind the cell', () => {
      // Hard 16 vs 9 surrenders with LS on; hits without it.
      expect(engine.decidePlay(play(['10', '6'], '9', 'S17', ls)).action).toBe('SUR');
      const lapsed = engine.decidePlay(play(['10', '6'], '9', 'S17', ls, { canSurrender: false }));
      expect(lapsed.action).toBe('H');
      expect(lapsed.reason).toContain('surrender is not available');
    });

    it('plays a pair as its total when the split is not on offer', () => {
      expect(engine.decidePlay(play(['8', '8'], '10', 'S17', s17)).action).toBe('P');
      // Hard 16 vs 10 hits under S17 without late surrender.
      const noSplit = engine.decidePlay(play(['8', '8'], '10', 'S17', s17, { canSplit: false }));
      expect(noSplit.action).toBe('H');
      expect(noSplit.handDescription).toBe('Hard 16');
    });

    // A pair of aces is the one hand whose total falls off the bottom of the
    // soft chart, so it only shows up when the split is unavailable.
    it('hits an unsplittable pair of aces rather than reading off the chart', () => {
      for (const up of ALL_RANKS) {
        const decision = engine.decidePlay(play(['A', 'A'], up, 'S17', s17, { canSplit: false }));
        expect(decision.action, `A,A vs ${up}`).toBe('H');
        expect(decision.handDescription).toBe('Soft 12');
      }
    });
  });

  // Nothing in the showdown should be able to make the engine throw or return
  // an action the hand cannot take.
  describe('total coverage of reachable hands', () => {
    // The `can*` flags say what the table allows; past two cards the rules of
    // the game say no regardless, so even the permissive row must come back
    // hit-or-stand.
    it('answers every three-card hand under every offer combination', () => {
      const offers = [
        { canDouble: true, canSplit: true, canSurrender: true },
        { canDouble: false, canSplit: false, canSurrender: false },
      ];
      const bad: string[] = [];
      for (const options of OPTION_SETS) {
        for (const offer of offers) {
          for (const a of ALL_RANKS) {
            for (const b of ALL_RANKS) {
              for (const c of ALL_RANKS) {
                const cards = [a, b, c].map(card);
                // A busted hand has no decision left to make.
                if (isBust(cards)) continue;
                for (const up of ALL_RANKS) {
                  const decision = engine.decidePlay(play([a, b, c], up, 'H17', options, offer));
                  const label = `${a},${b},${c} vs ${up}`;
                  // Beyond two cards, none of the first-decision actions apply.
                  if (decision.action !== 'H' && decision.action !== 'S') {
                    bad.push(`${label}: ${decision.action}`);
                  }
                  if (!decision.handDescription.includes(String(handTotal(cards)))) {
                    bad.push(`${label}: described as "${decision.handDescription}"`);
                  }
                }
              }
            }
          }
        }
      }
      expect(bad).toEqual([]);
    });
  });

  // The drill grades a played-out hand through this, so it has to carry the
  // same verdict shape `evaluate` does.
  describe('evaluatePlay', () => {
    const HARD_16 = play(['10', '4', '2'], '10', 'S17', OPTION_SETS[0]);

    it('grades a continued decision against decidePlay', () => {
      const right = engine.evaluatePlay(HARD_16, 'H');
      expect(right.correct).toBe(true);
      expect(right.userAction).toBe('H');
      expect(right.reason).toContain('Hard 16 vs dealer 10 under S17: hit');

      const wrong = engine.evaluatePlay(HARD_16, 'S');
      expect(wrong.correct).toBe(false);
      expect(wrong.action).toBe('H');
    });

    it('keeps the insurance verdict of the opening question', () => {
      const result = engine.evaluatePlay(HARD_16, 'INS');
      expect(result.correct).toBe(false);
      expect(result.source).toBe('insurance');
      expect(result.reason).toContain('never takes insurance');
    });
  });
});
