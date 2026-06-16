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

import { handleTrainerKeydown } from '../../core/keyboard';
import type { Card } from '../../core/models/card.model';
import { handTotal, isBlackjack, isBust } from '../../core/models/hand.model';
import { Shoe } from '../../core/models/shoe.model';
import {
  MIN_SHOWDOWN_CARDS,
  playDealerHand,
  settle,
  type Settlement,
} from '../../core/models/showdown.model';
import type { Action, RuleSet } from '../../core/models/strategy.model';
import { ActionButtonsComponent } from '../../shared/action-buttons.component';
import { CardImageComponent } from '../../shared/card-image.component';
import { ShowdownStatsService } from '../../core/services/showdown-stats.service';

// 'player-turn': the player is hitting/standing. 'resolved': the hand is settled
// and the dealer hand revealed. 'exhausted': the shoe ran too low to deal.
type ShowdownPhase = 'player-turn' | 'resolved' | 'exhausted';

// Post-count showdown: deals a single hand from the persistent shoe the player
// just counted, plays it hit/stand only, auto-plays the dealer by the active
// RuleSet, and settles win/lose/push (3:2 naturals). Hit/stand only — no
// doubles, splits, surrender, bankroll, or bets.
@Component({
  selector: 'app-showdown',
  imports: [CardImageComponent, ActionButtonsComponent],
  template: `
    <section class="showdown" aria-label="Showdown vs dealer">
      <header class="showdown__header">
        <h2 class="showdown__heading">Play a hand vs the dealer</h2>
        <fieldset class="showdown__rule">
          <legend>Dealer rule</legend>
          <label>
            <input
              type="radio"
              name="showdown-ruleset"
              [checked]="ruleSet() === 'S17'"
              (change)="ruleSetChange.emit('S17')"
            />
            S17 — stand on soft 17
          </label>
          <label>
            <input
              type="radio"
              name="showdown-ruleset"
              [checked]="ruleSet() === 'H17'"
              (change)="ruleSetChange.emit('H17')"
            />
            H17 — hit on soft 17
          </label>
        </fieldset>
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

          <section class="showdown__hand" aria-label="Your hand">
            <h3 class="showdown__label">
              You <span class="showdown__total">({{ playerTotal() }})</span>
            </h3>
            <div class="showdown__cards">
              @for (c of playerCards(); track $index) {
                <app-card-image [card]="c" />
              }
            </div>
          </section>
        </div>

        @if (phase() === 'player-turn') {
          <app-action-buttons [actions]="playerActions" (action)="onAction($event)" />
        }

        @if (phase() === 'resolved' && settlement(); as s) {
          <section
            class="showdown__result"
            [class.showdown__result--win]="s.outcome === 'win'"
            [class.showdown__result--lose]="s.outcome === 'lose'"
            [class.showdown__result--push]="s.outcome === 'push'"
            role="status"
          >
            <p class="showdown__verdict">{{ verdict(s) }}</p>
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

      <button type="button" class="showdown__exit" (click)="exit.emit()">Back to counting</button>

      <section class="showdown__stats" aria-label="Showdown statistics">
        <div class="showdown__stats-cells">
          <div><strong>Hands</strong>: {{ stats.stats().hands }}</div>
          <div><strong>Wins</strong>: {{ stats.stats().wins }}</div>
          <div><strong>Losses</strong>: {{ stats.stats().losses }}</div>
          <div><strong>Pushes</strong>: {{ stats.stats().pushes }}</div>
          <div><strong>Blackjacks</strong>: {{ stats.stats().blackjacks }}</div>
          <div><strong>Win rate</strong>: {{ winRate() }}</div>
        </div>
        <button
          type="button"
          class="showdown__stats-reset"
          [disabled]="stats.stats().hands === 0"
          (click)="stats.reset()"
        >
          Reset showdown stats
        </button>
      </section>
    </section>
  `,
  styleUrl: './showdown.component.scss',
})
export class ShowdownComponent implements OnInit {
  protected readonly stats = inject(ShowdownStatsService);

  // The persistent shoe the player just counted; the showdown deals from it so
  // its depletion carries back to the counting drill.
  readonly shoe = input.required<Shoe>();
  readonly ruleSet = input.required<RuleSet>();

  readonly ruleSetChange = output<RuleSet>();
  // Emitted when the player chooses to return to the counting drill.
  readonly exit = output<void>();

  protected readonly playerActions: readonly Action[] = ['H', 'S'];

  protected readonly playerCards = signal<readonly Card[]>([]);
  protected readonly dealerCards = signal<readonly Card[]>([]);
  protected readonly phase = signal<ShowdownPhase>('player-turn');
  protected readonly settlement = signal<Settlement | null>(null);
  // Mirror of the shoe's remaining card count, refreshed after every draw so the
  // "deal another" gate reacts to depletion.
  protected readonly remaining = signal(0);

  protected readonly playerTotal = computed(() => handTotal(this.playerCards()));
  protected readonly dealerTotal = computed(() => handTotal(this.dealerCards()));
  protected readonly dealerUpcard = computed<Card | null>(() => this.dealerCards()[0] ?? null);
  protected readonly canDealAnother = computed(() => this.remaining() >= MIN_SHOWDOWN_CARDS);
  protected readonly winRate = computed(() => {
    const s = this.stats.stats();
    return s.hands === 0 ? '—' : `${Math.round((s.wins / s.hands) * 100)}%`;
  });

  ngOnInit(): void {
    this.remaining.set(this.shoe().cardsRemaining);
    this.dealHand();
  }

  protected onAction(action: Action): void {
    if (action === 'H') this.hit();
    else if (action === 'S') this.stand();
  }

  protected dealAnother(): void {
    this.dealHand();
  }

  // Deal a fresh opening hand (player, dealer, player, dealer) from the shoe. If
  // either side shows a two-card natural, the hand resolves immediately.
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
    this.playerCards.set(player);
    this.dealerCards.set(dealer);
    this.settlement.set(null);
    if (isBlackjack(player) || isBlackjack(dealer)) {
      this.resolve();
    } else {
      this.phase.set('player-turn');
    }
  }

  private hit(): void {
    if (this.phase() !== 'player-turn') return;
    const card = this.draw();
    if (!card) {
      // Shoe exhausted mid-hand — settle with the current hand.
      this.resolve();
      return;
    }
    const hand = [...this.playerCards(), card];
    this.playerCards.set(hand);
    if (isBust(hand)) this.resolve();
  }

  private stand(): void {
    if (this.phase() !== 'player-turn') return;
    this.resolve();
  }

  // Reveal the dealer's hole card, play the dealer out (unless the hand is
  // already decided by a bust or a natural), settle, and record the tally.
  private resolve(): void {
    const player = this.playerCards();
    let dealer = this.dealerCards();
    if (!isBust(player) && !isBlackjack(player) && !isBlackjack(dealer)) {
      dealer = playDealerHand(dealer, this.ruleSet(), () => this.draw());
      this.dealerCards.set(dealer);
    }
    const result = settle(player, dealer);
    this.settlement.set(result);
    this.stats.record(result.outcome, result.playerBlackjack);
    this.phase.set('resolved');
  }

  // Deal one card from the shoe and refresh the remaining-cards mirror.
  private draw(): Card | undefined {
    const [card] = this.shoe().deal(1);
    this.remaining.set(this.shoe().cardsRemaining);
    return card;
  }

  protected verdict(s: Settlement): string {
    if (s.outcome === 'win') {
      return s.playerBlackjack ? 'Blackjack! You win (pays 3:2).' : 'You win!';
    }
    if (s.outcome === 'lose') {
      if (isBust(this.playerCards())) return 'Bust — dealer wins.';
      if (s.dealerBlackjack) return 'Dealer blackjack — dealer wins.';
      return 'Dealer wins.';
    }
    return s.playerBlackjack && s.dealerBlackjack ? 'Push — both blackjack.' : 'Push.';
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
