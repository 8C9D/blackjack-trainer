import { expect, test } from '../fixtures/app.fixture';

// One representative happy-path per trainer: input → the session responds. We
// assert the *flow* (the session counter advances on an answer), not which
// action is correct — the hand is a random draw and correctness is the engine's
// job, already covered exhaustively by the unit specs.
test.describe('basic strategy drill', () => {
  test('the drill presents a hand and the action grid', async ({ page }) => {
    await page.goto('/drill/basic-strategy');
    await expect(page.getByRole('group', { name: 'Player actions' })).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  test('answering a hand advances the session counter', async ({ page }) => {
    await page.goto('/drill/basic-strategy');
    const progress = page.getByRole('progressbar');
    await expect(progress).toHaveAttribute('aria-valuenow', '0');
    // Stand is legal on every initial two-card hand, so "s" always grades one.
    await page.keyboard.press('s');
    await expect(progress).toHaveAttribute('aria-valuenow', '1');
  });

  test('Escape ends the session back to home', async ({ page }) => {
    await page.goto('/drill/basic-strategy');
    // Wait for the drill to be interactive so its window:keydown listener is
    // attached before the key is pressed (Angular bootstraps after load).
    await expect(page.getByRole('group', { name: 'Player actions' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/$/);
  });
});
