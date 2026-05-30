import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders a primary nav with all trainer links', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const labels = Array.from(compiled.querySelectorAll('nav a'))
      .map((a) => a.textContent?.trim());
    expect(labels).toContain('Basic Strategy');
    expect(labels).toContain('Card Counting');
    expect(labels).toContain('Deviations');
  });

  it('exposes a /deviations route in the primary nav', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const hrefs = Array.from(compiled.querySelectorAll('nav a'))
      .map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/deviations');
  });

  it('renders a router outlet', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
  });

  it('renders both a desktop top nav and a mobile bottom nav', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('nav.nav--top')).not.toBeNull();
    expect(compiled.querySelector('nav.nav--bottom')).not.toBeNull();
  });

  it('uses short labels on the mobile bottom nav targeting the same routes', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const tabs = Array.from(compiled.querySelectorAll('nav.nav--bottom a'));
    expect(tabs.map((a) => a.textContent?.trim())).toEqual([
      'Strategy',
      'Count',
      'Deviations',
    ]);
    expect(tabs.map((a) => a.getAttribute('href'))).toEqual([
      '/basic-strategy',
      '/card-counting',
      '/deviations',
    ]);
  });

  it('keeps full trainer names accessible on the mobile tabs', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const ariaLabels = Array.from(compiled.querySelectorAll('nav.nav--bottom a'))
      .map((a) => a.getAttribute('aria-label'));
    expect(ariaLabels).toEqual(['Basic Strategy', 'Card Counting', 'Deviations']);
  });
});
