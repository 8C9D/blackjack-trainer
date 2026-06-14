import { Injectable } from '@angular/core';

import type { Card } from '../models/card.model';
import { Shoe, buildShoeCards } from '../models/shoe.model';

// Builds and shuffles finite shoes for the true-count trainer. The randomness
// seam mirrors CardGeneratorService.setRandomSource so the Fisher–Yates shuffle
// is deterministic in specs.
@Injectable({ providedIn: 'root' })
export class ShoeService {
  private random: () => number = Math.random;

  setRandomSource(fn: () => number): void {
    this.random = fn;
  }

  // Build, shuffle, and return a fresh shoe of the given size and penetration.
  create(numberOfDecks: number, penetration: number): Shoe {
    const cards = buildShoeCards(numberOfDecks);
    this.shuffle(cards);
    return new Shoe(cards, penetration);
  }

  // In-place Fisher–Yates using the injected random source.
  private shuffle(cards: Card[]): void {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      const tmp = cards[i];
      cards[i] = cards[j];
      cards[j] = tmp;
    }
  }
}
