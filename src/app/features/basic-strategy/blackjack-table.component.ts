import { Component, input } from '@angular/core';

import type { Card } from '../../core/models/card.model';
import { CardImageComponent } from '../../shared/card-image.component';

@Component({
  selector: 'app-blackjack-table',
  imports: [CardImageComponent],
  template: `
    <div class="table">
      <section class="table__row table__row--dealer" aria-label="Dealer hand">
        <h2 class="table__label">Dealer</h2>
        <div class="table__cards">
          <app-card-image [card]="dealerUpcard()" />
          <app-card-image [faceDown]="true" />
        </div>
      </section>

      <section class="table__row table__row--player" aria-label="Player hand">
        <h2 class="table__label">Player</h2>
        <div class="table__cards">
          <app-card-image [card]="player()[0]" />
          <app-card-image [card]="player()[1]" />
        </div>
      </section>
    </div>
  `,
  styleUrl: './blackjack-table.component.scss',
})
export class BlackjackTableComponent {
  readonly player = input.required<readonly [Card, Card]>();
  readonly dealerUpcard = input.required<Card>();
}
