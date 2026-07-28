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
  BET_OPTIONS,
  MIN_BET,
  clampBet,
  handPayout,
  insuranceCost,
  insurancePayout,
  stakeFor,
  surrenderForfeit,
} from '../../core/models/bankroll.model';
import { cardHighValue, isAce, type Card } from '../../core/models/card.model';
import { handTotal, isBlackjack, isBust } from '../../core/models/hand.model';
import { Shoe } from '../../core/models/shoe.model';
import {
  clampSpots,
  minCardsForSpots,
  playDealerHand,
  settle,
  type Settlement,
  type ShowdownOutcome,
} from '../../core/models/showdown.model';
import { ACTION_LABELS, type Action, type RuleSet } from '../../core/models/strategy.model';
import { CardImageComponent } from '../../shared/card-image.component';
import { BankrollService } from '../../core/services/bankroll.service';
import { ShowdownStatsService } from '../../core/services/showdown-stats.service';

// 'player-turn': the player is acting on the active hand. 'resolved': every hand
// is settled and the dealer hand revealed. 'exhausted': the shoe ran too low.
// 'betting' and 'insurance' only occur when bet sizing is on: the round waits
// for a bet before any card is dealt (the whole point of practising against the
// count), and a dealer ace pauses the deal on the insurance decision before the
// hole card is checked.
type ShowdownPhase = 'betting' | 'insurance' | 'player-turn' | 'resolved' | 'exhausted';

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

// Post-count showdown: deals one to three boxes from the persistent shoe the
// player just counted, plays each hit/stand/double/split in turn (re-splits to
// four hands; split aces take one card), auto-plays the dealer once by the
// active RuleSet (from the shared table rules), and settles every hand
// win/lose/push (3:2 naturals). A box's original two cards may also late-
// surrender for half the bet (the peek has already settled any dealer natural).
// With bet sizing on, a dealer ace additionally offers insurance (half each
// bet, pays 2:1) before the hole card is checked — the classic count-driven
// side bet.
@Component({
  selector: 'app-showdown',
  imports: [CardImageComponent],
  template: `
    <section class="showdown" aria-label="Showdown vs dealer">
      <header class="showdown__header">
        <h2 class="showdown__heading">
          {{
            spots() > 1 ? 'Play ' + spots() + ' hands vs the dealer' : 'Play a hand vs the dealer'
          }}
        </h2>
      </header>

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

      @if (phase() === 'exhausted') {
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
              @for (option of betOptions; track option) {
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
              Deal <span class="showdown__hint">[Enter]</span>
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

        @if (phase() === 'resolved') {
          <section class="showdown__result" role="status">
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
              <span class="showdown__hint">[Enter]</span>
            </button>
            @if (!canDealAnother()) {
              <p class="showdown__note">
                {{
                  spots() > 1
                    ? 'Shoe too low for another round — return to counting to reshuffle.'
                    : 'Shoe too low for another hand — return to counting to reshuffle.'
                }}
              </p>
            }
          </section>
        }
      }

      <button type="button" class="showdown__exit" (click)="returnToCounting()">
        Back to counting
      </button>
    </section>
  `,
  styleUrl: './showdown.component.scss',
})
export class ShowdownComponent implements OnInit {
  // Records win/loss tallies under its pre-Flow key even though the Flow UI
  // no longer surfaces them.
  protected readonly stats = inject(ShowdownStatsService);
  // The persisted chip position, only touched when betting is on.
  protected readonly bankrollService = inject(BankrollService);

  // The persistent shoe the player just counted; the showdown deals from it so
  // its depletion carries back to the counting drill.
  readonly shoe = input.required<Shoe>();
  readonly ruleSet = input.required<RuleSet>();
  // Boxes to occupy on the opening deal (1–3). One dealer plays against all.
  readonly spots = input(1, { transform: clampSpots });
  // Bet sizing: when on, each round opens on a bet and settles against a
  // persisted bankroll. Off (the default) the showdown is the pure hand tally it
  // has always been, and no chip figure is shown.
  readonly betting = input(false);

  // Emitted when the player returns to the counting drill, carrying every card
  // this showdown dealt (in order) so the drill can fold their running-count
  // value back into the shoe's carried count — the cards really left the shoe.
  readonly exit = output<readonly Card[]>();

  // Every card dealt during this showdown session, accumulated for the exit.
  private readonly dealt: Card[] = [];

  protected readonly hands = signal<readonly PlayerHand[]>([]);
  protected readonly activeIndex = signal(0);
  protected readonly dealerCards = signal<readonly Card[]>([]);
  protected readonly phase = signal<ShowdownPhase>('player-turn');
  // The bet each box posts for the coming round. Starts at the table minimum so
  // the spread is the player's decision, not a default.
  protected readonly bet = signal(MIN_BET);
  // Net chips of the round just resolved, for the result line.
  protected readonly roundNet = signal(0);
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
    return this.phase() === 'player-turn' && h !== null && h.cards.length === 2 && !h.fromSplit;
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
  protected readonly canDealAnother = computed(
    () => this.remaining() >= minCardsForSpots(this.spots()),
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

  protected readonly betOptions = BET_OPTIONS;

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
    this.dealHand();
  }

  protected resetBankroll(): void {
    this.bankrollService.reset();
    this.bet.set(this.clampedBet(MIN_BET));
    this.phase.set('betting');
  }

  protected onAction(action: Action): void {
    if (action === 'H') this.hit();
    else if (action === 'S') this.stand();
    else if (action === 'D') this.double();
    else if (action === 'P') this.split();
    else if (action === 'SUR') this.surrender();
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
    dealer.push(this.draw()!);

    const bet = this.betting() ? this.bet() : 0;
    this.roundNet.set(0);
    this.insuranceNet.set(null);
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
      this.phase.set('resolved');
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
    this.phase.set('player-turn');
    this.peekAndContinue();
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
    this.phase.set('resolved');
  }

  private updateHand(i: number, fn: (h: PlayerHand) => PlayerHand): void {
    this.hands.update((hs) => hs.map((h, idx) => (idx === i ? fn(h) : h)));
  }

  // Deal one card from the shoe and refresh the remaining-cards mirror.
  private draw(): Card | undefined {
    const [card] = this.shoe().deal(1);
    this.remaining.set(this.shoe().cardsRemaining);
    if (card) this.dealt.push(card);
    return card;
  }

  // Return to counting, handing back every card this showdown dealt so the
  // drill's carried running count stays consistent with the depleted shoe.
  protected returnToCounting(): void {
    this.exit.emit(this.dealt);
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
