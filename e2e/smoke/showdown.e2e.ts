import { expect, test } from '../fixtures/app.fixture';
import { configureCounting, runCountingRound, standEveryBox } from '../fixtures/flows';

// The post-count showdown hangs off the end of a live-shoe true-count round, so
// every spec walks the real path: configure in Settings, run a counting round,
// then take the offered showdown. Cards come from the live shoe, so these specs
// assert structure and flow — never which hand wins, which the unit specs own.
test.describe('post-count showdown', () => {
  const configure = configureCounting;

  test('a single-box showdown deals one hand against the dealer', async ({ page }) => {
    await configure(page, '1');
    await runCountingRound(page);

    await page.getByRole('button', { name: 'Play a hand vs the dealer' }).click();

    const showdown = page.getByRole('region', { name: 'Showdown vs dealer' });
    await expect(showdown).toBeVisible();
    await expect(
      showdown.getByRole('heading', { name: 'Play a hand vs the dealer' }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Your hand' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Dealer hand' })).toBeVisible();
  });

  test('three boxes each get their own hand against one dealer', async ({ page }) => {
    await configure(page, '3');
    await runCountingRound(page);

    await page.getByRole('button', { name: 'Play 3 hands vs the dealer' }).click();

    const showdown = page.getByRole('region', { name: 'Showdown vs dealer' });
    await expect(
      showdown.getByRole('heading', { name: 'Play 3 hands vs the dealer' }),
    ).toBeVisible();

    // One labelled region per box, plus exactly one dealer.
    for (const n of [1, 2, 3]) {
      await expect(page.getByRole('region', { name: `Your hand ${n}` })).toBeVisible();
    }
    await expect(page.getByRole('region', { name: 'Dealer hand' })).toHaveCount(1);
  });

  test('boxes are played in order and the round ends with a tally', async ({ page }) => {
    await configure(page, '2');
    await runCountingRound(page);
    await page.getByRole('button', { name: 'Play 2 hands vs the dealer' }).click();

    await expect(page.getByRole('group', { name: 'Player actions' })).toBeVisible();
    await standEveryBox(page);

    // Every box carries its own verdict, and the round summarises them.
    const verdicts = page.locator('.showdown__verdict');
    await expect(verdicts.first()).toBeAttached();
    await expect(verdicts).toHaveCount(2);
    await expect(page.locator('.showdown__summary')).toHaveText(
      /\d+ (won|lost|pushed)(, \d+ (won|lost|pushed))*/,
    );
    await expect(page.getByRole('button', { name: /Deal another round/ })).toBeVisible();
  });

  test('returning to counting keeps the drill going', async ({ page }) => {
    await configure(page, '2');
    await runCountingRound(page);
    await page.getByRole('button', { name: 'Play 2 hands vs the dealer' }).click();

    await expect(page.getByRole('region', { name: 'Showdown vs dealer' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to counting' }).click();

    // Back on the count feedback, with the graded rep still counted.
    await expect(page.getByRole('region', { name: 'Showdown vs dealer' })).toBeHidden();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  // Bet sizing: the round opens on a bet and settles against a persisted
  // bankroll. Which hands win is the shoe's business, so these assert the flow
  // and that the chip figure moves — never a particular result.
  test('a bet is placed before the deal and settled against the bankroll', async ({ page }) => {
    await configureCounting(page, '1', true);
    await runCountingRound(page);
    await page.getByRole('button', { name: 'Play a hand vs the dealer' }).click();

    // Nothing is dealt until a bet is placed.
    const bets = page.getByRole('group', { name: 'Bet size' });
    await expect(bets).toBeVisible();
    await expect(page.getByRole('group', { name: 'Player actions' })).toBeHidden();
    await expect(page.locator('.showdown__bankroll')).toContainText('500');

    await bets.getByRole('button', { name: '25', exact: true }).click();
    await page.getByRole('button', { name: /^Deal/ }).click();

    // The hand is on the felt with its stake shown.
    await expect(page.getByRole('region', { name: 'Your hand' })).toBeVisible();
    await expect(page.locator('.showdown__stake').first()).toHaveText('25');

    await standEveryBox(page);
    await expect(page.getByRole('button', { name: /Deal another hand/ })).toBeVisible();
    // 25 at risk: the bankroll settled to a win, a loss, or a push.
    await expect(page.locator('.showdown__bankroll')).toContainText(/500|525|475|537.5/);

    // The next round returns to the bet rather than dealing straight on.
    await page.getByRole('button', { name: /Deal another hand/ }).click();
    await expect(page.getByRole('group', { name: 'Bet size' })).toBeVisible();
  });

  test('betting stays off unless Settings asks for it', async ({ page }) => {
    await configureCounting(page, '1');
    await runCountingRound(page);
    await page.getByRole('button', { name: 'Play a hand vs the dealer' }).click();
    // Straight to the turn, with no chip figure anywhere.
    await expect(page.getByRole('group', { name: 'Player actions' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Bet size' })).toBeHidden();
    await expect(page.locator('.showdown__bankroll')).toHaveCount(0);
  });
});
