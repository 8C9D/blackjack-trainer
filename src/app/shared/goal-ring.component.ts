import { Component, computed, input } from '@angular/core';

// Daily-goal progress ring (home + done screens). Fill is a conic gradient in
// the accent color; a met goal switches the whole ring to the success color.
@Component({
  selector: 'app-goal-ring',
  template: `
    <div
      class="ring"
      [class.ring--met]="met()"
      [style.--ring-fill.deg]="fillDegrees()"
      role="img"
      [attr.aria-label]="value() + ' of ' + goal() + ' ' + label()"
    >
      <div class="ring__inner">
        <b class="ring__count">{{ value() }}/{{ goal() }}</b>
        <small class="ring__label">{{ label() }}</small>
      </div>
    </div>
  `,
  styleUrl: './goal-ring.component.scss',
})
export class GoalRingComponent {
  readonly value = input.required<number>();
  readonly goal = input.required<number>();
  readonly label = input<string>('hands today');

  protected readonly met = computed(() => this.value() >= this.goal());

  protected readonly fillDegrees = computed(() => {
    const goal = this.goal();
    if (goal <= 0) return 360;
    return Math.min(360, Math.round((this.value() / goal) * 360));
  });
}
