import { Component, computed, input } from '@angular/core';
import type { Card } from '../core/models/card.model';

// cardsJS filename convention: <RANK><SUIT>.svg where rank is 2..10/J/Q/K/A
// and suit is C/D/H/S. Face-down uses BLUE_BACK.svg.
const SUIT_CODE: Readonly<Record<Card['suit'], string>> = {
  spades: 'S',
  hearts: 'H',
  diamonds: 'D',
  clubs: 'C',
};

const SUIT_GLYPH: Readonly<Record<Card['suit'], string>> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

@Component({
  selector: 'app-card-image',
  template: `
    <img
      class="card-image"
      [class.card-image--face-down]="faceDown()"
      [src]="src()"
      [alt]="alt()"
      draggable="false"
    />
  `,
  styleUrl: './card-image.component.scss',
})
export class CardImageComponent {
  readonly card = input<Card | null>(null);
  readonly faceDown = input(false);

  readonly src = computed(() => {
    if (this.faceDown()) return 'cards/BLUE_BACK.svg';
    const c = this.card();
    if (!c) return 'cards/BLUE_BACK.svg';
    return `cards/${c.rank}${SUIT_CODE[c.suit]}.svg`;
  });

  readonly alt = computed(() => {
    if (this.faceDown()) return 'Face-down card';
    const c = this.card();
    if (!c) return 'No card';
    return `${c.rank}${SUIT_GLYPH[c.suit]} (${c.rank} of ${c.suit})`;
  });
}
