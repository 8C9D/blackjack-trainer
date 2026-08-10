import { TestBed } from '@angular/core/testing';
import { SwUpdate, type UnrecoverableStateEvent, type VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';

import { AppUpdateService, PAGE_RELOAD } from './app-update.service';

describe('AppUpdateService', () => {
  let versionUpdates: Subject<VersionEvent>;
  let unrecoverable: Subject<UnrecoverableStateEvent>;
  let reloadPage: ReturnType<typeof vi.fn>;

  function configure(isEnabled = true): AppUpdateService {
    versionUpdates = new Subject<VersionEvent>();
    unrecoverable = new Subject<UnrecoverableStateEvent>();
    reloadPage = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        AppUpdateService,
        {
          provide: SwUpdate,
          useValue: { isEnabled, versionUpdates, unrecoverable },
        },
        { provide: PAGE_RELOAD, useValue: reloadPage },
      ],
    });
    return TestBed.inject(AppUpdateService);
  }

  function announceReady(): void {
    versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'old' },
      latestVersion: { hash: 'new' },
    });
  }

  // What the worker emits when it can no longer serve the version it is on:
  // a cached resource is gone and re-fetching it failed.
  function announceUnrecoverable(): void {
    unrecoverable.next({
      type: 'UNRECOVERABLE_STATE',
      reason: 'cached response missing',
    });
  }

  it('announces a newly downloaded version', () => {
    const service = configure();

    announceReady();

    expect(service.updateReady()).toBe(true);
    expect(service.updateFailed()).toBe(false);
  });

  it('ignores version events when the service worker is disabled', () => {
    const service = configure(false);

    announceReady();

    expect(service.updateReady()).toBe(false);
  });

  it('can run without a service-worker provider', () => {
    TestBed.configureTestingModule({
      providers: [AppUpdateService, { provide: PAGE_RELOAD, useValue: vi.fn() }],
    });

    const service = TestBed.inject(AppUpdateService);

    expect(service.updateReady()).toBe(false);
    expect(() => service.reload()).not.toThrow();
  });

  it('ignores non-ready service-worker events', () => {
    const service = configure();

    versionUpdates.next({
      type: 'VERSION_DETECTED',
      version: { hash: 'new' },
    });

    expect(service.updateReady()).toBe(false);
  });

  it('dismisses the current update prompt', () => {
    const service = configure();
    announceReady();

    service.dismiss();

    expect(service.updateReady()).toBe(false);
  });

  it('clears a prior reload error when the prompt is dismissed', () => {
    const service = configure();
    announceReady();
    reloadPage.mockImplementation(() => {
      throw new Error('reload refused');
    });
    service.reload();

    service.dismiss();

    expect(service.updateReady()).toBe(false);
    expect(service.updateFailed()).toBe(false);
  });

  it('reloads into the waiting version', () => {
    const service = configure();
    announceReady();

    service.reload();

    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it('prevents duplicate reload attempts', () => {
    const service = configure();

    service.reload();
    service.reload();

    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it('reports a worker that can no longer serve its version', () => {
    const service = configure();

    announceUnrecoverable();

    expect(service.recoveryNeeded()).toBe(true);
    // Not an update: the app is broken now, not improvable later.
    expect(service.updateReady()).toBe(false);
  });

  it('does not report recovery until the worker says so', () => {
    const service = configure();

    announceReady();

    expect(service.recoveryNeeded()).toBe(false);
  });

  it('ignores an unrecoverable worker when the service worker is disabled', () => {
    const service = configure(false);

    announceUnrecoverable();

    expect(service.recoveryNeeded()).toBe(false);
  });

  it('will not let a broken worker be dismissed', () => {
    const service = configure();
    announceUnrecoverable();

    service.dismiss();

    expect(service.recoveryNeeded()).toBe(true);
  });

  it('reloads out of an unrecoverable state on request', () => {
    const service = configure();
    announceUnrecoverable();

    service.reload();

    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it('keeps the prompt usable when the browser refuses to reload', () => {
    const service = configure();
    announceReady();
    reloadPage.mockImplementation(() => {
      throw new Error('reload refused');
    });

    service.reload();

    expect(reloadPage).toHaveBeenCalledOnce();
    expect(service.updateReady()).toBe(true);
    expect(service.reloading()).toBe(false);
    expect(service.updateFailed()).toBe(true);
  });
});
