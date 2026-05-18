import { Component, computed, HostListener, inject, signal } from '@angular/core';

import {
  ACTION_LABELS,
  type Action,
  type EngineOptions,
  type EvaluationResult,
  type RuleSet,
} from '../../core/models/strategy.model';
import { BasicStrategyEngineService } from '../../core/services/basic-strategy-engine.service';
import {
  CardGeneratorService,
  type Scenario,
} from '../../core/services/card-generator.service';
import { BlackjackTableComponent } from './blackjack-table.component';

interface SessionStats {
  readonly attempts: number;
  readonly correct: number;
  readonly streak: number;
  readonly longestStreak: number;
}

const ACTION_ORDER: readonly Action[] = ['H', 'S', 'D', 'P', 'SUR', 'INS'];

const KEYBOARD_BINDINGS: Readonly<Record<string, Action>> = {
  h: 'H',
  s: 'S',
  d: 'D',
  p: 'P',
  r: 'SUR',
  i: 'INS',
};

// Slice 3 will extract the controls / actions / feedback / stats into their
// own components and persist stats to localStorage.
@Component({
  selector: 'app-basic-strategy-page',
  imports: [BlackjackTableComponent],
  template: `
    <div class="page">
      <header class="page__header">
        <h1>Blackjack Basic Strategy Trainer</h1>
        <p class="page__subtitle">Practice initial two-card hands.</p>
      </header>

      <section class="controls" aria-label="Rule controls">
        <fieldset class="controls__group">
          <legend>Dealer rule</legend>
          <label>
            <input
              type="radio"
              name="ruleSet"
              [checked]="ruleSet() === 'S17'"
              (change)="setRuleSet('S17')"
            />
            S17 — stand on soft 17
          </label>
          <label>
            <input
              type="radio"
              name="ruleSet"
              [checked]="ruleSet() === 'H17'"
              (change)="setRuleSet('H17')"
            />
            H17 — hit on soft 17
          </label>
        </fieldset>

        <fieldset class="controls__group">
          <legend>Table options</legend>
          <label>
            <input
              type="checkbox"
              [checked]="options().doubleAfterSplit"
              (change)="toggleDAS()"
            />
            Double After Split (DAS)
          </label>
          <label>
            <input
              type="checkbox"
              [checked]="options().lateSurrender"
              (change)="toggleSurrender()"
            />
            Late Surrender
          </label>
        </fieldset>
      </section>

      <app-blackjack-table
        [player]="scenario().player"
        [dealerUpcard]="scenario().dealerUpcard"
      />

      <section class="actions" aria-label="Player actions">
        @for (a of actions; track a) {
          <button
            type="button"
            class="actions__button"
            [disabled]="result() !== null"
            (click)="answer(a)"
          >
            {{ labelFor(a) }}
            <span class="actions__hint">[{{ keyHint(a) }}]</span>
          </button>
        }
      </section>

      @if (result(); as r) {
        <section
          class="feedback"
          [class.feedback--correct]="r.correct"
          [class.feedback--incorrect]="!r.correct"
          aria-live="polite"
        >
          <p class="feedback__verdict">
            {{ r.correct ? 'Correct.' : 'Incorrect.' }}
          </p>
          <dl class="feedback__details">
            <dt>Hand</dt>
            <dd>{{ r.handDescription }}</dd>
            <dt>Correct action</dt>
            <dd>{{ labelFor(r.action) }}</dd>
            <dt>Why</dt>
            <dd>{{ r.reason }}</dd>
          </dl>
          <button type="button" class="feedback__next" (click)="nextHand()">
            Deal next hand [Enter]
          </button>
        </section>
      }

      <section class="stats" aria-label="Session statistics">
        <div><strong>Attempts</strong>: {{ stats().attempts }}</div>
        <div><strong>Correct</strong>: {{ stats().correct }}</div>
        <div><strong>Accuracy</strong>: {{ accuracyDisplay() }}</div>
        <div><strong>Streak</strong>: {{ stats().streak }}</div>
        <div><strong>Longest streak</strong>: {{ stats().longestStreak }}</div>
      </section>
    </div>
  `,
  styleUrl: './basic-strategy-page.component.scss',
})
export class BasicStrategyPageComponent {
  private readonly engine = inject(BasicStrategyEngineService);
  private readonly generator = inject(CardGeneratorService);

  protected readonly actions = ACTION_ORDER;

  protected readonly ruleSet = signal<RuleSet>('S17');
  protected readonly options = signal<EngineOptions>({
    doubleAfterSplit: false,
    lateSurrender: false,
  });
  protected readonly scenario = signal<Scenario>(this.generator.generate());
  protected readonly result = signal<EvaluationResult | null>(null);
  protected readonly stats = signal<SessionStats>({
    attempts: 0,
    correct: 0,
    streak: 0,
    longestStreak: 0,
  });

  protected readonly accuracyDisplay = computed(() => {
    const s = this.stats();
    if (s.attempts === 0) return '—';
    return `${Math.round((s.correct / s.attempts) * 100)}%`;
  });

  protected setRuleSet(rs: RuleSet): void {
    this.ruleSet.set(rs);
  }

  protected toggleDAS(): void {
    this.options.update((o) => ({ ...o, doubleAfterSplit: !o.doubleAfterSplit }));
  }

  protected toggleSurrender(): void {
    this.options.update((o) => ({ ...o, lateSurrender: !o.lateSurrender }));
  }

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
    this.stats.update((s) => {
      const attempts = s.attempts + 1;
      const correct = s.correct + (result.correct ? 1 : 0);
      const streak = result.correct ? s.streak + 1 : 0;
      const longestStreak = Math.max(s.longestStreak, streak);
      return { attempts, correct, streak, longestStreak };
    });
  }

  protected nextHand(): void {
    this.scenario.set(this.generator.generate());
    this.result.set(null);
  }

  protected labelFor(action: Action): string {
    return ACTION_LABELS[action];
  }

  protected keyHint(action: Action): string {
    for (const [key, mapped] of Object.entries(KEYBOARD_BINDINGS)) {
      if (mapped === action) return key.toUpperCase();
    }
    return '';
  }

  @HostListener('window:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
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
