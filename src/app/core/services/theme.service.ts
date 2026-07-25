import { Injectable, computed, effect, inject, signal, type Signal } from '@angular/core';

import { FlowPrefsService, type ThemePref } from './flow-prefs.service';

export type ResolvedTheme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

// The `--ground` value of each palette in styles.scss. Duplicated as a literal
// because browser chrome (the address bar, the iOS standalone status bar) can
// only be handed a resolved color, not a custom property.
const THEME_COLORS: Readonly<Record<ResolvedTheme, string>> = {
  dark: '#15171c',
  light: '#f4f5f8',
};

// Turns the stored theme preference into what the document actually shows.
// CSS already resolves 'system' on its own via `prefers-color-scheme`; this
// service exists for the two things CSS cannot do: pin an explicit choice
// (`data-theme` on <html>, which the palette's attribute rules key off) and
// keep the `theme-color` meta in step so the browser chrome matches.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly prefs = inject(FlowPrefsService);

  private readonly systemDark = signal(matchesDark());

  readonly preference: Signal<ThemePref> = computed(() => this.prefs.prefs().theme);

  readonly resolved: Signal<ResolvedTheme> = computed(() => {
    const preference = this.preference();
    if (preference !== 'system') return preference;
    return this.systemDark() ? 'dark' : 'light';
  });

  constructor() {
    this.watchSystem();
    effect(() => this.apply(this.preference(), this.resolved()));
  }

  private apply(preference: ThemePref, resolved: ResolvedTheme): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    // 'system' removes the attribute rather than writing it, so the palette's
    // `prefers-color-scheme` media rule is the one left standing.
    if (preference === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', preference);
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', THEME_COLORS[resolved]);
  }

  private watchSystem(): void {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia(DARK_QUERY);
    // Safari < 14 only has the deprecated listener API; both are optional here
    // because a test double may implement neither.
    query.addEventListener?.('change', (event) => this.systemDark.set(event.matches));
  }
}

function matchesDark(): boolean {
  // No matchMedia (SSR, older test doubles) falls back to the dark palette,
  // which is what :root declares before any media query applies.
  if (typeof matchMedia !== 'function') return true;
  return matchMedia(DARK_QUERY).matches;
}
