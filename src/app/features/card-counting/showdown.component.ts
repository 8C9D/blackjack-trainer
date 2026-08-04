import {
  Component,
  HostListener,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import {
  ACTION_KEY_HINTS,
  handleTrainerKeydown,
  shouldIgnoreKeyboardEvent,
} from '../../core/keyboard';
import {
  betOptionsFor,
  MIN_BET,
  clampBet,
  handPayout,
  insuranceCost,
  insurancePayout,
  stakeFor,
  surrenderForfeit,
} from '../../core/models/bankroll.model';
import {
  BET_RAMP_BAND_LABELS,
  betRampBandIndex,
  betUnitsForTrueCount,
  DEFAULT_BET_RAMP,
  type BetRamp,
} from '../../core/models/bet-ramp.model';
import { formatSignedCount } from '../../core/models/card-counting.model';
import { cardHighValue, isAce, type Card } from '../../core/models/card.model';
import { cardCountValue, type CountingSystem } from '../../core/models/counting-system.model';
import { deviationIndexNote } from '../../core/models/deviation.model';
import { handTotal, isBlackjack, isBust } from '../../core/models/hand.model';
import { Shoe } from '../../core/models/shoe.model';
import {
  clampSpots,
  countBasisFor,
  insuranceIsCorrect,
  trueCountFor,
  minCardsForSpots,
  playDealerHand,
  settle,
  type CountBasis,
  type Settlement,
  type ShowdownOutcome,
} from '../../core/models/showdown.model';
import {
  ACTION_LABELS,
  DEFAULT_ENGINE_OPTIONS,
  type Action,
  type EngineOptions,
  type RuleSet,
} from '../../core/models/strategy.model';
import { HI_LO } from '../../data/counting-systems';
import { CardImageComponent } from '../../shared/card-image.component';
import { BankrollService } from '../../core/services/bankroll.service';
import {
  BasicStrategyEngineService,
  normalizeUpcardKey,
  type EngineInput,
  type PlayInput,
} from '../../core/services/basic-strategy-engine.service';
import {
  DeviationEngineService,
  type PlayDeviationDecision,
} from '../../core/services/deviation-engine.service';
import {
  MissTallyService,
  scenarioRefFor,
  type TalliedTrainer,
} from '../../core/services/miss-tally.service';
import { BetSpreadStatsService } from '../../core/services/bet-spread-stats.service';
import { CardCountingStatsService } from '../../core/services/card-counting-stats.service';
import { CountingEngineService } from '../../core/services/counting-engine.service';
import { ShowdownPlayStatsService } from '../../core/services/showdown-play-stats.service';
import { ShowdownStatsService } from '../../core/services/showdown-stats.service';
import { CountAnswerFormComponent } from './count-answer-form.component';
import { countOf } from '../../core/text';

// 'player-turn': the player is acting on the active hand. 'resolved': every hand
// is settled and the dealer hand revealed. 'exhausted': the shoe ran too low.
// 'betting' and 'insurance' only occur when bet sizing is on: the round waits
// for a bet before any card is dealt (the whole point of practising against the
// count), and a dealer ace pauses the deal on the insurance decision before the
// hole card is checked. 'count-check' is the way out: the table asks what the
// cards it dealt did to the count before handing the shoe back.
type ShowdownPhase =
  | 'betting'
  | 'insurance'
  | 'player-turn'
  | 'resolved'
  | 'exhausted'
  | 'count-check';

// Most a pair can be split to (3 splits → 4 hands), the common casino cap. The
// cap is per box: occupying three boxes does not shrink any one box's splits.
const MAX_HANDS_PER_BOX = 4;

// One player hand in the showdown. Hands come from two places: the opening deal
// gives one per occupied box, and splitting a pair turns one hand into several.
// Either way each is played and settled independently against the one dealer.
interface PlayerHand {
  readonly cards: readonly Card[];
  // Which box (0-based) this hand belongs to. Splits stay in their box, so the
  // four-hand cap counts only the hands sharing a box.
  readonly box: number;
  // Chips this hand has up. Every box posts the round's bet, and a split puts a
  // second bet on the new hand — so a split doubles the box's exposure, exactly
  // as at a table. Zero when betting is off.
  readonly bet: number;
  // Doubled: took exactly one card at a doubled stake.
  readonly doubled: boolean;
  // A split-ace hand takes exactly one card, then stands (no hit/double/re-split).
  readonly isSplitAce: boolean;
  // Came out of a split. A 21 on such a hand is not a natural and pays even
  // money — tracked per hand rather than inferred from the hand count, because
  // multiple boxes also produce multiple hands without any split involved.
  readonly fromSplit: boolean;
  // Gave up the hand as a first decision, forfeiting half the bet. The dealer
  // owes this hand nothing, so it settles as a loss the moment it surrenders.
  readonly surrendered: boolean;
  // Finished acting (stood, busted, doubled, or a completed split ace).
  readonly done: boolean;
  readonly settlement: Settlement | null;
}

function freshHand(
  cards: readonly Card[],
  origin: { box: number; bet: number; isSplitAce?: boolean; fromSplit?: boolean },
): PlayerHand {
  return {
    cards,
    box: origin.box,
    bet: origin.bet,
    doubled: false,
    isSplitAce: origin.isSplitAce ?? false,
    fromSplit: origin.fromSplit ?? false,
    surrendered: false,
    done: false,
    settlement: null,
  };
}

// The verdict on one decision at the table, as the felt shows it. The headline
// is a sentence rather than an Action because not every decision here is one:
// declining insurance is a correct play with no action to name.
interface PlayVerdict {
  readonly correct: boolean;
  readonly headline: string;
  readonly reason: string;
}

// Post-count showdown: deals one to three boxes from the persistent shoe the
// player just counted, plays each hit/stand/double/split in turn (re-splits to
// four hands; split aces take one card), auto-plays the dealer once by the
// active RuleSet (from the shared table rules), and settles every hand
// win/lose/push (3:2 naturals). A box's original two cards may also late-
// surrender for half the bet when the shared LS rule is enabled (the peek has
// already settled any dealer natural).
// With bet sizing on, a dealer ace additionally offers insurance (half each
// bet, pays 2:1) before the hole card is checked — the classic count-driven
// side bet.
@Component({
  selector: 'app-showdown',
  imports: [CardImageComponent, CountAnswerFormComponent],
  template: `
    <section class="showdown" aria-label="Showdown vs dealer">
      <header class="showdown__header">
        <h2 class="showdown__heading">
          {{
            spots() > 1 ? 'Play ' + spots() + ' hands vs the dealer' : 'Play a hand vs the dealer'
          }}
        </h2>
      </header>

      <!-- The indices are Hi-Lo numbers, so a trainee counting anything else has
           to be told what this table can and cannot say about their play — the
           same advisory the Deviations drill, the chart and Settings carry. -->
      @if (indexNote(); as note) {
        <p class="showdown__index-note">{{ note }}</p>
      }

      @if (betting()) {
        <p class="showdown__bankroll">
          Bankroll <strong>{{ chips(bankrollService.bankroll()) }}</strong>
          @if (bankrollService.state().wagered > 0) {
            <span class="showdown__bankroll-net">
              (wagered {{ chips(bankrollService.state().wagered) }}, net
              {{ signedChips(bankrollService.state().net) }})
            </span>
          }
        </p>
      }

      @if (phase() === 'count-check') {
        <!-- The one thing this table has never asked. It has been keeping the
             count for the player all along — every verdict here rests on it —
             and holding it through played-out hands is the skill the screen is
             for, so the way out is through it. -->
        <div class="showdown__count-check">
          <p class="showdown__bet-prompt">
            {{ countOf(cardsSeen(), 'card') }} came out at this table. Take the count with you.
          </p>
          @if (holeCardUnseen()) {
            <!-- Leaving before the peek: the hole card was dealt but never
                 turned over, so it is out of this number and out of the count
                 that leaves with you — a burn card, in effect. -->
            <p class="showdown__count-note">
              The dealer's hole card was never turned over, so it is in neither.
            </p>
          }
          @if (countVerdict(); as v) {
            <p
              class="showdown__coach"
              [class.showdown__coach--wrong]="!v.correct"
              role="status"
              aria-live="polite"
            >
              @if (v.correct) {
                <b>Correct.</b> {{ v.reason }}
              } @else {
                <b>{{ v.headline }}</b> {{ v.reason }}
              }
            </p>
            <button type="button" class="showdown__next" (click)="leaveTable()">
              Back to counting <span class="accent-hint">[Enter]</span>
            </button>
          } @else {
            <app-count-answer-form
              [allowFractions]="fractionalCount()"
              (answer)="onCountCheck($event)"
            />
          }
        </div>
      } @else if (phase() === 'exhausted') {
        <p class="showdown__exhausted" role="status">
          The shoe is too low to deal a hand. Return to counting to reshuffle.
        </p>
      } @else if (phase() === 'betting') {
        @if (bankrollService.bustedOut()) {
          <p class="showdown__exhausted" role="status">
            Out of chips. Reset the bankroll to keep practising.
          </p>
          <button type="button" class="showdown__next" (click)="resetBankroll()">
            Reset bankroll
          </button>
        } @else {
          <div class="showdown__betting">
            <p class="showdown__bet-prompt">
              {{
                spots() > 1
                  ? 'Size the bet for each of the ' + spots() + ' boxes.'
                  : 'Size the bet before the deal.'
              }}
            </p>
            <div class="showdown__bets" role="group" aria-label="Bet size">
              @for (option of betOptions(); track option) {
                <button
                  type="button"
                  class="showdown__bet"
                  [class.showdown__bet--active]="option === bet()"
                  [attr.aria-pressed]="option === bet()"
                  [disabled]="!betAffordable(option)"
                  (click)="setBet(option)"
                >
                  {{ option }}
                </button>
              }
            </div>
            <p class="showdown__note">
              {{
                spots() > 1
                  ? 'Total at risk this round: ' + chips(bet() * spots())
                  : 'At risk this round: ' + chips(bet())
              }}
            </p>
            <button type="button" class="showdown__next" (click)="dealAfterBet()">
              Deal <span class="accent-hint">[Enter]</span>
            </button>
          </div>
        }
      } @else {
        <div class="showdown__table">
          <section class="showdown__hand" aria-label="Dealer hand">
            <h3 class="showdown__label">
              Dealer
              @if (phase() === 'resolved') {
                <span class="showdown__total">({{ dealerTotal() }})</span>
              }
            </h3>
            <div class="showdown__cards">
              @if (phase() === 'resolved') {
                @for (c of dealerCards(); track $index) {
                  <app-card-image [card]="c" />
                }
              } @else {
                <app-card-image [card]="dealerUpcard()" />
                <app-card-image [faceDown]="true" />
              }
            </div>
          </section>

          @for (h of hands(); track $index; let i = $index) {
            <section
              class="showdown__hand showdown__hand--player"
              [class.showdown__hand--active]="phase() === 'player-turn' && i === activeIndex()"
              [attr.aria-label]="hands().length > 1 ? 'Your hand ' + (i + 1) : 'Your hand'"
            >
              <h3 class="showdown__label">
                {{ hands().length > 1 ? 'Hand ' + (i + 1) : 'You' }}
                <span class="showdown__total">({{ total(h) }})</span>
                @if (betting()) {
                  <span class="showdown__stake">{{ chips(stake(h)) }}</span>
                }
              </h3>
              <div class="showdown__cards">
                @for (c of h.cards; track $index) {
                  <app-card-image [card]="c" />
                }
              </div>
              @if (h.settlement; as s) {
                <p
                  class="showdown__verdict"
                  [class.showdown__verdict--win]="s.outcome === 'win'"
                  [class.showdown__verdict--lose]="s.outcome === 'lose'"
                  [class.showdown__verdict--push]="s.outcome === 'push'"
                  role="status"
                >
                  {{ verdict(h) }}
                  @if (betting()) {
                    <span class="showdown__payout">{{ signedChips(payout(h)) }}</span>
                  }
                </p>
              }
            </section>
          }
        </div>

        @if (phase() === 'insurance') {
          <div class="showdown__insurance" role="group" aria-label="Insurance">
            <p class="showdown__bet-prompt">
              Dealer shows an ace. Insurance costs {{ chips(insuranceTotal()) }} (half
              {{ hands().length > 1 ? 'each bet' : 'the bet' }}) and pays 2:1 on a dealer blackjack.
            </p>
            <div class="showdown__actions">
              <button type="button" class="showdown__action" (click)="takeInsurance()">
                Take insurance <kbd class="kcap">I</kbd>
              </button>
              <button type="button" class="showdown__action" (click)="declineInsurance()">
                No insurance <kbd class="kcap">N</kbd>
              </button>
            </div>
          </div>
        }

        @if (insuranceNet() !== null) {
          <p class="showdown__note" role="status">
            {{ insuranceNet()! > 0 ? 'Insurance paid 2:1' : 'Insurance lost' }}
            <span class="showdown__payout">{{ signedChips(insuranceNet()!) }}</span>
          </p>
        }

        @if (phase() === 'player-turn') {
          <div class="showdown__actions" role="group" aria-label="Player actions">
            @for (a of playerActions(); track a) {
              <button type="button" class="showdown__action" (click)="onAction(a)">
                {{ labelFor(a) }} <kbd class="kcap">{{ keyFor(a) }}</kbd>
              </button>
            }
          </div>
        }

        <!-- The verdict on the last decision. The play still stands — this is
             a table, not a quiz — so it coaches rather than blocks. -->
        @if (lastPlay(); as v) {
          <p
            class="showdown__coach"
            [class.showdown__coach--wrong]="!v.correct"
            role="status"
            aria-live="polite"
          >
            @if (v.correct) {
              <b>Correct.</b> {{ v.reason }}
            } @else {
              <b>{{ v.headline }}</b> {{ v.reason }}
            }
          </p>
        }

        @if (phase() === 'resolved') {
          <section class="showdown__result" role="status">
            @if (roundMistakes().length > 0) {
              <div class="showdown__misplays">
                <p class="showdown__misplays-head">
                  {{
                    roundMistakes().length === 1
                      ? 'One misplay'
                      : roundMistakes().length + ' misplays'
                  }}
                  this round
                </p>
                <ul class="showdown__misplay-list">
                  @for (m of roundMistakes(); track $index) {
                    <li>{{ m }}</li>
                  }
                </ul>
              </div>
            }
            @if (roundSummary(); as summary) {
              <p class="showdown__summary">
                {{ summary }}
                @if (betting()) {
                  <span class="showdown__payout">{{ signedChips(roundNet()) }}</span>
                }
              </p>
            }
            <button
              type="button"
              class="showdown__next"
              [disabled]="!canDealAnother()"
              (click)="dealAnother()"
            >
              {{ spots() > 1 ? 'Deal another round' : 'Deal another hand' }}
              <span class="accent-hint">[Enter]</span>
            </button>
            @if (!canDealAnother()) {
              <p class="showdown__note">
                @if (cutCardOut()) {
                  The cut card is out — that was the shoe's last
                  {{ spots() > 1 ? 'round' : 'hand' }}. Return to counting to reshuffle.
                } @else {
                  {{
                    spots() > 1
                      ? 'Shoe too low for another round — return to counting to reshuffle.'
                      : 'Shoe too low for another hand — return to counting to reshuffle.'
                  }}
                }
              </p>
            }
          </section>
        }
      }

      @if (phase() !== 'count-check') {
        <button type="button" class="showdown__exit" (click)="returnToCounting()">
          Back to counting
        </button>
      }
    </section>
  `,
  styleUrl: './showdown.component.scss',
})
export class ShowdownComponent implements OnInit {
  // Templates can only call class members, so the shared counted-noun
  // helper is re-exposed rather than imported into the markup.
  protected readonly countOf = countOf;

  // Records win/loss tallies under its pre-Flow key even though the Flow UI
  // no longer surfaces them.
  protected readonly stats = inject(ShowdownStatsService);
  // The persisted chip position, only touched when betting is on.
  protected readonly bankrollService = inject(BankrollService);
  // Accuracy of the playing decisions, recorded whether or not chips are on.
  private readonly playStats = inject(ShowdownPlayStatsService);
  private readonly engine = inject(BasicStrategyEngineService);
  private readonly deviations = inject(DeviationEngineService);
  // Misplays here feed the same weak-spot tallies the drills keep — Basic
  // Strategy's, or Deviations' when the miss was an index play.
  private readonly missTally = inject(MissTallyService);
  // The bet at this table is the same skill the bet-spread drill measures.
  private readonly betSpreadStats = inject(BetSpreadStatsService);
  // And the count carried off it is the same skill the running-count drill does.
  private readonly countStats = inject(CardCountingStatsService);
  private readonly countingEngine = inject(CountingEngineService);

  // The persistent shoe the player just counted; the showdown deals from it so
  // its depletion carries back to the counting drill.
  readonly shoe = input.required<Shoe>();
  readonly ruleSet = input.required<RuleSet>();
  // Player-action availability follows the same DAS / LS table rules as the
  // strategy trainers. Initial-hand doubling and splitting remain available;
  // DAS only gates doubling a hand that came from a split.
  readonly options = input<EngineOptions>(DEFAULT_ENGINE_OPTIONS);
  // Boxes to occupy on the opening deal (1–3). One dealer plays against all.
  readonly spots = input(1, { transform: clampSpots });
  // The system being counted and the running count carried in from the drill.
  // Together with the shoe's depletion they are what the count-dependent
  // decisions at this table are graded against.
  readonly system = input<CountingSystem>(HI_LO);
  readonly entryRunningCount = input(0);
  // The spread the player configured. It is both the rungs the bet control
  // offers and what the bet is graded against.
  readonly betRamp = input<BetRamp>(DEFAULT_BET_RAMP);
  // Bet sizing: when on, each round opens on a bet and settles against a
  // persisted bankroll. Off (the default) the showdown is the pure hand tally it
  // has always been, and no chip figure is shown.
  readonly betting = input(false);
  // Ask for the running count on the way out. On by default: this table has
  // been keeping the count for the player, and holding it through played-out
  // hands is the skill they came here for.
  readonly countCheck = input(true);

  // Emitted when the player returns to the counting drill, carrying every card
  // this showdown turned face up (in order) so the drill can fold their
  // running-count value back into the shoe's carried count — the cards really
  // left the shoe. A hole card never turned over is the one exclusion; see
  // `seenCards`.
  readonly exit = output<readonly Card[]>();

  // Every card dealt during this showdown session; `seenCards()` is what the
  // exit carries back.
  private readonly dealt: Card[] = [];

  // The count as the player can actually see it: the count carried in from the
  // drill plus every card this showdown has turned face up. The dealer's hole
  // card is deliberately excluded until the round resolves and turns it over —
  // insurance is decided before it is seen, and grading against a card the
  // player cannot see would be grading a different game.
  private readonly visibleRunningCount = signal(0);
  // Index into `dealt` of the hole card still face down, or null when the round
  // has none outstanding. An index rather than the card itself because `dealt`
  // is what leaves with the player, and the one card that must not is this one.
  private pendingHoleIndex: number | null = null;

  protected readonly countBasis = computed(() =>
    countBasisFor(this.system(), this.visibleRunningCount(), this.shoe().decksRemaining),
  );

  // What this table cannot say about this trainee's play, and why. A playing
  // index is a Hi-Lo true count, so every other system is graded on basic
  // strategy alone — said once here rather than left to be inferred from
  // verdicts that quietly never mention an index.
  //
  // The reason is the shared advisory the Deviations drill, the chart and
  // Settings already show; only the consequence at this table is added.
  protected readonly indexNote = computed(() => {
    const basis = this.countBasis();
    if (basis.kind === 'true-count') return null;
    const note = deviationIndexNote(this.system());
    if (note === null) return null;
    const graded =
      basis.kind === 'running-count'
        ? ` Hands here are graded on basic strategy, and the insurance call against ${this.system().name}'s own running-count trigger.`
        : ' Hands here are graded on basic strategy alone, and the insurance call is left ungraded.';
    return note + graded;
  });

  // The true count the bet is graded on — this system's own, not Hi-Lo's.
  private readonly betTrueCount = computed(() =>
    trueCountFor(this.system(), this.visibleRunningCount(), this.shoe().decksRemaining),
  );

  protected readonly hands = signal<readonly PlayerHand[]>([]);
  protected readonly activeIndex = signal(0);
  protected readonly dealerCards = signal<readonly Card[]>([]);
  protected readonly phase = signal<ShowdownPhase>('player-turn');
  // The bet each box posts for the coming round. Starts at the table minimum so
  // the spread is the player's decision, not a default.
  protected readonly bet = signal(MIN_BET);
  // Net chips of the round just resolved, for the result line.
  protected readonly roundNet = signal(0);
  // Verdict on the most recent playing decision, shown until the next one
  // replaces it. Null before the first decision of a round.
  protected readonly lastPlay = signal<PlayVerdict | null>(null);
  // Verdict on the count carried off the table, once it has been answered.
  protected readonly countVerdict = signal<PlayVerdict | null>(null);
  // Every misplay of the round just dealt, named in the result panel — a
  // verdict that scrolls past as the next hand is played would be no use.
  protected readonly roundMistakes = signal<readonly string[]>([]);
  // Net chips the round's insurance bet returned, or null when no insurance was
  // taken. Settled the moment the hole card is checked, before play continues.
  protected readonly insuranceNet = signal<number | null>(null);
  // Mirror of the shoe's remaining card count, refreshed after every draw so the
  // "deal another" gate reacts to depletion.
  protected readonly remaining = signal(0);

  protected readonly activeHand = computed<PlayerHand | null>(
    () => this.hands()[this.activeIndex()] ?? null,
  );

  // Chips already committed to the felt this round. Only the bankroll's free
  // chips can back another bet, so a double or split has to fit inside them.
  protected readonly committed = computed(() =>
    this.hands().reduce((sum, h) => sum + stakeFor(h.bet, h.doubled), 0),
  );
  private canPostAnotherBet(h: PlayerHand): boolean {
    if (!this.betting()) return true;
    return this.bankrollService.bankroll() - this.committed() >= h.bet;
  }

  // What insuring every box costs: half of each box's bet.
  protected readonly insuranceTotal = computed(() =>
    this.hands().reduce((sum, h) => sum + insuranceCost(h.bet), 0),
  );
  // Insurance is only offered when the bankroll's free chips can back it, the
  // same rule a double or split follows.
  private canAffordInsurance(): boolean {
    return this.bankrollService.bankroll() - this.committed() >= this.insuranceTotal();
  }

  // Actions apply to the active hand. Double: any fresh two-card hand (including
  // after a split), if the bankroll can back the second bet. Split: a fresh
  // two-card pair, under the box's four-hand cap, likewise backed.
  protected readonly canDouble = computed(() => {
    const h = this.activeHand();
    return (
      this.phase() === 'player-turn' &&
      h !== null &&
      h.cards.length === 2 &&
      !h.isSplitAce &&
      (!h.fromSplit || this.options().doubleAfterSplit) &&
      this.remaining() >= 1 &&
      this.canPostAnotherBet(h)
    );
  });
  protected readonly canSplit = computed(() => {
    const h = this.activeHand();
    return (
      this.phase() === 'player-turn' &&
      h !== null &&
      h.cards.length === 2 &&
      !h.isSplitAce &&
      isPair(h.cards) &&
      this.handsInBox(h.box) < MAX_HANDS_PER_BOX &&
      this.remaining() >= 1 &&
      this.canPostAnotherBet(h)
    );
  });
  // Late surrender: a box's original two cards may be given up for half the
  // bet. Never after a split, and the option lapses once a card is drawn. By
  // the time a hand is played the peek has already settled any dealer natural,
  // which is exactly the "late" in late surrender.
  protected readonly canSurrender = computed(() => {
    const h = this.activeHand();
    return (
      this.options().lateSurrender &&
      this.phase() === 'player-turn' &&
      h !== null &&
      h.cards.length === 2 &&
      !h.fromSplit
    );
  });
  protected readonly playerActions = computed<readonly Action[]>(() => {
    const actions: Action[] = ['H', 'S'];
    if (this.canDouble()) actions.push('D');
    if (this.canSplit()) actions.push('P');
    if (this.canSurrender()) actions.push('SUR');
    return actions;
  });

  protected readonly dealerTotal = computed(() => handTotal(this.dealerCards()));
  protected readonly dealerUpcard = computed<Card | null>(() => this.dealerCards()[0] ?? null);
  // A table deals no round past the cut card: the round in progress when it
  // surfaces is the shoe's last, and the next one is off a fresh shoe. Dealing
  // on would also divide the true count by a sliver of a shoe — a +2 over a
  // tenth of a deck reads as +20 — and grade bets and index plays against
  // counts no casino ever deals.
  protected readonly cutCardOut = computed(() => {
    // `remaining` is the reactive mirror of the shoe, which is mutated in
    // place: reading it first is what makes this re-evaluate as cards leave,
    // and `needsReshuffle` can only change when they do.
    this.remaining();
    return this.shoe().needsReshuffle;
  });

  protected readonly canDealAnother = computed(
    () => !this.cutCardOut() && this.remaining() >= minCardsForSpots(this.spots()),
  );

  // Backward-compatible views of the active/first hand for the single-hand path.
  protected readonly playerCards = computed<readonly Card[]>(() => this.activeHand()?.cards ?? []);
  protected readonly playerTotal = computed(() => handTotal(this.playerCards()));
  protected readonly settlement = computed<Settlement | null>(
    () => this.hands()[0]?.settlement ?? null,
  );
  protected readonly doubled = computed(() => this.activeHand()?.doubled ?? false);

  // One-line tally of a finished multi-hand round ('2 won, 1 lost'). Empty for a
  // single hand, whose own verdict line already says everything.
  protected readonly roundSummary = computed(() => {
    const outcomes = this.hands()
      .map((h) => h.settlement?.outcome)
      .filter((o): o is ShowdownOutcome => o !== undefined);
    if (outcomes.length < 2) return '';
    const count = (o: ShowdownOutcome) => outcomes.filter((x) => x === o).length;
    const parts: string[] = [];
    if (count('win')) parts.push(`${count('win')} won`);
    if (count('lose')) parts.push(`${count('lose')} lost`);
    if (count('push')) parts.push(`${count('push')} pushed`);
    return parts.join(', ');
  });

  protected total(h: PlayerHand): number {
    return handTotal(h.cards);
  }

  protected stake(h: PlayerHand): number {
    return stakeFor(h.bet, h.doubled);
  }

  // Chips a settled hand returned. Zero until it settles. A surrendered hand
  // gave up half its bet, not the full stake its loss settlement would imply.
  protected payout(h: PlayerHand): number {
    if (h.surrendered) return surrenderForfeit(h.bet);
    return h.settlement ? handPayout(h.settlement, h.bet, h.doubled) : 0;
  }

  // Chip figures carry no currency symbol — they are units, and a 3:2 on an odd
  // bet is a genuine half chip, so only the halves get a decimal.
  protected chips(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  protected signedChips(value: number): string {
    if (value === 0) return 'even';
    return (value > 0 ? '+' : '−') + this.chips(Math.abs(value));
  }

  // How many hands the given box currently holds — one until it splits.
  private handsInBox(box: number): number {
    return this.hands().filter((h) => h.box === box).length;
  }

  protected labelFor(a: Action): string {
    return ACTION_LABELS[a];
  }

  protected keyFor(a: Action): string {
    return ACTION_KEY_HINTS[a];
  }

  ngOnInit(): void {
    this.remaining.set(this.shoe().cardsRemaining);
    // The count the drill was carrying is where this table's count starts.
    this.visibleRunningCount.set(this.entryRunningCount());
    if (this.betting()) {
      // Size the bet before seeing a card — the count just practised is the only
      // information the decision should rest on.
      this.bet.set(this.clampedBet(MIN_BET));
      this.phase.set('betting');
      return;
    }
    this.dealHand();
  }

  // Keep a bet inside both the table minimum and what the bankroll can back
  // across every occupied box.
  private clampedBet(value: number): number {
    return clampBet(value, this.bankrollService.bankroll() / this.spots());
  }

  // The rungs on offer are the player's own spread, so the bet the count calls
  // for is one the table can actually take.
  protected readonly betOptions = computed(() => betOptionsFor(this.betRamp()));

  // A bet option the bankroll cannot back across every box is offered disabled,
  // so the ladder stays legible as the stack shrinks.
  protected betAffordable(option: number): boolean {
    return option * this.spots() <= this.bankrollService.bankroll();
  }

  protected setBet(value: number): void {
    if (this.phase() !== 'betting') return;
    this.bet.set(this.clampedBet(value));
  }

  protected dealAfterBet(): void {
    if (this.phase() !== 'betting') return;
    // Snapshot the count before a card is turned: the bet was decided on what
    // the player could see at that moment, and dealing moves the count.
    const trueCount = this.betTrueCount();
    const bet = this.bet();
    this.dealHand();
    // A shoe too low to serve the round leaves the table on 'exhausted' with
    // nothing dealt. There is no round to have bet into, so there is nothing to
    // grade — and the round's misplay list was never cleared either.
    if (this.phase() === 'exhausted') return;
    this.gradeBet(trueCount, bet);
  }

  protected resetBankroll(): void {
    this.bankrollService.reset();
    this.bet.set(this.clampedBet(MIN_BET));
    this.phase.set('betting');
  }

  protected onAction(action: Action): void {
    // Graded before the action is taken: the decision is about the hand as it
    // stands, and hit/split have already changed it by the time they return.
    this.gradePlay(action);
    if (action === 'H') this.hit();
    else if (action === 'S') this.stand();
    else if (action === 'D') this.double();
    else if (action === 'P') this.split();
    else if (action === 'SUR') this.surrender();
  }

  // The showdown is the only place the app lets a hand be played out, and until
  // now it accepted anything. It still does — this is a table, not a quiz, so a
  // wrong play stands and is settled — but the play is scored and said out loud.
  private gradePlay(action: Action): void {
    const hand = this.activeHand();
    const upcard = this.dealerUpcard();
    if (hand === null || upcard === null) return;
    const input: PlayInput = {
      player: hand.cards,
      dealerUpcard: upcard,
      ruleSet: this.ruleSet(),
      options: this.options(),
      canDouble: this.canDouble(),
      canSplit: this.canSplit(),
      canSurrender: this.canSurrender(),
    };
    const correct = this.correctPlay(input);
    const wasRight = action === correct.action;
    this.playStats.recordAttempt(wasRight);
    this.tallyMisplay(hand.cards, upcard, correct, wasRight);
    this.lastPlay.set({
      correct: wasRight,
      headline: `${ACTION_LABELS[correct.action]} was the play.`,
      reason: correct.reason,
    });
    if (!wasRight) {
      const index = correct.deviationApplied ? ' (index play)' : '';
      this.roundMistakes.update((list) => [
        ...list,
        `${correct.handDescription} vs ${normalizeUpcardKey(upcard)}: ${ACTION_LABELS[correct.action]}, not ${ACTION_LABELS[action as Exclude<Action, 'INS'>]}${index}`,
      ]);
    }
  }

  // What this table calls correct. The count carried in from the drill is the
  // whole reason the showdown exists, and a hand is where it finally pays: a
  // trainee taught to stand 16 vs 10 at +1 and then marked wrong for it here
  // would be taught two different games by one app.
  //
  // The index only applies where the app has one. A playing deviation is a Hi-Lo
  // true count, so every other system is graded on basic strategy alone rather
  // than against numbers that are not its own — the same line the insurance call
  // already draws. (KO's book publishes an insurance trigger, not a playing
  // schedule, so its running count grades that one decision and no other.)
  private correctPlay(input: PlayInput): PlayDeviationDecision {
    const basis = this.countBasis();
    if (basis.kind !== 'true-count') {
      return { ...this.engine.decidePlay(input), deviationApplied: false };
    }
    return this.deviations.resolvePlayDecision(input, basis.trueCount);
  }

  // A misplay here is a miss on the hand it was made on, so it belongs in the
  // same weak-spot tally the drills keep: play 16 vs 10 badly at the table and
  // the next session opens on it. Without this the verdict is said once and
  // forgotten the moment the round settles.
  //
  // It files against whichever trainer actually teaches the answer — an index
  // play is a Deviations question, not a basic-strategy one, and filing it under
  // Basic Strategy would seed that drill a hand whose chart answer the trainee
  // got right.
  //
  // Only an opening two-card decision is recorded, and only when the table asked
  // the same question the drill does. A `ScenarioRef` names a two-card hand — it
  // is the seed the drill re-deals from — so a three-card 16 has no identity to
  // file under. And when the felt withheld an action the chart wanted (a double
  // the free chips could not back, a split past the box's four-hand cap, a
  // surrender the split already spent), the correct answer here is not the
  // drill's, and recording it would clear a weak spot the trainee has not
  // actually learned.
  private tallyMisplay(
    cards: readonly Card[],
    upcard: Card,
    correct: PlayDeviationDecision,
    wasRight: boolean,
  ): void {
    if (cards.length !== 2) return;
    const player: readonly [Card, Card] = [cards[0], cards[1]];
    const input: EngineInput = {
      player,
      dealerUpcard: upcard,
      ruleSet: this.ruleSet(),
      options: this.options(),
    };
    const basis = this.countBasis();
    const trainer: TalliedTrainer = correct.deviationApplied ? 'deviations' : 'basic-strategy';
    const unrestricted =
      correct.deviationApplied && basis.kind === 'true-count'
        ? this.deviations.resolveDeviationDecision(input, basis.trueCount).finalAction
        : this.engine.decide(input).action;
    if (unrestricted !== correct.action) return;
    // An index play is a question about a count, so the count it was played at
    // goes with it: the Deviations trainer re-deals the hand at a count it was
    // actually missed at rather than a fresh one.
    const trueCount =
      trainer === 'deviations' && basis.kind === 'true-count' ? basis.trueCount : undefined;
    this.missTally.record(trainer, scenarioRefFor(player, upcard), wasRight, trueCount);
  }

  // Between rounds, betting returns to the bet: the count has moved on, so the
  // spread should be reconsidered rather than silently repeated.
  protected dealAnother(): void {
    if (this.betting()) {
      if (this.bankrollService.bustedOut()) return;
      // Clear the settled round before the next bet, so nothing on the felt (or
      // in `committed`) belongs to a hand that is already paid.
      this.hands.set([]);
      this.dealerCards.set([]);
      this.bet.set(this.clampedBet(this.bet()));
      this.phase.set('betting');
      return;
    }
    this.dealHand();
  }

  // Deal a fresh opening round to every occupied box in casino order: one card
  // to each box, the dealer's upcard, a second card to each box, the dealer's
  // hole card. Naturals on either side resolve without any player action.
  private dealHand(): void {
    const spots = this.spots();
    if (this.shoe().cardsRemaining < minCardsForSpots(spots)) {
      this.phase.set('exhausted');
      return;
    }
    const boxes: Card[][] = Array.from({ length: spots }, () => []);
    for (const box of boxes) box.push(this.draw()!);
    const dealer: Card[] = [this.draw()!];
    for (const box of boxes) box.push(this.draw()!);
    dealer.push(this.drawHole()!);

    const bet = this.betting() ? this.bet() : 0;
    this.roundNet.set(0);
    this.insuranceNet.set(null);
    this.lastPlay.set(null);
    this.roundMistakes.set([]);
    this.hands.set(boxes.map((cards, box) => freshHand(cards, { box, bet })));
    this.dealerCards.set(dealer);
    this.activeIndex.set(0);
    this.phase.set('player-turn');

    // A dealer ace pauses on the insurance decision before the peek — but only
    // with chips in play (insurance is purely a money bet) that can back it.
    if (this.betting() && isAce(dealer[0]) && this.canAffordInsurance()) {
      this.phase.set('insurance');
      return;
    }
    this.peekAndContinue();
  }

  // Check the hole card and continue the round: a dealer natural ends every box
  // at once, an opening player natural is paid 3:2 and sits out, and the
  // remaining boxes are played in order.
  private peekAndContinue(): void {
    const dealer = this.dealerCards();
    if (isBlackjack(dealer)) {
      // A dealer natural ends every box at once — no player action, no draw.
      this.hands().forEach((_, i) => this.settleHandAt(i, dealer));
      this.resolveRound();
      return;
    }
    this.hands().forEach((h, i) => {
      if (isBlackjack(h.cards)) this.settleHandAt(i, dealer);
    });
    this.activateNextOrResolve();
  }

  // Insure every box for half its bet: the side bets settle against the hole
  // card immediately — paid 2:1 on a dealer natural, forfeited otherwise — and
  // then the round continues exactly as an uninsured one.
  protected takeInsurance(): void {
    if (this.phase() !== 'insurance') return;
    this.gradeInsurance(true);
    const dealerBlackjack = isBlackjack(this.dealerCards());
    let net = 0;
    for (const h of this.hands()) {
      const payout = insurancePayout(h.bet, dealerBlackjack);
      this.bankrollService.record(insuranceCost(h.bet), payout);
      net += payout;
    }
    this.insuranceNet.set(net);
    this.roundNet.update((total) => total + net);
    this.phase.set('player-turn');
    this.peekAndContinue();
  }

  protected declineInsurance(): void {
    if (this.phase() !== 'insurance') return;
    this.gradeInsurance(false);
    this.phase.set('player-turn');
    this.peekAndContinue();
  }

  // The bet is the other decision here that is purely about the count, and the
  // one the bet-spread drill exists for — but that drill asks for a number in
  // the abstract, while this is the table where chips actually go out. Until now
  // a trainee could flat-bet the minimum through a +5 shoe and hear nothing.
  //
  // Graded against the player's own spread, never a computed optimum: what to
  // bet at a count follows from bankroll, risk of ruin and what the table will
  // tolerate, none of which this app knows (see `bet-ramp.model.ts`). Because
  // the ramp is the player's own it is indexed by whatever true count they keep,
  // so every balanced system qualifies — unlike the insurance index, which is a
  // Hi-Lo number and may only be applied to Hi-Lo.
  //
  // Skipped when the bankroll could not have covered the called bet: that rung
  // is offered disabled, so marking it wrong would score a bet the table never
  // let the player place.
  private gradeBet(trueCount: number | null, bet: number): void {
    if (trueCount === null) return;
    // A shrinking bankroll clamps the carried bet to whatever it can still back,
    // which need not land on a rung. The ladder is the only way to place a bet,
    // so a figure that is not on it is one the player never chose.
    if (!this.betOptions().includes(bet)) return;
    const called = betUnitsForTrueCount(trueCount, this.betRamp());
    if (called * this.spots() > this.bankrollService.bankroll()) return;
    const correct = bet === called;
    this.betSpreadStats.recordAttempt(correct);
    const band = BET_RAMP_BAND_LABELS[betRampBandIndex(trueCount)];
    this.lastPlay.set({
      correct,
      headline: `${called} ${called === 1 ? 'unit' : 'units'} was the bet.`,
      reason: `Your spread calls for ${called} at ${band}, and the true count is ${formatSignedCount(trueCount)}.`,
    });
    if (!correct) {
      this.roundMistakes.update((list) => [...list, `Bet: ${called} at ${band}, not ${bet}`]);
    }
  }

  // Insurance is the one decision at this table that is purely about the count,
  // and the showdown is attached to the drill that just practised it — so this
  // is where a trainee finds out whether the number they were carrying was
  // worth acting on. It is graded on the count as they could see it: every card
  // face up at this moment, and not the hole card the bet is about.
  //
  // Whether the bet won is beside the point. Insurance at +3 that loses was
  // still right, and that is exactly the lesson.
  private gradeInsurance(tookIt: boolean): void {
    const basis = this.countBasis();
    const decision = this.deviations.resolveInsuranceDecision(
      basis.kind === 'true-count' ? basis.trueCount : 0,
      this.ruleSet(),
    );
    const shouldTake = insuranceIsCorrect(basis, decision.deviationApplied);
    // Nothing to say about this system's insurance call. The verdict already on
    // screen belongs to this round's bet, so it is left alone rather than wiped.
    if (shouldTake === null) return;
    const correct = tookIt === shouldTake;
    this.playStats.recordAttempt(correct);
    this.lastPlay.set({
      correct,
      headline: shouldTake ? 'Insurance was the play.' : 'Declining was the play.',
      reason: this.insuranceReason(basis, shouldTake, decision.matchedRule?.index),
    });
    if (!correct) {
      this.roundMistakes.update((list) => [
        ...list,
        `Insurance: ${shouldTake ? 'take it' : 'decline'}, not ${tookIt ? 'take' : 'decline'}`,
      ]);
    }
  }

  private insuranceReason(basis: CountBasis, shouldTake: boolean, index?: number): string {
    const at = shouldTake ? 'at or above' : 'below';
    if (basis.kind === 'running-count') {
      return `Running count ${formatSignedCount(basis.runningCount)} is ${at} ${this.system().name}'s insurance count of ${formatSignedCount(basis.insuranceAt)}.`;
    }
    const trueCount = basis.kind === 'true-count' ? basis.trueCount : 0;
    // The index is quoted from the chart the grading just consulted, never
    // restated here, so a corrected chart cannot leave this sentence citing a
    // number the verdict no longer uses.
    const named = index === undefined ? '' : ` of ${formatSignedCount(index)}`;
    return `True count ${formatSignedCount(trueCount)} is ${at} the insurance index${named}.`;
  }

  // Settle one hand against the dealer's final cards and record it. Idempotent:
  // a hand that already carries a settlement (an opening natural) is left alone
  // so its tally is never double-counted.
  private settleHandAt(i: number, dealer: readonly Card[]): void {
    const hand = this.hands()[i];
    if (hand.settlement) return;
    const result = settle(hand.cards, dealer, hand.fromSplit ? false : isBlackjack(hand.cards));
    this.updateHand(i, (h) => ({ ...h, done: true, settlement: result }));
    this.stats.record(result.outcome, result.playerBlackjack);
    if (this.betting()) {
      const payout = handPayout(result, hand.bet, hand.doubled);
      this.bankrollService.record(stakeFor(hand.bet, hand.doubled), payout);
      this.roundNet.update((net) => net + payout);
    }
  }

  // Give up the hand for half the bet. It settles as a loss on the spot — the
  // dealer owes it nothing — so `resolveAll`'s any-live check and the tally both
  // see a finished hand, and the round moves to the next box.
  private surrender(): void {
    if (!this.canSurrender()) return;
    const i = this.activeIndex();
    const hand = this.hands()[i];
    const settlement: Settlement = {
      outcome: 'lose',
      playerBlackjack: false,
      dealerBlackjack: false,
    };
    this.updateHand(i, (h) => ({ ...h, surrendered: true, done: true, settlement }));
    this.stats.record('lose', false);
    if (this.betting()) {
      const payout = surrenderForfeit(hand.bet);
      this.bankrollService.record(hand.bet, payout);
      this.roundNet.update((net) => net + payout);
    }
    this.activateNextOrResolve();
  }

  private hit(): void {
    if (this.phase() !== 'player-turn') return;
    const card = this.draw();
    if (!card) {
      // Shoe exhausted mid-hand — stand and settle with what's here.
      this.finishActive();
      return;
    }
    const i = this.activeIndex();
    this.updateHand(i, (h) => ({ ...h, cards: [...h.cards, card] }));
    if (isBust(this.hands()[i].cards)) this.finishActive();
  }

  private stand(): void {
    if (this.phase() !== 'player-turn') return;
    this.finishActive();
  }

  // Double down: take exactly one card at a doubled stake, then the hand ends.
  private double(): void {
    if (!this.canDouble()) return;
    const i = this.activeIndex();
    const card = this.draw();
    this.updateHand(i, (h) => ({
      ...h,
      doubled: true,
      cards: card ? [...h.cards, card] : h.cards,
    }));
    this.finishActive();
  }

  // Split a pair: the two cards seed two hands. The active hand keeps the first
  // card and is dealt a new second card; the second card starts a new hand
  // inserted right after, played once the active one finishes. Split aces take a
  // single card each and stand.
  private split(): void {
    if (!this.canSplit()) return;
    const i = this.activeIndex();
    const { cards, box, bet } = this.hands()[i];
    const [a, b] = cards;
    const splitAce = isAce(a);
    // Both halves stay in the box that split, so the box keeps its own cap, and
    // each carries the box's bet — a split posts a second one.
    this.hands.update((hs) => [
      ...hs.slice(0, i),
      freshHand([a], { box, bet, isSplitAce: splitAce, fromSplit: true }),
      freshHand([b], { box, bet, isSplitAce: splitAce, fromSplit: true }),
      ...hs.slice(i + 1),
    ]);
    // Deal the active (first) split hand its second card and continue.
    this.dealToFreshHand(i);
  }

  // Deal the second card to a one-card (freshly split) hand at `i`, then either
  // finish it (a split ace stands after one card) or leave it for the player.
  private dealToFreshHand(i: number): void {
    const card = this.draw();
    if (card) this.updateHand(i, (h) => ({ ...h, cards: [...h.cards, card] }));
    const hand = this.hands()[i];
    if (hand.isSplitAce || hand.cards.length < 2 || isBust(hand.cards)) {
      this.finishHand(i);
    }
  }

  // Mark the active hand done and move on to the next unfinished hand, or settle.
  private finishActive(): void {
    this.finishHand(this.activeIndex());
  }

  private finishHand(i: number): void {
    this.updateHand(i, (h) => ({ ...h, done: true }));
    this.activateNextOrResolve();
  }

  // Hand play to the earliest hand still owed a decision, or resolve the round
  // when every hand is finished. Hands are always completed front to back, so
  // the first not-done hand is the next one to act.
  private activateNextOrResolve(): void {
    const nextIndex = this.hands().findIndex((h) => !h.done);
    if (nextIndex === -1) {
      this.resolveAll();
      return;
    }
    this.activeIndex.set(nextIndex);
    // A freshly split hand arrives with one card; deal its second before play.
    if (this.hands()[nextIndex].cards.length === 1) this.dealToFreshHand(nextIndex);
  }

  // Reveal the dealer's hole card, play it out once (only if a hand can still
  // win — every hand busted or already settled means no draw), then settle the
  // hands still open. A split hand never counts as a natural, so its two-card
  // 21 pays even money.
  private resolveAll(): void {
    const anyLive = this.hands().some((h) => !h.settlement && !isBust(h.cards));
    let dealer = this.dealerCards();
    if (anyLive) {
      dealer = playDealerHand(dealer, this.ruleSet(), () => this.draw());
      this.dealerCards.set(dealer);
    }
    this.hands().forEach((_, i) => this.settleHandAt(i, dealer));
    this.resolveRound();
  }

  // Close the round: the hole card is on its face from here on, so it joins the
  // count now. Waiting for the next deal would leave the bet that opens that
  // round graded against a count one card behind the felt — and a player who
  // counted the card they can see marked wrong for it.
  private resolveRound(): void {
    const hole = this.pendingHoleCard();
    if (hole) {
      this.countVisible(hole);
      this.pendingHoleIndex = null;
    }
    this.phase.set('resolved');
  }

  // The hole card still face down, if the round has one.
  private pendingHoleCard(): Card | null {
    return this.pendingHoleIndex === null ? null : (this.dealt[this.pendingHoleIndex] ?? null);
  }

  private updateHand(i: number, fn: (h: PlayerHand) => PlayerHand): void {
    this.hands.update((hs) => hs.map((h, idx) => (idx === i ? fn(h) : h)));
  }

  // Deal one card from the shoe and refresh the remaining-cards mirror.
  private draw(): Card | undefined {
    const [card] = this.shoe().deal(1);
    this.remaining.set(this.shoe().cardsRemaining);
    if (card) {
      this.dealt.push(card);
      this.countVisible(card);
    }
    return card;
  }

  // The dealer's second card, drawn face down: dealt and tracked like any
  // other, but held out of the visible count until the round resolves and turns
  // it over.
  private drawHole(): Card | undefined {
    const card = this.draw();
    if (card) {
      this.uncountVisible(card);
      this.pendingHoleIndex = this.dealt.length - 1;
    }
    return card;
  }

  private countVisible(card: Card): void {
    this.visibleRunningCount.update((count) => count + cardCountValue(this.system(), card));
  }

  private uncountVisible(card: Card): void {
    this.visibleRunningCount.update((count) => count - cardCountValue(this.system(), card));
  }

  // Leaving the table. Every count-dependent verdict here — the bet, the
  // insurance call, the index plays — was scored against a count this component
  // kept, and the trainee was never asked for theirs. So the way out runs
  // through it, once, on the count as they could see it.
  //
  // Only between rounds: mid-hand the dealer's hole card is dealt but face
  // down, so there is no single count both sides can agree is right.
  protected returnToCounting(): void {
    if (this.countCheck() && this.dealt.length > 0 && this.phase() !== 'player-turn') {
      this.countVerdict.set(null);
      this.phase.set('count-check');
      return;
    }
    this.leaveTable();
  }

  // Return to counting, handing back every card this showdown dealt so the
  // drill's carried running count stays consistent with the depleted shoe.
  protected leaveTable(): void {
    this.exit.emit(this.seenCards());
  }

  // What leaves with the player: every card this table turned face up. A round
  // walked away from mid-hand leaves the dealer's hole card dealt but never
  // shown — it is gone from the shoe, but a counter who never saw it cannot
  // have it in their count, exactly as a burn card is gone and uncounted.
  // Handing it back would move the drill's carried count by a card the table
  // never showed, and mark the next answer wrong for it.
  private seenCards(): readonly Card[] {
    const hole = this.pendingHoleIndex;
    return hole === null ? this.dealt : this.dealt.filter((_, i) => i !== hole);
  }

  // Cards the player has actually seen face up. The hole card of an unresolved
  // round is dealt but not shown, so it is not one of them.
  protected cardsSeen(): number {
    return this.seenCards().length;
  }

  // Whether the round being left still holds a face-down hole card, so the
  // count check can say why it is not in the number it is asking for.
  protected holeCardUnseen(): boolean {
    return this.pendingHoleIndex !== null;
  }

  // Wong Halves and friends run on half-points, so the answer box has to take
  // them — the same rule the counting drill's own form follows.
  protected fractionalCount(): boolean {
    return this.countingEngine.isFractionalSystem(this.system());
  }

  // Grade the count they leave with against the one the table kept. This is the
  // running-count skill the drill measures, so it feeds the same store: a count
  // held through a played-out shoe is the same count, harder.
  protected onCountCheck(answer: number): void {
    if (this.phase() !== 'count-check' || this.countVerdict() !== null) return;
    const actual = this.visibleRunningCount();
    const correct = answer === actual;
    this.countStats.recordAttempt(correct);
    const drift = answer - actual;
    this.countVerdict.set({
      correct,
      headline: `The running count is ${formatSignedCount(actual)}.`,
      reason: correct
        ? `You carried it through ${this.cardsSeen()} cards at the table.`
        : `You said ${formatSignedCount(answer)} — ${Math.abs(drift)} ${
            Math.abs(drift) === 1 ? 'point' : 'points'
          } ${drift > 0 ? 'high' : 'low'} over ${this.cardsSeen()} cards.`,
    });
  }

  protected verdict(h: PlayerHand): string {
    const s = h.settlement;
    if (!s) return '';
    if (h.surrendered) return this.betting() ? 'Surrendered — half the bet back.' : 'Surrendered.';
    const doubled = h.doubled ? ' (doubled)' : '';
    if (s.outcome === 'win') {
      return (s.playerBlackjack ? 'Blackjack! You win (pays 3:2).' : 'You win!') + doubled;
    }
    if (s.outcome === 'lose') {
      if (isBust(h.cards)) return 'Bust — dealer wins.' + doubled;
      if (s.dealerBlackjack) return 'Dealer blackjack — dealer wins.';
      return 'Dealer wins.' + doubled;
    }
    return (s.playerBlackjack && s.dealerBlackjack ? 'Push — both blackjack.' : 'Push.') + doubled;
  }

  @HostListener('window:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    // The count check owns the keyboard while it is up: the answer box handles
    // its own Enter (native submit), and once the verdict is in, Enter leaves.
    // Action letters mean nothing here — there is no hand left to play.
    if (this.phase() === 'count-check') {
      if (shouldIgnoreKeyboardEvent(event)) return;
      if (event.key === 'Enter' && this.countVerdict() !== null) {
        event.preventDefault();
        this.leaveTable();
      }
      return;
    }
    // The insurance decision has its own two keys and swallows everything else,
    // so a buffered Enter or action letter can't decide a side bet by accident.
    if (this.phase() === 'insurance') {
      if (shouldIgnoreKeyboardEvent(event)) return;
      const key = event.key.toLowerCase();
      if (key === 'i') {
        event.preventDefault();
        this.takeInsurance();
      } else if (key === 'n') {
        event.preventDefault();
        this.declineInsurance();
      }
      return;
    }
    handleTrainerKeydown(event, {
      // Enter deals: from the bet when betting is on, or straight into the next
      // round when it is off.
      canNext: () =>
        this.phase() === 'betting'
          ? !this.bankrollService.bustedOut()
          : this.phase() === 'resolved' && this.canDealAnother(),
      onNext: () => (this.phase() === 'betting' ? this.dealAfterBet() : this.dealAnother()),
      onAction: (action) => {
        if (this.phase() === 'player-turn') this.onAction(action);
      },
    });
  }
}

// A splittable pair: two cards of equal blackjack value (two tens, two aces, …).
function isPair(cards: readonly Card[]): boolean {
  return cards.length === 2 && cardHighValue(cards[0]) === cardHighValue(cards[1]);
}
