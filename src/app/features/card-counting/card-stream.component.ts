import { Component, computed, input } from '@angular/core';

import type { Card } from '../../core/models/card.model';
import { CardImageComponent } from '../../shared/card-image.component';

@Component({
  selector: 'app-card-stream',
  imports: [CardImageComponent],
  template: `
    <section class="stream" aria-label="Card stream">
      <div class="stream__card">
        @if (currentCard()) {
          <app-card-image [card]="currentCard()" />
        } @else {
          <app-card-image [faceDown]="true" />
        }
      </div>
      @if (showProgress()) {
        <p class="stream__progress" aria-live="polite">
          Card {{ progressLabel() }} of {{ totalCards() }}
        </p>
      }
    </section>
  `,
  styleUrl: './card-stream.component.scss',
})
export class CardStreamComponent {
  readonly currentCard = input<Card | null>(null);
  readonly currentIndex = input(0);
  readonly totalCards = input(0);
  readonly showProgress = input(true);

  protected readonly progressLabel = computed(() =>
    Math.min(this.currentIndex() + 1, Math.max(this.totalCards(), 1)),
  );
}
