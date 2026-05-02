import { Component, input, output } from '@angular/core';

import type {
  EngineOptions,
  RuleSet,
} from '../../core/models/strategy.model';

@Component({
  selector: 'app-rule-selector',
  template: `
    <section class="rule-selector" aria-label="Rule controls">
      <fieldset class="rule-selector__group">
        <legend>Dealer rule</legend>
        <label>
          <input
            type="radio"
            name="ruleSet"
            [checked]="ruleSet() === 'S17'"
            (change)="ruleSetChange.emit('S17')"
          />
          S17 — stand on soft 17
        </label>
        <label>
          <input
            type="radio"
            name="ruleSet"
            [checked]="ruleSet() === 'H17'"
            (change)="ruleSetChange.emit('H17')"
          />
          H17 — hit on soft 17
        </label>
      </fieldset>

      <fieldset class="rule-selector__group">
        <legend>Table options</legend>
        <label>
          <input
            type="checkbox"
            [checked]="options().doubleAfterSplit"
            (change)="toggle('doubleAfterSplit')"
          />
          Double After Split (DAS)
        </label>
        <label>
          <input
            type="checkbox"
            [checked]="options().lateSurrender"
            (change)="toggle('lateSurrender')"
          />
          Late Surrender
        </label>
      </fieldset>
    </section>
  `,
  styleUrl: './rule-selector.component.scss',
})
export class RuleSelectorComponent {
  readonly ruleSet = input.required<RuleSet>();
  readonly options = input.required<EngineOptions>();

  readonly ruleSetChange = output<RuleSet>();
  readonly optionsChange = output<EngineOptions>();

  protected toggle(key: keyof EngineOptions): void {
    const next: EngineOptions = { ...this.options(), [key]: !this.options()[key] };
    this.optionsChange.emit(next);
  }
}
