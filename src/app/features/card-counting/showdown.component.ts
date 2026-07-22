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
  MIN_SHOWDOWN_CARDS,
  playDealerHand,
  settle,
  type Settlement,
} from '../../core/models/showdown.model';
import { ACTION_LABELS, type Action, type RuleSet } from '../../core/models/strategy.model';
import { CardImageComponent } from '../../shared/card-image.component';
import { ShowdownStatsService } from '../../core/services/showdown-stats.service';

// 'player-turn': the player is acting on the active hand. 'resolved': every hand
// is settled and the dealer hand revealed. 'exhausted': the shoe ran too low.
type ShowdownPhase = 'player-turn' | 'resolved' | 'exhausted';

// Most a pair can be split to (3 splits → 4 hands), the common casino cap.
const MAX_HANDS = 4;

// One player hand in the showdown. Splitting a pair turns one hand into several,
// each played and settled independently.
interface PlayerHand {
  readonly cards: readonly Card[];
  // Doubled: took exactly one card at a doubled stake.
  readonly doubled: boolean;
  // A split-ace hand takes exactly one card, then stands (no hit/double/re-split).
  readonly isSplitAce: boolean;
  // Finished acting (stood, busted, doubled, or a completed split ace).
  readonly done: boolean;
  readonly settlement: Settlement | null;
}

function freshHand(cards: readonly Card[], isSplitAce = false): PlayerHand {
  return { cards, doubled: false, isSplitAce, done: false, settlement: null };
}

// Post-count showdown: deals a hand from the persistent shoe the player just
// counted, plays it hit/stand/double/split (re-splits to four hands; split aces
// take one card), auto-plays the dealer by the active RuleSet (from the shared
// table rules), and settles each hand win/lose/push (3:2 naturals). No surrender,
// bankroll, or bets.
@Component({
  selector: 'app-showdown',
  imports: [CardImageComponent],
  template: `
    <section class="showdown" aria-label="Showdown vs dealer">
      <header class="showdown__header">
        <h2 class="showdown__heading">Play a hand vs the dealer</h2>
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
            <button
              type="button"
              class="showdown__next"
              [disabled]="!canDealAnother()"
              (click)="dealAnother()"
            >
              Deal another hand <span class="showdown__hint">[Enter]</span>
            </button>
            @if (!canDealAnother()) {
              <p class="showdown__note">
                Shoe too low for another hand — return to counting to reshuffle.
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
      this.hands().length < MAX_HANDS &&
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
  protected readonly canDealAnother = computed(() => this.remaining() >= MIN_SHOWDOWN_CARDS);

  // Backward-compatible views of the active/first hand for the single-hand path.
  protected readonly playerCards = computed<readonly Card[]>(() => this.activeHand()?.cards ?? []);
  protected readonly playerTotal = computed(() => handTotal(this.playerCards()));
  protected readonly settlement = computed<Settlement | null>(
    () => this.hands()[0]?.settlement ?? null,
  );
  protected readonly doubled = computed(() => this.activeHand()?.doubled ?? false);

  protected total(h: PlayerHand): number {
    return handTotal(h.cards);
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

  // Deal a fresh opening hand (player, dealer, player, dealer). A two-card
  // natural on either side resolves immediately.
  private dealHand(): void {
    if (this.shoe().cardsRemaining < MIN_SHOWDOWN_CARDS) {
      this.phase.set('exhausted');
      return;
    }
    const p1 = this.draw()!;
    const d1 = this.draw()!;
    const p2 = this.draw()!;
    const d2 = this.draw()!;
    const player = [p1, p2];
    const dealer = [d1, d2];
    this.hands.set([freshHand(player)]);
    this.activeIndex.set(0);
    this.dealerCards.set(dealer);
    if (isBlackjack(player) || isBlackjack(dealer)) {
      // Opening natural: settle the single hand against the dealer's two cards
      // (3:2 to a player natural, push on two naturals) — no dealer draw.
      const result = settle(player, dealer);
      this.updateHand(0, (h) => ({ ...h, settlement: result, done: true }));
      this.stats.record(result.outcome, result.playerBlackjack);
      this.phase.set('resolved');
    } else {
      this.phase.set('player-turn');
    }
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
    const [a, b] = this.hands()[i].cards;
    const splitAce = isAce(a);
    this.hands.update((hs) => [
      ...hs.slice(0, i),
      freshHand([a], splitAce),
      freshHand([b], splitAce),
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
    this.advanceOrResolve();
  }

  private advanceOrResolve(): void {
    const cur = this.activeIndex();
    const nextIndex = this.hands().findIndex((h, i) => i > cur && !h.done);
    if (nextIndex === -1) {
      this.resolveAll();
      return;
    }
    this.activeIndex.set(nextIndex);
    // A freshly split hand arrives with one card; deal its second before play.
    if (this.hands()[nextIndex].cards.length === 1) this.dealToFreshHand(nextIndex);
  }

  // Reveal the dealer's hole card, play it out once (only if a hand can still
  // win — every hand busted means no draw), then settle each hand. A split hand
  // never counts as a natural, so its two-card 21 pays even money.
  private resolveAll(): void {
    const anyLive = this.hands().some((h) => !isBust(h.cards));
    let dealer = this.dealerCards();
    if (anyLive) {
      dealer = playDealerHand(dealer, this.ruleSet(), () => this.draw());
      this.dealerCards.set(dealer);
    }
    const isSplit = this.hands().length > 1;
    this.hands.update((hs) =>
      hs.map((h) => ({
        ...h,
        settlement: settle(h.cards, dealer, isSplit ? false : isBlackjack(h.cards)),
      })),
    );
    for (const h of this.hands()) {
      if (h.settlement) this.stats.record(h.settlement.outcome, h.settlement.playerBlackjack);
    }
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
