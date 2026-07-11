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
    async function urlAfter(path: string): Promise<string> {
      const fixture = TestBed.createComponent(App);
      const router = TestBed.inject(Router);
      await router.navigateByUrl(path);
      await fixture.whenStable();
      return router.url;
    }

    it('launches into the home (Open) screen', async () => {
      const fixture = TestBed.createComponent(App);
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(router.url).toBe('/');
      expect((fixture.nativeElement as HTMLElement).querySelector('.home__primary')).not.toBeNull();
    });

    it('redirects the pre-Flow trainer routes into the flow', async () => {
      expect(await urlAfter('/basic-strategy')).toBe('/drill/basic-strategy');
      expect(await urlAfter('/card-counting')).toBe('/drill/card-counting');
      expect(await urlAfter('/deviations')).toBe('/drill/deviations');
    });

    it('sends unknown routes home', async () => {
      expect(await urlAfter('/no-such-page')).toBe('/');
    });
  });
});
