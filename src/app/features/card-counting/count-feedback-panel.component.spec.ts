import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { Card, Rank } from '../../core/models/card.model';
import { DEFAULT_BET_RAMP } from '../../core/models/bet-ramp.model';
import type { DeckSpeedDrillResult } from '../../core/models/deck-speed.model';
import type {
  BetSpreadDrillResult,
  CountingDrillResult,
  KeyCountDrillResult,
  RunningCountDrillResult,
  TrueCountDrillResult,
} from '../../core/models/card-counting.model';
import type { CountingSystem } from '../../core/models/counting-system.model';
import { HI_LO, KO } from '../../data/counting-systems';
import { CountFeedbackPanelComponent } from './count-feedback-panel.component';

const card = (rank: Rank): Card => ({ rank, suit: 'spades' });
const seq = (...ranks: Rank[]): Card[] => ranks.map(card);

function makeRunningCountResult(
  overrides: Partial<RunningCountDrillResult> = {},
): RunningCountDrillResult {
  return {
    mode: 'running-count',
    cards: seq('2', '3', '4', '5', '6'),
    correctRunningCount: 5,
    userRunningCount: 5,
    isCorrect: true,
    ...overrides,
  };
}

function makeTrueCountResult(overrides: Partial<TrueCountDrillResult> = {}): TrueCountDrillResult {
  return {
    mode: 'true-count',
    cards: seq('2', '3', '4', '5', '6'),
    correctRunningCount: 6,
    decksRemaining: 2,
    correctTrueCount: 3,
    userTrueCount: 3,
    isCorrect: true,
    ...overrides,
  };
}

// A six-deck KO round: prior −6 plus 2..6 (+5) → −5, below the −4 key count,
// correctly called "no advantage". Overrides carve out the variants.
function makeKeyCountResult(overrides: Partial<KeyCountDrillResult> = {}): KeyCountDrillResult {
  return {
    mode: 'key-count',
    cards: seq('2', '3', '4', '5', '6'),
    correctRunningCount: -5,
    userRunningCount: -5,
    countCorrect: true,
    priorRunningCount: -10,
    irc: -20,
    keyCount: -4,
    pivot: 4,
    insuranceCount: 3,
    hasAdvantage: false,
    userSaidAdvantage: false,
    advantageCorrect: true,
    isCorrect: true,
    ...overrides,
  };
}

// A live-shoe Hi-Lo round: +6 running over 2 decks is true count +3, the
// default spread's 4-unit band, bet correctly.
function makeBetSpreadResult(overrides: Partial<BetSpreadDrillResult> = {}): BetSpreadDrillResult {
  return {
    mode: 'bet-spread',
    cards: seq('2', '3', '4', '5', '6'),
    correctRunningCount: 6,
    decksRemaining: 2,
    correctTrueCount: 3,
    userTrueCount: 3,
    countCorrect: true,
    priorRunningCount: 1,
    ramp: DEFAULT_BET_RAMP,
    correctUnits: 4,
    userUnits: 4,
    betCorrect: true,
    isCorrect: true,
    ...overrides,
  };
}

// A Hi-Lo countdown: 2..6 is +5 over the 51 shown, and the burned card was a
// ten (−1)... which is what makes the deck come back to 0.
function makeDeckSpeedResult(overrides: Partial<DeckSpeedDrillResult> = {}): DeckSpeedDrillResult {
  return {
    mode: 'deck-speed',
    cards: seq('2', '3', '4', '5', '6'),
    burnedCard: { rank: 'K', suit: 'hearts' },
    correctRunningCount: 1,
    userRunningCount: 1,
    fullDeckCount: 0,
    isCorrect: true,
    elapsedMs: 27_400,
    previousBestMs: 31_000,
    isPersonalBest: true,
    ...overrides,
  };
}

function createPanel(
  result: CountingDrillResult,
  system: CountingSystem = HI_LO,
): ComponentFixture<CountFeedbackPanelComponent> {
  const fixture = TestBed.createComponent(CountFeedbackPanelComponent);
  fixture.componentRef.setInput('result', result);
  fixture.componentRef.setInput('system', system);
  fixture.detectChanges();
  return fixture;
}

describe('CountFeedbackPanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CountFeedbackPanelComponent],
    });
  });

  describe('running-count mode', () => {
    it('renders Correct verdict and user/correct running counts', () => {
      const fixture = createPanel(
        makeRunningCountResult({ userRunningCount: 5, correctRunningCount: 5 }),
      );
      const text = fixture.nativeElement.textContent ?? '';
      expect(text).toContain('Correct');
      expect(text).toContain('Your count');
      expect(text).toContain('Correct count');
    });

    it('renders Incorrect verdict on a wrong answer', () => {
      const fixture = createPanel(
        makeRunningCountResult({ userRunningCount: 4, correctRunningCount: 5, isCorrect: false }),
      );
      expect(fixture.nativeElement.textContent).toContain('Incorrect');
    });

    it('does not render the true-count formula line', () => {
      const fixture = createPanel(makeRunningCountResult());
      expect(fixture.nativeElement.querySelector('.feedback__formula')).toBeNull();
    });

    // Two numbers side by side leave the subtraction to the trainee, and which
    // side a count lands on is the half of a miscount worth practising.
    it('says how far the count landed from the real one, and on which side', () => {
      const low = createPanel(
        makeRunningCountResult({ userRunningCount: 3, correctRunningCount: 5, isCorrect: false }),
      );
      expect(low.nativeElement.textContent).toContain('came in 2 points low over 5 cards');

      const high = createPanel(
        makeRunningCountResult({ userRunningCount: 6, correctRunningCount: 5, isCorrect: false }),
      );
      expect(high.nativeElement.textContent).toContain('came in 1 point high');
    });

    it('says nothing about drift on a correct count', () => {
      const fixture = createPanel(makeRunningCountResult());
      expect(fixture.nativeElement.textContent).not.toContain('came in');
    });

    // A key-count round carries the shoe's prior, so its drift is over every
    // card dealt since the shuffle — not over the handful this round streamed.
    it('counts the cards a drift is over only where the round is the whole count', () => {
      const round = createPanel(
        makeRunningCountResult({ userRunningCount: 3, correctRunningCount: 5, isCorrect: false }),
      );
      expect(round.nativeElement.textContent).toContain('over 5 cards');

      const shoe = createPanel(
        makeKeyCountResult({ userRunningCount: -7, correctRunningCount: -5, countCorrect: false }),
      );
      expect(shoe.nativeElement.textContent).toContain('came in 2 points low.');
      expect(shoe.nativeElement.textContent).not.toContain('over 5 cards');
    });

    // Wong Halves answers in halves, so the noun follows the value.
    it('counts a half-point drift as points', () => {
      const fixture = createPanel(
        makeRunningCountResult({ userRunningCount: 4.5, correctRunningCount: 5, isCorrect: false }),
      );
      expect(fixture.nativeElement.textContent).toContain('0.5 points low');
    });

    it('renders the card-by-card breakdown when toggled open', () => {
      const fixture = createPanel(makeRunningCountResult());
      const toggle = fixture.nativeElement.querySelector('.feedback__toggle') as HTMLButtonElement;
      toggle.click();
      fixture.detectChanges();
      const cells = fixture.nativeElement.querySelectorAll('.feedback__cell');
      expect(cells.length).toBe(5);
    });
  });

  describe('true-count mode', () => {
    it('renders the true-count fields', () => {
      const fixture = createPanel(
        makeTrueCountResult({
          userTrueCount: 3,
          correctTrueCount: 3,
          correctRunningCount: 6,
          decksRemaining: 2,
        }),
      );
      const text = fixture.nativeElement.textContent ?? '';
      expect(text).toContain('Your true count');
      expect(text).toContain('Correct true count');
      expect(text).toContain('Running count');
      expect(text).toContain('Decks remaining');
    });

    it('renders the running count value used and the decks remaining value', () => {
      const fixture = createPanel(
        makeTrueCountResult({ correctRunningCount: 6, decksRemaining: 2 }),
      );
      const text = fixture.nativeElement.textContent ?? '';
      expect(text).toContain('6');
      expect(text).toContain('2');
    });

    it('renders the formula line', () => {
      const fixture = createPanel(
        makeTrueCountResult({
          correctRunningCount: 6,
          decksRemaining: 2,
          correctTrueCount: 3,
        }),
      );
      const formula = fixture.nativeElement.querySelector('.feedback__formula');
      expect(formula).not.toBeNull();
      const text = formula!.textContent ?? '';
      expect(text).toContain('6');
      expect(text).toContain('2');
      expect(text).toContain('3');
      expect(text).toContain('decks');
    });

    // The divisor is a number a trainee reads carefully; "÷ 1 decks" reads as a
    // typo in exactly the line that has to look like arithmetic.
    it('says one deck, not one decks, in the formula', () => {
      const fixture = createPanel(
        makeTrueCountResult({
          correctRunningCount: 4,
          decksRemaining: 1,
          correctTrueCount: 4,
        }),
      );
      const text = (
        fixture.nativeElement.querySelector('.feedback__formula') as HTMLElement
      ).textContent!.replace(/\s+/g, ' ');
      expect(text).toContain('÷ 1 deck =');
    });

    it('does not render the running-count "Your count" label', () => {
      const fixture = createPanel(makeTrueCountResult());
      const dts = Array.from(fixture.nativeElement.querySelectorAll('.feedback__details dt')).map(
        (el) => (el as HTMLElement).textContent?.trim(),
      );
      expect(dts).not.toContain('Your count');
      expect(dts).not.toContain('Correct count');
    });

    it('renders the card-by-card breakdown when toggled open', () => {
      const fixture = createPanel(makeTrueCountResult({ cards: seq('A', 'K', 'Q') }));
      const toggle = fixture.nativeElement.querySelector('.feedback__toggle') as HTMLButtonElement;
      toggle.click();
      fixture.detectChanges();
      const cells = fixture.nativeElement.querySelectorAll('.feedback__cell');
      expect(cells.length).toBe(3);
    });

    it('renders Incorrect verdict on a wrong answer', () => {
      const fixture = createPanel(
        makeTrueCountResult({ userTrueCount: 2, correctTrueCount: 3, isCorrect: false }),
      );
      expect(fixture.nativeElement.textContent).toContain('Incorrect');
    });

    // The estimate is the only divisor a counter has at a table, so the panel
    // has to say what this one would have made of the count.
    describe('what the decks estimate did to the count', () => {
      const lines = (fixture: ComponentFixture<CountFeedbackPanelComponent>): string =>
        Array.from(fixture.nativeElement.querySelectorAll('.feedback__formula'))
          .map((el) => (el as HTMLElement).textContent ?? '')
          .join(' ')
          .replace(/\s+/g, ' ');

      it('divides the count by the estimate the player gave', () => {
        const fixture = createPanel(
          makeTrueCountResult({
            correctRunningCount: 6,
            decksRemaining: 2,
            correctTrueCount: 3,
            userTrueCount: 2,
            isCorrect: false,
            deckEstimate: 3,
            deckEstimateWithinBand: false,
          }),
        );
        expect(lines(fixture)).toContain('Your estimate: 6 ÷ 3 decks = true count 2');
      });

      it('names the answer as the one that estimate implies', () => {
        const fixture = createPanel(
          makeTrueCountResult({
            correctRunningCount: 6,
            decksRemaining: 2,
            correctTrueCount: 3,
            userTrueCount: 2,
            isCorrect: false,
            deckEstimate: 3,
          }),
        );
        expect(lines(fixture)).toContain(
          'the count you would have played on, and the answer you gave',
        );
      });

      // A different miss: the estimate moved the count, but not to the answer.
      it('claims no agreement when the answer is neither figure', () => {
        const fixture = createPanel(
          makeTrueCountResult({
            correctRunningCount: 6,
            decksRemaining: 2,
            correctTrueCount: 3,
            userTrueCount: 5,
            isCorrect: false,
            deckEstimate: 3,
          }),
        );
        expect(lines(fixture)).toContain('Your estimate: 6 ÷ 3 decks = true count 2.');
        expect(lines(fixture)).not.toContain('would have played on');
      });

      // The answer was the shoe's own count and was marked correct two lines
      // above, so "the count you would have played on" would contradict it.
      it('does not claim a count the trainee demonstrably did not play on', () => {
        const fixture = createPanel(
          makeTrueCountResult({
            correctRunningCount: 6,
            decksRemaining: 2,
            correctTrueCount: 3,
            userTrueCount: 3,
            isCorrect: true,
            deckEstimate: 3,
          }),
        );
        expect(lines(fixture)).toContain('true count 2.');
        expect(lines(fixture)).not.toContain('would have played on');
      });

      // How far out an estimate is only matters against the count it divides.
      it('says an estimate that lands on the same true count cost nothing', () => {
        const fixture = createPanel(
          makeTrueCountResult({
            correctRunningCount: -2,
            decksRemaining: 5.88,
            correctTrueCount: 0,
            userTrueCount: 0,
            deckEstimate: 3,
            deckEstimateWithinBand: false,
          }),
        );
        expect(lines(fixture)).toContain('the estimate cost nothing here');
      });

      it('agrees the noun with the estimate, as the line above it does', () => {
        const fixture = createPanel(
          makeTrueCountResult({ deckEstimate: 1, correctRunningCount: 6, correctTrueCount: 3 }),
        );
        expect(lines(fixture)).toContain('÷ 1 deck =');
      });

      it('says nothing off a classic round, which asks for no estimate', () => {
        expect(lines(createPanel(makeTrueCountResult()))).not.toContain('Your estimate');
      });
    });
  });

  describe('key-count mode', () => {
    it('renders the counts, the key count, and the advantage verdict', () => {
      const fixture = createPanel(makeKeyCountResult(), KO);
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Correct!');
      expect(text).toContain('Key count');
      expect(text).toContain('-4');
      expect(text).toContain('No — you said no');
    });

    it('explains the threshold and cites the IRC and pivot', () => {
      const fixture = createPanel(makeKeyCountResult(), KO);
      const formula = fixture.nativeElement.querySelector('.feedback__formula') as HTMLElement;
      expect(formula.textContent).toContain('below the key count');
      expect(formula.textContent).toContain('-20');
      expect(formula.textContent).toContain('+4');
    });

    it('flags the insurance trigger only at or above the insurance count', () => {
      const below = createPanel(makeKeyCountResult(), KO);
      expect(below.nativeElement.textContent).not.toContain('insurance');
      const above = createPanel(
        makeKeyCountResult({
          correctRunningCount: 3,
          userRunningCount: 3,
          hasAdvantage: true,
          userSaidAdvantage: true,
        }),
        KO,
      );
      expect(above.nativeElement.textContent).toContain('take insurance');
    });

    it('renders Incorrect when the advantage call is wrong even with a right count', () => {
      const fixture = createPanel(
        makeKeyCountResult({
          userSaidAdvantage: true,
          advantageCorrect: false,
          isCorrect: false,
        }),
        KO,
      );
      expect(fixture.nativeElement.textContent).toContain('Incorrect');
      expect(fixture.nativeElement.textContent).toContain('you said yes');
    });

    it('starts the breakdown running total from the carried (IRC-seeded) prior', () => {
      const fixture = createPanel(
        makeKeyCountResult({ cards: seq('2', '3'), priorRunningCount: -20 }),
        KO,
      );
      const toggle = fixture.nativeElement.querySelector('.feedback__toggle') as HTMLButtonElement;
      toggle.click();
      fixture.detectChanges();
      const totals = Array.from(
        fixture.nativeElement.querySelectorAll('.feedback__running'),
      ) as HTMLElement[];
      expect(totals.map((t) => t.textContent?.trim())).toEqual(['→ -19', '→ -18']);
    });
  });

  describe('bet-spread mode', () => {
    it('shows the bet next to what the spread called for', () => {
      const fixture = createPanel(makeBetSpreadResult());
      const text = fixture.nativeElement.textContent ?? '';
      expect(text).toContain('Correct');
      expect(text).toContain('Your bet');
      expect(text).toContain('Your spread says');
      expect(text).toContain('4 units');
      expect(text).toContain('true count 3');
    });

    it('names the band a missed bet belonged to', () => {
      const fixture = createPanel(
        makeBetSpreadResult({ userUnits: 1, betCorrect: false, isCorrect: false }),
      );
      const text = fixture.nativeElement.textContent ?? '';
      expect(text).toContain('Incorrect');
      expect(text).toContain('1 unit');
      expect(text).toContain('TC +3');
    });

    it('renders the whole spread, marking the band the round landed in', () => {
      const fixture = createPanel(makeBetSpreadResult());
      const bands = Array.from(
        fixture.nativeElement.querySelectorAll('.feedback__band'),
      ) as HTMLElement[];
      expect(bands.length).toBe(DEFAULT_BET_RAMP.length);
      const active = bands.filter((b) => b.classList.contains('feedback__band--active'));
      expect(active.length).toBe(1);
      expect(active[0].textContent).toContain('TC +3');
      expect(active[0].textContent).toContain('4 units');
    });

    // The answer here is a true count, and the deck-estimate line above already
    // accounts for what moved it.
    it('leaves the running-count drift line to the modes that answer one', () => {
      const fixture = createPanel(
        makeBetSpreadResult({ userTrueCount: 1, correctTrueCount: 3, isCorrect: false }),
      );
      expect(fixture.nativeElement.textContent).not.toContain('came in');
    });

    it('shows the deck estimate only when the round asked for one', () => {
      const live = createPanel(
        makeBetSpreadResult({ deckEstimate: 2.5, deckEstimateWithinBand: true }),
      );
      expect(live.nativeElement.textContent).toContain('Your decks estimate');
      const classic = createPanel(makeBetSpreadResult());
      expect(classic.nativeElement.textContent).not.toContain('Your decks estimate');
    });

    // The bet is what a deck estimate is for, so this round can price the
    // estimate in units rather than leave it at a moved true count.
    it('says what the estimate would have bet when it moves the band', () => {
      const fixture = createPanel(
        makeBetSpreadResult({
          correctRunningCount: 6,
          decksRemaining: 2,
          correctTrueCount: 3,
          userTrueCount: 2,
          correctUnits: 4,
          userUnits: 2,
          countCorrect: false,
          betCorrect: false,
          isCorrect: false,
          deckEstimate: 3,
          deckEstimateWithinBand: false,
        }),
      );
      const text = (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ');
      expect(text).toContain('Your estimate: 6 ÷ 3 decks = true count 2');
      expect(text).toContain('Your spread bets 2 units there, not 4 units.');
    });

    it('prices nothing when the moved count still bets the same units', () => {
      // +6 over 2 decks is TC +3 (4 units); read as 6 decks it is TC +1, and
      // the ramp used here bets 4 in both bands.
      const fixture = createPanel(
        makeBetSpreadResult({
          correctRunningCount: 6,
          decksRemaining: 2,
          correctTrueCount: 3,
          userTrueCount: 1,
          ramp: [4, 4, 4, 8, 12],
          correctUnits: 4,
          userUnits: 4,
          countCorrect: false,
          isCorrect: false,
          deckEstimate: 6,
        }),
      );
      const text = (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ');
      expect(text).toContain('true count 1');
      expect(text).not.toContain('Your spread bets');
    });

    it('starts the breakdown running total from the carried prior', () => {
      const fixture = createPanel(makeBetSpreadResult({ cards: seq('2', '3') }));
      const toggle = fixture.nativeElement.querySelector('.feedback__toggle') as HTMLButtonElement;
      toggle.click();
      fixture.detectChanges();
      const totals = Array.from(
        fixture.nativeElement.querySelectorAll('.feedback__running'),
      ) as HTMLElement[];
      expect(totals.map((t) => t.textContent?.trim())).toEqual(['\u2192 2', '\u2192 3']);
    });
  });

  describe('deck-speed mode', () => {
    it('shows the time against the record it beat', () => {
      const fixture = createPanel(makeDeckSpeedResult());
      const text = fixture.nativeElement.textContent ?? '';
      expect(text).toContain('Correct');
      expect(text).toContain('27.4s');
      expect(text).toContain('31.0s');
      expect(text).toContain('New personal best');
    });

    it('reveals the burned card as the proof of the count', () => {
      const fixture = createPanel(makeDeckSpeedResult());
      const text = fixture.nativeElement.textContent ?? '';
      expect(text).toContain('king of hearts');
      expect(text).toContain('worth -1');
      expect(text).toContain('had to come to +1');
    });

    it('shows an em dash for the record when there is none yet', () => {
      const fixture = createPanel(
        makeDeckSpeedResult({ previousBestMs: null, isPersonalBest: true }),
      );
      expect(fixture.nativeElement.textContent).toContain('—');
    });

    it('claims no record on a wrong count, however fast', () => {
      const fixture = createPanel(
        makeDeckSpeedResult({
          userRunningCount: 4,
          isCorrect: false,
          isPersonalBest: false,
          elapsedMs: 9_000,
        }),
      );
      const text = fixture.nativeElement.textContent ?? '';
      expect(text).toContain('Incorrect');
      expect(text).not.toContain('New personal best');
    });

    it('mentions the benchmark only under 30 seconds', () => {
      const under = createPanel(makeDeckSpeedResult({ elapsedMs: 24_000 }));
      expect(under.nativeElement.textContent).toContain('30-second benchmark');
      const over = createPanel(makeDeckSpeedResult({ elapsedMs: 44_000 }));
      expect(over.nativeElement.textContent).not.toContain('30-second benchmark');
    });
  });
});
