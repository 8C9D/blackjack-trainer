import { test as base, expect } from '@playwright/test';

// Playwright gives each test an isolated browser context with empty
// localStorage — and localStorage is the app's only persistence — so every
// spec already begins from a clean slate. This base test just lands each spec
// on the home route so specs don't repeat the initial navigation.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.goto('/');
    await use(page);
  },
});

export { expect };
