import { Injectable } from '@angular/core';
import { ALL_RANKS, ALL_SUITS, type Card, type Scenario } from '../models/card.model';

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
      player: [this.generateCard(), this.generateCard()],
      dealerUpcard: this.generateCard(),
    };
  }

  // A single random card drawn with replacement. Shared by both trainers so
  // they get the same `setRandomSource()` test seam.
  generateCard(): Card {
    const rank = ALL_RANKS[Math.floor(this.random() * ALL_RANKS.length)];
    const suit = ALL_SUITS[Math.floor(this.random() * ALL_SUITS.length)];
    return { rank, suit };
  }

  // A sequence of N independently-drawn random cards (with replacement).
  generateSequence(n: number): Card[] {
    const cards: Card[] = [];
    for (let i = 0; i < n; i++) cards.push(this.generateCard());
    return cards;
  }
}
