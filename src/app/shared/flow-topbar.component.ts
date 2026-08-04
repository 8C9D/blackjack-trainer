import { Component, computed, input, output } from '@angular/core';

// Thin session header for the drill screens: exit, progress toward the
// session target, count, and the current correct-streak chip. This is the
// only chrome a drill screen carries — settings never appear here.
@Component({
  selector: 'app-flow-topbar',
  template: `
    <header class="topbar">
      <button
        type="button"
        class="topbar__exit"
        aria-label="End session (Esc)"
        (click)="exit.emit()"
      >
        ✕
      </button>
      @if (name()) {
        <h1 class="topbar__name">{{ name() }}</h1>
      }
      <div
        class="topbar__bar"
        role="progressbar"
        aria-label="Session progress"
        [attr.aria-valuenow]="boundedCount()"
        [attr.aria-valuemin]="0"
        [attr.aria-valuemax]="boundedTarget()"
        [attr.aria-valuetext]="boundedCount() + ' of ' + boundedTarget() + ' hands'"
      >
        <i class="topbar__fill" [style.width.%]="percent()"></i>
      </div>
      <span class="topbar__count">{{ count() }}/{{ target() }}</span>
      @if (streak() > 1) {
        <span class="topbar__streak">streak {{ streak() }}</span>
      }
      <span class="kcap">esc</span>
    </header>
  `,
  styleUrl: './flow-topbar.component.scss',
})
export class FlowTopbarComponent {
  // Trainer name — the drill screen's page heading. Visible on wide screens;
  // on phones it stays in the accessibility tree but not on screen.
  readonly name = input<string>('');
  readonly count = input.required<number>();
  readonly target = input.required<number>();
  // Current run of consecutive correct answers this session.
  readonly streak = input<number>(0);
  readonly exit = output<void>();

  protected readonly boundedTarget = computed(() => Math.max(1, this.target()));
  protected readonly boundedCount = computed(() =>
    Math.max(0, Math.min(this.count(), this.boundedTarget())),
  );

  protected readonly percent = computed(() => {
    const target = this.target();
    if (target <= 0) return 100;
    return Math.max(0, Math.min(100, (this.count() / target) * 100));
  });
}
