import { DOCUMENT } from '@angular/common';
import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { SwUpdate, type VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

export const PAGE_RELOAD = new InjectionToken<() => void>('PAGE_RELOAD', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return () => document.defaultView?.location.reload();
  },
});

@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  private readonly reloadPage = inject(PAGE_RELOAD);

  readonly updateReady = signal(false);
  readonly reloading = signal(false);
  readonly updateFailed = signal(false);

  constructor() {
    if (!this.swUpdate?.isEnabled) return;

    this.swUpdate.versionUpdates
      .pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'))
      .subscribe(() => {
        this.updateFailed.set(false);
        this.updateReady.set(true);
      });
  }

  dismiss(): void {
    this.updateReady.set(false);
    this.updateFailed.set(false);
  }

  reload(): void {
    if (!this.swUpdate || this.reloading()) return;

    this.reloading.set(true);
    this.updateFailed.set(false);
    try {
      // VERSION_READY means the complete update is already cached. Reloading
      // lets the service worker move this client to that version atomically.
      // Do not call activateUpdate(): Angular warns that force-activating before
      // the reload can mix an old app shell with newly named lazy chunks.
      this.reloadPage();
    } catch {
      this.reloading.set(false);
      this.updateFailed.set(true);
    }
  }
}
