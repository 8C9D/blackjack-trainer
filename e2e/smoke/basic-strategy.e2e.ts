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

  // A hit is followed by the card it draws, so the decision that lands next is
  // one the drill could not ask before: three cards deep, where only hit and
  // stand are still on the table.
  test('a correct hit plays the hand out', async ({ page }) => {
    // Seeded so the opening hand is a hard 7 vs 10 — a hit, and the card it
    // draws leaves a hard 12 that still owes a decision rather than busting.
    await page.goto('/drill/basic-strategy?seed=9');
    const hand = page.locator('.stage__hand img');
    await expect(hand).toHaveCount(2);
    await expect(page.locator('.drill__question')).toContainText('7');

    await page.keyboard.press('h');
    await expect(hand).toHaveCount(3);
    await expect(page.locator('.drill__question')).toContainText('12');
    await expect(
      page.getByRole('group', { name: 'Player actions' }).getByRole('button', { name: /Double/ }),
    ).toBeDisabled();
  });

  // A split is the other correct answer that leaves decisions behind it, and
  // the two hands it makes are ones the drill has no other way to ask about.
  test('a correct split plays both hands out', async ({ page }) => {
    // Seeded so the opening hand is 8,8 vs 10 — a split at every count — and
    // the card the first half draws is a king, leaving a hard 18 that still
    // owes a decision.
    await page.goto('/drill/basic-strategy?seed=212');
    const hand = page.locator('.stage__hand img');
    await expect(hand).toHaveCount(2);
    await expect(page.locator('.drill__question')).toContainText('8,8');
    await expect(page.locator('.stage__hand-label')).toHaveCount(0);

    await page.keyboard.press('p');
    await expect(page.locator('.stage__hand-label')).toHaveText('Hand 1 of 2');
    await expect(page.locator('.drill__question')).toContainText('18');
    // Surrender and insurance are gone for good; doubling needs DAS, which is
    // off by default.
    const actions = page.getByRole('group', { name: 'Player actions' });
    await expect(actions.getByRole('button', { name: /Double/ })).toBeDisabled();
    await expect(actions.getByRole('button', { name: /Surrender/ })).toBeDisabled();

    await page.keyboard.press('s');
    await expect(page.locator('.stage__hand-label')).toHaveText('Hand 2 of 2');
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
