import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { ALL_RANKS, type Card, type Rank, type Suit } from '../../core/models/card.model';
import type { DeviationScenario, DeviationTrainerResult } from '../../core/models/deviation.model';
import type { Action } from '../../core/models/strategy.model';
import { CardGeneratorService } from '../../core/services/card-generator.service';
import { FlowPrefsService } from '../../core/services/flow-prefs.service';
import { MissTallyService } from '../../core/services/miss-tally.service';
import { DeviationsDrillPageComponent } from './deviations-drill-page.component';
import { handQuestion } from './drill-hand';
import { FLOW_ADVANCE_DELAY_MS } from './drill-timing';

const ADVANCE_MS = 50;

const card = (rank: Rank, suit: Suit = 'spades'): Card => ({ rank, suit });

const scenarioOf = (c1: Rank, c2: Rank, up: Rank, trueCount: number): DeviationScenario => ({
  player: [card(c1), card(c2, 'hearts')],
  dealerUpcard: card(up, 'clubs'),
  trueCount,
});

// S17 fixtures (defaults: LS off, DAS off):
//   Hard 16 (K+6) vs 10 stands at TC >= 0 (Illustrious 18), hits below.
const SIXTEEN_V_TEN_TC0 = scenarioOf('K', '6', 'Q', 0);
const SIXTEEN_V_TEN_TC_NEG = scenarioOf('K', '6', 'Q', -2);
//   Hard 16 (K+6) vs 8 surrenders at TC >= +4 — via the surrender overlay,
//   which needs Late Surrender in the table rules, like any surrender.
const SIXTEEN_V_EIGHT_TC4 = scenarioOf('K', '6', '8', 4);
//   Dealer ace: insurance becomes correct at TC >= +3.
const INSURANCE_TC3 = scenarioOf('3', '4', 'A', 3);
const NO_INSURANCE_TC0 = scenarioOf('3', '4', 'A', 0);

type Internals = {
  scenario: { (): DeviationScenario; set(v: DeviationScenario): void };
  hands: { (): readonly (readonly Card[])[]; set(v: readonly (readonly Card[])[]): void };
  activeIndex: { (): number; set(v: number): void };
  hand: () => readonly Card[];
  handLabel: () => string;
  splitAces: { (): boolean; set(v: boolean): void };
  atDeal: { (): boolean; set(v: boolean): void };
  result: { (): DeviationTrainerResult | null };
  phase: { (): 'question' | 'flash' | 'miss' | 'over' | 'done' };
  target: { (): number };
  handsToday: () => number;
  legalActions: () => readonly Action[];
  answer(action: Action): void;
  reviewMisses(): void;
  onKeyDown(event: KeyboardEvent): void;
};

// Pin the next card the drill draws: `generateCard` reads rank and suit off
// one call each, so a value inside the rank's 1/13 slice picks it exactly.
function nextCardIs(rank: Rank): void {
  const index = ALL_RANKS.indexOf(rank);
  TestBed.inject(CardGeneratorService).setRandomSource(() => (index + 0.5) / ALL_RANKS.length);
}

function asInternals(c: DeviationsDrillPageComponent): Internals {
  return c as unknown as Internals;
}

// Deal a scenario the way the page does: the opening two cards are both the
// recorded deal and the only hand in play, and the decision in front of the
// user is the deal's own.
function deal(c: Internals, scenario: DeviationScenario): void {
  c.scenario.set(scenario);
  c.hands.set([scenario.player]);
  c.activeIndex.set(0);
  c.splitAces.set(false);
  c.atDeal.set(true);
}

// Table rules are read when the page renders, so this runs before createPage.
function lateSurrender(on: boolean): void {
  TestBed.inject(FlowPrefsService).setOptions({ doubleAfterSplit: false, lateSurrender: on });
}

function createPage(): {
  fixture: ComponentFixture<DeviationsDrillPageComponent>;
  c: Internals;
} {
  const fixture = TestBed.createComponent(DeviationsDrillPageComponent);
  fixture.detectChanges();
  return { fixture, c: asInternals(fixture.componentInstance) };
}

describe('DeviationsDrillPageComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [DeviationsDrillPageComponent],
      providers: [provideRouter([]), { provide: FLOW_ADVANCE_DELAY_MS, useValue: ADVANCE_MS }],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records itself as the last trainer for Continue', () => {
    createPage();
    expect(TestBed.inject(FlowPrefsService).prefs().lastTrainer).toBe('deviations');
  });

  // Same reasoning as the Basic Strategy drill: the action grid's colors are
  // the only on-screen verdict, so the live region carries it for screen
  // readers — here including the deviation explanation.
  it('announces the verdict, the expected action, and the deviation reason', () => {
    const { fixture, c } = createPage();
    const live = () =>
      (fixture.nativeElement.querySelector('[role="status"]') as HTMLElement).textContent!;
    expect(live()).toBe('');

    deal(c, SIXTEEN_V_TEN_TC0);
    fixture.detectChanges();
    c.answer('S');
    fixture.detectChanges();
    expect(live()).toBe('Correct: Stand.');

    // Clearing between hands is what makes the next verdict a change the
    // live region will actually announce.
    vi.advanceTimersByTime(ADVANCE_MS);
    fixture.detectChanges();
    expect(live()).toBe('');

    deal(c, SIXTEEN_V_TEN_TC_NEG);
    fixture.detectChanges();
    c.answer('S');
    fixture.detectChanges();
    expect(live()).toContain('Incorrect. Correct: Hit.');
    expect(live().length).toBeGreaterThan('Incorrect. Correct: Hit.'.length);
  });

  it('joins the true count to the question line', () => {
    const { fixture, c } = createPage();
    deal(c, scenarioOf('K', '6', 'Q', 4));
    fixture.detectChanges();
    const q = fixture.nativeElement.querySelector('.drill__question') as HTMLElement;
    expect(q.textContent!.replace(/\s+/g, ' ').trim()).toBe('Hard 16 vs 10 · TC +4');
  });

  describe('deviation grading', () => {
    it('grades the deviation as correct when the threshold is met', () => {
      const { c } = createPage();
      deal(c, SIXTEEN_V_TEN_TC0);
      c.answer('S');
      expect(c.result()!.correct).toBe(true);
      expect(c.result()!.deviationApplied).toBe(true);
      expect(c.phase()).toBe('flash');
    });

    it('grades basic strategy as correct below the threshold', () => {
      const { c } = createPage();
      deal(c, SIXTEEN_V_TEN_TC_NEG);
      c.answer('S');
      expect(c.result()!.correct).toBe(false);
      expect(c.result()!.expectedAction).toBe('H');
      expect(c.phase()).toBe('miss');
    });

    it('shows the deviation explanation in place of the question on a miss', () => {
      const { fixture, c } = createPage();
      deal(c, SIXTEEN_V_TEN_TC0);
      fixture.detectChanges();
      c.answer('H');
      fixture.detectChanges();
      const rule = fixture.nativeElement.querySelector('.drill__rule') as HTMLElement;
      expect(rule.textContent).toContain('Correct: Stand.');
      expect(rule.textContent).toContain('16 v 10 stand @ 0+');
      expect(fixture.nativeElement.querySelector('.drill__question')).toBeNull();
    });

    it('ignores a second answer after the hand has already been graded', () => {
      const { c } = createPage();
      deal(c, SIXTEEN_V_TEN_TC0);
      c.answer('S');
      const firstResult = c.result();

      c.answer('H');

      expect(c.result()).toBe(firstResult);
      expect(c.handsToday()).toBe(1);
    });
  });

  describe('poka-yoke with deviation overlays', () => {
    it('asks for the overlay surrender at a table that deals one', () => {
      lateSurrender(true);
      const { c } = createPage();
      deal(c, SIXTEEN_V_EIGHT_TC4);
      expect(c.legalActions()).toContain('SUR');
      c.answer('SUR');
      expect(c.result()!.correct).toBe(true);
      expect(c.result()!.expectedAction).toBe('SUR');
    });

    // With the rule off there is no surrender to make, and the drill used to
    // both hide nothing and demand it: the button stayed live and the only play
    // on offer — the chart's own hit — was marked wrong.
    it('takes surrender off the grid and out of the answer with the rule off', () => {
      const { c } = createPage();
      deal(c, SIXTEEN_V_EIGHT_TC4);
      expect(c.legalActions()).not.toContain('SUR');
      c.answer('H');
      expect(c.result()!.expectedAction).toBe('H');
      expect(c.result()!.correct).toBe(true);
    });

    it('offers insurance only against an ace and grades it by true count', () => {
      const { c } = createPage();
      deal(c, SIXTEEN_V_TEN_TC0);
      expect(c.legalActions()).not.toContain('INS');

      deal(c, INSURANCE_TC3);
      expect(c.legalActions()).toContain('INS');
      c.answer('INS');
      expect(c.result()!.correct).toBe(true);
      expect(c.result()!.source).toBe('insurance');
    });

    it('declining insurance below +3 is the correct play', () => {
      const { c } = createPage();
      deal(c, NO_INSURANCE_TC0);
      c.answer('INS');
      expect(c.result()!.correct).toBe(false);
      expect(c.result()!.explanation).toContain('Decline insurance');
    });

    it('keeps hotkeys for illegal actions dead', () => {
      const { c } = createPage();
      deal(c, SIXTEEN_V_TEN_TC0); // no ace up, non-pair
      c.onKeyDown(new KeyboardEvent('keydown', { key: 'i' }));
      c.onKeyDown(new KeyboardEvent('keydown', { key: 'p' }));
      expect(c.phase()).toBe('question');
      expect(c.handsToday()).toBe(0);
    });

    it('rejects illegal actions even when called programmatically', () => {
      const { c } = createPage();
      deal(c, SIXTEEN_V_TEN_TC0); // hard hand: Split and Insurance are illegal

      c.answer('P');
      c.answer('INS');

      expect(c.phase()).toBe('question');
      expect(c.result()).toBeNull();
      expect(c.handsToday()).toBe(0);
    });
  });

  describe('recording and session lifecycle', () => {
    it('tallies misses under the deviations trainer', () => {
      const { c } = createPage();
      deal(c, SIXTEEN_V_TEN_TC0);
      c.answer('H');
      const weak = TestBed.inject(MissTallyService).weakSpotFor('deviations');
      expect(weak).toEqual(expect.objectContaining({ label: '16 vs 10', misses: 1 }));
      expect(TestBed.inject(MissTallyService).weakSpotFor('basic-strategy')).toBeNull();
    });

    it('reaches Done at the session target and offers one more round', () => {
      TestBed.inject(FlowPrefsService).setDailyGoal(2);
      const { fixture, c } = createPage();
      for (let i = 0; i < 2; i++) {
        deal(c, SIXTEEN_V_TEN_TC0);
        c.answer('S');
        vi.advanceTimersByTime(ADVANCE_MS);
      }
      fixture.detectChanges();
      expect(c.phase()).toBe('done');
      expect(fixture.nativeElement.querySelector('app-flow-done')).not.toBeNull();

      (fixture.nativeElement.querySelector('.done__again') as HTMLButtonElement).click();
      expect(c.phase()).toBe('question');
      expect(c.target()).toBe(4);
    });

    it('keeps "Drill my misses" inert when there is no weak spot to review', () => {
      TestBed.inject(FlowPrefsService).setDailyGoal(1);
      const { c } = createPage();
      deal(c, SIXTEEN_V_TEN_TC0);
      c.answer('S');
      vi.advanceTimersByTime(ADVANCE_MS);
      expect(c.phase()).toBe('done');

      c.reviewMisses();

      expect(c.phase()).toBe('done');
      expect(TestBed.inject(MissTallyService).weakSpotFor('deviations')).toBeNull();
    });

    // A review round rebuilds the hand from the recorded scenario, which
    // carries no true count of its own — the round's true-count source still
    // has to supply one.
    it('"Drill my misses" deals weak spots carrying a live true count', () => {
      TestBed.inject(FlowPrefsService).updateDeviations({
        trueCountSource: 'manual',
        manualTrueCount: 5,
      });
      TestBed.inject(FlowPrefsService).setDailyGoal(4);
      const { fixture, c } = createPage();
      for (let i = 0; i < 4; i++) {
        deal(c, SIXTEEN_V_TEN_TC0);
        c.answer('H'); // wrong at TC 0 — records 16 vs 10 as the weak spot
        c.onKeyDown(new KeyboardEvent('keydown', { key: ' ' }));
      }
      fixture.detectChanges();
      expect(c.phase()).toBe('done');

      (fixture.nativeElement.querySelector('.done__next') as HTMLButtonElement).click();
      fixture.detectChanges();

      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      for (let i = 0; i < 3; i++) {
        expect(handQuestion(c.scenario().player, c.scenario().dealerUpcard)).toEqual({
          prefix: 'Hard',
          value: '16',
          dealer: '10',
        });
        expect(c.scenario().trueCount).toBe(5);
        c.answer('S');
        vi.advanceTimersByTime(ADVANCE_MS);
        fixture.detectChanges();
      }
    });
  });

  // The count is half a deviation question: 16 vs 10 stands at +2 and hits at
  // −1. A weak spot re-dealt at a fresh count can ask the side the trainee
  // already had right — and three of those would clear it without teaching.
  describe('a weak spot comes back at the count that beat you', () => {
    const HARD_16_V_10 = { kind: 'hard', hand: '16', dealer: '10' } as const;

    it('opens the session at a count the scenario was missed at', () => {
      TestBed.inject(MissTallyService).record('deviations', HARD_16_V_10, false, 3);
      // The fresh-count path would return the bottom of the random range (−5).
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const { c } = createPage();
      expect(c.scenario().trueCount).toBe(3);
    });

    it('draws among every count it was missed at', () => {
      const tally = TestBed.inject(MissTallyService);
      tally.record('deviations', HARD_16_V_10, false, 3);
      tally.record('deviations', HARD_16_V_10, false, -1);
      // Newest first, so the last roll of the draw lands on the older count.
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      const { c } = createPage();
      expect(c.scenario().trueCount).toBe(3);
    });

    it('records the count the miss was actually made at', () => {
      const { c } = createPage();
      deal(c, SIXTEEN_V_TEN_TC_NEG); // hits at −2; standing is wrong
      c.answer('S');
      expect(TestBed.inject(MissTallyService).weakSpotFor('deviations')!.missedCounts).toEqual([
        -2,
      ]);
    });

    it('falls back to a fresh count for a spot recorded without one', () => {
      TestBed.inject(MissTallyService).record('deviations', HARD_16_V_10, false);
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const { c } = createPage();
      expect(c.scenario().trueCount).toBe(-5);
    });
  });

  // An index is written against a total, so it applies to a three-card 16
  // exactly as it does to a two-card one. The showdown has always graded that;
  // this is the drill that teaches it.
  describe('playing the hand out', () => {
    // Hard 12 vs 10 hits at any count; the 4 makes it the hard 16 the
    // Illustrious 18 stands at TC 0 or higher.
    const TWELVE_V_TEN = scenarioOf('10', '2', 'Q', 0);

    function hitInto16(c: Internals): void {
      deal(c, TWELVE_V_TEN);
      nextCardIs('4');
      c.answer('H');
      vi.advanceTimersByTime(ADVANCE_MS);
    }

    it('applies a hard-total index to a hand three cards deep', () => {
      const { fixture, c } = createPage();
      hitInto16(c);
      fixture.detectChanges();

      expect(c.hand().length).toBe(3);
      const q = fixture.nativeElement.querySelector('.drill__question') as HTMLElement;
      expect(q.textContent!.replace(/\s+/g, ' ').trim()).toContain('Hard 16 vs 10');

      c.answer('S');
      expect(c.result()!.correct).toBe(true);
      expect(c.result()!.deviationApplied).toBe(true);
      expect(c.result()!.explanation).toContain('Hi-Lo deviation');
    });

    it('grades the same three-card 16 the other way one count lower', () => {
      const { c } = createPage();
      deal(c, scenarioOf('10', '2', 'Q', -1));
      nextCardIs('4');
      c.answer('H');
      vi.advanceTimersByTime(ADVANCE_MS);

      c.answer('S');
      expect(c.result()!.correct).toBe(false);
      expect(c.result()!.expectedAction).toBe('H');
    });

    it('leaves only hit and stand answerable once a card is drawn', () => {
      const { fixture, c } = createPage();
      hitInto16(c);
      fixture.detectChanges();
      expect(c.legalActions()).toEqual(['H', 'S']);
    });

    it('holds a bust on screen, then deals on', () => {
      const { fixture, c } = createPage();
      deal(c, TWELVE_V_TEN);
      nextCardIs('K');
      c.answer('H');
      vi.advanceTimersByTime(ADVANCE_MS);
      fixture.detectChanges();

      expect(c.phase()).toBe('over');
      expect((fixture.nativeElement.querySelector('.drill__rule') as HTMLElement).textContent).toBe(
        'Bust — 22.',
      );

      vi.advanceTimersByTime(ADVANCE_MS * 2);
      expect(c.phase()).toBe('question');
      expect(c.hand().length).toBe(2);
    });

    // A `ScenarioRef` names a two-card hand, and it carries no count of its own.
    it('files no weak spot for a decision deeper than the deal', () => {
      const { c } = createPage();
      hitInto16(c);
      c.answer('H'); // wrong: the index stands this 16
      expect(c.phase()).toBe('miss');
      expect(TestBed.inject(MissTallyService).weakSpotFor('deviations')).toBeNull();
    });

    it('deals a fresh hand instead when the setting is off', () => {
      TestBed.inject(FlowPrefsService).setPlayHandsOut(false);
      const { c } = createPage();
      hitInto16(c);
      expect(c.hand().length).toBe(2);
      expect(c.hand()).toEqual(c.scenario().player);
    });
  });

  // The chart's own pair deviations say to split — T,T v 6 at +4 is one of
  // them — and the drill used to grade that answer and then deal something
  // else, so the hands the deviation makes were never played.
  describe('playing a split out', () => {
    // T,T v 6: stand by basic strategy, split at TC +4 or higher.
    const TENS_V_SIX_TC4 = scenarioOf('10', '10', '6', 4);
    // 8,8 is a split at every count; a 7 on top of one makes the hard 15 v 10
    // the chart stands at +4 and hits below.
    const EIGHTS_V_TEN_TC4 = scenarioOf('8', '8', 'Q', 4);
    const EIGHTS_V_TEN_TC0 = scenarioOf('8', '8', 'Q', 0);

    function splitOnce(c: Internals, rank: Rank): void {
      nextCardIs(rank);
      c.answer('P');
      vi.advanceTimersByTime(ADVANCE_MS);
    }

    it('plays out the split a pair deviation called for', () => {
      const { fixture, c } = createPage();
      deal(c, TENS_V_SIX_TC4);
      nextCardIs('6');
      c.answer('P');
      expect(c.result()!.correct).toBe(true);
      expect(c.result()!.deviationApplied).toBe(true);

      vi.advanceTimersByTime(ADVANCE_MS);
      fixture.detectChanges();
      expect(c.handLabel()).toBe('Hand 1 of 2');
      expect(c.phase()).toBe('question');
    });

    // An index is written against a total, so it reads a hand a split made
    // exactly as it reads one a hit made.
    it('applies an index to the hand the split made', () => {
      const { c } = createPage();
      deal(c, EIGHTS_V_TEN_TC4);
      splitOnce(c, '7'); // hard 15 vs 10 at TC +4

      c.answer('S');
      expect(c.result()!.correct).toBe(true);
      expect(c.result()!.deviationApplied).toBe(true);
      expect(c.result()!.basicAction).toBe('H');
    });

    it('grades that same 15 the other way below the index', () => {
      const { c } = createPage();
      deal(c, EIGHTS_V_TEN_TC0);
      splitOnce(c, '7');

      c.answer('S');
      expect(c.result()!.correct).toBe(false);
      expect(c.result()!.expectedAction).toBe('H');
    });

    // Surrender is a first-two-cards action of the hand the dealer dealt, so a
    // table that offers it still does not offer it on a hand out of a split.
    it('takes the surrender overlay off a hand out of a split', () => {
      lateSurrender(true);
      const { c } = createPage();
      deal(c, EIGHTS_V_TEN_TC4);
      expect(c.legalActions()).toContain('SUR');

      splitOnce(c, '7');
      expect(c.legalActions()).toEqual(['H', 'S']);
    });

    // A `ScenarioRef` names the two cards that were dealt, and it carries the
    // count they were missed at. The 15 a split made is neither.
    it('files no weak spot for a decision on a hand out of a split', () => {
      const { c } = createPage();
      deal(c, EIGHTS_V_TEN_TC4);
      splitOnce(c, '7');
      c.answer('H'); // wrong: the index stands this 15
      expect(c.phase()).toBe('miss');
      expect(TestBed.inject(MissTallyService).weakSpotFor('deviations')).toBeNull();
    });

    it('deals a fresh hand instead when the setting is off', () => {
      TestBed.inject(FlowPrefsService).setPlayHandsOut(false);
      const { c } = createPage();
      deal(c, EIGHTS_V_TEN_TC4);
      splitOnce(c, '7');
      expect(c.hands().length).toBe(1);
      expect(c.hand()).toEqual(c.scenario().player);
    });
  });

  // The deviation chart lists the hands worth knowing by name; until now it
  // could say what each index is and nothing about practising it.
  describe('drilling one hand from the chart', () => {
    function enterWith(hand: string): {
      fixture: ComponentFixture<DeviationsDrillPageComponent>;
      c: Internals;
    } {
      TestBed.overrideProvider(ActivatedRoute, {
        useValue: { snapshot: { queryParamMap: convertToParamMap({ hand }) } },
      });
      return createPage();
    }

    it('deals the pinned hand every time and says so', () => {
      const { fixture, c } = enterWith('hard-16-v-10');
      expect(
        (fixture.nativeElement.querySelector('.drill__advisory') as HTMLElement).textContent,
      ).toContain('16 vs 10');

      for (let i = 0; i < 3; i++) {
        expect(handQuestion(c.scenario().player, c.scenario().dealerUpcard)).toEqual({
          prefix: 'Hard',
          value: '16',
          dealer: '10',
        });
        c.answer('S');
        vi.advanceTimersByTime(ADVANCE_MS);
        fixture.detectChanges();
        if (c.phase() === 'miss') {
          c.onKeyDown(new KeyboardEvent('keydown', { key: ' ' }));
          fixture.detectChanges();
        }
      }
    });

    // The hand is pinned; the count is not. Both sides of an index have to come
    // up, or the round only ever asks the half you already know.
    it('leaves the count to the settings, so both sides of the index come up', () => {
      // Driven rather than left to chance: what is asserted is that each deal
      // draws its own count, not that a real RNG happened to produce two.
      const draws = [0, 0.99, 0.5];
      let next = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => draws[next++ % draws.length]);

      const counts: number[] = [];
      const { fixture, c } = enterWith('hard-16-v-10');
      for (let i = 0; i < 3; i++) {
        counts.push(c.scenario().trueCount);
        c.answer('S');
        vi.advanceTimersByTime(ADVANCE_MS);
        fixture.detectChanges();
        if (c.phase() === 'miss') {
          c.onKeyDown(new KeyboardEvent('keydown', { key: ' ' }));
          fixture.detectChanges();
        }
      }
      expect(new Set(counts).size).toBeGreaterThan(1);
    });

    it('treats a hand it cannot deal as an ordinary round', () => {
      const { fixture } = enterWith('soft-99-v-Q');
      expect(fixture.nativeElement.querySelector('.drill__advisory')).toBeNull();
    });
  });

  describe('scenario generation from prefs', () => {
    it('uses the manual true count when configured', () => {
      const prefs = TestBed.inject(FlowPrefsService);
      prefs.updateDeviations({ trueCountSource: 'manual', manualTrueCount: 5 });
      const { c } = createPage();
      expect(c.scenario().trueCount).toBe(5);
      // Advance through a hand — the next deal keeps the manual count.
      c.answer(c.scenario().trueCount === 5 ? 'H' : 'S'); // any legal action
      vi.advanceTimersByTime(ADVANCE_MS);
      if (c.phase() === 'miss') {
        c.onKeyDown(new KeyboardEvent('keydown', { key: ' ' }));
      }
      expect(c.scenario().trueCount).toBe(5);
    });

    it('marks deviation-only scenarios as candidates', () => {
      const prefs = TestBed.inject(FlowPrefsService);
      prefs.updateDeviations({ practiceMode: 'deviation-only' });
      const { c } = createPage();
      expect(c.scenario().generatedAsDeviationCandidate).toBe(true);
    });
  });

  describe('keyboard safety', () => {
    it('ignores auto-repeated action keys', () => {
      const { c } = createPage();
      deal(c, SIXTEEN_V_TEN_TC0);

      c.onKeyDown(new KeyboardEvent('keydown', { key: 's', repeat: true }));

      expect(c.phase()).toBe('question');
      expect(c.handsToday()).toBe(0);
    });

    it('ignores action keys from editable controls', () => {
      const { c } = createPage();
      deal(c, SIXTEEN_V_TEN_TC0);
      const input = document.createElement('input');
      document.body.append(input);

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
      input.remove();

      expect(c.phase()).toBe('question');
      expect(c.handsToday()).toBe(0);
    });
  });

  // The drill grades against Hi-Lo indices whatever the counting trainer is
  // set to. Silence there would have a Wong Halves counter drilling numbers
  // their count never produces.
  describe('counting-system advisory', () => {
    const advisory = (fixture: ComponentFixture<DeviationsDrillPageComponent>) =>
      fixture.nativeElement.querySelector('.drill__advisory') as HTMLElement | null;

    it('stays quiet for a Hi-Lo counter', () => {
      const { fixture } = createPage();
      expect(advisory(fixture)).toBeNull();
    });

    it('names the mismatched system for every hand of the round', () => {
      TestBed.inject(FlowPrefsService).updateCounting({ systemId: 'wong-halves' });
      const { fixture, c } = createPage();

      expect(advisory(fixture)!.textContent).toContain('Wong Halves');
      expect(advisory(fixture)!.textContent).toContain('Hi-Lo');

      // Still up after answering, not a one-off shown on the first hand.
      deal(c, SIXTEEN_V_TEN_TC0);
      fixture.detectChanges();
      c.answer('S');
      vi.advanceTimersByTime(ADVANCE_MS);
      fixture.detectChanges();
      expect(advisory(fixture)).not.toBeNull();
    });

    it('says nothing for a stored system id this build no longer ships', () => {
      TestBed.inject(FlowPrefsService).updateCounting({ systemId: 'does-not-exist' });
      const { fixture } = createPage();
      // That id resolves to Hi-Lo everywhere, so there is no mismatch to warn about.
      expect(advisory(fixture)).toBeNull();
    });
  });
});
