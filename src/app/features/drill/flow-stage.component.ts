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
      <div class="stage__dealer">
        <span class="stage__label">Dealer shows</span>
        <app-card-image class="stage__dealer-card" [card]="dealer()" />
      </div>
      <div class="stage__hand">
        <app-card-image [card]="player()[0]" />
        <app-card-image [card]="player()[1]" />
      </div>
      <ng-content />
    </div>
  `,
  styleUrl: './flow-stage.component.scss',
})
export class FlowStageComponent {
  readonly player = input.required<readonly [Card, Card]>();
  readonly dealer = input.required<Card>();
}
