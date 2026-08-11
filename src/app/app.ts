import {
  afterRenderEffect,
  Component,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
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
        #updateBanner
        class="update"
        [attr.aria-label]="
          updates.recoveryNeeded() ? 'App needs reloading' : 'App update available'
        "
      >
        <!-- An offer can wait its turn behind whatever the screen reader is
             saying; a broken app cannot, and the storage banner above already
             sets that precedent for a fault. -->
        <div
          class="update__copy"
          [attr.role]="updates.recoveryNeeded() ? 'alert' : 'status'"
          [attr.aria-live]="updates.recoveryNeeded() ? 'assertive' : 'polite'"
        >
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
  // The banner floats over the screen, so the screen has to know how much of
  // itself is behind it. Published as a custom property the layouts read; 0 when
  // there is no banner, which is every render but the two that raise one.
  host: { '[style.--update-space]': 'bannerSpace() + "px"' },
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.scss',
})
export class App {
  // The shell is the only thing guaranteed to exist for the whole session, so
  // it owns the theme service's lifetime; nothing else needs to inject it.
  protected readonly theme = inject(ThemeService);
  protected readonly updates = inject(AppUpdateService);
  protected readonly storageRefused = storageWriteRefused;

  private readonly banner = viewChild<ElementRef<HTMLElement>>('updateBanner');

  /** Pixels at the bottom of the viewport the banner is sitting in front of. */
  protected readonly bannerSpace = signal(0);

  constructor() {
    // Re-measure whenever the banner appears or disappears, and whenever its
    // content changes height: the recovery copy is longer than the offer's, and
    // a failed reload adds a line to both. This has to run *after* the DOM is
    // refreshed, which is what separates it from a plain `effect`: when only the
    // copy changes, the element is the same element, so an effect would measure
    // the height the banner had before the change and leave the reserve short by
    // however much the new copy added.
    afterRenderEffect(() => {
      this.updates.recoveryNeeded();
      this.updates.updateFailed();
      this.measureBanner();
    });
  }

  // The banner is a row above the 34rem breakpoint and a column below it, so a
  // rotation changes its height without changing any signal.
  @HostListener('window:resize')
  protected onViewportResize(): void {
    this.measureBanner();
  }

  private measureBanner(): void {
    const element = this.banner()?.nativeElement;
    if (!element) {
      this.bannerSpace.set(0);
      return;
    }
    const rect = element.getBoundingClientRect();
    // Its own height plus the gap it floats above, in one read. A zero height is
    // a layout-less environment (jsdom), not a zero-height banner, and reserving
    // the whole viewport there would be worse than reserving nothing.
    const space = rect.height === 0 ? 0 : window.innerHeight - rect.top;
    this.bannerSpace.set(Math.max(0, Math.ceil(space)));
  }
}
