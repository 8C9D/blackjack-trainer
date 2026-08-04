import { expect, test } from '../fixtures/app.fixture';

// The chart is the page a trainee reads to look a hand up, and it could name the
// play and do nothing else. Picking a cell now deals that hand. The unit layer
// covers the key's parsing and the pinning; only a browser covers the chain from
// a cell in the grid to the hand on the felt.
test.describe('drilling a hand from the chart', () => {
  test('a grid cell starts a round pinned to its hand', async ({ page }) => {
    await page.goto('/chart');

    const cell = page.getByRole('button', { name: 'Stand' }).first();
    await expect(cell).toBeVisible();
    await cell.click();

    await expect(page).toHaveURL(
      /\/drill\/basic-strategy\?hand=(hard|soft|pair)-[0-9A]+-v-[0-9A]+$/,
    );
    await expect(page.locator('.drill__advisory')).toContainText('every hand this round');

    // The round is the hand, not one deal of it: answering leaves the question
    // line where it was.
    const question = await page.locator('.drill__question').innerText();
    await page.keyboard.press('s');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('group', { name: 'Player actions' })).toBeVisible();
    await expect(page.locator('.drill__question')).toHaveText(question);
  });

  test('a deviation row starts the Deviations trainer on that hand', async ({ page }) => {
    await page.goto('/chart');
    await page.getByRole('button', { name: 'Deviations' }).click();

    await page.getByRole('button', { name: 'Drill Hard 16 vs 10' }).click();

    await expect(page).toHaveURL('/drill/deviations?hand=hard-16-v-10');
    await expect(page.locator('.drill__advisory')).toContainText('16 vs 10');
    await expect(page.locator('.drill__question')).toContainText('Hard 16 vs 10');
  });

  // 340 cells: a button apiece would put every one of them between "Back" and
  // the legend for anyone reading this page with a keyboard.
  test('the grid is one tab stop, with the arrows moving inside it', async ({ page }) => {
    await page.goto('/chart');

    const stops = page.locator('.chart__cell--button[tabindex="0"]');
    await expect(stops).toHaveCount(3);

    await page.locator('#chart-hard-0-0').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#chart-hard-1-0')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#chart-hard-1-1')).toBeFocused();
    // The edges hold rather than wrapping into the row above.
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#chart-hard-0-1')).toBeFocused();
  });
});
