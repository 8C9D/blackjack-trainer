import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SwUpdate, type UnrecoverableStateEvent, type VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';

import { App } from './app';
import { APP_ROUTES } from './app.routes';
import { PAGE_RELOAD } from './core/services/app-update.service';
import { resetStorageWriteRefused, writeJson } from './core/services/storage';

describe('App', () => {
  let versionUpdates: Subject<VersionEvent>;
  let unrecoverable: Subject<UnrecoverableStateEvent>;
  let reloadPage: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    localStorage.clear();
    versionUpdates = new Subject<VersionEvent>();
    unrecoverable = new Subject<UnrecoverableStateEvent>();
    reloadPage = vi.fn();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(APP_ROUTES),
        {
          provide: SwUpdate,
          useValue: { isEnabled: true, versionUpdates, unrecoverable },
        },
        { provide: PAGE_RELOAD, useValue: reloadPage },
      ],
    }).compileComponents();
  });

  function announceUpdate(): void {
    versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'old' },
      latestVersion: { hash: 'new' },
    });
  }

  function announceUnrecoverable(): void {
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'cached response missing' });
  }

  it('is a bare shell: a router outlet and no navigation chrome', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
    expect(compiled.querySelector('nav')).toBeNull();
  });

  it('offers to reload or dismiss when a PWA update is ready', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.update')).toBeNull();

    announceUpdate();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.update')?.textContent).toContain('Update ready');
    expect(compiled.querySelector('.update__copy')?.getAttribute('role')).toBe('status');
    // These three were static attributes until the banner grew a second state.
    // Pinned on this side too, so the recovery branch cannot quietly take the
    // accessible name or the announcement politeness away from this one.
    expect(compiled.querySelector('.update__copy')?.getAttribute('aria-live')).toBe('polite');
    expect(compiled.querySelector('.update')?.getAttribute('aria-label')).toBe(
      'App update available',
    );

    (compiled.querySelector('.update__later') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(compiled.querySelector('.update')).toBeNull();
  });

  // A worker that has lost cached files serves an app that half-works, and the
  // shell was the only place that could say so.
  it('asks for a reload, with no way to dismiss it, when the worker breaks', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.update')).toBeNull();

    announceUnrecoverable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const banner = compiled.querySelector('.update');
    expect(banner?.textContent).toContain('Reload to repair this app');
    expect(banner?.textContent).not.toContain('A newer version');
    expect(banner?.getAttribute('aria-label')).toBe('App needs reloading');
    // A fault interrupts; an offer waits its turn.
    expect(compiled.querySelector('.update__copy')?.getAttribute('role')).toBe('alert');
    expect(compiled.querySelector('.update__copy')?.getAttribute('aria-live')).toBe('assertive');
    // Dismissing a broken app would hide the only signal the trainee gets.
    expect(compiled.querySelector('.update__later')).toBeNull();

    (compiled.querySelector('.update__reload') as HTMLButtonElement).click();
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  // Nothing else in the app can tell: the drill goes on grading, the session bar
  // goes on counting, and Progress goes on showing what was stored before.
  describe('when the browser refuses to save', () => {
    afterEach(() => {
      resetStorageWriteRefused();
    });

    const refuseAWrite = () => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = () => {
        throw new Error('quota');
      };
      try {
        writeJson('app-spec-key', { hands: 1 });
      } finally {
        Storage.prototype.setItem = original;
      }
    };

    it('says so above every screen, and offers the backup that can still be taken', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.lost')).toBeNull();

      refuseAWrite();
      fixture.detectChanges();
      const notice = fixture.nativeElement.querySelector('.lost') as HTMLElement;
      expect(notice.textContent).toContain('not saving your practice');
      expect(notice.getAttribute('role')).toBe('alert');
      expect(notice.querySelector('a')?.getAttribute('href')).toBe('/settings');
    });
  });

  // The banner is `position: fixed` over the bottom of the viewport, and the
  // drill screens are exactly viewport-tall and cannot scroll, so anything the
  // banner covers is unreachable. The shell publishes what it covers; the
  // layouts subtract it. jsdom has no layout engine, so the element's rect is
  // stubbed — the wiring is what is under test, and the geometry it produces is
  // measured in a real browser (reviews/ARTIFACTS-round3.md, N4).
  describe('the space the update banner stands in front of', () => {
    // jsdom's window is 768 tall by default; the geometry below was measured at
    // 375x700, so the viewport is pinned to match it.
    function pinViewportHeight(height: number): void {
      Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
    }

    // Drive the real failure path rather than poking the signal: the banner's
    // own Reload button, with the injected page reload throwing.
    function failAReload(fixture: ComponentFixture<App>, host: HTMLElement): void {
      reloadPage.mockImplementationOnce(() => {
        throw new Error('reload refused');
      });
      (host.querySelector('.update__reload') as HTMLButtonElement).click();
      fixture.detectChanges();
    }

    function stubRect(element: HTMLElement, top: number, height: number): void {
      const rect = {
        top,
        height,
        bottom: top + height,
        left: 0,
        right: 375,
        width: 375,
        x: 0,
        y: top,
      } as DOMRect;
      element.getBoundingClientRect = () => rect;
    }

    it('is zero while no banner is up', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelector('.update')).toBeNull();
      expect(host.style.getPropertyValue('--update-space')).toBe('0px');
    });

    it('is the banner height plus the gap it floats above, once one is up', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;

      pinViewportHeight(700);
      announceUpdate();
      fixture.detectChanges();
      const banner = host.querySelector('.update') as HTMLElement;
      // The geometry a real Chromium measures at 375x700: the banner stacks into
      // a column below the 34rem breakpoint and floats 16px off the bottom.
      stubRect(banner, 538.03, 145.97);
      window.dispatchEvent(new Event('resize'));
      fixture.detectChanges();

      // 700 - 538.03, rounded up: the whole band from its top edge to the floor.
      expect(host.style.getPropertyValue('--update-space')).toBe('162px');
    });

    // A copy change has to re-measure: the element is the same element, so
    // nothing about the view tells the shell its height moved. What this pins is
    // the dependency — delete `updateFailed()`/`recoveryNeeded()` from the
    // afterRenderEffect and it fails with 162px where 183px is wanted.
    //
    // What it cannot pin, stated so nobody reads more into it: that the
    // measurement is taken *after* the DOM refreshes. jsdom has no render
    // timing, so this test passes against a plain `effect` too — which the app
    // shipped for one commit, leaving the reserve 21px short of a grown banner
    // in a real browser (REVIEW-round3-stage3 F2, and the measurement in
    // reviews/ARTIFACTS-round3.md that answers it).
    it('follows the banner when only its copy grows', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;

      pinViewportHeight(700);
      announceUpdate();
      fixture.detectChanges();
      const banner = host.querySelector('.update') as HTMLElement;
      stubRect(banner, 538.03, 145.97);
      window.dispatchEvent(new Event('resize'));
      fixture.detectChanges();
      expect(host.style.getPropertyValue('--update-space')).toBe('162px');

      // A failed reload adds a line to the same banner: 145.97 -> 166.16, the
      // geometry a real Chromium measures for that state at this viewport.
      stubRect(banner, 517.84, 166.16);
      failAReload(fixture, host);
      fixture.detectChanges();
      expect(host.style.getPropertyValue('--update-space')).toBe('183px');
    });

    it('goes back to zero when the offer is dismissed', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;

      pinViewportHeight(700);
      announceUpdate();
      fixture.detectChanges();
      stubRect(host.querySelector('.update') as HTMLElement, 538.03, 145.97);
      window.dispatchEvent(new Event('resize'));
      fixture.detectChanges();
      expect(host.style.getPropertyValue('--update-space')).toBe('162px');

      (host.querySelector('.update__later') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(host.querySelector('.update')).toBeNull();
      expect(host.style.getPropertyValue('--update-space')).toBe('0px');
    });
  });

  it('reloads into an available update from the prompt', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    announceUpdate();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.update__reload') as HTMLButtonElement).click();

    expect(reloadPage).toHaveBeenCalledOnce();
  });

  describe('routing', () => {
    // The one navigation ritual every routing test shares: boot the shell,
    // navigate, settle, and hand back the rendered element.
    async function rendered(path: string): Promise<HTMLElement> {
      const fixture = TestBed.createComponent(App);
      await TestBed.inject(Router).navigateByUrl(path);
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    async function urlAfter(path: string): Promise<string> {
      await rendered(path);
      return TestBed.inject(Router).url;
    }

    it('launches into the home (Open) screen', async () => {
      const el = await rendered('/');
      expect(TestBed.inject(Router).url).toBe('/');
      expect(el.querySelector('.home__primary')).not.toBeNull();
    });

    it('redirects the pre-Flow trainer routes into the flow', async () => {
      expect(await urlAfter('/basic-strategy')).toBe('/drill/basic-strategy');
      expect(await urlAfter('/card-counting')).toBe('/drill/card-counting');
      expect(await urlAfter('/deviations')).toBe('/drill/deviations');
    });

    it('sends unknown routes home', async () => {
      expect(await urlAfter('/no-such-page')).toBe('/');
    });

    // Lazy `loadComponent` routes only fail at navigation time — a broken
    // import or a renamed export passes every component spec, so resolve each
    // one for real and assert its rendered shell.

    it('resolves the settings route', async () => {
      const el = await rendered('/settings');
      expect(el.querySelector('.settings__title')?.textContent).toContain('Settings');
    });

    it('resolves the chart route', async () => {
      const el = await rendered('/chart');
      expect(el.querySelector('.chart__title')?.textContent).toContain('Chart');
      expect(el.querySelectorAll('.chart__table')).toHaveLength(3);
    });

    it('resolves the progress route', async () => {
      const el = await rendered('/progress');
      expect(el.querySelector('.progress__title')?.textContent).toContain('Progress');
      expect(el.querySelectorAll('.progress__bar')).toHaveLength(7);
    });

    it('resolves each lazy drill route to its trainer', async () => {
      const basic = await rendered('/drill/basic-strategy');
      expect(basic.querySelector('.topbar__name')?.textContent).toBe('Basic Strategy');

      const counting = await rendered('/drill/card-counting');
      expect(counting.querySelector('.topbar__name')?.textContent).toBe('Card Counting');

      const deviations = await rendered('/drill/deviations');
      expect(deviations.querySelector('.topbar__name')?.textContent).toBe('Deviations');
    });

    it('sets the document title per route', async () => {
      await rendered('/');
      expect(document.title).toBe('Blackjack Trainer');
      await rendered('/settings');
      expect(document.title).toBe('Settings — Blackjack Trainer');
      await rendered('/drill/basic-strategy');
      expect(document.title).toBe('Basic Strategy — Blackjack Trainer');
    });
  });
});
