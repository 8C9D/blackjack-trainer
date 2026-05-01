import { Injectable } from '@angular/core';
import {
  ALL_RANKS,
  ALL_SUITS,
  type Card,
} from '../models/card.model';

export interface Scenario {
  readonly player: readonly [Card, Card];
  readonly dealerUpcard: Card;
}

// Generates random initial-deal scenarios. Cards are drawn independently with
// replacement — duplicates are allowed by design (this is a strategy trainer,
// not a deck simulation).
@Injectable({ providedIn: 'root' })
export class CardGeneratorService {
  private random: () => number = Math.random;

  setRandomSource(fn: () => number): void {
    this.random = fn;
  }

  generate(): Scenario {
    return {
      player: [this.randomCard(), this.randomCard()],
      dealerUpcard: this.randomCard(),
    };
  }

  private randomCard(): Card {
    const rank = ALL_RANKS[Math.floor(this.random() * ALL_RANKS.length)];
    const suit = ALL_SUITS[Math.floor(this.random() * ALL_SUITS.length)];
    return { rank, suit };
  }
}
