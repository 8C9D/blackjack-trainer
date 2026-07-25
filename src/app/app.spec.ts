import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { App } from './app';
import { APP_ROUTES } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(APP_ROUTES)],
    }).compileComponents();
  });

  it('is a bare shell: a router outlet and no navigation chrome', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
    expect(compiled.querySelector('nav')).toBeNull();
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
