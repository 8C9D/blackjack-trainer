import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AppUpdateService } from './core/services/app-update.service';
import { ThemeService } from './core/services/theme.service';

// The Flow shell is deliberately bare: no navigation chrome anywhere — the
// home screen's primary action is the app's entire information architecture.
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    <router-outlet />
    @if (updates.updateReady()) {
      <aside class="update" aria-label="App update available">
        <div class="update__copy" role="status" aria-live="polite">
          <strong>Update ready</strong>
          <span>A newer version of Blackjack Trainer is available.</span>
          @if (updates.updateFailed()) {
            <span class="update__error" role="alert">Could not reload. Please try again.</span>
          }
        </div>
        <div class="update__actions">
          <button
            class="update__reload"
            type="button"
            [disabled]="updates.reloading()"
            (click)="updates.reload()"
          >
            {{ updates.reloading() ? 'Reloading…' : 'Reload' }}
          </button>
          <button
            class="update__later"
            type="button"
            [disabled]="updates.reloading()"
            (click)="updates.dismiss()"
          >
            Later
          </button>
        </div>
      </aside>
    }
  `,
  styleUrl: './app.scss',
})
export class App {
  // The shell is the only thing guaranteed to exist for the whole session, so
  // it owns the theme service's lifetime; nothing else needs to inject it.
  protected readonly theme = inject(ThemeService);
  protected readonly updates = inject(AppUpdateService);
}
