import { TestBed } from '@angular/core/testing';

import { FlowPrefsService } from './flow-prefs.service';
import { ThemeService } from './theme.service';

// A controllable `matchMedia` standing in for the OS setting. Only the dark
// query is answered; anything else reports no match, as a real browser does
// for a query it does not satisfy.
function stubMatchMedia(dark: boolean): { setDark: (value: boolean) => void } {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let matches = dark;
  const list = {
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
  };
  vi.stubGlobal('matchMedia', (query: string) =>
    query === list.media ? list : { ...list, matches: false },
  );
  return {
    setDark: (value: boolean) => {
      matches = value;
      for (const listener of listeners) listener({ matches: value } as MediaQueryListEvent);
    },
  };
}

function themeColor(): string | null {
  return document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null;
}

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.head.querySelector('meta[name="theme-color"]')?.remove();
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', '#15171c');
    document.head.appendChild(meta);
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-theme');
  });

  it("follows the OS when the preference is 'system', writing no attribute", () => {
    stubMatchMedia(false);
    const service = TestBed.inject(ThemeService);
    TestBed.tick();

    expect(service.preference()).toBe('system');
    expect(service.resolved()).toBe('light');
    // CSS resolves 'system' on its own; an attribute here would defeat the
    // prefers-color-scheme rule.
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(themeColor()).toBe('#f4f5f8');
  });

  it('re-resolves when the OS setting changes mid-session', () => {
    const media = stubMatchMedia(true);
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(service.resolved()).toBe('dark');

    media.setDark(false);
    TestBed.tick();
    expect(service.resolved()).toBe('light');
    expect(themeColor()).toBe('#f4f5f8');
  });

  it('pins the document to an explicit choice, overriding the OS', () => {
    const media = stubMatchMedia(true);
    const service = TestBed.inject(ThemeService);
    TestBed.inject(FlowPrefsService).setTheme('light');
    TestBed.tick();

    expect(service.resolved()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(themeColor()).toBe('#f4f5f8');

    // The OS flipping the other way must not disturb a pinned theme.
    media.setDark(false);
    TestBed.tick();
    expect(service.resolved()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('drops the attribute again when the choice returns to system', () => {
    stubMatchMedia(true);
    const prefs = TestBed.inject(FlowPrefsService);
    TestBed.inject(ThemeService);
    prefs.setTheme('light');
    TestBed.tick();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    prefs.setTheme('system');
    TestBed.tick();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(themeColor()).toBe('#15171c');
  });

  it('falls back to dark when the browser has no matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(service.resolved()).toBe('dark');
    expect(themeColor()).toBe('#15171c');
  });

  it('restores a pinned theme from storage on the next visit', () => {
    stubMatchMedia(true);
    TestBed.inject(FlowPrefsService).setTheme('light');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloaded = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(reloaded.preference()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
