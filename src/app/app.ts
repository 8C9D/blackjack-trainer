import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

import { AppUpdateService } from './core/services/app-update.service';
import { storageWriteRefused } from './core/services/storage';
import { ThemeService } from './core/services/theme.service';

// The Flow shell is deliberately bare: no navigation chrome anywhere — the
// home screen's primary action is the app's entire information architecture.
@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet],
  template: `
    <!-- Takes space rather than floating: a browser that will not keep the
         practice is a condition, not a prompt, and the drill behind it goes on
         grading and counting as if nothing were wrong. -->
    @if (storageRefused()) {
      <div class="lost" role="alert">
        <strong>This browser is not saving your practice.</strong>
        <span>
          Its storage is full or blocked — private browsing does this. Hands you play now will be
          gone when you leave.
        </span>
        <a routerLink="/settings">Back up what is still stored</a>
      </div>
    }
    <router-outlet />
    <!-- One banner, two states. An available update is an offer and can wait;
         a worker that has lost its cached files is a fault the app cannot get
         out of on its own, so that state keeps the reload and drops "Later". -->
    @if (updates.updateReady() || updates.recoveryNeeded()) {
      <aside
        class="update"
        [attr.aria-label]="
          updates.recoveryNeeded() ? 'App needs reloading' : 'App update available'
        "
      >
        <div class="update__copy" role="status" aria-live="polite">
          @if (updates.recoveryNeeded()) {
            <strong>Reload to repair this app</strong>
            <span>
              Some of its stored files are missing, so parts of it will not work. Reloading fetches
              a fresh copy. Your practice is saved separately and is not affected.
            </span>
          } @else {
            <strong>Update ready</strong>
            <span>A newer version of Blackjack Trainer is available.</span>
          }
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
          @if (!updates.recoveryNeeded()) {
            <button
              class="update__later"
              type="button"
              [disabled]="updates.reloading()"
              (click)="updates.dismiss()"
            >
              Later
            </button>
          }
        </div>
      </aside>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.scss',
})
export class App {
  // The shell is the only thing guaranteed to exist for the whole session, so
  // it owns the theme service's lifetime; nothing else needs to inject it.
  protected readonly theme = inject(ThemeService);
  protected readonly updates = inject(AppUpdateService);
  protected readonly storageRefused = storageWriteRefused;
}
