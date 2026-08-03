import { expect, test } from '../fixtures/app.fixture';

// Deviations in the Flow loop: the question line carries the true count, and
// the TC source is chosen on the Settings screen. Like the other drill specs,
// these assert the flow (TC display, rep counting), not grading correctness.
test.describe('deviations drill', () => {
  test('the drill presents a hand with a true count and the action grid', async ({ page }) => {
    await page.goto('/drill/deviations');
    await expect(page.getByRole('group', { name: 'Player actions' })).toBeVisible();
    await expect(page.locator('.drill__tc')).toContainText('TC');
  });

  test('a manual true count set in Settings drives every dealt hand', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('radio', { name: 'Manual true count' }).check();
    const manual = page.getByLabel('Practice true count');
    await manual.fill('4');
    // The manual-TC input persists on change, which fires on blur.
    await manual.blur();

    await page.goto('/drill/deviations');
    await expect(page.locator('.drill__tc')).toContainText('+4');
  });

  test('answering a hand advances the session counter', async ({ page }) => {
    await page.goto('/drill/deviations');
    const progress = page.getByRole('progressbar');
    await expect(progress).toHaveAttribute('aria-valuenow', '0');
    // Stand is legal on every initial two-card hand, so "s" always grades one.
    await page.keyboard.press('s');
    await expect(progress).toHaveAttribute('aria-valuenow', '1');
  });

  // The indices are Hi-Lo whatever the counting trainer is set to. This walks
  // the wiring the unit specs stub: a system picked under Card counting has to
  // reach two other screens that never read that setting before.
  test('picking another counting system warns on Settings, the drill, and the chart', async ({
    page,
  }) => {
    await page.goto('/settings');
    await expect(page.locator('.settings__advisory')).toHaveCount(0);

    await page.getByLabel('Counting system').selectOption('omega-ii');
    await expect(page.locator('.settings__advisory')).toContainText('Omega II');

    await page.goto('/drill/deviations');
    await expect(page.locator('.drill__advisory')).toContainText('Omega II');

    await page.goto('/chart');
    await page.getByRole('button', { name: 'Deviations', exact: true }).click();
    await expect(page.locator('.chart__note--warn')).toContainText('Omega II');

    // And it goes away again when the trainee counts what the charts are for.
    await page.goto('/settings');
    await page.getByLabel('Counting system').selectOption('hi-lo');
    await expect(page.locator('.settings__advisory')).toHaveCount(0);
    await page.goto('/drill/deviations');
    await expect(page.locator('.drill__advisory')).toHaveCount(0);
  });
});
