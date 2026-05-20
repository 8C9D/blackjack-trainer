import { Component, input, output } from '@angular/core';

import type {
  EngineOptions,
  RuleSet,
} from '../../core/models/strategy.model';

@Component({
  selector: 'app-deviation-settings',
  template: `
    <section class="deviation-settings" aria-label="Deviation trainer settings">
      <fieldset class="deviation-settings__group">
        <legend>Dealer rule</legend>
        <label>
          <input
            type="radio"
            name="deviation-ruleSet"
            [checked]="ruleSet() === 'S17'"
            (change)="ruleSetChange.emit('S17')"
          />
          S17 — stand on soft 17
        </label>
        <label>
          <input
            type="radio"
            name="deviation-ruleSet"
            [checked]="ruleSet() === 'H17'"
            (change)="ruleSetChange.emit('H17')"
          />
          H17 — hit on soft 17
        </label>
      </fieldset>

      <fieldset class="deviation-settings__group">
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
  styleUrl: './deviation-settings.component.scss',
})
export class DeviationSettingsComponent {
  readonly ruleSet = input.required<RuleSet>();
  readonly options = input.required<EngineOptions>();

  readonly ruleSetChange = output<RuleSet>();
  readonly optionsChange = output<EngineOptions>();

  protected toggle(key: keyof EngineOptions): void {
    const next: EngineOptions = { ...this.options(), [key]: !this.options()[key] };
    this.optionsChange.emit(next);
  }
}
