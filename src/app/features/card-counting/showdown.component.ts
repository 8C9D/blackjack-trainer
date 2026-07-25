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

import { ACTION_KEY_HINTS, handleTrainerKeydown } from '../../core/keyboard';
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
import { ShowdownStatsService } from '../../core/services/showdown-stats.service';

// 'player-turn': the player is acting on the active hand. 'resolved': every hand
// is settled and the dealer hand revealed. 'exhausted': the shoe ran too low.
type ShowdownPhase = 'player-turn' | 'resolved' | 'exhausted';

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
  // Doubled: took exactly one card at a doubled stake.
  readonly doubled: boolean;
  // A split-ace hand takes exactly one card, then stands (no hit/double/re-split).
  readonly isSplitAce: boolean;
  // Came out of a split. A 21 on such a hand is not a natural and pays even
  // money — tracked per hand rather than inferred from the hand count, because
  // multiple boxes also produce multiple hands without any split involved.
  readonly fromSplit: boolean;
  // Finished acting (stood, busted, doubled, or a completed split ace).
  readonly done: boolean;
  readonly settlement: Settlement | null;
}

function freshHand(
  cards: readonly Card[],
  box: number,
  isSplitAce = false,
  fromSplit = false,
): PlayerHand {
  return { cards, box, doubled: false, isSplitAce, fromSplit, done: false, settlement: null };
}

// Post-count showdown: deals one to three boxes from the persistent shoe the
// player just counted, plays each hit/stand/double/split in turn (re-splits to
// four hands; split aces take one card), auto-plays the dealer once by the
// active RuleSet (from the shared table rules), and settles every hand
// win/lose/push (3:2 naturals). No surrender, bankroll, or bets.
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

      @if (phase() === 'exhausted') {
        <p class="showdown__exhausted" role="status">
          The shoe is too low to deal a hand. Return to counting to reshuffle.
        </p>
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
                </p>
              }
            </section>
          }
        </div>

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
              <p class="showdown__summary">{{ summary }}</p>
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

  // The persistent shoe the player just counted; the showdown deals from it so
  // its depletion carries back to the counting drill.
  readonly shoe = input.required<Shoe>();
  readonly ruleSet = input.required<RuleSet>();
  // Boxes to occupy on the opening deal (1–3). One dealer plays against all.
  readonly spots = input(1, { transform: clampSpots });

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
  // Mirror of the shoe's remaining card count, refreshed after every draw so the
  // "deal another" gate reacts to depletion.
  protected readonly remaining = signal(0);

  protected readonly activeHand = computed<PlayerHand | null>(
    () => this.hands()[this.activeIndex()] ?? null,
  );

  // Actions apply to the active hand. Double: any fresh two-card hand (including
  // after a split). Split: a fresh two-card pair, under the four-hand cap.
  protected readonly canDouble = computed(() => {
    const h = this.activeHand();
    return this.phase() === 'player-turn' && h !== null && h.cards.length === 2 && !h.isSplitAce;
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
      this.remaining() >= 1
    );
  });
  protected readonly playerActions = computed<readonly Action[]>(() => {
    const actions: Action[] = ['H', 'S'];
    if (this.canDouble()) actions.push('D');
    if (this.canSplit()) actions.push('P');
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
    this.dealHand();
  }

  protected onAction(action: Action): void {
    if (action === 'H') this.hit();
    else if (action === 'S') this.stand();
    else if (action === 'D') this.double();
    else if (action === 'P') this.split();
  }

  protected dealAnother(): void {
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

    this.hands.set(boxes.map((cards, box) => freshHand(cards, box)));
    this.dealerCards.set(dealer);
    this.activeIndex.set(0);
    this.phase.set('player-turn');

    if (isBlackjack(dealer)) {
      // A dealer natural ends every box at once — no player action, no draw.
      this.hands().forEach((_, i) => this.settleHandAt(i, dealer));
      this.phase.set('resolved');
      return;
    }
    // A box holding a natural is paid straight away (3:2) and sits out the
    // rest of the round; the remaining boxes are played in order.
    this.hands().forEach((h, i) => {
      if (isBlackjack(h.cards)) this.settleHandAt(i, dealer);
    });
    this.activateNextOrResolve();
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
    const { cards, box } = this.hands()[i];
    const [a, b] = cards;
    const splitAce = isAce(a);
    // Both halves stay in the box that split, so the box keeps its own cap.
    this.hands.update((hs) => [
      ...hs.slice(0, i),
      freshHand([a], box, splitAce, true),
      freshHand([b], box, splitAce, true),
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
    handleTrainerKeydown(event, {
      canNext: () => this.phase() === 'resolved' && this.canDealAnother(),
      onNext: () => this.dealAnother(),
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
