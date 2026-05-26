import { Component, HostListener, inject, signal } from '@angular/core';

import {
  DEFAULT_ENGINE_OPTIONS,
  type Action,
  type EngineOptions,
  type EvaluationResult,
  type RuleSet,
} from '../../core/models/strategy.model';
import { BasicStrategyEngineService } from '../../core/services/basic-strategy-engine.service';
import { BasicStrategyStatsService } from '../../core/services/basic-strategy-stats.service';
import {
  CardGeneratorService,
  type Scenario,
} from '../../core/services/card-generator.service';
import { StatsPanelComponent } from '../../shared/stats-panel.component';
import { ActionButtonsComponent } from './action-buttons.component';
import { BlackjackTableComponent } from './blackjack-table.component';
import { FeedbackPanelComponent } from './feedback-panel.component';
import { RuleSelectorComponent } from './rule-selector.component';

// Keyboard letter → Action. Enter is handled separately (advances to next
// hand once feedback is shown).
const KEYBOARD_BINDINGS: Readonly<Record<string, Action>> = {
  h: 'H',
  s: 'S',
  d: 'D',
  p: 'P',
  r: 'SUR',
  i: 'INS',
};

@Component({
  selector: 'app-basic-strategy-page',
  imports: [
    RuleSelectorComponent,
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

      <app-rule-selector
        [ruleSet]="ruleSet()"
        [options]="options()"
        (ruleSetChange)="ruleSet.set($event)"
        (optionsChange)="options.set($event)"
      />

      <app-blackjack-table
        [player]="scenario().player"
        [dealerUpcard]="scenario().dealerUpcard"
      />

      <app-action-buttons
        [disabled]="result() !== null"
        (action)="answer($event)"
      />

      <app-feedback-panel
        [result]="result()"
        (next)="nextHand()"
      />

      <app-stats-panel
        [stats]="statsService.stats()"
        (reset)="statsService.reset()"
      />
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
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    // Don't hijack typing in form controls.
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      return;
    }
    if (event.key === 'Enter') {
      if (this.result() !== null) {
        event.preventDefault();
        this.nextHand();
      }
      return;
    }
    const action = KEYBOARD_BINDINGS[event.key.toLowerCase()];
    if (action) {
      event.preventDefault();
      this.answer(action);
    }
  }
}
