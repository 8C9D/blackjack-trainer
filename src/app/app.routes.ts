import type { Routes } from '@angular/router';

export const APP_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'basic-strategy' },
  {
    path: 'drill/basic-strategy',
    loadComponent: () =>
      import('./features/drill/basic-strategy-drill-page.component').then(
        (m) => m.BasicStrategyDrillPageComponent,
      ),
    title: 'Basic Strategy — Blackjack Trainer',
  },
  {
    path: 'drill/deviations',
    loadComponent: () =>
      import('./features/drill/deviations-drill-page.component').then(
        (m) => m.DeviationsDrillPageComponent,
      ),
    title: 'Deviations — Blackjack Trainer',
  },
  {
    path: 'basic-strategy',
    loadComponent: () =>
      import('./features/basic-strategy/basic-strategy-page.component').then(
        (m) => m.BasicStrategyPageComponent,
      ),
    title: 'Basic Strategy Trainer',
  },
  {
    path: 'card-counting',
    loadComponent: () =>
      import('./features/card-counting/card-counting-page.component').then(
        (m) => m.CardCountingPageComponent,
      ),
    title: 'Card Counting Trainer',
  },
  {
    path: 'deviations',
    loadComponent: () =>
      import('./features/deviations/deviations-page.component').then(
        (m) => m.DeviationsPageComponent,
      ),
    title: 'Deviations Trainer',
  },
  { path: '**', redirectTo: 'basic-strategy' },
];
