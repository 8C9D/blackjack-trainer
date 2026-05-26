import { Component, input, output } from '@angular/core';

import type {
  EngineOptions,
  RuleSet,
} from '../core/models/strategy.model';

// Shared dealer-rule and table-options controls reused by both the Basic
// Strategy and Deviations trainers. The host element is `display: contents`
// so the two fieldsets participate in the parent layout directly — this
// keeps existing flex behavior identical on both pages.
@Component({
  selector: 'app-rule-controls',
  template: `
    <fieldset class="rule-controls__group">
      <legend>Dealer rule</legend>
      <label>
        <input
          type="radio"
          [name]="name()"
          [checked]="ruleSet() === 'S17'"
          (change)="ruleSetChange.emit('S17')"
        />
        S17 — stand on soft 17
      </label>
      <label>
        <input
          type="radio"
          [name]="name()"
          [checked]="ruleSet() === 'H17'"
          (change)="ruleSetChange.emit('H17')"
        />
        H17 — hit on soft 17
      </label>
    </fieldset>

    <fieldset class="rule-controls__group">
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
  `,
  styleUrl: './rule-controls.component.scss',
})
export class RuleControlsComponent {
  readonly ruleSet = input.required<RuleSet>();
  readonly options = input.required<EngineOptions>();
  // Radio `name` attribute. Pages that may host two rule-controls instances
  // in the same DOM should pass a distinct name (e.g. 'deviation-ruleSet')
  // so the radio groups don't collide.
  readonly name = input<string>('ruleSet');

  readonly ruleSetChange = output<RuleSet>();
  readonly optionsChange = output<EngineOptions>();

  protected toggle(key: keyof EngineOptions): void {
    const next: EngineOptions = { ...this.options(), [key]: !this.options()[key] };
    this.optionsChange.emit(next);
  }
}
