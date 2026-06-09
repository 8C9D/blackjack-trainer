import { Component, HostListener, inject, signal } from '@angular/core';

import { actionForKey, shouldIgnoreKeyboardEvent } from '../../core/keyboard';
import type { Scenario } from '../../core/models/card.model';
import {
  DEFAULT_ENGINE_OPTIONS,
  type Action,
  type EngineOptions,
  type EvaluationResult,
  type RuleSet,
} from '../../core/models/strategy.model';
import { BasicStrategyEngineService } from '../../core/services/basic-strategy-engine.service';
import { BasicStrategyStatsService } from '../../core/services/basic-strategy-stats.service';
import { CardGeneratorService } from '../../core/services/card-generator.service';
import { RuleControlsComponent } from '../../shared/rule-controls.component';
import { StatsPanelComponent } from '../../shared/stats-panel.component';
import { ActionButtonsComponent } from './action-buttons.component';
import { BlackjackTableComponent } from './blackjack-table.component';
import { FeedbackPanelComponent } from './feedback-panel.component';

@Component({
  selector: 'app-basic-strategy-page',
  imports: [
    RuleControlsComponent,
    BlackjackTableComponent,
    ActionButtonsComponent,
    FeedbackPanelComponent,
    StatsPanelComponent,
  ],
  template: `
    <div class="page">
      <header class="page__header">
        <h1>Blackjack Basic Strategy Trainer</h1>
        <p class="page__subtitle">Practice initial two-card hands.</p>
      </header>

      <section class="page__rule-controls" aria-label="Rule controls">
        <app-rule-controls
          [ruleSet]="ruleSet()"
          [options]="options()"
          (ruleSetChange)="ruleSet.set($event)"
          (optionsChange)="options.set($event)"
        />
      </section>

      <app-blackjack-table [player]="scenario().player" [dealerUpcard]="scenario().dealerUpcard" />

      <app-action-buttons [disabled]="result() !== null" (action)="answer($event)" />

      <app-feedback-panel [result]="result()" (next)="nextHand()" />

      <app-stats-panel [stats]="statsService.stats()" (reset)="statsService.reset()" />
    </div>
  `,
  styleUrl: './basic-strategy-page.component.scss',
})
export class BasicStrategyPageComponent {
  private readonly engine = inject(BasicStrategyEngineService);
  private readonly generator = inject(CardGeneratorService);
  protected readonly statsService = inject(BasicStrategyStatsService);

  protected readonly ruleSet = signal<RuleSet>('S17');
  protected readonly options = signal<EngineOptions>(DEFAULT_ENGINE_OPTIONS);
  protected readonly scenario = signal<Scenario>(this.generator.generate());
  protected readonly result = signal<EvaluationResult | null>(null);

  protected answer(action: Action): void {
    if (this.result() !== null) return;
    const result = this.engine.evaluate(
      {
        player: this.scenario().player,
        dealerUpcard: this.scenario().dealerUpcard,
        ruleSet: this.ruleSet(),
        options: this.options(),
      },
      action,
    );
    this.result.set(result);
    this.statsService.recordAttempt(result.correct);
  }

  protected nextHand(): void {
    this.scenario.set(this.generator.generate());
    this.result.set(null);
  }

  @HostListener('window:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    if (shouldIgnoreKeyboardEvent(event)) return;
    if (event.key === 'Enter') {
      if (this.result() !== null) {
        event.preventDefault();
        this.nextHand();
      }
      return;
    }
    const action = actionForKey(event.key);
    if (action) {
      event.preventDefault();
      this.answer(action);
    }
  }
}
