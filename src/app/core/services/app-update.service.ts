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

  // The worker has lost cached resources it cannot re-fetch, so the version it
  // is serving can no longer be assembled. Unlike an available update this is
  // not an offer: the app is already broken and stays broken across reloads
  // until a fresh copy is fetched, and until this was watched the only signal
  // anyone got was a screen that quietly failed to work.
  readonly recoveryNeeded = signal(false);

  constructor() {
    if (!this.swUpdate?.isEnabled) return;

    this.swUpdate.versionUpdates
      .pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'))
      .subscribe(() => {
        this.updateFailed.set(false);
        this.updateReady.set(true);
      });

    // `updateFailed` is deliberately left alone. It means "your last reload
    // attempt failed", and this is the one state whose only offered action is a
    // reload — clearing it here would wipe that warning off a banner whose only
    // button had just refused to work.
    this.swUpdate.unrecoverable.subscribe(() => this.recoveryNeeded.set(true));
  }

  // Only the update offer is dismissible. A broken worker is a condition, not a
  // prompt — hiding it would leave the trainee with an app that does not work
  // and nothing at all to explain why.
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
