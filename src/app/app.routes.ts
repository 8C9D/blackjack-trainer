import type { Routes } from '@angular/router';

export const APP_ROUTES: Routes = [
  // The app always launches into the Open moment: one primary action.
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/home/home-page.component').then((m) => m.HomePageComponent),
    title: 'Blackjack Trainer',
  },
  {
    path: 'chart',
    loadComponent: () =>
      import('./features/chart/chart-page.component').then((m) => m.ChartPageComponent),
    title: 'Strategy Chart — Blackjack Trainer',
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings-page.component').then((m) => m.SettingsPageComponent),
    title: 'Settings — Blackjack Trainer',
  },
  {
    path: 'drill/basic-strategy',
    loadComponent: () =>
      import('./features/drill/basic-strategy-drill-page.component').then(
        (m) => m.BasicStrategyDrillPageComponent,
      ),
    title: 'Basic Strategy — Blackjack Trainer',
  },
  {
    path: 'drill/card-counting',
    loadComponent: () =>
      import('./features/card-counting/card-counting-page.component').then(
        (m) => m.CardCountingPageComponent,
      ),
    title: 'Card Counting — Blackjack Trainer',
  },
  {
    path: 'drill/deviations',
    loadComponent: () =>
      import('./features/drill/deviations-drill-page.component').then(
        (m) => m.DeviationsDrillPageComponent,
      ),
    title: 'Deviations — Blackjack Trainer',
  },
  // Pre-Flow trainer routes redirect into the flow.
  { path: 'basic-strategy', redirectTo: 'drill/basic-strategy' },
  { path: 'card-counting', redirectTo: 'drill/card-counting' },
  { path: 'deviations', redirectTo: 'drill/deviations' },
  { path: '**', redirectTo: '' },
];
