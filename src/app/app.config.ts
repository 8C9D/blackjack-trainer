import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { APP_ROUTES } from './app.routes';
import { CardGeneratorService } from './core/services/card-generator.service';
import { RANDOM_SOURCE } from './core/services/random-source';
import { ShoeService } from './core/services/shoe.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(APP_ROUTES, withComponentInputBinding()),
    // The two services that hold their own random source predate the injectable
    // one and keep `Math.random` as their default, so a `?seed=` session has to
    // push the seeded generator into them. Runs before the router activates any
    // route, and does nothing at all when no seed was asked for — an ordinary
    // visit leaves both services exactly as they were.
    provideAppInitializer(() => {
      const random = inject(RANDOM_SOURCE);
      if (random === Math.random) return;
      inject(CardGeneratorService).setRandomSource(random);
      inject(ShoeService).setRandomSource(random);
    }),
    // Offline/installable PWA. Registration waits for the app to go stable (or
    // 30s) so the first paint never competes with the service-worker install.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
