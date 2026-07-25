import { expect, test } from '../fixtures/app.fixture';

// The theme is the one feature that is *only* observable in a real browser:
// jsdom resolves no media queries and computes no custom properties, so the unit
// layer can assert the service's bookkeeping but never that the palette applied.
test.describe('theme', () => {
  // The resolved value of a palette token on <html>, e.g. '#15171c'.
  function token(page: import('@playwright/test').Page, name: string): Promise<string> {
    return page.evaluate(
      (property) => getComputedStyle(document.documentElement).getPropertyValue(property).trim(),
      name,
    );
  }

  function themeColorMeta(page: import('@playwright/test').Page): Promise<string | null> {
    return page.evaluate(
      () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
    );
  }

  test.describe('following the OS', () => {
    test.use({ colorScheme: 'light' });

    test('a light OS gets the light palette with no attribute written', async ({ page }) => {
      expect(await token(page, '--ground')).toBe('#f4f5f8');
      expect(await token(page, '--ink')).toBe('#1a1d23');
      // CSS resolves 'system' on its own; an attribute here would defeat the
      // prefers-color-scheme rule.
      expect(await page.locator('html').getAttribute('data-theme')).toBeNull();
      expect(await themeColorMeta(page)).toBe('#f4f5f8');
    });
  });

  test.describe('pinning a theme', () => {
    test.use({ colorScheme: 'dark' });

    test('a dark OS gets the dark palette by default', async ({ page }) => {
      expect(await token(page, '--ground')).toBe('#15171c');
      expect(await themeColorMeta(page)).toBe('#15171c');
    });

    test('Settings pins light over a dark OS, and it survives a reload', async ({ page }) => {
      await page.getByRole('button', { name: /Settings/ }).click();
      await page.getByLabel('Light', { exact: true }).check();

      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      expect(await token(page, '--ground')).toBe('#f4f5f8');
      expect(await themeColorMeta(page)).toBe('#f4f5f8');

      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      expect(await token(page, '--ground')).toBe('#f4f5f8');
    });

    test('"Match system" hands the choice back to the OS', async ({ page }) => {
      await page.goto('/settings');
      await page.getByLabel('Light', { exact: true }).check();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

      await page.getByLabel('Match system', { exact: true }).check();
      await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBeNull();
      // Back to the dark palette, because this context's OS is dark.
      expect(await token(page, '--ground')).toBe('#15171c');
    });

    test('the palette reaches the drill screens, not just Settings', async ({ page }) => {
      await page.goto('/settings');
      await page.getByLabel('Light', { exact: true }).check();

      await page.goto('/drill/basic-strategy');
      expect(await token(page, '--ground')).toBe('#f4f5f8');
      // The accent that carries text darkens on light backgrounds; the fill that
      // sits under dark text does not.
      expect(await token(page, '--accent-ink')).toBe('#8a5a06');
      expect(await token(page, '--accent')).toBe('#f2b64c');
    });
  });

  test.describe('reduced motion', () => {
    // Emulated on the page rather than via `test.use({ reducedMotion })`: this
    // suite overrides the `page` fixture (see fixtures/app.fixture.ts), and the
    // context-level option does not reach it.
    test('drops transition duration when the OS asks for less motion', async ({ page }) => {
      // The transition the drill actually animates, before and after the ask.
      const transitionSeconds = () =>
        page.evaluate(() => {
          const button = document.querySelector('.acts__btn');
          if (!button) return null;
          return Number.parseFloat(getComputedStyle(button).transitionDuration);
        });

      await page.goto('/drill/basic-strategy');
      // The drill boots asynchronously; reading computed style before it renders
      // finds no button at all.
      await expect(page.getByRole('group', { name: 'Player actions' })).toBeVisible();
      expect(await transitionSeconds()).toBeGreaterThan(0.05);

      await page.emulateMedia({ reducedMotion: 'reduce' });
      // The global reduce block collapses every transition to ~0. Read it as a
      // number so this does not depend on how the browser formats the unit.
      expect(await transitionSeconds()).toBeLessThan(0.05);
    });
  });
});
