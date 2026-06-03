import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { cleanupLegacyStatsKeys } from './app/core/services/stats-store';

cleanupLegacyStatsKeys();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
