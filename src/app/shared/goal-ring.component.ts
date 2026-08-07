import { Component, computed, input, ChangeDetectionStrategy } from '@angular/core';

// Daily-goal progress ring (home + done screens). Fill is a conic gradient in
// the accent color; a met goal switches the whole ring to the success color.
@Component({
  selector: 'app-goal-ring',
  template: `
    <div
      class="ring"
      [class.ring--met]="met()"
      [style.--ring-fill.deg]="fillDegrees()"
      role="progressbar"
      [attr.aria-label]="value() + ' of ' + goal() + ' ' + label()"
      [attr.aria-valuenow]="boundedValue()"
      aria-valuemin="0"
      [attr.aria-valuemax]="boundedGoal()"
    >
      <div class="ring__inner">
        <b class="ring__count">{{ value() }}/{{ goal() }}</b>
        <small class="ring__label">{{ label() }}</small>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './goal-ring.component.scss',
})
export class GoalRingComponent {
  readonly value = input.required<number>();
  readonly goal = input.required<number>();
  readonly label = input<string>('hands today');

  protected readonly met = computed(() => this.value() >= this.goal());

  // ARIA requires value-now to stay inside min/max even if a caller briefly
  // supplies an invalid value while preferences are being repaired.
  protected readonly boundedGoal = computed(() => Math.max(1, this.goal()));
  protected readonly boundedValue = computed(() =>
    Math.max(0, Math.min(this.value(), this.boundedGoal())),
  );

  protected readonly fillDegrees = computed(() => {
    const goal = this.goal();
    if (goal <= 0) return 360;
    return Math.max(0, Math.min(360, Math.round((this.value() / goal) * 360)));
  });
}
