import { expect, test } from '../fixtures/app.fixture';

// Whole-flow routing: the real lazy-route → page bootstrap chain, per-route
// titles, and the redirect table — none of which the jsdom unit layer exercises.
test.describe('navigation & routing', () => {
  test('home is the Open moment with the right title', async ({ page }) => {
    await expect(page).toHaveTitle(/^Blackjack Trainer$/);
    await expect(page.getByRole('button', { name: /Continue/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Card Counting/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Deviations/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Settings/ })).toBeVisible();
  });

  test('the primary action resumes Basic Strategy (the default last trainer)', async ({ page }) => {
    await page.getByRole('button', { name: /Continue/ }).click();
    await expect(page).toHaveURL(/\/drill\/basic-strategy$/);
    await expect(page).toHaveTitle(/Basic Strategy/);
  });

  test('the other-trainer cards route to their drills', async ({ page }) => {
    await page.getByRole('button', { name: /Card Counting/ }).click();
    await expect(page).toHaveURL(/\/drill\/card-counting$/);
    await expect(page).toHaveTitle(/Card Counting/);

    await page.goto('/');
    await page.getByRole('button', { name: /Deviations/ }).click();
    await expect(page).toHaveURL(/\/drill\/deviations$/);
    await expect(page).toHaveTitle(/Deviations/);
  });

  test('Settings opens from the home button', async ({ page }) => {
    await page.getByRole('button', { name: /Settings/ }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page).toHaveTitle(/Settings/);
  });

  test('pre-Flow trainer URLs redirect into the flow', async ({ page }) => {
    await page.goto('/card-counting');
    await expect(page).toHaveURL(/\/drill\/card-counting$/);

    await page.goto('/basic-strategy');
    await expect(page).toHaveURL(/\/drill\/basic-strategy$/);
  });

  test('an unknown route redirects to home', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page).toHaveURL(/\/$/);
    await expect(page).toHaveTitle(/^Blackjack Trainer$/);
  });

  test('keyboard shortcuts navigate from home', async ({ page }) => {
    // The home button being visible means Angular has bootstrapped and its
    // window:keydown listener is attached before we press a key.
    const ready = () => expect(page.getByRole('button', { name: /Continue/ })).toBeVisible();

    await ready();
    // Enter resumes the last trainer (Basic Strategy by default).
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/drill\/basic-strategy$/);

    await page.goto('/');
    await ready();
    // "2" opens the first other-trainer card (Card Counting).
    await page.keyboard.press('2');
    await expect(page).toHaveURL(/\/drill\/card-counting$/);

    await page.goto('/');
    await ready();
    // "," opens Settings.
    await page.keyboard.press(',');
    await expect(page).toHaveURL(/\/settings$/);
  });
});
