import { expect, test } from '../fixtures/app.fixture';

// Persistence is an integration property no single unit owns: services write
// localStorage, and on a full page reload the app must rehydrate from it. jsdom
// approximates localStorage but never exercises the real bootstrap → store →
// reload chain.
test.describe('persistence across reloads', () => {
  test('a graded hand survives a full page reload', async ({ page }) => {
    await page.goto('/drill/basic-strategy');
    const progress = page.getByRole('progressbar');
    await expect(progress).toHaveAttribute('aria-valuenow', '0');

    await page.keyboard.press('s'); // Stand grades one hand → handsToday = 1
    await expect(progress).toHaveAttribute('aria-valuenow', '1');

    // A fresh full load must read handsToday back out of localStorage.
    await page.goto('/drill/basic-strategy');
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  test('the last-used trainer persists as the home primary', async ({ page }) => {
    await page.getByRole('button', { name: /Card Counting/ }).click();
    await expect(page).toHaveURL(/\/drill\/card-counting$/);

    // Reload home from scratch: the primary Continue action reflects the
    // persisted last trainer.
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Continue.*Card Counting/ })).toBeVisible();
  });
});
