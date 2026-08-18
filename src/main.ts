import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { cleanupLegacyStatsKeys } from './app/core/services/stats-store';

cleanupLegacyStatsKeys();

// A failed boot — a lazy chunk that 404s after a redeploy is the way it happens
// here — otherwise leaves an empty <app-root> and a console nobody on a phone
// can open. Angular is gone by the time this runs, so the notice is built by
// hand and styled inline: it must not depend on anything that could be the
// thing that failed. The colours come from the global stylesheet when it
// loaded, and fall back to the pre-boot ground and ink when it did not.
function showBootstrapFailure(): void {
  const host = document.querySelector('app-root') ?? document.body;
  const notice = document.createElement('div');
  notice.setAttribute('role', 'alert');
  notice.style.cssText = [
    'box-sizing:border-box',
    'min-height:100vh',
    'display:flex',
    'flex-direction:column',
    'justify-content:center',
    'gap:0.75rem',
    'max-width:32rem',
    'margin:0 auto',
    'padding:2rem 1.25rem',
    'background:var(--ground,#15171c)',
    'color:var(--ink,#e7e9ee)',
    'font-family:system-ui,-apple-system,"Segoe UI",sans-serif',
  ].join(';');

  const heading = document.createElement('h1');
  heading.textContent = 'Blackjack Trainer could not start.';
  heading.style.cssText = 'margin:0;font-size:1.15rem;font-weight:650';

  const body = document.createElement('p');
  body.textContent =
    'Something failed to load. Reload the page to try again — your practice history is stored in this browser and is untouched.';
  body.style.cssText = 'margin:0;font-size:0.9rem;line-height:1.5;color:var(--ink-2,#c6cad3)';

  notice.append(heading, body);
  host.replaceChildren(notice);
}

bootstrapApplication(App, appConfig).catch((err) => {
  console.error(err);
  showBootstrapFailure();
});
