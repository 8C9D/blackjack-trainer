import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface NavLink {
  readonly path: string;
  // Full label for the desktop top nav.
  readonly long: string;
  // Short label for the mobile bottom tab bar.
  readonly short: string;
}

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <nav class="nav nav--top" aria-label="Primary">
      @for (link of links; track link.path) {
        <a class="nav__link" [routerLink]="link.path" routerLinkActive="nav__link--active">{{
          link.long
        }}</a>
      }
    </nav>

    <main class="app-main">
      <router-outlet />
    </main>

    <nav class="nav nav--bottom" aria-label="Primary mobile">
      @for (link of links; track link.path) {
        <a
          class="nav__tab"
          [routerLink]="link.path"
          routerLinkActive="nav__tab--active"
          [attr.aria-label]="link.long"
          >{{ link.short }}</a
        >
      }
    </nav>
  `,
  styleUrl: './app.scss',
})
export class App {
  // Single source of truth for both navs; routes are unchanged from v1–v4.
  protected readonly links: readonly NavLink[] = [
    { path: '/basic-strategy', long: 'Basic Strategy', short: 'Strategy' },
    { path: '/card-counting', long: 'Card Counting', short: 'Count' },
    { path: '/deviations', long: 'Deviations', short: 'Deviations' },
  ];
}
