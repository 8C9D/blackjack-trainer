import type { Routes } from '@angular/router';

import { BasicStrategyPageComponent } from './features/basic-strategy/basic-strategy-page.component';
import { CardCountingPageComponent } from './features/card-counting/card-counting-page.component';
import { DeviationsPageComponent } from './features/deviations/deviations-page.component';

export const APP_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'basic-strategy' },
  { path: 'basic-strategy', component: BasicStrategyPageComponent, title: 'Basic Strategy Trainer' },
  { path: 'card-counting', component: CardCountingPageComponent, title: 'Card Counting Trainer' },
  { path: 'deviations', component: DeviationsPageComponent, title: 'Deviations Trainer' },
  { path: '**', redirectTo: 'basic-strategy' },
];
