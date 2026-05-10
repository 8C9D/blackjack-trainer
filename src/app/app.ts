import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <nav class="nav" aria-label="Primary">
      <a
        class="nav__link"
        routerLink="/basic-strategy"
        routerLinkActive="nav__link--active"
      >Basic Strategy</a>
      <a
        class="nav__link"
        routerLink="/card-counting"
        routerLinkActive="nav__link--active"
      >Card Counting</a>
      <a
        class="nav__link"
        routerLink="/deviations"
        routerLinkActive="nav__link--active"
      >Deviations</a>
    </nav>
    <router-outlet />
  `,
  styleUrl: './app.scss',
})
export class App {}
