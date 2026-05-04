import { Component } from '@angular/core';

import { HI_LO } from '../../data/counting-systems';

@Component({
  selector: 'app-card-counting-page',
  template: `
    <div class="page">
      <header class="page__header">
        <h1>Hi-Lo Card Counting Trainer</h1>
        <p class="page__subtitle">Practice running count with random card streams.</p>
      </header>

      <section class="placeholder" aria-label="Coming soon">
        <p>
          <strong>{{ system.name }}</strong> — {{ system.description }}
        </p>
        <p class="placeholder__note">
          Drill UI is coming in the next slice (settings, card stream, answer form, feedback).
        </p>
      </section>
    </div>
  `,
  styleUrl: './card-counting-page.component.scss',
})
export class CardCountingPageComponent {
  protected readonly system = HI_LO;
}
