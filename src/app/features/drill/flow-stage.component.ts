import { Component, input } from '@angular/core';

import type { Card } from '../../core/models/card.model';
import { CardImageComponent } from '../../shared/card-image.component';

// The drill stage: a small labelled dealer upcard above the large, central
// player hand. The line under the hand (question or miss rule) is projected
// by the page so this component stays purely presentational.
@Component({
  selector: 'app-flow-stage',
  imports: [CardImageComponent],
  template: `
    <div class="stage">
      <div class="stage__dealer" role="group" aria-label="Dealer upcard">
        <span class="stage__label">Dealer shows</span>
        <app-card-image class="stage__dealer-card" [card]="dealer()" />
      </div>
      <div
        class="stage__hand"
        role="group"
        aria-label="Your hand"
        [class.stage__hand--deep]="player().length > 2"
      >
        <!-- Tracked by index: the trainers deal with replacement, so the same
             card can appear twice in one hand. -->
        @for (card of player(); track $index) {
          <app-card-image [card]="card" />
        }
      </div>
      <ng-content />
    </div>
  `,
  styleUrl: './flow-stage.component.scss',
})
export class FlowStageComponent {
  // One card or many: a hand played out grows past the opening two.
  readonly player = input.required<readonly Card[]>();
  readonly dealer = input.required<Card>();
}
